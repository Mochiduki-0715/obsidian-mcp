import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchNotes } from "../search.js";
import { ok, fail } from "../tool-helpers.js";

export function registerSearchTools(server: McpServer): void {
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
}
