/**
 * Tmux control utilities
 */

import { execSync, spawnSync } from 'child_process';
import { writeFileSync, chmodSync } from 'fs';

export interface TmuxPane {
  id: string;
  width: number;
  height: number;
  active: boolean;
}

export interface TmuxWindow {
  id: string;
  name: string;
  active: boolean;
  panes: TmuxPane[];
}

export class Tmux {
  private sessionName: string;

  constructor(sessionName: string = 'claude-pp') {
    this.sessionName = sessionName;
  }

  /**
   * Check if tmux is installed
   */
  static isAvailable(): boolean {
    try {
      execSync('which tmux', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if our session already exists
   */
  sessionExists(): boolean {
    try {
      execSync(`tmux has-session -t ${this.sessionName} 2>/dev/null`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kill existing session if it exists
   */
  killSession(): void {
    try {
      execSync(`tmux kill-session -t ${this.sessionName} 2>/dev/null`, { stdio: 'ignore' });
    } catch {
      // Session didn't exist, that's fine
    }
  }

  /**
   * Create a new tmux session (detached)
   * Returns the initial window/pane ID
   */
  createSession(startDir: string): string {
    // Kill any existing session first
    this.killSession();

    // Create new detached session
    execSync(`tmux new-session -d -s ${this.sessionName} -c "${startDir}"`, { stdio: 'ignore' });

    // Get the pane ID
    const paneId = execSync(`tmux display-message -p -t ${this.sessionName} '#{pane_id}'`)
      .toString()
      .trim();

    return paneId;
  }

  /**
   * Split pane horizontally (left/right)
   * Returns the new pane ID (right pane)
   */
  splitHorizontal(percentage: number = 50, startDir?: string): string {
    const dirArg = startDir ? `-c "${startDir}"` : '';
    execSync(`tmux split-window -h -t ${this.sessionName} -p ${percentage} ${dirArg}`, { stdio: 'ignore' });

    // Get the new pane ID
    const paneId = execSync(`tmux display-message -p -t ${this.sessionName} '#{pane_id}'`)
      .toString()
      .trim();

    return paneId;
  }

  /**
   * Split pane vertically (top/bottom)
   * Returns the new pane ID (bottom pane)
   */
  splitVertical(percentage: number = 50, startDir?: string): string {
    const dirArg = startDir ? `-c "${startDir}"` : '';
    execSync(`tmux split-window -v -t ${this.sessionName} -p ${percentage} ${dirArg}`, { stdio: 'ignore' });

    const paneId = execSync(`tmux display-message -p -t ${this.sessionName} '#{pane_id}'`)
      .toString()
      .trim();

    return paneId;
  }

  /**
   * Send keys to a specific pane
   */
  /**
   * Send literal text to a pane (spaces and special chars preserved)
   */
  sendKeys(paneId: string, keys: string, enter: boolean = true): void {
    // Use -l for literal string to avoid interpretation issues
    // Escape single quotes in the keys
    const escaped = keys.replace(/'/g, "'\\''");
    execSync(`tmux send-keys -t ${paneId} -l '${escaped}'`, { stdio: 'ignore' });
    if (enter) {
      execSync(`tmux send-keys -t ${paneId} Enter`, { stdio: 'ignore' });
    }
  }

  /**
   * Send control/special keys (e.g., C-c for Ctrl+C, Enter, Escape)
   */
  sendControlKey(paneId: string, key: string): void {
    execSync(`tmux send-keys -t ${paneId} ${key}`, { stdio: 'ignore' });
  }

  /**
   * Run a command in a specific pane
   */
  runInPane(paneId: string, command: string): void {
    this.sendKeys(paneId, command, true);
  }

  /**
   * Select (focus) a specific pane
   */
  selectPane(paneId: string): void {
    execSync(`tmux select-pane -t ${paneId}`, { stdio: 'ignore' });
  }

  /**
   * Resize a pane
   */
  resizePane(paneId: string, width?: number, height?: number): void {
    if (width !== undefined) {
      execSync(`tmux resize-pane -t ${paneId} -x ${width}`, { stdio: 'ignore' });
    }
    if (height !== undefined) {
      execSync(`tmux resize-pane -t ${paneId} -y ${height}`, { stdio: 'ignore' });
    }
  }

  /**
   * Break a pane out to its own window (keeps it running in background)
   * Returns the new window ID
   */
  breakPane(paneId: string, windowName?: string): string {
    const nameArg = windowName ? `-n "${windowName}"` : '';
    execSync(`tmux break-pane -d -s ${paneId} ${nameArg}`, { stdio: 'ignore' });

    // Get the window ID of the broken-out pane
    const windowId = execSync(`tmux display-message -p -t ${paneId} '#{window_id}'`)
      .toString()
      .trim();

    return windowId;
  }

  /**
   * Join a pane from another window into the current window
   * Returns the new pane ID
   */
  joinPane(sourcePaneId: string, targetPaneId: string, horizontal: boolean = true): string {
    const direction = horizontal ? '-h' : '-v';
    execSync(`tmux join-pane ${direction} -s ${sourcePaneId} -t ${targetPaneId}`, { stdio: 'ignore' });

    // Return the source pane ID (it keeps its ID after joining)
    return sourcePaneId;
  }

  /**
   * Swap two panes
   */
  swapPane(paneId1: string, paneId2: string): void {
    execSync(`tmux swap-pane -s ${paneId1} -t ${paneId2}`, { stdio: 'ignore' });
  }

  /**
   * Create a new pane by splitting, run a command, then break it to background
   * Returns the pane ID (which persists even after breaking to background window)
   */
  createBackgroundPane(startDir: string, command?: string): string {
    // Split to create new pane
    const paneId = this.splitHorizontal(50, startDir);

    // Run command if provided
    if (command) {
      this.runInPane(paneId, command);
    }

    // Break it to background window (keeps it running)
    this.breakPane(paneId);

    return paneId;
  }

  /**
   * Bring a background pane to the foreground (swap with current right pane)
   */
  showPane(paneId: string, targetPaneId: string): void {
    this.swapPane(paneId, targetPaneId);
  }

  /**
   * Create a new window (like a tab)
   */
  createWindow(name: string, startDir?: string): string {
    const dirArg = startDir ? `-c "${startDir}"` : '';
    execSync(`tmux new-window -t ${this.sessionName} -n "${name}" ${dirArg}`, { stdio: 'ignore' });

    const windowId = execSync(`tmux display-message -p -t ${this.sessionName} '#{window_id}'`)
      .toString()
      .trim();

    return windowId;
  }

  /**
   * Select a window by index or ID
   */
  selectWindow(windowId: string): void {
    execSync(`tmux select-window -t ${windowId}`, { stdio: 'ignore' });
  }

  /**
   * Rename a window
   */
  renameWindow(windowId: string, name: string): void {
    execSync(`tmux rename-window -t ${windowId} "${name}"`, { stdio: 'ignore' });
  }

  /**
   * Kill a pane
   */
  killPane(paneId: string): void {
    try {
      execSync(`tmux kill-pane -t ${paneId}`, { stdio: 'ignore' });
    } catch {
      // Pane might already be dead
    }
  }

  /**
   * Kill a window
   */
  killWindow(windowId: string): void {
    try {
      execSync(`tmux kill-window -t ${windowId}`, { stdio: 'ignore' });
    } catch {
      // Window might already be dead
    }
  }

  /**
   * Detach the current client from the session
   */
  detachClient(): void {
    try {
      execSync(`tmux detach-client -s ${this.sessionName}`, { stdio: 'ignore' });
    } catch {
      // Client might already be detached
    }
  }

  /**
   * Attach to the session (takes over the terminal)
   * This is blocking - returns only after detach/exit
   */
  attach(): number {
    // Use spawnSync to block until tmux attach exits (user detaches or session ends)
    const result = spawnSync('tmux', ['attach-session', '-t', this.sessionName], {
      stdio: 'inherit',
    });

    return result.status || 0;
  }

  /**
   * Get list of panes in current window
   */
  listPanes(): TmuxPane[] {
    const output = execSync(
      `tmux list-panes -t ${this.sessionName} -F '#{pane_id},#{pane_width},#{pane_height},#{pane_active}'`
    ).toString();

    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, width, height, active] = line.split(',');
        return {
          id,
          width: parseInt(width, 10),
          height: parseInt(height, 10),
          active: active === '1',
        };
      });
  }

  /**
   * Get list of windows
   */
  listWindows(): TmuxWindow[] {
    const output = execSync(
      `tmux list-windows -t ${this.sessionName} -F '#{window_id},#{window_name},#{window_active}'`
    ).toString();

    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [id, name, active] = line.split(',');
        return {
          id,
          name,
          active: active === '1',
          panes: [], // Could populate with listPanes for each window if needed
        };
      });
  }

  /**
   * Set a tmux option
   */
  setOption(option: string, value: string, global: boolean = false): void {
    const flag = global ? '-g' : '';
    execSync(`tmux set-option ${flag} ${option} ${value}`, { stdio: 'ignore' });
  }

  /**
   * Set a pane-specific option
   */
  setPaneOption(paneId: string, option: string, value: string): void {
    execSync(`tmux set-option -p -t ${paneId} ${option} ${value}`, { stdio: 'ignore' });
  }

  /**
   * Bind a key
   */
  bindKey(key: string, command: string): void {
    execSync(`tmux bind-key ${key} ${command}`, { stdio: 'ignore' });
  }

  /**
   * Unbind a key
   */
  unbindKey(table: string, key: string): void {
    try {
      execSync(`tmux unbind-key -T ${table} ${key}`, { stdio: 'ignore' });
    } catch {
      // Key might not be bound
    }
  }

  /**
   * Bind a conditional key (does different things based on pane)
   */
  bindConditionalKey(table: string, key: string, condition: string, ifTrue: string, ifFalse: string): void {
    const cmd = ifTrue || '""';
    const elseCmd = ifFalse || '""';
    execSync(`tmux bind-key -T ${table} ${key} if-shell -F "${condition}" ${cmd} ${elseCmd}`, { stdio: 'ignore' });
  }

  /**
   * Set up a key binding to toggle sidebar width
   * Binds to Ctrl+G (no prefix needed, works from any pane)
   */
  bindSidebarToggle(sidebarPaneId: string, expandedWidth: number, collapsedWidth: number): void {
    // Write a toggle script using Node.js (avoids shell escaping issues)
    const scriptPath = `/tmp/claude-pp-toggle-${this.sessionName}.sh`;

    const script = `#!/bin/bash
width=$(tmux display-message -t '${sidebarPaneId}' -p '#{pane_width}')
if [ "$width" -gt ${collapsedWidth} ]; then
  tmux resize-pane -t '${sidebarPaneId}' -x ${collapsedWidth}
else
  tmux resize-pane -t '${sidebarPaneId}' -x ${expandedWidth}
fi
`;

    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, 0o755);

    // Bind to Ctrl+G in root table
    execSync(`tmux bind-key -T root C-g run-shell -b '${scriptPath}'`, { stdio: 'ignore' });
  }

  /**
   * Disable scroll wheel for a specific pane, keep it for others
   */
  disableScrollForPane(paneId: string): void {
    // Bind wheel events to do nothing if in sidebar pane, otherwise normal behavior
    const condition = `#{==:#{pane_id},${paneId}}`;

    // For WheelUpPane: if sidebar, do nothing; else enter copy-mode and scroll
    execSync(`tmux bind-key -T root WheelUpPane if-shell -F "${condition}" "" "copy-mode -e; send-keys -M"`, { stdio: 'ignore' });
    execSync(`tmux bind-key -T root WheelDownPane if-shell -F "${condition}" "" "copy-mode -e; send-keys -M"`, { stdio: 'ignore' });
  }

  /**
   * Get session name
   */
  getSessionName(): string {
    return this.sessionName;
  }
}
