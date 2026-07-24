import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exists, resolveNotePath, toRelPath, writeNote } from "./vault.js";
import { localToday } from "./daily.js";

const TEMPLATE_DIR = () => process.env.OBSIDIAN_TEMPLATE_DIR ?? "Templates";

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Create a note from a template. Templates live in the folder set by
 * OBSIDIAN_TEMPLATE_DIR (default "Templates"). `{{date}}` (today,
 * YYYY-MM-DD), `{{title}}` (the destination note's filename), and any
 * `{{name}}` present in `variables` are substituted; unrecognized
 * placeholders are left untouched.
 */
export async function createFromTemplate(
  destRel: string,
  templateRel: string,
  variables: Record<string, string> = {},
  overwrite = false,
): Promise<string> {
  const templateAbs = resolveNotePath(path.join(TEMPLATE_DIR(), templateRel));
  if (!(await exists(templateAbs))) {
    throw new Error(`Template not found: ${toRelPath(templateAbs)}`);
  }
  const raw = await fs.readFile(templateAbs, "utf-8");

  const title = path.basename(destRel).replace(/\.md$/i, "");
  const vars: Record<string, string> = { date: localToday(), title, ...variables };

  const rendered = raw.replace(PLACEHOLDER_RE, (whole, name: string) => (name in vars ? vars[name] : whole));

  return writeNote(destRel, rendered, overwrite);
}
