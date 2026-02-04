import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { usersTable } from "../schemas/admin-schema.ts";
import type { User, UserRole } from "../types.ts";

export class UserRepository {
  constructor(private readonly db: ReturnType<typeof drizzle>) {}

  async register(name: string, role: UserRole = "user"): Promise<User> {
    const id = crypto.randomUUID();
    const token = `yae_${crypto.randomUUID().replace(/-/g, "")}`;
    const created_at = Date.now();

    await this.db.insert(usersTable).values({
      id,
      name,
      token,
      role,
      created_at,
    });

    return { id, name, token, role, created_at };
  }

  async getByToken(token: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.token, token))
      .limit(1);

    return rows[0] ?? null;
  }

  async getById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async list(): Promise<User[]> {
    return this.db.select().from(usersTable);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(usersTable)
      .where(eq(usersTable.id, id));

    return result.rowsAffected > 0;
  }
}
