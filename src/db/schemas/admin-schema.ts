import {
  sqliteTable as table,
  int,
  text,
  index,
} from "drizzle-orm/sqlite-core";
import type { UserRole } from "../types";

export const usersTable = table(
  "users",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    token: text().notNull().unique(),
    role: text().notNull().$type<UserRole>().default("user"),
    created_at: int().notNull().default(Date.now()),
  },
  (t) => [index("users_token_idx").on(t.token)],
);
