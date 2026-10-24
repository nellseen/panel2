import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  FileCode,
  Folder,
  FolderPlus,
  FolderTree,
  GitBranch,
  KeyRound,
  MoreVertical,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Send,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  AutoRestartPolicy,
  EnvInspectResult,
  FileEntry,
  JobOutputLine,
  LogLine,
  PendingServerAction,
  ServerModel,
  ServerStatus,
  TerminalLine,
  ToastItem,
} from '../types';
import {
  createServerDirectory,
  deleteServerFile,
  fetchJobs,
  fetchServer,
  fetchServerEnv,
  fetchServerFiles,
  fetchServerLogs,
  getServerFileDownloadUrl,
  initServerEnvExample,
  installServerDeps,
  readServerFile,
  renameServerFile,
  saveServerEnv,
  updateServer,
  writeServerFile,
  wsClient,
} from '../services/api';
import { TerminalOutput } from './TerminalOutput';
import {
  Alert,
  Badge,
  Button,
  Card,
  CodeText,
  ConfirmDialog,
  DropdownMenu,
  IconButton,
  Input,
  MetaRow,
  Modal,
  PageHeader,
  PasswordInput,
  Select,
  Skeleton,
  StatusPill,
  Switch,
  Tabs,
  Textarea,
} from './ui';
import {
  canRestartServer,
  canStartServer,
  canStopServer,
  applyServerStatusUpdate,
} from '../utils/serverLifecycle';
import {
  formatBytes,
  formatCpuPercent,
  formatMemoryMB,
  formatTimestampTime,
  formatUptime,
} from '../utils/formatters';
import {
  validateEntryFile,
  validateEnvKey,
  validatePort,
  validateRelativeEntryName,
  validateServerName,
} from '../utils/validation';
import { isAbortError, normalizeError } from '../utils/errors';

export interface ServerDetailViewProps {
  serverId: string;
  initialServer?: ServerModel | null;
  pendingAction?: PendingServerAction;
  onBack: () => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
  onNotify?: (title: string, variant?: ToastItem['variant'], description?: string) => void;
}

type DetailTab = 'terminal' | 'files' | 'env' | 'logs' | 'settings' | 'git';

