import { test, expect } from "bun:test";
import {
  BaseNode,
  Flow,
  branch,
  chain,
  createNodes,
  sequential,
} from "@yae/graph";

type TestState = {
  value: number;
  executed: string[];
};

// ============================================================================
// branch() Utility Function Tests
// ============================================================================

test("branch creates routing from start to multiple paths converging at auto-created exit", async () => {
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

  const { entry } = branch(router, { high: [highPath], low: [lowPath] });

  expect(entry).toBe(router);
  await Flow.from(entry).run(shared);

  expect(shared.executed).toEqual(["router", "high"]);
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

  branch(router, { process: [step1, step2, step3] });

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["step1", "step2", "step3"]);
  expect(shared.value).toBe(25); // (10 * 2) + 5
});

test("branch returns entry and exit nodes", () => {
  const router = new BaseNode<TestState>({ name: "Router" });
  const pathA = new BaseNode<TestState>({ name: "Path A" });

  const result = branch(router, { action: [pathA] });

  expect(result.entry).toBe(router);
  expect(result.exit).toBeDefined();
  expect(result.exit).not.toBe(router);
});

test("branch throws on empty routes object", () => {
  const router = new BaseNode<TestState>();

  expect(() => branch(router, {})).toThrow(
    "branch() requires at least one route",
  );
});

test("branch throws on empty route array with action name", () => {
  const router = new BaseNode<TestState>();

  expect(() => branch(router, { myAction: [] })).toThrow(
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

  branch(router, { only: [onlyPath] });

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["only"]);
});

test("branch exit can be chained to next node", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const router = new BaseNode<TestState>({
    post: () => "path",
  });

  const pathNode = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("path");
    },
  });

  const afterBranch = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("after");
    },
  });

  branch(router, { path: [pathNode] }).exit.to(afterBranch);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["path", "after"]);
});

test("branch with typed node factory", async () => {
  type CalcState = {
    input: number;
    output: number;
    path: string;
  };

  const shared: CalcState = { input: 15, output: 0, path: "" };

  const { node } = createNodes<CalcState>();

  const router = node({
    name: "Router",
    prep: (s) => s.input,
    exec: (input) => (input > 10 ? "big" : "small"),
    post: (s, _prep, result) => {
      s.path = result;
      return result;
    },
  });

  const bigCalc = node({
    name: "Big Calc",
    prep: (s) => s.input,
    exec: (input) => input * 10,
    post: (s, _prep, result) => {
      s.output = result;
      return undefined;
    },
  });

  const smallCalc = node({
    name: "Small Calc",
    prep: (s) => s.input,
    exec: (input) => input * 2,
    post: (s, _prep, result) => {
      s.output = result;
      return undefined;
    },
  });

  branch(router, { big: [bigCalc], small: [smallCalc] });

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

  branch(router, { positive: [positive], negative: [negative] });

  // Test positive path
  const shared1: TestState = { value: 5, executed: [] };
  await Flow.from(router).run(shared1);
  expect(shared1.executed).toEqual(["positive"]);

  // Test negative path
  const shared2: TestState = { value: -5, executed: [] };
  await Flow.from(router).run(shared2);
  expect(shared2.executed).toEqual(["negative"]);
});

// ============================================================================
// chain() with branch() Tests - The Main New Feature
// ============================================================================

test("chain(node1, branch(...), node2) works naturally", async () => {
  const shared: TestState = { value: 10, executed: [] };

  const start = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("start");
    },
  });

  const router = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("router");
    },
    post: (s) => (s.value > 5 ? "high" : "low"),
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

  // The new natural chaining syntax!
  chain(start, branch(router, { high: [highPath], low: [lowPath] }), end);

  await Flow.from(start).run(shared);

  expect(shared.executed).toEqual(["start", "router", "high", "end"]);
});

test("chain with branch taking low path", async () => {
  const shared: TestState = { value: 3, executed: [] };

  const start = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("start");
    },
  });

  const router = new BaseNode<TestState>({
    post: (s) => (s.value > 5 ? "high" : "low"),
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

  chain(start, branch(router, { high: [highPath], low: [lowPath] }), end);

  await Flow.from(start).run(shared);

  expect(shared.executed).toEqual(["start", "low", "end"]);
});

