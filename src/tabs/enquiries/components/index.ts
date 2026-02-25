/**
 * Barrel export for all Prospects-page extracted components.
 *
 * Import from here in the orchestrator (Enquiries.tsx):
 *   import { ProspectTableRow, ProspectTableHeader, ... } from './components';
 */

// ─── Components ───────────────────────────────────────────────
export { default as ProspectTableRow } from './ProspectTableRow';
export { default as ProspectTableHeader } from './ProspectTableHeader';
export { default as ProspectHeroHeader } from './ProspectHeroHeader';
export { default as ProspectCaseChips } from './ProspectCaseChips';
export { default as PipelineCell } from './PipelineCell';
export { default as ActionsCell } from './ActionsCell';
export {
  RatingModal,
  EditEnquiryModal,
  ReassignmentDropdown,
  PipelineTooltipPortal,
  SuccessMessageBar,
} from './ProspectModals';
export type {
  RatingModalProps,
  EditEnquiryModalProps,
  ReassignmentDropdownProps,
  PipelineTooltipPortalProps,
  SuccessMessageBarProps,
} from './ProspectModals';

// ─── Pipeline sub-components ──────────────────────────────────
export { MiniPipelineChip } from './pipeline';
export { PipelineHoverTooltip } from './pipeline';
export { renderPipelineIcon } from './pipeline';
export type { PipelineStageUiEntry, PipelineHoverInfo, MiniChipProps } from './pipeline';
export { PIPELINE_STAGE_UI, PIPELINE_STAGE_MAP, CHIP_MIN_WIDTHS } from './pipeline';

// ─── Hooks ────────────────────────────────────────────────────
export {
  useRowHover,
  useDayCollapse,
  useToast,
  useRating,
  useEditModal,
  usePipelineMeasurement,
  useReassignment,
} from './useProspectTableState';
export type {
  RowHoverState,
  DayCollapseState,
  ToastState,
  RatingState,
  EditModalState,
  PipelineMeasurementState,
  ReassignmentState,
} from './useProspectTableState';

// ─── Types ────────────────────────────────────────────────────
export type {
  RowPipelineHandlers,
  RowActionHandlers,
  RowDisplayState,
  RowHoverHandlers,
  RowDataDeps,
  ProspectTableRowProps,
} from './rowTypes';

// ─── Utilities ────────────────────────────────────────────────
export {
  getAreaOfWorkIcon,
  toRgba,
  getAreaOfWorkLineColor,
  formatDateReceived,
  formatFullDateTime,
  timeAgo,
  timeAgoLong,
  getCompactTimeDisplay,
  getStackedDateDisplay,
  formatDaySeparatorLabel,
  getStackedTimeParts,
  formatValueForDisplay,
  buildEnquiryIdentityKey,
  getPocInitials,
  formatClaimTime,
  calculateTimeDifference,
} from './prospectDisplayUtils';
