/**
 * ReceptionReport — partner-facing Reception KPIs.
 *
 * Consumes GET /api/reporting/reception-kpis (direct SQL read against the
 * Instructions DB; see server/routes/receptionKpis.js).
 *
 * Layout mirrors the rest of the reporting family (CallsReport, etc.):
 * shared ReportShell toolbar, then vertically stacked ReportingSectionCards.
 *
 * Source of truth for the KPI pillars: Asana "Reception role" task —
 * notes clarity (FE feedback), time to form submission, call quality &
 * conversion, average call length.
 */

import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { app } from '@microsoft/teams-js';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import ReportShell from './components/ReportShell';
import { useReportRange, type DateRange, type RangeKey } from './hooks/useReportRange';
import type { WorkbenchJourneyStage } from '../../components/workbench/WorkbenchJourneyRail';
import { aowColour } from '../../components/command-centre/types';
import './ReceptionReport.css';

// ── MD-parity chip helpers (mirror ManagementDashboard summary chips) ──

const DAY_MS = 86_400_000;

const summaryChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '12px 16px',
  borderRadius: 0,
  background: isDarkMode ? colours.darkBlue : '#ffffff',
  border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
  boxShadow: isDarkMode ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
  textAlign: 'left',
  rowGap: 6,
  width: '100%',
  cursor: 'default',
});

const summaryChipLabelStyle = (): CSSProperties => ({
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  opacity: 0.65,
});

// ── Types ──────────────────────────────────────────────────────────────────

interface CallsByType {
  newEnquiry: number;
  telephoneMessage: number;
  callback: number;
  other: number;
  unknown: number;
}

interface HandlerRow {
  handler: string;
  callsTaken: number;
  callsHandled: number;
  avgCallSeconds: number | null;
  callsWithDuration: number;
  prospectsOpened: number;
  prospectsInProgress: number;
  conversionRate: number | null;
  notesRated: number;
  notesClear: number;
  notesUnclear: number;
  clarityScore: number | null;
  callsByType?: CallsByType;
  identityVerified?: number;
  identityMismatch?: number;
  identityUnverified?: number;
}

interface CoverageEntry { source?: string | null; status?: string; note?: string; }

interface EvidenceRow {
  callId: number;
  handler: string;
  callStatus: string | null;
  callCreatedAt: string | null;
  enquiryId: number | null;
  enquiryAcid: string | null;
  enquiryCreatedAt?: string | null;
  dubberRecordingId: string | null;
  durationSeconds: number | null;
  durationSource: 'dubber' | 'form' | 'missing' | string;
  notesRating: string | null;
  notesRatedAt: string | null;
  teamsActivityId: string | null;
  activityId: string | null;
  teamsMessageId: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  instructionRef: string | null;
  instructionStage: string | null;
  instructionSubmittedAt?: string | null;
  stageRank: number | null;
  matterId: string | null;
  matterDisplayNumber: string | null;
  matterStatus: string | null;
  matterOpenedAt: string | null;
  matterResponsibleSolicitor: string | null;
  matterSource: string | null;
  outcome: 'opened' | 'in_progress' | 'unlinked' | string;
  joinConfidence: 'matterRequestPatched' | 'instructionRefExact' | 'acidPattern' | 'teamsOnly' | 'unlinked' | string;
  confidenceReason: string;
  review?: {
    action: 'confirm' | 'reject' | 'manual_link' | string;
    candidateEnquiryId: number | null;
    candidateInstructionRef: string | null;
    candidateMatterId: string | null;
    note: string | null;
    matchSource: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  } | null;
  callToMatterHours: number | null;
  callStartedAt?: string | null;
  callSubmittedAt?: string | null;
  callType?: string | null;
  dubberFromParty?: string | null;
  dubberToParty?: string | null;
  dubberCallType?: string | null;
  dubberMatchedInitials?: string | null;
  dubberMatchedEmail?: string | null;
  dubberStartTimeUtc?: string | null;
  dubberAiStatus?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  enquiryNotes?: string | null;
  areaOfWork?: string | null;
  referralSource?: string | null;
  adSet?: string | null;
  keywords?: string | null;
  landingUrl?: string | null;
  gclid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  externalCallId?: string | null;
  trackingNumber?: string | null;
  trackingSource?: string | null;
  teamsChannelId?: string | null;
  teamsTeamId?: string | null;
  teamsMessageTimestamp?: string | null;
  teamsCardType?: string | null;
}

interface EvidenceSummary {
  rows: EvidenceRow[];
  totalRows: number;
  returnedRows: number;
  latestCallAt: string | null;
  linkedInstructions: number;
  linkedMatters: number;
  unlinked: number;
  instructionJoinRate: number | null;
  matterJoinRate: number | null;
  confidenceCounts?: Record<string, number>;
}

interface ConversionStages {
  callsLogged: number;
  enquiryLinked: number;
  instructionLinked: number;
  matterLinked: number;
  matterOpened: number;
  onboardingInProgress: number;
  noMatterLink: number;
  noEnquiryLink: number;
  enquiryJoinRate: number | null;
  instructionJoinRate: number | null;
  matterJoinRate: number | null;
  callToMatterConversionRate: number | null;
}

interface PhonePickupHandler {
  handler: string;
  handlerInitials: string;
  handlerEmail: string | null;
  calls: number;
  shortCalls: number;
  avgCallSeconds: number | null;
  callsWithDuration: number;
  lastCallAt: string | null;
}

interface PhonePickupEvidenceRow {
  recordingId: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  fromParty: string | null;
  toParty: string | null;
  callType: string | null;
  aiStatus: string | null;
}

interface PhonePickupsBlock {
  handlers: PhonePickupHandler[];
  unmatched: {
    calls: number;
    shortCalls: number;
    avgCallSeconds: number | null;
    callsWithDuration: number;
    lastCallAt: string | null;
    rows?: PhonePickupEvidenceRow[];
    returnedRows?: number;
  };
  totals: {
    calls: number;
    shortCalls: number;
    avgCallSeconds: number | null;
    callsWithDuration: number;
  };
  source?: string;
}

export interface ReceptionKpisResponse {
  window: { from: string; to: string; days: number };
  handlers: HandlerRow[];
  totals: HandlerRow & { handler?: string };
  coverage: {
    callsTaken?: CoverageEntry;
    avgCallSeconds?: CoverageEntry;
    prospectsOpened?: CoverageEntry;
    prospectsInProgress?: CoverageEntry;
    notesClarity?: CoverageEntry;
    ringTime?: CoverageEntry;
    matterJoin?: CoverageEntry;
  };
  conversionStages?: ConversionStages;
  phonePickups?: PhonePickupsBlock;
  evidence?: EvidenceSummary;
}

export interface ReceptionReportProps {
  initialData?: ReceptionKpisResponse | null;
  initialLoadedAt?: number;
  initialRangeKey?: RangeKey;
  initialCustomDateRange?: DateRange | null;
}

interface RealtimePayload {
  eventType?: string;
  changeType?: string;
  entityType?: string;
  field?: string;
  status?: string;
  source?: string;
  timestamp?: string;
  ts?: string;
}

interface LiveCue {
  phase: 'incoming' | 'updated';
  label: string;
  detail: string;
  receivedAt: number;
}

type KpiKey = 'callsTaken' | 'handled' | 'avgCall' | 'conversion' | 'notesClarity' | 'opened' | 'inFlight';
type ReviewFocusKey = 'all' | 'noMatterLink' | 'unratedNotes' | 'formOnly' | 'identityMismatch' | 'shortCalls' | 'mpOnly';

interface KpiBreakdownRow {
  label: string;
  value: string;
  detail?: string;
  hoverDetail?: string;
  tone?: 'default' | 'green' | 'orange' | 'red' | 'highlight';
  evidence?: EvidenceRow;
}

interface LinkLookupCandidate {
  enquiryId: number;
  acid: string | null;
  leadName: string | null;
  email: string | null;
  phone: string | null;
  areaOfWork: string | null;
  source: string | null;
  enquiryCreatedAt: string | null;
  instructionRef: string | null;
  instructionStage: string | null;
  matterId: string | null;
  matterDisplayNumber: string | null;
  dateGapHours: number | null;
  score: number;
  confidence: 'high' | 'medium' | 'low' | string;
  reasons: string[];
}

interface LinkLookupEntry {
  status: 'loading' | 'ready' | 'error';
  candidates?: LinkLookupCandidate[];
  error?: string;
}

type ReviewFocusTone = NonNullable<KpiBreakdownRow['tone']> | 'mute';

interface ReviewFocusTile {
  key: ReviewFocusKey;
  label: string;
  value: number;
  detail: string;
  tone: ReviewFocusTone;
  iconName: string;
}

interface KpiBreakdown {
  title: string;
  value: string;
  rows: KpiBreakdownRow[];
}

interface DrillDayGroup<T> {
  key: string;
  label: string;
  dateKey: string;
  rows: T[];
}

