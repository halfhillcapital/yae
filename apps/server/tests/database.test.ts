import { tmpdir } from "node:os";
import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentContext, AdminContext } from "@yae/db/context.ts";

/**
 * Returns a unique temp directory path for file-based agent DBs.
 * AgentContext.create(agentId, dbDir) produces `${dbDir}/${agentId}.db`,
 * so passing the same dbDir + agentId reopens the same file.
 */
function tempDbDir(): string {
  return `${tmpdir()}/yae-test-${crypto.randomUUID()}`;
}

function tempDbPath(): string {
  return `${tmpdir()}/yae-test-${crypto.randomUUID()}.db`;
}

// ============================================================================
// AgentContext — Creation & Migration
// ============================================================================

describe("AgentContext", () => {
  test("creates file-based database with all tables", async () => {
    const ctx = await AgentContext.create("test-agent", tempDbDir());
    expect(ctx.agentId).toBe("test-agent");
    expect(ctx.memory).toBeDefined();
    expect(ctx.messages).toBeDefined();
    expect(ctx.files).toBeDefined();
  });

  test("reopening same database file preserves data", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.memory.set("key", "desc", "persisted");

    // Fresh context, same file — load() reads from DB
    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.get("key")?.content).toBe("persisted");
  });
});

// ============================================================================
// MemoryRepository — persistence round-trips
// ============================================================================

describe("MemoryRepository", () => {
  test("set() persists to database", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.memory.set("greeting", "A greeting", "Hello, world!");

    const ctx2 = await AgentContext.create("agent", dir);
    const block = ctx2.memory.get("greeting");
    expect(block).toBeDefined();
    expect(block!.label).toBe("greeting");
    expect(block!.description).toBe("A greeting");
    expect(block!.content).toBe("Hello, world!");
  });

  test("set() update persists to database", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.memory.set("key", "v1 desc", "v1 content");
    await ctx1.memory.set("key", "v2 desc", "v2 content");

    const ctx2 = await AgentContext.create("agent", dir);
    const block = ctx2.memory.get("key");
    expect(block!.description).toBe("v2 desc");
    expect(block!.content).toBe("v2 content");
    expect(ctx2.memory.getAll().length).toBe(1);
  });

  test("delete() persists to database", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.memory.set("ephemeral", "desc", "content");
    await ctx1.memory.delete("ephemeral");

    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.has("ephemeral")).toBe(false);
    expect(ctx2.memory.getAll().length).toBe(0);
  });

  test("multiple blocks persist independently", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.memory.set("a", "desc-a", "content-a");
    await ctx1.memory.set("b", "desc-b", "content-b");
    await ctx1.memory.set("c", "desc-c", "content-c");

    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.getAll().length).toBe(3);
    expect(ctx2.memory.get("a")!.content).toBe("content-a");
    expect(ctx2.memory.get("b")!.content).toBe("content-b");
    expect(ctx2.memory.get("c")!.content).toBe("content-c");
  });

  test("replaceMemory() persists to database", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.memory.set("doc", "A document", "Hello world, hello universe");
    await ctx1.memory.toolReplaceMemory(
      "doc",
      "hello universe",
      "hello galaxy",
    );

    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.get("doc")!.content).toBe("Hello world, hello galaxy");
  });

  test("insertMemory() persists to database", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.memory.set("doc", "desc", "line0\nline1\nline2");
    await ctx1.memory.toolInsertMemory("doc", "inserted", "beginning");

    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.get("doc")!.content).toBe(
      "inserted\nline0\nline1\nline2",
    );
  });

  test("replaceMemory() throws on missing block", async () => {
    const ctx = await AgentContext.create("agent", tempDbDir());
    expect(
      ctx.memory.toolReplaceMemory("missing", "old", "new"),
    ).rejects.toThrow("does not exist");
  });

  test("replaceMemory() throws when old content not found", async () => {
    const ctx = await AgentContext.create("agent", tempDbDir());
    await ctx.memory.set("doc", "desc", "actual content");
    expect(
      ctx.memory.toolReplaceMemory("doc", "nonexistent", "new"),
    ).rejects.toThrow("was not found");
  });
});

// ============================================================================
// MessagesRepository — persistence round-trips
// ============================================================================

