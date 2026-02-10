//
import React from 'react'; // invisible change
// invisible change 2.2
import { Stack } from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { IdentityConfirmationCard } from './components';
import PoidCard from '../PoidCard';
import { POID, TeamData } from '../../../app/functionality/types';
import helixLogo from '../../../assets/dark blue mark.svg';

interface PoidSelectionStepProps {
    poidData: POID[];
    teamData?: TeamData[] | null;
    filteredPoidData: POID[];
    visiblePoidCount: number;
    selectedPoidIds: string[];
    preselectedPoidIds?: string[];
    poidSearchTerm: string;
    setPoidSearchTerm: (v: string) => void;
    poidGridRef: React.RefObject<HTMLDivElement | null>;
    handlePoidClick: (p: POID) => void;
    onConfirm?: () => void;
    pendingClientType: string;
    setPendingClientType: (type: string) => void;
    onClientTypeChange?: (newType: string, shouldLimitToSingle: boolean) => void;
    clientAsOnFile: string;
    setClientAsOnFile: (v: string) => void;
    /** When true (instruction entry), hide the Select Client section entirely */
    hideClientSections?: boolean;
    /** Optional identifiers to show in banner when context is instruction/matter */
    instructionRef?: string;
    matterRef?: string;
    /** Optional callback to trigger ID verification when pending */
    onRunIdCheck?: () => void;
    /** Demo mode — show inline EID outcome selector */
    demoModeEnabled?: boolean;
    /** Callback when user picks a demo EID result */
    onDemoEidResult?: (result: { id: string; pep: string; address: string }) => void;
}

// Animated transition for POID selection area
interface PoidSelectionTransitionProps {
    show: boolean;
    children: React.ReactNode;
}

const PoidSelectionTransition: React.FC<PoidSelectionTransitionProps> = ({ show, children }) => { /* invisible change */
    const [visible, setVisible] = React.useState(show);
    const [render, setRender] = React.useState(show);
    React.useEffect(() => {
        if (show) {
            setRender(true);
            const t = window.setTimeout(() => setVisible(true), 10);
            return () => window.clearTimeout(t);
        } else {
            setVisible(false);
            const timeout = window.setTimeout(() => setRender(false), 400);
            return () => window.clearTimeout(timeout);
        }
    }, [show]);
    if (!render) return null;
    return (
        <div
            className={"poid-selection-animated" + (visible ? " visible" : "")}
            style={{
                maxHeight: visible ? 1200 : 0,
                opacity: visible ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.5s cubic-bezier(.4,0,.2,1), opacity 0.4s cubic-bezier(.4,0,.2,1)',
                pointerEvents: visible ? 'auto' : 'none',
            }}
        >
            {children}
        </div>
    );
};

