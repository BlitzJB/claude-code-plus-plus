import React from 'react';
import { Box, Text } from 'ink';
import type { Worktree } from '../types.js';

interface SidebarProps {
  worktrees: Worktree[];
  activeWorktreeId: string | null;
  selectedIndex: number;
  focused: boolean;
  width: number;
  onSelect: (worktree: Worktree) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  worktrees,
  activeWorktreeId,
  selectedIndex,
  focused,
  width,
}) => {
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Worktrees
        </Text>
      </Box>

      {worktrees.length === 0 ? (
        <Text color="gray" dimColor>
          No worktrees
        </Text>
      ) : (
        worktrees.map((worktree, index) => {
          const isActive = worktree.id === activeWorktreeId;
          const isSelected = index === selectedIndex && focused;
          const sessionCount = worktree.sessions.length;

          return (
            <Box key={worktree.id}>
              <Text
                color={isSelected ? 'black' : isActive ? 'green' : 'white'}
                backgroundColor={isSelected ? 'cyan' : undefined}
                bold={isActive}
              >
                {isActive ? '⦿ ' : '  '}
                {truncate(worktree.branch, width - 8)}
                {sessionCount > 0 && (
                  <Text color={isSelected ? 'black' : 'gray'}> ({sessionCount})</Text>
                )}
              </Text>
            </Box>
          );
        })
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray" dimColor>
          ─────────────
        </Text>
        <Text color="gray">
          <Text color="cyan">^N</Text> New
        </Text>
        <Text color="gray">
          <Text color="cyan">^D</Text> Delete
        </Text>
      </Box>
    </Box>
  );
};

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
