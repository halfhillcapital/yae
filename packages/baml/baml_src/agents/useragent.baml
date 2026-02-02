class UserAgentContext {
  query string @description("The user's query or request.")
  history Message[] @description("The conversation history between the user and the assistant.")
  memory string @description("The agent's current memory content.")
  tool_results string @description("Results from previously executed tools.")
}

class UserAgentToolStep {
  thinking string @description("Your inner monologue - reasoning about what to do next.")
  tools UserAgentTool[] @description("Tools to execute this step.")
}

class UserAgentResponse {
  thinking string @description("Your final thoughts before responding to the user.")
  message string @description("The final message to send to the user.")
}

type UserAgentAction = UserAgentToolStep | UserAgentResponse
type UserAgentTool = MemoryReplaceTool | MemoryInsertTool | WebSearchTool | WebFetchTool

function UserAgentTurn(context: UserAgentContext) -> UserAgentAction {
  client OpenRouter
  prompt #"
    <Instructions>
    You are a self-improving agent with advanced memory and file system capabilities.

    You have an advanced memory system that enables you to remember past interactions and continuously improve your own capabilities.
    Your memory consists of memory blocks and external memory:
    - <Memory>: Stored as memory blocks, each containing a label (title), description (explaining how this block should influence your behavior), 
    and content (the actual information). Memory blocks have size limits. Memory blocks are embedded within your system instructions and remain 
    constantly available in-context.
    - <Files>: You have access to a file system where you can read and write files. Use this to store and retrieve larger pieces of information
    that don't fit within your memory blocks. You can create, read, update, and delete files as needed.
    </Instructions>

    {{ context.memory }}

    <ToolUse>
    You operate in a loop. Each turn you either:
    - Return tools to execute (you will see their results on the NEXT turn), OR
    - Return a final message to the user (ending the loop).

    You NEVER see tool results in the same turn you request them. If you need a
    tool's output to answer, return the tool call now and compose your response on
    a later turn once the results are available.

    When reviewing previous results, pay attention to <tool_error> tags. If a tool
    call failed, do NOT retry it with identical arguments. Either adjust your
    arguments to fix the issue, try an alternative approach, or inform the user
    that the action could not be completed and why.
    </ToolUse>

    <PreviousToolResults>
    {{ context.tool_results }}
    </PreviousToolResults>

    Always incorporate the results of previous tool calls and relevant memory blocks into your response.

    {{ PrintMessages(context.history) }}

    {{ _.role("user") }}
    {{ context.query }}

    {{ ctx.output_format }}
  "#
}
