import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

/* ───────────────────────────────────────────────────────────────────────
 *  Legacy Migration Tool  v2
 *  ──────────────────────────────────────────────────────────────────────
 *  Single search → discover → auto-populate → confirm → execute → done.
 *  Designed for matters opened the old way (Clio direct, no pipeline).
 *  Minimal clicks. Toast at every step. Smart search.
 * ────────────────────────────────────────────────────────────────────── */

interface LegacyMigrationToolProps {
    isOpen: boolean;
    onClose: () => void;
    onToast?: (message: string, type: 'success' | 'info' | 'warning') => void;
}

type Phase = 'search' | 'discovering' | 'review' | 'confirm' | 'migrating' | 'complete';

interface SystemRecord {
    found: boolean;
    count: number;
    data?: any[];
}

interface DiscoveryResult {
    query: string;
    searchType: string;
    systems: {
        'Core Data': { matters: SystemRecord; poid: SystemRecord; enquiries: SystemRecord };
        'Instructions DB': { newSpaceEnquiries: SystemRecord; Instructions: SystemRecord; Deals: SystemRecord; Matters: SystemRecord; IdVerifications: SystemRecord };
    };
    prefill: Prefill;
}

interface Prefill {
    firstName: string; lastName: string; email: string; phone: string;
    prefix: string; dob: string; isCompany: boolean;
    companyName: string; companyNumber: string;
    address: { house: string; street: string; city: string; county: string; postCode: string; country: string };
    displayNumber: string; description: string; practiceArea: string; areaOfWork: string;
    responsibleSolicitor: string; feeEarnerInitials: string; originatingSolicitor: string;
    clioClientId: string; clioMatterId: string; openDate: string; value: string; source: string;
    poidId: string; acid: string; idCheckResult: string; idCheckId: string;
    nationality: string; passportNumber: string; driversLicenseNumber: string; idDocsFolder: string;
    enquiryId: string; poc: string;
}

interface MigrationResult {
    success: boolean;
    instructionRef: string;
    prospectId: number;
    passcode: number;
    dealId: string;
    created: Array<{ type: string; id: string; existing?: boolean }>;
    errors: Array<{ type: string; error: string }>;
}

const EMPTY_PREFILL: Prefill = {
    firstName: '', lastName: '', email: '', phone: '', prefix: '', dob: '',
    isCompany: false, companyName: '', companyNumber: '',
    address: { house: '', street: '', city: '', county: '', postCode: '', country: 'United Kingdom' },
    displayNumber: '', description: '', practiceArea: '', areaOfWork: 'commercial',
    responsibleSolicitor: '', feeEarnerInitials: '', originatingSolicitor: '',
    clioClientId: '', clioMatterId: '', openDate: '', value: '', source: '',
    poidId: '', acid: '', idCheckResult: '', idCheckId: '',
    nationality: '', passportNumber: '', driversLicenseNumber: '', idDocsFolder: '',
    enquiryId: '', poc: '',
};