interface DrillPeriodGroup<T> {
  key: string;
  kind: 'day' | 'week';
  label: string;
  rows: T[];
  days: DrillDayGroup<T>[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

type CallTypeSlug = 'new-enquiry' | 'tel-message' | 'callback' | 'other';

const callTypeMeta = (raw: string | null | undefined): { slug: CallTypeSlug; label: string } => {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'new-enquiry' || v === 'new_enquiry' || v === 'newenquiry') return { slug: 'new-enquiry', label: 'New enquiry' };
  if (v === 'telephone-message' || v === 'telephone_message' || v === 'tel-message' || v === 'message') return { slug: 'tel-message', label: 'Tel message' };
  if (v === 'returning-call' || v === 'returning_call' || v === 'callback' || v === 'return-call') return { slug: 'callback', label: 'Callback' };
  return { slug: 'other', label: v ? v : 'Other' };
};

type IdentityMeta = { slug: 'verified' | 'unverified'; label: string; icon: string; tooltip: string };

const identityConfidenceMeta = (row: EvidenceRow): IdentityMeta | null => {
  const handler = (row.handler || '').trim().toLowerCase();
  const matched = (row.dubberMatchedInitials || '').trim().toLowerCase();
  if (!row.dubberRecordingId) {
    return {
      slug: 'unverified',
      label: 'Form only',
      icon: 'Help',
      tooltip: 'No Dubber match. Identity is form-attested only (whoever filled the Reception form claimed to take it).',
    };
  }
  if (matched && handler && matched === handler) {
    return {
      slug: 'verified',
      label: 'Dubber match',
      icon: 'CheckMark',
      tooltip: `Dubber confirms the call was on ${matched.toUpperCase()}'s line, matching the form handler.`,
    };
  }
  return null;
};

const hasReceptionTeamsCard = (row: EvidenceRow): boolean => Boolean(
  row.teamsActivityId || row.activityId || row.teamsMessageId || row.teamsChannelId,
);

const hasIdentityMismatch = (row: EvidenceRow): boolean => {
  const handler = (row.handler || '').trim().toLowerCase();
  const matched = (row.dubberMatchedInitials || '').trim().toLowerCase();
  return Boolean(row.dubberRecordingId && handler && matched && handler !== matched);
};

const isFormOnlyAttribution = (row: EvidenceRow): boolean => identityConfidenceMeta(row)?.slug === 'unverified';
const isUnratedNotes = (row: EvidenceRow): boolean => hasReceptionTeamsCard(row) && !row.notesRating;
const isShortCall = (row: EvidenceRow): boolean => row.durationSeconds != null && row.durationSeconds > 0 && row.durationSeconds < 30;

// ── Reception journey (CRM spine: Call → Notes → Enquiry → Instruction → Matter) ──
type JourneyStatus = 'complete' | 'current' | 'pending' | 'warning' | 'disabled';
type JourneyStageKey = 'call' | 'notes' | 'enquiry' | 'instruction' | 'matter';
interface JourneyStage {
  key: JourneyStageKey;
  label: string;
  status: JourneyStatus;
  value: string | null;
  tooltip: string;
}

const computeReceptionJourney = (row: EvidenceRow): JourneyStage[] => {
  const hasTeamsCard = hasReceptionTeamsCard(row);
  const stages: JourneyStage[] = [];
  // 1. Call
  stages.push({
    key: 'call',
    label: 'Call',
    status: 'complete',
    value: row.dubberRecordingId ? 'Dubber match' : 'No Dubber match',
    tooltip: row.dubberRecordingId
      ? `Dubber match${row.dubberMatchedInitials ? ` (${row.dubberMatchedInitials.toUpperCase()})` : ''}`
      : 'Form-attested call; no Dubber match.',
  });
  // 2. Notes
  let notesStatus: JourneyStatus;
  let notesTooltip: string;
  if (row.notesRating === 'clear') { notesStatus = 'complete'; notesTooltip = 'Notes rated clear'; }
  else if (row.notesRating === 'blocking') { notesStatus = 'warning'; notesTooltip = 'Notes rated blocking - needs rework'; }
  else if (row.notesRating === 'needs_work') { notesStatus = 'current'; notesTooltip = 'Notes rated needs work'; }
  else if (hasTeamsCard) { notesStatus = 'pending'; notesTooltip = 'Teams card posted, awaiting note rating'; }
  else { notesStatus = 'disabled'; notesTooltip = 'No notes captured yet'; }
  stages.push({
    key: 'notes',
    label: 'Notes',
    status: notesStatus,
    value: row.notesRating ? notesRatingLabel(row.notesRating) : null,
    tooltip: notesTooltip,
  });
  // 3. Enquiry
  const enquiryLinked = row.enquiryId != null || Boolean(row.enquiryAcid);
  stages.push({
    key: 'enquiry',
    label: 'Enquiry',
    status: enquiryLinked ? 'complete' : 'pending',
    value: enquiryLinked
      ? (row.enquiryAcid ? `ACID ${row.enquiryAcid}` : `Enquiry #${fmtInt(row.enquiryId!)}`)
      : null,
    tooltip: enquiryLinked ? 'Enquiry linked' : 'Awaiting enquiry link',
  });
  // 4. Instruction
  const hasInstruction = Boolean(row.instructionRef);
  let instructionStatus: JourneyStatus;
  if (hasInstruction && row.outcome === 'in_progress') instructionStatus = 'current';
  else if (hasInstruction) instructionStatus = 'complete';
  else if (enquiryLinked) instructionStatus = 'pending';
  else instructionStatus = 'disabled';
  stages.push({
    key: 'instruction',
    label: 'Instruction',
    status: instructionStatus,
    value: row.instructionRef || null,
    tooltip: hasInstruction
      ? (row.outcome === 'in_progress' ? 'Instruction in progress' : 'Instruction submitted')
      : enquiryLinked ? 'Awaiting instruction' : 'Instruction not started',
  });
  // 5. Matter
  const matterValue = row.matterDisplayNumber || row.matterId;
  let matterStatus: JourneyStatus;
  if (matterValue) matterStatus = 'complete';
  else if (hasInstruction) matterStatus = 'pending';
  else matterStatus = 'disabled';
  stages.push({
    key: 'matter',
    label: 'Matter',
    status: matterStatus,
    value: matterValue ? `Matter ${matterValue}` : null,
    tooltip: matterValue ? `Matter opened${row.matterOpenedAt ? ` ${fmtDateTime(row.matterOpenedAt)}` : ''}` : hasInstruction ? 'Awaiting matter open' : 'No matter yet',
  });
  return stages;
};

const journeyHeadline = (stages: JourneyStage[]): { label: string; tone: 'green' | 'orange' | 'red' | 'default' } => {
  // Pick the furthest completed/current stage; if any warning earlier, surface that.
  const warning = stages.find((s) => s.status === 'warning');
  if (warning) return { label: warning.value || warning.label, tone: 'orange' };
  const current = [...stages].reverse().find((s) => s.status === 'current');
  if (current) return { label: current.value || current.label, tone: 'orange' };
  const completed = [...stages].reverse().find((s) => s.status === 'complete' && s.key !== 'call');
  if (completed) return { label: completed.value || completed.label, tone: 'green' };
  // Nothing past Call yet
  return { label: 'Call logged', tone: 'default' };
};

const matchesReviewFocus = (row: EvidenceRow, focus: ReviewFocusKey): boolean => {
  if (focus === 'all') return true;
  if (focus === 'noMatterLink') return row.outcome === 'unlinked';
  if (focus === 'unratedNotes') return isUnratedNotes(row);
  if (focus === 'formOnly') return isFormOnlyAttribution(row);
  if (focus === 'identityMismatch') return hasIdentityMismatch(row);
  if (focus === 'shortCalls') return isShortCall(row);
  return false;
};

const matchMechanismLabel = (row: EvidenceRow): string => {
  if (row.review?.action === 'manual_link') return 'Manually linked by reviewer';
  if (row.joinConfidence === 'matterRequestPatched') return 'Matched through matter row';
  if (row.joinConfidence === 'instructionRefExact') return 'Matched by instruction ref';
  if (row.joinConfidence === 'acidPattern') return 'Matched by enquiry ACID';
  if (row.joinConfidence === 'teamsOnly') return 'Teams card only';
  return 'No system match';
};

const reviewStatusLabel = (row: EvidenceRow): string | null => {
  if (!row.review) return null;
  if (row.review.action === 'confirm') return 'Confirmed';
  if (row.review.action === 'manual_link') return 'Manual link';
  if (row.review.action === 'reject') return 'Reviewed no link';
  return 'Reviewed';
};

const fmtMSS = (secs: number | null | undefined): string => {
  if (secs == null || secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const fmtPct = (ratio: number | null | undefined): string => {
  if (ratio == null) return '–';
  return `${Math.round(ratio * 100)}%`;
};

const toIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfLocalWeek = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
};

const addLocalDays = (date: Date, days: number): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
};

const parseDateKey = (dateKey: string): Date | null => {
  if (dateKey === 'unknown') return null;
  const d = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayLabel = (dateKey: string): string => {
  const d = parseDateKey(dateKey);
  if (!d) return 'Unknown date';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
};

const weekLabel = (weekKey: string, currentWeekKey: string): string => {
  const weekStart = parseDateKey(weekKey);
  const currentWeekStart = parseDateKey(currentWeekKey);
  if (!weekStart || !currentWeekStart) return 'Older calls';
  const diffDays = Math.round((currentWeekStart.getTime() - weekStart.getTime()) / DAY_MS);
  if (diffDays === 7) return 'Last week';
  const weekEnd = addLocalDays(weekStart, 6);
  const startLabel = weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const endLabel = weekEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `Week ${startLabel} to ${endLabel}`;
};

function buildDrillPeriodGroups<T>(prefix: string, rows: T[], getIso: (row: T) => string | null | undefined): DrillPeriodGroup<T>[] {
  const currentWeekKey = toIsoDate(startOfLocalWeek(new Date()));
  const currentDayBuckets = new Map<string, T[]>();
  const weekBuckets = new Map<string, T[]>();
  const unknownRows: T[] = [];

  for (const row of rows) {
    const iso = getIso(row);
    const parsed = iso ? new Date(iso) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      unknownRows.push(row);
      continue;
    }
    const dateKey = toIsoDate(parsed);
    if (dateKey >= currentWeekKey) {
      const bucket = currentDayBuckets.get(dateKey) || [];
      bucket.push(row);
      currentDayBuckets.set(dateKey, bucket);
      continue;
    }
    const weekKey = toIsoDate(startOfLocalWeek(parsed));
    const bucket = weekBuckets.get(weekKey) || [];
    bucket.push(row);
    weekBuckets.set(weekKey, bucket);
  }

  const dayGroups: DrillPeriodGroup<T>[] = [...currentDayBuckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dateKey, dayRows]) => ({
      key: `${prefix}|day|${dateKey}`,
      kind: 'day' as const,
      label: dayLabel(dateKey),
      rows: dayRows,
      days: [{ key: `${prefix}|day-inner|${dateKey}`, label: dayLabel(dateKey), dateKey, rows: dayRows }],
    }));

  const weekGroups: DrillPeriodGroup<T>[] = [...weekBuckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([weekKey, weekRows]) => {
      const dayBuckets = new Map<string, T[]>();
      for (const row of weekRows) {
        const iso = getIso(row);
        const parsed = iso ? new Date(iso) : null;
        const dateKey = parsed && !Number.isNaN(parsed.getTime()) ? toIsoDate(parsed) : 'unknown';
        const bucket = dayBuckets.get(dateKey) || [];
        bucket.push(row);
        dayBuckets.set(dateKey, bucket);
      }
      const days = [...dayBuckets.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([dateKey, dayRows]) => ({ key: `${prefix}|${weekKey}|${dateKey}`, label: dayLabel(dateKey), dateKey, rows: dayRows }));
      return {
        key: `${prefix}|week|${weekKey}`,
        kind: 'week' as const,
        label: weekLabel(weekKey, currentWeekKey),
        rows: weekRows,
        days,
      };
    });

  const unknownGroup: DrillPeriodGroup<T>[] = unknownRows.length
    ? [{
      key: `${prefix}|day|unknown`,
      kind: 'day' as const,
      label: 'Unknown date',
      rows: unknownRows,
      days: [{ key: `${prefix}|day-inner|unknown`, label: 'Unknown date', dateKey: 'unknown', rows: unknownRows }],
    }]
    : [];

  return [...dayGroups, ...weekGroups, ...unknownGroup];
}

const handlerLabel = (raw: string): string => {
  if (!raw) return 'Unknown';
  const lower = raw.trim().toLowerCase();
  const knownLabels: Record<string, string> = {
    dev: 'MoneyPenny',
    mp: 'MoneyPenny',
    moneypenny: 'MoneyPenny',
    'money penny': 'MoneyPenny',
    ea: 'Emma',
    emma: 'Emma',
    kw: 'Kanchel',
    kanchel: 'Kanchel',
    wh: 'Wolfgang',
    wolfgang: 'Wolfgang',
    'wolfgang hartung': 'Wolfgang',
  };
  if (knownLabels[lower]) return knownLabels[lower];
  return raw.toUpperCase();
};

type ClarityBand = 'high' | 'mid' | 'low' | 'noSample';

const clarityBand = (row: { clarityScore: number | null; notesRated: number }): ClarityBand => {
  if (!row.notesRated) return 'noSample';
  if (row.clarityScore == null) return 'noSample';
  if (row.clarityScore >= 0.80) return 'high';
  if (row.clarityScore >= 0.60) return 'mid';
  return 'low';
};

const clarityColour = (band: ClarityBand, isDarkMode: boolean): string => {
  if (band === 'high') return colours.green;
  if (band === 'low') return colours.cta;
  if (band === 'mid') return isDarkMode ? colours.dark.text : colours.light.text;
  return isDarkMode ? colours.subtleGrey : colours.greyText;
};

const fmtInt = (value: number | null | undefined): string => {
  if (value == null) return '0';
  return value.toLocaleString('en-GB');
};

const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return 'Not linked';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const notesRatingLabel = (rating: string | null | undefined): string => {
  if (!rating) return 'No note rating';
  const normalised = rating.replace(/[_-]+/g, ' ').trim();
  if (!normalised) return 'No note rating';
  return normalised.charAt(0).toUpperCase() + normalised.slice(1);
};

const outcomeLabel = (outcome: string | null | undefined): string => {
  if (outcome === 'opened') return 'Matter path resolved';
  if (outcome === 'in_progress') return 'Onboarding in progress';
  return 'No matter link';
};

const confidenceLabel = (confidence: string | null | undefined): string => {
  if (confidence === 'matterRequestPatched') return 'Matter row';
  if (confidence === 'instructionRefExact') return 'Matter request';
  if (confidence === 'acidPattern') return 'Instruction match';
  if (confidence === 'teamsOnly') return 'Teams card only';
  return 'No link';
};

const fmtHours = (hours: number | null | undefined): string => {
  if (hours == null) return 'Not linked';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
};

const describeTotalsDelta = (
  previous: ReceptionKpisResponse['totals'] | null | undefined,
  next: ReceptionKpisResponse['totals'] | null | undefined,
): string => {
  if (!previous || !next) return 'metrics checked';
  const changes: string[] = [];
  const callsDelta = next.callsTaken - previous.callsTaken;
  const openedDelta = next.prospectsOpened - previous.prospectsOpened;
  const inFlightDelta = next.prospectsInProgress - previous.prospectsInProgress;
  const notesDelta = next.notesRated - previous.notesRated;
  if (callsDelta > 0) changes.push(`+${callsDelta} call${callsDelta === 1 ? '' : 's'}`);
  if (openedDelta > 0) changes.push(`+${openedDelta} matter path${openedDelta === 1 ? '' : 's'}`);
  if (inFlightDelta > 0) changes.push(`+${inFlightDelta} onboarding`);
  if (notesDelta > 0) changes.push(`+${notesDelta} note rating${notesDelta === 1 ? '' : 's'}`);
  return changes.length ? changes.slice(0, 2).join(', ') : 'metrics checked';
};

const describePipelineSignal = (payload: RealtimePayload | null): string | null => {
  const eventType = String(payload?.eventType || '').toLowerCase();
  const field = String(payload?.field || '').toLowerCase();
  if (eventType === 'matter.opened') return 'Matter opened';
  if (eventType === 'matter.requested') return 'Matter requested';
  if (eventType === 'deal.created') return 'Deal created';
  if (eventType === 'deal.updated') return 'Deal updated';
  if (eventType === 'instruction.completed') return 'Instruction completed';
  if (eventType === 'payment.succeeded') return 'Payment completed';
  if (field === 'matter') return 'Matter pipeline updated';
  if (field === 'instruction' || field === 'deal' || field === 'payment') return 'Pipeline updated';
  return null;
};

const describeEnquirySignal = (payload: RealtimePayload | null): string | null => {
  const changeType = String(payload?.changeType || '').toLowerCase();
  if (changeType === 'create' || changeType === 'posted') return 'New enquiry signal';
  if (changeType === 'update') return 'Enquiry updated';
  if (changeType === 'claim') return 'Enquiry claimed';
  if (changeType === 'invalidate' || changeType === 'cleanup') return 'Source data refreshed';
  return null;
};

const liveStatusLabel = (status: 'open' | 'connecting' | 'closed'): string => {
  if (status === 'open') return 'Live signals on';
  if (status === 'connecting') return 'Live signals reconnecting';
  return 'Live signals idle';
};

// ── Component ──────────────────────────────────────────────────────────────

