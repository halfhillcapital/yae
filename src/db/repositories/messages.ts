import { asc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { messagesTable } from "../schemas/agent-schema.ts";
import type { Message } from "baml_client";

export const MAX_CONVERSATION_HISTORY = 50;

export class MessagesRepository {
  private conversations: Message[] = [];

  constructor(private readonly db: ReturnType<typeof drizzle>) {
    this.load();
  }

  getAll(): Message[] {
    return this.conversations;
  }

  async save(message: Message): Promise<void> {
    await this.db
      .insert(messagesTable)
      .values({ role: message.role, content: message.content });
    this.conversations.push(message);
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