// ── System rows for the discovery grid ──
const SYSTEM_ROWS = [
    { key: 'coreMatters',     system: 'Core Data',       table: 'matters',          label: 'Matters',           icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
    { key: 'poid',            system: 'Core Data',       table: 'poid',             label: 'POID / EID',        icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { key: 'enquiries',       system: 'Core Data',       table: 'enquiries',            label: 'Enquiry (Legacy)',  icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { key: 'newSpaceEnquiries',system: 'Instructions DB', table: 'newSpaceEnquiries',    label: 'Enquiry (New)',     icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { key: 'Instructions',    system: 'Instructions DB', table: 'Instructions',     label: 'Instruction',       icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2' },
    { key: 'Deals',           system: 'Instructions DB', table: 'Deals',            label: 'Deal',              icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { key: 'instrMatters',    system: 'Instructions DB', table: 'Matters',          label: 'Pipeline Matters',  icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
    { key: 'IdVerifications', system: 'Instructions DB', table: 'IdVerifications',  label: 'ID Verification',   icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
] as const;

function getRecordForRow(row: typeof SYSTEM_ROWS[number], discovery: DiscoveryResult | null): SystemRecord {
    if (!discovery) return { found: false, count: 0 };
    const sys = discovery.systems;
    if (row.system === 'Core Data') {
        return (sys['Core Data'] as any)[row.table] || { found: false, count: 0 };
    }
    return (sys['Instructions DB'] as any)[row.table] || { found: false, count: 0 };
}

const LegacyMigrationTool: React.FC<LegacyMigrationToolProps> = ({ isOpen, onClose, onToast }) => {
    const { isDarkMode } = useTheme();
    const [phase, setPhase] = useState<Phase>('search');
    const [query, setQuery] = useState('');
    const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
    const [prefill, setPrefill] = useState<Prefill>({ ...EMPTY_PREFILL });
    const [intake, setIntake] = useState({ serviceDescription: '', dealAmount: '0', checkoutMode: 'CFA', feeEarnerInitials: '', areaOfWork: 'commercial' });
    const [modules, setModules] = useState<Record<string, boolean>>({});
    const [moduleData, setModuleData] = useState<Record<string, Record<string, string>>>({});
    const [result, setResult] = useState<MigrationResult | null>(null);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const toast = useCallback((msg: string, type: 'success' | 'info' | 'warning') => {
        onToast?.(msg, type);
    }, [onToast]);

    // Auto-focus input
    useEffect(() => { if (isOpen && phase === 'search') inputRef.current?.focus(); }, [isOpen, phase]);

    // Escape key to close
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    // ── Module field definitions (what each pipeline record needs) ──
    type ModuleDef = { key: string; label: string; fields: Array<{ name: string; label: string; required?: boolean; type?: 'select'; options?: string[] }> };
    const MODULE_DEFS: ModuleDef[] = [
        { key: 'enquiry', label: 'Enquiry', fields: [
            { name: 'firstName', label: 'First Name', required: true },
            { name: 'lastName', label: 'Last Name', required: true },
            { name: 'email', label: 'Email', required: true },
            { name: 'phone', label: 'Phone' },
            { name: 'company', label: 'Company' },
            { name: 'areaOfWork', label: 'Area of Work', required: true, type: 'select', options: ['commercial', 'construction', 'property', 'employment'] },
            { name: 'poc', label: 'Point of Contact' },
            { name: 'source', label: 'Source' },
        ]},
        { key: 'deal', label: 'Deal', fields: [
            { name: 'serviceDescription', label: 'Service Description', required: true },
            { name: 'amount', label: 'Amount (£)', required: true },
            { name: 'areaOfWork', label: 'Area of Work', required: true, type: 'select', options: ['commercial', 'construction', 'property', 'employment'] },
            { name: 'feeEarner', label: 'Fee Earner (Initials)', required: true },
            { name: 'checkoutMode', label: 'Checkout Mode', required: true, type: 'select', options: ['CFA', 'STANDARD', 'ID_ONLY'] },
        ]},
        { key: 'instruction', label: 'Instruction', fields: [
            { name: 'firstName', label: 'First Name', required: true },
            { name: 'lastName', label: 'Last Name', required: true },
            { name: 'email', label: 'Email', required: true },
            { name: 'phone', label: 'Phone' },
            { name: 'title', label: 'Title (Mr/Mrs)' },
            { name: 'dob', label: 'Date of Birth' },
            { name: 'nationality', label: 'Nationality' },
            { name: 'clientType', label: 'Client Type', required: true, type: 'select', options: ['individual', 'company'] },
            { name: 'companyName', label: 'Company Name' },
            { name: 'companyNumber', label: 'Company Number' },
            { name: 'helixContact', label: 'Helix Contact (Initials)', required: true },
            { name: 'houseNumber', label: 'House Number' },
            { name: 'street', label: 'Street' },
            { name: 'city', label: 'City' },
            { name: 'postcode', label: 'Postcode' },
            { name: 'country', label: 'Country' },
        ]},
        { key: 'matters', label: 'Matters', fields: [
            { name: 'displayNumber', label: 'Display Number', required: true },
            { name: 'clioMatterId', label: 'Clio Matter ID', required: true },
            { name: 'clioClientId', label: 'Clio Client ID', required: true },
            { name: 'clientName', label: 'Client Name', required: true },
            { name: 'clientType', label: 'Client Type', type: 'select', options: ['individual', 'company'] },
            { name: 'description', label: 'Description' },
            { name: 'practiceArea', label: 'Practice Area' },
            { name: 'responsibleSolicitor', label: 'Responsible Solicitor' },
            { name: 'originatingSolicitor', label: 'Originating Solicitor' },
            { name: 'supervisingPartner', label: 'Supervising Partner' },
            { name: 'openDate', label: 'Open Date' },
        ]},
        { key: 'idVerification', label: 'ID Verification', fields: [
            { name: 'email', label: 'Client Email', required: true },
            { name: 'eidCheckId', label: 'EID Check ID' },
            { name: 'eidOverallResult', label: 'EID Result', type: 'select', options: ['Passed', 'Pending', 'Failed'] },
            { name: 'eidProvider', label: 'EID Provider' },
        ]},
    ];

    // Build module defaults from prefill
    const initModuleData = useCallback((p: Prefill) => {
        return {
            enquiry: {
                firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone,
                company: p.companyName, areaOfWork: p.areaOfWork, poc: p.poc, source: p.source || 'legacy migration',
            },
            deal: {
                serviceDescription: p.description, amount: p.value || '0',
                areaOfWork: p.areaOfWork, feeEarner: p.feeEarnerInitials, checkoutMode: 'CFA',
            },
            instruction: {
                firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone,
                title: p.prefix, dob: p.dob, nationality: p.nationality,
                clientType: p.isCompany ? 'company' : 'individual',
                companyName: p.companyName, companyNumber: p.companyNumber,
                helixContact: p.feeEarnerInitials,
                houseNumber: p.address?.house || '', street: p.address?.street || '',
                city: p.address?.city || '', postcode: p.address?.postCode || '',
                country: p.address?.country || 'United Kingdom',
            },
            matters: {
                displayNumber: p.displayNumber, clioMatterId: p.clioMatterId, clioClientId: p.clioClientId,
                clientName: p.isCompany ? p.companyName : `${p.firstName} ${p.lastName}`.trim(),
                clientType: p.isCompany ? 'company' : 'individual',
                description: p.description, practiceArea: p.practiceArea,
                responsibleSolicitor: p.responsibleSolicitor,
                originatingSolicitor: p.originatingSolicitor || '',
                supervisingPartner: '', openDate: p.openDate,
            },
            idVerification: {
                email: p.email, eidCheckId: p.idCheckId, eidOverallResult: p.idCheckResult || 'Pending',
                eidProvider: 'Tiller',
            },
        };
    }, []);

    // Helper: update a single field in a module
    const setModuleField = useCallback((mod: string, field: string, value: string) => {
        setModuleData(prev => ({ ...prev, [mod]: { ...prev[mod], [field]: value } }));
    }, []);

    // Check if module is already found in discovery (and thus skipped by default)
    const isModuleFound = useCallback((key: string): boolean => {
        if (!discovery) return false;
        const i = discovery.systems['Instructions DB'];
        const c = discovery.systems['Core Data'];
        switch (key) {
            case 'enquiry': return !!(c.enquiries?.found || i.newSpaceEnquiries?.found);
            case 'deal': return !!i.Deals?.found;
            case 'instruction': return !!i.Instructions?.found;
            case 'matters': return !!i.Matters?.found;
            case 'idVerification': return !!i.IdVerifications?.found;
            default: return false;
        }
    }, [discovery]);

    // ── Theme tokens ──
    const bg = isDarkMode ? colours.websiteBlue : '#ffffff';
    const bgCard = isDarkMode ? colours.darkBlue : colours.grey;
    const border = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const borderStrong = isDarkMode ? colours.dark.borderColor : colours.subtleGrey;
    const text = isDarkMode ? colours.dark.text : colours.light.text;
    const textSub = isDarkMode ? colours.dark.subText : colours.greyText;
    const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
    const accent = isDarkMode ? colours.accent : colours.highlight;

    // ── Shared styles ──
    const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'block' };
    const inputFieldStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', background: isDarkMode ? colours.darkBlue : '#fff', color: text, border: `1px solid ${border}`, borderRadius: 0, fontSize: 12, fontWeight: 500, outline: 'none', transition: 'border-color 0.15s ease', boxSizing: 'border-box' as const };
    const btnPrimary: React.CSSProperties = { padding: '8px 14px', background: colours.blue, color: '#fff', border: 'none', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s' };
    const btnGhost: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: textSub, border: `1px solid ${border}` };
    const chipStyle = (active: boolean): React.CSSProperties => ({
        padding: '4px 10px', background: active ? `${colours.blue}18` : 'transparent',
        border: `1px solid ${active ? colours.blue : border}`, borderRadius: 0,
        fontSize: 10, fontWeight: 600, color: active ? colours.blue : textMuted, cursor: 'pointer', transition: 'all 0.12s',
    });

    // ── Discover ──
    const handleDiscover = useCallback(async () => {
        if (!query.trim()) return;
        setPhase('discovering');
        setError('');
        toast(`Searching legacy systems for "${query.trim()}"…`, 'info');
        try {
            const res = await fetch('/api/migration/discover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query.trim() }),
            });
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const data: DiscoveryResult = await res.json();
            setDiscovery(data);
            setPrefill(data.prefill || { ...EMPTY_PREFILL });
            // Init module data from prefill
            const md = initModuleData(data.prefill || EMPTY_PREFILL);
            setModuleData(md);
            // Auto-populate intake from prefill
            setIntake(prev => ({
                ...prev,
                serviceDescription: data.prefill?.description || prev.serviceDescription,
                feeEarnerInitials: data.prefill?.feeEarnerInitials || prev.feeEarnerInitials,
                areaOfWork: data.prefill?.areaOfWork || prev.areaOfWork,
            }));
            // Auto-enable modules for missing records
            const i = data.systems['Instructions DB'];
            const c = data.systems['Core Data'];
            setModules({
                enquiry: !(c.enquiries?.found || i.newSpaceEnquiries?.found),
                deal: !i.Deals?.found,
                instruction: !i.Instructions?.found,
                matters: !i.Matters?.found,
                idVerification: !i.IdVerifications?.found && !!data.prefill?.poidId,
            });
            setPhase('review');

            const coreFound = [data.systems?.['Core Data']?.matters, data.systems?.['Core Data']?.poid, data.systems?.['Core Data']?.enquiries].filter(s => s?.found).length;
            const instrFound = [data.systems?.['Instructions DB']?.Instructions, data.systems?.['Instructions DB']?.Deals, data.systems?.['Instructions DB']?.Matters, data.systems?.['Instructions DB']?.IdVerifications, data.systems?.['Instructions DB']?.newSpaceEnquiries].filter(s => s?.found).length;

            if (instrFound >= 3) {
                toast('Already migrated — pipeline chain exists', 'success');
            } else if (coreFound > 0) {
                toast(`Found ${coreFound} legacy record${coreFound > 1 ? 's' : ''}. ${4 - instrFound} pipeline records missing.`, 'info');
            } else {
                toast('No records found in any system', 'warning');
            }
        } catch (err: any) {
            setError(err.message);
            setPhase('search');
            toast(`Discovery failed: ${err.message}`, 'warning');
        }
    }, [query, toast]);

    // ── Execute migration ──
    const handleExecute = useCallback(async () => {
        setPhase('migrating');
        toast('Executing migration — creating pipeline records…', 'info');
        try {
            const res = await fetch('/api/migration/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prefill,
                    intake,
                    modules,
                    moduleData,
                    discovered: discovery ? {
                        enquiries: discovery.systems['Core Data'].enquiries,
                        newSpaceEnquiries: discovery.systems['Instructions DB'].newSpaceEnquiries,
                        instructions: discovery.systems['Instructions DB'].Instructions,
                        deals: discovery.systems['Instructions DB'].Deals,
                        matters: discovery.systems['Instructions DB'].Matters,
                        idVerifications: discovery.systems['Instructions DB'].IdVerifications,
                        coreMatters: discovery.systems['Core Data'].matters,
                    } : {},
                }),
            });
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const data: MigrationResult = await res.json();
            setResult(data);
            setPhase('complete');
            if (data.success) {
                toast(`Migration complete — ${data.instructionRef} (${data.created.length} records)`, 'success');
            } else {
                toast(`Partial migration — ${data.created.length} created, ${data.errors.length} failed`, 'warning');
            }
        } catch (err: any) {
            setError(err.message);
            setPhase('review');
            toast(`Migration failed: ${err.message}`, 'warning');
        }
    }, [prefill, intake, discovery, toast]);

    // ── Reset ──
    const handleReset = useCallback(() => {
        setPhase('search');
        setQuery('');
        setDiscovery(null);
        setPrefill({ ...EMPTY_PREFILL });
        setIntake({ serviceDescription: '', dealAmount: '0', checkoutMode: 'CFA', feeEarnerInitials: '', areaOfWork: 'commercial' });
        setModules({});
        setModuleData({});
        setResult(null);
        setError('');
    }, []);

    if (!isOpen) return null;

    // ── Derived state ──
    const alreadyMigrated = discovery
        ? [discovery.systems?.['Instructions DB']?.Instructions, discovery.systems?.['Instructions DB']?.Deals, discovery.systems?.['Instructions DB']?.Matters].filter(s => s?.found).length >= 3
        : false;
    const hasPoid = discovery?.systems?.['Core Data']?.poid?.found;
    const hasMatters = discovery?.systems?.['Core Data']?.matters?.found;

    // ── Helpers ──
    const StatusDot: React.FC<{ found: boolean; searching?: boolean }> = ({ found, searching }) => (
        <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: searching ? colours.blue : found ? colours.green : colours.orange,
            boxShadow: searching ? `0 0 6px ${colours.blue}80` : 'none',
        }}/>
    );

    const SectionLabel: React.FC<{ children: React.ReactNode; colour?: string }> = ({ children, colour }) => (
        <div style={{ fontSize: 10, fontWeight: 600, color: colour || textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            {children}
        </div>
    );

    return (
        <>
            {/* Backdrop */}
            <div
                style={{
                    position: 'fixed', inset: 0,
                    background: isDarkMode ? 'rgba(0, 3, 25, 0.85)' : 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(8px)', zIndex: 2100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={onClose}
            >
                {/* Modal */}
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: '92vw', maxWidth: 600, maxHeight: '85vh',
                        background: bg, border: `1px solid ${border}`, borderRadius: 0,
                        boxShadow: isDarkMode
                            ? '0 24px 48px rgba(0, 3, 25, 0.6), 0 0 0 1px rgba(54, 144, 206, 0.08)'
                            : '0 24px 48px rgba(0, 0, 0, 0.12)',
                        overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px', borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : border}`,
                        background: isDarkMode ? colours.websiteBlue : colours.grey,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 26, height: 26, background: `${colours.blue}18`, border: `1px solid ${colours.blue}30`, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={colours.blue} strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: text, letterSpacing: '-0.2px' }}>Pipeline Migration</div>
                                <div style={{ fontSize: 9, fontWeight: 500, color: textMuted, marginTop: 1 }}>
                                    {phase === 'search' && 'Enter a display number, email, or name'}
                                    {phase === 'discovering' && 'Searching legacy systems…'}
                                    {phase === 'review' && (prefill.displayNumber || query)}
                                    {phase === 'confirm' && 'Review before executing'}
                                    {phase === 'migrating' && 'Creating pipeline records…'}
                                    {phase === 'complete' && 'Migration complete'}
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.10)' : border}`, borderRadius: 0, color: textMuted, cursor: 'pointer', padding: '4px 5px', display: 'flex' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = text; (e.currentTarget as HTMLElement).style.borderColor = borderStrong; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = textMuted; (e.currentTarget as HTMLElement).style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.10)' : border; }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

                        {/* ── PHASE: Search ── */}
                        {(phase === 'search' || phase === 'discovering') && (
                            <div>
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <input
                                        ref={inputRef}
                                        type="text" value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleDiscover(); }}
                                        placeholder="CLAIR11073-00001 or claire.doeshairltd@gmail.com"
                                        disabled={phase === 'discovering'}
                                        style={{ ...inputFieldStyle, flex: 1 }}
                                    />
                                    <button
                                        onClick={handleDiscover}
                                        disabled={phase === 'discovering' || !query.trim()}
                                        style={{ ...btnPrimary, opacity: (!query.trim() || phase === 'discovering') ? 0.5 : 1, cursor: (!query.trim() || phase === 'discovering') ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                    >
                                        {phase === 'discovering' ? (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/></svg>
                                        ) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                        )}
                                        {phase === 'discovering' ? 'Searching…' : 'Discover'}
                                    </button>
                                </div>
                                {error && <div style={{ fontSize: 10, color: colours.cta, padding: '6px 10px', background: `${colours.cta}10`, border: `1px solid ${colours.cta}25`, marginBottom: 8 }}>{error}</div>}
                                <div style={{ padding: '8px 10px', background: `${colours.blue}08`, border: `1px solid ${colours.blue}12`, fontSize: 10, color: textMuted, lineHeight: 1.6 }}>
                                    Searches Core Data (matters, POID, enquiries) and Instructions DB. Auto-detects display number vs email vs name. Use this for matters opened directly in Clio without the pipeline.
                                </div>
                            </div>
                        )}

                        {/* ── PHASE: Review ── */}
                        {phase === 'review' && discovery && (
                            <div>
                                {/* Discovery Grid */}
                                <SectionLabel colour={accent}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                                    Discovery Results
                                </SectionLabel>
                                <div style={{ display: 'grid', gap: 3, marginBottom: 14 }}>
                                    {SYSTEM_ROWS.map(row => {
                                        const rec = getRecordForRow(row, discovery);
                                        return (
                                            <div key={row.key} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                background: bgCard, border: `1px solid ${border}`, borderRadius: 0,
                                                transition: 'all 0.12s',
                                            }}
                                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = borderStrong; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = border; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                                            >
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0 }}><path d={row.icon}/></svg>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 500, color: text }}>{row.label}</div>
                                                    <div style={{ fontSize: 9, color: textMuted }}>{row.system}</div>
                                                </div>
                                                <StatusDot found={rec.found}/>
                                                <span style={{ fontSize: 9, fontWeight: 600, color: rec.found ? colours.green : colours.orange, letterSpacing: '0.2px', minWidth: 45, textAlign: 'right' }}>
                                                    {rec.found ? (rec.count > 1 ? `${rec.count} found` : 'Found') : 'Missing'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Status banner */}
                                {alreadyMigrated ? (
                                    <div style={{ padding: '10px 12px', background: `${colours.green}12`, border: `1px solid ${colours.green}30`, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, color: colours.green }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                        Already in the pipeline — no migration needed.
                                    </div>
                                ) : (hasMatters || hasPoid) ? (
                                    <>
                                        {/* ── MODULE TOGGLES ── */}
                                        <SectionLabel>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                            Pipeline Modules
                                        </SectionLabel>
                                        <div style={{ fontSize: 9, color: textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                                            Toggle each record to create. Expand to review and fill required fields. Pre-populated from discovery.
                                        </div>

                                        <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                                            {MODULE_DEFS.map(mod => {
                                                const found = isModuleFound(mod.key);
                                                const enabled = !!modules[mod.key];
                                                const data = moduleData[mod.key] || {};
                                                const missingRequired = mod.fields.filter(f => f.required && !data[f.name]?.trim());
                                                const isValid = missingRequired.length === 0;

                                                return (
                                                    <div key={mod.key} style={{
                                                        border: `1px solid ${found ? `${colours.green}30` : enabled ? `${colours.blue}40` : border}`,
                                                        background: found ? `${colours.green}04` : bgCard,
                                                        transition: 'all 0.15s',
                                                    }}>
                                                        {/* Module header — toggleable */}
                                                        <div
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                                                cursor: found ? 'default' : 'pointer', userSelect: 'none',
                                                            }}
                                                            onClick={() => {
                                                                if (found) return;
                                                                setModules(prev => ({ ...prev, [mod.key]: !prev[mod.key] }));
                                                            }}
                                                        >
                                                            {/* Toggle indicator */}
                                                            <span style={{
                                                                width: 14, height: 14, borderRadius: 0, flexShrink: 0,
                                                                border: `1.5px solid ${found ? colours.green : enabled ? colours.blue : borderStrong}`,
                                                                background: found ? `${colours.green}20` : enabled ? `${colours.blue}18` : 'transparent',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            }}>
                                                                {(found || enabled) && (
                                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={found ? colours.green : colours.blue} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                                )}
                                                            </span>
                                                            <span style={{ fontSize: 11, fontWeight: 600, color: text, flex: 1 }}>{mod.label}</span>
                                                            {found ? (
                                                                <span style={{ fontSize: 9, fontWeight: 600, color: colours.green }}>Exists — skip</span>
                                                            ) : enabled ? (
                                                                <span style={{ fontSize: 9, fontWeight: 600, color: isValid ? colours.blue : colours.orange }}>
                                                                    {isValid ? 'Ready' : `${missingRequired.length} required`}
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: 9, color: textMuted }}>Off</span>
                                                            )}
                                                            {!found && (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" style={{ transition: 'transform 0.15s', transform: enabled ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                                                            )}
                                                        </div>

                                                        {/* Module fields — expanded when enabled */}
                                                        {enabled && !found && (
                                                            <div style={{ padding: '0 10px 10px', display: 'grid', gap: 6 }}>
                                                                {mod.fields.map(field => (
                                                                    <div key={field.name}>
                                                                        <span style={{
                                                                            ...labelStyle,
                                                                            color: field.required && !data[field.name]?.trim() ? colours.orange : textMuted,
                                                                        }}>
                                                                            {field.label}{field.required ? ' *' : ''}
                                                                        </span>
                                                                        {field.type === 'select' ? (
                                                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                                                {field.options?.map(opt => (
                                                                                    <button key={opt}
                                                                                        onClick={() => setModuleField(mod.key, field.name, opt)}
                                                                                        style={chipStyle(data[field.name] === opt)}
                                                                                    >
                                                                                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <input
                                                                                type="text"
                                                                                value={data[field.name] || ''}
                                                                                onChange={e => setModuleField(mod.key, field.name, e.target.value)}
                                                                                style={{
                                                                                    ...inputFieldStyle,
                                                                                    borderColor: field.required && !data[field.name]?.trim() ? colours.orange : border,
                                                                                }}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Summary strip */}
                                        {(() => {
                                            const enabledModules = MODULE_DEFS.filter(m => modules[m.key] && !isModuleFound(m.key));
                                            const allValid = enabledModules.every(m => m.fields.filter(f => f.required).every(f => (moduleData[m.key]?.[f.name] || '').trim()));
                                            return (
                                                <div style={{ padding: '8px 10px', background: `${allValid ? colours.blue : colours.orange}10`, border: `1px solid ${allValid ? colours.blue : colours.orange}25`, marginBottom: 14, fontSize: 10, color: textMuted, lineHeight: 1.6 }}>
                                                    <strong style={{ color: allValid ? colours.blue : colours.orange }}>{enabledModules.length} module{enabledModules.length !== 1 ? 's' : ''} enabled</strong>
                                                    {!allValid && ' — fill all required fields (*) to continue'}
                                                    {allValid && enabledModules.length > 0 && ' — ready to migrate'}
                                                    {enabledModules.length === 0 && ' — enable at least one module'}
                                                </div>
                                            );
                                        })()}
                                    </>
                                ) : (
                                    <div style={{ padding: '10px 12px', background: `${colours.cta}10`, border: `1px solid ${colours.cta}25`, marginBottom: 14, fontSize: 11, color: colours.cta, fontWeight: 600 }}>
                                        No legacy data found. Nothing to migrate.
                                    </div>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={handleReset} style={btnGhost}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                                        Start Over
                                    </button>
                                    {!alreadyMigrated && (hasMatters || hasPoid) && (() => {
                                        const enabledModules = MODULE_DEFS.filter(m => modules[m.key] && !isModuleFound(m.key));
                                        const allValid = enabledModules.length > 0 && enabledModules.every(m => m.fields.filter(f => f.required).every(f => (moduleData[m.key]?.[f.name] || '').trim()));
                                        return (
                                            <button
                                                onClick={() => { setPhase('confirm'); toast('Review the migration plan', 'info'); }}
                                                disabled={!allValid}
                                                style={{ ...btnPrimary, opacity: allValid ? 1 : 0.5, cursor: allValid ? 'pointer' : 'not-allowed' }}
                                            >
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                                Confirm Migration
                                            </button>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* ── PHASE: Confirm ── */}
                        {phase === 'confirm' && (
                            <div>
                                <SectionLabel colour={accent}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                    Migration Plan
                                </SectionLabel>

                                <div style={{ padding: '12px 14px', background: bgCard, border: `1px solid ${borderStrong}`, marginBottom: 14 }}>
                                    <div style={{ display: 'grid', gap: 4 }}>
                                        {MODULE_DEFS.map(mod => {
                                            const found = isModuleFound(mod.key);
                                            const enabled = !!modules[mod.key];
                                            const data = moduleData[mod.key] || {};
                                            const skip = found || !enabled;

                                            return (
                                                <div key={mod.key} style={{
                                                    padding: '6px 8px',
                                                    background: skip ? 'transparent' : (isDarkMode ? colours.websiteBlue : '#fff'),
                                                    border: `1px solid ${skip ? 'transparent' : border}`,
                                                    opacity: skip ? 0.4 : 1,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: skip ? textMuted : colours.blue, flexShrink: 0 }}/>
                                                        <span style={{ fontSize: 10, fontWeight: 600, color: text, minWidth: 80 }}>{mod.label}</span>
                                                        <span style={{ fontSize: 10, color: textMuted, flex: 1, textAlign: 'right' }}>
                                                            {found ? 'Exists — skip' : !enabled ? 'Disabled' : 'Will create'}
                                                        </span>
                                                    </div>
                                                    {/* Show field summary for enabled modules */}
                                                    {!skip && (
                                                        <div style={{ marginTop: 4, paddingLeft: 13, display: 'grid', gap: 1 }}>
                                                            {mod.fields.filter(f => data[f.name]?.trim()).map(f => (
                                                                <div key={f.name} style={{ fontSize: 9, color: textMuted }}>
                                                                    <span style={{ fontWeight: 600 }}>{f.label}:</span> {data[f.name]}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ fontSize: 10, color: textMuted, lineHeight: 1.6, marginBottom: 14, padding: '6px 10px', background: `${colours.blue}06`, border: `1px solid ${colours.blue}10` }}>
                                    This will insert records into the Instructions database and Core Data. Additive only — no existing records will be modified or deleted.
                                </div>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setPhase('review')} style={btnGhost}>Back</button>
                                    <button onClick={handleExecute} style={{ ...btnPrimary, background: colours.cta, border: 'none' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                        Execute Migration
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── PHASE: Migrating ── */}
                        {phase === 'migrating' && (
                            <div style={{ textAlign: 'center', padding: '30px 0' }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: '50%', background: `${colours.blue}15`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colours.blue} strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>Creating pipeline records…</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>Enquiry → Deal → Instruction → Matters → ID Verification</div>
                            </div>
                        )}

                        {/* ── PHASE: Complete ── */}
                        {phase === 'complete' && result && (
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: '50%',
                                    background: result.success ? `${colours.green}15` : `${colours.orange}15`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={result.success ? colours.green : colours.orange} strokeWidth="2.5">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>
                                    {result.success ? 'Migration Complete' : 'Partial Migration'}
                                </div>

                                {/* Instruction ref badge */}
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                                    background: bgCard, border: `1px solid ${borderStrong}`,
                                    fontSize: 13, fontWeight: 700, color: colours.blue, letterSpacing: '-0.2px', marginBottom: 14,
                                }}>
                                    {result.instructionRef}
                                </div>

                                {/* Created records */}
                                <div style={{ display: 'grid', gap: 3, maxWidth: 320, margin: '0 auto 14px', textAlign: 'left' }}>
                                    {result.created.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: bgCard, border: `1px solid ${border}` }}>
                                            <StatusDot found={true}/>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: text, textTransform: 'capitalize' }}>{c.type}</span>
                                            <span style={{ fontSize: 9, color: textMuted, flex: 1, textAlign: 'right' }}>{c.existing ? 'existing' : c.id}</span>
                                        </div>
                                    ))}
                                    {result.errors.map((e, i) => (
                                        <div key={`err-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: `${colours.cta}08`, border: `1px solid ${colours.cta}20` }}>
                                            <StatusDot found={false}/>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: colours.cta, textTransform: 'capitalize' }}>{e.type}</span>
                                            <span style={{ fontSize: 9, color: colours.cta, flex: 1, textAlign: 'right' }}>{e.error}</span>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                    <button onClick={handleReset} style={btnGhost}>Migrate Another</button>
                                    <button onClick={onClose} style={btnPrimary}>Done</button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </>
    );
};

export default LegacyMigrationTool;
