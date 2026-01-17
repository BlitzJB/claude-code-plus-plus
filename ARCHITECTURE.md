# Claude Code++ Architecture Design

> This document describes the target architecture for a complete rewrite of Claude Code++.
> It prioritizes extensibility, maintainability, and clarity over the existing implementation.

## Design Principles

1. **Separation of Concerns** - Each module has a single, well-defined responsibility
2. **Dependency Inversion** - High-level modules don't depend on low-level modules; both depend on abstractions
3. **Platform Abstraction** - Terminal multiplexer operations are abstracted to support future Windows compatibility
4. **Event-Driven Communication** - Components communicate through an event bus, not direct calls or file polling
5. **Centralized State** - Single source of truth with observable state changes
6. **Testability** - All business logic is unit testable without requiring tmux or UI

---

## Directory Structure

```
src/
├── index.ts                          # Entry point - minimal bootstrap
├── app.ts                            # Application orchestrator
│
├── cli/                              # Command-line interface
│   ├── index.ts                      # CLI module exports
│   ├── parser.ts                     # Argument parsing
│   ├── commands/                     # CLI command handlers
│   │   ├── index.ts
│   │   ├── start.ts                  # Default start command
│   │   ├── version.ts                # --version handler
│   │   └── help.ts                   # --help handler
│   └── validators.ts                 # CLI input validation
│
├── config/                           # Configuration management
│   ├── index.ts                      # Config module exports
│   ├── schema.ts                     # Configuration schema/types
│   ├── loader.ts                     # Load config from file/env
│   ├── defaults.ts                   # Default configuration values
│   └── paths.ts                      # Application paths (data dir, temp, etc.)
│
├── core/                             # Domain logic (business rules)
│   ├── index.ts                      # Core module exports
│   ├── session/                      # Session domain
│   │   ├── index.ts
│   │   ├── session.ts                # Session entity
│   │   ├── session-manager.ts        # Session lifecycle management
│   │   └── session-repository.ts     # Session persistence interface
│   ├── terminal/                     # Terminal domain
│   │   ├── index.ts
│   │   ├── terminal.ts               # Terminal entity
│   │   ├── terminal-manager.ts       # Terminal lifecycle management
│   │   └── terminal-repository.ts    # Terminal persistence interface
│   ├── worktree/                     # Worktree domain
│   │   ├── index.ts
│   │   ├── worktree.ts               # Worktree entity
│   │   ├── worktree-manager.ts       # Worktree lifecycle management
│   │   └── worktree-repository.ts    # Worktree persistence interface
│   └── workspace/                    # Workspace domain (ties sessions to worktrees)
│       ├── index.ts
│       ├── workspace.ts              # Workspace entity
│       └── workspace-manager.ts      # Workspace coordination
│
├── multiplexer/                      # Terminal multiplexer abstraction
│   ├── index.ts                      # Multiplexer module exports
│   ├── types.ts                      # Multiplexer interfaces
│   ├── factory.ts                    # Create multiplexer based on platform
│   ├── base.ts                       # Abstract base class with shared logic
│   ├── tmux/                         # tmux implementation (macOS/Linux)
│   │   ├── index.ts
│   │   ├── tmux-multiplexer.ts       # IMultiplexer implementation
│   │   ├── tmux-commands.ts          # Raw tmux command execution
│   │   ├── tmux-parser.ts            # Parse tmux output
│   │   └── tmux-config.ts            # tmux-specific configuration
│   └── windows/                      # Future Windows implementation
│       ├── index.ts
│       └── windows-multiplexer.ts    # Placeholder for Windows Terminal/ConPTY
│
├── state/                            # State management
│   ├── index.ts                      # State module exports
│   ├── store.ts                      # Central state store
│   ├── types.ts                      # State shape definitions
│   ├── actions.ts                    # State mutation actions
│   ├── selectors.ts                  # State query selectors
│   ├── persistence/                  # State persistence
│   │   ├── index.ts
│   │   ├── file-adapter.ts           # File-based persistence
│   │   └── serializer.ts             # State serialization/deserialization
│   └── middleware/                   # State middleware
│       ├── index.ts
│       ├── logger.ts                 # Log state changes (dev mode)
│       └── persistence.ts            # Auto-persist middleware
│
├── events/                           # Event system
│   ├── index.ts                      # Events module exports
│   ├── bus.ts                        # Event bus implementation
│   ├── types.ts                      # Event type definitions
│   └── handlers/                     # Event handlers
│       ├── index.ts
│       ├── session-events.ts         # Handle session lifecycle events
│       ├── terminal-events.ts        # Handle terminal lifecycle events
│       └── ui-events.ts              # Handle UI interaction events
│
├── ui/                               # User interface
│   ├── index.ts                      # UI module exports
│   ├── renderer/                     # Rendering engine
│   │   ├── index.ts
│   │   ├── canvas.ts                 # Virtual canvas for buffered rendering
│   │   ├── ansi.ts                   # ANSI escape code utilities
│   │   ├── colors.ts                 # Color definitions and themes
│   │   └── symbols.ts                # Unicode symbols/icons
│   ├── input/                        # Input handling
│   │   ├── index.ts
│   │   ├── keyboard.ts               # Keyboard input parser
│   │   ├── mouse.ts                  # Mouse input parser
│   │   ├── keybindings.ts            # Keybinding definitions
│   │   └── input-manager.ts          # Unified input management
│   ├── layout/                       # Layout system
│   │   ├── index.ts
│   │   ├── box.ts                    # Box layout calculations
│   │   ├── flex.ts                   # Flex-like layout
│   │   └── constraints.ts            # Size constraints
│   ├── components/                   # Reusable UI components
│   │   ├── index.ts
│   │   ├── base.ts                   # Base component class
│   │   ├── text.ts                   # Text rendering
│   │   ├── list.ts                   # Scrollable list
│   │   ├── tree.ts                   # Tree view (for worktree hierarchy)
│   │   ├── tabs.ts                   # Tab bar component
│   │   ├── button.ts                 # Clickable button
│   │   ├── input-field.ts            # Text input field
│   │   └── modal.ts                  # Modal dialog base
│   ├── views/                        # Full-screen views
│   │   ├── index.ts
│   │   ├── sidebar-view.ts           # Main sidebar view
│   │   ├── terminal-bar-view.ts      # Terminal tab bar view
│   │   └── welcome-view.ts           # Welcome screen view
│   └── modals/                       # Modal dialogs
│       ├── index.ts
│       ├── quit-modal.ts             # Quit confirmation
│       ├── delete-modal.ts           # Delete confirmation
│       ├── create-worktree-modal.ts  # New worktree dialog
│       ├── create-session-modal.ts   # New session dialog
│       └── rename-modal.ts           # Rename dialog
│
├── services/                         # External service integrations
│   ├── index.ts                      # Services module exports
│   ├── git/                          # Git operations
│   │   ├── index.ts
│   │   ├── git-service.ts            # Git command wrapper
│   │   ├── worktree-service.ts       # Worktree-specific operations
│   │   └── branch-service.ts         # Branch operations
│   ├── claude/                       # Claude CLI integration
│   │   ├── index.ts
│   │   ├── claude-service.ts         # Claude CLI wrapper
│   │   └── claude-detector.ts        # Detect claude installation
│   └── process/                      # Process management
│       ├── index.ts
│       ├── process-spawner.ts        # Spawn child processes
│       └── process-monitor.ts        # Monitor running processes
│
├── platform/                         # Platform-specific code
│   ├── index.ts                      # Platform module exports
│   ├── detector.ts                   # Detect current platform
│   ├── paths.ts                      # Platform-specific paths
│   ├── clipboard.ts                  # Clipboard operations
│   └── shell.ts                      # Shell detection and configuration
│
├── utils/                            # Shared utilities
│   ├── index.ts                      # Utils module exports
│   ├── logger.ts                     # Logging utility
│   ├── errors.ts                     # Custom error classes
│   ├── async.ts                      # Async utilities (debounce, throttle)
│   ├── string.ts                     # String manipulation
│   ├── id.ts                         # ID generation
│   └── validation.ts                 # Common validation functions
│
└── types/                            # Shared type definitions
    ├── index.ts                      # Types module exports
    ├── entities.ts                   # Domain entity interfaces
    ├── events.ts                     # Event type definitions
    ├── config.ts                     # Configuration types
    └── multiplexer.ts                # Multiplexer interface types
```

