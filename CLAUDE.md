# Claude++ Agent Documentation

## Quick Directory Map

```
src/
├── sidebar/          # Main app, input, rendering, state management
├── terminal/         # Terminal bar UI (1-row handler)
├── tmux/             # Tmux command wrappers
├── git/              # Git worktree operations
├── cli/              # CLI argument parsing
├── config/           # Configuration loading
├── platform/         # Platform-specific utilities
├── launcher/         # Application launcher
├── types.ts          # Core type definitions
├── constants.ts      # Layout/UI constants
└── ansi.ts           # ANSI escape code utilities
```

## Documentation Reading Requirements

**CRITICAL**: Before modifying any code, you MUST read the required documentation.

| If modifying...                     | You MUST read...                              |
|-------------------------------------|-----------------------------------------------|
| `src/sidebar/app.ts`                | [SIDEBAR.md], [SESSION-MANAGEMENT.md]         |
| `src/sidebar/render.ts`             | [SIDEBAR.md]                                  |
| `src/sidebar/input.ts`              | [SIDEBAR.md], [HOTKEYS-AND-COMMANDS.md]       |
| `src/sidebar/commands.ts`           | [HOTKEYS-AND-COMMANDS.md]                     |
| `src/sidebar/pane-orchestrator.ts`  | [PANE-ORCHESTRATION.md]                       |
| `src/sidebar/session-manager.ts`    | [SESSION-MANAGEMENT.md]                       |
| `src/sidebar/terminal-manager.ts`   | [TERMINAL-SYSTEM.md]                          |
| `src/terminal/*.ts`                 | [TERMINAL-SYSTEM.md]                          |
| `src/tmux/*.ts`                     | [TMUX-INTEGRATION.md]                         |
| `src/git/worktree.ts`               | [WORKTREE-MANAGEMENT.md]                      |
| `src/types.ts`                      | [STATE-TYPES.md]                              |
| `src/constants.ts`                  | [STATE-TYPES.md]                              |

[SIDEBAR.md]: docs/agent/SIDEBAR.md
[SESSION-MANAGEMENT.md]: docs/agent/SESSION-MANAGEMENT.md
[HOTKEYS-AND-COMMANDS.md]: docs/agent/HOTKEYS-AND-COMMANDS.md
[PANE-ORCHESTRATION.md]: docs/agent/PANE-ORCHESTRATION.md
[TERMINAL-SYSTEM.md]: docs/agent/TERMINAL-SYSTEM.md
[TMUX-INTEGRATION.md]: docs/agent/TMUX-INTEGRATION.md
[WORKTREE-MANAGEMENT.md]: docs/agent/WORKTREE-MANAGEMENT.md
[STATE-TYPES.md]: docs/agent/STATE-TYPES.md

## Documentation Index

See [docs/agent/README.md](docs/agent/README.md) for full documentation index.

| Document | Coverage |
|----------|----------|
| [STATE-TYPES.md](docs/agent/STATE-TYPES.md) | Type definitions, state shapes, constants |
| [SIDEBAR.md](docs/agent/SIDEBAR.md) | SidebarApp lifecycle, input handling, rendering |
| [SESSION-MANAGEMENT.md](docs/agent/SESSION-MANAGEMENT.md) | Session CRUD, switching, cleanup |
| [TERMINAL-SYSTEM.md](docs/agent/TERMINAL-SYSTEM.md) | Terminal bar, panes, bar-handler protocol |
| [PANE-ORCHESTRATION.md](docs/agent/PANE-ORCHESTRATION.md) | Layout management, fullscreen modals, resize hooks |
| [WORKTREE-MANAGEMENT.md](docs/agent/WORKTREE-MANAGEMENT.md) | Git worktree operations |
| [HOTKEYS-AND-COMMANDS.md](docs/agent/HOTKEYS-AND-COMMANDS.md) | Key parsing, command routing |
| [TMUX-INTEGRATION.md](docs/agent/TMUX-INTEGRATION.md) | Tmux wrappers, pane operations |

## Global Coding Rules

### State Mutations
- All state changes flow through `SidebarApp` in `src/sidebar/app.ts`
- After state mutation, call `this.render()` to update UI
- Never modify state directly from render functions

### Pane IDs
- Pane IDs are tmux identifiers (e.g., `%0`, `%1`)
- Always store pane IDs when creating panes
- Use pane IDs for all tmux operations (select, resize, kill)

### Rendering
- All render functions are pure (no side effects)
- Render functions return ANSI strings
- Output is written to stdout via `process.stdout.write()`

### Tmux Wrappers
- Always use `src/tmux/pane.ts` functions, not raw tmux commands
- High-level operations handle error cases
- Low-level `src/tmux/commands.ts` is for internal use

### Terminal Bar Protocol
- Communication uses `TERM:<action>:<data>` format
- Sidebar → Bar: `RENDER:<json>`
- Bar → Sidebar: Ctrl+U + `TERM:action:data` + Enter

## Documentation Update Policy

**CRITICAL**: When you modify ANY code in this codebase, you MUST:

1. **Check the reading requirements table above**
2. **Read the required documentation BEFORE making changes**
3. **After completing changes, UPDATE the relevant documentation:**
   - Add/modify code flows if function signatures changed
   - Update state descriptions if types changed
   - Update "Last Updated" timestamp
4. **If adding new files, update [docs/agent/README.md](docs/agent/README.md) index**

Failure to follow this policy leads to stale documentation and bugs.

---
**Last Updated:** 2025-01-18
