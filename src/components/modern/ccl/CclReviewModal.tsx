import React from 'react';
import { colours } from '../../../app/styles/colours';
import CclReviewDecisionPanel from '../CclReviewDecisionPanel';
import CclReviewFieldHeader from '../CclReviewFieldHeader';
import CclReviewQueueStrip, { type CclQueueStripItem } from '../CclReviewQueueStrip';
import { DocumentRenderer } from '../../../tabs/instructions/ccl/DocumentRenderer';
import type { PressureTestFieldScore, PressureTestResponse } from '../../../tabs/matters/ccl/cclAiService';
import CclReviewLandingPanel from './CclReviewLandingPanel';
import CclReviewRailLanding from './CclReviewRailLanding';
import CclReviewSetupPanel from './CclReviewSetupPanel';

type PreviewFieldState = {
  isMailMergeValue?: boolean;
  isAiGenerated?: boolean;
  isAiUpdated?: boolean;
  isReviewed?: boolean;
  isUnresolved?: boolean;
};

type ReviewPageBreak = {
  beforeBlockId: string;
  pageNumber: number;
};

type ReviewFieldType = 'set-wording' | 'verify';

type StructuredChoiceConfig = {
  choiceKey: string;
  selectedChoice?: string | null;
  options: Array<{
    value: string;
    title: string;
    help: string;
    preview: string;
  }>;
} | null;

type CclFieldMeta = {
  label: string;
  group: string;
  confidence: 'data' | 'inferred' | 'templated' | 'unknown';
};

type CompileSummary = {
  readyCount?: number;
  sourceCount?: number;
  limitedCount?: number;
  missingCount?: number;
  contextFieldCount?: number;
  snippetCount?: number;
};

type SelectedFieldPressureTestSupport = {
  dataSources?: string[];
  aiTraceId?: number | null;
  promptVersion?: string | null;
} | null;

type AiState = {
  title: string;
  detail: string;
};

type ConfidenceBreakdown = {
  data: number;
  inferred: number;
  templated: number;
  unknown: number;
};

type CclReviewModalProps = {
  approvalOverlay?: React.ReactNode;
  devToolsDock?: React.ReactNode;
  handleCclLetterBackdropClick: React.MouseEventHandler<HTMLDivElement>;
  closeCclLetterModal: () => void;
  onGenerateAiReview: () => void;
  onRunPressureTest: () => void;
  retryDraftFetch?: () => void;
  headerMatterLabel: string;
  headerClientName: string;
  headerStatusText: string;
  statusColor: string;
  isMobileReview: boolean;
  previewCurrentPage: number;
  previewTotalPages: number;
  useIntroPreviewLayout: boolean;
  introShellGrid: string;
  reviewShellGrid: string;
  cclReviewPreviewRefCallback: React.RefCallback<HTMLDivElement>;
  syncIntroPreviewProgress: () => void;
  syncVisibleReviewGroup: () => void;
  previewBottomPadding: number;
  previewFramePaddingX: number;
  previewScaledWidth: string | number;
  previewDocumentMaxWidth: string | number;
  previewScaledHeight?: number;
  previewFallbackHeight?: number;
  cclReviewPageRefCallback: React.RefCallback<HTMLDivElement>;
  cclPreviewZoom: number;
  previewShellReady: boolean;
  previewDesktopFontSize: string;
  previewDesktopLineHeight: number;
  introPreviewTemplate: string;
  setupDisplayFields: Record<string, string>;
  structuredReviewFields: Record<string, string>;
  rawPreviewTemplate: string;
  structuredPreviewFields: Record<string, string>;
  placeholderLabels: Record<string, string>;
  previewFieldStates: Record<string, PreviewFieldState>;
  cclReviewFieldElementRefs: React.MutableRefObject<Record<string, HTMLSpanElement | null>>;
  setupActiveFieldKey: string | null;
  cclRendererRootRef: React.RefObject<HTMLDivElement>;
  cclIntroPageBreaks?: ReviewPageBreak[];
  cclIntroTotalPages: number;
  cclHoveredPreviewPage: number | null;
  previewDocumentPaddingX: number;
  previewFirstPageHeader: React.ReactNode;
  previewFirstPageFooter: React.ReactNode;
  allClickableFieldKeys: string[];
  selectedFieldKey: string | null;
  structuredChoiceConfig: StructuredChoiceConfig;
  setFocusedReviewField: (key: string | null, fromScrollSpy?: boolean, shouldScrollIntoView?: boolean) => void;
  cclHoveredCrossKey: string | null;
  setCclHoveredCrossKey: (key: string | null) => void;
  cclPageBreaks?: ReviewPageBreak[];
  cclTotalPages: number;
  applySelectedFieldValue: (value: string) => void;
  showSetupInDefaultView: boolean;
  showReviewIntro: boolean;
  shouldShowReviewRail: boolean;
  loadingReviewContext: boolean;
  showReviewRailSkeleton: boolean;
  showSummaryLanding: boolean;
  noAiReviewContext: boolean;
  showQueuedReviewLanding: boolean;
  noClarificationsQueued: boolean;
  ptRunningHere: boolean;
  ptPending: boolean;
  ptCanRun: boolean;
  setupHeaderTitle: string;
  setupHeaderBody: React.ReactNode;
  introBody: React.ReactNode;
  setupFlowStrip: React.ReactNode;
  launchFlowStrip: React.ReactNode;
  launchDraftError: string | null;
  launchPressureErrored: boolean;
  cclPressureTestError: string | null;
  draftFetchError: string | null;
  launchPressureRunning: boolean;
  launchIsStreamingNow: boolean;
  launchTraceLoading: boolean;
  launchHasAiData: boolean;
  aiDurationMs?: number;
  aiState: AiState;
  isGeneratingAiReview: boolean;
  overrideStartAgainLink: React.ReactNode;
  overrideExpandedCard: React.ReactNode;
  overrideSummaryCard: React.ReactNode;
  reviewPaneHeight: string;
  reviewRailContentKey: string;
  selectedFieldMeta: CclFieldMeta | null;
  selectedFieldSequenceCount: number;
  currentDecisionNumber: number;
  visibleReviewFieldCount: number;
  reviewedDecisionCount: number;
  selectionProgressPercent: number;
  reviewFieldTypeMap: Record<string, ReviewFieldType>;
  selectedFieldDecisionReason: string;
  selectedFieldPressureTest?: PressureTestFieldScore;
  selectedFieldPressureTestResponse?: SelectedFieldPressureTestSupport;
  totalAiFields: number;
  confidenceBreakdown: ConfidenceBreakdown;
  summaryLandingReviewMessage: React.ReactNode;
  dataSources: string[];
  beginReviewFromIntro: () => void;
  summaryLandingBeginLabel: string;
  isStreamingNow: boolean;
  aiGeneratedCount: number;
  aiStatusMessage: string;
  devMetaStrip: React.ReactNode;
  setWordingCount: number;
  verifyCount: number;
  nextQueuedFieldKey: string | null;
  queueStripItems: CclQueueStripItem[];
  jumpToDecision: (key: string) => void;
  selectedFieldOutput: string;
  selectedFieldIsReviewed: boolean;
  nextDecisionFieldKey: string | null;
  previousDecisionFieldKey: string | null;
  canApprove: boolean;
  isApproving: boolean;
  approvalLabel: string;
  applyStructuredChoice: (choiceValue: string) => void;
  autoSizeReviewTextarea: (element: HTMLTextAreaElement | null) => void;
  toggleFieldReviewed: (key: string) => void;
  handleApproveCurrentLetter: () => void;
  focusPreviousDecision: () => void;
  focusNextDecision: () => void;
  compileSummaryHere: CompileSummary | null;
  generationFieldCount: number;
  generationConfidence: string;
  cclUnresolvedCount?: number;
  ptResultHere?: PressureTestResponse;
  compiledAtHere: string | null;
};