const ReceptionReport: React.FC<ReceptionReportProps> = ({
  initialData = null,
  initialLoadedAt,
  initialRangeKey = 'month',
  initialCustomDateRange = null,
}) => {
  const { isDarkMode } = useTheme();
  const range = useReportRange({ defaultKey: initialRangeKey, defaultCustomDateRange: initialCustomDateRange ?? undefined });

  const [data, setData] = useState<ReceptionKpisResponse | null>(() => initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | undefined>(() => initialLoadedAt);
  const [liveCue, setLiveCue] = useState<LiveCue | null>(null);
  const [expandedHandler, setExpandedHandler] = useState<string | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<number | null>(null);
  const [expandedKpi, setExpandedKpi] = useState<KpiKey | null>(null);
  const [activeReviewFocus, setActiveReviewFocus] = useState<ReviewFocusKey>(() => {
    try {
      const saved = window.localStorage.getItem('helix:reception:reviewFocus');
      const allowed: ReviewFocusKey[] = ['all', 'noMatterLink', 'unratedNotes', 'formOnly', 'identityMismatch', 'shortCalls', 'mpOnly'];
      if (saved && (allowed as string[]).includes(saved)) return saved as ReviewFocusKey;
    } catch { /* ignore */ }
    return 'all';
  });
  const [reportContextOpen, setReportContextOpen] = useState(false);
  const [expandedBreakdownCallId, setExpandedBreakdownCallId] = useState<number | null>(null);
  const [linkLookups, setLinkLookups] = useState<Record<number, LinkLookupEntry>>({});
  const [savingReviewCallId, setSavingReviewCallId] = useState<number | null>(null);
  const [expandedDrillGroups, setExpandedDrillGroups] = useState<Set<string>>(() => new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(() => new Set());
  type TranscriptSentence = { speaker: string | null; content: string; sentiment: number | null };
  type TranscriptEntry = { status: 'loading' | 'ready' | 'error' | 'empty'; sentences?: TranscriptSentence[]; aiStatus?: string | null; error?: string };
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptEntry>>({});
  const [openTranscripts, setOpenTranscripts] = useState<Set<string>>(() => new Set());
  const dataRef = useRef<ReceptionKpisResponse | null>(initialData);
  const initialPayloadWindowRef = useRef<{ from: string; to: string } | null>(
    initialData?.window ? { from: initialData.window.from, to: initialData.window.to } : null,
  );
  const liveReasonRef = useRef<string | null>(null);
  const liveCueTimerRef = useRef<number | null>(null);

  const fromIso = range.range ? toIsoDate(range.range.start) : null;
  const toIso = range.range ? toIsoDate(range.range.end) : null;

  const loadedWindow = useMemo(() => {
    if (!data?.window?.from || !data.window.to) return null;
    const start = new Date(`${data.window.from}T00:00:00`);
    const end = new Date(`${data.window.to}T23:59:59.999`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return { start, end };
  }, [data?.window?.from, data?.window?.to]);

  const isPresetAvailable = useCallback(
    (_key: RangeKey, candidateRange: DateRange | null) => {
      if (!candidateRange || !loadedWindow) return true;
      return candidateRange.start >= loadedWindow.start && candidateRange.end <= loadedWindow.end;
    },
    [loadedWindow],
  );

  const showLiveCue = useCallback((cue: LiveCue) => {
    if (liveCueTimerRef.current !== null) {
      window.clearTimeout(liveCueTimerRef.current);
    }
    setLiveCue(cue);
    liveCueTimerRef.current = window.setTimeout(() => {
      setLiveCue(null);
      liveCueTimerRef.current = null;
    }, 7000);
  }, []);

  const queueRealtimeRefresh = useCallback((reason: string | null) => {
    if (!reason) return;
    liveReasonRef.current = reason;
    showLiveCue({
      phase: 'incoming',
      label: reason,
      detail: 'Backend signal received. Checking this report only.',
      receivedAt: Date.now(),
    });
    setRefreshNonce((n) => n + 1);
  }, [showLiveCue]);

  const pipelineRealtime = useRealtimeChannel<RealtimePayload>('/api/enquiries-unified/stream', {
    event: 'pipeline.changed',
    enabled: Boolean(fromIso && toIso),
    debounceMs: 1800,
    name: 'receptionKpis.pipeline',
    onChange: (payload) => queueRealtimeRefresh(describePipelineSignal(payload)),
  });

  const enquiryRealtime = useRealtimeChannel<RealtimePayload>('/api/enquiries-unified/stream', {
    event: 'enquiries.changed',
    enabled: Boolean(fromIso && toIso),
    debounceMs: 2200,
    name: 'receptionKpis.enquiries',
    onChange: (payload) => queueRealtimeRefresh(describeEnquirySignal(payload)),
  });

  useEffect(() => () => {
    if (liveCueTimerRef.current !== null) {
      window.clearTimeout(liveCueTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!fromIso || !toIso) {
      setData(null);
      return () => { cancelled = true; };
    }
    const initialWindow = initialPayloadWindowRef.current;
    if (initialWindow && initialWindow.from === fromIso && initialWindow.to === toIso && dataRef.current) {
      initialPayloadWindowRef.current = null;
      setLoading(false);
      setError(null);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(null);
    fetch(`/api/reporting/reception-kpis?from=${fromIso}&to=${toIso}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Reception KPIs request failed (${res.status})`);
        return res.json() as Promise<ReceptionKpisResponse>;
      })
      .then((payload) => {
        if (cancelled) return;
        const previous = dataRef.current;
        dataRef.current = payload;
        setData(payload);
        setLastLoadedAt(Date.now());
        const liveReason = liveReasonRef.current;
        if (liveReason) {
          liveReasonRef.current = null;
          showLiveCue({
            phase: 'updated',
            label: liveReason,
            detail: `Reception metrics updated: ${describeTotalsDelta(previous?.totals, payload.totals)}.`,
            receivedAt: Date.now(),
          });
        }
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fromIso, toIso, refreshNonce, showLiveCue]);

  const handleRefresh = () => {
    liveReasonRef.current = null;
    setRefreshNonce((n) => n + 1);
  };

  useEffect(() => {
    setExpandedDrillGroups(new Set());
    setSelectedEvidenceId(null);
    // activeReviewFocus is deliberately not reset on date-range change so the operator's
    // persisted triage preference (localStorage) survives. It's still cleared on first
    // mount via the initialiser below.
    setExpandedBreakdownCallId(null);
    setLinkLookups({});
  }, [fromIso, toIso]);

  // Persist the operator's triage focus across reloads. Initialiser reads the last
  // saved value; the effect writes whenever the user changes it.
  useEffect(() => {
    try { window.localStorage.setItem('helix:reception:reviewFocus', activeReviewFocus); } catch { /* ignore */ }
  }, [activeReviewFocus]);

  const toggleHandlerDrilldown = useCallback((handlerKey: string) => {
    setSelectedEvidenceId(null);
    setExpandedDrillGroups(new Set());
    setExpandedHandler((curr) => (curr === handlerKey ? null : handlerKey));
  }, []);

  const toggleDrillGroup = useCallback((groupKey: string) => {
    setSelectedEvidenceId(null);
    setExpandedDrillGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const handleReviewFocusChange = useCallback((key: ReviewFocusKey) => {
    setSelectedEvidenceId(null);
    setExpandedDrillGroups(new Set());
    setActiveReviewFocus((current) => (key !== 'all' && current === key ? 'all' : key));
  }, []);

  const toggleTranscript = useCallback((recordingId: string) => {
    setOpenTranscripts((prev) => {
      const next = new Set(prev);
      if (next.has(recordingId)) next.delete(recordingId); else next.add(recordingId);
      return next;
    });
    setTranscripts((prev) => {
      if (prev[recordingId] && prev[recordingId].status !== 'error') return prev;
      const next = { ...prev, [recordingId]: { status: 'loading' as const } };
      return next;
    });
    // Fire-and-forget fetch; cached after first load.
    (async () => {
      try {
        const res = await fetch(`/api/reporting/reception-kpis/transcript/${encodeURIComponent(recordingId)}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        setTranscripts((prev) => ({
          ...prev,
          [recordingId]: {
            status: payload.hasTranscript ? 'ready' : 'empty',
            sentences: payload.sentences || [],
            aiStatus: payload.aiStatus || null,
          },
        }));
      } catch (err) {
        setTranscripts((prev) => ({
          ...prev,
          [recordingId]: { status: 'error', error: (err as Error).message },
        }));
      }
    })();
  }, []);

  const loadLinkLookup = useCallback(async (callId: number) => {
    setLinkLookups((prev) => ({ ...prev, [callId]: { status: 'loading' } }));
    try {
      const res = await fetch(`/api/reporting/reception-kpis/link-lookup/${encodeURIComponent(String(callId))}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      setLinkLookups((prev) => ({
        ...prev,
        [callId]: { status: 'ready', candidates: payload.candidates || [] },
      }));
    } catch (err) {
      setLinkLookups((prev) => ({
        ...prev,
        [callId]: { status: 'error', error: (err as Error).message },
      }));
    }
  }, []);

  const applyLinkReview = useCallback(async (row: EvidenceRow, action: 'confirm' | 'reject' | 'manual_link', candidate?: LinkLookupCandidate) => {
    setSavingReviewCallId(row.callId);
    try {
      const res = await fetch(`/api/reporting/reception-kpis/link-review/${encodeURIComponent(String(row.callId))}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          candidateEnquiryId: candidate?.enquiryId ?? null,
          note: action === 'manual_link'
            ? `Manual Reception KPI link to enquiry ${candidate?.enquiryId}`
            : action === 'confirm'
              ? `Confirmed ${matchMechanismLabel(row)}`
              : 'Reviewed with no safe link',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingReviewCallId(null);
    }
  }, []);

  const isFetching = loading;

  const handlers = useMemo(() => {
    if (!data?.handlers) return [];
    return [...data.handlers].sort((a, b) => b.callsTaken - a.callsTaken);
  }, [data]);

  const totals = data?.totals;
  const evidenceRows = useMemo(() => data?.evidence?.rows || [], [data?.evidence?.rows]);
  const conversionStages = data?.conversionStages || null;

  const groupEvidenceByHandler = useCallback((rows: EvidenceRow[]) => {
    const map = new Map<string, EvidenceRow[]>();
    for (const row of rows) {
      const key = handlerLabel(row.handler || 'unknown');
      const bucket = map.get(key) || [];
      bucket.push(row);
      map.set(key, bucket);
    }
    for (const [, bucket] of map) {
      bucket.sort((a, b) => {
        const ta = a.callCreatedAt ? new Date(a.callCreatedAt).getTime() : 0;
        const tb = b.callCreatedAt ? new Date(b.callCreatedAt).getTime() : 0;
        return tb - ta;
      });
    }
    return map;
  }, []);

  const focusedEvidenceRows = useMemo(() => {
    if (activeReviewFocus === 'all') return evidenceRows;
    if (activeReviewFocus === 'mpOnly') return [];
    return evidenceRows.filter((row) => matchesReviewFocus(row, activeReviewFocus));
  }, [activeReviewFocus, evidenceRows]);

  const evidenceByHandler = useMemo(() => groupEvidenceByHandler(evidenceRows), [evidenceRows, groupEvidenceByHandler]);
  const focusedEvidenceByHandler = useMemo(() => groupEvidenceByHandler(focusedEvidenceRows), [focusedEvidenceRows, groupEvidenceByHandler]);

  const mpPickupRows = useMemo(() => data?.phonePickups?.unmatched.rows || [], [data?.phonePickups?.unmatched.rows]);
  const mpPickupTotal = data?.phonePickups?.unmatched.calls || 0;
  const hasMpHandlerRow = handlers.some((h) => handlerLabel(h.handler) === 'MoneyPenny');
  const shouldRenderMpPickupRow = mpPickupTotal > 0 && (activeReviewFocus === 'mpOnly' || (activeReviewFocus === 'all' && !hasMpHandlerRow));
  const visibleHandlers = useMemo(() => {
    if (activeReviewFocus === 'all') return handlers;
    if (activeReviewFocus === 'mpOnly') return [];
    return handlers.filter((h) => (focusedEvidenceByHandler.get(handlerLabel(h.handler)) || []).length > 0);
  }, [activeReviewFocus, focusedEvidenceByHandler, handlers]);

  const reviewFocusTiles = useMemo<ReviewFocusTile[]>(() => {
    const noMatterLinkRows = evidenceRows.filter((row) => matchesReviewFocus(row, 'noMatterLink'));
    const unratedNoteRows = evidenceRows.filter((row) => matchesReviewFocus(row, 'unratedNotes'));
    const formOnlyRows = evidenceRows.filter((row) => matchesReviewFocus(row, 'formOnly'));
    const mismatchRows = evidenceRows.filter((row) => matchesReviewFocus(row, 'identityMismatch'));
    const shortCallRows = evidenceRows.filter((row) => matchesReviewFocus(row, 'shortCalls'));
    return [
      { key: 'all', label: 'All evidence', value: evidenceRows.length, detail: `${fmtInt(handlers.length)} handler${handlers.length === 1 ? '' : 's'} loaded`, tone: 'default', iconName: 'BulletedList' },
      { key: 'noMatterLink', label: 'No matter link', value: noMatterLinkRows.length, detail: 'Calls needing path review', tone: 'red', iconName: 'Link' },
      { key: 'unratedNotes', label: 'Unrated notes', value: unratedNoteRows.length, detail: 'Teams cards still awaiting FE signal', tone: 'orange', iconName: 'EditNote' },
      { key: 'formOnly', label: 'Form-only attribution', value: formOnlyRows.length, detail: 'No Dubber match', tone: 'mute', iconName: 'Help' },
      { key: 'identityMismatch', label: 'Line mismatch', value: mismatchRows.length, detail: 'Dubber line differs from handler', tone: 'highlight', iconName: 'Warning' },
      { key: 'shortCalls', label: 'Short calls', value: shortCallRows.length, detail: 'Under 30 seconds', tone: 'orange', iconName: 'Timer' },
      { key: 'mpOnly', label: 'MoneyPenny recordings', value: mpPickupTotal, detail: 'Unmatched inbound Dubber rows', tone: 'mute', iconName: 'Microphone' },
    ];
  }, [evidenceRows, handlers.length, mpPickupTotal]);

  const activeReviewFocusTile = reviewFocusTiles.find((tile) => tile.key === activeReviewFocus) || reviewFocusTiles[0];
  const activeReviewFocusLabel = activeReviewFocusTile?.label || 'All evidence';

  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textHelp = isDarkMode ? colours.subtleGrey : colours.greyText;
  const liveStatus = pipelineRealtime.status === 'open' || enquiryRealtime.status === 'open'
    ? 'open'
    : pipelineRealtime.status === 'connecting' || enquiryRealtime.status === 'connecting'
      ? 'connecting'
      : 'closed';

  const lowClaritySample = !!(totals && totals.notesRated > 0 && totals.notesRated < 5);
  const totalsClarityColour = totals
    ? clarityColour(clarityBand({ clarityScore: totals.clarityScore, notesRated: totals.notesRated }), isDarkMode)
    : textHelp;

  const chipStyle = summaryChipStyle(isDarkMode);
  const chipLabelStyle = summaryChipLabelStyle();
  const chipValueStyle: CSSProperties = { fontSize: 20, fontWeight: 700, color: textPrimary };

  const kpiBreakdowns = useMemo<Record<KpiKey, KpiBreakdown> | null>(() => {
    if (!totals) return null;

    const rowsOrEmpty = (rows: KpiBreakdownRow[]): KpiBreakdownRow[] => rows.length
      ? rows
      : [{ label: 'No items', value: '0' }];

    const compact = (parts: Array<string | null | undefined>): string => parts
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' · ');

    const itemRows = [...evidenceRows].sort((a, b) => {
      const ta = a.callCreatedAt ? new Date(a.callCreatedAt).getTime() : 0;
      const tb = b.callCreatedAt ? new Date(b.callCreatedAt).getTime() : 0;
      return tb - ta;
    });

    const callTimestamp = (row: EvidenceRow): string | null => row.callCreatedAt || row.callStartedAt || row.dubberStartTimeUtc || null;

    const callReference = (row: EvidenceRow): string => `#${fmtInt(row.callId)}`;

    const callOwner = (row: EvidenceRow): string | null => {
      const matched = row.dubberMatchedInitials?.trim();
      if (matched) return handlerLabel(matched);
      const raw = row.handler?.trim();
      if (!raw || ['dev', 'unknown', 'unattributed'].includes(raw.toLowerCase())) return null;
      return handlerLabel(raw);
    };

    const callType = (row: EvidenceRow): string | null => (row.callType || row.dubberCallType || '').toString().trim() || null;

    const callContext = (
      row: EvidenceRow,
      extra: Array<string | null | undefined> = [],
      options: { includeOwner?: boolean; includeType?: boolean } = {},
    ): string => compact([
      callTimestamp(row) ? fmtDateTime(callTimestamp(row)) : null,
      options.includeOwner === false ? null : callOwner(row),
      options.includeType === false ? null : callType(row),
      row.areaOfWork,
      row.durationSeconds != null ? fmtMSS(row.durationSeconds) : null,
      ...extra,
    ]);

    const callsTakenValue = (row: EvidenceRow): string => row.dubberRecordingId ? 'Call log + Dubber match' : 'Call log only';

    const callsTakenDetail = (row: EvidenceRow): string => row.dubberRecordingId
      ? 'Reception form matched to Dubber'
      : 'Reception form only, no Dubber match';

    const hoverDetail = (row: EvidenceRow): string => compact([
      matchMechanismLabel(row),
      row.review ? reviewStatusLabel(row) : null,
      row.dubberRecordingId ? 'Dubber match' : 'Form source only',
    ]);

    const outcomeValue = (row: EvidenceRow): string => {
      if (row.outcome === 'opened') return row.matterDisplayNumber ? `Matter ${row.matterDisplayNumber}` : 'Matter path resolved';
      if (row.outcome === 'in_progress') return 'Onboarding';
      return row.enquiryId != null || row.enquiryAcid ? 'No matter link' : 'No enquiry link';
    };

    const outcomeTone = (row: EvidenceRow): KpiBreakdownRow['tone'] => {
      if (row.outcome === 'opened') return 'green';
      if (row.outcome === 'in_progress') return 'orange';
      return 'default';
    };

    const notesTone = (row: EvidenceRow): KpiBreakdownRow['tone'] => {
      if (row.notesRating === 'clear') return 'green';
      if (row.notesRating === 'needs_work') return 'orange';
      if (row.notesRating === 'blocking') return 'red';
      return 'default';
    };

    const handledItems = itemRows.filter((row) => String(row.callStatus || '').toLowerCase() === 'handled');
    const timedItems = itemRows.filter((row) => row.durationSeconds != null);
    const openedItems = itemRows.filter((row) => row.outcome === 'opened');
    const inFlightItems = itemRows.filter((row) => row.outcome === 'in_progress');
    const ratedNoteItems = itemRows.filter((row) => Boolean(row.notesRating));

    return {
      callsTaken: {
        title: 'Calls taken',
        value: fmtInt(totals.callsTaken),
        rows: rowsOrEmpty(itemRows.map((row) => ({
          label: callReference(row),
          value: callsTakenValue(row),
          detail: callsTakenDetail(row),
          hoverDetail: hoverDetail(row),
          tone: row.dubberRecordingId ? 'highlight' : 'default',
          evidence: row,
        }))),
      },
      handled: {
        title: 'Handled',
        value: `${fmtInt(totals.callsHandled)} / ${fmtInt(totals.callsTaken)}`,
        rows: rowsOrEmpty(handledItems.map((row) => ({
          label: callReference(row),
          value: outcomeValue(row),
          detail: callContext(row),
          hoverDetail: hoverDetail(row),
          tone: outcomeTone(row),
          evidence: row,
        }))),
      },
      avgCall: {
        title: 'Average call',
        value: fmtMSS(totals.avgCallSeconds),
        rows: rowsOrEmpty(timedItems.map((row) => ({
          label: callReference(row),
          value: fmtMSS(row.durationSeconds),
          detail: callContext(row, [outcomeValue(row)]),
          hoverDetail: hoverDetail(row),
          tone: outcomeTone(row),
          evidence: row,
        }))),
      },
      conversion: {
        title: 'Matter-path resolution',
        value: fmtPct(conversionStages?.callToMatterConversionRate ?? totals.conversionRate),
        rows: rowsOrEmpty(openedItems.map((row) => ({
          label: callReference(row),
          value: row.matterDisplayNumber ? `Matter ${row.matterDisplayNumber}` : 'Matter path resolved',
          detail: callContext(row, ['linked enquiry/instruction path']),
          hoverDetail: hoverDetail(row),
          tone: 'highlight',
          evidence: row,
        }))),
      },
      notesClarity: {
        title: 'Notes clarity',
        value: fmtPct(totals.clarityScore),
        rows: rowsOrEmpty(ratedNoteItems.map((row) => ({
          label: callReference(row),
          value: notesRatingLabel(row.notesRating),
          detail: callContext(row, [outcomeValue(row)]),
          hoverDetail: hoverDetail(row),
          tone: notesTone(row),
          evidence: row,
        }))),
      },
      opened: {
        title: 'Resolved matter paths',
        value: fmtInt(totals.prospectsOpened),
        rows: rowsOrEmpty(openedItems.map((row) => ({
          label: callReference(row),
          value: row.matterDisplayNumber ? `Matter ${row.matterDisplayNumber}` : 'Matter path resolved',
          detail: callContext(row),
          hoverDetail: hoverDetail(row),
          tone: 'green',
          evidence: row,
        }))),
      },
      inFlight: {
        title: 'Onboarding in progress',
        value: fmtInt(totals.prospectsInProgress),
        rows: rowsOrEmpty(inFlightItems.map((row) => ({
          label: callReference(row),
          value: row.instructionRef || 'Onboarding',
          detail: callContext(row),
          hoverDetail: hoverDetail(row),
          tone: 'orange',
          evidence: row,
        }))),
      },
    };
  }, [conversionStages?.callToMatterConversionRate, evidenceRows, totals]);

  const breakdownToneColour = (tone: KpiBreakdownRow['tone']): string => {
    if (tone === 'green') return colours.green;
    if (tone === 'orange') return colours.orange;
    if (tone === 'red') return colours.cta;
    if (tone === 'highlight') return colours.highlight;
    return textPrimary;
  };

  const renderChip = (
    key: KpiKey,
    label: string,
    valueNode: React.ReactNode,
    extraStyle?: CSSProperties,
  ) => (
    <button
      key={key}
      type="button"
      role="tab"
      className={`summary-chip reception-kpi-chip ${expandedKpi === key ? 'is-active' : ''}`}
      style={{ ...chipStyle, cursor: 'pointer' }}
      onClick={() => setExpandedKpi(key)}
      aria-selected={expandedKpi === key}
      aria-expanded={expandedKpi === key}
      aria-controls="reception-kpi-breakdown"
      title={`Show ${label} evidence bench`}
    >
      <span className="reception-kpi-chip-head">
        <span style={chipLabelStyle}>{label}</span>
        <Icon iconName={expandedKpi === key ? 'ChevronUp' : 'ChevronDown'} style={{ fontSize: 11, color: textHelp }} />
      </span>
      <span
        key={`${key}-${fromIso || 'all'}-${toIso || 'all'}`}
        className="reception-kpi-chip-value"
        style={{ ...chipValueStyle, ...(extraStyle || {}) }}
      >
        {valueNode}
      </span>
    </button>
  );

  const renderLiveSignalIndicator = () => {
    const label = liveCue ? liveCue.label : liveStatusLabel(liveStatus);
    return (
    <div
      className={`reception-live-indicator reception-live-indicator--${liveCue?.phase || liveStatus}`}
      data-helix-region="reports/reception/live-signals"
      role="status"
      aria-label={label}
      title={label}
    >
      <span className={`reception-live-square reception-live-square--${liveStatus}`} />
    </div>
    );
  };

  const renderKpiStrip = () => {
    if (!totals) {
      return (
        <div className="summary-skeleton-grid dashboard-kpi-summary reception-skeleton-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`reception-summary-skeleton-${i}`} className="summary-skeleton-card reception-skeleton-card">
              <div className="summary-skeleton-label reception-skeleton-bar" />
              <div className="summary-skeleton-value reception-skeleton-bar" />
            </div>
          ))}
        </div>
      );
    }
    const stripClasses = [
      'dashboard-kpi-summary',
      liveCue?.phase === 'updated' ? 'reception-live-updated' : '',
      isFetching && data ? 'reception-kpi-strip--fetching' : '',
    ].filter(Boolean).join(' ');
    return (
      <div
        className={`${stripClasses} reception-kpi-tablist`}
        role="tablist"
        aria-label="Reception KPI evidence benches"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}
        data-range-key={`${fromIso || 'all'}|${toIso || 'all'}`}
      >
        {renderChip('callsTaken', 'Calls taken', fmtInt(totals.callsTaken))}
        {renderChip('handled', 'Handled', (
          <>
            {fmtInt(totals.callsHandled)}
            <span style={{ color: textHelp, fontWeight: 500, fontSize: 14 }}> / {fmtInt(totals.callsTaken)}</span>
          </>
        ))}
        {renderChip('avgCall', 'Avg call', fmtMSS(totals.avgCallSeconds))}
        {renderChip('conversion', 'Matter path rate', fmtPct(conversionStages?.callToMatterConversionRate ?? totals.conversionRate), { color: colours.highlight })}
        {renderChip(
          'notesClarity',
          `Notes clarity${lowClaritySample ? ' · low sample' : ''}`,
          fmtPct(totals.clarityScore),
          { color: totalsClarityColour },
        )}
        {renderChip('opened', 'Resolved matters', fmtInt(totals.prospectsOpened), { color: colours.green })}
        {renderChip('inFlight', 'Onboarding', fmtInt(totals.prospectsInProgress), { color: colours.orange })}
      </div>
    );
  };

  const renderConversionStagesStrip = () => {
    if (!totals) return null;
    const callsLogged = conversionStages?.callsLogged ?? totals.callsTaken;
    const matterOpened = conversionStages?.matterOpened ?? totals.prospectsOpened;
    const onboarding = conversionStages?.onboardingInProgress ?? totals.prospectsInProgress;
    const noMatterLink = conversionStages?.noMatterLink ?? Math.max(0, callsLogged - matterOpened - onboarding);
    const enquiryLinked = conversionStages?.enquiryLinked ?? null;
    const noEnquiryLink = conversionStages?.noEnquiryLink ?? null;
    const stageTiles = [
      { key: 'logged', label: 'Logged calls', value: fmtInt(callsLogged), detail: 'Reception form rows', tone: 'default' as const },
      { key: 'enquiry', label: 'Enquiry linked', value: enquiryLinked == null ? '-' : fmtInt(enquiryLinked), detail: 'call has enquiry id', tone: 'default' as const },
      { key: 'onboarding', label: 'Onboarding', value: fmtInt(onboarding), detail: 'instruction started', tone: 'orange' as const },
      { key: 'opened', label: 'Matter path', value: fmtInt(matterOpened), detail: 'resolved via instruction or matter row', tone: 'green' as const },
      {
        key: 'missing',
        label: 'No matter link',
        value: fmtInt(noMatterLink),
        detail: noEnquiryLink && noEnquiryLink > 0 ? `${fmtInt(noEnquiryLink)} no enquiry link` : 'visible in drilldown',
        tone: 'red' as const,
      },
      { key: 'rate', label: 'Matter path rate', value: fmtPct(conversionStages?.callToMatterConversionRate ?? totals.conversionRate), detail: 'resolved matter paths / calls', tone: 'highlight' as const },
    ];

    return (
      <div className="reception-conversion-stitch" data-helix-region="reports/reception/conversion-stages">
        <div className="reception-conversion-stitch-head">
          <span className="reception-conversion-stitch-title" style={{ color: textPrimary }}>Call-to-matter stitching</span>
          <span className="reception-conversion-stitch-sub" style={{ color: textHelp }}>Path-resolution view, not causal attribution for why a matter opened</span>
        </div>
        <div className="reception-conversion-stitch-grid">
          {stageTiles.map((tile) => (
            <div key={tile.key} className={`reception-conversion-stage reception-conversion-stage--${tile.tone}`}>
              <span className="reception-conversion-stage-label" style={{ color: textHelp }}>{tile.label}</span>
              <span className="reception-conversion-stage-value" style={{ color: breakdownToneColour(tile.tone) }}>{tile.value}</span>
              <span className="reception-conversion-stage-detail" style={{ color: textBody }}>{tile.detail}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReviewFocusStrip = () => {
    if (!totals) return null;
    return (
      <div className="reception-review-focus" data-helix-region="reports/reception/review-focus">
        <div className="reception-review-focus-head">
          <span className="reception-review-focus-title" style={{ color: textPrimary }}>Review focus</span>
          <span className="reception-review-focus-sub" style={{ color: textHelp }}>
            Click a signal to focus the handler table on calls worth checking first.
          </span>
        </div>
        <div className="reception-review-focus-grid">
          {reviewFocusTiles.map((tile) => {
            const isActive = activeReviewFocus === tile.key;
            const isDisabled = tile.key !== 'all' && tile.value === 0;
            const toneColour = tile.tone === 'mute' ? textHelp : breakdownToneColour(tile.tone);
            return (
              <button
                key={tile.key}
                type="button"
                className={`reception-review-focus-tile reception-review-focus-tile--${tile.tone} ${isActive ? 'is-active' : ''}`}
                onClick={() => handleReviewFocusChange(tile.key)}
                disabled={isDisabled}
                aria-pressed={isActive}
                title={isActive && tile.key !== 'all' ? `Clear ${tile.label} focus` : `Focus ${tile.label}`}
              >
                <span className="reception-review-focus-tile-top">
                  <Icon iconName={tile.iconName} style={{ fontSize: 12, color: toneColour }} />
                  <span className="reception-review-focus-label" style={{ color: textHelp }}>{tile.label}</span>
                </span>
                <span className="reception-review-focus-value" style={{ color: toneColour }}>{fmtInt(tile.value)}</span>
                <span className="reception-review-focus-detail" style={{ color: textBody }}>{tile.detail}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderReportContextPanel = () => {
    if (!totals) return null;
    const noMatterCount = reviewFocusTiles.find((tile) => tile.key === 'noMatterLink')?.value ?? 0;
    const formOnlyCount = reviewFocusTiles.find((tile) => tile.key === 'formOnly')?.value ?? 0;
    const mismatchCount = reviewFocusTiles.find((tile) => tile.key === 'identityMismatch')?.value ?? 0;
    const summaryParts = [
      `Matter path rate ${fmtPct(conversionStages?.callToMatterConversionRate ?? totals.conversionRate)}`,
      `${fmtInt(noMatterCount)} no matter`,
      formOnlyCount > 0 ? `${fmtInt(formOnlyCount)} form-only` : null,
      mismatchCount > 0 ? `${fmtInt(mismatchCount)} mismatch` : null,
      activeReviewFocus !== 'all' ? `Focused: ${activeReviewFocusLabel}` : null,
    ].filter((part): part is string => Boolean(part));

    return (
      <section className={`reception-report-context ${reportContextOpen ? 'is-open' : ''}`} data-helix-region="reports/reception/context-drawer">
        <button
          type="button"
          className="reception-report-context-trigger"
          onClick={() => setReportContextOpen((open) => !open)}
          aria-expanded={reportContextOpen}
        >
          <span className="reception-report-context-title" style={{ color: textPrimary }}>
            <Icon iconName={reportContextOpen ? 'ChevronUp' : 'ChevronDown'} style={{ fontSize: 12, color: textHelp }} />
            <span>Report context</span>
          </span>
          <span className="reception-report-context-summary" style={{ color: textHelp }}>{summaryParts.join(' / ')}</span>
        </button>
        {reportContextOpen && (
          <div className="reception-report-context-body">
            {renderConversionStagesStrip()}
            {renderReviewFocusStrip()}
          </div>
        )}
      </section>
    );
  };

  const renderKpiBreakdown = () => {
    const breakdown = expandedKpi && kpiBreakdowns ? kpiBreakdowns[expandedKpi] : null;
    if (!breakdown) return null;

    return (
      <div className="reception-kpi-breakdown" id="reception-kpi-breakdown" data-helix-region="reports/reception/kpi-breakdown">
        <div className="reception-kpi-breakdown-head">
          <div className="reception-kpi-breakdown-title" style={{ color: textPrimary }}>
            <span>{breakdown.title}</span>
            <strong>{breakdown.value}</strong>
          </div>
          <p style={{ color: textHelp }}>
            {fmtInt(breakdown.rows.filter((row) => row.evidence).length)} source line item{breakdown.rows.filter((row) => row.evidence).length === 1 ? '' : 's'} behind this metric.
          </p>
        </div>
        <div className="reception-kpi-bench" role="table" aria-label={`${breakdown.title} evidence bench`}>
          <div className="reception-kpi-bench-head" role="row" style={{ color: textHelp }}>
            <span>Call</span>
            <span>{expandedKpi === 'callsTaken' ? 'Source evidence' : 'Metric evidence'}</span>
            <span>Matter path</span>
            <span>Match</span>
          </div>
          {breakdown.rows.map((row) => {
            const evidence = row.evidence;
            if (!evidence) {
              return (
                <div key={`${breakdown.title}-${row.label}`} className="reception-kpi-bench-empty" style={{ color: textHelp }}>
                  {row.label} · {row.value}
                </div>
              );
            }
            const isExpanded = Boolean(evidence && expandedBreakdownCallId === evidence.callId);
            const lookup = evidence ? linkLookups[evidence.callId] : null;
            const canConfirm = Boolean(evidence && evidence.joinConfidence !== 'unlinked');
            const canLookup = Boolean(evidence && (evidence.joinConfidence === 'unlinked' || evidence.outcome === 'unlinked'));
            const reviewStatus = evidence ? reviewStatusLabel(evidence) : null;
            const isSaving = Boolean(evidence && savingReviewCallId === evidence.callId);
            const callAt = fmtDateTime(evidence.callCreatedAt || evidence.callStartedAt || evidence.dubberStartTimeUtc);
            const callerName = [evidence.firstName, evidence.lastName].filter(Boolean).join(' ').trim();
            const sourceLabel = evidence.dubberRecordingId ? 'Dubber matched' : 'Form only';
            const pathLabel = evidence.matterDisplayNumber
              ? `Matter ${evidence.matterDisplayNumber}`
              : evidence.instructionRef
                ? evidence.instructionRef
                : evidence.enquiryAcid
                  ? `Enquiry ${evidence.enquiryAcid}`
                  : evidence.enquiryId != null
                    ? `Enquiry #${fmtInt(evidence.enquiryId)}`
                    : 'No linked enquiry';
            const pathDetail = evidence.outcome === 'opened'
              ? 'Resolved matter path'
              : evidence.outcome === 'in_progress'
                ? 'Onboarding in progress'
                : evidence.enquiryId != null || evidence.enquiryAcid
                  ? 'Needs matter path review'
                  : 'Needs enquiry lookup';

            return (
              <div
                key={`${breakdown.title}-${row.label}`}
                className={`reception-kpi-bench-row ${isExpanded ? 'is-expanded' : ''}`}
              >
                <button
                  type="button"
                  className="reception-kpi-bench-trigger"
                  onClick={() => setExpandedBreakdownCallId((current) => (current === evidence.callId ? null : evidence.callId))}
                  aria-expanded={isExpanded}
                >
                  <span className="reception-kpi-bench-cell reception-kpi-bench-cell--call">
                    <strong style={{ color: textPrimary }}>{row.label}</strong>
                    <span style={{ color: textHelp }}>{callAt || 'No timestamp'}</span>
                  </span>
                  <span className="reception-kpi-bench-cell reception-kpi-bench-cell--metric">
                    <strong style={{ color: breakdownToneColour(row.tone) }}>{row.value}</strong>
                    <span style={{ color: textBody }}>{row.detail || callerName || sourceLabel}</span>
                  </span>
                  <span className="reception-kpi-bench-cell">
                    <strong style={{ color: textPrimary }}>{pathLabel}</strong>
                    <span style={{ color: textHelp }}>{pathDetail}</span>
                  </span>
                  <span className="reception-kpi-bench-cell reception-kpi-bench-cell--match">
                    <strong style={{ color: textPrimary }}>{matchMechanismLabel(evidence)}</strong>
                    <span style={{ color: textHelp }}>{reviewStatus || sourceLabel}</span>
                  </span>
                </button>
                {isExpanded && evidence && (
                  <div className="reception-kpi-bench-detail">
                    <div className="reception-kpi-breakdown-review-line">
                      <span style={{ color: textHelp }}>Match</span>
                      <strong style={{ color: textPrimary }}>{matchMechanismLabel(evidence)}</strong>
                    </div>
                    <div className="reception-kpi-breakdown-review-copy" style={{ color: textBody }}>{evidence.confidenceReason}</div>
                    {row.hoverDetail && <div className="reception-kpi-breakdown-review-copy" style={{ color: textHelp }}>{row.hoverDetail}</div>}
                    {evidence.review?.reviewedAt && (
                      <div className="reception-kpi-breakdown-review-copy" style={{ color: textHelp }}>
                        Reviewed {fmtDateTime(evidence.review.reviewedAt)}{evidence.review.reviewedBy ? ` by ${evidence.review.reviewedBy}` : ''}.
                      </div>
                    )}
                    <div className="reception-kpi-breakdown-actions">
                      {canConfirm && (
                        <button type="button" onClick={() => applyLinkReview(evidence, 'confirm')} disabled={isSaving}>
                          Confirm match
                        </button>
                      )}
                      <button type="button" onClick={() => applyLinkReview(evidence, 'reject')} disabled={isSaving}>
                        {canConfirm ? 'Reject match' : 'Mark reviewed'}
                      </button>
                      {canLookup && (
                        <button type="button" onClick={() => loadLinkLookup(evidence.callId)} disabled={isSaving || lookup?.status === 'loading'}>
                          {lookup?.status === 'loading' ? 'Looking up...' : 'Find possible link'}
                        </button>
                      )}
                    </div>
                    {canLookup && lookup?.status === 'error' && (
                      <div className="reception-kpi-breakdown-lookup-note" style={{ color: colours.cta }}>Lookup failed: {lookup.error}</div>
                    )}
                    {canLookup && lookup?.status === 'ready' && (
                      <div className="reception-kpi-breakdown-candidates">
                        {(lookup.candidates || []).length === 0 ? (
                          <div className="reception-kpi-breakdown-lookup-note" style={{ color: textHelp }}>No likely enquiry candidates found for this call.</div>
                        ) : (lookup.candidates || []).map((candidate) => (
                          <div key={candidate.enquiryId} className={`reception-kpi-breakdown-candidate reception-kpi-breakdown-candidate--${candidate.confidence}`}>
                            <div className="reception-kpi-breakdown-candidate-main">
                              <strong style={{ color: textPrimary }}>{candidate.leadName || `Enquiry ${candidate.enquiryId}`}</strong>
                              <span style={{ color: textHelp }}>
                                {candidate.instructionRef || `Enquiry ${candidate.enquiryId}`}
                                {candidate.matterDisplayNumber ? ` · Matter ${candidate.matterDisplayNumber}` : ''}
                              </span>
                            </div>
                            <div className="reception-kpi-breakdown-candidate-meta" style={{ color: textBody }}>
                              {candidate.reasons.join(' · ') || `${candidate.confidence} confidence`} · score {fmtInt(candidate.score)}
                            </div>
                            <button type="button" onClick={() => applyLinkReview(evidence, 'manual_link', candidate)} disabled={isSaving}>
                              Link this enquiry
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMpPickupRows = (rows: PhonePickupEvidenceRow[], totalCalls: number) => {
    const drillGroups = buildDrillPeriodGroups('MoneyPenny', rows, (row) => row.startedAt);
    const callsCopy = rows.length < totalCalls
      ? `showing latest ${fmtInt(rows.length)} of ${fmtInt(totalCalls)} calls in range`
      : `${fmtInt(rows.length)} call${rows.length === 1 ? '' : 's'} in range`;

    const renderPickupRows = (groupRows: PhonePickupEvidenceRow[], groupKey: string) => (
      <div className="reception-handler-drill-rows">
        {groupRows.map((row, idx) => {
          const id = row.recordingId || `${groupKey}-${idx}`;
          const shortId = row.recordingId ? row.recordingId.slice(-8) : 'No ID';
          return (
            <div key={id} className="reception-handler-drill-row reception-handler-drill-row--static" data-source="dubber">
              <span className="reception-handler-drill-cell reception-handler-drill-cell--handler">
                <span className="reception-handler-drill-submission">
                  <span className="reception-handler-drill-submission-title" style={{ color: textPrimary }}>{shortId}</span>
                  <span className="reception-handler-drill-submission-meta" style={{ color: textHelp }}>MoneyPenny</span>
                </span>
              </span>
              <span className="reception-handler-drill-cell" style={{ color: textBody }}>
                {fmtDateTime(row.startedAt)?.split(', ').slice(-1)[0] || fmtDateTime(row.startedAt)}
              </span>
              <span className="reception-handler-drill-cell reception-handler-drill-duration">
                <span style={{ color: textBody }}>{fmtMSS(row.durationSeconds)}</span>
                <span className="reception-handler-drill-source-pill reception-handler-drill-source-pill--dubber">
                  <Icon iconName="Microphone" style={{ fontSize: 9 }} />
                  <span>Dubber</span>
                </span>
              </span>
              <span className="reception-handler-drill-cell" style={{ color: textBody }}>{row.callType || 'Inbound'}</span>
              <span className="reception-handler-drill-cell" style={{ color: textHelp }}>{row.aiStatus || '-'}</span>
              <span className="reception-handler-drill-cell" />
            </div>
          );
        })}
      </div>
    );

    return (
      <div className="reception-handler-drill" id="reception-handler-calls-MoneyPenny" data-helix-region="reports/reception/mp-drilldown">
        <div className="reception-handler-drill-head reception-handler-drill-head--continuation" style={{ color: textHelp }}>
          <span className="reception-handler-drill-heading">
            <span style={{ color: textPrimary, fontWeight: 700 }}>Pickup detail</span>
            <span>{callsCopy}</span>
          </span>
        </div>
        {drillGroups.map((group) => {
          const isGroupExpanded = expandedDrillGroups.has(group.key);
          const metaParts = [
            `${fmtInt(group.rows.length)} call${group.rows.length === 1 ? '' : 's'}`,
            group.kind === 'week' ? `${fmtInt(group.days.length)} day${group.days.length === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={group.key} className="reception-handler-drill-group">
              <button
                type="button"
                className={`reception-handler-drill-day reception-handler-drill-fold ${group.kind === 'week' ? 'reception-handler-drill-day--week' : ''}`}
                onClick={() => toggleDrillGroup(group.key)}
                aria-expanded={isGroupExpanded}
              >
                <span className="reception-handler-drill-day-label" style={{ color: textPrimary }}>
                  <Icon iconName={isGroupExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 10, color: textHelp }} />
                  <span>{group.label}</span>
                </span>
                <span className="reception-handler-drill-day-meta" style={{ color: textHelp }}>{metaParts}</span>
              </button>
              {isGroupExpanded && (
                <>
                  <div className="reception-handler-drill-subhead" style={{ color: textHelp }} aria-hidden="true">
                    <span>Recording</span>
                    <span>Time</span>
                    <span>Duration</span>
                    <span>Source</span>
                    <span>Status</span>
                    <span />
                  </div>
                  {group.kind === 'week'
                    ? group.days.map((dayGroup) => (
                      <React.Fragment key={dayGroup.key}>
                        <div className="reception-handler-drill-subday">
                          <span style={{ color: textPrimary }}>{dayGroup.label}</span>
                          <span style={{ color: textHelp }}>{fmtInt(dayGroup.rows.length)} call{dayGroup.rows.length === 1 ? '' : 's'}</span>
                        </div>
                        {renderPickupRows(dayGroup.rows, dayGroup.key)}
                      </React.Fragment>
                    ))
                    : renderPickupRows(group.rows, group.key)}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderMpPickupDrilldown = (rows: PhonePickupEvidenceRow[], totalCalls: number) => {
    if (!rows.length) {
      return (
        <div className="reception-handler-drill" id="reception-handler-calls-MoneyPenny">
          <div className="reception-handler-drill-empty" style={{ color: textBody }}>No MoneyPenny recordings returned for this date range yet.</div>
        </div>
      );
    }
    return renderMpPickupRows(rows, totalCalls);
  };

  const renderHandlerTable = () => (
    <div className="metrics-table reception-handler-table">
      <div className="metrics-table-header">
        <span>Handler</span>
        <span>Calls</span>
        <span>Marked handled</span>
        <span>Avg call</span>
        <span>Latest call</span>
        <span>Notes clarity</span>
      </div>
      {visibleHandlers.map((h) => {
        const band = clarityBand(h);
        const lowSample = h.notesRated > 0 && h.notesRated < 5;
        const handlerKey = handlerLabel(h.handler);
        const allHandlerCalls = evidenceByHandler.get(handlerKey) || [];
        const handlerCalls = activeReviewFocus === 'all' ? allHandlerCalls : (focusedEvidenceByHandler.get(handlerKey) || []);
        const latestCallAt = handlerCalls[0]?.callCreatedAt || null;
        const isExpanded = expandedHandler === handlerKey;
        const canExpand = handlerCalls.length > 0;
        return (
          <React.Fragment key={h.handler}>
            <div className={`metrics-table-row animate-table-row ${isExpanded ? 'is-expanded' : ''}`}>
              <span className="metrics-cell metrics-cell--member" style={{ color: textPrimary, fontWeight: 600 }}>
                <span className="reception-handler-member-stack">
                  {canExpand ? (
                    <button
                      type="button"
                      className={`reception-handler-trigger ${isExpanded ? 'is-active' : ''}`}
                      onClick={() => toggleHandlerDrilldown(handlerKey)}
                      aria-expanded={isExpanded}
                      aria-controls={`reception-handler-calls-${handlerKey}`}
                      title={`${isExpanded ? 'Hide' : 'Show'} ${handlerKey}'s calls in this range`}
                    >
                      <span className="reception-handler-trigger-icon">
                        <Icon iconName={isExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 10 }} />
                      </span>
                      <span className="reception-handler-trigger-name">{handlerKey}</span>
                    </button>
                  ) : (
                    <span className="reception-handler-static">{handlerKey}</span>
                  )}
                </span>
              </span>
              <span className="metrics-cell metrics-cell--value" style={{ color: textPrimary }}>{h.callsTaken}</span>
              <span className="metrics-cell metrics-cell--value" style={{ color: textBody }}>{h.callsHandled}</span>
              <span className="metrics-cell metrics-cell--value" style={{ color: textBody }}>{fmtMSS(h.avgCallSeconds)}</span>
              <span className="metrics-cell metrics-cell--value reception-date-cell" style={{ color: textBody }}>
                <span className="reception-date-stamp">{fmtDateTime(latestCallAt)}</span>
              </span>
              <span className="metrics-cell metrics-cell--value">
                {h.notesRated === 0 ? (
                  <span style={{ color: textHelp }}>–</span>
                ) : (
                  <span style={{ color: clarityColour(band, isDarkMode), fontWeight: 600 }}>
                    {fmtPct(h.clarityScore)}
                    <span style={{ color: textHelp, fontWeight: 500 }}> ({h.notesClear}/{h.notesRated})</span>
                    {lowSample && <span style={{ color: textHelp, fontWeight: 500 }}> · low sample</span>}
                  </span>
                )}
              </span>
            </div>
            {isExpanded && renderHandlerDrilldown(handlerKey, handlerCalls, h.callsTaken)}
          </React.Fragment>
        );
      })}
      {activeReviewFocus !== 'all' && visibleHandlers.length === 0 && !shouldRenderMpPickupRow && (
        <div className="reception-focus-empty-row" style={{ color: textBody }}>
          No calls match {activeReviewFocusLabel.toLowerCase()} in this window.
        </div>
      )}
      {shouldRenderMpPickupRow && (() => {
        const pickups = data?.phonePickups?.unmatched;
        const canExpand = mpPickupRows.length > 0;
        const isExpanded = expandedHandler === 'MoneyPenny';
        return (
          <React.Fragment key="mp-phone-pickups">
            <div className={`metrics-table-row animate-table-row ${isExpanded ? 'is-expanded' : ''}`}>
              <span className="metrics-cell metrics-cell--member" style={{ color: textPrimary, fontWeight: 600 }}>
                {canExpand ? (
                  <button
                    type="button"
                    className={`reception-handler-trigger ${isExpanded ? 'is-active' : ''}`}
                    onClick={() => toggleHandlerDrilldown('MoneyPenny')}
                    aria-expanded={isExpanded}
                    aria-controls="reception-handler-calls-MoneyPenny"
                    title={`${isExpanded ? 'Hide' : 'Show'} MoneyPenny calls in this range`}
                  >
                    <span className="reception-handler-trigger-icon">
                      <Icon iconName={isExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 10 }} />
                    </span>
                    <span className="reception-handler-trigger-name">MoneyPenny</span>
                  </button>
                ) : (
                  <span className="reception-handler-static">MoneyPenny</span>
                )}
              </span>
              <span className="metrics-cell metrics-cell--value" style={{ color: textPrimary }}>{fmtInt(mpPickupTotal)}</span>
              <span className="metrics-cell metrics-cell--value" style={{ color: textHelp }}>-</span>
              <span className="metrics-cell metrics-cell--value" style={{ color: textBody }}>{fmtMSS(pickups?.avgCallSeconds)}</span>
              <span className="metrics-cell metrics-cell--value reception-date-cell" style={{ color: textBody }}>
                <span className="reception-date-stamp">{fmtDateTime(pickups?.lastCallAt)}</span>
              </span>
              <span className="metrics-cell metrics-cell--value" style={{ color: textHelp }}>-</span>
            </div>
            {isExpanded && renderMpPickupDrilldown(mpPickupRows, mpPickupTotal)}
          </React.Fragment>
        );
      })()}
    </div>
  );

  const renderPhonePickupsStrip = () => {
    const pickups = data?.phonePickups;
    if (!pickups) return null;
    const RECEPTION_INITIALS = ['EA', 'KW', 'WH'] as const;
    const RECEPTION_LABELS: Record<string, string> = { EA: 'Emma', KW: 'Kanchel', WH: 'Wolfgang' };
    const byInitials = new Map(pickups.handlers.map((h) => [h.handlerInitials, h] as const));
    const orderedReception = RECEPTION_INITIALS.map((init) => ({
      init,
      label: RECEPTION_LABELS[init],
      row: byInitials.get(init) || null,
    }));
    const hasUnmatched = pickups.unmatched.calls > 0;
    return (
      <div className="reception-phone-pickups" data-helix-region="reports/reception/phone-pickups">
        <div className="reception-phone-pickups-head">
          <span className="reception-phone-pickups-title" style={{ color: textPrimary }}>Phone pickups (reception team)</span>
          <span className="reception-phone-pickups-sub" style={{ color: textHelp }}>
            External inbound calls Dubber matched to Emma, Kanchel or Wolfgang. Internal Helix-to-Helix calls excluded. Unmatched bucket is the MoneyPenny / missed-match proxy and is shown for reference, not as a KPI.
          </span>
        </div>
        <div className="reception-phone-pickups-grid">
          {orderedReception.map(({ init, label, row }) => (
            <div key={init} className="reception-phone-pickup-tile">
              <div className="reception-phone-pickup-initials" style={{ color: textPrimary }}>{init} · {label}</div>
              <div className="reception-phone-pickup-calls" style={{ color: textPrimary }}>{fmtInt(row?.calls ?? 0)}</div>
              <div className="reception-phone-pickup-meta" style={{ color: textHelp }}>
                {row ? (
                  <>
                    avg {fmtMSS(row.avgCallSeconds)}
                    {row.shortCalls > 0 && <span> · {fmtInt(row.shortCalls)} short</span>}
                  </>
                ) : (
                  <span>no Dubber match in window</span>
                )}
              </div>
              {row?.handlerEmail && (
                <div className="reception-phone-pickup-meta" style={{ color: textHelp }}>via {row.handlerEmail}</div>
              )}
              {row?.lastCallAt && (
                <div className="reception-phone-pickup-meta" style={{ color: textHelp }}>last {fmtDateTime(row.lastCallAt)}</div>
              )}
            </div>
          ))}
          {hasUnmatched && (
            <div
              className="reception-phone-pickup-tile reception-phone-pickup-tile--unmatched"
              title="Inbound external calls Dubber could not match to a Helix team member. Most likely MoneyPenny, missed, or a matching failure."
            >
              <div className="reception-phone-pickup-initials" style={{ color: colours.orange }}>MoneyPenny</div>
              <div className="reception-phone-pickup-calls" style={{ color: textPrimary }}>{fmtInt(pickups.unmatched.calls)}</div>
              <div className="reception-phone-pickup-meta" style={{ color: textHelp }}>
                avg {fmtMSS(pickups.unmatched.avgCallSeconds)}
                {pickups.unmatched.shortCalls > 0 && <span> · {fmtInt(pickups.unmatched.shortCalls)} short</span>}
              </div>
              <div className="reception-phone-pickup-meta" style={{ color: textHelp }}>reference only, not a reception KPI</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSubmissionTray = (row: EvidenceRow) => {
    const handlerName = handlerLabel(row.handler);
    const durationFragment = row.durationSeconds
      ? `${fmtMSS(row.durationSeconds)} ${row.durationSource === 'dubber' ? 'Dubber match' : 'no Dubber match'}`
      : 'no duration';
    const headline = `${handlerName} · ${fmtDateTime(row.callCreatedAt)} · ${durationFragment}`;

    // Five-stage downstream journey: Call -> Notes -> Enquiry -> Instruction -> Matter.
    const hasTeamsCard = Boolean(row.teamsActivityId || row.activityId);
    const notesStatus: WorkbenchJourneyStage['status'] = row.notesRating === 'clear'
      ? 'complete'
      : row.notesRating === 'needs_work'
        ? 'review'
        : row.notesRating === 'blocking'
          ? 'warning'
          : hasTeamsCard
            ? 'pending'
            : 'disabled';
    const enquiryStatus: WorkbenchJourneyStage['status'] = row.enquiryId != null ? 'complete' : 'pending';
    const instructionStatus: WorkbenchJourneyStage['status'] = row.instructionRef
      ? (row.outcome === 'in_progress' ? 'current' : 'complete')
      : row.enquiryId != null ? 'pending' : 'disabled';
    const matterStatus: WorkbenchJourneyStage['status'] = (row.matterId || row.matterDisplayNumber)
      ? 'complete'
      : row.instructionRef ? 'pending' : 'disabled';

    // ── Caller / context strip (hoisted: also consumed by the timeline below) ──
    const callerName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null;
    const callerLabel = row.firstName
      ? `${row.firstName}${row.lastName ? ` ${row.lastName.charAt(0).toUpperCase()}.` : ''}`
      : null;
    const callTypeLabel = (row.callType || row.dubberCallType || '').toString().trim() || null;
    const callTypeKind = callTypeMeta(row.callType || row.dubberCallType);
    const aowLabel = (row.areaOfWork || '').toString().trim() || null;
    const aowAccent = aowLabel ? aowColour(aowLabel, isDarkMode) : null;
    const handlerInitials = (row.handler || '').toUpperCase();
    const matchedInitials = (row.dubberMatchedInitials || '').toUpperCase();
    const mismatch = matchedInitials && handlerInitials && matchedInitials !== handlerInitials;
    const identity = identityConfidenceMeta(row);
    const hasContextRow = Boolean(callerLabel || row.phone || aowLabel || callTypeLabel || mismatch || identity);

    // ── Chronological timeline events ──
    type TimelineEvent = {
      key: string;
      iso: string | null;
      channel: 'call' | 'dubber' | 'teams' | 'rated' | 'enquiry' | 'instruction' | 'matter';
      title: string;
      detail?: string;
      iconName: string;
      pending?: boolean;
    };
    const events: TimelineEvent[] = [];
    // 1. Phone call itself. Dubber's start_time_utc is the true call start when present;
    //    fall back to the form's call_started_at (handler-claimed) only if no Dubber row.
    const phoneCallIso = row.dubberStartTimeUtc || row.callStartedAt || null;
    const phoneDetailParts: string[] = [];
    if (row.dubberMatchedInitials) phoneDetailParts.push(`Answered by ${row.dubberMatchedInitials}`);
    else if (row.handler) phoneDetailParts.push(`Handler ${row.handler.toUpperCase()} (form-attested)`);
    if (row.durationSeconds != null) phoneDetailParts.push(fmtMSS(row.durationSeconds));
    if (!row.dubberRecordingId) phoneDetailParts.push('no Dubber match');
    events.push({
      key: 'phone-call',
      iso: phoneCallIso,
      channel: row.dubberRecordingId ? 'dubber' : 'call',
      title: 'Phone call in',
      detail: phoneDetailParts.join(' · ') || undefined,
      iconName: row.dubberRecordingId ? 'CheckMark' : 'Phone',
    });
    // 2. Intake form submission. created_at = when the row landed; call_submitted_at when
    //    the handler hit submit (often within seconds of created_at).
    const formIso = row.callSubmittedAt || row.callCreatedAt || null;
    if (formIso) {
      events.push({
        key: 'form-submitted',
        iso: formIso,
        channel: 'call',
        title: 'Reception form submitted',
        detail: callTypeLabel ? `${callTypeLabel}${callerLabel ? ` · ${callerLabel}` : ''}` : (callerLabel || undefined),
        iconName: 'TextDocument',
      });
    }
    if (hasTeamsCard) {
      events.push({
        key: 'teams',
        iso: row.teamsMessageTimestamp || row.claimedAt || null,
        channel: 'teams',
        title: row.claimedBy ? `Teams card claimed by ${row.claimedBy}` : 'Teams card posted',
        detail: row.teamsCardType || undefined,
        iconName: 'TeamsLogo',
      });
    }
    if (row.notesRating || (hasTeamsCard && row.notesRatedAt)) {
      events.push({
        key: 'rated',
        iso: row.notesRatedAt || null,
        channel: 'rated',
        title: row.notesRating ? `Notes rated ${notesRatingLabel(row.notesRating).toLowerCase()}` : 'Awaiting notes rating',
        iconName: 'EditNote',
        pending: !row.notesRating,
      });
    } else if (hasTeamsCard) {
      events.push({
        key: 'rated',
        iso: null,
        channel: 'rated',
        title: 'Awaiting notes rating',
        iconName: 'EditNote',
        pending: true,
      });
    }
    if (row.enquiryId != null || row.enquiryAcid) {
      events.push({
        key: 'enquiry',
        iso: row.enquiryCreatedAt || null,
        channel: 'enquiry',
        title: row.enquiryAcid ? `Enquiry ${row.enquiryAcid}` : `Enquiry #${fmtInt(row.enquiryId!)}`,
        detail: row.referralSource ? `via ${row.referralSource}` : undefined,
        iconName: 'ContactCard',
      });
    }
    if (row.instructionRef) {
      events.push({
        key: 'instruction',
        iso: row.instructionSubmittedAt || null,
        channel: 'instruction',
        title: `Instruction ${row.instructionRef}`,
        detail: row.instructionStage || undefined,
        iconName: 'PageList',
      });
    }
    if (row.matterDisplayNumber || row.matterId) {
      events.push({
        key: 'matter',
        iso: row.matterOpenedAt || null,
        channel: 'matter',
        title: `Matter ${row.matterDisplayNumber || row.matterId}`,
        detail: row.callToMatterHours != null ? `Opened ${fmtHours(row.callToMatterHours)} after call` : undefined,
        iconName: 'OpenFolderHorizontal',
      });
    }
    // Order events by lifecycle (phone -> form -> teams -> rated -> enquiry -> instruction -> matter),
    // breaking ties on iso. Reverse so the most recent step sits at the top of the tray.
    const LIFECYCLE_RANK: Record<string, number> = {
      'phone-call': 0,
      'form-submitted': 1,
      teams: 2,
      rated: 3,
      enquiry: 4,
      instruction: 5,
      matter: 6,
    };
    const timeline = [...events].sort((a, b) => {
      const ra = LIFECYCLE_RANK[a.key] ?? 99;
      const rb = LIFECYCLE_RANK[b.key] ?? 99;
      if (ra !== rb) return rb - ra;
      if (a.iso && b.iso) return new Date(b.iso).getTime() - new Date(a.iso).getTime();
      if (a.iso) return -1;
      if (b.iso) return 1;
      return 0;
    });

    const channelColour = (channel: TimelineEvent['channel']): string => {
      if (isDarkMode) {
        switch (channel) {
          case 'call': return '#f59e0b';
          case 'dubber': return '#38bdf8';
          case 'teams': return '#818cf8';
          case 'rated': return '#34d399';
          case 'enquiry': return '#6CB4EC';
          case 'instruction': return '#60a5fa';
          case 'matter': return '#4ade80';
        }
      }
      switch (channel) {
        case 'call': return '#d97706';
        case 'dubber': return '#0284c7';
        case 'teams': return '#6366f1';
        case 'rated': return '#16a34a';
        case 'enquiry': return '#3690CE';
        case 'instruction': return '#2563eb';
        case 'matter': return '#15803d';
      }
    };

    // ── Teams card deep link ──
    const resolveMessageId = (value: unknown): string | null => {
      if (value == null) return null;
      if (typeof value === 'number' && value > 1640995200000) return String(value);
      const raw = String(value).trim();
      if (!raw) return null;
      if (raw.startsWith('0:')) {
        const tail = raw.split(':')[1];
        if (tail && /^\d{13,}$/.test(tail)) return tail;
      }
      const match = raw.match(/\d{13,}/);
      if (match) return match[0];
      return null;
    };
    let teamsDeepLink: string | null = null;
    if (row.teamsChannelId && row.teamsTeamId) {
      let messageId = resolveMessageId(row.teamsMessageId) || resolveMessageId(row.activityId);
      if (!messageId && row.teamsMessageTimestamp) {
        const d = new Date(row.teamsMessageTimestamp);
        if (!isNaN(d.getTime())) messageId = String(d.getTime());
      }
      if (messageId) {
        const tenantId = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';
        const query = new URLSearchParams({
          tenantId,
          groupId: row.teamsTeamId,
          parentMessageId: messageId,
          createdTime: messageId,
        });
        teamsDeepLink = `https://teams.microsoft.com/l/message/${encodeURIComponent(row.teamsChannelId)}/${encodeURIComponent(messageId)}?${query.toString()}`;
      }
    }
    const openTeamsCard = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!teamsDeepLink) return;
      const link = teamsDeepLink;
      (async () => {
        try { await app.openLink(link); } catch { window.open(link, '_blank'); }
      })();
    };

    // One-line caption: state the meaningful next step, not the whole chain.
    let caption: string;
    if (row.outcome === 'opened') {
      const when = row.matterOpenedAt ? ` on ${fmtDateTime(row.matterOpenedAt)}` : '';
      const timing = row.callToMatterHours != null ? ` (call to open ${fmtHours(row.callToMatterHours)})` : '';
      caption = `Matter ${row.matterDisplayNumber || row.matterId || 'opened'}${when}${timing}.`;
    } else if (row.outcome === 'in_progress') {
      caption = row.instructionRef
        ? `Instruction ${row.instructionRef} is in onboarding${row.instructionStage ? ` at ${row.instructionStage}` : ''}. No matter row yet.`
        : 'Onboarding started. No matter row yet.';
    } else if (row.enquiryId != null) {
      caption = 'Linked to enquiry, no instruction or matter yet.';
    } else {
      caption = 'No enquiry, instruction or matter linked to this call yet.';
    }
    if (notesStatus === 'pending') {
      caption += ' Fee earner has not rated the notes.';
    }

    // ── Notes preview ──
    const notesPreview = (row.enquiryNotes || '').toString().trim();
    const notesIsLong = notesPreview.length > 280 || notesPreview.split(/\r?\n/).length > 3;
    const notesExpanded = expandedNotes.has(row.callId);
    const toggleNotes = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedNotes((prev) => {
        const next = new Set(prev);
        if (next.has(row.callId)) next.delete(row.callId); else next.add(row.callId);
        return next;
      });
    };

    // ── Attribution sub-strip ──
    const utmCombined = [row.utmSource, row.utmCampaign].filter(Boolean).join(' / ');
    const attribution: Array<{ key: string; label: string; value: string; title?: string }> = [];
    if (row.referralSource) attribution.push({ key: 'referral', label: 'Referral', value: row.referralSource });
    if (utmCombined) attribution.push({ key: 'utm', label: 'UTM', value: utmCombined, title: [row.utmSource && `source=${row.utmSource}`, row.utmMedium && `medium=${row.utmMedium}`, row.utmCampaign && `campaign=${row.utmCampaign}`, row.utmContent && `content=${row.utmContent}`, row.utmTerm && `term=${row.utmTerm}`].filter(Boolean).join(' · ') });
    if (row.trackingSource) attribution.push({ key: 'tracking', label: 'Tracking', value: row.trackingNumber ? `${row.trackingSource} (${row.trackingNumber})` : row.trackingSource });
    if (row.gclid) attribution.push({ key: 'gclid', label: 'GCLID', value: 'present', title: row.gclid });
    if (row.landingUrl) {
      let landingShort = row.landingUrl;
      try { landingShort = new URL(row.landingUrl).pathname || row.landingUrl; } catch { /* keep raw */ }
      if (landingShort.length > 40) landingShort = `${landingShort.slice(0, 37)}...`;
      attribution.push({ key: 'landing', label: 'Landing', value: landingShort, title: row.landingUrl });
    }
    if (row.keywords) attribution.push({ key: 'keywords', label: 'Keywords', value: row.keywords.length > 40 ? `${row.keywords.slice(0, 37)}...` : row.keywords, title: row.keywords });
    if (row.adSet) attribution.push({ key: 'adset', label: 'Ad set', value: row.adSet.length > 40 ? `${row.adSet.slice(0, 37)}...` : row.adSet, title: row.adSet });

    return (
      <div className="reception-submission-tray" id={`reception-submission-tray-${row.callId}`}>
        <div className="reception-submission-tray-inner">
          <div className="reception-submission-tray-headline" style={{ color: textBody, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            {row.dubberRecordingId && row.dubberAiStatus === 'Active' && (
              <button
                type="button"
                className="reception-submission-tray-transcript-toggle"
                onClick={(e) => { e.stopPropagation(); toggleTranscript(row.dubberRecordingId!); }}
                title="Show the Dubber AI transcript for this call"
                aria-label="Toggle transcript"
                aria-expanded={openTranscripts.has(row.dubberRecordingId)}
              >
                <Icon iconName="PageList" style={{ fontSize: 14 }} />
                <span>{openTranscripts.has(row.dubberRecordingId) ? 'Hide transcript' : 'Show transcript'}</span>
              </button>
            )}
            {teamsDeepLink && (
              <button
                type="button"
                className="reception-submission-tray-teams-link"
                onClick={openTeamsCard}
                title="Open the Teams notes card for this call"
                aria-label="Open Teams card"
              >
                <Icon iconName="TeamsLogo" style={{ fontSize: 14 }} />
                <span>Teams card</span>
              </button>
            )}
          </div>
          <div className="reception-tray-contact" data-helix-region="reports/reception/contact-card">
            <div className="reception-tray-contact-meta reception-tray-contact-meta--standalone">
              {identity && (
                  <span
                    className={`reception-tray-contact-pill reception-tray-contact-pill--identity-${identity.slug}`}
                    title={identity.tooltip}
                  >
                    <Icon iconName={identity.icon} style={{ fontSize: 10 }} />
                    <span>{identity.label}</span>
                  </span>
                )}
                {mismatch && (
                  <span
                    className="reception-tray-contact-pill reception-tray-contact-pill--mismatch"
                    title={`Originally rang for ${matchedInitials}${row.dubberMatchedEmail ? ` (${row.dubberMatchedEmail})` : ''}; taken by ${handlerInitials}.`}
                  >
                    <Icon iconName="Warning" style={{ fontSize: 10 }} />
                    <span>Rang for {matchedInitials}</span>
                  </span>
                )}
                {(() => {
                  const links: Array<{ key: 'enquiry' | 'instruction' | 'matter'; label: string; value: string | null; tone: JourneyStatus }> = [
                    {
                      key: 'enquiry',
                      label: 'Enquiry',
                      value: row.enquiryId != null ? `#${fmtInt(row.enquiryId)}` : (row.enquiryAcid ? `ACID ${row.enquiryAcid}` : null),
                      tone: (row.enquiryId != null || row.enquiryAcid) ? 'complete' : 'pending',
                    },
                    {
                      key: 'instruction',
                      label: 'Instruction',
                      value: row.instructionRef || null,
                      tone: row.instructionRef
                        ? (row.outcome === 'in_progress' ? 'current' : 'complete')
                        : (row.enquiryId != null ? 'pending' : 'disabled'),
                    },
                    {
                      key: 'matter',
                      label: 'Matter',
                      value: row.matterDisplayNumber || row.matterId || null,
                      tone: (row.matterDisplayNumber || row.matterId)
                        ? 'complete'
                        : (row.instructionRef ? 'pending' : 'disabled'),
                    },
                  ];
                  return links.map((link) => {
                    const filled = Boolean(link.value);
                    return (
                      <button
                        key={link.key}
                        type="button"
                        className={`reception-tray-contact-pill reception-tray-contact-pill--link reception-tray-contact-pill--link-${link.tone} ${filled ? '' : 'reception-tray-contact-pill--link-empty'}`}
                        disabled={!filled}
                        onClick={(e) => { e.stopPropagation(); if (filled) { try { navigator.clipboard?.writeText(link.value!); } catch { /* ignore */ } } }}
                        title={filled ? `${link.label} ${link.value} — click to copy` : `${link.label}: not yet`}
                        aria-label={filled ? `Copy ${link.label} ${link.value}` : `${link.label} not yet linked`}
                      >
                        <span className="reception-tray-contact-pill-label">{link.label}</span>
                        <span className="reception-tray-contact-pill-value">{filled ? link.value : 'Not yet'}</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          <ol
            className="reception-submission-timeline"
            style={{
              ['--rcp-timeline-line' as any]: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6, 23, 51, 0.10)',
              ['--rcp-timeline-halo' as any]: isDarkMode ? '#1f2733' : '#f7f9fc',
            }}
          >
            {timeline.map((evt) => {
              const colour = channelColour(evt.channel);
              return (
                <li key={evt.key} className={`reception-submission-timeline-item${evt.pending ? ' is-pending' : ''}`}>
                  <span
                    className="reception-submission-timeline-dot"
                    style={{ background: evt.pending ? 'transparent' : colour, borderColor: colour }}
                    aria-hidden="true"
                  />
                  <div className="reception-submission-timeline-body">
                    <div className="reception-submission-timeline-row">
                      <Icon iconName={evt.iconName} style={{ fontSize: 11, color: colour }} />
                      <span className="reception-submission-timeline-title" style={{ color: textBody }}>{evt.title}</span>
                      {evt.iso && (
                        <span className="reception-submission-timeline-time" style={{ color: textHelp }}>{fmtDateTime(evt.iso)}</span>
                      )}
                    </div>
                    {evt.detail && (
                      <div className="reception-submission-timeline-detail" style={{ color: textHelp }}>{evt.detail}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {row.dubberRecordingId && openTranscripts.has(row.dubberRecordingId) && (() => {
            const entry = transcripts[row.dubberRecordingId];
            if (!entry || entry.status === 'loading') {
              return (
                <div className="reception-submission-tray-transcript" style={{ color: textHelp, padding: 8 }}>
                  Loading transcript...
                </div>
              );
            }
            if (entry.status === 'error') {
              return (
                <div className="reception-submission-tray-transcript" style={{ color: textHelp, padding: 8 }}>
                  Transcript unavailable ({entry.error || 'error'}).
                </div>
              );
            }
            if (entry.status === 'empty') {
              return (
                <div className="reception-submission-tray-transcript" style={{ color: textHelp, padding: 8 }}>
                  No transcript captured{entry.aiStatus ? ` (status: ${entry.aiStatus})` : ''}.
                </div>
              );
            }
            return (
              <div
                className="reception-submission-tray-transcript"
                style={{
                  background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(6,23,51,0.03)',
                  borderLeft: `2px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(6,23,51,0.12)'}`,
                  padding: '8px 12px',
                  marginTop: 8,
                  maxHeight: 320,
                  overflowY: 'auto',
                  borderRadius: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {(entry.sentences || []).map((s, idx) => (
                  <div key={idx} style={{ marginBottom: 4 }}>
                    {s.speaker && (
                      <span style={{ color: textHelp, fontWeight: 600, marginRight: 6 }}>{s.speaker}:</span>
                    )}
                    <span style={{ color: textBody }}>{s.content}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="reception-submission-tray-caption" style={{ color: textHelp }}>
            {caption}
          </div>
          {notesPreview && (
            <div
              className={`reception-submission-tray-notes${notesIsLong && !notesExpanded ? ' is-collapsed' : ''}`}
              style={{ color: textBody, borderLeftColor: isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.12)' }}
            >
              <div className="reception-submission-tray-notes-body">{notesPreview}</div>
              {notesIsLong && (
                <button
                  type="button"
                  className="reception-submission-tray-notes-toggle"
                  onClick={toggleNotes}
                  aria-expanded={notesExpanded}
                >
                  {notesExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          {attribution.length > 0 && (
            <div className="reception-submission-tray-attribution">
              {attribution.map((chip) => (
                <span key={chip.key} className="reception-submission-tray-attrchip" title={chip.title}>
                  <span className="reception-submission-tray-attrchip-label">{chip.label}</span>
                  <span className="reception-submission-tray-attrchip-value">{chip.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHandlerDrilldown = (handlerKey: string, calls: EvidenceRow[], totalCalls: number) => {
    if (!calls.length) {
      return (
        <div className="reception-handler-drill" id={`reception-handler-calls-${handlerKey}`}>
          <div className="reception-handler-drill-empty" style={{ color: textBody }}>
            No calls captured for {handlerKey} in this date range yet.
          </div>
        </div>
      );
    }

    const drillGroups = buildDrillPeriodGroups(handlerKey, calls, (row) => row.callCreatedAt);

    const opened = calls.filter((c) => c.outcome === 'opened').length;
    const inFlight = calls.filter((c) => c.outcome === 'in_progress').length;
    const conversion = totalCalls ? opened / totalCalls : null;
    const callsTotal = calls.length;
    const dubberMatched = calls.filter((c) => Boolean(c.dubberRecordingId)).length;
    const teamsCardCount = calls.filter((c) => hasReceptionTeamsCard(c)).length;
    const notesRated = calls.filter((c) => Boolean(c.notesRating)).length;
    const enquiryLinked = calls.filter((c) => c.enquiryId != null || Boolean(c.enquiryAcid)).length;
    const instructionCount = calls.filter((c) => Boolean(c.instructionRef)).length;
    const matterCount = calls.filter((c) => Boolean(c.matterDisplayNumber || c.matterId)).length;
    const stageSnapshot: Array<{ key: JourneyStageKey; label: string; value: number; total: number; title: string }> = [
      { key: 'call', label: 'Dubber', value: dubberMatched, total: callsTotal, title: `${fmtInt(dubberMatched)} of ${fmtInt(callsTotal)} calls have a Dubber match` },
      { key: 'notes', label: 'Notes', value: notesRated, total: teamsCardCount, title: teamsCardCount ? `${fmtInt(notesRated)} of ${fmtInt(teamsCardCount)} Teams cards have a notes rating` : 'No Teams cards posted in range' },
      { key: 'enquiry', label: 'Enquiry', value: enquiryLinked, total: callsTotal, title: `${fmtInt(enquiryLinked)} of ${fmtInt(callsTotal)} calls linked to an enquiry` },
      { key: 'instruction', label: 'Instruction', value: instructionCount, total: callsTotal, title: `${fmtInt(instructionCount)} of ${fmtInt(callsTotal)} calls progressed to instruction` },
      { key: 'matter', label: 'Matter', value: matterCount, total: callsTotal, title: `${fmtInt(matterCount)} of ${fmtInt(callsTotal)} calls resolved to a matter (${fmtPct(conversion)} matter rate)` },
    ];
    const reviewSignals = [
      { key: 'noMatterLink' as ReviewFocusKey, count: calls.filter((row) => matchesReviewFocus(row, 'noMatterLink')).length, label: 'no matter', tone: 'red' as ReviewFocusTone, title: 'Calls with no matter or onboarding link' },
      { key: 'unratedNotes' as ReviewFocusKey, count: calls.filter((row) => matchesReviewFocus(row, 'unratedNotes')).length, label: 'unrated', tone: 'orange' as ReviewFocusTone, title: 'Teams cards still awaiting notes feedback' },
      { key: 'formOnly' as ReviewFocusKey, count: calls.filter((row) => matchesReviewFocus(row, 'formOnly')).length, label: 'form-only', tone: 'mute' as ReviewFocusTone, title: 'Calls without a Dubber match' },
      { key: 'identityMismatch' as ReviewFocusKey, count: calls.filter((row) => matchesReviewFocus(row, 'identityMismatch')).length, label: 'mismatch', tone: 'highlight' as ReviewFocusTone, title: 'Dubber call line differs from form handler' },
      { key: 'shortCalls' as ReviewFocusKey, count: calls.filter((row) => matchesReviewFocus(row, 'shortCalls')).length, label: 'short', tone: 'orange' as ReviewFocusTone, title: 'Calls under 30 seconds' },
    ].filter((flag) => flag.count > 0);
    const callsCopy = calls.length < totalCalls
      ? `showing latest ${fmtInt(calls.length)} of ${fmtInt(totalCalls)} calls in range`
      : `${fmtInt(calls.length)} call${calls.length === 1 ? '' : 's'} in range`;

    const renderEvidenceRows = (rows: EvidenceRow[]) => (
      <div className="reception-handler-drill-rows">
        {rows.map((row) => {
          const isSelected = selectedEvidenceId === row.callId;
          const callerName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
          const timeText = fmtDateTime(row.callCreatedAt)?.split(', ').slice(-1)[0] || fmtDateTime(row.callCreatedAt);
          const callKind = row.callType || row.dubberCallType ? callTypeMeta(row.callType || row.dubberCallType).label : null;
          const primaryText = callerName
            || (row.enquiryId != null ? `Enquiry #${fmtInt(row.enquiryId)}` : null)
            || (row.enquiryAcid ? `ACID ${row.enquiryAcid}` : null)
            || `Call #${fmtInt(row.callId)}`;
          const summaryMeta = [
            timeText,
            callKind,
            row.areaOfWork,
            row.durationSeconds != null ? fmtMSS(row.durationSeconds) : null,
          ].filter(Boolean).join(' · ');
          const stages = computeReceptionJourney(row);
          const headline = journeyHeadline(stages);
          const rowSignalLabels = [
            isUnratedNotes(row) ? 'unrated notes' : null,
            isFormOnlyAttribution(row) ? 'form only' : null,
            hasIdentityMismatch(row) ? 'identity mismatch' : null,
            isShortCall(row) ? 'short call' : null,
          ].filter((signal): signal is string => Boolean(signal));
          const journeyAria = stages.map((s) => `${s.label}: ${s.tooltip}`).join('. ');
          return (
            <React.Fragment key={row.callId}>
              <button
                type="button"
                className={`reception-handler-drill-row reception-handler-drill-row--evidence ${isSelected ? 'is-selected' : ''}`}
                data-source={row.durationSource === 'dubber' ? 'dubber' : row.durationSource === 'form' ? 'form' : 'missing'}
                onClick={() => setSelectedEvidenceId((current) => (current === row.callId ? null : row.callId))}
                aria-expanded={isSelected}
                aria-controls={`reception-submission-tray-${row.callId}`}
                aria-label={`${primaryText}, ${summaryMeta}, ${headline.label}`}
                title={[primaryText, summaryMeta, headline.label, row.confidenceReason].filter(Boolean).join(' · ')}
              >
                <span className="reception-handler-drill-cell reception-handler-drill-cell--handler reception-handler-drill-line">
                  <Icon iconName={isSelected ? 'ChevronDown' : 'ChevronRight'} className="reception-handler-drill-caret" style={{ fontSize: 10, color: textHelp }} />
                  <span className="reception-handler-drill-submission">
                    <span className="reception-handler-drill-submission-title" style={{ color: textPrimary }}>
                      <span>{primaryText}</span>
                      {row.phone && (
                        <span className="reception-handler-drill-submission-phone" style={{ color: textHelp }}>{row.phone}</span>
                      )}
                    </span>
                    <span className="reception-handler-drill-submission-meta" style={{ color: textHelp }}>#{fmtInt(row.callId)} · {summaryMeta}</span>
                  </span>
                </span>
                <span className="reception-handler-drill-cell reception-handler-drill-status">
                  <span className="reception-handler-journey" role="img" aria-label={journeyAria}>
                    {stages.map((stage, idx) => (
                      <React.Fragment key={stage.key}>
                        {idx > 0 && (
                          <span
                            className={`reception-handler-journey-bridge reception-handler-journey-bridge--${stages[idx - 1].status === 'complete' && stage.status !== 'disabled' ? 'complete' : 'idle'}`}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={`reception-handler-journey-dot reception-handler-journey-dot--${stage.status}`}
                          title={`${stage.label}: ${stage.tooltip}`}
                        />
                      </React.Fragment>
                    ))}
                  </span>
                  <span className={`reception-handler-status-label reception-handler-status-label--${headline.tone}`} style={{ color: textPrimary }}>
                    {headline.label}
                  </span>
                  {rowSignalLabels.length > 0 && (
                    <span
                      className="reception-handler-status-flag"
                      title={rowSignalLabels.join(' · ')}
                      aria-label={`${rowSignalLabels.length} ${rowSignalLabels.length === 1 ? 'check' : 'checks'}`}
                    >
                      <Icon iconName="Warning" style={{ fontSize: 10 }} />
                      <span>{fmtInt(rowSignalLabels.length)}</span>
                    </span>
                  )}
                </span>
              </button>
              {isSelected && renderSubmissionTray(row)}
            </React.Fragment>
          );
        })}
      </div>
    );

    return (
      <div
        className="reception-handler-drill"
        id={`reception-handler-calls-${handlerKey}`}
        data-helix-region="reports/reception/handler-drilldown"
      >
        <div className="reception-handler-drill-head reception-handler-drill-head--continuation" style={{ color: textHelp }}>
          <span className="reception-handler-drill-heading">
            <span style={{ color: textPrimary, fontWeight: 700 }}>Call detail</span>
            <span>{callsCopy}</span>
            {activeReviewFocus !== 'all' && activeReviewFocus !== 'mpOnly' && (
              <span className="reception-handler-drill-focus">Focus: {activeReviewFocusLabel}</span>
            )}
          </span>
          <span className="reception-handler-drill-stages" role="list" aria-label={`${handlerKey} stage snapshot`}>
            {stageSnapshot.map((stage, idx) => {
              const ratio = stage.total > 0 ? stage.value / stage.total : 0;
              const tone = stage.total === 0
                ? 'muted'
                : ratio >= 0.8 ? 'green'
                : ratio >= 0.4 ? 'highlight'
                : 'mute';
              return (
                <React.Fragment key={stage.key}>
                  {idx > 0 && <span className="reception-handler-drill-stage-sep" aria-hidden="true">›</span>}
                  <span
                    className={`reception-handler-drill-stage reception-handler-drill-stage--${tone}`}
                    role="listitem"
                    title={stage.title}
                  >
                    <span className="reception-handler-drill-stage-label">{stage.label}</span>
                    <span className="reception-handler-drill-stage-count">
                      <span className="reception-handler-drill-stage-value">{fmtInt(stage.value)}</span>
                      <span className="reception-handler-drill-stage-divider">/</span>
                      <span className="reception-handler-drill-stage-total">{fmtInt(stage.total)}</span>
                    </span>
                  </span>
                </React.Fragment>
              );
            })}
          </span>
        </div>

        {drillGroups.map((group) => {
          const groupOpened = group.rows.filter((r) => r.outcome === 'opened').length;
          const isGroupExpanded = expandedDrillGroups.has(group.key);
          const metaParts = [
            `${fmtInt(group.rows.length)} call${group.rows.length === 1 ? '' : 's'}`,
            group.kind === 'week' ? `${fmtInt(group.days.length)} day${group.days.length === 1 ? '' : 's'}` : null,
            groupOpened ? `${fmtInt(groupOpened)} resolved matter path${groupOpened === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={group.key} className="reception-handler-drill-group">
              <button
                type="button"
                className={`reception-handler-drill-day reception-handler-drill-fold ${group.kind === 'week' ? 'reception-handler-drill-day--week' : ''}`}
                onClick={() => toggleDrillGroup(group.key)}
                aria-expanded={isGroupExpanded}
              >
                <span className="reception-handler-drill-day-label" style={{ color: textPrimary }}>
                  <Icon iconName={isGroupExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 10, color: textHelp }} />
                  <span>{group.label}</span>
                </span>
                <span className="reception-handler-drill-day-meta" style={{ color: textHelp }}>
                  {metaParts}
                </span>
              </button>
              {isGroupExpanded && (
                <>
                  {group.kind === 'week'
                    ? group.days.map((dayGroup) => (
                      <React.Fragment key={dayGroup.key}>
                        <div className="reception-handler-drill-subday">
                          <span style={{ color: textPrimary }}>{dayGroup.label}</span>
                          <span style={{ color: textHelp }}>{fmtInt(dayGroup.rows.length)} call{dayGroup.rows.length === 1 ? '' : 's'}</span>
                        </div>
                        {renderEvidenceRows(dayGroup.rows)}
                      </React.Fragment>
                    ))
                    : renderEvidenceRows(group.rows)}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderHandlerSkeleton = (rows: number) => (
    <div className="metrics-table reception-handler-table reception-handler-table--skeleton" aria-hidden="true">
      <div className="metrics-table-header">
        <span>Handler</span>
        <span>Calls</span>
        <span>Marked handled</span>
        <span>Avg call</span>
        <span>Latest call</span>
        <span>Notes clarity</span>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`reception-handler-skeleton-${i}`} className="metrics-table-row reception-skeleton-row">
          <span className="metrics-cell metrics-cell--member">
            <span className="reception-handler-member-stack reception-handler-member-stack--skeleton">
              <span className="reception-handler-trigger reception-handler-trigger--skeleton">
                <span className="reception-handler-trigger-icon reception-skeleton-bar" />
                <span className="reception-skeleton-bar reception-handler-skeleton-name" />
              </span>
            </span>
          </span>
          <span className="metrics-cell metrics-cell--value"><span className="reception-skeleton-bar reception-handler-skeleton-number" /></span>
          <span className="metrics-cell metrics-cell--value"><span className="reception-skeleton-bar reception-handler-skeleton-number" /></span>
          <span className="metrics-cell metrics-cell--value"><span className="reception-skeleton-bar reception-handler-skeleton-number reception-handler-skeleton-number--time" /></span>
          <span className="metrics-cell metrics-cell--value reception-date-cell">
            <span className="reception-skeleton-bar reception-handler-skeleton-date" />
            <span className="reception-skeleton-bar reception-handler-skeleton-date-tag" />
          </span>
          <span className="metrics-cell metrics-cell--value"><span className="reception-skeleton-bar reception-handler-skeleton-clarity" /></span>
        </div>
      ))}
    </div>
  );

  // ── States ───────────────────────────────────────────────────────────
  const toolbarExtras = renderLiveSignalIndicator();
  const refreshErrorBanner = error && data ? (
    <div className="reception-refresh-error" style={{ color: colours.cta }}>
      Latest refresh failed: {error}. Showing the last successful Reception payload.
    </div>
  ) : null;

  if (error && !data) {
    return (
      <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastLoadedAt} onRefresh={handleRefresh} toolbarExtras={toolbarExtras} isPresetAvailable={isPresetAvailable} toolbarDensity="compact" allowAllRange={false}>
        <div className="reception-empty-state" style={{ color: colours.cta }}>
          Could not load Reception KPIs: {error}
        </div>
      </ReportShell>
    );
  }

  if (!data && loading) {
    return (
      <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastLoadedAt} onRefresh={handleRefresh} toolbarExtras={toolbarExtras} isPresetAvailable={isPresetAvailable} toolbarDensity="compact" allowAllRange={false}>
        {renderKpiStrip()}
        {renderHandlerSkeleton(5)}
        {renderKpiBreakdown()}
      </ReportShell>
    );
  }

  if (data && handlers.length === 0 && !shouldRenderMpPickupRow) {
    return (
      <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastLoadedAt} onRefresh={handleRefresh} toolbarExtras={toolbarExtras} isPresetAvailable={isPresetAvailable} toolbarDensity="compact" allowAllRange={false}>
        {refreshErrorBanner}
        {renderKpiStrip()}
        <div className="reception-empty-state" style={{ color: textBody }}>
          No reception activity in this window.
        </div>
        {renderReportContextPanel()}
        {renderKpiBreakdown()}
      </ReportShell>
    );
  }

  return (
    <ReportShell range={range} isFetching={isFetching} lastRefreshTimestamp={lastLoadedAt} onRefresh={handleRefresh} toolbarExtras={toolbarExtras} isPresetAvailable={isPresetAvailable} toolbarDensity="compact" allowAllRange={false}>
      {refreshErrorBanner}
      {renderKpiStrip()}
      {renderHandlerTable()}
      {renderReportContextPanel()}
      {renderKpiBreakdown()}
    </ReportShell>
  );
};

export default ReceptionReport;
