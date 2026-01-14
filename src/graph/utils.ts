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

function ouroboros<S>(...nodes: GraphNode<S>[]): {
  first: GraphNode<S>;
  last: GraphNode<S>;
} {
  if (nodes.length === 0) {
    throw new Error("chain() requires at least one node");
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

function branch<K extends string, T extends GraphNode<S>, S>(start: GraphNode<S>, routes: Record<K, T[]>, end: GraphNode<S>): GraphNode<S> {
  for (const [action, nodes] of Object.entries(routes) as [Action, T[]][]) {
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
