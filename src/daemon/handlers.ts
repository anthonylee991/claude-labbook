/**
 * JSON-RPC method dispatch for daemon requests.
 * Routes each method to the actual database/embedding/summary operation.
 */

import type { JsonRpcRequest, JsonRpcResponse } from "./protocol.js";
import { query } from "../db/kuzu.js";
import { getTrialTable, getCodeTable } from "../db/lance.js";
import { nextId } from "../db/ids.js";
import { embed, embedBatch } from "../embeddings.js";
import { regenerateSummary, buildBriefingContent } from "../summary.js";
import { clients } from "./lifecycle.js";

/**
 * Simple async queue to serialize Kuzu operations.
 * Kuzu connections are not safe for concurrent use.
 */
let queue = Promise.resolve() as Promise<unknown>;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, () => fn());
  queue = p.then(() => {}, () => {});
  return p;
}

export async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    const result = await dispatch(req.method, req.params as Record<string, unknown>);
    return { jsonrpc: "2.0", id: req.id, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message } };
  }
}

async function dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    // --- Kuzu ---
    case "kuzu.query":
      return enqueue(() =>
        query(params.cypher as string, params.params as Record<string, unknown> | undefined)
      );

    // --- LanceDB Trial Table ---
    case "lance.trialAdd": {
      const table = await getTrialTable();
      await table.add(params.rows as Record<string, unknown>[]);
      return null;
    }
    case "lance.trialSearch": {
      const table = await getTrialTable();
      return await table
        .search(params.vector as number[])
        .limit(params.limit as number)
        .toArray();
    }
    case "lance.trialDelete": {
      const table = await getTrialTable();
      await table.delete(params.filter as string);
      return null;
    }

    // --- LanceDB Code Table ---
    case "lance.codeAdd": {
      const table = await getCodeTable();
      await table.add(params.rows as Record<string, unknown>[]);
      return null;
    }
    case "lance.codeSearch": {
      const table = await getCodeTable();
      let q = table.search(params.vector as number[]).limit(params.limit as number);
      if (params.where) {
        q = q.where(params.where as string);
      }
      return await q.toArray();
    }
    case "lance.codeDelete": {
      const table = await getCodeTable();
      await table.delete(params.filter as string);
      return null;
    }

    // --- IDs ---
    case "ids.nextId":
      return enqueue(() => nextId(params.entity as string));

    // --- Summary ---
    case "summary.regenerate":
      return enqueue(async () => {
        await regenerateSummary();
        return null;
      });
    case "summary.buildBriefing":
      return enqueue(() =>
        buildBriefingContent({
          maxTrialsPerSession: (params.maxTrialsPerSession as number) ?? 10,
          includeResolved: (params.includeResolved as boolean) ?? false,
        })
      );

    // --- Embeddings ---
    case "embed.single":
      return await embed(params.text as string);
    case "embed.batch":
      return await embedBatch(params.texts as string[]);

    // --- Daemon control ---
    case "daemon.ping":
      return {
        pid: process.pid,
        uptime: process.uptime(),
        clients: clients.size,
      };

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}
