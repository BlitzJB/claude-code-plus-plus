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
 */

import { resolve } from 'path';
import * as tmux from './tmux';
import { launch, generateSessionName } from './launcher';

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);
let repoPath = process.cwd();
let forceNew = false;

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
  n              Create new worktree
  d              Delete selected session
  r              Rename selected item
  q              Quit (with detach/kill options)
  Ctrl+G         Toggle sidebar collapsed/expanded

Tmux Shortcuts:
  Ctrl+B ←/→     Switch between sidebar and terminal panes
  Ctrl+B d       Detach from session (keeps running in background!)

Session Persistence:
  - Sessions persist when you detach (Ctrl+B d)
  - Run claude++ again to reattach to existing sessions

Examples:
  claude++                    # Run in current directory
  claude++ ~/projects/myapp   # Run in specific repo
  claude++ --new              # Force new session
`);
    process.exit(0);
  }

  if (arg === '--version' || arg === '-v') {
    console.log('claude++ v0.2.0');
    process.exit(0);
  }

  if (arg === '--new') {
    forceNew = true;
    continue;
  }

  // Assume it's a path
  if (!arg.startsWith('-')) {
    repoPath = resolve(arg);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  // Check if tmux is available
  if (!tmux.isAvailable()) {
    console.error('Error: tmux is required but not installed.');
    console.error('Install with: brew install tmux (macOS) or apt install tmux (Linux)');
    process.exit(1);
  }

  // Generate unique session name for this project
  const sessionName = generateSessionName(repoPath);

  // Launch or attach to session
  const result = await launch({
    repoPath,
    sessionName,
    forceNew,
  });

  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
