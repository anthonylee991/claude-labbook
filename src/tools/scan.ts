import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { query } from "../db/kuzu.js";
import { getCodeTable } from "../db/lance.js";
import { nextId } from "../db/ids.js";
import { embedBatch } from "../embeddings.js";
import { walkProject } from "../scanner/walker.js";
import { chunkCode } from "../scanner/chunker.js";
import { detectLanguage } from "../scanner/languages.js";

export async function scanCodebase(
  projectRoot: string,
  args: {
    force?: boolean;
    paths?: string[];
    max_file_size_kb?: number;
  }
): Promise<{
  files_indexed: number;
  files_skipped: number;
  files_removed: number;
  total_chunks: number;
}> {
  const force = args.force ?? false;
  const files = await walkProject(projectRoot, {
    maxFileSizeKb: args.max_file_size_kb,
    paths: args.paths,
  });

  let filesIndexed = 0;
  let filesSkipped = 0;
  let totalChunks = 0;

  // Get existing CodeFile nodes for comparison
  const existingRows = await query(
    `MATCH (f:CodeFile) RETURN f.id AS id, f.path AS path, f.content_hash AS content_hash`
  );
  const existingByPath = new Map<string, { id: number; content_hash: string }>();
  for (const row of existingRows) {
    existingByPath.set(row.path as string, { id: row.id as number, content_hash: row.content_hash as string });
  }

  const codeTable = await getCodeTable();
  const seenPaths = new Set<string>();

  // Process files in batches to avoid memory pressure on embeddings
  const BATCH_SIZE = 20;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const toEmbed: { fileId: number; filePath: string; language: string; chunks: { text: string; lineStart: number; lineEnd: number; chunkIndex: number }[] }[] = [];

    for (const file of batch) {
      seenPaths.add(file.relativePath);
      const existing = existingByPath.get(file.relativePath);

      // Read file and compute hash
      let content: string;
      try {
        content = await readFile(file.absolutePath, "utf-8");
      } catch {
        filesSkipped++;
        continue;
      }

      const hash = createHash("sha256").update(content).digest("hex");

      // Skip if already indexed with same hash (unless force)
      if (!force && existing && existing.content_hash === hash) {
        filesSkipped++;
        continue;
      }

      const language = detectLanguage(file.extension) ?? "unknown";
      const now = new Date().toISOString();

      let fileId: number;
      if (existing) {
        // Update existing CodeFile node
        fileId = existing.id;
        await query(
          `MATCH (f:CodeFile {id: $id}) SET f.content_hash = $hash, f.last_indexed_at = $now, f.size_bytes = $size, f.language = $lang`,
          { id: fileId, hash, now, size: file.sizeBytes, lang: language }
        );

        // Delete old embeddings for this file
        try {
          await codeTable.delete(`file_id = ${fileId}`);
        } catch {
          // Table might be empty
        }
      } else {
        // Create new CodeFile node
        fileId = await nextId("codefile");
        await query(
          `CREATE (f:CodeFile {id: $id, path: $path, language: $lang, size_bytes: $size, content_hash: $hash, last_indexed_at: $now})`,
          { id: fileId, path: file.relativePath, lang: language, size: file.sizeBytes, hash, now }
        );

        // Check if any existing Component name matches this file path → create MAPS_TO edge
        const matchingComponents = await query(
          `MATCH (c:Component {name: $path}) RETURN c.id AS id`,
          { path: file.relativePath }
        );
        for (const comp of matchingComponents) {
          await query(
            `MATCH (c:Component {id: $cid}), (f:CodeFile {id: $fid}) CREATE (c)-[:MAPS_TO]->(f)`,
            { cid: comp.id, fid: fileId }
          );
        }
      }

      // Chunk the file
      const chunks = chunkCode(content);
      if (chunks.length > 0) {
        toEmbed.push({
          fileId,
          filePath: file.relativePath,
          language,
          chunks: chunks.map(c => ({ text: c.text, lineStart: c.lineStart, lineEnd: c.lineEnd, chunkIndex: c.chunkIndex })),
        });
      }

      filesIndexed++;
    }

    // Batch embed all chunks from this file batch
    if (toEmbed.length > 0) {
      const allTexts: string[] = [];
      const allMeta: { fileId: number; filePath: string; language: string; chunkIndex: number; lineStart: number; lineEnd: number; text: string }[] = [];

      for (const file of toEmbed) {
        for (const chunk of file.chunks) {
          allTexts.push(chunk.text);
          allMeta.push({
            fileId: file.fileId,
            filePath: file.filePath,
            language: file.language,
            chunkIndex: chunk.chunkIndex,
            lineStart: chunk.lineStart,
            lineEnd: chunk.lineEnd,
            text: chunk.text,
          });
        }
      }

      const vectors = await embedBatch(allTexts);
      const rows = allMeta.map((meta, idx) => ({
        file_id: meta.fileId,
        file_path: meta.filePath,
        chunk_index: meta.chunkIndex,
        chunk_text: meta.text,
        line_start: meta.lineStart,
        line_end: meta.lineEnd,
        language: meta.language,
        vector: vectors[idx],
      }));

      await codeTable.add(rows);
      totalChunks += rows.length;
    }
  }

  // Detect and remove CodeFile nodes for deleted files (only when scanning full project)
  let filesRemoved = 0;
  if (!args.paths || args.paths.length === 0) {
    for (const [path, existing] of existingByPath) {
      if (!seenPaths.has(path)) {
        await query(`MATCH (f:CodeFile {id: $id}) DETACH DELETE f`, { id: existing.id });
        try {
          await codeTable.delete(`file_id = ${existing.id}`);
        } catch {
          // Might not exist in lance
        }
        filesRemoved++;
      }
    }
  }

  return { files_indexed: filesIndexed, files_skipped: filesSkipped, files_removed: filesRemoved, total_chunks: totalChunks };
}
