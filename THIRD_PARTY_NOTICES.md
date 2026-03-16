# Third-Party Notices

This file contains the licenses and notices for third-party software used in Claude LabBook.

---

## Table of Contents

- [MCP Protocol](#mcp-protocol)
- [Database](#database)
- [Vector Store](#vector-store)
- [Embeddings](#embeddings)
- [Data Serialization](#data-serialization)
- [Utilities](#utilities)

---

## MCP Protocol

### Model Context Protocol SDK

- **Package**: @modelcontextprotocol/sdk
- **Source**: https://github.com/modelcontextprotocol/typescript-sdk
- **License**: MIT
- **Copyright**: Copyright (c) Anthropic

TypeScript SDK for the Model Context Protocol.

---

## Database

### Kuzu

- **Package**: kuzu
- **Source**: https://github.com/kuzudb/kuzu
- **License**: MIT
- **Copyright**: Copyright (c) Kuzu Inc.

Embeddable property graph database management system. Used as the primary store for sessions, trials, components, decisions, and environment facts.

---

## Vector Store

### LanceDB

- **Package**: @lancedb/lancedb
- **Source**: https://github.com/lancedb/lancedb
- **License**: Apache License 2.0
- **Copyright**: Copyright (c) LanceDB Inc.

Embedded vector database for AI applications. Used for semantic search over trial embeddings and code chunk embeddings.

---

## Embeddings

### FastEmbed

- **Package**: fastembed
- **Source**: https://github.com/Anush008/fastembed-js
- **License**: Apache License 2.0
- **Copyright**: Copyright (c) Anush

Fast, lightweight embedding generation. Uses the `all-MiniLM-L6-v2` model (384 dimensions) for local embedding generation with no API calls.

---

## Data Serialization

### Apache Arrow

- **Package**: apache-arrow
- **Source**: https://github.com/apache/arrow
- **License**: Apache License 2.0
- **Copyright**: Copyright (c) Apache Software Foundation

Cross-language development platform for in-memory data. Required as a peer dependency of LanceDB.

---

## Utilities

### ignore

- **Package**: ignore
- **Source**: https://github.com/kaelzhang/node-ignore
- **License**: MIT
- **Copyright**: Copyright (c) Kael Zhang

`.gitignore` pattern matching for Node.js. Used by the codebase walker to respect ignore patterns.

---

## Summary of Licenses Used

| License | Components |
|---------|------------|
| **Apache-2.0** | LanceDB, FastEmbed, Apache Arrow |
| **MIT** | MCP SDK, Kuzu, ignore |

All third-party components are used in compliance with their respective licenses. These licenses are all permissive open-source licenses that allow commercial use, modification, and distribution.

---

## Contact

If you have questions about licensing or third-party components used in Claude LabBook, please open an issue on the project repository.