---

## Module Responsibilities

### Entry Point (`index.ts`, `app.ts`)

**`index.ts`** - Minimal entry point
- Parse environment
- Handle uncaught errors
- Bootstrap the application

**`app.ts`** - Application orchestrator
- Initialize all modules in correct order
- Wire up dependencies
- Coordinate startup and shutdown
- Handle graceful termination

---

### CLI Module (`cli/`)

Responsible for parsing command-line arguments and dispatching to appropriate handlers.

| File | Responsibility |
|------|----------------|
| `parser.ts` | Parse argv into structured options using a lightweight parser |
| `commands/start.ts` | Default command - launch the application |
| `commands/version.ts` | Print version and exit |
| `commands/help.ts` | Print help text and exit |
| `validators.ts` | Validate CLI inputs (paths exist, valid options, etc.) |

**Dependencies**: None (pure functions)

---

### Config Module (`config/`)

Manages application configuration from multiple sources (defaults, file, environment).

| File | Responsibility |
|------|----------------|
| `schema.ts` | TypeScript interfaces for configuration |
| `defaults.ts` | Default values for all config options |
| `loader.ts` | Load and merge config from file (~/.claude-plus-plus/config.json) and env vars |
| `paths.ts` | Compute paths for data directory, temp files, logs, etc. |

