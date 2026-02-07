import type { Memory } from "@yae/db";

/**
 * Tagged template literal that strips common leading indentation from
 * multi-line strings. Removes the first and last lines if they are empty
 * (as they typically are with indented template literals).
 *
 * Use for structured text where line breaks should be preserved.
 *
 * @example
 * const text = dedent`
 *   Hello,
 *   World!
 * `;
 * // → "Hello,\nWorld!"
 */
export function dedent(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  const result = strings.reduce(
    (acc, str, i) => acc + str + (values[i] ?? ""),
    "",
  );
  const lines = result.split("\n");
  if (lines[0]?.trim() === "") lines.shift();
  if (lines.at(-1)?.trim() === "") lines.pop();
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length),
  );
  return lines.map((l) => l.slice(indent)).join("\n");
}

/**
 * Tagged template literal that strips leading indentation (like {@link dedent})
 * and then collapses all line breaks into spaces, producing a single flowing
 * paragraph.
 *
 * Use for long-form sentences that span multiple source lines but should
 * render as one continuous block of text.
 *
 * @example
 * const text = prose`
 *   This is a long sentence that
 *   spans multiple lines in source.
 * `;
 * // → "This is a long sentence that spans multiple lines in source."
 */
export function prose(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return dedent(strings, ...values).replace(/\n/g, " ");
}

/**
 * Parses YAML-style frontmatter from a raw markdown string.
 * Expects `---` delimiters around key: value pairs at the top of the file.
 *
 * Supported frontmatter keys:
 * - `label` — unique identifier
 * - `description` — behavioural description
 * - `protected` — `true` prevents deletion
 * - `readonly` — `true` prevents edits
 * - `limit` — max character count for content
 *
 * @example
 * parseFrontmatter("---\nlabel: foo\nprotected: true\nlimit: 500\n---\nContent")
 */
export function parseFrontmatter(raw: string): Memory {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("Invalid frontmatter format");
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) meta[m[1]!] = m[2]!;
  }
  return {
    label: meta.label ?? "",
    description: meta.description ?? "",
    content: match[2]!.trim(),
    protected: meta.protected === "true",
    readonly: meta.readonly === "true",
    limit: meta.limit ? parseInt(meta.limit, 10) : undefined,
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function mapSettled<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]!) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export function isPublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const h = parsed.hostname;
    if (
      h === "localhost" ||
      h === "[::1]" ||
      h.startsWith("127.") ||
      h.startsWith("10.") ||
      h.startsWith("192.168.") ||
      h.startsWith("0.") ||
      h === "169.254.169.254"
    ) {
      return false;
    }
    if (h.startsWith("172.")) {
      const octet = parseInt(h.split(".")[1] ?? "", 10);
      if (octet >= 16 && octet <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function truncateResult(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "\n[truncated]";
}

export function getCurrentDatetime(date: Date = new Date()): string {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayOfWeek = dayNames[date.getDay()];
  const day = date.getDate();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${dayOfWeek} ${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
}
