# State Types Reference

This document covers all type definitions, interfaces, and constants used in Claude++.

## Files Covered
- `src/types.ts` - Core type definitions
- `src/constants.ts` - Layout and UI constants
- `src/ansi.ts` - ANSI escape code utilities

---

## Core Types (`src/types.ts`)

### DiffViewMode

Toggle mode for file diff viewing.

```typescript
type DiffViewMode = 'diffs-only' | 'whole-file';
```

- `'whole-file'`: Shows complete file with inline diff markers (default)
- `'diffs-only'`: Shows only diff hunks with context (compact view)

### Worktree

Represents a git worktree (or the main repository).

```typescript
interface Worktree {
  id: string;       // Unique identifier (path-based for main, generated for worktrees)
  path: string;     // Absolute file system path
  branch: string;   // Git branch name (or "detached" for detached HEAD)
  isMain: boolean;  // true for main repo, false for git worktrees
}
```

**Usage:**
- Displayed in sidebar with folder icon
- Sessions belong to a worktree
- Claude commands run in worktree's directory

### Terminal

Represents a terminal pane within a session.

```typescript
interface Terminal {
  id: string;         // Unique terminal ID ("terminal-{timestamp}-{random}")
  sessionId: string;  // Parent session ID
  paneId: string;     // Tmux pane ID (e.g., "%5")
  title: string;      // Display name (e.g., "Terminal 1")
  createdAt: number;  // Unix timestamp
}
```

**Usage:**
- Displayed in terminal bar as tabs
- Multiple terminals per session
- Only one terminal visible at a time (others broken to background)

### Session

Represents a Claude session with optional terminals.

```typescript
interface Session {
  id: string;                    // Unique session ID ("session-{timestamp}-{random}")
  worktreeId: string;            // Parent worktree ID
  paneId: string;                // Main Claude pane ID
  title: string;                 // User-provided display name
  createdAt: number;             // Unix timestamp

  // Terminal management
  terminals: Terminal[];         // Array of terminals in this session
  activeTerminalIndex: number;   // Index of currently visible terminal
  terminalBarPaneId: string | null;  // Tmux pane ID for 1-row terminal bar

  // Diff pane
  diffPaneId: string | null;            // Diff pane ID (file list sidebar)
  diffPaneManuallyHidden: boolean;      // True if user manually closed diff pane
  diffViewMode: DiffViewMode;           // View mode for file diff: 'diffs-only' or 'whole-file'

  // File diff view panes (when viewing individual file diff)
  fileDiffHeaderPaneId: string | null;   // The 1-row header pane
  fileDiffContentPaneId: string | null;  // The pane showing file content
}
```

**Usage:**
- Displayed in sidebar under worktree
- Contains Claude pane + optional terminal panes
- Only one session active at a time

### SidebarState

Main application state machine.

```typescript
interface SidebarState {
  // Core identifiers
  repoPath: string;           // Repository path
  sessionName: string;        // Tmux session name
  mainPaneId: string;         // Initial main pane ID (becomes first Claude pane)
  sidebarPaneId: string;      // Sidebar's own pane ID

  // Data collections
  worktrees: Worktree[];      // All worktrees
  sessions: Session[];        // All sessions

  // Selection state
  selectedIndex: number;      // Currently highlighted item in list
  activeSessionId: string | null;  // Currently visible session (null = none)
  expandedWorktrees: Set<string>;  // (Unused - reserved for future)

  // Modal state
  modal: ModalType;           // Current modal or 'none'
  modalSelection: number;     // Selection in yes/no modals (0 or 1)
  inputBuffer: string;        // Text being typed in input modals
  deleteTarget: DeleteTarget | null;  // Item being deleted
  errorMessage: string | null;       // Error to display

  // Fullscreen modal state
  fullscreenModal: boolean;   // true when modal uses full screen
  hiddenPaneId: string | null;  // Pane broken to make room for modal

  // UI state
  collapsed: boolean;         // Sidebar collapsed to 2 columns

  // Terminal command mode
  terminalCommandMode: boolean;   // true when receiving TERM command
  terminalCommandBuffer: string;  // Command being accumulated
}
```

### ModalType

```typescript
type ModalType =
  | 'none'           // No modal
  | 'quit'           // Quit confirmation
  | 'delete'         // Delete confirmation
  | 'new-worktree'   // New worktree input
  | 'new-session'    // New session input
  | 'rename'         // Rename input
  | 'error';         // Error display
```

### DeleteTarget

```typescript
interface DeleteTarget {
  type: 'worktree' | 'session';
  id: string;
  name: string;
}
```

### ListItem

Used for rendering the sidebar list.

```typescript
interface ListItem {
  type: 'worktree' | 'session';
  id: string;
  label: string;
  indent: number;           // 0 for worktree, 1 for session
  worktree?: Worktree;      // Present if type = 'worktree'
  session?: Session;        // Present if type = 'session'
}
```

### KeyEvent

Parsed keyboard input.

