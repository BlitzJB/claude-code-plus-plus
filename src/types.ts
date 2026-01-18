/**
 * Core Type Definitions
 */

// ============================================================================
// Diff View Mode
// ============================================================================

export type DiffViewMode = 'diffs-only' | 'whole-file';

// ============================================================================
// Worktree Types
// ============================================================================

export interface Worktree {
  id: string;
  path: string;
  branch: string;
  isMain: boolean;
}

// ============================================================================
// Terminal Types
// ============================================================================

export interface Terminal {
  id: string;
  sessionId: string;
  paneId: string;
  title: string;
  createdAt: number;
}

// ============================================================================
// Session Types
// ============================================================================

export interface Session {
  id: string;
  worktreeId: string;
  paneId: string;
  title: string;
  createdAt: number;
  // Terminal management
  terminals: Terminal[];
  activeTerminalIndex: number;
  terminalBarPaneId: string | null;
  // Diff pane
  diffPaneId: string | null;
  diffPaneManuallyHidden: boolean;  // True if user manually closed diff pane
  diffViewMode: DiffViewMode;       // View mode for file diff: 'diffs-only' or 'whole-file'
  // File diff view panes (when viewing individual file diff)
  fileDiffHeaderPaneId: string | null;   // The 1-row header pane
  fileDiffContentPaneId: string | null;  // The pane showing file content (uses less)
}

// ============================================================================
// Sidebar State
// ============================================================================

export type ModalType = 'none' | 'quit' | 'delete' | 'new-worktree' | 'new-session' | 'rename' | 'error';

export interface DeleteTarget {
  type: 'session' | 'worktree';
  id: string;
  name: string;
  worktree?: Worktree;
  session?: Session;
}

export interface SidebarState {
  // Core data
  repoPath: string;
  sessionName: string;
  mainPaneId: string;
  sidebarPaneId: string;

  // Worktrees and sessions
  worktrees: Worktree[];
  sessions: Session[];

  // Selection
  selectedIndex: number;
  activeSessionId: string | null;
  expandedWorktrees: Set<string>;

  // Modal state
  modal: ModalType;
  modalSelection: number;
  inputBuffer: string;
  deleteTarget: DeleteTarget | null;
  errorMessage: string | null;

  // Fullscreen modal state
  fullscreenModal: boolean;
  hiddenPaneId: string | null;

  // UI state
  collapsed: boolean;

  // Terminal command mode (for receiving commands from terminal bar)
  terminalCommandMode: boolean;
  terminalCommandBuffer: string;

  // Diff command mode (for receiving commands from diff pane)
  diffCommandMode: boolean;
  diffCommandBuffer: string;

  // File diff view state (when viewing a file diff in Claude pane area)
  fileDiffMode: boolean;
  fileDiffFilename: string | null;
}

// ============================================================================
// List Item (for rendering)
// ============================================================================

export type ListItemType = 'worktree' | 'session';

export interface ListItem {
  type: ListItemType;
  id: string;
  label: string;
  indent: number;
  worktree?: Worktree;
  session?: Session;
}

// ============================================================================
// Config
// ============================================================================

export interface AppConfig {
  claudeCommand: string;
  skipPermissions: boolean;
  worktreesDir: string | null;
}

export const DEFAULT_CONFIG: AppConfig = {
  claudeCommand: 'claude',
  skipPermissions: true,
  worktreesDir: null,
};

// ============================================================================
// Key Events
// ============================================================================

export interface KeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  raw: Buffer;
}
