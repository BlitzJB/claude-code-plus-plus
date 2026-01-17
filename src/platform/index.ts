/**
 * Platform Module
 *
 * Platform detection and abstraction layer.
 * Isolates all platform-specific code to enable cross-platform support.
 */

// Platform detection
export {
  detectPlatform,
  detectArchitecture,
  detectShell,
  isCI,
  isTTY,
  getPlatformInfo,
  isCommandAvailable,
  getCommandVersion,
  isTmuxAvailable,
  getTmuxVersion,
  isGitAvailable,
  getGitVersion,
  isClaudeAvailable,
} from './detector';
export type { Platform, Architecture, PlatformInfo } from './detector';

// Platform paths
export {
  getHomeDir,
  getTempDir,
  getAppDataDir,
  getConfigDir,
  getCacheDir,
  getWorktreesDir,
  getTempFilePath,
  getDebugLogPath,
  getProjectPaths,
  resolvePath,
  getNullDevice,
} from './paths';
export type { ProjectPaths } from './paths';

// Clipboard operations
export {
  isClipboardAvailable,
  copyToClipboard,
  copyToClipboardSync,
  pasteFromClipboard,
  pasteFromClipboardSync,
} from './clipboard';

// Shell utilities
export {
  getShellType,
  getShellInfo,
  getInteractiveShellCommand,
  getShellExecCommand,
  escapeShellArg,
  shellSupports,
} from './shell';
export type { ShellType, ShellInfo } from './shell';
