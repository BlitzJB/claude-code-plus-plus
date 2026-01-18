#!/usr/bin/env node
/**
 * File Diff Content Handler
 *
 * Process that runs in the file diff content pane.
 * - Prints file content based on view mode (full file with inline diffs or diffs only)
 * - Uses native tmux scrollback (mouse scroll works)
 * - Handles Esc key to close (sends FILEDIFF:close to sidebar)
 *
 * Communication:
 * - Sends actions to sidebar via tmux send-keys
 *
 * Usage: node file-diff-content-handler.js <sidebarPaneId> <repoPath> <filename> [mode]
 */

import { execSync } from 'child_process';
import { ansi } from '../ansi';
import { getFullFileWithInlineDiff, getDiffsOnlyView } from './git-diff';
import type { DiffViewMode } from '../types';

// ============================================================================
// State
// ============================================================================

interface ContentState {
  sidebarPaneId: string;
  repoPath: string;
  filename: string;
  mode: DiffViewMode;
}

let state: ContentState = {
  sidebarPaneId: '',
  repoPath: '',
  filename: '',
  mode: 'whole-file',
};

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
// Content Display
// ============================================================================

/**
 * Print file content to terminal
 * Content goes into tmux scrollback buffer for native mouse scrolling
 */
async function printContent(): Promise<void> {
  // Clear screen and move to top before printing
  process.stdout.write('\x1b[2J\x1b[H');

  try {
    let content: string;
    if (state.mode === 'diffs-only') {
      content = await getDiffsOnlyView(state.repoPath, state.filename);
    } else {
      content = await getFullFileWithInlineDiff(state.repoPath, state.filename);
    }
    process.stdout.write(content);
    process.stdout.write('\n');  // Ensure final newline
  } catch (err) {
    process.stdout.write(`Error loading file: ${state.filename}\n`);
    process.stdout.write(`${err}\n`);
  }

  // Content is now in tmux scrollback - user can scroll with mouse
}

// ============================================================================
// Input Handling
// ============================================================================

function handleInput(data: Buffer): void {
  const input = data.toString();

  // Escape: close file diff view (single Esc byte)
  if (input === '\x1b' && data.length === 1) {
    sendToSidebar('close');
    return;
  }

  // q: also close
  if (input === 'q') {
    sendToSidebar('close');
    return;
  }

  // All other input (scrolling) is handled by tmux mouse bindings
}

// ============================================================================
// Lifecycle
// ============================================================================

async function start(): Promise<void> {
  // Hide cursor
  process.stdout.write(ansi.hideCursor);

  // Set up raw mode for input (to capture Esc key)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', handleInput);

  // Print content (goes into tmux scrollback)
  await printContent();
}

function stop(): void {
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
    console.error('Usage: file-diff-content-handler <sidebarPaneId> <repoPath> <filename> [mode]');
    process.exit(1);
  }

  state.sidebarPaneId = args[0];
  state.repoPath = args[1];
  state.filename = args[2];
  state.mode = (args[3] as DiffViewMode) || 'whole-file';

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });

  await start();
}

main().catch((err) => {
  console.error('File diff content handler error:', err);
  process.exit(1);
});
