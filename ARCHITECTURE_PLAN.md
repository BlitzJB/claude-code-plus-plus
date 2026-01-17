# Claude Code++ Architecture Plan
## Multi-Pane Terminal Interface for Parallel Claude Code Agents

---

## Executive Summary

Build a **terminal-based UI (TUI)** application that enables running multiple Claude Code agents in parallel, each in isolated git worktrees. The interface will feature a sidebar for worktree navigation, tabs for multiple agents within each worktree, and retain native Claude Code functionality in the main pane.

---

## Research Findings

### Reference Projects

1. **[code-conductor](https://github.com/ryanmac/code-conductor)** - Python-based GitHub Actions orchestration system for parallel AI agents
   - Python (77.2%), Shell scripting
   - GitHub issue/PR workflow automation
   - Not a UI application - focuses on CI/CD orchestration

2. **[multi-claude](https://github.com/LaurentMnr95/multi-claude)** - Multi-pane desktop application
   - **Electron 33 + React 18** (desktop app, not terminal-based)
   - xterm.js 5.5 for terminal rendering
   - node-pty for terminal emulation
   - Split pane layout with drag & drop
   - Git worktree management via simple-git

### TUI Framework Options

| Framework | Type | Language | Pros | Cons |
|-----------|------|----------|------|------|
| **Ink** | React-based | TypeScript | React mental model, easier learning curve, great TS support | Less control over low-level rendering |
| **@unblessed** | Widget-based | TypeScript | 98.5% test coverage, full type safety, powerful widget system | Alpha software, smaller ecosystem |
| **neo-blessed** | Widget-based | JavaScript | Mature, widget-rich, mouse support | Less TypeScript support, occasional maintenance |

**Recommendation**: **@unblessed** or **Ink** depending on team preference
- Choose **Ink** if team is React-familiar
- Choose **@unblessed** for more complex layouts and better widget control

---

## Architecture Design

### High-Level Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code++                                              │
├─────────────┬───────────────────────────────────────────────┤
│ Worktrees   │  ┌──────┬──────┬──────┐                       │
│             │  │ Tab1 │ Tab2 │ Tab3 │                       │
│ ⦿ main      │  └──────┴──────┴──────┘                       │
│   feature-1 │  ┌─────────────────────────────────────────┐  │
│   bugfix-2  │  │                                         │  │
│   hotfix-3  │  │   Claude Code Session (Native PTY)     │  │
│             │  │                                         │  │
│ [+ Add]     │  │   > User types here...                 │  │
│             │  │                                         │  │
│             │  └─────────────────────────────────────────┘  │
│             │  Status: Running | Working directory: ...     │
└─────────────┴───────────────────────────────────────────────┘
```

### Core Components

#### 1. **Worktree Manager** (`src/core/worktree-manager.ts`)
Manages git worktree lifecycle:
- `listWorktrees()` - Enumerate existing worktrees
- `createWorktree(branch: string, path?: string)` - Create new isolated worktree
- `deleteWorktree(path: string)` - Remove worktree
- `getWorktreeInfo(path: string)` - Get branch, status, etc.

**Dependencies**: `simple-git` or direct `child_process` with `git worktree` commands

#### 2. **Session Manager** (`src/core/session-manager.ts`)
Manages Claude Code CLI sessions:
- `createSession(worktreePath: string, options)` - Spawn Claude Code process
- `destroySession(sessionId: string)` - Kill process
- `sendInput(sessionId: string, input: string)` - Send user input to session
- `attachOutputStream(sessionId: string, callback)` - Stream output

**Dependencies**: `node-pty` for PTY creation

#### 3. **Layout Manager** (`src/ui/layout-manager.tsx` or `.ts`)
Manages UI layout and state:
- Sidebar component (worktree list)
- Tab bar component (session tabs)
- Main pane component (active session terminal)
- Keyboard navigation and shortcuts

#### 4. **PTY Manager** (`src/core/pty-manager.ts`)
Low-level pseudo-terminal management:
- `spawn(command, args, cwd)` - Create PTY instance
- `write(ptyId, data)` - Write to stdin
- `resize(ptyId, cols, rows)` - Handle terminal resize
- `onData(ptyId, callback)` - Handle stdout/stderr

**Dependencies**: `node-pty`

#### 5. **State Manager** (`src/state/app-state.ts`)
Centralized application state:
```typescript
interface AppState {
  worktrees: Worktree[];
  activeWorktree: string | null;
  sessions: Map<string, Session>;
  activeSession: string | null;
  layout: LayoutConfig;
}

interface Worktree {
  id: string;
  path: string;
  branch: string;
  sessions: string[]; // session IDs
}

interface Session {
  id: string;
  worktreeId: string;
  ptyId: string;
  title: string;
  status: 'running' | 'stopped' | 'error';
}
```

---

## Technical Stack

### Core Dependencies

```json
{
  "dependencies": {
    "@unblessed/core": "^latest",  // OR "ink": "^latest"
    "node-pty": "^1.0.0",
    "simple-git": "^3.x",
    "typescript": "^5.6.0"
  },
  "devDependencies": {
    "@types/node": "^latest",
    "tsx": "^latest",  // For running TS directly
    "vitest": "^latest"  // Testing
  }
}
```

### File Structure

```
claude-code-plus-plus/
├── src/
│   ├── index.ts                 # Entry point
│   ├── core/
│   │   ├── worktree-manager.ts
│   │   ├── session-manager.ts
│   │   ├── pty-manager.ts
│   │   └── config.ts
│   ├── ui/
│   │   ├── app.tsx (or .ts)
│   │   ├── components/
│   │   │   ├── sidebar.tsx
│   │   │   ├── tab-bar.tsx
│   │   │   ├── terminal-pane.tsx
│   │   │   └── status-bar.tsx
│   │   └── layout-manager.tsx
│   ├── state/
│   │   ├── app-state.ts
│   │   └── hooks.ts
│   └── utils/
│       ├── logger.ts
│       └── shortcuts.ts
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Key Technical Challenges & Solutions

### Challenge 1: Native Claude Code Input/Scrolling
**Problem**: Need to preserve native terminal behavior (raw input, ANSI codes, scrolling)

**Solution**:
- Use `node-pty` in **raw mode** to pass all input directly to Claude Code process
- Don't intercept input except for reserved shortcuts (e.g., `Ctrl+B` for sidebar toggle)
- Let PTY handle all ANSI escape sequences for formatting/colors

### Challenge 2: Multiple Sessions in Same Worktree
**Problem**: Tabs within a worktree share the same working directory

**Solution**:
- Each tab spawns a separate Claude Code process in the same `cwd`
- Use session isolation at the process level (different PIDs)
- Implement file locking or warn users about concurrent edits

### Challenge 3: Keyboard Shortcuts & Navigation
**Problem**: Need app-level shortcuts without breaking Claude Code input

**Solution**:
Implement **reserved key bindings**:
- `Ctrl+B` - Toggle sidebar focus
- `Ctrl+T` - New tab in current worktree
- `Ctrl+W` - Close current tab
- `Ctrl+N` - New worktree
- `Alt+[1-9]` - Switch to tab N
- `Ctrl+↑/↓` - Navigate worktrees in sidebar

When sidebar/UI has focus: normal keyboard navigation
When terminal has focus: pass all input to PTY **except** reserved shortcuts

### Challenge 4: Terminal Resize Events
**Problem**: Terminal resizing must propagate to active PTY

**Solution**:
```typescript
process.stdout.on('resize', () => {
  const { columns, rows } = process.stdout;
  ptyManager.resize(activeSessionId, columns, rows);
});
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Set up TypeScript project structure
- [ ] Implement `PTYManager` with basic spawn/write/resize
- [ ] Implement `WorktreeManager` with list/create/delete
- [ ] Implement `SessionManager` to orchestrate PTY + worktree
- [ ] Write unit tests for core modules

### Phase 2: Basic TUI (Week 2)
- [ ] Choose and integrate TUI framework (Ink or @unblessed)
- [ ] Implement basic layout (sidebar + main pane, no tabs yet)
- [ ] Implement worktree list sidebar
- [ ] Implement single terminal pane with PTY rendering
- [ ] Implement keyboard shortcut system

### Phase 3: Multi-Session Support (Week 3)
- [ ] Implement tab bar component
- [ ] Add session switching logic
- [ ] Handle multiple sessions per worktree
- [ ] Implement tab creation/deletion
- [ ] Add session state persistence (optional)

### Phase 4: Polish & Features (Week 4)
- [ ] Add status bar with context info
- [ ] Implement worktree creation UI
- [ ] Add confirmation dialogs for destructive actions
- [ ] Implement session titles/renaming
- [ ] Add color themes
- [ ] Error handling and edge cases

### Phase 5: Testing & Documentation
- [ ] Integration testing
- [ ] User documentation
- [ ] CLI help system
- [ ] Package for distribution (npm, homebrew)

---

## User Experience Flow

### Starting the Application
```bash
$ claude++
# OR
$ ccp  # shorter alias
```

### Creating a New Worktree
1. Press `Ctrl+N` (or click `[+ Add]` in sidebar)
2. Enter branch name
3. App creates worktree at `~/.claude-worktrees/<branch-name>`
4. Automatically spawns first Claude Code session

### Managing Sessions
1. Navigate to worktree in sidebar (↑/↓ arrows)
2. Press `Ctrl+T` to open new tab/session
3. Press `Alt+1`, `Alt+2`, etc. to switch tabs
4. Press `Ctrl+W` to close current tab

### Working with Claude Code
- Type naturally in the terminal pane
- All Claude Code features work normally (streaming, tool use, etc.)
- Output renders with full ANSI color support

---

## Configuration

### `~/.claude-code-plus-plus/config.json`
```json
{
  "worktreeBasePath": "~/.claude-worktrees",
  "claudeCodePath": "claude",  // Or custom path
  "theme": "dark",
  "keybindings": {
    "toggleSidebar": "Ctrl+B",
    "newTab": "Ctrl+T",
    "closeTab": "Ctrl+W",
    "newWorktree": "Ctrl+N"
  },
  "defaultWorktrees": [
    { "branch": "main", "autoStart": true }
  ]
}
```

---

## Alternative Approaches Considered

### 1. tmux-based solution
**Pros**: Mature, stable, well-known
**Cons**: Less control over UI, harder to integrate worktree management, requires tmux installed

### 2. Web-based UI (like multi-claude)
**Pros**: Rich UI capabilities, easier layout control
**Cons**: Defeats purpose of "purely terminal", more complex architecture (Electron)

### 3. Simple shell scripts
**Pros**: Minimal dependencies, easy to understand
**Cons**: No interactive UI, poor user experience

**Decision**: Custom TUI application strikes the best balance

---

## Success Metrics

- [ ] Can run 3+ Claude Code sessions simultaneously without conflicts
- [ ] Can create/delete worktrees without leaving the app
- [ ] Native Claude Code input/output works identically to running `claude` directly
- [ ] Keyboard navigation feels natural and responsive
- [ ] Starts up in < 1 second on modern hardware

---

## Open Questions

1. **Worktree naming**: Auto-generate names or always prompt user?
2. **Session persistence**: Save sessions on exit and restore on startup?
3. **Conflict detection**: Should we detect when two sessions modify the same file?
4. **Resource limits**: Max number of concurrent sessions?
5. **Git integration**: Should we auto-commit before switching worktrees?

---

## Next Steps

1. **Decision**: Choose TUI framework (Ink vs @unblessed)
2. **Prototype**: Build minimal viable version with 1 worktree, 1 session
3. **Iterate**: Add multi-session, multi-worktree support
4. **Test**: Validate with real Claude Code workflows
5. **Ship**: Package and distribute

---

## References

**Projects**:
- [Code Conductor](https://github.com/ryanmac/code-conductor) - GitHub Actions orchestration
- [Multi-Claude](https://github.com/LaurentMnr95/multi-claude) - Electron desktop app

**TUI Frameworks**:
- [Ink](https://github.com/vadimdemedes/ink) - React for CLIs
- [@unblessed](https://www.npmjs.com/package/@unblessed/core) - Modern blessed rewrite
- [neo-blessed](https://github.com/embarklabs/neo-blessed) - Blessed fork

**Terminal Libraries**:
- [node-pty](https://github.com/microsoft/node-pty) - PTY bindings
- [xterm.js](https://xtermjs.org/) - Terminal emulator (web-based, not used here)

**Articles**:
- [Building Terminal Interfaces with Node.js](https://blog.openreplay.com/building-terminal-interfaces-nodejs/)
- [7 TUI libraries for creating interactive terminal apps](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/)
