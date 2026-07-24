import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dailyNote } from "../daily.js";
import { ok, fail } from "../tool-helpers.js";

export function registerDailyTools(server: McpServer): void {
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
}
