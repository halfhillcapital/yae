// =============================================================================
// Types
// =============================================================================

import { Flow, createNodes, branch, chain } from "@yae/graph";
import type { GraphNode, Chainable, FlowConfig } from "@yae/graph";
import type {
  AgentContext,
  MemoryRepository,
  MessagesRepository,
  FileRepository,
} from "@yae/db";

/**
 * Shared state object passed through workflow nodes.
 * Provides readonly access to agent context (memory, messages, files)
 * and mutable workflow-specific data.
 */
export interface AgentState<T = Record<string, unknown>> {
  /** Labeled memory blocks with in-memory cache */
  readonly memory: MemoryRepository;
  /** Conversation history */
  readonly messages: MessagesRepository;
  /** File system operations */
  readonly files: FileRepository;
  /** Workflow-specific data (mutable) */
  data: T;
  /** Runtime info about the current workflow execution */
  readonly run: {
    id: string;
    workflow: string;
    started_at: number;
  };
}

export type WorkflowStatus = "pending" | "running" | "completed" | "failed";

/**
 * Persisted record of a workflow execution.
 */
export interface WorkflowRun<T = Record<string, unknown>> {
  id: string;
  workflow: string;
  agent_id: string;
  status: WorkflowStatus;
  /** Serialized workflow-specific data */
  state: T;
  /** Error message if status is 'failed' */
  error?: string;
  started_at: number;
  updated_at: number;
  completed_at?: number;
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
    flow: Flow<AgentState<T>>;
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

// =============================================================================
// Node Factories
// =============================================================================

/**
 * Create typed node factories for workflow nodes that operate on AgentState.
 *
 * @example
 * const { node, parallel } = createWorkflowNodes<{ count: number }>();
 *
 * const increment = node({
 *   name: "increment",
 *   post: (state) => {
 *     state.data.count++;
 *     return undefined;
 *   },
 * });
 */
export function createWorkflowNodes<T>() {
  return createNodes<AgentState<T>>();
}

// =============================================================================
// Workflow Definition Helpers
// =============================================================================

/**
 * Configuration for defining a workflow.
 */
export interface DefineWorkflowConfig<T> {
  /** Workflow name */
  name: string;
  /** Optional description */
  description?: string;
  /** Factory function for the initial state */
  initialState: () => T;
  /**
   * Build function that constructs the workflow graph.
   * Receives helper utilities and returns the starting node.
   */
  build: (helpers: {
    /** Create a sequential node */
    node: ReturnType<typeof createWorkflowNodes<T>>["node"];
    /** Create a parallel node */
    parallel: ReturnType<typeof createWorkflowNodes<T>>["parallel"];
    /** Chain utility for linking nodes */
    chain: typeof chain;
    /** Branch utility for conditional routing */
    branch: typeof branch;
  }) => GraphNode<AgentState<T>> | Chainable<AgentState<T>>[];
  /** Optional flow configuration */
  flowConfig?: FlowConfig<AgentState<T>>;
}

/**
 * Define a workflow with inline graph construction.
 *
 * @example
 * const counterWorkflow = defineWorkflow<{ count: number }>({
 *   name: "counter",
 *   initialState: () => ({ count: 0 }),
 *   build: ({ node, chain }) => {
 *     const increment = node({
 *       name: "increment",
 *       post: (state) => {
 *         state.data.count++;
 *         return undefined;
 *       }
 *     });
 *     return chain(increment);
 *   }
 * });
 */
export function defineWorkflow<T>(
  config: DefineWorkflowConfig<T>,
): WorkflowDefinition<T> {
  if (!config.name || typeof config.name !== "string") {
    throw new Error("Workflow name must be a non-empty string");
  }
  if (typeof config.build !== "function") {
    throw new Error("Workflow build must be a function");
  }
  if (typeof config.initialState !== "function") {
    throw new Error("Workflow initialState must be a function");
  }

  const { node, parallel } = createWorkflowNodes<T>();

  const helpers = {
    node,
    parallel,
    chain,
    branch,
  };

  return {
    name: config.name,
    description: config.description,
    create: (initialData?: Partial<T>) => {
      const initialState = structuredClone({
        ...config.initialState(),
        ...initialData,
      });

      const graphResult = config.build(helpers);
      const startNode = Array.isArray(graphResult)
        ? chain<AgentState<T>>(...graphResult)
        : graphResult;

      const flow = Flow.from(startNode, {
        name: config.name,
        ...config.flowConfig,
      });

      return { flow, initialState };
    },
  };
}

/**
 * Configuration for creating a workflow from a flow factory.
 */
export interface CreateWorkflowConfig<T> {
  /** Workflow name */
  name: string;
  /** Optional description */
  description?: string;
  /** Factory function for the initial state */
  initialState: () => T;
  /** Factory function that creates the flow */
  flow: () => Flow<AgentState<T>>;
}

/**
 * Create a workflow from a flow factory.
 * Use this when you want to define nodes separately and compose them freely.
 *
 * @example
 * const { node } = createWorkflowNodes<{ count: number }>();
 *
 * const increment = node({
 *   name: "increment",
 *   post: (state) => {
 *     state.data.count++;
 *     return undefined;
 *   }
 * });
 *
 * const workflow = createWorkflow({
 *   name: "counter",
 *   initialState: () => ({ count: 0 }),
 *   flow: () => Flow.from(increment),
 * });
 */
export function createWorkflow<T>(
  config: CreateWorkflowConfig<T>,
): WorkflowDefinition<T> {
  if (!config.name || typeof config.name !== "string") {
    throw new Error("Workflow name must be a non-empty string");
  }
  if (typeof config.flow !== "function") {
    throw new Error("Workflow flow must be a factory function");
  }
  if (typeof config.initialState !== "function") {
    throw new Error("Workflow initialState must be a function");
  }

  return {
    name: config.name,
    description: config.description,
    create: (initialData?: Partial<T>) => ({
      flow: config.flow(),
      initialState: structuredClone({
        ...config.initialState(),
        ...initialData,
      }),
    }),
  };
}

// =============================================================================
// Workflow Execution
// =============================================================================

/**
 * Execute a workflow with the given agent context.
 * This is the core execution function used by WorkerAgent and for testing.
 */
export async function runWorkflow<T>(
  workflow: WorkflowDefinition<T>,
  agent_id: string,
  ctx: AgentContext,
  initialData?: Partial<T>,
): Promise<WorkflowResult<T>> {
  const id = crypto.randomUUID();
  const started_at = Date.now();

  const { flow, initialState: state } = workflow.create(initialData);

  const run: WorkflowRun<T> = {
    id,
    workflow: workflow.name,
    agent_id,
    status: "running",
    state,
    started_at,
    updated_at: started_at,
  };

  await ctx.workflows.create(run);

  let finalStatus: WorkflowStatus = "completed";
  let error: string | undefined;

  const agentState: AgentState<T> = {
    memory: ctx.memory,
    messages: ctx.messages,
    files: ctx.files,
    data: state,
    run: {
      id,
      workflow: flow.name ?? "unknown",
      started_at,
    },
  };

  try {
    await flow.run(agentState);
    await ctx.workflows.update(id, {
      status: "completed",
      state: agentState.data,
      completed_at: Date.now(),
    });
  } catch (err) {
    error = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    finalStatus = "failed";
    await ctx.workflows.update(id, {
      status: "failed",
      state: agentState.data,
      error,
    });
  }

  return {
    run: id,
    status: finalStatus,
    state: agentState.data,
    duration: Date.now() - started_at,
    error,
  };
}
