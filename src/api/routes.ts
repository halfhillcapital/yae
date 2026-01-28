import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { toServerSentEventsResponse } from "@tanstack/ai";

import { Yae } from "@yae/core";
import { adminAuth, userAuth } from "./middleware";

export const routes = new Elysia()
  // Rate limiting: 10 requests per 60 seconds per IP
  .use(
    rateLimit({
      max: 10,
      duration: 60_000,
      errorResponse: new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      ),
    }),
  )

  // Health check endpoint (no auth required)
  .get("/health", () => {
    const yae = Yae.getInstance();
    return yae.getHealth();
  })

  // API key verification endpoint (no auth required)
  .post(
    "/verify",
    async ({ body }) => {
      const yae = Yae.getInstance();
      const user = await yae.getUserByToken(body.token);
      return { valid: !!user };
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  )

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
  )

  // User routes
  .use(userAuth)
  .post(
    "/chat",
    async ({ body, user, agent, set }) => {
      // user and agent are injected by userAuth middleware
      if (!user || !agent) {
        set.status = 401;
        return "Blocked! User not recognized.";
      }

      try {
        const result = await agent.runAgentTurn(body.message);
        return toServerSentEventsResponse(result);
      } catch (err) {
        console.error("[Chat Error]", err);
        set.status = 500;
        return "Something went wrong while processing your request.";
      }
    },
    {
      body: t.Object({
        message: t.String(),
      }),
    },
  );
