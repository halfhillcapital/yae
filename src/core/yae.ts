import { AgentContext, AdminContext, type User } from "@yae/db";
import { YaeAgent } from "@yae/agent";

const YAE_DB_PATH = "./data/yae.db";

export type HealthStatus = {
  status: "ok" | "degraded" | "error";
  uptime: number;
  activeAgents: number;
  timestamp: number;
};

export class Yae {
  private static instance: Yae | null = null;
  private readonly startTime = Date.now();
  private userAgents = new Map<string, YaeAgent>();

  private constructor(
    private readonly ctx: AgentContext,
    private readonly admin: AdminContext,
  ) {}

  static async initialize(): Promise<Yae> {
    if (Yae.instance) return Yae.instance;

    const ctx = await AgentContext.create("yae", YAE_DB_PATH);
    const admin = await AdminContext.create(YAE_DB_PATH);

    Yae.instance = new Yae(ctx, admin);
    return Yae.instance;
  }

  static getInstance(): Yae {
    if (!Yae.instance) {
      throw new Error("Yae not initialized. Call Yae.initialize() first.");
    }
    return Yae.instance;
  }

  // ─────────────────────────────────────────────────────────────
  // User Agent Management
  // ─────────────────────────────────────────────────────────────

  async createUserAgent(userId: string): Promise<YaeAgent> {
    const existing = this.userAgents.get(userId);
    if (existing) return existing;

    const agentId = crypto.randomUUID();
    const ctx = await AgentContext.create(agentId);
    const agent = new YaeAgent(agentId, userId, ctx);

    this.userAgents.set(userId, agent);
    return agent;
  }

  getUserAgent(userId: string): YaeAgent | undefined {
    return this.userAgents.get(userId);
  }

  listUserAgents(): Map<string, YaeAgent> {
    return new Map(this.userAgents);
  }

  deleteUserAgent(userId: string): boolean {
    return this.userAgents.delete(userId);
  }

  // ─────────────────────────────────────────────────────────────
  // User Management (via AdminContext)
  // ─────────────────────────────────────────────────────────────

  async registerUser(name: string, role: string = "user"): Promise<User> {
    return this.admin.registerUser(name, role);
  }

  async getUserByApiKey(apiKey: string): Promise<User | null> {
    return this.admin.getUserByApiKey(apiKey);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.admin.getUserById(id);
  }

  async listUsers(): Promise<User[]> {
    return this.admin.listUsers();
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.admin.deleteUser(id);
  }

  // ─────────────────────────────────────────────────────────────
  // Server Control
  // ─────────────────────────────────────────────────────────────

  getHealth(): HealthStatus {
    return {
      status: "ok",
      uptime: Date.now() - this.startTime,
      activeAgents: this.userAgents.size,
      timestamp: Date.now(),
    };
  }

  async shutdown(): Promise<void> {
    console.log("[Yae] Shutting down...");

    // Stop all user agents
    for (const [userId, _agent] of this.userAgents) {
      console.log(`[Yae] Stopping agent for user: ${userId}`);
      // agent.stop() when implemented
    }

    this.userAgents.clear();
    console.log("[Yae] Shutdown complete.");
  }

  // ─────────────────────────────────────────────────────────────
  // Yae's Own Persistence
  // ─────────────────────────────────────────────────────────────

  get memory() {
    return this.ctx.memory;
  }

  get messages() {
    return this.ctx.messages;
  }

  get files() {
    return this.ctx.files;
  }
}
