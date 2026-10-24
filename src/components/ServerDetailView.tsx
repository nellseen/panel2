import React, { useState, useEffect, useRef } from 'react';
import {
  ServerModel,
  LogLine,
  FileEntry,
  AutoRestartPolicy,
  EnvVariableInfo,
  EnvInspectResult,
  TerminalLine,
} from '../types';
import {
  Play,
  Square,
  RotateCw,
  Terminal,
  FolderTree,
  KeyRound,
  GitBranch,
  Settings,
  Download,
  Trash2,
  Save,
  Plus,
  Send,
  Eye,
  EyeOff,
  FileCode,
  ArrowLeft,
  Loader2,
  Folder,
  FolderPlus,
  MoreVertical,
  Copy,
  Check,
  Edit2,
  AlertTriangle,
  X,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  fetchServer,
  fetchServerLogs,
  fetchServerFiles,
  readServerFile,
  writeServerFile,
  deleteServerFile,
  renameServerFile,
  createServerDirectory,
  getServerFileDownloadUrl,
  fetchServerEnv,
  saveServerEnv,
  initServerEnvExample,
  updateServer,
  installServerDeps,
  wsClient,
} from '../services/api';

interface ServerDetailViewProps {
  serverId: string;
  onBack: () => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
}

type DetailTab = 'terminal' | 'files' | 'env' | 'logs' | 'settings' | 'git';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  item: FileEntry | null;
}

