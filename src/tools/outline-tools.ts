import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOutline } from "../outline.js";
import { ok, fail } from "../tool-helpers.js";

export function registerOutlineTools(server: McpServer): void {
  server.registerTool(
    "get_outline",
    {
      description:
        "Get a note's heading outline (level/text/line) and total line count, without reading the full body. Skips '#' characters inside fenced code blocks.",
      inputSchema: {
        path: z.string().describe("Vault-relative note path"),
      },
    },
    async ({ path }) => {
      try {
        return ok(await getOutline(path));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
