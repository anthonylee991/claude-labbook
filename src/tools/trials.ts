import { query } from "../db/kuzu.js";
import { nextId } from "../db/ids.js";
import { getTrialTable } from "../db/lance.js";
import { embed } from "../embeddings.js";
import { regenerateSummary } from "../summary.js";

async function findOrCreateComponent(name: string, componentType: string): Promise<number> {
  const existing = await query(
    `MATCH (c:Component {name: $name}) RETURN c.id AS id`,
    { name }
  );
  if (existing.length > 0) return existing[0].id as number;

  const id = await nextId("component");
  await query(
    `CREATE (c:Component {id: $id, name: $name, component_type: $ctype})`,
    { id, name, ctype: componentType }
  );
  return id;
}

export async function logTrial(args: {
  session_id: number;
  component: string;
  component_type?: string;
  change_description: string;
  rationale?: string;
  outcome: string;
  error_summary?: string;
  key_learning?: string;
  related_trial_id?: number;
}): Promise<{ trial_id: number; message: string }> {
  const id = await nextId("trial");
  const now = new Date().toISOString();

  // Create Trial node
  await query(
    `CREATE (t:Trial {id: $id, change_description: $change_description, rationale: $rationale, outcome: $outcome, error_summary: $error_summary, key_learning: $key_learning, created_at: $created_at})`,
    {
      id,
      change_description: args.change_description,
      rationale: args.rationale ?? "",
      outcome: args.outcome,
      error_summary: args.error_summary ?? "",
      key_learning: args.key_learning ?? "",
      created_at: now,
    }
  );

  // CONTAINS edge: Session → Trial
  await query(
    `MATCH (s:Session {id: $sid}), (t:Trial {id: $tid}) CREATE (s)-[:CONTAINS]->(t)`,
    { sid: args.session_id, tid: id }
  );

  // Find or create Component, create MODIFIES edge
  const compId = await findOrCreateComponent(args.component, args.component_type ?? "file");
  await query(
    `MATCH (t:Trial {id: $tid}), (c:Component {id: $cid}) CREATE (t)-[:MODIFIES {change_type: $ctype}]->(c)`,
    { tid: id, cid: compId, ctype: args.component_type ?? "file" }
  );

  // LED_TO edge if related trial provided
  if (args.related_trial_id !== undefined) {
    await query(
      `MATCH (prev:Trial {id: $prev}), (curr:Trial {id: $curr}) CREATE (prev)-[:LED_TO]->(curr)`,
      { prev: args.related_trial_id, curr: id }
    );
  }

  // Build embedding text
  const textParts = [args.change_description, args.rationale, args.key_learning, args.error_summary]
    .filter(Boolean) as string[];
  const text = textParts.join(" | ");

  // Get session name for denormalization
  const sessionRows = await query(`MATCH (s:Session {id: $id}) RETURN s.name AS name`, { id: args.session_id });
  const sessionName = (sessionRows[0]?.name as string) ?? "";

  // Embed and upsert to LanceDB
  const vector = await embed(text);
  const table = await getTrialTable();
  await table.add([{
    trial_id: id,
    session_id: args.session_id,
    session_name: sessionName,
    component: args.component,
    text,
    outcome: args.outcome,
    vector,
  }]);

  await regenerateSummary();
  return { trial_id: id, message: `Trial #${id} logged (${args.outcome}) for ${args.component}` };
}

export async function getTrialChain(args: {
  trial_id: number;
  direction?: string;
}): Promise<Record<string, unknown>[]> {
  const dir = args.direction ?? "both";
  const results: Record<string, unknown>[] = [];

  if (dir === "forward" || dir === "both") {
    const forward = await query(
      `MATCH (start:Trial {id: $id})-[:LED_TO*1..]->(t:Trial)
       RETURN t.id AS id, t.change_description AS change_description, t.outcome AS outcome,
              t.key_learning AS key_learning, t.error_summary AS error_summary, t.created_at AS created_at
       ORDER BY t.created_at`,
      { id: args.trial_id }
    );
    results.push(...forward);
  }

  if (dir === "backward" || dir === "both") {
    const backward = await query(
      `MATCH (t:Trial)-[:LED_TO*1..]->(start:Trial {id: $id})
       RETURN t.id AS id, t.change_description AS change_description, t.outcome AS outcome,
              t.key_learning AS key_learning, t.error_summary AS error_summary, t.created_at AS created_at
       ORDER BY t.created_at`,
      { id: args.trial_id }
    );
    results.push(...backward);
  }

  // Add the starting trial itself
  const self = await query(
    `MATCH (t:Trial {id: $id})
     RETURN t.id AS id, t.change_description AS change_description, t.outcome AS outcome,
            t.key_learning AS key_learning, t.error_summary AS error_summary, t.created_at AS created_at`,
    { id: args.trial_id }
  );
  results.push(...self);

  // Deduplicate and sort
  const seen = new Set<number>();
  const unique = results.filter(r => {
    const id = r.id as number;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  unique.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  return unique;
}
