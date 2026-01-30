import { Elysia, t } from "elysia";

import { Yae } from "@yae/core";
import { publicRateLimit } from "../ratelimit";

export const publicRoutes = new Elysia({ name: "public-routes" })
  .use(publicRateLimit)

  .get("/health", () => {
    const yae = Yae.getInstance();
    return yae.getHealth();
  })

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
  );
