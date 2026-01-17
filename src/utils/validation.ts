/**
 * Validation Utilities
 *
 * Common validation functions for user input and data.
 */

/**
 * Check if a string is a valid git branch name
 * @param name - Branch name to validate
 * @returns true if valid
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  // Git branch name rules:
  // - Cannot start with a dot
  // - Cannot contain consecutive dots
  // - Cannot contain spaces
  // - Cannot contain ~ ^ : ? * [ \ or ASCII control chars
  // - Cannot end with a dot or slash
  // - Cannot be @
  // - Cannot contain @{

  if (name.startsWith('.')) return false;
  if (name.endsWith('.')) return false;
  if (name.endsWith('/')) return false;
  if (name === '@') return false;
  if (name.includes('..')) return false;
  if (name.includes('@{')) return false;
  if (name.includes(' ')) return false;

  // Check for invalid characters
  const invalidChars = /[~^:?*\[\]\\]/;
  if (invalidChars.test(name)) return false;

  // Check for ASCII control characters (0x00-0x1F and 0x7F)
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x1f\x7f]/;
  if (controlChars.test(name)) return false;

  return true;
}

/**
 * Check if a string is a valid session name
 * @param name - Session name to validate
 * @returns true if valid
 */
export function isValidSessionName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }

  // Session names should be relatively permissive
  // Just avoid control characters and extremely long names
  if (name.length > 100) return false;

  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x1f\x7f]/;
  if (controlChars.test(name)) return false;

  return true;
}

/**
 * Check if a string is a valid tmux session name
 * @param name - Session name to validate
 * @returns true if valid
 */
export function isValidTmuxSessionName(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  // tmux session names cannot contain dots or colons
  if (name.includes('.')) return false;
  if (name.includes(':')) return false;

  // Keep it reasonable length
  if (name.length > 100) return false;

  // No control characters
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x1f\x7f]/;
  if (controlChars.test(name)) return false;

  return true;
}

/**
 * Check if a path is valid (basic check)
 * @param path - Path to validate
 * @returns true if valid
 */
export function isValidPath(path: string): boolean {
  if (!path || path.length === 0) {
    return false;
  }

  // Check for null bytes (security issue)
  if (path.includes('\0')) return false;

  // Path shouldn't be excessively long
  if (path.length > 4096) return false;

  return true;
}

/**
 * Check if a string is a valid terminal title
 * @param title - Title to validate
 * @returns true if valid
 */
export function isValidTerminalTitle(title: string): boolean {
  if (!title || title.trim().length === 0) {
    return false;
  }

  if (title.length > 50) return false;

  // No control characters
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x1f\x7f]/;
  if (controlChars.test(title)) return false;

  return true;
}

/**
 * Sanitize a branch name by replacing invalid characters
 * @param name - Name to sanitize
 * @returns Sanitized branch name
 */
export function sanitizeBranchName(name: string): string {
  return name
    .trim()
    .replace(/[~^:?*\[\]\\]/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/@{/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]/, '')
    .replace(/[-./]$/, '');
}

/**
 * Sanitize a session name
 * @param name - Name to sanitize
 * @returns Sanitized session name
 */
export function sanitizeSessionName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100);
}

/**
 * Validate that a value is defined and not null
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Validate that a string is not empty
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validate that a value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0
  );
}

/**
 * Validate that a value is a non-negative integer
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
  );
}

/**
 * Assert that a condition is true, throwing if not
 */
export function assert(
  condition: unknown,
  message: string = 'Assertion failed'
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Assert that a value is defined, returning it
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string = 'Value is not defined'
): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}
