import { test, expect } from "bun:test";
import { Node, ParallelNode, Flow, chain, branch } from "@yae/graph";

type SharedCalc = {
  result: number;
  attempts?: number;
  logs?: string[];
  callCount?: number;
};

// ============================================================================
// Basic Retry Tests
// ============================================================================

test("Node without retry config works like BaseNode", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc>({
    name: "Simple node",
    prep: (s) => {
      s.result = 42;
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.result).toBe(42);
});

test("Node retries on failure and eventually succeeds", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0 };

  const node = new Node<SharedCalc, SharedCalc>({
    name: "Flaky operation",
    prep: (s: SharedCalc): SharedCalc => {
      return s;
    },
    exec: (s) => {
      s.callCount = (s.callCount || 0) + 1;
      if (s.callCount < 3) {
        throw new Error("Not yet!");
      }
      s.result = 100;
    },
    retry: {
      maxAttempts: 5,
      delay: 10, // Small delay for fast tests
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.callCount).toBe(3);
  expect(shared.result).toBe(100);
});

test("Node fails after max retries exhausted", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0 };
  let calls = 0;

  const node = new Node<SharedCalc>({
    name: "Always fails",
    exec: () => {
      calls += 1;
      throw new Error("Always fails");
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  const flow = Flow.from(node);

  await expect(flow.run(shared)).rejects.toThrow("Always fails");
  expect(calls).toBe(3);
});

test("onRetry hook is called on each retry", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0, logs: [] };
  let calls = 0;

  const node = new Node<SharedCalc, void, number>({
    name: "Flaky operation",
    exec: () => {
      calls += 1;
      if (calls < 3) {
        throw new Error(`Attempt ${calls} failed`);
      }
      return 100;
    },
    post: (shared, prepResult, execResult) => {
      shared.result = execResult;
      return undefined;
    },
    retry: {
      maxAttempts: 5,
      delay: 10,
      onRetry: (attempt, error) => {
        shared.logs?.push(`Retry ${attempt}: ${error.message}`);
      },
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.logs).toEqual([
    "Retry 1: Attempt 1 failed",
    "Retry 2: Attempt 2 failed",
  ]);
  expect(shared.result).toBe(100);
});

// ============================================================================
// Backoff Strategy Tests
// ============================================================================

test("Linear backoff delays increase linearly", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0 };
  const timestamps: number[] = [];

  const node = new Node<SharedCalc>({
    name: "Always fails",
    exec: () => {
      timestamps.push(Date.now());
      throw new Error("Fail");
    },
    retry: {
      maxAttempts: 3,
      delay: 50, // 50ms base delay
      backoff: "linear",
    },
  });

  const flow = Flow.from(node);
  await expect(flow.run(shared)).rejects.toThrow("Fail");

  // Linear: 50ms, 100ms
  expect(timestamps.length).toBe(3);
  const delay1 = timestamps[1]! - timestamps[0]!;
  const delay2 = timestamps[2]! - timestamps[1]!;

  // Allow some variance due to JS timing
  expect(delay1).toBeGreaterThanOrEqual(40);
  expect(delay1).toBeLessThan(70);
  expect(delay2).toBeGreaterThanOrEqual(90);
  expect(delay2).toBeLessThan(120);
});

test("Exponential backoff delays increase exponentially", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0 };
  const timestamps: number[] = [];

  const node = new Node<SharedCalc>({
    name: "Always fails",
    exec: () => {
      timestamps.push(Date.now());
      throw new Error("Fail");
    },
    retry: {
      maxAttempts: 3,
      delay: 50, // 50ms base delay
      backoff: "exponential",
    },
  });

  const flow = Flow.from(node);
  await expect(flow.run(shared)).rejects.toThrow("Fail");

  // Exponential: 50ms, 100ms (2^0=1, 2^1=2)
  expect(timestamps.length).toBe(3);
  const delay1 = timestamps[1]! - timestamps[0]!;
  const delay2 = timestamps[2]! - timestamps[1]!;

  expect(delay1).toBeGreaterThanOrEqual(40);
  expect(delay1).toBeLessThan(70);
  expect(delay2).toBeGreaterThanOrEqual(90);
  expect(delay2).toBeLessThan(120);
});

