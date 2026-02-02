class SendMessageTool {
  tool_name "send_message" @description("Send a message to the user and pause execution until they respond.")
  message string @description("The message to send to the user.")
}

class ContinueThinkingTool {
  tool_name "continue_thinking" @description("Continue processing without sending a message. Use this to chain multiple tool calls together.")
  reasoning string @description("Your reasoning for why you need to continue.")
}

class MemoryReplaceTool {
  tool_name "memory_replace" @description(#"Use this tool to replace a specific string in a memory block with a new string.
This is used for making precise edits."#)
  label string @description("Section of the memory to be edited, identified by its label.")
  old_content string @description("The exact string in the memory block that needs to be replaced.")
  new_content string @description("The new string that will replace the old content in the memory block.")
}

class MemoryInsertTool {
  tool_name "memory_insert" @description("Use this tool to insert text at a specific location in a memory block.")
  label string @description("Section of the memory to be edited, identified by its label.")
  content string @description("The text content to insert into the memory block.")
  line int @description("The line number at which to insert the content. Use 0 to insert at the beginning and -1 to insert at the end.")
}

class WebSearchTool {
  tool_name "web_search" @description("Use this tool to perform a web search for up-to-date information.")
  query string @description("The search query to use.")
  depth "standard" | "deep" @description("The depth of the search. Use 'standard' for regular results, 'deep' for more comprehensive search.")
}

class WebFetchTool {
  tool_name "web_fetch" @description("Use this tool to fetch the content of a web page.")
  url string @description("The URL of the web page to fetch.")
  render bool @description("Whether to render the page (execute JavaScript) before fetching content. Default is false.")
}