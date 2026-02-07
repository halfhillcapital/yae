import { eq, and, desc } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import { webhooksTable, webhookEventsTable } from "../schemas/admin-schema.ts";
import type { Webhook, WebhookEvent, WebhookEventStatus } from "../index.ts";

export class WebhookRepository {
  constructor(private readonly db: ReturnType<typeof drizzle>) {}

  async register(
    webhook: Omit<Webhook, "id" | "created_at">,
  ): Promise<Webhook> {
    const id = crypto.randomUUID();
    const created_at = Date.now();

    await this.db.insert(webhooksTable).values({
      id,
      ...webhook,
      created_at,
    });

    return { id, ...webhook, created_at };
  }

  async getBySlug(slug: string): Promise<Webhook | null> {
    const rows = await this.db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.slug, slug))
      .limit(1);

    return (rows[0] as Webhook | undefined) ?? null;
  }

  async getById(id: string): Promise<Webhook | null> {
    const rows = await this.db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.id, id))
      .limit(1);

    return (rows[0] as Webhook | undefined) ?? null;
  }

  async list(limit = 50): Promise<Webhook[]> {
    const rows = await this.db
      .select()
      .from(webhooksTable)
      .orderBy(desc(webhooksTable.created_at))
      .limit(limit);

    return rows as Webhook[];
  }

  async update(
    id: string,
    updates: Partial<
      Pick<Webhook, "name" | "active" | "target_workflow" | "target_user_id">
    >,
  ): Promise<boolean> {
    const result = await this.db
      .update(webhooksTable)
      .set(updates)
      .where(eq(webhooksTable.id, id));

    return result.changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(webhooksTable)
      .where(eq(webhooksTable.id, id));

    return result.changes > 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Webhook Events
  // ─────────────────────────────────────────────────────────────

  async recordEvent(event: Omit<WebhookEvent, "id">): Promise<WebhookEvent> {
    const id = crypto.randomUUID();

    await this.db.insert(webhookEventsTable).values({
      id,
      ...event,
    });

    return { id, ...event };
  }

  async listEvents(webhookId: string, limit = 50): Promise<WebhookEvent[]> {
    const rows = await this.db
      .select()
      .from(webhookEventsTable)
      .where(eq(webhookEventsTable.webhook_id, webhookId))
      .orderBy(desc(webhookEventsTable.received_at))
      .limit(limit);

    return rows as WebhookEvent[];
  }

  async findByExternalId(
    webhookId: string,
    externalId: string,
  ): Promise<WebhookEvent | null> {
    const rows = await this.db
      .select()
      .from(webhookEventsTable)
      .where(
        and(
          eq(webhookEventsTable.webhook_id, webhookId),
          eq(webhookEventsTable.external_id, externalId),
        ),
      )
      .limit(1);

    return (rows[0] as WebhookEvent | undefined) ?? null;
  }

  async updateEventStatus(
    id: string,
    status: WebhookEventStatus,
    error?: string,
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      processed_at: Date.now(),
    };
    if (error !== undefined) updates.error = error;

    await this.db
      .update(webhookEventsTable)
      .set(updates)
      .where(eq(webhookEventsTable.id, id));
  }
}