export const ServerDetailView: React.FC<ServerDetailViewProps> = ({
  serverId,
  onBack,
  onStart,
  onStop,
  onRestart,
  onDelete,
}) => {
  const [server, setServer] = useState<ServerModel | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('terminal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // In-app alert / toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // --- TAB 1: Live Interactive Terminal State ---
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    {
      id: 'init-1',
      timestamp: new Date().toISOString(),
      stream: 'system',
      text: '[nodepanel-terminal] Interactive session initialized. Working directory isolated to server root.',
    },
    {
      id: 'init-2',
      timestamp: new Date().toISOString(),
      stream: 'system',
      text: '[nodepanel-terminal] Type commands below (e.g., npm install, node index.js, ls -la, pwd)',
    },
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isTerminalRunning, setIsTerminalRunning] = useState(false);
  const [currentRunningCmd, setCurrentRunningCmd] = useState('');
  const [terminalCwd, setTerminalCwd] = useState<string>('.');
  const [terminalAutoScroll, setTerminalAutoScroll] = useState(true);
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);

  // --- TAB 2: File Manager State ---
  const [currentPath, setCurrentPath] = useState('');
  const [fileList, setFileList] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [fileDirty, setFileDirty] = useState(false);

  // Context Menu & File Actions Modal
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, item: null });
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameNewName, setRenameNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [copiedPathToast, setCopiedPathToast] = useState(false);

  // --- TAB 3: Environment Variables Auto-Detection State ---
  const [envData, setEnvData] = useState<EnvInspectResult | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [envDescriptions, setEnvDescriptions] = useState<Record<string, string>>({});
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  const [deleteEnvKey, setDeleteEnvKey] = useState<string | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(false);

  // --- TAB 4: Daemon Process Logs State ---
  const [appLogs, setAppLogs] = useState<LogLine[]>([]);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsBottomRef = useRef<HTMLDivElement>(null);

  // --- TAB 5: Settings State ---
  const [cfgName, setCfgName] = useState('');
  const [cfgDesc, setCfgDesc] = useState('');
  const [cfgPort, setCfgPort] = useState(3001);
  const [cfgEntry, setCfgEntry] = useState('index.js');
  const [cfgAutoRestart, setCfgAutoRestart] = useState<AutoRestartPolicy>('never');
  const [isSavingCfg, setIsSavingCfg] = useState(false);

  // Delete Server Confirmation Modal
  const [showDeleteServerModal, setShowDeleteServerModal] = useState(false);

  // Quick npm install in header
  const [isInstallingDeps, setIsInstallingDeps] = useState(false);

  // Load Main Server Data
  const loadData = async () => {
    try {
      setLoading(true);
      const srv = await fetchServer(serverId);
      setServer(srv);
      setCfgName(srv.name);
      setCfgDesc(srv.description || '');
      setCfgPort(srv.port);
      setCfgEntry(srv.entry_file);
      setCfgAutoRestart(srv.auto_restart);

      const logs = await fetchServerLogs(serverId);
      setAppLogs(logs || []);
      if (logs && logs.length > 0) {
        setTerminalLines((prev) => [
          ...prev,
          ...logs.map((l, i) => ({
            id: `past-${i}-${Date.now()}`,
            timestamp: l.timestamp,
            stream: l.stream as any,
            text: l.text,
          })),
        ]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    wsClient.subscribeServer(serverId);

    // Main App Logs from Server Daemon
    const unsubLog = wsClient.on('log', (payload: any) => {
      if (payload.server_id === serverId) {
        const newLine: LogLine = {
          timestamp: payload.timestamp || new Date().toISOString(),
          stream: payload.stream || 'stdout',
          text: payload.text || '',
        };
        setAppLogs((prev) => [...prev, newLine]);
        setTerminalLines((prev) => [
          ...prev,
          {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            timestamp: newLine.timestamp,
            stream: newLine.stream,
            text: newLine.text,
          },
        ]);
      }
    });

    // Server Lifecycle Status Change
    const unsubStatus = wsClient.on('status', (payload: any) => {
      if (payload.server_id === serverId) {
        setServer((prev) =>
          prev
            ? { ...prev, status: payload.new_status, last_exit_code: payload.exit_code }
            : null
        );
      }
    });

    // Terminal Realtime Events
    const unsubTermStart = wsClient.on('terminal_start', (payload: any) => {
      if (payload.serverId === serverId) {
        setIsTerminalRunning(true);
        setCurrentRunningCmd(payload.command || '');
        if (payload.cwd) setTerminalCwd(payload.cwd);
      }
    });

    const unsubTermData = wsClient.on('terminal_data', (payload: any) => {
      if (payload.serverId === serverId) {
        setTerminalLines((prev) => [
          ...prev,
          {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            timestamp: new Date().toISOString(),
            stream: payload.stream || 'stdout',
            text: payload.text || '',
          },
        ]);
      }
    });

    const unsubTermExit = wsClient.on('terminal_exit', (payload: any) => {
      if (payload.serverId === serverId) {
        setIsTerminalRunning(false);
        setCurrentRunningCmd('');
        if (payload.cwd) setTerminalCwd(payload.cwd);
      }
    });

    const unsubTermState = wsClient.on('terminal_state', (payload: any) => {
      if (payload.serverId === serverId) {
        if (payload.cwd) setTerminalCwd(payload.cwd);
        setIsTerminalRunning(Boolean(payload.isRunning));
        setCurrentRunningCmd(payload.currentCommand || '');
      }
    });

    const unsubTermClear = wsClient.on('terminal_clear', (payload: any) => {
      if (payload.serverId === serverId) {
        setTerminalLines([]);
      }
    });

    return () => {
      wsClient.unsubscribeServer(serverId);
      unsubLog();
      unsubStatus();
      unsubTermStart();
      unsubTermData();
      unsubTermExit();
      unsubTermState();
      unsubTermClear();
    };
  }, [serverId]);

  // Terminal Auto Scroll
  useEffect(() => {
    if (terminalAutoScroll && activeTab === 'terminal') {
      terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLines, terminalAutoScroll, activeTab]);

  // Daemon Logs Auto Scroll
  useEffect(() => {
    if (autoScrollLogs && activeTab === 'logs') {
      logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [appLogs, autoScrollLogs, activeTab]);

  // Load Files when Files Tab is Active
  useEffect(() => {
    if (activeTab === 'files') {
      loadFiles(currentPath);
    }
  }, [activeTab, currentPath]);

  // Load Environment Variables when Env Tab is Active
  useEffect(() => {
    if (activeTab === 'env') {
      loadEnvironment();
    }
  }, [activeTab]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, item: null });
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0, item: null });
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible]);

  // --- TERMINAL COMMAND EXECUTION ---
  const handleExecuteCommand = (commandOverride?: string) => {
    const cmd = (commandOverride || terminalInput).trim();
    if (!cmd) return;

    // Add to history
    setTerminalHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)]);
    setHistoryIndex(-1);
    setTerminalInput('');

    wsClient.sendTerminalExec(serverId, cmd);
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
    wsClient.sendTerminalKill(serverId);
    showToast('Sent SIGINT (^C) to terminal command', 'info');
  };

  // --- FILE MANAGER OPERATIONS ---
  const loadFiles = async (subPath: string) => {
    try {
      setLoadingFiles(true);
      const files = await fetchServerFiles(serverId, subPath);
      setFileList(files);
    } catch (err: any) {
      showToast('Failed to load files: ' + err.message, 'error');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleOpenFile = async (file: FileEntry) => {
    if (file.is_dir) {
      setCurrentPath(file.path);
      setSelectedFile(null);
      setFileDirty(false);
    } else {
      try {
        const content = await readServerFile(serverId, file.path);
        setSelectedFile(file.path);
        setFileContent(content);
        setFileDirty(false);
      } catch (err: any) {
        showToast('Failed to read file: ' + err.message, 'error');
      }
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    try {
      setIsSavingFile(true);
      await writeServerFile(serverId, selectedFile, fileContent);
      setFileDirty(false);
      showToast(`Saved ${selectedFile.split('/').pop()}`, 'success');
    } catch (err: any) {
      showToast('Failed to save file: ' + err.message, 'error');
    } finally {
      setIsSavingFile(false);
    }
  };

  const handleConfirmCreateFile = async () => {
    if (!newFileName.trim()) return;
    const target = currentPath ? `${currentPath}/${newFileName.trim()}` : newFileName.trim();
    try {
      await writeServerFile(serverId, target, '');
      setShowNewFileModal(false);
      setNewFileName('');
      await loadFiles(currentPath);
      setSelectedFile(target);
      setFileContent('');
      showToast(`Created file ${target.split('/').pop()}`, 'success');
    } catch (err: any) {
      showToast('Failed to create file: ' + err.message, 'error');
    }
  };

  const handleConfirmCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const target = currentPath ? `${currentPath}/${newFolderName.trim()}` : newFolderName.trim();
    try {
      await createServerDirectory(serverId, target);
      setShowNewFolderModal(false);
      setNewFolderName('');
      await loadFiles(currentPath);
      showToast(`Created folder ${target.split('/').pop()}`, 'success');
    } catch (err: any) {
      showToast('Failed to create folder: ' + err.message, 'error');
    }
  };

  const handleConfirmRename = async () => {
    if (!renameTarget || !renameNewName.trim()) return;
    const parent = currentPath ? `${currentPath}/` : '';
    const newPath = `${parent}${renameNewName.trim()}`;
    try {
      await renameServerFile(serverId, renameTarget.path, newPath);
      if (selectedFile === renameTarget.path) {
        setSelectedFile(newPath);
      }
      setRenameTarget(null);
      setRenameNewName('');
      await loadFiles(currentPath);
      showToast(`Renamed to ${renameNewName.trim()}`, 'success');
    } catch (err: any) {
      showToast('Failed to rename: ' + err.message, 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteServerFile(serverId, deleteTarget.path);
      if (selectedFile === deleteTarget.path) {
        setSelectedFile(null);
        setFileContent('');
      }
      setDeleteTarget(null);
      await loadFiles(currentPath);
      showToast(`Deleted ${deleteTarget.name}`, 'success');
    } catch (err: any) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  };

  const handleContextMenuTrigger = (e: React.MouseEvent, item: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();

    // Viewport bound calculation to guarantee pop-up never gets cut off
    const menuWidth = 190;
    const menuHeight = 220;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth - 16) {
      x = window.innerWidth - menuWidth - 16;
    }
    if (y + menuHeight > window.innerHeight - 16) {
      y = window.innerHeight - menuHeight - 16;
    }

    setContextMenu({ visible: true, x, y, item });
  };

  const handleCopyPath = (filePath: string) => {
    navigator.clipboard.writeText(filePath);
    setCopiedPathToast(true);
    setTimeout(() => setCopiedPathToast(false), 2000);
    showToast(`Copied path: ${filePath}`, 'info');
  };

  // --- ENVIRONMENT VARIABLES AUTO-DETECTION ---
  const loadEnvironment = async () => {
    try {
      setLoadingEnv(true);
      const res = await fetchServerEnv(serverId);
      setEnvData(res);

      const valMap: Record<string, string> = {};
      const descMap: Record<string, string> = {};

      for (const v of res.variables) {
        valMap[v.key] = v.value;
        if (v.comment) descMap[v.key] = v.comment;
      }
      setEnvValues(valMap);
      setEnvDescriptions(descMap);
    } catch (err: any) {
      showToast('Failed to load environment: ' + err.message, 'error');
    } finally {
      setLoadingEnv(false);
    }
  };

  const handleSaveEnvironment = async () => {
    try {
      setIsSavingEnv(true);
      const res = await saveServerEnv(serverId, envValues);
      showToast(`Saved ${res.count} environment variables to .env`, 'success');
      await loadEnvironment();
    } catch (err: any) {
      showToast('Failed to save .env: ' + err.message, 'error');
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleInitEnvExample = async () => {
    try {
      await initServerEnvExample(serverId);
      showToast('Initialized .env.example template', 'success');
      await loadEnvironment();
    } catch (err: any) {
      showToast('Failed: ' + err.message, 'error');
    }
  };

  const handleAddEnvVariable = () => {
    const k = newEnvKey.trim().toUpperCase();
    if (!k) return;
    setEnvValues((prev) => ({ ...prev, [k]: newEnvVal }));
    setNewEnvKey('');
    setNewEnvVal('');
    showToast(`Added ${k} (remember to save to .env)`, 'info');
  };

  const handleConfirmDeleteEnv = () => {
    if (!deleteEnvKey) return;
    setEnvValues((prev) => {
      const copy = { ...prev };
      delete copy[deleteEnvKey];
      return copy;
    });
    showToast(`Removed ${deleteEnvKey} (remember to save to .env)`, 'info');
    setDeleteEnvKey(null);
  };

  // --- SETTINGS / CONFIGURATION ---
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingCfg(true);
      const updated = await updateServer(serverId, {
        name: cfgName,
        description: cfgDesc,
        port: cfgPort,
        entry_file: cfgEntry,
        auto_restart: cfgAutoRestart,
      });
      setServer(updated);
      showToast('Server configuration updated', 'success');
    } catch (err: any) {
      showToast('Failed to update config: ' + err.message, 'error');
    } finally {
      setIsSavingCfg(false);
    }
  };

  const handleRunNpmInstall = async () => {
    try {
      setIsInstallingDeps(true);
      showToast('Running npm install on host...', 'info');
      const res = await installServerDeps(serverId);
      showToast('npm install completed successfully', 'success');
      // Append output to terminal lines
      setTerminalLines((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          stream: 'system',
          text: `[nodepanel-deps] npm install completed:\n${res.output}`,
        },
      ]);
    } catch (err: any) {
      showToast('npm install failed: ' + err.message, 'error');
    } finally {
      setIsInstallingDeps(false);
    }
  };

  if (loading && !server) {
    return (
      <div className="glass-panel p-12 rounded-2xl text-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-400" />
        <p className="text-xs">Loading instance details...</p>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="text-rose-400 font-semibold text-sm">Failed to load server: {error}</div>
        <button
          onClick={onBack}
          className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold rounded-xl"
        >
          Back to Server List
        </button>
      </div>
    );
  }

  const isRunning = server.status === 'running';

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold border backdrop-blur-xl flex items-center gap-2 ${
              toast.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
                : toast.type === 'info'
                ? 'bg-cyan-950/90 text-cyan-200 border-cyan-500/40'
                : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
            }`}
          >
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Bento Header Glass Card */}
      <div className="glass-panel glass-specular rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-white bg-white/[0.04] border border-white/[0.08] rounded-xl hover:bg-white/[0.08] transition-colors"
            title="Back to Servers"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-white tracking-tight">{server.name}</h2>
              <span className="text-xs font-mono text-slate-400">
                <span>Port</span> <strong className="text-emerald-300">:{server.port}</strong>
              </span>
              <span className="text-xs text-slate-500 font-mono">·</span>
              <span className="text-xs font-mono text-slate-300 capitalize flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                      : server.status === 'crashed'
                      ? 'bg-rose-400'
                      : 'bg-slate-500'
                  }`}
                />
                <span>{server.status}</span>
              </span>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-3 mt-1.5 font-mono flex-wrap">
              <span className="text-slate-400">{server.id}</span>
              <span>·</span>
              <span>
                Entry: <code className="text-slate-200">{server.entry_file}</code>
              </span>
              {server.metrics && isRunning && (
                <>
                  <span>·</span>
                  <span>
                    RAM: <strong className="text-emerald-400">{server.metrics.memory_mb.toFixed(1)} MB</strong>
                  </span>
                  <span>·</span>
                  <span>
                    PID: <strong className="text-cyan-400">{server.metrics.pid}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {isRunning ? (
            <>
              <button
                onClick={() => {
                  onStop(server.id);
                  setTerminalLines((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      timestamp: new Date().toISOString(),
                      stream: 'system',
                      text: `[nodepanel] Stop signal sent for '${server.name}'...`,
                    },
                  ]);
                }}
                className="flex items-center gap-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
              <button
                onClick={() => {
                  onRestart(server.id);
                  setTerminalLines((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      timestamp: new Date().toISOString(),
                      stream: 'system',
                      text: `[nodepanel] Triggering restart sequence for '${server.name}'...`,
                    },
                  ]);
                }}
                className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                onStart(server.id);
                setTerminalLines((prev) => [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    stream: 'system',
                    text: `[nodepanel] Starting server '${server.name}' (Port: ${server.port})...`,
                  },
                ]);
              }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-4 py-1.5 rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Server</span>
            </button>
          )}

          <button
            onClick={handleRunNpmInstall}
            disabled={isInstallingDeps}
            className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border border-white/[0.08] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
            title="Execute npm install in server directory"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isInstallingDeps ? 'Installing...' : 'npm install'}</span>
          </button>

          <button
            onClick={() => setShowDeleteServerModal(true)}
            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
            title="Delete Server"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Segmented Tab Navigation Bar */}
      <div className="glass-panel p-1 rounded-2xl flex items-center gap-1 overflow-x-auto">
        {[
          { id: 'terminal' as DetailTab, label: 'Live Terminal', icon: Terminal, badge: isTerminalRunning ? 'Running' : undefined },
          { id: 'files' as DetailTab, label: 'File Manager', icon: FolderTree },
          { id: 'env' as DetailTab, label: 'Environment (.env)', icon: KeyRound, badge: envData?.has_example ? 'Auto-Sync' : undefined },
          { id: 'logs' as DetailTab, label: 'App Logs', icon: FileCode },
          { id: 'settings' as DetailTab, label: 'Settings', icon: Settings },
          { id: 'git' as DetailTab, label: 'Git Sync', icon: GitBranch },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-white/10 text-emerald-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE INTERACTIVE TERMINAL                                          */}
      {/* ========================================================================= */}
      {activeTab === 'terminal' && (
        <div className="space-y-3">
          <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-[540px]">
            {/* Terminal Header Toolbar */}
            <div className="bg-black/40 px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                <span className="font-mono text-xs text-slate-300 ml-2 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-400">cwd:</span>
                  <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    data/servers/{server.id}/{terminalCwd === '.' ? '' : terminalCwd}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isTerminalRunning && (
                  <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg text-[11px] text-amber-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Running: {currentRunningCmd}</span>
                    <button
                      onClick={handleKillTerminal}
                      className="ml-1 px-1.5 py-0.5 bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 rounded font-bold"
                      title="Send SIGINT (Ctrl+C)"
                    >
                      Stop (^C)
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setTerminalAutoScroll(!terminalAutoScroll)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                    terminalAutoScroll
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/[0.04] text-slate-400 border-white/[0.06]'
                  }`}
                >
                  Auto-scroll: {terminalAutoScroll ? 'ON' : 'OFF'}
                </button>

                <button
                  onClick={() => setTerminalLines([])}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-200 space-y-1 bg-black/60 select-text">
              {terminalLines.map((line) => {
                let colorClass = 'text-slate-300';
                let prefix = '';
                if (line.stream === 'stderr') {
                  colorClass = 'text-rose-400';
                } else if (line.stream === 'command') {
                  colorClass = 'text-cyan-300 font-bold';
                } else if (line.stream === 'system') {
                  colorClass = 'text-emerald-400/90 italic';
                }

                return (
                  <div key={line.id} className="flex items-start gap-2 leading-relaxed break-all">
                    <span className="text-slate-600 text-[10px] select-none shrink-0">
                      {new Date(line.timestamp).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span className={colorClass}>
                      {prefix}
                      {line.text}
                    </span>
                  </div>
                );
              })}
              <div ref={terminalBottomRef} />
            </div>

            {/* Quick Command Suggestions */}
            <div className="bg-black/40 px-3 py-1.5 border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono text-slate-400">
              <span className="text-slate-500 text-[10px] shrink-0">Quick run:</span>
              {[
                'npm install',
                'node index.js',
                'ls -la',
                'cat package.json',
                'npm test',
                'pwd',
              ].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => handleExecuteCommand(cmd)}
                  className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08] whitespace-nowrap transition-colors"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {/* Terminal Command Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteCommand();
              }}
              className="p-3 bg-black/50 border-t border-white/[0.08] flex items-center gap-2"
            >
              <span className="text-emerald-400 font-mono text-xs pl-2 font-bold">$</span>
              <input
                ref={terminalInputRef}
                type="text"
                placeholder="Type command (e.g. npm install, node index.js, ls -la) or 'clear'..."
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={handleTerminalKeyDown}
                className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-600 focus:outline-none font-mono"
              />
              <button
                type="submit"
                disabled={!terminalInput.trim()}
                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg disabled:opacity-30 transition-colors flex items-center gap-1"
                title="Execute Command"
              >
                <span>Run</span>
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: FILE MANAGER WITH FLOATING CONTEXT MENU                            */}
      {/* ========================================================================= */}
      {activeTab === 'files' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-[580px]">
          {/* File Explorer Tree Panel */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
            <div>
              {/* Explorer Header & Breadcrumb */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.08]">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 truncate">
                  <FolderTree className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span
                    onClick={() => setCurrentPath('')}
                    className="hover:text-emerald-300 cursor-pointer"
                  >
                    root
                  </span>
                  {currentPath && (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate text-slate-300">{currentPath}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {currentPath && (
                    <button
                      onClick={() => {
                        const parts = currentPath.split('/');
                        parts.pop();
                        setCurrentPath(parts.join('/'));
                      }}
                      className="p-1 text-slate-400 hover:text-slate-200 text-xs rounded-lg hover:bg-white/[0.06]"
                      title="Parent Directory"
                    >
                      ..
                    </button>
                  )}
                  <button
                    onClick={() => setShowNewFileModal(true)}
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-white/[0.06] rounded-lg transition-colors"
                    title="New File"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowNewFolderModal(true)}
                    className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-white/[0.06] rounded-lg transition-colors"
                    title="New Folder"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => loadFiles(currentPath)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] rounded-lg transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Files & Folders List */}
              <div className="overflow-y-auto max-h-[460px] space-y-1 pr-1">
                {fileList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 italic">
                    {loadingFiles ? 'Scanning files...' : 'Folder is empty'}
                  </div>
                ) : (
                  fileList.map((f) => (
                    <div
                      key={f.path}
                      onContextMenu={(e) => handleContextMenuTrigger(e, f)}
                      onClick={() => handleOpenFile(f)}
                      className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors relative ${
                        selectedFile === f.path
                          ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30'
                          : 'text-slate-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate flex-1">
                        {f.is_dir ? (
                          <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <span className="truncate">{f.name}</span>
                      </div>

                      {/* 3-Dots Action Button for Context Menu Pop-up */}
                      <button
                        onClick={(e) => handleContextMenuTrigger(e, f)}
                        className="p-1 text-slate-500 hover:text-slate-200 hover:bg-white/[0.08] rounded-lg opacity-80 group-hover:opacity-100 transition-opacity"
                        title="Actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Code Editor Panel */}
          <div className="md:col-span-2 glass-panel rounded-2xl flex flex-col overflow-hidden">
            <div className="bg-black/40 px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2 truncate font-mono text-xs text-slate-300">
                <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">{selectedFile ? selectedFile : 'No file open'}</span>
                {fileDirty && <span className="text-amber-400 text-[10px] font-bold">● Unsaved</span>}
              </div>

              {selectedFile && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveFile}
                    disabled={isSavingFile}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingFile ? 'Saving...' : 'Save File'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-2 bg-black/60 relative">
              {selectedFile ? (
                <textarea
                  value={fileContent}
                  onChange={(e) => {
                    setFileContent(e.target.value);
                    setFileDirty(true);
                  }}
                  className="w-full h-full bg-transparent text-slate-100 font-mono text-xs p-3 focus:outline-none resize-none leading-relaxed select-text"
                  spellCheck={false}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                  <FolderTree className="w-8 h-8 text-slate-600" />
                  <span>Select any file on the left to view or edit</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Pop-up Context Menu (Requirement 6) */}
      {contextMenu.visible && contextMenu.item && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 w-44 glass-panel bg-slate-900/95 border border-white/[0.12] rounded-xl shadow-2xl p-1 text-xs animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 border-b border-white/[0.08] truncate mb-1">
            {contextMenu.item.name}
          </div>

          <button
            onClick={() => {
              handleOpenFile(contextMenu.item!);
              setContextMenu({ visible: false, x: 0, y: 0, item: null });
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-white/[0.08] flex items-center gap-2 transition-colors"
          >
            {contextMenu.item.is_dir ? <Folder className="w-3.5 h-3.5 text-amber-400" /> : <FileCode className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{contextMenu.item.is_dir ? 'Open Folder' : 'Open / Edit'}</span>
          </button>

          <button
            onClick={() => {
              setRenameTarget(contextMenu.item);
              setRenameNewName(contextMenu.item!.name);
              setContextMenu({ visible: false, x: 0, y: 0, item: null });
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-white/[0.08] flex items-center gap-2 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Rename</span>
          </button>

          {!contextMenu.item.is_dir && (
            <a
              href={getServerFileDownloadUrl(serverId, contextMenu.item.path)}
              download={contextMenu.item.name}
              onClick={() => setContextMenu({ visible: false, x: 0, y: 0, item: null })}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-white/[0.08] flex items-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download</span>
            </a>
          )}

          <button
            onClick={() => {
              handleCopyPath(contextMenu.item!.path);
              setContextMenu({ visible: false, x: 0, y: 0, item: null });
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-white/[0.08] flex items-center gap-2 transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-amber-400" />
            <span>Copy Path</span>
          </button>

          <div className="my-1 border-t border-white/[0.06]" />

          <button
            onClick={() => {
              setDeleteTarget(contextMenu.item);
              setContextMenu({ visible: false, x: 0, y: 0, item: null });
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-rose-300 hover:bg-rose-500/20 flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Modal: New File */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-4 border border-white/[0.12]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <span>Create New File</span>
              </h3>
              <button onClick={() => setShowNewFileModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">File Name</label>
              <input
                type="text"
                placeholder="config.json or index.js"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                autoFocus
                className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreateFile}
                disabled={!newFileName.trim()}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Folder */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-4 border border-white/[0.12]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-400" />
                <span>Create New Folder</span>
              </h3>
              <button onClick={() => setShowNewFolderModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">Folder Name</label>
              <input
                type="text"
                placeholder="src or lib"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rename */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-4 border border-white/[0.12]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-400" />
                <span>Rename {renameTarget.is_dir ? 'Folder' : 'File'}</span>
              </h3>
              <button onClick={() => setRenameTarget(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">New Name</label>
              <input
                type="text"
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                autoFocus
                className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRename}
                disabled={!renameNewName.trim() || renameNewName.trim() === renameTarget.name}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl disabled:opacity-40"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete File / Folder Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-4 border border-rose-500/30">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">Delete {deleteTarget.is_dir ? 'Folder' : 'File'}?</h3>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently remove <strong className="text-white font-mono">{deleteTarget.name}</strong>?
              {deleteTarget.is_dir && ' All contents within this directory will be permanently removed.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ENVIRONMENT VARIABLES AUTO-DETECTION FROM .env.example             */}
      {/* ========================================================================= */}
      {activeTab === 'env' && (
        <div className="glass-panel rounded-2xl p-6 space-y-5 max-w-4xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Environment Configuration</h3>
                {envData?.has_example && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>.env.example detected</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Parsed from <code className="text-slate-300">.env.example</code> template and saved to isolated <code className="text-slate-300">.env</code> in server root.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setRevealSecrets(!revealSecrets)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-white/[0.04] border border-white/[0.08] rounded-xl"
              >
                {revealSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{revealSecrets ? 'Hide Values' : 'Reveal Values'}</span>
              </button>

              <button
                onClick={handleSaveEnvironment}
                disabled={isSavingEnv}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingEnv ? 'Saving to .env...' : 'Save to .env'}</span>
              </button>
            </div>
          </div>

          {/* Banner if .env.example not found */}
          {!envData?.has_example && (
            <div className="bg-amber-500/10 border border-amber-500/25 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="text-amber-200">
                <span>No </span><code className="font-mono font-bold">.env.example</code><span> template found in server root. You can generate one automatically.</span>
              </div>
              <button
                onClick={handleInitEnvExample}
                className="px-3 py-1 bg-amber-500 text-slate-950 font-semibold text-xs rounded-lg shrink-0 hover:bg-amber-400"
              >
                Create .env.example
              </button>
            </div>
          )}

          {/* Variable List */}
          <div className="space-y-3">
            {Object.keys(envValues).length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 italic bg-black/20 rounded-xl border border-white/[0.04]">
                No environment variables configured yet. Add one below or generate a template.
              </div>
            ) : (
              Object.entries(envValues).map(([key, val]) => {
                const comment = envDescriptions[key];
                const meta = envData?.variables.find((v) => v.key === key);
                const isTemplate = meta?.source === 'example' || meta?.source === 'both';

                return (
                  <div
                    key={key}
                    className="bg-black/30 p-3 rounded-xl border border-white/[0.06] space-y-1.5"
                  >
                    {/* Header: Key & Tag */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400 text-xs">{key}</span>
                        {isTemplate && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                            template
                          </span>
                        )}
                        {meta?.example_value && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            example: {meta.example_value}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setDeleteEnvKey(key)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                        title="Remove variable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Comment Description from .env.example */}
                    {comment && (
                      <p className="text-[11px] text-slate-400 italic">
                        {comment}
                      </p>
                    )}

                    {/* Value Input */}
                    <div>
                      <input
                        type={revealSecrets ? 'text' : 'password'}
                        value={val}
                        placeholder={meta?.example_value ? `e.g. ${meta.example_value}` : 'value'}
                        onChange={(e) => {
                          const updated = e.target.value;
                          setEnvValues((prev) => ({ ...prev, [key]: updated }));
                        }}
                        className="w-full bg-black/50 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add New Variable Form */}
          <div className="pt-3 border-t border-white/[0.08] space-y-2">
            <span className="text-xs font-semibold text-slate-300">Add Variable</span>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <input
                type="text"
                placeholder="VARIABLE_NAME"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())}
                className="w-full sm:w-1/3 bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono"
              />
              <input
                type="text"
                placeholder="value"
                value={newEnvVal}
                onChange={(e) => setNewEnvVal(e.target.value)}
                className="w-full sm:flex-1 bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 font-mono"
              />
              <button
                onClick={handleAddEnvVariable}
                disabled={!newEnvKey.trim()}
                className="w-full sm:w-auto px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] text-slate-200 text-xs font-semibold rounded-xl disabled:opacity-40 whitespace-nowrap"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Environment Variable Confirmation */}
      {deleteEnvKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-4 border border-rose-500/30">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">Remove Variable?</h3>
            </div>
            <p className="text-xs text-slate-300">
              Remove <strong className="text-white font-mono">{deleteEnvKey}</strong> from configuration? Remember to click Save afterwards.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteEnvKey(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteEnv}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl"
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: APP DAEMON LOGS                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'logs' && (
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-[520px]">
          <div className="bg-black/30 px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-xs text-slate-300">Background Daemon Logs (server.log)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                  autoScrollLogs
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-white/[0.04] text-slate-400 border-white/[0.06]'
                }`}
              >
                Auto-scroll: {autoScrollLogs ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setAppLogs([])}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-200 space-y-1 bg-black/40">
            {appLogs.length === 0 ? (
              <div className="text-slate-600 italic py-8 text-center">
                [No daemon logs recorded. Start server to stream output.]
              </div>
            ) : (
              appLogs.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed break-all">
                  <span className="text-slate-600 text-[10px] select-none shrink-0">
                    {new Date(line.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className="text-slate-500 select-none text-[10px]">[{line.stream}]</span>
                  <span className={line.stream === 'stderr' ? 'text-rose-400' : 'text-slate-300'}>
                    {line.text}
                  </span>
                </div>
              ))
            )}
            <div ref={logsBottomRef} />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: LIFECYCLE SETTINGS                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveConfig} className="glass-panel rounded-2xl p-6 space-y-4 max-w-xl">
          <h3 className="font-bold text-white text-base">Lifecycle Configuration</h3>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Server Name</label>
            <input
              type="text"
              value={cfgName}
              onChange={(e) => setCfgName(e.target.value)}
              className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Port</label>
              <input
                type="number"
                value={cfgPort}
                onChange={(e) => setCfgPort(parseInt(e.target.value) || 3001)}
                className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Auto-Restart Policy</label>
              <select
                value={cfgAutoRestart}
                onChange={(e) => setCfgAutoRestart(e.target.value as AutoRestartPolicy)}
                className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-slate-100"
              >
                <option value="never">Never</option>
                <option value="on-failure">On-Failure</option>
                <option value="always">Always</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Entry Script</label>
            <input
              type="text"
              value={cfgEntry}
              onChange={(e) => setCfgEntry(e.target.value)}
              className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={cfgDesc}
              onChange={(e) => setCfgDesc(e.target.value)}
              className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-slate-100"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSavingCfg}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              {isSavingCfg ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: GIT SETTINGS                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'git' && (
        <div className="glass-panel rounded-2xl p-6 space-y-4 max-w-2xl">
          <h3 className="font-bold text-white text-base">Git Repository Association</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Local repository synchronization and branch management.
          </p>

          <div className="bg-black/30 p-4 rounded-xl border border-white/[0.06] space-y-2 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px]">REPOSITORY ORIGIN</span>
              <span className="text-slate-200">{server.repo_url || 'No remote repository attached'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">LOCAL WORKING DIRECTORY</span>
              <span className="text-emerald-400">data/servers/{server.id}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Server Confirmation */}
      {showDeleteServerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-4 border border-rose-500/30">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">Delete Server Instance?</h3>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently delete server <strong className="text-white font-mono">{server.name}</strong>?
              All code and files in <code className="text-slate-200 font-mono">data/servers/{server.id}</code> will be removed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteServerModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteServerModal(false);
                  onDelete(server.id);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl"
              >
                Yes, Delete Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
