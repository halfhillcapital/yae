import {
  isBranch,
  type GraphNode,
  type Chainable,
  type Action,
  type NextAction,
  type RetryConfig,
} from "./types";

// ============================================================================
// BaseNode
// ============================================================================

export type BaseNodeConfig<S, P, E> = {
  name?: string;
  /** Read from shared state, prepare inputs for exec. */
  prep?: (shared: S) => Promise<P> | P;
  /**
   * Pure transformation of prep result. Should NOT access shared state.
   *
   * WARNING: While JavaScript allows capturing `shared` via closure, doing so
   * breaks the retry contract - side effects will execute multiple times on retry.
   * For correct behavior, only use the `prepResult` parameter.
   *
   * @example
   * // GOOD - pure function using only prepResult
   * exec: (items) => items.filter(x => x.active).length
   *
   * // BAD - captures shared via closure, breaks retry isolation
   * exec: (items) => { shared.counter++; return items.length; }
   */
  exec?: (prepResult: P) => Promise<E> | E;
  /** Write results to shared state, return action for routing. */
  post?: (
    shared: S,
    prepResult: P,
    execResult: E,
  ) => Promise<NextAction> | NextAction;
  /** Handle errors from prep/exec/post. Return action to continue or throw. */
  onError?: (error: Error, shared: S) => Promise<NextAction> | NextAction;
};

// Base implementation - minimal core functionality
export class BaseNode<S, P = void, E = void> implements GraphNode<S> {
  public name?: string;
  protected _prep?: BaseNodeConfig<S, P, E>["prep"];
  protected _exec?: BaseNodeConfig<S, P, E>["exec"];
  protected _post?: BaseNodeConfig<S, P, E>["post"];
  protected _onError?: BaseNodeConfig<S, P, E>["onError"];
  protected successors: Map<Action, GraphNode<S>> = new Map();

  constructor(config?: BaseNodeConfig<S, P, E>) {
    this.name = config?.name;
    this._prep = config?.prep;
    this._exec = config?.exec;
    this._post = config?.post;
    this._onError = config?.onError;
  }

  async prep(shared: S): Promise<P> {
    return this._prep ? await this._prep(shared) : (undefined as P);
  }

  async exec(prepResult: P): Promise<E> {
    return this._exec ? await this._exec(prepResult) : (undefined as E);
  }

  async post(shared: S, prepResult: P, execResult: E): Promise<NextAction> {
    return this._post
      ? await this._post(shared, prepResult, execResult)
      : undefined;
  }

  protected async _execute(prepResult: P): Promise<E> {
    return await this.exec(prepResult);
  }

  async work(shared: S): Promise<NextAction> {
    try {
      const prepResult = await this.prep(shared);
      const execResult = await this._execute(prepResult);
      return await this.post(shared, prepResult, execResult);
    } catch (error) {
      if (this._onError) {
        return await this._onError(error as Error, shared);
      }
      throw error;
    }
  }

  async run(shared: S): Promise<NextAction> {
    if (this.successors.size > 0)
      console.warn("Node won't run successors. Use Flow.");
    return await this.work(shared);
  }

  protected _succeed<T extends GraphNode<S>>(action: Action, node: T): this {
    if (this.successors.has(action) && typeof console !== "undefined") {
      console.warn(`Successor for action "${action}" will be overridden.`);
    }
    this.successors.set(action, node);
    return this;
  }

  to(target: Chainable<S>): GraphNode<S> {
    if (isBranch(target)) {
      this._succeed("default", target.entry);
      return target.exit;
    }
    this._succeed("default", target);
    return target;
  }

  when<T extends GraphNode<S>>(action: Action, node: T): this {
    this._succeed(action, node);
    return this;
  }

  /**
   * Get the next node for a given action.
   * @throws Error if successors exist but the action is not registered (likely a typo)
   *
   * Terminal nodes (no successors) can return any action without error - the action
   * is passed to Flow.afterComplete for the caller to handle.
   */
  next(action: Action = "default"): GraphNode<S> | undefined {
    const nextNode = this.successors.get(action);
    // Only throw if successors ARE registered but this action isn't found
    // This catches typos while allowing terminal nodes to return actions freely
    if (!nextNode && this.successors.size > 0 && action !== "default") {
      throw new Error(
        `Action "${action}" not found. Available: [${[...this.successors.keys()].join(", ")}]`,
      );
    }
    return nextNode;
  }

