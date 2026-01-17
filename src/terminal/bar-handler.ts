#!/usr/bin/env node
/**
 * Terminal Bar Handler
 *
 * Lightweight process that runs in the 1-row terminal bar pane.
 * Handles mouse clicks and keyboard input, sending commands to the sidebar.
 *
 * Communication:
 * - Receives render data from sidebar via environment or stdin
 * - Sends actions to sidebar via tmux send-keys
 *
 * Usage: node bar-handler.js <sidebarPaneId> <sessionId>
 */

import { execSync } from 'child_process';
import { renderTerminalBar, findClickedTab, type TabPosition } from './bar-render';
import type { Terminal } from '../types';

// ============================================================================
// ANSI Escape Codes
// ============================================================================

const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  clearScreen: `${CSI}2J`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  reset: `${CSI}0m`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  enableMouse: `${CSI}?1000h${CSI}?1006h`,
  disableMouse: `${CSI}?1000l${CSI}?1006l`,
};

// ============================================================================
// State
// ============================================================================

interface BarState {
  sidebarPaneId: string;
  sessionId: string;
  terminals: Terminal[];
  activeIndex: number;
  tabPositions: TabPosition[];
}

let state: BarState = {
  sidebarPaneId: '',
  sessionId: '',
  terminals: [],
  activeIndex: 0,
  tabPositions: [],
};

let running = false;

// ============================================================================
// Communication with Sidebar
// ============================================================================

/**
 * Send a command to the sidebar via tmux send-keys
 * Protocol: Ctrl+U followed by "TERM:<action>:<data>" then Enter
 */
function sendToSidebar(action: string, data: string = ''): void {
  try {
    // Send Ctrl+U to clear any existing input and enter terminal command mode
    execSync(`tmux send-keys -t ${state.sidebarPaneId} C-u`, { stdio: 'ignore' });
    // Send the command
    const cmd = data ? `TERM:${action}:${data}` : `TERM:${action}`;
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
  const { output, tabPositions } = renderTerminalBar(
    state.terminals,
    state.activeIndex,
    width
  );
  state.tabPositions = tabPositions;
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
      state.terminals = renderData.terminals || [];
      state.activeIndex = renderData.activeIndex || 0;
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

    // Handle left click release on row 1
    if (button === 0 && isRelease && row === 1) {
      handleTabClick(col);
    }
    return;
  }

  // Handle keyboard input
  const key = input;

  // Number keys 1-9: switch to tab
  if (key >= '1' && key <= '9') {
    const tabIndex = parseInt(key, 10) - 1;
    if (tabIndex < state.terminals.length) {
      sendToSidebar('switch', String(tabIndex));
    }
    return;
  }

  // Tab: cycle forward
  if (key === '\t') {
    cycleTab(1);
    return;
  }

  // Shift+Tab: cycle backward
  if (key === '\x1b[Z') {
    cycleTab(-1);
    return;
  }

  // h or left arrow: previous
  if (key === 'h' || key === '\x1b[D') {
    cycleTab(-1);
    return;
  }

  // l or right arrow: next
  if (key === 'l' || key === '\x1b[C') {
    cycleTab(1);
    return;
  }

  // n or c: new terminal
  if (key === 'n' || key === 'c') {
    sendToSidebar('new');
    return;
  }

  // d: delete current terminal
  if (key === 'd') {
    if (state.terminals.length > 0) {
      sendToSidebar('delete', String(state.activeIndex));
    }
    return;
  }

  // Enter: focus the terminal pane
  if (key === '\r') {
    sendToSidebar('focus');
    return;
  }

  // Escape: focus sidebar
  if (key === '\x1b' && input.length === 1) {
    sendToSidebar('escape');
    return;
  }
}

function handleTabClick(col: number): void {
  const clickedIndex = findClickedTab(col, state.tabPositions);
  if (clickedIndex === null) return;

  if (clickedIndex === -1) {
    // Clicked [+] button
    sendToSidebar('new');
  } else if (clickedIndex !== state.activeIndex) {
    // Clicked a different tab
    sendToSidebar('switch', String(clickedIndex));
  }
}

function cycleTab(direction: number): void {
  if (state.terminals.length === 0) return;

  const newIndex = state.activeIndex + direction;
  if (newIndex >= 0 && newIndex < state.terminals.length) {
    sendToSidebar('switch', String(newIndex));
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

  if (args.length < 2) {
    console.error('Usage: bar-handler <sidebarPaneId> <sessionId>');
    process.exit(1);
  }

  state.sidebarPaneId = args[0];
  state.sessionId = args[1];

  // Parse initial state from remaining args or stdin
  if (args[2]) {
    try {
      const initialData = JSON.parse(args[2]);
      state.terminals = initialData.terminals || [];
      state.activeIndex = initialData.activeIndex || 0;
    } catch (err) {
      // Invalid initial data
    }
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
  console.error('Terminal bar handler error:', err);
  process.exit(1);
});
