class Message {
  role "user" | "assistant"
  content string
}

function SummarizeMessages(messages: Message[]) -> string {
  client OpenRouter
  prompt #"
    Summarize the following conversation between a user and an assistant:

    {% for msg in messages %}
    {{ msg.role }}: {{ msg.content }}
    {% endfor %}

    Provide a concise summary.
  "#
}
