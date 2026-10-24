# Termux NodePanel — Automated Testing, Reproduction & CI Guide

## 1. Overview

Termux NodePanel includes a reproducible **5-Stage Automated Verification Pipeline** covering static analysis, isolated unit & regression tests, real backend/process/WebSocket integration tests, headless Chromium E2E browser automation, and staged HTTP + WebSocket load testing.

**Data Safety Guarantee**: Every automated test stage (`unit`, `integration`, `e2e`, and `load`) provisions its own ephemeral `os.tmpdir()` workspace (`nodepanel-int-*`, `nodepanel-e2e-*`, `nodepanel-load-*`) and random/isolated loopback ports. Production user data in `data/nodepanel.json` and `data/servers/` is never modified, and `tests/integration/api-ws-lifecycle.test.ts` explicitly asserts byte-for-byte equality of `data/nodepanel.json` before and after execution.

---

## 2. Prerequisites & Setup

- **Node.js**: v20 LTS or v22 LTS (verified on `v22.23.3`, Linux `x64`)
- **npm**: v10+

Install exact locked dependencies:

```bash
npm ci
```

If running Playwright browser E2E tests on a fresh machine for the first time, ensure headless Chromium is installed:

```bash
npx playwright install --with-deps chromium
```

---

## 3. Pipeline Commands

| Stage | Command | Purpose |
| :--- | :--- | :--- |
| **Stage 1a — Typecheck** | `npm run typecheck` | Runs `tsc --noEmit` across `src/`, `server.ts`, and `tests/` |
| **Stage 1b — Lint** | `npm run lint` | Runs ESLint v10 (`typescript-eslint` + `react-hooks`) with zero warnings/errors |
| **Stage 1c — Build** | `npm run build` | Builds optimized, code-split production bundle into `dist/` |
| **Stage 2 — Unit** | `npm run test:unit` | Runs Vitest + Testing Library unit & regression suites (`tests/unit/`) |
| **Stage 3 — Integration** | `npm run test:integration` | Runs real Express + WebSocket + OS child supervisor tests (`tests/integration/`) |
| **Stage 4 — E2E** | `npm run test:e2e` | Builds & boots isolated panel on `127.0.0.1:3199` and runs Playwright Chromium E2E |
| **Stage 5 — Load** | `npm run test:load` | Runs staged `autocannon` HTTP + 40-client WS load test & writes `test-results/load-report.json` |
| **All Local Gates** | `npm run test:all` | Runs `typecheck -> lint -> test:unit -> test:integration -> build -> test:e2e` sequentially |
| **Full Shell Pipeline** | `RUN_LOAD_TEST=1 bash scripts/test_pipeline.sh` | Runs all 5 stages end-to-end including Stage 5 load test |

---

## 4. Test Coverage Matrix

### Stage 1 — Static Verification
- **TypeScript (`tsconfig.json`)**: Validates strict typing across frontend components, custom design system props, API client, and backend `server.ts`.
- **ESLint (`eslint.config.js`)**: Enforces React Hooks dependency rules, unused-variable checks, and TypeScript safety across `src`, `server.ts`, and `tests`.
- **Production Bundle (`vite.config.ts`)**: Verifies clean production compilation and route-level code splitting.

### Stage 2 — Unit & Regression Tests (`tests/unit/`)
1. `tests/unit/backoff-and-errors.test.ts` (7 tests):
   - Exponential reconnect backoff progression, cap ceiling (`30,000ms`), symmetric jitter bounds, invalid input handling, `ApiError` normalization, and `AbortError` detection.
2. `tests/unit/formatters-and-validation.test.ts` (7 tests):
   - Null-safe `formatMemoryMB`, `formatStorageMB`, `formatCpuPercent`, `formatUptime`, port validation (rejecting panel port `3000` and privileged ports `<1024`), entry command validation, and relative file name traversal rejection.
3. `tests/unit/lifecycle-and-ws.test.ts` (8 tests):
   - `applyServerStatusUpdate` & `reconcileServerList` non-destructive merging, `WebSocketClient` exponential backoff scheduling, deterministic timer cleanup on `disconnect()` (zero zombie reconnects), ref-counted server subscriptions, and reconnect state reconciliation without command replay.
