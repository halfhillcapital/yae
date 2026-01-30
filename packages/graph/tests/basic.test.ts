import { test, expect } from "bun:test";
import { BaseNode, Node, Flow, createNodes, chain, branch } from "@yae/graph";

type TestState = {
  value: number;
  logs: string[];
  executed: string[];
  metadata?: Record<string, unknown>;
};

// ============================================================================
// BaseNode Core Functionality Tests
// ============================================================================

test("BaseNode with no config works", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node = new BaseNode<TestState>();
  await node.run(shared);

  expect(shared.value).toBe(0); // No changes
});

test("BaseNode prep only", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node = new BaseNode<TestState>({
    prep: (s) => {
      s.value = 42;
      s.executed.push("prep");
    },
  });

  await node.run(shared);

  expect(shared.value).toBe(42);
  expect(shared.executed).toEqual(["prep"]);
});

test("BaseNode exec only", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node = new BaseNode<TestState, void, number>({
    exec: (_prepResult) => {
      shared.executed.push("exec");
      return 99;
    },
  });

  await node.run(shared);

  expect(shared.executed).toEqual(["exec"]);
});

test("BaseNode post only", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node = new BaseNode<TestState>({
    post: (s) => {
      s.value = 77;
      s.executed.push("post");
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.value).toBe(77);
  expect(shared.executed).toEqual(["post"]);
});

test("BaseNode prep -> exec -> post chain", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node = new BaseNode<TestState, { data: number }, number>({
    prep: (s) => {
      s.executed.push("prep");
      return { data: 10 };
    },
    exec: (prepResult: { data: number }) => {
      shared.executed.push("exec");
      return prepResult.data * 2;
    },
    post: (s, prepResult, execResult) => {
      s.executed.push("post");
      s.value = execResult as number;
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.value).toBe(20);
  expect(shared.executed).toEqual(["prep", "exec", "post"]);
});

test("BaseNode with name", async () => {
  const node = new BaseNode<TestState>({
    name: "Test Node",
  });

  expect(node.name).toBe("Test Node");
});

// ============================================================================
// Node vs BaseNode Behavior Tests
// ============================================================================

test("Node without retry behaves like BaseNode", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const baseNode = new BaseNode<TestState>({
    prep: (s) => {
      s.value = 10;
      s.executed.push("base");
    },
  });

  const node = new Node<TestState>({
    prep: (s) => {
      s.value = 10;
      s.executed.push("node");
    },
  });

  await baseNode.run(shared);
  expect(shared.value).toBe(10);
  expect(shared.executed).toEqual(["base"]);

  shared.value = 0;
  shared.executed = [];

  await node.run(shared);
  expect(shared.value).toBe(10);
  expect(shared.executed).toEqual(["node"]);
});

test("Node and BaseNode can be mixed in chains", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const workflow = chain(
    new BaseNode<TestState>({
      name: "BaseNode",
      prep: (s) => {
        s.value = 5;
        s.executed.push("base");
      },
    }),
    new Node<TestState>({
      name: "Node",
      prep: (s) => {
        s.value += 10;
        s.executed.push("node");
      },
    }),
    new BaseNode<TestState>({
      name: "BaseNode 2",
      prep: (s) => {
        s.value *= 2;
        s.executed.push("base2");
      },
    }),
  );

  await Flow.from(workflow).run(shared);

  expect(shared.value).toBe(30); // (5 + 10) * 2
  expect(shared.executed).toEqual(["base", "node", "base2"]);
});

// ============================================================================
// Cloning Tests
// ============================================================================

test("Cloned BaseNode is independent", async () => {
  const shared1: TestState = { value: 0, logs: [], executed: [] };
  const shared2: TestState = { value: 0, logs: [], executed: [] };

  const original = new BaseNode<TestState>({
    name: "Original",
    prep: (s) => {
      s.value = 100;
    },
  });

  const cloned = original.clone();
  cloned.name = "Cloned";

  await original.run(shared1);
  await cloned.run(shared2);

  expect(shared1.value).toBe(100);
  expect(shared2.value).toBe(100);
  expect(original.name).toBe("Original");
  expect(cloned.name).toBe("Cloned");
});

