# MCP Setup Guide

Claude LabBook is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server. It runs as a background process that your AI coding agent communicates with over stdio. This guide covers setup for all major MCP-compatible editors.

---

## Table of Contents

- [Claude Code (CLI / VS Code)](#claude-code-cli--vs-code)
- [Claude Desktop](#claude-desktop)
- [Cursor](#cursor)
- [Windsurf](#windsurf)
- [Other MCP-Compatible Editors](#other-mcp-compatible-editors)
- [Verifying the Connection](#verifying-the-connection)
- [Troubleshooting](#troubleshooting)

---

## Claude Code (CLI / VS Code)

### Quick Setup (recommended)

```bash
claude mcp add labbook -s user -- npx claude-labbook
```

This registers LabBook globally for all projects. Use `-s project` instead to register for the current project only.

### Manual Setup

Add to your global Claude Code config at `~/.claude.json`:

```json
{
  "mcpServers": {
    "labbook": {
      "command": "npx",
      "args": ["claude-labbook"]
    }
  }
}
```

Or if you installed globally (`npm install -g claude-labbook`):

```json
{
  "mcpServers": {
    "labbook": {
      "command": "claude-labbook"
    }
  }
}
```

Or if you built from source:

```json
{
  "mcpServers": {
    "labbook": {
      "command": "node",
      "args": ["/path/to/claude-labbook/dist/index.js"]
    }
  }
}
```

---

## Claude Desktop

Add to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "labbook": {
      "command": "npx",
      "args": ["claude-labbook"]
    }
  }
}
```

Restart Claude Desktop after saving.

---

## Cursor

Add to your Cursor MCP config at `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "labbook": {
      "command": "npx",
      "args": ["claude-labbook"]
    }
  }
}
```

Or for a specific project, create `.cursor/mcp.json` in the project root.

---

## Windsurf

Add to your Windsurf MCP config at `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "labbook": {
      "command": "npx",
      "args": ["claude-labbook"]
    }
  }
}
```

---

## Other MCP-Compatible Editors

For any editor that supports MCP servers via stdio, the configuration pattern is the same:

```json
{
  "command": "npx",
  "args": ["claude-labbook"]
}
```

The server communicates over stdin/stdout using the MCP protocol. No HTTP server, no ports, no configuration needed.

---

## Verifying the Connection

Once configured, your agent should have access to 12 new tools. Ask it to:

```
Call get_briefing to check if LabBook is connected.
```

If LabBook is working, it will return a summary of active sessions (or "No active sessions" on first use).

---

## Troubleshooting

### "Tool not found" or tools not showing up

1. Ensure Node.js 20+ is installed: `node --version`
2. Ensure the package is accessible: `npx claude-labbook --help`
3. Restart your editor after changing MCP config
4. Check your editor's MCP logs for connection errors

### Permission errors on first run

LabBook creates a `.claude/labbook/` directory in your project root to store its databases. Ensure you have write permissions to the project directory.

### Embedding model download

On first `scan_codebase` call, LabBook downloads the `all-MiniLM-L6-v2` embedding model (~23MB). This is cached locally and reused across projects. If you're behind a firewall, ensure access to Hugging Face model hosting.

### Windows-specific

On Windows, use the full path to `node.exe` if `npx` isn't in your PATH:

```json
{
  "mcpServers": {
    "labbook": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\path\\to\\claude-labbook\\dist\\index.js"]
    }
  }
}
```

### Data location

All LabBook data is stored in `.claude/labbook/` within each project directory. This includes:
- `kuzu/` — graph database files
- `lance/` — vector store files
- `id_counters.json` — auto-increment counters

To reset LabBook for a project, delete the `.claude/labbook/` directory.
