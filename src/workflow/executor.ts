import type { AgentContext } from "@yae/db/context.ts";
import type { Flow } from "@yae/graph/flow.ts";
import type {
  AgentState,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowResult,
  WorkflowStatus,
} from "./types.ts";

/**
 * Workflow execution engine.
 * Executes a single workflow run.
 */
export class WorkflowExecutor {
  constructor(
    private readonly agentId: string,
    private readonly ctx: AgentContext,
  ) {}

  /**
   * Start a new workflow execution.
   */
  async run<T>(
    workflow: WorkflowDefinition<T>,
    initialData?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    const runId = crypto.randomUUID();
    const startedAt = Date.now();

    const { flow, initialState: state } = workflow.create(initialData);

    const run: WorkflowRun<T> = {
      id: runId,
      workflow: workflow.name,
      agentId: this.agentId,
      status: "running",
      state,
      startedAt,
      updatedAt: startedAt,
    };

    await this.ctx.workflows.create(run);

    return this.execute(runId, flow, state, startedAt);
  }

  private async execute<T>(
    runId: string,
    flow: Flow<AgentState<T>>,
    state: T,
    startedAt: number,
  ): Promise<WorkflowResult<T>> {
    let finalStatus: WorkflowStatus = "completed";
    let error: string | undefined;

    const agentState: AgentState<T> = {
      memory: this.ctx.memory,
      messages: this.ctx.messages,
      files: this.ctx.files,
      data: state,
      run: {
        id: runId,
        workflow: flow.name ?? "unknown",
        startedAt,
      },
    };

    try {
      await flow.run(agentState);
      await this.ctx.workflows.update(runId, {
        status: "completed",
        state: agentState.data,
        completedAt: Date.now(),
      });
    } catch (err) {
      error =
        err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      finalStatus = "failed";
      await this.ctx.workflows.update(runId, {
        status: "failed",
        state: agentState.data,
        error,
      });
    }

    return {
      runId,
      status: finalStatus,
      state: agentState.data,
      duration: Date.now() - startedAt,
      error,
    };
  }
}
