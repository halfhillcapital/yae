import { timingSafeEqual } from "node:crypto";

import { DATA_DIR, AGENTS_DB_DIR } from "../constants.ts";
import {
  AgentContext,
  AdminContext,
  type User,
  type UserRole,
  type Webhook,
  type WebhookEvent,
} from "@yae/db";
import { UserAgent } from "./agents/user.ts";
import { WorkerAgent } from "./agents/worker.ts";

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
    if (existing) {
      console.log(`[Yae] Reusing existing agent for user ${userId}`);
      return existing;
    }
    console.log(`[Yae] Creating new agent for user ${userId}`);

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

  async deleteUserAgent(userId: string): Promise<boolean> {
    const agent = this.userAgents.get(userId);
    if (!agent) return false;
    await agent.close();
    return this.userAgents.delete(userId);
  }

  // ─────────────────────────────────────────────────────────────
  // User Management (via AdminContext)
  // ─────────────────────────────────────────────────────────────

  async registerUser(name: string, role: UserRole = "user"): Promise<User> {
    return this.admin.users.register(name, role);
  }

  async getUserByToken(token: string): Promise<User | null> {
    return this.admin.users.getByToken(token);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.admin.users.getById(id);
  }

  async listUsers(): Promise<User[]> {
    return this.admin.users.list();
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.admin.users.delete(id);
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

    // Close all agent connections
    for (const agent of this.userAgents.values()) {
      await agent.close();
    }
    this.userAgents.clear();

    // Close Yae's own connections
    await this.ctx.close();
    this.admin.close();

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

  get workflows() {
    return this.admin.workflows;
  }

  get webhooks() {
    return this.admin.webhooks;
  }

  // ─────────────────────────────────────────────────────────────
  // Webhook Dispatch
  // ─────────────────────────────────────────────────────────────

  async dispatchWebhookEvent(
    webhook: Webhook,
    event: WebhookEvent,
  ): Promise<void> {
    if (!webhook.target_user_id || !webhook.target_workflow) {
      // No dispatch target — event is stored only
      return;
    }

    try {
      // TODO: trigger workflow on agent when workflow registry is implemented
      // await this.createUserAgent(webhook.target_user_id);

      await this.admin.webhooks.updateEventStatus(event.id, "dispatched");
      console.log(
        `[Yae] Dispatched webhook event ${event.id} to user ${webhook.target_user_id}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.admin.webhooks.updateEventStatus(event.id, "failed", message);
      console.error(
        `[Yae] Failed to dispatch webhook event ${event.id}: ${message}`,
      );
    }
  }
}
