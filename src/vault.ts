import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";

const IGNORED_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

export function vaultRoot(): string {
  const root = process.env.OBSIDIAN_VAULT_PATH;
  if (!root) {
    throw new Error("OBSIDIAN_VAULT_PATH environment variable is not set");
  }
  return path.resolve(root);
}

/**
 * Resolve a vault-relative note path to an absolute path, rejecting any
 * path that escapes the vault root. Appends ".md" when no extension given.
 */
export function resolveNotePath(relPath: string, opts?: { allowNonMd?: boolean }): string {
  const root = vaultRoot();
  let rel = relPath.trim().replace(/^\/+/, "");
  if (!path.extname(rel)) rel += ".md";
  if (!opts?.allowNonMd && path.extname(rel).toLowerCase() !== ".md") {
    throw new Error(`Only markdown notes are supported: ${relPath}`);
  }
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes the vault: ${relPath}`);
  }
  return abs;
}

export function toRelPath(absPath: string): string {
  return path.relative(vaultRoot(), absPath);
}

export interface NoteInfo {
  path: string;
  modified: string;
  size: number;
}

export async function listNotes(subdir?: string): Promise<NoteInfo[]> {
  const root = vaultRoot();
  const start = subdir ? resolveDir(subdir) : root;
  const results: NoteInfo[] = [];
  await walk(start, async (abs) => {
    const stat = await fs.stat(abs);
    results.push({
      path: toRelPath(abs),
      modified: stat.mtime.toISOString(),
      size: stat.size,
    });
  });
  results.sort((a, b) => b.modified.localeCompare(a.modified));
  return results;
}

function resolveDir(subdir: string): string {
  const root = vaultRoot();
  const abs = path.resolve(root, subdir.trim().replace(/^\/+/, ""));
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes the vault: ${subdir}`);
  }
  return abs;
}

/** Walk all .md files under dir, skipping Obsidian internals. */
export async function walk(dir: string, visit: (absPath: string) => Promise<void>): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: any) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, visit);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      await visit(abs);
    }
  }
}

export interface Note {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

export async function readNote(relPath: string): Promise<Note> {
  const abs = resolveNotePath(relPath);
  const raw = await fs.readFile(abs, "utf-8");
  const parsed = matter(raw);
  return {
    path: toRelPath(abs),
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content,
    raw,
  };
}

export async function writeNote(relPath: string, content: string, overwrite: boolean): Promise<string> {
  const abs = resolveNotePath(relPath);
  if (!overwrite && (await exists(abs))) {
    throw new Error(`Note already exists: ${toRelPath(abs)} (pass overwrite: true to replace it)`);
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
  return toRelPath(abs);
}

/**
 * Append text to a note. When `heading` is given, the text is inserted at the
 * end of that heading's section (before the next heading of the same or a
 * higher level); otherwise it is appended to the end of the file.
 */
export async function appendNote(
  relPath: string,
  text: string,
  opts: { heading?: string; createIfMissing?: boolean },
): Promise<string> {
  const abs = resolveNotePath(relPath);
  if (!(await exists(abs))) {
    if (!opts.createIfMissing) {
      throw new Error(`Note not found: ${toRelPath(abs)} (pass create_if_missing: true to create it)`);
    }
    const initial = opts.heading ? `## ${opts.heading}\n\n${text}\n` : `${text}\n`;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, initial, "utf-8");
    return toRelPath(abs);
  }

  const raw = await fs.readFile(abs, "utf-8");
  let updated: string;
  if (opts.heading) {
    updated = insertUnderHeading(raw, opts.heading, text);
  } else {
    updated = raw.replace(/\n*$/, "\n\n") + text + "\n";
  }
  await fs.writeFile(abs, updated, "utf-8");
  return toRelPath(abs);
}

function insertUnderHeading(raw: string, heading: string, text: string): string {
  const lines = raw.split("\n");
  const headingRe = /^(#{1,6})\s+(.*?)\s*$/;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingRe);
    if (m && m[2].toLowerCase() === heading.trim().toLowerCase()) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start === -1) {
    // Heading not found: create the section at the end of the note.
    return raw.replace(/\n*$/, "\n\n") + `## ${heading}\n\n${text}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(headingRe);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  // Trim trailing blank lines of the section, then insert.
  let insertAt = end;
  while (insertAt > start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  const inserted = [...lines.slice(0, insertAt), "", text, ...lines.slice(insertAt)];
  return inserted.join("\n");
}

export async function editNote(relPath: string, oldText: string, newText: string, replaceAll: boolean): Promise<number> {
  const abs = resolveNotePath(relPath);
  const raw = await fs.readFile(abs, "utf-8");
  const count = raw.split(oldText).length - 1;
  if (count === 0) {
    throw new Error(`Text not found in ${toRelPath(abs)}`);
  }
  if (count > 1 && !replaceAll) {
    throw new Error(`Text occurs ${count} times in ${toRelPath(abs)}; pass replace_all: true or use a more specific string`);
  }
  const updated = replaceAll ? raw.split(oldText).join(newText) : raw.replace(oldText, newText);
  await fs.writeFile(abs, updated, "utf-8");
  return replaceAll ? count : 1;
}

/**
 * Update a note's YAML frontmatter by key. `set` entries are merged into the
 * existing frontmatter (added or overwritten); `remove` entries are deleted.
 * The body is never touched. Works on notes with no existing frontmatter.
 */
export async function updateFrontmatter(
  relPath: string,
  set?: Record<string, unknown>,
  remove?: string[],
): Promise<Record<string, unknown>> {
  if (!set && !remove) {
    throw new Error("Provide at least one of: set, remove");
  }
  const abs = resolveNotePath(relPath);
  if (!(await exists(abs))) throw new Error(`Note not found: ${toRelPath(abs)}`);
  const raw = await fs.readFile(abs, "utf-8");
  const parsed = matter(raw);
  const data: Record<string, unknown> = { ...parsed.data, ...set };
  for (const key of remove ?? []) delete data[key];
  const updated = matter.stringify(parsed.content, data);
  await fs.writeFile(abs, updated, "utf-8");
  return data;
}

export async function moveNoteFile(fromRel: string, toRel: string): Promise<{ from: string; to: string }> {
  const fromAbs = resolveNotePath(fromRel);
  const toAbs = resolveNotePath(toRel);
  if (!(await exists(fromAbs))) throw new Error(`Note not found: ${toRelPath(fromAbs)}`);
  if (await exists(toAbs)) throw new Error(`Target already exists: ${toRelPath(toAbs)}`);
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
  return { from: toRelPath(fromAbs), to: toRelPath(toAbs) };
}

/** Move a note into the vault's .trash folder (Obsidian's own trash convention). */
export async function trashNote(relPath: string): Promise<string> {
  const abs = resolveNotePath(relPath);
  if (!(await exists(abs))) throw new Error(`Note not found: ${toRelPath(abs)}`);
  const trashDir = path.join(vaultRoot(), ".trash");
  await fs.mkdir(trashDir, { recursive: true });
  let target = path.join(trashDir, path.basename(abs));
  if (await exists(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = path.extname(target);
    target = path.join(trashDir, `${path.basename(target, ext)} ${stamp}${ext}`);
  }
  await fs.rename(abs, target);
  return path.relative(vaultRoot(), target);
}

export async function exists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}
