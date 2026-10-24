import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';
const DATA_DIR = path.join(__dirname, 'data');
const SERVERS_DIR = path.join(DATA_DIR, 'servers');
const DB_JSON_PATH = path.join(DATA_DIR, 'nodepanel.json');

// Ensure base storage directories exist
fs.mkdirSync(SERVERS_DIR, { recursive: true });

// --- Type Definitions ---
export type ServerStatus =
  | 'created'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'crashed'
  | 'failed';

export type AutoRestartPolicy = 'never' | 'always' | 'on-failure';

export interface ServerModel {
  id: string;
  name: string;
  description: string;
  port: number;
  entry_file: string;
  start_script: string;
  status: ServerStatus;
  auto_restart: AutoRestartPolicy;
  env_vars: Record<string, string>;
  created_at: string;
  updated_at: string;
  repo_url?: string;
  last_exit_code: number;
  metrics?: ServerMetrics;
}

export interface ServerMetrics {
  pid: number;
  status: ServerStatus;
  uptime_sec: number;
  memory_mb: number;
  cpu_percent: number;
}

export interface LogLine {
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system' | 'file';
  text: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mod_time: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  action: string;
  server_id: string;
  details: string;
  status: 'success' | 'failed' | 'warning';
}

export interface PackageSpec {
  id: string;
  name: string;
  description: string;
  executable: string;
  category: string;
  pkg_map: Record<string, string>;
  installed: boolean;
  version?: string;
  path?: string;
}

// --- Persistence Store ---
interface DatabaseSchema {
  servers: ServerModel[];
  activities: ActivityLog[];
}

class JsonStore {
  private data: DatabaseSchema = { servers: [], activities: [] };

