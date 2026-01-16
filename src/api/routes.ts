import { Elysia, t } from "elysia";
import { Yae } from "@yae/core";
import { adminAuth, userAuth } from "./middleware";

export const routes = new Elysia()
  // Health check endpoint (no auth required)
  .get("/health", () => {
    const yae = Yae.getInstance();
    return yae.getHealth();
  })

  // Admin routes
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
            role: t.Optional(t.String()),
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
  )

  // User routes
  .use(userAuth)
  .post(
    "/chat",
    async ({ body, user, agent }) => {
      // user and agent are injected by userAuth middleware
      return {
        success: true,
        userId: user!.id,
        agentId: agent!.id,
        message: body.message,
      };
    },
    {
      body: t.Object({
        message: t.String(),
        instructions: t.Optional(t.String()),
      }),
    },
  );
