import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";

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
import { WorkflowRepository } from "./repositories/workflow.ts";
import { WebhookRepository } from "./repositories/webhook.ts";
import type { User, UserRole } from "./types.ts";

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
  readonly workflows: WorkflowRepository;

  private constructor(
    public readonly agentId: string,
    db: ReturnType<typeof drizzle>,
    fs: AgentFS,
  ) {
    this.memory = new MemoryRepository(db);
    this.messages = new MessagesRepository(db);
    this.files = new FileRepository(fs);
    this.workflows = new WorkflowRepository(db);
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
    await verifyTables(db, ["memory", "messages", "workflow_runs"]);

    const ctx = new AgentContext(agentId, db, fs);
    await ctx.memory.load();
    await ctx.messages.load();

    // Clean up any workflows left "running" from a previous crash/restart
    const failed = await ctx.workflows.markStaleAsFailed();
    if (failed > 0) {
      console.log(
        `[AgentContext] Marked ${failed} stale workflow(s) as failed for agent ${agentId}`,
      );
    }

    return ctx;
  }
}

export class AdminContext {
  readonly webhooks: WebhookRepository;

  private constructor(private readonly db: ReturnType<typeof drizzle>) {
    this.webhooks = new WebhookRepository(db);
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
    await verifyTables(db, ["users", "webhooks", "webhook_events"]);

    return new AdminContext(db);
  }

  async registerUser(name: string, role: UserRole = "user"): Promise<User> {
    const id = crypto.randomUUID();
    const token = `yae_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = Date.now();

    await this.db.insert(adminSchema.usersTable).values({
      id,
      name,
      token,
      role,
      created_at,
    });

    return { id, name, token, role, created_at };
  }

  async getUserByToken(token: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(adminSchema.usersTable)
      .where(eq(adminSchema.usersTable.token, token))
      .limit(1);

    return rows[0] ?? null;
  }

  async getUserById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(adminSchema.usersTable)
      .where(eq(adminSchema.usersTable.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async listUsers(): Promise<User[]> {
    return this.db.select().from(adminSchema.usersTable);
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.db
      .delete(adminSchema.usersTable)
      .where(eq(adminSchema.usersTable.id, id));

    return result.rowsAffected > 0;
  }
}
