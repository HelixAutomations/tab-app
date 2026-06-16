'use strict';

const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { resolveRequestActor } = require('../utils/requestActor');
const { getSecret } = require('../utils/getSecret');

const router = express.Router();
const TABLE_NAME = 'dbo.marketing_attribution_chain';
const CALLRAIL_TOKEN_SECRET = 'callrail-teamhub';
const CALLRAIL_ACCOUNT_ID = process.env.CALLRAIL_ACCOUNT_ID || '545032576';

const CHAIN_COLUMNS = [
  'source_channel',
  'source_value',
  'source_detail',
  'intake_type',
  'call_id',
  'form_submission_id',
  'email_thread_id',
  'intake_at',
  'enquiry_id',
  'enquiry_at',
  'enquiry_owner',
  'pitch_id',
  'pitch_at',
  'pitch_status',
  'pitched_by',
  'deal_amount',
  'instruction_ref',
  'instruction_at',
  'instruction_stage',
  'instruction_owner',
  'client_id',
  'client_type',
  'identity_check_id',
  'identity_check_result',
  'identity_check_status',
  'identity_check_at',
  'risk_assessment_id',
  'risk_assessment_result',
  'risk_assessment_status',
  'risk_assessment_at',
  'payment_id',
  'payment_method',
  'payment_status',
  'payment_amount',
  'payment_at',
  'matter_id',
  'matter_work_type',
  'matter_at',
  'responsible_solicitor',
  'originating_solicitor',
  'collected_value',
  'collected_value_as_at',
  'recent_sync_at',
  'attribution_note',
];

const TEXT_COLUMNS = new Set([
  'source_channel', 'source_value', 'source_detail', 'intake_type', 'call_id', 'form_submission_id', 'email_thread_id',
  'enquiry_id', 'enquiry_owner', 'pitch_id', 'pitch_status', 'pitched_by', 'instruction_ref', 'instruction_stage',
  'instruction_owner', 'client_id', 'client_type', 'identity_check_id', 'identity_check_result', 'identity_check_status',
  'risk_assessment_id', 'risk_assessment_result', 'risk_assessment_status', 'payment_id', 'payment_method', 'payment_status',
  'matter_id', 'matter_work_type', 'responsible_solicitor', 'originating_solicitor', 'attribution_note',
]);

const DATE_COLUMNS = new Set([
  'intake_at', 'enquiry_at', 'pitch_at', 'instruction_at', 'identity_check_at', 'risk_assessment_at', 'payment_at',
  'matter_at', 'collected_value_as_at', 'recent_sync_at',
]);

const DECIMAL_COLUMNS = new Set(['deal_amount', 'payment_amount', 'collected_value']);
const HARD_LINK_COLUMNS = ['instruction_ref', 'enquiry_id', 'pitch_id', 'payment_id', 'matter_id', 'identity_check_id', 'risk_assessment_id'];
let cachedCallRailToken = { token: null, ts: 0 };

function getInstructionsConn() {
  const conn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!conn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return conn;
}

function asTrimmed(value) {
  return String(value ?? '').trim();
}

function asNullableString(value, maxLength) {
  const next = asTrimmed(value);
  if (!next) return null;
  return maxLength ? next.slice(0, maxLength) : next;
}

function asNullableDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function asNullableDecimal(value) {
  if (value == null || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return asTrimmed(value).length > 0;
}

function normaliseEnum(value, allowed, fallback = null) {
  const raw = asTrimmed(value).toLowerCase();
  if (!raw) return fallback;
  const normalised = raw.replace(/[\s-]+/g, '_');
  return allowed.has(normalised) ? normalised : fallback;
}

function normaliseClientType(value) {
  const raw = asTrimmed(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes('existing')) return 'existing_client';
  if (raw.includes('multiple')) return 'multiple_individuals';
  if (raw.includes('company')) return 'company';
  if (raw.includes('individual')) return 'individual';
  return 'unknown';
}

function normalisePaymentMethod(value) {
  const raw = asTrimmed(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes('mixed')) return 'mixed';
  if (raw.includes('bank') || raw.includes('transfer') || raw.includes('bacs') || raw.includes('ach')) return 'bank_transfer';
  if (raw.includes('card') || raw.includes('stripe') || raw === 'cc') return 'card';
  return 'unknown';
}

function normaliseSourceChannel(value) {
  const raw = asTrimmed(value);
  const lower = raw.toLowerCase();
  if (!lower) return null;
  if (lower === 'organic search' || lower.includes('seo') || lower.includes('organic')) return 'SEO';
  if (lower === 'paid search' || lower.includes('ppc') || lower.includes('google ads') || lower.includes('paid')) return 'PPC';
  if (lower.includes('email')) return 'Email';
  if (lower.includes('refer')) return 'Referral';
  if (lower.includes('direct')) return 'Direct';
  return 'Unknown';
}

function inferIntakeType(value) {
  const raw = asTrimmed(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes('email') || raw.includes('mail')) return 'email';
  if (raw.includes('form') || raw.includes('web') || raw.includes('website') || raw.includes('portal')) return 'form';
  if (raw.includes('call') || raw.includes('phone') || raw.includes('telephone') || raw.includes('whatsapp') || raw.includes('sms')) return 'call';
  if (raw.includes('manual')) return 'manual';
  return 'unknown';
}

async function getCallRailToken() {
  const now = Date.now();
  if (cachedCallRailToken.token && now - cachedCallRailToken.ts < 30 * 60 * 1000) return cachedCallRailToken.token;
  const token = await getSecret(CALLRAIL_TOKEN_SECRET);
  cachedCallRailToken = { token, ts: now };
  return token;
}

function getSearchablePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(-10);
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickMilestoneField(milestones, field) {
  if (!milestones || typeof milestones !== 'object') return '';
  for (const key of ['lead_created', 'last_touch', 'first_touch', 'qualified']) {
    const candidate = milestones?.[key]?.[field];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function normaliseEvidenceString(value) {
  return String(value || '').trim().toLowerCase();
}

function classifyCallRailSignal(call) {
  const source = normaliseEvidenceString(call.source);
  const medium = normaliseEvidenceString(call.medium);
  const campaign = normaliseEvidenceString(call.campaign);
  const hasPaidClue = Boolean(call.gclid || call.msclkid || call.fbclid)
    || [source, medium, campaign].some((value) => /paid|ppc|cpc|google ads|adwords|gclid|msclkid/i.test(value));
  if (hasPaidClue) return 'paid';
  if (['organic', 'direct', 'referral'].some((token) => source.includes(token) || medium.includes(token))) return 'organic';
  return 'unknown';
}

function isGenericGoogleSource(value) {
  const source = normaliseEvidenceString(value);
  return source.includes('google') && !/paid|ppc|cpc|ads|adwords|gclid|msclkid/i.test(source);
}

function buildCallRailDecision(evidence, currentSource) {
  if (!evidence.length) {
    const suggestedSource = isGenericGoogleSource(currentSource) ? 'organic search' : null;
    return {
      recommendation: suggestedSource ? 'Suggested source: organic search' : 'No matching CallRail records found in lookup window.',
      suggestedSource,
      suggestionReason: suggestedSource
        ? 'No CallRail call matched, and the current source is generic Google rather than a paid-click signal.'
        : 'No call match found.',
      paidSignals: 0,
      organicSignals: 0,
      unknownSignals: 0,
      latestMatchedCall: null,
      total: 0,
    };
  }
  let paidSignals = 0;
  let organicSignals = 0;
  let unknownSignals = 0;
  evidence.forEach((call) => {
    const signal = classifyCallRailSignal(call);
    if (signal === 'paid') paidSignals += 1;
    else if (signal === 'organic') organicSignals += 1;
    else unknownSignals += 1;
  });
  const latestMatchedCall = [...evidence].sort((a, b) => Date.parse(b.startTime || '') - Date.parse(a.startTime || ''))[0] || null;
  let suggestedSource = null;
  let suggestionReason = 'No source change required from matched calls.';
  if (paidSignals > 0) {
    suggestedSource = 'paid search';
    suggestionReason = `Matched calls include ${paidSignals} paid signal${paidSignals === 1 ? '' : 's'}.`;
  }
  if (!suggestedSource && latestMatchedCall) {
    const latestSource = normaliseEvidenceString(latestMatchedCall.source);
    const latestMedium = normaliseEvidenceString(latestMatchedCall.medium);
    const latestCampaign = normaliseEvidenceString(latestMatchedCall.campaign);
    const campaignNotSet = !latestCampaign || latestCampaign === 'not set' || latestCampaign === '(not set)';
    if ((latestSource.includes('google organic') || latestSource.includes('google')) && latestMedium.includes('organic') && campaignNotSet) {
      suggestedSource = 'organic search';
      suggestionReason = 'Latest matched call indicates Google Organic traffic.';
    }
  }
  if (!suggestedSource && normaliseEvidenceString(currentSource).includes('paid') && organicSignals > 0) {
    suggestedSource = 'organic';
    suggestionReason = 'Current source is paid search, but matched calls only show organic evidence.';
  }
  return {
    recommendation: suggestedSource ? `Suggested source: ${suggestedSource}` : 'No source change suggested from this CallRail check.',
    suggestedSource,
    suggestionReason,
    paidSignals,
    organicSignals,
    unknownSignals,
    latestMatchedCall,
    total: evidence.length,
  };
}

function inferPaymentMethod(payment) {
  const metadata = parseJson(payment?.metadata, {});
  const candidates = [
    payment?.payment_method,
    payment?.payment_type,
    payment?.method,
    payment?.type,
    payment?.paymentMethod,
    payment?.PaymentMethod,
    payment?.PaymentType,
    metadata?.payment_method,
    metadata?.method,
    metadata?.paymentMethod,
  ];
  const intentId = asTrimmed(payment?.payment_intent_id || payment?.paymentIntentId);
  if (intentId.startsWith('bank_') || intentId.startsWith('banktransfer_')) candidates.push('bank_transfer');
  if (intentId.startsWith('pi_')) candidates.push('card');
  return normalisePaymentMethod(candidates.find((candidate) => asTrimmed(candidate)) || '');
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function combineDateTime(dateValue, timeValue) {
  const date = asNullableDate(dateValue);
  if (!date) return null;
  const timePart = asTrimmed(timeValue);
  if (!timePart) return date;
  const match = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return date;
  const next = new Date(date);
  next.setHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
  return next;
}

function labelPreviewField(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

function formatPreviewValue(key, value) {
  if (value === null || value === undefined || value === '') return 'blank';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value.trim().slice(0, 120);
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
  return '';
}

function buildRecordPreview(record) {
  if (!record || typeof record !== 'object') return [];
  return Object.entries(record).reduce((items, [key, value]) => {
    const formatted = formatPreviewValue(key, value);
    if (!formatted) return items;
    items.push({ label: labelPreviewField(key), value: formatted });
    return items;
  }, []);
}

function withRecordPreview(candidate, record) {
  return candidate ? { ...candidate, preview: buildRecordPreview(record) } : null;
}

function toIsoPreviewValue(value) {
  const date = asNullableDate(value);
  if (date) return date.toISOString();
  return asNullableString(value, 80);
}

function mapCallIntakeCandidate(record) {
  const callId = asTrimmed(record?.callId);
  if (!callId) return null;
  const intakeAt = record.callSubmittedAt || record.callStartedAt || record.createdAt || null;
  const handler = asNullableString(record.handler, 80);
  const durationSeconds = Number(record.durationSeconds);
  const safeRecord = {
    CallId: callId,
    CallType: asNullableString(record.callType, 40),
    Status: asNullableString(record.callStatus, 80),
    EnquiryId: asNullableString(record.enquiryId, 120),
    Handler: handler,
    IntakeAt: toIsoPreviewValue(intakeAt),
    CallSubmittedAt: toIsoPreviewValue(record.callSubmittedAt),
    CallStartedAt: toIsoPreviewValue(record.callStartedAt),
    CreatedAt: toIsoPreviewValue(record.createdAt),
    AreaOfWork: asNullableString(record.areaOfWork, 160),
    DurationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    ExternalCallId: asNullableString(record.externalCallId, 120),
    TrackingSource: asNullableString(record.trackingSource, 160),
  };
  return withRecordPreview({
    type: 'intake',
    id: `incoming-call-${callId}`,
    title: `Incoming call intake ${callId}`,
    subtitle: [
      safeRecord.IntakeAt,
      safeRecord.CallType,
      safeRecord.Status,
      safeRecord.EnquiryId ? `Enquiry ${safeRecord.EnquiryId}` : null,
      handler ? `Handler ${handler}` : null,
      Number.isFinite(durationSeconds) ? `${durationSeconds}s` : null,
    ].filter(Boolean).join(' / '),
    patch: {
      intake_type: 'call',
      call_id: callId,
      intake_at: intakeAt,
    },
  }, safeRecord);
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && asTrimmed(value)) return value;
  }
  return null;
}

function mapChainRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    source_channel: row.source_channel,
    source_value: row.source_value,
    source_detail: row.source_detail,
    intake_type: row.intake_type,
    call_id: row.call_id,
    form_submission_id: row.form_submission_id,
    email_thread_id: row.email_thread_id,
    intake_at: row.intake_at,
    enquiry_id: row.enquiry_id,
    enquiry_at: row.enquiry_at,
    enquiry_owner: row.enquiry_owner,
    pitch_id: row.pitch_id,
    pitch_at: row.pitch_at,
    pitch_status: row.pitch_status,
    pitched_by: row.pitched_by,
    deal_amount: row.deal_amount,
    instruction_ref: row.instruction_ref,
    instruction_at: row.instruction_at,
    instruction_stage: row.instruction_stage,
    instruction_owner: row.instruction_owner,
    client_id: row.client_id,
    client_type: row.client_type,
    identity_check_id: row.identity_check_id,
    identity_check_result: row.identity_check_result,
    identity_check_status: row.identity_check_status,
    identity_check_at: row.identity_check_at,
    risk_assessment_id: row.risk_assessment_id,
    risk_assessment_result: row.risk_assessment_result,
    risk_assessment_status: row.risk_assessment_status,
    risk_assessment_at: row.risk_assessment_at,
    payment_id: row.payment_id,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    payment_amount: row.payment_amount,
    payment_at: row.payment_at,
    matter_id: row.matter_id,
    matter_work_type: row.matter_work_type,
    matter_at: row.matter_at,
    responsible_solicitor: row.responsible_solicitor,
    originating_solicitor: row.originating_solicitor,
    collected_value: row.collected_value,
    collected_value_as_at: row.collected_value_as_at,
    recent_sync_at: row.recent_sync_at,
    attribution_note: row.attribution_note,
    attribution_locked_at: row.attribution_locked_at,
    attribution_locked_by: row.attribution_locked_by,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

function bindChainValue(request, column, value) {
  bindChainParam(request, column, column, value);
}

function bindChainParam(request, paramName, column, value) {
  if (TEXT_COLUMNS.has(column)) {
    request.input(paramName, sql.NVarChar, asNullableString(value, column === 'source_detail' || column === 'attribution_note' ? 500 : undefined));
    return;
  }
  if (DATE_COLUMNS.has(column)) {
    request.input(paramName, sql.DateTime2, asNullableDate(value));
    return;
  }
  if (DECIMAL_COLUMNS.has(column)) {
    request.input(paramName, sql.Decimal(18, 2), asNullableDecimal(value));
  }
}

function hasMeaningfulPatch(patch) {
  return Object.values(patch).some(hasMeaningfulValue);
}

function hasHardLink(patch) {
  return HARD_LINK_COLUMNS.some((column) => hasMeaningfulValue(patch[column]));
}

async function findExistingChainId(request, patch) {
  const linkColumns = HARD_LINK_COLUMNS.filter((column) => hasMeaningfulValue(patch[column]));
  if (linkColumns.length === 0) return null;
  linkColumns.forEach((column) => bindChainParam(request, `find_${column}`, column, patch[column]));
  const whereClause = linkColumns.map((column) => `${column} = @find_${column}`).join(' OR ');
  const result = await request.query(`
    SELECT TOP 1 id
    FROM ${TABLE_NAME}
    WHERE ${whereClause}
    ORDER BY COALESCE(updated_at, created_at) DESC
  `);
  return result.recordset[0]?.id || null;
}

function sanitisePatch(payload) {
  const patch = {};
  for (const column of CHAIN_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(payload, column)) continue;
    let value = payload[column];
    if (column === 'client_type') value = normaliseClientType(value);
    if (column === 'payment_method') value = normalisePaymentMethod(value);
    if (column === 'source_channel') {
      value = normaliseSourceChannel(value);
    }
    if (column === 'intake_type') value = normaliseEnum(value, new Set(['call', 'form', 'email', 'manual', 'unknown']));
    if (column === 'identity_check_status') value = normaliseEnum(value, new Set(['pending', 'processing', 'review', 'complete']));
    if (column === 'risk_assessment_status') value = normaliseEnum(value, new Set(['pending', 'warning', 'review', 'complete']));
    if (column === 'payment_status') value = normaliseEnum(value, new Set(['pending', 'processing', 'succeeded', 'confirmed', 'failed', 'paid']));
    patch[column] = value;
  }
  return patch;
}

function deriveIdentityStatus(eid) {
  const result = asTrimmed(firstValue(eid, ['EIDOverallResult', 'eidOverallResult'])).toLowerCase();
  const status = asTrimmed(firstValue(eid, ['EIDStatus', 'eidStatus'])).toLowerCase();
  if (status.includes('processing')) return 'processing';
  if (['passed', 'pass', 'approved', 'verified'].includes(result)) return 'complete';
  if (result.includes('review') || result.includes('refer') || result.includes('failed') || result.includes('fail') || result.includes('rejected')) return 'review';
  return eid ? 'review' : null;
}

function deriveRiskStatus(risk) {
  const result = asTrimmed(firstValue(risk, ['RiskAssessmentResult', 'riskAssessmentResult'])).toLowerCase();
  if (!result) return null;
  if (['low', 'low risk', 'pass', 'passed', 'approved', 'verified'].includes(result)) return 'complete';
  if (result.includes('medium')) return 'warning';
  return 'review';
}

function derivePaymentStatus(payment) {
  const paymentStatus = asTrimmed(firstValue(payment, ['payment_status', 'paymentStatus', 'status', 'Status'])).toLowerCase();
  const internalStatus = asTrimmed(firstValue(payment, ['internal_status', 'internalStatus', 'InternalStatus'])).toLowerCase();
  if (['succeeded', 'success', 'complete', 'completed', 'paid', 'confirmed'].includes(paymentStatus)) return paymentStatus === 'complete' || paymentStatus === 'completed' ? 'paid' : paymentStatus;
  if (internalStatus === 'completed' || internalStatus === 'paid') return 'paid';
  if (['processing', 'requires_action', 'pending'].includes(paymentStatus)) return paymentStatus === 'requires_action' ? 'processing' : paymentStatus;
  if (paymentStatus === 'failed' || internalStatus === 'failed') return 'failed';
  return payment ? 'pending' : null;
}

function mapLookupCandidate(type, record) {
  if (!record) return null;
  if (type === 'enquiry') {
    const enquiryId = asTrimmed(firstValue(record, ['acid', 'ID', 'id', 'enquiry_id']));
    const sourceValue = asNullableString(firstValue(record, ['Source', 'source', 'Ultimate_Source']), 160);
    const sourceChannel = normaliseSourceChannel(sourceValue);
    const enquiryAt = firstValue(record, ['datetime', 'Date_Created', 'date_created', 'created_at']);
    const methodOfContact = asNullableString(firstValue(record, ['Method_of_Contact', 'method_of_contact', 'MethodOfContact', 'methodOfContact', 'ContactMethod', 'contactMethod', 'MOC', 'moc']), 80);
    const intakeType = inferIntakeType(methodOfContact);
    return withRecordPreview({
      type,
      id: enquiryId,
      title: `Enquiry ${enquiryId || 'candidate'}`,
      subtitle: [firstValue(record, ['Source', 'source', 'Ultimate_Source']), methodOfContact, firstValue(record, ['poc', 'Point_of_Contact', 'point_of_contact'])].filter(Boolean).join(' / '),
      patch: {
        enquiry_id: enquiryId || null,
        enquiry_at: enquiryAt,
        enquiry_owner: asNullableString(firstValue(record, ['poc', 'Point_of_Contact', 'point_of_contact']), 160),
        source_channel: sourceChannel,
        source_value: sourceValue,
        intake_type: intakeType,
        intake_at: enquiryAt,
      },
    }, record);
  }
  if (type === 'pitch') {
    const pitchDate = firstValue(record, ['PitchedDate', 'pitchedDate', 'PitchDate', 'pitchDate', 'DatePitched', 'datePitched', 'CreatedDate', 'createdDate', 'CloseDate', 'closeDate']);
    const pitchTime = firstValue(record, ['PitchedTime', 'pitchedTime', 'PitchTime', 'pitchTime', 'TimePitched', 'timePitched', 'CreatedTime', 'createdTime', 'CloseTime', 'closeTime']);
    return withRecordPreview({
      type,
      id: asTrimmed(firstValue(record, ['DealId', 'dealId'])),
      title: `Pitch ${asTrimmed(firstValue(record, ['DealId', 'dealId'])) || 'candidate'}`,
      subtitle: [firstValue(record, ['Status', 'status']), firstValue(record, ['PitchedBy', 'pitchedBy'])].filter(Boolean).join(' / '),
      patch: {
        pitch_id: asTrimmed(firstValue(record, ['DealId', 'dealId'])) || null,
        pitch_at: combineDateTime(pitchDate, pitchTime),
        pitch_status: asNullableString(firstValue(record, ['Status', 'status']), 60),
        pitched_by: asNullableString(firstValue(record, ['PitchedBy', 'pitchedBy']), 160),
        deal_amount: asNullableDecimal(firstValue(record, ['Amount', 'amount', 'FeeAmount', 'feeAmount'])),
        instruction_ref: asNullableString(firstValue(record, ['InstructionRef', 'instructionRef']), 120),
        enquiry_id: asNullableString(firstValue(record, ['ProspectId', 'prospectId']), 120),
      },
    }, record);
  }
  if (type === 'instruction') {
    return withRecordPreview({
      type,
      id: asTrimmed(firstValue(record, ['InstructionRef', 'instructionRef'])),
      title: `Instruction ${asTrimmed(firstValue(record, ['InstructionRef', 'instructionRef'])) || 'candidate'}`,
      subtitle: [firstValue(record, ['Stage', 'stage']), firstValue(record, ['ClientType', 'client_type']), firstValue(record, ['HelixContact', 'helixContact'])].filter(Boolean).join(' / '),
      patch: {
        instruction_ref: asNullableString(firstValue(record, ['InstructionRef', 'instructionRef']), 120),
        instruction_at: combineDateTime(firstValue(record, ['SubmissionDate', 'submissionDate', 'InstructionDate', 'instructionDate']), firstValue(record, ['SubmissionTime', 'submissionTime'])),
        instruction_stage: asNullableString(firstValue(record, ['Stage', 'stage']), 80),
        instruction_owner: asNullableString(firstValue(record, ['HelixContact', 'helixContact', 'FeeEarner', 'feeEarner']), 160),
        client_id: asNullableString(firstValue(record, ['ClientId', 'clientId']), 120),
        client_type: normaliseClientType(firstValue(record, ['ClientType', 'client_type'])),
        matter_id: asNullableString(firstValue(record, ['MatterId', 'matterId']), 120),
        matter_work_type: asNullableString(firstValue(record, ['AreaOfWork', 'areaOfWork', 'PracticeArea', 'practiceArea']), 160),
      },
    }, record);
  }
  if (type === 'identity') {
    return withRecordPreview({
      type,
      id: asTrimmed(firstValue(record, ['id', 'ID', 'EIDId', 'eidId', 'InstructionRef', 'instructionRef'])),
      title: `Identity ${asTrimmed(firstValue(record, ['EIDOverallResult', 'eidOverallResult'])) || 'candidate'}`,
      subtitle: [firstValue(record, ['InstructionRef', 'instructionRef']), firstValue(record, ['EIDStatus', 'eidStatus'])].filter(Boolean).join(' / '),
      patch: {
        identity_check_id: asNullableString(firstValue(record, ['id', 'ID', 'EIDId', 'eidId', 'InstructionRef', 'instructionRef']), 120),
        identity_check_result: asNullableString(firstValue(record, ['EIDOverallResult', 'eidOverallResult']), 120),
        identity_check_status: deriveIdentityStatus(record),
        identity_check_at: firstValue(record, ['EIDCheckedDate', 'eidCheckedDate', 'CheckedDate', 'checkedDate', 'created_at', 'updated_at', 'LastUpdated']),
      },
    }, record);
  }
  if (type === 'risk') {
    return withRecordPreview({
      type,
      id: asTrimmed(firstValue(record, ['RiskAssessmentId', 'riskAssessmentId', 'id', 'ID', 'InstructionRef', 'instructionRef'])),
      title: `Risk ${asTrimmed(firstValue(record, ['RiskAssessmentResult', 'riskAssessmentResult'])) || 'candidate'}`,
      subtitle: [firstValue(record, ['InstructionRef', 'instructionRef']), firstValue(record, ['RiskAssessor', 'riskAssessor'])].filter(Boolean).join(' / '),
      patch: {
        risk_assessment_id: asNullableString(firstValue(record, ['RiskAssessmentId', 'riskAssessmentId', 'id', 'ID', 'InstructionRef', 'instructionRef']), 120),
        risk_assessment_result: asNullableString(firstValue(record, ['RiskAssessmentResult', 'riskAssessmentResult']), 120),
        risk_assessment_status: deriveRiskStatus(record),
        risk_assessment_at: firstValue(record, ['ComplianceDate', 'complianceDate', 'created_at', 'updated_at', 'LastUpdated']),
      },
    }, record);
  }
  if (type === 'payment') {
    return withRecordPreview({
      type,
      id: asTrimmed(firstValue(record, ['id', 'payment_id', 'stripe_payment_id'])),
      title: `Payment ${asTrimmed(firstValue(record, ['id', 'payment_id'])) || 'candidate'}`,
      subtitle: [firstValue(record, ['payment_status', 'status']), inferPaymentMethod(record), firstValue(record, ['amount', 'Amount'])].filter(Boolean).join(' / '),
      patch: {
        payment_id: asNullableString(firstValue(record, ['id', 'payment_id', 'stripe_payment_id']), 120),
        payment_method: inferPaymentMethod(record),
        payment_status: derivePaymentStatus(record),
        payment_amount: asNullableDecimal(firstValue(record, ['amount', 'Amount', 'value', 'Value'])),
        payment_at: firstValue(record, ['created_at', 'date', 'payment_date', 'updated_at']),
        instruction_ref: asNullableString(firstValue(record, ['instruction_ref', 'InstructionRef', 'instructionRef']), 120),
      },
    }, record);
  }
  if (type === 'matter') {
    return withRecordPreview({
      type,
      id: asTrimmed(firstValue(record, ['MatterId', 'matterId', 'id', 'ID'])),
      title: `Matter ${asTrimmed(firstValue(record, ['MatterId', 'matterId', 'id', 'ID'])) || 'candidate'}`,
      subtitle: [firstValue(record, ['AreaOfWork', 'areaOfWork', 'PracticeArea', 'practiceArea']), firstValue(record, ['ResponsibleSolicitor', 'responsible_solicitor'])].filter(Boolean).join(' / '),
      patch: {
        matter_id: asNullableString(firstValue(record, ['MatterId', 'matterId', 'id', 'ID']), 120),
        matter_work_type: asNullableString(firstValue(record, ['AreaOfWork', 'areaOfWork', 'PracticeArea', 'practiceArea', 'WorkType', 'workType']), 160),
        matter_at: firstValue(record, ['OpenDate', 'open_date', 'OpenedDate', 'opened_at', 'created_at']),
        responsible_solicitor: asNullableString(firstValue(record, ['ResponsibleSolicitor', 'responsible_solicitor', 'ResponsibleSolicitorName']), 160),
        originating_solicitor: asNullableString(firstValue(record, ['OriginatingSolicitor', 'originating_solicitor', 'OriginatingSolicitorName']), 160),
        instruction_ref: asNullableString(firstValue(record, ['InstructionRef', 'instructionRef']), 120),
      },
    }, record);
  }
  return null;
}

async function ensureTableExists(request) {
  const result = await request.query(`
    SELECT 1 AS found
    FROM sys.tables
    WHERE name = 'marketing_attribution_chain'
      AND schema_id = SCHEMA_ID('dbo')
  `);
  return result.recordset.length > 0;
}

async function selectChainById(request, id) {
  const result = await request
    .input('selectId', sql.BigInt, id)
    .query(`SELECT TOP 1 * FROM ${TABLE_NAME} WHERE id = @selectId`);
  return mapChainRow(result.recordset[0]);
}

async function runCandidateQuery(query, type) {
  const trimmed = asTrimmed(query);
  const like = `%${trimmed}%`;
  return withRequest(getInstructionsConn(), async (request) => {
    request.input('qExact', sql.NVarChar, trimmed);
    request.input('qLike', sql.NVarChar, like);
    if (type === 'enquiry') {
      return request.query(`
        SELECT TOP 8 *
        FROM dbo.enquiries
        WHERE CAST(id AS NVARCHAR(120)) = @qExact
           OR CAST(acid AS NVARCHAR(120)) = @qExact
          ORDER BY datetime DESC
      `);
    }
    if (type === 'pitch') {
      return request.query(`
        SELECT TOP 8 *
        FROM dbo.Deals
        WHERE CAST(DealId AS NVARCHAR(120)) = @qExact
           OR CAST(ProspectId AS NVARCHAR(120)) = @qExact
           OR InstructionRef = @qExact
           OR CAST(Passcode AS NVARCHAR(120)) = @qExact
        ORDER BY DealId DESC
      `);
    }
    if (type === 'instruction') {
      return request.query(`
        SELECT TOP 8 *
        FROM dbo.Instructions
        WHERE InstructionRef = @qExact
           OR CAST(ClientId AS NVARCHAR(120)) = @qExact
           OR CAST(MatterId AS NVARCHAR(120)) = @qExact
        ORDER BY LastUpdated DESC
      `);
    }
    if (type === 'payment') {
      return request.query(`
        SELECT TOP 8 *
        FROM dbo.Payments
        WHERE id = @qExact
           OR payment_intent_id = @qExact
           OR instruction_ref = @qExact
        ORDER BY created_at DESC
      `);
    }
    if (type === 'risk') {
      return request.query(`
        SELECT TOP 8 *
        FROM dbo.RiskAssessment
        WHERE InstructionRef = @qExact
           OR MatterId = @qExact
        ORDER BY ComplianceDate DESC
      `);
    }
    if (type === 'identity') {
      return request.query(`
        SELECT TOP 8 *
        FROM dbo.IDVerifications
        WHERE InstructionRef = @qExact
            OR CAST(InternalId AS NVARCHAR(120)) = @qExact
            OR EIDCheckId = @qExact
          ORDER BY EIDCheckedDate DESC, InternalId DESC
      `);
    }
    return request.query(`
      SELECT TOP 8 *
      FROM dbo.Matters
      WHERE InstructionRef = @qExact
         OR CAST(MatterId AS NVARCHAR(120)) = @qExact
      ORDER BY OpenDate DESC
    `);
  });
}

async function queryCandidates(query) {
  const trimmed = asTrimmed(query);
  if (!trimmed) return { candidates: [], warnings: [] };

  const types = ['enquiry', 'pitch', 'instruction', 'payment', 'risk', 'identity', 'matter'];
  const batches = await Promise.allSettled(types.map((type) => runCandidateQuery(trimmed, type)));
  const candidates = [];
  const warnings = [];
  batches.forEach((batch, index) => {
    const type = types[index];
    if (batch.status !== 'fulfilled') {
      warnings.push(`${type}: ${batch.reason?.message || 'lookup failed'}`);
      return;
    }
    const rows = Array.isArray(batch.value.recordset) ? batch.value.recordset : [];
    rows.forEach((row) => {
      const candidate = mapLookupCandidate(type, row);
      if (candidate?.id) candidates.push(candidate);
      if (type === 'enquiry' && candidate?.patch?.source_value) {
        candidates.push({
          type: 'source',
          id: `source-${candidate.id}`,
          title: `${candidate.patch.source_channel || 'Source'} evidence`,
          subtitle: String(candidate.patch.source_value || ''),
          patch: {
            source_channel: candidate.patch.source_channel,
            source_value: candidate.patch.source_value,
            source_detail: `From enquiry ${candidate.id}`,
          },
        });
      }
    });
  });
  return { candidates, warnings };
}

async function queryRecentEnquiryCandidates() {
  const result = await withRequest(getInstructionsConn(), async (request) => request.query(`
    SELECT TOP 20 *
    FROM dbo.enquiries
    ORDER BY datetime DESC
  `));
  return (Array.isArray(result.recordset) ? result.recordset : [])
    .map((row) => mapLookupCandidate('enquiry', row))
    .filter((candidate) => candidate?.id);
}

async function queryPitchCandidates(query = '') {
  const trimmed = asTrimmed(query);
  return withRequest(getInstructionsConn(), async (request) => {
    request.input('qExact', sql.NVarChar, trimmed);
    request.input('qLike', sql.NVarChar, `%${trimmed}%`);
    const whereClause = trimmed
      ? `WHERE CAST(DealId AS NVARCHAR(120)) = @qExact
           OR CAST(ProspectId AS NVARCHAR(120)) = @qExact
           OR InstructionRef = @qExact
           OR CAST(Passcode AS NVARCHAR(120)) = @qExact
           OR Status LIKE @qLike
           OR PitchedBy LIKE @qLike`
      : '';
    const result = await request.query(`
      SELECT TOP 20 *
      FROM dbo.Deals
      ${whereClause}
      ORDER BY DealId DESC
    `);
    return (Array.isArray(result.recordset) ? result.recordset : [])
      .map((row) => mapLookupCandidate('pitch', row))
      .filter((candidate) => candidate?.id);
  });
}

async function queryRecentCallIntakeCandidates({ enquiryId = '', limit = 12 } = {}) {
  const trimmedEnquiryId = asTrimmed(enquiryId);
  const safeLimit = Math.max(1, Math.min(25, Number(limit) || 12));
  return withRequest(getInstructionsConn(), async (request) => {
    request.input('limit', sql.Int, safeLimit);
    request.input('enquiryId', sql.NVarChar, trimmedEnquiryId);
    const result = await request.query(`
      SELECT TOP (@limit)
        ic.id AS callId,
        ic.enquiry_id AS enquiryId,
        ic.status AS callStatus,
        ic.call_type AS callType,
        ic.call_started_at AS callStartedAt,
        ic.call_submitted_at AS callSubmittedAt,
        ic.created_at AS createdAt,
        COALESCE(NULLIF(LTRIM(RTRIM(ic.taken_by_resolved)), ''), NULLIF(LTRIM(RTRIM(ic.taken_by)), '')) AS handler,
        ic.area_of_work AS areaOfWork,
        ic.call_duration_seconds AS durationSeconds,
        ic.external_call_id AS externalCallId,
        ic.tracking_source AS trackingSource
      FROM dbo.incoming_calls ic
      WHERE (@enquiryId = '' OR CAST(ic.enquiry_id AS NVARCHAR(120)) = @enquiryId OR ic.enquiry_id IS NULL)
        AND (
          ic.call_type IS NULL
          OR LOWER(LTRIM(RTRIM(ic.call_type))) NOT IN ('internal', 'outbound', 'outgoing')
        )
      ORDER BY
        CASE
          WHEN @enquiryId <> '' AND CAST(ic.enquiry_id AS NVARCHAR(120)) = @enquiryId THEN 0
          WHEN ic.enquiry_id IS NULL THEN 1
          ELSE 2
        END,
        COALESCE(ic.call_submitted_at, ic.call_started_at, ic.created_at) DESC,
        ic.id DESC
    `);
    return (Array.isArray(result.recordset) ? result.recordset : [])
      .map(mapCallIntakeCandidate)
      .filter((candidate) => candidate?.id);
  }, 2);
}

async function queryPitchAssist({ enquiryId, instructionRef }) {
  const trimmedEnquiryId = asTrimmed(enquiryId);
  const trimmedInstructionRef = asTrimmed(instructionRef);
  if (!trimmedEnquiryId && !trimmedInstructionRef) return [];
  return withRequest(getInstructionsConn(), async (request) => {
    request.input('enquiryId', sql.NVarChar, trimmedEnquiryId);
    request.input('instructionRef', sql.NVarChar, trimmedInstructionRef);
    const result = await request.query(`
      SELECT TOP 8 *
      FROM dbo.Deals
      WHERE (@enquiryId <> '' AND CAST(ProspectId AS NVARCHAR(120)) = @enquiryId)
         OR (@instructionRef <> '' AND InstructionRef = @instructionRef)
      ORDER BY DealId DESC
    `);
    return (Array.isArray(result.recordset) ? result.recordset : [])
      .map((row) => mapLookupCandidate('pitch', row))
      .filter((candidate) => candidate?.id);
  });
}

async function findEnquiryPhone(enquiryId) {
  const trimmed = asTrimmed(enquiryId);
  if (!trimmed) return null;
  return withRequest(getInstructionsConn(), async (request) => {
    const columnResult = await request.query(`
      SELECT name
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.enquiries')
        AND name IN ('Phone_Number', 'phone_number', 'phone', 'Phone', 'mobile', 'Mobile', 'telephone', 'Telephone')
    `);
    const phoneColumn = columnResult.recordset[0]?.name;
    if (!phoneColumn) return null;
    request.input('enquiryId', sql.NVarChar, trimmed);
    const result = await request.query(`
      SELECT TOP 1 ${phoneColumn} AS phone_value
      FROM dbo.enquiries
      WHERE CAST(id AS NVARCHAR(120)) = @enquiryId
         OR CAST(acid AS NVARCHAR(120)) = @enquiryId
      ORDER BY datetime DESC
    `);
    return result.recordset[0]?.phone_value || null;
  });
}

async function pressureCheckCallRail(phoneValue, currentSource = '') {
  const phoneDigits = getSearchablePhone(phoneValue);
  if (!phoneDigits) return { checked: false, reason: 'No phone number available for this enquiry.' };
  const token = await getCallRailToken();
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const fields = [
    'id', 'start_time', 'duration', 'direction', 'answered', 'source', 'medium', 'campaign', 'keywords',
    'landing_page_url', 'source_name', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'referring_url', 'last_requested_url', 'milestones', 'timeline_url', 'gclid', 'fbclid', 'msclkid',
  ].join(',');
  const params = new URLSearchParams({ search: phoneDigits, start_date: startDate, end_date: endDate, per_page: '10', fields });
  const response = await fetch(`https://api.callrail.com/v3/a/${CALLRAIL_ACCOUNT_ID}/calls.json?${params.toString()}`, {
    headers: { Authorization: `Token token="${token}"`, Accept: 'application/json' },
  });
  if (!response.ok) return { checked: false, reason: `CallRail returned ${response.status}` };
  const payload = await response.json();
  const calls = Array.isArray(payload.calls) ? payload.calls : [];
  const evidence = calls.slice(0, 5).map((call) => {
    const source = pickString(call.source, call.utm_source, call.source_name, call.medium, pickMilestoneField(call.milestones, 'source')) || 'Unknown';
    const medium = pickString(call.medium, call.utm_medium, pickMilestoneField(call.milestones, 'medium'));
    const campaign = pickString(call.campaign, call.utm_campaign, pickMilestoneField(call.milestones, 'campaign'));
    const keywords = pickString(call.keywords, call.utm_term, pickMilestoneField(call.milestones, 'keywords'));
    const sourceName = pickString(call.source_name);
    const utmSource = pickString(call.utm_source);
    const utmMedium = pickString(call.utm_medium);
    const utmCampaign = pickString(call.utm_campaign);
    const utmTerm = pickString(call.utm_term);
    const utmContent = pickString(call.utm_content);
    const landingPageUrl = pickString(call.landing_page_url, pickMilestoneField(call.milestones, 'landing'), call.last_requested_url, call.referring_url);
    const landingHost = (() => {
      try { return landingPageUrl ? new URL(landingPageUrl).host : ''; } catch (_) { return ''; }
    })();
    const hasPaidClickId = Boolean(call.gclid || call.msclkid || call.fbclid);
    return {
      id: asNullableString(call.id, 120),
      startTime: asNullableString(call.start_time, 80),
      source,
      medium,
      campaign,
      keywords,
      sourceName,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      direction: asNullableString(call.direction, 30),
      landingHost: asNullableString(landingHost, 200),
      landingPageUrl: asNullableString(landingPageUrl, 500),
      referringUrl: asNullableString(call.referring_url, 500),
      lastRequestedUrl: asNullableString(call.last_requested_url, 500),
      timelineUrl: asNullableString(call.timeline_url, 500),
      gclid: asNullableString(call.gclid, 160),
      fbclid: asNullableString(call.fbclid, 160),
      msclkid: asNullableString(call.msclkid, 160),
      hasPaidClickId,
      channel: hasPaidClickId || /paid|ppc|cpc/i.test(`${source} ${medium}`) ? 'PPC' : normaliseSourceChannel(source),
      answered: Boolean(call.answered),
      duration: Number.isFinite(Number(call.duration)) ? Number(call.duration) : null,
    };
  });
  const decision = buildCallRailDecision(evidence, currentSource);
  const recommended = decision.suggestedSource
    ? { channel: normaliseSourceChannel(decision.suggestedSource), source: decision.suggestedSource }
    : evidence.find((item) => item.channel && item.channel !== 'Unknown') || evidence[0] || null;
  return {
    checked: true,
    count: calls.length,
    recommendedPatch: recommended ? { source_channel: recommended.channel, source_value: recommended.source, source_detail: 'CallRail pressure check' } : null,
    decision,
    evidence,
  };
}

router.get('/recent', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.Recent';
  try {
    const result = await withRequest(getInstructionsConn(), async (request) => {
      const tableExists = await ensureTableExists(request);
      if (!tableExists) return { tableReady: false, rows: [] };
      const rows = await request.query(`
        SELECT TOP 20 *
        FROM ${TABLE_NAME}
        ORDER BY COALESCE(updated_at, created_at) DESC
      `);
      return { tableReady: true, rows: rows.recordset.map(mapChainRow) };
    });
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.Recent.Completed', { operation, triggeredBy: resolveRequestActor(req), rowCount: result.rows.length, tableReady: result.tableReady, durationMs });
    trackMetric('MarketingAttributionChain.Recent.Duration', durationMs, { operation });
    res.json({ success: true, tableReady: result.tableReady, rows: result.rows });
  } catch (error) {
    trackException(error, { operation, phase: 'recent' });
    trackEvent('MarketingAttributionChain.Recent.Failed', { operation, error: error.message });
    res.status(500).json({ error: 'Failed to load attribution chains', details: error.message });
  }
});

router.get('/lookup', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.Lookup';
  const query = asTrimmed(req.query.q);
  try {
    const result = await queryCandidates(query);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.Lookup.Completed', { operation, triggeredBy: resolveRequestActor(req), candidateCount: result.candidates.length, warningCount: result.warnings.length, durationMs });
    trackMetric('MarketingAttributionChain.Lookup.Duration', durationMs, { operation });
    res.json({ success: true, candidates: result.candidates, warnings: result.warnings });
  } catch (error) {
    trackException(error, { operation, phase: 'lookup' });
    trackEvent('MarketingAttributionChain.Lookup.Failed', { operation, error: error.message });
    res.status(500).json({ error: 'Failed to search attribution candidates', details: error.message });
  }
});

