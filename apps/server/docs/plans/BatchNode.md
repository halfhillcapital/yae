# BatchNode Implementation Plan

## Summary

Add a `BatchNode` class that processes arrays **sequentially** (one item at a time). This is simpler than `ParallelNode` which runs everything concurrently.

**Key difference from ParallelNode:**
- `ParallelNode`: `Promise.all()` - all items run concurrently
- `BatchNode`: `for` loop - items processed one at a time

**Value proposition:** Per-item retry/timeout. Without this, a regular Node with a loop works fine.

## Design Decisions

| Question | Decision |
|----------|----------|
| Inheritance | Extend `Node` directly (sibling to `ParallelNode`) |
| Config type | Reuse `ParallelNodeConfig` (no new type needed) |
| Execution | Sequential for-loop |
| Error handling | Fail-fast on first error (matches `ParallelNode`) |

## Files to Modify

### 1. `src/graph/node.ts` - Add BatchNode class

Add after `ParallelNode` (line ~292):

```typescript
/**
 * Processes array items sequentially (one at a time).
 * Use this when operations must not run concurrently (rate limits, ordering, etc.)
 */
export class BatchNode<S, P = void, E = void> extends Node<S, P[] | P, E[] | E> {
  constructor(config: ParallelNodeConfig<S, P, E>) {
    super({
      name: config.name,
      prep: config.prep as NodeConfig<S, P[] | P, E[] | E>["prep"],
      exec: config.exec as NodeConfig<S, P[] | P, E[] | E>["exec"],
      post: config.post as NodeConfig<S, P[] | P, E[] | E>["post"],
      onError: config.onError,
      retry: config.retry,
      timeout: config.timeout,
    });
  }

  protected override async _execute(prepResults: P[]): Promise<E[]> {
    if (!prepResults || !Array.isArray(prepResults)) {
      console.warn("BatchNode received invalid prepResults, expected an array.");
      return [];
    }

    const results: E[] = [];
    for (const item of prepResults) {
      results.push((await super._execute(item)) as E);
    }
    return results;
  }
}
```

### 2. `src/graph/utils.ts` - Add factory function

```typescript
import { BatchNode } from "./node";

export const batch = <S>() => {
  return <P = void, E = void>(config: ParallelNodeConfig<S, P, E>) => {
    return new BatchNode<S, P, E>(config);
  };
};
```

### 3. `src/graph/index.ts` - Update exports

```typescript
export { BaseNode, Node, ParallelNode, BatchNode } from "./node";
```

### 4. `src/core/workflows/index.ts` - Add workflow factory

```typescript
export const workflowBatch = <T>() => {
  return <P = void, E = void>(config: ParallelNodeConfig<AgentState<T>, P, E>) => {
    return new BatchNode<AgentState<T>, P, E>(config);
  };
};
```

Update `defineWorkflow` helpers to include `batch`.

### 5. `tests/graph/batch.test.ts` - New test file

Key test cases:
- Processes items sequentially (verify order via timestamps)
- Preserves result order
- Empty array returns empty
- Fails fast on first error
- Retry applies per item
- Timeout applies per item
- Works in Flow

## Example Usage

```typescript
import { batch } from "@yae/graph";

type State = { urls: string[]; responses: Response[] };

const fetchAll = batch<State>()({
  name: "Fetch URLs",
  prep: (s) => s.urls,
  exec: async (url) => fetch(url),
  post: (s, _prep, responses) => {
    s.responses = responses;
    return undefined;
  },
  // Per-item retry (the main benefit over a regular Node with a loop)
  timeout: 5000,
  retry: { maxAttempts: 3, backoff: "exponential" },
});
```
