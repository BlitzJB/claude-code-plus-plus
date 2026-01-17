/**
 * Logging Utility
 *
 * Provides structured logging with levels and optional file output.
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  /** Minimum log level to output */
  level: LogLevel;
  /** Context/component name for the logger */
  context?: string;
  /** File path to write logs (optional) */
  filePath?: string;
  /** Whether to include timestamps */
  timestamps?: boolean;
  /** Whether to output to console (disabled in TUI) */
  console?: boolean;
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  context?: string;
  message: string;
  args: unknown[];
}

/**
 * Format a log entry for output
 */
function formatLogEntry(entry: LogEntry, includeTimestamp: boolean): string {
  const parts: string[] = [];

  if (includeTimestamp) {
    parts.push(`[${entry.timestamp.toISOString()}]`);
  }

  parts.push(`[${entry.level.toUpperCase()}]`);

  if (entry.context) {
    parts.push(`[${entry.context}]`);
  }

  parts.push(entry.message);

  if (entry.args.length > 0) {
    const argsStr = entry.args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
    parts.push(argsStr);
  }

  return parts.join(' ');
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private readonly options: Required<LoggerOptions>;
  private fileInitialized: boolean = false;

  constructor(options: LoggerOptions) {
    this.options = {
      level: options.level,
      context: options.context || '',
      filePath: options.filePath || '',
      timestamps: options.timestamps ?? true,
      console: options.console ?? false,
    };
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.options.level];
  }

  /**
   * Initialize the log file if needed
   */
  private initializeFile(): void {
    if (this.fileInitialized || !this.options.filePath) {
      return;
    }

    try {
      const dir = dirname(this.options.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.fileInitialized = true;
    } catch {
      // Silently fail - logging should never crash the app
      this.fileInitialized = true; // Don't retry
    }
  }

  /**
   * Write a log entry
   */
  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      context: this.options.context,
      message,
      args,
    };

    const formatted = formatLogEntry(entry, this.options.timestamps);

    // Write to file if configured
    if (this.options.filePath) {
      this.initializeFile();
      try {
        appendFileSync(this.options.filePath, formatted + '\n');
      } catch {
        // Silently fail
      }
    }

    // Write to console if enabled (usually disabled in TUI mode)
    if (this.options.console) {
      switch (level) {
        case 'error':
          console.error(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'info':
          console.info(formatted);
          break;
        case 'debug':
          console.log(formatted);
          break;
      }
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, args);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log('info', message, args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, args);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown): void {
    if (error instanceof Error) {
      this.log('error', message, [
        { message: error.message, stack: error.stack },
      ]);
    } else if (error !== undefined) {
      this.log('error', message, [error]);
    } else {
      this.log('error', message, []);
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger {
    const newContext = this.options.context
      ? `${this.options.context}:${context}`
      : context;

    return new Logger({
      ...this.options,
      context: newContext,
    });
  }

  /**
   * Create a logger with a specific level
   */
  withLevel(level: LogLevel): Logger {
    return new Logger({
      ...this.options,
      level,
    });
  }
}

// Default logger instance (will be configured by the app)
let defaultLogger: Logger | null = null;

/**
 * Get the default logger
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    // Create a no-op logger if not initialized
    defaultLogger = new Logger({
      level: 'error',
      console: false,
    });
  }
  return defaultLogger;
}

/**
 * Set the default logger
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

/**
 * Create and set the default logger with options
 */
export function initializeLogger(options: LoggerOptions): Logger {
  defaultLogger = new Logger(options);
  return defaultLogger;
}
