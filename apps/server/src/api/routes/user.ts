import { Elysia, t } from "elysia";
import { toServerSentEventsResponse } from "@tanstack/ai";

import { userAuth } from "../middleware";
import { authRateLimit } from "../ratelimit";

export const userRoutes = new Elysia({ name: "user-routes" })
  .use(authRateLimit)
  .use(userAuth)
  .post(
    "/chat",
    async ({ body, user, agent, set }) => {
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
