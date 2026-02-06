// RateChangeModal.tsx
// Clean ledger-style rate change notification tracker

import React, { useState, useCallback, useMemo, useEffect, useTransition, useRef } from 'react';
import {
    Modal,
    IconButton,
    Icon,
    Spinner,
    SpinnerSize,
    TextField,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { isAdminUser } from '../../app/admin';
import type { UserData } from '../../app/functionality/types';
import type { MatterUpdateEvent, MatterUpdateCallback } from './useRateChangeData';

// Inject button styles
const buttonStyles = `
.rc-btn {
    transition: all 0.1s ease;
    user-select: none;
    position: relative;
    overflow: hidden;
}
.rc-btn:hover {
    filter: brightness(1.1);
}
.rc-btn:active {
    transform: scale(0.97);
    filter: brightness(0.95);
}
.rc-btn-primary {
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.rc-btn-primary:hover {
    box-shadow: 0 2px 8px rgba(54,144,206,0.4);
}
.rc-btn-secondary:hover {
    background: rgba(255,255,255,0.08) !important;
}
.rc-btn-ghost:hover {
    background: rgba(255,255,255,0.05) !important;
}
.rc-chip {
    transition: all 0.1s ease;
}
.rc-chip:hover {
    filter: brightness(1.05);
}
.rc-chip:active {
    transform: scale(0.97);
}
.rc-toast {
    animation: slideUp 0.2s ease;
}
@keyframes slideUp {
    from { opacity: 0; transform: translate(-50%, 10px); }
    to { opacity: 1; transform: translate(-50%, 0); }
}
.rc-row:hover {
    background: rgba(255,255,255,0.02) !important;
}
.rc-urgency-banner {
    animation: urgencyFadeIn 0.6s ease-out forwards, urgencyPulse 4s ease-in-out 2s infinite;
}
@keyframes urgencyFadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes urgencyPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
}
.rc-urgency-icon {
    animation: urgencyIconPulse 2s ease-in-out infinite;
}
@keyframes urgencyIconPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
}
.rc-urgency-dismiss {
    opacity: 0;
    transition: opacity 0.2s ease;
}
.rc-urgency-banner:hover .rc-urgency-dismiss {
    opacity: 1;
}
`;

export interface RateChangeMatter {
    matter_id: string;
    display_number: string;
    responsible_solicitor: string;
    originating_solicitor?: string;
    practice_area?: string;
    status?: string;
    open_date?: string;
    close_date?: string;
    ccl_date?: string | null;
}

export interface RateChangeClient {
    client_id: string;
    client_name: string;
    client_first_name?: string;
    client_last_name?: string;
    client_email?: string;
    open_matters: RateChangeMatter[];
    closed_matters: RateChangeMatter[];
    responsible_solicitors: string[];
    originating_solicitors?: string[];
    status: 'pending' | 'sent' | 'not_applicable';
    sent_date?: string;
    sent_by?: string;
    escalated_at?: string | null;
    escalated_by?: string | null;
    na_reason?: string;
    na_notes?: string;
    // Persisted server-side signal that at least one open matter has a CCL date set.
    ccl_confirmed?: boolean;
}

/** Minimal team member info for inactive detection */
interface TeamMemberInfo {
    "Full Name"?: string;
    First?: string;
    Last?: string;
    Nickname?: string;
    Email?: string;
    Initials?: string;
    status?: string;
}

interface RateChangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    year: number;
    clients: RateChangeClient[];
    migrateSourceClients?: RateChangeClient[];
    stats: { total: number; pending: number; sent: number; not_applicable: number };
    currentUserName: string;
    userData?: UserData | null;
    teamData?: TeamMemberInfo[] | null;
    onMarkSent: (clientId: string, clientData: Partial<RateChangeClient>, sentDate?: string) => Promise<void>;
    onMarkNA: (clientId: string, reason: string, notes: string, clientData: Partial<RateChangeClient>) => Promise<void>;
    onMarkSentStreaming: (clientId: string, clientData: Partial<RateChangeClient>, onUpdate: MatterUpdateCallback, sentDate?: string) => Promise<void>;
    onMarkNAStreaming: (clientId: string, reason: string, notes: string, clientData: Partial<RateChangeClient>, onUpdate: MatterUpdateCallback) => Promise<void>;
    onUndo: (clientId: string, matters: { matter_id: string; display_number: string }[]) => Promise<void>;
    onUndoStreaming: (clientId: string, matters: { matter_id: string; display_number: string }[], onUpdate: MatterUpdateCallback) => Promise<void>;
    onRefresh: () => Promise<void>;
    isLoading: boolean;
    isDarkMode: boolean;
}

/** State for tracking streaming progress per matter */
interface MatterProgress {
    displayNumber: string;
    status: 'pending' | 'updating' | 'success' | 'failed' | 'skipped';
    error?: string;
    message?: string;
}

interface Toast { id: string; message: string; type: 'success' | 'error'; }

const NA_REASONS = [
    { key: 'closed', text: 'Closed/Archived' },
    { key: 'enforcement', text: 'Enforcement' },
    { key: 'stays_open', text: 'Stays Open' },
    { key: 'fixed_fee', text: 'Fixed Fee' },
    { key: 'test_file', text: 'Test File' },
    { key: 'custom', text: 'Custom' },
];

