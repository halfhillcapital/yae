function SummarizeMessages(context: ChatContext) -> string {
  client "OpenRouter"
  prompt #"
    You are an AI companion with a hierarchical memory system.
    The current date and time is {{ context.datetime }}.

    <Memory>: Stored as memory blocks, each containing a label (title), description (explaining how this block should influence your behavior), 
    and content (the actual information). Memory blocks have size limits. Memory blocks are embedded within your system instructions and remain constantly 
    available in-context.

    These blocks are currently in your active attention:
    <Memory>
    {% for memory in context.memories %}
      <Block label="{{ memory.label }}">
        <Description>{{ memory.description }}</Description>
        <Content>{{ memory.content }}</Content>
      </Block>
    {% endfor %}
    </Memory>
    
    {% for message in context.messages %}
      {{ _.role(message.role) }}
      {{ message.content }}
    {% endfor %}

    {{ ctx.output_format }}
  "#
}