test("Cloned Node preserves retry config", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };
  let callCount = 0;

  const original = new Node<TestState>({
    name: "Original",
    exec: () => {
      callCount++;
      if (callCount < 2) throw new Error("Fail");
      shared.value = 100;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  const cloned = original.clone();

  await cloned.run(shared);

  expect(callCount).toBe(2); // Retry worked on cloned node
  expect(shared.value).toBe(100);
});

test("Cloning preserves successors", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node1 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("node1");
    },
  });

  const node2 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("node2");
    },
  });

  node1.to(node2);

  const cloned = node1.clone();

  const flow1 = Flow.from(node1);
  await flow1.run(shared);

  shared.executed = [];

  const flow2 = Flow.from(cloned);
  await flow2.run(shared);

  expect(shared.executed).toEqual(["node1", "node2"]);
});

// ============================================================================
// Branching Edge Cases
// ============================================================================

test("Branch to multiple nodes with different actions", async () => {
  const shared: TestState = { value: 5, logs: [], executed: [] };

  const router = new BaseNode<TestState>({
    post: (s) => {
      if (s.value < 0) return "negative";
      if (s.value === 0) return "zero";
      if (s.value < 10) return "small";
      return "large";
    },
  });

  const negative = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("negative");
    },
  });

  const zero = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("zero");
    },
  });

  const small = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("small");
    },
  });

  const large = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("large");
    },
  });

  branch(router, {
    negative: [negative],
    zero: [zero],
    small: [small],
    large: [large],
  });

  await Flow.from(router).run(shared);
  expect(shared.executed).toEqual(["small"]);
});

test("Branch exit can be chained to continuation", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const router = new BaseNode<TestState>({
    post: (_s) => "path_a",
  });

  const pathA = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("A");
    },
  });

  const pathB = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("B");
    },
  });

  const continuation = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("continue");
    },
  });

  // branch() returns { entry, exit } - exit can be chained
  branch(router, { path_a: [pathA], path_b: [pathB] }).exit.to(continuation);

  await Flow.from(router).run(shared);
  expect(shared.executed).toEqual(["A", "continue"]);
});

test("when() is chainable", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const router = new BaseNode<TestState>({
    post: (s) => (s.value > 0 ? "positive" : "negative"),
  });

  router
    .when(
      "positive",
      new BaseNode<TestState>({
        prep: (s) => {
          s.executed.push("pos");
        },
      }),
    )
    .when(
      "negative",
      new BaseNode<TestState>({
        prep: (s) => {
          s.executed.push("neg");
        },
      }),
    )
    .when(
      "zero",
      new BaseNode<TestState>({
        prep: (s) => {
          s.executed.push("zero");
        },
      }),
    );

  await Flow.from(router).run(shared);
  expect(shared.executed).toEqual(["neg"]);
});

test("Undefined action goes to default", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node1 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("node1");
    },
    post: () => undefined,
  });

  const node2 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("node2");
    },
  });

  node1.to(node2);

  await Flow.from(node1).run(shared);
  expect(shared.executed).toEqual(["node1", "node2"]);
});

test("Overriding successor shows warning", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };
  const warnings: string[] = [];

  // Capture console.warn
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };

  const node = new BaseNode<TestState>();
  const next1 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("next1");
    },
  });
  const next2 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("next2");
    },
  });

  node.to(next1);
  node.to(next2); // Should warn about override

  console.warn = originalWarn;

  expect(warnings.length).toBeGreaterThan(0);
  expect(warnings[0]).toContain("overridden");

  // Second node should win
  await Flow.from(node).run(shared);
  expect(shared.executed).toEqual(["next2"]);
});

// ============================================================================
// Chain Helper Tests
// ============================================================================

test("chain with single node", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const workflow = chain(
    new BaseNode<TestState>({
      prep: (s) => {
        s.value = 42;
      },
    }),
  );

  await Flow.from(workflow).run(shared);
  expect(shared.value).toBe(42);
});