router.get('/recent-enquiries', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.RecentEnquiries';
  const actor = resolveRequestActor(req);
  try {
    const candidates = await queryRecentEnquiryCandidates();
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.RecentEnquiries.Completed', { operation, triggeredBy: actor, candidateCount: candidates.length, durationMs });
    trackMetric('MarketingAttributionChain.RecentEnquiries.Duration', durationMs, { operation });
    res.json({ success: true, candidates });
  } catch (error) {
    trackException(error, { operation, phase: 'recent-enquiries', actor });
    trackEvent('MarketingAttributionChain.RecentEnquiries.Failed', { operation, triggeredBy: actor, error: error.message });
    res.status(500).json({ error: 'Failed to load recent enquiries', details: error.message });
  }
});

router.get('/recent-pitches', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.RecentPitches';
  const actor = resolveRequestActor(req);
  try {
    const candidates = await queryPitchCandidates(req.query.q);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.RecentPitches.Completed', { operation, triggeredBy: actor, candidateCount: candidates.length, hasQuery: Boolean(asTrimmed(req.query.q)), durationMs });
    trackMetric('MarketingAttributionChain.RecentPitches.Duration', durationMs, { operation });
    res.json({ success: true, candidates });
  } catch (error) {
    trackException(error, { operation, phase: 'recent-pitches', actor });
    trackEvent('MarketingAttributionChain.RecentPitches.Failed', { operation, triggeredBy: actor, error: error.message });
    res.status(500).json({ error: 'Failed to load pitch candidates', details: error.message });
  }
});

