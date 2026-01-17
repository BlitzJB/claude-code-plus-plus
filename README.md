# Claude Code++

A multi-pane terminal interface for running parallel Claude Code agents with git worktree isolation.

![Claude Code++ Screenshot](assets/screenshot.png)

## Features

- **Multi-session management**: Run multiple Claude Code sessions simultaneously
- **Git worktree isolation**: Each session can operate in its own git worktree
- **Terminal manager**: Create and manage terminal panes within each session
- **tmux-based**: Leverages tmux for robust pane management and session persistence
- **Keyboard-driven**: Full keyboard navigation with mouse support

## Installation

```bash
npm install -g claude-code-plus-plus
```

## Requirements

- Node.js >= 18.0.0
- tmux installed and available in PATH
- Claude Code CLI (`claude`) installed

## Usage

Run in any git repository:

```bash
claude++
```

Or use the shorter alias:

```bash
ccp
```

## Keyboard Shortcuts

### Sidebar Navigation
| Key | Action |
|-----|--------|
| `↑`/`k` | Move selection up |
| `↓`/`j` | Move selection down |
| `Enter` | Create session / Switch to session |
| `n` | New worktree |
| `d` | Delete session/worktree |
| `r` | Rename |
| `Ctrl+T` | New terminal in current session |
| `Ctrl+G` | Toggle sidebar |
| `Ctrl+C` | Quit menu |

### Terminal Manager
| Key | Action |
|-----|--------|
| `1-9` | Switch to terminal tab |
| Click | Switch to clicked tab |
| `n` | New terminal |
| `d` | Delete current terminal |

## How It Works

Claude Code++ creates a tmux session with:
- A sidebar for managing worktrees and sessions
- A main area for Claude Code and terminal panes

Each Claude session is associated with a git worktree, allowing you to work on multiple branches simultaneously with isolated Claude Code agents.

## License

MIT
