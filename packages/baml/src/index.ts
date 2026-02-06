// @yae/baml — BAML integration for Y.A.E.

import type {
  UserAgentAction,
  UserAgentContext,
  ConversationSummary,
  Message,
} from "../baml_client/types";
import type { partial_types } from "../baml_client/partial_types";
import type { BamlStream } from "@boundaryml/baml";

async function client() {
  const { b } = await import("../baml_client");
  return b;
}

export type {
  Message,
  ConversationSummary,
  UserAgentTool,
  UserAgentContext,
  MemoryReplaceTool,
  MemoryInsertTool,
  MemoryCreateTool,
  MemoryDeleteTool,
  FileReadTool,
  FileWriteTool,
  FileListTool,
  FileDeleteTool,
  WebSearchTool,
  WebFetchTool,
} from "../baml_client/types";

export type { BamlStream } from "@boundaryml/baml";
export type { partial_types } from "../baml_client/partial_types";

export interface BamlCallOptions {
  signal?: AbortSignal;
  client?: string;
  env?: Record<string, string | undefined>;
  tags?: Record<string, string>;
}

export async function userAgentTurn(
  context: UserAgentContext,
  options?: BamlCallOptions,
): Promise<UserAgentAction> {
  const b = await client();
  return b.UserAgentTurn(context, options);
}

// Usage example:
// const stream = await userAgentTurnStream({ query, history, memory, tool_results });
// for await (const partial of stream) { /* partial.thinking, partial.tools */ }
// const final = await stream.getFinalResponse();

export async function userAgentTurnStream(
  context: UserAgentContext,
  options?: BamlCallOptions,
): Promise<BamlStream<partial_types.UserAgentAction, UserAgentAction>> {
  const b = await client();
  return b.stream.UserAgentTurn(context, options);
}

// --- Summarization ---

export async function summarizeChunk(
  messages: Message[],
  options?: BamlCallOptions,
): Promise<ConversationSummary> {
  const b = await client();
  return b.SummarizeChunk(messages, options);
}

export async function mergeSummaries(
  summaries: ConversationSummary[],
  existingSummary?: string | null,
  options?: BamlCallOptions,
): Promise<string> {
  const b = await client();
  return b.MergeSummaries(summaries, existingSummary, options);
}
