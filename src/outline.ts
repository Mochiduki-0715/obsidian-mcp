import * as fs from "node:fs/promises";
import { resolveNotePath, toRelPath } from "./vault.js";

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
  const raw = await fs.readFile(abs, "utf-8");
  const lines = raw.split("\n");
  const headings: OutlineHeading[] = [];

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(HEADING_RE);
    if (m) headings.push({ level: m[1].length, text: m[2], line: i + 1 });
  }

  return { path: toRelPath(abs), headings, lineCount: lines.length };
}
