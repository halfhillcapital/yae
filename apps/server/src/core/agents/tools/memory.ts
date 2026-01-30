import { z } from "zod";
import { toolDefinition } from "@tanstack/ai";

export const toolReplaceMemoryDef = toolDefinition({
  name: "memory_replace",
  description: `Use this tool to replace a specific string in a memory block with a new string. This is used for making precise edits.
    Do NOT attempt to replace long strings, e.g. do not attempt to replace the entire contents of a memory block with a new string.`,
  inputSchema: z.object({
    label: z
      .string()
      .describe("Section of the memory to be edited, identified by its label."),
    oldContent: z
      .string()
      .describe(
        "The string to replace (must match exactly, including whitespace and indentation).",
      ),
    newContent: z
      .string()
      .describe(
        "The new string that will replace the old content in the memory block.",
      ),
  }),
  outputSchema: z
    .string()
    .describe("A message describing the result of the operation."),
});

export const toolInsertMemoryDef = toolDefinition({
  name: "memory_insert",
  description:
    "Use this tool to insert content at a specific location in a memory block.",
  inputSchema: z.object({
    label: z
      .string()
      .describe("Section of the memory to be edited, identified by its label."),
    content: z
      .string()
      .describe("The content to insert into the memory block."),
    line: z
      .number()
      .describe(
        "The line number at which to insert the content (0-based). Use 0 to insert at the beginning and -1 to insert at the end.",
      ),
  }),
  outputSchema: z
    .string()
    .describe("A message describing the result of the operation."),
});
