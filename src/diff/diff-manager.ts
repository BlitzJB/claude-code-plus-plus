/**
 * Diff Pane Manager
 *
 * Handles creating, updating, and closing the diff pane.
 * Manages the diff handler process lifecycle.
 * Also manages file diff header pane for viewing individual file diffs.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import * as tmux from '../tmux';
import { DIFF_PANE_WIDTH } from '../constants';
import type { Session, DiffViewMode } from '../types';
import type { DiffFileSummary } from './git-diff';

// ============================================================================
// Constants
// ============================================================================

/** Height of the file diff header pane (1 row) */
const FILE_HEADER_HEIGHT = 1;

// ============================================================================
// Pane Operations
// ============================================================================

/**
 * Create the diff pane to the right of the Claude pane
 * Returns the new pane ID
 */
export function createDiffPane(sessionName: string, claudePaneId: string): string {
  // Select the Claude pane first
  tmux.selectPane(claudePaneId);

  // Split horizontally to create a pane to the right
  // We want the diff pane to take DIFF_PANE_WIDTH columns
  // split-window -p means percentage for the NEW pane
  const paneId = tmux.splitHorizontal(sessionName, 100 - DIFF_PANE_WIDTH);

  // Resize to exact width
  tmux.resizePane(paneId, DIFF_PANE_WIDTH);

  return paneId;
}

/**
 * Start the diff handler process in a pane
 * Note: We start without initial files - send RENDER command after handler starts
 */
