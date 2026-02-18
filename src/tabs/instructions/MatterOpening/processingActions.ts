import { ProcessingStep } from './ProcessingSection';
import activeIcon from '../../../assets/activecampaign.svg';
import clioIcon from '../../../assets/clio.svg';
import asanaIcon from '../../../assets/asana.svg';
import cclIcon from '../../../assets/ccl.svg';
import netdocsIcon from '../../../assets/netdocuments.svg';
import helixBlueMark from '../../../assets/dark blue mark.svg';

// locally cached values so refresh endpoints can be called in sequence
let acToken = '';
let clioClientId = '';
let clioClientSecret = '';
let clioRefreshToken = '';
let asanaClientId = '';
let asanaSecret = '';
let asanaRefreshToken = '';
let opponentId = '';
let solicitorId = '';
let clioContactIds: string[] = [];
let clioCompanyId: string | null = null;
let clientIdCallback: ((id: string | null) => void) | null = null;
let matterId: string | null = null;
let matterIdCallback: ((id: string | null) => void) | null = null;
let matterRequestId: string | null = null;
let matterDisplayNumber: string | null = null;
let matterTraceId = `mo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function resetMatterTraceId() {
    matterTraceId = `mo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerClientIdCallback(cb: ((id: string | null) => void) | null) {
    clientIdCallback = cb;
}

export function registerMatterIdCallback(cb: ((id: string | null) => void) | null) {
    matterIdCallback = cb;
}

export interface ProcessingResult {
    message: string;
    url?: string;
    cclQueuedAt?: string;
}

export interface ProcessingAction {
    label: string;
    icon?: string;
    run: (
        formData: Record<string, any>,
        userInitials: string,
        userData?: any[] | null
    ) => Promise<string | ProcessingResult>;
}

// Lightweight operation observer for admin/local dev diagnostics
export type OperationObserverEvent = {
    index: number; // current action index set by caller
    label: string;
    phase: 'sent' | 'response' | 'success' | 'error';
    url?: string;
    method?: string;
    status?: number;
    payloadSummary?: string;
    responseSummary?: string;
};

let operationObserver: ((e: OperationObserverEvent) => void) | null = null;
export function registerOperationObserver(cb: ((e: OperationObserverEvent) => void) | null) {
    operationObserver = cb;
}

// The current action index is set by the caller (simulateProcessing)
let currentActionIndex = -1;
export function setCurrentActionIndex(i: number) {
    currentActionIndex = i;
}

// Helper to keep requests observable without leaking sensitive bodies by default
async function instrumentedFetch(
    label: string,
    url: string,
    options: RequestInit = {},
    payloadForSummary?: unknown
): Promise<Response> {
    const headersWithTrace = {
        ...(options.headers || {}),
        'x-matter-trace-id': matterTraceId,
    };
    try {
        if (operationObserver) {
            const method = (options.method || 'GET').toString().toUpperCase();
            const payloadSummary = payloadForSummary ? summarize(payloadForSummary) : undefined;
            operationObserver({ index: currentActionIndex, label, phase: 'sent', url, method, payloadSummary });
        }
    } catch {}
    const resp = await fetch(url, { ...options, headers: headersWithTrace });
    try {
        if (operationObserver) {
            operationObserver({ index: currentActionIndex, label, phase: 'response', url, method: (options.method || 'GET').toString().toUpperCase(), status: resp.status });
        }
    } catch {}
    if (!resp.ok) {
        // On failure, include payload + response snippet
        let respText = '';
        try { respText = await resp.clone().text(); } catch {}
        try {
            if (operationObserver) {
                operationObserver({
                    index: currentActionIndex,
                    label,
                    phase: 'error',
                    url,
                    method: (options.method || 'GET').toString().toUpperCase(),
                    status: resp.status,
                    payloadSummary: payloadForSummary ? summarize(payloadForSummary) : undefined,
                    responseSummary: truncate(respText, 400)
                });
            }
        } catch {}
    } else {
        try {
            if (operationObserver) {
                operationObserver({ index: currentActionIndex, label, phase: 'success', url, method: (options.method || 'GET').toString().toUpperCase(), status: resp.status });
            }
        } catch {}
    }
    return resp;
}

