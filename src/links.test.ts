import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { updateLinks, findBacklinks } from "./links.js";

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

/** Cross-case path resolution only works on case-insensitive filesystems (macOS, Windows). */
async function isCaseInsensitiveFs(): Promise<boolean> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-mcp-fscheck-"));
  try {
    await fs.writeFile(path.join(dir, "CaseCheck.tmp"), "");
    return await fs.access(path.join(dir, "casecheck.tmp")).then(
      () => true,
      () => false,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const caseInsensitiveFs = await isCaseInsensitiveFs();

describe("updateLinks", () => {
  test("rewrites an escaped alias inside a table cell, preserving the escape", async () => {
    await writeNote("A.md", "| [[B\\|Bee]] | x |\n");
    await updateLinks("B.md", "C.md");
    assert.equal(await readNote("A.md"), "| [[C\\|Bee]] | x |\n");
  });

  test("rewrites a normal aliased link", async () => {
    await writeNote("A.md", "[[B|Bee]]\n");
    await updateLinks("B.md", "C.md");
    assert.equal(await readNote("A.md"), "[[C|Bee]]\n");
  });

  test("rewrites a link with a heading", async () => {
    await writeNote("A.md", "[[B#Heading]]\n");
    await updateLinks("B.md", "C.md");
    assert.equal(await readNote("A.md"), "[[C#Heading]]\n");
  });

  test("rewrites a bare link", async () => {
    await writeNote("A.md", "[[B]]\n");
    await updateLinks("B.md", "C.md");
    assert.equal(await readNote("A.md"), "[[C]]\n");
  });

  test("rewrites a URL-encoded markdown link", async () => {
    await writeNote("A.md", "See [here](B%20note.md).\n");
    await updateLinks("B note.md", "C note.md");
    assert.equal(await readNote("A.md"), "See [here](C%20note.md).\n");
  });

  test("leaves a malformed escape (backslash not before a pipe) untouched", async () => {
    const original = "[[B\\typo]]\n";
    await writeNote("A.md", original);
    const result = await updateLinks("B.md", "C.md");
    assert.equal(await readNote("A.md"), original);
    assert.equal(result.linkCount, 0);
    assert.deepEqual(result.updatedFiles, []);
  });
});

describe("findBacklinks", () => {
  test("finds bare, aliased, heading, escaped-alias, and markdown links", async () => {
    await writeNote("Target.md", "# Target\n");
    await writeNote(
      "Linker.md",
      ["[[Target]]", "[[Target|Alias]]", "[[Target#Heading]]", "| [[Target\\|Esc]] |", "[md](Target.md)"].join("\n") + "\n",
    );

    const results = await findBacklinks("Target.md");

    assert.equal(results.length, 5);
    assert.ok(results.every((r) => r.path === "Linker.md"));
    assert.deepEqual(
      results.map((r) => r.line),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      results.map((r) => r.type),
      ["wikilink", "wikilink", "wikilink", "wikilink", "markdown"],
    );
  });

  test("excludes a self-reference", async () => {
    await writeNote("Target.md", "[[Target]]\n");
    const results = await findBacklinks("Target.md");
    assert.deepEqual(results, []);
  });

  test(
    "excludes a self-reference when called with a differently-cased path",
    { skip: !caseInsensitiveFs && "requires a case-insensitive filesystem" },
    async () => {
      await writeNote("Target.md", "[[Target]]\n[[target]]\n");
      const results = await findBacklinks("target.md");
      assert.deepEqual(results, []);
    },
  );

  test("throws for a note that does not exist", async () => {
    await assert.rejects(() => findBacklinks("Missing.md"));
  });
});
