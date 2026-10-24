import {
  ServerModel,
  EnvironmentInfo,
  PackageSpec,
  ActivityLog,
  CreateServerPayload,
  FileEntry,
  LogLine,
  EnvInspectResult,
} from '../types';

const BASE_URL = '/api';

export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

export async function fetchRuntime(): Promise<EnvironmentInfo> {
  const res = await fetch(`${BASE_URL}/runtime`);
  if (!res.ok) throw new Error(`Failed to fetch runtime: ${res.statusText}`);
  return res.json();
}

export async function fetchServers(): Promise<ServerModel[]> {
  const res = await fetch(`${BASE_URL}/servers`);
  if (!res.ok) throw new Error(`Failed to fetch servers: ${res.statusText}`);
  return res.json();
}

export async function createServer(payload: CreateServerPayload): Promise<ServerModel> {
  const res = await fetch(`${BASE_URL}/servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to create server');
  }
  return res.json();
}

export async function fetchServer(id: string): Promise<ServerModel & { recent_logs?: LogLine[] }> {
  const res = await fetch(`${BASE_URL}/servers/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch server: ${res.statusText}`);
  return res.json();
}

export async function updateServer(id: string, payload: Partial<ServerModel>): Promise<ServerModel> {
  const res = await fetch(`${BASE_URL}/servers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update server: ${res.statusText}`);
  return res.json();
}

export async function deleteServer(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/servers/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete server: ${res.statusText}`);
}

export async function startServer(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/servers/${id}/start`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to start server');
  }
  return res.json();
}

export async function stopServer(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/servers/${id}/stop`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to stop server');
  }
  return res.json();
}

export async function restartServer(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/servers/${id}/restart`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to restart server');
  }
  return res.json();
}

export async function installServerDeps(id: string): Promise<{ success: boolean; output: string }> {
  const res = await fetch(`${BASE_URL}/servers/${id}/install`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to install dependencies');
  }
  return data;
}

export async function fetchServerLogs(id: string): Promise<LogLine[]> {
  const res = await fetch(`${BASE_URL}/servers/${id}/logs`);
  if (!res.ok) throw new Error(`Failed to fetch logs: ${res.statusText}`);
  return res.json();
}

// --- File Operations ---
export async function fetchServerFiles(id: string, subPath: string = ''): Promise<FileEntry[]> {
  const q = subPath ? `?path=${encodeURIComponent(subPath)}` : '';
  const res = await fetch(`${BASE_URL}/servers/${id}/files${q}`);
  if (!res.ok) throw new Error(`Failed to list files: ${res.statusText}`);
  return res.json();
}

export async function readServerFile(id: string, filePath: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/servers/${id}/files?path=${encodeURIComponent(filePath)}&content=true`);
  if (!res.ok) throw new Error(`Failed to read file: ${res.statusText}`);
  const data = await res.json();
  return data.content;
}

export async function writeServerFile(id: string, filePath: string, content: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/servers/${id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  if (!res.ok) throw new Error(`Failed to save file: ${res.statusText}`);
}

export async function deleteServerFile(id: string, filePath: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/servers/${id}/files?path=${encodeURIComponent(filePath)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete file: ${res.statusText}`);
}

export async function renameServerFile(id: string, oldPath: string, newPath: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/servers/${id}/files/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to rename');
  }
}

export async function createServerDirectory(id: string, dirPath: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/servers/${id}/files/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to create directory');
  }
}

export function getServerFileDownloadUrl(id: string, filePath: string): string {
  return `${BASE_URL}/servers/${id}/files/download?path=${encodeURIComponent(filePath)}`;
}

// --- Environment Variable Operations (.env.example & .env) ---
export async function fetchServerEnv(id: string): Promise<EnvInspectResult> {
  const res = await fetch(`${BASE_URL}/servers/${id}/env`);
  if (!res.ok) throw new Error(`Failed to inspect environment: ${res.statusText}`);
  return res.json();
}

export async function saveServerEnv(id: string, variables: Record<string, string>): Promise<{ success: boolean; count: number }> {
  const res = await fetch(`${BASE_URL}/servers/${id}/env`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to save .env file');
  }
  return res.json();
}

export async function initServerEnvExample(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/servers/${id}/env/init-example`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to initialize .env.example');
  }
  return res.json();
}

// --- Terminal Operations ---
export async function fetchTerminalInfo(id: string): Promise<{ isRunning: boolean; cwd: string; currentCommand: string }> {
  const res = await fetch(`${BASE_URL}/servers/${id}/terminal/info`);
  if (!res.ok) throw new Error(`Failed to fetch terminal info`);
  return res.json();
}

export async function cloneGitRepo(payload: {
  repo_url: string;
  branch?: string;
  name?: string;
  auto_install?: boolean;
}): Promise<{ success: boolean; server: ServerModel; output: string }> {
  const res = await fetch(`${BASE_URL}/git/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Git clone failed');
  }
  return data;
}

export async function fetchPackages(): Promise<{
  packages: PackageSpec[];
  is_busy: boolean;
  active_op: string;
}> {
  const res = await fetch(`${BASE_URL}/packages`);
  if (!res.ok) throw new Error(`Failed to fetch packages: ${res.statusText}`);
  return res.json();
}

export async function installPackage(package_id: string): Promise<{ success: boolean; output: string }> {
  const res = await fetch(`${BASE_URL}/packages/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package_id }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to install system package');
  }
  return data;
}

export async function uninstallPackage(package_id: string): Promise<{ success: boolean; output: string }> {
  const res = await fetch(`${BASE_URL}/packages/uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package_id }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to uninstall package');
  }
  return data;
}

export async function fetchActivities(): Promise<ActivityLog[]> {
  const res = await fetch(`${BASE_URL}/activity`);
  if (!res.ok) throw new Error(`Failed to fetch activity logs: ${res.statusText}`);
  return res.json();
}

// WebSocket client manager
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  public isConnected = false;
  private reconnectTimer: any = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('connection', { status: 'open' });
      };

      this.ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.event) {
            this.emit(packet.event, packet.data);
          }
        } catch (e) {
          // ignore non-json messages
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('connection', { status: 'closed' });
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (e) {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  subscribeServer(serverId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'subscribe', serverId }));
    }
  }

  unsubscribeServer(serverId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'unsubscribe', serverId }));
    }
  }

  sendStdin(serverId: string, data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'stdin', serverId, data }));
    }
  }

  // --- Real Terminal Actions ---
  sendTerminalExec(serverId: string, command: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'terminal_exec', serverId, command }));
    }
  }

  sendTerminalKill(serverId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'terminal_kill', serverId }));
    }
  }

  sendTerminalStdin(serverId: string, data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'terminal_stdin', serverId, data }));
    }
  }

  sendTerminalCd(serverId: string, path: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'terminal_cd', serverId, path }));
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off(event: string, callback: (data: any) => void) {
    const list = this.listeners.get(event);
    if (list) {
      list.delete(callback);
    }
  }

  private emit(event: string, data: any) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((cb) => cb(data));
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsClient = new WebSocketClient();