describe("MessagesRepository", () => {
  test("save() persists messages to database", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.messages.save({ role: "user", content: "Hello" });
    await ctx1.messages.save({ role: "assistant", content: "Hi there" });

    const ctx2 = await AgentContext.create("agent", dir);
    const all = ctx2.messages.getMessageHistory();
    expect(all.length).toBe(2);
    expect(all[0]!.role).toBe("user");
    expect(all[0]!.content).toBe("Hello");
    expect(all[1]!.role).toBe("assistant");
    expect(all[1]!.content).toBe("Hi there");
  });

  test("all message roles persist", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.messages.save({ role: "user", content: "u" });
    await ctx1.messages.save({ role: "assistant", content: "a" });

    const ctx2 = await AgentContext.create("agent", dir);
    const roles = ctx2.messages.getMessageHistory().map((m) => m.role);
    expect(roles).toEqual(["user", "assistant"]);
  });

  test("messages load in chronological order", async () => {
    const dir = tempDbDir();

    const ctx1 = await AgentContext.create("agent", dir);
    await ctx1.messages.save({ role: "user", content: "first" });
    await ctx1.messages.save({ role: "user", content: "second" });
    await ctx1.messages.save({ role: "user", content: "third" });

    const ctx2 = await AgentContext.create("agent", dir);
    const contents = ctx2.messages.getMessageHistory().map((m) => m.content);
    expect(contents).toEqual(["first", "second", "third"]);
  });

  test("empty database loads empty messages", async () => {
    const ctx = await AgentContext.create("agent", tempDbDir());
    expect(ctx.messages.getMessageHistory()).toEqual([]);
  });
});

// ============================================================================
// WorkflowRepository — persistence round-trips
// ============================================================================

describe("WorkflowRepository", () => {
  test("create and get a workflow run", async () => {
    const now = Date.now();

    const admin1 = await AdminContext.create(tempDbPath());
    await admin1.workflows.create({
      id: "run-1",
      agent_id: "agent-1",
      workflow: "test-wf",
      status: "completed",
      state: { counter: 42 },
      started_at: now,
      updated_at: now,
      completed_at: now,
    });

    const run = await admin1.workflows.get<{ counter: number }>("run-1");
    expect(run).not.toBeNull();
    expect(run!.agent_id).toBe("agent-1");
    expect(run!.workflow).toBe("test-wf");
    expect(run!.status).toBe("completed");
    expect(run!.state.counter).toBe(42);
  });

  test("update persists status, state, and error", async () => {
    const now = Date.now();

    const admin = await AdminContext.create(tempDbPath());
    await admin.workflows.create({
      id: "run-2",
      agent_id: "agent-1",
      workflow: "wf",
      status: "completed",
      state: { step: 1 },
      started_at: now,
      updated_at: now,
      completed_at: now,
    });

    await admin.workflows.update<{ step: number }>("run-2", {
      status: "failed",
      state: { step: 3 },
      error: "Something broke",
      completed_at: now + 1000,
    });

    const run = await admin.workflows.get<{ step: number }>("run-2");
    expect(run!.status).toBe("failed");
    expect(run!.state.step).toBe(3);
    expect(run!.error).toBe("Something broke");
  });

  test("listByStatus filters correctly", async () => {
    const now = Date.now();

    const admin = await AdminContext.create(tempDbPath());
    await admin.workflows.create({
      id: "c1",
      agent_id: "agent-1",
      workflow: "wf",
      status: "completed",
      state: {},
      started_at: now,
      updated_at: now,
      completed_at: now,
    });
    await admin.workflows.create({
      id: "c2",
      agent_id: "agent-1",
      workflow: "wf",
      status: "completed",
      state: {},
      started_at: now + 1,
      updated_at: now + 1,
      completed_at: now + 1,
    });
    await admin.workflows.create({
      id: "f1",
      agent_id: "agent-1",
      workflow: "wf",
      status: "failed",
      state: {},
      error: "err",
      started_at: now,
      updated_at: now,
      completed_at: now,
    });

    const completed = await admin.workflows.listByStatus("completed");
    expect(completed.length).toBe(2);

    const failed = await admin.workflows.listByStatus("failed");
    expect(failed.length).toBe(1);
    expect(failed[0]!.id).toBe("f1");
  });

  test("listByAgent filters by agent_id", async () => {
    const now = Date.now();

    const admin = await AdminContext.create(tempDbPath());
    await admin.workflows.create({
      id: "a1-run",
      agent_id: "agent-1",
      workflow: "wf",
      status: "completed",
      state: {},
      started_at: now,
      updated_at: now,
      completed_at: now,
    });
    await admin.workflows.create({
      id: "a2-run",
      agent_id: "agent-2",
      workflow: "wf",
      status: "completed",
      state: {},
      started_at: now,
      updated_at: now,
      completed_at: now,
    });

    const agent1Runs = await admin.workflows.listByAgent("agent-1");
    expect(agent1Runs.length).toBe(1);
    expect(agent1Runs[0]!.id).toBe("a1-run");

    const agent2Runs = await admin.workflows.listByAgent("agent-2");
    expect(agent2Runs.length).toBe(1);
    expect(agent2Runs[0]!.id).toBe("a2-run");
  });

  test("markStaleAsFailed marks running workflows on reopen", async () => {
    const dbPath = tempDbPath();
    const now = Date.now();

    const admin1 = await AdminContext.create(dbPath);
    await admin1.workflows.create({
      id: "stale-1",
      agent_id: "agent-1",
      workflow: "wf",
      status: "running",
      state: {},
      started_at: now,
      updated_at: now,
    });
    await admin1.workflows.create({
      id: "ok-1",
      agent_id: "agent-1",
      workflow: "wf",
      status: "completed",
      state: {},
      started_at: now,
      updated_at: now,
      completed_at: now,
    });

    // Reopening triggers markStaleAsFailed inside AdminContext.create()
    const admin2 = await AdminContext.create(dbPath);

    const stale = await admin2.workflows.get("stale-1");
    expect(stale!.status).toBe("failed");
    expect(stale!.error).toContain("server restart");

    const ok = await admin2.workflows.get("ok-1");
    expect(ok!.status).toBe("completed");
  });

  test("get returns null for missing run", async () => {
    const admin = await AdminContext.create(tempDbPath());
    const run = await admin.workflows.get("nonexistent");
    expect(run).toBeNull();
  });
});

