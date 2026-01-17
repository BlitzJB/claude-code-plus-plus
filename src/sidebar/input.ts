/**
 * Sidebar Input Handling
 *
 * Keyboard and mouse input parsing.
 */

import type { KeyEvent } from '../types';

// ============================================================================
// Key Parsing
// ============================================================================

/**
 * Parse raw input buffer into a key event
 */
export function parseKey(data: Buffer): KeyEvent {
  const str = data.toString();
  const event: KeyEvent = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    raw: data,
  };

  // Control characters
  if (data.length === 1) {
    const code = data[0];

    // Special keys - check these FIRST before Ctrl combinations
    switch (code) {
      case 0x1B: event.key = 'escape'; return event;
      case 0x0D: event.key = 'enter'; return event;  // Carriage return (Enter)
      case 0x0A: event.key = 'enter'; return event;  // Line feed (some terminals send this for Enter)
      case 0x7F: event.key = 'backspace'; return event;
      case 0x08: event.key = 'backspace'; return event;  // Some terminals send this for backspace
      case 0x09: event.key = 'tab'; return event;
    }

    // Ctrl+A to Ctrl+Z (0x01 - 0x1A), excluding special keys handled above
    if (code >= 0x01 && code <= 0x1A) {
      event.ctrl = true;
      event.key = String.fromCharCode(code + 0x60); // 'a' to 'z'
      return event;
    }

    // Regular printable character
    if (code >= 0x20 && code <= 0x7E) {
      event.key = str;
      event.shift = str === str.toUpperCase() && str !== str.toLowerCase();
      return event;
    }
  }

  // Escape sequences
  if (str.startsWith('\x1b[')) {
    const seq = str.slice(2);

    // Arrow keys
    if (seq === 'A') { event.key = 'up'; return event; }
    if (seq === 'B') { event.key = 'down'; return event; }
    if (seq === 'C') { event.key = 'right'; return event; }
    if (seq === 'D') { event.key = 'left'; return event; }

    // Home/End
    if (seq === 'H' || seq === '1~') { event.key = 'home'; return event; }
    if (seq === 'F' || seq === '4~') { event.key = 'end'; return event; }

    // Page Up/Down
    if (seq === '5~') { event.key = 'pageup'; return event; }
    if (seq === '6~') { event.key = 'pagedown'; return event; }

    // Delete
    if (seq === '3~') { event.key = 'delete'; return event; }
  }

  // Alt+key
  if (str.length === 2 && str[0] === '\x1b') {
    event.alt = true;
    event.key = str[1];
    return event;
  }

  // Default to the raw string
  event.key = str;
  return event;
}

// ============================================================================
// Mouse Parsing
// ============================================================================

export interface MouseEvent {
  button: number;
  x: number;
  y: number;
  release: boolean;
}

/**
 * Check if input is a mouse event
 */
export function isMouseEvent(str: string): boolean {
  return /\x1b\[<\d+;\d+;\d+[Mm]/.test(str);
}

/**
 * Parse SGR mouse event
 */
export function parseMouseEvent(str: string): MouseEvent | null {
  const match = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (!match) return null;

  return {
    button: parseInt(match[1], 10),
    x: parseInt(match[2], 10),
    y: parseInt(match[3], 10),
    release: match[4] === 'm',
  };
}

// ============================================================================
// Input Setup
// ============================================================================

/**
 * Set up terminal for raw input
 */
export function setupRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
}

/**
 * Restore terminal to normal mode
 */
export function restoreMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}
