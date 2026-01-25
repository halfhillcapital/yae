import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { memoryTable } from "../schemas/agent-schema.ts";
import type { Memory } from "../types.ts";

export class MemoryRepository {
  private blocks: Map<string, Memory> = new Map();

  constructor(private readonly db: ReturnType<typeof drizzle>) {
    this.load();
  }

  has(label: string): boolean {
    return this.blocks.has(label);
  }

  get(label: string): Memory | undefined {
    return this.blocks.get(label);
  }

  getAll(): Memory[] {
    return Array.from(this.blocks.values());
  }

  async set(
    label: string,
    description: string,
    content: string,
  ): Promise<void> {
    if (this.blocks.has(label)) {
      // Update existing
      await this.db
        .update(memoryTable)
        .set({ description, content })
        .where(eq(memoryTable.label, label));
    } else {
      // Insert new
      await this.db.insert(memoryTable).values({ label, description, content });
    }

    this.blocks.set(label, {
      label,
      description,
      content,
      updated_at: Date.now(),
    });
  }

  async delete(label: string): Promise<boolean> {
    if (!this.blocks.has(label)) {
      return false;
    }

    await this.db.delete(memoryTable).where(eq(memoryTable.label, label));
    this.blocks.delete(label);
    return true;
  }

  //TODO: Refactor out to Tools directory
  // async toolUpdateMemory(
  //   label: string,
  //   oldContent: string,
  //   newContent: string,
  // ): Promise<ToolCallResult> {
  //   const block = this.blocks.get(label);
  //   const result: ToolCallResult = {
  //     name: "memory_update",
  //     status: "failure" as const,
  //     input: `label: ${label}, old_content: ${oldContent}, new_content: ${newContent}`,
  //     output: "",
  //   };

  //   if (!block) {
  //     result.output = `Memory block with label "${label}" does not exist.`;
  //     return result;
  //   }

  //   if (!block.content.includes(oldContent)) {
  //     result.output = `The provided old_content was not found in memory block with label "${label}".
  //       Please ensure that old_content matches exactly what is in the memory block before attempting to update it.`;
  //     return result;
  //   }

  //   const updatedContent = block.content.replace(oldContent, newContent);

  //   await this.db
  //     .update(memoryTable)
  //     .set({ content: updatedContent })
  //     .where(eq(memoryTable.label, label));

  //   block.content = updatedContent;
  //   this.blocks.set(label, block);

  //   result.status = "success";
  //   result.output = `The core memory block with label ${label} has been edited.
  //     Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc).
  //     Edit the memory block again if necessary.`;
  //   return result;
  // }

  //TODO: Refactor out to Tools directory
  // async toolInsertMemory(
  //   label: string,
  //   content: string,
  //   line: number,
  // ): Promise<ToolCallResult> {
  //   const block = this.blocks.get(label);
  //   const result: ToolCallResult = {
  //     name: "memory_insert",
  //     status: "failure" as const,
  //     input: `label: ${label}, content: ${content}, line: ${line}`,
  //     output: "",
  //   };

  //   if (!block) {
  //     result.output = `Memory block with label "${label}" does not exist.`;
  //     return result;
  //   }

  //   const lines = block.content.split("\n");
  //   if (line < 0 || line > lines.length) {
  //     result.output = `Invalid line number ${line} for memory block with label "${label}". Parameter line must be between 0 and ${lines.length}.`;
  //     return result;
  //   }

  //   lines.splice(line, 0, content);
  //   const newContent = lines.join("\n");

  //   await this.db
  //     .update(memoryTable)
  //     .set({ content: newContent })
  //     .where(eq(memoryTable.label, label));

  //   block.content = newContent;
  //   this.blocks.set(label, block);

  //   result.status = "success";
  //   result.output = `The core memory block with label ${label} has been edited.
  //   Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc).
  //   Edit the memory block again if necessary.`;
  //   return result;
  // }

  private async load() {
    const rows = await this.db.select().from(memoryTable);
    this.blocks.clear();
    for (const row of rows) {
      this.blocks.set(row.label, {
        label: row.label,
        description: row.description,
        content: row.content,
        updated_at: row.updated_at,
      });
    }
  }
}
