import { create } from 'zustand';
import type { Worktree, Session, AppConfig } from '../types.js';
import { DEFAULT_CONFIG } from '../types.js';

export type FocusArea = 'sidebar' | 'terminal' | 'input';

export interface AppState {
  // Data
  worktrees: Worktree[];
  sessions: Map<string, Session>;

  // Selection
  activeWorktreeId: string | null;
  activeSessionId: string | null;

  // UI State
  focus: FocusArea;
  sidebarVisible: boolean;
  sidebarWidth: number;

  // Config
  config: AppConfig;

  // Terminal output buffers (sessionId -> lines)
  outputBuffers: Map<string, string>;

  // Actions
  setWorktrees: (worktrees: Worktree[]) => void;
  addWorktree: (worktree: Worktree) => void;
  removeWorktree: (worktreeId: string) => void;

  addSession: (session: Session) => void;
  removeSession: (sessionId: string) => void;
  updateSessionStatus: (sessionId: string, status: Session['status']) => void;

  setActiveWorktree: (worktreeId: string | null) => void;
  setActiveSession: (sessionId: string | null) => void;

  setFocus: (focus: FocusArea) => void;
  toggleSidebar: () => void;

  appendOutput: (sessionId: string, data: string) => void;
  clearOutput: (sessionId: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  worktrees: [],
  sessions: new Map(),
  activeWorktreeId: null,
  activeSessionId: null,
  focus: 'terminal',
  sidebarVisible: true,
  sidebarWidth: 24,
  config: DEFAULT_CONFIG,
  outputBuffers: new Map(),

  // Worktree actions
  setWorktrees: (worktrees) => set({ worktrees }),

  addWorktree: (worktree) =>
    set((state) => ({
      worktrees: [...state.worktrees, worktree],
    })),

  removeWorktree: (worktreeId) =>
    set((state) => ({
      worktrees: state.worktrees.filter((w) => w.id !== worktreeId),
      activeWorktreeId:
        state.activeWorktreeId === worktreeId ? null : state.activeWorktreeId,
    })),

  // Session actions
  addSession: (session) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.set(session.id, session);

      // Update worktree's session list
      const worktrees = state.worktrees.map((w) =>
        w.id === session.worktreeId
          ? { ...w, sessions: [...w.sessions, session.id] }
          : w
      );

      return { sessions: newSessions, worktrees };
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const session = state.sessions.get(sessionId);
      const newSessions = new Map(state.sessions);
      newSessions.delete(sessionId);

      // Remove from worktree's session list
      const worktrees = state.worktrees.map((w) =>
        w.id === session?.worktreeId
          ? { ...w, sessions: w.sessions.filter((id) => id !== sessionId) }
          : w
      );

      // Clear output buffer
      const outputBuffers = new Map(state.outputBuffers);
      outputBuffers.delete(sessionId);

      return {
        sessions: newSessions,
        worktrees,
        outputBuffers,
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    }),

  updateSessionStatus: (sessionId, status) =>
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;

      const newSessions = new Map(state.sessions);
      newSessions.set(sessionId, { ...session, status });
      return { sessions: newSessions };
    }),

  // Selection actions
  setActiveWorktree: (worktreeId) => set({ activeWorktreeId: worktreeId }),
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  // UI actions
  setFocus: (focus) => set({ focus }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  // Output buffer actions
  appendOutput: (sessionId, data) =>
    set((state) => {
      const outputBuffers = new Map(state.outputBuffers);
      const existing = outputBuffers.get(sessionId) || '';
      // Keep last 50000 chars to prevent memory issues
      const newOutput = (existing + data).slice(-50000);
      outputBuffers.set(sessionId, newOutput);
      return { outputBuffers };
    }),

  clearOutput: (sessionId) =>
    set((state) => {
      const outputBuffers = new Map(state.outputBuffers);
      outputBuffers.delete(sessionId);
      return { outputBuffers };
    }),
}));
