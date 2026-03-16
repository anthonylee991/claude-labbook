import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

import { initKuzu } from "./db/kuzu.js";
import { initLance } from "./db/lance.js";
import { initIds } from "./db/ids.js";
import { initSummary, regenerateSummary } from "./summary.js";

import { startSession, resolveSession, listSessions } from "./tools/sessions.js";
import { logTrial, getTrialChain } from "./tools/trials.js";
import { logDecision } from "./tools/decisions.js";
import { logEnvFact, getEnvFacts } from "./tools/env-facts.js";
import { getBriefing } from "./tools/briefing.js";
import { checkBeforeChange } from "./tools/check.js";
import { scanCodebase } from "./tools/scan.js";
import { searchCode } from "./tools/search.js";

let projectRoot: string;
let projectName: string;

function detectProjectRoot(): string {
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (gitRoot) return gitRoot.replace(/\\/g, "/");
  } catch {
    // Not a git repo
  }
  return process.cwd().replace(/\\/g, "/");
}

export async function createServer(): Promise<Server> {
  projectRoot = detectProjectRoot();
  projectName = basename(projectRoot);

  const labbookDir = join(projectRoot, ".claude", "labbook");
  await mkdir(labbookDir, { recursive: true });

  // Initialize storage
  initIds(labbookDir);
  await initKuzu(labbookDir);
  await initLance(labbookDir);
  initSummary(projectRoot);

  // Generate initial summary file
  await regenerateSummary();

  const server = new Server(
    { name: "claude-labbook", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // --- Tool definitions ---
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "start_session",
        description: "Start a new experiment session for a problem or feature you're working on. Sessions group related trials together.",
        inputSchema: {
          type: "object" as const,
          required: ["name"],
          properties: {
            name: { type: "string", description: "Short descriptive name (e.g., 'Scraper timeout handling', 'Auth flow refactor')" },
            description: { type: "string", description: "Longer description of the problem or goal" },
          },
        },
      },
      {
        name: "resolve_session",
        description: "Mark a session as resolved when the problem is solved. Record what ultimately worked.",
        inputSchema: {
          type: "object" as const,
          required: ["session_id", "resolution"],
          properties: {
            session_id: { type: "integer" },
            resolution: { type: "string", description: "What ultimately worked — the final solution" },
            status: { type: "string", enum: ["resolved", "abandoned", "paused"], default: "resolved" },
          },
        },
      },
      {
        name: "list_sessions",
        description: "List all sessions, optionally filtered by status.",
        inputSchema: {
          type: "object" as const,
          properties: {
            status: { type: "string", enum: ["active", "resolved", "abandoned", "paused", "all"], default: "active" },
          },
        },
      },
      {
        name: "log_trial",
        description: "Record the outcome of a code change that was tested. Call this AFTER testing any meaningful change. This is the most important tool — it prevents repeating failed approaches after compaction.",
        inputSchema: {
          type: "object" as const,
          required: ["session_id", "component", "change_description", "outcome"],
          properties: {
            session_id: { type: "integer", description: "ID of the active session this trial belongs to" },
            component: { type: "string", description: "File path, function name, or module affected" },
            component_type: { type: "string", enum: ["file", "function", "module", "endpoint", "config"], default: "file" },
            change_description: { type: "string", description: "What was changed, concisely" },
            rationale: { type: "string", description: "Why this change was attempted" },
            outcome: { type: "string", enum: ["success", "failure", "partial", "reverted"] },
            error_summary: { type: "string", description: "One-line error summary if failed (NOT full traceback)" },
            key_learning: { type: "string", description: "What we learned — the insight, not just the error" },
            related_trial_id: { type: "integer", description: "ID of a previous trial this one follows from (creates LED_TO edge)" },
          },
        },
      },
      {
        name: "get_trial_chain",
        description: "Follow the chain of trials from a starting trial to see the full evolution of attempts.",
        inputSchema: {
          type: "object" as const,
          required: ["trial_id"],
          properties: {
            trial_id: { type: "integer" },
            direction: { type: "string", enum: ["forward", "backward", "both"], default: "both" },
          },
        },
      },
      {
        name: "log_decision",
        description: "Record an architectural or strategic decision. Decisions are broader than trials — they inform multiple trials (e.g., 'Using httpx instead of requests for async support').",
        inputSchema: {
          type: "object" as const,
          required: ["decision", "rationale"],
          properties: {
            session_id: { type: "integer", description: "Session this decision was made in (optional)" },
            component: { type: "string", description: "Component this decision applies to (optional)" },
            decision: { type: "string", description: "The decision, concisely stated" },
            rationale: { type: "string", description: "Why this decision was made" },
            supersedes_id: { type: "integer", description: "ID of a previous decision this one replaces" },
          },
        },
      },
      {
        name: "log_env_fact",
        description: "Record a machine-specific or environment detail that Claude needs to remember across compactions. Examples: 'python_cmd=python (NOT python3)', 'deploy_cmd=railway up --service relay'.",
        inputSchema: {
          type: "object" as const,
          required: ["key", "value"],
          properties: {
            key: { type: "string", description: "Short identifier (e.g., 'python_cmd', 'deploy_cmd', 'test_cmd')" },
            value: { type: "string", description: "The value or command" },
            category: { type: "string", enum: ["cli", "paths", "api", "ports", "credentials_ref", "general"], default: "general" },
          },
        },
      },
      {
        name: "get_env_facts",
        description: "Retrieve all environment facts, optionally filtered by category.",
        inputSchema: {
          type: "object" as const,
          properties: {
            category: { type: "string" },
          },
        },
      },
      {
        name: "get_briefing",
        description: "Get a compact summary of all active sessions, recent trials, environment facts, and key decisions for this project. Call this at the start of any task, after compaction, or when context seems incomplete. This is the primary context recovery tool.",
        inputSchema: {
          type: "object" as const,
          properties: {
            max_trials_per_session: { type: "integer", default: 10, description: "Maximum number of recent trials to show per session" },
            include_resolved: { type: "boolean", default: false, description: "Include recently resolved sessions" },
          },
        },
      },
      {
        name: "check_before_change",
        description: "Before modifying a component, check what changes have already been tried and their outcomes. Also searches for semantically similar trials from other sessions. ALWAYS call this before reverting or significantly changing code in a component that may have prior trial history.",
        inputSchema: {
          type: "object" as const,
          required: ["component"],
          properties: {
            component: { type: "string", description: "File path, function name, or module to check" },
            session_id: { type: "integer", description: "Current session ID (used to exclude from semantic search)" },
            include_similar: { type: "boolean", default: true, description: "Search for semantically similar trials from other sessions" },
            proposed_change: { type: "string", description: "Optional: describe what you're about to do" },
          },
        },
      },
      {
        name: "scan_codebase",
        description: "Index or re-index the project codebase for semantic search. On first run, scans all files. On subsequent runs, only re-indexes files whose content has changed (incremental, based on content hash). Call this at session start or when significant new files have been added.",
        inputSchema: {
          type: "object" as const,
          properties: {
            force: { type: "boolean", default: false, description: "Force full re-index, ignoring content hashes" },
            paths: { type: "array", items: { type: "string" }, description: "Optional: only scan these specific paths instead of the full project" },
            max_file_size_kb: { type: "integer", default: 100, description: "Skip files larger than this (in KB)" },
          },
        },
      },
      {
        name: "search_code",
        description: "Semantic search across the indexed codebase. Use this to find code by what it does, not just by keyword. For example: 'token refresh logic', 'database connection pooling', 'error handling middleware'. Also useful for humans asking questions about the codebase.",
        inputSchema: {
          type: "object" as const,
          required: ["query"],
          properties: {
            query: { type: "string", description: "Natural language description of the code you're looking for" },
            language: { type: "string", description: "Filter results to a specific language" },
            path_prefix: { type: "string", description: "Filter results to files under this path prefix" },
            limit: { type: "integer", default: 10, description: "Maximum number of results to return" },
            include_trials: { type: "boolean", default: true, description: "Also search trial history for related experiments on matched files" },
          },
        },
      },
    ],
  }));

  // --- Tool dispatch ---
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "start_session":
          result = await startSession({ ...args as Record<string, unknown>, project: projectName } as Parameters<typeof startSession>[0]);
          break;
        case "resolve_session":
          result = await resolveSession(args as Parameters<typeof resolveSession>[0]);
          break;
        case "list_sessions":
          result = await listSessions(args as Parameters<typeof listSessions>[0] ?? {});
          break;
        case "log_trial":
          result = await logTrial(args as Parameters<typeof logTrial>[0]);
          break;
        case "get_trial_chain":
          result = await getTrialChain(args as Parameters<typeof getTrialChain>[0]);
          break;
        case "log_decision":
          result = await logDecision(args as Parameters<typeof logDecision>[0]);
          break;
        case "log_env_fact":
          result = await logEnvFact(args as Parameters<typeof logEnvFact>[0]);
          break;
        case "get_env_facts":
          result = await getEnvFacts(args as Parameters<typeof getEnvFacts>[0] ?? {});
          break;
        case "get_briefing":
          result = await getBriefing(args as Parameters<typeof getBriefing>[0] ?? {});
          break;
        case "check_before_change":
          result = await checkBeforeChange(args as Parameters<typeof checkBeforeChange>[0]);
          break;
        case "scan_codebase":
          result = await scanCodebase(projectRoot, args as Parameters<typeof scanCodebase>[1] ?? {});
          break;
        case "search_code":
          result = await searchCode(args as Parameters<typeof searchCode>[0]);
          break;
        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }

      // Format result as text
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}