**Configuration Options**:
```typescript
interface Config {
  claude: {
    command: string;              // 'claude' | custom path
    skipPermissions: boolean;     // --dangerously-skip-permissions
  };
  ui: {
    sidebarWidth: number;         // Default sidebar width
    collapsedWidth: number;       // Collapsed sidebar width
    theme: 'default' | 'minimal'; // UI theme
  };
  worktrees: {
    basePath: string;             // Where to create worktrees
  };
  multiplexer: {
    type: 'auto' | 'tmux';        // Which multiplexer to use
  };
  debug: {
    enabled: boolean;             // Enable debug logging
    logFile: string;              // Debug log path
  };
}
```

**Dependencies**: `utils/` for file operations

---

### Core Module (`core/`)

Contains domain entities and business logic. **No dependencies on UI or multiplexer**.

#### Session Domain (`core/session/`)

| File | Responsibility |
|------|----------------|
| `session.ts` | Session entity - represents a Claude Code session |
| `session-manager.ts` | Create, switch, delete sessions; manage session lifecycle |
| `session-repository.ts` | Interface for session persistence (implemented by state module) |

**Session Entity**:
```typescript
interface Session {
  id: string;
  worktreeId: string;
  title: string;
  createdAt: Date;
  panes: {
    main: string | null;           // Main Claude pane ID
    terminalManager: string | null; // Terminal bar pane ID
  };
  terminals: Terminal[];
  activeTerminalIndex: number;
}
```

#### Terminal Domain (`core/terminal/`)

| File | Responsibility |
|------|----------------|
| `terminal.ts` | Terminal entity - represents a terminal pane |
| `terminal-manager.ts` | Create, switch, delete terminals within a session |
| `terminal-repository.ts` | Interface for terminal persistence |

**Terminal Entity**:
```typescript
interface Terminal {
  id: string;
  sessionId: string;
  paneId: string | null;
  title: string;
  createdAt: Date;
}
```

#### Worktree Domain (`core/worktree/`)

| File | Responsibility |
|------|----------------|
| `worktree.ts` | Worktree entity - represents a git worktree |
| `worktree-manager.ts` | Create, rename, delete worktrees; list branches |
| `worktree-repository.ts` | Interface for worktree data |

**Worktree Entity**:
```typescript
interface Worktree {
  id: string;
  path: string;
  branch: string;
  isMain: boolean;
  sessions: Session[];
}
```

#### Workspace Domain (`core/workspace/`)

| File | Responsibility |
|------|----------------|
| `workspace.ts` | Workspace entity - ties everything together for a project |
| `workspace-manager.ts` | High-level coordination of worktrees and sessions |

