# Tmux Integration

This document covers the tmux abstraction layer used for pane management.

## Files Covered
- `src/tmux/commands.ts` - Low-level tmux execution
- `src/tmux/pane.ts` - High-level pane operations

---

## Overview

Claude++ uses tmux for:
- Session management (create, attach, detach, kill)
- Pane operations (split, resize, break, join)
- Inter-process communication (send-keys)
- Hooks (after-resize-pane)

---

## Low-Level Commands (`src/tmux/commands.ts`)

### exec

```
exec(args: string[], options?: { silent?: boolean }): string
Parameters: args (string[]), options.silent (boolean)
Returns: Command output (trimmed string)

└─ Construct command: `tmux ${args.join(' ')}`
└─ Execute with execSync
└─ Return trimmed stdout
```

### run

```
run(args: string[]): void
Parameters: args (string[])
State changes: None
Returns: void

└─ Execute tmux command
└─ Ignore errors (silent failure)
```

### check

```
check(args: string[]): boolean
Parameters: args (string[])
Returns: true if command succeeds, false otherwise

└─ Try exec(args, { silent: true })
└─ Return true on success
└─ Catch error, return false
```

### isAvailable

```
isAvailable(): boolean
Returns: true if tmux is in PATH

└─ Try exec(['ls-sessions'])
└─ Return true on success
└─ Catch error, return false
```

---

## High-Level Pane Operations (`src/tmux/pane.ts`)

### Session Operations

#### sessionExists

```
sessionExists(name: string): boolean
Parameters: name (session name)
Returns: true if session exists

└─ check(['has-session', '-t', name])
```

#### createSession

```
createSession(name: string, cwd: string): string
Parameters: name (session name), cwd (working directory)
Returns: Main pane ID

└─ exec(['new-session', '-d', '-s', name, '-c', cwd, '-P', '-F', '#{pane_id}'])
└─ Return pane ID from output
```

#### killSession

```
killSession(name: string): void
Parameters: name (session name)
State changes: Terminates entire session

└─ run(['kill-session', '-t', name])
```

#### detachClient

```
detachClient(): void
State changes: Detaches current client

└─ run(['detach-client'])
```

### Pane Splitting

#### splitHorizontal

```
splitHorizontal(sessionName: string, percentage: number, cwd?: string): string
Parameters: sessionName, percentage (left pane width), cwd (optional)
Returns: New pane ID (right pane)

└─ Build args: ['split-window', '-h', '-t', sessionName, '-p', 100-percentage]
   └─ -h = horizontal split
   └─ -p = percentage for NEW pane (so 100-percentage gives left pane the requested %)
└─ If cwd provided: add ['-c', cwd]
└─ Add ['-P', '-F', '#{pane_id}']
└─ exec(args)
└─ Return new pane ID
```

#### splitVertical

```
splitVertical(sessionName: string, percentage: number, cwd?: string): string
Parameters: sessionName, percentage (top pane height), cwd (optional)
Returns: New pane ID (bottom pane)

└─ Build args: ['split-window', '-v', '-t', sessionName, '-p', 100-percentage]
   └─ -v = vertical split
└─ If cwd provided: add ['-c', cwd]
└─ Add ['-P', '-F', '#{pane_id}']
└─ exec(args)
└─ Return new pane ID
```

### Pane Information

#### listPanes

```
listPanes(sessionName: string): TmuxPane[]
Parameters: sessionName
Returns: Array of pane info

└─ exec(['list-panes', '-t', sessionName, '-F', '#{pane_id}:#{pane_width}:#{pane_height}:#{pane_active}'])
└─ Parse each line: id:width:height:active
└─ Return array of { id, width, height, active: boolean }
```

#### getPaneDimensions

```
getPaneDimensions(paneId: string): { width: number; height: number }
Parameters: paneId
Returns: { width, height } or { 80, 24 } fallback

└─ Try exec(['display-message', '-t', paneId, '-p', '#{pane_width}:#{pane_height}'])
└─ Parse "width:height"
└─ Return dimensions
└─ On error: return { width: 80, height: 24 }
```

### Pane Communication

#### sendKeys

```
sendKeys(paneId: string, text: string, enter?: boolean): void
Parameters: paneId, text, enter (default false)
State changes: Sends text to pane

└─ Escape quotes in text
└─ exec(['send-keys', '-t', paneId, '-l', text])
   └─ -l = literal (don't interpret keys)
└─ If enter: sendControlKey(paneId, 'Enter')
```

#### sendControlKey

```
sendControlKey(paneId: string, key: string): void
Parameters: paneId, key (e.g., 'C-c', 'Enter', 'Escape')
State changes: Sends key to pane

└─ exec(['send-keys', '-t', paneId, key])
```

