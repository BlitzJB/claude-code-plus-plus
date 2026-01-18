#!/usr/bin/env node
/**
 * File Diff Header Handler
 *
 * Lightweight process that runs in the 1-row header pane above the file diff content.
 * Shows "Back to Claude" and filename, handles Escape/Enter/Click to close.
 * Also handles view mode toggle buttons ([Diffs] / [Full]).
 *
 * Communication:
 * - Receives render data from sidebar via stdin
 * - Sends actions to sidebar via tmux send-keys
 *
 * Usage: node file-diff-header-handler.js <sidebarPaneId> <filename> <insertions> <deletions> <mode>
 */

import { execSync } from 'child_process';
import { renderFileHeader, type ButtonPositions } from './file-diff-header-render';
import { ansi } from '../ansi';
import type { DiffViewMode } from '../types';

// ============================================================================
// State
// ============================================================================

interface HeaderState {
  sidebarPaneId: string;
  filename: string;
  insertions: number;
  deletions: number;
  mode: DiffViewMode;
  buttonPositions: ButtonPositions;
}

let state: HeaderState = {
  sidebarPaneId: '',
  filename: '',
  insertions: 0,
  deletions: 0,
  mode: 'whole-file',
  buttonPositions: {
    diffsOnly: [0, 0],
    wholeFile: [0, 0],
  },
};

let running = false;

// ============================================================================
// Communication with Sidebar
// ============================================================================

/**
 * Send a command to the sidebar via tmux send-keys
 * Protocol: Ctrl+U followed by "FILEDIFF:<action>" then Enter
 */
function sendToSidebar(action: string): void {
  try {
    // Send Ctrl+U to clear any existing input and enter command mode
    execSync(`tmux send-keys -t ${state.sidebarPaneId} C-u`, { stdio: 'ignore' });
    // Send the command
    const cmd = `FILEDIFF:${action}`;
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
  const width = process.stdout.columns || 80;
  const result = renderFileHeader(
    state.filename,
    state.insertions,
    state.deletions,
    width,
    state.mode
  );
  state.buttonPositions = result.buttonPositions;
  process.stdout.write(result.output);
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
      state.filename = renderData.filename || state.filename;
      state.insertions = renderData.insertions ?? state.insertions;
      state.deletions = renderData.deletions ?? state.deletions;
      if (renderData.mode) {
        state.mode = renderData.mode;
      }
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
    const isRelease = mouseMatch[4] === 'm';

    // Only handle left click release
    if (button === 0 && isRelease) {
      // Check if click is on "← Back" button (first ~10 columns)
      if (col <= 10) {
        sendToSidebar('close');
        return;
      }

      // Check if click is on [Diffs] button
      const [diffsStart, diffsEnd] = state.buttonPositions.diffsOnly;
      if (col >= diffsStart && col <= diffsEnd) {
        sendToSidebar('mode:diffs-only');
        return;
      }

      // Check if click is on [Full] button
      const [fullStart, fullEnd] = state.buttonPositions.wholeFile;
      if (col >= fullStart && col <= fullEnd) {
        sendToSidebar('mode:whole-file');
        return;
      }
    }
    return;
  }

  // Handle keyboard input
  const key = input;

  // Escape: close file diff view
  if (key === '\x1b' && input.length === 1) {
    sendToSidebar('close');
    return;
  }

  // Enter/Backspace: also close
  if (key === '\r' || key === '\x7f') {
    sendToSidebar('close');
    return;
  }

  // q: close
  if (key === 'q') {
    sendToSidebar('close');
    return;
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

  if (args.length < 4) {
    console.error('Usage: file-diff-header-handler <sidebarPaneId> <filename> <insertions> <deletions> [mode]');
    process.exit(1);
  }

  state.sidebarPaneId = args[0];
  state.filename = args[1];
  state.insertions = parseInt(args[2], 10) || 0;
  state.deletions = parseInt(args[3], 10) || 0;
  state.mode = (args[4] as DiffViewMode) || 'whole-file';

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
  console.error('File diff header handler error:', err);
  process.exit(1);
});
