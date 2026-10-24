import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { spawn, execFile, type ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export interface ServerMetrics {
  pid: number;
  status: ServerStatus;
  uptime_sec: number;
  memory_mb: number | null;
  cpu_percent: number | null;
}

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

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
export type JobCategory = 'install' | 'build' | 'test' | 'git' | 'command' | 'custom';

export interface JobOutputLine {
  seq: number;
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system' | 'command';
  text: string;
}

export interface JobModel {
  id: string;
  serverId: string;
  serverName?: string;
  command: string;
  category: JobCategory;
  status: JobStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  exitCode: number | null;
  signal?: string | null;
  cwd: string;
  output: JobOutputLine[];
  pid?: number;
}

export interface PanelServerOptions {
  dataDir?: string;
  port?: number;
  host?: string;
  isProd?: boolean;
  enableVite?: boolean;
  serveStatic?: boolean;
  apiSecretKey?: string;
  rateLimitMax?: number;
  autoRestartBaseMs?: number;
  maxAutoRestarts?: number;
  stopGraceTimeoutMs?: number;
}

export interface PanelServerInstance {
  app: express.Express;
  server: http.Server;
  wss: WebSocketServer;
  port: number;
  dataDir: string;
  close: () => Promise<void>;
  getActiveProcessCount: () => number;
  getActivePids: () => number[];
}

class HttpError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface DatabaseSchema {
  servers: ServerModel[];
  activities: ActivityLog[];
}

class JsonStore {
  private data: DatabaseSchema = { servers: [], activities: [] };
  private dbJsonPath: string;

  constructor(dbJsonPath: string) {
    this.dbJsonPath = dbJsonPath;
    this.load();
    this.reconcileOnBoot();
  }

  public load(): void {
    try {
      if (fs.existsSync(this.dbJsonPath)) {
        const raw = fs.readFileSync(this.dbJsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
        this.data = {
          servers: Array.isArray(parsed.servers) ? parsed.servers : [],
          activities: Array.isArray(parsed.activities) ? parsed.activities : [],
        };
      } else {
        this.save();
      }
    } catch (err) {
      console.error('[Store] Failed to parse nodepanel.json:', err);
      this.data = { servers: [], activities: [] };
    }
  }

  private reconcileOnBoot(): void {
    let dirty = false;
    const transientStates: Set<ServerStatus> = new Set([
      'running',
      'starting',
      'stopping',
      'installing',
    ]);
    for (const srv of this.data.servers) {
      if (transientStates.has(srv.status)) {
        srv.status = 'stopped';
        srv.updated_at = new Date().toISOString();
        dirty = true;
      }
    }
    if (dirty) {
      this.save();
    }
  }

  public save(): void {
    try {
      fs.mkdirSync(path.dirname(this.dbJsonPath), { recursive: true });
      const tempPath = `${this.dbJsonPath}.tmp.${process.pid}.${crypto.randomUUID()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbJsonPath);
    } catch (err) {
      console.error('[Store] Failed to save nodepanel.json:', err);
    }
  }

  public listServers(): ServerModel[] {
    return this.data.servers.map((s) => ({ ...s, env_vars: { ...(s.env_vars || {}) } }));
  }

  public getServer(id: string): ServerModel | undefined {
    const found = this.data.servers.find((s) => s.id === id);
    return found ? { ...found, env_vars: { ...(found.env_vars || {}) } } : undefined;
  }

  public saveServer(server: ServerModel): void {
    const copy: ServerModel = {
      ...server,
      env_vars: { ...(server.env_vars || {}) },
      updated_at: new Date().toISOString(),
    };
    const idx = this.data.servers.findIndex((s) => s.id === copy.id);
    if (idx >= 0) {
      this.data.servers[idx] = copy;
    } else {
      if (!copy.created_at) copy.created_at = copy.updated_at;
      this.data.servers.push(copy);
    }
    this.save();
  }

  public deleteServer(id: string): void {
    this.data.servers = this.data.servers.filter((s) => s.id !== id);
    this.save();
  }

  public recordActivity(
    action: string,
    serverId: string,
    details: string,
    status: 'success' | 'failed' | 'warning'
  ): void {
    const entry: ActivityLog = {
      id: `${Date.now()}${crypto.randomBytes(3).toString('hex')}`,
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

  public listActivities(): ActivityLog[] {
    return [...this.data.activities];
  }
}

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
    pkg_map: {
      pkg: 'build-essential',
      'apt-get': 'build-essential',
      pacman: 'base-devel',
      apk: 'build-base',
    },
    installed: false,
  },
};

const SERVER_ID_REGEX = /^srv-[a-zA-Z0-9_-]{1,64}$/;
const SAFE_SCRIPT_NAME_REGEX = /^[a-zA-Z0-9:_-]{1,64}$/;
const SAFE_GIT_URL_REGEX = /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)[^\s;|&$`<>'"]+$/i;
const SAFE_GIT_BRANCH_REGEX = /^[a-zA-Z0-9._/-]{1,120}$/;
const SAFE_ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/**
 * Pure non-blocking filesystem PATH lookup without spawning /bin/sh child processes.
 */
function lookPathFast(executable: string): string | null {
  if (!executable || executable.includes('/') || executable.includes('\\')) {
    return null;
  }
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, executable);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        fs.accessSync(full, fs.constants.X_OK);
        return full;
      }
    } catch {
      // Continue scanning PATH
    }
  }
  return null;
}

const versionCache = new Map<string, { version: string; expiresAt: number }>();

function getToolVersionAsync(executablePath: string): Promise<string> {
  const now = Date.now();
  const cached = versionCache.get(executablePath);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.version);
  }

  return new Promise((resolve) => {
    execFile(
      executablePath,
      ['--version'],
      { timeout: 2500, maxBuffer: 64 * 1024 },
      (err, stdout, stderr) => {
        const raw = `${stdout || ''}\n${stderr || ''}`.trim();
        const firstLine = raw.split('\n').map((l) => l.trim()).find(Boolean);
        const version = !err && firstLine ? firstLine.slice(0, 120) : firstLine ? firstLine.slice(0, 120) : 'Installed';
        versionCache.set(executablePath, { version, expiresAt: Date.now() + 60_000 });
        resolve(version);
      }
    );
  });
}

function runCommandAsync(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; output: string }> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const maxBytes = 512 * 1024;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore
      }
      reject(new HttpError(408, 'COMMAND_TIMEOUT', `Command '${command}' timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxBytes) {
        stdout += chunk.toString('utf-8');
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxBytes) {
        stderr += chunk.toString('utf-8');
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new HttpError(500, 'COMMAND_SPAWN_ERROR', `Failed to execute '${command}': ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      if (code === 0) {
        resolve({ stdout, stderr, output: combined });
      } else {
        const err = new HttpError(
          400,
          'COMMAND_FAILED',
          combined ? combined.split('\n').slice(-4).join(' | ').slice(0, 320) : `${command} exited with code ${code}`
        );
        (err as HttpError & { output?: string }).output = combined;
        reject(err);
      }
    });
  });
}

function getRealDiskFreeMb(targetDir: string): number | null {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(targetDir);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (Number.isFinite(freeBytes) && freeBytes >= 0) {
        return Math.round(freeBytes / (1024 * 1024));
      }
    }
  } catch {
    // Fallback to null when statfs is unavailable
  }
  return null;
}

function killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (typeof pid === 'number' && pid > 0) {
    if (process.platform !== 'win32') {
      try {
        process.kill(-pid, signal);
        return;
      } catch {
        // Fallback to direct child signal if not a process group leader or already exited
      }
    }
    try {
      child.kill(signal);
    } catch {
      // Process already exited
    }
  }
}

function readProcMemoryMb(pid: number): number | null {
  if (!pid || pid <= 0) return null;
  try {
    const statusFile = `/proc/${pid}/status`;
    if (!fs.existsSync(statusFile)) return null;
    const content = fs.readFileSync(statusFile, 'utf-8');
    const match = content.match(/VmRSS:\s+(\d+)\s+kB/);
    if (match) {
      return Math.round((parseInt(match[1], 10) / 1024) * 10) / 10;
    }
  } catch {
    // Process exited or /proc not mounted
  }
  return null;
}

function readProcCpuTicks(pid: number): number | null {
  if (!pid || pid <= 0) return null;
  try {
    const statPath = `/proc/${pid}/stat`;
    if (!fs.existsSync(statPath)) return null;
    const raw = fs.readFileSync(statPath, 'utf-8');
    const closeParen = raw.lastIndexOf(')');
    if (closeParen === -1) return null;
    const fields = raw.slice(closeParen + 2).trim().split(/\s+/);
    // utime is field 14 (index 11 after ')'), stime is field 15 (index 12 after ')')
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    if (Number.isFinite(utime) && Number.isFinite(stime)) {
      return utime + stime;
    }
  } catch {
    // Process exited or /proc not mounted
  }
  return null;
}

function isOriginAllowed(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const hostOnly = (hostHeader || '').split(',')[0].trim();
  if (hostOnly && parsed.host === hostOnly) {
    return true;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return true;
  }

  if (
    hostname.endsWith('.run.app') ||
    hostname.endsWith('.googleusercontent.com') ||
    hostname.endsWith('.google.com')
  ) {
    return true;
  }

  const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extraOrigins.includes(origin)) {
    return true;
  }

  return false;
}

function seedServerTemplate(dir: string, template = 'blank', name: string, port: number): void {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'node-app';
  const safeDisplayName = name.replace(/[\r\n]/g, ' ').trim();

  switch (template) {
    case 'express_api': {
      const pkg = {
        name: cleanName,
        version: '1.0.0',
        description: 'Express REST API managed by Termux NodePanel',
        main: 'index.js',
        scripts: { start: 'node index.js' },
        dependencies: { express: '^4.21.2' },
      };
      const code = `const express = require('express');
const app = express();
const PORT = process.env.PORT || ${port};

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    app: ${JSON.stringify(safeDisplayName)},
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

app.get('/api/ping', (_req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(${JSON.stringify(`[${safeDisplayName}] Express Server listening on http://localhost:`)} + PORT);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
`;
      const envExample = `# Server Configuration\nPORT=${port}\nNODE_ENV=production\n`;
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
      const code = `console.log(${JSON.stringify(`[${safeDisplayName}] Worker initialized. Starting periodic processing...`)});

let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log('[' + new Date().toISOString() + '] Task #' + counter + ' processed successfully.');
}, 3000);

process.on('SIGTERM', () => {
  console.log(${JSON.stringify(`[${safeDisplayName}] Received SIGTERM signal. Performing cleanup...`)});
  clearInterval(interval);
  process.exit(0);
});
`;
      const envExample = `# Worker Configuration\nWORKER_INTERVAL_MS=3000\nNODE_ENV=production\n`;
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

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: ${JSON.stringify(`Hello from ${safeDisplayName}!`)}, time: new Date() }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(${JSON.stringify(`[${safeDisplayName}] HTTP server running on port `)} + PORT);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
`;
      const envExample = `# Server Configuration\nPORT=${port}\nNODE_ENV=development\n`;
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
      fs.writeFileSync(path.join(dir, 'index.js'), code);
      fs.writeFileSync(path.join(dir, '.env.example'), envExample);
      fs.writeFileSync(path.join(dir, '.env'), envExample);
      break;
    }
  }
}

