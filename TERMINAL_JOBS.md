# Termux NodePanel — Real-Time Terminal & Persistent Background Job Architecture

## 1. Overview & Architectural Motivation

Previously, long-running processes (such as `npm install`, complex build scripts, or server diagnostics) exhibited two major failure modes:
1. **Zero Real-Time Streaming**: Commands executed through synchronous or buffered execution pipelines (`execSync` or buffered `runCommandAsync`), accumulating stdout/stderr in memory and only delivering output upon process termination. Users faced an unresponsive console without progress feedback.
2. **Component Lifecycle Fragility**: If the user navigated away from the server detail view (e.g., to "Overview" or "Settings"), unmounting the React component either severed the socket communication or left users blind to job progress. Furthermore, upon returning to the view, prior command outputs were wiped out.

To resolve these limitations, Termux NodePanel incorporates a **Supervised Background Job Engine** backed by `child_process.spawn`, streaming WebSocket broadcasts, cursor-based log replay, and a global **Running Jobs Center**.

---

## 2. Real-Time Streaming Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend Process Supervisor                      │
│                                                                        │
│   POSIX Shell / npm / node  (spawn with detached: true, pgroup: -pid)  │
│         │                                                              │
│         ├── stdout.on('data') ──┐                                      │
│         └── stderr.on('data') ──┤                                      │
│                                 ▼                                      │
│                      [Job Manager Engine]                              │
│                      - Incremental seq: 1, 2, 3...                     │
│                      - Bounded ring buffer (max 2000 lines/job)        │
│                      - Bounded history (max 100 jobs)                  │
│                                 │                                      │
│                    Broadcast via WebSocket                             │
│                    ('job_output' & 'terminal_data')                    │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        React 19 Frontend Console                       │
│                                                                        │
│   JobProvider (Context)  <─────────>  TerminalOutput Component         │
│   - Global jobs state                 - ANSI 16-color & SGR parser     │
│   - Reconnection auto-sync            - Overwriting '\r' carriage ret. │
│   - Background toast notifications    - Search filter & auto-scroll    │
│   - Running Jobs Modal                - Buffer copy & log file export  │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Spawning & Process Group Isolation
- Every command is initiated via `child_process.spawn(shell, ['-c', command], { cwd, detached: true, env })`.
- `detached: true` creates a dedicated POSIX process group (`pgid = -child.pid`).
- Process termination targets the entire process group:
  ```ts
  try {
    process.kill(-child.pid, 'SIGINT');
  } catch {
    child.kill('SIGINT');
  }
  ```
  If the process fails to terminate within 3500ms, it is escalated to `SIGKILL` to prevent orphan worker processes.

### 2.2 Output Streaming & Carriage Return Handling
- Chunks from `child.stdout` and `child.stderr` are captured as `Buffer`, decoded to UTF-8, and split into lines.
- Each line receives a monotonic sequence ID (`seq`), timestamp, stream category (`stdout` | `stderr` | `system`), and raw text.
- Overwriting progress bars (e.g., `npm install` spin indicators or `curl` progress bars using `\r`) are resolved line-by-line via `processCarriageReturns()`, ensuring clean visual rendering without visual buffer bloating.
- Styled ANSI escape sequences (standard 16 colors, bright colors, bold, dim, italic, underline) are parsed by zero-dependency parser `parseAnsi()` into styled React spans.

---

## 3. Persistent Job Manager & Cursor-Based Replay

### 3.1 Persistence Outside React Lifecycle
- Active jobs reside in the backend `runningJobs` map. Navigating across tabs, refreshing the browser, or switching servers has zero effect on job execution.
- When an active job completes while the user is on a different screen, `JobProvider` surfaces an accessible background toast notification detailing completion status, exit code, and elapsed runtime.

### 3.2 REST API Specification
- `GET /api/jobs`: Returns `{ success: true, count: N, jobs: JobModel[] }`. Supports optional filtering via `?serverId=<id>`.
- `GET /api/jobs/:jobId`: Returns full job record. Accepts optional query param `?sinceSeq=<number>` to replay missing output lines incrementally.
- `POST /api/jobs/:jobId/cancel`: Terminates the job process group with `SIGINT` (escalating to `SIGKILL`).
- `POST /api/servers/:id/jobs/run`: Spawns a supervised background job for the given server. Request body: `{ command: string, category?: 'command' | 'install' | 'build' | 'test' }`.
- `POST /api/servers/:id/install`: Spawns an asynchronous `npm install` job through the job manager, instantly returning `{ success: true, jobId: string, message: 'npm install started in background' }`.

---

## 4. Modal Input Focus Bug Analysis & Resolution

### 4.1 Root Cause
In `src/components/ui/Overlays.tsx`, the `Modal` autofocus effect previously depended on:
```ts
useEffect(() => {
  if (!isOpen) return;
  // ... focus first input
  return () => {
    // ... restore previous focus
  };
}, [isOpen, preventClose, onClose]);
```
In `CreateServerModal.tsx`, `onClose` was passed as an inline anonymous function or recreated on each render. Whenever the user typed into an input (e.g., typing the server name), state updated, triggering a parent re-render. This generated a new function reference for `onClose`, causing the effect cleanup to execute on **every single keystroke**. The cleanup function re-focused `previousFocusRef` and re-scheduled an autofocus timer that immediately stole focus away from the active input.

### 4.2 Resolution
1. **Ref-Stabilization in `Overlays.tsx`**:
   - `onClose` and `preventClose` were moved to stable mutable refs (`onCloseRef`, `preventCloseRef`).
   - The effect dependency array was simplified to strictly `[isOpen]`, preventing effect re-runs during typing:
     ```ts
     useEffect(() => {
       if (!isOpen) return;
       // ... focus target input
       return () => {
         // cleanup executed strictly when modal unmounts or closes
       };
     }, [isOpen]);
     ```
2. **Stable Callbacks & Explicit IDs in `CreateServerModal.tsx`**:
   - Memoized `resetAndClose` using `useCallback`.
   - Bound explicit IDs (`create-server-name`, `create-git-repo-url`, `create-server-port`) to form inputs with matching labels.
   - Intelligent auto-derivation of instance name from Git repository URL when user has not manually set a custom name.

---

## 5. Floating Pill Mobile Navigation & Layout Discipline

### 5.1 Architecture & Tokens
Mobile navigation is implemented as a floating pill matching the design specification:
- **Container**: `fixed z-40 bottom-4 left-1/2 -translate-x-1/2 max-w-md w-[calc(100%-2rem)]`
- **Surface**: `bg-[#12151B]/95 backdrop-blur-md border border-[#222733] shadow-2xl rounded-full`
- **Safe Area Inset**: Positioned with `env(safe-area-inset-bottom)` awareness.
- **Touch Target Discipline**: Each interactive button meets minimum 44x44px dimensions (`h-11 min-w-[44px]`).
- **Active Pill Highlight**: Distinct capsule background (`bg-[#1C222E] text-[#F3F5F8] border border-[#2E3646]`) with subtle green status dot.
- **Page Layout Invariant**: Main layout contains `pb-28 lg:pb-8` bottom padding to guarantee the floating nav never obstructs inputs, buttons, logs, or file items.
- **Collapsible Desktop Sidebar**: Power users can toggle the desktop sidebar between full (`w-64`) and compact icon-only (`w-16`) states to maximize terminal viewing area.
