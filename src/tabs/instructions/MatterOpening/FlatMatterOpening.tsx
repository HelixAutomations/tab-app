//
import React, { useState, useEffect, useMemo, useRef } from 'react'; // invisible change
// invisible change 2.2
import { Stack, PrimaryButton, Dialog, DialogType, DialogFooter, DefaultButton } from '@fluentui/react';
import MinimalSearchBox from './MinimalSearchBox';
import { POID, TeamData, UserData, InstructionData } from '../../../app/functionality/types';
import ClientDetails from '../ClientDetails';
import ClientHub from '../ClientHub';
import StepWrapper from './StepWrapper';
import '../../../app/styles/NewMatters.css';
import '../../../app/styles/MatterOpeningCard.css';
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
import { processingActions, initialSteps, registerClientIdCallback, registerMatterIdCallback } from './processingActions';
import idVerifications from '../../../localData/localIdVerifications.json';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../../../app/styles/ButtonStyles';
import { clearMatterOpeningDraft, completeMatterOpening } from '../../../app/functionality/matterOpeningUtils';

// Local implementation of useDraftedState for draft persistence
function useDraftedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const storageKey = `matterOpeningDraft_${key}`;
    const [state, setState] = useState<T>(() => {
        try {
            const item = localStorage.getItem(storageKey);
            if (!item) return initialValue;
            const parsed = JSON.parse(item);
            // Special handling for selectedDate: convert string to Date
            if (key === 'selectedDate') {
                if (parsed === null) return null as any;
                if (typeof parsed === 'string' || typeof parsed === 'number') {
                    const d = new Date(parsed);
                    return isNaN(d.getTime()) ? initialValue : (d as any);
                }
            }
            return parsed;
        } catch {
            return initialValue;
        }
    });
    useEffect(() => {
        try {
            // For selectedDate, store as ISO string
            if (key === 'selectedDate' && state instanceof Date) {
                localStorage.setItem(storageKey, JSON.stringify(state.toISOString()));
            } else {
                localStorage.setItem(storageKey, JSON.stringify(state));
            }
        } catch {}
    }, [state, storageKey]);
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
     * Optional callback triggered when the user chooses to draft the CCL
     * immediately after opening the matter.
     */
    onDraftCclNow?: (matterId: string) => void;
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
    onDraftCclNow,
}) => {
    const idExpiry = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toLocaleDateString('en-GB');
    }, []); // invisible change

    const [clientId, setClientId] = useState<string | null>(initialClientId || null);
    const [matterIdState, setMatterIdState] = useState<string | null>(matterRef || null);
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
        const mapped = (poidData && poidData.length > 0
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
            }))) as POID[];
        const uniqueMap = new Map<string, POID>();
        mapped.forEach((p) => {
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
                // Prefer POID belonging to the active instruction
                uniqueMap.set(key, p);
            }
        });
        return Array.from(uniqueMap.values());
    }, [poidData, instructionRef]);
    
    // Filter out any invalid POID entries that might be causing issues
    const validPoidData = useMemo(() => {
        return defaultPoidData.filter(poid => 
            // Ensure each POID has at least first and last name populated
            poid && poid.first && poid.last && 
            // Make sure it's not just a number
            isNaN(Number(poid.first)) && isNaN(Number(poid.last))
        );
    }, [defaultPoidData]);
    
    // Force use of only validated local POID data
    const effectivePoidData: POID[] = validPoidData;
        
    // Debug logging removed

    const [selectedDate, setSelectedDate] = useDraftedState<Date | null>('selectedDate', null);
    const localTeamData = useMemo(() => localTeamDataJson, []);
    const defaultPartnerOptions = defaultPartners;
    const partnerOptionsList = useMemo(() => {
        const activeTeam = teamData || localTeamData;
        if (activeTeam) {
            const names = activeTeam
                .filter((t) => (t.Role || '').toLowerCase().includes('partner'))
                .map((t) => t['Full Name'] || `${t.First || ''} ${t.Last || ''}`.trim())
                .filter(Boolean);
            return names.length ? names : defaultPartnerOptions;
        }
        return defaultPartnerOptions;
    }, [teamData, localTeamData]);
    
    const teamMemberOptions = useMemo(() => {
        const activeTeam = teamData || localTeamData;
        if (activeTeam) {
            return activeTeam
                .map((t) => t['Full Name'] || `${t.First || ''} ${t.Last || ''}`.trim())
                .filter(Boolean);
        }
        return [] as string[];
    }, [teamData, localTeamData]);
    
    const defaultTeamMember = useMemo(() => {
        const activeTeam = teamData || localTeamData;
        if (activeTeam && activeTeam.length > 0) {
            const found = activeTeam.find(
                (t) => (t.Initials || '').toLowerCase() === userInitials.toLowerCase(),
            );
            if (found) {
                return found['Full Name'] || `${found.First || ''} ${found.Last || ''}`.trim();
            }
            const first = activeTeam[0];
            return first['Full Name'] || `${first.First || ''} ${first.Last || ''}`.trim();
        }
        return '';
    }, [teamData, localTeamData, userInitials]);

    const [teamMember, setTeamMember] = useDraftedState<string>('teamMember', defaultTeamMember);
    useEffect(() => setTeamMember(defaultTeamMember), [defaultTeamMember]);
    const [supervisingPartner, setSupervisingPartner] = useDraftedState<string>('supervisingPartner', '');
    const [originatingSolicitor, setOriginatingSolicitor] = useDraftedState<string>('originatingSolicitor', defaultTeamMember);
    useEffect(() => setOriginatingSolicitor(defaultTeamMember), [defaultTeamMember]);
    // Removed fundsReceived state
    const [isDateCalloutOpen, setIsDateCalloutOpen] = useState(false); // UI only, not persisted
    const dateButtonRef = useRef<HTMLDivElement | null>(null);

    // Client type selection is now a page-level qualifying question
    const clientTypes = [
        'Individual',
        'Company',
        'Multiple Individuals',
        'Existing Client',
    ];
    // Use initialClientType if provided (from instruction data)
    const [clientType, setClientType] = useDraftedState<string>('clientType', initialClientType || '');
    const [pendingClientType, setPendingClientType] = useDraftedState<string>('pendingClientType', initialClientType || '');
    const [clientAsOnFile, setClientAsOnFile] = useDraftedState<string>('clientAsOnFile', '');
    // Only set on mount or when initialClientType changes, and only if not already set
    React.useEffect(() => {
        if (initialClientType && initialClientType.trim() !== '') {
            setClientType(initialClientType);
            setPendingClientType(initialClientType);
        }
    }, [initialClientType]);

    // If preselectedPoidIds is provided and not empty, use it as the initial value for selectedPoidIds
    const [selectedPoidIds, setSelectedPoidIds] = useDraftedState<string[]>('selectedPoidIds', preselectedPoidIds.length > 0 ? preselectedPoidIds : []);
    const [areaOfWork, setAreaOfWork] = useDraftedState<string>('areaOfWork', '');
    const [practiceArea, setPracticeArea] = useDraftedState<string>('practiceArea', '');
    const [description, setDescription] = useDraftedState<string>('description', '');
    const [folderStructure, setFolderStructure] = useDraftedState<string>('folderStructure', '');
    const [disputeValue, setDisputeValue] = useDraftedState<string>('disputeValue', '');
    // Source field starts empty - user must actively select an option
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
    const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false); // UI only, not persisted
    // If preselectedPoidIds is provided, set the initial activePoid to the first matching POID
    useEffect(() => {
        if (preselectedPoidIds && preselectedPoidIds.length > 0 && effectivePoidData.length > 0) {
            // Only set if not already set
            setSelectedPoidIds((prev) => (prev.length === 0 ? preselectedPoidIds : prev));
            const found = effectivePoidData.find((p) => p.poid_id === preselectedPoidIds[0]);
            setActivePoid((prev) => (prev == null ? found || null : prev));
        }
        // Only run on mount or when preselectedPoidIds changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preselectedPoidIds, effectivePoidData]);

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

    // Processing state for matter submission
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingOpen, setProcessingOpen] = useState(false);
    const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>(initialSteps);
    const [processingLogs, setProcessingLogs] = useState<string[]>([]);
    const [generatedCclUrl, setGeneratedCclUrl] = useState<string>('');
    const [openedMatterId, setOpenedMatterId] = useState<string | null>(null);

    const [visiblePoidCount, setVisiblePoidCount] = useState(12); // UI only, not persisted
    const [poidSearchTerm, setPoidSearchTerm] = useState(''); // UI only, not persisted
    const [searchBoxFocused, setSearchBoxFocused] = useState(false);
    const poidGridRef = useRef<HTMLDivElement | null>(null);
    const [activePoid, setActivePoid] = useDraftedState<POID | null>('activePoid', null);

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
                    setSelectedPoidIds([...newSelections, poid.poid_id]);
                } else {
                    // Selecting an individual (director) - only allowed if company is already selected
                    if (hasCompanySelected) {
                        // Allow multiple directors - just add to existing selections
                        setSelectedPoidIds((prev: string[]) => [...prev, poid.poid_id]);
                    }
                }
                setActivePoid(poid);
            } else if (pendingClientType === 'Multiple Individuals') {
                // Multiple individuals allowed - unlimited selections
                setSelectedPoidIds((prev: string[]) => [...prev, poid.poid_id]);
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

    // Horizontal sliding carousel approach
    const [currentStep, setCurrentStep] = useDraftedState<number>('currentStep', 0); // 0: select, 1: form, 2: review
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
        if (originatingSolicitor && originatingSolicitor.trim() !== '' && originatingSolicitor !== defaultTeamMember) filledFields++;
        if (areaOfWork && areaOfWork.trim() !== '') filledFields++;
        if (practiceArea && practiceArea.trim() !== '') filledFields++;
        if (description && description.trim() !== '') filledFields++;
        if (folderStructure && folderStructure.trim() !== '') filledFields++;
        if (source && source.trim() !== '') filledFields++; // Source must be actively selected
        if (noConflict === true) filledFields++; // Only count if explicitly checked
        if (referrerName && referrerName.trim() !== '') filledFields++; // Optional field
        
        const completion = totalFields > 0 ? (filledFields / totalFields) * 100 : 0;
        
        // Debug logging - remove this after fixing
        if (filledFields > 0) {
            console.log('Matter step filled fields:', filledFields, 'out of', totalFields, 'completion:', completion + '%');
            console.log('Debug values:', {
                selectedDate: selectedDate !== null,
                supervisingPartner: supervisingPartner && supervisingPartner.trim() !== '',
                originatingSolicitor: originatingSolicitor && originatingSolicitor.trim() !== '' && originatingSolicitor !== defaultTeamMember,
                source: source && source.trim() !== '',
                noConflict: noConflict === true,
                defaultTeamMember,
                originatingSolicitorValue: originatingSolicitor,
                sourceValue: source
            });
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
    const clientsStepComplete = selectedPoidIds.length > 0 && clientType;
    const matterStepComplete = selectedDate && supervisingPartner && originatingSolicitor && areaOfWork && practiceArea && description;
    const reviewStepComplete = false; // Review step doesn't have a "next" - it's the final step

    const handleContinueToForm = () => {
        if (selectedPoidIds.length > 0 && clientType) {
            setClientType(clientType);
            setCurrentStep(1);
            // Scroll to top when changing steps
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleGoToReview = () => {
        setCurrentStep(2);
        // Scroll to top when changing steps
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBackToClients = () => {
        setCurrentStep(0);
        // Scroll to top when changing steps
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBackToForm = () => {
        setCurrentStep(1);
        setSummaryConfirmed(false); // Reset confirmation when going back to edit
        // Scroll to top when changing steps
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // Process matter opening steps defined in processingActions
    const simulateProcessing = async () => {
        setIsProcessing(true);
        setProcessingOpen(true);
        setProcessingLogs([]);
        setProcessingSteps(initialSteps);
        let url = '';

        try {
            for (let i = 0; i < processingActions.length; i++) {
                const action = processingActions[i];
                const result = await action.run(generateSampleJson(), userInitials, userData);
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
            setProcessingLogs(prev => [...prev, `❌ Error: ${msg}`]);
            setProcessingSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'error' } : s));
        } finally {
            setTimeout(() => setIsProcessing(false), 2000);
            setProcessingOpen(false);
        }
        setGeneratedCclUrl(url);
        return { url };
    };

    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

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
        setPendingClientType(''); // This will reset the client dots
        setSelectedPoidIds([]); // This will reset the client dots
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
        setActivePoid(null);
        setCurrentStep(0); // This will reset the review dots
        setPoidSearchTerm('');
        
        // Clear all localStorage draft data
        clearMatterOpeningDraft();
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

    // Render the horizontal sliding carousel
    return (
        <CompletionProvider>
            <Stack className="workflow-container">
                {/* Main Container */}
                <div className="workflow-main matter-opening-card">
                    {/* Persistent Header */}
                    <div className="persistent-header" style={{
                        padding: '16px 24px',
                        borderBottom: '1px solid #e1e5e9',
                        background: '#fff',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        margin: '-20px -20px 0 -20px',
                        flexWrap: 'wrap',
                        minHeight: '60px'
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            flex: '1 1 auto',
                            minWidth: 0, // Allow shrinking
                            overflow: 'hidden' 
                        }}>
                            {/* Navigation breadcrumbs */}
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 6, 
                                fontSize: 14,
                                flexWrap: 'wrap',
                                rowGap: 4
                            }}>
                                <button 
                                    onClick={handleBackToClients}
                                    style={{ 
                                        background: 'none', 
                                        border: 'none', 
                                        color: currentStep === 0 ? '#3690CE' : '#666',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        transition: 'all 0.2s ease',
                                        fontWeight: currentStep === 0 ? 600 : 400,
                                        backgroundColor: currentStep === 0 ? '#e3f0fc' : 'transparent',
                                        fontSize: '13px',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                    }}
                                >
                                    {clientsStepComplete && currentStep !== 0 ? (
                                        <div className="completion-tick visible" style={{ 
                                            marginRight: 4,
                                            width: 16,
                                            height: 16,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '50%',
                                            background: '#fff',
                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                                            color: '#20b26c',
                                            border: '2px solid #f8f8f8'
                                        }}>
                                            <svg width="10" height="8" viewBox="0 0 24 24" fill="none">
                                                <polyline points="5,13 10,18 19,7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    ) : (
                                        <i className="ms-Icon ms-Icon--People" style={{ fontSize: 16 }} />
                                    )}
                                    Select Parties
                                </button>
                                
                                {/* Progressive dots connector */}
                                <div style={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    margin: '0 2px',
                                    flexShrink: 0
                                }}>
                                    <div style={{ 
                                        width: '4px', 
                                        height: '4px', 
                                        borderRadius: '50%', 
                                        background: getDotColor(getProgressiveDotStates()[0]),
                                        transition: 'background-color 0.3s ease'
                                    }} />
                                    <div style={{ 
                                        width: '6px', 
                                        height: '1px', 
                                        background: '#ddd'
                                    }} />
                                    <div style={{ 
                                        width: '4px', 
                                        height: '4px', 
                                        borderRadius: '50%', 
                                        background: getDotColor(getProgressiveDotStates()[1]),
                                        transition: 'background-color 0.3s ease'
                                    }} />
                                    <div style={{ 
                                        width: '6px', 
                                        height: '1px', 
                                        background: '#ddd'
                                    }} />
                                    <div style={{ 
                                        width: '4px', 
                                        height: '4px', 
                                        borderRadius: '50%', 
                                        background: getDotColor(getProgressiveDotStates()[2]),
                                        transition: 'background-color 0.3s ease'
                                    }} />
                                </div>
                                
                                <button 
                                    onClick={handleBackToForm}
                                    disabled={currentStep === 0}
                                    style={{ 
                                        background: 'none', 
                                        border: 'none', 
                                        color: currentStep === 1 ? '#3690CE' : currentStep === 0 ? '#ccc' : '#666',
                                        cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        transition: 'all 0.2s ease',
                                        fontWeight: currentStep === 1 ? 600 : 400,
                                        backgroundColor: currentStep === 1 ? '#e3f0fc' : 'transparent',
                                        fontSize: '13px',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                    }}
                                >
                                    {currentStep === 2 ? (
                                        <div className="completion-tick visible" style={{ 
                                            marginRight: 4,
                                            width: 16,
                                            height: 16,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '50%',
                                            background: '#fff',
                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                                            color: '#20b26c',
                                            border: '2px solid #f8f8f8'
                                        }}>
                                            <svg width="10" height="8" viewBox="0 0 24 24" fill="none">
                                                <polyline points="5,13 10,18 19,7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    ) : (
                                        <i className="ms-Icon ms-Icon--OpenFolderHorizontal" style={{ fontSize: 16 }} />
                                    )}
                                    Build Matter
                                </button>
                                
                                {/* Progressive dots with visible separators */}
                                <div style={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    margin: '0 2px',
                                    flexShrink: 0
                                }}>
                                    <div style={{ 
                                        width: '4px', 
                                        height: '4px', 
                                        borderRadius: '50%', 
                                        background: getDotColor(getBuildMatterDotStates()[0]),
                                        transition: 'background-color 0.3s ease'
                                    }} />
                                    <div style={{ 
                                        width: '6px', 
                                        height: '1px', 
                                        background: '#ddd'
                                    }} />
                                    <div style={{ 
                                        width: '4px', 
                                        height: '4px', 
                                        borderRadius: '50%', 
                                        background: getDotColor(getBuildMatterDotStates()[1]),
                                        transition: 'background-color 0.3s ease'
                                    }} />
                                    <div style={{ 
                                        width: '6px', 
                                        height: '1px', 
                                        background: '#ddd'
                                    }} />
                                    <div style={{ 
                                        width: '4px', 
                                        height: '4px', 
                                        borderRadius: '50%', 
                                        background: getDotColor(getBuildMatterDotStates()[2]),
                                        transition: 'background-color 0.3s ease'
                                    }} />
                                </div>
                                
                                <div style={{ 
                                    color: currentStep === 2 ? '#3690CE' : '#666',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontWeight: currentStep === 2 ? 600 : 400,
                                    backgroundColor: currentStep === 2 ? '#e3f0fc' : 'transparent',
                                    transition: 'all 0.2s ease',
                                    fontSize: '13px',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0
                                }}>
                                    {summaryConfirmed ? (
                                        <div className="completion-tick visible" style={{ 
                                            marginRight: 4,
                                            width: 16,
                                            height: 16,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '50%',
                                            background: '#fff',
                                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                                            color: '#20b26c',
                                            border: '2px solid #f8f8f8'
                                        }}>
                                            <svg width="10" height="8" viewBox="0 0 24 24" fill="none">
                                                <polyline points="5,13 10,18 19,7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display: 'inline', verticalAlign: 'middle' }}>
                                            <path d="M1 12C2.73 7.61 7.11 4.5 12 4.5c4.89 0 9.27 3.11 11 7.5-1.73 4.39-6.11 7.5-11 7.5-4.89 0-9.27-3.11-11-7.5z" stroke="currentColor" strokeWidth="2" fill="none"/>
                                            <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" fill="none"/>
                                        </svg>
                                    )}
                                    Review and Confirm
                                </div>
                            </div>
                        </div>

                        {/* Right side controls */}
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8,
                            flexShrink: 0
                        }}>
                            {/* POID search - only in step 0 with POID selection AND client type selected */}
                            {currentStep === 0 && showPoidSelection && pendingClientType && (
                                <>
                                    {/* MinimalSearchBox - hide when Individual/Company has selection */}
                                    {!(
                                        (pendingClientType === 'Individual' || pendingClientType === 'Company') && 
                                        selectedPoidIds.length > 0
                                    ) && (
                                        <div style={{ 
                                            position: 'relative',
                                            animation: 'cascadeSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                                            animationDelay: '0ms',
                                            opacity: 0,
                                            transform: 'translateX(20px)'
                                        }}>
                                            <MinimalSearchBox
                                                value={poidSearchTerm}
                                                onChange={setPoidSearchTerm}
                                                focused={searchBoxFocused}
                                                onRequestOpen={() => setSearchBoxFocused(true)}
                                                onRequestClose={() => setSearchBoxFocused(false)}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            
                            {/* Global Clear button - always available when there's something to clear */}
                            {hasDataToClear() && (
                              <>
                                <button 
                                    type="button" 
                                    onClick={handleClearAll} 
                                    style={{
                                        background: '#fff',
                                        border: '1px solid #e1e5e9',
                                        borderRadius: 0,
                                        padding: '8px 16px',
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: '#D65541',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        fontFamily: 'Raleway, sans-serif'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#ffefed';
                                        e.currentTarget.style.borderColor = '#D65541';
                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = '#fff';
                                        e.currentTarget.style.borderColor = '#e1e5e9';
                                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
                                            width: '18px',
                                            height: '18px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            marginLeft: '2px'
                                        }}>
                                            {getFieldCount()}
                                        </span>
                                    )}
                                </button>
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
                              </>
                            )}
                        </div>
                    </div>

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
                        
                        @keyframes cascadeSlideOut {
                            from {
                                opacity: 1;
                                transform: translateX(0);
                            }
                            to {
                                opacity: 0;
                                transform: translateX(20px);
                            }
                        }
                        
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
                        
                        /* Smooth exit animation when controls disappear */
                        .search-controls-exit {
                            animation: cascadeSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
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
                        minHeight: '500px'
                    }}>
                        <div style={{ 
                            display: 'flex',
                            width: '300%', // 3 panels * 100% each
                            transform: `translateX(-${currentStep * 33.333}%)`,
                            transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            height: '100%'
                        }}>
                            
                            {/* Step 1: Client Selection */}
                            <div style={{ width: '33.333%', padding: '16px', boxSizing: 'border-box' }}>
                                <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto 16px auto' }}>
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
                                    />
                                </div>
                                
                                {/* Opponent Details Step - appears after POID selection */}
                                {(selectedPoidIds.length > 0 && pendingClientType) && (
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
                                            setOpponentName={setOpponentName}
                                            opponentEmail={opponentEmail}
                                            setOpponentEmail={setOpponentEmail}
                                            opponentSolicitorName={opponentSolicitorName}
                                            setOpponentSolicitorName={setOpponentSolicitorName}
                                            opponentSolicitorCompany={opponentSolicitorCompany}
                                            setOpponentSolicitorCompany={setOpponentSolicitorCompany}
                                            opponentSolicitorEmail={opponentSolicitorEmail}
                                            setOpponentSolicitorEmail={setOpponentSolicitorEmail}
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
                                
                                {/* Continue Button */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                                    <div
                                        className="nav-button forward-button"
                                        onClick={opponentChoiceMade ? handleContinueToForm : undefined}
                                        aria-disabled={!opponentChoiceMade}
                                        tabIndex={opponentChoiceMade ? 0 : -1}
                                        style={{
                                            background: '#f4f4f6',
                                            border: '2px solid #e1dfdd',
                                            borderRadius: '0px',
                                            width: '48px',
                                            height: '48px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: opponentChoiceMade ? 'pointer' : 'not-allowed',
                                            opacity: opponentChoiceMade ? 1 : 0.5,
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            pointerEvents: opponentChoiceMade ? 'auto' : 'none',
                                        }}
                                        onMouseEnter={opponentChoiceMade ? (e) => {
                                            e.currentTarget.style.background = '#ffefed';
                                            e.currentTarget.style.border = '2px solid #D65541';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '220px';
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                                        } : undefined}
                                        onMouseLeave={opponentChoiceMade ? (e) => {
                                            e.currentTarget.style.background = '#f4f4f6';
                                            e.currentTarget.style.border = '2px solid #e1dfdd';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '48px';
                                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                                        } : undefined}
                                    >
                                        {/* Arrow Icon */}
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            style={{
                                                transition: 'color 0.3s, opacity 0.3s',
                                                color: '#D65541',
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                            }}
                                        >
                                            <path
                                                d="M5 12h14m-7-7l7 7-7 7"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>

                                        {/* Expandable Text */}
                                        <span
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: '#D65541',
                                                opacity: 0,
                                                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                whiteSpace: 'nowrap',
                                            }}
                                            className="nav-text"
                                        >
                                            Continue to Matter Details
                                        </span>
                                    </div>
                                    <style>{`
                                        .nav-button:hover .nav-text {
                                            opacity: 1 !important;
                                        }
                                        .nav-button:hover svg {
                                            opacity: 0 !important;
                                        }
                                    `}</style>
                                </div>
                            </div>

                            {/* Step 2: Matter Form */}
                            <div style={{ width: '33.333%', padding: '16px', boxSizing: 'border-box' }}>
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
                                    partnerOptions={getPartnerInitials(teamData || localTeamDataJson)}
                                    requestingUser={requestingUserNickname}
                                    requestingUserClioId={requestingUserClioId}
                                />
                                <Stack tokens={{ childrenGap: 24 }} style={{ marginTop: 24 }}>
                                    {/* Move NetDocuments Folder Structure above Area of Work */}
                                    <DescriptionStep
                                        description={description}
                                        setDescription={setDescription}
                                        matterRefPreview={(() => {
                                            // Only show if a single POID is selected and client type is set
                                            if (!pendingClientType || selectedPoidIds.length === 0) return '';
                                            const poid = effectivePoidData.find(p => p.poid_id === selectedPoidIds[0]);
                                            if (!poid) return '';
                                            let base = '';
                                            if (pendingClientType === 'Individual') {
                                                base = (poid.last || '').toUpperCase();
                                            } else if (pendingClientType === 'Company') {
                                                base = (poid.company_name || '').toUpperCase();
                                            } else if (pendingClientType === 'Multiple Individuals' && clientAsOnFile) {
                                                base = clientAsOnFile.toUpperCase();
                                                const digits = Math.floor(10000 + Math.random() * 90000);
                                                return base.slice(0, 5) + digits + '-0001';
                                            } else {
                                                base = (poid.last || poid.company_name || '').toUpperCase();
                                            }
                                            let ref = base.slice(0, 5).padEnd(5, 'X');
                                            return ref + '-0001';
                                        })()}
                                    />
                                    <FolderStructureStep
                                        folderStructure={folderStructure}
                                        setFolderStructure={(value) => {
                                            setFolderStructure(value);
                                            // Auto-select Area of Work based on folder structure
                                            if (value === 'Default / Commercial') setAreaOfWork('Commercial');
                                            else if (value === 'Residential Possession') setAreaOfWork('Property');
                                            else if (value === 'Adjudication') setAreaOfWork('Construction');
                                            else if (value === 'Employment') setAreaOfWork('Employment');
                                        }}
                                        folderOptions={['Default / Commercial', 'Residential Possession', 'Adjudication', 'Employment']}
                                        onContinue={function (): void {} }
                                    />
                                    <AreaOfWorkStep
                                        areaOfWork={areaOfWork}
                                        setAreaOfWork={setAreaOfWork}
                                        getGroupColor={getGroupColor}
                                        onContinue={function (): void {} }
                                    />
                                    <PracticeAreaStep
                                        options={areaOfWork && practiceAreasByArea[areaOfWork] ? practiceAreasByArea[areaOfWork] : ['Please select an Area of Work']}
                                        practiceArea={practiceArea}
                                        setPracticeArea={setPracticeArea}
                                        areaOfWork={areaOfWork}
                                        onContinue={function (): void {} }
                                    />
                                    <ValueAndSourceStep
                                        disputeValue={disputeValue}
                                        setDisputeValue={setDisputeValue}
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
                                    {/* Back button with smooth expansion */}
                                    <div 
                                        className="nav-button back-button"
                                        onClick={handleBackToClients}
                                        style={{
                                            background: '#f4f4f6',
                                            border: '2px solid #e1dfdd',
                                            borderRadius: '0px',
                                            width: '48px',
                                            height: '48px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#ffefed';
                                            e.currentTarget.style.border = '2px solid #D65541';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '160px';
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f4f4f6';
                                            e.currentTarget.style.border = '2px solid #e1dfdd';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '48px';
                                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                                        }}
                                    >
                                        {/* Arrow Icon */}
                                        <svg 
                                            width="18" 
                                            height="18" 
                                            viewBox="0 0 24 24" 
                                            fill="none"
                                            style={{
                                                transition: 'color 0.3s, opacity 0.3s',
                                                color: '#D65541',
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                            }}
                                        >
                                            <path 
                                                d="M19 12h-14m7 7l-7-7 7-7" 
                                                stroke="currentColor" 
                                                strokeWidth="2" 
                                                strokeLinecap="round" 
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                        
                                        {/* Expandable Text */}
                                        <span 
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: '#D65541',
                                                opacity: 0,
                                                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                whiteSpace: 'nowrap',
                                            }}
                                            className="nav-text"
                                        >
                                            Back to Clients
                                        </span>
                                    </div>

                                    {/* Forward button with smooth expansion */}
                                    <div 
                                        className="nav-button forward-button"
                                        onClick={handleGoToReview}
                                        style={{
                                            background: '#f4f4f6',
                                            border: '2px solid #e1dfdd',
                                            borderRadius: '0px',
                                            width: '48px',
                                            height: '48px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#ffefed';
                                            e.currentTarget.style.border = '2px solid #D65541';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '160px';
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f4f4f6';
                                            e.currentTarget.style.border = '2px solid #e1dfdd';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '48px';
                                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                                        }}
                                    >
                                        {/* Arrow Icon */}
                                        <svg 
                                            width="18" 
                                            height="18" 
                                            viewBox="0 0 24 24" 
                                            fill="none"
                                            style={{
                                                transition: 'color 0.3s, opacity 0.3s',
                                                color: '#D65541',
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                            }}
                                        >
                                            <path 
                                                d="M5 12h14m-7-7l7 7-7 7" 
                                                stroke="currentColor" 
                                                strokeWidth="2" 
                                                strokeLinecap="round" 
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                        
                                        {/* Expandable Text */}
                                        <span 
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: '#D65541',
                                                opacity: 0,
                                                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                whiteSpace: 'nowrap',
                                            }}
                                            className="nav-text"
                                        >
                                            Review Summary
                                        </span>
                                    </div>
                                    
                                    <style>{`
                                        .nav-button:hover .nav-text {
                                            opacity: 1 !important;
                                        }
                                        .nav-button:hover svg {
                                            opacity: 0 !important;
                                        }
                                    `}</style>
                                </div>
                            </div>

                            {/* Step 3: Review Summary */}
                            <div style={{ width: '33.333%', padding: '16px', boxSizing: 'border-box' }}>
                                <div
                                    className="review-summary-box review-summary-hoverable"
                                    onClick={() => setSummaryConfirmed(true)}
                                    style={{
                                        border: summaryConfirmed ? '2px solid #49B670' : '2px solid #D65541',
                                        borderRadius: 0,
                                        background: summaryConfirmed ? '#f5fdf7' : '#fff',
                                        padding: 24,
                                        margin: '0 0 16px 0',
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        transition: 'border-color 0.2s, background 0.2s',
                                        cursor: summaryConfirmed ? 'default' : 'pointer',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                        <h4 style={{ 
                                            margin: 0, 
                                            fontWeight: 600, 
                                            fontSize: 18, 
                                            color: summaryConfirmed ? '#15803d' : '#061733',
                                            animation: 'cascadeSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                                            animationDelay: '0ms',
                                            opacity: 0,
                                            transform: 'translateX(20px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8
                                        }}>
                                            {summaryConfirmed && (
                                                <i className="ms-Icon ms-Icon--CheckMark" style={{ 
                                                    fontSize: 16, 
                                                    color: '#22c55e'
                                                }} />
                                            )}
                                            Review Summary {summaryConfirmed ? '- Confirmed' : ''}
                                        </h4>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent event bubbling to parent
                                                setJsonPreviewOpen(!jsonPreviewOpen);
                                            }}
                                            style={{
                                                background: '#f8f9fa',
                                                border: '1px solid #e1dfdd',
                                                borderRadius: 6,
                                                padding: '8px 12px',
                                                fontSize: 12,
                                                fontWeight: 500,
                                                color: '#3690CE',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                transition: 'background 0.2s ease, border-color 0.2s ease',
                                                animation: 'cascadeSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                                                animationDelay: '150ms',
                                                opacity: 0,
                                                transform: 'translateX(20px)'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = '#e7f1ff';
                                                e.currentTarget.style.borderColor = '#3690CE';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = '#f8f9fa';
                                                e.currentTarget.style.borderColor = '#e1dfdd';
                                            }}
                                        >
                                            <i className="ms-Icon ms-Icon--Code" style={{ fontSize: 12 }} />
                                            {jsonPreviewOpen ? 'Hide JSON' : 'View JSON'}
                                        </button>
                                    </div>
                                    
                                    {/* JSON Preview Panel */}
                                    {jsonPreviewOpen && (
                                        <div style={{
                                            marginBottom: 24,
                                            border: '1px solid #e1dfdd',
                                            borderRadius: 6,
                                            background: '#f8f9fa',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                padding: '12px 16px',
                                                background: '#2d3748',
                                                color: '#fff',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>Sample JSON Output</span>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(JSON.stringify(generateSampleJson(), null, 2));
                                                    }}
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
                                                    <i className="ms-Icon ms-Icon--Copy" style={{ fontSize: 10 }} />
                                                    Copy
                                                </button>
                                            </div>
                                            <div style={{
                                                padding: 16,
                                                maxHeight: 400,
                                                overflow: 'auto',
                                                fontSize: 11,
                                                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                                                lineHeight: 1.4,
                                                background: '#fff'
                                            }}>
                                                <pre style={{ 
                                                    margin: 0, 
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word'
                                                }}>
                                                    {JSON.stringify(generateSampleJson(), null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Client Information Section */}
                                    <div style={{ marginBottom: 24 }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8, 
                                            marginBottom: 12,
                                            paddingBottom: 8,
                                            borderBottom: '1px solid #f0f0f0'
                                        }}>
                                            <i className="ms-Icon ms-Icon--People" style={{ fontSize: 14, color: '#3690CE' }} />
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#3690CE' }}>Client Information</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, paddingLeft: 22 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Type:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{clientType || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Client(s):</span>
                                                <div style={{ textAlign: 'right', maxWidth: '60%' }}>
                                                    {selectedPoidIds && selectedPoidIds.length > 0 ? (
                                                        selectedPoidIds.map((id: string, index: number) => {
                                                            const client = effectivePoidData.find(p => p.poid_id === id);
                                                            return (
                                                                <div key={id} style={{ fontSize: 13, fontWeight: 500, marginBottom: index < selectedPoidIds.length - 1 ? 4 : 0 }}>
                                                                    {client ? `${client.first} ${client.last}` : id}
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <span style={{ fontSize: 13, fontWeight: 500 }}>-</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Matter Details Section */}
                                    <div style={{ marginBottom: 24 }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8, 
                                            marginBottom: 12,
                                            paddingBottom: 8,
                                            borderBottom: '1px solid #f0f0f0'
                                        }}>
                                            <i className="ms-Icon ms-Icon--OpenFolderHorizontal" style={{ fontSize: 14, color: '#3690CE' }} />
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#3690CE' }}>Matter Details</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, paddingLeft: 22 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Area of Work:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{areaOfWork || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Practice Area:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{practiceArea || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Description:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right', lineHeight: '1.4' }}>
                                                    {description ? (description.length > 50 ? `${description.substring(0, 50)}...` : description) : '-'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Dispute Value:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{disputeValue || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Budget Required:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{budgetRequired}</span>
                                            </div>
                                            {budgetRequired === 'Yes' && (
                                                <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: '#666', fontSize: 13 }}>Budget Amount:</span>
                                                        <span style={{ fontWeight: 500, fontSize: 13 }}>{budgetAmount ? `£${budgetAmount}` : '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ color: '#666', fontSize: 13 }}>Notify Threshold:</span>
                                                        <span style={{ fontWeight: 500, fontSize: 13 }}>{budgetThreshold ? `${budgetThreshold}%` : '-'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <span style={{ color: '#666', fontSize: 13 }}>Notify Users:</span>
                                                        <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{budgetNotifyUsers || '-'}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Team & Management Section */}
                                    <div style={{ marginBottom: 24 }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8, 
                                            marginBottom: 12,
                                            paddingBottom: 8,
                                            borderBottom: '1px solid #f0f0f0'
                                        }}>
                                            <i className="ms-Icon ms-Icon--ContactCard" style={{ fontSize: 14, color: '#3690CE' }} />
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#3690CE' }}>Team & Management</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, paddingLeft: 22 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Date:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{selectedDate ? selectedDate.toLocaleDateString() : '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Solicitor:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{teamMember || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Supervising Partner:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{supervisingPartner || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Originating Solicitor:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{originatingSolicitor || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Additional Information Section */}
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8, 
                                            marginBottom: 12,
                                            paddingBottom: 8,
                                            borderBottom: '1px solid #f0f0f0'
                                        }}>
                                            <i className="ms-Icon ms-Icon--Info" style={{ fontSize: 14, color: '#3690CE' }} />
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#3690CE' }}>Additional Details</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, paddingLeft: 22 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Source:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>
                                                    {source}{source === 'referral' && referrerName ? ` - ${referrerName}` : ''}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Folder Structure:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{folderStructure || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Opponent Details Section */}
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8, 
                                            marginBottom: 12,
                                            paddingBottom: 8,
                                            borderBottom: '1px solid #f0f0f0'
                                        }}>
                                            <i className="ms-Icon ms-Icon--Contact" style={{ fontSize: 14, color: '#3690CE' }} />
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#3690CE' }}>Opponent Details</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, padding: '0 0 8px 22px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Company Name:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentCompanyName || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Company Number:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentCompanyNumber || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Has Company:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentHasCompany ? 'Yes' : 'No'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Title:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentTitle || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>First Name:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentFirst || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Last Name:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentLast || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Email:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentEmail || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Phone:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentPhone || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>House/Building:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentHouseNumber || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Street:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentStreet || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>City:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentCity || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>County:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentCounty || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Postcode:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentPostcode || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Country:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentCountry || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ...removed duplicate Value/Dispute Value section... */}

                                    {/* Opponent Solicitor Details Section */}
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 8, 
                                            marginBottom: 12,
                                            paddingBottom: 8,
                                            borderBottom: '1px solid #f0f0f0'
                                        }}>
                                            <i className="ms-Icon ms-Icon--Legal" style={{ fontSize: 14, color: '#3690CE' }} />
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#3690CE' }}>Opponent Solicitor Details</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, paddingLeft: 22 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Company Name:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentSolicitorCompany || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Company Number:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorCompanyNumber || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Title:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorTitle || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>First Name:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorFirst || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Last Name:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorLast || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Email:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{opponentSolicitorEmail || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Phone:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorPhone || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>House/Building:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorHouseNumber || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Street:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorStreet || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>City:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorCity || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>County:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorCounty || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Postcode:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorPostcode || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#666', fontSize: 13 }}>Country:</span>
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{solicitorCountry || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Conflict Check Status */}
                                    <div style={{ 
                                        marginTop: 16,
                                        padding: 12,
                                        background: noConflict ? '#f0f9f4' : '#fef2f2',
                                        border: `1px solid ${noConflict ? '#d1fae5' : '#fecaca'}`,
                                        borderRadius: 6,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8
                                    }}>
                                        <i className={`ms-Icon ms-Icon--${noConflict ? 'CheckMark' : 'Warning'}`} 
                                           style={{ fontSize: 14, color: noConflict ? '#22c55e' : '#ef4444' }} />
                                        <span style={{ fontSize: 13, fontWeight: 500, color: noConflict ? '#15803d' : '#dc2626' }}>
                                            {noConflict ? 'No conflicts confirmed' : 'Conflict check required'}
                                        </span>
                                    </div>

                                    {/* Confirmation required banner */}
                                    {!summaryConfirmed && (
                                        <div style={{ 
                                            marginTop: 16,
                                            padding: 12,
                                            background: '#fef2f2',
                                            border: '1px solid #D65541',
                                            borderRadius: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8
                                        }}>
                                            <i className="ms-Icon ms-Icon--Touch" 
                                               style={{ fontSize: 14, color: '#D65541' }} />
                                            <span style={{ fontSize: 13, fontWeight: 500, color: '#D65541' }}>
                                                Click anywhere in this box to confirm these details are accurate
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {showProcessingSection && (
                                    <ProcessingSection open={true} steps={processingSteps} logs={processingLogs} />
                                )}

                                {!processingOpen && showCclPrompt && (
                                    <div style={{ marginTop: 24 }}>
                                        <ModernMultiSelect
                                            label="Draft the CCL now?"
                                            options={[
                                                { key: 'yes', text: 'Yes, draft now' },
                                                { key: 'no', text: 'Not now' }
                                            ]}
                                            selectedValue={draftChoice ?? null}
                                            onSelectionChange={(val) => handleDraftChoice(val as 'yes' | 'no')}
                                            variant="binary"
                                        />
                                        {cclGenerating && (
                                            <div style={{ marginTop: 8 }}>
                                                Generating CCL...
                                            </div>
                                        )}
                                        {generatedCclUrl && (
                                            <div style={{ marginTop: 8 }}>
                                                <a href={generatedCclUrl} target="_blank" rel="noopener noreferrer">Download Draft CCL</a>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Navigation buttons for review step */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                                    {/* Back button with smooth expansion */}
                                    <div 
                                        className="nav-button back-button"
                                        onClick={handleBackToForm}
                                        style={{
                                            background: '#f4f4f6',
                                            border: '2px solid #e1dfdd',
                                            borderRadius: '0px',
                                            width: '48px',
                                            height: '48px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#ffefed';
                                            e.currentTarget.style.border = '2px solid #D65541';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '140px';
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f4f4f6';
                                            e.currentTarget.style.border = '2px solid #e1dfdd';
                                            e.currentTarget.style.borderRadius = '0px';
                                            e.currentTarget.style.width = '48px';
                                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                                        }}
                                    >
                                        {/* Arrow Icon */}
                                        <svg 
                                            width="18" 
                                            height="18" 
                                            viewBox="0 0 24 24" 
                                            fill="none"
                                            style={{
                                                transition: 'color 0.3s, opacity 0.3s',
                                                color: '#D65541',
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                            }}
                                        >
                                            <path 
                                                d="M19 12h-14m7 7l-7-7 7-7" 
                                                stroke="currentColor" 
                                                strokeWidth="2" 
                                                strokeLinecap="round" 
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                        
                                        {/* Expandable Text */}
                                        <span 
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: '#D65541',
                                                opacity: 0,
                                                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                whiteSpace: 'nowrap',
                                            }}
                                            className="nav-text"
                                        >
                                            Back to Form
                                        </span>
                                    </div>

                                    {/* Submit button with smooth expansion */}
                                    <div 
                                        className="nav-button submit-button"
                                        onClick={() => {
                                            if (summaryConfirmed && !isProcessing) {
                                                // Start the processing simulation
                                                simulateProcessing().then(r => r && setGeneratedCclUrl(r.url));
                                            }
                                        }}
                                        style={{
                                            background: isProcessing ? '#e6f7ff' : summaryConfirmed ? '#f4f4f6' : '#f8f8f8',
                                            border: isProcessing ? '2px solid #1890ff' : summaryConfirmed ? '2px solid #e1dfdd' : '2px solid #ddd',
                                            borderRadius: '0px',
                                            width: '48px',
                                            height: '48px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: (summaryConfirmed && !isProcessing) ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: summaryConfirmed ? '0 1px 2px rgba(6,23,51,0.04)' : 'none',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            opacity: (summaryConfirmed || isProcessing) ? 1 : 0.5,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (summaryConfirmed) {
                                                e.currentTarget.style.background = '#ffefed';
                                                e.currentTarget.style.border = '2px solid #D65541';
                                                e.currentTarget.style.borderRadius = '0px';
                                                e.currentTarget.style.width = '160px';
                                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (summaryConfirmed) {
                                                e.currentTarget.style.background = '#f4f4f6';
                                                e.currentTarget.style.border = '2px solid #e1dfdd';
                                                e.currentTarget.style.borderRadius = '0px';
                                                e.currentTarget.style.width = '48px';
                                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                                            }
                                        }}
                                    >
                                        {/* Check Icon or Spinner */}
                                        {isProcessing ? (
                                            <div style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                width: '18px',
                                                height: '18px',
                                                border: '2px solid #1890ff',
                                                borderTop: '2px solid transparent',
                                                borderRadius: '50%',
                                                animation: 'spin 1s linear infinite'
                                            }} />
                                        ) : (
                                            <svg 
                                                width="18" 
                                                height="18" 
                                                viewBox="0 0 24 24" 
                                                fill="none"
                                                style={{
                                                    transition: 'color 0.3s, opacity 0.3s',
                                                    color: summaryConfirmed ? '#D65541' : '#999',
                                                    position: 'absolute',
                                                    left: '50%',
                                                    top: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                }}
                                            >
                                                <polyline 
                                                    points="20,6 9,17 4,12" 
                                                    stroke="currentColor" 
                                                    strokeWidth="2" 
                                                    strokeLinecap="round" 
                                                    strokeLinejoin="round"
                                                />
                                            </svg>
                                        )}
                                        
                                        {/* Expandable Text */}
                                        <span 
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: summaryConfirmed ? '#D65541' : '#999',
                                                opacity: 0,
                                                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                whiteSpace: 'nowrap',
                                            }}
                                            className="nav-text"
                                        >
                                            {isProcessing ? 'Processing...' : summaryConfirmed ? 'Submit Matter' : 'Confirm Summary First'}
                                        </span>
                                    </div>
                                    
                                    <style>{`
                                        .nav-button:hover .nav-text {
                                            opacity: 1 !important;
                                        }
                                        .nav-button:hover svg {
                                            opacity: 0 !important;
                                        }
                                        .submit-button[style*="cursor: not-allowed"]:hover .nav-text {
                                            opacity: 0 !important;
                                        }
                                        .submit-button[style*="cursor: not-allowed"]:hover svg {
                                            opacity: 1 !important;
                                        }
                                    `}</style>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CSS for smooth hover effects and navigation animations */}
                    <style>{`
                        .review-summary-hoverable {
                            box-shadow: none;
                        }
                        .review-summary-hoverable:hover {
                            border-color: ${summaryConfirmed ? '#49B670' : '#D65541'} !important;
                            box-shadow: ${summaryConfirmed ? '0 0 0 1px #49B670' : '0 0 0 1px #D65541'};
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
                </div>
            </Stack>
        </CompletionProvider>
    );
}

export default FlatMatterOpening;