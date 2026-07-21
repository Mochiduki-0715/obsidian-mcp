import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { moveNoteFile, trashNote } from "../vault.js";
import { updateLinks, findBacklinks } from "../links.js";
import { ok, fail } from "../tool-helpers.js";

export function registerLinksTools(server: McpServer): void {
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
}
