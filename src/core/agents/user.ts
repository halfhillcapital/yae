import { Yae } from "@yae/core";
import type { AgentContext } from "@yae/db";
import type { WorkflowDefinition, WorkflowResult } from "@yae/core/workflows";

import { getCurrentDatetime } from "./utils";

export class UserAgent {
  private isRunning = false;

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

  /**
   * Chat with the agent using a tool-calling loop.
   * Returns all replies generated during the conversation turn.
   */
  async runAgentLoop(message: string): Promise<string> {
    this.isRunning = true;

    let iterations = 0;
    await this.messages.save({ role: "user", content: message });

    //TODO: implement agent loop
    while (this.isRunning && iterations < 10) {
      iterations += 1;
      const context = await this.buildContext();
    }

    return "Not implemented yet.";
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
