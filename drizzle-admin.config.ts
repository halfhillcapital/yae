import { defineConfig } from "drizzle-kit";
export default defineConfig({
  out: "./drizzle/admin",
  schema: ["./src/db/schemas/admin-schema.ts"],
  dialect: "sqlite",
});
