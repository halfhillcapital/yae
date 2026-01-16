import Elysia from "elysia";
import { routes } from "./api/routes";
import { YaeAgent } from "./agent";
import { AgentContext } from "./db";

// const INACTIVE_TIMEOUT_MS = 60 * 60 * 1000;
// const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// function cleanupInactiveAgents() {
//   const now = Date.now();
//   let cleaned = 0;

//   for (const [id, agent] of userAgents) {
//     const inactive = now - agent.lastActiveAt;
//     if (inactive > INACTIVE_TIMEOUT_MS) {
//       agent.stop();
//       userAgents.delete(id);
//       cleaned++;
//       console.log(
//         `[AgentService] Cleaned up inactive agent ${id} (inactive for ${Math.round(inactive / 60000)}min)`,
//       );
//     }
//   }

//   if (cleaned > 0) {
//     console.log(
//       `[AgentService] Cleanup complete: removed ${cleaned} agents, ${userAgents.size} active`,
//     );
//   }
// }

// setInterval(cleanupInactiveAgents, CLEANUP_INTERVAL_MS);

const userAgents = new Map<string, YaeAgent>();

async function createAgent(userId: string): Promise<YaeAgent> {
  const exists = userAgents.get(userId);
  if (exists) return exists;

  const uuid = crypto.randomUUID();
  const ctx = await AgentContext.create(uuid);
  const agent = new YaeAgent(uuid, userId, ctx);
  userAgents.set(userId, agent);
  return agent;
}

const user1 = await createAgent("dog");
const user2 = await createAgent("cat");

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
    // Save state before exiting
    console.log("[Shutdown] Saving state...");
    // await stateManager.save();

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
