import type { AgentFS } from "agentfs-sdk";

type Stats = Awaited<ReturnType<AgentFS["fs"]["stat"]>>;
type DirEntry = Awaited<ReturnType<AgentFS["fs"]["readdirPlus"]>>[number];

export class FileRepository {
  constructor(private readonly client: AgentFS) {}

  async readFile(path: string): Promise<Buffer>;
  async readFile(path: string, encoding: BufferEncoding): Promise<string>;
  async readFile(
    path: string,
    encoding?: BufferEncoding,
  ): Promise<string | Buffer> {
    if (encoding) {
      return this.client.fs.readFile(path, encoding);
    }
    return this.client.fs.readFile(path);
  }

  async writeFile(
    path: string,
    data: string | Buffer,
    encoding?: BufferEncoding,
  ): Promise<void> {
    return this.client.fs.writeFile(path, data, encoding);
  }

  async readdir(path: string): Promise<string[]> {
    return this.client.fs.readdir(path);
  }

  async readdirPlus(path: string): Promise<DirEntry[]> {
    return this.client.fs.readdirPlus(path);
  }

  async mkdir(path: string): Promise<void> {
    return this.client.fs.mkdir(path);
  }

  async rmdir(path: string): Promise<void> {
    return this.client.fs.rmdir(path);
  }

  async unlink(path: string): Promise<void> {
    return this.client.fs.unlink(path);
  }

  async rm(
    path: string,
    options?: { force?: boolean; recursive?: boolean },
  ): Promise<void> {
    return this.client.fs.rm(path, options);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return this.client.fs.rename(oldPath, newPath);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    return this.client.fs.copyFile(src, dest);
  }

  async stat(path: string): Promise<Stats> {
    return this.client.fs.stat(path);
  }

  async toolPending(name: string, parameters?: unknown): Promise<number> {
    return this.client.tools.start(name, parameters);
  }

  async toolSuccess(id: number, result?: unknown): Promise<void> {
    return this.client.tools.success(id, result);
  }

  async toolFailure(id: number, error: string): Promise<void> {
    return this.client.tools.error(id, error);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async getFileTree(path: string, indent = "", isRoot = true): Promise<string> {
    let tree = "";
    const entries = await this.client.fs.readdirPlus(path);

    if (entries.length === 0 && isRoot) {
      return "(No files stored yet)";
    }

    entries.sort((a, b) => {
      if (a.stats.isDirectory() && !b.stats.isDirectory()) return -1;
      if (!a.stats.isDirectory() && b.stats.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const entryPath =
        path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
      if (entry.stats.isDirectory()) {
        tree += `${indent}├── ${entry.name}/\n`;
        tree += await this.getFileTree(entryPath, `${indent}│   `, false);
      } else {
        tree += `${indent}└── ${entry.name} (${entry.stats.size}b)\n`;
      }
    }

    return tree;
  }

  async getFlatFileList(
    path: string,
    parent = "",
    isRoot = true,
  ): Promise<string> {
    let fileList: string[] = [];
    const entries = await this.client.fs.readdirPlus(path);

    if (entries.length === 0 && isRoot) {
      return "(No files stored yet)";
    }

    entries.sort((a, b) => {
      if (a.stats.isDirectory() && !b.stats.isDirectory()) return -1;
      if (!a.stats.isDirectory() && b.stats.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const entryPath = parent ? `${parent}/${entry.name}` : entry.name;
      if (entry.stats.isDirectory()) {
        const subDirFiles = await this.getFlatFileList(
          path === "/" ? `/${entry.name}` : `${path}/${entry.name}`,
          entryPath,
          false,
        );
        fileList = fileList.concat(subDirFiles);
      } else {
        fileList.push(entryPath);
      }
    }

    return fileList.join("\n");
  }
}
