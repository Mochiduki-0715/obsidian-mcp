import * as path from "node:path";
import { exists, readNote, resolveNotePath, writeNote, type Note } from "./vault.js";

const DAILY_DIR = () => process.env.OBSIDIAN_DAILY_DIR ?? "Daily";

/**
 * Get (or create) the daily note for a date. `date` is "YYYY-MM-DD";
 * defaults to today in the local timezone.
 */
export async function dailyNote(date?: string): Promise<{ note: Note; created: boolean }> {
  const day = date ?? localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid date "${day}" — expected YYYY-MM-DD`);
  }
  const rel = path.join(DAILY_DIR(), `${day}.md`);
  const abs = resolveNotePath(rel);

  let created = false;
  if (!(await exists(abs))) {
    const template = `---\ntags: [daily]\ndate: "${day}"\n---\n\n# ${day}\n\n## Notes\n\n## Tasks\n`;
    await writeNote(rel, template, false);
    created = true;
  }
  return { note: await readNote(rel), created };
}

function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
