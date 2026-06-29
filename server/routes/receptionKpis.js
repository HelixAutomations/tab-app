/**
 * Reception KPIs — direct read from the `instructions` SQL database.
 *
 * Routes:
 *   GET /api/reporting/reception-kpis?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Previously this route proxied to enquiry-processing-v2. That service
 * connects to the SAME `instructions` database tab-app already uses via
 * INSTRUCTIONS_SQL_CONNECTION_STRING, so the HTTP hop was decorative.
 * We now run the equivalent CTE in-process. Response shape is locked to
 * what the React component expects (window / handlers / totals / coverage).
 *
 * Canonical SQL mirror (READ-ONLY submodule):
 *   submodules/enquiry-processing-v2/Controllers/ReportingController.cs
 * Keep the CTE here byte-equivalent to the mirror until ownership is
 * formally moved.
 */

const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 50;
const MAX_WINDOW_DAYS = 366;
const DEFAULT_WINDOW_DAYS = 7;
const SQL_TIMEOUT_MS = 30 * 1000;
const EVIDENCE_ROW_LIMIT = 2000;
const DAY_MS = 86_400_000;

const memoCache = new Map();
let reviewTableReady = false;

const ENSURE_RECEPTION_REVIEW_TABLE_SQL = `
IF OBJECT_ID(N'dbo.reception_call_reviews', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.reception_call_reviews
  (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    call_id INT NOT NULL,
    action NVARCHAR(32) NOT NULL,
    candidate_enquiry_id INT NULL,
    candidate_instruction_ref NVARCHAR(100) NULL,
    candidate_matter_id NVARCHAR(100) NULL,
    review_note NVARCHAR(500) NULL,
    match_source NVARCHAR(64) NULL,
    reviewed_by NVARCHAR(128) NULL,
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_reception_call_reviews_created_at DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'ix_reception_call_reviews_call_id_created'
    AND object_id = OBJECT_ID(N'dbo.reception_call_reviews')
)
BEGIN
  CREATE INDEX ix_reception_call_reviews_call_id_created
    ON dbo.reception_call_reviews (call_id, created_at DESC, id DESC);
END;
`;

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : null;
}

