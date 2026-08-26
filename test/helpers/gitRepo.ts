import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface RepositorySnapshot {
  readonly head: string;
  readonly tree: string;
  readonly status: string;
}

export class GitRepo {
  private constructor(public readonly root: string) {}

  public static async create(): Promise<GitRepo> {
    const root = await mkdtemp(path.join(tmpdir(), 'branch-compare-'));
    const repo = new GitRepo(root);
    await repo.git(['init', '--initial-branch=main']);
    await repo.git(['config', 'user.name', 'Branch Compare Tests']);
    await repo.git(['config', 'user.email', 'branch-compare@example.test']);
    return repo;
  }

  public async git(args: readonly string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile('git', [...args], { cwd: this.root, encoding: 'buffer' }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}\n${stderr.toString('utf8')}`));
          return;
        }
        resolve(stdout);
      });
    });
  }

  public async write(relativePath: string, contents: string | Buffer): Promise<void> {
    const absolutePath = path.join(this.root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }

  public async commit(message: string): Promise<string> {
    await this.git(['add', '--all']);
    await this.git(['commit', '-m', message]);
    return this.revParse('HEAD');
  }

  public async revParse(ref: string): Promise<string> {
    return (await this.git(['rev-parse', ref])).toString('utf8').trim();
  }

  public async snapshot(): Promise<RepositorySnapshot> {
    const head = await this.git(['rev-parse', 'HEAD']);
    const tree = await this.git(['write-tree']);
    const status = await this.git(['status', '--porcelain=v2']);
    return {
      head: head.toString('utf8'),
      tree: tree.toString('utf8'),
      status: status.toString('utf8'),
    };
  }

  public async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
