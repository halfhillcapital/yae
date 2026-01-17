import type { AgentContext } from "@yae/db/context.ts";
import { Flow, type FlowConfig } from "@yae/graph/flow.ts";
import { WorkflowRegistry } from "./registry.ts";
import type {
  AgentState,
  WorkflowRun,
  WorkflowResult,
  WorkflowStatus,
} from "./types.ts";

/**
 * Workflow execution engine.
 * Manages workflow lifecycle: run, resume, pause, cancel.
 * Uses Flow's onCheckpoint callback for state persistence.
 */
export class WorkflowExecutor {
  private activeRuns = new Map<
    string,
    { cancel: () => void; paused: boolean }
  >();

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
   * Resume a paused or failed workflow execution.
   */
  async resume<T>(runId: string): Promise<WorkflowResult<T>> {
    const run = await this.ctx.workflows.get<T>(runId);
    if (!run) {
      throw new Error(`Workflow run "${runId}" not found`);
    }

    if (run.status !== "paused" && run.status !== "failed") {
      throw new Error(
        `Cannot resume workflow with status "${run.status}". Only "paused" or "failed" runs can be resumed.`,
      );
    }

    const definition = WorkflowRegistry.get<T>(run.workflowId);
    if (!definition) {
      throw new Error(`Workflow "${run.workflowId}" not found in registry`);
    }

    const { flow } = definition.create(run.state);

    await this.ctx.workflows.update(runId, {
      status: "running",
    });

    return this.execute(runId, flow, run.state, run.startedAt);
  }

  /**
   * Pause a running workflow.
   * The workflow will complete its current node then stop.
   */
  pause(runId: string): boolean {
    const active = this.activeRuns.get(runId);
    if (!active) {
      return false;
    }
    active.paused = true;
    return true;
  }

  /**
   * Cancel a running workflow.
   */
  async cancel(runId: string): Promise<boolean> {
    const active = this.activeRuns.get(runId);
    if (active) {
      active.cancel();
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
    // Using explicit type to prevent narrowing - callbacks can mutate this
    let finalStatus = "completed" as WorkflowStatus;
    let finalAction: string | undefined;
    let error: string | undefined;

    this.activeRuns.set(runId, {
      cancel: () => {
        cancelled = true;
      },
      paused: false,
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

    const checkpointConfig: Partial<FlowConfig<AgentState<T>>> = {
      onCheckpoint: async (shared, nodeId, action) => {
        const active = this.activeRuns.get(runId);

        // Check for pause request
        if (active?.paused) {
          await this.ctx.workflows.update(runId, {
            status: "paused",
            state: shared.data,
            currentNode: nodeId,
            lastAction: action,
          });
          throw new WorkflowPausedError(runId);
        }

        // Check for cancellation
        if (cancelled) {
          throw new WorkflowCancelledError(runId);
        }

        // Persist checkpoint
        await this.ctx.workflows.update(runId, {
          state: shared.data,
          currentNode: nodeId,
          lastAction: action,
        });
      },
      onError: async (err, node, shared) => {
        error = err.message;
        finalStatus = "failed";

        await this.ctx.workflows.update(runId, {
          status: "failed",
          state: shared.data,
          currentNode: node.name,
          error: err.message,
        });
      },
    };

    // Merge checkpoint config with existing flow config
    const flowWithCheckpoint = Object.assign(
      Object.create(Object.getPrototypeOf(flow)),
      flow,
    );
    const originalConfig = (
      flowWithCheckpoint as { config?: FlowConfig<AgentState<T>> }
    ).config;
    (flowWithCheckpoint as { config: FlowConfig<AgentState<T>> }).config = {
      ...originalConfig,
      ...checkpointConfig,
      onNodeExecute: async (node, action) => {
        await originalConfig?.onNodeExecute?.(node, action);
      },
      beforeStart: async (shared) => {
        await originalConfig?.beforeStart?.(shared);
      },
      afterComplete: async (shared, action) => {
        await originalConfig?.afterComplete?.(shared, action);
        finalAction = action;
      },
    };

    try {
      finalAction = await flowWithCheckpoint.run(agentState);
      finalStatus = "completed";

      await this.ctx.workflows.update(runId, {
        status: "completed",
        state: agentState.data,
        lastAction: finalAction,
        completedAt: Date.now(),
      });
    } catch (err) {
      if (err instanceof WorkflowPausedError) {
        finalStatus = "paused";
      } else if (err instanceof WorkflowCancelledError) {
        finalStatus = "cancelled";
        await this.ctx.workflows.update(runId, {
          status: "cancelled",
          state: agentState.data,
          completedAt: Date.now(),
        });
      } else if (finalStatus !== "failed") {
        // Error wasn't handled by onError
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

class WorkflowPausedError extends Error {
  constructor(public readonly runId: string) {
    super(`Workflow ${runId} was paused`);
    this.name = "WorkflowPausedError";
  }
}

class WorkflowCancelledError extends Error {
  constructor(public readonly runId: string) {
    super(`Workflow ${runId} was cancelled`);
    this.name = "WorkflowCancelledError";
  }
}
