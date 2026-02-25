/**
 * Pipeline chip types shared across the prospects table, header filters,
 * hover tooltips, and the timeline progress bar.
 */

/** Stages that map 1-to-1 with pipeline chip columns. */
export type EnquiryPipelineStage =
  | 'poc'
  | 'pitched'
  | 'instructed'
  | 'idcheck'
  | 'paid'
  | 'risk'
  | 'matter';

/** Tri-state filter applied via header clicks. */
export type EnquiryPipelineStatus = 'yes' | 'no';

/** Label density mode for responsive chip widths. */
export type PipelineChipLabelMode = 'full' | 'short' | 'icon';

/** UI metadata for each pipeline stage. */
export interface PipelineStageUiEntry {
  stage: EnquiryPipelineStage;
  fullLabel: string;
  shortLabel: string;
  iconName: string;
}

/** Tooltip anchor data for pipeline hover tooltip. */
export interface PipelineHoverInfo {
  x: number;
  y: number;
  title: string;
  status: string;
  subtitle?: string;
  color: string;
  iconName?: string;
  details?: { label: string; value: string }[];
}

/** Props for the MiniPipelineChip component. */
export interface MiniChipProps {
  shortLabel: string;
  fullLabel: string;
  done: boolean;
  inProgress?: boolean;
  color: string;
  title: string;
  iconName: string;
  statusText?: string;
  subtitle?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isNextAction?: boolean;
  details?: { label: string; value: string }[];
  showConnector?: boolean;
  /** Whether the previous chip in the pipeline is done. */
  prevDone?: boolean;
  isDarkMode: boolean;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
}

/** Canonical stage UI entries — single source of truth. */
export const PIPELINE_STAGE_UI: PipelineStageUiEntry[] = [
  { stage: 'poc', fullLabel: 'POC', shortLabel: 'POC', iconName: 'TeamsLogo' },
  { stage: 'pitched', fullLabel: 'Pitch', shortLabel: 'Pitch', iconName: 'Send' },
  { stage: 'instructed', fullLabel: 'Instructed', shortLabel: 'Instr', iconName: 'CheckMark' },
  { stage: 'idcheck', fullLabel: 'ID Check', shortLabel: 'ID', iconName: 'CheckMark' },
  { stage: 'paid', fullLabel: 'Payment', shortLabel: 'Pay', iconName: 'CurrencyPound' },
  { stage: 'risk', fullLabel: 'Risk', shortLabel: 'Risk', iconName: 'Shield' },
  { stage: 'matter', fullLabel: 'Matter', shortLabel: 'Matter', iconName: 'OpenFolderHorizontal' },
];

/** Stage entries indexed by stage key. */
export const PIPELINE_STAGE_MAP = new Map(
  PIPELINE_STAGE_UI.map((e) => [e.stage, e]),
);

/** Minimum chip widths per label mode (px). */
export const CHIP_MIN_WIDTHS: Record<PipelineChipLabelMode, number> = {
  icon: 32,
  short: 90,
  full: 110,
};
