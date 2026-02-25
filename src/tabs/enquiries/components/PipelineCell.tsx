/**
 * PipelineCell — renders the 7-stage pipeline carousel in a prospect row.
 *
 * Extracted from the ~742-line IIFE in Enquiries.tsx.
 * Handles POC/claim, pitch, instruction, EID, payment, risk, matter chips.
 */

import React from 'react';
import { Icon } from '@fluentui/react';
import { format } from 'date-fns';
import { colours } from '../../../app/styles/colours';
import { MiniPipelineChip, renderPipelineIcon } from './pipeline';
import type { Enquiry } from '../../../app/functionality/types';
import type { EnquiryEnrichmentData } from '../../../app/functionality/enquiryEnrichment';
import type { RowPipelineHandlers, RowDataDeps } from './rowTypes';

export interface PipelineCellProps {
  item: Enquiry;
  isDarkMode: boolean;
  activeState: '' | 'Claimed' | 'Claimable' | 'Triaged';
  enrichmentData: EnquiryEnrichmentData | undefined;
  inlineWorkbenchItem: any | undefined;
  pipelineNeedsCarousel: boolean;
  visiblePipelineChipCount: number;
  PIPELINE_CHIP_MIN_WIDTH_PX: number;
  contactName: string;
  pocLower: string;
  isFromInstructions: boolean;
  handlers: RowPipelineHandlers;
  dataDeps: Pick<RowDataDeps, 'claimerMap' | 'isUnclaimedPoc' | 'combineDateAndTime'>;
}

