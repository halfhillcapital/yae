import { test, expect } from "bun:test";
import { Node, Flow, chain } from "@yae/graph";

type SharedState = {
  result: number;
  logs?: string[];
  callCount?: number;
};

// ============================================================================
// Basic Timeout Tests
// ============================================================================

test("Node times out when exec exceeds timeout", async () => {
  const shared: SharedState = { result: 0 };

  const node = new Node<SharedState, void, number>({
    name: "Slow",
    exec: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 42;
    },
    timeout: 50,
  });

  const flow = Flow.from(node);

  await expect(flow.run(shared)).rejects.toThrow(
    "Node <Slow> timed out after 50ms",
  );
});

test("Node completes when exec finishes before timeout", async () => {
  const shared: SharedState = { result: 0 };

  const node = new Node<SharedState, void, number>({
    name: "Fast exec",
    exec: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 42;
    },
    post: (s, _prep, execResult) => {
      s.result = execResult as number;
      return undefined;
    },
    timeout: 100,
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(42);
});

test("Node without timeout has no time limit", async () => {
  const shared: SharedState = { result: 0 };

  const node = new Node<SharedState, void, number>({
    name: "No timeout",
    exec: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 100;
    },
    post: (s, _prep, execResult) => {
      s.result = execResult as number;
      return undefined;
    },
    // No timeout specified
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(100);
});

// ============================================================================
// Timeout with Error Handling
// ============================================================================

test("Timeout error can be caught by onError handler", async () => {
  const shared: SharedState = { result: 0, logs: [] };

  const node = new Node<SharedState, void, number>({
    name: "Timeout",
    exec: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 42;
    },
    timeout: 50,
    onError: (error, s) => {
      s.logs?.push(`Caught: ${error.message}`);
      s.result = -1;
      return "timeout_fallback";
    },
  });

  const fallbackNode = new Node<SharedState>({
    name: "Fallback",
    prep: (s) => {
      s.logs?.push("Fallback executed");
      s.result = 999;
    },
  });

  node.when("timeout_fallback", fallbackNode);

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.logs).toEqual([
    "Caught: Node <Timeout> timed out after 50ms",
    "Fallback executed",
  ]);
  expect(shared.result).toBe(999);
});

// ============================================================================
// Timeout with Retry
// ============================================================================

