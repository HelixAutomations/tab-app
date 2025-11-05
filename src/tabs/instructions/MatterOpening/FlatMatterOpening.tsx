//
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'; // invisible change
// invisible change 2.2
import { Stack, PrimaryButton, Dialog, DialogType, DialogFooter, DefaultButton, IconButton } from '@fluentui/react';
import MinimalSearchBox from './MinimalSearchBox';
import { POID, TeamData, UserData, InstructionData } from '../../../app/functionality/types';
import ClientDetails from '../ClientDetails';
import ClientHub from '../ClientHub';
import StepWrapper from './StepWrapper';
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
import localTeamDataJson from '../../../localData/team-sql-data.json';
import localUserData from '../../../localData/localUserData.json';

import ClientInfoStep from './ClientInfoStep';
import PoidSelectionStep from './PoidSelectionStep';
import AreaOfWorkStep from './AreaOfWorkStep';
import PracticeAreaStep from './PracticeAreaStep';
import DescriptionStep from './DescriptionStep';
import FolderStructureStep from './FolderStructureStep';
import ValueAndSourceStep from './ValueAndSourceStep';
import SourceStep from './SourceStep';
import OpponentDetailsStep from './OpponentDetailsStep';
import ModernMultiSelect from './ModernMultiSelect';
import BudgetStep from './BudgetStep';

