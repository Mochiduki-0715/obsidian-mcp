import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createFromTemplate } from "./template.js";
import { localToday } from "./daily.js";

let vaultDir: string;

beforeEach(async () => {
  vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-mcp-"));
  process.env.OBSIDIAN_VAULT_PATH = vaultDir;
});

afterEach(async () => {
  delete process.env.OBSIDIAN_VAULT_PATH;
  delete process.env.OBSIDIAN_TEMPLATE_DIR;
  await fs.rm(vaultDir, { recursive: true, force: true });
});

async function writeFile(rel: string, content: string): Promise<void> {
  const abs = path.join(vaultDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

async function readNote(rel: string): Promise<string> {
  return fs.readFile(path.join(vaultDir, rel), "utf-8");
}

describe("createFromTemplate", () => {
  test("substitutes {{date}} and {{title}} from the default Templates folder", async () => {
    await writeFile("Templates/task.md", "---\ndate: {{date}}\n---\n\n# {{title}}\n");
    const created = await createFromTemplate("Tasks/My Task.md", "task.md");
    assert.equal(created, "Tasks/My Task.md");
    assert.equal(await readNote("Tasks/My Task.md"), `---\ndate: ${localToday()}\n---\n\n# My Task\n`);
  });

  test("substitutes custom variables", async () => {
    await writeFile("Templates/greeting.md", "Hello {{name}}, welcome to {{place}}.\n");
    await createFromTemplate("out.md", "greeting.md", { name: "Alice", place: "Wonderland" });
    assert.equal(await readNote("out.md"), "Hello Alice, welcome to Wonderland.\n");
  });

  test("leaves undefined placeholders untouched", async () => {
    await writeFile("Templates/t.md", "{{known}} and {{unknown}}\n");
    await createFromTemplate("out.md", "t.md", { known: "yes" });
    assert.equal(await readNote("out.md"), "yes and {{unknown}}\n");
  });

  test("respects OBSIDIAN_TEMPLATE_DIR", async () => {
    process.env.OBSIDIAN_TEMPLATE_DIR = "MyTemplates";
    await writeFile("MyTemplates/t.md", "{{title}}\n");
    await createFromTemplate("out.md", "t.md");
    assert.equal(await readNote("out.md"), "out\n");
  });

  test("throws when the template does not exist", async () => {
    await assert.rejects(() => createFromTemplate("out.md", "missing.md"), /Template not found/);
  });

  test("rejects a template path that escapes the template folder", async () => {
    await writeFile("Secret/passwords.md", "super secret content\n");
    await writeFile("Templates/placeholder.md", "placeholder\n");
    await assert.rejects(
      () => createFromTemplate("leak.md", "../Secret/passwords.md"),
      /escapes the template folder/,
    );
  });

  test("fails without overwrite when the destination already exists", async () => {
    await writeFile("Templates/t.md", "content\n");
    await writeFile("out.md", "existing\n");
    await assert.rejects(() => createFromTemplate("out.md", "t.md"));
  });

  test("overwrite: true replaces an existing destination", async () => {
    await writeFile("Templates/t.md", "new content\n");
    await writeFile("out.md", "old content\n");
    await createFromTemplate("out.md", "t.md", {}, true);
    assert.equal(await readNote("out.md"), "new content\n");
  });
});
