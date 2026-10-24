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

export interface EnvironmentInfo {
  type: 'android_native' | 'ubuntu_proot' | 'linux_generic' | 'unknown';
  type_name: string;
  os: string;
  arch: string;
  kernel: string;
  hostname: string;
  distro: string;
  distro_version: string;
  prefix: string;
  system_version?: string;
  is_proot: boolean;
  package_manager: string;
  executables: Record<string, string>;
  capabilities: string[];
  limitations: string[];
  disk_free_mb: number;
  memory_total_mb: number;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  action: string;
  server_id: string;
  details: string;
  status: 'success' | 'failed' | 'warning';
}

export interface CreateServerPayload {
  name: string;
  description?: string;
  port?: number;
  entry_file?: string;
  auto_restart?: AutoRestartPolicy;
  env_vars?: Record<string, string>;
  template?: 'blank' | 'express_api' | 'basic_http' | 'background_worker';
  repo_url?: string;
  branch?: string;
}

export interface EnvVariableInfo {
  key: string;
  value: string;
  example_value?: string;
  comment?: string;
  source: 'both' | 'example' | 'custom';
}

export interface EnvInspectResult {
  has_example: boolean;
  has_env: boolean;
  variables: EnvVariableInfo[];
  example_raw?: string;
  env_raw?: string;
}

export interface TerminalLine {
  id: string;
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system' | 'command' | 'file';
  text: string;
}

export interface TerminalState {
  isRunning: boolean;
  currentCommand: string;
  cwd: string;
  exitCode: number | null;
}
