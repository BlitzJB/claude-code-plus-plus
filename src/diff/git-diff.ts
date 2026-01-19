/**
 * Git Diff Operations
 *
 * Functions for getting git diff summaries and file diffs.
 * Uses simple-git for git operations.
 */

import { simpleGit, SimpleGit } from 'simple-git';
import { watch, FSWatcher } from 'fs';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export type ChangeType = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?';

export interface DiffFileSummary {
  file: string;
  changeType: ChangeType;
  insertions: number;
  deletions: number;
  binary: boolean;
  oldFile?: string; // For renames
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a path is a nested git repo (directory with .git inside)
 * These show up as "modified" in git status but aren't real file changes
 */
async function isNestedGitRepo(repoPath: string, filePath: string): Promise<boolean> {
  try {
    const fullPath = join(repoPath, filePath);
    const fileStat = await stat(fullPath);
    if (!fileStat.isDirectory()) return false;

    // Check if it has a .git inside
    const gitPath = join(fullPath, '.git');
    await stat(gitPath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Git Diff Functions
// ============================================================================

/**
 * Get a summary of all changed files in the working directory
 * Includes both staged and unstaged changes compared to HEAD
 * Filters out nested git repos (directories with .git) which git shows as "modified"
 */
export async function getDiffSummary(repoPath: string): Promise<DiffFileSummary[]> {
  const git = simpleGit(repoPath);
  const files: DiffFileSummary[] = [];

  try {
    // Get status to understand which files have changed
    const status = await git.status();

    // Process all changed files from status
    for (const file of status.modified) {
      // Skip nested git repos - they show as "modified" but aren't real file changes
      if (await isNestedGitRepo(repoPath, file)) continue;

      const stats = await getFileStats(git, file);
      files.push({
        file,
        changeType: 'M',
        insertions: stats.insertions,
        deletions: stats.deletions,
        binary: stats.binary,
      });
    }

    for (const file of status.created) {
      const stats = await getFileStats(git, file, true);
      files.push({
        file,
        changeType: 'A',
        insertions: stats.insertions,
        deletions: 0,
        binary: stats.binary,
      });
    }

    for (const file of status.deleted) {
      const stats = await getFileStats(git, file);
      files.push({
        file,
        changeType: 'D',
        insertions: 0,
        deletions: stats.deletions,
        binary: stats.binary,
      });
    }

    for (const rename of status.renamed) {
      const stats = await getFileStats(git, rename.to);
      files.push({
        file: rename.to,
        changeType: 'R',
        insertions: stats.insertions,
        deletions: stats.deletions,
        binary: stats.binary,
        oldFile: rename.from,
      });
    }

    // Also include staged files that might not be in the above categories
    for (const file of status.staged) {
      if (!files.some(f => f.file === file)) {
        // Skip nested git repos
        if (await isNestedGitRepo(repoPath, file)) continue;

        const stats = await getFileStats(git, file);
        files.push({
          file,
          changeType: 'M',
          insertions: stats.insertions,
          deletions: stats.deletions,
          binary: stats.binary,
        });
      }
    }

    // Include untracked files (show as 'A' added with line count)
    for (const file of status.not_added) {
      const lineCount = await countFileLines(repoPath, file);
      files.push({
        file,
        changeType: 'A',  // Show as added instead of '?'
        insertions: lineCount,
        deletions: 0,
        binary: false,
      });
    }

    return files;
  } catch (err) {
    // Not a git repo or error
    return [];
  }
}

/**
 * Count the number of lines in a file (for untracked files)
 */
async function countFileLines(repoPath: string, file: string): Promise<number> {
  try {
    const content = await readFile(join(repoPath, file), 'utf-8');
    const lines = content.split('\n');
    // Don't count the last element if it's empty (file ends with newline)
    return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  } catch {
    return 0;
  }
}

/**
 * Get line stats for a single file
 */
async function getFileStats(
  git: SimpleGit,
  file: string,
  isNew: boolean = false
): Promise<{ insertions: number; deletions: number; binary: boolean }> {
  try {
    let output: string;
    if (isNew) {
      // For new files, diff against empty tree
      output = await git.raw(['diff', '--numstat', '--', file]);
    } else {
      // For existing files, diff against HEAD
      output = await git.raw(['diff', 'HEAD', '--numstat', '--', file]);
    }

    if (!output.trim()) {
      // Try staged diff
      output = await git.raw(['diff', '--cached', '--numstat', '--', file]);
    }

    if (!output.trim()) {
      return { insertions: 0, deletions: 0, binary: false };
    }

    const line = output.trim().split('\n')[0];
    const parts = line.split('\t');

    if (parts[0] === '-' && parts[1] === '-') {
      // Binary file
      return { insertions: 0, deletions: 0, binary: true };
    }

    return {
      insertions: parseInt(parts[0], 10) || 0,
      deletions: parseInt(parts[1], 10) || 0,
      binary: false,
    };
  } catch {
    return { insertions: 0, deletions: 0, binary: false };
  }
}

/**
 * Get the full diff content for a specific file
 */
export async function getFileDiff(repoPath: string, filename: string): Promise<string> {
  const git = simpleGit(repoPath);

  try {
    // Try HEAD diff first (includes both staged and unstaged)
    let diff = await git.diff(['HEAD', '--', filename]);

    if (!diff) {
      // Try staged diff
      diff = await git.diff(['--cached', '--', filename]);
    }

    if (!diff) {
      // For new untracked files, show the entire content as added
      diff = await git.raw(['diff', '--no-index', '/dev/null', filename]).catch(() => '');
    }

    return diff;
  } catch {
    return '';
  }
}

/**
 * Get the full file content with inline diff markers colored.
 * Shows the complete file with changed lines highlighted.
 * For new files, shows all lines as added (green).
 * For modified files, shows the full unified diff with colors.
 */
export async function getFileWithInlineDiff(repoPath: string, filename: string): Promise<string> {
  const git = simpleGit(repoPath);

  // ANSI color codes (same as ansi.ts but we inline them here to avoid circular deps)
  const ESC = '\x1b';
  const CSI = `${ESC}[`;
  const reset = `${CSI}0m`;
  const bold = `${CSI}1m`;
  const dim = `${CSI}2m`;
  const fgRed = `${CSI}31m`;
  const fgGreen = `${CSI}32m`;
  const fgCyan = `${CSI}36m`;
  const fgWhite = `${CSI}37m`;

  try {
    // Get the status to determine if this is a new file
    const status = await git.status();
    const isUntracked = status.not_added.includes(filename);
    const isNew = status.created.includes(filename) || isUntracked;

    if (isNew || isUntracked) {
      // New/untracked file - show all lines as added (no header - filename in header pane)
      const content = await readFile(join(repoPath, filename), 'utf-8');
      const lines = content.split('\n');
      let output = '';

      for (let i = 0; i < lines.length; i++) {
        output += `${fgGreen}+${lines[i]}${reset}\n`;
      }

      return output;
    }

    // Get the diff for existing file
    let diff = await git.diff(['HEAD', '--', filename]);
    if (!diff) {
      diff = await git.diff(['--cached', '--', filename]);
    }

    if (!diff) {
      // No diff available - just show the file content
      const content = await readFile(join(repoPath, filename), 'utf-8');
      return content;
    }

    // Parse and colorize the diff output
    const lines = diff.split('\n');
    let output = '';

    for (const line of lines) {
      if (line.startsWith('diff ') || line.startsWith('index ')) {
        output += `${dim}${line}${reset}\n`;
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        output += `${bold}${fgWhite}${line}${reset}\n`;
      } else if (line.startsWith('@@')) {
        output += `${fgCyan}${line}${reset}\n`;
      } else if (line.startsWith('+')) {
        output += `${fgGreen}${line}${reset}\n`;
      } else if (line.startsWith('-')) {
        output += `${fgRed}${line}${reset}\n`;
      } else if (line.startsWith('\\')) {
        output += `${dim}${line}${reset}\n`;
      } else {
        output += `${line}\n`;
      }
    }

    return output;
  } catch (err) {
    // Fallback: try to read the file directly
    try {
      const content = await readFile(join(repoPath, filename), 'utf-8');
      return content;
    } catch {
      return `Error reading file: ${filename}`;
    }
  }
}

/**
 * Get the full file content with inline diffs.
 * Shows the COMPLETE current file with changed sections highlighted:
 * - Unchanged lines: normal text
 * - Deleted lines: shown in red at the position they were removed
 * - Added lines: shown in green (these are already in the current file)
 *
 * For new files, shows all lines as added (green).
 */
export async function getFullFileWithInlineDiff(repoPath: string, filename: string): Promise<string> {
  const git = simpleGit(repoPath);

  // ANSI color codes
  const ESC = '\x1b';
  const CSI = `${ESC}[`;
  const reset = `${CSI}0m`;
  const dim = `${CSI}2m`;
  const fgRed = `${CSI}31m`;
  const fgGreen = `${CSI}32m`;
  const bgRed = `${CSI}41m`;
  const bgGreen = `${CSI}42m`;
  const fgBlack = `${CSI}30m`;

  try {
    // Get the status to determine if this is a new file
    const status = await git.status();
    const isUntracked = status.not_added.includes(filename);
    const isNew = status.created.includes(filename) || isUntracked;

    // Read the current file content
    let currentContent: string;
    try {
      currentContent = await readFile(join(repoPath, filename), 'utf-8');
    } catch {
      return `Error: Cannot read file ${filename}`;
    }

    if (isNew || isUntracked) {
      // New/untracked file - show all lines as added
      const lines = currentContent.split('\n');
      let output = '';
      for (let i = 0; i < lines.length; i++) {
        const lineNum = String(i + 1).padStart(4, ' ');
        output += `${dim}${lineNum}${reset} ${fgGreen}+${reset} ${fgGreen}${lines[i]}${reset}\n`;
      }
      return output;
    }

    // Get the diff for modified file
    let diff = await git.diff(['HEAD', '--', filename]);
    if (!diff) {
      diff = await git.diff(['--cached', '--', filename]);
    }

    if (!diff) {
      // No changes - just show the file content with line numbers
      const lines = currentContent.split('\n');
      let output = '';
      for (let i = 0; i < lines.length; i++) {
        const lineNum = String(i + 1).padStart(4, ' ');
        output += `${dim}${lineNum}${reset}   ${lines[i]}\n`;
      }
      return output;
    }

    // Parse the diff and build full file view with inline changes
    return buildFullFileWithDiff(currentContent, diff);
  } catch (err) {
    // Fallback: just show the file content
    try {
      const content = await readFile(join(repoPath, filename), 'utf-8');
      const lines = content.split('\n');
      let output = '';
      for (let i = 0; i < lines.length; i++) {
        const lineNum = String(i + 1).padStart(4, ' ');
        output += `${dim}${lineNum}${reset}   ${lines[i]}\n`;
      }
      return output;
    } catch {
      return `Error reading file: ${filename}`;
    }
  }
}

/**
 * Parse unified diff and build full file view with changes inline
 */
function buildFullFileWithDiff(currentContent: string, diff: string): string {
  // ANSI color codes
  const ESC = '\x1b';
  const CSI = `${ESC}[`;
  const reset = `${CSI}0m`;
  const dim = `${CSI}2m`;
  const fgRed = `${CSI}31m`;
  const fgGreen = `${CSI}32m`;

  const currentLines = currentContent.split('\n');
  const diffLines = diff.split('\n');

  // Parse hunks from diff
  // Hunk format: @@ -oldStart,oldCount +newStart,newCount @@
  interface Hunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: { type: '+' | '-' | ' '; content: string }[];
  }

  const hunks: Hunk[] = [];
  let currentHunk: Hunk | null = null;

  for (const line of diffLines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || '1', 10),
        lines: [],
      };
    } else if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.lines.push({ type: '+', content: line.slice(1) });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.lines.push({ type: '-', content: line.slice(1) });
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({ type: ' ', content: line.slice(1) || '' });
      }
    }
  }
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // Build output by walking through file and inserting diffs
  let output = '';
  let currentLineNum = 1;
  let hunkIdx = 0;

  while (currentLineNum <= currentLines.length || hunkIdx < hunks.length) {
    // Check if we're at a hunk start
    const hunk = hunks[hunkIdx];

    if (hunk && currentLineNum === hunk.newStart) {
      // Process this hunk
      for (const hunkLine of hunk.lines) {
        if (hunkLine.type === '-') {
          // Deleted line - show in red (not in current file)
          output += `${dim}    ${reset} ${fgRed}-${reset} ${fgRed}${hunkLine.content}${reset}\n`;
        } else if (hunkLine.type === '+') {
          // Added line - show in green with line number
          const lineNum = String(currentLineNum).padStart(4, ' ');
          output += `${dim}${lineNum}${reset} ${fgGreen}+${reset} ${fgGreen}${hunkLine.content}${reset}\n`;
          currentLineNum++;
        } else {
          // Context line - show normally
          const lineNum = String(currentLineNum).padStart(4, ' ');
          output += `${dim}${lineNum}${reset}   ${hunkLine.content}\n`;
          currentLineNum++;
        }
      }
      hunkIdx++;
    } else if (currentLineNum <= currentLines.length) {
      // Normal line (not in a hunk)
      const lineNum = String(currentLineNum).padStart(4, ' ');
      output += `${dim}${lineNum}${reset}   ${currentLines[currentLineNum - 1]}\n`;
      currentLineNum++;
    } else {
      break;
    }
  }

  return output;
}

