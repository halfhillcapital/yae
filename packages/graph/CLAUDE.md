# @yae/graph

Zero-dependency graph execution engine. Directed graph of nodes with a **prep -> exec -> post** lifecycle.

## Commands

```bash
bun test    # Run all 6 test files (142 tests)
```

## Architecture

### Node Lifecycle

- `prep(shared)` — read from shared state, prepare inputs
- `exec(prepResult)` — pure transformation (no shared state access)
- `post(shared, prepResult, execResult)` — write results, return action for routing

### Classes (`src/node.ts`, `src/flow.ts`)

- **BaseNode** — minimal node with lifecycle and `onError` handler
- **Node** — adds retry (linear/exponential backoff), timeout, `fallback()`
- **ParallelNode** — executes `prep()` items in parallel through `exec()`
- **Flow** — orchestrates graph execution, walks nodes until no successor

### Factory Functions (`src/utils.ts`)

```ts
const { node, parallel } = createNodes<MyState>();

const calc = node({
  prep: (s) => s.items,
  exec: (items) => items.length,
  post: (s, _prep, count) => { s.count = count; return undefined; },
  retry: { maxAttempts: 3, backoff: "exponential" },
  timeout: 5000,
});
```

### Chaining & Branching (`src/utils.ts`)

```ts
chain(node1, node2, node3);                    // Sequential
branch(router, { ok: [a, b], err: [c] });      // Conditional routing
node.to(target);                               // Fluent chaining
node.when("action", nextNode);                 // Action-based routing
```

## Exports

All public API is re-exported from `src/index.ts`. Consumed as `@yae/graph` via Bun workspace resolution.
