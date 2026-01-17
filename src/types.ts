export interface Worktree {
  id: string;
  path: string;
  branch: string;
  isMain: boolean;
  sessions: string[];
}

export interface Session {
  id: string;
  worktreeId: string;
  title: string;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
}

export interface PtyProcess {
  id: string;
  pid: number;
  cols: number;
  rows: number;
}

export interface AppConfig {
  worktreeBasePath: string;
  claudeCodeCommand: string;
  theme: 'dark' | 'light';
  keybindings: KeyBindings;
}

export interface KeyBindings {
  toggleSidebar: string;
  newTab: string;
  closeTab: string;
  newWorktree: string;
  nextTab: string;
  prevTab: string;
  focusTerminal: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  worktreeBasePath: '~/.claude-worktrees',
  claudeCodeCommand: 'claude',
  theme: 'dark',
  keybindings: {
    toggleSidebar: 'ctrl+b',
    newTab: 'ctrl+t',
    closeTab: 'ctrl+w',
    newWorktree: 'ctrl+n',
    nextTab: 'ctrl+]',
    prevTab: 'ctrl+[',
    focusTerminal: 'escape',
  },
};