test("Default delay is 1000ms", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0 };
  const startTime = Date.now();
  let calls = 0;

  const node = new Node<SharedCalc, void, number>({
    name: "Fails twice",
    exec: () => {
      calls += 1;
      if (calls < 2) {
        throw new Error("Fail");
      }
      return 100;
    },
    post: (shared, prepResult, execResult) => {
      shared.result = execResult;
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      // No delay specified - should default to 1000ms
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  const duration = Date.now() - startTime;

  // Should take at least 1000ms (one retry with default delay)
  expect(duration).toBeGreaterThanOrEqual(900);
  expect(shared.result).toBe(100);
});

// ============================================================================
// Integration with Error Handling
// ============================================================================

test("Retry with onError handler - error handler called after retries exhausted", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0, logs: [] };
  let calls = 0;

  const node = new Node<SharedCalc>({
    name: "Fails then handles",
    exec: () => {
      calls += 1;
      throw new Error("Always fails");
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
    onError: (error, shared) => {
      shared.logs?.push("Error handler called");
      shared.result = -1;
      return "fallback";
    },
  });

  const fallbackNode = new Node<SharedCalc>({
    name: "Fallback",
    prep: (s) => {
      s.result = 999;
      s.logs?.push("Fallback executed");
    },
  });

  node.when("fallback", fallbackNode);

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(calls).toBe(3); // All retries attempted
  expect(shared.logs).toEqual(["Error handler called", "Fallback executed"]);
  expect(shared.result).toBe(999);
});

test("Retry with onError that routes based on error", async () => {
  const shared: SharedCalc = { result: 0 };
  let calls = 0;

  const node = new Node<SharedCalc>({
    name: "Network call",
    exec: () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("NETWORK_ERROR: Connection timeout");
      }
      if (calls === 2) {
        throw new Error("NETWORK_ERROR: Connection refused");
      }
      throw new Error("AUTH_ERROR: Unauthorized");
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
    onError: (error, _shared) => {
      if (error.message.includes("AUTH_ERROR")) {
        return "auth_error";
      }
      return "network_error";
    },
  });

  const authHandler = new Node<SharedCalc>({
    prep: (s) => {
      s.result = 401;
    },
  });

  const networkHandler = new Node<SharedCalc>({
    prep: (s) => {
      s.result = 503;
    },
  });

  branch(node, {
    auth_error: [authHandler],
    network_error: [networkHandler],
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(calls).toBe(3);
  expect(shared.result).toBe(401); // Auth error
});

// ============================================================================
// Retry in Workflows
// ============================================================================

test("Retry node in a chain", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };
  let calls = 0;

  const workflow = chain(
    new Node<SharedCalc>({
      name: "Step 1",
      prep: (s) => {
        s.result = 10;
        s.logs?.push("Step 1");
      },
    }),
    new Node<SharedCalc>({
      name: "Step 2 (retries)",
      exec: () => {
        calls += 1;
        if (calls < 2) {
          throw new Error("Retry me");
        }
      },
      post: (s, _p, _e) => {
        s.result += 5;
        s.logs?.push("Step 2");

        return undefined;
      },
      retry: {
        maxAttempts: 3,
        delay: 10,
      },
    }),
    new Node<SharedCalc>({
      name: "Step 3",
      prep: (s) => {
        s.result *= 2;
        s.logs?.push("Step 3");
      },
    }),
  );

  const flow = Flow.from(workflow);
  await flow.run(shared);

  expect(calls).toBe(2);
  expect(shared.logs).toEqual(["Step 1", "Step 2", "Step 3"]);
  expect(shared.result).toBe(30); // (10 + 5) * 2
});

test("Multiple retry nodes in workflow", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };
  let call1 = 0;
  let call2 = 0;

  const workflow = chain(
    new Node<SharedCalc>({
      name: "Retry node 1",
      exec: () => {
        call1++;
        if (call1 < 2) throw new Error("Fail 1");
      },
      post: (s, _p, _e) => {
        s.result = 10;
        s.logs?.push("Node 1 succeeded");

        return undefined;
      },
      retry: { maxAttempts: 3, delay: 10 },
    }),
    new Node<SharedCalc>({
      name: "Retry node 2",
      exec: () => {
        call2++;
        if (call2 < 3) throw new Error("Fail 2");
      },
      post: (s, _p, _e) => {
        s.result += 20;
        s.logs?.push("Node 2 succeeded");

        return undefined;
      },
      retry: { maxAttempts: 5, delay: 10 },
    }),
  );

  const flow = Flow.from(workflow);
  await flow.run(shared);

  expect(call1).toBe(2);
  expect(call2).toBe(3);
  expect(shared.result).toBe(30);
  expect(shared.logs).toEqual(["Node 1 succeeded", "Node 2 succeeded"]);
});

