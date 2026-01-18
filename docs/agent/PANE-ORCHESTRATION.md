# Pane Orchestration

This document covers tmux pane layout management, fullscreen modals, and resize hooks.

## Files Covered
- `src/sidebar/pane-orchestrator.ts` - Pane layout utilities
- `src/sidebar/app.ts` - Fullscreen modal operations

---

## Overview

Pane orchestration handles:
- Breaking/joining panes for session switching
- Fullscreen modal display (breaks panes temporarily)
- Terminal bar resize enforcement (1-row height)
- Sidebar width enforcement

---

## Pane Orchestrator (`src/sidebar/pane-orchestrator.ts`)

### enforceSidebarWidth

```
enforceSidebarWidth(sidebarPaneId: string): void
Parameters: sidebarPaneId
State changes: Pane dimensions

└─ resizePane(sidebarPaneId, width: SIDEBAR_WIDTH)
```

### breakSessionPanes

```
breakSessionPanes(session: Session): void
Parameters: session
State changes: Pane layout (panes moved to background)

└─ If session has diff pane:
│   └─ Break diff pane
│
└─ If session has terminals:
│   └─ Break active terminal pane
│   └─ Break terminal bar pane
│
└─ Break Claude pane
```

**Note:** Broken panes continue running but aren't visible.

### joinSessionPanes

```
joinSessionPanes(session: Session, sidebarPaneId: string, sessionName: string): void
Parameters: session, sidebarPaneId, sessionName
State changes: Pane layout

└─ Join Claude pane to sidebar (horizontal)
│   └─ joinPane(session.paneId, sidebarPaneId, true)
│
└─ If session has diff pane:
│   └─ Join diff pane to right of Claude
│   │   └─ joinPane(diffPaneId, session.paneId, true)
│   │
│   └─ Resize diff pane to DIFF_PANE_WIDTH
│       └─ resizePane(diffPaneId, DIFF_PANE_WIDTH)
│
└─ If session has terminals:
    └─ Join terminal bar below Claude
    │   └─ joinPane(terminalBarPaneId, session.paneId, false)
    │
    └─ Join active terminal below bar
    │   └─ joinPane(activeTerminalPaneId, terminalBarPaneId, false)
    │
    └─ Resize bar to 1 row
    │   └─ resizePane(terminalBarPaneId, height: 1)
    │
    └─ Re-setup resize hook
        └─ setupTerminalBarResize(...)
```

---

## Resize Hook System

The resize hook ensures the terminal bar stays at exactly 1 row when users drag pane borders.

### setupTerminalBarResize

```
setupTerminalBarResize(sessionName: string, claudePaneId: string, barPaneId: string, terminalBodyPaneId: string): void
Parameters: sessionName, claudePaneId, barPaneId, terminalBodyPaneId
State changes: Creates hook script, sets tmux hook

└─ Create resize hook script at /tmp/cpp-resize-hook-{name}.sh
│   └─ Script contents:
│       1. Acquire lock (prevent recursion)
│       2. Get current heights of Claude, bar, terminal panes
│       3. Calculate bar overage: barHeight - 1
│       4. If overage > 0:
│           ├─ Compare to previous heights
│           ├─ If Claude shrank: resize terminal smaller
│           └─ If terminal shrank: resize Claude smaller
│       5. Set bar to exactly 1 row
│       6. Store current heights for next run
│       7. Release lock
│
└─ chmod 755 the script
│
└─ Set tmux hook:
    └─ setHook(sessionName, 'after-resize-pane', 'run-shell /tmp/cpp-resize-hook-{name}.sh')
```

### createResizeHookScript

```
createResizeHookScript(claudePaneId: string, barPaneId: string, terminalBodyPaneId: string): string
Parameters: pane IDs
Returns: Shell script content

Script logic:
1. LOCKFILE=/tmp/cpp-resize-lock-{barPaneId}
2. If lock exists, exit (prevent recursion)
3. Create lock file
4. Read previous heights from /tmp/cpp-resize-prev-{barPaneId}
5. Get current heights via tmux display-message
6. If bar height > 1:
   a. Calculate overage
   b. Determine which pane user resized (by comparing to previous)
   c. Adjust opposite pane to compensate
   d. Force bar to 1 row
7. Save current heights to prev file
8. Remove lock file
```

### removeTerminalBarResize

```
removeTerminalBarResize(sessionName: string): void
Parameters: sessionName
State changes: Removes hook

└─ removeHook(sessionName, 'after-resize-pane')
```

---

## Fullscreen Modal System

Fullscreen modals (quit, delete) need to temporarily hide the Claude/terminal panes.

### enterFullscreenModal (in SidebarApp)

```
enterFullscreenModal(): void
State changes: fullscreenModal = true, hiddenPaneId, pane layout

└─ If no active session: return
│
└─ Get active session
└─ breakSessionPanes(session)
│   └─ Breaks Claude pane (and terminals if any) to background
│
└─ Store first broken pane ID
│   └─ this.state.hiddenPaneId = session.paneId
│
└─ this.state.fullscreenModal = true
```

**Effect:** Sidebar expands to full terminal width for modal display.

### exitFullscreenModal (in SidebarApp)

```
exitFullscreenModal(): void
State changes: fullscreenModal = false, hiddenPaneId = null, pane layout

└─ If not in fullscreen modal: return
│
└─ this.state.fullscreenModal = false
│
└─ If hiddenPaneId exists:
│   └─ Get active session
│   └─ joinSessionPanes(session, sidebarPaneId, sessionName)
│
└─ this.state.hiddenPaneId = null
└─ selectPane(sidebarPaneId)
```