export const ServerDetailView: React.FC<ServerDetailViewProps> = ({
  serverId,
  initialServer = null,
  pendingAction,
  onBack,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onNotify,
}) => {
  const [fetchedServer, setFetchedServer] = useState<ServerModel | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('terminal');
  const [loading, setLoading] = useState(!initialServer);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const initialServerRef = useRef<ServerModel | null>(initialServer);
  useEffect(() => {
    initialServerRef.current = initialServer;
  }, [initialServer]);

  const server: ServerModel | null =
    fetchedServer && fetchedServer.id === serverId
      ? initialServer && initialServer.id === serverId && initialServer.status === fetchedServer.status
        ? { ...fetchedServer, metrics: initialServer.metrics ?? fetchedServer.metrics }
        : fetchedServer
      : initialServer && initialServer.id === serverId
        ? initialServer
        : null;

  const notify = useCallback(
    (title: string, variant: ToastItem['variant'] = 'success', description?: string) => {
      onNotify?.(title, variant, description);
    },
    [onNotify]
  );

  // --- TAB 1: Live Interactive Terminal ---
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    {
      id: 'init-1',
      timestamp: new Date().toISOString(),
      stream: 'system',
      text: '[nodepanel-terminal] Interactive session ready. Workspace sandboxed to server root.',
    },
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isTerminalRunning, setIsTerminalRunning] = useState(false);
  const [currentRunningCmd, setCurrentRunningCmd] = useState('');
  const [terminalCwd, setTerminalCwd] = useState('.');

  // --- TAB 2: File Manager ---
  const [currentPath, setCurrentPath] = useState('');
  const [fileList, setFileList] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [fileDirty, setFileDirty] = useState(false);

  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameNewName, setRenameNewName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);

  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileError, setNewFileError] = useState<string | null>(null);

  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

  // --- TAB 3: Environment (.env & .env.example) ---
  const [envData, setEnvData] = useState<EnvInspectResult | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [envDescriptions, setEnvDescriptions] = useState<Record<string, string>>({});
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  const [newEnvError, setNewEnvError] = useState<string | null>(null);
  const [deleteEnvKey, setDeleteEnvKey] = useState<string | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(false);

  // --- TAB 4: Daemon Logs ---
  const [appLogs, setAppLogs] = useState<LogLine[]>([]);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsBottomRef = useRef<HTMLDivElement>(null);

  // --- TAB 5: Lifecycle Settings ---
  const [cfgName, setCfgName] = useState(initialServer?.name ?? '');
  const [cfgDesc, setCfgDesc] = useState(initialServer?.description ?? '');
  const [cfgPort, setCfgPort] = useState(String(initialServer?.port ?? 3001));
  const [cfgEntry, setCfgEntry] = useState(initialServer?.entry_file ?? 'index.js');
  const [cfgAutoRestart, setCfgAutoRestart] = useState<AutoRestartPolicy>(
    initialServer?.auto_restart ?? 'never'
  );
  const [cfgErrors, setCfgErrors] = useState<Record<string, string>>({});
  const [isSavingCfg, setIsSavingCfg] = useState(false);

  const [showDeleteServerModal, setShowDeleteServerModal] = useState(false);
  const [isInstallingDeps, setIsInstallingDeps] = useState(false);

  const seenLogHashesRef = useRef<Set<string>>(new Set());
  const initialLogsSeededRef = useRef(false);
  const configSeededForIdRef = useRef<string | null>(null);

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [srv, logs] = await Promise.all([
          fetchServer(serverId, { signal }),
          fetchServerLogs(serverId, { signal }),
        ]);

        setFetchedServer(srv);
        setSyncWarning(null);

        if (configSeededForIdRef.current !== srv.id) {
          configSeededForIdRef.current = srv.id;
          setCfgName(srv.name);
          setCfgDesc(srv.description || '');
          setCfgPort(String(srv.port));
          setCfgEntry(srv.entry_file);
          setCfgAutoRestart(srv.auto_restart);
        }

        setAppLogs(logs || []);

        if (!initialLogsSeededRef.current && logs && logs.length > 0) {
          initialLogsSeededRef.current = true;
          const seeded: TerminalLine[] = [];
          for (let i = 0; i < logs.length; i++) {
            const l = logs[i];
            const hash = `${l.timestamp}_${l.text}`;
            seenLogHashesRef.current.add(hash);
            seeded.push({
              id: `seed-${i}-${hash}`,
              timestamp: l.timestamp,
              stream: l.stream,
              text: l.text,
            });
          }
          setTerminalLines((prev) => [...prev, ...seeded].slice(-1000));
        }
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        const msg = normalizeError(err, 'Failed to synchronize instance details').message;
        setSyncWarning(msg);
      } finally {
        setLoading(false);
      }
    },
    [serverId]
  );

  useEffect(() => {
    seenLogHashesRef.current.clear();
    initialLogsSeededRef.current = false;
    configSeededForIdRef.current = null;

    const controller = new AbortController();
    const initTimer = globalThis.setTimeout(() => {
      void loadData(controller.signal);
    }, 0);

    wsClient.subscribeServer(serverId);

    const unsubLog = wsClient.on<{
      server_id: string;
      timestamp?: string;
      stream?: 'stdout' | 'stderr' | 'system';
      text?: string;
    }>('log', (payload) => {
      if (payload?.server_id !== serverId) return;
      const text = payload.text || '';
      const timestamp = payload.timestamp || new Date().toISOString();
      const hash = `${timestamp}_${text}`;
      if (seenLogHashesRef.current.has(hash)) return;
      seenLogHashesRef.current.add(hash);

      const newLine: LogLine = {
        timestamp,
        stream: payload.stream || 'stdout',
        text,
      };
      setAppLogs((prev) => [...prev.slice(-999), newLine]);
      setTerminalLines((prev) => [
        ...prev.slice(-999),
        {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: newLine.timestamp,
          stream: newLine.stream,
          text: newLine.text,
        },
      ]);
    });

    const unsubStatus = wsClient.on<{
      server_id: string;
      new_status: ServerStatus;
      exit_code: number;
    }>('status', (payload) => {
      if (payload?.server_id !== serverId) return;
      setFetchedServer((prev) => {
        const initSrv = initialServerRef.current;
        const base =
          prev && prev.id === serverId ? prev : initSrv && initSrv.id === serverId ? initSrv : null;
        return base ? applyServerStatusUpdate(base, payload.new_status, payload.exit_code) : null;
      });
    });

    const unsubTermStart = wsClient.on<{
      serverId: string;
      command?: string;
      cwd?: string;
    }>('terminal_start', (payload) => {
      if (payload?.serverId !== serverId) return;
      setIsTerminalRunning(true);
      setCurrentRunningCmd(payload.command || '');
      if (payload.cwd) setTerminalCwd(payload.cwd);
    });

    const unsubTermData = wsClient.on<{
      serverId: string;
      stream?: TerminalLine['stream'];
      text?: string;
    }>('terminal_data', (payload) => {
      if (payload?.serverId !== serverId) return;
      setTerminalLines((prev) => [
        ...prev.slice(-999),
        {
          id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          stream: payload.stream || 'stdout',
          text: payload.text || '',
        },
      ]);
    });

    const unsubJobOutput = wsClient.on<{
      jobId: string;
      serverId: string;
      line: JobOutputLine;
    }>('job_output', (payload) => {
      if (payload?.serverId !== serverId) return;
      setTerminalLines((prev) => {
        const id = `job-${payload.jobId}-${payload.line.seq}`;
        if (prev.some((l) => l.id === id)) return prev;
        return [
          ...prev.slice(-999),
          {
            id,
            timestamp: payload.line.timestamp,
            stream: payload.line.stream === 'stderr' ? 'stderr' : 'stdout',
            text: payload.line.text,
          },
        ];
      });
    });

    const unsubTermExit = wsClient.on<{
      serverId: string;
      cwd?: string;
    }>('terminal_exit', (payload) => {
      if (payload?.serverId !== serverId) return;
      setIsTerminalRunning(false);
      setCurrentRunningCmd('');
      if (payload.cwd) setTerminalCwd(payload.cwd);
    });

    const unsubJobFinished = wsClient.on<{
      jobId: string;
      serverId: string;
      status: string;
    }>('job_finished', (payload) => {
      if (payload?.serverId !== serverId) return;
      setIsTerminalRunning(false);
      setCurrentRunningCmd('');
    });

    const unsubTermState = wsClient.on<{
      serverId: string;
      cwd?: string;
      isRunning?: boolean;
      currentCommand?: string;
    }>('terminal_state', (payload) => {
      if (payload?.serverId !== serverId) return;
      if (payload.cwd) setTerminalCwd(payload.cwd);
      setIsTerminalRunning(Boolean(payload.isRunning));
      setCurrentRunningCmd(payload.currentCommand || '');
    });

    const unsubTermClear = wsClient.on<{ serverId: string }>('terminal_clear', (payload) => {
      if (payload?.serverId === serverId) {
        setTerminalLines([]);
      }
    });

    const unsubReconnect = wsClient.on('reconnected', () => {
      void loadData();
    });

    // Hydrate existing/active jobs for this server so terminal doesn't lose logs across tabs
    void fetchJobs({ serverId }).then((res) => {
      if (!res?.jobs || res.jobs.length === 0) return;
      const activeOrRecent = res.jobs.find((j) => j.status === 'running' || j.status === 'queued') || res.jobs[0];
      if (activeOrRecent) {
        if (activeOrRecent.status === 'running' || activeOrRecent.status === 'queued') {
          setIsTerminalRunning(true);
          setCurrentRunningCmd(activeOrRecent.command);
        }
        if (activeOrRecent.output && activeOrRecent.output.length > 0) {
          const replayLines: TerminalLine[] = activeOrRecent.output.map((o) => ({
            id: `job-${activeOrRecent.id}-${o.seq}`,
            timestamp: o.timestamp,
            stream: o.stream === 'stderr' ? 'stderr' : 'stdout',
            text: o.text,
          }));
          setTerminalLines((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const fresh = replayLines.filter((l) => !existingIds.has(l.id));
            return [...prev, ...fresh].slice(-1000);
          });
        }
      }
    }).catch(() => {});

    return () => {
      globalThis.clearTimeout(initTimer);
      controller.abort();
      wsClient.unsubscribeServer(serverId);
      unsubLog();
      unsubStatus();
      unsubTermStart();
      unsubTermData();
      unsubJobOutput();
      unsubTermExit();
      unsubJobFinished();
      unsubTermState();
      unsubTermClear();
      unsubReconnect();
    };
  }, [loadData, serverId]);


  useEffect(() => {
    if (autoScrollLogs && activeTab === 'logs') {
      logsBottomRef.current?.scrollIntoView?.({ behavior: 'auto' });
    }
  }, [appLogs, autoScrollLogs, activeTab]);

  const loadFiles = useCallback(
    async (subPath: string, signal?: AbortSignal) => {
      try {
        setLoadingFiles(true);
        const files = await fetchServerFiles(serverId, subPath, { signal });
        setFileList(files);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        notify('Failed to read directory', 'error', normalizeError(err).message);
      } finally {
        setLoadingFiles(false);
      }
    },
    [notify, serverId]
  );

  const loadEnvironment = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoadingEnv(true);
        const res = await fetchServerEnv(serverId, { signal });
        setEnvData(res);

        const valMap: Record<string, string> = {};
        const descMap: Record<string, string> = {};
        for (const v of res.variables) {
          valMap[v.key] = v.value !== '' ? v.value : v.example_value || '';
          if (v.comment) descMap[v.key] = v.comment;
        }
        setEnvValues(valMap);
        setEnvDescriptions(descMap);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        notify('Failed to load .env configuration', 'error', normalizeError(err).message);
      } finally {
        setLoadingEnv(false);
      }
    },
    [notify, serverId]
  );

  useEffect(() => {
    if (activeTab !== 'files') return;
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      void loadFiles(currentPath, controller.signal);
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, currentPath, loadFiles]);

  useEffect(() => {
    if (activeTab !== 'env') return;
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      void loadEnvironment(controller.signal);
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, loadEnvironment]);

  // --- Terminal Actions ---
  const handleExecuteCommand = (commandOverride?: string) => {
    const cmd = (commandOverride ?? terminalInput).trim();
    if (!cmd) return;

    setTerminalHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 50));
    setHistoryIndex(-1);
    setTerminalInput('');

    const sent = wsClient.sendTerminalExec(serverId, cmd);
    if (!sent) {
      fetch(`/api/servers/${encodeURIComponent(serverId)}/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      }).catch((err: unknown) => {
        notify('Terminal command failed', 'error', normalizeError(err).message);
      });
    }
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (terminalHistory.length > 0) {
        const nextIdx = Math.min(historyIndex + 1, terminalHistory.length - 1);
        setHistoryIndex(nextIdx);
        setTerminalInput(terminalHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setTerminalInput(terminalHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setTerminalInput('');
      }
    }
  };

  const handleKillTerminal = () => {
    const sent = wsClient.sendTerminalKill(serverId);
    if (!sent) {
      fetch(`/api/servers/${encodeURIComponent(serverId)}/terminal/kill`, { method: 'POST' }).catch(
        () => {}
      );
    }
    notify('Sent SIGINT (^C) to terminal process', 'info');
  };

  // --- File Manager Actions ---
  const handleOpenFile = async (file: FileEntry) => {
    if (file.is_dir) {
      setCurrentPath(file.path);
      setSelectedFile(null);
      setFileDirty(false);
      return;
    }
    try {
      const content = await readServerFile(serverId, file.path);
      setSelectedFile(file.path);
      setFileContent(content);
      setFileDirty(false);
    } catch (err: unknown) {
      notify('Unable to open file', 'error', normalizeError(err).message);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    try {
      setIsSavingFile(true);
      await writeServerFile(serverId, selectedFile, fileContent);
      setFileDirty(false);
      notify(`Saved ${selectedFile.split('/').pop()}`, 'success');
      await loadFiles(currentPath);
    } catch (err: unknown) {
      notify('Failed to save file', 'error', normalizeError(err).message);
    } finally {
      setIsSavingFile(false);
    }
  };

  const handleConfirmCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateRelativeEntryName(newFileName, 'File name');
    if (err) {
      setNewFileError(err);
      return;
    }
    const clean = newFileName.trim();
    const target = currentPath ? `${currentPath}/${clean}` : clean;
    try {
      await writeServerFile(serverId, target, '');
      setShowNewFileModal(false);
      setNewFileName('');
      setNewFileError(null);
      await loadFiles(currentPath);
      setSelectedFile(target);
      setFileContent('');
      setFileDirty(false);
      notify(`Created ${clean}`, 'success');
    } catch (writeErr: unknown) {
      setNewFileError(normalizeError(writeErr).message);
    }
  };

  const handleConfirmCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateRelativeEntryName(newFolderName, 'Folder name');
    if (err) {
      setNewFolderError(err);
      return;
    }
    const clean = newFolderName.trim();
    const target = currentPath ? `${currentPath}/${clean}` : clean;
    try {
      await createServerDirectory(serverId, target);
      setShowNewFolderModal(false);
      setNewFolderName('');
      setNewFolderError(null);
      await loadFiles(currentPath);
      notify(`Created directory ${clean}`, 'success');
    } catch (mkdirErr: unknown) {
      setNewFolderError(normalizeError(mkdirErr).message);
    }
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const err = validateRelativeEntryName(renameNewName, 'New name');
    if (err) {
      setRenameError(err);
      return;
    }
    const clean = renameNewName.trim();
    const parent = currentPath ? `${currentPath}/` : '';
    const newPath = `${parent}${clean}`;
    try {
      await renameServerFile(serverId, renameTarget.path, newPath);
      if (selectedFile === renameTarget.path) {
        setSelectedFile(newPath);
      }
      setRenameTarget(null);
      setRenameNewName('');
      setRenameError(null);
      await loadFiles(currentPath);
      notify(`Renamed to ${clean}`, 'success');
    } catch (renErr: unknown) {
      setRenameError(normalizeError(renErr).message);
    }
  };

  const handleConfirmDeleteFile = async () => {
    if (!deleteTarget) return;
    try {
      await deleteServerFile(serverId, deleteTarget.path);
      if (selectedFile === deleteTarget.path) {
        setSelectedFile(null);
        setFileContent('');
        setFileDirty(false);
      }
      const deletedName = deleteTarget.name;
      setDeleteTarget(null);
      await loadFiles(currentPath);
      notify(`Deleted ${deletedName}`, 'info');
    } catch (delErr: unknown) {
      notify('Delete failed', 'error', normalizeError(delErr).message);
    }
  };

  const handleCopyPath = (filePath: string) => {
    navigator.clipboard?.writeText(filePath).catch(() => {});
    notify('Copied relative path', 'info', filePath);
  };

  // --- Environment Actions ---
  const handleApplyAllTemplates = () => {
    if (!envData) return;
    const updated = { ...envValues };
    let count = 0;
    for (const v of envData.variables) {
      if (v.example_value !== undefined && v.example_value !== '') {
        updated[v.key] = v.example_value;
        count++;
      }
    }
    setEnvValues(updated);
    notify(`Populated ${count} template values from .env.example`, 'info');
  };

  const handleApplyAndSaveTemplate = async () => {
    if (!envData) return;
    const updated = { ...envValues };
    for (const v of envData.variables) {
      if (v.example_value !== undefined && v.example_value !== '') {
        updated[v.key] = v.example_value;
      }
    }
    setEnvValues(updated);
    try {
      setIsSavingEnv(true);
      const res = await saveServerEnv(serverId, updated);
      notify(`Saved ${res.count} environment variables to .env`, 'success');
      await loadEnvironment();
    } catch (err: unknown) {
      notify('Failed to save .env', 'error', normalizeError(err).message);
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleSaveEnvironment = async () => {
    try {
      setIsSavingEnv(true);
      const res = await saveServerEnv(serverId, envValues);
      notify(`Saved ${res.count} variables to .env`, 'success');
      await loadEnvironment();
    } catch (err: unknown) {
      notify('Failed to save .env', 'error', normalizeError(err).message);
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleInitEnvExample = async () => {
    try {
      await initServerEnvExample(serverId);
      notify('Created .env.example template', 'success');
      await loadEnvironment();
    } catch (err: unknown) {
      notify('Failed to create .env.example', 'error', normalizeError(err).message);
    }
  };

  const handleAddEnvVariable = (e: React.FormEvent) => {
    e.preventDefault();
    const key = newEnvKey.trim().toUpperCase();
    const err = validateEnvKey(key);
    if (err) {
      setNewEnvError(err);
      return;
    }
    setNewEnvError(null);
    setEnvValues((prev) => ({ ...prev, [key]: newEnvVal }));
    setNewEnvKey('');
    setNewEnvVal('');
    notify(`Added ${key}`, 'info', 'Click Save to .env to persist changes.');
  };

  const handleConfirmDeleteEnv = () => {
    if (!deleteEnvKey) return;
    const removed = deleteEnvKey;
    setEnvValues((prev) => {
      const next = { ...prev };
      delete next[removed];
      return next;
    });
    setDeleteEnvKey(null);
    notify(`Removed ${removed}`, 'info', 'Click Save to .env to persist changes.');
  };

  // --- Settings & Dependencies ---
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const nameErr = validateServerName(cfgName);
    if (nameErr) errs.name = nameErr;
    const portErr = validatePort(cfgPort);
    if (portErr) errs.port = portErr;
    const entryErr = validateEntryFile(cfgEntry);
    if (entryErr) errs.entry = entryErr;

    setCfgErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      setIsSavingCfg(true);
      const updated = await updateServer(serverId, {
        name: cfgName.trim(),
        description: cfgDesc.trim(),
        port: Number(cfgPort),
        entry_file: cfgEntry.trim(),
        auto_restart: cfgAutoRestart,
      });
      setFetchedServer((prev) => (prev ? { ...prev, ...updated } : updated));
      notify('Configuration saved', 'success');
    } catch (err: unknown) {
      notify('Failed to save configuration', 'error', normalizeError(err).message);
    } finally {
      setIsSavingCfg(false);
    }
  };

  const handleRunNpmInstall = async () => {
    try {
      setIsInstallingDeps(true);
      notify('Starting npm install in background...', 'info');
      setActiveTab('terminal');
      const res = await installServerDeps(serverId);
      if (res?.jobId) {
        notify('npm install job spawned', 'info', `Job ID: ${res.jobId}`);
      }
      if (res?.output) {
        setTerminalLines((prev) => [
          ...prev.slice(-999),
          {
            id: `npm-${Date.now()}`,
            timestamp: new Date().toISOString(),
            stream: 'system',
            text: `[nodepanel-deps] npm install completed:\n${res.output}`,
          },
        ]);
      }
    } catch (err: unknown) {
      notify('npm install failed', 'error', normalizeError(err).message);
    } finally {
      setIsInstallingDeps(false);
    }
  };

  if (loading && !server) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-10 w-96 rounded-lg" />
        <Skeleton className="h-[460px] w-full rounded-xl" />
      </div>
    );
  }

  if (!server) {
    return (
      <Card padding="lg" className="space-y-4">
        <Alert variant="error" title="Instance unavailable">
          {syncWarning || `Server '${serverId}' could not be found.`}
        </Alert>
        <div>
          <Button variant="secondary" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Servers
          </Button>
        </div>
      </Card>
    );
  }

  const effectiveStatus =
    pendingAction === 'starting' || pendingAction === 'restarting'
      ? 'starting'
      : pendingAction === 'stopping'
      ? 'stopping'
      : server.status;

  const isRunning = server.status === 'running' && !pendingAction;
  const allowStart = canStartServer(server.status, pendingAction);
  const allowStop = canStopServer(server.status, pendingAction);
  const allowRestart = canRestartServer(server.status, pendingAction);

  return (
    <div className="space-y-6">
      {syncWarning && (
        <Alert
          variant="warning"
          title="Instance telemetry temporarily stale"
          action={
            <Button variant="secondary" size="sm" onClick={() => void loadData()}>
              Retry
            </Button>
          }
        >
          {syncWarning}
        </Alert>
      )}

      <PageHeader
        title={server.name}
        backAction={
          <IconButton
            aria-label="Back to servers"
            variant="outline"
            size="sm"
            onClick={onBack}
            icon={<ArrowLeft className="w-4 h-4" />}
          />
        }
        meta={
          <MetaRow
            items={[
              <StatusPill key="status" status={effectiveStatus} />,
              <span key="port" className="font-mono text-[#E2E8F0]">
                Port :{server.port}
              </span>,
              <span key="entry" className="font-mono text-[#A2AAB8]">
                Entry: {server.entry_file}
              </span>,
              <span key="id" className="font-mono text-[#697386]">
                {server.id}
              </span>,
              isRunning
                ? `RAM ${formatMemoryMB(server.metrics?.memory_mb)}`
                : `Last exit ${server.last_exit_code ?? 0}`,
              isRunning && server.metrics?.cpu_percent !== null && server.metrics?.cpu_percent !== undefined
                ? `CPU ${formatCpuPercent(server.metrics.cpu_percent)}`
                : null,
              isRunning && server.metrics?.pid
                ? `PID ${server.metrics.pid} · ${formatUptime(server.metrics.uptime_sec)}`
                : null,
            ]}
          />
        }
        actions={
          <>
            {server.status === 'running' || server.status === 'starting' || server.status === 'stopping' ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!allowStop}
                  loading={pendingAction === 'stopping'}
                  onClick={() => onStop(server.id)}
                  leftIcon={<Square className="w-3.5 h-3.5" />}
                >
                  Stop
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!allowRestart}
                  loading={pendingAction === 'restarting'}
                  onClick={() => onRestart(server.id)}
                  leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                >
                  Restart
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={!allowStart}
                loading={pendingAction === 'starting'}
                onClick={() => onStart(server.id)}
                leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
              >
                Start Server
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              loading={isInstallingDeps}
              disabled={Boolean(pendingAction)}
              onClick={() => void handleRunNpmInstall()}
              leftIcon={<Download className="w-3.5 h-3.5 text-emerald-400" />}
            >
              npm install
            </Button>

            <IconButton
              aria-label="Delete server instance"
              variant="ghost"
              size="sm"
              disabled={Boolean(pendingAction)}
              onClick={() => setShowDeleteServerModal(true)}
              icon={<Trash2 className="w-4 h-4 text-[#8A94A6] hover:text-red-400" />}
            />
          </>
        }
      />

      {/* Detail Section Tabs */}
      <Tabs<DetailTab>
        ariaLabel="Server workspace sections"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          {
            id: 'terminal',
            label: 'Live Terminal',
            icon: <Terminal className="w-3.5 h-3.5" />,
          },
          {
            id: 'files',
            label: 'File Manager',
            icon: <FolderTree className="w-3.5 h-3.5" />,
          },
          {
            id: 'env',
            label: 'Environment (.env)',
            icon: <KeyRound className="w-3.5 h-3.5" />,
          },
          {
            id: 'logs',
            label: 'App Logs',
            icon: <FileCode className="w-3.5 h-3.5" />,
            count: appLogs.length > 0 ? appLogs.length : undefined,
          },
          {
            id: 'settings',
            label: 'Settings',
            icon: <Settings className="w-3.5 h-3.5" />,
          },
          {
            id: 'git',
            label: 'Git Sync',
            icon: <GitBranch className="w-3.5 h-3.5" />,
          },
        ]}
      />

      {/* TAB 1: LIVE INTERACTIVE TERMINAL */}
      {activeTab === 'terminal' && (
        <Card padding="none" className="overflow-hidden flex flex-col h-[560px]">
          <div className="px-4 py-2.5 bg-[#0B0D10] border-b border-[#1F242D] flex items-center justify-between flex-wrap gap-2 shrink-0">
            <div className="flex items-center gap-2 font-mono text-xs text-[#A2AAB8] min-w-0">
              <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="text-[#697386]">cwd:</span>
              <CodeText className="truncate max-w-[280px] sm:max-w-md">
                data/servers/{server.id}/{terminalCwd === '.' ? '' : terminalCwd}
              </CodeText>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {isTerminalRunning && (
                <div className="inline-flex items-center gap-2">
                  <Badge tone="warning" mono>
                    Running: {currentRunningCmd}
                  </Badge>
                  <Button variant="danger" size="sm" onClick={handleKillTerminal}>
                    Stop (^C)
                  </Button>
                </div>
              )}

              <Button variant="ghost" size="sm" onClick={() => setTerminalLines([])}>
                Clear
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <TerminalOutput
              lines={terminalLines}
              onClear={() => setTerminalLines([])}
              isRunning={isTerminalRunning}
              currentCommand={currentRunningCmd}
              serverName={server.name}
              onNotify={notify}
              className="h-full"
            />
          </div>

          <div className="px-4 py-2 bg-[#0B0D10] border-t border-[#181C24] flex items-center gap-1.5 overflow-x-auto text-xs font-mono shrink-0">
            <span className="text-[#697386] text-[11px] font-sans shrink-0 mr-1">Quick run:</span>
            {['pwd', 'ls -la', 'cat package.json', 'npm install', 'node index.js'].map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => handleExecuteCommand(cmd)}
                className="px-2 py-0.5 rounded bg-[#14171D] hover:bg-[#1B1F27] text-[#D0D7E2] border border-[#242A35] whitespace-nowrap transition-colors"
              >
                {cmd}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleExecuteCommand();
            }}
            className="p-2.5 bg-[#0E1014] border-t border-[#1F242D] flex items-center gap-2 shrink-0"
          >
            <span className="text-emerald-400 font-mono text-xs pl-2 font-semibold select-none">
              $
            </span>
            <input
              type="text"
              aria-label="Terminal command input"
              placeholder="Enter shell command (e.g. ls -la, pwd, npm test) or 'clear'..."
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={handleTerminalKeyDown}
              className="flex-1 h-8 bg-transparent text-xs text-[#F3F5F8] placeholder-[#5B6475] font-mono focus:outline-none"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!terminalInput.trim()}
              rightIcon={<Send className="w-3 h-3" />}
            >
              Run
            </Button>
          </form>
        </Card>
      )}

      {/* TAB 2: FILE MANAGER */}
      {activeTab === 'files' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:h-[560px]">
          <Card padding="none" className="flex flex-col overflow-hidden h-[360px] lg:h-full">
            <div className="px-3.5 py-2.5 bg-[#0B0D10] border-b border-[#1F242D] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-xs font-mono text-[#D0D7E2] min-w-0">
                <FolderTree className="w-3.5 h-3.5 text-emerald-400 shrink-0 mr-1" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setCurrentPath('')}
                  className="hover:text-emerald-400 font-semibold shrink-0"
                >
                  root
                </button>
                {currentPath && (
                  <>
                    <ChevronRight className="w-3 h-3 text-[#5B6475] shrink-0" aria-hidden="true" />
                    <span className="truncate text-[#A2AAB8]">{currentPath}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {currentPath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const parts = currentPath.split('/');
                      parts.pop();
                      setCurrentPath(parts.join('/'));
                    }}
                    className="h-7 px-2 font-mono"
                  >
                    ..
                  </Button>
                )}
                <IconButton
                  aria-label="New file"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewFileName('');
                    setNewFileError(null);
                    setShowNewFileModal(true);
                  }}
                  className="h-7 w-7"
                  icon={<Plus className="w-3.5 h-3.5" />}
                />
                <IconButton
                  aria-label="New folder"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewFolderName('');
                    setNewFolderError(null);
                    setShowNewFolderModal(true);
                  }}
                  className="h-7 w-7"
                  icon={<FolderPlus className="w-3.5 h-3.5" />}
                />
                <IconButton
                  aria-label="Refresh files"
                  size="sm"
                  variant="ghost"
                  loading={loadingFiles}
                  onClick={() => void loadFiles(currentPath)}
                  className="h-7 w-7"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {loadingFiles && fileList.length === 0 ? (
                <div className="p-2 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : fileList.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#697386]">Directory is empty.</div>
              ) : (
                fileList.map((entry) => {
                  const isSelected = selectedFile === entry.path;

                  return (
                    <div
                      key={entry.path}
                      className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        isSelected
                          ? 'bg-[#161A22] text-[#F3F5F8] border border-[#2B313D]'
                          : 'text-[#D0D7E2] hover:bg-[#12151B] border border-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void handleOpenFile(entry)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left py-0.5"
                      >
                        {entry.is_dir ? (
                          <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                        )}
                        <span className="truncate font-mono">{entry.name}</span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!entry.is_dir && (
                          <span className="text-[10px] font-mono text-[#697386] tabular-nums">
                            {formatBytes(entry.size)}
                          </span>
                        )}

                        <DropdownMenu
                          header={entry.name}
                          trigger={
                            <IconButton
                              aria-label={`Actions for ${entry.name}`}
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6"
                              icon={<MoreVertical className="w-3.5 h-3.5" />}
                            />
                          }
                          items={[
                            {
                              id: 'open',
                              label: entry.is_dir ? 'Open Folder' : 'Open in Editor',
                              icon: entry.is_dir ? (
                                <Folder className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                              ),
                              onSelect: () => void handleOpenFile(entry),
                            },
                            {
                              id: 'rename',
                              label: 'Rename',
                              icon: <Edit2 className="w-3.5 h-3.5" />,
                              onSelect: () => {
                                setRenameTarget(entry);
                                setRenameNewName(entry.name);
                                setRenameError(null);
                              },
                            },
                            ...(!entry.is_dir
                              ? [
                                  {
                                    id: 'download',
                                    label: 'Download',
                                    icon: <Download className="w-3.5 h-3.5" />,
                                    href: getServerFileDownloadUrl(serverId, entry.path),
                                    download: entry.name,
                                  },
                                ]
                              : []),
                            {
                              id: 'copy-path',
                              label: 'Copy Path',
                              icon: <Copy className="w-3.5 h-3.5" />,
                              onSelect: () => handleCopyPath(entry.path),
                            },
                            {
                              id: 'delete',
                              label: 'Delete',
                              icon: <Trash2 className="w-3.5 h-3.5" />,
                              danger: true,
                              onSelect: () => setDeleteTarget(entry),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card padding="none" className="lg:col-span-2 flex flex-col overflow-hidden h-[420px] lg:h-full">
            <div className="px-4 py-2.5 bg-[#0B0D10] border-b border-[#1F242D] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 font-mono text-xs text-[#D0D7E2]">
                <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedFile || 'Select a file to inspect or edit'}</span>
                {fileDirty && <Badge tone="warning">Unsaved</Badge>}
              </div>

              {selectedFile && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={isSavingFile}
                  onClick={() => void handleSaveFile()}
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                >
                  Save File
                </Button>
              )}
            </div>

            <div className="flex-1 bg-[#060709] flex flex-col">
              {selectedFile ? (
                <textarea
                  aria-label={`Editor for ${selectedFile}`}
                  value={fileContent}
                  onChange={(e) => {
                    setFileContent(e.target.value);
                    setFileDirty(true);
                  }}
                  spellCheck={false}
                  className="w-full flex-1 bg-transparent text-[#F3F5F8] font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-xs text-[#697386] gap-2 p-6 text-center">
                  <FolderTree className="w-7 h-7 text-[#323A48]" aria-hidden="true" />
                  <span>Choose a file from the workspace explorer to edit its contents.</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: ENVIRONMENT (.env & .env.example) */}
      {activeTab === 'env' && (
        <Card padding="lg" className="space-y-5 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#181C24]">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#F3F5F8]">Environment Variables (.env)</h3>
                {envData?.has_example && <Badge tone="success">.env.example synced</Badge>}
              </div>
              <p className="text-xs text-[#8A94A6] mt-0.5">
                Synchronizes keys from <CodeText>.env.example</CodeText> and writes atomically to{' '}
                <CodeText>.env</CodeText> inside the server workspace.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Switch
                checked={revealSecrets}
                onChange={setRevealSecrets}
                label="Reveal values"
              />

              {envData?.has_example && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleApplyAllTemplates}
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
                >
                  Fill Defaults
                </Button>
              )}

              <Button
                variant="primary"
                size="sm"
                loading={isSavingEnv}
                onClick={() => void handleSaveEnvironment()}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Save to .env
              </Button>
            </div>
          </div>

          {!envData?.has_env && envData?.has_example && (
            <Alert
              variant="info"
              title="Template defaults detected"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  loading={isSavingEnv}
                  onClick={() => void handleApplyAndSaveTemplate()}
                >
                  Apply &amp; Save .env
                </Button>
              }
            >
              Default values from <CodeText>.env.example</CodeText> are pre-filled below. Save to activate{' '}
              <CodeText>.env</CodeText>.
            </Alert>
          )}

          {envData && !envData.has_example && (
            <Alert
              variant="warning"
              title="No .env.example template found"
              action={
                <Button variant="secondary" size="sm" onClick={() => void handleInitEnvExample()}>
                  Create .env.example
                </Button>
              }
            >
              Generate a starter <CodeText>.env.example</CodeText> file to document required runtime keys.
            </Alert>
          )}

          {loadingEnv && !envData ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : Object.keys(envValues).length === 0 ? (
            <div className="py-8 text-center text-xs text-[#697386] rounded-lg border border-dashed border-[#242A35]">
              No environment variables configured yet. Add a variable below.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(envValues).map(([key, val]) => {
                const comment = envDescriptions[key];
                const meta = envData?.variables.find((v) => v.key === key);

                return (
                  <div
                    key={key}
                    className="p-3.5 rounded-lg bg-[#090B0E] border border-[#1F242D] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-emerald-400">{key}</span>
                        {meta?.example_value && (
                          <span className="text-[11px] font-mono text-[#697386]">
                            default: {meta.example_value}
                          </span>
                        )}
                      </div>

                      <IconButton
                        aria-label={`Remove ${key}`}
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteEnvKey(key)}
                        className="h-7 w-7"
                        icon={<Trash2 className="w-3.5 h-3.5 text-[#8A94A6] hover:text-red-400" />}
                      />
                    </div>

                    {comment && <p className="text-[11px] text-[#8A94A6]">{comment}</p>}

                    <PasswordInput
                      aria-label={`Value for ${key}`}
                      mono
                      revealed={revealSecrets}
                      onRevealChange={setRevealSecrets}
                      value={val}
                      placeholder={meta?.example_value || 'value'}
                      onChange={(e) => {
                        const next = e.target.value;
                        setEnvValues((prev) => ({ ...prev, [key]: next }));
                      }}
                    />

                    {meta?.example_value && val !== meta.example_value && (
                      <button
                        type="button"
                        onClick={() =>
                          setEnvValues((prev) => ({ ...prev, [key]: meta.example_value! }))
                        }
                        className="text-[11px] font-mono text-emerald-400 hover:underline"
                      >
                        Use template value ({meta.example_value})
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <form
            onSubmit={handleAddEnvVariable}
            noValidate
            className="pt-4 border-t border-[#181C24] space-y-2"
          >
            <div className="text-xs font-medium text-[#D0D7E2]">Add Custom Variable</div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
              <div className="sm:col-span-4">
                <Input
                  aria-label="New variable key"
                  mono
                  placeholder="KEY_NAME"
                  value={newEnvKey}
                  error={newEnvError || undefined}
                  onChange={(e) => {
                    setNewEnvKey(e.target.value.toUpperCase());
                    if (newEnvError) setNewEnvError(null);
                  }}
                />
              </div>
              <div className="sm:col-span-6">
                <Input
                  aria-label="New variable value"
                  mono
                  placeholder="value"
                  value={newEnvVal}
                  onChange={(e) => setNewEnvVal(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="secondary" size="md" fullWidth>
                  Add Key
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 4: APP DAEMON LOGS */}
      {activeTab === 'logs' && (
        <Card padding="none" className="overflow-hidden flex flex-col h-[520px]">
          <div className="px-4 py-2.5 bg-[#0B0D10] border-b border-[#1F242D] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 font-mono text-xs text-[#D0D7E2]">
              <FileCode className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span>logs/server.log</span>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={autoScrollLogs}
                onChange={setAutoScrollLogs}
                label="Auto-scroll"
              />
              <Button variant="ghost" size="sm" onClick={() => void loadData()}>
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAppLogs([])}>
                Clear View
              </Button>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs bg-[#060709] space-y-1 select-text">
            {appLogs.length === 0 ? (
              <div className="text-[#5B6475] py-8 text-center">
                No daemon logs captured yet. Start the server to stream stdout/stderr output.
              </div>
            ) : (
              appLogs.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2.5 leading-relaxed break-all">
                  <span className="text-[#5B6475] text-[11px] tabular-nums select-none shrink-0">
                    {formatTimestampTime(line.timestamp)}
                  </span>
                  <span className="text-[#697386] text-[11px] select-none shrink-0">
                    [{line.stream}]
                  </span>
                  <span className={line.stream === 'stderr' ? 'text-red-400' : 'text-[#D0D7E2]'}>
                    {line.text}
                  </span>
                </div>
              ))
            )}
            <div ref={logsBottomRef} />
          </div>
        </Card>
      )}

      {/* TAB 5: LIFECYCLE SETTINGS */}
      {activeTab === 'settings' && (
        <Card padding="lg" className="max-w-xl">
          <form onSubmit={handleSaveConfig} noValidate className="space-y-4">
            <h3 className="text-sm font-semibold text-[#F3F5F8]">Lifecycle Configuration</h3>

            <Input
              label="Server Name"
              required
              value={cfgName}
              error={cfgErrors.name}
              onChange={(e) => setCfgName(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Listening Port"
                type="number"
                mono
                value={cfgPort}
                error={cfgErrors.port}
                onChange={(e) => setCfgPort(e.target.value)}
              />

              <Select
                label="Auto-Restart Policy"
                value={cfgAutoRestart}
                onChange={(e) => setCfgAutoRestart(e.target.value as AutoRestartPolicy)}
                options={[
                  { value: 'never', label: 'Never' },
                  { value: 'on-failure', label: 'On-Failure (Max 5)' },
                  { value: 'always', label: 'Always (Bounded)' },
                ]}
              />
            </div>

            <Input
              label="Entry Command / Script"
              mono
              value={cfgEntry}
              error={cfgErrors.entry}
              onChange={(e) => setCfgEntry(e.target.value)}
            />

            <Textarea
              label="Description"
              rows={2}
              value={cfgDesc}
              onChange={(e) => setCfgDesc(e.target.value)}
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isSavingCfg}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Save Configuration
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 6: GIT REPOSITORY */}
      {activeTab === 'git' && (
        <Card padding="lg" className="max-w-2xl space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#F3F5F8]">Git Workspace Metadata</h3>
            <p className="text-xs text-[#8A94A6] mt-0.5">
              Repository origin and local sandboxed filesystem location for this server instance.
            </p>
          </div>

          <div className="rounded-lg bg-[#090B0E] border border-[#1A1E26] divide-y divide-[#181C24] text-xs font-mono">
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-[#8A94A6] font-sans">Repository Origin</span>
              <span className="text-[#F3F5F8] break-all">
                {server.repo_url || 'Provisioned from local template (no remote origin)'}
              </span>
            </div>
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-[#8A94A6] font-sans">Workspace Directory</span>
              <span className="text-emerald-400">data/servers/{server.id}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Modals & Confirmations */}
      <Modal
        isOpen={showNewFileModal}
        onClose={() => setShowNewFileModal(false)}
        title="Create New File"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowNewFileModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-file-form" variant="primary" size="sm">
              Create File
            </Button>
          </>
        }
      >
        <form id="new-file-form" onSubmit={handleConfirmCreateFile} noValidate>
          <Input
            label="File Name"
            mono
            placeholder="e.g. routes.js or config.json"
            value={newFileName}
            error={newFileError || undefined}
            onChange={(e) => {
              setNewFileName(e.target.value);
              if (newFileError) setNewFileError(null);
            }}
          />
        </form>
      </Modal>

      <Modal
        isOpen={showNewFolderModal}
        onClose={() => setShowNewFolderModal(false)}
        title="Create New Folder"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowNewFolderModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-folder-form" variant="primary" size="sm">
              Create Folder
            </Button>
          </>
        }
      >
        <form id="new-folder-form" onSubmit={handleConfirmCreateFolder} noValidate>
          <Input
            label="Folder Name"
            mono
            placeholder="e.g. src or controllers"
            value={newFolderName}
            error={newFolderError || undefined}
            onChange={(e) => {
              setNewFolderName(e.target.value);
              if (newFolderError) setNewFolderError(null);
            }}
          />
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title={`Rename ${renameTarget?.is_dir ? 'Folder' : 'File'}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-entry-form" variant="primary" size="sm">
              Rename
            </Button>
          </>
        }
      >
        <form id="rename-entry-form" onSubmit={handleConfirmRename} noValidate>
          <Input
            label="New Name"
            mono
            value={renameNewName}
            error={renameError || undefined}
            onChange={(e) => {
              setRenameNewName(e.target.value);
              if (renameError) setRenameError(null);
            }}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDeleteFile()}
        title={`Delete ${deleteTarget?.is_dir ? 'Folder' : 'File'}?`}
        confirmLabel="Delete"
        description={
          deleteTarget ? (
            <>
              Permanently remove <CodeText>{deleteTarget.name}</CodeText>?
              {deleteTarget.is_dir && ' All nested files inside this folder will also be deleted.'}
            </>
          ) : null
        }
      />

      <ConfirmDialog
        isOpen={Boolean(deleteEnvKey)}
        onClose={() => setDeleteEnvKey(null)}
        onConfirm={handleConfirmDeleteEnv}
        title="Remove Environment Variable?"
        confirmLabel="Remove"
        description={
          deleteEnvKey ? (
            <>
              Remove <CodeText>{deleteEnvKey}</CodeText> from the editor? Remember to click{' '}
              <strong>Save to .env</strong> to apply changes on disk.
            </>
          ) : null
        }
      />

      <ConfirmDialog
        isOpen={showDeleteServerModal}
        onClose={() => setShowDeleteServerModal(false)}
        onConfirm={() => {
          setShowDeleteServerModal(false);
          onDelete(server.id);
        }}
        title="Delete Server Instance?"
        confirmLabel="Delete Server"
        loading={pendingAction === 'deleting'}
        description={
          <>
            Permanently terminate and delete <strong className="text-[#F3F5F8]">{server.name}</strong>{' '}
            along with <CodeText>data/servers/{server.id}</CodeText>?
          </>
        }
      />
    </div>
  );
};