  clone(): this {
    // 1. Create the base with the correct prototype
    const copy = Object.create(Object.getPrototypeOf(this));

    // 2. Fast-copy all properties (including non-enumerable ones if necessary)
    // Object.assign is highly optimized in Bun/V8
    Object.assign(copy, this);

    // 3. Manually "De-reference" the collections that MUST be unique

    // Clone the successors Map so the graph structure can diverge
    copy.successors = new Map(this.successors);

    return copy;
  }
}

// ============================================================================
// Node
// ============================================================================

export type NodeConfig<S, P = void, E = void> = BaseNodeConfig<S, P, E> & {
  retry?: RetryConfig<P, E>;
  timeout?: number; // milliseconds - applies to exec() phase
};

class NodeTimeoutError extends Error {
  constructor(
    public readonly ms: number,
    nodeName?: string,
  ) {
    super(`Node <${nodeName ?? "Unknown"}> timed out after ${ms}ms`);
    this.name = "NodeTimeoutError";
  }
}

// Full-featured Node with retry, timeout, etc.
export class Node<S, P = void, E = void> extends BaseNode<S, P, E> {
  private retryConfig?: RetryConfig<P, E>;
  private timeout?: number;

  constructor(config?: NodeConfig<S, P, E>) {
    super(config);
    this.retryConfig = config?.retry;
    this.timeout = config?.timeout;
  }

  protected async fallback(prepResult: P, error: Error): Promise<E> {
    if (this.retryConfig?.fallback)
      return await this.retryConfig.fallback(prepResult, error);
    throw error;
  }

  protected override async _execute(prepResult: P): Promise<E> {
    if (!this.retryConfig) return await this.executeWithTimeout(prepResult);

    for (let retries = 1; retries <= this.retryConfig.maxAttempts; retries++) {
      try {
        return await this.executeWithTimeout(prepResult);
      } catch (error) {
        if (retries === this.retryConfig.maxAttempts)
          return await this.fallback(prepResult, error as Error);
        else {
          await new Promise((resolve) =>
            setTimeout(resolve, this.delay(retries)),
          );
          await this.retryConfig.onRetry?.(retries, error as Error);
        }
      }
    }
    return undefined as E;
  }

  private delay(attempt: number): number {
    const baseDelay = this.retryConfig?.delay ?? 1000;
    if (this.retryConfig?.backoff === "exponential") {
      return baseDelay * Math.pow(2, attempt - 1);
    }
    return baseDelay * attempt; // linear
  }

  private async executeWithTimeout(prepResult: P): Promise<E> {
    const signal = this.timeout ? AbortSignal.timeout(this.timeout) : undefined;
    if (!signal) return await this.exec(prepResult);

    // Promise that rejects when the signal aborts (the timeout)
    const timerPromise = new Promise<never>((_, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          reject(new NodeTimeoutError(this.timeout!, this.name));
        },
        { once: true },
      );
    });

    return await Promise.race([
      this.exec(prepResult), // Pass signal to the actual work
      timerPromise,
    ]);
  }
}

// ============================================================================
// ParallelNode
// ============================================================================

export type ParallelNodeConfig<S, P = void, E = void> = {
  name?: string;
  prep: (shared: S) => Promise<P[]> | P[];
  exec: (item: P) => Promise<E> | E;
  post: (
    shared: S,
    prepResult: P[],
    execResult: E[],
  ) => Promise<NextAction> | NextAction;
  onError?: (error: Error, shared: S) => Promise<NextAction> | NextAction;
  retry?: RetryConfig<P, E>;
  timeout?: number;
};

export class ParallelNode<S, P = void, E = void> extends Node<
  S,
  P[] | P,
  E[] | E
> {
  constructor(config: ParallelNodeConfig<S, P, E>) {
    super({
      name: config?.name,
      prep: config.prep as NodeConfig<S, P[] | P, E[] | E>["prep"],
      exec: config.exec as NodeConfig<S, P[] | P, E[] | E>["exec"],
      post: config.post as NodeConfig<S, P[] | P, E[] | E>["post"],
      onError: config?.onError,
      retry: config?.retry as RetryConfig<P[] | P, E[] | E>,
      timeout: config?.timeout,
    });
  }

  protected override async _execute(prepResults: P[]): Promise<E[]> {
    if (!prepResults || !Array.isArray(prepResults)) {
      console.warn(
        "ParallelNode received invalid prepResults, expected an array.",
      );
      return [];
    }
    return (await Promise.all(
      prepResults.map((item) => super._execute(item)),
    )) as E[];
  }
}
