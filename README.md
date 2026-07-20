# obsidian-mcp

Obsidian の Vault(Markdown フォルダ)を AI エージェント(Claude Code / Codex CLI など)から
操作するための MCP サーバーです。ファイルシステムを直接読み書きするため、
Obsidian が起動していなくても動作します(Obsidian 側は変更を自動検知します)。

An MCP (Model Context Protocol) server that lets AI coding agents (Claude Code,
Codex CLI, etc.) read, write, search, and organize notes in an Obsidian vault.
It works directly on the filesystem, so Obsidian doesn't need to be running.

> Community project — not affiliated with Obsidian.

## セットアップ / Setup

```bash
git clone https://github.com/Mochiduki-0715/obsidian-mcp.git
cd obsidian-mcp
npm install
npm run build
```

Vault の場所は環境変数で指定します:

| 環境変数 | 意味 | 既定値 |
|---|---|---|
| `OBSIDIAN_VAULT_PATH` | Vault フォルダの絶対パス | (必須) |
| `OBSIDIAN_DAILY_DIR` | デイリーノートの保存先(Vault 相対) | `Daily` |

## エージェントへの登録 / Registration

### Claude Code

```bash
claude mcp add --scope user obsidian \
  --env OBSIDIAN_VAULT_PATH=$HOME/path/to/your/vault \
  -- node /path/to/obsidian-mcp/dist/index.js
```

### Codex CLI

`~/.codex/config.toml` に追記:

```toml
[mcp_servers.obsidian]
command = "node"
args = ["/path/to/obsidian-mcp/dist/index.js"]

[mcp_servers.obsidian.env]
OBSIDIAN_VAULT_PATH = "/path/to/your/vault"
```

## ツール一覧 / Tools

| ツール | 役割 |
|---|---|
| `list_notes` | ノート一覧(サブフォルダ指定可、更新日時順) |
| `read_note` | ノート読み取り(frontmatter をパースして返す) |
| `create_note` | 新規作成(`overwrite: true` で上書き) |
| `append_note` | 追記(`heading` 指定でセクション末尾に挿入) |
| `edit_note` | 文字列置換による部分編集 |
| `search_notes` | 全文検索(大文字小文字無視)+ `tag` 絞り込み |
| `move_note` | リネーム/移動 + Vault 全体の `[[リンク]]` を自動更新 |
| `delete_note` | Vault 内 `.trash/` への移動(安全削除) |
| `daily_note` | 今日(または指定日)のデイリーノート取得/作成 |

## 安全設計 / Safety

- すべてのパスは Vault ルート配下に正規化され、`..` による脱出は拒否されます
- 削除は物理削除ではなく Obsidian 標準の `.trash/` フォルダへの移動です
- `create_note` は既存ノートを黙って上書きしません(明示フラグが必要)

## License

MIT
