/**
 * Application Paths
 *
 * Computes and manages application paths.
 */

import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import {
  getTempDir,
  getAppDataDir,
  getWorktreesDir,
} from '../platform';
import { createProjectId } from '../utils';

export interface AppPaths {
  data: string;
  project: string;
  state: string;
  worktrees: string;
  temp: string;
}

/**
 * Create application paths for a specific project
 */
export function createAppPaths(projectPath: string, worktreesDir?: string | null): AppPaths {
  const projectId = createProjectId(projectPath);
  const dataDir = getAppDataDir();
  const projectDir = join(dataDir, projectId);

  return {
    data: dataDir,
    project: projectDir,
    state: join(projectDir, 'state.json'),
    worktrees: worktreesDir || getWorktreesDir(),
    temp: getTempDir(),
  };
}

/**
 * Ensure all required directories exist
 */
export function ensureDirectories(paths: AppPaths): void {
  const dirsToCreate = [paths.data, paths.project, paths.worktrees];

  for (const dir of dirsToCreate) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Get the terminal state file path for a session
 */
export function getTerminalStatePath(sessionId: string): string {
  return join(getTempDir(), `claude-pp-term-${sessionId}.json`);
}

/**
 * Get the welcome script path for a session
 */
export function getWelcomeScriptPath(sessionName: string): string {
  return join(getTempDir(), `claude-pp-welcome-${sessionName}.sh`);
}

/**
 * Get the worktree path for a new worktree
 */
export function getNewWorktreePath(
  basePath: string,
  repoName: string,
  branchName: string
): string {
  const safeBranch = branchName.replace(/[^a-zA-Z0-9-_]/g, '-');
  return join(basePath, `${repoName}-${safeBranch}`);
}

/**
 * Application paths manager
 */
export class PathsManager {
  private paths: AppPaths;
  private initialized = false;

  constructor(projectPath: string, worktreesDir?: string | null) {
    this.paths = createAppPaths(projectPath, worktreesDir);
  }

  get(): AppPaths {
    return this.paths;
  }

  getPath<K extends keyof AppPaths>(key: K): AppPaths[K] {
    return this.paths[key];
  }

  ensureDirectories(): void {
    if (!this.initialized) {
      ensureDirectories(this.paths);
      this.initialized = true;
    }
  }

  getTerminalStatePath(sessionId: string): string {
    return getTerminalStatePath(sessionId);
  }

  getWelcomeScriptPath(sessionName: string): string {
    return getWelcomeScriptPath(sessionName);
  }

  getNewWorktreePath(repoName: string, branchName: string): string {
    return getNewWorktreePath(this.paths.worktrees, repoName, branchName);
  }
}
