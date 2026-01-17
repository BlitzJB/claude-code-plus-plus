#!/usr/bin/env node
/**
 * Claude Code++ - Multi-pane terminal for parallel Claude Code agents
 *
 * Uses tmux for true pane isolation:
 * ┌──────────────┬─────────────────────────────────┐
 * │  Sidebar     │                                 │
 * │  (worktrees) │  Main Terminal                  │
 * │              │  (Claude Code runs here)        │
 * │              │                                 │
 * └──────────────┴─────────────────────────────────┘
 *
 * Sessions persist across restarts - just reattach to existing tmux session.
 * State is stored in ~/.claude-plus-plus/<project>/
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, chmodSync } from 'fs';
import { execSync } from 'child_process';
import { Tmux } from './tmux.js';
import { getTmuxSessionName } from './state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
let repoPath = process.cwd();

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--help' || arg === '-h') {
    console.log(`
Claude Code++ - Multi-pane terminal for parallel Claude Code agents

Usage: claude++ [options] [path]

Options:
  -h, --help     Show this help message
  -v, --version  Show version
  --new          Force create new session (kill existing)

Arguments:
  path           Path to git repository (defaults to current directory)

Keyboard Shortcuts (in sidebar):
  ↑/↓ or j/k     Navigate worktrees/sessions
  Enter          Create new session or switch to selected
  Ctrl+T         New session for current worktree
  d              Delete selected session
  Ctrl+C         Quit (kills tmux session)

Tmux Shortcuts:
  Ctrl+B then ←/→   Switch between sidebar and terminal panes
  Ctrl+B then d     Detach from session (keeps running in background!)

Session Persistence:
  - Sessions persist when you detach (Ctrl+B d)
  - Run claude++ again to reattach to existing sessions
  - State stored in ~/.claude-plus-plus/<project>/

Examples:
  claude++                    # Run in current directory
  claude++ ~/projects/myapp   # Run in specific repo
  claude++ --new              # Force new session
`);
    process.exit(0);
  }

  if (arg === '--version' || arg === '-v') {
    console.log('claude++ v0.1.0');
    process.exit(0);
  }

  if (arg === '--new') {
    // Will be handled below
    continue;
  }

  // Assume it's a path
  if (!arg.startsWith('-')) {
    repoPath = resolve(arg);
  }
}

const forceNew = args.includes('--new');

// Check if tmux is available
if (!Tmux.isAvailable()) {
  console.error('Error: tmux is required but not installed.');
  console.error('Install with: brew install tmux (macOS) or apt install tmux (Linux)');
  process.exit(1);
}

// Generate unique session name for this project
const sessionName = getTmuxSessionName(repoPath);
const tmux = new Tmux(sessionName);

// Check if session already exists
if (tmux.sessionExists() && !forceNew) {
  console.log(`Reattaching to existing session: ${sessionName}`);
  console.log('(Use --new to force create a fresh session)');
  const exitCode = tmux.attach();
  // User detached or session ended - exit cleanly
  process.exit(exitCode);
}

// Kill existing session if --new flag
if (forceNew && tmux.sessionExists()) {
  console.log('Killing existing session...');
  tmux.killSession();
}

console.log(`Starting Claude++ for: ${repoPath}`);
console.log(`Session: ${sessionName}`);

// Create session - starts as single pane for sidebar
tmux.createSession(repoPath);

// Configure tmux for better UX
tmux.setOption('mouse', 'on', true);
// Auto-copy mouse selection to system clipboard (macOS)
// When you select text with mouse in tmux, it auto-copies to clipboard on release
execSync(`tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"`, { stdio: 'ignore' });
execSync(`tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"`, { stdio: 'ignore' });
tmux.setOption('status', 'off'); // Hide tmux status bar
tmux.setOption('pane-border-style', 'fg=colour238');
tmux.setOption('pane-active-border-style', 'fg=colour39');

// Get the initial pane ID - this will be our sidebar
const panes = tmux.listPanes();
const sidebarPaneId = panes[0].id;

// Split to create welcome pane on the right
tmux.splitHorizontal(25, repoPath); // 25% for sidebar, 75% for welcome

// After split: pane 0 is left (sidebar), pane 1 is right (welcome)
const panesAfterSplit = tmux.listPanes();
const welcomePaneId = panesAfterSplit[1].id;

// Disable scroll wheel on sidebar pane only
tmux.disableScrollForPane(sidebarPaneId);

// Set up global hotkey: Ctrl+G to toggle sidebar
tmux.bindSidebarToggle(sidebarPaneId, 25, 2);

// Detect if running from source (tsx) or built (node)
function getSidebarCommand(): string {
  const tsPath = resolve(__dirname, 'sidebar.ts');
  const jsPath = resolve(__dirname, 'sidebar.js');

  // Pass all necessary info to sidebar
  // Note: welcomePaneId is passed as the "terminal" pane - sidebar will manage actual session panes
  const args = [
    `"${repoPath}"`,
    `"${sessionName}"`,
    `"${welcomePaneId}"`,
    `"${sidebarPaneId}"`,
  ].join(' ');

  if (existsSync(tsPath)) {
    return `npx tsx "${tsPath}" ${args}`;
  } else {
    return `node "${jsPath}" ${args}`;
  }
}

// Run sidebar in left pane
tmux.runInPane(sidebarPaneId, getSidebarCommand());

// Set up hook to enforce sidebar width on attach
execSync(`tmux set-hook -t ${sessionName} client-attached "resize-pane -t ${sidebarPaneId} -x 25"`, { stdio: 'ignore' });

// Global Ctrl+T binding - sends Ctrl+T to sidebar pane to create terminal
execSync(`tmux bind-key -T root C-t send-keys -t ${sidebarPaneId} C-t`, { stdio: 'ignore' });

// Write and run welcome script in right pane
const welcomeScript = `/tmp/claude-pp-welcome-${sessionName}.sh`;

const welcomeContent = `#!/bin/bash
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
  Ctrl+T        Open terminal (works from any pane)
  n             Create new worktree
  d             Delete selected session
  Ctrl+G        Toggle sidebar

  ───────────────────────────────────────────────────────────────

  TMUX SHORTCUTS

  Ctrl+B ←/→    Switch between panes
  Ctrl+B d      Detach (sessions keep running!)

  ───────────────────────────────────────────────────────────────

  Select a worktree in the sidebar and press Enter to begin.

WELCOME
# Keep the shell open but hide the prompt
read -r
`;

writeFileSync(welcomeScript, welcomeContent);
chmodSync(welcomeScript, 0o755);
tmux.sendKeys(welcomePaneId, welcomeScript, true);

// Focus the sidebar pane initially
tmux.selectPane(sidebarPaneId);

// Attach to the session
console.log('Attaching to tmux session...');
console.log('Detach with Ctrl+B d (sessions keep running!)');
const exitCode = tmux.attach();
process.exit(exitCode);
