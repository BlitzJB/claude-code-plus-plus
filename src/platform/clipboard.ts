/**
 * Clipboard Operations
 *
 * Platform-specific clipboard copy/paste functionality.
 */

import { execSync, spawn } from 'child_process';
import { detectPlatform, isCommandAvailable } from './detector';

/**
 * Get the clipboard command for the current platform
 */
function getClipboardCommand(): {
  copy: string[];
  paste: string[];
} | null {
  const os = detectPlatform();

  switch (os) {
    case 'darwin':
      return {
        copy: ['pbcopy'],
        paste: ['pbpaste'],
      };

    case 'linux':
      // Try xclip first, then xsel
      if (isCommandAvailable('xclip')) {
        return {
          copy: ['xclip', '-selection', 'clipboard'],
          paste: ['xclip', '-selection', 'clipboard', '-o'],
        };
      }
      if (isCommandAvailable('xsel')) {
        return {
          copy: ['xsel', '--clipboard', '--input'],
          paste: ['xsel', '--clipboard', '--output'],
        };
      }
      // Try wl-copy for Wayland
      if (isCommandAvailable('wl-copy')) {
        return {
          copy: ['wl-copy'],
          paste: ['wl-paste'],
        };
      }
      return null;

    case 'win32':
      return {
        copy: ['clip'],
        paste: ['powershell', '-command', 'Get-Clipboard'],
      };

    default:
      return null;
  }
}

/**
 * Check if clipboard operations are available
 */
export function isClipboardAvailable(): boolean {
  return getClipboardCommand() !== null;
}

/**
 * Copy text to the system clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
  const commands = getClipboardCommand();

  if (!commands) {
    throw new Error('Clipboard not available on this platform');
  }

  return new Promise((resolve, reject) => {
    const [cmd, ...args] = commands.copy;
    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to copy to clipboard: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Clipboard command exited with code ${code}`));
      }
    });

    proc.stdin.write(text);
    proc.stdin.end();
  });
}

/**
 * Copy text to clipboard synchronously
 */
export function copyToClipboardSync(text: string): void {
  const commands = getClipboardCommand();

  if (!commands) {
    throw new Error('Clipboard not available on this platform');
  }

  const [cmd, ...args] = commands.copy;
  const command = [cmd, ...args].join(' ');

  try {
    execSync(command, {
      input: text,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  } catch (error) {
    throw new Error(
      `Failed to copy to clipboard: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Paste text from the system clipboard
 */
export async function pasteFromClipboard(): Promise<string> {
  const commands = getClipboardCommand();

  if (!commands) {
    throw new Error('Clipboard not available on this platform');
  }

  return new Promise((resolve, reject) => {
    const [cmd, ...args] = commands.paste;
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to paste from clipboard: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Clipboard command exited with code ${code}`));
      }
    });
  });
}

/**
 * Paste text from clipboard synchronously
 */
export function pasteFromClipboardSync(): string {
  const commands = getClipboardCommand();

  if (!commands) {
    throw new Error('Clipboard not available on this platform');
  }

  const [cmd, ...args] = commands.paste;

  try {
    const output = execSync([cmd, ...args].join(' '), {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output;
  } catch (error) {
    throw new Error(
      `Failed to paste from clipboard: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
