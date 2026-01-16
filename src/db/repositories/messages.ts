import { asc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { messagesTable } from "../schema.ts";
import type { Message } from "@yae/types";

export const MAX_CONVERSATION_HISTORY = 50;

export class MessagesRepository {
  private conversations: Message[] = [];

  constructor(private readonly db: ReturnType<typeof drizzle>) {
    this.load();
  }

  getAll(): Message[] {
    return this.conversations;
  }

  async save(role: Message["role"], content: string): Promise<void> {
    await this.db.insert(messagesTable).values({ role, content });
    this.conversations.push({ role, content });
    this.prune();
  }

  private prune(): void {
    if (this.conversations.length > MAX_CONVERSATION_HISTORY) {
      const excess = this.conversations.length - MAX_CONVERSATION_HISTORY;
      this.conversations.splice(0, excess);
    }
  }

  private async load(): Promise<void> {
    const rows = await this.db
      .select()
      .from(messagesTable)
      .orderBy(asc(messagesTable.createdAt));
    this.conversations = rows.map((r) => ({
      role: r.role as Message["role"],
      content: r.content,
    }));
  }
}
