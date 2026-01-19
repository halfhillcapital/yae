import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { Yae } from "@yae/core";
import { adminAuth, userAuth } from "./middleware";
import { b, type Message } from "baml_client";

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
      const user = await yae.getUserByApiKey(body.apiKey);
      return { valid: !!user };
    },
    {
      body: t.Object({
        apiKey: t.String(),
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
      if (!user || !agent) {
        return "Blocked! Invalid user or agent.";
      }
      const userMessage: Message = { role: "user", content: body.message };
      await agent.messages.save(userMessage);

      const memories = agent.memory.getAll();
      const files = await agent.files.getFileTree("/");
      const conversation = agent.messages.getAll();

      const response = await b.ChatWithAgentContext(memories, files, conversation);
      const agentMessage: Message = { role: "assistant", content: response };
      await agent.messages.save(agentMessage);

      return response;
    },
    {
      body: t.Object({
        message: t.String(),
      }),
    },
  );
