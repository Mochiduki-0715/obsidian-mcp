import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getOutline } from "./outline.js";

let vaultDir: string;

beforeEach(async () => {
  vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-mcp-"));
  process.env.OBSIDIAN_VAULT_PATH = vaultDir;
});

afterEach(async () => {
  delete process.env.OBSIDIAN_VAULT_PATH;
  await fs.rm(vaultDir, { recursive: true, force: true });
});

async function writeNote(rel: string, content: string): Promise<void> {
  const abs = path.join(vaultDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

describe("getOutline", () => {
  test("returns headings with level, text, and line number", async () => {
    await writeNote("A.md", "# Title\n\nIntro\n\n## Section\n\nBody\n\n### Sub\n");
    const outline = await getOutline("A.md");
    assert.deepEqual(outline.headings, [
      { level: 1, text: "Title", line: 1 },
      { level: 2, text: "Section", line: 5 },
      { level: 3, text: "Sub", line: 9 },
    ]);
    assert.equal(outline.lineCount, 10);
  });

  test("does not treat '#' inside a fenced code block as a heading", async () => {
    await writeNote("A.md", "# Real\n\n```\n# not a heading\n```\n\n## Also real\n");
    const outline = await getOutline("A.md");
    assert.deepEqual(outline.headings, [
      { level: 1, text: "Real", line: 1 },
      { level: 2, text: "Also real", line: 7 },
    ]);
  });

  test("handles tilde fences too", async () => {
    await writeNote("A.md", "~~~\n# not a heading\n~~~\n# Real\n");
    const outline = await getOutline("A.md");
    assert.deepEqual(outline.headings, [{ level: 1, text: "Real", line: 4 }]);
  });

  test("returns no headings for a note with none", async () => {
    await writeNote("A.md", "Just some text.\n");
    const outline = await getOutline("A.md");
    assert.deepEqual(outline.headings, []);
    assert.equal(outline.lineCount, 2);
  });

  test("throws for a note that does not exist", async () => {
    await assert.rejects(() => getOutline("Missing.md"));
  });
});