**Workspace Entity**:
```typescript
interface Workspace {
  id: string;
  projectPath: string;
  projectName: string;
  multiplexerSessionId: string;
  worktrees: Worktree[];
  activeSessionId: string | null;
}
```

**Dependencies**: `events/` for publishing domain events, `types/` for shared interfaces

---

### Multiplexer Module (`multiplexer/`)

Abstracts terminal multiplexer operations behind a common interface.

| File | Responsibility |
|------|----------------|
| `types.ts` | Interface definitions for multiplexer operations |
| `factory.ts` | Create appropriate multiplexer based on platform/config |
| `base.ts` | Shared logic between multiplexer implementations |

**Multiplexer Interface**:
```typescript
interface IMultiplexer {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Session management
  createSession(name: string): Promise<string>;
  attachSession(name: string): Promise<void>;
  detachSession(): Promise<void>;
  sessionExists(name: string): Promise<boolean>;
  killSession(name: string): Promise<void>;

  // Pane operations
  createPane(options: CreatePaneOptions): Promise<string>;
  destroyPane(paneId: string): Promise<void>;
  focusPane(paneId: string): Promise<void>;
  resizePane(paneId: string, size: PaneSize): Promise<void>;

  // Pane visibility (background/foreground)
  showPane(paneId: string, targetPaneId: string, direction: Direction): Promise<void>;
  hidePane(paneId: string): Promise<void>;

  // Input/Output
  sendInput(paneId: string, input: string): Promise<void>;
  sendKeys(paneId: string, keys: string[]): Promise<void>;
  runCommand(paneId: string, command: string): Promise<void>;

  // Queries
  listPanes(): Promise<PaneInfo[]>;
  getPaneSize(paneId: string): Promise<{ width: number; height: number }>;

  // Configuration
  setOption(option: string, value: string): Promise<void>;
  bindKey(key: string, action: string): Promise<void>;

  // Platform-specific features
  enableMouse(): Promise<void>;
  disableMouse(): Promise<void>;
}
```

#### tmux Implementation (`multiplexer/tmux/`)

| File | Responsibility |
|------|----------------|
| `tmux-multiplexer.ts` | Implements IMultiplexer using tmux |
| `tmux-commands.ts` | Raw tmux command execution (execSync wrapper) |
| `tmux-parser.ts` | Parse tmux list-panes, list-windows output |
| `tmux-config.ts` | tmux-specific options and defaults |

#### Windows Placeholder (`multiplexer/windows/`)

| File | Responsibility |
|------|----------------|
| `windows-multiplexer.ts` | Placeholder - throws "not implemented" errors |

**Dependencies**: `platform/` for detection, `utils/` for process execution

---

### State Module (`state/`)

Centralized state management with persistence and observability.

| File | Responsibility |
|------|----------------|
| `store.ts` | Central state store with pub/sub |
| `types.ts` | State shape type definitions |
| `actions.ts` | Functions that mutate state (pure reducers) |
| `selectors.ts` | Functions that query state |

**State Shape**:
```typescript
interface AppState {
  workspace: Workspace | null;
  ui: {
    sidebar: {
      selectedIndex: number;
      collapsed: boolean;
      scrollOffset: number;
    };
    terminalBar: {
      visible: boolean;
    };
    modal: {
      type: ModalType | null;
      data: unknown;
    };
    inputMode: {
      active: boolean;
      field: string;
      value: string;
      cursorPos: number;
    };
  };
  status: {
    loading: boolean;
    error: string | null;
  };
}
```

**Store Interface**:
```typescript
interface Store<T> {
  getState(): T;
  dispatch(action: Action): void;
  subscribe(listener: (state: T) => void): Unsubscribe;
  select<R>(selector: (state: T) => R): R;
}
```

#### Persistence (`state/persistence/`)

| File | Responsibility |
|------|----------------|
| `file-adapter.ts` | Read/write state to JSON file |
| `serializer.ts` | Serialize/deserialize state (handle dates, etc.) |

#### Middleware (`state/middleware/`)

