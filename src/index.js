// Public API for programmatic use.
export {
  emptyState,
  parseState,
  advancePhase,
  appendDecision,
  addOption,
  addConstraint,
  addTask,
  markTaskDone,
  setRationale,
  setDiffUrl,
  PHASES,
} from './state.js';
export { renderHTML } from './template.js';
