// Messages

export type Role = "user" | "assistant" | "system" | "tool";

export interface Message {
  role: Role;
  content: string;
}

// Events

export type EventType = "action" | "webhook";
