import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { asc, sql } from "drizzle-orm";

import * as schema from "./schema.ts";
import { messagesTable } from "./schema.ts";
import type { Message } from "@yae/types.ts";

const AGENTS_DB_DIR = "./data/agents";

export type AgentDB = BunSQLiteDatabase<typeof schema>;

const agentDatabases = new Map<string, AgentDB>();

async function ensureDbDir() {
  if (!existsSync(AGENTS_DB_DIR)) {
    await mkdir(AGENTS_DB_DIR, { recursive: true });
  }
}

function initializeSchema(db: AgentDB) {
  db.run(sql`PRAGMA journal_mode = WAL`);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  db.run(sql`
    CREATE INDEX IF NOT EXISTS messages_created_idx ON messages(created_at)
  `);
}

export async function getAgentDb(agentId: string): Promise<AgentDB> {
  if (agentDatabases.has(agentId)) {
    return agentDatabases.get(agentId)!;
  }

  await ensureDbDir();

  const dbPath = `${AGENTS_DB_DIR}/agent_${agentId}.db`;
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  initializeSchema(db);

  agentDatabases.set(agentId, db);
  return db;
}

export async function loadConversations(db: AgentDB): Promise<Message[]> {
  const rows = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .orderBy(asc(messagesTable.createdAt));

  return rows.map((r) => ({
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
  }));
}

export async function saveMessage(
  db: AgentDB,
  role: string,
  content: string,
): Promise<void> {
  await db.insert(messagesTable).values({ role, content });
}
