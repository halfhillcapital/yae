import { type AgentContext } from "@yae/db/index.ts";
import {
  runWorkflow,
  type WorkflowDefinition,
  type WorkflowResult,
} from "./workflows/index.ts";
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
    workflow: WorkflowDefinition<T>,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    const yae = Yae.getInstance();
    const worker = yae.checkoutWorker(this.id);
    if (!worker) {
      throw new Error("No workers available in pool");
    }

    try {
      worker.currentOwner = this.id;
      worker.currentWorkflow = workflow.name;
      return await worker.execute(workflow, this.id, this.ctx, data);
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
  currentOwner: string | null = null;
  currentWorkflow: string | null = null;

  constructor(public readonly id: string) {}

  /**
   * Execute a workflow with the given agent context.
   */
  async execute<T>(
    workflow: WorkflowDefinition<T>,
    agentId: string,
    ctx: AgentContext,
    initialData?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    return runWorkflow(workflow, agentId, ctx, initialData);
  }
}
