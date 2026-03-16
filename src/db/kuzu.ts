import kuzu, { type KuzuValue } from "kuzu";
import { join } from "node:path";

let db: kuzu.Database | null = null;
let conn: kuzu.Connection | null = null;

export async function initKuzu(labbookDir: string): Promise<void> {
  // Kuzu creates its own directory — do NOT pre-create it
  const kuzuDir = join(labbookDir, "kuzu");
  db = new kuzu.Database(kuzuDir);
  conn = new kuzu.Connection(db);

  // Create node tables
  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Session (
      id INT64,
      name STRING,
      description STRING,
      project STRING,
      status STRING DEFAULT 'active',
      started_at STRING,
      resolved_at STRING,
      resolution STRING,
      PRIMARY KEY (id)
    )
  `);

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Trial (
      id INT64,
      change_description STRING,
      rationale STRING,
      outcome STRING,
      error_summary STRING,
      key_learning STRING,
      created_at STRING,
      PRIMARY KEY (id)
    )
  `);

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Component (
      id INT64,
      name STRING,
      component_type STRING,
      PRIMARY KEY (id)
    )
  `);

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Decision (
      id INT64,
      decision STRING,
      rationale STRING,
      created_at STRING,
      PRIMARY KEY (id)
    )
  `);

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS EnvFact (
      id INT64,
      key STRING,
      value STRING,
      category STRING,
      PRIMARY KEY (id)
    )
  `);

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS CodeFile (
      id INT64,
      path STRING,
      language STRING,
      size_bytes INT64,
      content_hash STRING,
      last_indexed_at STRING,
      PRIMARY KEY (id)
    )
  `);

  // Create relationship tables
  await conn.query(`CREATE REL TABLE IF NOT EXISTS CONTAINS (FROM Session TO Trial)`);
  await conn.query(`CREATE REL TABLE IF NOT EXISTS MODIFIES (FROM Trial TO Component, change_type STRING)`);
  await conn.query(`CREATE REL TABLE IF NOT EXISTS MAPS_TO (FROM Component TO CodeFile)`);
  await conn.query(`CREATE REL TABLE IF NOT EXISTS LED_TO (FROM Trial TO Trial)`);
  await conn.query(`CREATE REL TABLE IF NOT EXISTS APPLIES_TO (FROM Decision TO Component)`);
  await conn.query(`CREATE REL TABLE IF NOT EXISTS DECIDED_IN (FROM Decision TO Session)`);
  await conn.query(`CREATE REL TABLE IF NOT EXISTS SUPERSEDES (FROM Decision TO Decision)`);
}

/**
 * Execute a Cypher query with optional named parameters.
 * Uses prepare+execute for parameterized queries, plain query() otherwise.
 */
export async function query(cypher: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  if (!conn) throw new Error("Kuzu not initialized");

  let result: kuzu.QueryResult;
  if (params && Object.keys(params).length > 0) {
    const ps = await conn.prepare(cypher);
    result = await conn.execute(ps, params as Record<string, KuzuValue>) as kuzu.QueryResult;
  } else {
    result = await conn.query(cypher) as kuzu.QueryResult;
  }

  const rows: Record<string, unknown>[] = [];
  while (result.hasNext()) {
    const row = await result.getNext();
    // getNext() returns an object with column names as keys
    rows.push(row as Record<string, unknown>);
  }
  return rows;
}

export function getConnection(): kuzu.Connection {
  if (!conn) throw new Error("Kuzu not initialized");
  return conn;
}
