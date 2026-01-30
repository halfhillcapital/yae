# @yae/server

Main Y.A.E. server application. Built with Elysia (web framework) and Drizzle ORM (SQLite).

## Commands

```bash
bun run start                  # Run the server
bun run dev                    # Run with hot reload
bun run test                   # Run workflow tests
bun run lint                   # ESLint
bun run db:generate:agent      # Generate agent DB migrations
bun run db:generate:admin      # Generate admin DB migrations
bun run baml-generate          # Generate BAML client
```

## Path Aliases

Defined in `tsconfig.json` (resolved by Bun, not workspace packages):

- `@yae/db` → `./src/db`
- `@yae/core` → `./src/core`
- `@yae/api` → `./src/api`

`@yae/graph` resolves via Bun workspace (not a path alias).

## Architecture

### Yae — The Server (`src/core/yae.ts`)

Singleton managing user agents, authentication, worker pool, and server lifecycle.

```ts
const yae = await Yae.initialize();
yae.getAdminToken();                           // Fresh each startup
await yae.createUserAgent(userId);
yae.checkoutWorker() / yae.returnWorker(id);   // Worker pool
```

### Agents (`src/core/agents/`)

- **UserAgent** — container with `memory`, `messages`, `files` repositories. Runs workflows via worker pool.
- **WorkerAgent** — stateless workflow executor, pooled and shared across agents.

### Workflows (`src/core/workflows/`)

Graph-based flows with agent context access.

**AgentState\<T\>** — shared state with `memory`, `messages`, `files`, `data`, and `run` info.

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
```

### Database (`src/db/`)

Each agent gets SQLite at `./data/agents/agent_{id}.db`. Migrations in `./drizzle/`.

**AgentContext** — entry point for DB access: `ctx.memory`, `ctx.messages`, `ctx.files`, `ctx.workflows`.

**Repositories:**

- **MemoryRepository** — labeled blocks with cache: `get()`, `set()`, `delete()`, `toXML()`
- **MessagesRepository** — conversation history (max 50): `getAll()`, `save()`
- **FileRepository** — file operations: `readFile()`, `writeFile()`, `readdir()`, etc.
- **WorkflowRepository** — workflow run persistence

### API Layer (`src/api/`)

Two-tier bearer token auth: **Admin token** (generated at startup) and **User tokens** (stored in DB).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check |
| POST | `/admin/users` | Admin | Register user |
| POST | `/chat` | User | Chat with agent |