function autoRestartPolicyValid(val: unknown): val is AutoRestartPolicy {
  return val === 'never' || val === 'always' || val === 'on-failure';
}

export async function createPanelServer(options: PanelServerOptions = {}): Promise<PanelServerInstance> {
  const configuredPort = options.port ?? (Number(process.env.PORT) || 3000);
  const host = options.host ?? '0.0.0.0';
  const isProd = options.isProd ?? process.env.NODE_ENV === 'production';
  const enableVite = options.enableVite ?? !isProd;
  const serveStatic = options.serveStatic ?? isProd;
  const apiSecretKey = (options.apiSecretKey ?? process.env.API_SECRET_KEY ?? '').trim();
  const rateLimitMax = options.rateLimitMax ?? (Number(process.env.NODEPANEL_RATE_LIMIT_MAX) || 1200);
  const autoRestartBaseMs = options.autoRestartBaseMs ?? 2000;
  const maxAutoRestarts = options.maxAutoRestarts ?? 5;
  const stopGraceTimeoutMs = options.stopGraceTimeoutMs ?? 3000;

  const dataDir = path.resolve(
    options.dataDir || process.env.NODEPANEL_DATA_DIR || path.join(__dirname, 'data')
  );
  const serversDir = path.join(dataDir, 'servers');
  const dbJsonPath = path.join(dataDir, 'nodepanel.json');

  fs.mkdirSync(serversDir, { recursive: true });

  const store = new JsonStore(dbJsonPath);

  interface ActiveServerProcess {
    process: ChildProcess;
    pid: number;
    startTime: number;
    logs: LogLine[];
    logStream?: fs.WriteStream;
    intentionalStop: boolean;
    lastCpuSample?: { ticks: number; timestampMs: number };
  }

  interface SupervisorState {
    restartCount: number;
    restartTimer: NodeJS.Timeout | null;
    stableTimer: NodeJS.Timeout | null;
  }

  interface ActiveTerminalProcess {
    process: ChildProcess;
    serverId: string;
    command: string;
    startTime: number;
    cwd: string;
  }

  interface WsClientMeta {
    subscriptions: Set<string>;
    isAlive: boolean;
    seenRequestIds: string[];
  }

  const activeProcesses = new Map<string, ActiveServerProcess>();
  const supervisorStates = new Map<string, SupervisorState>();
  const serverLocks = new Map<string, Promise<void>>();
  const activeTerminals = new Map<string, ActiveTerminalProcess>();

  interface RunningJobRecord {
    job: JobModel;
    process: ChildProcess;
    timeoutTimer?: NodeJS.Timeout;
    intentionalKill: boolean;
  }

  const runningJobs = new Map<string, RunningJobRecord>();
  const jobHistory: JobModel[] = [];
  const MAX_JOB_HISTORY = 100;
  const MAX_LINES_PER_JOB = 2000;
  const serverWorkingDirs = new Map<string, string>();
  const wsClients = new Map<WebSocket, WsClientMeta>();
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();

  let isShuttingDown = false;
  let isPackageOpBusy = false;
  let activePackageOp = '';
  let boundPort = configuredPort;

  function getSupervisorState(serverId: string): SupervisorState {
    let state = supervisorStates.get(serverId);
    if (!state) {
      state = { restartCount: 0, restartTimer: null, stableTimer: null };
      supervisorStates.set(serverId, state);
    }
    return state;
  }

  function clearSupervisorTimers(serverId: string, resetCount = true): void {
    const state = supervisorStates.get(serverId);
    if (!state) return;
    if (state.restartTimer) {
      clearTimeout(state.restartTimer);
      state.restartTimer = null;
    }
    if (state.stableTimer) {
      clearTimeout(state.stableTimer);
      state.stableTimer = null;
    }
    if (resetCount) {
      state.restartCount = 0;
    }
  }

  function withServerLock<T>(serverId: string, task: () => Promise<T>): Promise<T> {
    const prev = serverLocks.get(serverId) ?? Promise.resolve();
    let releaseLock!: () => void;
    const nextGate = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    serverLocks.set(
      serverId,
      prev.then(
        () => nextGate,
        () => nextGate
      )
    );

    return prev.then(task).finally(() => {
      releaseLock();
      if (serverLocks.get(serverId) === nextGate) {
        serverLocks.delete(serverId);
      }
    });
  }

  function assertValidServerId(serverId: string): void {
    if (!serverId || typeof serverId !== 'string' || !SERVER_ID_REGEX.test(serverId)) {
      throw new HttpError(400, 'INVALID_SERVER_ID', 'Invalid server identifier');
    }
  }

  function safeResolveServerPath(serverId: string, subPath = ''): string {
    assertValidServerId(serverId);
    if (typeof subPath !== 'string' || subPath.includes('\0')) {
      throw new HttpError(400, 'INVALID_PATH', 'Invalid file path');
    }

    const baseServersDir = fs.existsSync(serversDir) ? fs.realpathSync(serversDir) : path.resolve(serversDir);
    const rawRoot = path.join(baseServersDir, serverId);
    const realRoot = fs.existsSync(rawRoot) ? fs.realpathSync(rawRoot) : rawRoot;

    if (realRoot !== rawRoot && !realRoot.startsWith(baseServersDir + path.sep)) {
      throw new HttpError(403, 'PATH_TRAVERSAL', 'Access denied: server root symlink violation');
    }

    const cleanSub = subPath.replace(/^[\\/]+/, '');
    const resolvedTarget = path.resolve(realRoot, cleanSub);

    if (resolvedTarget !== realRoot && !resolvedTarget.startsWith(realRoot + path.sep)) {
      throw new HttpError(
        403,
        'PATH_TRAVERSAL',
        'Access denied: directory traversal outside server root detected'
      );
    }

    // Walk up to nearest existing ancestor and verify realpath stays inside realRoot
    let probe = resolvedTarget;
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }

    if (fs.existsSync(probe) && fs.existsSync(realRoot)) {
      const realProbe = fs.realpathSync(probe);
      if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) {
        throw new HttpError(
          403,
          'SYMLINK_ESCAPE',
          'Access denied: symbolic link points outside server workspace'
        );
      }
    }

    return resolvedTarget;
  }

  function validateEntryCommand(serverId: string, rawEntry: string): { cmd: string; args: string[]; cleanEntry: string } {
    const cleanEntry = (rawEntry || 'index.js').trim();
    if (!cleanEntry || cleanEntry.length > 180 || cleanEntry.includes('\0')) {
      throw new HttpError(400, 'INVALID_ENTRY', 'Entry point must be between 1 and 180 characters');
    }
    if (cleanEntry === 'npm start') {
      return { cmd: 'npm', args: ['start'], cleanEntry };
    }
    if (cleanEntry.startsWith('npm run ')) {
      const scriptName = cleanEntry.slice('npm run '.length).trim();
      if (!SAFE_SCRIPT_NAME_REGEX.test(scriptName)) {
        throw new HttpError(400, 'INVALID_NPM_SCRIPT', 'Invalid npm script name');
      }
      return { cmd: 'npm', args: ['run', scriptName], cleanEntry: `npm run ${scriptName}` };
    }
    if (cleanEntry.startsWith('-') || path.isAbsolute(cleanEntry)) {
      throw new HttpError(400, 'INVALID_ENTRY', 'Entry file must be a relative path inside the server directory');
    }
    // Verify containment inside server root
    safeResolveServerPath(serverId, cleanEntry);
    return { cmd: 'node', args: [cleanEntry], cleanEntry };
  }

  let cachedStaticEnv: {
    envType: 'android_native' | 'termux_native' | 'ubuntu_proot' | 'linux_generic' | 'unknown';
    typeName: string;
    distro: string;
    distroVersion: string;
    prefix: string;
    termuxVersion: string;
    isProot: boolean;
    executables: Record<string, string>;
    packageManager: string;
    expiresAt: number;
  } | null = null;

  let cachedDiskFree: { value: number | null; expiresAt: number } | null = null;

  function detectEnvironment() {
    const now = Date.now();
    if (!cachedStaticEnv || cachedStaticEnv.expiresAt < now) {
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
      } catch {
        // Ignore
      }

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
      } catch {
        // Ignore
      }

      let envType: 'android_native' | 'termux_native' | 'ubuntu_proot' | 'linux_generic' | 'unknown' =
        'linux_generic';
      let typeName = `Linux (${distro})`;

      if (isTermux && !isProot) {
        envType = 'android_native';
        typeName = 'Native Android (Termux)';
      } else if (isProot) {
        envType = 'ubuntu_proot';
        typeName = 'Ubuntu (proot-distro)';
      }

      const executables: Record<string, string> = {};
      const tools = ['node', 'npm', 'git', 'pkg', 'apt-get', 'apt', 'python3', 'python', 'ffmpeg', 'curl', 'tar'];
      for (const t of tools) {
        const p = lookPathFast(t);
        if (p) executables[t] = p;
      }

      let packageManager = 'none';
      if (envType === 'android_native') {
        if (executables['pkg']) packageManager = 'pkg';
        else if (executables['apt']) packageManager = 'apt';
      } else {
        if (executables['apt-get']) packageManager = 'apt-get';
        else if (executables['apt']) packageManager = 'apt';
        else if (lookPathFast('pacman')) packageManager = 'pacman';
        else if (lookPathFast('apk')) packageManager = 'apk';
      }

      cachedStaticEnv = {
        envType,
        typeName,
        distro,
        distroVersion,
        prefix,
        termuxVersion,
        isProot,
        executables,
        packageManager,
        expiresAt: now + 30_000,
      };
    }

    if (!cachedDiskFree || cachedDiskFree.expiresAt < now) {
      cachedDiskFree = {
        value: getRealDiskFreeMb(dataDir),
        expiresAt: now + 5_000,
      };
    }

    const { executables, packageManager } = cachedStaticEnv;

    const capabilities = [
      'Node.js Process Supervision & Process-Group Cleanup',
      'Interactive Real-time Terminal via WebSocket',
      'Git Repository Clone & Dependency Installer',
      'Per-server Sandboxed Data Directories',
      'Automated .env.example Sync Engine',
    ];
    const limitations: string[] = [];

    if (cachedStaticEnv.envType === 'android_native') {
      capabilities.push('Native Package Management (pkg)');
      limitations.push(
        'Mobile battery optimization may suspend background processes unless Termux Wake Lock is active'
      );
      limitations.push('Runs within non-root Android user sandbox');
    } else if (cachedStaticEnv.envType === 'ubuntu_proot') {
      capabilities.push('Debian/Ubuntu APT Package Management', 'Full glibc compatibility');
      limitations.push('No systemd daemon supervision inside proot container');
    } else {
      capabilities.push('Full Linux Kernel & POSIX Process Group Execution');
    }

    if (executables['node']) {
      capabilities.push(`Node.js Runtime (${process.version})`);
    } else {
      limitations.push('Node.js binary not detected in PATH');
    }

    if (executables['git']) {
      capabilities.push('Git Version Control Available');
    } else {
      limitations.push('Git is not installed; repository cloning requires installing git first');
    }

    return {
      type: cachedStaticEnv.envType,
      type_name: cachedStaticEnv.typeName,
      os: os.platform(),
      arch: os.arch(),
      kernel: os.release(),
      hostname: os.hostname(),
      distro: cachedStaticEnv.distro,
      distro_version: cachedStaticEnv.distroVersion,
      prefix: cachedStaticEnv.prefix,
      termux_version: cachedStaticEnv.termuxVersion,
      is_proot: cachedStaticEnv.isProot,
      package_manager: packageManager,
      executables,
      capabilities,
      limitations,
      disk_free_mb: cachedDiskFree.value,
      memory_total_mb: Math.round(os.totalmem() / (1024 * 1024)),
      memory_free_mb: Math.round(os.freemem() / (1024 * 1024)),
      panel_port: boundPort,
      storage_engine: 'Atomic JSON Store (nodepanel.json)',
    };
  }

  function broadcastWSEvent(event: string, data: unknown, filterServerId?: string): void {
    const msg = JSON.stringify({ event, data });
    for (const [client, meta] of wsClients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        if (!filterServerId || meta.subscriptions.has(filterServerId)) {
          try {
            client.send(msg);
          } catch {
            // Socket closing
          }
        }
      }
    }
  }

  function appendLog(serverId: string, stream: 'stdout' | 'stderr' | 'system', text: string): void {
    const logLine: LogLine = {
      timestamp: new Date().toISOString(),
      stream,
      text,
    };

    const ap = activeProcesses.get(serverId);
    if (ap) {
      ap.logs.push(logLine);
      if (ap.logs.length > 1000) ap.logs.shift();
      if (ap.logStream && !ap.logStream.destroyed) {
        ap.logStream.write(`[${logLine.timestamp}][${stream}] ${text}\n`);
      }
    }

    broadcastWSEvent(
      'log',
      {
        server_id: serverId,
        timestamp: logLine.timestamp,
        stream: logLine.stream,
        text: logLine.text,
      },
      serverId
    );
  }

  function updateServerStatus(serverId: string, newStatus: ServerStatus, exitCode: number): void {
    const server = store.getServer(serverId);
    if (!server) return;
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

  function getProcessMetrics(serverId: string): ServerMetrics | undefined {
    const ap = activeProcesses.get(serverId);
    const server = store.getServer(serverId);
    if (!server) return undefined;

    if (!ap || server.status !== 'running' || ap.pid <= 0) {
      return {
        pid: 0,
        status: server.status,
        uptime_sec: 0,
        memory_mb: 0,
        cpu_percent: 0,
      };
    }

    const nowMs = Date.now();
    const uptimeSec = Math.max(0, Math.floor((nowMs - ap.startTime) / 1000));
    const memoryMb = readProcMemoryMb(ap.pid);

    let cpuPercent: number | null = null;
    const ticks = readProcCpuTicks(ap.pid);
    if (ticks !== null) {
      const clkTck = 100;
      if (ap.lastCpuSample && nowMs > ap.lastCpuSample.timestampMs) {
        const deltaTicks = Math.max(0, ticks - ap.lastCpuSample.ticks);
        const deltaSec = (nowMs - ap.lastCpuSample.timestampMs) / 1000;
        if (deltaSec > 0.05) {
          cpuPercent = Math.round(((deltaTicks / clkTck) / deltaSec) * 1000) / 10;
        }
      }
      if (cpuPercent === null) {
        const elapsedSec = Math.max(0.25, (nowMs - ap.startTime) / 1000);
        cpuPercent = Math.round(((ticks / clkTck) / elapsedSec) * 1000) / 10;
      }
      ap.lastCpuSample = { ticks, timestampMs: nowMs };
    }

    return {
      pid: ap.pid,
      status: 'running',
      uptime_sec: uptimeSec,
      memory_mb: memoryMb,
      cpu_percent: cpuPercent,
    };
  }

  function getServerWorkingDir(serverId: string): string {
    const root = safeResolveServerPath(serverId, '');
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
    const realRoot = fs.realpathSync(root);
    const current = serverWorkingDirs.get(serverId);
    if (current && fs.existsSync(current)) {
      try {
        const realCurrent = fs.realpathSync(current);
        if (realCurrent === realRoot || realCurrent.startsWith(realRoot + path.sep)) {
          return realCurrent;
        }
      } catch {
        // Reset to root below
      }
    }
    serverWorkingDirs.set(serverId, realRoot);
    return realRoot;
  }

  function startServerProcessInternal(serverId: string, isAutoRestart = false): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isShuttingDown) {
        return reject(new HttpError(503, 'SHUTTING_DOWN', 'Panel server is shutting down'));
      }

      const server = store.getServer(serverId);
      if (!server) {
        return reject(new HttpError(404, 'SERVER_NOT_FOUND', 'Server not found'));
      }

      const existing = activeProcesses.get(serverId);
      if (existing && existing.process.exitCode === null && !existing.intentionalStop) {
        return reject(new HttpError(409, 'ALREADY_RUNNING', 'Server process is already running'));
      }

      const supState = getSupervisorState(serverId);
      if (supState.restartTimer) {
        clearTimeout(supState.restartTimer);
        supState.restartTimer = null;
      }
      if (supState.stableTimer) {
        clearTimeout(supState.stableTimer);
        supState.stableTimer = null;
      }
      if (!isAutoRestart) {
        supState.restartCount = 0;
      }

      const srvDir = safeResolveServerPath(serverId, '');
      fs.mkdirSync(srvDir, { recursive: true });

      let parsedCmd: { cmd: string; args: string[]; cleanEntry: string };
      try {
        parsedCmd = validateEntryCommand(serverId, server.entry_file || 'index.js');
      } catch (err) {
        return reject(err);
      }

      if (parsedCmd.cmd === 'node') {
        const entryPath = safeResolveServerPath(serverId, parsedCmd.cleanEntry);
        if (!fs.existsSync(entryPath)) {
          if (parsedCmd.cleanEntry === 'index.js') {
            seedServerTemplate(srvDir, 'basic_http', server.name, server.port || 3400);
            appendLog(
              serverId,
              'system',
              `[nodepanel] Notice: Entry file 'index.js' was missing. Provisioned default HTTP server.`
            );
          } else {
            return reject(
              new HttpError(400, 'MISSING_ENTRY_FILE', `Entry file '${parsedCmd.cleanEntry}' does not exist`)
            );
          }
        }
      }

      const logDir = path.join(srvDir, 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      const logFilePath = path.join(logDir, 'server.log');
      const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
      logStream.on('error', () => {
        // Prevent unhandled write stream error
      });

      updateServerStatus(serverId, 'starting', 0);

      // Load variables from server.env_vars and .env
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
        } catch {
          // Ignore malformed .env read error
        }
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
        child = spawn(parsedCmd.cmd, parsedCmd.args, {
          cwd: srvDir,
          env: customEnv,
          shell: false,
          detached: process.platform !== 'win32',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: unknown) {
        logStream.end();
        updateServerStatus(serverId, 'failed', -1);
        const msg = err instanceof Error ? err.message : 'Failed to spawn process';
        return reject(new HttpError(500, 'SPAWN_FAILED', msg));
      }

      const ap: ActiveServerProcess = {
        process: child,
        pid: child.pid || 0,
        startTime: Date.now(),
        logs: [],
        logStream,
        intentionalStop: false,
      };
      activeProcesses.set(serverId, ap);

      let finalized = false;
      const finalizeProcess = (code: number | null, signal: NodeJS.Signals | null, spawnErr?: Error) => {
        if (finalized) return;
        finalized = true;

        if (supState.stableTimer) {
          clearTimeout(supState.stableTimer);
          supState.stableTimer = null;
        }

        if (activeProcesses.get(serverId) === ap) {
          activeProcesses.delete(serverId);
        }

        if (spawnErr) {
          appendLog(serverId, 'stderr', `[nodepanel] Process error: ${spawnErr.message}`);
          logStream.end();
          updateServerStatus(serverId, 'failed', -1);
          return;
        }

        const wasIntentional = ap.intentionalStop || isShuttingDown;
        let exitCode: number;
        let finalStatus: ServerStatus;

        if (wasIntentional) {
          exitCode = code !== null ? code : 0;
          finalStatus = 'stopped';
          appendLog(
            serverId,
            'system',
            `[nodepanel] Process stopped gracefully (code ${exitCode}${signal ? `, ${signal}` : ''})`
          );
        } else if (code === 0) {
          exitCode = 0;
          finalStatus = 'stopped';
          appendLog(serverId, 'system', '[nodepanel] Process exited cleanly with code 0');
        } else {
          exitCode =
            code !== null
              ? code
              : signal === 'SIGKILL'
                ? 137
                : signal === 'SIGTERM'
                  ? 143
                  : 1;
          finalStatus = 'crashed';
          appendLog(
            serverId,
            'system',
            `[nodepanel] Process crashed with exit code ${exitCode}${signal ? ` (${signal})` : ''}`
          );
        }

        logStream.end();

        // Only update persisted status if server wasn't deleted
        const currentSrv = store.getServer(serverId);
        if (!currentSrv) return;

        updateServerStatus(serverId, finalStatus, exitCode);

        if (!wasIntentional && !isShuttingDown) {
          const shouldRestart =
            currentSrv.auto_restart === 'always' ||
            (currentSrv.auto_restart === 'on-failure' && exitCode !== 0);

          if (shouldRestart) {
            supState.restartCount += 1;
            if (supState.restartCount <= maxAutoRestarts) {
              const backoffMs = supState.restartCount * autoRestartBaseMs;
              appendLog(
                serverId,
                'system',
                `[nodepanel] Auto-restarting in ${(backoffMs / 1000).toFixed(1)}s (attempt ${supState.restartCount}/${maxAutoRestarts})...`
              );
              supState.restartTimer = setTimeout(() => {
                supState.restartTimer = null;
                if (isShuttingDown || !store.getServer(serverId)) return;
                withServerLock(serverId, () => startServerProcessInternal(serverId, true)).catch(
                  (restartErr: unknown) => {
                    const msg = restartErr instanceof Error ? restartErr.message : String(restartErr);
                    appendLog(serverId, 'stderr', `[nodepanel] Auto-restart failed: ${msg}`);
                  }
                );
              }, backoffMs);
            } else {
              updateServerStatus(serverId, 'failed', exitCode);
              appendLog(
                serverId,
                'system',
                `[nodepanel] Maximum auto-restart attempts reached (${maxAutoRestarts}). Halting.`
              );
              store.recordActivity(
                'auto_restart_halted',
                serverId,
                `Halted after ${maxAutoRestarts} crash restarts`,
                'failed'
              );
            }
          }
        }
      };

      child.on('error', (err) => {
        finalizeProcess(null, null, err);
      });

      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString('utf-8').split('\n');
        for (const line of lines) {
          if (line.trim().length > 0) appendLog(serverId, 'stdout', line);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString('utf-8').split('\n');
        for (const line of lines) {
          if (line.trim().length > 0) appendLog(serverId, 'stderr', line);
        }
      });

      child.on('exit', (code, signal) => {
        finalizeProcess(code, signal);
      });

      // Reset crash counter once server runs stably for 30s
      supState.stableTimer = setTimeout(() => {
        supState.stableTimer = null;
        if (activeProcesses.get(serverId) === ap && !ap.intentionalStop) {
          supState.restartCount = 0;
        }
      }, 30_000);
      supState.stableTimer.unref?.();

      updateServerStatus(serverId, 'running', 0);
      appendLog(
        serverId,
        'system',
        `[nodepanel] Process started (PID: ${ap.pid}) using "${parsedCmd.cmd} ${parsedCmd.args.join(' ')}"`
      );
      store.recordActivity(
        'start_server',
        serverId,
        `Server '${server.name}' started (PID: ${ap.pid})`,
        'success'
      );

      resolve();
    });
  }

  function stopServerProcessInternal(serverId: string): Promise<void> {
    clearSupervisorTimers(serverId, true);

    return new Promise((resolve) => {
      const ap = activeProcesses.get(serverId);
      if (!ap || ap.process.exitCode !== null) {
        activeProcesses.delete(serverId);
        if (store.getServer(serverId)) {
          updateServerStatus(serverId, 'stopped', 0);
        }
        return resolve();
      }

      ap.intentionalStop = true;
      updateServerStatus(serverId, 'stopping', 0);
      appendLog(serverId, 'system', '[nodepanel] Sending SIGTERM to process group...');

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        resolve();
      };

      const forceKillTimer = setTimeout(() => {
        if (!settled) {
          appendLog(serverId, 'system', '[nodepanel] Graceful timeout elapsed; sending SIGKILL...');
          killProcessTree(ap.process, 'SIGKILL');
          setTimeout(finish, 150);
        }
      }, stopGraceTimeoutMs);

      ap.process.once('exit', () => {
        finish();
      });

      killProcessTree(ap.process, 'SIGTERM');
    });
  }

  function startJob(params: {
    serverId: string;
    command: string;
    category?: JobCategory;
    cwd?: string;
    timeoutMs?: number;
  }): JobModel {
    const { serverId, command } = params;
    const category = params.category || 'command';
    const timeoutMs = params.timeoutMs ?? 300_000;

    assertValidServerId(serverId);
    const server = store.getServer(serverId);
    if (!server) {
      throw new HttpError(404, 'SERVER_NOT_FOUND', 'Server not found');
    }

    const srvRoot = safeResolveServerPath(serverId, '');
    fs.mkdirSync(srvRoot, { recursive: true });
    const realServerRoot = fs.realpathSync(srvRoot);
    const currentCwd = params.cwd ? safeResolveServerPath(serverId, params.cwd) : getServerWorkingDir(serverId);
    const relCwdDisplay = path.relative(realServerRoot, currentCwd) || '.';

    const jobId = `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    let seqCounter = 0;

    const job: JobModel = {
      id: jobId,
      serverId,
      serverName: server.name,
      command,
      category,
      status: 'running',
      startTime: new Date().toISOString(),
      exitCode: null,
      signal: null,
      cwd: relCwdDisplay,
      output: [],
    };

    const addLine = (stream: JobOutputLine['stream'], text: string) => {
      seqCounter++;
      const line: JobOutputLine = {
        seq: seqCounter,
        timestamp: new Date().toISOString(),
        stream,
        text,
      };

      if (job.output.length >= MAX_LINES_PER_JOB) {
        if (job.output.length === MAX_LINES_PER_JOB) {
          job.output.push({
            seq: ++seqCounter,
            timestamp: new Date().toISOString(),
            stream: 'system',
            text: '[nodepanel] Warning: Maximum job output buffer reached. Earlier output truncated.',
          });
        }
        job.output.shift();
      }
      job.output.push(line);

      broadcastWSEvent('job_output', { jobId, serverId, line }, serverId);
      broadcastWSEvent('terminal_data', { serverId, stream, text, jobId, seq: line.seq }, serverId);
      return line;
    };

    addLine('command', `$ ${command}`);

    // Built-in cd command
    if (command === 'cd' || command.startsWith('cd ')) {
      const targetArg = command === 'cd' ? '' : command.substring(3).trim();
      const candidatePath =
        targetArg && targetArg !== '~' ? path.resolve(currentCwd, targetArg) : realServerRoot;

      if (candidatePath !== realServerRoot && !candidatePath.startsWith(realServerRoot + path.sep)) {
        addLine('stderr', `cd: restricted to server workspace (${relCwdDisplay})`);
        job.status = 'failed';
        job.exitCode = 1;
        job.endTime = new Date().toISOString();
        job.durationMs = 5;
        jobHistory.unshift({ ...job, output: [...job.output] });
        broadcastWSEvent('job_finished', { jobId, serverId, exitCode: 1, durationMs: 5, status: 'failed' }, serverId);
        broadcastWSEvent('terminal_exit', { serverId, exitCode: 1, cwd: relCwdDisplay, jobId }, serverId);
        return job;
      }

      if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isDirectory()) {
        addLine('stderr', `cd: no such directory: ${targetArg}`);
        job.status = 'failed';
        job.exitCode = 1;
        job.endTime = new Date().toISOString();
        job.durationMs = 5;
        jobHistory.unshift({ ...job, output: [...job.output] });
        broadcastWSEvent('job_finished', { jobId, serverId, exitCode: 1, durationMs: 5, status: 'failed' }, serverId);
        broadcastWSEvent('terminal_exit', { serverId, exitCode: 1, cwd: relCwdDisplay, jobId }, serverId);
        return job;
      }

      const realTarget = fs.realpathSync(candidatePath);
      if (realTarget !== realServerRoot && !realTarget.startsWith(realServerRoot + path.sep)) {
        addLine('stderr', 'cd: symbolic link outside server workspace is not permitted');
        job.status = 'failed';
        job.exitCode = 1;
        job.endTime = new Date().toISOString();
        job.durationMs = 5;
        jobHistory.unshift({ ...job, output: [...job.output] });
        broadcastWSEvent('job_finished', { jobId, serverId, exitCode: 1, durationMs: 5, status: 'failed' }, serverId);
        broadcastWSEvent('terminal_exit', { serverId, exitCode: 1, cwd: relCwdDisplay, jobId }, serverId);
        return job;
      }

      serverWorkingDirs.set(serverId, realTarget);
      const updatedRel = path.relative(realServerRoot, realTarget) || '.';
      job.cwd = updatedRel;
      addLine('system', `Directory changed to: /${updatedRel === '.' ? '' : updatedRel}`);
      job.status = 'completed';
      job.exitCode = 0;
      job.endTime = new Date().toISOString();
      job.durationMs = 5;
      jobHistory.unshift({ ...job, output: [...job.output] });
      broadcastWSEvent('job_finished', { jobId, serverId, exitCode: 0, durationMs: 5, status: 'completed' }, serverId);
      broadcastWSEvent('terminal_exit', { serverId, exitCode: 0, cwd: updatedRel, jobId }, serverId);
      return job;
    }

    if (command === 'clear') {
      broadcastWSEvent('terminal_clear', { serverId }, serverId);
      job.status = 'completed';
      job.exitCode = 0;
      job.endTime = new Date().toISOString();
      job.durationMs = 2;
      jobHistory.unshift({ ...job, output: [...job.output] });
      broadcastWSEvent('job_finished', { jobId, serverId, exitCode: 0, durationMs: 2, status: 'completed' }, serverId);
      broadcastWSEvent('terminal_exit', { serverId, exitCode: 0, cwd: relCwdDisplay, jobId }, serverId);
      return job;
    }

    // Terminate any previous command on this server
    const existing = activeTerminals.get(serverId);
    if (existing) {
      addLine('system', `[nodepanel-term] Terminating previous command (${existing.command})...`);
      killProcessTree(existing.process, 'SIGINT');
    }

    // Cancel any already running jobs on this server
    for (const [id, rj] of runningJobs.entries()) {
      if (rj.job.serverId === serverId && rj.job.status === 'running') {
        cancelJob(id);
      }
    }

    try {
      const child = spawn(command, {
        shell: true,
        cwd: currentCwd,
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          ...server.env_vars,
          PORT: String(server.port || 3400),
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      job.pid = child.pid;

      const termSession: ActiveTerminalProcess = {
        process: child,
        serverId,
        command,
        startTime: Date.now(),
        cwd: currentCwd,
      };
      activeTerminals.set(serverId, termSession);

      const runningRecord: RunningJobRecord = {
        job,
        process: child,
        intentionalKill: false,
      };

      if (timeoutMs > 0) {
        runningRecord.timeoutTimer = setTimeout(() => {
          if (job.status === 'running') {
            addLine('stderr', `[nodepanel] Command timed out after ${Math.round(timeoutMs / 1000)}s`);
            job.status = 'timed_out';
            cancelJob(jobId);
          }
        }, timeoutMs);
      }

      runningJobs.set(jobId, runningRecord);

      broadcastWSEvent('job_started', { job }, serverId);
      broadcastWSEvent(
        'terminal_start',
        {
          serverId,
          command,
          pid: child.pid,
          cwd: relCwdDisplay,
          jobId,
        },
        serverId
      );

      const handleChunk = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
        const raw = chunk.toString('utf-8');
        const lines = raw.split(/\r?\n/);
        for (const l of lines) {
          if (l.includes('\r')) {
            const parts = l.split('\r');
            const lastPart = parts[parts.length - 1];
            if (lastPart.length > 0) {
              addLine(stream, lastPart);
            }
          } else if (l.length > 0) {
            addLine(stream, l);
          }
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => handleChunk('stdout', chunk));
      child.stderr?.on('data', (chunk: Buffer) => handleChunk('stderr', chunk));

      child.on('error', (err) => {
        addLine('stderr', `[nodepanel-term] Spawn error: ${err.message}`);
      });

      child.on('exit', (code, signal) => {
        if (runningRecord.timeoutTimer) {
          clearTimeout(runningRecord.timeoutTimer);
        }
        runningJobs.delete(jobId);
        if (activeTerminals.get(serverId) === termSession) {
          activeTerminals.delete(serverId);
        }

        const durationMs = Date.now() - new Date(job.startTime).getTime();
        job.durationMs = durationMs;
        job.endTime = new Date().toISOString();
        job.signal = signal;

        if (runningRecord.intentionalKill) {
          job.status = 'cancelled';
          job.exitCode = code !== null ? code : 130;
          addLine('system', `[process cancelled by user (${job.exitCode}) in ${(durationMs / 1000).toFixed(1)}s]`);
        } else if (job.status === 'timed_out') {
          job.exitCode = 124;
          addLine('system', `[process timed out after ${(durationMs / 1000).toFixed(1)}s]`);
        } else if (code === 0) {
          job.status = 'completed';
          job.exitCode = 0;
          addLine('system', `[process exited with code 0 in ${(durationMs / 1000).toFixed(1)}s]`);
        } else {
          job.status = 'failed';
          job.exitCode = code !== null ? code : 1;
          addLine(
            'system',
            `[process exited with code ${job.exitCode}${signal ? ` (${signal})` : ''} in ${(durationMs / 1000).toFixed(1)}s]`
          );
        }

        jobHistory.unshift({ ...job, output: [...job.output] });
        if (jobHistory.length > MAX_JOB_HISTORY) {
          jobHistory.pop();
        }

        broadcastWSEvent(
          'job_finished',
          {
            jobId,
            serverId,
            exitCode: job.exitCode,
            signal,
            durationMs,
            status: job.status,
          },
          serverId
        );

        broadcastWSEvent(
          'terminal_exit',
          {
            serverId,
            exitCode: job.exitCode,
            signal,
            cwd: relCwdDisplay,
            jobId,
          },
          serverId
        );
      });

      return job;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown spawn error';
      addLine('stderr', `[nodepanel-term] Failed to start command: ${msg}`);
      job.status = 'failed';
      job.exitCode = 1;
      job.endTime = new Date().toISOString();
      job.durationMs = 5;
      jobHistory.unshift({ ...job, output: [...job.output] });
      broadcastWSEvent('job_finished', { jobId, serverId, exitCode: 1, durationMs: 5, status: 'failed' }, serverId);
      broadcastWSEvent('terminal_exit', { serverId, exitCode: 1, cwd: relCwdDisplay, jobId }, serverId);
      return job;
    }
  }

  function cancelJob(jobId: string): boolean {
    const rj = runningJobs.get(jobId);
    if (!rj) return false;
    rj.intentionalKill = true;
    killProcessTree(rj.process, 'SIGINT');
    const timer = setTimeout(() => {
      if (runningJobs.has(jobId)) {
        killProcessTree(rj.process, 'SIGKILL');
      }
    }, 1800);
    timer.unref?.();
    return true;
  }

  function getJob(jobId: string, sinceSeq?: number): { job: JobModel; lines: JobOutputLine[] } | null {
    const rj = runningJobs.get(jobId);
    const found = rj ? rj.job : jobHistory.find((j) => j.id === jobId);
    if (!found) return null;
    const since = typeof sinceSeq === 'number' ? sinceSeq : 0;
    const lines = found.output ? found.output.filter((l) => l.seq > since) : [];
    return { job: found, lines };
  }

  function listJobs(serverId?: string, status?: JobStatus): JobModel[] {
    const all: JobModel[] = [];
    for (const rj of runningJobs.values()) {
      if ((!serverId || rj.job.serverId === serverId) && (!status || rj.job.status === status)) {
        all.push(rj.job);
      }
    }
    for (const h of jobHistory) {
      if ((!serverId || h.serverId === serverId) && (!status || h.status === status)) {
        if (!all.some((j) => j.id === h.id)) {
          all.push(h);
        }
      }
    }
    return all;
  }

  function executeTerminalCommand(serverId: string, commandText: string): JobModel | undefined {
    const trimmed = commandText.trim();
    if (!trimmed) return undefined;
    return startJob({ serverId, command: trimmed, category: 'command' });
  }

  function killTerminalCommand(serverId: string): void {
    let killed = false;
    for (const [jobId, rj] of runningJobs.entries()) {
      if (rj.job.serverId === serverId && rj.job.status === 'running') {
        cancelJob(jobId);
        killed = true;
      }
    }

    const session = activeTerminals.get(serverId);
    if (session && !killed) {
      broadcastWSEvent(
        'terminal_data',
        {
          serverId,
          stream: 'system',
          text: '^C [nodepanel-term] Sending SIGINT to process group...',
        },
        serverId
      );
      killProcessTree(session.process, 'SIGINT');
      const killTimer = setTimeout(() => {
        if (activeTerminals.get(serverId) === session) {
          killProcessTree(session.process, 'SIGKILL');
        }
      }, 1500);
      killTimer.unref?.();
    }
  }

  function findAvailablePort(startPort = 3001): number {
    const used = new Set<number>([3000, boundPort]);
    for (const s of store.listServers()) {
      if (s.port) used.add(s.port);
    }
    let p = Math.max(1024, startPort);
    while (used.has(p) && p < 65534) {
      p++;
    }
    return p;
  }

  function readServerLogsFromFile(serverId: string): LogLine[] {
    let logFile: string;
    try {
      logFile = safeResolveServerPath(serverId, 'logs/server.log');
    } catch {
      return [];
    }
    if (!fs.existsSync(logFile)) return [];
    try {
      const stat = fs.statSync(logFile);
      const maxRead = 256 * 1024;
      let content = '';
      if (stat.size > maxRead) {
        const fd = fs.openSync(logFile, 'r');
        try {
          const buf = Buffer.alloc(maxRead);
          fs.readSync(fd, buf, 0, maxRead, stat.size - maxRead);
          content = buf.toString('utf-8');
        } finally {
          fs.closeSync(fd);
        }
      } else {
        content = fs.readFileSync(logFile, 'utf-8');
      }
      const lines = content
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .slice(-500);
      return lines.map((line) => {
        const parsed = line.match(/^\[([^\]]+)\]\[(stdout|stderr|system)\]\s?(.*)$/);
        if (parsed) {
          return {
            timestamp: parsed[1],
            stream: parsed[2] as 'stdout' | 'stderr' | 'system',
            text: parsed[3],
          };
        }
        return {
          timestamp: stat.mtime.toISOString(),
          stream: 'file',
          text: line,
        };
      });
    } catch {
      return [];
    }
  }

  // --- Express Application Setup ---
  const app = express();
  app.disable('x-powered-by');

  // Security headers (iframe-compatible for AI Studio preview)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const origin = req.headers.origin;
    const effectiveHost = (req.headers['x-forwarded-host'] as string) || req.headers.host;

    if (origin) {
      if (!isOriginAllowed(origin, effectiveHost)) {
        if (req.path.startsWith('/api')) {
          return res.status(403).json({
            error: true,
            code: 'FORBIDDEN_ORIGIN',
            message: 'Cross-origin request denied by security policy',
          });
        }
        return res.status(403).end();
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  // Sliding-window API rate limiter + optional API_SECRET_KEY authentication
  app.use('/api', (req, res, next) => {
    const now = Date.now();
    const clientIp = req.ip || req.socket.remoteAddress || 'local';
    let bucket = rateBuckets.get(clientIp);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60_000 };
      rateBuckets.set(clientIp, bucket);
    }
    bucket.count += 1;
    if (bucket.count > rateLimitMax) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({
        error: true,
        code: 'RATE_LIMITED',
        message: 'Too many API requests. Please wait before retrying.',
      });
    }

    if (apiSecretKey && req.path !== '/health') {
      const authHeader = req.headers.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const headerKey = (req.headers['x-api-key'] as string | undefined)?.trim() || '';
      const provided = bearerToken || headerKey;

      if (!provided || provided !== apiSecretKey) {
        return res.status(401).json({
          error: true,
          code: 'UNAUTHORIZED',
          message: 'Valid authentication credentials are required.',
        });
      }
    }

    next();
  });

  const server = http.createServer(app);

  // --- API Routes ---

  app.get('/api/health', (_req: Request, res: Response) => {
    const env = detectEnvironment();
    res.json({
      status: 'healthy',
      version: '1.0.0',
      uptime_seconds: Math.floor(process.uptime()),
      environment: env.type,
      active_servers: activeProcesses.size,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/runtime', (_req: Request, res: Response) => {
    res.json(detectEnvironment());
  });

  app.get('/api/activity', (_req: Request, res: Response) => {
    res.json(store.listActivities());
  });

  app.get('/api/packages', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pkgs = await Promise.all(
        Object.values(PACKAGE_REGISTRY).map(async (spec) => {
          const copy: PackageSpec = { ...spec, pkg_map: { ...spec.pkg_map } };
          const p = lookPathFast(spec.executable);
          if (p) {
            copy.installed = true;
            copy.path = p;
            copy.version = await getToolVersionAsync(p);
          } else {
            copy.installed = false;
          }
          return copy;
        })
      );

      res.json({
        packages: pkgs,
        is_busy: isPackageOpBusy,
        active_op: activePackageOp,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/packages/install', async (req: Request, res: Response) => {
    const packageId = typeof req.body?.package_id === 'string' ? req.body.package_id.trim() : '';
    if (!packageId || !Object.prototype.hasOwnProperty.call(PACKAGE_REGISTRY, packageId)) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_PACKAGE',
        message: 'Valid package_id from the supported registry is required',
      });
    }
    if (isPackageOpBusy) {
      return res.status(409).json({
        error: true,
        code: 'PACKAGE_OP_BUSY',
        message: 'Another package operation is currently in progress',
      });
    }

    const spec = PACKAGE_REGISTRY[packageId];
    const env = detectEnvironment();
    const pkgMgr = env.package_manager;

    if (!pkgMgr || pkgMgr === 'none') {
      return res.status(400).json({
        error: true,
        code: 'NO_PACKAGE_MANAGER',
        message: 'No supported system package manager (pkg, apt-get, pacman, apk) available.',
        output: 'Operation aborted: no supported package manager.',
      });
    }

    const pkgName = spec.pkg_map[pkgMgr] || spec.id;
    let bin = pkgMgr;
    let args: string[] = ['install', '-y', pkgName];
    if (pkgMgr === 'pacman') {
      bin = 'pacman';
      args = ['-S', '--noconfirm', pkgName];
    } else if (pkgMgr === 'apk') {
      bin = 'apk';
      args = ['add', pkgName];
    }

    isPackageOpBusy = true;
    activePackageOp = `install:${packageId}`;
    let logOutput = `[nodepanel-pkg] Installing ${spec.name} (${bin} ${args.join(' ')})...\n`;

    try {
      const result = await runCommandAsync(bin, args, { timeoutMs: 300_000 });
      versionCache.clear();
      cachedStaticEnv = null;
      logOutput += `${result.output}\n[nodepanel-pkg] Successfully installed ${spec.name}.`;
      store.recordActivity('install_package', '', `Installed package ${packageId}`, 'success');
      return res.json({ success: true, output: logOutput });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Package installation failed';
      const cmdOut = (err as { output?: string })?.output || '';
      logOutput += `${cmdOut}\n[nodepanel-pkg] Error: ${msg}`;
      store.recordActivity('install_package', '', `Failed installing ${packageId}: ${msg}`, 'failed');
      return res.status(400).json({
        error: true,
        code: 'PACKAGE_INSTALL_FAILED',
        message: msg,
        output: logOutput,
      });
    } finally {
      isPackageOpBusy = false;
      activePackageOp = '';
    }
  });

  app.post('/api/packages/uninstall', async (req: Request, res: Response) => {
    const packageId = typeof req.body?.package_id === 'string' ? req.body.package_id.trim() : '';
    if (packageId === 'git') {
      return res.status(400).json({
        error: true,
        code: 'PROTECTED_PACKAGE',
        message: 'Uninstalling git is disabled for system safety.',
      });
    }
    if (!packageId || !Object.prototype.hasOwnProperty.call(PACKAGE_REGISTRY, packageId)) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_PACKAGE',
        message: 'Valid package_id from the supported registry is required',
      });
    }
    if (isPackageOpBusy) {
      return res.status(409).json({
        error: true,
        code: 'PACKAGE_OP_BUSY',
        message: 'Another package operation is currently in progress',
      });
    }

    const spec = PACKAGE_REGISTRY[packageId];
    const env = detectEnvironment();
    const pkgMgr = env.package_manager;

    if (!pkgMgr || pkgMgr === 'none') {
      return res.status(400).json({
        error: true,
        code: 'NO_PACKAGE_MANAGER',
        message: 'No supported system package manager available',
      });
    }

    const pkgName = spec.pkg_map[pkgMgr] || spec.id;
    let bin = pkgMgr;
    let args: string[] = ['remove', '-y', pkgName];
    if (pkgMgr === 'pkg') {
      bin = 'pkg';
      args = ['uninstall', '-y', pkgName];
    } else if (pkgMgr === 'pacman') {
      bin = 'pacman';
      args = ['-R', '--noconfirm', pkgName];
    } else if (pkgMgr === 'apk') {
      bin = 'apk';
      args = ['del', pkgName];
    }

    isPackageOpBusy = true;
    activePackageOp = `uninstall:${packageId}`;
    let logOutput = `[nodepanel-pkg] Removing ${spec.name}...\n`;

    try {
      const result = await runCommandAsync(bin, args, { timeoutMs: 180_000 });
      versionCache.clear();
      cachedStaticEnv = null;
      logOutput += `${result.output}\n[nodepanel-pkg] Removed ${spec.name}.`;
      store.recordActivity('uninstall_package', '', `Uninstalled package ${packageId}`, 'success');
      return res.json({ success: true, output: logOutput });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Package removal failed';
      const cmdOut = (err as { output?: string })?.output || '';
      logOutput += `${cmdOut}\n[nodepanel-pkg] Error: ${msg}`;
      return res.status(400).json({
        error: true,
        code: 'PACKAGE_REMOVE_FAILED',
        message: msg,
        output: logOutput,
      });
    } finally {
      isPackageOpBusy = false;
      activePackageOp = '';
    }
  });

  // Git Clone (Command-Injection Hardened with shell: false + strict URL/branch validation)
  app.post('/api/git/clone', async (req: Request, res: Response) => {
    const rawRepoUrl = typeof req.body?.repo_url === 'string' ? req.body.repo_url.trim() : '';
    const rawBranch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : '';
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const autoInstall = Boolean(req.body?.auto_install);

    if (!rawRepoUrl) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_REPO_URL',
        message: 'Repository URL is required',
      });
    }

    if (
      rawRepoUrl.length > 512 ||
      rawRepoUrl.startsWith('-') ||
      !SAFE_GIT_URL_REGEX.test(rawRepoUrl)
    ) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_REPO_URL',
        message: 'Repository URL must use https://, git@, ssh://, or file:// without shell metacharacters',
      });
    }

    if (
      rawBranch &&
      (rawBranch.startsWith('-') || rawBranch.includes('..') || !SAFE_GIT_BRANCH_REGEX.test(rawBranch))
    ) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_GIT_BRANCH',
        message: 'Invalid branch name format',
      });
    }

    const serverId = `srv-${Math.floor(Date.now() / 1000) % 100000}-${crypto.randomBytes(4).toString('hex')}`;
    const srvDir = safeResolveServerPath(serverId, '');
    fs.mkdirSync(srvDir, { recursive: true });

    let output = `[nodepanel-git] Cloning repository ${rawRepoUrl}...\n`;

    try {
      const cloneArgs = ['clone', '--depth', '1'];
      if (rawBranch) {
        cloneArgs.push('--branch', rawBranch);
      }
      cloneArgs.push('--', rawRepoUrl, srvDir);

      const cloneRes = await runCommandAsync('git', cloneArgs, {
        timeoutMs: 180_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      if (cloneRes.output) output += `${cloneRes.output}\n`;
      output += `[nodepanel-git] Repository cloned into ${serverId}.\n`;

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
          const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
            main?: string;
            scripts?: { start?: string };
          };
          if (pkgJson.main && typeof pkgJson.main === 'string') {
            try {
              const resolvedMain = safeResolveServerPath(serverId, pkgJson.main);
              if (fs.existsSync(resolvedMain)) {
                entryFile = pkgJson.main.replace(/^[./\\]+/, '') || 'index.js';
              }
            } catch {
              // Ignore unsafe package.json main
            }
          } else if (pkgJson.scripts?.start) {
            entryFile = 'npm start';
          }
        } catch {
          // Ignore malformed package.json
        }
      }

      if (autoInstall && fs.existsSync(pkgPath)) {
        output += '[nodepanel-git] Running npm install...\n';
        try {
          const npmRes = await runCommandAsync('npm', ['install', '--no-audit', '--no-fund'], {
            cwd: srvDir,
            timeoutMs: 300_000,
          });
          output += `${npmRes.output}\n`;
        } catch (npmErr: unknown) {
          const msg = npmErr instanceof Error ? npmErr.message : String(npmErr);
          output += `[nodepanel-git] Warning: npm install reported an issue: ${msg}\n`;
        }
      }

      const assignedPort = findAvailablePort(3001);
      const inferredName =
        rawName ||
        rawRepoUrl
          .split('/')
          .pop()
          ?.replace(/\.git$/i, '')
          ?.slice(0, 64) ||
        'Git Server';

      const srv: ServerModel = {
        id: serverId,
        name: inferredName,
        description: `Cloned from ${rawRepoUrl}${rawBranch ? ` (${rawBranch})` : ''}`,
        port: assignedPort,
        entry_file: entryFile,
        start_script: 'start',
        status: 'created',
        auto_restart: 'never',
        env_vars: {
          PORT: String(assignedPort),
          NODE_ENV: 'production',
        },
        repo_url: rawRepoUrl,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_exit_code: 0,
      };

      store.saveServer(srv);
      store.recordActivity('git_clone', serverId, `Cloned repository ${rawRepoUrl}`, 'success');

      return res.status(201).json({
        success: true,
        server: srv,
        output,
      });
    } catch (err: unknown) {
      fs.rmSync(srvDir, { recursive: true, force: true });
      const msg = err instanceof Error ? err.message : 'Git clone failed';
      output += `\n[nodepanel-git] Clone failed: ${msg}`;
      store.recordActivity('git_clone', serverId, `Clone failed: ${msg}`, 'failed');
      return res.status(400).json({
        error: true,
        code: 'GIT_CLONE_FAILED',
        message: msg,
        output,
      });
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

  app.post('/api/servers', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, port, entry_file, auto_restart, env_vars, template } = req.body || {};
      const cleanName = typeof name === 'string' ? name.trim() : '';
      if (!cleanName || cleanName.length > 64) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_NAME',
          message: 'Server name is required (1–64 characters)',
        });
      }

      let assignedPort = findAvailablePort(3001);
      if (port !== undefined && port !== null && port !== '') {
        const parsedPort = Number(port);
        if (!Number.isInteger(parsedPort) || parsedPort < 1024 || parsedPort > 65535 || parsedPort === 3000) {
          return res.status(400).json({
            error: true,
            code: 'INVALID_PORT',
            message: 'Port must be an integer between 1024 and 65535 (excluding reserved port 3000)',
          });
        }
        assignedPort = parsedPort;
      }

      const serverId = `srv-${Math.floor(Date.now() / 1000) % 100000}-${crypto.randomBytes(4).toString('hex')}`;
      const srvDir = safeResolveServerPath(serverId, '');
      fs.mkdirSync(srvDir, { recursive: true });

      let validatedEntry: string;
      try {
        validatedEntry = validateEntryCommand(serverId, typeof entry_file === 'string' ? entry_file : 'index.js').cleanEntry;
      } catch (err) {
        fs.rmSync(srvDir, { recursive: true, force: true });
        throw err;
      }

      seedServerTemplate(srvDir, typeof template === 'string' ? template : 'blank', cleanName, assignedPort);

      const safeEnv: Record<string, string> = {};
      if (env_vars && typeof env_vars === 'object') {
        for (const [k, v] of Object.entries(env_vars)) {
          const key = k.trim();
          if (SAFE_ENV_KEY_REGEX.test(key)) {
            safeEnv[key] = String(v ?? '');
          }
        }
      }
      safeEnv.PORT = String(assignedPort);
      safeEnv.NODE_ENV = safeEnv.NODE_ENV || 'production';

      const nowIso = new Date().toISOString();
      const srv: ServerModel = {
        id: serverId,
        name: cleanName,
        description: typeof description === 'string' ? description.trim().slice(0, 300) : '',
        port: assignedPort,
        entry_file: validatedEntry,
        start_script: 'start',
        status: 'created',
        auto_restart: autoRestartPolicyValid(auto_restart) ? auto_restart : 'never',
        env_vars: safeEnv,
        created_at: nowIso,
        updated_at: nowIso,
        last_exit_code: 0,
        metrics: {
          pid: 0,
          status: 'created',
          uptime_sec: 0,
          memory_mb: 0,
          cpu_percent: 0,
        },
      };

      store.saveServer(srv);
      store.recordActivity(
        'create_server',
        serverId,
        `Created server '${cleanName}' on port ${assignedPort}`,
        'success'
      );

      return res.status(201).json(srv);
    } catch (err) {
      next(err);
    }
  });

  // Server Details, Update, & Delete
  app.get('/api/servers/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const srv = store.getServer(id);
      if (!srv) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      const ap = activeProcesses.get(srv.id);
      const recentLogs = ap ? [...ap.logs] : readServerLogsFromFile(srv.id);

      return res.json({
        ...srv,
        metrics: getProcessMetrics(srv.id),
        recent_logs: recentLogs,
      });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/servers/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const srv = store.getServer(id);
      if (!srv) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      const { name, description, port, entry_file, auto_restart, env_vars } = req.body || {};

      if (name !== undefined) {
        const cleanName = typeof name === 'string' ? name.trim() : '';
        if (!cleanName || cleanName.length > 64) {
          return res.status(400).json({
            error: true,
            code: 'INVALID_NAME',
            message: 'Server name must be between 1 and 64 characters',
          });
        }
        srv.name = cleanName;
      }

      if (description !== undefined && typeof description === 'string') {
        srv.description = description.trim().slice(0, 300);
      }

      if (port !== undefined) {
        const parsedPort = Number(port);
        if (!Number.isInteger(parsedPort) || parsedPort < 1024 || parsedPort > 65535 || parsedPort === 3000) {
          return res.status(400).json({
            error: true,
            code: 'INVALID_PORT',
            message: 'Port must be an integer between 1024 and 65535 (excluding 3000)',
          });
        }
        srv.port = parsedPort;
      }

      if (entry_file !== undefined) {
        if (typeof entry_file !== 'string') {
          return res.status(400).json({ error: true, code: 'INVALID_ENTRY', message: 'Invalid entry_file' });
        }
        srv.entry_file = validateEntryCommand(id, entry_file).cleanEntry;
      }

      if (auto_restart !== undefined) {
        if (!autoRestartPolicyValid(auto_restart)) {
          return res.status(400).json({
            error: true,
            code: 'INVALID_RESTART_POLICY',
            message: 'auto_restart must be never, on-failure, or always',
          });
        }
        srv.auto_restart = auto_restart;
      }

      if (env_vars && typeof env_vars === 'object') {
        const safeEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries(env_vars)) {
          const cleanKey = k.trim();
          if (SAFE_ENV_KEY_REGEX.test(cleanKey)) {
            safeEnv[cleanKey] = String(v ?? '');
          }
        }
        srv.env_vars = safeEnv;
      }

      store.saveServer(srv);
      store.recordActivity('update_server', id, `Updated configuration for '${srv.name}'`, 'success');
      return res.json({
        ...srv,
        metrics: getProcessMetrics(srv.id),
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/servers/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const srv = store.getServer(id);
      if (!srv) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      await withServerLock(id, async () => {
        clearSupervisorTimers(id, true);
        await stopServerProcessInternal(id);
        killTerminalCommand(id);

        const srvDir = safeResolveServerPath(id, '');
        store.deleteServer(id);
        supervisorStates.delete(id);
        serverWorkingDirs.delete(id);

        try {
          fs.rmSync(srvDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      });

      store.recordActivity('delete_server', id, `Deleted server '${srv.name}'`, 'success');
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // Serialized Server Process Lifecycle Controls
  app.post('/api/servers/:id/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      await withServerLock(id, () => startServerProcessInternal(id, false));
      return res.json({ success: true, status: 'running' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/stop', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      await withServerLock(id, () => stopServerProcessInternal(id));
      store.recordActivity('stop_server', id, 'Server stopped gracefully', 'success');
      return res.json({ success: true, status: 'stopped' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/restart', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      await withServerLock(id, async () => {
        await stopServerProcessInternal(id);
        await new Promise((r) => setTimeout(r, 250));
        await startServerProcessInternal(id, false);
      });
      store.recordActivity('restart_server', id, 'Server restarted cleanly', 'success');
      return res.json({ success: true, status: 'running' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/install', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const srv = store.getServer(id);
      if (!srv) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      // Prevent concurrent npm install on the same server
      for (const rj of runningJobs.values()) {
        if (rj.job.serverId === id && rj.job.category === 'install' && rj.job.status === 'running') {
          return res.status(409).json({
            error: true,
            code: 'INSTALL_IN_PROGRESS',
            message: 'Dependency installation is already running on this server',
            jobId: rj.job.id,
          });
        }
      }

      const job = startJob({
        serverId: id,
        command: 'npm install --no-audit --no-fund',
        category: 'install',
        timeoutMs: 300_000,
      });

      store.recordActivity('npm_install', id, `Started npm install job for '${srv.name}'`, 'success');

      if (req.query.wait === 'true') {
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            const current = getJob(job.id);
            if (!current || current.job.status !== 'running') {
              clearInterval(check);
              resolve();
            }
          }, 150);
        });
        const finished = getJob(job.id);
        const out = finished?.lines.map((l) => l.text).join('\n') || '';
        return res.json({ success: finished?.job.status === 'completed', jobId: job.id, output: out });
      }

      return res.status(202).json({
        success: true,
        jobId: job.id,
        job,
        output: 'npm install started',
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/servers/:id/logs', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      const ap = activeProcesses.get(id);
      const logs = ap ? [...ap.logs] : readServerLogsFromFile(id);
      return res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  // --- Environment Auto-detection & Storage (.env.example & .env) ---
  app.get('/api/servers/:id/env', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const srv = store.getServer(id);
      if (!srv) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      const examplePath = safeResolveServerPath(id, '.env.example');
      const actualEnvPath = safeResolveServerPath(id, '.env');

      const hasExample = fs.existsSync(examplePath);
      const hasEnv = fs.existsSync(actualEnvPath);

      let exampleRaw = '';
      let envRaw = '';

      const exampleVars = new Map<string, { exampleValue: string; comment: string }>();
      const actualVars = new Map<string, string>();

      if (hasExample) {
        try {
          exampleRaw = fs.readFileSync(examplePath, 'utf-8');
          let pendingComment = '';
          for (const line of exampleRaw.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) {
              pendingComment =
                (pendingComment ? `${pendingComment} ` : '') + trimmed.replace(/^#+\s*/, '');
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
        } catch {
          // Ignore read error
        }
      }

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
        } catch {
          // Ignore read error
        }
      } else if (srv.env_vars) {
        for (const [k, v] of Object.entries(srv.env_vars)) {
          actualVars.set(k, v);
        }
      }

      const variables: Array<{
        key: string;
        value: string;
        example_value?: string;
        comment?: string;
        source: 'both' | 'example' | 'custom';
      }> = [];

      const processedKeys = new Set<string>();

      for (const [key, meta] of exampleVars.entries()) {
        processedKeys.add(key);
        const inActual = actualVars.has(key);
        const actualVal = inActual ? actualVars.get(key)! : '';
        const proposedVal = actualVal !== '' ? actualVal : meta.exampleValue || '';

        variables.push({
          key,
          value: proposedVal,
          example_value: meta.exampleValue,
          comment: meta.comment,
          source: inActual ? 'both' : 'example',
        });
      }

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

      return res.json({
        has_example: hasExample,
        has_env: hasEnv,
        variables,
        example_raw: exampleRaw,
        env_raw: envRaw,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/env', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const srv = store.getServer(id);
      if (!srv) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      const { variables } = req.body || {};
      if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_ENV_PAYLOAD',
          message: 'variables dictionary object is required',
        });
      }

      const srvDir = safeResolveServerPath(id, '');
      fs.mkdirSync(srvDir, { recursive: true });
      const actualEnvPath = safeResolveServerPath(id, '.env');

      const lines: string[] = [
        `# Environment Configuration for ${srv.name}`,
        `# Updated at: ${new Date().toISOString()}`,
        '',
      ];

      const cleanVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(variables)) {
        const cleanKey = k.trim();
        if (!cleanKey) continue;
        if (!SAFE_ENV_KEY_REGEX.test(cleanKey)) {
          return res.status(400).json({
            error: true,
            code: 'INVALID_ENV_KEY',
            message: `Invalid environment variable key '${cleanKey}'`,
          });
        }
        const cleanVal = String(v ?? '').replace(/\0/g, '');
        cleanVars[cleanKey] = cleanVal;

        let formattedVal = cleanVal;
        if (cleanVal.includes(' ') || cleanVal.includes('\n') || cleanVal.includes('"') || cleanVal.includes('#')) {
          formattedVal = `"${cleanVal.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
        }
        lines.push(`${cleanKey}=${formattedVal}`);
      }

      const tmpEnv = `${actualEnvPath}.tmp.${crypto.randomUUID()}`;
      fs.writeFileSync(tmpEnv, lines.join('\n') + '\n', 'utf-8');
      fs.renameSync(tmpEnv, actualEnvPath);

      srv.env_vars = cleanVars;
      store.saveServer(srv);
      store.recordActivity(
        'update_env',
        id,
        `Updated environment variables (${Object.keys(cleanVars).length} entries)`,
        'success'
      );

      return res.json({ success: true, count: Object.keys(cleanVars).length });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/env/init-example', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const srv = store.getServer(id);
      if (!srv) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      const srvDir = safeResolveServerPath(id, '');
      fs.mkdirSync(srvDir, { recursive: true });
      const examplePath = safeResolveServerPath(id, '.env.example');

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

      fs.writeFileSync(examplePath, templateContent, 'utf-8');
      store.recordActivity('init_env_example', id, 'Initialized .env.example template', 'success');
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // --- Terminal REST Endpoints ---
  app.get('/api/servers/:id/terminal/info', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      const active = activeTerminals.get(id);
      const root = fs.realpathSync(safeResolveServerPath(id, ''));
      const cwd = getServerWorkingDir(id);
      const rel = path.relative(root, cwd) || '.';

      let activeJobId: string | undefined;
      for (const [jid, rj] of runningJobs.entries()) {
        if (rj.job.serverId === id && rj.job.status === 'running') {
          activeJobId = jid;
          break;
        }
      }

      return res.json({
        isRunning: Boolean(active),
        currentCommand: active ? active.command : '',
        cwd: rel,
        activeJobId,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/terminal/exec', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
      if (!command) {
        return res.status(400).json({ error: true, code: 'MISSING_COMMAND', message: 'command is required' });
      }
      const job = executeTerminalCommand(id, command);
      return res.json({ success: true, jobId: job?.id });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/terminal/kill', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      killTerminalCommand(id);
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // --- Background Jobs REST Endpoints ---
  app.get('/api/jobs', (req: Request, res: Response) => {
    const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : undefined;
    const status = typeof req.query.status === 'string' ? (req.query.status as JobStatus) : undefined;
    const jobs = listJobs(serverId, status);
    return res.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        serverId: j.serverId,
        serverName: j.serverName,
        command: j.command,
        category: j.category,
        status: j.status,
        startTime: j.startTime,
        endTime: j.endTime,
        durationMs: j.durationMs,
        exitCode: j.exitCode,
        signal: j.signal,
        cwd: j.cwd,
        lineCount: j.output.length,
        lastLine: j.output[j.output.length - 1]?.text ?? '',
      })),
    });
  });

  app.get('/api/jobs/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const sinceSeq = req.query.sinceSeq ? Number(req.query.sinceSeq) : undefined;
    const result = getJob(jobId, sinceSeq);
    if (!result) {
      return res.status(404).json({ error: true, code: 'JOB_NOT_FOUND', message: 'Job not found' });
    }
    return res.json({
      job: result.job,
      lines: result.lines,
    });
  });

  app.post('/api/jobs/:jobId/cancel', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const cancelled = cancelJob(jobId);
    if (!cancelled) {
      return res.status(404).json({ error: true, code: 'JOB_NOT_RUNNING', message: 'Job not found or already stopped' });
    }
    return res.json({ success: true, message: 'Job cancelled' });
  });

  app.post('/api/servers/:id/jobs/run', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
      if (!command) {
        return res.status(400).json({ error: true, code: 'MISSING_COMMAND', message: 'command is required' });
      }
      const category = (req.body?.category as JobCategory) || 'command';
      const job = startJob({ serverId: id, command, category });
      return res.status(202).json({ success: true, jobId: job.id, job });
    } catch (err) {
      next(err);
    }
  });

  // --- Server Files & Sandboxed File Manager Operations ---
  app.get('/api/servers/:id/files', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const relPath = typeof req.query.path === 'string' ? req.query.path : '';
      const isContent = req.query.content === 'true';

      if (!store.getServer(id)) {
        assertValidServerId(id);
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }

      const target = safeResolveServerPath(id, relPath);
      if (isContent) {
        if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
          return res.status(404).json({ error: true, code: 'FILE_NOT_FOUND', message: 'File not found' });
        }
        const stat = fs.statSync(target);
        if (stat.size > 2 * 1024 * 1024) {
          return res.status(413).json({
            error: true,
            code: 'FILE_TOO_LARGE',
            message: 'File exceeds 2 MB editor limit; download the file instead.',
          });
        }
        const content = fs.readFileSync(target, 'utf-8');
        return res.json({ path: relPath, content });
      }

      if (!fs.existsSync(target)) {
        return res.json([]);
      }

      const root = safeResolveServerPath(id, '');
      const dirEntries = fs.readdirSync(target, { withFileTypes: true });
      const files: FileEntry[] = dirEntries.map((ent) => {
        const fullChild = path.join(target, ent.name);
        let size = 0;
        let modTime = new Date().toISOString();
        let isDir = ent.isDirectory();
        try {
          const lstat = fs.lstatSync(fullChild);
          size = lstat.size;
          modTime = lstat.mtime.toISOString();
          isDir = lstat.isDirectory();
        } catch {
          // Ignore transient stat error
        }
        const relFromRoot = path.relative(root, fullChild).split(path.sep).join('/');
        return {
          name: ent.name,
          path: relFromRoot,
          is_dir: isDir,
          size,
          mod_time: modTime,
        };
      });

      files.sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      });

      return res.json(files);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/files', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      const filePath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      if (!filePath) {
        return res.status(400).json({ error: true, code: 'INVALID_PATH', message: 'path is required' });
      }

      const root = safeResolveServerPath(id, '');
      const target = safeResolveServerPath(id, filePath);
      if (target === root) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_PATH',
          message: 'Cannot overwrite server root directory',
        });
      }

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf-8');
      store.recordActivity('write_file', id, `Saved file ${filePath}`, 'success');
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/servers/:id/files', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
      if (!filePath) {
        return res.status(400).json({ error: true, code: 'INVALID_PATH', message: 'path is required' });
      }

      const root = safeResolveServerPath(id, '');
      const target = safeResolveServerPath(id, filePath);
      if (target === root) {
        return res.status(400).json({
          error: true,
          code: 'PROTECTED_ROOT',
          message: 'Cannot delete server root workspace',
        });
      }

      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        store.recordActivity('delete_file', id, `Deleted ${filePath}`, 'success');
      }
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/files/rename', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      const oldPath = typeof req.body?.old_path === 'string' ? req.body.old_path.trim() : '';
      const newPath = typeof req.body?.new_path === 'string' ? req.body.new_path.trim() : '';
      if (!oldPath || !newPath) {
        return res.status(400).json({
          error: true,
          code: 'INVALID_PATH',
          message: 'old_path and new_path are required',
        });
      }

      const root = safeResolveServerPath(id, '');
      const oldTarget = safeResolveServerPath(id, oldPath);
      const newTarget = safeResolveServerPath(id, newPath);
      if (oldTarget === root || newTarget === root) {
        return res.status(400).json({ error: true, code: 'PROTECTED_ROOT', message: 'Cannot rename root directory' });
      }

      if (!fs.existsSync(oldTarget)) {
        return res.status(404).json({ error: true, code: 'FILE_NOT_FOUND', message: 'Source path does not exist' });
      }

      fs.mkdirSync(path.dirname(newTarget), { recursive: true });
      fs.renameSync(oldTarget, newTarget);
      store.recordActivity('rename_file', id, `Renamed ${oldPath} to ${newPath}`, 'success');
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/servers/:id/files/mkdir', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      const dirPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
      if (!dirPath) {
        return res.status(400).json({ error: true, code: 'INVALID_PATH', message: 'path is required' });
      }

      const target = safeResolveServerPath(id, dirPath);
      fs.mkdirSync(target, { recursive: true });
      store.recordActivity('mkdir', id, `Created folder ${dirPath}`, 'success');
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/servers/:id/files/download', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      assertValidServerId(id);
      if (!store.getServer(id)) {
        return res.status(404).json({ error: true, code: 'SERVER_NOT_FOUND', message: 'Server not found' });
      }
      const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
      if (!filePath) {
        return res.status(400).json({ error: true, code: 'INVALID_PATH', message: 'path query parameter is required' });
      }

      const target = safeResolveServerPath(id, filePath);
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        return res.status(404).json({ error: true, code: 'FILE_NOT_FOUND', message: 'File not found' });
      }
      return res.download(target, path.basename(target));
    } catch (err) {
      next(err);
    }
  });

  // Catch-all for unknown /api/* routes (always returns JSON, never HTML)
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: true,
      code: 'API_NOT_FOUND',
      message: 'Requested API endpoint does not exist',
    });
  });

  // Sanitized JSON error boundary for Express routes
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (err instanceof HttpError) {
      return res.status(err.statusCode).json({
        error: true,
        code: err.code,
        message: err.message,
      });
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      return res.status(400).json({
        error: true,
        code: 'INVALID_JSON',
        message: 'Malformed JSON request body',
      });
    }
    console.error('[PanelServer] Unhandled route error:', err);
    return res.status(500).json({
      error: true,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected server error occurred',
    });
  });

  // --- WebSocket Server ---
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  server.on('upgrade', (request, socket, head) => {
    const rawUrl = request.url || '';
    const pathname = rawUrl.split('?')[0];
    if (pathname !== '/ws' && pathname !== '/api/ws') {
      return; // Allow Vite HMR upgrade handler (when enabled) to inspect non-/ws paths
    }

    const origin = request.headers.origin;
    const effectiveHost = (request.headers['x-forwarded-host'] as string) || request.headers.host;
    if (!isOriginAllowed(origin, effectiveHost)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    if (apiSecretKey) {
      let queryToken = '';
      try {
        const parsedUrl = new URL(rawUrl, 'http://localhost');
        queryToken = parsedUrl.searchParams.get('token') || '';
      } catch {
        // Ignore URL parse error
      }
      const authHeader = request.headers.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const token = bearerToken || queryToken;
      if (token !== apiSecretKey) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    const meta: WsClientMeta = {
      subscriptions: new Set(),
      isAlive: true,
      seenRequestIds: [],
    };
    wsClients.set(ws, meta);

    ws.on('pong', () => {
      meta.isAlive = true;
    });

    ws.send(JSON.stringify({ event: 'connected', data: { time: new Date().toISOString() } }));

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString()) as {
          action?: string;
          serverId?: string;
          command?: string;
          data?: string;
          requestId?: string;
        };

        if (!payload || typeof payload.action !== 'string') return;

        // Idempotency guard: prevent duplicate execution if a client retries a message with same requestId
        if (payload.requestId && typeof payload.requestId === 'string') {
          if (meta.seenRequestIds.includes(payload.requestId)) {
            return;
          }
          meta.seenRequestIds.push(payload.requestId);
          if (meta.seenRequestIds.length > 100) {
            meta.seenRequestIds.shift();
          }
        }

        if (payload.action === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', data: { time: new Date().toISOString() } }));
          return;
        }

        if (payload.action === 'subscribe' && payload.serverId) {
          assertValidServerId(payload.serverId);
          meta.subscriptions.add(payload.serverId);

          if (store.getServer(payload.serverId)) {
            const root = fs.realpathSync(safeResolveServerPath(payload.serverId, ''));
            const cwd = getServerWorkingDir(payload.serverId);
            const rel = path.relative(root, cwd) || '.';
            const activeTerm = activeTerminals.get(payload.serverId);
            let activeJob: JobModel | undefined;
            for (const rj of runningJobs.values()) {
              if (rj.job.serverId === payload.serverId && rj.job.status === 'running') {
                activeJob = rj.job;
                break;
              }
            }

            ws.send(
              JSON.stringify({
                event: 'terminal_state',
                data: {
                  serverId: payload.serverId,
                  cwd: rel,
                  isRunning: Boolean(activeTerm || activeJob),
                  currentCommand: activeTerm ? activeTerm.command : activeJob ? activeJob.command : '',
                  activeJobId: activeJob ? activeJob.id : undefined,
                  job: activeJob,
                },
              })
            );
          }
        } else if (payload.action === 'unsubscribe' && payload.serverId) {
          meta.subscriptions.delete(payload.serverId);
        } else if (payload.action === 'stdin' && payload.serverId) {
          assertValidServerId(payload.serverId);
          const ap = activeProcesses.get(payload.serverId);
          if (ap && ap.process.stdin && !ap.process.stdin.destroyed) {
            ap.process.stdin.write(String(payload.data ?? '') + '\n');
          }
        } else if (payload.action === 'terminal_exec' && payload.serverId && payload.command) {
          assertValidServerId(payload.serverId);
          executeTerminalCommand(payload.serverId, String(payload.command));
        } else if (payload.action === 'terminal_kill' && payload.serverId) {
          assertValidServerId(payload.serverId);
          killTerminalCommand(payload.serverId);
        } else if (payload.action === 'terminal_stdin' && payload.serverId) {
          assertValidServerId(payload.serverId);
          const term = activeTerminals.get(payload.serverId);
          if (term && term.process.stdin && !term.process.stdin.destroyed) {
            term.process.stdin.write(String(payload.data ?? '') + '\n');
          }
        }
      } catch {
        // Safely ignore malformed or invalid WS payloads without disconnecting healthy sessions
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
    });

    ws.on('error', () => {
      wsClients.delete(ws);
    });
  });

  const wsHeartbeatTimer = setInterval(() => {
    for (const [ws, meta] of wsClients.entries()) {
      if (!meta.isAlive) {
        wsClients.delete(ws);
        try {
          ws.terminate();
        } catch {
          // Ignore
        }
        continue;
      }
      meta.isAlive = false;
      try {
        ws.ping();
      } catch {
        // Ignore
      }
    }
  }, 25_000);
  wsHeartbeatTimer.unref?.();

  let viteCloseFn: (() => Promise<void>) | null = null;

  if (enableVite) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
        watch: {
          ignored: [
            '**/data/**',
            '**/*.log',
            '**/coverage/**',
            '**/test-results/**',
            '**/playwright-report/**',
          ],
        },
      },
      appType: 'spa',
    });
    viteCloseFn = () => vite.close();
    app.use(vite.middlewares);
  } else if (serveStatic) {
    const distDir = path.join(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        boundPort = addr.port;
      }
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(configuredPort, host);
  });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    isShuttingDown = true;

    clearInterval(wsHeartbeatTimer);

    for (const id of supervisorStates.keys()) {
      clearSupervisorTimers(id, true);
    }

    const stopPromises: Promise<void>[] = [];
    for (const id of Array.from(activeProcesses.keys())) {
      stopPromises.push(stopServerProcessInternal(id));
    }
    await Promise.allSettled(stopPromises);

    for (const [, term] of activeTerminals.entries()) {
      killProcessTree(term.process, 'SIGKILL');
    }
    activeTerminals.clear();

    for (const [, rj] of runningJobs.entries()) {
      killProcessTree(rj.process, 'SIGKILL');
    }
    runningJobs.clear();

    for (const [ws] of wsClients.entries()) {
      try {
        ws.close();
      } catch {
        // Ignore
      }
    }
    wsClients.clear();

    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });

    if (viteCloseFn) {
      await viteCloseFn().catch(() => {});
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    app,
    server,
    wss,
    port: boundPort,
    dataDir,
    close,
    getActiveProcessCount: () => activeProcesses.size,
    getActivePids: () => Array.from(activeProcesses.values()).map((ap) => ap.pid).filter((pid) => pid > 0),
  };
}

// Auto-start when executed directly via `tsx server.ts` or `node server.ts`
const isDirectRun =
  process.env.VITEST !== 'true' &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  createPanelServer()
    .then((instance) => {
      console.log(`[Termux NodePanel] Server listening at http://0.0.0.0:${instance.port}`);

      const shutdown = () => {
        instance
          .close()
          .catch(() => {})
          .finally(() => process.exit(0));
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('[Termux NodePanel] Failed to start server:', err);
      process.exit(1);
    });
}
