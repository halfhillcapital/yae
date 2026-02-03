import { Elysia } from "elysia";

import { Yae } from "@yae/core";
import { verifyWebhookSignature } from "../auth";
import { webhookRateLimit } from "../ratelimit";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export const webhookRoutes = new Elysia({ name: "webhook-routes" })
  .use(webhookRateLimit)

  // Global webhook receive
  .post("/webhooks/:slug", async ({ params, request, headers, set }) => {
    // Body size guard — reject before reading into memory
    const contentLength = Number(headers["content-length"]);
    if (contentLength > MAX_BODY_BYTES) {
      set.status = 413;
      return { error: "Payload too large" };
    }

    const yae = Yae.getInstance();
    const webhook = await yae.webhooks.getBySlug(params.slug);

    if (!webhook || !webhook.active) {
      set.status = 404;
      return { error: "Not found" };
    }

    // Read raw bytes for accurate HMAC verification
    const rawBuffer = Buffer.from(await request.arrayBuffer());
    if (rawBuffer.length > MAX_BODY_BYTES) {
      set.status = 413;
      return { error: "Payload too large" };
    }

    const signature = headers["x-webhook-signature"];
    const timestamp = headers["x-webhook-timestamp"];

    if (!timestamp) {
      set.status = 401;
      return { error: "Missing x-webhook-timestamp header" };
    }

    if (!verifyWebhookSignature(rawBuffer, webhook.secret, signature, timestamp)) {
      set.status = 401;
      return { error: "Invalid signature" };
    }

    // Idempotency: de-duplicate by x-webhook-id
    const externalId = headers["x-webhook-id"] ?? null;
    if (externalId) {
      const existing = await yae.webhooks.findByExternalId(webhook.id, externalId);
      if (existing) {
        return { received: true, event_id: existing.id };
      }
    }

    const bodyText = rawBuffer.toString("utf-8");
    const event = await yae.webhooks.recordEvent({
      webhook_id: webhook.id,
      headers: JSON.stringify(headers),
      payload: bodyText,
      status: "received",
      received_at: Date.now(),
      external_id: externalId,
    });

    // Fire-and-forget — errors tracked inside dispatchWebhookEvent
    yae.dispatchWebhookEvent(webhook, event).catch(() => {});

    return { received: true, event_id: event.id };
  });
