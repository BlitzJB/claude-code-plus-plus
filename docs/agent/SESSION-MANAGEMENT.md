# Session Management

This document covers session lifecycle operations: create, switch, delete.

## Files Covered
- `src/sidebar/app.ts` - Session operations in SidebarApp
- `src/sidebar/session-manager.ts` - Session utility functions

---

## Overview

Sessions are Claude instances running in tmux panes:
- Each session belongs to a worktree
- Sessions can have multiple terminals
- Only one session is "active" (visible) at a time
- Inactive sessions continue running in background panes

---

## Session Utilities (`src/sidebar/session-manager.ts`)

### generateSessionId

```
generateSessionId(): string
Returns: "session-{timestamp}-{random}"

└─ const timestamp = Date.now()
└─ const random = Math.random().toString(36).substring(2, 8)
└─ return `session-${timestamp}-${random}`
```

### createClaudePane

```
createClaudePane(worktree: Worktree, state: SidebarState, isFirstSession: boolean): string
Parameters: worktree, state, isFirstSession
Returns: Pane ID

├─ If isFirstSession:
│   └─ Use existing mainPaneId
│   └─ Send Ctrl+C to clear any prompt
│   └─ Run Claude command in existing pane
│   └─ Return mainPaneId
│
└─ Else (additional session):
    └─ splitHorizontal(state.sessionName, CLAUDE_PANE_PERCENT, worktree.path)
    └─ Run Claude command in new pane
    └─ Return new pane ID
```

### cleanupSession

```
cleanupSession(session: Session, sessionName: string): void
Parameters: session, sessionName
State changes: Kills panes, removes hooks

└─ removeTerminalBarResize(sessionName)  // Remove resize hook
└─ For each terminal: killPane(terminal.paneId)
└─ If terminalBarPaneId: killPane(terminalBarPaneId)
└─ killPane(session.paneId)
```

### findNextSession

```
findNextSession(sessions: Session[], deletedSession: Session): Session | null
Parameters: all sessions, session being deleted
Returns: Next session to activate, or null

└─ Find sessions in same worktree
│   └─ Return first that isn't deletedSession
│
└─ If none: return any other session
└─ If no sessions: return null
```

---

## Create Session Flow (`src/sidebar/app.ts`)

### activateSelected (for worktree)

```
activateSelected(): void
State changes: modal, inputBuffer

└─ Get selected item
├─ If worktree:
│   └─ enterFullscreenModal()
│   └─ this.state.modal = 'new-session'
│   └─ this.state.inputBuffer = ''
│   └─ render()
│
└─ If session:
    └─ switchToSession(session)
```

### createSession

```
createSession(title: string): void
Parameters: title (user-provided session name)
State changes: sessions[], activeSessionId, pane layout

└─ Get selected worktree
└─ Generate sessionId = generateSessionId()
└─ isFirstSession = (sessions.length === 0)
│
├─ If isFirstSession:
│   └─ paneId = mainPaneId
│   └─ Run Claude command in mainPaneId
│
├─ Else if fullscreenModal:
│   └─ Break current session pane (stays hidden)
│   └─ paneId = splitHorizontal() from sidebarPaneId
│   └─ Run Claude command
│   └─ exitFullscreenModal() will rejoin later
│
└─ Else (normal case):
    └─ Break current session pane
    └─ paneId = splitHorizontal() with CLAUDE_PANE_PERCENT
    └─ Run Claude command
│
└─ Create session object:
    {
      id: sessionId,
      worktreeId: worktree.id,
      paneId: paneId,
      title: title,
      createdAt: Date.now(),
      terminals: [],
      activeTerminalIndex: 0,
      terminalBarPaneId: null
    }
│
└─ this.state.sessions.push(session)
└─ this.state.activeSessionId = sessionId
└─ enforceSidebarWidth()
└─ selectPane(sidebarPaneId)
└─ exitFullscreenModal()
└─ render()
```

---

## Switch Session Flow

### switchToSession

```
switchToSession(session: Session): void
Parameters: session to switch to
State changes: activeSessionId, pane layout

└─ If session.id === activeSessionId:
│   └─ selectPane(session.paneId)
│   └─ Return (already active)
│
└─ Get current active session
└─ breakSessionPanes(currentSession)  // Hide current session
│
└─ Join new session panes:
│   └─ joinPane(session.paneId, sidebarPaneId, true)  // horizontal
│   │
│   └─ If session has terminals:
│       └─ joinPane(terminalBarPaneId, session.paneId, false)  // vertical below Claude
│       └─ joinPane(activeTerminalPane, terminalBarPaneId, false)  // below bar
│       └─ resizePane(terminalBarPaneId, height: 1)
│       └─ setupTerminalBarResize()
│       └─ updateTerminalBar(session)
│
└─ this.state.activeSessionId = session.id
└─ selectPane(sidebarPaneId)
└─ render()
```