test("Timeout triggers retry", async () => {
  const shared: SharedState = { result: 0, callCount: 0 };

  const node = new Node<SharedState, void, number>({
    name: "Timeout then succeed",
    exec: async () => {
      shared.callCount = (shared.callCount || 0) + 1;
      if (shared.callCount < 2) {
        // First attempt: too slow
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      // Second attempt: fast enough
      return 42;
    },
    post: (s, _prep, execResult) => {
      s.result = execResult as number;
      return undefined;
    },
    timeout: 50,
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.callCount).toBe(2);
  expect(shared.result).toBe(42);
});

test("Timeout retry exhaustion calls onError", async () => {
  const shared: SharedState = { result: 0, callCount: 0, logs: [] };

  const node = new Node<SharedState, void, number>({
    name: "Always times out",
    exec: async () => {
      shared.callCount = (shared.callCount || 0) + 1;
      // Always too slow
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 42;
    },
    timeout: 50,
    retry: {
      maxAttempts: 3,
      delay: 10,
      onRetry: (attempt, error) => {
        shared.logs?.push(`Retry ${attempt}: ${error.message}`);
      },
    },
    onError: (error, s) => {
      s.logs?.push(`Final error: ${error.message}`);
      s.result = -1;
      return undefined;
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.callCount).toBe(3);
  expect(shared.logs).toEqual([
    "Retry 1: Node <Always times out> timed out after 50ms",
    "Retry 2: Node <Always times out> timed out after 50ms",
    "Final error: Node <Always times out> timed out after 50ms",
  ]);
  expect(shared.result).toBe(-1);
});

// ============================================================================
// Timeout in Workflows
// ============================================================================

test("Timeout node in a chain", async () => {
  const shared: SharedState = { result: 0, logs: [] };

  const workflow = chain(
    new Node<SharedState>({
      name: "Step 1",
      prep: (s) => {
        s.result = 10;
        s.logs?.push("Step 1");
      },
    }),
    new Node<SharedState, number, number>({
      name: "Step 2 (with timeout)",
      exec: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 5;
      },
      post: (s, _prep, execResult) => {
        s.result += execResult as number;
        s.logs?.push("Step 2");
        return undefined;
      },
      timeout: 100, // Plenty of time
    }),
    new Node<SharedState>({
      name: "Step 3",
      prep: (s) => {
        s.result *= 2;
        s.logs?.push("Step 3");
      },
    }),
  );

  const flow = Flow.from(workflow);
  await flow.run(shared);

  expect(shared.logs).toEqual(["Step 1", "Step 2", "Step 3"]);
  expect(shared.result).toBe(30); // (10 + 5) * 2
});

test("Timeout failure stops workflow", async () => {
  const shared: SharedState = { result: 0, logs: [] };

  const workflow = chain(
    new Node<SharedState>({
      name: "Step 1",
      prep: (s) => {
        s.result = 10;
        s.logs?.push("Step 1");
      },
    }),
    new Node<SharedState, number, number>({
      name: "Step 2 (times out)",
      exec: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 5;
      },
      timeout: 50,
    }),
    new Node<SharedState>({
      name: "Step 3 (never reached)",
      prep: (s) => {
        s.logs?.push("Step 3");
      },
    }),
  );

  const flow = Flow.from(workflow);

  await expect(flow.run(shared)).rejects.toThrow(
    "Node <Step 2 (times out)> timed out after 50ms",
  );
  expect(shared.logs).toEqual(["Step 1"]);
  expect(shared.result).toBe(10);
});

// ============================================================================
// Cloning with Timeout
// ============================================================================

test("Cloned node maintains timeout config", async () => {
  const shared: SharedState = { result: 0 };

  const node = new Node<SharedState, void, number>({
    name: "Original",
    exec: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 42;
    },
    timeout: 50,
  });

  const cloned = node.clone();

  const flow = Flow.from(cloned);

  await expect(flow.run(shared)).rejects.toThrow(
    "Node <Original> timed out after 50ms",
  );
});

// ============================================================================
// Edge Cases
// ============================================================================

test("Timeout of 0 is treated as no timeout (falsy)", async () => {
  const shared: SharedState = { result: 0 };

  const node = new Node<SharedState, void, number>({
    name: "Zero timeout",
    exec: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 42;
    },
    post: (s, _prep, execResult) => {
      s.result = execResult as number;
      return undefined;
    },
    timeout: 0, // Falsy - treated as no timeout
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  // Completes despite delay because timeout: 0 is falsy
  expect(shared.result).toBe(42);
});

test("Sync exec with timeout still works", async () => {
  const shared: SharedState = { result: 0 };

  const node = new Node<SharedState, void, number>({
    name: "Sync exec",
    exec: () => {
      // Synchronous - completes immediately
      return 42;
    },
    post: (s, _prep, execResult) => {
      s.result = execResult as number;
      return undefined;
    },
    timeout: 50,
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(42);
});

test("Timeout only applies to exec, not prep or post", async () => {
  const shared: SharedState = { result: 0, logs: [] };

  const node = new Node<SharedState, number, number>({
    name: "Slow prep and post",
    prep: async (s) => {
      // Slow prep - should NOT be timed out
      await new Promise((resolve) => setTimeout(resolve, 100));
      s.logs?.push("prep done");
      return 10;
    },
    exec: (prepResult) => {
      // Fast exec
      return (prepResult as number) * 2;
    },
    post: async (s, _prep, execResult) => {
      // Slow post - should NOT be timed out
      await new Promise((resolve) => setTimeout(resolve, 100));
      s.result = execResult as number;
      s.logs?.push("post done");
      return undefined;
    },
    timeout: 50, // Only applies to exec
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.logs).toEqual(["prep done", "post done"]);
  expect(shared.result).toBe(20);
});
