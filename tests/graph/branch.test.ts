import { test, expect } from "bun:test";
import { BaseNode, Flow, branch, chain, node, sequential } from "@yae/graph";

type TestState = {
  value: number;
  executed: string[];
};

// ============================================================================
// branch() Utility Function Tests
// ============================================================================

test("branch creates routing from start to multiple paths converging at end", async () => {
  const shared: TestState = { value: 10, executed: [] };

  const router = new BaseNode<TestState>({
    name: "Router",
    prep: (s) => {
      s.executed.push("router");
    },
    post: (s) => (s.value > 5 ? "high" : "low"),
  });

  const highPath = new BaseNode<TestState>({
    name: "High Path",
    prep: (s) => {
      s.executed.push("high");
      s.value += 100;
    },
  });

  const lowPath = new BaseNode<TestState>({
    name: "Low Path",
    prep: (s) => {
      s.executed.push("low");
      s.value -= 100;
    },
  });

  const end = new BaseNode<TestState>({
    name: "End",
    prep: (s) => {
      s.executed.push("end");
    },
  });

  branch(router, { high: [highPath], low: [lowPath] }, end);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["router", "high", "end"]);
  expect(shared.value).toBe(110);
});

test("branch with multi-node routes", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const router = new BaseNode<TestState>({
    name: "Router",
    post: () => "process",
  });

  const step1 = new BaseNode<TestState>({
    name: "Step 1",
    prep: (s) => {
      s.executed.push("step1");
      s.value = 10;
    },
  });

  const step2 = new BaseNode<TestState>({
    name: "Step 2",
    prep: (s) => {
      s.executed.push("step2");
      s.value *= 2;
    },
  });

  const step3 = new BaseNode<TestState>({
    name: "Step 3",
    prep: (s) => {
      s.executed.push("step3");
      s.value += 5;
    },
  });

  const end = new BaseNode<TestState>({
    name: "End",
    prep: (s) => {
      s.executed.push("end");
    },
  });

  branch(router, { process: [step1, step2, step3] }, end);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["step1", "step2", "step3", "end"]);
  expect(shared.value).toBe(25); // (10 * 2) + 5
});

test("branch returns the end node", () => {
  const start = new BaseNode<TestState>({ name: "Start" });
  const pathA = new BaseNode<TestState>({ name: "Path A" });
  const end = new BaseNode<TestState>({ name: "End" });

  const result = branch(start, { action: [pathA] }, end);

  expect(result).toBe(end);
});

test("branch throws on empty routes object", () => {
  const start = new BaseNode<TestState>();
  const end = new BaseNode<TestState>();

  expect(() => branch(start, {}, end)).toThrow(
    "branch() requires at least one route",
  );
});

test("branch throws on empty route array with action name", () => {
  const start = new BaseNode<TestState>();
  const end = new BaseNode<TestState>();

  expect(() => branch(start, { myAction: [] }, end)).toThrow(
    'branch() route "myAction" cannot be empty',
  );
});

test("branch with single route", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const router = new BaseNode<TestState>({
    post: () => "only",
  });

  const onlyPath = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("only");
    },
  });

  const end = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  branch(router, { only: [onlyPath] }, end);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["only", "end"]);
});

test("branch allows chaining after end node", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const router = new BaseNode<TestState>({
    post: () => "path",
  });

  const pathNode = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("path");
    },
  });

  const end = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  const afterEnd = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("after");
    },
  });

  branch(router, { path: [pathNode] }, end).to(afterEnd);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["path", "end", "after"]);
});

test("branch with typed node factory", async () => {
  type CalcState = {
    input: number;
    output: number;
    path: string;
  };

  const shared: CalcState = { input: 15, output: 0, path: "" };

  const router = node<CalcState>()({
    name: "Router",
    prep: (s) => s.input,
    exec: (input) => (input > 10 ? "big" : "small"),
    post: (s, _prep, result) => {
      s.path = result;
      return result;
    },
  });

  const bigCalc = node<CalcState>()({
    name: "Big Calc",
    prep: (s) => s.input,
    exec: (input) => input * 10,
    post: (s, _prep, result) => {
      s.output = result;
      return undefined;
    },
  });

  const smallCalc = node<CalcState>()({
    name: "Small Calc",
    prep: (s) => s.input,
    exec: (input) => input * 2,
    post: (s, _prep, result) => {
      s.output = result;
      return undefined;
    },
  });

  const end = new BaseNode<CalcState>({ name: "End" });

  branch(router, { big: [bigCalc], small: [smallCalc] }, end);

  await Flow.from(router).run(shared);

  expect(shared.path).toBe("big");
  expect(shared.output).toBe(150);
});

