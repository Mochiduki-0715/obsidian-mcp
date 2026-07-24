import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createFromTemplate } from "../template.js";
import { ok, fail } from "../tool-helpers.js";

export function registerTemplateTools(server: McpServer): void {
  server.registerTool(
    "create_from_template",
    {
      description:
        "Create a note from a template. Templates live in the folder set by OBSIDIAN_TEMPLATE_DIR (default 'Templates'). Replaces {{date}} (today, YYYY-MM-DD), {{title}} (the new note's filename), and any {{name}} passed in `variables`; other {{...}} placeholders are left untouched.",
      inputSchema: {
        path: z.string().describe("Vault-relative path for the new note"),
        template: z.string().describe("Template note path, relative to the template folder"),
        variables: z.record(z.string(), z.string()).optional().describe("Extra {{name}} -> value substitutions"),
        overwrite: z.boolean().optional().describe("Replace the destination note if it already exists (default false)"),
      },
    },
    async ({ path, template, variables, overwrite }) => {
      try {
        return ok({ created: await createFromTemplate(path, template, variables ?? {}, overwrite ?? false) });
      } catch (err) {
        return fail(err);
      }
    },
  );
}
