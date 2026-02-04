import {
  sqliteTable as table,
  int,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { UserRole, WebhookEventStatus, WorkflowStatus } from "../types";

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

export const webhooksTable = table(
  "webhooks",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    secret: text().notNull(),
    target_user_id: text(),
    target_workflow: text(),
    active: int().notNull().default(1),
    created_at: int().notNull().default(Date.now()),
  },
  (t) => [index("webhooks_slug_idx").on(t.slug)],
);

export const workflowRunsTable = table(
  "workflow_runs",
  {
    id: text().primaryKey(),
    agent_id: text().notNull(),
    workflow: text().notNull(),
    status: text().notNull().$type<WorkflowStatus>(),
    state: text().notNull(), // JSON serialized
    error: text(),
    started_at: int().notNull(),
    updated_at: int().notNull(),
    completed_at: int(),
  },
  (t) => [
    index("workflow_runs_status_idx").on(t.status),
    index("workflow_runs_agent_idx").on(t.agent_id),
  ],
);

export const webhookEventsTable = table(
  "webhook_events",
  {
    id: text().primaryKey(),
    webhook_id: text().notNull(),
    external_id: text(),
    headers: text().notNull(), // JSON serialized
    payload: text().notNull(), // JSON serialized
    status: text().notNull().$type<WebhookEventStatus>(),
    error: text(),
    received_at: int().notNull(),
    processed_at: int(),
  },
  (t) => [
    index("wh_events_webhook_idx").on(t.webhook_id),
    index("wh_events_received_idx").on(t.received_at),
    uniqueIndex("wh_events_dedup_idx").on(t.webhook_id, t.external_id),
  ],
);
