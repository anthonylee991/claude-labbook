/**
 * Drop-in replacement for db/kuzu.ts query() — routes through daemon IPC.
 */

import { getClient } from "./spawn.js";

export async function query(
  cypher: string,
  params?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const client = getClient();
  return (await client.request("kuzu.query", { cypher, params })) as Record<string, unknown>[];
}
