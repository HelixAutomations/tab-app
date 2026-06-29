/**
 * PipelineCell — renders the 7-stage pipeline carousel in a prospect row.
 *
 * Extracted from the ~742-line IIFE in Enquiries.tsx.
 * Handles POC/claim, pitch, instruction, EID, payment, risk, matter chips.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { format } from 'date-fns';
import { colours } from '../../../app/styles/colours';
import { MiniPipelineChip, renderPipelineIcon } from './pipeline';
import type { Enquiry } from '../../../app/functionality/types';
import type { EnquiryEnrichmentData } from '../../../app/functionality/enquiryEnrichment';
import type { ContactVisibilityEntry } from '../../../app/functionality/pipelineContactData';
import type { WorkbenchItem } from '../../../utils/workbenchTypes';
import { deriveProspectJourneyState } from '../../../utils/workbenchJourneyState';
import type { RowPipelineHandlers, RowDataDeps } from './rowTypes';

export interface PipelineCellProps {
  item: Enquiry;
  isDarkMode: boolean;
  activeState: '' | 'Claimed' | 'Claimable' | 'Triaged';
  enrichmentData: EnquiryEnrichmentData | undefined;
  inlineWorkbenchItem: WorkbenchItem | undefined;
  pipelineNeedsCarousel: boolean;
  visiblePipelineChipCount: number;
  PIPELINE_CHIP_MIN_WIDTH_PX: number;
  contactName: string;
  pocLower: string;
  isFromInstructions: boolean;
  currentUserEmail: string;
  handlers: RowPipelineHandlers;
  dataDeps: Pick<RowDataDeps, 'claimerMap' | 'isUnclaimedPoc' | 'combineDateAndTime'>;
  contactVisibility?: ContactVisibilityEntry;
}

const getPocInitialsLocal = (
  pocEmail: string | null | undefined,
  claimerMap: Record<string, { Initials?: string; [k: string]: unknown }>,
): string => {
  if (!pocEmail || pocEmail.toLowerCase() === 'team@helix-law.com') return 'T';
  const claimer = claimerMap[pocEmail.toLowerCase()];
  if (claimer?.Initials) return claimer.Initials;
  const emailPart = pocEmail.split('@')[0];
  if (emailPart.includes('.')) {
    const parts = emailPart.split('.');
    return parts.map(p => p[0]?.toUpperCase()).join('').slice(0, 2);
  }
  return emailPart.slice(0, 2).toUpperCase();
};

const PipelineCell: React.FC<PipelineCellProps> = ({
  item,
  isDarkMode,
  activeState,
  enrichmentData,
  inlineWorkbenchItem,
  pipelineNeedsCarousel,
  visiblePipelineChipCount,
  PIPELINE_CHIP_MIN_WIDTH_PX,
  contactName,
  pocLower,
  isFromInstructions,
  currentUserEmail,
  handlers,
  dataDeps,
  contactVisibility,
}) => {
  const {
    showPipelineHover,
    movePipelineHover,
    hidePipelineHover,
    openEnquiryWorkbench,
    advancePipelineScroll,
    getPipelineScrollOffset,
    handleReassignClick,
    renderClaimPromptChip,
    getScenarioColor,
  } = handlers;
  const { claimerMap, isUnclaimedPoc, combineDateAndTime } = dataDeps;
  const [showReassignChevron, setShowReassignChevron] = useState(false);
  const journeyState = useMemo(() => deriveProspectJourneyState({
    workbenchItem: inlineWorkbenchItem,
    enquiry: item as any,
    enrichmentData: enrichmentData as any,
  }), [enrichmentData, inlineWorkbenchItem, item]);

  const isV2Enquiry = (item as any).__sourceType === 'new' || (item as any).source === 'instructions';
  const teamsData = enrichmentData?.teamsData as any;
  const teamsTime = isV2Enquiry && teamsData
    ? (teamsData.MessageTimestamp || teamsData.CreatedAt || (teamsData.CreatedAtMs ? new Date(teamsData.CreatedAtMs).toISOString() : null))
    : null;
  const pitchData = enrichmentData?.pitchData as any;
  const pitchedDate = pitchData?.PitchedDate || pitchData?.pitchedDate || pitchData?.pitched_date || '';
  const pitchedTime = pitchData?.PitchedTime || pitchData?.pitchedTime || pitchData?.pitched_time || '';
  const pitchedBy = pitchData?.PitchedBy || pitchData?.pitchedBy || pitchData?.pitched_by || '';
  const pitchScenarioId = pitchData?.scenarioId || pitchData?.scenario_id || '';
  const pitchMatterRef = pitchData?.displayNumber || pitchData?.display_number || '';
  const pitchedDateParsed = combineDateAndTime(pitchedDate, pitchedTime);
  const inst = inlineWorkbenchItem?.instruction;
  const deal = inlineWorkbenchItem?.deal;
  const dealStatus = (deal?.Status ?? deal?.status ?? '').toLowerCase();
  const inferredPitchFromWorkbench = journeyState.hasPitchEvidence;
  const pitchChipLabel = pitchedDateParsed
    ? `${format(pitchedDateParsed, 'd MMM')} ${format(pitchedDateParsed, 'HH:mm')}`
    : inferredPitchFromWorkbench
      ? 'Sent'
    : '';
  const pitchedStamp = pitchedDateParsed
    ? `Pitched ${format(pitchedDateParsed, 'dd MMM HH:mm')}`
    : inferredPitchFromWorkbench
      ? 'Pitch linked'
    : 'Pitched';

  // Legacy detection
  const hasV2Infrastructure = (item as any).__sourceType === 'new' ||
    (item as any).source === 'instructions' ||
    (item as any).claim ||
    (item as any).stage ||
    enrichmentData?.teamsData;
  const isDefinitelyLegacy = !hasV2Infrastructure;
  const pocDisplayName = item.Point_of_Contact || (item as any).poc || '';
  const hasClaimerStage = !!pocDisplayName;
  const workbenchPayments = Array.isArray(inlineWorkbenchItem?.payments) ? inlineWorkbenchItem?.payments ?? [] : [];
  const workbenchMatters = Array.isArray(inlineWorkbenchItem?.matters) ? inlineWorkbenchItem?.matters ?? [] : [];
  const workbenchInstruction = inlineWorkbenchItem?.instruction ?? null;
  const hasImmediatePipelineState = Boolean(
    hasClaimerStage ||
    deal ||
    inst ||
    inlineWorkbenchItem?.eid ||
    inlineWorkbenchItem?.risk ||
    workbenchPayments.length > 0 ||
    workbenchMatters.length > 0
  );

  const showTeamsStage = isV2Enquiry && !!teamsData;
  const showLegacyPlaceholder = isDefinitelyLegacy;
  const enrichmentWasProcessed = enrichmentData && enrichmentData.enquiryId;
  const showLoadingState = isV2Enquiry && !enrichmentWasProcessed && !isDefinitelyLegacy && !teamsTime && !hasImmediatePipelineState;
  // Timeout: after 15s of loading, show muted dashes instead of infinite skeleton
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!showLoadingState) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [showLoadingState]);

  // POC/claim state
  const isTeamInboxPoc = isUnclaimedPoc(pocLower);
  const showClaimer = hasClaimerStage && activeState !== 'Triaged' && !isTeamInboxPoc;
  const claimerInfo = claimerMap[pocLower];
  const claimerLabel = claimerInfo?.Initials || getPocInitialsLocal(pocDisplayName, claimerMap);
  const showPitch = journeyState.hasPitchEvidence;
  const pitchColor = getScenarioColor(enrichmentData?.pitchData?.scenarioId);
  const showPitchCTA = showClaimer && !isTeamInboxPoc && enrichmentWasProcessed && !showPitch;
  const isPitchNextAction = (showTeamsStage || showClaimer) && !showPitch;

  const hasResolvedWorkbench = Boolean(inlineWorkbenchItem);
  const hasResolvedEid = Boolean(inlineWorkbenchItem?.eid);
  const hasResolvedPayment = workbenchPayments.length > 0;
  const hasResolvedRisk = Boolean(inlineWorkbenchItem?.risk);
  const hasResolvedMatter = Boolean(workbenchInstruction?.MatterId ?? workbenchInstruction?.matterId) || workbenchMatters.length > 0;

  // Carousel state for this row
  const pipelineOffset = getPipelineScrollOffset(item.ID);
  const visibleEnd = pipelineOffset + visiblePipelineChipCount;
  const hasMoreChips = pipelineNeedsCarousel && pipelineOffset < 7 - visiblePipelineChipCount;
  const isChipVisible = (chipIndex: number) =>
    !pipelineNeedsCarousel || (chipIndex >= pipelineOffset && chipIndex < visibleEnd);

  const gridCols = `repeat(${pipelineNeedsCarousel ? visiblePipelineChipCount : 7}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr))`;

  const enquiryTeamsLink = (enrichmentData?.teamsData as any)?.teamsLink as string | undefined;
  const inactivePipelineColor = isDarkMode ? `${colours.subtleGrey}66` : `${colours.greyText}59`;
  const mutedTextColor = isDarkMode ? `${colours.subtleGrey}b3` : `${colours.greyText}99`;
  const navBorder = isDarkMode ? 'rgba(75, 85, 99, 0.55)' : 'rgba(160, 160, 160, 0.28)';
  const navIdleBackground = isDarkMode ? 'rgba(8, 28, 48, 0.72)' : 'rgba(244, 244, 246, 0.9)';
  const navActiveBackground = isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(54, 144, 206, 0.1)';
  const navAccent = isDarkMode ? colours.accent : colours.highlight;
  const pipelineGridPaddingRight = pipelineNeedsCarousel ? 32 : 0;

  // ─── Loading state ──────────────────────────────────────────
  if (showLoadingState) {
    return (
      <div
        style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}
        title={loadingTimedOut ? 'Enrichment data unavailable — click to retry' : 'Loading pipeline data…'}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            columnGap: 8,
            alignItems: 'center',
            width: '100%',
            minWidth: 0,
            height: '100%',
            paddingRight: pipelineGridPaddingRight,
            boxSizing: 'border-box',
          }}
        >
          {[
            { icon: 'TeamsLogo', label: 'POC' },
            { icon: 'Send', label: 'Pitch' },
            { icon: 'CheckMark', label: 'Inst' },
            { icon: 'ContactCard', label: 'ID' },
            { icon: 'CurrencyPound', label: 'Pay' },
            { icon: 'Shield', label: 'Risk' },
            { icon: 'OpenFolderHorizontal', label: 'Matter' },
          ].map((stage, i) => {
            const offset = getPipelineScrollOffset(item.ID);
            const end = offset + visiblePipelineChipCount;
            const vis = !pipelineNeedsCarousel || (i >= offset && i < end);
            if (!vis) return null;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: 22,
                  opacity: loadingTimedOut ? 0.25 : 0.55,
                }}
              >
                {loadingTimedOut ? (
                  <span style={{ fontSize: 11, color: inactivePipelineColor, fontWeight: 500 }}>–</span>
                ) : (
                  renderPipelineIcon(
                    stage.icon,
                    inactivePipelineColor,
                    14,
                  )
                )}
              </div>
            );
          })}
        </div>
        {pipelineNeedsCarousel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              advancePipelineScroll(item.ID, 7, visiblePipelineChipCount);
            }}
            title="View more stages"
            style={{
              position: 'absolute',
              top: '50%',
              right: 0,
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 22,
              padding: 0,
              border: `1px solid ${navBorder}`,
              borderRadius: 0,
              background: navActiveBackground,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              color: navAccent,
              zIndex: 1,
            }}
          >
            <Icon iconName="ChevronRight" styles={{ root: { fontSize: 12, color: 'inherit' } }} />
          </button>
        )}
      </div>
    );
  }

  // ─── Post-pitch stage data ──────────────────────────────────
  const dealHasInstruction = dealStatus !== 'pitched' && dealStatus !== '';
  const instructionRef = (inst?.InstructionRef ?? inst?.instructionRef ?? (dealHasInstruction ? (deal?.InstructionRef ?? deal?.instructionRef) : undefined)) as string | undefined;
  const instructionDateRaw =
    inst?.SubmissionDate ?? inst?.submissionDate ?? inst?.SubmissionDateTime ?? inst?.submissionDateTime ??
    inst?.InstructionDateTime ?? inst?.instructionDateTime ?? inst?.SubmittedAt ?? inst?.submittedAt ??
    inst?.InstructionDate ?? inst?.instructionDate ??
    deal?.CloseDate ?? deal?.closeDate ?? deal?.close_date;
  const instructionTimeRaw =
    inst?.SubmissionTime ?? inst?.submissionTime ?? inst?.SubmissionTimeUtc ?? inst?.submissionTimeUtc ??
    deal?.CloseTime ?? deal?.closeTime ?? deal?.close_time;
  const instructionDateParsed = combineDateAndTime(instructionDateRaw, instructionTimeRaw);
  const instructionStamp = instructionDateParsed ? format(instructionDateParsed, 'dd MMM HH:mm') : '';
  const instructionChipLabel = instructionDateParsed
    ? `${format(instructionDateParsed, 'd MMM')} ${format(instructionDateParsed, 'HH:mm')}`
    : '--';
  const instructionStage = journeyState.instructionStage || (inst?.Stage ?? inst?.stage ?? deal?.Stage ?? deal?.Status ?? deal?.status ?? '');
  const instructionServiceDesc = deal?.ServiceDescription ?? deal?.serviceDescription ?? inst?.ServiceDescription ?? '';
  const instructionAmount = deal?.Amount ?? deal?.amount ?? inst?.Amount;
  const instructionAmountText = instructionAmount && !isNaN(Number(instructionAmount))
    ? `£${Number(instructionAmount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
    : '';
  const isShellEntry = journeyState.isInstructionShell;
  const hasInstruction = journeyState.isInstructionSubmitted;

  // EID
  const identityStage = journeyState.stages.identity;
  const hasEid = journeyState.hasIdentityResult;
  const eidResult = (inlineWorkbenchItem?.eid as any)?.EIDOverallResult?.toLowerCase() ?? '';
  const eidPassed = identityStage.status === 'complete';
  const eidColor = eidPassed ? colours.green : identityStage.status === 'blocked' ? colours.orange : eidResult === 'refer' ? colours.orange : eidResult === 'review' ? colours.red : colours.highlight;
  const eidLabel = eidPassed ? 'Pass' : identityStage.status === 'blocked' ? 'Wait' : eidResult === 'refer' ? 'Refer' : eidResult === 'review' ? 'Review' : eidResult || 'ID';

  // Payment
  const payments = workbenchPayments;
  const latestPayment = payments[0] as any;
  const methodRaw = (latestPayment?.payment_method || latestPayment?.payment_type || latestPayment?.method || latestPayment?.paymentMethod || latestPayment?.PaymentMethod || '').toString().toLowerCase();
  const meta = typeof latestPayment?.metadata === 'object' ? latestPayment.metadata : {};
  const metaMethod = (meta?.payment_method || meta?.method || meta?.paymentMethod || '').toString().toLowerCase();
  const intentId = (latestPayment?.payment_intent_id || latestPayment?.paymentIntentId || '').toString();
  const intentIsBank = intentId.startsWith('bank_');
  const intentIsCard = intentId.startsWith('pi_');
  const combinedMethod = methodRaw || metaMethod || (intentIsBank ? 'bank' : intentIsCard ? 'card' : '');
  const isCardPayment = combinedMethod.includes('card') || combinedMethod.includes('stripe') || combinedMethod === 'cc' || intentIsCard;
  const isBankPayment = combinedMethod.includes('bank') || combinedMethod.includes('transfer') || combinedMethod.includes('bacs') || intentIsBank;
  const paymentStatus = (latestPayment?.payment_status || latestPayment?.paymentStatus || latestPayment?.status || latestPayment?.Status || '').toString().toLowerCase();
  const isSucceededStatus = paymentStatus === 'succeeded' || paymentStatus === 'success' || paymentStatus === 'complete' || paymentStatus === 'completed' || paymentStatus === 'paid';
  const isCardConfirmed = isCardPayment && isSucceededStatus;
  const isBankConfirmed = isBankPayment && (latestPayment?.confirmed === true || latestPayment?.Confirmed === true || paymentStatus === 'confirmed');
  const hasConfirmedPayment = isCardConfirmed || isBankConfirmed || isSucceededStatus;
  const hasPayment = payments.length > 0;
  const paymentLabel = hasConfirmedPayment ? 'Paid' : hasPayment ? (isBankPayment ? 'Pending' : '£') : '£';
  const paymentIcon = hasConfirmedPayment ? (isCardPayment ? 'PaymentCard' : 'Bank') : 'CurrencyPound';
  const paymentColor = hasConfirmedPayment ? colours.green : hasPayment ? (isBankPayment ? colours.orange : colours.blue) : colours.blue;
  const paymentTitle = hasConfirmedPayment
    ? `Paid via ${isCardPayment ? 'card' : 'bank transfer'}`
    : hasPayment
      ? (isBankPayment ? 'Bank payment awaiting confirmation' : 'Payment recorded')
      : 'No payment yet';
  const paymentAmountRaw = latestPayment?.amount ?? latestPayment?.Amount ?? latestPayment?.value ?? latestPayment?.Value;
  const paymentAmountNumber = typeof paymentAmountRaw === 'string' ? parseFloat(paymentAmountRaw) : paymentAmountRaw;
  const paymentAmount = Number.isFinite(paymentAmountNumber) ? paymentAmountNumber : null;
  const paymentAmountText = paymentAmount !== null
    ? `£${paymentAmount.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
    : null;

  // Risk
  const hasRisk = Boolean(inlineWorkbenchItem?.risk);
  const riskResult = (inlineWorkbenchItem?.risk as any)?.RiskAssessmentResult?.toLowerCase() ?? '';
  const riskIcon = riskResult === 'low' || riskResult === 'approved' ? 'ShieldSolid' : riskResult === 'medium' ? 'HalfCircle' : 'Shield';
  const riskLabel = riskResult ? `${riskResult.charAt(0).toUpperCase()}${riskResult.slice(1)}` : 'Recorded';

  // Matter
  const hasMatter = Boolean(inst?.MatterId ?? inst?.matterId) || workbenchMatters.length > 0;
  const mainMatterRecord = workbenchMatters[0] ?? null;
  const mainMatterRef = (mainMatterRecord?.DisplayNumber || mainMatterRecord?.['Display Number'] || mainMatterRecord?.displayNumber || mainMatterRecord?.display_number || inst?.MatterId || inst?.matterId) as string | undefined;
  const shouldShowPostPitch = Boolean(inlineWorkbenchItem) || showPitch;

  // Pipeline progression
  const pipelineStages = [
    { done: showTeamsStage || showClaimer, index: 0, inPlay: showTeamsStage || showClaimer || showLegacyPlaceholder },
    { done: showPitch, index: 1, inPlay: true },
    { done: hasInstruction, index: 2, inPlay: shouldShowPostPitch },
    { done: eidPassed, index: 3, inPlay: shouldShowPostPitch && hasInstruction },
    { done: hasConfirmedPayment, index: 4, inPlay: shouldShowPostPitch },
    { done: hasRisk, index: 5, inPlay: shouldShowPostPitch },
    { done: hasMatter, index: 6, inPlay: shouldShowPostPitch },
  ];
  const nextIncompleteIndex = pipelineStages.find(s => s.inPlay && !s.done)?.index ?? -1;

  // Shared mini-chip renderer
  const renderMiniChip = (props: any) => (
    <MiniPipelineChip
      {...props}
      isDarkMode={isDarkMode}
      onMouseEnter={(e: React.MouseEvent) => showPipelineHover(e, {
        title: props.fullLabel,
        status: props.statusText || (props.done ? 'Complete' : 'Not started'),
        subtitle: props.subtitle,
        color: props.color,
        iconName: props.iconName,
        details: props.details,
      })}
      onMouseMove={movePipelineHover}
      onMouseLeave={hidePipelineHover}
    />
  );

  // ─── Contact visibility badge helpers ─────────────────────
  const responseBucket = contactVisibility?.responseBucket;
  const hasContactedFE = Boolean(contactVisibility?.feeEarnerContact);
  const responseBucketColor = (() => {
    if (!responseBucket) return '';
    if (responseBucket.includes('<1') || responseBucket.includes('< 1')) return colours.green;
    if (responseBucket.includes('1-4') || responseBucket.includes('1–4')) return colours.highlight;
    if (responseBucket.includes('4-24') || responseBucket.includes('4–24')) return colours.orange;
    return colours.cta; // >24h
  })();

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
      {/* Contact visibility micro-badges — top-right overlay */}
      {(responseBucket || hasContactedFE) && (
        <div style={{
          position: 'absolute',
          top: 1,
          right: pipelineNeedsCarousel ? 28 : 2,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          zIndex: 2,
          pointerEvents: 'none',
        }}>
          {responseBucket && (
            <span
              title={`First response: ${responseBucket}`}
              style={{
                fontSize: 8,
                fontWeight: 700,
                lineHeight: 1,
                padding: '1px 4px',
                borderRadius: 0,
                background: `${responseBucketColor}1a`,
                color: responseBucketColor,
                border: `1px solid ${responseBucketColor}33`,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              {responseBucket}
            </span>
          )}
          {hasContactedFE && (
            <span
              title={`Fee earner contacted${contactVisibility?.feeEarnerContactBucket ? ` (${contactVisibility.feeEarnerContactBucket})` : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: colours.green,
                flexShrink: 0,
              }}
            />
          )}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          columnGap: 8,
          alignItems: 'center',
          width: '100%',
          minWidth: 0,
          height: '100%',
          paddingRight: pipelineGridPaddingRight,
          boxSizing: 'border-box',
        }}
      >
        {/* POC — chip index 0 */}
        {isChipVisible(0) && (
          <div style={{ display: 'flex', justifyContent: showClaimer ? 'flex-start' : 'center', justifySelf: showClaimer ? 'stretch' : 'center', width: showClaimer ? '100%' : 'fit-content' }}>
            {(() => {
              const isCurrentUser = currentUserEmail && pocLower === currentUserEmail.toLowerCase();
              const initialsColor = showClaimer
                ? (isCurrentUser ? colours.green : (isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`))
                : (isDarkMode ? `${colours.subtleGrey}66` : `${colours.greyText}59`);

              if (showLegacyPlaceholder && !showClaimer && !showTeamsStage) {
                return (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 0,
                      background: isDarkMode ? `${colours.subtleGrey}0f` : `${colours.subtleGrey}0a`,
                      border: `1px dashed ${isDarkMode ? `${colours.subtleGrey}40` : `${colours.greyText}33`}`,
                      fontSize: 9,
                      fontWeight: 500,
                      color: isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`,
                      whiteSpace: 'nowrap',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: 9 }}>legacy</span>
                  </div>
                );
              }

              if (!showClaimer) {
                return renderClaimPromptChip({
                  teamsLink: enquiryTeamsLink,
                  leadName: contactName,
                  areaOfWork: item.Area_of_Work,
                  enquiryId: item.ID,
                  dataSource: isFromInstructions ? 'new' : 'legacy',
                  iconOnly: true,
                });
              }

              return (
                <div
                  className="pipeline-chip pipeline-chip-reveal"
                  onMouseEnter={(e) => showPipelineHover(e, {
                    title: 'POC',
                    status: showTeamsStage ? `${pocDisplayName} - Teams activity` : `Claimed by ${pocDisplayName}`,
                    subtitle: contactName,
                    color: colours.blue,
                    iconName: 'Contact',
                  })}
                  onMouseMove={movePipelineHover}
                  onMouseLeave={hidePipelineHover}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 22,
                    padding: 0,
                    borderRadius: 0,
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  <span className="pipeline-chip-box">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReassignClick(String(item.ID), e as any);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        e.stopPropagation();
                        handleReassignClick(String(item.ID), e as any);
                      }}
                      onMouseEnter={() => setShowReassignChevron(true)}
                      onMouseLeave={() => setShowReassignChevron(false)}
                      onFocus={() => setShowReassignChevron(true)}
                      onBlur={() => setShowReassignChevron(false)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 4,
                        minWidth: 18,
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        color: initialsColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                        lineHeight: 1,
                        cursor: 'pointer',
                      }}
                      title="Reassign"
                      aria-label={`Reassign ${contactName} from ${pocDisplayName}`}
                    >
                      {claimerLabel}
                      <Icon
                        iconName="ChevronDownSmall"
                        styles={{
                          root: {
                            fontSize: 8,
                            color: isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}80`,
                            opacity: showReassignChevron ? 0.72 : 0,
                            transform: showReassignChevron ? 'translateX(0)' : 'translateX(-2px)',
                            transition: 'opacity 120ms ease, transform 120ms ease',
                            pointerEvents: 'none',
                          },
                        }}
                      />
                    </span>
                    {enquiryTeamsLink && (
                      <span
                        className="pipeline-chip-label"
                        role="link"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(enquiryTeamsLink, '_blank', 'noopener,noreferrer');
                        }}
                        style={{ cursor: 'pointer', color: isDarkMode ? colours.accent : colours.highlight }}
                        title="Open Teams card"
                      >
                        {renderPipelineIcon('TeamsLogo', isDarkMode ? colours.accent : colours.highlight, 12)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Pitch — chip index 1 */}
        {isChipVisible(1) && (
          <div data-chip-index="1" className={isPitchNextAction ? 'next-action-subtle-pulse' : ''}>
            {showPitch ? (
              renderMiniChip({
                shortLabel: pitchChipLabel,
                fullLabel: 'Pitch Sent',
                done: true,
                color: pitchColor,
                iconName: 'Send',
                showConnector: true,
                prevDone: showTeamsStage || showClaimer,
                statusText: pitchedStamp,
                subtitle: contactName,
                title: 'Pitch Sent',
                isNextAction: false,
                details: [
                  ...(pitchedBy ? [{ label: 'By', value: pitchedBy }] : []),
                  ...(pitchScenarioId ? [{ label: 'Scenario', value: `#${pitchScenarioId}` }] : []),
                  ...(pitchMatterRef ? [{ label: 'Matter', value: pitchMatterRef }] : []),
                ],
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
                },
              })
            ) : showPitchCTA ? (
              <button
                type="button"
                className="pipeline-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  openEnquiryWorkbench(item, 'Pitch');
                }}
                onMouseEnter={(e) => showPipelineHover(e, {
                  title: 'Send Pitch',
                  status: 'Claimed — ready to pitch',
                  subtitle: contactName,
                  color: isDarkMode ? 'rgba(160, 160, 160, 0.7)' : 'rgba(107, 107, 107, 0.6)',
                  iconName: 'Send',
                })}
                onMouseMove={movePipelineHover}
                onMouseLeave={hidePipelineHover}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: 22,
                  padding: 0,
                  borderRadius: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {renderPipelineIcon('Send', isDarkMode ? 'rgba(160, 160, 160, 0.55)' : 'rgba(107, 107, 107, 0.5)', 14)}
              </button>
            ) : (
              <div
                onMouseEnter={(e) => showPipelineHover(e, {
                  title: 'Pitch',
                  status: 'Not pitched',
                  subtitle: contactName,
                  color: pitchColor,
                  iconName: 'Send',
                })}
                onMouseMove={movePipelineHover}
                onMouseLeave={hidePipelineHover}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: 22,
                  border: 'none',
                  borderRadius: 0,
                  background: 'transparent',
                }}
              >
                {renderPipelineIcon('Send', inactivePipelineColor, 14)}
              </div>
            )}
          </div>
        )}

        {/* Post-pitch stages — chip indices 2–6 */}
        {/* Instruction — chip 2 */}
        {(pipelineNeedsCarousel ? isChipVisible(2) : (shouldShowPostPitch || isChipVisible(2))) && (
          <div data-chip-index="2">
            {renderMiniChip({
              shortLabel: hasInstruction ? instructionChipLabel : (isShellEntry && instructionRef ? 'Opened' : '--'),
              fullLabel: 'Instruction',
              done: shouldShowPostPitch && hasInstruction,
              inProgress: isShellEntry && Boolean(instructionRef) && showPitch && !hasInstruction,
              color: colours.green,
              iconName: 'CheckMark',
              showConnector: true,
              prevDone: showPitch,
              statusText: hasInstruction ? `Instructed ${instructionStamp}` : (isShellEntry && instructionRef ? 'Checkout opened - awaiting client submission' : 'Not instructed'),
              subtitle: contactName,
              title: hasInstruction ? `Instructed (${instructionRef})` : (isShellEntry && instructionRef ? `Checkout opened, waiting for client submission (${instructionRef})` : 'Not instructed yet'),
              isNextAction: !isShellEntry && nextIncompleteIndex === 2,
              details: hasInstruction ? [
                { label: 'Ref', value: instructionRef || '' },
                ...(instructionStage ? [{ label: 'Stage', value: instructionStage }] : []),
                ...(instructionServiceDesc ? [{ label: 'Service', value: instructionServiceDesc }] : []),
                ...(instructionAmountText ? [{ label: 'Value', value: instructionAmountText }] : []),
              ] : undefined,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
              },
            })}
          </div>
        )}

        {/* EID — chip 3 */}
        {(pipelineNeedsCarousel ? isChipVisible(3) : (shouldShowPostPitch || isChipVisible(3))) && (
          <div data-chip-index="3">
            {renderMiniChip({
              shortLabel: hasEid ? eidLabel : 'ID',
              fullLabel: hasEid ? eidLabel : 'ID Check',
              done: shouldShowPostPitch && eidPassed,
              inProgress: shouldShowPostPitch && identityStage.status === 'blocked',
              isNextAction: nextIncompleteIndex === 3 && identityStage.status !== 'blocked',
              color: hasEid ? eidColor : colours.highlight,
              iconName: 'ContactCard',
              showConnector: true,
              prevDone: hasInstruction,
              statusText: identityStage.status === 'blocked' ? identityStage.statusText : hasEid ? `EID ${eidLabel}` : 'EID not started',
              subtitle: contactName,
              title: identityStage.status === 'blocked' ? identityStage.title : hasEid ? `ID: ${eidLabel}` : 'ID not started',
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
              },
            })}
          </div>
        )}

        {/* Payment — chip 4 */}
        {(pipelineNeedsCarousel ? isChipVisible(4) : (shouldShowPostPitch || isChipVisible(4))) && (
          <div data-chip-index="4">
            {renderMiniChip({
              shortLabel: paymentLabel,
              fullLabel: hasConfirmedPayment ? 'Paid' : hasPayment ? (isBankPayment ? 'Pending' : 'Payment') : 'Payment',
              done: shouldShowPostPitch && hasConfirmedPayment,
              inProgress: shouldShowPostPitch && hasPayment && !hasConfirmedPayment,
              color: paymentColor,
              iconName: paymentIcon,
              showConnector: true,
              prevDone: eidPassed,
              statusText: hasConfirmedPayment ? `Paid${paymentAmountText ? ` ${paymentAmountText}` : ''}` : hasPayment ? `${isBankPayment ? 'Pending' : 'Payment'}${paymentAmountText ? ` ${paymentAmountText}` : ''}` : 'No payment',
              subtitle: contactName,
              title: paymentTitle,
              isNextAction: nextIncompleteIndex === 4,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
              },
            })}
          </div>
        )}

        {/* Risk — chip 5 */}
        {(pipelineNeedsCarousel ? isChipVisible(5) : (shouldShowPostPitch || isChipVisible(5))) && (
          <div data-chip-index="5">
            {renderMiniChip({
              shortLabel: hasRisk ? riskLabel : 'Risk',
              fullLabel: 'Risk',
              done: shouldShowPostPitch && hasRisk,
              color: colours.green,
              isNextAction: nextIncompleteIndex === 5,
              iconName: riskIcon,
              showConnector: true,
              prevDone: hasConfirmedPayment,
              statusText: hasRisk ? `Risk ${riskLabel}` : 'No risk record',
              subtitle: contactName,
              title: hasRisk ? 'Risk record present' : 'Risk not started',
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
              },
            })}
          </div>
        )}

        {/* Matter — chip 6 */}
        {(pipelineNeedsCarousel ? isChipVisible(6) : (shouldShowPostPitch || isChipVisible(6))) && (
          <div data-chip-index="6">
            {renderMiniChip({
              shortLabel: hasMatter && mainMatterRef ? mainMatterRef : 'Matter',
              fullLabel: 'Matter',
              done: shouldShowPostPitch && hasMatter,
              color: colours.green,
              iconName: 'OpenFolderHorizontal',
              showConnector: true,
              prevDone: hasRisk,
              statusText: hasMatter ? `Matter ${mainMatterRef ?? 'linked'}` : 'No matter yet',
              subtitle: contactName,
              title: hasMatter ? 'Matter linked/opened' : 'Matter not opened',
              isNextAction: nextIncompleteIndex === 6,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                openEnquiryWorkbench(item, 'Timeline', { workbenchTab: 'matter' });
              },
            })}
          </div>
        )}

      </div>
      {pipelineNeedsCarousel && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            advancePipelineScroll(item.ID, 7, visiblePipelineChipCount);
          }}
          title={hasMoreChips ? `View more stages (${7 - visibleEnd} hidden)` : 'Back to start'}
          style={{
            position: 'absolute',
            top: '50%',
            right: 0,
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 22,
            padding: 0,
            border: `1px solid ${navBorder}`,
            borderRadius: 0,
            background: hasMoreChips
              ? navActiveBackground
              : navIdleBackground,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            color: hasMoreChips
              ? navAccent
              : mutedTextColor,
            zIndex: 1,
          }}
        >
          <Icon
            iconName={hasMoreChips ? 'ChevronRight' : 'Refresh'}
            styles={{
              root: {
                fontSize: hasMoreChips ? 12 : 10,
                color: 'inherit',
                opacity: hasMoreChips ? 1 : 0.7,
              },
            }}
          />
        </button>
      )}
    </div>
  );
};

export default React.memo(PipelineCell);
