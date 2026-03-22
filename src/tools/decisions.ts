import { query } from "../ipc/proxy-kuzu.js";
import { nextId } from "../ipc/proxy-ids.js";
import { regenerateSummary } from "../ipc/proxy-summary.js";

export async function logDecision(args: {
  session_id?: number;
  component?: string;
  decision: string;
  rationale: string;
  supersedes_id?: number;
}): Promise<{ decision_id: number; message: string }> {
  const id = await nextId("decision");
  const now = new Date().toISOString();

  await query(
    `CREATE (d:Decision {id: $id, decision: $decision, rationale: $rationale, created_at: $created_at})`,
    { id, decision: args.decision, rationale: args.rationale, created_at: now }
  );

  // DECIDED_IN edge
  if (args.session_id !== undefined) {
    await query(
      `MATCH (d:Decision {id: $did}), (s:Session {id: $sid}) CREATE (d)-[:DECIDED_IN]->(s)`,
      { did: id, sid: args.session_id }
    );
  }

  // APPLIES_TO edge
  if (args.component) {
    // Find or create component
    const existing = await query(`MATCH (c:Component {name: $name}) RETURN c.id AS id`, { name: args.component });
    let compId: number;
    if (existing.length > 0) {
      compId = existing[0].id as number;
    } else {
      compId = await nextId("component");
      await query(
        `CREATE (c:Component {id: $id, name: $name, component_type: 'file'})`,
        { id: compId, name: args.component }
      );
    }
    await query(
      `MATCH (d:Decision {id: $did}), (c:Component {id: $cid}) CREATE (d)-[:APPLIES_TO]->(c)`,
      { did: id, cid: compId }
    );
  }

  // SUPERSEDES edge
  if (args.supersedes_id !== undefined) {
    await query(
      `MATCH (d:Decision {id: $did}), (old:Decision {id: $old}) CREATE (d)-[:SUPERSEDES]->(old)`,
      { did: id, old: args.supersedes_id }
    );
  }

  await regenerateSummary();
  return { decision_id: id, message: `Decision #${id} recorded.` };
}