test("multiple branches in chain", async () => {
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

  // Two branches in sequence using chain
  chain(
    branch(router1, { a: [path1A], b: [path1B] }),
    branch(router2, { x: [path2X], y: [path2Y] }),
    end,
  );

  await Flow.from(router1).run(shared);

  expect(shared.executed).toEqual(["router1", "1a", "router2", "2y", "end"]);
});

test("branch with multi-node routes in chain", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const start = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("start");
    },
  });

  const router = new BaseNode<TestState>({
    post: () => "process",
  });

  const step1 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("step1");
    },
  });

  const step2 = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("step2");
    },
  });

  const end = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  chain(start, branch(router, { process: [step1, step2] }), end);

  await Flow.from(start).run(shared);

  expect(shared.executed).toEqual(["start", "step1", "step2", "end"]);
});

// ============================================================================
// Nested branch() Tests
// ============================================================================

test("nested branches using chain", async () => {
  type NestedState = {
    level1: string;
    level2: string;
    executed: string[];
  };

  const shared: NestedState = { level1: "a", level2: "x", executed: [] };

  const outerRouter = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("outer-router");
    },
    post: (s) => s.level1,
  });

  const innerRouter = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("inner-router");
    },
    post: (s) => s.level2,
  });

  const pathX = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("x");
    },
  });

  const pathY = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("y");
    },
  });

  const pathB = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("b");
    },
  });

  const end = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  // Nested branch: route "a" contains another branch
  const innerBranch = branch(innerRouter, { x: [pathX], y: [pathY] });

  chain(branch(outerRouter, { a: [innerRouter], b: [pathB] }), end);

  // Connect inner branch exit to outer branch's auto-exit -> end
  innerBranch.exit.to(end);

  await Flow.from(outerRouter).run(shared);

  expect(shared.executed).toEqual(["outer-router", "inner-router", "x", "end"]);
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

  const innerRouter = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("inner-router");
    },
    post: (s) => s.level2,
  });

  const pathX = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("x");
    },
  });

  const pathY = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("y");
    },
  });

  const pathB = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("b");
    },
  });

  const end = new BaseNode<NestedState>({
    prep: (s) => {
      s.executed.push("end");
    },
  });

  const innerBranch = branch(innerRouter, { x: [pathX], y: [pathY] });
  const outerBranch = branch(outerRouter, { a: [innerRouter], b: [pathB] });

  // Connect both branch exits to end
  innerBranch.exit.to(end);
  outerBranch.exit.to(end);

  await Flow.from(outerRouter).run(shared);

  expect(shared.executed).toEqual(["inner-router", "y", "end"]);
});

// ============================================================================
// branch() with chain() and sequential() Tests
// ============================================================================

test("branch after chain prefix", async () => {
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

  // Chain prefix leads into branch which leads to end
  chain(
    step1,
    step2,
    branch(router, { high: [highPath], low: [lowPath] }),
    end,
  );

  await Flow.from(step1).run(shared);

  expect(shared.value).toBe(10);
  expect(shared.executed).toEqual(["step1", "step2", "router", "high", "end"]);
});

test("branch used in sequential flow", async () => {
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

  const cleanup = new BaseNode<TestState>({
    prep: (s) => {
      s.executed.push("cleanup");
    },
  });

  // Using branch in chain, then wrapping in sequential
  const flow = sequential([
    init,
    branch(router, { above: [above], below: [below] }).entry,
    cleanup,
  ]);

  // Need to connect the branch exit to cleanup
  branch(router, { above: [above], below: [below] }).exit.to(cleanup);

  await flow.run(shared);

  expect(shared.executed).toEqual(["init", "router", "below", "cleanup"]);
});

test("chain with branch routes containing multiple nodes", async () => {
  const shared: TestState = { value: 0, executed: [] };

  const router = new BaseNode<TestState>({
    post: () => "process",
  });

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

  chain(branch(router, { process: [a, b, c] }), end);

  await Flow.from(router).run(shared);

  expect(shared.executed).toEqual(["a", "b", "c", "end"]);
});