router.get('/recent-call-intakes', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.CallIntakes';
  const actor = resolveRequestActor(req);
  const enquiryId = req.query.enquiry_id || req.query.enquiryId || '';
  const limit = Number(req.query.limit) || 12;
  trackEvent('MarketingAttributionChain.CallIntakes.Started', { operation, triggeredBy: actor, hasEnquiryId: Boolean(asTrimmed(enquiryId)), limit });
  try {
    const candidates = await queryRecentCallIntakeCandidates({ enquiryId, limit });
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.CallIntakes.Completed', { operation, triggeredBy: actor, candidateCount: candidates.length, durationMs });
    trackMetric('MarketingAttributionChain.CallIntakes.Duration', durationMs, { operation });
    res.json({ success: true, source: 'incoming_calls', candidates });
  } catch (error) {
    trackException(error, { operation, phase: 'recent-call-intakes', actor });
    trackEvent('MarketingAttributionChain.CallIntakes.Failed', { operation, triggeredBy: actor, error: error.message });
    res.status(500).json({ error: 'Failed to load incoming call intake candidates', details: error.message });
  }
});

router.post('/pitch-check', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.PitchCheck';
  const actor = resolveRequestActor(req);
  try {
    const candidates = await queryPitchAssist({ enquiryId: req.body?.enquiry_id || req.body?.enquiryId, instructionRef: req.body?.instruction_ref || req.body?.instructionRef });
    const durationMs = Date.now() - startedAt;
    const autoCandidate = candidates.length === 1 ? candidates[0] : null;
    trackEvent('MarketingAttributionChain.PitchCheck.Completed', { operation, triggeredBy: actor, candidateCount: candidates.length, autoResolved: Boolean(autoCandidate), durationMs });
    trackMetric('MarketingAttributionChain.PitchCheck.Duration', durationMs, { operation });
    res.json({ success: true, count: candidates.length, candidates, autoCandidate, autoPatch: autoCandidate?.patch || null });
  } catch (error) {
    trackException(error, { operation, phase: 'pitch-check', actor });
    trackEvent('MarketingAttributionChain.PitchCheck.Failed', { operation, triggeredBy: actor, error: error.message });
    res.status(500).json({ error: 'Failed to check pitch attribution', details: error.message });
  }
});

