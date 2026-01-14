import {
  Node,
  ParallelNode,
  type GraphNode,
  type NodeConfig,
  type ParallelNodeConfig,
} from "./node";
import { Flow, type FlowConfig } from "./flow";
import type { Action } from "./types";

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
 * Internal helper that chains nodes and returns both first and last references.
 * Used by `chain` and `branch` utilities.
 */
function ouroboros<S>(...nodes: GraphNode<S>[]): {
  first: GraphNode<S>;
  last: GraphNode<S>;
} {
  if (nodes.length === 0) {
    throw new Error("At least one node required");
  }

  for (let i = 0; i < nodes.length - 1; i++) {
    const current = nodes[i];
    const next = nodes[i + 1];

    if (!current || !next)
      throw new Error("Unexpected undefined node in chain");

    current.to(next);
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (!first || !last) {
    throw new Error("Unexpected undefined first or last node");
  }

  return { first, last };
}

function chain<S>(...nodes: GraphNode<S>[]): GraphNode<S> {
  const { first } = ouroboros<S>(...nodes);
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
 * Creates a branching structure where `start` routes to different node chains
 * based on actions, with all branches converging to `end`.
 *
 * @example
 * branch(router, {
 *   success: [processNode, saveNode],
 *   error: [logErrorNode],
 * }, finalNode);
 */
function branch<S, K extends string, T extends GraphNode<S>>(
  start: GraphNode<S>,
  routes: Record<K, T[]>,
  end: GraphNode<S>,
): GraphNode<S> {
  const entries = Object.entries(routes) as [Action, T[]][];

  if (entries.length === 0) {
    throw new Error("branch() requires at least one route");
  }

  for (const [action, nodes] of entries) {
    if (nodes.length === 0) {
      throw new Error(`branch() route "${action}" cannot be empty`);
    }
    const { first, last } = ouroboros<S>(...nodes);
    start.when(action, first);
    last.to(end);
  }

  return end;
}

// Flow Utilities

function sequential<S>(nodes: GraphNode<S>[], config?: FlowConfig<S>): Flow<S> {
  if (nodes.length === 0) {
    throw new Error("sequential() requires at least one node");
  }
  return Flow.from(chain(...nodes), config);
}

export { node, parallel, chain, branch, converge, sequential };
