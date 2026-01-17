import { eq, desc, and } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { workflowRunsTable } from "../schemas/agent-schema.ts";
import type { WorkflowRun, WorkflowStatus } from "@yae/workflow/types.ts";

export class WorkflowRepository {
  constructor(private readonly db: ReturnType<typeof drizzle>) {}

  async create<T>(run: WorkflowRun<T>): Promise<void> {
    await this.db.insert(workflowRunsTable).values({
      id: run.id,
      workflowId: run.workflowId,
      agentId: run.agentId,
      status: run.status,
      state: JSON.stringify(run.state),
      error: run.error,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
    });
  }

  async update<T>(
    id: string,
    updates: Partial<
      Pick<WorkflowRun<T>, "status" | "state" | "error" | "completedAt">
    >,
  ): Promise<void> {
    const dbUpdates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.state !== undefined)
      dbUpdates.state = JSON.stringify(updates.state);
    if (updates.error !== undefined) dbUpdates.error = updates.error;
    if (updates.completedAt !== undefined)
      dbUpdates.completedAt = updates.completedAt;

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

  async listByAgent<T>(agentId: string, limit = 50): Promise<WorkflowRun<T>[]> {
    const rows = await this.db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.agentId, agentId))
      .orderBy(desc(workflowRunsTable.startedAt))
      .limit(limit);

    return rows.map((row) => this.toWorkflowRun<T>(row));
  }

  async listByStatus<T>(
    agentId: string,
    status: WorkflowStatus,
    limit = 50,
  ): Promise<WorkflowRun<T>[]> {
    const rows = await this.db
      .select()
      .from(workflowRunsTable)
      .where(
        and(
          eq(workflowRunsTable.agentId, agentId),
          eq(workflowRunsTable.status, status),
        ),
      )
      .orderBy(desc(workflowRunsTable.startedAt))
      .limit(limit);

    return rows.map((row) => this.toWorkflowRun<T>(row));
  }

  private toWorkflowRun<T>(row: {
    id: string;
    workflowId: string;
    agentId: string;
    status: string;
    state: string;
    error: string | null;
    startedAt: number;
    updatedAt: number;
    completedAt: number | null;
  }): WorkflowRun<T> {
    return {
      id: row.id,
      workflowId: row.workflowId,
      agentId: row.agentId,
      status: row.status as WorkflowStatus,
      state: JSON.parse(row.state) as T,
      error: row.error ?? undefined,
      startedAt: row.startedAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt ?? undefined,
    };
  }
}
