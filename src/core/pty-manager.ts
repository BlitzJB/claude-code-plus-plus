import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import type { PtyProcess } from '../types.js';

type IPty = pty.IPty;

export interface PtyEvents {
  data: (id: string, data: string) => void;
  exit: (id: string, exitCode: number, signal?: number) => void;
  error: (id: string, error: Error) => void;
}

export class PtyManager extends EventEmitter {
  private processes: Map<string, IPty> = new Map();
  private processInfo: Map<string, PtyProcess> = new Map();

  constructor() {
    super();
  }

  spawn(
    id: string,
    command: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>
  ): PtyProcess {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;

    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        ...env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    });

    const info: PtyProcess = {
      id,
      pid: ptyProcess.pid,
      cols,
      rows,
    };

    this.processes.set(id, ptyProcess);
    this.processInfo.set(id, info);

    ptyProcess.onData((data) => {
      this.emit('data', id, data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', id, exitCode, signal);
      this.processes.delete(id);
      this.processInfo.delete(id);
    });

    return info;
  }

  write(id: string, data: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    proc.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const proc = this.processes.get(id);
    const info = this.processInfo.get(id);
    if (!proc || !info) return false;

    proc.resize(cols, rows);
    info.cols = cols;
    info.rows = rows;
    return true;
  }

  resizeAll(cols: number, rows: number): void {
    for (const id of this.processes.keys()) {
      this.resize(id, cols, rows);
    }
  }

  kill(id: string, signal: string = 'SIGTERM'): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;

    proc.kill(signal);
    return true;
  }

  killAll(): void {
    for (const id of this.processes.keys()) {
      this.kill(id);
    }
  }

  getProcess(id: string): PtyProcess | undefined {
    return this.processInfo.get(id);
  }

  getAllProcesses(): PtyProcess[] {
    return Array.from(this.processInfo.values());
  }

  isRunning(id: string): boolean {
    return this.processes.has(id);
  }
}

export const ptyManager = new PtyManager();
