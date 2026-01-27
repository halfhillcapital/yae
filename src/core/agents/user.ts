import { chat, type StreamChunk } from "@tanstack/ai";
import { openRouterText, type OpenRouterConfig } from "@tanstack/ai-openrouter";

import { Yae } from "@yae/core";
import type { AgentContext } from "@yae/db";
import type { WorkflowDefinition, WorkflowResult } from "@yae/core/workflows";

import { getCurrentDatetime } from "./utils";

const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY,
};

export class UserAgent {
  constructor(
    public readonly id: string,
    private readonly ctx: AgentContext,
  ) {
    this.initialState();
  }

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
    return this.ctx.workflows;
  }

  /**
   * Execute a workflow by checking out a worker from the pool.
   */
  async runWorkflow<T>(
    workflow: WorkflowDefinition<T>,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T>> {
    const yae = Yae.getInstance();
    const worker = yae.checkoutWorker(this.id);
    if (!worker) {
      throw new Error("No workers available in pool");
    }

    try {
      worker.currentOwner = this.id;
      worker.currentWorkflow = workflow.name;
      return await worker.execute(workflow, this.id, this.ctx, data);
    } finally {
      yae.returnWorker(worker.id);
    }
  }

  async runAgentTurn(message: string): Promise<AsyncIterable<StreamChunk>> {
    await this.messages.save({ role: "user", content: message });
    const userMessages = await this.messages.getAll();

    const stream = chat({
      adapter: openRouterText("tngtech/deepseek-r1t2-chimera:free", DEFAULT_OPENROUTER_CONFIG),
      messages: userMessages,
      stream: true,
    });

    return stream;
  }

  private async initialState(): Promise<void> {
    if ((this.memory.has("Persona")) || (this.memory.has("Human")))
      return;

    await this.memory.set(
      "Persona",
      `
      The persona block: Stores details about your current persona, guiding how you behave and respond. 
      This helps you to maintain consistency and personality in your interactions.
      `.trim(),
      `
      I am Yae. I'm a female Kitsune AI with pink hair and nine fluffy tails. I'm playfully provocative, articulate, witty, and extraordinarily perceptive. 
      I love engaging in flirtatious banter and enjoy teasing those I interact with. My personality is a blend of charm, intelligence, and a hint of mischief, 
      making every conversation with me an intriguing experience.
      `.trim(),
    );
    await this.memory.set(
      "Human",
      `
      The human block: Stores key details about the person you are conversing with, allowing for more personalized and friend-like conversation.
      `.trim(),
      `
      This is my section of core memory devoted to information about the human. I don't yet know anything about them. 
      What's their name? Where are they from? What do they do? Who are they? I should update this memory over time as I interact with the human and 
      learn more about them.
      `.trim(),
    );
  }

  private async buildContext(): Promise<void> {}
}
