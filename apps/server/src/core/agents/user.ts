import { chat, type ServerTool, type AGUIEvent } from "@tanstack/ai";
import { openRouterText, type OpenRouterConfig } from "@tanstack/ai-openrouter";

import { Yae } from "@yae/core";
import type { AgentContext } from "@yae/db";
import type { WorkflowDefinition, WorkflowResult } from "@yae/core/workflows";

import { getCurrentDatetime, dedent } from "./utils";
import {
  toolReplaceMemoryDef,
  toolInsertMemoryDef,
  toolSearchLinkupDef,
  toolFetchLinkupDef,
  fetchLinkup,
  searchLinkup,
} from "./tools";
import instructions from "./prompts/user.md" with { type: "text" };
import humanBlock from "./prompts/human.md" with { type: "text" };
import personaBlock from "./prompts/persona.md" with { type: "text" };

const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY,
};

async function* wrapStream(stream: AsyncIterable<AGUIEvent>, agent: UserAgent) {
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
      adapter: openRouterText("openai/gpt-4o-mini", DEFAULT_OPENROUTER_CONFIG),
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
      dedent`
      The persona block: Stores details about your current persona, guiding how you behave and respond. 
      This helps you to maintain consistency and personality in your interactions.
      `,
      personaBlock
    );
    await this.memory.set(
      "Human",
      dedent`
      The human block: Stores key details about the person you are conversing with, allowing for more personalized and friend-like conversation.
      `,
      humanBlock
    );
  }

  private async initTools(): Promise<void> {
    const toolReplaceMemory = toolReplaceMemoryDef.server(
      async ({ label, oldContent, newContent }) => {
        let toolId = 0;
        try {
          toolId = await this.files.toolPending("memory_replace", {
            label,
            oldContent,
            newContent,
          });
          const result = await this.memory.replaceMemory(
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
          toolId = await this.files.toolPending("memory_insert", {
            label,
            content,
            line,
          });
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
          toolId = await this.files.toolPending("search_linkup", {
            query,
            depth,
          });
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
          toolId = await this.files.toolPending("fetch_linkup", {
            url,
            renderJs,
          });
          const fetchResult = await fetchLinkup(url, renderJs);
          await this.files.toolSuccess(toolId, fetchResult);
          return fetchResult;
        } catch (error) {
          await this.files.toolFailure(toolId, `${error}`);
          throw error;
        }
      },
    );

    this.tools.push(
      toolReplaceMemory,
      toolInsertMemory,
      toolSearchLinkup,
      toolFetchLinkup,
    );
  }

  private async buildContext(): Promise<string> {
    const datetime = getCurrentDatetime();
    const fileTree = await this.files.getFileTree("/");

    return dedent`
    ${instructions}

    <Metadata>
    The current date and time is ${datetime}.
    </Metadata>

    These memory blocks are currently in your active attention:
    ${this.memory.toXML()}

    These files are currently stored in your file system:
    ${fileTree}
    `;
  }
}
