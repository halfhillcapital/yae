import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

export const DATA_DIR = resolve(ROOT, "data");
export const AGENTS_DB_DIR = resolve(DATA_DIR, "agents");
export const AGENT_MIGRATIONS_DIR = resolve(ROOT, "drizzle/agent");
export const ADMIN_MIGRATIONS_DIR = resolve(ROOT, "drizzle/admin");

// User Agent constants
export const MAX_CONVERSATION_HISTORY = 50;
export const MAX_AGENT_STEPS = 20;
export const MAX_TOOL_RESULT_CHARS = 10_000;
export const MAX_TOOL_CONCURRENCY = 5;
export const DEFAULT_MEMORY_BLOCK_LIMIT = 500;
export const LLM_TIMEOUT_MS = 60_000;
export const TOOL_TIMEOUT_MS = 30_000;