/**
 * Get a "diffs only" view of a file - shows just the hunks without file headers.
 * This is a compact view showing only the changed sections.
 *
 * For new/untracked files, shows all lines as added with a synthetic hunk header.
 */
export async function getDiffsOnlyView(repoPath: string, filename: string): Promise<string> {
  const git = simpleGit(repoPath);

  // ANSI color codes
  const ESC = '\x1b';
  const CSI = `${ESC}[`;
  const reset = `${CSI}0m`;
  const bold = `${CSI}1m`;
  const dim = `${CSI}2m`;
  const fgRed = `${CSI}31m`;
  const fgGreen = `${CSI}32m`;
  const fgYellow = `${CSI}33m`;
  const fgCyan = `${CSI}36m`;
  const bgGreen = `${CSI}42m`;
  const bgRed = `${CSI}41m`;
  const fgBlack = `${CSI}30m`;

  // Helper to format hunk header nicely
  const formatHunkHeader = (line: string, isFirst: boolean): string => {
    // Parse @@ -old,count +new,count @@ optional context
    const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?/);
    if (!match) return `${dim}${line}${reset}\n`;

    const oldStart = match[1];
    const oldCount = match[2] || '1';
    const newStart = match[3];
    const newCount = match[4] || '1';
    const context = match[5]?.trim() || '';

    // Build a cleaner header
    let header = '';
    if (!isFirst) {
      header += `${dim}${'─'.repeat(60)}${reset}\n`;
    }
    header += `${fgCyan}${bold}@@ `;
    header += `${fgRed}−${oldStart},${oldCount}${reset}${fgCyan}${bold} `;
    header += `${fgGreen}+${newStart},${newCount}${reset}`;
    if (context) {
      header += ` ${dim}${context}${reset}`;
    }
    header += `${reset}\n`;
    return header;
  };

  try {
    // Get the status to determine if this is a new file
    const status = await git.status();
    const isUntracked = status.not_added.includes(filename);
    const isNew = status.created.includes(filename) || isUntracked;

    if (isNew || isUntracked) {
      // New/untracked file - show all lines as added with synthetic hunk header
      const content = await readFile(join(repoPath, filename), 'utf-8');
      const lines = content.split('\n');
      // Don't count empty last line
      const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;

      let output = `${fgYellow}${bold}New file${reset} ${dim}(${lineCount} lines)${reset}\n`;
      output += `${dim}${'─'.repeat(60)}${reset}\n`;

      for (let i = 0; i < lines.length; i++) {
        // Skip truly empty trailing line
        if (i === lines.length - 1 && lines[i] === '') continue;
        const lineNum = String(i + 1).padStart(4);
        output += `${fgGreen}${lineNum} + ${lines[i]}${reset}\n`;
      }
      return output;
    }

    // Get the diff for existing file
    let diff = await git.diff(['HEAD', '--', filename]);
    if (!diff) {
      diff = await git.diff(['--cached', '--', filename]);
    }

    if (!diff) {
      // No changes
      return `${dim}No changes${reset}`;
    }

    // Parse and colorize the diff output, skipping file headers
    const diffLines = diff.split('\n');
    let output = '';
    let isFirstHunk = true;
    let currentOldLine = 0;
    let currentNewLine = 0;

    for (const line of diffLines) {
      // Skip file header lines
      if (line.startsWith('diff ') || line.startsWith('index ')) continue;
      if (line.startsWith('---') || line.startsWith('+++')) continue;

      // Colorize hunk headers and changes
      if (line.startsWith('@@')) {
        output += formatHunkHeader(line, isFirstHunk);
        isFirstHunk = false;

        // Parse line numbers for display
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
        if (match) {
          currentOldLine = parseInt(match[1], 10);
          currentNewLine = parseInt(match[2], 10);
        }
      } else if (line.startsWith('+')) {
        const lineNum = String(currentNewLine).padStart(4);
        output += `${fgGreen}${lineNum} + ${line.slice(1)}${reset}\n`;
        currentNewLine++;
      } else if (line.startsWith('-')) {
        const lineNum = String(currentOldLine).padStart(4);
        output += `${fgRed}${lineNum} − ${line.slice(1)}${reset}\n`;
        currentOldLine++;
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" - show dimmed
        output += `${dim}     ${line}${reset}\n`;
      } else {
        // Context lines
        const lineNum = String(currentNewLine).padStart(4);
        output += `${dim}${lineNum}   ${line.slice(1) || line}${reset}\n`;
        currentOldLine++;
        currentNewLine++;
      }
    }

    return output || `${dim}No changes${reset}`;
  } catch (err) {
    return `${fgRed}Error reading diff: ${filename}${reset}`;
  }
}

