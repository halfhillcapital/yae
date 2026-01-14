import { Elysia } from "elysia";

export const authMiddleware = new Elysia({ name: "auth" })
  .derive({ as: "global" }, ({ headers }) => {
    const authHeader = headers.authorization;
    const expectedKey = process.env.API_KEY;

    if (!expectedKey) {
      throw new Error("API_KEY not configured in environment");
    }

    if (!authHeader) {
      return { isAuthenticated: false, error: "Missing Authorization header" };
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const isAuthenticated = token === expectedKey;

    return {
      isAuthenticated,
      error: isAuthenticated ? null : "Invalid API key",
    };
  })
  .onBeforeHandle({ as: "global" }, ({ isAuthenticated, error, set }) => {
    if (!isAuthenticated) {
      set.status = 401;
      return {
        success: false,
        error: error || "Unauthorized",
      };
    }
  });
