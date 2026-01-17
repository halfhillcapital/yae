import type { WorkflowDefinition } from "./types.ts";

/**
 * Singleton registry for workflow definitions.
 * Workflows must be registered before they can be executed.
 */
class WorkflowRegistryClass {
  private definitions = new Map<string, WorkflowDefinition<unknown>>();

  /**
   * Register a workflow definition.
   * @throws Error if workflow with the same id already exists
   */
  register<T>(definition: WorkflowDefinition<T>): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Workflow "${definition.id}" is already registered`);
    }
    this.definitions.set(
      definition.id,
      definition as WorkflowDefinition<unknown>,
    );
  }

  /**
   * Get a workflow definition by id.
   * @returns The workflow definition or undefined if not found
   */
  get<T>(id: string): WorkflowDefinition<T> | undefined {
    return this.definitions.get(id) as WorkflowDefinition<T> | undefined;
  }

  /**
   * Check if a workflow is registered.
   */
  has(id: string): boolean {
    return this.definitions.has(id);
  }

  /**
   * List all registered workflow definitions.
   */
  list(): WorkflowDefinition<unknown>[] {
    return Array.from(this.definitions.values());
  }

  /**
   * List all registered workflow ids.
   */
  listIds(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * Unregister a workflow definition.
   * @returns true if the workflow was removed, false if it wasn't registered
   */
  unregister(id: string): boolean {
    return this.definitions.delete(id);
  }

  /**
   * Clear all registered workflows.
   * Mainly useful for testing.
   */
  clear(): void {
    this.definitions.clear();
  }
}

export const WorkflowRegistry = new WorkflowRegistryClass();
