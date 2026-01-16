import { Elysia, t } from "elysia";

import { authMiddleware } from "./middleware";

export const routes = new Elysia()
  // Health check endpoint (no auth required)
  .get("/health", () => ({
    status: "ok",
    timestamp: Date.now(),
  }))

  // Message endpoint (auth required)
  .use(authMiddleware)
  .post(
    "/chat",
    async ({ headers }) => {
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