test("chain returns first node", async () => {
  const node1 = new BaseNode<TestState>({ name: "First" });
  const node2 = new BaseNode<TestState>({ name: "Second" });
  const node3 = new BaseNode<TestState>({ name: "Third" });

  const result = chain(node1, node2, node3);

  expect(result.name).toBe("First");
});

test("chain throws on empty array", async () => {
  expect(() => chain()).toThrow("At least one node required");
});

// ============================================================================
// Flow Hooks Tests
// ============================================================================

test("Flow beforeStart hook", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const workflow = new BaseNode<TestState>({
    prep: (s) => {
      s.value = 10;
    },
  });

  await Flow.from(workflow, {
    beforeStart: (s) => {
      s.logs.push("started");
      s.value = 5; // Initialize
    },
  }).run(shared);

  expect(shared.logs).toContain("started");
  expect(shared.value).toBe(10);
});

test("Flow afterComplete hook", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const workflow = new BaseNode<TestState>({
    prep: (s) => {
      s.value = 10;
    },
    post: () => "done",
  });

  let finalAction: string | undefined;

  await Flow.from(workflow, {
    afterComplete: (s, action) => {
      s.logs.push("completed");
      finalAction = action;
    },
  }).run(shared);

  expect(shared.logs).toContain("completed");
  expect(finalAction).toBe("done");
});

test("Flow onNodeExecute hook", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };
  const nodeNames: string[] = [];

  const workflow = chain(
    new BaseNode<TestState>({
      name: "Node 1",
      prep: (s) => {
        s.value = 1;
      },
    }),
    new BaseNode<TestState>({
      name: "Node 2",
      prep: (s) => {
        s.value = 2;
      },
    }),
    new BaseNode<TestState>({
      name: "Node 3",
      prep: (s) => {
        s.value = 3;
      },
    }),
  );

  await Flow.from(workflow, {
    onNodeExecute: (node, _action) => {
      if (node.name) nodeNames.push(node.name);
    },
  }).run(shared);

  expect(nodeNames).toEqual(["Node 1", "Node 2", "Node 3"]);
});

test("Flow hooks are called in correct order", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };
  const order: string[] = [];

  const workflow = new BaseNode<TestState>({
    name: "Worker",
    prep: (s) => {
      order.push("node-prep");
      s.value = 10;
    },
  });

  await Flow.from(workflow, {
    beforeStart: () => {
      order.push("beforeStart");
    },
    onNodeExecute: () => {
      order.push("onNodeExecute");
    },
    afterComplete: () => {
      order.push("afterComplete");
    },
  }).run(shared);

  expect(order).toEqual([
    "beforeStart",
    "node-prep",
    "onNodeExecute",
    "afterComplete",
  ]);
});

test("Flow onError hook with unhandled error", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };
  let errorCaught = false;
  let errorNode: string | undefined;

  const workflow = new BaseNode<TestState>({
    name: "Failing Node",
    prep: () => {
      throw new Error("Test error");
    },
  });

  const flow = Flow.from(workflow, {
    onError: (error, node) => {
      errorCaught = true;
      errorNode = node.name;
      shared.logs.push(`Error in ${node.name}: ${error.message}`);
    },
  });

  await expect(flow.run(shared)).rejects.toThrow("Test error");
  expect(errorCaught).toBe(true);
  expect(errorNode).toBe("Failing Node");
  expect(shared.logs).toContain("Error in Failing Node: Test error");
});

test("Flow onError hook not called when node handles error", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };
  let flowErrorCalled = false;

  const workflow = new BaseNode<TestState>({
    prep: () => {
      throw new Error("Test error");
    },
    onError: (error, s) => {
      s.logs.push("Node handled error");
      return undefined;
    },
  });

  await Flow.from(workflow, {
    onError: () => {
      flowErrorCalled = true;
    },
  }).run(shared);

  expect(flowErrorCalled).toBe(false);
  expect(shared.logs).toContain("Node handled error");
});

