import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

export const DATA_DIR = resolve(ROOT, "data");
export const AGENTS_DB_DIR = resolve(DATA_DIR, "agents");
export const AGENT_MIGRATIONS_DIR = resolve(ROOT, "drizzle/agent");
export const ADMIN_MIGRATIONS_DIR = resolve(ROOT, "drizzle/admin");

// User Agent constants
export const MAX_CONVERSATION_HISTORY = 50;
