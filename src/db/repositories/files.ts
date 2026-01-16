import type { AgentFS } from "agentfs-sdk";

type Stats = Awaited<ReturnType<AgentFS["fs"]["stat"]>>;
type DirEntry = Awaited<ReturnType<AgentFS["fs"]["readdirPlus"]>>[number];

export class FileRepository {
  constructor(private readonly agentFs: AgentFS) {}

  async readFile(path: string): Promise<Buffer>;
  async readFile(path: string, encoding: BufferEncoding): Promise<string>;
  async readFile(
    path: string,
    encoding?: BufferEncoding,
  ): Promise<string | Buffer> {
    if (encoding) {
      return this.agentFs.fs.readFile(path, encoding);
    }
    return this.agentFs.fs.readFile(path);
  }

  async writeFile(
    path: string,
    data: string | Buffer,
    encoding?: BufferEncoding,
  ): Promise<void> {
    return this.agentFs.fs.writeFile(path, data, encoding);
  }

  async readdir(path: string): Promise<string[]> {
    return this.agentFs.fs.readdir(path);
  }

  async readdirPlus(path: string): Promise<DirEntry[]> {
    return this.agentFs.fs.readdirPlus(path);
  }

  async mkdir(path: string): Promise<void> {
    return this.agentFs.fs.mkdir(path);
  }

  async rmdir(path: string): Promise<void> {
    return this.agentFs.fs.rmdir(path);
  }

  async unlink(path: string): Promise<void> {
    return this.agentFs.fs.unlink(path);
  }

  async rm(
    path: string,
    options?: { force?: boolean; recursive?: boolean },
  ): Promise<void> {
    return this.agentFs.fs.rm(path, options);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return this.agentFs.fs.rename(oldPath, newPath);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    return this.agentFs.fs.copyFile(src, dest);
  }

  async stat(path: string): Promise<Stats> {
    return this.agentFs.fs.stat(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.agentFs.fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
