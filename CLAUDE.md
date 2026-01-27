# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Y.A.E. is an AI agent orchestrator built with Bun, Elysia (web framework), and Drizzle ORM (SQLite). It provides a graph-based execution engine for building agentic workflows.

## Commands

```bash
bun run start       # Run the server
bun run watch       # Run with hot reload
bun run lint        # ESLint
bun run format      # Prettier format
```

## Architecture

### Graph Execution Engine (`src/graph/`)

Directed graph of nodes with **prep → exec → post** lifecycle:

- `prep(shared)` - Read from shared state, prepare inputs
- `exec(prepResult)` - Pure transformation (no shared state access)
- `post(shared, prepResult, execResult)` - Write results, return action for routing

**Classes:**

- **BaseNode** - Minimal node with lifecycle and `onError` handler
- **Node** - Adds retry (linear/exponential backoff), timeout, `fallback()`
- **ParallelNode** - Executes `prep()` items in parallel through `exec()`
- **Flow** - Orchestrates graph execution, walks nodes until no successor

**Factory functions:**

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

**Chaining & branching:**

```ts
chain(node1, node2, node3);                    // Sequential
branch(router, { ok: [a, b], err: [c] });      // Conditional routing
node.to(target);                               // Fluent chaining
node.when("action", nextNode);                 // Action-based routing
```

### Yae - The Server (`src/core/`)

Singleton managing user agents, authentication, worker pool, and server lifecycle.

```ts
const yae = await Yae.initialize();
yae.getAdminToken();                    // Fresh each startup
await yae.createUserAgent(userId);
yae.checkoutWorker() / yae.returnWorker(id);  // Worker pool
```

### Agents (`src/core/agents.ts`)

- **UserAgent** - Container with `memory`, `messages`, `files` repositories. Runs workflows via worker pool.
- **WorkerAgent** - Stateless workflow executor, pooled and shared across agents.

```ts
const result = await agent.runWorkflow(myWorkflow, { input: "data" });
```

### Workflows (`src/core/workflows/`)

Graph-based flows with agent context access.

**AgentState\<T\>** - Shared state with `memory`, `messages`, `files`, `data`, and `run` info.

```ts
const workflow = defineWorkflow<{ count: number }>({
  name: "counter",
  initialState: () => ({ count: 0 }),
  build: ({ node, chain }) => {
    const increment = node({
      post: (state) => { state.data.count++; return undefined; },
    });
    return chain(increment);
  },
});

const result = await runWorkflow(workflow, agentId, ctx);
```

For composable workflows, use `createWorkflowNodes<T>()` to define nodes separately.

### Database (`src/db/`)

Each agent gets SQLite at `./data/agents/agent_{id}.db`.

**AgentContext** - Entry point for DB access: `ctx.memory`, `ctx.messages`, `ctx.files`, `ctx.workflows`.

**Repositories:**

- **MemoryRepository** - Labeled blocks with cache: `get()`, `set()`, `delete()`, `toXML()`
- **MessagesRepository** - Conversation history (max 50): `getAll()`, `save()`
- **FileRepository** - File operations: `readFile()`, `writeFile()`, `readdir()`, etc.

### API Layer (`src/api/`)

Two-tier bearer token auth: **Admin token** (generated at startup) and **User tokens** (stored in DB).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| POST | `/admin/users` | Admin | Register user |
| POST | `/chat` | User | Chat with agent |

## Path Aliases

Use `@yae/*` to import from `./src/*`.
