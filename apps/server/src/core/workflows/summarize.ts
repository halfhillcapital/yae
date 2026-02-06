import { summarizeChunk, mergeSummaries } from "@yae/baml";
import type { Message } from "@yae/db";
import { MAX_CONVERSATION_HISTORY } from "src/constants.ts";
import { defineWorkflow } from "./utils.ts";

const CHUNK_SIZE = 20;

interface SummarizeState {
  existingSummary: string | null;
  messagesToSummarize: Message[];
  chunks: Message[][];
  chunkSummaries: Array<{
    topics: string[];
    key_decisions: string[];
    user_preferences: string[];
    ongoing_tasks: string[];
    narrative: string;
  }>;
  finalSummary: string;
  prunedCount: number;
}

/**
 * Chunks messages into groups of `size`, respecting user/assistant pair boundaries.
 * Never splits a user message from its following assistant reply.
 */
export function chunkMessages(messages: Message[], size: number): Message[][] {
  const chunks: Message[][] = [];
  let i = 0;

  while (i < messages.length) {
    const chunk: Message[] = [];

    while (chunk.length < size && i < messages.length) {
      chunk.push(messages[i]!);
      // If we just added a user message and there's an assistant reply next,
      // include it too even if it exceeds chunk size by 1
      if (
        messages[i]!.role === "user" &&
        i + 1 < messages.length &&
        messages[i + 1]!.role === "assistant"
      ) {
        i++;
        chunk.push(messages[i]!);
      }
      i++;
    }

    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

export const summarizeWorkflow = defineWorkflow<SummarizeState>({
  name: "summarize-conversation",
  description: "Summarize older conversation messages into a memory block",

  initialState: () => ({
    existingSummary: null,
    messagesToSummarize: [],
    chunks: [],
    chunkSummaries: [],
    finalSummary: "",
    prunedCount: 0,
  }),

  build: ({ node, parallel, chain }) => {
    const collect = node({
      name: "collect",
      prep: async (state) => {
        const messages = await state.ctx.messages.getMessagesForSummarization();
        const existing = state.ctx.memory.get("conversation_summary");
        return {
          messages,
          existingSummary: existing?.content ?? null,
        };
      },
      post: (state, prep) => {
        if (prep.messages.length === 0) return "skip";
        state.data.messagesToSummarize = prep.messages;
        state.data.existingSummary = prep.existingSummary;
        return undefined;
      },
    });

    const chunkNode = node({
      name: "chunk",
      prep: (state) => state.data.messagesToSummarize,
      exec: (messages) => chunkMessages(messages, CHUNK_SIZE),
      post: (state, _prep, chunks) => {
        state.data.chunks = chunks;
        return undefined;
      },
    });

    const summarize = parallel({
      name: "summarize-chunks",
      prep: (state) => state.data.chunks,
      exec: async (chunk) => summarizeChunk(chunk),
      post: (state, _prep, summaries) => {
        state.data.chunkSummaries = summaries;
        return undefined;
      },
    });

    const merge = node({
      name: "merge",
      prep: (state) => ({
        summaries: state.data.chunkSummaries,
        existingSummary: state.data.existingSummary,
      }),
      exec: async (input) =>
        mergeSummaries(input.summaries, input.existingSummary),
      post: (state, _prep, summary) => {
        state.data.finalSummary = summary;
        return undefined;
      },
    });

    const store = node({
      name: "store",
      prep: (state) => state.data.finalSummary,
      post: async (state, prep) => {
        await state.ctx.memory.setContent("conversation_summary", prep);
        const half = Math.floor(MAX_CONVERSATION_HISTORY / 2);
        state.data.prunedCount = state.ctx.messages.prune(half);
        return undefined;
      },
    });

    // Skip path: collect routes to "skip" when there's nothing to summarize.
    const skipNode = node({ name: "skip" });
    collect.when("skip", skipNode);

    return chain(collect, chunkNode, summarize, merge, store);
  },
});
