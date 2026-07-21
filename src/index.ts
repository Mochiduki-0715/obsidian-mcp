#!/usr/bin/env node
import * as fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  appendNote,
  editNote,
  listNotes,
  moveNoteFile,
  readNote,
  trashNote,
  vaultRoot,
  writeNote,
} from "./vault.js";
import { searchNotes } from "./search.js";
import { updateLinks, findBacklinks } from "./links.js";
import { dailyNote } from "./daily.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

const server = new McpServer({ name: "obsidian-mcp", version: "0.1.0" });

server.registerTool(
  "list_notes",
  {
    description:
      "List markdown notes in the Obsidian vault, sorted by last modified (newest first). Optionally restrict to a subfolder.",
    inputSchema: {
      folder: z.string().optional().describe("Vault-relative subfolder to list, e.g. 'Daily'. Omit for the whole vault."),
    },
  },
  async ({ folder }) => {
    try {
      return ok(await listNotes(folder));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "read_note",
  {
    description: "Read a note from the vault. Returns the parsed frontmatter and the markdown body.",
    inputSchema: {
      path: z.string().describe("Vault-relative note path, e.g. 'Projects/idea' or 'Projects/idea.md'"),
    },
  },
  async ({ path }) => {
    try {
      const note = await readNote(path);
      return ok({ path: note.path, frontmatter: note.frontmatter, body: note.body });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "create_note",
  {
    description:
      "Create a new markdown note (parent folders are created automatically). Fails if the note exists unless overwrite is true.",
    inputSchema: {
      path: z.string().describe("Vault-relative note path"),
      content: z.string().describe("Full markdown content, including optional YAML frontmatter"),
      overwrite: z.boolean().optional().describe("Replace the note if it already exists (default false)"),
    },
  },
  async ({ path, content, overwrite }) => {
    try {
      return ok({ created: await writeNote(path, content, overwrite ?? false) });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "append_note",
  {
    description:
      "Append text to a note. With 'heading', the text is inserted at the end of that heading's section (the section is created if missing).",
    inputSchema: {
      path: z.string().describe("Vault-relative note path"),
      text: z.string().describe("Markdown text to append"),
      heading: z.string().optional().describe("Insert under this heading instead of at the end of the file"),
      create_if_missing: z.boolean().optional().describe("Create the note if it does not exist (default false)"),
    },
  },
  async ({ path, text, heading, create_if_missing }) => {
    try {
      return ok({ appended: await appendNote(path, text, { heading, createIfMissing: create_if_missing ?? false }) });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "edit_note",
  {
    description:
      "Edit a note by exact string replacement. Fails if old_text is not found, or is ambiguous without replace_all.",
    inputSchema: {
      path: z.string().describe("Vault-relative note path"),
      old_text: z.string().describe("Exact text to replace"),
      new_text: z.string().describe("Replacement text"),
      replace_all: z.boolean().optional().describe("Replace every occurrence (default false)"),
    },
  },
  async ({ path, old_text, new_text, replace_all }) => {
    try {
      return ok({ replacements: await editNote(path, old_text, new_text, replace_all ?? false) });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "search_notes",
  {
    description:
      "Full-text search across the vault (case-insensitive), with optional tag filter. With only a tag, lists all notes carrying it (frontmatter tags or inline #tags).",
    inputSchema: {
      query: z.string().optional().describe("Text to search for"),
      tag: z.string().optional().describe("Only notes with this tag, e.g. 'daily' or '#project/foo'"),
      limit: z.number().int().positive().optional().describe("Max matches to return (default 50)"),
    },
  },
  async ({ query, tag, limit }) => {
    try {
      return ok(await searchNotes({ query, tag, limit }));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "move_note",
  {
    description:
      "Move or rename a note, then rewrite [[wikilinks]] and markdown links in every other note so they keep resolving.",
    inputSchema: {
      from: z.string().describe("Current vault-relative path"),
      to: z.string().describe("New vault-relative path"),
    },
  },
  async ({ from, to }) => {
    try {
      const moved = await moveNoteFile(from, to);
      const links = await updateLinks(moved.from, moved.to);
      return ok({ ...moved, linksUpdated: links.linkCount, filesTouched: links.updatedFiles });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "delete_note",
  {
    description: "Delete a note safely by moving it to the vault's .trash folder (Obsidian's trash convention).",
    inputSchema: {
      path: z.string().describe("Vault-relative note path"),
    },
  },
  async ({ path }) => {
    try {
      const backlinks = await findBacklinks(path);
      const trashedTo = await trashNote(path);
      const result: Record<string, unknown> = { trashedTo };
      if (backlinks.length > 0) {
        result.warning = `Still linked from ${backlinks.length} location(s)`;
        result.backlinks = backlinks;
      }
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "backlinks",
  {
    description:
      "Find notes that link to a given note, via [[wikilinks]] (with #heading/|alias) or ](note.md) markdown links.",
    inputSchema: {
      path: z.string().describe("Vault-relative note path"),
    },
  },
  async ({ path }) => {
    try {
      return ok(await findBacklinks(path));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "daily_note",
  {
    description:
      "Get today's daily note, creating it from a template if needed. Pass 'date' (YYYY-MM-DD) for another day. Notes live in the folder set by OBSIDIAN_DAILY_DIR (default 'Daily').",
    inputSchema: {
      date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
    },
  },
  async ({ date }) => {
    try {
      const { note, created } = await dailyNote(date);
      return ok({ path: note.path, created, frontmatter: note.frontmatter, body: note.body });
    } catch (err) {
      return fail(err);
    }
  },
);

async function main() {
  const root = vaultRoot();
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`obsidian-mcp: vault not found at ${root} (check OBSIDIAN_VAULT_PATH)`);
    process.exit(1);
  }
  await server.connect(new StdioServerTransport());
  console.error(`obsidian-mcp: serving vault at ${root}`);
}

main().catch((err) => {
  console.error("obsidian-mcp: fatal:", err);
  process.exit(1);
});