  constructor() {
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_JSON_PATH)) {
        const raw = fs.readFileSync(DB_JSON_PATH, 'utf-8');
        this.data = JSON.parse(raw);
        if (!Array.isArray(this.data.servers)) this.data.servers = [];
        if (!Array.isArray(this.data.activities)) this.data.activities = [];
      } else {
        this.save();
      }
    } catch (err) {
      console.error('[Store] Failed to parse nodepanel.json:', err);
      this.data = { servers: [], activities: [] };
    }
  }

  save() {
    try {
      const tempPath = `${DB_JSON_PATH}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_JSON_PATH);
    } catch (err) {
      console.error('[Store] Failed to save nodepanel.json:', err);
    }
  }

  listServers(): ServerModel[] {
    return [...this.data.servers];
  }

  getServer(id: string): ServerModel | undefined {
    return this.data.servers.find((s) => s.id === id);
  }

  saveServer(server: ServerModel) {
    server.updated_at = new Date().toISOString();
    const idx = this.data.servers.findIndex((s) => s.id === server.id);
    if (idx >= 0) {
      this.data.servers[idx] = server;
    } else {
      if (!server.created_at) server.created_at = server.updated_at;
      this.data.servers.push(server);
    }
    this.save();
  }

  deleteServer(id: string) {
    this.data.servers = this.data.servers.filter((s) => s.id !== id);
    this.save();
  }

  recordActivity(action: string, serverId: string, details: string, status: 'success' | 'failed' | 'warning') {
    const entry: ActivityLog = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      action,
      server_id: serverId,
      details,
      status,
    };
    this.data.activities.unshift(entry);
    if (this.data.activities.length > 200) {
      this.data.activities = this.data.activities.slice(0, 200);
    }
    this.save();
  }

  listActivities(): ActivityLog[] {
    return [...this.data.activities];
  }
}

const store = new JsonStore();

// --- Package Registry ---
const PACKAGE_REGISTRY: Record<string, PackageSpec> = {
  git: {
    id: 'git',
    name: 'Git Version Control',
    description: 'Fast, distributed version control system required for cloning repositories.',
    executable: 'git',
    category: 'Version Control',
    pkg_map: { pkg: 'git', 'apt-get': 'git', pacman: 'git', apk: 'git' },
    installed: false,
  },
  ffmpeg: {
    id: 'ffmpeg',
    name: 'FFmpeg Multimedia Framework',
    description: 'Complete, cross-platform solution to record, convert and stream audio and video.',
    executable: 'ffmpeg',
    category: 'Media Processing',
    pkg_map: { pkg: 'ffmpeg', 'apt-get': 'ffmpeg', pacman: 'ffmpeg', apk: 'ffmpeg' },
    installed: false,
  },
  python3: {
    id: 'python3',
    name: 'Python 3',
    description: 'Interpreted programming language often required for native Node.js addons (node-gyp).',
    executable: 'python3',
    category: 'Runtime & Build',
    pkg_map: { pkg: 'python', 'apt-get': 'python3', pacman: 'python', apk: 'python3' },
    installed: false,
  },
  imagemagick: {
    id: 'imagemagick',
    name: 'ImageMagick',
    description: 'Robust suite and libraries to create, edit, compose, or convert bitmap images.',
    executable: 'convert',
    category: 'Image Processing',
    pkg_map: { pkg: 'imagemagick', 'apt-get': 'imagemagick', pacman: 'imagemagick', apk: 'imagemagick' },
    installed: false,
  },
  curl: {
    id: 'curl',
    name: 'cURL',
    description: 'Command line tool and library for transferring data with URLs.',
    executable: 'curl',
    category: 'Networking',
    pkg_map: { pkg: 'curl', 'apt-get': 'curl', pacman: 'curl', apk: 'curl' },
    installed: false,
  },
  jq: {
    id: 'jq',
    name: 'jq JSON Processor',
    description: 'Lightweight and flexible command-line JSON processor.',
    executable: 'jq',
    category: 'Utilities',
    pkg_map: { pkg: 'jq', 'apt-get': 'jq', pacman: 'jq', apk: 'jq' },
    installed: false,
  },
  tmux: {
    id: 'tmux',
    name: 'tmux Terminal Multiplexer',
    description: 'Terminal multiplexer enabling background session management.',
    executable: 'tmux',
    category: 'Terminal',
    pkg_map: { pkg: 'tmux', 'apt-get': 'tmux', pacman: 'tmux', apk: 'tmux' },
    installed: false,
  },
  'build-essential': {
    id: 'build-essential',
    name: 'C/C++ Build Essentials',
    description: 'GCC/Clang compilers and make tools for building native Node.js modules.',
    executable: 'make',
    category: 'Compilers',
    pkg_map: { pkg: 'build-essential', 'apt-get': 'build-essential', pacman: 'base-devel', apk: 'build-base' },
    installed: false,
  },
};

function lookPath(tool: string): string | null {
  try {
    const res = execSync(`which ${tool} 2>/dev/null`, { encoding: 'utf-8' }).trim();
    return res || null;
  } catch {
    return null;
  }
}

function getToolVersion(tool: string): string {
  try {
    const out = execSync(`${tool} --version 2>/dev/null`, { encoding: 'utf-8' }).trim();
    return out.split('\n')[0] || 'Installed';
  } catch {
    return 'Installed';
  }
}

function detectEnvironment() {
  const prefix = process.env.PREFIX || '';
  const termuxVersion = process.env.TERMUX_VERSION || '';
  const isTermux =
    prefix.includes('com.termux') ||
    Boolean(termuxVersion) ||
    fs.existsSync('/data/data/com.termux/files/usr/bin');

  let isProot =
    Boolean(process.env.PROOT_TMP_DIR) ||
    Boolean(process.env.PROOT_FORCE_KILL_SIGNALS) ||
    fs.existsSync('/proot');

  try {
    if (fs.existsSync('/etc/issue')) {
      const issue = fs.readFileSync('/etc/issue', 'utf-8').toLowerCase();
      if (issue.includes('proot')) isProot = true;
    }
  } catch {}

  let distro = 'Linux';
  let distroVersion = '';
  try {
    if (fs.existsSync('/etc/os-release')) {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
      for (const line of osRelease.split('\n')) {
        if (line.startsWith('PRETTY_NAME=')) {
          distro = line.replace('PRETTY_NAME=', '').replace(/"/g, '').trim();
        } else if (line.startsWith('VERSION_ID=')) {
          distroVersion = line.replace('VERSION_ID=', '').replace(/"/g, '').trim();
        }
      }
    }
  } catch {}

  let envType: 'termux_native' | 'ubuntu_proot' | 'linux_generic' | 'unknown' = 'linux_generic';
  let typeName = `Linux (${distro})`;

  if (isTermux && !isProot) {
    envType = 'termux_native';
    typeName = 'Termux (Native Android)';
  } else if (isProot) {
    envType = 'ubuntu_proot';
    typeName = 'Ubuntu (proot-distro)';
  }

  const executables: Record<string, string> = {};
  const tools = ['node', 'npm', 'git', 'pkg', 'apt-get', 'apt', 'python3', 'python', 'ffmpeg', 'curl', 'tar'];
  for (const t of tools) {
    const p = lookPath(t);
    if (p) executables[t] = p;
  }

  let packageManager = 'none';
  if (envType === 'termux_native') {
    if (executables['pkg']) packageManager = 'pkg';
    else if (executables['apt']) packageManager = 'apt';
  } else {
    if (executables['apt-get']) packageManager = 'apt-get';
    else if (executables['apt']) packageManager = 'apt';
    else if (lookPath('pacman')) packageManager = 'pacman';
    else if (lookPath('apk')) packageManager = 'apk';
  }

  const capabilities = [
    'Node.js Process Lifecycle Management',
    'Interactive Real-time Terminal via WebSocket',
    'Git Repository Clone & Fetch',
    'Per-server Isolated Data Directories',
    'Automated .env.example Sync Engine',
  ];
  const limitations: string[] = [];

  if (envType === 'termux_native') {
    capabilities.push('Termux Package Management (pkg)');
    limitations.push('Android battery optimization may kill background processes unless Wake Lock is acquired');
    limitations.push('Runs with non-root Android application sandbox permissions');
  } else if (envType === 'ubuntu_proot') {
    capabilities.push('Debian/Ubuntu APT Package Management', 'Full glibc compatibility');
    limitations.push('No systemd daemon support inside proot');
  } else {
    capabilities.push('Full Linux Kernel & Standard Syscall Execution');
  }

  if (executables['node']) {
    capabilities.push('Node.js Runtime Available');
  } else {
    limitations.push('Node.js is not found in PATH');
  }

  if (executables['git']) {
    capabilities.push('Git Version Control Available');
  } else {
    limitations.push('Git is not installed; Git clone will be disabled until installed');
  }

  return {
    type: envType,
    type_name: typeName,
    os: os.platform(),
    arch: os.arch(),
    kernel: os.release(),
    hostname: os.hostname(),
    distro,
    distro_version: distroVersion,
    prefix,
    termux_version: termuxVersion,
    is_proot: isProot,
    package_manager: packageManager,
    executables,
    capabilities,
    limitations,
    disk_free_mb: 25000,
    memory_total_mb: Math.round(os.totalmem() / (1024 * 1024)),
  };
}

// --- Active Process Management ---
interface ActiveServerProcess {
  process: ChildProcess;
  pid: number;
  startTime: number;
  logs: LogLine[];
  logStream?: fs.WriteStream;
  intentionalStop: boolean;
  restartCount: number;
}

const activeProcesses = new Map<string, ActiveServerProcess>();
let isPackageOpBusy = false;
let activePackageOp = '';

// --- Active Interactive Terminal Engine ---
interface ActiveTerminalProcess {
  process: ChildProcess;
  serverId: string;
  command: string;
  startTime: number;
  cwd: string;
}

const activeTerminals = new Map<string, ActiveTerminalProcess>();
const serverWorkingDirs = new Map<string, string>(); // serverId -> current working directory path

// WebSocket subscribers: client -> Set of subscribed server IDs
const wsSubscribers = new Map<WebSocket, Set<string>>();

function broadcastWSEvent(event: string, data: any, filterServerId?: string) {
  const msg = JSON.stringify({ event, data });
  for (const [client, serverSubs] of wsSubscribers.entries()) {
    if (client.readyState === WebSocket.OPEN) {
      if (filterServerId) {
        if (serverSubs.has(filterServerId)) {
          client.send(msg);
        }
      } else {
        client.send(msg);
      }
    }
  }
}

function appendLog(serverId: string, stream: 'stdout' | 'stderr' | 'system', text: string) {
  const logLine: LogLine = {
    timestamp: new Date().toISOString(),
    stream,
    text,
  };

  const ap = activeProcesses.get(serverId);
  if (ap) {
    ap.logs.push(logLine);
    if (ap.logs.length > 1000) ap.logs.shift();
    if (ap.logStream) {
      ap.logStream.write(`[${logLine.timestamp}][${stream}] ${text}\n`);
    }
  }

  broadcastWSEvent('log', {
    server_id: serverId,
    timestamp: logLine.timestamp,
    stream: logLine.stream,
    text: logLine.text,
  }, serverId);
}

function updateServerStatus(serverId: string, newStatus: ServerStatus, exitCode: number) {
  const server = store.getServer(serverId);
  if (server) {
    const oldStatus = server.status;
    server.status = newStatus;
    server.last_exit_code = exitCode;
    store.saveServer(server);

    broadcastWSEvent('status', {
      server_id: serverId,
      old_status: oldStatus,
      new_status: newStatus,
      exit_code: exitCode,
    });
  }
}

function getProcessMetrics(serverId: string): ServerMetrics | undefined {
  const ap = activeProcesses.get(serverId);
  const server = store.getServer(serverId);
  if (!server) return undefined;

  if (!ap || server.status !== 'running') {
    return {
      pid: 0,
      status: server.status,
      uptime_sec: 0,
      memory_mb: 0,
      cpu_percent: 0,
    };
  }

  let memoryMb = 18.5;
  try {
    const statusFile = `/proc/${ap.pid}/status`;
    if (fs.existsSync(statusFile)) {
      const content = fs.readFileSync(statusFile, 'utf-8');
      const match = content.match(/VmRSS:\s+(\d+)\s+kB/);
      if (match) {
        memoryMb = Math.round((parseInt(match[1], 10) / 1024) * 10) / 10;
      }
    }
  } catch {}

  return {
    pid: ap.pid,
    status: 'running',
    uptime_sec: Math.floor((Date.now() - ap.startTime) / 1000),
    memory_mb: memoryMb,
    cpu_percent: 0.1,
  };
}

function safeResolveServerPath(serverId: string, subPath: string = ''): string {
  const root = path.resolve(SERVERS_DIR, serverId);
  const target = path.resolve(root, subPath.replace(/^\/+/, ''));
  if (!target.startsWith(root)) {
    throw new Error('Access denied: directory traversal outside server root detected');
  }
  return target;
}

function getServerWorkingDir(serverId: string): string {
  const root = path.resolve(SERVERS_DIR, serverId);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  const current = serverWorkingDirs.get(serverId);
  if (current && current.startsWith(root) && fs.existsSync(current)) {
    return current;
  }
  serverWorkingDirs.set(serverId, root);
  return root;
}

function startServerProcess(serverId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = store.getServer(serverId);
    if (!server) return reject(new Error('Server not found'));

    if (activeProcesses.has(serverId)) {
      const existing = activeProcesses.get(serverId);
      if (existing && !existing.process.killed) {
        return reject(new Error('Process is already running'));
      }
    }

    const srvDir = path.join(SERVERS_DIR, serverId);
    if (!fs.existsSync(srvDir)) {
      fs.mkdirSync(srvDir, { recursive: true });
    }

    const logDir = path.join(srvDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFilePath = path.join(logDir, 'server.log');
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    updateServerStatus(serverId, 'starting', 0);

    const entry = (server.entry_file || 'index.js').trim();
    let cmd = 'node';
    let args: string[] = [entry];

    if (entry.startsWith('npm run ')) {
      cmd = 'npm';
      args = ['run', entry.replace('npm run ', '').trim()];
    } else if (entry === 'npm start') {
      cmd = 'npm';
      args = ['start'];
    } else {
      const entryPath = path.join(srvDir, entry);
      if (!fs.existsSync(entryPath)) {
        seedServerTemplate(srvDir, 'express_api', server.name, server.port || 3400);
        appendLog(serverId, 'system', `[nodepanel] Notice: Entry file '${entry}' was missing. Re-created default server template.`);
      }
    }

    // Read variables from server.env_vars and from .env file
    const envVarsFromFile: Record<string, string> = {};
    const envPath = path.join(srvDir, '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.substring(0, eqIdx).trim();
            let v = trimmed.substring(eqIdx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.substring(1, v.length - 1);
            }
            envVarsFromFile[k] = v;
          }
        }
      } catch {}
    }

    const customEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...server.env_vars,
      ...envVarsFromFile,
      PORT: String(server.port || 3400),
      NODE_ENV: envVarsFromFile.NODE_ENV || server.env_vars?.NODE_ENV || 'production',
    };

    let child: ChildProcess;
    try {
      child = spawn(cmd, args, {
        cwd: srvDir,
        env: customEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      updateServerStatus(serverId, 'failed', -1);
      return reject(err);
    }

    const ap: ActiveServerProcess = {
      process: child,
      pid: child.pid || 0,
      startTime: Date.now(),
      logs: [],
      logStream,
      intentionalStop: false,
      restartCount: 0,
    };
    activeProcesses.set(serverId, ap);

    updateServerStatus(serverId, 'running', 0);
    appendLog(serverId, 'system', `[nodepanel] Process started (PID: ${ap.pid}) using "${cmd} ${args.join(' ')}"`);
    store.recordActivity('start_server', serverId, `Server '${server.name}' started (PID: ${ap.pid})`, 'success');

    child.stdout?.on('data', (data) => {
      const lines = data.toString('utf-8').split('\n');
      for (const line of lines) {
        if (line.trim().length > 0) appendLog(serverId, 'stdout', line);
      }
    });

    child.stderr?.on('data', (data) => {
      const lines = data.toString('utf-8').split('\n');
      for (const line of lines) {
        if (line.trim().length > 0) appendLog(serverId, 'stderr', line);
      }
    });

    child.on('exit', (code, signal) => {
      const exitCode = code !== null ? code : 1;
      const wasIntentional = ap.intentionalStop;
      logStream.end();
      activeProcesses.delete(serverId);

      let finalStatus: ServerStatus = 'stopped';
      if (wasIntentional) {
        finalStatus = 'stopped';
        appendLog(serverId, 'system', `[nodepanel] Process stopped gracefully with code ${exitCode}`);
      } else if (exitCode === 0) {
        finalStatus = 'stopped';
        appendLog(serverId, 'system', `[nodepanel] Process completed cleanly with code 0`);
      } else {
        finalStatus = 'crashed';
        appendLog(serverId, 'system', `[nodepanel] Process crashed with exit code ${exitCode} (${signal || ''})`);
      }

      updateServerStatus(serverId, finalStatus, exitCode);

      // Auto-restart handling
      if (!wasIntentional) {
        const s = store.getServer(serverId);
        if (s) {
          const shouldRestart =
            s.auto_restart === 'always' || (s.auto_restart === 'on-failure' && exitCode !== 0);
          if (shouldRestart) {
            ap.restartCount++;
            if (ap.restartCount <= 5) {
              const backoffMs = ap.restartCount * 2000;
              appendLog(serverId, 'system', `[nodepanel] Auto-restarting in ${backoffMs / 1000}s (attempt ${ap.restartCount}/5)...`);
              setTimeout(() => {
                startServerProcess(serverId).catch(() => {});
              }, backoffMs);
            } else {
              appendLog(serverId, 'system', `[nodepanel] Maximum auto-restart attempts reached (5). Halting.`);
            }
          }
        }
      }
    });

    resolve();
  });
}

function stopServerProcess(serverId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ap = activeProcesses.get(serverId);
    if (!ap) {
      updateServerStatus(serverId, 'stopped', 0);
      return resolve();
    }

    ap.intentionalStop = true;
    updateServerStatus(serverId, 'stopping', 0);
    appendLog(serverId, 'system', '[nodepanel] Stopping process...');

    let resolved = false;
    const forceKillTimer = setTimeout(() => {
      if (!resolved) {
        try {
          ap.process.kill('SIGKILL');
          appendLog(serverId, 'system', '[nodepanel] Sent SIGKILL after graceful timeout.');
        } catch {}
        resolved = true;
        resolve();
      }
    }, 3000);

    ap.process.once('exit', () => {
      clearTimeout(forceKillTimer);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });

    try {
      ap.process.kill('SIGTERM');
    } catch (err) {
      clearTimeout(forceKillTimer);
      return reject(err);
    }
  });
}

// --- Terminal Command Runner ---
function executeTerminalCommand(serverId: string, commandText: string) {
  const trimmed = commandText.trim();
  if (!trimmed) return;

  const server = store.getServer(serverId);
  if (!server) {
    broadcastWSEvent('terminal_data', {
      serverId,
      stream: 'system',
      text: `[nodepanel-term] Error: Server ${serverId} not found.`,
    }, serverId);
    return;
  }

  const serverRoot = path.resolve(SERVERS_DIR, serverId);
  let currentCwd = getServerWorkingDir(serverId);

  // Broadcast command echo
  const relCwdDisplay = path.relative(serverRoot, currentCwd) || '.';
  broadcastWSEvent('terminal_data', {
    serverId,
    stream: 'command',
    text: `$ ${trimmed}`,
    cwd: relCwdDisplay,
  }, serverId);

  // Handle cd built-in safely
  if (trimmed === 'cd' || trimmed.startsWith('cd ')) {
    const targetArg = trimmed === 'cd' ? '' : trimmed.substring(3).trim();
    let newPath = serverRoot;
    if (targetArg && targetArg !== '~') {
      newPath = path.resolve(currentCwd, targetArg);
    }

    // Security check: cannot navigate outside serverRoot!
    if (!newPath.startsWith(serverRoot)) {
      broadcastWSEvent('terminal_data', {
        serverId,
        stream: 'stderr',
        text: `cd: restricted to server directory (${relCwdDisplay})`,
      }, serverId);
      broadcastWSEvent('terminal_exit', {
        serverId,
        exitCode: 1,
        cwd: relCwdDisplay,
      }, serverId);
      return;
    }

    if (!fs.existsSync(newPath) || !fs.statSync(newPath).isDirectory()) {
      broadcastWSEvent('terminal_data', {
        serverId,
        stream: 'stderr',
        text: `cd: no such file or directory: ${targetArg}`,
      }, serverId);
      broadcastWSEvent('terminal_exit', {
        serverId,
        exitCode: 1,
        cwd: relCwdDisplay,
      }, serverId);
      return;
    }

    serverWorkingDirs.set(serverId, newPath);
    const updatedRel = path.relative(serverRoot, newPath) || '.';
    broadcastWSEvent('terminal_data', {
      serverId,
      stream: 'system',
      text: `Directory changed to: /${updatedRel === '.' ? '' : updatedRel}`,
    }, serverId);
    broadcastWSEvent('terminal_exit', {
      serverId,
      exitCode: 0,
      cwd: updatedRel,
    }, serverId);
    return;
  }

  // Handle clear built-in
  if (trimmed === 'clear') {
    broadcastWSEvent('terminal_clear', { serverId }, serverId);
    broadcastWSEvent('terminal_exit', {
      serverId,
      exitCode: 0,
      cwd: relCwdDisplay,
    }, serverId);
    return;
  }

  // Check if a terminal command is already running for this server
  const existing = activeTerminals.get(serverId);
  if (existing) {
    broadcastWSEvent('terminal_data', {
      serverId,
      stream: 'system',
      text: `[nodepanel-term] Warning: A process is already running (${existing.command}). Terminating previous process...`,
    }, serverId);
    try {
      existing.process.kill('SIGINT');
    } catch {}
  }

  // Spawn shell process
  try {
    const child = spawn(trimmed, {
      shell: true,
      cwd: currentCwd,
      env: {
        ...process.env,
        ...server.env_vars,
        PORT: String(server.port || 3400),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const termSession: ActiveTerminalProcess = {
      process: child,
      serverId,
      command: trimmed,
      startTime: Date.now(),
      cwd: currentCwd,
    };
    activeTerminals.set(serverId, termSession);

    broadcastWSEvent('terminal_start', {
      serverId,
      command: trimmed,
      pid: child.pid,
      cwd: relCwdDisplay,
    }, serverId);

    child.stdout?.on('data', (chunk) => {
      const lines = chunk.toString('utf-8').split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          broadcastWSEvent('terminal_data', {
            serverId,
            stream: 'stdout',
            text: line,
          }, serverId);
        }
      }
    });

    child.stderr?.on('data', (chunk) => {
      const lines = chunk.toString('utf-8').split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          broadcastWSEvent('terminal_data', {
            serverId,
            stream: 'stderr',
            text: line,
          }, serverId);
        }
      }
    });

    child.on('error', (err) => {
      broadcastWSEvent('terminal_data', {
        serverId,
        stream: 'stderr',
        text: `[nodepanel-term] Spawn error: ${err.message}`,
      }, serverId);
    });

    child.on('exit', (code, signal) => {
      activeTerminals.delete(serverId);
      const exitCode = code !== null ? code : (signal ? 130 : 0);
      const durationMs = Date.now() - termSession.startTime;
      broadcastWSEvent('terminal_data', {
        serverId,
        stream: 'system',
        text: `[process exited with code ${exitCode}${signal ? ` (${signal})` : ''} in ${(durationMs / 1000).toFixed(1)}s]`,
      }, serverId);

      broadcastWSEvent('terminal_exit', {
        serverId,
        exitCode,
        signal,
        cwd: relCwdDisplay,
      }, serverId);
    });
  } catch (err: any) {
    broadcastWSEvent('terminal_data', {
      serverId,
      stream: 'stderr',
      text: `[nodepanel-term] Failed to start command: ${err.message}`,
    }, serverId);
    broadcastWSEvent('terminal_exit', {
      serverId,
      exitCode: 1,
      cwd: relCwdDisplay,
    }, serverId);
  }
}

function killTerminalCommand(serverId: string) {
  const session = activeTerminals.get(serverId);
  if (!session) return;

  broadcastWSEvent('terminal_data', {
    serverId,
    stream: 'system',
    text: `^C [nodepanel-term] Sending SIGINT to process...`,
  }, serverId);

  try {
    session.process.kill('SIGINT');
  } catch {}

  setTimeout(() => {
    if (activeTerminals.has(serverId)) {
      try {
        session.process.kill('SIGKILL');
      } catch {}
    }
  }, 1500);
}

function seedServerTemplate(dir: string, template: string = 'blank', name: string, port: number) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  switch (template) {
    case 'express_api': {
      const pkg = {
        name: cleanName,
        version: '1.0.0',
        description: `Express REST API managed by Termux NodePanel`,
        main: 'index.js',
        scripts: { start: 'node index.js' },
        dependencies: { express: '^4.21.2' },
      };
      const code = `const express = require('express');
const app = express();
const PORT = process.env.PORT || ${port};

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: ${JSON.stringify(name)},
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

app.get('/api/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[${name}] Express Server listening on http://localhost:' + PORT);
});
`;
      const envExample = `# Server Configuration