4. `tests/unit/ui-and-resilience.test.tsx` (7 tests):
   - `Button` loading-state double-submit prevention, `Modal` `Escape` & `preventClose` handling, `ConfirmDialog` safety before confirmation, WAI-ARIA `Tabs` `ArrowRight`/`ArrowLeft` keyboard navigation, `StatusPill` & `ConnectionStatus` rendering, `<ErrorBoundary>` widget crash isolation + reset, and **Bug A Regression Test** proving `<App />` preserves rendered server cards and displays a stale-data warning banner when `GET /api/servers` returns `503`.

### Stage 3 — Integration Tests (`tests/integration/api-ws-lifecycle.test.ts`)
1. **Health & Non-Blocking Runtime Telemetry**: Verifies `/api/health` and `/api/runtime` return real OS/filesystem metrics (`memory_total_mb`, `disk_free_mb`, `executables.node`) cleanly under `<500ms`.
2. **Authentication & Origin Security**: Spins up a second isolated instance with `apiSecretKey` enabled; verifies `/api/health` stays reachable (`200`), unauthenticated `/api/servers` returns `401 UNAUTHORIZED`, Bearer-authenticated requests return `200`, untrusted `Origin` HTTP requests return `403 FORBIDDEN_ORIGIN`, and untrusted `Origin` WebSocket upgrades are rejected.
3. **Input Validation & Structured Errors**: Verifies `400 INVALID_NAME`, `400 INVALID_PORT` (port `3000`), `403` entry traversal (`../../etc/passwd`), `400 INVALID_JSON` on malformed bodies, and `404 API_NOT_FOUND` on unknown API routes.
4. **Full Process Lifecycle & Grandchild Cleanup (Bug B)**: Creates and starts a real HTTP child server that spawns a detached grandchild Node worker; verifies concurrent `POST /start` returns `409 ALREADY_RUNNING`, WebSocket delivers `status` & `log` frames, `POST /restart` rotates PIDs cleanly, and `POST /stop` records `last_exit_code === 0` while terminating **both** child and grandchild PIDs (`0` orphans).
5. **Bounded Crash-Loop Protection (Bug B)**: Runs a child script that immediately exits `1` with `auto_restart: 'always'` and `maxAutoRestarts: 2`; verifies the supervisor halts deterministically in `crashed` status instead of looping forever.
6. **Workspace Sandbox & Symlink Escape Defense**: Verifies file read/write/rename/mkdir/delete persistence, blocks `../../etc/passwd` traversal (`403`), and blocks reading an OS symlink inside the workspace pointing outside to `/etc/hostname` (`403 SYMLINK_ESCAPE`).
7. **Command-Injection Hardening & Local Git Clone**: Blocks `; touch /tmp/pwned` and `-u ./payload` option-injection payloads (`400`) while successfully cloning a real local bare Git repository via `file://`.

### Stage 4 — Playwright E2E Browser Suite (`tests/e2e/panel.spec.ts`)
Bootstraps an isolated production build on `http://127.0.0.1:3199` (`tests/e2e/bootstrap-e2e-server.ts`) and verifies all 14 critical scenarios in headless Chromium:
1. Dashboard opens on `#08090B` (`rgb(8, 9, 11)`) canvas with zero blank screen and zero desktop overflow (`1440x900`).
2. Navigation across Overview, Servers, Packages, Diagnostics, Activity Log, and Settings.
3. Create Server modal opens, closes on `Escape`, validates empty name & reserved port `3000`, and provisions a Native HTTP Server (`E2E Order Service` on `:4310`).
4. Start, Stop (`Exit 0`), and Restart transitions update status badges in real time.
5. Pending action buttons disable/show loading state without duplicate requests.
6. Confirmation modals (`Delete File?` and `Delete Server Instance?`) abort safely on `Cancel` and execute only upon explicit confirmation.
7. Live Terminal command execution (`echo E2E_TERMINAL_READY`), File Manager create/edit/save/rename/delete, and `.env` variable persistence.
8. Browser offline (`context.setOffline(true)` -> `false`) and WebSocket reconnection preserve the open dashboard.
9. **Managed Server Stopped While Dashboard Remains Open**: Asserts `window.__bootId` before and after stop are identical (zero full-page reloads) and Overview stays interactive.
10. **Managed Server Restarted While Dashboard Remains Open**: Asserts `window.__bootId` remains identical and server returns to `Running`.
11. **Simulated `503` Backend Outage & Recovery**: Intercepts `GET /api/servers` with `503`, verifies `"Showing cached state"` warning banner appears while `E2E Order Service` card stays visible, then restores `/api/servers` and verifies `Retry Sync` clears the warning.
12. Keyboard interactions (`Escape` modal dismissal, `ArrowRight` WAI-ARIA tab focus/selection) and mobile drawer (`375x812`) with zero horizontal overflow.
13. Zero uncaught `pageerror` or unexpected application `console.error` events.
14. Bounded API request count (`<12` `/api/servers` GET calls across lifecycle transitions — zero request loops).