router.post('/source-check', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.SourceCheck';
  const actor = resolveRequestActor(req);
  try {
    const enquiryId = asTrimmed(req.body?.enquiry_id || req.body?.enquiryId);
    if (!enquiryId) return res.status(400).json({ error: 'enquiry_id is required for source pressure check' });
    const phone = await findEnquiryPhone(enquiryId);
    const result = await pressureCheckCallRail(phone, req.body?.source_value || req.body?.sourceValue || '');
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.SourceCheck.Completed', { operation, triggeredBy: actor, enquiryId, checked: result.checked, count: result.count || 0, durationMs });
    trackMetric('MarketingAttributionChain.SourceCheck.Duration', durationMs, { operation });
    res.json({ success: true, ...result });
  } catch (error) {
    trackException(error, { operation, phase: 'source-check', actor });
    trackEvent('MarketingAttributionChain.SourceCheck.Failed', { operation, triggeredBy: actor, error: error.message });
    res.status(500).json({ error: 'Failed to pressure check source attribution', details: error.message });
  }
});

router.post('/', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.Save';
  const actor = resolveRequestActor(req);
  try {
    const payload = req.body || {};
    const id = payload.id ? Number(payload.id) : null;
    const patch = sanitisePatch(payload.patch || payload);
    const columns = Object.keys(patch);
    if (columns.length === 0) return res.status(400).json({ error: 'No supported fields supplied' });
    if (!id && !hasMeaningfulPatch(patch)) return res.status(400).json({ error: 'At least one value is required before saving.' });

    const row = await withRequest(getInstructionsConn(), async (request) => {
      const tableExists = await ensureTableExists(request);
      if (!tableExists) {
        const err = new Error('marketing_attribution_chain table is missing. Run tools/db/migrate-marketing-attribution-chain.sql first.');
        err.status = 409;
        throw err;
      }

      request.input('actor', sql.NVarChar, actor);
      columns.forEach((column) => bindChainValue(request, column, patch[column]));

      const targetId = id || (hasHardLink(patch) ? await findExistingChainId(request, patch) : null);

      if (targetId) {
        request.input('id', sql.BigInt, targetId);
        const setClause = columns.map((column) => `${column} = @${column}`).join(', ');
        const updateColumns = [setClause]
          .concat(asTrimmed(patch.matter_id) && !columns.includes('recent_sync_at') ? ['recent_sync_at = SYSUTCDATETIME()'] : [])
          .concat(['updated_by = @actor', 'updated_at = SYSUTCDATETIME()']);
        const updateResult = await request.query(`
          UPDATE ${TABLE_NAME}
          SET ${updateColumns.join(',\n              ')}
          WHERE id = @id
            AND attribution_locked_at IS NULL
        `);
        const updatedCount = updateResult.rowsAffected?.[0] || 0;
        if (updatedCount === 0) {
          const existing = await selectChainById(request, targetId);
          const err = new Error(existing?.attribution_locked_at ? 'Attribution row is locked and cannot be edited.' : 'Attribution row was not found.');
          err.status = existing?.attribution_locked_at ? 423 : 404;
          throw err;
        }
        return selectChainById(request, targetId);
      }

      const shouldStampCollectedSync = asTrimmed(patch.matter_id) && !columns.includes('recent_sync_at');
      const insertColumns = columns.concat(shouldStampCollectedSync ? ['recent_sync_at'] : []).concat(['created_by', 'updated_by', 'updated_at']);
      const insertValues = columns.map((column) => `@${column}`).concat(shouldStampCollectedSync ? ['SYSUTCDATETIME()'] : []).concat(['@actor', '@actor', 'SYSUTCDATETIME()']);
      const insertResult = await request.query(`
        INSERT INTO ${TABLE_NAME} (${insertColumns.join(', ')})
        OUTPUT INSERTED.id
        VALUES (${insertValues.join(', ')})
      `);
      return selectChainById(request, insertResult.recordset[0].id);
    });

    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.Save.Completed', { operation, triggeredBy: actor, id: row?.id || '', fieldCount: columns.length, durationMs });
    trackMetric('MarketingAttributionChain.Save.Duration', durationMs, { operation });
    res.json({ success: true, row });
  } catch (error) {
    const status = error.status || 500;
    trackException(error, { operation, phase: 'save', actor });
    trackEvent('MarketingAttributionChain.Save.Failed', { operation, triggeredBy: actor, error: error.message });
    res.status(status).json({ error: status === 409 ? error.message : 'Failed to save attribution chain', details: error.message });
  }
});

