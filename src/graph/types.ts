interface GraphNode<S> {
  name?: string;
  work(shared: S): Promise<NextAction>;
  next(action?: Action): GraphNode<S> | undefined;
  to<T extends GraphNode<S>>(node: T): T;
  when<T extends GraphNode<S>>(action: Action, node: T): this;
  clone(): GraphNode<S>;
}

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

type Action = string;
type NextAction = Action | undefined;

export type { GraphNode, Branch, Chainable, Action, NextAction };
