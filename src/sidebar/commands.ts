/**
 * Command Definitions
 *
 * Maps key combinations to command handlers for the sidebar.
 * This provides a cleaner structure than sequential if-statements.
 */

import type { SidebarState } from '../types';

/** Key combination representation */
export interface KeyCombo {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
}

/** Command handler context */
export interface CommandContext {
  state: SidebarState;
  actions: CommandActions;
}

/** Available actions that commands can trigger */
export interface CommandActions {
  // Navigation
  moveUp: () => void;
  moveDown: () => void;
  activateSelected: () => void;

  // Modals
  showQuitModal: () => void;
  showDeleteModal: () => void;
  showNewWorktreeModal: () => void;
  showRenameModal: () => void;

  // Actions
  toggleCollapsed: () => void;
  createTerminal: () => void;
  render: () => void;
}

/** Command definition */
export interface Command {
  /** Description for help text */
  description: string;
  /** Handler function */
  handler: (ctx: CommandContext) => boolean; // returns true if handled
}

/** Check if a key matches a combo */
export function matchesKey(
  key: { key: string; ctrl: boolean; alt: boolean },
  combo: KeyCombo
): boolean {
  if (key.key !== combo.key) return false;
  if (combo.ctrl && !key.ctrl) return false;
  if (combo.alt && !key.alt) return false;
  if (!combo.ctrl && key.ctrl) return false;
  if (!combo.alt && key.alt) return false;
  return true;
}

/** Format key combo for display */
export function formatKeyCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('^');
  if (combo.alt) parts.push('M-');
  parts.push(combo.key.toUpperCase());
  return parts.join('');
}

/** Main commands for the sidebar */
export const MAIN_COMMANDS: Array<{ combo: KeyCombo; command: Command }> = [
  // Quit commands
  {
    combo: { key: 'c', ctrl: true },
    command: {
      description: 'Show quit dialog',
      handler: (ctx) => {
        ctx.actions.showQuitModal();
        return true;
      },
    },
  },
  {
    combo: { key: 'q', ctrl: true },
    command: {
      description: 'Show quit dialog',
      handler: (ctx) => {
        ctx.actions.showQuitModal();
        return true;
      },
    },
  },

  // Toggle collapsed
  {
    combo: { key: 'g', ctrl: true },
    command: {
      description: 'Toggle sidebar collapse',
      handler: (ctx) => {
        ctx.actions.toggleCollapsed();
        return true;
      },
    },
  },

  // Terminal
  {
    combo: { key: 't', ctrl: true },
    command: {
      description: 'Create new terminal',
      handler: (ctx) => {
        ctx.actions.createTerminal();
        return true;
      },
    },
  },

  // Navigation
  {
    combo: { key: 'up' },
    command: {
      description: 'Move selection up',
      handler: (ctx) => {
        ctx.actions.moveUp();
        return true;
      },
    },
  },
  {
    combo: { key: 'k' },
    command: {
      description: 'Move selection up',
      handler: (ctx) => {
        ctx.actions.moveUp();
        return true;
      },
    },
  },
  {
    combo: { key: 'down' },
    command: {
      description: 'Move selection down',
      handler: (ctx) => {
        ctx.actions.moveDown();
        return true;
      },
    },
  },
  {
    combo: { key: 'j' },
    command: {
      description: 'Move selection down',
      handler: (ctx) => {
        ctx.actions.moveDown();
        return true;
      },
    },
  },

  // Activate
  {
    combo: { key: 'enter' },
    command: {
      description: 'Activate selected item',
      handler: (ctx) => {
        ctx.actions.activateSelected();
        return true;
      },
    },
  },

  // New worktree
  {
    combo: { key: 'n' },
    command: {
      description: 'Create new worktree',
      handler: (ctx) => {
        ctx.actions.showNewWorktreeModal();
        return true;
      },
    },
  },

  // Delete
  {
    combo: { key: 'd' },
    command: {
      description: 'Delete selected item',
      handler: (ctx) => {
        ctx.actions.showDeleteModal();
        return true;
      },
    },
  },

  // Rename
  {
    combo: { key: 'r' },
    command: {
      description: 'Rename selected item',
      handler: (ctx) => {
        ctx.actions.showRenameModal();
        return true;
      },
    },
  },
];

/**
 * Execute a command from the command map
 * Returns true if a command was executed
 */
export function executeCommand(
  commands: Array<{ combo: KeyCombo; command: Command }>,
  key: { key: string; ctrl: boolean; alt: boolean },
  context: CommandContext
): boolean {
  for (const { combo, command } of commands) {
    if (matchesKey(key, combo)) {
      return command.handler(context);
    }
  }
  return false;
}