// ============================================================================
// Complex Workflow Tests
// ============================================================================

test("Diamond pattern workflow", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  // Start -> Split -> [Path A, Path B] -> End
  const start = new BaseNode<TestState>({
    name: "Start",
    prep: (s) => {
      s.value = 10;
      s.executed.push("start");
    },
    post: (s) => (s.value > 5 ? "high" : "low"),
  });

  const pathA = new BaseNode<TestState>({
    name: "Path A",
    prep: (s) => {
      s.value += 5;
      s.executed.push("pathA");
    },
  });

  const pathB = new BaseNode<TestState>({
    name: "Path B",
    prep: (s) => {
      s.value += 10;
      s.executed.push("pathB");
    },
  });

  const end = new BaseNode<TestState>({
    name: "End",
    prep: (s) => {
      s.value *= 2;
      s.executed.push("end");
    },
  });

  // Using new API: chain handles branch structures naturally
  chain(branch(start, { high: [pathA], low: [pathB] }), end);

  await Flow.from(start).run(shared);

  expect(shared.value).toBe(30); // (10 + 5) * 2
  expect(shared.executed).toEqual(["start", "pathA", "end"]);
});

test("Nested workflows (Flow as Node)", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const subflow = Flow.from(
    chain(
      new BaseNode<TestState>({
        name: "Sub 1",
        prep: (s) => {
          s.value += 5;
          s.executed.push("sub1");
        },
      }),
      new BaseNode<TestState>({
        name: "Sub 2",
        prep: (s) => {
          s.value *= 2;
          s.executed.push("sub2");
        },
      }),
    ),
    { name: "Subflow" },
  );

  const mainflow = Flow.from(
    chain(
      new BaseNode<TestState>({
        name: "Main 1",
        prep: (s) => {
          s.value = 10;
          s.executed.push("main1");
        },
      }),
      subflow,
      new BaseNode<TestState>({
        name: "Main 2",
        prep: (s) => {
          s.value += 1;
          s.executed.push("main2");
        },
      }),
    ),
    { name: "Mainflow" },
  );

  await mainflow.run(shared);

  expect(shared.value).toBe(31); // ((10 + 5) * 2) + 1
  expect(shared.executed).toEqual(["main1", "sub1", "sub2", "main2"]);
});

test("Circular reference protection via cloning", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node1 = new BaseNode<TestState>({
    name: "Node 1",
    prep: (s) => {
      s.executed.push("node1");
      s.value++;
    },
    post: (s) => (s.value < 3 ? "continue" : "stop"),
  });

  const node2 = new BaseNode<TestState>({
    name: "Node 2",
    prep: (s) => {
      s.executed.push("node2");
      s.value++;
    },
  });

  const stop = new BaseNode<TestState>({
    name: "Stop",
    prep: (s) => {
      s.executed.push("stop");
    },
  });

  branch(node1, { continue: [node2], stop: [stop] });
  node2.to(node1); // Circular!

  await Flow.from(node1).run(shared);

  expect(shared.value).toBe(3);
  expect(shared.executed).toEqual([
    "node1",
    "node2", // value = 2
    "node1",
    "stop",
  ]);
});

// ============================================================================
// Async Handling Tests
// ============================================================================

test("Async prep, exec, post", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node = new BaseNode<TestState, { data: number }, number>({
    prep: async (s) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      s.executed.push("prep");
      return { data: 5 };
    },
    exec: async (prepResult) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      shared.executed.push("exec");
      return prepResult.data * 2;
    },
    post: async (s, prepResult, execResult) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      s.executed.push("post");
      s.value = execResult as number;
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.value).toBe(10);
  expect(shared.executed).toEqual(["prep", "exec", "post"]);
});

