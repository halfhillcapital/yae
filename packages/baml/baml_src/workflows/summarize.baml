class ConversationSummary {
  topics string[] @description("Main topics discussed in this conversation segment.")
  key_decisions string[] @description("Important decisions made or conclusions reached.")
  user_preferences string[] @description("User preferences, habits, or personal details revealed.")
  ongoing_tasks string[] @description("Tasks or requests that are in progress or unresolved.")
  narrative string @description("A cohesive paragraph summarizing the conversation flow and context.")
}

function SummarizeChunk(messages: Message[]) -> ConversationSummary {
  client OpenRouter
  prompt #"
    Analyze the following conversation segment between a user and an assistant.
    Extract structured information that captures the essential context.

    Focus on:
    - What topics were discussed
    - What decisions or conclusions were reached
    - Any user preferences or personal details revealed
    - Any ongoing or unresolved tasks
    - A narrative summary that preserves conversational context

    Be concise but thorough. Do not omit important details.

    <conversation>
    {% for msg in messages %}
    {{ msg.role }}: {{ msg.content }}
    {% endfor %}
    </conversation>

    {{ ctx.output_format }}
  "#
}

function MergeSummaries(summaries: ConversationSummary[], existing_summary: string?) -> string {
  client OpenRouter
  prompt #"
    You are merging conversation summaries into a single cohesive summary.

    {% if existing_summary %}
    This is a continuation of an ongoing conversation. Here is the previous summary:
    <previous_summary>
    {{ existing_summary }}
    </previous_summary>
    {% endif %}

    Here are the new conversation segment summaries to merge (in chronological order):
    {% for s in summaries %}
    <segment index="{{ loop.index }}">
    Topics: {{ s.topics }}
    Decisions: {{ s.key_decisions }}
    User preferences: {{ s.user_preferences }}
    Ongoing tasks: {{ s.ongoing_tasks }}
    Narrative: {{ s.narrative }}
    </segment>
    {% endfor %}

    Produce a single merged summary that:
    - Integrates the previous summary (if any) with new segments
    - Prioritizes recent information over older context
    - Deduplicates repeated topics or preferences
    - Preserves all ongoing/unresolved tasks
    - Keeps user preferences and key decisions
    - Is concise but retains all important context
    - Is written as a cohesive paragraph, not bullet points

    {{ ctx.output_format }}
  "#
}
