class Message {
  role "user" | "assistant" | "system"
  content string
}

class MemoryBlock {
  label string
  description string
  content string
  updated_at int
}

class ToolCallResult {
  name string
  status "success" | "failure"
  input string
  output string
}

class ChatContext {
  memories MemoryBlock[]
  files string
  messages Message[]
  datetime string

  tool_calls ToolCallResult[]
}