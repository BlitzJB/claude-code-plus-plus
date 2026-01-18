# Terminal System

This document covers the terminal bar, terminal panes, and bar handler communication.

## Files Covered
- `src/terminal/bar-handler.ts` - Terminal bar input handler process
- `src/terminal/bar-render.ts` - Terminal bar ANSI rendering
- `src/sidebar/terminal-manager.ts` - Terminal utility functions

---

## Overview

The terminal system provides:
- Multiple terminal panes per session
- 1-row terminal bar showing tabs
- Keyboard/mouse navigation between terminals
- Communication between bar handler and sidebar

---

## Terminal Manager (`src/sidebar/terminal-manager.ts`)

### generateTerminalId

```
generateTerminalId(): string
Returns: "terminal-{timestamp}-{random}"
```

### createFirstTerminalLayout

```
createFirstTerminalLayout(session: Session, worktreePath: string, sessionName: string): { barPaneId: string, terminalPaneId: string }
Parameters: session, worktreePath, sessionName
Returns: { barPaneId, terminalPaneId }
State changes: Pane layout, resize hook

└─ Split Claude pane vertically (70% Claude, 30% terminal area)
│   └─ terminalAreaPaneId = splitVertical(sessionName, CLAUDE_PANE_PERCENT, worktreePath)
│
└─ Split terminal area (1 row bar, rest terminal)
│   └─ barPaneId = splitVertical(sessionName, 1)  // 1 row for bar
│   └─ terminalPaneId = result (bottom pane)
│
└─ Resize bar to exactly 1 row
│   └─ resizePane(barPaneId, height: TERMINAL_BAR_HEIGHT)
│
└─ Setup resize hook
│   └─ setupTerminalBarResize(sessionName, session.paneId, barPaneId, terminalPaneId)
│
└─ Return { barPaneId, terminalPaneId }
```

**Resulting Layout:**
```
┌─────────────────────┬───────────────────────────────────┐
│     Sidebar         │         Claude Pane (70%)        │
│                     │                                   │
│                     ├───────────────────────────────────┤
│                     │  Terminal Bar (1 row)             │
│                     ├───────────────────────────────────┤
│                     │  Terminal Pane (~30% minus 1)     │
│                     │                                   │
└─────────────────────┴───────────────────────────────────┘
```

### createAdditionalTerminal

```
createAdditionalTerminal(currentTerminalPaneId: string, sessionName: string, worktreePath: string): string
Parameters: currentTerminalPaneId, sessionName, worktreePath
Returns: New terminal pane ID
State changes: Pane layout

└─ Split current terminal 50/50
│   └─ newPaneId = splitHorizontal(sessionName, 50, worktreePath)
│
└─ Break current terminal to background
│   └─ breakPane(currentTerminalPaneId)
│
└─ Return newPaneId
```

### switchToTerminal

```
switchToTerminal(session: Session, currentIndex: number, targetIndex: number, sessionName: string): void
Parameters: session, currentIndex, targetIndex, sessionName
State changes: Pane layout

└─ Break current terminal
│   └─ breakPane(session.terminals[currentIndex].paneId)
│
└─ Join target terminal below bar
│   └─ joinPane(session.terminals[targetIndex].paneId, session.terminalBarPaneId, false)
│
└─ Resize bar to 1 row
│   └─ resizePane(session.terminalBarPaneId, height: TERMINAL_BAR_HEIGHT)
│
└─ Re-setup resize hook
│   └─ setupTerminalBarResize(...)
```

### deleteTerminal

```
deleteTerminal(session: Session, terminal: Terminal, index: number, sessionName: string): { cleanupBar: boolean, nextTerminalToShow: Terminal | null, newActiveIndex: number }
Parameters: session, terminal, index, sessionName
Returns: Cleanup instructions

└─ Kill terminal pane
│   └─ killPane(terminal.paneId)
│
└─ Calculate new active index:
│   └─ If deleted was active: pick previous or first
│   └─ If deleted was before active: decrement active
│
└─ If last terminal:
│   └─ return { cleanupBar: true, nextTerminalToShow: null }
│
└─ Else:
    └─ return { cleanupBar: false, nextTerminalToShow: ..., newActiveIndex: ... }
```

### cleanupTerminalBar

```
cleanupTerminalBar(session: Session, sessionName: string): void
Parameters: session, sessionName
State changes: Pane layout, removes hook

└─ removeTerminalBarResize(sessionName)
└─ killPane(session.terminalBarPaneId)
```

