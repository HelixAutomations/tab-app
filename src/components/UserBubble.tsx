import React, { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import jsPDF from 'jspdf';
import { RALEWAY_REGULAR_B64, RALEWAY_BOLD_B64, HELIX_LOGO_WHITE_B64 } from '../utils/pdfAssets';
import AdminDashboard from './AdminDashboard';
import DemoPromptsModal from './DemoPromptsModal';
import LoadingDebugModal from './debug/LoadingDebugModal';
import { ErrorTracker } from './ErrorTracker';
import { UserData } from '../app/functionality/types';
import '../app/styles/UserBubble.css';
import '../app/styles/personas.css';
import { isAdminUser, isPowerUser } from '../app/admin';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import RefreshDataModal from './RefreshDataModal';
import LegacyMigrationTool from './LegacyMigrationTool';
import lightAvatarMark from '../assets/dark blue mark.svg';
import darkAvatarMark from '../assets/markwhite.svg';
import hlrBlueMark from '../assets/HLRblue72.png';
import hlrWhiteMark from '../assets/HLRwhite72.png';

interface UserBubbleProps {
    user: UserData;
    isLocalDev?: boolean;
    onAreasChange?: (areas: string[]) => void;
    onUserChange?: (user: UserData) => void;
    availableUsers?: UserData[] | null;
    onReturnToAdmin?: () => void;
    originalAdminUser?: UserData | null;
    onRefreshEnquiries?: () => Promise<void> | void;
    onRefreshMatters?: () => Promise<void> | void;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    featureToggles?: Record<string, boolean>;
    onShowTestEnquiry?: () => void;
    demoModeEnabled?: boolean;
    onToggleDemoMode?: (enabled: boolean) => void;
    onOpenReleaseNotesModal?: () => void;
}

const AVAILABLE_AREAS = ['Commercial', 'Construction', 'Property', 'Employment', 'Misc/Other'];
type BubbleToastTone = 'info' | 'success' | 'warning';

const UserBubble: React.FC<UserBubbleProps> = ({
    user,
    isLocalDev = false,
    onAreasChange,
    onUserChange,
    availableUsers,
    onReturnToAdmin,
    originalAdminUser,
    onRefreshEnquiries,
    onRefreshMatters,
    onFeatureToggle,
    featureToggles = {},
    onShowTestEnquiry,
    demoModeEnabled = false,
    onToggleDemoMode,
    onOpenReleaseNotesModal,
}) => {
    const [open, setOpen] = useState(false);
    const [showDevDashboard, setShowDevDashboard] = useState(false);
    const [showRefreshModal, setShowRefreshModal] = useState(false);
    const [showDemoPrompts, setShowDemoPrompts] = useState(false);
    const [showEidReportConcept, setShowEidReportConcept] = useState(false);
    const [eidConceptPdfUrl, setEidConceptPdfUrl] = useState<string | null>(null);
    const [isEidConceptPdfLoading, setIsEidConceptPdfLoading] = useState(false);
    const [eidConceptPdfError, setEidConceptPdfError] = useState<string | null>(null);
    const [showLoadingDebug, setShowLoadingDebug] = useState(false);
    const [showErrorTracker, setShowErrorTracker] = useState(false);
    const [showMigrationTool, setShowMigrationTool] = useState(false);
    const [profileCollapsed, setProfileCollapsed] = useState(true);
    const [areaFiltersCollapsed, setAreaFiltersCollapsed] = useState(true);
    const [adminCollapsed, setAdminCollapsed] = useState(true);
    const [localCollapsed, setLocalCollapsed] = useState(true);
    const [paletteCollapsed, setPaletteCollapsed] = useState(true);
    const [toast, setToast] = useState<{ message: string; tone: BubbleToastTone } | null>(null);
    const [sessionElapsed, setSessionElapsed] = useState('');
    const bubbleRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionStartRef = useRef<number>(Date.now());
    const { isDarkMode, toggleTheme } = useTheme();
    const popoverId = useId();

    // Theme tokens â€“ derived strictly from colours.ts brand values
    // Dark depth: websiteBlue (#000319) â†’ darkBlue (#061733) â†’ sectionBg (#051525) â†’ helixBlue hover (#0D2F60)
    const bg = isDarkMode ? colours.websiteBlue : '#ffffff';
    const bgSecondary = isDarkMode ? colours.darkBlue : colours.grey;
    const bgTertiary = isDarkMode ? colours.dark.sectionBackground : colours.grey;
    const controlRowBg = isDarkMode ? colours.darkBlue : bgTertiary;
    const bgHover = isDarkMode ? colours.helixBlue : colours.light.cardHover;
    const borderLight = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const borderMedium = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
    const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
    const textSecondary = isDarkMode ? colours.dark.subText : colours.greyText;
    const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
    const accentPrimary = colours.blue;

    const helixSwatches = [
        { key: 'website-blue', label: 'Website Blue', color: colours.websiteBlue },
        { key: 'dark-blue', label: 'Dark Blue', color: colours.darkBlue },
        { key: 'helix-blue', label: 'Helix Blue', color: colours.helixBlue },
        { key: 'highlight', label: 'Highlight', color: colours.blue },
        { key: 'accent', label: 'Accent', color: colours.accent },
        { key: 'cta', label: 'CTA Red', color: colours.cta },
        { key: 'grey', label: 'Helix Grey', color: colours.grey },
    ];

    // Colour pairings — how colours work together (local dev only)
    const colourPairings = [
        { label: 'Dark surface', desc: 'Dark mode with white labels and accent-ready cues', bg: colours.websiteBlue, fg: '#ffffff', accent: colours.accent, tag: 'DARK' },
        { label: 'Light surface', desc: 'Light mode with highlight-blue navigation cues', bg: colours.grey, fg: colours.darkBlue, accent: colours.blue, tag: 'LIGHT' },
    ];
    const [activePairing, setActivePairing] = useState(0);
    const [activeIntent, setActiveIntent] = useState<'NAV' | 'ACTION' | 'POSITIVE'>('NAV');
    const [playgroundBase, setPlaygroundBase] = useState<'websiteBlue' | 'darkBlue' | 'helixBlue' | 'grey'>('darkBlue');
    const [playgroundLayer, setPlaygroundLayer] = useState<'darkBlue' | 'helixBlue' | 'blue' | 'highlightBlue' | 'grey'>('helixBlue');
    const [playgroundAccent, setPlaygroundAccent] = useState<'accent' | 'blue' | 'cta' | 'green' | 'orange' | 'yellow'>('accent');

    const playgroundBaseOptions = {
        websiteBlue: { label: 'Website Blue', color: colours.websiteBlue },
        darkBlue: { label: 'Dark Blue', color: colours.darkBlue },
        helixBlue: { label: 'Helix Blue', color: colours.helixBlue },
        grey: { label: 'Helix Grey', color: colours.grey },
    };

    const playgroundLayerOptions = {
        darkBlue: { label: 'Dark Blue', color: colours.darkBlue },
        helixBlue: { label: 'Helix Blue', color: colours.helixBlue },
        blue: { label: 'Highlight Blue', color: colours.blue },
        highlightBlue: { label: 'Light Highlight Blue', color: colours.highlightBlue },
        grey: { label: 'Helix Grey', color: colours.grey },
    };

    const playgroundAccentOptions = {
        accent: { label: 'Accent', color: colours.accent },
        blue: { label: 'Highlight', color: colours.blue },
        cta: { label: 'CTA', color: colours.cta },
        green: { label: 'Green', color: colours.green },
        orange: { label: 'Orange', color: colours.orange },
        yellow: { label: 'Yellow', color: colours.yellow },
    };

    const ctaPrimary = colours.cta;
    const success = colours.green;
    
    // Shadows â€“ Helix aligned
    const shadowSm = isDarkMode ? '0 1px 2px rgba(0, 3, 25, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.04)';
    const shadowMd = isDarkMode ? '0 4px 6px -1px rgba(0, 3, 25, 0.35)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';

    // Avatar treatment â€“ brand tokens
    const avatarBg = isDarkMode
        ? colours.darkBlue
        : colours.light.cardBackground;
    const avatarBorder = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
    const avatarBorderHover = isDarkMode ? colours.blue : colours.subtleGrey;
    const avatarShadow = isDarkMode ? '0 3px 12px rgba(0, 3, 25, 0.4)' : shadowSm;
    const avatarShadowHover = isDarkMode ? '0 4px 16px rgba(0, 3, 25, 0.5)' : shadowMd;
    const avatarIcon = isDarkMode ? darkAvatarMark : lightAvatarMark;

    const initials = user.Initials || `${user.First?.charAt(0) || ''}${user.Last?.charAt(0) || ''}`.toUpperCase();
    const isAdmin = isAdminUser(user);
    const isAdminEligible = isAdmin || isLocalDev;

    const adminBadge = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0, opacity: 0.7 }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
    );

    const localBadge = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0, opacity: 0.7 }}>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
    );

    const closePopover = useCallback((restoreFocus = true) => {
        setOpen(false);
        if (restoreFocus && (previouslyFocusedElement.current || bubbleRef.current)) {
            (previouslyFocusedElement.current || bubbleRef.current)?.focus();
        }
        previouslyFocusedElement.current = null;
    }, []);

    useEffect(() => {
        localStorage.setItem('__currentUserInitials', (user.Initials || '').toLowerCase());
    }, [user]);

    useEffect(() => {
        if (!open) return;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (!bubbleRef.current?.contains(e.target as Node) && !popoverRef.current?.contains(e.target as Node)) {
                closePopover();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open, closePopover]);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); closePopover(); }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [open, closePopover]);

    useEffect(() => {
        if (open) {
            setAreaFiltersCollapsed(true);
        }
    }, [open]);

    const showToast = useCallback((message: string, tone: BubbleToastTone = 'info') => {
        setToast({ message, tone });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
            setToast(null);
            toastTimerRef.current = null;
        }, 1800);
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    // Session elapsed timer — ticks every 30s while modal is open
    useEffect(() => {
        if (!open) return;
        const tick = () => {
            const diff = Math.floor((Date.now() - sessionStartRef.current) / 1000);
            if (diff < 60) setSessionElapsed(`${diff}s`);
            else if (diff < 3600) setSessionElapsed(`${Math.floor(diff / 60)}m`);
            else setSessionElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`);
        };
        tick();
        const id = setInterval(tick, 30_000);
        return () => clearInterval(id);
    }, [open]);

    // Environment detection
    const environment = useMemo(() => {
        if (isLocalDev) return 'Local';
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        if (host.includes('staging') || host.includes('uat')) return 'Staging';
        return 'Production';
    }, [isLocalDev]);

    const environmentColour = environment === 'Production'
        ? colours.green
        : environment === 'Staging'
            ? colours.orange
            : (isDarkMode ? colours.accent : colours.blue);

    const environmentBadgeBg = environment === 'Local' && isDarkMode
        ? 'rgba(135, 243, 243, 0.10)'
        : (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)');

    const environmentBadgeBorder = environment === 'Local' && isDarkMode
        ? 'rgba(135, 243, 243, 0.26)'
        : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.10)');

    const eidReportConceptSample = useMemo(() => ([
        {
            correlationId: '632aabdd-227d-4051-ab86-ea766efc7baa',
            externalReferenceId: '18207',
            checkStatuses: [
                {
                    checkTypeId: 1,
                    sourceResults: {
                        date: '2026-02-23T15:41:53.29',
                        rule: 'Address Verification Check',
                        result: { result: 'Passed' },
                        results: [
                            {
                                title: 'UK identity verification',
                                result: 'Passed',
                                detail: {
                                    reasons: [
                                        { key: 'Name, Address and DOB Match', result: 'Passed', reason: 'A check for the name and date of birth has been matched to the provided address', code: '6100' },
                                        { key: 'Name and Address Match', result: 'Review', reason: 'A check for the name has not been matched to the provided address', code: '7110' },
                                    ],
                                },
                            },
                        ],
                    },
                    resultCount: { totalSourcesChecked: 1, totalSourcesPassed: 1, totalSourcesFailed: 0, totalSourcesForReview: 0 },
                },
                {
                    checkTypeId: 2,
                    sourceResults: {
                        date: '2026-02-23T15:41:53.79',
                        rule: 'Pep & Sanctions Check',
                        result: { result: 'Passed' },
                        results: [
                            {
                                title: 'Pep Check',
                                result: 'Passed',
                                detail: {
                                    reasons: [
                                        { key: 'Personal Details', result: 'Passed', reason: 'Supplied personal details did not match', code: 'NA' },
                                    ],
                                },
                            },
                            {
                                title: 'Sanctions Check',
                                result: 'Passed',
                                detail: {
                                    reasons: [
                                        { key: 'Personal Details', result: 'Passed', reason: 'Supplied personal details did not match', code: 'NA' },
                                    ],
                                },
                            },
                            {
                                title: 'Adverse Media Check',
                                result: 'Passed',
                                detail: {
                                    reasons: [
                                        { key: 'Personal Details', result: 'Passed', reason: 'Supplied personal details did not match', code: 'NA' },
                                    ],
                                },
                            },
                        ],
                    },
                    resultCount: { totalSourcesChecked: 3, totalSourcesPassed: 3, totalSourcesFailed: 0, totalSourcesForReview: 0 },
                },
            ],
            overallResult: { result: 'Passed' },
        },
    ]), []);

    const eidConceptRecord = eidReportConceptSample[0];
    const eidConceptChecks = Array.isArray(eidConceptRecord?.checkStatuses) ? eidConceptRecord.checkStatuses : [];
    const eidConceptResultColour = (result: string) => {
        const value = String(result || '').toLowerCase();
        if (value.includes('pass') || value.includes('clear')) return colours.green;
        if (value.includes('review') || value.includes('refer') || value.includes('fail')) return colours.cta;
        return colours.blue;
    };

    const buildEidConceptPdfDataUri = useCallback(() => {
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageW = 595.28;
        const pageH = 841.89;
        const marginL = 40;
        const marginR = 40;
        const contentW = pageW - marginL - marginR;

        // ── Register Raleway fonts ──
        try {
            doc.addFileToVFS('Raleway-Regular.ttf', RALEWAY_REGULAR_B64);
            doc.addFont('Raleway-Regular.ttf', 'Raleway', 'normal');
            doc.addFileToVFS('Raleway-Bold.ttf', RALEWAY_BOLD_B64);
            doc.addFont('Raleway-Bold.ttf', 'Raleway', 'bold');
        } catch (e) {
            console.warn('Raleway font registration failed', e);
        }
        const ff = doc.getFontList()['Raleway'] ? 'Raleway' : 'helvetica';

        // ── Brand tokens ──
        const navy   = { r: 6,   g: 23,  b: 51  };
        const helix  = { r: 13,  g: 47,  b: 96  };
        const blue   = { r: 54,  g: 144, b: 206 };
        const green  = { r: 32,  g: 178, b: 108 };
        const red    = { r: 214, g: 85,  b: 65  };
        const grey   = { r: 107, g: 107, b: 107 };
        const lGrey  = { r: 244, g: 244, b: 246 };
        const ftrGrey = { r: 107, g: 114, b: 128 };

        const headerH = 72;
        const footerH = 36;
        const footerTop = pageH - footerH;

        const passFailCol = (v: string) => {
            const lc = (v || '').toLowerCase();
            if (lc.includes('pass') || lc.includes('verified') || lc.includes('clear')) return green;
            if (lc.includes('fail')) return red;
            if (lc.includes('review')) return blue;
            return grey;
        };

        let y = 0;

        // ── Header ──
        const drawHeader = () => {
            doc.setFillColor(navy.r, navy.g, navy.b);
            doc.rect(0, 0, pageW, headerH, 'F');
            const logoH = 26; const logoW = logoH * 4.55;
            const logoY = 12;
            try {
                if (HELIX_LOGO_WHITE_B64) {
                    doc.addImage('data:image/png;base64,' + HELIX_LOGO_WHITE_B64, 'PNG', marginL, logoY, logoW, logoH, undefined, 'FAST');
                }
            } catch { /* continue */ }
            doc.setFont(ff, 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(200, 215, 240);
            doc.text('Identity Verification Report', marginL, logoY + logoH + 14);
            // Instruction ref (right-aligned)
            doc.setFont(ff, 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(255, 255, 255);
            doc.text('HLX-27367-94842', pageW - marginR, headerH / 2 + 3, { align: 'right' });
        };

        // ── Footer ──
        const drawFooter = (page: number, total: number) => {
            const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            doc.setFillColor(250, 250, 250);
            doc.rect(0, footerTop, pageW, footerH, 'F');
            doc.setDrawColor(243, 244, 246);
            doc.setLineWidth(0.5);
            doc.line(0, footerTop, pageW, footerTop);
            doc.setFont(ff, 'normal');
            doc.setFontSize(6);
            doc.setTextColor(ftrGrey.r, ftrGrey.g, ftrGrey.b);
            doc.text('SRA Regulated  \u2022  SRA ID 565557  \u2022  Correlation-linked identity checks', marginL, footerTop + 14);
            doc.setFontSize(5);
            doc.text('\u00A9 Helix Law Limited.  helix-law.co.uk', marginL, footerTop + 24);
            doc.setFontSize(6);
            doc.text(`Page ${page} of ${total}  \u2022  ${genDate}`, pageW - marginR, footerTop + 14, { align: 'right' });
        };

        const ensureSpace = (need: number) => {
            if (y + need > footerTop - 12) { doc.addPage(); drawHeader(); y = headerH + 20; }
        };

        // ── Section band ──
        const drawSectionBand = (sectionTitle: string, result?: string) => {
            ensureSpace(28);
            doc.setFillColor(lGrey.r, lGrey.g, lGrey.b);
            doc.rect(marginL, y - 10, contentW, 20, 'F');
            doc.setFont(ff, 'bold');
            doc.setFontSize(9);
            doc.setTextColor(helix.r, helix.g, helix.b);
            doc.text(sectionTitle, marginL + 8, y + 3);
            if (result) {
                const rc = passFailCol(result);
                doc.setTextColor(rc.r, rc.g, rc.b);
                doc.text(result, pageW - marginR - 4, y + 3, { align: 'right' });
            }
            y += 20;
        };

        // ── Key-value row ──
        const kv = (label: string, value: string, opts?: { color?: typeof navy; bold?: boolean }) => {
            ensureSpace(14);
            doc.setFont(ff, 'normal');
            doc.setFontSize(8);
            doc.setTextColor(grey.r, grey.g, grey.b);
            doc.text(label, marginL + 8, y);
            const c = opts?.color || navy;
            doc.setFont(ff, opts?.bold ? 'bold' : 'normal');
            doc.setFontSize(8);
            doc.setTextColor(c.r, c.g, c.b);
            doc.text(String(value || '\u2014'), marginL + 130, y);
            y += 13;
        };

        // ── Build page 1 ──
        drawHeader();
        y = headerH + 24;

        // Summary heading
        doc.setFont(ff, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(helix.r, helix.g, helix.b);
        doc.text('Summary', marginL, y);
        y += 16;

        // Demo personal details
        kv('Name', 'Luke Test');
        kv('Date of Birth', '01 Jan 1990');
        kv('Document', 'Passport (123456789)');
        kv('Address', '123 Example Road, London, SW1A 1AA');
        kv('Checked', '23 Feb 2026');
        kv('Correlation ID', String(eidConceptRecord?.correlationId || '\u2014'));
        kv('External Ref', String(eidConceptRecord?.externalReferenceId || '\u2014'));

        y += 6;
        const overall = String(eidConceptRecord?.overallResult?.result || '\u2014');
        kv('Overall Result', overall, { color: passFailCol(overall), bold: true });
        y += 10;

        // ── Check sections ──
        const checkLabel: Record<number, string> = { 1: 'Address Verification', 2: 'PEP & Sanctions' };

        eidConceptChecks.forEach((cs: any) => {
            const name = checkLabel[cs?.checkTypeId] || cs?.sourceResults?.rule || 'Verification Check';
            const result = cs?.sourceResults?.result?.result || '\u2014';
            const checkDate = cs?.sourceResults?.date
                ? new Date(cs.sourceResults.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '';

            drawSectionBand(name, result);

            if (checkDate) kv('Date', checkDate);
            const rc = cs?.resultCount;
            if (rc) {
                kv('Sources Checked', String(rc.totalSourcesChecked ?? '\u2014'));
                kv('Sources Passed', String(rc.totalSourcesPassed ?? '\u2014'), { color: green });
                if ((rc.totalSourcesFailed ?? 0) > 0) kv('Sources Failed', String(rc.totalSourcesFailed), { color: red });
            }

            // Sub-results
            const results = cs?.sourceResults?.results || [];
            results.forEach((r: any) => {
                const rTitle = r?.title || 'Result';
                const rResult = r?.result || '\u2014';
                ensureSpace(16);
                y += 2;
                doc.setFont(ff, 'bold');
                doc.setFontSize(8);
                doc.setTextColor(navy.r, navy.g, navy.b);
                doc.text(`${rTitle} \u2014 ${rResult}`, marginL + 8, y);
                y += 12;

                const reasons = r?.detail?.reasons || [];
                reasons.forEach((reason: any) => {
                    ensureSpace(20);
                    doc.setFont(ff, 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(grey.r, grey.g, grey.b);
                    const line = `${reason?.key || 'Reason'}: ${reason?.reason || '\u2014'}${reason?.code && reason.code !== 'NA' ? ` (${reason.code})` : ''}`;
                    const wrapped = doc.splitTextToSize(line, contentW - 20);
                    wrapped.forEach((part: string) => {
                        ensureSpace(10);
                        doc.text(part, marginL + 14, y);
                        y += 9;
                    });
                });
                y += 4;
            });
            y += 6;
        });

        // ── Stamp footers ──
        const pageCount = doc.getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            drawFooter(p, pageCount);
        }

        return doc.output('datauristring');
    }, [eidConceptChecks, eidConceptRecord]);

    useEffect(() => {
        if (!showEidReportConcept) return;

        setIsEidConceptPdfLoading(true);
        setEidConceptPdfError(null);

        try {
            const dataUri = buildEidConceptPdfDataUri();
            setEidConceptPdfUrl(dataUri);
        } catch {
            setEidConceptPdfUrl(null);
            setEidConceptPdfError('Failed to generate concept PDF preview.');
        } finally {
            setIsEidConceptPdfLoading(false);
        }
    }, [showEidReportConcept, buildEidConceptPdfDataUri]);

    // Active state flags — surfaces altered-state awareness
    const activeStates = useMemo(() => {
        const states: string[] = [];
        if (demoModeEnabled) states.push('Demo mode');
        if (featureToggles.viewAsProd) states.push('Production view');
        if (originalAdminUser) states.push(`Viewing as ${user.FullName || user.Initials}`);
        return states;
    }, [demoModeEnabled, featureToggles.viewAsProd, originalAdminUser, user.FullName, user.Initials]);

    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard', 'success');
        } catch {
            showToast('Copy failed', 'warning');
        }
    };

    // Build user details
    const detailsMap = new Map<string, { label: string; value: string; isRate?: boolean; isRole?: boolean }>();
    Object.entries(user as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .forEach(([key, value]) => {
            const c = key.replace(/[\s_]/g, '').toLowerCase();
            if (c === 'aow' || c.includes('refreshtoken') || c.includes('refresh_token')) return;
            if (!detailsMap.has(c)) {
                detailsMap.set(c, {
                    label: key.replace(/_/g, ' '),
                    value: String(value),
                    isRate: c === 'rate',
                    isRole: c === 'role'
                });
            }
        });
    const userDetails = Array.from(detailsMap.values());
    const regularDetails = userDetails.filter(d => !d.label.toLowerCase().includes('asana'));
    const detailsRate = regularDetails.find(d => d.isRate)?.value;
    const headerRateDisplay = (user.Rate !== undefined && user.Rate !== null && String(user.Rate).trim() !== '')
        ? String(user.Rate)
        : detailsRate;

    // Areas of work
    const getInitialAreas = (): string[] => {
        const aow = user.AOW || (user as any).Area_of_Work || (user as any).aow;
        return aow ? String(aow).split(',').map(s => s.trim()).filter(Boolean) : [];
    };
    const [areasOfWork, setAreasOfWork] = useState<string[]>(getInitialAreas);

    const canSwitchUser = isAdminUser(user);
    const userInitials = (user.Initials || '').toUpperCase();
    const canAccessDevTools = isLocalDev || userInitials === 'LZ' || userInitials === 'CB';

    const hasAdminControls =
        !!(onUserChange && availableUsers) ||
        !!onToggleDemoMode ||
        !!onOpenReleaseNotesModal ||
        !!canAccessDevTools;

    const hasSessionFilters = !!onAreasChange || !!onFeatureToggle;

    // Styles – Brand panel
    const rowBaseBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${controlRowBg}`
        : controlRowBg;
    const rowHoverBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${bgHover}`
        : bgHover;
    const rowBaseShadow = isDarkMode
        ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)'
        : 'none';
    const rowHoverShadow = isDarkMode
        ? '0 8px 18px rgba(0, 3, 25, 0.42)'
        : '0 4px 12px rgba(6, 23, 51, 0.08)';

    const applyRowHover = (element: HTMLElement) => {
        element.style.borderColor = borderMedium;
        element.style.borderLeftColor = isDarkMode ? colours.accent : colours.blue;
        element.style.background = rowHoverBackground;
        element.style.transform = 'translateX(2px)';
        element.style.boxShadow = rowHoverShadow;
    };

    const resetRowHover = (element: HTMLElement) => {
        element.style.borderColor = borderLight;
        element.style.borderLeftColor = 'transparent';
        element.style.background = rowBaseBackground;
        element.style.transform = 'translateX(0)';
        element.style.boxShadow = rowBaseShadow;
    };

    const applyInsetHover = (element: HTMLElement) => {
        element.style.borderLeftColor = isDarkMode ? colours.accent : colours.blue;
        element.style.background = isDarkMode ? `${colours.blue}08` : `${colours.blue}05`;
        element.style.transform = 'translateX(2px)';
    };

    const resetInsetHover = (element: HTMLElement) => {
        element.style.borderLeftColor = 'transparent';
        element.style.background = 'transparent';
        element.style.transform = 'translateX(0)';
    };

    const sectionTitle: React.CSSProperties = {
        fontSize: 10, 
        fontWeight: 600, 
        color: textMuted, 
        textTransform: 'uppercase',
        letterSpacing: '0.5px', 
        marginBottom: 8, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 6
    };

    // AoW colour mapping for filter indicators
    const aowColour = (area: string): string => {
        const a = area.toLowerCase();
        if (a.includes('commercial')) return isDarkMode ? colours.accent : colours.blue;
        if (a.includes('construction')) return colours.orange;
        if (a.includes('property')) return colours.green;
        if (a.includes('employment')) return colours.yellow;
        return colours.greyText;
    };

    // AoW icon mapping (canonical emoji set)
    const aowIcon = (area: string): string => {
        const a = area.toLowerCase();
        if (a.includes('commercial')) return '🏢';
        if (a.includes('construction')) return '🏗️';
        if (a.includes('property')) return '🏠';
        if (a.includes('employment')) return '👩🏻‍💼';
        return 'ℹ️';
    };
    
    const toggleRow: React.CSSProperties = {
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '10px 12px', 
        background: rowBaseBackground,
        border: `1px solid ${borderLight}`,
        borderLeft: '3px solid transparent',
        borderRadius: '2px',
        cursor: 'pointer', 
        boxShadow: rowBaseShadow,
        transform: 'translateY(0)',
        transition: 'background 0.2s ease, border-color 0.2s ease, border-left-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
    };
    
    const toggleSwitch = (on: boolean): React.CSSProperties => ({
        width: 36, 
        height: 18, 
        background: on ? accentPrimary : borderMedium,
        borderRadius: '2px',
        position: 'relative', 
        transition: 'all 0.2s ease', 
        flexShrink: 0
    });
    
    const toggleKnob = (on: boolean): React.CSSProperties => ({
        width: 14, 
        height: 14, 
        background: '#fff', 
        borderRadius: '1px',
        position: 'absolute', 
        top: 2, 
        left: on ? 20 : 2,
        transition: 'all 0.2s ease', 
        boxShadow: shadowSm
    });
    
    const actionBtn: React.CSSProperties = {
        width: '100%', 
        padding: '10px 12px', 
        background: rowBaseBackground,
        color: textSecondary,
        border: `1px solid ${borderLight}`, 
        borderRadius: '2px',
        fontSize: 11, 
        fontWeight: 500, 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        boxShadow: rowBaseShadow,
        transform: 'translateY(0)',
        transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
    };
    


    return (
        <div className="user-bubble-container">
            {showRefreshModal && (
                <RefreshDataModal
                    isOpen={showRefreshModal}
                    onClose={() => setShowRefreshModal(false)}
                    onConfirm={async ({ clientCaches, enquiries, matters, reporting }) => {
                        try {
                            if (clientCaches) {
                                Object.keys(localStorage).filter(k => {
                                    const l = k.toLowerCase();
                                    return l.startsWith('enquiries-') || l.startsWith('normalizedmatters-') ||
                                        l.startsWith('vnetmatters-') || l.startsWith('matters-') ||
                                        l === 'allmatters' || l === 'teamdata' || l.includes('outstandingbalancesdata');
                                }).forEach(k => localStorage.removeItem(k));
                            }
                            const scopes: string[] = [];
                            if (reporting) scopes.push('reporting');
                            if (enquiries) scopes.push('enquiries');
                            if (matters) scopes.push('unified');
                            for (const scope of scopes) {
                                try { await fetch('/api/cache/clear-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) }); } catch {}
                            }
                            if (enquiries && onRefreshEnquiries) await onRefreshEnquiries();
                            if (matters && onRefreshMatters) await onRefreshMatters();
                        } finally {
                            setShowRefreshModal(false);
                            try { window.alert('Refresh complete.'); } catch {}
                        }
                    }}
                />
            )}

            <button
                ref={bubbleRef}
                onClick={() => {
                    if (open) closePopover();
                    else { previouslyFocusedElement.current = document.activeElement as HTMLElement; setOpen(true); }
                }}
                style={{
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    width: 32, 
                    height: 32, 
                    background: avatarBg,
                    border: `1px solid ${avatarBorder}`, 
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: avatarShadow
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = avatarBorderHover;
                    e.currentTarget.style.boxShadow = avatarShadowHover;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = avatarBorder;
                    e.currentTarget.style.boxShadow = avatarShadow;
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`User menu for ${user.FullName || initials}`}
            >
                <img src={avatarIcon} alt="User" style={{ width: 18, height: 18, filter: isDarkMode ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' : 'none' }} />
            </button>

            {open && typeof document !== 'undefined' && createPortal(
                <>
                    <div
                        style={{
                            position: 'fixed', 
                            inset: 0, 
                            background: isDarkMode ? 'rgba(0, 3, 25, 0.85)' : 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)', 
                            zIndex: 1998,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            animation: 'backdropFadeIn 0.2s ease forwards'
                        }}
                        onClick={() => closePopover()}
                    >
                    <div
                        ref={popoverRef}
                        id={popoverId}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '92vw',
                            maxWidth: 600,
                            maxHeight: '80vh', 
                            background: isDarkMode ? colours.websiteBlue : '#ffffff', 
                            border: `1px solid ${borderLight}`,
                            borderRadius: '2px',
                            boxShadow: isDarkMode
                                ? '0 24px 48px rgba(0, 3, 25, 0.6), 0 0 0 1px rgba(54, 144, 206, 0.08)'
                                : '0 24px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                            overflow: 'hidden', 
                            zIndex: 1999,
                            cursor: 'default',
                            animation: 'commandCenterIn 0.25s ease forwards',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative'
                        }}
                    >
                        {toast && (
                            <div
                                className={`user-bubble-toast user-bubble-toast-${toast.tone}`}
                                role="status"
                                aria-live="polite"
                            >
                                {toast.message}
                            </div>
                        )}

                        {/* Header — compact identity strip */}
                        <div 
                            style={{ 
                                padding: '12px 20px', 
                                borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : borderLight}`, 
                                background: isDarkMode ? colours.websiteBlue : colours.grey,
                                flexShrink: 0
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 32, 
                                    height: 32, 
                                    background: avatarBg, 
                                    border: `1.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : borderLight}`,
                                    borderRadius: '2px',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    padding: 5,
                                    flexShrink: 0
                                }}>
                                    <img src={avatarIcon} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary, opacity: 0.9, flexShrink: 0 }}>{initials}</span>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                            {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                        <span style={{ fontSize: 9, fontWeight: 500, color: textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                            {user.Role || 'Team Member'}
                                        </span>
                                        {headerRateDisplay && (
                                            <>
                                                <span style={{ fontSize: 8, color: textMuted, opacity: 0.6, flexShrink: 0 }}>•</span>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: '-0.2px', flexShrink: 0 }}>
                                                    {headerRateDisplay.startsWith('£') ? headerRateDisplay : `£${headerRateDisplay}`}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {/* Clio readiness cluster */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    {user.ClioID && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 9,
                                            fontWeight: 600,
                                            color: textMuted,
                                            letterSpacing: '0.2px'
                                        }}>
                                            <span style={{
                                                width: 5, height: 5,
                                                borderRadius: '50%',
                                                background: colours.green,
                                                boxShadow: `0 0 4px ${colours.green}60`,
                                                flexShrink: 0
                                            }} />
                                            Clio {user.ClioID}
                                        </span>
                                    )}
                                    {!user.ClioID && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 9,
                                            fontWeight: 600,
                                            color: colours.cta,
                                            letterSpacing: '0.2px'
                                        }}>
                                            <span style={{
                                                width: 5, height: 5,
                                                borderRadius: '50%',
                                                background: colours.cta,
                                                flexShrink: 0
                                            }} />
                                            No Clio
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => closePopover()}
                                    style={{
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.grey,
                                        border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.34)' : borderMedium}`,
                                        borderRadius: '2px',
                                        color: textPrimary,
                                        cursor: 'pointer',
                                        padding: '6px',
                                        minWidth: 28,
                                        minHeight: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease',
                                        flexShrink: 0
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? colours.accent : colours.blue;
                                        e.currentTarget.style.color = textPrimary;
                                        e.currentTarget.style.background = isDarkMode ? `${colours.accent}18` : bgHover;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.34)' : borderMedium;
                                        e.currentTarget.style.color = textPrimary;
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.grey;
                                    }}
                                    aria-label="Close"
                                    title="Close"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Environment ribbon */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '4px 20px',
                            background: isDarkMode ? colours.websiteBlue : '#fafafa',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.06)' : borderLight}`,
                            fontSize: 9,
                            fontWeight: 600,
                            color: textMuted,
                            letterSpacing: '0.3px',
                            flexShrink: 0
                        }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '1px 6px',
                                background: environmentBadgeBg,
                                border: `1px solid ${environmentBadgeBorder}`,
                                borderRadius: '2px',
                                color: environmentColour,
                                fontWeight: 700,
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.5px',
                                fontSize: 8
                            }}>
                                <span style={{
                                    width: 4, height: 4,
                                    borderRadius: '50%',
                                    background: environmentColour,
                                    ...(environment !== 'Production' ? { animation: 'userBubbleToastPulse 2s ease-in-out infinite alternate' } : {})
                                }} />
                                {environment}
                            </span>
                            <span style={{ opacity: 0.45, fontSize: 8 }}>{typeof window !== 'undefined' ? window.location.host : ''}</span>
                            <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 8 }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 2, verticalAlign: '-1px' }}>
                                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                                </svg>
                                {sessionElapsed}
                            </span>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                            {/* Active state warnings */}
                            {activeStates.length > 0 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    marginBottom: 16,
                                    background: demoModeEnabled
                                        ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                                        : (isDarkMode ? 'rgba(214, 85, 65, 0.10)' : 'rgba(214, 85, 65, 0.06)'),
                                    border: `1px solid ${demoModeEnabled
                                        ? (isDarkMode ? 'rgba(32, 178, 108, 0.34)' : 'rgba(32, 178, 108, 0.24)')
                                        : (isDarkMode ? 'rgba(214, 85, 65, 0.30)' : 'rgba(214, 85, 65, 0.20)')}`,
                                    borderRadius: '2px',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: demoModeEnabled ? colours.green : colours.cta
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    {activeStates.join(' · ')}
                                </div>
                            )}

                            {/* Mode selector */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={sectionTitle}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
                                        <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
                                        <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                    </svg>
                                    Mode
                                </div>
                                <div
                                    style={{
                                        ...toggleRow,
                                        background: 'transparent',
                                        borderRadius: 0,
                                        boxShadow: 'none',
                                        transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        applyInsetHover(e.currentTarget);
                                    }}
                                    onMouseLeave={(e) => {
                                        resetInsetHover(e.currentTarget);
                                    }}
                                    onClick={() => {
                                        toggleTheme();
                                        showToast(`Switched to ${isDarkMode ? 'light' : 'dark'} mode`, 'success');
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {isDarkMode ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2">
                                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                            </svg>
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2">
                                                <circle cx="12" cy="12" r="5"/>
                                            </svg>
                                        )}
                                        <span style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>{isDarkMode ? 'Dark' : 'Light'} Mode</span>
                                    </div>
                                    <div style={toggleSwitch(isDarkMode)}>
                                        <div style={toggleKnob(isDarkMode)} />
                                    </div>
                                </div>
                            </div>

                            {/* Admin controls — only shown for admin-eligible users */}
                            {isAdminEligible && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={sectionTitle}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                                        </svg>
                                        Admin controls
                                    </div>

                                    <div style={{
                                        background: isDarkMode ? colours.darkBlue : colours.grey,
                                        border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                        borderRadius: 4,
                                        overflow: 'hidden',
                                    }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '10px 14px',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s ease',
                                                background: 'transparent',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                            onClick={() => setAdminCollapsed(prev => !prev)}
                                        >
                                            {adminBadge}
                                            <span style={{ fontSize: '11px', color: textMuted, flex: 1 }}>
                                                Admin controls
                                            </span>
                                            <svg
                                                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                                style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: adminCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                                            >
                                                <path d="M6 9l6 6 6-6"/>
                                            </svg>
                                        </div>

                                        <div style={{
                                            maxHeight: adminCollapsed ? 0 : 600,
                                            opacity: adminCollapsed ? 0 : 1,
                                            overflow: 'hidden',
                                            transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
                                            padding: adminCollapsed ? '0 14px' : '0 14px 12px 14px',
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8,
                                            }}>
                                                {onUserChange && availableUsers && (
                                                    <div style={{ opacity: canSwitchUser ? 1 : 0.75 }}>
                                                        <div style={{ ...sectionTitle, color: textMuted, marginBottom: 6 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                                            </svg>
                                                            Switch User
                                                            {!canSwitchUser && (
                                                                <span style={{ marginLeft: 'auto', fontSize: 10, color: textMuted }}>Admin only</span>
                                                            )}
                                                        </div>
                                                        <select
                                                            disabled={!canSwitchUser}
                                                            onChange={(e) => {
                                                                const sel = availableUsers.find(u => u.Initials === e.target.value);
                                                                if (sel) {
                                                                    onUserChange(sel);
                                                                    showToast(`Switched to ${sel.FullName || sel.Initials}`, 'success');
                                                                }
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                padding: '10px 12px',
                                                                background: controlRowBg,
                                                                color: canSwitchUser ? textPrimary : textMuted,
                                                                border: `1px solid ${borderLight}`,
                                                                borderRadius: '2px',
                                                                fontSize: 11,
                                                                cursor: canSwitchUser ? 'pointer' : 'not-allowed'
                                                            }}
                                                        >
                                                            <option value="">{canSwitchUser ? 'Select user...' : 'Admin only'}</option>
                                                            {canSwitchUser && availableUsers
                                                                .filter(u => !u.status || u.status.toLowerCase() === 'active')
                                                                .map(u => (
                                                                    <option key={u.Initials} value={u.Initials}>{u.FullName || `${u.First || ''} ${u.Last || ''}`}</option>
                                                                ))}
                                                        </select>
                                                    </div>
                                                )}

                                                {onOpenReleaseNotesModal && (
                                                    <div
                                                        style={toggleRow}
                                                        onMouseEnter={(e) => {
                                                            applyRowHover(e.currentTarget);
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            resetRowHover(e.currentTarget);
                                                        }}
                                                        onClick={() => {
                                                            showToast('Opening release notes', 'info');
                                                            onOpenReleaseNotesModal();
                                                            closePopover();
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Release Notes</div>
                                                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Platform updates and improvements</div>
                                                        </div>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                            <path d="M9 18l6-6-6-6"/>
                                                        </svg>
                                                    </div>
                                                )}

                                                {onToggleDemoMode && (
                                                    <div
                                                        style={toggleRow}
                                                        onMouseEnter={(e) => {
                                                            applyRowHover(e.currentTarget);
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            resetRowHover(e.currentTarget);
                                                        }}
                                                        onClick={() => {
                                                            const nextDemoMode = !demoModeEnabled;
                                                            onToggleDemoMode(nextDemoMode);
                                                            showToast(nextDemoMode ? 'Demo mode enabled' : 'Demo mode disabled', nextDemoMode ? 'success' : 'warning');
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Demo mode</div>
                                                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Skip live refresh & seed demo prospect cases</div>
                                                        </div>
                                                        <div style={toggleSwitch(!!demoModeEnabled)}>
                                                            <div style={toggleKnob(!!demoModeEnabled)} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Local-only controls — only shown in local dev */}
                            {isLocalDev && (
                            <div style={{
                                marginBottom: 20,
                                padding: '0',
                                background: isDarkMode ? colours.darkBlue : colours.grey,
                                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                borderRadius: 4,
                                overflow: 'hidden',
                            }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 14px',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease',
                                        background: 'transparent',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    onClick={() => setLocalCollapsed(prev => !prev)}
                                >
                                    {localBadge}
                                    <span style={{ fontSize: '11px', color: textMuted, flex: 1 }}>Local dev</span>
                                    <svg
                                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                        style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: localCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                                    >
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </div>

                                {/* Collapsible body */}
                                <div style={{
                                    maxHeight: localCollapsed ? 0 : 1200,
                                    opacity: localCollapsed ? 0 : 1,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.3s ease, opacity 0.2s ease, padding 0.3s ease',
                                    padding: localCollapsed ? '0 14px' : '0 14px 12px 14px',
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                    }}>
                                        {/* Dev Dashboard */}
                                        <button
                                            onClick={() => { setShowDevDashboard(true); closePopover(false); }}
                                            style={{
                                                ...actionBtn,
                                                background: accentPrimary,
                                                color: '#fff',
                                                border: `1px solid ${accentPrimary}`
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.filter = 'brightness(0.85)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.filter = 'none';
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                                                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                                            </svg>
                                            Dev Dashboard
                                        </button>

                                        {/* Rate Change Tracker */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening rate change tracker', 'info');
                                                window.dispatchEvent(new CustomEvent('openRateChangeModal'));
                                                closePopover();
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Rate Change Tracker</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Jan 2026 rate notifications</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>

                                        {/* Debug modals */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening loading debug', 'info');
                                                setShowLoadingDebug(true);
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Loading Debug</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Test loading screens</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening error tracker', 'info');
                                                setShowErrorTracker(true);
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Error Tracker</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>View runtime errors</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>

                                        {/* View as production */}
                                        {onFeatureToggle && (
                                            <div
                                                style={toggleRow}
                                                onMouseEnter={(e) => {
                                                    applyRowHover(e.currentTarget);
                                                }}
                                                onMouseLeave={(e) => {
                                                    resetRowHover(e.currentTarget);
                                                }}
                                                onClick={() => {
                                                    const nextViewAsProd = !featureToggles.viewAsProd;
                                                    onFeatureToggle('viewAsProd', nextViewAsProd);
                                                    showToast(nextViewAsProd ? 'Production view active' : 'Production view off', nextViewAsProd ? 'success' : 'warning');
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        View as Production
                                                        {featureToggles.viewAsProd && (
                                                            <span style={{ fontSize: 9, background: textMuted, color: bg, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ACTIVE</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Hide dev features</div>
                                                </div>
                                                <div style={toggleSwitch(!!featureToggles.viewAsProd)}>
                                                    <div style={toggleKnob(!!featureToggles.viewAsProd)} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Show Attendance toggle */}
                                        {onFeatureToggle && (
                                            <div
                                                style={toggleRow}
                                                onMouseEnter={(e) => {
                                                    applyRowHover(e.currentTarget);
                                                }}
                                                onMouseLeave={(e) => {
                                                    resetRowHover(e.currentTarget);
                                                }}
                                                onClick={() => {
                                                    const next = !featureToggles.showAttendance;
                                                    onFeatureToggle('showAttendance', next);
                                                    showToast(next ? 'Attendance visible' : 'Attendance hidden', next ? 'success' : 'warning');
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        Show Attendance
                                                        {featureToggles.showAttendance && (
                                                            <span style={{ fontSize: 9, background: textMuted, color: bg, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ON</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Toggle attendance section on Home</div>
                                                </div>
                                                <div style={toggleSwitch(!!featureToggles.showAttendance)}>
                                                    <div style={toggleKnob(!!featureToggles.showAttendance)} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Replay metric animations */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Replaying animations', 'info');
                                                window.dispatchEvent(new CustomEvent('replayMetricAnimation'));
                                                closePopover();
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Replay Animations</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Re-run metric count-up</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                                            </svg>
                                        </div>

                                        {/* Demo prompts */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening local todo prompts', 'info');
                                                setShowDemoPrompts(true);
                                                closePopover();
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Todo List</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Local demo prompts</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>

                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening EID report concept', 'info');
                                                setShowEidReportConcept(true);
                                                closePopover(false);
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>EID Report Concept</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Preview from production sample JSON</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>

                                        {/* Pipeline Migration */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening migration tool', 'info');
                                                setShowMigrationTool(true);
                                                closePopover(false);
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    Pipeline Migration
                                                    <span style={{ fontSize: 8, fontWeight: 700, color: colours.blue, padding: '1px 5px', background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.06)', border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.12)'}`, borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>v1</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Migrate legacy Clio matters into the pipeline</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* Session filters */}
                            {hasSessionFilters && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={sectionTitle}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round"/>
                                        </svg>
                                        Session Filters
                                    </div>
                                    <div style={{ background: isDarkMode ? colours.darkBlue : colours.grey, border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`, borderRadius: '2px', padding: 12 }}>
                                        {onFeatureToggle && (
                                            <div
                                                style={{ ...toggleRow, marginBottom: onAreasChange ? 10 : 0 }}
                                                onMouseEnter={(e) => {
                                                    applyRowHover(e.currentTarget);
                                                }}
                                                onMouseLeave={(e) => {
                                                    resetRowHover(e.currentTarget);
                                                }}
                                                onClick={() => {
                                                    const next = !(featureToggles.showPhasedOutCustomTab ?? false);
                                                    onFeatureToggle('showPhasedOutCustomTab', next);
                                                    showToast(next ? 'Custom tab visible' : 'Custom tab hidden', next ? 'success' : 'warning');
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        Show Custom (phased out) tab
                                                        {(featureToggles.showPhasedOutCustomTab ?? false) && (
                                                            <span style={{ fontSize: 9, background: textMuted, color: bg, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ON</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Toggle phased-out Custom tab visibility in navigation</div>
                                                </div>
                                                <div style={toggleSwitch(!!(featureToggles.showPhasedOutCustomTab ?? false))}>
                                                    <div style={toggleKnob(!!(featureToggles.showPhasedOutCustomTab ?? false))} />
                                                </div>
                                            </div>
                                        )}

                                        {onAreasChange && (
                                            <>
                                                <div style={{ fontSize: 10, fontWeight: 500, color: textMuted, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Areas of Work</span>
                                                    <span style={{ opacity: 0.7 }}>{areasOfWork.length > 0 ? `${areasOfWork.length} active` : 'All'}</span>
                                                </div>
                                                <div style={{ display: 'grid', gap: 2 }}>
                                                    {AVAILABLE_AREAS.map(area => {
                                                        const checked = areasOfWork.includes(area);
                                                        const areaCol = aowColour(area);
                                                        return (
                                                            <label key={area} style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                                padding: '6px 8px',
                                                                background: checked
                                                                    ? (isDarkMode ? `linear-gradient(90deg, ${areaCol}0a 0%, transparent 60%)` : `linear-gradient(90deg, ${areaCol}08 0%, transparent 60%)`)
                                                                    : 'transparent',
                                                                borderRadius: 0,
                                                                borderLeft: `3px solid ${checked ? areaCol : 'transparent'}`,
                                                                borderTop: `1px solid ${checked ? `${areaCol}20` : 'transparent'}`,
                                                                borderRight: `1px solid ${checked ? `${areaCol}20` : 'transparent'}`,
                                                                borderBottom: `1px solid ${checked ? `${areaCol}20` : 'transparent'}`,
                                                                transition: 'all 0.15s ease'
                                                            }}>
                                                                <span style={{
                                                                    width: 5, height: 5,
                                                                    borderRadius: '50%',
                                                                    background: areaCol,
                                                                    opacity: checked ? 1 : 0.25,
                                                                    flexShrink: 0,
                                                                    transition: 'opacity 0.15s ease'
                                                                }} />
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={(e) => {
                                                                        const newAreas = e.target.checked
                                                                            ? [...areasOfWork, area]
                                                                            : areasOfWork.filter(a => a !== area);
                                                                        setAreasOfWork(newAreas);
                                                                        onAreasChange(newAreas);
                                                                    }}
                                                                    style={{ display: 'none' }}
                                                                />
                                                                <span style={{ fontSize: 11, fontWeight: 500, color: checked ? textPrimary : textMuted, flex: 1 }}>{aowIcon(area)} {area}</span>
                                                                {checked && <span style={{ fontSize: 7, fontWeight: 600, color: areaCol, opacity: 0.7 }}>ON</span>}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                {areasOfWork.length > 0 && (
                                                    <button
                                                        onClick={() => { setAreasOfWork([]); onAreasChange([]); }}
                                                        style={{
                                                            width: '100%',
                                                            marginTop: 8,
                                                            padding: '6px 8px',
                                                            background: 'transparent',
                                                            color: ctaPrimary,
                                                            border: `1px solid ${ctaPrimary}30`,
                                                            borderRadius: '2px',
                                                            fontSize: 10,
                                                            fontWeight: 500,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = `${ctaPrimary}10`;
                                                            e.currentTarget.style.borderColor = ctaPrimary;
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'transparent';
                                                            e.currentTarget.style.borderColor = `${ctaPrimary}30`;
                                                        }}
                                                    >
                                                        Clear All Filters
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            
                            
                            

                            {/* Appearance */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={sectionTitle}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
                                        <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
                                        <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                    </svg>
                                    Appearance
                                </div>
                                {/* ── Brand ── */}
                                <div style={{
                                    marginTop: 0,
                                    background: isDarkMode ? colours.darkBlue : colours.grey,
                                    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                }}>
                                    {/* Toggle header */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 14px',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease',
                                            background: 'transparent',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        onClick={() => setPaletteCollapsed(prev => !prev)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <img src={isDarkMode ? darkAvatarMark : lightAvatarMark} alt="" style={{ width: 8, height: 14, opacity: 0.5 }} />
                                            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, opacity: 0.7 }}>Brand</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {paletteCollapsed && (
                                                <div style={{ display: 'flex', gap: 3 }}>
                                                    {helixSwatches.map(s => (
                                                        <span key={s.key} style={{ width: 8, height: 8, borderRadius: 1, background: s.color, display: 'block', border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}44` : `${colours.darkBlue}20`}` }} />
                                                    ))}
                                                </div>
                                            )}
                                            <svg
                                                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                                style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: paletteCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                                            >
                                                <path d="M6 9l6 6 6-6"/>
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Collapsible body */}
                                    <div style={{
                                        maxHeight: paletteCollapsed ? 0 : 600,
                                        opacity: paletteCollapsed ? 0 : 1,
                                        overflow: 'hidden',
                                        transition: 'max-height 0.35s ease, opacity 0.2s ease, padding 0.35s ease',
                                        padding: paletteCollapsed ? '0 14px' : '0 14px 12px 14px',
                                    }}>
                                        {/* ── Swatches row ── */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }}>
                                            {helixSwatches.map((swatch) => (
                                                <div
                                                    key={swatch.key}
                                                    title={`${swatch.label}\nClick to copy ${swatch.color}`}
                                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(swatch.color); showToast(`Copied ${swatch.color}`, 'info'); }}
                                                    style={{
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                                        cursor: 'pointer', flex: 1, minWidth: 0,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            width: 22, height: 22, background: swatch.color, borderRadius: 2,
                                                            border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : `${colours.darkBlue}20`}`,
                                                            display: 'block', boxSizing: 'border-box',
                                                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.25)'; e.currentTarget.style.boxShadow = `0 2px 8px ${swatch.color}44`; e.currentTarget.style.zIndex = '10'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.zIndex = '0'; }}
                                                    />
                                                    <span style={{ fontSize: 7, color: textMuted, fontWeight: 700, letterSpacing: 0.15, whiteSpace: 'nowrap' }}>{swatch.label}</span>
                                                    <span style={{ fontSize: 6, color: textPrimary, opacity: 0.8, fontWeight: 600, letterSpacing: 0.1, whiteSpace: 'nowrap' }}>{swatch.color}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* ── Brand assets — show mark + logo for current theme ── */}
                                        <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginBottom: 6, opacity: 0.6 }}>
                                            Downloads
                                        </div>
                                        <div key={`brand-assets-${colourPairings[activePairing]?.tag || 'none'}`} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
                                            {(() => {
                                                const tag = colourPairings[activePairing]?.tag;
                                                if (tag === 'DARK') {
                                                    return [
                                                        { label: 'Helix Mark', desc: 'SVG · light mark', src: darkAvatarMark, filename: 'helix-mark-white.svg', preview: darkAvatarMark, previewBg: colours.darkBlue, isLogo: false },
                                                        { label: 'Helix Logo', desc: 'PNG · light logo', src: hlrWhiteMark, filename: 'HLRwhite72.png', preview: hlrWhiteMark, previewBg: colours.helixBlue, isLogo: true },
                                                    ];
                                                }
                                                if (tag === 'LIGHT') {
                                                    return [
                                                        { label: 'Helix Mark', desc: 'SVG · dark mark', src: lightAvatarMark, filename: 'helix-mark-dark.svg', preview: lightAvatarMark, previewBg: colours.grey, isLogo: false },
                                                        { label: 'Helix Logo', desc: 'PNG · dark logo', src: hlrBlueMark, filename: 'HLRblue72.png', preview: hlrBlueMark, previewBg: colours.grey, isLogo: true },
                                                    ];
                                                }
                                                return [];
                                            })().map(asset => (
                                                <div
                                                    key={asset.filename}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '6px 8px',
                                                        background: 'transparent',
                                                        borderLeft: `3px solid transparent`,
                                                        borderTop: `1px solid ${borderLight}`,
                                                        borderRight: `1px solid ${borderLight}`,
                                                        borderBottom: `1px solid ${borderLight}`,
                                                        borderRadius: 0,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                    title={`Download ${asset.label}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const a = document.createElement('a');
                                                        a.href = asset.src;
                                                        a.download = asset.filename;
                                                        document.body.appendChild(a);
                                                        a.click();
                                                        document.body.removeChild(a);
                                                        showToast(`Downloaded ${asset.filename}`, 'info');
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.borderLeftColor = isDarkMode ? colours.accent : colours.blue;
                                                        e.currentTarget.style.background = isDarkMode ? `${colours.blue}08` : `${colours.blue}05`;
                                                        e.currentTarget.style.transform = 'translateX(2px)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.borderLeftColor = 'transparent';
                                                        e.currentTarget.style.background = 'transparent';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                    }}
                                                >
                                                    {/* Preview thumbnail — wider for logo PNGs */}
                                                    <div style={{
                                                        width: asset.isLogo ? 88 : 24, height: asset.isLogo ? 32 : 24, borderRadius: 2,
                                                        background: asset.previewBg,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}44` : `${colours.darkBlue}12`}`,
                                                        flexShrink: 0,
                                                        overflow: 'hidden',
                                                    }}>
                                                        <img
                                                            src={asset.preview}
                                                            alt=""
                                                            style={asset.isLogo
                                                                ? { width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: '0 6px', boxSizing: 'border-box' }
                                                                : { width: 8, height: 14 }
                                                            }
                                                        />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? '#d1d5db' : colours.darkBlue, lineHeight: 1.2 }}>{asset.label}</div>
                                                        <div style={{ fontSize: 7, color: textMuted, opacity: 0.7 }}>{asset.desc}</div>
                                                    </div>
                                                    {/* Download icon */}
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round"/>
                                                        <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                </div>
                                            ))}
                                        </div>

                                        {/* ── Compositions preview (local only) ── */}
                                        {isLocalDev && <>
                                        <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginBottom: 6, opacity: 0.6 }}>
                                            Compositions
                                        </div>

                                        {/* Pairing selector tabs */}
                                        <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                                            {colourPairings.map((p, i) => (
                                                <button
                                                    key={p.tag}
                                                    onClick={(e) => { e.stopPropagation(); setActivePairing(i); }}
                                                    style={{
                                                        flex: 1, padding: '4px 0', fontSize: 7, fontWeight: 700,
                                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                                        background: activePairing === i
                                                            ? (isDarkMode ? colours.helixBlue : colours.highlightBlue)
                                                            : 'transparent',
                                                        color: activePairing === i ? textPrimary : textMuted,
                                                        border: `1px solid ${activePairing === i
                                                            ? (isDarkMode ? `${colours.blue}44` : colours.highlightNeutral)
                                                            : 'transparent'}`,
                                                        borderRadius: 2, cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                >
                                                    {p.tag}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Intent selector inside base mode */}
                                        <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                                            {[
                                                { key: 'NAV' as const, label: 'NAV' },
                                                { key: 'ACTION' as const, label: 'ACTION' },
                                                { key: 'POSITIVE' as const, label: 'POSITIVE' },
                                            ].map(intent => (
                                                <button
                                                    key={intent.key}
                                                    onClick={(e) => { e.stopPropagation(); setActiveIntent(intent.key); }}
                                                    style={{
                                                        flex: 1, padding: '4px 0', fontSize: 7, fontWeight: 700,
                                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                                        background: activeIntent === intent.key
                                                            ? (isDarkMode ? colours.darkBlue : colours.highlightBlue)
                                                            : 'transparent',
                                                        color: activeIntent === intent.key ? textPrimary : textMuted,
                                                        border: `1px solid ${activeIntent === intent.key
                                                            ? (isDarkMode ? `${colours.blue}33` : colours.highlightNeutral)
                                                            : 'transparent'}`,
                                                        borderRadius: 2, cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                >
                                                    {intent.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Live composition preview */}
                                        {(() => {
                                            const p = colourPairings[activePairing];
                                            const intentAccent = activeIntent === 'ACTION'
                                                ? colours.cta
                                                : activeIntent === 'POSITIVE'
                                                    ? colours.green
                                                    : p.accent;
                                            const intentLabel = activeIntent === 'ACTION'
                                                ? 'CTA'
                                                : activeIntent === 'POSITIVE'
                                                    ? 'Positive'
                                                    : 'Navigation';
                                            return (
                                                <div style={{
                                                    background: p.bg, borderRadius: 2, padding: 10,
                                                    border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : `${colours.darkBlue}15`}`,
                                                    transition: 'background 0.25s ease',
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: intentAccent, flexShrink: 0 }} />
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: p.fg, letterSpacing: '-0.2px' }}>{p.label}</span>
                                                    </div>
                                                    <div style={{ fontSize: 9, color: p.fg, opacity: 0.7, marginBottom: 10, lineHeight: 1.4 }}>
                                                        {p.desc}
                                                    </div>

                                                    {/* Sample interactive row */}
                                                    <div
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '6px 8px',
                                                            background: `${intentAccent}10`,
                                                            border: `1px solid ${intentAccent}22`,
                                                            borderRadius: 2,
                                                            transition: 'all 0.15s ease',
                                                            cursor: 'default',
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = `${intentAccent}20`;
                                                            e.currentTarget.style.borderColor = `${intentAccent}44`;
                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                            e.currentTarget.style.boxShadow = `0 2px 8px ${p.bg}88`;
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = `${intentAccent}10`;
                                                            e.currentTarget.style.borderColor = `${intentAccent}22`;
                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                            e.currentTarget.style.boxShadow = 'none';
                                                        }}
                                                    >
                                                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: intentAccent }} />
                                                        <span style={{ fontSize: 9, color: p.fg, opacity: 0.8, flex: 1 }}>Interactive row</span>
                                                        <span style={{ fontSize: 8, color: intentAccent, fontWeight: 600 }}>{intentLabel}</span>
                                                    </div>

                                                    {/* Colour stack bar */}
                                                    <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
                                                        <div style={{ flex: 4, height: 3, background: p.bg, borderRadius: 1, border: `1px solid ${p.fg}15` }} />
                                                        <div style={{ flex: 2, height: 3, background: `${intentAccent}40`, borderRadius: 1 }} />
                                                        <div style={{ flex: 1, height: 3, background: intentAccent, borderRadius: 1 }} />
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Local-only playground for layering experiments */}
                                        <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginTop: 10, marginBottom: 6, opacity: 0.6 }}>
                                            Playground
                                        </div>
                                        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                                            {[
                                                { label: 'UserBubble', apply: () => { setPlaygroundBase('darkBlue'); setPlaygroundLayer('helixBlue'); setPlaygroundAccent('accent'); } },
                                                { label: 'Dark Nav', apply: () => { setPlaygroundBase('websiteBlue'); setPlaygroundLayer('darkBlue'); setPlaygroundAccent('accent'); } },
                                                { label: 'Light Nav', apply: () => { setPlaygroundBase('grey'); setPlaygroundLayer('blue'); setPlaygroundAccent('blue'); } },
                                            ].map(preset => (
                                                <button
                                                    key={preset.label}
                                                    onClick={(e) => { e.stopPropagation(); preset.apply(); }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '4px 0',
                                                        fontSize: 7,
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: 0.4,
                                                        border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : colours.highlightNeutral}`,
                                                        background: 'transparent',
                                                        color: textMuted,
                                                        borderRadius: 2,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 8 }}>
                                            {[{
                                                key: 'base',
                                                label: 'Base',
                                                value: playgroundBase,
                                                set: setPlaygroundBase,
                                                options: playgroundBaseOptions,
                                            }, {
                                                key: 'layer',
                                                label: 'Layer',
                                                value: playgroundLayer,
                                                set: setPlaygroundLayer,
                                                options: playgroundLayerOptions,
                                            }, {
                                                key: 'accent',
                                                label: 'Accent',
                                                value: playgroundAccent,
                                                set: setPlaygroundAccent,
                                                options: playgroundAccentOptions,
                                            }].map(group => (
                                                <div key={group.key}>
                                                    <div style={{ fontSize: 6, color: textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{group.label}</div>
                                                    <select
                                                        value={group.value}
                                                        onChange={(e) => group.set(e.target.value as never)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '4px 6px',
                                                            fontSize: 8,
                                                            background: isDarkMode ? colours.darkBlue : '#fff',
                                                            color: textPrimary,
                                                            border: `1px solid ${borderLight}`,
                                                            borderRadius: 2,
                                                        }}
                                                    >
                                                        {Object.entries(group.options).map(([key, option]) => (
                                                            <option key={key} value={key}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>

                                        {(() => {
                                            const base = playgroundBaseOptions[playgroundBase];
                                            const layer = playgroundLayerOptions[playgroundLayer];
                                            const accent = playgroundAccentOptions[playgroundAccent];
                                            const text = base.color === colours.grey || base.color === colours.highlightBlue ? colours.darkBlue : '#ffffff';

                                            return (
                                                <div style={{
                                                    background: base.color,
                                                    border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : `${colours.darkBlue}15`}`,
                                                    borderRadius: 2,
                                                    padding: 8,
                                                }}>
                                                    <div style={{
                                                        background: layer.color,
                                                        border: `1px solid ${accent.color}33`,
                                                        borderRadius: 2,
                                                        padding: '6px 8px',
                                                        marginBottom: 6,
                                                        color: text,
                                                        fontSize: 9,
                                                        fontWeight: 600,
                                                    }}>
                                                        Layer preview
                                                    </div>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '6px 8px',
                                                        background: `${accent.color}14`,
                                                        border: `1px solid ${accent.color}33`,
                                                        borderLeft: `3px solid ${accent.color}`,
                                                        borderRadius: 0,
                                                        color: text,
                                                        fontSize: 8,
                                                    }}>
                                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: accent.color }} />
                                                        <span style={{ flex: 1 }}>Interactive cue</span>
                                                        <span style={{ color: accent.color, fontWeight: 700 }}>{accent.label}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 4, marginTop: 6, fontSize: 6, color: textMuted }}>
                                                        <span>{base.color}</span>
                                                        <span>{layer.color}</span>
                                                        <span>{accent.color}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        </>}
                                    </div>
                                </div>
                            </div>

                            {/* Profile — curated key fields only */}
                            {regularDetails.filter(d => !d.isRate && !d.isRole).length > 0 && (
                                <div style={{
                                    marginBottom: 20,
                                    padding: '0',
                                    background: isDarkMode ? colours.darkBlue : colours.grey,
                                    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        onClick={() => setProfileCollapsed(prev => !prev)}
                                    >
                                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, opacity: 0.8 }}>Profile</div>
                                        <svg
                                            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                            style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: profileCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                                        >
                                            <path d="M6 9l6 6 6-6"/>
                                        </svg>
                                    </div>

                                    <div style={{
                                        maxHeight: profileCollapsed ? 0 : 500,
                                        opacity: profileCollapsed ? 0 : 1,
                                        overflow: 'hidden',
                                        transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
                                        padding: profileCollapsed ? '0 12px' : '0 12px 12px 12px',
                                    }}>
                                    <div style={{ display: 'grid', gap: 2 }}>
                                        {regularDetails.filter(d => !d.isRate && !d.isRole).map(d => (
                                            <div key={d.label} style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                padding: '7px 10px', 
                                                background: 'transparent',
                                                borderTop: `1px solid ${borderLight}`,
                                                borderRight: `1px solid ${borderLight}`,
                                                borderBottom: `1px solid ${borderLight}`,
                                                borderLeft: '3px solid transparent',
                                                borderRadius: 0,
                                                gap: 8,
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => {
                                                applyInsetHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetInsetHover(e.currentTarget);
                                            }}
                                            >
                                                <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, minWidth: 65, textTransform: 'uppercase', letterSpacing: 0.3 }}>{d.label}</span>
                                                <span style={{ fontSize: 11, color: textPrimary, flex: 1, wordBreak: 'break-word' }}>{d.value}</span>
                                                <button 
                                                    onClick={() => copy(d.value)} 
                                                    style={{ 
                                                        background: 'transparent', 
                                                        border: 'none', 
                                                        color: textMuted, 
                                                        fontSize: 9, 
                                                        cursor: 'pointer', 
                                                        padding: '2px 4px',
                                                        opacity: 0.5,
                                                        transition: 'opacity 0.15s ease'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                                                >
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    </div>
                                </div>
                            )}

                            {/* Quick actions footer */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button 
                                    onClick={() => setShowRefreshModal(true)} 
                                    style={{
                                        ...actionBtn,
                                        flex: 1,
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        applyRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textPrimary;
                                    }}
                                    onMouseLeave={(e) => {
                                        resetRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textSecondary;
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                    </svg>
                                    Refresh Data
                                </button>

                                {originalAdminUser && onReturnToAdmin && (
                                    <button 
                                        onClick={() => { onReturnToAdmin(); closePopover(); }} 
                                        style={{ 
                                            ...actionBtn, 
                                            flex: 1,
                                            justifyContent: 'center',
                                            background: ctaPrimary, 
                                            color: '#fff', 
                                            border: `1px solid ${ctaPrimary}`
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.filter = 'brightness(0.85)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.filter = 'none';
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                                        </svg>
                                        Return to Admin
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                </>
            , document.body)}

            {isLocalDev && showDevDashboard && <AdminDashboard isOpen={showDevDashboard} onClose={() => setShowDevDashboard(false)} inspectorData={user} />}
            {isLocalDev && showDemoPrompts && <DemoPromptsModal isOpen={showDemoPrompts} onClose={() => setShowDemoPrompts(false)} />}
            {isLocalDev && showLoadingDebug && <LoadingDebugModal isOpen={showLoadingDebug} onClose={() => setShowLoadingDebug(false)} />}
            {isLocalDev && showErrorTracker && <ErrorTracker onClose={() => setShowErrorTracker(false)} />}
            {isLocalDev && showMigrationTool && <LegacyMigrationTool isOpen={showMigrationTool} onClose={() => setShowMigrationTool(false)} onToast={showToast} />}
            {isLocalDev && showEidReportConcept && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0, 3, 25, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ width: 'min(860px, 96vw)', maxHeight: '86vh', overflow: 'auto', background: isDarkMode ? colours.darkBlue : '#ffffff', border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`, borderRadius: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, background: isDarkMode ? colours.websiteBlue : colours.grey }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 34,
                                    height: 34,
                                    border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : colours.highlightNeutral}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: isDarkMode ? 'rgba(13, 47, 96, 0.45)' : '#ffffff',
                                    flexShrink: 0,
                                }}>
                                    <img src={isDarkMode ? darkAvatarMark : lightAvatarMark} alt="Helix mark" style={{ width: 10, height: 17 }} />
                                </div>
                                <div>
                                    <img src={isDarkMode ? hlrWhiteMark : hlrBlueMark} alt="Helix Law" style={{ height: 17, width: 'auto', display: 'block', opacity: 0.95 }} />
                                    <div style={{ fontSize: 8, color: textMuted, marginTop: 1, letterSpacing: 0.35, textTransform: 'uppercase' }}>Identity verification concept preview</div>
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: isDarkMode ? colours.accent : colours.blue }}>Identity Verification Report Concept</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Local prototype from the production sample set</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowEidReportConcept(false)}
                                style={{ background: 'transparent', border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, color: textSecondary, padding: '6px 8px', borderRadius: 0, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                            >
                                Close
                            </button>
                        </div>

                        <div style={{ padding: 14, display: 'grid', gap: 10 }}>
                            <div style={{ border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, borderRadius: 0, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: isDarkMode ? colours.websiteBlue : colours.grey, borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}` }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.accent : colours.blue }}>PDF Concept Preview</span>
                                    {eidConceptPdfUrl && (
                                        <a
                                            href={eidConceptPdfUrl}
                                            download="eid-report-concept.pdf"
                                            style={{ fontSize: 9, color: colours.blue, textDecoration: 'none', fontWeight: 600 }}
                                        >
                                            Download PDF
                                        </a>
                                    )}
                                </div>

                                {isEidConceptPdfLoading ? (
                                    <div style={{ padding: 12, fontSize: 10, color: textMuted }}>Generating PDF preview…</div>
                                ) : eidConceptPdfError ? (
                                    <div style={{ padding: 12, fontSize: 10, color: colours.cta }}>{eidConceptPdfError}</div>
                                ) : eidConceptPdfUrl ? (
                                    <object
                                        data={eidConceptPdfUrl}
                                        type="application/pdf"
                                        title="EID Report Concept PDF"
                                        style={{ width: '100%', height: 340, border: 'none', background: isDarkMode ? colours.websiteBlue : '#f5f5f5' }}
                                    >
                                        <div style={{ padding: 12, fontSize: 10, color: textMuted }}>
                                            PDF preview is unavailable in this browser. <a href={eidConceptPdfUrl} download="eid-report-concept.pdf" style={{ color: colours.blue }}>Download instead</a>.
                                        </div>
                                    </object>
                                ) : null}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                <div style={{ border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, padding: '8px 10px', borderRadius: 0 }}>
                                    <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase' }}>Correlation ID</div>
                                    <div style={{ fontSize: 11, color: textPrimary, marginTop: 4, wordBreak: 'break-word' }}>{eidConceptRecord.correlationId}</div>
                                </div>
                                <div style={{ border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, padding: '8px 10px', borderRadius: 0 }}>
                                    <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase' }}>External Reference</div>
                                    <div style={{ fontSize: 11, color: textPrimary, marginTop: 4 }}>{eidConceptRecord.externalReferenceId}</div>
                                </div>
                                <div style={{ border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, padding: '8px 10px', borderRadius: 0 }}>
                                    <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase' }}>Overall Result</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: eidConceptResultColour(eidConceptRecord?.overallResult?.result), marginTop: 4 }}>{eidConceptRecord?.overallResult?.result || '—'}</div>
                                </div>
                            </div>

                            {eidConceptChecks.map((check: any) => {
                                const checkName = check?.checkTypeId === 1 ? 'Address Verification' : check?.checkTypeId === 2 ? 'PEP & Sanctions' : (check?.sourceResults?.rule || 'Verification Check');
                                const checkResult = check?.sourceResults?.result?.result || '—';
                                const checkResults = Array.isArray(check?.sourceResults?.results) ? check.sourceResults.results : [];
                                const resultColor = eidConceptResultColour(checkResult);

                                return (
                                    <div key={`${checkName}-${check?.checkTypeId || 'x'}`} style={{ border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, borderRadius: 0, overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: isDarkMode ? colours.websiteBlue : colours.grey }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: textPrimary }}>{checkName}</div>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: resultColor }}>{checkResult}</div>
                                        </div>

                                        <div style={{ padding: '8px 10px', display: 'grid', gap: 8 }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                <span style={{ fontSize: 9, color: textMuted }}>Checked: {check?.resultCount?.totalSourcesChecked ?? '—'}</span>
                                                <span style={{ fontSize: 9, color: colours.green }}>Passed: {check?.resultCount?.totalSourcesPassed ?? '—'}</span>
                                                <span style={{ fontSize: 9, color: colours.cta }}>Review: {check?.resultCount?.totalSourcesForReview ?? '—'}</span>
                                            </div>

                                            {checkResults.map((result: any, idx: number) => (
                                                <div key={`${result?.title || 'result'}-${idx}`} style={{ borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, paddingTop: 8 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 600, color: textPrimary }}>{result?.title || 'Result'} <span style={{ color: eidConceptResultColour(result?.result), fontWeight: 700 }}>{result?.result || '—'}</span></div>
                                                    {Array.isArray(result?.detail?.reasons) && result.detail.reasons.map((reason: any, reasonIdx: number) => (
                                                        <div key={`${reason?.key || 'reason'}-${reasonIdx}`} style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${eidConceptResultColour(reason?.result)}` }}>
                                                            <div style={{ fontSize: 9, fontWeight: 600, color: textPrimary }}>{reason?.key || 'Reason'} <span style={{ color: eidConceptResultColour(reason?.result) }}>{reason?.result || '—'}</span></div>
                                                            <div style={{ fontSize: 9, color: textMuted, marginTop: 2 }}>{reason?.reason || '—'}{reason?.code ? ` (${reason.code})` : ''}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            <div style={{
                                marginTop: 4,
                                borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
                                background: isDarkMode ? 'rgba(0, 3, 25, 0.35)' : 'rgba(244, 244, 246, 0.9)',
                                padding: '8px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                flexWrap: 'wrap',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 9, color: textMuted }}>Trust signals:</span>
                                    <span style={{ fontSize: 9, color: textPrimary, border: `1px solid ${isDarkMode ? 'rgba(160,160,160,0.25)' : colours.highlightNeutral}`, padding: '2px 6px', borderRadius: 999 }}>SRA Regulated</span>
                                    <span style={{ fontSize: 9, color: textPrimary, border: `1px solid ${isDarkMode ? 'rgba(160,160,160,0.25)' : colours.highlightNeutral}`, padding: '2px 6px', borderRadius: 999 }}>Identity checks auditable</span>
                                    <span style={{ fontSize: 9, color: textPrimary, border: `1px solid ${isDarkMode ? 'rgba(160,160,160,0.25)' : colours.highlightNeutral}`, padding: '2px 6px', borderRadius: 999 }}>Correlation-linked</span>
                                </div>
                                <div style={{ fontSize: 9, color: textMuted }}>SRA ID 565557</div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default UserBubble;
