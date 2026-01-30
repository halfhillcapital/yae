import type { AgentContext } from "@yae/db";
import {
  runWorkflow,
  type WorkflowDefinition,
  type WorkflowResult,
} from "@yae/core/workflows";

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
