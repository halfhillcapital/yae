import { BaseNode } from "./node";
import type { GraphNode, NextAction } from "./types";

export type FlowConfig<S> = {
  name?: string;
  maxIterations?: number; // Guard against infinite loops (default: 1000)
  beforeStart?: (shared: S) => Promise<void> | void;
  afterComplete?: (shared: S, finalAction?: NextAction) => Promise<void> | void;
  onNodeExecute?: (
    node: GraphNode<S>,
    action?: NextAction,
  ) => Promise<void> | void;
  onError?: (
    error: Error,
    node: GraphNode<S>,
    shared: S,
  ) => Promise<void> | void;
};

export class Flow<S> extends BaseNode<S, void, void> {
  constructor(
    private start: GraphNode<S>,
    private config?: FlowConfig<S>,
  ) {
    super();
    this.name = config?.name;
  }

  static from<S>(start: GraphNode<S>, config?: FlowConfig<S>): Flow<S> {
    return new Flow<S>(start, config);
  }

  protected async orchestrate(shared: S): Promise<NextAction> {
    await this.config?.beforeStart?.(shared);

    const maxIterations = this.config?.maxIterations ?? 1000;
    let iterations = 0;
    let currentNode: GraphNode<S> | undefined = this.start.clone();
    let action: NextAction;

    while (currentNode) {
      try {
        if (++iterations > maxIterations) {
          throw new Error(
            `Flow exceeded ${maxIterations} iterations. Possible infinite loop.`,
          );
        }
        action = await currentNode.work(shared);
        await this.config?.onNodeExecute?.(currentNode, action);
      } catch (error) {
        await this.config?.onError?.(error as Error, currentNode, shared);
        throw error;
      }
      currentNode = currentNode.next(action);
      currentNode = currentNode?.clone();
    }

    await this.config?.afterComplete?.(shared, action);
    return action;
  }

  override async work(shared: S): Promise<NextAction> {
    return await this.orchestrate(shared);
  }

  override async run(shared: S): Promise<NextAction> {
    return await this.work(shared);
  }
}
