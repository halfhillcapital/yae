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

      const lastMessage = [...body.messages]
        .reverse()
        .find((m) => m.role === "user");

      if (!lastMessage) {
        set.status = 400;
        return;
      }

      yield* runAgentLoop(lastMessage, agent);
    },
    {
      body: t.Object({
        messages: t.Array(
          t.Object({
            role: t.Union([t.Literal("user"), t.Literal("assistant")]),
            content: t.String(),
          }),
        ),
      }),
    },
  );
