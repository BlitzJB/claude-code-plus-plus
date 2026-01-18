/**
 * Sidebar Rendering
 *
 * ANSI-based terminal rendering for the sidebar.
 */

import { ansi } from '../ansi';
import {
  SIDEBAR_WIDTH,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  HEADER_ROW_COUNT,
  FOOTER_ROW_COUNT,
  MODAL_MAX_WIDTH,
  LIST_ITEM_PADDING,
  WORKTREE_ITEM_PADDING,
  UI_TEXT,
  KEY_HINTS,
  VERSION,
} from '../constants';

// Re-export for backwards compatibility
export { ansi };

// ============================================================================
// Rendering Helpers
// ============================================================================

/**
 * Truncate string to fit width
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Pad string to width
 */
export function pad(str: string, width: number, char: string = ' '): string {
  if (str.length >= width) return str;
  return str + char.repeat(width - str.length);
}

/**
 * Center string in width
 */
export function center(str: string, width: number): string {
  if (str.length >= width) return str;
  const left = Math.floor((width - str.length) / 2);
  const right = width - str.length - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

// ============================================================================
// Render Functions
// ============================================================================

import type { SidebarState, Worktree, Session, ListItem, DeleteTarget } from '../types';

/**
 * Dimensions for rendering
 */
export interface RenderDimensions {
  cols: number;
  rows: number;
}

/**
 * Build list of displayable items
 */
export function buildListItems(state: SidebarState): ListItem[] {
  const items: ListItem[] = [];

  for (const wt of state.worktrees) {
    items.push({
      type: 'worktree',
      id: wt.id,
      label: wt.branch,
      indent: 0,
      worktree: wt,
    });

    // Add sessions for this worktree
    const sessions = state.sessions.filter(s => s.worktreeId === wt.id);
    for (const session of sessions) {
      items.push({
        type: 'session',
        id: session.id,
        label: session.title,
        indent: 1,
        session,
      });
    }
  }

  return items;
}

/**
 * Render the main sidebar view
 */
export function renderMain(state: SidebarState): string {
  const cols = process.stdout.columns || SIDEBAR_WIDTH;
  const rows = process.stdout.rows || DEFAULT_ROWS;

  let output = ansi.hideCursor + ansi.clearScreen + ansi.moveTo(1, 1);

  // Header with collapse button
  const header = UI_TEXT.APP_TITLE;
  const collapseBtn = '◀';
  const headerPadding = Math.max(0, cols - header.length - 2);
  output += `${ansi.bold}${ansi.fg.cyan}${header}${ansi.reset}`;
  output += ' '.repeat(headerPadding);
  output += `${ansi.fg.gray}${collapseBtn}${ansi.reset}\n`;
  output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n`;

  // List items
  const items = buildListItems(state);
  let row = HEADER_ROW_COUNT;

  for (let i = 0; i < items.length && row < rows - FOOTER_ROW_COUNT; i++) {
    const item = items[i];
    const isSelected = i === state.selectedIndex;
    const isActive = item.type === 'session' && item.session?.id === state.activeSessionId;

    let line = '';

    // Selection highlight
    if (isSelected) {
      line += ansi.inverse;
    }

    // Color based on state
    if (isActive) {
      line += ansi.fg.yellow;
    } else if (item.type === 'worktree' && state.sessions.some(s => s.worktreeId === item.id)) {
      line += ansi.fg.green;
    } else if (item.type === 'session') {
      line += ansi.fg.gray;
    }

    // Content
    if (item.type === 'worktree') {
      const icon = item.worktree?.isMain ? '◆' : '◇';
      const name = truncate(item.label, cols - WORKTREE_ITEM_PADDING);
      line += `${icon} ${name}`;
      line += ansi.reset;
      // Add plus button (always visible, cyan colored)
      const padding = Math.max(0, cols - name.length - WORKTREE_ITEM_PADDING);
      line += ' '.repeat(padding);
      line += `${ansi.fg.cyan}[+]${ansi.reset}`;
    } else {
      const name = truncate(item.label, cols - LIST_ITEM_PADDING);
      line += `  └ ${name}`;
      line += ansi.reset;
    }

    output += line + '\n';
    row++;
  }

  // "New Worktree" button
  output += '\n';
  output += `${ansi.fg.cyan}${UI_TEXT.NEW_WORKTREE_BUTTON}${ansi.reset}\n`;

  // Help at bottom
  output += ansi.moveTo(rows - 9, 1);
  output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n`;
  output += `${ansi.fg.cyan}↵${ansi.reset}  ${ansi.dim}new session${ansi.reset}\n`;
  output += `${ansi.fg.cyan}n${ansi.reset}  ${ansi.dim}new worktree${ansi.reset}\n`;
  output += `${ansi.fg.cyan}^T${ansi.reset} ${ansi.dim}terminal${ansi.reset}\n`;
  output += `${ansi.fg.cyan}^D${ansi.reset} ${ansi.dim}diff${ansi.reset}\n`;
  output += `${ansi.fg.cyan}d${ansi.reset}  ${ansi.dim}delete${ansi.reset}\n`;
  output += `${ansi.fg.cyan}r${ansi.reset}  ${ansi.dim}rename${ansi.reset}\n`;
  output += `${ansi.fg.cyan}^Q${ansi.reset} ${ansi.dim}quit${ansi.reset}\n`;
  output += `${ansi.dim}v${VERSION}${ansi.reset}\n`;

  return output;
}

/**
 * Render quit confirmation modal (fullscreen)
 */
export function renderQuitModal(state: SidebarState, dims?: RenderDimensions): string {
  const cols = dims?.cols || process.stdout.columns || 80;
  const rows = dims?.rows || process.stdout.rows || 24;

  let output = ansi.hideCursor + ansi.clearScreen;

  // Title area
  const startY = Math.floor(rows / 3);
  output += ansi.moveTo(startY, 1);

  // Header
  const title = 'Exit Claude++';
  const titlePadding = Math.floor((cols - title.length) / 2);
  output += ' '.repeat(titlePadding);
  output += `${ansi.bold}${ansi.fg.yellow}${title}${ansi.reset}\n\n`;

  // Separator
  const separatorPadding = Math.floor((cols - 60) / 2);
  output += ' '.repeat(Math.max(0, separatorPadding));
  output += `${ansi.dim}${'─'.repeat(Math.min(60, cols - 4))}${ansi.reset}\n\n`;

  // Session count info
  const sessionInfo = `${state.sessions.length} active session${state.sessions.length !== 1 ? 's' : ''}`;
  const infoPadding = Math.floor((cols - sessionInfo.length) / 2);
  output += ' '.repeat(Math.max(0, infoPadding));
  output += `${ansi.fg.cyan}${sessionInfo}${ansi.reset}\n\n\n`;

  // Options
  const optionPadding = Math.floor((cols - 50) / 2);
  const pad = ' '.repeat(Math.max(4, optionPadding));

  // Detach option
  const detachSel = state.modalSelection === 0;
  output += pad;
  if (detachSel) {
    output += `${ansi.bold}${ansi.fg.green}▸ ${ansi.reset}`;
    output += `${ansi.bold}${ansi.inverse} Detach ${ansi.reset}`;
  } else {
    output += `  `;
    output += `${ansi.fg.white}  Detach ${ansi.reset}`;
  }
  output += '\n';
  output += pad;
  output += `  ${ansi.dim}  Keep sessions running in background${ansi.reset}\n`;
  output += pad;
  output += `  ${ansi.dim}  Reattach later with: tmux attach${ansi.reset}\n\n`;

  // Kill option
  const killSel = state.modalSelection === 1;
  output += pad;
  if (killSel) {
    output += `${ansi.bold}${ansi.fg.red}▸ ${ansi.reset}`;
    output += `${ansi.bold}${ansi.inverse} Kill All ${ansi.reset}`;
  } else {
    output += `  `;
    output += `${ansi.fg.white}  Kill All ${ansi.reset}`;
  }
  output += '\n';
  output += pad;
  output += `  ${ansi.dim}  Terminate all sessions and exit${ansi.reset}\n`;
  output += pad;
  output += `  ${ansi.fg.red}${ansi.dim}  Warning: Unsaved work will be lost${ansi.reset}\n\n\n`;

  // Help text at bottom
  const helpPadding = Math.floor((cols - 40) / 2);
  output += ' '.repeat(Math.max(0, helpPadding));
  output += `${ansi.dim}↑↓ Select   Enter Confirm   Esc Cancel${ansi.reset}`;

  return output;
}

/**
 * Render delete confirmation modal (fullscreen)
 */
export function renderDeleteModal(state: SidebarState, targetName: string, dims?: RenderDimensions): string {
  const cols = dims?.cols || process.stdout.columns || 80;
  const rows = dims?.rows || process.stdout.rows || 24;
  const target = state.deleteTarget;

  let output = ansi.hideCursor + ansi.clearScreen;

  // Title area
  const startY = Math.floor(rows / 4);
  output += ansi.moveTo(startY, 1);

  // Header - different for session vs worktree
  const isSession = target?.type === 'session';
  const title = isSession ? 'Delete Session?' : 'Delete Worktree?';
  const titlePadding = Math.floor((cols - title.length) / 2);
  output += ' '.repeat(Math.max(0, titlePadding));
  output += `${ansi.bold}${ansi.fg.red}${title}${ansi.reset}\n\n`;

  // Separator
  const separatorPadding = Math.floor((cols - 60) / 2);
  output += ' '.repeat(Math.max(0, separatorPadding));
  output += `${ansi.dim}${'─'.repeat(Math.min(60, cols - 4))}${ansi.reset}\n\n`;

  // Target name
  const namePadding = Math.floor((cols - targetName.length - 4) / 2);
  output += ' '.repeat(Math.max(0, namePadding));
  output += `${ansi.fg.yellow}"${truncate(targetName, cols - 10)}"${ansi.reset}\n\n`;

  // Context information - different for session vs worktree
  const infoPadding = Math.floor((cols - 56) / 2);
  const infoPad = ' '.repeat(Math.max(4, infoPadding));

  if (isSession) {
    // Session-specific context
    output += infoPad;
    output += `${ansi.fg.cyan}Sessions can be resumed later!${ansi.reset}\n\n`;
    output += infoPad;
    output += `${ansi.dim}To resume this session, run:${ansi.reset}\n`;
    output += infoPad;
    output += `${ansi.fg.green}  claude --resume${ansi.reset}\n\n`;
    output += infoPad;
    output += `${ansi.dim}This will close the current pane but the Claude${ansi.reset}\n`;
    output += infoPad;
    output += `${ansi.dim}conversation history is preserved.${ansi.reset}\n\n`;
  } else {
    // Worktree-specific context
    const sessionCount = state.sessions.filter(s => s.worktreeId === target?.id).length;
    output += infoPad;
    output += `${ansi.fg.red}${ansi.bold}Warning: This action cannot be undone!${ansi.reset}\n\n`;

    if (sessionCount > 0) {
      output += infoPad;
      output += `${ansi.fg.yellow}${sessionCount} session${sessionCount !== 1 ? 's' : ''} will be terminated${ansi.reset}\n\n`;
    }

    output += infoPad;
    output += `${ansi.dim}This will:${ansi.reset}\n`;
    output += infoPad;
    output += `${ansi.dim}  • Delete the git worktree directory${ansi.reset}\n`;
    output += infoPad;
    output += `${ansi.dim}  • Remove the branch (if not merged)${ansi.reset}\n`;
    if (sessionCount > 0) {
      output += infoPad;
      output += `${ansi.dim}  • Terminate all associated sessions${ansi.reset}\n`;
    }
    output += '\n';
  }

  // Options
  const optionPadding = Math.floor((cols - 40) / 2);
  const optPad = ' '.repeat(Math.max(4, optionPadding));

  // No option (default)
  const noSel = state.modalSelection === 0;
  output += optPad;
  if (noSel) {
    output += `${ansi.bold}${ansi.fg.green}▸ ${ansi.reset}`;
    output += `${ansi.bold}${ansi.inverse} No, Keep It ${ansi.reset}`;
  } else {
    output += `  `;
    output += `${ansi.fg.white}  No, Keep It ${ansi.reset}`;
  }
  output += '\n\n';

  // Yes option
  const yesSel = state.modalSelection === 1;
  output += optPad;
  if (yesSel) {
    output += `${ansi.bold}${ansi.fg.red}▸ ${ansi.reset}`;
    output += `${ansi.bold}${ansi.inverse} Yes, Delete ${ansi.reset}`;
  } else {
    output += `  `;
    output += `${ansi.fg.white}  Yes, Delete ${ansi.reset}`;
  }
  output += '\n\n\n';

  // Help text at bottom
  const helpPadding = Math.floor((cols - 50) / 2);
  output += ' '.repeat(Math.max(0, helpPadding));
  output += `${ansi.dim}↑↓ Select   Enter Confirm   y/n Quick   Esc Cancel${ansi.reset}`;

  return output;
}

/**
 * Render text input modal (fullscreen)
 */
export function renderInputModal(state: SidebarState, title: string, prompt: string, dims?: RenderDimensions): string {
  const cols = dims?.cols || process.stdout.columns || 80;
  const rows = dims?.rows || process.stdout.rows || 24;

  let output = ansi.hideCursor + ansi.clearScreen;

  // Title area
  const startY = Math.floor(rows / 3);
  output += ansi.moveTo(startY, 1);

  // Header
  const titlePadding = Math.floor((cols - title.length) / 2);
  output += ' '.repeat(Math.max(0, titlePadding));
  output += `${ansi.bold}${ansi.fg.cyan}${title}${ansi.reset}\n\n`;

  // Separator
  const separatorPadding = Math.floor((cols - 60) / 2);
  output += ' '.repeat(Math.max(0, separatorPadding));
  output += `${ansi.dim}${'─'.repeat(Math.min(60, cols - 4))}${ansi.reset}\n\n`;

  // Context based on modal type
  const contextPadding = Math.floor((cols - 50) / 2);
  const ctxPad = ' '.repeat(Math.max(4, contextPadding));

  if (state.modal === 'new-session') {
    output += ctxPad;
    output += `${ansi.dim}Create a new Claude session in this worktree.${ansi.reset}\n`;
    output += ctxPad;
    output += `${ansi.dim}Sessions run in parallel and can be switched anytime.${ansi.reset}\n\n`;
  } else if (state.modal === 'new-worktree') {
    output += ctxPad;
    output += `${ansi.dim}Create a new git worktree with its own branch.${ansi.reset}\n`;
    output += ctxPad;
    output += `${ansi.dim}Worktrees allow working on multiple features in parallel.${ansi.reset}\n\n`;
  } else if (state.modal === 'rename') {
    output += ctxPad;
    output += `${ansi.dim}Rename the selected item.${ansi.reset}\n\n`;
  }

  // Prompt
  const promptPadding = Math.floor((cols - prompt.length - 4) / 2);
  output += ' '.repeat(Math.max(4, promptPadding));
  output += `${ansi.fg.white}${prompt}${ansi.reset}\n\n`;

  // Input field with visible cursor
  const inputText = state.inputBuffer || '';
  const inputMaxWidth = Math.min(50, cols - 10);
  const inputPadding = Math.floor((cols - inputMaxWidth - 6) / 2);
  const inputPad = ' '.repeat(Math.max(4, inputPadding));

  const displayText = inputText.length > inputMaxWidth
    ? inputText.slice(-inputMaxWidth)
    : inputText;

  output += inputPad;
  output += `${ansi.fg.cyan}▸ ${ansi.reset}`;
  output += `${ansi.fg.white}${displayText}${ansi.reset}`;
  output += `${ansi.fg.yellow}${ansi.inverse} ${ansi.reset}`; // Block cursor
  output += '\n';

  // Underline for input area
  output += inputPad;
  output += `  ${ansi.dim}${'─'.repeat(inputMaxWidth + 2)}${ansi.reset}\n\n\n`;

  // Help text at bottom
  const helpPadding = Math.floor((cols - 30) / 2);
  output += ' '.repeat(Math.max(0, helpPadding));
  output += `${ansi.dim}Enter Confirm   Esc Cancel${ansi.reset}`;

  // Show cursor in input mode
  output += ansi.showCursor;

  return output;
}

/**
 * Word-wrap text to fit within a given width
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

/**
 * Render error modal (fullscreen)
 */
export function renderErrorModal(state: SidebarState, dims?: RenderDimensions): string {
  const cols = dims?.cols || process.stdout.columns || 80;
  const rows = dims?.rows || process.stdout.rows || 24;

  let output = ansi.hideCursor + ansi.clearScreen;

  // Title area
  const startY = Math.floor(rows / 4);
  output += ansi.moveTo(startY, 1);

  // Header
  const title = 'Error';
  const titlePadding = Math.floor((cols - title.length) / 2);
  output += ' '.repeat(Math.max(0, titlePadding));
  output += `${ansi.bold}${ansi.fg.red}${title}${ansi.reset}\n\n`;

  // Separator
  const separatorWidth = Math.min(60, cols - 4);
  const separatorPadding = Math.floor((cols - separatorWidth) / 2);
  output += ' '.repeat(Math.max(0, separatorPadding));
  output += `${ansi.dim}${'─'.repeat(separatorWidth)}${ansi.reset}\n\n`;

  // Error message - word wrapped
  const errorMessage = state.errorMessage || 'An unknown error occurred.';
  const messageWidth = Math.min(56, cols - 8);
  const messagePadding = Math.floor((cols - messageWidth) / 2);
  const msgPad = ' '.repeat(Math.max(4, messagePadding));

  const lines = wordWrap(errorMessage, messageWidth);
  for (const line of lines) {
    output += msgPad;
    output += `${ansi.fg.white}${line}${ansi.reset}\n`;
  }
  output += '\n\n';

  // OK button
  const buttonPadding = Math.floor((cols - 10) / 2);
  output += ' '.repeat(Math.max(4, buttonPadding));
  output += `${ansi.bold}${ansi.fg.cyan}▸ ${ansi.reset}`;
  output += `${ansi.bold}${ansi.inverse} OK ${ansi.reset}`;
  output += '\n\n\n';

  // Help text at bottom
  const helpPadding = Math.floor((cols - 25) / 2);
  output += ' '.repeat(Math.max(0, helpPadding));
  output += `${ansi.dim}Enter or Esc to dismiss${ansi.reset}`;

  return output;
}

/**
 * Render collapsed sidebar
 */
export function renderCollapsed(sessionCount: number): string {
  let output = ansi.clearScreen;
  output += ansi.moveTo(1, 1);
  output += `${ansi.fg.cyan}▸${ansi.reset}`;

  if (sessionCount > 0) {
    output += ansi.moveTo(3, 1);
    output += `${ansi.fg.green}${sessionCount}${ansi.reset}`;
  }

  return output;
}
