const RESERVED_PANEL_PORTS = new Set([3000]);

export function validateServerName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Server name is required.';
  }
  if (trimmed.length < 2) {
    return 'Server name must be at least 2 characters.';
  }
  if (trimmed.length > 64) {
    return 'Server name must not exceed 64 characters.';
  }
  return null;
}

export function validatePort(
  port: number | string,
  reservedPorts: Iterable<number> = RESERVED_PANEL_PORTS
): string | null {
  const raw = typeof port === 'string' ? port.trim() : String(port);
  if (!raw || !/^\d+$/.test(raw)) {
    return 'Port must be an integer between 1024 and 65535.';
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    return 'Port must be an integer between 1024 and 65535.';
  }
  for (const r of reservedPorts) {
    if (parsed === r) {
      return `Port ${parsed} is reserved by the main NodePanel server.`;
    }
  }
  return null;
}

export function validateEntryFile(entryFile: string): string | null {
  const trimmed = entryFile.trim();
  if (!trimmed) {
    return 'Entry script or command is required.';
  }
  if (trimmed.startsWith('-') || trimmed.includes('..') || trimmed.startsWith('/')) {
    return 'Entry script must stay relative to the server directory.';
  }
  if (/[;&|`$<>]/.test(trimmed)) {
    return 'Entry script contains disallowed shell metacharacters.';
  }
  return null;
}

export function validateGitRepoUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return 'Repository URL is required.';
  }
  if (trimmed.startsWith('-')) {
    return 'Invalid repository URL.';
  }
  const isSafeProtocol = /^(https?:\/\/|git@[a-zA-Z0-9.-]+:|ssh:\/\/|file:\/\/)[^\s;|&$`<>'"]+$/i.test(trimmed);
  if (!isSafeProtocol) {
    return 'Provide a valid HTTPS, SSH, or file Git repository URL without shell metacharacters.';
  }
  return null;
}

export function validateGitBranch(branch: string): string | null {
  const trimmed = branch.trim();
  if (!trimmed) return null; // optional
  if (trimmed.startsWith('-') || trimmed.includes('..') || !/^[a-zA-Z0-9._/-]{1,120}$/.test(trimmed)) {
    return 'Branch name contains invalid characters.';
  }
  return null;
}

export function validateEnvKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) {
    return 'Variable name is required.';
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(trimmed)) {
    return 'Variable name must start with a letter or underscore and use letters, numbers, or underscores.';
  }
  return null;
}

export function validateRelativeEntryName(name: string, label = 'Name'): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return `${label} is required.`;
  }
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    return `${label} cannot contain path separators or traversal segments.`;
  }
  if (/[\0<>:"|?*]/.test(trimmed)) {
    return `${label} contains invalid filesystem characters.`;
  }
  return null;
}
