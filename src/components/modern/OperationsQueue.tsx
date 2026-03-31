import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FiCheck, FiCheckCircle, FiAlertCircle, FiBriefcase, FiCalendar, FiArrowUpRight, FiExternalLink, FiSearch, FiChevronDown, FiArrowRight, FiCreditCard, FiPhone, FiClock } from 'react-icons/fi';
import { SiAsana, SiStripe } from 'react-icons/si';
import { colours } from '../../app/styles/colours';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BankTransferItem {
  id: string;
  payment_id: string;
  instruction_ref: string;
  amount: number;
  currency: string;
  payment_status: string;
  internal_status: string;
  metadata: string;
  service_description: string;
  area_of_work: string;
  created_at: string;
  FirstName: string | null;
  LastName: string | null;
  HelixContact: string | null;
}

interface CclDateItem {
  matter_id: string;
  display_number: string;
  client_name: string | null;
  description: string | null;
  practice_area: string | null;
  fee_earner: string | null;
  open_date: string | null;
}

interface TransactionItem {
  transaction_id: string;
  matter_ref: string;
  matter_description: string | null;
  fe: string | null;
  amount: number;
  transaction_date: string | null;
  from_client: boolean;
  money_sender: string | null;
  type: string | null;
  status: string | null;
}

interface AsanaAccountTask {
  gid: string;
  name: string;
  matterRef: string | null;
  section: string;
  sectionGid: string;
  assignee: string | null;
  dueOn: string | null;
  createdAt: string | null;
  url: string | null;
}

interface AsanaSectionSummary {
  name: string;
  gid: string;
  count: number;
}

interface TransactionV2Item {
  id: number;
  source_type: string;
  matter_ref: string;
  matter_description: string | null;
  fee_earner: string | null;
  amount: number;
  transaction_date: string | null;
  transaction_time: string | null;
  from_client: boolean;
  money_sender: string | null;
  transaction_type: string | null;
  lifecycle_status: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  matter_id: number | null;
  instruction_ref: string | null;
  vat_amount: number | null;
  card_id: string | null;
  acid: string | null;
  collaborators: string | null;
  debit_account: string | null;
  payee_name: string | null;
  payment_reference: string | null;
  sort_code: string | null;
  account_number: string | null;
  bank_verified: boolean | null;
  invoice_number: string | null;
  client_id: number | null;
  client_first_name: string | null;
  client_last_name: string | null;
  client_email: string | null;
  company_name: string | null;
  action_notes: string | null;
  external_task_id: string | null;
  external_task_url: string | null;
}

interface RecentApproval {
  id: string;
  instruction_ref: string;
  amount: number;
  currency: string;
  service_description: string;
  area_of_work: string;
  ops_approved_by: string;
  ops_approved_at: string;
  FirstName: string | null;
  LastName: string | null;
}

interface QueueStatusSegment {
  key: string;
  label: string;
}

const TXN_V1_STATUS_SEGMENTS: QueueStatusSegment[] = [
  { key: 'requested', label: 'Pending' },
  { key: 'transfer', label: 'Approved' },
  { key: 'leave_in_client', label: 'Left in client' },
  { key: 'processed', label: 'Processed' },
];

const TXN_V2_STATUS_SEGMENTS: QueueStatusSegment[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'left_in_client', label: 'Left in client' },
  { key: 'rejected', label: 'Rejected' },
];

const DEBT_STATUS_SEGMENTS: QueueStatusSegment[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'rejected', label: 'Review' },
  { key: 'converted_to_request', label: 'Queued' },
  { key: 'approved', label: 'Approved' },
  { key: 'left_in_client', label: 'Left in client' },
  { key: 'transferred', label: 'Settled' },
];

interface StripeRecentItem {
  id: string;
  paymentIntentId: string;
  amount: number | null;
  currency: string;
  paymentStatus: string;
  internalStatus: string;
  instructionRef: string | null;
  serviceDescription: string | null;
  areaOfWork: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  helixContact: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
}

interface DubberCallItem {
  recording_id: string;
  from_party: string | null;
  from_label: string | null;
  to_party: string | null;
  to_label: string | null;
  call_type: string | null;
  duration_seconds: number | null;
  start_time_utc: string;
  document_sentiment_score: number | null;
  ai_document_sentiment: string | null;
  channel: string | null;
  status: string | null;
  matched_team_initials: string | null;
  matched_team_email: string | null;
  match_strategy: string | null;
  document_emotion_json: string | null;
  is_internal?: boolean;
}

interface OperationsLookupResult {
  kind: 'payment' | 'transaction-v2' | 'debt';
  id: string;
  title: string;
  subtitle: string | null;
  amountText: string | null;
  statusText: string | null;
  statusColour: string;
  sectionLabel: string;
  matchText: string | null;
}

interface OperationsLookupHighlight {
  kind: 'payment' | 'transaction-v2' | 'debt';
  id: string;
}

interface OperationsQueueProps {
  isDarkMode: boolean;
  userInitials: string;
  showToast: (message: string, type: 'success' | 'warning' | 'error' | 'info', details?: string) => void;
  demoModeEnabled?: boolean;
  /** Admin users see all sections; non-admins see only their own transactions */
  isAdmin?: boolean;
  /** V2 feature gate — when true, shows V2 transactions toggle (LZ+AC+local only) */
  isV2User?: boolean;
  /** Dev owner (LZ) — sees all data (all FEs, all debts) */
  isDevOwner?: boolean;
  /** Home dev toggle for the temporary CCL dates box */
  showHomeOpsCclDates?: boolean;
}

// ─── Demo data ──────────────────────────────────────────────────────────────

const DEMO_BANK_ITEMS: BankTransferItem[] = [
  {
    id: 'demo-bank-transfer-review-1',
    payment_id: 'demo-payment-1',
    instruction_ref: 'HLX-DEMO-3311402',
    amount: 2400,
    currency: 'GBP',
    payment_status: 'confirmed',
    internal_status: 'paid',
    metadata: JSON.stringify({ source: 'demo-mode', method: 'Bank Transfer' }),
    service_description: 'Demo bank transfer review · Shareholder dispute initial review',
    area_of_work: 'commercial',
    created_at: '2026-03-23T09:12:00.000Z',
    FirstName: 'Demo',
    LastName: 'Client A',
    HelixContact: 'LZ',
  },
  {
    id: 'demo-bank-transfer-review-2',
    payment_id: 'demo-payment-2',
    instruction_ref: 'HLX-DEMO-4428801',
    amount: 1800,
    currency: 'GBP',
    payment_status: 'confirmed',
    internal_status: 'paid',
    metadata: JSON.stringify({ source: 'demo-mode', method: 'Bank Transfer' }),
    service_description: 'Demo bank transfer review · Property dispute pre-action advice',
    area_of_work: 'property',
    created_at: '2026-03-23T11:36:00.000Z',
    FirstName: 'Demo',
    LastName: 'Client B',
    HelixContact: 'AC',
  },
];

const DEMO_CCL_ITEMS: CclDateItem[] = [
  {
    matter_id: 'demo-ccl-matter-1',
    display_number: 'HLX-DEMO-5501',
    client_name: 'Demo Client D',
    description: 'Demo CCL · Boundary dispute advice',
    practice_area: 'Property',
    fee_earner: 'AC',
    open_date: '2026-03-18T00:00:00.000Z',
  },
];

const DEMO_TXN_ITEMS: TransactionItem[] = [
  {
    transaction_id: 'demo-txn-1',
    matter_ref: 'HLX-DEMO-7702',
    matter_description: 'Demo transaction · Construction mediation',
    fe: 'LZ',
    amount: 5600,
    transaction_date: '2026-03-22T00:00:00.000Z',
    from_client: true,
    money_sender: null,
    type: 'Receipt',
    status: 'requested',
  },
];

const DEMO_RECENT_ITEMS: RecentApproval[] = [
  {
    id: 'demo-bank-transfer-review-3',
    instruction_ref: 'HLX-DEMO-2299107',
    amount: 3200,
    currency: 'GBP',
    service_description: 'Demo bank transfer review · Construction adjudication response',
    area_of_work: 'construction',
    ops_approved_by: 'OPS',
    ops_approved_at: '2026-03-23T08:20:00.000Z',
    FirstName: 'Demo',
    LastName: 'Client C',
  },
];

const DEMO_V2_ITEMS: TransactionV2Item[] = [
  // pending hub_intake — awaiting action
  {
    id: 90001, source_type: 'hub_intake', matter_ref: 'HLX-DEMO-8801', matter_description: 'Demo · Shareholder agreement dispute',
    fee_earner: 'LZ', amount: 3500, transaction_date: '2026-03-25T00:00:00.000Z', transaction_time: '09:15',
    from_client: true, money_sender: null, transaction_type: 'Receipt', lifecycle_status: 'pending',
    created_by: 'LZ', created_at: '2026-03-25T09:15:00.000Z', updated_at: null, approved_by: null, approved_at: null,
    notes: 'Initial retainer — client paid via bank transfer', matter_id: null, instruction_ref: 'HLX-DEMO-8801',
    vat_amount: 700, card_id: null, acid: null, collaborators: null, debit_account: null,
    payee_name: null, payment_reference: 'DEMO-PAY-001', sort_code: null, account_number: null,
    bank_verified: null, invoice_number: 'INV-DEMO-001', client_id: null,
    client_first_name: 'Demo', client_last_name: 'Alpha', client_email: null, company_name: null,
    action_notes: null, external_task_id: null, external_task_url: null,
  },
  // approved hub_intake — already actioned
  {
    id: 90002, source_type: 'hub_intake', matter_ref: 'HLX-DEMO-8802', matter_description: 'Demo · Construction adjudication prep',
    fee_earner: 'AC', amount: 8750, transaction_date: '2026-03-24T00:00:00.000Z', transaction_time: '14:30',
    from_client: false, money_sender: 'Insurer Ltd', transaction_type: 'Receipt', lifecycle_status: 'approved',
    created_by: 'AC', created_at: '2026-03-24T14:30:00.000Z', updated_at: '2026-03-24T15:00:00.000Z',
    approved_by: 'LZ', approved_at: '2026-03-24T15:00:00.000Z',
    notes: 'Third-party insurer payment', matter_id: null, instruction_ref: 'HLX-DEMO-8802',
    vat_amount: 1750, card_id: null, acid: null, collaborators: null, debit_account: null,
    payee_name: null, payment_reference: 'INS-2026-0042', sort_code: null, account_number: null,
    bank_verified: null, invoice_number: null, client_id: null,
    client_first_name: 'Demo', client_last_name: 'Bravo', client_email: null, company_name: 'Insurer Ltd',
    action_notes: null, external_task_id: null, external_task_url: null,
  },
  // rejected hub_intake
  {
    id: 90003, source_type: 'hub_intake', matter_ref: 'HLX-DEMO-8803', matter_description: 'Demo · Employment tribunal response',
    fee_earner: 'JW', amount: 1200, transaction_date: '2026-03-23T00:00:00.000Z', transaction_time: '11:00',
    from_client: true, money_sender: null, transaction_type: 'Receipt', lifecycle_status: 'rejected',
    created_by: 'JW', created_at: '2026-03-23T11:00:00.000Z', updated_at: '2026-03-23T12:15:00.000Z',
    approved_by: 'LZ', approved_at: '2026-03-23T12:15:00.000Z',
    notes: 'Duplicate entry — already captured in V1', matter_id: null, instruction_ref: 'HLX-DEMO-8803',
    vat_amount: 240, card_id: null, acid: null, collaborators: null, debit_account: null,
    payee_name: null, payment_reference: null, sort_code: null, account_number: null,
    bank_verified: null, invoice_number: null, client_id: null,
    client_first_name: 'Demo', client_last_name: 'Charlie', client_email: null, company_name: null,
    action_notes: 'Rejected — duplicate of V1-7702', external_task_id: null, external_task_url: null,
  },
  // left_in_client hub_intake
  {
    id: 90004, source_type: 'hub_intake', matter_ref: 'HLX-DEMO-8804', matter_description: 'Demo · Property boundary dispute',
    fee_earner: 'AC', amount: 4100, transaction_date: '2026-03-24T00:00:00.000Z', transaction_time: '16:45',
    from_client: true, money_sender: null, transaction_type: 'Receipt', lifecycle_status: 'left_in_client',
    created_by: 'AC', created_at: '2026-03-24T16:45:00.000Z', updated_at: '2026-03-24T17:00:00.000Z',
    approved_by: 'AC', approved_at: '2026-03-24T17:00:00.000Z',
    notes: 'Client funds for disbursements — leave in client account', matter_id: null, instruction_ref: 'HLX-DEMO-8804',
    vat_amount: 0, card_id: null, acid: null, collaborators: null, debit_account: null,
    payee_name: null, payment_reference: 'DEMO-PAY-004', sort_code: null, account_number: null,
    bank_verified: null, invoice_number: null, client_id: null,
    client_first_name: 'Demo', client_last_name: 'Delta', client_email: null, company_name: null,
    action_notes: null, external_task_id: null, external_task_url: null,
  },
];

const DEMO_DEBT_ITEMS: TransactionV2Item[] = [
  // pending aged_debt — needs action
  {
    id: 90010, source_type: 'aged_debt', matter_ref: 'HLX-DEMO-9901', matter_description: 'Demo · Commercial lease arrears',
    fee_earner: 'LZ', amount: 5600, transaction_date: '2026-02-10T00:00:00.000Z', transaction_time: null,
    from_client: true, money_sender: null, transaction_type: null, lifecycle_status: 'pending',
    created_by: 'SYSTEM', created_at: '2026-02-10T08:00:00.000Z', updated_at: null, approved_by: null, approved_at: null,
    notes: 'Aged 43 days — client not responding to chasers', matter_id: null, instruction_ref: 'HLX-DEMO-9901',
    vat_amount: null, card_id: null, acid: null, collaborators: null, debit_account: null,
    payee_name: null, payment_reference: null, sort_code: null, account_number: null,
    bank_verified: null, invoice_number: 'INV-DEMO-090', client_id: null,
    client_first_name: 'Demo', client_last_name: 'Echo', client_email: null, company_name: null,
    action_notes: null, external_task_id: null, external_task_url: null,
  },
  // approved aged_debt — resolved
  {
    id: 90011, source_type: 'aged_debt', matter_ref: 'HLX-DEMO-9902', matter_description: 'Demo · Construction defect claim',
    fee_earner: 'AC', amount: 3200, transaction_date: '2026-01-15T00:00:00.000Z', transaction_time: null,
    from_client: true, money_sender: null, transaction_type: null, lifecycle_status: 'approved',
    created_by: 'SYSTEM', created_at: '2026-01-15T08:00:00.000Z', updated_at: '2026-03-20T10:00:00.000Z',
    approved_by: 'LZ', approved_at: '2026-03-20T10:00:00.000Z',
    notes: 'Payment received after final chaser', matter_id: null, instruction_ref: 'HLX-DEMO-9902',
    vat_amount: null, card_id: null, acid: null, collaborators: null, debit_account: null,
    payee_name: null, payment_reference: null, sort_code: null, account_number: null,
    bank_verified: null, invoice_number: null, client_id: null,
    client_first_name: 'Demo', client_last_name: 'Foxtrot', client_email: null, company_name: 'BuildCo Ltd',
    action_notes: null, external_task_id: null, external_task_url: null,
  },
  // left_in_client aged_debt
  {
    id: 90012, source_type: 'aged_debt', matter_ref: 'HLX-DEMO-9903', matter_description: 'Demo · Employment settlement agreement',
    fee_earner: 'JW', amount: 1800, transaction_date: '2026-02-25T00:00:00.000Z', transaction_time: null,
    from_client: true, money_sender: null, transaction_type: null, lifecycle_status: 'left_in_client',
    created_by: 'SYSTEM', created_at: '2026-02-25T08:00:00.000Z', updated_at: '2026-03-18T14:30:00.000Z',
    approved_by: 'JW', approved_at: '2026-03-18T14:30:00.000Z',
    notes: 'Instructions to retain in client account pending disbursements', matter_id: null, instruction_ref: 'HLX-DEMO-9903',
    vat_amount: null, card_id: null, acid: null, collaborators: null, debit_account: null,
    payee_name: null, payment_reference: null, sort_code: null, account_number: null,
    bank_verified: null, invoice_number: null, client_id: null,
    client_first_name: 'Demo', client_last_name: 'Golf', client_email: null, company_name: null,
    action_notes: null, external_task_id: null, external_task_url: null,
  },
];

