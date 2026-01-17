import React, { useEffect, useState, useCallback } from 'react';
import { Box, useApp, useInput, useStdout } from 'ink';
import { Sidebar } from './Sidebar.js';
import { TabBar } from './TabBar.js';
import { TerminalPane } from './TerminalPane.js';
import { StatusBar } from './StatusBar.js';
import { useStore } from '../state/store.js';
import { WorktreeManager } from '../core/worktree-manager.js';
import { sessionManager } from '../core/session-manager.js';
import type { Worktree, Session } from '../types.js';

interface AppProps {
  repoPath: string;
}

export const App: React.FC<AppProps> = ({ repoPath }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Store state
  const {
    worktrees,
    sessions,
    activeWorktreeId,
    activeSessionId,
    focus,
    sidebarVisible,
    sidebarWidth,
    outputBuffers,
    setWorktrees,
    addWorktree,
    removeWorktree,
    addSession,
    removeSession,
    updateSessionStatus,
    setActiveWorktree,
    setActiveSession,
    setFocus,
    toggleSidebar,
    appendOutput,
  } = useStore();

  // Local UI state
  const [sidebarIndex, setSidebarIndex] = useState(0);
  const [worktreeManager] = useState(() => new WorktreeManager(repoPath));
  const [inputMode, setInputMode] = useState(false);

  // Initialize worktrees on mount
  useEffect(() => {
    const init = async () => {
      const trees = await worktreeManager.list();
      setWorktrees(trees);
      if (trees.length > 0) {
        setActiveWorktree(trees[0].id);
      }
    };
    init();
  }, [worktreeManager, setWorktrees, setActiveWorktree]);

  // Listen to session events
  useEffect(() => {
    const handleOutput = (sessionId: string, data: string) => {
      appendOutput(sessionId, data);
    };

    const handleStatusChanged = (sessionId: string, status: Session['status']) => {
      updateSessionStatus(sessionId, status);
    };

    sessionManager.on('output', handleOutput);
    sessionManager.on('statusChanged', handleStatusChanged);

    return () => {
      sessionManager.off('output', handleOutput);
      sessionManager.off('statusChanged', handleStatusChanged);
    };
  }, [appendOutput, updateSessionStatus]);

  // Handle terminal resize
  useEffect(() => {
    const handleResize = () => {
      const cols = stdout?.columns || 80;
      const rows = stdout?.rows || 24;
      sessionManager.resizeAll(cols - (sidebarVisible ? sidebarWidth : 0) - 4, rows - 6);
    };

    stdout?.on('resize', handleResize);
    handleResize();

    return () => {
      stdout?.off('resize', handleResize);
    };
  }, [stdout, sidebarVisible, sidebarWidth]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionManager.destroyAll();
    };
  }, []);

  // Get current worktree and session
  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId) || null;
  const activeSession = activeSessionId ? sessions.get(activeSessionId) || null : null;
  const worktreeSessions = activeWorktree
    ? Array.from(sessions.values()).filter((s) => s.worktreeId === activeWorktree.id)
    : [];

  // Create new session
  const createSession = useCallback(() => {
    if (!activeWorktree) return;
    const session = sessionManager.create(activeWorktree);
    addSession(session);
    setActiveSession(session.id);
    setFocus('terminal');
  }, [activeWorktree, addSession, setActiveSession, setFocus]);

  // Close current session
  const closeSession = useCallback(() => {
    if (!activeSessionId) return;
    sessionManager.destroy(activeSessionId);
    removeSession(activeSessionId);

    // Switch to another session in the same worktree
    const remaining = worktreeSessions.filter((s) => s.id !== activeSessionId);
    if (remaining.length > 0) {
      setActiveSession(remaining[0].id);
    } else {
      setActiveSession(null);
    }
  }, [activeSessionId, worktreeSessions, removeSession, setActiveSession]);

  // Handle keyboard input
  useInput((input, key) => {
    // Global shortcuts (work regardless of focus)
    if (key.ctrl && input === 'c') {
      // Pass Ctrl+C to terminal if focused, otherwise exit
      if (focus === 'terminal' && activeSessionId) {
        sessionManager.write(activeSessionId, '\x03');
      } else {
        sessionManager.destroyAll();
        exit();
      }
      return;
    }

    if (key.ctrl && input === 'b') {
      toggleSidebar();
      return;
    }

    if (key.ctrl && input === 't') {
      createSession();
      return;
    }

    if (key.ctrl && input === 'w') {
      closeSession();
      return;
    }

    if (key.escape) {
      setFocus('terminal');
      return;
    }

    // Focus-specific input handling
    if (focus === 'sidebar') {
      handleSidebarInput(input, key);
    } else if (focus === 'terminal') {
      handleTerminalInput(input, key);
    }
  });

  const handleSidebarInput = (input: string, key: any) => {
    if (key.upArrow || input === 'k') {
      setSidebarIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSidebarIndex((i) => Math.min(worktrees.length - 1, i + 1));
    } else if (key.return) {
      const selectedWorktree = worktrees[sidebarIndex];
      if (selectedWorktree) {
        setActiveWorktree(selectedWorktree.id);
        // Switch to first session in worktree or clear active session
        const worktreeSess = Array.from(sessions.values()).filter(
          (s) => s.worktreeId === selectedWorktree.id
        );
        setActiveSession(worktreeSess[0]?.id || null);
        setFocus('terminal');
      }
    } else if (key.tab) {
      setFocus('terminal');
    }
  };

  const handleTerminalInput = (input: string, key: any) => {
    // In terminal mode, pass most input to the active session
    if (!activeSessionId) {
      // No session, allow switching to sidebar
      if (key.tab || (key.ctrl && input === 'b')) {
        setFocus('sidebar');
      }
      return;
    }

    // Tab switching with Alt+number
    if (key.meta) {
      const num = parseInt(input, 10);
      if (num >= 1 && num <= 9) {
        const targetSession = worktreeSessions[num - 1];
        if (targetSession) {
          setActiveSession(targetSession.id);
        }
        return;
      }
    }

    // Switch focus to sidebar with Tab
    if (key.tab) {
      setFocus('sidebar');
      return;
    }

    // Pass all other input to the terminal
    let data = input;
    if (key.return) data = '\r';
    else if (key.backspace || key.delete) data = '\x7f';
    else if (key.upArrow) data = '\x1b[A';
    else if (key.downArrow) data = '\x1b[B';
    else if (key.rightArrow) data = '\x1b[C';
    else if (key.leftArrow) data = '\x1b[D';

    if (data) {
      sessionManager.write(activeSessionId, data);
    }
  };

  const termWidth = (stdout?.columns || 80) - (sidebarVisible ? sidebarWidth : 0) - 2;
  const termHeight = (stdout?.rows || 24) - 4;

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Main content area */}
      <Box flexGrow={1}>
        {/* Sidebar */}
        {sidebarVisible && (
          <Sidebar
            worktrees={worktrees}
            activeWorktreeId={activeWorktreeId}
            selectedIndex={sidebarIndex}
            focused={focus === 'sidebar'}
            width={sidebarWidth}
            onSelect={(w) => {
              setActiveWorktree(w.id);
            }}
          />
        )}

        {/* Main pane */}
        <Box flexDirection="column" flexGrow={1}>
          {/* Tab bar */}
          <TabBar
            sessions={worktreeSessions}
            activeSessionId={activeSessionId}
            focused={false}
          />

          {/* Terminal */}
          <TerminalPane
            output={activeSessionId ? outputBuffers.get(activeSessionId) || '' : ''}
            focused={focus === 'terminal'}
            sessionId={activeSessionId}
          />
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        worktree={activeWorktree}
        session={activeSession}
        focus={focus}
      />
    </Box>
  );
};