test("branch routes do not interfere with each other", async () => {
  // Run two separate flows with different routing outcomes
  const router = new BaseNode<TestState>({
    post: (s) => (s.value > 0 ? "positive" : "negative"),
  });

  const positive = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("positive");
    },
  });

  const negative = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("negative");
    },
  });

  const end = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  branch(router, { positive: [positive], negative: [negative] }, end);

  // Test positive path
  const shared1: TestState = { value: 5, executed: [] };
  await Flow.from(router).run(shared1);
  expect(shared1.executed).toEqual(["positive", "end"]);

  // Test negative path
  const shared2: TestState = { value: -5, executed: [] };
  await Flow.from(router).run(shared2);
  expect(shared2.executed).toEqual(["negative", "end"]);
});

// ============================================================================
// Nested branch() Tests
// ============================================================================

test("nested branches - connect inner end to outer end using return value", async () => {
  type NestedState = {
    level1: string;
    level2: string;
    executed: string[];
  };

  const shared: NestedState = { level1: "a", level2: "x", executed: [] };

  const outerRouter = new BaseNode<NestedState>({
    name: "Outer Router",
    prep: (s) => {
      s.executed.push("outer-router");
    },
    post: (s) => s.level1,
  });

  // Inner branch for route "a"
  const innerRouterA = new BaseNode<NestedState>({
    name: "Inner Router A",
    prep: (s) => {
      s.executed.push("inner-router-a");
    },
    post: (s) => s.level2,
  });

  const pathAX = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("a-x");
    },
  });

  const pathAY = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("a-y");
    },
  });

  const innerEndA = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("inner-end-a");
    },
  });

  // Route "b" is simple
  const pathB = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("b");
    },
  });

  const outerEnd = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("outer-end");
    },
  });

  // Wire inner branch and capture the returned end node
  const innerEnd = branch(innerRouterA, { x: [pathAX], y: [pathAY] }, innerEndA);

  // Wire outer branch
  branch(outerRouter, { a: [innerRouterA], b: [pathB] }, outerEnd);

  // Connect inner end to outer end
  innerEnd.to(outerEnd);

  await Flow.from(outerRouter).run(shared);

  expect(shared.executed).toEqual([
    "outer-router",
    "inner-router-a",
    "a-x",
    "inner-end-a",
    "outer-end",
  ]);
});

test("nested branches - different inner path", async () => {
  type NestedState = {
    level1: string;
    level2: string;
    executed: string[];
  };

  const shared: NestedState = { level1: "a", level2: "y", executed: [] };

  const outerRouter = new BaseNode<NestedState>({
    post: (s) => s.level1,
  });

  const innerRouterA = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("inner-router");
    },
    post: (s) => s.level2,
  });

  const pathAX = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("a-x");
    },
  });

  const pathAY = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("a-y");
    },
  });

  const innerEndA = new BaseNode<NestedState>({ name: "Inner End" });

  const pathB = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("b");
    },
  });

  const outerEnd = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("outer-end");
    },
  });

  // Wire inner branch and connect its end to outer end
  branch(innerRouterA, { x: [pathAX], y: [pathAY] }, innerEndA).to(outerEnd);
  branch(outerRouter, { a: [innerRouterA], b: [pathB] }, outerEnd);

  await Flow.from(outerRouter).run(shared);

  // Should take y path in nested branch
  expect(shared.executed).toEqual(["inner-router", "a-y", "outer-end"]);
});

test("deeply nested branches (3 levels)", async () => {
  type DeepState = {
    l1: string;
    l2: string;
    l3: string;
    executed: string[];
  };

  const shared: DeepState = { l1: "a", l2: "b", l3: "c", executed: [] };

  const l1End = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l1-end");
    },
  });

  // Level 3 (innermost)
  const l3Router = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l3-router");
    },
    post: (s) => s.l3,
  });
  const l3PathC = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l3-c");
    },
  });
  const l3PathD = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l3-d");
    },
  });
  const l3End = new BaseNode<DeepState>({ name: "L3 End" });
  branch(l3Router, { c: [l3PathC], d: [l3PathD] }, l3End).to(l1End);

  // Level 2
  const l2Router = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l2-router");
    },
    post: (s) => s.l2,
  });
  const l2PathA = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l2-a");
    },
  });
  const l2End = new BaseNode<DeepState>({ name: "L2 End" });
  // Route "b" leads to l3Router
  branch(l2Router, { a: [l2PathA], b: [l3Router] }, l2End).to(l1End);

  // Level 1 (outermost)
  const l1Router = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l1-router");
    },
    post: (s) => s.l1,
  });
  const l1PathX = new BaseNode<DeepState>({
    prep: (s) => {
      s.executed.push("l1-x");
    },
  });
  branch(l1Router, { a: [l2Router], x: [l1PathX] }, l1End);

  await Flow.from(l1Router).run(shared);

  expect(shared.executed).toEqual([
    "l1-router",
    "l2-router",
    "l3-router",
    "l3-c",
    "l1-end",
  ]);
});

