/**
 * Tmux pane and session operations
 */

import { exec, run, check } from './commands';

// ============================================================================
// Types
// ============================================================================

export interface TmuxPane {
  id: string;
  width: number;
  height: number;
  active: boolean;
}

// ============================================================================
// Session Operations
// ============================================================================

/**
 * Check if a session exists
 */
export function sessionExists(name: string): boolean {
  return check(['has-session', '-t', name]);
}

/**
 * Create a new detached session
 */
export function createSession(name: string, cwd: string): string {
  run(['new-session', '-d', '-s', name, '-c', `"${cwd}"`]);
  return exec(['display-message', '-p', '-t', name, "'#{pane_id}'"]);
}

/**
 * Kill a session
 */
export function killSession(name: string): void {
  run(['kill-session', '-t', name]);
}

/**
 * Detach current client from session
 */
export function detachClient(): void {
  run(['detach-client']);
}

// ============================================================================
// Pane Operations
// ============================================================================

/**
 * Split pane horizontally (creates pane to the right)
 * @param percentage Width percentage for the LEFT pane
 */
export function splitHorizontal(sessionName: string, percentage: number, cwd?: string): string {
  const args = ['split-window', '-h', '-t', sessionName, '-p', String(100 - percentage)];
  if (cwd) args.push('-c', `"${cwd}"`);
  run(args);
  return exec(['display-message', '-p', '-t', sessionName, "'#{pane_id}'"]);
}

/**
 * Split pane vertically (creates pane below)
 */
export function splitVertical(sessionName: string, percentage: number, cwd?: string): string {
  const args = ['split-window', '-v', '-t', sessionName, '-p', String(100 - percentage)];
  if (cwd) args.push('-c', `"${cwd}"`);
  run(args);
  return exec(['display-message', '-p', '-t', sessionName, "'#{pane_id}'"]);
}

/**
 * List panes in a session
 */
export function listPanes(sessionName: string): TmuxPane[] {
  const output = exec(
    ['list-panes', '-t', sessionName, '-F', "'#{pane_id},#{pane_width},#{pane_height},#{pane_active}'"],
    { silent: true }
  );

  if (!output) return [];

  return output.split('\n').filter(Boolean).map((line) => {
    const [id, width, height, active] = line.split(',');
    return {
      id,
      width: parseInt(width, 10),
      height: parseInt(height, 10),
      active: active === '1',
    };
  });
}

/**
 * Send keys to a pane
 */
export function sendKeys(paneId: string, text: string, enter: boolean = true): void {
  // Escape single quotes
  const escaped = text.replace(/'/g, "'\\''");
  run(['send-keys', '-t', paneId, '-l', `'${escaped}'`]);
  if (enter) {
    run(['send-keys', '-t', paneId, 'Enter']);
  }
}

/**
 * Send a control key (e.g., C-c, Enter, Escape)
 */
export function sendControlKey(paneId: string, key: string): void {
  run(['send-keys', '-t', paneId, key]);
}

/**
 * Run a command in a pane
 */
export function runInPane(paneId: string, command: string): void {
  sendKeys(paneId, command, true);
}

/**
 * Select (focus) a pane
 */
export function selectPane(paneId: string): void {
  run(['select-pane', '-t', paneId]);
}

/**
 * Resize a pane
 */
export function resizePane(paneId: string, width?: number, height?: number): void {
  if (width !== undefined) {
    run(['resize-pane', '-t', paneId, '-x', String(width)]);
  }
  if (height !== undefined) {
    run(['resize-pane', '-t', paneId, '-y', String(height)]);
  }
}

/**
 * Kill a pane
 */
export function killPane(paneId: string): void {
  run(['kill-pane', '-t', paneId]);
}

/**
 * Swap two panes
 */
export function swapPanes(paneId1: string, paneId2: string): void {
  run(['swap-pane', '-s', paneId1, '-t', paneId2]);
}

/**
 * Break a pane to background window
 */
export function breakPane(paneId: string, windowName?: string): void {
  const args = ['break-pane', '-d', '-s', paneId];
  if (windowName) args.push('-n', `"${windowName}"`);
  run(args);
}

/**
 * Get current pane dimensions
 */
export function getPaneDimensions(paneId: string): { width: number; height: number } {
  const output = exec(
    ['display-message', '-p', '-t', paneId, "'#{pane_width},#{pane_height}'"],
    { silent: true }
  );

  if (!output) {
    return { width: 80, height: 24 }; // fallback
  }

  const [width, height] = output.trim().split(',').map(n => parseInt(n, 10));
  return { width: width || 80, height: height || 24 };
}

/**
 * Join a pane from background
 */
export function joinPane(sourcePaneId: string, targetPaneId: string, horizontal: boolean = true): void {
  const dir = horizontal ? '-h' : '-v';
  run(['join-pane', dir, '-s', sourcePaneId, '-t', targetPaneId]);
}

// ============================================================================
// Options
// ============================================================================

/**
 * Set a tmux option
 */
export function setOption(option: string, value: string, global: boolean = false): void {
  const args = global
    ? ['set-option', '-g', option, value]
    : ['set-option', option, value];
  run(args);
}

/**
 * Set a pane-specific option
 */
export function setPaneOption(paneId: string, option: string, value: string): void {
  run(['set-option', '-p', '-t', paneId, option, value]);
}

// ============================================================================
// Key Bindings
// ============================================================================

/**
 * Bind a key in root table
 */
export function bindKey(key: string, command: string): void {
  run(['bind-key', '-T', 'root', key, ...command.split(' ')]);
}

/**
 * Run a shell command via tmux
 */
export function runShell(command: string): void {
  run(['run-shell', '-b', `'${command}'`]);
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Set a tmux hook for a session
 * @param sessionName - Target session
 * @param hookName - Hook name (e.g., 'after-resize-pane', 'client-attached')
 * @param command - Command to run when hook fires (caller must handle quoting)
 */
export function setHook(sessionName: string, hookName: string, command: string): void {
  run(['set-hook', '-t', sessionName, hookName, command]);
}

/**
 * Remove a tmux hook from a session
 * @param sessionName - Target session
 * @param hookName - Hook name to remove
 */
export function removeHook(sessionName: string, hookName: string): void {
  run(['set-hook', '-u', '-t', sessionName, hookName]);
}
