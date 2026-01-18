#!/usr/bin/env node
/**
 * Diff Pane Handler
 *
 * Lightweight process that runs in the right diff pane.
 * Shows the list of changed files and sends view commands to the sidebar.
 *
 * Communication:
 * - Receives render data from sidebar via stdin
 * - Sends actions to sidebar via tmux send-keys
 *
 * Usage: node diff-handler.js <sidebarPaneId> <sessionId> <worktreePath>
 */

import { execSync } from 'child_process';
import { renderDiffPane, findClickedFile, type FilePosition } from './diff-pane-render';
import { getDiffSummary, type DiffFileSummary } from './git-diff';
import { ansi } from '../ansi';

// ============================================================================
// State
// ============================================================================

interface DiffPaneState {
  sidebarPaneId: string;
  sessionId: string;
  worktreePath: string;
  files: DiffFileSummary[];
  selectedIndex: number;
  filePositions: FilePosition[];
}

let state: DiffPaneState = {
  sidebarPaneId: '',
  sessionId: '',
  worktreePath: '',
  files: [],
  selectedIndex: 0,
  filePositions: [],
};

let running = false;

// ============================================================================
// Communication with Sidebar
// ============================================================================

/**
 * Send a command to the sidebar via tmux send-keys
 * Protocol: Ctrl+U followed by "DIFF:<action>:<data>" then Enter
 */
function sendToSidebar(action: string, data: string = ''): void {
  try {
    // Send Ctrl+U to clear any existing input and enter command mode
    execSync(`tmux send-keys -t ${state.sidebarPaneId} C-u`, { stdio: 'ignore' });
    // Send the command
    const cmd = data ? `DIFF:${action}:${data}` : `DIFF:${action}`;
    execSync(`tmux send-keys -t ${state.sidebarPaneId} -l "${cmd}"`, { stdio: 'ignore' });
    // Send Enter to execute
    execSync(`tmux send-keys -t ${state.sidebarPaneId} Enter`, { stdio: 'ignore' });
  } catch (err) {
    // Failed to send - sidebar may have exited
  }
}

// ============================================================================
// Rendering
// ============================================================================

function render(): void {
  const width = process.stdout.columns || 30;
  const height = process.stdout.rows || 24;

  const { output, filePositions } = renderDiffPane(
    state.files,
    state.selectedIndex,
    width,
    height
  );
  state.filePositions = filePositions;
  process.stdout.write(output);
}

// ============================================================================
// Input Handling
// ============================================================================

function handleInput(data: Buffer): void {
  const input = data.toString();

  // Check for render command from sidebar: "RENDER:<json>"
  if (input.startsWith('RENDER:')) {
    try {
      const json = input.slice(7).trim();
      const renderData = JSON.parse(json);
      state.files = renderData.files || [];
      state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, state.files.length - 1));
      render();
    } catch (err) {
      // Invalid render data
    }
    return;
  }

  // Check for SGR mouse events: \x1b[<button;col;rowM or \x1b[<button;col;rowm
  const mouseMatch = input.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (mouseMatch) {
    const button = parseInt(mouseMatch[1], 10);
    const col = parseInt(mouseMatch[2], 10);
    const row = parseInt(mouseMatch[3], 10);
    const isRelease = mouseMatch[4] === 'm';

    // Handle left click release
    if (button === 0 && isRelease) {
      handleClick(row);
    }
    return;
  }

  // Handle keyboard input
  const key = input;

  // Up/k: move selection up
  if (key === '\x1b[A' || key === 'k') {
    if (state.selectedIndex > 0) {
      state.selectedIndex--;
      render();
    }
    return;
  }

  // Down/j: move selection down
  if (key === '\x1b[B' || key === 'j') {
    if (state.selectedIndex < state.files.length - 1) {
      state.selectedIndex++;
      render();
    }
    return;
  }

  // g: go to top
  if (key === 'g') {
    state.selectedIndex = 0;
    render();
    return;
  }

  // G: go to bottom
  if (key === 'G') {
    state.selectedIndex = Math.max(0, state.files.length - 1);
    render();
    return;
  }

  // Enter: view selected file diff
  if (key === '\r') {
    viewSelectedFile();
    return;
  }

  // Escape/q: close diff pane
  if (key === '\x1b' && input.length === 1 || key === 'q') {
    sendToSidebar('close');
    return;
  }

  // r: refresh
  if (key === 'r') {
    sendToSidebar('refresh');
    return;
  }
}

function handleClick(row: number): void {
  const clickedIndex = findClickedFile(row, state.filePositions);
  if (clickedIndex === null) return;

  if (clickedIndex === state.selectedIndex) {
    // Double-click on already selected - view file
    viewSelectedFile();
  } else {
    // Select the clicked file
    state.selectedIndex = clickedIndex;
    render();
  }
}

function viewSelectedFile(): void {
  if (state.files.length === 0) return;

  const file = state.files[state.selectedIndex];
  if (file) {
    // Escape the filename for shell
    const escapedFile = file.file.replace(/"/g, '\\"');
    sendToSidebar('viewfile', escapedFile);
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

function start(): void {
  running = true;

  // Set up terminal
  process.stdout.write(ansi.hideCursor);
  process.stdout.write(ansi.enableMouse);

  // Set up raw mode for input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', handleInput);

  // Handle resize
  process.stdout.on('resize', () => {
    render();
  });

  // Initial render
  render();
}

function stop(): void {
  running = false;
  process.stdout.write(ansi.disableMouse);
  process.stdout.write(ansi.showCursor);
  process.stdout.write(ansi.reset);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: diff-handler <sidebarPaneId> <sessionId> <worktreePath>');
    process.exit(1);
  }

  state.sidebarPaneId = args[0];
  state.sessionId = args[1];
  state.worktreePath = args[2];

  // Parse initial state from remaining args
  if (args[3]) {
    try {
      const initialData = JSON.parse(args[3]);
      state.files = initialData.files || [];
    } catch (err) {
      // Invalid initial data - fetch fresh
      state.files = await getDiffSummary(state.worktreePath);
    }
  } else {
    // Fetch initial diff data
    state.files = await getDiffSummary(state.worktreePath);
  }

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });

  start();
}

main().catch((err) => {
  console.error('Diff handler error:', err);
  process.exit(1);
});
