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

export type MemoryBlockDef = {
  label: string;
  description: string;
  content: string;
};

/**
 * Parses YAML-style frontmatter from a raw markdown string.
 * Expects `---` delimiters around key: value pairs at the top of the file.
 *
 * @example
 * parseFrontmatter("---\nlabel: foo\ndescription: bar\n---\nContent here")
 * // → { label: "foo", description: "bar", content: "Content here" }
 */
export function parseFrontmatter(raw: string): MemoryBlockDef {
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
  };
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
