# Claude Code++ Architecture v2

## Overview

Multi-pane terminal interface for parallel Claude Code agents using tmux for true pane isolation.

```
┌──────────────┬─────────────────────────────────────┐
│  Sidebar     │                                     │
│  (worktrees) │  Main Terminal                      │
│              │  (Claude Code runs here)            │
│              │                                     │
└──────────────┴─────────────────────────────────────┘
```

## Design Principles

1. **Tmux panes for isolation** - Sidebar and Claude Code are separate processes
2. **Attach/detach model** - Sessions persist, users can reconnect
3. **Native terminal** - Claude Code runs in a real terminal pane
4. **Simplicity over abstraction** - Only build what's needed

## Directory Structure

```
src/
├── index.ts              # Entry point - session lifecycle
├── sidebar/
│   ├── index.ts          # Sidebar entry point (runs in tmux pane)
│   ├── app.ts            # Main application logic + state
│   ├── render.ts         # ANSI-based pane rendering
│   └── input.ts          # Keyboard input handling
├── launcher/
│   └── index.ts          # Create sessions, setup panes, spawn sidebar
├── cli/
│   ├── index.ts          # Exports
│   ├── parser.ts         # Argument parsing
│   └── validators.ts     # Input validation
├── tmux/
│   ├── index.ts          # Exports
│   ├── commands.ts       # Low-level tmux command execution
│   └── pane.ts           # Pane and session operations
├── git/
│   ├── index.ts          # Exports
│   └── worktree.ts       # Worktree operations
├── platform/
│   ├── index.ts          # Exports
│   └── detect.ts         # Platform detection, paths
├── config/
│   ├── index.ts          # Exports
│   └── loader.ts         # Config loading
├── types.ts              # All type definitions
└── utils/
    ├── index.ts          # Exports
    ├── logger.ts         # Simple logger
    ├── id.ts             # ID generation
    └── errors.ts         # Error classes
```

## Module Responsibilities

### `index.ts` (Entry Point)
- Parse CLI arguments
- Check for existing tmux session
- If exists → attach and exit
- Otherwise → delegate to launcher

### `launcher/`
- Create tmux session
- Configure tmux options (mouse, borders, etc.)
- Split panes (sidebar left, main right)
- Spawn sidebar process in left pane
- Show welcome screen in right pane
- Attach to session

### `sidebar/`
Runs as a **separate process** inside the left tmux pane.

- `index.ts` - Entry point, receives args (repoPath, sessionName, paneIds)
- `app.ts` - Main logic: state management, worktree/session CRUD
- `render.ts` - Render UI to terminal using ANSI escape codes
- `input.ts` - Parse keyboard input, handle navigation

### `tmux/`
- `commands.ts` - Execute tmux commands, handle errors
- `pane.ts` - Higher-level: create/kill panes, send keys, resize

### `git/`
- `worktree.ts` - List, create, remove worktrees

### `cli/`
- `parser.ts` - Parse --help, --version, --new, [path]
- `validators.ts` - Validate paths, check git/tmux availability

### `platform/`
- Detect OS, get temp dir, home dir, etc.

### `config/`
- Load config from `~/.claude-plus-plus/config.json` (optional)

### `utils/`
- Logger, ID generation, error classes

## Data Flow

```
User runs: claude++ ~/myproject

┌─────────────────────────────────────────────────────────────────┐
│ index.ts                                                         │
│  ├─ Parse args (cli/)                                           │
│  ├─ Check session exists? (tmux/)                               │
│  │   ├─ Yes → attach and exit                                   │
│  │   └─ No → continue                                           │
│  └─ Call launcher                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ launcher/                                                        │
│  ├─ Create tmux session                                         │
│  ├─ Configure options                                           │
│  ├─ Split panes                                                 │
│  ├─ Spawn sidebar process ──────────────────────┐               │
│  ├─ Show welcome in main pane                   │               │
│  └─ Attach to session                           │               │
└─────────────────────────────────────────────────│───────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ sidebar/ (separate process in tmux pane)                        │
│  ├─ Initialize state                                            │
│  ├─ Load worktrees (git/)                                       │
│  ├─ Render UI (render.ts)                                       │
│  ├─ Handle input (input.ts)                                     │
│  │   ├─ Navigate: update selection, re-render                   │
│  │   ├─ Enter: create session in main pane (tmux/)              │
│  │   ├─ Delete: kill session pane (tmux/)                       │
│  │   └─ Quit: cleanup and exit                                  │
│  └─ Loop until quit                                             │
└─────────────────────────────────────────────────────────────────┘
```

