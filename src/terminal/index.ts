/**
 * Terminal Module
 *
 * Provides terminal management functionality for sessions.
 * Each session can have multiple shell terminals with a tab bar UI.
 */

export {
  renderTerminalBar,
  findClickedTab,
  type TabPosition,
} from './bar-render';

// Note: bar-handler.ts is a standalone executable, not imported here
