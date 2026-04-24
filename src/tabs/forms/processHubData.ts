import { FormItem } from '../../app/functionality/types';
import { formSections } from './formsData';

export type ProcessLane = 'Start' | 'Request' | 'Log' | 'Escalate' | 'Find';

export type ProcessStreamStatus = 'queued' | 'awaiting_human' | 'processing' | 'complete' | 'failed';

export type ProcessDefinition = FormItem & {
  context: string[];
  healthCheckId?: string;
  keywords: string[];
  lane: ProcessLane;
  rolloutState: 'live' | 'transition';
  sectionKey: string;
  sectionLabel: string;
  statusHint: string;
};

export type ProcessStreamItem = {
  id: string;
  lane: ProcessLane;
  processTitle: string;
  startedAt: string;
  status: ProcessStreamStatus;
  summary: string;
  lastEvent: string;
  // forms-stream-persistence Phase B (B6): optional links to the
  // server-side `dbo.form_submissions` row backing this entry. Only
  // populated for items hydrated from `/api/process-hub/submissions`;
  // legacy local entries leave these undefined.
  submissionId?: string;
  formKey?: string;
  payloadAvailable?: boolean;
  retriggerCount?: number;
  submittedBy?: string | null;
};

const sectionLabels: Record<string, string> = {
  Browse_Directories: 'Directories',
  Financial: 'Finance',
  General_Processes: 'General',
  Operations: 'Operations',
  Recommendations: 'Recommendations',
  Tech_Support: 'Tech',
};

const laneBySection: Record<string, ProcessLane> = {
  Browse_Directories: 'Find',
  Financial: 'Request',
  General_Processes: 'Start',
  Operations: 'Log',
  Recommendations: 'Request',
  Tech_Support: 'Escalate',
};

