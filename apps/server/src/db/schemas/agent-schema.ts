import {
  sqliteTable as table,
  int,
  text,
  index,
} from "drizzle-orm/sqlite-core";
import type { MessageRole } from "../types";

export const memoryTable = table("memory", {
  id: int().primaryKey({ autoIncrement: true }),
  label: text().notNull().unique(),
  description: text().notNull(),
  content: text().notNull(),
  protected: int().notNull().default(0),
  readonly: int().notNull().default(0),
  limit: int(),
  updated_at: int()
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdate(() => Date.now()),
});

export const messagesTable = table(
  "messages",
  {
    id: int().primaryKey({ autoIncrement: true }),
    role: text().notNull().$type<MessageRole>(),
    content: text().notNull(),
    created_at: int()
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [index("messages_created_idx").on(t.created_at)],
);
