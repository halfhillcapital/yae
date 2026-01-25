import { eq, desc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { workflowRunsTable } from "../schemas/agent-schema.ts";
import type { WorkflowRun, WorkflowStatus } from "../index.ts";

export class WorkflowRepository {
  constructor(private readonly db: ReturnType<typeof drizzle>) {}

  async create<T>(run: WorkflowRun<T>): Promise<void> {
    await this.db.insert(workflowRunsTable).values({
      id: run.id,
      workflow: run.workflow,
      status: run.status,
      state: JSON.stringify(run.state),
      error: run.error,
      started_at: run.started_at,
      updated_at: run.updated_at,
      completed_at: run.completed_at,
    });
  }

  async update<T>(
    id: string,
    updates: Partial<
      Pick<WorkflowRun<T>, "status" | "state" | "error" | "completed_at">
    >,
  ): Promise<void> {
    const dbUpdates: Record<string, unknown> = {
      updated_at: Date.now(),
    };

    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.state !== undefined)
      dbUpdates.state = JSON.stringify(updates.state);
    if (updates.error !== undefined) dbUpdates.error = updates.error;
    if (updates.completed_at !== undefined)
      dbUpdates.completed_at = updates.completed_at;

    await this.db
      .update(workflowRunsTable)
      .set(dbUpdates)
      .where(eq(workflowRunsTable.id, id));
  }

  async get<T>(id: string): Promise<WorkflowRun<T> | null> {
    const rows = await this.db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.toWorkflowRun<T>(rows[0]!);
  }

  async listByStatus<T>(
    status: WorkflowStatus,
    limit = 50,
  ): Promise<WorkflowRun<T>[]> {
    const rows = await this.db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.status, status))
      .orderBy(desc(workflowRunsTable.started_at))
      .limit(limit);

    return rows.map((row) => this.toWorkflowRun<T>(row));
  }

  /**
   * Mark all "running" workflows as "failed".
   * Called on startup to clean up workflows that were interrupted by a crash/restart.
   * @returns Number of workflows marked as failed
   */
  async markStaleAsFailed(): Promise<number> {
    const result = await this.db
      .update(workflowRunsTable)
      .set({
        status: "failed",
        completed_at: Date.now(),
        updated_at: Date.now(),
        error: "Workflow interrupted by server restart",
      })
      .where(eq(workflowRunsTable.status, "running"));

    return result.rowsAffected;
  }

  private toWorkflowRun<T>(row: {
    id: string;
    workflow: string;
    status: WorkflowStatus;
    state: string;
    error: string | null;
    started_at: number;
    updated_at: number;
    completed_at: number | null;
  }): WorkflowRun<T> {
    return {
      id: row.id,
      workflow: row.workflow,
      status: row.status,
      state: JSON.parse(row.state) as T,
      error: row.error ?? undefined,
      started_at: row.started_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at ?? undefined,
    };
  }
}
