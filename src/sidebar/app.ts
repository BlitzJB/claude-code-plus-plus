/**
 * Sidebar Application
 *
 * Main sidebar class that handles state management, input handling, and rendering.
 * Uses extracted managers for session, terminal, and pane operations.
 */

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import * as tmux from '../tmux';
import { WorktreeManager } from '../git';
import { parseKey, parseMouseEvent, isMouseEvent, setupRawMode, restoreMode } from './input';
import {
  ansi,
  buildListItems,
  renderMain,
  renderQuitModal,
  renderDeleteModal,
  renderInputModal,
  renderErrorModal,
  renderCollapsed,
  type RenderDimensions,
} from './render';
import type { SidebarState, Worktree, Session, ModalType, Terminal } from '../types';
import {
  SIDEBAR_WIDTH,
  SIDEBAR_LOG_PATH,
  DEFAULT_CLAUDE_CMD,
  TERMINAL_BAR_HEIGHT,
  CLAUDE_PANE_PERCENT,
} from '../constants';
import {
  setupTerminalBarResize,
  removeTerminalBarResize,
  enforceSidebarWidth,
  breakSessionPanes,
  joinSessionPanes,
} from './pane-orchestrator';
import * as sessionManager from './session-manager';
import * as terminalManager from './terminal-manager';
import { Logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { isValidBranchName, isValidSessionName } from '../utils/validation';
import { MAIN_COMMANDS, executeCommand, type CommandContext } from './commands';

// Create logger for sidebar
const logger = new Logger({
  level: 'debug',
  context: 'Sidebar',
  filePath: SIDEBAR_LOG_PATH,
});

// Debug logging helper (for backwards compatibility)
function debugLog(...args: unknown[]): void {
  logger.debug(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
}

// ============================================================================
// Sidebar App
// ============================================================================

export class SidebarApp {
  private state: SidebarState;
  private worktreeManager: WorktreeManager;
  private running = false;

  constructor(
    repoPath: string,
    sessionName: string,
    mainPaneId: string,
    sidebarPaneId: string
  ) {
    this.worktreeManager = new WorktreeManager(repoPath);

    this.state = {
      repoPath,
      sessionName,
      mainPaneId,
      sidebarPaneId,
      worktrees: [],
      sessions: [],
      selectedIndex: 0,
      activeSessionId: null,
      expandedWorktrees: new Set(),
      modal: 'none',
      modalSelection: 0,
      inputBuffer: '',
      deleteTarget: null,
      errorMessage: null,
      fullscreenModal: false,
      hiddenPaneId: null,
      collapsed: false,
      terminalCommandMode: false,
      terminalCommandBuffer: '',
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async init(): Promise<void> {
    this.state.worktrees = await this.worktreeManager.list();

    // Fallback if not a git repo
    if (this.state.worktrees.length === 0) {
      const { basename } = await import('path');
      this.state.worktrees = [{
        id: 'current',
        path: this.state.repoPath,
        branch: basename(this.state.repoPath),
        isMain: true,
      }];
    }
  }

  start(): void {
    this.running = true;

    // Set up terminal
    process.stdout.write(ansi.hideCursor);
    process.stdout.write(ansi.enableMouse);
    setupRawMode();

    // Input handling
    process.stdin.on('data', (data) => this.handleInput(data));

    // Resize handling
    process.stdout.on('resize', () => {
      this.syncCollapsedState();
      this.render();
    });

    // Initial render
    this.render();
  }

  stop(): void {
    this.running = false;
    process.stdout.write(ansi.disableMouse);
    process.stdout.write(ansi.showCursor);
    process.stdout.write(ansi.reset);
    restoreMode();
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  private render(): void {
    if (!this.running) return;

    let output: string;

    // Get dimensions - use tmux dimensions for fullscreen modals
    let dims: RenderDimensions | undefined;
    if (this.state.fullscreenModal) {
      const paneDims = tmux.getPaneDimensions(this.state.sidebarPaneId);
      dims = { cols: paneDims.width, rows: paneDims.height };
      debugLog('render: fullscreen dims', dims);
    }

    if (this.state.collapsed) {
      output = renderCollapsed(this.state.sessions.length);
    } else if (this.state.modal === 'quit') {
      output = renderQuitModal(this.state, dims);
    } else if (this.state.modal === 'delete') {
      const target = this.state.deleteTarget;
      const name = target?.name || '';
      output = renderDeleteModal(this.state, name, dims);
    } else if (this.state.modal === 'new-worktree') {
      output = renderInputModal(this.state, 'New Worktree', 'Branch name:', dims);
    } else if (this.state.modal === 'rename') {
      const target = this.getSelectedItem();
      const title = target?.type === 'session' ? 'Rename Session' : 'Rename Branch';
      output = renderInputModal(this.state, title, 'New name:', dims);
    } else if (this.state.modal === 'new-session') {
      output = renderInputModal(this.state, 'New Session', 'Session name:', dims);
    } else if (this.state.modal === 'error') {
      output = renderErrorModal(this.state, dims);
    } else {
      output = renderMain(this.state);
    }

    process.stdout.write(output);
  }

  private syncCollapsedState(): void {
    const width = process.stdout.columns || SIDEBAR_WIDTH;
    this.state.collapsed = width < SIDEBAR_WIDTH / 2;
  }

  // ==========================================================================
  // Input Handling
  // ==========================================================================

  private handleInput(data: Buffer): void {
    const str = data.toString();

    debugLog('handleInput:', 'hex=' + data.toString('hex'), 'modal=' + this.state.modal);

    // Handle terminal command mode (commands from terminal bar handler)
    if (this.state.terminalCommandMode) {
      if (str === '\r' || str === '\n') {
        // Enter - execute command
        this.executeTerminalCommand(this.state.terminalCommandBuffer);
        this.state.terminalCommandMode = false;
        this.state.terminalCommandBuffer = '';
        return;
      } else if (str === '\x1b') {
        // Escape - cancel
        this.state.terminalCommandMode = false;
        this.state.terminalCommandBuffer = '';
        return;
      } else {
        // Accumulate command
        this.state.terminalCommandBuffer += str;
        return;
      }
    }

    // Handle mouse events
    if (isMouseEvent(str)) {
      const event = parseMouseEvent(str);
      if (event && event.button === 0 && event.release) {
        this.handleClick(event.y, event.x);
      }
      return;
    }

    const key = parseKey(data);
    debugLog('parsedKey:', key.key, 'ctrl=' + key.ctrl);

    // Ctrl+U - enter terminal command mode (for commands from bar handler)
    if (key.ctrl && key.key === 'u') {
      this.state.terminalCommandMode = true;
      this.state.terminalCommandBuffer = '';
      return;
    }

    // Route input based on modal state
    switch (this.state.modal) {
      case 'quit':
        this.handleQuitModalInput(key);
        break;
      case 'delete':
        this.handleDeleteModalInput(key);
        break;
      case 'error':
        this.handleErrorModalInput(key);
        break;
      case 'new-worktree':
      case 'rename':
      case 'new-session':
        this.handleTextInput(key, data);
        break;
      default:
        this.handleMainInput(key);
    }
  }

  private handleMainInput(key: { key: string; ctrl: boolean; alt: boolean }): void {
    // If collapsed, expand on any key first
    if (this.state.collapsed) {
      this.state.collapsed = false;
      this.enforceSidebarWidth();
      this.render();
      return;
    }

    // Create command context with action handlers
    const context: CommandContext = {
      state: this.state,
      actions: {
        moveUp: () => {
          this.state.selectedIndex = Math.max(0, this.state.selectedIndex - 1);
          this.render();
        },
        moveDown: () => {
          const maxIndex = this.getMaxIndex();
          this.state.selectedIndex = Math.min(maxIndex, this.state.selectedIndex + 1);
          this.render();
        },
        activateSelected: () => {
          debugLog('handleMainInput: enter pressed, calling activateSelected');
          this.activateSelected();
        },
        showQuitModal: () => {
          this.enterFullscreenModal();
          this.state.modal = 'quit';
          this.state.modalSelection = 0;
          this.render();
        },
        showDeleteModal: () => {
          const item = this.getSelectedItem();
          if (item && !(item.type === 'worktree' && item.worktree?.isMain)) {
            this.state.deleteTarget = {
              type: item.type,
              id: item.id,
              name: item.type === 'session' ? (item.session?.title || '') : (item.worktree?.branch || ''),
              worktree: item.worktree,
              session: item.session,
            };
            this.enterFullscreenModal();
            this.state.modal = 'delete';
            this.state.modalSelection = 0;
            this.render();
          }
        },
        showNewWorktreeModal: () => {
          this.enterFullscreenModal();
          this.state.modal = 'new-worktree';
          this.state.inputBuffer = '';
          this.render();
        },
        showRenameModal: () => {
          const item = this.getSelectedItem();
          if (item && !(item.type === 'worktree' && item.worktree?.isMain)) {
            this.enterFullscreenModal();
            this.state.modal = 'rename';
            this.state.inputBuffer = item.type === 'session'
              ? item.session?.title || ''
              : item.worktree?.branch || '';
            this.render();
          }
        },
        toggleCollapsed: () => this.toggleCollapsed(),
        createTerminal: () => this.createTerminal(),
        render: () => this.render(),
      },
    };

    // Execute command from map
    executeCommand(MAIN_COMMANDS, key, context);
  }

  private handleQuitModalInput(key: { key: string; ctrl: boolean }): void {
    // Escape - close modal
    if (key.key === 'escape') {
      this.state.modal = 'none';
      this.exitFullscreenModal();
      this.render();
      return;
    }

    // Arrow keys - toggle selection
    if (key.key === 'up' || key.key === 'down' || key.key === 'j' || key.key === 'k') {
      this.state.modalSelection = this.state.modalSelection === 0 ? 1 : 0;
      this.render();
      return;
    }

    // Enter - confirm
    if (key.key === 'enter') {
      if (this.state.modalSelection === 0) {
        // Detach
        this.state.modal = 'none';
        this.exitFullscreenModal();
        this.render();
        tmux.detachClient();
      } else {
        // Kill - no need to restore pane since we're exiting
        this.stop();
        tmux.killSession(this.state.sessionName);
        process.exit(0);
      }
      return;
    }
  }

  private handleDeleteModalInput(key: { key: string }): void {
    // Escape - cancel
    if (key.key === 'escape') {
      this.state.modal = 'none';
      this.state.deleteTarget = null;
      this.exitFullscreenModal();
      this.render();
      return;
    }

    // Arrow keys - toggle selection
    if (key.key === 'up' || key.key === 'down' || key.key === 'j' || key.key === 'k') {
      this.state.modalSelection = this.state.modalSelection === 0 ? 1 : 0;
      this.render();
      return;
    }

    // Enter - confirm
    if (key.key === 'enter') {
      if (this.state.modalSelection === 1) {
        this.deleteSelected();
      }
      this.state.modal = 'none';
      this.state.deleteTarget = null;
      this.exitFullscreenModal();
      this.render();
      return;
    }

    // Quick keys
    if (key.key === 'y' || key.key === 'Y') {
      this.deleteSelected();
      this.state.modal = 'none';
      this.state.deleteTarget = null;
      this.exitFullscreenModal();
      this.render();
      return;
    }

    if (key.key === 'n' || key.key === 'N') {
      this.state.modal = 'none';
      this.state.deleteTarget = null;
      this.exitFullscreenModal();
      this.render();
      return;
    }
  }

  private handleErrorModalInput(key: { key: string }): void {
    // Any key dismisses the error modal
    if (key.key === 'escape' || key.key === 'enter' || key.key === ' ') {
      this.state.modal = 'none';
      this.state.errorMessage = null;
      this.exitFullscreenModal();
      this.render();
      return;
    }
  }

  private showError(message: string): void {
    debugLog('showError:', message);
    this.enterFullscreenModal();
    this.state.modal = 'error';
    this.state.errorMessage = message;
    this.render();
  }

  private handleTextInput(key: { key: string }, data: Buffer): void {
    debugLog('handleTextInput: key=' + key.key, 'modal=' + this.state.modal, 'buffer=' + this.state.inputBuffer);

    // Escape - cancel
    if (key.key === 'escape') {
      debugLog('handleTextInput: escape pressed, canceling');
      this.state.modal = 'none';
      this.state.inputBuffer = '';
      this.exitFullscreenModal();
      this.render();
      return;
    }

    // Enter - confirm
    if (key.key === 'enter') {
      const value = this.state.inputBuffer.trim();
      debugLog('handleTextInput: enter pressed, value=' + value);
      const wasNewSession = this.state.modal === 'new-session';
      if (value) {
        debugLog('handleTextInput: calling confirmTextInput');
        this.confirmTextInput(value);
      }
      this.state.modal = 'none';
      this.state.inputBuffer = '';
      this.exitFullscreenModal();
      // After creating a new session, focus the Claude pane (exitFullscreenModal selects sidebar)
      if (wasNewSession && value) {
        const activeSession = this.state.sessions.find(s => s.id === this.state.activeSessionId);
        if (activeSession) {
          tmux.selectPane(activeSession.paneId);
        }
      }
      this.render();
      return;
    }

    // Backspace
    if (key.key === 'backspace') {
      this.state.inputBuffer = this.state.inputBuffer.slice(0, -1);
      this.render();
      return;
    }

    // Regular characters
    if (data.length === 1 && data[0] >= 32 && data[0] < 127) {
      const char = String.fromCharCode(data[0]);

      // For branch names, only allow valid characters
      if (this.state.modal === 'new-worktree') {
        if (/[a-zA-Z0-9\-_\/.]/.test(char)) {
          this.state.inputBuffer += char;
          this.render();
        }
      } else {
        this.state.inputBuffer += char;
        this.render();
      }
    }
  }

  private confirmTextInput(value: string): void {
    const trimmed = value.trim();

    switch (this.state.modal) {
      case 'new-worktree':
        if (!isValidBranchName(trimmed)) {
          this.showError('Invalid branch name. Avoid special characters like ~ ^ : ? * [ ] \\');
          return;
        }
        this.createWorktree(trimmed);
        break;

      case 'rename':
        if (!isValidSessionName(trimmed)) {
          this.showError('Invalid name. Please use a shorter name without control characters.');
          return;
        }
        this.renameSelected(trimmed);
        break;

      case 'new-session':
        if (!isValidSessionName(trimmed)) {
          this.showError('Invalid session name. Please use a shorter name without control characters.');
          return;
        }
        // Check for duplicate session names
        if (this.state.sessions.some(s => s.title === trimmed)) {
          this.showError('A session with this name already exists.');
          return;
        }
        this.createSession(trimmed);
        break;
    }
  }

  private handleClick(row: number, col: number): void {
    const cols = process.stdout.columns || SIDEBAR_WIDTH;

    if (this.state.collapsed) {
      this.state.collapsed = false;
      this.enforceSidebarWidth();
      this.render();
      return;
    }

    // Ignore clicks when modals are open
    if (this.state.modal !== 'none') return;

    // Check for collapse button click (row 1, right side)
    if (row === 1 && col >= cols - 3) {
      this.toggleCollapsed();
      return;
    }

    // Build items and find clicked item
    const items = buildListItems(this.state);
    const itemRow = row - 3; // Header takes 2 rows

    // Check for "New Worktree" button click (after items + 1 empty row)
    const newWorktreeRow = items.length + 1; // +1 for empty row after items
    if (itemRow === newWorktreeRow) {
      this.enterFullscreenModal();
      this.state.modal = 'new-worktree';
      this.state.inputBuffer = '';
      this.render();
      return;
    }

    if (itemRow >= 0 && itemRow < items.length) {
      this.state.selectedIndex = itemRow;
      this.activateSelected();
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  private activateSelected(): void {
    debugLog('activateSelected: selectedIndex=' + this.state.selectedIndex);
    const item = this.getSelectedItem();
    debugLog('activateSelected: item=', item);

    if (!item) {
      debugLog('activateSelected: no item found');
      return;
    }

    if (item.type === 'worktree') {
      // Show new session modal
      debugLog('activateSelected: showing new-session modal for worktree', item.worktree?.branch);
      this.enterFullscreenModal();
      this.state.modal = 'new-session';
      const sessions = this.state.sessions.filter(s => s.worktreeId === item.id);
      this.state.inputBuffer = `${sessions.length + 1}: ${item.worktree?.branch || 'session'}`;
      this.render();
    } else {
      // Switch to session
      debugLog('activateSelected: switching to session', item.session?.title);
      this.switchToSession(item.session!);
    }
  }

  private async createWorktree(branchName: string): Promise<void> {
    try {
      const worktree = await this.worktreeManager.create(branchName, true);
      this.state.worktrees.push(worktree);
      this.state.selectedIndex = this.getMaxIndex();
      this.render();
    } catch (err) {
      logger.error('Failed to create worktree', err);
      this.showError(`Failed to create worktree: ${getErrorMessage(err)}`);
    }
  }

  private createSession(title: string): void {
    debugLog('createSession: title=' + title);
    const item = this.getSelectedItem();
    debugLog('createSession: selectedItem=', item);

    if (!item || item.type !== 'worktree') {
      debugLog('createSession: FAILED - item is not a worktree or is null');
      return;
    }

    const worktree = item.worktree!;
    debugLog('createSession: worktree=' + worktree.branch, 'path=' + worktree.path);
    const sessionId = sessionManager.generateSessionId();

    let paneId: string;
    const claudeCmd = DEFAULT_CLAUDE_CMD;

    if (this.state.sessions.length === 0) {
      // First session - use existing main pane
      // If in fullscreen mode, the pane is broken but we can still send keys to it
      // exitFullscreenModal will join it back
      paneId = this.state.mainPaneId;
      tmux.sendControlKey(paneId, 'C-c');
      tmux.sendKeys(paneId, `cd "${worktree.path}" && clear && ${claudeCmd}`, true);
    } else {
      // Additional session - need to handle fullscreen mode specially
      const currentSession = this.state.sessions.find(s => s.id === this.state.activeSessionId);

      if (this.state.fullscreenModal) {
        // In fullscreen mode, the current session pane is already broken
        // We'll create a new pane and DON'T want to rejoin the old one
        // Clear hiddenPaneId so exitFullscreenModal won't join it back
        // The old session stays hidden and can be switched to later
        debugLog('createSession: in fullscreen mode, clearing hiddenPaneId to keep old session hidden');
        this.state.hiddenPaneId = null;
      } else if (currentSession) {
        // Normal mode - break the current session pane
        tmux.breakPane(currentSession.paneId);
      }

      paneId = tmux.splitHorizontal(this.state.sessionName, 80, worktree.path);
      tmux.sendKeys(paneId, claudeCmd, true);
    }

    const session: Session = {
      id: sessionId,
      worktreeId: worktree.id,
      paneId,
      title,
      createdAt: Date.now(),
      // Terminal management
      terminals: [],
      activeTerminalIndex: 0,
      terminalBarPaneId: null,
    };

    this.state.sessions.push(session);
    this.state.activeSessionId = sessionId;

    this.enforceSidebarWidth();
    // Focus the Claude pane so user can start interacting immediately
    tmux.selectPane(paneId);
    this.render();
  }

  private switchToSession(session: Session): void {
    if (session.id === this.state.activeSessionId) {
      // Already active - focus pane
      tmux.selectPane(session.paneId);
      return;
    }

    // Break current session's panes (Claude pane + terminals)
    const currentSession = this.state.sessions.find(s => s.id === this.state.activeSessionId);
    if (currentSession) {
      // Break active terminal first (if any)
      if (currentSession.terminals.length > 0) {
        const activeTerminal = currentSession.terminals[currentSession.activeTerminalIndex];
        if (activeTerminal) {
          tmux.breakPane(activeTerminal.paneId);
        }
        // Break terminal bar
        if (currentSession.terminalBarPaneId) {
          tmux.breakPane(currentSession.terminalBarPaneId);
        }
      }
      // Break Claude pane
      tmux.breakPane(currentSession.paneId);
    }

    // Join new session's Claude pane
    tmux.joinPane(session.paneId, this.state.sidebarPaneId, true);

    // Join terminal bar and active terminal if session has terminals
    if (session.terminals.length > 0 && session.terminalBarPaneId) {
      // Join terminal bar below Claude pane
      tmux.joinPane(session.terminalBarPaneId, session.paneId, false);

      // Join active terminal below terminal bar
      const activeTerminal = session.terminals[session.activeTerminalIndex];
      if (activeTerminal) {
        tmux.joinPane(activeTerminal.paneId, session.terminalBarPaneId, false);
      }

      // Ensure terminal bar is exactly 1 row
      tmux.resizePane(session.terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);

      // Update resize enforcement for this session's terminal bar
      if (activeTerminal) {
        setupTerminalBarResize(
          this.state.sessionName,
          session.paneId,
          session.terminalBarPaneId,
          activeTerminal.paneId
        );
      }

      // Update terminal bar display
      this.updateTerminalBar(session);
    }

    this.state.activeSessionId = session.id;
    this.enforceSidebarWidth();
    tmux.selectPane(this.state.sidebarPaneId);
    this.render();
  }

  private async deleteSelected(): Promise<void> {
    const item = this.getSelectedItem();
    if (!item) return;

    if (item.type === 'session') {
      this.deleteSession(item.session!);
    } else if (item.type === 'worktree' && !item.worktree?.isMain) {
      await this.deleteWorktree(item.worktree!);
    }
  }

  private deleteSession(session: Session): void {
    // Kill all terminal panes
    for (const terminal of session.terminals) {
      tmux.killPane(terminal.paneId);
    }
    // Kill terminal bar pane and remove hook
    if (session.terminalBarPaneId) {
      try {
        tmux.removeHook(this.state.sessionName, 'after-resize-pane');
      } catch {
        // Hook may not exist, ignore
      }
      tmux.killPane(session.terminalBarPaneId);
    }
    // Kill the Claude pane
    tmux.killPane(session.paneId);

    // Remove from sessions
    this.state.sessions = this.state.sessions.filter(s => s.id !== session.id);

    // If this was active, switch to another
    if (this.state.activeSessionId === session.id) {
      this.state.activeSessionId = null;

      if (this.state.sessions.length > 0) {
        const nextSession = this.state.sessions[0];
        tmux.joinPane(nextSession.paneId, this.state.sidebarPaneId, true);
        this.state.activeSessionId = nextSession.id;

        // Join terminal panes if next session has terminals
        if (nextSession.terminals.length > 0 && nextSession.terminalBarPaneId) {
          tmux.joinPane(nextSession.terminalBarPaneId, nextSession.paneId, false);
          const activeTerminal = nextSession.terminals[nextSession.activeTerminalIndex];
          if (activeTerminal) {
            tmux.joinPane(activeTerminal.paneId, nextSession.terminalBarPaneId, false);
          }
          tmux.resizePane(nextSession.terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);

          // Update resize enforcement for the new session's terminal bar
          if (activeTerminal) {
            setupTerminalBarResize(
              this.state.sessionName,
              nextSession.paneId,
              nextSession.terminalBarPaneId,
              activeTerminal.paneId
            );
          }

          this.updateTerminalBar(nextSession);
        }

        this.enforceSidebarWidth();
      } else {
        // No more sessions - create empty pane
        const newPaneId = tmux.splitHorizontal(this.state.sessionName, 80, this.state.repoPath);
        this.state.mainPaneId = newPaneId;
        tmux.sendKeys(newPaneId, 'echo "Press Enter in sidebar to start a session"', true);
        this.enforceSidebarWidth();
      }

      tmux.selectPane(this.state.sidebarPaneId);
    }

    // Adjust selection
    this.state.selectedIndex = Math.max(0, this.state.selectedIndex - 1);
    this.render();
  }

  private async deleteWorktree(worktree: Worktree): Promise<void> {
    // Delete all sessions for this worktree (including their terminals)
    const sessionsToDelete = this.state.sessions.filter(s => s.worktreeId === worktree.id);
    for (const session of sessionsToDelete) {
      // Kill all terminal panes
      for (const terminal of session.terminals) {
        tmux.killPane(terminal.paneId);
      }
      // Kill terminal bar pane and remove hook
      if (session.terminalBarPaneId) {
        try {
          tmux.removeHook(this.state.sessionName, 'after-resize-pane');
        } catch {
          // Hook may not exist, ignore
        }
        tmux.killPane(session.terminalBarPaneId);
      }
      // Kill Claude pane
      tmux.killPane(session.paneId);
    }

    this.state.sessions = this.state.sessions.filter(s => s.worktreeId !== worktree.id);

    // If active session was deleted, switch to another
    if (sessionsToDelete.some(s => s.id === this.state.activeSessionId)) {
      this.state.activeSessionId = null;

      if (this.state.sessions.length > 0) {
        const nextSession = this.state.sessions[0];
        tmux.joinPane(nextSession.paneId, this.state.sidebarPaneId, true);
        this.state.activeSessionId = nextSession.id;

        // Join terminal panes if next session has terminals
        if (nextSession.terminals.length > 0 && nextSession.terminalBarPaneId) {
          tmux.joinPane(nextSession.terminalBarPaneId, nextSession.paneId, false);
          const activeTerminal = nextSession.terminals[nextSession.activeTerminalIndex];
          if (activeTerminal) {
            tmux.joinPane(activeTerminal.paneId, nextSession.terminalBarPaneId, false);
          }
          tmux.resizePane(nextSession.terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);

          // Update resize enforcement for the new session's terminal bar
          if (activeTerminal) {
            setupTerminalBarResize(
              this.state.sessionName,
              nextSession.paneId,
              nextSession.terminalBarPaneId,
              activeTerminal.paneId
            );
          }

          this.updateTerminalBar(nextSession);
        }

        this.enforceSidebarWidth();
      }

      tmux.selectPane(this.state.sidebarPaneId);
    }

    // Remove worktree via git
    try {
      await this.worktreeManager.remove(worktree.path, true);
    } catch (err) {
      logger.error('Failed to delete worktree', err);
      this.showError(`Failed to delete worktree: ${getErrorMessage(err)}`);
      return;
    }

    // Remove from state
    this.state.worktrees = this.state.worktrees.filter(w => w.id !== worktree.id);

    // Adjust selection
    const totalItems = this.getTotalItemCount();
    if (this.state.selectedIndex >= totalItems) {
      this.state.selectedIndex = Math.max(0, totalItems - 1);
    }

    this.render();
  }

  private renameSelected(newName: string): void {
    const item = this.getSelectedItem();
    if (!item) return;

    if (item.type === 'session' && item.session) {
      item.session.title = newName;
    }
    // Worktree rename would require git branch rename - skip for now
  }

  private toggleCollapsed(): void {
    this.state.collapsed = !this.state.collapsed;

    if (this.state.collapsed) {
      tmux.resizePane(this.state.sidebarPaneId, 2);
    } else {
      this.enforceSidebarWidth();
    }

    this.render();
  }

  private enforceSidebarWidth(): void {
    if (!this.state.collapsed) {
      enforceSidebarWidth(this.state.sidebarPaneId);
    }
  }

  // ==========================================================================
  // Terminal Management
  // ==========================================================================

  /**
   * Execute a terminal command received from the bar handler
   * Format: "TERM:<action>:<data>"
   */
  private executeTerminalCommand(command: string): void {
    debugLog('executeTerminalCommand:', command);

    if (!command.startsWith('TERM:')) return;

    const parts = command.slice(5).split(':');
    const action = parts[0];
    const data = parts[1] || '';

    const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
    if (!session && action !== 'escape') return;

    switch (action) {
      case 'switch':
        const index = parseInt(data, 10);
        if (!isNaN(index) && session) {
          this.switchToTerminal(session, index);
        }
        break;
      case 'new':
        this.createTerminal();
        break;
      case 'delete':
        const delIndex = parseInt(data, 10);
        if (!isNaN(delIndex) && session) {
          this.deleteTerminal(session, delIndex);
        }
        break;
      case 'focus':
        if (session && session.terminals.length > 0) {
          const activeTerminal = session.terminals[session.activeTerminalIndex];
          if (activeTerminal) {
            tmux.selectPane(activeTerminal.paneId);
          }
        }
        break;
      case 'escape':
        tmux.selectPane(this.state.sidebarPaneId);
        break;
    }
  }

  /**
   * Create a new terminal for the active session
   */
  private createTerminal(): void {
    if (!this.state.activeSessionId) {
      debugLog('createTerminal: no active session');
      return;
    }

    const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
    if (!session) return;

    const worktree = this.state.worktrees.find(w => w.id === session.worktreeId);
    if (!worktree) return;

    const terminalNum = session.terminals.length + 1;
    const terminalTitle = `Terminal ${terminalNum}`;
    const terminalId = terminalManager.generateTerminalId();

    debugLog('createTerminal:', terminalTitle, 'for session', session.title);

    if (session.terminals.length === 0) {
      // First terminal - need to create terminal bar pane + terminal pane
      // Split Claude pane vertically (Claude gets top 70%, terminal area gets bottom 30%)
      tmux.selectPane(session.paneId);
      const terminalAreaPaneId = tmux.splitVertical(this.state.sessionName, 100 - CLAUDE_PANE_PERCENT, worktree.path);

      // Split terminal area: top 1 row for bar, rest for terminal
      tmux.selectPane(terminalAreaPaneId);
      const terminalPaneId = tmux.splitVertical(this.state.sessionName, 95, worktree.path);

      // The terminalAreaPaneId is now the bar pane (top part after split)
      const terminalBarPaneId = terminalAreaPaneId;

      // Resize bar pane to exactly 1 row
      tmux.resizePane(terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);

      // Set up resize enforcement (hook + mouse binding)
      setupTerminalBarResize(
        this.state.sessionName,
        session.paneId,
        terminalBarPaneId,
        terminalPaneId
      );

      // Update session
      session.terminalBarPaneId = terminalBarPaneId;
      session.terminals.push({
        id: terminalId,
        sessionId: session.id,
        paneId: terminalPaneId,
        title: terminalTitle,
        createdAt: Date.now(),
      });
      session.activeTerminalIndex = 0;

      // Start terminal bar handler in the bar pane
      this.startTerminalBarHandler(session);

      // Focus the terminal pane
      tmux.selectPane(terminalPaneId);

    } else {
      // Additional terminal - split current terminal, break old, show new
      const currentTerminal = session.terminals[session.activeTerminalIndex];

      // Split from current terminal to create new one
      tmux.selectPane(currentTerminal.paneId);
      const newTerminalPaneId = tmux.splitVertical(this.state.sessionName, 50, worktree.path);

      // Break the current terminal to background
      tmux.breakPane(currentTerminal.paneId);

      // Add new terminal
      session.terminals.push({
        id: terminalId,
        sessionId: session.id,
        paneId: newTerminalPaneId,
        title: terminalTitle,
        createdAt: Date.now(),
      });
      session.activeTerminalIndex = session.terminals.length - 1;

      // Ensure terminal bar stays at 1 row after the split
      if (session.terminalBarPaneId) {
        tmux.resizePane(session.terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);
      }

      // Update terminal bar
      this.updateTerminalBar(session);

      // Focus the new terminal
      tmux.selectPane(newTerminalPaneId);
    }

    // Ensure sidebar stays at fixed width
    this.enforceSidebarWidth();
    this.render();
  }

  /**
   * Switch to a different terminal tab within a session
   */
  private switchToTerminal(session: Session, targetIndex: number): void {
    if (targetIndex < 0 || targetIndex >= session.terminals.length) return;
    if (targetIndex === session.activeTerminalIndex) return;

    debugLog('switchToTerminal:', targetIndex, 'in session', session.title);

    const currentTerminal = session.terminals[session.activeTerminalIndex];
    const newTerminal = session.terminals[targetIndex];

    // Break current terminal to background
    tmux.breakPane(currentTerminal.paneId);

    // Join new terminal below the bar pane
    if (session.terminalBarPaneId) {
      tmux.joinPane(newTerminal.paneId, session.terminalBarPaneId, false);
      // Ensure terminal bar stays at 1 row
      tmux.resizePane(session.terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);
    }

    // Update active index
    session.activeTerminalIndex = targetIndex;

    // Update terminal bar
    this.updateTerminalBar(session);

    this.enforceSidebarWidth();
  }

  /**
   * Delete a terminal at the given index
   */
  private deleteTerminal(session: Session, index: number): void {
    if (index < 0 || index >= session.terminals.length) return;

    debugLog('deleteTerminal:', index, 'in session', session.title);

    const terminal = session.terminals[index];
    const wasActive = index === session.activeTerminalIndex;

    // Kill the terminal pane
    tmux.killPane(terminal.paneId);

    // Remove from terminals array
    session.terminals.splice(index, 1);

    if (session.terminals.length === 0) {
      // No more terminals - kill terminal bar pane and remove resize hook
      if (session.terminalBarPaneId) {
        // Remove the after-resize-pane hook for this session
        try {
          tmux.removeHook(this.state.sessionName, 'after-resize-pane');
        } catch {
          // Hook may not exist, ignore
        }
        tmux.killPane(session.terminalBarPaneId);
        session.terminalBarPaneId = null;
      }
      session.activeTerminalIndex = 0;
    } else {
      // Adjust activeTerminalIndex
      if (index < session.activeTerminalIndex) {
        session.activeTerminalIndex--;
      } else if (session.activeTerminalIndex >= session.terminals.length) {
        session.activeTerminalIndex = session.terminals.length - 1;
      }

      // If deleted was the visible terminal, show the new active one
      if (wasActive) {
        const newActiveTerminal = session.terminals[session.activeTerminalIndex];
        if (newActiveTerminal && session.terminalBarPaneId) {
          tmux.joinPane(newActiveTerminal.paneId, session.terminalBarPaneId, false);
          tmux.resizePane(session.terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);
        }
      }

      // Update terminal bar
      this.updateTerminalBar(session);
    }

    this.enforceSidebarWidth();
    this.render();
  }

  /**
   * Start the terminal bar handler in a session's bar pane
   */
  private startTerminalBarHandler(session: Session): void {
    if (!session.terminalBarPaneId) return;

    // Build the command to run the bar handler
    // We pass the initial state as a JSON argument
    const initialState = JSON.stringify({
      terminals: session.terminals,
      activeIndex: session.activeTerminalIndex,
    });

    // Get path to bar-handler - check for .ts first (dev mode), then .js (compiled)
    // Check both src and dist locations
    const tsPath = resolve(__dirname, '../terminal/bar-handler.ts');
    const jsPath = resolve(__dirname, '../terminal/bar-handler.js');

    let cmd: string;
    const escapedState = initialState.replace(/'/g, "'\\''");
    const args = `"${this.state.sidebarPaneId}" "${session.id}" '${escapedState}'`;

    // Check which file exists
    if (existsSync(tsPath)) {
      cmd = `npx tsx "${tsPath}" ${args}`;
    } else if (existsSync(jsPath)) {
      cmd = `node "${jsPath}" ${args}`;
    } else {
      debugLog('startTerminalBarHandler: bar-handler not found at', tsPath, 'or', jsPath);
      return;
    }

    debugLog('startTerminalBarHandler:', cmd);
    tmux.sendKeys(session.terminalBarPaneId, cmd, true);
  }

  /**
   * Send updated state to the terminal bar handler
   */
  private updateTerminalBar(session: Session): void {
    if (!session.terminalBarPaneId) return;

    const renderData = JSON.stringify({
      terminals: session.terminals,
      activeIndex: session.activeTerminalIndex,
    });

    // Send render command to bar handler
    tmux.sendKeys(session.terminalBarPaneId, `RENDER:${renderData}`, false);
  }

  // ==========================================================================
  // Fullscreen Modal Management
  // ==========================================================================

  /**
   * Enter fullscreen modal mode - hides all session panes so sidebar can expand
   */
  private enterFullscreenModal(): void {
    if (this.state.fullscreenModal) return; // Already in fullscreen

    debugLog('enterFullscreenModal: hiding panes');

    if (this.state.activeSessionId) {
      // Hide the active session's panes (Claude pane + terminals)
      const activeSession = this.state.sessions.find(s => s.id === this.state.activeSessionId);
      if (activeSession) {
        try {
          // Break active terminal first (if any)
          if (activeSession.terminals.length > 0) {
            const activeTerminal = activeSession.terminals[activeSession.activeTerminalIndex];
            if (activeTerminal) {
              tmux.breakPane(activeTerminal.paneId);
            }
            // Break terminal bar
            if (activeSession.terminalBarPaneId) {
              tmux.breakPane(activeSession.terminalBarPaneId);
            }
          }
          // Break Claude pane
          tmux.breakPane(activeSession.paneId);
          this.state.hiddenPaneId = activeSession.paneId;
          debugLog('enterFullscreenModal: broke session panes');
        } catch (err) {
          debugLog('enterFullscreenModal: failed to break panes', err);
        }
      }
    } else {
      // Hide the main/welcome pane
      try {
        tmux.breakPane(this.state.mainPaneId);
        this.state.hiddenPaneId = this.state.mainPaneId;
        debugLog('enterFullscreenModal: broke main pane');
      } catch (err) {
        debugLog('enterFullscreenModal: failed to break main pane', err);
      }
    }

    this.state.fullscreenModal = true;
  }

  /**
   * Exit fullscreen modal mode - restores all session panes
   */
  private exitFullscreenModal(): void {
    if (!this.state.fullscreenModal) return; // Not in fullscreen

    debugLog('exitFullscreenModal: restoring panes');

    if (this.state.hiddenPaneId) {
      try {
        // Join Claude pane
        tmux.joinPane(this.state.hiddenPaneId, this.state.sidebarPaneId, true);
        debugLog('exitFullscreenModal: joined Claude pane');

        // If active session has terminals, join those too
        const activeSession = this.state.sessions.find(s => s.id === this.state.activeSessionId);
        if (activeSession && activeSession.terminals.length > 0 && activeSession.terminalBarPaneId) {
          // Join terminal bar below Claude pane
          tmux.joinPane(activeSession.terminalBarPaneId, activeSession.paneId, false);

          // Join active terminal below terminal bar
          const activeTerminal = activeSession.terminals[activeSession.activeTerminalIndex];
          if (activeTerminal) {
            tmux.joinPane(activeTerminal.paneId, activeSession.terminalBarPaneId, false);
          }

          // Ensure terminal bar is exactly 1 row
          tmux.resizePane(activeSession.terminalBarPaneId, undefined, TERMINAL_BAR_HEIGHT);

          // Update terminal bar display
          this.updateTerminalBar(activeSession);
          debugLog('exitFullscreenModal: joined terminal panes');
        }

        this.enforceSidebarWidth();
      } catch (err) {
        debugLog('exitFullscreenModal: failed to join panes', err);
      }
      this.state.hiddenPaneId = null;
    }

    this.state.fullscreenModal = false;
    tmux.selectPane(this.state.sidebarPaneId);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getMaxIndex(): number {
    return Math.max(0, this.getTotalItemCount() - 1);
  }

  private getTotalItemCount(): number {
    let count = 0;
    for (const wt of this.state.worktrees) {
      count++; // worktree
      count += this.state.sessions.filter(s => s.worktreeId === wt.id).length;
    }
    return count;
  }

  private getSelectedItem(): { type: 'worktree' | 'session'; id: string; worktree?: Worktree; session?: Session } | null {
    const items = buildListItems(this.state);
    const item = items[this.state.selectedIndex];
    if (!item) return null;

    return {
      type: item.type,
      id: item.id,
      worktree: item.worktree,
      session: item.session,
    };
  }
}
