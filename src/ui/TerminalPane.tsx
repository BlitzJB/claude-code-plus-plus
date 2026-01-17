import React, { useEffect, useRef } from 'react';
import { Box, Text, useStdout } from 'ink';

interface TerminalPaneProps {
  output: string;
  focused: boolean;
  sessionId: string | null;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  output,
  focused,
  sessionId,
}) => {
  const { stdout } = useStdout();

  if (!sessionId) {
    return (
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor="gray"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="gray">No active session</Text>
        <Text color="gray" dimColor>
          Select a worktree and press Ctrl+T to create a session
        </Text>
      </Box>
    );
  }

  // Split output into lines for display
  const lines = output.split('\n');
  const termHeight = (stdout?.rows || 24) - 6; // Account for UI chrome
  const visibleLines = lines.slice(-termHeight);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={focused ? 'green' : 'gray'}
      overflow="hidden"
    >
      <Box flexDirection="column" paddingX={1}>
        {visibleLines.map((line, index) => (
          <Text key={index} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
