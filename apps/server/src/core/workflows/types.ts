import type { AgentContext, WorkflowStatus } from "@yae/db";

/**
 * Shared state object passed through workflow nodes.
 * Provides readonly access to agent context (memory, messages, files)
 * and mutable workflow-specific data.
 */
export interface AgentState<T = Record<string, unknown>> {
  /** Agent context providing access to memory, messages, and files */
  readonly ctx: AgentContext;
  /** Workflow-specific data (mutable) */
  data: T;
  /** Runtime info about the current workflow execution */
  readonly run: {
    id: string;
    workflow: string;
    started_at: number;
  };
}

/**
 * Definition for a workflow type.
 */
export interface WorkflowDefinition<T = Record<string, unknown>> {
  name: string;
  description?: string;
  /**
   * Factory function that creates the flow and initial state.
   * Called when starting a new workflow run.
   */
  create: (initialData?: Partial<T>) => {
    flow: import("@yae/graph").Flow<AgentState<T>>;
    initialState: T;
  };
}

/**
 * Result returned after a workflow completes or fails.
 */
export interface WorkflowResult<T = Record<string, unknown>> {
  run: string;
  status: WorkflowStatus;
  state: T;
  duration: number;
  error?: string;
}
