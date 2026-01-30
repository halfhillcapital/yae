import { rateLimit } from "elysia-rate-limit";

const rateLimitError = new Response(
  JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
  {
    status: 429,
    headers: { "Content-Type": "application/json" },
  },
);

/** 5 requests per 60 seconds — for unauthenticated endpoints */
export const publicRateLimit = rateLimit({
  max: 5,
  duration: 60_000,
  errorResponse: rateLimitError,
});

/** 30 requests per 60 seconds — for authenticated endpoints */
export const authRateLimit = rateLimit({
  max: 30,
  duration: 60_000,
  errorResponse: rateLimitError,
});
