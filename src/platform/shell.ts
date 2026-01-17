/**
 * Shell Detection and Configuration
 *
 * Detects the user's shell and provides shell-specific configuration.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { detectPlatform, detectShell } from './detector';

export type ShellType = 'bash' | 'zsh' | 'fish' | 'sh' | 'powershell' | 'cmd' | 'unknown';

export interface ShellInfo {
  /** Shell type */
  type: ShellType;
  /** Full path to shell executable */
  path: string;
  /** Shell configuration file (e.g., .bashrc) */
  rcFile: string | null;
  /** Profile file (e.g., .bash_profile) */
  profileFile: string | null;
  /** Command to source the RC file */
  sourceCommand: string | null;
}

/**
 * Detect the shell type from a path
 */
export function getShellType(shellPath: string): ShellType {
  const shellName = shellPath.split('/').pop()?.toLowerCase() || '';

  if (shellName.includes('bash')) return 'bash';
  if (shellName.includes('zsh')) return 'zsh';
  if (shellName.includes('fish')) return 'fish';
  if (shellName === 'sh') return 'sh';
  if (shellName.includes('powershell') || shellName.includes('pwsh'))
    return 'powershell';
  if (shellName === 'cmd' || shellName === 'cmd.exe') return 'cmd';

  return 'unknown';
}

/**
 * Get the RC file for a shell type
 */
function getShellRcFile(shellType: ShellType): string | null {
  const home = homedir();

  switch (shellType) {
    case 'bash':
      // Check for .bashrc first, then .bash_profile
      if (existsSync(join(home, '.bashrc'))) {
        return join(home, '.bashrc');
      }
      return join(home, '.bash_profile');

    case 'zsh':
      return join(home, '.zshrc');

    case 'fish':
      return join(home, '.config', 'fish', 'config.fish');

    case 'sh':
      return join(home, '.profile');

    case 'powershell':
      // PowerShell profile location
      return join(
        home,
        'Documents',
        'PowerShell',
        'Microsoft.PowerShell_profile.ps1'
      );

    default:
      return null;
  }
}

/**
 * Get the profile file for a shell type
 */
function getShellProfileFile(shellType: ShellType): string | null {
  const home = homedir();

  switch (shellType) {
    case 'bash':
      return join(home, '.bash_profile');

    case 'zsh':
      if (existsSync(join(home, '.zprofile'))) {
        return join(home, '.zprofile');
      }
      return join(home, '.zshrc');

    case 'fish':
      return join(home, '.config', 'fish', 'config.fish');

    case 'sh':
      return join(home, '.profile');

    default:
      return null;
  }
}

/**
 * Get the source command for a shell type
 */
function getSourceCommand(shellType: ShellType, rcFile: string | null): string | null {
  if (!rcFile) return null;

  switch (shellType) {
    case 'bash':
    case 'zsh':
    case 'sh':
      return `source "${rcFile}"`;

    case 'fish':
      return `source "${rcFile}"`;

    case 'powershell':
      return `. "${rcFile}"`;

    default:
      return null;
  }
}

/**
 * Get complete shell information
 */
export function getShellInfo(): ShellInfo {
  const shellPath = detectShell();
  const shellType = getShellType(shellPath);
  const rcFile = getShellRcFile(shellType);

  return {
    type: shellType,
    path: shellPath,
    rcFile,
    profileFile: getShellProfileFile(shellType),
    sourceCommand: getSourceCommand(shellType, rcFile),
  };
}

/**
 * Get the command to spawn an interactive shell
 */
export function getInteractiveShellCommand(): string[] {
  const info = getShellInfo();

  switch (info.type) {
    case 'bash':
      return [info.path, '--login', '-i'];

    case 'zsh':
      return [info.path, '-l', '-i'];

    case 'fish':
      return [info.path, '-i'];

    case 'powershell':
      return [info.path, '-NoLogo', '-NoExit'];

    case 'cmd':
      return [info.path];

    default:
      return [info.path];
  }
}

/**
 * Get the command to run a script in the shell
 */
export function getShellExecCommand(script: string): string[] {
  const info = getShellInfo();

  switch (info.type) {
    case 'bash':
    case 'zsh':
    case 'sh':
    case 'fish':
      return [info.path, '-c', script];

    case 'powershell':
      return [info.path, '-Command', script];

    case 'cmd':
      return [info.path, '/c', script];

    default:
      return [info.path, '-c', script];
  }
}

/**
 * Escape a string for safe use in shell commands
 */
export function escapeShellArg(arg: string): string {
  const os = detectPlatform();

  if (os === 'win32') {
    // Windows: double quotes with escaped internal quotes
    return `"${arg.replace(/"/g, '\\"')}"`;
  }

  // Unix: single quotes with escaped single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Check if the shell supports a feature
 */
export function shellSupports(feature: 'colors' | 'unicode' | 'mouse'): boolean {
  const term = process.env.TERM || '';
  const colorTerm = process.env.COLORTERM || '';

  switch (feature) {
    case 'colors':
      return (
        term.includes('color') ||
        term.includes('256') ||
        term === 'xterm' ||
        colorTerm === 'truecolor' ||
        colorTerm === '24bit'
      );

    case 'unicode':
      const lang = process.env.LANG || '';
      const lcAll = process.env.LC_ALL || '';
      return (
        lang.toLowerCase().includes('utf') ||
        lcAll.toLowerCase().includes('utf')
      );

    case 'mouse':
      return (
        term.includes('xterm') ||
        term.includes('screen') ||
        term.includes('tmux') ||
        term.includes('rxvt')
      );

    default:
      return false;
  }
}
