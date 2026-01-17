/**
 * Platform Detection
 *
 * Detects the current operating system and environment.
 */

import { platform, arch, release, homedir, tmpdir } from 'os';
import { execSync } from 'child_process';

export type Platform = 'darwin' | 'linux' | 'win32' | 'unknown';
export type Architecture = 'x64' | 'arm64' | 'arm' | 'unknown';

export interface PlatformInfo {
  /** Operating system */
  os: Platform;
  /** CPU architecture */
  arch: Architecture;
  /** OS version/release string */
  version: string;
  /** User's home directory */
  homeDir: string;
  /** System temp directory */
  tempDir: string;
  /** Whether running in a TTY */
  isTTY: boolean;
  /** Whether running in CI environment */
  isCI: boolean;
  /** Default shell */
  shell: string;
}

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  const p = platform();
  switch (p) {
    case 'darwin':
      return 'darwin';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'win32';
    default:
      return 'unknown';
  }
}

/**
 * Detect the CPU architecture
 */
export function detectArchitecture(): Architecture {
  const a = arch();
  switch (a) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    case 'arm':
      return 'arm';
    default:
      return 'unknown';
  }
}

/**
 * Detect the default shell
 */
export function detectShell(): string {
  // Check SHELL environment variable first
  const envShell = process.env.SHELL;
  if (envShell) {
    return envShell;
  }

  // Platform-specific defaults
  const os = detectPlatform();
  switch (os) {
    case 'darwin':
      return '/bin/zsh';
    case 'linux':
      return '/bin/bash';
    case 'win32':
      return process.env.COMSPEC || 'cmd.exe';
    default:
      return '/bin/sh';
  }
}

/**
 * Check if running in a CI environment
 */
export function isCI(): boolean {
  return (
    process.env.CI === 'true' ||
    process.env.CI === '1' ||
    process.env.CONTINUOUS_INTEGRATION === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITLAB_CI === 'true' ||
    process.env.CIRCLECI === 'true' ||
    process.env.TRAVIS === 'true' ||
    process.env.JENKINS_URL !== undefined
  );
}

/**
 * Check if running in a TTY
 */
export function isTTY(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * Get complete platform information
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    os: detectPlatform(),
    arch: detectArchitecture(),
    version: release(),
    homeDir: homedir(),
    tempDir: tmpdir(),
    isTTY: isTTY(),
    isCI: isCI(),
    shell: detectShell(),
  };
}

/**
 * Check if a command is available in PATH
 */
export function isCommandAvailable(command: string): boolean {
  const os = detectPlatform();
  const checkCommand = os === 'win32' ? 'where' : 'which';

  try {
    execSync(`${checkCommand} ${command}`, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the version of a command
 */
export function getCommandVersion(
  command: string,
  versionFlag: string = '--version'
): string | null {
  try {
    const output = execSync(`${command} ${versionFlag}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Check if tmux is available
 */
export function isTmuxAvailable(): boolean {
  return isCommandAvailable('tmux');
}

/**
 * Get tmux version
 */
export function getTmuxVersion(): string | null {
  const version = getCommandVersion('tmux', '-V');
  if (version) {
    // Parse "tmux 3.4" to "3.4"
    const match = version.match(/tmux\s+(\d+\.\d+[a-z]?)/i);
    return match ? match[1] : version;
  }
  return null;
}

/**
 * Check if git is available
 */
export function isGitAvailable(): boolean {
  return isCommandAvailable('git');
}

/**
 * Get git version
 */
export function getGitVersion(): string | null {
  const version = getCommandVersion('git', '--version');
  if (version) {
    // Parse "git version 2.39.0" to "2.39.0"
    const match = version.match(/git version (\d+\.\d+\.\d+)/i);
    return match ? match[1] : version;
  }
  return null;
}

/**
 * Check if claude CLI is available
 */
export function isClaudeAvailable(): boolean {
  return isCommandAvailable('claude');
}
