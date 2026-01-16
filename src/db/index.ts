import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

import { AgentFS } from "agentfs-sdk";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schema.ts";

const AGENTS_DB_DIR = "./data/agents";

type AgentDB = {
  drizzle: ReturnType<typeof drizzle>;
  fs: AgentFS;
};

async function ensureDbDir() {
  if (!existsSync(AGENTS_DB_DIR)) {
    await mkdir(AGENTS_DB_DIR, { recursive: true });
  }
}

async function getAgentDb(agentId: string): Promise<AgentDB> {
  await ensureDbDir();

  const dbPath = `${AGENTS_DB_DIR}/agent_${agentId}.db`;
  const fs = await AgentFS.open({
    path: dbPath,
  });

  const client = createClient({
    url: `file:${dbPath}`,
  });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });

  return {
    drizzle: db,
    fs: fs,
  };
}

export { getAgentDb, type AgentDB };
export { memoryTable, messagesTable } from "./schema.ts";
