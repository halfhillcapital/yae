import { z } from "zod";
import { toolDefinition } from "@tanstack/ai";

// ============================================================================
// Tavily Web Search Tool
// ============================================================================

const tavilySearchQuerySchema = z.object({
  query: z.string().describe("The search query string."),
  depth: z
    .enum(["basic", "advanced"])
    .describe(
      "The depth of the search and generated answer. Use 'basic' for generic results, 'advanced' for more thorough search.",
    ),
  topic: z
    .enum(["general", "news", "finance"])
    .describe("The topic category for the search. If unsure, use 'general'."),
});

const tavilySearchResultSchema = z.object({
  answer: z
    .string()
    .describe("The generated answer based on the search results."),
  results: z
    .array(
      z.object({
        url: z.string().describe("The URL of the source."),
        title: z.string().describe("The title of the source page."),
        content: z.string().describe("A brief snippet from the source."),
        score: z.number().describe("Relevance score of the result."),
        published_date: z
          .string()
          .nullish()
          .describe("The published date of the source, if available."),
      }),
    )
    .describe("List of search results."),
});

export const toolSearchTavilyDef = toolDefinition({
  name: "search_tavily",
  description: `Search the web for current information on any topic. Use for news, facts, or data beyond your knowledge cutoff. 
    Returns a generated answer and a list of search results.`,
  inputSchema: tavilySearchQuerySchema,
  outputSchema: tavilySearchResultSchema,
});

type TavilySearchResult = z.infer<typeof tavilySearchResultSchema>;

export async function searchTavily(
  query: string,
  depth: "basic" | "advanced",
  topic: "general" | "news" | "finance",
): Promise<TavilySearchResult> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: query,
      include_answer: depth,
      topic: topic,
      search_depth: depth,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Tavily API error: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json() as TavilySearchResult;
}

// ============================================================================
// LinkUp Web Search and Fetch Tools
// ============================================================================

const linkupSearchQuerySchema = z.object({
  query: z.string().describe("The search query string."),
  depth: z
    .enum(["standard", "deep"])
    .describe(
      "The depth of the search. Use 'standard' for regular results, 'deep' for more comprehensive search.",
    ),
});

const linkupSearchResultSchema = z.object({
  answer: z
    .string()
    .describe("The generated answer based on the search results."),
  sources: z
    .array(
      z.object({
        url: z.string().describe("The URL of the source."),
        name: z.string().describe("The title of the source page."),
        snippet: z.string().describe("A brief snippet from the source."),
      }),
    )
    .describe("List of search results."),
});

const linkupFetchQuerySchema = z.object({
  url: z.string().describe("The URL of the webpage to fetch."),
  renderJs: z
    .boolean()
    .optional()
    .describe("Whether to render JavaScript on the page (default: false)."),
});

const linkupFetchResultSchema = z.object({
  markdown: z
    .string()
    .describe("The content of the fetched webpage in markdown format."),
});

type LinkupFetchResult = z.infer<typeof linkupFetchResultSchema>;
type LinkupSearchResult = z.infer<typeof linkupSearchResultSchema>;

export const toolSearchLinkupDef = toolDefinition({
  name: "search_linkup",
  description:
    "Search the web for current information on any topic. Use for news, facts, or data beyond your knowledge cutoff. Returns a generated answer and a list of search results.",
  inputSchema: linkupSearchQuerySchema,
  outputSchema: linkupSearchResultSchema,
});

export const toolFetchLinkupDef = toolDefinition({
  name: "fetch_linkup",
  description:
    "Fetch the content of a webpage. Optionally render JavaScript on the page. Returns the content in markdown format.",
  inputSchema: linkupFetchQuerySchema,
  outputSchema: linkupFetchResultSchema,
});

export async function searchLinkup(query: string, depth: "standard" | "deep"): Promise<LinkupSearchResult> {
  const response = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINKUP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      depth: depth,
      outputType: "sourcedAnswer",
      includeImages: false,
      includeInlineCitations: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `LinkUp API error: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json() as LinkupSearchResult;
}

export async function fetchLinkup(url: string, renderJs: boolean = false): Promise<LinkupFetchResult> {
  const response = await fetch("https://api.linkup.so/v1/fetch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINKUP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: url,
      includeRawHtml: false,
      renderJs: renderJs,
      extractImages: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `LinkUp API error: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json() as LinkupFetchResult;
}
