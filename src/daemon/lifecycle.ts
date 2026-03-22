/**
 * Daemon client tracking and graceful shutdown with grace period.
 */

import type { Socket, Server } from "node:net";
import { unlink } from "node:fs/promises";

const GRACE_PERIOD_MS = 30_000;

export const clients = new Set<Socket>();
let server: Server | null = null;
let ipcPath: string | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;
let shutdownRequested = false;

export function init(srv: Server, path: string): void {
  server = srv;
  ipcPath = path;

  // Start grace timer immediately — if no client connects within 30s, exit
  startGraceTimer();

  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());
  // Windows: parent process exit
  process.on("SIGHUP", () => shutdown());
}

export function onClientConnect(socket: Socket): void {
  clients.add(socket);
  cancelGraceTimer();

  socket.on("close", () => onClientDisconnect(socket));
  socket.on("error", () => onClientDisconnect(socket));
}

function onClientDisconnect(socket: Socket): void {
  clients.delete(socket);
  if (clients.size === 0) {
    startGraceTimer();
  }
}

function startGraceTimer(): void {
  if (graceTimer || shutdownRequested) return;
  graceTimer = setTimeout(() => {
    shutdown();
  }, GRACE_PERIOD_MS);
}

function cancelGraceTimer(): void {
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
}

export async function shutdown(): Promise<void> {
  if (shutdownRequested) return;
  shutdownRequested = true;

  cancelGraceTimer();

  // Close all client sockets
  for (const socket of clients) {
    socket.destroy();
  }
  clients.clear();

  // Close server
  if (server) {
    server.close();
  }

  // Clean up socket file on Unix (Windows named pipes auto-cleanup)
  if (ipcPath && process.platform !== "win32") {
    try {
      await unlink(ipcPath);
    } catch {
      // Already gone
    }
  }

  process.exit(0);
}
