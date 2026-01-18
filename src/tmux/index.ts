/**
 * Tmux Module
 */

export { isAvailable, attach, exec, run, check } from './commands';
export {
  // Types
  type TmuxPane,
  // Session
  sessionExists,
  createSession,
  killSession,
  detachClient,
  // Panes
  splitHorizontal,
  splitVertical,
  listPanes,
  sendKeys,
  sendControlKey,
  runInPane,
  selectPane,
  resizePane,
  killPane,
  respawnPane,
  swapPanes,
  breakPane,
  joinPane,
  getPaneDimensions,
  // Options
  setOption,
  setPaneOption,
  // Keys
  bindKey,
  runShell,
  // Hooks
  setHook,
  removeHook,
} from './pane';
