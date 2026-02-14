/**
 * Client-side service for CCL AI fill.
 * Calls POST /api/ccl-ai/fill and returns the generated intake fields.
 */

export interface AiFillRequest {
  matterId: string;
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

export async function checkCclIntegrations(matterId: string): Promise<CclIntegrations> {
  const fallback: CclIntegrations = {
    clio: { available: false, matterId: null, description: '' },
    nd: { available: false, workspaceId: null, workspaceName: '' },
  };
  try {
    const res = await fetch(`/api/ccl-ops/integrations?matterId=${encodeURIComponent(matterId)}`);
    if (!res.ok) return fallback;
    const data = await res.json();
    return { clio: data.clio || fallback.clio, nd: data.nd || fallback.nd };
  } catch {
    return fallback;
  }
}


// ─── Upload Stubs ───────────────────────────────────────────────────────────
// Placeholder upload calls — will return 501 until Phase 2 is implemented.

export async function uploadToClio(params: {
  matterId: string;
  matterDisplayNumber: string;
  clioMatterId: string;
  fileName?: string;
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
