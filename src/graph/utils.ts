import {
  BaseNode,
  Node,
  ParallelNode,
  type NodeConfig,
  type ParallelNodeConfig,
} from "./node";
import { Flow, type FlowConfig } from "./flow";
import {
  isBranch,
  type GraphNode,
  type Branch,
  type Chainable,
  type Action,
} from "./types";

// Node Utilities

/**
 * Create typed node factories for a given state type.
 *
 * Bind your state type once, then create nodes with full type inference
 * for prep/exec/post parameters.
 *
 * @example
 * interface MyState { items: string[]; count: number }
 *
 * const { node, parallel } = createNodes<MyState>();
 *
 * const counter = node({
 *   prep: (s) => s.items,           // s is MyState, returns string[]
 *   exec: (items) => items.length,  // items inferred as string[], returns number
 *   post: (s, _prep, count) => {    // count inferred as number
 *     s.count = count;
 *     return undefined;
 *   },
 * });
 *
 * const batcher = parallel({
 *   prep: (s) => s.items,
 *   exec: (item) => item.toUpperCase(),
 *   post: (s, _items, results) => {
 *     s.items = results;
 *     return undefined;
 *   },
 * });
 */
export function createNodes<S>() {
  return {
    /** Create a sequential node with retry and timeout support. */
    node: <P = void, E = void>(config: NodeConfig<S, P, E>): Node<S, P, E> =>
      new Node<S, P, E>(config),
    /** Create a parallel node that processes prep results concurrently. */
    parallel: <P = void, E = void>(
      config: ParallelNodeConfig<S, P, E>,
    ): ParallelNode<S, P, E> => new ParallelNode<S, P, E>(config),
  };
}

/**
 * Internal helper that chains nodes/branches and returns both first and last references.
 * Used by `chain` and `branch` utilities.
 *
 * Handles both GraphNode and Branch ({ entry, exit }) items:
 * - GraphNode: connects directly
 * - Branch: connects to entry, continues from exit
 */
function linkChainables<S>(...items: Chainable<S>[]): {
  first: GraphNode<S>;
  last: GraphNode<S>;
} {
  if (items.length === 0) {
    throw new Error("At least one node required");
  }

  // Helper to get entry/exit points for any chainable
  const getPoints = (item: Chainable<S>) =>
    isBranch(item)
      ? { entry: item.entry, exit: item.exit }
      : { entry: item, exit: item };

  for (let i = 0; i < items.length - 1; i++) {
    const currentPoints = getPoints(items[i]!);
    const nextPoints = getPoints(items[i + 1]!);
    currentPoints.exit.to(nextPoints.entry);
  }

  return {
    first: getPoints(items[0]!).entry,
    last: getPoints(items[items.length - 1]!).exit,
  };
}

export function chain<S>(...items: Chainable<S>[]): GraphNode<S> {
  const { first } = linkChainables<S>(...items);
  return first;
}

/**
 * Creates a branching structure where `router` routes to different node chains
 * based on actions, with all branches converging to an auto-created exit node.
 *
 * Returns a Branch with entry and exit points, usable in chain():
 *
 * @example
 * // Use in chain() for natural flow
 * chain(
 *   node1,
 *   branch(router, {
 *     success: [processNode, saveNode],
 *     error: [logErrorNode],
 *   }),
 *   node2
 * );
 *
 * // Or use entry/exit directly
 * const { entry, exit } = branch(router, { ... });
 */
export function branch<S, K extends string>(
  router: GraphNode<S>,
  routes: Record<K, GraphNode<S>[]>,
): Branch<S> {
  const entries = Object.entries(routes) as [Action, GraphNode<S>[]][];

  if (entries.length === 0) {
    throw new Error("branch() requires at least one route");
  }

  const exit = new BaseNode<S>();

  for (const [action, nodes] of entries) {
    if (nodes.length === 0) {
      throw new Error(`branch() route "${action}" cannot be empty`);
    }
    const { first, last } = linkChainables<S>(...nodes);
    router.when(action, first);
    last.to(exit);
  }

  return { entry: router, exit };
}

// Flow Utilities

export function sequential<S>(
  nodes: GraphNode<S>[],
  config?: FlowConfig<S>,
): Flow<S> {
  if (nodes.length === 0) {
    throw new Error("sequential() requires at least one node");
  }
  return Flow.from(chain(...nodes), config);
}
