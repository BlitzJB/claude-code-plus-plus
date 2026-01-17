export interface Worktree {
  id: string;
  path: string;
  branch: string;
  isMain: boolean;
  sessions: string[];
}

export interface AppConfig {
  claudeCodeCommand: string;
  dangerouslySkipPermissions: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  claudeCodeCommand: 'claude',
  dangerouslySkipPermissions: true,
};
