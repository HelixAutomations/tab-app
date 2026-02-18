/**
 * Client-side service for CCL AI fill.
 * Calls POST /api/ccl-ai/fill and returns the generated intake fields.
 */

export interface AiFillRequest {
  matterId: string;
  initials?: string;
  instructionRef?: string;
  practiceArea?: string;
  description?: string;
  clientName?: string;
  opponent?: string;
  enquiryNotes?: string;
  handlerName?: string;
  handlerRole?: string;
  handlerRate?: string;
}

export interface AiDebugTrace {
  trackingId?: string;
  deployment?: string;
  aiStatus?: 'complete' | 'partial' | 'fallback';
  options?: {
    temperature?: number;
    max_tokens?: number;
  };
  userPromptLength?: number;
  generatedFieldCount?: number;
  error?: string;
  context?: {
    sourceCount?: number;
    sources?: string[];
    contextFields?: Record<string, string>;
    snippets?: Record<string, string>;
  };
}

export interface AiFillResponse {
  ok: boolean;
  fields: Record<string, string>;
  confidence: 'full' | 'partial' | 'fallback';
  model: string;
  durationMs: number;
  source: 'ai' | 'ai+defaults' | 'defaults';
  fallbackReason?: string;
  dataSources?: string[];
  contextSummary?: string;
  userPrompt?: string;
  systemPrompt?: string;
  debug?: AiDebugTrace;
}

export interface AiFeedbackRequest {
  matterId: string;
  rating: 'up' | 'down' | 'flag';
  comment?: string;
  fieldKey?: string;
}

export async function fetchAiFill(request: AiFillRequest): Promise<AiFillResponse> {
  const res = await fetch('/api/ccl-ai/fill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`AI fill request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function fetchPracticeAreaDefaults(practiceArea: string): Promise<Record<string, string>> {
  const res = await fetch(`/api/ccl-ai/practice-defaults/${encodeURIComponent(practiceArea)}`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.fields || {};
}

export async function submitAiFeedback(feedback: AiFeedbackRequest): Promise<boolean> {
  try {
    const res = await fetch('/api/ccl-ai/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...feedback, timestamp: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    console.warn('[CCL-AI] Feedback submission failed');
    return false;
  }
}


// ─── Context Preview (dry-run — no AI call, no trace saved) ─────────────────

export interface ContextPreviewResponse {
  ok: boolean;
  dataSources: string[];
  contextFields: Record<string, string>;
  snippets: Record<string, string>;
  userPrompt: string;
  userPromptLength: number;
  systemPromptLength: number;
}

export async function fetchContextPreview(request: AiFillRequest): Promise<ContextPreviewResponse> {
  const res = await fetch('/api/ccl-ai/context-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Context preview failed: ${res.status}`);
  return res.json();
}


// ─── CCL Support Ticket ─────────────────────────────────────────────────────
// Submits a structured support ticket capturing the CCL state for debug.

export interface CclSupportTicket {
  matterId?: string;
  matterDisplayNumber?: string;
  category: 'field_wrong' | 'ai_quality' | 'template_error' | 'upload_failed' | 'other';
  summary: string;
  description?: string;
  urgency: 'Blocking' | 'Annoying' | 'Minor';
  submittedBy?: string;
  // Auto-captured debug context
  fieldSnapshot?: Record<string, string>;
  aiStatus?: string;
  aiSource?: string;
  aiDurationMs?: number;
  dataSources?: string[];
  fallbackReason?: string;
  trackingId?: string;
}

export async function submitCclSupportTicket(ticket: CclSupportTicket): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/ccl-ops/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket),
    });
    const data = await res.json();
    return { ok: res.ok, message: data.message || data.error || 'Unknown result' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, message: msg };
  }
}


// ─── Integration Availability Check ─────────────────────────────────────────
// Checks which integrations (Clio, ND) are available for a given matter.

export interface CclIntegrations {
  clio: { available: boolean; matterId: string | null; description: string };
  nd: { available: boolean; workspaceId: string | null; workspaceName: string };
}

// Demo matter — matches DEMO_MATTER in Matters.tsx (real Clio record)
const DEMO_CLIO_MATTER_ID = '3311402';
const DEMO_MATTER_ID = 'DEMO-3311402';
const DEMO_DISPLAY_NUMBER = 'HELIX01-01';

const isDemoMatter = (id: string) =>
  id === DEMO_CLIO_MATTER_ID || id === DEMO_MATTER_ID || id === DEMO_DISPLAY_NUMBER;