const PoidSelectionStep: React.FC<PoidSelectionStepProps> = ({
    poidData,
    teamData,
    filteredPoidData,
    visiblePoidCount,
    selectedPoidIds,
    preselectedPoidIds = [],
    poidSearchTerm,
    setPoidSearchTerm,
    poidGridRef,
    handlePoidClick,
    onConfirm,
    pendingClientType,
    setPendingClientType,
    onClientTypeChange,
    clientAsOnFile,
    setClientAsOnFile,
    hideClientSections = false,
    instructionRef,
    matterRef,
    onRunIdCheck,
    demoModeEnabled = false,
    onDemoEidResult,
}) => {
    // Build selection context (selected ids, selected POIDs, inferred company/individuals)
    const { isDarkMode } = useTheme();
    
    // Consistent theming like other components
    const themeColours = {
        bg: isDarkMode ? '#0F172A' : '#FFFFFF',
        cardBg: isDarkMode ? '#111827' : '#FFFFFF',
        border: isDarkMode ? '#374151' : '#CBD5E1',
        text: isDarkMode ? '#E5E7EB' : '#0F172A',
        textSecondary: isDarkMode ? '#9CA3AF' : '#475569',
        iconBg: isDarkMode ? '#1F2937' : '#F3F4F6',
        shadow: 'none',
        hoverShadow: 'none',
    };
    
    // Guard against unintended auto-preselect when coming from global actions without an instruction selected.
    const userInteractedRef = React.useRef(false);
    const findPoidById = React.useCallback((id: string) => {
        return poidData.find(p => p.poid_id === id) || filteredPoidData.find(p => p.poid_id === id) || null;
    }, [poidData, filteredPoidData]);

    // Improved auto-selection detection: if no instructionRef and no preselected IDs, 
    // treat any selectedPoidIds as unwanted auto-selection until user interacts
    const isDirectEntry = !instructionRef && (!preselectedPoidIds || preselectedPoidIds.length === 0);
    const hasAutoSelection = isDirectEntry 
        && Array.isArray(selectedPoidIds) 
        && selectedPoidIds.length > 0 
        && !userInteractedRef.current;

    // Track user interaction to distinguish from auto-selection
    React.useEffect(() => {
        // Only mark as user interaction if we're not in direct entry mode with auto-selection
        if (Array.isArray(selectedPoidIds) && selectedPoidIds.length > 0 && !hasAutoSelection) {
            userInteractedRef.current = true;
        }
    }, [selectedPoidIds, hasAutoSelection]);

    const effectiveSelectedIds = React.useMemo(() => {
        // For direct entry (no instructionRef, no preselected), start with empty selection
        // until user actually interacts
        if (hasAutoSelection) {
            return [] as string[];
        }

        // For instruction-based entry, use selected or preselected IDs
        return (selectedPoidIds && selectedPoidIds.length > 0)
            ? selectedPoidIds
            : (instructionRef && preselectedPoidIds ? preselectedPoidIds : []);
    }, [selectedPoidIds, instructionRef, preselectedPoidIds, hasAutoSelection]);

    const selectedIds = effectiveSelectedIds;
    const baseSelectedPoids = selectedIds.map(id => findPoidById(id)).filter(Boolean) as POID[];
    // Fallback: if no explicit selection but we have an instructionRef, try to resolve matching POIDs by reference
    const instructionMatchedPoids = React.useMemo(() => {
        if (!instructionRef) return [] as POID[];
        const matches = (poidData || []).filter((p: any) => (p?.InstructionRef || p?.instruction_ref) === instructionRef);
        if (matches.length > 0) return matches as POID[];
        const alt = (filteredPoidData || []).filter((p: any) => (p?.InstructionRef || p?.instruction_ref) === instructionRef);
        return alt as POID[];
    }, [poidData, filteredPoidData, instructionRef]);
    const rawSelectedPoids = (baseSelectedPoids.length > 0 ? baseSelectedPoids : instructionMatchedPoids) as POID[];
    const selectedPoids = hasAutoSelection ? ([] as POID[]) : rawSelectedPoids;
    const companyPoid = selectedPoids.find(p => !!(p.company_name || p.company_number));
    const individualPoids = selectedPoids.filter(p => !(p.company_name || p.company_number));

    const inferredType = (() => {
        if (pendingClientType) return pendingClientType;
        if (companyPoid) return 'Company';
        if (selectedPoids.length > 1) return 'Multiple Individuals';
        if (selectedPoids.length === 1) return 'Individual';
        return '';
    })();

    const formatName = (p: POID) => `${p.first || ''} ${p.last || ''}`.trim();
    const formatPeopleList = (people: POID[], max = 2) => {
        if (people.length === 0) return '';
        const names = people.map(formatName).filter(Boolean);
        const head = names.slice(0, max).join(', ');
        const remaining = names.length - max;
        return remaining > 0 ? `${head} +${remaining} more` : head;
    };

    const bannerTitle = (() => {
        if (companyPoid) {
            const companyName = companyPoid.company_name || 'Company';
            if (individualPoids.length > 0) {
                const directorName = formatPeopleList(individualPoids, 1); // Get just the first director
                return { companyName, directorName };
            }
            return { companyName, directorName: null };
        }
        if (individualPoids.length > 0) return { companyName: formatPeopleList(individualPoids, 2), directorName: null };
        return { companyName: 'Select Client', directorName: null };
    })();

    const bannerSubtitle = (() => {
        if (companyPoid) {
            const parts: string[] = [];
            if (companyPoid.company_number) parts.push(`Company No: ${companyPoid.company_number}`);
            if (individualPoids.length > 0) parts.push(`Directors: ${formatPeopleList(individualPoids, 3)}`);
            return parts.join(' • ');
        }
        if (individualPoids.length > 0 && inferredType === 'Multiple Individuals') {
            return `Clients: ${formatPeopleList(individualPoids, 3)}`;
        }
        // Don't show inferredType here - it will be shown under instruction ref
        return undefined;
    })();

    // Meta chips for context
    const meta: string[] = [];
    if (instructionRef) meta.push(`Instruction: ${instructionRef}`);
    if (matterRef) meta.push(`Matter: ${matterRef}`);

    // Aggregate verification results from selected POIDs
    type Verif = 'passed' | 'review' | 'failed' | 'pending' | '';
    const norm = (v?: string): Verif => {
        const s = (v || '').toLowerCase().trim();
        if (!s) return '';
        if (s.startsWith('pass')) return 'passed';
        if (s.startsWith('rev') || s.startsWith('ref') || s === 'consider') return 'review';
        if (s.startsWith('fail') || s.startsWith('rej')) return 'failed';
        if (s.startsWith('pend')) return 'pending';
        // Handle some other possible values
        if (s === 'approved') return 'passed';
        if (s === 'manual review' || s === 'manual_review') return 'review';
        return '';
    };
    const getFor = (p: POID) => ({
        id: norm((p as any).check_result || (p as any).EIDOverallResult || (p as any).EIDStatus),
        pep: norm((p as any).pep_sanctions_result || (p as any).PEPAndSanctionsCheckResult || (p as any).PEPResult),
        addr: norm((p as any).address_verification_result || (p as any).AddressVerificationResult || (p as any).AddressVerification),
    });
    const selectedVerifs = selectedPoids.map(getFor);
    const agg = (key: 'id'|'pep'|'addr'): Verif => {
        if (selectedVerifs.some(v => v[key] === 'failed')) return 'failed';
        if (selectedVerifs.some(v => v[key] === 'review')) return 'review';
        if (selectedVerifs.length > 0 && selectedVerifs.every(v => v[key] === 'passed')) return 'passed';
        if (selectedVerifs.some(v => v[key] === 'pending')) return 'pending';
        return '';
    };
    const aggId = agg('id');
    const aggPep = agg('pep');
    const aggAddr = agg('addr');

    // Overall status for styling the ID verification block (fails trump reviews trump pending)
    const overallIdStatus: Verif = (() => {
        const statuses: Verif[] = [aggId, aggPep, aggAddr];
        if (statuses.some((s) => s === 'failed')) return 'failed';
        if (statuses.some((s) => s === 'review')) return 'review';
        if (statuses.some((s) => s === 'pending' || s === '')) return 'pending';
        return 'passed';
    })();

    const overallPalette = (() => {
        if (overallIdStatus === 'failed') {
            return {
                border: isDarkMode ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.4)',
                glow: '0 0 0 1px rgba(239, 68, 68, 0.18)',
                text: '#ef4444',
                header: isDarkMode ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.12)',
            };
        }
        if (overallIdStatus === 'review') {
            return {
                border: isDarkMode ? 'rgba(251, 191, 36, 0.45)' : 'rgba(251, 191, 36, 0.4)',
                glow: '0 0 0 1px rgba(251, 191, 36, 0.16)',
                text: '#f59e0b',
                header: isDarkMode ? 'rgba(251, 191, 36, 0.16)' : 'rgba(251, 191, 36, 0.12)',
            };
        }
        if (overallIdStatus === 'pending') {
            return {
                border: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)',
                glow: '0 0 0 1px rgba(148, 163, 184, 0.14)',
                text: isDarkMode ? '#cbd5e1' : '#475569',
                header: isDarkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.1)',
            };
        }
        return {
            border: isDarkMode ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 197, 94, 0.45)',
            glow: '0 0 0 1px rgba(34, 197, 94, 0.18)',
            text: '#22c55e',
            header: isDarkMode ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.12)',
        };
    })();

    // Collapsible state for unified Client Selection section - must be before any early returns
    const [isClientSectionOpen, setIsClientSectionOpen] = React.useState<boolean>(!!pendingClientType);
    React.useEffect(() => {
        // When a client type is chosen, auto-open the section
        if (pendingClientType) setIsClientSectionOpen(true);
    }, [pendingClientType]);

    const renderSelectionSummary = () => {
        const selectedPoid = selectedPoids[0];
        
        return (
            <div
                className="instruction-card-banner"
                style={{
                    background: isDarkMode ? '#0F172A' : '#FFFFFF',
                    border: `1px solid ${isDarkMode ? '#374151' : '#CBD5E1'}`,
                    borderRadius: 2,
                    padding: '20px 24px',
                    boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                    color: themeColours.text,
                    marginBottom: 16,
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >

                
                {/* Content with relative positioning */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    {/* Main client header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: selectedPoids.length > 0 ? 18 : 0 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 60 }}>
                            <div style={{ 
                                fontSize: 18, 
                                lineHeight: 1.3, 
                                color: themeColours.text,
                                marginBottom: 6,
                                letterSpacing: 0.1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10
                            }}>
                                <span style={{ fontWeight: 800 }}>
                                    {typeof bannerTitle === 'object' ? bannerTitle.companyName : bannerTitle}
                                </span>
                                {typeof bannerTitle === 'object' && bannerTitle.directorName && (
                                    <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.8 }}>
                                        / {bannerTitle.directorName}
                                    </span>
                                )}
                            </div>
                            {bannerSubtitle && (
                                <div style={{ 
                                    fontSize: 12.5, 
                                    color: themeColours.textSecondary, 
                                    lineHeight: 1.35,
                                    marginBottom: 12,
                                    letterSpacing: 0.1
                                }}>
                                    {bannerSubtitle}
                                </div>
                            )}
                            
                            {/* Flat detail lines — no boxes, just icon + value */}
                            {selectedPoid && (
                                (selectedPoid.email || selectedPoid.best_number || selectedPoid.house_building_number || selectedPoid.street || selectedPoid.city || selectedPoid.post_code || selectedPoid.country || selectedPoid.date_of_birth || selectedPoid.nationality)
                            ) && (
                                <div style={{ display: 'grid', gap: 3, marginBottom: 8 }}>
                                    {selectedPoid.email && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                                            <i className="ms-Icon ms-Icon--Mail" style={{ fontSize: 11, color: themeColours.textSecondary, width: 14, textAlign: 'center', flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#D1D5DB' : '#334155', wordBreak: 'break-word' as const, lineHeight: 1.4 }}>{selectedPoid.email}</span>
                                        </div>
                                    )}
                                    {selectedPoid.best_number && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                                            <i className="ms-Icon ms-Icon--Phone" style={{ fontSize: 11, color: themeColours.textSecondary, width: 14, textAlign: 'center', flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#D1D5DB' : '#334155', lineHeight: 1.4 }}>{selectedPoid.best_number}</span>
                                        </div>
                                    )}
                                    {(selectedPoid.date_of_birth || selectedPoid.nationality) && (
                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                            {selectedPoid.date_of_birth && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                                                    <i className="ms-Icon ms-Icon--EventDate" style={{ fontSize: 11, color: themeColours.textSecondary, width: 14, textAlign: 'center', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#D1D5DB' : '#334155', lineHeight: 1.4 }}>
                                                        {new Date(selectedPoid.date_of_birth).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            )}
                                            {selectedPoid.nationality && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                                                    <i className="ms-Icon ms-Icon--Globe" style={{ fontSize: 11, color: themeColours.textSecondary, width: 14, textAlign: 'center', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#D1D5DB' : '#334155', lineHeight: 1.4 }}>
                                                        {selectedPoid.nationality}
                                                        {((selectedPoid as any).nationality_iso || (selectedPoid as any).country_code) &&
                                                            ` (${(selectedPoid as any).nationality_iso || (selectedPoid as any).country_code})`}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {(selectedPoid.house_building_number || selectedPoid.street || selectedPoid.city || selectedPoid.post_code || selectedPoid.country) && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                                            <i className="ms-Icon ms-Icon--POI" style={{ fontSize: 11, color: themeColours.textSecondary, width: 14, textAlign: 'center', flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, fontWeight: 500, color: isDarkMode ? '#D1D5DB' : '#334155', lineHeight: 1.4 }}>
                                                {[selectedPoid.house_building_number, selectedPoid.street, selectedPoid.city, selectedPoid.post_code, selectedPoid.country].filter(Boolean).join(', ')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Company details and address for company clients */}
                            {selectedPoid && (selectedPoid.company_name || selectedPoid.company_number) && (
                                <div style={{ 
                                    fontSize: 13.5, 
                                    color: themeColours.textSecondary,
                                    marginTop: 8,
                                    marginBottom: 8
                                }}>
                                    {/* Company name and number */}
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8,
                                            marginBottom: 8
                                        }}>
                                        <i className="ms-Icon ms-Icon--BuildingRegular" style={{ fontSize: 12, color: themeColours.textSecondary }} />
                                        <span style={{ fontWeight: 600 }}>
                                            {selectedPoid.company_name}
                                            {selectedPoid.company_number && ` (${selectedPoid.company_number})`}
                                        </span>
                                    </div>
                                    
                                    {/* Company address if different from personal address */}
                                    {(selectedPoid.company_house_building_number || selectedPoid.company_street || selectedPoid.company_city || selectedPoid.company_post_code) && (
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'flex-start', 
                                            gap: 8,
                                            fontSize: 12.5,
                                            color: themeColours.textSecondary
                                        }}>
                                            <i className="ms-Icon ms-Icon--POI" style={{ fontSize: 11, color: themeColours.textSecondary, marginTop: 2 }} />
                                            <span>{[
                                                selectedPoid.company_house_building_number,
                                                selectedPoid.company_street,
                                                selectedPoid.company_city,
                                                selectedPoid.company_county,
                                                selectedPoid.company_post_code,
                                                selectedPoid.company_country
                                            ].filter(Boolean).join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {/* Instruction ref and client type - top right */}
                        <div style={{ 
                            flexShrink: 0,
                            textAlign: 'right',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6
                        }}>
                            {instructionRef && (
                                <div style={{ 
                                    fontSize: 12.5, 
                                    color: themeColours.textSecondary,
                                    fontWeight: 700,
                                    letterSpacing: 0.2
                                }}>
                                    {instructionRef}
                                </div>
                            )}
                            {inferredType && (
                                <div style={{ 
                                    fontSize: 11.5, 
                                    color: themeColours.textSecondary,
                                    fontWeight: 600,
                                    opacity: 0.9,
                                    letterSpacing: 0.1
                                }}>
                                    {inferredType}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ID Verification - InlineWorkbench structure */}
                {selectedPoids.length > 0 && (
                    <div style={{
                        margin: '0 -24px -20px -24px',
                        padding: '14px 24px 18px 24px',
                    }}>
                        {(() => {
                            const uniqueOrMultiple = (values: Array<string | undefined | null>): string => {
                                const cleaned = values
                                    .map(v => String(v ?? '').trim())
                                    .filter(v => v && v !== '—');
                                const unique = Array.from(new Set(cleaned));
                                if (unique.length === 0) return '—';
                                if (unique.length === 1) return unique[0];
                                return 'Multiple';
                            };

                            const passportNumber = uniqueOrMultiple(selectedPoids.map(p => (p as any).passport_number));
                            const drivingLicenceNumber = uniqueOrMultiple(selectedPoids.map(p => (p as any).drivers_license_number));
                            const submitted = uniqueOrMultiple(selectedPoids.map(p => (p as any).submission_date));
                            const expiry = uniqueOrMultiple(selectedPoids.map(p => (p as any).check_expiry));
                            const checkId = uniqueOrMultiple(selectedPoids.map(p => (p as any).check_id));

                            const displayClientName = (clientAsOnFile || '').trim()
                              ? clientAsOnFile
                              : (selectedPoid?.first ? `${selectedPoid.first} ${selectedPoid.last}`.trim() : 'Client');

                            return (
                                <IdentityConfirmationCard
                                    clientName={displayClientName}
                                    instructionRef={instructionRef}
                                    verification={{
                                        id: (aggId || 'pending') as any,
                                        pep: (aggPep || 'pending') as any,
                                        address: (aggAddr || 'pending') as any,
                                    }}
                                    documentProvided={{
                                        passportNumber,
                                        drivingLicenceNumber,
                                    }}
                                    metaRowItems={[
                                        submitted !== '—' ? { label: 'Submitted', value: submitted } : null,
                                        expiry !== '—' ? { label: 'Expires', value: expiry } : null,
                                        checkId !== '—' ? { label: 'Check ID', value: checkId, monospace: true } : null,
                                    ].filter(Boolean) as any}
                                    hasMultipleClients={selectedPoids.length > 1}
                                    clientCount={selectedPoids.length}
                                    showConfirmation={false}
                                    onRunIdCheck={onRunIdCheck}
                                    demoModeEnabled={demoModeEnabled}
                                    onDemoEidResult={onDemoEidResult as any}
                                />
                            );
                        })()}
                    </div>
                )}
            </div>
        );
    };

    // If instructed to hide selection UI, show banner only
    if (hideClientSections) {
        return (
            <Stack tokens={{ childrenGap: 16 }}>
                {renderSelectionSummary()}
            </Stack>
        );
    }
    const onlyShowPreselected = preselectedPoidIds?.length === 1 && filteredPoidData.length === 1;
    const displayPoidData = filteredPoidData;

    return (
        <Stack tokens={{ childrenGap: 16 }}>
            {/* Client Type Question Section */}
            <div className="client-type-selection" style={{ width: '100%', margin: 0, padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <div style={{ padding: 4, background: 'transparent' }}>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    marginBottom: 12 
                }}>
                    <i className="ms-Icon ms-Icon--Contact" style={{ 
                        fontSize: 16, 
                        color: '#3690CE' 
                    }} />
                    <span style={{ 
                        fontSize: 16, 
                        fontWeight: 600, 
                        color: '#0F172A' 
                    }}>
                        What type of client is this matter for?
                    </span>
                </div>
                <div className="client-details-contact-bigrow" style={{ margin: '8px 0 12px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[ 
                        { type: 'Individual', icon: 'Contact' },
                        { type: 'Company', icon: 'CityNext' },
                        { type: 'Multiple Individuals', icon: 'People' },
                        { type: 'Existing Client', icon: 'ContactHeart' }
                    ].map(({ type, icon }) => {
                        const isActive = pendingClientType === type;
                        return (
                            <button
                                key={type}
                                className={`client-details-contact-bigbtn client-type-icon-btn${isActive ? ' active' : ''}`}
                                type="button"
                                onClick={() => {
                                    // Only trigger change if type is actually changing
                                    if (pendingClientType !== type) {
                                        // Multiple Individuals and Company allow unlimited selections, others are more restrictive
                                        const allowsUnlimitedSelections = type === 'Multiple Individuals' || type === 'Company';
                                        setPendingClientType(type);
                                        if (onClientTypeChange) {
                                            onClientTypeChange(type, !allowsUnlimitedSelections);
                                        }
                                    }
                                }}
                                aria-pressed={isActive}
                                style={{
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '12px 14px',
                                    border: `1px solid ${isActive ? '#3690CE' : themeColours.border}`,
                                    borderRadius: 0,
                                    background: isActive 
                                        ? (isDarkMode ? '#3690CE18' : '#3690CE10')
                                        : themeColours.cardBg,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    minHeight: '70px',
                                    minWidth: '120px',
                                    boxShadow: 'none',
                                    outline: 'none',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.borderColor = '#3690CE';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.borderColor = isDarkMode ? '#374151' : '#CBD5E1';
                                    }
                                }}
                            >
                                <i 
                                    className={`ms-Icon ms-Icon--${icon}`} 
                                    style={{ 
                                        fontSize: 24, 
                                        color: isActive ? '#3690CE' : (isDarkMode ? '#9CA3AF' : '#475569'),
                                        marginBottom: 6,
                                        transition: 'color 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }} 
                                />
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 500,
                                        color: isActive ? '#3690CE' : (isDarkMode ? '#9CA3AF' : '#475569'),
                                        textAlign: 'center',
                                        lineHeight: 1.2,
                                        transition: 'color 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                >
                                    {type}
                                </span>
                            </button>
                        );
                    })}
                </div>
                
                {/* Removed helper text for selection rules for cleaner UI */}
                
            {/* POID list section */}
            {/* Unified Client Selection section: header with chevron + collapsible content */}
                <div style={{ marginTop: 32 }}>
                    <div
                        style={{
                            border: `1px solid ${isDarkMode ? '#374151' : '#CBD5E1'}`,
                            borderRadius: 2,
                            background: isDarkMode ? '#0F172A' : '#FFFFFF',
                            boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.04)'
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setIsClientSectionOpen(o => !o)}
                            aria-expanded={isClientSectionOpen}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                padding: '0 14px 0 0',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {renderSelectionSummary()}
                            </div>
                            <i
                                className="ms-Icon ms-Icon--ChevronDown"
                                style={{
                                    fontSize: 14,
                                    color: '#3690CE',
                                    transition: 'transform 0.2s ease',
                                    transform: isClientSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                                }}
                            />
                        </button>

                        <PoidSelectionTransition show={!!pendingClientType && isClientSectionOpen}>
                            <div style={{ padding: '0 14px 14px 14px' }}>
                                {pendingClientType === 'Multiple Individuals' && (
                                    <div style={{ margin: '8px 0' }}>
                                        <div className="question-banner">Confirm Client as on File</div>
                                        <input
                                            type="text"
                                            value={clientAsOnFile}
                                            onChange={e => setClientAsOnFile(e.target.value)}
                                            style={{ 
                                                width: '100%', 
                                                padding: '8px 12px', 
                                                height: '38px',
                                                boxSizing: 'border-box',
                                                background: clientAsOnFile ? "#3690CE22" : themeColours.bg,
                                                color: "#061733",
                                                border: clientAsOnFile ? "1px solid #3690CE" : `1px solid ${themeColours.border}`,
                                                borderRadius: 0,
                                                boxShadow: 'none',
                                                transition: "background 0.2s, color 0.2s, border 0.2s",
                                                outline: "none",
                                                fontSize: "14px"
                                            }}
                                            placeholder="Enter client name as on file"
                                        />
                                    </div>
                                )}

                                {/* Show POID selection only after client type is chosen */}
                                <PoidSelectionTransition show={!!pendingClientType}>
                                    {pendingClientType && (
                                        <>
                                            {/* POID Grid - Compact layout when selections are made */}
                                            <div 
                                                style={{ 
                                                    width: '100%',
                                                    overflow: 'visible',
                                                    border: `1px solid ${isDarkMode ? '#374151' : '#CBD5E1'}`,
                                                    borderRadius: 0,
                                                    background: isDarkMode ? '#111827' : '#FAFBFC',
                                                    transition: 'all 0.4s ease-out',
                                                    padding: '16px',
                                                }} 
                                                className="poid-grid" 
                                                ref={poidGridRef as any}
                                            >
                                                {(() => {
                                                    const hasSelection = effectiveSelectedIds.length > 0;
                                                    
                                                    // Filter POIDs based on client type
                                                    const filteredData = displayPoidData.filter((poid) => {
                                                        const isCompany = !!(
                                                            poid.company_name ||
                                                            poid.company_number
                                                        );
                                                        if (pendingClientType === 'Individual') {
                                                            return !isCompany;
                                                        } else if (pendingClientType === 'Company') {
                                                            // Two-stage selection for Company type
                                                            const currentSelectedPoids = effectiveSelectedIds.map(id => 
                                                                displayPoidData.find(p => p.poid_id === id)
                                                            ).filter(Boolean);
                                                            
                                                            const hasCompanySelected = currentSelectedPoids.some(p => 
                                                                p && !!(p.company_name || p.company_number)
                                                            );
                                                            
                                                            if (!hasCompanySelected) {
                                                                // Stage 1: Show only companies until one is selected
                                                                return isCompany;
                                                            } else {
                                                                // Stage 2: Show only individuals for director selection
                                                                return !isCompany;
                                                            }
                                                        } else if (pendingClientType === 'Multiple Individuals') {
                                                            // Show only individuals for multiple selection
                                                            return !isCompany;
                                                        }
                                                        return true; // Existing Client shows all
                                                    });

                                                    // Special handling for Company type two-stage selection
                                                    let cardsToShow;
                                                    if (pendingClientType === 'Company') {
                                                        const currentSelectedPoids = effectiveSelectedIds.map(id => 
                                                            displayPoidData.find(p => p.poid_id === id)
                                                        ).filter(Boolean);
                                                        
                                                        const hasCompanySelected2 = currentSelectedPoids.some(p => 
                                                            p && !!(p.company_name || p.company_number)
                                                        );
                                                        
                                                        if (hasCompanySelected2) {
                                                            // Stage 2: Show only available directors (hide the selected company from this view)
                                                            cardsToShow = filteredData.slice(0, visiblePoidCount);
                                                        } else {
                                                            // Stage 1: Show only available companies
                                                            cardsToShow = filteredData.slice(0, visiblePoidCount);
                                                        }
                                                    } else {
                                                        // For other client types, use different logic based on whether multiple selection is allowed
                                                        if (pendingClientType === 'Multiple Individuals') {
                                                            // Always show all available options for multiple selection
                                                            cardsToShow = filteredData.slice(0, visiblePoidCount);
                                                        } else {
                                                            // Single selection types: show only selected when there's a selection
                                                            cardsToShow = hasSelection 
                                                                ? filteredData.filter(poid => effectiveSelectedIds.includes(poid.poid_id))
                                                                : filteredData.slice(0, visiblePoidCount);
                                                        }
                                                    }

                                                    return cardsToShow.map((poid) => {
                                                        const isSelected = effectiveSelectedIds.includes(poid.poid_id);
                                                        const singlePreselected = onlyShowPreselected && displayPoidData.length === 1;
                                                        
                                                        return (
                                                            <div 
                                                                key={poid.poid_id} 
                                                                onClick={() => {
                                                                    userInteractedRef.current = true;
                                                                    handlePoidClick(poid);
                                                                }} 
                                                                role="button" 
                                                                tabIndex={0}
                                                                style={{
                                                                    opacity: 1, // Always full opacity for visible cards
                                                                    transform: 'translateY(0)',
                                                                    transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
                                                                    animation: 'fadeInUp 0.4s ease-out',
                                                                    pointerEvents: 'auto',
                                                                    filter: 'none',
                                                                    gridColumn: singlePreselected ? 'span 2' : undefined,
                                                                }}
                                                            >
                                                                <PoidCard 
                                                                    poid={poid} 
                                                                    selected={isSelected} 
                                                                    onClick={() => {
                                                                        userInteractedRef.current = true;
                                                                        handlePoidClick(poid);
                                                                    }} 
                                                                    teamData={teamData}
                                                                    instructionRefOverride={instructionRef}
                                                                    matterRefOverride={matterRef}
                                                                    companyName={(() => {
                                                                        if (pendingClientType === 'Company') {
                                                                            if (poid.company_name) return poid.company_name;
                                                                            return '';
                                                                        }
                                                                        return undefined;
                                                                    })()}
                                                                />
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </>
                                    )}
                                </PoidSelectionTransition>
                            </div>
                        </PoidSelectionTransition>
                    </div>
                </div>
            </div>
        </div>
        
    </Stack>
    );
};

export default PoidSelectionStep;
