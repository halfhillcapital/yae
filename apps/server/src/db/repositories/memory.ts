import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { memoryTable } from "../schemas/agent-schema.ts";
import type { Memory } from "../types.ts";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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

  getCount(): number {
    return this.blocks.size;
  }

  async load() {
    const rows = await this.db.select().from(memoryTable);
    this.blocks.clear();
    for (const row of rows) {
      this.blocks.set(row.label, {
        label: row.label,
        description: row.description,
        content: row.content,
        protected: row.protected === 1,
        readonly: row.readonly === 1,
        limit: row.limit ?? undefined,
        updated_at: row.updated_at,
      });
    }
  }

  async set(
    label: string,
    description: string,
    content: string,
    opts?: { protected?: boolean; readonly?: boolean; limit?: number },
  ): Promise<void> {
    const existing = this.blocks.get(label);

    if (existing) {
      await this.db
        .update(memoryTable)
        .set({ description, content })
        .where(eq(memoryTable.label, label));
    } else {
      await this.db.insert(memoryTable).values({
        label,
        description,
        content,
        protected: opts?.protected ? 1 : 0,
        readonly: opts?.readonly ? 1 : 0,
        limit: opts?.limit ?? null,
      });
    }

    this.blocks.set(label, {
      label,
      description,
      content,
      protected: opts?.protected ?? existing?.protected,
      readonly: opts?.readonly ?? existing?.readonly,
      limit: opts?.limit ?? existing?.limit,
      updated_at: Date.now(),
    });
  }

  async setContent(label: string, content: string): Promise<void> {
    const block = this.blocks.get(label);
    if (!block)
      throw new Error(`Memory block with label "${label}" does not exist.`);

    await this.db
      .update(memoryTable)
      .set({ content })
      .where(eq(memoryTable.label, label));

    block.content = content;
    block.updated_at = Date.now();
    this.blocks.set(label, block);
  }

  async delete(label: string): Promise<boolean> {
    const block = this.blocks.get(label);
    if (!block) return false;

    await this.db.delete(memoryTable).where(eq(memoryTable.label, label));
    this.blocks.delete(label);
    return true;
  }

  async toolCreateMemory(
    label: string,
    description: string,
    content: string,
    limit?: number,
  ): Promise<string> {
    if (this.blocks.has(label))
      throw new Error(`Memory block with label "${label}" already exists.`);

    const blockCount = this.getCount();
    if (blockCount >= 20)
      throw new Error(
        `Memory block limit reached (${blockCount}/20). Delete an existing block before creating a new one.`,
      );

    await this.set(label, description, content, { limit });

    return `Memory block "${label}" created (${blockCount + 1}/20).`;
  }

  async toolDeleteMemory(label: string): Promise<string> {
    const block = this.blocks.get(label);
    if (block?.protected)
      throw new Error(
        `Memory block "${label}" is protected and cannot be deleted.`,
      );
    const deleted = await this.delete(label);
    if (!deleted) throw new Error(`Memory block "${label}" does not exist.`);
    return `Memory block "${label}" deleted.`;
  }

  async toolReplaceMemory(
    label: string,
    oldContent: string,
    newContent: string,
  ): Promise<string> {
    const block = this.blocks.get(label);
    if (!block)
      throw new Error(`Memory block with label "${label}" does not exist.`);
    if (block.readonly)
      throw new Error(`Memory block "${label}" is read-only.`);

    if (!block.content.includes(oldContent))
      throw new Error(`The provided old_content was not found in memory block with label "${label}".
      Please ensure that old_content matches exactly what is in the memory block before attempting to update it.`);

    const updatedContent = block.content.replace(oldContent, newContent);
    this.enforceLimit(block, updatedContent);

    await this.setContent(label, updatedContent);
    return `The memory block with label ${label} has been edited.
    Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc).
    Edit the memory block again if necessary.`;
  }

  async toolInsertMemory(
    label: string,
    content: string,
    position: "beginning" | "end",
  ): Promise<string> {
    const block = this.blocks.get(label);
    if (!block)
      throw new Error(`Memory block with label "${label}" does not exist.`);
    if (block.readonly)
      throw new Error(`Memory block "${label}" is read-only.`);

    const updatedContent =
      position === "beginning"
        ? content + "\n" + block.content
        : block.content + "\n" + content;
    this.enforceLimit(block, updatedContent);

    await this.setContent(label, updatedContent);
    return `Content inserted at the ${position} of memory block "${label}".`;
  }

  toXML(): string {
    if (this.blocks.size === 0) {
      return "";
    }

    let xml = "<memory>\n";
    for (const block of this.blocks.values()) {
      const attrs = [`label="${block.label}"`];
      if (block.protected) attrs.push(`protected="true"`);
      if (block.readonly) attrs.push(`readonly="true"`);
      if (block.limit) attrs.push(`limit="${block.content.length}/${block.limit}"`);
      if (block.updated_at) attrs.push(`updated="${timeAgo(block.updated_at)}"`);
      xml += `<block ${attrs.join(" ")}>\n`;
      xml += `<description>${block.description}</description>\n`;
      xml += `<content>${block.content}</content>\n`;
      xml += `</block>\n`;
    }
    xml += "</memory>";
    return xml;
  }

  private enforceLimit(block: Memory, content: string): void {
    if (block.limit && content.length > block.limit)
      throw new Error(
        `Content exceeds size limit for memory block "${block.label}" (${content.length}/${block.limit} chars).`,
      );
  }
}
