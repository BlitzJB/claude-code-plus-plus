/**
 * Pane Orchestrator
 *
 * Handles tmux pane layout management including:
 * - Breaking and joining panes for fullscreen modals
 * - Enforcing sidebar width
 * - Managing pane resize hooks
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import * as tmux from '../tmux';
import {
  SIDEBAR_WIDTH,
  TERMINAL_BAR_HEIGHT,
  RESIZE_HOOK_SCRIPT_PREFIX,
} from '../constants';
import type { Session } from '../types';

/**
 * Set up terminal bar resize enforcement (hook + mouse binding).
 * Uses a file-based script to avoid complex quoting issues.
 */
export function setupTerminalBarResize(
  sessionName: string,
  claudePaneId: string,
  barPaneId: string,
  terminalBodyPaneId: string
): void {
  const hookCmd = createResizeHookScript(claudePaneId, barPaneId, terminalBodyPaneId);

  // Set up the after-resize-pane hook
  tmux.setHook(sessionName, 'after-resize-pane', hookCmd);

  // Also bind MouseDragEnd1Border to run the script when mouse drag ends
  const safeName = `${claudePaneId}-${barPaneId}`.replace(/%/g, '');
  const scriptPath = `${RESIZE_HOOK_SCRIPT_PREFIX}${safeName}.sh`;
  try {
    execSync(`tmux bind-key -T root MouseDragEnd1Border run-shell "sh ${scriptPath}"`, { stdio: 'ignore' });
  } catch {
    // Ignore errors - binding may already exist
  }
}

/**
 * Remove terminal bar resize hook
 */
export function removeTerminalBarResize(sessionName: string): void {
  try {
    tmux.removeHook(sessionName, 'after-resize-pane');
  } catch {
    // Hook may not exist
  }
}

/**
 * Create a shell script for terminal bar resize hook and return the hook command.
 */
function createResizeHookScript(
  claudePaneId: string,
  barPaneId: string,
  terminalBodyPaneId: string
): string {
  const safeName = `${claudePaneId}-${barPaneId}`.replace(/%/g, '');
  const scriptPath = `${RESIZE_HOOK_SCRIPT_PREFIX}${safeName}.sh`;

  const scriptContent = `#!/bin/sh
# Terminal bar resize hook - keeps bar at ${TERMINAL_BAR_HEIGHT} row(s)
# Lock check - prevent recursion
LOCK=$(tmux show-option -gqv @cpp-resizing 2>/dev/null)
[ -n "$LOCK" ] && exit 0

# Get current heights
BAR_H=$(tmux display-message -p -t "${barPaneId}" '#{pane_height}' 2>/dev/null)
[ -z "$BAR_H" ] && exit 0
[ "$BAR_H" -eq ${TERMINAL_BAR_HEIGHT} ] && exit 0

CLAUDE_H=$(tmux display-message -p -t "${claudePaneId}" '#{pane_height}' 2>/dev/null)
BODY_H=$(tmux display-message -p -t "${terminalBodyPaneId}" '#{pane_height}' 2>/dev/null)

# Get previous heights (to detect which pane shrank)
PREV_CLAUDE=$(tmux show-option -gqv @cpp-prev-claude 2>/dev/null)
PREV_BODY=$(tmux show-option -gqv @cpp-prev-body 2>/dev/null)

# Acquire lock and set trap
tmux set-option -g @cpp-resizing 1
trap 'tmux set-option -gu @cpp-resizing 2>/dev/null' EXIT

# Calculate how much bar is over target
D=$((BAR_H - ${TERMINAL_BAR_HEIGHT}))

# Determine which pane to grow based on which one shrank
if [ -n "$PREV_CLAUDE" ] && [ "$CLAUDE_H" -lt "$PREV_CLAUDE" ]; then
  # Claude shrank (user dragged tabs ceiling UP) -> grow Terminal body
  tmux resize-pane -t "${terminalBodyPaneId}" -U "$D" 2>/dev/null
elif [ -n "$PREV_BODY" ] && [ "$BODY_H" -lt "$PREV_BODY" ]; then
  # Terminal body shrank (user dragged body ceiling DOWN) -> grow Claude
  tmux resize-pane -t "${claudePaneId}" -D "$D" 2>/dev/null
else
  # Fallback: just set bar height directly
  :
fi

# Set bar to exact height
tmux resize-pane -t "${barPaneId}" -y ${TERMINAL_BAR_HEIGHT} 2>/dev/null

# Store FINAL heights (after adjustment) for next comparison
FINAL_CLAUDE=$(tmux display-message -p -t "${claudePaneId}" '#{pane_height}' 2>/dev/null)
FINAL_BODY=$(tmux display-message -p -t "${terminalBodyPaneId}" '#{pane_height}' 2>/dev/null)
tmux set-option -g @cpp-prev-claude "$FINAL_CLAUDE"
tmux set-option -g @cpp-prev-body "$FINAL_BODY"
`;

  writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  return `"run-shell 'sh ${scriptPath}'"`;
}

/**
 * Enforce sidebar width by resizing the pane
 */
export function enforceSidebarWidth(sidebarPaneId: string): void {
  try {
    tmux.resizePane(sidebarPaneId, SIDEBAR_WIDTH);
  } catch {
    // Pane may not exist yet
  }
}

/**
 * Break session panes for fullscreen modal
 */
export function breakSessionPanes(session: Session): void {
  // Break active terminal first (if any)
  if (session.terminals.length > 0) {
    const activeTerminal = session.terminals[session.activeTerminalIndex];
    if (activeTerminal) {
      tmux.breakPane(activeTerminal.paneId);
    }
    // Break terminal bar
    if (session.terminalBarPaneId) {
      tmux.breakPane(session.terminalBarPaneId);
    }
  }
  // Break Claude pane
  tmux.breakPane(session.paneId);
}

/**
 * Join session panes after fullscreen modal
 */
export function joinSessionPanes(
  session: Session,
  sidebarPaneId: string,
  sessionName: string
): void {
  // Join Claude pane
  tmux.joinPane(session.paneId, sidebarPaneId, true);

  // Join terminal bar and active terminal if session has terminals
  if (session.terminals.length > 0 && session.terminalBarPaneId) {
    // Join terminal bar below Claude pane
    tmux.joinPane(session.terminalBarPaneId, session.paneId, false);

    // Join active terminal below terminal bar
    const activeTerminal = session.terminals[session.activeTerminalIndex];
    if (activeTerminal) {
      tmux.joinPane(activeTerminal.paneId, session.terminalBarPaneId, false);

      // Re-setup resize hook
      setupTerminalBarResize(
        sessionName,
        session.paneId,
        session.terminalBarPaneId,
        activeTerminal.paneId
      );
    }
  }
}
