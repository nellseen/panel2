import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  Code2,
  Cpu,
  ExternalLink,
  FolderTree,
  Github,
  HardDrive,
  Layers,
  Menu,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { Button, IconButton } from './ui';
import { getAboutConfig } from '../config/about';

export interface LandingPageViewProps {
  onStartNow: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({ onStartNow }) => {
  const [showTopBanner, setShowTopBanner] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<'logs' | 'metrics' | 'topology'>('logs');
  const [copiedInstallCmd, setCopiedInstallCmd] = useState(false);

  const aboutConfig = getAboutConfig();
  const currentYear = new Date().getFullYear();

  const handleCopyCmd = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText('npm run dev');
      setCopiedInstallCmd(true);
      setTimeout(() => setCopiedInstallCmd(false), 2000);
    }
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#08090B] text-[#F3F5F8] font-sans antialiased selection:bg-emerald-500/25 selection:text-emerald-200">
      {/* =========================================================================
          Top Announcement Banner (Dismissible)
          ========================================================================= */}
      {showTopBanner && (
        <div
          role="region"
          aria-label="Pengumuman rilis NodePanel"
          className="bg-gradient-to-r from-[#0C1210] via-[#102219] to-[#0C1210] border-b border-emerald-500/25 px-4 py-2 text-xs text-[#D0D7E2] relative z-50 animate-in fade-in duration-200"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex-1 flex items-center justify-center gap-2 text-center flex-wrap">
              <span className="font-semibold text-emerald-400 inline-flex items-center gap-1.5 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>NodePanel v1.0 Siap Digunakan</span>
              </span>
              <span className="text-[#323A48] hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="text-[#A2AAB8]">
                Panel proses Node.js super ringan untuk mobile Linux Termux dan server
              </span>
              <button
                type="button"
                onClick={onStartNow}
                className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1 underline underline-offset-2 transition-colors cursor-pointer"
              >
                <span>Buka Dashboard</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTopBanner(false)}
              aria-label="Tutup pengumuman"
              title="Tutup banner"
              className="text-[#697386] hover:text-[#F3F5F8] p-1 rounded transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          Top Bar Contract: [Brand Wordmark] — [Nav Links] — [Primary Action]
          ========================================================================= */}
      <header className="sticky top-0 z-40 w-full bg-[#08090B]/90 backdrop-blur-md border-b border-[#1A1E26]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 text-base font-bold tracking-tight text-[#F3F5F8] whitespace-nowrap shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg p-1"
          >
            <div className="h-8 w-8 rounded-lg bg-[#12151B] border border-[#262C36] flex items-center justify-center shrink-0 group-hover:border-emerald-500/40 transition-colors">
              <Terminal className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            </div>
            <span>NodePanel</span>
          </a>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Landing page navigation"
            className="hidden md:flex items-center gap-8 text-xs font-medium text-[#A2AAB8]"
          >
            <button
              type="button"
              onClick={() => scrollToSection('tentang')}
              className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap cursor-pointer"
            >
              Tentang
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('fitur')}
              className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap cursor-pointer"
            >
              Fitur
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('arsitektur')}
              className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap cursor-pointer"
            >
              Arsitektur
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('kredit')}
              className="hover:text-[#F3F5F8] transition-colors whitespace-nowrap cursor-pointer"
            >
              Kredit
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            {aboutConfig.repositoryUrl && (
              <a
                href={aboutConfig.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                title="View GitHub Repository"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A2AAB8] hover:text-[#F3F5F8] bg-[#12151B] hover:bg-[#1A1F29] border border-[#242A35] rounded-lg transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </a>
            )}

            <Button
              variant="primary"
              size="md"
              onClick={onStartNow}
              rightIcon={<ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />}
            >
              Mulai Sekarang
            </Button>

            {/* Mobile hamburger button */}
            <div className="md:hidden">
              <IconButton
                aria-label="Toggle navigation menu"
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen((v) => !v)}
                icon={mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              />
            </div>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-[#1A1E26] bg-[#0E1014] px-4 py-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
            <button
              type="button"
              onClick={() => scrollToSection('tentang')}
              className="block w-full text-left py-2 text-sm text-[#A2AAB8] hover:text-[#F3F5F8]"
            >
              Tentang
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('fitur')}
              className="block w-full text-left py-2 text-sm text-[#A2AAB8] hover:text-[#F3F5F8]"
            >
              Fitur Utama
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('arsitektur')}
              className="block w-full text-left py-2 text-sm text-[#A2AAB8] hover:text-[#F3F5F8]"
            >
              Arsitektur Sistem
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('kredit')}
              className="block w-full text-left py-2 text-sm text-[#A2AAB8] hover:text-[#F3F5F8]"
            >
              Dibuat Oleh & Kredit
            </button>
            <div className="pt-2 border-t border-[#1F242D] flex items-center justify-between">
              {aboutConfig.repositoryUrl && (
                <a
                  href={aboutConfig.repositoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#8A94A6] hover:text-[#F3F5F8]"
                >
                  <Github className="w-4 h-4" />
                  <span>GitHub Repository</span>
                </a>
              )}
              <Button variant="primary" size="sm" onClick={onStartNow}>
                Buka Dashboard
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          SECTION A — HERO / IDENTITAS & TUJUAN WEBSITE
          ========================================================================= */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 overflow-hidden border-b border-[#14171D]">
        {/* Subtle radial glow anchor */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[360px] bg-emerald-500/6 blur-[120px] rounded-full pointer-events-none"
          aria-hidden="true"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Unboxed category lead-in */}
          <div className="flex items-center gap-2 text-xs font-mono tracking-wide text-emerald-400 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span>Developer Process & Server Control Panel</span>
            <span className="text-[#323A48]" aria-hidden="true">
              ·
            </span>
            <span className="text-[#8A94A6]">Node.js 22 Runtime</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Hero Statement */}
            <div className="lg:col-span-6 space-y-6">
              <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-[#F3F5F8] leading-[1.1] text-balance">
                Your Servers. One Powerful Control Panel.
              </h1>

              <p className="text-base sm:text-lg text-[#A2AAB8] leading-relaxed max-w-xl text-pretty">
                Kelola server Node.js, pantau proses realtime, jalankan command terminal, dan awasi
                aktivitas project melalui satu control panel yang dirancang khusus untuk mobile Linux
                dan server developer.
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onStartNow}
                  rightIcon={<ArrowRight className="w-4 h-4 stroke-[2.5]" />}
                  className="shadow-lg shadow-emerald-500/10"
                >
                  Mulai Sekarang
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => scrollToSection('fitur')}
                >
                  Pelajari Fitur
                </Button>
              </div>

              {/* Unboxed Metadata Trust Strips */}
              <div className="pt-4 border-t border-[#181C24] flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-[#8A94A6]">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Process Group Isolation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Zero Zombie Processes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>WebSocket Realtime</span>
                </div>
              </div>
            </div>

            {/* Right Supporting Visual: Authentic Interactive Developer Preview */}
            <div className="lg:col-span-6">
              <div className="rounded-xl border border-[#242A35] bg-[#0E1014] shadow-2xl overflow-hidden">
                {/* Console Window Header */}
                <div className="h-10 px-4 bg-[#14171D] border-b border-[#1F242D] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2B313D]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2B313D]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2B313D]" />
                    <span className="ml-2 text-xs font-mono text-[#8A94A6]">
                      srv-api-gateway :3400
                    </span>
                  </div>

                  {/* Interactive preview tabs */}
                  <div className="flex items-center gap-1 p-0.5 bg-[#0A0C0F] rounded-md border border-[#1F242D]">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('logs')}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                        previewTab === 'logs'
                          ? 'bg-[#1C212B] text-emerald-300'
                          : 'text-[#697386] hover:text-[#A2AAB8]'
                      }`}
                    >
                      Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('metrics')}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                        previewTab === 'metrics'
                          ? 'bg-[#1C212B] text-emerald-300'
                          : 'text-[#697386] hover:text-[#A2AAB8]'
                      }`}
                    >
                      Metrics
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('topology')}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                        previewTab === 'topology'
                          ? 'bg-[#1C212B] text-emerald-300'
                          : 'text-[#697386] hover:text-[#A2AAB8]'
                      }`}
                    >
                      Supervisor
                    </button>
                  </div>
                </div>

                {/* Console Instance Status Bar */}
                <div className="px-4 py-3 bg-[#11141A] border-b border-[#1F242D] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      <span>Online</span>
                    </div>
                    <span className="text-[#323A48]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[#A2AAB8] font-mono">PID: 4821</span>
                    <span className="text-[#323A48]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[#A2AAB8] font-mono">Port: 3400</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-[#8A94A6]">
                    <span>RSS 44.2 MB</span>
                    <span className="text-[#323A48]" aria-hidden="true">
                      ·
                    </span>
                    <span>CPU 1.4%</span>
                  </div>
                </div>

                {/* Preview Content Area */}
                <div className="p-4 font-mono text-xs h-64 overflow-y-auto bg-[#0A0C0F] leading-relaxed">
                  {previewTab === 'logs' && (
                    <div className="space-y-1 text-[#A2AAB8]">
                      <p className="text-[#697386]">[13:20:02][system] Process spawned in process group (-4821)</p>
                      <p className="text-emerald-400/90">[13:20:03][stdout] [Order Service] Express Server listening on http://0.0.0.0:3400</p>
                      <p className="text-[#A2AAB8]">[13:20:04][stdout] Database connection pool initialized (5 clients)</p>
                      <p className="text-cyan-400/90">[13:20:06][system] WebSocket telemetry channel attached to client</p>
                      <p className="text-[#A2AAB8]">[13:20:12][stdout] GET /api/ping 200 OK (2.1ms)</p>
                      <p className="text-[#A2AAB8]">[13:20:18][stdout] GET /api/orders?status=active 200 OK (8.4ms)</p>
                      <p className="text-emerald-400/90">[13:20:25][stdout] Periodic background health-check passed: 0 memory leaks</p>
                      <p className="text-[#697386] flex items-center gap-1.5">
                        <span className="w-1.5 h-3 bg-emerald-400 animate-pulse inline-block" />
                        <span>Ready for incoming developer requests...</span>
                      </p>
                    </div>
                  )}

                  {previewTab === 'metrics' && (
                    <div className="space-y-3 font-sans">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-[#11141A] rounded-lg border border-[#1F242D]">
                          <div className="text-[11px] text-[#697386] uppercase tracking-wider font-mono">Resident Memory (RSS)</div>
                          <div className="text-lg font-bold font-mono text-[#F3F5F8] mt-1 tabular-nums">44.2 MB</div>
                          <div className="text-xs text-emerald-400 mt-0.5">Procfs verified (/proc/4821/status)</div>
                        </div>
                        <div className="p-3 bg-[#11141A] rounded-lg border border-[#1F242D]">
                          <div className="text-[11px] text-[#697386] uppercase tracking-wider font-mono">CPU Core Load</div>
                          <div className="text-lg font-bold font-mono text-[#F3F5F8] mt-1 tabular-nums">1.4%</div>
                          <div className="text-xs text-emerald-400 mt-0.5">Differential clock ticks</div>
                        </div>
                      </div>
                      <div className="p-3 bg-[#11141A] rounded-lg border border-[#1F242D] space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#A2AAB8]">Process Tree Stability</span>
                          <span className="text-emerald-400 font-mono">100% Uptime</span>
                        </div>
                        <div className="h-1.5 w-full bg-[#1A1F29] rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full w-[100%]" />
                        </div>
                        <div className="flex justify-between text-[11px] text-[#697386] font-mono">
                          <span>Auto-restart policy: on-failure</span>
                          <span>Grace timeout: 3000ms</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewTab === 'topology' && (
                    <div className="space-y-3 font-sans">
                      <div className="p-3 bg-[#11141A] rounded-lg border border-[#1F242D] flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#F3F5F8]">NodePanel Supervisor Daemon</div>
                          <div className="text-[11px] text-[#8A94A6]">Port 3000 (Host 0.0.0.0)</div>
                        </div>
                        <span className="text-xs font-mono text-emerald-400">Master</span>
                      </div>
                      <div className="pl-6 border-l-2 border-[#1F242D] space-y-2">
                        <div className="p-2.5 bg-[#14171D] rounded-lg border border-[#242A35] flex items-center justify-between text-xs">
                          <div>
                            <span className="font-mono text-emerald-400">node index.js</span>
                            <span className="text-[#697386] ml-2">(PID 4821)</span>
                          </div>
                          <span className="text-[11px] font-mono text-[#8A94A6]">:3400</span>
                        </div>
                        <div className="p-2 bg-[#0E1014] rounded-md border border-[#1F242D] text-[11px] text-[#8A94A6]">
                          ✓ Process group cleanup guard: killProcessTree(child, SIGTERM)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Console Footer Action */}
                <div className="p-3 bg-[#11141A] border-t border-[#1F242D] flex items-center justify-between">
                  <div className="text-[11px] text-[#8A94A6]">
                    Mulai kelola instance kamu langsung di control panel
                  </div>
                  <Button variant="outline" size="sm" onClick={onStartNow}>
                    Buka Console
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          PLATFORM CAPABILITY SHOWCASE BANNER
          ========================================================================= */}
      <section
        aria-label="Platform Highlights"
        className="border-b border-[#14171D] bg-[#0A0C0F] py-6 relative"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-xs text-[#A2AAB8]">
            <div className="flex items-center gap-3 p-3.5 bg-[#0E1014] rounded-xl border border-[#1A1F29] hover:border-emerald-500/25 transition-colors">
              <div className="h-9 w-9 rounded-lg bg-[#14171D] border border-[#242A35] flex items-center justify-center shrink-0 text-emerald-400">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[#F3F5F8] truncate">Termux & Proot Native</div>
                <div className="text-[11px] text-[#697386] truncate">Android Linux ready</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 bg-[#0E1014] rounded-xl border border-[#1A1F29] hover:border-emerald-500/25 transition-colors">
              <div className="h-9 w-9 rounded-lg bg-[#14171D] border border-[#242A35] flex items-center justify-center shrink-0 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[#F3F5F8] truncate">Zero Zombie Processes</div>
                <div className="text-[11px] text-[#697386] truncate">Clean process-tree kill</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 bg-[#0E1014] rounded-xl border border-[#1A1F29] hover:border-emerald-500/25 transition-colors">
              <div className="h-9 w-9 rounded-lg bg-[#14171D] border border-[#242A35] flex items-center justify-center shrink-0 text-emerald-400">
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[#F3F5F8] truncate">Atomic JSON Storage</div>
                <div className="text-[11px] text-[#697386] truncate">No external DB required</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 bg-[#0E1014] rounded-xl border border-[#1A1F29] hover:border-emerald-500/25 transition-colors">
              <div className="h-9 w-9 rounded-lg bg-[#14171D] border border-[#242A35] flex items-center justify-center shrink-0 text-emerald-400">
                <Zap className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[#F3F5F8] truncate">Duplex WebSocket</div>
                <div className="text-[11px] text-[#697386] truncate">Live logs & telemetry</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION B — TENTANG NODEPANEL
          ========================================================================= */}
      <section id="tentang" className="py-20 border-b border-[#14171D] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-xs font-mono text-emerald-400 tracking-wider uppercase mb-2">
              01. Tentang Project
            </h2>
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F5F8]">
              Dibuat untuk Pengembang yang Membutuhkan Kontrol Penuh Tanpa Beban
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 text-[#A2AAB8] text-sm leading-relaxed">
            <div className="space-y-4">
              <h4 className="text-base font-semibold text-[#F3F5F8]">Apa Itu NodePanel?</h4>
              <p>
                NodePanel adalah control panel berbasis web yang ringan dan modular, dirancang khusus
                untuk mengelola proses, server, dan repositori Node.js pada lingkungan mobile Linux
                (seperti Termux dan proot-distro Ubuntu) maupun server Linux minimalis.
              </p>
              <p>
                Aplikasi ini menggabungkan kesederhanaan antarmuka web modern dengan keandalan daemon
                supervisi tingkat kernel. Anda tidak lagi perlu bergantung pada GUI desktop yang berat
                atau container rumit untuk mengawasi microservice lokal Anda.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="text-base font-semibold text-[#F3F5F8]">Masalah yang Diselesaikan</h4>
              <p>
                Di lingkungan mobile Linux, menjalankan server di background via shell manual sering
                kali menimbulkan proses orphan (zombie) saat sesi terminal tertutup secara tiba-tiba,
                atau server crash berulang kali tanpa terdeteksi sehingga menguras baterai dan memori.
              </p>
              <p>
                NodePanel menyelesaikan masalah ini dengan manajemen process group otomatis yang
                memastikan pembersihan tree proses secara bersih saat dihentikan, perlindungan crash
                loop beruntun, serta penyimpanan state berbasis atomic JSON yang tahan restart.
              </p>
            </div>
          </div>

          {/* Three Structural Benefit Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12 pt-8 border-t border-[#181C24]">
            <div className="p-5 bg-[#0E1014] rounded-xl border border-[#1F242D] space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <Shield className="w-4 h-4" />
              </div>
              <h5 className="font-semibold text-sm text-[#F3F5F8]">Process Tree Sanitization</h5>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                Setiap instance dijalankan dengan process group terpisah sehingga penutupan server
                membersihkan seluruh child process tanpa meninggalkan memory leak.
              </p>
            </div>

            <div className="p-5 bg-[#0E1014] rounded-xl border border-[#1F242D] space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <HardDrive className="w-4 h-4" />
              </div>
              <h5 className="font-semibold text-sm text-[#F3F5F8]">Atomic Local Storage</h5>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                Penyimpanan konfigurasi menggunakan file JSON terstruktur dengan teknik write-and-rename
                atomik, bebas dari dependensi database eksternal yang lambat.
              </p>
            </div>

            <div className="p-5 bg-[#0E1014] rounded-xl border border-[#1F242D] space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <Zap className="w-4 h-4" />
              </div>
              <h5 className="font-semibold text-sm text-[#F3F5F8]">Sub-millisecond Duplex WS</h5>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                Log stdout/stderr dan interaksi terminal dialirkan secara instan ke browser dengan
                reconnection exponential backoff dan jitter adaptif.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION C — FITUR UTAMA
          ========================================================================= */}
      <section id="fitur" className="py-20 border-b border-[#14171D]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-xs font-mono text-emerald-400 tracking-wider uppercase mb-2">
              02. Fitur Utama
            </h2>
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F5F8]">
              Arsitektur Lengkap untuk Siklus Hidup Node.js
            </h3>
            <p className="text-sm text-[#A2AAB8] mt-2">
              Fitur yang benar-benar terintegrasi dan berfungsi langsung pada repository NodePanel.
            </p>
          </div>

          {/* Bento-grid layout of real features */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: Server Management */}
            <div className="p-6 bg-[#0E1014] rounded-xl border border-[#1F242D] hover:border-[#2B313D] transition-colors space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <Server className="w-4 h-4" />
              </div>
              <h4 className="text-base font-semibold text-[#F3F5F8]">Server Management</h4>
              <p className="text-xs text-[#A2AAB8] leading-relaxed">
                Pembuatan, pengaturan port terisolasi, start, stop, restart, dan penghapusan server
                dengan kebijakan auto-restart terukur (never, always, on-failure).
              </p>
              <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
                Port allocation · Env variables · Auto-recovery
              </div>
            </div>

            {/* Feature 2: Real-time Terminal */}
            <div className="p-6 bg-[#0E1014] rounded-xl border border-[#1F242D] hover:border-[#2B313D] transition-colors space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <Terminal className="w-4 h-4" />
              </div>
              <h4 className="text-base font-semibold text-[#F3F5F8]">Real-time Terminal & Jobs</h4>
              <p className="text-xs text-[#A2AAB8] leading-relaxed">
                Eksekusi command interaktif langsung dari antarmuka web, pemantauan status exit code,
                durasi eksekusi, serta terminasi proses yang responsif.
              </p>
              <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
                Live stdout/stderr · Background job center · Exit codes
              </div>
            </div>

            {/* Feature 3: Process Telemetry */}
            <div className="p-6 bg-[#0E1014] rounded-xl border border-[#1F242D] hover:border-[#2B313D] transition-colors space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <Cpu className="w-4 h-4" />
              </div>
              <h4 className="text-base font-semibold text-[#F3F5F8]">Process Monitoring</h4>
              <p className="text-xs text-[#A2AAB8] leading-relaxed">
                Inspeksi berkala terhadap memori RSS aktual via Linux procfs, persentase CPU dengan
                diferensial clock ticks, dan durasi uptime proses yang akurat.
              </p>
              <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
                Native procfs reader · RSS memory MB · CPU load %
              </div>
            </div>

            {/* Feature 4: Sandboxed File Manager */}
            <div className="p-6 bg-[#0E1014] rounded-xl border border-[#1F242D] hover:border-[#2B313D] transition-colors space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <FolderTree className="w-4 h-4" />
              </div>
              <h4 className="text-base font-semibold text-[#F3F5F8]">Sandboxed File Explorer</h4>
              <p className="text-xs text-[#A2AAB8] leading-relaxed">
                Pengelolaan file direktori server yang aman dengan pencegahan path traversal, symlink
                escape protection, editor file bawaan, dan fitur download aman.
              </p>
              <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
                Path validation · Code editor · Safe file downloads
              </div>
            </div>

            {/* Feature 5: Runtime Diagnostics */}
            <div className="p-6 bg-[#0E1014] rounded-xl border border-[#1F242D] hover:border-[#2B313D] transition-colors space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <Stethoscope className="w-4 h-4" />
              </div>
              <h4 className="text-base font-semibold text-[#F3F5F8]">Runtime Diagnostics</h4>
              <p className="text-xs text-[#A2AAB8] leading-relaxed">
                Pemeriksaan otomatis lingkungan host (Native Termux, proot Ubuntu, atau Linux standar),
                kapasitas disk bebas, total RAM, dan verifikasi ketersediaan binary PATH.
              </p>
              <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
                Doctor report · Disk free MB · Tool PATH detection
              </div>
            </div>

            {/* Feature 6: Activity Audit Logs */}
            <div className="p-6 bg-[#0E1014] rounded-xl border border-[#1F242D] hover:border-[#2B313D] transition-colors space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[#14171D] border border-[#262C36] flex items-center justify-center text-emerald-400">
                <Activity className="w-4 h-4" />
              </div>
              <h4 className="text-base font-semibold text-[#F3F5F8]">Activity Audit Logs</h4>
              <p className="text-xs text-[#A2AAB8] leading-relaxed">
                Pencatatan riwayat kronologis lengkap untuk setiap lifecycle event server, aksi start/stop,
                perubahan file, dan proses instalasi dependensi.
              </p>
              <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
                Ordered event log · Server filtering · Status badges
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION D — ARSITEKTUR & KREDIT
          ========================================================================= */}
      <section id="arsitektur" className="py-20 border-b border-[#14171D]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Architecture Column */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <h2 className="text-xs font-mono text-emerald-400 tracking-wider uppercase mb-2">
                  03. Arsitektur Teknis
                </h2>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F5F8]">
                  Dirancang Ringan Tanpa Ketergantungan Eksternal Berat
                </h3>
              </div>

              <div className="space-y-4 text-sm text-[#A2AAB8] leading-relaxed">
                <div className="p-4 bg-[#0E1014] rounded-xl border border-[#1F242D] flex items-start gap-3">
                  <Layers className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-semibold text-[#F3F5F8] text-sm">Full-Stack Node.js Architecture</h5>
                    <p className="text-xs text-[#8A94A6] mt-1">
                      Express.js mengelola REST API dan integrasi WebSocket server pada satu port tunggal
                      (port 3000), disajikan bersama Vite middleware mode untuk performa frontend maksimal.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-[#0E1014] rounded-xl border border-[#1F242D] flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-semibold text-[#F3F5F8] text-sm">Strict Security & Path Traversal Guards</h5>
                    <p className="text-xs text-[#8A94A6] mt-1">
                      Semua operasi file melewati fungsi verifikasi canonical realpath untuk mencegah
                      akses keluar dari direktori instance maupun serangan manipulasi symbolic link.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-[#0E1014] rounded-xl border border-[#1F242D] flex items-start gap-3">
                  <Code2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-semibold text-[#F3F5F8] text-sm">Pure Native Compatibility</h5>
                    <p className="text-xs text-[#8A94A6] mt-1">
                      Bebas dari modul native C++ (node-gyp) yang kerap gagal dikompilasi pada perangkat
                      mobile non-root atau proot-distro minimalis.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Credits & Tech Stack Column */}
            <div id="kredit" className="lg:col-span-5 space-y-6">
              <div>
                <h2 className="text-xs font-mono text-emerald-400 tracking-wider uppercase mb-2">
                  04. Dibuat Oleh & Kredit
                </h2>
                <h3 className="text-xl font-bold tracking-tight text-[#F3F5F8]">
                  Pengembang & Kontributor
                </h3>
              </div>

              <div className="p-6 bg-[#0E1014] rounded-xl border border-[#1F242D] space-y-5">
                {/* Author Info */}
                <div className="flex items-center justify-between pb-4 border-b border-[#1F242D]">
                  <div>
                    <div className="text-xs text-[#697386]">Project Creator</div>
                    <div className="text-base font-semibold text-[#F3F5F8] mt-0.5">
                      {aboutConfig.authorName}
                    </div>
                  </div>
                  {aboutConfig.authorUrl && (
                    <a
                      href={aboutConfig.authorUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <span>Profil</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Verified Tech Stack */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[#8A94A6]">Teknologi Utama</div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[#A2AAB8]">
                    <div className="p-2 bg-[#14171D] rounded border border-[#1F242D]">
                      Node.js 22 LTS
                    </div>
                    <div className="p-2 bg-[#14171D] rounded border border-[#1F242D]">
                      Express.js & WS
                    </div>
                    <div className="p-2 bg-[#14171D] rounded border border-[#1F242D]">
                      React 19 & Vite 8
                    </div>
                    <div className="p-2 bg-[#14171D] rounded border border-[#1F242D]">
                      Tailwind CSS 4
                    </div>
                  </div>
                </div>

                {/* Open source notice */}
                <div className="pt-2 text-xs text-[#697386] space-y-1">
                  <div>Lisensi: {aboutConfig.license}</div>
                  <div>{aboutConfig.fallbackNote}</div>
                </div>

                {aboutConfig.repositoryUrl && (
                  <a
                    href={aboutConfig.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#14171D] hover:bg-[#1A1F29] border border-[#2B313D] rounded-lg text-xs font-medium text-[#F3F5F8] transition-colors"
                  >
                    <Github className="w-4 h-4" />
                    <span>Buka Repository GitHub</span>
                    <ExternalLink className="w-3 h-3 text-[#697386]" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION E — CALL TO ACTION (CTA)
          ========================================================================= */}
      <section className="py-20 border-b border-[#14171D] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#2B313D] bg-gradient-to-b from-[#11141A] to-[#0A0C0F] p-8 sm:p-12 relative overflow-hidden text-center space-y-6">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[240px] bg-emerald-500/8 blur-[100px] rounded-full pointer-events-none"
              aria-hidden="true"
            />

            <div className="relative max-w-2xl mx-auto space-y-4">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#F3F5F8] text-balance">
                Siap Mengelola Server Kamu?
              </h2>
              <p className="text-sm sm:text-base text-[#A2AAB8] leading-relaxed text-pretty">
                Masuk ke NodePanel sekarang dan mulai kelola instance, jalankan script, serta awasi
                telemetri proses langsung dari peramban web kamu.
              </p>

              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onStartNow}
                  rightIcon={<ArrowRight className="w-4 h-4 stroke-[2.5]" />}
                  className="shadow-xl shadow-emerald-500/15"
                >
                  Mulai Sekarang
                </Button>

                <button
                  type="button"
                  onClick={handleCopyCmd}
                  title="Copy start command"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#14171D] border border-[#2B313D] hover:bg-[#1C212B] text-xs font-mono text-[#D0D7E2] transition-colors cursor-pointer"
                >
                  <span>$ npm run dev</span>
                  {copiedInstallCmd ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="text-[11px] text-[#697386]">Salin</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION F — FOOTER
          ========================================================================= */}
      <footer className="py-12 bg-[#060709] text-xs text-[#8A94A6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pb-8 border-b border-[#14171D]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-[#0E1014] border border-[#242A35] flex items-center justify-center">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="font-semibold text-sm text-[#F3F5F8]">NodePanel</span>
              <span className="text-[#323A48]" aria-hidden="true">
                ·
              </span>
              <span className="text-xs text-[#697386]">Termux & Server Process Manager</span>
            </div>

            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => scrollToSection('tentang')}
                className="hover:text-[#F3F5F8] transition-colors"
              >
                Tentang
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('fitur')}
                className="hover:text-[#F3F5F8] transition-colors"
              >
                Fitur
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('arsitektur')}
                className="hover:text-[#F3F5F8] transition-colors"
              >
                Arsitektur
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('kredit')}
                className="hover:text-[#F3F5F8] transition-colors"
              >
                Kredit
              </button>
              <button
                type="button"
                onClick={onStartNow}
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Buka Dashboard →
              </button>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#697386]">
            <div>
              © {currentYear} NodePanel. All rights reserved. Open source under MIT License.
            </div>
            <div>
              Designed for Linux & Android Termux environments.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
