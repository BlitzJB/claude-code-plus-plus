# Diff Pane System

This document covers the git diff viewer, file changes display, and diff rendering.

## Files Covered
- `src/diff/git-diff.ts` - Git diff operations
- `src/diff/diff-pane-render.ts` - Diff pane rendering (file list)
- `src/diff/diff-handler.ts` - Diff pane handler process
- `src/diff/file-diff-header-render.ts` - File diff header rendering (1-row)
- `src/diff/file-diff-header-handler.ts` - File diff header handler process
- `src/diff/diff-manager.ts` - Pane management
- `src/diff/index.ts` - Module exports

---

## Overview

The diff pane system provides:
- A right sidebar showing changed files (diff pane)
- Inline diff viewing for individual files (in separate panes)
- Auto-refresh when files change
- Integration with session lifecycle

---

## Architecture

```
NORMAL MODE:
┌─────────────┬────────────────────────────┬─────────────────┐
│   Sidebar   │       Claude Pane          │   Diff Pane     │
│  (25 cols)  │      (Claude CLI)          │   (30 cols)     │
│             │                            │                 │
│  Worktrees  │                            │  Changed Files: │
│  Sessions   │     Agent conversation     │  M file1.ts +22 │
│             │                            │  A file2.ts +45 │
│             │                            │  D old.ts   -30 │
└─────────────┴────────────────────────────┴─────────────────┘

FILE DIFF MODE (after pressing Enter on a file):
┌─────────────┬────────────────────────────┬─────────────────┐
│   Sidebar   │ ← Back to Claude [Esc] │ f │   Diff Pane     │
│  (25 cols)  │             [Diffs] [Full] │   (30 cols)     │
│             ├────────────────────────────┤                 │
│  Worktrees  │  Full file content with    │  Changed Files: │
│  Sessions   │  inline diffs (colored)    │ >M file1.ts +22 │
│             │  Uses native tmux scroll   │  A file2.ts +45 │
│             │                            │                 │
└─────────────┴────────────────────────────┴─────────────────┘
```

**View Mode Toggle:**
- `[Diffs]` button: Shows only diff hunks (compact view)
- `[Full]` button: Shows complete file with inline diffs (default)
- Selected button shown in inverse, unselected in dim
- Mode persists per-session across file switches

**Key differences in File Diff Mode:**
- Sidebar remains visible and unchanged
- Claude pane is broken to background (process preserved)
- 1-row header pane at top: "← Back to Claude [Esc] │ filename.ts +N -N [Diffs] [Full]"
- Content pane streams colored diff content
- Native scrolling via tmux scrollback
- When clicking another file: replaces view instead of creating new panes
- When closing: kill header + content panes, join Claude pane back

---

## Communication Protocol

### Sidebar → Diff Handler

```
RENDER:<json>
```

JSON structure:
```typescript
{
  files: DiffFileSummary[]
}
```

### Diff Handler → Sidebar

```
DIFF:<action>:<data>
```

Actions:
- `DIFF:close` - Close the diff pane
- `DIFF:viewfile:<filename>` - View diff for specified file
- `DIFF:refresh` - Refresh the diff data

### File Diff Header → Sidebar

```
FILEDIFF:<action>
```

Actions:
- `FILEDIFF:close` - Close the file diff view
- `FILEDIFF:mode:diffs-only` - Switch to diffs-only view mode
- `FILEDIFF:mode:whole-file` - Switch to whole-file view mode

---

## Git Diff Operations (`src/diff/git-diff.ts`)

### Types

```typescript
type ChangeType = 'M' | 'A' | 'D' | 'R' | 'C' | 'U';

interface DiffFileSummary {
  file: string;
  changeType: ChangeType;
  insertions: number;
  deletions: number;
  binary: boolean;
  oldFile?: string;  // For renames
}
```

**Note:** Untracked files are shown as `A` (added) with their line count, not `?`.

### getDiffSummary

```
getDiffSummary(repoPath: string): Promise<DiffFileSummary[]>
Parameters: repoPath (repository path)
Returns: Array of changed files

└─ Get git status via simple-git
└─ Process modified, created, deleted, renamed files
└─ For each file, get insertion/deletion stats via git diff --numstat
└─ For untracked files, count lines and show as 'A' (added)
└─ Return summary array
```

### getFileDiff

