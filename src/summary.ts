import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { query } from "./db/kuzu.js";
import {
  formatSessionBlock,
  formatEnvFacts,
  type TrialRow,
  type SessionRow,
  type DecisionRow,
  type EnvFactRow,
} from "./formatting.js";

let projectRoot: string;

export function initSummary(root: string): void {
  projectRoot = root;
}

/**
 * Regenerate .claude/experiment_log.md with current state.
 * Called after every write operation.
 */
export async function regenerateSummary(): Promise<void> {
  if (!projectRoot) return;

  const content = await buildBriefingContent({ maxTrialsPerSession: 10, includeResolved: false });

  const outPath = join(projectRoot, ".claude", "experiment_log.md");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content, "utf-8");
}

export async function buildBriefingContent(opts: {
  maxTrialsPerSession: number;
  includeResolved: boolean;
}): Promise<string> {
  const sections: string[] = [];
  sections.push("# LabBook — Experiment Log\n");

  // Environment facts
  const envRows = await query("MATCH (e:EnvFact) RETURN e.id AS id, e.key AS key, e.value AS value, e.category AS category");
  const facts = envRows as unknown as EnvFactRow[];
  if (facts.length > 0) {
    sections.push(formatEnvFacts(facts));
  }

  // Sessions — use inline property filter to avoid WHERE + OPTIONAL MATCH scope issue in Kuzu
  let sessionQuery: string;
  if (opts.includeResolved) {
    sessionQuery = `
      MATCH (s:Session)
      OPTIONAL MATCH (s)-[:CONTAINS]->(t:Trial)
      RETURN s.id AS id, s.name AS name, s.description AS description, s.project AS project,
             s.status AS status, s.started_at AS started_at, s.resolved_at AS resolved_at,
             s.resolution AS resolution, count(t) AS trial_count
      ORDER BY started_at DESC
    `;
  } else {
    sessionQuery = `
      MATCH (s:Session {status: 'active'})
      OPTIONAL MATCH (s)-[:CONTAINS]->(t:Trial)
      RETURN s.id AS id, s.name AS name, s.description AS description, s.project AS project,
             s.status AS status, s.started_at AS started_at, s.resolved_at AS resolved_at,
             s.resolution AS resolution, count(t) AS trial_count
      ORDER BY started_at DESC
    `;
  }

  const sessionRows = await query(sessionQuery);

  for (const row of sessionRows) {
    const session = row as unknown as SessionRow & { trial_count: number };

    // Get trials for this session
    const trialRows = await query(`
      MATCH (s:Session {id: $id})-[:CONTAINS]->(t:Trial)
      RETURN t.id AS id, t.change_description AS change_description, t.outcome AS outcome,
             t.key_learning AS key_learning, t.error_summary AS error_summary,
             t.rationale AS rationale, t.created_at AS created_at
      ORDER BY t.created_at DESC
      LIMIT ${opts.maxTrialsPerSession}
    `, { id: session.id });
    const trials = trialRows as unknown as TrialRow[];

    // Get decisions for this session (filter out superseded ones in JS)
    const allDecisionRows = await query(`
      MATCH (d:Decision)-[:DECIDED_IN]->(s:Session {id: $id})
      RETURN d.id AS id, d.decision AS decision, d.rationale AS rationale
    `, { id: session.id });

    // Get superseded decision IDs
    const supersededRows = await query(`
      MATCH (newer:Decision)-[:SUPERSEDES]->(old:Decision)-[:DECIDED_IN]->(s:Session {id: $id})
      RETURN old.id AS id
    `, { id: session.id });
    const supersededIds = new Set(supersededRows.map(r => r.id as number));

    const decisions = (allDecisionRows as unknown as DecisionRow[]).filter(d => !supersededIds.has(d.id));

    sections.push("\n---\n");
    sections.push(formatSessionBlock(session, trials.reverse(), decisions, session.trial_count));
  }

  if (sessionRows.length === 0) {
    sections.push("\n*No active sessions.*");
  }

  return sections.join("\n");
}