### startTerminalBarHandler

```
startTerminalBarHandler(barPaneId: string, sidebarPaneId: string, sessionId: string): void
Parameters: barPaneId, sidebarPaneId, sessionId
State changes: Runs bar handler in bar pane

└─ Find bar-handler script path (src or dist)
└─ Build initial state JSON
└─ runInPane(barPaneId, `npx tsx bar-handler.ts ${sidebarPaneId} ${sessionId} '${initialState}'`)
```

### updateTerminalBar

```
updateTerminalBar(session: Session, sidebarPaneId: string): void
Parameters: session, sidebarPaneId
State changes: Sends update to bar handler

└─ Get bar pane width
│   └─ width = getPaneDimensions(session.terminalBarPaneId).width
│
└─ Build state JSON:
    {
      terminals: session.terminals,
      activeIndex: session.activeTerminalIndex,
      width: width
    }
│
└─ Send to bar pane:
    └─ sendControlKey(sidebarPaneId, 'C-u')  // Ctrl+U prefix
    └─ sendKeys(sidebarPaneId, `RENDER:${json}`)
    └─ sendControlKey(sidebarPaneId, 'Enter')
```

---

## Bar Handler (`src/terminal/bar-handler.ts`)

The bar handler is a separate process running in the 1-row terminal bar pane.

### State

```typescript
interface BarState {
  sidebarPaneId: string;
  sessionId: string;
  terminals: Terminal[];
  activeIndex: number;
  tabPositions: TabPosition[];  // For click handling
}
```

### handleInput

```
handleInput(data: Buffer): void
Parameters: raw input
State changes: Various based on input

└─ Convert to string
│
├─ RENDER command? (str.startsWith('RENDER:'))
│   └─ Parse JSON after 'RENDER:'
│   └─ Update state.terminals, state.activeIndex
│   └─ render()
│
├─ Mouse event? (isMouseEvent(str))
│   └─ Parse SGR mouse event
│   └─ If left button release on row 1:
│       └─ handleTabClick(col)
│
└─ Keyboard:
    ├─ 1-9: sendToSidebar('switch', index - 1)
    ├─ Tab: cycleTab(1)
    ├─ Shift+Tab: cycleTab(-1)
    ├─ h / Left: cycleTab(-1)
    ├─ l / Right: cycleTab(1)
    ├─ n / c: sendToSidebar('new')
    ├─ d: sendToSidebar('delete', activeIndex)
    ├─ Enter: sendToSidebar('focus')
    └─ Escape: sendToSidebar('escape')
```

### sendToSidebar

```
sendToSidebar(action: string, data: string = ''): void
Parameters: action, optional data
State changes: Sends command to sidebar

└─ Build command: `TERM:${action}:${data}`
└─ sendControlKey(sidebarPaneId, 'C-u')
└─ sendKeys(sidebarPaneId, command)
└─ sendControlKey(sidebarPaneId, 'Enter')
```

**Protocol:** `TERM:<action>:<data>` where action is:
- `switch` - data = target index
- `new` - no data
- `delete` - data = index to delete
- `focus` - no data, selects active terminal pane
- `escape` - no data, returns focus to sidebar

### handleTabClick

```
handleTabClick(col: number): void
Parameters: col (1-indexed)
State changes: May trigger tab switch or new terminal

└─ tabIndex = findClickedTab(col, tabPositions)
├─ If tabIndex === -1: sendToSidebar('new')  // Clicked [+]
├─ If tabIndex >= 0: sendToSidebar('switch', tabIndex)
└─ If null: ignore (clicked empty space)
```

### cycleTab

```
cycleTab(direction: number): void
Parameters: direction (1 = forward, -1 = backward)
State changes: Triggers tab switch

└─ newIndex = activeIndex + direction
└─ Clamp to [0, terminals.length - 1]
└─ If newIndex !== activeIndex:
    └─ sendToSidebar('switch', newIndex)
```

### render

```
render(): void
State changes: Updates terminal output

└─ Get terminal width
└─ { output, tabPositions } = renderTerminalBar(terminals, activeIndex, width)
└─ this.state.tabPositions = tabPositions
└─ process.stdout.write(output)
```

---

## Bar Rendering (`src/terminal/bar-render.ts`)

### renderTerminalBar

