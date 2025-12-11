// useRateChangeData.ts
// Hook for fetching and managing rate change notification data

import { useState, useEffect, useCallback } from 'react';
import type { RateChangeClient } from './RateChangeModal';

interface RateChangeStats {
    total: number;
    pending: number;
    sent: number;
    not_applicable: number;
}

/** Event sent during streaming matter updates */
export interface MatterUpdateEvent {
    type: 'progress' | 'matter-start' | 'matter-complete' | 'complete' | 'error';
    step?: string;
    status?: string;
    message?: string;
    index?: number;
    matterId?: string;
    displayNumber?: string;
    success?: boolean;
    skipped?: boolean;
    error?: string;
    total?: number;
    progress?: { success: number; failed: number; skipped?: number; total: number };
    clio_updates?: { success: number; failed: number; skipped: number; errors?: string[] };
}

/** Callback for streaming updates */
export type MatterUpdateCallback = (event: MatterUpdateEvent) => void;

interface UseRateChangeDataResult {
    clients: RateChangeClient[];
    stats: RateChangeStats;
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    markSent: (clientId: string, clientData: Partial<RateChangeClient>, sentDate?: string) => Promise<void>;
    markNA: (clientId: string, reason: string, notes: string, clientData: Partial<RateChangeClient>) => Promise<void>;
    markSentStreaming: (clientId: string, clientData: Partial<RateChangeClient>, onUpdate: MatterUpdateCallback, sentDate?: string) => Promise<void>;
    markNAStreaming: (clientId: string, reason: string, notes: string, clientData: Partial<RateChangeClient>, onUpdate: MatterUpdateCallback) => Promise<void>;
    undo: (clientId: string, matters: { matter_id: string; display_number: string }[]) => Promise<void>;
    undoStreaming: (clientId: string, matters: { matter_id: string; display_number: string }[], onUpdate: MatterUpdateCallback) => Promise<void>;
    pendingCountForUser: number;
}

