import type { AgentContext } from "@yae/db/context.ts";
import { Flow } from "@yae/graph/flow.ts";
import { WorkflowRegistry } from "./registry.ts";
import type {
  AgentState,
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
    workflowId: string,
    initialData?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    const definition = WorkflowRegistry.get<T>(workflowId);
    if (!definition) {
      throw new Error(`Workflow "${workflowId}" not found in registry`);
    }

    const runId = crypto.randomUUID();
    const startedAt = Date.now();

    const { flow, initialState } = definition.create(initialData);
    const state: T = { ...initialState, ...initialData };

    const run: WorkflowRun<T> = {
      id: runId,
      workflowId,
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
        workflowId: flow.name ?? "unknown",
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
      error = err instanceof Error ? err.message : String(err);
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
