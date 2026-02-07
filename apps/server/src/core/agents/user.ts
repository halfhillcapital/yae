import { Yae } from "@yae/core";
import { userAgentTurn } from "@yae/baml";
import type { UserAgentTool } from "@yae/baml";
import type { AgentContext, Message } from "@yae/db";
import type {
  WorkflowDefinition,
  WorkflowResult,
} from "@yae/core/workflows/types.ts";
import { summarizeWorkflow } from "@yae/core/workflows/summarize.ts";
import {
  MAX_CONVERSATION_HISTORY,
  MAX_AGENT_STEPS,
  MAX_TOOL_RESULT_CHARS,
  MAX_TOOL_CONCURRENCY,
  DEFAULT_MEMORY_BLOCK_LIMIT,
  TOOL_TIMEOUT_MS,
  LLM_TIMEOUT_MS,
} from "src/constants.ts";

import {
  getCurrentDatetime,
  dedent,
  isPublicUrl,
  mapSettled,
  parseFrontmatter,
  truncateResult,
  withTimeout,
} from "./utils";
import { fetchLinkup, searchLinkup } from "./tools/websearch";
import personaRaw from "./prompts/persona.md" with { type: "text" };
import humanRaw from "./prompts/human.md" with { type: "text" };
import summaryRaw from "./prompts/conversation.md" with { type: "text" };

const initialBlocks = [personaRaw, humanRaw, summaryRaw].map(parseFrontmatter);

// --- Types ---

export type AgentLoopEvent =
  | { type: "THINKING"; content: string }
  | { type: "MESSAGE"; content: string }
  | { type: "TOOL_CALL"; content: string }
  | { type: "TOOL_RESULT"; content: string }
  | { type: "TOOL_ERROR"; content: string }
  | { type: "ERROR"; content: string };

// --- Agent Loop ---

export async function* runAgentLoop(
  agent: UserAgent,
  message: Message,
  instructions?: string,
  maxSteps: number = 10,
): AsyncGenerator<AgentLoopEvent> {
  maxSteps = Math.min(maxSteps, MAX_AGENT_STEPS);

  // Pre-flight: kick off summarization in parallel if threshold exceeded
  let summarizePromise: Promise<WorkflowResult<unknown> | null> | null = null;
  if (agent.messages.getMessageHistory().length >= MAX_CONVERSATION_HISTORY) {
    summarizePromise = agent.runWorkflow(summarizeWorkflow).catch((err) => {
      console.error("[summarize] workflow failed:", err);
      return null;
    });
  }

  // Agent is already initialized via factory
  const allResults: string[] = [];
  let responded = false;

  for (let step = 0; step < maxSteps; step++) {
    const context = await agent.buildContext();

    let agentStep;
    try {
      agentStep = await withTimeout(
        userAgentTurn({
          query: message.content,
          history: agent.messages.getMessageHistory(),
          memory: context,
          tool_results: allResults.join("\n"),
          instructions: instructions ?? "",
        }),
        LLM_TIMEOUT_MS,
        "LLM call",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: "ERROR", content: `Agent turn failed: ${msg}` };
      break;
    }

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
    if (agentStep.tools.length === 0) {
      yield {
        type: "TOOL_ERROR",
        content: "Agent returned empty tool list — skipping step.",
      };
      continue;
    }

    for (const tool of agentStep.tools) {
      yield { type: "TOOL_CALL", content: tool.tool_name };
    }

    const settled = await mapSettled(
      agentStep.tools,
      (tool) =>
        withTimeout(agent.executeTool(tool), TOOL_TIMEOUT_MS, tool.tool_name),
      MAX_TOOL_CONCURRENCY,
    );

    for (const [i, result] of settled.entries()) {
      const toolName = agentStep.tools[i]!.tool_name;
      if (result.status === "fulfilled") {
        const value = truncateResult(result.value, MAX_TOOL_RESULT_CHARS);
        const str = `<tool_result step="${step + 1}" tool="${toolName}">${value}</tool_result>`;
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
    // Only persist when work actually happened (tools ran). If the LLM
    // failed on the very first call, don't pollute history with a
    // synthetic exchange the model never saw.
    if (allResults.length > 0) {
      await agent.messages.save(message);
      await agent.messages.save({ role: "assistant", content });
    }
    yield { type: "ERROR", content };
  }

  // Await parallel summarization before returning
  if (summarizePromise) {
    await summarizePromise;
  }
}

// --- UserAgent ---

export class UserAgent {
  private constructor(
    public readonly id: string,
    private readonly ctx: AgentContext,
  ) {}

  static async create(id: string, ctx: AgentContext): Promise<UserAgent> {
    const agent = new UserAgent(id, ctx);
    await agent.initState();
    return agent;
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

  async close(): Promise<void> {
    await this.ctx.close();
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
      return await worker.execute(
        workflow,
        this.id,
        this.ctx,
        yae.workflows,
        data,
      );
    } finally {
      yae.returnWorker(worker.id);
    }
  }

  private async initState(): Promise<void> {
    if (this.memory.has("persona") || this.memory.has("human")) return;

    for (const block of initialBlocks) {
      await this.memory.set(block.label, block.description, block.content, {
        protected: block.protected,
        readonly: block.readonly,
        limit: block.limit,
      });
    }
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
        return this.memory.toolReplaceMemory(
          tool.label,
          tool.old_content,
          tool.new_content,
        );
      case "memory_insert":
        return this.memory.toolInsertMemory(
          tool.label,
          tool.content,
          tool.position,
        );
      case "memory_create":
        return this.memory.toolCreateMemory(
          tool.label,
          tool.description,
          tool.content,
          DEFAULT_MEMORY_BLOCK_LIMIT,
        );
      case "memory_delete":
        return this.memory.toolDeleteMemory(tool.label);
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
        const depth = tool.depth === "deep" ? "deep" : "standard";
        const result = await searchLinkup(tool.query, depth);
        return result.answer;
      }
      case "web_fetch": {
        if (!isPublicUrl(tool.url)) {
          throw new Error("Blocked URL: only public http(s) URLs are allowed");
        }
        const result = await fetchLinkup(tool.url, tool.render);
        return result.markdown;
      }
      default:
        throw new Error(
          `Unknown tool: ${(tool as { tool_name: string }).tool_name}`,
        );
    }
  }

  async buildContext(): Promise<string> {
    const datetime = getCurrentDatetime();
    const memoryXML = this.memory.toXML();
    const fileXML = await this.files.toXML("/");

    return dedent`
    <metadata>
    The current date and time is ${datetime}.
    </metadata>

    These memory blocks are currently in your active attention:
    ${memoryXML}

    These files are currently stored in your file system:
    ${fileXML}`;
  }
}
