import React from 'react';
import { Box, Text } from 'ink';
import type { Session, Worktree } from '../types.js';

interface StatusBarProps {
  worktree: Worktree | null;
  session: Session | null;
  focus: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  worktree,
  session,
  focus,
}) => {
  return (
    <Box height={1} paddingX={1} justifyContent="space-between">
      <Box gap={2}>
        <Text>
          <Text color="cyan" bold>
            Claude++
          </Text>
        </Text>

        {worktree && (
          <Text>
            <Text color="gray">Branch:</Text>{' '}
            <Text color="yellow">{worktree.branch}</Text>
          </Text>
        )}

        {session && (
          <Text>
            <Text color="gray">Status:</Text>{' '}
            <Text color={getStatusColor(session.status)}>{session.status}</Text>
          </Text>
        )}
      </Box>

      <Box gap={2}>
        <Text color="gray">
          Focus: <Text color="white">{focus}</Text>
        </Text>
        <Text color="gray">
          <Text color="cyan">^B</Text> sidebar{' '}
          <Text color="cyan">ESC</Text> terminal
        </Text>
      </Box>
    </Box>
  );
};

function getStatusColor(status: Session['status']): string {
  switch (status) {
    case 'running':
      return 'green';
    case 'stopped':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}