function isDateOnlyValue(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateUtc(value) {
  const raw = firstQueryValue(value);
  if (!raw) return null;
  const iso = isDateOnlyValue(raw) ? `${raw}T00:00:00Z` : raw;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function resolveWindow(fromRawValue, toRawValue) {
  const fromRaw = firstQueryValue(fromRawValue);
  const toRaw = firstQueryValue(toRawValue);
  if (fromRaw && !parseDateUtc(fromRaw)) return { error: 'invalid_from' };
  if (toRaw && !parseDateUtc(toRaw)) return { error: 'invalid_to' };
  const now = new Date();
  const parsedTo = parseDateUtc(toRaw);
  const parsedFrom = parseDateUtc(fromRaw);
  let toUtc = parsedTo || now;
  if (parsedTo && isDateOnlyValue(toRaw)) {
    toUtc = new Date(parsedTo.getTime() + DAY_MS);
  }
  let fromUtc = parsedFrom || new Date(toUtc.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  if (fromUtc >= toUtc) return { error: 'invalid_range', detail: '`from` must be earlier than `to`.' };
  const spanDays = (toUtc.getTime() - fromUtc.getTime()) / DAY_MS;
  if (spanDays > MAX_WINDOW_DAYS) {
    fromUtc = new Date(toUtc.getTime() - MAX_WINDOW_DAYS * DAY_MS);
  }
  return { fromUtc, toUtc };
}

function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }
function round4(n) { return n == null ? null : Math.round(n * 10_000) / 10_000; }

const STAGE_RANK_SQL = `CASE i.Stage
        WHEN 'completed'             THEN 1
        WHEN 'matter-opened'         THEN 2
        WHEN 'payment-complete'      THEN 3
        WHEN 'id-only-complete'      THEN 4
        WHEN 'proof-of-id-complete'  THEN 5
        WHEN 'proof-of-id'           THEN 6
        WHEN 'initialised'           THEN 7
        ELSE NULL END`;

const RECEPTION_HANDLER_KEYS = ['ea', 'kw', 'wh', 'ld'];
const RECEPTION_HANDLER_IN_SQL = RECEPTION_HANDLER_KEYS.map((key) => `'${key}'`).join(',');
const RAW_HANDLER_SQL = `LOWER(LTRIM(RTRIM(COALESCE(ic.taken_by_resolved, ic.taken_by))))`;
const RECEPTION_HANDLER_SQL = `CASE
          WHEN ${RAW_HANDLER_SQL} IN ('dev', 'mp', 'moneypenny', 'money penny') THEN 'mp'
          WHEN ${RAW_HANDLER_SQL} IN ('ea', 'emma', 'emma albers') THEN 'ea'
          WHEN ${RAW_HANDLER_SQL} IN ('kw', 'kanchel', 'kch', 'kc') THEN 'kw'
          WHEN ${RAW_HANDLER_SQL} IN ('wh', 'wolfgang', 'wolfgang hartung') THEN 'wh'
          WHEN ${RAW_HANDLER_SQL} IN ('ld', 'libby') THEN 'ld'
          ELSE ${RAW_HANDLER_SQL}
        END`;

const SQL_QUERY = `
WITH calls AS (
    SELECT
    ic.id AS callId,
        -- Prefer resolved handler (back-filled from Dubber phone+time match) over the
        -- raw form-default. See dbo.incoming_calls.taken_by_resolved / taken_by_confidence.
        -- Canonicalise reception aliases before aggregation so form defaults like
        -- 'wolfgang'/'wh' or 'dev'/'moneypenny' cannot split into duplicate UI rows.
        ${RECEPTION_HANDLER_SQL} AS handler,
        ic.taken_by AS rawTakenBy,
        ic.taken_by_resolved AS takenByResolved,
        ic.taken_by_confidence AS takenByConfidence,
    ic.status AS callStatus,
    ic.created_at AS callCreatedAt,
    ic.call_started_at AS callStartedAt,
    ic.call_submitted_at AS callSubmittedAt,
    ic.call_type AS callType,
    ic.enquiry_id AS enquiryId,
    ic.matched_dubber_recording_id AS dubberRecordingId,
        ic.call_duration_seconds AS form_duration_seconds,
        dr.duration_seconds      AS dubber_duration_seconds,
    dr.from_party            AS dubberFromParty,
    dr.to_party              AS dubberToParty,
    dr.call_type             AS dubberCallType,
    dr.matched_team_initials AS dubberMatchedInitials,
    dr.matched_team_email    AS dubberMatchedEmail,
    dr.start_time_utc        AS dubberStartTimeUtc,
    dr.ai_status             AS dubberAiStatus,
    ic.phone                 AS phone,
    ic.first_name            AS firstName,
    ic.last_name             AS lastName,
    ic.enquiry_notes         AS enquiryNotes,
    ic.area_of_work          AS areaOfWork,
    ic.referral_source       AS referralSource,
    ic.ad_set                AS adSet,
    ic.keywords              AS keywords,
    ic.landing_url           AS landingUrl,
    ic.gclid                 AS gclid,
    ic.utm_source            AS utmSource,
    ic.utm_medium            AS utmMedium,
    ic.utm_campaign          AS utmCampaign,
    ic.utm_content           AS utmContent,
    ic.utm_term              AS utmTerm,
    ic.external_call_id      AS externalCallId,
    ic.tracking_number       AS trackingNumber,
    ic.tracking_source       AS trackingSource,
    e.acid                   AS enquiryAcid,
    e.datetime               AS enquiryCreatedAt,
    fn.TeamsActivityId,
    fn.ActivityId,
    fn.TeamsMessageId,
    fn.ChannelId          AS teamsChannelId,
    fn.TeamId             AS teamsTeamId,
    fn.MessageTimestamp   AS teamsMessageTimestamp,
    fn.CardType           AS teamsCardType,
    fn.ClaimedBy,
    fn.ClaimedAt,
    fn.FeNotesRating,
    fn.FeNotesRatedAt
    FROM dbo.incoming_calls ic
    LEFT JOIN dbo.dubber_recordings dr
        ON dr.recording_id = ic.matched_dubber_recording_id
    LEFT JOIN dbo.enquiries e
        ON e.id = ic.enquiry_id
    OUTER APPLY (
        SELECT TOP 1
            t.Id AS TeamsActivityId,
            t.ActivityId,
            t.TeamsMessageId,
            t.ChannelId,
            t.TeamId,
            t.MessageTimestamp,
            t.CardType,
            t.ClaimedBy,
            t.ClaimedAt,
            t.FeNotesRating,
            t.FeNotesRatedAt
        FROM dbo.TeamsBotActivityTracking t
        WHERE ic.enquiry_id IS NOT NULL
          AND TRY_CONVERT(int, t.EnquiryId) = ic.enquiry_id
          AND t.FeNotesRating IS NOT NULL
          AND (t.CardType IS NULL OR t.CardType <> 'partner_review_dm')
        ORDER BY t.FeNotesRatedAt DESC, t.Id DESC
    ) fn
    WHERE ic.created_at >= @from
      AND ic.created_at <  @to
      AND COALESCE(ic.taken_by_resolved, ic.taken_by) IS NOT NULL
      AND LTRIM(RTRIM(COALESCE(ic.taken_by_resolved, ic.taken_by))) <> ''
      AND ${RECEPTION_HANDLER_SQL} IN (${RECEPTION_HANDLER_IN_SQL})
),
    callInstruction AS (
      SELECT
        c.*,
        instruction.InstructionRef,
        instruction.Stage AS instructionStage,
        instruction.SubmissionDate AS instructionSubmittedAt,
        instruction.stageRank
      FROM calls c
      OUTER APPLY (
        SELECT TOP 1
          i.InstructionRef,
          i.Stage,
          i.SubmissionDate,
          ${STAGE_RANK_SQL} AS stageRank
        FROM dbo.Instructions i
        WHERE c.enquiryAcid IS NOT NULL
          AND i.InstructionRef LIKE 'HLX-' + c.enquiryAcid + '-%'
        ORDER BY
          CASE WHEN ${STAGE_RANK_SQL} IS NULL THEN 99 ELSE ${STAGE_RANK_SQL} END ASC,
          i.InstructionRef DESC
      ) instruction
    ),
    callMatter AS (
      SELECT
        ci.*,
        matter.MatterID AS matterId,
        matter.DisplayNumber AS matterDisplayNumber,
        matter.Status AS matterStatus,
        matter.OpenDate AS matterOpenDate,
        matter.ResponsibleSolicitor AS matterResponsibleSolicitor,
        matter.Source AS matterSource,
        openedEvent.CreatedAt AS matterOpenedAt,
        latestReview.action AS reviewAction,
        latestReview.candidate_enquiry_id AS reviewCandidateEnquiryId,
        latestReview.candidate_instruction_ref AS reviewCandidateInstructionRef,
        latestReview.candidate_matter_id AS reviewCandidateMatterId,
        latestReview.review_note AS reviewNote,
        latestReview.match_source AS reviewMatchSource,
        latestReview.reviewed_by AS reviewedBy,
        latestReview.created_at AS reviewedAt
      FROM callInstruction ci
      OUTER APPLY (
        SELECT TOP 1
          m.MatterID,
          m.DisplayNumber,
          m.Status,
          m.OpenDate,
          m.ResponsibleSolicitor,
          m.Source
        FROM dbo.Matters m
        WHERE ci.InstructionRef IS NOT NULL
          AND m.InstructionRef = ci.InstructionRef
        ORDER BY
          CASE
            WHEN NULLIF(LTRIM(RTRIM(m.DisplayNumber)), '') IS NOT NULL THEN 0
            WHEN m.Status = 'Open' THEN 1
            ELSE 2
          END,
          m.OpenDate DESC
      ) matter
      OUTER APPLY (
        SELECT TOP 1 ev.CreatedAt
        FROM dbo.Events ev
        WHERE ci.InstructionRef IS NOT NULL
          AND ev.EventType = 'matter.opened'
          AND ev.EntityId = ci.InstructionRef
        ORDER BY ev.CreatedAt DESC
      ) openedEvent
      OUTER APPLY (
        SELECT TOP 1
          r.id,
          r.action,
          r.candidate_enquiry_id,
          r.candidate_instruction_ref,
          r.candidate_matter_id,
          r.review_note,
          r.match_source,
          r.reviewed_by,
          r.created_at
        FROM dbo.reception_call_reviews r
        WHERE r.call_id = ci.callId
        ORDER BY r.created_at DESC, r.id DESC
      ) latestReview
)
SELECT
      callId,
      handler,
      callStatus,
      callCreatedAt,
      callStartedAt,
      callSubmittedAt,
      callType,
      enquiryId,
      dubberRecordingId,
      enquiryAcid,
      enquiryCreatedAt,
      form_duration_seconds AS formDurationSeconds,
      dubber_duration_seconds AS dubberDurationSeconds,
      dubberFromParty,
      dubberToParty,
      dubberCallType,
      dubberMatchedInitials,
      dubberMatchedEmail,
      dubberStartTimeUtc,
      dubberAiStatus,
      phone,
      firstName,
      lastName,
      enquiryNotes,
      areaOfWork,
      referralSource,
      adSet,
      keywords,
      landingUrl,
      gclid,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      externalCallId,
      trackingNumber,
      trackingSource,
      FeNotesRating AS feNotesRating,
      FeNotesRatedAt AS feNotesRatedAt,
      TeamsActivityId AS teamsActivityId,
      ActivityId AS activityId,
      TeamsMessageId AS teamsMessageId,
      teamsChannelId,
      teamsTeamId,
      teamsMessageTimestamp,
      teamsCardType,
      ClaimedBy AS claimedBy,
      ClaimedAt AS claimedAt,
      InstructionRef AS instructionRef,
      instructionStage,
      instructionSubmittedAt,
      stageRank,
      matterId,
      matterDisplayNumber,
      matterStatus,
      matterOpenDate,
      matterOpenedAt,
      matterResponsibleSolicitor,
      matterSource,
      reviewAction,
      reviewCandidateEnquiryId,
      reviewCandidateInstructionRef,
      reviewCandidateMatterId,
      reviewNote,
      reviewMatchSource,
      reviewedBy,
      reviewedAt
    FROM callMatter
    ORDER BY callCreatedAt DESC, callId DESC;
`;

// Independent view of inbound phone activity, sourced directly from Dubber recordings.
// Answers "who actually picked up the phone" (Emma, Kanchel, Wolfgang, Libby), which the
// incoming_calls form-intake aggregate cannot show because fee-earner pickups never go
// through the Reception form.
// Reception team in scope for pickup KPIs. Other initials are fee-earner pickups
// (interesting elsewhere, noise here). The unmatched bucket is the MoneyPenny proxy:
// inbound external calls Dubber could not tie back to a Helix team member.
const RECEPTION_PICKUP_INITIALS = ['EA', 'KW', 'WH', 'LD'];
const RECEPTION_PICKUP_IN_SQL = RECEPTION_PICKUP_INITIALS.map((initials) => `'${initials}'`).join(',');
const RECEPTION_PICKUP_HANDLER_SQL = `CASE
      WHEN UPPER(LTRIM(RTRIM(COALESCE(matched_team_initials, '')))) IN (${RECEPTION_PICKUP_IN_SQL}) THEN UPPER(LTRIM(RTRIM(matched_team_initials)))
      WHEN LOWER(CONCAT(COALESCE(to_label, ''), ' ', COALESCE(to_party, ''), ' ', COALESCE(channel, ''))) LIKE '%emma%' THEN 'EA'
      WHEN LOWER(CONCAT(COALESCE(to_label, ''), ' ', COALESCE(to_party, ''), ' ', COALESCE(channel, ''))) LIKE '%kanchel%' THEN 'KW'
      WHEN LOWER(CONCAT(COALESCE(to_label, ''), ' ', COALESCE(to_party, ''), ' ', COALESCE(channel, ''))) LIKE '%wolfgang%' THEN 'WH'
      WHEN LOWER(CONCAT(COALESCE(to_label, ''), ' ', COALESCE(to_party, ''), ' ', COALESCE(channel, ''))) LIKE '%libby%' THEN 'LD'
      ELSE '__unmatched__'
    END`;
const PHONE_PICKUPS_SQL = `
  SELECT
    ${RECEPTION_PICKUP_HANDLER_SQL} AS handler,
    MAX(CASE WHEN UPPER(LTRIM(RTRIM(COALESCE(matched_team_initials, '')))) IN (${RECEPTION_PICKUP_IN_SQL}) THEN matched_team_email ELSE NULL END) AS handlerEmail,
    COUNT(*) AS calls,
    SUM(CASE WHEN duration_seconds IS NOT NULL AND duration_seconds < 30 THEN 1 ELSE 0 END) AS shortCalls,
    SUM(CASE WHEN duration_seconds IS NOT NULL THEN duration_seconds ELSE 0 END) AS totalDurationSeconds,
    SUM(CASE WHEN duration_seconds IS NOT NULL THEN 1 ELSE 0 END) AS callsWithDuration,
    MAX(start_time_utc) AS lastCallAt
  FROM dbo.dubber_recordings
  WHERE call_type = 'inbound'
    AND start_time_utc >= @from
    AND start_time_utc <  @to
    -- External calls only: drop Helix-to-Helix internal calls where the caller
    -- is another @helix-law.com address. MoneyPenny / public callers don't match
    -- this pattern, so they stay in the unmatched bucket.
    AND (from_party IS NULL OR LOWER(from_party) NOT LIKE '%@helix-law.com%')
    -- Reception team only, plus the unmatched bucket (MoneyPenny proxy).
    AND (${RECEPTION_PICKUP_HANDLER_SQL} IN (${RECEPTION_PICKUP_IN_SQL}) OR ${RECEPTION_PICKUP_HANDLER_SQL} = '__unmatched__')
  GROUP BY ${RECEPTION_PICKUP_HANDLER_SQL}
  ORDER BY calls DESC;
`;

const PHONE_PICKUP_UNMATCHED_SQL = `
  SELECT TOP (${EVIDENCE_ROW_LIMIT})
    recording_id AS recordingId,
    start_time_utc AS startedAt,
    duration_seconds AS durationSeconds,
    from_party AS fromParty,
    to_party AS toParty,
    call_type AS callType,
    ai_status AS aiStatus
  FROM dbo.dubber_recordings
  WHERE call_type = 'inbound'
    AND start_time_utc >= @from
    AND start_time_utc <  @to
    AND (from_party IS NULL OR LOWER(from_party) NOT LIKE '%@helix-law.com%')
    AND ${RECEPTION_PICKUP_HANDLER_SQL} = '__unmatched__'
  ORDER BY start_time_utc DESC, recording_id DESC;
`;

const COVERAGE = {
  callsTaken: {
    source: 'dbo.dubber_recordings',
    note: 'Handler call counts are Dubber-first direct inbound phone pickups for reception lines. Logged Reception form rows remain attached as evidence for enquiry, instruction, matter, notes, and review follow-up, but missing forms no longer suppress the call denominator. MoneyPenny/dev form rows are excluded from reception-handler KPI totals until attribution is reliable.',
  },
  avgCallSeconds: {
    source: 'dbo.dubber_recordings.duration_seconds, fallback dbo.incoming_calls.call_duration_seconds',
    note: 'Dubber talk time when available; form-side duration as fallback.',
  },
  prospectsOpened: {
    source: "dbo.Instructions.Stage IN ('matter-opened','completed','payment-complete') joined via dbo.enquiries.acid",
    note: 'Matter path counts come from logged form evidence stitched to enquiry/instruction paths. Rates use the Dubber-first call denominator, so missing forms now reduce evidence coverage rather than suppressing call volume. This is not proof that the reception call caused the matter to open. Earlier pitch stages appear as onboarding in progress.',
  },
  prospectsInProgress: {
    source: "dbo.Instructions.Stage IN ('id-only-complete','proof-of-id-complete','proof-of-id','initialised')",
    note: 'Onboarding has started for the linked enquiry, but the matter is not opened yet. Useful as a leading indicator of conversion lag.',
  },
  notesClarity: {
    source: 'dbo.TeamsBotActivityTracking.FeNotesRating (latest non-partner_review_dm row per enquiry)',
    note: 'FE thumbs-up/down on the reception notes shown in the enquiry DM card. Attributed to the reception handler (taken_by), not the FE rater. notesRated is the denominator for clarityScore; expect coverage to ramp as more FEs rate.',
  },
  ringTime: {
    source: null,
    status: 'not_yet_tracked',
    note: "Dubber records talk time only. CallRail's wait_time field is not yet fetched/persisted; non-CallRail DDIs need a Southern (post-Horizon) feed. Scheduled as a follow-up slice.",
  },
  matterJoin: {
    source: 'dbo.Instructions, dbo.Matters, dbo.Events joined inside tab-app by InstructionRef',
    status: 'partial',
    note: 'Matter linkage is now owned in tab-app. Rows expose their join confidence so unlinked calls remain visible instead of being silently excluded.',
  },
};

function cleanString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function hoursBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  return hours >= 0 ? round1(hours) : null;
}

function stageRankNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isOpenedOutcome({ stageRank, matterDisplayNumber, matterStatus }) {
  const rank = stageRankNumber(stageRank);
  return Boolean(cleanString(matterDisplayNumber))
    || String(matterStatus || '').toLowerCase() === 'open'
    || (rank != null && rank >= 1 && rank <= 3);
}

function isInProgressOutcome({ stageRank, matterId }) {
  const rank = stageRankNumber(stageRank);
  return Boolean(cleanString(matterId)) || (rank != null && rank >= 4 && rank <= 7);
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneSuffix(value) {
  const digits = normalizePhoneDigits(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function sameText(a, b) {
  const left = cleanString(a);
  const right = cleanString(b);
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function getTriggeredBy(req) {
  return (req.headers['x-user-initials'] || req.headers['x-user-email'] || 'unknown').toString().slice(0, 128);
}

async function ensureReceptionReviewTable(connStr) {
  if (reviewTableReady) return;
  await withRequest(connStr, async (request) => request.query(ENSURE_RECEPTION_REVIEW_TABLE_SQL), 2);
  reviewTableReady = true;
}

function shapeReview(row) {
  const action = cleanString(row.reviewAction);
  if (!action) return null;
  return {
    action,
    candidateEnquiryId: row.reviewCandidateEnquiryId == null ? null : Number(row.reviewCandidateEnquiryId),
    candidateInstructionRef: cleanString(row.reviewCandidateInstructionRef),
    candidateMatterId: cleanString(row.reviewCandidateMatterId),
    note: cleanString(row.reviewNote),
    matchSource: cleanString(row.reviewMatchSource),
    reviewedBy: cleanString(row.reviewedBy),
    reviewedAt: toIsoOrNull(row.reviewedAt),
  };
}

function shapeLinkCandidate(row, call) {
  const phoneMatch = Boolean(phoneSuffix(row.phone) && phoneSuffix(row.phone) === phoneSuffix(call.phone));
  const emailMatch = sameText(row.email, call.email);
  const firstMatch = sameText(row.first, call.first_name);
  const lastMatch = sameText(row.last, call.last_name);
  const dateGapHours = row.dateGapHours == null ? null : Math.abs(Number(row.dateGapHours));
  const hasInstruction = Boolean(cleanString(row.instructionRef));
  const hasMatter = Boolean(cleanString(row.matterDisplayNumber) || cleanString(row.matterId));
  const score = [
    phoneMatch ? 45 : 0,
    emailMatch ? 35 : 0,
    firstMatch && lastMatch ? 25 : firstMatch || lastMatch ? 10 : 0,
    dateGapHours != null && dateGapHours <= 72 ? 12 : dateGapHours != null && dateGapHours <= 336 ? 6 : 0,
    hasInstruction ? 8 : 0,
    hasMatter ? 10 : 0,
  ].reduce((sum, part) => sum + part, 0);
  const reasons = [
    phoneMatch ? 'phone matches' : null,
    emailMatch ? 'email matches' : null,
    firstMatch && lastMatch ? 'name matches' : firstMatch || lastMatch ? 'partial name match' : null,
    dateGapHours != null && dateGapHours <= 72 ? 'within 3 days' : dateGapHours != null && dateGapHours <= 336 ? 'within 14 days' : null,
    hasMatter ? 'matter exists' : hasInstruction ? 'instruction exists' : null,
  ].filter(Boolean);
  return {
    enquiryId: Number(row.id),
    acid: cleanString(row.acid),
    leadName: [cleanString(row.first), cleanString(row.last)].filter(Boolean).join(' ') || null,
    email: cleanString(row.email),
    phone: cleanString(row.phone),
    areaOfWork: cleanString(row.aow),
    source: cleanString(row.source),
    enquiryCreatedAt: toIsoOrNull(row.datetime),
    instructionRef: cleanString(row.instructionRef),
    instructionStage: cleanString(row.instructionStage),
    matterId: cleanString(row.matterId),
    matterDisplayNumber: cleanString(row.matterDisplayNumber),
    dateGapHours: dateGapHours == null || !Number.isFinite(dateGapHours) ? null : round1(dateGapHours),
    score,
    confidence: score >= 85 ? 'high' : score >= 55 ? 'medium' : 'low',
    reasons,
  };
}

function shapeEvidenceRow(row) {
  const callCreatedAt = toIsoOrNull(row.callCreatedAt);
  const matterOpenedAt = toIsoOrNull(row.matterOpenedAt) || toIsoOrNull(row.matterOpenDate);
  const dubberDuration = row.dubberDurationSeconds == null ? null : Number(row.dubberDurationSeconds);
  const formDuration = row.formDurationSeconds == null ? null : Number(row.formDurationSeconds);
  const durationSeconds = Number.isFinite(dubberDuration) ? dubberDuration : (Number.isFinite(formDuration) ? formDuration : null);
  const matterId = cleanString(row.matterId);
  const matterDisplayNumber = cleanString(row.matterDisplayNumber);
  const instructionRef = cleanString(row.instructionRef);
  const teamsActivityId = cleanString(row.teamsActivityId);
  const stageRank = stageRankNumber(row.stageRank);
  const opened = isOpenedOutcome({ stageRank, matterDisplayNumber, matterStatus: row.matterStatus });
  const inProgress = !opened && isInProgressOutcome({ stageRank, matterId });
  const joinConfidence = matterDisplayNumber
    ? 'matterRequestPatched'
    : matterId
      ? 'instructionRefExact'
      : instructionRef
        ? 'acidPattern'
        : teamsActivityId
          ? 'teamsOnly'
          : 'unlinked';
  const confidenceReason = joinConfidence === 'matterRequestPatched'
    ? 'Matter row has an InstructionRef and downstream matter identifier.'
    : joinConfidence === 'instructionRefExact'
      ? 'Matter request row links by InstructionRef but is not fully opened yet.'
      : joinConfidence === 'acidPattern'
        ? 'Instruction was found from the enquiry ACID pattern; no matter row linked yet.'
        : joinConfidence === 'teamsOnly'
          ? 'Teams activity exists but no instruction or matter link is available yet.'
          : 'No instruction, matter, or Teams activity link found for this call.';

  return {
    callId: Number(row.callId || 0),
    handler: cleanString(row.handler) || 'unknown',
    callStatus: cleanString(row.callStatus),
    callCreatedAt,
    callStartedAt: toIsoOrNull(row.callStartedAt),
    callSubmittedAt: toIsoOrNull(row.callSubmittedAt),
    callType: cleanString(row.callType),
    enquiryId: row.enquiryId == null ? null : Number(row.enquiryId),
    enquiryAcid: cleanString(row.enquiryAcid),
    enquiryCreatedAt: toIsoOrNull(row.enquiryCreatedAt),
    dubberRecordingId: cleanString(row.dubberRecordingId),
    dubberFromParty: cleanString(row.dubberFromParty),
    dubberToParty: cleanString(row.dubberToParty),
    dubberCallType: cleanString(row.dubberCallType),
    dubberMatchedInitials: cleanString(row.dubberMatchedInitials),
    dubberMatchedEmail: cleanString(row.dubberMatchedEmail),
    dubberStartTimeUtc: toIsoOrNull(row.dubberStartTimeUtc),
    dubberAiStatus: row.dubberAiStatus || null,
    phone: cleanString(row.phone),
    firstName: cleanString(row.firstName),
    lastName: cleanString(row.lastName),
    enquiryNotes: cleanString(row.enquiryNotes),
    areaOfWork: cleanString(row.areaOfWork),
    referralSource: cleanString(row.referralSource),
    adSet: cleanString(row.adSet),
    keywords: cleanString(row.keywords),
    landingUrl: cleanString(row.landingUrl),
    gclid: cleanString(row.gclid),
    utmSource: cleanString(row.utmSource),
    utmMedium: cleanString(row.utmMedium),
    utmCampaign: cleanString(row.utmCampaign),
    utmContent: cleanString(row.utmContent),
    utmTerm: cleanString(row.utmTerm),
    externalCallId: cleanString(row.externalCallId),
    trackingNumber: cleanString(row.trackingNumber),
    trackingSource: cleanString(row.trackingSource),
    durationSeconds: durationSeconds == null ? null : round1(durationSeconds),
    durationSource: Number.isFinite(dubberDuration) ? 'dubber' : (Number.isFinite(formDuration) ? 'form' : 'missing'),
    notesRating: cleanString(row.feNotesRating),
    notesRatedAt: toIsoOrNull(row.feNotesRatedAt),
    teamsActivityId,
    activityId: cleanString(row.activityId),
    teamsMessageId: cleanString(row.teamsMessageId),
    teamsChannelId: cleanString(row.teamsChannelId),
    teamsTeamId: cleanString(row.teamsTeamId),
    teamsMessageTimestamp: toIsoOrNull(row.teamsMessageTimestamp),
    teamsCardType: cleanString(row.teamsCardType),
    claimedBy: cleanString(row.claimedBy),
    claimedAt: toIsoOrNull(row.claimedAt),
    instructionRef,
    instructionStage: cleanString(row.instructionStage),
    instructionSubmittedAt: toIsoOrNull(row.instructionSubmittedAt),
    stageRank,
    matterId,
    matterDisplayNumber,
    matterStatus: cleanString(row.matterStatus),
    matterOpenedAt,
    matterResponsibleSolicitor: cleanString(row.matterResponsibleSolicitor),
    matterSource: cleanString(row.matterSource),
    outcome: opened ? 'opened' : (inProgress ? 'in_progress' : 'unlinked'),
    joinConfidence,
    confidenceReason,
    review: shapeReview(row),
    callToMatterHours: hoursBetween(callCreatedAt, matterOpenedAt),
  };
}

function shapePhonePickupEvidenceRow(row) {
  const duration = row.durationSeconds == null ? null : Number(row.durationSeconds);
  return {
    recordingId: cleanString(row.recordingId),
    startedAt: toIsoOrNull(row.startedAt),
    durationSeconds: Number.isFinite(duration) ? round1(duration) : null,
    fromParty: cleanString(row.fromParty),
    toParty: cleanString(row.toParty),
    callType: cleanString(row.callType),
    aiStatus: cleanString(row.aiStatus),
  };
}

function normalisedCallType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  if (raw === 'new-enquiry' || raw === 'new_enquiry' || raw === 'newenquiry') return 'newEnquiry';
  if (raw === 'telephone-message' || raw === 'telephone_message' || raw === 'tel-message' || raw === 'message') return 'telephoneMessage';
  if (raw === 'returning-call' || raw === 'returning_call' || raw === 'callback' || raw === 'return-call') return 'callback';
  return 'other';
}

function emptyCallsByType() {
  return { newEnquiry: 0, telephoneMessage: 0, callback: 0, other: 0, unknown: 0 };
}

function identityConfidence(row) {
  const handler = String(row.handler || '').trim().toLowerCase();
  const matched = String(row.dubberMatchedInitials || '').trim().toLowerCase();
  if (!row.dubberRecordingId) return 'unverified';
  if (!matched || !handler) return 'unverified';
  if (matched === handler) return 'verified';
  return 'mismatch';
}

function aggregateEvidenceRows(evidenceRows) {
  const byHandler = new Map();
  for (const row of evidenceRows) {
    const key = row.handler || 'unknown';
    if (!byHandler.has(key)) {
      byHandler.set(key, {
        handler: key,
        callsTaken: 0,
        callsHandled: 0,
        avgCallSeconds: null,
        callsWithDuration: 0,
        prospectsOpened: 0,
        prospectsInProgress: 0,
        notesRated: 0,
        notesClear: 0,
        notesUnclear: 0,
        clarityScore: null,
        totalDurationSeconds: 0,
        callsByType: emptyCallsByType(),
        identityVerified: 0,
        identityMismatch: 0,
        identityUnverified: 0,
        loggedForms: 0,
        lastCallAt: null,
      });
    }
    const aggregate = byHandler.get(key);
    aggregate.callsTaken += 1;
    aggregate.loggedForms += 1;
    if (String(row.callStatus || '').toLowerCase() === 'handled') aggregate.callsHandled += 1;
    if (row.durationSeconds != null) {
      aggregate.callsWithDuration += 1;
      aggregate.totalDurationSeconds += row.durationSeconds;
    }
    if (row.outcome === 'opened') aggregate.prospectsOpened += 1;
    if (row.outcome === 'in_progress') aggregate.prospectsInProgress += 1;
    if (row.notesRating) aggregate.notesRated += 1;
    if (String(row.notesRating || '').toLowerCase() === 'clear') aggregate.notesClear += 1;
    if (String(row.notesRating || '').toLowerCase() === 'unclear') aggregate.notesUnclear += 1;
    const typeKey = normalisedCallType(row.callType);
    aggregate.callsByType[typeKey] = (aggregate.callsByType[typeKey] || 0) + 1;
    const idConf = identityConfidence(row);
    if (idConf === 'verified') aggregate.identityVerified += 1;
    else if (idConf === 'mismatch') aggregate.identityMismatch += 1;
    else aggregate.identityUnverified += 1;
  }

  return [...byHandler.values()].map((row) => {
    const avgCallSeconds = row.callsWithDuration > 0 ? round1(row.totalDurationSeconds / row.callsWithDuration) : null;
    return {
      handler: row.handler,
      callsTaken: row.callsTaken,
      callsHandled: row.callsHandled,
      avgCallSeconds,
      callsWithDuration: row.callsWithDuration,
      prospectsOpened: row.prospectsOpened,
      prospectsInProgress: row.prospectsInProgress,
      conversionRate: row.callsTaken > 0 ? round4(row.prospectsOpened / row.callsTaken) : null,
      notesRated: row.notesRated,
      notesClear: row.notesClear,
      notesUnclear: row.notesUnclear,
      clarityScore: row.notesRated > 0 ? round4(row.notesClear / row.notesRated) : null,
      callsByType: row.callsByType,
      identityVerified: row.identityVerified,
      identityMismatch: row.identityMismatch,
      identityUnverified: row.identityUnverified,
      loggedForms: row.loggedForms,
      lastCallAt: row.lastCallAt,
    };
  }).sort((a, b) => b.callsTaken - a.callsTaken || a.handler.localeCompare(b.handler));
}

function emptyHandlerAggregate(handler) {
  return {
    handler,
    callsTaken: 0,
    callsHandled: 0,
    avgCallSeconds: null,
    callsWithDuration: 0,
    prospectsOpened: 0,
    prospectsInProgress: 0,
    conversionRate: null,
    notesRated: 0,
    notesClear: 0,
    notesUnclear: 0,
    clarityScore: null,
    callsByType: emptyCallsByType(),
    identityVerified: 0,
    identityMismatch: 0,
    identityUnverified: 0,
    loggedForms: 0,
    lastCallAt: null,
  };
}

function buildDubberFirstHandlers(evidenceHandlers, phonePickupAggregates) {
  const byHandler = new Map();
  for (const row of evidenceHandlers) {
    byHandler.set(row.handler, {
      ...row,
      loggedForms: Number(row.loggedForms || row.callsTaken || 0),
      callsTaken: 0,
      avgCallSeconds: null,
      callsWithDuration: 0,
      conversionRate: null,
      lastCallAt: null,
    });
  }

  for (const pickup of phonePickupAggregates.handlers || []) {
    const key = String(pickup.handler || '').trim().toLowerCase();
    if (!key) continue;
    const row = byHandler.get(key) || emptyHandlerAggregate(key);
    row.callsTaken = Number(pickup.calls || 0);
    row.avgCallSeconds = pickup.avgCallSeconds == null ? null : Number(pickup.avgCallSeconds);
    row.callsWithDuration = Number(pickup.callsWithDuration || 0);
    row.lastCallAt = pickup.lastCallAt || null;
    row.conversionRate = row.callsTaken > 0 ? round4(row.prospectsOpened / row.callsTaken) : null;
    byHandler.set(key, row);
  }

  return [...byHandler.values()].sort((a, b) => b.callsTaken - a.callsTaken || b.loggedForms - a.loggedForms || a.handler.localeCompare(b.handler));
}

function buildEvidenceSummary(evidenceRows) {
  const totalRows = evidenceRows.length;
  const linkedInstructions = evidenceRows.filter((row) => row.instructionRef).length;
  const linkedMatters = evidenceRows.filter((row) => row.matterId || row.matterDisplayNumber || row.outcome === 'opened').length;
  const unlinked = evidenceRows.filter((row) => row.joinConfidence === 'unlinked').length;
  const latestCallAt = evidenceRows.reduce((latest, row) => {
    if (!row.callCreatedAt) return latest;
    return !latest || row.callCreatedAt > latest ? row.callCreatedAt : latest;
  }, null);
  const confidenceCounts = evidenceRows.reduce((acc, row) => {
    acc[row.joinConfidence] = (acc[row.joinConfidence] || 0) + 1;
    return acc;
  }, {});

  return {
    totalRows,
    returnedRows: Math.min(EVIDENCE_ROW_LIMIT, totalRows),
    latestCallAt,
    linkedInstructions,
    linkedMatters,
    unlinked,
    instructionJoinRate: totalRows > 0 ? round4(linkedInstructions / totalRows) : null,
    matterJoinRate: totalRows > 0 ? round4(linkedMatters / totalRows) : null,
    confidenceCounts,
  };
}

function buildConversionStageSummary(evidenceRows) {
  const callsLogged = evidenceRows.length;
  const enquiryLinked = evidenceRows.filter((row) => row.enquiryId != null || row.enquiryAcid).length;
  const instructionLinked = evidenceRows.filter((row) => row.instructionRef).length;
  const matterLinked = evidenceRows.filter((row) => row.matterId || row.matterDisplayNumber).length;
  const matterOpened = evidenceRows.filter((row) => row.outcome === 'opened').length;
  const onboardingInProgress = evidenceRows.filter((row) => row.outcome === 'in_progress').length;
  const noMatterLink = evidenceRows.filter((row) => row.outcome === 'unlinked').length;
  const noEnquiryLink = evidenceRows.filter((row) => row.enquiryId == null && !row.enquiryAcid).length;

  return {
    callsLogged,
    enquiryLinked,
    instructionLinked,
    matterLinked,
    matterOpened,
    onboardingInProgress,
    noMatterLink,
    noEnquiryLink,
    enquiryJoinRate: callsLogged > 0 ? round4(enquiryLinked / callsLogged) : null,
    instructionJoinRate: callsLogged > 0 ? round4(instructionLinked / callsLogged) : null,
    matterJoinRate: callsLogged > 0 ? round4(matterLinked / callsLogged) : null,
    callToMatterConversionRate: callsLogged > 0 ? round4(matterOpened / callsLogged) : null,
  };
}

function computeTotals(handlers) {
  let totalCallsTaken = 0;
  let totalCallsHandled = 0;
  let totalCallsWithDuration = 0;
  let totalProspectsOpened = 0;
  let totalProspectsInProgress = 0;
  let totalNotesRated = 0;
  let totalNotesClear = 0;
  let totalNotesUnclear = 0;
  let totalDurationSeconds = 0;
  const totalCallsByType = emptyCallsByType();
  let totalIdentityVerified = 0;
  let totalIdentityMismatch = 0;
  let totalIdentityUnverified = 0;
  let totalLoggedForms = 0;
  let latestCallAt = null;
  for (const h of handlers) {
    totalCallsTaken += h.callsTaken;
    totalCallsHandled += h.callsHandled;
    totalCallsWithDuration += h.callsWithDuration;
    totalProspectsOpened += h.prospectsOpened;
    totalProspectsInProgress += h.prospectsInProgress;
    totalNotesRated += h.notesRated;
    totalNotesClear += h.notesClear;
    totalNotesUnclear += h.notesUnclear;
    if (h.avgCallSeconds != null && h.callsWithDuration > 0) {
      totalDurationSeconds += h.avgCallSeconds * h.callsWithDuration;
    }
    if (h.callsByType) {
      for (const key of Object.keys(totalCallsByType)) {
        totalCallsByType[key] += Number(h.callsByType[key] || 0);
      }
    }
    totalIdentityVerified += h.identityVerified || 0;
    totalIdentityMismatch += h.identityMismatch || 0;
    totalIdentityUnverified += h.identityUnverified || 0;
    totalLoggedForms += Number(h.loggedForms || 0);
    if (h.lastCallAt && (!latestCallAt || h.lastCallAt > latestCallAt)) latestCallAt = h.lastCallAt;
  }
  return {
    handler: null,
    callsTaken: totalCallsTaken,
    callsHandled: totalCallsHandled,
    avgCallSeconds: totalCallsWithDuration > 0 ? round1(totalDurationSeconds / totalCallsWithDuration) : null,
    callsWithDuration: totalCallsWithDuration,
    prospectsOpened: totalProspectsOpened,
    prospectsInProgress: totalProspectsInProgress,
    conversionRate: totalCallsTaken > 0 ? round4(totalProspectsOpened / totalCallsTaken) : null,
    notesRated: totalNotesRated,
    notesClear: totalNotesClear,
    notesUnclear: totalNotesUnclear,
    clarityScore: totalNotesRated > 0 ? round4(totalNotesClear / totalNotesRated) : null,
    callsByType: totalCallsByType,
    identityVerified: totalIdentityVerified,
    identityMismatch: totalIdentityMismatch,
    identityUnverified: totalIdentityUnverified,
    loggedForms: totalLoggedForms,
    lastCallAt: latestCallAt,
  };
}

function aggregatePhonePickups(rows) {
  const handlers = [];
  let totalCalls = 0;
  let totalShort = 0;
  let totalDuration = 0;
  let totalCallsWithDuration = 0;
  let unmatchedCalls = 0;
  let unmatchedShort = 0;
  let unmatchedDuration = 0;
  let unmatchedCallsWithDuration = 0;
  let unmatchedLastCallAt = null;
  for (const row of rows) {
    const calls = Number(row.calls || 0);
    const shortCalls = Number(row.shortCalls || 0);
    const dur = Number(row.totalDurationSeconds || 0);
    const cwd = Number(row.callsWithDuration || 0);
    totalCalls += calls;
    totalShort += shortCalls;
    totalDuration += dur;
    totalCallsWithDuration += cwd;
    const handler = String(row.handler || '').trim();
    if (!handler || handler === '__unmatched__') {
      unmatchedCalls += calls;
      unmatchedShort += shortCalls;
      unmatchedDuration += dur;
      unmatchedCallsWithDuration += cwd;
      const lastIso = toIsoOrNull(row.lastCallAt);
      if (lastIso && (!unmatchedLastCallAt || lastIso > unmatchedLastCallAt)) {
        unmatchedLastCallAt = lastIso;
      }
      continue;
    }
    handlers.push({
      handler: handler.toLowerCase(),
      handlerInitials: handler.toUpperCase(),
      handlerEmail: cleanString(row.handlerEmail),
      calls,
      shortCalls,
      avgCallSeconds: cwd > 0 ? round1(dur / cwd) : null,
      callsWithDuration: cwd,
      lastCallAt: toIsoOrNull(row.lastCallAt),
    });
  }
  handlers.sort((a, b) => b.calls - a.calls || a.handlerInitials.localeCompare(b.handlerInitials));
  return {
    handlers,
    unmatched: {
      calls: unmatchedCalls,
      shortCalls: unmatchedShort,
      avgCallSeconds: unmatchedCallsWithDuration > 0 ? round1(unmatchedDuration / unmatchedCallsWithDuration) : null,
      callsWithDuration: unmatchedCallsWithDuration,
      lastCallAt: unmatchedLastCallAt,
    },
    totals: {
      calls: totalCalls,
      shortCalls: totalShort,
      avgCallSeconds: totalCallsWithDuration > 0 ? round1(totalDuration / totalCallsWithDuration) : null,
      callsWithDuration: totalCallsWithDuration,
    },
  };
}

function cacheGet(key) {
  const hit = memoCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    memoCache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key, payload) {
  if (memoCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = memoCache.keys().next().value;
    if (firstKey !== undefined) memoCache.delete(firstKey);
  }
  memoCache.set(key, { at: Date.now(), payload });
}

router.get('/reception-kpis', async (req, res) => {
  const { from, to } = req.query;
  const win = resolveWindow(from, to);
  if (win.error) {
    return res.status(400).json({ error: win.error, detail: win.detail || null });
  }
  const { fromUtc, toUtc } = win;
  const fromIso = fromUtc.toISOString();
  const toIso = toUtc.toISOString();
  const days = Math.round(((toUtc.getTime() - fromUtc.getTime()) / 86_400_000) * 100) / 100;
  const cacheKey = `${fromIso}|${toIso}`;
  const triggeredBy = getTriggeredBy(req);

  const cached = cacheGet(cacheKey);
  if (cached) {
    trackEvent('Reporting.ReceptionKpis.Query.Completed', {
      from: fromIso, to: toIso, days: String(days),
      handlerCount: String(cached.handlers.length),
      cacheHit: 'true', triggeredBy,
    });
    return res.json(cached);
  }

  const startedAt = Date.now();
  trackEvent('Reporting.ReceptionKpis.Query.Started', {
    from: fromIso, to: toIso, days: String(days), triggeredBy,
  });

  try {
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
    await ensureReceptionReviewTable(connStr);
    const [result, pickupsResult, unmatchedPickupsResult] = await Promise.all([
      withRequest(connStr, async (request) => {
        request.input('from', sql.DateTime2, fromUtc);
        request.input('to', sql.DateTime2, toUtc);
        request.requestTimeout = SQL_TIMEOUT_MS;
        return request.query(SQL_QUERY);
      }, 2),
      withRequest(connStr, async (request) => {
        request.input('from', sql.DateTime2, fromUtc);
        request.input('to', sql.DateTime2, toUtc);
        request.requestTimeout = SQL_TIMEOUT_MS;
        return request.query(PHONE_PICKUPS_SQL);
      }, 2),
      withRequest(connStr, async (request) => {
        request.input('from', sql.DateTime2, fromUtc);
        request.input('to', sql.DateTime2, toUtc);
        request.requestTimeout = SQL_TIMEOUT_MS;
        return request.query(PHONE_PICKUP_UNMATCHED_SQL);
      }, 2),
    ]);
    const rawRows = (result && result.recordset) || [];
    const evidenceRows = rawRows.map(shapeEvidenceRow);
    const evidenceHandlers = aggregateEvidenceRows(evidenceRows);
    const evidenceSummary = buildEvidenceSummary(evidenceRows);
    const conversionStages = buildConversionStageSummary(evidenceRows);
    const pickupRows = (pickupsResult && pickupsResult.recordset) || [];
    const unmatchedPickupRows = ((unmatchedPickupsResult && unmatchedPickupsResult.recordset) || []).map(shapePhonePickupEvidenceRow);
    const phonePickupAggregates = aggregatePhonePickups(pickupRows);
    const handlers = buildDubberFirstHandlers(evidenceHandlers, phonePickupAggregates);
    const totals = computeTotals(handlers);
    const phonePickups = {
      ...phonePickupAggregates,
      unmatched: {
        ...phonePickupAggregates.unmatched,
        rows: unmatchedPickupRows,
        returnedRows: unmatchedPickupRows.length,
      },
      source: "dbo.dubber_recordings (call_type='inbound')",
    };
    const payload = {
      window: { from: fromIso, to: toIso, days },
      handlers,
      totals,
      coverage: COVERAGE,
      conversionStages,
      phonePickups,
      evidence: {
        rows: evidenceRows.slice(0, EVIDENCE_ROW_LIMIT),
        ...evidenceSummary,
      },
    };
    cacheSet(cacheKey, payload);

    const durationMs = Date.now() - startedAt;
    trackEvent('Reporting.ReceptionKpis.Query.Completed', {
      from: fromIso, to: toIso, days: String(days),
      handlerCount: String(handlers.length),
      rowCount: String(rawRows.length),
      pickupHandlerCount: String(phonePickups.handlers.length),
      pickupCalls: String(phonePickups.totals.calls),
      pickupUnmatched: String(phonePickups.unmatched.calls),
      pickupUnmatchedRows: String(phonePickups.unmatched.returnedRows),
      conversionMatterOpened: String(conversionStages.matterOpened),
      conversionOnboarding: String(conversionStages.onboardingInProgress),
      conversionNoMatterLink: String(conversionStages.noMatterLink),
      conversionEnquiryLinked: String(conversionStages.enquiryLinked),
      linkedMatterRows: String(evidenceSummary.linkedMatters),
      unlinkedRows: String(evidenceSummary.unlinked),
      cacheHit: 'false', triggeredBy,
      durationMs: String(durationMs),
    });
    trackMetric('Reporting.ReceptionKpis.QueryDuration', durationMs, { operation: 'directSql' });
    return res.json(payload);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    trackException(err, {
      operation: 'Reporting.ReceptionKpis.Query',
      phase: 'directSql',
      from: fromIso,
      to: toIso,
    });
    trackEvent('Reporting.ReceptionKpis.Query.Failed', {
      from: fromIso, to: toIso, error: err.message,
      durationMs: String(durationMs), triggeredBy,
    });
    return res.status(502).json({ error: 'reception_kpis_query_failed' });
  }
});

router.get('/reception-kpis/link-lookup/:callId', async (req, res) => {
  const callId = Number(req.params.callId);
  const triggeredBy = getTriggeredBy(req);
  if (!Number.isInteger(callId) || callId <= 0) {
    return res.status(400).json({ error: 'invalid_call_id' });
  }

  const startedAt = Date.now();
  trackEvent('Reporting.ReceptionKpis.LinkLookup.Started', { callId: String(callId), triggeredBy });

  try {
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
    await ensureReceptionReviewTable(connStr);

    const call = await withRequest(connStr, async (request) => {
      request.input('callId', sql.Int, callId);
      const result = await request.query(`
        SELECT TOP 1 id, enquiry_id, phone, first_name, last_name, email, call_type,
               call_started_at, call_submitted_at, created_at, area_of_work, enquiry_notes
        FROM dbo.incoming_calls
        WHERE id = @callId;
      `);
      return result.recordset[0] || null;
    }, 2);

    if (!call) {
      trackEvent('Reporting.ReceptionKpis.LinkLookup.NotFound', { callId: String(callId), triggeredBy });
      return res.status(404).json({ error: 'call_not_found' });
    }

    const callAt = call.call_started_at || call.call_submitted_at || call.created_at || new Date();
    const phone = cleanString(call.phone);
    const phoneTail = phoneSuffix(phone);
    const firstName = cleanString(call.first_name);
    const lastName = cleanString(call.last_name);
    const email = cleanString(call.email);

    const candidates = await withRequest(connStr, async (request) => {
      request.input('callId', sql.Int, callId);
      request.input('callAt', sql.DateTime2, callAt);
      request.input('phoneTail', sql.NVarChar(16), phoneTail || null);
      request.input('firstName', sql.NVarChar(100), firstName || null);
      request.input('lastName', sql.NVarChar(100), lastName || null);
      request.input('email', sql.NVarChar(255), email || null);
      const result = await request.query(`
        WITH candidateBase AS (
          SELECT TOP 30
            e.id,
            e.acid,
            e.first,
            e.last,
            e.email,
            e.phone,
            e.aow,
            e.source,
            e.datetime,
            DATEDIFF(hour, e.datetime, @callAt) AS dateGapHours,
            CASE
              WHEN @phoneTail IS NOT NULL
                AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(e.phone, ''), ' ', ''), '+', ''), '(', ''), ')', ''), '-', ''), '.', ''), LEN(@phoneTail)) = @phoneTail THEN 1 ELSE 0
            END AS phoneMatch,
            CASE WHEN @email IS NOT NULL AND LOWER(LTRIM(RTRIM(COALESCE(e.email, '')))) = LOWER(@email) THEN 1 ELSE 0 END AS emailMatch,
            CASE WHEN @firstName IS NOT NULL AND LOWER(LTRIM(RTRIM(COALESCE(e.first, '')))) = LOWER(@firstName) THEN 1 ELSE 0 END AS firstMatch,
            CASE WHEN @lastName IS NOT NULL AND LOWER(LTRIM(RTRIM(COALESCE(e.last, '')))) = LOWER(@lastName) THEN 1 ELSE 0 END AS lastMatch
          FROM dbo.enquiries e
          WHERE e.id <> COALESCE((SELECT enquiry_id FROM dbo.incoming_calls WHERE id = @callId), -1)
            AND (
              (@phoneTail IS NOT NULL AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(e.phone, ''), ' ', ''), '+', ''), '(', ''), ')', ''), '-', ''), '.', ''), LEN(@phoneTail)) = @phoneTail)
              OR (@email IS NOT NULL AND LOWER(LTRIM(RTRIM(COALESCE(e.email, '')))) = LOWER(@email))
              OR (@firstName IS NOT NULL AND LOWER(LTRIM(RTRIM(COALESCE(e.first, '')))) = LOWER(@firstName))
              OR (@lastName IS NOT NULL AND LOWER(LTRIM(RTRIM(COALESCE(e.last, '')))) = LOWER(@lastName))
              OR ABS(DATEDIFF(day, e.datetime, @callAt)) <= 2
            )
          ORDER BY
            CASE
              WHEN @phoneTail IS NOT NULL AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(e.phone, ''), ' ', ''), '+', ''), '(', ''), ')', ''), '-', ''), '.', ''), LEN(@phoneTail)) = @phoneTail THEN 0
              WHEN @email IS NOT NULL AND LOWER(LTRIM(RTRIM(COALESCE(e.email, '')))) = LOWER(@email) THEN 1
              ELSE 2
            END,
            ABS(DATEDIFF(hour, e.datetime, @callAt)) ASC
        )
        SELECT TOP 8
          cb.*,
          instruction.InstructionRef AS instructionRef,
          instruction.Stage AS instructionStage,
          matter.MatterID AS matterId,
          matter.DisplayNumber AS matterDisplayNumber
        FROM candidateBase cb
        OUTER APPLY (
          SELECT TOP 1 i.InstructionRef, i.Stage
          FROM dbo.Instructions i
          WHERE cb.acid IS NOT NULL AND i.InstructionRef LIKE 'HLX-' + cb.acid + '-%'
          ORDER BY i.SubmissionDate DESC, i.InstructionRef DESC
        ) instruction
        OUTER APPLY (
          SELECT TOP 1 m.MatterID, m.DisplayNumber
          FROM dbo.Matters m
          WHERE instruction.InstructionRef IS NOT NULL AND m.InstructionRef = instruction.InstructionRef
          ORDER BY m.OpenDate DESC
        ) matter
        ORDER BY
          phoneMatch DESC,
          emailMatch DESC,
          (firstMatch + lastMatch) DESC,
          ABS(dateGapHours) ASC;
      `);
      return result.recordset;
    }, 2);

    const shapedCandidates = candidates.map((candidate) => shapeLinkCandidate(candidate, call));
    const durationMs = Date.now() - startedAt;
    trackEvent('Reporting.ReceptionKpis.LinkLookup.Completed', {
      callId: String(callId),
      candidateCount: String(shapedCandidates.length),
      durationMs: String(durationMs),
      triggeredBy,
    });
    trackMetric('Reporting.ReceptionKpis.LinkLookupDuration', durationMs, { operation: 'candidateLookup' });
    return res.json({
      call: {
        callId,
        currentEnquiryId: call.enquiry_id == null ? null : Number(call.enquiry_id),
        phone: cleanString(call.phone),
        leadName: [cleanString(call.first_name), cleanString(call.last_name)].filter(Boolean).join(' ') || null,
        email: cleanString(call.email),
        callType: cleanString(call.call_type),
        callAt: toIsoOrNull(callAt),
        areaOfWork: cleanString(call.area_of_work),
      },
      candidates: shapedCandidates,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    trackException(err, { operation: 'Reporting.ReceptionKpis.LinkLookup', phase: 'query', callId: String(callId) });
    trackEvent('Reporting.ReceptionKpis.LinkLookup.Failed', { callId: String(callId), error: err.message, durationMs: String(durationMs), triggeredBy });
    return res.status(502).json({ error: 'reception_link_lookup_failed' });
  }
});

router.post('/reception-kpis/link-review/:callId', async (req, res) => {
  const callId = Number(req.params.callId);
  const triggeredBy = getTriggeredBy(req);
  const action = cleanString(req.body?.action);
  const note = cleanString(req.body?.note);
  const candidateEnquiryId = req.body?.candidateEnquiryId == null ? null : Number(req.body.candidateEnquiryId);
  const allowedActions = new Set(['confirm', 'reject', 'manual_link']);

  if (!Number.isInteger(callId) || callId <= 0) return res.status(400).json({ error: 'invalid_call_id' });
  if (!action || !allowedActions.has(action)) return res.status(400).json({ error: 'invalid_action' });
  if (action === 'manual_link' && (!Number.isInteger(candidateEnquiryId) || candidateEnquiryId <= 0)) {
    return res.status(400).json({ error: 'candidate_enquiry_id_required' });
  }

  const startedAt = Date.now();
  trackEvent('Reporting.ReceptionKpis.LinkReview.Started', { callId: String(callId), action, triggeredBy });

  try {
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
    await ensureReceptionReviewTable(connStr);

    const result = await withRequest(connStr, async (request) => {
      request.input('callId', sql.Int, callId);
      request.input('action', sql.NVarChar(32), action);
      request.input('candidateEnquiryId', sql.Int, candidateEnquiryId);
      request.input('note', sql.NVarChar(500), note);
      request.input('reviewedBy', sql.NVarChar(128), triggeredBy);
      request.input('matchSource', sql.NVarChar(64), action === 'manual_link' ? 'operator_manual' : 'operator_review');
      const query = `
        SET XACT_ABORT ON;
        BEGIN TRAN;

        DECLARE @candidateInstructionRef NVARCHAR(100) = NULL;
        DECLARE @candidateMatterId NVARCHAR(100) = NULL;

        IF NOT EXISTS (SELECT 1 FROM dbo.incoming_calls WHERE id = @callId)
        BEGIN
          ROLLBACK TRAN;
          SELECT CAST(0 AS bit) AS ok, 'call_not_found' AS error;
          RETURN;
        END;

        IF @candidateEnquiryId IS NOT NULL
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM dbo.enquiries WHERE id = @candidateEnquiryId)
          BEGIN
            ROLLBACK TRAN;
            SELECT CAST(0 AS bit) AS ok, 'candidate_not_found' AS error;
            RETURN;
          END;

          SELECT TOP 1 @candidateInstructionRef = i.InstructionRef
          FROM dbo.enquiries e
          JOIN dbo.Instructions i ON e.acid IS NOT NULL AND i.InstructionRef LIKE 'HLX-' + e.acid + '-%'
          WHERE e.id = @candidateEnquiryId
          ORDER BY i.SubmissionDate DESC, i.InstructionRef DESC;

          SELECT TOP 1 @candidateMatterId = COALESCE(NULLIF(LTRIM(RTRIM(m.DisplayNumber)), ''), NULLIF(LTRIM(RTRIM(m.MatterID)), ''))
          FROM dbo.Matters m
          WHERE @candidateInstructionRef IS NOT NULL AND m.InstructionRef = @candidateInstructionRef
          ORDER BY m.OpenDate DESC;
        END;

        IF @action = 'manual_link'
        BEGIN
          UPDATE dbo.incoming_calls
          SET enquiry_id = @candidateEnquiryId
          WHERE id = @callId;
        END;

        INSERT INTO dbo.reception_call_reviews
          (call_id, action, candidate_enquiry_id, candidate_instruction_ref, candidate_matter_id, review_note, match_source, reviewed_by)
        OUTPUT inserted.id, inserted.created_at
        VALUES
          (@callId, @action, @candidateEnquiryId, @candidateInstructionRef, @candidateMatterId, @note, @matchSource, @reviewedBy);

        COMMIT TRAN;
      `;
      const reviewResult = await request.query(query);
      return reviewResult.recordsets?.[0]?.[0] || reviewResult.recordset?.[0] || null;
    }, 2);

    if (result && result.ok === false) {
      return res.status(result.error === 'call_not_found' || result.error === 'candidate_not_found' ? 404 : 400).json({ error: result.error });
    }

    memoCache.clear();
    const durationMs = Date.now() - startedAt;
    trackEvent('Reporting.ReceptionKpis.LinkReview.Completed', {
      callId: String(callId),
      action,
      candidateEnquiryId: candidateEnquiryId == null ? '' : String(candidateEnquiryId),
      durationMs: String(durationMs),
      triggeredBy,
    });
    trackMetric('Reporting.ReceptionKpis.LinkReviewDuration', durationMs, { operation: action });
    return res.json({ ok: true, callId, action, candidateEnquiryId, reviewId: result?.id ?? null, reviewedAt: toIsoOrNull(result?.created_at) });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    trackException(err, { operation: 'Reporting.ReceptionKpis.LinkReview', phase: action || 'unknown', callId: String(callId) });
    trackEvent('Reporting.ReceptionKpis.LinkReview.Failed', { callId: String(callId), action: action || '', error: err.message, durationMs: String(durationMs), triggeredBy });
    return res.status(502).json({ error: 'reception_link_review_failed' });
  }
});

// Transcript lookup for a single Dubber recording. Returns parsed sentences from
// dbo.dubber_recordings.ai_json (the Dubber AI payload). Cheap because we only
// touch one row by recording_id (PK on the table).
router.get('/reception-kpis/transcript/:recordingId', async (req, res) => {
  const recordingId = String(req.params.recordingId || '').trim();
  if (!recordingId || !/^[0-9A-Za-z_-]{4,128}$/.test(recordingId)) {
    return res.status(400).json({ error: 'invalid_recording_id' });
  }
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) return res.status(500).json({ error: 'no_connection_string' });
  try {
    const row = await withRequest(connStr, async (request) => {
      request.input('recordingId', sql.NVarChar(64), recordingId);
      const r = await request.query(`
        SELECT TOP 1 recording_id, ai_status, ai_json, start_time_utc, duration_seconds,
               from_party, to_party, matched_team_initials, matched_team_email
        FROM dbo.dubber_recordings
        WHERE recording_id = @recordingId;
      `);
      return r.recordset[0] || null;
    });
    if (!row) return res.status(404).json({ error: 'recording_not_found' });
    let sentences = [];
    let documentSentiment = null;
    if (row.ai_json) {
      try {
        const parsed = JSON.parse(row.ai_json);
        documentSentiment = typeof parsed.document_sentiment === 'number' ? parsed.document_sentiment : null;
        if (Array.isArray(parsed.sentences)) {
          sentences = parsed.sentences
            .filter((s) => s && typeof s.content === 'string' && s.content.trim().length)
            .map((s) => ({
              speaker: s.speaker || null,
              content: s.content,
              sentiment: typeof s.sentiment === 'number' ? s.sentiment : null,
            }));
        }
      } catch (e) {
        trackException(e, { operation: 'Reporting.ReceptionKpis.Transcript', phase: 'parseAiJson', recordingId });
      }
    }
    return res.json({
      recordingId: row.recording_id,
      aiStatus: row.ai_status || null,
      startTimeUtc: row.start_time_utc ? new Date(row.start_time_utc).toISOString() : null,
      durationSeconds: row.duration_seconds ?? null,
      fromParty: row.from_party || null,
      toParty: row.to_party || null,
      matchedTeamInitials: row.matched_team_initials || null,
      matchedTeamEmail: row.matched_team_email || null,
      documentSentiment,
      sentences,
      hasTranscript: sentences.length > 0,
    });
  } catch (err) {
    trackException(err, { operation: 'Reporting.ReceptionKpis.Transcript', phase: 'query', recordingId });
    return res.status(502).json({ error: 'transcript_query_failed' });
  }
});

module.exports = router;