| File | Responsibility |
|------|----------------|
| `logger.ts` | Log state changes in development |
| `persistence.ts` | Auto-save state on changes (debounced) |

**Dependencies**: `config/` for paths, `utils/` for file operations

---

### Events Module (`events/`)

Event bus for decoupled component communication.

| File | Responsibility |
|------|----------------|
| `bus.ts` | Event bus implementation (emit, on, off) |
| `types.ts` | Event type definitions |

**Event Types**:
```typescript
// Domain Events
type SessionCreated = { type: 'session:created'; session: Session };
type SessionDeleted = { type: 'session:deleted'; sessionId: string };
type SessionActivated = { type: 'session:activated'; sessionId: string };
type TerminalCreated = { type: 'terminal:created'; terminal: Terminal };
type TerminalDeleted = { type: 'terminal:deleted'; terminalId: string };
type TerminalActivated = { type: 'terminal:activated'; terminalId: string };
type WorktreeCreated = { type: 'worktree:created'; worktree: Worktree };
type WorktreeDeleted = { type: 'worktree:deleted'; worktreeId: string };

// UI Events
type UIKeyPressed = { type: 'ui:key'; key: string; modifiers: Modifiers };
type UIMouseClicked = { type: 'ui:mouse'; x: number; y: number; button: number };
type UIResized = { type: 'ui:resized'; width: number; height: number };
type UIModalOpened = { type: 'ui:modal:opened'; modal: ModalType };
type UIModalClosed = { type: 'ui:modal:closed' };

// System Events
type AppStarted = { type: 'app:started' };
type AppShutdown = { type: 'app:shutdown' };
type ErrorOccurred = { type: 'app:error'; error: Error };
```

**Event Bus Interface**:
```typescript
interface EventBus {
  emit<E extends Event>(event: E): void;
  on<E extends Event>(type: E['type'], handler: (event: E) => void): Unsubscribe;
  once<E extends Event>(type: E['type'], handler: (event: E) => void): void;
  off<E extends Event>(type: E['type'], handler: (event: E) => void): void;
}
```

#### Event Handlers (`events/handlers/`)

| File | Responsibility |
|------|----------------|
| `session-events.ts` | React to session events (update multiplexer panes) |
| `terminal-events.ts` | React to terminal events (update pane layout) |
| `ui-events.ts` | React to UI events (keyboard/mouse -> actions) |

**Dependencies**: None (pure event handling)

---

### UI Module (`ui/`)

All user interface code, completely separated from business logic.

#### Renderer (`ui/renderer/`)

| File | Responsibility |
|------|----------------|
| `canvas.ts` | Virtual canvas for double-buffered rendering |
| `ansi.ts` | ANSI escape code helpers (cursor, clear, colors) |
| `colors.ts` | Color palette and theme definitions |
| `symbols.ts` | Unicode symbols (◆, ◇, └, ─, etc.) |

**Canvas Interface**:
```typescript
interface Canvas {
  width: number;
  height: number;

  // Drawing primitives
  drawText(x: number, y: number, text: string, style?: Style): void;
  drawBox(x: number, y: number, w: number, h: number, style?: BoxStyle): void;
  drawLine(x1: number, y1: number, x2: number, y2: number, char?: string): void;
  fill(x: number, y: number, w: number, h: number, char: string): void;

  // Rendering
  clear(): void;
  render(): string;  // Returns ANSI string
  flush(stream: WriteStream): void;  // Write to stdout
}
```

#### Input (`ui/input/`)

| File | Responsibility |
|------|----------------|
| `keyboard.ts` | Parse raw keyboard input (escape sequences) |
| `mouse.ts` | Parse SGR mouse input |
| `keybindings.ts` | Map key combinations to action names |
| `input-manager.ts` | Unified input handling, emit events |

**Input Manager**:
```typescript
interface InputManager {
  start(): void;
  stop(): void;
  onKey(handler: (key: KeyEvent) => void): Unsubscribe;
  onMouse(handler: (mouse: MouseEvent) => void): Unsubscribe;
}
```

#### Layout (`ui/layout/`)

| File | Responsibility |
|------|----------------|
| `box.ts` | Box model calculations (padding, margin, border) |
| `flex.ts` | Flex-like layout for distributing space |
| `constraints.ts` | Min/max size constraints |

