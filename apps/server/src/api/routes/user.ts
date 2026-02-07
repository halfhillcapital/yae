import { Elysia, t } from "elysia";

import { userAuth } from "../middleware";
import { authRateLimit } from "../ratelimit";
import { runAgentLoop } from "@yae/core/agents/user";

export const userRoutes = new Elysia({ name: "user-routes" })
  .use(authRateLimit)
  .use(userAuth)
  .post(
    "/chat",
    async function* ({ body, user, agent, set }) {
      if (!user || !agent) {
        set.status = 401;
        return;
      }

      const message = { role: "user" as const, content: body.message };

      yield* runAgentLoop(agent, message, body.instructions);
    },
    {
      body: t.Object({
        message: t.String(),
        instructions: t.Optional(t.String()),
      }),
    },
  );
