import { type AgentContext } from "@yae/db/index.ts";
import {
  WorkflowExecutor,
  type WorkflowResult,
  type WorkflowTask,
} from "@yae/workflow/index.ts";

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
    return this.getWorker().enqueueWorkflow<T>(workflowId, data);
  }

  /**
   * Resume a paused or failed workflow run.
   */
  async resumeWorkflow<T>(runId: string): Promise<WorkflowResult<T>> {
    return this.getWorker().resumeWorkflow<T>(runId);
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

type QueueItem = WorkflowTask | { type: "simple"; task: string };

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
   * Enqueue a simple task (backwards compatibility).
   */
  enqueue(task: string): { success: boolean; error?: string } {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      return { success: false, error: "Queue is full" };
    }

    this._lastActiveAt = Date.now();
    this.queue.push({ type: "simple", task });

    // Wake up the loop
    this.signal.resolve();
    return { success: true };
  }

  /**
   * Enqueue a workflow execution.
   * Returns a promise that resolves when the workflow completes.
   */
  enqueueWorkflow<T>(
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
        type: "workflow",
        workflowId,
        initialData: initialData as Record<string, unknown>,
        resolve: resolve as (result: WorkflowResult<unknown>) => void,
        reject,
      });

      this.signal.resolve();
    });
  }

  /**
   * Enqueue a workflow resumption.
   * Returns a promise that resolves when the workflow completes.
   */
  resumeWorkflow<T>(runId: string): Promise<WorkflowResult<T>> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        reject(new Error("Queue is full"));
        return;
      }

      this._lastActiveAt = Date.now();
      this.queue.push({
        type: "workflow",
        workflowId: "", // Not needed for resumption
        runId,
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

        if (item.type === "workflow") {
          await this.executeWorkflow(item);
        } else {
          await this.executeSimple(item.task);
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

  private async executeWorkflow(task: WorkflowTask): Promise<void> {
    try {
      let result: WorkflowResult<unknown>;

      if (task.runId) {
        // Resumption
        result = await this.executor.resume(task.runId);
      } else {
        // New execution
        result = await this.executor.run(task.workflowId, task.initialData);
      }

      task.resolve(result);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(`[Worker ${this.id}] Workflow failed:`, error.message);
      task.reject(error);
    }
  }

  private async executeSimple(task: string): Promise<void> {
    try {
      await Bun.sleep(1000); // Simulate task processing
      console.log(`[Worker ${this.id}] Task success:`, task);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[Worker ${this.id}] Task fail:`, error);
    }
  }
}
