import { tmpdir } from "node:os";
import { test, expect } from "bun:test";
import { AgentContext, AdminContext } from "@yae/db/context.ts";
import { defineWorkflow, runWorkflow } from "@yae/core/workflows/utils.ts";

function getTestDbPath(): string {
  return ":memory:"; // Use in-memory DB for tests
}

function tempAdminDbPath(): string {
  return `${tmpdir()}/yae-wf-test-${crypto.randomUUID()}.db`;
}

// ============================================================================
// Workflow Types Tests
// ============================================================================

test("AgentState provides access to context and mutable data", async () => {
  type CounterData = { count: number; steps: string[] };

  const workflow = defineWorkflow<CounterData>({
    name: "counter-test",
    initialState: () => ({ count: 0, steps: [] }),
    build: ({ node, chain }) => {
      const checkContext = node({
        name: "check-context",
        post: (state) => {
          // Verify AgentState structure
          expect(state.ctx.memory).toBeDefined();
          expect(state.ctx.messages).toBeDefined();
          expect(state.ctx.files).toBeDefined();
          expect(state.data).toBeDefined();
          expect(state.run).toBeDefined();
          expect(state.run.id).toBeDefined();
          expect(state.run.workflow).toBe("counter-test");

          state.data.steps.push("checked");
          return undefined;
        },
      });

      return chain(checkContext);
    },
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.steps).toEqual(["checked"]);
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Prep -> Exec -> Post Pattern Tests
// ============================================================================

test("Workflow node follows prep -> exec -> post pattern", async () => {
  type CalcData = {
    input: number;
    multiplier: number;
    result: number;
    phases: string[];
  };

  const workflow = defineWorkflow<CalcData>({
    name: "prep-exec-post-test",
    initialState: () => ({ input: 10, multiplier: 3, result: 0, phases: [] }),
    build: ({ node, chain }) => {
      const calculate = node<{ a: number; b: number }, number>({
        name: "calculate",
        // prep: Read from state, prepare inputs for exec
        prep: (state) => {
          state.data.phases.push("prep");
          return { a: state.data.input, b: state.data.multiplier };
        },
        // exec: Pure transformation (no shared state access)
        exec: (input) => {
          // NOTE: Cannot access state here - this is intentional!
          return input.a * input.b;
        },
        // post: Write results back to state
        post: (state, _prepResult, execResult) => {
          state.data.phases.push("post");
          state.data.result = execResult;
          return undefined;
        },
      });

      return chain(calculate);
    },
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.result).toBe(30); // 10 * 3
    expect(result.state.phases).toEqual(["prep", "post"]);
  } finally {
    await ctx.close();
    admin.close();
  }
});

test("Workflow parallel node processes items in parallel", async () => {
  type BatchData = {
    items: number[];
    processed: number[];
  };

  const workflow = defineWorkflow<BatchData>({
    name: "parallel-test",
    initialState: () => ({ items: [1, 2, 3, 4, 5], processed: [] }),
    build: ({ parallel, chain }) => {
      const processItems = parallel<number, number>({
        name: "process-items",
        // prep: Return array of items to process
        prep: (state) => state.data.items,
        // exec: Called for each item in parallel
        exec: (item) => item * 2,
        // post: Receives all results
        post: (state, _items, results) => {
          state.data.processed = results;
          return undefined;
        },
      });

      return chain(processItems);
    },
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.processed).toEqual([2, 4, 6, 8, 10]);
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Workflow Chaining Tests
// ============================================================================

test("Workflow chains multiple nodes sequentially", async () => {
  type PipelineData = {
    value: string;
    steps: string[];
  };

  const workflow = defineWorkflow<PipelineData>({
    name: "chain-test",
    initialState: () => ({ value: "  hello world  ", steps: [] }),
    build: ({ node, chain }) => {
      const trim = node<string, string>({
        name: "trim",
        prep: (state) => state.data.value,
        exec: (input) => input.trim(),
        post: (state, _prep, result) => {
          state.data.value = result;
          state.data.steps.push("trim");
          return undefined;
        },
      });

      const uppercase = node<string, string>({
        name: "uppercase",
        prep: (state) => state.data.value,
        exec: (input) => input.toUpperCase(),
        post: (state, _prep, result) => {
          state.data.value = result;
          state.data.steps.push("uppercase");
          return undefined;
        },
      });

      const prefix = node<string, string>({
        name: "prefix",
        prep: (state) => state.data.value,
        exec: (input) => `>>> ${input}`,
        post: (state, _prep, result) => {
          state.data.value = result;
          state.data.steps.push("prefix");
          return undefined;
        },
      });

      return chain(trim, uppercase, prefix);
    },
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.value).toBe(">>> HELLO WORLD");
    expect(result.state.steps).toEqual(["trim", "uppercase", "prefix"]);
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Workflow Branching Tests
// ============================================================================

test("Workflow supports conditional branching", async () => {
  type OrderData = {
    amount: number;
    status: string;
    path: string[];
  };

  const workflow = defineWorkflow<OrderData>({
    name: "branch-test",
    initialState: () => ({ amount: 150, status: "pending", path: [] }),
    build: ({ node, chain, branch }) => {
      const router = node({
        name: "router",
        post: (state) => {
          state.data.path.push("router");
          return state.data.amount > 100 ? "high" : "low";
        },
      });

      const highValue = node({
        name: "high-value",
        post: (state) => {
          state.data.path.push("high-value");
          state.data.status = "approved-high";
          return undefined;
        },
      });

      const lowValue = node({
        name: "low-value",
        post: (state) => {
          state.data.path.push("low-value");
          state.data.status = "approved-low";
          return undefined;
        },
      });

      const finalize = node({
        name: "finalize",
        post: (state) => {
          state.data.path.push("finalize");
          return undefined;
        },
      });

      return chain(
        branch(router, {
          high: [highValue],
          low: [lowValue],
        }),
        finalize,
      );
    },
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.status).toBe("approved-high");
    expect(result.state.path).toEqual(["router", "high-value", "finalize"]);
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Workflow Memory Integration Tests
// ============================================================================

test("Workflow can read and write to agent memory", async () => {
  type MemoryData = {
    key: string;
    value: string;
    retrieved: string | undefined;
  };

  const workflow = defineWorkflow<MemoryData>({
    name: "memory-test",
    initialState: () => ({
      key: "test-key",
      value: "test-value",
      retrieved: undefined,
    }),
    build: ({ node, chain }) => {
      const saveToMemory = node({
        name: "save-to-memory",
        post: async (state) => {
          await state.ctx.memory.set(
            state.data.key,
            "Test memory block",
            state.data.value,
          );
          return undefined;
        },
      });

      const readFromMemory = node({
        name: "read-from-memory",
        post: (state) => {
          const block = state.ctx.memory.get(state.data.key);
          state.data.retrieved = block?.content;
          return undefined;
        },
      });

      return chain(saveToMemory, readFromMemory);
    },
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.retrieved).toBe("test-value");

    // Verify memory persists
    expect(ctx.memory.get("test-key")?.content).toBe("test-value");
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Workflow Persistence Tests
// ============================================================================

test("Workflow run is persisted to database", async () => {
  type SimpleData = { done: boolean };

  const workflow = defineWorkflow<SimpleData>({
    name: "persistence-test",
    initialState: () => ({ done: false }),
    build: ({ node }) =>
      node({
        name: "mark-done",
        post: (state) => {
          state.data.done = true;
          return undefined;
        },
      }),
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    // Verify run is persisted via admin.workflows
    const run = await admin.workflows.get<SimpleData>(result.run);
    expect(run).not.toBeNull();
    expect(run!.status).toBe("completed");
    expect(run!.state.done).toBe(true);
    expect(run!.agent_id).toBe("test-agent");

    // Verify history via admin.workflows
    const history = await admin.workflows.listByStatus<SimpleData>("completed");
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]!.id).toBe(result.run);
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Workflow Initial Data Tests
// ============================================================================

test("Workflow accepts initial data override", async () => {
  type ConfigData = {
    name: string;
    count: number;
    processed: boolean;
  };

  const workflow = defineWorkflow<ConfigData>({
    name: "initial-data-test",
    initialState: () => ({ name: "default", count: 0, processed: false }),
    build: ({ node }) =>
      node({
        name: "process",
        post: (state) => {
          state.data.processed = true;
          return undefined;
        },
      }),
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
      {
        name: "custom",
        count: 42,
      },
    );

    expect(result.status).toBe("completed");
    expect(result.state.name).toBe("custom");
    expect(result.state.count).toBe(42);
    expect(result.state.processed).toBe(true);
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Workflow Error Handling Tests
// ============================================================================

test("Workflow handles node errors gracefully", async () => {
  type ErrorData = { shouldFail: boolean; errorHandled: boolean };

  const workflow = defineWorkflow<ErrorData>({
    name: "error-test",
    initialState: () => ({ shouldFail: true, errorHandled: false }),
    build: ({ node }) =>
      node({
        name: "failing-node",
        exec: () => {
          throw new Error("Intentional failure");
        },
        onError: (_error, state) => {
          state.data.errorHandled = true;
          return undefined; // Continue execution
        },
      }),
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.errorHandled).toBe(true);
  } finally {
    await ctx.close();
    admin.close();
  }
});

test("Workflow fails when error is not handled", async () => {
  type FailData = { value: number };

  const workflow = defineWorkflow<FailData>({
    name: "unhandled-error-test",
    initialState: () => ({ value: 0 }),
    build: ({ node }) =>
      node({
        name: "failing-node",
        exec: () => {
          throw new Error("Unhandled failure");
        },
        // No onError handler
      }),
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Unhandled failure");
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Workflow Duration Tracking Tests
// ============================================================================

test("Workflow tracks execution duration", async () => {
  type TimedData = { delay: number };

  const workflow = defineWorkflow<TimedData>({
    name: "duration-test",
    initialState: () => ({ delay: 50 }),
    build: ({ node }) =>
      node({
        name: "delayed-node",
        exec: async () => {
          await Bun.sleep(50);
        },
      }),
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.duration).toBeGreaterThanOrEqual(50);
  } finally {
    await ctx.close();
    admin.close();
  }
});

// ============================================================================
// Complex Workflow Integration Test
// ============================================================================

test("Complex workflow: multi-step data processing pipeline", async () => {
  type ProcessingData = {
    rawInput: string;
    parsed: { name: string; value: number } | null;
    validated: boolean;
    transformed: string | null;
    saved: boolean;
    steps: string[];
  };

  const workflow = defineWorkflow<ProcessingData>({
    name: "complex-pipeline",
    initialState: () => ({
      rawInput: '{"name": "test", "value": 42}',
      parsed: null,
      validated: false,
      transformed: null,
      saved: false,
      steps: [],
    }),
    build: ({ node, chain }) => {
      // Step 1: Parse JSON input
      const parse = node({
        name: "parse",
        prep: (state) => state.data.rawInput,
        exec: (input) => JSON.parse(input),
        post: (state, _prep, result) => {
          state.data.parsed = result;
          state.data.steps.push("parsed");
          return undefined;
        },
      });

      // Step 2: Validate parsed data
      const validate = node({
        name: "validate",
        prep: (state) => state.data.parsed,
        exec: (data) => {
          const errors: string[] = [];
          if (!data) errors.push("No data");
          else {
            if (!data.name) errors.push("Missing name");
            if (data.value < 0) errors.push("Value must be non-negative");
          }
          return { valid: errors.length === 0, errors };
        },
        post: (state, _prep, result) => {
          state.data.validated = result.valid;
          state.data.steps.push("validated");
          return result.valid ? "transform" : "reject";
        },
      });

      // Step 3a: Transform valid data
      const transform = node({
        name: "transform",
        prep: (state) => state.data.parsed,
        exec: (data) => `${data!.name.toUpperCase()}: ${data!.value * 2}`,
        post: (state, _prep, result) => {
          state.data.transformed = result;
          state.data.steps.push("transformed");
          return undefined;
        },
      });

      // Step 3b: Handle rejection
      const reject = node({
        name: "reject",
        post: (state) => {
          state.data.steps.push("rejected");
          return undefined;
        },
      });

      // Step 4: Save to memory
      const save = node({
        name: "save",
        post: async (state) => {
          if (state.data.transformed) {
            await state.ctx.memory.set(
              "processed-data",
              "Result of processing pipeline",
              state.data.transformed,
            );
            state.data.saved = true;
          }
          state.data.steps.push("saved");
          return undefined;
        },
      });

      // Build the workflow graph
      chain(parse, validate);
      validate.when("transform", transform);
      validate.when("reject", reject);
      transform.to(save);
      reject.to(save);

      return parse;
    },
  });

  const ctx = await AgentContext.create("test-agent", getTestDbPath());
  const admin = await AdminContext.create(tempAdminDbPath());
  try {
    const result = await runWorkflow(
      workflow,
      "test-agent",
      ctx,
      admin.workflows,
    );

    expect(result.status).toBe("completed");
    expect(result.state.parsed).toEqual({ name: "test", value: 42 });
    expect(result.state.validated).toBe(true);
    expect(result.state.transformed).toBe("TEST: 84");
    expect(result.state.saved).toBe(true);
    expect(result.state.steps).toEqual([
      "parsed",
      "validated",
      "transformed",
      "saved",
    ]);

    // Verify data was saved to memory
    expect(ctx.memory.get("processed-data")?.content).toBe("TEST: 84");
  } finally {
    await ctx.close();
    admin.close();
  }
});
