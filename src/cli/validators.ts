/**
 * CLI Input Validators
 *
 * Validation functions for CLI inputs.
 */

import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Validation Results
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  value?: string;
}

// ============================================================================
// Validators
// ============================================================================

/**
 * Validate project path
 */
export function validateProjectPath(path?: string): ValidationResult {
  const resolvedPath = resolve(path || process.cwd());

  if (!existsSync(resolvedPath)) {
    return {
      valid: false,
      error: `Path does not exist: ${resolvedPath}`,
    };
  }

  const stats = statSync(resolvedPath);
  if (!stats.isDirectory()) {
    return {
      valid: false,
      error: `Path is not a directory: ${resolvedPath}`,
    };
  }

  return {
    valid: true,
    value: resolvedPath,
  };
}

/**
 * Validate config file path
 */
export function validateConfigPath(path?: string): ValidationResult {
  if (!path) {
    return { valid: true };
  }

  const resolvedPath = resolve(path);

  if (!existsSync(resolvedPath)) {
    return {
      valid: false,
      error: `Config file does not exist: ${resolvedPath}`,
    };
  }

  const stats = statSync(resolvedPath);
  if (!stats.isFile()) {
    return {
      valid: false,
      error: `Config path is not a file: ${resolvedPath}`,
    };
  }

  return {
    valid: true,
    value: resolvedPath,
  };
}

/**
 * Validate that git is available
 */
export function validateGitAvailable(): ValidationResult {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Git is not installed or not in PATH',
    };
  }
}

/**
 * Validate that tmux is available
 */
export function validateTmuxAvailable(): ValidationResult {
  try {
    execSync('tmux -V', { stdio: 'pipe' });
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'tmux is not installed or not in PATH',
    };
  }
}

/**
 * Validate that Claude is available
 */
export function validateClaudeAvailable(): ValidationResult {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Claude CLI is not installed or not in PATH',
    };
  }
}

/**
 * Run all required validations
 */
export function validateRequirements(options: {
  projectPath?: string;
  configPath?: string;
}): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Validate project path
  results.push({
    ...validateProjectPath(options.projectPath),
  });

  // Validate config path if provided
  if (options.configPath) {
    results.push({
      ...validateConfigPath(options.configPath),
    });
  }

  // Validate git
  results.push(validateGitAvailable());

  // Validate tmux
  results.push(validateTmuxAvailable());

  // Validate claude (warning only)
  const claudeResult = validateClaudeAvailable();
  if (!claudeResult.valid) {
    claudeResult.error = `Warning: ${claudeResult.error}`;
  }
  results.push(claudeResult);

  return results;
}

/**
 * Get all validation errors
 */
export function getValidationErrors(results: ValidationResult[]): string[] {
  return results
    .filter((r) => !r.valid && r.error && !r.error.startsWith('Warning:'))
    .map((r) => r.error!);
}

/**
 * Get all validation warnings
 */
export function getValidationWarnings(results: ValidationResult[]): string[] {
  return results
    .filter((r) => !r.valid && r.error?.startsWith('Warning:'))
    .map((r) => r.error!.replace('Warning: ', ''));
}
