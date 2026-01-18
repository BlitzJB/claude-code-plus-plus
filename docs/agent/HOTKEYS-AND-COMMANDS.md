# Hotkeys and Commands

This document covers the keyboard input system and command routing.

## Files Covered
- `src/sidebar/commands.ts` - Command definitions and routing
- `src/sidebar/input.ts` - Key parsing

---

## Overview

The hotkey system:
- Parses raw keyboard input into structured KeyEvent objects
- Routes keys to commands via pattern matching
- Supports Ctrl, Alt, and Shift modifiers
- Handles both main view and modal-specific inputs

---

## Key Parsing (`src/sidebar/input.ts`)

### KeyEvent Structure

```typescript
interface KeyEvent {
  key: string;    // Key identifier ('a', 'enter', 'up', etc.)
  ctrl: boolean;  // Ctrl modifier
  alt: boolean;   // Alt/Meta modifier
  shift: boolean; // Shift modifier
  raw: Buffer;    // Original input bytes
}
```

### parseKey Function

```
parseKey(data: Buffer): KeyEvent
Parameters: data (raw input bytes)
Returns: Parsed KeyEvent

Parsing Rules:

1. Single Byte (0x00-0x7F):
   └─ 0x1b (27): key = 'escape'
   └─ 0x0d (13): key = 'enter'
   └─ 0x7f (127): key = 'backspace'
   └─ 0x09 (9): key = 'tab'
   └─ 0x01-0x1a (1-26): ctrl = true, key = chr(byte + 96)
      └─ Example: 0x03 → Ctrl+C (key = 'c')
   └─ 0x20-0x7e (32-126): key = char
      └─ If uppercase: shift = true

2. Escape Sequences (\x1b[...):
   └─ \x1b[A: key = 'up'
   └─ \x1b[B: key = 'down'
   └─ \x1b[C: key = 'right'
   └─ \x1b[D: key = 'left'
   └─ \x1b[H: key = 'home'
   └─ \x1b[F: key = 'end'
   └─ \x1b[5~: key = 'pageup'
   └─ \x1b[6~: key = 'pagedown'
   └─ \x1b[3~: key = 'delete'
   └─ \x1b[Z: key = 'tab', shift = true (Shift+Tab)

3. Alt Sequences (\x1b + char):
   └─ alt = true, key = char
   └─ Example: \x1bx → Alt+X
```

---

## Command System (`src/sidebar/commands.ts`)

### Command Structure

```typescript
interface KeyCombo {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
}

interface Command {
  keys: KeyCombo[];           // Key combinations that trigger this command
  handler: (ctx: CommandContext) => void;
}

interface CommandContext {
  state: SidebarState;
  actions: CommandActions;
}

interface CommandActions {
  moveUp: () => void;
  moveDown: () => void;
  activateSelected: () => void;
  showQuitModal: () => void;
  showDeleteModal: () => void;
  showNewWorktreeModal: () => void;
  showRenameModal: () => void;
  toggleCollapsed: () => void;
  createTerminal: () => void;
  render: () => void;
}
```

### MAIN_COMMANDS

```typescript
const MAIN_COMMANDS: Command[] = [
  // Quit
  { keys: [{ key: 'c', ctrl: true }, { key: 'q', ctrl: true }],
    handler: (ctx) => ctx.actions.showQuitModal() },

  // Toggle collapse
  { keys: [{ key: 'g', ctrl: true }],
    handler: (ctx) => ctx.actions.toggleCollapsed() },

  // Create terminal
  { keys: [{ key: 't', ctrl: true }],
    handler: (ctx) => ctx.actions.createTerminal() },

  // Navigation
  { keys: [{ key: 'up' }, { key: 'k' }],
    handler: (ctx) => ctx.actions.moveUp() },

  { keys: [{ key: 'down' }, { key: 'j' }],
    handler: (ctx) => ctx.actions.moveDown() },

  // Activate selected
  { keys: [{ key: 'enter' }],
    handler: (ctx) => ctx.actions.activateSelected() },

  // New worktree
  { keys: [{ key: 'n' }],
    handler: (ctx) => ctx.actions.showNewWorktreeModal() },

  // Delete
  { keys: [{ key: 'd' }],
    handler: (ctx) => ctx.actions.showDeleteModal() },

  // Rename
  { keys: [{ key: 'r' }],
    handler: (ctx) => ctx.actions.showRenameModal() },
];
```

### matchesKey

```
matchesKey(key: KeyEvent, combo: KeyCombo): boolean
Parameters: parsed key, key combo pattern
Returns: true if key matches pattern

└─ Check key name matches (case-insensitive)
└─ Check ctrl flag matches (default false)
└─ Check alt flag matches (default false)
└─ Return true only if all match
```

### executeCommand

