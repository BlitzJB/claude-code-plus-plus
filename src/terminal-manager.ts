#!/usr/bin/env node
/**
 * Terminal Manager - Tab UI for terminal panes
 *
 * Runs in a small horizontal pane above the terminal area.
 * Shows tabs for each terminal, allows switching between them.
 *
 * Layout:
 * ┌──────────────────────────────────────┐
 * │ [Terminal 1] [Terminal 2] [Term...] │  <- This pane (3 rows)
 * ├──────────────────────────────────────┤
 * │ Active terminal content              │  <- One terminal visible
 * └──────────────────────────────────────┘
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, watchFile, unwatchFile } from 'fs';

// ANSI escape codes
const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  clearScreen: `${CSI}2J`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  inverse: `${CSI}7m`,
  fg: {
    black: `${CSI}30m`,
    red: `${CSI}31m`,
    green: `${CSI}32m`,
    yellow: `${CSI}33m`,
    blue: `${CSI}34m`,
    magenta: `${CSI}35m`,
    cyan: `${CSI}36m`,
    white: `${CSI}37m`,
    gray: `${CSI}90m`,
  },
  bg: {
    black: `${CSI}40m`,
    red: `${CSI}41m`,
    green: `${CSI}42m`,
    yellow: `${CSI}43m`,
    blue: `${CSI}44m`,
    magenta: `${CSI}45m`,
    cyan: `${CSI}46m`,
    white: `${CSI}47m`,
    gray: `${CSI}100m`,
  },
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  // Mouse support
  enableMouse: `${CSI}?1000h${CSI}?1006h`, // Enable mouse tracking + SGR extended mode
  disableMouse: `${CSI}?1000l${CSI}?1006l`,
};

interface TabPosition {
  index: number;
  startCol: number;
  endCol: number;
}

interface TerminalInfo {
  id: string;
  title: string;
}

interface TerminalManagerState {
  sessionId: string;
  worktreePath: string;
  tmuxSession: string;
  sidebarPaneId: string;
  terminalManagerPaneId: string;
  terminals: TerminalInfo[];
  activeIndex: number;
}

class TerminalManager {
  private stateFile: string;
  private state: TerminalManagerState | null = null;
  private running: boolean = false;
  private tabPositions: TabPosition[] = [];

  constructor(stateFile: string) {
    this.stateFile = stateFile;
  }

  private loadState(): boolean {
    try {
      if (!existsSync(this.stateFile)) {
        return false;
      }
      const data = readFileSync(this.stateFile, 'utf-8');
      this.state = JSON.parse(data);
      return true;
    } catch (err) {
      return false;
    }
  }

  private saveState(): void {
    if (!this.state) return;
    try {
      writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (err) {
      // Failed to save state
    }
  }

  start(): void {
    // Initial state load
    if (!this.loadState()) {
      console.error('Failed to load state file');
      process.exit(1);
    }

    this.running = true;

    // Set up terminal
    process.stdout.write(ansi.hideCursor);
    process.stdout.write(ansi.enableMouse);

    // Set up raw mode for input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    // Use raw data handler for both keyboard and mouse
    process.stdin.on('data', this.handleInput.bind(this));

    // Watch state file for changes
    watchFile(this.stateFile, { interval: 100 }, () => {
      this.loadState();
      this.render();
    });

    // Handle resize
    process.stdout.on('resize', () => {
      this.render();
    });

    // Initial render
    this.render();
  }

  stop(): void {
    this.running = false;
    unwatchFile(this.stateFile);
    process.stdout.write(ansi.disableMouse);
    process.stdout.write(ansi.showCursor);
    process.stdout.write(ansi.reset);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  private handleInput(data: Buffer): void {
    if (!this.state) return;

    const input = data.toString();

    // Check for SGR mouse events: \x1b[<button;col;rowM or \x1b[<button;col;rowm
    // Button 0 = left click press, lowercase 'm' = release
    const mouseMatch = input.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (mouseMatch) {
      const button = parseInt(mouseMatch[1], 10);
      const col = parseInt(mouseMatch[2], 10);
      const row = parseInt(mouseMatch[3], 10);
      const isRelease = mouseMatch[4] === 'm';

      // Handle left click release (button 0)
      if (button === 0 && isRelease && row === 1) {
        this.handleTabClick(col);
      }
      return;
    }

    // Handle keyboard input
    const key = input;

    // Number keys 1-9 to switch directly to tab
    if (key >= '1' && key <= '9') {
      const tabIndex = parseInt(key, 10) - 1;
      if (tabIndex < this.state.terminals.length) {
        this.switchToTab(tabIndex);
      }
      return;
    }

    // Tab key to cycle forward
    if (key === '\t') {
      this.switchTab(1);
      return;
    }

    // Shift+Tab (backtab) to cycle backward - comes as \x1b[Z
    if (key === '\x1b[Z') {
      this.switchTab(-1);
      return;
    }

    // 'h' or left arrow - move left
    if (key === 'h' || key === '\x1b[D' || key === '\x1bOD') {
      this.switchTab(-1);
      return;
    }

    // 'l' or right arrow - move right
    if (key === 'l' || key === '\x1b[C' || key === '\x1bOC') {
      this.switchTab(1);
      return;
    }

    // Enter - focus the terminal pane
    if (key === '\r') {
      this.focusActiveTerminal();
      return;
    }

    // 'd' - delete current terminal
    if (key === 'd') {
      this.deleteCurrentTerminal();
      return;
    }

    // 'c' or 'n' - create new terminal
    if (key === 'c' || key === 'n') {
      this.requestNewTerminal();
      return;
    }

    // Ignore Ctrl+C
    if (key === '\x03') {
      return;
    }
  }

  private handleTabClick(col: number): void {
    // Find which tab was clicked based on column position
    for (const tab of this.tabPositions) {
      if (col >= tab.startCol && col <= tab.endCol) {
        if (tab.index !== this.state?.activeIndex) {
          this.switchToTab(tab.index);
        }
        return;
      }
    }
  }

  private switchToTab(targetIndex: number): void {
    if (!this.state || targetIndex < 0 || targetIndex >= this.state.terminals.length) return;
    if (targetIndex === this.state.activeIndex) return;

    // Notify sidebar to handle the switch - sidebar will do the pane manipulation
    // and update the state file, which we'll pick up via file watch
    this.notifySidebar('switch', targetIndex);
  }

  private switchTab(direction: number): void {
    if (!this.state || this.state.terminals.length === 0) return;

    const newIndex = this.state.activeIndex + direction;

    // Bounds check
    if (newIndex < 0 || newIndex >= this.state.terminals.length) {
      return;
    }

    const currentTerminal = this.state.terminals[this.state.activeIndex];
    const newTerminal = this.state.terminals[newIndex];

    // Swap panes: break current, join new
    try {
      // Break current terminal to background
      execSync(`tmux break-pane -d -t ${currentTerminal.id}`, { stdio: 'ignore' });

      // Join new terminal below the manager pane
      execSync(`tmux join-pane -v -t ${this.state.terminalManagerPaneId} -s ${newTerminal.id}`, { stdio: 'ignore' });

      // Update state and save to file
      this.state.activeIndex = newIndex;
      this.saveState();

      // Notify sidebar of the change
      this.notifySidebar('switch', newIndex);

      this.render();
    } catch (err) {
      // Swap failed, try to recover
    }
  }

  private focusActiveTerminal(): void {
    if (!this.state || this.state.terminals.length === 0) return;

    const activeTerminal = this.state.terminals[this.state.activeIndex];
    try {
      execSync(`tmux select-pane -t ${activeTerminal.id}`, { stdio: 'ignore' });
    } catch (err) {
      // Focus failed
    }
  }

  private deleteCurrentTerminal(): void {
    if (!this.state || this.state.terminals.length === 0) return;

    const terminalToDelete = this.state.terminals[this.state.activeIndex];

    // Notify sidebar to handle deletion
    this.notifySidebar('delete', this.state.activeIndex);
  }

  private requestNewTerminal(): void {
    if (!this.state) return;

    // Send Ctrl+T to sidebar to create new terminal
    try {
      execSync(`tmux send-keys -t ${this.state.sidebarPaneId} C-t`, { stdio: 'ignore' });
    } catch (err) {
      // Failed to send
    }
  }

  private notifySidebar(action: 'switch' | 'delete', index: number): void {
    if (!this.state) return;

    // Send special key sequence to sidebar
    // Format: Ctrl+U followed by action code, space, and index, then Enter
    const actionCode = action === 'switch' ? 'S' : 'D';
    try {
      // Use -l (literal) flag to send the command string as-is
      execSync(`tmux send-keys -t ${this.state.sidebarPaneId} C-u`, { stdio: 'ignore' });
      execSync(`tmux send-keys -t ${this.state.sidebarPaneId} -l "${actionCode} ${index}"`, { stdio: 'ignore' });
      execSync(`tmux send-keys -t ${this.state.sidebarPaneId} Enter`, { stdio: 'ignore' });
    } catch (err) {
      // Failed to notify
    }
  }

  private render(): void {
    if (!this.state) return;

    const cols = process.stdout.columns || 80;

    let output = ansi.clearScreen;
    output += ansi.moveTo(1, 1);

    // Clear tab positions
    this.tabPositions = [];

    const hints = 'click/1-9:switch ↵:focus n:new d:del';
    const hintsLen = hints.length;

    if (this.state.terminals.length === 0) {
      // No terminals message on left, hints on right
      const msg = "No terminals. Press 'n' to create.";
      const padding = cols - msg.length - hintsLen - 2;
      output += `${ansi.dim}${msg}${' '.repeat(Math.max(1, padding))}${hints}${ansi.reset}`;
    } else {
      // Build tabs and track positions
      let tabLine = '';
      let currentCol = 1; // 1-indexed column position

      for (let i = 0; i < this.state.terminals.length; i++) {
        const term = this.state.terminals[i];
        const isActive = i === this.state.activeIndex;
        const tabNum = i + 1; // 1-indexed for display

        // Calculate available space for tabs (leave room for hints)
        const availableForTabs = cols - hintsLen - 4;
        const maxTitleLen = Math.max(4, Math.floor(availableForTabs / this.state.terminals.length) - 5);

        // Truncate title if needed
        let title = term.title;
        if (title.length > maxTitleLen) {
          title = title.slice(0, maxTitleLen - 2) + '..';
        }

        // Show tab number for quick switching (only for tabs 1-9)
        const tabText = tabNum <= 9 ? ` ${tabNum}:${title} ` : ` ${title} `;

        // Record tab position for click handling
        this.tabPositions.push({
          index: i,
          startCol: currentCol,
          endCol: currentCol + tabText.length - 1,
        });

        currentCol += tabText.length;

        if (isActive) {
          tabLine += `${ansi.bg.cyan}${ansi.fg.black}${ansi.bold}${tabText}${ansi.reset}`;
        } else {
          tabLine += `${ansi.dim}${tabText}${ansi.reset}`;
        }

        // Add separator
        if (i < this.state.terminals.length - 1) {
          tabLine += `${ansi.fg.gray}│${ansi.reset}`;
          currentCol += 1;
        }
      }

      // Calculate padding between tabs and hints
      const tabsWidth = currentCol - 1;
      const padding = cols - tabsWidth - hintsLen - 1;
      output += tabLine;
      output += ' '.repeat(Math.max(1, padding));
      output += `${ansi.dim}${hints}${ansi.reset}`;
    }

    process.stdout.write(output);
  }
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: terminal-manager <stateFile>');
    process.exit(1);
  }

  const stateFile = args[0];

  const manager = new TerminalManager(stateFile);
  manager.start();
}

main().catch((err) => {
  console.error('Terminal manager error:', err);
  process.exit(1);
});