const RateChangeModal: React.FC<RateChangeModalProps> = ({
    isOpen, onClose, year, clients, stats, currentUserName, userData, teamData,
    onMarkSent, onMarkNA, onMarkSentStreaming, onMarkNAStreaming, onUndo, onUndoStreaming, onRefresh, isLoading, isDarkMode,
    migrateSourceClients,
}) => {
    const isAdmin = isAdminUser(userData);
    const [viewMode, setViewMode] = useState<'mine' | 'all' | 'inactive'>('mine');
    const [roleFilter, setRoleFilter] = useState<'responsible' | 'originating' | 'both'>('both');
    const [filter, setFilter] = useState<'pending' | 'sent' | 'not_applicable' | 'migrate'>('pending');
    const [inputTerm, setInputTerm] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmClient, setConfirmClient] = useState<RateChangeClient | null>(null);
    const [confirmAction, setConfirmAction] = useState<'sent' | 'na' | 'undo' | 'ccl-date' | null>(null);
    const [naReason, setNaReason] = useState<string>('');
    const [customReason, setCustomReason] = useState<string>('');
    const [naNotes, setNaNotes] = useState<string>('');
    const [sentDate, setSentDate] = useState<string>(() => new Date().toISOString().split('T')[0]); // Default to today
    const [cclDate, setCclDate] = useState<string>(() => new Date().toISOString().split('T')[0]); // Default to today
    const [cclMatterSelections, setCclMatterSelections] = useState<Record<string, boolean>>({});
    const [cclMatterDates, setCclMatterDates] = useState<Record<string, string>>({});
    const [processingClients, setProcessingClients] = useState<Set<string>>(new Set());
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [showTemplate, setShowTemplate] = useState<boolean>(false);
    const [showCopyConfirm, setShowCopyConfirm] = useState<boolean>(false);
    const [openDateFilter, setOpenDateFilter] = useState<string>('all');
    const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
    const [originatingFilter, setOriginatingFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<'opened' | 'client' | 'solicitor'>('opened');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [, startTransition] = useTransition();

    // Clio verification state - tracks which matters have been verified and any mismatches found
    const [clioVerificationCache, setClioVerificationCache] = useState<Record<string, {
        verified: boolean;
        loading: boolean;
        mismatch: boolean;
        syncing?: boolean;
        synced?: boolean;
        syncError?: string;
        clioResponsible?: string;
        clioOriginating?: string;
        sqlResponsible?: string;
        sqlOriginating?: string;
    }>>({});
    const [verifyingMatters, setVerifyingMatters] = useState<Set<string>>(new Set());
    const [syncingMatters, setSyncingMatters] = useState<Set<string>>(new Set());

    // Escalation selection + UI marker (front-end only)
    const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
    const [localEscalatedAtByClientId, setLocalEscalatedAtByClientId] = useState<Map<string, string>>(new Map());
    const [isEscalating, setIsEscalating] = useState<boolean>(false);

    const toggleSort = useCallback((field: 'opened' | 'client' | 'solicitor') => {
        if (field === sortField) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    }, [sortField]);
    
    // Streaming progress state - for real-time Clio updates UI
    const [isStreaming, setIsStreaming] = useState<boolean>(false);
    const [streamingStep, setStreamingStep] = useState<string>('');
    const [matterProgress, setMatterProgress] = useState<MatterProgress[]>([]);
    const [streamingSummary, setStreamingSummary] = useState<{ success: number; failed: number; skipped?: number; total: number } | null>(null);
    const [streamingComplete, setStreamingComplete] = useState<boolean>(false);
    const [streamingAllSucceeded, setStreamingAllSucceeded] = useState<boolean>(false);

    // Tracks clients whose CCL Date action has succeeded this session (so dots stay lit immediately).
    const [cclConfirmedClientIds, setCclConfirmedClientIds] = useState<Set<string>>(new Set());
    
    // Urgency banner state - dismissed per session
    const [showUrgencyBanner, setShowUrgencyBanner] = useState<boolean>(true);
    
    // Migrate tab state
    const [migrateUnlocked, setMigrateUnlocked] = useState<boolean>(isAdmin);
    const [showPasscodeModal, setShowPasscodeModal] = useState<boolean>(false);
    const [passcodeInput, setPasscodeInput] = useState<string>('');
    const [passcodeError, setPasscodeError] = useState<string>('');
    const [passcodeAction, setPasscodeAction] = useState<'migrate' | 'undo'>('migrate');
    
    // Undo state - requires passcode
    const [undoUnlocked, setUndoUnlocked] = useState<boolean>(false);
    const [pendingUndoClient, setPendingUndoClient] = useState<RateChangeClient | null>(null);
    const [migrateClient, setMigrateClient] = useState<RateChangeClient | null>(null);
    const [migrateFormData, setMigrateFormData] = useState<{
        first_name: string;
        last_name: string;
        email: string;
        display_numbers: string[];
    }>({ first_name: '', last_name: '', email: '', display_numbers: [] });
    const [migrateStep, setMigrateStep] = useState<'form' | 'lookup' | 'db' | 'done'>('form');
    const [migrateError, setMigrateError] = useState<string>('');

    // Ref to track row visibility for lazy-loading Clio verification
    const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);
    useEffect(() => {
        setMigrateUnlocked(isAdmin);
        if (!isAdmin) {
            setShowPasscodeModal(false);
        }
    }, [isAdmin]);

    // Parse current rate and role from userData
    const { currentRate, userRole } = useMemo(() => {
        const u: any = Array.isArray(userData) ? (userData?.[0] ?? null) : userData;
        if (!u) return { currentRate: null, userRole: null };
        const rateRaw = u.Rate ?? u.rate ?? u.HourlyRate ?? u.hourlyRate;
        const roleRaw = u.Role ?? u.role ?? u.RoleName ?? u.roleName;
        const rateNum = rateRaw == null ? null : (typeof rateRaw === 'number' ? rateRaw : parseFloat(String(rateRaw).replace(/[^0-9.\-]/g, '')));
        return {
            currentRate: rateNum != null && isFinite(rateNum) ? rateNum : null,
            userRole: roleRaw ? String(roleRaw).trim() : null,
        };
    }, [userData]);

    const normalizePersonName = useCallback((value: string): string => {
        return String(value || '')
            .toLowerCase()
            .trim()
            .normalize('NFKD')
            // normalize straight/curly apostrophes and remove punctuation/whitespace
            .replace(/[’']/g, '')
            .replace(/[^a-z0-9]/g, '');
    }, []);

    const signatureInitials = useMemo(() => {
        const u: any = Array.isArray(userData) ? (userData?.[0] ?? null) : userData;
        const fromUserData = String(u?.Initials || u?.initials || '').trim().toUpperCase();
        if (fromUserData) return fromUserData;

        // Fallback: attempt to resolve from team data by current user name
        const me = String(currentUserName || '').trim();
        if (!me || !teamData) return '';

        const meNorm = normalizePersonName(me);
        for (const member of teamData) {
            const full = normalizePersonName(String((member as any)["Full Name"] || ''));
            const first = normalizePersonName(String((member as any).First || ''));
            const last = normalizePersonName(String((member as any).Last || ''));
            const combined = first && last ? `${first}${last}` : '';
            if (meNorm && (meNorm === full || meNorm === combined || (full && full.includes(meNorm)))) {
                const initials = String((member as any).Initials || '').trim().toUpperCase();
                if (initials) return initials;
            }
        }
        return '';
    }, [userData, currentUserName, teamData, normalizePersonName]);

    // Standard rate increase amount (£25 for 2026)
    const RATE_INCREASE = 25;
    const newRate = currentRate != null ? currentRate + RATE_INCREASE : null;

    // Format rate as GBP
    const formatRate = (rate: number | null) => {
        if (rate == null) return '[RATE]';
        return `${rate.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    // Email template for rate change notification with actual rates
    const emailTemplate = useMemo(() => `Dear [Client Name],

We last increased our rates in January 2024. Since then CPI & RPI have had cumulative increases of around 8%.

We are therefore increasing our rates in line with inflation. We are also introducing a new higher hourly rate for senior partners.

From 1 January ${year} our hourly rates will be:

Senior Partner        £475
Partner               £425
Associate Solicitor   £350
Solicitor             £310
Trainee/paralegal     £210

If you have any questions about how this will affect your matter please let me know.

Kind regards,
${currentUserName || '[Your Name]'}`, [year, newRate, currentRate, currentUserName]);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
    }, []);

    // Clear selections when leaving pending view
    useEffect(() => {
        if (filter !== 'pending') {
            setSelectedClientIds(new Set());
        }
    }, [filter]);

    // Helper to match user name against solicitor name
    const matchesSolicitor = useCallback((solicitorName: string) => {
        if (!currentUserName) return false;
        const nameParts = currentUserName.toLowerCase().split(/\s+/);
        const lastName = nameParts[nameParts.length - 1];
        const solicitor = solicitorName.toLowerCase();
        // Match by last name (handles Sam vs Samuel Packwood)
        if (lastName && solicitor.includes(lastName)) return true;
        // Also match if all parts are included (for exact matches)
        return nameParts.every(part => solicitor.includes(part));
    }, [currentUserName]);

    // Build set of active team member names for inactive detection
    // Must be defined before myClients which depends on it
    const activeTeamNames = useMemo(() => {
        const names = new Set<string>();
        if (!teamData) return names;
        
        teamData.forEach(member => {
            const status = String(member.status ?? '').trim().toLowerCase();
            if (!status || status === 'active') {
                // Add various name forms for matching
                const fullName = normalizePersonName(member["Full Name"] || '');
                const firstName = normalizePersonName(member.First || '');
                const lastName = normalizePersonName(member.Last || '');
                const nickname = normalizePersonName(member.Nickname || '');
                
                if (fullName) names.add(fullName);
                if (firstName && lastName) names.add(`${firstName}${lastName}`);
                if (nickname && lastName) names.add(`${nickname}${lastName}`);
            }
        });
        return names;
    }, [teamData]);

    // Helper to check if a solicitor name matches an active team member
    // Must be defined before myClients which depends on it
    const isActiveSolicitor = useCallback((solicitorName: string) => {
        if (!teamData || activeTeamNames.size === 0) return true; // Assume active if no team data
        const normalized = normalizePersonName(solicitorName);
        
        // Direct match
        if (activeTeamNames.has(normalized)) return true;
        
        // Partial match - check if any active name contains all parts of solicitor name
        const parts = normalized.split(/\s+/);
        for (const activeName of activeTeamNames) {
            if (parts.every(part => activeName.includes(part))) return true;
        }
        
        return false;
    }, [teamData, activeTeamNames, normalizePersonName]);

    const getTeamEmailForName = useCallback((name: string): string | null => {
        const raw = String(name || '').trim();
        if (!raw || !teamData) return null;

        const normalizedNeedle = normalizePersonName(raw);
        if (!normalizedNeedle) return null;

        const candidates: Array<{ email: string; score: number }> = [];

        for (const member of teamData) {
            const email = String((member as any).Email || '').trim();
            if (!email) continue;

            const fullName = normalizePersonName(String((member as any)["Full Name"] || ''));
            const first = normalizePersonName(String((member as any).First || ''));
            const last = normalizePersonName(String((member as any).Last || ''));
            const nick = normalizePersonName(String((member as any).Nickname || ''));

            const nameForms = [
                fullName,
                (first && last) ? `${first}${last}` : '',
                (nick && last) ? `${nick}${last}` : '',
            ].filter(Boolean);

            const matches = nameForms.some(form => form && (form === normalizedNeedle || form.includes(normalizedNeedle) || normalizedNeedle.includes(form)));
            if (!matches) continue;

            // Prefer exact full name matches, then more parts matched
            const score = (nameForms.includes(normalizedNeedle) ? 10 : 0) + normalizedNeedle.length;
            candidates.push({ email, score });
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].email;
    }, [teamData]);

        const buildGroupedEscalationEmailHtml = useCallback((recipientName: string, items: RateChangeClient[]) => {
            const firstName = String(recipientName || '').trim().split(/\s+/).filter(Boolean)[0] || '';
                const rowsHtml = items.map((client) => {
                        const matters = client.open_matters || [];
                        const mattersHtml = matters.length
                                ? `<ul style="margin: 6px 0 0 18px; padding: 0;">${matters.map(m => `<li><strong>${m.display_number}</strong>${m.practice_area ? ` — ${m.practice_area}` : ''}</li>`).join('')}</ul>`
                                : '<div style="margin-top: 6px;">No open matters listed.</div>';

                        const resp = Array.from(new Set((client.responsible_solicitors || []).filter(Boolean))).join(', ') || '—';
                        const orig = Array.from(new Set((client.originating_solicitors || []).filter(Boolean))).join(', ') || '—';

                        return `
<div style="padding: 10px; border: 1px solid #E5E7EB; background: #F9FAFB; margin-top: 10px;">
    <div><strong>Client:</strong> ${client.client_name}</div>
    <div style="margin-top: 6px;"><strong>Open matters:</strong>${mattersHtml}</div>
    <div style="margin-top: 10px;"><strong>Responsible:</strong> ${resp}</div>
    <div style="margin-top: 4px;"><strong>Originating:</strong> ${orig}</div>
</div>`;
                }).join('');

                return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111;">
    <p><strong>Rate change notice escalation</strong></p>
    <p>Hi ${firstName || 'there'},</p>
    <p>Please action the outstanding rate change notice(s) for the following client${items.length === 1 ? '' : 's'}:</p>
    ${rowsHtml}
    <p style="margin-top: 14px;">Action required:</p>
    <ol style="margin: 8px 0 0 18px; padding: 0;">
        <li>Send the client the rate change notice (template available in Helix Hub → Home → Rate Change Notices).</li>
        <li>Then mark the client as <strong>Sent</strong> (or <strong>N/A</strong> with a reason) in the Rate Change Notices tracker.</li>
    </ol>
</div>`;
        }, []);

    const handleEscalateSelected = useCallback(async () => {
        if (filter !== 'pending') return;
        const ids = Array.from(selectedClientIds);
        if (ids.length === 0) return;

        setIsEscalating(true);
        let successCount = 0;
        let failCount = 0;

        try {
            // Build per-recipient grouping (responsible only; if no active responsible, originating)
            const groups = new Map<string, { recipientName: string; recipientEmail: string; clients: RateChangeClient[] }>();

            for (const clientId of ids) {
                const client = clients.find(c => c.client_id === clientId);
                if (!client) continue;

                const responsibleNames = Array.from(new Set((client.responsible_solicitors || []).filter(Boolean)));
                const originatingNames = Array.from(new Set((client.originating_solicitors || []).filter(Boolean)));

                const activeResponsible = responsibleNames.filter(n => isActiveSolicitor(n));

                // Choose a single action owner to avoid duplicate/noisy sends
                const chosenName = (activeResponsible[0] || originatingNames[0] || '').trim();
                const chosenEmail = chosenName ? getTeamEmailForName(chosenName) : null;

                if (!chosenName || !chosenEmail) {
                    failCount++;
                    continue;
                }

                const key = chosenEmail.toLowerCase();
                const existing = groups.get(key);
                if (existing) {
                    existing.clients.push(client);
                } else {
                    groups.set(key, { recipientName: chosenName, recipientEmail: chosenEmail, clients: [client] });
                }
            }

            // Send one email per recipient
            for (const group of groups.values()) {
                const emailHtml = buildGroupedEscalationEmailHtml(group.recipientName, group.clients);
                const subject = `Rate change notice escalation (${group.clients.length})`;

                const response = await fetch('/api/sendEmail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: group.recipientEmail,
                        subject,
                        from_email: 'automations@helix-law.com',
                        body_html: emailHtml,
                        use_personal_signature: true,
                        signature_initials: signatureInitials,
                    }),
                });

                if (!response.ok) {
                    failCount += group.clients.length;
                    continue;
                }

                // Persist escalation (date + who) for each client in the group
                const nowIso = new Date().toISOString();
                for (const client of group.clients) {
                    try {
                        const persistResponse = await fetch(`/api/rate-changes/${encodeURIComponent(String(year))}/mark-escalated`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                client_id: client.client_id,
                                escalated_by: currentUserName || null,
                            }),
                        });

                        if (persistResponse.ok) {
                            const payload = await persistResponse.json().catch(() => null);
                            const iso = payload && typeof payload.escalated_at === 'string' ? payload.escalated_at : nowIso;
                            setLocalEscalatedAtByClientId(prev => {
                                const next = new Map(prev);
                                next.set(client.client_id, iso);
                                return next;
                            });
                            successCount++;
                        } else {
                            setLocalEscalatedAtByClientId(prev => {
                                const next = new Map(prev);
                                next.set(client.client_id, nowIso);
                                return next;
                            });
                            failCount++;
                        }
                    } catch {
                        setLocalEscalatedAtByClientId(prev => {
                            const next = new Map(prev);
                            next.set(client.client_id, nowIso);
                            return next;
                        });
                        failCount++;
                    }
                }
            }

            if (successCount > 0 && failCount === 0) {
                showToast(`Escalated ${successCount} client${successCount === 1 ? '' : 's'}`);
            } else if (successCount > 0 && failCount > 0) {
                showToast(`Escalated ${successCount}, failed ${failCount}`, 'error');
            } else {
                showToast('No escalations sent (missing emails?)', 'error');
            }
        } catch (err) {
            console.error('[RateChangeModal] Escalation error:', err);
            showToast('Escalation failed', 'error');
        } finally {
            setIsEscalating(false);
        }
    }, [filter, selectedClientIds, clients, isActiveSolicitor, getTeamEmailForName, buildGroupedEscalationEmailHtml, showToast, year, currentUserName, signatureInitials]);

    const getEscalatedAtIso = useCallback((client: RateChangeClient): string | null => {
        const serverValue = client.escalated_at;
        if (typeof serverValue === 'string' && serverValue) return serverValue;
        const localValue = localEscalatedAtByClientId.get(client.client_id);
        return localValue || null;
    }, [localEscalatedAtByClientId]);

    const formatShortDate = useCallback((iso: string | null): string => {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }, []);

    const myClients = useMemo(() => {
        if (!currentUserName) return [];
        
        // Filter based on roleFilter setting
        // Also include matters where responsible is inactive but user is originating (rescue scenario)
        return clients.filter(c => {
            const isResponsible = c.responsible_solicitors.some(matchesSolicitor);
            const isOriginating = (c.originating_solicitors || []).some(matchesSolicitor);
            
            // Check if this is a "rescue" scenario - responsible is inactive, user is originating
            const hasInactiveResponsible = teamData && activeTeamNames.size > 0 && 
                c.responsible_solicitors.some(s => !isActiveSolicitor(s));
            const shouldRescue = hasInactiveResponsible && isOriginating;
            
            switch (roleFilter) {
                case 'responsible':
                    return isResponsible;
                case 'originating':
                    return isOriginating || shouldRescue; // Include rescue matters
                case 'both':
                default:
                    return isResponsible || isOriginating || shouldRescue;
            }
        });
    }, [clients, currentUserName, roleFilter, matchesSolicitor, teamData, activeTeamNames, isActiveSolicitor]);

    // Set of client IDs that belong to current user (for checking if they can action)
    const myClientIds = useMemo(() => new Set(myClients.map(c => c.client_id)), [myClients]);

    // Check if user can action a client (admin can action all, non-admin only their own)
    const canActionClient = useCallback((clientId: string) => {
        return isAdmin || myClientIds.has(clientId);
    }, [isAdmin, myClientIds]);

    // Clients where at least one responsible OR originating solicitor is inactive
    const inactiveClients = useMemo(() => {
        if (!teamData || activeTeamNames.size === 0) return [];
        
        return clients.filter(c => {
            const hasInactiveResponsible = c.responsible_solicitors.some(s => !isActiveSolicitor(s));
            const hasInactiveOriginating = (c.originating_solicitors || []).some(s => !isActiveSolicitor(s));
            return hasInactiveResponsible || hasInactiveOriginating;
        });
    }, [clients, teamData, activeTeamNames, isActiveSolicitor]);

    const inactiveStats = useMemo(() => ({
        total: inactiveClients.length,
        pending: inactiveClients.filter(c => c.status === 'pending').length,
        sent: inactiveClients.filter(c => c.status === 'sent').length,
        not_applicable: inactiveClients.filter(c => c.status === 'not_applicable').length,
    }), [inactiveClients]);

    const myStats = useMemo(() => ({
        total: myClients.length,
        pending: myClients.filter(c => c.status === 'pending').length,
        sent: myClients.filter(c => c.status === 'sent').length,
        not_applicable: myClients.filter(c => c.status === 'not_applicable').length,
    }), [myClients]);

    const currentStats = viewMode === 'mine' ? myStats : viewMode === 'inactive' ? inactiveStats : stats;
    const currentClients = viewMode === 'mine' ? myClients : viewMode === 'inactive' ? inactiveClients : clients;

    // Get unique years from open matters for filter dropdown
    const availableYears = useMemo(() => {
        const sourceClients = filter === 'migrate' ? (migrateSourceClients || clients) : currentClients;
        const years = new Set<number>();
        sourceClients.forEach(c => {
            c.open_matters.forEach(m => {
                if (m.open_date) {
                    const year = new Date(m.open_date).getFullYear();
                    if (!isNaN(year)) years.add(year);
                }
            });
        });
        return Array.from(years).sort((a, b) => b - a); // Most recent first
    }, [clients, currentClients, filter, migrateSourceClients]);

    // Get unique responsible solicitors for filter dropdown - from ALL clients so filters work across views
    const availableResponsibleSolicitors = useMemo(() => {
        const solicitors = new Set<string>();
        clients.forEach(c => {
            c.responsible_solicitors.forEach(s => {
                if (s && s.trim()) solicitors.add(s.trim());
            });
        });
        return Array.from(solicitors).sort((a, b) => a.localeCompare(b));
    }, [clients]);

    // Get unique originating solicitors for filter dropdown - from ALL clients
    const availableOriginatingSolicitors = useMemo(() => {
        const solicitors = new Set<string>();
        clients.forEach(c => {
            (c.originating_solicitors || []).forEach(s => {
                if (s && s.trim()) solicitors.add(s.trim());
            });
        });
        return Array.from(solicitors).sort((a, b) => a.localeCompare(b));
    }, [clients]);

    const filteredClients = useMemo(() => {
        // Base list depends on the selected tab
        // - migrate: show all sent/N/A clients from all clients (not just mine/all view)
        // - otherwise: filter by selected status and mine/all view
        let result =
            filter === 'migrate'
                ? (migrateSourceClients || clients).filter(c => c.status === 'sent' || c.status === 'not_applicable')
                : currentClients.filter(c => c.status === filter);
        
        // Filter by open date year
        if (openDateFilter !== 'all') {
            const filterYear = parseInt(openDateFilter);
            result = result.filter(c => 
                c.open_matters.some(m => {
                    if (!m.open_date) return false;
                    const matterYear = new Date(m.open_date).getFullYear();
                    return matterYear === filterYear;
                })
            );
        }

        // Filter by responsible solicitor
        if (responsibleFilter !== 'all') {
            result = result.filter(c => 
                c.responsible_solicitors.some(s => s === responsibleFilter)
            );
        }

        // Filter by originating solicitor
        if (originatingFilter !== 'all') {
            result = result.filter(c => 
                (c.originating_solicitors || []).some(s => s === originatingFilter)
            );
        }
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(c => 
                c.client_name?.toLowerCase().includes(term) ||
                c.open_matters.some(m => m.display_number?.toLowerCase().includes(term))
            );
        }
        
        const getEarliestDate = (client: RateChangeClient) => {
            const dates = client.open_matters
                .filter(m => m.open_date)
                .map(m => new Date(m.open_date!).getTime());
            return dates.length > 0 ? Math.min(...dates) : Infinity;
        };

        const getPrimarySolicitor = (client: RateChangeClient) => {
            return (client.responsible_solicitors[0] || '').toLowerCase();
        };

        // Sort by active column
        result = [...result].sort((a, b) => {
            const dir = sortDir === 'asc' ? 1 : -1;
            if (sortField === 'opened') {
                const dateA = getEarliestDate(a);
                const dateB = getEarliestDate(b);
                if (dateA === dateB) return 0;
                return dir * (dateA - dateB);
            }
            if (sortField === 'client') {
                return dir * (a.client_name || '').localeCompare(b.client_name || '');
            }
            // solicitor
            return dir * getPrimarySolicitor(a).localeCompare(getPrimarySolicitor(b));
        });
        
        return result;
    }, [clients, currentClients, filter, migrateSourceClients, searchTerm, openDateFilter, responsibleFilter, originatingFilter, sortField, sortDir]);

    // Verify matter against Clio to check for responsible/originating mismatches
    const verifyMatterAgainstClio = useCallback(async (displayNumber: string, sqlResponsible?: string, sqlOriginating?: string) => {
        // Skip if already verified or currently loading
        if (clioVerificationCache[displayNumber]?.verified || verifyingMatters.has(displayNumber)) {
            return;
        }

        setVerifyingMatters(prev => new Set(prev).add(displayNumber));
        setClioVerificationCache(prev => ({
            ...prev,
            [displayNumber]: { verified: false, loading: true, mismatch: false }
        }));

        try {
            const response = await fetch(`/api/rate-changes/verify-matter/${encodeURIComponent(displayNumber)}`);
            if (!response.ok) {
                throw new Error('Failed to verify matter');
            }
            
            const data = await response.json();
            if (data?.rate_limited) {
                // Clio rate limited; treat as a non-blocking verification skip.
                setClioVerificationCache(prev => ({
                    ...prev,
                    [displayNumber]: {
                        verified: true,
                        loading: false,
                        mismatch: false,
                        sqlResponsible,
                        sqlOriginating,
                    }
                }));
                return;
            }
            const clioResponsible = data.responsible_attorney?.name || '';
            const clioOriginating = data.originating_attorney?.name || '';
            
            // Check for mismatches (case-insensitive comparison)
            const responsibleMismatch = sqlResponsible && clioResponsible && 
                sqlResponsible.toLowerCase().trim() !== clioResponsible.toLowerCase().trim();
            const originatingMismatch = sqlOriginating && clioOriginating &&
                sqlOriginating.toLowerCase().trim() !== clioOriginating.toLowerCase().trim();
            
            setClioVerificationCache(prev => ({
                ...prev,
                [displayNumber]: {
                    verified: true,
                    loading: false,
                    mismatch: responsibleMismatch || originatingMismatch,
                    clioResponsible,
                    clioOriginating,
                    sqlResponsible,
                    sqlOriginating,
                }
            }));
        } catch (err) {
            console.error(`[RateChange] Failed to verify ${displayNumber}:`, err);
            setClioVerificationCache(prev => ({
                ...prev,
                [displayNumber]: { verified: true, loading: false, mismatch: false }
            }));
        } finally {
            setVerifyingMatters(prev => {
                const next = new Set(prev);
                next.delete(displayNumber);
                return next;
            });
        }
    }, [clioVerificationCache, verifyingMatters]);

    // Set up IntersectionObserver to lazy-load Clio verification when rows scroll into view
    useEffect(() => {
        // Cleanup existing observer
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const displayNumber = entry.target.getAttribute('data-display-number');
                        const sqlResponsible = entry.target.getAttribute('data-sql-responsible') || '';
                        const sqlOriginating = entry.target.getAttribute('data-sql-originating') || '';
                        
                        if (displayNumber && !clioVerificationCache[displayNumber]?.verified && !verifyingMatters.has(displayNumber)) {
                            verifyMatterAgainstClio(displayNumber, sqlResponsible, sqlOriginating);
                        }
                    }
                });
            },
            { rootMargin: '100px', threshold: 0.1 }
        );

        // Observe all tracked rows
        rowRefs.current.forEach((element) => {
            observerRef.current?.observe(element);
        });

        return () => {
            observerRef.current?.disconnect();
        };
    }, [verifyMatterAgainstClio, clioVerificationCache, verifyingMatters]);

    // Sync a single matter from Clio to SQL
    const syncMatterFromClio = useCallback(async (displayNumber: string, skipRefresh = false) => {
        if (syncingMatters.has(displayNumber)) return;

        const adminInitials = (signatureInitials || '').toUpperCase().trim();
        if (!adminInitials) {
            showToast('Missing initials: cannot sync from Clio', 'error');
            return;
        }
        
        setSyncingMatters(prev => new Set(prev).add(displayNumber));
        setClioVerificationCache(prev => ({
            ...prev,
            [displayNumber]: { ...prev[displayNumber], syncing: true, syncError: undefined }
        }));
        
        try {
            const response = await fetch(`/api/rate-changes/sync-matter/${encodeURIComponent(displayNumber)}?initials=${encodeURIComponent(adminInitials)}`, {
                method: 'POST',
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Sync failed' }));
                throw new Error(errData.error || `Sync failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Update cache to reflect synced state
            setClioVerificationCache(prev => ({
                ...prev,
                [displayNumber]: {
                    ...prev[displayNumber],
                    syncing: false,
                    synced: true,
                    mismatch: false,
                    sqlResponsible: data.updated.responsible_solicitor,
                    sqlOriginating: data.updated.originating_solicitor,
                }
            }));
            
            // Show success toast
            showToast(`Synced ${displayNumber}`, 'success');
            
            // Refresh clients data to update UI (unless bulk syncing)
            if (!skipRefresh) {
                await onRefresh();
            }
            
        } catch (err) {
            console.error(`[RateChange] Sync failed for ${displayNumber}:`, err);
            setClioVerificationCache(prev => ({
                ...prev,
                [displayNumber]: { 
                    ...prev[displayNumber], 
                    syncing: false, 
                    syncError: err instanceof Error ? err.message : 'Sync failed' 
                }
            }));
            showToast(`Failed to sync ${displayNumber}`, 'error');
        } finally {
            setSyncingMatters(prev => {
                const next = new Set(prev);
                next.delete(displayNumber);
                return next;
            });
        }
    }, [syncingMatters, signatureInitials, showToast, onRefresh]);

    // Bulk sync all mismatched matters
    const syncAllMismatches = useCallback(async () => {
        const mismatchedMatters = Object.entries(clioVerificationCache)
            .filter(([_, v]) => v.mismatch && !v.synced && !v.syncing)
            .map(([dn]) => dn);
        
        if (mismatchedMatters.length === 0) {
            showToast('No mismatches to sync', 'success');
            return;
        }
        
        showToast(`Syncing ${mismatchedMatters.length} matter(s)...`, 'success');
        
        // Skip individual refreshes during bulk sync
        for (const dn of mismatchedMatters) {
            await syncMatterFromClio(dn, true);
        }
        
        // Single refresh at the end
        await onRefresh();
        showToast(`Sync complete`, 'success');
    }, [clioVerificationCache, syncMatterFromClio, showToast, onRefresh]);

    const handleMarkSent = useCallback(async (client: RateChangeClient, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmClient(client);
        setConfirmAction('sent');
        setSentDate(new Date().toISOString().split('T')[0]); // Reset to today
    }, []);

    const handleMarkNA = useCallback((client: RateChangeClient, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmClient(client);
        setConfirmAction('na');
    }, []);

    const handleSetCclDate = useCallback((client: RateChangeClient, e: React.MouseEvent) => {
        e.stopPropagation();
        const today = new Date().toISOString().split('T')[0];
        setConfirmClient(client);
        setConfirmAction('ccl-date');
        setCclDate(today); // default value
        const nextSelections: Record<string, boolean> = {};
        const nextDates: Record<string, string> = {};
        client.open_matters.forEach(m => {
            // Default to none selected so we don't accidentally update all matters.
            nextSelections[m.display_number] = false;
            nextDates[m.display_number] = today;
        });
        setCclMatterSelections(nextSelections);
        setCclMatterDates(nextDates);
    }, []);

    const cclDateUpdates = useMemo(() => {
        if (confirmAction !== 'ccl-date' || !confirmClient) return [] as Array<{ matter_id: string; display_number: string; date_value: string }>;
        return confirmClient.open_matters
            .filter(m => cclMatterSelections[m.display_number] ?? false)
            .map(m => ({
                matter_id: m.matter_id,
                display_number: m.display_number,
                date_value: cclMatterDates[m.display_number] || cclDate,
            }));
    }, [confirmAction, confirmClient, cclMatterSelections, cclMatterDates, cclDate]);

    const isCclDateActionValid = useMemo(() => {
        if (confirmAction !== 'ccl-date') return true;
        if (cclDateUpdates.length === 0) return false;
        return cclDateUpdates.every(u => /^\d{4}-\d{2}-\d{2}$/.test(u.date_value));
    }, [confirmAction, cclDateUpdates]);

    const handleUndoClick = useCallback((client: RateChangeClient, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!undoUnlocked) {
            // Need passcode first
            setPendingUndoClient(client);
            setPasscodeAction('undo');
            setShowPasscodeModal(true);
        } else {
            setConfirmClient(client);
            setConfirmAction('undo');
        }
    }, [undoUnlocked]);

    /** Handle streaming update events */
    const handleStreamingUpdate = useCallback((event: MatterUpdateEvent) => {
        switch (event.type) {
            case 'progress':
                setStreamingStep(event.message || event.step || '');
                break;
            case 'matter-start':
                // Initialize matter as updating
                setMatterProgress(prev => {
                    const existing = prev.find(m => m.displayNumber === event.displayNumber);
                    if (existing) {
                        return prev.map(m => m.displayNumber === event.displayNumber 
                            ? { ...m, status: 'updating' as const } 
                            : m
                        );
                    }
                    return prev;
                });
                break;
            case 'matter-complete':
                // Update matter status - 'skipped' means not found in Clio (likely closed)
                setMatterProgress(prev => prev.map(m => 
                    m.displayNumber === event.displayNumber 
                        ? { 
                            ...m, 
                            status: event.skipped ? 'skipped' as const 
                                : event.success ? 'success' as const 
                                : 'failed' as const,
                            error: event.error,
                            message: event.message
                        } 
                        : m
                ));
                // Skip per-matter toasts - the inline progress shows status already
                if (event.progress) {
                    setStreamingSummary(event.progress);
                }
                break;
            case 'complete':
                setStreamingStep('Complete');
                setStreamingComplete(true);
                {
                    let allSucceeded = false;

                    if (event.progress) {
                        allSucceeded = event.progress.failed === 0;
                        setStreamingAllSucceeded(allSucceeded);
                        setStreamingSummary(event.progress);
                    } else if (event.clio_updates) {
                        allSucceeded = event.clio_updates.failed === 0;
                        setStreamingAllSucceeded(allSucceeded);
                        setStreamingSummary({
                            success: event.clio_updates.success,
                            failed: event.clio_updates.failed,
                            skipped: event.clio_updates.skipped || 0,
                            total: event.clio_updates.success + event.clio_updates.failed + (event.clio_updates.skipped || 0)
                        });
                    }

                    // If the CCL Date operation succeeded, keep the client's dot lit immediately.
                    if (confirmAction === 'ccl-date' && allSucceeded && confirmClient?.client_id) {
                        setCclConfirmedClientIds(prev => {
                            const next = new Set(prev);
                            next.add(confirmClient.client_id);
                            return next;
                        });
                    }
                }
                break;
            case 'error':
                setStreamingStep(`Error: ${event.message}`);
                setStreamingComplete(true);
                setStreamingAllSucceeded(false);
                break;
        }
    }, [confirmAction, confirmClient, showToast]);

    const updateCclDateStreaming = useCallback(async (
        updates: Array<{ matter_id: string; display_number: string; date_value: string }>,
        onUpdate: MatterUpdateCallback
    ) => {
        const adminInitials = (signatureInitials || '').toUpperCase().trim();
        if (!adminInitials) {
            throw new Error('Missing initials');
        }

        const response = await fetch(`/api/ccl-date/stream?initials=${encodeURIComponent(adminInitials)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                updates,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[RateChangeModal] CCL Date stream error response:', errorText);
            throw new Error(`Failed to update CCL Date: ${response.status}`);
        }

        if (!response.body) {
            const data = await response.json();
            if (data?.success && data?.progress) {
                onUpdate({ type: 'complete', success: true, progress: data.progress });
                return;
            }
            throw new Error('No stream body returned');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const event: MatterUpdateEvent = JSON.parse(line.slice(6));
                    onUpdate(event);
                } catch (parseErr) {
                    console.warn('[RateChangeModal] CCL Date stream parse error:', parseErr);
                }
            }
        }
    }, [signatureInitials]);

    const executeAction = useCallback(async () => {
        if (!confirmClient || !confirmAction) return;
        
        setProcessingClients(prev => new Set(prev).add(confirmClient.client_id));
        
        // Reset streaming state
        setStreamingComplete(false);
        setStreamingAllSucceeded(false);
        
        try {
            if (confirmAction === 'sent') {
                // Initialize streaming UI
                setIsStreaming(true);
                setStreamingStep('Preparing...');
                setStreamingSummary(null);
                setMatterProgress(
                    confirmClient.open_matters.map(m => ({
                        displayNumber: m.display_number,
                        status: 'pending' as const,
                    }))
                );
                
                // Use streaming API
                await onMarkSentStreaming(
                    confirmClient.client_id, 
                    {
                        client_first_name: confirmClient.client_first_name,
                        client_last_name: confirmClient.client_last_name,
                        client_email: confirmClient.client_email,
                        open_matters: confirmClient.open_matters,
                        closed_matters: confirmClient.closed_matters,
                    },
                    handleStreamingUpdate,
                    sentDate
                );
                
                // Small delay to show final state, then check if we should close
                await new Promise(r => setTimeout(r, 1500));
                
            } else if (confirmAction === 'na') {
                // Initialize streaming UI
                setIsStreaming(true);
                setStreamingStep('Preparing...');
                setStreamingSummary(null);
                setMatterProgress(
                    confirmClient.open_matters.map(m => ({
                        displayNumber: m.display_number,
                        status: 'pending' as const,
                    }))
                );
                
                // Use streaming API - if custom reason, use the custom text
                const finalReason = naReason === 'custom' ? customReason : naReason;
                await onMarkNAStreaming(
                    confirmClient.client_id, 
                    finalReason, 
                    naNotes, 
                    {
                        client_first_name: confirmClient.client_first_name,
                        client_last_name: confirmClient.client_last_name,
                        client_email: confirmClient.client_email,
                        open_matters: confirmClient.open_matters,
                        closed_matters: confirmClient.closed_matters,
                    },
                    handleStreamingUpdate
                );
                
                // Small delay to show final state
                await new Promise(r => setTimeout(r, 1500));
                
            } else if (confirmAction === 'undo') {
                // Combine open and closed matters for Clio cleanup
                const allMatters = [
                    ...confirmClient.open_matters.map(m => ({ matter_id: m.matter_id, display_number: m.display_number })),
                    ...confirmClient.closed_matters.map(m => ({ matter_id: m.matter_id, display_number: m.display_number })),
                ];
                
                // Use streaming for undo too - same UX as sent/N/A
                setIsStreaming(true);
                setStreamingComplete(false);
                setStreamingAllSucceeded(false);
                setMatterProgress(allMatters.map(m => ({ displayNumber: m.display_number, status: 'pending' as const })));
                
                await onUndoStreaming(confirmClient.client_id, allMatters, handleStreamingUpdate);
                
                // Small delay to show final state
                await new Promise(r => setTimeout(r, 1500));
            } else if (confirmAction === 'ccl-date') {
                if (!isCclDateActionValid) {
                    throw new Error('Select at least one matter and enter valid dates (YYYY-MM-DD)');
                }

                setIsStreaming(true);
                setStreamingStep('Preparing...');
                setStreamingSummary(null);
                setStreamingComplete(false);
                setStreamingAllSucceeded(false);
                setMatterProgress(
                    cclDateUpdates.map(u => ({
                        displayNumber: u.display_number,
                        status: 'pending' as const,
                    }))
                );

                await updateCclDateStreaming(cclDateUpdates, handleStreamingUpdate);

                // Small delay to show final state
                await new Promise(r => setTimeout(r, 1500));
            }
            
            // For streaming actions, DON'T auto-close - let user see the results
            // The UI will show a "Done" or "Close" button based on streamingComplete
            setProcessingClients(prev => { const n = new Set(prev); n.delete(confirmClient?.client_id || ''); return n; });
            setIsStreaming(false);
            
        } catch (err) { 
            console.error('[RateChangeModal] executeAction error:', err);
            showToast(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
            setProcessingClients(prev => { const n = new Set(prev); n.delete(confirmClient?.client_id || ''); return n; });
            setIsStreaming(false);
            // DON'T close the modal on error - let user see what happened
        }
    }, [confirmClient, confirmAction, naReason, customReason, naNotes, sentDate, cclDate, cclDateUpdates, isCclDateActionValid, onMarkSentStreaming, onMarkNAStreaming, onUndoStreaming, showToast, handleStreamingUpdate, updateCclDateStreaming]);

    /** Close the confirmation modal and reset all streaming state */
    const closeConfirmModal = useCallback(() => {
        if (isStreaming && !streamingComplete) return; // Prevent closing during active streaming
        setConfirmClient(null);
        setConfirmAction(null);
        setNaReason('');
        setCustomReason('');
        setNaNotes('');
        setIsStreaming(false);
        setStreamingStep('');
        setMatterProgress([]);
        setStreamingSummary(null);
        setStreamingComplete(false);
        setStreamingAllSucceeded(false);
        setToasts([]); // Clear any pending toasts
        setCclMatterSelections({});
        setCclMatterDates({});
    }, [isStreaming, streamingComplete]);

    // ========== MIGRATE TAB LOGIC ==========
    
    // Handle clicking the Migrate tab - show passcode if not unlocked
    const handleMigrateTabClick = useCallback(() => {
        if (migrateUnlocked) {
            setFilter('migrate');
        } else {
            setPasscodeAction('migrate');
            setShowPasscodeModal(true);
        }
    }, [migrateUnlocked]);
    
    // Verify passcode - handles both migrate and undo actions
    const handlePasscodeSubmit = useCallback(() => {
        if (passcodeInput === '2011') {
            setShowPasscodeModal(false);
            setPasscodeInput('');
            setPasscodeError('');
            
            if (passcodeAction === 'migrate') {
                setMigrateUnlocked(true);
                setFilter('migrate');
                showToast('Dev access granted');
            } else if (passcodeAction === 'undo') {
                setUndoUnlocked(true);
                showToast('Undo access granted');
                // If there's a pending undo, execute it now
                if (pendingUndoClient) {
                    setConfirmClient(pendingUndoClient);
                    setConfirmAction('undo');
                    setPendingUndoClient(null);
                }
            }
        } else {
            setPasscodeError('Invalid passcode');
            setPasscodeInput('');
        }
    }, [passcodeInput, passcodeAction, pendingUndoClient, showToast]);
    
    // Open migrate modal for a client
    const handleStartMigrate = useCallback((client: RateChangeClient) => {
        setMigrateClient(client);
        setMigrateStep('form');
        setMigrateError('');
        
        // Pre-fill with existing data (if any)
        setMigrateFormData({
            first_name: client.client_first_name || '',
            last_name: client.client_last_name || '',
            email: client.client_email || '',
            display_numbers: client.open_matters.map(m => m.display_number),
        });
    }, []);
    
    // Execute migration
    const executeMigration = useCallback(async () => {
        if (!migrateClient) return;
        
        setMigrateError('');
        let contactData = { ...migrateFormData };
        
        // Step 1: Lookup contact details from Clio (optional enhancement)
        setMigrateStep('lookup');
        try {
            // For now, we use the form data entered by the user
            // Future: Could fetch from Clio contacts API if matter has contact linked
            await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for UX
            showToast('✓ Contact data ready');
        } catch (e: any) {
            // Non-blocking - continue with user-entered data
            console.warn('Contact lookup skipped:', e.message);
        }
        
        // Step 2: Write to database (migrate the record)
        setMigrateStep('db');
        try {
            await onMarkSent(migrateClient.client_id, {
                client_first_name: migrateFormData.first_name || undefined,
                client_last_name: migrateFormData.last_name || undefined,
                client_email: migrateFormData.email || undefined,
                open_matters: migrateClient.open_matters,
                closed_matters: migrateClient.closed_matters,
            });
            showToast('✓ Database updated');
        } catch (e: any) {
            setMigrateError(`Database error: ${e.message}`);
            showToast(`Database update failed: ${e.message}`, 'error');
            return;
        }
        
        // Done
        setMigrateStep('done');
        showToast(`✓ ${migrateClient.client_name} migrated`);
        
        // Close after brief delay
        setTimeout(() => {
            setMigrateClient(null);
            setMigrateStep('form');
        }, 1500);
    }, [migrateClient, migrateFormData, onMarkSent, showToast]);
    
    // Close migrate modal
    const closeMigrateModal = useCallback(() => {
        setMigrateClient(null);
        setMigrateStep('form');
        setMigrateError('');
    }, []);
    
    // Get sent/N/A clients for migrate tab (candidates for migration - already had Clio field updated)
    const migrateClients = useMemo(() => {
        return clients.filter(c => c.status === 'sent' || c.status === 'not_applicable');
    }, [clients]);

    // Check for other solicitors' matters
    const otherSolicitorMatters = useMemo(() => {
        if (!confirmClient || !currentUserName) return [];
        const name = currentUserName.toLowerCase();
        return confirmClient.open_matters.filter(m => 
            m.responsible_solicitor && !m.responsible_solicitor.toLowerCase().includes(name)
        );
    }, [confirmClient, currentUserName]);

    const progressPercent = currentStats.total > 0 
        ? Math.round(((currentStats.sent + currentStats.not_applicable) / currentStats.total) * 100) : 0;
    
    // Count verification mismatches
    const verificationStats = useMemo(() => {
        let verified = 0;
        let mismatches = 0;
        let synced = 0;
        let loading = 0;
        Object.values(clioVerificationCache).forEach(v => {
            if (v.loading) loading++;
            else if (v.verified) {
                verified++;
                if (v.synced) synced++;
                else if (v.mismatch) mismatches++;
            }
        });
        return { verified, mismatches, synced, loading };
    }, [clioVerificationCache]);
    
    const confirmMatterCount = confirmAction === 'ccl-date'
        ? cclDateUpdates.length
        : (confirmClient?.open_matters.length ?? 0);
    const confirmMatterPhrase = confirmMatterCount === 0
        ? 'these matters'
        : confirmMatterCount === 1
            ? 'this matter'
            : (confirmAction === 'ccl-date' ? `${confirmMatterCount} matters` : `all ${confirmMatterCount} matters`);

    // Helper to render verification status indicator for a matter
    const renderVerificationIndicator = useCallback((displayNumber: string, matter: RateChangeMatter, allowSync: boolean) => {
        const verification = clioVerificationCache[displayNumber];
        
        if (!verification) {
            // Not yet verified - show placeholder that will trigger verification when visible
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4, verticalAlign: 'middle' }}>
                    <span
                        ref={(el) => {
                            if (el) {
                                rowRefs.current.set(displayNumber, el as any);
                                observerRef.current?.observe(el);
                            }
                        }}
                        data-display-number={displayNumber}
                        data-sql-responsible={matter.responsible_solicitor || ''}
                        data-sql-originating={matter.originating_solicitor || ''}
                        style={{ display: 'inline-block', width: 14, height: 14 }}
                        title="Click to verify against Clio"
                    />
                    {allowSync && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                syncMatterFromClio(displayNumber);
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '0 2px',
                                cursor: 'pointer',
                                color: colours.highlight,
                                fontSize: 9,
                                fontWeight: 600,
                                textDecoration: 'underline',
                            }}
                            title="Sync this matter from Clio"
                        >
                            Sync
                        </button>
                    )}
                </span>
            );
        }
        
        if (verification.loading) {
            return (
                <Spinner size={SpinnerSize.xSmall} style={{ marginLeft: 4 }} />
            );
        }
        
        // Syncing state
        if (verification.syncing) {
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
                    <Spinner size={SpinnerSize.xSmall} />
                    <span style={{ fontSize: 9, color: isDarkMode ? '#9ca3af' : '#999' }}>Syncing...</span>
                </span>
            );
        }
        
        // Successfully synced
        if (verification.synced) {
            return (
                <Icon
                    iconName="Sync"
                    style={{
                        marginLeft: 4,
                        fontSize: 10,
                        color: colours.green,
                    }}
                    title={`Synced! Resp="${verification.clioResponsible}", Orig="${verification.clioOriginating}"`}
                />
            );
        }
        
        if (verification.mismatch) {
            const tooltip = [
                'Data mismatch detected! Click to sync from Clio.',
                verification.sqlResponsible !== verification.clioResponsible 
                    ? `Responsible: SQL="${verification.sqlResponsible}" → Clio="${verification.clioResponsible}"`
                    : '',
                verification.sqlOriginating !== verification.clioOriginating
                    ? `Originating: SQL="${verification.sqlOriginating}" → Clio="${verification.clioOriginating}"`
                    : '',
            ].filter(Boolean).join('\n');
            
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
                    <Icon
                        iconName="Warning"
                        style={{
                            fontSize: 12,
                            color: colours.cta,
                            cursor: 'pointer',
                        }}
                        title={tooltip}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            syncMatterFromClio(displayNumber);
                        }}
                    />
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            syncMatterFromClio(displayNumber);
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            padding: '0 2px',
                            cursor: 'pointer',
                            color: colours.highlight,
                            fontSize: 9,
                            fontWeight: 600,
                            textDecoration: 'underline',
                        }}
                        title="Sync this matter from Clio"
                    >
                        Sync
                    </button>
                </span>
            );
        }
        
        // Verified and no mismatch
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                <Icon
                    iconName="CheckMark"
                    style={{
                        fontSize: 10,
                        color: colours.green,
                        opacity: 0.6,
                    }}
                    title="Verified: SQL matches Clio"
                />
                {allowSync && (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            syncMatterFromClio(displayNumber);
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            padding: '0 2px',
                            cursor: 'pointer',
                            color: colours.highlight,
                            fontSize: 9,
                            fontWeight: 600,
                            textDecoration: 'underline',
                        }}
                        title="Sync this matter from Clio"
                    >
                        Sync
                    </button>
                )}
            </span>
        );
    }, [clioVerificationCache, isDarkMode, syncMatterFromClio]);

    // Styles
    const borderColor = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    const textMuted = isDarkMode ? '#9ca3af' : '#999';
    const textSecondary = isDarkMode ? '#d1d5db' : '#777';
    const textPrimary = isDarkMode ? '#f9fafb' : '#222';

    return (
        <>
            {/* Inject button styles */}
            <style>{buttonStyles}</style>
            
            <Modal
                isOpen={isOpen}
                onDismiss={onClose}
                isBlocking={false}
                styles={{
                    main: {
                        maxWidth: 1000,
                        width: '95vw',
                        maxHeight: '90vh',
                        borderRadius: 2,
                        background: isDarkMode ? '#2d3748' : '#fff',
                        boxShadow: isDarkMode 
                            ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)' 
                            : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                        overflow: 'hidden',
                    },
                    scrollableContent: { maxHeight: '90vh', display: 'flex', flexDirection: 'column' },
                }}
            >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${borderColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>
                                Jan {year} Rate Change
                            </div>
                            <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
                                {currentStats.sent + currentStats.not_applicable}/{currentStats.total} complete · {progressPercent}%
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {filter === 'pending' && (
                                <button
                                    className="rc-btn rc-btn-secondary"
                                    onClick={handleEscalateSelected}
                                    disabled={isEscalating || selectedClientIds.size === 0}
                                    title={selectedClientIds.size === 0 ? 'Select one or more clients to escalate' : 'Send escalation email(s)'}
                                    style={{
                                        padding: '6px 12px', borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                                        background: 'transparent',
                                        color: textMuted,
                                        fontSize: 11, fontWeight: 600,
                                        cursor: isEscalating || selectedClientIds.size === 0 ? 'not-allowed' : 'pointer',
                                        letterSpacing: '0.02em', textTransform: 'uppercase',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        opacity: isEscalating || selectedClientIds.size === 0 ? 0.5 : 1,
                                    }}
                                >
                                    <Icon iconName="MailForward" style={{ fontSize: 12 }} />
                                    {isEscalating ? 'Escalating...' : `Escalate (${selectedClientIds.size})`}
                                </button>
                            )}
                            <button
                                className="rc-btn rc-btn-secondary"
                                onClick={() => setShowTemplate(!showTemplate)}
                                style={{
                                    padding: '6px 12px', borderRadius: 0,
                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                                    background: showTemplate ? (isDarkMode ? '#4b5563' : '#e5e5e5') : 'transparent',
                                    color: textMuted,
                                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    letterSpacing: '0.02em', textTransform: 'uppercase',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                <Icon iconName="Mail" style={{ fontSize: 12 }} />
                                Template
                                <Icon iconName={showTemplate ? 'ChevronUp' : 'ChevronDown'} style={{ fontSize: 10 }} />
                            </button>
                            {/* Migrate button - admin only, hidden from non-admins */}
                            {isAdmin && (
                                <button
                                    className="rc-btn"
                                    onClick={migrateUnlocked ? handleMigrateTabClick : undefined}
                                    onDoubleClick={!migrateUnlocked ? () => setShowPasscodeModal(true) : undefined}
                                    disabled={!migrateUnlocked}
                                    title={migrateUnlocked ? 'Open migrate view' : 'Double-click to unlock'}
                                    style={{
                                        padding: '6px 12px', borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                                        background: filter === 'migrate' ? (isDarkMode ? '#4b5563' : '#e5e5e5') : 'transparent',
                                        color: isDarkMode ? '#6b7280' : '#9ca3af',
                                        fontSize: 11, fontWeight: 600, 
                                        cursor: migrateUnlocked ? 'pointer' : 'not-allowed',
                                        letterSpacing: '0.02em', textTransform: 'uppercase',
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        opacity: migrateUnlocked ? 0.85 : 0.4,
                                        pointerEvents: 'auto', // Allow double-click even when "disabled"
                                    }}
                                >
                                    <Icon iconName={migrateUnlocked ? 'Database' : 'Lock'} style={{ fontSize: 10 }} />
                                    Migrate
                                </button>
                            )}
                            <IconButton
                                iconProps={{ iconName: 'Cancel' }}
                                onClick={onClose}
                                styles={{ root: { color: textMuted }, rootHovered: { background: 'transparent', color: textPrimary } }}
                            />
                        </div>
                    </div>

                    {/* Urgency banner removed (year-end copy no longer needed) */}

                    {/* Template panel (collapsible) */}
                    {showTemplate && (
                        <div style={{ 
                            marginTop: 16, padding: 16, 
                            background: isDarkMode ? '#374151' : '#f9f9f9',
                            border: `1px solid ${borderColor}`,
                        }}>
                            <div style={{ 
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: 12,
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Email Template
                                </div>
                                <button
                                    className="rc-btn rc-btn-secondary"
                                    onClick={() => setShowCopyConfirm(true)}
                                    style={{
                                        padding: '4px 10px', borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                                        background: 'transparent', color: textMuted,
                                        fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                        letterSpacing: '0.02em', textTransform: 'uppercase',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    <Icon iconName="Copy" style={{ fontSize: 10 }} />
                                    Copy
                                </button>
                            </div>
                            
                            <pre style={{ 
                                margin: 0, padding: 12,
                                background: isDarkMode ? '#2d3748' : '#fff',
                                border: `1px solid ${borderColor}`,
                                color: textSecondary, fontSize: 12, lineHeight: 1.5,
                                whiteSpace: 'pre-wrap', wordWrap: 'break-word',
                                fontFamily: 'inherit',
                                maxHeight: 200, overflow: 'auto',
                            }}>
                                {emailTemplate}
                            </pre>
                            <div style={{ fontSize: 10, color: isDarkMode ? '#d1d5db' : textMuted, marginTop: 8, fontStyle: 'italic' }}>
                                Replace [Client Name] with the client's name before sending.{currentRate == null ? ' Rate data unavailable – please add manually.' : ''}
                            </div>
                        </div>
                    )}
                    
                    {/* Copy Confirmation Modal */}
                    <Modal
                        isOpen={showCopyConfirm}
                        onDismiss={() => setShowCopyConfirm(false)}
                        styles={{ 
                            main: { 
                                maxWidth: 400, 
                                borderRadius: 2, 
                                background: isDarkMode ? '#3d4a5c' : '#fff',
                                boxShadow: isDarkMode 
                                    ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)' 
                                    : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            } 
                        }}
                    >
                        <div style={{ padding: 24 }}>
                            <div style={{ 
                                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                            }}>
                                <Icon iconName="Info" style={{ fontSize: 24, color: colours.highlight }} />
                                <div style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>
                                    Confirm Rate Values
                                </div>
                            </div>
                            
                            <div style={{ 
                                padding: 16, marginBottom: 16,
                                background: isDarkMode ? '#2d3748' : '#f9f9f9',
                                border: `1px solid ${borderColor}`,
                            }}>
                                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                    Template generated for
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>
                                    {currentUserName || 'Unknown'}
                                </div>
                                <div style={{ fontSize: 12, color: textSecondary }}>
                                    {userRole || 'Unknown Role'}
                                </div>
                            </div>
                            
                            <div style={{ 
                                padding: 16, marginBottom: 20,
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.3)'}`,
                            }}>
                                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                    Rate values in template
                                </div>
                                <div style={{ display: 'flex', gap: 24 }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>Previous</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: textSecondary }}>
                                            £{formatRate(currentRate)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', color: textMuted }}>→</div>
                                    <div>
                                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>New ({year})</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: colours.highlight }}>
                                            £{formatRate(newRate)}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>
                                    Based on £{RATE_INCREASE} standard increase
                                </div>
                            </div>
                            
                            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>
                                Please verify these rates are correct for your position before copying. If incorrect, manually adjust after pasting.
                            </div>
                            
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button
                                    className="rc-btn rc-btn-secondary"
                                    onClick={() => setShowCopyConfirm(false)}
                                    style={{
                                        padding: '8px 16px', border: `1px solid ${borderColor}`,
                                        borderRadius: 0, background: 'transparent', color: textMuted,
                                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                        letterSpacing: '0.02em', textTransform: 'uppercase',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="rc-btn rc-btn-primary"
                                    onClick={async () => {
                                        try {
                                            if (navigator?.clipboard?.writeText) {
                                                await navigator.clipboard.writeText(emailTemplate);
                                            } else {
                                                const textArea = document.createElement('textarea');
                                                textArea.value = emailTemplate;
                                                textArea.style.position = 'fixed';
                                                textArea.style.opacity = '0';
                                                document.body.appendChild(textArea);
                                                textArea.focus();
                                                textArea.select();
                                                document.execCommand('copy');
                                                document.body.removeChild(textArea);
                                            }
                                            showToast(`Template copied for ${userRole || 'your role'}`);
                                        } catch (err) {
                                            console.error('Clipboard copy failed', err);
                                            showToast('Copy failed. Please copy manually.', 'error');
                                        } finally {
                                            setShowCopyConfirm(false);
                                        }
                                    }}
                                    style={{
                                        padding: '8px 16px', border: 'none',
                                        borderRadius: 0, background: colours.highlight, color: '#fff',
                                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                        letterSpacing: '0.02em', textTransform: 'uppercase',
                                    }}
                                >
                                    Confirm & Copy
                                </button>
                            </div>
                        </div>
                    </Modal>

                    {/* Inactive Users Warning Banner */}
                    {viewMode === 'inactive' && inactiveStats.pending > 0 && filter === 'pending' && (
                        <div style={{
                            marginTop: 16,
                            padding: '12px 16px',
                            background: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Icon iconName="BlockContact" style={{ fontSize: 16, color: '#ef4444' }} />
                                <span style={{ fontSize: 12, color: textPrimary }}>
                                    <strong>{inactiveStats.pending}</strong> matters attributed to inactive team members
                                </span>
                            </div>
                            <div style={{ fontSize: 11, color: textMuted }}>
                                <span style={{ color: '#f59e0b' }}>Orange</span> = active originating solicitor can action
                            </div>
                        </div>
                    )}

                    {/* Status Summary Bar - shows when viewing All and there are pending items */}
                    {viewMode === 'all' && stats.pending > 0 && filter === 'pending' && (
                        <div style={{
                            marginTop: 16,
                            padding: '12px 16px',
                            background: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
                            border: `1px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Icon iconName="Warning" style={{ fontSize: 16, color: '#f59e0b' }} />
                                <span style={{ fontSize: 12, color: textPrimary }}>
                                    <strong>{stats.pending}</strong> clients still need rate change notifications
                                </span>
                            </div>
                            <div style={{ fontSize: 11, color: textMuted }}>
                                <span style={{ color: colours.green }}>{stats.sent} sent</span>
                                <span style={{ margin: '0 8px' }}>•</span>
                                <span>{stats.not_applicable} N/A</span>
                            </div>
                        </div>
                    )}

                    {/* Controls row */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* View toggle */}
                        <div style={{ display: 'flex', fontSize: 12, background: isDarkMode ? '#374151' : '#f5f5f5', padding: 2 }}>
                            <button
                                className="rc-btn"
                                onClick={() => setViewMode('mine')}
                                style={{
                                    padding: '6px 12px', border: 'none', cursor: 'pointer', height: 32,
                                    background: viewMode === 'mine' ? (isDarkMode ? '#4b5563' : '#fff') : 'transparent',
                                    color: viewMode === 'mine' ? textPrimary : textMuted,
                                    fontWeight: 600, fontSize: 11, letterSpacing: '0.02em',
                                    boxShadow: viewMode === 'mine' ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                                }}
                            >
                                Mine ({myStats.pending})
                            </button>
                            <button
                                className="rc-btn"
                                onClick={() => setViewMode('all')}
                                style={{
                                    padding: '6px 12px', border: 'none', height: 32,
                                    cursor: 'pointer',
                                    background: viewMode === 'all' ? (isDarkMode ? '#4b5563' : '#fff') : 'transparent',
                                    color: viewMode === 'all' ? textPrimary : textMuted,
                                    fontWeight: 600, fontSize: 11, letterSpacing: '0.02em',
                                    boxShadow: viewMode === 'all' ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                                }}
                            >
                                All ({stats.pending}){!isAdmin && <Icon iconName="View" style={{ fontSize: 9, marginLeft: 4, opacity: 0.6 }} />}
                            </button>
                            {/* Inactive users tab - shows matters attributed to people who've left */}
                            {teamData && teamData.length > 0 && inactiveStats.pending > 0 && (
                                <button
                                    className="rc-btn"
                                    onClick={() => setViewMode('inactive')}
                                    style={{
                                        padding: '6px 12px', border: 'none', height: 32,
                                        cursor: 'pointer',
                                        background: viewMode === 'inactive' ? (isDarkMode ? '#4b5563' : '#fff') : 'transparent',
                                        color: viewMode === 'inactive' ? '#ef4444' : (inactiveStats.pending > 0 ? '#ef4444' : textMuted),
                                        fontWeight: 600, fontSize: 11, letterSpacing: '0.02em',
                                        boxShadow: viewMode === 'inactive' ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                                    }}
                                    title="Matters attributed to inactive team members (people who've left)"
                                >
                                    <Icon iconName="BlockContact" style={{ fontSize: 10, marginRight: 4 }} />
                                    Inactive ({inactiveStats.pending})
                                </button>
                            )}
                        </div>

                        {/* Role Filter - only show when Mine is selected */}
                        {viewMode === 'mine' && (
                            <div style={{ display: 'flex', fontSize: 11, background: isDarkMode ? '#374151' : '#f5f5f5', padding: 2 }}>
                                <button
                                    className="rc-btn"
                                    onClick={() => setRoleFilter('both')}
                                    style={{
                                        padding: '4px 8px', border: 'none', cursor: 'pointer', height: 28,
                                        background: roleFilter === 'both' ? (isDarkMode ? '#4b5563' : '#fff') : 'transparent',
                                        color: roleFilter === 'both' ? textPrimary : textMuted,
                                        fontWeight: 600, fontSize: 10, letterSpacing: '0.02em',
                                        boxShadow: roleFilter === 'both' ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                                    }}
                                    title="Show clients where I'm responsible or originating"
                                >
                                    Both
                                </button>
                                <button
                                    className="rc-btn"
                                    onClick={() => setRoleFilter('responsible')}
                                    style={{
                                        padding: '4px 8px', border: 'none', cursor: 'pointer', height: 28,
                                        background: roleFilter === 'responsible' ? (isDarkMode ? '#4b5563' : '#fff') : 'transparent',
                                        color: roleFilter === 'responsible' ? textPrimary : textMuted,
                                        fontWeight: 600, fontSize: 10, letterSpacing: '0.02em',
                                        boxShadow: roleFilter === 'responsible' ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                                    }}
                                    title="Show only clients where I'm the responsible solicitor"
                                >
                                    Responsible
                                </button>
                                <button
                                    className="rc-btn"
                                    onClick={() => setRoleFilter('originating')}
                                    style={{
                                        padding: '4px 8px', border: 'none', cursor: 'pointer', height: 28,
                                        background: roleFilter === 'originating' ? (isDarkMode ? '#4b5563' : '#fff') : 'transparent',
                                        color: roleFilter === 'originating' ? textPrimary : textMuted,
                                        fontWeight: 600, fontSize: 10, letterSpacing: '0.02em',
                                        boxShadow: roleFilter === 'originating' ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                                    }}
                                    title="Show only clients where I'm the originating solicitor"
                                >
                                    Originating
                                </button>
                            </div>
                        )}

                        {/* Status toggles: default (none active) shows pending/to-do */}
                        <div style={{ display: 'flex', gap: 1 }}>
                            {(['sent', 'not_applicable'] as const).map(key => {
                                const isActive = filter === key;
                                const isSent = key === 'sent';
                                const count = isSent ? currentStats.sent : currentStats.not_applicable;
                                const label = isSent ? `Sent (${count})` : `N/A (${count})`;
                                const baseBorder = isSent ? 'solid' : 'dashed';
                                const borderColor = isActive
                                    ? colours.highlight
                                    : isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
                                const background = isActive
                                    ? (isSent ? (isDarkMode ? '#2f3f5f' : '#e8f1ff') : (isDarkMode ? '#3a3a3a' : '#f3f3f3'))
                                    : 'transparent';
                                return (
                                    <button
                                        className="rc-btn"
                                        key={key}
                                        onClick={() => setFilter(prev => prev === key ? 'pending' : key)}
                                        style={{
                                            padding: '6px 12px', height: 32,
                                            border: `1px ${baseBorder} ${borderColor}`,
                                            cursor: 'pointer',
                                            background,
                                            color: isActive ? textPrimary : textMuted,
                                            fontWeight: 600, fontSize: 11, letterSpacing: '0.02em',
                                            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Open Date Filter */}
                        {availableYears.length > 0 && (
                            <select
                                value={openDateFilter}
                                onChange={(e) => setOpenDateFilter(e.target.value)}
                                style={{
                                    padding: '6px 10px',
                                    height: 32,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: isDarkMode ? '#374151' : '#f5f5f5',
                                    color: openDateFilter !== 'all' ? textPrimary : textMuted,
                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    outline: 'none',
                                }}
                            >
                                <option value="all">All Years</option>
                                {availableYears.map(y => (
                                    <option key={y} value={y.toString()}> {y}</option>
                                ))}
                            </select>
                        )}

                        {/* Responsible Solicitor Filter */}
                        {availableResponsibleSolicitors.length > 0 && (
                            <select
                                value={responsibleFilter}
                                onChange={(e) => setResponsibleFilter(e.target.value)}
                                style={{
                                    padding: '6px 10px',
                                    height: 32,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: isDarkMode ? '#374151' : '#f5f5f5',
                                    color: responsibleFilter !== 'all' ? textPrimary : textMuted,
                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    maxWidth: 160,
                                }}
                                title="Filter by Responsible Solicitor"
                            >
                                <option value="all">All Responsible</option>
                                {availableResponsibleSolicitors.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        )}

                        {/* Originating Solicitor Filter */}
                        {availableOriginatingSolicitors.length > 0 && (
                            <select
                                value={originatingFilter}
                                onChange={(e) => setOriginatingFilter(e.target.value)}
                                style={{
                                    padding: '6px 10px',
                                    height: 32,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: isDarkMode ? '#374151' : '#f5f5f5',
                                    color: originatingFilter !== 'all' ? textPrimary : textMuted,
                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    maxWidth: 160,
                                }}
                                title="Filter by Originating Solicitor"
                            >
                                <option value="all">All Originating</option>
                                {availableOriginatingSolicitors.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        )}

                        {/* Clear Filters Button - show when any filter is active */}
                        {(openDateFilter !== 'all' || responsibleFilter !== 'all' || originatingFilter !== 'all' || searchTerm) && (
                            <button
                                className="rc-btn rc-btn-ghost"
                                onClick={() => {
                                    setOpenDateFilter('all');
                                    setResponsibleFilter('all');
                                    setOriginatingFilter('all');
                                    setInputTerm('');
                                    setSearchTerm('');
                                }}
                                style={{
                                    padding: '6px 10px',
                                    height: 32,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    background: 'transparent',
                                    color: textMuted,
                                    border: `1px dashed ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                                title="Clear all filters"
                            >
                                <Icon iconName="ClearFilter" style={{ fontSize: 10 }} />
                                Clear
                            </button>
                        )}

                        {/* Verification Status Indicator */}
                        {(verificationStats.mismatches > 0 || verificationStats.loading > 0 || verificationStats.synced > 0) && (
                            <div 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 6, 
                                    padding: '4px 10px',
                                    background: verificationStats.mismatches > 0 
                                        ? (isDarkMode ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)')
                                        : verificationStats.synced > 0
                                            ? (isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)')
                                            : 'transparent',
                                    border: verificationStats.mismatches > 0 
                                        ? `1px solid ${colours.cta}`
                                        : verificationStats.synced > 0
                                            ? `1px solid ${colours.green}`
                                            : 'none',
                                    fontSize: 10,
                                }}
                                title={verificationStats.mismatches > 0 
                                    ? `${verificationStats.mismatches} matter(s) have SQL data that doesn't match Clio`
                                    : verificationStats.synced > 0
                                        ? `${verificationStats.synced} matter(s) synced from Clio`
                                        : `Verifying ${verificationStats.loading} matter(s) against Clio...`}
                            >
                                {verificationStats.loading > 0 && (
                                    <>
                                        <Spinner size={SpinnerSize.xSmall} />
                                        <span style={{ color: textMuted }}>Verifying...</span>
                                    </>
                                )}
                                {verificationStats.mismatches > 0 && (
                                    <>
                                        <Icon iconName="Warning" style={{ color: colours.cta, fontSize: 12 }} />
                                        <span style={{ color: colours.cta, fontWeight: 600 }}>
                                            {verificationStats.mismatches} mismatch{verificationStats.mismatches !== 1 ? 'es' : ''}
                                        </span>
                                        <button
                                            onClick={syncAllMismatches}
                                            disabled={syncingMatters.size > 0}
                                            style={{
                                                background: colours.highlight,
                                                border: 'none',
                                                padding: '2px 8px',
                                                cursor: syncingMatters.size > 0 ? 'wait' : 'pointer',
                                                color: '#fff',
                                                fontSize: 9,
                                                fontWeight: 600,
                                                marginLeft: 4,
                                                opacity: syncingMatters.size > 0 ? 0.6 : 1,
                                            }}
                                            title="Sync all mismatched matters from Clio to SQL"
                                        >
                                            {syncingMatters.size > 0 ? 'Syncing...' : 'Sync All'}
                                        </button>
                                    </>
                                )}
                                {verificationStats.synced > 0 && verificationStats.mismatches === 0 && (
                                    <>
                                        <Icon iconName="Sync" style={{ color: colours.green, fontSize: 12 }} />
                                        <span style={{ color: colours.green, fontWeight: 600 }}>
                                            {verificationStats.synced} synced
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Search */}
                        <div style={{ flex: 1, minWidth: 180 }}>
                            <TextField
                                placeholder="Search..."
                                value={inputTerm}
                                onChange={(_, v) => {
                                    const next = v || '';
                                    setInputTerm(next);
                                    startTransition(() => setSearchTerm(next));
                                }}
                                styles={{
                                    root: { width: '100%' },
                                    fieldGroup: {
                                        background: isDarkMode ? '#374151' : '#f9f9f9',
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                        borderRadius: 0, height: 32,
                                    },
                                    field: { fontSize: 12, color: textPrimary },
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Ledger */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {isLoading ? (
                        <div style={{ padding: 60, textAlign: 'center' }}><Spinner size={SpinnerSize.large} /></div>
                    ) : filteredClients.length === 0 ? (
                        <div style={{ padding: 60, textAlign: 'center', color: textMuted }}>
                            {filter === 'pending' && currentStats.pending === 0 
                                ? <><Icon iconName="Completed" style={{ fontSize: 24, color: colours.highlight, display: 'block', marginBottom: 8 }} />All done!</>
                                : 'No results'}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${borderColor}` }}>
                                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', width: filter === 'migrate' ? 60 : 45 }}>#</th>
                                    {filter === 'pending' && (
                                        <th style={{ padding: '10px 6px', textAlign: 'center', fontWeight: 500, color: textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', width: 34 }}>
                                            Sel
                                        </th>
                                    )}
                                    <th
                                        onClick={() => toggleSort('client')}
                                        style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', width: '24%', cursor: 'pointer' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>Client</span>
                                            <span style={{ fontSize: 10, opacity: sortField === 'client' ? 1 : 0.4 }}>{sortField === 'client' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', width: '25%' }}>Matters</th>
                                    <th
                                        onClick={() => toggleSort('opened')}
                                        style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90, cursor: 'pointer' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>Opened</span>
                                            <span style={{ fontSize: 10, opacity: sortField === 'opened' ? 1 : 0.4 }}>{sortField === 'opened' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => toggleSort('solicitor')}
                                        style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
                                        title="Responsible Solicitor (↳ = Originating, if different)"
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>Resp / Orig</span>
                                            <span style={{ fontSize: 10, opacity: sortField === 'solicitor' ? 1 : 0.4 }}>{sortField === 'solicitor' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </div>
                                    </th>
                                    <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 500, color: textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', width: 120 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClients.map((client, index) => {
                                    const isProcessing = processingClients.has(client.client_id);
                                    const queuePosition = index + 1;
                                    // Completed items (sent/na) should be more subtle
                                    const isCompleted = filter === 'sent' || filter === 'not_applicable';
                                    
                                    return (
                                        <React.Fragment key={client.client_id}>
                                            <tr 
                                                className="rc-row"
                                                style={{ 
                                                    borderBottom: `1px solid ${borderColor}`,
                                                    opacity: isProcessing ? 0.4 : isCompleted ? 0.6 : 1,
                                                    transition: 'opacity 0.15s',
                                                }}
                                            >
                                                <td style={{ padding: '12px', textAlign: 'center', color: textMuted, fontSize: 10, fontWeight: 600 }}>
                                                    {filter === 'migrate' ? (
                                                        /* Migrate view: show 6 status dots */
                                                        /* Dots 1-2: From sent/NA (Clio update + DB insert), Dots 3-5: Migrate steps (Fetch, Fill, Complete), Dot 6: CCL Date (separate op) */
                                                        (() => {
                                                            const isThisClientMigrating = migrateClient?.client_id === client.client_id;
                                                            const stepOrder = ['form', 'lookup', 'db', 'done'] as const;
                                                            const currentStepIndex = isThisClientMigrating ? stepOrder.indexOf(migrateStep) : -1;
                                                            const isThisClientCclDating = confirmAction === 'ccl-date' && isStreaming && confirmClient?.client_id === client.client_id;
                                                            const isThisClientCclConfirmed = Boolean((client as any).ccl_confirmed) || cclConfirmedClientIds.has(client.client_id);
                                                            
                                                            const getDotColor = (dotIndex: number) => {
                                                                // Dots 0-1 = Clio update + DB insert, always green (prerequisite for migrate view)
                                                                if (dotIndex <= 1) return colours.green;

                                                                // Dot 5 = CCL Date (separate op)
                                                                if (dotIndex === 5) {
                                                                    // Persisted state: stay green once confirmed.
                                                                    if (isThisClientCclConfirmed && !isThisClientCclDating) return colours.green;

                                                                    // Live streaming UX for current action.
                                                                    if (isThisClientCclDating) {
                                                                        if (streamingComplete) return streamingAllSucceeded ? colours.green : colours.cta;
                                                                        return colours.highlight;
                                                                    }

                                                                    return isDarkMode ? '#4b5563' : '#d1d5db';
                                                                }
                                                                
                                                                if (!isThisClientMigrating) {
                                                                    return isDarkMode ? '#4b5563' : '#d1d5db';
                                                                }
                                                                
                                                                // Dot 2 = Clio fetch (lookup step, index 1)
                                                                // Dot 3 = DB fill (db step, index 2)
                                                                // Dot 4 = Complete (done step, index 3)
                                                                const dotToStep: Record<number, number> = { 2: 1, 3: 2, 4: 3 }; // lookup=1, db=2, done=3
                                                                const requiredStepIndex = dotToStep[dotIndex];
                                                                
                                                                if (currentStepIndex >= requiredStepIndex) {
                                                                    return colours.green;
                                                                } else if (currentStepIndex === requiredStepIndex - 1) {
                                                                    return colours.highlight; // In progress
                                                                }
                                                                return isDarkMode ? '#4b5563' : '#d1d5db';
                                                            };
                                                            
                                                            return (
                                                                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: getDotColor(0), transition: 'background 0.2s' }} title="1. Clio Update (done)" />
                                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: getDotColor(1), transition: 'background 0.2s' }} title="2. DB Insert (done)" />
                                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: getDotColor(2), transition: 'background 0.2s' }} title="3. Clio Fetch" />
                                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: getDotColor(3), transition: 'background 0.2s' }} title="4. DB Fill" />
                                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: getDotColor(4), transition: 'background 0.2s' }} title="5. Complete" />
                                                                    {/* subtle separator to indicate CCL Date is a separate operation */}
                                                                    <div style={{ width: 6 }} />
                                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: getDotColor(5), transition: 'background 0.2s' }} title="6. CCL Date" />
                                                                </div>
                                                            );
                                                        })()
                                                    ) : filter === 'sent' || filter === 'not_applicable' ? (
                                                        /* Sent/N/A views: show 2 dots - both complete */
                                                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: colours.green, transition: 'background 0.2s' }} title="1. Clio Update" />
                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: colours.green, transition: 'background 0.2s' }} title="2. DB Insert" />
                                                        </div>
                                                    ) : filter === 'pending' && isStreaming && confirmClient?.client_id === client.client_id ? (
                                                        /* Pending view while streaming: show 2 dots with progress */
                                                        (() => {
                                                            // Determine which step we're on based on streamingStep text
                                                            const isClioPhase = !streamingComplete && !streamingStep.toLowerCase().includes('database');
                                                            const isDbPhase = streamingStep.toLowerCase().includes('database') || streamingComplete;
                                                            
                                                            return (
                                                                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                                                    <div style={{ 
                                                                        width: 6, height: 6, borderRadius: '50%', 
                                                                        background: streamingComplete || isDbPhase ? colours.green : colours.highlight,
                                                                        transition: 'background 0.2s' 
                                                                    }} title="1. Clio Update" />
                                                                    <div style={{ 
                                                                        width: 6, height: 6, borderRadius: '50%', 
                                                                        background: streamingComplete ? colours.green : isDbPhase ? colours.highlight : (isDarkMode ? '#4b5563' : '#d1d5db'),
                                                                        transition: 'background 0.2s' 
                                                                    }} title="2. DB Insert" />
                                                                </div>
                                                            );
                                                        })()
                                                    ) : (
                                                        /* Pending view: just show queue position */
                                                        <span style={{ fontSize: 11, color: colours.highlight }}>{queuePosition}</span>
                                                    )}
                                                </td>
                                                {filter === 'pending' && (
                                                    <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedClientIds.has(client.client_id)}
                                                            onChange={() => {
                                                                setSelectedClientIds(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(client.client_id)) next.delete(client.client_id);
                                                                    else next.add(client.client_id);
                                                                    return next;
                                                                });
                                                            }}
                                                            disabled={isProcessing}
                                                            style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                                                            aria-label={`Select ${client.client_name} for escalation`}
                                                        />
                                                    </td>
                                                )}
                                                <td style={{ padding: '12px', color: textPrimary, fontWeight: 500 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span>{client.client_name}</span>
                                                        {filter === 'pending' && Boolean(getEscalatedAtIso(client)) && (
                                                            <span style={{
                                                                fontSize: 9,
                                                                fontWeight: 700,
                                                                padding: '2px 6px',
                                                                borderRadius: 2,
                                                                background: isDarkMode ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.12)',
                                                                color: '#f59e0b',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.03em',
                                                            }} title={(() => {
                                                                const iso = getEscalatedAtIso(client);
                                                                const date = formatShortDate(iso);
                                                                return date ? `Escalated on ${date}` : 'Escalated';
                                                            })()}>
                                                                Escalated{(() => {
                                                                    const date = formatShortDate(getEscalatedAtIso(client));
                                                                    return date ? ` · ${date}` : '';
                                                                })()}
                                                            </span>
                                                        )}
                                                        {filter === 'migrate' && (
                                                            <span style={{
                                                                fontSize: 9,
                                                                fontWeight: 600,
                                                                padding: '2px 6px',
                                                                borderRadius: 2,
                                                                background: client.status === 'sent' 
                                                                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.1)')
                                                                    : (isDarkMode ? 'rgba(156, 163, 175, 0.2)' : 'rgba(156, 163, 175, 0.15)'),
                                                                color: client.status === 'sent'
                                                                    ? colours.green
                                                                    : textMuted,
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.03em',
                                                            }}>
                                                                {client.status === 'sent' ? 'Sent' : 'N/A'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px', color: textSecondary }}>
                                                    {client.open_matters.length === 1
                                                        ? (
                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                <a 
                                                                    href={`https://app.clio.com/nc/#/matters/${client.open_matters[0].matter_id}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{ 
                                                                        color: colours.highlight, 
                                                                        textDecoration: 'none',
                                                                        fontSize: 11,
                                                                    }}
                                                                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                                                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                                                >
                                                                    {client.open_matters[0].display_number}
                                                                </a>
                                                                {renderVerificationIndicator(client.open_matters[0].display_number, client.open_matters[0], isAdmin && client.status === 'pending')}
                                                            </div>
                                                        )
                                                        : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                {client.open_matters.map((m, i) => (
                                                                    <div key={`open-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                                                        <a 
                                                                            href={`https://app.clio.com/nc/#/matters/${m.matter_id}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            style={{ 
                                                                                color: colours.highlight, 
                                                                                textDecoration: 'none',
                                                                            }}
                                                                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                                                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                                                        >
                                                                            {m.display_number}
                                                                        </a>
                                                                        {renderVerificationIndicator(m.display_number, m, isAdmin && client.status === 'pending')}
                                                                        {m.open_date && (
                                                                            <span style={{ fontSize: 9, color: textMuted }}>
                                                                                ({new Date(m.open_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )
                                                    }
                                                </td>
                                                <td style={{ padding: '12px', color: textSecondary, fontSize: 11 }}>
                                                    {(() => {
                                                        const earliestMatter = client.open_matters
                                                            .filter(m => m.open_date)
                                                            .sort((a, b) => new Date(a.open_date!).getTime() - new Date(b.open_date!).getTime())[0];
                                                        if (!earliestMatter?.open_date) return '—';
                                                        const d = new Date(earliestMatter.open_date);
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                                                                <span style={{ fontWeight: 500 }}>{d.getDate()} {d.toLocaleDateString('en-GB', { month: 'short' })}</span>
                                                                <span style={{ fontSize: 10, color: textMuted }}>{d.getFullYear()}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td style={{ padding: '12px', color: textSecondary, fontSize: 11 }}>
                                                    {client.open_matters.length === 1 
                                                        ? (() => {
                                                            const respSol = client.open_matters[0].responsible_solicitor || '';
                                                            const origSol = client.open_matters[0].originating_solicitor || '';
                                                            const respInactive = !isActiveSolicitor(respSol);
                                                            const origInactive = origSol ? !isActiveSolicitor(origSol) : false;
                                                            // Orange = active originator who can rescue inactive responsible
                                                            const origCanRescue = respInactive && origSol && !origInactive && origSol !== respSol;
                                                            
                                                            return (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                                    <span 
                                                                        title={respInactive ? 'Inactive - Responsible Solicitor' : 'Responsible Solicitor'}
                                                                        style={{ 
                                                                            color: respInactive ? '#ef4444' : undefined,
                                                                            fontWeight: respInactive ? 600 : undefined,
                                                                        }}
                                                                    >
                                                                        {respSol || '—'}
                                                                        {respInactive && (
                                                                            <Icon iconName="Warning" style={{ fontSize: 10, marginLeft: 4, color: '#ef4444' }} />
                                                                        )}
                                                                    </span>
                                                                    {origSol && origSol !== respSol && (
                                                                        <span 
                                                                            style={{ 
                                                                                fontSize: 10, 
                                                                                color: origCanRescue ? '#f59e0b' : (origInactive ? '#ef4444' : textMuted), 
                                                                                fontStyle: 'italic',
                                                                                fontWeight: (origInactive || origCanRescue) ? 600 : undefined,
                                                                            }} 
                                                                            title={origCanRescue ? 'Active - Can action this matter' : (origInactive ? 'Inactive - Originating Solicitor' : 'Originating Solicitor')}
                                                                        >
                                                                            ↳ {origSol}
                                                                            {origInactive && (
                                                                                <Icon iconName="Warning" style={{ fontSize: 9, marginLeft: 3, color: '#ef4444' }} />
                                                                            )}
                                                                            {origCanRescue && (
                                                                                <Icon iconName="UserFollowed" style={{ fontSize: 9, marginLeft: 3, color: '#f59e0b' }} />
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()
                                                        : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                {(() => {
                                                                    // Check if any responsible solicitor is inactive
                                                                    const hasInactiveResponsible = client.responsible_solicitors.some(s => !isActiveSolicitor(s));
                                                                    
                                                                    return client.responsible_solicitors.map((sol, i) => {
                                                                        const solInactive = !isActiveSolicitor(sol);
                                                                        return (
                                                                            <span 
                                                                                key={i} 
                                                                                title={solInactive ? 'Inactive - Responsible Solicitor' : 'Responsible Solicitor'}
                                                                                style={{
                                                                                    color: solInactive ? '#ef4444' : undefined,
                                                                                    fontWeight: solInactive ? 600 : undefined,
                                                                                }}
                                                                            >
                                                                                {sol}
                                                                                {solInactive && (
                                                                                    <Icon iconName="Warning" style={{ fontSize: 10, marginLeft: 4, color: '#ef4444' }} />
                                                                                )}
                                                                            </span>
                                                                        );
                                                                    });
                                                                })()}
                                                                {(() => {
                                                                    // Check if any responsible solicitor is inactive
                                                                    const hasInactiveResponsible = client.responsible_solicitors.some(s => !isActiveSolicitor(s));
                                                                    
                                                                    return (client.originating_solicitors || [])
                                                                        .filter(os => !client.responsible_solicitors.includes(os))
                                                                        .map((sol, i) => {
                                                                            const solInactive = !isActiveSolicitor(sol);
                                                                            // Orange = active originator who can rescue inactive responsible
                                                                            const canRescue = hasInactiveResponsible && !solInactive;
                                                                            
                                                                            return (
                                                                                <span 
                                                                                    key={`orig-${i}`} 
                                                                                    style={{ 
                                                                                        fontSize: 10, 
                                                                                        color: canRescue ? '#f59e0b' : (solInactive ? '#ef4444' : textMuted), 
                                                                                        fontStyle: 'italic',
                                                                                        fontWeight: (solInactive || canRescue) ? 600 : undefined,
                                                                                    }} 
                                                                                    title={canRescue ? 'Active - Can action this matter' : (solInactive ? 'Inactive - Originating Solicitor' : 'Originating Solicitor')}
                                                                                >
                                                                                    ↳ {sol}
                                                                                    {solInactive && (
                                                                                        <Icon iconName="Warning" style={{ fontSize: 9, marginLeft: 3, color: '#ef4444' }} />
                                                                                    )}
                                                                                    {canRescue && (
                                                                                        <Icon iconName="UserFollowed" style={{ fontSize: 9, marginLeft: 3, color: '#f59e0b' }} />
                                                                                    )}
                                                                                </span>
                                                                            );
                                                                        });
                                                                })()}
                                                            </div>
                                                        )
                                                    }
                                                </td>
                                                <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                                                    {client.status === 'pending' ? (
                                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                            <button
                                                                className="rc-btn rc-btn-primary"
                                                                onClick={(e) => canActionClient(client.client_id) && handleMarkSent(client, e)}
                                                                disabled={isProcessing || !canActionClient(client.client_id)}
                                                                style={{
                                                                    padding: '6px 16px', border: 'none', borderRadius: 0,
                                                                    background: canActionClient(client.client_id) ? colours.highlight : (isDarkMode ? '#4b5563' : '#ccc'),
                                                                    color: '#fff',
                                                                    fontSize: 11, fontWeight: 600, 
                                                                    cursor: canActionClient(client.client_id) ? 'pointer' : 'not-allowed',
                                                                    letterSpacing: '0.03em', textTransform: 'uppercase',
                                                                    opacity: canActionClient(client.client_id) ? 1 : 0.5,
                                                                }}
                                                            >
                                                                {isProcessing && canActionClient(client.client_id) ? '...' : 'Sent'}
                                                            </button>
                                                            <button
                                                                className="rc-btn rc-btn-secondary"
                                                                onClick={(e) => canActionClient(client.client_id) && handleMarkNA(client, e)}
                                                                disabled={!canActionClient(client.client_id)}
                                                                style={{
                                                                    padding: '6px 14px', 
                                                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                                                                    borderRadius: 0, background: 'transparent', 
                                                                    color: textMuted,
                                                                    fontSize: 11, fontWeight: 600, 
                                                                    cursor: canActionClient(client.client_id) ? 'pointer' : 'not-allowed',
                                                                    letterSpacing: '0.03em', textTransform: 'uppercase',
                                                                    opacity: canActionClient(client.client_id) ? 1 : 0.5,
                                                                }}
                                                            >
                                                                N/A
                                                            </button>
                                                        </div>
                                                    ) : filter === 'migrate' ? (
                                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                            {isAdmin && (
                                                                <button
                                                                    className="rc-btn"
                                                                    onClick={(e) => handleSetCclDate(client, e)}
                                                                    disabled={isProcessing}
                                                                    style={{
                                                                        padding: '6px 14px', 
                                                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                                                                        borderRadius: 0, background: 'transparent', 
                                                                        color: textMuted,
                                                                        fontSize: 11, fontWeight: 600, 
                                                                        cursor: 'pointer',
                                                                        letterSpacing: '0.03em', textTransform: 'uppercase',
                                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                                    }}
                                                                >
                                                                    <Icon iconName="Calendar" style={{ fontSize: 10 }} />
                                                                    CCL Date
                                                                </button>
                                                            )}
                                                            <button
                                                                className="rc-btn rc-btn-primary"
                                                                onClick={() => handleStartMigrate(client)}
                                                                disabled={isProcessing}
                                                                style={{
                                                                    padding: '6px 16px', border: 'none', borderRadius: 0,
                                                                    background: colours.highlight,
                                                                    color: '#fff',
                                                                    fontSize: 11, fontWeight: 600, 
                                                                    cursor: 'pointer',
                                                                    letterSpacing: '0.03em', textTransform: 'uppercase',
                                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                                }}
                                                            >
                                                                <Icon iconName="Database" style={{ fontSize: 10 }} />
                                                                Migrate
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            className="rc-btn"
                                                            onClick={(e) => canActionClient(client.client_id) && handleUndoClick(client, e)}
                                                            disabled={isProcessing || !canActionClient(client.client_id)}
                                                            style={{
                                                                padding: '6px 14px', borderRadius: 0,
                                                                border: `1px solid ${isDarkMode ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.3)'}`,
                                                                background: isDarkMode ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                                                                color: isDarkMode ? '#fca5a5' : '#dc2626',
                                                                fontSize: 11, fontWeight: 600, 
                                                                cursor: canActionClient(client.client_id) ? 'pointer' : 'not-allowed',
                                                                letterSpacing: '0.03em', textTransform: 'uppercase',
                                                                opacity: canActionClient(client.client_id) ? 1 : 0.5,
                                                                display: 'flex', alignItems: 'center', gap: 5,
                                                            }}
                                                        >
                                                            <Icon iconName="Undo" style={{ fontSize: 10 }} />
                                                            Undo
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Toasts */}
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, pointerEvents: 'none' }}>
                    {toasts.map(t => (
                        <div key={t.id} className="rc-toast" style={{
                            padding: '12px 24px', marginTop: 8,
                            background: t.type === 'success' ? '#1a1a1a' : '#dc2626',
                            color: '#fff', fontSize: 13, fontWeight: 600,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            border: `1px solid ${t.type === 'success' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.25)'}`,
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase',
                        }}>
                            {t.message}
                        </div>
                    ))}
                </div>
            </Modal>

            {/* Confirmation Modal - Record Preview */}
            <Modal
                isOpen={!!confirmClient}
                onDismiss={closeConfirmModal}
                styles={{ 
                    main: { 
                        maxWidth: 420, 
                        maxHeight: '90vh',
                        borderRadius: 2, 
                        background: isDarkMode ? '#3d4a5c' : '#fff',
                        boxShadow: isDarkMode 
                            ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)' 
                            : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                    },
                    scrollableContent: {
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }
                }}
            >
                <div style={{ padding: '20px 24px 16px', overflowY: 'auto', flex: 1 }}>
                    {/* Hidden focus trap to prevent date input auto-focus */}
                    <div tabIndex={0} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} aria-hidden="true" />
                    
                    {/* SUCCESS STATE - Clean, centered, Apple-style */}
                    {streamingComplete && streamingAllSucceeded ? (
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            padding: '40px 20px',
                            textAlign: 'center',
                        }}>
                            <div style={{ 
                                width: 56, height: 56, 
                                borderRadius: '50%', 
                                background: isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                marginBottom: 16,
                            }}>
                                <Icon iconName="CheckMark" style={{ fontSize: 28, color: colours.green }} />
                            </div>
                            <div style={{ 
                                fontSize: 17, 
                                fontWeight: 600, 
                                color: isDarkMode ? '#f9fafb' : '#1d1d1f',
                                marginBottom: 6,
                            }}>
                                {confirmAction === 'sent'
                                    ? 'Notice Recorded'
                                    : confirmAction === 'na'
                                    ? 'Marked N/A'
                                    : confirmAction === 'ccl-date'
                                    ? 'CCL Date Updated'
                                    : 'Record Removed'}
                            </div>
                            <div style={{ 
                                fontSize: 13, 
                                color: textMuted,
                            }}>
                                {confirmClient?.client_name}
                            </div>
                        </div>
                    ) : (
                    /* Normal state - Header and form content */
                    <>
                    {/* Header - Clear confirmation message with icon */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ 
                            display: 'flex', alignItems: 'center', gap: 8,
                            marginBottom: 6,
                        }}>
                            <Icon 
                                iconName={streamingComplete 
                                    ? 'Warning'
                                    : (confirmAction === 'sent' ? 'Send' : confirmAction === 'na' ? 'Cancel' : confirmAction === 'ccl-date' ? 'Calendar' : 'Undo')} 
                                style={{ 
                                    fontSize: 16, 
                                    color: streamingComplete 
                                        ? colours.cta
                                        : (confirmAction === 'sent' ? colours.green : confirmAction === 'na' ? colours.cta : confirmAction === 'ccl-date' ? colours.highlight : '#94a3b8'),
                                }} 
                            />
                            <span style={{ 
                                fontSize: 15, fontWeight: 600, 
                                color: isDarkMode ? '#f9fafb' : '#1d1d1f',
                                lineHeight: 1.3,
                            }}>
                                {streamingComplete 
                                    ? 'Completed with errors'
                                    : (confirmAction === 'sent' 
                                        ? 'Confirm rate notice sent' 
                                        : confirmAction === 'na' 
                                        ? 'Mark as not applicable' 
                                        : confirmAction === 'ccl-date'
                                        ? 'Set CCL Date'
                                        : 'Remove record')}
                            </span>
                        </div>
                        {/* Only show description text before streaming completes */}
                        {!streamingComplete && (
                            <div style={{ 
                                fontSize: 13, 
                                color: textMuted,
                                lineHeight: 1.4,
                            }}>
                                {confirmAction === 'sent' 
                                    ? <>Record that the Jan {year} rate change letter has been sent to <strong style={{ color: textPrimary }}>{confirmClient?.client_name}</strong>.{confirmMatterCount > 1 && <> Updates <strong style={{ color: textPrimary }}>{confirmMatterPhrase}</strong> in Clio.</>}</>
                                    : confirmAction === 'na' 
                                    ? <>Mark <strong style={{ color: textPrimary }}>{confirmClient?.client_name}</strong> as not requiring a rate notice.{confirmMatterCount > 1 && <> Applies to <strong style={{ color: textPrimary }}>{confirmMatterPhrase}</strong>.</>}</>
                                    : confirmAction === 'ccl-date'
                                    ? <>Write <strong style={{ color: textPrimary }}>CCL Date</strong> to Clio and SQL for <strong style={{ color: textPrimary }}>{confirmClient?.client_name}</strong>.{confirmMatterCount > 1 && <> Applies to <strong style={{ color: textPrimary }}>{confirmMatterPhrase}</strong>.</>}</>
                                    : <>Remove the tracking record for <strong style={{ color: textPrimary }}>{confirmClient?.client_name}</strong>.</>}
                            </div>
                        )}
                    </div>
                    </>
                    )}

                    {/* Combined details section - date picker for sent, reason for N/A (skip for undo to avoid duplicate matters list) */}
                    {!isStreaming && !streamingComplete && confirmAction !== 'undo' && (
                        <div style={{ 
                            display: 'flex', 
                            flexWrap: 'wrap',
                            gap: 16,
                            padding: '12px 14px',
                            background: isDarkMode ? '#2d3748' : '#f8f9fa',
                            border: `1px solid ${borderColor}`,
                            marginBottom: 16,
                        }}>
                            {/* Matters */}
                            <div style={{ flex: '1 1 100%' }}>
                                <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', marginBottom: 6, fontWeight: 500, letterSpacing: '0.03em' }}>
                                    {confirmAction === 'ccl-date' ? 'Matters to update' : 'Matters'}
                                </div>

                                {confirmAction === 'ccl-date' ? (
                                    <div style={{
                                        border: `1px solid ${borderColor}`,
                                        background: isDarkMode ? '#374151' : '#fff',
                                    }}>
                                        {confirmClient?.open_matters.map((m, i) => {
                                            const isChecked = cclMatterSelections[m.display_number] ?? false;
                                            const dateValue = cclMatterDates[m.display_number] || cclDate;
                                            return (
                                                <div
                                                    key={m.display_number}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '8px 10px',
                                                        borderBottom: i < (confirmClient?.open_matters.length || 0) - 1 ? `1px solid ${borderColor}` : 'none',
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => setCclMatterSelections(prev => ({ ...prev, [m.display_number]: !isChecked }))}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>
                                                                {m.display_number}
                                                            </span>
                                                            {m.responsible_solicitor && (
                                                                <span style={{ fontSize: 9, color: textMuted, fontWeight: 500 }} title={m.responsible_solicitor}>
                                                                    {m.responsible_solicitor.split(' ').map(n => n[0]).join('')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="date"
                                                        value={dateValue}
                                                        onChange={(e) => setCclMatterDates(prev => ({ ...prev, [m.display_number]: e.target.value }))}
                                                        disabled={!isChecked}
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            border: `1px solid ${borderColor}`,
                                                            borderRadius: 0,
                                                            background: isDarkMode ? '#2d3748' : '#fff',
                                                            color: isDarkMode ? '#f3f4f6' : '#1f2937',
                                                            cursor: isChecked ? 'pointer' : 'not-allowed',
                                                            opacity: isChecked ? 1 : 0.5,
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {confirmClient?.open_matters.map((m, i) => (
                                            <span
                                                key={i}
                                                title={m.responsible_solicitor || 'No solicitor'}
                                                style={{
                                                    padding: '3px 8px',
                                                    background: isDarkMode ? '#374151' : '#fff',
                                                    border: `1px solid ${borderColor}`,
                                                    fontSize: 11,
                                                    color: textPrimary,
                                                    fontWeight: 500,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}
                                            >
                                                <span>{m.display_number}</span>
                                                {m.responsible_solicitor && (
                                                    <span style={{ fontSize: 9, color: textMuted, fontWeight: 400 }}>
                                                        {m.responsible_solicitor.split(' ').map(n => n[0]).join('')}
                                                    </span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Date for sent action */}
                            {confirmAction === 'sent' && (
                                <div>
                                    <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', marginBottom: 6, fontWeight: 500, letterSpacing: '0.03em' }}>Sent on</div>
                                    <input
                                        type="date"
                                        value={sentDate}
                                        onChange={(e) => setSentDate(e.target.value)}
                                        style={{
                                            padding: '5px 10px',
                                            fontSize: 11,
                                            border: `1px solid ${borderColor}`,
                                            borderRadius: 0,
                                            background: isDarkMode ? '#374151' : '#fff',
                                            color: isDarkMode ? '#f3f4f6' : '#1f2937',
                                            cursor: 'pointer',
                                        }}
                                    />
                                </div>
                            )}

                            {/* User */}
                            {(confirmAction === 'sent' || confirmAction === 'na' || confirmAction === 'ccl-date') && (
                                <div>
                                    <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', marginBottom: 6, fontWeight: 500, letterSpacing: '0.03em' }}>
                                        {confirmAction === 'sent' ? 'Sent by' : confirmAction === 'na' ? 'Marked by' : 'Updated by'}
                                    </div>
                                    <div style={{ fontSize: 12, color: textPrimary, fontWeight: 500 }}>{currentUserName}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* N/A reason selector - show for N/A action only */}
                    {confirmAction === 'na' && !isStreaming && !streamingComplete && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ 
                                fontSize: 9, fontWeight: 500, 
                                color: textMuted,
                                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em',
                            }}>
                                Reason
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {NA_REASONS.map(r => (
                                    <button
                                        key={r.key}
                                        className="rc-btn"
                                        onClick={() => setNaReason(r.key as string)}
                                        style={{
                                            padding: '5px 10px', borderRadius: 0,
                                            border: naReason === r.key 
                                                ? `1px solid ${colours.highlight}` 
                                                : `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                                            background: naReason === r.key 
                                                ? (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.06)') 
                                                : 'transparent',
                                            color: naReason === r.key 
                                                ? (isDarkMode ? '#60a5fa' : colours.highlight)
                                                : textMuted,
                                            fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                            transition: 'all 0.1s ease',
                                        }}
                                    >
                                        {r.text}
                                    </button>
                                ))}
                            </div>
                            {naReason === 'custom' && (
                                <TextField
                                    placeholder="Enter custom reason..."
                                    value={customReason}
                                    onChange={(_, v) => setCustomReason(v || '')}
                                    maxLength={50}
                                    styles={{ 
                                        root: { marginTop: 8 }, 
                                        fieldGroup: { 
                                            borderRadius: 0, 
                                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                                            background: isDarkMode ? '#374151' : '#fff',
                                        },
                                        field: { fontSize: 12, color: isDarkMode ? '#f9fafb' : undefined },
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {/* Streaming Progress Panel - shown during Clio updates */}
                    {isStreaming && (
                        <div style={{ 
                            background: isDarkMode ? '#2d3748' : '#f9fafb',
                            border: `1px solid ${borderColor}`,
                            padding: 16,
                            marginBottom: 16,
                        }}>
                            <div style={{ 
                                fontSize: 10, fontWeight: 600, color: textMuted, 
                                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <Spinner size={SpinnerSize.xSmall} />
                                Updating Matters
                            </div>
                            
                            {/* Status message */}
                            <div style={{ 
                                fontSize: 12, 
                                color: textSecondary, 
                                marginBottom: 12,
                                padding: '8px 12px',
                                background: isDarkMode ? '#374151' : '#fff',
                                border: `1px solid ${borderColor}`,
                            }}>
                                {streamingStep || 'Starting...'}
                            </div>
                            
                            {/* Progress summary */}
                            {streamingSummary && (
                                <div style={{ 
                                    display: 'flex', gap: 16, marginBottom: 12,
                                    fontSize: 11, 
                                }}>
                                    <span style={{ color: colours.green, fontWeight: 600 }}>
                                        ✓ {streamingSummary.success} success
                                    </span>
                                    {(streamingSummary.skipped ?? 0) > 0 && (
                                        <span style={{ color: colours.orange, fontWeight: 600 }} title="Not found in Clio - may be closed/archived">
                                            ⊘ {streamingSummary.skipped} skipped
                                        </span>
                                    )}
                                    {streamingSummary.failed > 0 && (
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                            ✗ {streamingSummary.failed} failed
                                        </span>
                                    )}
                                    <span style={{ color: textMuted }}>
                                        of {streamingSummary.total}
                                    </span>
                                </div>
                            )}
                            
                            {/* Matter progress list */}
                            <div style={{ 
                                maxHeight: 200, 
                                overflowY: 'auto',
                                border: `1px solid ${borderColor}`,
                                background: isDarkMode ? '#374151' : '#fff',
                            }}>
                                {matterProgress.map((m, i) => (
                                    <div 
                                        key={m.displayNumber}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 12px',
                                            borderBottom: i < matterProgress.length - 1 
                                                ? `1px solid ${borderColor}` 
                                                : 'none',
                                            fontSize: 12,
                                        }}
                                    >
                                        {/* Status icon */}
                                        <div style={{ width: 20, textAlign: 'center' }}>
                                            {m.status === 'pending' && (
                                                <span style={{ color: textMuted }}>○</span>
                                            )}
                                            {m.status === 'updating' && (
                                                <Spinner size={SpinnerSize.xSmall} />
                                            )}
                                            {m.status === 'success' && (
                                                <span style={{ color: colours.green, fontSize: 14 }}>✓</span>
                                            )}
                                            {m.status === 'skipped' && (
                                                <span style={{ color: colours.orange, fontSize: 14 }} title={m.message || 'Not found in Clio'}>⊘</span>
                                            )}
                                            {m.status === 'failed' && (
                                                <span style={{ color: '#ef4444', fontSize: 14 }}>✗</span>
                                            )}
                                        </div>
                                        
                                        {/* Matter number */}
                                        <span style={{ 
                                            color: textPrimary, 
                                            fontWeight: 500,
                                            flex: 1,
                                        }}>
                                            {m.displayNumber}
                                        </span>
                                        
                                        {/* Status text */}
                                        <span style={{ 
                                            fontSize: 10, 
                                            color: m.status === 'success' ? colours.green 
                                                : m.status === 'skipped' ? colours.orange
                                                : m.status === 'failed' ? '#ef4444' 
                                                : m.status === 'updating' ? colours.highlight
                                                : textMuted,
                                            fontWeight: 500,
                                            textTransform: 'uppercase',
                                        }}>
                                            {m.status === 'updating' ? 'UPDATING' : m.status === 'skipped' ? 'SKIPPED' : m.status.toUpperCase()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Error details if any failures */}
                            {matterProgress.some(m => m.status === 'failed' && m.error) && (
                                <div style={{ 
                                    marginTop: 12, 
                                    padding: 10, 
                                    background: isDarkMode ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    fontSize: 11,
                                    color: '#ef4444',
                                }}>
                                    <strong>Errors:</strong>
                                    {matterProgress.filter(m => m.error).map(m => (
                                        <div key={m.displayNumber} style={{ marginTop: 4 }}>
                                            {m.displayNumber}: {m.error}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Record Preview Panel - hidden during/after streaming - only show for undo action */}
                    {confirmAction === 'undo' && !isStreaming && !streamingComplete && (
                    <div style={{ 
                        background: isDarkMode ? '#2d3748' : '#f8f9fa',
                        border: `1px solid ${borderColor}`,
                        padding: '12px 14px',
                        marginBottom: 16,
                    }}>
                        {/* Matters */}
                        <div>
                            <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', marginBottom: 6, fontWeight: 500, letterSpacing: '0.03em' }}>
                                Matters
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {confirmClient?.open_matters.map((m, i) => (
                                    <span key={i} style={{
                                        padding: '3px 8px',
                                        background: isDarkMode ? '#374151' : '#fff',
                                        border: `1px solid ${borderColor}`,
                                        fontSize: 11,
                                        color: textPrimary,
                                        fontWeight: 500,
                                    }}>
                                        {m.display_number}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    )}



                    {/* Warning - only if other solicitors affected (hide during/after streaming) */}
                    {otherSolicitorMatters.length > 0 && confirmAction !== 'undo' && !isStreaming && !streamingComplete && (
                        <div style={{
                            padding: '10px 14px', marginTop: 12,
                            background: isDarkMode ? 'rgba(251,191,36,0.15)' : 'rgba(255,204,0,0.1)',
                            border: `1px solid ${isDarkMode ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.4)'}`,
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                        }}>
                            <Icon iconName="Warning" style={{ fontSize: 14, color: '#fbbf24', marginTop: 1 }} />
                            <div>
                                <div style={{ 
                                    fontSize: 11, fontWeight: 600, 
                                    color: isDarkMode ? '#fbbf24' : '#b89600',
                                    marginBottom: 2,
                                }}>
                                    Includes matters for other solicitors
                                </div>
                                <div style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : 'rgba(0,0,0,0.55)', lineHeight: 1.4 }}>
                                    {otherSolicitorMatters.map(m => m.responsible_solicitor).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Actions - sticky at bottom */}
                <div style={{ 
                    padding: '16px 20px 20px',
                    display: 'flex',
                    gap: 10,
                    borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                    background: isDarkMode ? '#3d4a5c' : '#fff',
                    flexShrink: 0,
                }}>
                    {isStreaming && !streamingComplete ? (
                        /* During active streaming - show "Updating..." */
                        <div style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: isDarkMode ? '#374151' : '#f3f4f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            fontSize: 14,
                            fontWeight: 600,
                            color: textSecondary,
                        }}>
                            <Spinner size={SpinnerSize.small} />
                            Updating...
                        </div>
                    ) : streamingComplete ? (
                        /* After streaming complete - show results and close button */
                        <>
                            {streamingAllSucceeded ? (
                                /* All succeeded - simple Done button */
                                <button
                                    className="rc-btn rc-btn-primary"
                                    onClick={closeConfirmModal}
                                    style={{ 
                                        flex: 1, padding: '12px 16px', 
                                        border: 'none',
                                        borderRadius: 0,
                                        background: colours.highlight,
                                        color: '#fff',
                                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Done
                                </button>
                            ) : (
                                /* Some failed - show warning and Close button */
                                <>
                                    <button
                                        className="rc-btn rc-btn-secondary"
                                        onClick={closeConfirmModal}
                                        style={{ 
                                            flex: 1, padding: '12px 16px', 
                                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                                            borderRadius: 0,
                                            background: isDarkMode ? '#4b5563' : 'transparent',
                                            color: isDarkMode ? '#e5e7eb' : 'rgba(0,0,0,0.6)',
                                            fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >
                                        Close
                                    </button>
                                    <button
                                        className="rc-btn"
                                        onClick={executeAction}
                                        style={{ 
                                            flex: 1, padding: '12px 16px', 
                                            border: 'none',
                                            borderRadius: 0,
                                            background: colours.highlight,
                                            color: '#fff',
                                            fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >
                                        Retry
                                    </button>
                                </>
                            )}
                        </>
                    ) : (
                        /* Normal state - Cancel and Confirm buttons */
                        <>
                            <button
                                className="rc-btn rc-btn-secondary"
                                onClick={closeConfirmModal}
                                style={{ 
                                    flex: 1, padding: '12px 16px', 
                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                                    borderRadius: 0,
                                    background: isDarkMode ? '#4b5563' : 'transparent',
                                    color: isDarkMode ? '#e5e7eb' : 'rgba(0,0,0,0.6)',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="rc-btn rc-btn-primary"
                                onClick={executeAction}
                                disabled={(confirmAction === 'na' && (!naReason || (naReason === 'custom' && !customReason.trim())))
                                    || (confirmAction === 'ccl-date' && !isCclDateActionValid)}
                                style={{ 
                                    flex: 1, padding: '12px 16px', 
                                    border: 'none',
                                    borderRadius: 0,
                                    background: ((confirmAction === 'na' && (!naReason || (naReason === 'custom' && !customReason.trim())))
                                        || (confirmAction === 'ccl-date' && !isCclDateActionValid)) 
                                        ? (isDarkMode ? '#4b5563' : 'rgba(54,144,206,0.4)')
                                        : colours.highlight,
                                    color: ((confirmAction === 'na' && (!naReason || (naReason === 'custom' && !customReason.trim())))
                                        || (confirmAction === 'ccl-date' && !isCclDateActionValid))
                                        ? (isDarkMode ? '#9ca3af' : '#fff')
                                        : '#fff',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Confirm
                            </button>
                        </>
                    )}
                </div>
            </Modal>

            {/* Passcode Modal */}
            <Modal
                isOpen={showPasscodeModal}
                onDismiss={() => { setShowPasscodeModal(false); setPasscodeInput(''); setPasscodeError(''); setPendingUndoClient(null); }}
                isBlocking={false}
                styles={{
                    main: {
                        maxWidth: 340, width: '90vw', borderRadius: 2,
                        background: isDarkMode ? '#2d3748' : '#fff',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
                    },
                }}
            >
                <div style={{ padding: 24 }}>
                    <div style={{ 
                        fontSize: 14, fontWeight: 700, 
                        color: textPrimary, marginBottom: 8,
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <Icon iconName={passcodeAction === 'undo' ? 'Undo' : 'Lock'} style={{ fontSize: 16 }} />
                        {passcodeAction === 'undo' ? 'Undo Access Required' : 'Dev Access Required'}
                    </div>
                    <div style={{ fontSize: 12, color: textMuted, marginBottom: 16, lineHeight: 1.5 }}>
                        {passcodeAction === 'undo' 
                            ? 'Undo actions are restricted. Enter passcode to continue.'
                            : 'Migration tools are restricted. Enter the dev passcode to continue.'}
                    </div>
                    <TextField
                        placeholder="Enter passcode"
                        type="password"
                        value={passcodeInput}
                        onChange={(_, v) => { setPasscodeInput(v || ''); setPasscodeError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handlePasscodeSubmit()}
                        errorMessage={passcodeError}
                        styles={{
                            fieldGroup: { 
                                borderRadius: 0,
                                border: `1px solid ${passcodeError ? '#dc2626' : (isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)')}`,
                                background: isDarkMode ? '#374151' : '#fff',
                            },
                            field: { fontSize: 14, color: isDarkMode ? '#f9fafb' : undefined },
                        }}
                    />
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button
                            className="rc-btn"
                            onClick={() => { setShowPasscodeModal(false); setPasscodeInput(''); setPasscodeError(''); setPendingUndoClient(null); }}
                            style={{
                                flex: 1, padding: '10px 16px', 
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                                borderRadius: 0, background: 'transparent', color: textMuted,
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            className="rc-btn rc-btn-primary"
                            onClick={handlePasscodeSubmit}
                            disabled={!passcodeInput}
                            style={{
                                flex: 1, padding: '10px 16px', border: 'none', borderRadius: 0,
                                background: passcodeInput ? colours.highlight : (isDarkMode ? '#4b5563' : '#ccc'),
                                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Unlock
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Migrate Form Modal */}
            <Modal
                isOpen={!!migrateClient}
                onDismiss={closeMigrateModal}
                isBlocking={migrateStep !== 'form'}
                styles={{
                    main: {
                        maxWidth: 500, width: '95vw', borderRadius: 2,
                        background: isDarkMode ? '#2d3748' : '#fff',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
                    },
                }}
            >
                {migrateClient && (
                    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
                        {/* Header */}
                        <div style={{ 
                            padding: '16px 20px', 
                            borderBottom: `1px solid ${borderColor}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>
                                    Migrate Client Data
                                </div>
                                <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
                                    {migrateClient.client_name}
                                </div>
                            </div>
                            <IconButton
                                iconProps={{ iconName: 'Cancel' }}
                                onClick={closeMigrateModal}
                                disabled={migrateStep !== 'form' && migrateStep !== 'done'}
                                styles={{ root: { color: textMuted } }}
                            />
                        </div>

                        {/* Progress indicator - 5 steps with status dots */}
                        <div style={{ 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 20px',
                            background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                            borderBottom: `1px solid ${borderColor}`,
                        }}>
                            {([
                                { key: 'clio-done', label: 'Clio', isPreDone: true },
                                { key: 'db-done', label: 'DB', isPreDone: true },
                                { key: 'lookup', label: 'Fetch' },
                                { key: 'db', label: 'Fill' },
                                { key: 'done', label: 'Done' },
                            ] as const).map((step, i, arr) => {
                                const stepIndex = ['form', 'lookup', 'db', 'done'].indexOf(migrateStep);
                                const isPreDone = 'isPreDone' in step && step.isPreDone;
                                const isActive = !isPreDone && step.key === migrateStep;
                                // Map step keys to their required stepIndex
                                const stepKeyToIndex: Record<string, number> = { 'lookup': 1, 'db': 2, 'done': 3 };
                                const isComplete = isPreDone || (step.key in stepKeyToIndex && stepIndex >= stepKeyToIndex[step.key]) || migrateStep === 'done';
                                return (
                                    <React.Fragment key={step.key}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ 
                                                width: 8, height: 8, borderRadius: '50%',
                                                background: isComplete ? colours.green : isActive ? colours.highlight : (isDarkMode ? '#4b5563' : '#d1d5db'),
                                                transition: 'background 0.3s',
                                            }} />
                                            <span style={{ 
                                                fontSize: 10, fontWeight: 500, 
                                                color: isComplete ? colours.green : isActive ? colours.highlight : textMuted,
                                                transition: 'color 0.3s',
                                            }}>
                                                {step.label}
                                            </span>
                                        </div>
                                        {i < arr.length - 1 && (
                                            <div style={{ 
                                                width: 20, height: 1, 
                                                background: isComplete ? colours.green : (isDarkMode ? '#4b5563' : '#d1d5db'),
                                            }} />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Content */}
                        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                            {migrateStep === 'form' ? (
                                <>
                                    <div style={{ 
                                        fontSize: 10, fontWeight: 600, color: textMuted, 
                                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16,
                                    }}>
                                        Review & Edit Client Details
                                    </div>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>
                                                    First Name
                                                </label>
                                                <TextField
                                                    value={migrateFormData.first_name}
                                                    onChange={(_, v) => setMigrateFormData(prev => ({ ...prev, first_name: v || '' }))}
                                                    placeholder="Enter first name"
                                                    styles={{
                                                        fieldGroup: { 
                                                            borderRadius: 0,
                                                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                                                            background: isDarkMode ? '#374151' : '#fff',
                                                        },
                                                        field: { fontSize: 13, color: isDarkMode ? '#f9fafb' : undefined },
                                                    }}
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>
                                                    Last Name
                                                </label>
                                                <TextField
                                                    value={migrateFormData.last_name}
                                                    onChange={(_, v) => setMigrateFormData(prev => ({ ...prev, last_name: v || '' }))}
                                                    placeholder="Enter last name"
                                                    styles={{
                                                        fieldGroup: { 
                                                            borderRadius: 0,
                                                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                                                            background: isDarkMode ? '#374151' : '#fff',
                                                        },
                                                        field: { fontSize: 13, color: isDarkMode ? '#f9fafb' : undefined },
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>
                                                Email
                                            </label>
                                            <TextField
                                                value={migrateFormData.email}
                                                onChange={(_, v) => setMigrateFormData(prev => ({ ...prev, email: v || '' }))}
                                                placeholder="Enter email address"
                                                styles={{
                                                    fieldGroup: { 
                                                        borderRadius: 0,
                                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                                                        background: isDarkMode ? '#374151' : '#fff',
                                                    },
                                                    field: { fontSize: 13, color: isDarkMode ? '#f9fafb' : undefined },
                                                }}
                                            />
                                        </div>
                                        
                                        <div>
                                            <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>
                                                Matters
                                            </label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {migrateClient.open_matters.map((m, i) => (
                                                    <div key={i} style={{
                                                        padding: '6px 10px',
                                                        background: isDarkMode ? '#374151' : '#f5f5f5',
                                                        border: `1px solid ${borderColor}`,
                                                        fontSize: 12, fontWeight: 500, color: textPrimary,
                                                    }}>
                                                        {m.display_number}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                </>
                            ) : migrateStep === 'lookup' ? (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    <Spinner size={SpinnerSize.large} />
                                    <div style={{ marginTop: 16, fontSize: 13, color: textMuted }}>
                                        Looking up contact details in Clio...
                                    </div>
                                </div>
                            ) : migrateStep === 'db' ? (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    <Spinner size={SpinnerSize.large} />
                                    <div style={{ marginTop: 16, fontSize: 13, color: textMuted }}>
                                        Writing to database...
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    <Icon iconName="CheckMark" style={{ fontSize: 48, color: colours.green }} />
                                    <div style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: colours.green }}>
                                        Migration Complete
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: 12, color: textMuted }}>
                                        {migrateClient.client_name} has been migrated successfully
                                    </div>
                                </div>
                            )}

                            {migrateError && (
                                <div style={{
                                    marginTop: 16, padding: '12px 14px',
                                    background: 'rgba(220,38,38,0.1)',
                                    border: '1px solid rgba(220,38,38,0.3)',
                                    color: '#dc2626', fontSize: 12, fontWeight: 500,
                                }}>
                                    {migrateError}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        {migrateStep === 'form' && (
                            <div style={{ 
                                padding: '16px 20px',
                                borderTop: `1px solid ${borderColor}`,
                                display: 'flex', gap: 10,
                            }}>
                                <button
                                    className="rc-btn"
                                    onClick={closeMigrateModal}
                                    style={{
                                        flex: 1, padding: '12px 16px', 
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
                                        borderRadius: 0, background: 'transparent', color: textMuted,
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="rc-btn rc-btn-primary"
                                    onClick={executeMigration}
                                    style={{
                                        flex: 1, padding: '12px 16px', border: 'none', borderRadius: 0,
                                        background: colours.highlight, color: '#fff',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    }}
                                >
                                    <Icon iconName="Database" style={{ fontSize: 12 }} />
                                    Execute Migration
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
};

export default RateChangeModal;