import { asc, count, desc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import { messagesTable } from "../schemas/agent-schema.ts";
import type { Message } from "../types.ts";
import { MAX_CONVERSATION_HISTORY } from "src/constants.ts";

export class MessagesRepository {
  private conversations: Message[] = [];

  constructor(private readonly db: ReturnType<typeof drizzle>) {}

  getMessageHistory(): Message[] {
    return this.conversations;
  }

  async getMessagesForSummarization(): Promise<Message[]> {
    const totalMessages = await this.getTotalCount();
    if (totalMessages <= MAX_CONVERSATION_HISTORY) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(messagesTable)
      .orderBy(asc(messagesTable.created_at))
      .limit(totalMessages - MAX_CONVERSATION_HISTORY);

    return rows.map((r) => ({
      role: r.role,
      content: r.content,
      created_at: r.created_at,
    }));
  }

  async save(message: Message): Promise<void> {
    await this.db
      .insert(messagesTable)
      .values({ role: message.role, content: message.content });
    this.conversations.push(message);
  }

  async getTotalCount(): Promise<number> {
    const result = await this.db.select({ total: count() }).from(messagesTable);
    return result[0]?.total ?? 0;
  }

  /**
   * Prune the oldest `count` messages from the in-memory conversation history.
   * Used by the summarization workflow after messages have been summarized.
   * Does NOT delete from DB — full history is preserved on disk.
   */
  prune(count: number): number {
    const toRemove = Math.min(count, this.conversations.length);
    if (toRemove > 0) {
      this.conversations.splice(0, toRemove);
    }
    return toRemove;
  }

  async load(limit: number = MAX_CONVERSATION_HISTORY): Promise<void> {
    const rows = await this.db
      .select()
      .from(messagesTable)
      .orderBy(desc(messagesTable.created_at))
      .limit(limit);
    this.conversations = rows.reverse().map((r) => ({
      role: r.role,
      content: r.content,
      created_at: r.created_at,
    }));
  }
}