// ============================================================================
// AdminContext — persistence round-trips
// ============================================================================

describe("AdminContext", () => {
  test("registered user persists across reopens", async () => {
    const dbPath = tempDbPath();

    const admin1 = await AdminContext.create(dbPath);
    const user = await admin1.users.register("alice");

    const admin2 = await AdminContext.create(dbPath);
    const found = await admin2.users.getByToken(user.token);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
    expect(found!.name).toBe("alice");
  });

  test("getUserById persists across reopens", async () => {
    const dbPath = tempDbPath();

    const admin1 = await AdminContext.create(dbPath);
    const user = await admin1.users.register("bob", "admin");

    const admin2 = await AdminContext.create(dbPath);
    const found = await admin2.users.getById(user.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("bob");
    expect(found!.role).toBe("admin");
  });

  test("listUsers returns all persisted users", async () => {
    const dbPath = tempDbPath();

    const admin1 = await AdminContext.create(dbPath);
    await admin1.users.register("u1");
    await admin1.users.register("u2");
    await admin1.users.register("u3");

    const admin2 = await AdminContext.create(dbPath);
    const users = await admin2.users.list();
    expect(users.length).toBe(3);
    expect(users.map((u) => u.name).sort()).toEqual(["u1", "u2", "u3"]);
  });

  test("deleteUser persists across reopens", async () => {
    const dbPath = tempDbPath();

    const admin1 = await AdminContext.create(dbPath);
    const user = await admin1.users.register("to-delete");
    await admin1.users.delete(user.id);

    const admin2 = await AdminContext.create(dbPath);
    const found = await admin2.users.getById(user.id);
    expect(found).toBeNull();

    const users = await admin2.users.list();
    expect(users.length).toBe(0);
  });

  test("returns null for unknown token", async () => {
    const admin = await AdminContext.create(tempDbPath());
    expect(await admin.users.getByToken("fake")).toBeNull();
  });

  test("deleteUser returns false for unknown id", async () => {
    const admin = await AdminContext.create(tempDbPath());
    expect(await admin.users.delete("fake")).toBe(false);
  });
});

// ============================================================================
// Error propagation — prove DB failures throw, not silently swallowed
// ============================================================================

describe("Error propagation", () => {
  /**
   * Opens a raw SQLite connection to the same DB file so we can sabotage it
   * (drop tables) and verify the repositories throw on the next operation.
   */
  function rawClient(dir: string, agentId: string) {
    return new Database(`${dir}/${agentId}.db`);
  }

  test("memory.set() throws when table is dropped", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    await rawClient(dir, "agent").run("DROP TABLE memory");

    expect(ctx.memory.set("key", "desc", "value")).rejects.toThrow();
  });

  test("memory.delete() throws when table is dropped", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    // Put something in cache so delete() doesn't short-circuit
    await ctx.memory.set("key", "desc", "value");

    await rawClient(dir, "agent").run("DROP TABLE memory");

    expect(ctx.memory.delete("key")).rejects.toThrow();
  });

  test("memory.load() throws when table is dropped", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    await rawClient(dir, "agent").run("DROP TABLE memory");

    expect(ctx.memory.load()).rejects.toThrow();
  });

  test("messages.save() throws when table is dropped", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    await rawClient(dir, "agent").run("DROP TABLE messages");

    expect(
      ctx.messages.save({ role: "user", content: "hello" }),
    ).rejects.toThrow();
  });

  test("messages.load() throws when table is dropped", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    await rawClient(dir, "agent").run("DROP TABLE messages");

    expect(ctx.messages.load()).rejects.toThrow();
  });

  test("memory.set() does not update cache when DB write fails", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    await rawClient(dir, "agent").run("DROP TABLE memory");

    // set() should throw
    try {
      await ctx.memory.set("key", "desc", "value");
    } catch {
      // expected
    }

    // Cache must NOT contain the entry — DB failed before cache update
    expect(ctx.memory.has("key")).toBe(false);
  });

  test("verifyTables catches missing tables at startup", async () => {
    const dir = tempDbDir();

    // First create succeeds (runs migrations)
    await AgentContext.create("agent", dir);

    // Sabotage: drop a table from the same DB file, then close the raw client
    const raw = rawClient(dir, "agent");
    await raw.run("DROP TABLE memory");
    raw.close();

    // Reopening the SAME agent DB — migrate() skips (already applied),
    // then verifyTables should catch the missing table
    expect(AgentContext.create("agent", dir)).rejects.toThrow(
      "Migration verification failed",
    );
  });
});