test("Parallel execution timing", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const slowNode = new BaseNode<TestState>({
    name: "Slow",
    prep: async (s) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      s.executed.push("slow");
    },
  });

  const fastNode = new BaseNode<TestState>({
    name: "Fast",
    prep: async (s) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      s.executed.push("fast");
    },
  });

  // Sequential execution - slow then fast
  const startTime = Date.now();
  await Flow.from(chain(slowNode.clone(), fastNode.clone())).run(shared);
  const duration = Date.now() - startTime;

  expect(duration).toBeGreaterThanOrEqual(100); // At least 100ms
  expect(shared.executed).toEqual(["slow", "fast"]);
});

// ============================================================================
// Edge Cases and Gotchas
// ============================================================================

test("Empty flow runs successfully", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const emptyNode = new BaseNode<TestState>();

  await Flow.from(emptyNode).run(shared);

  // Should complete without error
  expect(shared.value).toBe(0);
});

test("Node returning undefined action continues normally", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const workflow = chain(
    new BaseNode<TestState>({
      prep: (s) => {
        s.executed.push("node1");
      },
      post: () => undefined,
    }),
    new BaseNode<TestState>({
      prep: (s) => {
        s.executed.push("node2");
      },
    }),
  );

  await Flow.from(workflow).run(shared);

  expect(shared.executed).toEqual(["node1", "node2"]);
});

test("Node with no successors ends flow", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const node = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("node");
    },
    post: () => "some_action", // Action but no successors
  });

  await Flow.from(node).run(shared);

  expect(shared.executed).toEqual(["node"]);
  // Should complete without error even though action has no successor
});

test("Modifying shared state is visible across nodes", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [], metadata: {} };

  const workflow = chain(
    new BaseNode<TestState>({
      prep: (s) => {
        s.metadata!.step1 = "done";
        s.value = 10;
      },
    }),
    new BaseNode<TestState>({
      prep: (s) => {
        // Should see changes from previous node
        expect(s.metadata!.step1).toBe("done");
        expect(s.value).toBe(10);
        s.value += 5;
      },
    }),
  );

  await Flow.from(workflow).run(shared);

  expect(shared.value).toBe(15);
  expect(shared.metadata!.step1).toBe("done");
});

test("Error in Flow hook doesn't break flow execution tracking", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const workflow = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("node");
    },
  });

  const flow = Flow.from(workflow, {
    beforeStart: () => {
      throw new Error("Hook error");
    },
  });

  await expect(flow.run(shared)).rejects.toThrow("Hook error");

  // Node should not have executed due to beforeStart error
  expect(shared.executed).toEqual([]);
});

// ============================================================================
// Type Safety Tests (Compile-time checks)
// ============================================================================

test("Type safety for shared state", async () => {
  type CustomState = {
    username: string;
    count: number;
  };

  const shared: CustomState = { username: "alice", count: 0 };

  const node = new BaseNode<CustomState>({
    prep: (s) => {
      // TypeScript should enforce correct types
      s.username = s.username.toUpperCase();
      s.count++;
    },
  });

  await node.run(shared);

  expect(shared.username).toBe("ALICE");
  expect(shared.count).toBe(1);
});

test("BaseNode and Node interoperability", async () => {
  const shared: TestState = { value: 0, logs: [], executed: [] };

  const baseNodes: BaseNode<TestState>[] = [
    new BaseNode<TestState>({
      prep: (s) => {
        s.value = 1;
      },
    }),
    new Node<TestState>({
      prep: (s) => {
        s.value = 2;
      },
    }),
    new BaseNode<TestState>({
      prep: (s) => {
        s.value = 3;
      },
    }),
  ];

  // Should accept both types
  const workflow = chain(...baseNodes);

  await Flow.from(workflow).run(shared);

  expect(shared.value).toBe(3);
});

// ============================================================================
// Prep → Exec → Post Pipeline Pattern Tests
// ============================================================================
// These tests demonstrate the intended usage pattern:
// - prep: Read from shared state, prepare inputs for exec
// - exec: Pure transformation (no shared state access)
// - post: Write results back to shared state, decide routing

type Item = {
  name: string;
  price: number;
  quantity: number;
};

type OrderState = {
  orderId: string;
  items: Item[];
  discount: number;
  total: number;
  status: string;
  errors: string[];
};

