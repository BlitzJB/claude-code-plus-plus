/**
 * Config Module
 */

// Schema
export { validateConfig, isValidConfig } from './schema';
export type { AppConfig } from './schema';

// Defaults
export { createDefaultConfig, getDefaultConfig, resetDefaultConfig } from './defaults';

// Loader
export {
  getConfigFilePath,
  loadConfigFile,
  loadConfigFromEnv,
  loadConfig,
  saveConfigFile,
  ConfigManager,
} from './loader';

// Paths
export {
  createAppPaths,
  ensureDirectories,
  getTerminalStatePath,
  getWelcomeScriptPath,
  getNewWorktreePath,
  PathsManager,
} from './paths';
export type { AppPaths } from './paths';