PORT=${port}
NODE_ENV=production
`;
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
      fs.writeFileSync(path.join(dir, 'index.js'), code);
      fs.writeFileSync(path.join(dir, '.env.example'), envExample);
      fs.writeFileSync(path.join(dir, '.env'), envExample);
      break;
    }

    case 'background_worker': {
      const pkg = {
        name: cleanName,
        version: '1.0.0',
        main: 'index.js',
        scripts: { start: 'node index.js' },
      };
      const code = `console.log('[${name}] Worker initialized. Starting periodic processing...');

let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log('[' + new Date().toISOString() + '] Task #' + counter + ' processed successfully.');
}, 3000);

process.on('SIGTERM', () => {
  console.log('[${name}] Received SIGTERM signal. Performing cleanup...');
  clearInterval(interval);
  process.exit(0);
});
`;
      const envExample = `# Worker Configuration
WORKER_INTERVAL_MS=3000
NODE_ENV=production
`;
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
      fs.writeFileSync(path.join(dir, 'index.js'), code);
      fs.writeFileSync(path.join(dir, '.env.example'), envExample);
      fs.writeFileSync(path.join(dir, '.env'), envExample);
      break;
    }

    default: {
      const pkg = {
        name: cleanName,
        version: '1.0.0',
        main: 'index.js',
        scripts: { start: 'node index.js' },
      };
      const code = `const http = require('http');