---

## 5. How to Reproduce & Verify Bug A and Bug B

### Reproducing Bug A Protection (No Blank Screen / No State Wipe on Stop, Restart, or 503)
1. Run the E2E suite directly:
   ```bash
   npm run test:e2e
   ```
   Inspect Scenarios 9, 10, and 11 in `tests/e2e/panel.spec.ts`, which record `window.__bootId` at initial page load and verify it never changes across managed server `Stop`, `Restart`, `503` API outage, and network disconnect/reconnect.
2. Run the targeted unit regression test:
   ```bash
   npx vitest run tests/unit/ui-and-resilience.test.tsx
   ```

### Reproducing Bug B Protection (Grandchild Process Cleanup & Bounded Crash Loop)
Run the integration lifecycle suite:
```bash
npm run test:integration
```
Inspect `tests/integration/api-ws-lifecycle.test.ts`, which spawns a real child HTTP server + grandchild worker process, verifies both PIDs terminate on `POST /stop` with `last_exit_code: 0`, and verifies a crashing `auto_restart: 'always'` script halts at `maxAutoRestarts`.

---

## 6. Stage 5 Load Test Methodology & Baseline Metrics

### Environment & Design
- **Runner**: `tests/load/run-load-test.mjs` (`npm run test:load`)
- **Target**: Isolated in-process `createPanelServer` bound to `127.0.0.1:0` with a temporary `os.tmpdir()` directory (zero external/production traffic).
- **Hardware / Runtime Measured**: Node.js `v22.23.3`, Linux `x64`, `2` vCPUs.
- **Thresholds Selected**:
  - `httpErrorRateMax = 0` (`errors === 0`, `timeouts === 0`, `non2xx === 0`)
  - `p99LatencyMaxMs = 500ms` across all phases including 60-connection burst
  - `wsUnexpectedDropsMax = 0` across 40 concurrent WebSocket subscribers
  - `leakedChildProcessesMax = 0` after real child start/stop cycle under WS fanout
  - `recoveryHealthMaxMs = 200ms` post-spike health probe

### Recorded Baseline (`test-results/load-report.json`)

| Phase | Concurrency & Duration | Total Requests | Throughput (RPS) | p50 | p95 | p99 | Errors / Timeouts |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **1. Smoke** (`/api/servers`) | 2 conn / 2s | 3,288 | 1,644.0 req/s | 1 ms | 2 ms | 5 ms | 0 / 0 |
| **2. Ramp-Up** (Mixed `/health`, `/servers`, `/runtime`, `/activity`) | 12 conn / 3s | 5,601 | 1,867.0 req/s | 5 ms | 12 ms | 14 ms | 0 / 0 |
| **3. Sustained** (`/api/servers`) | 25 conn / 5s | 12,543 | 2,508.6 req/s | 9 ms | 15 ms | 17 ms | 0 / 0 |
| **4. Spike Burst** (`/api/health`) | 60 conn / 3s | 6,016 | 2,005.7 req/s | 28 ms | 39 ms | 47 ms | 0 / 0 |
| **5. WS Concurrency** (`/ws` + child start/stop) | 40 WS clients | 160 status events | — | — | — | — | 0 drops |
| **6. Post-Load Recovery** (`/api/health`) | 1 probe | 1 | — | 21.06 ms | — | — | 0 leaked children |

---

## 7. CI/CD Quality Gates (`.github/workflows/ci.yml`)

GitHub Actions executes two isolated jobs without any `|| true` failure masking:
1. **`quality-gates` (Every Push & Pull Request to `main`/`master`)**:
   - `npm ci` -> `npm run typecheck` -> `npm run lint` -> `npm run test:unit` -> `npm run test:integration` -> `npm run build` -> `npx playwright install --with-deps chromium` -> `npm run test:e2e`.
   - Uploads `test-results/` and `playwright-report/` artifacts on every run (`if: always()`).
2. **`load-test` (Weekly Cron Schedule & Manual `workflow_dispatch`)**:
   - Depends on `quality-gates` passing first (`needs: quality-gates`), executes `npm run test:load`, and uploads `test-results/load-report.json`.
