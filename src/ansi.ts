/**
 * ANSI Escape Codes
 *
 * Shared module for all ANSI escape sequences used in terminal rendering.
 * This centralizes all escape codes to ensure consistency across the application.
 */

const ESC = '\x1b';
const CSI = `${ESC}[`;

export const ansi = {
  // Screen control
  clearScreen: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,

  // Cursor control
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,

  // Text styles
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  inverse: `${CSI}7m`,

  // Foreground colors
  fg: {
    black: `${CSI}30m`,
    red: `${CSI}31m`,
    green: `${CSI}32m`,
    yellow: `${CSI}33m`,
    blue: `${CSI}34m`,
    magenta: `${CSI}35m`,
    cyan: `${CSI}36m`,
    white: `${CSI}37m`,
    gray: `${CSI}90m`,
  },

  // Background colors
  bg: {
    black: `${CSI}40m`,
    red: `${CSI}41m`,
    green: `${CSI}42m`,
    yellow: `${CSI}43m`,
    blue: `${CSI}44m`,
    magenta: `${CSI}45m`,
    cyan: `${CSI}46m`,
    white: `${CSI}47m`,
    gray: `${CSI}100m`,
  },

  // Mouse support
  enableMouse: `${CSI}?1000h${CSI}?1006h`,
  disableMouse: `${CSI}?1000l${CSI}?1006l`,
};
