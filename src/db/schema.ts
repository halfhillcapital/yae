import {
  sqliteTable as table,
  int,
  text,
  index,
} from "drizzle-orm/sqlite-core";

export const memoryTable = table("memory", {
  id: int().primaryKey({ autoIncrement: true }),
  label: text().notNull().unique(),
  description: text().notNull(),
  content: text().notNull(),
  updatedAt: int()
    .notNull()
    .default(Date.now())
    .$onUpdate(() => Date.now()),
});

export const messagesTable = table(
  "messages",
  {
    id: int().primaryKey({ autoIncrement: true }),
    role: text().notNull(),
    content: text().notNull(),
    createdAt: int().notNull().default(Date.now()),
  },
  (t) => [index("messages_created_idx").on(t.createdAt)],
);
