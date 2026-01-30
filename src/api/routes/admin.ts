import { Elysia, t } from "elysia";

import { Yae } from "@yae/core";
import { adminAuth } from "../middleware";
import { authRateLimit } from "../ratelimit";

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
      }),
  );
