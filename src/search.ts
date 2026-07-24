import * as fs from "node:fs/promises";
import matter from "gray-matter";
import safeRegex from "safe-regex2";
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
  regex?: boolean;
  frontmatter?: Record<string, unknown>;
}

/**
 * Case-insensitive full-text search across all notes. When `tag` is given,
 * only notes carrying the tag (frontmatter `tags` or inline `#tag`) are
 * searched; when `frontmatter` is given, only notes whose frontmatter matches
 * every key/value pair are searched. With no `query`, every matching note is
 * returned as one hit. With `regex: true`, `query` is interpreted as a
 * case-insensitive regular expression instead of a plain substring.
 */
export async function searchNotes(opts: SearchOptions): Promise<SearchMatch[]> {
  const { query, tag, frontmatter } = opts;
  const limit = opts.limit ?? 50;
  if (!query && !tag && !frontmatter) throw new Error("Provide at least one of: query, tag, frontmatter");

  let pattern: RegExp | undefined;
  if (query && opts.regex) {
    try {
      pattern = new RegExp(query, "i");
    } catch (err) {
      throw new Error(`Invalid regex "${query}": ${err instanceof Error ? err.message : String(err)}`);
    }
    // Reject patterns vulnerable to catastrophic backtracking (e.g. `(a+)+$`)
    // before running them — a single such query can hang the process for
    // seconds to minutes since JS regex execution can't be interrupted or
    // timed out mid-match.
    if (!safeRegex(pattern)) {
      throw new Error(`Invalid regex "${query}": pattern is vulnerable to catastrophic backtracking`);
    }
  }

  const matches: SearchMatch[] = [];
  const needle = query?.toLowerCase();

  await walk(vaultRoot(), async (abs) => {
    if (matches.length >= limit) return;
    const raw = await fs.readFile(abs, "utf-8");
    if (tag && !hasTag(raw, tag)) return;
    if (frontmatter && !matchesFrontmatter(raw, frontmatter)) return;

    if (!query) {
      matches.push({ path: toRelPath(abs), line: 1, text: firstNonEmptyLine(raw), context: [] });
      return;
    }

    const lines = raw.split("\n");
    for (let i = 0; i < lines.length && matches.length < limit; i++) {
      const hit = pattern ? pattern.test(lines[i]) : lines[i].toLowerCase().includes(needle!);
      if (hit) {
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

/** Loosely compares frontmatter values as strings, so numbers/booleans/dates match plain-text input. */
function matchesFrontmatter(raw: string, wanted: Record<string, unknown>): boolean {
  let data: Record<string, unknown>;
  try {
    data = (matter(raw).data as Record<string, unknown>) ?? {};
  } catch {
    return false;
  }
  return Object.entries(wanted).every(([key, value]) => {
    if (!(key in data)) return false;
    return stringifyFrontmatterValue(data[key]) === stringifyFrontmatterValue(value);
  });
}

function stringifyFrontmatterValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
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
