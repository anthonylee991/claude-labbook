/**
 * Drop-in replacement for summary.ts — routes through daemon IPC.
 */

import { getClient } from "./spawn.js";

export async function regenerateSummary(): Promise<void> {
  const client = getClient();
  await client.request("summary.regenerate", {});
}

export async function buildBriefingContent(opts: {
  maxTrialsPerSession: number;
  includeResolved: boolean;
}): Promise<string> {
  const client = getClient();
  return (await client.request("summary.buildBriefing", opts)) as string;
}
