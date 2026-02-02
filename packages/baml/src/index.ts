// @yae/baml — BAML integration for Y.A.E.

import { b } from "../baml_client";
import type { UserAgentAction, UserAgentContext } from "../baml_client/types";
import type { partial_types } from "../baml_client/partial_types";
import type { BamlStream } from "@boundaryml/baml";

export type {
  Message,
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

export interface UserAgentTurnOptions {
  signal?: AbortSignal;
  client?: string;
  env?: Record<string, string | undefined>;
  tags?: Record<string, string>;
}

export async function userAgentTurn(
  context: UserAgentContext,
  options?: UserAgentTurnOptions,
): Promise<UserAgentAction> {
  return b.UserAgentTurn(context, options);
}

// Usage example:
// const stream = userAgentTurnStream({ query, history, memory, tool_results });
// for await (const partial of stream) { /* partial.thinking, partial.tools */ }
// const final = await stream.getFinalResponse();

export function userAgentTurnStream(
  context: UserAgentContext,
  options?: UserAgentTurnOptions,
): BamlStream<partial_types.UserAgentAction, UserAgentAction> {
  return b.stream.UserAgentTurn(context, options);
}