## State (sidebar/app.ts)

Simple state object, no Redux complexity:

```typescript
interface SidebarState {
  repoPath: string;
  sessionName: string;
  mainPaneId: string;
  sidebarPaneId: string;

  worktrees: Worktree[];
  sessions: Map<string, Session[]>;  // worktreeId -> sessions

  selectedIndex: number;
  expandedWorktrees: Set<string>;

  mode: 'normal' | 'confirm-delete' | 'input';
  inputBuffer: string;
}
```

## Rendering (sidebar/render.ts)

Direct ANSI output to stdout - no virtual canvas:

```typescript
function render(state: SidebarState): void {
  const lines: string[] = [];

  // Header
  lines.push(bold('Claude Code++'));
  lines.push(dim('─'.repeat(width)));

  // Worktree list
  for (const wt of state.worktrees) {
    const selected = isSelected(wt, state);
    const prefix = selected ? '▶ ' : '  ';
    lines.push(selected ? inverse(prefix + wt.branch) : prefix + wt.branch);

    // Sessions under worktree
    if (state.expandedWorktrees.has(wt.id)) {
      for (const session of state.sessions.get(wt.id) || []) {
        lines.push('    ' + session.title);
      }
    }
  }

  // Footer
  lines.push(dim('─'.repeat(width)));
  lines.push(dim('j/k:nav Enter:select n:new d:delete q:quit'));

  // Output
  process.stdout.write(clearScreen + lines.join('\n'));
}
```

## Keyboard Input (sidebar/input.ts)

Raw mode stdin parsing:

```typescript
function setupInput(onKey: (key: string) => void): void {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (data) => {
    const key = parseKey(data);
    onKey(key);
  });
}

function parseKey(data: Buffer): string {
  // Handle escape sequences, arrows, etc.
  if (data[0] === 0x1b) { /* escape sequence */ }
  if (data[0] === 0x03) return 'ctrl+c';
  if (data[0] === 0x0d) return 'enter';
  // ...
}
```

## Session Management

When user presses Enter on a worktree:

1. Check if session exists for this worktree
2. If yes → focus that pane
3. If no → create new pane, run `claude` in it, track session

```typescript
async function createSession(worktree: Worktree): Promise<Session> {
  // Kill welcome pane if it exists
  // Create new pane in main area
  const paneId = await tmux.splitPane(state.mainPaneId, worktree.path);

  // Run claude in the pane
  await tmux.sendKeys(paneId, 'claude', true);

  // Track session
  const session: Session = {
    id: generateId(),
    worktreeId: worktree.id,
    paneId,
    title: worktree.branch,
    createdAt: Date.now(),
  };

  return session;
}
```

## Files to Remove (from v1)

```
src/app.ts              # Overlay approach - dead
src/core/               # Over-engineered managers
src/events/             # Event bus overkill
src/state/              # Redux-like overkill
src/ui/                 # Canvas rendering for overlay
src/multiplexer/        # Replace with simpler tmux/
src/services/           # Replace with simpler git/
```

## Files to Keep (from v1)

```
src/cli/                # Works well
src/platform/           # Useful (simplify)
src/config/             # Useful (simplify)
src/utils/              # Useful (simplify)
```

## Migration Steps

1. Remove dead code
2. Create `src/types.ts`
3. Create `src/tmux/`
4. Create `src/git/`
5. Simplify `src/platform/`, `src/config/`, `src/utils/`
6. Create `src/launcher/`
7. Create `src/sidebar/`
8. Create `src/index.ts`
9. Test end-to-end
