/** Shared formatting functions for tool outputs */

export interface TrialRow {
  id: number;
  change_description: string;
  outcome: string;
  key_learning?: string;
  error_summary?: string;
  rationale?: string;
  created_at?: string;
}

export interface SessionRow {
  id: number;
  name: string;
  description?: string;
  project?: string;
  status: string;
  started_at: string;
  resolved_at?: string;
  resolution?: string;
}

export interface DecisionRow {
  id: number;
  decision: string;
  rationale: string;
  created_at?: string;
}

export interface EnvFactRow {
  id: number;
  key: string;
  value: string;
  category?: string;
}

const OUTCOME_ICON: Record<string, string> = {
  success: "✅",
  failure: "❌",
  partial: "⚠️",
  reverted: "↩️",
};

export function formatTrial(t: TrialRow): string {
  const icon = OUTCOME_ICON[t.outcome] ?? "•";
  let line = `- ${icon} #${t.id}: ${t.change_description} → ${t.outcome}`;
  if (t.key_learning) line += ` (LEARNING: ${t.key_learning})`;
  if (t.error_summary && t.outcome !== "success") line += ` [${t.error_summary}]`;
  return line;
}

export function formatSessionBlock(
  session: SessionRow,
  trials: TrialRow[],
  decisions: DecisionRow[],
  trialCount: number
): string {
  const lines: string[] = [];
  const statusLabel = session.status === "active" ? "Active" : capitalise(session.status);
  lines.push(`## ${statusLabel}: ${session.name} [Session #${session.id}]`);
  lines.push(`Started: ${session.started_at?.slice(0, 10) ?? "unknown"} | ${trialCount} trial${trialCount !== 1 ? "s" : ""}`);

  if (session.resolution) {
    lines.push(`\nResolution: ${session.resolution}`);
  }

  // Group trials by outcome
  const failed = trials.filter(t => t.outcome === "failure" || t.outcome === "reverted");
  const partial = trials.filter(t => t.outcome === "partial");
  const success = trials.filter(t => t.outcome === "success");

  if (failed.length > 0) {
    lines.push("\n### Failed Approaches");
    failed.forEach(t => lines.push(formatTrial(t)));
  }
  if (partial.length > 0) {
    lines.push("\n### Partial");
    partial.forEach(t => lines.push(formatTrial(t)));
  }
  if (success.length > 0) {
    lines.push("\n### Working");
    success.forEach(t => lines.push(formatTrial(t)));
  }

  if (decisions.length > 0) {
    lines.push("\n### Decisions");
    decisions.forEach(d => lines.push(`- ${d.decision} (${d.rationale})`));
  }

  return lines.join("\n");
}

export function formatEnvFacts(facts: EnvFactRow[]): string {
  if (facts.length === 0) return "";
  const lines = ["## Environment"];
  for (const f of facts) {
    lines.push(`- ${f.key}: ${f.value}`);
  }
  return lines.join("\n");
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
