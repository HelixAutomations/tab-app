//
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'; // invisible change
// invisible change 2.2
import { PrimaryButton, Dialog, DialogType, DialogFooter, DefaultButton, IconButton } from '@fluentui/react';
import MinimalSearchBox from './MinimalSearchBox';
import { POID, TeamData, UserData, InstructionData } from '../../../app/functionality/types';
import ClientDetails from '../ClientDetails';
import ClientHub from '../ClientHub';
// StepWrapper removed - Step 2 is now inline
import '../../../app/styles/NewMatters.css';
import '../../../app/styles/MatterOpeningCard.css';
import './MatterOpeningResponsive.css';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import { useNavigatorActions } from '../../../app/functionality/NavigatorContext';
import FilterBanner from '../../../components/filter/FilterBanner';
import {
    practiceAreasByArea,
    getGroupColor,
    partnerOptions as defaultPartners,
} from './config';
import localUserData from '../../../localData/localUserData.json';

import PoidSelectionStep from './PoidSelectionStep';
import OpponentDetailsStep from './OpponentDetailsStep';
import ModernMultiSelect from './ModernMultiSelect';
// BudgetStep removed - inlined into Step 2

import { useToast } from '../../../components/feedback/ToastProvider';
import { CompletionProvider } from './CompletionContext';
import ProcessingSection, { ProcessingStep } from './ProcessingSection';
import { processingActions, initialSteps, registerClientIdCallback, registerMatterIdCallback, registerOperationObserver, setCurrentActionIndex, resetMatterTraceId } from './processingActions';
import idVerifications from '../../../localData/localIdVerifications.json';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../../../app/styles/ButtonStyles';
import { clearMatterOpeningDraft, completeMatterOpening } from '../../../app/functionality/matterOpeningUtils';

// Local implementation of useDraftedState (draft persistence DISABLED to remove resume complexity)
const DISABLE_DRAFT_PERSISTENCE = true;
function useDraftedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const storageKey = `matterOpeningDraft_${key}`;
    const [state, setState] = useState<T>(() => {
        if (DISABLE_DRAFT_PERSISTENCE) return initialValue;
        try {
            const item = localStorage.getItem(storageKey);
            if (!item) return initialValue;
            const parsed = JSON.parse(item);
            if (key === 'selectedDate') {
                if (parsed === null) return null as any;
                if (typeof parsed === 'string' || typeof parsed === 'number') {
                    const d = new Date(parsed);
                    return isNaN(d.getTime()) ? initialValue : (d as any);
                }
            }
            return parsed;
        } catch { return initialValue; }
    });
    useEffect(() => {
        if (DISABLE_DRAFT_PERSISTENCE) return; // no-op when disabled
        try {
            if (key === 'selectedDate' && state instanceof Date) {
                localStorage.setItem(storageKey, JSON.stringify(state.toISOString()));
            } else {
                localStorage.setItem(storageKey, JSON.stringify(state));
            }
        } catch { /* ignore */ }
    }, [state, storageKey, key]);
    return [state, setState];
}

interface FlatMatterOpeningProps {
    poidData?: POID[];
    setPoidData: React.Dispatch<React.SetStateAction<POID[]>>;
    teamData?: TeamData[] | null;
    userInitials: string;
    userData?: UserData[] | null;
    instructionRef?: string;
    clientId?: string;
    feeEarner?: string;
    stage?: string;
    matterRef?: string;
    hideClientSections?: boolean;
    initialClientType?: string;
    preselectedPoidIds?: string[];
    instructionPhone?: string;
    /**
     * Preferred source for Select Client cards: pass records directly from the
     * new Instructions DB (instructions table). When provided, the Select Client
     * grid will be sourced exclusively from these records (mapped to POID shape),
     * while legacy POID/idVerification fallback remains available for other flows.
     */
    instructionRecords?: unknown[];
    /**
     * Optional callback triggered when the user chooses to draft the CCL
     * immediately after opening the matter.
     */
    onDraftCclNow?: (matterId: string) => void;
    /**
     * Optional callback triggered when the user wants to go back/close the matter opening workflow.
     * Should navigate back to the instructions page instead of using browser history.
     */
    onBack?: () => void;
    /**
     * Optional callback triggered when matter is successfully opened.
     * Returns the opened matter ID for parent component feedback.
     */
    onMatterSuccess?: (matterId: string) => void;
    /** Optional callback to trigger ID verification when pending */
    onRunIdCheck?: () => void;
    /** Whether the app is in demo mode — enables fake processing outcomes */
    demoModeEnabled?: boolean;
}

