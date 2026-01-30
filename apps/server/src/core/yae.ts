import { timingSafeEqual } from "node:crypto";

import { DATA_DIR, AGENTS_DB_DIR } from "./constants.ts";
import { AgentContext, AdminContext, type User, type UserRole } from "@yae/db";
import { UserAgent, WorkerAgent } from "./agents";

export type HealthStatus = {
  status: "ok" | "degraded" | "error";
  uptime: number;
  activeAgents: number;
  pool: { available: number; busy: number };
  timestamp: number;
};

export class Yae {
  private static instance: Yae | null = null;
  private readonly startTime = Date.now();
  private readonly adminToken: string;
  private userAgents = new Map<string, UserAgent>();

  // Worker pool
  private availableWorkers: WorkerAgent[] = [];
  private busyWorkers = new Map<string, WorkerAgent>();
  private static readonly DEFAULT_POOL_SIZE = 4;

  private constructor(
    private readonly ctx: AgentContext,
    private readonly admin: AdminContext,
  ) {
    this.adminToken = `yae_admin_${crypto.randomUUID().replace(/-/g, "")}`;
  }

  getAdminToken(): string {
    return this.adminToken;
  }

  isAdminToken(token: string): boolean {
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(this.adminToken);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  static async initialize(): Promise<Yae> {
    if (Yae.instance) return Yae.instance;

    const ctx = await AgentContext.create("yae", DATA_DIR);
    const admin = await AdminContext.create(DATA_DIR + "/yae.db");

    Yae.instance = new Yae(ctx, admin);
    Yae.instance.initializePool();
    return Yae.instance;
  }

  private initializePool(size: number = Yae.DEFAULT_POOL_SIZE): void {
    for (let i = 0; i < size; i++) {
      this.availableWorkers.push(new WorkerAgent(crypto.randomUUID()));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Worker Pool Management
  // ─────────────────────────────────────────────────────────────

  checkoutWorker(agentId: string): WorkerAgent | null {
    const worker = this.availableWorkers.pop();
    if (!worker) return null;

    console.log(`[Yae] Worker ${worker.id} checked out by agent ${agentId}.`);

    this.busyWorkers.set(worker.id, worker);
    return worker;
  }

  returnWorker(workerId: string): void {
    const worker = this.busyWorkers.get(workerId);
    if (worker) {
      console.log(
        `[Yae] Worker ${worker.id} returned by agent ${worker.currentOwner}. Completed workflow: ${worker.currentWorkflow}`,
      );
      worker.currentOwner = null;
      worker.currentWorkflow = null;
      this.busyWorkers.delete(workerId);
      this.availableWorkers.push(worker);
    }
  }

  getPoolStatus(): { available: number; busy: number } {
    return {
      available: this.availableWorkers.length,
      busy: this.busyWorkers.size,
    };
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

  async createUserAgent(userId: string): Promise<UserAgent> {
    const existing = this.userAgents.get(userId);
    if (existing) return existing;

    const agentId = `agent_${userId}`;
    const ctx = await AgentContext.create(agentId, AGENTS_DB_DIR);
    const agent = new UserAgent(agentId, ctx);

    this.userAgents.set(userId, agent);
    return agent;
  }

  getUserAgent(userId: string): UserAgent | undefined {
    return this.userAgents.get(userId);
  }

  listUserAgents(): Map<string, UserAgent> {
    return new Map(this.userAgents);
  }

  deleteUserAgent(userId: string): boolean {
    return this.userAgents.delete(userId);
  }

  // ─────────────────────────────────────────────────────────────
  // User Management (via AdminContext)
  // ─────────────────────────────────────────────────────────────

  async registerUser(name: string, role: UserRole = "user"): Promise<User> {
    return this.admin.registerUser(name, role);
  }

  async getUserByToken(token: string): Promise<User | null> {
    return this.admin.getUserByToken(token);
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
      pool: this.getPoolStatus(),
      timestamp: Date.now(),
    };
  }

  async shutdown(): Promise<void> {
    console.log("[Yae] Shutting down...");

    // Clear worker pools (workers are stateless, no stop() needed)
    console.log(
      `[Yae] Clearing ${this.availableWorkers.length} available, ${this.busyWorkers.size} busy workers`,
    );
    this.availableWorkers = [];
    this.busyWorkers.clear();

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
