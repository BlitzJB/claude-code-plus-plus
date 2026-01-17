/**
 * Configuration Loader
 *
 * Loads configuration from file and environment.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { AppConfig } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { validateConfig } from './schema';
import { getConfigDir } from '../platform';

/**
 * Get the config file path
 */
export function getConfigFilePath(): string {
  return `${getConfigDir()}/config.json`;
}

/**
 * Load configuration from a JSON file
 */
export function loadConfigFile(filePath: string): Partial<AppConfig> | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    const errors = validateConfig(parsed);
    if (errors.length > 0) {
      console.warn(`Config validation warnings: ${errors.join(', ')}`);
    }

    return parsed;
  } catch (error) {
    console.warn(`Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<AppConfig> {
  const config: Partial<AppConfig> = {};

  if (process.env.CLAUDE_PP_COMMAND) {
    config.claudeCommand = process.env.CLAUDE_PP_COMMAND;
  }

  if (process.env.CLAUDE_PP_SKIP_PERMISSIONS) {
    config.skipPermissions = process.env.CLAUDE_PP_SKIP_PERMISSIONS === 'true';
  }

  if (process.env.CLAUDE_PP_WORKTREES_DIR) {
    config.worktreesDir = process.env.CLAUDE_PP_WORKTREES_DIR;
  }

  return config;
}

/**
 * Load complete configuration, merging all sources
 */
export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  let config: AppConfig = { ...DEFAULT_CONFIG };

  // Merge config file
  const configFilePath = getConfigFilePath();
  const fileConfig = loadConfigFile(configFilePath);
  if (fileConfig) {
    config = { ...config, ...fileConfig };
  }

  // Merge environment variables
  const envConfig = loadConfigFromEnv();
  config = { ...config, ...envConfig };

  // Merge explicit overrides
  if (overrides) {
    config = { ...config, ...overrides };
  }

  return config;
}

/**
 * Save configuration to file
 */
export function saveConfigFile(config: Partial<AppConfig>): void {
  const filePath = getConfigFilePath();
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(config, null, 2);
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Configuration manager class
 */
export class ConfigManager {
  private config: AppConfig;

  constructor(initialConfig?: Partial<AppConfig>) {
    this.config = loadConfig(initialConfig);
  }

  get(): AppConfig {
    return this.config;
  }

  update(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  save(): void {
    saveConfigFile(this.config);
  }

  reload(): void {
    this.config = loadConfig();
  }
}
