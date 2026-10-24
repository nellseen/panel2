import React, { useState } from 'react';
import { X, GitBranch, Layers, AlertCircle, Loader2, Play } from 'lucide-react';
import { CreateServerPayload, AutoRestartPolicy } from '../types';
import { cloneGitRepo } from '../services/api';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: CreateServerPayload) => Promise<void>;
  onServerCreated: (serverId: string) => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  onServerCreated,
}) => {
  const [tab, setTab] = useState<'template' | 'git'>('template');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [port, setPort] = useState<number>(3001);
  const [template, setTemplate] = useState<'express_api' | 'basic_http' | 'background_worker' | 'blank'>('express_api');
  const [autoRestart, setAutoRestart] = useState<AutoRestartPolicy>('on-failure');

  // Git Form State
  const [repoURL, setRepoURL] = useState('');
  const [branch, setBranch] = useState('');
  const [gitName, setGitName] = useState('');
  const [autoInstall, setAutoInstall] = useState(true);
  const [gitLogs, setGitLogs] = useState<string>('');

  if (!isOpen) return null;

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a server name');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        port: Number(port) || 3001,
        template,
        auto_restart: autoRestart,
        entry_file: 'index.js',
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create server');
    } finally {
      setLoading(false);
    }
  };

  const handleGitClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoURL.trim()) {
      setError('Repository URL is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setGitLogs('Initiating secure Git clone operation in local environment...\n');

      const res = await cloneGitRepo({
        repo_url: repoURL.trim(),
        branch: branch.trim() || undefined,
        name: gitName.trim() || undefined,
        auto_install: autoInstall,
      });

      setGitLogs((prev) => prev + (res.output || 'Done!\n'));
      setTimeout(() => {
        onServerCreated(res.server.id);
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Git clone failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="glass-panel glass-specular rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative my-auto max-h-[92vh] overflow-y-auto border border-white/20">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-white mb-1">Create Node.js Instance</h3>
        <p className="text-xs text-slate-400 mb-5">
          Deploy an application managed directly by the Termux supervisor
        </p>

        {/* Tabs: Starter Template vs Git Clone */}
        <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/[0.06] mb-5">
          <button
            type="button"
            onClick={() => {
              setTab('template');
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'template'
                ? 'bg-white/10 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Preset Template</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('git');
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'git'
                ? 'bg-white/10 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Git Repository</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Template Form */}
        {tab === 'template' && (
          <form onSubmit={handleCreateTemplate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Server Name <span className="text-emerald-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. My API Microservice"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/50 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Port</label>
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 3001)}
                  className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Auto-Restart</label>
                <select
                  value={autoRestart}
                  onChange={(e) => setAutoRestart(e.target.value as AutoRestartPolicy)}
                  className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400/50"
                >
                  <option value="never">Never (Manual)</option>
                  <option value="on-failure">On-Failure</option>
                  <option value="always">Always</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Architecture Template</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  {
                    id: 'express_api',
                    name: 'Express REST API',
                    desc: 'JSON endpoints with pre-configured health check router',
                  },
                  {
                    id: 'basic_http',
                    name: 'Basic HTTP Server',
                    desc: 'Zero-dependency native Node.js http server',
                  },
                  {
                    id: 'background_worker',
                    name: 'Background Worker',
                    desc: 'Continuous loop task with clean SIGTERM handling',
                  },
                  {
                    id: 'blank',
                    name: 'Blank Node.js',
                    desc: 'Minimal skeleton with empty package.json & index.js',
                  },
                ].map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setTemplate(t.id as any)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      template === t.id
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-white shadow-sm'
                        : 'bg-black/20 border-white/[0.05] text-slate-400 hover:border-white/[0.1]'
                    }`}
                  >
                    <div className="font-semibold text-xs mb-0.5">{t.name}</div>
                    <div className="text-[11px] text-slate-400 leading-tight">{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
              <textarea
                rows={2}
                placeholder="Brief notes about this service..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs shadow-md transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{loading ? 'Creating...' : 'Create Server'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Git Clone Form */}
        {tab === 'git' && (
          <form onSubmit={handleGitClone} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Git Repository URL <span className="text-cyan-400">*</span>
              </label>
              <input
                type="url"
                required
                placeholder="https://github.com/username/my-node-project.git"
                value={repoURL}
                onChange={(e) => setRepoURL(e.target.value)}
                className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Server Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Defaults to repo name"
                  value={gitName}
                  onChange={(e) => setGitName(e.target.value)}
                  className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Branch (Optional)</label>
                <input
                  type="text"
                  placeholder="main / master"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400/50"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={autoInstall}
                onChange={(e) => setAutoInstall(e.target.checked)}
                className="rounded border-white/20 text-cyan-500 focus:ring-0 bg-black/40"
              />
              <span className="text-xs text-slate-300">
                Run <code className="text-cyan-400 font-mono">npm install</code> if package.json exists
              </span>
            </label>

            {gitLogs && (
              <div className="bg-black/40 p-3 rounded-xl border border-white/[0.06] font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap">
                {gitLogs}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs shadow-md transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                <span>{loading ? 'Cloning Repo...' : 'Clone & Create'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
