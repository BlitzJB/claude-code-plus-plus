/**
 * Git Worktree Operations
 */

import { simpleGit, SimpleGit } from 'simple-git';
import { homedir } from 'os';
import { join, basename } from 'path';
import { mkdir, rm, access } from 'fs/promises';
import type { Worktree } from '../types';

// ============================================================================
// Worktree Manager
// ============================================================================

export class WorktreeManager {
  private repoPath: string;
  private basePath: string;
  private git: SimpleGit;

  constructor(repoPath: string, basePath?: string) {
    this.repoPath = repoPath;
    this.basePath = basePath || join(homedir(), '.claude-worktrees');
    this.git = simpleGit(repoPath);
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * Ensure base directory exists
   */
  private async ensureBaseDir(): Promise<void> {
    try {
      await access(this.basePath);
    } catch {
      await mkdir(this.basePath, { recursive: true });
    }
  }

  /**
   * List all worktrees
   */
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
          });
        }
      }

      return worktrees;
    } catch {
      // Not a git repo or worktree command fails
      return [];
    }
  }

  /**
   * Create a new worktree
   */
  async create(branch: string, newBranch: boolean = false): Promise<Worktree> {
    await this.ensureBaseDir();

    const sanitizedBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '-');
    const worktreePath = join(this.basePath, `${basename(this.repoPath)}-${sanitizedBranch}`);

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
    };
  }

  /**
   * Remove a worktree
   */
  async remove(path: string, force: boolean = false): Promise<void> {
    try {
      const args = ['worktree', 'remove'];
      if (force) args.push('--force');
      args.push(path);
      await this.git.raw(args);
    } catch {
      if (force) {
        // Manual cleanup
        await rm(path, { recursive: true, force: true });
        await this.git.raw(['worktree', 'prune']);
      } else {
        throw new Error(`Failed to remove worktree at '${path}'`);
      }
    }
  }

  /**
   * Prune stale worktree references
   */
  async prune(): Promise<void> {
    await this.git.raw(['worktree', 'prune']);
  }

  /**
   * Get list of branches
   */
  async listBranches(): Promise<string[]> {
    try {
      const result = await this.git.branch(['-a']);
      return result.all;
    } catch {
      return [];
    }
  }

  /**
   * Check if repo is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorktreeManager(repoPath: string, basePath?: string): WorktreeManager {
  return new WorktreeManager(repoPath, basePath);
}
