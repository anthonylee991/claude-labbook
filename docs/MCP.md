# MCP Setup Guide

Claude LabBook is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server. It runs as a background process that your AI coding agent communicates with over stdio. This guide covers setup for all major MCP-compatible editors.

---

## Table of Contents

- [Claude Code (CLI / VS Code)](#claude-code-cli--vs-code)
- [Claude Desktop](#claude-desktop)
- [Cursor](#cursor)
- [Windsurf](#windsurf)
- [Other MCP-Compatible Editors](#other-mcp-compatible-editors)
- [Agent Instructions](#agent-instructions)
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

## Agent Instructions

Installing the MCP server gives your agent access to LabBook's tools, but the agent won't know *when* to call them without instructions. Add the following to your system prompt or instructions file to get the most out of LabBook.

### Where to put instructions

| Editor | File | Scope |
|--------|------|-------|
| Claude Code | `~/.claude/CLAUDE.md` | Global (all projects) |
| Claude Code | `CLAUDE.md` in project root | Per-project |
| Cursor | Cursor Settings > Rules | Global or per-project |
| Windsurf | Windsurf Settings > AI Rules | Global |
| Other | Your editor's system prompt config | Varies |

### Example instructions

Copy and paste this into your instructions file. Adjust tool name prefixes if your editor uses a different convention (Claude Code uses `mcp__labbook__` prefix automatically).

```markdown
## Experiment Tracking (LabBook)

LabBook is a persistent experiment log. It survives context compaction and
prevents repeating failed approaches. Use it for ALL code changes.

### Files to Read First
- ALWAYS read `.claude/experiment_log.md` before starting any work (if it exists)

### Required Tool Usage
- At conversation start or after any context gap: call `get_briefing`
- At conversation start (if not recently scanned): call `scan_codebase` to ensure the code index is current
- Before reverting ANY change: call `check_before_change` for that component
- Before modifying a component with known prior trials: call `check_before_change`
- When looking for code by functionality (not filename): call `search_code`
- After testing ANY code change (pass or fail): call `log_trial` with the outcome
- When you discover a machine-specific detail (commands, paths, ports): call `log_env_fact`
- When making an architectural/strategic decision: call `log_decision`
- Never revert a change without confirming the revert target wasn't a previous failure

### Session Management
- If no active session exists for the current work, call `start_session`
- When a problem is fully solved, call `resolve_session` with what worked
```

### What each instruction does

| Instruction | Why it matters |
|-------------|----------------|
| Read `experiment_log.md` first | Gives the agent immediate context without a tool call — the file is auto-generated |
| `get_briefing` at start | Recovers full context after compaction or new conversation |
| `scan_codebase` at start | Ensures the semantic code index is up to date |
| `check_before_change` before modifying | Prevents repeating failed approaches — the core value of LabBook |
| `log_trial` after every test | Builds the history that `check_before_change` relies on |
| `log_env_fact` for machine details | Persists things like `python_cmd=python3` across conversations |
| `log_decision` for architecture | Records *why* choices were made, not just what was done |
| `start_session` / `resolve_session` | Groups related trials so briefings stay organized |

### Minimal version

If you prefer fewer rules, this is the bare minimum that still provides value:

```markdown
## Experiment Tracking (LabBook)
- Read `.claude/experiment_log.md` at the start of every task
- Call `get_briefing` after any context gap
- Call `check_before_change` before modifying code that may have prior trial history
- Call `log_trial` after testing any code change (pass or fail)
- Call `start_session` when beginning work on a new problem
```

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
