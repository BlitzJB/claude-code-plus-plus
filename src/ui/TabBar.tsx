import React from 'react';
import { Box, Text } from 'ink';
import type { Session } from '../types.js';

interface TabBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  focused: boolean;
}

export const TabBar: React.FC<TabBarProps> = ({
  sessions,
  activeSessionId,
  focused,
}) => {
  if (sessions.length === 0) {
    return (
      <Box paddingX={1} height={1}>
        <Text color="gray" dimColor>
          No sessions - press Ctrl+T to create one
        </Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1} height={1} gap={1}>
      {sessions.map((session, index) => {
        const isActive = session.id === activeSessionId;
        const statusColor = getStatusColor(session.status);

        return (
          <Box key={session.id}>
            <Text
              color={isActive ? 'black' : 'white'}
              backgroundColor={isActive ? 'white' : undefined}
              bold={isActive}
            >
              {' '}
              <Text color={isActive ? statusColor : statusColor}>●</Text>{' '}
              {index + 1}: {truncate(session.title, 20)}{' '}
            </Text>
          </Box>
        );
      })}

      <Box flexGrow={1} />
      <Text color="gray">
        <Text color="cyan">^T</Text> New <Text color="cyan">^W</Text> Close
      </Text>
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

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