export function useRateChangeData(
    year: number,
    userFullName: string,
    enabled: boolean = true
): UseRateChangeDataResult {
    const [clients, setClients] = useState<RateChangeClient[]>([]);
    const [stats, setStats] = useState<RateChangeStats>({ total: 0, pending: 0, sent: 0, not_applicable: 0 });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!enabled) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const response = await fetch(`/api/rate-changes/${year}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch rate change data: ${response.statusText}`);
            }
            
            const data = await response.json();
            setClients(data.clients || []);
            setStats(data.stats || { total: 0, pending: 0, sent: 0, not_applicable: 0 });
        } catch (err) {
            console.error('[useRateChangeData] Error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, [year, enabled]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const markSent = useCallback(async (clientId: string, clientData: Partial<RateChangeClient>) => {
        try {
            const response = await fetch(`/api/rate-changes/${year}/mark-sent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: clientId,
                    client_first_name: clientData.client_first_name,
                    client_last_name: clientData.client_last_name,
                    client_email: clientData.client_email,
                    matter_ids: clientData.open_matters?.map(m => m.matter_id) || [],
                    display_numbers: clientData.open_matters?.map(m => m.display_number) || [],
                    sent_by: userFullName,
                }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to mark as sent');
            }
            
            // Optimistic update
            setClients(prev => prev.map(c => 
                c.client_id === clientId 
                    ? { ...c, status: 'sent' as const, sent_date: new Date().toISOString(), sent_by: userFullName }
                    : c
            ));
            setStats(prev => ({
                ...prev,
                pending: prev.pending - 1,
                sent: prev.sent + 1,
            }));
        } catch (err) {
            console.error('[useRateChangeData] Mark sent error:', err);
            throw err;
        }
    }, [year, userFullName]);

    const markNA = useCallback(async (
        clientId: string, 
        reason: string, 
        notes: string, 
        clientData: Partial<RateChangeClient>
    ) => {
        try {
            const response = await fetch(`/api/rate-changes/${year}/mark-na`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: clientId,
                    client_first_name: clientData.client_first_name,
                    client_last_name: clientData.client_last_name,
                    client_email: clientData.client_email,
                    matter_ids: clientData.open_matters?.map(m => m.matter_id) || [],
                    display_numbers: clientData.open_matters?.map(m => m.display_number) || [],
                    na_reason: reason,
                    na_notes: notes,
                    marked_by: userFullName,
                }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to mark as N/A');
            }
            
            // Optimistic update
            setClients(prev => prev.map(c => 
                c.client_id === clientId 
                    ? { ...c, status: 'not_applicable' as const, na_reason: reason, na_notes: notes }
                    : c
            ));
            setStats(prev => ({
                ...prev,
                pending: prev.pending - 1,
                not_applicable: prev.not_applicable + 1,
            }));
        } catch (err) {
            console.error('[useRateChangeData] Mark N/A error:', err);
            throw err;
        }
    }, [year, userFullName]);

    /** Stream mark-sent with real-time Clio update callbacks */
    const markSentStreaming = useCallback(async (
        clientId: string, 
        clientData: Partial<RateChangeClient>,
        onUpdate: MatterUpdateCallback,
        sentDate?: string
    ) => {
        console.log('[markSentStreaming] Starting stream request');
        
        const response = await fetch(`/api/rate-changes/${year}/mark-sent-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                client_first_name: clientData.client_first_name,
                client_last_name: clientData.client_last_name,
                client_email: clientData.client_email,
                matter_ids: clientData.open_matters?.map(m => m.matter_id) || [],
                display_numbers: clientData.open_matters?.map(m => m.display_number) || [],
                sent_by: userFullName,
                sent_date: sentDate || new Date().toISOString().split('T')[0],
            }),
        });

        console.log('[markSentStreaming] Response status:', response.status, 'body?', !!response.body);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[markSentStreaming] Error response:', errorText);
            throw new Error(`Failed to mark as sent: ${response.status}`);
        }
        
        if (!response.body) {
            // Fallback: try to read as regular JSON response
            console.warn('[markSentStreaming] No stream body, trying JSON fallback');
            const data = await response.json();
            if (data.success) {
                onUpdate({ type: 'complete', success: true, status: 'sent', clio_updates: data.clio_updates });
                setClients(prev => prev.map(c => 
                    c.client_id === clientId 
                        ? { ...c, status: 'sent' as const, sent_date: new Date().toISOString(), sent_by: userFullName }
                        : c
                ));
                setStats(prev => ({
                    ...prev,
                    pending: prev.pending - 1,
                    sent: prev.sent + 1,
                }));
            }
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('[markSentStreaming] Stream ended');
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event: MatterUpdateEvent = JSON.parse(line.slice(6));
                        console.log('[markSentStreaming] Event:', event.type);
                        onUpdate(event);

                        // On complete, update local state ONLY if all Clio updates succeeded
                        if (event.type === 'complete' && event.success) {
                            const clioUpdates = event.clio_updates;
                            const allSucceeded = clioUpdates && clioUpdates.failed === 0;
                            
                            if (allSucceeded) {
                                setClients(prev => prev.map(c => 
                                    c.client_id === clientId 
                                        ? { ...c, status: 'sent' as const, sent_date: new Date().toISOString(), sent_by: userFullName }
                                        : c
                                ));
                                setStats(prev => ({
                                    ...prev,
                                    pending: prev.pending - 1,
                                    sent: prev.sent + 1,
                                }));
                            }
                        }
                    } catch (parseErr) {
                        console.warn('[markSentStreaming] Parse error:', parseErr);
                    }
                }
            }
        }
    }, [year, userFullName]);

    /** Stream mark-NA with real-time Clio update callbacks */
    const markNAStreaming = useCallback(async (
        clientId: string, 
        reason: string, 
        notes: string, 
        clientData: Partial<RateChangeClient>,
        onUpdate: MatterUpdateCallback
    ) => {
        console.log('[markNAStreaming] Starting stream request');
        
        const response = await fetch(`/api/rate-changes/${year}/mark-na-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                client_first_name: clientData.client_first_name,
                client_last_name: clientData.client_last_name,
                client_email: clientData.client_email,
                matter_ids: clientData.open_matters?.map(m => m.matter_id) || [],
                display_numbers: clientData.open_matters?.map(m => m.display_number) || [],
                na_reason: reason,
                na_notes: notes,
                marked_by: userFullName,
            }),
        });

        console.log('[markNAStreaming] Response status:', response.status, 'body?', !!response.body);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[markNAStreaming] Error response:', errorText);
            throw new Error(`Failed to mark as N/A: ${response.status}`);
        }
        
        if (!response.body) {
            // Fallback: try to read as regular JSON response
            console.warn('[markNAStreaming] No stream body, trying JSON fallback');
            const data = await response.json();
            if (data.success) {
                onUpdate({ type: 'complete', success: true, status: 'not_applicable', clio_updates: data.clio_updates });
                setClients(prev => prev.map(c => 
                    c.client_id === clientId 
                        ? { ...c, status: 'not_applicable' as const, na_reason: reason, na_notes: notes }
                        : c
                ));
                setStats(prev => ({
                    ...prev,
                    pending: prev.pending - 1,
                    not_applicable: prev.not_applicable + 1,
                }));
            }
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('[markNAStreaming] Stream ended');
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event: MatterUpdateEvent = JSON.parse(line.slice(6));
                        console.log('[markNAStreaming] Event:', event.type);
                        onUpdate(event);

                        // On complete, update local state ONLY if all Clio updates succeeded
                        if (event.type === 'complete' && event.success) {
                            const clioUpdates = event.clio_updates;
                            const allSucceeded = clioUpdates && clioUpdates.failed === 0;
                            
                            if (allSucceeded) {
                                setClients(prev => prev.map(c => 
                                    c.client_id === clientId 
                                        ? { ...c, status: 'not_applicable' as const, na_reason: reason, na_notes: notes }
                                        : c
                                ));
                                setStats(prev => ({
                                    ...prev,
                                    pending: prev.pending - 1,
                                    not_applicable: prev.not_applicable + 1,
                                }));
                            }
                        }
                    } catch (parseErr) {
                        console.warn('[markNAStreaming] Parse error:', parseErr);
                    }
                }
            }
        }
    }, [year, userFullName]);

    const undo = useCallback(async (clientId: string, matters: { matter_id: string; display_number: string }[]) => {
        // Find current status before undo
        const client = clients.find(c => c.client_id === clientId);
        const wasStatus = client?.status;
        
        try {
            const response = await fetch(`/api/rate-changes/${year}/undo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    client_id: clientId,
                    matters: matters.map(m => ({ matter_id: m.matter_id, display_number: m.display_number }))
                }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to undo');
            }
            
            // Optimistic update
            setClients(prev => prev.map(c => 
                c.client_id === clientId 
                    ? { ...c, status: 'pending' as const, sent_date: undefined, sent_by: undefined, na_reason: undefined, na_notes: undefined }
                    : c
            ));
            setStats(prev => ({
                ...prev,
                pending: prev.pending + 1,
                sent: wasStatus === 'sent' ? prev.sent - 1 : prev.sent,
                not_applicable: wasStatus === 'not_applicable' ? prev.not_applicable - 1 : prev.not_applicable,
            }));
        } catch (err) {
            console.error('[useRateChangeData] Undo error:', err);
            throw err;
        }
    }, [year, clients]);

    /** Streaming undo - clears Clio fields with real-time progress */
    const undoStreaming = useCallback(async (
        clientId: string, 
        matters: { matter_id: string; display_number: string }[],
        onUpdate: MatterUpdateCallback
    ) => {
        const client = clients.find(c => c.client_id === clientId);
        const wasStatus = client?.status;
        
        const response = await fetch(`/api/rate-changes/${year}/undo-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                client_id: clientId,
                matters: matters.map(m => ({ matter_id: m.matter_id, display_number: m.display_number }))
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to start undo stream');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6)) as MatterUpdateEvent;
                            onUpdate(event);

                            // On complete with success, update local state
                            if (event.type === 'complete' && event.clio_updates?.failed === 0) {
                                setClients(prev => prev.map(c => 
                                    c.client_id === clientId 
                                        ? { ...c, status: 'pending' as const, sent_date: undefined, sent_by: undefined, na_reason: undefined, na_notes: undefined }
                                        : c
                                ));
                                setStats(prev => ({
                                    ...prev,
                                    pending: prev.pending + 1,
                                    sent: wasStatus === 'sent' ? prev.sent - 1 : prev.sent,
                                    not_applicable: wasStatus === 'not_applicable' ? prev.not_applicable - 1 : prev.not_applicable,
                                }));
                            }
                        } catch (parseErr) {
                            console.warn('[undoStreaming] Parse error:', parseErr);
                        }
                    }
                }
            }
        }
    }, [year, clients]);

    // Calculate pending count for current user's clients
    // Uses last name matching to handle variations like Sam vs Samuel Packwood
    const pendingCountForUser = (() => {
        if (!userFullName) return 0;
        const nameParts = userFullName.toLowerCase().split(/\s+/);
        const lastName = nameParts[nameParts.length - 1];
        return clients.filter(c => 
            c.status === 'pending' && 
            c.responsible_solicitors.some(s => {
                const solicitor = s.toLowerCase();
                // Match by last name or all parts
                return (lastName && solicitor.includes(lastName)) || 
                       nameParts.every(part => solicitor.includes(part));
            })
        ).length;
    })();

    return {
        clients,
        stats,
        isLoading,
        error,
        refetch: fetchData,
        markSent,
        markNA,
        markSentStreaming,
        markNAStreaming,
        undo,
        undoStreaming,
        pendingCountForUser,
    };
}
