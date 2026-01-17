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
 * Manages workflow lifecycle: run and cancel.
 */
export class WorkflowExecutor {
  private activeRuns = new Map<string, () => void>();

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

  /**
   * Cancel a running workflow.
   */
  async cancel(runId: string): Promise<boolean> {
    const cancelFn = this.activeRuns.get(runId);
    if (cancelFn) {
      cancelFn();
      this.activeRuns.delete(runId);
    }

    const run = await this.ctx.workflows.get(runId);
    if (!run || run.status === "completed" || run.status === "cancelled") {
      return false;
    }

    await this.ctx.workflows.update(runId, {
      status: "cancelled",
      completedAt: Date.now(),
    });

    return true;
  }

  /**
   * Get run history for this agent.
   */
  async history<T>(limit = 50): Promise<WorkflowRun<T>[]> {
    return this.ctx.workflows.listByAgent<T>(this.agentId, limit);
  }

  /**
   * Get a specific workflow run.
   */
  async getRun<T>(runId: string): Promise<WorkflowRun<T> | null> {
    return this.ctx.workflows.get<T>(runId);
  }

  private async execute<T>(
    runId: string,
    flow: Flow<AgentState<T>>,
    state: T,
    startedAt: number,
  ): Promise<WorkflowResult<T>> {
    let cancelled = false;
    let finalStatus: WorkflowStatus = "completed";
    let finalAction: string | undefined;
    let error: string | undefined;

    this.activeRuns.set(runId, () => {
      cancelled = true;
    });

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
      finalAction = await flow.run(agentState);

      if (cancelled) {
        finalStatus = "cancelled";
        await this.ctx.workflows.update(runId, {
          status: "cancelled",
          state: agentState.data,
          completedAt: Date.now(),
        });
      } else {
        finalStatus = "completed";
        await this.ctx.workflows.update(runId, {
          status: "completed",
          state: agentState.data,
          completedAt: Date.now(),
        });
      }
    } catch (err) {
      if (cancelled) {
        finalStatus = "cancelled";
        await this.ctx.workflows.update(runId, {
          status: "cancelled",
          state: agentState.data,
          completedAt: Date.now(),
        });
      } else {
        error = err instanceof Error ? err.message : String(err);
        finalStatus = "failed";
        await this.ctx.workflows.update(runId, {
          status: "failed",
          state: agentState.data,
          error,
        });
      }
    } finally {
      this.activeRuns.delete(runId);
    }

    return {
      runId,
      status: finalStatus,
      finalAction,
      state: agentState.data,
      duration: Date.now() - startedAt,
      error,
    };
  }
}
