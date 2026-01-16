import { type AgentContext } from "@yae/db/index.ts";

const MAX_QUEUE_SIZE = 100;

class YaeAgent {
  private workers: WorkerAgent[] = [];

  constructor(
    public readonly id: string,
    public readonly userId: string,
    private readonly ctx: AgentContext,
  ) {}

  get memory() {
    return this.ctx.memory;
  }

  get messages() {
    return this.ctx.messages;
  }

  get files() {
    return this.ctx.files;
  }
}

class WorkerAgent {
  private queue: string[] = [];
  private _lastActiveAt: number = Date.now();
  private signal: { promise: Promise<void>; resolve: () => void };
  private running: boolean = true;

  constructor(
    public readonly id: string,
    public readonly agentId: string,
  ) {
    this.signal = this.createSignal();
    this.loop();
  }

  get lastActiveAt(): number {
    return this._lastActiveAt;
  }

  enqueue(task: string): { success: boolean; error?: string } {
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

  private createSignal() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  private async loop() {
    while (this.running) {
      const task = this.queue.shift();

      if (task) {
        this._lastActiveAt = Date.now();

        try {
          await Bun.sleep(1000); // Simulate task processing

          console.log(`[Agent ${this.id}] Task success:`, task);
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

export { YaeAgent, WorkerAgent };
