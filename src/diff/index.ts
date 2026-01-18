/**
 * Diff Module Exports
 */

// Git diff operations
export {
  getDiffSummary,
  getFileDiff,
  getFileWithInlineDiff,
  getFullFileWithInlineDiff,
  getDiffsOnlyView,
  watchForChanges,
  type ChangeType,
  type DiffFileSummary,
} from './git-diff';

// Diff pane rendering
export {
  renderDiffPane,
  findClickedFile,
  type FilePosition,
} from './diff-pane-render';

// File diff header rendering
export {
  renderFileHeader,
  type ButtonPositions,
  type FileHeaderRenderResult,
} from './file-diff-header-render';

// Diff pane management
export {
  createDiffPane,
  startDiffHandler,
  updateDiffPane,
  closeDiffPane,
  breakDiffPane,
  joinDiffPane,
  // File diff view pane management
  createFileDiffContentPane,
  createFileDiffHeaderPane,
  startFileDiffHeaderHandler,
  startFileDiffContentHandler,
  closeFileDiffHeaderPane,
  closeFileDiffContentPane,
} from './diff-manager';
