import {
  BaseNode,
  Node,
  ParallelNode,
  type GraphNode,
  type NodeConfig,
  type ParallelNodeConfig,
} from "./node";
import { Flow, type FlowConfig } from "./flow";
import type { Action } from "./types";

/**
 * A branch structure with entry and exit points for use in chain().
 */
type Branch<S> = {
  entry: GraphNode<S>;
  exit: GraphNode<S>;
};

/**
 * Either a single node or a branch structure that can be used in chain().
 */
type Chainable<S> = GraphNode<S> | Branch<S>;

function isBranch<S>(item: Chainable<S>): item is Branch<S> {
  return (
    typeof item === "object" &&
    item !== null &&
    "entry" in item &&
    "exit" in item
  );
}

// Node Utilities

/**
 * A curried factory to enable partial type inference.
 * node<State>()(...) and parallel<State>()(...) allows
 * you to define the State once and have P and E inferred
 * automatically from your logic.
 */
const node = <S>() => {
  return <P = void, E = void>(config: NodeConfig<S, P, E>) => {
    return new Node<S, P, E>(config);
  };
};

const parallel = <S>() => {
  return <P = void, E = void>(config: ParallelNodeConfig<S, P, E>) => {
    return new ParallelNode<S, P, E>(config);
  };
};

/**
 * Internal helper that chains nodes/branches and returns both first and last references.
 * Used by `chain` and `branch` utilities.
 *
 * Handles both GraphNode and Branch ({ entry, exit }) items:
 * - GraphNode: connects directly
 * - Branch: connects to entry, continues from exit
 */
function ouroboros<S>(...items: Chainable<S>[]): {
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
    const current = items[i];
    const next = items[i + 1];

    if (!current || !next)
      throw new Error("Unexpected undefined node in chain");

    const currentPoints = getPoints(current);
    const nextPoints = getPoints(next);

    currentPoints.exit.to(nextPoints.entry);
  }

  const firstItem = items[0];
  const lastItem = items[items.length - 1];

  if (!firstItem || !lastItem) {
    throw new Error("Unexpected undefined first or last node");
  }

  return {
    first: getPoints(firstItem).entry,
    last: getPoints(lastItem).exit,
  };
}

function chain<S>(...items: Chainable<S>[]): GraphNode<S> {
  const { first } = ouroboros<S>(...items);
  return first;
}

function converge<S>(
  nodes: GraphNode<S>[],
  target: GraphNode<S>,
): GraphNode<S> {
  if (nodes.length === 0) {
    throw new Error("converge() requires at least one node");
  }

  for (const node of nodes) {
    node.to(target);
  }
  return target;
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
function branch<S, K extends string>(
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
    const { first, last } = ouroboros<S>(...nodes);
    router.when(action, first);
    last.to(exit);
  }

  return { entry: router, exit };
}

// Flow Utilities

function sequential<S>(nodes: GraphNode<S>[], config?: FlowConfig<S>): Flow<S> {
  if (nodes.length === 0) {
    throw new Error("sequential() requires at least one node");
  }
  return Flow.from(chain(...nodes), config);
}

export { node, parallel, chain, branch, converge, sequential };
export type { Branch, Chainable };
