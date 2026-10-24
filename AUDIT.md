# Termux NodePanel (`panel2`) — Deep Engineering, Security & Architecture Audit

## 1. Executive Summary

This audit examined the entire `Termux NodePanel` (`panel2`) codebase across its Express/WebSocket control plane (`server.ts`), React 19 + TypeScript frontend (`src/`), managed server workspaces (`data/servers/`), build/Bundler configuration (`vite.config.ts`, `tsconfig.json`, `package.json`), and operational scripts (`scripts/test_pipeline.sh`, `setup-proot.sh`).

All findings were investigated to root cause, reproduced with live browser, network, and OS process instrumentation inside isolated test sandboxes (preserving existing user data in `data/nodepanel.json` byte-for-byte), remediated with minimal architectural disruption, and verified through a 5-stage automated testing pipeline (`Static -> Unit -> Integration -> E2E -> Load`).

---

## 2. System Architecture & Actual Data Flow

Termux NodePanel operates with four strictly separated runtime planes:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. React 19 SPA Console (Browser)                                            │
│    - Polls REST endpoints (/api/servers, /api/runtime, /api/activity)        │
│      with AbortController cancellation + non-destructive stale-state cache   │
│    - Subscribes to /ws for real-time status, stdout/stderr logs, & terminal  │
└───────────────────┬──────────────────────────────────────┬───────────────────┘
                    │ HTTP JSON (/api/*)                   │ WebSocket (/ws)
                    ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. Panel Control Plane (`server.ts` — Express + `ws` on Port 3000)           │
│    - Origin/CORS guard, sliding-window rate limiter, optional API_SECRET_KEY │
│    - Atomic JSON persistence (`JsonStore` -> `<dataDir>/nodepanel.json`)     │
│    - Per-server async mutex (`withServerLock`) + bounded crash supervisor    │
│    - Symlink-aware workspace sandbox (`safeResolveServerPath` + `realpath`)  │
└───────────────────┬──────────────────────────────────────┬───────────────────┘
                    │ Detached POSIX Process Group         │ Scoped Shell Session
                    ▼                                      ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 3. Managed Child Servers              │  │ 4. Per-Server Interactive Shell   │
│    `<dataDir>/servers/<serverId>/`    │  │    `activeTerminals` map          │
│    - Own OS PID & process group (-pid)│  │    - CWD locked inside realRoot   │
│    - Isolated PORT (never 3000)       │  │    - Streams `terminal_data`      │
│    - Metrics via /proc/<pid>/status   │  │    - SIGINT -> SIGKILL escalation │
└───────────────────────────────────────┘  └───────────────────────────────────┘
```

### Key Architectural Invariants
1. **Control Plane vs. Managed Server Isolation**: Stopping, crashing, or restarting a managed server in `data/servers/<serverId>` only mutates that child's POSIX process group (`-pid`) and JSON metadata; the panel HTTP/WebSocket server on port `3000` remains continuously online.
2. **Authoritative Process State**: Server lifecycle statuses (`created`, `starting`, `running`, `stopping`, `stopped`, `crashed`) derive from OS child process lifecycle callbacks (`spawn`, `error`, `exit`) and verified PID tracking in `activeProcesses`.
3. **Zero Destructive Fallback on Transient Errors**: Frontend polling (`syncAll` in `src/App.tsx`) uses `Promise.allSettled` + `AbortController` and retains the last verified server list with an explicit stale/offline banner whenever `/api/servers` fails or times out.

---

## 3. Severity-Classified Findings Summary

| ID | Severity | Category | Summary | Original Location | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CRIT-01** | **Critical** | Security (RCE) | Command injection in `/api/git/clone` via shell string interpolation of `repo_url` and `branch` | `server.ts:448-452` | **Fixed & Tested** |
| **CRIT-02** | **Critical** | Security (FS) | Path traversal prefix bypass (`startsWith(root)` without `/`) and symlink workspace escape | `server.ts:294-301` | **Fixed & Tested** |
| **CRIT-03** | **Critical** | Bug A (UI/UX) | Transient API error/timeout wiped `servers` state to `[]` (`fetchServers().catch(() => [])`) causing sudden empty dashboard flash | `src/App.tsx:52-66` | **Fixed & Tested** |
| **CRIT-04** | **Critical** | Bug A (Dev/HMR) | Unattached Vite HMR + unwatched `data/**` writes triggered full-page reload ("relog") flashing unstyled `#FFFFFF` `index.html` | `server.ts:862-867`, `vite.config.ts:14`, `index.html` | **Fixed & Tested** |
| **CRIT-05** | **Critical** | Bug B (Crash) | Unhandled `child.on('error')` on managed server `spawn()` could crash the entire panel daemon | `server.ts:222-270` | **Fixed & Tested** |
| **HIGH-01** | **High** | Bug B (Orphans) | Non-detached child spawn + single-PID `kill()` left grandchild worker processes orphaned and holding `PORT` | `server.ts:222, 276-286` | **Fixed & Tested** |
| **HIGH-02** | **High** | Bug B (Loop) | Auto-restart counter lived on ephemeral `ap` object deleted on exit, causing unbounded infinite crash-restart loops | `server.ts:249-269` | **Fixed & Tested** |
| **HIGH-03** | **High** | Bug B (Race) | No per-server mutex on `/start`, `/stop`, `/restart`, `/delete` allowed duplicate child spawns on double-click/concurrent calls | `server.ts:520-585` | **Fixed & Tested** |
| **HIGH-04** | **High** | Perf / Bug A | Synchronous `execSync` in `/api/runtime` (11x per poll), `/install`, `/packages`, and `/git/clone` froze Node event loop up to 5–10m | `server.ts:75-145, 405, 450, 560` | **Fixed & Tested** |
| **HIGH-05** | **High** | Security (CORS/WS) | Wildcard `Access-Control-Allow-Origin: *` and zero WebSocket `Origin` / `API_SECRET_KEY` enforcement exposed local daemon to CSWSH/CSRF | `server.ts:360-368, 825` | **Fixed & Tested** |
| **MED-01** | **Medium** | Bug B (State) | Intentional `POST /stop` did not record an intentional-stop flag before `SIGTERM`, recording misleading `last_exit_code: 1` | `server.ts:249-285`, `data/nodepanel.json:21` | **Fixed & Tested** |
| **MED-02** | **Medium** | Bug A / WS | `WSClient.disconnect()` left pending `reconnectTimer` active, causing duplicate sockets & fixed 3s retry storms without backoff/jitter | `src/services/api.ts:205-265` | **Fixed & Tested** |
| **MED-03** | **Medium** | Resilience | Missing React `ErrorBoundary` and unguarded `.toFixed(1)` formatting risked whole-tree white-screen unmount on malformed payloads | `src/App.tsx`, `src/components/ServerDetailView.tsx` | **Fixed & Tested** |
| **MED-04** | **Medium** | Telemetry | Hardcoded fake `disk_free_mb: 14250` and `cpu_percent: 0.5` presented fabricated numbers as live host telemetry | `server.ts:141, 212` | **Fixed & Tested** |
| **MED-05** | **Medium** | Perf (Load) | Uncached `$PATH` binary scans (`lookPathFast`) on every `/api/health` & `/api/runtime` request caused `p99=2383ms` spike under 60-conn burst | `server.ts:938-954` | **Fixed & Tested** |
| **HIGH-06** | **High** | Bug (Input Focus) | Modal cleanup effect unmounted on unmemoized `onClose` callback on each keystroke, stealing focus back to first input | `src/components/ui/Overlays.tsx:85`, `CreateServerModal.tsx` | **Fixed & Tested** |
| **HIGH-07** | **High** | Terminal / Jobs | Non-streaming buffered execution (`runCommandAsync`/`execSync`) and component lifecycle unmounting wiped logs & blocked live feedback | `server.ts:405-430`, `src/components/ServerDetailView.tsx` | **Fixed & Tested** |
| **LOW-01** | **Low** | Build / Deps | `esbuild@^0.25.0` conflicted with `vite@^8.3.0` peer dependency (`^0.27.0 \|\| ^0.28.0`), and repository lacked `package-lock.json` | `package.json` | **Fixed & Tested** |
| **LOW-02** | **Low** | Ops / Scripts | `setup-proot.sh` invoked obsolete `go build -o bin/nodepanel ./cmd/panel`, and `scripts/test_pipeline.sh` tested legacy Go CLI | `setup-proot.sh:42`, `scripts/test_pipeline.sh` | **Fixed & Tested** |
| **LOW-03** | **Low** | UI / Layout | Hardcoded `max-w-md` (`448px`) container forced desktop viewports into a narrow mobile phone column with heavy glass/glow clutter | `src/App.tsx:180`, `src/components/*.tsx` | **Fixed & Tested** |

---

## 4. Deep Root Cause Analysis & Reproduction Evidence

### 4.1 Bug A — Blank White Dashboard / "Relog" / View Loss on Managed Server Stop or Restart

 Investigation confirmed **four compounding mechanisms** behind the user-reported symptoms ("relog, blank putih selama beberapa detik, atau kehilangan tampilan, lalu muncul kembali"):

1. **Destructive Empty-Array Fallback on Poll Failure (`CRIT-03`)**:
   - **Original Code (`src/App.tsx:52-61`)**:
     ```ts
     const [rtData, srvData, actData] = await Promise.all([
       fetchRuntime().catch(() => null),
       fetchServers().catch(() => []),
       fetchActivities().catch(() => []),
     ]);
     setServers(srvData);
     ```
   - **Mechanism & Reproduction Evidence**: Whenever `fetchServers()` encountered a transient HTTP error, socket hangup, or event-loop stall during child stop/restart, `.catch(() => [])` resolved to `[]` and immediately overwrote `servers` state. Live headless Chromium instrumentation confirmed the dashboard collapsed to the empty state (`"No applications running"`, `emptyText=1`) for up to 5 seconds until the next `setInterval` poll restored the server list.
2. **Event-Loop Blocking During Child Lifecycle & Runtime Polling (`HIGH-04`)**:
   - **Original Code (`server.ts:75-100`)**: `detectEnvironment()` executed 11 synchronous `execSync('which ...')` shell spawns on every `/api/runtime` request (`~111ms` synchronous main-thread stall per call), while `/install` and `/git/clone` blocked the Express + WebSocket event loop via `execSync` for up to 5–10 minutes.
3. **Vite Middleware File-Watch Reloads & Unstyled White HTML Document (`CRIT-04`)**:
   - **Original Code (`server.ts:862-867`, `vite.config.ts:14`, `index.html`)**: `createViteServer` ran without `hmr: false` (`process.env.DISABLE_HMR !== 'true'` evaluated to `true` when `DISABLE_HMR` was unset) and without ignoring `data/**` or `**/*.log`. Stopping or restarting a managed server wrote synchronously to `data/nodepanel.json` and `data/servers/<id>/logs/server.log`. Any Vite reload or navigation flashed `index.html`'s default `#FFFFFF` background before CSS hydration.
4. **Zero Error Isolation & Cascading Effect Re-Fetches (`MED-03`)**:
   - No `<ErrorBoundary>` wrapped routed views, and `ServerDetailView` previously included the `server` object inside `loadData`'s `useCallback` dependency array, creating a Risk of repeated effect re-runs on status updates.

### 4.2 Bug B — Server Lifecycle, Supervision & Realtime Consistency

1. **Orphan Grandchild Processes (`HIGH-01`)**:
   - Managed servers started via `npm start` or spawning worker processes created child trees. Because `spawn()` did not set `detached: true` and `stopServerProcess` only signaled `ap.process.kill('SIGTERM')`, grandchild `node` processes survived `POST /stop` and kept listening on `PORT` (`EADDRINUSE` on subsequent start).
   - **Fix**: Spawned managed processes in their own POSIX process group (`detached: process.platform !== 'win32'`) and implemented `killProcessTree(child, signal)` using `process.kill(-pid, signal)` with a deterministic `SIGTERM` -> `SIGKILL` escalation timer.
2. **Unbounded Crash-Restart Loop (`HIGH-02`)**:
   - `ap.restartCount` was stored on the `ActiveServerProcess` entry in `activeProcesses`, which was deleted immediately upon process `exit`. Consequently, every auto-restart re-initialized `restartCount: 0`, looping forever on crashing scripts.
   - **Fix**: Moved supervision counters and timers into a dedicated `supervisorStates` map keyed by `serverId`, enforcing exponential backoff and halting deterministically at `maxAutoRestarts` (`5` in production, configurable for testing) with an activity log entry.
3. **Misleading `last_exit_code: 1` on Intentional Stop (`MED-01`)**:
   - Observed directly in `data/nodepanel.json:21` (`"status": "stopped", "last_exit_code": 1`). When `SIGTERM` terminated a Node script without a custom `SIGTERM` handler, `code` was `null` and `signal` was `'SIGTERM'`, which the exit handler mapped to `exitCode = 1`.
   - **Fix**: Tracked `ap.intentionalStop = true` inside `stopServerProcessInternal` and normalized clean `SIGTERM`/`SIGINT` stops to `exitCode = 0`.
4. **Concurrent Lifecycle Race Conditions & Duplicate WS Actions (`HIGH-03`, `MED-02`)**:
   - Added per-server promise serialization (`withServerLock(serverId, ...)`), `409 ALREADY_RUNNING` conflict checks, client pending-action button locks (`starting`/`stopping`/`restarting`/`deleting`), and `requestId` deduplication on WebSocket frames.

---

## 5. Security & Stability Audit

| Audit Domain | Pre-Audit State | Post-Remediation State |
| :--- | :--- | :--- |
| **Command Injection** | `/api/git/clone` concatenated `repo_url` and `branch` into `execSync(\`git clone ...\`)`; `/install` and `/packages` used shell strings. | Replaced with `runCommandAsync(bin, args, { shell: false })` plus strict regex & leading-dash (`-u` / `--upload-pack`) rejection. |
| **Path Traversal & Symlinks** | `resolved.startsWith(serverRoot)` allowed sibling directory prefix bypass (`srv-1` vs `srv-10`) and ignored symlinks pointing to `/etc`. | `safeResolveServerPath` enforces `path.relative` boundary checks AND `fs.realpathSync` verification on existing targets, ancestor directories, and terminal `cd`. |
| **Authentication & Secrets** | `.env.example` listed `API_SECRET_KEY=` but `server.ts` never checked it; `.env` values risked leaking if logged. | Optional `API_SECRET_KEY` middleware protects all `/api/*` (except `/api/health`) and `/ws` upgrades when configured; `.env` values are never written to activity or console logs; existing `data/nodepanel.json` untouched. |
| **CORS & WebSocket Origin** | Wildcard `Access-Control-Allow-Origin: *` and unrestricted `/ws` upgrades. | `isOriginAllowed()` validates same-host, loopback (`localhost`/`127.0.0.1`), AI Studio preview domains, and `ALLOWED_ORIGINS`, returning `403 FORBIDDEN_ORIGIN` on untrusted cross-origin HTTP/WS requests. |
| **Rate Limiting & Payloads** | Unbounded JSON body and unlimited request rate. | `express.json({ limit: '2mb' })`, sliding-window per-IP rate limiter (`429 RATE_LIMITED` + `Retry-After`), and structured JSON error handler (`INVALID_JSON`, `API_NOT_FOUND`, `INTERNAL_ERROR`) with stack traces hidden. |
| **Dependency Vulnerabilities** | Missing `package-lock.json`; `esbuild@^0.25.0` peer conflict with `vite@^8.3.0`. | Upgraded `esbuild` to `^0.28.0`, generated clean `package-lock.json`, verified `npm audit --omit=dev` reports **0 production vulnerabilities**. |

---

## 6. Frontend Redesign & Custom Design System Summary

- **Visual Architecture**: Migrated 100% of views (`Navbar`, `Sidebar`, `MobileBottomNav`, `DashboardView`, `ServerListView`, `ServerDetailView`, `CreateServerModal`, `PackagesView`, `DiagnosticsView`, `ActivityLogsView`, `SettingsView`) from the mobile-locked (`max-w-md`) neon-glow glass layout to a responsive **Premium Black Developer Console** (`#08090B` canvas, `#0E1014`/`#14171D`/`#1B1F27` charcoal surfaces, `1px` hairline borders, `Plus Jakarta Sans` + `JetBrains Mono` with `tabular-nums`, measured `#10B981` emerald accent, zero inline `style={{}}` attributes, and `prefers-reduced-motion` support).
- **Reusable Component System (`src/styles/tokens.ts` & `src/components/ui/`)**:
  - **Foundations**: `designTokens`, `focusRingClasses`, `PageTitle`, `SectionTitle`, `CardTitle`, `Text`, `MonoText`, `CodeText`, `Card`, `PageHeader`, `SectionHeader`.
  - **Interactive**: `Button`, `IconButton`, `Input`, `PasswordInput`, `Textarea`, `SearchInput`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Tabs`, `DropdownMenu`, `Tooltip`.
  - **Feedback & Overlays**: `Badge`, `StatusPill`, `ConnectionStatus`, `Alert`, `InlineError`, `Skeleton`, `Spinner`, `ProgressBar`, `EmptyState`, `ToastViewport`, `Modal`, `ConfirmDialog`, `Drawer`, `ErrorBoundary`.
  - **Data Display**: `Table`, `Pagination`, `StatCard`, `ServerCard`, `ActivityLogList`.

---

## 7. Executed Test Pipeline & Verification Evidence

All 5 testing stages were executed sequentially via `RUN_LOAD_TEST=1 bash scripts/test_pipeline.sh`:

1. **Stage 1 — Static Analysis & Production Build (`PASS`)**:
   - `npm run typecheck` (`tsc --noEmit`): `0` errors.
   - `npm run lint` (`eslint src server.ts tests`): `0` errors, `0` warnings.
   - `npm run build` (`vite build`): Succeeded in `935ms` with route-level `React.lazy` code splitting (`ServerDetailView`, `PackagesView`, `DiagnosticsView`, `ActivityLogsView`, `SettingsView`).
2. **Stage 2 — Unit & Regression Tests (`PASS`)**:
   - `npm run test:unit`: `4/4` suites, `29/29` tests passed (`9.12s`), including deterministic backoff/jitter, error normalization, server state reconciliation, WAI-ARIA keyboard behavior, `<ErrorBoundary>` isolation, and Bug A `503` stale-cache retention regression test.
3. **Stage 3 — Isolated API, Supervisor & WebSocket Integration Tests (`PASS`)**:
   - `npm run test:integration`: `1/1` suite, `7/7` tests passed (`2.71s`) against ephemeral `os.tmpdir()` sandboxes, proving grandchild process-group termination (`0` orphans), bounded crash-loop halting (`maxAutoRestarts`), `API_SECRET_KEY` + CORS/WS origin enforcement, symlink escape blocking, git clone injection blocking, and byte-for-byte preservation of `data/nodepanel.json`.
4. **Stage 4 — Playwright Browser E2E Suite (`PASS`)**:
   - `npm run test:e2e`: `14` end-to-end scenarios verified in headless Chromium (`17.6s`) against an isolated test backend on `127.0.0.1:3199`, proving zero full-page reloads (`window.__bootId` invariant) during managed server start/stop/restart, 503 outage banner + recovery, offline/reconnect resilience, live terminal execution, file manager CRUD + cancel/confirm dialogs, `.env` sync, keyboard navigation, and zero horizontal overflow on both `1440x900` desktop and `375x812` mobile viewports.
5. **Stage 5 — Staged HTTP & WebSocket Load Test (`PASS`)**:
   - `npm run test:load`: Executed 4 HTTP phases + 40-client concurrent WebSocket broadcast fanout + post-load leak check (`test-results/load-report.json`):
     - Smoke (`2 conn / 2s`): `1,644 req/s`, `p50=1ms`, `p95=2ms`, `p99=5ms`, `0` errors.
     - Ramp-Up (`12 conn / 3s` mixed endpoints): `1,867 req/s`, `p50=5ms`, `p95=12ms`, `p99=14ms`, `0` errors.
     - Sustained (`25 conn / 5s`): `2,508.6 req/s`, `p50=9ms`, `p95=15ms`, `p99=17ms`, `0` errors.
     - Spike Burst (`60 conn / 3s`): `2,005.67 req/s`, `p50=28ms`, `p95=39ms`, `p99=47ms`, `0` errors.
     - WebSocket Concurrency (`40` clients): `160` status broadcasts delivered, `0` unexpected drops.
     - Recovery & Leak Check: `200 OK` in `21.06ms`, `0` leaked child processes.

---

## 8. Residual Risks & Operational Boundaries

1. **Single-Process JSON Persistence (`data/nodepanel.json`)**:
   - `JsonStore` uses atomic temp-file write + rename within a single Node.js control-plane daemon, which is ideal for Termux/PRoot and lightweight Linux servers, but is not designed for multi-node horizontal clustering without migrating to an external transactional database.
2. **Intentional Operator Interactive Terminal**:
   - By product design (`README.md`), the Live Terminal allows operators to run shell commands inside `data/servers/<serverId>`. While CWD traversal and symlinks are confined to the server workspace, any internet-exposed deployment **must** set a strong `API_SECRET_KEY` in `.env` and run behind TLS.
3. **Dev-Only Transitive Advisories**:
   - `npm audit --omit=dev` reports **0 vulnerabilities** for production runtime dependencies. Three moderate advisories exist solely in development/test tooling (`vitest`/`vite` dev-server advisories) and are not active in production (`NODE_ENV=production`).
4. **Container Sandbox Load Scope**:
   - Stage 5 load numbers (`~2,500 req/s` sustained on a 2-vCPU Linux container) establish a reliable regression baseline for the control plane, not a public multi-tenant SLA; on Android/Termux devices, throughput and background process longevity remain subject to device thermal throttling and Android WakeLock settings.
