import Elysia from "elysia";
import { routes } from "./api/routes";
import { Yae } from "./core";

// Initialize Yae (the server)
const yae = await Yae.initialize();

// Create test agents
await yae.createUserAgent("dog");
await yae.createUserAgent("cat");

const PORT = process.env.PORT || 3000;
new Elysia().use(routes).listen(PORT);

console.log(`
╔════════════════════════════════════════╗
║                 Y.A.E.                 ║
╚════════════════════════════════════════╝

🚀 Server running on: http://localhost:${PORT}
🔐 API Key: ${process.env.API_KEY?.slice(0, 20)}...
📝 Health check: http://localhost:${PORT}/health

Press Ctrl+C to gracefully shutdown
`);

async function shutdown(signal: string) {
  console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

  try {
    await yae.shutdown();
    console.log("[Shutdown] Cleanup complete. Goodbye!");
    process.exit(0);
  } catch (error) {
    console.error("[Shutdown] Error during cleanup:", error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught errors
process.once("uncaughtException", (error) => {
  console.error("[Fatal] Uncaught exception:", error);
  shutdown("UNCAUGHT_EXCEPTION").catch(() => process.exit(1));
});

process.once("unhandledRejection", (reason, promise) => {
  console.error("[Fatal] Unhandled rejection at:", promise, "reason:", reason);
  shutdown("UNHANDLED_REJECTION").catch(() => process.exit(1));
});
