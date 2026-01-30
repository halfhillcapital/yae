class Message {
  role "user" | "assistant" | "system"
  content string
}

class MemoryBlock {
  label string
  description string
  content string
}

class ChatContext {
  memories MemoryBlock[]
  messages Message[]
  datetime string
}