import { CompletionProvider } from './CompletionContext';
import ProcessingSection, { ProcessingStep } from './ProcessingSection';
import { processingActions, initialSteps, registerClientIdCallback, registerMatterIdCallback, registerOperationObserver, setCurrentActionIndex } from './processingActions';
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
}) => {
    // Dark mode support
    const { isDarkMode } = useTheme();
    
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
        });
        return () => {
            registerClientIdCallback(null);
            registerMatterIdCallback(null);
        };
    }, []);

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
                        best_number: match.best_number || inst.Phone,
                        company_name: match.company_name || inst.CompanyName,
                        company_number: match.company_number || inst.CompanyNumber,
                        // Include verification fields from instruction if not present in matched POID
                        check_result: match.check_result || inst.EIDOverallResult,
                        pep_sanctions_result: match.pep_sanctions_result || inst.PEPAndSanctionsCheckResult,
                        address_verification_result: match.address_verification_result || inst.AddressVerificationResult,
                    } as POID);
                } else {
                    // No match in basePoids – include a minimal record for UI visibility (won't be preselected)
                    merged.push({
                        poid_id: String(instRef || inst.id || emailKey || `${inst.FirstName || ''}|${inst.LastName || ''}`),
                        first: inst.FirstName,
                        last: inst.LastName,
                        email: inst.Email,
                        best_number: inst.Phone,
                        company_name: inst.CompanyName,
                        company_number: inst.CompanyNumber,
                        InstructionRef: instRef,
                        // Include verification fields from instruction record
                        check_result: inst.EIDOverallResult,
                        pep_sanctions_result: inst.PEPAndSanctionsCheckResult,
                        address_verification_result: inst.AddressVerificationResult,
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

        // No instructionRecords – just return basePoids with email de-duplication
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
    const localTeamData = useMemo(() => localTeamDataJson, []);
    // Developer Tools container removed as requested
    // Restore debug inspector core state (was previously earlier in file)
    const [debugInspectorOpen, setDebugInspectorOpen] = useState(false);
    const [debugActiveTab, setDebugActiveTab] = useState<'json' | 'details' | 'advanced'>('json');
    const [debugAdvancedOpen, setDebugAdvancedOpen] = useState(false);
    const [debugManualJson, setDebugManualJson] = useState('');
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
        const dataset = (teamData ?? localTeamData) as unknown;
        if (!Array.isArray(dataset)) return [] as any[];
        return dataset.filter((t: any) => String(t?.status ?? t?.Status ?? '').toLowerCase() === 'active');
    }, [teamData, localTeamData]);

    const partnerOptionsList = useMemo(() => {
        const partnersFirst = activeTeam
            .filter((t: any) => String(t?.Role || '').toLowerCase() === 'partner')
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
        return activeTeam.map(getFullName).filter(Boolean);
    }, [activeTeam]);

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
            .filter((member: any) => member.Role === 'Partner')
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
        const found = teamData.find(t => {
            const full = (t['Full Name'] || `${t.First || ''} ${t.Last || ''}`).trim();
            return full.toLowerCase() === name.toLowerCase();
        });
        if (found && found.Initials) return found.Initials;
        return name
            .split(' ')
            .filter(Boolean)
            .map(part => part[0].toUpperCase())
            .join('');
    }

    // Determine requesting user nickname based on environment
    const requestingUserNickname =
        process.env.NODE_ENV === 'production'
            ? getTeamNickname(userInitials, teamData || localTeamDataJson)
            : getLocalUserNickname(userInitials);

    // Determine requesting user Clio ID based on environment
    const requestingUserClioId = getClioId(userInitials, teamData || localTeamDataJson);

    // Environment/admin flags for gated backend details
    const isLocalDev = process.env.NODE_ENV !== 'production';
    const isAdminUser = useMemo(() => {
        try {
            const dataset = (teamData || localTeamDataJson) as any[];
            const me = dataset.find(t => (t.Initials || '').toLowerCase() === userInitials.toLowerCase());
            const roleText = (me?.Role || '').toLowerCase();
            return roleText.includes('admin') || roleText.includes('owner') || roleText.includes('manager');
        } catch {
            return false;
        }
    }, [teamData, userInitials]);
    const adminEligible = isLocalDev || isAdminUser;

    // Horizontal sliding carousel approach
    const [currentStep, setCurrentStep] = useDraftedState<number>('currentStep', 0); // 0: select, 1: form, 2: review
    
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
        
        // Debug logging only once when completion changes significantly - using session storage to avoid spam
        try {
            const debugKey = `matterCompletion_${Math.floor(completion / 20) * 20}`; // Log every 20% change
            if (filledFields > 0 && !sessionStorage.getItem(debugKey)) {
                sessionStorage.setItem(debugKey, 'true');
                
                console.log('Matter step filled fields:', filledFields, 'out of', totalFields, 'completion:', completion + '%');
                console.log('Debug values:', {
                    selectedDate: selectedDate !== null,
                    supervisingPartner: supervisingPartner || 'EMPTY',
                    originatingSolicitor: originatingSolicitor || 'EMPTY',
                    areaOfWork: areaOfWork || 'EMPTY',
                    practiceArea: practiceArea || 'EMPTY',
                    description: description || 'EMPTY',
                    folderStructure: folderStructure || 'EMPTY',
                    source: source || 'EMPTY',
                    noConflict,
                    referrerName: referrerName || 'EMPTY',
                    defaultTeamMember: defaultTeamMember || 'EMPTY'
                });
            }
        } catch {
            // Ignore storage errors
        }
        
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
            
            // Debug logging for production troubleshooting - limit to avoid spam
            try {
                const debugKey = `client-instruction-${!!hasClientSelection}`;
                if (!sessionStorage.getItem(debugKey)) {
                    sessionStorage.setItem(debugKey, 'true');
                    console.log('Matter Opening Debug (Instruction Mode):', {
                        instructionRef,
                        hideClientSections,
                        selectedPoidIds: selectedPoidIds.length,
                        hasClientSelection,
                        result: hasClientSelection
                    });
                }
            } catch {
                // Ignore storage errors
            }
            
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
            // Persist the actively chosen client type if available
            setClientType(pendingClientType || clientType);
            setCurrentStep(1);
            // Scroll to top when changing steps
            // Removed smooth scroll to avoid transition jolt
            // window.scrollTo({ top: 0 });
        }
    };

    const handleGoToReview = () => {
        setCurrentStep(2);
        // Scroll to top when changing steps
    // window.scrollTo({ top: 0 });
    };

    const handleBackToClients = () => {
        setCurrentStep(0);
        // Scroll to top when changing steps
    // window.scrollTo({ top: 0 });
    };

    const handleBackToForm = () => {
        setCurrentStep(1);
        setSummaryConfirmed(false); // Reset confirmation when going back to edit
        setConfirmAcknowledge(false); // Reset acknowledgement checkbox
        setEditsAfterConfirmation(false); // Reset edits flag when explicitly going back
        // Scroll to top when changing steps
    // window.scrollTo({ top: 0 });
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
            // From Matter Details -> back to Select Parties
            setCurrentStep(0);
            // Scroll to top when changing steps
            // window.scrollTo({ top: 0 });
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
                fee_earner_initials: getInitialsFromName(teamMember, teamData || localTeamDataJson),
                originating_solicitor_initials: getInitialsFromName(originatingSolicitor, teamData || localTeamDataJson)
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
            }
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
    
    // Local userData state for fallback when prop is missing
    const [fallbackUserData, setFallbackUserData] = useState<UserData[] | null>(null);
    const [userDataLoading, setUserDataLoading] = useState(false);
    
    // Fallback function to fetch userData if not provided via props
    const fetchUserDataFallback = async (entraId: string): Promise<UserData[] | null> => {
        if (!entraId) {
            console.warn('⚠️ [fetchUserDataFallback] No Entra ID provided');
            return null;
        }
        
        setUserDataLoading(true);
        console.log(`🔄 [fetchUserDataFallback] Fetching user data for Entra ID: ${entraId}`);
        
        try {
            const response = await fetch('/api/user-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userObjectId: entraId })
            });
            
            if (!response.ok) {
                console.error('❌ [fetchUserDataFallback] Failed to fetch user data:', response.status);
                return null;
            }
            
            const data = await response.json();
            console.log('✅ [fetchUserDataFallback] User data fetched successfully:', data);
            setFallbackUserData(data);
            return data;
        } catch (error) {
            console.error('❌ [fetchUserDataFallback] Error fetching user data:', error);
            return null;
        } finally {
            setUserDataLoading(false);
        }
    };
    
    // Get effective userData (prop or fallback)
    const effectiveUserData = userData || fallbackUserData;

    // Process matter opening steps defined in processingActions
    const simulateProcessing = async () => {
        let workingUserData = effectiveUserData;
        
        // CRITICAL: Validate userData is loaded before processing - try fallback if missing
        if (!workingUserData || !Array.isArray(workingUserData) || workingUserData.length === 0) {
            console.warn('⚠️ [simulateProcessing] userData missing, attempting fallback fetch...');
            
            // Try to get Entra ID from teamData by matching userInitials
            let entraId: string | null = null;
            if (teamData && Array.isArray(teamData) && userInitials) {
                const teamMember = teamData.find((t: any) => 
                    (t.Initials || t.initials || '').toLowerCase() === userInitials.toLowerCase()
                );
                entraId = teamMember?.['Entra ID'] || (teamMember as any)?.EntraID || null;
                console.log('🔍 [simulateProcessing] Found Entra ID from teamData:', { userInitials, entraId: entraId ? entraId.substring(0, 8) + '...' : null });
            }
            
            if (entraId) {
                const fallbackData = await fetchUserDataFallback(entraId);
                if (fallbackData && fallbackData.length > 0) {
                    console.log('✅ [simulateProcessing] Fallback userData loaded successfully');
                    workingUserData = fallbackData;
                } else {
                    const errorMsg = 'User profile data could not be loaded. Please refresh the page and try again.';
                    setFailureSummary(`Failed at: Pre-validation – ${errorMsg}`);
                    setProcessingLogs([`❌ Pre-validation: ${errorMsg}`]);
                    setProcessingSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'error', message: errorMsg } : s));
                    setDebugInspectorOpen(true);
                    console.error('❌ [simulateProcessing] userData validation failed after fallback:', { userData, fallbackUserData, userInitials });
                    return { url: '' };
                }
            } else {
                const errorMsg = 'User profile data not loaded and Entra ID not found. Please refresh the page and try again.';
                setFailureSummary(`Failed at: Pre-validation – ${errorMsg}`);
                setProcessingLogs([`❌ Pre-validation: ${errorMsg}`]);
                setProcessingSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'error', message: errorMsg } : s));
                setDebugInspectorOpen(true);
                console.error('❌ [simulateProcessing] userData validation failed - no Entra ID available:', { userData, fallbackUserData, userInitials, hasTeamData: !!teamData });
                return { url: '' };
            }
        }

        // Validate required Asana credentials are present
        const user = workingUserData[0];
        if (!user.ASANASecret && !user.ASANA_Secret) {
            const errorMsg = 'Asana credentials missing from user profile. Please contact support.';
            setFailureSummary(`Failed at: Pre-validation – ${errorMsg}`);
            setProcessingLogs([`❌ Pre-validation: ${errorMsg}`]);
            setProcessingSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'error', message: errorMsg } : s));
            setDebugInspectorOpen(true);
            console.error('❌ [simulateProcessing] Asana credentials validation failed:', { user });
            return { url: '' };
        }

        console.log('✅ [simulateProcessing] Pre-validation passed:', {
            userInitials,
            hasUserData: !!workingUserData,
            userDataLength: workingUserData?.length,
            hasAsanaSecret: !!(user.ASANASecret || user.ASANA_Secret),
            hasAsanaClientID: !!(user.ASANAClient_ID || user.ASANAClientID),
            userDataSource: workingUserData === userData ? 'prop' : 'fallback'
        });

        setIsProcessing(true);
        setProcessingOpen(true);
        setProcessingLogs([]);
        setProcessingSteps(initialSteps);
        setFailureSummary('');
        
        // Activate workbench mode immediately on submission
        // setTimeout(() => setWorkbenchMode(true), 300); // Disabled - keep processing in main section
        
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
                const result = await action.run(generateSampleJson(), userInitials, workingUserData);
                const message = typeof result === 'string' ? result : result.message;
                setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message } : s));
                setProcessingLogs(prev => [...prev, `✓ ${message}`]);
                if (typeof result === 'object' && result.url) {
                    url = result.url;
                }
            }

            setProcessingLogs(prev => [...prev, '🎉 Matter opening completed successfully!']);
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
            setFailureSummary(`Failed at: ${failingLabel} – ${msg}`);
            setProcessingLogs(prev => [...prev, `❌ ${failingLabel}: ${msg}`]);
            // Auto-open debug inspector
            setDebugInspectorOpen(true);
        } finally {
            registerOperationObserver(null);
            setTimeout(() => setIsProcessing(false), 2000);
            setProcessingOpen(false);
        }
        setGeneratedCclUrl(url);
        return { url };
    };

    // Manual JSON validation functions for advanced debugging
    const validateManualJson = () => {
        if (!debugManualJson.trim()) {
            setDebugValidation({ 
                isValid: false, 
                suggestions: ['Please paste JSON content first'],
                warnings: [],
                predictions: []
            });
            return;
        }
        try {
            JSON.parse(debugManualJson);
            setDebugValidation({ 
                isValid: true, 
                suggestions: [], 
                warnings: [],
                predictions: []
            });
        } catch (error) {
            setDebugValidation({ 
                isValid: false, 
                suggestions: [`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`],
                warnings: [],
                predictions: []
            });
        }
    };

    const processManualJson = async () => {
        if (!debugValidation?.isValid) return;
        try {
            const parsed = JSON.parse(debugManualJson);
            // This would trigger the same processing pipeline with manual data
            console.log('Manual JSON processing would use:', parsed);
            alert('Manual JSON processing is for development use only.');
        } catch (error) {
            console.error('Manual JSON processing failed:', error);
        }
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
                    user_email: 'support@helix-law.com,lz@helix-law.com,cb@helix-law.com',
                    subject: `Matter Opening Support: ${supportCategory} - ${instructionRef || 'Generic'}`,
                    from_email: userEmailAddress,
                    bcc_emails: 'automations@helix-law.com'
                })
            });

            if (response.ok) {
                setSupportMessage('');
                setSupportPanelOpen(false);
                // Show success notification
                alert('Support request sent successfully!');
            } else {
                throw new Error('Failed to send support request');
            }
        } catch (error) {
            console.error('Support request failed:', error);
            alert('Failed to send support request. Please try again.');
        } finally {
            setSupportSending(false);
        }
    };

    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

    // Entry choice: New vs Existing/Carry On
    // Entry mode simplified: always start a fresh matter (no resume flow)
    const [entryMode, setEntryMode] = useState<'new'>('new');
    const shouldShowEntryModal = false; // permanently false
    const handleChooseNew = () => { /* retained for compatibility; no action needed */ };
    const handleChooseExisting = () => { /* existing mode removed */ };

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

    // Show CCL prompt only once processing has finished with success
    const showCclPrompt = currentStep === 2 && summaryConfirmed && allProcessingSucceeded;

    // State for CCL draft choice and generating status
    const [draftChoice, setDraftChoice] = useState<'yes' | 'no' | undefined>(undefined);
    const [cclGenerating, setCclGenerating] = useState(false);

    const handleDraftChoice = (choice: 'yes' | 'no') => {
        setDraftChoice(choice);
        if (choice === 'yes' && openedMatterId && onDraftCclNow) {
            onDraftCclNow(openedMatterId);
        }
    };

    const showProcessingSection = processingSteps.some(s => s.status !== 'pending');

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
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 6,
                        fontSize: 13,
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
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '13px',
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
                            Select Parties
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
                                borderRadius: '6px',
                                fontWeight: currentStep === 1 ? 600 : 500,
                                fontSize: '13px',
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
                            Build Matter
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
                                borderRadius: '6px',
                                fontWeight: currentStep === 2 ? 600 : 500,
                                fontSize: '13px',
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
                            Review and Confirm
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
                                borderRadius: 6,
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
            />
        );
        
        // Cleanup when component unmounts
        return () => {
            setContent(null);
        };
    }, [setContent, currentStep, clientsStepComplete, matterStepComplete, summaryConfirmed, hasDataToClear, getFieldCount, showPoidSelection, pendingClientType, selectedPoidIds, poidSearchTerm, handleBackToClients, handleBackToForm, handleGoToReview, handleClearAll, handleGoBack, isDarkMode]);

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
                    <div style={{ 
                        overflow: 'hidden',
                        position: 'relative',
                        width: '100%',
                        // Reduced from 500px to shrink excessive white space after moving processing section
                        minHeight: '320px'
                    }}>
                        <div style={{ 
                            display: 'flex',
                            width: '300%', // 3 panels * 100% each
                            transform: `translateX(-${currentStep * 33.333}%)`,
                            transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            height: '100%'
                        }}>
                            
                            {/* Step 1: Client Selection */}
                            <div style={{ 
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
                                        poidData={effectivePoidData}
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
                                    />
                                </div>
                                
                                {/* Opponent Details Step - appears after POID selection OR when in instruction mode */}
                                {((selectedPoidIds.length > 0 && pendingClientType) || (hideClientSections && initialClientType)) && (
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
                                        />
                                    </div>
                                )}
                                
                                {/* Continue to Matter Details Button */}
                                <div style={{ 
                                    marginTop: 24, 
                                    display: 'flex', 
                                    justifyContent: 'flex-end',
                                    padding: '16px 0'
                                }}>
                                    <button
                                        onClick={clientsStepComplete ? handleContinueToForm : undefined}
                                        disabled={!clientsStepComplete}
                                        style={{
                                            minWidth: '200px',
                                            padding: '12px 20px',
                                            backgroundColor: clientsStepComplete ? colours.highlight : (isDarkMode ? colours.dark.disabledBackground : '#f3f2f1'),
                                            color: clientsStepComplete ? 'white' : (isDarkMode ? colours.dark.text : '#323130'),
                                            border: clientsStepComplete ? 'none' : `1px solid ${isDarkMode ? colours.dark.borderColor : '#d2d0ce'}`,
                                            borderRadius: '6px',
                                            cursor: clientsStepComplete ? 'pointer' : 'not-allowed',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 10,
                                            fontSize: 14,
                                            fontWeight: 500,
                                            transition: 'all 0.2s ease',
                                            boxShadow: clientsStepComplete ? '0 2px 4px rgba(54, 144, 206, 0.2)' : 'none'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (clientsStepComplete) {
                                                e.currentTarget.style.backgroundColor = '#2a7bb8';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(54, 144, 206, 0.3)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (clientsStepComplete) {
                                                e.currentTarget.style.backgroundColor = colours.highlight;
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(54, 144, 206, 0.2)';
                                            }
                                        }}
                                    >
                                        Continue to Matter Details
                                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                                            <path d="M5 12h14m-7-7l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Step 2: Matter Form */}
                            <div style={{ 
                                width: '33.333%', 
                                padding: '16px', 
                                boxSizing: 'border-box' 
                            }}>
                                <ClientInfoStep
                                    selectedDate={selectedDate}
                                    setSelectedDate={setSelectedDate}
                                    teamMember={teamMember}
                                    setTeamMember={setTeamMember}
                                    teamMemberOptions={teamMemberOptions}
                                    supervisingPartner={supervisingPartner}
                                    setSupervisingPartner={setSupervisingPartner}
                                    originatingSolicitor={originatingSolicitor}
                                    setOriginatingSolicitor={setOriginatingSolicitor}
                                    isDateCalloutOpen={isDateCalloutOpen}
                                    setIsDateCalloutOpen={setIsDateCalloutOpen}
                                    dateButtonRef={dateButtonRef}
                                    partnerOptions={partnerOptionsList}
                                    solicitorOptions={solicitorOptions}
                                    requestingUser={requestingUserNickname}
                                    requestingUserClioId={requestingUserClioId}
                                />
                                <Stack tokens={{ childrenGap: 24 }} style={{ marginTop: 24 }}>
                                    {/* Move NetDocuments Folder Structure above Area of Work */}
                                    <DescriptionStep
                                        description={description}
                                        setDescription={setDescriptionWithReset}
                                        matterRefPreview={(() => {
                                            // Prefer selected POID; then activePoid; then POID matched by InstructionRef; then first available
                                            const selected = selectedPoidIds[0];
                                            let poid = (selected ? effectivePoidData.find(p => p.poid_id === selected) : undefined) as POID | undefined;
                                            if (!poid) poid = activePoid as POID | undefined;
                                            if (!poid && instructionRef) {
                                                poid = effectivePoidData.find(p => (p as any).InstructionRef === instructionRef || (p as any).instruction_ref === instructionRef) as POID | undefined;
                                            }

        							// If we still don't have a POID, try to derive from the instruction record itself
                                            const instFromRecords = (() => {
                                                if (!instructionRef || !Array.isArray(instructionRecords)) return undefined as any;
                                                return (instructionRecords as any[]).find(r => r && (r.InstructionRef === instructionRef));
                                            })();

                                            if (!poid && !instFromRecords) {
                                                const typeGuess = pendingClientType || 'Individual';
                                                let base = (clientAsOnFile || '').toUpperCase();
                                                if (typeGuess === 'Multiple Individuals') {
                                                    const digits = Math.floor(10000 + Math.random() * 90000);
                                                    return (base.slice(0, 5).padEnd(5, 'X') || 'HLXXX') + digits + '-0001';
                                                }
                                                if (!base) base = 'HLX';
                                                return base.slice(0, 5).padEnd(5, 'X') + '-0001';
                                            }

                                            // Build from either POID or instruction record details
                                            const type = (() => {
                                                if (pendingClientType) return pendingClientType;
                                                if (poid) return poid.company_name ? 'Company' : 'Individual';
                                                const t = (instFromRecords as any)?.ClientType as string | undefined;
                                                return t || 'Individual';
                                            })();

                                            const buildFromBase = (raw: string): string => {
                                                const base = (raw || '').toUpperCase() || 'HLX';
                                                return base.slice(0, 5).padEnd(5, 'X') + '-0001';
                                            };

                                            if (type === 'Multiple Individuals') {
                                                const raw = (clientAsOnFile || (poid?.last || poid?.first) || (instFromRecords?.LastName || instFromRecords?.FirstName) || '').toUpperCase();
                                                const digits = Math.floor(10000 + Math.random() * 90000);
                                                return (raw.slice(0, 5).padEnd(5, 'X') || 'HLXXX') + digits + '-0001';
                                            }

                                            if (poid) {
                                                if (type === 'Company') {
                                                    return buildFromBase(poid.company_name || clientAsOnFile || poid.last || '');
                                                }
                                                // Individual
                                                return buildFromBase(poid.last || poid.first || clientAsOnFile || '');
                                            }

                                            // No POID, derive from instruction record
                                            if (instFromRecords) {
                                                const rec: any = instFromRecords;
                                                if (type === 'Company') {
                                                    return buildFromBase(rec.CompanyName || clientAsOnFile || rec.LastName || rec.FirstName || '');
                                                }
                                                return buildFromBase(rec.LastName || rec.FirstName || clientAsOnFile || '');
                                            }

                                            // Final fallback
                                            return buildFromBase(clientAsOnFile || 'HLX');
                                        })()}
                                    />
                                    <FolderStructureStep
                                        folderStructure={folderStructure}
                                        setFolderStructure={(value) => {
                                            setFolderStructureWithReset(value);
                                            // Auto-select Area of Work based on folder structure
                                            if (value === 'Default / Commercial') setAreaOfWorkWithReset('Commercial');
                                            else if (value === 'Residential Possession') setAreaOfWorkWithReset('Property');
                                            else if (value === 'Adjudication') setAreaOfWorkWithReset('Construction');
                                            else if (value === 'Employment') setAreaOfWorkWithReset('Employment');
                                        }}
                                        folderOptions={['Default / Commercial', 'Residential Possession', 'Adjudication', 'Employment']}
                                        onContinue={function (): void {} }
                                    />
                                    <AreaOfWorkStep
                                        areaOfWork={areaOfWork}
                                        setAreaOfWork={setAreaOfWorkWithReset}
                                        getGroupColor={getGroupColor}
                                        onContinue={function (): void {} }
                                    />
                                    <PracticeAreaStep
                                        options={areaOfWork && practiceAreasByArea[areaOfWork] ? practiceAreasByArea[areaOfWork] : ['Please select an Area of Work']}
                                        practiceArea={practiceArea}
                                        setPracticeArea={setPracticeAreaWithReset}
                                        areaOfWork={areaOfWork}
                                        onContinue={function (): void {} }
                                    />
                                    <ValueAndSourceStep
                                        disputeValue={disputeValue}
                                        setDisputeValue={setDisputeValueWithReset}
                                        source={source}
                                        setSource={setSource}
                                        referrerName={referrerName}
                                        setReferrerName={setReferrerName}
                                        onContinue={() => {}}
                                    />
                                    <BudgetStep
                                        budgetRequired={budgetRequired}
                                        setBudgetRequired={setBudgetRequired}
                                        budgetAmount={budgetAmount}
                                        setBudgetAmount={setBudgetAmount}
                                        threshold={budgetThreshold}
                                        setThreshold={setBudgetThreshold}
                                        notifyUsers={budgetNotifyUsers}
                                        setNotifyUsers={setBudgetNotifyUsers}
                                    />

                                </Stack>
                                {/* Navigation buttons for form step */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                                    {/* Back button */}
                                    <button
                                        onClick={handleBackToClients}
                                        style={{
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: 8,
                                            padding: '12px 20px',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: '#374151',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            transition: 'all 0.2s ease',
                                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)';
                                            e.currentTarget.style.borderColor = '#3690CE';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                                        }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        Back to Party Details
                                    </button>

                                    {/* Forward button */}
                                    <button
                                        onClick={handleGoToReview}
                                        style={{
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: 8,
                                            padding: '12px 20px',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: '#374151',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            transition: 'all 0.2s ease',
                                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)';
                                            e.currentTarget.style.borderColor = '#3690CE';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                                        }}
                                    >
                                        Review Summary
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                            <path d="M5 12h14m-7-7l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Step 3: Review Summary */}
                            <div style={{ width: '33.333%', padding: '16px', boxSizing: 'border-box' }}>
                                    {/* Diagnostic Assistant - Bridge between fee earner and dev team */}
                                    {debugInspectorOpen && (
                                        <div style={{
                                            marginBottom: 24,
                                            border: '2px solid #D65541',
                                            borderRadius: 8,
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #FEF2F2 100%)',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                padding: '12px 16px',
                                                background: 'linear-gradient(135deg, #D65541 0%, #B83C2B 100%)',
                                                color: '#fff',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <i className="ms-Icon ms-Icon--Medical" style={{ fontSize: 12 }} />
                                                    Diagnostic Assistant
                                                </span>
                                                <button
                                                    onClick={() => setDebugInspectorOpen(false)}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.1)',
                                                        border: '1px solid rgba(255,255,255,0.2)',
                                                        borderRadius: 4,
                                                        padding: '4px 8px',
                                                        fontSize: 10,
                                                        color: '#fff',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 4
                                                    }}
                                                >
                                                    <i className="ms-Icon ms-Icon--Cancel" style={{ fontSize: 10 }} />
                                                    Close
                                                </button>
                                            </div>
                                            <div style={{ padding: 16, display: 'grid', gap: 16 }}>
                                                {/* Issue Summary */}
                                                {failureSummary ? (
                                                    <div style={{
                                                        padding: '12px',
                                                        background: 'linear-gradient(135deg, #FFF5F5 0%, #FDE8E8 100%)',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: 6,
                                                        fontSize: 12
                                                    }}>
                                                        <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
                                                            Issue Detected
                                                        </div>
                                                        <div style={{ color: '#7c2d12', lineHeight: 1.4 }}>{failureSummary}</div>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    setSupportSending(true);
                                                                    
                                                                    // Prepare detailed report
                                                                    const reportDetails = {
                                                                        issue: failureSummary,
                                                                        user: userInitials,
                                                                        instruction: instructionRef || 'N/A',
                                                                        timestamp: new Date().toLocaleString(),
                                                                        formData: {
                                                                            client_type: clientType,
                                                                            area_of_work: areaOfWork,
                                                                            practice_area: practiceArea,
                                                                            description: description,
                                                                            fee_earner: teamMember,
                                                                            supervising_partner: supervisingPartner
                                                                        },
                                                                        processingSteps: processingSteps.map(step => ({
                                                                            label: step.label,
                                                                            status: step.status,
                                                                            message: step.message
                                                                        })),
                                                                        userAgent: navigator.userAgent,
                                                                        url: window.location.href
                                                                    };

                                                                    const emailBody = `
                                                                        <h2>Matter Opening Issue Report</h2>
                                                                        <p><strong>Issue:</strong> ${failureSummary}</p>
                                                                        <p><strong>User:</strong> ${userInitials}</p>
                                                                        <p><strong>Instruction Reference:</strong> ${instructionRef || 'N/A'}</p>
                                                                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                                                                        
                                                                        <h3>Form Data</h3>
                                                                        <ul>
                                                                            <li><strong>Client Type:</strong> ${clientType}</li>
                                                                            <li><strong>Area of Work:</strong> ${areaOfWork}</li>
                                                                            <li><strong>Practice Area:</strong> ${practiceArea}</li>
                                                                            <li><strong>Description:</strong> ${description}</li>
                                                                            <li><strong>Fee Earner:</strong> ${teamMember}</li>
                                                                            <li><strong>Supervising Partner:</strong> ${supervisingPartner}</li>
                                                                        </ul>

                                                                        <h3>Processing Steps Status</h3>
                                                                        <table border="1" style="border-collapse: collapse;">
                                                                            <tr><th>Step</th><th>Status</th><th>Message</th></tr>
                                                                            ${processingSteps.map(step => 
                                                                                `<tr>
                                                                                    <td>${step.label}</td>
                                                                                    <td>${step.status}</td>
                                                                                    <td>${step.message || ''}</td>
                                                                                </tr>`
                                                                            ).join('')}
                                                                        </table>

                                                                        <h3>Technical Details</h3>
                                                                        <p><strong>User Agent:</strong> ${navigator.userAgent}</p>
                                                                        <p><strong>URL:</strong> ${window.location.href}</p>
                                                                        
                                                                        <pre>${JSON.stringify(reportDetails, null, 2)}</pre>
                                                                    `;

                                                                    const response = await fetch('/api/sendEmail', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                        },
                                                                        body: JSON.stringify({
                                                                            to: 'lz@helix-law.com',
                                                                            subject: `Matter Opening Issue - ${userInitials} - ${instructionRef || 'Unknown'}`,
                                                                            html: emailBody,
                                                                            from_email: 'automations@helix-law.com'
                                                                        })
                                                                    });

                                                                    if (response.ok) {
                                                                        alert('Issue report sent successfully to development team!');
                                                                    } else {
                                                                        const error = await response.text();
                                                                        alert(`Failed to send report: ${error}`);
                                                                    }
                                                                } catch (error) {
                                                                    console.error('Failed to send report:', error);
                                                                    const errorMessage = error instanceof Error ? error.message : String(error);
                                                                    alert(`Failed to send report: ${errorMessage}`);
                                                                } finally {
                                                                    setSupportSending(false);
                                                                }
                                                            }}
                                                            style={{
                                                                marginTop: 10,
                                                                background: supportSending 
                                                                    ? 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)' 
                                                                    : 'linear-gradient(135deg, #D65541 0%, #B83C2B 100%)',
                                                                border: 'none',
                                                                borderRadius: 4,
                                                                padding: '6px 12px',
                                                                fontSize: 11,
                                                                fontWeight: 600,
                                                                color: '#fff',
                                                                cursor: supportSending ? 'not-allowed' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 4
                                                            }}
                                                            disabled={supportSending}
                                                        >
                                                            <i className={`ms-Icon ${supportSending ? 'ms-Icon--Clock' : 'ms-Icon--Mail'}`} style={{ fontSize: 10 }} />
                                                            {supportSending ? 'Sending...' : 'Report to Development Team'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{
                                                        padding: '12px',
                                                        background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
                                                        border: '1px solid #bbf7d0',
                                                        borderRadius: 6,
                                                        fontSize: 12,
                                                        color: '#166534'
                                                    }}>
                                                        <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                                                            No Issues Detected
                                                        </div>
                                                        System is running normally. This panel opened for diagnostic purposes.
                                                        
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    setSupportSending(true);
                                                                    
                                                                    // Prepare general feedback report
                                                                    const reportDetails = {
                                                                        type: 'general_feedback',
                                                                        user: userInitials,
                                                                        instruction: instructionRef || 'N/A',
                                                                        timestamp: new Date().toLocaleString(),
                                                                        formData: {
                                                                            client_type: clientType,
                                                                            area_of_work: areaOfWork,
                                                                            practice_area: practiceArea,
                                                                            description: description,
                                                                            fee_earner: teamMember,
                                                                            supervising_partner: supervisingPartner
                                                                        },
                                                                        processingSteps: processingSteps.map(step => ({
                                                                            label: step.label,
                                                                            status: step.status,
                                                                            message: step.message
                                                                        })),
                                                                        userAgent: navigator.userAgent,
                                                                        url: window.location.href
                                                                    };

                                                                    const emailBody = `
                                                                        <h2>Matter Opening General Feedback</h2>
                                                                        <p><strong>User:</strong> ${userInitials}</p>
                                                                        <p><strong>Instruction Reference:</strong> ${instructionRef || 'N/A'}</p>
                                                                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                                                                        <p><strong>Type:</strong> General feedback/diagnostic report</p>
                                                                        
                                                                        <h3>Form Data</h3>
                                                                        <ul>
                                                                            <li><strong>Client Type:</strong> ${clientType}</li>
                                                                            <li><strong>Area of Work:</strong> ${areaOfWork}</li>
                                                                            <li><strong>Practice Area:</strong> ${practiceArea}</li>
                                                                            <li><strong>Description:</strong> ${description}</li>
                                                                            <li><strong>Fee Earner:</strong> ${teamMember}</li>
                                                                            <li><strong>Supervising Partner:</strong> ${supervisingPartner}</li>
                                                                        </ul>

                                                                        <h3>Processing Steps Status</h3>
                                                                        <table border="1" style="border-collapse: collapse;">
                                                                            <tr><th>Step</th><th>Status</th><th>Message</th></tr>
                                                                            ${processingSteps.map(step => 
                                                                                `<tr>
                                                                                    <td>${step.label}</td>
                                                                                    <td>${step.status}</td>
                                                                                    <td>${step.message || ''}</td>
                                                                                </tr>`
                                                                            ).join('')}
                                                                        </table>

                                                                        <h3>Technical Details</h3>
                                                                        <p><strong>User Agent:</strong> ${navigator.userAgent}</p>
                                                                        <p><strong>URL:</strong> ${window.location.href}</p>
                                                                        
                                                                        <pre>${JSON.stringify(reportDetails, null, 2)}</pre>
                                                                    `;

                                                                    const response = await fetch('/api/sendEmail', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                        },
                                                                        body: JSON.stringify({
                                                                            to: 'lz@helix-law.com',
                                                                            subject: `Matter Opening Feedback - ${userInitials} - ${instructionRef || 'Unknown'}`,
                                                                            html: emailBody,
                                                                            from_email: 'automations@helix-law.com'
                                                                        })
                                                                    });

                                                                    if (response.ok) {
                                                                        alert('Feedback sent successfully to development team!');
                                                                    } else {
                                                                        const error = await response.text();
                                                                        alert(`Failed to send feedback: ${error}`);
                                                                    }
                                                                } catch (error) {
                                                                    console.error('Failed to send feedback:', error);
                                                                    const errorMessage = error instanceof Error ? error.message : String(error);
                                                                    alert(`Failed to send feedback: ${errorMessage}`);
                                                                } finally {
                                                                    setSupportSending(false);
                                                                }
                                                            }}
                                                            style={{
                                                                marginTop: 8,
                                                                background: supportSending 
                                                                    ? 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)' 
                                                                    : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                                                                border: 'none',
                                                                borderRadius: 4,
                                                                padding: '4px 8px',
                                                                fontSize: 10,
                                                                fontWeight: 600,
                                                                color: '#fff',
                                                                cursor: supportSending ? 'not-allowed' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 3
                                                            }}
                                                            disabled={supportSending}
                                                        >
                                                            <i className={`ms-Icon ${supportSending ? 'ms-Icon--Clock' : 'ms-Icon--Feedback'}`} style={{ fontSize: 9 }} />
                                                            {supportSending ? 'Sending...' : 'Send Feedback'}
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Processing Step Status */}
                                                {processingSteps.length > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Step Status</div>
                                                        <div style={{
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: 6,
                                                            overflow: 'hidden',
                                                            background: isDarkMode ? '#1F2937' : '#fff'
                                                        }}>
                                                            {processingSteps.slice(0, 6).map((step, idx) => (
                                                                <div key={`step-${idx}`} style={{
                                                                    padding: '8px 12px',
                                                                    borderBottom: idx < 5 ? '1px solid #f1f5f9' : 'none',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center'
                                                                }}>
                                                                    <span style={{ fontSize: 11, color: '#6b7280' }}>{step.label}</span>
                                                                    <span style={{
                                                                        fontSize: 10,
                                                                        fontWeight: 700,
                                                                        padding: '2px 6px',
                                                                        borderRadius: 3,
                                                                        background: step.status === 'success' ? '#dcfce7' : step.status === 'error' ? '#fecaca' : '#f1f5f9',
                                                                        color: step.status === 'success' ? '#166534' : step.status === 'error' ? '#dc2626' : '#6b7280'
                                                                    }}>
                                                                        {step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : '⋯'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            {processingSteps.length > 6 && (
                                                                <div style={{ padding: '6px 12px', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
                                                                    ...and {processingSteps.length - 6} more steps
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Last Operation Details */}
                                                {operationEvents.length > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Last Operation</div>
                                                        <div style={{
                                                            padding: '10px 12px',
                                                            background: '#f8fafc',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: 6,
                                                            fontSize: 11
                                                        }}>
                                                            {(() => {
                                                                const lastOp = operationEvents[operationEvents.length - 1];
                                                                const isError = lastOp?.phase === 'error';
                                                                return (
                                                                    <div>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                                            <span style={{ fontWeight: 600, color: '#374151' }}>{lastOp?.label || 'Unknown'}</span>
                                                                            <span style={{ color: isError ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                                                                                {lastOp?.phase?.toUpperCase() || 'N/A'}
                                                                            </span>
                                                                        </div>
                                                                        {lastOp?.method && (
                                                                            <div style={{ color: '#6b7280' }}>Method: {lastOp.method}</div>
                                                                        )}
                                                                        {lastOp?.status && (
                                                                            <div style={{ color: '#6b7280' }}>Status: {lastOp.status}</div>
                                                                        )}
                                                                        {isError && lastOp?.responseSummary && (
                                                                            <div style={{ marginTop: 8, padding: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4 }}>
                                                                                <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>Error Response:</div>
                                                                                <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#7c2d12' }}>{lastOp.responseSummary}</div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Advanced Section Toggle */}
                                                <div>
                                                    <button
                                                        onClick={() => setDebugAdvancedOpen(!debugAdvancedOpen)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '8px 12px',
                                                            background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: 6,
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            color: '#374151',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}
                                                    >
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <i className="ms-Icon ms-Icon--DeveloperTools" style={{ fontSize: 12 }} />
                                                            Advanced Technical Data
                                                        </span>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: debugAdvancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                                            <polyline points="6,9 12,15 18,9"/>
                                                        </svg>
                                                    </button>

                                                    {debugAdvancedOpen && (
                                                        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                                                            {/* Manual JSON Testing */}
                                                            <div>
                                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Manual JSON Override (Dev Use)</div>
                                                                <textarea
                                                                    value={debugManualJson}
                                                                    onChange={(e) => setDebugManualJson(e.target.value)}
                                                                    placeholder="Paste JSON for manual testing..."
                                                                    style={{
                                                                        width: '100%',
                                                                        height: 100,
                                                                        padding: 8,
                                                                        border: '1px solid #e5e7eb',
                                                                        borderRadius: 4,
                                                                        fontSize: 10,
                                                                        fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                                                                        resize: 'vertical',
                                                                        background: '#f8fafc'
                                                                    }}
                                                                />
                                                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                                    <button
                                                                        onClick={validateManualJson}
                                                                        style={{
                                                                            background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                                                                            border: 'none',
                                                                            borderRadius: 3,
                                                                            padding: '4px 8px',
                                                                            fontSize: 10,
                                                                            fontWeight: 600,
                                                                            color: '#fff',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        Validate
                                                                    </button>
                                                                    <button
                                                                        onClick={processManualJson}
                                                                        disabled={!debugValidation?.isValid}
                                                                        style={{
                                                                            background: debugValidation?.isValid 
                                                                                ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                                                                                : '#9ca3af',
                                                                            border: 'none',
                                                                            borderRadius: 3,
                                                                            padding: '4px 8px',
                                                                            fontSize: 10,
                                                                            fontWeight: 600,
                                                                            color: '#fff',
                                                                            cursor: debugValidation?.isValid ? 'pointer' : 'not-allowed'
                                                                        }}
                                                                    >
                                                                        Process
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Current Form Data */}
                                                            <div>
                                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Current Form JSON</div>
                                                                <div style={{
                                                                    padding: 8,
                                                                    background: '#f8fafc',
                                                                    border: '1px solid #e5e7eb',
                                                                    borderRadius: 4,
                                                                    fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                                                                    fontSize: 9,
                                                                    maxHeight: 150,
                                                                    overflow: 'auto'
                                                                }}>
                                                                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                                        {JSON.stringify(generateSampleJson(), null, 2)}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}



                                    {/* Formal confirmation control moved near submission buttons */}
                                    
                                    {/* Two-column layout */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: 20,
                                        marginBottom: 8
                                    }}>
                                        {/* Client Information Card (locks subtly on confirmation) */}
                                        <div style={lockCardStyle({
                                            border: '1px solid #e1e5ea',
                                            borderRadius: 8,
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                            padding: 14,
                                            position: 'relative'
                                        })}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <i className="ms-Icon ms-Icon--People" style={{ fontSize: 12, color: '#6b7280' }} />
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Client Information</span>
                                                </div>
                                                {currentStep === 2 && (
                                                    <button
                                                        onClick={() => setCurrentStep(0)}
                                                        style={{
                                                            background: 'none',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: 4,
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            fontWeight: 500,
                                                            color: '#6b7280',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.borderColor = '#3690CE';
                                                            e.currentTarget.style.color = '#3690CE';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                                            e.currentTarget.style.color = '#6b7280';
                                                        }}
                                                    >
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                        Edit
                                                    </button>
                                                )}
                                            </div>
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
                                                const formatCompanyAddress = (p: POID) => {
                                                    const line1 = [p.company_house_building_number, p.company_street].filter(Boolean).join(' ').trim();
                                                    return [line1 || undefined, p.company_city, p.company_county, p.company_post_code, p.company_country].filter(Boolean).join(', ');
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
                                                const nationalitySummary = uniqueNationalities.length === 1 ? uniqueNationalities[0] : undefined;

                                                return (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}>Type</span>
                                                            <span style={{ fontWeight: 600, fontSize: 12 }}>{clientType || '-'}</span>
                                                        </div>
                                                        {nationalitySummary && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Nationality</span>
                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{nationalitySummary}</span>
                                                            </div>
                                                        )}

                                                        {/* Company flow: render company + directors */}
                                                        {isCompanyType && company && (
                                                            <>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>Company</span>
                                                                    <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{company.company_name || '-'}</span>
                                                                </div>
                                                                {(company as any).company_number && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Company No.</span>
                                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{(company as any).company_number}</span>
                                                                    </div>
                                                                )}
                                                                {(() => {
                                                                    const lines = getCompanyAddressLines(company);
                                                                    return lines.length > 0 ? (
                                                                        <>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Address</span>
                                                                                <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[0]}</span>
                                                                            </div>
                                                                            {lines[1] && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[1]}</span>
                                                                                </div>
                                                                            )}
                                                                            {lines[2] && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[2]}</span>
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}>Address</span>
                                                                            <span style={{ fontWeight: 600, fontSize: 12 }}>-</span>
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {company.address_verification_result && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Check Result</span>
                                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{company.address_verification_result}</span>
                                                                    </div>
                                                                )}
                                                                {directors.length > 0 && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Directors</span>
                                                                        <div style={{ textAlign: 'right', display: 'grid', gap: 8, maxWidth: '55%' }}>
                                                                            {directors.map((d, idx) => {
                                                                                const lines = getPersonAddressLines(d);
                                                                                return (
                                                                                    <div key={`dir-${d.poid_id}-${idx}`} style={{ display: 'grid', gap: 4 }}>
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}>Name</span>
                                                                                            <span style={{ fontWeight: 600, fontSize: 12 }}>{formatPersonName(d) || '-'}</span>
                                                                                        </div>
                                                                                        {lines.length > 0 && (
                                                                                            <>
                                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>Address</span>
                                                                                                    <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[0]}</span>
                                                                                                </div>
                                                                                                {lines[1] && (
                                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[1]}</span>
                                                                                                    </div>
                                                                                                )}
                                                                                                {lines[2] && (
                                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[2]}</span>
                                                                                                    </div>
                                                                                                )}
                                                                                            </>
                                                                                        )}
                                                                                        {d.email && (
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Email</span>
                                                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{d.email}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {getBestPhone(d) && (
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Phone</span>
                                                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{getBestPhone(d)}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {d.date_of_birth && (
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>DOB</span>
                                                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{formatDob(d.date_of_birth)}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {(d as any).nationality && (
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Nationality</span>
                                                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{(d as any).nationality}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {((d as any).passport_number || (d as any).drivers_license_number) && (
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>ID Docs</span>
                                                                                                <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>
                                                                                                    {(d as any).passport_number && <span>Passport: {(d as any).passport_number}</span>}
                                                                                                    {((d as any).passport_number && (d as any).drivers_license_number) && <br />}
                                                                                                    {(d as any).drivers_license_number && <span>DL: {(d as any).drivers_license_number}</span>}
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                        {d.address_verification_result && (
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Check</span>
                                                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{d.address_verification_result}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {idx < directors.length - 1 && (
                                                                                            <div style={{ height: 1, background: '#eee', marginTop: 6 }} />
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Individuals flow: render list */}
                                                        {!isCompanyType && individualItems.length > 0 && (
                                                            <div style={{ display: 'grid', gap: 8 }}>
                                                                {individualItems.map((i, idx) => {
                                                                    // Find backing POID to surface additional details
                                                                    const backing = clients.find(p => (formatPersonName(p) || (p.email || '')).toLowerCase() === i.name.toLowerCase());
                                                                    const lines = backing ? getPersonAddressLines(backing) : [];
                                                                    const check = backing && backing.address_verification_result ? backing.address_verification_result : undefined;
                                                                    const phone = backing ? getBestPhone(backing) : undefined;
                                                                    const dob = backing && backing.date_of_birth ? formatDob(backing.date_of_birth) : undefined;
                                                                    return (
                                                                        <div key={`ind-${idx}`} style={{ display: 'grid', gap: 4 }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Name</span>
                                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{i.name}</span>
                                                                            </div>
                                                                            {lines.length > 0 && (
                                                                                <>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Address</span>
                                                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[0]}</span>
                                                                                    </div>
                                                                                    {lines[1] && (
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                                            <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[1]}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {lines[2] && (
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                                            <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>{lines[2]}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                            {i.email && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>Email</span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12 }}>{i.email}</span>
                                                                                </div>
                                                                            )}
                                                                            {phone && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>Phone</span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12 }}>{phone}</span>
                                                                                </div>
                                                                            )}
                                                                            {dob && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>DOB</span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12 }}>{dob}</span>
                                                                                </div>
                                                                            )}
                                                                            {backing && (backing as any).nationality && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>Nationality</span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12 }}>{(backing as any).nationality}</span>
                                                                                </div>
                                                                            )}
                                                                            {backing && (((backing as any).passport_number) || ((backing as any).drivers_license_number)) && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>ID Docs</span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right', lineHeight: '1.3' }}>
                                                                                        {(backing as any).passport_number && <span>Passport: {(backing as any).passport_number}</span>}
                                                                                        {((backing as any).passport_number && (backing as any).drivers_license_number) && <br />}
                                                                                        {(backing as any).drivers_license_number && <span>DL: {(backing as any).drivers_license_number}</span>}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                            {check && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: '#6B6B6B', fontSize: 12 }}>Check</span>
                                                                                    <span style={{ fontWeight: 600, fontSize: 12 }}>{check}</span>
                                                                                </div>
                                                                            )}
                                                                            {idx < individualItems.length - 1 && (
                                                                                <div style={{ height: 1, background: '#eee', marginTop: 6 }} />
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Fallback when nothing selected */}
                                                        {(!company && individualItems.length === 0) && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Selected</span>
                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>-</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Combined Matter Overview Card (locks subtly, no badge) */}
                                        <div style={lockCardStyle({
                                            border: '1px solid #e1e5ea',
                                            borderRadius: 8,
                                            background: isDarkMode
                                                ? 'linear-gradient(135deg, #111827 0%, #1F2937 100%)'
                                                : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                            padding: 14
                                        })}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <i className="ms-Icon ms-Icon--OpenFolderHorizontal" style={{ fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#6b7280' }} />
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#374151' }}>Matter Overview</span>
                                                </div>
                                                {currentStep === 2 && (
                                                    <button
                                                        onClick={() => setCurrentStep(1)}
                                                        style={{
                                                            background: 'none',
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: 4,
                                                            padding: '4px 8px',
                                                            fontSize: 11,
                                                            fontWeight: 500,
                                                            color: '#6b7280',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.borderColor = '#3690CE';
                                                            e.currentTarget.style.color = '#3690CE';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                                            e.currentTarget.style.color = '#6b7280';
                                                        }}
                                                    >
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                            <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                        Edit
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                                {/* Left cluster: Core Matter */}
                                                <div style={{ display: 'grid', gap: 6 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Area of Work</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{areaOfWork || '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Practice Area</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{practiceArea || '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Dispute Value</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12 }}>{disputeValue || '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Description</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, maxWidth: 160, textAlign: 'right', lineHeight: '1.3' }}>
                                                            {description ? (description.length > 60 ? `${description.substring(0, 60)}…` : description) : '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* Middle cluster: Team */}
                                                <div style={{ display: 'grid', gap: 6 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Opening Date</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12 }}>{selectedDate ? selectedDate.toLocaleDateString('en-GB') : '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Solicitor</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{teamMember || '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Supervising Partner</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{supervisingPartner || '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Originating Solicitor</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{originatingSolicitor || '-'}</span>
                                                    </div>
                                                </div>
                                                {/* Right cluster: Additional */}
                                                <div style={{ display: 'grid', gap: 6 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Source</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>
                                                            {source}{source === 'referral' && referrerName ? ` - ${referrerName}` : ''}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Folder Structure</span>
                                                        <span style={{ fontWeight: 600, fontSize: 12, textAlign: 'right' }}>{folderStructure || '-'}</span>
                                                    </div>
                                                    {budgetRequired === 'Yes' && (
                                                        <>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Budget Amount</span>
                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{budgetAmount ? `£${budgetAmount}` : '-'}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Notify Threshold</span>
                                                                <span style={{ fontWeight: 600, fontSize: 12 }}>{budgetThreshold ? `${budgetThreshold}%` : '-'}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Opponent Details Card */}
                                        {(() => {
                                            const realOpponentKeys = getRealOpponentFieldKeys();
                                            const hasRealOpponentData = realOpponentKeys.length > 0;

                                            if (!hasRealOpponentData) {
                                                // Collapsed state - show placeholder confirmation
                                                return (
                                                    <div style={{
                                                        border: '1px solid #e5e7eb',
                                                        borderRadius: 8,
                                                        background: '#f9fafb',
                                                        padding: 12
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                            <i className="ms-Icon ms-Icon--Contact" style={{ fontSize: 12, color: '#9ca3af' }} />
                                                            <span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280' }}>Opponent Details</span>
                                                        </div>
                                                        <div style={{ 
                                                            fontSize: 11, 
                                                            color: '#9ca3af',
                                                            fontStyle: 'italic',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4
                                                        }}>
                                                            <i className="ms-Icon ms-Icon--InfoSolid" style={{ fontSize: 10 }} />
                                                            No opponent details provided
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // Expanded state - show actual data
                                            return (
                                                <div style={lockCardStyle({
                                                    border: '1px solid #e1e5ea',
                                                    borderRadius: 8,
                                                    background: isDarkMode
                                                        ? 'linear-gradient(135deg, #111827 0%, #1F2937 100%)'
                                                        : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                                    padding: 14
                                                })}>
                                                    {renderLockOverlay()}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                                        <i className="ms-Icon ms-Icon--Contact" style={{ fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#6b7280' }} />
                                                        <span style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#374151' }}>Opponent Details</span>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                                                        {realOpponentKeys.includes('opponentCompanyName') && opponentType === 'Company' && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Company Name</span>
                                                                <span style={getFieldStyle(opponentCompanyName, 'opponentCompanyName')}>{opponentCompanyName}</span>
                                                            </div>
                                                        )}
                                                        {(realOpponentKeys.includes('opponentTitle') || realOpponentKeys.includes('opponentFirst') || realOpponentKeys.includes('opponentLast')) && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Name</span>
                                                                <span style={getFieldStyle(
                                                                    `${opponentTitle ? opponentTitle + ' ' : ''}${opponentFirst || ''} ${opponentLast || ''}`.trim(),
                                                                    `${originalValues.opponentTitle ? originalValues.opponentTitle + ' ' : ''}${originalValues.opponentFirst || ''} ${originalValues.opponentLast || ''}`.trim()
                                                                )}>
                                                                    {`${opponentTitle ? opponentTitle + ' ' : ''}${opponentFirst || ''} ${opponentLast || ''}`.trim()}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {realOpponentKeys.includes('opponentEmail') && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Email</span>
                                                                <span style={getFieldStyle(opponentEmail, 'opponentEmail')}>{opponentEmail}</span>
                                                            </div>
                                                        )}
                                                        {realOpponentKeys.includes('opponentPhone') && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Phone</span>
                                                                <span style={getFieldStyle(opponentPhone, 'opponentPhone')}>{opponentPhone}</span>
                                                            </div>
                                                        )}
                                                        {/* Address display (only if at least one real, non-placeholder part) */}
                                                        {(() => {
                                                            const addrKeys: OppFieldKey[] = ['opponentHouseNumber','opponentStreet','opponentCity','opponentCounty','opponentPostcode','opponentCountry'];
                                                            const currentValues: Record<string,string> = {
                                                                opponentHouseNumber: opponentHouseNumber || '',
                                                                opponentStreet: opponentStreet || '',
                                                                opponentCity: opponentCity || '',
                                                                opponentCounty: opponentCounty || '',
                                                                opponentPostcode: opponentPostcode || '',
                                                                opponentCountry: opponentCountry || ''
                                                            };
                                                            const anyReal = addrKeys.some(k => {
                                                                const v = currentValues[k].trim();
                                                                if (!v) return false;
                                                                if (v === (opponentPlaceholderTemplate as any)[k]) return false;
                                                                if (isPlaceholderData(v)) return false;
                                                                return true;
                                                            });
                                                            if (!anyReal) return null;
                                                            const addressLine1 = [opponentHouseNumber, opponentStreet].filter(Boolean).join(' ');
                                                            const addressLine2 = [opponentCity, opponentCounty].filter(Boolean).join(', ');
                                                            const addressLine3 = [opponentPostcode, opponentCountry].filter(Boolean).join(' ');
                                                            const originalAddressLine1 = [originalValues.opponentHouseNumber, originalValues.opponentStreet].filter(Boolean).join(' ');
                                                            const originalAddressLine2 = [originalValues.opponentCity, originalValues.opponentCounty].filter(Boolean).join(', ');
                                                            const originalAddressLine3 = [originalValues.opponentPostcode, originalValues.opponentCountry].filter(Boolean).join(' ');
                                                            const addressStyle = (currentLine: string, originalLine: string) => {
                                                                const isModified = hasUserModified(currentLine, originalLine);
                                                                return {
                                                                    fontWeight: isModified ? 600 : 400,
                                                                    fontSize: 12,
                                                                    textAlign: 'right' as const,
                                                                    lineHeight: '1.3',
                                                                    color: isModified ? '#111827' : '#9ca3af',
                                                                    fontStyle: isModified ? 'normal' : 'italic'
                                                                };
                                                            };
                                                            return (
                                                                <>
                                                                    {addressLine1 && !isPlaceholderData(addressLine1) && addressLine1 !== opponentPlaceholderTemplate.opponentHouseNumber + ' ' + opponentPlaceholderTemplate.opponentStreet && (
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}>Address</span>
                                                                            <span style={addressStyle(addressLine1, originalAddressLine1)}>{addressLine1}</span>
                                                                        </div>
                                                                    )}
                                                                    {addressLine2 && !isPlaceholderData(addressLine2) && addressLine2 !== opponentPlaceholderTemplate.opponentCity + ', ' + opponentPlaceholderTemplate.opponentCounty && (
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                            <span style={addressStyle(addressLine2, originalAddressLine2)}>{addressLine2}</span>
                                                                        </div>
                                                                    )}
                                                                    {addressLine3 && !isPlaceholderData(addressLine3) && addressLine3 !== opponentPlaceholderTemplate.opponentPostcode + ' ' + opponentPlaceholderTemplate.opponentCountry && (
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                            <span style={addressStyle(addressLine3, originalAddressLine3)}>{addressLine3}</span>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Opponent Solicitor Details Card */}
                                        {(() => {
                                            // Collect solicitor field values
                                            const solicitorFields = {
                                                opponentSolicitorCompany, solicitorFirst, solicitorLast,
                                                opponentSolicitorEmail, solicitorPhone, solicitorHouseNumber,
                                                solicitorStreet, solicitorCity, solicitorCounty,
                                                solicitorPostcode, solicitorCountry
                                            } as const;

                                            // Determine which fields are REAL (non-empty & not placeholder-like)
                                            const realKeys = Object.entries(solicitorFields)
                                                .filter(([_, val]) => {
                                                    const v = (val || '').trim();
                                                    if (!v) return false; // empty
                                                    if (isPlaceholderData(v)) return false; // generic placeholder pattern
                                                    const low = v.toLowerCase();
                                                    // Explicit placeholder terms to ignore
                                                    if (
                                                        low === 'helix law ltd' ||
                                                        low === 'helix law' ||
                                                        low === 'invent solicitor name' ||
                                                        low === 'invent name' ||
                                                        low === 'brighton' ||
                                                        low === 'bn1 4de' ||
                                                        low === 'mr' || low === 'mrs' || low === 'ms' || low === 'dr' ||
                                                        low === 'second floor' ||
                                                        low.includes('station street') ||
                                                        low.includes('britannia house') ||
                                                        low === '0345 314 2044' || low.includes('0345 314 2044')
                                                    ) return false;
                                                    if (low.includes('opponentsolicitor@helix-law.com')) return false;
                                                    return true;
                                                })
                                                .map(([k]) => k);

                                            if (realKeys.length === 0) {
                                                // Show collapsed placeholder card
                                                return (
                                                    <div style={{
                                                        border: '1px solid #e5e7eb',
                                                        borderRadius: 8,
                                                        background: '#f9fafb',
                                                        padding: 12
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                            <i className="ms-Icon ms-Icon--ContactInfo" style={{ fontSize: 12, color: '#9ca3af' }} />
                                                            <span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280' }}>Opponent Solicitor</span>
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <i className="ms-Icon ms-Icon--InfoSolid" style={{ fontSize: 10 }} />
                                                            No solicitor details provided
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // Build address lines only if any address fields are real
                                            const addressLine1 = [solicitorHouseNumber, solicitorStreet].filter(Boolean).join(' ');
                                            const addressLine2 = [solicitorCity, solicitorCounty].filter(Boolean).join(', ');
                                            const addressLine3 = [solicitorPostcode, solicitorCountry].filter(Boolean).join(' ');
                                            const realAddressLines = [addressLine1, addressLine2, addressLine3].filter(l => l && !isPlaceholderData(l));

                                            return (
                                                <div style={{
                                                    border: '1px solid #e1e5ea',
                                                    borderRadius: 8,
                                                    background: isDarkMode
                                                        ? 'linear-gradient(135deg, #111827 0%, #1F2937 100%)'
                                                        : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                                    padding: 14
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                                        <i className="ms-Icon ms-Icon--ContactInfo" style={{ fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#6b7280' }} />
                                                        <span style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#374151' }}>Opponent Solicitor</span>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                                                        {realKeys.includes('opponentSolicitorCompany') && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Company Name</span>
                                                                <span style={getFieldStyle(opponentSolicitorCompany || '', 'opponentSolicitorCompany')}>{opponentSolicitorCompany}</span>
                                                            </div>
                                                        )}
                                                        {(realKeys.includes('solicitorFirst') || realKeys.includes('solicitorLast')) && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Name</span>
                                                                <span style={getFieldStyle(`${solicitorFirst || ''} ${solicitorLast || ''}`.trim(), `${originalValues.solicitorFirst || ''} ${originalValues.solicitorLast || ''}`.trim())}>{`${solicitorFirst || ''} ${solicitorLast || ''}`.trim()}</span>
                                                            </div>
                                                        )}
                                                        {realKeys.includes('opponentSolicitorEmail') && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Email</span>
                                                                <span style={getFieldStyle(opponentSolicitorEmail || '', 'opponentSolicitorEmail')}>{opponentSolicitorEmail}</span>
                                                            </div>
                                                        )}
                                                        {realKeys.includes('solicitorPhone') && (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: '#6B6B6B', fontSize: 12 }}>Phone</span>
                                                                <span style={getFieldStyle(solicitorPhone || '', 'solicitorPhone')}>{solicitorPhone}</span>
                                                            </div>
                                                        )}
                                                        {realAddressLines.length > 0 && (
                                                            <>
                                                                {addressLine1 && !isPlaceholderData(addressLine1) && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}>Address</span>
                                                                        <span style={getFieldStyle(addressLine1, `${originalValues.solicitorHouseNumber || ''} ${originalValues.solicitorStreet || ''}`.trim())}>{addressLine1}</span>
                                                                    </div>
                                                                )}
                                                                {addressLine2 && !isPlaceholderData(addressLine2) && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                        <span style={getFieldStyle(addressLine2, `${originalValues.solicitorCity || ''}, ${originalValues.solicitorCounty || ''}`.replace(/^,\s*/, ''))}>{addressLine2}</span>
                                                                    </div>
                                                                )}
                                                                {addressLine3 && !isPlaceholderData(addressLine3) && (
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span style={{ color: '#6B6B6B', fontSize: 12 }}></span>
                                                                        <span style={getFieldStyle(addressLine3, `${originalValues.solicitorPostcode || ''} ${originalValues.solicitorCountry || ''}`.trim())}>{addressLine3}</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Integrated confirmation and conflicts check */}
                                    {!summaryConfirmed && (
                                        <div style={{
                                            marginTop: 16,
                                            padding: '16px 18px',
                                            background: isDarkMode
                                                ? 'linear-gradient(135deg, #111827 0%, #1F2937 100%)'
                                                : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                            border: isDarkMode ? '1px solid #374151' : '1px solid #e2e8f0',
                                            borderRadius: 8,
                                            boxShadow: isDarkMode ? '0 2px 6px rgba(0,0,0,0.35)' : '0 2px 4px rgba(0,0,0,0.04)'
                                        }}>
                                            {/* Conflicts status row */}
                                            <div style={{ 
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                marginBottom: 12,
                                                paddingBottom: 12,
                                                borderBottom: isDarkMode ? '1px solid #374151' : '1px solid #e2e8f0'
                                            }}>
                                                <i className={`ms-Icon ms-Icon--${noConflict ? 'CheckMark' : 'Warning'}`} 
                                                   style={{ fontSize: 14, color: noConflict ? '#10b981' : '#f87171' }} />
                                                <span style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? (noConflict ? '#34d399' : '#fca5a5') : (noConflict ? '#047857' : '#b91c1c') }}>
                                                    {noConflict ? 'No conflicts detected' : 'Conflict check required'}
                                                </span>
                                                {editsAfterConfirmation && (
                                                    <span style={{
                                                        marginLeft: 'auto',
                                                        padding: '2px 8px',
                                                        background: isDarkMode ? 'rgba(251,191,36,0.15)' : '#fef3c7',
                                                        color: isDarkMode ? '#fde68a' : '#92400e',
                                                        borderRadius: 4,
                                                        fontSize: 11,
                                                        fontWeight: 500,
                                                        border: isDarkMode ? '1px solid rgba(253,230,138,0.35)' : '1px solid #fde68a'
                                                    }}>
                                                        Changes detected
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* Confirmation row */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, margin: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={confirmAcknowledge}
                                                        onChange={(e) => setConfirmAcknowledge(e.currentTarget.checked)}
                                                        style={{
                                                            width: 16,
                                                            height: 16,
                                                            cursor: 'pointer',
                                                            accentColor: '#D65541'
                                                        }}
                                                    />
                                                    <span style={{ fontSize: 13, color: isDarkMode ? '#E5E7EB' : '#374151', lineHeight: 1.3 }}>
                                                        {editsAfterConfirmation 
                                                            ? 'I have reviewed the changes and am ready to proceed' 
                                                            : 'I have reviewed all details and am ready to proceed'}
                                                        {instructionRef && (
                                                            <span style={{
                                                                marginLeft: 8,
                                                                padding: '2px 6px',
                                                                background: isDarkMode ? 'rgba(148,163,184,0.15)' : '#f1f5f9',
                                                                color: isDarkMode ? '#cbd5e1' : '#475569',
                                                                borderRadius: 4,
                                                                fontSize: 11,
                                                                fontWeight: 500
                                                            }}>
                                                                {instructionRef}
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                                {userDataLoading && (
                                                    <div style={{
                                                        marginBottom: 12,
                                                        padding: '8px 12px',
                                                        background: 'rgba(59, 130, 246, 0.1)',
                                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                                        borderRadius: 6,
                                                        fontSize: 12,
                                                        color: '#1e40af',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8
                                                    }}>
                                                        <span style={{ fontSize: 14 }}>🔄</span>
                                                        <span>Loading user profile data...</span>
                                                    </div>
                                                )}
                                                {(!effectiveUserData || !Array.isArray(effectiveUserData) || effectiveUserData.length === 0) && !userDataLoading && (
                                                    <div style={{
                                                        marginBottom: 12,
                                                        padding: '8px 12px',
                                                        background: 'rgba(245, 158, 11, 0.1)',
                                                        border: '1px solid rgba(245, 158, 11, 0.3)',
                                                        borderRadius: 6,
                                                        fontSize: 12,
                                                        color: '#92400e',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8
                                                    }}>
                                                        <span style={{ fontSize: 14 }}>⚠️</span>
                                                        <span>User profile data not loaded. Please refresh the page before opening the matter.</span>
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!confirmAcknowledge || processingStarted || !effectiveUserData || !Array.isArray(effectiveUserData) || effectiveUserData.length === 0 || userDataLoading) return;
                                                        setSummaryConfirmed(true);
                                                        setEditsAfterConfirmation(false);
                                                        // Kick off processing immediately so status header & steps align
                                                        if (!isProcessing) {
                                                            setProcessingStarted(true);
                                                            simulateProcessing().then(r => r && setGeneratedCclUrl(r.url));
                                                        }
                                                        // Smooth scroll to processing section after a brief delay
                                                        setTimeout(() => {
                                                            const processingSection = document.querySelector('[data-processing-section]');
                                                            if (processingSection) {
                                                                processingSection.scrollIntoView({ 
                                                                    behavior: 'smooth', 
                                                                    block: 'start' 
                                                                });
                                                            }
                                                        }, 200);
                                                    }}
                                                    disabled={!confirmAcknowledge || !userData || !Array.isArray(userData) || userData.length === 0}
                                                    style={{
                                                        background: (confirmAcknowledge && userData && Array.isArray(userData) && userData.length > 0)
                                                            ? 'linear-gradient(135deg, #D65541 0%, #B83C2B 100%)' 
                                                            : '#f3f4f6',
                                                        color: (confirmAcknowledge && userData && Array.isArray(userData) && userData.length > 0) ? '#fff' : '#9ca3af',
                                                        border: (confirmAcknowledge && userData && Array.isArray(userData) && userData.length > 0)
                                                            ? '1px solid #B83C2B' 
                                                            : '1px solid #d1d5db',
                                                        borderRadius: 6,
                                                        padding: '10px 18px',
                                                        fontSize: 13,
                                                        fontWeight: 600,
                                                        cursor: (confirmAcknowledge && userData && Array.isArray(userData) && userData.length > 0) ? 'pointer' : 'not-allowed',
                                                        transition: 'all 0.15s ease',
                                                        minWidth: 110,
                                                        boxShadow: (confirmAcknowledge && userData && Array.isArray(userData) && userData.length > 0)
                                                            ? '0 2px 4px rgba(214,85,65,0.2)' 
                                                            : 'none'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (confirmAcknowledge) {
                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (confirmAcknowledge) {
                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                        }
                                                    }}
                                                >
                                                    Open Matter
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Processing Panel - now shown directly without Developer Tools wrapper */}
                                    {currentStep === 2 && summaryConfirmed && (
                                            <div style={{ marginTop: 16 }}>
                                                {(() => {
                                                    const total = processingSteps.length || 0;
                                                    const done = processingSteps.filter(s => s.status === 'success').length;
                                                    const failed = processingSteps.filter(s => s.status === 'error').length;
                                                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                                    const statusText = failed > 0 ? 'Attention required' : (done === total && total > 0 ? 'Completed' : 'In progress');
                                                    
                                                    return (
                                                        <div style={{
                                                            border: '1px solid #e5e7eb',
                                                            borderRadius: 12,
                                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                                            overflow: 'hidden',
                                                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.1)',
                                                            position: 'relative'
                                                        }}>
                                                            <div style={{
                                                                padding: '16px 20px',
                                                                background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                                                borderBottom: '1px solid #e5e7eb',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center'
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                    <div style={{
                                                                        width: 20,
                                                                        height: 20,
                                                                        borderRadius: '50%',
                                                                        background: '#20b26c',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center'
                                                                    }}>
                                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                                                            <polyline 
                                                                                points="20,6 9,17 4,12" 
                                                                                stroke="#fff" 
                                                                                strokeWidth="2" 
                                                                                strokeLinecap="round" 
                                                                                strokeLinejoin="round"
                                                                            />
                                                                        </svg>
                                                                    </div>
                                                                    <div>
                                                                        <div style={{
                                                                            fontSize: 14,
                                                                            fontWeight: 600,
                                                                            color: '#20b26c',
                                                                            lineHeight: 1.2
                                                                        }}>
                                                                            Details Reviewed and Confirmed
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                
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
                                                                    title="Open debug inspector with JSON and backend details"
                                                                    style={{
                                                                        background: debugInspectorOpen ? 'linear-gradient(135deg, #D65541 0%, #B83C2B 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                                                        border: '1px solid #D65541',
                                                                        borderRadius: 6,
                                                                        padding: '6px 14px',
                                                                        fontSize: 12,
                                                                        fontWeight: 600,
                                                                        color: debugInspectorOpen ? '#fff' : '#D65541',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 6,
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        if (!debugInspectorOpen) {
                                                                            e.currentTarget.style.background = 'linear-gradient(135deg, #D65541 0%, #B83C2B 100%)';
                                                                            e.currentTarget.style.color = '#fff';
                                                                        }
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        if (!debugInspectorOpen) {
                                                                            e.currentTarget.style.background = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
                                                                            e.currentTarget.style.color = '#D65541';
                                                                        }
                                                                    }}
                                                                >
                                                                    <i className="ms-Icon ms-Icon--BugSolid" style={{ fontSize: 11 }} />
                                                                    Debug
                                                                </button>
                                                            </div>
                                                            
                                                            <div style={{ padding: '20px' }}>
                                                                {/* Live Status Header */}
                                                                <div style={{ 
                                                                    display: 'flex', 
                                                                    alignItems: 'center', 
                                                                    justifyContent: 'space-between', 
                                                                    marginBottom: 20,
                                                                    padding: '12px 16px',
                                                                    background: 'linear-gradient(135deg, #F0F7FF 0%, #E6F3FF 100%)',
                                                                    border: '1px solid #3690CE',
                                                                    borderRadius: 8
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                        <div style={{
                                                                            width: 8,
                                                                            height: 8,
                                                                            borderRadius: '50%',
                                                                            background: failed > 0 ? '#ef4444' : (done === total && total > 0 ? '#20b26c' : '#3690CE'),
                                                                            boxShadow: `0 0 8px ${failed > 0 ? '#ef4444' : (done === total && total > 0 ? '#20b26c' : '#3690CE')}`,
                                                                            animation: done !== total && total > 0 ? 'pulse 2s infinite' : 'none'
                                                                        }} />
                                                                        <span style={{ 
                                                                            fontSize: 14, 
                                                                            fontWeight: 600, 
                                                                            color: '#374151'
                                                                        }}>
                                                                            {failed > 0 ? 'Issue detected - review required' : 
                                                                             done === total && total > 0 ? 'Matter opened successfully' : 
                                                                             'Opening matter in progress...'}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ 
                                                                        fontSize: 12, 
                                                                        fontWeight: 500, 
                                                                        color: '#6b7280',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 6
                                                                    }}>
                                                                        <i className="ms-Icon ms-Icon--Clock" style={{ fontSize: 10 }} />
                                                                        Live processing
                                                                    </div>
                                                                </div>

                                                                {/* Current Action Display */}
                                                                {total > 0 && done < total && (
                                                                    <div style={{
                                                                        marginBottom: 16,
                                                                        padding: '10px 14px',
                                                                        background: '#f8fafc',
                                                                        border: '1px solid #e2e8f0',
                                                                        borderRadius: 6,
                                                                        fontSize: 13,
                                                                        color: '#475569',
                                                                        fontStyle: 'italic',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8
                                                                    }}>
                                                                        <div style={{
                                                                            width: 4,
                                                                            height: 4,
                                                                            borderRadius: '50%',
                                                                            background: '#3690CE',
                                                                            animation: 'pulse 1.5s infinite'
                                                                        }} />
                                                                        {(() => {
                                                                            const currentStep = processingSteps.find(s => s.status === 'pending');
                                                                            return currentStep ? `Currently: ${currentStep.label}` : 'Preparing next step...';
                                                                        })()}
                                                                    </div>
                                                                )}

                                                                <style>{`
                                                                    @keyframes pulse {
                                                                        0%, 100% { opacity: 1; }
                                                                        50% { opacity: 0.5; }
                                                                    }
                                                                `}</style>
                                                                
                                                                {total > 0 && (
                                                                    <div>
                                                                        <div style={{ 
                                                                            display: 'grid', 
                                                                            gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', 
                                                                            gap: 12 
                                                                        }}>
                                                                            {(() => {
                                                                                // Group consecutive steps by app (using icon as app identifier)
                                                                                const groupedSteps: Array<{
                                                                                    icon?: string;
                                                                                    label: string;
                                                                                    status: 'pending' | 'success' | 'error';
                                                                                    count: number;
                                                                                    steps: typeof processingSteps;
                                                                                }> = [];
                                                                                
                                                                                processingSteps.forEach((step, idx) => {
                                                                                    const lastGroup = groupedSteps[groupedSteps.length - 1];
                                                                                    
                                                                                    // Group if same icon/app and consecutive
                                                                                    if (lastGroup && lastGroup.icon === step.icon && step.icon) {
                                                                                        lastGroup.count += 1;
                                                                                        lastGroup.steps.push(step);
                                                                                        lastGroup.label = step.icon ? 
                                                                                            `${lastGroup.steps[0].label.split(' ')[0]} (${lastGroup.count} steps)` : 
                                                                                            step.label;
                                                                                    } else {
                                                                                        // New group
                                                                                        groupedSteps.push({
                                                                                            icon: step.icon,
                                                                                            label: step.label,
                                                                                            status: 'pending',
                                                                                            count: 1,
                                                                                            steps: [step]
                                                                                        });
                                                                                    }
                                                                                });

                                                                                // Update group statuses based on all steps in each group
                                                                                groupedSteps.forEach(group => {
                                                                                    const hasError = group.steps.some(s => s.status === 'error');
                                                                                    const hasPending = group.steps.some(s => s.status === 'pending');
                                                                                    
                                                                                    if (hasError) {
                                                                                        group.status = 'error';
                                                                                    } else if (hasPending) {
                                                                                        group.status = 'pending';
                                                                                    } else {
                                                                                        // All steps are success
                                                                                        group.status = 'success';
                                                                                    }
                                                                                });
                                                                                
                                                                                return groupedSteps.map((group, idx) => (
                                                                                    <div key={`grouped-proc-${idx}`} 
                                                                                         title={group.count > 1 ? `${group.label} - Click for details` : group.label} 
                                                                                         style={{
                                                                                        height: 48,
                                                                                        display: 'flex',
                                                                                        flexDirection: 'column',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        borderRadius: 8,
                                                                                        background: 'linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)',
                                                                                        border: `1px solid ${group.status === 'error' ? '#EF4444' : '#D1D5DB'}`,
                                                                                        position: 'relative',
                                                                                        cursor: 'pointer',
                                                                                        transition: 'all 0.2s ease',
                                                                                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                                                                                    }}>
                                                                                        <div style={{
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'center',
                                                                                            width: 24,
                                                                                            height: 24,
                                                                                            marginBottom: 2
                                                                                        }}>
                                                                                            {group.icon ? (
                                                                                                <img src={group.icon} alt="" style={{ 
                                                                                                    width: 20, 
                                                                                                    height: 20, 
                                                                                                    opacity: group.status === 'pending' ? 0.7 : 1,
                                                                                                    filter: group.status === 'success' 
                                                                                                        ? 'brightness(0) saturate(100%) invert(47%) sepia(58%) saturate(1945%) hue-rotate(119deg) brightness(97%) contrast(91%)' 
                                                                                                        : 'none'
                                                                                                }} />
                                                                                            ) : (
                                                                                                <i className={`ms-Icon ${group.status === 'success' ? 'ms-Icon--CheckMark' : group.status === 'error' ? 'ms-Icon--ErrorBadge' : 'ms-Icon--Clock'}`} 
                                                                                                   style={{ 
                                                                                                    fontSize: 16, 
                                                                                                    color: group.status === 'success' ? '#20b26c' : group.status === 'error' ? '#DC2626' : '#6B7280'
                                                                                                }} />
                                                                                            )}
                                                                                        </div>
                                                                                        
                                                                                        {group.count > 1 && (
                                                                                            <div style={{
                                                                                                position: 'absolute',
                                                                                                top: -6,
                                                                                                right: -6,
                                                                                                background: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
                                                                                                color: '#fff',
                                                                                                borderRadius: '50%',
                                                                                                width: 18,
                                                                                                height: 18,
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                                fontSize: 9,
                                                                                                fontWeight: 700,
                                                                                                border: '2px solid #fff',
                                                                                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                                                                                            }}>
                                                                                                {group.count}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                ));
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
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