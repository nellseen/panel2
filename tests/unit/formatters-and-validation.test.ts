import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCpuPercent,
  formatMemoryMB,
  formatStorageMB,
  formatTimestampFull,
  formatTimestampTime,
  formatUptime,
} from '../../src/utils/formatters';
import {
  validateEntryFile,
  validateEnvKey,
  validateGitBranch,
  validateGitRepoUrl,
  validatePort,
  validateRelativeEntryName,
  validateServerName,
} from '../../src/utils/validation';

describe('Telemetry & metric formatters (null/NaN crash regression coverage)', () => {
  it('formats memory safely without throwing on null, undefined, NaN, or negative values', () => {
    expect(formatMemoryMB(null)).toBe('—');
    expect(formatMemoryMB(undefined)).toBe('—');
    expect(formatMemoryMB(Number.NaN)).toBe('—');
    expect(formatMemoryMB(-5)).toBe('—');
    expect(formatMemoryMB(0)).toBe('0.0 MB');
    expect(formatMemoryMB(42.36)).toBe('42.4 MB');
    expect(formatMemoryMB(2048)).toBe('2.00 GB');
  });

  it('formats storage, CPU, uptime, bytes, and timestamps accurately', () => {
    expect(formatStorageMB(null)).toBe('—');
    expect(formatStorageMB(512)).toBe('512 MB');
    expect(formatStorageMB(2560)).toBe('2.5 GB');

    expect(formatCpuPercent(null)).toBe('—');
    expect(formatCpuPercent(undefined)).toBe('—');
    expect(formatCpuPercent(12.34)).toBe('12.3%');

    expect(formatUptime(null)).toBe('—');
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(125)).toBe('2m 5s');
    expect(formatUptime(3665)).toBe('1h 1m');
    expect(formatUptime(90000)).toBe('1d 1h');

    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');

    expect(formatTimestampTime(undefined)).toBe('—');
    expect(formatTimestampTime('not-a-date')).toBe('—');
    expect(formatTimestampTime('2026-01-15T10:20:30.000Z')).not.toBe('—');

    expect(formatTimestampFull(undefined)).toBe('—');
    expect(formatTimestampFull('invalid')).toBe('—');
    expect(formatTimestampFull('2026-01-15T10:20:30.000Z')).not.toBe('—');
  });
});

describe('Security & input validation helpers', () => {
  it('validates server names', () => {
    expect(validateServerName('')).toMatch(/required/i);
    expect(validateServerName('a')).toMatch(/at least 2/i);
    expect(validateServerName('x'.repeat(65))).toMatch(/exceed 64/i);
    expect(validateServerName('Billing Worker')).toBeNull();
  });

  it('validates port boundaries and blocks reserved panel port 3000', () => {
    expect(validatePort('')).not.toBeNull();
    expect(validatePort('abc')).not.toBeNull();
    expect(validatePort(80)).not.toBeNull();
    expect(validatePort(70000)).not.toBeNull();
    expect(validatePort(3000)).toMatch(/reserved/i);
    expect(validatePort('3000')).toMatch(/reserved/i);
    expect(validatePort(3001)).toBeNull();
    expect(validatePort('8080')).toBeNull();
  });

  it('rejects path traversal, leading flags, and shell metacharacters in entry files', () => {
    expect(validateEntryFile('')).not.toBeNull();
    expect(validateEntryFile('../server.js')).not.toBeNull();
    expect(validateEntryFile('/etc/passwd')).not.toBeNull();
    expect(validateEntryFile('--inspect=0.0.0.0')).not.toBeNull();
    expect(validateEntryFile('index.js; rm -rf /')).not.toBeNull();
    expect(validateEntryFile('index.js | cat /etc/passwd')).not.toBeNull();

    expect(validateEntryFile('index.js')).toBeNull();
    expect(validateEntryFile('src/server.js')).toBeNull();
    expect(validateEntryFile('npm start')).toBeNull();
  });

  it('rejects git clone command-injection & option-injection vectors', () => {
    expect(validateGitRepoUrl('')).not.toBeNull();
    expect(validateGitRepoUrl('--upload-pack=touch /tmp/pwned')).not.toBeNull();
    expect(validateGitRepoUrl('https://github.com/org/repo.git; id')).not.toBeNull();
    expect(validateGitRepoUrl('https://github.com/org/repo.git`whoami`')).not.toBeNull();

    expect(validateGitRepoUrl('https://github.com/expressjs/express.git')).toBeNull();
    expect(validateGitRepoUrl('git@github.com:expressjs/express.git')).toBeNull();
    expect(validateGitRepoUrl('file:///tmp/local-repo.git')).toBeNull();

    expect(validateGitBranch('')).toBeNull();
    expect(validateGitBranch('main')).toBeNull();
    expect(validateGitBranch('feature/auth-v2')).toBeNull();
    expect(validateGitBranch('--orphan')).not.toBeNull();
    expect(validateGitBranch('main..HEAD')).not.toBeNull();
  });

  it('validates environment variable keys and relative file/folder names', () => {
    expect(validateEnvKey('')).not.toBeNull();
    expect(validateEnvKey('123_BAD')).not.toBeNull();
    expect(validateEnvKey('BAD-KEY')).not.toBeNull();
    expect(validateEnvKey('DATABASE_URL')).toBeNull();
    expect(validateEnvKey('_INTERNAL_TOKEN_2')).toBeNull();

    expect(validateRelativeEntryName('', 'File name')).toMatch(/File name is required/);
    expect(validateRelativeEntryName('../secret.txt')).not.toBeNull();
    expect(validateRelativeEntryName('nested/file.js')).not.toBeNull();
    expect(validateRelativeEntryName('/etc/hosts')).not.toBeNull();
    expect(validateRelativeEntryName('routes.js')).toBeNull();
  });
});
