import { test, expect, mock, beforeEach } from "bun:test";

// --- BAML mock (hoisted before imports that depend on @yae/baml) ---

const mockUserAgentTurn = mock();

mock.module("@yae/baml", () => ({
  userAgentTurn: mockUserAgentTurn,
  userAgentTurnStream: mock(),
  summarizeChunk: mock(),
  mergeSummaries: mock(),
}));

import { AgentContext } from "@yae/db/context.ts";
import {
  UserAgent,
  runAgentLoop,
  type AgentLoopEvent,
} from "@yae/core/agents/user.ts";
import { MAX_AGENT_STEPS } from "src/constants.ts";

// --- Helpers ---

async function collectEvents(
  gen: AsyncGenerator<AgentLoopEvent>,
): Promise<AgentLoopEvent[]> {
  const events: AgentLoopEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

function eventsOfType(events: AgentLoopEvent[], type: string) {
  return events.filter((e) => e.type === type);
}

async function freshAgent(): Promise<{ agent: UserAgent; ctx: AgentContext }> {
  const ctx = await AgentContext.create("test-agent", ":memory:");
  const agent = await UserAgent.create("test-agent", ctx);
  return { agent, ctx };
}

beforeEach(() => {
  mockUserAgentTurn.mockReset();
});

// ============================================================================
// Test 1: Single-turn response
// ============================================================================

test("single-turn response — yields THINKING then MESSAGE, saves messages", async () => {
  const { agent } = await freshAgent();
  try {
    mockUserAgentTurn.mockResolvedValueOnce({
      thinking: "Processing request",
      message: "Hello there!",
    });

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Hi" }, agent),
    );

    expect(eventsOfType(events, "THINKING")).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "THINKING",
      content: "Processing request",
    });
    expect(events[1]).toEqual({ type: "MESSAGE", content: "Hello there!" });

    // Messages saved to history
    const history = agent.messages.getMessageHistory();
    const last = history.slice(-2);
    expect(last[0]!.role).toBe("user");
    expect(last[0]!.content).toBe("Hi");
    expect(last[1]!.role).toBe("assistant");
    expect(last[1]!.content).toBe("Hello there!");
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 2: Tool step then response
// ============================================================================

test("tool step then response — memory_create tool executed, events in order", async () => {
  const { agent } = await freshAgent();
  try {
    mockUserAgentTurn
      .mockResolvedValueOnce({
        thinking: "I need to create a memory block",
        tools: [
          {
            tool_name: "memory_create",
            label: "test-block",
            description: "A test block",
            content: "Test content",
          },
        ],
      })
      .mockResolvedValueOnce({
        thinking: "Done",
        message: "I created a memory block for you.",
      });

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Create a block" }, agent),
    );

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "THINKING",
      "TOOL_CALL",
      "TOOL_RESULT",
      "THINKING",
      "MESSAGE",
    ]);

    // Memory block was created
    expect(agent.memory.has("test-block")).toBe(true);
    expect(agent.memory.get("test-block")!.content).toBe("Test content");
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 3: Multiple tool steps
// ============================================================================

test("multiple tool steps — 3 tool rounds before final message", async () => {
  const { agent } = await freshAgent();
  try {
    for (let i = 0; i < 3; i++) {
      mockUserAgentTurn.mockResolvedValueOnce({
        thinking: `Tool round ${i + 1}`,
        tools: [
          {
            tool_name: "memory_create",
            label: `round-${i}`,
            description: `Block ${i}`,
            content: `Content ${i}`,
          },
        ],
      });
    }
    mockUserAgentTurn.mockResolvedValueOnce({
      thinking: "All done",
      message: "Finished three rounds of tools.",
    });

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Do three things" }, agent),
    );

    expect(eventsOfType(events, "THINKING")).toHaveLength(4);
    expect(eventsOfType(events, "TOOL_CALL")).toHaveLength(3);
    expect(eventsOfType(events, "TOOL_RESULT")).toHaveLength(3);
    expect(eventsOfType(events, "MESSAGE")).toHaveLength(1);

    // All 3 blocks created
    expect(agent.memory.has("round-0")).toBe(true);
    expect(agent.memory.has("round-1")).toBe(true);
    expect(agent.memory.has("round-2")).toBe(true);
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 4: Empty tool list
// ============================================================================

test("empty tool list — yields TOOL_ERROR, loop continues", async () => {
  const { agent } = await freshAgent();
  try {
    mockUserAgentTurn
      .mockResolvedValueOnce({
        thinking: "Hmm",
        tools: [],
      })
      .mockResolvedValueOnce({
        thinking: "Let me respond instead",
        message: "Here you go.",
      });

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Do something" }, agent),
    );

    const toolErrors = eventsOfType(events, "TOOL_ERROR");
    expect(toolErrors).toHaveLength(1);
    expect(toolErrors[0]!.content).toContain("empty tool list");

    // Loop continued and produced final MESSAGE
    expect(eventsOfType(events, "MESSAGE")).toHaveLength(1);
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 5: Max steps exhaustion
// ============================================================================

test("max steps exhaustion — fallback ERROR after maxSteps tool rounds", async () => {
  const { agent } = await freshAgent();
  try {
    let counter = 0;
    mockUserAgentTurn.mockImplementation(async () => ({
      thinking: "More tools",
      tools: [
        {
          tool_name: "memory_create",
          label: `exhaust-${counter++}`,
          description: "test",
          content: "test",
        },
      ],
    }));

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Loop forever" }, agent, 3),
    );

    // 3 THINKING events (one per step) + final ERROR
    expect(eventsOfType(events, "THINKING")).toHaveLength(3);
    const errors = eventsOfType(events, "ERROR");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.content).toContain(
      "wasn't able to complete my response",
    );
    // No MESSAGE event
    expect(eventsOfType(events, "MESSAGE")).toHaveLength(0);
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 6: LLM failure
// ============================================================================

test("LLM failure — yields ERROR events, no messages saved", async () => {
  const { agent } = await freshAgent();
  try {
    const historyBefore = agent.messages.getMessageHistory().length;

    mockUserAgentTurn.mockRejectedValueOnce(new Error("LLM API error"));

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Crash" }, agent),
    );

    const errors = eventsOfType(events, "ERROR");
    expect(errors[0]!.content).toContain("Agent turn failed");
    expect(errors[0]!.content).toContain("LLM API error");

    // No MESSAGE event
    expect(eventsOfType(events, "MESSAGE")).toHaveLength(0);

    // No messages saved — LLM never saw the request, history stays clean
    expect(agent.messages.getMessageHistory().length).toBe(historyBefore);
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 7: Tool execution failure
// ============================================================================

test("tool execution failure — memory_replace on missing block yields TOOL_ERROR, loop continues", async () => {
  const { agent } = await freshAgent();
  try {
    mockUserAgentTurn
      .mockResolvedValueOnce({
        thinking: "Replacing memory",
        tools: [
          {
            tool_name: "memory_replace",
            label: "nonexistent-block",
            old_content: "old",
            new_content: "new",
          },
        ],
      })
      .mockResolvedValueOnce({
        thinking: "Tool failed, let me respond",
        message: "Sorry, that block doesn't exist.",
      });

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Replace memory" }, agent),
    );

    const toolErrors = eventsOfType(events, "TOOL_ERROR");
    expect(toolErrors).toHaveLength(1);
    expect(toolErrors[0]!.content).toContain("nonexistent-block");

    // Loop continued and produced a response
    expect(eventsOfType(events, "MESSAGE")).toHaveLength(1);
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 8: maxSteps clamped to MAX_AGENT_STEPS
// ============================================================================

test("maxSteps clamped to MAX_AGENT_STEPS — passing 999 caps at 20", async () => {
  const { agent } = await freshAgent();
  try {
    let callCount = 0;
    mockUserAgentTurn.mockImplementation(async () => {
      callCount++;
      return {
        thinking: "More tools",
        tools: [
          {
            tool_name: "memory_create",
            label: `cap-${callCount}`,
            description: "test",
            content: "test",
          },
        ],
      };
    });

    await collectEvents(
      runAgentLoop({ role: "user", content: "Loop many times" }, agent, 999),
    );

    expect(callCount).toBe(MAX_AGENT_STEPS);
  } finally {
    await agent.close();
  }
});

// ============================================================================
// Test 9: Parallel tool execution
// ============================================================================

test("parallel tool execution — 3 memory_create tools in one step, all created", async () => {
  const { agent } = await freshAgent();
  try {
    mockUserAgentTurn
      .mockResolvedValueOnce({
        thinking: "Creating three blocks at once",
        tools: [
          {
            tool_name: "memory_create",
            label: "par-a",
            description: "A",
            content: "Content A",
          },
          {
            tool_name: "memory_create",
            label: "par-b",
            description: "B",
            content: "Content B",
          },
          {
            tool_name: "memory_create",
            label: "par-c",
            description: "C",
            content: "Content C",
          },
        ],
      })
      .mockResolvedValueOnce({
        thinking: "Done",
        message: "All three blocks created.",
      });

    const events = await collectEvents(
      runAgentLoop({ role: "user", content: "Create three blocks" }, agent),
    );

    expect(eventsOfType(events, "TOOL_CALL")).toHaveLength(3);
    expect(eventsOfType(events, "TOOL_RESULT")).toHaveLength(3);

    // All 3 blocks exist
    expect(agent.memory.has("par-a")).toBe(true);
    expect(agent.memory.has("par-b")).toBe(true);
    expect(agent.memory.has("par-c")).toBe(true);
    expect(agent.memory.get("par-a")!.content).toBe("Content A");
  } finally {
    await agent.close();
  }
});
