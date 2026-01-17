#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { resolve } from 'path';

// Parse arguments
const args = process.argv.slice(2);
let repoPath = process.cwd();

// Simple arg parsing
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log(`
Claude Code++ - Multi-pane terminal for parallel Claude Code agents

Usage: claude++ [options] [path]

Options:
  -h, --help     Show this help message
  -v, --version  Show version

Arguments:
  path           Path to git repository (defaults to current directory)

Keyboard Shortcuts:
  Ctrl+B         Toggle sidebar
  Ctrl+T         New session tab
  Ctrl+W         Close current session
  Tab            Switch focus between sidebar and terminal
  Escape         Focus terminal
  Alt+1-9        Switch to tab N
  ↑/↓ or j/k     Navigate sidebar (when focused)
  Enter          Select worktree (when sidebar focused)
  Ctrl+C         Exit (or send interrupt to terminal)

Examples:
  claude++                    # Run in current directory
  claude++ ~/projects/myapp   # Run in specific repo
`);
    process.exit(0);
  }

  if (arg === '--version' || arg === '-v') {
    console.log('claude++ v0.1.0');
    process.exit(0);
  }

  // Assume it's a path
  if (!arg.startsWith('-')) {
    repoPath = resolve(arg);
  }
}

// Check if we're in a TTY
if (!process.stdin.isTTY) {
  console.error('Error: claude++ must be run in an interactive terminal');
  process.exit(1);
}

// Enable raw mode for proper keyboard handling
process.stdin.setRawMode(true);

// Render the app
const { waitUntilExit } = render(<App repoPath={repoPath} />);

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Wait for app to exit
waitUntilExit().then(() => {
  process.exit(0);
});
