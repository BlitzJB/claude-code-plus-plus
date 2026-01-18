# Worktree Management

This document covers git worktree operations.

## Files Covered
- `src/git/worktree.ts` - WorktreeManager class

---

## Overview

Git worktrees provide isolated working directories for different branches. Claude++ uses worktrees to:
- Isolate Claude sessions by branch/feature
- Allow multiple Claude instances working on different branches
- Provide separate terminal environments per worktree

---

## WorktreeManager Class (`src/git/worktree.ts`)

### Constructor

```
constructor(repoPath: string, basePath?: string)
Parameters: repoPath (git repo path), basePath (worktree storage, default ~/.claude-worktrees)
State: Initializes SimpleGit instance

└─ this.repoPath = repoPath
└─ this.basePath = basePath || path.join(os.homedir(), '.claude-worktrees')
└─ this.git = simpleGit(repoPath)
```

### isGitRepo

```
async isGitRepo(): Promise<boolean>
Returns: true if repoPath is a git repository

└─ Try: await this.git.status()
└─ Return true on success
└─ Catch: return false
```

### list

```
async list(): Promise<Worktree[]>
Returns: Array of all worktrees (including main repo)

└─ Run: git worktree list --porcelain
│
└─ Parse output (multi-line blocks):
│   worktree /path/to/worktree
│   HEAD abc123...
│   branch refs/heads/feature-branch
│   (or "detached" if detached HEAD)
│
└─ For each worktree:
│   └─ Create Worktree object:
│       {
│         id: path-based hash or 'main',
│         path: worktree path,
│         branch: branch name or 'detached',
│         isMain: true if path === repoPath
│       }
│
└─ Return array (main repo first)
```

**Note:** Returns empty array if not a git repo.

### create

```
async create(branch: string, newBranch?: boolean): Promise<Worktree>
Parameters: branch (name), newBranch (create new branch, default true)
Returns: Created Worktree
State changes: Creates worktree on filesystem

└─ ensureBaseDir()  // Create ~/.claude-worktrees if needed
│
└─ Sanitize branch name:
│   └─ Replace special chars with '-'
│   └─ safeBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '-')
│
└─ Build worktree path:
│   └─ repoName = path.basename(repoPath)
│   └─ worktreePath = path.join(basePath, `${repoName}-${safeBranch}`)
│
├─ If newBranch:
│   └─ Run: git worktree add -b {branch} {worktreePath}
│
└─ Else (existing branch):
    └─ Run: git worktree add {worktreePath} {branch}
│
└─ Return Worktree:
    {
      id: generateId(),
      path: worktreePath,
      branch: branch,
      isMain: false
    }
```

### remove

```
async remove(path: string, force?: boolean): Promise<void>
Parameters: path (worktree path), force (force removal, default false)
State changes: Removes worktree from filesystem

└─ Build args: ['worktree', 'remove', path]
└─ If force: args.push('--force')
│
└─ Try: await this.git.raw(args)
│
└─ Catch (if force):
│   └─ Manual cleanup:
│       └─ fs.rmSync(path, { recursive: true, force: true })
│       └─ await this.prune()
│
└─ Catch (if not force): rethrow
```

### prune

```
async prune(): Promise<void>
State changes: Cleans up stale worktree references

└─ Run: git worktree prune
```

### listBranches

```
async listBranches(): Promise<string[]>
Returns: Array of all branch names

└─ Run: git branch --format='%(refname:short)'
└─ Parse output (one branch per line)
└─ Return array
```

### Private Helpers

```
private generateId(): string
Returns: Random 8-character ID

└─ Math.random().toString(36).substring(2, 10)

private async ensureBaseDir(): Promise<void>
State changes: Creates base directory if needed

└─ fs.mkdirSync(this.basePath, { recursive: true })
```

---

## Create Worktree Flow (in SidebarApp)

```
createWorktree(branchName: string): Promise<void>
Parameters: branchName (user input)
State changes: worktrees[], modal

└─ Validate branch name:
│   └─ If empty or invalid: show error modal, return
│
└─ Create WorktreeManager
│
└─ Try: worktree = await manager.create(branchName, true)
│   └─ Creates new branch and worktree
│
└─ Catch: show error modal with message, return
│
└─ Add to state:
│   └─ this.state.worktrees.push(worktree)
│
└─ exitFullscreenModal()
└─ render()
```

---

## Delete Worktree Flow (in SidebarApp)

```
async deleteWorktree(worktree: Worktree): Promise<void>
Parameters: worktree to delete
State changes: sessions[], worktrees[], pane layout

└─ Find all sessions for this worktree:
│   └─ sessionsToDelete = sessions.filter(s => s.worktreeId === worktree.id)
│
└─ Delete each session:
│   └─ For each session:
│       └─ cleanupSession(session)  // Kill panes, remove hooks
│       └─ Remove from sessions array
│
└─ If active session was deleted:
│   └─ Switch to another session or create empty pane
│
└─ Create WorktreeManager
│
└─ Try: await manager.remove(worktree.path, true)  // Force removal
│
└─ Catch: show error modal with message, return
│
└─ Remove from state:
│   └─ this.state.worktrees = worktrees.filter(w => w.id !== worktree.id)
│
└─ Adjust selectedIndex if needed
└─ exitFullscreenModal()
└─ render()
```

---

## Worktree Directory Structure

```
~/.claude-worktrees/
├── my-project-feature-auth/     # Worktree for 'feature-auth' branch
│   ├── .git                     # Git link file (not directory)
│   ├── src/
│   └── ...
├── my-project-bugfix-login/     # Worktree for 'bugfix-login' branch
│   ├── .git
│   └── ...
└── my-project-experiment/       # Worktree for 'experiment' branch
    └── ...

/path/to/my-project/             # Main repository
├── .git/                        # Full git directory
│   └── worktrees/               # Worktree metadata
│       ├── my-project-feature-auth/
│       └── ...
└── ...
```

---

## Worktree State in Sidebar

```typescript
const worktree: Worktree = {
  id: 'abc12345',                          // Random ID
  path: '/Users/user/.claude-worktrees/my-project-feature-auth',
  branch: 'feature-auth',
  isMain: false
};

const mainWorktree: Worktree = {
  id: 'main',
  path: '/Users/user/projects/my-project',
  branch: 'main',
  isMain: true
};
```

---

## Error Handling

### Creation Errors
- Branch already exists: Git error message shown
- Invalid branch name: Validation error shown
- Disk full: Git error message shown

### Removal Errors
- Worktree has uncommitted changes: Force removal used
- Worktree path doesn't exist: Pruned automatically

### Recovery
- All errors show modal with message
- User can dismiss and retry
- Force removal cleans up partial state

---

## When to Update This Document

Update this document when:
- Changing worktree creation/deletion logic
- Modifying WorktreeManager class
- Adding new worktree operations
- Changing worktree storage location

After updating:
1. Update code flows with new function signatures
2. Update directory structure examples
3. Update "Last Updated" timestamp

---
**Last Updated:** 2025-01-18
**Files Covered:** `src/git/worktree.ts`