#### Components (`ui/components/`)

Reusable, composable UI components.

| File | Responsibility |
|------|----------------|
| `base.ts` | Base component interface |
| `text.ts` | Styled text rendering |
| `list.ts` | Scrollable list with selection |
| `tree.ts` | Expandable/collapsible tree |
| `tabs.ts` | Tab bar with active indicator |
| `button.ts` | Clickable button |
| `input-field.ts` | Text input with cursor |
| `modal.ts` | Modal dialog container |

**Component Interface**:
```typescript
interface Component {
  // Lifecycle
  mount(): void;
  unmount(): void;

  // Rendering
  render(canvas: Canvas, bounds: Rect): void;

  // Layout
  getPreferredSize(): Size;
  getMinSize(): Size;

  // Input (optional)
  handleKey?(key: KeyEvent): boolean;
  handleMouse?(mouse: MouseEvent): boolean;

  // Hit testing
  hitTest?(x: number, y: number): HitResult | null;
}
```

#### Views (`ui/views/`)

Full-screen or major view compositions.

| File | Responsibility |
|------|----------------|
| `sidebar-view.ts` | Main sidebar (worktree list, session list, help) |
| `terminal-bar-view.ts` | Terminal tab bar |
| `welcome-view.ts` | Welcome screen content |

#### Modals (`ui/modals/`)

Modal dialog implementations.

| File | Responsibility |
|------|----------------|
| `quit-modal.ts` | Detach/Kill confirmation |
| `delete-modal.ts` | Delete worktree/session confirmation |
| `create-worktree-modal.ts` | New worktree name input |
| `create-session-modal.ts` | New session name input |
| `rename-modal.ts` | Rename item input |

**Dependencies**: `renderer/` for drawing, `events/` for emitting UI events, `state/` for reading state

---

### Services Module (`services/`)

External service integrations.

#### Git Service (`services/git/`)

| File | Responsibility |
|------|----------------|
| `git-service.ts` | Core git command wrapper |
| `worktree-service.ts` | Worktree-specific operations (list, add, remove) |
| `branch-service.ts` | Branch operations (list, create, rename) |

**Git Service Interface**:
```typescript
interface GitService {
  isGitRepository(path: string): Promise<boolean>;
  getRepositoryRoot(path: string): Promise<string>;
  getRepositoryName(path: string): Promise<string>;
}

interface WorktreeService {
  list(repoPath: string): Promise<WorktreeInfo[]>;
  create(repoPath: string, branch: string, path: string): Promise<void>;
  remove(path: string, force?: boolean): Promise<void>;
  prune(repoPath: string): Promise<void>;
}

interface BranchService {
  list(repoPath: string): Promise<string[]>;
  create(repoPath: string, name: string): Promise<void>;
  rename(repoPath: string, oldName: string, newName: string): Promise<void>;
  delete(repoPath: string, name: string): Promise<void>;
}
```

#### Claude Service (`services/claude/`)

| File | Responsibility |
|------|----------------|
| `claude-service.ts` | Build claude CLI command, launch in pane |
| `claude-detector.ts` | Detect if claude is installed and get version |

#### Process Service (`services/process/`)

| File | Responsibility |
|------|----------------|
| `process-spawner.ts` | Spawn child processes with proper options |
| `process-monitor.ts` | Track running processes, detect exit |

**Dependencies**: `utils/` for error handling

---

### Platform Module (`platform/`)

Platform-specific code isolated here.

| File | Responsibility |
|------|----------------|
| `detector.ts` | Detect OS (darwin, linux, win32) |
| `paths.ts` | Platform-specific paths (home dir, temp dir) |
| `clipboard.ts` | Copy to clipboard (pbcopy, xclip, etc.) |
| `shell.ts` | Detect shell (bash, zsh, fish) and configure |

**Platform Interface**:
```typescript
interface Platform {
  os: 'darwin' | 'linux' | 'win32';
  homeDir: string;
  tempDir: string;
  shell: string;

  copyToClipboard(text: string): Promise<void>;
  openInEditor(path: string): Promise<void>;
  getTerminalSize(): { rows: number; cols: number };
}
```