test("Pipeline: Calculate order total", async () => {
  const shared: OrderState = {
    orderId: "ORD-123",
    items: [
      { name: "Widget", price: 10, quantity: 2 },
      { name: "Gadget", price: 25, quantity: 1 },
    ],
    discount: 0.1,
    total: 0,
    status: "pending",
    errors: [],
  };

  // Using node() factory - types flow through automatically
  const calculateTotal = new Node<
    OrderState,
    { items: Item[]; discount: number },
    { total: number }
  >({
    name: "Calculate Total",
    // prep: Extract data needed for calculation
    prep: (s) => ({
      items: s.items,
      discount: s.discount,
    }),
    // exec: Pure calculation - input is typed as { items: ..., discount: number }
    exec: (input) => {
      const subtotal = input.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      const discountAmount = subtotal * input.discount;
      return {
        subtotal,
        discountAmount,
        total: subtotal - discountAmount,
      };
    },
    // post: result is typed as { subtotal: number, discountAmount: number, total: number }
    post: (s, _prep, result) => {
      s.total = result.total;
      s.status = "calculated";
      return undefined;
    },
  });

  await calculateTotal.run(shared);

  expect(shared.total).toBe(40.5); // (20 + 25) * 0.9
  expect(shared.status).toBe("calculated");
});

test("Pipeline: Validate and route based on result", async () => {
  const shared: OrderState = {
    orderId: "ORD-456",
    items: [{ name: "Expensive Item", price: 1000, quantity: 1 }],
    discount: 0,
    total: 1000,
    status: "pending",
    errors: [],
  };

  const { node } = createNodes<OrderState>();

  const validateOrder = node({
    name: "Validate Order",
    prep: (s) => ({
      total: s.total,
      itemCount: s.items.length,
    }),
    exec: (input) => {
      const errors: string[] = [];
      if (input.total > 500) errors.push("Order exceeds limit");
      if (input.itemCount === 0) errors.push("No items in order");
      return { isValid: errors.length === 0, errors };
    },
    post: (s, _prep, result) => {
      s.errors = result.errors;
      s.status = result.isValid ? "valid" : "invalid";
      return result.isValid ? "approve" : "reject";
    },
  });

  const approveNode = new BaseNode<OrderState>({
    prep: (s) => {
      s.status = "approved";
    },
  });

  const rejectNode = new BaseNode<OrderState>({
    prep: (s) => {
      s.status = "rejected";
    },
  });

  branch(validateOrder, { approve: [approveNode], reject: [rejectNode] });

  await Flow.from(validateOrder).run(shared);

  expect(shared.status).toBe("rejected");
  expect(shared.errors).toContain("Order exceeds limit");
});

type UserState = {
  userId: string;
  rawInput: string;
  parsedData: { email: string; age: number } | null;
  validationResult: { valid: boolean; message: string } | null;
  saved: boolean;
};

test("Pipeline: Multi-step data processing", async () => {
  const shared: UserState = {
    userId: "USR-001",
    rawInput: '{"email": "test@example.com", "age": 25}',
    parsedData: null,
    validationResult: null,
    saved: false,
  };

  const { node } = createNodes<UserState>();

  // Step 1: Parse raw input
  const parseInput = node({
    name: "Parse Input",
    prep: (s) => s.rawInput,
    exec: (raw) => JSON.parse(raw) as { email: string; age: number },
    post: (s, _prep, parsed) => {
      s.parsedData = parsed;
      return undefined;
    },
  });

  // Step 2: Validate parsed data
  const validateData = node({
    name: "Validate Data",
    prep: (s) => s.parsedData,
    exec: (data) => {
      if (!data) return { valid: false, message: "No data to validate" };
      if (!data.email.includes("@"))
        return { valid: false, message: "Invalid email" };
      if (data.age < 18)
        return { valid: false, message: "Must be 18 or older" };
      return { valid: true, message: "OK" };
    },
    post: (s, _prep, result) => {
      s.validationResult = result;
      return result.valid ? "save" : "error";
    },
  });

  // Step 3: Save (only reached if valid)
  const saveData = node({
    name: "Save Data",
    prep: (s) => s.parsedData,
    exec: () => {
      // Simulate save operation
      return { success: true, id: `saved-${Date.now()}` };
    },
    post: (s, _prep, result) => {
      s.saved = result.success;
      return undefined;
    },
  });

  const errorHandler = new BaseNode<UserState>({
    prep: (s) => {
      s.saved = false;
    },
  });

  chain(parseInput, validateData);
  branch(validateData, { save: [saveData], error: [errorHandler] });

  await Flow.from(parseInput).run(shared);

  expect(shared.parsedData).toEqual({ email: "test@example.com", age: 25 });
  expect(shared.validationResult).toEqual({ valid: true, message: "OK" });
  expect(shared.saved).toBe(true);
});