export async function checkCclIntegrations(matterId: string): Promise<CclIntegrations> {
  const fallback: CclIntegrations = {
    clio: { available: false, matterId: null, description: '' },
    nd: { available: false, workspaceId: null, workspaceName: '' },
  };

  // Demo mode: return mock integrations so the upload flow is testable
  if (isDemoMatter(matterId)) {
    return {
      clio: { available: true, matterId: DEMO_CLIO_MATTER_ID, description: 'Admin (demo)' },
      nd: { available: false, workspaceId: null, workspaceName: '' },
    };
  }

  try {
    const res = await fetch(`/api/ccl-ops/integrations?matterId=${encodeURIComponent(matterId)}`);
    if (!res.ok) return fallback;
    const data = await res.json();
    return { clio: data.clio || fallback.clio, nd: data.nd || fallback.nd };
  } catch {
    return fallback;
  }
}


// ─── Upload Functions ────────────────────────────────────────────────────────
// Clio: real 3-step presigned URL upload.
// ND: stub — returns 501 until implemented.

export async function uploadToClio(params: {
  matterId: string;
  matterDisplayNumber: string;
  clioMatterId: string;
  fileName?: string;
  initials?: string;
  /** Current field values from the editor — server regenerates docx from these before upload */
  fields?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string; docxPath?: string }> {
  try {
    const res = await fetch('/api/ccl-ops/upload-clio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function uploadToNetDocuments(params: {
  matterId: string;
  matterDisplayNumber: string;
  ndWorkspaceId: string;
  fileName?: string;
}): Promise<{ ok: boolean; error?: string; docxPath?: string }> {
  try {
    const res = await fetch('/api/ccl-ops/upload-nd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export interface CclReconstructVersionResult {
  ok: boolean;
  url?: string;
  fileName?: string;
  version?: number;
  cclContentId?: number;
  matterId?: string;
  sent?: {
    uploadedToClio: boolean;
    uploadedToNd: boolean;
    clioDocId: string | null;
    ndDocId: string | null;
    finalizedAt: string | null;
    finalizedBy: string | null;
  };
  expiry?: {
    expiresAt: string | null;
    source: 'fields' | 'inferred_30d' | 'none';
    isExpired: boolean | null;
  };
  error?: string;
}

export async function reconstructCclVersion(cclContentId: number): Promise<CclReconstructVersionResult> {
  try {
    const res = await fetch('/api/ccl-ops/reconstruct-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cclContentId }),
    });
    const raw = await res.text();
    let parsed: CclReconstructVersionResult | null = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        error: parsed?.error || `Reconstruct preview failed (${res.status}).`,
      };
    }

    if (!parsed) {
      return { ok: false, error: 'Reconstruct preview returned an invalid response.' };
    }

    return parsed;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: `Reconstruct preview unavailable: ${message}` };
  }
}

// ─── CCL Admin / Ops API ──────────────────────────────────────────────────

export interface CclContentRecord {
  CclContentId: number;
  MatterId: string;
  InstructionRef: string | null;
  ClientName: string | null;
  ClientEmail: string | null;
  ClientAddress: string | null;
  MatterDescription: string | null;
  FeeEarner: string | null;
  FeeEarnerEmail: string | null;
  SupervisingPartner: string | null;
  PracticeArea: string | null;
  FieldsJson: string;
  ProvenanceJson: string | null;
  Version: number;
  Status: string;
  UploadedToClio: boolean;
  UploadedToNd: boolean;
  ClioDocId: string | null;
  NdDocId: string | null;
  CreatedBy: string | null;
  CreatedAt: string;
  FinalizedAt: string | null;
  FinalizedBy: string | null;
}

export interface CclAiTraceRecord {
  CclAiTraceId: number;
  MatterId: string;
  TrackingId: string;
  AiStatus: string;
  Model: string | null;
  DurationMs: number | null;
  Temperature: number | null;
  SystemPrompt: string | null;
  UserPrompt: string | null;
  UserPromptLength: number | null;
  AiOutputJson: string | null;
  GeneratedFieldCount: number | null;
  Confidence: string | null;
  DataSourcesJson: string | null;
  ContextFieldsJson: string | null;
  ContextSnippetsJson: string | null;
  FallbackReason: string | null;
  ErrorMessage: string | null;
  CreatedBy: string | null;
  CreatedAt: string;
}


