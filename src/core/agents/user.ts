import { chat, type StreamChunk } from "@tanstack/ai";
import { openRouterText, type OpenRouterConfig } from "@tanstack/ai-openrouter";

import { Yae } from "@yae/core";
import type { AgentContext } from "@yae/db";
import type { WorkflowDefinition, WorkflowResult } from "@yae/core/workflows";

import { getCurrentDatetime } from "./utils";
// import { toolUpdateMemory, toolInsertMemory } from "./tools";

const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY,
};

async function* wrapStream(
  stream: AsyncIterable<StreamChunk>,
  agent: UserAgent,
) {
  console.log("[wrapStream] generator created, waiting for consumption");
  let response = "";
  try {
    for await (const chunk of stream) {
      if (chunk.type === "error") {
        console.error("[chunk error]", JSON.stringify(chunk, null, 2));
      } else {
        console.log("[chunk]", chunk.type, chunk.delta?.slice(0, 50));
      }
      if (chunk.type === "content") response += chunk.delta ?? "";
      yield chunk;
    }
    console.log("[wrapStream] stream complete, response length:", response.length);
  } catch (err) {
    console.error("[wrapStream] error during iteration:", err);
    throw err;
  }

  await agent.messages.save({ role: "assistant", content: response });
}

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

  async runAgentTurn(message: string) {
    await this.messages.save({ role: "user", content: message });
    const userMessages = await this.messages.getAll();
    const context = await this.buildContext();

    // const updateMemory = toolUpdateMemory.server(async ({ label, oldContent, newContent }) => {
    //   return await this.memory.updateMemory(label, oldContent, newContent);
    // });

    // const insertMemory = toolInsertMemory.server(async ({ label, content, line }) => {
    //   return await this.memory.insertMemory(label, content, line);
    // });

    const stream: AsyncIterable<StreamChunk> = chat({
      adapter: openRouterText(
        "tngtech/deepseek-r1t2-chimera:free",
        DEFAULT_OPENROUTER_CONFIG,
      ),
      messages: userMessages,
      systemPrompts: [context],
      // tools: [updateMemory, insertMemory],
      stream: true,
    });

    return wrapStream(stream, this);
  }

  private async initialState(): Promise<void> {
    if (this.memory.has("Persona") || this.memory.has("Human")) return;

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

  private async buildContext(): Promise<string> {
    const datetime = getCurrentDatetime();
    const fileTree = await this.files.getFileTree("/");

    return `
    <Instructions>
    You are an self-improving agent with advanced memory and file system capabilities.

    You have an advanced memory system that enables you to remember past interactions and continuously improve your own capabilities.
    Your memory consists of memory blocks and external memory:
    - <Memory>: Stored as memory blocks, each containing a label (title), description (explaining how this block should influence your behavior), 
    and content (the actual information). Memory blocks have size limits. Memory blocks are embedded within your system instructions and remain 
    constantly available in-context.
    - <Files>: You have access to a file system where you can read and write files. Use this to store and retrieve larger pieces of information
    that don't fit within your memory blocks. You can create, read, update, and delete files as needed.

    When responding, always consider the relevant information stored in your memory blocks to provide accurate and context-aware responses.
    </Instructions>

    <Metadata>
    The current date and time is ${datetime}.
    </Metadata>

    These memory blocks are currently in your active attention:
    ${this.memory.toXML()}

    These files are currently stored in your file system:
    ${fileTree}
    `.trim();
  }
}