import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { sql } from "drizzle-orm";

import { AgentFS } from "agentfs-sdk";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";

import { AGENT_MIGRATIONS_DIR, ADMIN_MIGRATIONS_DIR } from "../constants.ts";
import * as schema from "./schemas/agent-schema.ts";
import * as adminSchema from "./schemas/admin-schema.ts";
import { MemoryRepository } from "./repositories/memory.ts";
import { MessagesRepository } from "./repositories/messages.ts";
import { FileRepository } from "./repositories/files.ts";
import { WebhookRepository } from "./repositories/webhook.ts";
import { UserRepository } from "./repositories/user.ts";
import { WorkflowRepository } from "./repositories/workflow.ts";

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function verifyTables(
  db: ReturnType<typeof drizzle>,
  tables: string[],
): Promise<void> {
  for (const name of tables) {
    try {
      const result = await db.get<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${name}`,
      );
      if (!result) {
        throw new Error(`table "${name}" not found`);
      }
    } catch (err) {
      throw new Error(
        `Migration verification failed: table "${name}" not found`,
        { cause: err },
      );
    }
  }
}

export class AgentContext {
  readonly memory: MemoryRepository;
  readonly messages: MessagesRepository;
  readonly files: FileRepository;

  private constructor(
    public readonly agentId: string,
    db: ReturnType<typeof drizzle>,
    private readonly _db: ReturnType<typeof createClient>,
    private readonly _fs: AgentFS,
  ) {
    this.memory = new MemoryRepository(db);
    this.messages = new MessagesRepository(db);
    this.files = new FileRepository(_fs);
  }

  /** Close the underlying database and filesystem connections. */
  async close(): Promise<void> {
    this._db.close();
    await this._fs.close();
  }

  static async create(agentId: string, dbPath: string): Promise<AgentContext> {
    const inMemory = dbPath === ":memory:";
    const dbFile = inMemory ? dbPath : `${dbPath}/${agentId}.db`;
    const fsFile = inMemory ? dbPath : `${dbPath}/${agentId}.fs.db`;

    if (!inMemory) {
      const dir = dbFile.substring(0, dbFile.lastIndexOf("/"));
      await ensureDir(dir);
    }

    const fs = await AgentFS.open({ path: fsFile });
    const client = createClient({
      url: inMemory ? dbPath : `file:${dbFile}`,
    });
    const db = drizzle(client, { schema });
    await migrate(db, {
      migrationsFolder: AGENT_MIGRATIONS_DIR,
      migrationsTable: "__drizzle_migrations_agent",
    });
    await verifyTables(db, ["memory", "messages"]);

    const ctx = new AgentContext(agentId, db, client, fs);
    await ctx.memory.load();
    await ctx.messages.load();

    return ctx;
  }
}

export class AdminContext {
  readonly users: UserRepository;
  readonly webhooks: WebhookRepository;
  readonly workflows: WorkflowRepository;

  private constructor(
    db: ReturnType<typeof drizzle>,
    private readonly _db: ReturnType<typeof createClient>,
  ) {
    this.users = new UserRepository(db);
    this.webhooks = new WebhookRepository(db);
    this.workflows = new WorkflowRepository(db);
  }

  /** Close the underlying database connection. */
  close(): void {
    this._db.close();
  }

  static async create(dbPath: string): Promise<AdminContext> {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    await ensureDir(dir);

    const client = createClient({ url: `file:${dbPath}` });
    const db = drizzle(client, { schema: adminSchema });
    await migrate(db, {
      migrationsFolder: ADMIN_MIGRATIONS_DIR,
      migrationsTable: "__drizzle_migrations_admin",
    });
    await verifyTables(db, [
      "users",
      "webhooks",
      "webhook_events",
      "workflow_runs",
    ]);

    const ctx = new AdminContext(db, client);

    // Clean up any workflows left "running" from a previous crash/restart
    const failed = await ctx.workflows.markStaleAsFailed();
    if (failed > 0) {
      console.log(
        `[AdminContext] Marked ${failed} stale workflow(s) as failed`,
      );
    }

    return ctx;
  }
}
