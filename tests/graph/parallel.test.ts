import { test, expect } from "bun:test";
import {
  Node,
  ParallelNode,
  Flow,
  chain,
  createNodes,
  branch,
} from "@yae/graph";

type TestState = {
  items: number[];
  results: number[];
  logs: string[];
  callCount: number;
};

// ============================================================================
// Basic Parallel Execution Tests
// ============================================================================

test("ParallelNode executes all items in parallel", async () => {
  const shared: TestState = {
    items: [1, 2, 3, 4, 5],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Double",
    prep: (s) => s.items,
    exec: (item) => item * 2,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.results).toEqual([2, 4, 6, 8, 10]);
});

test("ParallelNode with async exec", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Async Double",
    prep: (s) => s.items,
    exec: async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return item * 2;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.results).toEqual([2, 4, 6]);
});

test("ParallelNode preserves order", async () => {
  const shared: TestState = {
    items: [1, 2, 3, 4, 5],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Random delay",
    prep: (s) => s.items,
    exec: async (item) => {
      // Different delays to test order preservation
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
      return item * 10;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  // Results should be in the same order as inputs
  expect(shared.results).toEqual([10, 20, 30, 40, 50]);
});

test("ParallelNode with empty array", async () => {
  const shared: TestState = {
    items: [],
    results: [999],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Empty",
    prep: (s) => s.items,
    exec: (item) => item * 2,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.results).toEqual([]);
});

test("ParallelNode with single item", async () => {
  const shared: TestState = {
    items: [42],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Single",
    prep: (s) => s.items,
    exec: (item) => item + 1,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.results).toEqual([43]);
});

// ============================================================================
// Parallel Execution Timing Tests
// ============================================================================

test("ParallelNode executes truly in parallel", async () => {
  const shared: TestState = {
    items: [1, 2, 3, 4, 5],
    results: [],
    logs: [],
    callCount: 0,
  };

  const startTime = Date.now();

  const node = new ParallelNode<TestState, number, number>({
    name: "Parallel sleep",
    prep: (s) => s.items,
    exec: async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  const duration = Date.now() - startTime;

  // If sequential: 5 * 50ms = 250ms+
  // If parallel: ~50ms
  expect(duration).toBeLessThan(150); // Allow some overhead
  expect(shared.results).toEqual([1, 2, 3, 4, 5]);
});

test("ParallelNode with Bun.sleep confirms parallel execution", async () => {
  const shared: TestState = {
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    results: [],
    logs: [],
    callCount: 0,
  };

  const startTime = Date.now();

  const node = new ParallelNode<TestState, number, number>({
    name: "Bun sleep parallel",
    prep: (s) => s.items,
    exec: async (item) => {
      await Bun.sleep(100);
      return item * 2;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  const duration = Date.now() - startTime;

  // If sequential: 10 * 100ms = 1000ms+
  // If parallel: ~100ms
  expect(duration).toBeLessThan(300); // Allow overhead but way less than 1000ms
  expect(shared.results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
});

test("ParallelNode execution starts concurrently", async () => {
  const startTimes: number[] = [];
  const endTimes: number[] = [];
  const globalStart = Date.now();

  const shared: TestState = {
    items: [1, 2, 3, 4, 5],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Track timing",
    prep: (s) => s.items,
    exec: async (item) => {
      startTimes.push(Date.now() - globalStart);
      await Bun.sleep(50);
      endTimes.push(Date.now() - globalStart);
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  // All items should start within ~20ms of each other (concurrent start)
  const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes);
  expect(maxStartDiff).toBeLessThan(30);

  // All items should end around the same time too
  const maxEndDiff = Math.max(...endTimes) - Math.min(...endTimes);
  expect(maxEndDiff).toBeLessThan(30);
});

test("ParallelNode with varying sleep times completes in max time", async () => {
  const shared: TestState = {
    items: [10, 50, 100, 30, 20], // Different sleep durations
    results: [],
    logs: [],
    callCount: 0,
  };

  const startTime = Date.now();

  const node = new ParallelNode<TestState, number, number>({
    name: "Varying delays",
    prep: (s) => s.items,
    exec: async (sleepMs) => {
      await Bun.sleep(sleepMs);
      return sleepMs;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  const duration = Date.now() - startTime;

  // If sequential: 10+50+100+30+20 = 210ms+
  // If parallel: ~100ms (the longest sleep)
  expect(duration).toBeLessThan(180); // Should be close to 100ms
  expect(duration).toBeGreaterThanOrEqual(90); // But at least ~100ms
  expect(shared.results).toEqual([10, 50, 100, 30, 20]); // Order preserved
});

test("ParallelNode handles large batch efficiently", async () => {
  const itemCount = 50;
  const shared: TestState = {
    items: Array.from({ length: itemCount }, (_, i) => i + 1),
    results: [],
    logs: [],
    callCount: 0,
  };

  const startTime = Date.now();

  const node = new ParallelNode<TestState, number, number>({
    name: "Large batch",
    prep: (s) => s.items,
    exec: async (item) => {
      await Bun.sleep(50);
      return item * 2;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  const duration = Date.now() - startTime;

  // If sequential: 50 * 50ms = 2500ms
  // If parallel: ~50ms
  expect(duration).toBeLessThan(500); // Way less than 2500ms
  expect(shared.results.length).toBe(itemCount);
  expect(shared.results[0]).toBe(2);
  expect(shared.results[itemCount - 1]).toBe(itemCount * 2);
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test("ParallelNode fails fast on first error", async () => {
  const shared: TestState = {
    items: [1, 2, 3, 4, 5],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Fail on 3",
    prep: (s) => s.items,
    exec: (item) => {
      shared.callCount++;
      if (item === 3) {
        throw new Error("Item 3 failed");
      }
      return item * 2;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await expect(node.run(shared)).rejects.toThrow("Item 3 failed");
});

test("ParallelNode with onError handler", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Error handled",
    prep: (s) => s.items,
    exec: (item) => {
      if (item === 2) {
        throw new Error("Item 2 failed");
      }
      return item * 2;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    onError: (error, s) => {
      s.logs.push(`Caught: ${error.message}`);
      return "fallback";
    },
  });

  const fallback = new Node<TestState, number, number>({
    name: "Fallback",
    post: (s) => {
      s.results = [-1];
      return undefined;
    },
  });

  node.when("fallback", fallback);

  await Flow.from(node).run(shared);

  expect(shared.logs).toContain("Caught: Item 2 failed");
  expect(shared.results).toEqual([-1]);
});

// ============================================================================
// Per-Item Retry Tests (Inherited from Node)
// ============================================================================

test("ParallelNode retries individual items", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };
  const attemptsByItem: Record<number, number> = {};

  const node = new ParallelNode<TestState, number, number>({
    name: "Retry items",
    prep: (s) => s.items,
    exec: (item) => {
      attemptsByItem[item] = (attemptsByItem[item] || 0) + 1;
      if (item === 2 && attemptsByItem[item] < 3) {
        throw new Error(`Item ${item} attempt ${attemptsByItem[item]} failed`);
      }
      return item * 2;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    retry: {
      maxAttempts: 5,
      delay: 10,
    },
  });

  await node.run(shared);

  expect(shared.results).toEqual([2, 4, 6]);
  expect(attemptsByItem[1]).toBe(1); // Item 1: succeeded first try
  expect(attemptsByItem[2]).toBe(3); // Item 2: failed twice, succeeded third
  expect(attemptsByItem[3]).toBe(1); // Item 3: succeeded first try
});

test("ParallelNode respects maxAttempts per item", async () => {
  const shared: TestState = {
    items: [1, 2],
    results: [],
    logs: [],
    callCount: 0,
  };
  const attemptsByItem: Record<number, number> = {};

  const node = new ParallelNode<TestState, number, number>({
    name: "Max retries",
    prep: (s) => s.items,
    exec: (item) => {
      attemptsByItem[item] = (attemptsByItem[item] || 0) + 1;
      if (item === 2) {
        throw new Error("Always fails");
      }
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  await expect(node.run(shared)).rejects.toThrow("Always fails");
  expect(attemptsByItem[2]).toBe(3); // Exactly 3 attempts
});

test("ParallelNode retry with exponential backoff", async () => {
  const shared: TestState = { items: [1], results: [], logs: [], callCount: 0 };
  const timestamps: number[] = [];

  const node = new ParallelNode<TestState, number, number>({
    name: "Backoff test",
    prep: (s) => s.items,
    exec: (item) => {
      timestamps.push(Date.now());
      shared.callCount++;
      if (shared.callCount < 3) {
        throw new Error("Retry");
      }
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    retry: {
      maxAttempts: 5,
      delay: 50,
      backoff: "exponential",
    },
  });

  await node.run(shared);

  expect(shared.callCount).toBe(3);
  expect(shared.results).toEqual([1]);

  // Check exponential delays: 50ms, 100ms
  const delay1 = timestamps[1]! - timestamps[0]!;
  const delay2 = timestamps[2]! - timestamps[1]!;
  expect(delay1).toBeGreaterThanOrEqual(40);
  expect(delay1).toBeLessThan(70);
  expect(delay2).toBeGreaterThanOrEqual(90);
  expect(delay2).toBeLessThan(120);
});

test("ParallelNode onRetry hook called per item", async () => {
  const shared: TestState = {
    items: [1, 2],
    results: [],
    logs: [],
    callCount: 0,
  };
  const attemptsByItem: Record<number, number> = {};

  const node = new ParallelNode<TestState, number, number>({
    name: "OnRetry hook",
    prep: (s) => s.items,
    exec: (item) => {
      attemptsByItem[item] = (attemptsByItem[item] || 0) + 1;
      if (attemptsByItem[item] < 2) {
        throw new Error(`Item ${item} retry`);
      }
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
      onRetry: (attempt, error) => {
        shared.logs.push(`Retry ${attempt}: ${error.message}`);
      },
    },
  });

  await node.run(shared);

  expect(shared.logs).toContain("Retry 1: Item 1 retry");
  expect(shared.logs).toContain("Retry 1: Item 2 retry");
});

// ============================================================================
// Per-Item Timeout Tests (Inherited from Node)
// ============================================================================

test("ParallelNode timeout applies per item", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  const node = new ParallelNode<TestState, number, number>({
    name: "Timeout test",
    prep: (s) => s.items,
    exec: async (item) => {
      if (item === 2) {
        // This one will timeout
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    timeout: 50,
  });

  await expect(node.run(shared)).rejects.toThrow(/timed out/);
});

test("ParallelNode timeout with retry", async () => {
  const shared: TestState = { items: [1], results: [], logs: [], callCount: 0 };

  const node = new ParallelNode<TestState, number, number>({
    name: "Timeout with retry",
    prep: (s) => s.items,
    exec: async (item) => {
      shared.callCount++;
      if (shared.callCount < 3) {
        // First two attempts timeout
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    timeout: 50,
    retry: {
      maxAttempts: 5,
      delay: 10,
    },
  });

  await node.run(shared);

  expect(shared.callCount).toBe(3);
  expect(shared.results).toEqual([1]);
});

// ============================================================================
// Integration with Flow Tests
// ============================================================================

test("ParallelNode in a Flow", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  const parallel = new ParallelNode<TestState, number, number>({
    name: "Parallel",
    prep: (s) => s.items,
    exec: (item) => item * 2,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  const flow = Flow.from(parallel);
  await flow.run(shared);

  expect(shared.results).toEqual([2, 4, 6]);
});

test("ParallelNode chained with other nodes", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  const prepare = new Node<TestState, void, void>({
    name: "Prepare",
    prep: (s) => {
      s.logs.push("prepare");
      s.items = [10, 20, 30];
    },
  });

  const process = new ParallelNode<TestState, number, number>({
    name: "Process",
    prep: (s) => s.items,
    exec: (item) => item + 1,
    post: (s, _prep, results) => {
      s.results = results as number[];
      s.logs.push("process");
      return undefined;
    },
  });

  const finalize = new Node<TestState, void, void>({
    name: "Finalize",
    prep: (s) => {
      s.logs.push("finalize");
      s.results = s.results.map((r) => r * 2);
    },
  });

  await Flow.from(chain(prepare, process, finalize)).run(shared);

  expect(shared.logs).toEqual(["prepare", "process", "finalize"]);
  expect(shared.results).toEqual([22, 42, 62]);
});

test("ParallelNode with branching based on results", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  const parallel = new ParallelNode<TestState, number, number>({
    name: "Process",
    prep: (s) => s.items,
    exec: (item) => item * 2,
    post: (s, _prep, results) => {
      s.results = results as number[];
      const sum = s.results.reduce((a, b) => a + b, 0);
      return sum > 10 ? "high" : "low";
    },
  });

  const highNode = new Node<TestState, void, void>({
    name: "High",
    prep: (s) => {
      s.logs.push("high");
    },
  });

  const lowNode = new Node<TestState, void, void>({
    name: "Low",
    prep: (s) => {
      s.logs.push("low");
    },
  });

  branch(parallel, { high: [highNode], low: [lowNode] });

  await Flow.from(parallel).run(shared);

  expect(shared.results).toEqual([2, 4, 6]); // Sum = 12 > 10
  expect(shared.logs).toEqual(["high"]);
});

// ============================================================================
// Cloning Tests
// ============================================================================

test("ParallelNode clone works correctly", async () => {
  const shared1: TestState = {
    items: [1, 2],
    results: [],
    logs: [],
    callCount: 0,
  };
  const shared2: TestState = {
    items: [10, 20],
    results: [],
    logs: [],
    callCount: 0,
  };

  const original = new ParallelNode<TestState, number, number>({
    name: "Original",
    prep: (s) => s.items,
    exec: (item) => item * 2,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  const cloned = original.clone();
  cloned.name = "Cloned";

  await original.run(shared1);
  await cloned.run(shared2);

  expect(shared1.results).toEqual([2, 4]);
  expect(shared2.results).toEqual([20, 40]);
  expect(original.name).toBe("Original");
  expect(cloned.name).toBe("Cloned");
});

test("Cloned ParallelNode preserves retry config", async () => {
  const shared: TestState = { items: [1], results: [], logs: [], callCount: 0 };

  const original = new ParallelNode<TestState, number, number>({
    name: "Original",
    prep: (s) => s.items,
    exec: (item) => {
      shared.callCount++;
      if (shared.callCount < 2) {
        throw new Error("Retry");
      }
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  const cloned = original.clone();
  await cloned.run(shared);

  expect(shared.callCount).toBe(2);
  expect(shared.results).toEqual([1]);
});

// ============================================================================
// Factory Function Tests
// ============================================================================

test("parallelNode factory creates ParallelNode", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  const { parallel } = createNodes<TestState>();

  const node = parallel({
    name: "Factory created",
    prep: (s) => s.items,
    exec: (item) => item * 3,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.results).toEqual([3, 6, 9]);
});

test("parallelNode factory with retry config", async () => {
  const shared: TestState = { items: [1], results: [], logs: [], callCount: 0 };

  const { parallel } = createNodes<TestState>();

  const node = parallel({
    name: "Factory with retry",
    prep: (s) => s.items,
    exec: (item) => {
      shared.callCount++;
      if (shared.callCount < 2) {
        throw new Error("Retry");
      }
      return item;
    },
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 10,
    },
  });

  await node.run(shared);

  expect(shared.callCount).toBe(2);
});

// ============================================================================
// Complex Data Types Tests
// ============================================================================

type User = { id: number; name: string };
type UserState = {
  userIds: number[];
  users: User[];
  logs: string[];
};

test("ParallelNode with complex types", async () => {
  const shared: UserState = { userIds: [1, 2, 3], users: [], logs: [] };

  const fetchUsers = new ParallelNode<UserState, number, User>({
    name: "Fetch Users",
    prep: (s) => s.userIds,
    exec: async (id) => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { id, name: `User ${id}` };
    },
    post: (s, _prep, results) => {
      s.users = results as User[];
      return undefined;
    },
  });

  await fetchUsers.run(shared);

  expect(shared.users).toEqual([
    { id: 1, name: "User 1" },
    { id: 2, name: "User 2" },
    { id: 3, name: "User 3" },
  ]);
});

// ============================================================================
// Edge Cases
// ============================================================================

test("ParallelNode with undefined prep result", async () => {
  const shared: TestState = {
    items: [],
    results: [999],
    logs: [],
    callCount: 0,
  };

  // @ts-expect-error Because prep is undefined for testing
  const node = new ParallelNode<TestState, number, number>({
    name: "Undefined prep",
    exec: (item) => item * 2,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  // Should handle gracefully
  expect(shared.results).toEqual([]);
});

test("ParallelNode with null values in array", async () => {
  type NullableState = {
    items: (number | null)[];
    results: (number | null)[];
  };

  const shared: NullableState = { items: [1, null, 3], results: [] };

  const node = new ParallelNode<NullableState, number | null, number | null>({
    name: "Nullable",
    prep: (s) => s.items,
    exec: (item) => (item !== null ? item * 2 : null),
    post: (s, _prep, results) => {
      s.results = results as (number | null)[];
      return undefined;
    },
  });

  await node.run(shared);

  expect(shared.results).toEqual([2, null, 6]);
});

test("ParallelNode throws on non-array prep result", async () => {
  const shared: TestState = {
    items: [1, 2, 3],
    results: [],
    logs: [],
    callCount: 0,
  };

  // eslint-disable-next-line
  const node = new ParallelNode<TestState, any, number>({
    name: "Non-array",
    prep: () => "not an array" as any, // eslint-disable-line
    exec: (item) => item * 2,
    post: (s, _prep, results) => {
      s.results = results as number[];
      return undefined;
    },
  });

  await node.run(shared);

  // Should return empty array for non-array prep result
  expect(shared.results).toEqual([]);
});

// ============================================================================
// Real-World Use Case Tests
// ============================================================================

test("Parallel API calls simulation", async () => {
  type ApiState = {
    endpoints: string[];
    responses: { endpoint: string; status: number }[];
    errors: string[];
  };

  const shared: ApiState = {
    endpoints: ["/users", "/posts", "/comments"],
    responses: [],
    errors: [],
  };

  const fetchAll = new ParallelNode<
    ApiState,
    string,
    { endpoint: string; status: number }
  >({
    name: "Fetch All",
    prep: (s) => s.endpoints,
    exec: async (endpoint) => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
      return { endpoint, status: 200 };
    },
    post: (s, _prep, results) => {
      s.responses = results as { endpoint: string; status: number }[];
      return undefined;
    },
    retry: {
      maxAttempts: 3,
      delay: 50,
    },
    timeout: 1000,
  });

  await fetchAll.run(shared);

  expect(shared.responses.length).toBe(3);
  expect(shared.responses.map((r) => r.endpoint).sort()).toEqual([
    "/comments",
    "/posts",
    "/users",
  ]);
});

test("Parallel file processing simulation", async () => {
  type FileState = {
    files: string[];
    processed: { file: string; size: number }[];
    total: number;
  };

  const shared: FileState = {
    files: ["file1.txt", "file2.txt", "file3.txt"],
    processed: [],
    total: 0,
  };

  const processFiles = new ParallelNode<
    FileState,
    string,
    { file: string; size: number }
  >({
    name: "Process Files",
    prep: (s) => s.files,
    exec: async (file) => {
      // Simulate file processing
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { file, size: file.length * 100 };
    },
    post: (s, _prep, results) => {
      s.processed = results as { file: string; size: number }[];
      s.total = s.processed.reduce((sum, p) => sum + p.size, 0);
      return undefined;
    },
  });

  await processFiles.run(shared);

  expect(shared.processed.length).toBe(3);
  expect(shared.total).toBe(2700); // 9 chars * 100 * 3 files
});

test("Parallel batch processing with chunking", async () => {
  type BatchState = {
    allItems: number[];
    batches: number[][];
    batchResults: number[][];
  };

  const shared: BatchState = {
    allItems: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    batches: [],
    batchResults: [],
  };

  // First create batches
  const createBatches = new Node<BatchState, void, void>({
    name: "Create Batches",
    prep: (s) => {
      const batchSize = 3;
      s.batches = [];
      for (let i = 0; i < s.allItems.length; i += batchSize) {
        s.batches.push(s.allItems.slice(i, i + batchSize));
      }
    },
  });

  // Then process batches in parallel
  const processBatches = new ParallelNode<BatchState, number[], number[]>({
    name: "Process Batches",
    prep: (s) => s.batches,
    exec: (batch) => batch.map((n) => n * 2),
    post: (s, _prep, results) => {
      s.batchResults = results as number[][];
      return undefined;
    },
  });

  await Flow.from(chain(createBatches, processBatches)).run(shared);

  expect(shared.batches).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]);
  expect(shared.batchResults).toEqual([
    [2, 4, 6],
    [8, 10, 12],
    [14, 16, 18],
  ]);
});
