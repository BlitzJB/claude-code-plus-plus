/**
 * CLI Argument Parser
 *
 * Lightweight argument parsing for command-line options.
 */

// ============================================================================
// Types
// ============================================================================

export interface CliOptions {
  // Positional arguments
  projectPath?: string;

  // Options
  help: boolean;
  version: boolean;
  debug: boolean;
  config?: string;
  skipPermissions: boolean;

  // Unknown arguments (for error reporting)
  unknown: string[];
}

export interface ParseResult {
  options: CliOptions;
  errors: string[];
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse command-line arguments
 */
export function parseArgs(args: string[]): ParseResult {
  const options: CliOptions = {
    help: false,
    version: false,
    debug: false,
    skipPermissions: false,
    unknown: [],
  };
  const errors: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Help
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      i++;
      continue;
    }

    // Version
    if (arg === '-v' || arg === '--version') {
      options.version = true;
      i++;
      continue;
    }

    // Debug
    if (arg === '-d' || arg === '--debug') {
      options.debug = true;
      i++;
      continue;
    }

    // Config file
    if (arg === '-c' || arg === '--config') {
      i++;
      if (i < args.length) {
        options.config = args[i];
        i++;
      } else {
        errors.push('--config requires a file path');
      }
      continue;
    }

    // Skip permissions
    if (arg === '--dangerously-skip-permissions') {
      options.skipPermissions = true;
      i++;
      continue;
    }

    // Unknown flag
    if (arg.startsWith('-')) {
      options.unknown.push(arg);
      i++;
      continue;
    }

    // Positional argument (project path)
    if (!options.projectPath) {
      options.projectPath = arg;
    } else {
      errors.push(`Unexpected argument: ${arg}`);
    }
    i++;
  }

  return { options, errors };
}

/**
 * Get help text
 */
export function getHelpText(programName: string = 'claude-code-plus-plus'): string {
  return `
${programName} - Multi-pane terminal interface for parallel Claude Code agents

USAGE:
  ${programName} [OPTIONS] [PROJECT_PATH]

ARGUMENTS:
  [PROJECT_PATH]  Path to the project directory (default: current directory)

OPTIONS:
  -h, --help                    Show this help message and exit
  -v, --version                 Show version and exit
  -d, --debug                   Enable debug logging
  -c, --config <PATH>           Path to configuration file
  --dangerously-skip-permissions
                                Skip permission prompts in Claude

EXAMPLES:
  ${programName}                     Start in current directory
  ${programName} ./my-project        Start in ./my-project
  ${programName} --debug             Start with debug logging enabled

For more information, visit https://github.com/anthropics/claude-code
`.trim();
}

/**
 * Get version text
 */
export function getVersionText(version: string): string {
  return `claude-code-plus-plus v${version}`;
}