// ============================================================================
// FileRepository & AgentFS — isolation from Drizzle DB
// ============================================================================

describe("FileRepository (AgentFS isolation)", () => {
  test("file writes do not corrupt the Drizzle database", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    // Write data via Drizzle
    await ctx.memory.set("before", "desc", "value-before");
    await ctx.messages.save({ role: "user", content: "hello" });

    // Write files via AgentFS
    await ctx.files.writeFile("/test.txt", "file content", "utf-8");
    await ctx.files.mkdir("/subdir");
    await ctx.files.writeFile("/subdir/nested.txt", "nested content", "utf-8");

    // Drizzle data must still be intact
    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.get("before")!.content).toBe("value-before");
    expect(ctx2.messages.getMessageHistory()[0]!.content).toBe("hello");
  });

  test("tool calls do not corrupt the Drizzle database", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    // Write data via Drizzle
    await ctx.memory.set("key", "desc", "stable");

    // Run tool lifecycle via AgentFS
    const toolId = await ctx.files.toolPending("search", { query: "test" });
    await ctx.files.toolSuccess(toolId, { results: ["a", "b"] });

    // Another tool that fails
    const toolId2 = await ctx.files.toolPending("fetch", { url: "http://x" });
    await ctx.files.toolFailure(toolId2, "timeout");

    // Drizzle data must still be intact
    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.get("key")!.content).toBe("stable");
  });

  test("interleaved Drizzle and AgentFS operations stay consistent", async () => {
    const dir = tempDbDir();
    const ctx = await AgentContext.create("agent", dir);

    // Interleave operations between the two databases
    await ctx.memory.set("m1", "desc", "memory-1");
    await ctx.files.writeFile("/f1.txt", "file-1", "utf-8");
    await ctx.messages.save({ role: "user", content: "msg-1" });
    const tid = await ctx.files.toolPending("tool-1");
    await ctx.memory.set("m2", "desc", "memory-2");
    await ctx.files.toolSuccess(tid, "done");
    await ctx.messages.save({ role: "assistant", content: "msg-2" });
    await ctx.files.writeFile("/f2.txt", "file-2", "utf-8");

    // Verify Drizzle side via fresh context
    const ctx2 = await AgentContext.create("agent", dir);
    expect(ctx2.memory.get("m1")!.content).toBe("memory-1");
    expect(ctx2.memory.get("m2")!.content).toBe("memory-2");
    expect(ctx2.messages.getMessageHistory().length).toBe(2);

    // Verify AgentFS side (same context is fine — no cache layer)
    const f1 = await ctx2.files.readFile("/f1.txt", "utf-8");
    expect(f1).toBe("file-1");
    const f2 = await ctx2.files.readFile("/f2.txt", "utf-8");
    expect(f2).toBe("file-2");
  });

  test("AgentFS and Drizzle use separate database files", async () => {
    const dir = tempDbDir();
    await AgentContext.create("agent", dir);

    // Verify two separate .db files were created
    const { existsSync } = await import("node:fs");
    expect(existsSync(`${dir}/agent.db`)).toBe(true);
    expect(existsSync(`${dir}/agent.fs.db`)).toBe(true);
  });
});
