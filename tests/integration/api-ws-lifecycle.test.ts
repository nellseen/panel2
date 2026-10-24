import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { execFileSync } from 'child_process';
import { WebSocket } from 'ws';
import { createPanelServer, type PanelServerInstance } from '../../server';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForCondition(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 6000,
  intervalMs = 60
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

describe('NodePanel Backend API, Process Supervisor, Security & WebSocket Integration', () => {
  let tempDataDir: string;
  let panel: PanelServerInstance;
  let baseUrl: string;
  let wsUrl: string;
  let productionDataSnapshotBefore: string | null = null;
  const prodDataPath = path.resolve(process.cwd(), 'data/nodepanel.json');

  beforeAll(async () => {
    if (fs.existsSync(prodDataPath)) {
      productionDataSnapshotBefore = fs.readFileSync(prodDataPath, 'utf-8');
    }

    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepanel-int-'));
    panel = await createPanelServer({
      dataDir: tempDataDir,
      port: 0,
      host: '127.0.0.1',
      enableVite: false,
      serveStatic: false,
      autoRestartBaseMs: 120,
      maxAutoRestarts: 2,
      stopGraceTimeoutMs: 800,
    });

    baseUrl = `http://127.0.0.1:${panel.port}`;
    wsUrl = `ws://127.0.0.1:${panel.port}/ws`;
  });

  afterAll(async () => {
    if (panel) {
      await panel.close();
    }
    if (tempDataDir && fs.existsSync(tempDataDir)) {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
    if (productionDataSnapshotBefore !== null) {
      const after = fs.readFileSync(prodDataPath, 'utf-8');
      expect(after).toBe(productionDataSnapshotBefore);
    }
  });

  it('serves /api/health and real non-blocking /api/runtime metrics without hardcoded values', async () => {
    const t0 = Date.now();
    const [healthRes, runtimeRes] = await Promise.all([
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/runtime`),
    ]);
    const elapsedMs = Date.now() - t0;

    expect(healthRes.status).toBe(200);
    const health = await healthRes.json();
    expect(health.status).toBe('healthy');
    expect(typeof health.uptime_seconds).toBe('number');

    expect(runtimeRes.status).toBe(200);
    const runtime = await runtimeRes.json();
    expect(runtime.os).toBe(os.platform());
    expect(runtime.memory_total_mb).toBeGreaterThan(0);
    expect(runtime.memory_free_mb).toBeGreaterThan(0);
    expect(runtime.executables.node).toBeTruthy();
    expect(elapsedMs).toBeLessThan(500);
  });

  it('enforces API_SECRET_KEY authentication and CORS/WS Origin validation when configured', async () => {
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepanel-auth-'));
    const securedPanel = await createPanelServer({
      dataDir: authDir,
      port: 0,
      host: '127.0.0.1',
      enableVite: false,
      serveStatic: false,
      apiSecretKey: 'super-secret-integration-key',
    });

    try {
      const secUrl = `http://127.0.0.1:${securedPanel.port}`;

      // Health endpoint stays public for liveness probes
      const hRes = await fetch(`${secUrl}/api/health`);
      expect(hRes.status).toBe(200);

      // Unauthenticated /api/servers is rejected with 401
      const unauthRes = await fetch(`${secUrl}/api/servers`);
      expect(unauthRes.status).toBe(401);
      const unauthJson = await unauthRes.json();
      expect(unauthJson.code).toBe('UNAUTHORIZED');

      // Authenticated /api/servers succeeds
      const authRes = await fetch(`${secUrl}/api/servers`, {
        headers: { Authorization: 'Bearer super-secret-integration-key' },
      });
      expect(authRes.status).toBe(200);

      // Cross-origin request from untrusted domain is blocked with 403
      const corsRes = await fetch(`${secUrl}/api/servers`, {
        headers: {
          Origin: 'https://evil-attacker.example.com',
          Authorization: 'Bearer super-secret-integration-key',
        },
      });
      expect(corsRes.status).toBe(403);
      const corsJson = await corsRes.json();
      expect(corsJson.code).toBe('FORBIDDEN_ORIGIN');

      // Cross-origin WebSocket upgrade from untrusted domain is rejected
      await expect(
        new Promise<void>((resolve, reject) => {
          const badWs = new WebSocket(
            `ws://127.0.0.1:${securedPanel.port}/ws?token=super-secret-integration-key`,
            { headers: { Origin: 'https://evil-attacker.example.com' } }
          );
          badWs.on('open', () => {
            badWs.close();
            resolve();
          });
          badWs.on('error', (err) => reject(err));
        })
      ).rejects.toThrow();
    } finally {
      await securedPanel.close();
      fs.rmSync(authDir, { recursive: true, force: true });
    }
  });

  it('validates server creation inputs and returns structured JSON for unknown /api routes', async () => {
    const emptyName = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', port: 4100 }),
    });
    expect(emptyName.status).toBe(400);
    expect((await emptyName.json()).code).toBe('INVALID_NAME');

    const reservedPort = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Port App', port: 3000 }),
    });
    expect(reservedPort.status).toBe(400);
    expect((await reservedPort.json()).code).toBe('INVALID_PORT');

    const badEntry = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Traversal App', port: 4102, entry_file: '../../etc/passwd' }),
    });
    expect(badEntry.status).toBe(403);

    const badJson = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    expect(badJson.status).toBe(400);
    expect((await badJson.json()).code).toBe('INVALID_JSON');

    const unknownApi = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(unknownApi.status).toBe(404);
    expect((await unknownApi.json()).code).toBe('API_NOT_FOUND');
  });

  it('supervises start, stop, restart, concurrent requests, and kills grandchild processes with zero orphans', async () => {
    const childPort = await getFreePort();
    const createRes = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lifecycle Test Server',
        description: 'Integration child server',
        port: childPort,
        template: 'basic_http',
        auto_restart: 'never',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const serverId = created.id as string;

    // Inject a custom index.js that also spawns a grandchild Node worker to verify process-group cleanup
    const customScript = `
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 10000)'], { stdio: 'ignore' });
fs.writeFileSync('grandchild.pid', String(worker.pid));

const PORT = Number(process.env.PORT) || ${childPort};
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, pid: process.pid, workerPid: worker.pid }));
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('READY_ON_' + PORT);
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
`;
    const writeRes = await fetch(`${baseUrl}/api/servers/${serverId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'index.js', content: customScript }),
    });
    expect(writeRes.status).toBe(200);

    // Start managed server
    const startRes = await fetch(`${baseUrl}/api/servers/${serverId}/start`, { method: 'POST' });
    expect(startRes.status).toBe(200);

    // Wait until managed child HTTP server responds on childPort
    let childPayload: { ok: boolean; pid: number; workerPid: number } | null = null;
    await waitForCondition(async () => {
      try {
        const ping = await fetch(`http://127.0.0.1:${childPort}`);
        if (ping.ok) {
          childPayload = await ping.json();
          return true;
        }
      } catch {
        // Still booting
      }
      return false;
    });

    expect(childPayload).not.toBeNull();
    const firstPid = childPayload!.pid;
    const firstGrandchildPid = childPayload!.workerPid;
    expect(isPidAlive(firstPid)).toBe(true);
    expect(isPidAlive(firstGrandchildPid)).toBe(true);

    // Fire concurrent restart + status fetch to verify per-server mutex serialization
    const [restartRes] = await Promise.all([
      fetch(`${baseUrl}/api/servers/${serverId}/restart`, { method: 'POST' }),
      fetch(`${baseUrl}/api/servers/${serverId}`),
    ]);
    expect(restartRes.status).toBe(200);
    expect(panel.getActiveProcessCount()).toBe(1);

    // Old parent AND old grandchild must both be dead after restart
    await waitForCondition(() => !isPidAlive(firstPid) && !isPidAlive(firstGrandchildPid));

    // Wait for restarted child process to serve HTTP
    let restartedPayload: { ok: boolean; pid: number; workerPid: number } | null = null;
    await waitForCondition(async () => {
      try {
        const ping = await fetch(`http://127.0.0.1:${childPort}`);
        if (ping.ok) {
          restartedPayload = await ping.json();
          return true;
        }
      } catch {
        return false;
      }
    });

    const secondPid = restartedPayload!.pid;
    const secondGrandchildPid = restartedPayload!.workerPid;
    expect(secondPid).not.toBe(firstPid);

    // Stop managed server -> verify clean exit_code 0, zero active processes, and dead grandchild
    const stopRes = await fetch(`${baseUrl}/api/servers/${serverId}/stop`, { method: 'POST' });
    expect(stopRes.status).toBe(200);

    await waitForCondition(() => !isPidAlive(secondPid) && !isPidAlive(secondGrandchildPid));
    expect(panel.getActiveProcessCount()).toBe(0);

    const detailAfterStop = await (await fetch(`${baseUrl}/api/servers/${serverId}`)).json();
    expect(detailAfterStop.status).toBe('stopped');
    expect(detailAfterStop.last_exit_code).toBe(0);
    expect(detailAfterStop.metrics.pid).toBe(0);

    // Panel itself remains 100% healthy after child server stop
    const healthAfterStop = await fetch(`${baseUrl}/api/health`);
    expect(healthAfterStop.status).toBe(200);
  });

  it('halts crash-looping servers deterministically at maxAutoRestarts instead of looping forever', async () => {
    const port = await getFreePort();
    const createRes = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Crash Loop Guard Test',
        port,
        template: 'blank',
        auto_restart: 'on-failure',
      }),
    });
    const srv = await createRes.json();
    const serverId = srv.id as string;

    await fetch(`${baseUrl}/api/servers/${serverId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'index.js',
        content: 'console.error("fatal startup error"); setTimeout(() => process.exit(1), 30);\n',
      }),
    });

    const startRes = await fetch(`${baseUrl}/api/servers/${serverId}/start`, { method: 'POST' });
    expect(startRes.status).toBe(200);

    // With autoRestartBaseMs=120 and maxAutoRestarts=2, supervisor retries twice (~120ms + ~240ms) then halts as 'failed'
    await waitForCondition(async () => {
      const detail = await (await fetch(`${baseUrl}/api/servers/${serverId}`)).json();
      return detail.status === 'failed';
    }, 8000);

    const finalDetail = await (await fetch(`${baseUrl}/api/servers/${serverId}`)).json();
    expect(finalDetail.status).toBe('failed');
    expect(finalDetail.last_exit_code).toBe(1);
    expect(panel.getActiveProcessCount()).toBe(0);

    const activities = await (await fetch(`${baseUrl}/api/activity`)).json();
    expect(
      activities.some(
        (a: { action: string; server_id: string }) =>
          a.action === 'auto_restart_halted' && a.server_id === serverId
      )
    ).toBe(true);
  });

  it('delivers realtime WS events, enforces terminal workspace sandbox, and deduplicates requestId commands', async () => {
    const port = await getFreePort();
    const srv = await (
      await fetch(`${baseUrl}/api/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'WS Realtime Server', port, template: 'blank' }),
      })
    ).json();
    const serverId = srv.id as string;

    const receivedEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString()) as { event: string; data: Record<string, unknown> };
      receivedEvents.push(parsed);
    });

    ws.send(JSON.stringify({ action: 'subscribe', serverId }));
    await waitForCondition(() => receivedEvents.some((e) => e.event === 'terminal_state'));

    // Send duplicate requestId twice -> command must execute ONLY once
    const dupPayload = JSON.stringify({
      action: 'terminal_exec',
      serverId,
      command: 'echo UNIQUE_TOKEN_7788',
      requestId: 'dedup-req-001',
    });
    ws.send(dupPayload);
    ws.send(dupPayload);

    await waitForCondition(() => receivedEvents.some((e) => e.event === 'terminal_exit'));

    const matchingOutputs = receivedEvents.filter(
      (e) =>
        e.event === 'terminal_data' &&
        e.data.stream === 'stdout' &&
        String(e.data.text).includes('UNIQUE_TOKEN_7788')
    );
    expect(matchingOutputs).toHaveLength(1);

    // Attempt `cd ..` outside workspace -> must be rejected with exitCode 1
    receivedEvents.length = 0;
    ws.send(
      JSON.stringify({
        action: 'terminal_exec',
        serverId,
        command: 'cd ..',
        requestId: 'cd-escape-001',
      })
    );
    await waitForCondition(() => receivedEvents.some((e) => e.event === 'terminal_exit'));
    expect(
      receivedEvents.some(
        (e) => e.event === 'terminal_data' && String(e.data.text).includes('restricted to server workspace')
      )
    ).toBe(true);

    // Reconnect a fresh WebSocket client and verify status broadcasts arrive
    ws.close();
    const ws2 = new WebSocket(wsUrl);
    const ws2Events: Array<{ event: string; data: Record<string, unknown> }> = [];
    await new Promise<void>((resolve, reject) => {
      ws2.once('open', () => resolve());
      ws2.once('error', reject);
    });
    ws2.on('message', (raw) => {
      ws2Events.push(JSON.parse(raw.toString()));
    });
    ws2.send(JSON.stringify({ action: 'subscribe', serverId }));
    await waitForCondition(() => ws2Events.some((e) => e.event === 'terminal_state'));

    await fetch(`${baseUrl}/api/servers/${serverId}/start`, { method: 'POST' });
    await waitForCondition(() =>
      ws2Events.some((e) => e.event === 'status' && e.data.new_status === 'running')
    );
    await fetch(`${baseUrl}/api/servers/${serverId}/stop`, { method: 'POST' });
    await waitForCondition(() =>
      ws2Events.some((e) => e.event === 'status' && e.data.new_status === 'stopped')
    );

    ws2.close();
  });

  it('enforces sandboxed file CRUD, blocks ../ and symlink escapes, syncs .env, and hardens git clone', async () => {
    const port = await getFreePort();
    const srv = await (
      await fetch(`${baseUrl}/api/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sandbox Security Server', port, template: 'blank' }),
      })
    ).json();
    const serverId = srv.id as string;

    // 1. File CRUD: mkdir -> write -> read -> rename -> delete
    const mkdirRes = await fetch(`${baseUrl}/api/servers/${serverId}/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'config' }),
    });
    expect(mkdirRes.status).toBe(200);

    const writeRes = await fetch(`${baseUrl}/api/servers/${serverId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'config/settings.json', content: '{"hello":"world"}' }),
    });
    expect(writeRes.status).toBe(200);

    const readRes = await fetch(
      `${baseUrl}/api/servers/${serverId}/files?path=${encodeURIComponent('config/settings.json')}&content=true`
    );
    expect(readRes.status).toBe(200);
    expect((await readRes.json()).content).toBe('{"hello":"world"}');

    const renameRes = await fetch(`${baseUrl}/api/servers/${serverId}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_path: 'config/settings.json', new_path: 'config/app.json' }),
    });
    expect(renameRes.status).toBe(200);

    const delRes = await fetch(
      `${baseUrl}/api/servers/${serverId}/files?path=${encodeURIComponent('config/app.json')}`,
      { method: 'DELETE' }
    );
    expect(delRes.status).toBe(200);

    // 2. Path traversal via ../ must return 403 PATH_TRAVERSAL
    const traversalRes = await fetch(
      `${baseUrl}/api/servers/${serverId}/files?path=${encodeURIComponent('../../nodepanel.json')}&content=true`
    );
    expect(traversalRes.status).toBe(403);
    expect((await traversalRes.json()).code).toBe('PATH_TRAVERSAL');

    // 3. Symlink escape inside server root pointing outside must return 403 SYMLINK_ESCAPE
    const outsideSecret = path.join(tempDataDir, 'outside-secret.txt');
    fs.writeFileSync(outsideSecret, 'TOP_SECRET_DATA');
    const symlinkPath = path.join(tempDataDir, 'servers', serverId, 'escape-link.txt');
    fs.symlinkSync(outsideSecret, symlinkPath);

    const symlinkRes = await fetch(
      `${baseUrl}/api/servers/${serverId}/files?path=escape-link.txt&content=true`
    );
    expect(symlinkRes.status).toBe(403);
    expect((await symlinkRes.json()).code).toBe('SYMLINK_ESCAPE');

    // 4. .env persistence and key validation
    const badEnvRes = await fetch(`${baseUrl}/api/servers/${serverId}/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables: { '123-INVALID': 'val' } }),
    });
    expect(badEnvRes.status).toBe(400);
    expect((await badEnvRes.json()).code).toBe('INVALID_ENV_KEY');

    const saveEnvRes = await fetch(`${baseUrl}/api/servers/${serverId}/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables: { PORT: String(port), FEATURE_FLAG: 'enabled_v2' } }),
    });
    expect(saveEnvRes.status).toBe(200);

    const getEnvRes = await fetch(`${baseUrl}/api/servers/${serverId}/env`);
    const envJson = await getEnvRes.json();
    expect(
      envJson.variables.find((v: { key: string; value: string }) => v.key === 'FEATURE_FLAG')?.value
    ).toBe('enabled_v2');

    // 5. Git clone command-injection & option-injection rejection + safe local file:// bare repo clone
    const markerPath = path.join(tempDataDir, 'injected-marker');
    const cmdInjRes = await fetch(`${baseUrl}/api/git/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_url: `https://github.com/org/repo.git; touch ${markerPath}` }),
    });
    expect(cmdInjRes.status).toBe(400);
    expect(fs.existsSync(markerPath)).toBe(false);

    const optInjRes = await fetch(`${baseUrl}/api/git/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_url: '--upload-pack=touch /tmp/pwn' }),
    });
    expect(optInjRes.status).toBe(400);

    // Create a genuine local git repo in tempDataDir and clone via file://
    const localRepoDir = path.join(tempDataDir, 'fixture-repo');
    fs.mkdirSync(localRepoDir, { recursive: true });
    fs.writeFileSync(
      path.join(localRepoDir, 'package.json'),
      JSON.stringify({ name: 'cloned-fixture', version: '1.0.0', main: 'server.js' }, null, 2)
    );
    fs.writeFileSync(path.join(localRepoDir, 'server.js'), 'console.log("cloned ok");\n');
    execFileSync('git', ['init'], { cwd: localRepoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: localRepoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test Runner'], { cwd: localRepoDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: localRepoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Initial fixture'], { cwd: localRepoDir, stdio: 'ignore' });

    const validCloneRes = await fetch(`${baseUrl}/api/git/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_url: `file://${localRepoDir}`,
        name: 'Cloned Fixture App',
        auto_install: false,
      }),
    });
    expect(validCloneRes.status).toBe(201);
    const clonedBody = await validCloneRes.json();
    expect(clonedBody.server.entry_file).toBe('server.js');
    expect(clonedBody.server.name).toBe('Cloned Fixture App');
  });
});
