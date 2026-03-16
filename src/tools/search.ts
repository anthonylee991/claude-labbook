import { query } from "../db/kuzu.js";
import { getCodeTable } from "../db/lance.js";
import { embed } from "../embeddings.js";

export async function searchCode(args: {
  query: string;
  language?: string;
  path_prefix?: string;
  limit?: number;
  include_trials?: boolean;
}): Promise<string> {
  const limit = args.limit ?? 10;
  const includeTrials = args.include_trials ?? true;

  const vector = await embed(args.query);
  const codeTable = await getCodeTable();

  // Build filter expression
  const filters: string[] = [];
  if (args.language) {
    filters.push(`language = '${args.language}'`);
  }
  if (args.path_prefix) {
    filters.push(`starts_with(file_path, '${args.path_prefix}')`);
  }

  let searchQuery = codeTable.search(vector).limit(limit);
  if (filters.length > 0) {
    searchQuery = searchQuery.where(filters.join(" AND "));
  }

  const results = await searchQuery.toArray();

  if (results.length === 0) {
    return `No code results found for: "${args.query}"`;
  }

  const sections: string[] = [];
  sections.push(`## Code Results for: "${args.query}"\n`);

  for (const r of results) {
    const distance = (r._distance as number)?.toFixed(2) ?? "?";
    const filePath = r.file_path as string;
    const lineStart = r.line_start as number;
    const lineEnd = r.line_end as number;
    const language = r.language as string;
    const chunkText = r.chunk_text as string;

    sections.push(`### ${filePath}:${lineStart}-${lineEnd} (score: ${distance})`);
    sections.push("```" + language);

    // Truncate long chunks for display
    const lines = chunkText.split("\n");
    if (lines.length > 30) {
      sections.push(lines.slice(0, 25).join("\n"));
      sections.push(`... (${lines.length - 25} more lines)`);
    } else {
      sections.push(chunkText);
    }
    sections.push("```\n");

    // Check for trial history on this file
    if (includeTrials) {
      const trialRows = await query(
        `MATCH (c:Component)-[:MAPS_TO]->(f:CodeFile {path: $path})
         MATCH (t:Trial)-[:MODIFIES]->(c)
         MATCH (s:Session)-[:CONTAINS]->(t)
         RETURN s.name AS session_name, s.id AS session_id, t.id AS trial_id,
                t.change_description AS change_description, t.outcome AS outcome,
                t.key_learning AS key_learning
         ORDER BY t.created_at DESC
         LIMIT 5`,
        { path: filePath }
      );

      if (trialRows.length > 0) {
        const sessionName = trialRows[0].session_name;
        const sessionId = trialRows[0].session_id;
        sections.push(`**Trial history:** ${trialRows.length} trial(s) in ${sessionName} [Session #${sessionId}]`);
        for (const t of trialRows) {
          const icon = t.outcome === "success" ? "✅" : t.outcome === "failure" ? "❌" : "⚠️";
          let line = `- ${icon} #${t.trial_id}: ${t.change_description} → ${t.outcome}`;
          if (t.key_learning) line += ` (${t.key_learning})`;
          sections.push(line);
        }
        sections.push("");
      }
    }
  }

  return sections.join("\n");
}
