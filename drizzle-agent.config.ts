import { defineConfig } from "drizzle-kit";
export default defineConfig({
  out: "./drizzle/agent",
  schema: ["./src/db/schemas/agent-schema.ts"],
  dialect: "sqlite",
});
