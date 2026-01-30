import { chat, type ServerTool, type AGUIEvent } from "@tanstack/ai";
import { openRouterText, type OpenRouterConfig } from "@tanstack/ai-openrouter";

import { Yae } from "@yae/core";
import type { AgentContext } from "@yae/db";
import type { WorkflowDefinition, WorkflowResult } from "@yae/core/workflows";

import { getCurrentDatetime } from "./utils";
import {
  toolReplaceMemoryDef,
  toolInsertMemoryDef,
  toolSearchLinkupDef,
  toolFetchLinkupDef,
  fetchLinkup,
  searchLinkup,
} from "./tools";

const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY,
};

async function* wrapStream(
  stream: AsyncIterable<AGUIEvent>,
  agent: UserAgent,
) {
  let response = "";
  try {
    for await (const chunk of stream) {
      if (chunk.type === "RUN_ERROR")
        console.error("[chunk error]", JSON.stringify(chunk, null, 2));
      if (chunk.type === "TEXT_MESSAGE_CONTENT") response += chunk.delta ?? "";
      yield chunk;
    }
  } catch (err) {
    console.error("[wrapStream] error during iteration:", err);
    throw err;
  }

  await agent.messages.save({ role: "assistant", content: response });
}

export class UserAgent {
  private tools: Array<ServerTool> = [];

  constructor(
    public readonly id: string,
    private readonly ctx: AgentContext,
  ) {
    this.initState();
    this.initTools();
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
    const userMessages = this.messages.getAll();
    const context = await this.buildContext();

    const stream: AsyncIterable<AGUIEvent> = chat({
      adapter: openRouterText(
        "google/gemini-3-flash-preview",
        DEFAULT_OPENROUTER_CONFIG,
      ),
      messages: userMessages,
      systemPrompts: [context],
      tools: this.tools,
      stream: true,
    });

    return wrapStream(stream, this);
  }

  //TODO: Fix the formatting to remove unneeded spaces and newlines
  private async initState(): Promise<void> {
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

  private async initTools(): Promise<void> {
    const toolReplaceMemory = toolReplaceMemoryDef.server(
      async ({ label, oldContent, newContent }) => {
        let toolId = 0;
        try {
          toolId = await this.files.toolPending("memory_replace", { label, oldContent, newContent });
          const result = await this.memory.updateMemory(
            label,
            oldContent,
            newContent,
          );
          await this.files.toolSuccess(toolId, result);
          return result;
        } catch (error) {
          await this.files.toolFailure(toolId, `${error}`);
          throw error;
        }
      },
    );

    const toolInsertMemory = toolInsertMemoryDef.server(
      async ({ label, content, line }) => {
        let toolId = 0;
        try {
          toolId = await this.files.toolPending("memory_insert", { label, content, line });
          const result = await this.memory.insertMemory(label, content, line);
          await this.files.toolSuccess(toolId, result);
          return result;
        } catch (error) {
          await this.files.toolFailure(toolId, `${error}`);
          throw error;
        }
      },
    );

    const toolSearchLinkup = toolSearchLinkupDef.server(
      async ({ query, depth }) => {
        let toolId = 0;
        try {
          toolId = await this.files.toolPending("search_linkup", { query, depth });
          const searchResults = await searchLinkup(query, depth);
          await this.files.toolSuccess(toolId, searchResults);
          return searchResults;
        } catch (error) {
          await this.files.toolFailure(toolId, `${error}`);
          throw error;
        }
      },
    );

    const toolFetchLinkup = toolFetchLinkupDef.server(
      async ({ url, renderJs }) => {
        let toolId = 0;
        try {
          toolId = await this.files.toolPending("fetch_linkup", { url, renderJs });
          const fetchResult = await fetchLinkup(url, renderJs);
          await this.files.toolSuccess(toolId, fetchResult);
          return fetchResult;
        } catch (error) {
          await this.files.toolFailure(toolId, `${error}`);
          throw error;
        }
      },
    );

    this.tools.push(toolReplaceMemory, toolInsertMemory, toolSearchLinkup, toolFetchLinkup);
  }

  private async buildContext(): Promise<string> {
    const datetime = getCurrentDatetime();
    const fileTree = await this.files.getFileTree("/");

    return `
    <Instructions>
    You are a self-improving agent with advanced memory and file system capabilities.

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