const PORT = process.env.PORT || ${port};

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from ${name}!', time: new Date() }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[${name}] HTTP server running on port ' + PORT);
});
`;
      const envExample = `# Server Configuration
PORT=${port}
NODE_ENV=development
`;
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
      fs.writeFileSync(path.join(dir, 'index.js'), code);
      fs.writeFileSync(path.join(dir, '.env.example'), envExample);
      fs.writeFileSync(path.join(dir, '.env'), envExample);
      break;
    }
  }
}

function findAvailablePort(startPort: number = 3001): number {
  const used = new Set<number>();
  for (const s of store.listServers()) {
    if (s.port) used.add(s.port);
  }
  let p = startPort;
  while (used.has(p) || p === 3000) {
    p++;
  }
  return p;
}

// --- Main Server Setup ---
async function main() {
  const app = express();
  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  const server = http.createServer(app);

  // --- API Routes ---

  // Health
  app.get('/api/health', (_req: Request, res: Response) => {
    const env = detectEnvironment();
    res.json({
      status: 'healthy',
      version: '1.0.0',
      uptime_seconds: Math.floor(process.uptime()),
      environment: env.type,
      timestamp: new Date().toISOString(),
    });
  });

  // Runtime
  app.get('/api/runtime', (_req: Request, res: Response) => {
    const env = detectEnvironment();
    res.json(env);
  });

  // Activity
  app.get('/api/activity', (_req: Request, res: Response) => {
    res.json(store.listActivities());
  });

  // Packages
  app.get('/api/packages', (_req: Request, res: Response) => {
    const pkgs = Object.values(PACKAGE_REGISTRY).map((spec) => {
      const copy = { ...spec };
      const p = lookPath(spec.executable);
      if (p) {
        copy.installed = true;
        copy.path = p;
        copy.version = getToolVersion(spec.executable);
      } else {
        copy.installed = false;
      }
      return copy;
    });

    res.json({
      packages: pkgs,
      is_busy: isPackageOpBusy,
      active_op: activePackageOp,
    });
  });

  app.post('/api/packages/install', async (req: Request, res: Response) => {
    const { package_id } = req.body;
    if (!package_id || !PACKAGE_REGISTRY[package_id]) {
      return res.status(400).json({ error: true, message: 'Valid package_id required' });
    }
    if (isPackageOpBusy) {
      return res.status(400).json({ error: true, message: 'A package operation is already in progress' });
    }

    const spec = PACKAGE_REGISTRY[package_id];
    const env = detectEnvironment();
    const pkgMgr = env.package_manager;

    if (!pkgMgr || pkgMgr === 'none') {
      return res.status(400).json({
        success: false,
        error: `No package manager (pkg or apt) available in this environment.`,
        output: 'Operation aborted: no supported package manager.',
      });
    }

    const pkgName = spec.pkg_map[pkgMgr] || spec.id;
    isPackageOpBusy = true;
    activePackageOp = `install:${package_id}`;

    let output = `[nodepanel-pkg] Initiating installation of ${spec.name} via ${pkgMgr} install -y ${pkgName}...\n`;

    try {
      let installCmd = `${pkgMgr} install -y ${pkgName}`;
      if (pkgMgr === 'apt-get') installCmd = `apt-get install -y ${pkgName}`;
      const execOut = execSync(installCmd, { encoding: 'utf-8', timeout: 300000 });
      output += execOut;
      output += `\n[nodepanel-pkg] Successfully installed ${spec.name}!`;

      store.recordActivity('install_package', '', `Installed package ${package_id}`, 'success');
      res.json({ success: true, output });
    } catch (err: any) {
      output += `\n[nodepanel-pkg] Error during installation: ${err.message}`;
      store.recordActivity('install_package', '', `Failed installing ${package_id}: ${err.message}`, 'failed');
      res.status(500).json({ success: false, error: err.message, output });
    } finally {
      isPackageOpBusy = false;
      activePackageOp = '';
    }
  });

  app.post('/api/packages/uninstall', async (req: Request, res: Response) => {
    const { package_id } = req.body;
    if (package_id === 'git') {
      return res.status(400).json({ error: true, message: 'Uninstalling git is disabled for system safety.' });
    }
    if (!package_id || !PACKAGE_REGISTRY[package_id]) {
      return res.status(400).json({ error: true, message: 'Valid package_id required' });
    }

    const spec = PACKAGE_REGISTRY[package_id];
    const env = detectEnvironment();
    const pkgMgr = env.package_manager;

    if (!pkgMgr || pkgMgr === 'none') {
      return res.status(400).json({ success: false, error: 'No package manager available' });
    }

    const pkgName = spec.pkg_map[pkgMgr] || spec.id;
    let output = `[nodepanel-pkg] Removing ${spec.name}...\n`;

    try {
      const removeCmd = pkgMgr === 'pkg' ? `pkg uninstall -y ${pkgName}` : `apt-get remove -y ${pkgName}`;
      output += execSync(removeCmd, { encoding: 'utf-8', timeout: 180000 });
      output += `\n[nodepanel-pkg] Removed ${spec.name}.`;
      store.recordActivity('uninstall_package', '', `Uninstalled package ${package_id}`, 'success');
      res.json({ success: true, output });
    } catch (err: any) {
      output += `\n[nodepanel-pkg] Error during uninstall: ${err.message}`;
      res.status(400).json({ success: false, error: err.message, output });
    }
  });

  // Git Clone
  app.post('/api/git/clone', async (req: Request, res: Response) => {
    const { repo_url, branch, name, auto_install } = req.body;
    if (!repo_url) {
      return res.status(400).json({ error: true, message: 'repo_url is required' });
    }

    const serverId = `srv-${Math.floor(Date.now() / 1000) % 100000}-${crypto.randomBytes(4).toString('hex')}`;
    const srvDir = path.join(SERVERS_DIR, serverId);
    fs.mkdirSync(srvDir, { recursive: true });

    let output = `[nodepanel-git] Cloning repository: ${repo_url}...\n`;

    try {
      const branchFlag = branch ? `--branch ${branch}` : '';
      execSync(`git clone --depth 1 ${branchFlag} "${repo_url}" "${srvDir}"`, {
        encoding: 'utf-8',
        timeout: 180000,
      });
      output += `[nodepanel-git] Repository successfully cloned into ${serverId}.\n`;

      let entryFile = 'index.js';
      const candidates = ['index.js', 'app.js', 'server.js', 'main.js', 'src/index.js', 'src/server.js'];
      for (const cand of candidates) {
        if (fs.existsSync(path.join(srvDir, cand))) {
          entryFile = cand;
          break;
        }
      }

      const pkgPath = path.join(srvDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkgJson.main && fs.existsSync(path.join(srvDir, pkgJson.main))) {
            entryFile = pkgJson.main;
          } else if (pkgJson.scripts?.start) {
            entryFile = 'npm start';
          }
        } catch {}
      }

      if (auto_install && fs.existsSync(pkgPath)) {
        output += `[nodepanel-git] Running npm install...\n`;
        try {
          output += execSync('npm install --no-audit --no-fund', {
            cwd: srvDir,
            encoding: 'utf-8',
            timeout: 300000,
          });
        } catch (npme: any) {
          output += `[nodepanel-git] Warning: npm install had issues: ${npme.message}\n`;
        }
      }

      const assignedPort = findAvailablePort(3001);
      const serverName = name || repo_url.split('/').pop()?.replace('.git', '') || 'Git Server';

      const srv: ServerModel = {
        id: serverId,
        name: serverName,
        description: `Cloned from ${repo_url} (${branch || 'default'})`,
        port: assignedPort,
        entry_file: entryFile,
        start_script: 'start',
        status: 'created',
        auto_restart: 'never',
        env_vars: {
          PORT: String(assignedPort),
          NODE_ENV: 'production',
        },
        repo_url,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_exit_code: 0,
      };

      store.saveServer(srv);
      store.recordActivity('git_clone', serverId, `Cloned repository ${repo_url}`, 'success');

      res.status(201).json({
        success: true,
        server: srv,
        output,
      });
    } catch (err: any) {
      fs.rmSync(srvDir, { recursive: true, force: true });
      output += `\n[nodepanel-git] Clone failed: ${err.message}`;
      store.recordActivity('git_clone', serverId, `Clone failed: ${err.message}`, 'failed');
      res.status(400).json({ success: false, error: err.message, output });
    }
  });

  // Servers List & Create
  app.get('/api/servers', (_req: Request, res: Response) => {
    const list = store.listServers().map((srv) => ({
      ...srv,
      metrics: getProcessMetrics(srv.id),
    }));
    res.json(list);
  });

  app.post('/api/servers', (req: Request, res: Response) => {
    const { name, description, port, entry_file, auto_restart, env_vars, template } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: true, message: 'Server name is required' });
    }

    const serverId = `srv-${Math.floor(Date.now() / 1000) % 100000}-${crypto.randomBytes(4).toString('hex')}`;
    const srvDir = path.join(SERVERS_DIR, serverId);
    fs.mkdirSync(srvDir, { recursive: true });

    const assignedPort = port && port > 0 ? port : findAvailablePort(3001);
    const entry = (entry_file || 'index.js').trim();

    seedServerTemplate(srvDir, template, name.trim(), assignedPort);

    const mergedEnv = {
      ...(env_vars || {}),
      PORT: String(assignedPort),
      NODE_ENV: env_vars?.NODE_ENV || 'production',
    };

    const srv: ServerModel = {
      id: serverId,
      name: name.trim(),
      description: description || '',
      port: assignedPort,
      entry_file: entry,
      start_script: 'start',
      status: 'created',
      auto_restart: autoRestartPolicyValid(auto_restart) ? auto_restart : 'never',
      env_vars: mergedEnv,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_exit_code: 0,
    };

    store.saveServer(srv);
    store.recordActivity('create_server', serverId, `Created server '${name.trim()}' on port ${assignedPort}`, 'success');

    res.status(201).json(srv);
  });

  function autoRestartPolicyValid(val: any): val is AutoRestartPolicy {
    return ['never', 'always', 'on-failure'].includes(val);
  }

  // Server Details & Update & Delete
  app.get('/api/servers/:id', (req: Request, res: Response) => {
    const srv = store.getServer(req.params.id);
    if (!srv) return res.status(404).json({ error: true, message: 'Server not found' });

    const ap = activeProcesses.get(srv.id);
    const recentLogs = ap ? [...ap.logs] : readServerLogsFromFile(srv.id);

    res.json({
      ...srv,
      metrics: getProcessMetrics(srv.id),
      recent_logs: recentLogs,
    });
  });

  app.put('/api/servers/:id', (req: Request, res: Response) => {
    const srv = store.getServer(req.params.id);
    if (!srv) return res.status(404).json({ error: true, message: 'Server not found' });

    const { name, description, port, entry_file, auto_restart, env_vars } = req.body;
    if (name) srv.name = name;
    if (description !== undefined) srv.description = description;
    if (port && port > 0) srv.port = port;
    if (entry_file) srv.entry_file = entry_file;
    if (autoRestartPolicyValid(auto_restart)) srv.auto_restart = auto_restart;
    if (env_vars) srv.env_vars = env_vars;

    store.saveServer(srv);
    res.json(srv);
  });

  app.delete('/api/servers/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    const srv = store.getServer(id);
    if (!srv) return res.status(404).json({ error: true, message: 'Server not found' });

    try {
      await stopServerProcess(id);
    } catch {}
    try {
      killTerminalCommand(id);
    } catch {}

    store.deleteServer(id);
    serverWorkingDirs.delete(id);
    const srvDir = path.join(SERVERS_DIR, id);
    try {
      fs.rmSync(srvDir, { recursive: true, force: true });
    } catch {}

    store.recordActivity('delete_server', id, `Deleted server '${srv.name}'`, 'success');
    res.json({ success: true });
  });

  // Server Process Controls
  app.post('/api/servers/:id/start', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      await startServerProcess(id);
      res.json({ success: true, status: 'starting' });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message || 'Failed to start server' });
    }
  });

  app.post('/api/servers/:id/stop', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      await stopServerProcess(id);
      store.recordActivity('stop_server', id, 'Server stopped gracefully', 'success');
      res.json({ success: true, status: 'stopping' });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message || 'Failed to stop server' });
    }
  });

  app.post('/api/servers/:id/restart', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      await stopServerProcess(id);
      await new Promise((r) => setTimeout(r, 400));
      await startServerProcess(id);
      store.recordActivity('restart_server', id, 'Server restarted', 'success');
      res.json({ success: true, status: 'restarting' });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message || 'Failed to restart server' });
    }
  });

  app.post('/api/servers/:id/install', async (req: Request, res: Response) => {
    const id = req.params.id;
    const srv = store.getServer(id);
    if (!srv) return res.status(404).json({ error: true, message: 'Server not found' });

    const srvDir = path.join(SERVERS_DIR, id);
    try {
      updateServerStatus(id, 'installing', 0);
      const output = execSync('npm install --no-audit --no-fund', {
        cwd: srvDir,
        encoding: 'utf-8',
        timeout: 600000,
      });
      updateServerStatus(id, 'stopped', 0);
      res.json({ success: true, output });
    } catch (err: any) {
      updateServerStatus(id, 'stopped', 1);
      res.status(400).json({ success: false, error: err.message, output: err.stdout || err.message });
    }
  });

  function readServerLogsFromFile(serverId: string): LogLine[] {
    const logFile = path.join(SERVERS_DIR, serverId, 'logs', 'server.log');
    if (!fs.existsSync(logFile)) return [];
    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      return lines.map((l) => ({
        timestamp: new Date().toISOString(),
        stream: 'file',
        text: l,
      }));
    } catch {
      return [];
    }
  }

  app.get('/api/servers/:id/logs', (req: Request, res: Response) => {
    const id = req.params.id;
    const ap = activeProcesses.get(id);
    const logs = ap ? [...ap.logs] : readServerLogsFromFile(id);
    res.json(logs);
  });

  // --- Environment Auto-detection & Storage (.env.example & .env) ---
  app.get('/api/servers/:id/env', (req: Request, res: Response) => {
    const id = req.params.id;
    const srv = store.getServer(id);
    if (!srv) return res.status(404).json({ error: true, message: 'Server not found' });

    const srvDir = path.join(SERVERS_DIR, id);
    const examplePath = path.join(srvDir, '.env.example');
    const actualEnvPath = path.join(srvDir, '.env');

    const hasExample = fs.existsSync(examplePath);
    const hasEnv = fs.existsSync(actualEnvPath);

    let exampleRaw = '';
    let envRaw = '';

    const exampleVars = new Map<string, { exampleValue: string; comment: string }>();
    const actualVars = new Map<string, string>();

    // Parse .env.example
    if (hasExample) {
      try {
        exampleRaw = fs.readFileSync(examplePath, 'utf-8');
        let pendingComment = '';
        for (const line of exampleRaw.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#')) {
            pendingComment = (pendingComment ? `${pendingComment} ` : '') + trimmed.replace(/^#+\s*/, '');
            continue;
          }
          if (!trimmed) {
            pendingComment = '';
            continue;
          }
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            let val = trimmed.substring(eqIdx + 1).trim();
            // strip inline comment if any
            const hashIdx = val.indexOf('#');
            if (hashIdx >= 0 && !val.startsWith('"') && !val.startsWith("'")) {
              val = val.substring(0, hashIdx).trim();
            }
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.substring(1, val.length - 1);
            }
            exampleVars.set(key, { exampleValue: val, comment: pendingComment });
            pendingComment = '';
          }
        }
      } catch {}
    }

    // Parse .env
    if (hasEnv) {
      try {
        envRaw = fs.readFileSync(actualEnvPath, 'utf-8');
        for (const line of envRaw.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            let val = trimmed.substring(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.substring(1, val.length - 1);
            }
            actualVars.set(key, val);
          }
        }
      } catch {}
    } else {
      // Fallback to srv.env_vars if .env file not created yet
      if (srv.env_vars) {
        for (const [k, v] of Object.entries(srv.env_vars)) {
          actualVars.set(k, v);
        }
      }
    }

    // Combine variables
    const variables: Array<{
      key: string;
      value: string;
      example_value?: string;
      comment?: string;
      source: 'both' | 'example' | 'custom';
    }> = [];

    const processedKeys = new Set<string>();

    // 1. Keys from .env.example
    for (const [key, meta] of exampleVars.entries()) {
      processedKeys.add(key);
      const inActual = actualVars.has(key);
      const actualVal = inActual ? actualVars.get(key)! : '';
      // If actual value is empty or .env doesn't exist yet, auto-propose exampleValue
      const proposedVal = actualVal !== '' ? actualVal : (meta.exampleValue || '');

      variables.push({
        key,
        value: proposedVal,
        example_value: meta.exampleValue,
        comment: meta.comment,
        source: inActual ? 'both' : 'example',
      });
    }

    // 2. Custom keys in .env not in .env.example
    for (const [key, val] of actualVars.entries()) {
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        variables.push({
          key,
          value: val,
          source: 'custom',
        });
      }
    }

    res.json({
      has_example: hasExample,
      has_env: hasEnv,
      variables,
      example_raw: exampleRaw,
      env_raw: envRaw,
    });
  });

  app.post('/api/servers/:id/env', (req: Request, res: Response) => {
    const id = req.params.id;
    const srv = store.getServer(id);
    if (!srv) return res.status(404).json({ error: true, message: 'Server not found' });

    const { variables } = req.body;
    if (!variables || typeof variables !== 'object') {
      return res.status(400).json({ error: true, message: 'variables object required' });
    }

    const srvDir = path.join(SERVERS_DIR, id);
    const actualEnvPath = path.join(srvDir, '.env');

    // Build .env file content
    const lines: string[] = [
      `# Environment Configuration for ${srv.name}`,
      `# Updated at: ${new Date().toISOString()}`,
      '',
    ];

    const cleanVars: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      const cleanKey = k.trim();
      if (!cleanKey) continue;
      const cleanVal = String(v ?? '');
      cleanVars[cleanKey] = cleanVal;

      // Escape quotes or wrap in quotes if spaces
      let formattedVal = cleanVal;
      if (cleanVal.includes(' ') || cleanVal.includes('\n') || cleanVal.includes('"')) {
        formattedVal = `"${cleanVal.replace(/"/g, '\\"')}"`;
      }
      lines.push(`${cleanKey}=${formattedVal}`);
    }

    try {
      fs.writeFileSync(actualEnvPath, lines.join('\n') + '\n', 'utf-8');

      // Update in-memory and nodepanel.json server env_vars
      srv.env_vars = cleanVars;
      store.saveServer(srv);

      store.recordActivity('update_env', id, `Updated environment variables (${Object.keys(cleanVars).length} entries)`, 'success');
      res.json({ success: true, count: Object.keys(cleanVars).length });
    } catch (err: any) {
      res.status(500).json({ error: true, message: `Failed to save .env file: ${err.message}` });
    }
  });

  app.post('/api/servers/:id/env/init-example', (req: Request, res: Response) => {
    const id = req.params.id;
    const srv = store.getServer(id);
    if (!srv) return res.status(404).json({ error: true, message: 'Server not found' });

    const srvDir = path.join(SERVERS_DIR, id);
    const examplePath = path.join(srvDir, '.env.example');

    if (fs.existsSync(examplePath)) {
      return res.json({ success: true, message: '.env.example already exists' });
    }

    const templateContent = `# Server Listening Port
PORT=${srv.port || 3001}

# Application Environment Mode (development / production)
NODE_ENV=production

# Database Connection URL (Optional)
DATABASE_URL=

# Secret API Key
API_SECRET_KEY=
`;

    try {
      fs.writeFileSync(examplePath, templateContent, 'utf-8');
      store.recordActivity('init_env_example', id, 'Initialized .env.example template', 'success');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: true, message: err.message });
    }
  });

  // --- Terminal REST Fallbacks ---
  app.get('/api/servers/:id/terminal/info', (req: Request, res: Response) => {
    const id = req.params.id;
    const active = activeTerminals.get(id);
    const root = path.resolve(SERVERS_DIR, id);
    const cwd = getServerWorkingDir(id);
    const rel = path.relative(root, cwd) || '.';

    res.json({
      isRunning: Boolean(active),
      currentCommand: active ? active.command : '',
      cwd: rel,
    });
  });

  app.post('/api/servers/:id/terminal/exec', (req: Request, res: Response) => {
    const id = req.params.id;
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: true, message: 'command required' });

    executeTerminalCommand(id, command);
    res.json({ success: true });
  });

  app.post('/api/servers/:id/terminal/kill', (req: Request, res: Response) => {
    const id = req.params.id;
    killTerminalCommand(id);
    res.json({ success: true });
  });

  // --- Server Files & File Manager Operations ---
  app.get('/api/servers/:id/files', (req: Request, res: Response) => {
    const id = req.params.id;
    const relPath = (req.query.path as string) || '';
    const isContent = req.query.content === 'true';

    try {
      const target = safeResolveServerPath(id, relPath);
      if (isContent) {
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
          return res.status(404).json({ error: true, message: 'File not found' });
        }
        const content = fs.readFileSync(target, 'utf-8');
        return res.json({ path: relPath, content });
      }

      if (!fs.existsSync(target)) {
        return res.json([]);
      }

      const root = path.resolve(SERVERS_DIR, id);
      const dirEntries = fs.readdirSync(target, { withFileTypes: true });
      const files: FileEntry[] = dirEntries.map((ent) => {
        const fullChild = path.join(target, ent.name);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullChild);
        } catch {
          stat = { size: 0, mtime: new Date() } as any;
        }
        const relFromRoot = path.relative(root, fullChild);
        return {
          name: ent.name,
          path: relFromRoot,
          is_dir: ent.isDirectory(),
          size: stat.size,
          mod_time: stat.mtime.toISOString(),
        };
      });

      // Sort folders first, then alphabetically
      files.sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      });

      res.json(files);
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  app.post('/api/servers/:id/files', (req: Request, res: Response) => {
    const id = req.params.id;
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: true, message: 'path is required' });

    try {
      const target = safeResolveServerPath(id, filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content || '', 'utf-8');
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  app.delete('/api/servers/:id/files', (req: Request, res: Response) => {
    const id = req.params.id;
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: true, message: 'path is required' });

    try {
      const target = safeResolveServerPath(id, filePath);
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  // Rename file or folder
  app.post('/api/servers/:id/files/rename', (req: Request, res: Response) => {
    const id = req.params.id;
    const { old_path, new_path } = req.body;
    if (!old_path || !new_path) {
      return res.status(400).json({ error: true, message: 'old_path and new_path are required' });
    }

    try {
      const oldTarget = safeResolveServerPath(id, old_path);
      const newTarget = safeResolveServerPath(id, new_path);

      if (!fs.existsSync(oldTarget)) {
        return res.status(404).json({ error: true, message: 'Source file does not exist' });
      }

      fs.renameSync(oldTarget, newTarget);
      store.recordActivity('rename_file', id, `Renamed ${old_path} to ${new_path}`, 'success');
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  // Create directory
  app.post('/api/servers/:id/files/mkdir', (req: Request, res: Response) => {
    const id = req.params.id;
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: true, message: 'path is required' });

    try {
      const target = safeResolveServerPath(id, dirPath);
      fs.mkdirSync(target, { recursive: true });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: true, message: err.message });
    }
  });

  // Download file
  app.get('/api/servers/:id/files/download', (req: Request, res: Response) => {
    const id = req.params.id;
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).send('path required');

    try {
      const target = safeResolveServerPath(id, filePath);
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        return res.status(404).send('File not found');
      }
      res.download(target, path.basename(target));
    } catch (err: any) {
      res.status(400).send(err.message);
    }
  });

  // --- WebSocket Server ---
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/ws' || pathname === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    wsSubscribers.set(ws, new Set());

    // Send connected handshake
    ws.send(JSON.stringify({ event: 'connected', time: new Date().toISOString() }));

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());

        // Subscription management
        if (payload.action === 'subscribe' && payload.serverId) {
          const subs = wsSubscribers.get(ws);
          if (subs) subs.add(payload.serverId);

          // Deliver current terminal working directory
          const root = path.resolve(SERVERS_DIR, payload.serverId);
          const cwd = getServerWorkingDir(payload.serverId);
          const rel = path.relative(root, cwd) || '.';
          const activeTerm = activeTerminals.get(payload.serverId);

          ws.send(
            JSON.stringify({
              event: 'terminal_state',
              data: {
                serverId: payload.serverId,
                cwd: rel,
                isRunning: Boolean(activeTerm),
                currentCommand: activeTerm ? activeTerm.command : '',
              },
            })
          );
        } else if (payload.action === 'unsubscribe' && payload.serverId) {
          const subs = wsSubscribers.get(ws);
          if (subs) subs.delete(payload.serverId);
        } else if (payload.action === 'stdin' && payload.serverId) {
          const ap = activeProcesses.get(payload.serverId);
          if (ap && ap.process.stdin && !ap.process.stdin.destroyed) {
            const text = String(payload.data || '') + '\n';
            ap.process.stdin.write(text);
          }
        }
        // --- Interactive Terminal Actions ---
        else if (payload.action === 'terminal_exec' && payload.serverId && payload.command) {
          executeTerminalCommand(payload.serverId, payload.command);
        } else if (payload.action === 'terminal_kill' && payload.serverId) {
          killTerminalCommand(payload.serverId);
        } else if (payload.action === 'terminal_stdin' && payload.serverId) {
          const term = activeTerminals.get(payload.serverId);
          if (term && term.process.stdin && !term.process.stdin.destroyed) {
            term.process.stdin.write(String(payload.data || '') + '\n');
          }
        }
      } catch {}
    });

    ws.on('close', () => {
      wsSubscribers.delete(ws);
    });

    ws.on('error', () => {
      wsSubscribers.delete(ws);
    });
  });

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Termux NodePanel] Server listening at http://0.0.0.0:${PORT}`);
  });
}

// Cleanup active child processes on server shutdown
function cleanupAll() {
  for (const [, ap] of activeProcesses.entries()) {
    try {
      ap.process.kill('SIGTERM');
    } catch {}
  }
  for (const [, term] of activeTerminals.entries()) {
    try {
      term.process.kill('SIGTERM');
    } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', cleanupAll);
process.on('SIGTERM', cleanupAll);

main().catch((err) => {
  console.error('[Termux NodePanel] Failed to start server:', err);
  process.exit(1);
});
