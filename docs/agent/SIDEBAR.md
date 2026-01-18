# Sidebar System

This document covers the main sidebar application, input handling, and rendering.

## Files Covered
- `src/sidebar/app.ts` - SidebarApp class (main state machine)
- `src/sidebar/render.ts` - ANSI rendering functions
- `src/sidebar/input.ts` - Key/mouse parsing, terminal mode

---

## Overview

The sidebar is the main control interface showing:
- Worktrees as top-level items
- Sessions nested under worktrees
- Selection indicator and active session highlight
- Modal overlays for actions

---

## SidebarApp Lifecycle (`src/sidebar/app.ts`)

### Constructor

```
constructor(repoPath: string, sessionName: string, mainPaneId: string, sidebarPaneId: string)
Parameters: repoPath, sessionName, mainPaneId, sidebarPaneId
State changes: Initializes this.state with SidebarState

└─ Set this.state = {
     repoPath, sessionName, mainPaneId, sidebarPaneId,
     worktrees: [], sessions: [],
     selectedIndex: 0, activeSessionId: null,
     modal: 'none', modalSelection: 0, inputBuffer: '',
     fullscreenModal: false, hiddenPaneId: null,
     collapsed: false, terminalCommandMode: false,
     ...
   }
```

### init

```
async init(): Promise<void>
State changes: this.state.worktrees

└─ Create WorktreeManager(repoPath)
└─ Try: worktrees = await manager.list()
   ├─ Success: this.state.worktrees = worktrees
   └─ Failure (not git repo):
      └─ Create single worktree for current directory
         └─ { id: 'main', path: repoPath, branch: 'N/A', isMain: true }
```

### start

```
start(): void
State changes: this.running = true

└─ Write to stdout: hideCursor() + enableMouse()
└─ setupRawMode()
└─ process.stdin.on('data', this.handleInput)
└─ process.stdout.on('resize', this.onResize)
└─ this.running = true
└─ this.render()
```

### stop

```
stop(): void
State changes: this.running = false

└─ Write to stdout: showCursor() + disableMouse()
└─ restoreMode()
└─ this.running = false
```

---

## Input Handling

### handleInput

```
handleInput(data: Buffer): void
Parameters: data (raw input bytes)
State changes: Various based on input type

└─ Convert to string: str = data.toString()
│
├─ Terminal command mode? (this.state.terminalCommandMode)
│   └─ Accumulate buffer until Ctrl+J (newline)
│       ├─ If ends with \n: executeTerminalCommand(buffer)
│       └─ Else: append to terminalCommandBuffer
│
├─ Ctrl+U received? (data[0] === 0x15)
│   └─ Enter terminal command mode
│       └─ this.state.terminalCommandMode = true
│
├─ Mouse event? (isMouseEvent(str))
│   └─ Parse SGR mouse event
│       └─ If left button release: handleClick(y, x)
│
└─ Keyboard input:
    └─ Route based on modal:
        ├─ 'quit' ─────────► handleQuitModalInput(key)
        ├─ 'delete' ───────► handleDeleteModalInput(key)
        ├─ 'error' ────────► handleErrorModalInput(key)
        ├─ 'new-worktree' ─► handleTextInput(key, data)
        ├─ 'new-session' ──► handleTextInput(key, data)
        ├─ 'rename' ───────► handleTextInput(key, data)
        └─ 'none' ─────────► handleMainInput(key)
```

### handleMainInput

```
handleMainInput(key: KeyEvent): void
Parameters: key (parsed key event)
State changes: selectedIndex, modal, collapsed

└─ If collapsed:
│   └─ Expand sidebar
│   └─ Return (consume key)
│
└─ Create CommandContext with action handlers:
    actions = {
      moveUp: () => { selectedIndex = max(0, selectedIndex - 1) },
      moveDown: () => { selectedIndex = min(maxIndex, selectedIndex + 1) },
      activateSelected: () => this.activateSelected(),
      showQuitModal: () => this.enterFullscreenModal() + modal = 'quit',
      showDeleteModal: () => this.showDeleteModal(),
      showNewWorktreeModal: () => modal = 'new-worktree',
      showRenameModal: () => modal = 'rename',
      toggleCollapsed: () => this.toggleCollapsed(),
      createTerminal: () => this.createTerminal(),
    }
└─ executeCommand(MAIN_COMMANDS, key, context)
└─ this.render()
```

