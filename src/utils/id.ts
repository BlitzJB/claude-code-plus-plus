/**
 * ID Generation Utilities
 *
 * Functions for generating unique identifiers.
 */

import { randomBytes, createHash } from 'crypto';

/**
 * Generate a random ID using crypto random bytes
 * @param length - Length of the ID (default: 8)
 * @returns Random alphanumeric string
 */
export function generateId(length: number = 8): string {
  const bytes = randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
}

/**
 * Generate a short random ID suitable for display
 * @returns 6-character alphanumeric string
 */
export function generateShortId(): string {
  return generateId(6);
}

/**
 * Generate a session-safe ID (alphanumeric, starts with letter)
 * Useful for tmux session names which have restrictions
 * @returns Session-safe ID string
 */
export function generateSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const firstChar = chars[Math.floor(Math.random() * chars.length)];
  return firstChar + generateId(7);
}

/**
 * Create a deterministic hash from a string
 * @param input - String to hash
 * @param length - Length of output hash (default: 8)
 * @returns Hex hash string
 */
export function hashString(input: string, length: number = 8): string {
  const hash = createHash('md5').update(input).digest('hex');
  return hash.slice(0, length);
}

/**
 * Create a unique project identifier from a path
 * Format: basename-hash
 * @param projectPath - Full path to the project
 * @returns Unique project identifier
 */
export function createProjectId(projectPath: string): string {
  const basename = projectPath.split('/').pop() || 'project';
  const hash = hashString(projectPath, 6);
  return `${sanitizeForId(basename)}-${hash}`;
}

/**
 * Sanitize a string to be safe for use in IDs
 * Replaces non-alphanumeric characters with dashes
 * @param input - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeForId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

/**
 * Create a tmux-safe session name
 * @param projectName - Name of the project
 * @param projectPath - Full path to the project
 * @returns Tmux-safe session name
 */
export function createTmuxSessionName(
  projectName: string,
  projectPath: string
): string {
  const sanitized = sanitizeForId(projectName);
  const hash = hashString(projectPath, 6);
  return `cpp-${sanitized}-${hash}`;
}