router.post('/:id/lock', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'MarketingAttributionChain.Lock';
  const actor = resolveRequestActor(req);
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid chain id' });

    const row = await withRequest(getInstructionsConn(), async (request) => {
      const tableExists = await ensureTableExists(request);
      if (!tableExists) {
        const err = new Error('marketing_attribution_chain table is missing. Run tools/db/migrate-marketing-attribution-chain.sql first.');
        err.status = 409;
        throw err;
      }
      request.input('id', sql.BigInt, id);
      request.input('actor', sql.NVarChar, actor);
      await request.query(`
        UPDATE ${TABLE_NAME}
        SET attribution_locked_at = SYSUTCDATETIME(),
            attribution_locked_by = @actor,
            updated_by = @actor,
            updated_at = SYSUTCDATETIME(),
          recent_sync_at = CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(matter_id, ''))), '') IS NOT NULL THEN SYSUTCDATETIME() ELSE recent_sync_at END
        WHERE id = @id
      `);
      return selectChainById(request, id);
    });

    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingAttributionChain.Lock.Completed', { operation, triggeredBy: actor, id, durationMs });
    trackMetric('MarketingAttributionChain.Lock.Duration', durationMs, { operation });
    res.json({ success: true, row });
  } catch (error) {
    const status = error.status || 500;
    trackException(error, { operation, phase: 'lock', actor });
    trackEvent('MarketingAttributionChain.Lock.Failed', { operation, triggeredBy: actor, error: error.message });
    res.status(status).json({ error: status === 409 ? error.message : 'Failed to lock attribution chain', details: error.message });
  }
});

module.exports = router;
