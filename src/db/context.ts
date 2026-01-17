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
} from "./repositories/index.ts";

const DATA_DIR = "./data";
const AGENTS_DB_DIR = `${DATA_DIR}/agents`;

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
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

  static async create(agentId: string, dbPath?: string): Promise<AgentContext> {
    const path = dbPath ?? `${AGENTS_DB_DIR}/agent_${agentId}.db`;
    const dir = path.substring(0, path.lastIndexOf("/"));
    await ensureDir(dir);

    const fs = await AgentFS.open({ path });
    const client = createClient({ url: `file:${path}` });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./drizzle/agent" });

    return new AgentContext(agentId, db, fs);
  }
}

export type User = {
  id: string;
  name: string;
  apiKey: string;
  role: string;
  createdAt: number;
};

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

  async registerUser(name: string, role: string = "user"): Promise<User> {
    const id = crypto.randomUUID();
    const apiKey = `yae_${crypto.randomUUID().replace(/-/g, "")}`;
    const createdAt = Date.now();

    await this.db.insert(adminSchema.usersTable).values({
      id,
      name,
      apiKey,
      role,
      createdAt,
    });

    return { id, name, apiKey, role, createdAt };
  }

  async getUserByApiKey(apiKey: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(adminSchema.usersTable)
      .where(eq(adminSchema.usersTable.apiKey, apiKey))
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
