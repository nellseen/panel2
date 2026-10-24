export function formatMemoryMB(memoryMb: number | null | undefined): string {
  if (memoryMb === null || memoryMb === undefined || !Number.isFinite(memoryMb) || memoryMb < 0) {
    return '—';
  }
  if (memoryMb >= 1024) {
    return `${(memoryMb / 1024).toFixed(2)} GB`;
  }
  return `${memoryMb.toFixed(1)} MB`;
}

export function formatStorageMB(storageMb: number | null | undefined): string {
  if (storageMb === null || storageMb === undefined || !Number.isFinite(storageMb) || storageMb < 0) {
    return '—';
  }
  if (storageMb >= 1024) {
    return `${(storageMb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(storageMb)} MB`;
}

export function formatCpuPercent(cpuPercent: number | null | undefined): string {
  if (cpuPercent === null || cpuPercent === undefined || !Number.isFinite(cpuPercent) || cpuPercent < 0) {
    return '—';
  }
  return `${cpuPercent.toFixed(1)}%`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const total = Math.floor(seconds);
  if (total < 60) return `${total}s`;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${secs}s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

export function formatTimestampTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatTimestampFull(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
