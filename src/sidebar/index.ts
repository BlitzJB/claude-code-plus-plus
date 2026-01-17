#!/usr/bin/env node
/**
 * Sidebar Entry Point
 *
 * Runs inside the left tmux pane. Receives arguments from the launcher.
 */

import { SidebarApp } from './app';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error('Usage: sidebar <repoPath> <sessionName> <mainPaneId> <sidebarPaneId>');
    process.exit(1);
  }

  const [repoPath, sessionName, mainPaneId, sidebarPaneId] = args;

  const sidebar = new SidebarApp(repoPath, sessionName, mainPaneId, sidebarPaneId);

  try {
    await sidebar.init();
    sidebar.start();
  } catch (err) {
    console.error('Sidebar error:', err);
    process.exit(1);
  }
}

main();
