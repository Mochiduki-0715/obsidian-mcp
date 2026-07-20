import * as fs from "node:fs/promises";
import * as path from "node:path";
import { vaultRoot, walk, toRelPath } from "./vault.js";

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

  const oldTargets = new Set(
    [oldNoExt, oldBase, oldNoExt + ".md", oldBase + ".md"].map((t) => t.toLowerCase()),
  );

  const updatedFiles: string[] = [];
  let linkCount = 0;

  await walk(vaultRoot(), async (abs) => {
    const raw = await fs.readFile(abs, "utf-8");
    let changed = 0;

    const wikiRe = /\[\[([^\[\]|#]+)(#[^\[\]|]*)?(\|[^\[\]]*)?\]\]/g;
    let updated = raw.replace(wikiRe, (whole, target: string, heading = "", alias = "") => {
      if (!oldTargets.has(target.trim().toLowerCase())) return whole;
      changed++;
      return `[[${newTarget}${heading ?? ""}${alias ?? ""}]]`;
    });

    const mdRe = /(\]\()([^)\s]+\.md)((?:#[^)\s]*)?\))/g;
    updated = updated.replace(mdRe, (whole, open: string, target: string, close: string) => {
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

function stripMd(p: string): string {
  return p.replace(/\.md$/i, "");
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
