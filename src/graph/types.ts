interface GraphNode<S> {
  name?: string;
  work(shared: S): Promise<NextAction>;
  next(action?: Action): GraphNode<S> | undefined;
  to(target: Chainable<S>): GraphNode<S>;
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

/**
 * Type guard to check if a Chainable is a Branch.
 */
function isBranch<S>(item: Chainable<S>): item is Branch<S> {
  return (
    typeof item === "object" &&
    item !== null &&
    "entry" in item &&
    "exit" in item
  );
}

type Action = string;
type NextAction = Action | undefined;

export { isBranch };
export type { GraphNode, Branch, Chainable, Action, NextAction };
