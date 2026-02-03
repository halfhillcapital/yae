import { Elysia, t } from "elysia";

import { Yae } from "@yae/core";
import type { Webhook } from "@yae/db";
import { adminAuth } from "../middleware";
import { authRateLimit } from "../ratelimit";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function stripSecret({ secret: _, ...rest }: Webhook) {
  return rest;
}

export const adminRoutes = new Elysia({ name: "admin-routes" })
  .use(authRateLimit)
  .group("/admin", (app) =>
    app
      .use(adminAuth)
      .post(
        "/users",
        async ({ body }) => {
          const yae = Yae.getInstance();
          const user = await yae.registerUser(body.name, body.role);
          return { user };
        },
        {
          body: t.Object({
            name: t.String(),
            role: t.Optional(t.Union([t.Literal("user"), t.Literal("admin")])),
          }),
        },
      )
      .get("/users", async () => {
        const yae = Yae.getInstance();
        const users = await yae.listUsers();
        return { users };
      })
      .delete("/users/:id", async ({ params }) => {
        const yae = Yae.getInstance();
        const deleted = await yae.deleteUser(params.id);
        return { deleted };
      })

      // ── Webhook Management ──────────────────────────────────
      .post(
        "/webhooks",
        async ({ body, set }) => {
          if (!SLUG_PATTERN.test(body.slug)) {
            set.status = 400;
            return { error: "Invalid slug. Must match [a-z0-9][a-z0-9-]*" };
          }
          const yae = Yae.getInstance();
          const secret = `whsec_${crypto.randomUUID().replace(/-/g, "")}`;
          const webhook = await yae.webhooks.register({
            name: body.name,
            slug: body.slug,
            secret,
            target_user_id: body.target_user_id,
            target_workflow: body.target_workflow,
            active: 1,
          });
          // Secret is only returned at creation time
          return { webhook };
        },
        {
          body: t.Object({
            name: t.String(),
            slug: t.String(),
            target_user_id: t.Optional(t.String()),
            target_workflow: t.Optional(t.String()),
          }),
        },
      )
      .get("/webhooks", async () => {
        const yae = Yae.getInstance();
        const webhooks = await yae.webhooks.list();
        return { webhooks: webhooks.map(stripSecret) };
      })
      .patch(
        "/webhooks/:id",
        async ({ params, body }) => {
          const yae = Yae.getInstance();
          const updated = await yae.webhooks.update(params.id, body);
          return { updated };
        },
        {
          body: t.Object({
            name: t.Optional(t.String()),
            active: t.Optional(t.Number()),
            target_user_id: t.Optional(t.String()),
            target_workflow: t.Optional(t.String()),
          }),
        },
      )
      .delete("/webhooks/:id", async ({ params }) => {
        const yae = Yae.getInstance();
        const deleted = await yae.webhooks.delete(params.id);
        return { deleted };
      })
      .get("/webhooks/:id/events", async ({ params }) => {
        const yae = Yae.getInstance();
        const events = await yae.webhooks.listEvents(params.id);
        return { events };
      }),
  );
