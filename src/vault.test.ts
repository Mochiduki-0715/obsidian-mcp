import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { updateFrontmatter } from "./vault.js";

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

async function readNote(rel: string): Promise<string> {
  return fs.readFile(path.join(vaultDir, rel), "utf-8");
}

describe("updateFrontmatter", () => {
  test("merges set values into existing frontmatter without touching the body", async () => {
    await writeNote("A.md", "---\nstatus: todo\n---\n\nBody text\n");
    const data = await updateFrontmatter("A.md", { status: "done" });
    assert.equal(data.status, "done");
    assert.equal(await readNote("A.md"), "---\nstatus: done\n---\n\nBody text\n");
  });

  test("adds a new key alongside existing ones", async () => {
    await writeNote("A.md", "---\nstatus: todo\n---\n\nBody\n");
    const data = await updateFrontmatter("A.md", { priority: "high" });
    assert.equal(data.status, "todo");
    assert.equal(data.priority, "high");
  });

  test("removes keys", async () => {
    await writeNote("A.md", "---\nstatus: todo\npriority: high\n---\n\nBody\n");
    const data = await updateFrontmatter("A.md", undefined, ["priority"]);
    assert.deepEqual(data, { status: "todo" });
  });

  test("creates frontmatter on a note that has none", async () => {
    await writeNote("A.md", "Just body text\n");
    const data = await updateFrontmatter("A.md", { status: "todo" });
    assert.deepEqual(data, { status: "todo" });
    assert.equal(await readNote("A.md"), "---\nstatus: todo\n---\nJust body text\n");
  });

  test("throws when neither set nor remove is given", async () => {
    await writeNote("A.md", "Body\n");
    await assert.rejects(() => updateFrontmatter("A.md"));
  });

  test("throws for a note that does not exist", async () => {
    await assert.rejects(() => updateFrontmatter("Missing.md", { status: "todo" }));
  });
});