type MathState = {
  a: number;
  b: number;
  operation: "add" | "multiply" | "power";
  result: number | null;
};

test("Pipeline: exec is pure and isolated from shared state", async () => {
  const shared: MathState = {
    a: 5,
    b: 3,
    operation: "multiply",
    result: null,
  };

  const { node } = createNodes<MathState>();

  // Track if exec tried to access shared (it shouldn't)
  let execReceivedCorrectInput = false;

  const compute = node({
    name: "Compute",
    prep: (s) => ({
      x: s.a,
      y: s.b,
      op: s.operation,
    }),
    exec: (input) => {
      // exec only has access to prepResult, not shared
      execReceivedCorrectInput =
        input.x === 5 && input.y === 3 && input.op === "multiply";

      switch (input.op) {
        case "add":
          return input.x + input.y;
        case "multiply":
          return input.x * input.y;
        case "power":
          return Math.pow(input.x, input.y);
        default:
          throw new Error(`Unknown operation: ${input.op}`);
      }
    },
    post: (s, _prep, result) => {
      s.result = result;
      return undefined;
    },
  });

  await compute.run(shared);

  expect(execReceivedCorrectInput).toBe(true);
  expect(shared.result).toBe(15);
});

test("Pipeline: post receives both prepResult and execResult", async () => {
  type AuditState = {
    input: number;
    output: number;
    audit: { original: number; transformed: number; multiplier: number } | null;
  };

  const shared: AuditState = {
    input: 10,
    output: 0,
    audit: null,
  };

  const { node } = createNodes<AuditState>();

  const transform = node({
    name: "Transform with Audit",
    prep: (s) => ({ value: s.input, multiplier: 3 }),
    exec: (prep) => prep.value * prep.multiplier,
    post: (s, prepResult, execResult) => {
      // post has access to both prep and exec results for auditing/logging
      s.output = execResult;
      s.audit = {
        original: prepResult.value,
        transformed: execResult,
        multiplier: prepResult.multiplier,
      };
      return undefined;
    },
  });

  await transform.run(shared);

  expect(shared.output).toBe(30);
  expect(shared.audit).toEqual({
    original: 10,
    transformed: 30,
    multiplier: 3,
  });
});

test("Pipeline: chained transformations with data flowing through", async () => {
  type PipelineState = {
    raw: string;
    steps: string[];
    final: string;
  };

  const shared: PipelineState = {
    raw: "  hello world  ",
    steps: [],
    final: "",
  };

  const { node } = createNodes<PipelineState>();

  // Step 1: Trim whitespace
  const trim = node({
    name: "Trim",
    prep: (s) => s.raw,
    exec: (input) => input.trim(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("trimmed");
      return undefined;
    },
  });

  // Step 2: Uppercase
  const uppercase = node({
    name: "Uppercase",
    prep: (s) => s.raw,
    exec: (input) => input.toUpperCase(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("uppercased");
      return undefined;
    },
  });

  // Step 3: Add prefix
  const prefix = node({
    name: "Prefix",
    prep: (s) => s.raw,
    exec: (input) => `>>> ${input}`,
    post: (s, _prep, result) => {
      s.final = result;
      s.steps.push("prefixed");
      return undefined;
    },
  });

  await Flow.from(chain(trim, uppercase, prefix)).run(shared);

  expect(shared.final).toBe(">>> HELLO WORLD");
  expect(shared.steps).toEqual(["trimmed", "uppercased", "prefixed"]);
});

