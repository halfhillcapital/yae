import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";

import { AgentFS } from "agentfs-sdk";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schemas/agent-schema.ts";
import * as adminSchema from "./schemas/admin-schema.ts";
import {
  FileRepository,
  MemoryRepository,
  MessagesRepository,
  WorkflowRepository,
} from "./repositories/index.ts";
import type { User, UserRole } from "./types.ts";

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
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
    const path = inMemory ? dbPath : `${dbPath}/${agentId}.db`;

    if (!inMemory) {
      const dir = path.substring(0, path.lastIndexOf("/"));
      await ensureDir(dir);
    }

    const fs = await AgentFS.open({ path });
    const client = createClient({
      url: inMemory ? dbPath : `file:${path}`,
    });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./drizzle/agent" });

    const ctx = new AgentContext(agentId, db, fs);

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
  private constructor(private readonly db: ReturnType<typeof drizzle>) {}

  static async create(dbPath: string): Promise<AdminContext> {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    await ensureDir(dir);

    const client = createClient({ url: `file:${dbPath}` });
    const db = drizzle(client, { schema: adminSchema });
    await migrate(db, { migrationsFolder: "./drizzle/admin" });

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
