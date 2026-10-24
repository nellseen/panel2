import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import autocannon from 'autocannon';
import { WebSocket } from 'ws';
import { execFileSync } from 'child_process';

/**
 * Stage 5 — Staged HTTP & WebSocket Load Test Runner
 * Executes safely against an isolated local PanelServer instance with a temporary data directory.
 * Never touches production data/nodepanel.json or external endpoints.
 */
async function runAutocannonPhase(title, opts) {
  const result = await new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
    instance.on('error', reject);
  });

  const summary = {
    phase: title,
    connections: opts.connections,
    durationSec: opts.duration,
    requestsTotal: result.requests.total,
    throughputReqPerSec: Math.round(result.requests.average * 100) / 100,
    latencyMs: {
      p50: result.latency.p50,
      p95: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
  };

  console.log(
    `  [${title}] reqs=${summary.requestsTotal} rps=${summary.throughputReqPerSec}/s ` +
      `p50=${summary.latencyMs.p50}ms p95=${summary.latencyMs.p95}ms p99=${summary.latencyMs.p99}ms ` +
      `errors=${summary.errors} timeouts=${summary.timeouts} non2xx=${summary.non2xx}`
  );
  return summary;
}

async function main() {
  // Dynamically import server.ts via tsx runtime or compiled tsx loader
  // If invoked via `node tests/load/run-load-test.mjs`, re-exec under `tsx` so TypeScript imports resolve cleanly
  if (!process.env.__NODEPANEL_LOAD_TSX) {
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'tests/load/run-load-test.mjs'],
      {
        stdio: 'inherit',
        env: { ...process.env, __NODEPANEL_LOAD_TSX: '1' },
      }
    );
    return;
  }

  const { createPanelServer } = await import('../../server.ts');
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepanel-load-'));

  console.log('=================================================================');
  console.log('  STAGE 5: STAGED HTTP & WEBSOCKET LOAD TEST (ISOLATED SANDBOX)  ');
  console.log('=================================================================');

  const memStartMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

  const panel = await createPanelServer({
    dataDir: tempDataDir,
    port: 0,
    host: '127.0.0.1',
    isProd: true,
    enableVite: false,
    serveStatic: false,
    rateLimitMax: 100_000, // Measure raw server & event-loop capacity without synthetic IP throttle
  });

  const baseUrl = `http://127.0.0.1:${panel.port}`;
  const wsUrl = `ws://127.0.0.1:${panel.port}/ws`;

  let exitCode = 0;

  try {
    // Seed 2 realistic servers in isolated store
    const created1 = await (
      await fetch(`${baseUrl}/api/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Load Fixture API 1', port: 4510, template: 'basic_http' }),
      })
    ).json();
    await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Load Fixture API 2', port: 4511, template: 'background_worker' }),
    });

    const phases = [];

    // 1. Smoke Test
    phases.push(
      await runAutocannonPhase('1. Smoke (2 conn / 2s)', {
        url: `${baseUrl}/api/servers`,
        connections: 2,
        duration: 2,
      })
    );

    // 2. Ramp-Up Test (Mixed read endpoints)
    phases.push(
      await runAutocannonPhase('2. Ramp-Up (12 conn / 3s)', {
        url: baseUrl,
        connections: 12,
        duration: 3,
        requests: [
          { method: 'GET', path: '/api/health' },
          { method: 'GET', path: '/api/servers' },
          { method: 'GET', path: '/api/runtime' },
          { method: 'GET', path: '/api/activity' },
        ],
      })
    );

    // 3. Sustained Load
    phases.push(
      await runAutocannonPhase('3. Sustained (25 conn / 5s)', {
        url: `${baseUrl}/api/servers`,
        connections: 25,
        duration: 5,
      })
    );

    // 4. Spike / Burst Test
    phases.push(
      await runAutocannonPhase('4. Spike Burst (60 conn / 3s)', {
        url: `${baseUrl}/api/health`,
        connections: 60,
        duration: 3,
      })
    );

    // 5. WebSocket Concurrency + Real Child Lifecycle Broadcast Fanout
    const wsClientCount = 40;
    let wsUnexpectedDrops = 0;
    let statusBroadcastsReceived = 0;

    const sockets = await Promise.all(
      Array.from({ length: wsClientCount }, () => {
        return new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl);
          ws.once('open', () => {
            ws.send(JSON.stringify({ action: 'subscribe', serverId: created1.id }));
            resolve(ws);
          });
          ws.once('error', reject);
        });
      })
    );

    let closingIntentionally = false;
    for (const ws of sockets) {
      ws.on('close', () => {
        if (!closingIntentionally) wsUnexpectedDrops += 1;
      });
      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.event === 'status') statusBroadcastsReceived += 1;
        } catch {
          // Ignore
        }
      });
    }

    // Trigger real start + stop while 40 WS clients are subscribed
    await fetch(`${baseUrl}/api/servers/${created1.id}/start`, { method: 'POST' });
    await new Promise((r) => setTimeout(r, 250));
    await fetch(`${baseUrl}/api/servers/${created1.id}/stop`, { method: 'POST' });
    await new Promise((r) => setTimeout(r, 250));

    closingIntentionally = true;
    for (const ws of sockets) {
      ws.close();
    }

    console.log(
      `  [5. WS Concurrency] clients=${wsClientCount} broadcastsReceived=${statusBroadcastsReceived} unexpectedDrops=${wsUnexpectedDrops}`
    );

    // 6. Post-Load Recovery & Process Leak Check
    const recoveryStart = performance.now();
    const recoveryRes = await fetch(`${baseUrl}/api/health`);
    const recoveryLatencyMs = Math.round((performance.now() - recoveryStart) * 100) / 100;
    const activeProcessesAfter = panel.getActiveProcessCount();
    const memEndMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

    console.log(
      `  [6. Recovery & Leak Check] healthStatus=${recoveryRes.status} latency=${recoveryLatencyMs}ms ` +
        `activeChildProcesses=${activeProcessesAfter} rssStart=${memStartMb}MB rssEnd=${memEndMb}MB`
    );

    // Quality Gate Thresholds calibrated for container sandbox environment
    const failures = [];
    for (const p of phases) {
      if (p.errors > 0 || p.timeouts > 0 || p.non2xx > 0) {
        failures.push(`${p.phase} recorded errors=${p.errors}, timeouts=${p.timeouts}, non2xx=${p.non2xx}`);
      }
      if (p.latencyMs.p99 > 500) {
        failures.push(`${p.phase} p99 latency ${p.latencyMs.p99}ms exceeded 500ms threshold`);
      }
    }
    if (wsUnexpectedDrops > 0) {
      failures.push(`WebSocket concurrency test had ${wsUnexpectedDrops} unexpected disconnects`);
    }
    if (statusBroadcastsReceived < wsClientCount * 2) {
      failures.push(
        `Expected at least ${wsClientCount * 2} WS status broadcasts, got ${statusBroadcastsReceived}`
      );
    }
    if (recoveryRes.status !== 200 || recoveryLatencyMs > 200) {
      failures.push(`Post-load recovery probe degraded (status=${recoveryRes.status}, ${recoveryLatencyMs}ms)`);
    }
    if (activeProcessesAfter !== 0) {
      failures.push(`Leaked ${activeProcessesAfter} active child process(es) after load test`);
    }

    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus().length,
      },
      thresholds: {
        httpErrorRateMax: 0,
        p99LatencyMaxMs: 500,
        wsUnexpectedDropsMax: 0,
        leakedChildProcessesMax: 0,
        recoveryHealthMaxMs: 200,
      },
      phases,
      websocketConcurrency: {
        concurrentClients: wsClientCount,
        statusBroadcastsReceived,
        unexpectedDrops: wsUnexpectedDrops,
      },
      recovery: {
        healthStatus: recoveryRes.status,
        recoveryLatencyMs,
        leakedChildProcesses: activeProcessesAfter,
        rssStartMb: memStartMb,
        rssEndMb: memEndMb,
        rssDeltaMb: Math.round((memEndMb - memStartMb) * 10) / 10,
      },
      passed: failures.length === 0,
      failures,
    };

    const outDir = path.resolve(process.cwd(), 'test-results');
    fs.mkdirSync(outDir, { recursive: true });
    const reportPath = path.join(outDir, 'load-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`  [Report] Written to ${reportPath}`);

    if (failures.length > 0) {
      console.error('  [FAIL] Load test quality gates failed:', failures);
      exitCode = 1;
    } else {
      console.log('  [PASS] All Stage 5 Load & WS Concurrency quality gates passed.');
    }
  } finally {
    await panel.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[Load Test] Fatal error:', err);
  process.exit(1);
});
