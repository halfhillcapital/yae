import {
  sqliteTable as table,
  int,
  text,
  index,
} from "drizzle-orm/sqlite-core";
import type { WorkflowStatus, MessageRole } from "../types";

export const memoryTable = table("memory", {
  id: int().primaryKey({ autoIncrement: true }),
  label: text().notNull().unique(),
  description: text().notNull(),
  content: text().notNull(),
  updated_at: int()
    .notNull()
    .default(Date.now())
    .$onUpdate(() => Date.now()),
});

export const messagesTable = table(
  "messages",
  {
    id: int().primaryKey({ autoIncrement: true }),
    role: text().notNull().$type<MessageRole>(),
    content: text().notNull(),
    created_at: int().notNull().default(Date.now()),
  },
  (t) => [index("messages_created_idx").on(t.created_at)],
);

export const workflowRunsTable = table(
  "workflow_runs",
  {
    id: text().primaryKey(),
    workflow: text().notNull(),
    status: text().notNull().$type<WorkflowStatus>(),
    state: text().notNull(), // JSON serialized
    error: text(),
    started_at: int().notNull(),
    updated_at: int().notNull(),
    completed_at: int(),
  },
  (t) => [index("workflow_runs_status_idx").on(t.status)],
);
