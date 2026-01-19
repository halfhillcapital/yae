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

export const workflowRunsTable = table(
  "workflow_runs",
  {
    id: text().primaryKey(),
    workflowId: text().notNull(),
    agentId: text().notNull(),
    status: text().notNull(),
    state: text().notNull(), // JSON serialized
    error: text(),
    startedAt: int().notNull(),
    updatedAt: int().notNull(),
    completedAt: int(),
  },
  (t) => [
    index("workflow_runs_agent_idx").on(t.agentId),
    index("workflow_runs_status_idx").on(t.status),
  ],
);
