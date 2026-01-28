import { z } from "zod";
import { toolDefinition } from "@tanstack/ai";

export const toolUpdateMemory = toolDefinition({
  name: "memory_update",
  description:
    "Use this tool to replace a specific string in a memory block with a new string.",
  inputSchema: z.object({
    label: z
      .string()
      .describe("Section of the memory to be edited, identified by its label."),
    oldContent: z
      .string()
      .describe(
        "The exact string in the memory block that needs to be replaced.",
      ),
    newContent: z
      .string()
      .describe(
        "The new string that will replace the old content in the memory block.",
      ),
  }),
  outputSchema: z.object({
    status: z
      .enum(["success", "failure"])
      .describe("The status of the memory update operation."),
    output: z
      .string()
      .describe("A message describing the result of the operation."),
  }),
});

export const toolInsertMemory = toolDefinition({
  name: "memory_insert",
  description:
    "Use this tool to insert text at a specific location in a memory block.",
  inputSchema: z.object({
    label: z
      .string()
      .describe("Section of the memory to be edited, identified by its label."),
    content: z
      .string()
      .describe("The text content to insert into the memory block."),
    line: z
      .number()
      .describe(
        "The line number at which to insert the content (0-based). Use 0 to insert at the beginning and -1 to insert at the end.",
      ),
  }),
  outputSchema: z.object({
    status: z
      .enum(["success", "failure"])
      .describe("The status of the memory insert operation."),
    output: z
      .string()
      .describe("A message describing the result of the operation."),
  }),
});
