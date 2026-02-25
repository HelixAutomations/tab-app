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
  FaFolder,
  FaFolderOpen,
  FaGavel,
  FaIdCard,
  FaCreditCard,
  FaShieldAlt,
  FaTimes,
  FaTimesCircle,
  FaUser,
  FaUserTie,
} from 'react-icons/fa';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import { practiceAreasByArea, partnerOptions } from './config';
// ConflictConfirmationCard used in full wizard — compact wizard uses inline confirmation
import {
  processingActions,
  initialSteps,
  registerClientIdCallback,
  registerMatterIdCallback,
  registerOperationObserver,
  resetMatterTraceId,
  setCurrentActionIndex,
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
  onMatterSuccess: (matterId: string) => void;
  onCancel?: () => void;
  showToast: ShowToastFn;
  hideToast: HideToastFn;
  demoModeEnabled?: boolean;
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
  onMatterSuccess,
  onCancel,
  showToast,
  hideToast,
  demoModeEnabled = false,
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
    if (propAreaOfWork && propAreaOfWork !== '—') return propAreaOfWork;
    return inst?.AreaOfWork || inst?.areaOfWork || inst?.Area_of_Work || deal?.AreaOfWork || '';
  }, [propAreaOfWork, inst, deal]);

  const filteredPracticeAreas = useMemo(() => {
    return practiceAreasByArea[resolvedAreaOfWork] || [];
  }, [resolvedAreaOfWork]);

  const clientDisplayName = useMemo(() => {
    const first = inst?.FirstName || inst?.Forename || '';
    const last = inst?.LastName || inst?.Surname || '';
    const full = `${first} ${last}`.trim();
    if (inst?.CompanyName || inst?.company_name) return inst.CompanyName || inst.company_name;
    return full || 'Client';
  }, [inst]);

  const clientType = useMemo(() => {
    if (inst?.ClientType) return inst.ClientType;
    if (inst?.CompanyName || inst?.company_name) return 'Company';
    return 'Individual';
  }, [inst]);

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
      const match = teamData.find(t => t.Email?.toLowerCase() === currentUser.Email!.toLowerCase());
      if (match?.Initials) return match.Initials.toUpperCase();
    }
    if (resolvedFeeEarner && teamData) {
      return getInitialsFromName(resolvedFeeEarner, teamData);
    }
    return '';
  }, [currentUser, teamData, resolvedFeeEarner]);

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
  const [practiceArea, setPracticeArea] = useState('');
  const [description, setDescription] = useState(inst?.ServiceDescription || deal?.ServiceDescription || '');
  const [disputeValue, setDisputeValue] = useState('');
  const [source, setSource] = useState('');
  const [noConflict, setNoConflict] = useState(false);

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

  /* userData resolution */
  const [userData, setUserData] = useState<any[] | null>(null);
  const [userDataLoading, setUserDataLoading] = useState(false);

  const matterId = useRef<string | null>(null);

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
      if (s.practiceArea) setPracticeArea(s.practiceArea);
      if (s.description) setDescription(s.description);
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
      practiceArea, description, disputeValue, source,
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
    practiceArea, description, disputeValue, source, showOpponent, showSolicitor,
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

  /* ---- resolve userData from teamData on mount ---- */
  useEffect(() => {
    if (!teamData || !userInitials) return;
    const tm = teamData.find((t: any) => (t.Initials || '').toLowerCase() === userInitials.toLowerCase()) as any;
    if (!tm) return;

    // Try API first
    const entraId = tm['Entra ID'] || tm.EntraID;
    if (entraId) {
      setUserDataLoading(true);
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userObjectId: entraId }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && Array.isArray(data) && data.length > 0) {
            setUserData(data);
          } else {
            // Construct minimal from teamData
            setUserData([buildMinimalUserData(tm, userInitials)]);
          }
        })
        .catch(() => setUserData([buildMinimalUserData(tm, userInitials)]))
        .finally(() => setUserDataLoading(false));
    } else {
      setUserData([buildMinimalUserData(tm, userInitials)]);
    }
  }, [teamData, userInitials]);

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

  /* ---- form validity ---- */
  const isFormComplete = useMemo(() => {
    return !!(
      selectedFeeEarner &&
      supervisingPartner &&
      originatingSolicitor &&
      selectedAreaOfWork &&
      practiceArea &&
      description.trim() &&
      noConflict
    );
  }, [selectedFeeEarner, supervisingPartner, originatingSolicitor, selectedAreaOfWork, practiceArea, description, noConflict]);

  /* ---- build formData for processing pipeline ---- */
  const buildFormData = useCallback(() => {
    const feeEarnerInitials = teamData ? getInitialsFromName(selectedFeeEarner, teamData) : '';
    const feeEarnerEmail = (() => {
      if (!teamData) return '';
      const match = teamData.find((t: any) => (t?.Initials || '').toUpperCase() === feeEarnerInitials.toUpperCase());
      return match?.Email || '';
    })();
    const originatingInitials = teamData ? getInitialsFromName(originatingSolicitor, teamData) : '';

    // Build client info from instruction data
    const clientInfo = [{
      poid_id: inst?.ProspectId?.toString() || inst?.ClientId?.toString() || 'inline-client',
      first_name: inst?.FirstName || inst?.Forename || '',
      last_name: inst?.LastName || inst?.Surname || '',
      email: inst?.Email || inst?.ClientEmail || '',
      best_number: inst?.Phone || inst?.phone || '',
      type: clientType === 'Company' ? 'company' : 'individual',
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
      company_details: (inst?.CompanyName || inst?.company_name) ? {
        name: inst?.CompanyName || inst?.company_name || null,
        number: inst?.CompanyNumber || inst?.company_number || null,
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
        check_result: eid?.EIDOverallResult || inst?.EIDOverallResult || null,
        pep_sanctions_result: eid?.PEPAndSanctionsCheckResult || eid?.PEPResult || inst?.PEPAndSanctionsCheckResult || null,
        address_verification_result: eid?.AddressVerificationResult || eid?.AddressVerification || inst?.AddressVerificationResult || null,
        check_expiry: eid?.CheckExpiry || null,
        check_id: eid?.EIDCheckId || inst?.EIDCheckId || null,
      },
    }];

    // Build instruction summary for fee earner confirmation email
    const idVerifications = inst?.idVerifications || (eid ? [eid] : []);
    const leadVerif = idVerifications.find((v: any) => v.IsLeadClient) || idVerifications[0] || null;
    const riskAssessments = inst?.riskAssessments || (risk ? [risk] : []);
    const latestRisk = riskAssessments[0] || null;
    const successfulPayment = payments.find((p: any) => p.payment_status === 'succeeded' || p.internal_status === 'completed') || payments[0] || null;

    return {
      matter_details: {
        instruction_ref: instructionRef || null,
        client_id: inst?.ProspectId?.toString() || inst?.ClientId?.toString() || null,
        matter_ref: null,
        stage: inst?.Stage || inst?.stage || 'New Matter',
        date_created: new Date().toISOString().split('T')[0],
        client_type: clientType,
        area_of_work: selectedAreaOfWork,
        practice_area: practiceArea,
        description: description.trim(),
        client_as_on_file: clientDisplayName,
        dispute_value: disputeValue || null,
        folder_structure: `Default / ${selectedAreaOfWork}`,
        budget_required: 'No',
        budget_amount: null,
        budget_notify_threshold: null,
        budget_notify_users: [],
      },
      team_assignments: {
        fee_earner: selectedFeeEarner,
        supervising_partner: supervisingPartner,
        originating_solicitor: originatingSolicitor,
        requesting_user: currentUser?.FullName || selectedFeeEarner,
        fee_earner_initials: feeEarnerInitials,
        fee_earner_email: feeEarnerEmail,
        originating_solicitor_initials: originatingInitials,
      },
      client_information: clientInfo,
      source_details: {
        source: source || 'uncertain',
        referrer_name: null,
      },
      opponent_details: (opponentFirst || opponentLast || opponentCompanyName) ? {
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
      instruction_summary: {
        payment_result: successfulPayment?.payment_status === 'succeeded' ? 'Paid' : (inst?.InternalStatus === 'paid' ? 'Paid' : null),
        payment_amount: successfulPayment?.amount || inst?.PaymentAmount || null,
        payment_timestamp: successfulPayment?.created_at || inst?.PaymentTimestamp || null,
        eid_overall_result: leadVerif?.EIDOverallResult || inst?.EIDOverallResult || null,
        eid_check_id: leadVerif?.EIDCheckId || inst?.EIDCheckId || null,
        eid_status: leadVerif?.EIDStatus || inst?.EIDStatus || null,
        pep_sanctions_result: leadVerif?.PEPAndSanctionsCheckResult || leadVerif?.PEPResult || null,
        address_verification_result: leadVerif?.AddressVerificationResult || leadVerif?.AddressVerification || null,
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
    };
  }, [
    inst, deal, eid, risk, payments, documents, teamData, userInitials,
    instructionRef, clientType, clientDisplayName, selectedAreaOfWork,
    practiceArea, description, disputeValue, source, noConflict,
    selectedFeeEarner, supervisingPartner, originatingSolicitor,
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

    // Resolve userData
    let workingUserData = userData;
    if (!workingUserData || workingUserData.length === 0) {
      if (teamData && userInitials) {
        const tm = teamData.find((t: any) => (t.Initials || '').toLowerCase() === userInitials.toLowerCase()) as any;
        if (tm) workingUserData = [buildMinimalUserData(tm, userInitials)];
      }
    }
    if (!workingUserData || workingUserData.length === 0) {
      reportTelemetry('PreValidation.Failed', { error: 'Profile missing', phase: 'userDataCheck' });
      showToast({ type: 'error', title: 'Profile Missing', message: 'Could not resolve user profile. Please try the full wizard.' });
      return;
    }

    // Validate Asana credentials
    const user = workingUserData[0];
    if (!user.ASANASecret && !user.ASANA_Secret) {
      reportTelemetry('PreValidation.Failed', { error: 'Asana credentials missing', phase: 'credentialCheck' });
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
      registerClientIdCallback((id) => { /* captured */ });
      registerMatterIdCallback((id) => { matterId.current = id; });
      registerOperationObserver(() => { /* silent */ });

      for (let i = 0; i < processingActions.length; i++) {
        const action = processingActions[i];
        setCurrentActionIndex(i);
        setCurrentStepIdx(i);
        const formData = buildFormData();
        const result = await action.run(formData, userInitials, workingUserData);
        const message = typeof result === 'string' ? result : result.message;
        setProcessingSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success', message } : s));
        setProcessingLogs(prev => [...prev, `✓ ${message}`]);
      }

      const durationMs = Date.now() - startTime;
      hideToast('compact-matter-processing');
      reportTelemetry('Processing.Completed', { durationMs, matterId: matterId.current || 'unknown' });

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
  }, [isFormComplete, userData, teamData, userInitials, buildFormData, showToast, hideToast, reportTelemetry, selectedFeeEarner, selectedAreaOfWork, practiceArea]);

  /* ---- styles ---- */
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px',
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    marginBottom: 4,
  };
  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
    background: isDarkMode ? 'rgba(2, 6, 23, 0.6)' : '#FFFFFF',
    color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : '#061733',
    border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(0, 0, 0, 0.1)'}`,
    borderRadius: 0, outline: 'none', cursor: 'pointer',
    appearance: 'none' as const, WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='${isDarkMode ? '%23A0A0A0' : '%236B6B6B'}'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 28,
  };
  const inputStyle: React.CSSProperties = {
    ...selectStyle, cursor: 'text',
    backgroundImage: 'none', paddingRight: 10,
  };
  const sectionStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.7)',
    border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
    borderRadius: 0, padding: '10px 12px',
  };
  const chipActive = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', fontSize: 10, fontWeight: active ? 700 : 500,
    border: `1px solid ${active ? colours.highlight : (isDarkMode ? 'rgba(75, 85, 99, 0.35)' : '#CBD5E1')}`,
    borderRadius: 0, cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? (isDarkMode ? `${colours.highlight}18` : `${colours.highlight}10`) : (isDarkMode ? 'rgba(17, 24, 39, 0.8)' : '#F8FAFC'),
    color: active ? colours.highlight : (isDarkMode ? colours.subtleGrey : '#475569'),
    transition: 'border-color 0.15s, background 0.15s',
  });

  const aowColors: Record<string, string> = { Commercial: colours.blue, Property: colours.green, Construction: colours.orange, Employment: colours.yellow };

  /* ---- render: confirm mode ---- */
  if (wizardMode === 'confirm') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ ...sectionStyle, padding: '14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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

          {/* Summary strip */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12,
            fontSize: 10, lineHeight: 1.5,
          }}>
            {[
              { label: 'Client', value: clientDisplayName },
              { label: 'Type', value: clientType },
              { label: 'Fee Earner', value: selectedFeeEarner },
              { label: 'Partner', value: supervisingPartner },
              { label: 'Area', value: selectedAreaOfWork },
              { label: 'Practice', value: practiceArea },
            ].map(({ label, value }) => (
              <div key={label}>
                <span style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, fontWeight: 600 }}>{label}: </span>
                <span style={{ color: isDarkMode ? '#d1d5db' : '#374151', fontWeight: 500 }}>{value || '—'}</span>
              </div>
            ))}
          </div>

          {/* Matter ref preview */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 12,
            background: isDarkMode ? 'rgba(6, 23, 51, 0.6)' : 'rgba(54, 144, 206, 0.04)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.1)'}`,
            borderRadius: 0,
          }}>
            <FaFolderOpen size={11} style={{ color: colours.highlight, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: colours.highlight, fontFamily: 'monospace' }}>
              {matterRefPreview}
            </span>
            <span style={{ fontSize: 10, color: isDarkMode ? '#d1d5db' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {description.slice(0, 60)}{description.length > 60 ? '…' : ''}
            </span>
          </div>

          {/* Final acknowledge checkbox */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            padding: '8px 10px',
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
              {instructionRef && (
                <span style={{
                  fontSize: 9, fontWeight: 600, fontFamily: 'monospace', marginTop: 2,
                  color: isDarkMode ? 'rgba(160, 160, 160, 0.5)' : '#A0A0A0',
                }}>
                  {instructionRef}
                </span>
              )}
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          ...sectionStyle, padding: '18px 14px',
          borderLeft: `2px solid ${colours.green}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <FaCheckCircle size={28} style={{ color: colours.green }} />
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: isDarkMode ? 'rgba(243, 244, 246, 0.95)' : '#061733',
          }}>
            Matter Opened Successfully
          </div>
          {matterId.current && (
            <div style={{
              fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
              padding: '4px 12px',
              background: isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)'}`,
              borderRadius: 0,
              color: colours.green,
            }}>
              Matter ID: {matterId.current}
            </div>
          )}
          <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, textAlign: 'center', lineHeight: 1.5 }}>
            The matter has been created in Clio, Asana task opened, and the fee earner notified.
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (matterId.current) {
              onMatterSuccess(matterId.current);
            } else {
              onMatterSuccess('inline');
            }
          }}
          style={{
            width: '100%', padding: '10px 0',
            background: colours.green, border: 'none', borderRadius: 0,
            color: '#FFFFFF', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <FaCheck size={10} /> Done
        </button>
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
      { label: 'Credentials', range: [0, 9] },
      { label: 'Opponent & Request', range: [10, 13] },
      { label: 'Clio Contact', range: [14, 14] },
      { label: 'Matter & Sync', range: [15, 19] },
      { label: 'Portal & CCL', range: [20, 21] },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          {phases.map(({ label, range }, pi) => {
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
                <span style={{
                  fontSize: 11, fontWeight: isCurrent || allDone ? 600 : 400,
                  color: hasError ? colours.cta : (allDone ? colours.green : (isDarkMode ? '#d1d5db' : '#374151')),
                }}>
                  {label}
                </span>
                {hasError && (
                  <span style={{ fontSize: 9, color: colours.cta, marginLeft: 'auto', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {phaseSteps.find(s => s.status === 'error')?.message || 'Error'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Error recovery */}
        {wizardMode === 'error' && (
          <div style={{ ...sectionStyle, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: colours.cta, fontWeight: 600 }}>{failureSummary}</div>

            {/* Auto-report status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px',
              background: reportDelivered
                ? (isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.04)')
                : (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)'),
              border: `1px solid ${reportDelivered
                ? (isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)')
                : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')}`,
              borderRadius: 0,
            }}>
              {reportDelivered ? (
                <FaCheckCircle size={9} style={{ color: colours.green, flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  border: `1.5px solid ${colours.highlight}`,
                  borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }} />
              )}
              <span style={{
                fontSize: 9, fontWeight: 500,
                color: reportDelivered ? colours.green : (isDarkMode ? '#d1d5db' : '#374151'),
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
              {/* Manual report button */}
              <button
                type="button"
                onClick={sendManualReport}
                disabled={reportSending || reportDelivered}
                style={{
                  padding: '7px 12px', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: reportDelivered
                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)')
                    : (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.05)'),
                  border: `1px solid ${reportDelivered
                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)')
                    : (isDarkMode ? 'rgba(214, 85, 65, 0.2)' : 'rgba(214, 85, 65, 0.15)')}`,
                  borderRadius: 0,
                  color: reportDelivered ? colours.green : colours.cta,
                  cursor: reportDelivered ? 'default' : (reportSending ? 'wait' : 'pointer'),
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <FaEnvelope size={9} />
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

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ---- render: form mode ---- */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      {/* Team assignments */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Team</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Fee Earner</div>
            <select value={selectedFeeEarner} onChange={e => setSelectedFeeEarner(e.target.value)} style={selectStyle}>
              <option value="">Select…</option>
              {solicitorOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Supervising Partner</div>
            <select value={supervisingPartner} onChange={e => setSupervisingPartner(e.target.value)} style={selectStyle}>
              <option value="">Select…</option>
              {partnerOptionsList.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ ...labelStyle, fontSize: 8 }}>Originating Solicitor</div>
            <select value={originatingSolicitor} onChange={e => setOriginatingSolicitor(e.target.value)} style={selectStyle}>
              <option value="">Select…</option>
              {solicitorOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Area of Work + Practice Area */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Matter</div>

        {/* AoW buttons */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...labelStyle, fontSize: 8 }}>Area of Work</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...labelStyle, fontSize: 8 }}>Practice Area</div>
          <select value={practiceArea} onChange={e => setPracticeArea(e.target.value)} style={selectStyle}>
            <option value="">Select practice area…</option>
            {filteredPracticeAreas.map(pa => <option key={pa} value={pa}>{pa}</option>)}
          </select>
        </div>

        {/* Description with matter ref preview */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...labelStyle, fontSize: 8 }}>Description</div>
          {/* Clio matter ref preview */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            padding: '6px 10px',
            background: isDarkMode ? 'rgba(6, 23, 51, 0.6)' : 'rgba(54, 144, 206, 0.04)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.1)'}`,
            borderRadius: 0,
          }}>
            <FaFolderOpen size={11} style={{ color: colours.highlight, flexShrink: 0 }} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: colours.highlight,
              letterSpacing: 0.3, fontFamily: 'monospace',
            }}>
              {matterRefPreview}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 400, marginLeft: 4,
              color: isDarkMode ? '#d1d5db' : '#374151',
              opacity: description ? 1 : 0.5,
              fontStyle: description ? 'normal' : 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {description || 'Description preview…'}
            </span>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Brief description of the matter…"
            style={{
              ...inputStyle,
              resize: 'vertical' as const,
              minHeight: 48,
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Dispute Value + Source */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Dispute Value</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {DISPUTE_VALUES.map(({ label, value }) => (
                <button key={value} type="button" onClick={() => setDisputeValue(value)}
                  style={{ ...chipActive(disputeValue === value), padding: '4px 7px', fontSize: 9, fontFamily: 'inherit' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ ...labelStyle, fontSize: 8 }}>Source</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {SOURCE_OPTIONS.map(({ key, label }) => (
                <button key={key} type="button" onClick={() => setSource(key)}
                  style={{ ...chipActive(source === key), padding: '4px 7px', fontSize: 9, fontFamily: 'inherit' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Opponent (collapsible — full details) */}
      <div style={sectionStyle}>
        <button
          type="button"
          onClick={() => setShowOpponent(!showOpponent)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {showOpponent ? <FaChevronDown size={8} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} /> : <FaChevronRight size={8} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} />}
          <span style={{ ...labelStyle, marginBottom: 0 }}>Opponent Details</span>
          <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(160, 160, 160, 0.4)' : '#A0A0A0', marginLeft: 4 }}>optional</span>
          {(opponentFirst || opponentLast || opponentCompanyName) && (
            <span style={{ fontSize: 8, fontWeight: 600, color: colours.green, marginLeft: 'auto' }}>
              {opponentType === 'Company' ? opponentCompanyName : `${opponentFirst} ${opponentLast}`.trim()}
            </span>
          )}
        </button>
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
              <button
                type="button"
                onClick={() => setShowSolicitor(!showSolicitor)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {showSolicitor ? <FaChevronDown size={7} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} /> : <FaChevronRight size={7} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} />}
                <FaUserTie size={9} style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }} />
                <span style={{ ...labelStyle, marginBottom: 0, fontSize: 8 }}>Opponent&apos;s Solicitor</span>
              </button>
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

      {/* Conflict of Interest — OG button-driven flow */}
      <div style={sectionStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 0,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon iconName="Shield" style={{ fontSize: 13, color: colours.highlight }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? '#E5E7EB' : '#0F172A' }}>Conflict Check</div>
            <div style={{ fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Confirm no conflicts exist before opening this matter</div>
          </div>
        </div>

        {/* Status banner */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', marginBottom: 10,
          background: noConflict
            ? (isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.06)')
            : (isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.06)'),
          border: `1px solid ${noConflict
            ? (isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.2)')
            : (isDarkMode ? 'rgba(214, 85, 65, 0.25)' : 'rgba(214, 85, 65, 0.2)')}`,
          borderRadius: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 0,
              background: noConflict
                ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.1)')
                : (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.1)'),
              border: `1px solid ${noConflict
                ? (isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.25)')
                : (isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.25)')}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon iconName={noConflict ? 'SkypeCheck' : 'Warning'} style={{ fontSize: 11, color: noConflict ? colours.green : colours.cta }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: noConflict ? colours.green : colours.cta }}>
                {noConflict ? 'No Conflict Confirmed' : 'Conflict Check Required'}
              </div>
              <div style={{ fontSize: 9, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                {noConflict ? 'Conflict search completed. No conflicts identified.' : 'Search Clio for conflicts before proceeding.'}
              </div>
            </div>
          </div>
          {!noConflict && (
            <button
              type="button"
              onClick={() => setNoConflict(true)}
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
              <Icon iconName="Accept" style={{ fontSize: 10 }} />
              Confirm No Conflict
            </button>
          )}
        </div>

        {/* Context tiles — names to search */}
        <div style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Search these names in Clio
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[{ label: 'Client', value: clientDisplayName, icon: 'Contact' },
            { label: 'Description', value: description || inst?.ServiceDescription, icon: 'Suitcase' },
            ...(opponentFirst || opponentLast || opponentCompanyName ? [{ label: 'Opponent', value: opponentType === 'Company' ? opponentCompanyName : `${opponentFirst} ${opponentLast}`.trim(), icon: 'People' }] : []),
            ...(solicitorFirst || solicitorLast ? [{ label: 'Opp. Solicitor', value: `${solicitorFirst} ${solicitorLast}`.trim(), icon: 'ContactInfo' }] : []),
          ].map(tile => {
            const hasVal = !!(tile.value && tile.value.trim());
            return (
              <div key={tile.label} style={{
                flex: 1, minWidth: 100, padding: '8px 10px',
                background: hasVal
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                  : (isDarkMode ? colours.dark.sectionBackground : '#F8FAFC'),
                border: `1px solid ${hasVal
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)')
                  : (isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(0,0,0,0.06)')}`,
                borderRadius: 0,
              }}>
                <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: isDarkMode ? colours.subtleGrey : colours.greyText, marginBottom: 4 }}>{tile.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon iconName={tile.icon} style={{ fontSize: 10, color: hasVal ? colours.highlight : (isDarkMode ? colours.subtleGrey : colours.greyText) }} />
                  <span style={{ fontSize: 10, fontWeight: hasVal ? 600 : 400, fontStyle: hasVal ? 'normal' : 'italic', color: hasVal ? (isDarkMode ? '#E5E7EB' : '#0F172A') : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>{hasVal ? tile.value : 'Not entered'}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reset option when confirmed (OG pattern) */}
        {noConflict && (
          <button
            type="button"
            onClick={() => setNoConflict(false)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)'}`,
              borderRadius: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{
              fontSize: 10,
              color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
            }}>
              Need to re-check conflicts?
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: colours.highlight,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}>
              <Icon iconName="Cancel" style={{ fontSize: 10 }} />
              Reset
            </span>
          </button>
        )}
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleRequestSubmit}
        disabled={!isFormComplete || userDataLoading}
        style={{
          width: '100%', padding: '10px 0',
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
          <><FaFolder size={11} /> Open Matter</>
        )}
      </button>

      {/* Cancel link */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'none', border: 'none', padding: '4px 0',
            fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
          }}
        >
          Cancel
        </button>
      )}
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
