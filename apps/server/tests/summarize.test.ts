import { tmpdir } from "node:os";
import { test, expect, mock, beforeEach } from "bun:test";

// --- BAML mocks (hoisted before imports that depend on @yae/baml) ---

const mockSummarizeChunk = mock();
const mockMergeSummaries = mock();

mock.module("@yae/baml", () => ({
  summarizeChunk: mockSummarizeChunk,
  mergeSummaries: mockMergeSummaries,
  userAgentTurn: mock(),
  userAgentTurnStream: mock(),
}));

import { AgentContext, AdminContext } from "@yae/db/context.ts";
import {
  chunkMessages,
  summarizeWorkflow,
} from "@yae/core/workflows/summarize.ts";
import { runWorkflow } from "@yae/core/workflows/utils.ts";
import type { Message } from "@yae/db";

function tempAdminDbPath(): string {
  return `${tmpdir()}/yae-sum-test-${crypto.randomUUID()}.db`;
}

function makeMessages(count: number, startRole: "user" | "assistant" = "user"): Message[] {
  const roles: Array<"user" | "assistant"> =
    startRole === "user" ? ["user", "assistant"] : ["assistant", "user"];
  return Array.from({ length: count }, (_, i) => ({
    role: roles[i % 2]!,
    content: `Message ${i + 1}`,
  }));
}

beforeEach(() => {
  mockSummarizeChunk.mockReset();
  mockMergeSummaries.mockReset();

  mockSummarizeChunk.mockImplementation(async (messages: Message[]) => ({
    topics: ["topic"],
    key_decisions: ["decision"],
    user_preferences: ["pref"],
    ongoing_tasks: ["task"],
    narrative: `Summary of ${messages.length} messages`,
  }));

  mockMergeSummaries.mockImplementation(
    async (summaries: Array<{ narrative: string }>, existing?: string | null) => {
      const parts = summaries.map((s) => s.narrative);
      if (existing) parts.unshift(existing);
      return parts.join(" | ");
    },
  );
});

// ============================================================================
// chunkMessages unit tests (pure function)
// ============================================================================

test("chunkMessages: 20 messages → 1 chunk", () => {
  const messages = makeMessages(20);
  const chunks = chunkMessages(messages, 20);
  expect(chunks.length).toBe(1);
  expect(chunks[0]!.length).toBe(20);
});

test("chunkMessages: pair boundary — user at edge pulls assistant into same chunk", () => {
  // 21 messages: 19 assistants, then user, then assistant.
  // With size=20 the user at index 19 is the 20th item; the pair logic
  // pulls the assistant at index 20 in, making a 21-item chunk.
  const messages: Message[] = [];
  for (let i = 0; i < 19; i++) {
    messages.push({ role: "assistant", content: `A${i}` });
  }
  messages.push({ role: "user", content: "U19" });
  messages.push({ role: "assistant", content: "A20" });

  const chunks = chunkMessages(messages, 20);
  expect(chunks.length).toBe(1);
  expect(chunks[0]!.length).toBe(21);
});

test("chunkMessages: empty → []", () => {
  expect(chunkMessages([], 20)).toEqual([]);
});

test("chunkMessages: single message → [[msg]]", () => {
  const messages = makeMessages(1);
  const chunks = chunkMessages(messages, 20);
  expect(chunks.length).toBe(1);
  expect(chunks[0]!.length).toBe(1);
});

// ============================================================================
// Workflow integration tests
// ============================================================================

test("summarize workflow: skip when no messages exceed threshold", async () => {
  const ctx = await AgentContext.create("test-agent", ":memory:");
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      summarizeWorkflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.prunedCount).toBe(0);
    expect(mockSummarizeChunk).not.toHaveBeenCalled();
    expect(mockMergeSummaries).not.toHaveBeenCalled();
  } finally {
    await ctx.close();
    admin.close();
  }
});

test("summarize workflow: end-to-end with 70 messages", async () => {
  const ctx = await AgentContext.create("test-agent", ":memory:");
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    // conversation_summary must exist for the store node to update it
    await ctx.memory.set(
      "conversation_summary",
      "Conversation Summary",
      "Initial summary",
    );

    for (let i = 0; i < 70; i++) {
      await ctx.messages.save({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i + 1}`,
      });
    }

    const result = await runWorkflow(
      summarizeWorkflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    // 70 - 50 = 20 messages to summarize → 1 chunk of 20
    expect(mockSummarizeChunk).toHaveBeenCalledTimes(1);
    expect(mockMergeSummaries).toHaveBeenCalledTimes(1);
    // prune(25) removes half of MAX_CONVERSATION_HISTORY from in-memory cache
    expect(result.state.prunedCount).toBe(25);
    // conversation_summary memory block updated
    expect(ctx.memory.get("conversation_summary")?.content).toContain(
      "Summary of 20 messages",
    );
  } finally {
    await ctx.close();
    admin.close();
  }
});

test("summarize workflow: existing summary forwarded to mergeSummaries", async () => {
  const ctx = await AgentContext.create("test-agent", ":memory:");
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const existingContent = "Previous conversation summary here.";
    await ctx.memory.set(
      "conversation_summary",
      "Conversation Summary",
      existingContent,
    );

    for (let i = 0; i < 70; i++) {
      await ctx.messages.save({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i + 1}`,
      });
    }

    const result = await runWorkflow(
      summarizeWorkflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    // mergeSummaries received the existing summary as second arg
    const mergeCall = mockMergeSummaries.mock.calls[0]!;
    expect(mergeCall[1]).toBe(existingContent);
    // Final summary includes the existing content (per our mock logic)
    expect(ctx.memory.get("conversation_summary")?.content).toContain(
      existingContent,
    );
  } finally {
    await ctx.close();
    admin.close();
  }
});

test("summarize workflow: multiple chunks for 90 messages", async () => {
  const ctx = await AgentContext.create("test-agent", ":memory:");
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    await ctx.memory.set(
      "conversation_summary",
      "Conversation Summary",
      "",
    );

    for (let i = 0; i < 90; i++) {
      await ctx.messages.save({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i + 1}`,
      });
    }

    const result = await runWorkflow(
      summarizeWorkflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    // 90 - 50 = 40 messages → 2 chunks of 20
    expect(mockSummarizeChunk).toHaveBeenCalledTimes(2);
    expect(mockMergeSummaries).toHaveBeenCalledTimes(1);
    // mergeSummaries receives array of 2 chunk summaries
    const mergeCall = mockMergeSummaries.mock.calls[0]!;
    expect(mergeCall[0]).toHaveLength(2);
  } finally {
    await ctx.close();
    admin.close();
  }
});
