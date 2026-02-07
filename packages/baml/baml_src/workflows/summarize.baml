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

// Test cases for the summarization workflow.

test SummarizeChunkBasic {
  functions [SummarizeChunk]
  args {
    messages [
      { role "user", content "Hey, I'm working on a Python project and need help with async." },
      { role "assistant", content "Sure! Are you using asyncio or a third-party library like Trio?" },
      { role "user", content "asyncio. I want to run multiple API calls concurrently." },
      { role "assistant", content "You can use asyncio.gather() to run multiple coroutines concurrently. Here's an example..." },
      { role "user", content "Perfect. Also, I prefer type hints everywhere — can you keep that in mind?" }
    ]
  }
}

test SummarizeChunkWithDecisions {
  functions [SummarizeChunk]
  args {
    messages [
      { role "user", content "Should we use PostgreSQL or SQLite for the new service?" },
      { role "assistant", content "For a multi-user service with concurrent writes, PostgreSQL is the better choice." },
      { role "user", content "Agreed. Let's go with PostgreSQL. Also, let's use Drizzle ORM instead of Prisma." },
      { role "assistant", content "Sounds good. I'll set up the schema with Drizzle and PostgreSQL." },
      { role "user", content "One more thing — the deployment target is Railway, so keep that in mind for connection pooling." }
    ]
  }
}

test SummarizeChunkOngoingTask {
  functions [SummarizeChunk]
  args {
    messages [
      { role "user", content "I need to refactor the auth module. It's a mess right now." },
      { role "assistant", content "What's the main issue — is it the token validation or the session management?" },
      { role "user", content "Both, honestly. Let's start with token validation today and tackle sessions tomorrow." },
      { role "assistant", content "OK, I'll start by extracting the token validation into its own service." }
    ]
  }
}

// This test simulates merging new summaries into an existing summary, ensuring that the final output integrates all information cohesively.

test MergeSummariesNoExisting {
  functions [MergeSummaries]
  args {
    summaries [
      {
        topics ["async Python", "asyncio.gather"],
        key_decisions ["Use asyncio over Trio"],
        user_preferences ["Prefers type hints everywhere"],
        ongoing_tasks [],
        narrative "The user asked for help with concurrent API calls in Python using asyncio. The assistant recommended asyncio.gather(). The user also noted a preference for type hints."
      },
      {
        topics ["database selection", "ORM choice"],
        key_decisions ["Use PostgreSQL", "Use Drizzle ORM"],
        user_preferences ["Deploys to Railway"],
        ongoing_tasks ["Set up Drizzle schema with PostgreSQL"],
        narrative "The user and assistant decided on PostgreSQL over SQLite for the new service, and Drizzle ORM over Prisma. Deployment target is Railway."
      }
    ]
    existing_summary null
  }
}

test MergeSummariesWithExisting {
  functions [MergeSummaries]
  args {
    summaries [
      {
        topics ["auth refactor", "token validation"],
        key_decisions ["Start with token validation first"],
        user_preferences [],
        ongoing_tasks ["Refactor session management"],
        narrative "The user wants to refactor the auth module. They decided to tackle token validation first and defer session management to tomorrow."
      }
    ]
    existing_summary "The user is building a service with PostgreSQL and Drizzle ORM, deployed on Railway. They prefer type hints and are using asyncio for concurrent operations."
  }
}