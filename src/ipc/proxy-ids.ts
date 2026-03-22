/**
 * Drop-in replacement for db/ids.ts nextId() — routes through daemon IPC.
 */

import { getClient } from "./spawn.js";

export async function nextId(entity: string): Promise<number> {
  const client = getClient();
  return (await client.request("ids.nextId", { entity })) as number;
}