/**
 * Watch for file changes in a repository
 * Returns a cleanup function to stop watching
 *
 * @param repoPath - Path to the repository to watch
 * @param callback - Called when changes are detected (can be async)
 * @param onError - Optional error handler for async callback failures
 */
export function watchForChanges(
  repoPath: string,
  callback: () => void | Promise<void>,
  onError?: (error: Error) => void
): () => void {
  let debounceTimer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  const debouncedCallback = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      try {
        await callback();
      } catch (err) {
        // Call error handler if provided, otherwise log to console
        if (onError) {
          onError(err instanceof Error ? err : new Error(String(err)));
        } else {
          console.error('watchForChanges callback error:', err);
        }
      }
    }, 500);
  };

  try {
    // Watch the .git directory for index changes
    const gitDir = join(repoPath, '.git');
    watcher = watch(gitDir, { recursive: true }, (eventType, filename) => {
      // Trigger on index or HEAD changes
      if (filename && (filename.includes('index') || filename.includes('HEAD'))) {
        debouncedCallback();
      }
    });

    // Also watch the working directory for file changes
    const workdirWatcher = watch(repoPath, { recursive: true }, (eventType, filename) => {
      // Ignore .git directory changes (handled above)
      if (filename && !filename.startsWith('.git')) {
        debouncedCallback();
      }
    });

    // Return cleanup function
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (watcher) {
        watcher.close();
      }
      workdirWatcher.close();
    };
  } catch {
    // Watching failed, return no-op cleanup
    return () => {};
  }
}
