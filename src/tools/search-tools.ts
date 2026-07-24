import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchNotes } from "../search.js";
import { ok, fail } from "../tool-helpers.js";

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_notes",
    {
      description:
        "Full-text search across the vault (case-insensitive), with optional tag and frontmatter filters. With only a tag/frontmatter filter and no query, lists all matching notes. Pass regex: true to interpret the query as a regular expression.",
      inputSchema: {
        query: z.string().optional().describe("Text to search for"),
        tag: z.string().optional().describe("Only notes with this tag, e.g. 'daily' or '#project/foo'"),
        regex: z.boolean().optional().describe("Interpret `query` as a case-insensitive regular expression instead of plain text"),
        frontmatter: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Only notes whose frontmatter matches these key/value pairs (compared as strings)"),
        limit: z.number().int().positive().optional().describe("Max matches to return (default 50)"),
      },
    },
    async ({ query, tag, regex, frontmatter, limit }) => {
      try {
        return ok(await searchNotes({ query, tag, regex, frontmatter, limit }));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
