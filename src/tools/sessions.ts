import { query } from "../db/kuzu.js";
import { nextId } from "../db/ids.js";
import { regenerateSummary } from "../summary.js";

export async function startSession(args: {
  name: string;
  description?: string;
  project: string;
}): Promise<{ session_id: number; name: string; project: string }> {
  const id = await nextId("session");
  const now = new Date().toISOString();

  await query(
    `CREATE (s:Session {id: $id, name: $name, description: $description, project: $project, status: 'active', started_at: $started_at})`,
    { id, name: args.name, description: args.description ?? "", project: args.project, started_at: now }
  );

  await regenerateSummary();
  return { session_id: id, name: args.name, project: args.project };
}

export async function resolveSession(args: {
  session_id: number;
  resolution: string;
  status?: string;
}): Promise<{ message: string }> {
  const status = args.status ?? "resolved";
  const now = new Date().toISOString();

  await query(
    `MATCH (s:Session {id: $id}) SET s.status = $status, s.resolved_at = $resolved_at, s.resolution = $resolution`,
    { id: args.session_id, status, resolved_at: now, resolution: args.resolution }
  );

  await regenerateSummary();
  return { message: `Session #${args.session_id} marked as ${status}.` };
}

export async function listSessions(args: {
  status?: string;
}): Promise<Record<string, unknown>[]> {
  const status = args.status ?? "active";

  let cypher: string;
  if (status === "all") {
    cypher = `
      MATCH (s:Session)
      OPTIONAL MATCH (s)-[:CONTAINS]->(t:Trial)
      RETURN s.id AS id, s.name AS name, s.status AS status, s.started_at AS started_at,
             s.resolved_at AS resolved_at, s.resolution AS resolution, count(t) AS trial_count
      ORDER BY started_at DESC
    `;
  } else {
    cypher = `
      MATCH (s:Session {status: $status})
      OPTIONAL MATCH (s)-[:CONTAINS]->(t:Trial)
      RETURN s.id AS id, s.name AS name, s.status AS status, s.started_at AS started_at,
             s.resolved_at AS resolved_at, s.resolution AS resolution, count(t) AS trial_count
      ORDER BY started_at DESC
    `;
  }

  return await query(cypher, status === "all" ? undefined : { status });
}
