import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { searchNotes } from "./search.js";

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

describe("searchNotes regex", () => {
  test("matches a regular expression pattern", async () => {
    await writeNote("A.md", "task-123 done\nnothing here\ntask-456 pending\n");
    const results = await searchNotes({ query: "task-\\d+", regex: true });
    assert.deepEqual(
      results.map((r) => r.line),
      [1, 3],
    );
  });

  test("throws a clear error for an invalid regex", async () => {
    await writeNote("A.md", "text\n");
    await assert.rejects(() => searchNotes({ query: "(unclosed", regex: true }), /Invalid regex/);
  });

  test("is case-insensitive like plain-text search", async () => {
    await writeNote("A.md", "Hello World\n");
    const results = await searchNotes({ query: "hello", regex: true });
    assert.equal(results.length, 1);
  });
});

describe("searchNotes frontmatter", () => {
  test("filters notes by a frontmatter key/value pair", async () => {
    await writeNote("A.md", "---\nstatus: todo\n---\n\nMatches\n");
    await writeNote("B.md", "---\nstatus: done\n---\n\nDoes not match\n");
    const results = await searchNotes({ frontmatter: { status: "todo" } });
    assert.deepEqual(
      results.map((r) => r.path),
      ["A.md"],
    );
  });

  test("compares non-string values loosely as strings", async () => {
    await writeNote("A.md", "---\npriority: 3\ndone: true\n---\n\nBody\n");
    const results = await searchNotes({ frontmatter: { priority: "3", done: "true" } });
    assert.equal(results.length, 1);
  });

  test("combines with a text query", async () => {
    await writeNote("A.md", "---\nstatus: todo\n---\n\nfind me\n");
    await writeNote("B.md", "---\nstatus: todo\n---\n\nignore me\n");
    const results = await searchNotes({ query: "find me", frontmatter: { status: "todo" } });
    assert.deepEqual(
      results.map((r) => r.path),
      ["A.md"],
    );
  });

  test("excludes notes missing the key entirely", async () => {
    await writeNote("A.md", "No frontmatter at all\n");
    const results = await searchNotes({ frontmatter: { status: "todo" } });
    assert.deepEqual(results, []);
  });
});