// ─── CCL Assessment (structured quality review) ─────────────────────────────

export interface CclAssessmentRecord {
  CclAssessmentId: number;
  MatterId: string;
  CclContentId: number | null;
  CclAiTraceId: number | null;
  InstructionRef: string | null;
  PracticeArea: string | null;
  FeeEarner: string | null;
  DocumentType: string;
  OverallScore: number;
  FieldAssessmentsJson: string | null;
  IssueCategories: string | null;
  ManualEditsJson: string | null;
  FieldsCorrect: number | null;
  FieldsEdited: number | null;
  FieldsReplaced: number | null;
  FieldsEmpty: number | null;
  Notes: string | null;
  PromptSuggestion: string | null;
  AppliedToPrompt: boolean;
  AppliedAt: string | null;
  AppliedBy: string | null;
  AssessedBy: string;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface CclAssessmentPayload {
  matterId: string;
  cclContentId?: number;
  cclAiTraceId?: number;
  instructionRef?: string;
  practiceArea?: string;
  feeEarner?: string;
  documentType?: string;
  overallScore: number;
  fieldAssessmentsJson?: Record<string, { score: number; issue?: string; note?: string }>;
  issueCategories?: string[];
  manualEditsJson?: Record<string, { ai: string; final: string }>;
  fieldsCorrect?: number;
  fieldsEdited?: number;
  fieldsReplaced?: number;
  fieldsEmpty?: number;
  notes?: string;
  promptSuggestion?: string;
  assessedBy: string;
}

export const ISSUE_CATEGORIES = [
  { key: 'tone_wrong', label: 'Tone / register wrong' },
  { key: 'facts_wrong', label: 'Factual error' },
  { key: 'missing_context', label: 'Missing context' },
  { key: 'formatting', label: 'Formatting issue' },
  { key: 'legal_accuracy', label: 'Legal accuracy' },
  { key: 'client_specific', label: 'Client-specific error' },
  { key: 'costs_wrong', label: 'Costs / fees wrong' },
  { key: 'names_wrong', label: 'Names / parties wrong' },
] as const;

export interface CclAdminStats {
  ok: boolean;
  content: {
    TotalMatters: number;
    TotalVersions: number;
    Drafts: number;
    Finals: number;
    Uploaded: number;
    ClioUploads: number;
    NdUploads: number;
  };
  ai: {
    TotalAiCalls: number;
    FullAi: number;
    PartialAi: number;
    FallbackAi: number;
    AvgDurationMs: number;
  };
  feedback: {
    TotalFeedback: number;
    ThumbsUp: number;
    ThumbsDown: number;
    Flagged: number;
  };
}

export interface CclMatterDetail {
  ok: boolean;
  matterId: string;
  latest: CclContentRecord | null;
  versions: CclContentRecord[];
  aiTraces: CclAiTraceRecord[];

  assessments?: CclAssessmentRecord[];
}

export async function fetchCclAdminStats(): Promise<CclAdminStats | null> {
  try {
    const res = await fetch('/api/ccl-admin/stats');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCclMatterDetail(matterId: string): Promise<CclMatterDetail | null> {
  try {
    const res = await fetch(`/api/ccl-admin/matters/${encodeURIComponent(matterId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCclAiTraces(matterId: string): Promise<CclAiTraceRecord[]> {
  try {
    const res = await fetch(`/api/ccl-admin/traces/${encodeURIComponent(matterId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.traces || [];
  } catch {
    return [];
  }
}

export async function fetchCclTraceDetail(trackingId: string): Promise<CclAiTraceRecord | null> {
  try {
    const res = await fetch(`/api/ccl-admin/trace/${encodeURIComponent(trackingId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.trace || null;
  } catch {
    return null;
  }
}


// ─── CCL Assessment API ──────────────────────────────────────────────────────

export async function submitCclAssessment(payload: CclAssessmentPayload): Promise<{ ok: boolean; assessmentId?: number; error?: string }> {
  try {
    const res = await fetch('/api/ccl-admin/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function fetchCclAssessments(matterId: string): Promise<CclAssessmentRecord[]> {
  try {
    const res = await fetch(`/api/ccl-admin/assessments/${encodeURIComponent(matterId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.assessments || [];
  } catch {
    return [];
  }
}

export async function markAssessmentAsApplied(assessmentId: number, appliedBy: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/ccl-admin/assessments/${assessmentId}/applied`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedBy }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
