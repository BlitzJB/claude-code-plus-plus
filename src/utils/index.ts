/**
 * Utils Module
 *
 * Shared utility functions used across the application.
 * This module depends only on the types module.
 */

// ID generation
export {
  generateId,
  generateShortId,
  generateSessionId,
  hashString,
  createProjectId,
  sanitizeForId,
  createTmuxSessionName,
} from './id';

// String manipulation
export {
  truncate,
  pad,
  wrap,
  slugify,
  stripAnsi,
  visibleWidth,
  indent,
  dedent,
  capitalize,
  titleCase,
} from './string';

// Async utilities
export {
  delay,
  debounce,
  throttle,
  retry,
  withTimeout,
  mapWithConcurrency,
  createDeferred,
} from './async';
export type { Unsubscribe } from './async';

// Error handling
export {
  AppError,
  ConfigError,
  MultiplexerError,
  GitError,
  WorktreeError,
  SessionError,
  TerminalError,
  StateError,
  UIError,
  ValidationError,
  NotFoundError,
  isAppError,
  wrapError,
  getErrorMessage,
} from './errors';

// Logging
export {
  Logger,
  getLogger,
  setDefaultLogger,
  initializeLogger,
} from './logger';
export type { LogLevel, LoggerOptions } from './logger';

// Validation
export {
  isValidBranchName,
  isValidSessionName,
  isValidTmuxSessionName,
  isValidPath,
  isValidTerminalTitle,
  sanitizeBranchName,
  sanitizeSessionName,
  isDefined,
  isNonEmptyString,
  isPositiveInteger,
  isNonNegativeInteger,
  assert,
  assertDefined,
} from './validation';
