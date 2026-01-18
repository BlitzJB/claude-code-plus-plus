/**
 * Application Constants
 *
 * Centralized constants for magic numbers, strings, and configuration values.
 * This ensures consistency and makes it easy to modify values across the application.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// Version
// ============================================================================

/** Application version from package.json */
function getVersion(): string {
  try {
    const packagePath = resolve(__dirname, '../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = getVersion();

// ============================================================================
// Layout Constants
// ============================================================================

/** Width of the sidebar pane in columns */
export const SIDEBAR_WIDTH = 25;

/** Height of the terminal tab bar in rows */
export const TERMINAL_BAR_HEIGHT = 1;

/** Percentage of vertical space for Claude pane (vs terminal area) */
export const CLAUDE_PANE_PERCENT = 70;

/** Default terminal dimensions when stdout is unavailable */
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;

// ============================================================================
// UI Layout Numbers
// ============================================================================

/** Number of header rows before the list starts */
export const HEADER_ROW_COUNT = 3;

/** Reserved rows at the bottom for help text (including version line) */
export const FOOTER_ROW_COUNT = 9;

/** Maximum width for modal content */
export const MODAL_MAX_WIDTH = 60;

/** Maximum width for input fields */
export const INPUT_MAX_WIDTH = 50;

/** Padding for list item names (room for indicator/button) */
export const LIST_ITEM_PADDING = 4;

/** Padding for worktree items (room for " [+]" button) */
export const WORKTREE_ITEM_PADDING = 6;

/** Minimum tab width in terminal bar */
export const MIN_TAB_WIDTH = 8;

/** Room for tab number prefix " N: " */
export const TAB_PREFIX_WIDTH = 4;

// ============================================================================
// Commands
// ============================================================================

/** Default command to launch Claude */
export const DEFAULT_CLAUDE_CMD = 'claude --dangerously-skip-permissions';

// ============================================================================
// UI Text
// ============================================================================

export const UI_TEXT = {
  // Application
  APP_TITLE: 'Claude++',
  APP_SUBTITLE: 'Multi-agent Claude Code with git worktree isolation',

  // Sidebar
  NEW_WORKTREE_BUTTON: '+ New Worktree',

  // Terminal bar
  TERMINAL_HINTS: '1-9:switch n:new d:del',
  NO_TERMINALS: 'No terminals',
  NEW_TERMINAL_BUTTON: '[+]',

  // Help text
  HELP_ENTER: 'Enter to confirm',
  HELP_ESCAPE: 'Esc to cancel',
  HELP_ARROWS: 'Use ← → to select',
  HELP_NAVIGATE: '↑/↓ Navigate',

  // Modals
  QUIT_TITLE: 'Quit Claude++?',
  DELETE_TITLE: 'Confirm Delete',
  NEW_WORKTREE_TITLE: 'New Worktree',
  NEW_SESSION_TITLE: 'New Session',
  RENAME_TITLE: 'Rename',
  ERROR_TITLE: 'Error',
} as const;

// ============================================================================
// Key Bindings Display
// ============================================================================

export const KEY_HINTS = {
  NEW_SESSION: '↵  new session',
  NEW_WORKTREE: 'n  new worktree',
  TERMINAL: '^T terminal',
  DELETE: 'd  delete',
  RENAME: 'r  rename',
  QUIT: '^Q quit',
} as const;

// ============================================================================
// File Paths
// ============================================================================

/** Path for sidebar debug log */
export const SIDEBAR_LOG_PATH = '/tmp/claude-pp-sidebar.log';

/** Path prefix for terminal bar handler logs */
export const BAR_HANDLER_LOG_PATH = '/tmp/cpp-bar-handler.log';

/** Path prefix for resize hook scripts */
export const RESIZE_HOOK_SCRIPT_PREFIX = '/tmp/cpp-resize-hook-';