### handleQuitModalInput

```
handleQuitModalInput(key: KeyEvent): void
Parameters: key
State changes: modal, modalSelection

├─ Escape: exitFullscreenModal(), modal = 'none'
├─ Up/Down/j/k: modalSelection = 1 - modalSelection (toggle 0↔1)
├─ Enter/y:
│   ├─ modalSelection === 0: detachClient() (keeps sessions)
│   └─ modalSelection === 1: deleteAllSessions() + killSession()
└─ n/N: exitFullscreenModal(), modal = 'none'
```

### handleDeleteModalInput

```
handleDeleteModalInput(key: KeyEvent): void
Parameters: key
State changes: modal, modalSelection, sessions/worktrees (if confirmed)

├─ Escape/n/N: exitFullscreenModal(), modal = 'none'
├─ Up/Down/j/k: modalSelection = 1 - modalSelection
└─ Enter/y/Y:
    └─ If modalSelection === 1 (Delete):
        └─ deleteSelected()
    └─ exitFullscreenModal(), modal = 'none'
```

### handleTextInput

```
handleTextInput(key: KeyEvent, data: Buffer): void
Parameters: key, raw data
State changes: inputBuffer, modal

├─ Escape: exitFullscreenModal(), modal = 'none', inputBuffer = ''
├─ Enter: confirmTextInput()
├─ Backspace: inputBuffer = inputBuffer.slice(0, -1)
└─ Printable char (with validation):
    └─ inputBuffer += char
```

### handleClick

```
handleClick(row: number, col: number): void
Parameters: row (1-indexed), col (1-indexed)
State changes: selectedIndex, collapsed

├─ If collapsed: expand and return
├─ If modal open: ignore
├─ Check collapse button (row 1, right side): toggleCollapsed()
├─ Map row to list item index:
│   └─ listIndex = row - HEADER_ROW_COUNT
│   └─ If valid index: selectedIndex = index, activateSelected()
└─ Check "New Worktree" button: modal = 'new-worktree'
```

---

## Rendering (`src/sidebar/render.ts`)

### buildListItems

```
buildListItems(state: SidebarState): ListItem[]
Parameters: state
Returns: Flat array of list items

└─ For each worktree:
    └─ Add { type: 'worktree', id, label: worktree.branch, indent: 0 }
    └─ For each session where session.worktreeId === worktree.id:
        └─ Add { type: 'session', id, label: session.title, indent: 1 }
```

### renderMain

```
renderMain(state: SidebarState): string
Parameters: state
Returns: ANSI string for full sidebar

└─ Get dimensions: { width: SIDEBAR_WIDTH, height: terminalRows }
└─ Build output:
    Row 1: Title + collapse button
    Row 2: Subtitle (dimmed)
    Row 3: Separator (─────)
    Rows 4+: List items
      └─ For each item:
          ├─ Selection indicator (► if selected)
          ├─ Indent (spaces for sessions)
          ├─ Icon (📁 worktree, └─ session)
          ├─ Label (truncated)
          └─ Colors:
              ├─ Selected: inverse
              ├─ Active session: yellow
              ├─ Worktree with sessions: green
              └─ Other: dim
    After list: "+ New Worktree" button
    Footer: Key hints
    Bottom: Version number
```

### renderQuitModal

```
renderQuitModal(state: SidebarState, dims?: { width, height }): string
Parameters: state, optional dimensions
Returns: ANSI string for quit modal

└─ Full-screen centered modal
└─ Title: "Quit Claude++?"
└─ Info: "N active sessions"
└─ Options:
    ├─ [0] Detach (keep sessions running)
    └─ [1] Kill All Sessions
└─ Highlight selected option with inverse
└─ Footer: "Use ↑↓ to select, Enter to confirm"
```

### renderDeleteModal

```
renderDeleteModal(state: SidebarState, targetName: string, dims?): string
Parameters: state, target name, optional dimensions
Returns: ANSI string for delete confirmation

└─ Full-screen centered modal
└─ Title: "Confirm Delete"
└─ Context message based on target type:
    ├─ Session: "You can resume later"
    └─ Worktree: "This will delete N sessions and the worktree directory"
└─ Options:
    ├─ [0] No, Keep It (default)
    └─ [1] Yes, Delete
```

