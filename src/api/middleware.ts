import { Elysia } from "elysia";
import { Yae } from "@yae/core";

function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
}

// Admin auth - checks against Yae's admin token
export const adminAuth = new Elysia({ name: "admin-auth" })
  .derive({ as: "scoped" }, ({ headers }) => {
    const token = extractToken(headers.authorization);
    if (!token) return { isAdmin: false };

    const yae = Yae.getInstance();
    return { isAdmin: yae.isAdminToken(token) };
  })
  .onBeforeHandle({ as: "scoped" }, ({ isAdmin, set }) => {
    if (!isAdmin) {
      set.status = 401;
      return { error: "Invalid admin token" };
    }
  });

// User auth - looks up user by apiKey, resolves agent
export const userAuth = new Elysia({ name: "user-auth" })
  .derive({ as: "scoped" }, async ({ headers }) => {
    const token = extractToken(headers.authorization);
    if (!token) return { user: null, agent: null };

    const yae = Yae.getInstance();
    const user = await yae.getUserByApiKey(token);
    if (!user) return { user: null, agent: null };

    const agent = await yae.createUserAgent(user.id);
    return { user, agent };
  })
  .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Invalid user token" };
    }
  });
