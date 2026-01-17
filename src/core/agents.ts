import { type AgentContext } from "@yae/db/index.ts";
import { WorkflowExecutor, type WorkflowResult } from "@yae/workflow/index.ts";

const MAX_QUEUE_SIZE = 100;

export class YaeAgent {
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

  /**
   * Get or create a worker for task execution.
   * Currently uses a single worker; ready for pool expansion.
   */
  getWorker(): WorkerAgent {
    if (this.workers.length === 0) {
      this.workers.push(
        new WorkerAgent(crypto.randomUUID(), this.id, this.ctx),
      );
    }
    return this.workers[0]!;
  }

  /**
   * Execute a workflow by delegating to a worker.
   */
  async runWorkflow<T>(
    workflowId: string,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    return this.getWorker().enqueue<T>(workflowId, data);
  }

  /**
   * Stop all workers and clean up.
   */
  shutdown(): void {
    for (const worker of this.workers) {
      worker.stop();
    }
    this.workers = [];
  }
}

type QueueItem = {
  workflowId: string;
  initialData?: Record<string, unknown>;
  resolve: (result: WorkflowResult<unknown>) => void;
  reject: (error: Error) => void;
};

export class WorkerAgent {
  private queue: QueueItem[] = [];
  private _lastActiveAt: number = Date.now();
  private signal: { promise: Promise<void>; resolve: () => void };
  private running: boolean = true;
  private readonly executor: WorkflowExecutor;

  constructor(
    public readonly id: string,
    public readonly agentId: string,
    ctx: AgentContext,
  ) {
    this.executor = new WorkflowExecutor(agentId, ctx);
    this.signal = this.createSignal();
    this.loop();
  }

  get lastActiveAt(): number {
    return this._lastActiveAt;
  }

  /**
   * Enqueue a workflow execution.
   * Returns a promise that resolves when the workflow completes.
   */
  enqueue<T>(
    workflowId: string,
    initialData?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        reject(new Error("Queue is full"));
        return;
      }

      this._lastActiveAt = Date.now();
      this.queue.push({
        workflowId,
        initialData: initialData as Record<string, unknown>,
        resolve: resolve as (result: WorkflowResult<unknown>) => void,
        reject,
      });

      this.signal.resolve();
    });
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
      const item = this.queue.shift();

      if (item) {
        this._lastActiveAt = Date.now();
        await this.execute(item);
      } else {
        // QUEUE EMPTY: Wait for the next 'enqueue' signal
        // This is NOT polling. It is a suspended promise.
        await this.signal.promise;
        // Once resolved, reset the signal for the next time the queue gets empty
        this.signal = this.createSignal();
      }
    }
  }

  private async execute(task: QueueItem): Promise<void> {
    try {
      const result = await this.executor.run(task.workflowId, task.initialData);
      task.resolve(result);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(`[Worker ${this.id}] Workflow failed:`, error.message);
      task.reject(error);
    }
  }
}
