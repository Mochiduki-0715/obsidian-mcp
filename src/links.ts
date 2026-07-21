import * as fs from "node:fs/promises";
import * as path from "node:path";
import { vaultRoot, walk, toRelPath, resolveNotePath, exists } from "./vault.js";

/**
 * Matches [[wikilinks]] with optional #heading and |alias. The alias
 * delimiter may be escaped as `\|` (Obsidian escapes it this way inside
 * Markdown table cells, where a bare `|` would split the cell). Target and
 * heading exclude backslash so the escape isn't swallowed into the target.
 * The delimiter and alias text are wrapped in one non-capturing group so
 * they only capture together — a stray backslash with no following `|`
 * (not a real escape) fails the match entirely instead of silently eating
 * into the alias text.
 */
function wikiLinkRe(): RegExp {
  return /\[\[([^\[\]|#\\]+)(#[^\[\]|\\]*)?(?:(\\?\|)([^\[\]]*))?\]\]/g;
}

function mdLinkRe(): RegExp {
  return /(\]\()([^)\s]+\.md)((?:#[^)\s]*)?\))/g;
}

function stripMd(p: string): string {
  return p.replace(/\.md$/i, "");
}

function normalizeTarget(t: string): string {
  return t.trim().toLowerCase();
}

/** The set of link-target spellings that resolve to a given note path. */
function targetSet(noExt: string, base: string): Set<string> {
  return new Set([noExt, base, noExt + ".md", base + ".md"].map((t) => t.toLowerCase()));
}

/**
 * After a note moves from `oldRel` to `newRel`, rewrite links in every other
 * note. Handles [[wikilinks]] (with optional #heading and |alias) and inline
 * markdown links (target ending in .md, possibly URL-encoded).
 *
 * Link targets are matched against the old basename and the old full path
 * (each with and without the .md extension), mirroring how Obsidian resolves
 * links. The new target uses the bare basename when it is unique in the
 * vault, otherwise the full path — Obsidian's "shortest path" convention.
 */
export async function updateLinks(oldRel: string, newRel: string): Promise<{ updatedFiles: string[]; linkCount: number }> {
  const oldNoExt = stripMd(oldRel);
  const oldBase = path.basename(oldNoExt);
  const newNoExt = stripMd(newRel);
  const newBase = path.basename(newNoExt);

  const newTarget = (await basenameIsUnique(newBase, newRel)) ? newBase : newNoExt;
  const oldTargets = targetSet(oldNoExt, oldBase);

  const updatedFiles: string[] = [];
  let linkCount = 0;

  await walk(vaultRoot(), async (abs) => {
    const raw = await fs.readFile(abs, "utf-8");
    let changed = 0;

    let updated = raw.replace(wikiLinkRe(), (whole, target: string, heading = "", delim = "", aliasText = "") => {
      if (!oldTargets.has(normalizeTarget(target))) return whole;
      changed++;
      // Preserve the original delimiter (`|` or the table-escaped `\|`) so an
      // escaped alias doesn't turn into a bare pipe that would split a table row.
      const aliasPart = delim ? `${delim}${aliasText ?? ""}` : "";
      return `[[${newTarget}${heading ?? ""}${aliasPart}]]`;
    });

    updated = updated.replace(mdLinkRe(), (whole, open: string, target: string, close: string) => {
      let decoded = target;
      try {
        decoded = decodeURIComponent(target);
      } catch {}
      if (!oldTargets.has(decoded.toLowerCase()) && !oldTargets.has(stripMd(decoded).toLowerCase())) {
        return whole;
      }
      changed++;
      return `${open}${encodeURI(newNoExt + ".md")}${close}`;
    });

    if (changed > 0) {
      await fs.writeFile(abs, updated, "utf-8");
      updatedFiles.push(toRelPath(abs));
      linkCount += changed;
    }
  });

  return { updatedFiles, linkCount };
}

/**
 * Find notes that link to `relPath`, via [[wikilinks]] (with optional
 * #heading/|alias, including the table-escaped `\|` form) or inline
 * `](note.md)` markdown links.
 */
export interface Backlink {
  path: string;
  line: number;
  type: "wikilink" | "markdown";
}

export async function findBacklinks(relPath: string): Promise<Backlink[]> {
  const abs = resolveNotePath(relPath);
  if (!(await exists(abs))) throw new Error(`Note not found: ${toRelPath(abs)}`);
  const rel = toRelPath(abs);
  const noExt = stripMd(rel);
  const base = path.basename(noExt);
  const targets = targetSet(noExt, base);

  const results: Backlink[] = [];

  await walk(vaultRoot(), async (fileAbs) => {
    const fileRel = toRelPath(fileAbs);
    if (fileRel === rel) return;
    const raw = await fs.readFile(fileAbs, "utf-8");
    const lines = raw.split("\n");

    lines.forEach((line, idx) => {
      for (const m of line.matchAll(wikiLinkRe())) {
        if (targets.has(normalizeTarget(m[1]))) {
          results.push({ path: fileRel, line: idx + 1, type: "wikilink" });
        }
      }
      for (const m of line.matchAll(mdLinkRe())) {
        let decoded = m[2];
        try {
          decoded = decodeURIComponent(m[2]);
        } catch {}
        if (targets.has(decoded.toLowerCase()) || targets.has(stripMd(decoded).toLowerCase())) {
          results.push({ path: fileRel, line: idx + 1, type: "markdown" });
        }
      }
    });
  });

  return results;
}

async function basenameIsUnique(base: string, selfRel: string): Promise<boolean> {
  const selfNorm = stripMd(selfRel).toLowerCase();
  let unique = true;
  await walk(vaultRoot(), async (abs) => {
    const rel = stripMd(toRelPath(abs)).toLowerCase();
    if (rel === selfNorm) return;
    if (path.basename(rel) === base.toLowerCase()) unique = false;
  });
  return unique;
}
