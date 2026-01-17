/**
 * State persistence for Claude++
 * Stores session state in ~/.claude-plus-plus/<project-name>/
 */

import { homedir } from 'os';
import { join, basename } from 'path';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { createHash } from 'crypto';

export interface PersistedTerminalInfo {
  id: string;
  title: string;
}

export interface PersistedSession {
  id: string;
  worktreeId: string;
  mainPaneId: string;
  terminalManagerPaneId: string | null;
  terminals: PersistedTerminalInfo[];
  activeTerminalIndex: number;
  title: string;
}

export interface PersistedState {
  version: number;
  projectPath: string;
  tmuxSessionName: string;
  sessions: PersistedSession[];
  activeSessionId: string | null;
  selectedIndex: number;
  sidebarPaneId: string;
  rightPaneId: string;
}

const STATE_VERSION = 1;
const BASE_DIR = join(homedir(), '.claude-plus-plus');

/**
 * Generate a safe directory name from project path
 */
function getProjectDirName(projectPath: string): string {
  const name = basename(projectPath);
  // Create a short hash of the full path to handle same-named projects in different locations
  const hash = createHash('md5').update(projectPath).digest('hex').slice(0, 8);
  // Sanitize the name
  const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
  return `${safeName}-${hash}`;
}

/**
 * Get the state directory for a project
 */
export function getStateDir(projectPath: string): string {
  return join(BASE_DIR, getProjectDirName(projectPath));
}

/**
 * Get the state file path for a project
 */
export function getStateFile(projectPath: string): string {
  return join(getStateDir(projectPath), 'state.json');
}

/**
 * Generate a unique tmux session name for a project
 */
export function getTmuxSessionName(projectPath: string): string {
  const name = basename(projectPath);
  const hash = createHash('md5').update(projectPath).digest('hex').slice(0, 6);
  const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 20);
  return `cpp-${safeName}-${hash}`;
}

/**
 * Ensure the state directory exists
 */
async function ensureStateDir(projectPath: string): Promise<void> {
  const dir = getStateDir(projectPath);
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Save state to disk
 */
export async function saveState(state: PersistedState): Promise<void> {
  await ensureStateDir(state.projectPath);
  const filePath = getStateFile(state.projectPath);
  const data = JSON.stringify(state, null, 2);
  await writeFile(filePath, data, 'utf-8');
}

/**
 * Load state from disk
 * Returns null if no state file exists or if it's invalid
 */
export async function loadState(projectPath: string): Promise<PersistedState | null> {
  const filePath = getStateFile(projectPath);

  try {
    await access(filePath);
    const data = await readFile(filePath, 'utf-8');
    const state = JSON.parse(data) as PersistedState;

    // Validate version
    if (state.version !== STATE_VERSION) {
      return null;
    }

    // Validate project path matches
    if (state.projectPath !== projectPath) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * Delete state file
 */
export async function deleteState(projectPath: string): Promise<void> {
  const filePath = getStateFile(projectPath);
  try {
    const { unlink } = await import('fs/promises');
    await unlink(filePath);
  } catch {
    // File might not exist, that's fine
  }
}
