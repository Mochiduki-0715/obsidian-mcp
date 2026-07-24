#!/usr/bin/env node
import * as fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { vaultRoot } from "./vault.js";
import { registerVaultTools } from "./tools/vault-tools.js";
import { registerSearchTools } from "./tools/search-tools.js";
import { registerLinksTools } from "./tools/links-tools.js";
import { registerDailyTools } from "./tools/daily-tools.js";
import { registerTemplateTools } from "./tools/template-tools.js";

const server = new McpServer({ name: "obsidian-mcp", version: "0.1.0" });

registerVaultTools(server);
registerSearchTools(server);
registerLinksTools(server);
registerDailyTools(server);
registerTemplateTools(server);

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
