import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

import { AgentFS } from "agentfs-sdk";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schema.ts";
import {
  FileRepository,
  MemoryRepository,
  MessagesRepository,
} from "./repositories/index.ts";

const AGENTS_DB_DIR = "./data/agents";

async function ensureDbDir() {
  if (!existsSync(AGENTS_DB_DIR)) {
    await mkdir(AGENTS_DB_DIR, { recursive: true });
  }
}

export class AgentContext {
  readonly memory: MemoryRepository;
  readonly messages: MessagesRepository;
  readonly files: FileRepository;

  private constructor(
    public readonly agentId: string,
    db: ReturnType<typeof drizzle>,
    fs: AgentFS,
  ) {
    this.memory = new MemoryRepository(db);
    this.messages = new MessagesRepository(db);
    this.files = new FileRepository(fs);
  }

  static async create(agentId: string): Promise<AgentContext> {
    await ensureDbDir();

    const dbPath = `${AGENTS_DB_DIR}/agent_${agentId}.db`;
    const fs = await AgentFS.open({ path: dbPath });
    const client = createClient({ url: `file:${dbPath}` });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });

    return new AgentContext(agentId, db, fs);
  }
}