```
getFileDiff(repoPath: string, filename: string): Promise<string>
Parameters: repoPath, filename
Returns: Full diff content as string

└─ Try git diff HEAD -- filename
└─ If empty, try git diff --cached
└─ If still empty (untracked), use git diff --no-index /dev/null filename
└─ Return diff content
```

### getFileWithInlineDiff

```
getFileWithInlineDiff(repoPath: string, filename: string): Promise<string>
Parameters: repoPath, filename
Returns: Colored diff output for display (no filename header - shown in header pane)

└─ Get git status to check if file is new/untracked
└─ If new/untracked:
│   └─ Read file content
│   └─ Show all lines as added (green +line format, no header)
│
└─ If modified:
│   └─ Get diff from git
│   └─ Parse and colorize:
│       └─ +++ / ---: Bold white
│       └─ @@: Cyan
│       └─ +: Green
│       └─ -: Red
│       └─ diff/index: Dim
│
└─ Return colored output
```

### getDiffsOnlyView

```
getDiffsOnlyView(repoPath: string, filename: string): Promise<string>
Parameters: repoPath, filename
Returns: Colored compact diff view (hunks only)

└─ Get git status to check if file is new/untracked
└─ If new/untracked:
│   └─ Read file content
│   └─ Create synthetic hunk header: "@@ -0,0 +1,N @@"
│   └─ Show all lines as added (green)
│
└─ If modified:
│   └─ Get diff from git
│   └─ Skip file header lines (diff, index, ---, +++)
│   └─ Colorize hunks:
│       └─ @@: Cyan
│       └─ +: Green
│       └─ -: Red
│       └─ context: Normal
│
└─ Return colored output
```

### watchForChanges

```
watchForChanges(repoPath: string, callback: () => void): () => void
Parameters: repoPath, callback function
Returns: Cleanup function

└─ Watch .git directory for index/HEAD changes
└─ Watch working directory for file changes
└─ Debounce with 500ms delay
└─ Call callback on changes
└─ Return function to stop watching
```

---

## Diff Pane Rendering (`src/diff/diff-pane-render.ts`)

### renderDiffPane

```
renderDiffPane(files, selectedIndex, width, height): { output: string; filePositions: FilePosition[] }
Parameters: files, selectedIndex, dimensions
Returns: ANSI output and click positions

└─ Render header: "Changed Files"
└─ For each visible file:
│   └─ Change type with color (M=yellow, A=green, D=red, R=magenta)
│   └─ Display name (filename only - always basename, never directory)
│   └─ Stats (+N -N) right-aligned in green/red (calculated dynamically)
│   └─ Apply inverse highlight to entire row when selected
│   └─ Track row positions for click handling
└─ Render scroll indicator if needed
└─ Render footer: "↵ view  q close"
```

**Width calculation:** Stats width is calculated first, then remaining space is given to filename to maximize use of available width.

**Display format (no pointer column):**
```
M file.ts         +22 -10   (selected: inverse entire row)
A new.ts          +45       (unselected: normal)
D old.ts              -30
```

Change type colors:
- `M` (Modified): Yellow
- `A` (Added): Green
- `D` (Deleted): Red
- `R` (Renamed): Magenta

---

## Diff Handler (`src/diff/diff-handler.ts`)

The diff handler is a separate process that runs in the diff pane.

### State

```typescript
interface DiffPaneState {
  sidebarPaneId: string;
  sessionId: string;
  worktreePath: string;
  files: DiffFileSummary[];
  selectedIndex: number;
  filePositions: FilePosition[];
}
```

### Input Handling

```
handleInput(data: Buffer): void

└─ If RENDER: command:
│   └─ Parse JSON, update files array
│   └─ Re-render
│
└─ If mouse event:
│   └─ Parse SGR mouse sequence
│   └─ On left click release: handle click
│
└─ If keyboard:
    └─ ↑/k: Move selection up
    └─ ↓/j: Move selection down
    └─ g: Go to top
    └─ G: Go to bottom
    └─ Enter: Send DIFF:viewfile to sidebar
    └─ Escape/q: Send DIFF:close to sidebar
    └─ r: Send DIFF:refresh to sidebar
```

---

## File Diff Header (`src/diff/file-diff-header-handler.ts`)

The file diff header handler is a separate process that runs in the 1-row header pane.

### State

