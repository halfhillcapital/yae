// @yae/baml — BAML integration for Y.A.E.

import { b } from "../baml_client";
import type { UserAgentStep, UserAgentContext } from "../baml_client/types";
import type { partial_types } from "../baml_client/partial_types";
import type { BamlStream } from "@boundaryml/baml";

export type {
  Message,
  UserAgentTool,
  UserAgentContext,
  SendMessageTool,
  ContinueThinkingTool,
  MemoryReplaceTool,
  MemoryInsertTool,
  WebSearchTool,
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
): Promise<UserAgentStep> {
  return b.UserAgentTurn(context, options);
}

// Usage example:
// const stream = userAgentTurnStream({ query, history, memory, tool_results });
// for await (const partial of stream) { /* partial.thinking, partial.tools */ }
// const final = await stream.getFinalResponse();

export function userAgentTurnStream(
  context: UserAgentContext,
  options?: UserAgentTurnOptions,
): BamlStream<partial_types.UserAgentStep, UserAgentStep> {
  return b.stream.UserAgentTurn(context, options);
}
