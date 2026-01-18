# Agent Documentation Index

This directory contains comprehensive documentation for AI agents working on Claude++.

## Document Index

| Document | Primary Source Files | Coverage |
|----------|---------------------|----------|
| [STATE-TYPES.md](STATE-TYPES.md) | `src/types.ts`, `src/constants.ts` | Type definitions, interfaces, state shapes, constants |
| [SIDEBAR.md](SIDEBAR.md) | `src/sidebar/app.ts`, `src/sidebar/render.ts`, `src/sidebar/input.ts` | SidebarApp class, lifecycle, input handling, rendering |
| [SESSION-MANAGEMENT.md](SESSION-MANAGEMENT.md) | `src/sidebar/app.ts`, `src/sidebar/session-manager.ts` | Session CRUD operations, switching, cleanup |
| [TERMINAL-SYSTEM.md](TERMINAL-SYSTEM.md) | `src/terminal/bar-handler.ts`, `src/terminal/bar-render.ts`, `src/sidebar/terminal-manager.ts` | Terminal bar UI, bar handler protocol, terminal panes |
| [PANE-ORCHESTRATION.md](PANE-ORCHESTRATION.md) | `src/sidebar/pane-orchestrator.ts`, `src/sidebar/app.ts` | Layout management, fullscreen modals, resize hooks |
| [WORKTREE-MANAGEMENT.md](WORKTREE-MANAGEMENT.md) | `src/git/worktree.ts` | Git worktree operations |
| [HOTKEYS-AND-COMMANDS.md](HOTKEYS-AND-COMMANDS.md) | `src/sidebar/commands.ts`, `src/sidebar/input.ts` | Key parsing, command routing, hotkey system |
| [TMUX-INTEGRATION.md](TMUX-INTEGRATION.md) | `src/tmux/commands.ts`, `src/tmux/pane.ts` | Tmux wrappers, pane operations |
| [DIFF-PANE.md](DIFF-PANE.md) | `src/diff/*.ts` | Git diff viewer, file changes, diff rendering |

## When to Update Documentation

Update documentation when you:

1. **Add a new function** - Document in relevant feature file
2. **Change function signature** - Update code flow in relevant file
3. **Modify state shape** - Update STATE-TYPES.md and affected feature files
4. **Add new hotkeys** - Update HOTKEYS-AND-COMMANDS.md
5. **Change communication protocol** - Update TERMINAL-SYSTEM.md or relevant file
6. **Add new files** - Update this index
7. **Add new types** - Update STATE-TYPES.md

## How to Update Documentation

### Step 1: Identify Affected Documents
Use the table above to find which documents cover the files you changed.

### Step 2: Update Code Flows
If you changed function behavior:
```
### [Operation Name]

function_name(parameters)
Parameters: param1 (type), param2 (type)
State changes: state.field1, state.field2
Returns: returnType

└─ Step 1 description
   └─ Nested call: other_function()
   └─ State: state.field = newValue
└─ Step 2 description
```

### Step 3: Update File References
If you added/renamed files, update the "Files Covered" section.

### Step 4: Update Timestamp
Change the "Last Updated" date at the bottom of each modified document.

### Step 5: Update This Index
If you added new files or changed coverage, update the table above.

## Quality Checklist

Before committing documentation changes:

- [ ] All function signatures match actual code
- [ ] State changes are accurately documented
- [ ] Cross-references between docs are valid
- [ ] "Last Updated" timestamps are current
- [ ] New files are listed in this index
- [ ] Code flow indentation is consistent

## Source File Coverage

Every source file in `src/` should be documented. Current coverage:

| Source File | Documented In |
|-------------|---------------|
| `src/types.ts` | STATE-TYPES.md |
| `src/constants.ts` | STATE-TYPES.md |
| `src/ansi.ts` | STATE-TYPES.md |
| `src/sidebar/app.ts` | SIDEBAR.md, SESSION-MANAGEMENT.md |
| `src/sidebar/render.ts` | SIDEBAR.md |
| `src/sidebar/input.ts` | SIDEBAR.md, HOTKEYS-AND-COMMANDS.md |
| `src/sidebar/commands.ts` | HOTKEYS-AND-COMMANDS.md |
| `src/sidebar/pane-orchestrator.ts` | PANE-ORCHESTRATION.md |
| `src/sidebar/session-manager.ts` | SESSION-MANAGEMENT.md |
| `src/sidebar/terminal-manager.ts` | TERMINAL-SYSTEM.md |
| `src/terminal/bar-handler.ts` | TERMINAL-SYSTEM.md |
| `src/terminal/bar-render.ts` | TERMINAL-SYSTEM.md |
| `src/tmux/commands.ts` | TMUX-INTEGRATION.md |
| `src/tmux/pane.ts` | TMUX-INTEGRATION.md |
| `src/git/worktree.ts` | WORKTREE-MANAGEMENT.md |
| `src/diff/git-diff.ts` | DIFF-PANE.md |
| `src/diff/diff-pane-render.ts` | DIFF-PANE.md |
| `src/diff/diff-handler.ts` | DIFF-PANE.md |
| `src/diff/file-diff-header-render.ts` | DIFF-PANE.md |
| `src/diff/file-diff-header-handler.ts` | DIFF-PANE.md |
| `src/diff/diff-manager.ts` | DIFF-PANE.md, PANE-ORCHESTRATION.md |

---
**Last Updated:** 2026-01-18