export function startDiffHandler(
  diffPaneId: string,
  sidebarPaneId: string,
  sessionId: string,
  worktreePath: string,
  initialFiles?: DiffFileSummary[]
): void {
  // Get path to diff-handler - check for .ts first (dev mode), then .js (compiled)
  const tsPath = resolve(__dirname, 'diff-handler.ts');
  const jsPath = resolve(__dirname, 'diff-handler.js');

  let cmd: string;
  const escapedPath = worktreePath.replace(/'/g, "'\\''");

  // Start without initial state to avoid long command line issues
  const args = `"${sidebarPaneId}" "${sessionId}" '${escapedPath}'`;

  // Check which file exists
  if (existsSync(tsPath)) {
    cmd = `npx tsx "${tsPath}" ${args}`;
  } else if (existsSync(jsPath)) {
    cmd = `node "${jsPath}" ${args}`;
  } else {
    console.error('diff-handler not found at', tsPath, 'or', jsPath);
    return;
  }

  tmux.sendKeys(diffPaneId, cmd, true);

  // Send initial files after a short delay for handler to start
  if (initialFiles && initialFiles.length > 0) {
    setTimeout(() => {
      updateDiffPane(diffPaneId, initialFiles);
    }, 500);
  }
}

/**
 * Send updated file list to the diff handler
 */
export function updateDiffPane(diffPaneId: string, files: DiffFileSummary[]): void {
  const renderData = JSON.stringify({ files });
  // Send render command to diff handler
  tmux.sendKeys(diffPaneId, `RENDER:${renderData}`, false);
}

/**
 * Close the diff pane
 */
export function closeDiffPane(diffPaneId: string): void {
  try {
    tmux.killPane(diffPaneId);
  } catch {
    // Pane may already be closed
  }
}

/**
 * Break the diff pane to background (for session switching or fullscreen)
 */
export function breakDiffPane(diffPaneId: string): void {
  try {
    tmux.breakPane(diffPaneId);
  } catch {
    // Pane may not exist
  }
}

/**
 * Join the diff pane back (after session switching or fullscreen)
 */
export function joinDiffPane(diffPaneId: string, claudePaneId: string): void {
  try {
    // Join to the right of Claude pane
    tmux.joinPane(diffPaneId, claudePaneId, true);
    // Resize to correct width
    tmux.resizePane(diffPaneId, DIFF_PANE_WIDTH);
  } catch {
    // Pane may not exist
  }
}

// ============================================================================
// File Diff Header Pane Operations
// ============================================================================

/**
 * Create the file diff content pane (fills Claude pane's space)
 * Returns the content pane ID
 */
export function createFileDiffContentPane(sessionName: string, sidebarPaneId: string): string {
  // Split from sidebar to create a new pane to the right (fills available space)
  tmux.selectPane(sidebarPaneId);
  const contentPaneId = tmux.splitHorizontal(sessionName, 20);  // sidebar keeps 20%, content gets 80%
  return contentPaneId;
}

/**
 * Create the file diff header pane (1-row above content pane)
 * Returns the header pane ID
 */
export function createFileDiffHeaderPane(sessionName: string, contentPaneId: string): string {
  // Select the content pane and split at top for header
  tmux.selectPane(contentPaneId);
  // Split vertically - header gets 1 row at top
  const headerPaneId = tmux.splitVertical(sessionName, 95);  // content keeps 95%, header gets 5%

  // The splitVertical creates new pane BELOW, we need to swap them
  // Actually, split creates pane below, so headerPaneId is below contentPaneId
  // We need to resize the headerPaneId to 1 row (it's at the bottom after split)
  // Actually we want header at top, so let's split differently

  // Let's resize the new pane (which is at bottom) to take most height
  // Then swap so header is at top
  tmux.swapPanes(contentPaneId, headerPaneId);

  // Now resize the header (which is now at top) to 1 row
  tmux.resizePane(contentPaneId, undefined, FILE_HEADER_HEIGHT);

  // Wait, this is getting confusing. Let me think again...
  // Actually after split -v, the NEW pane is created below the current pane
  // So if contentPaneId was selected, the new pane (headerPaneId) is below it
  // We want header above content, so swap them
  // After swap, contentPaneId is below, headerPaneId is above
  // But the IDs don't change - contentPaneId is now the bottom pane (content)
  // and headerPaneId is now the top pane (header)
  // So we resize headerPaneId to 1 row

  tmux.resizePane(headerPaneId, undefined, FILE_HEADER_HEIGHT);

  return headerPaneId;
}

/**
 * Start the file diff header handler in a pane
 */
export function startFileDiffHeaderHandler(
  headerPaneId: string,
  sidebarPaneId: string,
  filename: string,
  insertions: number,
  deletions: number,
  mode: DiffViewMode = 'whole-file'
): void {
  // Get path to file-diff-header-handler
  const tsPath = resolve(__dirname, 'file-diff-header-handler.ts');
  const jsPath = resolve(__dirname, 'file-diff-header-handler.js');

  let cmd: string;
  const escapedFilename = filename.replace(/'/g, "'\\''");
  const args = `"${sidebarPaneId}" '${escapedFilename}' ${insertions} ${deletions} ${mode}`;

  // Check which file exists
  if (existsSync(tsPath)) {
    cmd = `npx tsx "${tsPath}" ${args}`;
  } else if (existsSync(jsPath)) {
    cmd = `node "${jsPath}" ${args}`;
  } else {
    console.error('file-diff-header-handler not found at', tsPath, 'or', jsPath);
    return;
  }

  tmux.sendKeys(headerPaneId, cmd, true);
}

/**
 * Close the file diff header pane
 */
export function closeFileDiffHeaderPane(headerPaneId: string): void {
  try {
    tmux.killPane(headerPaneId);
  } catch {
    // Pane may already be closed
  }
}

/**
 * Close the file diff content pane
 */
export function closeFileDiffContentPane(contentPaneId: string): void {
  try {
    tmux.killPane(contentPaneId);
  } catch {
    // Pane may already be closed
  }
}

/**
 * Start the file diff content handler in a pane
 * This streams the full file with inline diffs and handles Esc to close
 */
export function startFileDiffContentHandler(
  contentPaneId: string,
  sidebarPaneId: string,
  repoPath: string,
  filename: string,
  mode: DiffViewMode = 'whole-file'
): void {
  // Get path to file-diff-content-handler
  const tsPath = resolve(__dirname, 'file-diff-content-handler.ts');
  const jsPath = resolve(__dirname, 'file-diff-content-handler.js');

  let handlerCmd: string;
  const escapedPath = repoPath.replace(/'/g, "'\\''");
  const escapedFilename = filename.replace(/'/g, "'\\''");
  const args = `"${sidebarPaneId}" '${escapedPath}' '${escapedFilename}' ${mode}`;

  // Check which file exists
  if (existsSync(tsPath)) {
    handlerCmd = `npx tsx "${tsPath}" ${args}`;
  } else if (existsSync(jsPath)) {
    handlerCmd = `node "${jsPath}" ${args}`;
  } else {
    console.error('file-diff-content-handler not found at', tsPath, 'or', jsPath);
    return;
  }

  // Use respawnPane to run command directly without shell echo
  // This prevents the command from being visible in the terminal
  tmux.respawnPane(contentPaneId, handlerCmd);
}
