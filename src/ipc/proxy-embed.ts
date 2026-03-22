/**
 * Drop-in replacement for embeddings.ts — routes through daemon IPC.
 */

import { getClient } from "./spawn.js";

export async function embed(text: string): Promise<number[]> {
  const client = getClient();
  return (await client.request("embed.single", { text })) as number[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  return (await client.request("embed.batch", { texts })) as number[][];
}