const DEMO_STRIPE_ITEMS: StripeRecentItem[] = [
  {
    id: 'demo-stripe-1', paymentIntentId: 'pi_demo_3QxABCDEF123456',
    amount: 2400, currency: 'gbp', paymentStatus: 'succeeded', internalStatus: 'paid',
    instructionRef: 'HLX-DEMO-3311402', serviceDescription: 'Shareholder dispute initial review',
    areaOfWork: 'commercial', createdAt: '2026-03-25T08:00:00.000Z', updatedAt: '2026-03-25T08:01:00.000Z',
    firstName: 'Demo', lastName: 'Alpha', helixContact: 'LZ', paymentMethod: 'Card', paymentReference: 'HLX-DEMO-3311402',
  },
  {
    id: 'demo-stripe-2', paymentIntentId: 'pi_demo_3QxGHIJKL789012',
    amount: 1800, currency: 'gbp', paymentStatus: 'succeeded', internalStatus: 'paid',
    instructionRef: 'HLX-DEMO-4428801', serviceDescription: 'Property dispute pre-action advice',
    areaOfWork: 'property', createdAt: '2026-03-24T15:00:00.000Z', updatedAt: '2026-03-24T15:02:00.000Z',
    firstName: 'Demo', lastName: 'Bravo', helixContact: 'AC', paymentMethod: 'Card', paymentReference: 'HLX-DEMO-4428801',
  },
  {
    id: 'demo-stripe-3', paymentIntentId: 'bank_demo_3QxMNOPQR345678',
    amount: 950, currency: 'gbp', paymentStatus: 'pending', internalStatus: 'awaiting',
    instructionRef: 'HLX-DEMO-5501', serviceDescription: 'Boundary dispute advice',
    areaOfWork: 'property', createdAt: '2026-03-25T10:30:00.000Z', updatedAt: null,
    firstName: 'Demo', lastName: 'Charlie', helixContact: 'AC', paymentMethod: 'Bank', paymentReference: 'HLX-5501',
  },
  {
    id: 'demo-stripe-4', paymentIntentId: 'pi_demo_3QxSTUVWX901234',
    amount: 5600, currency: 'gbp', paymentStatus: 'failed', internalStatus: 'failed',
    instructionRef: 'HLX-DEMO-7702', serviceDescription: 'Construction mediation fee',
    areaOfWork: 'construction', createdAt: '2026-03-23T16:00:00.000Z', updatedAt: '2026-03-23T16:01:00.000Z',
    firstName: 'Demo', lastName: 'Delta', helixContact: 'LZ', paymentMethod: 'Card', paymentReference: 'HLX-DEMO-7702',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const areaColour = (aow: string): string => {
  const a = (aow || '').toLowerCase();
  if (a.includes('commercial')) return colours.blue;
  if (a.includes('construction')) return colours.orange;
  if (a.includes('property')) return colours.green;
  if (a.includes('employment')) return colours.yellow;
  return colours.greyText;
};

const formatAmount = (amount: number, currency?: string): string => {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP' }).format(n);
};

// ─── Asana section → V2 lifecycle mapping ──────────────────────────────────────
// When an Asana task moves to one of these sections, it implies the V2 transaction
// lifecycle should change. Used for sync-suggestion cards.
const ASANA_SECTION_LIFECYCLE: Record<string, { status: string; action: 'approve' | 'leave_in_client' | 'reject' }> = {
  'paid': { status: 'approved', action: 'approve' },
  'clio': { status: 'approved', action: 'approve' },
  'xero': { status: 'approved', action: 'approve' },
  'rejected': { status: 'rejected', action: 'reject' },
  'write off': { status: 'rejected', action: 'reject' },
};

const getImpliedLifecycle = (section: string): { status: string; action: 'approve' | 'leave_in_client' | 'reject' } | null => {
  const s = (section || '').toLowerCase();
  for (const [key, lifecycle] of Object.entries(ASANA_SECTION_LIFECYCLE)) {
    if (s.includes(key)) return lifecycle;
  }
  return null;
};

const asanaSectionMeta = (section: string): { colour: string; shortLabel: string } => {
  const s = (section || '').toLowerCase();
  if (s.includes('requested')) return { colour: colours.orange, shortLabel: 'Requested' };
  if (s.includes('iportal') || s.includes('set up')) return { colour: colours.blue, shortLabel: 'iPortal' };
  if (s.includes('unclaimed')) return { colour: colours.yellow, shortLabel: 'Unclaimed' };
  if (s.includes('write off')) return { colour: colours.greyText, shortLabel: 'Write off' };
  if (s.includes('paid')) return { colour: colours.green, shortLabel: 'Paid' };
  if (s.includes('clio') || s.includes('xero')) return { colour: colours.green, shortLabel: 'Complete' };
  if (s.includes('rejected')) return { colour: colours.cta, shortLabel: 'Rejected' };
  return { colour: colours.subtleGrey, shortLabel: section };
};

const relativeTime = (iso: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const shortDate = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const getDebtStageMeta = (status: string | null, isDarkMode: boolean) => {
  const debtNeutralColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const debtStageMap: Record<string, { label: string; colour: string }> = {
    pending: { label: 'Pending', colour: isDarkMode ? colours.accent : colours.highlight },
    approved: { label: 'Approved', colour: colours.green },
    transferred: { label: 'Settled', colour: colours.blue },
    left_in_client: { label: 'Left in client', colour: debtNeutralColour },
    converted_to_request: { label: 'Transfer requested', colour: isDarkMode ? colours.accent : colours.highlight },
    rejected: { label: 'Review', colour: debtNeutralColour },
  };

  return debtStageMap[status || 'pending'] || debtStageMap.pending;
};

const getDebtTransferMeta = (item: TransactionV2Item) => {
  const debtStatus = item.lifecycle_status || 'pending';
  const supportsTransfer = item.source_type === 'aged_debt';
  const queueable = supportsTransfer && (debtStatus === 'pending' || debtStatus === 'rejected');
  const transferableAmount = queueable ? Number(item.amount || 0) : 0;
  const sourceLabel = supportsTransfer ? 'Aged debt' : (item.source_type || 'Debt').replace(/_/g, ' ');

  let actionLabel = 'Review only';
  if (queueable) {
    actionLabel = debtStatus === 'rejected' ? 'Requeue transfer' : 'Queue transfer';
  } else if (debtStatus === 'converted_to_request') {
    actionLabel = 'Queued to transfers';
  } else if (debtStatus === 'approved') {
    actionLabel = 'Approved';
  } else if (debtStatus === 'left_in_client') {
    actionLabel = 'Left in client';
  } else if (debtStatus === 'transferred') {
    actionLabel = 'Settled';
  }

  return {
    queueable,
    transferableAmount,
    sourceLabel,
    actionLabel,
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

const OperationsQueue: React.FC<OperationsQueueProps> = ({ isDarkMode, userInitials, showToast, demoModeEnabled = false, isAdmin = false, isV2User = false, isDevOwner = false, showHomeOpsCclDates = false }) => {
  // Bank transfer state
  const [bankPending, setBankPending] = useState<BankTransferItem[]>([]);
  const [recent, setRecent] = useState<RecentApproval[]>([]);
  const [migrationRequired, setMigrationRequired] = useState(false);

  // CCL date state
  const [cclPending, setCclPending] = useState<CclDateItem[]>([]);
  const [cclDateSelections, setCclDateSelections] = useState<Record<string, string>>({});

  // Transaction state
  const [txnPending, setTxnPending] = useState<TransactionItem[]>([]);

  // Transaction V2 state
  const [txnV2Pending, setTxnV2Pending] = useState<TransactionV2Item[]>([]);
  const [txnV2Loading, setTxnV2Loading] = useState(false);
  const [txnVersion, setTxnVersion] = useState<'v1' | 'v2'>(isV2User ? 'v2' : 'v1');
  const [txnV1StatusFilter, setTxnV1StatusFilter] = useState<'all' | 'requested' | 'transfer' | 'leave_in_client' | 'processed'>('all');
  const [txnV2StatusFilter, setTxnV2StatusFilter] = useState<'all' | 'pending' | 'approved' | 'left_in_client' | 'rejected'>('all');
  const [actioningV2Id, setActioningV2Id] = useState<number | null>(null);
  const [confirmingV2, setConfirmingV2] = useState<TransactionV2Item | null>(null);
  const [convertingDebtId, setConvertingDebtId] = useState<number | null>(null);

  // User-specific aged debts
  const [userDebts, setUserDebts] = useState<TransactionV2Item[]>([]);

  // V2 real-time tracking — known IDs + "just arrived" set
  const knownV2IdsRef = useRef<Set<number>>(new Set());
  const [newV2Ids, setNewV2Ids] = useState<Set<number>>(new Set());
  const newV2TimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Asana reconciliation state
  const [asanaTasks, setAsanaTasks] = useState<AsanaAccountTask[]>([]);
  const [asanaSections, setAsanaSections] = useState<AsanaSectionSummary[]>([]);
  const [dismissedSyncs, setDismissedSyncs] = useState<Set<number>>(new Set());
  const [asanaError, setAsanaError] = useState(false);

  // Stripe recent payments state
  const [stripeRecent, setStripeRecent] = useState<StripeRecentItem[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [txnRange, setTxnRange] = useState<'today' | 'yesterday' | 'week' | 'lastWeek' | 'mtd'>('today');
  const [confirmingTxn, setConfirmingTxn] = useState<TransactionItem | null>(null);
  const [pipelineExpanded, setPipelineExpanded] = useState(false);

  // Detail modal state
  const [selectedStripeItem, setSelectedStripeItem] = useState<StripeRecentItem | null>(null);
  const [selectedDebtItem, setSelectedDebtItem] = useState<TransactionV2Item | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [showPaymentsLedger, setShowPaymentsLedger] = useState(true);

  // Dubber recent calls state (admin stream only — users get CallTicketsStrip)
  const [recentCalls, setRecentCalls] = useState<DubberCallItem[]>([]);

  // Cross-operations lookup state
  const [paymentQuery, setPaymentQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<OperationsLookupResult[]>([]);
  const [paymentNotFound, setPaymentNotFound] = useState(false);
  const [paymentSearching, setPaymentSearching] = useState(false);
  const [showPaymentLookup, setShowPaymentLookup] = useState(false);
  const [lookupHighlight, setLookupHighlight] = useState<OperationsLookupHighlight | null>(null);

  // Asana → V2 manual link state
  const [linkingTaskGid, setLinkingTaskGid] = useState<string | null>(null);

  // Close link picker when pipeline collapses
  useEffect(() => { if (!pipelineExpanded) setLinkingTaskGid(null); }, [pipelineExpanded]);

  const demoModeActive = useMemo(() => {
    if (demoModeEnabled) return true;
    try {
      return localStorage.getItem('demoModeEnabled') === 'true';
    } catch {
      return false;
    }
  }, [demoModeEnabled]);

  const fetchQueue = useCallback(async () => {
    if (demoModeActive) {
      setBankPending(DEMO_BANK_ITEMS);
      setCclPending(showHomeOpsCclDates ? DEMO_CCL_ITEMS : []);
      setTxnPending(DEMO_TXN_ITEMS);
      setRecent(DEMO_RECENT_ITEMS);
      setTxnV2Pending(DEMO_V2_ITEMS);
      setUserDebts(DEMO_DEBT_ITEMS);
      setStripeRecent(DEMO_STRIPE_ITEMS);
      setMigrationRequired(false);
      setIsLoading(false);
      return;
    }

    try {
      const [bankRes, recentRes, cclRes, txnRes, asanaRes, stripeRes] = await Promise.all([
        fetch('/api/ops-queue/pending').catch(() => null),
        fetch('/api/ops-queue/recent').catch(() => null),
        showHomeOpsCclDates ? fetch('/api/ops-queue/ccl-dates-pending').catch(() => null) : Promise.resolve(null),
        fetch('/api/ops-queue/transactions-pending?range=mtd').catch(() => null),
        fetch('/api/ops-queue/asana-account-tasks').catch(() => null),
        fetch('/api/ops-queue/stripe-recent').catch(() => null),
      ]);

      if (bankRes?.ok) {
        const data = await bankRes.json();
        setBankPending(data.items || []);
        setMigrationRequired(Boolean(data.migrationRequired));
      }
      if (recentRes?.ok) {
        const data = await recentRes.json();
        setRecent(data.items || []);
      }
      if (cclRes?.ok) {
        const data = await cclRes.json();
        setCclPending(data.items || []);
      } else if (!showHomeOpsCclDates) {
        setCclPending([]);
      }
      if (txnRes?.ok) {
        const data = await txnRes.json();
        setTxnPending(data.items || []);
      }
      if (asanaRes?.ok) {
        const data = await asanaRes.json();
        setAsanaTasks(data.tasks || []);
        setAsanaSections(data.sections || []);
        setAsanaError(false);
      } else {
        setAsanaError(true);
      }
      if (stripeRes?.ok) {
        const data = await stripeRes.json();
        setStripeRecent(data.items || []);
      }

      // Dubber team call stream — admin only, non-blocking
      if (isAdmin) {
        try {
          const dubberRes = await fetch('/api/dubberCalls/recent?limit=12');
          if (dubberRes?.ok) {
            const dubberData = await dubberRes.json();
            setRecentCalls(dubberData.recordings || []);
          }
        } catch { /* silent — calls are supplementary */ }
      }

      // V2 transactions — parallel, independent of V1
      if (isV2User) {
        try {
          const debtsUrl = isDevOwner
            ? '/api/transactions-v2/debts'
            : `/api/transactions-v2/debts?fe=${encodeURIComponent(userInitials)}`;
          const [v2Res, debtsRes] = await Promise.all([
            fetch('/api/transactions-v2?range=mtd'),
            fetch(debtsUrl),
          ]);
          if (v2Res?.ok) {
            const v2Data = await v2Res.json();
            setTxnV2Pending(v2Data.items || []);
          }
          if (debtsRes?.ok) {
            const debtsData = await debtsRes.json();
            setUserDebts(debtsData.items || []);
          }
        } catch { /* silent — V2 is supplementary */ }
      }
    } catch {
      // silent — queue is supplementary
    } finally {
      setIsLoading(false);
    }
  }, [demoModeActive, isV2User, isDevOwner, showHomeOpsCclDates]);

  useEffect(() => {
    if (!showHomeOpsCclDates) {
      setCclPending([]);
    }
  }, [showHomeOpsCclDates]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // ─── V2 real-time polling (15s) ─────────────────────────────────────────
  const pollV2 = useCallback(async () => {
    if (!isV2User || demoModeActive) return;
    try {
      const debtsUrl = isDevOwner
        ? '/api/transactions-v2/debts'
        : `/api/transactions-v2/debts?fe=${encodeURIComponent(userInitials)}`;
      const [v2Res, debtsRes] = await Promise.all([
        fetch('/api/transactions-v2?range=mtd'),
        fetch(debtsUrl),
      ]);
      if (v2Res?.ok) {
        const v2Data = await v2Res.json();
        const items: TransactionV2Item[] = v2Data.items || [];

        // Detect newly arrived items
        const arrivedIds: number[] = [];
        for (const item of items) {
          if (!knownV2IdsRef.current.has(item.id)) {
            arrivedIds.push(item.id);
            knownV2IdsRef.current.add(item.id);
          }
        }

        // Detect removed items
        const currentIds = new Set(items.map(i => i.id));
        for (const id of knownV2IdsRef.current) {
          if (!currentIds.has(id)) knownV2IdsRef.current.delete(id);
        }

        setTxnV2Pending(items);

        if (arrivedIds.length > 0) {
          setNewV2Ids(prev => {
            const next = new Set(prev);
            arrivedIds.forEach(id => next.add(id));
            return next;
          });
          // Auto-clear the "new" tag after animation completes (1.2s)
          for (const id of arrivedIds) {
            const existing = newV2TimersRef.current.get(id);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
              setNewV2Ids(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              newV2TimersRef.current.delete(id);
            }, 1200);
            newV2TimersRef.current.set(id, timer);
          }
        }
      }
      if (debtsRes?.ok) {
        const debtsData = await debtsRes.json();
        setUserDebts(debtsData.items || []);
      }
    } catch { /* silent */ }
  }, [isV2User, demoModeActive, userInitials, isDevOwner]);

  useEffect(() => {
    if (!isV2User) return;
    // Seed known IDs from initial fetch
    if (knownV2IdsRef.current.size === 0 && txnV2Pending.length > 0) {
      txnV2Pending.forEach(i => knownV2IdsRef.current.add(i.id));
    }
    // Visibility-aware polling — pause when tab/document is hidden
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(pollV2, 15_000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVisibility = () => { document.hidden ? stop() : start(); };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const t of newV2TimersRef.current.values()) clearTimeout(t);
      newV2TimersRef.current.clear();
    };
  }, [isV2User, pollV2, txnV2Pending.length]);

  // ─── Bank transfer approve ──────────────────────────────────────────────

  const handleBankApprove = useCallback(async (operationId: string, ref: string) => {
    if (demoModeActive) {
      const item = bankPending.find(i => i.id === operationId);
      if (!item) return;
      setBankPending(prev => prev.filter(i => i.id !== operationId));
      setRecent(prev => [{
        id: item.id, instruction_ref: item.instruction_ref, amount: item.amount,
        currency: item.currency, service_description: item.service_description,
        area_of_work: item.area_of_work, ops_approved_by: userInitials || 'OPS',
        ops_approved_at: new Date().toISOString(), FirstName: item.FirstName, LastName: item.LastName,
      }, ...prev]);
      showToast(`Demo queue item approved for ${ref}`, 'success');
      return;
    }

    setActioningId(operationId);
    try {
      const res = await fetch('/api/ops-queue/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, approvedBy: userInitials }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Approval failed');
      }
      showToast(`Payment approved for ${ref}`, 'success');
      const approvedItem = bankPending.find(p => p.id === operationId);
      setBankPending(prev => prev.filter(p => p.id !== operationId));
      if (approvedItem) {
        setRecent(prev => [{
          id: approvedItem.id, instruction_ref: approvedItem.instruction_ref, amount: approvedItem.amount,
          currency: approvedItem.currency, service_description: approvedItem.service_description,
          area_of_work: approvedItem.area_of_work, ops_approved_by: userInitials || 'OPS',
          ops_approved_at: new Date().toISOString(), FirstName: approvedItem.FirstName, LastName: approvedItem.LastName,
        }, ...prev]);
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to approve', 'error');
    } finally {
      setActioningId(null);
    }
  }, [demoModeActive, bankPending, showToast, userInitials]);

  // ─── CCL date confirm ──────────────────────────────────────────────────

  const handleCclConfirm = useCallback(async (item: CclDateItem, dateValue: string) => {
    if (!dateValue) {
      showToast('Choose a CCL date first', 'error');
      return;
    }

    if (demoModeActive) {
      setCclPending(prev => prev.filter(i => i.matter_id !== item.matter_id));
      setCclDateSelections(prev => {
        const next = { ...prev };
        delete next[String(item.matter_id)];
        return next;
      });
      showToast(`Demo CCL date confirmed for ${item.display_number}`, 'success');
      return;
    }

    setActioningId(`ccl-${item.matter_id}`);
    try {
      const res = await fetch('/api/ops-queue/ccl-date-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matterId: item.matter_id,
          displayNumber: item.display_number,
          dateValue,
          confirmedBy: userInitials,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'CCL confirm failed');
      }
      const data = await res.json().catch(() => ({}));
      const clioDetail = data.clioSkipped ? ' (Clio skipped)' : data.clioOk ? '' : ' (Clio pending)';
      showToast(`CCL date confirmed for ${item.display_number} — DB updated${clioDetail}`, 'success');
      setCclPending(prev => prev.filter(i => i.matter_id !== item.matter_id));
      setCclDateSelections(prev => {
        const next = { ...prev };
        delete next[String(item.matter_id)];
        return next;
      });
    } catch (e: any) {
      showToast(e.message || 'Failed to confirm CCL date', 'error');
    } finally {
      setActioningId(null);
    }
  }, [demoModeActive, showToast, userInitials]);

  // ─── Transaction approve ────────────────────────────────────────────────

  const handleTxnApprove = useCallback(async (item: TransactionItem) => {
    if (demoModeActive) {
      setTxnPending(prev => prev.filter(i => i.transaction_id !== item.transaction_id));
      showToast(`Demo transaction approved for ${item.matter_ref}`, 'success');
      return;
    }

    setActioningId(`txn-${item.transaction_id}`);
    try {
      const res = await fetch('/api/ops-queue/transaction-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: item.transaction_id,
          action: 'transfer',
          userInitials,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Transaction approval failed');
      }
      showToast(`Transfer approved for ${item.matter_ref}`, 'success');
      setTxnPending(prev => prev.filter(i => i.transaction_id !== item.transaction_id));
    } catch (e: any) {
      showToast(e.message || 'Failed to approve transaction', 'error');
    } finally {
      setActioningId(null);
    }
  }, [demoModeActive, showToast, userInitials]);

  // ─── V2 Transaction action (approve / leave / reject) ──────────────────

  const handleTxnV2Action = useCallback(async (item: TransactionV2Item, action: 'approve' | 'leave_in_client' | 'reject') => {
    setActioningV2Id(item.id);
    try {
      const res = await fetch(`/api/transactions-v2/${item.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userInitials }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Action failed');
      }
      const labels: Record<string, string> = { approve: 'approved', leave_in_client: 'left in client', reject: 'rejected' };
      showToast(`${item.matter_ref} ${labels[action] || action}`, 'success');
      setTxnV2Pending(prev => prev.map(t => t.id === item.id ? { ...t, lifecycle_status: action === 'approve' ? 'approved' : action === 'leave_in_client' ? 'left_in_client' : 'rejected' } : t));
      setConfirmingV2(null);
    } catch (e: any) {
      showToast(e.message || 'Failed to action V2 transaction', 'error');
    } finally {
      setActioningV2Id(null);
    }
  }, [showToast, userInitials]);

  const handleConvertDebtToRequest = useCallback(async (item: TransactionV2Item) => {
    const nowIso = new Date().toISOString();

    if (demoModeActive) {
      const nextId = Math.max(0, ...txnV2Pending.map(txn => txn.id)) + 1;
      const newTransfer: TransactionV2Item = {
        ...item,
        id: nextId,
        source_type: 'aged_debt_request',
        lifecycle_status: 'pending',
        transaction_date: nowIso,
        transaction_time: null,
        created_by: userInitials,
        created_at: nowIso,
        updated_at: nowIso,
        approved_by: null,
        approved_at: null,
        action_notes: `Created from aged debt #${item.id}`,
        notes: [item.notes, `Converted from aged debt #${item.id} by ${userInitials}`].filter(Boolean).join(' | ') || null,
        external_task_id: null,
        external_task_url: null,
      };

      const updatedDebt: TransactionV2Item = {
        ...item,
        lifecycle_status: 'converted_to_request',
        approved_by: userInitials,
        approved_at: nowIso,
        updated_at: nowIso,
        action_notes: [item.action_notes, `Queued as transfer request by ${userInitials}`].filter(Boolean).join(' | '),
      };

      knownV2IdsRef.current.add(newTransfer.id);
      setTxnVersion('v2');
      setTxnV2Pending(prev => [newTransfer, ...prev]);
      setUserDebts(prev => prev.map(debt => debt.id === item.id ? updatedDebt : debt));
      setSelectedDebtItem(current => current?.id === item.id ? updatedDebt : current);
      setExpandedId(`v2-${newTransfer.id}`);
      setNewV2Ids(prev => new Set(prev).add(newTransfer.id));
      const existing = newV2TimersRef.current.get(newTransfer.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setNewV2Ids(prev => {
          const next = new Set(prev);
          next.delete(newTransfer.id);
          return next;
        });
        newV2TimersRef.current.delete(newTransfer.id);
      }, 1200);
      newV2TimersRef.current.set(newTransfer.id, timer);
      showToast(`Queued transfer request for ${item.matter_ref}`, 'success');
      return;
    }

    setConvertingDebtId(item.id);
    try {
      const res = await fetch(`/api/transactions-v2/${item.id}/convert-to-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInitials }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to queue transfer request');
      }

      const data = await res.json();
      const transfer: TransactionV2Item | undefined = data.transfer;
      const updatedDebt: TransactionV2Item | undefined = data.debt;

      if (transfer) {
        knownV2IdsRef.current.add(transfer.id);
        setTxnVersion('v2');
        setTxnV2Pending(prev => [transfer, ...prev.filter(txn => txn.id !== transfer.id)]);
        setExpandedId(`v2-${transfer.id}`);
        setNewV2Ids(prev => new Set(prev).add(transfer.id));
        const existing = newV2TimersRef.current.get(transfer.id);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          setNewV2Ids(prev => {
            const next = new Set(prev);
            next.delete(transfer.id);
            return next;
          });
          newV2TimersRef.current.delete(transfer.id);
        }, 1200);
        newV2TimersRef.current.set(transfer.id, timer);
      }

      if (updatedDebt) {
        setUserDebts(prev => prev.map(debt => debt.id === updatedDebt.id ? updatedDebt : debt));
        setSelectedDebtItem(current => current?.id === updatedDebt.id ? updatedDebt : current);
      }

      showToast(`Queued transfer request for ${item.matter_ref}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to queue transfer request', 'error');
    } finally {
      setConvertingDebtId(null);
    }
  }, [demoModeActive, showToast, txnV2Pending, userInitials]);

  const jumpToLookupResult = useCallback((result: OperationsLookupResult) => {
    setTxnVersion('v2');
    setLookupHighlight({ kind: result.kind, id: result.id });

    if (result.kind === 'transaction-v2') {
      setExpandedId(`v2-${result.id}`);
      setConfirmingV2(null);
      setConfirmingTxn(null);
    } else if (result.kind === 'debt') {
      setExpandedId(`debt-${result.id}`);
      setConfirmingV2(null);
      setConfirmingTxn(null);
    }

    setShowPaymentLookup(false);

    window.setTimeout(() => {
      const target = document.querySelector(`[data-ops-lookup-id="${result.kind}-${result.id}"]`) as HTMLElement | null;
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      const scroller = target.closest('[data-ops-payment-list="true"]') as HTMLElement | null;
      if (scroller) {
        const targetTop = target.offsetTop - 24;
        scroller.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      }
    }, 80);
  }, []);

  useEffect(() => {
    if (!lookupHighlight) return undefined;
    const timer = window.setTimeout(() => setLookupHighlight(null), 4200);
    return () => window.clearTimeout(timer);
  }, [lookupHighlight]);

  // ─── Asana → V2 manual link/unlink ─────────────────────────────────────

  const handleLinkAsanaTask = useCallback(async (asanaGid: string, asanaUrl: string | null, v2Id: number) => {
    try {
      const res = await fetch(`/api/transactions-v2/${v2Id}/link-task`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalTaskId: asanaGid, externalTaskUrl: asanaUrl }),
      });
      if (!res.ok) throw new Error('Link failed');
      // Update local state so icon lights up immediately
      setTxnV2Pending(prev => prev.map(t => t.id === v2Id ? { ...t, external_task_id: asanaGid, external_task_url: asanaUrl } : t));
      setLinkingTaskGid(null);
      showToast('Asana task linked', 'success');
    } catch {
      showToast('Failed to link Asana task', 'error');
    }
  }, [showToast]);

  const handleUnlinkAsanaTask = useCallback(async (asanaGid: string) => {
    // Find the V2 transaction that has this external_task_id
    const linked = txnV2Pending.find(t => t.external_task_id === asanaGid);
    if (!linked) return;
    try {
      const res = await fetch(`/api/transactions-v2/${linked.id}/link-task`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalTaskId: null, externalTaskUrl: null }),
      });
      if (!res.ok) throw new Error('Unlink failed');
      setTxnV2Pending(prev => prev.map(t => t.id === linked.id ? { ...t, external_task_id: null, external_task_url: null } : t));
      showToast('Asana task unlinked', 'success');
    } catch {
      showToast('Failed to unlink Asana task', 'error');
    }
  }, [txnV2Pending, showToast]);

  // ─── Derived counts ────────────────────────────────────────────────────

  // ─── Date range helpers ──────────────────────────────────────────────

  const rangeFilter = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const mondayOffset = day === 0 ? 6 : day - 1;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    todayStart.setHours(0, 0, 0, 0);
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(lastSunday.getDate() - 1);
    lastSunday.setHours(23, 59, 59, 999);
    // Yesterday (or last Friday if today is Monday)
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    yesterdayEnd.setMilliseconds(-1);
    const lastFridayStart = new Date(thisMonday);
    lastFridayStart.setDate(lastFridayStart.getDate() - 3); // Friday before this Monday
    const lastFridayEnd = new Date(lastFridayStart);
    lastFridayEnd.setHours(23, 59, 59, 999);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const isMonday = day === 1;
    return { todayStart, thisMonday, lastMonday, lastSunday, yesterdayStart, yesterdayEnd, lastFridayStart, lastFridayEnd, monthStart, isMonday };
  }, []);

  const filteredTxn = useMemo(() => {
    const rangeFiltered = txnPending.filter(item => {
      if (!item.transaction_date) return txnRange === 'today' || txnRange === 'week';
      const d = new Date(item.transaction_date);
      if (txnRange === 'today') return d >= rangeFilter.todayStart;
      if (txnRange === 'yesterday') return d >= rangeFilter.yesterdayStart && d <= rangeFilter.yesterdayEnd;
      if (txnRange === 'week') return d >= rangeFilter.thisMonday;
      if (txnRange === 'lastWeek') return d >= rangeFilter.lastMonday && d <= rangeFilter.lastSunday;
      return d >= rangeFilter.monthStart; // mtd
    });
    // Non-admin users only see their own transactions
    if (!isAdmin) {
      return rangeFiltered.filter(item => (item.fe || '').toUpperCase() === userInitials.toUpperCase());
    }
    return rangeFiltered;
  }, [txnPending, txnRange, rangeFilter, isAdmin, userInitials]);

  const txnV1StatusOptions = useMemo(() => {
    const counts = {
      all: filteredTxn.length,
      requested: 0,
      transfer: 0,
      leave_in_client: 0,
      processed: 0,
    };

    filteredTxn.forEach(item => {
      const status = item.status || 'requested';
      if (status in counts) {
        counts[status as keyof typeof counts] += 1;
      }
    });

    return [
      { value: 'all' as const, label: 'All', count: counts.all },
      { value: 'requested' as const, label: 'Pending', count: counts.requested },
      { value: 'transfer' as const, label: 'Approved', count: counts.transfer },
      { value: 'leave_in_client' as const, label: 'Left in client', count: counts.leave_in_client },
      { value: 'processed' as const, label: 'Processed', count: counts.processed },
    ];
  }, [filteredTxn]);

  const displayedTxn = useMemo(() => {
    if (txnV1StatusFilter === 'all') return filteredTxn;
    return filteredTxn.filter(item => (item.status || 'requested') === txnV1StatusFilter);
  }, [filteredTxn, txnV1StatusFilter]);

  // V2 filtered transactions (same date range logic)
  const filteredTxnV2 = useMemo(() => {
    const rangeFiltered = txnV2Pending.filter(item => {
      if (!item.transaction_date) return txnRange === 'today' || txnRange === 'week';
      const d = new Date(item.transaction_date);
      if (txnRange === 'today') return d >= rangeFilter.todayStart;
      if (txnRange === 'yesterday') return d >= rangeFilter.yesterdayStart && d <= rangeFilter.yesterdayEnd;
      if (txnRange === 'week') return d >= rangeFilter.thisMonday;
      if (txnRange === 'lastWeek') return d >= rangeFilter.lastMonday && d <= rangeFilter.lastSunday;
      return d >= rangeFilter.monthStart;
    });
    if (!isAdmin) {
      return rangeFiltered.filter(item => (item.fee_earner || '').toUpperCase() === userInitials.toUpperCase());
    }
    return rangeFiltered;
  }, [txnV2Pending, txnRange, rangeFilter, isAdmin, userInitials]);

  const matchesTxnRange = (dateStr: string | null | undefined, selectedRange: typeof txnRange) => {
    if (!dateStr) return selectedRange === 'today' || selectedRange === 'week' || selectedRange === 'mtd';
    const d = new Date(dateStr);
    if (selectedRange === 'today') return d >= rangeFilter.todayStart;
    if (selectedRange === 'yesterday') return d >= rangeFilter.yesterdayStart && d <= rangeFilter.yesterdayEnd;
    if (selectedRange === 'week') return d >= rangeFilter.thisMonday;
    if (selectedRange === 'lastWeek') {
      return rangeFilter.isMonday
        ? d >= rangeFilter.lastFridayStart && d <= rangeFilter.lastFridayEnd
        : d >= rangeFilter.lastMonday && d <= rangeFilter.lastSunday;
    }
    return d >= rangeFilter.monthStart;
  };

  const getTransferSortDate = (item: TransactionV2Item) => {
    if (item.source_type === 'aged_debt') {
      return item.approved_at || item.updated_at || item.transaction_date || item.created_at || null;
    }
    return item.transaction_date || item.updated_at || item.created_at || null;
  };

  const filteredDebts = useMemo(() => {
    const activeDebts = userDebts.filter(item => {
      const debtStatus = item.lifecycle_status || 'pending';
      return debtStatus === 'pending' || debtStatus === 'rejected' || debtStatus === 'converted_to_request';
    });
    if (!isAdmin) {
      return activeDebts.filter(item => (item.fee_earner || '').toUpperCase() === userInitials.toUpperCase());
    }
    return activeDebts;
  }, [userDebts, isAdmin, userInitials]);

  const resolvedDebtTransfers = useMemo(() => {
    const actionedDebts = userDebts.filter(item => {
      const debtStatus = item.lifecycle_status || 'pending';
      return debtStatus === 'approved' || debtStatus === 'left_in_client' || debtStatus === 'transferred';
    });
    if (!isAdmin) {
      return actionedDebts.filter(item => (item.fee_earner || '').toUpperCase() === userInitials.toUpperCase());
    }
    return actionedDebts;
  }, [userDebts, isAdmin, userInitials]);

  const filteredResolvedDebtTransfers = useMemo(() => {
    return resolvedDebtTransfers.filter(item => matchesTxnRange(getTransferSortDate(item), txnRange));
  }, [resolvedDebtTransfers, txnRange, rangeFilter]);

  const lookupTxnV2Items = useMemo(() => {
    const regularTransfers = txnV2Pending.filter(item => item.source_type !== 'aged_debt');
    const byId = new Map<number, TransactionV2Item>();
    regularTransfers.forEach(item => byId.set(item.id, item));
    resolvedDebtTransfers.forEach(item => byId.set(item.id, item));
    return Array.from(byId.values()).sort((first, second) => {
      const firstTime = new Date(getTransferSortDate(first) || 0).getTime();
      const secondTime = new Date(getTransferSortDate(second) || 0).getTime();
      return secondTime - firstTime;
    });
  }, [txnV2Pending, resolvedDebtTransfers]);

  // Filtered stripe payments (same date range logic)
  const filteredStripeRecent = useMemo(() => {
    return stripeRecent.filter(p => {
      const dateStr = p.createdAt || p.updatedAt;
      if (!dateStr) return txnRange === 'today' || txnRange === 'week' || txnRange === 'mtd';
      const d = new Date(dateStr);
      if (txnRange === 'today') return d >= rangeFilter.todayStart;
      if (txnRange === 'yesterday') return d >= rangeFilter.yesterdayStart && d <= rangeFilter.yesterdayEnd;
      if (txnRange === 'week') return d >= rangeFilter.thisMonday;
      if (txnRange === 'lastWeek') return d >= rangeFilter.lastMonday && d <= rangeFilter.lastSunday;
      return d >= rangeFilter.monthStart;
    });
  }, [stripeRecent, txnRange, rangeFilter]);

  // ─── Cross-operations lookup ───────────────────────────────────────────

  const handlePaymentLookup = useCallback(() => {
    const q = paymentQuery.trim();
    if (!q) return;
    const query = q.toLowerCase();
    setPaymentSearching(true);
    setLookupResults([]);
    setPaymentNotFound(false);

    const includesQuery = (...values: Array<string | number | null | undefined>) => (
      values.some(value => String(value ?? '').toLowerCase().includes(query))
    );

    const findMatchText = (fields: Array<{ label: string; value: string | number | null | undefined }>) => {
      const matched = fields.find(field => String(field.value ?? '').toLowerCase().includes(query));
      if (!matched || !matched.value) return null;
      return `${matched.label}: ${matched.value}`;
    };

    const nextResults: OperationsLookupResult[] = [];

    filteredStripeRecent.forEach(payment => {
      if (!includesQuery(
        payment.paymentIntentId,
        payment.id,
        payment.instructionRef,
        payment.firstName,
        payment.lastName,
        payment.helixContact,
        payment.paymentMethod,
        payment.paymentReference,
        payment.serviceDescription,
        payment.areaOfWork,
        payment.amount,
        payment.internalStatus,
        payment.paymentStatus,
      )) return;

      const clientName = [payment.firstName, payment.lastName].filter(Boolean).join(' ') || payment.instructionRef || 'Payment';
      const statusColour = payment.paymentStatus === 'succeeded' ? colours.green
        : payment.paymentStatus === 'failed' ? colours.cta : colours.orange;

      nextResults.push({
        kind: 'payment',
        id: payment.id,
        title: clientName,
        subtitle: payment.paymentIntentId || payment.instructionRef || null,
        amountText: payment.amount != null ? formatAmount(payment.amount, payment.currency) : null,
        statusText: payment.paymentStatus === 'succeeded' ? 'Paid' : payment.paymentStatus === 'failed' ? 'Failed' : 'Pending',
        statusColour,
        sectionLabel: 'Payments',
        matchText: findMatchText([
          { label: 'Intent', value: payment.paymentIntentId },
          { label: 'Instruction', value: payment.instructionRef },
          { label: 'Method', value: payment.paymentMethod },
          { label: 'Reference', value: payment.paymentReference },
          { label: 'Client', value: clientName },
          { label: 'Contact', value: payment.helixContact },
          { label: 'Description', value: payment.serviceDescription },
        ]),
      });
    });

    lookupTxnV2Items.forEach(item => {
      if (!includesQuery(
        item.id,
        item.matter_ref,
        item.instruction_ref,
        item.payment_reference,
        item.invoice_number,
        item.client_first_name,
        item.client_last_name,
        item.client_email,
        item.company_name,
        item.fee_earner,
        item.money_sender,
        item.notes,
        item.action_notes,
        item.acid,
        item.lifecycle_status,
      )) return;

      const title = item.matter_ref || item.instruction_ref || `V2 transaction ${item.id}`;
      const subtitle = [item.client_first_name, item.client_last_name].filter(Boolean).join(' ') || item.company_name || item.payment_reference || null;
      const statusMap: Record<string, { label: string; colour: string }> = {
        approved: { label: 'Approved', colour: colours.green },
        left_in_client: { label: 'Left in client', colour: colours.greyText },
        rejected: { label: 'Rejected', colour: colours.cta },
        pending: { label: 'Pending', colour: colours.orange },
      };
      const status = statusMap[item.lifecycle_status || 'pending'] || statusMap.pending;

      nextResults.push({
        kind: 'transaction-v2',
        id: String(item.id),
        title,
        subtitle,
        amountText: formatAmount(item.amount),
        statusText: status.label,
        statusColour: status.colour,
        sectionLabel: 'V2 transfers',
        matchText: findMatchText([
          { label: 'Source', value: item.source_type === 'aged_debt' ? 'Aged debt transfer' : 'Regular transfer' },
          { label: 'Matter', value: item.matter_ref },
          { label: 'Instruction', value: item.instruction_ref },
          { label: 'Reference', value: item.payment_reference },
          { label: 'Invoice', value: item.invoice_number },
          { label: 'Client', value: subtitle },
          { label: 'Notes', value: item.notes || item.action_notes },
        ]),
      });
    });

    filteredDebts.forEach(item => {
      if (!includesQuery(
        item.id,
        item.matter_ref,
        item.instruction_ref,
        item.client_first_name,
        item.client_last_name,
        item.company_name,
        item.fee_earner,
        item.notes,
        item.action_notes,
        item.lifecycle_status,
      )) return;

      const title = item.matter_ref || item.instruction_ref || `Debt transfer ${item.id}`;
      const subtitle = [item.client_first_name, item.client_last_name].filter(Boolean).join(' ') || item.company_name || item.matter_description || null;
      const debtNeutralColour = isDarkMode ? colours.subtleGrey : colours.greyText;
      const debtStageMap: Record<string, { label: string; colour: string }> = {
        pending: { label: 'Needs action', colour: debtNeutralColour },
        approved: { label: 'Approved', colour: colours.green },
        transferred: { label: 'Settled', colour: colours.blue },
        left_in_client: { label: 'Left in client', colour: isDarkMode ? colours.subtleGrey : colours.greyText },
        converted_to_request: { label: 'Transfer requested', colour: isDarkMode ? colours.accent : colours.highlight },
        rejected: { label: 'Written off', colour: debtNeutralColour },
      };
      const stage = debtStageMap[item.lifecycle_status || 'pending'] || debtStageMap.pending;

      nextResults.push({
        kind: 'debt',
        id: String(item.id),
        title,
        subtitle,
        amountText: formatAmount(item.amount),
        statusText: stage.label,
        statusColour: stage.colour,
        sectionLabel: 'Aged debts',
        matchText: findMatchText([
          { label: 'Matter', value: item.matter_ref },
          { label: 'Instruction', value: item.instruction_ref },
          { label: 'Client', value: subtitle },
          { label: 'Notes', value: item.notes || item.action_notes },
        ]),
      });
    });

    nextResults.sort((first, second) => {
      const sectionOrder = { 'V2 transfers': 0, Payments: 1, 'Aged debts': 2 } as Record<string, number>;
      return (sectionOrder[first.sectionLabel] ?? 99) - (sectionOrder[second.sectionLabel] ?? 99);
    });

    setLookupResults(nextResults.slice(0, 24));
    setPaymentNotFound(nextResults.length === 0);
    setPaymentSearching(false);
  }, [filteredDebts, filteredStripeRecent, isDarkMode, lookupTxnV2Items, paymentQuery]);

  // Fallback hint: when today is empty, automatically show yesterday, then week.
  const txnFallbackHint = useMemo(() => {
    if (txnRange !== 'today') return null;
    if (txnVersion === 'v2' ? filteredTxnV2.length > 0 : filteredTxn.length > 0) return null;

    const countInRange = (items: { transaction_date?: string | null }[], start: Date, end: Date) =>
      items.filter(item => {
        if (!item.transaction_date) return false;
        const d = new Date(item.transaction_date);
        return d >= start && d <= end;
      }).length;

    const yesterdayCount = countInRange(txnPending, rangeFilter.yesterdayStart, rangeFilter.yesterdayEnd)
      + countInRange(txnV2Pending, rangeFilter.yesterdayStart, rangeFilter.yesterdayEnd);

    const weekCount = countInRange(txnPending, rangeFilter.thisMonday, new Date())
      + countInRange(txnV2Pending, rangeFilter.thisMonday, new Date());

    if (yesterdayCount > 0) return { label: `Auto showing Yesterday (${yesterdayCount})`, range: 'yesterday' as const };
    if (weekCount > 0) return { label: `Auto showing Week (${weekCount})`, range: 'week' as const };
    return null;
  }, [txnRange, filteredTxn.length, filteredTxnV2.length, txnPending, txnV2Pending, rangeFilter, txnVersion]);

  const txnFallbackItems = useMemo(() => {
    if (!txnFallbackHint) return [];
    let items: typeof txnPending;
    items = txnPending.filter(item => matchesTxnRange(item.transaction_date, txnFallbackHint.range));
    if (!isAdmin) {
      items = items.filter(item => (item.fe || '').toUpperCase() === userInitials.toUpperCase());
    }
    return items;
  }, [txnFallbackHint, txnPending, rangeFilter, isAdmin, userInitials]);

  const txnFallbackItemsByStatus = useMemo(() => {
    if (txnV1StatusFilter === 'all') return txnFallbackItems;
    return txnFallbackItems.filter(item => (item.status || 'requested') === txnV1StatusFilter);
  }, [txnFallbackItems, txnV1StatusFilter]);

  const txnV2FallbackItems = useMemo(() => {
    if (!txnFallbackHint) return [];
    let items: typeof txnV2Pending;
    items = txnV2Pending.filter(item => matchesTxnRange(item.transaction_date, txnFallbackHint.range));
    if (!isAdmin) {
      items = items.filter(item => (item.fee_earner || '').toUpperCase() === userInitials.toUpperCase());
    }
    return items;
  }, [txnFallbackHint, txnV2Pending, rangeFilter, isAdmin, userInitials]);

  const resolvedDebtTransferFallbackItems = useMemo(() => {
    if (!txnFallbackHint) return [];
    return resolvedDebtTransfers.filter(item => matchesTxnRange(getTransferSortDate(item), txnFallbackHint.range));
  }, [resolvedDebtTransfers, txnFallbackHint, rangeFilter]);

  const baseDisplayedTxnV2 = useMemo(() => {
    const regularTransfers = filteredTxnV2
      .filter(item => item.source_type !== 'aged_debt');
    const debtTransfers = filteredResolvedDebtTransfers;

    return [...regularTransfers, ...debtTransfers].sort((first, second) => {
      const firstTime = new Date(getTransferSortDate(first) || 0).getTime();
      const secondTime = new Date(getTransferSortDate(second) || 0).getTime();
      return secondTime - firstTime;
    });
  }, [filteredResolvedDebtTransfers, filteredTxnV2]);

  const txnV2StatusOptions = useMemo(() => {
    const counts = {
      all: baseDisplayedTxnV2.length,
      pending: 0,
      approved: 0,
      left_in_client: 0,
      rejected: 0,
    };

    baseDisplayedTxnV2.forEach(item => {
      const status = item.lifecycle_status || 'pending';
      if (status in counts) {
        counts[status as keyof typeof counts] += 1;
      }
    });

    return [
      { value: 'all' as const, label: 'All', count: counts.all },
      { value: 'pending' as const, label: 'Pending', count: counts.pending },
      { value: 'approved' as const, label: 'Approved', count: counts.approved },
      { value: 'left_in_client' as const, label: 'Left in client', count: counts.left_in_client },
      { value: 'rejected' as const, label: 'Rejected', count: counts.rejected },
    ];
  }, [baseDisplayedTxnV2]);

  const displayedTxnV2 = useMemo(() => {
    if (txnV2StatusFilter === 'all') return baseDisplayedTxnV2;
    return baseDisplayedTxnV2.filter(item => (item.lifecycle_status || 'pending') === txnV2StatusFilter);
  }, [baseDisplayedTxnV2, txnV2StatusFilter]);

  const basePreviewTxnV2Items = useMemo(() => {
    const regularTransfers = txnV2FallbackItems.filter(item => item.source_type !== 'aged_debt');
    const debtTransfers = resolvedDebtTransferFallbackItems;

    return [...regularTransfers, ...debtTransfers].sort((first, second) => {
      const firstTime = new Date(getTransferSortDate(first) || 0).getTime();
      const secondTime = new Date(getTransferSortDate(second) || 0).getTime();
      return secondTime - firstTime;
    });
  }, [resolvedDebtTransferFallbackItems, txnV2FallbackItems]);

  const previewTxnV2Items = useMemo(() => {
    if (txnV2StatusFilter === 'all') return basePreviewTxnV2Items;
    return basePreviewTxnV2Items.filter(item => (item.lifecycle_status || 'pending') === txnV2StatusFilter);
  }, [basePreviewTxnV2Items, txnV2StatusFilter]);

  const stripeFallbackItems = useMemo(() => {
    if (!txnFallbackHint) return [];
    return stripeRecent.filter(p => {
      const dateStr = p.createdAt || p.updatedAt;
      return matchesTxnRange(dateStr, txnFallbackHint.range);
    });
  }, [txnFallbackHint, stripeRecent, rangeFilter]);

  const displayedStripeRecent = useMemo(() => {
    return filteredStripeRecent;
  }, [filteredStripeRecent]);

  const fallbackPeriodLabel = useMemo(() => {
    if (!txnFallbackHint) return null;
    if (txnFallbackHint.range === 'yesterday') return 'Yesterday';
    if (txnFallbackHint.range === 'week') return 'This week';
    return 'Suggested period';
  }, [txnFallbackHint]);
  const fallbackPreviewLabel = fallbackPeriodLabel || 'Suggested period';
  const fallbackPreviewLabelLower = fallbackPreviewLabel.toLowerCase();

  const txnPreviewMode = txnRange === 'today' && displayedTxn.length === 0 && txnFallbackItems.length > 0;
  const txnV2PreviewMode = txnRange === 'today' && displayedTxnV2.length === 0 && previewTxnV2Items.length > 0;
  const paymentsPreviewMode = txnRange === 'today' && displayedStripeRecent.length === 0 && stripeFallbackItems.length > 0;

  const renderedTxn = txnPreviewMode ? txnFallbackItems : displayedTxn;
  const renderedTxnV2 = txnV2PreviewMode ? previewTxnV2Items : displayedTxnV2;
  const renderedStripeRecent = paymentsPreviewMode ? stripeFallbackItems : displayedStripeRecent;

  const renderedTxnGroups = useMemo(() => {
    const activeStatuses = txnV1StatusFilter === 'all'
      ? TXN_V1_STATUS_SEGMENTS.map(segment => segment.key)
      : [txnV1StatusFilter];

    return activeStatuses
      .map(statusKey => ({
        key: statusKey,
        label: TXN_V1_STATUS_SEGMENTS.find(segment => segment.key === statusKey)?.label || statusKey,
        items: renderedTxn.filter(item => (item.status || 'requested') === statusKey),
      }))
      .filter(group => group.items.length > 0);
  }, [renderedTxn, txnV1StatusFilter]);

  const renderedTxnV2Groups = useMemo(() => {
    const activeStatuses = txnV2StatusFilter === 'all'
      ? TXN_V2_STATUS_SEGMENTS.map(segment => segment.key)
      : [txnV2StatusFilter];

    return activeStatuses
      .map(statusKey => ({
        key: statusKey,
        label: TXN_V2_STATUS_SEGMENTS.find(segment => segment.key === statusKey)?.label || statusKey,
        items: renderedTxnV2.filter(item => (item.lifecycle_status || 'pending') === statusKey),
      }))
      .filter(group => group.items.length > 0);
  }, [renderedTxnV2, txnV2StatusFilter]);

  const renderedDebtGroups = useMemo(() => {
    return DEBT_STATUS_SEGMENTS
      .map(segment => ({
        key: segment.key,
        label: segment.label,
        items: filteredDebts.filter(item => (item.lifecycle_status || 'pending') === segment.key),
      }))
      .filter(group => group.items.length > 0);
  }, [filteredDebts]);

  // Group Asana tasks by section for expandable breakdown
  const asanaTasksBySection = useMemo(() => {
    const map = new Map<string, AsanaAccountTask[]>();
    for (const t of asanaTasks) {
      const existing = map.get(t.section) || [];
      existing.push(t);
      map.set(t.section, existing);
    }
    return map;
  }, [asanaTasks]);

  // ─── Week-to-date filter for CCL dates ──────────────────────────────────

  const cclWeekFiltered = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);
    return cclPending.filter(item => {
      if (!item.open_date) return true; // no date = show it
      return new Date(item.open_date) >= thisMonday;
    });
  }, [cclPending]);

  const bankCount = bankPending.length;
  const cclCount = cclWeekFiltered.length;
  const visibleCclCount = showHomeOpsCclDates ? cclCount : 0;
  const txnCount = displayedTxn.length;
  const totalPending = bankCount + visibleCclCount + txnCount;
  const recentCount = recent.length;
  const hasFallbackPreview = txnPreviewMode || txnV2PreviewMode || paymentsPreviewMode;

  // ─── Asana reconciliation lookup ────────────────────────────────────────

  // Map matter_ref → Asana task for cross-referencing transactions
  const asanaByRef = useMemo(() => {
    const map = new Map<string, AsanaAccountTask>();
    for (const t of asanaTasks) {
      if (t.matterRef) map.set(t.matterRef.toUpperCase(), t);
    }
    return map;
  }, [asanaTasks]);

  // Asana tasks in active workflow stages (not completed/archived sections)
  const COMPLETED_SECTIONS = ['Added to Clio/Xero', 'Rejected'];
  const activeAsanaTasks = useMemo(() => {
    return asanaTasks.filter(t => !COMPLETED_SECTIONS.includes(t.section));
  }, [asanaTasks]);

  // ─── Sync suggestions: Asana section moved → V2 lifecycle mismatch ──────
  const syncSuggestions = useMemo(() => {
    const suggestions: { item: TransactionV2Item; asanaTask: AsanaAccountTask; implied: { status: string; action: 'approve' | 'leave_in_client' | 'reject' } }[] = [];
    for (const item of txnV2Pending) {
      if (item.lifecycle_status !== 'pending') continue;
      if (dismissedSyncs.has(item.id)) continue;
      const ref = (item.matter_ref || '').toUpperCase();
      const asanaTask = asanaByRef.get(ref);
      if (!asanaTask) continue;
      const implied = getImpliedLifecycle(asanaTask.section);
      if (!implied) continue; // Asana task still in early/neutral section
      suggestions.push({ item, asanaTask, implied });
    }
    return suggestions;
  }, [txnV2Pending, asanaByRef, dismissedSyncs]);

  // Asana tasks that don't match any pending transaction (form-originated, etc.)
  const txnRefs = useMemo(() => new Set(txnPending.map(t => t.matter_ref?.toUpperCase())), [txnPending]);
  const unmatchedAsanaTasks = useMemo(() => {
    return activeAsanaTasks.filter(t => t.matterRef && !txnRefs.has(t.matterRef.toUpperCase()));
  }, [activeAsanaTasks, txnRefs]);

  // Reverse lookup: which Asana tasks have a matching V2 transaction?
  // Matches by matter_ref (auto) OR external_task_id (manual/persistent DB link)
  const linkedAsanaGids = useMemo(() => {
    const refs = new Set(txnV2Pending.map(t => t.matter_ref?.toUpperCase()).filter(Boolean));
    const extIds = new Set(txnV2Pending.map(t => t.external_task_id).filter(Boolean));
    const linked = new Set<string>();
    for (const t of asanaTasks) {
      if ((t.matterRef && refs.has(t.matterRef.toUpperCase())) || extIds.has(t.gid)) {
        linked.add(t.gid);
      }
    }
    return linked;
  }, [asanaTasks, txnV2Pending]);

  // ─── Tokens (aligned with OperationsDashboard) ─────────────────────────

  const cardBg = isDarkMode ? 'rgba(6, 23, 51, 0.55)' : '#FFFFFF';
  const cardBorder = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.08)';
  const cardShadow = isDarkMode ? 'none' : 'inset 0 0 0 1px rgba(13,47,96,0.06), 0 1px 4px rgba(13,47,96,0.04)';
  const borderCol = isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(13, 47, 96, 0.08)';
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.06)';
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const hoverBg = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.03)';

  // ─── Toggle expand ──────────────────────────────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    setConfirmingTxn(null);
  }, []);

  // ─── Selected ticket detail ─────────────────────────────────────────────

  const selectedBank = expandedId && !expandedId.startsWith('ccl-') && !expandedId.startsWith('txn-')
    ? bankPending.find(i => i.id === expandedId) ?? null : null;

  // ─── Skeleton ───────────────────────────────────────────────────────────

  if (isLoading) {
    const skelStrong = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)';
    const skelSoft = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.03)';
    const skelBar = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)';
    const skelBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.06)';
    return (
      <div style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        boxShadow: cardShadow,
        fontFamily: "'Raleway', 'Segoe UI', sans-serif",
      }}>
        {/* Header skeleton — matches accent-bordered header */}
        <div style={{
          padding: '7px 12px 5px',
          background: isDarkMode ? 'rgba(135,243,243,0.04)' : 'rgba(13,47,96,0.03)',
          borderBottom: `2px solid ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.12)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: skelStrong, animation: 'opsQPulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: 68, height: 9, background: skelStrong, animation: 'opsQPulse 1.5s ease-in-out infinite 0.05s' }} />
            <div style={{ width: 14, height: 8, background: skelBar, animation: 'opsQPulse 1.5s ease-in-out infinite 0.1s' }} />
          </div>
          <div style={{ width: 42, height: 8, background: skelBar, animation: 'opsQPulse 1.5s ease-in-out infinite 0.12s' }} />
        </div>

        {/* Pipeline sub-header skeleton — Asana icon + stage pills */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 14px', height: 32, boxSizing: 'border-box',
          background: isDarkMode ? colours.darkBlue : colours.grey,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        }}>
          <div style={{ width: 8, height: 8, background: skelBar, animation: 'opsQPulse 1.5s ease-in-out infinite 0.06s' }} />
          <div style={{ width: 9, height: 9, borderRadius: 1, background: skelStrong, animation: 'opsQPulse 1.5s ease-in-out infinite 0.08s' }} />
          <div style={{ width: 88, height: 9, background: skelStrong, animation: 'opsQPulse 1.5s ease-in-out infinite 0.1s' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: skelStrong, animation: `opsQPulse 1.5s ease-in-out infinite ${0.12 + i * 0.06}s` }} />
                <div style={{ width: 22 + i * 6, height: 8, background: skelBar, animation: `opsQPulse 1.5s ease-in-out infinite ${0.14 + i * 0.06}s` }} />
              </div>
            ))}
          </div>
        </div>

        {/* Bank transfers skeleton — dot + label + card grid */}
        <div style={{ marginTop: 10, borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.04)'}`, paddingTop: 8 }}>
          <div style={{ padding: '2px 14px 3px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: isDarkMode ? 'rgba(255,140,0,0.35)' : 'rgba(255,140,0,0.25)' }} />
            <div style={{ width: 80, height: 9, background: skelStrong, animation: 'opsQPulse 1.5s ease-in-out infinite 0.18s' }} />
            <div style={{ width: 10, height: 8, background: skelBar }} />
          </div>
          <div style={{ padding: '2px 14px 6px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                borderLeft: `2px solid ${isDarkMode ? 'rgba(255,140,0,0.18)' : 'rgba(255,140,0,0.12)'}`,
                background: skelSoft, padding: '6px 8px',
                animation: `opsQPulse 1.5s ease-in-out infinite ${0.2 + i * 0.08}s`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 11, background: skelStrong, maxWidth: 96 }} />
                  <div style={{ width: 52, height: 10, background: skelBar }} />
                </div>
                <div style={{ marginTop: 2, width: 40, height: 7, background: skelBar }} />
              </div>
            ))}
          </div>
        </div>

        {/* Transaction section skeleton — date chips + card grid */}
        <div style={{ paddingTop: 8 }}>
          <div style={{
            padding: '6px 14px 7px', display: 'flex', alignItems: 'center', gap: 4,
            borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.03)'}`,
            borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(13,47,96,0.07)'}`,
            background: isDarkMode ? 'rgba(2,6,23,0.24)' : 'rgba(244,244,246,0.52)',
          }}>
            {[32, 26, 30, 38, 24].map((w, i) => (
              <div key={i} style={{
                width: w, height: 18,
                background: i === 0 ? (isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)') : skelSoft,
                border: i === 0 ? `1px solid ${isDarkMode ? 'rgba(135,243,243,0.12)' : 'rgba(54,144,206,0.1)'}` : `1px solid ${skelBorder}`,
                animation: `opsQPulse 1.5s ease-in-out infinite ${0.24 + i * 0.04}s`,
              }} />
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
              <div style={{ width: 20, height: 18, background: skelSoft, border: `1px solid ${skelBorder}`, animation: 'opsQPulse 1.5s ease-in-out infinite 0.4s' }} />
              <div style={{ width: 20, height: 18, background: skelSoft, border: `1px solid ${skelBorder}`, animation: 'opsQPulse 1.5s ease-in-out infinite 0.43s' }} />
            </div>
          </div>

          {/* Transactions / Payments sub-header skeleton — accent underlines */}
          <div style={{ padding: '0 14px 8px', display: 'flex', alignItems: 'flex-end', gap: 18 }}>
            <div style={{
              flex: '1 1 0', minWidth: 0, paddingBottom: 6, paddingTop: 8,
              borderBottom: `2px solid ${isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)'}`,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <div style={{ width: 8, height: 8, background: skelBar, animation: 'opsQPulse 1.5s ease-in-out infinite 0.28s' }} />
              <div style={{ width: 62, height: 9, background: skelStrong, animation: 'opsQPulse 1.5s ease-in-out infinite 0.3s' }} />
            </div>
            <div style={{
              flex: '1 1 0', minWidth: 0, paddingBottom: 6, paddingTop: 8,
              borderBottom: `2px solid ${isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)'}`,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <div style={{ width: 11, height: 9, background: isDarkMode ? 'rgba(99,91,255,0.15)' : 'rgba(99,91,255,0.1)', animation: 'opsQPulse 1.5s ease-in-out infinite 0.32s' }} />
              <div style={{ width: 52, height: 9, background: skelStrong, animation: 'opsQPulse 1.5s ease-in-out infinite 0.34s' }} />
            </div>
          </div>

          <div style={{ padding: '0 14px 6px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                borderLeft: `2px solid ${isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.1)'}`,
                background: skelSoft, padding: '6px 8px',
                animation: `opsQPulse 1.5s ease-in-out infinite ${0.32 + i * 0.06}s`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 11, background: skelStrong, maxWidth: 110 }} />
                  <div style={{ width: 48, height: 10, background: skelBar }} />
                </div>
                <div style={{ marginTop: 2, width: 50, height: 7, background: skelBar }} />
              </div>
            ))}
          </div>
        </div>

        <style>{`@keyframes opsQPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
      </div>
    );
  }

  // Nothing to show — non-admins only care about their own transactions
  if (isAdmin ? (totalPending === 0 && txnV2Pending.length === 0 && recentCount === 0 && recentCalls.length === 0 && !migrationRequired && !hasFallbackPreview) : (filteredTxn.length === 0 && filteredTxnV2.length === 0 && !hasFallbackPreview)) return null;

  // ─── Card renderer (compact ticket) ────────────────────────────────────

  const renderCard = (id: string, accentColour: string, label: string, sublabel: string | null, badge?: { text: string; colour: string } | null) => {
    const isSelected = expandedId === id;
    return (
      <div
        key={id}
        onClick={() => toggleExpand(id)}
        style={{
          borderLeft: `2px solid ${accentColour}`,
          background: isSelected ? hoverBg : (isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(13, 47, 96, 0.015)'),
          border: `1px solid ${isSelected ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)')}`,
          borderLeftWidth: 2,
          borderLeftColor: accentColour,
          padding: '6px 8px',
          cursor: 'pointer',
          transition: 'all 0.14s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = hoverBg;
          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)';
          e.currentTarget.style.borderLeftColor = accentColour;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = isSelected ? hoverBg : (isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(13, 47, 96, 0.015)');
          e.currentTarget.style.borderColor = isSelected ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)');
          e.currentTarget.style.borderLeftColor = accentColour;
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: textPrimary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {label}
          </span>
          {sublabel && (
            <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, flexShrink: 0 }}>
              {sublabel}
            </span>
          )}
        </div>
        {badge && (
          <div style={{ marginTop: 1 }}>
            <span style={{
              fontSize: 7, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase',
              color: badge.colour, opacity: 0.8, lineHeight: 1,
            }}>
              {badge.text}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: textMuted, padding: '2px 0 3px', letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: 4 }}>
        <SiAsana size={10} color={accent} style={{ flexShrink: 0 }} />
        {isAdmin ? 'Operations' : 'My Transactions'}
      </div>
      <div style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        boxShadow: cardShadow,
        fontFamily: "'Raleway', 'Segoe UI', sans-serif",
        animation: 'opsQReveal 0.28s ease-out both',
      }}>
      {!isAdmin && (
        <div style={{
          padding: '7px 12px 6px',
          background: isDarkMode ? 'rgba(135,243,243,0.03)' : 'rgba(13,47,96,0.025)',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiAlertCircle size={10} color={totalPending > 0 ? colours.orange : colours.green} strokeWidth={2.2} />
            <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.highlight, letterSpacing: '0.3px', lineHeight: 1.1 }}>
              My Transactions
            </span>
            {demoModeActive && (
              <span style={{
                fontSize: 7, fontWeight: 700, color: textMuted,
                padding: '1px 4px',
                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(13,47,96,0.15)'}`,
                lineHeight: 1.1,
              }}>
                demo
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Accounts pipeline summary row ── */}
      {isAdmin && (
        <div
          onClick={() => setPipelineExpanded(prev => !prev)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 14px',
            height: 32,
            boxSizing: 'border-box',
            cursor: 'pointer',
            background: isDarkMode ? colours.darkBlue : colours.grey,
            borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
            boxShadow: isDarkMode
              ? '0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 1px 4px rgba(0, 0, 0, 0.04)',
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(6, 23, 51, 0.9)' : '#ebebed'; }}
          onMouseLeave={e => { e.currentTarget.style.background = isDarkMode ? colours.darkBlue : colours.grey; }}
        >
          <FiChevronDown
            size={10}
            color={isDarkMode ? colours.accent : colours.highlight}
            style={{
              flexShrink: 0, opacity: 0.7,
              transition: 'transform 0.2s ease',
              transform: pipelineExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
          <SiAsana size={9} color={isDarkMode ? colours.accent : colours.highlight} style={{ opacity: 0.7, flexShrink: 0 }} />
          <span style={{
            fontSize: 9, fontWeight: 600,
            color: isDarkMode ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.5)',
            textTransform: 'uppercase', letterSpacing: '0.5px',
            flexShrink: 0,
          }}>
            Accounts pipeline
          </span>

          {asanaSections.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {asanaSections.filter(s => s.count > 0).map(s => {
                const meta = asanaSectionMeta(s.name);
                return (
                  <span
                    key={s.gid}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 7px',
                      fontSize: 8, fontWeight: 500,
                      color: isDarkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.colour, flexShrink: 0 }} />
                    {meta.shortLabel}
                    <span style={{ fontWeight: 700, fontSize: 8 }}>{s.count}</span>
                  </span>
                );
              })}
            </div>
          ) : !asanaError ? (
            <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)', fontStyle: 'italic' }}>loading…</span>
          ) : null}

          {asanaError && !demoModeActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              <FiAlertCircle size={8} color={colours.orange} style={{ opacity: 0.6 }} />
              <span style={{ fontSize: 8, color: textMuted, fontStyle: 'italic' }}>sync unavailable</span>
            </div>
          )}

          {asanaSections.length > 0 && (
            <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)', marginLeft: 'auto', flexShrink: 0 }}>
              {asanaSections.reduce((sum, s) => sum + s.count, 0)} total
            </span>
          )}
          {demoModeActive && (
            <span style={{
              fontSize: 7,
              fontWeight: 700,
              color: textMuted,
              padding: '1px 4px',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(13,47,96,0.12)'}`,
              lineHeight: 1.1,
              flexShrink: 0,
            }}>
              demo
            </span>
          )}
          {recentCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowRecent(prev => !prev);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 8,
                color: textMuted,
                padding: '1px 4px',
                fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                lineHeight: 1.1,
                flexShrink: 0,
              }}
            >
              {showRecent ? 'hide' : `${recentCount} recent`}
            </button>
          )}
        </div>
      )}

      {/* ── Expanded pipeline silos (all stages side by side, max 10 each) ── */}
      {isAdmin && pipelineExpanded && asanaSections.filter(s => s.count > 0).length > 0 && (
        <div style={{
          display: 'flex', gap: 0,
          padding: '0',
          background: isDarkMode ? 'rgba(6, 23, 51, 0.4)' : 'rgba(13, 47, 96, 0.015)',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
          animation: 'opsTicketExpand 0.14s ease-out',
          overflow: 'hidden',
        }}>
          {asanaSections.filter(s => s.count > 0).map((s, siloIdx) => {
            const meta = asanaSectionMeta(s.name);
            const sectionTasks = (asanaTasksBySection.get(s.name) || []).slice(0, 10);
            const total = (asanaTasksBySection.get(s.name) || []).length;
            return (
              <div
                key={s.gid}
                style={{
                  flex: 1, minWidth: 0,
                  borderRight: siloIdx < asanaSections.filter(ss => ss.count > 0).length - 1
                    ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` : undefined,
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {/* Silo header */}
                <div style={{
                  padding: '5px 10px 4px',
                  borderBottom: `2px solid ${meta.colour}`,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.colour, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, fontWeight: 600, color: meta.colour, flex: 1 }}>{meta.shortLabel}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, color: meta.colour }}>{s.count}</span>
                </div>
                {/* Task cards */}
                <div style={{ padding: '4px 6px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {sectionTasks.map((t, idx) => (
                    <a
                      key={t.gid}
                      href={t.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => { e.stopPropagation(); if (!t.url) e.preventDefault(); }}
                      style={{
                        display: 'block',
                        padding: '3px 6px',
                        cursor: t.url ? 'pointer' : 'default',
                        transition: 'all 0.12s ease',
                        background: 'transparent',
                        textDecoration: 'none',
                        color: 'inherit',
                        animation: `opsItemCascade 0.18s ease-out both`,
                        animationDelay: `${idx * 20}ms`,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, position: 'relative' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 500, color: textPrimary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          flex: 1, minWidth: 0, lineHeight: 1.3,
                        }}>
                          {t.name}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (linkedAsanaGids.has(t.gid)) {
                              handleUnlinkAsanaTask(t.gid);
                            } else {
                              setLinkingTaskGid(prev => prev === t.gid ? null : t.gid);
                            }
                          }}
                          style={{ flexShrink: 0, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                          title={linkedAsanaGids.has(t.gid) ? 'Click to inspect or unlink this Asana task' : 'Click to inspect task ID and link to a V2 transaction'}
                        >
                          <SiAsana
                            size={7}
                            color={linkedAsanaGids.has(t.gid) ? colours.green : textMuted}
                            style={{ opacity: linkedAsanaGids.has(t.gid) ? 0.9 : 0.2, pointerEvents: 'none' }}
                          />
                        </span>
                        {/* Link picker dropdown */}
                        {linkingTaskGid === t.gid && (() => {
                          const linkableV2 = txnV2Pending.filter(v => v.lifecycle_status !== 'rejected');
                          // Sort matches first: matter_ref matches the task's extracted ref
                          const taskRef = t.matterRef?.toUpperCase();
                          const sorted = [...linkableV2].sort((a, b) => {
                            const aMatch = taskRef && a.matter_ref?.toUpperCase() === taskRef ? 0 : 1;
                            const bMatch = taskRef && b.matter_ref?.toUpperCase() === taskRef ? 0 : 1;
                            if (aMatch !== bMatch) return aMatch - bMatch;
                            const aPending = a.lifecycle_status === 'pending' ? 0 : 1;
                            const bPending = b.lifecycle_status === 'pending' ? 0 : 1;
                            if (aPending !== bPending) return aPending - bPending;
                            return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
                          });
                          return (
                            <div
                              ref={el => {
                                if (!el) return;
                                requestAnimationFrame(() => {
                                  const rect = el.getBoundingClientRect();
                                  if (rect.right > window.innerWidth - 8) {
                                    el.style.right = 'auto';
                                    el.style.left = `${-(rect.width + 8)}px`;
                                  }
                                  if (rect.left < 8) {
                                    el.style.right = 'auto';
                                    el.style.left = '0px';
                                  }
                                });
                              }}
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                right: -292,
                                bottom: 0,
                                zIndex: 250,
                                background: isDarkMode ? colours.darkBlue : '#fff',
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                                boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                                minWidth: 240, maxWidth: 280, maxHeight: 220, overflowY: 'auto',
                                padding: '0',
                                isolation: 'isolate',
                              }}
                            >
                              <div style={{ padding: '8px 10px 7px', borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.02)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontSize: 8, fontWeight: 700, color: textPrimary, textTransform: 'uppercase', letterSpacing: '0.3px', flex: 1 }}>
                                    Link Asana task
                                  </span>
                                  <button
                                    onClick={async e => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      try {
                                        await navigator.clipboard.writeText(t.gid);
                                        showToast(`Copied task ID ${t.gid}`, 'success');
                                      } catch {
                                        showToast('Failed to copy task ID', 'error');
                                      }
                                    }}
                                    style={{
                                      background: 'none',
                                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.12)'}`,
                                      borderRadius: 0,
                                      padding: '1px 6px',
                                      cursor: 'pointer',
                                      fontSize: 7,
                                      fontWeight: 600,
                                      color: textMuted,
                                      fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                      letterSpacing: '0.3px',
                                    }}
                                  >
                                    COPY ID
                                  </button>
                                </div>
                                <div style={{ fontSize: 8, color: textMuted, fontFamily: "'Consolas', 'Courier New', monospace", marginBottom: 2 }}>
                                  Task ID: {t.gid}
                                </div>
                                <div style={{ fontSize: 8, color: textMuted }}>
                                  Parsed ref: <span style={{ color: textPrimary, fontWeight: 600 }}>{t.matterRef || 'none found'}</span>
                                </div>
                              </div>
                              {sorted.length === 0 ? (
                                <div style={{ padding: '8px 10px', fontSize: 8, color: textMuted, fontStyle: 'italic' }}>
                                  No linkable V2 transactions
                                </div>
                              ) : sorted.map(v => {
                                const isMatch = taskRef && v.matter_ref?.toUpperCase() === taskRef;
                                const lifecycleLabel = v.lifecycle_status === 'left_in_client'
                                  ? 'Left'
                                  : v.lifecycle_status === 'approved'
                                    ? 'Approved'
                                    : v.lifecycle_status === 'pending'
                                      ? 'Pending'
                                      : v.lifecycle_status || 'Open';
                                return (
                                  <div
                                    key={v.id}
                                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleLinkAsanaTask(t.gid, t.url, v.id); }}
                                    onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    style={{
                                      padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                      background: 'transparent', transition: 'background 0.1s',
                                    }}
                                  >
                                    {isMatch && <span style={{ width: 4, height: 4, borderRadius: '50%', background: colours.green, flexShrink: 0 }} />}
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                      <span style={{ fontSize: 8, fontWeight: isMatch ? 700 : 500, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {v.matter_ref}
                                      </span>
                                      <span style={{ fontSize: 7, color: textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {lifecycleLabel} · £{v.amount.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      {(t.assignee || t.dueOn) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                          {t.assignee && <span style={{ fontSize: 8, color: textMuted, opacity: 0.7 }}>{t.assignee}</span>}
                          {t.dueOn && <span style={{ fontSize: 8, color: textMuted, opacity: 0.5 }}>· due {shortDate(t.dueOn)}</span>}
                        </div>
                      )}
                    </a>
                  ))}
                  {total > 10 && (
                    <span style={{ fontSize: 8, color: textMuted, opacity: 0.4, padding: '2px 6px', fontStyle: 'italic' }}>
                      +{total - 10} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Transaction approvals ──────────────────────────────────────────── */}
      {(isAdmin ? (txnPending.length > 0 || txnV2Pending.length > 0 || hasFallbackPreview) : (filteredTxn.length > 0 || filteredTxnV2.length > 0 || hasFallbackPreview)) && (
        <div>
          <div style={{
            padding: '6px 14px 7px',
            display: 'flex',
            alignItems: 'center',
            alignContent: 'center',
            gap: 3,
            flexWrap: 'wrap',
            minHeight: 36,
            boxSizing: 'border-box',
            borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(13,47,96,0.05)'}`,
            borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.09)' : 'rgba(13,47,96,0.09)'}`,
            background: isDarkMode ? 'rgba(2, 6, 23, 0.36)' : 'rgba(244, 244, 246, 0.62)',
            marginBottom: 8,
          }}>
            {(['today', 'yesterday', 'week', 'lastWeek', 'mtd'] as const).map(r => {
              const label = (
                r === 'today' ? 'Today'
                  : r === 'yesterday'
                    ? 'Yest'
                    : r === 'week'
                      ? 'Week'
                      : r === 'lastWeek'
                        ? 'Last wk'
                        : 'MTD'
              );
              const isActive = txnRange === r;
              const isCued = !isActive && txnFallbackHint && (
                (r === 'yesterday' && txnFallbackHint.range === 'yesterday') ||
                (r === 'week' && txnFallbackHint.range === 'week')
              );
              const cuedCount = isCued ? txnFallbackHint!.label.match(/\((\d+)\)/)?.[1] : null;
              return (
                <button
                  key={r}
                  onClick={() => setTxnRange(r)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isActive
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.22)' : 'rgba(13, 47, 96, 0.1)')
                      : (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.03)'),
                    border: `1px solid ${isActive ? (isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(13, 47, 96, 0.18)') : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.08)')}`,
                    cursor: 'pointer',
                    padding: '3px 8px',
                    fontSize: 9,
                    fontWeight: isActive ? 700 : isCued ? 700 : 600,
                    color: isActive ? accent : isCued ? accent : textMuted,
                    fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                    transition: 'all 0.12s ease',
                    letterSpacing: '0.2px',
                    lineHeight: 1.2,
                    minHeight: 22,
                    animation: isCued ? 'opsCuePulse 2.5s ease-in-out infinite' : undefined,
                  }}
                >
                  {label}{cuedCount ? ` (${cuedCount})` : ''}
                </button>
              );
            })}
            {isV2User && (
              <div style={{ display: 'flex', gap: 0, alignItems: 'center', marginLeft: 'auto' }}>
                {(['v1', 'v2'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setTxnVersion(v)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: txnVersion === v
                        ? (isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)')
                        : 'transparent',
                      border: `1px solid ${txnVersion === v ? (isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(13, 47, 96, 0.12)') : 'transparent'}`,
                      borderRadius: 0,
                      padding: '3px 8px',
                      cursor: 'pointer',
                      fontSize: 9,
                      fontWeight: txnVersion === v ? 700 : 600,
                      color: txnVersion === v ? accent : textMuted,
                      fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.2px',
                      transition: 'all 0.12s ease',
                      minHeight: 22,
                      lineHeight: 1.2,
                      opacity: txnVersion === v ? 1 : 0.5,
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '0 14px 8px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(13,47,96,0.09)'}`,
              background: isDarkMode ? colours.darkBlue : colours.grey,
              overflow: 'hidden',
            }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)'}`,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                padding: '8px 10px',
                background: isDarkMode ? colours.darkBlue : colours.grey,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: textMuted, letterSpacing: '0.2px' }}>
                  <FiArrowRight size={8} style={{ flexShrink: 0, opacity: 0.75 }} />
                  <span>Transactions</span>
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexWrap: 'wrap',
                minWidth: 0,
                padding: '6px 10px 8px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.06)'}`,
                background: isDarkMode ? colours.darkBlue : colours.grey,
              }}>
                {(txnVersion === 'v1' ? txnV1StatusOptions : txnV2StatusOptions).map(option => {
                  const isActive = txnVersion === 'v1'
                    ? txnV1StatusFilter === option.value
                    : txnV2StatusFilter === option.value;
                  return (
                    <button
                      key={`${txnVersion}-${option.value}`}
                      onClick={() => {
                        if (txnVersion === 'v1') {
                          setTxnV1StatusFilter(option.value as typeof txnV1StatusFilter);
                        } else {
                          setTxnV2StatusFilter(option.value as typeof txnV2StatusFilter);
                        }
                      }}
                      style={{
                        background: isActive
                          ? (isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)')
                          : 'transparent',
                        border: `1px solid ${isActive ? (isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(13, 47, 96, 0.12)') : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)')}`,
                        borderRadius: 0,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 9,
                        fontWeight: isActive ? 700 : 600,
                        color: isActive ? accent : textMuted,
                        fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                        letterSpacing: '0.2px',
                        transition: 'all 0.12s ease',
                        minHeight: 22,
                        lineHeight: 1.2,
                      }}
                    >
                      <span>{option.label}</span>
                      <span style={{ opacity: 0.55 }}>{option.count}</span>
                    </button>
                  );
                })}
                {isV2User && (
                  <div style={{ display: 'flex', gap: 0, alignItems: 'center', marginLeft: 'auto' }}>
                    {(['v1', 'v2'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setTxnVersion(v)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: txnVersion === v
                            ? (isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(13, 47, 96, 0.08)')
                            : 'transparent',
                          border: `1px solid ${txnVersion === v ? (isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(13, 47, 96, 0.12)') : 'transparent'}`,
                          borderRadius: 0,
                          padding: '3px 8px',
                          cursor: 'pointer',
                          fontSize: 9,
                          fontWeight: txnVersion === v ? 700 : 600,
                          color: txnVersion === v ? accent : textMuted,
                          fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.2px',
                          transition: 'all 0.12s ease',
                          minHeight: 22,
                          lineHeight: 1.2,
                          opacity: txnVersion === v ? 1 : 0.5,
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                minWidth: 0,
                padding: '8px 10px',
                background: isDarkMode ? colours.darkBlue : colours.highlightBlue,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: textMuted, letterSpacing: '0.2px' }}>
                  <SiStripe size={11} style={{ color: '#635bff', flexShrink: 0, opacity: 0.75 }} />
                  <span>Payments</span>
                </span>
                {displayedStripeRecent.length > 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto', minWidth: 0 }}>
                    <span style={{ fontSize: 8, color: textMuted, opacity: 0.5 }}>{displayedStripeRecent.length}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, textAlign: 'right', marginLeft: 'auto' }}>
                      {formatAmount(displayedStripeRecent.reduce((sum, p) => sum + (p.amount || 0), 0))}
                    </span>
                  </div>
                )}
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                minWidth: 0,
                padding: '6px 10px 8px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.06)'}`,
                background: isDarkMode ? colours.darkBlue : colours.highlightBlue,
              }}>
                {paymentsPreviewMode && txnFallbackHint && (
                  <span style={{ fontSize: 8, color: textMuted, opacity: 0.55 }}>
                    Auto showing {fallbackPeriodLabel?.toLowerCase()}
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: paymentsPreviewMode && txnFallbackHint ? 'auto' : 0 }}>
                  <button
                    onClick={() => { setShowPaymentLookup(true); setLookupResults([]); setPaymentNotFound(false); setPaymentQuery(''); }}
                    style={{
                      background: 'none',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)'}`,
                      borderRadius: 0,
                      padding: '3px 8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      color: textMuted,
                      fontSize: 9,
                      fontWeight: 600,
                      fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                      letterSpacing: '0.2px',
                      transition: 'all 0.12s ease',
                      minHeight: 22,
                      lineHeight: 1.2,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)'; e.currentTarget.style.color = textMuted; }}
                  >
                    <FiSearch size={8} /> LOOKUP
                  </button>
                  <button
                    onClick={() => { showToast('Request payment flow coming soon', 'info'); }}
                    style={{
                      background: 'none',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)'}`,
                      borderRadius: 0,
                      padding: '3px 8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      color: textMuted,
                      fontSize: 9,
                      fontWeight: 600,
                      fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                      letterSpacing: '0.2px',
                      transition: 'all 0.12s ease',
                      minHeight: 22,
                      lineHeight: 1.2,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)'; e.currentTarget.style.color = textMuted; }}
                  >
                    <FiCreditCard size={8} /> REQUEST
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* ── V1 transaction cards ──────────────────────── */}
          {txnVersion === 'v1' && (
          <>
          {renderedTxn.length === 0 ? (
            <div style={{ padding: '4px 14px 8px' }}>
              <div style={{ padding: '4px 0', textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: textMuted, opacity: 0.6 }}>No transactions</span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '2px 14px 6px', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 1, filter: 'none', pointerEvents: 'auto' }}>
              {renderedTxnGroups.map(group => (
                <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.32px', textTransform: 'uppercase', color: textMuted }}>
                      {group.label}
                    </span>
                    <span style={{ flex: 1, height: 1, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.08)' }} />
                    <span style={{ fontSize: 8, color: textMuted, opacity: 0.6 }}>{group.items.length}</span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 4,
                  }}>
              {group.items.map(item => {
                const txnId = `txn-${item.transaction_id}`;
                const isExpanded = expandedId === txnId;
                const isActioning = actioningId === txnId;
                const isConfirming = confirmingTxn?.transaction_id === item.transaction_id;
                const asanaTask = isAdmin ? asanaByRef.get((item.matter_ref || '').toUpperCase()) : undefined;
                const asanaMeta = asanaTask ? asanaSectionMeta(asanaTask.section) : null;
                const showOrphan = isAdmin && !asanaTask && asanaTasks.length > 0 && item.status === 'transfer';

                const statusLabel = item.status === 'transfer' ? 'Approved' : item.status === 'processed' ? 'Processed' : item.status === 'leave_in_client' ? 'Left in client' : 'Pending';
                const statusColour = item.status === 'transfer' ? colours.green : item.status === 'processed' ? colours.blue : item.status === 'leave_in_client' ? colours.greyText : colours.orange;

                return (
                  <React.Fragment key={txnId}>
                    {/* ── Compact card ──────────────────────────── */}
                    <div
                      onClick={() => toggleExpand(txnId)}
                      style={{
                        borderLeft: `2px solid ${statusColour}`,
                        border: `1px solid ${isExpanded ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)')}`,
                        borderLeftWidth: 2,
                        borderLeftColor: statusColour,
                        padding: '5px 8px',
                        cursor: 'pointer',
                        background: isExpanded ? hoverBg : (isDarkMode ? colours.darkBlue : colours.sectionBackground),
                        transition: 'all 0.14s ease',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = hoverBg;
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)';
                        e.currentTarget.style.borderLeftColor = statusColour;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isExpanded ? hoverBg : (isDarkMode ? colours.darkBlue : colours.sectionBackground);
                        e.currentTarget.style.borderColor = isExpanded ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)');
                        e.currentTarget.style.borderLeftColor = statusColour;
                      }}
                    >
                      {/* Top: ref + amount */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.matter_ref}
                          </span>
                          {asanaMeta && asanaTask?.url && (
                            <a
                              href={asanaTask.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title={`Asana: ${asanaMeta.shortLabel}`}
                              style={{ display: 'inline-flex', flexShrink: 0, color: asanaMeta.colour, opacity: 0.8 }}
                            >
                              <SiAsana size={8} />
                            </a>
                          )}
                          {showOrphan && (
                            <FiAlertCircle size={7} color={colours.cta} style={{ opacity: 0.6, flexShrink: 0 }} title="Not in Asana" />
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {formatAmount(item.amount)}
                        </span>
                      </div>
                      {/* Bottom: FE · source · status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        {item.fe && <span style={{ fontSize: 9, color: textMuted }}>{item.fe}</span>}
                        {item.fe && <span style={{ fontSize: 9, color: textMuted, opacity: 0.4 }}>·</span>}
                        <span style={{ fontSize: 9, color: textMuted }}>
                          {item.from_client ? 'Client' : (item.money_sender ? item.money_sender.split(' ')[0] : '3rd')}
                        </span>
                      </div>
                    </div>

                    {/* ── Expanded detail ──────────────────────────── */}
                    {isExpanded && (
                      <div style={{
                        gridColumn: '1 / -1',
                        padding: '6px 10px 8px 14px',
                        background: hoverBg,
                        border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.08)'}`,
                        borderLeft: `2px solid ${statusColour}`,
                        animation: 'opsTicketExpand 0.14s ease-out',
                        marginBottom: 2,
                      }}>
                        {/* Context line */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: textMuted, marginBottom: 4 }}>
                          {item.matter_description && (
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.matter_description}</span>
                          )}
                          {item.transaction_date && (
                            <>
                              {item.matter_description && <span style={{ opacity: 0.4 }}>·</span>}
                              <span style={{ flexShrink: 0 }}>{shortDate(item.transaction_date)}</span>
                            </>
                          )}
                          {item.type && (
                            <>
                              <span style={{ opacity: 0.4 }}>·</span>
                              <span style={{ flexShrink: 0, textTransform: 'uppercase', fontSize: 8, fontWeight: 600, letterSpacing: '0.3px' }}>{item.type}</span>
                            </>
                          )}
                        </div>

                        {/* Asana lifecycle */}
                        {(asanaTask || showOrphan) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            {asanaTask ? (
                              <>
                                <SiAsana size={9} color={asanaMeta!.colour} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase', color: asanaMeta!.colour }}>
                                  {asanaMeta!.shortLabel}
                                </span>
                                {asanaTask.assignee && <span style={{ fontSize: 9, color: textMuted }}>· {asanaTask.assignee}</span>}
                                {asanaTask.url && (
                                  <a
                                    href={asanaTask.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in Asana"
                                    onClick={e => e.stopPropagation()}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: accent, opacity: 0.8, textDecoration: 'none', fontSize: 9 }}
                                  >
                                    Open in Asana <FiExternalLink size={8} />
                                  </a>
                                )}
                              </>
                            ) : (
                              <>
                                <FiAlertCircle size={9} color={colours.cta} style={{ opacity: 0.7, flexShrink: 0 }} />
                                <span style={{ fontSize: 9, fontWeight: 600, color: colours.cta, opacity: 0.7 }}>
                                  Not in Asana — may need manual task
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Action: only for 'requested' status, admin only */}
                        {isAdmin && item.status === 'requested' && (
                          isConfirming ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', animation: 'opsTicketExpand 0.14s ease-out' }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: colours.orange, fontFamily: "'Raleway', 'Segoe UI', sans-serif" }}>
                                Approve {formatAmount(item.amount)} for {item.matter_ref}?
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmingTxn(null); handleTxnApprove(item); }}
                                disabled={isActioning}
                                style={{
                                  background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)',
                                  border: `1px solid ${colours.green}`,
                                  borderRadius: 0, padding: '4px 12px',
                                  cursor: isActioning ? 'wait' : 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  fontSize: 10, fontWeight: 600, color: colours.green,
                                  fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                  transition: 'all 0.15s ease', opacity: isActioning ? 0.5 : 1,
                                }}
                              >
                                <FiCheckCircle size={10} />
                                {isActioning ? 'Approving…' : 'Yes'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmingTxn(null); }}
                                style={{
                                  background: 'transparent',
                                  border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(13, 47, 96, 0.16)'}`,
                                  borderRadius: 0, padding: '4px 10px',
                                  cursor: 'pointer',
                                  fontSize: 10, fontWeight: 600, color: textMuted,
                                  fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                }}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmingTxn(item); }}
                              disabled={isActioning}
                              style={{
                                background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)',
                                border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.28)' : 'rgba(32, 178, 108, 0.2)'}`,
                                borderRadius: 0, padding: '4px 12px',
                                cursor: isActioning ? 'wait' : 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 10, fontWeight: 600, color: colours.green,
                                fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                transition: 'all 0.15s ease', opacity: isActioning ? 0.5 : 1,
                              }}
                              onMouseEnter={e => { if (!isActioning) { e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.14)' : 'rgba(32, 178, 108, 0.1)'; } }}
                              onMouseLeave={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)'; }}
                            >
                              <FiArrowUpRight size={10} />
                              {isActioning ? 'Approving…' : 'Approve transfer'}
                            </button>
                          )
                        )}

                        {/* Completed status feedback */}
                        {item.status === 'transfer' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colours.green }}>
                            <FiCheckCircle size={10} />
                            <span style={{ fontWeight: 600 }}>Transfer approved</span>
                          </div>
                        )}
                        {item.status === 'leave_in_client' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: textMuted }}>
                            <FiCheckCircle size={10} />
                            <span style={{ fontWeight: 600 }}>Left in client account</span>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
          </>
          )}

          {/* ── Asana sync suggestions ─────────────────────── */}
          {txnVersion === 'v2' && syncSuggestions.length > 0 && (
            <div style={{ padding: '2px 14px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {syncSuggestions.map(({ item, asanaTask, implied }) => {
                const isActioning = actioningV2Id === item.id;
                const meta = asanaSectionMeta(asanaTask.section);
                return (
                  <div key={`sync-${item.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px',
                    borderLeft: `2px solid ${meta.colour}`,
                    background: isDarkMode ? 'rgba(135,243,243,0.04)' : 'rgba(54,144,206,0.04)',
                    animation: 'opsV2Drop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                  }}>
                    {/* Asana icon + move indicator */}
                    <SiAsana size={10} style={{ color: meta.colour, flexShrink: 0 }} />
                    <FiArrowRight size={8} style={{ color: textMuted, flexShrink: 0, opacity: 0.5 }} />

                    {/* Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.matter_ref}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {formatAmount(item.amount)}
                      </span>
                      <span style={{ fontSize: 9, color: textMuted, opacity: 0.4 }}>·</span>
                      <span style={{
                        fontSize: 8, fontWeight: 700, color: meta.colour,
                        textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap',
                      }}>
                        {meta.shortLabel}
                      </span>
                    </div>

                    {/* Confirm / Dismiss */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <button
                        onClick={() => handleTxnV2Action(item, implied.action)}
                        disabled={isActioning}
                        style={{
                          background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)',
                          border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.2)'}`,
                          borderRadius: 0, padding: '2px 8px',
                          cursor: isActioning ? 'wait' : 'pointer',
                          fontSize: 8, fontWeight: 700, color: colours.green,
                          fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                          textTransform: 'uppercase', letterSpacing: '0.3px',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          opacity: isActioning ? 0.5 : 1,
                          transition: 'all 0.12s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)'; }}
                      >
                        <FiCheckCircle size={8} />
                        {isActioning ? '…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setDismissedSyncs(prev => new Set(prev).add(item.id))}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13, 47, 96, 0.1)'}`,
                          borderRadius: 0, padding: '2px 6px',
                          cursor: 'pointer', fontSize: 8, fontWeight: 600, color: textMuted,
                          fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                          textTransform: 'uppercase', letterSpacing: '0.3px',
                          transition: 'all 0.12s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(13, 47, 96, 0.18)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13, 47, 96, 0.1)'; }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── V2 transaction cards ──────────────────────── */}
          {txnVersion === 'v2' && (
              <div style={{ padding: '2px 14px 6px' }}>
                <div style={{
                  display: 'flex',
                  gap: 0,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(13,47,96,0.09)'}`,
                    background: isDarkMode ? colours.darkBlue : colours.grey,
                  overflow: 'hidden',
                }}>
                {/* Left: V2 transaction cards */}
                <div style={{ flex: '1 1 0', minWidth: 0, padding: '8px', background: isDarkMode ? colours.darkBlue : colours.sectionBackground }}>
                {renderedTxnV2.length === 0 && syncSuggestions.length === 0 ? (
                  <div style={{ padding: '4px 0 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, color: textMuted, opacity: 0.6 }}>No V2 transactions</span>
                  </div>
                ) : (
                <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 1, filter: 'none', pointerEvents: 'auto' }}>
                {renderedTxnV2Groups.map(group => (
                  <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.32px', textTransform: 'uppercase', color: textMuted }}>
                        {group.label}
                      </span>
                      <span style={{ flex: 1, height: 1, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.08)' }} />
                      <span style={{ fontSize: 8, color: textMuted, opacity: 0.6 }}>{group.items.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
                {group.items.map(item => {
                  const v2Id = `v2-${item.id}`;
                  const isExpanded = expandedId === v2Id;
                  const isActioning = actioningV2Id === item.id;
                  const isConfirming = confirmingV2?.id === item.id;
                  const isPending = item.lifecycle_status === 'pending';
                  const isNew = newV2Ids.has(item.id);
                  const isDebtTransfer = item.source_type === 'aged_debt';
                  const transferDisplayDate = getTransferSortDate(item);

                  const statusMap: Record<string, { label: string; colour: string }> = {
                    approved: { label: 'Approved', colour: colours.green },
                    left_in_client: { label: 'Left in client', colour: colours.greyText },
                    rejected: { label: 'Rejected', colour: colours.cta },
                    pending: { label: 'Pending', colour: colours.orange },
                  };
                  const st = statusMap[item.lifecycle_status || 'pending'] || statusMap.pending;

                  return (
                    <React.Fragment key={v2Id}>
                      {/* ── Card face ── */}
                      <div
                        data-ops-lookup-id={`transaction-v2-${item.id}`}
                        onClick={() => toggleExpand(v2Id)}
                        style={{
                          border: `1px solid ${isExpanded ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)')}`,
                          borderLeftWidth: 2,
                          borderLeftColor: st.colour,
                          padding: '5px 8px',
                          cursor: 'pointer',
                          background: isNew ? (isDarkMode ? colours.dark.cardHover : colours.highlightBlue) : (isExpanded ? hoverBg : (isDarkMode ? colours.darkBlue : colours.sectionBackground)),
                          transition: 'all 0.14s ease',
                          boxShadow: lookupHighlight?.kind === 'transaction-v2' && lookupHighlight.id === String(item.id)
                            ? `0 0 0 1px ${accent}, inset 0 0 0 1px ${accent}`
                            : 'none',
                          ...(isNew ? { animation: 'opsV2Drop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' } : {}),
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = hoverBg;
                          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)';
                          e.currentTarget.style.borderLeftColor = st.colour;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = isNew ? (isDarkMode ? colours.dark.cardHover : colours.highlightBlue) : (isExpanded ? hoverBg : (isDarkMode ? colours.darkBlue : colours.sectionBackground));
                          e.currentTarget.style.borderColor = isExpanded ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)');
                          e.currentTarget.style.borderLeftColor = st.colour;
                        }}
                      >
                        {/* Top: ref + amount */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.matter_ref}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {formatAmount(item.amount)}
                          </span>
                        </div>
                        {/* Bottom: FE · source · status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                          {item.fee_earner && <span style={{ fontSize: 9, color: textMuted }}>{item.fee_earner}</span>}
                          {item.fee_earner && <span style={{ fontSize: 9, color: textMuted, opacity: 0.4 }}>·</span>}
                          <span style={{ fontSize: 9, color: textMuted }}>
                            {item.from_client ? 'Client' : (item.money_sender ? item.money_sender.split(' ')[0] : '3rd')}
                          </span>
                          {isDebtTransfer && (
                            <>
                              <span style={{ fontSize: 9, color: textMuted, opacity: 0.4 }}>·</span>
                              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', color: colours.cta }}>
                                Debt
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ── Expand detail ── */}
                      {isExpanded && (
                        <div style={{
                          gridColumn: '1 / -1',
                          padding: '6px 10px 8px 14px',
                          background: hoverBg,
                          border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.08)'}`,
                          borderLeft: `2px solid ${st.colour}`,
                          animation: 'opsTicketExpand 0.14s ease-out',
                          marginBottom: 2,
                        }}>
                          {/* Context line */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: textMuted, marginBottom: 4 }}>
                            {item.matter_description && (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.matter_description}</span>
                            )}
                            {transferDisplayDate && (
                              <>
                                {item.matter_description && <span style={{ opacity: 0.4 }}>·</span>}
                                <span style={{ flexShrink: 0 }}>{shortDate(transferDisplayDate)}</span>
                              </>
                            )}
                            {isDebtTransfer && (
                              <>
                                <span style={{ opacity: 0.4 }}>·</span>
                                <span style={{ flexShrink: 0, color: colours.cta, fontWeight: 600 }}>From aged debt</span>
                              </>
                            )}
                            {item.transaction_type && (
                              <>
                                <span style={{ opacity: 0.4 }}>·</span>
                                <span style={{ flexShrink: 0, textTransform: 'uppercase', fontSize: 8, fontWeight: 600, letterSpacing: '0.3px' }}>{item.transaction_type}</span>
                              </>
                            )}
                          </div>
                          {item.notes && (
                            <div style={{ fontSize: 9, color: textMuted, marginTop: 2, fontStyle: 'italic' }}>{item.notes}</div>
                          )}

                          {/* Action: pending items (admin) */}
                          {isAdmin && isPending && (
                            isConfirming ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', animation: 'opsTicketExpand 0.14s ease-out' }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: colours.orange, fontFamily: "'Raleway', 'Segoe UI', sans-serif" }}>
                                  Approve {formatAmount(item.amount)} for {item.matter_ref}?
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmingV2(null); handleTxnV2Action(item, 'approve'); }}
                                  disabled={isActioning}
                                  style={{
                                    background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)',
                                    border: `1px solid ${colours.green}`,
                                    borderRadius: 0, padding: '4px 12px',
                                    cursor: isActioning ? 'wait' : 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    fontSize: 10, fontWeight: 600, color: colours.green,
                                    fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                    transition: 'all 0.15s ease', opacity: isActioning ? 0.5 : 1,
                                  }}
                                >
                                  <FiCheckCircle size={10} />
                                  {isActioning ? 'Approving…' : 'Yes'}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmingV2(null); }}
                                  style={{
                                    background: 'transparent',
                                    border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(13, 47, 96, 0.16)'}`,
                                    borderRadius: 0, padding: '4px 10px',
                                    cursor: 'pointer',
                                    fontSize: 10, fontWeight: 600, color: textMuted,
                                    fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                  }}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmingV2(item); }}
                                disabled={isActioning}
                                style={{
                                  background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)',
                                  border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.28)' : 'rgba(32, 178, 108, 0.2)'}`,
                                  borderRadius: 0, padding: '4px 12px', marginTop: 4,
                                  cursor: isActioning ? 'wait' : 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  fontSize: 10, fontWeight: 600, color: colours.green,
                                  fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                  transition: 'all 0.15s ease', opacity: isActioning ? 0.5 : 1,
                                }}
                                onMouseEnter={e => { if (!isActioning) { e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.14)' : 'rgba(32, 178, 108, 0.1)'; } }}
                                onMouseLeave={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)'; }}
                              >
                                <FiArrowUpRight size={10} />
                                {isActioning ? 'Approving…' : 'Approve transfer'}
                              </button>
                            )
                          )}

                          {/* Completed status feedback */}
                          {item.lifecycle_status === 'approved' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colours.green, marginTop: 4 }}>
                              <FiCheckCircle size={10} />
                              <span style={{ fontWeight: 600 }}>Transfer approved</span>
                            </div>
                          )}
                          {item.lifecycle_status === 'left_in_client' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: textMuted, marginTop: 4 }}>
                              <FiCheckCircle size={10} />
                              <span style={{ fontWeight: 600 }}>Left in client account</span>
                            </div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                    </div>
                  </div>
                ))}
                </div>
                </div>
                )}
                </div>
                {/* Right: Payments ledger — 50/50 split, stretches to match transactions */}
                <div style={{
                  flex: '1 1 0', minWidth: 0,
                  borderLeft: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(13,47,96,0.09)'}`,
                  padding: '8px', alignSelf: 'stretch',
                  display: 'flex', flexDirection: 'column',
                  minHeight: 50,
                  background: isDarkMode ? colours.darkBlue : colours.highlightBlue,
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                    position: 'relative',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)'}`,
                    background: isDarkMode ? colours.darkBlue : colours.sectionBackground,
                  }}>
                    {/* Payment rows — fills available height, scrolls if needed */}
                    <div data-ops-payment-list="true" style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 0', opacity: 1, filter: 'none', pointerEvents: 'auto' }}>
                      {renderedStripeRecent.map(p => {
                        const clientName = [p.firstName, p.lastName].filter(Boolean).join(' ');
                        const statusColour = p.paymentStatus === 'succeeded' ? colours.green
                          : p.paymentStatus === 'failed' ? colours.cta : colours.orange;
                        const paymentMethod = p.paymentMethod || 'Card';
                        const paymentMethodNormalised = paymentMethod.toLowerCase();
                        const isBankMethod = paymentMethodNormalised.includes('bank') || paymentMethodNormalised.includes('bacs') || paymentMethodNormalised.includes('transfer');
                        const paymentReference = p.paymentReference || p.instructionRef || (p.paymentIntentId || p.id).slice(-12);
                        return (
                          <div
                            key={p.id}
                            data-ops-lookup-id={`payment-${p.id}`}
                            onClick={() => setSelectedStripeItem(p)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '44px 44px minmax(0, 1fr) 42px 110px 80px',
                              alignItems: 'center',
                              columnGap: 6,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              background: 'transparent',
                              transition: 'all 0.12s ease',
                              boxShadow: lookupHighlight?.kind === 'payment' && lookupHighlight.id === p.id
                                ? `inset 0 0 0 1px ${accent}`
                                : 'none',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <span
                              title={p.paymentStatus === 'succeeded' ? 'Paid' : p.paymentStatus === 'failed' ? 'Failed' : 'Pending'}
                              aria-label={p.paymentStatus === 'succeeded' ? 'Paid' : p.paymentStatus === 'failed' ? 'Failed' : 'Pending'}
                              style={{
                                fontSize: 7,
                                fontWeight: 700,
                                letterSpacing: '0.3px',
                                textTransform: 'uppercase',
                                color: statusColour,
                                flexShrink: 0,
                                textAlign: 'left',
                                display: 'inline-flex',
                                alignItems: 'center',
                                minHeight: 14,
                              }}
                            >
                              {p.paymentStatus === 'succeeded' ? (
                                <FiCheck size={10} strokeWidth={3} />
                              ) : p.paymentStatus === 'failed' ? (
                                'Failed'
                              ) : (
                                <FiClock size={10} strokeWidth={2.2} />
                              )}
                            </span>
                            <span style={{
                              fontSize: 7, color: textMuted, opacity: 0.55,
                              whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                            }}>
                              {shortDate(p.createdAt)}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 0', minWidth: 0 }}>
                              {clientName || p.instructionRef || '—'}
                            </span>
                            <span style={{
                              fontSize: 7,
                              color: textMuted,
                              opacity: 0.72,
                              whiteSpace: 'nowrap',
                              textAlign: 'left',
                              minWidth: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}>
                              {isBankMethod ? <FiBriefcase size={9} /> : <FiCreditCard size={9} />}
                              <span>{paymentMethod}</span>
                            </span>
                            <span style={{
                              fontSize: 7, color: textMuted, opacity: 0.5,
                              fontFamily: "'Consolas', 'Courier New', monospace",
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              minWidth: 0,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {paymentReference}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', textAlign: 'right', minWidth: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {p.amount != null ? formatAmount(p.amount, p.currency) : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {renderedStripeRecent.length === 0 && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 8px' }}>
                        <span style={{ fontSize: 9, color: textMuted, opacity: 0.4, fontStyle: 'italic' }}>No payments in range</span>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
          )}
        </div>
      )}

      {/* Old Asana pipeline section removed — promoted to sub-header bar above */}

      {/* ── User debts (from V2 aged debts) — ticket style ────────────── */}
      {isV2User && filteredDebts.length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${rowBorder}`, paddingTop: 8 }}>
          <div style={{ padding: '2px 14px 3px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FiAlertCircle size={10} style={{ color: accent, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, letterSpacing: '0.2px' }}>
              Aged debt suggestions
            </span>
            <span style={{ fontSize: 8, color: textMuted, opacity: 0.5 }}>{filteredDebts.length}</span>
            {(() => {
              const actionRequiredCount = filteredDebts.filter(d => {
                const debtStatus = d.lifecycle_status || 'pending';
                return debtStatus === 'pending' || debtStatus === 'rejected';
              }).length;
              return actionRequiredCount > 0 ? (
                <span style={{ fontSize: 8, fontWeight: 700, color: textMuted, opacity: 0.78, letterSpacing: '0.2px', textTransform: 'uppercase' as const }}>
                  {actionRequiredCount} need{actionRequiredCount === 1 ? 's' : ''} action
                </span>
              ) : null;
            })()}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: textMuted }}>
                Owed {formatAmount(filteredDebts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0))}
              </span>
              <span style={{ fontSize: 8, fontWeight: 700, color: accent, letterSpacing: '0.2px', textTransform: 'uppercase' as const }}>
                Can transfer {formatAmount(filteredDebts.reduce((sum, d) => sum + getDebtTransferMeta(d).transferableAmount, 0))}
              </span>
            </div>
          </div>
          <div style={{ padding: '2px 14px 6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {renderedDebtGroups.map(group => (
                <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.32px', textTransform: 'uppercase', color: textMuted }}>
                      {group.label}
                    </span>
                    <span style={{ flex: 1, height: 1, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.08)' }} />
                    <span style={{ fontSize: 8, color: textMuted, opacity: 0.6 }}>{group.items.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
                    {group.items.map(item => {
                      const debtId = `debt-${item.id}`;
                      const isExpanded = expandedId === debtId;
                      const debtStatus = item.lifecycle_status || 'pending';
                      const debtMeta = getDebtTransferMeta(item);
                      const stage = getDebtStageMeta(debtStatus, isDarkMode);
                      const debtCardBg = debtMeta.queueable
                        ? (isDarkMode ? 'rgba(135,243,243,0.06)' : 'rgba(54,144,206,0.05)')
                        : (isDarkMode ? 'rgba(160,160,160,0.09)' : 'rgba(107,107,107,0.08)');
                      const debtCardHoverBg = debtMeta.queueable
                        ? (isDarkMode ? 'rgba(135,243,243,0.11)' : 'rgba(54,144,206,0.09)')
                        : (isDarkMode ? 'rgba(160,160,160,0.14)' : 'rgba(107,107,107,0.12)');
                      const contextBits = [
                        item.matter_description,
                        item.transaction_date ? shortDate(item.transaction_date) : null,
                        item.created_by ? `by ${item.created_by}` : null,
                      ].filter(Boolean);

                      return (
                        <React.Fragment key={debtId}>
                          <div
                            data-ops-lookup-id={`debt-${item.id}`}
                            onClick={() => toggleExpand(debtId)}
                            style={{
                              border: `1px solid ${isExpanded ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)')}`,
                              borderLeftWidth: 2,
                              borderLeftColor: stage.colour,
                              padding: '5px 8px',
                              cursor: 'pointer',
                              background: isExpanded ? debtCardHoverBg : debtCardBg,
                              transition: 'all 0.14s ease',
                              boxShadow: lookupHighlight?.kind === 'debt' && lookupHighlight.id === String(item.id)
                                ? `0 0 0 1px ${accent}, inset 0 0 0 1px ${accent}`
                                : 'none',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = debtCardHoverBg;
                              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)';
                              e.currentTarget.style.borderLeftColor = stage.colour;
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = isExpanded ? debtCardHoverBg : debtCardBg;
                              e.currentTarget.style.borderColor = isExpanded ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)') : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(13,47,96,0.05)');
                              e.currentTarget.style.borderLeftColor = stage.colour;
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.matter_ref}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {formatAmount(item.amount)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                              {item.fee_earner && <span style={{ fontSize: 9, color: textMuted }}>{item.fee_earner}</span>}
                              {item.fee_earner && <span style={{ fontSize: 9, color: textMuted, opacity: 0.4 }}>·</span>}
                              <span style={{ fontSize: 9, color: textMuted }}>{debtMeta.sourceLabel}</span>
                              <span style={{ fontSize: 9, color: textMuted, opacity: 0.4 }}>·</span>
                              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', color: debtMeta.queueable ? accent : textMuted, marginLeft: 'auto', flexShrink: 0 }}>
                                {debtMeta.queueable ? `Transfer ${formatAmount(debtMeta.transferableAmount)}` : debtMeta.actionLabel}
                              </span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div style={{
                              gridColumn: '1 / -1',
                              padding: '6px 10px 8px 14px',
                              background: debtCardHoverBg,
                              border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.08)'}`,
                              borderLeft: `2px solid ${stage.colour}`,
                              animation: 'opsTicketExpand 0.14s ease-out',
                              marginBottom: 2,
                            }}>
                              {contextBits.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: textMuted, marginBottom: 4 }}>
                                  {contextBits.map((bit, index) => (
                                    <React.Fragment key={`${debtId}-context-${index}`}>
                                      {index > 0 && <span style={{ opacity: 0.4 }}>·</span>}
                                      <span style={{ overflow: index === 0 ? 'hidden' : 'visible', textOverflow: index === 0 ? 'ellipsis' : 'clip', whiteSpace: index === 0 ? 'nowrap' : 'normal', flexShrink: index === 0 ? 1 : 0 }}>
                                        {bit}
                                      </span>
                                    </React.Fragment>
                                  ))}
                                </div>
                              )}

                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 9, color: textMuted, marginBottom: 4 }}>
                                <span>Owed <span style={{ color: textPrimary, fontWeight: 600 }}>{formatAmount(item.amount)}</span></span>
                                <span>Can transfer <span style={{ color: debtMeta.queueable ? accent : textMuted, fontWeight: 600 }}>{debtMeta.transferableAmount > 0 ? formatAmount(debtMeta.transferableAmount) : '—'}</span></span>
                                <span>Source <span style={{ color: textPrimary, fontWeight: 600 }}>{debtMeta.sourceLabel}</span></span>
                              </div>

                              {item.notes && (
                                <div style={{ fontSize: 9, color: textMuted, marginTop: 2, fontStyle: 'italic' }}>{item.notes}</div>
                              )}
                              {item.action_notes && (
                                <div style={{ fontSize: 9, color: textMuted, marginTop: 2, fontStyle: 'italic' }}>{item.action_notes}</div>
                              )}

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                {debtMeta.queueable && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleConvertDebtToRequest(item); }}
                                    disabled={convertingDebtId === item.id}
                                    style={{
                                      background: colours.cta,
                                      border: 'none',
                                      borderRadius: 0,
                                      padding: '4px 10px',
                                      cursor: convertingDebtId === item.id ? 'wait' : 'pointer',
                                      fontSize: 8,
                                      fontWeight: 700,
                                      color: '#fff',
                                      fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                      textTransform: 'uppercase' as const,
                                      letterSpacing: '0.24px',
                                      opacity: convertingDebtId === item.id ? 0.65 : 1,
                                    }}
                                  >
                                    {convertingDebtId === item.id ? 'Queueing…' : debtMeta.actionLabel}
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedDebtItem(item); }}
                                  style={{
                                    background: 'none', border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.1)'}`,
                                    borderRadius: 0, padding: '2px 8px',
                                    cursor: 'pointer', fontSize: 8, fontWeight: 600, color: textMuted,
                                    fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                                    textTransform: 'uppercase' as const, letterSpacing: '0.3px',
                                    transition: 'all 0.12s ease',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(13,47,96,0.18)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(13,47,96,0.1)'; }}
                                >
                                  View details
                                </button>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalPending === 0 && unmatchedAsanaTasks.length === 0 && !showRecent && !demoModeActive && (
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          {migrationRequired ? <FiAlertCircle size={11} color={colours.orange} /> : <FiCheckCircle size={11} color={colours.green} />}
          <span style={{ fontSize: 11, color: textMuted }}>
            {migrationRequired ? 'Payment operations setup required' : 'All operations cleared'}
          </span>
        </div>
      )}

      {/* Recent approvals (collapsible) — visually receded */}
      {isAdmin && showRecent && recentCount > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${rowBorder}`, paddingTop: 8, opacity: 0.55 }}>
          <div style={{ padding: '2px 14px 3px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FiCheckCircle size={10} style={{ color: colours.green, flexShrink: 0, opacity: 0.6 }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, letterSpacing: '0.2px' }}>
              Recently approved
            </span>
            <span style={{ fontSize: 8, color: textMuted, opacity: 0.5 }}>{recentCount}</span>
          </div>
          <div style={{ padding: '2px 14px 6px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 3 }}>
            {recent.map(item => {
              const clientName = [item.FirstName, item.LastName].filter(Boolean).join(' ') || '—';
              return (
                <div
                  key={item.id}
                  style={{
                    padding: '4px 8px',
                    fontSize: 10, color: textMuted,
                    opacity: 0.7,
                    borderLeft: `2px solid ${colours.green}`,
                    background: isDarkMode ? 'rgba(6, 23, 51, 0.25)' : 'rgba(13, 47, 96, 0.01)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(13,47,96,0.04)'}`,
                    borderLeftWidth: 2,
                    borderLeftColor: colours.green,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FiCheckCircle size={8} color={colours.green} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{clientName}</span>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: textPrimary, opacity: 0.7, marginTop: 1 }}>
                    {formatAmount(item.amount, item.currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Team call stream (admin only — side-by-side) ────────── */}
      {isAdmin && recentCalls.length > 0 && (() => {
        const externalCalls = recentCalls.filter(c => !c.is_internal);
        const internalCalls = recentCalls.filter(c => c.is_internal);

        const renderStreamRow = (call: DubberCallItem) => {
          const isInbound = call.call_type === 'inbound';
          const party = isInbound
            ? (call.from_label || call.from_party || '—')
            : (call.to_label || call.to_party || '—');
          const teamLabel = call.matched_team_initials || '—';
          const mins = call.duration_seconds != null ? Math.floor(call.duration_seconds / 60) : null;
          const secs = call.duration_seconds != null ? call.duration_seconds % 60 : null;
          const durationText = mins != null ? `${mins}:${String(secs).padStart(2, '0')}` : '—';
          const callTime = call.start_time_utc ? new Date(call.start_time_utc) : null;
          const timeLabel = callTime
            ? callTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : '—';
          const sentimentScore = call.document_sentiment_score;
          const sentimentColour = sentimentScore != null
            ? (sentimentScore >= 0.6 ? colours.green : sentimentScore <= 0.4 ? colours.cta : colours.orange)
            : colours.subtleGrey;
          const dirColour = isInbound ? colours.green : colours.blue;
          return (
            <div
              key={call.recording_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2px 24px minmax(0, 1fr) 34px 32px',
                alignItems: 'center',
                columnGap: 4,
                padding: '3px 6px',
                background: 'transparent',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ width: 2, height: '100%', minHeight: 14, background: sentimentColour, borderRadius: 999, opacity: 0.7 }} />
              <span style={{
                fontSize: 7, fontWeight: 700, letterSpacing: '0.3px',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                background: isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(13, 47, 96, 0.06)',
                padding: '1px 4px', textAlign: 'center', borderRadius: 0,
              }}>
                {teamLabel}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: 7, color: dirColour, fontWeight: 600, flexShrink: 0 }}>
                  {isInbound ? '←' : '→'}
                </span>
                <span style={{
                  fontSize: 8, fontWeight: 600, color: textPrimary,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                }}>
                  {party}
                </span>
              </div>
              <span style={{
                fontSize: 7, color: textMuted,
                fontFamily: "'Consolas', 'Courier New', monospace",
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
              }}>
                {durationText}
              </span>
              <span style={{ fontSize: 7, color: textMuted, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {timeLabel}
              </span>
            </div>
          );
        };

        return (
        <div style={{ marginTop: 10, borderTop: `1px solid ${rowBorder}`, paddingTop: 8 }}>
          <div style={{ padding: '2px 14px 3px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FiPhone size={10} color={accent} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, letterSpacing: '0.2px' }}>
              Team calls
            </span>
            <span style={{ fontSize: 8, color: textMuted, opacity: 0.5 }}>{recentCalls.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '4px 14px 8px' }}>
            {/* External column */}
            <div>
              <div style={{
                fontSize: 7, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' as const,
                color: accent, padding: '2px 6px 4px', borderBottom: `1px solid ${rowBorder}`,
              }}>
                External
                <span style={{ marginLeft: 4, fontSize: 7, opacity: 0.5, fontWeight: 500 }}>{externalCalls.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {externalCalls.length > 0
                  ? externalCalls.map(renderStreamRow)
                  : <span style={{ fontSize: 8, color: textMuted, opacity: 0.4, fontStyle: 'italic', padding: '6px' }}>None</span>
                }
              </div>
            </div>
            {/* Internal column */}
            <div>
              <div style={{
                fontSize: 7, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' as const,
                color: textMuted, padding: '2px 6px 4px', borderBottom: `1px solid ${rowBorder}`,
              }}>
                Internal
                <span style={{ marginLeft: 4, fontSize: 7, opacity: 0.5, fontWeight: 500 }}>{internalCalls.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {internalCalls.length > 0
                  ? internalCalls.map(renderStreamRow)
                  : <span style={{ fontSize: 8, color: textMuted, opacity: 0.4, fontStyle: 'italic', padding: '6px' }}>None</span>
                }
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── CCL date confirmations ─────────────────────────────────── */}
      {isAdmin && showHomeOpsCclDates && cclCount > 0 && (
        <div style={{
          marginTop: 10,
          borderTop: `1px solid ${rowBorder}`,
          paddingTop: 8,
          background: isDarkMode ? 'rgba(6, 23, 51, 0.18)' : 'rgba(13, 47, 96, 0.012)',
        }}>
          <div style={{ padding: '2px 14px 3px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FiCalendar size={10} style={{ color: accent, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, letterSpacing: '0.2px' }}>
              CCL dates
            </span>
            <span style={{ fontSize: 8, color: textMuted, opacity: 0.5 }}>{cclCount}</span>
          </div>
          <div style={{ padding: '2px 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 6 }}>
            {cclWeekFiltered.map(item => {
              const isActioning = actioningId === `ccl-${item.matter_id}`;
              const selectedDate = cclDateSelections[String(item.matter_id)] || '';
              return (
                <div
                  key={`ccl-${item.matter_id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(168px, 1fr) auto',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: isDarkMode ? 'rgba(214, 232, 255, 0.06)' : 'rgba(214, 232, 255, 0.4)',
                    border: `1px solid ${isDarkMode ? 'rgba(214,232,255,0.16)' : 'rgba(214,232,255,0.62)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: `1px solid ${isDarkMode ? 'rgba(214,232,255,0.18)' : 'rgba(214,232,255,0.72)'}`, background: isDarkMode ? 'rgba(214,232,255,0.03)' : 'rgba(255,255,255,0.45)' }}>
                    <FiCalendar size={10} color={colours.highlightBlue} />
                  </div>
                  <div style={{ minWidth: 168, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: textPrimary, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                      {item.client_name || item.display_number}
                    </span>
                    <span style={{ fontSize: 8, color: textMuted, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                      {item.display_number}
                      {item.open_date ? ` · opened ${shortDate(item.open_date)}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'end', minWidth: 0, flexShrink: 0 }}>
                    <input
                      type="date"
                      value={selectedDate}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        const { value } = e.target;
                        setCclDateSelections(prev => ({
                          ...prev,
                          [String(item.matter_id)]: value,
                        }));
                      }}
                      style={{
                        height: 28,
                        width: 132,
                        background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.82)',
                        border: `1px solid ${isDarkMode ? 'rgba(214,232,255,0.16)' : 'rgba(214,232,255,0.72)'}`,
                        borderRadius: 0,
                        color: textPrimary,
                        padding: '0 8px',
                        fontSize: 8,
                        fontWeight: 600,
                        fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                      }}
                    />
                    {selectedDate && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCclConfirm(item, selectedDate); }}
                        disabled={isActioning}
                        title={isActioning ? 'Confirming date' : 'Confirm selected date'}
                        style={{
                          width: 28,
                          height: 28,
                          background: isDarkMode ? 'rgba(214, 232, 255, 0.08)' : 'rgba(255,255,255,0.72)',
                          border: `1px solid ${isDarkMode ? 'rgba(214, 232, 255, 0.28)' : 'rgba(214, 232, 255, 0.82)'}`,
                          borderRadius: 0,
                          padding: 0,
                          cursor: isActioning ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colours.highlightBlue,
                          transition: 'all 0.15s ease',
                          opacity: isActioning ? 0.5 : 1,
                          flexShrink: 0,
                          animation: 'opsTicketExpand 0.14s ease-out',
                        }}
                        onMouseEnter={e => { if (!isActioning) e.currentTarget.style.background = isDarkMode ? 'rgba(214, 232, 255, 0.14)' : 'rgba(255,255,255,0.9)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(214, 232, 255, 0.08)' : 'rgba(255,255,255,0.72)'; }}
                      >
                        <FiCheckCircle size={10} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stripe Detail Modal ──────────────────────────────────────── */}
      {selectedStripeItem && (() => {
        const p = selectedStripeItem;
        const clientName = [p.firstName, p.lastName].filter(Boolean).join(' ');
        const statusColour = p.paymentStatus === 'succeeded' ? colours.green
          : p.paymentStatus === 'failed' ? colours.cta : colours.orange;
        return (
          <div
            onClick={() => setSelectedStripeItem(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0, 3, 25, 0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'opsTicketExpand 0.12s ease-out',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: 360, maxWidth: '92vw',
                background: isDarkMode ? colours.dark.cardBackground : '#fff',
                border: `1px solid ${borderCol}`, borderRadius: 0,
                boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '12px 16px', borderBottom: `1px solid ${borderCol}`,
                display: 'flex', alignItems: 'baseline', gap: 8,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColour, flexShrink: 0, alignSelf: 'center' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary, flex: 1 }}>
                  {clientName || p.instructionRef || 'Payment'}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight }}>
                  {p.amount != null ? formatAmount(p.amount, p.currency) : '—'}
                </span>
                <button
                  onClick={() => setSelectedStripeItem(null)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: textMuted, fontSize: 16, lineHeight: 1, padding: '0 0 0 8px',
                  }}
                >×</button>
              </div>
              {/* Body */}
              <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '10px 20px', fontSize: 11, color: textBody, lineHeight: 1.6 }}>
                <div>
                  <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Status</span>
                  <span style={{ fontWeight: 600, color: statusColour }}>{p.paymentStatus}</span>
                  {p.internalStatus && <span style={{ color: textMuted }}> / {p.internalStatus}</span>}
                </div>
                <div>
                  <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Method</span>
                  {p.paymentMethod || 'Card'}
                </div>
                <div>
                  <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Reference</span>
                  <span style={{ fontFamily: "'Consolas', 'Courier New', monospace", fontSize: 10, color: textMuted }}>{p.paymentReference || p.instructionRef || (p.paymentIntentId || p.id)}</span>
                </div>
                {p.instructionRef && (
                  <div>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Instruction</span>
                    {p.instructionRef}
                  </div>
                )}
                {p.areaOfWork && (
                  <div>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Area</span>
                    {p.areaOfWork}
                  </div>
                )}
                {p.helixContact && (
                  <div>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Fee earner</span>
                    {p.helixContact}
                  </div>
                )}
                {p.serviceDescription && (
                  <div style={{ flexBasis: '100%' }}>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Service</span>
                    {p.serviceDescription}
                  </div>
                )}
                {p.paymentIntentId && (
                  <div style={{ flexBasis: '100%' }}>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Stripe ID</span>
                    <span style={{ fontFamily: "'Consolas', 'Courier New', monospace", fontSize: 10, color: textMuted }}>{p.paymentIntentId}</span>
                  </div>
                )}
              </div>
              {/* Footer */}
              {p.createdAt && (
                <div style={{ padding: '6px 16px 10px', fontSize: 9, color: textMuted, borderTop: `1px solid ${borderCol}` }}>
                  {relativeTime(p.createdAt)}{p.updatedAt && p.updatedAt !== p.createdAt ? ` · updated ${relativeTime(p.updatedAt)}` : ''}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Debt Detail Modal ────────────────────────────────────────── */}
      {selectedDebtItem && (() => {
        const d = selectedDebtItem;
        const debtMeta = getDebtTransferMeta(d);
        return (
          <div
            onClick={() => setSelectedDebtItem(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0, 3, 25, 0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'opsTicketExpand 0.12s ease-out',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: 360, maxWidth: '92vw',
                background: isDarkMode ? colours.dark.cardBackground : '#fff',
                border: `1px solid ${borderCol}`, borderRadius: 0,
                boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '12px 16px', borderBottom: `1px solid ${borderCol}`,
                display: 'flex', alignItems: 'baseline', gap: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary, flex: 1 }}>
                  {d.matter_ref || 'Debt'}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: colours.cta }}>
                  {d.amount != null ? formatAmount(Number(d.amount)) : '—'}
                </span>
                <button
                  onClick={() => setSelectedDebtItem(null)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: textMuted, fontSize: 16, lineHeight: 1, padding: '0 0 0 8px',
                  }}
                >×</button>
              </div>
              {/* Body */}
              <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '10px 20px', fontSize: 11, color: textBody, lineHeight: 1.6 }}>
                <div>
                  <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Status</span>
                  <span style={{ fontWeight: 600 }}>{(d.lifecycle_status || 'pending').replace(/_/g, ' ')}</span>
                </div>
                <div>
                  <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Money owed</span>
                  <span style={{ fontWeight: 600 }}>{d.amount != null ? formatAmount(Number(d.amount)) : '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Can transfer</span>
                  <span style={{ fontWeight: 600 }}>{debtMeta.transferableAmount > 0 ? formatAmount(debtMeta.transferableAmount) : '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Source</span>
                  <span style={{ fontWeight: 600 }}>{debtMeta.sourceLabel}</span>
                </div>
                {d.fee_earner && (
                  <div>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Fee earner</span>
                    {d.fee_earner}
                  </div>
                )}
                {d.matter_description && (
                  <div style={{ flexBasis: '100%' }}>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Description</span>
                    {d.matter_description}
                  </div>
                )}
                {d.transaction_date && (
                  <div>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Date</span>
                    {new Date(d.transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
                {d.notes && (
                  <div style={{ flexBasis: '100%' }}>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Notes</span>
                    {d.notes}
                  </div>
                )}
                {d.action_notes && (
                  <div style={{ flexBasis: '100%' }}>
                    <span style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}>Action notes</span>
                    {d.action_notes}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div style={{ padding: '6px 16px 10px', fontSize: 9, color: textMuted, borderTop: `1px solid ${borderCol}` }}>
                {d.created_at ? `Created ${relativeTime(d.created_at)}` : 'Created just now'}
                {d.action_notes ? ` · ${d.action_notes}` : ''}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Operations Lookup Modal ──────────────────────────────────── */}
      {showPaymentLookup && (
        <div
          onClick={() => setShowPaymentLookup(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 3, 25, 0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '12vh',
            animation: 'opsTicketExpand 0.14s ease-out',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 440, maxWidth: '92vw',
              background: isDarkMode ? colours.dark.cardBackground : '#fff',
              border: `1px solid ${borderCol}`, borderRadius: 0,
              boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
            }}
          >
            {/* Accent header band */}
            <div style={{
              padding: '14px 20px 12px',
              borderBottom: `2px solid ${isDarkMode ? colours.accent : colours.highlight}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <FiSearch size={16} style={{ color: isDarkMode ? colours.accent : colours.highlight, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, letterSpacing: '0.2px' }}>
                  Operations Lookup
                </div>
                <div style={{ fontSize: 9, color: textMuted, marginTop: 1 }}>
                  Search payments, V2 transfers, and aged debts
                </div>
              </div>
              <button
                onClick={() => setShowPaymentLookup(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: textMuted, fontSize: 18, lineHeight: 1, padding: 0,
                }}
              >×</button>
            </div>

            {/* Search input */}
            <div style={{ padding: '14px 20px 10px', display: 'flex', gap: 8 }}>
              <input
                type="text"
                autoFocus
                value={paymentQuery}
                onChange={e => { setPaymentQuery(e.target.value); setPaymentNotFound(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handlePaymentLookup(); if (e.key === 'Escape') setShowPaymentLookup(false); }}
                placeholder="Matter ref, instruction, client, Stripe ID, notes"
                style={{
                  flex: 1, fontSize: 13, padding: '8px 12px',
                  background: isDarkMode ? colours.dark.sectionBackground : '#f9fafb',
                  border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.15)' : 'rgba(13, 47, 96, 0.12)'}`,
                  borderRadius: 0,
                  color: textPrimary, outline: 'none',
                  fontFamily: "'Consolas', 'Courier New', monospace",
                  letterSpacing: '0.3px',
                }}
              />
              <button
                onClick={handlePaymentLookup}
                disabled={!paymentQuery.trim() || paymentSearching}
                style={{
                  background: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(13,47,96,0.06)',
                  border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.2)' : 'rgba(13, 47, 96, 0.12)'}`,
                  borderRadius: 0, padding: '8px 16px',
                  cursor: !paymentQuery.trim() || paymentSearching ? 'default' : 'pointer',
                  fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight,
                  fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                  textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                  opacity: !paymentQuery.trim() || paymentSearching ? 0.4 : 1,
                  transition: 'all 0.12s ease',
                }}
              >
                {paymentSearching ? '...' : 'Search'}
              </button>
            </div>

            {/* Results */}
            <div style={{ padding: '0 20px 16px', minHeight: 60 }}>
              {paymentNotFound && (
                <div style={{
                  padding: '12px 0', textAlign: 'center',
                  fontSize: 11, color: textMuted, fontStyle: 'italic',
                  animation: 'opsTicketExpand 0.14s ease-out',
                }}>
                  No operations item matched that search
                </div>
              )}
              {lookupResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lookupResults.map(result => (
                    <button
                      key={`${result.kind}-${result.id}`}
                      onClick={() => jumpToLookupResult(result)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(13,47,96,0.08)'}`,
                        borderLeft: `3px solid ${result.statusColour}`,
                        background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(13, 47, 96, 0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.14s ease',
                        animation: 'opsV2Drop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(13, 47, 96, 0.02)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {result.title}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight, flexShrink: 0 }}>
                          {result.amountText}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.35px', textTransform: 'uppercase', color: isDarkMode ? colours.accent : colours.highlight }}>
                          {result.sectionLabel}
                        </span>
                        <span style={{ fontSize: 8, color: textMuted, opacity: 0.4 }}>•</span>
                        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.35px', textTransform: 'uppercase', color: result.statusColour }}>
                          {result.statusText}
                        </span>
                      </div>
                      {result.subtitle && (
                        <div style={{ marginTop: 6, fontSize: 10, color: textBody, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {result.subtitle}
                        </div>
                      )}
                      {result.matchText && (
                        <div style={{ marginTop: 6, fontSize: 9, color: textMuted }}>
                          Found in {result.matchText}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes opsQReveal {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsTicketExpand {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes opsItemCascade {
          from { opacity: 0; transform: translateY(-3px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes opsQPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes opsCuePulse {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }
        @keyframes opsV2Drop {
          0% { opacity: 0; transform: translateY(-12px) scale(0.97); }
          60% { opacity: 1; transform: translateY(2px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes opsLedgerSlide {
          from { opacity: 0; transform: translateX(12px); width: 0; }
          to { opacity: 1; transform: translateX(0); width: 210px; }
        }
      `}</style>
    </div>
    </>
  );
};

export default OperationsQueue;
