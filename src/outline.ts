import * as fs from "node:fs/promises";
import { exists, resolveNotePath, toRelPath } from "./vault.js";

export interface OutlineHeading {
  level: number;
  text: string;
  line: number;
}

export interface Outline {
  path: string;
  headings: OutlineHeading[];
  lineCount: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

/**
 * Get a note's heading outline (level/text/line) plus its total line count,
 * without reading the full body. Lines inside fenced code blocks are never
 * treated as headings, even if they start with `#`.
 */
export async function getOutline(relPath: string): Promise<Outline> {
  const abs = resolveNotePath(relPath);
  if (!(await exists(abs))) throw new Error(`Note not found: ${toRelPath(abs)}`);
  const raw = await fs.readFile(abs, "utf-8");
  const lines = raw.split("\n");
  const headings: OutlineHeading[] = [];

  // Only a fence marker using the same character (` or ~) as the one that
  // opened the block can close it — a different marker appearing inside is
  // just literal fenced content (e.g. a ~~~ example inside a ``` block).
  let fenceChar: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      if (fenceChar === null) fenceChar = char;
      else if (char === fenceChar) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;
    const m = line.match(HEADING_RE);
    if (m) headings.push({ level: m[1].length, text: m[2], line: i + 1 });
  }

  return { path: toRelPath(abs), headings, lineCount: lines.length };
}
