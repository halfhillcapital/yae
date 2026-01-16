import { messagesTable } from "@yae/db";
import type { Message } from "@yae/types";
import { asc } from "drizzle-orm";
import type { AgentDB } from "@yae/db";

const MAX_CONVERSATION_HISTORY = 50;

class AgentHistory {
  private conversations: Message[] = [];
  constructor(private readonly db: AgentDB) {
    this.loadConversationHistory();
  }

  private async loadConversationHistory() {
    const rows = await this.db.drizzle
      .select()
      .from(messagesTable)
      .orderBy(asc(messagesTable.createdAt));
    this.conversations = rows.map((r) => ({
      role: r.role as "user" | "assistant" | "system",
      content: r.content,
    }));
  }

  private pruneConversationHistory() {
    if (this.conversations.length > MAX_CONVERSATION_HISTORY) {
      const excess = this.conversations.length - MAX_CONVERSATION_HISTORY;
      this.conversations.splice(0, excess);
    }
  }

  private async saveMessage(role: string, content: string): Promise<void> {
    await this.db.drizzle.insert(messagesTable).values({ role, content });
  }
}

export { AgentHistory };