---

## Delete Session Flow

### showDeleteModal

```
showDeleteModal(): void
State changes: modal, deleteTarget, fullscreenModal

└─ Get selected item
└─ If no item: return
│
└─ enterFullscreenModal()
└─ this.state.modal = 'delete'
└─ this.state.modalSelection = 0  // Default to "Keep"
└─ this.state.deleteTarget = {
     type: item.type,
     id: item.id,
     name: item.label
   }
└─ render()
```

### deleteSelected

```
async deleteSelected(): Promise<void>
State changes: Via deleteSession() or deleteWorktree()

└─ Get deleteTarget
├─ If type === 'session':
│   └─ deleteSession(session)
│
└─ If type === 'worktree':
    └─ deleteWorktree(worktree)
```

### deleteSession

```
deleteSession(session: Session): void
Parameters: session to delete
State changes: sessions[], activeSessionId, selectedIndex

└─ cleanupSession(session)
│   └─ Remove resize hook
│   └─ Kill terminal panes
│   └─ Kill terminal bar pane
│   └─ Kill Claude pane
│
└─ Remove from state:
│   └─ this.state.sessions = sessions.filter(s => s.id !== session.id)
│
└─ If was activeSessionId:
│   └─ nextSession = findNextSession()
│   ├─ If nextSession exists:
│   │   └─ switchToSession(nextSession)
│   └─ Else:
│       └─ Create empty pane (welcome screen)
│       └─ this.state.activeSessionId = null
│
└─ Adjust selectedIndex if needed
└─ exitFullscreenModal()
└─ render()
```

---

## Rename Session Flow

### showRenameModal

```
showRenameModal(): void
State changes: modal, inputBuffer

└─ Get selected session
└─ If not a session: return
│
└─ enterFullscreenModal()
└─ this.state.modal = 'rename'
└─ this.state.inputBuffer = session.title
└─ render()
```

### renameSelected

```
renameSelected(newName: string): void
Parameters: newName
State changes: session.title

└─ Get selected session
└─ session.title = newName
└─ exitFullscreenModal()
└─ render()
```

---

## Session State Diagram

```
                 ┌──────────────┐
                 │   No Sessions│
                 └──────┬───────┘
                        │ Enter on worktree
                        ▼
               ┌────────────────┐
               │ New Session    │
               │    Modal       │
               └───────┬────────┘
                       │ Enter with name
                       ▼
        ┌──────────────────────────────┐
        │     Active Session           │
        │  (Claude pane visible)       │◄──────┐
        └──────────────┬───────────────┘       │
                       │                       │
        ┌──────────────┼───────────────┐       │
        │              │               │       │
        ▼              ▼               ▼       │
   ┌─────────┐   ┌──────────┐   ┌──────────┐  │
   │ Switch  │   │ Delete   │   │ Create   │  │
   │ Session │   │ Modal    │   │ Another  │  │
   └────┬────┘   └────┬─────┘   └────┬─────┘  │
        │             │              │         │
        │             │ Confirm      │         │
        │             ▼              │         │
        │      ┌──────────────┐      │         │
        │      │   Cleanup    │      │         │
        │      │   & Remove   │      │         │
        │      └──────┬───────┘      │         │
        │             │              │         │
        └─────────────┼──────────────┘         │
                      │                        │
                      └────────────────────────┘
```

---

## Session Data Example

```typescript
const session: Session = {
  id: 'session-1705596000000-abc123',
  worktreeId: 'main',
  paneId: '%5',
  title: 'Feature work',
  createdAt: 1705596000000,
  terminals: [
    {
      id: 'terminal-1705596100000-def456',
      sessionId: 'session-1705596000000-abc123',
      paneId: '%7',
      title: 'Terminal 1',
      createdAt: 1705596100000
    }
  ],
  activeTerminalIndex: 0,
  terminalBarPaneId: '%6'
};
```

---

## When to Update This Document

Update this document when:
- Changing session create/delete/switch logic
- Modifying session state shape
- Adding new session operations

After updating:
1. Update code flows with new function signatures
2. Update state diagram if states change
3. Update "Last Updated" timestamp

---
**Last Updated:** 2025-01-18
**Files Covered:** `src/sidebar/app.ts`, `src/sidebar/session-manager.ts`