```typescript
interface KeyEvent {
  key: string;    // Key name ('a', 'enter', 'escape', 'up', etc.)
  ctrl: boolean;  // Ctrl key held
  alt: boolean;   // Alt/Meta key held
  shift: boolean; // Shift key held
  raw: Buffer;    // Original input bytes
}
```

### MouseEvent

Parsed mouse input (SGR format).

```typescript
interface MouseEvent {
  button: number;  // 0=left, 1=middle, 2=right
  x: number;       // Column (1-indexed)
  y: number;       // Row (1-indexed)
  release: boolean; // true on button release
}
```

---

## Constants (`src/constants.ts`)

### Layout Constants

```typescript
const SIDEBAR_WIDTH = 25;           // Sidebar width in columns
const TERMINAL_BAR_HEIGHT = 1;      // Terminal bar height (always 1 row)
const CLAUDE_PANE_PERCENT = 70;     // Claude pane gets 70% vertical space
const DEFAULT_COLS = 80;            // Fallback terminal width
const DEFAULT_ROWS = 24;            // Fallback terminal height
```

### Sidebar Layout

```typescript
const HEADER_ROW_COUNT = 3;         // Title + subtitle + separator
const FOOTER_ROW_COUNT = 9;         // Help text at bottom
const MODAL_MAX_WIDTH = 60;         // Maximum modal width
const LIST_ITEM_PADDING = 4;        // Space for selection indicators
const WORKTREE_ITEM_PADDING = 6;    // Extra space for worktree items
```

### Terminal Bar Layout

```typescript
const MIN_TAB_WIDTH = 8;            // Minimum tab width
const TAB_PREFIX_WIDTH = 4;         // Space for " N: " prefix
```

### UI Text

```typescript
const UI_TEXT = {
  APP_TITLE: 'Claude++',
  APP_SUBTITLE: 'Multi-agent Claude Code with git worktree isolation',
  NEW_WORKTREE_BUTTON: '+ New Worktree',
  TERMINAL_HINTS: '1-9:switch n:new d:del',
  NO_TERMINALS: 'No terminals',
  NEW_TERMINAL_BUTTON: '[+]',
  QUIT_TITLE: 'Quit Claude++?',
  DELETE_TITLE: 'Confirm Delete',
  NEW_WORKTREE_TITLE: 'New Worktree',
  NEW_SESSION_TITLE: 'New Session',
  RENAME_TITLE: 'Rename',
  ERROR_TITLE: 'Error',
};
```

### Key Hints

```typescript
const KEY_HINTS = {
  NEW_SESSION: '↵  new session',
  NEW_WORKTREE: 'n  new worktree',
  TERMINAL: '^T terminal',
  DELETE: 'd  delete',
  RENAME: 'r  rename',
  QUIT: '^Q quit',
};
```

### File Paths

```typescript
const SIDEBAR_LOG_PATH = '/tmp/claude-pp-sidebar.log';
const BAR_HANDLER_LOG_PATH = '/tmp/cpp-bar-handler.log';
const RESIZE_HOOK_SCRIPT_PREFIX = '/tmp/cpp-resize-hook-';
```

---

## ANSI Utilities (`src/ansi.ts`)

### Cursor Control

```typescript
hideCursor(): string     // Hide terminal cursor
showCursor(): string     // Show terminal cursor
moveTo(row, col): string // Move cursor to position (1-indexed)
clearScreen(): string    // Clear entire screen
clearLine(): string      // Clear current line
```

### Colors

```typescript
// Foreground
fg.black, fg.red, fg.green, fg.yellow, fg.blue, fg.magenta, fg.cyan, fg.white
fg.gray, fg.brightRed, fg.brightGreen, fg.brightYellow, etc.

// Background
bg.black, bg.red, bg.green, bg.yellow, bg.blue, bg.magenta, bg.cyan, bg.white

// Styles
bold(), dim(), italic(), underline(), inverse(), reset()
```

### Mouse Control

```typescript
enableMouse(): string   // Enable SGR mouse tracking
disableMouse(): string  // Disable mouse tracking
```

---

## State Flow Diagram

```
                    ┌─────────────────────┐
                    │    SidebarState     │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │worktrees │         │ sessions │         │  modal   │
   └────┬─────┘         └────┬─────┘         └────┬─────┘
        │                    │                    │
        │               ┌────┴────┐              │
        │               ▼         ▼              │
        │          ┌────────┐ ┌────────┐        │
        │          │terminals│ │paneIds │        │
        │          └────────┘ └────────┘        │
        │                                        │
        └────────────────┬───────────────────────┘
                         │
                         ▼
                   ┌──────────┐
                   │  render  │
                   └──────────┘
```

---

## When to Update This Document

Update this document when:
- Adding new types or interfaces to `src/types.ts`
- Modifying existing type shapes
- Adding new constants to `src/constants.ts`
- Adding new ANSI utilities

After updating:
1. Keep type definitions in sync with actual code
2. Update the state flow diagram if relationships change
3. Update "Last Updated" timestamp

---
**Last Updated:** 2025-01-18
**Files Covered:** `src/types.ts`, `src/constants.ts`, `src/ansi.ts`
