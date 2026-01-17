/**
 * Core Type Definitions
 */

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
