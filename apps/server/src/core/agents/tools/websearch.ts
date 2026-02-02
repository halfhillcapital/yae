import { z } from "zod";

// ============================================================================
// Tavily Web Search Tool
// ============================================================================

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

  const data = await response.json();
  const result = tavilySearchResultSchema.parse(data);

  return result;
}

// ============================================================================
// LinkUp Web Search and Fetch Tools
// ============================================================================

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

const linkupFetchResultSchema = z.object({
  markdown: z
    .string()
    .describe("The content of the fetched webpage in markdown format."),
});

type LinkupFetchResult = z.infer<typeof linkupFetchResultSchema>;
type LinkupSearchResult = z.infer<typeof linkupSearchResultSchema>;

export async function searchLinkup(
  query: string,
  depth: "standard" | "deep",
): Promise<LinkupSearchResult> {
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

  const data = await response.json();
  const result = linkupSearchResultSchema.parse(data);

  return result;
}

export async function fetchLinkup(
  url: string,
  renderJs: boolean = false,
): Promise<LinkupFetchResult> {
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

  const data = await response.json();
  const result = linkupFetchResultSchema.parse(data);

  return result;
}
