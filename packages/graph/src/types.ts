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

/** Configuration for retry behavior on node execution failures. */
export type RetryConfig<P = void, E = void> = {
  maxAttempts: number;
  delay?: number; // milliseconds
  backoff?: "linear" | "exponential";
  onRetry?: (attempt: number, error: Error) => Promise<void> | void;
  /** Called when retries are exhausted. Return a value to recover, or throw to propagate. */
  fallback?: (prepResult: P, error: Error) => Promise<E> | E;
};
