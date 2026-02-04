import type { AgentContext } from "@yae/db";
import type { WorkflowRepository } from "@yae/db/repositories/workflow.ts";
import type {
  WorkflowDefinition,
  WorkflowResult,
} from "@yae/core/workflows/types.ts";
import { runWorkflow } from "@yae/core/workflows/utils.ts";

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
    workflows: WorkflowRepository,
    initialData?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    return runWorkflow(workflow, agentId, ctx, workflows, initialData);
  }
}
