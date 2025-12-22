// RateChangeModal.tsx
// Clean ledger-style rate change notification tracker

import React, { useState, useCallback, useMemo, useEffect, useTransition } from 'react';
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
`;

export interface RateChangeMatter {
    matter_id: string;
    display_number: string;
    responsible_solicitor: string;
    practice_area?: string;
    status?: string;
    open_date?: string;
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
    status: 'pending' | 'sent' | 'not_applicable';
    sent_date?: string;
    sent_by?: string;
    na_reason?: string;
    na_notes?: string;
    // Persisted server-side signal that at least one open matter has a CCL date set.
    ccl_confirmed?: boolean;
}

interface RateChangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    year: number;
    clients: RateChangeClient[];
    stats: { total: number; pending: number; sent: number; not_applicable: number };
    currentUserName: string;
    userData?: UserData | null;
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
    isOpen, onClose, year, clients, stats, currentUserName, userData,
    onMarkSent, onMarkNA, onMarkSentStreaming, onMarkNAStreaming, onUndo, onUndoStreaming, onRefresh, isLoading, isDarkMode,
}) => {
    const isAdmin = isAdminUser(userData);
    const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');
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
    const [sortField, setSortField] = useState<'opened' | 'client' | 'solicitor'>('opened');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [, startTransition] = useTransition();

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

    // Ensure admins can open migrate by default
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

    const myClients = useMemo(() => {
        if (!currentUserName) return [];
        const nameParts = currentUserName.toLowerCase().split(/\s+/);
        // Match if solicitor name contains the last name (most reliable) or all name parts
        const lastName = nameParts[nameParts.length - 1];
        return clients.filter(c => c.responsible_solicitors.some(s => {
            const solicitor = s.toLowerCase();
            // Match by last name (handles Sam vs Samuel Packwood)
            if (lastName && solicitor.includes(lastName)) return true;
            // Also match if all parts are included (for exact matches)
            return nameParts.every(part => solicitor.includes(part));
        }));
    }, [clients, currentUserName]);

    // Set of client IDs that belong to current user (for checking if they can action)
    const myClientIds = useMemo(() => new Set(myClients.map(c => c.client_id)), [myClients]);

    // Check if user can action a client (admin can action all, non-admin only their own)
    const canActionClient = useCallback((clientId: string) => {
        return isAdmin || myClientIds.has(clientId);
    }, [isAdmin, myClientIds]);

    const myStats = useMemo(() => ({
        total: myClients.length,
        pending: myClients.filter(c => c.status === 'pending').length,
        sent: myClients.filter(c => c.status === 'sent').length,
        not_applicable: myClients.filter(c => c.status === 'not_applicable').length,
    }), [myClients]);

    const currentStats = viewMode === 'mine' ? myStats : stats;
    const currentClients = viewMode === 'mine' ? myClients : clients;

    // Get unique years from open matters for filter dropdown
    const availableYears = useMemo(() => {
        const sourceClients = filter === 'migrate' ? clients : currentClients;
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
    }, [clients, currentClients, filter]);

    const filteredClients = useMemo(() => {
        // Base list depends on the selected tab
        // - migrate: show all sent/N/A clients from all clients (not just mine/all view)
        // - otherwise: filter by selected status and mine/all view
        let result =
            filter === 'migrate'
                ? clients.filter(c => c.status === 'sent' || c.status === 'not_applicable')
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
    }, [clients, currentClients, filter, searchTerm, openDateFilter, sortField, sortDir]);

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
        const response = await fetch('/api/ccl-date/stream', {
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
    }, []);

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
    const confirmMatterCount = confirmAction === 'ccl-date'
        ? cclDateUpdates.length
        : (confirmClient?.open_matters.length ?? 0);
    const confirmMatterPhrase = confirmMatterCount === 0
        ? 'these matters'
        : confirmMatterCount === 1
            ? 'this matter'
            : (confirmAction === 'ccl-date' ? `${confirmMatterCount} matters` : `all ${confirmMatterCount} matters`);

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
                        </div>

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
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>Solicitor</span>
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
                                                <td style={{ padding: '12px', color: textPrimary, fontWeight: 500 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span>{client.client_name}</span>
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
                                                    {client.open_matters.length === 1 && client.closed_matters.length === 0
                                                        ? (
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
                                                                        {m.open_date && (
                                                                            <span style={{ fontSize: 9, color: textMuted }}>
                                                                                ({new Date(m.open_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {client.closed_matters.map((m, i) => (
                                                                    <div key={`closed-${i}`} style={{ fontSize: 11, opacity: 0.5 }}>
                                                                        <a 
                                                                            href={`https://app.clio.com/nc/#/matters/${m.matter_id}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            style={{ 
                                                                                color: textMuted, 
                                                                                textDecoration: 'none',
                                                                            }}
                                                                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                                                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                                                        >
                                                                            {m.display_number}
                                                                        </a>
                                                                        <span style={{ fontSize: 9, color: textMuted }}> (closed)</span>
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
                                                        ? (client.open_matters[0].responsible_solicitor || '—')
                                                        : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                {client.responsible_solicitors.map((sol, i) => (
                                                                    <span key={i}>{sol}</span>
                                                                ))}
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