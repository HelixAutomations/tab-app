/**
 * CompactMatterWizard — lightweight inline matter opening form for the InlineWorkbench.
 *
 * Replaces the FlatMatterOpening modal when operating inside the workbench context.
 * Pre-populates everything possible from the instruction/deal/EID data already
 * available in the workbench, leaving a minimal form for the user to confirm
 * team assignments, practice area, description, and conflict check before
 * triggering the 22-step processingActions pipeline inline.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBuilding,
  FaCheck,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaEnvelope,
  FaExclamationTriangle,
  FaFileAlt,
  FaFolder,
  FaFolderOpen,
  FaGavel,
  FaIdCard,
  FaCreditCard,
  FaMapMarkerAlt,
  FaPhone,
  FaShieldAlt,
  FaTimes,
  FaTimesCircle,
  FaUser,
  FaUserTie,
} from 'react-icons/fa';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import { getPracticeAreaOptions, normalisePracticeArea, practiceAreasByArea, resolveMatterPracticeArea, partnerOptions } from './config';
import { buildMatterOpeningPayload, validateMatterOpeningPayload } from './intakeModel';
import type { MatterOpeningPayload } from './intakeModel';
import ConflictConfirmationCard from './ConflictConfirmationCard';
import {
  processingActions,
  initialSteps,
  registerClientIdCallback,
  registerMatterIdCallback,
  registerOperationObserver,
  resetMatterTraceId,
  setCurrentActionIndex,
  getMatterDisplayNumber,
} from './processingActions';
import type { ProcessingStep } from './ProcessingSection';
import type { TeamData } from '../../../app/functionality/types';
import type { Toast, ToastType } from '../../../components/feedback/ToastProvider';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ShowToastFn = (toast: Omit<Toast, 'id'> & { id?: string }) => string;
type HideToastFn = (id: string) => void;

interface CompactMatterWizardProps {
  inst: any;
  deal: any;
  eid: any;
  risk: any;
  payments: any[];
  documents: any[];
  poidData: any[];
  teamData: TeamData[] | null;
  currentUser: { FullName?: string; Email?: string } | null;
  isDarkMode: boolean;
  feeEarner: string;
  areaOfWork: string;
  instructionRef: string;
  initialClientType?: 'Individual' | 'Company' | 'Multiple Individuals' | 'Existing Client' | null;
  initialCompanyName?: string;
  initialCompanyRelationship?: string;
  initialDescription?: string;
  mainClientId?: string;
  mainClientName?: string;
  mainClientIsCompany?: boolean;
  onMatterSuccess: (matterId: string) => void;
  onCancel?: () => void;
  showToast: ShowToastFn;
  hideToast: HideToastFn;
  onStageChange?: (stage: 'form' | 'review' | 'processing' | 'complete' | 'error') => void;
  demoModeEnabled?: boolean;
  skipConfirmedPreview?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DISPUTE_VALUES = [
  { label: 'Under £10k', value: 'Less than £10k' },
  { label: '£10k – £500k', value: '£10k - £500k' },
  { label: '£500k – £1m', value: '£500k - £1m' },
  { label: '£1m – £5m', value: '£1m - £5m' },
  { label: '£5m – £20m', value: '£5 - £20m' },
  { label: '£20m+', value: '£20m+' },
];

const SOURCE_OPTIONS = [
  { key: 'search', label: 'Search' },
  { key: 'referral', label: 'Referral' },
  { key: 'your following', label: 'Following' },
  { key: 'uncertain', label: 'Uncertain' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getFullName = (t: any): string => {
  const full = t?.['Full Name'] || `${t?.First || ''} ${t?.Last || ''}`.trim();
  return String(full || '').trim();
};
const getFirstName = (t: any): string => {
  if (t?.First) return String(t.First).trim();
  const full = t?.['Full Name'] || t?.FullName || '';
  return full ? String(full).trim().split(/\s+/)[0] : '';
};
const getInitialsFromName = (name: string, team: TeamData[]): string => {
  if (!name || !team) return '';
  const lower = name.toLowerCase().trim();
  const found = team.find((t: any) => {
    const fn = (t['Full Name'] || '').toLowerCase().trim();
    const cn = `${t.First || ''} ${t.Last || ''}`.toLowerCase().trim();
    const nn = ((t as any).Nickname || '').toLowerCase().trim();
    const fi = ((t as any).First || '').toLowerCase().trim();
    return fn === lower || cn === lower || nn === lower || fi === lower;
  });
  if (found?.Initials) return found.Initials;
  return name.split(' ').filter(Boolean).map(p => p[0].toUpperCase()).join('');
};

const normalizeEmail = (value: string | null | undefined): string => String(value || '').trim().toLowerCase();
const normalizeText = (value: string | null | undefined): string => String(value || '').trim().toLowerCase();

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const CompactMatterWizard: React.FC<CompactMatterWizardProps> = ({
  inst,
  deal,
  eid,
  risk,
  payments,
  documents,
  poidData,
  teamData,
  currentUser,
  isDarkMode,
  feeEarner: propFeeEarner,
  areaOfWork: propAreaOfWork,
  instructionRef,
  initialClientType,
  initialCompanyName,
  initialCompanyRelationship,
  initialDescription,
  mainClientId,
  mainClientName,
  mainClientIsCompany,
  onMatterSuccess,
  onCancel,
  showToast,
  hideToast,
  onStageChange,
  demoModeEnabled = false,
  skipConfirmedPreview = false,
}) => {
  /* ---- derived constants ---- */
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
    return partnersFirst.length > 0 ? partnersFirst : partnerOptions.map(n => n.split(/\s+/)[0]);
  }, [activeTeam]);

  const solicitorOptions = useMemo(() => activeTeam.map(getFullName).filter(Boolean), [activeTeam]);

  const resolvedFeeEarner = useMemo(() => {
    // Signed-in user takes priority — resolve FullName from Email via teamData
    if (currentUser?.FullName) return currentUser.FullName;
    if (currentUser?.Email && activeTeam.length > 0) {
      const emailLower = currentUser.Email.toLowerCase();
      const match = activeTeam.find((t: any) => (t.Email || '').toLowerCase() === emailLower);
      if (match) return getFullName(match);
    }
    if (propFeeEarner && propFeeEarner !== '—') return propFeeEarner;
    if (activeTeam.length > 0) return getFullName(activeTeam[0]);
    return '';
  }, [propFeeEarner, currentUser, activeTeam]);

  const resolvedAreaOfWork = useMemo(() => {
    const raw = (propAreaOfWork && propAreaOfWork !== '—')
      ? propAreaOfWork
      : (inst?.AreaOfWork || inst?.areaOfWork || inst?.Area_of_Work || deal?.AreaOfWork || '');
    // Normalise to title-case so it matches practiceAreasByArea keys ("Commercial", etc.)
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const areaKeys = Object.keys(practiceAreasByArea);
    const matched = areaKeys.find(k => k.toLowerCase() === trimmed.toLowerCase());
    return matched || trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }, [propAreaOfWork, inst, deal]);

  const clientType = useMemo(() => {
    if (initialClientType) return initialClientType;
    if (inst?.ClientType) return inst.ClientType;
    if (inst?.CompanyName || inst?.company_name) return 'Company';
    return 'Individual';
  }, [initialClientType, inst]);

  const clientDisplayName = useMemo(() => {
    const overrideCompanyName = String(initialCompanyName || '').trim();
    const first = inst?.FirstName || inst?.Forename || '';
    const last = inst?.LastName || inst?.Surname || '';
    const full = `${first} ${last}`.trim();
    if (clientType === 'Company' || clientType === 'Multiple Individuals') {
      if (overrideCompanyName) return overrideCompanyName;
      if (inst?.CompanyName || inst?.company_name) return inst.CompanyName || inst.company_name;
    }
    if (mainClientName && mainClientName.trim()) return mainClientName.trim();
    if (inst?.CompanyName || inst?.company_name) return inst.CompanyName || inst.company_name;
    return full || 'Client';
  }, [inst, clientType, initialCompanyName, mainClientName]);

  const payloadClientType = useMemo(() => {
    return clientType === 'Company' || clientType === 'Multiple Individuals' ? 'Company' : 'Individual';
  }, [clientType]);

  /* ---- matter ref preview (SURNAME5 + 4digits + -00001) ---- */
  const matterRefPreview = useMemo(() => {
    let base = '';
    if (clientType === 'Company') {
      const compName = inst?.CompanyName || inst?.company_name || '';
      base = compName.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5);
    } else {
      const surname = inst?.LastName || inst?.Surname || '';
      base = surname.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5);
    }
    if (!base) base = 'XXXXX';
    while (base.length < 5) base += 'X';
    // Extract 4 digits from passcode (last segment of instructionRef or deal.Passcode)
    const passcode = deal?.Passcode || (instructionRef ? instructionRef.split('-').pop() : '') || '';
    const digits = String(passcode).replace(/\D/g, '').slice(0, 4).padEnd(4, '0');
    return `${base}${digits}-00001`;
  }, [inst, deal, clientType, instructionRef]);

  /* ---- user initials for processing ---- */
  const userInitials = useMemo(() => {
    if (currentUser?.Email && teamData) {
      const userEmail = normalizeEmail(currentUser.Email);
      const match = teamData.find((t: any) => {
        const teamEmail = normalizeEmail(t?.Email || t?.email || t?.WorkEmail || t?.Mail || t?.UserPrincipalName || t?.['Email Address'] || t?.['Email']);
        return teamEmail && teamEmail === userEmail;
      });
      if (match?.Initials) return match.Initials.toUpperCase();
    }

    if (currentUser?.FullName && teamData) {
      const userName = normalizeText(currentUser.FullName);
      const match = teamData.find((t: any) => {
        const fullName = normalizeText(t?.['Full Name'] || t?.FullName || `${t?.First || ''} ${t?.Last || ''}`);
        return fullName && fullName === userName;
      });
      if (match?.Initials) return String(match.Initials).toUpperCase();
    }

    return '';
  }, [currentUser, teamData]);

  /* ---- prerequisites readiness ---- */
  const hasClient = !!(inst?.FirstName || inst?.Forename || inst?.CompanyName);
  const hasId = !!(eid?.EIDOverallResult || eid?.EIDCheckId || inst?.EIDOverallResult);
  const hasPayment = payments.some((p: any) => p.payment_status === 'succeeded' || p.internal_status === 'completed' || p.InternalStatus === 'paid');
  const hasRisk = !!(risk?.RiskAssessmentResult || risk?.riskAssessmentResult);

  /* ---- form state ---- */
  const [selectedFeeEarner, setSelectedFeeEarner] = useState(resolvedFeeEarner);
  const [supervisingPartner, setSupervisingPartner] = useState('');
  const [originatingSolicitor, setOriginatingSolicitor] = useState(resolvedFeeEarner);
  const [selectedAreaOfWork, setSelectedAreaOfWork] = useState(resolvedAreaOfWork);
  const filteredPracticeAreas = useMemo(() => {
    return getPracticeAreaOptions(selectedAreaOfWork);
  }, [selectedAreaOfWork]);
  const [practiceArea, setPracticeArea] = useState('');
  const description = useMemo(() => {
    return String(initialDescription || inst?.ServiceDescription || deal?.ServiceDescription || '').trim();
  }, [initialDescription, inst, deal]);
  const [disputeValue, setDisputeValue] = useState('');
  const [source, setSource] = useState('');
  const [noConflict, setNoConflict] = useState(false);

  const resolvedProcessingInitials = useMemo(() => {
    return (userInitials || '').trim();
  }, [userInitials]);

  /* opponent (collapsible) */
  const [showOpponent, setShowOpponent] = useState(false);
  const [opponentType, setOpponentType] = useState<'Individual' | 'Company'>('Individual');
  const [opponentTitle, setOpponentTitle] = useState('');
  const [opponentFirst, setOpponentFirst] = useState('');
  const [opponentLast, setOpponentLast] = useState('');
  const [opponentEmail, setOpponentEmail] = useState('');
  const [opponentPhone, setOpponentPhone] = useState('');
  const [opponentHouseNumber, setOpponentHouseNumber] = useState('');
  const [opponentStreet, setOpponentStreet] = useState('');
  const [opponentCity, setOpponentCity] = useState('');
  const [opponentCounty, setOpponentCounty] = useState('');
  const [opponentPostcode, setOpponentPostcode] = useState('');
  const [opponentCountry, setOpponentCountry] = useState('');
  const [opponentCompanyName, setOpponentCompanyName] = useState('');
  const [opponentCompanyNumber, setOpponentCompanyNumber] = useState('');
  /* opponent solicitor */
  const [showSolicitor, setShowSolicitor] = useState(false);
  const [solicitorFirst, setSolicitorFirst] = useState('');
  const [solicitorLast, setSolicitorLast] = useState('');
  const [solicitorEmail, setSolicitorEmail] = useState('');
  const [solicitorPhone, setSolicitorPhone] = useState('');
  const [solicitorCompany, setSolicitorCompany] = useState('');
  const [solicitorHouseNumber, setSolicitorHouseNumber] = useState('');
  const [solicitorStreet, setSolicitorStreet] = useState('');
  const [solicitorCity, setSolicitorCity] = useState('');
  const [solicitorCounty, setSolicitorCounty] = useState('');
  const [solicitorPostcode, setSolicitorPostcode] = useState('');
  const [solicitorCountry, setSolicitorCountry] = useState('');

  /* processing state */
  const [wizardMode, setWizardMode] = useState<'form' | 'processing' | 'error' | 'confirm' | 'success'>('form');
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>(initialSteps);
  const [processingLogs, setProcessingLogs] = useState<string[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [failureSummary, setFailureSummary] = useState('');
  const [confirmAcknowledge, setConfirmAcknowledge] = useState(false);

  /* error report state */
  const [reportDelivered, setReportDelivered] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const autoReportSentRef = useRef<string | null>(null);
  const wizardSurfaceRef = useRef<HTMLDivElement | null>(null);

  /* userData resolution */
  const [userData, setUserData] = useState<any[] | null>(null);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const profileFetchInFlightRef = useRef(false);
  const lastFetchedEntraIdRef = useRef<string | null>(null);

  const matterId = useRef<string | null>(null);
  const matterDisplayNum = useRef<string | null>(null);
  const primaryClioContactId = useRef<string | null>(null);

  const findTeamMemberByInitials = useCallback((initials: string) => {
    if (!teamData || !initials) return null;
    return teamData.find((t: any) => {
      const candidate = (t.Initials || t.initials || '').toLowerCase();
      return candidate === initials.toLowerCase();
    }) as any || null;
  }, [teamData]);

  const findOperatorTeamMember = useCallback(() => {
    if (!teamData) return null;
    if (currentUser?.Email) {
      const userEmail = normalizeEmail(currentUser.Email);
      const byEmail = teamData.find((t: any) => {
        const teamEmail = normalizeEmail(t?.Email || t?.email || t?.WorkEmail || t?.Mail || t?.UserPrincipalName || t?.['Email Address'] || t?.['Email']);
        return teamEmail && teamEmail === userEmail;
      }) as any;
      if (byEmail) return byEmail;
    }
    if (currentUser?.FullName) {
      const userName = normalizeText(currentUser.FullName);
      const byName = teamData.find((t: any) => {
        const fullName = normalizeText(t?.['Full Name'] || t?.FullName || `${t?.First || ''} ${t?.Last || ''}`);
        return fullName && fullName === userName;
      }) as any;
      if (byName) return byName;
    }
    return null;
  }, [teamData, currentUser]);

  const fetchUserDataFallback = useCallback(async (entraId: string): Promise<any[] | null> => {
    if (!entraId) return null;
    setUserDataLoading(true);
    try {
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userObjectId: entraId }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data) && data.length > 0 ? data : null;
    } catch {
      return null;
    } finally {
      setUserDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!onStageChange) return;
    const mappedStage = wizardMode === 'confirm'
      ? 'review'
      : wizardMode === 'success'
        ? 'complete'
        : wizardMode;
    onStageChange(mappedStage);
  }, [wizardMode, onStageChange]);

  useEffect(() => {
    if (!wizardSurfaceRef.current || typeof wizardSurfaceRef.current.animate !== 'function') return;
    wizardSurfaceRef.current.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0px)' },
      ],
      { duration: 170, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  }, [wizardMode]);

  /* ---- localStorage persistence key ---- */
  const storageKey = instructionRef ? `compact-wizard-${instructionRef}` : '';

  /* ---- load persisted form state on mount ---- */
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.opponentType) setOpponentType(s.opponentType);
      if (s.opponentTitle) setOpponentTitle(s.opponentTitle);
      if (s.opponentFirst) setOpponentFirst(s.opponentFirst);
      if (s.opponentLast) setOpponentLast(s.opponentLast);
      if (s.opponentEmail) setOpponentEmail(s.opponentEmail);
      if (s.opponentPhone) setOpponentPhone(s.opponentPhone);
      if (s.opponentHouseNumber) setOpponentHouseNumber(s.opponentHouseNumber);
      if (s.opponentStreet) setOpponentStreet(s.opponentStreet);
      if (s.opponentCity) setOpponentCity(s.opponentCity);
      if (s.opponentCounty) setOpponentCounty(s.opponentCounty);
      if (s.opponentPostcode) setOpponentPostcode(s.opponentPostcode);
      if (s.opponentCountry) setOpponentCountry(s.opponentCountry);
      if (s.opponentCompanyName) setOpponentCompanyName(s.opponentCompanyName);
      if (s.opponentCompanyNumber) setOpponentCompanyNumber(s.opponentCompanyNumber);
      if (s.solicitorFirst) setSolicitorFirst(s.solicitorFirst);
      if (s.solicitorLast) setSolicitorLast(s.solicitorLast);
      if (s.solicitorEmail) setSolicitorEmail(s.solicitorEmail);
      if (s.solicitorPhone) setSolicitorPhone(s.solicitorPhone);
      if (s.solicitorCompany) setSolicitorCompany(s.solicitorCompany);
      if (s.solicitorHouseNumber) setSolicitorHouseNumber(s.solicitorHouseNumber);
      if (s.solicitorStreet) setSolicitorStreet(s.solicitorStreet);
      if (s.solicitorCity) setSolicitorCity(s.solicitorCity);
      if (s.solicitorCounty) setSolicitorCounty(s.solicitorCounty);
      if (s.solicitorPostcode) setSolicitorPostcode(s.solicitorPostcode);
      if (s.solicitorCountry) setSolicitorCountry(s.solicitorCountry);
      const restoredPracticeArea = normalisePracticeArea(selectedAreaOfWork, s.practiceArea);
      if (restoredPracticeArea) setPracticeArea(restoredPracticeArea);
      if (s.disputeValue) setDisputeValue(s.disputeValue);
      if (s.source) setSource(s.source);
      if (s.showOpponent) setShowOpponent(true);
      if (s.showSolicitor) setShowSolicitor(true);
    } catch { /* ignore corrupt storage */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /* ---- persist form state on change ---- */
  useEffect(() => {
    if (!storageKey) return;
    const state = {
      opponentType, opponentTitle, opponentFirst, opponentLast,
      opponentEmail, opponentPhone, opponentHouseNumber, opponentStreet,
      opponentCity, opponentCounty, opponentPostcode, opponentCountry,
      opponentCompanyName, opponentCompanyNumber,
      solicitorFirst, solicitorLast, solicitorEmail, solicitorPhone, solicitorCompany,
      solicitorHouseNumber, solicitorStreet, solicitorCity, solicitorCounty, solicitorPostcode, solicitorCountry,
      practiceArea, disputeValue, source,
      showOpponent, showSolicitor,
    };
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* quota */ }
  }, [
    storageKey, opponentType, opponentTitle, opponentFirst, opponentLast,
    opponentEmail, opponentPhone, opponentHouseNumber, opponentStreet,
    opponentCity, opponentCounty, opponentPostcode, opponentCountry,
    opponentCompanyName, opponentCompanyNumber,
    solicitorFirst, solicitorLast, solicitorEmail, solicitorPhone, solicitorCompany,
    solicitorHouseNumber, solicitorStreet, solicitorCity, solicitorCounty, solicitorPostcode, solicitorCountry,
    practiceArea, disputeValue, source, showOpponent, showSolicitor,
  ]);

  /* ---- initialise defaults ---- */
  useEffect(() => {
    if (partnerOptionsList.length > 0 && !supervisingPartner) {
      // Construction AoW → Jonathan, all else → Alex (mirrors leave approval logic)
      const aow = (resolvedAreaOfWork || '').toLowerCase();
      const isConstruction = aow === 'construction' || aow.includes('construction');
      const target = isConstruction ? 'Jonathan' : 'Alex';
      const match = partnerOptionsList.find(p => p.toLowerCase().startsWith(target.toLowerCase()));
      setSupervisingPartner(match || partnerOptionsList[0]);
    }
  }, [partnerOptionsList, supervisingPartner, resolvedAreaOfWork]);

  /* Track previous resolvedFeeEarner so we can detect when currentUser loads
     and override the stale propFeeEarner default (e.g. "Alex" → signed-in user). */
  const prevResolvedFeeEarnerRef = useRef(resolvedFeeEarner);
  useEffect(() => {
    const prev = prevResolvedFeeEarnerRef.current;
    if (resolvedFeeEarner && resolvedFeeEarner !== prev) {
      // resolvedFeeEarner changed (e.g. currentUser loaded) — update form if still showing old default
      if (selectedFeeEarner === prev || !selectedFeeEarner) setSelectedFeeEarner(resolvedFeeEarner);
      if (originatingSolicitor === prev || !originatingSolicitor) setOriginatingSolicitor(resolvedFeeEarner);
      prevResolvedFeeEarnerRef.current = resolvedFeeEarner;
    } else if (resolvedFeeEarner && !selectedFeeEarner) {
      setSelectedFeeEarner(resolvedFeeEarner);
    }
    if (resolvedFeeEarner && !originatingSolicitor) setOriginatingSolicitor(resolvedFeeEarner);
  }, [resolvedFeeEarner, selectedFeeEarner, originatingSolicitor]);

  useEffect(() => {
    if (resolvedAreaOfWork && !selectedAreaOfWork) setSelectedAreaOfWork(resolvedAreaOfWork);
  }, [resolvedAreaOfWork, selectedAreaOfWork]);

  useEffect(() => {
    if (!practiceArea) return;
    if (!normalisePracticeArea(selectedAreaOfWork, practiceArea)) {
      setPracticeArea('');
    }
  }, [selectedAreaOfWork, practiceArea]);

  /* ---- resolve userData from teamData on mount ---- */
  useEffect(() => {
    if (!teamData || !resolvedProcessingInitials) return;

    const hasResolvedUserData = Array.isArray(userData) && userData.length > 0;
    if (hasResolvedUserData) return;

    const tm = findOperatorTeamMember() || findTeamMemberByInitials(resolvedProcessingInitials);
    if (!tm) return;

    // Try API first
    const entraId = tm['Entra ID'] || tm.EntraID;
    if (entraId) {
      const normalizedEntraId = String(entraId);
      if (profileFetchInFlightRef.current) return;
      if (lastFetchedEntraIdRef.current === normalizedEntraId) return;

      profileFetchInFlightRef.current = true;
      lastFetchedEntraIdRef.current = normalizedEntraId;
      fetchUserDataFallback(normalizedEntraId)
        .then((data) => {
          if (data && data.length > 0) {
            setUserData(data);
          } else {
            setUserData([buildMinimalUserData(tm, resolvedProcessingInitials)]);
          }
        })
        .catch(() => setUserData([buildMinimalUserData(tm, resolvedProcessingInitials)]))
        .finally(() => {
          profileFetchInFlightRef.current = false;
        });
    } else {
      setUserData([buildMinimalUserData(tm, resolvedProcessingInitials)]);
    }
  }, [
    teamData,
    resolvedProcessingInitials,
    userData,
    currentUser?.Email,
    currentUser?.FullName,
    fetchUserDataFallback,
    findOperatorTeamMember,
    findTeamMemberByInitials,
  ]);

  /* ---- telemetry helper (App Insights via server) ---- */
  const reportTelemetry = useCallback((type: string, data: Record<string, unknown>) => {
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'CompactMatterWizard',
          event: {
            type,
            timestamp: new Date().toISOString(),
            sessionId: `${userInitials}-${Date.now()}`,
            enquiryId: instructionRef || '',
            feeEarner: userInitials || '',
            data: { ...data, instructionRef: instructionRef || '', userInitials: userInitials || '' },
            error: data.error ? String(data.error) : undefined,
          },
        }),
      }).catch(() => { /* non-blocking */ });
    } catch { /* non-blocking */ }
  }, [userInitials, instructionRef]);

  /* ---- auto-report on failure ---- */
  useEffect(() => {
    if (!failureSummary || autoReportSentRef.current === failureSummary) return;
    autoReportSentRef.current = failureSummary;
    setReportDelivered(false);

    const timer = setTimeout(async () => {
      try {
        const report = {
          issue: failureSummary,
          user: userInitials,
          instruction: instructionRef || 'N/A',
          timestamp: new Date().toLocaleString(),
          formSummary: {
            feeEarner: selectedFeeEarner,
            partner: supervisingPartner,
            originating: originatingSolicitor,
            areaOfWork: selectedAreaOfWork,
            practiceArea,
            clientType,
            clientName: clientDisplayName,
          },
          processingSteps: processingSteps.map(s => ({ label: s.label, status: s.status, message: s.message })),
          url: window.location.href,
          autoSent: true,
          source: 'CompactMatterWizard',
        };
        const html = `<h2>Matter Opening Issue (CompactWizard Auto-Report)</h2><pre>${JSON.stringify(report, null, 2)}</pre>`;
        const resp = await fetch('/api/sendEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: 'lz@helix-law.com',
            subject: `Matter Opening Issue (Compact/Auto) - ${userInitials}`,
            html,
            from_email: 'automations@helix-law.com',
          }),
        });
        if (resp.ok) {
          setReportDelivered(true);
        }
      } catch { /* non-blocking */ }
    }, 1200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failureSummary]);

  /* ---- manual report sender ---- */
  const sendManualReport = useCallback(async () => {
    if (reportDelivered || reportSending) return;
    setReportSending(true);
    try {
      const report = {
        issue: failureSummary || 'General diagnostic report',
        user: userInitials,
        instruction: instructionRef || 'N/A',
        timestamp: new Date().toLocaleString(),
        formSummary: {
          feeEarner: selectedFeeEarner,
          partner: supervisingPartner,
          originating: originatingSolicitor,
          areaOfWork: selectedAreaOfWork,
          practiceArea,
          clientType,
          clientName: clientDisplayName,
        },
        processingSteps: processingSteps.map(s => ({ label: s.label, status: s.status, message: s.message })),
        url: window.location.href,
      };
      const html = `<h2>Matter Opening ${failureSummary ? 'Issue' : 'Feedback'} (CompactWizard)</h2><pre>${JSON.stringify(report, null, 2)}</pre>`;
      const resp = await fetch('/api/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'lz@helix-law.com',
          subject: `Matter Opening ${failureSummary ? 'Issue' : 'Feedback'} (Compact) - ${userInitials}`,
          html,
          from_email: 'automations@helix-law.com',
        }),
      });
      if (resp.ok) {
        setReportDelivered(true);
        showToast({ type: 'success', title: 'Report Sent', message: 'Diagnostic report delivered to development team.' });
      } else {
        showToast({ type: 'error', title: 'Report Failed', message: 'Could not send report.' });
      }
    } catch {
      showToast({ type: 'error', title: 'Report Failed', message: 'Network error sending report.' });
    } finally {
      setReportSending(false);
    }
  }, [reportDelivered, reportSending, failureSummary, userInitials, instructionRef, selectedFeeEarner, supervisingPartner, originatingSolicitor, selectedAreaOfWork, practiceArea, clientType, clientDisplayName, processingSteps, showToast]);

  /* ---- required field state ---- */
  const requiredState = useMemo(() => ({
    feeEarner: Boolean(selectedFeeEarner),
    supervisingPartner: Boolean(supervisingPartner),
    originatingSolicitor: Boolean(originatingSolicitor),
    areaOfWork: Boolean(selectedAreaOfWork),
    practiceArea: Boolean(practiceArea),
    conflictCheck: Boolean(noConflict),
  }), [selectedFeeEarner, supervisingPartner, originatingSolicitor, selectedAreaOfWork, practiceArea, noConflict]);

  const missingRequiredLabels = useMemo(() => {
    return [
      { key: 'feeEarner', label: 'Fee Earner' },
      { key: 'supervisingPartner', label: 'Supervising Partner' },
      { key: 'originatingSolicitor', label: 'Originating Solicitor' },
      { key: 'areaOfWork', label: 'Area of Work' },
      { key: 'practiceArea', label: 'Practice Area' },
      { key: 'conflictCheck', label: 'Conflict Check' },
    ]
      .filter(item => !requiredState[item.key as keyof typeof requiredState])
      .map(item => item.label);
  }, [requiredState]);

  /* ---- form validity ---- */
  const isFormComplete = useMemo(() => {
    return Object.values(requiredState).every(Boolean);
  }, [requiredState]);

  const teamSectionComplete = requiredState.feeEarner && requiredState.supervisingPartner && requiredState.originatingSolicitor;
  const matterSectionComplete = requiredState.areaOfWork && requiredState.practiceArea;
  const hasOpponentOrSolicitorDetails = Boolean(
    opponentFirst || opponentLast || opponentCompanyName || opponentCompanyNumber ||
    opponentEmail || opponentPhone || opponentHouseNumber || opponentStreet || opponentCity || opponentCounty || opponentPostcode || opponentCountry ||
    solicitorFirst || solicitorLast || solicitorEmail || solicitorPhone || solicitorCompany || solicitorHouseNumber || solicitorStreet || solicitorCity || solicitorCounty || solicitorPostcode || solicitorCountry
  );
  const opponentSectionComplete = hasOpponentOrSolicitorDetails || !showOpponent;
  const conflictSectionComplete = requiredState.conflictCheck;

  /* ---- build formData for processing pipeline ---- */
  const buildFormData = useCallback((): MatterOpeningPayload => {
    const feeEarnerInitials = teamData ? getInitialsFromName(selectedFeeEarner, teamData) : '';
    const feeEarnerEmail = (() => {
      if (!teamData) return '';
      const match = teamData.find((t: any) => (t?.Initials || '').toUpperCase() === feeEarnerInitials.toUpperCase());
      return match?.Email || '';
    })();
    const originatingInitials = teamData ? getInitialsFromName(originatingSolicitor, teamData) : '';

    const idVerifications = inst?.idVerifications || (eid ? [eid] : []);
    const leadVerif = idVerifications.find((v: any) => v.IsLeadClient) || idVerifications[0] || null;
    const mainClientVerification = Array.isArray(poidData)
      ? (poidData.find((p: any) => String(p?.poid_id || '') === String(mainClientId || '')) || poidData[0] || null)
      : null;

    const resolvedVerification = {
      checkResult:
        leadVerif?.EIDOverallResult || leadVerif?.check_result ||
        mainClientVerification?.check_result || mainClientVerification?.EIDOverallResult ||
        eid?.EIDOverallResult || inst?.EIDOverallResult || inst?.EID_Result || null,
      pepResult:
        leadVerif?.PEPAndSanctionsCheckResult || leadVerif?.PEPResult || leadVerif?.pep_sanctions_result ||
        mainClientVerification?.pep_sanctions_result || mainClientVerification?.PEPAndSanctionsCheckResult || mainClientVerification?.PEPResult ||
        eid?.PEPAndSanctionsCheckResult || eid?.PEPResult || inst?.PEPAndSanctionsCheckResult || inst?.PEPResult || null,
      addressResult:
        leadVerif?.AddressVerificationResult || leadVerif?.AddressVerification || leadVerif?.address_verification_result ||
        mainClientVerification?.address_verification_result || mainClientVerification?.AddressVerificationResult || mainClientVerification?.AddressVerification ||
        eid?.AddressVerificationResult || eid?.AddressVerification || inst?.AddressVerificationResult || inst?.AddressVerification || null,
      checkExpiry:
        leadVerif?.CheckExpiry || leadVerif?.check_expiry ||
        mainClientVerification?.check_expiry || mainClientVerification?.CheckExpiry ||
        eid?.CheckExpiry || inst?.CheckExpiry || inst?.check_expiry || null,
      checkId:
        leadVerif?.EIDCheckId || leadVerif?.check_id ||
        mainClientVerification?.check_id || mainClientVerification?.EIDCheckId ||
        eid?.EIDCheckId || inst?.EIDCheckId || inst?.check_id || null,
      status:
        leadVerif?.EIDStatus || leadVerif?.eid_status ||
        mainClientVerification?.eid_status || mainClientVerification?.EIDStatus ||
        eid?.EIDStatus || inst?.EIDStatus || null,
    };

    // Build client info from instruction data
    const clientInfo = [{
      poid_id: mainClientId || inst?.ProspectId?.toString() || inst?.ClientId?.toString() || 'inline-client',
      first_name: inst?.FirstName || inst?.Forename || '',
      last_name: inst?.LastName || inst?.Surname || '',
      email: inst?.Email || inst?.ClientEmail || '',
      best_number: inst?.Phone || inst?.phone || '',
      type: payloadClientType === 'Company' ? 'company' : 'individual',
      nationality: eid?.Nationality || inst?.Nationality || null,
      date_of_birth: eid?.DOB || inst?.DOB || inst?.DateOfBirth || null,
      address: {
        house_number: eid?.HouseNumber || inst?.HouseNumber || null,
        street: eid?.Street || inst?.Street || null,
        city: eid?.City || inst?.City || null,
        county: eid?.County || inst?.County || null,
        post_code: eid?.Postcode || inst?.Postcode || inst?.PostCode || null,
        country: eid?.Country || inst?.Country || null,
      },
      company_details: (initialCompanyName || inst?.CompanyName || inst?.company_name) ? {
        name: initialCompanyName || inst?.CompanyName || inst?.company_name || null,
        number: inst?.CompanyNumber || inst?.company_number || null,
        relationship: initialCompanyRelationship || 'Director',
        address: {
          house_number: inst?.CompanyHouseNumber || null,
          street: inst?.CompanyStreet || null,
          city: inst?.CompanyCity || null,
          county: inst?.CompanyCounty || null,
          post_code: inst?.CompanyPostcode || null,
          country: inst?.CompanyCountry || null,
        },
      } : null,
      verification: {
        stage: eid?.stage || null,
        check_result: resolvedVerification.checkResult,
        pep_sanctions_result: resolvedVerification.pepResult,
        address_verification_result: resolvedVerification.addressResult,
        check_expiry: resolvedVerification.checkExpiry,
        check_id: resolvedVerification.checkId,
      },
    }];

    // Build instruction summary for fee earner confirmation email
    const riskAssessments = inst?.riskAssessments || (risk ? [risk] : []);
    const latestRisk = riskAssessments[0] || null;
    const successfulPayment = payments.find((p: any) => p.payment_status === 'succeeded' || p.internal_status === 'completed') || payments[0] || null;

    return buildMatterOpeningPayload({
      entryPoint: 'compact',
      matterDetails: {
        instruction_ref: instructionRef || null,
        client_id: mainClientId || inst?.ProspectId?.toString() || inst?.ClientId?.toString() || null,
        matter_ref: null,
        stage: inst?.Stage || inst?.stage || 'New Matter',
        date_created: new Date().toISOString().split('T')[0],
        client_type: payloadClientType,
        area_of_work: selectedAreaOfWork,
        practice_area: practiceArea,
        description: description || String(inst?.ServiceDescription || deal?.ServiceDescription || '').trim(),
        client_as_on_file: clientDisplayName,
        main_client_name: mainClientName || null,
        main_client_is_company: typeof mainClientIsCompany === 'boolean' ? mainClientIsCompany : null,
        dispute_value: disputeValue || null,
        folder_structure: `Default / ${selectedAreaOfWork}`,
        budget_required: 'No',
        budget_amount: null,
        budget_notify_threshold: null,
        budget_notify_users: [],
      },
      teamAssignments: {
        fee_earner: selectedFeeEarner,
        supervising_partner: supervisingPartner,
        originating_solicitor: originatingSolicitor,
        requesting_user: currentUser?.FullName || selectedFeeEarner,
        fee_earner_initials: feeEarnerInitials,
        fee_earner_email: feeEarnerEmail,
        originating_solicitor_initials: originatingInitials,
      },
      clientInformation: clientInfo.map((client, index) => ({
        ...client,
        client_role: index === 0 ? 'primary_client' : 'joint_client',
        participant_source: 'instruction',
        display_name: [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || client.company_details?.name || client.email || null,
        is_primary: index === 0,
      })),
      sourceDetails: {
        source: source || 'uncertain',
        referrer_name: null,
      },
      opponentDetails: (opponentFirst || opponentLast || opponentCompanyName) ? {
        opponent: {
          title: opponentTitle || null,
          first_name: opponentFirst || null,
          last_name: opponentLast || null,
          is_company: opponentType === 'Company',
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
            country: opponentCountry || null,
          },
        },
        solicitor: (solicitorFirst || solicitorLast || solicitorCompany) ? {
          title: null, first_name: solicitorFirst || null, last_name: solicitorLast || null,
          company_name: solicitorCompany || null, company_number: null,
          email: solicitorEmail || null, phone: solicitorPhone || null,
          address: {
            house_number: solicitorHouseNumber || null,
            street: solicitorStreet || null,
            city: solicitorCity || null,
            county: solicitorCounty || null,
            post_code: solicitorPostcode || null,
            country: solicitorCountry || null,
          },
        } : {
          title: null, first_name: null, last_name: null, company_name: null, company_number: null,
          email: null, phone: null,
          address: { house_number: null, street: null, city: null, county: null, post_code: null, country: null },
        },
      } : null,
      compliance: {
        conflict_check_completed: noConflict,
        id_verification_required: true,
        pep_sanctions_check_required: true,
      },
      metadata: {
        created_by: userInitials,
        created_at: new Date().toISOString(),
        form_version: '2.0-compact',
        processing_status: 'pending_review',
      },
      instructionSummary: {
        payment_result: successfulPayment?.payment_status === 'succeeded' ? 'Paid' : (inst?.InternalStatus === 'paid' ? 'Paid' : null),
        payment_amount: successfulPayment?.amount || inst?.PaymentAmount || null,
        payment_timestamp: successfulPayment?.created_at || inst?.PaymentTimestamp || null,
        eid_overall_result: resolvedVerification.checkResult,
        eid_check_id: resolvedVerification.checkId,
        eid_status: resolvedVerification.status,
        pep_sanctions_result: resolvedVerification.pepResult,
        address_verification_result: resolvedVerification.addressResult,
        risk_assessment: latestRisk ? {
          result: latestRisk.RiskAssessmentResult || null,
          score: latestRisk.RiskScore || null,
          assessor: latestRisk.RiskAssessor || null,
          compliance_date: latestRisk.ComplianceDate || null,
          transaction_risk_level: latestRisk.TransactionRiskLevel || null,
        } : null,
        document_count: Array.isArray(documents) ? documents.length : 0,
        documents: Array.isArray(documents) ? documents.map((doc: any) => ({
          file_name: doc.FileName || doc.filename || doc.name || null,
          file_size_bytes: doc.FileSizeBytes || doc.filesize || doc.size || null,
          document_type: doc.DocumentType || doc.type || null,
          uploaded_at: doc.UploadedAt || doc.uploadedAt || null,
        })) : [],
        deal_id: deal?.DealId || deal?.dealId || null,
        service_description: inst?.ServiceDescription || deal?.ServiceDescription || null,
      },
    });
  }, [
    inst, deal, eid, poidData, risk, payments, documents, teamData, userInitials,
    instructionRef, payloadClientType, clientDisplayName, selectedAreaOfWork,
    practiceArea, description, disputeValue, source, noConflict,
    selectedFeeEarner, supervisingPartner, originatingSolicitor,
    initialCompanyName, mainClientId, mainClientName, mainClientIsCompany,
    currentUser, opponentType, opponentTitle, opponentFirst, opponentLast,
    opponentEmail, opponentPhone, opponentHouseNumber, opponentStreet,
    opponentCity, opponentCounty, opponentPostcode, opponentCountry,
    opponentCompanyName, opponentCompanyNumber,
    solicitorFirst, solicitorLast, solicitorEmail, solicitorPhone, solicitorCompany,
  ]);

  /* ---- show confirmation before processing ---- */
  const handleRequestSubmit = useCallback(() => {
    if (!isFormComplete) return;
    setConfirmAcknowledge(false);
    setWizardMode('confirm');
  }, [isFormComplete]);

  /* ---- processing ---- */
  const handleSubmit = useCallback(async () => {
    if (!isFormComplete) return;
    const formData = buildFormData() as MatterOpeningPayload;
    const matterDetails = formData.matter_details as Record<string, any>;
    const clientInformation = formData.client_information as Array<Record<string, any>>;
    const opponentDetails = (formData.opponent_details || {}) as Record<string, any>;
    const teamAssignments = formData.team_assignments as Record<string, any>;
    const validation = validateMatterOpeningPayload(formData);
    if (!validation.isValid) {
      showToast({ type: 'error', title: 'Complete Required Details', message: validation.suggestions[0] || 'This matter entry still has blocking issues.' });
      return;
    }

    // ─── Demo mode: simulate all steps, fire real CCL endpoints ───
    if (demoModeEnabled) {
      resetMatterTraceId();
      setWizardMode('processing');
      setProcessingSteps(initialSteps);
      setProcessingLogs([]);
      setFailureSummary('');
      setReportDelivered(false);
      autoReportSentRef.current = null;
      setCurrentStepIdx(0);

      showToast({ type: 'loading', title: 'Opening Matter (Demo)', message: 'Simulating matter opening...', persist: true, id: 'compact-matter-processing' });
      reportTelemetry('Processing.Started', { feeEarner: selectedFeeEarner, areaOfWork: selectedAreaOfWork, practiceArea, demo: 'true' });

      const total = initialSteps.length;
      // Use the app-internal demo matter ID (matches DEMO_MATTER.matterId in Matters.tsx)
      const demoMatterId = 'DEMO-3311402';

      for (let i = 0; i < total; i++) {
        setCurrentActionIndex(i);
        setCurrentStepIdx(i);
        await new Promise(r => setTimeout(r, 120 + Math.random() * 180));

        // Last 2 steps are CCL context preview + draft service run — fire real endpoints against demo data
        if (i === total - 2 && initialSteps[i].label === 'CCL Context Assembled') {
          try {
            const cclPayload = {
              matterId: demoMatterId,
              instructionRef: instructionRef || 'HELIX01-01',
              practiceArea: resolveMatterPracticeArea(
                matterDetails.area_of_work,
                matterDetails.practice_area,
              ),
              description: matterDetails.description || 'Contract Dispute',
              clientName: (() => {
                const c = clientInformation[0];
                return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : 'Demo Client';
              })(),
              opponent: opponentDetails.opponent?.first_name
                ? `${opponentDetails.opponent.first_name} ${opponentDetails.opponent.last_name || ''}`.trim()
                : '',
              handlerName: teamAssignments.fee_earner || '',
            };
            const resp = await fetch('/api/ccl-ai/context-preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cclPayload),
            });
            const payload = resp.ok ? await resp.clone().json() : null;
            const sourceCount = Array.isArray(payload?.dataSources) ? payload.dataSources.length : 0;
            const msg = resp.ok
              ? `Context assembled — ${sourceCount} source${sourceCount === 1 ? '' : 's'} (real)`
              : 'Context preview skipped';
            setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message: msg } : s));
            setProcessingLogs(prev => [...prev, `✓ ${msg}`]);
          } catch (err) {
            setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message: 'Context preview skipped (non-blocking)' } : s));
            setProcessingLogs(prev => [...prev, `✓ CCL context preview skipped — ${err instanceof Error ? err.message : 'error'}`]);
          }
        } else if (i === total - 1 && initialSteps[i].label === 'CCL Service Generated') {
          try {
            const resp = await fetch('/api/ccl/service/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                matterId: demoMatterId,
                draftJson: formData,
                instructionRef: instructionRef || 'HELIX01-01',
                practiceArea: resolveMatterPracticeArea(
                  matterDetails.area_of_work,
                  matterDetails.practice_area,
                ),
                description: matterDetails.description || 'Contract Dispute',
                clientName: (() => {
                  const c = clientInformation[0];
                  return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : 'Demo Client';
                })(),
                opponent: opponentDetails.opponent?.first_name
                  ? `${opponentDetails.opponent.first_name} ${opponentDetails.opponent.last_name || ''}`.trim()
                  : '',
                handlerName: teamAssignments.fee_earner || '',
                stage: 'demo-matter-opening',
              }),
            });
            const payload = resp.ok ? await resp.clone().json() : null;
            const msg = resp.ok ? `CCL service generated · ${(payload?.preview?.dataSources || []).length} sources (real)` : 'CCL service skipped';
            setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message: msg } : s));
            setProcessingLogs(prev => [...prev, `✓ ${msg}`]);
          } catch (err) {
            setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message: 'CCL service skipped (non-blocking)' } : s));
            setProcessingLogs(prev => [...prev, `✓ CCL service skipped — ${err instanceof Error ? err.message : 'error'}`]);
          }
        } else {
          // Simulate success for all other steps
          setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message: 'OK' } : s));
          setProcessingLogs(prev => [...prev, `✓ ${initialSteps[i].label}: Done`]);
        }
      }

      // Set demo matter references — matterId matches DEMO_MATTER so pendingMatterId auto-select works
      matterId.current = demoMatterId;
      matterDisplayNum.current = 'HELIX01-01';
      primaryClioContactId.current = '5257922';

      hideToast('compact-matter-processing');
      showToast({ type: 'success', title: 'Matter Opened (Demo)', message: 'Demo processing completed — CCL draft saved.' });
      reportTelemetry('Processing.Completed', { demo: 'true', matterId: demoMatterId, displayNumber: 'HELIX01-01' });
      setWizardMode('success');
      return;
    }

    // Resolve userData — mirrors FlatMatterOpening.simulateProcessing
    let workingUserData = userData;
    let teamMember = findOperatorTeamMember() || findTeamMemberByInitials(resolvedProcessingInitials);

    // Step 1: If no userData yet, try API fetch via Entra ID
    if ((!workingUserData || workingUserData.length === 0) && teamMember) {
      const entraId = teamMember['Entra ID'] || teamMember.EntraID;
      if (entraId) {
        const fallbackData = await fetchUserDataFallback(String(entraId));
        if (fallbackData && fallbackData.length > 0) {
          workingUserData = fallbackData;
        }
      }
    }

    // Step 2: Build minimal profile from teamData as last resort (profile fields only)
    if ((!workingUserData || workingUserData.length === 0) && teamMember) {
      workingUserData = [buildMinimalUserData(teamMember, resolvedProcessingInitials)];
    }

    if (!workingUserData || workingUserData.length === 0) {
      reportTelemetry('PreValidation.Failed', { error: 'Profile missing', phase: 'userDataCheck' });
      showToast({ type: 'error', title: 'Profile Missing', message: 'Could not resolve user profile. Please try the full wizard.' });
      return;
    }

    teamMember = teamMember || findOperatorTeamMember() || findTeamMemberByInitials(resolvedProcessingInitials);

    // Step 3: Validate Asana credentials — if missing, re-fetch from API
    // teamData does NOT carry ASANA columns, so buildMinimalUserData will have empty strings.
    // The /api/user-data endpoint explicitly queries ASANAClient_ID, ASANASecret, ASANARefreshToken.
    if (!workingUserData[0]?.ASANASecret && !workingUserData[0]?.ASANA_Secret) {
      // Resolve team member for Entra ID if we haven't already
      const tm = teamMember || findOperatorTeamMember() || findTeamMemberByInitials(resolvedProcessingInitials);
      const entraId = tm?.['Entra ID'] || tm?.EntraID;
      if (entraId) {
        console.log('[CompactMatterWizard] ASANA credentials missing from cached userData, retrying API fetch...');
        const freshData = await fetchUserDataFallback(String(entraId));
        if (freshData && freshData.length > 0 && (freshData[0].ASANASecret || freshData[0].ASANA_Secret)) {
          workingUserData = freshData;
        }
      }
    }

    if (!workingUserData[0]?.ASANASecret && !workingUserData[0]?.ASANA_Secret) {
      reportTelemetry('PreValidation.Failed', { error: 'Asana credentials missing', phase: 'credentialCheck', hasTeamMember: !!teamMember, hasEntraId: !!(teamMember?.['Entra ID'] || teamMember?.EntraID) });
      showToast({ type: 'error', title: 'Credentials Missing', message: 'Asana credentials not found. Please contact support.' });
      return;
    }

    resetMatterTraceId();
    setWizardMode('processing');
    setProcessingSteps(initialSteps);
    setProcessingLogs([]);
    setFailureSummary('');
    setReportDelivered(false);
    autoReportSentRef.current = null;
    setCurrentStepIdx(0);

    showToast({ type: 'loading', title: 'Opening Matter', message: 'Processing your matter — this may take a moment.', persist: true, id: 'compact-matter-processing' });
    reportTelemetry('Processing.Started', { feeEarner: selectedFeeEarner, areaOfWork: selectedAreaOfWork, practiceArea });

    const startTime = Date.now();
    try {
      registerClientIdCallback((id) => {
        primaryClioContactId.current = id;
      });
      registerMatterIdCallback((id) => { matterId.current = id; });
      registerOperationObserver(() => { /* silent */ });

      for (let i = 0; i < processingActions.length; i++) {
        const action = processingActions[i];
        setCurrentActionIndex(i);
        setCurrentStepIdx(i);
        const result = await action.run(formData, userInitials, workingUserData);
        const message = typeof result === 'string' ? result : result.message;
        setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message } : s));
        setProcessingLogs(prev => [...prev, `✓ ${message}`]);
      }

      const durationMs = Date.now() - startTime;
      matterDisplayNum.current = getMatterDisplayNumber();
      hideToast('compact-matter-processing');
      reportTelemetry('Processing.Completed', { durationMs, matterId: matterId.current || 'unknown', displayNumber: matterDisplayNum.current || undefined });

      // Show success confirmation in wizard before transitioning
      setWizardMode('success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      let failingIndex = -1;
      setProcessingSteps(prev => {
        const idx = prev.findIndex(ps => ps.status === 'pending');
        failingIndex = idx === -1 ? prev.length - 1 : idx;
        return prev.map((s, i) => i === failingIndex ? { ...s, status: 'error', message: msg } : s);
      });
      const failingLabel = processingActions[failingIndex]?.label || 'Unknown step';
      setFailureSummary(`Failed at: ${failingLabel} — ${msg}`);
      setProcessingLogs(prev => [...prev, `✗ ${failingLabel}: ${msg}`]);
      hideToast('compact-matter-processing');
      showToast({ type: 'error', title: 'Processing Failed', message: `Failed at: ${failingLabel}` });
      reportTelemetry('Processing.Failed', { error: msg, failingStep: failingLabel, durationMs: Date.now() - startTime });
      setWizardMode('error');
    } finally {
      registerClientIdCallback(null);
      registerMatterIdCallback(null);
      registerOperationObserver(null);
    }
  }, [
    isFormComplete,
    demoModeEnabled,
    userData,
    resolvedProcessingInitials,
    findOperatorTeamMember,
    findTeamMemberByInitials,
    fetchUserDataFallback,
    buildFormData,
    instructionRef,
    showToast,
    hideToast,
    reportTelemetry,
    selectedFeeEarner,
    selectedAreaOfWork,
    practiceArea,
  ]);

  /* ---- styles ---- */
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px',
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    marginBottom: 6,
  };
  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
    background: isDarkMode ? 'rgba(2, 6, 23, 0.6)' : '#FFFFFF',
    color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733',
    border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(0, 0, 0, 0.1)'}`,
    borderRadius: 0, outline: 'none', cursor: 'pointer',
    appearance: 'none' as const, WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='${isDarkMode ? '%23A0A0A0' : '%236B6B6B'}'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
  };
  const inputStyle: React.CSSProperties = {
    ...selectStyle, cursor: 'text',
    backgroundImage: 'none', paddingRight: 10,
  };
  const sectionStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
    border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
    borderRadius: 0, padding: '12px 14px',
  };
  const chipActive = (active: boolean): React.CSSProperties => ({
    padding: '7px 12px', fontSize: 11, fontWeight: active ? 700 : 500,
    border: `1px solid ${active ? colours.highlight : (isDarkMode ? 'rgba(75, 85, 99, 0.35)' : '#CBD5E1')}`,
    borderRadius: 0, cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? (isDarkMode ? `${colours.highlight}18` : `${colours.highlight}10`) : (isDarkMode ? 'rgba(17, 24, 39, 0.8)' : '#F8FAFC'),
    color: active ? colours.highlight : (isDarkMode ? colours.subtleGrey : '#475569'),
    transition: 'border-color 0.15s, background 0.15s',
  });

  const aowColors: Record<string, string> = { Commercial: colours.blue, Property: colours.green, Construction: colours.orange, Employment: colours.yellow };

  /* ---- render: confirm mode ---- */
  if (wizardMode === 'confirm') {
    const clientEmail = inst?.Email || inst?.ClientEmail || '';
    const clientPhone = inst?.Phone || inst?.phone || '';
    const clientAddress = (() => {
      const parts = [
        eid?.HouseNumber || inst?.HouseNumber,
        eid?.Street || inst?.Street,
        eid?.City || inst?.City,
        eid?.Postcode || inst?.Postcode || inst?.PostCode,
      ].filter(Boolean);
      return parts.join(', ');
    })();
    const companyName = initialCompanyName || inst?.CompanyName || inst?.company_name || '';
    const eidResult = eid?.EIDOverallResult || inst?.EIDOverallResult || '';
    const riskResult = risk?.RiskAssessmentResult || risk?.riskAssessmentResult || '';

    const reviewLabel = (text: string) => ({
      fontSize: 9, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: 0.6,
      color: isDarkMode ? colours.subtleGrey : colours.greyText, marginBottom: 2,
    });
    const reviewValue = {
      fontSize: 11,
      fontWeight: 600,
      color: isDarkMode ? 'rgba(243, 244, 246, 0.92)' : '#1f2937',
      lineHeight: 1.4,
      wordBreak: 'break-word' as const,
    };
    const reviewRow = (icon: React.ReactNode, text: string) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ flexShrink: 0, marginTop: 1, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{icon}</span>
        <span style={reviewValue}>{text || '—'}</span>
      </div>
    );

    return (
      <div ref={wizardSurfaceRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header */}
        <div style={{ ...sectionStyle, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 0,
              background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon iconName="Shield" style={{ fontSize: 12, color: colours.highlight }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? 'rgba(243, 244, 246, 0.95)' : '#061733' }}>
              Confirm Details
            </span>
          </div>
        </div>

        {/* Two-column: Client + Matter */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 8,
        }}>
          {/* ── Client Box ── */}
          <div style={{ ...sectionStyle, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              {clientType === 'Company'
                ? <FaBuilding size={10} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
                : <FaUser size={10} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />}
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: isDarkMode ? colours.accent : colours.highlight }}>
                Client
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? 'rgba(243, 244, 246, 0.95)' : '#061733', lineHeight: 1.3 }}>
              {clientDisplayName}
            </div>
            {clientType === 'Company' && companyName && (
              <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                {companyName}
              </div>
            )}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2,
              padding: '6px 0 0',
              borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(0,0,0,0.05)'}`,
            }}>
              {reviewRow(<FaEnvelope size={9} />, clientEmail)}
              {reviewRow(<FaPhone size={9} />, clientPhone)}
              {clientAddress && reviewRow(<FaMapMarkerAlt size={9} />, clientAddress)}
            </div>
            {/* Compliance badges */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2,
            }}>
              {eidResult && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 6px',
                  background: /pass/i.test(eidResult)
                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.1)' : 'rgba(32, 178, 108, 0.06)')
                    : (isDarkMode ? 'rgba(255, 140, 0, 0.1)' : 'rgba(255, 140, 0, 0.06)'),
                  color: /pass/i.test(eidResult) ? colours.green : colours.orange,
                  border: `1px solid ${/pass/i.test(eidResult) ? 'rgba(32, 178, 108, 0.2)' : 'rgba(255, 140, 0, 0.2)'}`,
                  borderRadius: 0,
                }}>
                  eID: {eidResult}
                </span>
              )}
              {riskResult && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 6px',
                  background: /low/i.test(riskResult)
                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.1)' : 'rgba(32, 178, 108, 0.06)')
                    : /medium/i.test(riskResult)
                      ? (isDarkMode ? 'rgba(255, 140, 0, 0.1)' : 'rgba(255, 140, 0, 0.06)')
                      : (isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.06)'),
                  color: /low/i.test(riskResult) ? colours.green : /medium/i.test(riskResult) ? colours.orange : colours.cta,
                  border: `1px solid ${/low/i.test(riskResult) ? 'rgba(32, 178, 108, 0.2)' : /medium/i.test(riskResult) ? 'rgba(255, 140, 0, 0.2)' : 'rgba(214, 85, 65, 0.2)'}`,
                  borderRadius: 0,
                }}>
                  Risk: {riskResult}
                </span>
              )}
              {hasPayment && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 6px',
                  background: isDarkMode ? 'rgba(32, 178, 108, 0.1)' : 'rgba(32, 178, 108, 0.06)',
                  color: colours.green,
                  border: '1px solid rgba(32, 178, 108, 0.2)',
                  borderRadius: 0,
                }}>
                  Paid
                </span>
              )}
            </div>
          </div>

          {/* ── Matter Box ── */}
          <div style={{ ...sectionStyle, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <FaFolderOpen size={10} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: isDarkMode ? colours.accent : colours.highlight }}>
                Matter
              </span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px',
              background: isDarkMode ? 'rgba(6, 23, 51, 0.6)' : 'rgba(54, 144, 206, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.1)'}`,
              borderRadius: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colours.highlight, fontFamily: 'monospace' }}>
                {matterRefPreview}
              </span>
            </div>
            <div style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.4 }}>
              {description.slice(0, 80)}{description.length > 80 ? '…' : ''}
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 2,
              padding: '6px 0 0',
              borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(0,0,0,0.05)'}`,
            }}>
              {[
                { label: 'Area', value: selectedAreaOfWork },
                { label: 'Practice', value: practiceArea },
                { label: 'Fee Earner', value: selectedFeeEarner },
                { label: 'Partner', value: supervisingPartner },
                { label: 'Originator', value: originatingSolicitor },
                { label: 'Source', value: source || '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={reviewLabel(label)}>{label}</div>
                  <div style={reviewValue}>{value || '—'}</div>
                </div>
              ))}
            </div>
            {disputeValue && (
              <div style={{ marginTop: 2 }}>
                <div style={reviewLabel('Value')}>Dispute Value</div>
                <div style={reviewValue}>{/^£/.test(disputeValue) ? disputeValue : `£${disputeValue}`}</div>
              </div>
            )}
          </div>
        </div>

        {/* Final acknowledge checkbox */}
        <div style={{ ...sectionStyle, padding: '10px 12px' }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            padding: '6px 8px',
            background: confirmAcknowledge
              ? (isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.04)')
              : 'transparent',
            border: `1px solid ${confirmAcknowledge
              ? (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)')
              : (isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(0,0,0,0.08)')}`,
            borderRadius: 0,
            transition: 'all 0.15s ease',
          }}>
            <input
              type="checkbox"
              checked={confirmAcknowledge}
              onChange={e => setConfirmAcknowledge(e.target.checked)}
              style={{ marginTop: 2, accentColor: colours.green, width: 14, height: 14, flexShrink: 0 }}
            />
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, lineHeight: 1.5,
                color: confirmAcknowledge ? colours.green : (isDarkMode ? '#d1d5db' : '#374151'),
              }}>
                I confirm all details are correct and ready to open
              </div>
              <div style={{
                marginTop: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                borderRadius: 0,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.22)'}`,
              }}>
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.45px',
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                }}>
                  Matter Display Number
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: colours.highlight,
                }}>
                  {matterRefPreview}
                </span>
              </div>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setWizardMode('form'); setConfirmAcknowledge(false); }}
            style={{
              flex: 1, padding: '9px 0', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              background: 'none', border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.4)' : '#CBD5E1'}`,
              borderRadius: 0, color: isDarkMode ? '#d1d5db' : '#374151', cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!confirmAcknowledge}
            style={{
              flex: 2, padding: '9px 0', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              background: confirmAcknowledge ? colours.highlight : (isDarkMode ? 'rgba(6, 23, 51, 0.6)' : colours.grey),
              border: 'none', borderRadius: 0,
              color: confirmAcknowledge ? '#FFFFFF' : (isDarkMode ? colours.subtleGrey : colours.greyText),
              cursor: confirmAcknowledge ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <FaFolder size={11} /> Open Matter
          </button>
        </div>
      </div>
    );
  }

  /* ---- render: success mode ---- */
  if (wizardMode === 'success') {
    // For demo mode, extract the real Clio ID from the app-internal ID (DEMO-3311402 → 3311402)
    const clioMatterId = demoModeEnabled && matterId.current?.startsWith('DEMO-')
      ? matterId.current.replace('DEMO-', '')
      : matterId.current;
    const clioMatterUrl = clioMatterId ? `https://eu.app.clio.com/nc/#/matters/${encodeURIComponent(clioMatterId)}` : null;
    const clioContactUrl = primaryClioContactId.current ? `https://eu.app.clio.com/nc/#/contacts/${encodeURIComponent(primaryClioContactId.current)}` : null;
    const continueToMatterView = () => {
      // Dispatch navigation event so App.tsx switches to the Matters tab with auto-select
      window.dispatchEvent(new CustomEvent('navigateToMatter', {
        detail: { matterId: matterId.current || undefined }
      }));
      if (matterId.current) {
        onMatterSuccess(matterId.current);
      } else {
        onMatterSuccess('inline');
      }
      if (onCancel) onCancel();
    };
    const closeSuccessView = () => {
      if (onCancel) onCancel();
    };
    return (
      <div ref={wizardSurfaceRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          ...sectionStyle, padding: '14px 14px',
          borderLeft: `2px solid ${colours.green}`,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaCheckCircle size={18} style={{ color: colours.green }} />
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: isDarkMode ? 'rgba(243, 244, 246, 0.95)' : '#061733',
            }}>
              Matter Opened Successfully
            </div>
          </div>

          {(matterDisplayNum.current || matterId.current) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 10,
              rowGap: 4,
              padding: '7px 10px',
              background: isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)'}`,
              borderRadius: 0,
            }}>
              {matterDisplayNum.current && (
                <>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.45px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    Matter Ref
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: colours.green }}>
                    {matterDisplayNum.current}
                  </span>
                </>
              )}
              {matterId.current && (
                <>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.45px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    Clio Matter ID
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? '#d1d5db' : '#374151' }}>
                    {matterId.current}
                  </span>
                </>
              )}
              {primaryClioContactId.current && (
                <>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.45px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    Primary Contact ID
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: isDarkMode ? '#d1d5db' : '#374151' }}>
                    {primaryClioContactId.current}
                  </span>
                </>
              )}
            </div>
          )}

          <div style={{
            fontSize: 10,
            color: isDarkMode ? colours.subtleGrey : colours.greyText,
            lineHeight: 1.45,
          }}>
            Matter opening has completed. Continue or close to return to the updated Matter tab view.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {clioMatterUrl && (
              <button
                type="button"
                onClick={() => window.open(clioMatterUrl, '_blank', 'noopener,noreferrer')}
                style={{
                  padding: '7px 10px',
                  borderRadius: 0,
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.22)'}`,
                  background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                  color: colours.highlight,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Open Matter in Clio
              </button>
            )}
            {clioContactUrl && (
              <button
                type="button"
                onClick={() => window.open(clioContactUrl, '_blank', 'noopener,noreferrer')}
                style={{
                  padding: '7px 10px',
                  borderRadius: 0,
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.22)'}`,
                  background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                  color: colours.highlight,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Open Contact in Clio
              </button>
            )}
          </div>

          {/* Demo CCL draft indicator */}
          {demoModeEnabled && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.05)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.18)' : 'rgba(54, 144, 206, 0.15)'}`,
              borderRadius: 0,
            }}>
              <FaFileAlt size={12} style={{ color: isDarkMode ? colours.accent : colours.highlight, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight }}>
                  CCL Draft Auto-Generated
                </div>
                <div style={{ fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText, marginTop: 1 }}>
                  Navigate to the Matter record to review and refine the Client Care Letter.
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={closeSuccessView}
            style={{
              width: 'auto',
              minWidth: 100,
              padding: '9px 14px',
              background: isDarkMode ? 'rgba(2, 6, 23, 0.45)' : '#FFFFFF',
              border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(6, 23, 51, 0.12)'}`,
              borderRadius: 0,
              fontSize: 11,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={continueToMatterView}
            style={{
              width: 'auto',
              minWidth: 190,
              padding: '10px 16px',
              background: colours.green,
              border: 'none',
              borderRadius: 0,
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <FaCheck size={10} /> Continue to Matter Record
          </button>
        </div>
      </div>
    );
  }

  /* ---- render: processing mode ---- */
  if (wizardMode === 'processing' || wizardMode === 'error') {
    const completedCount = processingSteps.filter(s => s.status === 'success').length;
    const totalCount = processingSteps.length;
    const pct = Math.round((completedCount / totalCount) * 100);
    // Group steps into phases for cleaner display
    const phases = [
      { label: 'Secure Integrations', note: 'Refreshing Clio, Asana and supporting service access.', range: [0, 9] },
      { label: 'Prepare Matter Payload', note: 'Validating data, conflicts and linked records for opening.', range: [10, 14] },
      { label: 'Open Matter in Clio', note: 'Creating the matter and linking client/contact records.', range: [15, 18] },
      { label: 'Sync and Finalise', note: 'Updating Helix records and sending notifications.', range: [19, 21] },
    ];
    const currentOperationLabel = currentStepIdx >= 0 && processingSteps[currentStepIdx]?.label
      ? processingSteps[currentStepIdx].label
      : null;

    return (
      <div ref={wizardSurfaceRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Progress header */}
        <div style={{ ...sectionStyle, padding: '14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {wizardMode === 'error' ? (
                <FaTimesCircle size={14} style={{ color: colours.cta }} />
              ) : (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${colours.highlight}`,
                  borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite',
                }} />
              )}
              <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? 'rgba(243, 244, 246, 0.95)' : '#061733' }}>
                {wizardMode === 'error' ? 'Processing Failed' : 'Opening Matter…'}
              </span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: colours.highlight }}>{pct}%</span>
          </div>

          {wizardMode !== 'error' && (
            <div style={{
              fontSize: 10,
              color: isDarkMode ? '#d1d5db' : '#374151',
              marginBottom: 8,
              lineHeight: 1.45,
            }}>
              This runs end-to-end in background services. No further action is needed while this completes.
            </div>
          )}

          {/* Progress bar */}
          <div style={{
            height: 3, borderRadius: 0, overflow: 'hidden',
            background: isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(0, 0, 0, 0.06)',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: wizardMode === 'error' ? colours.cta : colours.highlight,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Phase breakdown */}
        <div style={{ ...sectionStyle, padding: '8px 12px' }}>
          {phases.map(({ label, note, range }, pi) => {
            const phaseSteps = processingSteps.slice(range[0], range[1] + 1);
            const allDone = phaseSteps.every(s => s.status === 'success');
            const hasError = phaseSteps.some(s => s.status === 'error');
            const inProgress = !allDone && !hasError && phaseSteps.some(s => s.status === 'pending') && (pi === 0 || phases[pi - 1] && processingSteps.slice(phases[pi - 1].range[0], phases[pi - 1].range[1] + 1).every(s => s.status === 'success'));
            const isCurrent = currentStepIdx >= range[0] && currentStepIdx <= range[1];

            return (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0',
                borderBottom: pi < phases.length - 1 ? `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(0, 0, 0, 0.04)'}` : 'none',
                opacity: allDone || isCurrent || hasError ? 1 : 0.4,
                transition: 'opacity 0.3s ease',
              }}>
                {allDone ? (
                  <FaCheckCircle size={11} style={{ color: colours.green, flexShrink: 0 }} />
                ) : hasError ? (
                  <FaTimesCircle size={11} style={{ color: colours.cta, flexShrink: 0 }} />
                ) : isCurrent ? (
                  <div style={{
                    width: 11, height: 11, borderRadius: '50%',
                    border: `2px solid ${colours.highlight}`,
                    borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                    flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 11, height: 11, borderRadius: '50%',
                    border: `1.5px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(0, 0, 0, 0.12)'}`,
                    flexShrink: 0,
                  }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: isCurrent || allDone ? 700 : 500,
                    color: hasError ? colours.cta : (allDone ? colours.green : (isDarkMode ? '#d1d5db' : '#374151')),
                  }}>
                    {label}
                  </span>
                  <span style={{
                    fontSize: 9,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  }}>
                    {note}
                  </span>
                </div>
                {hasError && (
                  <span style={{ fontSize: 9, color: colours.cta, marginLeft: 'auto', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {phaseSteps.find(s => s.status === 'error')?.message || 'Error'}
                  </span>
                )}
              </div>
            );
          })}

          {wizardMode !== 'error' && currentOperationLabel && (
            <div style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(0, 0, 0, 0.04)'}`,
              fontSize: 9,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
            }}>
              Current operation: {currentOperationLabel}
            </div>
          )}
        </div>

        {/* Error recovery */}
        {wizardMode === 'error' && (
          <div style={{ ...sectionStyle, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: colours.cta, fontWeight: 600 }}>{failureSummary}</div>

            {/* Auto-report status — animated like flat opening */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px',
              background: reportDelivered
                ? (isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)')
                : (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)'),
              border: `1px solid ${reportDelivered
                ? (isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.15)')
                : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')}`,
              borderRadius: 0,
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              <div style={{
                width: 14, height: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                {reportDelivered ? (
                  <FaCheckCircle size={12} style={{
                    color: colours.green,
                    animation: 'reportSentPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }} />
                ) : (
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    border: `2px solid ${colours.highlight}`,
                    borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                )}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: reportDelivered ? colours.green : (isDarkMode ? '#d1d5db' : '#374151'),
                transition: 'color 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                {reportDelivered ? 'Diagnostic report delivered' : 'Sending diagnostic report…'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => { setWizardMode('form'); setProcessingSteps(initialSteps); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: 'none', border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.4)' : '#CBD5E1'}`,
                  borderRadius: 0, color: isDarkMode ? '#d1d5db' : '#374151', cursor: 'pointer',
                }}
              >
                Back to form
              </button>
              {/* Manual report button — animated transition like flat opening */}
              <button
                type="button"
                onClick={sendManualReport}
                disabled={reportSending || reportDelivered}
                style={{
                  padding: '7px 12px', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: reportDelivered
                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.06)')
                    : reportSending
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)')
                      : (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)'),
                  border: `1px solid ${reportDelivered
                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.2)')
                    : reportSending
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                      : (isDarkMode ? 'rgba(214, 85, 65, 0.2)' : 'rgba(214, 85, 65, 0.15)')}`,
                  borderRadius: 0,
                  color: reportDelivered ? colours.green : (reportSending ? colours.highlight : colours.cta),
                  cursor: reportDelivered ? 'default' : (reportSending ? 'wait' : 'pointer'),
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {reportDelivered ? (
                  <FaCheck size={9} style={{ animation: 'reportSentPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                ) : reportSending ? (
                  <div style={{
                    width: 9, height: 9, borderRadius: '50%',
                    border: `1.5px solid ${colours.highlight}`,
                    borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                    flexShrink: 0,
                  }} />
                ) : (
                  <FaEnvelope size={9} />
                )}
                {reportDelivered ? 'Sent' : (reportSending ? 'Sending…' : 'Report')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: colours.highlight, border: 'none', borderRadius: 0,
                  color: '#FFFFFF', cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes reportSentPop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.3); opacity: 1; } 100% { transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  /* ---- render: form mode ---- */
  return (
    <div ref={wizardSurfaceRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!skipConfirmedPreview && (
        <>
          {/* Prerequisites strip */}
          <div style={{
            ...sectionStyle, padding: '8px 12px',
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            {[
              { label: 'Client', ok: hasClient, icon: <FaUser size={9} /> },
              { label: 'Identity', ok: hasId, icon: <FaIdCard size={9} /> },
              { label: 'Payment', ok: hasPayment, icon: <FaCreditCard size={9} /> },
              { label: 'Risk', ok: hasRisk, icon: <FaShieldAlt size={9} /> },
            ].map(({ label, ok, icon }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 0,
                background: ok
                  ? (isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)')
                  : (isDarkMode ? 'rgba(214, 85, 65, 0.06)' : 'rgba(214, 85, 65, 0.04)'),
                border: `1px solid ${ok
                  ? (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)')
                  : (isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.1)')}`,
              }}>
                <span style={{ color: ok ? colours.green : colours.cta, display: 'flex' }}>{icon}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: ok ? colours.green : colours.cta }}>{label}</span>
                {ok ? <FaCheck size={7} style={{ color: colours.green }} /> : <FaExclamationTriangle size={7} style={{ color: colours.cta, opacity: 0.7 }} />}
              </div>
            ))}
          </div>

          {/* Client — auto-confirmed from instruction data */}
          <div style={{
            ...sectionStyle, padding: '8px 12px',
            borderLeft: `2px solid ${colours.green}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={labelStyle}>Client</div>
              <span style={{
                fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                padding: '1px 5px', borderRadius: 0, marginLeft: 4,
                background: isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)',
                border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)'}`,
                color: colours.green,
              }}>
                Confirmed
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaCheckCircle size={10} style={{ color: colours.green, flexShrink: 0 }} />
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733',
              }}>
                {clientDisplayName}
              </span>
              {clientType && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 6px',
                  background: isDarkMode ? 'rgba(160, 160, 160, 0.06)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0,0,0,0.05)'}`,
                  borderRadius: 0, color: isDarkMode ? colours.subtleGrey : colours.greyText,
                }}>
                  {clientType}
                </span>
              )}
              {hasId && (
                <span style={{
                  fontSize: 8, fontWeight: 600, padding: '2px 5px', borderRadius: 0,
                  background: isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.04)',
                  border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)'}`,
                  color: colours.green,
                }}>
                  ID Verified
                </span>
              )}
              {instructionRef && (
                <span style={{
                  fontSize: 9, fontWeight: 600, fontFamily: 'monospace', marginLeft: 'auto',
                  color: isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0',
                }}>
                  {instructionRef}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Team assignments */}
      <div style={{
        ...sectionStyle,
        borderLeft: teamSectionComplete ? `2px solid ${colours.green}` : sectionStyle.borderLeft,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ ...labelStyle, marginBottom: 0 }}>Team</div>
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.45px',
            padding: '1px 5px',
            borderRadius: 0,
            border: teamSectionComplete
              ? `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.28)' : 'rgba(32, 178, 108, 0.22)'}`
              : `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)'}`,
            background: teamSectionComplete
              ? (isDarkMode ? 'rgba(32, 178, 108, 0.1)' : 'rgba(32, 178, 108, 0.06)')
              : (isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.06)'),
            color: teamSectionComplete ? colours.green : colours.cta,
          }}>
            {teamSectionComplete ? 'Complete' : 'Required'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Fee Earner *</div>
            <select
              value={selectedFeeEarner}
              onChange={e => setSelectedFeeEarner(e.target.value)}
              style={{
                ...selectStyle,
                border: !requiredState.feeEarner
                  ? `1px solid ${colours.cta}`
                  : selectStyle.border,
                background: !requiredState.feeEarner
                  ? (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)')
                  : selectStyle.background,
              }}
            >
              <option value="">Select…</option>
              {solicitorOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Supervising Partner *</div>
            <select
              value={supervisingPartner}
              onChange={e => setSupervisingPartner(e.target.value)}
              style={{
                ...selectStyle,
                border: !requiredState.supervisingPartner
                  ? `1px solid ${colours.cta}`
                  : selectStyle.border,
                background: !requiredState.supervisingPartner
                  ? (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)')
                  : selectStyle.background,
              }}
            >
              <option value="">Select…</option>
              {partnerOptionsList.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ ...labelStyle, fontSize: 8 }}>Originating Solicitor *</div>
            <select
              value={originatingSolicitor}
              onChange={e => setOriginatingSolicitor(e.target.value)}
              style={{
                ...selectStyle,
                border: !requiredState.originatingSolicitor
                  ? `1px solid ${colours.cta}`
                  : selectStyle.border,
                background: !requiredState.originatingSolicitor
                  ? (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)')
                  : selectStyle.background,
              }}
            >
              <option value="">Select…</option>
              {solicitorOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Area of Work + Practice Area */}
      <div style={{
        ...sectionStyle,
        borderLeft: matterSectionComplete ? `2px solid ${colours.green}` : sectionStyle.borderLeft,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ ...labelStyle, marginBottom: 0 }}>Matter</div>
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.45px',
            padding: '1px 5px',
            borderRadius: 0,
            border: matterSectionComplete
              ? `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.28)' : 'rgba(32, 178, 108, 0.22)'}`
              : `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)'}`,
            background: matterSectionComplete
              ? (isDarkMode ? 'rgba(32, 178, 108, 0.1)' : 'rgba(32, 178, 108, 0.06)')
              : (isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.06)'),
            color: matterSectionComplete ? colours.green : colours.cta,
          }}>
            {matterSectionComplete ? 'Complete' : 'Required'}
          </span>
        </div>

        {/* AoW buttons */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...labelStyle, fontSize: 8 }}>Area of Work *</div>
          <div style={{
            display: 'flex', gap: 5, flexWrap: 'wrap',
            border: !requiredState.areaOfWork ? `1px solid ${colours.cta}` : 'none',
            padding: !requiredState.areaOfWork ? 6 : 0,
            background: !requiredState.areaOfWork
              ? (isDarkMode ? 'rgba(214, 85, 65, 0.06)' : 'rgba(214, 85, 65, 0.04)')
              : 'transparent',
          }}>
            {['Commercial', 'Construction', 'Property', 'Employment'].map(aow => {
              const active = selectedAreaOfWork === aow;
              const clr = aowColors[aow] || colours.highlight;
              return (
                <button key={aow} type="button" onClick={() => { setSelectedAreaOfWork(aow); setPracticeArea(''); }}
                  style={{
                    padding: '5px 10px', fontSize: 10, fontWeight: active ? 700 : 500,
                    border: `1px solid ${active ? clr : (isDarkMode ? 'rgba(75, 85, 99, 0.35)' : '#CBD5E1')}`,
                    borderRadius: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: active ? (isDarkMode ? `${clr}18` : `${clr}10`) : (isDarkMode ? 'rgba(17, 24, 39, 0.8)' : '#F8FAFC'),
                    color: active ? clr : (isDarkMode ? colours.subtleGrey : '#475569'),
                    transition: 'all 0.15s ease', fontFamily: 'inherit',
                  }}
                >
                  {aow}
                </button>
              );
            })}
          </div>
        </div>

        {/* Practice Area */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...labelStyle, fontSize: 8 }}>Practice Area *</div>
          <select
            value={practiceArea}
            onChange={e => setPracticeArea(e.target.value)}
            style={{
              ...selectStyle,
              border: !requiredState.practiceArea
                ? `1px solid ${colours.cta}`
                : selectStyle.border,
              background: !requiredState.practiceArea
                ? (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)')
                : selectStyle.background,
            }}
          >
            <option value="">Select practice area…</option>
            {filteredPracticeAreas.map(pa => <option key={pa} value={pa}>{pa}</option>)}
          </select>
        </div>

        {/* Dispute Value + Source */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Dispute Value</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {DISPUTE_VALUES.map(({ label, value }) => (
                <button key={value} type="button" onClick={() => setDisputeValue(value)}
                  style={{ ...chipActive(disputeValue === value), padding: '5px 10px', fontSize: 10, fontFamily: 'inherit' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Source</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {SOURCE_OPTIONS.map(({ key, label }) => (
                <button key={key} type="button" onClick={() => setSource(key)}
                  style={{ ...chipActive(source === key), padding: '5px 10px', fontSize: 10, fontFamily: 'inherit' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Opponent (collapsed by default; conflict-check style) */}
      <div style={{
        ...sectionStyle,
        borderLeft: opponentSectionComplete ? `2px solid ${colours.green}` : sectionStyle.borderLeft,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 0,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon iconName="People" style={{ fontSize: 13, color: colours.highlight }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? '#E5E7EB' : '#0F172A' }}>Opponent Details</div>
            <div style={{ fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Optional now — you can continue and add these later. We’ll remind you before final completion.</div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', marginBottom: showOpponent ? 10 : 0,
          background: showOpponent
            ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)')
            : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)'),
          border: `1px solid ${showOpponent
            ? (isDarkMode ? 'rgba(54, 144, 206, 0.28)' : 'rgba(54, 144, 206, 0.2)')
            : (isDarkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.18)')}`,
          borderRadius: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 0,
              background: showOpponent
                ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.1)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)'),
              border: `1px solid ${showOpponent
                ? (isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)')}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon iconName={showOpponent ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 11, color: showOpponent ? colours.highlight : (isDarkMode ? colours.subtleGrey : colours.greyText) }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: showOpponent ? colours.highlight : (isDarkMode ? '#d1d5db' : '#374151') }}>
                {showOpponent ? 'Opponent fields visible' : 'Opponent fields hidden'}
              </div>
              <div style={{ fontSize: 9, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                {showOpponent
                  ? 'Capture opponent and solicitor details now.'
                  : 'Skip for now and add later if needed.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowOpponent(!showOpponent)}
            style={{
              padding: '6px 12px',
              background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
              color: colours.highlight,
              border: `1px solid ${colours.highlight}`,
              borderRadius: 0,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'inherit',
            }}
          >
            <Icon iconName={showOpponent ? 'Hide3' : 'RedEye'} style={{ fontSize: 10 }} />
            {showOpponent ? 'Hide details' : 'Add details'}
          </button>
        </div>

        {!showOpponent && (opponentFirst || opponentLast || opponentCompanyName || solicitorFirst || solicitorLast || solicitorCompany) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {(opponentFirst || opponentLast || opponentCompanyName) && (
              <div style={{
                padding: '6px 8px',
                background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.28)' : 'rgba(54, 144, 206, 0.2)'}`,
                borderRadius: 0,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Icon iconName="People" style={{ fontSize: 10, color: colours.highlight }} />
                <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#0F172A' }}>
                  {opponentType === 'Company' ? opponentCompanyName : `${opponentFirst} ${opponentLast}`.trim()}
                </span>
              </div>
            )}
            {(solicitorFirst || solicitorLast || solicitorCompany) && (
              <div style={{
                padding: '6px 8px',
                background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.28)' : 'rgba(54, 144, 206, 0.2)'}`,
                borderRadius: 0,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Icon iconName="ContactInfo" style={{ fontSize: 10, color: colours.highlight }} />
                <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#0F172A' }}>
                  {`${solicitorFirst} ${solicitorLast}`.trim() || solicitorCompany}
                </span>
              </div>
            )}
          </div>
        )}

        {showOpponent && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Opponent Type selector */}
            <div>
              <div style={{ ...labelStyle, fontSize: 8 }}>Opponent Type</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['Individual', 'Company'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setOpponentType(t)}
                    style={{
                      ...chipActive(opponentType === t), padding: '5px 12px', fontSize: 10, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {t === 'Individual' ? <FaUser size={8} /> : <FaBuilding size={8} />}
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Name fields */}
            <div style={{ display: 'grid', gridTemplateColumns: opponentType === 'Individual' ? '60px 1fr 1fr' : '1fr 1fr', gap: 6 }}>
              {opponentType === 'Individual' && (
                <div>
                  <div style={{ ...labelStyle, fontSize: 8 }}>Title</div>
                  <select value={opponentTitle} onChange={e => setOpponentTitle(e.target.value)} style={selectStyle}>
                    <option value="">—</option>
                    {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div>
                <div style={{ ...labelStyle, fontSize: 8 }}>{opponentType === 'Company' ? 'Company Name' : 'First Name'}</div>
                <input
                  value={opponentType === 'Company' ? opponentCompanyName : opponentFirst}
                  onChange={e => opponentType === 'Company' ? setOpponentCompanyName(e.target.value) : setOpponentFirst(e.target.value)}
                  placeholder={opponentType === 'Company' ? 'Company name' : 'First name'}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ ...labelStyle, fontSize: 8 }}>{opponentType === 'Company' ? 'Company Number' : 'Last Name'}</div>
                <input
                  value={opponentType === 'Company' ? opponentCompanyNumber : opponentLast}
                  onChange={e => opponentType === 'Company' ? setOpponentCompanyNumber(e.target.value) : setOpponentLast(e.target.value)}
                  placeholder={opponentType === 'Company' ? 'e.g. 12345678' : 'Last name'}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <div style={{ ...labelStyle, fontSize: 8 }}>Email</div>
                <input value={opponentEmail} onChange={e => setOpponentEmail(e.target.value)} placeholder="Email" style={inputStyle} />
              </div>
              <div>
                <div style={{ ...labelStyle, fontSize: 8 }}>Phone</div>
                <input value={opponentPhone} onChange={e => setOpponentPhone(e.target.value)} placeholder="Phone" style={inputStyle} />
              </div>
            </div>

            {/* Address (collapsible row) */}
            <div>
              <div style={{ ...labelStyle, fontSize: 8, marginBottom: 4 }}>Address</div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 4, marginBottom: 4 }}>
                <input value={opponentHouseNumber} onChange={e => setOpponentHouseNumber(e.target.value)} placeholder="No." style={{ ...inputStyle, fontSize: 10 }} />
                <input value={opponentStreet} onChange={e => setOpponentStreet(e.target.value)} placeholder="Street" style={{ ...inputStyle, fontSize: 10 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <input value={opponentCity} onChange={e => setOpponentCity(e.target.value)} placeholder="City" style={{ ...inputStyle, fontSize: 10 }} />
                <input value={opponentCounty} onChange={e => setOpponentCounty(e.target.value)} placeholder="County" style={{ ...inputStyle, fontSize: 10 }} />
                <input value={opponentPostcode} onChange={e => setOpponentPostcode(e.target.value)} placeholder="Postcode" style={{ ...inputStyle, fontSize: 10 }} />
              </div>
            </div>

            {/* Opponent's Solicitor (sub-collapsible) */}
            <div style={{
              borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(0, 0, 0, 0.05)'}`,
              paddingTop: 8,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px',
                background: showSolicitor
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)')
                  : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)'),
                border: `1px solid ${showSolicitor
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.28)' : 'rgba(54, 144, 206, 0.2)')
                  : (isDarkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.18)')}`,
                borderRadius: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FaUserTie size={9} style={{ color: showSolicitor ? colours.highlight : (isDarkMode ? colours.subtleGrey : colours.greyText) }} />
                  <span style={{ ...labelStyle, marginBottom: 0, fontSize: 8, color: showSolicitor ? colours.highlight : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>
                    Opponent&apos;s Solicitor
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSolicitor(!showSolicitor)}
                  style={{
                    padding: '5px 10px',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
                    color: colours.highlight,
                    border: `1px solid ${colours.highlight}`,
                    borderRadius: 0,
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon iconName={showSolicitor ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 9 }} />
                  {showSolicitor ? 'Hide' : 'Add'}
                </button>
              </div>
              {showSolicitor && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ ...labelStyle, fontSize: 8 }}>First Name</div>
                      <input value={solicitorFirst} onChange={e => setSolicitorFirst(e.target.value)} placeholder="First name" style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ ...labelStyle, fontSize: 8 }}>Last Name</div>
                      <input value={solicitorLast} onChange={e => setSolicitorLast(e.target.value)} placeholder="Last name" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ ...labelStyle, fontSize: 8 }}>Email</div>
                      <input value={solicitorEmail} onChange={e => setSolicitorEmail(e.target.value)} placeholder="Email" style={inputStyle} />
                    </div>
                    <div>
                      <div style={{ ...labelStyle, fontSize: 8 }}>Phone</div>
                      <input value={solicitorPhone} onChange={e => setSolicitorPhone(e.target.value)} placeholder="Phone" style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <div style={{ ...labelStyle, fontSize: 8 }}>Firm / Company</div>
                    <input value={solicitorCompany} onChange={e => setSolicitorCompany(e.target.value)} placeholder="Firm name" style={inputStyle} />
                  </div>
                  {/* Solicitor Address */}
                  <div>
                    <div style={{ ...labelStyle, fontSize: 8, marginBottom: 4 }}>Address</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 4, marginBottom: 4 }}>
                      <input value={solicitorHouseNumber} onChange={e => setSolicitorHouseNumber(e.target.value)} placeholder="No." style={{ ...inputStyle, fontSize: 10 }} />
                      <input value={solicitorStreet} onChange={e => setSolicitorStreet(e.target.value)} placeholder="Street" style={{ ...inputStyle, fontSize: 10 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                      <input value={solicitorCity} onChange={e => setSolicitorCity(e.target.value)} placeholder="City" style={{ ...inputStyle, fontSize: 10 }} />
                      <input value={solicitorCounty} onChange={e => setSolicitorCounty(e.target.value)} placeholder="County" style={{ ...inputStyle, fontSize: 10 }} />
                      <input value={solicitorPostcode} onChange={e => setSolicitorPostcode(e.target.value)} placeholder="Postcode" style={{ ...inputStyle, fontSize: 10 }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Conflict of Interest */}
      <div style={{
        ...sectionStyle,
        border: !requiredState.conflictCheck
          ? `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.26)' : 'rgba(148, 163, 184, 0.2)'}`
          : sectionStyle.border,
        borderLeft: conflictSectionComplete ? `2px solid ${colours.green}` : sectionStyle.borderLeft,
      }}>
        <ConflictConfirmationCard
          clientName={clientDisplayName}
          matterDescription={description || inst?.ServiceDescription || ''}
          opponentName={opponentType === 'Company' ? opponentCompanyName : `${opponentFirst} ${opponentLast}`.trim()}
          opponentSolicitor={`${solicitorFirst} ${solicitorLast}`.trim() || solicitorCompany}
          noConflict={noConflict}
          onConflictStatusChange={setNoConflict}
          onAuditClick={(action) => {
            reportTelemetry(action === 'confirm' ? 'ConflictCheck.Confirmed' : 'ConflictCheck.ResetRequested', {
              action,
              instructionRef,
              hasOpponent: Boolean(opponentFirst || opponentLast || opponentCompanyName),
              hasOpponentSolicitor: Boolean(solicitorFirst || solicitorLast || solicitorCompany),
            });
          }}
          showOpponentSection={showOpponent || Boolean(opponentFirst || opponentLast || opponentCompanyName || solicitorFirst || solicitorLast || solicitorCompany)}
          showSearchNamesSection={false}
          demoModeEnabled={false}
        />
      </div>

      {missingRequiredLabels.length > 0 && (
        <div style={{
          padding: '8px 10px',
          borderRadius: 0,
          border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)'}`,
          background: isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)',
          color: colours.cta,
          fontSize: 10,
          fontWeight: 600,
        }}>
          Complete required fields: {missingRequiredLabels.join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: 'auto',
              minWidth: 100,
              padding: '9px 14px',
              background: isDarkMode ? 'rgba(2, 6, 23, 0.45)' : '#FFFFFF',
              border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(6, 23, 51, 0.12)'}`,
              borderRadius: 0,
              fontSize: 11,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Back
          </button>
        ) : <span />}

        <button
          type="button"
          onClick={handleRequestSubmit}
          disabled={!isFormComplete || userDataLoading}
          style={{
            width: 'auto',
            minWidth: 170,
            padding: '10px 16px',
            background: isFormComplete ? colours.highlight : (isDarkMode ? 'rgba(6, 23, 51, 0.6)' : colours.grey),
            border: 'none', borderRadius: 0,
            color: isFormComplete ? '#FFFFFF' : (isDarkMode ? colours.subtleGrey : colours.greyText),
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: isFormComplete ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s ease',
          }}
        >
          {userDataLoading ? (
            <><FaClock size={10} /> Loading profile…</>
          ) : (
            <><FaFolder size={11} /> Continue to Review</>
          )}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Helper: build minimal userData from team record                    */
/* ------------------------------------------------------------------ */

function buildMinimalUserData(tm: any, initials: string) {
  return {
    Initials: tm.Initials || initials,
    ASANAClientID: tm.ASANAClientID || tm.ASANAClient_ID || '',
    ASANAClient_ID: tm.ASANAClient_ID || tm.ASANAClientID || '',
    ASANASecret: tm.ASANASecret || tm.ASANA_Secret || '',
    ASANA_Secret: tm.ASANA_Secret || tm.ASANASecret || '',
    ASANARefreshToken: tm.ASANARefreshToken || tm.ASANARefresh_Token || '',
    ASANARefresh_Token: tm.ASANARefresh_Token || tm.ASANARefreshToken || '',
    'Entra ID': tm['Entra ID'] || tm.EntraID || '',
    Email: tm.Email || tm.email || '',
    Name: tm['Full Name'] || tm.Name || `${tm.First || ''} ${tm.Last || ''}`.trim(),
    ClioID: tm['Clio ID'] || tm.ClioID || tm.Clio_ID || '',
  };
}

export default CompactMatterWizard;
