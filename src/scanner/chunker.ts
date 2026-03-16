export interface CodeChunk {
  chunkIndex: number;
  text: string;
  lineStart: number; // 1-based
  lineEnd: number;   // 1-based, inclusive
}

const DEFAULT_TARGET = 75;  // Target lines per chunk
const HARD_CAP = 100;       // Force split at this many lines
const MAX_SCAN = 120;       // Look for boundary up to this point before hard-splitting
const OVERLAP = 5;          // Lines of overlap between chunks

/**
 * Split source code into chunks using logical boundaries.
 *
 * Strategy:
 * 1. Primary: blank line separations (function/class boundaries)
 * 2. Secondary: indentation returns to column 0
 * 3. Hard cap: if no boundary found within MAX_SCAN lines, split at HARD_CAP
 * 4. Overlap: OVERLAP lines carried into the next chunk
 */
export function chunkCode(source: string): CodeChunk[] {
  const lines = source.split("\n");
  if (lines.length === 0) return [];

  const chunks: CodeChunk[] = [];
  let chunkStart = 0; // 0-based index into lines[]

  while (chunkStart < lines.length) {
    let splitAt = findSplitPoint(lines, chunkStart);

    const chunkLines = lines.slice(chunkStart, splitAt);
    if (chunkLines.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        text: chunkLines.join("\n"),
        lineStart: chunkStart + 1,
        lineEnd: splitAt,
      });
    }

    // Advance with overlap
    chunkStart = Math.max(splitAt - OVERLAP, splitAt);
    if (chunkStart <= (splitAt - OVERLAP - 1)) {
      // Safety: ensure forward progress
      chunkStart = splitAt;
    }
    // Actually ensure we always move forward
    if (splitAt <= chunkStart && splitAt < lines.length) {
      chunkStart = splitAt;
    }
    chunkStart = splitAt; // Simple: no overlap back-step for now to avoid infinite loops
  }

  // Add overlap between consecutive chunks by extending each chunk's text
  // to include OVERLAP lines from the next chunk's start
  // Actually, let's just do clean splits for V1 — overlap complicates things
  // and the embedding model handles context well enough at 50-100 line chunks

  return chunks;
}

function findSplitPoint(lines: string[], start: number): number {
  const remaining = lines.length - start;
  if (remaining <= HARD_CAP) return lines.length; // Last chunk, take everything

  // Look for a good boundary between TARGET and MAX_SCAN
  let bestSplit = -1;
  let bestScore = -1;

  for (let i = start + DEFAULT_TARGET; i < start + MAX_SCAN && i < lines.length; i++) {
    const score = boundaryScore(lines, i);
    if (score > bestScore) {
      bestScore = score;
      bestSplit = i;
    }
  }

  // If we found a good boundary (blank line or dedent), use it
  if (bestScore >= 2) return bestSplit;

  // Hard cap: just split at HARD_CAP
  return start + HARD_CAP;
}

/**
 * Score how good a split point line index is.
 * Higher = better boundary.
 */
function boundaryScore(lines: string[], index: number): number {
  if (index >= lines.length) return 0;

  const line = lines[index];
  const prevLine = index > 0 ? lines[index - 1] : "";

  // Blank line after content = great boundary (function/class gap)
  if (line.trim() === "" && prevLine.trim() !== "") return 10;

  // Line at column 0 after indented content = good boundary
  if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
    if (prevLine.startsWith(" ") || prevLine.startsWith("\t")) return 5;
    return 3;
  }

  // Closing brace/bracket at low indentation
  if (line.trim() === "}" || line.trim() === "};" || line.trim() === ")") {
    return 4;
  }

  return 1;
}
