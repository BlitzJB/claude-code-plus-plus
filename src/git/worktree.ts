/**
 * Git Worktree Operations
 */

import { simpleGit, SimpleGit } from 'simple-git';
import { homedir } from 'os';
import { join, basename, relative } from 'path';
import { mkdir, rm, access, readdir, stat } from 'fs/promises';
import type { Worktree } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface WorktreeCreateResult {
  worktree: Worktree;
  warnings: string[];  // e.g., "Failed to setup nested repo: packages/foo"
}

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
   * Find nested git repositories (not submodules, just directories with .git)
   * Returns relative paths from repoPath
   */
  private async findNestedGitRepos(dir: string, basePath: string = dir): Promise<string[]> {
    const nestedRepos: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const fullPath = join(dir, entry.name);
        const relativePath = relative(basePath, fullPath);

        // Skip the main .git directory and node_modules
        if (entry.name === '.git' || entry.name === 'node_modules') continue;

        // Check if this directory is a git repo (has .git inside)
        const gitPath = join(fullPath, '.git');
        try {
          const gitStat = await stat(gitPath);
          if (gitStat.isDirectory() || gitStat.isFile()) {
            // Found a nested git repo - don't recurse into it
            nestedRepos.push(relativePath);
            continue;
          }
        } catch {
          // No .git here, continue searching
        }

        // Recurse into subdirectory
        const nested = await this.findNestedGitRepos(fullPath, basePath);
        nestedRepos.push(...nested);
      }
    } catch {
      // Permission denied or other error, skip
    }

    return nestedRepos;
  }

  /**
   * Create worktrees for nested git repos (recursively)
   *
   * Uses native git worktree for each nested repo:
   * - Shares git objects (no duplication)
   * - Fast creation
   * - Full isolation between worktrees
   * - Recursively handles nested repos within nested repos
   *
   * @returns Array of failed nested repo paths (for warning purposes)
   */
  private async setupNestedGitRepos(sourcePath: string, destPath: string): Promise<string[]> {
    const nestedRepos = await this.findNestedGitRepos(sourcePath);
    const failures: string[] = [];

    for (const repoRelPath of nestedRepos) {
      const srcRepo = join(sourcePath, repoRelPath);
      const destRepo = join(destPath, repoRelPath);
      const destGit = join(destRepo, '.git');

      try {
        // Skip if destination already has .git (e.g., submodule was already initialized)
        try {
          await access(destGit);
          continue;
        } catch {
          // .git doesn't exist, proceed
        }

        // Create worktree for the nested repo
        // Use detached HEAD to avoid "branch already checked out" error
        const nestedGit = simpleGit(srcRepo);
        const head = await nestedGit.revparse(['HEAD']);
        await nestedGit.raw(['worktree', 'add', '--detach', destRepo, head.trim()]);

        // Initialize submodules in the nested worktree
        try {
          const nestedWorktreeGit = simpleGit(destRepo);
          await nestedWorktreeGit.submoduleUpdate(['--init', '--recursive']);
        } catch {
          // Submodule update may fail if no submodules exist
        }

        // Recursively setup any nested repos within this nested repo
        const nestedFailures = await this.setupNestedGitRepos(srcRepo, destRepo);
        failures.push(...nestedFailures);
      } catch (err) {
        // Record failure and continue with other nested repos
        failures.push(repoRelPath);
        console.error(`Failed to create worktree for nested repo ${repoRelPath}:`, err);
      }
    }

    return failures;
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
   * Returns the worktree and any warnings about failed nested repo setups
   */
  async create(branch: string, newBranch: boolean = false): Promise<WorktreeCreateResult> {
    await this.ensureBaseDir();

    const sanitizedBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '-');
    const worktreePath = join(this.basePath, `${basename(this.repoPath)}-${sanitizedBranch}`);

    if (newBranch) {
      await this.git.raw(['worktree', 'add', '-b', branch, worktreePath]);
    } else {
      await this.git.raw(['worktree', 'add', worktreePath, branch]);
    }

    // Initialize and update submodules in the new worktree
    // Git worktrees don't automatically copy submodule contents
    try {
      const worktreeGit = simpleGit(worktreePath);
      await worktreeGit.submoduleUpdate(['--init', '--recursive']);
    } catch {
      // Submodule update may fail if no submodules exist, that's OK
    }

    // Setup nested git repos using native worktrees (efficient, shares objects)
    const nestedFailures = await this.setupNestedGitRepos(this.repoPath, worktreePath);

    // Build warnings for any nested repo failures
    const warnings = nestedFailures.map(path => `Failed to setup nested repo: ${path}`);

    return {
      worktree: {
        id: this.generateId(),
        path: worktreePath,
        branch,
        isMain: false,
      },
      warnings,
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