test("Pipeline: chained transformations with branching", async () => {
  type PipelineState = {
    raw: string;
    steps: string[];
    final: string;
  };

  const shared: PipelineState = {
    raw: "  heLLo woRld  ",
    steps: [],
    final: "",
  };

  const { node } = createNodes<PipelineState>();

  // Step 1: Trim whitespace
  const trim = node({
    name: "Trim",
    prep: (s) => s.raw,
    exec: (input) => input.trim(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("trimmed");
      return undefined;
    },
  });

  const router = node({
    name: "router",
    post: (_s, _prep, _result) => {
      return "lowercase";
    },
  });

  // Step A2: Uppercase
  const uppercase = node({
    name: "Uppercase",
    prep: (s) => s.raw,
    exec: (input) => input.toUpperCase(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("uppercased");
      return undefined;
    },
  });

  // Step B2: Uppercase
  const lowercase = node({
    name: "Lowercase",
    prep: (s) => s.raw,
    exec: (input) => input.toLowerCase(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("lowercased");
      return undefined;
    },
  });

  // Step 3: Add prefix
  const prefix = node({
    name: "Prefix",
    prep: (s) => s.raw,
    exec: (input) => `>>> ${input}`,
    post: (s, _prep, result) => {
      s.final = result;
      s.steps.push("prefixed");
      return undefined;
    },
  });

  const workflow = chain(
    trim,
    branch(router, { lowercase: [lowercase], uppercase: [uppercase] }),
    prefix,
  );

  await Flow.from(workflow).run(shared);

  expect(shared.final).toBe(">>> hello world");
  expect(shared.steps).toEqual(["trimmed", "lowercased", "prefixed"]);
});

test("Pipeline: chained transformations with branching", async () => {
  type PipelineState = {
    raw: string;
    steps: string[];
    final: string;
  };

  const shared: PipelineState = {
    raw: "  heLLo woRld  ",
    steps: [],
    final: "",
  };

  const { node } = createNodes<PipelineState>();

  // Step 1: Trim whitespace
  const trim = node({
    name: "Trim",
    prep: (s) => s.raw,
    exec: (input) => input.trim(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("trimmed");
      return undefined;
    },
  });

  const router = node({
    name: "router",
    post: (_s, _prep, _result) => {
      return "lowercase";
    },
  });

  // Step A2: Uppercase
  const uppercase = node({
    name: "Uppercase",
    prep: (s) => s.raw,
    exec: (input) => input.toUpperCase(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("uppercased");
      return undefined;
    },
  });

  // Step B2: Uppercase
  const lowercase = node({
    name: "Lowercase",
    prep: (s) => s.raw,
    exec: (input) => input.toLowerCase(),
    post: (s, _prep, result) => {
      s.raw = result;
      s.steps.push("lowercased");
      return undefined;
    },
  });

  // Step C2: Chaos
  const chaoscase = node({
    name: "Chaoscase",
    prep: (_s) => 5,
    exec: (input) => input * 5,
    post: (s, _prep, result) => {
      s.steps.push(`entropied_${result}`);
      return undefined;
    },
  });

  // Step 3: Add prefix
  const prefix = node({
    name: "Prefix",
    prep: (s) => s.raw,
    exec: (input) => `>>> ${input}`,
    post: (s, _prep, result) => {
      s.final = result;
      s.steps.push("prefixed");
      return undefined;
    },
  });

  const workflow = chain(
    trim,
    branch(router, {
      lowercase: [lowercase, chaoscase],
      uppercase: [uppercase],
    }),
    prefix,
  );

  await Flow.from(workflow).run(shared);

  expect(shared.final).toBe(">>> hello world");
  expect(shared.steps).toEqual([
    "trimmed",
    "lowercased",
    "entropied_25",
    "prefixed",
  ]);
});