```typescript
interface HeaderState {
  sidebarPaneId: string;
  filename: string;
  insertions: number;
  deletions: number;
  mode: DiffViewMode;
  buttonPositions: ButtonPositions;  // { diffsOnly: [start, end], wholeFile: [start, end] }
}
```

### Rendering

```
← Back to Claude [Esc] │ file.ts  +22 -10                    [Diffs] [Full]
```

- `[Diffs]` / `[Full]` buttons are right-aligned
- Selected mode shown in inverse, unselected in dim
- Button positions are tracked for click handling

### Input Handling

```
handleInput(data: Buffer): void

└─ If RENDER: command:
│   └─ Parse JSON, update state (including mode)
│   └─ Re-render
│
└─ If mouse event:
│   └─ Click on "← Back" area (col <= 10): Send FILEDIFF:close
│   └─ Click on [Diffs] button: Send FILEDIFF:mode:diffs-only
│   └─ Click on [Full] button: Send FILEDIFF:mode:whole-file
│
└─ If keyboard:
    └─ Escape/Enter/q/Backspace: Send FILEDIFF:close to sidebar
```

---

## Diff Manager (`src/diff/diff-manager.ts`)

### createDiffPane

```
createDiffPane(sessionName, claudePaneId): string
Parameters: sessionName, claudePaneId
Returns: New diff pane ID

└─ Select Claude pane
└─ Split horizontally (create pane to right)
└─ Resize to DIFF_PANE_WIDTH (30 cols)
└─ Return new pane ID
```

### createFileDiffContentPane

```
createFileDiffContentPane(sessionName, sidebarPaneId): string
Parameters: sessionName, sidebarPaneId
Returns: Content pane ID

└─ Select sidebar pane
└─ Split horizontally (create pane to right, fills Claude space)
└─ Return new pane ID
```

### createFileDiffHeaderPane

```
createFileDiffHeaderPane(sessionName, contentPaneId): string
Parameters: sessionName, contentPaneId
Returns: Header pane ID

└─ Select content pane
└─ Split vertically (create header above)
└─ Swap panes so header is at top
└─ Resize header to 1 row
└─ Return header pane ID
```

### startFileDiffHeaderHandler

```
startFileDiffHeaderHandler(headerPaneId, sidebarPaneId, filename, insertions, deletions, mode): void
Parameters: pane IDs, filename, stats, view mode
Defaults: mode = 'whole-file'

└─ Determine handler path (tsx for dev, node for compiled)
└─ Send command to header pane with mode argument
```

### startFileDiffContentHandler

```
startFileDiffContentHandler(contentPaneId, sidebarPaneId, repoPath, filename, mode): void
Parameters: pane IDs, repoPath, filename, view mode
Defaults: mode = 'whole-file'

└─ Determine handler path (tsx for dev, node for compiled)
└─ Use respawnPane to run handler with mode argument
```

### Other Operations

- `startDiffHandler` - Start diff handler in diff pane
- `updateDiffPane` - Send RENDER: command to diff pane
- `closeDiffPane` - Kill diff pane
- `breakDiffPane` - Break diff pane to background
- `joinDiffPane` - Join diff pane back
- `closeFileDiffHeaderPane` - Kill header pane
- `closeFileDiffContentPane` - Kill content pane

---

## Integration with SidebarApp

### toggleDiffPane (in SidebarApp)

```
toggleDiffPane(): Promise<void>

└─ Get active session
└─ If session has diff pane:
│   └─ Close diff pane
└─ Else:
    └─ Open diff pane
```

### showFileDiff (New Architecture)

```
showFileDiff(filename, session): Promise<void>

└─ Get colored content via getFileWithInlineDiff()
└─ Get stats via getDiffSummary()
└─ Write colored content to temp file
│
└─ IF already in file diff mode (replacing view):
│   └─ Kill existing header + content panes
│   └─ Create new content pane
│   └─ Create new header pane
│   └─ Start header handler with new file info
│   └─ Run `cat <tempfile> && read` in content pane
│   └─ Update filename state
│   └─ Return (don't break/join Claude pane again)
│
└─ ELSE (first time opening):
│   └─ Break Claude pane to background
│   └─ Break terminals if any
│   └─ Break diff pane if exists
│   │
│   └─ Create content pane (fills Claude space)
│   └─ Create header pane (1-row above content)
│   └─ Start header handler
│   └─ Run `cat <tempfile> && read` in content pane
│   │
│   └─ Update session state:
│       └─ fileDiffHeaderPaneId = headerPaneId
│       └─ fileDiffContentPaneId = contentPaneId
│   └─ Set fileDiffMode = true
│   └─ Focus content pane (for scrolling via tmux copy-mode)
```

