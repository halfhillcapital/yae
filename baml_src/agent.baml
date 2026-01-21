// Agent Loop Tool Definitions

class MessageTool {
  tool_name "message" @description("Use this tool to send a message to the user.")
  message string @description("The message to send to the user.")
}

class MemoryUpdateTool {
  tool_name "memory_update" @description(#"Use this tool to replace a specific string in a memory block with a new string. 
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

class FileReadTool {
  tool_name "file_read" @description("Use this tool to read the contents of a file from the virtual filesystem.")
  path string @description("The path to the file to be read.")
}

class FileWriteTool {
  tool_name "file_write" @description("Use this tool to write content to a file in the virtual filesystem.")
  path string @description("The path to the file to be written.")
  content string @description("The content to write to the file.")
}

// Currently unused but may be useful in the future
class FileListTool {
  tool_name "file_list" @description("Use this tool to list files in a directory.")
  path string @description("The path to the directory to list files from.")
}

class WebSearchTool {
  tool_name "web_search" @description("Use this tool to perform a web search for up-to-date information.")
  query string @description("The search query to use.")
}

type AgentAction = MessageTool | MemoryUpdateTool | MemoryInsertTool | WebSearchTool

class AgentPlan {
  tools AgentAction[] @description("The tools you want to call.")
  waiting_for_input bool @description("Set to true if you are waiting for user input after this step. Default is false.")
}

function AgentStep(context: ChatContext) -> AgentPlan {
  client "LMStudio"
  prompt #"
    You are an AI companion with a hierarchical memory system and tool-calling capabilities.
    The current date and time is {{ context.datetime }}.

    ## Memory Architecture
    You have two tiers of memory:
    -  <Memory>: Stored as memory blocks, each containing a label (title), description (explaining how this block should influence your behavior), 
    and content (the actual information). Memory blocks have size limits. Memory blocks are embedded within your system instructions and remain constantly 
    available in-context.
    -  <VFS>: A virtual filesystem that is accessible and that you can bring into context with tools when needed.

    ## Context

    These blocks are currently in your active attention:
    <Memory>
    {% for memory in context.memories %}
      <Block label="{{ memory.label }}">
        <Description>{{ memory.description }}</Description>
        <Content>{{ memory.content }}</Content>
      </Block>
    {% endfor %}
    </Memory>

    The following files exist in your long-term storage:
    <VFS>
    {{ context.files }}
    </VFS>

    {% if context.tool_calls %}
    ## Tool History
    You have previously called the following tools:
    {% for tool_call in context.tool_calls %}
    ---
    tool_name: {{ tool_call.name }}
    status: {{ tool_call.status }}
    input: {{ tool_call.input }}
    output: {{ tool_call.output }}
    ---
    {% endfor %}
    **IMPORTANT**: Use these results to inform your next actions!
    {% endif %}

    Continue calling tools until the current task is complete or you need user input. 
    To continue: call another tool and set the waiting_for_input flag to false. 
    To yield control: set the waiting_for_input flag to true.
    {{ ctx.output_format }}
    
    {% for message in context.messages %}
      {{ _.role(message.role) }}
      {{ message.content }}
    {% endfor %}
  "#
}

test TestName {
  functions [AgentStep]
  args {
    context {
        memories [
        {
            label #"
            hello world
          "#
            description #"
            hello world
          "#
            content #"
            hello world
          "#
        },
        {
            label #"
            hello world
          "#
            description #"
            hello world
          "#
            content #"
            hello world
          "#
        }
      ]
        files #"
        hello world
      "#
        messages [
        {
            role "user"
            content #"
            hello world
          "#
        },
        {
            role "user"
            content #"
            hello world
          "#
        }
      ]
        datetime #"
        hello world
      "#
    }
  }
}

