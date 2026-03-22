/**
 * IPC client that connects to the labbook daemon over named pipe / Unix socket.
 * Sends JSON-RPC requests and matches responses by ID.
 */

import { createConnection, type Socket } from "node:net";
import { createLineParser, serialize, type JsonRpcRequest, type JsonRpcResponse } from "../daemon/protocol.js";

export class DaemonClient {
  private socket: Socket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private connected = false;

  constructor(private ipcPath: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.ipcPath);

      const onError = (err: Error) => {
        socket.removeListener("connect", onConnect);
        reject(err);
      };

      const onConnect = () => {
        socket.removeListener("error", onError);
        this.socket = socket;
        this.connected = true;

        const parser = createLineParser((msg) => {
          const resp = msg as JsonRpcResponse;
          if (resp.id === undefined) return;

          const p = this.pending.get(resp.id);
          if (!p) return;
          this.pending.delete(resp.id);

          if (resp.error) {
            p.reject(new Error(resp.error.message));
          } else {
            p.resolve(resp.result);
          }
        });

        socket.on("data", parser);
        socket.on("close", () => this.onDisconnect());
        socket.on("error", () => this.onDisconnect());

        resolve();
      };

      socket.once("error", onError);
      socket.once("connect", onConnect);
    });
  }

  private onDisconnect(): void {
    this.connected = false;
    this.socket = null;

    // Reject all pending requests
    for (const [, p] of this.pending) {
      p.reject(new Error("Daemon connection lost"));
    }
    this.pending.clear();
  }

  async request(method: string, params: unknown): Promise<unknown> {
    if (!this.socket || !this.connected) {
      throw new Error("Not connected to daemon");
    }

    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket!.write(serialize(req), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