### hideFileDiff (New Architecture)

```
hideFileDiff(): void

└─ Kill header pane
└─ Kill content pane
│
└─ Join Claude pane back
└─ Join diff pane if exists
└─ Join terminals if any
│
└─ Clear session state:
    └─ fileDiffHeaderPaneId = null
    └─ fileDiffContentPaneId = null
└─ Set fileDiffMode = false
└─ Focus sidebar
```

### executeFileDiffCommand

```
executeFileDiffCommand(command: string): void

└─ Parse "FILEDIFF:<action>" format
└─ Switch on action:
    └─ close: hideFileDiff()
    └─ mode:diffs-only: setDiffViewMode('diffs-only')
    └─ mode:whole-file: setDiffViewMode('whole-file')
```

### setDiffViewMode

```
setDiffViewMode(mode: DiffViewMode): Promise<void>

└─ Get active session
└─ If not in file diff mode or mode unchanged, return
└─ Update session.diffViewMode
└─ Get file stats for header
└─ Break diff pane (if exists)
└─ Kill existing header + content panes
└─ Create new content pane
└─ Rejoin diff pane (if existed)
└─ Create new header pane
└─ Start handlers with new mode
└─ Focus content pane
```

---

## Session Lifecycle

### Session Creation
```typescript
{
  // ... other fields
  diffPaneId: null,
  diffPaneManuallyHidden: false,
  diffViewMode: 'whole-file',
  fileDiffHeaderPaneId: null,
  fileDiffContentPaneId: null,
}
```

### Session Switch (A → B)
1. Clean up file watcher for session A
2. Break session A's diff pane
3. Join session B's diff pane (if exists)
4. Set up file watcher for session B (if diff pane exists)

### Session Deletion
1. Clean up file watcher if active session
2. Kill file diff panes if in file diff mode
3. Kill diff pane
4. Kill other panes (terminals, Claude)
5. If switching to another session, handle its diff pane

### File Diff Mode
When in file diff mode:
- Sidebar remains visible and renders normally
- Claude pane is broken to background
- Header pane shows "← Back to Claude [Esc] │ filename +N -N [Diffs] [Full]"
- Content pane shows file diff based on current view mode
- **View Mode Toggle:**
  - Click `[Diffs]` button: switch to diffs-only view (compact)
  - Click `[Full]` button: switch to whole-file view (default)
  - Mode persists per-session when switching files
- Native scrolling via tmux scrollback
- Clicking another file replaces current view (no new panes created)
- Escape or clicking "Back" closes file diff view
- On close: kill header + content panes, join Claude pane back

---

## Hotkeys

### Diff Pane (Right Sidebar)
| Key | Action |
|-----|--------|
| `↑` / `k` | Move selection up |
| `↓` / `j` | Move selection down |
| `g` | Go to top |
| `G` | Go to bottom |
| `Enter` | View file diff |
| `r` | Refresh |
| `Escape` / `q` | Close |

### File Diff View (Content Pane - Native tmux Copy-Mode)
| Key | Action |
|-----|--------|
| `Ctrl+B [` | Enter copy-mode for scrolling |

**In copy-mode:**
| Key | Action |
|-----|--------|
| `↑` / `k` | Scroll up |
| `↓` / `j` | Scroll down |
| `g` | Go to top |
| `G` | Go to bottom |
| `Ctrl+U` | Page up |
| `Ctrl+D` | Page down |
| `/` | Search forward |
| `?` | Search backward |
| `q` | Exit copy-mode |

### File Diff Header (1-row)
| Key | Action |
|-----|--------|
| `Escape` / `Enter` / `q` | Return to Claude |
| Click "← Back" | Return to Claude |
| Click `[Diffs]` | Switch to diffs-only view |
| Click `[Full]` | Switch to whole-file view |

---

## When to Update This Document

Update this document when:
- Changing diff pane layout
- Modifying communication protocol
- Adding new diff operations
- Changing file diff view architecture
- Adding new hotkeys

After updating:
1. Update code flows
2. Update protocol documentation
3. Update "Last Updated" timestamp

---
**Last Updated:** 2026-01-18
**Files Covered:** `src/diff/*.ts`
