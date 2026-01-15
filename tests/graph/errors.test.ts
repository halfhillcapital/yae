import { test, expect } from "bun:test";
import { Node, Flow, chain, branch } from "@yae/graph";

type SharedCalc = {
  result: number;
  errorCount?: number;
  logs?: string[];
};

// ============================================================================
// Node-Level Error Handling Tests
// ============================================================================

test("Node with onError handler catches and handles errors", async () => {
  const shared: SharedCalc = { result: 0, errorCount: 0 };

  const riskyNode = new Node<SharedCalc>({
    name: "Risky operation",
    prep: async (_s) => {
      throw new Error("Something went wrong!");
    },
    onError: (error, shared) => {
      shared.errorCount = (shared.errorCount || 0) + 1;
      shared.result = -1; // Set error state
      return "error"; // Route to error handler
    },
  });

  const errorHandler = new Node<SharedCalc>({
    name: "Error handler",
    prep: (s) => {
      s.result = 999; // Recovery value
    },
  });

  riskyNode.when("error", errorHandler);

  const flow = Flow.from(riskyNode);
  const result = await flow.run(shared);

  expect(shared.errorCount).toBe(1);
  expect(shared.result).toBe(999);
  expect(result).toBeUndefined();
});

test("Node without onError handler throws error", async () => {
  const shared: SharedCalc = { result: 0 };

  const riskyNode = new Node<SharedCalc>({
    name: "Risky operation",
    prep: async (_s) => {
      throw new Error("Unhandled error!");
    },
  });

  const flow = Flow.from(riskyNode);

  await expect(flow.run(shared)).rejects.toThrow("Unhandled error!");
});

test("Error in prep is caught by onError", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc>({
    prep: () => {
      throw new Error("Prep error");
    },
    onError: (error, shared) => {
      shared.result = 100;
      return undefined;
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(100);
});

test("Error in exec is caught by onError", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc, { value: number }>({
    prep: () => ({ value: 42 }),
    exec: () => {
      throw new Error("Exec error");
    },
    onError: (error, shared) => {
      shared.result = 200;
      return undefined;
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(200);
});

test("Error in post is caught by onError", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc>({
    prep: () => undefined,
    exec: () => undefined,
    post: () => {
      throw new Error("Post error");
    },
    onError: (error, shared) => {
      shared.result = 300;
      return undefined;
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(300);
});

test("onError can route to different branches based on error type", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc>({
    prep: (s) => {
      if (s.result === 0) {
        throw new Error("VALIDATION_ERROR");
      }
    },
    onError: (error, _shared) => {
      if (error.message.includes("VALIDATION")) {
        return "validation_error";
      }
      return "general_error";
    },
  });

  const validationHandler = new Node<SharedCalc>({
    prep: (s) => {
      s.result = 111;
    },
  });

  const generalHandler = new Node<SharedCalc>({
    prep: (s) => {
      s.result = 222;
    },
  });

  branch(node, {
    validation_error: [validationHandler],
    general_error: [generalHandler],
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(111);
});

test("Error handling in chained nodes", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };

  const workflow = chain(
    new Node<SharedCalc>({
      name: "Step 1",
      prep: (s) => {
        s.result = 10;
        s.logs?.push("Step 1 success");
      },
    }),
    new Node<SharedCalc>({
      name: "Step 2 (fails)",
      prep: () => {
        throw new Error("Step 2 failed");
      },
      onError: (error, shared) => {
        shared.logs?.push("Step 2 error handled");
        shared.result = -1;
        return "recovery";
      },
    }),
    new Node<SharedCalc>({
      name: "Step 3 (skipped)",
      prep: (s) => {
        s.logs?.push("Step 3 (should not run)");
      },
    }),
  );

  const recoveryNode = new Node<SharedCalc>({
    prep: (s) => {
      s.logs?.push("Recovery node");
      s.result = 999;
    },
  });

  // Find step 2 and add recovery branch
  workflow.next()?.when("recovery", recoveryNode);

  const flow = Flow.from(workflow);
  await flow.run(shared);

  expect(shared.logs).toEqual([
    "Step 1 success",
    "Step 2 error handled",
    "Recovery node",
  ]);
  expect(shared.result).toBe(999);
});

// ============================================================================
// Flow-Level Error Handling Tests
// ============================================================================

test("Flow onError hook is called when node fails", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };
  let errorLogged = false;
  let failedNodeName = "";

  const workflow = new Node<SharedCalc>({
    name: "Failing node",
    prep: () => {
      throw new Error("Node failure");
    },
  });

  const flow = Flow.from(workflow, {
    onError: (error, node, shared) => {
      errorLogged = true;
      failedNodeName = node.name || "unknown";
      shared.logs?.push(`Error in ${node.name}: ${error.message}`);
    },
  });

  await expect(flow.run(shared)).rejects.toThrow("Node failure");
  expect(errorLogged).toBe(true);
  expect(failedNodeName).toBe("Failing node");
  expect(shared.logs).toContain("Error in Failing node: Node failure");
});

test("Flow onError and node onError both work together", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };

  const workflow = new Node<SharedCalc>({
    name: "Node with error",
    prep: () => {
      throw new Error("Test error");
    },
    onError: (error, shared) => {
      shared.logs?.push("Node-level error handler");
      return "handled";
    },
  });

  const recovery = new Node<SharedCalc>({
    prep: (s) => {
      s.result = 100;
      s.logs?.push("Recovery node");
    },
  });

  workflow.when("handled", recovery);

  const flow = Flow.from(workflow, {
    onError: (error, node, shared) => {
      shared.logs?.push("Flow-level error handler (should not be called)");
    },
  });

  await flow.run(shared);

  // Node handler should catch it, flow handler should not be called
  expect(shared.logs).toEqual(["Node-level error handler", "Recovery node"]);
  expect(shared.result).toBe(100);
});

test("Flow onError is called only when node doesn't handle error", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };

  const workflow = new Node<SharedCalc>({
    name: "Unhandled error node",
    prep: () => {
      throw new Error("Unhandled error");
    },
    // No onError handler
  });

  const flow = Flow.from(workflow, {
    onError: (error, node, shared) => {
      shared.logs?.push(`Flow caught error from ${node.name}`);
    },
  });

  await expect(flow.run(shared)).rejects.toThrow("Unhandled error");
  expect(shared.logs).toContain("Flow caught error from Unhandled error node");
});

