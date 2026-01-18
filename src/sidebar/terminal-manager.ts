/**
 * Terminal Manager
 *
 * Utility functions for terminal operations.
 * These are pure functions that don't manage state directly.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import * as tmux from '../tmux';
import { TERMINAL_BAR_HEIGHT, CLAUDE_PANE_PERCENT } from '../constants';
import type { Session, Terminal } from '../types';
import { renderTerminalBar } from '../terminal';
import { setupTerminalBarResize, removeTerminalBarResize } from './pane-orchestrator';

/** Generate a unique terminal ID */
export function generateTerminalId(): string {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create the initial terminal layout for a session (bar + terminal pane)
 * Returns the pane IDs for bar and terminal
 */
export function createFirstTerminalLayout(
  session: Session,
  worktreePath: string,
  sessionName: string
): { barPaneId: string; terminalPaneId: string } {
  // Split Claude pane vertically (Claude gets top 70%, terminal area gets bottom 30%)
  tmux.selectPane(session.paneId);
  const terminalAreaPaneId = tmux.splitVertical(sessionName, 100 - CLAUDE_PANE_PERCENT, worktreePath);

  // Split terminal area: top 1 row for bar, rest for terminal
  tmux.selectPane(terminalAreaPaneId);
  const terminalPaneId = tmux.splitVertical(sessionName, 95, worktreePath);

  // The terminalAreaPaneId is now the bar pane (top part after split)
  const barPaneId = terminalAreaPaneId;

  // Resize bar pane to exactly 1 row
  tmux.resizePane(barPaneId, undefined, TERMINAL_BAR_HEIGHT);

  // Set up resize enforcement
  setupTerminalBarResize(sessionName, session.paneId, barPaneId, terminalPaneId);

  return { barPaneId, terminalPaneId };
}

/**
 * Create an additional terminal pane
 * Breaks the current terminal and returns the new pane ID
 */
export function createAdditionalTerminal(
  currentTerminalPaneId: string,
  sessionName: string,
  worktreePath: string
): string {
  // Split from current terminal to create new one
  tmux.selectPane(currentTerminalPaneId);
  const newTerminalPaneId = tmux.splitVertical(sessionName, 50, worktreePath);

  // Break the current terminal to background
  tmux.breakPane(currentTerminalPaneId);

  return newTerminalPaneId;
}

/**
 * Switch to a different terminal in a session
 */
export function switchToTerminal(
  session: Session,
  currentIndex: number,
  targetIndex: number,
  sessionName: string
): void {
  if (targetIndex < 0 || targetIndex >= session.terminals.length) {
    return;
  }

  const currentTerminal = session.terminals[currentIndex];
  const targetTerminal = session.terminals[targetIndex];

  if (currentTerminal.id === targetTerminal.id) {
    return;
  }

  // Break current terminal
  tmux.breakPane(currentTerminal.paneId);

  // Join target terminal below bar
  if (session.terminalBarPaneId) {
    tmux.joinPane(targetTerminal.paneId, session.terminalBarPaneId, false);

    // Re-setup resize hook with new terminal pane
    setupTerminalBarResize(
      sessionName,
      session.paneId,
      session.terminalBarPaneId,
      targetTerminal.paneId
    );
  }

  // Focus the terminal pane
  tmux.selectPane(targetTerminal.paneId);
}

/**
 * Delete a terminal and handle layout adjustments
 * Returns whether cleanup of bar is needed and the terminal to show next
 */
export function deleteTerminal(
  session: Session,
  terminal: Terminal,
  index: number,
  sessionName: string
): { cleanupBar: boolean; nextTerminalToShow: Terminal | null; newActiveIndex: number } {
  const isActive = index === session.activeTerminalIndex;
  const remainingCount = session.terminals.length - 1;

  // Kill the terminal pane
  try {
    tmux.killPane(terminal.paneId);
  } catch {
    // Pane may already be gone
  }

  if (remainingCount === 0) {
    // No more terminals - need to clean up bar
    return { cleanupBar: true, nextTerminalToShow: null, newActiveIndex: 0 };
  }

  // Calculate new active index
  let newActiveIndex = session.activeTerminalIndex;
  if (isActive) {
    newActiveIndex = Math.min(index, remainingCount - 1);
  } else if (index < session.activeTerminalIndex) {
    newActiveIndex = session.activeTerminalIndex - 1;
  }

  // Find terminal to show if we deleted the active one
  let nextTerminalToShow: Terminal | null = null;
  if (isActive) {
    const terminalsAfterRemoval = session.terminals.filter((_, i) => i !== index);
    nextTerminalToShow = terminalsAfterRemoval[newActiveIndex] || null;
  }

  return { cleanupBar: false, nextTerminalToShow, newActiveIndex };
}

/**
 * Clean up terminal bar resources
 */
export function cleanupTerminalBar(
  session: Session,
  sessionName: string
): void {
  removeTerminalBarResize(sessionName);

  if (session.terminalBarPaneId) {
    try {
      tmux.killPane(session.terminalBarPaneId);
    } catch {
      // Pane may already be gone
    }
  }
}

/**
 * Start the terminal bar handler process
 */
export function startTerminalBarHandler(
  barPaneId: string,
  sidebarPaneId: string,
  sessionId: string
): void {
  // Find the bar-handler script
  const distPath = resolve(__dirname, '../../dist/terminal/bar-handler.js');
  const tsPath = resolve(__dirname, '../terminal/bar-handler.ts');
  const jsPath = resolve(__dirname, './bar-handler.js');

  let handlerPath: string;
  let runner: string;

  if (existsSync(distPath)) {
    handlerPath = distPath;
    runner = 'node';
  } else if (existsSync(jsPath)) {
    handlerPath = jsPath;
    runner = 'node';
  } else if (existsSync(tsPath)) {
    handlerPath = tsPath;
    runner = 'npx tsx';
  } else {
    return;
  }

  const cmd = `${runner} "${handlerPath}" "${sidebarPaneId}" "${sessionId}"`;
  tmux.sendKeys(barPaneId, cmd, true);
}

/**
 * Send update to terminal bar
 */
export function updateTerminalBar(
  session: Session,
  sidebarPaneId: string
): void {
  if (!session.terminalBarPaneId) return;

  // Get pane width
  let width = 80;
  try {
    const output = execSync(
      `tmux display-message -p -t "${session.terminalBarPaneId}" '#{pane_width}'`,
      { encoding: 'utf-8' }
    ).trim();
    width = parseInt(output, 10) || 80;
  } catch {
    // Use default width
  }

  // Render the bar (we don't use the output directly, just validate)
  renderTerminalBar(session.terminals, session.activeTerminalIndex, width);

  // Send the rendered content to the bar pane via the handler
  const encodedData = Buffer.from(
    JSON.stringify({
      terminals: session.terminals,
      activeIndex: session.activeTerminalIndex,
    })
  ).toString('base64');

  try {
    execSync(`tmux send-keys -t "${sidebarPaneId}" C-u`, { stdio: 'ignore' });
    const cmd = `__CPP_UPDATE__:${session.id}:${encodedData}`;
    execSync(`tmux send-keys -t "${sidebarPaneId}" -l "${cmd}"`, { stdio: 'ignore' });
    execSync(`tmux send-keys -t "${sidebarPaneId}" Enter`, { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
}
