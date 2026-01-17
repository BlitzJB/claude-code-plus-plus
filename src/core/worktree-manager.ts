import { simpleGit, SimpleGit } from 'simple-git';
import { homedir } from 'os';
import { join, basename } from 'path';
import { mkdir, rm, access } from 'fs/promises';
import type { Worktree } from '../types.js';

export class WorktreeManager {
  private basePath: string;
  private repoPath: string;
  private git: SimpleGit;

  constructor(repoPath: string, basePath: string = '~/.claude-worktrees') {
    this.repoPath = repoPath;
    this.basePath = basePath.replace('~', homedir());
    this.git = simpleGit(repoPath);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private async ensureBaseDir(): Promise<void> {
    try {
      await access(this.basePath);
    } catch {
      await mkdir(this.basePath, { recursive: true });
    }
  }

  async list(): Promise<Worktree[]> {
    try {
      const result = await this.git.raw(['worktree', 'list', '--porcelain']);
      const worktrees: Worktree[] = [];

      const blocks = result.trim().split('\n\n');

      for (const block of blocks) {
        if (!block.trim()) continue;

        const lines = block.split('\n');
        let path = '';
        let branch = '';

        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            path = line.substring(9);
          } else if (line.startsWith('branch ')) {
            branch = line.substring(7).replace('refs/heads/', '');
          } else if (line === 'detached') {
            branch = '(detached)';
          }
        }

        if (path) {
          const isMain = path === this.repoPath;
          worktrees.push({
            id: isMain ? 'main' : this.generateId(),
            path,
            branch: branch || basename(path),
            isMain,
            sessions: [],
          });
        }
      }

      return worktrees;
    } catch (error) {
      // If not a git repo or worktree command fails, return empty
      console.error('Failed to list worktrees:', error);
      return [];
    }
  }

  async create(branch: string, newBranch: boolean = false): Promise<Worktree> {
    await this.ensureBaseDir();

    const sanitizedBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '-');
    const worktreePath = join(this.basePath, `${basename(this.repoPath)}-${sanitizedBranch}`);

    try {
      if (newBranch) {
        await this.git.raw(['worktree', 'add', '-b', branch, worktreePath]);
      } else {
        await this.git.raw(['worktree', 'add', worktreePath, branch]);
      }

      return {
        id: this.generateId(),
        path: worktreePath,
        branch,
        isMain: false,
        sessions: [],
      };
    } catch (error) {
      throw new Error(`Failed to create worktree for branch '${branch}': ${error}`);
    }
  }

  async remove(path: string, force: boolean = false): Promise<void> {
    try {
      const args = ['worktree', 'remove'];
      if (force) args.push('--force');
      args.push(path);

      await this.git.raw(args);
    } catch (error) {
      // Try to clean up manually if git worktree remove fails
      if (force) {
        await rm(path, { recursive: true, force: true });
        await this.git.raw(['worktree', 'prune']);
      } else {
        throw new Error(`Failed to remove worktree at '${path}': ${error}`);
      }
    }
  }

  async prune(): Promise<void> {
    await this.git.raw(['worktree', 'prune']);
  }

  async getBranches(): Promise<string[]> {
    try {
      const result = await this.git.branch(['-a']);
      return result.all;
    } catch {
      return [];
    }
  }

  getRepoPath(): string {
    return this.repoPath;
  }

  getBasePath(): string {
    return this.basePath;
  }
}
