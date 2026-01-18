/**
 * Session Manager
 *
 * Utility functions for session operations.
 * These are pure functions that don't manage state directly.
 */

import * as tmux from '../tmux';
import { DEFAULT_CLAUDE_CMD, CLAUDE_PANE_PERCENT } from '../constants';
import type { Session, Worktree, SidebarState } from '../types';
import { removeTerminalBarResize, breakSessionPanes } from './pane-orchestrator';

/** Generate a unique session ID */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create and launch a Claude pane for a new session
 * Returns the pane ID
 */
export function createClaudePane(
  worktree: Worktree,
  state: SidebarState,
  isFirstSession: boolean
): string {
  const claudeCmd = DEFAULT_CLAUDE_CMD;

  if (isFirstSession) {
    // First session - use existing main pane
    tmux.sendControlKey(state.mainPaneId, 'C-c');
    tmux.sendKeys(state.mainPaneId, `cd "${worktree.path}" && clear && ${claudeCmd}`, true);
    return state.mainPaneId;
  } else {
    // Additional session - create new pane
    const paneId = tmux.splitHorizontal(state.sessionName, CLAUDE_PANE_PERCENT, worktree.path);
    tmux.sendKeys(paneId, claudeCmd, true);
    return paneId;
  }
}

/**
 * Clean up resources for a session being deleted
 */
export function cleanupSession(
  session: Session,
  sessionName: string
): void {
  // Remove resize hook if this session has terminals
  if (session.terminalBarPaneId) {
    removeTerminalBarResize(sessionName);
  }

  // Kill terminal panes
  for (const terminal of session.terminals) {
    try {
      tmux.killPane(terminal.paneId);
    } catch {
      // Pane may already be gone
    }
  }

  // Kill terminal bar pane
  if (session.terminalBarPaneId) {
    try {
      tmux.killPane(session.terminalBarPaneId);
    } catch {
      // Pane may already be gone
    }
  }

  // Kill Claude pane
  try {
    tmux.killPane(session.paneId);
  } catch {
    // Pane may already be gone
  }
}

/**
 * Find the next session to activate after deletion
 */
export function findNextSession(
  sessions: Session[],
  deletedSession: Session
): Session | null {
  // Prefer session in same worktree
  const sameWorktreeSessions = sessions.filter(
    s => s.id !== deletedSession.id && s.worktreeId === deletedSession.worktreeId
  );
  if (sameWorktreeSessions.length > 0) {
    return sameWorktreeSessions[0];
  }

  // Otherwise any session
  const otherSessions = sessions.filter(s => s.id !== deletedSession.id);
  if (otherSessions.length > 0) {
    return otherSessions[0];
  }

  return null;
}
