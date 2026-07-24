import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appendNote, editNote, listNotes, readNote, updateFrontmatter, writeNote } from "../vault.js";
import { ok, fail } from "../tool-helpers.js";

export function registerVaultTools(server: McpServer): void {
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
    "update_frontmatter",
    {
      description:
        "Update a note's YAML frontmatter by key: merge `set` values (added or overwritten) and delete `remove` keys. The note body is left untouched.",
      inputSchema: {
        path: z.string().describe("Vault-relative note path"),
        set: z.record(z.string(), z.unknown()).optional().describe("Keys to add or overwrite, merged into existing frontmatter"),
        remove: z.array(z.string()).optional().describe("Keys to delete from frontmatter"),
      },
    },
    async ({ path, set, remove }) => {
      try {
        return ok({ frontmatter: await updateFrontmatter(path, set, remove) });
      } catch (err) {
        return fail(err);
      }
    },
  );
}