```
renderTerminalBar(terminals: Terminal[], activeIndex: number, width: number): { output: string, tabPositions: TabPosition[] }
Parameters: terminals, activeIndex, width
Returns: ANSI output and tab positions

└─ If no terminals:
│   └─ Return "No terminals. Press 'n' to create." + hints
│
└─ Calculate available width for tabs
│   └─ reservedWidth = "[+]".length + hints.length + padding
│   └─ availableWidth = width - reservedWidth
│
└─ For each terminal:
│   ├─ Build tab label: `${index + 1}: ${title}`
│   ├─ Truncate if needed
│   ├─ Apply styles:
│   │   ├─ Active: bg.cyan + fg.black + bold
│   │   └─ Inactive: dim
│   ├─ Add separator "|" between tabs
│   └─ Track position: { index, startCol, endCol }
│
└─ Add [+] button (bright green)
└─ Add hints on right: "1-9:switch n:new d:del"
└─ Return { output, tabPositions }
```

### findClickedTab

```
findClickedTab(col: number, tabPositions: TabPosition[]): number | null
Parameters: col (1-indexed), tabPositions
Returns: tab index, -1 for [+], null for no match

└─ For each tab position:
│   └─ If col >= startCol && col <= endCol:
│       └─ Return index
│
└─ Check [+] button position:
│   └─ If col in [+] range: return -1
│
└─ Return null
```

---

## Communication Protocol

```
┌─────────────────────────────────────────────────────────────────┐
│                    Sidebar Process                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │  1. User presses Ctrl+T                                     ││
│  │  2. createTerminal()                                        ││
│  │  3. startTerminalBarHandler(barPaneId, sidebarPaneId, ...)  ││
│  │  4. updateTerminalBar(session)                              ││
│  │       └── Sends: RENDER:{"terminals":[...],"activeIndex":0} ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              │ RENDER:json                       │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Bar Handler Process                        ││
│  │                                                              ││
│  │  5. Receives RENDER command                                 ││
│  │  6. Updates state and re-renders                            ││
│  │  7. User clicks tab or presses key                          ││
│  │  8. sendToSidebar('switch', '2')                            ││
│  │       └── Sends: Ctrl+U + "TERM:switch:2" + Enter           ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              │ TERM:switch:2                     │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │  9. handleInput receives Ctrl+U, enters command mode        ││
│  │ 10. Accumulates "TERM:switch:2\n"                           ││
│  │ 11. executeTerminalCommand('TERM:switch:2')                 ││
│  │ 12. switchToTerminal(session, 0, 2, ...)                    ││
│  │ 13. updateTerminalBar(session) - sends new RENDER           ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Create Terminal Flow

### In SidebarApp

```
createTerminal(): void
State changes: session.terminals[], pane layout

└─ Get active session
└─ If no session: return
│
├─ First terminal (session.terminals.length === 0):
│   └─ { barPaneId, terminalPaneId } = createFirstTerminalLayout(...)
│   └─ session.terminalBarPaneId = barPaneId
│   └─ Add terminal to session.terminals
│   └─ startTerminalBarHandler(barPaneId, sidebarPaneId, sessionId)
│   └─ selectPane(terminalPaneId)
│
└─ Additional terminal:
    └─ currentTerminalPaneId = session.terminals[activeIndex].paneId
    └─ newPaneId = createAdditionalTerminal(...)
    └─ Add terminal to session.terminals
    └─ session.activeTerminalIndex = session.terminals.length - 1
    └─ updateTerminalBar(session)
    └─ selectPane(newPaneId)
```

---

## Terminal Commands Handled by Sidebar

```
executeTerminalCommand(command: string): void
Parameters: command (e.g., "TERM:switch:2")

└─ Parse: action, data = command.split(':').slice(1)
│
├─ action === 'switch':
│   └─ switchToTerminal(session, currentIndex, parseInt(data), ...)
│   └─ updateTerminalBar(session)
│
├─ action === 'new':
│   └─ createTerminal()
│
├─ action === 'delete':
│   └─ deleteTerminal(session, parseInt(data))
│
├─ action === 'focus':
│   └─ selectPane(session.terminals[activeIndex].paneId)
│
└─ action === 'escape':
    └─ selectPane(sidebarPaneId)
```

---

## When to Update This Document

Update this document when:
- Changing terminal bar communication protocol
- Modifying terminal creation/deletion logic
- Adding new bar handler commands
- Changing bar rendering

After updating:
1. Update code flows with new function signatures
2. Update protocol documentation
3. Update "Last Updated" timestamp

---
**Last Updated:** 2025-01-18
**Files Covered:** `src/terminal/bar-handler.ts`, `src/terminal/bar-render.ts`, `src/sidebar/terminal-manager.ts`
