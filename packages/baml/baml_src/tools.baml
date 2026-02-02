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
  position "beginning" | "end" @description("The position at which to insert the content.")
}

class MemoryCreateTool {
  tool_name "memory_create" @description("Use this tool to create a new memory block with a label, description, and initial content.")
  label string @description("A unique label (title) for the new memory block.")
  description string @description("A description explaining how this memory block should influence your behavior.")
  content string @description("The initial content of the memory block.")
}

class MemoryDeleteTool {
  tool_name "memory_delete" @description("Permanently delete a memory block. This is irreversible. Protected blocks (Persona, Human) cannot be deleted.")
  label string @description("The label of the memory block to delete.")
}

class FileReadTool {
  tool_name "file_read" @description("Use this tool to read the contents of a file from your file system.")
  path string @description("The absolute path of the file to read.")
}

class FileWriteTool {
  tool_name "file_write" @description("Use this tool to create or overwrite a file in your file system.")
  path string @description("The absolute path of the file to write.")
  content string @description("The text content to write to the file.")
}

class FileListTool {
  tool_name "file_list" @description("Use this tool to list the contents of a directory in your file system as a tree.")
  path string @description("The absolute path of the directory to list.")
}

class FileDeleteTool {
  tool_name "file_delete" @description("Use this tool to delete a file from your file system.")
  path string @description("The absolute path of the file to delete.")
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