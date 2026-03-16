# Claude LabBook

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js 20+](https://img.shields.io/badge/node-20+-blue.svg)](https://nodejs.org/)

**Persistent experiment tracking and semantic code search for AI coding agents — never repeat a failed approach.**

LabBook is an [MCP server](https://modelcontextprotocol.io/) that gives Claude Code (and other MCP-compatible agents) a durable memory of what was tried, what worked, what failed, and why. When the context window compacts or a new conversation starts, LabBook recovers the full history so the agent can pick up where it left off.

---

## The Problem

AI coding agents lose context. After a long session, the context window compresses and the agent forgets what it already tried. It re-attempts the same failed fix, reverts working code, or re-discovers the same dead end — wasting time and tokens.

## How LabBook Solves It

LabBook persists experiment history in a local graph database (Kuzu) and vector store (LanceDB). Every code change is logged as a **trial** with its outcome. Before modifying code, the agent checks what was already attempted. After context compaction, a single `get_briefing` call restores the full picture.

---

## Features

- **Session tracking** — group related trials into problem-solving sessions
- **Trial logging** — record every code change with outcome (success/failure/partial/reverted) and key learnings
- **Decision logging** — capture architectural decisions with rationale, supersede outdated ones
- **Environment facts** — persist machine-specific details (commands, paths, ports) across conversations
- **Pre-change checks** — before modifying code, surface prior trials and active decisions for that component
- **Semantic code search** — index the codebase and search by what code *does*, not just keywords
- **Incremental indexing** — only re-index files whose content has changed (SHA-256 content hashing)
- **Auto-generated briefing** — `.claude/experiment_log.md` is regenerated after every write, providing a human-readable log
- **Graph-based relationships** — trials link to components, components map to code files, decisions apply to components, trials chain to prior trials

## Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org/)

### Install

```bash
npm install -g claude-labbook
```

Or run directly:

```bash
npx claude-labbook
```

Or clone and build from source:

```bash
git clone https://github.com/anthonylee991/claude-labbook.git
cd claude-labbook
npm install
npm run build
```

### MCP Integration

LabBook is an MCP server — it's designed to be used by AI agents, not run standalone. See the [MCP Setup Guide](docs/MCP.md) for step-by-step instructions for each editor.

**Claude Code (CLI / VS Code):**
```bash
claude mcp add labbook -s user -- npx claude-labbook
```

**Claude Desktop / Cursor / Windsurf** — add to your MCP config file ([locations](docs/MCP.md)):
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

See the [MCP Setup Guide](docs/MCP.md) for detailed instructions for Claude Code, Claude Desktop, Cursor, Windsurf, and other MCP-compatible editors.

## Tools

LabBook exposes 12 MCP tools:

| Tool | Description |
|------|-------------|
| `start_session` | Start a new experiment session for a problem or feature |
| `resolve_session` | Mark a session as resolved, abandoned, or paused |
| `list_sessions` | List sessions filtered by status |
| `log_trial` | Record the outcome of a code change (the core tool) |
| `get_trial_chain` | Follow the chain of trials to see the evolution of attempts |
| `log_decision` | Record an architectural or strategic decision |
| `log_env_fact` | Record a machine-specific or environment detail |
| `get_env_facts` | Retrieve environment facts |
| `get_briefing` | Get a compact summary of all active sessions, trials, and decisions |
| `check_before_change` | Check prior trials and decisions before modifying a component |
| `scan_codebase` | Index or re-index the project codebase for semantic search |
| `search_code` | Semantic search across the indexed codebase |

## How It Works

### Storage

LabBook stores data in `.claude/labbook/` within your project directory:

- **Kuzu** (graph database) — sessions, trials, components, decisions, environment facts, code files, and all relationships between them
- **LanceDB** (vector store) — embeddings for semantic search over trials and code chunks
- **fastembed** (`all-MiniLM-L6-v2`) — local embedding model, no API calls needed

### Graph Schema

```
Session ──CONTAINS──> Trial ──MODIFIES──> Component ──MAPS_TO──> CodeFile
   │                    │                     ▲
   │                    └──LED_TO──> Trial    │
   │                                          │
   └── Decision ──APPLIES_TO─────────────────┘
         │
         └──SUPERSEDES──> Decision
```

### Auto-Generated Briefing

After every write operation, LabBook regenerates `.claude/experiment_log.md` — a Markdown file summarizing active sessions, trials (with outcome icons ✅❌⚠️↩️), decisions, and environment facts. This file is human-readable and can be committed to version control.

## Architecture

```
src/
├── db/                   # Database layer
│   ├── kuzu.ts           # Graph database (sessions, trials, components, decisions)
│   ├── lance.ts          # Vector store (trial + code embeddings)
│   └── ids.ts            # Auto-increment ID manager
├── scanner/              # Codebase indexing
│   ├── walker.ts         # Directory traversal (.gitignore-aware)
│   ├── chunker.ts        # Source code chunking (logical boundary splitting)
│   └── languages.ts      # File extension → language mapping
├── tools/                # MCP tool implementations
│   ├── sessions.ts       # start_session, resolve_session, list_sessions
│   ├── trials.ts         # log_trial, get_trial_chain
│   ├── decisions.ts      # log_decision
│   ├── env-facts.ts      # log_env_fact, get_env_facts
│   ├── briefing.ts       # get_briefing
│   ├── check.ts          # check_before_change
│   ├── scan.ts           # scan_codebase
│   └── search.ts         # search_code
├── embeddings.ts         # fastembed wrapper (all-MiniLM-L6-v2, 384 dims)
├── formatting.ts         # Shared formatting for trials, sessions, decisions
├── summary.ts            # Auto-generates .claude/experiment_log.md
├── server.ts             # MCP server setup and tool dispatch
└── index.ts              # Entry point (stdio transport)
```

## Documentation

| Document | Description |
|----------|-------------|
| [MCP Setup Guide](docs/MCP.md) | Step-by-step MCP configuration for all supported editors |

## Contributing

Contributions are welcome but this project is maintained on a best-effort basis. PRs may not be reviewed immediately. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
