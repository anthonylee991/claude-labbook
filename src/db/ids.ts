import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * File-backed auto-increment ID manager.
 * Stores counters per entity type in a JSON file at .claude/labbook/id_counters.json
 */

interface IdCounters {
  [entity: string]: number;
}

let counters: IdCounters | null = null;
let counterPath: string;

export function initIds(labbookDir: string): void {
  counterPath = join(labbookDir, "id_counters.json");
}

async function load(): Promise<IdCounters> {
  if (counters) return counters;
  try {
    const raw = await readFile(counterPath, "utf-8");
    counters = JSON.parse(raw) as IdCounters;
  } catch {
    counters = {};
  }
  return counters;
}

async function save(): Promise<void> {
  if (!counters) return;
  await writeFile(counterPath, JSON.stringify(counters, null, 2), "utf-8");
}

export async function nextId(entity: string): Promise<number> {
  const c = await load();
  const current = c[entity] ?? 0;
  const next = current + 1;
  c[entity] = next;
  await save();
  return next;
}