test("Flow hooks are called in correct order", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };

  const workflow = chain(
    new Node<SharedCalc>({
      name: "Node 1",
      prep: (s) => {
        s.result = 1;
        s.logs?.push("Node 1 executed");
      },
    }),
    new Node<SharedCalc>({
      name: "Node 2",
      prep: () => {
        throw new Error("Node 2 error");
      },
      onError: (error, shared) => {
        shared.logs?.push("Node 2 error handled");
        return undefined; // Continue normally
      },
    }),
    new Node<SharedCalc>({
      name: "Node 3",
      prep: (s) => {
        s.result = 3;
        s.logs?.push("Node 3 executed");
      },
    }),
  );

  const flow = Flow.from(workflow, {
    beforeStart: (s) => {
      s.logs?.push("Flow started");
    },
    onNodeExecute: (node, _action) => {
      shared.logs?.push(`Executed: ${node.name}`);
    },
    onError: (error, node, shared) => {
      shared.logs?.push(`Flow saw error in ${node.name}`);
    },
    afterComplete: (s) => {
      s.logs?.push("Flow completed");
    },
  });

  await flow.run(shared);

  expect(shared.logs).toEqual([
    "Flow started",
    "Node 1 executed",
    "Executed: Node 1",
    "Node 2 error handled",
    "Executed: Node 2",
    "Node 3 executed",
    "Executed: Node 3",
    "Flow completed",
  ]);
});

// ============================================================================
// Complex Error Scenarios
// ============================================================================

