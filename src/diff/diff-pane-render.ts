/**
 * Diff Pane Rendering
 *
 * Pure functions for rendering the diff file list in the right pane.
 * Shows changed files with change type indicators and +/- counts.
 */

import type { DiffFileSummary, ChangeType } from './git-diff';
import { ansi } from '../ansi';

// ============================================================================
// Types
// ============================================================================

export interface FilePosition {
  index: number;
  startRow: number;
  endRow: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get display character and color for change type
 */
function getChangeTypeDisplay(changeType: ChangeType): { char: string; color: string } {
  switch (changeType) {
    case 'M':
      return { char: 'M', color: ansi.fg.yellow };
    case 'A':
      return { char: 'A', color: ansi.fg.green };
    case 'D':
      return { char: 'D', color: ansi.fg.red };
    case 'R':
      return { char: 'R', color: ansi.fg.magenta };
    case 'C':
      return { char: 'C', color: ansi.fg.cyan };
    case 'U':
      return { char: 'U', color: ansi.fg.red };
    case '?':
      return { char: '?', color: ansi.fg.gray };
    default:
      return { char: ' ', color: '' };
  }
}

/**
 * Get display name: always just the filename (basename)
 */
function getDisplayName(filepath: string): string {
  const parts = filepath.split('/');
  return parts[parts.length - 1];
}

/**
 * Truncate string to fit width
 */
function truncatePath(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Pad string to width
 */
function pad(str: string, width: number): string {
  if (str.length >= width) return str;
  return str + ' '.repeat(width - str.length);
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Render the diff pane showing the file list
 *
 * @param files - Array of changed files
 * @param selectedIndex - Currently selected file index
 * @param width - Available width in columns
 * @param height - Available height in rows
 * @returns Object with ANSI output string and file positions for click handling
 */
export function renderDiffPane(
  files: DiffFileSummary[],
  selectedIndex: number,
  width: number,
  height: number
): { output: string; filePositions: FilePosition[] } {
  const filePositions: FilePosition[] = [];

  let output = ansi.hideCursor + ansi.clearScreen + ansi.moveTo(1, 1);

  // Header
  const title = 'Changed Files';
  const titlePad = Math.max(0, Math.floor((width - title.length) / 2));
  output += ' '.repeat(titlePad);
  output += `${ansi.bold}${ansi.fg.cyan}${title}${ansi.reset}\n`;
  output += `${ansi.dim}${'─'.repeat(width - 1)}${ansi.reset}\n`;

  // Calculate space for file list (leave room for header, separator, and footer)
  const headerRows = 2;
  const footerRows = 3;
  const listHeight = height - headerRows - footerRows;

  if (files.length === 0) {
    output += ansi.moveTo(headerRows + 2, 1);
    output += `${ansi.dim}No changes detected${ansi.reset}\n`;
    output += '\n';
    output += `${ansi.dim}Make some changes to${ansi.reset}\n`;
    output += `${ansi.dim}see them here.${ansi.reset}`;

    // Footer
    output += ansi.moveTo(height - 2, 1);
    output += `${ansi.dim}${'─'.repeat(width - 1)}${ansi.reset}\n`;
    output += `${ansi.dim}Esc close${ansi.reset}`;

    return { output, filePositions };
  }

  // Calculate visible window
  const visibleStart = Math.max(0, selectedIndex - Math.floor(listHeight / 2));
  const visibleEnd = Math.min(files.length, visibleStart + listHeight);

  // File list
  for (let i = visibleStart; i < visibleEnd; i++) {
    const file = files[i];
    const isSelected = i === selectedIndex;
    const row = headerRows + 1 + (i - visibleStart);

    // Track position for click handling
    filePositions.push({
      index: i,
      startRow: row,
      endRow: row,
    });

    output += ansi.moveTo(row, 1);

    // Build the line content
    // Format: "M filename      +22 -10"
    //         ^-- change type (2 chars: char + space)
    //           ^-- filename (variable, padded)
    //                       ^-- stats (right-aligned)

    // Change type indicator
    const { char, color } = getChangeTypeDisplay(file.changeType);
    const typeStr = `${color}${char}${ansi.reset} `;

    // Format stats FIRST to know actual width needed
    let statsStr = '';
    let statsVisibleLen = 0;
    if (!file.binary && (file.insertions > 0 || file.deletions > 0)) {
      statsStr = formatStatsPlain(file.insertions, file.deletions);
      // Calculate visible length (strip ANSI codes)
      statsVisibleLen = statsStr.replace(/\x1b\[[0-9;]*m/g, '').length;
    } else if (file.binary) {
      statsStr = '[bin]';
      statsVisibleLen = 5;
    }

    // Get display name (filename only)
    const displayName = getDisplayName(file.file);

    // Calculate available space for filename based on ACTUAL stats width
    // Width - 2 (change type) - statsVisibleLen - 2 (min padding) - 1 (scroll bar space)
    const maxFileLen = width - 2 - statsVisibleLen - 2 - 1;
    const fileName = truncatePath(displayName, Math.max(5, maxFileLen));

    // Calculate padding between filename and stats
    const contentLen = fileName.length;
    const padLen = Math.max(1, width - 2 - contentLen - statsVisibleLen - 1);

    // Build the line (without type prefix for inverse calculation)
    const lineContent = fileName + ' '.repeat(padLen) + statsStr;

    // Apply selection highlight (inverse) to entire line content
    if (isSelected) {
      output += typeStr;
      output += `${ansi.inverse}${lineContent}${ansi.reset}`;
    } else {
      output += typeStr + lineContent;
    }

    output += '\n';
  }

  // Scroll indicator if needed
  if (files.length > listHeight) {
    const scrollPos = Math.floor((selectedIndex / (files.length - 1)) * (listHeight - 1));
    for (let i = 0; i < listHeight; i++) {
      output += ansi.moveTo(headerRows + 1 + i, width);
      if (i === scrollPos) {
        output += `${ansi.fg.cyan}█${ansi.reset}`;
      } else {
        output += `${ansi.dim}│${ansi.reset}`;
      }
    }
  }

  // Footer
  output += ansi.moveTo(height - 2, 1);
  output += `${ansi.dim}${'─'.repeat(width - 1)}${ansi.reset}\n`;
  output += `${ansi.dim}↵ view  q close${ansi.reset}`;

  return { output, filePositions };
}

/**
 * Format insertion/deletion stats with colors (old version, kept for compatibility)
 */
function formatStats(insertions: number, deletions: number, maxLen: number): string {
  let stats = '';

  if (insertions > 0) {
    const ins = insertions > 999 ? '999+' : String(insertions);
    stats += `${ansi.fg.green}+${ins}${ansi.reset}`;
  }

  if (deletions > 0) {
    if (stats) stats += ' ';
    const del = deletions > 999 ? '999+' : String(deletions);
    stats += `${ansi.fg.red}-${del}${ansi.reset}`;
  }

  return stats;
}

/**
 * Format insertion/deletion stats with colors (plain format for right-alignment)
 */
function formatStatsPlain(insertions: number, deletions: number): string {
  let stats = '';

  if (insertions > 0) {
    const ins = insertions > 999 ? '999+' : String(insertions);
    stats += `${ansi.fg.green}+${ins}${ansi.reset}`;
  }

  if (deletions > 0) {
    if (stats) stats += ' ';
    const del = deletions > 999 ? '999+' : String(deletions);
    stats += `${ansi.fg.red}-${del}${ansi.reset}`;
  }

  return stats;
}

/**
 * Find which file was clicked based on row position
 *
 * @param row - Row position of click (1-indexed)
 * @param filePositions - Array of file positions
 * @returns File index or null if no file clicked
 */
export function findClickedFile(row: number, filePositions: FilePosition[]): number | null {
  for (const file of filePositions) {
    if (row >= file.startRow && row <= file.endRow) {
      return file.index;
    }
  }
  return null;
}
