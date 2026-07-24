# obsidian-mcp

An MCP (Model Context Protocol) server that lets AI coding agents (Claude Code,
Codex CLI, etc.) read, write, search, and organize notes in an Obsidian vault.
It works directly on the filesystem, so Obsidian doesn't need to be running —
Obsidian picks up external changes automatically.

> Community project — not affiliated with Obsidian.

## Setup

```bash
git clone https://github.com/Mochiduki-0715/obsidian-mcp.git
cd obsidian-mcp
npm install
npm run build
```

Configuration is done through environment variables:

| Variable | Description | Default |
|---|---|---|
| `OBSIDIAN_VAULT_PATH` | Absolute path to your vault folder | (required) |
| `OBSIDIAN_DAILY_DIR` | Folder for daily notes, relative to the vault root | `Daily` |

## Registering with agents

### Claude Code

```bash
claude mcp add --scope user obsidian \
  --env OBSIDIAN_VAULT_PATH=$HOME/path/to/your/vault \
  -- node /path/to/obsidian-mcp/dist/index.js
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.obsidian]
command = "node"
args = ["/path/to/obsidian-mcp/dist/index.js"]

[mcp_servers.obsidian.env]
OBSIDIAN_VAULT_PATH = "/path/to/your/vault"
```

## Tools

| Tool | Description |
|---|---|
| `list_notes` | List notes, newest first; optionally restricted to a subfolder |
| `read_note` | Read a note, returning parsed frontmatter and the markdown body |
| `create_note` | Create a note (pass `overwrite: true` to replace an existing one) |
| `append_note` | Append text; with `heading`, insert at the end of that section |
| `edit_note` | Edit by exact string replacement (`old_text` / `new_text`) |
| `update_frontmatter` | Update YAML frontmatter by key: merge `set` values, delete `remove` keys, body untouched |
| `search_notes` | Case-insensitive full-text search, with an optional `tag` filter |
| `move_note` | Move/rename a note and rewrite `[[wikilinks]]` across the vault |
| `delete_note` | Move a note to the vault's `.trash/` folder (safe delete); warns if the note is still linked from elsewhere |
| `backlinks` | List notes that link to a given note, with file/line/link-type |
| `daily_note` | Get or create the daily note for today or a given date |
| `get_outline` | Get a note's heading outline (level/text/line) and line count, skipping code fences |

## Testing

```bash
npm test
```

Runs the TypeScript build followed by Node's built-in test runner
(`node --test`) against the compiled `dist/*.test.js` files.

## Safety

- Every path is resolved inside the vault root; `..` escapes are rejected
- Deleting moves notes to Obsidian's standard `.trash/` folder instead of removing them
- `create_note` never silently overwrites an existing note (an explicit flag is required)

## License

[MIT](LICENSE)
