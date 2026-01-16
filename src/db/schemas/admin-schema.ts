import {
  sqliteTable as table,
  int,
  text,
  index,
} from "drizzle-orm/sqlite-core";

export const usersTable = table(
  "users",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    apiKey: text().notNull().unique(),
    role: text().notNull().default("user"),
    createdAt: int().notNull().default(Date.now()),
  },
  (t) => [index("users_api_key_idx").on(t.apiKey)],
);
