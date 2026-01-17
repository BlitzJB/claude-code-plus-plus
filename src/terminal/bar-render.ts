/**
 * Terminal Bar Rendering
 *
 * Pure functions for rendering the terminal tab bar with ANSI codes.
 * The tab bar is a single row showing terminal tabs with keyboard hints on the right.
 */

import type { Terminal } from '../types';

// ============================================================================
// ANSI Escape Codes
// ============================================================================

const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  clearLine: `${CSI}2K`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  fg: {
    black: `${CSI}30m`,
    white: `${CSI}37m`,
    gray: `${CSI}90m`,
    cyan: `${CSI}36m`,
  },
  bg: {
    cyan: `${CSI}46m`,
  },
  hideCursor: `${CSI}?25l`,
};

// ============================================================================
// Types
// ============================================================================

export interface TabPosition {
  index: number;
  startCol: number;
  endCol: number;
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Render the terminal tab bar as a single row
 *
 * @param terminals - Array of terminals
 * @param activeIndex - Index of the active terminal
 * @param width - Available width in columns
 * @returns Object with ANSI output string and tab positions for click handling
 */
export function renderTerminalBar(
  terminals: Terminal[],
  activeIndex: number,
  width: number
): { output: string; tabPositions: TabPosition[] } {
  const tabPositions: TabPosition[] = [];

  // Hints shown on the right
  const hints = '1-9:switch n:new d:del';
  const hintsLen = hints.length;

  let output = ansi.hideCursor + ansi.clearLine + ansi.moveTo(1, 1);

  if (terminals.length === 0) {
    // No terminals message
    const msg = "No terminals. Press 'n' to create.";
    const padding = Math.max(1, width - msg.length - hintsLen - 2);
    output += `${ansi.dim}${msg}${ansi.reset}`;
    output += ' '.repeat(padding);
    output += `${ansi.dim}${hints}${ansi.reset}`;
    return { output, tabPositions };
  }

  // Calculate available space for tabs
  const availableForTabs = width - hintsLen - 4;
  const maxTabWidth = Math.max(8, Math.floor(availableForTabs / terminals.length) - 1);

  let currentCol = 1;

  for (let i = 0; i < terminals.length; i++) {
    const terminal = terminals[i];
    const isActive = i === activeIndex;
    const tabNum = i + 1;

    // Truncate title if needed
    let title = terminal.title;
    const maxTitleLen = maxTabWidth - 4; // Room for " N: " prefix
    if (title.length > maxTitleLen) {
      title = title.slice(0, maxTitleLen - 2) + '..';
    }

    // Tab text: " 1:Title " (only show number for 1-9)
    const tabText = tabNum <= 9 ? ` ${tabNum}:${title} ` : ` ${title} `;

    // Track tab position for click handling
    tabPositions.push({
      index: i,
      startCol: currentCol,
      endCol: currentCol + tabText.length - 1,
    });

    // Render tab
    if (isActive) {
      output += `${ansi.bg.cyan}${ansi.fg.black}${ansi.bold}${tabText}${ansi.reset}`;
    } else {
      output += `${ansi.dim}${tabText}${ansi.reset}`;
    }

    currentCol += tabText.length;

    // Add separator between tabs
    if (i < terminals.length - 1) {
      output += `${ansi.fg.gray}|${ansi.reset}`;
      currentCol += 1;
    }
  }

  // Add [+] button for new terminal
  const plusBtn = ' [+]';
  tabPositions.push({
    index: -1, // Special index for "new terminal"
    startCol: currentCol,
    endCol: currentCol + plusBtn.length - 1,
  });
  output += `${ansi.fg.cyan}${plusBtn}${ansi.reset}`;
  currentCol += plusBtn.length;

  // Padding and hints on right
  const tabsWidth = currentCol - 1;
  const padding = Math.max(1, width - tabsWidth - hintsLen - 1);
  output += ' '.repeat(padding);
  output += `${ansi.dim}${hints}${ansi.reset}`;

  return { output, tabPositions };
}

/**
 * Find which tab was clicked based on column position
 *
 * @param col - Column position of click (1-indexed)
 * @param tabPositions - Array of tab positions
 * @returns Tab index, -1 for new terminal button, or null if no tab clicked
 */
export function findClickedTab(col: number, tabPositions: TabPosition[]): number | null {
  for (const tab of tabPositions) {
    if (col >= tab.startCol && col <= tab.endCol) {
      return tab.index;
    }
  }
  return null;
}
