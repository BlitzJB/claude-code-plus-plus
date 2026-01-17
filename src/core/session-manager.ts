import { EventEmitter } from 'events';
import { ptyManager, PtyManager } from './pty-manager.js';
import type { Session, Worktree } from '../types.js';

export interface SessionEvents {
  created: (session: Session) => void;
  destroyed: (sessionId: string) => void;
  output: (sessionId: string, data: string) => void;
  statusChanged: (sessionId: string, status: Session['status']) => void;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private sessionOutputBuffers: Map<string, string[]> = new Map();
  private claudeCommand: string;
  private ptyManager: PtyManager;

  constructor(claudeCommand: string = 'claude') {
    super();
    this.claudeCommand = claudeCommand;
    this.ptyManager = ptyManager;

    // Listen to PTY events
    this.ptyManager.on('data', (id: string, data: string) => {
      if (this.sessions.has(id)) {
        // Store in buffer for scrollback
        const buffer = this.sessionOutputBuffers.get(id) || [];
        buffer.push(data);
        // Keep last 10000 chunks
        if (buffer.length > 10000) buffer.shift();
        this.sessionOutputBuffers.set(id, buffer);

        this.emit('output', id, data);
      }
    });

    this.ptyManager.on('exit', (id: string, exitCode: number) => {
      const session = this.sessions.get(id);
      if (session) {
        session.status = exitCode === 0 ? 'stopped' : 'error';
        this.emit('statusChanged', id, session.status);
      }
    });
  }

  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  create(worktree: Worktree, title?: string): Session {
    const id = this.generateId();
    const session: Session = {
      id,
      worktreeId: worktree.id,
      title: title || `Claude @ ${worktree.branch}`,
      status: 'running',
      createdAt: new Date(),
    };

    this.sessions.set(id, session);
    this.sessionOutputBuffers.set(id, []);

    // Spawn Claude Code process
    this.ptyManager.spawn(
      id,
      this.claudeCommand,
      [], // No additional args, let user interact normally
      worktree.path
    );

    this.emit('created', session);
    return session;
  }

  destroy(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.ptyManager.kill(sessionId);
    this.sessions.delete(sessionId);
    this.sessionOutputBuffers.delete(sessionId);

    this.emit('destroyed', sessionId);
    return true;
  }

  write(sessionId: string, data: string): boolean {
    return this.ptyManager.write(sessionId, data);
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    return this.ptyManager.resize(sessionId, cols, rows);
  }

  resizeAll(cols: number, rows: number): void {
    this.ptyManager.resizeAll(cols, rows);
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionsForWorktree(worktreeId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.worktreeId === worktreeId
    );
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getOutputBuffer(sessionId: string): string[] {
    return this.sessionOutputBuffers.get(sessionId) || [];
  }

  isRunning(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.status === 'running';
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id);
    }
  }
}

export const sessionManager = new SessionManager();