// Helpers that were closure-scoped in Enquiries.tsx
const isValidTimestamp = (dateStr: string | null) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
};

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
  handlers,
  dataDeps,
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
    getAreaSpecificChannelUrl,
    getScenarioColor,
  } = handlers;
  const { claimerMap, isUnclaimedPoc, combineDateAndTime } = dataDeps;

  const isV2Enquiry = (item as any).__sourceType === 'new' || (item as any).source === 'instructions';
  const teamsData = enrichmentData?.teamsData as any;
  const teamsTime = isV2Enquiry && teamsData
    ? (teamsData.MessageTimestamp || teamsData.CreatedAt || (teamsData.CreatedAtMs ? new Date(teamsData.CreatedAtMs).toISOString() : null))
    : null;
  const pocClaimTime = (item as any).claim || null;
  const pitchData = enrichmentData?.pitchData as any;
  const pitchTime = pitchData ? (pitchData.PitchedDate || pitchData.pitchedDate) : null;
  const pitchedDate = pitchData?.PitchedDate || pitchData?.pitchedDate || pitchData?.pitched_date || '';
  const pitchedTime = pitchData?.PitchedTime || pitchData?.pitchedTime || pitchData?.pitched_time || '';
  const pitchedBy = pitchData?.PitchedBy || pitchData?.pitchedBy || pitchData?.pitched_by || '';
  const pitchScenarioId = pitchData?.scenarioId || pitchData?.scenario_id || '';
  const pitchMatterRef = pitchData?.displayNumber || pitchData?.display_number || '';
  const pitchedDateParsed = combineDateAndTime(pitchedDate, pitchedTime);
  const pitchChipLabel = pitchedDateParsed
    ? `${format(pitchedDateParsed, 'd MMM')} ${format(pitchedDateParsed, 'HH:mm')}`
    : '';
  const pitchedStamp = pitchedDateParsed
    ? `Pitched ${format(pitchedDateParsed, 'dd MMM HH:mm')}`
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

  const showTeamsStage = isV2Enquiry && !!teamsData;
  const showLegacyPlaceholder = isDefinitelyLegacy;
  const enrichmentWasProcessed = enrichmentData && enrichmentData.enquiryId;
  const showLoadingState = isV2Enquiry && !enrichmentWasProcessed && !isDefinitelyLegacy && !teamsTime;

  // POC/claim state
  const isTeamInboxPoc = isUnclaimedPoc(pocLower);
  const showClaimer = hasClaimerStage && activeState !== 'Triaged' && !isTeamInboxPoc;
  const claimerInfo = claimerMap[pocLower];
  const claimerLabel = claimerInfo?.Initials || getPocInitialsLocal(pocDisplayName, claimerMap);
  const showPitch = !!enrichmentData?.pitchData;
  const pitchColor = getScenarioColor(enrichmentData?.pitchData?.scenarioId);
  const showPitchCTA = showClaimer && !isTeamInboxPoc && enrichmentWasProcessed && !showPitch;
  const isPitchNextAction = (showTeamsStage || showClaimer) && !showPitch;

  // Carousel state for this row
  const pipelineOffset = getPipelineScrollOffset(item.ID);
  const visibleEnd = pipelineOffset + visiblePipelineChipCount;
  const hasMoreChips = pipelineNeedsCarousel && pipelineOffset < 7 - visiblePipelineChipCount;
  const isChipVisible = (chipIndex: number) =>
    !pipelineNeedsCarousel || (chipIndex >= pipelineOffset && chipIndex < visibleEnd);

  const gridCols = pipelineNeedsCarousel
    ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
    : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`;

  const getCascadeStyle = (chipIndex: number) => ({
    animation: enrichmentWasProcessed ? `pipeline-cascade 0.35s cubic-bezier(0.4, 0, 0.2, 1) ${chipIndex * 0.12}s both` : 'none',
  });

  const enquiryTeamsLink = (enrichmentData?.teamsData as any)?.teamsLink as string | undefined;
  const inactivePipelineColor = isDarkMode ? `${colours.subtleGrey}66` : `${colours.greyText}59`;
  const mutedTextColor = isDarkMode ? `${colours.subtleGrey}b3` : `${colours.greyText}99`;
  const navBorder = isDarkMode ? 'rgba(75, 85, 99, 0.55)' : 'rgba(160, 160, 160, 0.28)';
  const navIdleBackground = isDarkMode ? 'rgba(8, 28, 48, 0.72)' : 'rgba(244, 244, 246, 0.9)';
  const navActiveBackground = isDarkMode ? 'rgba(135, 243, 243, 0.14)' : 'rgba(54, 144, 206, 0.1)';
  const navAccent = isDarkMode ? colours.accent : colours.highlight;

  // ─── Loading state ──────────────────────────────────────────
  if (showLoadingState) {
    return (
      <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: pipelineNeedsCarousel
              ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
              : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`,
            columnGap: 8,
            alignItems: 'center',
            width: '100%',
            minWidth: 0,
            height: '100%',
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
                  animation: `pipeline-pulse 1.5s ease-in-out infinite ${i * 0.1}s`,
                }}
              >
                {renderPipelineIcon(
                  stage.icon,
                  inactivePipelineColor,
                  14,
                )}
              </div>
            );
          })}
          {pipelineNeedsCarousel ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                advancePipelineScroll(item.ID, 7, visiblePipelineChipCount);
              }}
              title="View more stages"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: 22,
                padding: 0,
                border: `1px solid ${navBorder}`,
                borderRadius: 0,
                background: navActiveBackground,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                color: navAccent,
              }}
            >
              <Icon iconName="ChevronRight" styles={{ root: { fontSize: 12, color: 'inherit' } }} />
            </button>
          ) : (
            <div />
          )}
        </div>
        <style>{`
          @keyframes pipeline-pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </div>
    );
  }

  // ─── Post-pitch stage data ──────────────────────────────────
  const inst = inlineWorkbenchItem?.instruction;
  const deal = inlineWorkbenchItem?.deal;
  const dealStatus = (deal?.Status ?? deal?.status ?? '').toLowerCase();
  const dealHasInstruction = dealStatus !== 'pitched' && dealStatus !== '';
  const instructionRef = (inst?.InstructionRef ?? inst?.instructionRef ?? (dealHasInstruction ? (deal?.InstructionRef ?? deal?.instructionRef) : undefined)) as string | undefined;
  const instructionDateRaw =
    inst?.SubmissionDate ?? inst?.submissionDate ?? inst?.SubmissionDateTime ?? inst?.submissionDateTime ??
    inst?.InstructionDateTime ?? inst?.instructionDateTime ?? inst?.SubmittedAt ?? inst?.submittedAt ??
    inst?.CreatedAt ?? inst?.createdAt ?? inst?.CreatedOn ?? inst?.createdOn ??
    inst?.DateCreated ?? inst?.created_at ?? inst?.InstructionDate ?? inst?.instructionDate ??
    deal?.CloseDate ?? deal?.closeDate ?? deal?.close_date;
  const instructionTimeRaw =
    inst?.SubmissionTime ?? inst?.submissionTime ?? inst?.SubmissionTimeUtc ?? inst?.submissionTimeUtc ??
    deal?.CloseTime ?? deal?.closeTime ?? deal?.close_time;
  const instructionDateParsed = combineDateAndTime(instructionDateRaw, instructionTimeRaw);
  const instructionStamp = instructionDateParsed ? format(instructionDateParsed, 'dd MMM HH:mm') : '';
  const instructionChipLabel = instructionDateParsed
    ? `${format(instructionDateParsed, 'd MMM')} ${format(instructionDateParsed, 'HH:mm')}`
    : '--';
  const instructionStage = inst?.Stage ?? inst?.stage ?? deal?.Stage ?? deal?.Status ?? deal?.status ?? '';
  const instructionServiceDesc = deal?.ServiceDescription ?? deal?.serviceDescription ?? inst?.ServiceDescription ?? '';
  const instructionAmount = deal?.Amount ?? deal?.amount ?? inst?.Amount;
  const instructionAmountText = instructionAmount && !isNaN(Number(instructionAmount))
    ? `£${Number(instructionAmount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
    : '';
  const stageLower = instructionStage.toLowerCase();
  const isShellEntry = Boolean(instructionRef) && (stageLower === 'initialised' || stageLower === 'pitched' || stageLower === 'opened' || stageLower === '');
  const hasInstruction = Boolean(instructionRef) && (Boolean(instructionDateParsed) || !isShellEntry);

  // EID
  const hasEid = Boolean(inlineWorkbenchItem?.eid);
  const eidResult = (inlineWorkbenchItem?.eid as any)?.EIDOverallResult?.toLowerCase() ?? '';
  const eidPassed = eidResult === 'passed' || eidResult === 'pass' || eidResult === 'verified' || eidResult === 'approved';
  const eidColor = eidPassed ? colours.green : eidResult === 'refer' ? colours.orange : eidResult === 'review' ? colours.red : colours.highlight;
  const eidLabel = eidPassed ? 'Pass' : eidResult === 'refer' ? 'Refer' : eidResult === 'review' ? 'Review' : eidResult || 'ID';

  // Payment
  const payments = Array.isArray(inlineWorkbenchItem?.payments) ? inlineWorkbenchItem.payments : [];
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
  const hasMatter = Boolean(inst?.MatterId ?? inst?.matterId) || (Array.isArray(inlineWorkbenchItem?.matters) && inlineWorkbenchItem.matters.length > 0);
  const mainMatterRecord = Array.isArray(inlineWorkbenchItem?.matters) ? inlineWorkbenchItem.matters[0] : null;
  const mainMatterRef = (mainMatterRecord?.DisplayNumber || mainMatterRecord?.['Display Number'] || mainMatterRecord?.displayNumber || mainMatterRecord?.display_number || inst?.MatterId || inst?.matterId) as string | undefined;
  const shouldShowPostPitch = Boolean(inlineWorkbenchItem) || showPitch;

  // Pipeline progression
  const pipelineStages = [
    { done: showTeamsStage || showClaimer, index: 0, inPlay: showTeamsStage || showClaimer || showLegacyPlaceholder },
    { done: showPitch, index: 1, inPlay: true },
    { done: hasInstruction, index: 2, inPlay: shouldShowPostPitch },
    { done: eidPassed, index: 3, inPlay: shouldShowPostPitch },
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

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          columnGap: 8,
          alignItems: 'center',
          width: '100%',
          minWidth: 0,
          height: '100%',
        }}
      >
        {/* POC — chip index 0 */}
        {isChipVisible(0) && (
          <div style={{ ...getCascadeStyle(0), display: 'flex', justifyContent: 'center', justifySelf: 'center', width: 'fit-content' }}>
            {(() => {
              const hasPocActivity = showTeamsStage || showClaimer;
              const pocIconColor = hasPocActivity
                ? (isDarkMode ? `${colours.highlight}d9` : `${colours.highlight}bf`)
                : (isDarkMode ? `${colours.subtleGrey}40` : `${colours.greyText}33`);
              const initialsColor = showClaimer
                ? colours.green
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
                <button
                  className="pipeline-chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    const link = teamsData?.teamsLink || getAreaSpecificChannelUrl(item.Area_of_Work);
                    if (link) window.open(link, '_blank');
                  }}
                  onMouseEnter={(e) => showPipelineHover(e, {
                    title: 'POC',
                    status: showTeamsStage ? `${pocDisplayName} - Teams activity` : `Claimed by ${pocDisplayName}`,
                    subtitle: contactName,
                    color: colours.blue,
                    iconName: 'TeamsLogo',
                  })}
                  onMouseMove={movePipelineHover}
                  onMouseLeave={hidePipelineHover}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    height: 22,
                    padding: '0 4px',
                    borderRadius: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 14, color: pocIconColor, flexShrink: 0 } }} />
                  <span style={{
                    width: 22,
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: initialsColor,
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}>
                    {claimerLabel}
                  </span>
                  <Icon
                    iconName="ChevronDown"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleReassignClick(String(item.ID), e as any);
                    }}
                    styles={{ root: { fontSize: 8, color: initialsColor, opacity: 0.6, cursor: 'pointer' } }}
                  />
                </button>
              );
            })()}
          </div>
        )}

        {/* Pitch — chip index 1 */}
        {isChipVisible(1) && (
          <div data-chip-index="1" className={isPitchNextAction ? 'next-action-subtle-pulse' : ''} style={getCascadeStyle(1)}>
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
                  title: 'Pitch',
                  status: 'Ready to pitch',
                  subtitle: contactName,
                  color: mutedTextColor,
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
                <Icon iconName="Send" styles={{ root: { fontSize: 14, color: inactivePipelineColor } }} />
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
                <Icon iconName="Send" styles={{ root: { fontSize: 14, color: inactivePipelineColor } }} />
              </div>
            )}
          </div>
        )}

        {/* Post-pitch stages — chip indices 2–6 */}
        {/* Instruction — chip 2 */}
        {(pipelineNeedsCarousel ? isChipVisible(2) : (shouldShowPostPitch || isChipVisible(2))) && (
          <div data-chip-index="2" style={getCascadeStyle(2)}>
            {renderMiniChip({
              shortLabel: hasInstruction ? instructionChipLabel : (isShellEntry && instructionRef ? 'Opened' : '--'),
              fullLabel: 'Instruction',
              done: shouldShowPostPitch && hasInstruction,
              inProgress: isShellEntry && Boolean(instructionRef) && showPitch && !hasInstruction,
              color: colours.green,
              iconName: 'CheckMark',
              showConnector: true,
              prevDone: showPitch,
              statusText: hasInstruction ? `Instructed ${instructionStamp}` : (isShellEntry && instructionRef ? 'Checkout opened - awaiting submission' : 'Not instructed'),
              subtitle: contactName,
              title: hasInstruction ? `Instructed (${instructionRef})` : (isShellEntry && instructionRef ? `Checkout opened (${instructionRef})` : 'Not instructed yet'),
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
          <div data-chip-index="3" style={getCascadeStyle(3)}>
            {renderMiniChip({
              shortLabel: hasEid ? eidLabel : 'ID',
              fullLabel: hasEid ? eidLabel : 'ID Check',
              done: shouldShowPostPitch && hasEid,
              isNextAction: nextIncompleteIndex === 3,
              color: hasEid ? eidColor : colours.highlight,
              iconName: 'ContactCard',
              showConnector: true,
              prevDone: hasInstruction,
              statusText: hasEid ? `EID ${eidLabel}` : 'EID not started',
              subtitle: contactName,
              title: hasEid ? `ID: ${eidLabel}` : 'ID not started',
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
              },
            })}
          </div>
        )}

        {/* Payment — chip 4 */}
        {(pipelineNeedsCarousel ? isChipVisible(4) : (shouldShowPostPitch || isChipVisible(4))) && (
          <div data-chip-index="4" style={getCascadeStyle(4)}>
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
          <div data-chip-index="5" style={getCascadeStyle(5)}>
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
          <div data-chip-index="6" style={getCascadeStyle(6)}>
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

        {/* Carousel nav / empty gutter */}
        {pipelineNeedsCarousel ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              advancePipelineScroll(item.ID, 7, visiblePipelineChipCount);
            }}
            title={hasMoreChips ? `View more stages (${7 - visibleEnd} hidden)` : 'Back to start'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
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
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};

export default React.memo(PipelineCell);
