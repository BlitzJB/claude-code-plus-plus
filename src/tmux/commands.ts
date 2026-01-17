/**
 * Low-level tmux command execution
 */

import { execSync, spawnSync } from 'child_process';

/**
 * Execute a tmux command and return output
 */
export function exec(args: string[], options: { silent?: boolean } = {}): string {
  const cmd = `tmux ${args.join(' ')}`;
  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      stdio: options.silent ? ['pipe', 'pipe', 'ignore'] : ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (error) {
    if (options.silent) return '';
    throw error;
  }
}

/**
 * Execute a tmux command silently (ignore errors)
 */
export function run(args: string[]): void {
  try {
    execSync(`tmux ${args.join(' ')}`, { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
}

/**
 * Check if a tmux command succeeds
 */
export function check(args: string[]): boolean {
  try {
    execSync(`tmux ${args.join(' ')} 2>/dev/null`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if tmux is available
 */
export function isAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Attach to a session (blocks until detach)
 */
export function attach(sessionName: string): number {
  const result = spawnSync('tmux', ['attach-session', '-t', sessionName], {
    stdio: 'inherit',
  });
  return result.status || 0;
}
