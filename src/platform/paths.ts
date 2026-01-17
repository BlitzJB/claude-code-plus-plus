/**
 * Platform-Specific Paths
 *
 * Computes paths for application data, config, and temp files.
 */

import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { detectPlatform, type Platform } from './detector';

/**
 * Get the user's home directory
 */
export function getHomeDir(): string {
  return homedir();
}

/**
 * Get the system temp directory
 */
export function getTempDir(): string {
  return tmpdir();
}

/**
 * Get the application data directory based on platform conventions
 */
export function getAppDataDir(appName: string = 'claude-plus-plus'): string {
  const os = detectPlatform();
  const home = homedir();

  switch (os) {
    case 'darwin':
      // macOS: ~/.claude-plus-plus (simple) or ~/Library/Application Support/
      return join(home, `.${appName}`);

    case 'linux':
      // Linux: Follow XDG Base Directory spec if set
      const xdgData = process.env.XDG_DATA_HOME;
      if (xdgData) {
        return join(xdgData, appName);
      }
      return join(home, `.${appName}`);

    case 'win32':
      // Windows: Use APPDATA
      const appData = process.env.APPDATA;
      if (appData) {
        return join(appData, appName);
      }
      return join(home, `.${appName}`);

    default:
      return join(home, `.${appName}`);
  }
}

/**
 * Get the application config directory based on platform conventions
 */
export function getConfigDir(appName: string = 'claude-plus-plus'): string {
  const os = detectPlatform();
  const home = homedir();

  switch (os) {
    case 'darwin':
      return join(home, `.${appName}`);

    case 'linux':
      const xdgConfig = process.env.XDG_CONFIG_HOME;
      if (xdgConfig) {
        return join(xdgConfig, appName);
      }
      return join(home, `.${appName}`);

    case 'win32':
      const appData = process.env.APPDATA;
      if (appData) {
        return join(appData, appName);
      }
      return join(home, `.${appName}`);

    default:
      return join(home, `.${appName}`);
  }
}

/**
 * Get the application cache directory
 */
export function getCacheDir(appName: string = 'claude-plus-plus'): string {
  const os = detectPlatform();
  const home = homedir();

  switch (os) {
    case 'darwin':
      return join(home, 'Library', 'Caches', appName);

    case 'linux':
      const xdgCache = process.env.XDG_CACHE_HOME;
      if (xdgCache) {
        return join(xdgCache, appName);
      }
      return join(home, '.cache', appName);

    case 'win32':
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        return join(localAppData, appName, 'cache');
      }
      return join(home, `.${appName}`, 'cache');

    default:
      return join(home, `.${appName}`, 'cache');
  }
}

/**
 * Get the default worktrees base directory
 */
export function getWorktreesDir(): string {
  return join(homedir(), '.claude-worktrees');
}

/**
 * Get a temp file path with a unique name
 */
export function getTempFilePath(prefix: string, extension: string = ''): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `${prefix}-${timestamp}-${random}${extension}`;
  return join(tmpdir(), filename);
}

/**
 * Get the debug log file path
 */
export function getDebugLogPath(): string {
  return join(tmpdir(), 'claude-pp-debug.log');
}

/**
 * Path configuration for a specific project
 */
export interface ProjectPaths {
  /** Root project directory */
  root: string;
  /** Project data directory (for state, etc.) */
  data: string;
  /** State file path */
  state: string;
  /** Terminal state file path pattern */
  terminalState: (sessionId: string) => string;
}

/**
 * Get paths for a specific project
 */
export function getProjectPaths(
  projectPath: string,
  projectId: string
): ProjectPaths {
  const appData = getAppDataDir();
  const projectData = join(appData, projectId);

  return {
    root: projectPath,
    data: projectData,
    state: join(projectData, 'state.json'),
    terminalState: (sessionId: string) =>
      join(tmpdir(), `claude-pp-term-${sessionId}.json`),
  };
}

/**
 * Resolve a path that may contain ~ for home directory
 */
export function resolvePath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Get the appropriate null device for the platform
 */
export function getNullDevice(): string {
  const os = detectPlatform();
  return os === 'win32' ? 'NUL' : '/dev/null';
}
