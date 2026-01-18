/**
 * File Diff Header Rendering
 *
 * Pure function for rendering the 1-row header pane that appears
 * above the file diff content. Shows "Back to Claude" button, filename,
 * and view mode toggle buttons ([Diffs] [Full]).
 */

import { ansi } from '../ansi';
import type { DiffViewMode } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ButtonPositions {
  diffsOnly: [number, number];  // [start, end] columns (1-indexed)
  wholeFile: [number, number];  // [start, end] columns (1-indexed)
}

export interface FileHeaderRenderResult {
  output: string;
  buttonPositions: ButtonPositions;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get display name: always just the filename (basename)
 */
function getDisplayName(filepath: string): string {
  const parts = filepath.split('/');
  return parts[parts.length - 1];
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Render the file diff header bar (1-row)
 *
 * Format: "← Back to Claude [Esc] │ file.ts  +22 -10                    [Diffs] [Full]"
 *
 * @param filename - The file being viewed
 * @param insertions - Number of lines added
 * @param deletions - Number of lines removed
 * @param width - Available width in columns
 * @param mode - Current view mode ('diffs-only' or 'whole-file')
 * @returns Object with output string and button positions
 */
export function renderFileHeader(
  filename: string,
  insertions: number,
  deletions: number,
  width: number,
  mode: DiffViewMode = 'whole-file'
): FileHeaderRenderResult {
  // Ensure minimum width to prevent content being cut off
  const effectiveWidth = Math.max(width, 60);

  let output = ansi.hideCursor + ansi.clearScreen + ansi.moveTo(1, 1);

  // Back button with keybinding hint
  const back = '← Back to Claude';
  const hint = '[Esc]';
  const sep = ' │ ';

  output += `${ansi.fg.cyan}${ansi.bold}${back}${ansi.reset}`;
  output += ` ${ansi.dim}${hint}${ansi.reset}`;
  output += `${ansi.dim}${sep}${ansi.reset}`;

  // File name (basename only)
  const displayName = getDisplayName(filename);
  output += `${ansi.bold}${displayName}${ansi.reset}`;

  // Stats
  let statsStr = '';
  if (insertions > 0 || deletions > 0) {
    statsStr += '  ';
    if (insertions > 0) {
      const ins = insertions > 999 ? '999+' : String(insertions);
      statsStr += `${ansi.fg.green}+${ins}${ansi.reset}`;
    }
    if (deletions > 0) {
      if (insertions > 0) statsStr += ' ';
      const del = deletions > 999 ? '999+' : String(deletions);
      statsStr += `${ansi.fg.red}-${del}${ansi.reset}`;
    }
  }
  output += statsStr;

  // Calculate positions for mode toggle buttons
  // Buttons: "[Diffs] [Full]" - total 14 chars
  const diffsBtn = '[Diffs]';
  const fullBtn = '[Full]';
  const btnSpace = ' ';
  const buttonsWidth = diffsBtn.length + btnSpace.length + fullBtn.length; // 14

  // Position buttons at right side
  const diffsStart = effectiveWidth - buttonsWidth + 1; // 1-indexed
  const diffsEnd = diffsStart + diffsBtn.length - 1;
  const fullStart = diffsEnd + 1 + btnSpace.length; // after space
  const fullEnd = fullStart + fullBtn.length - 1;

  // Move cursor to button position and render buttons
  output += ansi.moveTo(1, diffsStart);

  // Render [Diffs] button - inverse if selected
  if (mode === 'diffs-only') {
    output += `${ansi.inverse}${diffsBtn}${ansi.reset}`;
  } else {
    output += `${ansi.dim}${diffsBtn}${ansi.reset}`;
  }

  output += btnSpace;

  // Render [Full] button - inverse if selected
  if (mode === 'whole-file') {
    output += `${ansi.inverse}${fullBtn}${ansi.reset}`;
  } else {
    output += `${ansi.dim}${fullBtn}${ansi.reset}`;
  }

  const buttonPositions: ButtonPositions = {
    diffsOnly: [diffsStart, diffsEnd],
    wholeFile: [fullStart, fullEnd],
  };

  return { output, buttonPositions };
}
