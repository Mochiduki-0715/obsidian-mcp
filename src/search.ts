import * as fs from "node:fs/promises";
import matter from "gray-matter";
import { vaultRoot, walk, toRelPath } from "./vault.js";

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
  context: string[];
}

export interface SearchOptions {
  query?: string;
  tag?: string;
  limit?: number;
}

/**
 * Case-insensitive full-text search across all notes. When `tag` is given,
 * only notes carrying the tag (frontmatter `tags` or inline `#tag`) are
 * searched; with no `query`, every matching note is returned as one hit.
 */
export async function searchNotes(opts: SearchOptions): Promise<SearchMatch[]> {
  const { query, tag } = opts;
  const limit = opts.limit ?? 50;
  if (!query && !tag) throw new Error("Provide at least one of: query, tag");

  const matches: SearchMatch[] = [];
  const needle = query?.toLowerCase();

  await walk(vaultRoot(), async (abs) => {
    if (matches.length >= limit) return;
    const raw = await fs.readFile(abs, "utf-8");
    if (tag && !hasTag(raw, tag)) return;

    if (!needle) {
      matches.push({ path: toRelPath(abs), line: 1, text: firstNonEmptyLine(raw), context: [] });
      return;
    }

    const lines = raw.split("\n");
    for (let i = 0; i < lines.length && matches.length < limit; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        matches.push({
          path: toRelPath(abs),
          line: i + 1,
          text: lines[i].trim(),
          context: lines.slice(Math.max(0, i - 1), i + 2).map((l) => l.trim()),
        });
      }
    }
  });

  return matches;
}

function hasTag(raw: string, tag: string): boolean {
  const wanted = tag.replace(/^#/, "").toLowerCase();

  let fmTags: unknown;
  try {
    fmTags = matter(raw).data?.tags;
  } catch {
    fmTags = undefined;
  }
  const list = Array.isArray(fmTags) ? fmTags : typeof fmTags === "string" ? fmTags.split(/[,\s]+/) : [];
  if (list.some((t) => String(t).replace(/^#/, "").toLowerCase() === wanted)) return true;

  const inline = raw.matchAll(/(^|\s)#([\w\/-]+)/gu);
  for (const m of inline) {
    const found = m[2].toLowerCase();
    if (found === wanted || found.startsWith(wanted + "/")) return true;
  }
  return false;
}

function firstNonEmptyLine(raw: string): string {
  const body = matter(raw).content;
  for (const line of body.split("\n")) {
    if (line.trim()) return line.trim();
  }
  return "";
}
