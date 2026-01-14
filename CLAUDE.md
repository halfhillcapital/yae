# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Y.A.E. is an AI agent framework built with Bun, Elysia (web framework), and Drizzle ORM (SQLite). It provides a graph-based execution engine for building agentic workflows.

## Commands

```bash
bun run start       # Run the server
bun run watch       # Run with hot reload
bun run lint        # ESLint
bun run format      # Prettier format
```

## Architecture

### Graph Execution Engine (`src/graph/`)

The core abstraction is a **directed graph of nodes** with prep/exec/post phases.

**File structure:**

- `types.ts` - Type definitions (`GraphNode`, `Branch`, `Chainable`, `Action`, `NextAction`, `isBranch`)
- `node.ts` - BaseNode, Node, ParallelNode classes
- `flow.ts` - Flow class
- `utils.ts` - Factory functions and helpers
- `index.ts` - Barrel export

**Classes:**

- **GraphNode\<S\>**: Interface defining the node contract (`work`, `next`, `to`, `when`, `clone`)
- **BaseNode**: Minimal node with `prep()`, `exec()`, `post()` lifecycle and `onError` handler
- **Node**: Extended with retry (linear/exponential backoff), timeout, and `fallback()` support
- **ParallelNode**: Executes `prep()` items in parallel through `exec()`, collects results for `post()`
- **Flow**: Sequential orchestration, clones nodes during execution, walks graph until no successor

**Pipeline pattern (prep → exec → post):**

- `prep(shared)` - Read from shared state, prepare inputs
- `exec(prepResult)` - Pure transformation (no shared state access)
- `post(shared, prepResult, execResult)` - Write results, return action for routing

**Typed factory functions** for full type inference through the pipeline:

```ts
// Sequential node
const calc = node<MyState>()({
  prep: (s) => ({ items: s.items }),
  exec: (input) => input.items.length,
  post: (s, _prep, count) => {
    s.count = count;
    return undefined;
  },
  onError: (error, shared) => { /* handle error, return action or throw */ },
  retry: { maxAttempts: 3, backoff: "exponential" },
  timeout: 5000,
});

// Parallel node - prep returns array, exec runs on each item
const batch = parallel<MyState>()({
  prep: (s) => s.items,           // returns P[]
  exec: (item) => process(item),  // called for each item
  post: (s, items, results) => {  // results is E[]
    s.processed = results;
    return undefined;
  },
});
```

**Node chaining API:**

- `node.to(target)` - Default transition (accepts `GraphNode` or `Branch`, returns exit point for chaining)
- `node.when(action, next)` - Conditional branching based on `post()` return

**Utility functions:**

- `node<S>()` - Curried factory for creating Node with type inference
- `parallel<S>()` - Curried factory for creating ParallelNode with type inference
- `chain(...items)` - Link nodes/branches sequentially, returns first node
- `branch(router, routes)` - Create branching structure, returns `{ entry, exit }`
- `sequential(nodes, config?)` - Create Flow from node array
- `Flow.from(start, config?)` - Static factory for creating Flow

**Branching with `branch()`:**

```ts
// branch() returns { entry, exit } for use in chain()
chain(
  node1,
  branch(router, {
    success: [processNode, saveNode],
    error: [logErrorNode],
  }),
  node2
);

// Multiple branches in sequence
chain(
  branch(router1, { a: [pathA], b: [pathB] }),
  branch(router2, { x: [pathX], y: [pathY] }),
  finalNode
);

// Fluent chaining with to()
node1.to(branch(router, { a: [pathA], b: [pathB] })).to(node2);

// Access entry/exit directly when needed
const { entry, exit } = branch(router, { ... });
exit.to(customEndNode);
```

**Flow configuration hooks:**

- `beforeStart(shared)` - Called before graph execution begins
- `afterComplete(shared, finalAction)` - Called after graph completes
- `onNodeExecute(node, action)` - Called after each node executes
- `onError(error, node, shared)` - Called when a node throws
- `maxIterations` - Guard against infinite loops (default: 1000)

### Agent System

- **YaeAgent** (`src/core/agents.ts`): Long-running agent with task queue, event-driven loop (not polling), conversation history, and memory
- **AgentMemory** (`src/core/memory.ts`): Labeled memory blocks persisted to SQLite
- **AgentService** (`src/db/services.ts`): Singleton manager with automatic cleanup of inactive agents (1 hour timeout)

### Database

Each agent gets its own SQLite database at `./data/agents/agent_{id}.db`. Schema:

- `memory`: Labeled key-value blocks for persistent agent memory
- `messages`: Conversation history with role/content

### API Layer

- Elysia routes in `src/api/routes.ts`
- Bearer token auth via `API_KEY` env var
- `/health` (public), `/message` (authenticated)

## Path Aliases

Use `@yae/*` to import from `./src/*` (configured in tsconfig.json).
