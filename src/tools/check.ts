import { query } from "../ipc/proxy-kuzu.js";
import { getTrialTable } from "../ipc/proxy-lance.js";
import { embed } from "../ipc/proxy-embed.js";
import { formatTrial, type TrialRow, type DecisionRow } from "../formatting.js";

export async function checkBeforeChange(args: {
  component: string;
  session_id?: number;
  include_similar?: boolean;
  proposed_change?: string;
}): Promise<string> {
  const includeSimilar = args.include_similar ?? true;
  const sections: string[] = [];

  // 1. Direct trial history for this component
  const trialRows = await query(
    `MATCH (t:Trial)-[:MODIFIES]->(c:Component {name: $name})
     MATCH (s:Session)-[:CONTAINS]->(t)
     RETURN t.id AS id, t.change_description AS change_description, t.outcome AS outcome,
            t.key_learning AS key_learning, t.error_summary AS error_summary,
            t.rationale AS rationale, t.created_at AS created_at,
            s.name AS session_name
     ORDER BY t.created_at`,
    { name: args.component }
  );
  const trials = trialRows as unknown as (TrialRow & { session_name: string })[];

  if (trials.length > 0) {
    sections.push(`## Direct History: ${args.component} (${trials.length} trial${trials.length !== 1 ? "s" : ""})`);
    trials.forEach(t => sections.push(formatTrial(t)));
  } else {
    sections.push(`## Direct History: ${args.component}\nNo prior trials found.`);
  }

  // 2. Active decisions for this component (filter superseded in JS)
  const allDecisions = await query(
    `MATCH (d:Decision)-[:APPLIES_TO]->(c:Component {name: $name})
     RETURN d.id AS id, d.decision AS decision, d.rationale AS rationale`,
    { name: args.component }
  );
  const supersededRows = await query(
    `MATCH (newer:Decision)-[:SUPERSEDES]->(old:Decision)-[:APPLIES_TO]->(c:Component {name: $name})
     RETURN old.id AS id`,
    { name: args.component }
  );
  const supersededIds = new Set(supersededRows.map(r => r.id as number));
  const decisions = (allDecisions as unknown as DecisionRow[]).filter(d => !supersededIds.has(d.id));

  if (decisions.length > 0) {
    sections.push("\n## Active Decisions");
    decisions.forEach(d => sections.push(`- ${d.decision} (${d.rationale})`));
  }

  // 3. Semantic search for similar trials from other sessions
  if (includeSimilar) {
    try {
      const searchText = args.proposed_change ?? `changes to ${args.component}`;
      const vector = await embed(searchText);
      const table = await getTrialTable();

      let results = await table.search(vector).limit(5).toArray();

      // Exclude current session if provided
      if (args.session_id !== undefined) {
        results = results.filter((r: Record<string, unknown>) => r.session_id !== args.session_id);
      }

      if (results.length > 0) {
        sections.push("\n## Similar Patterns (other sessions)");
        for (const r of results) {
          const distance = (r._distance as number)?.toFixed(2) ?? "?";
          sections.push(
            `- ${r.session_name} [Trial #${r.trial_id}]: ${r.text}\n  Outcome: ${r.outcome} | Similarity: ${distance}`
          );
        }
      }
    } catch {
      // LanceDB table may be empty on first run — that's fine
    }
  }

  return sections.join("\n");
}