### renderInputModal

```
renderInputModal(state: SidebarState, title: string, prompt: string, dims?): string
Parameters: state, title, prompt, optional dimensions
Returns: ANSI string for text input modal

└─ Full-screen centered modal
└─ Title: title parameter
└─ Prompt: prompt parameter
└─ Input field: [inputBuffer█]
└─ Context hint based on modal type
└─ Footer: "Enter to confirm, Esc to cancel"
```

### renderErrorModal

```
renderErrorModal(state: SidebarState, dims?): string
Parameters: state, optional dimensions
Returns: ANSI string for error display

└─ Full-screen centered modal
└─ Title: "Error"
└─ Word-wrapped error message
└─ [OK] button
└─ Footer: "Press any key to dismiss"
```

### renderCollapsed

```
renderCollapsed(sessionCount: number): string
Parameters: sessionCount
Returns: ANSI string for collapsed sidebar (2 columns)

└─ Row 1: "▸" (expand indicator)
└─ Row 2: Session count
└─ Rest: empty (cleared)
```

---

## Input Parsing (`src/sidebar/input.ts`)

### parseKey

```
parseKey(data: Buffer): KeyEvent
Parameters: data (raw input)
Returns: KeyEvent { key, ctrl, alt, shift, raw }

└─ Single byte:
    ├─ 0x1b (27): key = 'escape'
    ├─ 0x0d (13): key = 'enter'
    ├─ 0x7f (127): key = 'backspace'
    ├─ 0x09 (9): key = 'tab'
    ├─ 0x01-0x1a: ctrl = true, key = chr(byte + 96)
    └─ Printable (32-126): key = char, shift = uppercase
│
└─ Escape sequence (\x1b[...):
    ├─ \x1b[A: key = 'up'
    ├─ \x1b[B: key = 'down'
    ├─ \x1b[C: key = 'right'
    ├─ \x1b[D: key = 'left'
    ├─ \x1b[H: key = 'home'
    ├─ \x1b[F: key = 'end'
    ├─ \x1b[5~: key = 'pageup'
    ├─ \x1b[6~: key = 'pagedown'
    └─ \x1b[3~: key = 'delete'
│
└─ Alt+key (\x1b + char):
    └─ alt = true, key = char
```

### parseMouseEvent

```
parseMouseEvent(str: string): MouseEvent | null
Parameters: str (SGR mouse event string)
Returns: MouseEvent or null

└─ Match regex: /\x1b\[<(\d+);(\d+);(\d+)([Mm])/
└─ Parse: button, x (col), y (row), M/m (press/release)
└─ Return { button: button & 3, x, y, release: char === 'm' }
```

### isMouseEvent

```
isMouseEvent(str: string): boolean
Parameters: str
Returns: true if SGR mouse event

└─ Test regex: /\x1b\[<\d+;\d+;\d+[Mm]/
```

### Terminal Mode Functions

```
setupRawMode(): void
└─ process.stdin.setRawMode(true)
└─ process.stdin.resume()

restoreMode(): void
└─ process.stdin.setRawMode(false)
└─ process.stdin.pause()
```

---

## State-Render Relationship

```
SidebarState
    │
    ├── modal: 'none'
    │   └─► renderMain(state)
    │
    ├── modal: 'quit'
    │   └─► renderQuitModal(state)
    │
    ├── modal: 'delete'
    │   └─► renderDeleteModal(state, target.name)
    │
    ├── modal: 'new-worktree' | 'new-session' | 'rename'
    │   └─► renderInputModal(state, title, prompt)
    │
    ├── modal: 'error'
    │   └─► renderErrorModal(state)
    │
    └── collapsed: true
        └─► renderCollapsed(sessionCount)
```

---

## When to Update This Document

Update this document when:
- Adding new modal types
- Changing input handling logic
- Modifying render functions
- Adding new key bindings (also update HOTKEYS-AND-COMMANDS.md)

After updating:
1. Update code flows with new function signatures
2. Update state-render relationship diagram
3. Update "Last Updated" timestamp

---
**Last Updated:** 2025-01-18
**Files Covered:** `src/sidebar/app.ts`, `src/sidebar/render.ts`, `src/sidebar/input.ts`
