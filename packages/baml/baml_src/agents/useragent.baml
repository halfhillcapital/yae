type UserAgentTool = MemoryReplaceTool | MemoryInsertTool | WebSearchTool | WebFetchTool | SendMessageTool | ContinueThinkingTool

class UserAgentContext {
  query string @description("The user's query or request.")
  history Message[] @description("The conversation history between the user and the assistant.")
  memory string @description("The agent's current memory content.")
  tool_results string @description("Results from previously executed tools.")
}

class UserAgentStep {
  thinking string @description("Your inner monologue - reasoning about what to do next.")
  tools UserAgentTool[] @description("Tools to execute this step. Use send_message to reply to user, or continue_thinking to keep processing.")
}

function UserAgentTurn(context: UserAgentContext) -> UserAgentStep {
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

    Previous tool results:
    {{ context.tool_results }}

    You can call multiple tools in sequence. Use:
    - send_message: When ready to reply to the user (ends the loop)
    - continue_thinking: When you need to call more tools first
    - Other tools: To perform actions (memory edits, web search, etc.)

    When responding, always consider the relevant information stored in your memory blocks to provide accurate and context-aware responses.

    {{ PrintMessages(context.history) }}

    {{ _.role("user") }}
    {{ context.query }}

    {{ ctx.output_format }}
  "#
}
