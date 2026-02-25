/**
 * ProspectTableRow types — shared prop interfaces for the prospect row
 * and its sub-components (PipelineCell, ActionsCell).
 */

import type { Enquiry } from '../../../app/functionality/types';
import type { EnquiryEnrichmentData } from '../../../app/functionality/enquiryEnrichment';
import type { PipelineHoverInfo } from './pipeline/types';

// ─── State / Handler types passed from orchestrator ─────────────

export interface RowPipelineHandlers {
  showPipelineHover: (event: React.MouseEvent, info: Omit<NonNullable<PipelineHoverInfo>, 'x' | 'y'>) => void;
  movePipelineHover: (event: React.MouseEvent) => void;
  hidePipelineHover: () => void;
  openEnquiryWorkbench: (enquiry: Enquiry, tab: 'Pitch' | 'Timeline', options?: { filter?: 'pitch'; workbenchTab?: string }) => void;
  advancePipelineScroll: (enquiryId: string, totalChips: number, visibleChips: number) => void;
  getPipelineScrollOffset: (enquiryId: string) => number;
  handleReassignClick: (enquiryId: string, event: React.MouseEvent) => void;
  renderClaimPromptChip: (options?: {
    size?: 'default' | 'compact';
    teamsLink?: string | null;
    leadName?: string;
    areaOfWork?: string;
    enquiryId?: string;
    dataSource?: 'new' | 'legacy';
    iconOnly?: boolean;
  }) => React.ReactNode;
  getAreaSpecificChannelUrl: (areaOfWork: string | undefined) => string;
  getScenarioColor: (scenarioId?: string | null) => string;
}

export interface RowActionHandlers {
  handleSelectEnquiryToPitch: (enquiry: Enquiry) => void;
  handleRate: (id: string) => void;
  handleDeleteEnquiry: (enquiryId: string, enquiryName: string) => void;
  handleCopyName: (value: string, key: string) => Promise<void>;
  setEditingEnquiry: (enquiry: Enquiry) => void;
  setShowEditModal: (show: boolean) => void;
  setExpandedNotesInTable: (updater: (prev: Set<string>) => Set<string>) => void;
}

export interface RowDisplayState {
  isDarkMode: boolean;
  activeState: '' | 'Claimed' | 'Claimable' | 'Triaged';
  viewMode: 'table' | 'card';
  areActionsEnabled: boolean;
  copiedNameKey: string | null;
  expandedNotesInTable: Set<string>;
  hoveredRowKey: string | null;
  hoveredDayKey: string | null;
  hoveredRowKeyReady: string | null;
  hoveredDayKeyReady: string | null;
  pipelineNeedsCarousel: boolean;
  visiblePipelineChipCount: number;
  PIPELINE_CHIP_MIN_WIDTH_PX: number;
  collapsedDays: Set<string>;
}

export interface RowHoverHandlers {
  setHoveredRowKey: React.Dispatch<React.SetStateAction<string | null>>;
  setHoveredDayKey: React.Dispatch<React.SetStateAction<string | null>>;
  toggleDayCollapse: (dayKey: string) => void;
}

export interface RowDataDeps {
  claimerMap: Record<string, { Initials?: string; [k: string]: unknown }>;
  enrichmentMap: Map<string, EnquiryEnrichmentData>;
  getEnquiryWorkbenchItem: (enquiry: Enquiry) => any | undefined;
  isUnclaimedPoc: (value: unknown) => boolean;
  getRatingChipMeta: (ratingKey: string | undefined, darkMode: boolean) => {
    iconName: string;
    color: string;
    background: string;
    borderColor: string;
    hoverBackground: string;
    hoverColor: string;
    hoverBorderColor: string;
  };
  combineDateAndTime: (dateValue: unknown, timeValue?: unknown) => Date | null;
}

// ─── ProspectTableRow props ─────────────────────────────────────

export interface ProspectTableRowProps {
  item: Enquiry;
  idx: number;
  isLast: boolean;
  displayedItems: (Enquiry | any)[]; // Enquiry | GroupedEnquiry
  isGroupedEnquiry: (item: any) => boolean;
  pipelineHandlers: RowPipelineHandlers;
  actionHandlers: RowActionHandlers;
  displayState: RowDisplayState;
  hoverHandlers: RowHoverHandlers;
  dataDeps: RowDataDeps;
}
