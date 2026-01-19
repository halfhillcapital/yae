import type { Flow } from "@yae/graph/index.ts";
import type {
  MemoryRepository,
  MessagesRepository,
  FileRepository,
} from "@yae/db/repositories/index.ts";

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
    workflowId: string;
    startedAt: number;
  };
}

export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Persisted record of a workflow execution.
 */
export interface WorkflowRun<T = Record<string, unknown>> {
  id: string;
  workflowId: string;
  agentId: string;
  status: WorkflowStatus;
  /** Serialized workflow-specific data */
  state: T;
  /** Error message if status is 'failed' */
  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * Definition for a workflow type.
 * Used to register workflows in the registry.
 */
export interface WorkflowDefinition<T = Record<string, unknown>> {
  id: string;
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
  runId: string;
  status: WorkflowStatus;
  finalAction?: string;
  state: T;
  duration: number;
  error?: string;
}
