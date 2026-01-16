import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/libsql";
import { memoryTable } from "../schema.ts";

export type MemoryBlock = {
  label: string;
  description: string;
  content: string;
  updatedAt: number;
};

export class MemoryRepository {
  private blocks: Map<string, MemoryBlock> = new Map();

  constructor(private readonly db: ReturnType<typeof drizzle>) {
    this.load();
  }

  has(label: string): boolean {
    return this.blocks.has(label);
  }

  get(label: string): MemoryBlock | undefined {
    return this.blocks.get(label);
  }

  getAll(): MemoryBlock[] {
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
      await this.db
        .insert(memoryTable)
        .values({ label, description, content });
    }

    this.blocks.set(label, {
      label,
      description,
      content,
      updatedAt: Date.now(),
    });
  }

  async delete(label: string): Promise<boolean> {
    if (!this.blocks.has(label)) {
      return false;
    }

    await this.db
      .delete(memoryTable)
      .where(eq(memoryTable.label, label));
    this.blocks.delete(label);
    return true;
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

  private async load() {
    const rows = await this.db.select().from(memoryTable);
    this.blocks.clear();
    for (const row of rows) {
      this.blocks.set(row.label, {
        label: row.label,
        description: row.description,
        content: row.content,
        updatedAt: row.updatedAt,
      });
    }
  }
}
