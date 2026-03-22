/**
 * Shared JSON-RPC 2.0 types and NDJSON framing for daemon IPC.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function serialize(msg: JsonRpcRequest | JsonRpcResponse): string {
  return JSON.stringify(msg) + "\n";
}

/**
 * Creates a line parser that buffers incoming stream data and emits
 * complete JSON-RPC messages on each newline boundary.
 * Handles TCP fragmentation (partial messages across data events).
 */
export function createLineParser(onMessage: (msg: JsonRpcRequest | JsonRpcResponse) => void): (chunk: Buffer) => void {
  let buffer = "";

  return (chunk: Buffer) => {
    buffer += chunk.toString("utf-8");
    const lines = buffer.split("\n");
    // Last element is either empty (complete line) or partial (incomplete)
    buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcRequest | JsonRpcResponse;
        onMessage(parsed);
      } catch {
        // Malformed JSON — skip
      }
    }
  };
}