#### runInPane

```
runInPane(paneId: string, command: string): void
Parameters: paneId, command
State changes: Runs command in pane

└─ sendKeys(paneId, command, true)
```

### Pane Layout

#### selectPane

```
selectPane(paneId: string): void
Parameters: paneId
State changes: Makes pane active

└─ run(['select-pane', '-t', paneId])
```

#### resizePane

```
resizePane(paneId: string, width?: number, height?: number): void
Parameters: paneId, width (optional), height (optional)
State changes: Resizes pane

└─ If width: exec(['resize-pane', '-t', paneId, '-x', width])
└─ If height: exec(['resize-pane', '-t', paneId, '-y', height])
```

#### killPane

```
killPane(paneId: string): void
Parameters: paneId
State changes: Terminates pane

└─ run(['kill-pane', '-t', paneId])
```

#### breakPane

```
breakPane(paneId: string, windowName?: string): void
Parameters: paneId, windowName (optional)
State changes: Detaches pane from layout

└─ Build args: ['break-pane', '-d', '-s', paneId]
   └─ -d = don't switch to new window
└─ If windowName: add ['-n', windowName]
└─ run(args)
```

**Note:** Broken panes exist but aren't visible in the main window.

#### joinPane

```
joinPane(sourcePaneId: string, targetPaneId: string, horizontal?: boolean): void
Parameters: sourcePaneId, targetPaneId, horizontal (default false)
State changes: Brings broken pane back into layout

└─ Build args: ['join-pane', '-s', sourcePaneId, '-t', targetPaneId]
└─ If horizontal: add '-h'
   └─ horizontal = true: join side-by-side
   └─ horizontal = false: join top-bottom (default)
└─ run(args)
```

### Hooks and Bindings

#### setHook

```
setHook(sessionName: string, hookName: string, command: string): void
Parameters: sessionName, hookName (e.g., 'after-resize-pane'), command
State changes: Sets session hook

└─ exec(['set-hook', '-t', sessionName, hookName, command])
```

#### removeHook

```
removeHook(sessionName: string, hookName: string): void
Parameters: sessionName, hookName
State changes: Removes session hook

└─ run(['set-hook', '-u', '-t', sessionName, hookName])
```

#### bindKey

```
bindKey(key: string, command: string): void
Parameters: key, command
State changes: Binds key in root table

└─ exec(['bind-key', '-T', 'root', key, command])
```

#### setOption

```
setOption(option: string, value: string, global?: boolean): void
Parameters: option, value, global (default false)
State changes: Sets tmux option

└─ If global: run(['set-option', '-g', option, value])
└─ Else: run(['set-option', option, value])
```

#### setPaneOption

```
setPaneOption(paneId: string, option: string, value: string): void
Parameters: paneId, option, value
State changes: Sets pane-specific option

└─ run(['set-option', '-t', paneId, '-p', option, value])
```

### Utility

#### runShell

```
runShell(command: string): void
Parameters: command
State changes: Runs shell command via tmux

└─ exec(['run-shell', command])
```

#### swapPanes

```
swapPanes(paneId1: string, paneId2: string): void
Parameters: paneId1, paneId2
State changes: Swaps two panes

└─ run(['swap-pane', '-s', paneId1, '-t', paneId2])
```

---

## Common Patterns

### Creating a Split Layout

```typescript
// Create session with initial pane
const mainPaneId = createSession('my-session', '/path/to/dir');

// Split horizontally (sidebar | main)
const rightPaneId = splitHorizontal('my-session', 25); // 25% for left

// Split right pane vertically (top for Claude, bottom for terminal)
const bottomPaneId = splitVertical('my-session', 70); // 70% for top
```

### Background Pane Management

```typescript
// Break pane to background
breakPane(paneId, 'hidden-terminals');

// Later: bring it back below another pane
joinPane(paneId, targetPaneId, false); // false = vertical (below)
```

### Communication Protocol

```typescript
// Send text to pane
sendKeys(paneId, 'echo hello');
sendControlKey(paneId, 'Enter');

// Or use runInPane
runInPane(paneId, 'echo hello');

// Send Ctrl+C
sendControlKey(paneId, 'C-c');
```

---

## When to Update This Document

Update this document when:
- Adding new tmux wrapper functions
- Changing tmux command arguments
- Modifying error handling behavior

After updating:
1. Document new functions with parameters and behavior
2. Update "Last Updated" timestamp

---
**Last Updated:** 2025-01-18
**Files Covered:** `src/tmux/commands.ts`, `src/tmux/pane.ts`
