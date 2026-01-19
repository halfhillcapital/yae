import { type AgentContext } from "@yae/db/index.ts";
import { WorkflowExecutor, type WorkflowResult } from "@yae/workflow/index.ts";
import { Yae } from "./yae.ts";

export class UserAgent {
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

  get workflows() {
    return this.ctx.workflows;
  }

  /**
   * Execute a workflow by checking out a worker from the pool.
   */
  async runWorkflow<T>(
    workflowId: string,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    const yae = Yae.getInstance();
    const worker = yae.checkoutWorker(this.id, workflowId);
    if (!worker) {
      throw new Error("No workers available in pool");
    }

    try {
      return await worker.execute<T>(workflowId, this.id, this.ctx, data);
    } finally {
      yae.returnWorker(worker.id);
    }
  }
}

/**
 * Stateless worker that executes workflows on behalf of agents.
 * Workers are pooled and shared across all agents.
 */
export class WorkerAgent {
  // Checkout metadata (set by Yae on checkout, cleared on return)
  currentAgentId: string | null = null;
  currentWorkflowId: string | null = null;

  constructor(public readonly id: string) {}

  /**
   * Execute a workflow with the given agent context.
   */
  async execute<T>(
    workflowId: string,
    agentId: string,
    ctx: AgentContext,
    initialData?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    const executor = new WorkflowExecutor(agentId, ctx);
    return executor.run(workflowId, initialData);
  }
}