const FlatMatterOpening: React.FC<FlatMatterOpeningProps> = ({

    poidData,
    setPoidData,
    teamData,
    userInitials,
    userData,
    instructionRef = '',
    clientId: initialClientId = '',
    feeEarner,
    stage = 'New Matter',
    matterRef,
    hideClientSections = false,
    initialClientType = '',
    preselectedPoidIds = [],
    instructionPhone,
    instructionRecords,
    onDraftCclNow,
    onBack,
    onMatterSuccess,
    onRunIdCheck,
    demoModeEnabled = false,
}) => {
    // Dark mode support
    const { isDarkMode } = useTheme();
    
    // Toast notifications
    const { showToast, hideToast } = useToast();
    
    // Navigator context for setting custom header content
    const { setContent } = useNavigatorActions();
    
    // Responsive layout system
    const idExpiry = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toLocaleDateString('en-GB');
    }, []); // invisible change // invisible change

    const [clientId, setClientId] = useState<string | null>(initialClientId || null);
    const [matterIdState, setMatterIdState] = useState<string | null>(matterRef || null);
    // Meta chip expansion state (date/user detail panel)
    const [openMeta, setOpenMeta] = useState<'date' | 'user' | null>(null);
    useEffect(() => {
        registerClientIdCallback(setClientId);
        registerMatterIdCallback((id) => {
            setMatterIdState(id);
            setOpenedMatterId(id);
            // Notify parent that matter was successfully opened
            if (id && onMatterSuccess) {
                onMatterSuccess(id);
            }
        });
        return () => {
            registerClientIdCallback(null);
            registerMatterIdCallback(null);
        };
    }, [onMatterSuccess]);

    const showPoidSelection = !instructionRef;

    const defaultPoidData: POID[] = useMemo(() => {
        // Step A: Build a robust POID list from provided poidData (preferred) or legacy idVerifications
        const basePoids = ((poidData && poidData.length > 0)
            ? poidData
            : (idVerifications as any[]).map((v) => ({
                poid_id: String(v.InternalId),
                first: v.FirstName,
                last: v.LastName,
                email: v.Email,
                best_number: (v as any).Phone || '',
                nationality: v.Nationality,
                nationality_iso: v.NationalityAlpha2,
                date_of_birth: v.DOB,
                passport_number: v.PassportNumber,
                drivers_license_number: v.DriversLicenseNumber,
                house_building_number: v.HouseNumber,
                street: v.Street,
                city: v.City,
                county: v.County,
                post_code: v.Postcode,
                country: v.Country,
                country_code: v.CountryCode,
                company_name: v.company_name || v.CompanyName,
                company_number: v.company_number || v.CompanyNumber,
                company_house_building_number: v.company_house_building_number || v.CompanyHouseNumber,
                company_street: v.company_street || v.CompanyStreet,
                company_city: v.company_city || v.CompanyCity,
                company_county: v.company_county || v.CompanyCounty,
                company_post_code: v.company_post_code || v.CompanyPostcode,
                company_country: v.company_country || v.CompanyCountry,
                company_country_code: v.company_country_code || v.CompanyCountryCode,
                // Electronic ID verification fields
                stage: v.stage,
                check_result: v.EIDOverallResult,
                pep_sanctions_result: v.PEPAndSanctionsCheckResult,
                address_verification_result: v.AddressVerificationResult,
                check_expiry: v.CheckExpiry,
                check_id: v.EIDCheckId,
                poc: v.poc,
                prefix: v.prefix,
                type: v.type,
                client_id: v.ClientId,
                matter_id: v.MatterId,
                InstructionRef: v.InstructionRef,
            }))
        ) as POID[];

        // Index basePoids by common join keys for quick lookup
        const byEmail = new Map<string, POID>();
        const byInstRef = new Map<string, POID[]>();
        basePoids.forEach((p) => {
            const emailKey = (p.email || (p as any).Email || '').toLowerCase();
            if (emailKey) byEmail.set(emailKey, p);
            const inst = (p as any).InstructionRef || (p as any).instruction_ref;
            if (inst) {
                const arr = byInstRef.get(String(inst)) || [];
                arr.push(p);
                byInstRef.set(String(inst), arr);
            }
        });

        // Step B: If instruction records provided, merge additional metadata onto matching basePoids
        if (Array.isArray(instructionRecords) && instructionRecords.length > 0) {
            const merged: POID[] = [];
            (instructionRecords as any[]).forEach((inst) => {
                const instRef = String(inst.InstructionRef || '');
                const emailKey = String(inst.Email || '').toLowerCase();
                // Extract lead verification from idVerifications array for field fallbacks
                const idVerifs = Array.isArray(inst.idVerifications) ? inst.idVerifications : [];
                const leadVerif = idVerifs.find((v: any) => v.IsLeadClient) || idVerifs[0] || null;
                // Prefer match by InstructionRef, fall back to email
                let match: POID | undefined = undefined;
                if (instRef && byInstRef.has(instRef)) {
                    // If multiple, pick the one that also matches email when available
                    const candidates = byInstRef.get(instRef)!;
                    match = emailKey ? candidates.find(c => (c.email || '').toLowerCase() === emailKey) || candidates[0] : candidates[0];
                } else if (emailKey) {
                    match = byEmail.get(emailKey);
                }

                if (match) {
                    // Attach extra fields from instruction to the matched POID (without changing poid_id)
                    merged.push({
                        ...match,
                        InstructionRef: instRef || (match as any).InstructionRef,
                        first: match.first || inst.FirstName || inst.Forename,
                        last: match.last || inst.LastName || inst.Surname,
                        best_number: match.best_number || inst.Phone || inst.phone,
                        company_name: match.company_name || inst.CompanyName,
                        company_number: match.company_number || inst.CompanyNumber,
                        // Personal details from instruction if not already on POID
                        date_of_birth: match.date_of_birth || inst.DOB || inst.DateOfBirth,
                        nationality: (match as any).nationality || inst.Nationality,
                        passport_number: match.passport_number || inst.PassportNumber,
                        // Address fields from instruction if not already on POID
                        house_building_number: match.house_building_number || inst.HouseNumber,
                        street: match.street || inst.Street,
                        city: match.city || inst.City,
                        county: match.county || inst.County,
                        post_code: match.post_code || inst.Postcode || inst.PostCode,
                        country: match.country || inst.Country,
                        // Include verification fields from instruction if not present in matched POID
                        check_result: match.check_result || inst.EIDOverallResult || leadVerif?.EIDOverallResult,
                        pep_sanctions_result: match.pep_sanctions_result || inst.PEPAndSanctionsCheckResult || inst.PEPResult || leadVerif?.PEPAndSanctionsCheckResult || leadVerif?.PEPResult,
                        address_verification_result: match.address_verification_result || inst.AddressVerificationResult || inst.AddressVerification || leadVerif?.AddressVerificationResult || leadVerif?.AddressVerification,
                    } as POID);
                } else {
                    // No match in basePoids - include a minimal record for UI visibility (won't be preselected)
                    merged.push({
                        poid_id: String(instRef || inst.id || emailKey || `${inst.FirstName || inst.Forename || ''}|${inst.LastName || inst.Surname || ''}`),
                        first: inst.FirstName || inst.Forename || leadVerif?.FirstName,
                        last: inst.LastName || inst.Surname || leadVerif?.LastName,
                        email: inst.Email || inst.ClientEmail || leadVerif?.Email,
                        best_number: inst.Phone || inst.phone || inst.Phone_Number,
                        company_name: inst.CompanyName,
                        company_number: inst.CompanyNumber,
                        InstructionRef: instRef,
                        // Personal details from instruction record
                        date_of_birth: inst.DOB || inst.DateOfBirth || inst.date_of_birth,
                        nationality: inst.Nationality || inst.nationality,
                        passport_number: inst.PassportNumber || inst.passport_number,
                        // Address fields from instruction record
                        house_building_number: inst.HouseNumber || inst.house_building_number || inst.HouseBuildingNumber,
                        street: inst.Street || inst.street,
                        city: inst.City || inst.city,
                        county: inst.County || inst.county,
                        post_code: inst.Postcode || inst.PostCode || inst.post_code,
                        country: inst.Country || inst.country,
                        country_code: inst.CountryCode || inst.country_code,
                        // Company address from instruction record
                        company_house_building_number: inst.CompanyHouseNumber || inst.company_house_building_number,
                        company_street: inst.CompanyStreet || inst.company_street,
                        company_city: inst.CompanyCity || inst.company_city,
                        company_post_code: inst.CompanyPostcode || inst.company_post_code,
                        company_country: inst.CompanyCountry || inst.company_country,
                        // Include verification fields from instruction record + idVerifications fallback
                        check_result: inst.EIDOverallResult || leadVerif?.EIDOverallResult,
                        pep_sanctions_result: inst.PEPAndSanctionsCheckResult || inst.PEPResult || leadVerif?.PEPAndSanctionsCheckResult || leadVerif?.PEPResult,
                        address_verification_result: inst.AddressVerificationResult || inst.AddressVerification || leadVerif?.AddressVerificationResult || leadVerif?.AddressVerification,
                    } as POID);
                }
            });

            // Deduplicate: prefer entries that have a real numeric poid_id (from basePoids)
            const byKey = new Map<string, POID>();
            merged.concat(basePoids).forEach((p) => {
                const key = String(p.poid_id || (p.email || '').toLowerCase());
                const existing = byKey.get(key);
                if (!existing) {
                    byKey.set(key, p);
                    return;
                }
                // If one of them has more person/company detail, keep the richer one
                const richness = (x: POID) => `${x.first || ''}${x.last || ''}${x.company_name || ''}`.length;
                if (richness(p) > richness(existing)) byKey.set(key, p);
            });
            return Array.from(byKey.values());
        }

        // No instructionRecords - just return basePoids with email de-duplication
        const uniqueMap = new Map<string, POID>();
        basePoids.forEach((p) => {
            const key = (p.email || '').toLowerCase() || `${p.first?.toLowerCase() || ''}|${p.last?.toLowerCase() || ''}`;
            if (!key) return;
            const inst = (p as any).InstructionRef || (p as any).instruction_ref || '';
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, p);
                return;
            }
            const existing = uniqueMap.get(key)!;
            const existingInst = (existing as any).InstructionRef || (existing as any).instruction_ref || '';
            if (instructionRef && inst === instructionRef && existingInst !== instructionRef) {
                uniqueMap.set(key, p);
            }
        });
        return Array.from(uniqueMap.values());
    }, [instructionRecords, poidData, instructionRef]);
    
    // Filter out any invalid POID entries that might be causing issues
    const validPoidData = useMemo(() => {
        const preselected = new Set(preselectedPoidIds || []);
        return defaultPoidData.filter((poid) => {
            if (!poid) return false;
            // Always allow explicitly preselected POIDs (e.g., instruction-driven/direct entries)
            if (preselected.has(poid.poid_id)) return true;
            // Accept either a valid person (first+last not numeric) or a company-only record
            const hasPerson = Boolean(
                poid.first &&
                poid.last &&
                isNaN(Number(poid.first)) &&
                isNaN(Number(poid.last))
            );
            const hasCompany = Boolean(poid.company_name);
            return hasPerson || hasCompany;
        });
    }, [defaultPoidData, preselectedPoidIds]);
    
    // Force use of only validated local POID data
    const effectivePoidData: POID[] = validPoidData;
        
    // Debug logging removed

    const [selectedDate, setSelectedDate] = useDraftedState<Date | null>('selectedDate', null);
    // Ensure an opening date is always present (default to today on first use)
    useEffect(() => {
        if (!selectedDate) {
            setSelectedDate(new Date());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Note: additional effect to guarantee date on step change is defined after currentStep declaration
    // Developer Tools container removed as requested
    // Restore debug inspector core state (was previously earlier in file)
    const [debugInspectorOpen, setDebugInspectorOpen] = useState(false);
    const [debugActiveTab, setDebugActiveTab] = useState<'json' | 'details' | 'advanced'>('json');
    const [debugAdvancedOpen, setDebugAdvancedOpen] = useState(false);
    const [debugManualJson, setDebugManualJson] = useState('');
    // Demo processing outcome selector: 'success' | 'fail-early' | 'fail-mid' | 'fail-late'
    const [demoProcessingOutcome, setDemoProcessingOutcome] = useState<'success' | 'fail-early' | 'fail-mid' | 'fail-late'>('success');
    // Ensure client type states exist (some logic references pendingClientType)
    // Re-initialize only if not already declared above (TypeScript will error if duplicate, but patch inserts once)
    // Client type selection
    const [clientType, setClientType] = useDraftedState<string>('clientType', initialClientType || '');
    const [pendingClientType, setPendingClientType] = useDraftedState<string>('pendingClientType', initialClientType || '');
    // Core drafted form field states (restored after container removal patch)
    // For selectedPoidIds, only restore from localStorage when we have an instructionRef (instruction-based entry)
    // For direct entry, always start fresh to avoid unwanted auto-selection
    const initialSelectedPoidIds = (preselectedPoidIds.length > 0 && instructionRef) ? preselectedPoidIds : [];
    const storageKey = 'matterOpeningDraft_selectedPoidIds';
    
    const [selectedPoidIds, setSelectedPoidIds] = useState<string[]>(() => {
        if (DISABLE_DRAFT_PERSISTENCE || !instructionRef) return initialSelectedPoidIds;
        try {
            const item = localStorage.getItem(storageKey);
            if (!item) return initialSelectedPoidIds;
            return JSON.parse(item);
        } catch { return initialSelectedPoidIds; }
    });
    
    useEffect(() => {
        if (DISABLE_DRAFT_PERSISTENCE || !instructionRef) {
            // For direct entry, clear any existing localStorage to prevent contamination
            localStorage.removeItem(storageKey);
            return;
        }
        try {
            localStorage.setItem(storageKey, JSON.stringify(selectedPoidIds));
        } catch (e) {
            console.warn('Failed to save selectedPoidIds to localStorage:', e);
        }
    }, [selectedPoidIds, instructionRef]);
    const [areaOfWork, setAreaOfWork] = useDraftedState<string>('areaOfWork', '');
    const [practiceArea, setPracticeArea] = useDraftedState<string>('practiceArea', '');
    const [description, setDescription] = useDraftedState<string>('description', '');
    const [folderStructure, setFolderStructure] = useDraftedState<string>('folderStructure', '');
    const [disputeValue, setDisputeValue] = useDraftedState<string>('disputeValue', '');
    const [source, setSource] = useDraftedState<string>('source', '');
    const [referrerName, setReferrerName] = useDraftedState<string>('referrerName', '');
    const [budgetRequired, setBudgetRequired] = useDraftedState<string>('budgetRequired', 'No');
    const [budgetAmount, setBudgetAmount] = useDraftedState<string>('budgetAmount', '');
    const [budgetThreshold, setBudgetThreshold] = useDraftedState<string>('budgetThreshold', '');
    const [budgetNotifyUsers, setBudgetNotifyUsers] = useDraftedState<string>('budgetNotifyUsers', '');
    const [opponentName, setOpponentName] = useDraftedState<string>('opponentName', '');
    const [opponentEmail, setOpponentEmail] = useDraftedState<string>('opponentEmail', '');
    const [opponentSolicitorName, setOpponentSolicitorName] = useDraftedState<string>('opponentSolicitorName', '');
    const [opponentSolicitorCompany, setOpponentSolicitorCompany] = useDraftedState<string>('opponentSolicitorCompany', '');
    const [opponentSolicitorEmail, setOpponentSolicitorEmail] = useDraftedState<string>('opponentSolicitorEmail', '');
    const [noConflict, setNoConflict] = useDraftedState<boolean>('noConflict', false);
    const [opponentChoiceMade, setOpponentChoiceMade] = useDraftedState<boolean>('opponentChoiceMade', false);
    const [teamMember, setTeamMember] = useDraftedState<string>('teamMember', '');
    const [supervisingPartner, setSupervisingPartner] = useDraftedState<string>('supervisingPartner', '');
    const [originatingSolicitor, setOriginatingSolicitor] = useDraftedState<string>('originatingSolicitor', '');
    // Additional restored states
    const [clientAsOnFile, setClientAsOnFile] = useDraftedState<string>('clientAsOnFile', '');
    const [isDateCalloutOpen, setIsDateCalloutOpen] = useState(false);
    const dateButtonRef = useRef<HTMLDivElement | null>(null);

    // Demo EID override — stores temp verification result picked inline during demo
    const [demoEidOverride, setDemoEidOverride] = useState<{ id: string; pep: string; address: string } | null>(null);

    const handleDemoEidResult = React.useCallback((result: { id: string; pep: string; address: string }) => {
        setDemoEidOverride(result);
    }, []);

    // Apply demo EID override to effective POID data so the card reflects the chosen result
    const displayPoidData = React.useMemo(() => {
        if (!demoEidOverride || !demoModeEnabled) return effectivePoidData;
        return effectivePoidData.map(p => ({
            ...p,
            check_result: demoEidOverride.id,
            pep_sanctions_result: demoEidOverride.pep,
            address_verification_result: demoEidOverride.address,
        } as typeof p));
    }, [effectivePoidData, demoEidOverride, demoModeEnabled]);
    
    // Auto-select client when entering via instruction card
    useEffect(() => {
        if (instructionRef && effectivePoidData.length > 0 && selectedPoidIds.length === 0) {
            // Find POIDs that match the instruction reference
            const matchingPoids = effectivePoidData.filter((p: any) => 
                (p?.InstructionRef || p?.instruction_ref) === instructionRef
            );
            
            if (matchingPoids.length > 0) {
                const matchingIds = matchingPoids.map(p => p.poid_id);
                setSelectedPoidIds(matchingIds);
                
                // Auto-set client type based on selection
                const hasCompany = matchingPoids.some(p => !!(p.company_name || p.company_number));
                const hasIndividuals = matchingPoids.some(p => !(p.company_name || p.company_number));
                
                if (hasCompany && hasIndividuals) {
                    setPendingClientType('Company'); // Company with directors
                } else if (hasCompany) {
                    setPendingClientType('Company');
                } else if (matchingPoids.length > 1) {
                    setPendingClientType('Multiple Individuals');
                } else {
                    setPendingClientType('Individual');
                }
            }
        }
    }, [instructionRef, effectivePoidData, selectedPoidIds.length, setSelectedPoidIds, setPendingClientType]);

    // Pre-populate description + demo mode full prefill
    useEffect(() => {
        if (!instructionRef || !Array.isArray(instructionRecords)) return;

        // Description prefill (works for all modes)
        if (!description) {
            const inst = (instructionRecords as any[]).find(r => r?.InstructionRef === instructionRef);
            const svcDesc = inst?.ServiceDescription || inst?.service_description;
            if (svcDesc && typeof svcDesc === 'string' && svcDesc.trim()) {
                setDescription(svcDesc.trim());
            }
        }

        // Demo mode full prefill — set every form field for zero-friction demo
        if (demoModeEnabled) {
            // Matter details
            if (!areaOfWork) setAreaOfWork('Commercial');
            if (!practiceArea) setPracticeArea('Business Contract Dispute');
            if (!folderStructure) setFolderStructure('Default / Commercial');
            if (!disputeValue) setDisputeValue('Less than £10k');
            if (!source) setSource('search');
            if (!selectedDate) setSelectedDate(new Date());

            // Opponent — realistic demo data
            if (!opponentName) setOpponentName('Acme Industries Ltd');
            if (!opponentFirst) setOpponentFirst('James');
            if (!opponentLast) setOpponentLast('Crawford');
            if (!opponentEmail) setOpponentEmail('j.crawford@acme-industries.co.uk');
            if (!opponentChoiceMade) setOpponentChoiceMade(true);
            if (!noConflict) setNoConflict(true);

            // Team — auto-defaults handle teamMember + originatingSolicitor from logged-in user
            // Supervising partner uses first names only (from partnerOptionsList)
            if (!supervisingPartner) setSupervisingPartner('Luke');
            if (!clientAsOnFile) setClientAsOnFile('Test Client');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instructionRef, demoModeEnabled]);
    
    // --- Restored original team option sourcing logic (full active team) ---
    const defaultPartnerOptions = defaultPartners; // fallback partner list

    // helpers
    const getFullName = (t: unknown): string => {
        const rec = t as any;
        const full = rec?.['Full Name'] || `${rec?.First || ''} ${rec?.Last || ''}`.trim();
        return String(full || '').trim();
    };
    const getFirstName = (t: unknown): string => {
        const rec = t as any;
        const first = rec?.First || rec?.first;
        if (first) return String(first).trim();
        const full = rec?.['Full Name'] || rec?.FullName || '';
        if (full) return String(full).trim().split(/\s+/)[0] || '';
        return '';
    };

    const activeTeam = useMemo(() => {
        if (!teamData) return [] as any[];
        return teamData.filter((t: any) => String(t?.status ?? t?.Status ?? '').toLowerCase() === 'active');
    }, [teamData]);

    const partnerOptionsList = useMemo(() => {
        const partnersFirst = activeTeam
            .filter((t: any) => {
                const role = String(t?.Role || '').toLowerCase();
                return role === 'partner' || role === 'senior partner';
            })
            .map(getFirstName)
            .filter(Boolean);
        if (partnersFirst.length) return partnersFirst;
        const defaultFirst = (defaultPartnerOptions || [])
            .map((n: string) => String(n || '').trim().split(/\s+/)[0])
            .filter(Boolean);
        return defaultFirst;
    }, [activeTeam, defaultPartnerOptions]);

    const teamMemberOptions = useMemo(() => {
        return activeTeam.map(getFullName).filter(Boolean);
    }, [activeTeam]);

    const solicitorOptions = useMemo(() => {
        const opts = activeTeam.map(getFullName).filter(Boolean);
        if (opts.length === 0) {
            console.warn('[FlatMatterOpening] solicitorOptions empty -- teamData:', teamData ? `${teamData.length} items` : 'null', '| activeTeam:', activeTeam.length);
        }
        return opts;
    }, [activeTeam, teamData]);

    // Area of work  - „¢ colour map (shared by AOW buttons and practice area select)
    const aowColorMap: Record<string, string> = { Commercial: colours.blue, Property: colours.green, Construction: colours.orange, Employment: colours.yellow };
    const aowColor = aowColorMap[areaOfWork] || colours.highlight;

    const defaultTeamMember = useMemo(() => {
        if (activeTeam && activeTeam.length > 0) {
            const found = activeTeam.find((t: any) => String(t?.Initials || '').toLowerCase() === userInitials.toLowerCase());
            if (found) return getFullName(found);
            return getFullName(activeTeam[0]);
        }
        return '';
    }, [activeTeam, userInitials]);

    // Ensure drafted states pick up restored defaults
    useEffect(() => {
        setTeamMember(prev => (prev ? prev : defaultTeamMember));
        setOriginatingSolicitor(prev => (prev ? prev : defaultTeamMember));
    }, [defaultTeamMember]);

    // Initialize supervising partner with first available partner
    useEffect(() => {
        if (partnerOptionsList.length > 0 && !supervisingPartner) {
            // Try to find current user if they're a partner, otherwise use first partner
            const currentUserFullName = defaultTeamMember;
            const currentUserPartner = partnerOptionsList.find(partner => 
                currentUserFullName.toLowerCase().includes(partner.toLowerCase())
            );
            setSupervisingPartner(currentUserPartner || partnerOptionsList[0]);
        }
    }, [partnerOptionsList, supervisingPartner, defaultTeamMember, setSupervisingPartner]);
    const [debugManualPasteOpen, setDebugManualPasteOpen] = useState(false);
    
    // Workbench states
    const [workbenchMode, setWorkbenchMode] = useState(false);
    const [supportPanelOpen, setSupportPanelOpen] = useState(false);
    const [supportMessage, setSupportMessage] = useState('');
    const [supportCategory, setSupportCategory] = useState<'technical' | 'process' | 'data'>('technical');
    const [supportSending, setSupportSending] = useState(false);
    const [reportDelivered, setReportDelivered] = useState(false);
    
    // Debug states shared by unified inspector
    const [debugJsonInput, setDebugJsonInput] = useState('');
    const [debugValidation, setDebugValidation] = useState<{
        isValid: boolean;
        suggestions: string[];
        warnings: string[];
        predictions: { step: string; willPass: boolean; reason: string }[];
    } | null>(null);
    
    // If preselectedPoidIds is provided AND we have an instructionRef, set the initial activePoid to the first matching POID
    useEffect(() => {
        if (preselectedPoidIds && preselectedPoidIds.length > 0 && effectivePoidData.length > 0 && instructionRef) {
            // Only set if not already set and we're entering via instruction (not global action)
            setSelectedPoidIds((prev) => (prev.length === 0 ? preselectedPoidIds : prev));
            const found = effectivePoidData.find((p) => p.poid_id === preselectedPoidIds[0]);
            setActivePoid((prev) => (prev == null ? found || null : prev));
        }
        // Only run on mount or when preselectedPoidIds/instructionRef changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preselectedPoidIds, effectivePoidData, instructionRef]);

    

    // Opponent fields
    const [opponentTitle, setOpponentTitle] = useDraftedState<string>('opponentTitle', '');
    const [opponentFirst, setOpponentFirst] = useDraftedState<string>('opponentFirst', '');
    const [opponentLast, setOpponentLast] = useDraftedState<string>('opponentLast', '');
    const [opponentPhone, setOpponentPhone] = useDraftedState<string>('opponentPhone', '');
    const [opponentHouseNumber, setOpponentHouseNumber] = useDraftedState<string>('opponentHouseNumber', '');
    const [opponentStreet, setOpponentStreet] = useDraftedState<string>('opponentStreet', '');
    const [opponentCity, setOpponentCity] = useDraftedState<string>('opponentCity', '');
    const [opponentCounty, setOpponentCounty] = useDraftedState<string>('opponentCounty', '');
    const [opponentPostcode, setOpponentPostcode] = useDraftedState<string>('opponentPostcode', '');
    const [opponentCountry, setOpponentCountry] = useDraftedState<string>('opponentCountry', '');
    const [opponentHasCompany, setOpponentHasCompany] = useDraftedState<boolean>('opponentHasCompany', false);
    const [opponentCompanyName, setOpponentCompanyName] = useDraftedState<string>('opponentCompanyName', '');
    const [opponentCompanyNumber, setOpponentCompanyNumber] = useDraftedState<string>('opponentCompanyNumber', '');
    const [opponentType, setOpponentType] = useDraftedState<string>('opponentType', '');
    
    // Track which opponent sections are enabled by the user
    const [visibleSections] = useDraftedState<{
        opponent: { company: boolean; name: boolean; contact: boolean; address: boolean; }
    }>('visibleSections', {
        opponent: { company: false, name: false, contact: false, address: false }
    });
    // Solicitor fields
    const [solicitorTitle, setSolicitorTitle] = useDraftedState<string>('solicitorTitle', '');
    const [solicitorFirst, setSolicitorFirst] = useDraftedState<string>('solicitorFirst', '');
    const [solicitorLast, setSolicitorLast] = useDraftedState<string>('solicitorLast', '');
    const [solicitorPhone, setSolicitorPhone] = useDraftedState<string>('solicitorPhone', '');
    const [solicitorHouseNumber, setSolicitorHouseNumber] = useDraftedState<string>('solicitorHouseNumber', '');
    const [solicitorStreet, setSolicitorStreet] = useDraftedState<string>('solicitorStreet', '');
    const [solicitorCity, setSolicitorCity] = useDraftedState<string>('solicitorCity', '');
    const [solicitorCounty, setSolicitorCounty] = useDraftedState<string>('solicitorCounty', '');
    const [solicitorPostcode, setSolicitorPostcode] = useDraftedState<string>('solicitorPostcode', '');
    const [solicitorCountry, setSolicitorCountry] = useDraftedState<string>('solicitorCountry', '');
    const [solicitorCompanyNumber, setSolicitorCompanyNumber] = useDraftedState<string>('solicitorCompanyNumber', '');

    // Summary review confirmation state
    const [summaryConfirmed, setSummaryConfirmed] = useDraftedState<boolean>('summaryConfirmed', false);
    // Acknowledgement checkbox for formal confirmation (not persisted)
    const [confirmAcknowledge, setConfirmAcknowledge] = useState<boolean>(false);
    // Track if edits were made after confirmation
    const [editsAfterConfirmation, setEditsAfterConfirmation] = useState<boolean>(false);

    // Track original values to detect user changes vs placeholders
    const [originalValues] = useState(() => ({
        opponentCompanyName,
        opponentTitle,
        opponentFirst,
        opponentLast,
        opponentEmail,
        opponentPhone,
        opponentHouseNumber,
        opponentStreet,
        opponentCity,
        opponentCounty,
        opponentPostcode,
        opponentCountry,
        opponentSolicitorCompany,
        solicitorFirst,
        solicitorLast,
        opponentSolicitorEmail,
        solicitorPhone,
        solicitorHouseNumber,
        solicitorStreet,
        solicitorCity,
        solicitorCounty,
        solicitorPostcode,
        solicitorCountry
    }));

    // Helper function to check if a field has been changed from its original value
    const hasUserModified = (currentValue: string, originalValue: string) => {
        // If field was originally empty and now contains placeholder data, it's not a user modification
        if (!originalValue && currentValue && isPlaceholderData(currentValue)) {
            return false;
        }
        return currentValue !== originalValue;
    };

    // Helper function to identify placeholder data patterns
    const isPlaceholderData = (value: string) => {
        if (!value) return false;
        const trimmed = value.trim();
        
        // Exact matches from dummyData template
        const exactPlaceholders = [
            "Mr", "Mrs", "Ms", "Dr",
            "Invent", "Name", "Solicitor Name", "Invent Solicitor Name",
            "opponent@helix-law.com", "opponentsolicitor@helix-law.com",
            "0345 314 2044",
            "Second Floor", "Britannia House, 21 Station Street",
            "Brighton", "East Sussex", "BN1 4DE", "United Kingdom",
            "Helix Law Ltd", "07845461"
        ];
        
        // Check for exact matches
        if (exactPlaceholders.includes(trimmed)) {
            return true;
        }
        
        // Additional pattern-based checks for flexibility
        const lower = trimmed.toLowerCase();
        return (
            lower.includes('placeholder') || 
            lower.includes('example') ||
            lower.includes('test') ||
            lower.includes('sample') ||
            lower.includes('helix law') ||
            lower.includes('helix-law.com') ||
            lower.includes('invent') ||
            // Combined name patterns
            trimmed === 'Invent Name' ||
            trimmed === 'Invent Solicitor Name' ||
            // Address pattern combinations
            lower.includes('station street') || 
            lower.includes('britannia house')
        );
    };

    // Helper function to get field style based on whether user modified it
    const getFieldStyle = (currentValue: string, originalValue: string | keyof typeof originalValues) => {
        const original = typeof originalValue === 'string' ? originalValue : (originalValues[originalValue] || '');
        const isModified = hasUserModified(currentValue, original);
        return {
            fontWeight: isModified ? 600 : 400,
            fontSize: 12,
            color: isModified ? '#111827' : '#9ca3af',
            fontStyle: isModified ? 'normal' : 'italic'
        };
    };

    // Canonical opponent placeholder template (must mirror OpponentDetailsStep dummyData for opponent-only fields)
    const opponentPlaceholderTemplate = {
        opponentCompanyName: 'Helix Law Ltd',
        opponentTitle: 'Mr',
        opponentFirst: 'Invent',
        opponentLast: 'Name',
        opponentEmail: 'opponent@helix-law.com',
        opponentPhone: '0345 314 2044',
        opponentHouseNumber: 'Second Floor',
        opponentStreet: 'Britannia House, 21 Station Street',
        opponentCity: 'Brighton',
        opponentCounty: 'East Sussex',
        opponentPostcode: 'BN1 4DE',
        opponentCountry: 'United Kingdom'
    } as const;

    type OppFieldKey = keyof typeof opponentPlaceholderTemplate;

    /**
     * Returns list of opponent field keys whose current values constitute REAL user input (non-empty & not placeholder)
     */
    const getRealOpponentFieldKeys = (): OppFieldKey[] => {
        const currentValues: Record<OppFieldKey, string> = {
            opponentCompanyName,
            opponentTitle,
            opponentFirst,
            opponentLast,
            opponentEmail,
            opponentPhone,
            opponentHouseNumber,
            opponentStreet,
            opponentCity,
            opponentCounty,
            opponentPostcode,
            opponentCountry
        } as const;
        const result: OppFieldKey[] = [];
        (Object.keys(opponentPlaceholderTemplate) as OppFieldKey[]).forEach(k => {
            const currentVal = (currentValues[k] || '').trim();
            const placeholderVal = opponentPlaceholderTemplate[k];
            if (!currentVal) return; // empty -> ignore
            if (currentVal === placeholderVal) return; // unchanged placeholder
            if (isPlaceholderData(currentVal)) return; // still generic placeholder pattern
            result.push(k);
        });
        return result;
    };

    // Locked card styling helper
    const lockCardStyle = (base: React.CSSProperties): React.CSSProperties => {
        if (!summaryConfirmed) return base;
        return {
            ...base,
            position: 'relative',
            background: isDarkMode 
                ? 'linear-gradient(135deg, #1f2937 0%, #111827 100%)'
                : 'linear-gradient(135deg, #F2F5F8 0%, #E9EEF2 100%)',
            border: isDarkMode ? '1px solid #374151' : '1px solid #cfd6de',
            boxShadow: isDarkMode 
                ? 'inset 0 0 0 999px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)'
                : 'inset 0 0 0 999px rgba(255,255,255,0.25), 0 0 0 1px rgba(255,255,255,0.4)',
            opacity: 0.9,
            filter: 'saturate(0.85)',
            // Subtle top accent bar
            backgroundImage: isDarkMode 
                ? 'linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0) 28%)'
                : 'linear-gradient(to bottom, rgba(55,65,81,0.08), rgba(55,65,81,0) 28%)'
        };
    };

    const renderLockOverlay = () => {
        if (!summaryConfirmed) return null;
        return (
            <div style={{
                position: 'absolute',
                top: 6,
                right: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(55,65,81,0.08)',
                border: isDarkMode ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(55,65,81,0.15)',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                color: isDarkMode ? '#e5e7eb' : '#374151',
                backdropFilter: 'blur(2px)'
            }}>
                <i className="ms-Icon ms-Icon--LockSolid" style={{ fontSize: 12, color: '#374151' }} />
                LOCKED
            </div>
        );
    };

    // Helper to reset confirmation when form fields are edited
    const resetConfirmationOnEdit = () => {
        if (summaryConfirmed) {
            setSummaryConfirmed(false);
            setConfirmAcknowledge(false);
            setEditsAfterConfirmation(true);
        }
    };

    // Wrapper functions that reset confirmation when called
    const setDescriptionWithReset = (value: React.SetStateAction<string>) => {
        setDescription(value);
        resetConfirmationOnEdit();
    };

    const setAreaOfWorkWithReset = (value: React.SetStateAction<string>) => {
        setAreaOfWork(value);
        resetConfirmationOnEdit();
    };

    const setPracticeAreaWithReset = (value: React.SetStateAction<string>) => {
        setPracticeArea(value);
        resetConfirmationOnEdit();
    };

    const setFolderStructureWithReset = (value: React.SetStateAction<string>) => {
        setFolderStructure(value);
        resetConfirmationOnEdit();
    };

    const setTeamMemberWithReset = (value: React.SetStateAction<string>) => {
        setTeamMember(value);
        resetConfirmationOnEdit();
    };

    const setSupervisingPartnerWithReset = (value: React.SetStateAction<string>) => {
        setSupervisingPartner(value);
        resetConfirmationOnEdit();
    };

    const setOriginatingSolicitorWithReset = (value: React.SetStateAction<string>) => {
        setOriginatingSolicitor(value);
        resetConfirmationOnEdit();
    };

    const setSelectedDateWithReset = (value: React.SetStateAction<Date | null>) => {
        setSelectedDate(value);
        resetConfirmationOnEdit();
    };

    const setDisputeValueWithReset = (value: React.SetStateAction<string>) => {
        setDisputeValue(value);
        resetConfirmationOnEdit();
    };

    const setOpponentNameWithReset = (value: React.SetStateAction<string>) => {
        setOpponentName(value);
        resetConfirmationOnEdit();
    };

    const setOpponentEmailWithReset = (value: React.SetStateAction<string>) => {
        setOpponentEmail(value);
        resetConfirmationOnEdit();
    };

    const setOpponentSolicitorNameWithReset = (value: React.SetStateAction<string>) => {
        setOpponentSolicitorName(value);
        resetConfirmationOnEdit();
    };

    const setOpponentSolicitorCompanyWithReset = (value: React.SetStateAction<string>) => {
        setOpponentSolicitorCompany(value);
        resetConfirmationOnEdit();
    };

    const setOpponentSolicitorEmailWithReset = (value: React.SetStateAction<string>) => {
        setOpponentSolicitorEmail(value);
        resetConfirmationOnEdit();
    };

    // Processing state for matter submission
    const [isProcessing, setIsProcessing] = useState(false);
    // Track whether processing has been initiated to avoid duplicate Open Matter buttons / triggers
    const [processingStarted, setProcessingStarted] = useState(false);
    const [processingOpen, setProcessingOpen] = useState(false);
    const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>(initialSteps);
    const [processingLogs, setProcessingLogs] = useState<string[]>([]);
    const [generatedCclUrl, setGeneratedCclUrl] = useState<string>('');
    const [backendCclQueuedAt, setBackendCclQueuedAt] = useState<string>('');
    const [operationEvents, setOperationEvents] = useState<Array<{ index: number; label: string; phase: string; url?: string; method?: string; status?: number; payloadSummary?: string; responseSummary?: string }>>([]);
    const [openedMatterId, setOpenedMatterId] = useState<string | null>(null);

    const [visiblePoidCount, setVisiblePoidCount] = useState(12); // UI only, not persisted
    const [poidSearchTerm, setPoidSearchTerm] = useState(''); // UI only, not persisted
    const [searchBoxFocused, setSearchBoxFocused] = useState(false);
    const poidGridRef = useRef<HTMLDivElement | null>(null);
    const [activePoid, setActivePoid] = useDraftedState<POID | null>('activePoid', null);

    // Guard: when entering via global action (no instructionRef), ensure there's no preselection
    // This clears any persisted selection that might carry from previous sessions
    useEffect(() => {
        if (!instructionRef) {
            if (selectedPoidIds.length > 0) setSelectedPoidIds([]);
            if (activePoid) setActivePoid(null);
            if (pendingClientType) setPendingClientType('');
        }
        // We only want this to run when instructionRef toggles to empty on entry
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instructionRef]);

    // When entering via an instruction, try to set an active POID from InstructionRef if none is selected
    // CRITICAL: Also refresh when effectivePoidData changes to ensure we get fresh instruction data
    useEffect(() => {
        if (!instructionRef) return;
        const match = effectivePoidData.find(p => (p as any).InstructionRef === instructionRef || (p as any).instruction_ref === instructionRef);
        if (match && (!activePoid || (activePoid as any).InstructionRef !== instructionRef)) {
            // Set or refresh activePoid when we have fresh instruction data
            setActivePoid(match);
        }
    }, [instructionRef, effectivePoidData, activePoid, setActivePoid]);

    const filteredPoidData = effectivePoidData.filter((poid) => {
        const term = poidSearchTerm.toLowerCase();
        return (
            poid.poid_id.toLowerCase().includes(term) ||
            (poid.first && poid.first.toLowerCase().includes(term)) ||
            (poid.last && poid.last.toLowerCase().includes(term))
        );
    });

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisiblePoidCount((prev) => Math.min(prev + 12, filteredPoidData.length));
                }
            },
            { rootMargin: '200px' }
        );
        if (poidGridRef.current) observer.observe(poidGridRef.current);
        return () => observer.disconnect();
    }, [filteredPoidData]);

    const handlePoidClick = (poid: POID) => {
        const isCompany = !!(poid.company_name || poid.company_number);
        
        if (selectedPoidIds.includes(poid.poid_id)) {
            // Remove selection
            setSelectedPoidIds((prev: string[]) => prev.filter((id: string) => id !== poid.poid_id));
            if (activePoid && activePoid.poid_id === poid.poid_id) {
                const remaining = effectivePoidData.find((p) => selectedPoidIds.includes(p.poid_id) && p.poid_id !== poid.poid_id);
                setActivePoid(remaining || null);
            }
        } else {
            // Add selection based on client type rules
            if (pendingClientType === 'Individual' || pendingClientType === 'Existing Client') {
                // Single selection only
                setSelectedPoidIds([poid.poid_id]);
                setActivePoid(poid);
            } else if (pendingClientType === 'Company') {
                // Company type: Two-stage selection
                const currentSelectedPoids = selectedPoidIds.map(id => 
                    effectivePoidData.find(p => p.poid_id === id)
                ).filter(Boolean);
                
                const hasCompanySelected = currentSelectedPoids.some(p => 
                    p && !!(p.company_name || p.company_number)
                );
                
                if (isCompany) {
                    // Selecting a company - replace any existing company
                    const newSelections = selectedPoidIds.filter(id => {
                        const p = effectivePoidData.find(poid => poid.poid_id === id);
                        return p && !(p.company_name || p.company_number); // Keep individuals (directors)
                    });
                    // Ensure uniqueness
                    const next = Array.from(new Set([...newSelections, poid.poid_id]));
                    setSelectedPoidIds(next);
                } else {
                    // Selecting an individual (director) - only allowed if company is already selected
                    if (hasCompanySelected) {
                        // Allow multiple directors - just add to existing selections
                        setSelectedPoidIds((prev: string[]) => (prev.includes(poid.poid_id) ? prev : [...prev, poid.poid_id]));
                    }
                }
                setActivePoid(poid);
            } else if (pendingClientType === 'Multiple Individuals') {
                // Multiple individuals allowed - unlimited selections
                setSelectedPoidIds((prev: string[]) => (prev.includes(poid.poid_id) ? prev : [...prev, poid.poid_id]));
                setActivePoid(poid);
            }
        }
        setSearchBoxFocused(false); // Collapse search box after selection
        setPoidSearchTerm(''); // Optionally clear search term
    };

    // Handler for Clear All button
const handleClearAll = () => {
  if (hasDataToClear()) {
    setIsClearDialogOpen(true);
  } else {
    doClearAll();
  }
};

    // Compute client display name for ConflictConfirmationCard
    const clientDisplayName = useMemo(() => {
        if (selectedPoidIds.length > 0) {
            const poid = effectivePoidData.find(p => p.poid_id === selectedPoidIds[0]);
            if (poid) {
                if (poid.company_name) {
                    return poid.company_name;
                }
                const fullName = `${poid.first || ''} ${poid.last || ''}`.trim();
                if (fullName) return fullName;
            }
        }
        if (clientAsOnFile && clientAsOnFile.trim()) {
            return clientAsOnFile.trim();
        }
        return 'Client';
    }, [selectedPoidIds, effectivePoidData, clientAsOnFile]);

    // Helper to get nickname from localUserData
    function getLocalUserNickname(userInitials: string): string {
        if (!userInitials) return '';
        const found = (localUserData as any[]).find(
            (u) => (u.Initials || '').toLowerCase() === userInitials.toLowerCase()
        );
        return found ? found.Nickname || found.First || found['Full Name'] || '' : '';
    }

    // Helper to get nickname from team data
    function getTeamNickname(userInitials: string, teamData: any[]): string {
        if (!userInitials || !teamData) return '';
        const found = teamData.find(
            (u) => (u.Initials || '').toLowerCase() === userInitials.toLowerCase()
        );
        return found ? found.Nickname || found.First || found['Full Name'] || '' : '';
    }

    // Helper to get partner initials (both initials for partners)
    function getPartnerInitials(teamData: any[]): string[] {
        if (!teamData) return [];
        return teamData
            .filter((member: any) => member.Role === 'Partner' || member.Role === 'Senior Partner')
            .map((member: any) => member.Initials || member['Initials'] || '')
            .filter(Boolean);
    }

    // Helper to get Clio ID from team data
    function getClioId(userInitials: string, teamData: any[]): string {
        if (!userInitials || !teamData) return '';
        const found = teamData.find(
            (u) => (u.Initials || '').toLowerCase() === userInitials.toLowerCase()
        );
        return found ? found['Clio ID'] || '' : '';
    }

    // Helper to get initials from full name via team data
    function getInitialsFromName(name: string, teamData: any[]): string {
        if (!name) return '';
        const nameLower = name.toLowerCase().trim();
        
        // Try multiple matching strategies
        const found = teamData.find(t => {
            const fullName = (t['Full Name'] || '').toLowerCase().trim();
            const constructedName = `${t.First || ''} ${t.Last || ''}`.toLowerCase().trim();
            const nickname = (t.Nickname || '').toLowerCase().trim();
            const firstName = (t.First || '').toLowerCase().trim();
            
            return fullName === nameLower ||
                   constructedName === nameLower ||
                   nickname === nameLower ||
                   firstName === nameLower;
        });
        
        if (found && found.Initials) return found.Initials;
        
        // Fallback: derive initials but check for conflicts
        const derivedInitials = name
            .split(' ')
            .filter(Boolean)
            .map(part => part[0].toUpperCase())
            .join('');
        
        // Check if derived initials conflict with an existing team member
        const conflict = teamData?.find(t => t.Initials === derivedInitials);
        if (conflict) {
            console.warn(`[getInitialsFromName] Derived initials "${derivedInitials}" for "${name}" conflict with ${conflict['Full Name']}. Please verify team data.`);
        }
        
        return derivedInitials;
    }

    // Determine requesting user nickname based on environment
    const requestingUserNickname =
        process.env.NODE_ENV === 'production' && teamData
            ? getTeamNickname(userInitials, teamData)
            : getLocalUserNickname(userInitials);

    // Determine requesting user Clio ID based on environment
    const requestingUserClioId = teamData ? getClioId(userInitials, teamData) : '';

    // Profile readiness gate — blocks submission until user data is resolvable
    const profileReady = !!(teamData && Array.isArray(teamData) && teamData.length > 0 && requestingUserNickname);

    // Environment/admin flags for gated backend details
    const isLocalDev = process.env.NODE_ENV !== 'production';
    const isAdminUser = useMemo(() => {
        if (!teamData) return false;
        try {
            const me = teamData.find(t => (t.Initials || '').toLowerCase() === userInitials.toLowerCase());
            const roleText = (me?.Role || '').toLowerCase();
            return roleText.includes('admin') || roleText.includes('owner') || roleText.includes('manager');
        } catch {
            return false;
        }
    }, [teamData, userInitials]);
    const adminEligible = isLocalDev || isAdminUser;

    // Horizontal sliding carousel approach
    const [currentStep, setCurrentStep] = useDraftedState<number>('currentStep', 0); // 0: select, 1: form, 2: review
    const carouselRef = useRef<HTMLDivElement>(null);

    // Scroll the modal container to top when step changes
    useEffect(() => {
        if (carouselRef.current) {
            const scrollParent = carouselRef.current.closest('[style*="overflow"]') as HTMLElement
                || carouselRef.current.closest('div[style]');
            // Walk up to find the scrollable parent (the modal's overflowY: auto container)
            let el: HTMLElement | null = carouselRef.current.parentElement;
            while (el) {
                const style = window.getComputedStyle(el);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    el.scrollTo({ top: 0, behavior: 'smooth' });
                    break;
                }
                el = el.parentElement;
            }
        }
    }, [currentStep]);
    
    // Guarantee a date when entering the Matter or Review steps
    useEffect(() => {
        if ((currentStep === 1 || currentStep === 2) && !selectedDate) {
            setSelectedDate(new Date());
        }
    }, [currentStep, selectedDate, setSelectedDate]);
    // Removed pendingClientType state - now handled directly in clientType state

    // Calculate completion percentages for progressive dots
    const calculateClientStepCompletion = (): number => {
        let filledFields = 0;
        let totalFields = 3; // clientType, selectedPoidIds, and opponent details
        
        if (clientType && clientType.trim() !== '') filledFields++;
        if (selectedPoidIds.length > 0) filledFields++;
        
        // Check opponent details completion
        const hasOpponentInfo = (opponentName && opponentName.trim() !== '') || 
                               (opponentFirst && opponentFirst.trim() !== '' && opponentLast && opponentLast.trim() !== '');
        const hasDisputeValue = disputeValue && disputeValue.trim() !== '';
        
        if (hasOpponentInfo && hasDisputeValue) filledFields++;
        
        return totalFields > 0 ? (filledFields / totalFields) * 100 : 0;
    };

    const calculateMatterStepCompletion = (): number => {
        let filledFields = 0;
        let totalFields = 10; // Reduced from 13 since opponent details moved to client step
        
        // Required fields - check for meaningful values, not just existence
        if (selectedDate !== null) filledFields++; // Date has been set
        if (supervisingPartner && supervisingPartner.trim() !== '') filledFields++;
        if (originatingSolicitor && originatingSolicitor.trim() !== '') filledFields++; // Accept defaultTeamMember as valid
        if (areaOfWork && areaOfWork.trim() !== '') filledFields++;
        if (practiceArea && practiceArea.trim() !== '') filledFields++;
        if (description && description.trim() !== '') filledFields++;
        if (folderStructure && folderStructure.trim() !== '') filledFields++;
        if (source && source.trim() !== '') filledFields++; // Source must be actively selected
        if (noConflict === true) filledFields++; // Only count if explicitly checked
        if (referrerName && referrerName.trim() !== '') filledFields++; // Optional field
        
        const completion = totalFields > 0 ? (filledFields / totalFields) * 100 : 0;
        
        return completion;
    };

    const calculateReviewStepCompletion = (): number => {
        // Review step is considered complete when user has reviewed the data
        return currentStep === 2 ? 100 : 0;
    };

    const getClientDotState = (): number => {
        const completion = calculateClientStepCompletion();
        if (completion === 100) return 3;
        if (completion >= 50) return 2;
        if (completion > 0) return 1;
        return 0;
    };

    const getMatterDotState = (): number => {
        const completion = calculateMatterStepCompletion();
        if (completion === 100) return 3;
        if (completion >= 50) return 2;
        if (completion > 0) return 1;
        return 0;
    };

    const getReviewDotState = (): number => {
        const completion = calculateReviewStepCompletion();
        if (completion === 100) return 3;
        if (completion >= 50) return 2;
        if (completion > 0) return 1;
        return 0;
    };

    // Helper function to get dot color based on state
    const getDotColor = (state: number): string => {
        switch (state) {
            case 3: return '#20b26c'; // Complete - full green
            case 2: return '#20b26c'; // 50%+ filled - full green
            case 1: return '#20b26c'; // First field filled - full green
            case 0: 
            default: return '#e0e0e0'; // Empty - gray
        }
    };

    // Progressive dots across workflow steps
    const getProgressiveDotStates = (): [number, number, number] => {
        const hasClientType = clientType && clientType.trim() !== '';
        const hasPoidSelection = selectedPoidIds.length > 0;
        const hasOpponentInfo = (opponentName && opponentName.trim() !== '') || 
                               (opponentFirst && opponentFirst.trim() !== '' && opponentLast && opponentLast.trim() !== '');
        const hasDisputeValue = disputeValue && disputeValue.trim() !== '';
        const hasNoConflictCheck = noConflict === true; // Must be explicitly checked
        const matterCompletion = calculateMatterStepCompletion();
        const reviewCompletion = calculateReviewStepCompletion();
        
        // Check if opponent choice has been made (either "I have details" or "I'll enter later")
        const opponentQuestionsComplete = opponentChoiceMade === true;
        
        let clientDots = 0;
        let matterDots = 0;
        let reviewDots = 0;
        
        // First dot: lights up when client type is selected
        if (hasClientType) {
            clientDots = 3;
        }
        
        // Second dot: lights up when POID is selected  
        if (hasClientType && hasPoidSelection) {
            matterDots = 3;
        }
        
        // Third dot: lights up when opponent choice has been made (no specific fields required)
        if (hasClientType && hasPoidSelection && opponentQuestionsComplete) {
            reviewDots = 3;
        }
        
        return [clientDots, matterDots, reviewDots];
    };

    // Build Matter progressive dots - strict completion logic
    const getBuildMatterDotStates = (): [number, number, number] => {
        let dot1 = 0; // First dot: ALL THREE team roles must be filled
        let dot2 = 0; // Second dot: ALL matter details must be filled (description, folder, area, practice)
        let dot3 = 0; // Third dot: Both dispute value AND source must be filled
        
        // First dot: Only lights up when ALL THREE team roles are filled (including prefills)
        const hasTeamMember = teamMember && teamMember.trim() !== '';
        const hasOriginatingSolicitor = originatingSolicitor && originatingSolicitor.trim() !== '';
        const hasSupervisingPartner = supervisingPartner && supervisingPartner.trim() !== '';
        
        if (hasTeamMember && hasOriginatingSolicitor && hasSupervisingPartner) {
            dot1 = 3; // All three roles filled - light up completely
        }
        
        // Second dot: Only lights up when ALL matter details are filled
        const hasDescription = description && description.trim() !== '';
        const hasFolderStructure = folderStructure && folderStructure.trim() !== '';
        const hasAreaOfWork = areaOfWork && areaOfWork.trim() !== '';
        const hasPracticeArea = practiceArea && practiceArea.trim() !== '';
        
        if (hasDescription && hasFolderStructure && hasAreaOfWork && hasPracticeArea) {
            dot2 = 3; // All matter details filled - light up completely
        }
        
        // Third dot: Only lights up when BOTH dispute value AND source are filled
        // Note: Source starts empty, so user must actively select an option
        const hasDisputeValue = disputeValue && disputeValue.trim() !== '';
        const hasActiveSource = source && source.trim() !== ''; // Must actively select a source option
        
        if (hasDisputeValue && hasActiveSource) {
            dot3 = 3; // Both value and actively selected source - light up completely
        }
        
        return [dot1, dot2, dot3];
    };

    // Determine completion status for each step
    const clientsStepComplete = (() => {
        // For instruction-driven entry, check essential fields only
        if (instructionRef || hideClientSections) {
            // In instruction mode, we primarily need client selection (POID selection)
            // Dispute value and conflict checks come later in the flow
            if (hideClientSections) {
                // If client sections are hidden, we just need conflict confirmation if it's available
                return noConflict === true;
            }
            
            // For instruction mode with client selection, we need at least one POID selected
            const hasClientSelection = selectedPoidIds.length > 0;
            
            return hasClientSelection;
        }

        // Otherwise use the user's current choice (pendingClientType) or provided initial type
        const type = (pendingClientType || initialClientType || '').trim();
        if (!type) {
            return false;
        }
        
        if (type === 'Multiple Individuals') {
            const hasDirectEntry = Boolean(clientAsOnFile && clientAsOnFile.trim());
            return selectedPoidIds.length > 0 || hasDirectEntry;
        }
        
        // Individual, Company, Existing Client require at least one POID selected
        return selectedPoidIds.length > 0;
    })();
    const matterStepComplete = selectedDate && supervisingPartner && originatingSolicitor && areaOfWork && practiceArea && description;
    const reviewStepComplete = false; // Review step doesn't have a "next" - it's the final step

    const handleContinueToForm = () => {
        if (clientsStepComplete) {
            setClientType(pendingClientType || clientType);
            setCurrentStep(1);
        }
    };

    const handleGoToReview = () => {
        setCurrentStep(2);
    };

    const handleBackToClients = () => {
        setCurrentStep(0);
    };

    const handleBackToForm = () => {
        setCurrentStep(1);
        setSummaryConfirmed(false);
        setConfirmAcknowledge(false);
        setEditsAfterConfirmation(false);
    };

    // Back navigation handler - must be after currentStep and handlers are defined
    const handleGoBack = () => {
        // Step-aware back: navigate within the wizard when possible
        if (currentStep === 2) {
            // From Review -> back to Matter Details (also resets confirmation flags there)
            handleBackToForm();
            return;
        }
        if (currentStep === 1) {
            setCurrentStep(0);
            return;
        }
        if (currentStep === 0) {
            // From Select Parties -> back to previous page (Instructions space)
            if (onBack) {
                onBack();
            } else {
                // Fallback to browser history if no callback provided
                window.history.back();
            }
            return;
        }
        // Otherwise fall back to browser history
        window.history.back();
    };

    const handleClientTypeChange = (newType: string, shouldLimitToSingle: boolean) => {
        // Only clear POID selection when actually switching to a different client type
        // Don't clear if we're staying on the same type (this prevents clearing during multiple selections)
        if (pendingClientType !== newType) {
            // Clear selections when switching between different client types
            setSelectedPoidIds([]);
        }
        setSearchBoxFocused(false); // Collapse search box after client type selection
        setPoidSearchTerm(''); // Optionally clear search term
    };

    // Helper to generate sample JSON object
    const generateSampleJson = () => {
        const selectedClients = selectedPoidIds.map((id: string) => {
            const client = effectivePoidData.find(p => p.poid_id === id);
            if (!client) {
                // Preserve the selected ID even if we have no further details
                return { poid_id: id };
            }
            const phone =
                client.best_number ||
                (client as any).phone ||
                (client as any).phone_number ||
                (client as any).phoneNumber ||
                (client as any).Phone ||
                instructionPhone ||
                null;
            const email = client.email || (client as any).Email || '';

            return {
                poid_id: client.poid_id,
                first_name: client.first,
                last_name: client.last,
                email,
                best_number: phone,
                type: client.type || 'individual',
                nationality: client.nationality,
                date_of_birth: client.date_of_birth,
                address: {
                    house_number: client.house_building_number,
                    street: client.street,
                    city: client.city,
                    county: client.county,
                    post_code: client.post_code,
                    country: client.country
                },
                company_details: client.company_name ? {
                    name: client.company_name,
                    number: client.company_number,
                    address: {
                        house_number: client.company_house_building_number,
                        street: client.company_street,
                        city: client.company_city,
                        county: client.company_county,
                        post_code: client.company_post_code,
                        country: client.company_country
                    }
                } : null,
                verification: {
                    stage: client.stage,
                    check_result: client.check_result,
                    pep_sanctions_result: client.pep_sanctions_result,
                    address_verification_result: client.address_verification_result,
                    check_expiry: client.check_expiry,
                    check_id: client.check_id
                }
            };
        });

        return {
            matter_details: {
                instruction_ref: instructionRef || null,
                client_id: clientId || null,
                matter_ref: matterIdState || matterRef || null,
                stage: stage,
                date_created: selectedDate ? selectedDate.toISOString().split('T')[0] : null,
                client_type: clientType,
                area_of_work: areaOfWork,
                practice_area: practiceArea,
                description: description,
                client_as_on_file: clientAsOnFile || null,
                dispute_value: disputeValue || null,
                folder_structure: folderStructure || null,
                budget_required: budgetRequired,
                budget_amount: budgetRequired === 'Yes' ? budgetAmount : null,
                budget_notify_threshold: budgetRequired === 'Yes' ? budgetThreshold : null,
                budget_notify_users: budgetRequired === 'Yes'
                    ? budgetNotifyUsers.split(',').map(u => u.trim()).filter(Boolean)
                    : []
            },
            team_assignments: {
                fee_earner: teamMember,
                supervising_partner: supervisingPartner,
                originating_solicitor: originatingSolicitor,
                requesting_user: requestingUserNickname,
                fee_earner_initials: teamData ? getInitialsFromName(teamMember, teamData) : '',
                fee_earner_email: (() => {
                    if (!teamData) return '';
                    const initials = getInitialsFromName(teamMember, teamData);
                    if (!initials) return '';
                    const match = teamData.find((t: any) =>
                        (t?.Initials || '').toUpperCase() === initials.toUpperCase()
                    );
                    return match?.Email || '';
                })(),
                originating_solicitor_initials: teamData ? getInitialsFromName(originatingSolicitor, teamData) : ''
            },
            client_information: selectedClients,
            source_details: {
                source: source,
                referrer_name: source === 'referral' ? referrerName : null
            },
            opponent_details: (
                opponentName ||
                opponentSolicitorName ||
                opponentFirst ||
                opponentLast ||
                opponentCompanyName ||
                opponentCompanyNumber ||
                opponentEmail ||
                opponentPhone ||
                opponentHouseNumber ||
                opponentStreet ||
                opponentCity ||
                opponentCounty ||
                opponentPostcode ||
                opponentCountry ||
                opponentSolicitorCompany ||
                solicitorFirst ||
                solicitorLast ||
                solicitorCompanyNumber ||
                opponentSolicitorEmail ||
                solicitorPhone ||
                solicitorHouseNumber ||
                solicitorStreet ||
                solicitorCity ||
                solicitorCounty ||
                solicitorPostcode ||
                solicitorCountry
            ) ? {
                opponent: {
                    title: opponentTitle || null,
                    first_name: opponentFirst || null,
                    last_name: opponentLast || null,
                    is_company: opponentHasCompany || false,
                    company_name: opponentCompanyName || null,
                    company_number: opponentCompanyNumber || null,
                    email: opponentEmail || null,
                    phone: opponentPhone || null,
                    address: {
                        house_number: opponentHouseNumber || null,
                        street: opponentStreet || null,
                        city: opponentCity || null,
                        county: opponentCounty || null,
                        post_code: opponentPostcode || null,
                        country: opponentCountry || null
                    }
                },
                solicitor: {
                    title: solicitorTitle || null,
                    first_name: solicitorFirst || null,
                    last_name: solicitorLast || null,
                    company_name: opponentSolicitorCompany || null,
                    company_number: solicitorCompanyNumber || null,
                    email: opponentSolicitorEmail || null,
                    phone: solicitorPhone || null,
                    address: {
                        house_number: solicitorHouseNumber || null,
                        street: solicitorStreet || null,
                        city: solicitorCity || null,
                        county: solicitorCounty || null,
                        post_code: solicitorPostcode || null,
                        country: solicitorCountry || null
                    }
                }
            } : null,
            compliance: {
                conflict_check_completed: noConflict,
                id_verification_required: true,
                pep_sanctions_check_required: true
            },
            metadata: {
                created_by: userInitials,
                created_at: new Date().toISOString(),
                form_version: "1.0",
                processing_status: "pending_review"
            },
            // Instruction-level summary for fee earner confirmation email
            instruction_summary: (() => {
                // Find the instruction record for this instruction ref
                const inst = Array.isArray(instructionRecords) 
                    ? (instructionRecords as any[]).find(r => r?.InstructionRef === instructionRef)
                    : null;
                if (!inst) return null;
                
                // Get the lead client's ID verification (most recent one with IsLeadClient=true, or first one)
                const idVerifications = inst.idVerifications || [];
                const leadVerif = idVerifications.find((v: any) => v.IsLeadClient) || idVerifications[0] || null;
                
                // Get the first risk assessment (sorted by ComplianceDate DESC in DB)
                const riskAssessments = inst.riskAssessments || [];
                const latestRisk = riskAssessments[0] || null;
                
                // Get payment data from payments array (attached by server)
                const payments = inst.payments || [];
                const successfulPayment = payments.find((p: any) => p.payment_status === 'succeeded' || p.internal_status === 'completed') || payments[0] || null;
                
                return {
                    // Payment status - check payments array, then InternalStatus, then fallback
                    payment_result: successfulPayment?.payment_status === 'succeeded' ? 'Paid' 
                        : (inst.InternalStatus === 'paid' ? 'Paid' : (inst.PaymentResult || null)),
                    payment_amount: successfulPayment?.amount || inst.PaymentAmount || null,
                    payment_timestamp: successfulPayment?.created_at || inst.PaymentTimestamp || null,
                    // EID verification - pull from idVerifications array
                    eid_overall_result: leadVerif?.EIDOverallResult || inst.EIDOverallResult || null,
                    eid_check_id: leadVerif?.EIDCheckId || inst.EIDCheckId || null,
                    eid_status: leadVerif?.EIDStatus || inst.EIDStatus || null,
                    pep_sanctions_result: leadVerif?.PEPAndSanctionsCheckResult || leadVerif?.PEPResult || inst.PEPAndSanctionsCheckResult || inst.PEPResult || null,
                    address_verification_result: leadVerif?.AddressVerificationResult || leadVerif?.AddressVerification || inst.AddressVerificationResult || inst.AddressVerification || null,
                    // Risk assessment - pull from riskAssessments array
                    risk_assessment: latestRisk ? {
                        result: latestRisk.RiskAssessmentResult || null,
                        score: latestRisk.RiskScore || null,
                        assessor: latestRisk.RiskAssessor || null,
                        compliance_date: latestRisk.ComplianceDate || null,
                        transaction_risk_level: latestRisk.TransactionRiskLevel || null
                    } : (inst.RiskAssessment ? {
                        result: inst.RiskAssessment.RiskAssessmentResult || null,
                        score: inst.RiskAssessment.RiskScore || null,
                        assessor: inst.RiskAssessment.RiskAssessor || null,
                        compliance_date: inst.RiskAssessment.ComplianceDate || null,
                        transaction_risk_level: inst.RiskAssessment.TransactionRiskLevel || null
                    } : null),
                    // Documents - full array with details for email
                    document_count: Array.isArray(inst.documents) ? inst.documents.length : 0,
                    documents: Array.isArray(inst.documents) ? inst.documents.map((doc: any) => ({
                        file_name: doc.FileName || doc.filename || doc.name || null,
                        file_size_bytes: doc.FileSizeBytes || doc.filesize || doc.size || null,
                        document_type: doc.DocumentType || doc.type || null,
                        uploaded_at: doc.UploadedAt || doc.uploadedAt || null
                    })) : [],
                    // Deal info
                    deal_id: inst.DealId || inst.dealId || null,
                    service_description: inst.ServiceDescription || null
                };
            })()
        };
    };

    // JSON Debug Validation Function for failed submission diagnostics
    const validateDebugJson = (jsonString: string) => {
        const suggestions: string[] = [];
        const warnings: string[] = [];
        const predictions: { step: string; willPass: boolean; reason: string }[] = [];

        try {
            const data = JSON.parse(jsonString);
            
            // Check top-level structure
            const expectedSections = ['matter_details', 'team_assignments', 'client_information', 'source_details'];
            const missingSections = expectedSections.filter(section => !data[section]);
            if (missingSections.length > 0) {
                suggestions.push(`Missing required sections: ${missingSections.join(', ')}`);
            }

            // Validate matter_details
            if (data.matter_details) {
                const md = data.matter_details;
                if (!md.client_type) suggestions.push('client_type is required in matter_details');
                if (!md.area_of_work) suggestions.push('area_of_work is required in matter_details');
                if (!md.practice_area) suggestions.push('practice_area is required in matter_details');
                if (!md.description || md.description.trim().length < 10) {
                    suggestions.push('description should be at least 10 characters long');
                }
                
                // Predict client type selection step
                predictions.push({
                    step: 'Client Type Selection',
                    willPass: !!md.client_type && ['Individual', 'Company', 'Multiple Individuals', 'Existing Client'].includes(md.client_type),
                    reason: md.client_type ? 'Valid client type provided' : 'Client type missing or invalid'
                });

                // Predict area of work step
                predictions.push({
                    step: 'Area of Work',
                    willPass: !!md.area_of_work && md.area_of_work.trim().length > 0,
                    reason: md.area_of_work ? 'Area of work specified' : 'Area of work missing'
                });

                // Predict practice area step
                predictions.push({
                    step: 'Practice Area',
                    willPass: !!md.practice_area && md.practice_area.trim().length > 0,
                    reason: md.practice_area ? 'Practice area specified' : 'Practice area missing'
                });
            }

            // Validate team_assignments
            if (data.team_assignments) {
                const ta = data.team_assignments;
                if (!ta.fee_earner) suggestions.push('fee_earner is required in team_assignments');
                if (!ta.supervising_partner) warnings.push('supervising_partner recommended but not required');
                
                predictions.push({
                    step: 'Team Assignment',
                    willPass: !!ta.fee_earner,
                    reason: ta.fee_earner ? 'Fee earner assigned' : 'Fee earner required but missing'
                });
            }

            // Validate client_information
            if (data.client_information) {
                const clients = Array.isArray(data.client_information) ? data.client_information : [];
                if (clients.length === 0) {
                    suggestions.push('At least one client must be selected');
                } else {
                    clients.forEach((client: any, index: number) => {
                        if (!client.poid_id) suggestions.push(`Client ${index + 1}: poid_id is required`);
                        if (!client.first_name) suggestions.push(`Client ${index + 1}: first_name is required`);
                        if (!client.last_name) suggestions.push(`Client ${index + 1}: last_name is required`);
                        if (!client.email) warnings.push(`Client ${index + 1}: email is recommended`);
                        
                        // Check verification status
                        if (client.verification) {
                            const verif = client.verification;
                            if (verif.check_result !== 'passed') {
                                warnings.push(`Client ${index + 1}: ID verification not passed (${verif.check_result || 'unknown'})`);
                            }
                            if (verif.pep_sanctions_result !== 'passed') {
                                warnings.push(`Client ${index + 1}: PEP/Sanctions check not passed (${verif.pep_sanctions_result || 'unknown'})`);
                            }
                        } else {
                            warnings.push(`Client ${index + 1}: No verification data found`);
                        }
                    });
                }

                predictions.push({
                    step: 'Client Selection',
                    willPass: clients.length > 0 && clients.every((c: any) => c.poid_id && c.first_name && c.last_name),
                    reason: clients.length === 0 ? 'No clients selected' : 
                           clients.some((c: any) => !c.poid_id || !c.first_name || !c.last_name) ? 'Some clients missing required fields' :
                           'All clients have required information'
                });
            }

            // Validate source_details
            if (data.source_details) {
                const sd = data.source_details;
                if (!sd.source) suggestions.push('source is required in source_details');
                if (sd.source === 'referral' && !sd.referrer_name) {
                    suggestions.push('referrer_name is required when source is "referral"');
                }

                predictions.push({
                    step: 'Source Information',
                    willPass: !!sd.source && (sd.source !== 'referral' || !!sd.referrer_name),
                    reason: !sd.source ? 'Source missing' : 
                           sd.source === 'referral' && !sd.referrer_name ? 'Referrer name required for referral source' :
                           'Source information valid'
                });
            }

            // Check opponent_details if present
            if (data.opponent_details) {
                const od = data.opponent_details;
                let hasOpponentInfo = false;
                let hasSolicitorInfo = false;
                
                if (od.individual && (od.individual.first_name || od.individual.last_name || od.individual.email)) {
                    hasOpponentInfo = true;
                    if (!od.individual.first_name || !od.individual.last_name) {
                        warnings.push('Opponent individual missing name information');
                    }
                }
                
                if (od.solicitor && (od.solicitor.first_name || od.solicitor.last_name || od.solicitor.company_name)) {
                    hasSolicitorInfo = true;
                    if (!od.solicitor.company_name) {
                        warnings.push('Opponent solicitor missing company name');
                    }
                }

                predictions.push({
                    step: 'Opponent Details',
                    willPass: true, // Optional step
                    reason: hasOpponentInfo || hasSolicitorInfo ? 'Opponent information provided' : 'No opponent information (optional)'
                });
            }

            // Overall validation
            const hasRequiredSections = ['matter_details', 'team_assignments', 'client_information', 'source_details'].every(section => data[section]);
            const criticalIssues = suggestions.length > 0;

            return {
                isValid: hasRequiredSections && !criticalIssues,
                suggestions,
                warnings,
                predictions
            };

        } catch (error) {
            return {
                isValid: false,
                suggestions: ['Invalid JSON format - please check syntax'],
                warnings: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
                predictions: []
            };
        }
    };

    // Helper function to check if there's any data to clear
    const hasDataToClear = () => {
        return selectedPoidIds.length > 0 || pendingClientType || poidSearchTerm ||
            areaOfWork || practiceArea || description || disputeValue ||
            budgetRequired === 'Yes' || budgetAmount || budgetThreshold || budgetNotifyUsers ||
            source !== 'search' || referrerName || folderStructure ||
            opponentName || opponentEmail || opponentSolicitorName ||
               opponentSolicitorCompany || opponentSolicitorEmail ||
               opponentTitle || opponentFirst || opponentLast || opponentPhone ||
               opponentHouseNumber || opponentStreet || opponentCity || opponentCounty || opponentPostcode || opponentCountry || opponentHasCompany || opponentCompanyName ||
               opponentCompanyNumber || solicitorTitle || solicitorFirst ||
               solicitorLast || solicitorPhone || solicitorHouseNumber || solicitorStreet || solicitorCity || solicitorCounty || solicitorPostcode || solicitorCountry ||
               solicitorCompanyNumber || summaryConfirmed || noConflict ||
               (selectedDate && selectedDate.getTime() !== new Date().setHours(0,0,0,0)) ||
               teamMember !== defaultTeamMember || supervisingPartner ||
               originatingSolicitor !== defaultTeamMember;
    };

    // Count the number of filled fields for the clear button
    const getFieldCount = () => {
        let count = 0;
        if (selectedPoidIds.length > 0) count++;
        if (pendingClientType) count++;
        if (areaOfWork) count++;
        if (practiceArea) count++;
        if (description) count++;
        if (disputeValue) count++;
        if (budgetRequired === 'Yes') count++;
        if (budgetAmount) count++;
        if (budgetThreshold) count++;
        if (budgetNotifyUsers) count++;
        if (source !== 'search') count++;
        if (referrerName) count++;
        if (folderStructure) count++;
        if (opponentName || opponentEmail || opponentSolicitorName) count++;
        if (summaryConfirmed) count++;
        if (selectedDate && selectedDate.getTime() !== new Date().setHours(0,0,0,0)) count++;
        if (teamMember !== defaultTeamMember) count++;
        if (supervisingPartner) count++;
        if (originatingSolicitor !== defaultTeamMember) count++;
        return count;
    };

    // Track failing step for summary display
    const [failureSummary, setFailureSummary] = useState<string>('');
    const autoReportSentRef = React.useRef<string | null>(null);

    // Auto-send diagnostic report to dev team on failure (includes full form shell)
    React.useEffect(() => {
        if (!failureSummary || autoReportSentRef.current === failureSummary) return;
        autoReportSentRef.current = failureSummary;
        setReportDelivered(false);
        
        // Brief delay for animated feedback sequencing
        const timer = setTimeout(async () => {
            try {
                const report = {
                    issue: failureSummary,
                    user: userInitials, instruction: instructionRef || 'N/A',
                    timestamp: new Date().toLocaleString(),
                    formData: generateSampleJson(),
                    processingSteps: processingSteps.map(s => ({ label: s.label, status: s.status, message: s.message })),
                    url: window.location.href,
                    autoSent: true
                };
                const html = `<h2>Matter Opening Issue (Auto-Report)</h2><pre>${JSON.stringify(report, null, 2)}</pre>`;
                const resp = await fetch('/api/sendEmail', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: 'lz@helix-law.com', subject: `Matter Opening Issue (Auto) - ${userInitials}`, html, from_email: 'automations@helix-law.com' })
                });
                if (resp.ok) {
                    setReportDelivered(true);
                } else {
                    showToast({ type: 'error', title: 'Report Failed', message: 'Could not deliver report. Use the manual Report button.' });
                }
            } catch {
                showToast({ type: 'error', title: 'Report Failed', message: 'Network error sending report.' });
            }
        }, 1200);
        return () => clearTimeout(timer);
    }, [failureSummary]);
    
    // Local userData state for fallback when prop is missing
    const [fallbackUserData, setFallbackUserData] = useState<UserData[] | null>(null);
    const [userDataLoading, setUserDataLoading] = useState(false);

    // Report telemetry event to server (App Insights-backed)
    const reportMatterTelemetry = (type: string, data: Record<string, unknown>) => {
        try {
            fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'MatterOpening',
                    event: {
                        type,
                        timestamp: new Date().toISOString(),
                        sessionId: `${userInitials}-${Date.now()}`,
                        enquiryId: instructionRef || '',
                        feeEarner: userInitials || '',
                        data: { ...data, instructionRef: instructionRef || '', userInitials: userInitials || '' },
                        error: data.error ? String(data.error) : undefined,
                    }
                })
            }).catch(() => { /* non-blocking */ });
        } catch { /* non-blocking */ }
    };
    
    // Fallback function to fetch userData if not provided via props
    const fetchUserDataFallback = async (entraId: string): Promise<UserData[] | null> => {
        if (!entraId) {
            console.warn('[FlatMatterOpening] No Entra ID provided for fallback user fetch');
            return null;
        }
        
        setUserDataLoading(true);
        
        try {
            const response = await fetch('/api/user-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userObjectId: entraId })
            });
            
            if (!response.ok) {
                console.error('[FlatMatterOpening] Failed to fetch user data:', response.status);
                return null;
            }
            
            const data = await response.json();
            setFallbackUserData(data);
            return data;
        } catch (error) {
            console.error('[FlatMatterOpening] Error fetching user data:', error);
            return null;
        } finally {
            setUserDataLoading(false);
        }
    };
    
    // Get effective userData (prop or fallback)
    const effectiveUserData = userData || fallbackUserData;

    // Process matter opening steps defined in processingActions
    // --- Demo mode processing simulator ---
    const simulateDemoProcessing = async () => {
        setIsProcessing(true);
        setProcessingOpen(true);
        setProcessingLogs([]);
        setProcessingSteps(initialSteps);
        setFailureSummary('');
        setReportDelivered(false);
        autoReportSentRef.current = null;

        showToast({ type: 'loading', title: 'Opening Matter (Demo)', message: 'Simulating matter opening process...', persist: true, id: 'matter-processing' });

        const total = initialSteps.length;
        // Determine which step to fail on based on outcome
        const failAt = demoProcessingOutcome === 'fail-early' ? 1
            : demoProcessingOutcome === 'fail-mid' ? Math.floor(total / 2)
            : demoProcessingOutcome === 'fail-late' ? total - 2
            : -1; // success = no failure

        for (let i = 0; i < total; i++) {
            setCurrentActionIndex(i);
            // Simulate step delay (100-300ms per step)
            await new Promise(r => setTimeout(r, 120 + Math.random() * 180));

            if (i === failAt) {
                // Simulate failure
                const failMsg = `Demo simulated failure at step ${i + 1}`;
                setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error', message: failMsg } : s));
                setProcessingLogs(prev => [...prev, `[x] ${initialSteps[i].label}: ${failMsg}`]);
                setFailureSummary(`Failed at: ${initialSteps[i].label} - ${failMsg}`);
                showToast({ type: 'error', title: 'Processing Failed (Demo)', message: `Failed at: ${initialSteps[i].label}` });
                setDebugInspectorOpen(true);
                break;
            }

            // Simulate success
            setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message: 'OK' } : s));
            setProcessingLogs(prev => [...prev, `[ok] ${initialSteps[i].label}: Done`]);
        }

        if (failAt === -1) {
            // Full success
            setProcessingLogs(prev => [...prev, '[ok] Matter opening completed successfully! (Demo)']);
            showToast({ type: 'success', title: 'Matter Opened (Demo)', message: 'Demo processing completed.' });
            setOpenedMatterId('HELIX01-01');
            completeMatterOpening();

            // Fire real CCL endpoints against demo data so the user can preview a real CCL
            try {
                const formData = generateSampleJson();
                const cclPayload = {
                    matterId: '3311402',
                    instructionRef: 'HELIX01-01',
                    practiceArea: formData.matter_details?.practice_area || formData.matter_details?.area_of_work || 'Commercial',
                    description: formData.matter_details?.description || 'Contract Dispute',
                    clientName: (() => {
                        const c = formData.client_information?.[0];
                        return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : 'Demo Client';
                    })(),
                    opponent: (formData.opponent_details as any)?.opponent?.first_name
                        ? `${(formData.opponent_details as any).opponent.first_name} ${(formData.opponent_details as any).opponent.last_name || ''}`.trim()
                        : '',
                    handlerName: formData.team_assignments?.fee_earner || '',
                };
                const fillResp = await fetch('/api/ccl-ai/fill', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cclPayload),
                });
                if (fillResp.ok) {
                    setProcessingLogs(prev => [...prev, '[ok] CCL AI Fill: fields populated (real)']);
                }

                const genResp = await fetch('/api/ccl', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matterId: '3311402', draftJson: formData }),
                });
                if (genResp.ok) {
                    const genData = await genResp.json();
                    if (genData.url) {
                        setGeneratedCclUrl(genData.url);
                        setProcessingLogs(prev => [...prev, `[ok] Draft CCL Generated: ${genData.url} (real)`]);
                    }
                }
            } catch (cclErr) {
                console.warn('[Demo] CCL generation failed (non-blocking):', cclErr);
                setProcessingLogs(prev => [...prev, `[!] CCL generation skipped: ${cclErr instanceof Error ? cclErr.message : 'unknown error'}`]);
            }
        }

        hideToast('matter-processing');
        setTimeout(() => setIsProcessing(false), 1500);
        setProcessingOpen(false);
        return { url: '' };
    };

    const simulateProcessing = async () => {
        resetMatterTraceId();
        let workingUserData = effectiveUserData;
        const resolvedProcessingInitials = (
            userInitials ||
            (teamData ? getInitialsFromName(teamMember, teamData) : '') ||
            (teamData ? getInitialsFromName(originatingSolicitor, teamData) : '') ||
            ''
        ).trim();
        
        // CRITICAL: Validate userData is loaded before processing - try fallback if missing
        if (!workingUserData || !Array.isArray(workingUserData) || workingUserData.length === 0) {
            console.warn('[!] [simulateProcessing] userData missing, attempting fallback fetch...');
            
            // Try to get Entra ID from teamData by matching userInitials
            let entraId: string | null = null;
            if (teamData && Array.isArray(teamData) && resolvedProcessingInitials) {
                const teamMember = teamData.find((t: any) => 
                    (t.Initials || t.initials || '').toLowerCase() === resolvedProcessingInitials.toLowerCase()
                );
                entraId = teamMember?.['Entra ID'] || (teamMember as any)?.EntraID || null;
            }
            
            if (entraId) {
                const fallbackData = await fetchUserDataFallback(entraId);
                if (fallbackData && fallbackData.length > 0) {
                    workingUserData = fallbackData;
                } else {
                    console.warn('[FlatMatterOpening] API fallback returned empty, constructing from teamData...');
                }
            }
            
            // If still missing, construct minimal userData from teamData
            if (!workingUserData || !Array.isArray(workingUserData) || workingUserData.length === 0) {
                if (teamData && Array.isArray(teamData) && resolvedProcessingInitials) {
                    const teamMember = teamData.find((t: any) => 
                        (t.Initials || t.initials || '').toLowerCase() === resolvedProcessingInitials.toLowerCase()
                    );
                    if (teamMember) {
                        console.warn('[FlatMatterOpening] Constructing userData from teamData for:', resolvedProcessingInitials);
                        const tm = teamMember as any;
                        workingUserData = [{
                            Initials: teamMember.Initials || tm.initials || resolvedProcessingInitials,
                            ASANAClientID: tm.ASANAClientID || tm.ASANAClient_ID || '',
                            ASANAClient_ID: tm.ASANAClient_ID || tm.ASANAClientID || '',
                            ASANASecret: tm.ASANASecret || tm.ASANA_Secret || '',
                            ASANA_Secret: tm.ASANA_Secret || tm.ASANASecret || '',
                            ASANARefreshToken: tm.ASANARefreshToken || tm.ASANARefresh_Token || '',
                            ASANARefresh_Token: tm.ASANARefresh_Token || tm.ASANARefreshToken || '',
                            'Entra ID': teamMember['Entra ID'] || tm.EntraID || '',
                            Email: teamMember.Email || tm.email || '',
                            Name: teamMember['Full Name'] || tm.Name || tm.name || `${teamMember.First || ''} ${teamMember.Last || ''}`.trim(),
                            ClioID: teamMember['Clio ID'] || tm.ClioID || tm.Clio_ID || '',
                        } as any];
                    }
                }
            }
            
            // Final check - if still no userData, show error
            if (!workingUserData || !Array.isArray(workingUserData) || workingUserData.length === 0) {
                const errorMsg = 'User profile data not loaded. Please refresh the page and try again.';
                setFailureSummary(`Failed at: Pre-validation - ${errorMsg}`);
                setProcessingLogs([`[x] Pre-validation: ${errorMsg}`]);
                setProcessingSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'error', message: errorMsg } : s));
                setDebugInspectorOpen(true);
                console.error('[x] [simulateProcessing] userData validation failed - no data source available:', { userData, fallbackUserData, userInitials, resolvedProcessingInitials, hasTeamData: !!teamData });
                reportMatterTelemetry('PreValidation.Failed', { error: errorMsg, phase: 'userDataCheck', hasUserData: !!userData, hasFallback: !!fallbackUserData, hasTeamData: !!teamData, resolvedProcessingInitials });
                return { url: '' };
            }
        }

        // Validate required form fields before processing
        const formSnapshot = generateSampleJson();
        if (!formSnapshot.matter_details?.practice_area || !formSnapshot.matter_details.practice_area.trim()) {
            const errorMsg = 'Practice area is required. Please select a practice area before opening a matter.';
            setFailureSummary(`Failed at: Pre-validation - ${errorMsg}`);
            setProcessingLogs([`[x] Pre-validation: ${errorMsg}`]);
            setProcessingSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'error', message: errorMsg } : s));
            setDebugInspectorOpen(true);
            reportMatterTelemetry('PreValidation.Failed', { error: errorMsg, phase: 'practiceAreaCheck' });
            return { url: '' };
        }

        // Validate required Asana credentials are present
        const user = workingUserData[0];
        if (!user.ASANASecret && !user.ASANA_Secret) {
            const errorMsg = 'Asana credentials missing from user profile. Please contact support.';
            setFailureSummary(`Failed at: Pre-validation - ${errorMsg}`);
            setProcessingLogs([`[x] Pre-validation: ${errorMsg}`]);
            setProcessingSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'error', message: errorMsg } : s));
            setDebugInspectorOpen(true);
            console.error('[FlatMatterOpening] Asana credentials validation failed:', { user });
            reportMatterTelemetry('PreValidation.Failed', { error: errorMsg, phase: 'asanaCredentials' });
            return { url: '' };
        }

        setIsProcessing(true);
        setProcessingOpen(true);
        setProcessingLogs([]);
        setProcessingSteps(initialSteps);
        setFailureSummary('');
        setReportDelivered(false);
        autoReportSentRef.current = null;

        // Reassuring processing toast
        showToast({ type: 'loading', title: 'Opening Matter', message: 'Processing your matter request - this may take a moment.', persist: true, id: 'matter-processing' });
        
        // Activate workbench mode immediately on submission
        // setTimeout(() => setWorkbenchMode(true), 300; // Disabled - keep processing in main section
        
        let url = '';

        try {
            // Wire observer to capture sent/response/success/error phases
            registerOperationObserver((e) => {
                setOperationEvents(prev => [...prev, e]);
            });
            for (let i = 0; i < processingActions.length; i++) {
                const action = processingActions[i];
                setCurrentActionIndex(i);
                // Use workingUserData which may be from fallback
                const result = await action.run(generateSampleJson(), resolvedProcessingInitials, workingUserData);
                const message = typeof result === 'string' ? result : result.message;
                setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message } : s));
                setProcessingLogs(prev => [...prev, `[x] ${message}`]);
                if (typeof result === 'object' && result.url) {
                    url = result.url;
                }
                if (typeof result === 'object' && result.cclQueuedAt) {
                    setBackendCclQueuedAt(result.cclQueuedAt);
                }
            }

            setProcessingLogs(prev => [...prev, '[ok] Matter opening completed successfully!']);
            showToast({ type: 'success', title: 'Matter Opened', message: 'The matter has been opened successfully.' });
            reportMatterTelemetry('Processing.Completed', { stepsCompleted: processingActions.length });
            completeMatterOpening();
        } catch (error) {
            console.error('Error during processing:', error);
            const msg = error instanceof Error ? error.message : 'Unknown error';
            // Identify failing step (first still pending at error time)
            let failingIndex = -1;
            setProcessingSteps(prev => {
                const idx = prev.findIndex(ps => ps.status === 'pending');
                failingIndex = idx === -1 ? prev.length - 1 : idx;
                return prev.map((s, i) => i === failingIndex ? { ...s, status: 'error', message: msg } : s);
            });
            const failingLabel = processingActions[failingIndex]?.label || 'Unknown step';
            setFailureSummary(`Failed at: ${failingLabel} - ${msg}`);
            setProcessingLogs(prev => [...prev, `[x] ${failingLabel}: ${msg}`]);
            showToast({ type: 'error', title: 'Processing Failed', message: `Failed at: ${failingLabel}` });
            // Auto-open debug inspector
            setDebugInspectorOpen(true);
            reportMatterTelemetry('Processing.StepFailed', { error: msg, failingStep: failingLabel, stepIndex: failingIndex });
        } finally {
            registerOperationObserver(null);
            hideToast('matter-processing');
            setTimeout(() => setIsProcessing(false), 2000);
            setProcessingOpen(false);
        }
        setGeneratedCclUrl(url);
        return { url };
    };



    // Support email functionality (adapted from PitchBuilder)
    const sendSupportRequest = async () => {
        if (!supportMessage.trim()) return;
        
        setSupportSending(true);
        
        try {
            // Get user email from userData
            const userEmailCandidate = (userData && userData[0]) || {} as any;
            const userEmailAddress = 
                (userEmailCandidate.Email && String(userEmailCandidate.Email).trim()) ||
                (userEmailCandidate.WorkEmail && String(userEmailCandidate.WorkEmail).trim()) ||
                (userEmailCandidate.Mail && String(userEmailCandidate.Mail).trim()) ||
                `${userInitials?.toLowerCase()}@helix-law.com`;

            const debugInfo = {
                timestamp: new Date().toISOString(),
                user: userInitials,
                instructionRef,
                stage,
                clientType,
                selectedPoidIds: selectedPoidIds?.length,
                processingSteps: processingSteps.map(s => ({ label: s.label, status: s.status })),
                systemData: generateSampleJson()
            };

            const emailBody = `
                <h3>Matter Opening Support Request - ${supportCategory.toUpperCase()}</h3>
                <p><strong>Category:</strong> ${supportCategory}</p>
                <p><strong>User:</strong> ${userInitials} (${userEmailAddress})</p>
                <p><strong>Instruction:</strong> ${instructionRef || 'N/A'}</p>
                <p><strong>Issue Description:</strong></p>
                <div style="background: #f5f5f5; padding: 12px; border-left: 3px solid #3690CE; margin: 12px 0;">
                    ${supportMessage.replace(/\n/g, '<br/>')}
                </div>
                <h4>Debug Information</h4>
                <pre style="background: #f8f8f8; padding: 12px; font-size: 11px; overflow: auto;">
${JSON.stringify(debugInfo, null, 2)}
                </pre>
            `;

            const response = await fetch('/api/sendEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email_contents: emailBody,
                    // Primary recipients now include lz and cb plus support
                    user_email: 'support@helix-law.com,lz@helix-law.com',
                    subject: `Matter Opening Support: ${supportCategory} - ${instructionRef || 'Generic'}`,
                    from_email: userEmailAddress,
                    bcc_emails: 'automations@helix-law.com'
                })
            });

            if (response.ok) {
                setSupportMessage('');
                setSupportPanelOpen(false);
                // Show success notification
                showToast({ type: 'success', title: 'Request Sent', message: 'Your support request has been sent successfully.' });
            } else {
                throw new Error('Failed to send support request');
            }
        } catch (error) {
            console.error('Support request failed:', error);
            showToast({ type: 'error', title: 'Request Failed', message: 'Unable to send support request. Please try again.' });
        } finally {
            setSupportSending(false);
        }
    };

    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

    // Entry choice: New vs Existing/Carry On
    // Entry mode simplified: always start a fresh matter (no resume flow)

    // Clear all selections and inputs
    const doClearAll = () => {
        // Close the confirmation dialog if open
        setIsClearDialogOpen(false);

        // Clear all the React state
        setSelectedDate(null);
        setTeamMember(defaultTeamMember);
        setSupervisingPartner('');
        setOriginatingSolicitor(defaultTeamMember);
        setClientType(initialClientType || '');
        // Only reset pending client type and POID selection if not in instruction mode
        if (!instructionRef) {
            setPendingClientType(''); // This will reset the client dots
            setSelectedPoidIds([]); // This will reset the client dots
        } else {
            // For instruction mode, clear everything and force refresh from instruction data
            setPendingClientType('');
            setSelectedPoidIds([]);
            setActivePoid(null); // Force refresh of instruction data
        }
        setAreaOfWork('');
        setPracticeArea('');
        setDescription('');
        setFolderStructure('');
        setDisputeValue('');
        setSource('search');
        setReferrerName('');
        setOpponentName('');
        setOpponentEmail('');
        setOpponentSolicitorName('');
        setOpponentSolicitorCompany('');
        setOpponentSolicitorEmail('');
        setNoConflict(false);
        setOpponentChoiceMade(false);
        setOpponentTitle('');
        setOpponentFirst('');
        setOpponentLast('');
        setOpponentPhone('');
        setOpponentHouseNumber('');
        setOpponentStreet('');
        setOpponentCity('');
        setOpponentCounty('');
        setOpponentPostcode('');
        setOpponentCountry('');
        setOpponentHasCompany(false);
        setOpponentCompanyName('');
        setOpponentCompanyNumber('');
        setOpponentType('');
        setSolicitorTitle('');
        setSolicitorFirst('');
        setSolicitorLast('');
        setSolicitorPhone('');
        setSolicitorHouseNumber('');
        setSolicitorStreet('');
        setSolicitorCity('');
        setSolicitorCounty('');
        setSolicitorPostcode('');
        setSolicitorCountry('');
        setSolicitorCompanyNumber('');
        setSummaryConfirmed(false); // Reset summary confirmation
        if (!instructionRef) {
            setActivePoid(null);
        }
        setCurrentStep(0); // This will reset the review dots
        setPoidSearchTerm('');
        
        // Clear all localStorage draft data
    if (!DISABLE_DRAFT_PERSISTENCE) clearMatterOpeningDraft();
    };

    // Determine if all processing steps completed successfully
    const allProcessingSucceeded = processingSteps.length > 0 && processingSteps.every(s => s.status === 'success');
    const currentInstructionRecord = useMemo(() => {
        if (!instructionRef || !Array.isArray(instructionRecords)) return null;
        return (instructionRecords as any[]).find(r => r?.InstructionRef === instructionRef) || null;
    }, [instructionRecords, instructionRef]);
    const cclGeneratedAtRaw =
        currentInstructionRecord?.CCL_date ||
        currentInstructionRecord?.CCLDate ||
        currentInstructionRecord?.ccl_date ||
        currentInstructionRecord?.cclDate ||
        '';
    const cclGeneratedAtLabel = useMemo(() => {
        if (!cclGeneratedAtRaw) return '';
        const parsed = new Date(cclGeneratedAtRaw);
        if (Number.isNaN(parsed.getTime())) return String(cclGeneratedAtRaw);
        return parsed.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }, [cclGeneratedAtRaw]);
    const cclQueuedAtRaw = backendCclQueuedAt || '';
    const cclStatusTimestamp = cclGeneratedAtLabel || cclQueuedAtRaw || '';
    const cclWorkflowStatus: 'generated' | 'queued' | 'pending' = cclGeneratedAtRaw
        ? 'generated'
        : cclQueuedAtRaw
            ? 'queued'
            : 'pending';



    // Set navigator content with breadcrumb stepper (matching FilterBanner aesthetic)
    useEffect(() => {
        setContent(
            <FilterBanner
                seamless={false}
                dense
                sticky={false}
                leftAction={
                    <IconButton
                        iconProps={{ iconName: 'ChevronLeft' }}
                        onClick={handleGoBack}
                        title="Back to instructions"
                        ariaLabel="Back to instructions"
                        styles={{
                            root: {
                                width: 32,
                                height: 32,
                            },
                            rootHovered: {
                                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#e7f1ff',
                            }
                        }}
                    />
                }
                primaryFilter={
                    <div className="stepper-breadcrumb" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 6,
                        fontSize: 14,
                        fontFamily: 'Raleway, sans-serif'
                    }}>
                        <button
                            onClick={handleBackToClients}
                            style={{
                                color: currentStep === 0 ? '#3690CE' : (clientsStepComplete ? '#666' : '#999'),
                                fontWeight: currentStep === 0 ? 600 : 500,
                                backgroundColor: currentStep === 0 ? 'rgba(54, 144, 206, 0.08)' : 'transparent',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                minHeight: '28px',
                                border: 'none',
                                padding: '4px 10px',
                                borderRadius: 0,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '14px',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (currentStep !== 0) {
                                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (currentStep !== 0) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }
                            }}
                        >
                            {clientsStepComplete && currentStep !== 0 ? (
                                <div style={{ 
                                    width: 16,
                                    height: 16,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    background: '#20b26c',
                                    color: '#fff'
                                }}>
                                    <svg width="9" height="8" viewBox="0 0 24 24" fill="none">
                                        <polyline points="5,13 10,18 19,7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                            ) : (
                                <i className="ms-Icon ms-Icon--People" style={{ fontSize: 13 }} />
                            )}
                            <span className="step-label">Select Parties</span>
                        </button>
                        
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}>
                            <path d="M9 6l6 6-6 6" stroke={isDarkMode ? '#9ca3af' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        
                        <button 
                            onClick={handleBackToForm}
                            disabled={currentStep === 0 || !clientsStepComplete}
                            style={{ 
                                background: currentStep === 1 ? 'rgba(54, 144, 206, 0.08)' : 'transparent',
                                border: 'none', 
                                color: currentStep === 1 ? '#3690CE' : (!clientsStepComplete ? '#ccc' : '#666'),
                                cursor: (currentStep === 0 || !clientsStepComplete) ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: 0,
                                fontWeight: currentStep === 1 ? 600 : 500,
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                minHeight: '28px',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (currentStep !== 1 && clientsStepComplete && currentStep !== 0) {
                                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (currentStep !== 1) {
                                    e.currentTarget.style.backgroundColor = currentStep === 1 ? 'rgba(54, 144, 206, 0.08)' : 'transparent';
                                }
                            }}
                        >
                            {currentStep === 2 ? (
                                <div style={{ 
                                    width: 16,
                                    height: 16,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    background: '#20b26c',
                                    color: '#fff'
                                }}>
                                    <svg width="9" height="8" viewBox="0 0 24 24" fill="none">
                                        <polyline points="5,13 10,18 19,7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                            ) : (
                                <i className="ms-Icon ms-Icon--OpenFolderHorizontal" style={{ fontSize: 13 }} />
                            )}
                            <span className="step-label">Build Matter</span>
                        </button>
                        
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}>
                            <path d="M9 6l6 6-6 6" stroke={isDarkMode ? '#9ca3af' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        
                        <button
                            onClick={handleGoToReview}
                            disabled={!matterStepComplete}
                            style={{
                                background: currentStep === 2 ? 'rgba(54, 144, 206, 0.08)' : 'transparent',
                                border: 'none',
                                color: currentStep === 2 ? '#3690CE' : (!matterStepComplete ? '#ccc' : '#666'),
                                cursor: !matterStepComplete ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: 0,
                                fontWeight: currentStep === 2 ? 600 : 500,
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                minHeight: '28px',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (currentStep !== 2 && matterStepComplete) {
                                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (currentStep !== 2) {
                                    e.currentTarget.style.backgroundColor = currentStep === 2 ? 'rgba(54, 144, 206, 0.08)' : 'transparent';
                                }
                            }}
                        >
                            {currentStep === 2 && summaryConfirmed ? (
                                <div style={{ 
                                    width: 16,
                                    height: 16,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    background: '#20b26c',
                                    color: '#fff'
                                }}>
                                    <svg width="9" height="8" viewBox="0 0 24 24" fill="none">
                                        <polyline points="5,13 10,18 19,7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                            ) : (
                                <i className="ms-Icon ms-Icon--CheckList" style={{ fontSize: 13 }} />
                            )}
                            <span className="step-label">Review and Confirm</span>
                        </button>
                    </div>
                }
                secondaryFilter={
                    hasDataToClear() ? (
                        <button 
                            type="button" 
                            onClick={handleClearAll} 
                            style={{
                                background: 'none',
                                border: '1px solid #e5e7eb',
                                borderRadius: 0,
                                padding: '4px 10px',
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#D65541',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap',
                                height: '28px'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#fef2f2';
                                e.currentTarget.style.borderColor = '#D65541';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.borderColor = '#e5e7eb';
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <path 
                                    d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2m-6 5v6m4-6v6" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                />
                            </svg>
                            Clear All
                            {getFieldCount() > 0 && (
                                <span style={{
                                    background: '#D65541',
                                    color: '#fff',
                                    borderRadius: '50%',
                                    width: '16px',
                                    height: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                }}>
                                    {getFieldCount()}
                                </span>
                            )}
                        </button>
                    ) : undefined
                }
                search={
                    currentStep === 0 && showPoidSelection && !((pendingClientType === 'Individual' || pendingClientType === 'Company') && selectedPoidIds.length > 0)
                        ? {
                            value: poidSearchTerm,
                            onChange: setPoidSearchTerm,
                            placeholder: 'Search parties...'
                        }
                        : undefined
                }
                rightActions={
                    instructionRef ? (
                        <div
                            title={cclStatusTimestamp ? `Updated ${cclStatusTimestamp}` : 'CCL automation status'}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                height: 28,
                                padding: '0 10px',
                                border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid #e5e7eb',
                                background: isDarkMode ? colours.dark.cardBackground : colours.grey,
                                color: isDarkMode ? colours.dark.text : colours.darkBlue,
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    background:
                                        cclWorkflowStatus === 'generated'
                                            ? colours.green
                                            : cclWorkflowStatus === 'queued'
                                                ? colours.blue
                                                : colours.subtleGrey
                                }}
                            />
                            {cclWorkflowStatus === 'generated'
                                ? 'CCL generated'
                                : cclWorkflowStatus === 'queued'
                                    ? 'CCL queued'
                                    : 'CCL pending'}
                        </div>
                    ) : undefined
                }
            />
        );
        
        // Cleanup when component unmounts
        return () => {
            setContent(null);
        };
    }, [setContent, currentStep, clientsStepComplete, matterStepComplete, summaryConfirmed, hasDataToClear, getFieldCount, showPoidSelection, pendingClientType, selectedPoidIds, poidSearchTerm, handleBackToClients, handleBackToForm, handleGoToReview, handleClearAll, handleGoBack, isDarkMode, instructionRef, cclStatusTimestamp, cclWorkflowStatus]);

    // Render the horizontal sliding carousel
    return (
        <CompletionProvider>
            {/* CSS animations for search controls */}
            <style>{`
                @keyframes cascadeSlideIn {
                    from {
                        opacity: 0;
                        transform: translateX(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                
                /* CSS animations for search controls - slide out removed to prevent glitches */
                        
                        /* Opponent details slide in animation */
                        @keyframes slideInFromTop {
                            from {
                                opacity: 0;
                                transform: translateY(20px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                        
                        /* Responsive header breakpoints */
                        @media (max-width: 900px) {
                            .persistent-header {
                                flex-wrap: wrap !important;
                                padding: 12px 16px !important;
                            }
                            .persistent-header > div:first-child {
                                order: 1;
                                width: 100%;
                                margin-bottom: 8px;
                            }
                            .persistent-header > div:last-child {
                                order: 2;
                                width: 100%;
                                justify-content: flex-end;
                            }
                        }
                        
                        @media (max-width: 600px) {
                            .persistent-header button {
                                font-size: 12px !important;
                                padding: 4px 8px !important;
                                gap: 4px !important;
                            }
                            .persistent-header button svg,
                            .persistent-header button i {
                                font-size: 12px !important;
                            }
                        }

                        /* Mobile responsiveness foundations */
                        @media (max-width: 640px) {
                            /* Step panels: tighter padding on mobile */
                            .matter-step-panel {
                                padding: 10px !important;
                            }
                            
                            /* Step 2 card: tighter padding */
                            .matter-step-panel > div {
                                padding: 16px !important;
                            }
                            
                            /* Stepper breadcrumb: smaller text, tighter gaps */
                            .stepper-breadcrumb {
                                gap: 4px !important;
                                font-size: 12px !important;
                            }
                            .stepper-breadcrumb button {
                                padding: 3px 6px !important;
                                font-size: 12px !important;
                            }
                            .stepper-breadcrumb svg {
                                width: 12px !important;
                                height: 12px !important;
                            }
                            
                            /* Budget grid: stack on mobile */
                            .matter-step-panel div[style*="gridTemplateColumns"] {
                                grid-template-columns: 1fr !important;
                            }
                        }
                        
                        @media (max-width: 480px) {
                            /* Stepper breadcrumb: hide label text, show icons only */
                            .stepper-breadcrumb button span.step-label {
                                display: none;
                            }
                            
                            /* Even tighter step panel padding */
                            .matter-step-panel {
                                padding: 6px !important;
                            }
                        }
                    `}</style>

                    {/* Generic entry choice modal removed: client type question handles this selection */}

                    {/* Add CSS animation for completion ticks */}
                    <style>{`
                        @keyframes tickPop {
                            from {
                                opacity: 0;
                                transform: scale(0);
                            }
                            to {
                                opacity: 1;
                                transform: scale(1);
                            }
                        }
                        
                        .completion-tick {
                            animation: tickPop 0.3s ease;
                        }
                        
                        .completion-tick.visible {
                            opacity: 1;
                            transform: scale(1);
                        }
                    `}</style>

                    {/* Sliding Container */}
                    <div ref={carouselRef} style={{ 
                        overflowX: 'hidden',
                        overflowY: 'visible',
                        position: 'relative',
                        width: '100%',
                        minHeight: '320px'
                    }}>
                        <div style={{ 
                            display: 'flex',
                            width: '300%', // 3 panels * 100% each
                            transform: `translateX(-${currentStep * 33.333}%)`,
                            transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            alignItems: 'flex-start',
                        }}>
                            
                            {/* Step 1: Client Selection */}
                            <div className="matter-step-panel" style={{ 
                                width: '33.333%', 
                                padding: '16px', 
                                boxSizing: 'border-box' 
                            }}>
                                <div style={{ 
                                    width: '100%', 
                                    maxWidth: 1080, 
                                    margin: '0 auto 16px auto' 
                                }}>
                                    {/** Hide the selection UI entirely for instruction-driven entry */}
                                    <PoidSelectionStep
                                        poidData={displayPoidData}
                                        teamData={teamData}
                                        filteredPoidData={filteredPoidData}
                                        visiblePoidCount={visiblePoidCount}
                                        selectedPoidIds={selectedPoidIds}
                                        preselectedPoidIds={preselectedPoidIds}
                                        poidSearchTerm={poidSearchTerm}
                                        setPoidSearchTerm={setPoidSearchTerm}
                                        poidGridRef={poidGridRef}
                                        handlePoidClick={handlePoidClick}
                                        pendingClientType={pendingClientType}
                                        setPendingClientType={setPendingClientType}
                                        onClientTypeChange={handleClientTypeChange}
                                        clientAsOnFile={clientAsOnFile}
                                        setClientAsOnFile={setClientAsOnFile}
                                        hideClientSections={hideClientSections || !!instructionRef}
                                        instructionRef={instructionRef}
                                        matterRef={matterIdState || matterRef || ''}
                                        onRunIdCheck={onRunIdCheck}
                                        demoModeEnabled={demoModeEnabled}
                                        onDemoEidResult={handleDemoEidResult}
                                    />
                                </div>
                                
                                {/* Opponent Details Step - appears after POID selection OR when in instruction mode */}
                                {((selectedPoidIds.length > 0 && pendingClientType) || (hideClientSections && (initialClientType || pendingClientType || 'Individual'))) && (
                                    <div style={{ 
                                        width: '100%', 
                                        maxWidth: 1080, 
                                        margin: '16px auto 0 auto',
                                        animation: 'cascadeSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                                        animationDelay: '0ms',
                                        opacity: 0,
                                        transform: 'translateY(20px)'
                                    }}>
                                        <OpponentDetailsStep
                                            opponentName={opponentName}
                                            setOpponentName={setOpponentNameWithReset}
                                            opponentEmail={opponentEmail}
                                            setOpponentEmail={setOpponentEmailWithReset}
                                            opponentSolicitorName={opponentSolicitorName}
                                            setOpponentSolicitorName={setOpponentSolicitorNameWithReset}
                                            opponentSolicitorCompany={opponentSolicitorCompany}
                                            setOpponentSolicitorCompany={setOpponentSolicitorCompanyWithReset}
                                            opponentSolicitorEmail={opponentSolicitorEmail}
                                            setOpponentSolicitorEmail={setOpponentSolicitorEmailWithReset}
                                            noConflict={noConflict}
                                            setNoConflict={setNoConflict}
                                            disputeValue={disputeValue}
                                            setDisputeValue={setDisputeValue}
                                            opponentTitle={opponentTitle}
                                            setOpponentTitle={setOpponentTitle}
                                            opponentFirst={opponentFirst}
                                            setOpponentFirst={setOpponentFirst}
                                            opponentLast={opponentLast}
                                            setOpponentLast={setOpponentLast}
                                            opponentPhone={opponentPhone}
                                            setOpponentPhone={setOpponentPhone}
                                            opponentHouseNumber={opponentHouseNumber}
                                            setOpponentHouseNumber={setOpponentHouseNumber}
                                            opponentStreet={opponentStreet}
                                            setOpponentStreet={setOpponentStreet}
                                            opponentCity={opponentCity}
                                            setOpponentCity={setOpponentCity}
                                            opponentCounty={opponentCounty}
                                            setOpponentCounty={setOpponentCounty}
                                            opponentPostcode={opponentPostcode}
                                            setOpponentPostcode={setOpponentPostcode}
                                            opponentCountry={opponentCountry}
                                            setOpponentCountry={setOpponentCountry}
                                            opponentHasCompany={opponentHasCompany}
                                            setOpponentHasCompany={setOpponentHasCompany}
                                            opponentCompanyName={opponentCompanyName}
                                            setOpponentCompanyName={setOpponentCompanyName}
                                            opponentCompanyNumber={opponentCompanyNumber}
                                            setOpponentCompanyNumber={setOpponentCompanyNumber}
                                            solicitorTitle={solicitorTitle}
                                            setSolicitorTitle={setSolicitorTitle}
                                            solicitorFirst={solicitorFirst}
                                            setSolicitorFirst={setSolicitorFirst}
                                            solicitorLast={solicitorLast}
                                            setSolicitorLast={setSolicitorLast}
                                            solicitorPhone={solicitorPhone}
                                            setSolicitorPhone={setSolicitorPhone}
                                            solicitorHouseNumber={solicitorHouseNumber}
                                            setSolicitorHouseNumber={setSolicitorHouseNumber}
                                            solicitorStreet={solicitorStreet}
                                            setSolicitorStreet={setSolicitorStreet}
                                            solicitorCity={solicitorCity}
                                            setSolicitorCity={setSolicitorCity}
                                            solicitorCounty={solicitorCounty}
                                            setSolicitorCounty={setSolicitorCounty}
                                            solicitorPostcode={solicitorPostcode}
                                            setSolicitorPostcode={setSolicitorPostcode}
                                            solicitorCountry={solicitorCountry}
                                            setSolicitorCountry={setSolicitorCountry}
                                            solicitorCompanyNumber={solicitorCompanyNumber}
                                            setSolicitorCompanyNumber={setSolicitorCompanyNumber}
                                            opponentChoiceMade={opponentChoiceMade}
                                            setOpponentChoiceMade={setOpponentChoiceMade}
                                            clientName={clientDisplayName}
                                            matterDescription={description}
                                            demoModeEnabled={demoModeEnabled}
                                        />
                                    </div>
                                )}
                                
                                {/* Continue to Matter Details Button */}
                                <div style={{ 
                                    marginTop: 24, 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    alignItems: 'flex-end',
                                    padding: '16px 0'
                                }}>
                                    {!clientsStepComplete && (
                                        <div style={{ fontSize: 12, color: isDarkMode ? '#6B7280' : '#94A3B8', marginBottom: 8 }}>
                                            Complete the fields above to continue
                                        </div>
                                    )}
                                    <button
                                        onClick={clientsStepComplete ? handleContinueToForm : undefined}
                                        disabled={!clientsStepComplete}
                                        style={{
                                            minWidth: '200px',
                                            padding: '12px 20px',
                                            backgroundColor: clientsStepComplete ? colours.highlight : (isDarkMode ? colours.dark.disabledBackground : '#f3f2f1'),
                                            color: clientsStepComplete ? 'white' : (isDarkMode ? colours.dark.text : '#323130'),
                                            border: clientsStepComplete ? 'none' : `1px solid ${isDarkMode ? colours.dark.borderColor : '#d2d0ce'}`,
                                            borderRadius: 0,
                                            cursor: clientsStepComplete ? 'pointer' : 'not-allowed',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 10,
                                            fontSize: 13,
                                            fontWeight: 700,
                                            textTransform: 'uppercase' as any,
                                            letterSpacing: '0.5px',
                                            transition: 'background-color 0.15s',
                                            boxShadow: 'none'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (clientsStepComplete) {
                                                e.currentTarget.style.backgroundColor = '#2563EB';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (clientsStepComplete) {
                                                e.currentTarget.style.backgroundColor = colours.highlight;
                                            }
                                        }}
                                    >
                                        Continue to Matter Details
                                        <i className="ms-Icon ms-Icon--ChevronRight" style={{ fontSize: 11 }} />
                                    </button>
                                </div>
                            </div>

                            {/* Step 2: Build Matter */}
                            <div className="matter-step-panel" style={{ 
                                width: '33.333%', 
                                padding: '16px', 
                                boxSizing: 'border-box' 
                            }}>
                                {/* Single unified card */}
                                <div style={{
                                    width: '100%', maxWidth: 1080, margin: '0 auto',
                                    background: isDarkMode ? '#0F172A' : '#FFFFFF',
                                    border: isDarkMode ? '1px solid #374151' : '1px solid #CBD5E1',
                                    borderRadius: 2, padding: 24, boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.04)', boxSizing: 'border-box',
                                }}>
                                    {/* Page header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 0,
                                            background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
                                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <i className="ms-Icon ms-Icon--Suitcase" style={{ fontSize: 14, color: colours.highlight }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#E5E7EB' : '#0F172A' }}>Build Matter</div>
                                            <div style={{ fontSize: 10, color: isDarkMode ? '#9CA3AF' : '#475569' }}>Configure the Clio matter record, team, and classification</div>
                                        </div>
                                    </div>
                                    <div style={{ height: 1, background: isDarkMode ? '#334155' : '#CBD5E1', margin: '14px 0 20px' }} />

                                    {/* ...-- TEAM ...-- */}
                                    <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 10 }}>Team</div>
                                    {solicitorOptions.length === 0 && (
                                        <div style={{ fontSize: 11, color: isDarkMode ? '#F59E0B' : '#D97706', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <i className="ms-Icon ms-Icon--Warning" style={{ fontSize: 12 }} />
                                            {!teamData ? 'Loading team data...' : 'No active team members found'}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                        {[
                                            { label: 'Responsible Solicitor', value: teamMember, onChange: (v: string) => setTeamMember(v) },
                                            { label: 'Originating Solicitor', value: originatingSolicitor, onChange: (v: string) => setOriginatingSolicitor(v) },
                                        ].map(({ label, value, onChange }) => (
                                            <div key={label} style={{ flex: '1 1 0%', minWidth: 180 }}>
                                                <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 4 }}>{label}</div>
                                                <div style={{ position: 'relative' }}>
                                                    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
                                                        width: '100%', height: 36,
                                                        border: `1px solid ${value ? colours.highlight : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                        borderRadius: 0,
                                                        backgroundColor: value ? (isDarkMode ? '#1F2937' : `${colours.highlight}08`) : (isDarkMode ? '#111827' : '#F8FAFC'),
                                                        padding: '0 28px 0 10px', fontSize: 12, fontWeight: value ? 600 : 400,
                                                        color: value ? (isDarkMode ? '#E5E7EB' : '#0F172A') : (isDarkMode ? '#6B7280' : '#94A3B8'),
                                                        cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
                                                        WebkitAppearance: 'none' as any, MozAppearance: 'none' as any,
                                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239CA3AF' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                                                        backgroundRepeat: 'no-repeat',
                                                        backgroundPosition: 'right 10px center',
                                                        backgroundSize: '10px 6px',
                                                    }}>
                                                        <option value="" disabled>{solicitorOptions.length === 0 ? (teamData ? 'No team members' : 'Loading-') : 'Select...'}</option>
                                                        {solicitorOptions.map((name: string) => (<option key={name} value={name}>{name}</option>))}
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginBottom: 0 }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 4 }}>Supervising Partner</div>
                                        <ModernMultiSelect
                                            label=""
                                            options={partnerOptionsList.map((name: string) => ({ key: name, text: name }))}
                                            selectedValue={supervisingPartner}
                                            onSelectionChange={setSupervisingPartner}
                                            variant="grid"
                                        />
                                    </div>

                                    <div style={{ height: 1, background: isDarkMode ? '#334155' : '#CBD5E1', margin: '20px 0' }} />

                                    {/* ...-- MATTER DETAILS ...-- */}
                                    <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 10 }}>Matter Details</div>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 4 }}>Description</div>
                                        <input
                                            type="text" value={description} onChange={(e) => setDescriptionWithReset(e.target.value)}
                                            placeholder="e.g. Lease Renewal, Contract Dispute, Debt Recovery"
                                            style={{
                                                width: '100%', height: 36,
                                                border: `1px solid ${description ? colours.highlight : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                borderRadius: 0,
                                                background: description ? (isDarkMode ? '#1F2937' : `${colours.highlight}08`) : (isDarkMode ? '#111827' : '#F8FAFC'),
                                                padding: '0 10px', fontSize: 12, fontWeight: description ? 600 : 400,
                                                color: isDarkMode ? '#E5E7EB' : '#0F172A',
                                                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 6 }}>Folder Template</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {['Default / Commercial', 'Residential Possession', 'Adjudication', 'Employment'].map((opt) => {
                                                const isActive = folderStructure === opt;
                                                return (
                                                    <button key={opt} onClick={() => {
                                                        setFolderStructureWithReset(opt);
                                                        if (opt === 'Default / Commercial') setAreaOfWorkWithReset('Commercial');
                                                        else if (opt === 'Residential Possession') setAreaOfWorkWithReset('Property');
                                                        else if (opt === 'Adjudication') setAreaOfWorkWithReset('Construction');
                                                        else if (opt === 'Employment') setAreaOfWorkWithReset('Employment');
                                                    }} style={{
                                                        padding: '6px 12px', fontSize: 11, fontWeight: isActive ? 700 : 500,
                                                        border: `1px solid ${isActive ? colours.highlight : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                        borderRadius: 0,
                                                        background: isActive ? (isDarkMode ? `${colours.highlight}18` : `${colours.highlight}10`) : (isDarkMode ? '#111827' : '#F8FAFC'),
                                                        color: isActive ? colours.highlight : (isDarkMode ? '#9CA3AF' : '#475569'),
                                                        cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                                                    }}>
                                                        {opt}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div style={{ height: 1, background: isDarkMode ? '#334155' : '#CBD5E1', margin: '20px 0' }} />

                                    {/* ...-- CLASSIFICATION ...-- */}
                                    <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 10 }}>Classification</div>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 6 }}>Area of Work</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {([
                                                { type: 'Commercial', color: colours.blue },
                                                { type: 'Property', color: colours.green },
                                                { type: 'Construction', color: colours.orange },
                                                { type: 'Employment', color: colours.yellow },
                                            ] as const).map(({ type, color }) => {
                                                const isActive = areaOfWork === type;
                                                return (
                                                    <button key={type} onClick={() => setAreaOfWorkWithReset(type)} style={{
                                                        padding: '6px 14px', fontSize: 11, fontWeight: isActive ? 700 : 500,
                                                        border: `1px solid ${isActive ? color : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                        borderRadius: 0,
                                                        background: isActive ? (isDarkMode ? `${color}18` : `${color}10`) : (isDarkMode ? '#111827' : '#F8FAFC'),
                                                        color: isActive ? color : (isDarkMode ? '#9CA3AF' : '#475569'),
                                                        cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.3px',
                                                        transition: 'border-color 0.15s, background 0.15s',
                                                    }}>
                                                        {type}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 4 }}>Practice Area</div>
                                        {areaOfWork ? (
                                            <div style={{ position: 'relative' }}>
                                                {/* Use area-of-work colour cue for practice area select */}
                                                <select value={practiceArea} onChange={(e) => setPracticeAreaWithReset(e.target.value)} style={{
                                                    width: '100%', height: 36,
                                                    border: `1px solid ${practiceArea ? aowColor : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                    borderRadius: 0,
                                                    background: practiceArea ? (isDarkMode ? `${aowColor}18` : `${aowColor}08`) : (isDarkMode ? '#111827' : '#F8FAFC'),
                                                    padding: '0 28px 0 10px', fontSize: 12, fontWeight: practiceArea ? 600 : 400,
                                                    color: practiceArea ? (isDarkMode ? '#E5E7EB' : '#0F172A') : (isDarkMode ? '#6B7280' : '#94A3B8'),
                                                    appearance: 'none' as const, cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
                                                }}>
                                                    <option value="" disabled>Select practice area...</option>
                                                    {(practiceAreasByArea[areaOfWork] || []).filter((pa: string) => pa !== areaOfWork).map((pa: string) => (
                                                        <option key={pa} value={pa}>{pa}</option>
                                                    ))}
                                                </select>
                                                <i className="ms-Icon ms-Icon--ChevronDown" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: isDarkMode ? '#6B7280' : '#94A3B8', pointerEvents: 'none' }} />
                                                {!practiceArea && (
                                                    <div style={{ marginTop: 4, fontSize: 10, color: colours.cta, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <i className="ms-Icon ms-Icon--Warning" style={{ fontSize: 10 }} />
                                                        Required — select a practice area to proceed
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8', fontStyle: 'italic', padding: '8px 0' }}>
                                                Select area of work first
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ height: 1, background: isDarkMode ? '#334155' : '#CBD5E1', margin: '20px 0' }} />

                                    {/* ...-- VALUE & SOURCE ...-- */}
                                    <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 10 }}>Value & Source</div>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 6 }}>Dispute Value</div>
                                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                            {[
                                                { label: 'Under £10k', value: 'Less than £10k' },
                                                { label: '£10k - £500k', value: '£10k - £500k' },
                                                { label: '£500k - £1m', value: '£500k - £1m' },
                                                { label: '£1m - £5m', value: '£1m - £5m' },
                                                { label: '£5m - £20m', value: '£5 - £20m' },
                                                { label: '£20m+', value: '£20m+' },
                                            ].map(({ label, value }) => {
                                                const isActive = disputeValue === value;
                                                return (
                                                    <button key={value} onClick={() => setDisputeValueWithReset(value)} style={{
                                                        padding: '6px 12px', fontSize: 11, fontWeight: isActive ? 700 : 500,
                                                        border: `1px solid ${isActive ? colours.highlight : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                        borderRadius: 0,
                                                        background: isActive ? (isDarkMode ? `${colours.highlight}18` : `${colours.highlight}10`) : (isDarkMode ? '#111827' : '#F8FAFC'),
                                                        color: isActive ? colours.highlight : (isDarkMode ? '#9CA3AF' : '#475569'),
                                                        cursor: 'pointer', whiteSpace: 'nowrap',
                                                        transition: 'border-color 0.15s, background 0.15s',
                                                    }}>
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 6 }}>Source</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {[
                                                { key: 'search', label: 'Search' },
                                                { key: 'referral', label: 'Referral' },
                                                { key: 'your following', label: 'Following' },
                                                { key: 'uncertain', label: 'Uncertain' },
                                            ].map(({ key, label }) => {
                                                const isActive = source === key;
                                                return (
                                                    <button key={key} onClick={() => { setSource(key); if (key !== 'referral') setReferrerName(''); }} style={{
                                                        padding: '6px 12px', fontSize: 11, fontWeight: isActive ? 700 : 500,
                                                        border: `1px solid ${isActive ? colours.highlight : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                        borderRadius: 0,
                                                        background: isActive ? (isDarkMode ? `${colours.highlight}18` : `${colours.highlight}10`) : (isDarkMode ? '#111827' : '#F8FAFC'),
                                                        color: isActive ? colours.highlight : (isDarkMode ? '#9CA3AF' : '#475569'),
                                                        cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.3px',
                                                        transition: 'border-color 0.15s, background 0.15s',
                                                    }}>
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {source === 'referral' && (
                                            <input type="text" value={referrerName} onChange={(e) => setReferrerName(e.target.value)} placeholder="Referrer name"
                                                style={{
                                                    marginTop: 8, width: '100%', height: 36,
                                                    border: `1px solid ${referrerName ? colours.highlight : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                    borderRadius: 0, background: isDarkMode ? '#111827' : '#F8FAFC',
                                                    padding: '0 10px', fontSize: 12, color: isDarkMode ? '#E5E7EB' : '#0F172A',
                                                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* ...-- BUDGET (local only) ...-- */}
                                    {(typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                                        <>
                                            <div style={{ height: 1, background: isDarkMode ? '#334155' : '#CBD5E1', margin: '20px 0' }} />
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: -10, right: 0, background: '#DB2777', color: '#FFF', fontSize: 8, fontWeight: 700, padding: '1px 5px', letterSpacing: '0.5px' }}>LOCAL</div>
                                                <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 8 }}>Budget</div>
                                                <div style={{ display: 'flex', gap: 6, marginBottom: budgetRequired === 'Yes' ? 10 : 0 }}>
                                                    {['Yes', 'No'].map((opt) => (
                                                        <button key={opt} onClick={() => setBudgetRequired(opt)} style={{
                                                            padding: '6px 12px', fontSize: 11, fontWeight: budgetRequired === opt ? 700 : 500,
                                                            border: `1px solid ${budgetRequired === opt ? colours.highlight : (isDarkMode ? '#334155' : '#CBD5E1')}`,
                                                            borderRadius: 0, background: budgetRequired === opt ? `${colours.highlight}18` : 'transparent',
                                                            color: budgetRequired === opt ? colours.highlight : (isDarkMode ? '#9CA3AF' : '#475569'),
                                                            cursor: 'pointer', transition: 'border-color 0.15s',
                                                        }}>{opt}</button>
                                                    ))}
                                                </div>
                                                {budgetRequired === 'Yes' && (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
                                                        {[
                                                            { label: 'Amount', value: budgetAmount, onChange: setBudgetAmount, placeholder: '£' },
                                                            { label: 'Notify %', value: budgetThreshold, onChange: setBudgetThreshold, placeholder: '%' },
                                                            { label: 'Notify', value: budgetNotifyUsers, onChange: setBudgetNotifyUsers, placeholder: 'emails' },
                                                        ].map(({ label, value, onChange, placeholder }) => (
                                                            <div key={label}>
                                                                <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#CBD5E1' : '#374151', marginBottom: 2 }}>{label}</div>
                                                                <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', height: 32, border: `1px solid ${isDarkMode ? '#334155' : '#CBD5E1'}`, borderRadius: 0, background: isDarkMode ? '#111827' : '#F8FAFC', padding: '0 8px', fontSize: 12, color: isDarkMode ? '#E5E7EB' : '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {/* ...-- Navigation ...-- */}
                                    <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${isDarkMode ? '#334155' : '#CBD5E1'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <button onClick={handleBackToClients} style={{
                                            background: 'transparent', border: `1px solid ${isDarkMode ? '#334155' : '#CBD5E1'}`, borderRadius: 0,
                                            padding: '8px 16px', fontSize: 11, fontWeight: 700, color: isDarkMode ? '#CBD5E1' : '#374151',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                            textTransform: 'uppercase' as const, letterSpacing: '0.5px', transition: 'border-color 0.15s',
                                        }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colours.highlight; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = isDarkMode ? '#334155' : '#CBD5E1'; }}
                                        >
                                            <i className="ms-Icon ms-Icon--ChevronLeft" style={{ fontSize: 10 }} />
                                            Back
                                        </button>
                                        <button onClick={matterStepComplete ? handleGoToReview : undefined} disabled={!matterStepComplete} style={{
                                            background: matterStepComplete ? colours.highlight : (isDarkMode ? '#1F2937' : '#E5E7EB'), border: 'none', borderRadius: 0,
                                            padding: '8px 16px', fontSize: 11, fontWeight: 700, color: matterStepComplete ? '#FFFFFF' : (isDarkMode ? '#4B5563' : '#9CA3AF'),
                                            cursor: matterStepComplete ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6,
                                            textTransform: 'uppercase' as const, letterSpacing: '0.5px', transition: 'all 0.15s', boxShadow: 'none',
                                            opacity: matterStepComplete ? 1 : 0.7,
                                        }}
                                            title={!matterStepComplete ? 'Complete all required fields (area of work, practice area, description, date, team) before reviewing' : undefined}
                                            onMouseEnter={(e) => { if (matterStepComplete) e.currentTarget.style.backgroundColor = '#2563EB'; }}
                                            onMouseLeave={(e) => { if (matterStepComplete) e.currentTarget.style.backgroundColor = colours.highlight; }}
                                        >
                                            Review
                                            <i className="ms-Icon ms-Icon--ChevronRight" style={{ fontSize: 10 }} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Step 3: Review Summary */}
                            <div className="matter-step-panel" style={{ width: '33.333%', padding: '16px', boxSizing: 'border-box' }}>
                                    {/* Diagnostic Assistant - compact inline bar */}
                                    {debugInspectorOpen && (
                                        <div style={{
                                            marginBottom: 16,
                                            borderRadius: 10,
                                            overflow: 'hidden',
                                            border: isDarkMode ? '1px solid rgba(214,85,65,0.3)' : '1px solid rgba(214,85,65,0.2)',
                                            background: isDarkMode ? 'rgba(214,85,65,0.06)' : 'rgba(254,242,242,0.8)',
                                        }}>
                                            {/* Header bar */}
                                            <div style={{
                                                padding: '8px 14px',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                background: isDarkMode ? 'rgba(214,85,65,0.1)' : 'rgba(214,85,65,0.06)',
                                                borderBottom: debugAdvancedOpen ? (isDarkMode ? '1px solid rgba(214,85,65,0.2)' : '1px solid rgba(214,85,65,0.12)') : 'none',
                                            }}>
                                                <i className="ms-Icon ms-Icon--Medical" style={{ fontSize: 12, color: failureSummary ? '#ef4444' : '#10b981' }} />
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, flex: 1,
                                                    color: failureSummary ? (isDarkMode ? '#FCA5A5' : '#b91c1c') : (isDarkMode ? '#86EFAC' : '#166534'),
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const
                                                }}>
                                                    {failureSummary || 'No issues detected'}
                                                </span>
                                                {/* One-click report email */}
                                                <button
                                                    onClick={async () => {
                                                        if (reportDelivered) return;
                                                        try {
                                                            setSupportSending(true);
                                                            const report = {
                                                                issue: failureSummary || 'General diagnostic report',
                                                                user: userInitials, instruction: instructionRef || 'N/A',
                                                                timestamp: new Date().toLocaleString(),
                                                                formData: generateSampleJson(),
                                                                processingSteps: processingSteps.map(s => ({ label: s.label, status: s.status, message: s.message })),
                                                                url: window.location.href
                                                            };
                                                            const html = `<h2>Matter Opening ${failureSummary ? 'Issue' : 'Feedback'}</h2><pre>${JSON.stringify(report, null, 2)}</pre>`;
                                                            const resp = await fetch('/api/sendEmail', {
                                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ to: 'lz@helix-law.com', subject: `Matter Opening ${failureSummary ? 'Issue' : 'Feedback'} - ${userInitials}`, html, from_email: 'automations@helix-law.com' })
                                                            });
                                                            if (resp.ok) {
                                                                setReportDelivered(true);
                                                            } else {
                                                                showToast({ type: 'error', title: 'Failed', message: 'Could not send report.' });
                                                            }
                                                        } catch { showToast({ type: 'error', title: 'Failed', message: 'Network error.' }); }
                                                        finally { setSupportSending(false); }
                                                    }}
                                                    disabled={supportSending || reportDelivered}
                                                    style={{
                                                        padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                        background: reportDelivered
                                                            ? (isDarkMode ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)')
                                                            : (isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.08)'),
                                                        border: reportDelivered
                                                            ? (isDarkMode ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(16,185,129,0.2)')
                                                            : (isDarkMode ? '1px solid rgba(214,85,65,0.3)' : '1px solid rgba(214,85,65,0.2)'),
                                                        color: reportDelivered
                                                            ? '#10b981'
                                                            : (isDarkMode ? '#FCA5A5' : '#b91c1c'),
                                                        cursor: reportDelivered ? 'default' : (supportSending ? 'wait' : 'pointer'),
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    }}
                                                >
                                                    <i className={`ms-Icon ${reportDelivered ? 'ms-Icon--Accept' : (supportSending ? 'ms-Icon--Clock' : 'ms-Icon--Mail')}`} style={{ fontSize: 9 }} />
                                                    {reportDelivered ? 'Sent' : (supportSending ? 'Sending' : 'Report')}
                                                </button>
                                                {/* Expand/collapse advanced */}
                                                <button
                                                    onClick={() => setDebugAdvancedOpen(!debugAdvancedOpen)}
                                                    style={{
                                                        padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                        background: 'transparent',
                                                        border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                                        color: isDarkMode ? '#6B7280' : '#94A3B8',
                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3
                                                    }}
                                                >
                                                    <i className="ms-Icon ms-Icon--DeveloperTools" style={{ fontSize: 9 }} />
                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: debugAdvancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                                                        <polyline points="6,9 12,15 18,9"/>
                                                    </svg>
                                                </button>
                                                {/* Close */}
                                                <button
                                                    onClick={() => setDebugInspectorOpen(false)}
                                                    style={{
                                                        padding: 2, background: 'transparent', border: 'none',
                                                        color: isDarkMode ? '#6B7280' : '#94A3B8', cursor: 'pointer', fontSize: 11
                                                    }}
                                                >
                                                    <i className="ms-Icon ms-Icon--Cancel" />
                                                </button>
                                            </div>

                                            {/* Collapsible detail */}
                                            {debugAdvancedOpen && (
                                                <div style={{ padding: '10px 14px', display: 'grid', gap: 8, fontSize: 11 }}>
                                                    {/* Step status compact 2-col grid */}
                                                    {processingSteps.length > 0 && (
                                                        <div style={{
                                                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px',
                                                        }}>
                                                            {processingSteps.map((step, idx) => (
                                                                <div key={`diag-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                                                                    <span style={{ fontSize: 10, color: isDarkMode ? '#6B7280' : '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '70%' }}>{step.label}</span>
                                                                    <span style={{
                                                                        fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
                                                                        background: step.status === 'success' ? 'rgba(16,185,129,0.12)' : step.status === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.1)',
                                                                        color: step.status === 'success' ? '#10b981' : step.status === 'error' ? '#ef4444' : '#9CA3AF'
                                                                    }}>
                                                                        {step.status === 'success' ? 'OK' : step.status === 'error' ? 'ERR' : '\u2014'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {/* JSON dump */}
                                                    <details style={{ marginTop: 4 }}>
                                                        <summary style={{ fontSize: 10, color: isDarkMode ? '#6B7280' : '#94A3B8', cursor: 'pointer', fontWeight: 600 }}>Form JSON</summary>
                                                        <pre style={{
                                                            margin: '4px 0 0', padding: 6, fontSize: 8, lineHeight: 1.3,
                                                            background: isDarkMode ? 'rgba(0,0,0,0.2)' : '#F8FAFC',
                                                            border: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #E2E8F0',
                                                            borderRadius: 4, maxHeight: 120, overflow: 'auto',
                                                            whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
                                                            color: isDarkMode ? '#6B7280' : '#64748B'
                                                        }}>{JSON.stringify(generateSampleJson(), null, 2)}</pre>
                                                    </details>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Review header - breadcrumb + heading */}
                                    <div style={{ marginBottom: 20 }}>
                                        {/* Progress breadcrumb */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            marginBottom: 14,
                                        }}>
                                            {['Parties', 'Matter', 'Review'].map((step, i) => (
                                                <React.Fragment key={step}>
                                                    {i > 0 && (
                                                        <div style={{
                                                            width: 20, height: 1,
                                                            background: isDarkMode ? '#374151' : '#D1D5DB'
                                                        }} />
                                                    )}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <div style={{
                                                            width: 18, height: 18, borderRadius: '50%',
                                                            background: i < 2
                                                                ? (isDarkMode ? 'rgba(32,178,108,0.15)' : 'rgba(32,178,108,0.1)')
                                                                : `${aowColor}20`,
                                                            border: i < 2
                                                                ? '1.5px solid #20b26c'
                                                                : `1.5px solid ${aowColor}`,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            transition: 'all 0.3s ease'
                                                        }}>
                                                            {i < 2 ? (
                                                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                                                                    <polyline points="20,6 9,17 4,12" stroke="#20b26c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                                </svg>
                                                            ) : (
                                                                <div style={{
                                                                    width: 5, height: 5, borderRadius: '50%',
                                                                    background: aowColor
                                                                }} />
                                                            )}
                                                        </div>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: i === 2 ? 700 : 500,
                                                            color: i === 2
                                                                ? (isDarkMode ? '#F3F4F6' : '#1F2937')
                                                                : (isDarkMode ? '#6B7280' : '#9CA3AF'),
                                                            letterSpacing: '0.02em'
                                                        }}>
                                                            {step}
                                                        </span>
                                                    </div>
                                                </React.Fragment>
                                            ))}
                                            <div style={{ flex: 1 }} />
                                            {/* AOW pill */}
                                            <div style={{
                                                padding: '3px 10px', borderRadius: 4,
                                                background: isDarkMode ? `${aowColor}15` : `${aowColor}10`,
                                                border: `1px solid ${aowColor}30`,
                                                fontSize: 10, fontWeight: 700, color: aowColor,
                                                textTransform: 'uppercase' as const,
                                                letterSpacing: '0.05em'
                                            }}>
                                                {areaOfWork || 'General'}
                                            </div>
                                        </div>
                                        {/* Heading */}
                                        <div style={{
                                            fontSize: 18, fontWeight: 800,
                                            color: isDarkMode ? '#F3F4F6' : '#0F172A',
                                            letterSpacing: '-0.02em', lineHeight: 1.2,
                                            marginBottom: 3
                                        }}>
                                            Review &amp; Confirm
                                        </div>
                                        <div style={{
                                            fontSize: 13, color: isDarkMode ? '#6B7280' : '#94A3B8',
                                            lineHeight: 1.4
                                        }}>
                                            Everything below will be sent to Clio, Asana, and your matter folder. Check it&apos;s right.
                                        </div>
                                    </div>

                                    {/* Review content - single column flow */}
                                    <div style={{ display: 'grid', gap: 16 }}>
                                        {/* ---- SECTION: CLIENT ---- */}
                                        <div>
                                            {/* Section header */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                marginBottom: 8
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                    <div style={{
                                                        width: 6, height: 6, borderRadius: '50%',
                                                        background: (selectedPoidIds && selectedPoidIds.length > 0) ? '#20b26c' : '#f59e0b'
                                                    }} />
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700,
                                                        color: isDarkMode ? '#9CA3AF' : '#64748B',
                                                        textTransform: 'uppercase' as const,
                                                        letterSpacing: '0.08em'
                                                    }}>
                                                        Parties
                                                    </span>
                                                </div>
                                                {currentStep === 2 && !summaryConfirmed && (
                                                    <button
                                                        onClick={() => setCurrentStep(0)}
                                                        style={{
                                                            background: 'transparent', border: 'none',
                                                            padding: '2px 6px', fontSize: 11, fontWeight: 500,
                                                            color: isDarkMode ? '#6B7280' : '#94A3B8',
                                                            cursor: 'pointer', textDecoration: 'underline',
                                                            textUnderlineOffset: '2px'
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.color = aowColor; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.color = isDarkMode ? '#6B7280' : '#94A3B8'; }}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </div>
                                        {/* Client card */}
                                        <div style={lockCardStyle({
                                            borderRadius: 10,
                                            background: isDarkMode
                                                ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
                                                : '#FFFFFF',
                                            border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                            padding: '14px 16px',
                                            position: 'relative',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: isDarkMode
                                                ? '0 1px 3px rgba(0,0,0,0.3)'
                                                : '0 1px 3px rgba(0,0,0,0.04)'
                                        })}>
                                            {(() => {
                                                // Unique selection list
                                                const uniqueSelectedIds = Array.from(new Set(selectedPoidIds || []));
                                                const clients = uniqueSelectedIds
                                                    .map((id: string) => effectivePoidData.find(p => p.poid_id === id))
                                                    .filter(Boolean) as POID[];

                                                const isCompanyType = clientType === 'Company';
                                                const isMultiple = clientType === 'Multiple Individuals';

                                                const company = clients.find(c => c.company_name || (c as any).company_number);
                                                const directors = clients.filter(c => !(c.company_name || (c as any).company_number));

                                                // Utility formatters
                                                const formatPersonName = (p: POID) => `${p.first || ''} ${p.last || ''}`.trim();
                                                const formatPersonAddress = (p: POID) => {
                                                    const line1 = [p.house_building_number, p.street].filter(Boolean).join(' ').trim();
                                                    return [line1 || undefined, p.city, p.county, p.post_code, p.country].filter(Boolean).join(', ');
                                                };

                                                const getPersonAddressLines = (p: POID): string[] => {
                                                    const l1 = [p.house_building_number, p.street].filter(Boolean).join(' ').trim();
                                                    const l2 = [p.city, p.county].filter(Boolean).join(', ').trim();
                                                    const l3 = [p.post_code, p.country].filter(Boolean).join(' ').trim();
                                                    return [l1, l2, l3].filter(Boolean);
                                                };
                                                const getCompanyAddressLines = (p: POID): string[] => {
                                                    const l1 = [p.company_house_building_number, p.company_street].filter(Boolean).join(' ').trim();
                                                    const l2 = [p.company_city, p.company_county].filter(Boolean).join(', ').trim();
                                                    const l3 = [p.company_post_code, p.company_country].filter(Boolean).join(' ').trim();
                                                    return [l1, l2, l3].filter(Boolean);
                                                };
                                                const formatDob = (dob?: string | null) => {
                                                    if (!dob) return undefined;
                                                    const d = new Date(dob);
                                                    return isNaN(d.getTime()) ? String(dob) : d.toLocaleDateString('en-GB');
                                                };
                                                const getBestPhone = (p: POID): string | undefined => {
                                                    const v = (p as unknown as Record<string, unknown>);
                                                    const raw = p.best_number ||
                                                        (v.phone as string | undefined) ||
                                                        (v.phone_number as string | undefined) ||
                                                        (v.phoneNumber as string | undefined) ||
                                                        (v.Phone as string | undefined) ||
                                                        instructionPhone ||
                                                        undefined;
                                                    return raw && String(raw).trim() ? String(raw).trim() : undefined;
                                                };

                                                // Build individuals list (for Individual / Multiple Individuals / Existing)
                                                let individualItems: Array<{ name: string; address?: string; email?: string }> = directors.map(p => ({
                                                    name: formatPersonName(p) || (p.email || ''),
                                                    address: formatPersonAddress(p) || undefined,
                                                    email: p.email || undefined
                                                }));

                                                // Include POIDs that are individuals when not a company flow
                                                if (!isCompanyType) {
                                                    const otherIndividuals = clients.filter(c => !(c.company_name || (c as any).company_number));
                                                    individualItems = otherIndividuals.map(p => ({
                                                        name: formatPersonName(p) || (p.email || ''),
                                                        address: formatPersonAddress(p) || undefined,
                                                        email: p.email || undefined
                                                    }));
                                                }

                                                // Add direct entry for Multiple Individuals if not duplicate
                                                const directEntryName = (isMultiple && clientAsOnFile && clientAsOnFile.trim()) ? clientAsOnFile.trim() : '';
                                                if (directEntryName) {
                                                    const exists = individualItems.some(i => i.name.toLowerCase() === directEntryName.toLowerCase());
                                                    if (!exists) individualItems.push({ name: directEntryName });
                                                }

                                                // Dedupe individuals by name (case-insensitive)
                                                const seen = new Set<string>();
                                                individualItems = individualItems.filter(i => {
                                                    const k = i.name.toLowerCase();
                                                    if (seen.has(k)) return false;
                                                    seen.add(k);
                                                    return true;
                                                });

                                                // Compute a simple nationality summary if all selected persons share one
                                                const allNationalities: string[] = clients
                                                    .map(p => (p as any).nationality as string | undefined)
                                                    .filter(Boolean) as string[];
                                                const uniqueNationalities = Array.from(new Set(allNationalities.map(n => n.trim())));
                                                // nationalitySummary removed (unused)

                                                // Shared styles for the unified card layout
                                                const mutedColor = isDarkMode ? '#6B7280' : '#9CA3AF';
                                                const valueColor = isDarkMode ? '#D1D5DB' : '#334155';
                                                const headingColor = isDarkMode ? '#E5E7EB' : '#0F172A';
                                                const dividerStyle = { borderTop: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9', margin: '8px 0' };

                                                // Simple inline detail: icon + value, no label box
                                                const InfoLine = ({ value, icon, mono }: { value?: string | null; icon?: string; mono?: boolean }) => {
                                                    if (!value) return null;
                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                                                            {icon && <i className={`ms-Icon ms-Icon--${icon}`} style={{ fontSize: 11, color: mutedColor, flexShrink: 0, width: 14, textAlign: 'center' }} />}
                                                            <span style={{ fontSize: 12, color: valueColor, fontWeight: 500, wordBreak: 'break-word' as const, lineHeight: 1.4, ...(mono ? { fontFamily: 'monospace', letterSpacing: '0.3px' } : {}) }}>{value}</span>
                                                        </div>
                                                    );
                                                };

                                                // Compact verification status — small inline dots instead of loud pills
                                                const renderVerificationStatus = (p: POID) => {
                                                    const checks: Array<{ label: string; value?: string; passWords: string[] }> = [
                                                        { label: 'EID', value: p.check_result, passWords: ['pass', 'passed', 'manual-approved'] },
                                                        { label: 'PEP', value: p.pep_sanctions_result, passWords: ['passed', 'pass', 'clear', 'no matches'] },
                                                        { label: 'Addr', value: p.address_verification_result, passWords: ['passed', 'pass', 'verified'] },
                                                    ].filter(c => c.value);
                                                    if (checks.length === 0) return null;
                                                    return (
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                                                            {checks.map(c => {
                                                                const lc = (c.value || '').toLowerCase();
                                                                const pass = c.passWords.includes(lc);
                                                                const fail = lc === 'fail' || lc === 'failed';
                                                                const dotColor = pass ? '#10b981' : fail ? '#ef4444' : '#f59e0b';
                                                                return (
                                                                    <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: mutedColor, fontWeight: 600 }}>
                                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                                                        {c.label}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                };

                                                // Resolve instruction ref for display
                                                const displayRef = instructionRef || (clients[0] as any)?.InstructionRef || (clients[0] as any)?.instruction_ref || '';

                                                // Unified person renderer — one flowing block, no boxes
                                                const renderPerson = (p: POID, opts?: { typeLabel?: string; showRef?: boolean; compact?: boolean }) => {
                                                    const name = formatPersonName(p);
                                                    const phone = getBestPhone(p);
                                                    const dob = p.date_of_birth ? formatDob(p.date_of_birth) : undefined;
                                                    const addressStr = getPersonAddressLines(p).join(', ');
                                                    const nat = (p as any).nationality as string | undefined;
                                                    const passport = p.passport_number;
                                                    const dl = (p as any).drivers_license_number as string | undefined;
                                                    const hasDetails = p.email || phone || dob || nat || addressStr || passport || dl;

                                                    return (
                                                        <div>
                                                            {/* Name row */}
                                                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: hasDetails ? 6 : 0 }}>
                                                                <span style={{ fontSize: opts?.compact ? 13 : 14, fontWeight: 700, color: headingColor, lineHeight: 1.3 }}>
                                                                    {name || p.email || '—'}
                                                                </span>
                                                                {(opts?.showRef || opts?.typeLabel) && (
                                                                    <span style={{ fontSize: 10, color: mutedColor, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' as const }}>
                                                                        {opts?.typeLabel}{opts?.typeLabel && opts?.showRef && displayRef ? ' · ' : ''}{opts?.showRef && displayRef ? displayRef : ''}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {/* Verification dots */}
                                                            {renderVerificationStatus(p)}
                                                            {/* Detail rows — flat list, no grouping */}
                                                            {hasDetails && (
                                                                <div style={{ marginTop: 6, display: 'grid', gap: 1 }}>
                                                                    <InfoLine value={p.email} icon="Mail" />
                                                                    <InfoLine value={phone} icon="Phone" />
                                                                    {(dob || nat) && (
                                                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                                            {dob && <InfoLine value={dob} icon="Calendar" />}
                                                                            {nat && <InfoLine value={nat} icon="Globe" />}
                                                                        </div>
                                                                    )}
                                                                    <InfoLine value={addressStr} icon="MapPin" />
                                                                    <InfoLine value={passport} icon="ContactCard" mono />
                                                                    <InfoLine value={dl} icon="Car" mono />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                };

                                                return (
                                                    <div>
                                                        {/* Company flow */}
                                                        {isCompanyType && company && (
                                                            <div>
                                                                {/* Company heading */}
                                                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                                                                    <span style={{ fontSize: 14, fontWeight: 700, color: headingColor, lineHeight: 1.3 }}>
                                                                        {company.company_name || 'Unnamed Company'}
                                                                    </span>
                                                                    <span style={{ fontSize: 10, color: mutedColor, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' as const }}>
                                                                        Company{displayRef ? ` · ${displayRef}` : ''}
                                                                    </span>
                                                                </div>
                                                                {/* Company details — flat */}
                                                                <div style={{ display: 'grid', gap: 1 }}>
                                                                    <InfoLine value={company.email} icon="Mail" />
                                                                    <InfoLine value={getBestPhone(company)} icon="Phone" />
                                                                    <InfoLine value={(company as any).company_number} icon="CityNext" mono />
                                                                    <InfoLine value={getCompanyAddressLines(company).join(', ')} icon="MapPin" />
                                                                    {!company.email && !getBestPhone(company) && (
                                                                        <div style={{ fontSize: 11, color: isDarkMode ? '#4B5563' : '#CBD5E1', fontStyle: 'italic', padding: '2px 0' }}>No contact on file</div>
                                                                    )}
                                                                </div>
                                                                {/* Directors */}
                                                                {directors.length > 0 && (
                                                                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: isDarkMode ? '1px solid rgba(75,85,99,0.25)' : '1px solid #F1F5F9' }}>
                                                                        <div style={{ fontSize: 9, fontWeight: 700, color: mutedColor, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>
                                                                            Directors
                                                                        </div>
                                                                        {directors.map((d, idx) => (
                                                                            <div key={`dir-${d.poid_id}-${idx}`}>
                                                                                {idx > 0 && <div style={dividerStyle} />}
                                                                                {renderPerson(d, { compact: true })}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Individual / Multiple flow */}
                                                        {!isCompanyType && individualItems.length > 0 && (
                                                            <div>
                                                                {individualItems.map((item, idx) => {
                                                                    const backing = clients.find(p => (formatPersonName(p) || (p.email || '')).toLowerCase() === item.name.toLowerCase());
                                                                    return (
                                                                        <div key={`ind-${idx}`}>
                                                                            {idx > 0 && <div style={dividerStyle} />}
                                                                            {backing ? renderPerson(backing, { typeLabel: idx === 0 ? (clientType || 'Individual') : undefined, showRef: idx === 0 }) : (
                                                                                <div>
                                                                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                                                                                        <span style={{ fontSize: 14, fontWeight: 700, color: headingColor }}>{item.name || 'Unnamed'}</span>
                                                                                        {idx === 0 && <span style={{ fontSize: 10, color: mutedColor, fontWeight: 600, flexShrink: 0 }}>{clientType || 'Individual'}{displayRef ? ` · ${displayRef}` : ''}</span>}
                                                                                    </div>
                                                                                    <div style={{ display: 'grid', gap: 1 }}>
                                                                                        <InfoLine value={item.email} icon="Mail" />
                                                                                        <InfoLine value={item.address} icon="MapPin" />
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Fallback */}
                                                        {(!company || !isCompanyType) && individualItems.length === 0 && !isCompanyType && (
                                                            <div style={{ fontSize: 12, color: mutedColor, fontStyle: 'italic' }}>
                                                                No client selected
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        </div> {/* End PARTIES section */}

                                        {/* ---- SECTION: MATTER ---- */}
                                        <div>
                                            {/* Section header */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                marginBottom: 8
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                    <div style={{
                                                        width: 6, height: 6, borderRadius: '50%',
                                                        background: (areaOfWork && teamMember) ? '#20b26c' : '#f59e0b'
                                                    }} />
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700,
                                                        color: isDarkMode ? '#9CA3AF' : '#64748B',
                                                        textTransform: 'uppercase' as const,
                                                        letterSpacing: '0.08em'
                                                    }}>
                                                        Matter
                                                    </span>
                                                </div>
                                                {currentStep === 2 && !summaryConfirmed && (
                                                    <button
                                                        onClick={() => setCurrentStep(1)}
                                                        style={{
                                                            background: 'transparent', border: 'none',
                                                            padding: '2px 6px', fontSize: 11, fontWeight: 500,
                                                            color: isDarkMode ? '#6B7280' : '#94A3B8',
                                                            cursor: 'pointer', textDecoration: 'underline',
                                                            textUnderlineOffset: '2px'
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.color = aowColor; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.color = isDarkMode ? '#6B7280' : '#94A3B8'; }}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </div>

                                        {/* Matter card - structured with title bar */}
                                        <div style={lockCardStyle({
                                            borderRadius: 10,
                                            background: isDarkMode
                                                ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
                                                : '#FFFFFF',
                                            border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                            padding: 0,
                                            overflow: 'hidden',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: isDarkMode
                                                ? '0 1px 3px rgba(0,0,0,0.3)'
                                                : '0 1px 3px rgba(0,0,0,0.04)'
                                        })}>
                                            {/* Matter title bar */}
                                            <div style={{
                                                padding: '10px 16px',
                                                background: isDarkMode ? `${aowColor}08` : `${aowColor}06`,
                                                borderBottom: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9',
                                                display: 'flex', alignItems: 'center', gap: 10
                                            }}>
                                                <span style={{
                                                    fontSize: 14, fontWeight: 700,
                                                    color: isDarkMode ? '#F3F4F6' : '#0F172A'
                                                }}>
                                                    {areaOfWork || 'Area of Work'} &mdash; {practiceArea || 'Practice Area'}
                                                </span>
                                            </div>

                                            {/* Description row */}
                                            {description && (
                                                <div style={{
                                                    padding: '8px 16px',
                                                    borderBottom: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9',
                                                    fontSize: 12, lineHeight: 1.5,
                                                    color: isDarkMode ? '#9CA3AF' : '#64748B'
                                                }}>
                                                    {description}
                                                </div>
                                            )}

                                            {/* Two-column detail grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                                {/* Left: Team */}
                                                <div style={{
                                                    padding: '12px 16px',
                                                    borderRight: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9'
                                                }}>
                                                    {[
                                                        { label: 'Solicitor', value: teamMember },
                                                        { label: 'Supervising Partner', value: supervisingPartner },
                                                        { label: 'Originating Solicitor', value: originatingSolicitor },
                                                        { label: 'Opening Date', value: selectedDate ? selectedDate.toLocaleDateString('en-GB') : undefined },
                                                        { label: 'Client Type', value: clientType || undefined },
                                                        ...(instructionRef ? [{ label: 'Instruction Ref', value: instructionRef }] : []),
                                                    ].map(({ label, value }) => (
                                                        <div key={label} style={{
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                                                            padding: '4px 0',
                                                        }}>
                                                            <span style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>{label}</span>
                                                            <span style={{
                                                                fontSize: 12, fontWeight: 600,
                                                                color: value ? (isDarkMode ? '#E5E7EB' : '#1E293B') : (isDarkMode ? '#4B5563' : '#CBD5E1'),
                                                                textAlign: 'right' as const
                                                            }}>
                                                                {value || '-'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* Right: Details */}
                                                <div style={{ padding: '12px 16px' }}>
                                                    {[
                                                        { label: 'Dispute Value', value: disputeValue },
                                                        { label: 'Source', value: source ? `${source}${source === 'referral' && referrerName ? ` - ${referrerName}` : ''}` : undefined },
                                                        { label: 'Folder Structure', value: folderStructure },
                                                        ...(budgetRequired === 'Yes' ? [
                                                            { label: 'Budget', value: budgetAmount ? `\u00a3${budgetAmount}` : undefined },
                                                            ...(budgetThreshold ? [{ label: 'Notify Threshold', value: `${budgetThreshold}%` }] : []),
                                                        ] : []),
                                                    ].map(({ label, value }) => (
                                                        <div key={label} style={{
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                                                            padding: '4px 0',
                                                        }}>
                                                            <span style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>{label}</span>
                                                            <span style={{
                                                                fontSize: 12, fontWeight: 600,
                                                                color: value ? (isDarkMode ? '#E5E7EB' : '#1E293B') : (isDarkMode ? '#4B5563' : '#CBD5E1'),
                                                                textAlign: 'right' as const
                                                            }}>
                                                                {value || '-'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        </div> {/* End MATTER section */}

                                        {/* ---- SECTION: OPPONENTS ---- */}
                                        {(() => {
                                            const realOpponentKeys = getRealOpponentFieldKeys();
                                            const hasRealOpponentData = realOpponentKeys.length > 0;

                                            // Collect solicitor field values
                                            const solFields = {
                                                opponentSolicitorCompany, solicitorFirst, solicitorLast,
                                                opponentSolicitorEmail, solicitorPhone, solicitorHouseNumber,
                                                solicitorStreet, solicitorCity, solicitorCounty,
                                                solicitorPostcode, solicitorCountry
                                            } as const;
                                            const realSolKeys = Object.entries(solFields)
                                                .filter(([_, val]) => {
                                                    const v = (val || '').trim();
                                                    if (!v) return false;
                                                    if (isPlaceholderData(v)) return false;
                                                    const low = v.toLowerCase();
                                                    if (['helix law ltd','helix law','invent solicitor name','invent name','brighton','bn1 4de','mr','mrs','ms','dr','second floor'].includes(low)) return false;
                                                    if (low.includes('station street') || low.includes('britannia house')) return false;
                                                    if (low === '0345 314 2044' || low.includes('0345 314 2044')) return false;
                                                    if (low.includes('opponentsolicitor@helix-law.com')) return false;
                                                    return true;
                                                })
                                                .map(([k]) => k);
                                            const hasRealSolData = realSolKeys.length > 0;

                                            if (!hasRealOpponentData && !hasRealSolData) {
                                                return (
                                                    <div style={{
                                                        padding: '10px 16px', borderRadius: 10,
                                                        background: isDarkMode ? 'rgba(75,85,99,0.08)' : '#F8FAFC',
                                                        border: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #E2E8F0',
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        fontSize: 12, color: isDarkMode ? '#6B7280' : '#94A3B8'
                                                    }}>
                                                        <i className="ms-Icon ms-Icon--Contact" style={{ fontSize: 12, opacity: 0.5 }} />
                                                        <span>No opponent or solicitor details provided</span>
                                                    </div>
                                                );
                                            }

                                            // Build opponent display name
                                            const oppName = hasRealOpponentData
                                                ? (opponentType === 'Company' && opponentCompanyName
                                                    ? opponentCompanyName
                                                    : `${opponentTitle ? opponentTitle + ' ' : ''}${opponentFirst || ''} ${opponentLast || ''}`.trim())
                                                : '';

                                            // Build opponent address
                                            const oppAddr = (() => {
                                                const a1 = [opponentHouseNumber, opponentStreet].filter(Boolean).join(' ');
                                                const a2 = [opponentCity, opponentCounty].filter(Boolean).join(', ');
                                                const a3 = [opponentPostcode, opponentCountry].filter(Boolean).join(' ');
                                                return [a1, a2, a3].filter(l => l && !isPlaceholderData(l));
                                            })();

                                            // Build solicitor display
                                            const solName = `${solicitorFirst || ''} ${solicitorLast || ''}`.trim();
                                            const solAddr = (() => {
                                                const a1 = [solicitorHouseNumber, solicitorStreet].filter(Boolean).join(' ');
                                                const a2 = [solicitorCity, solicitorCounty].filter(Boolean).join(', ');
                                                const a3 = [solicitorPostcode, solicitorCountry].filter(Boolean).join(' ');
                                                return [a1, a2, a3].filter(l => l && !isPlaceholderData(l));
                                            })();

                                            return (
                                                <div>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 7,
                                                        marginBottom: 8
                                                    }}>
                                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#20b26c' }} />
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700,
                                                            color: isDarkMode ? '#9CA3AF' : '#64748B',
                                                            textTransform: 'uppercase' as const,
                                                            letterSpacing: '0.08em'
                                                        }}>
                                                            Opponents
                                                        </span>
                                                    </div>

                                                    <div style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: hasRealOpponentData && hasRealSolData ? '1fr 1fr' : '1fr',
                                                        gap: 12
                                                    }}>
                                                        {/* Opponent card */}
                                                        {hasRealOpponentData && (
                                                            <div style={{
                                                                borderRadius: 10,
                                                                background: isDarkMode ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' : '#FFFFFF',
                                                                border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                                                padding: '14px 16px',
                                                                boxShadow: isDarkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                            }}>
                                                                <div style={{
                                                                    fontSize: 10, fontWeight: 600,
                                                                    color: isDarkMode ? '#6B7280' : '#94A3B8',
                                                                    textTransform: 'uppercase' as const,
                                                                    letterSpacing: '0.05em', marginBottom: 8
                                                                }}>
                                                                    Opponent
                                                                </div>
                                                                {oppName && (
                                                                    <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#1E293B', marginBottom: 4 }}>
                                                                        {oppName}
                                                                    </div>
                                                                )}
                                                                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#64748B' }}>
                                                                    {opponentEmail && !isPlaceholderData(opponentEmail) && <span>{opponentEmail}</span>}
                                                                    {opponentPhone && !isPlaceholderData(opponentPhone) && <span>{opponentPhone}</span>}
                                                                </div>
                                                                {oppAddr.length > 0 && (
                                                                    <div style={{ fontSize: 12, color: isDarkMode ? '#6B7280' : '#94A3B8', marginTop: 4 }}>
                                                                        {oppAddr.join(', ')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Solicitor card */}
                                                        {hasRealSolData && (
                                                            <div style={{
                                                                borderRadius: 10,
                                                                background: isDarkMode ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' : '#FFFFFF',
                                                                border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                                                padding: '14px 16px',
                                                                boxShadow: isDarkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                            }}>
                                                                <div style={{
                                                                    fontSize: 10, fontWeight: 600,
                                                                    color: isDarkMode ? '#6B7280' : '#94A3B8',
                                                                    textTransform: 'uppercase' as const,
                                                                    letterSpacing: '0.05em', marginBottom: 8
                                                                }}>
                                                                    Opponent Solicitor
                                                                </div>
                                                                {solName && (
                                                                    <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#1E293B', marginBottom: 2 }}>
                                                                        {solName}
                                                                    </div>
                                                                )}
                                                                {opponentSolicitorCompany && realSolKeys.includes('opponentSolicitorCompany') && (
                                                                    <div style={{ fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#64748B', marginBottom: 4 }}>
                                                                        {opponentSolicitorCompany}
                                                                    </div>
                                                                )}
                                                                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#64748B' }}>
                                                                    {opponentSolicitorEmail && realSolKeys.includes('opponentSolicitorEmail') && <span>{opponentSolicitorEmail}</span>}
                                                                    {solicitorPhone && realSolKeys.includes('solicitorPhone') && <span>{solicitorPhone}</span>}
                                                                </div>
                                                                {solAddr.length > 0 && (
                                                                    <div style={{ fontSize: 12, color: isDarkMode ? '#6B7280' : '#94A3B8', marginTop: 4 }}>
                                                                        {solAddr.join(', ')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* ---- SECTION: COMPLIANCE & VERIFICATION ---- */}
                                        {(() => {
                                            const inst = Array.isArray(instructionRecords)
                                                ? (instructionRecords as any[]).find(r => r?.InstructionRef === instructionRef)
                                                : null;
                                            const idVerifs = inst?.idVerifications || [];
                                            const leadVerif = idVerifs.find((v: any) => v.IsLeadClient) || idVerifs[0] || null;
                                            const riskArr = inst?.riskAssessments || [];
                                            const latestRisk = riskArr[0] || null;
                                            const payments = inst?.payments || [];
                                            const successfulPay = payments.find((p: any) => p.payment_status === 'succeeded' || p.internal_status === 'completed') || payments[0] || null;

                                            // Also build from POID-level data as fallback
                                            const uniqueSelectedIds = Array.from(new Set(selectedPoidIds || []));
                                            const selectedClients = uniqueSelectedIds.map((id: string) => effectivePoidData.find(p => p.poid_id === id)).filter(Boolean) as POID[];
                                            const leadClient = selectedClients[0];

                                            const eidResult = leadVerif?.EIDOverallResult || leadClient?.check_result || null;
                                            const pepResult = leadVerif?.PEPAndSanctionsCheckResult || leadVerif?.PEPResult || leadClient?.pep_sanctions_result || null;
                                            const addressResult = leadVerif?.AddressVerificationResult || leadClient?.address_verification_result || null;
                                            const checkExpiry = leadVerif?.CheckExpiry || leadClient?.check_expiry || null;
                                            const riskResult = latestRisk?.RiskAssessmentResult || null;
                                            const riskScore = latestRisk?.RiskScore || null;
                                            const riskAssessor = latestRisk?.RiskAssessor || null;
                                            const paymentStatus = successfulPay?.payment_status === 'succeeded' ? 'Paid' : (successfulPay?.internal_status === 'completed' ? 'Paid' : (inst?.InternalStatus === 'paid' ? 'Paid' : null));
                                            const paymentAmount = successfulPay ? (successfulPay.amount >= 100 ? `\u00a3${(successfulPay.amount / 100).toFixed(2)}` : `\u00a3${successfulPay.amount}`) : (inst?.PaymentAmount ? `\u00a3${inst.PaymentAmount}` : null);

                                            const hasAny = eidResult || pepResult || addressResult || riskResult || paymentStatus || noConflict;
                                            if (!hasAny) return null;

                                            const statusDot = (val: string | null, passValues: string[]) => {
                                                if (!val) return '#6B7280';
                                                const low = String(val).toLowerCase();
                                                return passValues.some(p => low.includes(p)) ? '#10b981' : '#f59e0b';
                                            };

                                            return (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                                                        <div style={{
                                                            width: 6, height: 6, borderRadius: '50%',
                                                            background: (noConflict && eidResult) ? '#20b26c' : '#f59e0b'
                                                        }} />
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700,
                                                            color: isDarkMode ? '#9CA3AF' : '#64748B',
                                                            textTransform: 'uppercase' as const,
                                                            letterSpacing: '0.08em'
                                                        }}>
                                                            Compliance &amp; Verification
                                                        </span>
                                                    </div>
                                                    <div style={{
                                                        borderRadius: 10,
                                                        background: isDarkMode ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' : '#FFFFFF',
                                                        border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                                        overflow: 'hidden',
                                                        boxShadow: isDarkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                    }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                                            {/* Left: Conflict & Risk */}
                                                            <div style={{
                                                                padding: '12px 16px',
                                                                borderRight: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9'
                                                            }}>
                                                                {/* Conflict check */}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                                                                    <span style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>Conflict Check</span>
                                                                    <span style={{
                                                                        padding: '1px 8px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                                                        background: noConflict ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                                                                        color: noConflict ? '#10b981' : '#f59e0b',
                                                                        border: noConflict ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)',
                                                                        letterSpacing: '0.04em'
                                                                    }}>
                                                                        {noConflict ? 'CLEARED' : 'NOT CONFIRMED'}
                                                                    </span>
                                                                </div>
                                                                {/* Risk assessment */}
                                                                {riskResult && (
                                                                    <div style={{ padding: '4px 0' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                                            <span style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>Risk Assessment</span>
                                                                            <span style={{
                                                                                fontSize: 12, fontWeight: 600,
                                                                                color: String(riskResult).toLowerCase() === 'standard' || String(riskResult).toLowerCase() === 'low'
                                                                                    ? '#10b981' : '#f59e0b'
                                                                            }}>
                                                                                {riskResult}
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                                                                            {riskScore && <span style={{ fontSize: 10, color: isDarkMode ? '#4B5563' : '#CBD5E1' }}>Score: {riskScore}</span>}
                                                                            {riskAssessor && <span style={{ fontSize: 10, color: isDarkMode ? '#4B5563' : '#CBD5E1' }}>{riskAssessor}</span>}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* Right: Payment & EID */}
                                                            <div style={{ padding: '12px 16px' }}>
                                                                {/* Payment */}
                                                                {(paymentStatus || paymentAmount) && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                                                                        <span style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>Payment</span>
                                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                                            {paymentAmount && <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#1E293B' }}>{paymentAmount}</span>}
                                                                            {paymentStatus && (
                                                                                <span style={{
                                                                                    padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                                                                    background: 'rgba(16,185,129,0.12)', color: '#10b981',
                                                                                    border: '1px solid rgba(16,185,129,0.3)', letterSpacing: '0.04em'
                                                                                }}>
                                                                                    {paymentStatus.toUpperCase()}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* EID overall */}
                                                                {eidResult && (
                                                                    <div style={{ padding: '4px 0' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                            <span style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>EID Result</span>
                                                                            <span style={{
                                                                                padding: '1px 8px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                                                                background: `${statusDot(eidResult, ['pass', 'manual-approved'])}18`,
                                                                                color: statusDot(eidResult, ['pass', 'manual-approved']),
                                                                                border: `1px solid ${statusDot(eidResult, ['pass', 'manual-approved'])}30`,
                                                                                letterSpacing: '0.04em'
                                                                            }}>
                                                                                {String(eidResult).toUpperCase()}
                                                                            </span>
                                                                        </div>
                                                                        {checkExpiry && (
                                                                            <span style={{ fontSize: 10, color: isDarkMode ? '#4B5563' : '#CBD5E1', marginTop: 2, display: 'block' }}>
                                                                                Expires: {new Date(checkExpiry).toLocaleDateString('en-GB')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* ---- SECTION: DOCUMENTS & TERMS ---- */}
                                        {(() => {
                                            const inst = Array.isArray(instructionRecords)
                                                ? (instructionRecords as any[]).find(r => r?.InstructionRef === instructionRef)
                                                : null;
                                            const docs = Array.isArray(inst?.documents) ? inst.documents : [];
                                            const uniqueSelectedIds = Array.from(new Set(selectedPoidIds || []));
                                            const leadPoid = uniqueSelectedIds.length > 0
                                                ? effectivePoidData.find(p => p.poid_id === uniqueSelectedIds[0])
                                                : null;
                                            const termsAccepted = leadPoid?.terms_acceptance || false;
                                            const idDocsFolder = leadPoid?.id_docs_folder || null;

                                            if (docs.length === 0 && !termsAccepted && !idDocsFolder) return null;

                                            const formatSize = (bytes: number) => {
                                                if (!bytes || bytes <= 0) return '';
                                                if (bytes < 1024) return `${bytes} B`;
                                                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
                                                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                                            };

                                            return (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#20b26c' }} />
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700,
                                                            color: isDarkMode ? '#9CA3AF' : '#64748B',
                                                            textTransform: 'uppercase' as const,
                                                            letterSpacing: '0.08em'
                                                        }}>
                                                            Documents &amp; Terms
                                                        </span>
                                                        {docs.length > 0 && (
                                                            <span style={{
                                                                padding: '1px 6px', borderRadius: 8,
                                                                background: isDarkMode ? 'rgba(148,163,184,0.12)' : '#F1F5F9',
                                                                fontSize: 9, fontWeight: 700,
                                                                color: isDarkMode ? '#9CA3AF' : '#64748B'
                                                            }}>
                                                                {docs.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{
                                                        borderRadius: 10,
                                                        background: isDarkMode ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' : '#FFFFFF',
                                                        border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                                        padding: '12px 16px',
                                                        boxShadow: isDarkMode ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                    }}>
                                                        {/* Document list */}
                                                        {docs.length > 0 && (
                                                            <div style={{ marginBottom: (termsAccepted || idDocsFolder) ? 10 : 0 }}>
                                                                {docs.map((doc: any, idx: number) => {
                                                                    const name = doc.FileName || doc.filename || doc.name || `Document ${idx + 1}`;
                                                                    const type = doc.DocumentType || doc.type || '';
                                                                    const size = doc.FileSizeBytes || doc.filesize || doc.size || 0;
                                                                    return (
                                                                        <div key={`doc-${idx}`} style={{
                                                                            display: 'flex', alignItems: 'center', gap: 10,
                                                                            padding: '5px 0',
                                                                            ...(idx < docs.length - 1 ? { borderBottom: isDarkMode ? '1px solid rgba(75,85,99,0.15)' : '1px solid #F8FAFC' } : {})
                                                                        }}>
                                                                            <i className="ms-Icon ms-Icon--Page" style={{ fontSize: 13, color: aowColor, opacity: 0.7 }} />
                                                                            <span style={{
                                                                                fontSize: 12, fontWeight: 500,
                                                                                color: isDarkMode ? '#E5E7EB' : '#1E293B',
                                                                                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const
                                                                            }}>
                                                                                {name}
                                                                            </span>
                                                                            {type && <span style={{ fontSize: 10, color: isDarkMode ? '#4B5563' : '#CBD5E1', textTransform: 'uppercase' as const }}>{type}</span>}
                                                                            {size > 0 && <span style={{ fontSize: 10, color: isDarkMode ? '#4B5563' : '#CBD5E1' }}>{formatSize(size)}</span>}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        {/* Terms & ID folder */}
                                                        {(termsAccepted || idDocsFolder) && (
                                                            <div style={{
                                                                display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
                                                                ...(docs.length > 0 ? { paddingTop: 8, borderTop: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9' } : {})
                                                            }}>
                                                                {termsAccepted && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                        <div style={{
                                                                            width: 14, height: 14, borderRadius: 3,
                                                                            background: 'rgba(16,185,129,0.15)',
                                                                            border: '1px solid rgba(16,185,129,0.3)',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                        }}>
                                                                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                                                                                <polyline points="20,6 9,17 4,12" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                                            </svg>
                                                                        </div>
                                                                        <span style={{ fontSize: 11, color: isDarkMode ? '#9CA3AF' : '#64748B' }}>Terms accepted</span>
                                                                    </div>
                                                                )}
                                                                {idDocsFolder && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                        <i className="ms-Icon ms-Icon--FabricFolder" style={{ fontSize: 11, color: aowColor, opacity: 0.7 }} />
                                                                        <span style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>ID docs on file</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div> {/* End review content grid */}

                                    {/* Accent divider before confirmation */}
                                    <div style={{
                                        height: 1, margin: '12px 0 16px',
                                        background: isDarkMode
                                            ? `linear-gradient(90deg, transparent 0%, ${aowColor}30 50%, transparent 100%)`
                                            : `linear-gradient(90deg, transparent 0%, ${aowColor}20 50%, transparent 100%)`
                                    }} />

                                    {/* Confirmation bar */}
                                    {!summaryConfirmed && (
                                        <div style={{
                                            marginTop: 20,
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            border: isDarkMode ? `1px solid ${aowColor}25` : `1px solid ${aowColor}20`,
                                            boxShadow: isDarkMode
                                                ? `0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px ${aowColor}10`
                                                : `0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px ${aowColor}08`,
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}>
                                            {/* Status warnings above the action row */}
                                            {userDataLoading && (
                                                <div style={{
                                                    padding: '10px 18px',
                                                    background: isDarkMode ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
                                                    borderBottom: isDarkMode ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(59,130,246,0.15)',
                                                    fontSize: 12,
                                                    color: isDarkMode ? '#93C5FD' : '#1e40af',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8
                                                }}>
                                                    <div style={{
                                                        width: 6, height: 6, borderRadius: '50%',
                                                        background: isDarkMode ? '#93C5FD' : '#3B82F6',
                                                        animation: 'pulse 1.5s ease-in-out infinite'
                                                    }} />
                                                    Loading your profile data...
                                                </div>
                                            )}
                                            {(!effectiveUserData || !Array.isArray(effectiveUserData) || effectiveUserData.length === 0) && !userDataLoading && (
                                                <div style={{
                                                    padding: '10px 18px',
                                                    background: isDarkMode ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.04)',
                                                    borderBottom: isDarkMode ? '1px solid rgba(59,130,246,0.15)' : '1px solid rgba(59,130,246,0.1)',
                                                    fontSize: 12,
                                                    color: isDarkMode ? '#93C5FD' : '#1e40af',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8
                                                }}>
                                                    <i className="ms-Icon ms-Icon--Info" style={{ fontSize: 12 }} />
                                                    Profile data will be loaded automatically from team records.
                                                </div>
                                            )}

                                            {/* Main confirmation row */}
                                            <div style={{
                                                padding: '14px 18px',
                                                background: isDarkMode
                                                    ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
                                                    : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 14
                                            }}>
                                                {/* Conflicts indicator */}
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                                    background: noConflict
                                                        ? (isDarkMode ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)')
                                                        : (isDarkMode ? 'rgba(248,113,113,0.12)' : 'rgba(248,113,113,0.08)'),
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    <i className={`ms-Icon ms-Icon--${noConflict ? 'CheckMark' : 'Warning'}`}
                                                       style={{ fontSize: 13, color: noConflict ? '#10b981' : '#f87171' }} />
                                                </div>

                                                {/* Checkbox + text */}
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, margin: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={confirmAcknowledge}
                                                        onChange={(e) => setConfirmAcknowledge(e.currentTarget.checked)}
                                                        style={{
                                                            width: 18, height: 18, cursor: 'pointer',
                                                            accentColor: aowColor,
                                                            borderRadius: 4
                                                        }}
                                                    />
                                                    <span style={{ fontSize: 13, color: isDarkMode ? '#E5E7EB' : '#374151', lineHeight: 1.4, userSelect: 'none' }}>
                                                        {editsAfterConfirmation
                                                            ? 'I have reviewed the changes and confirm all details are correct'
                                                            : 'I confirm all details are correct and ready to open'}
                                                        {instructionRef && (
                                                            <span style={{
                                                                marginLeft: 8,
                                                                padding: '2px 8px',
                                                                background: isDarkMode ? `${aowColor}15` : `${aowColor}08`,
                                                                color: isDarkMode ? '#cbd5e1' : '#475569',
                                                                borderRadius: 4,
                                                                fontSize: 11,
                                                                fontWeight: 600,
                                                                letterSpacing: '0.02em'
                                                            }}>
                                                                {instructionRef}
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>

                                                {/* Changes detected badge */}
                                                {editsAfterConfirmation && (
                                                    <span style={{
                                                        padding: '3px 10px',
                                                        background: isDarkMode ? 'rgba(251,191,36,0.12)' : '#fef3c7',
                                                        color: isDarkMode ? '#fde68a' : '#92400e',
                                                        borderRadius: 6,
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        border: isDarkMode ? '1px solid rgba(253,230,138,0.25)' : '1px solid #fde68a',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        Changes detected
                                                    </span>
                                                )}
                                            </div>

                                            {/* Demo outcome selector - only in demo mode */}
                                            {demoModeEnabled && (
                                                <div style={{
                                                    padding: '8px 18px 12px',
                                                    borderTop: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9',
                                                    background: isDarkMode ? 'rgba(59,130,246,0.04)' : 'rgba(59,130,246,0.03)',
                                                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'
                                                }}>
                                                    <span style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? '#60A5FA' : '#3B82F6', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                                                        Demo Outcome
                                                    </span>
                                                    {([
                                                        { key: 'success' as const, label: 'Success', icon: 'CheckMark' },
                                                        { key: 'fail-early' as const, label: 'Fail Early', icon: 'Warning' },
                                                        { key: 'fail-mid' as const, label: 'Fail Mid', icon: 'Warning' },
                                                        { key: 'fail-late' as const, label: 'Fail Late', icon: 'Warning' },
                                                    ]).map(opt => (
                                                        <button
                                                            key={opt.key}
                                                            type="button"
                                                            onClick={() => setDemoProcessingOutcome(opt.key)}
                                                            style={{
                                                                padding: '3px 10px', borderRadius: 4,
                                                                fontSize: 10, fontWeight: 600,
                                                                background: demoProcessingOutcome === opt.key
                                                                    ? (opt.key === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)')
                                                                    : (isDarkMode ? 'rgba(75,85,99,0.15)' : '#F8FAFC'),
                                                                color: demoProcessingOutcome === opt.key
                                                                    ? (opt.key === 'success' ? '#10b981' : '#ef4444')
                                                                    : (isDarkMode ? '#6B7280' : '#94A3B8'),
                                                                border: demoProcessingOutcome === opt.key
                                                                    ? (opt.key === 'success' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.25)')
                                                                    : (isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0'),
                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            <i className={`ms-Icon ms-Icon--${opt.icon}`} style={{ fontSize: 9 }} />
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Action row */}
                                            <div style={{
                                                padding: demoModeEnabled ? '8px 18px 12px' : '0px 18px 0px',
                                                display: 'flex', justifyContent: 'flex-end'
                                            }}>

                                                {/* Open Matter button */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!confirmAcknowledge || processingStarted || userDataLoading) return;
                                                        setSummaryConfirmed(true);
                                                        setEditsAfterConfirmation(false);
                                                        if (!isProcessing) {
                                                            setProcessingStarted(true);
                                                            const runner = demoModeEnabled ? simulateDemoProcessing : simulateProcessing;
                                                            runner().then(r => r && setGeneratedCclUrl(r.url));
                                                        }
                                                        setTimeout(() => {
                                                            const processingSection = document.querySelector('[data-processing-section]');
                                                            if (processingSection) {
                                                                processingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                            }
                                                        }, 200);
                                                    }}
                                                    disabled={!confirmAcknowledge || !profileReady}
                                                    title={!profileReady ? 'Waiting for user profile data to load…' : undefined}
                                                    style={{
                                                        background: (confirmAcknowledge && profileReady)
                                                            ? `linear-gradient(135deg, ${colours.cta} 0%, #B83C2B 100%)`
                                                            : (isDarkMode ? '#1F2937' : '#f3f4f6'),
                                                        color: (confirmAcknowledge && profileReady)
                                                            ? '#fff'
                                                            : (isDarkMode ? '#4B5563' : '#9ca3af'),
                                                        border: (confirmAcknowledge && profileReady)
                                                            ? '1px solid #B83C2B'
                                                            : (isDarkMode ? '1px solid #374151' : '1px solid #d1d5db'),
                                                        borderRadius: 8,
                                                        padding: '10px 22px',
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        letterSpacing: '0.01em',
                                                        cursor: (confirmAcknowledge && profileReady) ? 'pointer' : 'not-allowed',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        minWidth: 130,
                                                        boxShadow: (confirmAcknowledge && profileReady)
                                                            ? `0 4px 12px ${colours.cta}35`
                                                            : 'none',
                                                        flexShrink: 0
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (confirmAcknowledge && profileReady) {
                                                            e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
                                                            e.currentTarget.style.boxShadow = `0 6px 20px ${colours.cta}45`;
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                                        if (confirmAcknowledge) {
                                                            e.currentTarget.style.boxShadow = `0 4px 12px ${colours.cta}35`;
                                                        }
                                                    }}
                                                >
                                                    {!profileReady ? 'Loading Profile…' : 'Open Matter'}
                                                </button>
                                            </div> {/* End action row */}
                                        </div>
                                    )}

                                    {/* Processing Panel - streamed step list */}
                                    {currentStep === 2 && summaryConfirmed && (
                                        <div data-processing-section style={{
                                            marginTop: 16,
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            border: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E2E8F0',
                                            boxShadow: isDarkMode
                                                ? '0 4px 20px rgba(0,0,0,0.4)'
                                                : '0 2px 12px rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}>
                                            {(() => {
                                                const total = processingSteps.length || 0;
                                                const done = processingSteps.filter(s => s.status === 'success').length;
                                                const failed = processingSteps.filter(s => s.status === 'error').length;
                                                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                                const isComplete = done === total && total > 0;
                                                const hasFailed = failed > 0;
                                                const statusColor = hasFailed ? '#ef4444' : (isComplete ? '#20b26c' : aowColor);

                                                return (
                                                    <>
                                                        {/* Header */}
                                                        <div style={{
                                                            padding: '14px 18px',
                                                            background: isDarkMode
                                                                ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
                                                                : '#FAFBFC',
                                                            borderBottom: isDarkMode ? '1px solid rgba(75,85,99,0.3)' : '1px solid #E5E7EB',
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                {/* Status icon */}
                                                                <div style={{
                                                                    width: 28, height: 28, borderRadius: 8,
                                                                    background: isComplete
                                                                        ? 'linear-gradient(135deg, #20b26c 0%, #16a34a 100%)'
                                                                        : (hasFailed
                                                                            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                                                            : `linear-gradient(135deg, ${aowColor} 0%, ${aowColor}cc 100%)`),
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    boxShadow: `0 2px 8px ${statusColor}40`,
                                                                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                                                }}>
                                                                    {isComplete ? (
                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                                                            <polyline points="20,6 9,17 4,12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                                        </svg>
                                                                    ) : hasFailed ? (
                                                                        <i className="ms-Icon ms-Icon--Warning" style={{ fontSize: 13, color: '#fff' }} />
                                                                    ) : (
                                                                        <div style={{
                                                                            width: 12, height: 12, borderRadius: '50%',
                                                                            border: '2px solid rgba(255,255,255,0.4)',
                                                                            borderTopColor: '#fff',
                                                                            animation: 'spin 0.8s linear infinite'
                                                                        }} />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div style={{
                                                                        fontSize: 14, fontWeight: 700,
                                                                        color: isDarkMode ? '#F3F4F6' : '#0F172A',
                                                                        lineHeight: 1.2
                                                                    }}>
                                                                        {hasFailed ? 'Attention Required' :
                                                                         isComplete ? 'Matter Opened Successfully' :
                                                                         'Opening Matter...'}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#9CA3AF', marginTop: 1 }}>
                                                                        {isComplete ? 'All steps completed' :
                                                                         hasFailed ? `${failed} step${failed > 1 ? 's' : ''} need${failed === 1 ? 's' : ''} attention` :
                                                                         `${done} of ${total} steps complete`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Debug button */}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDebugInspectorOpen(!debugInspectorOpen);
                                                                    if (!debugInspectorOpen) {
                                                                        setDebugActiveTab('json');
                                                                        setDebugJsonInput('');
                                                                        setDebugValidation(null);
                                                                        setDebugManualPasteOpen(false);
                                                                    }
                                                                }}
                                                                title="Open diagnostic inspector"
                                                                style={{
                                                                    background: debugInspectorOpen
                                                                        ? `linear-gradient(135deg, ${colours.cta} 0%, #B83C2B 100%)`
                                                                        : (isDarkMode ? 'rgba(148,163,184,0.08)' : 'transparent'),
                                                                    border: `1px solid ${debugInspectorOpen ? colours.cta : (isDarkMode ? 'rgba(148,163,184,0.2)' : '#e5e7eb')}`,
                                                                    borderRadius: 6, padding: '4px 10px',
                                                                    fontSize: 11, fontWeight: 600,
                                                                    color: debugInspectorOpen ? '#fff' : (isDarkMode ? '#9CA3AF' : '#6b7280'),
                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                                    transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                <i className="ms-Icon ms-Icon--BugSolid" style={{ fontSize: 10 }} />
                                                                Debug
                                                            </button>
                                                        </div>

                                                        {/* Progress bar */}
                                                        <div style={{ height: 3, background: isDarkMode ? '#1F2937' : '#F1F5F9' }}>
                                                            <div style={{
                                                                height: '100%', width: `${pct}%`,
                                                                background: hasFailed
                                                                    ? 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'
                                                                    : `linear-gradient(90deg, ${aowColor} 0%, ${statusColor} 100%)`,
                                                                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                boxShadow: `0 0 8px ${statusColor}50`
                                                            }} />
                                                        </div>

                                                        <style>{`
                                                            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                                                            @keyframes spin { to { transform: rotate(360deg); } }
                                                        `}</style>

                                                        {/* Streamed step list */}
                                                        <div style={{
                                                            padding: '12px 18px',
                                                            background: isDarkMode
                                                                ? 'linear-gradient(135deg, #111827 0%, #1E293B 100%)'
                                                                : '#FFFFFF',
                                                            display: 'grid', gap: 0
                                                        }}>
                                                            {/* Phase-grouped step list for clarity */}
                                                            {total > 0 && (() => {
                                                                const phases = [
                                                                    { label: 'Authentication', range: [0, 9] as const },
                                                                    { label: 'Data Processing', range: [10, 11] as const },
                                                                    { label: 'Integration', range: [12, 16] as const },
                                                                    { label: 'Finalisation', range: [17, total - 1] as const },
                                                                ];
                                                                return phases.map(phase => {
                                                                    const phaseSteps = processingSteps.slice(phase.range[0], Math.min(phase.range[1] + 1, total));
                                                                    if (phaseSteps.length === 0) return null;
                                                                    const phaseDone = phaseSteps.every(s => s.status === 'success');
                                                                    const phaseFailed = phaseSteps.some(s => s.status === 'error');
                                                                    const phaseActive = phaseSteps.some(s => {
                                                                        const globalIdx = processingSteps.indexOf(s);
                                                                        return s.status === 'pending' && (globalIdx === 0 || processingSteps[globalIdx - 1]?.status !== 'pending');
                                                                    });


                                                                    return (
                                                                        <div key={phase.label} style={{ marginBottom: 2 }}>
                                                                            {/* Phase header */}
                                                                            <div style={{
                                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                                                padding: '8px 0 4px',
                                                                                borderTop: phase.range[0] > 0 ? (isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid #F1F5F9') : 'none',
                                                                            }}>
                                                                                <div style={{
                                                                                    width: 6, height: 6, borderRadius: '50%',
                                                                                    background: phaseDone ? '#20b26c' : phaseFailed ? '#ef4444' : phaseActive ? aowColor : (isDarkMode ? '#374151' : '#CBD5E1'),
                                                                                    boxShadow: phaseActive ? `0 0 6px ${aowColor}60` : 'none',
                                                                                    transition: 'all 0.3s',
                                                                                }} />
                                                                                <span style={{
                                                                                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8,
                                                                                    color: phaseDone ? (isDarkMode ? '#86EFAC' : '#15803d')
                                                                                        : phaseFailed ? (isDarkMode ? '#FCA5A5' : '#dc2626')
                                                                                        : phaseActive ? (isDarkMode ? '#E5E7EB' : '#1E293B')
                                                                                        : (isDarkMode ? '#4B5563' : '#9CA3AF'),
                                                                                }}>
                                                                                    {phase.label}
                                                                                </span>
                                                                                {phaseDone && (
                                                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" style={{ marginLeft: -2 }}>
                                                                                        <polyline points="20,6 9,17 4,12" stroke="#20b26c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                                                    </svg>
                                                                                )}
                                                                                {phase.label === 'Authentication' && phaseDone && !phaseFailed && (
                                                                                    <span style={{ fontSize: 9, color: isDarkMode ? '#4B5563' : '#CBD5E1', marginLeft: 'auto' }}>
                                                                                        3 services
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {/* Phase steps - amalgamate auth into grouped milestones */}
                                                                            {phase.label === 'Authentication' ? (() => {
                                                                                // Group auth steps into 3 display milestones
                                                                                const authGroups = [
                                                                                    { label: 'ActiveCampaign', range: [0, 1] },
                                                                                    { label: 'Clio', range: [2, 5] },
                                                                                    { label: 'Asana', range: [6, 9] },
                                                                                ];
                                                                                return authGroups.map(grp => {
                                                                                    const grpSteps = processingSteps.slice(grp.range[0], Math.min(grp.range[1] + 1, total));
                                                                                    if (grpSteps.length === 0) return null;
                                                                                    const grpDone = grpSteps.every(s => s.status === 'success');
                                                                                    const grpFailed = grpSteps.some(s => s.status === 'error');
                                                                                    const grpActive = grpSteps.some(s => {
                                                                                        const gi = processingSteps.indexOf(s);
                                                                                        return s.status === 'pending' && (gi === 0 || processingSteps[gi - 1]?.status !== 'pending');
                                                                                    });
                                                                                    const grpPending = grpSteps.every(s => s.status === 'pending') && !grpActive;
                                                                                    const grpDoneCount = grpSteps.filter(s => s.status === 'success').length;
                                                                                    const failedStep = grpSteps.find(s => s.status === 'error');
                                                                                    return (
                                                                                        <div key={`auth-grp-${grp.label}`} style={{
                                                                                            display: 'flex', alignItems: 'center', gap: 10,
                                                                                            padding: '7px 0',
                                                                                            borderBottom: isDarkMode ? '1px solid rgba(75,85,99,0.15)' : '1px solid #F1F5F9',
                                                                                            opacity: grpPending ? 0.4 : 1,
                                                                                            transition: 'opacity 0.3s ease'
                                                                                        }}>
                                                                                            <div style={{
                                                                                                width: 20, height: 20, borderRadius: 6,
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                                flexShrink: 0,
                                                                                                background: grpDone ? (isDarkMode ? 'rgba(32,178,108,0.15)' : 'rgba(32,178,108,0.1)')
                                                                                                    : grpFailed ? (isDarkMode ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)')
                                                                                                    : grpActive ? (isDarkMode ? `${aowColor}15` : `${aowColor}10`)
                                                                                                    : (isDarkMode ? 'rgba(75,85,99,0.1)' : '#F8FAFC'),
                                                                                                transition: 'all 0.3s ease'
                                                                                            }}>
                                                                                                {grpDone ? (
                                                                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><polyline points="20,6 9,17 4,12" stroke="#20b26c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                                                                ) : grpFailed ? (
                                                                                                    <i className="ms-Icon ms-Icon--ErrorBadge" style={{ fontSize: 10, color: '#ef4444' }} />
                                                                                                ) : grpActive ? (
                                                                                                    <div style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${aowColor}60`, borderTopColor: aowColor, animation: 'spin 0.8s linear infinite' }} />
                                                                                                ) : (
                                                                                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: isDarkMode ? '#4B5563' : '#CBD5E1' }} />
                                                                                                )}
                                                                                            </div>
                                                                                            <span style={{
                                                                                                fontSize: 12, flex: 1,
                                                                                                fontWeight: grpActive ? 600 : 400,
                                                                                                color: grpDone ? (isDarkMode ? '#86EFAC' : '#15803d')
                                                                                                    : grpFailed ? (isDarkMode ? '#FCA5A5' : '#dc2626')
                                                                                                    : grpActive ? (isDarkMode ? '#E5E7EB' : '#1E293B')
                                                                                                    : (isDarkMode ? '#6B7280' : '#9CA3AF'),
                                                                                                transition: 'color 0.3s ease'
                                                                                            }}>
                                                                                                Authenticate {grp.label}
                                                                                                {grpActive && !grpDone && <span style={{ fontSize: 10, color: isDarkMode ? '#4B5563' : '#CBD5E1', marginLeft: 6 }}>{grpDoneCount}/{grpSteps.length}</span>}
                                                                                            </span>
                                                                                            {grpFailed && failedStep && (
                                                                                                <span style={{ fontSize: 10, color: isDarkMode ? '#FCA5A5' : '#dc2626', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{failedStep.message}</span>
                                                                                            )}
                                                                                            {grpActive && (
                                                                                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: aowColor, boxShadow: `0 0 6px ${aowColor}`, animation: 'pulse 1.5s ease-in-out infinite' }} />
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                });
                                                                            })() : phaseSteps.map((step, localIdx) => {
                                                                                const idx = phase.range[0] + localIdx;
                                                                                const isActive = step.status === 'pending' && (idx === 0 || processingSteps[idx - 1]?.status !== 'pending');
                                                                return (
                                                                    <div key={`proc-${idx}`} style={{
                                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                                        padding: '7px 0',
                                                                        borderBottom: idx < total - 1
                                                                            ? (isDarkMode ? '1px solid rgba(75,85,99,0.15)' : '1px solid #F1F5F9')
                                                                            : 'none',
                                                                        opacity: step.status === 'pending' && !isActive ? 0.4 : 1,
                                                                        transition: 'opacity 0.3s ease'
                                                                    }}>
                                                                        {/* Status indicator */}
                                                                        <div style={{
                                                                            width: 20, height: 20, borderRadius: 6,
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            flexShrink: 0,
                                                                            background: step.status === 'success'
                                                                                ? (isDarkMode ? 'rgba(32,178,108,0.15)' : 'rgba(32,178,108,0.1)')
                                                                                : step.status === 'error'
                                                                                    ? (isDarkMode ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)')
                                                                                    : isActive
                                                                                        ? (isDarkMode ? `${aowColor}15` : `${aowColor}10`)
                                                                                        : (isDarkMode ? 'rgba(75,85,99,0.1)' : '#F8FAFC'),
                                                                            transition: 'all 0.3s ease'
                                                                        }}>
                                                                            {step.status === 'success' ? (
                                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                                                                    <polyline points="20,6 9,17 4,12" stroke="#20b26c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                                                </svg>
                                                                            ) : step.status === 'error' ? (
                                                                                <i className="ms-Icon ms-Icon--ErrorBadge" style={{ fontSize: 10, color: '#ef4444' }} />
                                                                            ) : isActive ? (
                                                                                <div style={{
                                                                                    width: 8, height: 8, borderRadius: '50%',
                                                                                    border: `2px solid ${aowColor}60`,
                                                                                    borderTopColor: aowColor,
                                                                                    animation: 'spin 0.8s linear infinite'
                                                                                }} />
                                                                            ) : (
                                                                                <div style={{
                                                                                    width: 4, height: 4, borderRadius: '50%',
                                                                                    background: isDarkMode ? '#4B5563' : '#CBD5E1'
                                                                                }} />
                                                                            )}
                                                                        </div>
                                                                        {/* Icon */}
                                                                        {step.icon && (
                                                                            <img src={step.icon} alt="" style={{
                                                                                width: 16, height: 16,
                                                                                opacity: step.status === 'pending' ? 0.4 : 0.8,
                                                                                filter: step.status === 'success'
                                                                                    ? 'brightness(0) saturate(100%) invert(47%) sepia(58%) saturate(1945%) hue-rotate(119deg) brightness(97%) contrast(91%)'
                                                                                    : (isDarkMode && step.status === 'pending' ? 'brightness(0.7) invert(0.8)' : 'none'),
                                                                                transition: 'all 0.3s ease'
                                                                            }} />
                                                                        )}
                                                                        {/* Label */}
                                                                        <span style={{
                                                                            fontSize: 12, flex: 1,
                                                                            fontWeight: isActive ? 600 : 400,
                                                                            color: step.status === 'success'
                                                                                ? (isDarkMode ? '#86EFAC' : '#15803d')
                                                                                : step.status === 'error'
                                                                                    ? (isDarkMode ? '#FCA5A5' : '#dc2626')
                                                                                    : isActive
                                                                                        ? (isDarkMode ? '#E5E7EB' : '#1E293B')
                                                                                        : (isDarkMode ? '#6B7280' : '#9CA3AF'),
                                                                            transition: 'color 0.3s ease'
                                                                        }}>
                                                                            {step.label}
                                                                        </span>
                                                                        {/* Active pulse dot */}
                                                                        {isActive && (
                                                                            <div style={{
                                                                                width: 5, height: 5, borderRadius: '50%',
                                                                                background: aowColor,
                                                                                boxShadow: `0 0 6px ${aowColor}`,
                                                                                animation: 'pulse 1.5s ease-in-out infinite'
                                                                            }} />
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>

                                                    {/* Failure summary + dispatch confirmation — below step list */}
                                                    {hasFailed && failureSummary && (
                                                        <div style={{
                                                            padding: '14px 18px',
                                                            background: isDarkMode
                                                                ? 'linear-gradient(135deg, rgba(127,29,29,0.15) 0%, rgba(15,23,42,0.6) 100%)'
                                                                : 'linear-gradient(135deg, rgba(254,242,242,0.8) 0%, rgba(255,251,235,0.4) 100%)',
                                                            borderTop: isDarkMode ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(239,68,68,0.12)',
                                                        }}>
                                                            {/* Failure message */}
                                                            <div style={{
                                                                display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12,
                                                            }}>
                                                                <i className="ms-Icon ms-Icon--ErrorBadge" style={{ fontSize: 14, color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                                                                <div style={{
                                                                    fontSize: 12, fontWeight: 600, lineHeight: 1.5,
                                                                    color: isDarkMode ? '#FCA5A5' : '#991b1b',
                                                                    wordBreak: 'break-word' as const,
                                                                }}>
                                                                    {failureSummary}
                                                                </div>
                                                            </div>

                                                            {/* Dispatch status — animates from sending to delivered */}
                                                            <div style={{
                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                                padding: '8px 12px', borderRadius: 8,
                                                                background: reportDelivered
                                                                    ? (isDarkMode ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)')
                                                                    : (isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.04)'),
                                                                border: reportDelivered
                                                                    ? (isDarkMode ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(16,185,129,0.2)')
                                                                    : (isDarkMode ? '1px solid rgba(148,163,184,0.15)' : '1px solid rgba(148,163,184,0.12)'),
                                                                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                                            }}>
                                                                {reportDelivered ? (
                                                                    <div style={{
                                                                        width: 20, height: 20, borderRadius: 6,
                                                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        flexShrink: 0,
                                                                        animation: 'fadeIn 0.3s ease-out',
                                                                    }}>
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                                                            <polyline points="20,6 9,17 4,12" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                                        </svg>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{
                                                                        width: 12, height: 12, borderRadius: '50%',
                                                                        border: '2px solid rgba(148,163,184,0.4)',
                                                                        borderTopColor: isDarkMode ? '#9CA3AF' : '#64748B',
                                                                        animation: 'spin 0.8s linear infinite',
                                                                        flexShrink: 0,
                                                                    }} />
                                                                )}
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{
                                                                        fontSize: 11, fontWeight: 600,
                                                                        color: reportDelivered
                                                                            ? (isDarkMode ? '#86EFAC' : '#166534')
                                                                            : (isDarkMode ? '#9CA3AF' : '#64748B'),
                                                                        transition: 'color 0.3s ease',
                                                                    }}>
                                                                        {reportDelivered ? 'Diagnostic report delivered' : 'Sending diagnostic report...'}
                                                                    </div>
                                                                    <div style={{
                                                                        fontSize: 10,
                                                                        color: isDarkMode ? '#6B7280' : '#94A3B8',
                                                                        marginTop: 1,
                                                                    }}>
                                                                        {reportDelivered
                                                                            ? 'The development team has been notified automatically.'
                                                                            : 'Preparing full diagnostic with form data...'}
                                                                    </div>
                                                                </div>
                                                                {reportDelivered && (
                                                                    <span style={{
                                                                        fontSize: 9, fontWeight: 700, padding: '2px 6px',
                                                                        borderRadius: 4,
                                                                        background: isDarkMode ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)',
                                                                        color: '#10b981',
                                                                        letterSpacing: '0.04em',
                                                                    }}>SENT</span>
                                                                )}
                                                            </div>

                                                            {/* Reassurance message */}
                                                            <div style={{
                                                                marginTop: 12, paddingTop: 10,
                                                                borderTop: isDarkMode ? '1px solid rgba(75,85,99,0.2)' : '1px solid rgba(226,232,240,0.6)',
                                                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                                            }}>
                                                                <i className="ms-Icon ms-Icon--Info" style={{ fontSize: 11, color: isDarkMode ? '#6B7280' : '#94A3B8', flexShrink: 0, marginTop: 1 }} />
                                                                <div style={{
                                                                    fontSize: 11, lineHeight: 1.5,
                                                                    color: isDarkMode ? '#9CA3AF' : '#64748B',
                                                                }}>
                                                                    Nothing further to action. Your form data has been captured and you’ll be notified when this has been resolved.
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Success CTA — morph into "View Matter" prompt */}
                                                    {isComplete && (
                                                        <div style={{
                                                            padding: '20px 18px',
                                                            background: isDarkMode
                                                                ? 'linear-gradient(135deg, rgba(32,178,108,0.06) 0%, rgba(22,163,74,0.03) 100%)'
                                                                : 'linear-gradient(135deg, rgba(32,178,108,0.04) 0%, rgba(22,163,74,0.02) 100%)',
                                                            borderTop: isDarkMode ? '1px solid rgba(32,178,108,0.2)' : '1px solid rgba(32,178,108,0.15)',
                                                        }}>
                                                            <div style={{
                                                                display: 'flex', alignItems: 'center', gap: 12,
                                                                padding: '14px 16px', borderRadius: 10,
                                                                background: isDarkMode
                                                                    ? 'linear-gradient(135deg, rgba(32,178,108,0.10) 0%, rgba(22,163,74,0.06) 100%)'
                                                                    : 'linear-gradient(135deg, rgba(32,178,108,0.08) 0%, rgba(22,163,74,0.04) 100%)',
                                                                border: isDarkMode ? '1px solid rgba(32,178,108,0.25)' : '1px solid rgba(32,178,108,0.2)',
                                                            }}>
                                                                <div style={{
                                                                    width: 32, height: 32, borderRadius: 8,
                                                                    background: 'linear-gradient(135deg, #20b26c 0%, #16a34a 100%)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                    boxShadow: '0 2px 8px rgba(32,178,108,0.3)',
                                                                }}>
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                                                        <path d="M9 12h6m-3-3v6m-3 5h6a3 3 0 003-3V7a3 3 0 00-3-3H9a3 3 0 00-3 3v10a3 3 0 003 3z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                                    </svg>
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{
                                                                        fontSize: 13, fontWeight: 700,
                                                                        color: isDarkMode ? '#86EFAC' : '#166534',
                                                                    }}>
                                                                        Matter is ready
                                                                    </div>
                                                                    <div style={{
                                                                        fontSize: 11, color: isDarkMode ? '#6B7280' : '#64748B', marginTop: 1,
                                                                    }}>
                                                                        {openedMatterId
                                                                            ? `Matter ${openedMatterId} has been created in Clio and is available in the Matters tab.`
                                                                            : 'The matter has been created and is available in the Matters tab.'}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        window.dispatchEvent(new CustomEvent('navigateToMatter', {
                                                                            detail: { matterId: openedMatterId || undefined }
                                                                        }));
                                                                    }}
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                                        padding: '8px 16px', borderRadius: 8,
                                                                        background: 'linear-gradient(135deg, #20b26c 0%, #16a34a 100%)',
                                                                        color: '#fff', border: 'none', cursor: 'pointer',
                                                                        fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                                                                        boxShadow: '0 2px 8px rgba(32,178,108,0.3)',
                                                                        transition: 'all 0.2s ease',
                                                                        flexShrink: 0,
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(32,178,108,0.4)'; }}
                                                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(32,178,108,0.3)'; }}
                                                                >
                                                                    View Matter
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                                                        <path d="M5 12h14m-6-6l6 6-6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                                    </svg>
                                                                </button>
                                                                {generatedCclUrl && (
                                                                    <a
                                                                        href={generatedCclUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: 6,
                                                                            padding: '8px 16px', borderRadius: 8,
                                                                            background: `linear-gradient(135deg, ${colours.highlight} 0%, ${colours.helixBlue} 100%)`,
                                                                            color: '#fff', border: 'none', cursor: 'pointer',
                                                                            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                                                                            boxShadow: `0 2px 8px ${colours.highlight}4D`,
                                                                            transition: 'all 0.2s ease',
                                                                            flexShrink: 0,
                                                                            whiteSpace: 'nowrap',
                                                                            textDecoration: 'none',
                                                                        }}
                                                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                                                                    >
                                                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 3.5L18.5 8H14V3.5zM8 13h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V9z"/></svg>
                                                                        Preview CCL
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                            </div>
                            
                            {/* Workbench Section - appears below review when active */}
                            {workbenchMode && (
                                <div style={{ width: '100%', padding: '16px 0', boxSizing: 'border-box' }}>
                                    <div
                                        style={{
                                            border: '2px solid #3690CE',
                                            borderRadius: 10,
                                            background: 'linear-gradient(135deg, #F0F7FF 0%, #E6F3FF 100%)',
                                            padding: 24,
                                            margin: '16px 0',
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            boxShadow: '0 8px 16px rgba(54, 144, 206, 0.15)',
                                            minHeight: '600px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                            <h4 style={{ 
                                                margin: 0, 
                                                fontWeight: 600, 
                                                fontSize: 18, 
                                                color: '#3690CE',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8
                                            }}>
                                                <i className="ms-Icon ms-Icon--WorkItem" style={{ fontSize: 16, color: '#3690CE' }} />
                                                Matter Opening Workbench
                                            </h4>
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            {/* Processing Summary (professional, on-brand) */}
                                            {(() => {
                                                const total = processingSteps.length || 0;
                                                const done = processingSteps.filter(s => s.status === 'success').length;
                                                const failed = processingSteps.filter(s => s.status === 'error').length;
                                                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                                const statusText = failed > 0 ? 'Attention required' : (done === total && total > 0 ? 'Completed' : 'In progress');
                                                return (
                                                    <div style={{
                                                        border: '1px solid #e1e5ea',
                                                        borderRadius: 10,
                                                        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                                        overflow: 'hidden',
                                                        padding: 16,
                                                        boxShadow: '0 4px 6px rgba(0,0,0,0.07)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <i className="ms-Icon ms-Icon--ProgressLoopOuter" style={{ fontSize: 14, color: '#D65541' }} />
                                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#061733' }}>Processing</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ fontSize: 12, fontWeight: 700, color: failed ? '#D65541' : '#374151' }}>{statusText}</span>
                                                                <button
                                                                    onClick={() => setSupportPanelOpen(!supportPanelOpen)}
                                                                    style={{
                                                                        background: supportPanelOpen ? '#D65541' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                                                        color: supportPanelOpen ? '#fff' : '#D65541',
                                                                        border: '1px solid #D65541',
                                                                        borderRadius: 6,
                                                                        padding: '6px 10px',
                                                                        fontSize: 11,
                                                                        fontWeight: 600,
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                    title="Support Request"
                                                                >
                                                                    <i className="ms-Icon ms-Icon--Help" style={{ fontSize: 12 }} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Processing stats in cleaner design */}
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <div style={{
                                                                    width: 8,
                                                                    height: 8,
                                                                    borderRadius: '50%',
                                                                    background: '#e5e7eb'
                                                                }}></div>
                                                                <span style={{ fontSize: 11, color: '#6b7280' }}>Total: {total}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <div style={{
                                                                    width: 8,
                                                                    height: 8,
                                                                    borderRadius: '50%',
                                                                    background: '#20b26c'
                                                                }}></div>
                                                                <span style={{ fontSize: 11, color: '#6b7280' }}>Done: {done}</span>
                                                            </div>
                                                            {failed > 0 && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <div style={{
                                                                        width: 8,
                                                                        height: 8,
                                                                        borderRadius: '50%',
                                                                        background: '#ef4444'
                                                                    }}></div>
                                                                    <span style={{ fontSize: 11, color: '#ef4444' }}>Failed: {failed}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Progress bar */}
                                                        <div style={{ 
                                                            height: 6, 
                                                            background: '#f3f4f6', 
                                                            borderRadius: 6, 
                                                            overflow: 'hidden',
                                                            marginBottom: 14
                                                        }}>
                                                            <div 
                                                                style={{ 
                                                                    height: '100%', 
                                                                    background: failed > 0 ? '#ef4444' : 'linear-gradient(90deg, #20b26c 0%, #16a34a 100%)', 
                                                                    width: `${pct}%`,
                                                                    transition: 'width 0.3s ease'
                                                                }}
                                                            />
                                                        </div>

                                                        {/* Processing Steps - professional grid */}
                                                        <div style={{ 
                                                            display: 'grid', 
                                                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                                                            gap: 8,
                                                            marginBottom: supportPanelOpen ? 12 : 0
                                                        }}>
                                                            {processingSteps.map((step, index) => (
                                                                <div 
                                                                    key={index} 
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        padding: '6px 8px',
                                                                        background: step.status === 'error' ? '#fef2f2' : 
                                                                                   step.status === 'pending' ? '#eff6ff' : '#f9fafb',
                                                                        border: step.status === 'success' ? '1px solid #e5e7eb' : 
                                                                               step.status === 'error' ? '1px solid #fecaca' : 
                                                                               step.status === 'pending' ? '1px solid #bfdbfe' : '1px solid #e5e7eb',
                                                                        borderRadius: 6,
                                                                        fontSize: 10,
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                >
                                                                    {step.status === 'pending' ? (
                                                                        <div style={{
                                                                            width: 10,
                                                                            height: 10,
                                                                            border: '1.5px solid #3b82f6',
                                                                            borderTop: '1.5px solid transparent',
                                                                            borderRadius: '50%',
                                                                            animation: 'spin 1s linear infinite'
                                                                        }} />
                                                                    ) : (
                                                                        <i 
                                                                            className={`ms-Icon ms-Icon--${
                                                                                step.status === 'success' ? 'CheckMark' : 
                                                                                step.status === 'error' ? 'Error' : 'Clock'
                                                                            }`} 
                                                                            style={{ 
                                                                                fontSize: 10,
                                                                                color: step.status === 'success' ? '#16a34a' : 
                                                                                       step.status === 'error' ? '#dc2626' : '#9ca3af'
                                                                            }} 
                                                                        />
                                                                    )}
                                                                    <span style={{
                                                                        color: step.status === 'success' ? '#15803d' : 
                                                                               step.status === 'error' ? '#dc2626' : 
                                                                               step.status === 'pending' ? '#1d4ed8' : '#6b7280',
                                                                        fontWeight: step.status === 'pending' ? 600 : 500,
                                                                        fontSize: 10
                                                                    }}>
                                                                        {step.label}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Support Panel (integrated, collapsible) */}
                                                        {supportPanelOpen && (
                                                            <div style={{
                                                                marginTop: 12,
                                                                padding: 12,
                                                                background: 'linear-gradient(135deg, #FEF7F0 0%, #FDF2E9 100%)',
                                                                border: '1px solid #F97316',
                                                                borderRadius: 8
                                                            }}>
                                                                <div style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 8,
                                                                    marginBottom: 8
                                                                }}>
                                                                    <i className="ms-Icon ms-Icon--Help" style={{ fontSize: 12, color: '#ea580c' }} />
                                                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#ea580c' }}>Request Support</span>
                                                                </div>
                                                                <div style={{ marginBottom: 8 }}>
                                                                    <select
                                                                        value={supportCategory}
                                                                        onChange={(e) => setSupportCategory(e.target.value as 'technical' | 'process' | 'data')}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '6px 8px',
                                                                            border: '1px solid #d1d5db',
                                                                            borderRadius: 4,
                                                                            fontSize: 11,
                                                                            marginBottom: 8
                                                                        }}
                                                                    >
                                                                        <option value="technical">Technical Issue</option>
                                                                        <option value="process">Process Question</option>
                                                                        <option value="data">Data Problem</option>
                                                                    </select>
                                                                    <textarea
                                                                        value={supportMessage}
                                                                        onChange={(e) => setSupportMessage(e.target.value)}
                                                                        placeholder="Describe the issue you're experiencing..."
                                                                        rows={3}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '6px 8px',
                                                                            border: '1px solid #d1d5db',
                                                                            borderRadius: 4,
                                                                            fontSize: 12,
                                                                            resize: 'vertical',
                                                                            fontFamily: 'inherit'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={sendSupportRequest}
                                                                    disabled={!supportMessage.trim() || supportSending}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '8px 16px',
                                                                        background: supportSending ? '#9ca3af' : 'linear-gradient(135deg, #D65541 0%, #B83C2B 100%)',
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        borderRadius: 6,
                                                                        fontSize: 12,
                                                                        fontWeight: 600,
                                                                        cursor: supportSending || !supportMessage.trim() ? 'not-allowed' : 'pointer',
                                                                        opacity: supportSending || !supportMessage.trim() ? 0.6 : 1,
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                >
                                                                    {supportSending ? 'Sending...' : 'Send Support Request'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CSS for smooth hover effects and navigation animations */}
                    <style>{`
                        .review-summary-hoverable {
                            box-shadow: none;
                        }
                        .review-summary-hoverable:hover {
                            border-color: #D65541 !important;
                            box-shadow: 0 0 0 1px #D65541;
                        }
                        
                        /* Spinner animation */
                        @keyframes spin {
                            0% { transform: translate(-50%, -50%) rotate(0deg); }
                            100% { transform: translate(-50%, -50%) rotate(360deg); }
                        }
                        
                        /* Navigation button animations */
                        .nav-button-container:hover .nav-button.back-button {
                            transform: scale(1.1);
                            border-color: #0078d4;
                            box-shadow: 0 4px 12px rgba(0, 120, 212, 0.2);
                        }
                        
                        .nav-button-container:hover .nav-button.forward-button {
                            transform: scale(1.1);
                            box-shadow: 0 4px 12px rgba(0, 120, 212, 0.3);
                        }
                        
                        .nav-button-container:hover .nav-label {
                            opacity: 1 !important;
                            visibility: visible !important;
                            transform: translateY(-50%) translateX(0) !important;
                        }
                        
                        .nav-button-container:hover .back-label {
                            transform: translateY(-50%) translateX(-8px) !important;
                        }
                        
                        .nav-button-container:hover .forward-label {
                            transform: translateY(-50%) translateX(8px) !important;
                        }
                        
                        .nav-button:active {
                            transform: scale(0.95) !important;
                        }
                        
                        .nav-button-container {
                            animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                        }
                        
                        @keyframes fadeInUp {
                            from {
                                opacity: 0;
                                transform: translateY(20px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                        
                        @keyframes fadeIn {
                            from { opacity: 0; transform: scale(0.8); }
                            to { opacity: 1; transform: scale(1); }
                        }
                    `}</style>


                    {/* Navigation Container - Removed as requested */}
                
                {/* Clear All Dialog */}
                <Dialog
                  hidden={!isClearDialogOpen}
                  onDismiss={() => setIsClearDialogOpen(false)}
                  dialogContentProps={{
                    type: DialogType.normal,
                    title: 'Clear All Data',
                    subText: 'Are you sure you want to clear all form data? This action cannot be undone.'
                  }}
                  modalProps={{
                    isBlocking: true
                  }}
                >
                  <DialogFooter>
                    <PrimaryButton onClick={doClearAll} text="Yes, clear all" />
                    <DefaultButton onClick={() => setIsClearDialogOpen(false)} text="Cancel" />
                  </DialogFooter>
                </Dialog>
        </CompletionProvider>
    );
}

export default FlatMatterOpening;
