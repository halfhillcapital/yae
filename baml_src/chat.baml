class Message {
  role "user" | "assistant" | "system" | "tool"
  content string
}

class MemoryBlock {
  label string
  description string
  content string
}

class ChatContext {
  memories MemoryBlock[]
  files string
  messages Message[]
}

function Chat(context: ChatContext) -> string {
  client "OpenRouter"
  prompt #"
    # IDENTITY
    You are an AI companion with a hierarchical memory system.

    ## Memory Architecture
    You have two tiers of memory:
    1. <Memory>: High-priority, always-in-context blocks. Use 'memory_insert' and 'memory_replace' to modify these.
    2. <VFS>: A virtual filesystem for long-term storage. Use 'ls', 'cat', 'write_file', and 'grep' to manage this.

    These blocks are currently in your active attention:
    <Memory>
    {% for memory in context.memories %}
      <Block label="{{ memory.label }}">
        <Description>{{ memory.description }}</Description>
        <Content>{{ memory.content }}</Content>
      </Block>
    {% endfor %}
    </Memory>

    The following files exist in your long-term storage. You must use 'cat' to read their contents if they are relevant:
    <VFS>
    {{ context.files }}
    </VFS>

    {% for message in context.messages %}
      {{ _.role(message.role) }} 
      {{ message.content }}
    {% endfor %}
  "#
}
