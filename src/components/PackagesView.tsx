import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Package,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { EnvironmentInfo, PackageSpec, ToastItem } from '../types';
import { fetchPackages, installPackage, uninstallPackage } from '../services/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CodeText,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  Skeleton,
} from './ui';
import { isAbortError, normalizeError } from '../utils/errors';

export interface PackagesViewProps {
  runtime: EnvironmentInfo | null;
  onNotify?: (title: string, variant?: ToastItem['variant'], description?: string) => void;
}

export const PackagesView: React.FC<PackagesViewProps> = ({ runtime, onNotify }) => {
  const [packages, setPackages] = useState<PackageSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [activeOp, setActiveOp] = useState('');
  const [modalOutput, setModalOutput] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmUninstallPkg, setConfirmUninstallPkg] = useState<PackageSpec | null>(null);

  const loadPackages = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const res = await fetchPackages({ signal });
      setPackages(res.packages);
      setIsBusy(res.is_busy);
      setActiveOp(res.active_op);
      setError(null);
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      setError(normalizeError(err, 'Failed to load package registry').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      void loadPackages(controller.signal);
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
      controller.abort();
    };
  }, [loadPackages]);

  const handleInstall = async (pkg: PackageSpec) => {
    try {
      setActionLoading(pkg.id);
      setModalOutput(
        `[nodepanel] Installing ${pkg.name} via ${runtime?.package_manager || 'system package manager'}...\n`
      );
      const res = await installPackage(pkg.id);
      setModalOutput((prev) => `${prev || ''}\n${res.output}`);
      onNotify?.(`Installed ${pkg.name}`, 'success');
      await loadPackages();
    } catch (err: unknown) {
      const msg = normalizeError(err, 'Package installation failed').message;
      setModalOutput((prev) => `${prev || ''}\n[error] ${msg}`);
      onNotify?.('Package install failed', 'error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async (pkg: PackageSpec) => {
    setConfirmUninstallPkg(null);
    try {
      setActionLoading(pkg.id);
      setModalOutput(`[nodepanel] Removing ${pkg.name}...\n`);
      const res = await uninstallPackage(pkg.id);
      setModalOutput((prev) => `${prev || ''}\n${res.output}`);
      onNotify?.(`Removed ${pkg.name}`, 'info');
      await loadPackages();
    } catch (err: unknown) {
      const msg = normalizeError(err, 'Package removal failed').message;
      setModalOutput((prev) => `${prev || ''}\n[error] ${msg}`);
      onNotify?.('Package uninstall failed', 'error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = packages.filter((p) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.executable.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Packages"
        description={`Environment-aware host toolchain packages mapped to ${
          runtime?.package_manager && runtime.package_manager !== 'none'
            ? runtime.package_manager
            : 'detected system package manager'
        }.`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => void loadPackages()}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert
          variant="error"
          title="Unable to query host packages"
          action={
            <Button variant="secondary" size="sm" onClick={() => void loadPackages()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {isBusy && (
        <Alert variant="warning" title="Package manager lock active">
          Operation <CodeText>{activeOp}</CodeText> is currently running. Concurrent package mutations are serialized to prevent lock contention.
        </Alert>
      )}

      <Card padding="md" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-[#F3F5F8] flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>
              Active Package Manager:{' '}
              <CodeText>{runtime?.package_manager || 'none'}</CodeText>
            </span>
          </div>
          <p className="text-xs text-[#8A94A6]">
            {runtime?.type === 'android_native'
              ? 'Termux native sandbox: installs packages into $PREFIX without root privileges.'
              : runtime?.type === 'ubuntu_proot'
              ? 'Ubuntu PRoot container: uses APT repositories with full glibc compatibility.'
              : 'Standard Linux host: executes package commands asynchronously with shell: false.'}
          </p>
        </div>

        <div className="w-full sm:w-72">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter packages..."
            aria-label="Filter system packages"
          />
        </div>
      </Card>

      {loading && packages.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="w-7 h-7" />}
          title="No packages matched"
          description="Try clearing your search filter to view all curated host utilities."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((pkg) => {
            const isCurrentLoading = actionLoading === pkg.id;
            const mappedPkg = pkg.pkg_map[runtime?.package_manager || 'apt-get'] || pkg.id;

            return (
              <Card key={pkg.id} padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#F3F5F8]">{pkg.name}</h3>
                      <div className="text-xs text-[#8A94A6] mt-0.5 flex items-center gap-2">
                        <span>Binary:</span>
                        <CodeText>{pkg.executable}</CodeText>
                        <span className="text-[#4B5565]">·</span>
                        <span>{pkg.category}</span>
                      </div>
                    </div>

                    {pkg.installed ? (
                      <Badge tone="success">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        <span>Installed</span>
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Not Installed</Badge>
                    )}
                  </div>

                  <p className="text-xs text-[#A2AAB8] leading-relaxed">{pkg.description}</p>

                  {pkg.installed && (pkg.version || pkg.path) && (
                    <div className="rounded-lg bg-[#090B0E] border border-[#1A1E26] px-3 py-2 font-mono text-[11px] text-[#8A94A6] truncate">
                      {pkg.version || 'Installed'}
                      {pkg.path ? ` · ${pkg.path}` : ''}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#181C24] flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-[#697386]">
                    Target: {mappedPkg}
                  </span>

                  {pkg.installed ? (
                    pkg.id !== 'git' ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isBusy || Boolean(actionLoading)}
                        loading={isCurrentLoading}
                        onClick={() => setConfirmUninstallPkg(pkg)}
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        Uninstall
                      </Button>
                    ) : (
                      <span className="text-[11px] text-[#697386]">Protected core binary</span>
                    )
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isBusy || Boolean(actionLoading)}
                      loading={isCurrentLoading}
                      onClick={() => void handleInstall(pkg)}
                      leftIcon={<Download className="w-3.5 h-3.5" />}
                    >
                      Install
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmUninstallPkg)}
        onClose={() => setConfirmUninstallPkg(null)}
        onConfirm={() => {
          if (confirmUninstallPkg) {
            void handleUninstall(confirmUninstallPkg);
          }
        }}
        title="Uninstall System Package?"
        confirmLabel="Uninstall"
        description={
          confirmUninstallPkg ? (
            <>
              Remove <strong className="text-[#F3F5F8]">{confirmUninstallPkg.name}</strong> from the
              host environment? Managed servers relying on{' '}
              <CodeText>{confirmUninstallPkg.executable}</CodeText> may stop functioning.
            </>
          ) : null
        }
      />

      <Modal
        isOpen={modalOutput !== null}
        onClose={() => setModalOutput(null)}
        title="Package Operation Output"
        size="lg"
        preventClose={Boolean(actionLoading)}
        footer={
          <Button
            variant="secondary"
            size="sm"
            disabled={Boolean(actionLoading)}
            onClick={() => setModalOutput(null)}
          >
            Close
          </Button>
        }
      >
        <pre className="rounded-lg bg-[#090B0E] border border-[#1F242D] p-4 font-mono text-xs text-[#E2E8F0] max-h-80 overflow-y-auto whitespace-pre-wrap">
          {modalOutput}
        </pre>
      </Modal>
    </div>
  );
};