**Dependencies**: None

---

### Utils Module (`utils/`)

Shared utility functions.

| File | Responsibility |
|------|----------------|
| `logger.ts` | Logging with levels, file output |
| `errors.ts` | Custom error classes with codes |
| `async.ts` | debounce, throttle, delay |
| `string.ts` | truncate, pad, wrap, slugify |
| `id.ts` | Generate unique IDs (nanoid-style) |
| `validation.ts` | isValidBranchName, isValidPath, etc. |

**Logger Interface**:
```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error): void;

  child(context: string): Logger;
}
```

**Dependencies**: None (leaf module)

---

### Types Module (`types/`)

Shared TypeScript type definitions.

| File | Responsibility |
|------|----------------|
| `entities.ts` | Domain entity interfaces |
| `events.ts` | Event type definitions |
| `config.ts` | Configuration types |
| `multiplexer.ts` | Multiplexer interface types |

**Dependencies**: None (type-only module)

---

## Dependency Graph

```
                            ┌─────────────────┐
                            │     index.ts    │
                            │   (entry point) │
                            └────────┬────────┘
                                     │
                            ┌────────▼────────┐
                            │      app.ts     │
                            │  (orchestrator) │
                            └────────┬────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│     cli/      │           │    config/    │           │   platform/   │
│ (arg parsing) │           │(configuration)│           │  (platform)   │
└───────────────┘           └───────────────┘           └───────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
           ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
           │    state/     │ │    events/    │ │  multiplexer/ │
           │(state store)  │ │ (event bus)   │ │(tmux wrapper) │
           └───────────────┘ └───────────────┘ └───────────────┘
                    │                │                │
                    │                │                │
                    ▼                ▼                │
           ┌───────────────┐ ┌───────────────┐       │
           │     core/     │ │   services/   │◄──────┘
           │(domain logic) │ │(git, claude)  │
           └───────────────┘ └───────────────┘
                    │
                    ▼
           ┌───────────────┐
           │      ui/      │
           │(TUI rendering)│
           └───────────────┘
                    │
                    ▼
           ┌───────────────┐
           │    utils/     │
           │   (shared)    │
           └───────────────┘
                    │
                    ▼
           ┌───────────────┐
           │    types/     │
           │ (type defs)   │
           └───────────────┘
```

**Dependency Rules**:
1. `types/` has no dependencies (leaf)
2. `utils/` depends only on `types/`
3. `platform/` depends only on `types/` and `utils/`
4. `config/` depends on `platform/`, `types/`, `utils/`
5. `events/` depends only on `types/`
6. `state/` depends on `types/`, `utils/`, `config/`
7. `multiplexer/` depends on `platform/`, `config/`, `types/`, `utils/`
8. `services/` depends on `platform/`, `utils/`, `types/`
9. `core/` depends on `events/`, `types/`, `services/` (NOT on `state/` directly - uses repository interfaces)
10. `ui/` depends on `state/`, `events/`, `types/`, `utils/`
11. `cli/` depends on `config/`, `types/`
12. `app.ts` depends on everything (wires it all together)

---

## Data Flow

### Startup Flow

```
1. index.ts: Parse environment, set up error handlers
2. app.ts: Initialize modules in order:
   a. Load configuration (config/)
   b. Detect platform (platform/)
   c. Create event bus (events/)
   d. Create state store (state/)
   e. Create multiplexer (multiplexer/)
   f. Initialize services (services/)
   g. Create core managers (core/)
   h. Initialize UI (ui/)
3. app.ts: Check if session exists
   - If exists: reattach
   - If not: create new session
4. app.ts: Start event loop
5. ui/: Begin rendering loop
```

### User Interaction Flow

```
1. User presses key
2. input-manager.ts: Parse raw input
3. events/bus.ts: Emit 'ui:key' event
4. events/handlers/ui-events.ts: Map key to action
5. core/session-manager.ts: Execute business logic
6. state/store.ts: Update state
7. events/bus.ts: Emit 'session:created' event
8. multiplexer/: Create actual pane
9. ui/: Re-render (subscribed to state changes)
```