// ============================================================================
// branch() with chain() and sequential() Tests
// ============================================================================

test("branch after chain", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const step1 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("step1");
      s.value = 5;
    },
  });

  const step2 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("step2");
      s.value *= 2;
    },
  });

  const router = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("router");
    },
    post: (s) => (s.value > 8 ? "high" : "low"),
  });

  const highPath = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("high");
    },
  });

  const lowPath = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("low");
    },
  });

  const end = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  // Chain leads into router, which branches
  chain(step1, step2, router);
  branch(router, { high: [highPath], low: [lowPath] }, end);

  await Flow.from(step1).run(shared);

  expect(shared.value).toBe(10);
  expect(shared.executed).toEqual(["step1", "step2", "router", "high", "end"]);
});

test("branch before chain continuation", async () => {
  const shared: TestState = { value: 10, executed: [] };

  const router = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("router");
    },
    post: (s) => (s.value > 5 ? "big" : "small"),
  });

  const bigPath = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("big");
    },
  });

  const smallPath = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("small");
    },
  });

  const convergePoint = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("converge");
    },
  });

  const final1 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("final1");
    },
  });

  const final2 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("final2");
    },
  });

  // Branch converges, then chain continues
  branch(router, { big: [bigPath], small: [smallPath] }, convergePoint);
  chain(convergePoint, final1, final2);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual([
    "router",
    "big",
    "converge",
    "final1",
    "final2",
  ]);
});

test("branch inside sequential flow", async () => {
  const shared: TestState = { value: 3, executed: [] };

  const init = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("init");
    },
  });

  const router = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("router");
    },
    post: (s) => (s.value > 5 ? "above" : "below"),
  });

  const above = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("above");
    },
  });

  const below = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("below");
    },
  });

  const afterBranch = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("after-branch");
    },
  });

  const cleanup = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("cleanup");
    },
  });

  // Set up branch
  branch(router, { above: [above], below: [below] }, afterBranch);

  // Create sequential flow: init -> router -> (branch) -> afterBranch -> cleanup
  const flow = sequential([init, router, afterBranch, cleanup]);

  await flow.run(shared);

  // Note: sequential chains init->router->afterBranch->cleanup
  // but branch also connects router->(above|below)->afterBranch
  // So the path is: init -> router -> below -> afterBranch -> cleanup
  expect(shared.executed).toEqual([
    "init",
    "router",
    "below",
    "after-branch",
    "cleanup",
  ]);
});

test("multiple branches in sequence", async () => {
  type MultiState = {
    phase1: string;
    phase2: string;
    executed: string[];
  };

  const shared: MultiState = { phase1: "a", phase2: "y", executed: [] };

  const router1 = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("router1");
    },
    post: (s) => s.phase1,
  });

  const path1A = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("1a");
    },
  });

  const path1B = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("1b");
    },
  });

  const middle = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("middle");
    },
  });

  const router2 = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("router2");
    },
    post: (s) => s.phase2,
  });

  const path2X = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("2x");
    },
  });

  const path2Y = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("2y");
    },
  });

  const end = new BaseNode<MultiState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  // First branch converges to middle
  branch(router1, { a: [path1A], b: [path1B] }, middle);
  // Chain middle to second router
  chain(middle, router2);
  // Second branch converges to end
  branch(router2, { x: [path2X], y: [path2Y] }, end);

  await Flow.from(router1).run(shared);

  expect(shared.executed).toEqual([
    "router1",
    "1a",
    "middle",
    "router2",
    "2y",
    "end",
  ]);
});

test("chain used within branch routes", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const router = new BaseNode<TestState>({
    post: () => "process",
  });

  // Create a pre-chained sequence for the route
  const a = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("a");
    },
  });
  const b = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("b");
    },
  });
  const c = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("c");
    },
  });

  const end = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  // branch with array of nodes (internally uses ouroboros to chain them)
  branch(router, { process: [a, b, c] }, end);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["a", "b", "c", "end"]);
});
