#!/usr/bin/env node
/**
 * Daemon entry point — long-lived process that holds Kuzu + LanceDB connections.
 * Spawned automatically by the MCP server on first connect.
 *
 * Usage: node daemon/main.js <labbookDir> <projectRoot>
 */

import { createServer } from "node:net";
import { unlink } from "node:fs/promises";

import { initKuzu } from "../db/kuzu.js";
import { initLance } from "../db/lance.js";
import { initIds } from "../db/ids.js";
import { initSummary, regenerateSummary } from "../summary.js";
import { getIpcPath } from "../ipc/path.js";
import { createLineParser, serialize } from "./protocol.js";
import type { JsonRpcRequest } from "./protocol.js";
import { handleRequest } from "./handlers.js";
import { init as initLifecycle, onClientConnect, shutdown } from "./lifecycle.js";

async function main(): Promise<void> {
  const labbookDir = process.argv[2];
  const projectRoot = process.argv[3];

  if (!labbookDir || !projectRoot) {
    process.stderr.write("Usage: labbook-daemon <labbookDir> <projectRoot>\n");
    process.exit(1);
  }

  // Initialize storage
  initIds(labbookDir);
  await initKuzu(labbookDir);
  await initLance(labbookDir);
  initSummary(projectRoot);
  await regenerateSummary();

  const ipcPath = getIpcPath(labbookDir);

  // On Unix, clean up stale socket file
  if (process.platform !== "win32") {
    try {
      await unlink(ipcPath);
    } catch {
      // File didn't exist — fine
    }
  }

  const server = createServer((socket) => {
    onClientConnect(socket);

    const parser = createLineParser((msg) => {
      const req = msg as JsonRpcRequest;
      if (!req.method) return; // Not a request (could be a stray response)

      handleRequest(req).then((response) => {
        try {
          socket.write(serialize(response));
        } catch {
          // Socket already closed
        }
      });
    });

    socket.on("data", parser);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // Another daemon is already running for this project
      process.stderr.write("Another labbook daemon is already running.\n");
      process.exit(0);
    }
    process.stderr.write(`Daemon server error: ${err.message}\n`);
    process.exit(1);
  });

  server.listen(ipcPath, () => {
    initLifecycle(server, ipcPath);

    // Signal to the spawning client that we're ready
    process.stdout.write("READY\n");

    // Detach stdout/stderr after signaling (daemon runs headless)
    // On Windows, don't close stdout — it causes issues with named pipes
    if (process.platform !== "win32") {
      process.stdout.destroy();
      process.stderr.destroy();
    }
  });
}

main().catch((err) => {
  process.stderr.write(`Daemon fatal: ${err}\n`);
  process.exit(1);
});
