/**
 * Configuration Schema
 */

import type { AppConfig } from '../types';

// Re-export type for convenience
export type { AppConfig };

/**
 * Validate a configuration object
 * Returns an array of validation errors (empty if valid)
 */
export function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (typeof config !== 'object' || config === null) {
    errors.push('Configuration must be an object');
    return errors;
  }

  const cfg = config as Record<string, unknown>;

  if (cfg.claudeCommand !== undefined && typeof cfg.claudeCommand !== 'string') {
    errors.push('claudeCommand must be a string');
  }

  if (cfg.skipPermissions !== undefined && typeof cfg.skipPermissions !== 'boolean') {
    errors.push('skipPermissions must be a boolean');
  }

  if (cfg.worktreesDir !== undefined && cfg.worktreesDir !== null && typeof cfg.worktreesDir !== 'string') {
    errors.push('worktreesDir must be a string or null');
  }

  return errors;
}

/**
 * Type guard to check if value is a valid AppConfig
 */
export function isValidConfig(config: unknown): config is AppConfig {
  return validateConfig(config).length === 0;
}
