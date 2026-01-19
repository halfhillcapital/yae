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

### Yae - The Server (`src/core/`)

**Yae** is the singleton that IS the server. She manages user agents, user authentication, worker pool, and server lifecycle.

```ts
const yae = await Yae.initialize();

// Admin token (generated fresh each startup)
yae.getAdminToken();
yae.isAdminToken(token);

// User agent management
await yae.createUserAgent(userId);
yae.getUserAgent(userId);
yae.listUserAgents();

// User management (persisted to DB)
await yae.registerUser("Alice", "admin");
await yae.getUserByApiKey(apiKey);

// Worker pool (used internally by UserAgent.runWorkflow)
yae.checkoutWorker();     // Get a worker from the pool (or null if exhausted)
yae.returnWorker(id);     // Return a worker to the pool
yae.getPoolStatus();      // { available: number, busy: number }

// Server control
yae.getHealth();          // Includes pool status
await yae.shutdown();

// Yae's own persistence
yae.memory.get("label");
```

**Worker Pool:** Initialized with 4 workers at startup. Workers are stateless and shared across all agents.

**Database:** `./data/yae.db` (memory + messages + users tables)

### Agents (`src/core/`)

- **UserAgent** (`src/core/agents.ts`): Container class with `memory`, `messages`, `files` repositories. Executes workflows by checking out workers from Yae's pool.
- **WorkerAgent** (`src/core/agents.ts`): Stateless workflow executor. Workers are pooled in Yae and shared across all agents.

```ts
// UserAgent checks out a worker from the pool, executes, then returns it
const result = await agent.runWorkflow<MyData>("my-workflow", { input: "data" });
// Throws "No workers available in pool" if pool is exhausted

// WorkerAgent.execute() is called internally with the agent's context
worker.execute<MyData>(workflowId, agentId, ctx, initialData);
```

**Database:** `./data/agents/agent_{id}.db` (memory + messages + workflow_runs tables)

### Workflows (`src/workflow/`)

The workflow system executes graph-based flows with agent context access.

**File structure:**

- `types.ts` - Type definitions (`AgentState`, `WorkflowDefinition`, `WorkflowResult`, `WorkflowRun`)
- `registry.ts` - Singleton workflow registry
- `executor.ts` - WorkflowExecutor class
- `utils.ts` - `defineWorkflow()` helper
- `index.ts` - Barrel export

**WorkflowRegistry** (singleton): Register workflows before execution.

```ts
import { defineWorkflow, WorkflowRegistry } from "@yae/workflow";

// Define a workflow
const myWorkflow = defineWorkflow<{ count: number }>({
  id: "my-workflow",
  name: "My Workflow",
  initialState: () => ({ count: 0 }),
  build: ({ node, chain }) => {
    const increment = node({
      name: "increment",
      post: (state) => {
        state.data.count++;
        return undefined;
      },
    });
    return chain(increment);
  },
});

// Register explicitly
WorkflowRegistry.register(myWorkflow);

// Check/list workflows
WorkflowRegistry.has("my-workflow");
WorkflowRegistry.list();
WorkflowRegistry.listIds();
```

**WorkflowExecutor**: Manages workflow lifecycle.

```ts
const executor = new WorkflowExecutor(agentId, ctx);

// Run a workflow
const result = await executor.run<MyData>("my-workflow", { input: "value" });
// result: { runId, status, finalAction, state, duration, error? }

// Cancel a running workflow
await executor.cancel(runId);

// Query history
const runs = await executor.history<MyData>(50);
const run = await executor.getRun<MyData>(runId);
```

**AgentState\<T\>**: Shared state passed through workflow nodes.

```ts
interface AgentState<T> {
  readonly memory: MemoryRepository;   // Labeled memory blocks
  readonly messages: MessagesRepository; // Conversation history
  readonly files: FileRepository;      // File system operations
  data: T;                             // Workflow-specific data (mutable)
  readonly run: {                      // Runtime info
    id: string;
    workflowId: string;
    startedAt: number;
  };
}
```

**`defineWorkflow()` helper** (in `utils.ts`):

The `build` function receives helpers (`node`, `parallel`, `chain`, `branch`) pre-bound to `AgentState<T>`:

```ts
const workflow = defineWorkflow<{ items: string[]; count: number }>({
  id: "example",
  name: "Example Workflow",
  initialState: () => ({ items: [], count: 0 }),
  build: ({ node, parallel, chain, branch }) => {
    // node() and parallel() create nodes that work with AgentState
    const count = node<string[], number>({
      prep: (s) => s.data.items,
      exec: (items) => items.length,
      post: (s, _prep, count) => {
        s.data.count = count;
        return undefined;
      },
    });

    // chain() and branch() work the same as in @yae/graph
    return chain(count);
  },
});
WorkflowRegistry.register(workflow);
```

### Database (`src/db/`)

Each agent gets its own SQLite database at `./data/agents/agent_{id}.db` plus an AgentFS instance for file operations.

**AgentContext** (`src/db/context.ts`): Single entry point for all database access. Creates DB connection, runs migrations, and initializes repositories.

```ts
const ctx = await AgentContext.create(agentId);
ctx.memory.get("label");
ctx.messages.save("user", "hello");
ctx.files.readFile("/path");
```

**Schemas** (`src/db/schemas/`):

- `agent-schema.ts`: `memory` (label, description, content), `messages` (role, content, createdAt)
- `admin-schema.ts`: `users` (id, name, apiKey, role, createdAt)

**Repositories** (`src/db/repositories/`):

- **MemoryRepository**: Labeled memory blocks with in-memory cache, `has()`, `get()`, `getAll()`, `set()`, `delete()`, `toXML()`
- **MessagesRepository**: Conversation history (max 50), `getAll()`, `save()`
- **FileRepository**: Wraps AgentFS filesystem - `readFile()`, `writeFile()`, `readdir()`, `mkdir()`, `rm()`, `exists()`, `stat()`, etc.

**CLI commands:**

- `bun run db:generate:agent` - Generate agent schema migrations (memory, messages)
- `bun run db:generate:admin` - Generate admin schema migrations (users)
- `bun run db:studio` - Open Drizzle Studio GUI

### API Layer (`src/api/`)

Two-tier bearer token authentication:

1. **Admin token** - Generated fresh on each startup, printed to console
2. **User tokens** - Stored in DB as `apiKey`, returned when registering users

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| POST | `/admin/users` | Admin | Register user (returns apiKey) |
| GET | `/admin/users` | Admin | List all users |
| DELETE | `/admin/users/:id` | Admin | Delete user |
| POST | `/chat` | User | Chat with user's agent |

**Middleware** (`src/api/middleware.ts`):

- `adminAuth` - Validates admin token via `Yae.isAdminToken()` (timing-safe comparison)
- `userAuth` - Looks up user by apiKey, creates/gets their agent

**Security:**

- Rate limiting: 10 requests per 60 seconds per IP (via `elysia-rate-limit`)
- Timing-safe admin token comparison (prevents timing attacks)

## Path Aliases

Use `@yae/*` to import from `./src/*` (configured in tsconfig.json).
