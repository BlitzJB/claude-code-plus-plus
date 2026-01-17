/**
 * Custom Error Classes
 *
 * Domain-specific errors for better error handling and debugging.
 */

/**
 * Base error class for the application
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    options?: {
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = options?.context;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

/**
 * Error for configuration-related issues
 */
export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', { context });
    this.name = 'ConfigError';
  }
}

/**
 * Error for multiplexer operations (tmux, etc.)
 */
export class MultiplexerError extends AppError {
  public readonly command?: string;
  public readonly exitCode?: number;
  public readonly stderr?: string;

  constructor(
    message: string,
    options?: {
      command?: string;
      exitCode?: number;
      stderr?: string;
      cause?: Error;
    }
  ) {
    super(message, 'MULTIPLEXER_ERROR', {
      context: {
        command: options?.command,
        exitCode: options?.exitCode,
        stderr: options?.stderr,
      },
      cause: options?.cause,
    });
    this.name = 'MultiplexerError';
    this.command = options?.command;
    this.exitCode = options?.exitCode;
    this.stderr = options?.stderr;
  }
}

/**
 * Error for Git operations
 */
export class GitError extends AppError {
  public readonly command?: string;
  public readonly exitCode?: number;

  constructor(
    message: string,
    options?: {
      command?: string;
      exitCode?: number;
      cause?: Error;
    }
  ) {
    super(message, 'GIT_ERROR', {
      context: {
        command: options?.command,
        exitCode: options?.exitCode,
      },
      cause: options?.cause,
    });
    this.name = 'GitError';
    this.command = options?.command;
    this.exitCode = options?.exitCode;
  }
}

/**
 * Error for worktree operations
 */
export class WorktreeError extends AppError {
  public readonly worktreePath?: string;
  public readonly branch?: string;

  constructor(
    message: string,
    options?: {
      worktreePath?: string;
      branch?: string;
      cause?: Error;
    }
  ) {
    super(message, 'WORKTREE_ERROR', {
      context: {
        worktreePath: options?.worktreePath,
        branch: options?.branch,
      },
      cause: options?.cause,
    });
    this.name = 'WorktreeError';
    this.worktreePath = options?.worktreePath;
    this.branch = options?.branch;
  }
}

/**
 * Error for session operations
 */
export class SessionError extends AppError {
  public readonly sessionId?: string;

  constructor(
    message: string,
    options?: {
      sessionId?: string;
      cause?: Error;
    }
  ) {
    super(message, 'SESSION_ERROR', {
      context: { sessionId: options?.sessionId },
      cause: options?.cause,
    });
    this.name = 'SessionError';
    this.sessionId = options?.sessionId;
  }
}

/**
 * Error for terminal operations
 */
export class TerminalError extends AppError {
  public readonly terminalId?: string;
  public readonly paneId?: string;

  constructor(
    message: string,
    options?: {
      terminalId?: string;
      paneId?: string;
      cause?: Error;
    }
  ) {
    super(message, 'TERMINAL_ERROR', {
      context: {
        terminalId: options?.terminalId,
        paneId: options?.paneId,
      },
      cause: options?.cause,
    });
    this.name = 'TerminalError';
    this.terminalId = options?.terminalId;
    this.paneId = options?.paneId;
  }
}

/**
 * Error for state/persistence operations
 */
export class StateError extends AppError {
  public readonly statePath?: string;

  constructor(
    message: string,
    options?: {
      statePath?: string;
      cause?: Error;
    }
  ) {
    super(message, 'STATE_ERROR', {
      context: { statePath: options?.statePath },
      cause: options?.cause,
    });
    this.name = 'StateError';
    this.statePath = options?.statePath;
  }
}

/**
 * Error for UI operations
 */
export class UIError extends AppError {
  public readonly component?: string;

  constructor(
    message: string,
    options?: {
      component?: string;
      cause?: Error;
    }
  ) {
    super(message, 'UI_ERROR', {
      context: { component: options?.component },
      cause: options?.cause,
    });
    this.name = 'UIError';
    this.component = options?.component;
  }
}

/**
 * Error for validation failures
 */
export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    message: string,
    options?: {
      field?: string;
      value?: unknown;
    }
  ) {
    super(message, 'VALIDATION_ERROR', {
      context: {
        field: options?.field,
        value: options?.value,
      },
    });
    this.name = 'ValidationError';
    this.field = options?.field;
    this.value = options?.value;
  }
}

/**
 * Error for when a required resource is not found
 */
export class NotFoundError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId?: string;

  constructor(
    resourceType: string,
    resourceId?: string,
    message?: string
  ) {
    super(
      message || `${resourceType} not found${resourceId ? `: ${resourceId}` : ''}`,
      'NOT_FOUND_ERROR',
      {
        context: { resourceType, resourceId },
      }
    );
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Wrap an unknown error in an AppError
 */
export function wrapError(
  error: unknown,
  message?: string,
  code: string = 'UNKNOWN_ERROR'
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const cause = error instanceof Error ? error : new Error(String(error));
  return new AppError(message || cause.message, code, { cause });
}

/**
 * Extract error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}
