/**
 * Session Launcher
 *
 * Creates tmux session, sets up panes, and spawns sidebar process.
 */

import { resolve } from 'path';
import { existsSync, writeFileSync, chmodSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import * as tmux from '../tmux';

// ============================================================================
// Types
// ============================================================================

export interface LaunchOptions {
  repoPath: string;
  sessionName: string;
  forceNew?: boolean;
}

export interface LaunchResult {
  sessionName: string;
  attached: boolean;
  exitCode: number;
}

// ============================================================================
// Session Name Generation
// ============================================================================

/**
 * Generate a unique session name from repo path
 */
export function generateSessionName(repoPath: string): string {
  const projectName = repoPath.split('/').pop() || 'project';
  // Create a simple hash from the path
  let hash = 0;
  for (let i = 0; i < repoPath.length; i++) {
    const char = repoPath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36).substring(0, 6);
  return `cpp-${projectName.substring(0, 15)}-${hashStr}`;
}

// ============================================================================
// Launcher
// ============================================================================

/**
 * Launch or attach to a claude-code-plus-plus session
 */
export async function launch(options: LaunchOptions): Promise<LaunchResult> {
  const { repoPath, sessionName, forceNew = false } = options;

  // Check if session exists
  if (tmux.sessionExists(sessionName)) {
    if (forceNew) {
      console.log('Killing existing session...');
      tmux.killSession(sessionName);
    } else {
      console.log(`Reattaching to existing session: ${sessionName}`);
      console.log('(Use --new to force create a fresh session)');
      const exitCode = tmux.attach(sessionName);
      return { sessionName, attached: true, exitCode };
    }
  }

  console.log(`Starting Claude++ for: ${repoPath}`);
  console.log(`Session: ${sessionName}`);

  // Create session
  tmux.createSession(sessionName, repoPath);

  // Configure tmux options
  configureTmux(sessionName);

  // Get initial pane (will be sidebar)
  const panes = tmux.listPanes(sessionName);
  const sidebarPaneId = panes[0]?.id || '%0';

  // Split to create main pane (25% sidebar, 75% main)
  const mainPaneId = tmux.splitHorizontal(sessionName, 25, repoPath);

  // Spawn sidebar process
  const sidebarCommand = getSidebarCommand(repoPath, sessionName, mainPaneId, sidebarPaneId);
  tmux.runInPane(sidebarPaneId, sidebarCommand);

  // Show welcome screen in main pane
  showWelcomeScreen(sessionName, mainPaneId);

  // Set up additional tmux bindings
  setupBindings(sessionName, sidebarPaneId);

  // Focus sidebar
  tmux.selectPane(sidebarPaneId);

  // Attach
  console.log('Attaching to tmux session...');
  console.log('Detach with Ctrl+B d (sessions keep running!)');
  const exitCode = tmux.attach(sessionName);

  return { sessionName, attached: true, exitCode };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Configure tmux options for better UX
 */
function configureTmux(sessionName: string): void {
  tmux.setOption('mouse', 'on', true);
  tmux.setOption('status', 'off');
  tmux.setOption('pane-border-style', 'fg=colour238');
  tmux.setOption('pane-active-border-style', 'fg=colour39');

  // Auto-copy to clipboard on macOS
  try {
    execSync(`tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"`, { stdio: 'ignore' });
    execSync(`tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"`, { stdio: 'ignore' });
  } catch {
    // Not on macOS or pbcopy not available
  }
}

/**
 * Get the command to run sidebar
 */
function getSidebarCommand(
  repoPath: string,
  sessionName: string,
  mainPaneId: string,
  sidebarPaneId: string
): string {
  // Look for sidebar in same directory as launcher
  const srcDir = resolve(__dirname, '..');
  const tsPath = resolve(srcDir, 'sidebar', 'index.ts');
  const jsPath = resolve(srcDir, 'sidebar', 'index.js');

  const args = [
    `"${repoPath}"`,
    `"${sessionName}"`,
    `"${mainPaneId}"`,
    `"${sidebarPaneId}"`,
  ].join(' ');

  if (existsSync(tsPath)) {
    return `npx tsx "${tsPath}" ${args}`;
  } else if (existsSync(jsPath)) {
    return `node "${jsPath}" ${args}`;
  } else {
    // Fallback - show error
    return `echo "Sidebar not found at ${tsPath} or ${jsPath}"`;
  }
}

/**
 * Show welcome screen in main pane
 */
function showWelcomeScreen(sessionName: string, mainPaneId: string): void {
  const tempDir = tmpdir();
  const welcomeScript = `${tempDir}/claude-pp-welcome-${sessionName}.sh`;

  const content = `#!/bin/bash
clear
cat << 'WELCOME'

  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║     ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗      ║
  ║    ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝      ║
  ║    ██║     ██║     ███████║██║   ██║██║  ██║█████╗        ║
  ║    ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝        ║
  ║    ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗      ║
  ║     ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝      ║
  ║                      CODE ++                              ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝

  Multi-agent Claude Code with git worktree isolation

  ───────────────────────────────────────────────────────────────

  GETTING STARTED

  ↑/↓ or j/k    Navigate worktrees & sessions
  Enter         Create new session or switch to selected
  n             Create new worktree
  d             Delete selected item
  q             Quit

  ───────────────────────────────────────────────────────────────

  GLOBAL SHORTCUTS (work from any pane)

  Ctrl+T        Create new terminal in active session
  Ctrl+G        Toggle sidebar collapse

  ───────────────────────────────────────────────────────────────

  TMUX SHORTCUTS

  Ctrl+B ←/→    Switch between panes
  Ctrl+B d      Detach (sessions keep running!)

  ───────────────────────────────────────────────────────────────

  Select a worktree in the sidebar and press Enter to begin.

WELCOME
read -r
`;

  writeFileSync(welcomeScript, content);
  chmodSync(welcomeScript, 0o755);
  tmux.runInPane(mainPaneId, welcomeScript);
}

/**
 * Set up additional key bindings
 */
function setupBindings(sessionName: string, sidebarPaneId: string): void {
  // Set up hook to enforce sidebar width on attach
  try {
    execSync(`tmux set-hook -t ${sessionName} client-attached "resize-pane -t ${sidebarPaneId} -x 25"`, { stdio: 'ignore' });
  } catch {
    // Ignore
  }

  // Disable scroll wheel in sidebar pane
  const condition = `#{==:#{pane_id},${sidebarPaneId}}`;
  try {
    execSync(`tmux bind-key -T root WheelUpPane if-shell -F "${condition}" "" "copy-mode -e; send-keys -M"`, { stdio: 'ignore' });
    execSync(`tmux bind-key -T root WheelDownPane if-shell -F "${condition}" "" "copy-mode -e; send-keys -M"`, { stdio: 'ignore' });
  } catch {
    // Ignore
  }

  // Global key bindings that route to sidebar regardless of active pane
  // Ctrl+T - create new terminal
  try {
    execSync(`tmux bind-key -T root C-t send-keys -t ${sidebarPaneId} C-t`, { stdio: 'ignore' });
  } catch {
    // Ignore
  }

  // Ctrl+G - toggle sidebar collapse
  try {
    execSync(`tmux bind-key -T root C-g send-keys -t ${sidebarPaneId} C-g`, { stdio: 'ignore' });
  } catch {
    // Ignore
  }

  // Ctrl+Q - quit
  try {
    execSync(`tmux bind-key -T root C-q send-keys -t ${sidebarPaneId} C-q`, { stdio: 'ignore' });
  } catch {
    // Ignore
  }
}