// ============================================================================
// Edge Cases
// ============================================================================

test("maxAttempts of 1 means no retries", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0 };

  const node = new Node<SharedCalc>({
    name: "No retry",
    prep: (s) => {
      s.callCount = (s.callCount || 0) + 1;
      throw new Error("Fail");
    },
    retry: {
      maxAttempts: 1,
      delay: 10,
    },
  });

  const flow = Flow.from(node);
  await expect(flow.run(shared)).rejects.toThrow("Fail");
  expect(shared.callCount).toBe(1); // Only one attempt, no retries
});

test("Retry succeeds on first attempt", async () => {
  const shared: SharedCalc = { result: 0, callCount: 0, logs: [] };

  const node = new Node<SharedCalc>({
    name: "Succeeds immediately",
    prep: (s) => {
      s.callCount = (s.callCount || 0) + 1;
      s.result = 100;
    },
    retry: {
      maxAttempts: 5,
      delay: 10,
      onRetry: (attempt) => {
        shared.logs?.push(`Retry ${attempt}`);
      },
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.callCount).toBe(1);
  expect(shared.result).toBe(100);
  expect(shared.logs).toEqual([]); // onRetry never called
});

test("Error in exec is retried", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc, { value: number }, { value: number }>({
    name: "Exec fails",
    prep: (_s) => {
      return { value: 42 };
    },
    exec: (prepResult) => {
      shared.callCount = (shared.callCount || 0) + 1;
      if (shared.callCount < 2) {
        throw new Error("Exec failed");
      }
      return prepResult;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.callCount).toBe(2);
});

test("onRetry hook can be async", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };
  let calls = 0;

  const node = new Node<SharedCalc>({
    name: "Async retry hook",
    exec: () => {
      calls += 1;
      if (calls < 3) {
        throw new Error("Retry");
      }
    },
    post: (s, _p, _e) => {
      s.result = 100;
      return undefined;
    },
    retry: {
      maxAttempts: 5,
      delay: 10,
      onRetry: async (attempt, _error) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        shared.logs?.push(`Async retry ${attempt}`);
      },
    },
  });

  const flow = Flow.from(node);
  await flow.run(shared);

  expect(shared.logs).toEqual(["Async retry 1", "Async retry 2"]);
});

test("Retry with branching after failure", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };
  let calls = 0;

  const retryNode = new Node<SharedCalc>({
    name: "Retry then route",
    exec: () => {
      calls += 1;
      throw new Error("Always fails");
    },
    retry: {
      maxAttempts: 2,
      delay: 10,
      onRetry: (attempt) => {
        shared.logs?.push(`Retry ${attempt}`);
      },
    },
    onError: (error, s) => {
      s.logs?.push("Routing after retries");
      return "recovery";
    },
  });

  const recoveryNode = new Node<SharedCalc>({
    prep: (s) => {
      s.result = 999;
      s.logs?.push("Recovery");
    },
  });

  retryNode.when("recovery", recoveryNode);

  const flow = Flow.from(retryNode);
  await flow.run(shared);

  expect(calls).toBe(2);
  expect(shared.logs).toEqual(["Retry 1", "Routing after retries", "Recovery"]);
  expect(shared.result).toBe(999);
});

// ============================================================================
// Cloning with Retry Config
// ============================================================================

