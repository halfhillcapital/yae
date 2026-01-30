import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { memoryTable } from "../schemas/agent-schema.ts";
import type { Memory } from "../types.ts";

export class MemoryRepository {
  private blocks: Map<string, Memory> = new Map();

  constructor(private readonly db: ReturnType<typeof drizzle>) {}

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

  async replaceMemory(
    label: string,
    oldContent: string,
    newContent: string,
  ): Promise<string> {
    const block = this.blocks.get(label);
    if (!block)
      throw new Error(`Memory block with label "${label}" does not exist.`);

    if (!block.content.includes(oldContent))
      throw new Error(`The provided oldContent was not found in memory block with label "${label}".
      Please ensure that oldContent matches exactly what is in the memory block before attempting to update it.`);

    const updatedContent = block.content.replace(oldContent, newContent);

    await this.db
      .update(memoryTable)
      .set({ content: updatedContent })
      .where(eq(memoryTable.label, label));

    block.content = updatedContent;
    block.updated_at = Date.now();
    this.blocks.set(label, block);
    return `The memory block with label ${label} has been edited.
    Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc).
    Edit the memory block again if necessary.`;
  }

  async insertMemory(
    label: string,
    content: string,
    line: number,
  ): Promise<string> {
    const block = this.blocks.get(label);
    if (!block)
      throw new Error(`Memory block with label "${label}" does not exist.`);

    const lines = block.content.split("\n");
    if (line !== -1 && (line < 0 || line > lines.length))
      throw new Error(
        `Invalid line number ${line} for memory block with label "${label}". It should be 0-${lines.length} or -1 for end.`,
      );

    if (line === -1) {
      lines.push(content);
    } else {
      lines.splice(line, 0, content);
    }
    const updatedContent = lines.join("\n");

    await this.db
      .update(memoryTable)
      .set({ content: updatedContent })
      .where(eq(memoryTable.label, label));

    block.content = updatedContent;
    block.updated_at = Date.now();
    this.blocks.set(label, block);
    return `The memory block with label ${label} has been updated with new content at line ${line}.
    Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc).
    Edit the memory block again if necessary.`;
  }

  toXML(): string {
    if (this.blocks.size === 0) {
      return "";
    }

    let xml = "<Memory>\n";
    for (const block of this.blocks.values()) {
      xml += `  <Block label="${block.label}">\n`;
      xml += `    <Description>${block.description}</Description>\n`;
      xml += `    <Content>${block.content}</Content>\n`;
      xml += `  </Block>\n`;
    }
    xml += "</Memory>";
    return xml;
  }

  async load() {
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
