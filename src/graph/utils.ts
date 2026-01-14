import {
  Node,
  ParallelNode,
  type GraphNode,
  type NodeConfig,
  type ParallelNodeConfig,
} from "./node";
import { Flow, type FlowConfig } from "./flow";

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

function chain<S>(...nodes: GraphNode<S>[]): GraphNode<S> {
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
  if (!first) throw new Error("Unexpected undefined first node in chain");

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

// Flow Utilities

function sequential<S>(nodes: GraphNode<S>[], config?: FlowConfig<S>): Flow<S> {
  if (nodes.length === 0) {
    throw new Error("sequential() requires at least one node");
  }
  return Flow.from(chain(...nodes), config);
}

export { node, parallel, chain, converge, sequential };
