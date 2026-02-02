import { Yae } from "@yae/core";
import { userAgentTurn } from "@yae/baml";
import type { UserAgentTool } from "@yae/baml";
import type { AgentContext, Message } from "@yae/db";
import type { WorkflowDefinition, WorkflowResult } from "@yae/core/workflows";

import { getCurrentDatetime, dedent } from "./utils";
import {
  fetchLinkup,
  searchLinkup,
} from "./tools";
import humanBlock from "./prompts/blocks/human.md" with { type: "text" };
import personaBlock from "./prompts/blocks/persona.md" with { type: "text" };

export async function* runAgentLoop(
  message: Message,
  agent: UserAgent,
  maxSteps: number = 10,
) {
  const context = await agent.buildContext();
  const allResults: string[] = [];
  let responded = false;

  for (let step = 0; step < maxSteps; step++) {
    const agentStep = await userAgentTurn({
      query: message.content,
      history: agent.messages.getAll(),
      memory: context,
      tool_results: allResults.join("\n"),
    });

    yield { type: "THINKING", content: agentStep.thinking };

    // UserAgentResponse → final message, exit loop
    if ("message" in agentStep) {
      const content = agentStep.message;
      await agent.messages.save(message);
      await agent.messages.save({ role: "assistant", content });
      yield { type: "MESSAGE", content };
      responded = true;
      break;
    }

    // UserAgentToolStep → execute tools, loop
    for (const tool of agentStep.tools) {
      yield { type: "TOOL_CALL", content: tool.tool_name };
    }
    const settled = await Promise.allSettled(
      agentStep.tools.map((tool) => agent.executeTool(tool)),
    );
    for (const [i, result] of settled.entries()) {
      const toolName = agentStep.tools[i]!.tool_name;
      if (result.status === "fulfilled") {
        const str = `<tool_result step="${step + 1}" tool="${toolName}">${result.value}</tool_result>`;
        allResults.push(str);
        yield { type: "TOOL_RESULT", content: str };
      } else {
        const str = `<tool_error step="${step + 1}" tool="${toolName}">${result.reason}</tool_error>`;
        allResults.push(str);
        yield { type: "TOOL_ERROR", content: str };
      }
    }
  }

  // Fallback when max steps exhausted without a response
  if (!responded) {
    const content =
      "I wasn't able to complete my response within the allowed steps. Please try again or rephrase your request.";
    await agent.messages.save(message);
    await agent.messages.save({ role: "assistant", content });
    yield { type: "ERROR", content };
  }
}

export class UserAgent {
  constructor(
    public readonly id: string,
    private readonly ctx: AgentContext,
  ) {
    this.initState();
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

  async executeTool(tool: UserAgentTool): Promise<string> {
    const toolId = await this.files.toolPending(tool.tool_name, tool);
    try {
      const result = await this.runTool(tool);
      await this.files.toolSuccess(toolId, result);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.files.toolFailure(toolId, msg);
      throw e;
    }
  }

  private async runTool(tool: UserAgentTool): Promise<string> {
    switch (tool.tool_name) {
      case "memory_replace":
        return this.memory.replaceMemory(tool.label, tool.old_content, tool.new_content);
      case "memory_insert":
        return this.memory.insertMemory(tool.label, tool.content, tool.position);
      case "memory_create": {
        const blockCount = this.memory.getAll().length;
        if (blockCount >= 20)
          throw new Error(
            `Memory block limit reached (${blockCount}/20). Delete an existing block before creating a new one.`,
          );
        await this.memory.set(tool.label, tool.description, tool.content);
        return `Memory block "${tool.label}" created (${blockCount + 1}/20).`;
      }
      case "memory_delete": {
        const PROTECTED_LABELS = ["Persona", "Human"];
        if (PROTECTED_LABELS.includes(tool.label))
          throw new Error(
            `Memory block "${tool.label}" is protected and cannot be deleted.`,
          );
        const deleted = await this.memory.delete(tool.label);
        if (!deleted)
          throw new Error(`Memory block "${tool.label}" does not exist.`);
        return `Memory block "${tool.label}" deleted.`;
      }
      case "file_read":
        return await this.files.readFile(tool.path, "utf-8");
      case "file_write":
        await this.files.writeFile(tool.path, tool.content, "utf-8");
        return `File "${tool.path}" written.`;
      case "file_list":
        return await this.files.getFileTree(tool.path);
      case "file_delete":
        await this.files.unlink(tool.path);
        return `File "${tool.path}" deleted.`;
      case "web_search": {
        const result = await searchLinkup(tool.query, tool.depth);
        return result.answer;
      }
      case "web_fetch": {
        const result = await fetchLinkup(tool.url, tool.render);
        return result.markdown;
      }
    }
  }

  async buildContext(): Promise<string> {
    const datetime = getCurrentDatetime();
    const fileTree = await this.files.getFileTree("/");

    return dedent`
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