### Session Creation Flow

```
1. UI: User selects worktree, presses Enter
2. Event: { type: 'ui:key', key: 'Enter' }
3. Handler: Determine action = 'createSession'
4. Core: session-manager.createSession(worktreeId)
   a. Generate session ID
   b. Create session entity
   c. Emit 'session:creating' event
5. Multiplexer: Create pane, run claude command
6. Core: Update session with pane ID
7. State: Add session to store
8. Event: { type: 'session:created', session }
9. UI: Re-render sidebar with new session
```

---

## Extension Points

### Adding Windows Support

1. Create `multiplexer/windows/windows-multiplexer.ts`
2. Implement `IMultiplexer` interface using Windows Terminal or ConPTY
3. Update `multiplexer/factory.ts` to return Windows multiplexer on win32
4. Update `platform/` with Windows-specific paths and commands

### Adding New UI Components

1. Create component in `ui/components/`
2. Implement `Component` interface
3. Use in views (`ui/views/`)

### Adding New Modal Dialogs

1. Create modal in `ui/modals/`
2. Extend base modal component
3. Add modal type to `state/types.ts`
4. Handle in `events/handlers/ui-events.ts`

### Adding Configuration Options

1. Add to `config/schema.ts`
2. Add default in `config/defaults.ts`
3. Update `config/loader.ts` if needed
4. Use via `config.get('path.to.option')`

### Adding New Services

1. Create service in `services/`
2. Define interface
3. Inject into core managers via `app.ts`

---

## Testing Strategy

### Unit Tests

- **`core/`**: Test business logic with mock repositories
- **`state/`**: Test reducers (pure functions)
- **`utils/`**: Test utility functions
- **`ui/components/`**: Test rendering output given state

### Integration Tests

- **`multiplexer/tmux/`**: Test against real tmux (requires tmux installed)
- **`services/git/`**: Test against real git repos (use temp directories)

### E2E Tests

- Full application flow using test fixtures
- Verify tmux session creation, pane management
- Test keyboard navigation

---

## Migration Path

### Phase 1: Foundation

1. Create directory structure
2. Implement `types/`, `utils/`, `platform/`
3. Implement `config/` with loader
4. Implement `events/` bus

### Phase 2: State & Multiplexer

1. Implement `state/` store
2. Implement `multiplexer/` interfaces
3. Implement `multiplexer/tmux/`
4. Write integration tests for tmux

### Phase 3: Services & Core

1. Implement `services/git/`
2. Implement `services/claude/`
3. Implement `core/` entities and managers
4. Wire up event handlers

### Phase 4: UI

1. Implement `ui/renderer/`
2. Implement `ui/input/`
3. Implement `ui/components/`
4. Implement `ui/views/`
5. Implement `ui/modals/`

### Phase 5: Integration

1. Implement `app.ts` orchestration
2. Implement `cli/`
3. Wire everything together
4. End-to-end testing

### Phase 6: Polish

1. Performance optimization
2. Error handling improvements
3. Documentation
4. Release

---

## File Count Summary

| Module | Files | Purpose |
|--------|-------|---------|
| Root | 2 | Entry + orchestrator |
| cli/ | 5 | Command-line interface |
| config/ | 5 | Configuration |
| core/ | 13 | Domain logic |
| multiplexer/ | 8 | Terminal multiplexer |
| state/ | 9 | State management |
| events/ | 6 | Event system |
| ui/ | 23 | User interface |
| services/ | 8 | External services |
| platform/ | 5 | Platform abstraction |
| utils/ | 7 | Utilities |
| types/ | 5 | Type definitions |
| **Total** | **96** | |

---

## Conclusion

This architecture provides:

1. **Extensibility**: New platforms, components, and features can be added without modifying existing code
2. **Maintainability**: Clear separation of concerns, single responsibility per file
3. **Clarity**: Intuitive structure, consistent naming, comprehensive documentation
4. **Testability**: Business logic is decoupled from I/O, enabling unit tests
5. **Future-Proofing**: Windows support path is clear, plugin system is possible

The modular design allows incremental migration from the existing codebase while maintaining functionality at each step.
