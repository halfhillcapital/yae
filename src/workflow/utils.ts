import {
  Node,
  ParallelNode,
  type NodeConfig,
  type ParallelNodeConfig,
} from "@yae/graph/node.ts";
import { Flow, type FlowConfig } from "@yae/graph/flow.ts";
import { chain } from "@yae/graph/utils.ts";
import type { GraphNode, Chainable } from "@yae/graph/types.ts";
import type { AgentState, WorkflowDefinition } from "./types.ts";

/** Curried factory for creating nodes that operate on AgentState. */
const agentNode = <T>() => {
  return <P = void, E = void>(config: NodeConfig<AgentState<T>, P, E>) => {
    return new Node<AgentState<T>, P, E>(config);
  };
};

/** Curried factory for creating parallel nodes that operate on AgentState. */
const agentParallel = <T>() => {
  return <P = void, E = void>(
    config: ParallelNodeConfig<AgentState<T>, P, E>,
  ) => {
    return new ParallelNode<AgentState<T>, P, E>(config);
  };
};

/**
 * Configuration for defining a workflow.
 */
export interface DefineWorkflowConfig<T> {
  /** Unique workflow identifier */
  id: string;
  /** Human-readable name */
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
    /** Curried node factory pre-bound to AgentState<T> */
    node: ReturnType<typeof agentNode<T>>;
    /** Curried parallel node factory pre-bound to AgentState<T> */
    parallel: ReturnType<typeof agentParallel<T>>;
    /** Chain utility for linking nodes */
    chain: typeof chain;
  }) => GraphNode<AgentState<T>> | Chainable<AgentState<T>>[];
  /** Optional flow configuration */
  flowConfig?: FlowConfig<AgentState<T>>;
}

/**
 * Define a workflow.
 *
 * @example
 * const counterWorkflow = defineWorkflow<{ count: number }>({
 *   id: "counter",
 *   name: "Counter Workflow",
 *   initialState: () => ({ count: 0 }),
 *   build: ({ node, chain }) => {
 *     const increment = node({
 *       name: "increment",
 *       post: (state) => {
 *         state.data.count++;
 *         return undefined;
 *       }
 *     });
 *
 *     const save = node({
 *       name: "save",
 *       post: async (state) => {
 *         await state.memory.set(
 *           "counter",
 *           "Current count",
 *           String(state.data.count)
 *         );
 *         return undefined;
 *       }
 *     });
 *
 *     return chain(increment, save);
 *   }
 * });
 *
 * // Register explicitly
 * WorkflowRegistry.register(counterWorkflow);
 *
 * @returns The workflow definition (must be registered separately with WorkflowRegistry.register())
 */
export function defineWorkflow<T>(
  config: DefineWorkflowConfig<T>,
): WorkflowDefinition<T> {
  // Validate config
  if (!config.id || typeof config.id !== "string") {
    throw new Error("Workflow id must be a non-empty string");
  }
  if (!config.name || typeof config.name !== "string") {
    throw new Error("Workflow name must be a non-empty string");
  }
  if (typeof config.build !== "function") {
    throw new Error("Workflow build must be a function");
  }
  if (typeof config.initialState !== "function") {
    throw new Error("Workflow initialState must be a function");
  }

  // Pre-build helpers (stateless, can be shared)
  const helpers = {
    node: agentNode<T>(),
    parallel: agentParallel<T>(),
    chain,
  };

  const definition: WorkflowDefinition<T> = {
    id: config.id,
    name: config.name,
    description: config.description,
    create: (initialData?: Partial<T>) => {
      const initialState = { ...config.initialState(), ...initialData };

      const graphResult = config.build(helpers);

      // Handle both single node and array of nodes
      const startNode = Array.isArray(graphResult)
        ? chain<AgentState<T>>(...graphResult)
        : graphResult;

      const flow = Flow.from(startNode, {
        name: config.id,
        ...config.flowConfig,
      });

      return { flow, initialState };
    },
  };

  return definition;
}