const overrides: Record<string, Partial<ProcessDefinition>> = {
  'Bundle': {
    context: ['Matter', 'Court'],
    healthCheckId: 'bundle',
    keywords: ['bundle', 'hearing', 'netdocs', 'documents'],
    lane: 'Request',
    statusHint: 'Submitted bundles should show drafting and delivery progress.',
  },
  'Call Handling': {
    context: ['Enquiry', 'Operations'],
    keywords: ['call', 'intake', 'routing', 'enquiry'],
    lane: 'Log',
  },
  'Counsel Directory': {
    context: ['Recommendation', 'Matter'],
    healthCheckId: 'counsel',
    keywords: ['directory', 'counsel', 'barrister', 'find'],
    lane: 'Find',
  },
  'Expert Directory': {
    context: ['Recommendation', 'Matter'],
    healthCheckId: 'experts',
    keywords: ['directory', 'expert', 'witness', 'find'],
    lane: 'Find',
  },
  'General Query': {
    context: ['Finance', 'Operations'],
    healthCheckId: 'financial-task',
    keywords: ['finance', 'query', 'accounts'],
    lane: 'Request',
  },
  'Incoming Post': {
    context: ['Operations'],
    keywords: ['post', 'mail', 'logistics'],
    lane: 'Log',
  },
  'Notable Case Info': {
    context: ['Matter', 'Profile'],
    healthCheckId: 'notable-case-info',
    keywords: ['case', 'outcome', 'publication', 'profile'],
    lane: 'Log',
  },
  'New Complaint': {
    context: ['Compliance', 'Incident'],
    keywords: ['complaint', 'incident', 'escalation', 'formal'],
    lane: 'Escalate',
    statusHint: 'Complaint intake now starts in Forms, then moves into the compliance workspace for controlled updates.',
  },
  'New Learning Activity': {
    context: ['L&D', 'CPD'],
    keywords: ['cpd', 'learning', 'training', 'course', 'development', 'activity'],
    lane: 'Log',
    statusHint: 'CPD activities are logged here and tracked against your annual plan in Resources → Learning & Development.',
  },
  'New Undertaking': {
    context: ['Compliance', 'Matter'],
    keywords: ['undertaking', 'obligation', 'promise', 'due date'],
    lane: 'Request',
    statusHint: 'Undertakings now start in Forms and then return to Compliance for due-date and discharge tracking.',
  },
  'Office Attendance': {
    context: ['Operations'],
    keywords: ['attendance', 'office', 'presence'],
    lane: 'Log',
  },
  'Open a Matter': {
    context: ['Client', 'Matter'],
    keywords: ['matter', 'open', 'instruction', 'client'],
    lane: 'Start',
    statusHint: 'This should become a fully tracked orchestration, not a cold external form.',
  },
  'Payment Requests': {
    context: ['Matter', 'Finance'],
    healthCheckId: 'financial-task',
    keywords: ['payment', 'client account', 'bank details', 'transfer'],
    lane: 'Request',
    statusHint: 'This is a priority candidate for unified submission tracking.',
  },
  'Proof of Identity': {
    context: ['Client', 'Matter'],
    keywords: ['identity', 'verification', 'client', 'documents'],
    lane: 'Start',
  },
  'Recommend Counsel': {
    context: ['Recommendation', 'Matter'],
    healthCheckId: 'counsel',
    keywords: ['recommend', 'counsel', 'specialism'],
    lane: 'Request',
  },
  'Recommend Expert': {
    context: ['Recommendation', 'Matter'],
    healthCheckId: 'experts',
    keywords: ['recommend', 'expert', 'specialism'],
    lane: 'Request',
  },
  'Report Technical Problem': {
    context: ['Tech', 'Operations'],
    healthCheckId: 'tech-tickets',
    keywords: ['bug', 'incident', 'error', 'problem'],
    lane: 'Escalate',
    statusHint: 'Already close to a proper tracked submission via the tech ticket ledger.',
  },
  'Supplier Payment/Helix Expense': {
    context: ['Finance', 'Supplier'],
    keywords: ['supplier', 'expense', 'invoice', 'payment'],
    lane: 'Request',
  },
  'Tasks': {
    context: ['Matter', 'Operations'],
    keywords: ['tasks', 'assignment', 'due date', 'reminder'],
    lane: 'Start',
  },
  'Tech Development Idea': {
    context: ['Tech', 'Improvement'],
    healthCheckId: 'tech-tickets',
    keywords: ['idea', 'feature', 'improvement', 'platform'],
    lane: 'Escalate',
    statusHint: 'Already has a server-side ledger; this should become an early process-hub adapter.',
  },
  'Tel. Attendance Note': {
    context: ['Matter', 'Client'],
    keywords: ['attendance', 'telephone', 'note', 'call'],
    lane: 'Log',
  },
  'Transaction Intake': {
    context: ['Property', 'Matter'],
    healthCheckId: 'transactions-v2',
    keywords: ['transaction', 'property', 'intake', 'sale', 'purchase'],
    lane: 'Start',
  },
  'Transfer Request': {
    context: ['Matter', 'Finance'],
    healthCheckId: 'financial-task',
    keywords: ['transfer', 'client to office', 'office to client', 'funds'],
    lane: 'Request',
    statusHint: 'This should show queueing and approval state in the unified stream.',
  },
  'Verification Check': {
    context: ['Compliance', 'Client'],
    keywords: ['verification', 'id', 'tiller', 'pep', 'sanctions', 'address', 'check', 'adhoc'],
    lane: 'Find',
    statusHint: 'Ad-hoc Tiller check. Results are not persisted against any instruction.',
  },
};

export const laneOrder: ProcessLane[] = ['Start', 'Request', 'Log', 'Escalate', 'Find'];

export const streamStatusMeta: Record<ProcessStreamStatus, { label: string; tone: 'neutral' | 'active' | 'success' | 'danger' }> = {
  awaiting_human: { label: 'Awaiting input', tone: 'active' },
  complete: { label: 'Complete', tone: 'success' },
  failed: { label: 'Needs attention', tone: 'danger' },
  processing: { label: 'Processing', tone: 'active' },
  queued: { label: 'Queued', tone: 'neutral' },
};

export const processDefinitions: ProcessDefinition[] = Object.entries(formSections).flatMap(([sectionKey, forms]) => {
  return forms.map((form) => {
    const override = overrides[form.title] || {};

    return {
      ...form,
      context: override.context || [sectionLabels[sectionKey] || sectionKey],
      keywords: override.keywords || [form.title.toLowerCase(), sectionKey.toLowerCase()],
      lane: override.lane || laneBySection[sectionKey] || 'Request',
      rolloutState: override.rolloutState || (form.component ? 'live' : 'transition'),
      sectionKey,
      sectionLabel: sectionLabels[sectionKey] || sectionKey,
      statusHint: override.statusHint || 'This process is still using the existing engine and will move into tracked submissions in later slices.',
    };
  });
});