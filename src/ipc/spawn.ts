/**
 * Connect-or-spawn logic: tries to connect to an existing daemon,
 * spawns one if none is running, then retries the connection.
 */

import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { getIpcPath } from "./path.js";
import { DaemonClient } from "./client.js";

let client: DaemonClient | null = null;
let labbookDirCached: string | null = null;
let projectRootCached: string | null = null;

/**
 * Get the singleton daemon client. Must call connectOrSpawn first.
 */
export function getClient(): DaemonClient {
  if (!client || !client.isConnected()) {
    throw new Error("Daemon client not connected. Call connectOrSpawn() first.");
  }
  return client;
}

/**
 * Connect to an existing daemon, or spawn one if needed.
 * Retries connection with backoff after spawning.
 */
export async function connectOrSpawn(labbookDir: string, projectRoot: string): Promise<DaemonClient> {
  labbookDirCached = labbookDir;
  projectRootCached = projectRoot;

  const ipcPath = getIpcPath(labbookDir);
  client = new DaemonClient(ipcPath);

  // Try connecting to existing daemon
  try {
    await client.connect();
    return client;
  } catch {
    // No daemon running — spawn one
  }

  // On Unix, clean up stale socket file
  if (process.platform !== "win32") {
    try {
      await unlink(ipcPath);
    } catch {
      // File didn't exist
    }
  }

  // Spawn daemon as detached process
  const daemonScript = join(import.meta.dirname, "..", "daemon", "main.js");
  const child = spawn(process.execPath, [daemonScript, labbookDir, projectRoot], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });

  // Wait for READY signal from daemon
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Daemon did not signal READY within 30s"));
    }, 30_000);

    let output = "";
    child.stdout!.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("READY")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (!output.includes("READY")) {
        reject(new Error(`Daemon exited with code ${code} before READY`));
      }
    });
  });

  // Detach child so parent can exit independently
  child.unref();
  child.stdout!.destroy();

  // Retry connection with backoff
  const delays = [50, 100, 200, 400, 800, 1600, 3200];
  for (const delay of delays) {
    await sleep(delay);
    client = new DaemonClient(ipcPath);
    try {
      await client.connect();
      return client;
    } catch {
      // Retry
    }
  }

  throw new Error("Failed to connect to labbook daemon after spawning");
}

/**
 * Reconnect to the daemon (e.g., after daemon crash).
 * Spawns a new daemon if needed.
 */
export async function reconnect(): Promise<DaemonClient> {
  if (!labbookDirCached || !projectRootCached) {
    throw new Error("Cannot reconnect — connectOrSpawn was never called");
  }
  return connectOrSpawn(labbookDirCached, projectRootCached);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