---

## Layout States

### Normal State (No Terminals)

```
┌─────────────────────┬──────────────────────────────────────┐
│                     │                                      │
│     Sidebar         │           Claude Pane                │
│    (25 cols)        │          (remaining)                 │
│                     │                                      │
└─────────────────────┴──────────────────────────────────────┘
```

### Normal State (With Terminals)

```
┌─────────────────────┬──────────────────────────────────────┐
│                     │           Claude Pane (70%)          │
│     Sidebar         ├──────────────────────────────────────┤
│    (25 cols)        │       Terminal Bar (1 row)           │
│                     ├──────────────────────────────────────┤
│                     │       Terminal Pane (~30%)           │
└─────────────────────┴──────────────────────────────────────┘
```

### Normal State (With Diff Pane)

```
┌─────────────────────┬────────────────────────┬─────────────────┐
│                     │                        │                 │
│     Sidebar         │      Claude Pane       │   Diff Pane     │
│    (25 cols)        │                        │   (30 cols)     │
│                     │                        │                 │
│                     │                        │  Changed Files: │
│                     │                        │  M file1.ts +22 │
│                     │                        │  A file2.ts +45 │
│                     │                        │                 │
└─────────────────────┴────────────────────────┴─────────────────┘
```

### File Diff View Mode

When a file is selected in the diff pane, Claude pane is broken to background and replaced with header + content panes.

```
┌─────────────┬────────────────────────────┬─────────────────┐
│   Sidebar   │ [1-row] ← Back │ file.ts   │   Diff Pane     │
│  (25 cols)  ├────────────────────────────┤   (30 cols)     │
│             │                            │                 │
│  Worktrees  │  Full file content with    │  Changed Files: │
│  Sessions   │  inline diffs (colored)    │ >M file1.ts +22 │
│             │  Uses native `less` scroll │  A file2.ts +45 │
│             │                            │                 │
└─────────────┴────────────────────────────┴─────────────────┘
```

**Key differences from Normal Mode:**
- Sidebar remains visible and unchanged
- Claude pane is broken to background (process preserved)
- 1-row header pane shows "← Back" button + filename + stats
- Content pane runs `less -R` on temp file with colored diff
- Native scrolling via `less` (arrow keys, j/k, mouse wheel, etc.)
- On close: kill header + content panes, join Claude pane back

### Fullscreen Modal State

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                    Sidebar (Full Width)                    │
│                                                            │
│     ┌────────────────────────────────────────────────┐    │
│     │                                                │    │
│     │              Modal Content                     │    │
│     │                                                │    │
│     └────────────────────────────────────────────────┘    │
│                                                            │
│      [Claude/Terminal panes broken to background]          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Collapsed State

```
┌──┬─────────────────────────────────────────────────────────┐
│▸ │                                                         │
│2 │              Claude Pane (most of width)               │
│  │                                                         │
└──┴─────────────────────────────────────────────────────────┘
 2
cols
```

---

## Pane Transition Flows

### Session Switch (A → B)

```
1. cleanupFileWatcher()
   └─ Stop watching for file changes

2. breakSessionPanes(sessionA)
   └─ Session A panes go to background (diff, terminals, Claude)

3. joinSessionPanes(sessionB, sidebarPaneId, sessionName)
   └─ Claude pane joins right of sidebar
   └─ If diff pane: joins right of Claude, resize to 30 cols
   └─ If terminals: bar joins below Claude, terminal below bar
   └─ Resize hook re-established

4. If session B has diff pane:
   └─ setupFileWatcher(worktreePath, sessionB)

5. State: activeSessionId = sessionB.id
```

### Enter Fullscreen Modal

```
1. enterFullscreenModal()
   └─ breakSessionPanes(activeSession)
   └─ hiddenPaneId = session.paneId
   └─ fullscreenModal = true

2. render()
   └─ Sidebar now has full width
   └─ Modal rendered fullscreen
```

### Exit Fullscreen Modal

```
1. exitFullscreenModal()
   └─ fullscreenModal = false
   └─ joinSessionPanes(activeSession, ...)
   └─ hiddenPaneId = null

2. render()
   └─ Sidebar back to SIDEBAR_WIDTH
   └─ Normal view rendered
```

---

## Resize Hook Flow

```
User drags pane border
        │
        ▼
tmux 'after-resize-pane' hook fires
        │
        ▼
/tmp/cpp-resize-hook-{name}.sh executes
        │
        ├─ Check lock (prevent recursion)
        │
        ├─ Get current pane heights
        │
        ├─ Compare to previous heights
        │   └─ Determine which pane user resized
        │
        ├─ If bar > 1 row:
        │   ├─ Adjust opposite pane to compensate
        │   └─ Force bar to 1 row
        │
        └─ Save heights for next run
```

---

## When to Update This Document

Update this document when:
- Changing pane layout logic
- Modifying fullscreen modal behavior
- Updating resize hook script
- Adding new layout states

After updating:
1. Update code flows with new function signatures
2. Update layout diagrams
3. Update "Last Updated" timestamp

---
**Last Updated:** 2026-01-18
**Files Covered:** `src/sidebar/pane-orchestrator.ts`, `src/sidebar/app.ts`, `src/diff/diff-manager.ts`
