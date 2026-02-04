//TODO: Define all types used in database operations here, they use snake_case in the database

export type UserRole = "user" | "admin";
export type MessageRole = "user" | "assistant";

export type User = {
  id: string;
  name: string;
  token: string;
  role: UserRole;
  created_at?: number;
};

export type Message = {
  role: MessageRole;
  content: string;
  created_at?: number;
};

export type Memory = {
  label: string;
  description: string;
  content: string;
  updated_at?: number;
};

export type WorkflowStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowRun<T = Record<string, unknown>> {
  id: string;
  agent_id: string;
  workflow: string;
  status: WorkflowStatus;
  /** Serialized workflow-specific data */
  state: T;
  /** Error message if status is 'failed' */
  error?: string;
  started_at: number;
  updated_at: number;
  completed_at?: number;
}

export type WebhookEventStatus = "received" | "dispatched" | "failed";

export type Webhook = {
  id: string;
  name: string;
  slug: string;
  secret: string;
  target_user_id?: string | null;
  target_workflow?: string | null;
  active: number;
  created_at: number;
};

export type WebhookEvent = {
  id: string;
  webhook_id: string;
  external_id?: string | null;
  headers: string;
  payload: string;
  status: WebhookEventStatus;
  error?: string | null;
  received_at: number;
  processed_at?: number | null;
};
