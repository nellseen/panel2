import fs from 'fs';
import os from 'os';
import path from 'path';
import { createPanelServer } from '../../server';

const port = Number(process.env.E2E_PORT || 3199);
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepanel-e2e-'));

async function main() {
  const instance = await createPanelServer({
    dataDir: tempDataDir,
    port,
    host: '127.0.0.1',
    isProd: true,
    enableVite: false,
    serveStatic: true,
    autoRestartBaseMs: 250,
    maxAutoRestarts: 3,
    stopGraceTimeoutMs: 1000,
  });

  console.log(`[E2E Server] Listening on http://127.0.0.1:${instance.port} (dataDir=${tempDataDir})`);

  let shuttingDown = false;
  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await instance.close();
    } catch {
      // Ignore shutdown error
    }
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch {
      // Ignore temp removal error
    }
    process.exit(0);
  };

  process.once('SIGINT', () => void cleanup());
  process.once('SIGTERM', () => void cleanup());
}

main().catch((err) => {
  console.error('[E2E Server] Failed to boot:', err);
  process.exit(1);
});
