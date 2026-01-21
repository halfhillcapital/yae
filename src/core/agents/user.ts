import { Yae } from "@yae/core";
import type { AgentContext } from "@yae/db";
import type { WorkflowDefinition, WorkflowResult } from "@yae/core/workflows";

import {
  b,
  type ChatContext,
  type AgentAction,
  type ToolCallResult,
} from "baml_client";
import { getCurrentDatetime } from "./utils";

export class UserAgent {
  private isRunning = false;

  constructor(
    public readonly id: string,
    private readonly ctx: AgentContext,
  ) {}

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

    const messages: string[] = [];
    const tools: ToolCallResult[] = [];

    while (this.isRunning && iterations < 10) {
      iterations += 1;
      const context = await this.buildContext(tools);
      const step = await b.AgentStep(context);

      for (const tool of step.tools) {
        switch (tool.tool_name) {
          case "message":
            messages.push(tool.message);
            await this.messages.save({
              role: "assistant",
              content: tool.message,
            });
            break;
          case "memory_insert": {
            const result = await this.memory.toolInsertMemory(
              tool.label,
              tool.content,
              tool.line,
            );
            tools.push(result);
            break;
          }
          case "memory_update": {
            const result = await this.memory.toolUpdateMemory(
              tool.label,
              tool.old_content,
              tool.new_content,
            );
            tools.push(result);
            break;
          }
          case "web_search":
            break;
        }

        if (step.waiting_for_input) {
          console.log("Agent is waiting for user input...");
          this.isRunning = false;
        }
      }
    }
    console.log("Agent loop finished after", iterations, "iterations");
    console.log("Tools used:", tools.map((t) => t.name).flat());
    return messages.join("\n");
  }

  private async buildContext(
    tool_calls: ToolCallResult[],
  ): Promise<ChatContext> {
    return {
      memories: this.memory.getAll(),
      files: await this.files.getFileTree("/"),
      messages: this.messages.getAll(),
      datetime: getCurrentDatetime(),
      tool_calls: tool_calls,
    };
  }
}
