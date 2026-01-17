/**
 * Default Configuration Values
 */

import type { AppConfig } from '../types';
import { DEFAULT_CONFIG } from '../types';

/**
 * Create default configuration
 */
export function createDefaultConfig(): AppConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Default configuration instance
 */
let _defaultConfig: AppConfig | null = null;

export function getDefaultConfig(): AppConfig {
  if (!_defaultConfig) {
    _defaultConfig = createDefaultConfig();
  }
  return _defaultConfig;
}

/**
 * Reset the default config (mainly for testing)
 */
export function resetDefaultConfig(): void {
  _defaultConfig = null;
}
