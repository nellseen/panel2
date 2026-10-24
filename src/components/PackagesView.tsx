import React, { useState, useEffect } from 'react';
import {
  Package,
  CheckCircle2,
  Download,
  Trash2,
  Search,
  RefreshCw,
  Terminal,
  Loader2,
  Cpu,
} from 'lucide-react';
import { PackageSpec, EnvironmentInfo } from '../types';
import { fetchPackages, installPackage, uninstallPackage } from '../services/api';

interface PackagesViewProps {
  runtime: EnvironmentInfo | null;
}

export const PackagesView: React.FC<PackagesViewProps> = ({ runtime }) => {
  const [packages, setPackages] = useState<PackageSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [activeOp, setActiveOp] = useState('');
  const [modalOutput, setModalOutput] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const res = await fetchPackages();
      setPackages(res.packages);
      setIsBusy(res.is_busy);
      setActiveOp(res.active_op);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleInstall = async (pkg: PackageSpec) => {
    try {
      setActionLoading(pkg.id);
      setModalOutput(`[nodepanel] Queuing install of ${pkg.name} via ${runtime?.package_manager || 'system PM'}...\n`);
      const res = await installPackage(pkg.id);
      setModalOutput((prev) => (prev || '') + '\n' + res.output);
      loadPackages();
    } catch (err: any) {
      setModalOutput((prev) => (prev || '') + `\nInstallation Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async (pkg: PackageSpec) => {
    if (!confirm(`Are you sure you want to uninstall ${pkg.name}?`)) return;
    try {
      setActionLoading(pkg.id);
      setModalOutput(`[nodepanel] Removing ${pkg.name}...\n`);
      const res = await uninstallPackage(pkg.id);
      setModalOutput((prev) => (prev || '') + '\n' + res.output);
      loadPackages();
    } catch (err: any) {
      setModalOutput((prev) => (prev || '') + `\nUninstall Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = packages.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">System Packages</h2>
          <p className="text-xs text-slate-400">
            Environment-aware global packages mapped to <span className="font-mono text-emerald-400">{runtime?.package_manager || 'system package manager'}</span>
          </p>
        </div>

        <button
          onClick={loadPackages}
          className="p-2 text-slate-400 hover:text-white glass-panel rounded-xl self-start sm:self-auto"
          title="Refresh package states"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Package Manager Environment Banner (Bento Glass Card) */}
      <div className="glass-panel glass-specular rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-400" />
            <span>Active Manager: <strong className="text-emerald-400 font-mono">{runtime?.package_manager || 'None detected'}</strong></span>
          </div>
          <p className="text-xs text-slate-400">
            {runtime?.type === 'termux_native'
              ? 'Native Termux: uses pkg package manager without root privilege requirement.'
              : runtime?.type === 'ubuntu_proot'
              ? 'Ubuntu PRoot Distro: uses apt-get repository with full glibc environment.'
              : 'Linux environment: automated package manager detection and safety locking.'}
          </p>
        </div>

        {isBusy && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Lock engaged: {activeOp}</span>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search package name, command or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full glass-panel rounded-xl pl-10 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400/50 transition-colors"
        />
      </div>

      {/* Bento Grid of Packages */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((pkg) => {
          const isCurrentLoading = actionLoading === pkg.id;

          return (
            <div
              key={pkg.id}
              className="glass-panel glass-specular glass-panel-hover rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white text-sm">{pkg.name}</h3>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Command: <code className="text-slate-200">{pkg.executable}</code>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400">
                    {pkg.installed ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Installed
                      </span>
                    ) : (
                      'Available'
                    )}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">{pkg.description}</p>

                {pkg.installed && pkg.version && (
                  <div className="text-[11px] font-mono text-slate-400 bg-black/30 p-2 rounded-xl border border-white/[0.04] truncate">
                    {pkg.version}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  Package: {pkg.pkg_map[runtime?.package_manager || 'pkg'] || pkg.id}
                </span>

                <div className="flex items-center gap-2">
                  {pkg.installed ? (
                    pkg.id !== 'git' && (
                      <button
                        onClick={() => handleUninstall(pkg)}
                        disabled={isCurrentLoading || isBusy}
                        className="flex items-center gap-1 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Uninstall</span>
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handleInstall(pkg)}
                      disabled={isCurrentLoading || isBusy}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50"
                    >
                      {isCurrentLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                      )}
                      <span>Install</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Package Operation Terminal Output Modal */}
      {modalOutput !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-white/20 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Package Manager Output</span>
              </h4>
              <button
                onClick={() => setModalOutput(null)}
                className="text-xs text-slate-300 hover:text-white px-3 py-1 bg-white/[0.08] rounded-lg"
              >
                Close
              </button>
            </div>
            <pre className="bg-black/40 p-4 rounded-xl font-mono text-xs text-slate-200 max-h-80 overflow-y-auto whitespace-pre-wrap">
              {modalOutput}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