test("Error handling with branching", async () => {
  const shared: SharedCalc = { result: 10, logs: [] };

  const start = new Node<SharedCalc>({
    name: "Start",
    prep: (s) => {
      s.logs?.push("Start");
    },
  });

  const checkNode = new Node<SharedCalc>({
    name: "Check",
    post: (s) => (s.result > 0 ? "positive" : "negative"),
  });

  const positiveNode = new Node<SharedCalc>({
    name: "Positive path",
    prep: () => {
      throw new Error("Positive path error");
    },
    onError: (error, shared) => {
      shared.logs?.push("Positive error handled");
      return "error_recovery";
    },
  });

  const negativeNode = new Node<SharedCalc>({
    name: "Negative path",
    prep: (s) => {
      s.logs?.push("Negative");
    },
  });

  const errorRecovery = new Node<SharedCalc>({
    name: "Error recovery",
    prep: (s) => {
      s.result = 0;
      s.logs?.push("Recovered");
    },
  });

  start.to(checkNode);
  branch(checkNode, {
    positive: [positiveNode],
    negative: [negativeNode],
  });

  positiveNode.when("error_recovery", errorRecovery);

  const flow = Flow.from(start, {
    onError: (error, node, shared) => {
      shared.logs?.push(`Flow error in ${node.name}`);
    },
  });

  await flow.run(shared);

  expect(shared.logs).toEqual(["Start", "Positive error handled", "Recovered"]);
  expect(shared.result).toBe(0);
});

test("Error in branch route with auto-converge", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };

  const router = new Node<SharedCalc>({
    name: "Router",
    prep: (s) => {
      s.result = 5;
    },
    post: (s) => (s.result > 0 ? "path1" : "path2"),
  });

  const path1Node = new Node<SharedCalc>({
    name: "Path 1",
    prep: () => {
      throw new Error("Path 1 error");
    },
    onError: (error, shared) => {
      shared.logs?.push("Path 1 error handled");
      return undefined;
    },
  });

  const path2Node = new Node<SharedCalc>({
    name: "Path 2",
    prep: (s) => {
      s.result += 10;
      s.logs?.push("Path 2 success");
    },
  });

  const end = new Node<SharedCalc>({
    name: "End",
    prep: (s) => {
      s.logs?.push("End");
    },
  });

  // Set up branching with auto-converge to end node
  chain(branch(router, { path1: [path1Node], path2: [path2Node] }), end);

  const flow = Flow.from(router);
  await flow.run(shared);

  expect(shared.logs).toEqual(["Path 1 error handled", "End"]);
  expect(shared.result).toBe(5);
});

test("Async error handling", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };

  const node = new Node<SharedCalc>({
    name: "Async node",
    prep: async (_s) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Async error");
    },
    onError: async (error, shared) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      shared.logs?.push("Async error handled");
      shared.result = 42;
      return undefined;
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.logs).toContain("Async error handled");
  expect(shared.result).toBe(42);
});

test("Error message is preserved", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };
  let capturedError: Error | null = null;

  const node = new Node<SharedCalc>({
    prep: () => {
      throw new Error("Specific error message");
    },
    onError: (error, _shared) => {
      capturedError = error;
      return undefined;
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(capturedError).not.toBeNull();
  expect(capturedError!.message).toBe("Specific error message");
});

// ============================================================================
// Edge Cases
// ============================================================================

test("Error in onError handler is propagated", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc>({
    prep: () => {
      throw new Error("First error");
    },
    onError: (_error, _shared) => {
      // Error handler itself throws
      throw new Error("Error in error handler");
    },
  });

  const flow = Flow.from(node);

  await expect(flow.run(shared)).rejects.toThrow("Error in error handler");
});

test("Flow continues after successful error recovery", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };

  const workflow = chain(
    new Node<SharedCalc>({
      name: "Step 1",
      prep: (s) => {
        s.result = 10;
        s.logs?.push("Step 1");
      },
    }),
    new Node<SharedCalc>({
      name: "Step 2 (fails)",
      prep: () => {
        throw new Error("Expected failure");
      },
      onError: (error, shared) => {
        shared.logs?.push("Step 2 error handled");
        return undefined; // Continue to next node
      },
    }),
    new Node<SharedCalc>({
      name: "Step 3",
      prep: (s) => {
        s.result += 5;
        s.logs?.push("Step 3");
      },
    }),
  );

  const flow = Flow.from(workflow);
  await flow.run(shared);

  expect(shared.logs).toEqual(["Step 1", "Step 2 error handled", "Step 3"]);
  expect(shared.result).toBe(15);
});
