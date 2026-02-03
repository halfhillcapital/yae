import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

import { publicRoutes } from "./routes/public";
import { webhookRoutes } from "./routes/webhooks";
import { adminRoutes } from "./routes/admin";
import { userRoutes } from "./routes/user";

export const routes = new Elysia()
  .use(cors())
  .use(publicRoutes)
  .use(webhookRoutes)
  .use(adminRoutes)
  .use(userRoutes);
