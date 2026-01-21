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
    token: text().notNull().unique(),
    role: text().notNull().default("user"),
    created_at: int().notNull().default(Date.now()),
  },
  (t) => [index("users_token_idx").on(t.token)],
);
