import { Elysia, t } from "elysia";

import { authMiddleware } from "./middleware";
import { AgentService } from "@yae/db/services";

export const routes = new Elysia()
  .decorate("agent", AgentService)
  // Health check endpoint (no auth required)
  .get("/health", () => ({
    status: "ok",
    timestamp: Date.now(),
  }))

  // Message endpoint (auth required)
  .use(authMiddleware)
  .post(
    "/message",
    async ({ headers, agent, set }) => {
      const userAgent = await agent.get(headers.authorization!);
      const result = userAgent.enqueue({ type: "Hello World!" });

      if (!result.success) {
        set.status = 503;
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
      };
    },
    {
      body: t.Object({
        message: t.String(),
        instructions: t.Optional(t.String()),
      }),
    },
  );
