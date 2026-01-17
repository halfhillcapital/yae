export interface GraphNode<S> {
  name?: string;
  to(target: Chainable<S>): GraphNode<S>;
  when<T extends GraphNode<S>>(action: Action, node: T): this;
  next(action?: Action): GraphNode<S> | undefined;
  work(shared: S): Promise<NextAction>;
  clone(): GraphNode<S>;
}

/** A branch structure with entry and exit points for use in chain(). */
export type Branch<S> = {
  entry: GraphNode<S>;
  exit: GraphNode<S>;
};

/** Either a single node or a branch structure that can be used in chain(). */
export type Chainable<S> = GraphNode<S> | Branch<S>;

/** Type guard to check if a Chainable is a Branch. */
export function isBranch<S>(item: Chainable<S>): item is Branch<S> {
  return (
    typeof item === "object" &&
    item !== null &&
    "entry" in item &&
    "exit" in item
  );
}

export type Action = string;
export type NextAction = Action | undefined;
