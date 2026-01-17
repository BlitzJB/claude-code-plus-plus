/**
 * String Manipulation Utilities
 */

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @param ellipsis - Ellipsis string (default: '…')
 * @returns Truncated string
 */
export function truncate(
  str: string,
  maxLength: number,
  ellipsis: string = '…'
): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Pad a string to a minimum length
 * @param str - String to pad
 * @param length - Target length
 * @param char - Padding character (default: ' ')
 * @param direction - Pad direction (default: 'right')
 * @returns Padded string
 */
export function pad(
  str: string,
  length: number,
  char: string = ' ',
  direction: 'left' | 'right' | 'center' = 'right'
): string {
  if (str.length >= length) {
    return str;
  }

  const padding = char.repeat(length - str.length);

  switch (direction) {
    case 'left':
      return padding + str;
    case 'right':
      return str + padding;
    case 'center': {
      const leftPad = Math.floor(padding.length / 2);
      const rightPad = padding.length - leftPad;
      return char.repeat(leftPad) + str + char.repeat(rightPad);
    }
  }
}

/**
 * Wrap text to a maximum width
 * @param text - Text to wrap
 * @param maxWidth - Maximum line width
 * @returns Array of lines
 */
export function wrap(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) {
    return [text];
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // Handle words longer than maxWidth
      if (word.length > maxWidth) {
        let remaining = word;
        while (remaining.length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth));
          remaining = remaining.slice(maxWidth);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Convert a string to a slug (lowercase, hyphenated)
 * @param str - String to slugify
 * @returns Slugified string
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Strip ANSI escape codes from a string
 * @param str - String with ANSI codes
 * @returns Clean string without ANSI codes
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Calculate the visible width of a string (excluding ANSI codes)
 * @param str - String to measure
 * @returns Visible width in characters
 */
export function visibleWidth(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Indent each line of a string
 * @param str - String to indent
 * @param spaces - Number of spaces to indent
 * @returns Indented string
 */
export function indent(str: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return str
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

/**
 * Remove common leading whitespace from all lines
 * @param str - String to dedent
 * @returns Dedented string
 */
export function dedent(str: string): string {
  const lines = str.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    return str;
  }

  const minIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    })
  );

  return lines.map((line) => line.slice(minIndent)).join('\n');
}

/**
 * Capitalize the first letter of a string
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a string to title case
 * @param str - String to convert
 * @returns Title-cased string
 */
export function titleCase(str: string): string {
  return str
    .split(' ')
    .map((word) => capitalize(word.toLowerCase()))
    .join(' ');
}
