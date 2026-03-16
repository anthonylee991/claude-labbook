import * as lancedb from "@lancedb/lancedb";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

let db: lancedb.Connection | null = null;
let trialTable: lancedb.Table | null = null;
let codeTable: lancedb.Table | null = null;

const VECTOR_DIM = 384;

export async function initLance(labbookDir: string): Promise<void> {
  const lanceDir = join(labbookDir, "lance");
  await mkdir(lanceDir, { recursive: true });

  db = await lancedb.connect(lanceDir);

  const tableNames = await db.tableNames();

  if (tableNames.includes("trial_embeddings")) {
    trialTable = await db.openTable("trial_embeddings");
  }

  if (tableNames.includes("code_embeddings")) {
    codeTable = await db.openTable("code_embeddings");
  }
}

export async function getTrialTable(): Promise<lancedb.Table> {
  if (trialTable) return trialTable;
  if (!db) throw new Error("LanceDB not initialized");

  // Create table with a seed row, then delete it
  const zeroVec = new Array(VECTOR_DIM).fill(0);
  trialTable = await db.createTable("trial_embeddings", [
    {
      trial_id: 0,
      session_id: 0,
      session_name: "__seed__",
      component: "__seed__",
      text: "__seed__",
      outcome: "__seed__",
      vector: zeroVec,
    },
  ]);
  await trialTable.delete("trial_id = 0");
  return trialTable;
}

export async function getCodeTable(): Promise<lancedb.Table> {
  if (codeTable) return codeTable;
  if (!db) throw new Error("LanceDB not initialized");

  const zeroVec = new Array(VECTOR_DIM).fill(0);
  codeTable = await db.createTable("code_embeddings", [
    {
      file_id: 0,
      file_path: "__seed__",
      chunk_index: 0,
      chunk_text: "__seed__",
      line_start: 0,
      line_end: 0,
      language: "__seed__",
      vector: zeroVec,
    },
  ]);
  await codeTable.delete("file_id = 0");
  return codeTable;
}

export function getLanceDb(): lancedb.Connection {
  if (!db) throw new Error("LanceDB not initialized");
  return db;
}