function summarize(obj: unknown): string {
    try {
        return truncate(JSON.stringify(obj, (_k, v) => (typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v), 2), 600);
    } catch {
        return '[unserializable payload]';
    }
}

function truncate(text: string, max = 600): string {
    if (!text) return '';
    return text.length > max ? text.slice(0, max) + '…' : text;
}

export const processingActions: ProcessingAction[] = [
    {
        label: 'Retrieve ActiveCampaign Token',
        icon: activeIcon,
        run: async () => {
            const res = await instrumentedFetch('Retrieve ActiveCampaign Token', '/api/keys/ac-automations-apitoken');
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            acToken = data.value;
            return 'Token retrieved';
        }
    },
    {
        label: 'Refresh ActiveCampaign Token',
        icon: activeIcon,
        run: async () => {
            const resp = await instrumentedFetch('Refresh ActiveCampaign Token', '/api/refresh/activecampaign', { method: 'POST' });
            if (!resp.ok) throw new Error('ActiveCampaign token refresh failed');
            return 'Token refreshed';
        }
    },
    {
        label: 'Retrieve Clio Client ID',
        icon: clioIcon,
        run: async (_form, initials) => {
            const res = await instrumentedFetch('Retrieve Clio Client ID', `/api/keys/${initials.toLowerCase()}-clio-v1-clientid`);
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            clioClientId = data.value;
            return 'Client ID retrieved';
        }
    },
    {
        label: 'Retrieve Clio Client Secret',
        icon: clioIcon,
        run: async (_form, initials) => {
            const res = await instrumentedFetch('Retrieve Clio Client Secret', `/api/keys/${initials.toLowerCase()}-clio-v1-clientsecret`);
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            clioClientSecret = data.value;
            return 'Client Secret retrieved';
        }
    },
    {
        label: 'Retrieve Clio Refresh Token',
        icon: clioIcon,
        run: async (_form, initials) => {
            const res = await instrumentedFetch('Retrieve Clio Refresh Token', `/api/keys/${initials.toLowerCase()}-clio-v1-refreshtoken`);
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            clioRefreshToken = data.value;
            return 'Refresh Token retrieved';
        }
    },
    {
        label: 'Refresh Clio Access Token',
        icon: clioIcon,
        run: async (_form, initials) => {
            const resp = await instrumentedFetch('Refresh Clio Access Token', `/api/refresh/clio/${initials.toLowerCase()}`, {
                method: 'POST'
            });
            if (!resp.ok) throw new Error('Clio token refresh failed');
            return 'Access token refreshed';
        }
    },
    {
        label: 'Retrieve Asana Client ID',
        icon: asanaIcon,
        run: async (_form, _i, userData) => {
            const id = userData?.[0]?.ASANAClientID || userData?.[0]?.ASANAClient_ID;
            if (!id) {
                console.warn('⚠️ [processingActions] Asana Client ID missing from user profile');
                throw new Error('Asana Client ID missing from user profile. Please contact support to configure Asana integration.');
            }
            asanaClientId = id;
            return 'Client ID retrieved';
        }
    },
    {
        label: 'Retrieve Asana Secret',
        icon: asanaIcon,
        run: async (_form, _i, userData) => {
            const secret = userData?.[0]?.ASANASecret || userData?.[0]?.ASANA_Secret;
            if (!secret) {
                console.warn('⚠️ [processingActions] Asana Secret missing from user profile');
                throw new Error('Asana Secret missing from user profile. Please contact support to configure Asana integration.');
            }
            asanaSecret = secret;
            return 'Secret retrieved';
        }
    },
    {
        label: 'Retrieve Asana Refresh Token',
        icon: asanaIcon,
        run: async (_form, _i, userData) => {
            const token = userData?.[0]?.ASANARefreshToken || userData?.[0]?.ASANARefresh_Token;
            if (!token) {
                console.warn('⚠️ [processingActions] Asana Refresh Token missing from user profile');
                throw new Error('Asana Refresh Token missing from user profile. Please contact support to configure Asana integration.');
            }
            asanaRefreshToken = token;
            return 'Refresh Token retrieved';
        }
    },
    {
        label: 'Refresh Asana Access Token',
        icon: asanaIcon,
        run: async () => {
            const payload = { clientId: asanaClientId, clientSecret: asanaSecret, refreshToken: asanaRefreshToken };
            const resp = await instrumentedFetch('Refresh Asana Access Token', '/api/refresh/asana', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);
            if (!resp.ok) throw new Error('Asana token refresh failed');
            return 'Access token refreshed';
        }
    },
    {
        label: 'Opponent Details Updated',
        icon: clioIcon,
        run: async (formData, userInitials) => {
            const payload = {
                opponent: formData.opponent_details?.opponent || null,
                solicitor: formData.opponent_details?.solicitor || null,
                createdBy: userInitials
            };

            const resp = await instrumentedFetch('Opponent Details Updated', '/api/opponents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);

            if (!resp.ok) throw new Error('Failed to update opponent details');
            const data = await resp.json();
            opponentId = data.opponentId || '';
            solicitorId = data.solicitorId || '';
            return 'Opponent details updated';
        }
    },
    {
        label: 'Matter Request Created',
        icon: clioIcon,
        run: async (formData, userInitials) => {
            const payload = {
                instructionRef: formData.matter_details?.instruction_ref || null,
                clientType: formData.matter_details?.client_type || null,
                description: formData.matter_details?.description || null,
                practiceArea: formData.matter_details?.practice_area || null,
                value: formData.matter_details?.dispute_value || null,
                budgetRequired: formData.matter_details?.budget_required || null,
                budgetAmount: formData.matter_details?.budget_amount || null,
                budgetNotifyThreshold: formData.matter_details?.budget_notify_threshold || null,
                budgetNotifyUsers: formData.matter_details?.budget_notify_users || null,
                responsibleSolicitor: formData.team_assignments?.fee_earner || null,
                originatingSolicitor: formData.team_assignments?.originating_solicitor || null,
                supervisingPartner: formData.team_assignments?.supervising_partner || null,
                source: formData.source_details?.source || null,
                referrer: formData.source_details?.referrer_name || null,
                opponentId: opponentId || null,
                solicitorId: solicitorId || null,
                createdBy: userInitials
                // MatterID is excluded
            };

            const resp = await instrumentedFetch('Matter Request Created', '/api/matter-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);

            if (!resp.ok) throw new Error('Failed to record matter request');
            const data = await resp.json();
            matterRequestId = data.matterId || null;
            return data.message || 'Matter request recorded; further IDs will be patched in later steps';
        }
    },

    { label: 'Contact Created/Updated', icon: activeIcon, run: async () => 'Done' },
    { label: 'Databases Updated', icon: helixBlueMark, run: async () => 'Done' },
    {
        label: 'Clio Contact Created/Updated',
        icon: clioIcon,
        run: async (formData, userInitials) => {
            const payload = { formData, initials: userInitials };
            const resp = await instrumentedFetch('Clio Contact Created/Updated', '/api/clio-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);
            if (!resp.ok) throw new Error('Failed to sync Clio contact');
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Failed to sync Clio contact');
            const names: string[] = [];
            let emptyTotal = 0;
            clioContactIds = [];
            clioCompanyId = null;
            (data.results || []).forEach((r: any) => {
                const attrs = r.data?.attributes || {};
                const id = r.data?.id;
                if (typeof r.emptyFieldCount === 'number') {
                    emptyTotal += r.emptyFieldCount;
                }
                if (id) {
                    clioContactIds.push(String(id));
                }
                if (r.data?.type === 'Company') {
                    clioCompanyId = String(id);
                }
                if (attrs.first_name || attrs.last_name) {
                    names.push(`${attrs.first_name || ''} ${attrs.last_name || ''}`.trim());
                } else if (attrs.name) {
                    names.push(attrs.name);
                }
            });
            const person = (data.results || []).find((r: any) => r.data?.type === 'Person');
            const newId = person?.data?.id ? String(person.data.id) : null;
            if (newId && clientIdCallback) {
                clientIdCallback(newId);
            }
            return `Clio contacts synced: ${names.join(', ')} (${emptyTotal} empty fields)`;
        }
    },
    { label: 'NetDocument Workspace Triggered', icon: netdocsIcon, run: async () => 'Done' },
    { label: 'Databases Updated', icon: helixBlueMark, run: async () => 'Done' },
    {
        label: 'Clio Matter Opened',
        icon: clioIcon,
        run: async (formData, userInitials) => {
            const payload = { formData, initials: userInitials, contactIds: clioContactIds, companyId: clioCompanyId };
            const resp = await instrumentedFetch('Clio Matter Opened', '/api/clio-matters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);
            if (!resp.ok) throw new Error('Failed to create Clio matter');
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Failed to create Clio matter');
            const id = data.matterId || data.matter?.id || null;
            matterId = id ? String(id) : null;
            matterDisplayNumber = data.matter?.display_number || data.matter?.displayNumber || null;
            if (matterId && matterIdCallback) matterIdCallback(matterId);
            return `Matter created with ID ${matterId}`;
        }
    },
    {
        label: 'Instructions Database Synced',
        icon: helixBlueMark,
        run: async (formData, userInitials) => {
            const instructionRef = formData.matter_details?.instruction_ref;
            const clientId = clioContactIds[0]; // Use first contact ID (main client)
            
            if (!instructionRef) {
                console.warn('No instruction reference available for sync');
                return 'Skipped - no instruction reference';
            }
            
            if (!clientId) {
                console.warn('No client ID available for sync');
                return 'Skipped - no client ID';
            }
            
            const payload = {
                instructionRef,
                clientId,
                matterId: matterId || null
            };
            
            const resp = await instrumentedFetch('Instructions Database Synced', '/api/sync-instruction-client/link-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);
            
            if (!resp.ok) {
                const errorText = await resp.text();
                throw new Error(`Failed to sync Instructions database: ${errorText}`);
            }
            
            const data = await resp.json();
            if (matterRequestId) {
                const patchPayload = {
                    instructionRef,
                    clientId,
                    displayNumber: matterDisplayNumber || null,
                    clioMatterId: matterId || null
                };
                const patchResp = await instrumentedFetch('Matter Request Patched', `/api/matter-requests/${encodeURIComponent(matterRequestId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patchPayload)
                }, patchPayload);
                if (!patchResp.ok) {
                    const patchError = await patchResp.text();
                    console.warn('Failed to patch matter request:', patchError);
                    return `Instructions table updated with Client ID ${clientId}${matterId ? ` and Matter ID ${matterId}` : ''}`;
                }
                const patchData = await patchResp.json();
                return {
                    message: `Instructions table updated with Client ID ${clientId}${matterId ? ` and Matter ID ${matterId}` : ''}`,
                    cclQueuedAt: patchData?.cclQueuedAt || undefined,
                };
            }
            return `Instructions table updated with Client ID ${clientId}${matterId ? ` and Matter ID ${matterId}` : ''}`;
        }
    },
    {
        label: 'CCL AI Fill',
        icon: cclIcon,
        run: async (formData, _initials) => {
            const id = matterId || formData.matter_details?.matter_ref;
            if (!id) return 'Skipped — no matter ID available';

            const payload = {
                matterId: id,
                instructionRef: formData.matter_details?.instruction_ref || '',
                practiceArea: formData.matter_details?.practice_area || formData.matter_details?.area_of_work || '',
                description: formData.matter_details?.description || '',
                clientName: (() => {
                    const c = formData.client_information?.[0];
                    return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : '';
                })(),
                opponent: formData.opponent_details?.opponent?.first_name
                    ? `${formData.opponent_details.opponent.first_name} ${formData.opponent_details.opponent.last_name || ''}`.trim()
                    : '',
                handlerName: formData.team_assignments?.fee_earner || '',
            };

            const resp = await instrumentedFetch('CCL AI Fill', '/api/ccl-ai/fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);

            if (!resp.ok) throw new Error('CCL AI fill failed');
            const data = await resp.json();
            return `AI fill complete — ${Object.keys(data.fields || {}).length} fields populated`;
        }
    },
    {
        label: 'Draft CCL Generated',
        icon: cclIcon,
        run: async (formData, _initials) => {
            const id = matterId || formData.matter_details?.matter_ref;
            if (!id) return 'Skipped — no matter ID available';

            const payload = { matterId: id, draftJson: formData };
            const resp = await instrumentedFetch('Draft CCL Generated', '/api/ccl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, payload);

            if (!resp.ok) throw new Error('CCL generation failed');
            const { url } = await resp.json();
            return { message: 'Draft CCL created', url };
        }
    }
];

// invisible change 2.2

export const initialSteps: ProcessingStep[] = processingActions.map(action => ({
    label: action.label,
    status: 'pending',
    icon: action.icon
}));