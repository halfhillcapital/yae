import { YaeAgent } from "@yae/core/agents";

/** Inactive timeout before agent is eligible for cleanup (1 hour) */
const INACTIVE_TIMEOUT_MS = 60 * 60 * 1000;

/** Cleanup interval (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const agents = new Map<string, YaeAgent>();

function cleanupInactiveAgents() {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, agent] of agents) {
    const inactive = now - agent.lastActiveAt;
    if (inactive > INACTIVE_TIMEOUT_MS) {
      agent.stop();
      agents.delete(id);
      cleaned++;
      console.log(
        `[AgentService] Cleaned up inactive agent ${id} (inactive for ${Math.round(inactive / 60000)}min)`,
      );
    }
  }

  if (cleaned > 0) {
    console.log(
      `[AgentService] Cleanup complete: removed ${cleaned} agents, ${agents.size} active`,
    );
  }
}

// Start cleanup interval
setInterval(cleanupInactiveAgents, CLEANUP_INTERVAL_MS);

export const AgentService = {
  async get(id: string): Promise<YaeAgent> {
    if (!agents.has(id)) {
      const agent = await YaeAgent.create(id);
      agents.set(id, agent);
    }
    return agents.get(id)!;
  },

  getStats() {
    return {
      activeAgents: agents.size,
      agents: Array.from(agents.entries()).map(([id, agent]) => ({
        id,
        lastActiveAt: agent.lastActiveAt,
        inactiveMs: Date.now() - agent.lastActiveAt,
      })),
    };
  },
};
