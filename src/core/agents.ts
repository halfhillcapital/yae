import type { Message } from "@yae/types.ts";
import { AgentMemory } from "./memory.ts";
import { type AgentDB, getAgentDb, loadConversations } from "@yae/db/index.ts";

const MAX_QUEUE_SIZE = 100;
const MAX_CONVERSATION_HISTORY = 50;

// Just a placeholder for now
type YaeTask = {
  type: string;
  lastError?: string;
};

export class YaeAgent {
  private queue: YaeTask[] = [];

  private _memory: AgentMemory;
  private conversations: Message[] = [];

  private signal: { promise: Promise<void>; resolve: () => void };
  private running = true;
  private _lastActiveAt: number = Date.now();

  private constructor(
    public id: string,
    private db: AgentDB,
  ) {
    this._memory = new AgentMemory(db);
    this.signal = this.createSignal();
    this.loop();
  }

  get lastActiveAt(): number {
    return this._lastActiveAt;
  }

  static async create(id: string): Promise<YaeAgent> {
    const db = await getAgentDb(id);
    const agent = new YaeAgent(id, db);

    // Load existing state from DB
    const history = await loadConversations(db);
    agent.conversations = history.slice(-MAX_CONVERSATION_HISTORY);
    await agent._memory.load();

    console.log(
      `[Agent ${id}] Loaded ${agent.conversations.length} messages, ${agent._memory.getAll().length} memory blocks`,
    );
    return agent;
  }

  private createSignal() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  private pruneConversationHistory() {
    if (this.conversations.length > MAX_CONVERSATION_HISTORY) {
      const excess = this.conversations.length - MAX_CONVERSATION_HISTORY;
      this.conversations.splice(0, excess);
    }
  }

  enqueue(task: YaeTask): { success: boolean; error?: string } {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      return { success: false, error: "Queue is full" };
    }

    this._lastActiveAt = Date.now();
    this.queue.push(task);

    // Wake up the loop
    this.signal.resolve();
    return { success: true };
  }

  stop() {
    this.running = false;
    this.signal.resolve(); // Wake it up one last time so it exits the loop
  }

  private async loop() {
    while (this.running) {
      const task = this.queue.shift();

      if (task) {
        this._lastActiveAt = Date.now();

        try {
          await Bun.sleep(1000); // Simulate task processing

          console.log(`[Agent ${this.id}] Task success:`, task.type);
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          console.error(`[Agent ${this.id}] Task fail:`, error);
        }
      } else {
        // QUEUE EMPTY: Wait for the next 'enqueue' signal
        // This is NOT polling. It is a suspended promise.
        await this.signal.promise;
        // Once resolved, reset the signal for the next time the queue gets empty
        this.signal = this.createSignal();
      }
    }
  }
}