test("Cloned retry node maintains retry config", async () => {
  const shared: SharedCalc = { result: 0 };
  let calls = 0;

  const node = new Node<SharedCalc>({
    name: "Original",
    exec: () => {
      calls += 1;
      if (calls < 2) throw new Error("Retry");
    },
    post: (s, _p, _e) => {
      s.result = 100;
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  const cloned = node.clone();

  const flow = Flow.from(cloned);
  await flow.run(shared);

  expect(calls).toBe(2);
  expect(shared.result).toBe(100);
});

// ============================================================================
// Flow-Level Monitoring with Retries
// ============================================================================

test("Flow onError sees retry attempts", async () => {
  const shared: SharedCalc = { result: 0, logs: [] };
  let calls = 0;

  const node = new Node<SharedCalc>({
    name: "Retrying node",
    exec: () => {
      calls += 1;
      if (calls < 3) {
        throw new Error(`Attempt ${calls}`);
      }
    },
    post: (s, _p, _e) => {
      s.result = 100;
      return undefined;
    },
    retry: {
      maxAttempts: 5,
      delay: 10,
    },
  });

  const flow = Flow.from(node, {
    onNodeExecute: (node, _action) => {
      shared.logs?.push(`Node executed: ${node.name}`);
    },
    onError: (error, node, shared) => {
      // This should NOT be called because retries succeed
      shared.logs?.push(`Flow error: ${error.message}`);
    },
  });

  await flow.run(shared);

  expect(calls).toBe(3);
  expect(shared.result).toBe(100);
  expect(shared.logs).toEqual(["Node executed: Retrying node"]);
});

// ============================================================================
// Fallback Config Tests
// ============================================================================

test("Config fallback returns recovery value after retries exhausted", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc, number, number>({
    name: "Fails with fallback",
    prep: () => 42,
    exec: () => {
      throw new Error("Always fails");
    },
    post: (s, _p, execResult) => {
      s.result = execResult;
      return undefined;
    },
    retry: { maxAttempts: 2, delay: 10, fallback: () => -1 },
  });

  await Flow.from(node).run(shared);
  expect(shared.result).toBe(-1);
});

test("Config fallback receives correct prepResult and error", async () => {
  const shared: SharedCalc = { result: 0 };
  let receivedPrep: number | undefined;
  let receivedError: Error | undefined;

  const node = new Node<SharedCalc, number, number>({
    prep: () => 99,
    exec: () => {
      throw new Error("specific failure");
    },
    post: (s, _p, e) => {
      s.result = e;
      return undefined;
    },
    retry: {
      maxAttempts: 1,
      delay: 10,
      fallback: (prepResult, error) => {
        receivedPrep = prepResult;
        receivedError = error;
        return 0;
      },
    },
  });

  await Flow.from(node).run(shared);

  expect(receivedPrep).toBe(99);
  expect(receivedError?.message).toBe("specific failure");
});

test("Config fallback not called when exec succeeds", async () => {
  const shared: SharedCalc = { result: 0 };
  let fallbackCalled = false;

  const node = new Node<SharedCalc, void, number>({
    exec: () => 42,
    post: (s, _p, e) => {
      s.result = e;
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
      fallback: () => {
        fallbackCalled = true;
        return -1;
      },
    },
  });

  await Flow.from(node).run(shared);

  expect(shared.result).toBe(42);
  expect(fallbackCalled).toBe(false);
});

test("Config fallback not called when retry succeeds before exhaustion", async () => {
  const shared: SharedCalc = { result: 0 };
  let calls = 0;
  let fallbackCalled = false;

  const node = new Node<SharedCalc, void, number>({
    exec: () => {
      calls++;
      if (calls < 2) throw new Error("Fail once");
      return 100;
    },
    post: (s, _p, e) => {
      s.result = e;
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
      fallback: () => {
        fallbackCalled = true;
        return -1;
      },
    },
  });

  await Flow.from(node).run(shared);

  expect(shared.result).toBe(100);
  expect(fallbackCalled).toBe(false);
});

test("Config fallback can throw to propagate error", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc>({
    exec: () => {
      throw new Error("original");
    },
    retry: {
      maxAttempts: 1,
      delay: 10,
      fallback: (_prep, _error) => {
        throw new Error("fallback error");
      },
    },
  });

  await expect(Flow.from(node).run(shared)).rejects.toThrow("fallback error");
});

test("Config fallback can be async", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc, void, number>({
    exec: () => {
      throw new Error("Fail");
    },
    post: (s, _p, e) => {
      s.result = e;
      return undefined;
    },
    retry: {
      maxAttempts: 1,
      delay: 10,
      fallback: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 777;
      },
    },
  });

  await Flow.from(node).run(shared);
  expect(shared.result).toBe(777);
});

test("No fallback config defaults to rethrowing error", async () => {
  const shared: SharedCalc = { result: 0 };

  const node = new Node<SharedCalc>({
    exec: () => {
      throw new Error("should propagate");
    },
    retry: { maxAttempts: 2, delay: 10 },
  });

  await expect(Flow.from(node).run(shared)).rejects.toThrow("should propagate");
});

test("ParallelNode with config fallback recovers per item", async () => {
  type S = { results: number[] };
  const shared: S = { results: [] };

  const node = new ParallelNode<S, number, number>({
    name: "Parallel fallback",
    prep: () => [1, 2, 3],
    exec: (item) => {
      if (item === 2) throw new Error("Item 2 fails");
      return item * 10;
    },
    post: (s, _p, results) => {
      s.results = results;
      return undefined;
    },
    retry: { maxAttempts: 1, delay: 10, fallback: (item) => item * -1 },
  });

  await Flow.from(node).run(shared);

  expect(shared.results).toEqual([10, -2, 30]);
});
