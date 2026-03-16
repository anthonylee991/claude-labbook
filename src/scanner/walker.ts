import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import ignore from "ignore";
type Ignore = ReturnType<typeof ignore>;
import { ALWAYS_IGNORE_DIRS, ALWAYS_IGNORE_FILES, isBinaryExtension } from "./languages.js";

export interface WalkedFile {
  absolutePath: string;
  relativePath: string; // Relative to project root, forward-slash separated
  extension: string;
  sizeBytes: number;
}

/**
 * Walk a project directory, yielding files that should be indexed.
 * Respects .gitignore and built-in ignore patterns.
 */
export async function walkProject(
  projectRoot: string,
  options: {
    maxFileSizeKb?: number;
    paths?: string[]; // Specific relative paths to scan instead of full project
  } = {}
): Promise<WalkedFile[]> {
  const maxSize = (options.maxFileSizeKb ?? 100) * 1024;
  const ig = await buildIgnorer(projectRoot);

  const files: WalkedFile[] = [];

  if (options.paths && options.paths.length > 0) {
    // Scan specific paths only
    for (const p of options.paths) {
      const abs = join(projectRoot, p);
      const s = await stat(abs).catch(() => null);
      if (!s) continue;

      if (s.isFile()) {
        const rel = normalizePath(relative(projectRoot, abs));
        if (!shouldSkip(rel, extname(abs), s.size, maxSize, ig)) {
          files.push({ absolutePath: abs, relativePath: rel, extension: extname(abs), sizeBytes: s.size });
        }
      } else if (s.isDirectory()) {
        await walkDir(abs, projectRoot, maxSize, ig, files);
      }
    }
  } else {
    await walkDir(projectRoot, projectRoot, maxSize, ig, files);
  }

  return files;
}

async function walkDir(
  dir: string,
  projectRoot: string,
  maxSize: number,
  ig: Ignore,
  files: WalkedFile[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Permission denied, etc.
  }

  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = normalizePath(relative(projectRoot, abs));

    if (entry.isDirectory()) {
      // Check built-in directory ignores
      if (ALWAYS_IGNORE_DIRS.includes(entry.name)) continue;
      if (ig.ignores(rel + "/")) continue;
      await walkDir(abs, projectRoot, maxSize, ig, files);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      const s = await stat(abs).catch(() => null);
      if (!s) continue;

      if (!shouldSkip(rel, ext, s.size, maxSize, ig)) {
        files.push({ absolutePath: abs, relativePath: rel, extension: ext, sizeBytes: s.size });
      }
    }
  }
}

function shouldSkip(rel: string, ext: string, size: number, maxSize: number, ig: Ignore): boolean {
  if (ig.ignores(rel)) return true;
  if (isBinaryExtension(ext)) return true;
  if (size > maxSize) return true;
  if (size === 0) return true;

  // Check always-ignore file patterns
  const filename = rel.split("/").pop() ?? "";
  for (const pattern of ALWAYS_IGNORE_FILES) {
    if (matchSimpleGlob(filename, pattern)) return true;
  }

  return false;
}

function matchSimpleGlob(filename: string, pattern: string): boolean {
  if (pattern.startsWith("*")) {
    return filename.endsWith(pattern.slice(1));
  }
  return filename === pattern;
}

async function buildIgnorer(projectRoot: string): Promise<Ignore> {
  const ig = ignore();

  // Add built-in directory patterns
  for (const dir of ALWAYS_IGNORE_DIRS) {
    ig.add(dir + "/");
  }

  // Try to read .gitignore
  try {
    const gitignore = await readFile(join(projectRoot, ".gitignore"), "utf-8");
    ig.add(gitignore);
  } catch {
    // No .gitignore, that's fine
  }

  return ig;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}
