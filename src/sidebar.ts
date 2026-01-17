#!/usr/bin/env node
/**
 * Sidebar application - runs in the left tmux pane
 * Displays worktrees and manages Claude sessions
 *
 * Each session is a separate tmux pane that stays alive.
 * Switching sessions swaps which pane is visible.
 *
 * State is saved to ~/.claude-plus-plus/<project>/ for potential restore.
 * However, primary persistence is via tmux - just detach (Ctrl+B d) and reattach!
 */

import { Tmux } from './tmux.js';
import { WorktreeManager } from './core/worktree-manager.js';
import { saveState, loadState, PersistedState } from './state.js';
import type { Worktree } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { basename, dirname, resolve } from 'path';
import { writeFileSync, existsSync, readFileSync, unlinkSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Debug logging to file
function debugLog(...args: any[]): void {
  const msg = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
  appendFileSync('/tmp/claude-pp-debug.log', msg);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI escape codes for sidebar rendering
const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  clearScreen: `${CSI}2J`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  inverse: `${CSI}7m`,
  fg: {
    black: `${CSI}30m`,
    red: `${CSI}31m`,
    green: `${CSI}32m`,
    yellow: `${CSI}33m`,
    blue: `${CSI}34m`,
    magenta: `${CSI}35m`,
    cyan: `${CSI}36m`,
    white: `${CSI}37m`,
    gray: `${CSI}90m`,
  },
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  // Mouse support
  enableMouse: `${CSI}?1000h${CSI}?1006h`,
  disableMouse: `${CSI}?1000l${CSI}?1006l`,
};

interface ClickableRegion {
  row: number;
  startCol: number;
  endCol: number;
  type: 'worktree' | 'session';
  item: Worktree | Session;
}

interface TerminalInfo {
  id: string;      // tmux pane ID
  title: string;   // Display name
}

interface Session {
  id: string;
  worktreeId: string;
  mainPaneId: string;  // Claude pane - stays constant
  // Terminal management
  terminalManagerPaneId: string | null;  // Pane running terminal-manager.ts
  terminals: TerminalInfo[];  // Terminal panes info
  activeTerminalIndex: number;  // Which terminal is currently visible
  title: string;
}

interface SidebarState {
  worktrees: Worktree[];
  sessions: Session[];
  selectedIndex: number;
  activeSessionId: string | null;
  visiblePaneId: string | null;  // Currently visible pane in right area
  // Modal state
  showQuitModal: boolean;
  quitModalSelection: 'detach' | 'kill';
  // Sidebar collapsed state
  collapsed: boolean;
  // New worktree input state
  showNewWorktreeInput: boolean;
  newWorktreeBranch: string;
  // Rename input state
  showRenameInput: boolean;
  renameTarget: { type: 'worktree' | 'session'; item: Worktree | Session } | null;
  renameValue: string;
  // New session input state
  showNewSessionInput: boolean;
  newSessionWorktree: Worktree | null;
  newSessionName: string;
  // Terminal manager command mode
  terminalCommandMode: boolean;
  terminalCommandBuffer: string;
  // Delete confirmation modal
  showDeleteConfirmModal: boolean;
  deleteConfirmTarget: { type: 'worktree' | 'session'; item: Worktree | Session } | null;
  deleteConfirmSelection: 'yes' | 'no';
}

const SIDEBAR_WIDTH = 25;

class Sidebar {
  private tmux: Tmux;
  private worktreeManager: WorktreeManager;
  private repoPath: string;
  private sessionName: string;
  private state: SidebarState;
  private rightPaneId: string;  // The "slot" on the right where we show sessions
  private sidebarPaneId: string;
  private running: boolean = false;
  private clickableRegions: ClickableRegion[] = [];

  constructor(repoPath: string, sessionName: string, rightPaneId: string, sidebarPaneId: string) {
    this.repoPath = repoPath;
    this.sessionName = sessionName;
    this.tmux = new Tmux(sessionName);
    this.worktreeManager = new WorktreeManager(repoPath);
    this.rightPaneId = rightPaneId;
    this.sidebarPaneId = sidebarPaneId;

    this.state = {
      worktrees: [],
      sessions: [],
      selectedIndex: 0,
      activeSessionId: null,
      visiblePaneId: rightPaneId,  // Initially the right pane is visible
      showQuitModal: false,
      quitModalSelection: 'detach',
      collapsed: false,
      showNewWorktreeInput: false,
      newWorktreeBranch: '',
      showRenameInput: false,
      renameTarget: null,
      renameValue: '',
      showNewSessionInput: false,
      newSessionWorktree: null,
      newSessionName: '',
      terminalCommandMode: false,
      terminalCommandBuffer: '',
      showDeleteConfirmModal: false,
      deleteConfirmTarget: null,
      deleteConfirmSelection: 'no',
    };
  }

  async init(): Promise<void> {
    // Load worktrees
    this.state.worktrees = await this.worktreeManager.list();

    // If no git worktrees, create a fallback for current directory
    if (this.state.worktrees.length === 0) {
      this.state.worktrees = [{
        id: 'current',
        path: this.repoPath,
        branch: basename(this.repoPath),
        isMain: true,
        sessions: [],
      }];
    }
  }

  /**
   * Ensure sidebar stays at fixed width after pane operations
   */
  private enforceSidebarWidth(): void {
    if (!this.state.collapsed) {
      this.tmux.resizePane(this.sidebarPaneId, SIDEBAR_WIDTH);
    }
  }

  /**
   * Toggle sidebar collapsed/expanded state
   */
  private toggleSidebar(): void {
    this.state.collapsed = !this.state.collapsed;

    if (this.state.collapsed) {
      // Collapse to 2 columns (enough to show session count)
      this.tmux.resizePane(this.sidebarPaneId, 2);
    } else {
      // Expand to full width
      this.tmux.resizePane(this.sidebarPaneId, SIDEBAR_WIDTH);
    }

    this.render();
  }

  /**
   * Save current state to disk (for potential future restore)
   */
  private async persistState(): Promise<void> {
    const state: PersistedState = {
      version: 1,
      projectPath: this.repoPath,
      tmuxSessionName: this.sessionName,
      sessions: this.state.sessions.map(s => ({
        id: s.id,
        worktreeId: s.worktreeId,
        mainPaneId: s.mainPaneId,
        terminalManagerPaneId: s.terminalManagerPaneId,
        terminals: s.terminals,
        activeTerminalIndex: s.activeTerminalIndex,
        title: s.title,
      })),
      activeSessionId: this.state.activeSessionId,
      selectedIndex: this.state.selectedIndex,
      sidebarPaneId: this.sidebarPaneId,
      rightPaneId: this.rightPaneId,
    };

    try {
      await saveState(state);
    } catch (err) {
      // Silently fail - state saving is best-effort
    }
  }

  start(): void {
    this.running = true;

    // Set up terminal
    process.stdout.write(ansi.hideCursor);
    process.stdout.write(ansi.enableMouse);

    // Set up raw mode for input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('data', this.handleInput.bind(this));

    // Handle resize - sync collapsed state based on actual width
    process.stdout.on('resize', () => {
      this.syncCollapsedState();
      this.render();
    });

    // Initial render
    this.render();
  }

  /**
   * Sync collapsed state based on actual pane width
   * This handles external resize (tmux hotkey, manual drag)
   */
  private syncCollapsedState(): void {
    const width = process.stdout.columns || SIDEBAR_WIDTH;
    // If width is less than half of SIDEBAR_WIDTH, consider it collapsed
    this.state.collapsed = width < SIDEBAR_WIDTH / 2;
  }

  stop(): void {
    this.running = false;
    process.stdout.write(ansi.disableMouse);
    process.stdout.write(ansi.showCursor);
    process.stdout.write(ansi.reset);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  private handleInput(data: Buffer): void {
    const key = data.toString();
    debugLog('handleInput received key:', JSON.stringify(key), 'hex:', data.toString('hex'));

    // Handle mouse events (SGR extended mode)
    const mouseMatch = key.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (mouseMatch) {
      const button = parseInt(mouseMatch[1], 10);
      const col = parseInt(mouseMatch[2], 10);
      const row = parseInt(mouseMatch[3], 10);
      const isRelease = mouseMatch[4] === 'm';

      // Handle left click release (button 0)
      if (button === 0 && isRelease) {
        this.handleClick(row, col);
      }
      return;
    }

    // Handle quit modal if open
    if (this.state.showQuitModal) {
      this.handleQuitModalInput(key);
      return;
    }

    // Handle new worktree input if open
    if (this.state.showNewWorktreeInput) {
      this.handleNewWorktreeInput(key, data);
      return;
    }

    // Handle rename input if open
    if (this.state.showRenameInput) {
      this.handleRenameInput(key, data);
      return;
    }

    // Handle new session input if open
    if (this.state.showNewSessionInput) {
      this.handleNewSessionInput(key, data);
      return;
    }

    // Handle delete confirmation modal if open
    if (this.state.showDeleteConfirmModal) {
      this.handleDeleteConfirmInput(key);
      return;
    }

    // Handle terminal manager command mode
    if (this.state.terminalCommandMode) {
      if (key === '\r') {
        // Enter - execute the command
        this.executeTerminalCommand(this.state.terminalCommandBuffer);
        this.state.terminalCommandMode = false;
        this.state.terminalCommandBuffer = '';
      } else if (key === '\x1b') {
        // Escape - cancel command mode
        this.state.terminalCommandMode = false;
        this.state.terminalCommandBuffer = '';
      } else {
        // Accumulate command characters
        this.state.terminalCommandBuffer += key;
      }
      return;
    }

    // Ctrl+U - enter terminal manager command mode
    if (key === '\x15') {
      this.state.terminalCommandMode = true;
      this.state.terminalCommandBuffer = '';
      return;
    }

    // Ctrl+C - show quit modal
    if (key === '\x03') {
      this.state.showQuitModal = true;
      this.state.quitModalSelection = 'detach'; // Default to detach
      this.render();
      return;
    }

    // Ctrl+G - toggle sidebar collapsed/expanded
    if (key === '\x07') {
      this.toggleSidebar();
      return;
    }

    // If collapsed, only respond to Ctrl+G (to expand)
    if (this.state.collapsed) {
      return;
    }

    // Escape - do nothing in main view (could add functionality later)
    if (key === '\x1b' && data.length === 1) {
      return;
    }

    // Ctrl+T - new terminal for active session (works globally via tmux binding)
    if (key === '\x14') {
      this.createTerminalForSession();
      return;
    }

    // 'n' - new worktree
    if (key === 'n') {
      this.state.showNewWorktreeInput = true;
      this.state.newWorktreeBranch = '';
      this.render();
      return;
    }

    // Arrow up or 'k'
    if (key === '\x1b[A' || key === 'k') {
      this.state.selectedIndex = Math.max(0, this.state.selectedIndex - 1);
      this.render();
      return;
    }

    // Arrow down or 'j'
    if (key === '\x1b[B' || key === 'j') {
      const maxIndex = this.getMaxIndex();
      this.state.selectedIndex = Math.min(maxIndex, this.state.selectedIndex + 1);
      this.render();
      return;
    }

    // Enter - activate selected item
    if (key === '\r') {
      this.activateSelected();
      return;
    }

    // 'd' - delete selected item (session or worktree)
    if (key === 'd') {
      debugLog('d key pressed, selectedIndex:', this.state.selectedIndex);
      this.showDeleteConfirmation();
      return;
    }

    // 'r' - rename selected item
    if (key === 'r') {
      this.startRename();
      return;
    }
  }

  private handleClick(row: number, col: number): void {
    // If sidebar is collapsed, expand it on click
    if (this.state.collapsed) {
      this.toggleSidebar();
      return;
    }

    // If any modal is open, ignore clicks (or close modal)
    if (this.state.showQuitModal || this.state.showNewWorktreeInput ||
        this.state.showRenameInput || this.state.showNewSessionInput) {
      return;
    }

    // Find clicked region
    const region = this.clickableRegions.find(r =>
      r.row === row && col >= r.startCol && col <= r.endCol
    );

    if (!region) return;

    if (region.type === 'worktree') {
      const worktree = region.item as Worktree;

      // Check for special buttons
      if ((worktree as any).id === '__collapse__') {
        // Collapse button clicked
        this.toggleSidebar();
        return;
      }
      if ((worktree as any).id === '__new_worktree__') {
        // New worktree button clicked
        this.state.showNewWorktreeInput = true;
        this.state.newWorktreeBranch = '';
        this.render();
        return;
      }

      // Click on worktree - open new session modal
      this.state.showNewSessionInput = true;
      this.state.newSessionWorktree = worktree;
      this.state.newSessionName = '';
      this.render();
    } else if (region.type === 'session') {
      const session = region.item as Session;
      if (session.id === this.state.activeSessionId) {
        // Already active - focus the Claude pane
        this.tmux.selectPane(session.mainPaneId);
      } else {
        // Switch to this session
        this.switchToSession(session);
      }
    }
  }

  private handleQuitModalInput(key: string): void {
    // Escape - close modal
    if (key === '\x1b' && key.length === 1) {
      this.state.showQuitModal = false;
      this.render();
      return;
    }

    // Arrow up/down or j/k - toggle selection
    if (key === '\x1b[A' || key === 'k' || key === '\x1b[B' || key === 'j') {
      this.state.quitModalSelection = this.state.quitModalSelection === 'detach' ? 'kill' : 'detach';
      this.render();
      return;
    }

    // Enter - confirm selection
    if (key === '\r') {
      if (this.state.quitModalSelection === 'detach') {
        // Detach from tmux (session keeps running, sidebar keeps running)
        // Close modal first so sidebar shows normal view when reattached
        this.state.showQuitModal = false;
        this.render();
        // Detach the client - sidebar process stays alive in the pane
        this.tmux.detachClient();
      } else {
        // Kill the session
        this.stop();
        this.tmux.killSession();
        process.exit(0);
      }
      return;
    }

    // 'q' or another Ctrl+C - close modal
    if (key === 'q' || key === '\x03') {
      this.state.showQuitModal = false;
      this.render();
      return;
    }
  }

  private handleNewWorktreeInput(key: string, data: Buffer): void {
    // Escape - cancel
    if (key === '\x1b' && data.length === 1) {
      this.state.showNewWorktreeInput = false;
      this.state.newWorktreeBranch = '';
      this.render();
      return;
    }

    // Ctrl+C - cancel
    if (key === '\x03') {
      this.state.showNewWorktreeInput = false;
      this.state.newWorktreeBranch = '';
      this.render();
      return;
    }

    // Enter - create worktree
    if (key === '\r') {
      if (this.state.newWorktreeBranch.trim()) {
        this.createNewWorktree(this.state.newWorktreeBranch.trim());
      }
      this.state.showNewWorktreeInput = false;
      this.state.newWorktreeBranch = '';
      this.render();
      return;
    }

    // Backspace
    if (key === '\x7f' || key === '\b') {
      this.state.newWorktreeBranch = this.state.newWorktreeBranch.slice(0, -1);
      this.render();
      return;
    }

    // Regular character input (printable ASCII)
    if (data.length === 1 && data[0] >= 32 && data[0] < 127) {
      // Only allow valid branch name characters
      if (/[a-zA-Z0-9\-_\/.]/.test(key)) {
        this.state.newWorktreeBranch += key;
        this.render();
      }
      return;
    }
  }

  private async createNewWorktree(branchName: string): Promise<void> {
    try {
      // Create a new branch and worktree from HEAD
      const worktree = await this.worktreeManager.create(branchName, true);
      this.state.worktrees.push(worktree);
      // Select the new worktree
      this.state.selectedIndex = this.getMaxIndex();
      this.render();
    } catch (err) {
      // Could show error in UI, for now just log
      // The worktree manager will throw if branch exists, etc.
    }
  }

  private startRename(): void {
    const item = this.getItemAtIndex(this.state.selectedIndex);
    if (!item) return;

    // Don't allow renaming main worktree
    if (item.type === 'worktree' && (item.item as Worktree).isMain) {
      return;
    }

    this.state.showRenameInput = true;
    this.state.renameTarget = item;

    if (item.type === 'worktree') {
      this.state.renameValue = (item.item as Worktree).branch;
    } else {
      this.state.renameValue = (item.item as Session).title;
    }

    this.render();
  }

  private handleRenameInput(key: string, data: Buffer): void {
    // Escape - cancel
    if (key === '\x1b' && data.length === 1) {
      this.state.showRenameInput = false;
      this.state.renameTarget = null;
      this.state.renameValue = '';
      this.render();
      return;
    }

    // Ctrl+C - cancel
    if (key === '\x03') {
      this.state.showRenameInput = false;
      this.state.renameTarget = null;
      this.state.renameValue = '';
      this.render();
      return;
    }

    // Enter - confirm rename
    if (key === '\r') {
      if (this.state.renameValue.trim() && this.state.renameTarget) {
        this.performRename(this.state.renameTarget, this.state.renameValue.trim());
      }
      this.state.showRenameInput = false;
      this.state.renameTarget = null;
      this.state.renameValue = '';
      this.render();
      return;
    }

    // Backspace
    if (key === '\x7f' || key === '\b') {
      this.state.renameValue = this.state.renameValue.slice(0, -1);
      this.render();
      return;
    }

    // Regular character input (printable ASCII)
    if (data.length === 1 && data[0] >= 32 && data[0] < 127) {
      if (this.state.renameTarget?.type === 'worktree') {
        // Only allow valid branch name characters for worktrees
        if (/[a-zA-Z0-9\-_\/.]/.test(key)) {
          this.state.renameValue += key;
          this.render();
        }
      } else {
        // Allow any printable character for session names
        this.state.renameValue += key;
        this.render();
      }
      return;
    }
  }

  private handleNewSessionInput(key: string, data: Buffer): void {
    // Escape - cancel
    if (key === '\x1b' && data.length === 1) {
      this.state.showNewSessionInput = false;
      this.state.newSessionWorktree = null;
      this.state.newSessionName = '';
      this.render();
      return;
    }

    // Ctrl+C - cancel
    if (key === '\x03') {
      this.state.showNewSessionInput = false;
      this.state.newSessionWorktree = null;
      this.state.newSessionName = '';
      this.render();
      return;
    }

    // Enter - create session
    if (key === '\r') {
      if (this.state.newSessionName.trim() && this.state.newSessionWorktree) {
        this.createSessionForWorktree(this.state.newSessionWorktree, this.state.newSessionName.trim());
      }
      this.state.showNewSessionInput = false;
      this.state.newSessionWorktree = null;
      this.state.newSessionName = '';
      return;
    }

    // Backspace
    if (key === '\x7f' || key === '\b') {
      this.state.newSessionName = this.state.newSessionName.slice(0, -1);
      this.render();
      return;
    }

    // Regular character input (printable ASCII)
    if (data.length === 1 && data[0] >= 32 && data[0] < 127) {
      this.state.newSessionName += key;
      this.render();
      return;
    }
  }

  private showDeleteConfirmation(): void {
    const item = this.getItemAtIndex(this.state.selectedIndex);
    if (!item) return;

    // Don't allow deleting main worktree
    if (item.type === 'worktree' && (item.item as Worktree).isMain) {
      return;
    }

    this.state.showDeleteConfirmModal = true;
    this.state.deleteConfirmTarget = item;
    this.state.deleteConfirmSelection = 'no'; // Default to No for safety
    this.render();
  }

  private handleDeleteConfirmInput(key: string): void {
    // Escape - cancel
    if (key === '\x1b') {
      this.state.showDeleteConfirmModal = false;
      this.state.deleteConfirmTarget = null;
      this.render();
      return;
    }

    // Arrow up/down or j/k - toggle selection
    if (key === '\x1b[A' || key === 'k' || key === '\x1b[B' || key === 'j') {
      this.state.deleteConfirmSelection = this.state.deleteConfirmSelection === 'yes' ? 'no' : 'yes';
      this.render();
      return;
    }

    // Enter - confirm current selection
    if (key === '\r') {
      this.state.showDeleteConfirmModal = false;
      const target = this.state.deleteConfirmTarget;
      const confirmed = this.state.deleteConfirmSelection === 'yes';
      this.state.deleteConfirmTarget = null;

      if (confirmed && target) {
        this.deleteSelectedItem().catch(err => debugLog('deleteSelectedItem error:', err));
      } else {
        this.render();
      }
      return;
    }

    // 'y' - quick confirm
    if (key === 'y' || key === 'Y') {
      this.state.showDeleteConfirmModal = false;
      const target = this.state.deleteConfirmTarget;
      this.state.deleteConfirmTarget = null;

      if (target) {
        this.deleteSelectedItem().catch(err => debugLog('deleteSelectedItem error:', err));
      }
      return;
    }

    // 'n' - quick cancel
    if (key === 'n' || key === 'N') {
      this.state.showDeleteConfirmModal = false;
      this.state.deleteConfirmTarget = null;
      this.render();
      return;
    }
  }

  private async performRename(target: { type: 'worktree' | 'session'; item: Worktree | Session }, newName: string): Promise<void> {
    if (target.type === 'session') {
      // Simple session rename - just update the title
      const session = target.item as Session;
      session.title = newName;
      this.persistState();
    } else {
      // Worktree rename - need to rename branch and move worktree atomically
      const worktree = target.item as Worktree;
      const oldBranch = worktree.branch;

      try {
        const newPath = await this.worktreeManager.rename(worktree.path, oldBranch, newName);
        // Update local state
        worktree.branch = newName;
        worktree.path = newPath;
        // Re-render to show updated name
        this.render();
      } catch (err) {
        // Rename failed - worktree manager handles rollback
        // Could show error in UI
      }
    }
  }

  private getMaxIndex(): number {
    let count = 0;
    for (const wt of this.state.worktrees) {
      count++; // worktree itself
      count += this.getSessionsForWorktree(wt.id).length;
    }
    return Math.max(0, count - 1);
  }

  private getSessionsForWorktree(worktreeId: string): Session[] {
    return this.state.sessions.filter(s => s.worktreeId === worktreeId);
  }

  private getItemAtIndex(index: number): { type: 'worktree' | 'session'; item: Worktree | Session } | null {
    let currentIndex = 0;
    for (const wt of this.state.worktrees) {
      if (currentIndex === index) {
        return { type: 'worktree', item: wt };
      }
      currentIndex++;

      const sessions = this.getSessionsForWorktree(wt.id);
      for (const session of sessions) {
        if (currentIndex === index) {
          return { type: 'session', item: session };
        }
        currentIndex++;
      }
    }
    return null;
  }

  private activateSelected(): void {
    const item = this.getItemAtIndex(this.state.selectedIndex);
    if (!item) return;

    if (item.type === 'worktree') {
      // Show "Create Session" modal for this worktree
      const worktree = item.item as Worktree;
      const existingSessions = this.getSessionsForWorktree(worktree.id);
      const defaultName = `${existingSessions.length + 1}: ${worktree.branch}`;

      this.state.showNewSessionInput = true;
      this.state.newSessionWorktree = worktree;
      this.state.newSessionName = defaultName;
      this.render();
    } else {
      // Switch to this session
      this.switchToSession(item.item as Session);
    }
  }

  private createSessionForWorktree(worktree: Worktree, customTitle?: string): void {
    const sessionId = `session-${Date.now()}`;
    const sessionNum = this.getSessionsForWorktree(worktree.id).length + 1;

    // Build claude command
    let claudeCmd = DEFAULT_CONFIG.claudeCodeCommand;
    if (DEFAULT_CONFIG.dangerouslySkipPermissions) {
      claudeCmd += ' --dangerously-skip-permissions';
    }

    let paneId: string;

    if (this.state.sessions.length === 0) {
      // First session - use the existing right pane
      paneId = this.rightPaneId;

      // Kill any running process (like welcome screen) with Ctrl+C, then clear and run claude
      this.tmux.sendControlKey(paneId, 'C-c');
      this.tmux.sendKeys(paneId, `cd "${worktree.path}" && clear && ${claudeCmd}`, true);
    } else {
      // Additional session - need to break current session's panes to background first
      const currentSession = this.state.activeSessionId
        ? this.state.sessions.find(s => s.id === this.state.activeSessionId)
        : null;

      if (currentSession) {
        // Sync terminal state from terminal manager
        this.syncTerminalState(currentSession);

        // Break active terminal (if any)
        if (currentSession.terminals.length > 0) {
          const activeTerminal = currentSession.terminals[currentSession.activeTerminalIndex];
          if (activeTerminal) {
            this.tmux.breakPane(activeTerminal.id);
          }
        }
        // Break terminal manager pane (if any)
        if (currentSession.terminalManagerPaneId) {
          this.tmux.breakPane(currentSession.terminalManagerPaneId);
        }
        // Break main pane
        this.tmux.breakPane(currentSession.mainPaneId);
      }

      // Create new pane next to sidebar
      paneId = this.tmux.splitHorizontal(80, worktree.path);

      // Run claude in the new pane
      this.tmux.sendKeys(paneId, `${claudeCmd}`, true);
    }

    const session: Session = {
      id: sessionId,
      worktreeId: worktree.id,
      mainPaneId: paneId,
      terminalManagerPaneId: null,
      terminals: [],
      activeTerminalIndex: 0,
      title: customTitle || `${sessionNum}: ${worktree.branch}`,
    };

    this.state.sessions.push(session);
    this.state.activeSessionId = sessionId;
    this.state.visiblePaneId = paneId;
    worktree.sessions.push(sessionId);

    // Ensure sidebar stays at fixed width
    this.enforceSidebarWidth();

    // Focus back to sidebar
    this.tmux.selectPane(this.sidebarPaneId);

    // Save state
    this.persistState();

    this.render();
  }

  /**
   * Get the state file path for terminal manager
   */
  private getTerminalStateFile(sessionId: string): string {
    return `/tmp/claude-pp-term-${sessionId}.json`;
  }

  /**
   * Write terminal manager state file
   */
  private writeTerminalState(session: Session): void {
    const worktree = this.state.worktrees.find(w => w.id === session.worktreeId);
    const stateFile = this.getTerminalStateFile(session.id);

    const state = {
      sessionId: session.id,
      worktreePath: worktree?.path || this.repoPath,
      tmuxSession: this.sessionName,
      sidebarPaneId: this.sidebarPaneId,
      terminalManagerPaneId: session.terminalManagerPaneId,
      terminals: session.terminals,
      activeIndex: session.activeTerminalIndex,
    };

    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  /**
   * Execute a command from terminal manager (via Ctrl+U protocol)
   * Format: "{action} {index}" where action is S (switch) or D (delete)
   */
  private executeTerminalCommand(command: string): void {
    const parts = command.trim().split(/\s+/);
    if (parts.length < 2) return;

    const action = parts[0];
    const index = parseInt(parts[1], 10);

    if (isNaN(index)) return;

    const session = this.state.activeSessionId
      ? this.state.sessions.find(s => s.id === this.state.activeSessionId)
      : null;

    if (!session) return;

    if (action === 'S') {
      // Switch terminal tabs
      if (index >= 0 && index < session.terminals.length && index !== session.activeTerminalIndex) {
        this.switchTerminalTab(session, index);
      }
    } else if (action === 'D') {
      // Delete terminal at index
      this.deleteTerminalAtIndex(session, index);
    }
  }

  /**
   * Switch to a different terminal tab within a session
   */
  private switchTerminalTab(session: Session, targetIndex: number): void {
    const currentTerminal = session.terminals[session.activeTerminalIndex];
    const newTerminal = session.terminals[targetIndex];

    // Break current terminal to background
    this.tmux.breakPane(currentTerminal.id);

    // Join new terminal below the manager pane
    if (session.terminalManagerPaneId) {
      this.tmux.joinPane(newTerminal.id, session.terminalManagerPaneId, false);
      // Ensure terminal manager stays at 1 row
      this.tmux.resizePane(session.terminalManagerPaneId, undefined, 1);
    }

    // Update state
    session.activeTerminalIndex = targetIndex;

    // Write updated state file for terminal manager
    this.writeTerminalState(session);

    // Persist state
    this.persistState();
  }

  /**
   * Delete a terminal at the given index
   */
  private deleteTerminalAtIndex(session: Session, index: number): void {
    if (index < 0 || index >= session.terminals.length) return;

    const terminal = session.terminals[index];
    const wasActive = index === session.activeTerminalIndex;

    // Kill the terminal pane
    this.tmux.killPane(terminal.id);

    // Remove from terminals array
    session.terminals.splice(index, 1);

    if (session.terminals.length === 0) {
      // No more terminals - kill terminal manager pane
      if (session.terminalManagerPaneId) {
        this.tmux.killPane(session.terminalManagerPaneId);
        session.terminalManagerPaneId = null;
      }
      // Clean up state file
      try {
        const stateFile = this.getTerminalStateFile(session.id);
        unlinkSync(stateFile);
      } catch (err) {
        // File might not exist
      }
    } else {
      // Adjust activeTerminalIndex
      if (index < session.activeTerminalIndex) {
        // Deleted terminal was before the active one
        session.activeTerminalIndex--;
      } else if (session.activeTerminalIndex >= session.terminals.length) {
        // Active index is now out of bounds
        session.activeTerminalIndex = session.terminals.length - 1;
      }

      // If deleted was the visible terminal, show the new active one
      if (wasActive) {
        const newActiveTerminal = session.terminals[session.activeTerminalIndex];
        if (newActiveTerminal && session.terminalManagerPaneId) {
          // Join the new active terminal below the manager
          this.tmux.joinPane(newActiveTerminal.id, session.terminalManagerPaneId, false);
          // Ensure terminal manager stays at 1 row
          this.tmux.resizePane(session.terminalManagerPaneId, undefined, 1);
        }
      }

      // Update terminal manager state file
      this.writeTerminalState(session);
    }

    // Save state
    this.persistState();
    this.render();
  }

  /**
   * Sync terminal state from state file (terminal manager may have changed activeIndex)
   */
  private syncTerminalState(session: Session): void {
    try {
      const stateFile = this.getTerminalStateFile(session.id);
      if (!existsSync(stateFile)) return;

      const data = readFileSync(stateFile, 'utf-8');
      const state = JSON.parse(data);

      // Sync activeIndex from terminal manager
      if (typeof state.activeIndex === 'number' && state.activeIndex >= 0 && state.activeIndex < session.terminals.length) {
        session.activeTerminalIndex = state.activeIndex;
      }
    } catch (err) {
      // Failed to sync, use existing state
    }
  }

  /**
   * Get the command to run terminal manager
   */
  private getTerminalManagerCommand(sessionId: string): string {
    const stateFile = this.getTerminalStateFile(sessionId);
    const tsPath = resolve(__dirname, 'terminal-manager.ts');
    const jsPath = resolve(__dirname, 'terminal-manager.js');

    if (existsSync(tsPath)) {
      return `npx tsx "${tsPath}" "${stateFile}"`;
    } else {
      return `node "${jsPath}" "${stateFile}"`;
    }
  }

  private createTerminalForSession(): void {
    // Must have an active session
    if (!this.state.activeSessionId) return;

    const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
    if (!session) return;

    // Get the worktree for this session to get the path
    const worktree = this.state.worktrees.find(w => w.id === session.worktreeId);
    if (!worktree) return;

    const terminalNum = session.terminals.length + 1;
    const terminalTitle = `Terminal ${terminalNum}`;

    if (session.terminals.length === 0) {
      // First terminal - need to create terminal manager pane + terminal pane

      // Split main pane vertically (70% Claude, 30% terminal area)
      this.tmux.selectPane(session.mainPaneId);
      const terminalAreaPaneId = this.tmux.splitVertical(30, worktree.path);

      // Split terminal area: top part for manager, rest for terminal
      this.tmux.selectPane(terminalAreaPaneId);
      const terminalPaneId = this.tmux.splitVertical(90, worktree.path);

      // The terminalAreaPaneId is now the manager pane
      const terminalManagerPaneId = terminalAreaPaneId;

      // Resize manager pane to exactly 1 row
      this.tmux.resizePane(terminalManagerPaneId, undefined, 1);

      // Update session
      session.terminalManagerPaneId = terminalManagerPaneId;
      session.terminals.push({ id: terminalPaneId, title: terminalTitle });
      session.activeTerminalIndex = 0;

      // Write state file before starting terminal manager
      this.writeTerminalState(session);

      // Start terminal manager in the manager pane
      const managerCmd = this.getTerminalManagerCommand(session.id);
      this.tmux.sendKeys(terminalManagerPaneId, managerCmd, true);

      // Focus the terminal pane
      this.tmux.selectPane(terminalPaneId);

    } else {
      // Additional terminal - create pane, background it, switch to it

      // Get the currently visible terminal
      const currentTerminal = session.terminals[session.activeTerminalIndex];

      // Split from current terminal to create new one
      this.tmux.selectPane(currentTerminal.id);
      const newTerminalPaneId = this.tmux.splitVertical(50, worktree.path);

      // Break the current terminal to background
      this.tmux.breakPane(currentTerminal.id);

      // The new terminal is now visible
      session.terminals.push({ id: newTerminalPaneId, title: terminalTitle });
      session.activeTerminalIndex = session.terminals.length - 1;

      // Ensure terminal manager stays at 1 row after the split
      if (session.terminalManagerPaneId) {
        this.tmux.resizePane(session.terminalManagerPaneId, undefined, 1);
      }

      // Update terminal manager state
      this.writeTerminalState(session);

      // Focus the new terminal
      this.tmux.selectPane(newTerminalPaneId);
    }

    // Ensure sidebar stays at fixed width
    this.enforceSidebarWidth();

    // Save state
    this.persistState();

    this.render();
  }

  private switchToSession(session: Session): void {
    if (session.id === this.state.activeSessionId) {
      // Already active, nothing to do
      return;
    }

    // Get current session (if any)
    const currentSession = this.state.activeSessionId
      ? this.state.sessions.find(s => s.id === this.state.activeSessionId)
      : null;

    // Check if target session is already visible (e.g., just created)
    const targetAlreadyVisible = this.state.visiblePaneId === session.mainPaneId;

    if (!targetAlreadyVisible) {
      // Break current session's panes to background (if any)
      if (currentSession) {
        // Sync terminal state from file (terminal manager may have changed activeIndex)
        if (currentSession.terminals.length > 0) {
          this.syncTerminalState(currentSession);
        }

        // Break active terminal first (if any)
        if (currentSession.terminals.length > 0) {
          const activeTerminal = currentSession.terminals[currentSession.activeTerminalIndex];
          if (activeTerminal) {
            this.tmux.breakPane(activeTerminal.id);
          }
          // Break terminal manager
          if (currentSession.terminalManagerPaneId) {
            this.tmux.breakPane(currentSession.terminalManagerPaneId);
          }
        }
        // Break main pane
        this.tmux.breakPane(currentSession.mainPaneId);
      }

      // Join new session's main pane next to sidebar (horizontal)
      this.tmux.joinPane(session.mainPaneId, this.sidebarPaneId, true);

      // Join terminal manager and active terminal if session has terminals
      if (session.terminals.length > 0 && session.terminalManagerPaneId) {
        // Sync to get current activeIndex from terminal manager
        this.syncTerminalState(session);

        // Join terminal manager below main pane
        this.tmux.joinPane(session.terminalManagerPaneId, session.mainPaneId, false);

        // Join active terminal below terminal manager
        const activeTerminal = session.terminals[session.activeTerminalIndex];
        if (activeTerminal) {
          this.tmux.joinPane(activeTerminal.id, session.terminalManagerPaneId, false);
        }

        // Ensure terminal manager is exactly 1 row
        this.tmux.resizePane(session.terminalManagerPaneId, undefined, 1);

        // Update terminal manager state file
        this.writeTerminalState(session);
      }

      // Ensure sidebar stays at fixed width
      this.enforceSidebarWidth();
    }

    this.state.activeSessionId = session.id;
    this.state.visiblePaneId = session.mainPaneId;

    // Focus back to sidebar
    this.tmux.selectPane(this.sidebarPaneId);

    // Save state
    this.persistState();

    this.render();
  }

  private async deleteSelectedItem(): Promise<void> {
    const item = this.getItemAtIndex(this.state.selectedIndex);
    if (!item) return;

    if (item.type === 'session') {
      this.deleteSelectedSession();
    } else if (item.type === 'worktree') {
      await this.deleteSelectedWorktree();
    }
  }

  private async deleteSelectedWorktree(): Promise<void> {
    debugLog('deleteSelectedWorktree called, selectedIndex:', this.state.selectedIndex);
    const item = this.getItemAtIndex(this.state.selectedIndex);
    if (!item) {
      debugLog('deleteSelectedWorktree: No item at index', this.state.selectedIndex);
      return;
    }
    if (item.type !== 'worktree') {
      debugLog('deleteSelectedWorktree: Item is not a worktree, type:', item.type);
      return;
    }

    const worktree = item.item as Worktree;
    debugLog('deleteSelectedWorktree: Deleting worktree:', worktree.branch, 'isMain:', worktree.isMain, 'path:', worktree.path, 'id:', worktree.id);

    // Don't allow deleting the main worktree
    if (worktree.isMain) {
      // Main worktree cannot be deleted - it's the original repo
      debugLog('deleteSelectedWorktree: Cannot delete main worktree');
      return;
    }

    // Delete all sessions associated with this worktree first
    const sessionsToDelete = this.state.sessions.filter(s => s.worktreeId === worktree.id);
    for (const session of sessionsToDelete) {
      // Kill all terminal panes
      for (const terminal of session.terminals) {
        this.tmux.killPane(terminal.id);
      }
      // Kill terminal manager pane
      if (session.terminalManagerPaneId) {
        this.tmux.killPane(session.terminalManagerPaneId);
      }
      // Kill main pane
      this.tmux.killPane(session.mainPaneId);
      // Clean up state file
      try {
        const stateFile = this.getTerminalStateFile(session.id);
        unlinkSync(stateFile);
      } catch (err) {
        // Ignore
      }
    }

    // Remove sessions from state
    this.state.sessions = this.state.sessions.filter(s => s.worktreeId !== worktree.id);

    // If active session was deleted, switch to another
    if (sessionsToDelete.some(s => s.id === this.state.activeSessionId)) {
      this.state.activeSessionId = null;
      this.state.visiblePaneId = null;

      if (this.state.sessions.length > 0) {
        const nextSession = this.state.sessions[0];
        this.tmux.joinPane(nextSession.mainPaneId, this.sidebarPaneId, true);
        if (nextSession.terminals.length > 0 && nextSession.terminalManagerPaneId) {
          this.tmux.joinPane(nextSession.terminalManagerPaneId, nextSession.mainPaneId, false);
          const activeTerminal = nextSession.terminals[nextSession.activeTerminalIndex];
          if (activeTerminal) {
            this.tmux.joinPane(activeTerminal.id, nextSession.terminalManagerPaneId, false);
          }
          this.tmux.resizePane(nextSession.terminalManagerPaneId, undefined, 1);
          this.writeTerminalState(nextSession);
        }
        this.state.activeSessionId = nextSession.id;
        this.state.visiblePaneId = nextSession.mainPaneId;
        this.enforceSidebarWidth();
      }
    }

    // Delete the worktree via git
    debugLog('About to remove worktree via git, path:', worktree.path);
    try {
      await this.worktreeManager.remove(worktree.path, true);
      debugLog('Git worktree remove succeeded');
    } catch (err) {
      debugLog('Git worktree remove failed:', err);
    }

    // Remove worktree from state
    debugLog('Removing worktree from state, id:', worktree.id);
    this.state.worktrees = this.state.worktrees.filter(w => w.id !== worktree.id);
    debugLog('Worktrees after filter:', this.state.worktrees.map(w => w.branch));

    // Adjust selected index if needed
    const totalItems = this.state.worktrees.reduce((count, wt) => {
      return count + 1 + this.getSessionsForWorktree(wt.id).length;
    }, 0);
    if (this.state.selectedIndex >= totalItems) {
      this.state.selectedIndex = Math.max(0, totalItems - 1);
    }

    // Focus back to sidebar
    this.tmux.selectPane(this.sidebarPaneId);

    // Save state
    this.persistState();

    debugLog('deleteSelectedWorktree complete, calling render');
    this.render();
  }

  private deleteSelectedSession(): void {
    const item = this.getItemAtIndex(this.state.selectedIndex);
    if (!item || item.type !== 'session') return;

    const session = item.item as Session;

    // Kill all terminal panes
    for (const terminal of session.terminals) {
      this.tmux.killPane(terminal.id);
    }

    // Kill terminal manager pane if exists
    if (session.terminalManagerPaneId) {
      this.tmux.killPane(session.terminalManagerPaneId);
    }

    // Kill the main pane
    this.tmux.killPane(session.mainPaneId);

    // Clean up state file
    try {
      const stateFile = this.getTerminalStateFile(session.id);
      unlinkSync(stateFile);
    } catch (err) {
      // State file might not exist
    }

    // Remove from sessions array
    this.state.sessions = this.state.sessions.filter(s => s.id !== session.id);

    // Remove from worktree
    const worktree = this.state.worktrees.find(w => w.id === session.worktreeId);
    if (worktree) {
      worktree.sessions = worktree.sessions.filter(id => id !== session.id);
    }

    // If this was the active/visible session, switch to another
    if (this.state.activeSessionId === session.id) {
      this.state.activeSessionId = null;
      this.state.visiblePaneId = null;

      // Find another session to show
      if (this.state.sessions.length > 0) {
        const nextSession = this.state.sessions[0];

        // Join the next session's main pane next to sidebar
        this.tmux.joinPane(nextSession.mainPaneId, this.sidebarPaneId, true);

        // Join terminal manager and active terminal if exists
        if (nextSession.terminals.length > 0 && nextSession.terminalManagerPaneId) {
          this.tmux.joinPane(nextSession.terminalManagerPaneId, nextSession.mainPaneId, false);
          const activeTerminal = nextSession.terminals[nextSession.activeTerminalIndex];
          if (activeTerminal) {
            this.tmux.joinPane(activeTerminal.id, nextSession.terminalManagerPaneId, false);
          }
          this.writeTerminalState(nextSession);
        }

        this.state.activeSessionId = nextSession.id;
        this.state.visiblePaneId = nextSession.mainPaneId;
        // Ensure sidebar stays at fixed width
        this.enforceSidebarWidth();
      } else {
        // No more sessions - create an empty pane for future use
        this.tmux.selectPane(this.sidebarPaneId);
        const newPaneId = this.tmux.splitHorizontal(80);
        this.rightPaneId = newPaneId;
        this.state.visiblePaneId = newPaneId;
        // Show welcome message
        this.tmux.sendKeys(newPaneId, 'echo "Press Enter in sidebar to start a Claude session"', true);
        // Ensure sidebar stays at fixed width
        this.enforceSidebarWidth();
        this.tmux.selectPane(this.sidebarPaneId);
      }
    }

    // Adjust selection index
    this.state.selectedIndex = Math.max(0, this.state.selectedIndex - 1);

    // Save state
    this.persistState();

    this.render();
  }

  private render(): void {
    const cols = process.stdout.columns || 20;
    const rows = process.stdout.rows || 24;

    // Clear clickable regions
    this.clickableRegions = [];

    let output = ansi.clearScreen;
    output += ansi.moveTo(1, 1);

    // Show collapsed view
    if (this.state.collapsed) {
      this.renderCollapsed(rows);
      return;
    }

    // Show quit modal if open
    if (this.state.showQuitModal) {
      this.renderQuitModal(cols, rows);
      return;
    }

    // Show new worktree input if open
    if (this.state.showNewWorktreeInput) {
      this.renderNewWorktreeInput(cols, rows);
      return;
    }

    // Show rename input if open
    if (this.state.showRenameInput) {
      this.renderRenameInput(cols, rows);
      return;
    }

    // Show new session input if open
    if (this.state.showNewSessionInput) {
      this.renderNewSessionInput(cols, rows);
      return;
    }

    // Show delete confirmation modal if open
    if (this.state.showDeleteConfirmModal) {
      this.renderDeleteConfirmModal(cols, rows);
      return;
    }

    // Header with collapse button
    const headerText = 'Claude++';
    const collapseBtn = '◀';
    const headerPadding = cols - headerText.length - 2; // -2 for collapse button and space
    output += `${ansi.bold}${ansi.fg.cyan}${headerText}${ansi.reset}`;
    output += ' '.repeat(Math.max(1, headerPadding));
    output += `${ansi.fg.gray}${collapseBtn}${ansi.reset}\n`;
    output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n`;

    // Track current row for click regions (row 1 = header, row 2 = separator, row 3+ = content)
    // Add clickable region for collapse button (row 1, right side)
    this.clickableRegions.push({
      row: 1,
      startCol: cols - 2,
      endCol: cols,
      type: 'worktree', // Reusing type, will handle specially
      item: { id: '__collapse__' } as any,
    });
    let currentRow = 3;

    // Worktrees and sessions
    let currentIndex = 0;
    for (const wt of this.state.worktrees) {
      const isSelected = currentIndex === this.state.selectedIndex;
      const wtSessions = this.getSessionsForWorktree(wt.id);
      const hasActiveSessions = wtSessions.some(s => s.id === this.state.activeSessionId);

      // Worktree line with + button
      let line = '';
      if (isSelected) {
        line += ansi.inverse;
      }
      if (hasActiveSessions) {
        line += ansi.fg.green;
      }

      const icon = wt.isMain ? '◆' : '◇';
      const name = wt.branch.slice(0, cols - 5); // Leave room for " +"
      line += `${icon} ${name}`;

      // Pad to right and add + button
      const textLen = name.length + 2; // icon + space + name
      const padding = Math.max(0, cols - textLen - 3);
      line += ansi.reset;
      line += ' '.repeat(padding);
      line += `${ansi.fg.cyan}+${ansi.reset}`;

      // Record clickable region for worktree (entire row)
      this.clickableRegions.push({
        row: currentRow,
        startCol: 1,
        endCol: cols,
        type: 'worktree',
        item: wt,
      });

      output += line + '\n';
      currentRow++;
      currentIndex++;

      // Sessions under this worktree
      for (const session of wtSessions) {
        const isSessionSelected = currentIndex === this.state.selectedIndex;
        const isActive = session.id === this.state.activeSessionId;

        let sLine = '';
        if (isSessionSelected) {
          sLine += ansi.inverse;
        }
        if (isActive) {
          sLine += ansi.fg.yellow;
        } else {
          sLine += ansi.fg.gray;
        }

        const title = session.title.slice(0, cols - 4);
        sLine += ` └${title}`;
        sLine += ansi.reset;

        // Record clickable region for session (entire row)
        this.clickableRegions.push({
          row: currentRow,
          startCol: 1,
          endCol: cols,
          type: 'session',
          item: session,
        });

        output += sLine + '\n';
        currentRow++;
        currentIndex++;
      }
    }

    // "New Worktree" button
    output += '\n';
    currentRow++;
    const newWtText = '+ New Worktree';
    output += `${ansi.fg.cyan}${newWtText}${ansi.reset}\n`;

    // Record clickable region for new worktree button
    this.clickableRegions.push({
      row: currentRow,
      startCol: 1,
      endCol: cols,
      type: 'worktree',
      item: { id: '__new_worktree__' } as any,
    });
    currentRow++;

    // Help section at bottom (tabular format)
    const helpY = rows - 7;
    output += ansi.moveTo(helpY, 1);
    output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n`;
    output += `${ansi.fg.cyan}↵${ansi.reset}  ${ansi.dim}new/switch${ansi.reset}\n`;
    output += `${ansi.fg.cyan}n${ansi.reset}  ${ansi.dim}worktree${ansi.reset}\n`;
    output += `${ansi.fg.cyan}^T${ansi.reset} ${ansi.dim}terminal${ansi.reset}\n`;
    output += `${ansi.fg.cyan}r${ansi.reset}  ${ansi.dim}rename${ansi.reset}\n`;
    output += `${ansi.fg.cyan}d${ansi.reset}  ${ansi.dim}delete${ansi.reset}\n`;
    output += `${ansi.fg.cyan}^G${ansi.reset} ${ansi.dim}hide${ansi.reset}\n`;

    process.stdout.write(output);
  }

  private renderCollapsed(rows: number): void {
    let output = ansi.clearScreen;

    // Show expand indicator
    output += ansi.moveTo(1, 1);
    output += `${ansi.fg.cyan}▸${ansi.reset}`;

    // Show session count
    const sessionCount = this.state.sessions.length;
    if (sessionCount > 0) {
      output += ansi.moveTo(3, 1);
      output += `${ansi.fg.green}${sessionCount}${ansi.reset}`;
    }

    process.stdout.write(output);
  }

  private renderQuitModal(cols: number, rows: number): void {
    let output = ansi.clearScreen;

    // Center the modal vertically
    const modalStartY = Math.floor(rows / 2) - 3;

    output += ansi.moveTo(modalStartY, 1);
    output += `${ansi.bold}${ansi.fg.yellow}  Quit?${ansi.reset}\n`;
    output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n\n`;

    // Detach option
    const detachSelected = this.state.quitModalSelection === 'detach';
    if (detachSelected) {
      output += `${ansi.inverse}${ansi.fg.green} ▸ Detach ${ansi.reset}\n`;
    } else {
      output += `${ansi.fg.gray}   Detach${ansi.reset}\n`;
    }
    output += `${ansi.dim}   (keeps running)${ansi.reset}\n\n`;

    // Kill option
    const killSelected = this.state.quitModalSelection === 'kill';
    if (killSelected) {
      output += `${ansi.inverse}${ansi.fg.red} ▸ Kill ${ansi.reset}\n`;
    } else {
      output += `${ansi.fg.gray}   Kill${ansi.reset}\n`;
    }
    output += `${ansi.dim}   (ends sessions)${ansi.reset}\n`;

    // Help
    output += ansi.moveTo(rows - 2, 1);
    output += `${ansi.dim}↑↓ select  ↵ confirm  Esc cancel${ansi.reset}`;

    process.stdout.write(output);
  }

  private renderNewWorktreeInput(cols: number, rows: number): void {
    let output = ansi.clearScreen;

    output += ansi.moveTo(1, 1);
    output += `${ansi.bold}${ansi.fg.cyan}New Worktree${ansi.reset}\n`;
    output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n\n`;

    output += `${ansi.fg.white}Branch name:${ansi.reset}\n`;
    output += `${ansi.fg.yellow}> ${this.state.newWorktreeBranch}${ansi.reset}`;
    output += `${ansi.inverse} ${ansi.reset}`; // Cursor

    output += '\n\n';
    output += `${ansi.dim}Creates a new branch and${ansi.reset}\n`;
    output += `${ansi.dim}worktree from HEAD${ansi.reset}\n`;

    // Help
    output += ansi.moveTo(rows - 2, 1);
    output += `${ansi.dim}↵ create  Esc cancel${ansi.reset}`;

    process.stdout.write(output);
  }

  private renderRenameInput(cols: number, rows: number): void {
    let output = ansi.clearScreen;

    const isWorktree = this.state.renameTarget?.type === 'worktree';
    const title = isWorktree ? 'Rename Branch' : 'Rename Session';

    output += ansi.moveTo(1, 1);
    output += `${ansi.bold}${ansi.fg.cyan}${title}${ansi.reset}\n`;
    output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n\n`;

    output += `${ansi.fg.white}New name:${ansi.reset}\n`;
    output += `${ansi.fg.yellow}> ${this.state.renameValue}${ansi.reset}`;
    output += `${ansi.inverse} ${ansi.reset}`; // Cursor

    if (isWorktree) {
      output += '\n\n';
      output += `${ansi.dim}Renames branch and${ansi.reset}\n`;
      output += `${ansi.dim}moves worktree dir${ansi.reset}\n`;
    }

    // Help
    output += ansi.moveTo(rows - 2, 1);
    output += `${ansi.dim}↵ rename  Esc cancel${ansi.reset}`;

    process.stdout.write(output);
  }

  private renderNewSessionInput(cols: number, rows: number): void {
    let output = ansi.clearScreen;

    const worktreeName = this.state.newSessionWorktree?.branch || '';

    output += ansi.moveTo(1, 1);
    output += `${ansi.bold}${ansi.fg.cyan}New Session${ansi.reset}\n`;
    output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n\n`;

    output += `${ansi.fg.gray}Worktree: ${worktreeName}${ansi.reset}\n\n`;

    output += `${ansi.fg.white}Session name:${ansi.reset}\n`;
    output += `${ansi.fg.yellow}> ${this.state.newSessionName}${ansi.reset}`;
    output += `${ansi.inverse} ${ansi.reset}`; // Cursor

    output += '\n\n';
    output += `${ansi.dim}Creates Claude session${ansi.reset}\n`;
    output += `${ansi.dim}in this worktree${ansi.reset}\n`;

    // Help
    output += ansi.moveTo(rows - 2, 1);
    output += `${ansi.dim}↵ create  Esc cancel${ansi.reset}`;

    process.stdout.write(output);
  }

  private renderDeleteConfirmModal(cols: number, rows: number): void {
    let output = ansi.clearScreen;

    const target = this.state.deleteConfirmTarget;
    if (!target) return;

    const isSession = target.type === 'session';
    const itemName = isSession
      ? (target.item as Session).title
      : (target.item as Worktree).branch;

    // Center the modal vertically
    const modalStartY = Math.floor(rows / 2) - 5;

    output += ansi.moveTo(modalStartY, 1);
    output += `${ansi.bold}${ansi.fg.red}Delete ${isSession ? 'Session' : 'Worktree'}?${ansi.reset}\n`;
    output += `${ansi.dim}${'─'.repeat(cols - 1)}${ansi.reset}\n\n`;

    output += `${ansi.fg.white}${itemName}${ansi.reset}\n\n`;

    if (isSession) {
      output += `${ansi.dim}You can restore this later${ansi.reset}\n`;
      output += `${ansi.dim}using ${ansi.reset}${ansi.fg.cyan}claude /resume${ansi.reset}\n`;
    } else {
      output += `${ansi.dim}This will remove the${ansi.reset}\n`;
      output += `${ansi.dim}worktree and all sessions${ansi.reset}\n`;
    }

    output += '\n';

    // Yes option
    const yesSelected = this.state.deleteConfirmSelection === 'yes';
    if (yesSelected) {
      output += `${ansi.inverse}${ansi.fg.red} ▸ Yes, delete ${ansi.reset}\n`;
    } else {
      output += `${ansi.fg.gray}   Yes, delete${ansi.reset}\n`;
    }

    output += '\n';

    // No option
    const noSelected = this.state.deleteConfirmSelection === 'no';
    if (noSelected) {
      output += `${ansi.inverse}${ansi.fg.green} ▸ No, cancel ${ansi.reset}\n`;
    } else {
      output += `${ansi.fg.gray}   No, cancel${ansi.reset}\n`;
    }

    // Help
    output += ansi.moveTo(rows - 2, 1);
    output += `${ansi.dim}↑↓ select  ↵ confirm  Esc cancel${ansi.reset}`;

    process.stdout.write(output);
  }
}

// Main entry point for sidebar
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error('Usage: sidebar <repoPath> <sessionName> <rightPaneId> <sidebarPaneId>');
    process.exit(1);
  }

  const [repoPath, sessionName, rightPaneId, sidebarPaneId] = args;

  const sidebar = new Sidebar(repoPath, sessionName, rightPaneId, sidebarPaneId);
  await sidebar.init();
  sidebar.start();
}

main().catch((err) => {
  console.error('Sidebar error:', err);
  process.exit(1);
});