```
executeCommand(commands: Command[], key: KeyEvent, context: CommandContext): boolean
Parameters: command array, parsed key, context
Returns: true if command was executed

└─ For each command:
│   └─ For each key combo in command.keys:
│       └─ If matchesKey(key, combo):
│           └─ command.handler(context)
│           └─ Return true
│
└─ Return false (no match)
```

---

## Hotkey Reference

### Main View Hotkeys

| Key | Action | Handler |
|-----|--------|---------|
| `Ctrl+Q` | Show quit modal | `showQuitModal()` |
| `Ctrl+C` | Show quit modal | `showQuitModal()` |
| `Ctrl+G` | Toggle collapse | `toggleCollapsed()` |
| `Ctrl+T` | Create terminal | `createTerminal()` |
| `↑` / `k` | Move selection up | `moveUp()` |
| `↓` / `j` | Move selection down | `moveDown()` |
| `Enter` | Activate selected | `activateSelected()` |
| `n` | New worktree modal | `showNewWorktreeModal()` |
| `d` | Delete modal | `showDeleteModal()` |
| `r` | Rename modal | `showRenameModal()` |

### Quit Modal Hotkeys

| Key | Action |
|-----|--------|
| `Escape` | Cancel, return to main |
| `↑` / `↓` / `j` / `k` | Toggle selection |
| `Enter` / `y` | Confirm selected action |
| `n` | Cancel |

### Delete Modal Hotkeys

| Key | Action |
|-----|--------|
| `Escape` / `n` | Cancel, keep item |
| `↑` / `↓` / `j` / `k` | Toggle selection |
| `Enter` / `y` | Confirm selected action |

### Text Input Modal Hotkeys

| Key | Action |
|-----|--------|
| `Escape` | Cancel input |
| `Enter` | Confirm input |
| `Backspace` | Delete last character |
| Printable chars | Add to input buffer |

### Terminal Bar Hotkeys

| Key | Action |
|-----|--------|
| `1-9` | Switch to terminal N |
| `Tab` | Next terminal |
| `Shift+Tab` | Previous terminal |
| `h` / `←` | Previous terminal |
| `l` / `→` | Next terminal |
| `n` / `c` | New terminal |
| `d` | Delete current terminal |
| `Enter` | Focus terminal pane |
| `Escape` | Focus sidebar |

---

## Adding New Hotkeys

### Step 1: Add Command Definition

```typescript
// In src/sidebar/commands.ts

const MAIN_COMMANDS: Command[] = [
  // ... existing commands ...

  // New command
  { keys: [{ key: 'x', ctrl: true }],
    handler: (ctx) => ctx.actions.myNewAction() },
];
```

### Step 2: Add Action Handler

```typescript
// In src/sidebar/app.ts, inside handleMainInput:

const actions: CommandActions = {
  // ... existing actions ...
  myNewAction: () => this.myNewAction(),
};
```

### Step 3: Implement Action

```typescript
// In src/sidebar/app.ts

private myNewAction(): void {
  // Implementation
  this.render();
}
```

### Step 4: Update CommandActions Type

```typescript
// In src/sidebar/commands.ts

interface CommandActions {
  // ... existing actions ...
  myNewAction: () => void;
}
```

### Step 5: Update Documentation

Add the new hotkey to:
1. This document (HOTKEYS-AND-COMMANDS.md)
2. Sidebar help text if user-visible

---

## Key Combo Formatting

### formatKeyCombo

```
formatKeyCombo(combo: KeyCombo): string
Parameters: key combo
Returns: Display string

└─ If ctrl: "^" + key.toUpperCase()  // ^Q
└─ If alt: "M-" + key.toUpperCase()  // M-X
└─ Else: key                          // n, Enter
```

---

## Input Flow

```
Raw Input (Buffer)
        │
        ▼
parseKey(data)
        │
        ▼
KeyEvent { key, ctrl, alt, shift }
        │
        ├─────────────────────────────────────────┐
        │ Main view                               │ Modal view
        ▼                                         ▼
executeCommand(MAIN_COMMANDS, key, ctx)   handleXxxModalInput(key)
        │                                         │
        ├─ Match found?                           └─ Direct key handling
        │   └─ Yes: handler(ctx)
        │   └─ No: ignore
        │
        ▼
State Mutation
        │
        ▼
render()
```

---

## When to Update This Document

Update this document when:
- Adding new hotkeys
- Changing existing key bindings
- Modifying command routing logic
- Adding new modal input handling

After updating:
1. Update hotkey reference tables
2. Update "Adding New Hotkeys" guide if process changes
3. Update "Last Updated" timestamp

---
**Last Updated:** 2025-01-18
**Files Covered:** `src/sidebar/commands.ts`, `src/sidebar/input.ts`
