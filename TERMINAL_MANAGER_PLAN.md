# Terminal Manager Implementation Plan

## Current Architecture
- Sessions have: `mainPaneId`, `terminalPaneIds[]`
- All terminals visible (stacked vertically)
- Session switching breaks/joins ALL panes

## New Architecture

### Layout
```
┌─────────┬────────────────────────────────┐
│         │  Claude pane (mainPaneId)      │
│ Sidebar ├────────────────────────────────┤
│         │ [T1] [T2] [T3]  (termMgrPane)  │  <- 3 rows, terminal tabs
│         ├────────────────────────────────┤
│         │  Active terminal only          │  <- Only ONE terminal visible
└─────────┴────────────────────────────────┘
```

### Session Structure Changes
```typescript
interface TerminalInfo {
  id: string;      // tmux pane ID
  title: string;   // Display name (e.g., "Terminal 1")
}

interface Session {
  id: string;
  worktreeId: string;
  mainPaneId: string;
  // Terminal management (NEW)
  terminalManagerPaneId: string | null;
  terminals: TerminalInfo[];
  activeTerminalIndex: number;
  title: string;
}
```

### Terminal Manager Process (`terminal-manager.ts`)
- Runs in small pane (3 rows)
- Receives state via file: `/tmp/claude-pp-term-{sessionId}.json`
- Renders horizontal tabs with active highlighting
- Keyboard handling:
  - ←/→: Switch tabs (swaps terminal panes)
  - Enter: Focus the active terminal pane
  - d: Delete current terminal
  - Ctrl+C: Do nothing (prevent accidental quit)

### State File Format (`/tmp/claude-pp-term-{sessionId}.json`)
```json
{
  "sessionId": "session-123",
  "worktreePath": "/path/to/worktree",
  "tmuxSession": "cpp-project-abc123",
  "sidebarPaneId": "%0",
  "terminals": [
    {"id": "%5", "title": "Terminal 1"},
    {"id": "%7", "title": "Terminal 2"}
  ],
  "activeIndex": 0
}
```

## Flows

### Creating First Terminal (Ctrl+T)
1. Sidebar receives Ctrl+T
2. Split mainPaneId vertically (70/30) → bottom area
3. Split bottom area vertically (3 rows / rest) → termMgrPane + terminalPane
4. Start terminal-manager.ts in termMgrPane with args
5. Terminal pane auto-CDs to worktree path
6. Write state file
7. Update session state

### Creating Additional Terminals
1. Sidebar receives Ctrl+T (via tmux binding → send to sidebar)
2. Create new terminal pane (split from current terminal)
3. Break new pane to background immediately
4. Break current visible terminal to background
5. Join new terminal to visible slot
6. Update state file (add terminal, set activeIndex to new)
7. Terminal manager re-renders

### Switching Terminals (in terminal manager)
1. User presses ←/→ in terminal manager
2. Terminal manager calculates new activeIndex
3. Terminal manager executes pane swap:
   - `tmux break-pane -t currentTerminal`
   - `tmux join-pane -v -t termMgrPane newTerminal`
4. Terminal manager updates state file
5. Re-render tabs

### Switching Sessions (in sidebar)
1. Break current session panes (order matters):
   - Break non-active terminals (already in background - skip)
   - Break active terminal
   - Break terminal manager
   - Break mainPaneId
2. Join new session panes:
   - Join mainPaneId next to sidebar
   - If has terminals:
     - Join terminalManagerPaneId below mainPaneId
     - Join active terminal below terminal manager

### Deleting Terminal
1. User presses 'd' in terminal manager on a terminal
2. Kill the terminal pane
3. Update terminals array, adjust activeIndex
4. If terminals.length === 0:
   - Kill terminal manager pane
   - Clear terminalManagerPaneId in session
5. Else if deleted was active:
   - Switch to previous terminal (or next if first)
6. Update state file
7. Send update to sidebar (via special key)

## Implementation Order

1. **Create terminal-manager.ts** (new file)
   - ANSI rendering similar to sidebar
   - Tab display with active highlighting
   - State file reading
   - Arrow key handling for tab switching
   - Pane swap execution
   - Delete terminal handling

2. **Update types**
   - TerminalInfo interface
   - Update Session interface
   - Update PersistedSession

3. **Update sidebar.ts**
   - Rewrite createTerminalForSession
   - Update switchToSession for new terminal structure
   - Update deleteSelectedSession
   - Add state file writing
   - Handle terminal manager communication

4. **Update index.ts**
   - Pass terminal manager script path info

5. **Testing**
   - Single terminal creation
   - Multiple terminal creation
   - Tab switching
   - Session switching with terminals
   - Terminal deletion

## Communication Protocol

### Sidebar → Terminal Manager
- State file updates
- Terminal manager watches file or re-reads on focus

### Terminal Manager → Sidebar
- Special key sequence via `tmux send-keys -t sidebarPane`
- Commands:
  - `\x15T{index}` = Terminal switched to index (Ctrl+U + T + index)
  - `\x15D{index}` = Terminal deleted at index (Ctrl+U + D + index)
  - `\x15R` = Request state refresh (Ctrl+U + R)

Sidebar handles these in input handler with a special mode.