export default function CclReviewModal({
  approvalOverlay,
  devToolsDock,
  handleCclLetterBackdropClick,
  closeCclLetterModal,
  onGenerateAiReview,
  onRunPressureTest,
  retryDraftFetch,
  headerMatterLabel,
  headerClientName,
  headerStatusText,
  statusColor,
  isMobileReview,
  previewCurrentPage,
  previewTotalPages,
  useIntroPreviewLayout,
  introShellGrid,
  reviewShellGrid,
  cclReviewPreviewRefCallback,
  syncIntroPreviewProgress,
  syncVisibleReviewGroup,
  previewBottomPadding,
  previewFramePaddingX,
  previewScaledWidth,
  previewDocumentMaxWidth,
  previewScaledHeight,
  previewFallbackHeight,
  cclReviewPageRefCallback,
  cclPreviewZoom,
  previewShellReady,
  previewDesktopFontSize,
  previewDesktopLineHeight,
  introPreviewTemplate,
  setupDisplayFields,
  structuredReviewFields,
  rawPreviewTemplate,
  structuredPreviewFields,
  placeholderLabels,
  previewFieldStates,
  cclReviewFieldElementRefs,
  setupActiveFieldKey,
  cclRendererRootRef,
  cclIntroPageBreaks,
  cclIntroTotalPages,
  cclHoveredPreviewPage,
  previewDocumentPaddingX,
  previewFirstPageHeader,
  previewFirstPageFooter,
  allClickableFieldKeys,
  selectedFieldKey,
  structuredChoiceConfig,
  setFocusedReviewField,
  cclHoveredCrossKey,
  setCclHoveredCrossKey,
  cclPageBreaks,
  cclTotalPages,
  applySelectedFieldValue,
  showSetupInDefaultView,
  showReviewIntro,
  shouldShowReviewRail,
  loadingReviewContext,
  showReviewRailSkeleton,
  showSummaryLanding,
  noAiReviewContext,
  showQueuedReviewLanding,
  noClarificationsQueued,
  ptRunningHere,
  ptPending,
  ptCanRun,
  setupHeaderTitle,
  setupHeaderBody,
  introBody,
  setupFlowStrip,
  launchFlowStrip,
  launchDraftError,
  launchPressureErrored,
  cclPressureTestError,
  draftFetchError,
  launchPressureRunning,
  launchIsStreamingNow,
  launchTraceLoading,
  launchHasAiData,
  aiDurationMs,
  aiState,
  isGeneratingAiReview,
  overrideStartAgainLink,
  overrideExpandedCard,
  overrideSummaryCard,
  reviewPaneHeight,
  reviewRailContentKey,
  selectedFieldMeta,
  selectedFieldSequenceCount,
  currentDecisionNumber,
  visibleReviewFieldCount,
  reviewedDecisionCount,
  selectionProgressPercent,
  reviewFieldTypeMap,
  selectedFieldDecisionReason,
  selectedFieldPressureTest,
  selectedFieldPressureTestResponse,
  totalAiFields,
  confidenceBreakdown,
  summaryLandingReviewMessage,
  dataSources,
  beginReviewFromIntro,
  summaryLandingBeginLabel,
  isStreamingNow,
  aiGeneratedCount,
  aiStatusMessage,
  devMetaStrip,
  setWordingCount,
  verifyCount,
  nextQueuedFieldKey,
  queueStripItems,
  jumpToDecision,
  selectedFieldOutput,
  selectedFieldIsReviewed,
  nextDecisionFieldKey,
  previousDecisionFieldKey,
  canApprove,
  isApproving,
  approvalLabel,
  applyStructuredChoice,
  autoSizeReviewTextarea,
  toggleFieldReviewed,
  handleApproveCurrentLetter,
  focusPreviousDecision,
  focusNextDecision,
  compileSummaryHere,
  generationFieldCount,
  generationConfidence,
  cclUnresolvedCount,
  ptResultHere,
  compiledAtHere,
}: CclReviewModalProps) {
  return (
    <div
      onClick={handleCclLetterBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30000,
        background: 'rgba(0, 3, 25, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: isMobileReview ? '0' : '20px',
        boxSizing: 'border-box',
        animation: 'opsDashFadeIn 0.2s ease both',
        fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="ccl-review-modal-shell"
        style={{
          position: 'relative',
          width: isMobileReview ? '100%' : 'min(1280px, 100%)',
          height: '100%',
          maxHeight: isMobileReview ? '100vh' : 'calc(100vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(6, 23, 51, 0.98)',
          border: '1px solid rgba(135, 243, 243, 0.12)',
          boxShadow: 'var(--shadow-overlay-lg)',
          animation: 'opsDashScaleIn 0.24s ease both',
          overflow: 'hidden',
          borderRadius: isMobileReview ? 0 : 2,
          '--text-primary': '#f3f4f6',
          '--text-body': '#d1d5db',
          '--text-secondary': '#d1d5db',
          '--text-muted': '#A0A0A0',
          '--text-accent': colours.accent,
        } as React.CSSProperties}
      >
        <style>{`
          .ccl-review-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(100, 110, 120, 0.5) rgba(0, 0, 0, 0.06);
          }
          .ccl-review-scroll::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          .ccl-review-scroll::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.06);
          }
          .ccl-review-scroll::-webkit-scrollbar-thumb {
            background: rgba(100, 110, 120, 0.5);
            border: 2px solid rgba(213, 216, 220, 0.5);
          }
          .ccl-review-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(80, 90, 100, 0.65);
          }
        `}</style>

        {approvalOverlay}
        <style>{`@keyframes cclApprovalSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobileReview ? '12px 14px' : '14px 18px', borderBottom: '1px solid rgba(135, 243, 243, 0.08)', flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobileReview ? 12 : 11, fontWeight: 700, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {headerMatterLabel}
              <span style={{ color: colours.subtleGrey, fontWeight: 500 }}> · {headerClientName}</span>
            </div>

            <div style={{ marginTop: 5, fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
              {headerStatusText}
            </div>
          </div>

          <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#A0A0A0', whiteSpace: 'nowrap' }}>
            {`Page ${previewCurrentPage} of ${Math.max(previewTotalPages, 1)}`}
          </div>
          <button
            type="button"
            onClick={closeCclLetterModal}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.35)',
              cursor: 'pointer',
              padding: '2px 4px',
              fontSize: 16,
              lineHeight: 1,
            }}
          >×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: useIntroPreviewLayout ? introShellGrid : reviewShellGrid, flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <div
              className="ccl-review-scroll"
              ref={cclReviewPreviewRefCallback}
              onScroll={useIntroPreviewLayout ? syncIntroPreviewProgress : syncVisibleReviewGroup}
              style={{
                overflow: 'auto',
                padding: isMobileReview ? 0 : `0 ${previewFramePaddingX}px`,
                paddingBottom: useIntroPreviewLayout ? 0 : previewBottomPadding,
                scrollbarGutter: 'stable',
                background: colours.grey,
                height: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  position: isMobileReview ? 'static' : 'relative',
                  width: previewScaledWidth,
                  maxWidth: isMobileReview ? previewDocumentMaxWidth : previewScaledWidth,
                  minHeight: isMobileReview ? 'calc(100% - 52px)' : (previewScaledHeight || previewFallbackHeight),
                  margin: isMobileReview ? '0' : '0 auto',
                  overflow: isMobileReview ? 'visible' : 'hidden',
                }}>
                  <div
                    ref={cclReviewPageRefCallback}
                    data-ccl-page-container
                    style={{
                      position: isMobileReview ? 'static' : 'absolute',
                      top: isMobileReview ? undefined : 0,
                      left: isMobileReview ? undefined : 0,
                      width: isMobileReview ? '100%' : 794,
                      maxWidth: isMobileReview ? previewDocumentMaxWidth : undefined,
                      margin: 0,
                      padding: useIntroPreviewLayout
                        ? (isMobileReview ? '18px 14px 20px' : '30px 28px 34px')
                        : (isMobileReview ? '28px 24px 28px' : '24px 0 40px'),
                      color: colours.darkBlue,
                      boxSizing: 'border-box',
                      fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                      fontSize: isMobileReview ? 14 : previewDesktopFontSize,
                      lineHeight: isMobileReview ? 1.8 : previewDesktopLineHeight,
                      background: isMobileReview ? colours.grey : 'transparent',
                      minHeight: isMobileReview ? 'calc(100% - 52px)' : 'auto',
                      transform: !isMobileReview && cclPreviewZoom < 1 ? `scale(${cclPreviewZoom})` : undefined,
                      transformOrigin: !isMobileReview ? 'top left' : undefined,
                      opacity: previewShellReady ? 1 : 0,
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    {showSetupInDefaultView ? (
                      <DocumentRenderer
                        template={introPreviewTemplate}
                        fieldValues={setupDisplayFields}
                        interactiveFieldKeys={[]}
                        activeFieldKey={setupActiveFieldKey}
                        placeholderLabels={placeholderLabels}
                        fieldStates={previewFieldStates}
                        fieldElementRefs={cclReviewFieldElementRefs}
                        editableFieldKey={null}
                        onFieldValueChange={undefined}
                        onFieldClick={undefined}
                        rootRef={cclRendererRootRef}
                        pageBreaks={isMobileReview ? undefined : cclIntroPageBreaks}
                        totalPages={cclIntroTotalPages}
                        currentPageNumber={previewCurrentPage}
                        hoveredPageNumber={cclHoveredPreviewPage}
                        contentPaddingX={previewDocumentPaddingX}
                        contentPaddingY={isMobileReview ? { top: 26, bottom: 44 } : { top: 42, bottom: 84 }}
                        firstPageHeader={previewFirstPageHeader}
                        firstPageFooter={previewFirstPageFooter}
                      />
                    ) : showReviewIntro ? (
                      <DocumentRenderer
                        template={introPreviewTemplate}
                        fieldValues={structuredReviewFields}
                        interactiveFieldKeys={[]}
                        activeFieldKey={null}
                        placeholderLabels={placeholderLabels}
                        fieldStates={{}}
                        fieldElementRefs={cclReviewFieldElementRefs}
                        editableFieldKey={null}
                        onFieldValueChange={undefined}
                        onFieldClick={undefined}
                        rootRef={cclRendererRootRef}
                        pageBreaks={isMobileReview ? undefined : cclIntroPageBreaks}
                        totalPages={cclIntroTotalPages}
                        currentPageNumber={previewCurrentPage}
                        hoveredPageNumber={cclHoveredPreviewPage}
                        contentPaddingX={previewDocumentPaddingX}
                        contentPaddingY={isMobileReview ? { top: 26, bottom: 44 } : { top: 42, bottom: 84 }}
                        firstPageHeader={previewFirstPageHeader}
                        firstPageFooter={previewFirstPageFooter}
                      />
                    ) : (
                      <DocumentRenderer
                        template={rawPreviewTemplate}
                        fieldValues={structuredPreviewFields}
                        interactiveFieldKeys={allClickableFieldKeys}
                        activeFieldKey={selectedFieldKey}
                        placeholderLabels={placeholderLabels}
                        fieldStates={previewFieldStates}
                        fieldElementRefs={cclReviewFieldElementRefs}
                        editableFieldKey={structuredChoiceConfig ? null : selectedFieldKey}
                        onFieldValueChange={!structuredChoiceConfig ? (_fieldKey, value) => applySelectedFieldValue(value) : undefined}
                        onFieldClick={(fieldKey) => setFocusedReviewField(fieldKey === selectedFieldKey ? null : fieldKey)}
                        hoveredFieldKey={cclHoveredCrossKey}
                        onFieldHover={setCclHoveredCrossKey}
                        rootRef={cclRendererRootRef}
                        pageBreaks={isMobileReview ? undefined : cclPageBreaks}
                        totalPages={cclTotalPages}
                        currentPageNumber={previewCurrentPage}
                        hoveredPageNumber={cclHoveredPreviewPage}
                        contentPaddingX={previewDocumentPaddingX}
                        contentPaddingY={isMobileReview ? undefined : { top: 48, bottom: 84 }}
                        firstPageHeader={previewFirstPageHeader}
                        firstPageFooter={previewFirstPageFooter}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {(showReviewIntro || showSetupInDefaultView || loadingReviewContext) && (
            <div style={{
              borderLeft: isMobileReview ? 'none' : '1px solid rgba(135, 243, 243, 0.08)',
              borderTop: isMobileReview ? '1px solid rgba(135, 243, 243, 0.12)' : 'none',
              background: 'rgba(6, 23, 51, 0.98)',
              padding: isMobileReview ? '22px 18px 20px' : '34px 32px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 18,
              minWidth: 0,
            }}>
              <CclReviewSetupPanel
                isMobileReview={isMobileReview}
                showSetupInDefaultView={showSetupInDefaultView}
                loadingReviewContext={loadingReviewContext}
                visibleReviewFieldCount={visibleReviewFieldCount}
                setupHeaderTitle={setupHeaderTitle}
                setupHeaderBody={setupHeaderBody}
                introBody={introBody}
                setupFlowStrip={setupFlowStrip}
                launchDraftError={launchDraftError}
                launchPressureErrored={launchPressureErrored}
                pressureTestError={cclPressureTestError}
                onRetryDraftFetch={retryDraftFetch}
                draftFetchError={draftFetchError}
                launchPressureRunning={launchPressureRunning}
                launchIsStreamingNow={launchIsStreamingNow}
                launchTraceLoading={launchTraceLoading}
                launchHasAiData={launchHasAiData}
                aiDurationMs={aiDurationMs}
              />

              {!showSetupInDefaultView && (
                <CclReviewLandingPanel
                  isMobileReview={isMobileReview}
                  showNoAiReviewContext={noAiReviewContext}
                  showSummaryLanding={showSummaryLanding}
                  isGeneratingAiReview={isGeneratingAiReview}
                  onGenerateAiReview={onGenerateAiReview}
                  visibleReviewFieldCount={visibleReviewFieldCount}
                  onBeginReview={beginReviewFromIntro}
                  overrideStartAgainLink={overrideStartAgainLink}
                  overrideExpandedCard={overrideExpandedCard}
                />
              )}
            </div>
          )}

          {shouldShowReviewRail && (
            <div
              style={{
                borderLeft: !isMobileReview ? '1px solid rgba(135, 243, 243, 0.08)' : 'none',
                borderTop: isMobileReview ? '1px solid rgba(135, 243, 243, 0.12)' : 'none',
                overflow: 'auto',
                scrollbarGutter: 'stable',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(2, 6, 23, 0.96)',
                position: isMobileReview ? 'absolute' : 'relative',
                left: isMobileReview ? 0 : 'auto',
                right: isMobileReview ? 0 : 'auto',
                bottom: isMobileReview ? 0 : 'auto',
                height: reviewPaneHeight,
                maxHeight: isMobileReview ? '50vh' : 'none',
                boxShadow: isMobileReview ? '0 -16px 32px rgba(0, 3, 25, 0.42)' : 'none',
              }}
              className="ccl-review-scroll"
            >
              <div key={`rail-header:${reviewRailContentKey}`} style={{ padding: isMobileReview ? '16px 16px 14px' : '22px 24px 18px', flexShrink: 0, animation: 'opsDashFadeIn 0.24s ease both' }}>
                {isMobileReview && (
                  <div style={{ width: 44, height: 4, background: 'rgba(148,163,184,0.42)', borderRadius: 999, margin: '0 auto 10px' }} />
                )}
                {selectedFieldKey && selectedFieldMeta ? (
                  <CclReviewFieldHeader
                    isMobile={isMobileReview}
                    currentDecisionNumber={currentDecisionNumber}
                    totalDecisions={selectedFieldSequenceCount || visibleReviewFieldCount}
                    fieldType={reviewFieldTypeMap[selectedFieldKey] || null}
                    fieldLabel={selectedFieldMeta.label}
                    fieldGroup={selectedFieldMeta.group}
                    decisionReason={selectedFieldDecisionReason}
                    pressureTest={selectedFieldPressureTest}
                    pressureTestSources={selectedFieldPressureTestResponse?.dataSources}
                    pressureTestTraceId={selectedFieldPressureTestResponse?.aiTraceId ?? null}
                    pressureTestPromptVersion={selectedFieldPressureTestResponse?.promptVersion || undefined}
                  />
                ) : (
                  <>
                    <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      CCL Review
                    </div>
                    <div style={{ fontSize: isMobileReview ? 15 : 14, fontWeight: 700, color: '#f3f4f6', marginTop: 6, lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{showSetupInDefaultView ? setupHeaderTitle : aiState.title}</span>
                    </div>
                    <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, marginTop: 6, lineHeight: 1.45 }}>
                      {showSetupInDefaultView ? setupHeaderBody : aiState.detail}
                    </div>
                    {showSetupInDefaultView && aiDurationMs && (
                      <div style={{ fontSize: 10, color: colours.subtleGrey, marginTop: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Draft prepared in {(aiDurationMs / 1000).toFixed(1)}s
                      </div>
                    )}
                  </>
                )}
              </div>

              {visibleReviewFieldCount > 0 && !loadingReviewContext && !selectedFieldKey && !showSetupInDefaultView && (
                <div style={{ padding: '0 24px 12px', display: 'grid', gap: 6, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: isMobileReview ? 11 : 10.5, color: colours.subtleGrey, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Progress
                    </span>
                    <span style={{ fontSize: isMobileReview ? 11 : 10.5, color: reviewedDecisionCount === visibleReviewFieldCount ? colours.green : '#d1d5db', fontWeight: 700 }}>
                      {reviewedDecisionCount}/{visibleReviewFieldCount}
                    </span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${selectionProgressPercent}%`, height: '100%', background: reviewedDecisionCount === visibleReviewFieldCount ? colours.green : colours.accent, transition: 'width 0.18s ease' }} />
                  </div>
                </div>
              )}

              <div key={`rail-body:${reviewRailContentKey}`} style={{ padding: isMobileReview ? '14px 16px' : '14px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, alignContent: 'start', animation: 'opsDashFadeIn 0.24s ease both' }}>
                {showSetupInDefaultView && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {launchFlowStrip}
                    {(launchDraftError || launchPressureErrored || cclPressureTestError) && (
                      <div style={{ border: '1px solid rgba(214, 85, 65, 0.28)', background: 'rgba(214, 85, 65, 0.08)', padding: '9px 10px', fontSize: isMobileReview ? 11 : 10, color: colours.cta, lineHeight: 1.5 }}>
                        {launchDraftError || cclPressureTestError}
                      </div>
                    )}
                    {!!retryDraftFetch && (
                      <button
                        type="button"
                        onClick={retryDraftFetch}
                        style={{
                          justifySelf: 'start',
                          border: '1px solid rgba(135, 243, 243, 0.28)',
                          background: 'rgba(135, 243, 243, 0.08)',
                          color: '#f3f4f6',
                          padding: '8px 10px',
                          fontSize: isMobileReview ? 11.5 : 10.5,
                          fontWeight: 700,
                          fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                          cursor: 'pointer',
                        }}
                      >
                        Retry draft fetch
                      </button>
                    )}
                  </div>
                )}

                {!showSetupInDefaultView && (
                  <>
                    {ptRunningHere && !selectedFieldKey && (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {launchFlowStrip}
                        {cclPressureTestError && (
                          <div style={{ border: '1px solid rgba(214, 85, 65, 0.28)', background: 'rgba(214, 85, 65, 0.08)', padding: '9px 10px', fontSize: isMobileReview ? 11 : 10, color: colours.cta, lineHeight: 1.5 }}>
                            {cclPressureTestError}
                          </div>
                        )}
                      </div>
                    )}

                    {showReviewRailSkeleton && (
                      <div style={{ padding: 0, display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.22s ease 0.03s both' }}>
                        {isStreamingNow ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 16, height: 16, flexShrink: 0, border: '2px solid rgba(135, 243, 243, 0.12)', borderTopColor: colours.accent, borderRadius: '50%', animation: 'helix-spin 0.8s linear infinite' }} />
                              <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, fontWeight: 600 }}>
                                {aiGeneratedCount > 0
                                  ? `${aiGeneratedCount} field${aiGeneratedCount === 1 ? '' : 's'} generated`
                                  : (aiStatusMessage || 'Loading matter context…')}
                              </div>
                            </div>
                            <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                              <div style={{ width: '50%', height: '100%', background: `linear-gradient(90deg, transparent, ${colours.accent}, transparent)`, animation: 'cclLoadBar 1.8s ease-in-out infinite' }} />
                            </div>
                          </>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 16, height: 16, flexShrink: 0, border: '2px solid rgba(135, 243, 243, 0.12)', borderTopColor: colours.accent, borderRadius: '50%', animation: 'helix-spin 0.8s linear infinite' }} />
                            <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.subtleGrey, fontWeight: 600 }}>
                              Loading saved review…
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <CclReviewRailLanding
                      isMobileReview={isMobileReview}
                      showNoAiReviewContext={noAiReviewContext}
                      showSummaryLanding={showSummaryLanding}
                      isGeneratingAiReview={isGeneratingAiReview}
                      onGenerateAiReview={onGenerateAiReview}
                      devMetaStrip={devMetaStrip}
                      totalAiFields={totalAiFields}
                      aiDurationMs={aiDurationMs}
                      confidenceBreakdown={confidenceBreakdown}
                      summaryReviewMessage={summaryLandingReviewMessage}
                      ptPending={ptPending}
                      dataSources={dataSources}
                      onBeginReview={beginReviewFromIntro}
                      beginReviewLabel={summaryLandingBeginLabel}
                    />

                    {showQueuedReviewLanding && (
                      <div style={{ display: 'grid', gap: 12, animation: 'opsDashFadeIn 0.24s ease both' }}>
                        {devMetaStrip}
                        <div style={{ display: 'grid', gap: 5 }}>
                          <div style={{ fontSize: isMobileReview ? 10 : 9, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                            Remaining Points
                          </div>
                          <div style={{ fontSize: isMobileReview ? 15 : 14, fontWeight: 700, color: '#f3f4f6', lineHeight: 1.3 }}>
                            {visibleReviewFieldCount} point{visibleReviewFieldCount === 1 ? '' : 's'} left
                          </div>
                          {setWordingCount > 0 && verifyCount > 0 ? (
                            <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
                              {setWordingCount} to set, {verifyCount} surfaced by Safety Net for review.
                            </div>
                          ) : verifyCount > 0 ? (
                            <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
                              {verifyCount} field{verifyCount === 1 ? '' : 's'} surfaced by Safety Net for review.
                            </div>
                          ) : (
                            <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
                              Open the next point when ready, or click straight into the letter.
                            </div>
                          )}
                          {overrideSummaryCard}
                          {ptPending && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <div style={{ width: 12, height: 12, border: '1.5px solid rgba(135,243,243,0.15)', borderTopColor: colours.accent, borderRadius: '50%', animation: 'helix-spin 0.8s linear infinite', flexShrink: 0 }} />
                              <span style={{ fontSize: isMobileReview ? 10 : 9.5, color: colours.subtleGrey }}>Safety Net verifying…</span>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {nextQueuedFieldKey && (
                            <button
                              type="button"
                              onClick={() => setFocusedReviewField(nextQueuedFieldKey)}
                              style={{
                                fontSize: isMobileReview ? 13 : 12,
                                fontWeight: 700,
                                color: '#061733',
                                background: colours.accent,
                                padding: isMobileReview ? '14px 14px' : '11px 14px',
                                cursor: 'pointer',
                                textAlign: 'center',
                                border: 'none',
                                minHeight: isMobileReview ? 48 : 'auto',
                              }}
                            >
                              Open first point
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setFocusedReviewField(null)}
                            style={{
                              fontSize: isMobileReview ? 13 : 12,
                              fontWeight: 700,
                              color: '#d1d5db',
                              background: 'transparent',
                              padding: isMobileReview ? '14px 14px' : '11px 14px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              border: '1px solid rgba(255,255,255,0.12)',
                              minHeight: isMobileReview ? 48 : 'auto',
                            }}
                          >
                            Stay on full letter
                          </button>
                        </div>
                        {overrideStartAgainLink && (
                          <div style={{ display: 'flex', justifyContent: 'center', marginTop: -2 }}>
                            {overrideStartAgainLink}
                          </div>
                        )}
                        {!ptResultHere && ptCanRun && !ptPending && (
                          <div style={{ fontSize: isMobileReview ? 10 : 9.5, color: colours.subtleGrey, lineHeight: 1.5 }}>
                            Run Safety Net if you want a second-pass evidence check before sign-off.
                          </div>
                        )}
                      </div>
                    )}

                    {noClarificationsQueued && (
                      <div style={{ display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.2s ease 0.03s both' }}>
                        {(compileSummaryHere || generationFieldCount > 0 || ptResultHere) && (
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Pipeline Insight
                            </div>
                            <div style={{ display: 'grid', gap: 8 }}>
                              {compileSummaryHere && (
                                <div style={{ padding: '8px 10px', border: '1px solid rgba(135,243,243,0.18)', background: 'rgba(135,243,243,0.06)' }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: colours.accent }}>
                                    Compiled {compileSummaryHere.readyCount || 0}/{compileSummaryHere.sourceCount || 0} evidence sources ready
                                  </div>
                                  <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 3 }}>
                                    {compileSummaryHere.limitedCount || 0} limited, {compileSummaryHere.missingCount || 0} missing, {compileSummaryHere.contextFieldCount || 0} context fields, {compileSummaryHere.snippetCount || 0} evidence snippets.
                                    {compiledAtHere ? ` Compiled ${new Date(compiledAtHere).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}
                                  </div>
                                </div>
                              )}
                              {generationFieldCount > 0 && (
                                <div style={{ padding: '8px 10px', border: '1px solid rgba(135,243,243,0.12)', background: 'rgba(255,255,255,0.02)' }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#d1d5db' }}>
                                    Generated {generationFieldCount} field{generationFieldCount === 1 ? '' : 's'}
                                  </div>
                                  <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 3 }}>
                                    Confidence {generationConfidence || 'unknown'}{typeof cclUnresolvedCount === 'number' ? `, ${cclUnresolvedCount} unresolved placeholder${cclUnresolvedCount === 1 ? '' : 's'}.` : '.'}
                                  </div>
                                </div>
                              )}
                              {ptResultHere && !ptRunningHere && (
                                <div style={{ padding: '8px 10px', border: `1px solid ${ptResultHere.flaggedCount > 0 ? colours.orange : colours.green}`, background: 'rgba(255,255,255,0.02)' }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: ptResultHere.flaggedCount > 0 ? colours.orange : colours.green }}>
                                    Pressure tested {ptResultHere.totalFields} field{ptResultHere.totalFields === 1 ? '' : 's'}
                                  </div>
                                  <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 3 }}>
                                    {ptResultHere.flaggedCount} surfaced for fee-earner review against source evidence.
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {ptRunningHere ? 'Safety Net Status' : 'Review Status'}
                        </div>
                        <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#d1d5db', lineHeight: 1.45, fontWeight: 700 }}>
                          {ptRunningHere ? 'Checking the draft against source evidence now.' : 'No review points are waiting.'}
                        </div>
                        <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                          {ptRunningHere
                            ? 'The pipeline above is working through each generated field against source evidence. Keep the formatted letter open on the left while the check completes.'
                            : ptResultHere
                              ? ptResultHere.flaggedCount > 0
                                ? `Safety Net checked ${ptResultHere.totalFields} fields and surfaced ${ptResultHere.flaggedCount} for review. The formatted letter stays open on the left.`
                                : `Safety Net checked ${ptResultHere.totalFields} fields and found no further review points. The formatted letter is ready on the left.`
                              : 'Review the letter on the left, or run Safety Net if you want a second-pass evidence check before sign-off.'}
                        </div>
                        {ptCanRun && (
                          <button
                            type="button"
                            onClick={onRunPressureTest}
                            style={{
                              fontSize: isMobileReview ? 13 : 12,
                              fontWeight: 700,
                              color: '#061733',
                              background: colours.accent,
                              padding: isMobileReview ? '14px 14px' : '11px 14px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              border: 'none',
                              minHeight: isMobileReview ? 48 : 'auto',
                            }}
                          >
                            Run Safety Net
                          </button>
                        )}
                        {ptResultHere && !ptRunningHere && (() => {
                          const ptScores = Object.values(ptResultHere.fieldScores);
                          const ptAvg = ptScores.length > 0 ? ptScores.reduce((sum, score) => sum + score.score, 0) / ptScores.length : 0;
                          const ptRounded = Math.round(ptAvg * 10) / 10;
                          const ptColour = ptRounded >= 8 ? colours.green : ptRounded >= 5 ? colours.orange : colours.cta;
                          return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${ptColour}`, color: ptColour, fontSize: 10.5, fontWeight: 700 }}>
                                Safety Net {ptRounded}/10
                              </div>
                              {ptResultHere.flaggedCount > 0 && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${colours.orange}`, color: colours.orange, fontSize: 10.5, fontWeight: 600 }}>
                                  {ptResultHere.flaggedCount} flagged
                                </div>
                              )}
                              {ptResultHere.dataSources?.length > 0 && (
                                <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45, marginTop: 2, width: '100%' }}>
                                  Sources: {ptResultHere.dataSources.join(', ')}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {selectedFieldKey && selectedFieldMeta && (
                  <div className="ccl-review-decision-stage" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', marginBlock: 'auto', paddingBlock: isMobileReview ? 8 : 16 }}>
                    {ptRunningHere && (
                      <div
                        role="status"
                        aria-live="polite"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          border: `1px solid ${colours.orange}`,
                          background: 'rgba(255, 140, 0, 0.08)',
                          fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                        }}
                      >
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            flexShrink: 0,
                            border: `2px solid rgba(255, 140, 0, 0.25)`,
                            borderTopColor: colours.orange,
                            borderRadius: '50%',
                            animation: 'helix-spin 0.8s linear infinite',
                          }}
                          aria-hidden="true"
                        />
                        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                          <div style={{ fontSize: isMobileReview ? 11 : 10.5, fontWeight: 700, color: colours.orange, letterSpacing: '0.02em' }}>
                            Pressure test still running
                          </div>
                          <div style={{ fontSize: isMobileReview ? 11 : 10, color: '#d1d5db', lineHeight: 1.45 }}>
                            New review points may surface and the count may change. Hold sign-off until the check finishes.
                          </div>
                        </div>
                      </div>
                    )}
                    <CclReviewQueueStrip
                      isMobile={isMobileReview}
                      items={queueStripItems}
                      currentKey={selectedFieldKey}
                      onJump={jumpToDecision}
                      hoveredFieldKey={cclHoveredCrossKey}
                      onHover={setCclHoveredCrossKey}
                    />
                    <CclReviewDecisionPanel
                      isMobile={isMobileReview}
                      fieldLabel={selectedFieldMeta.label}
                      choiceConfig={structuredChoiceConfig}
                      selectedFieldOutput={selectedFieldOutput}
                      selectedFieldIsReviewed={selectedFieldIsReviewed}
                      hasNextDecision={!!nextDecisionFieldKey}
                      hasPreviousDecision={!!previousDecisionFieldKey}
                      isFirstDecision={currentDecisionNumber <= 1}
                      canApprove={canApprove && !nextDecisionFieldKey}
                      isApproving={isApproving}
                      approvalLabel={approvalLabel}
                      onSelectChoice={applyStructuredChoice}
                      onTextChange={(value, element) => {
                        autoSizeReviewTextarea(element);
                        applySelectedFieldValue(value);
                      }}
                      textareaRef={autoSizeReviewTextarea}
                      onToggleReviewed={() => {
                        if (!selectedFieldKey) return;
                        toggleFieldReviewed(selectedFieldKey);
                        if (!selectedFieldIsReviewed) focusNextDecision();
                      }}
                      onApprove={handleApproveCurrentLetter}
                      onBack={() => setFocusedReviewField(null)}
                      onPrevious={focusPreviousDecision}
                      onNext={focusNextDecision}
                    />
                  </div>
                )}
              </div>

              {devToolsDock}

              <div style={{ padding: isMobileReview ? '14px 16px max(16px, env(safe-area-inset-bottom))' : '14px 24px 18px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'grid', gap: 10, flexShrink: 0, background: 'rgba(2, 6, 23, 0.98)', position: 'sticky', bottom: 0, animation: 'opsDashFadeIn 0.2s ease 0.24s both' }}>
                {!selectedFieldKey && (
                  <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
                    {loadingReviewContext
                      ? 'Generating review context. The draft will appear as fields are produced.'
                      : showSummaryLanding
                        ? 'Review the summary above, then open the guided review when you are ready.'
                        : noAiReviewContext
                          ? 'Use Generate AI review if you want guided checking for this draft. Otherwise you can review the letter manually.'
                          : noClarificationsQueued
                            ? 'No further side-panel action is needed unless you want to approve the current preview letter.'
                            : 'Stay in this workspace while you work through the guided review steps.'}
                  </div>
                )}
                {!selectedFieldKey && noClarificationsQueued && canApprove && (
                  <button
                    type="button"
                    style={{ fontSize: isMobileReview ? 13 : 12, fontWeight: 700, color: colours.dark.text, background: colours.green, padding: isMobileReview ? '14px 14px' : '11px 14px', cursor: isApproving ? 'wait' : 'pointer', textAlign: 'center', border: 'none', minHeight: isMobileReview ? 48 : 'auto', opacity: isApproving ? 0.7 : 1 }}
                    onClick={handleApproveCurrentLetter}
                    disabled={isApproving}
                  >
                    {approvalLabel}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}