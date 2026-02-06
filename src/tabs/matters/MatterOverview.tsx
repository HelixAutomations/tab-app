import React from 'react';
import { Text, Icon, Link, TooltipHost, mergeStyles } from '@fluentui/react';
import type { Enquiry, NormalizedMatter, TeamData, Transaction } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import InlineWorkbench from '../instructions/InlineWorkbench';

interface MatterOverviewProps {
  matter: NormalizedMatter;
  activeTab?: 'overview' | 'activities' | 'documents' | 'communications' | 'billing';
  userInitials?: string;
  overviewData?: any;
  outstandingData?: any;
  wipStatus?: 'idle' | 'loading' | 'ready' | 'pending' | 'error';
  fundsStatus?: 'idle' | 'loading' | 'ready' | 'pending' | 'error';
  outstandingStatus?: 'idle' | 'loading' | 'ready' | 'error';
  auditEnabled?: boolean;
  auditStatus?: 'idle' | 'loading' | 'ready' | 'error';
  auditData?: any;
  onToggleAudit?: () => void;
  complianceData?: any;
  matterSpecificActivitiesData?: any;
  onEdit?: () => void;
  transactions?: Transaction[];
  workbenchItem?: any;
  enquiries?: Enquiry[] | null;
  teamData?: TeamData[] | null;
}

/* ------------------------------------------------------------------
   STYLES
------------------------------------------------------------------ */

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  });

const entryStyle = mergeStyles({
  animation: 'skeletonCascadeIn 220ms ease-out both',
  willChange: 'opacity, transform',
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
  },
});

const SURFACE_RADIUS = 3;
const BADGE_RADIUS = 2;

const headerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  });

const headerLeftStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flex: 1,
  minWidth: 0,
});

const headerTitleLineStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'Raleway, sans-serif',
    fontSize: 16,
    lineHeight: '20px',
    paddingTop: 1,
    paddingBottom: 1,
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const headerClientStyle = mergeStyles({
  fontWeight: 600,
});

const headerSeparatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '0 8px',
    opacity: isDarkMode ? 0.35 : 0.45,
  });

const headerDescriptionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: 500,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
  });

const matterBadgeStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: BADGE_RADIUS,
    padding: '6px 10px',
    fontWeight: 600,
    color: colours.highlight,
    fontSize: 14,
  });

const statusBadgeStyle = (status: 'active' | 'closed', isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: BADGE_RADIUS,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `1px solid ${
      status === 'active'
        ? (isDarkMode ? 'rgba(34, 197, 94, 0.45)' : 'rgba(34, 197, 94, 0.35)')
        : (isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)')
    }`,
    color:
      status === 'active'
        ? isDarkMode
          ? '#86efac'
          : '#15803d'
        : isDarkMode
        ? '#94a3b8'
        : '#64748b',
  });

const mainLayoutStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  gap: 0,
  flex: 1,
  '@media (max-width: 1024px)': {
    gridTemplateColumns: '1fr',
  },
});

const leftColumnStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
  });

const rightColumnStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    borderLeft: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    '@media (max-width: 1024px)': {
      borderLeft: 'none',
      borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    },
  });

const metricsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 16,
});

const metricCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: SURFACE_RADIUS,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    transition: 'background-color 0.15s, border-color 0.15s',
    ':hover': {
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
  });

const metricLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  });

const metricValueStyle = (isDarkMode: boolean, accent?: boolean) =>
  mergeStyles({
    fontSize: 24,
    fontWeight: 700,
    color: accent ? colours.highlight : isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

const sectionCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: SURFACE_RADIUS,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  });

const sectionTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 16,
    fontWeight: 700,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  });

const fieldRowStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '140px 1fr',
  gap: 12,
  alignItems: 'baseline',
});

const fieldLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 13,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
  });

const fieldValueStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 14,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    wordBreak: 'break-word',
  });

const clientFieldValueStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    fontWeight: 500,
    color: isDarkMode ? 'rgba(243, 244, 246, 0.78)' : 'rgba(15, 23, 42, 0.72)',
    wordBreak: 'break-word',
  });

const detailsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
});

const detailsTeamGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 20,
  alignItems: 'start',
  '@media (max-width: 1024px)': {
    gridTemplateColumns: '1fr',
  },
});

const avatarStyle = (bgColor: string) =>
  mergeStyles({
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: bgColor,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  });

const teamRowStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
});

const teamGridStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
});

const clientActionButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: 32,
    height: 32,
    borderRadius: BADGE_RADIUS,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.grey,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
  });

const contactRowStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

const copyChipStyle = (isCopied: boolean, isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    flexShrink: 0,
    borderRadius: 5,
    border: isCopied
      ? `1px solid ${isDarkMode ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.38)'}`
      : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)'}`,
    background: isCopied
      ? (isDarkMode ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)')
      : 'transparent',
    color: isCopied
      ? '#10B981'
      : (isDarkMode ? 'rgba(203, 213, 225, 0.5)' : 'rgba(71, 85, 105, 0.55)'),
    cursor: 'pointer',
    padding: 0,
    opacity: isCopied ? 1 : 0.6,
    transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, background 160ms ease',
    ':hover': {
      opacity: isCopied ? 1 : 0.9,
      borderColor: isCopied
        ? (isDarkMode ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.5)')
        : (isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.3)'),
    },
  });

const clientFieldStackStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

const progressBarStyle = (isDarkMode: boolean) =>
  mergeStyles({
    height: 8,
    borderRadius: 2,
    backgroundColor: isDarkMode ? colours.dark.border : '#e5e7eb',
    overflow: 'hidden',
    position: 'relative',
  });

const progressFillStyle = (percentage: number) =>
  mergeStyles({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: `${percentage}%`,
    backgroundColor: '#16a34a',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  });

const metricSkeletonStyle = (isDarkMode: boolean, width = '72%') =>
  mergeStyles({
    height: 26,
    width,
    borderRadius: 6,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  });

const metricSubSkeletonStyle = (isDarkMode: boolean, width = '60%') =>
  mergeStyles({
    height: 12,
    width,
    borderRadius: 4,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
  });

const processingHintStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 11,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
  });

/* ------------------------------------------------------------------
   COMPONENT
------------------------------------------------------------------ */

const MatterOverview: React.FC<MatterOverviewProps> = ({
  matter,
  userInitials,
  activeTab,
  overviewData,
  outstandingData,
  wipStatus = 'idle',
  fundsStatus = 'idle',
  outstandingStatus = 'idle',
  auditEnabled = false,
  auditStatus = 'idle',
  auditData,
  onToggleAudit = () => {},
  workbenchItem,
  enquiries,
  teamData,
}) => {
  const { isDarkMode } = useTheme();
  const [copiedContact, setCopiedContact] = React.useState<'email' | 'phone' | null>(null);
  const [clioClientStatus, setClioClientStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [clioClient, setClioClient] = React.useState<any | null>(null);

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const hasWiredDetailData = Boolean(overviewData || outstandingData);

  const isWipLoading = wipStatus === 'loading';
  const isWipReady = wipStatus === 'ready';
  const isFundsLoading = fundsStatus === 'loading';
  const isFundsReady = fundsStatus === 'ready';
  const isOutstandingLoading = outstandingStatus === 'loading';
  const isOutstandingReady = outstandingStatus === 'ready';

  // Helpers
  const fmt = (v?: string | null): string =>
    v && String(v).trim().length > 0 ? String(v) : '—';

  const handleCopy = React.useCallback(async (value: string, key: 'email' | 'phone') => {
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.left = '-1000px';
        textarea.style.top = '-1000px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedContact(key);
      window.setTimeout(() => {
        setCopiedContact((prev) => (prev === key ? null : prev));
      }, 1500);
    } catch {
      // silent fail
    }
  }, []);

  const fmtDate = (v?: string | null): string => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
  };

  const fmtCurrency = (n?: number | null): string => {
    try {
      const val = typeof n === 'number' && isFinite(n) ? n : 0;
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(val);
    } catch {
      return '£0';
    }
  };

  const safeNumber = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && isFinite(v) ? v : fallback;

  const get = (obj: unknown, key: string): unknown =>
    obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;

  const getPipelineValue = (fields: string[], fallback = ''): string => {
    const sources = [pipelineInstruction, pipelinePrimaryClient, pipelineDeal];
    for (const field of fields) {
      for (const source of sources) {
        const value = source?.[field as keyof typeof source] as unknown;
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim().length === 0) continue;
        return String(value);
      }
    }
    return fallback;
  };

  const formatLongDate = (raw?: string | null): string => {
    if (!raw) return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatAddress = (parts: Array<string | null | undefined>): string => {
    const cleaned = parts
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter((part) => part.length > 0);
    return cleaned.length > 0 ? cleaned.join(', ') : '—';
  };

  const getInitials = (full?: string): string => {
    const s = (full || '').trim();
    if (!s) return '—';
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const parseInstructionRef = (ref?: string) => {
    const raw = (ref || '').trim();
    if (!raw) return { instructionRef: undefined, prospectId: undefined, passcode: undefined };
    const match = raw.match(/^(?:[A-Z]+-?)?(\d+)-(\d+)/i);
    const prospectId = match ? match[1] : undefined;
    const passcode = match ? match[2] : undefined;
    const canonicalRef = raw.toUpperCase().startsWith('HLX') && prospectId && passcode
      ? `HLX-${prospectId}-${passcode}`
      : raw;
    return {
      instructionRef: canonicalRef,
      prospectId,
      passcode,
    };
  };

  const pipelineLink = parseInstructionRef(matter.instructionRef);
  const isPipelineLinked = matter.dataSource === 'vnet_direct' && Boolean(pipelineLink.instructionRef);
  const isLegacyMatter = !isPipelineLinked;

  const fetchClioClient = React.useCallback(async () => {
    if (!matter.clientId || !userInitials) return;
    setClioClientStatus('loading');
    try {
      const resp = await fetch(`/api/clio-client-query/${encodeURIComponent(String(matter.clientId))}/${encodeURIComponent(userInitials)}`);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const client = data?.client || null;
      setClioClient(client);
      setClioClientStatus(client ? 'ready' : 'error');
    } catch {
      setClioClient(null);
      setClioClientStatus('error');
    }
  }, [matter.clientId, userInitials]);

  React.useEffect(() => {
    if (!isLegacyMatter) return;
    if (!matter.clientId || !userInitials) return;
    fetchClioClient();
  }, [fetchClioClient, isLegacyMatter, matter.clientId, userInitials]);

  const baseWorkbenchItem = React.useMemo<any | null>(() => {
    if (workbenchItem) {
      return workbenchItem;
    }
    if (!pipelineLink.instructionRef) return null;

    const nameParts = (matter.clientName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    const instruction = {
      InstructionRef: pipelineLink.instructionRef,
      FirstName: firstName,
      LastName: lastName,
      Forename: firstName,
      Surname: lastName,
      ClientEmail: matter.clientEmail,
      Email: matter.clientEmail,
      ClientPhone: matter.clientPhone,
      Phone_Number: matter.clientPhone,
      AreaOfWork: matter.practiceArea,
      PracticeArea: matter.practiceArea,
      Description: matter.description,
      MatterId: matter.matterId,
      MatterID: matter.matterId,
      DisplayNumber: matter.displayNumber,
      MatterOpenDate: matter.openDate,
    };

    const deal = {
      InstructionRef: pipelineLink.instructionRef,
      ProspectId: pipelineLink.prospectId,
      Passcode: pipelineLink.passcode,
      ServiceDescription: matter.description,
      AreaOfWork: matter.practiceArea,
    };

    return {
      instruction,
      deal,
      enquiry: null,
      prospectId: pipelineLink.prospectId,
      documents: [],
      payments: [],
      risk: null,
      eid: null,
      eids: [],
      clients: matter.clientEmail
        ? [{ ClientEmail: matter.clientEmail, Lead: true }]
        : [],
      matters: matter.matterId
        ? [{ MatterId: matter.matterId, DisplayNumber: matter.displayNumber }]
        : [],
    };
  }, [workbenchItem, pipelineLink.instructionRef, pipelineLink.passcode, pipelineLink.prospectId, matter]);

  const pipelineInstruction = baseWorkbenchItem?.instruction || null;
  const pipelineDeal = baseWorkbenchItem?.deal || null;
  const pipelineClients = Array.isArray(baseWorkbenchItem?.clients)
    ? baseWorkbenchItem.clients
    : [];
  const pipelinePrimaryClient = pipelineClients[0] || null;

  const normaliseId = (value: any): string | null => {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return String(numeric);
    return raw.toLowerCase();
  };

  const resolveEnquiryKeys = (enquiry: any): string[] => {
    // Schema-based matching:
    // - legacy enquiries: ID
    // - new enquiries: acid (prospectId from Deals)
    const rawKeys = [
      enquiry?.ID,
      enquiry?.id,
      enquiry?.acid,
      enquiry?.ACID,
      enquiry?.Acid,
    ];
    return rawKeys.map(normaliseId).filter(Boolean) as string[];
  };

  const enquiryProspectId = React.useMemo(() => {
    return (
      baseWorkbenchItem?.deal?.ProspectId ||
      baseWorkbenchItem?.ProspectId ||
      baseWorkbenchItem?.prospectId ||
      baseWorkbenchItem?.instruction?.ProspectId ||
      pipelineLink.prospectId ||
      null
    );
  }, [baseWorkbenchItem, pipelineLink.prospectId]);

  const [directEnquiry, setDirectEnquiry] = React.useState<Enquiry | null>(null);

  React.useEffect(() => {
    if (!isPipelineLinked) return;
    const candidateKey = normaliseId(enquiryProspectId);
    if (!candidateKey) return;
    if (enquiries?.some((enquiry) => resolveEnquiryKeys(enquiry).includes(candidateKey))) return;

    let cancelled = false;
    setDirectEnquiry(null);

    (async () => {
      try {
        const params = new URLSearchParams({
          prospectId: candidateKey,
          limit: '50',
        });
        const resp = await fetch(`/api/enquiries-unified?${params.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const rawEnquiries = Array.isArray(data)
          ? data
          : (Array.isArray(data.enquiries) ? data.enquiries : []);

        const normalised = rawEnquiries.map((raw: any) => ({
          ...raw,
          ID: raw.ID || raw.id?.toString(),
          Touchpoint_Date: raw.Touchpoint_Date || raw.datetime,
          Point_of_Contact: raw.Point_of_Contact || raw.poc,
          Area_of_Work: raw.Area_of_Work || raw.aow,
          Type_of_Work: raw.Type_of_Work || raw.tow,
          Method_of_Contact: raw.Method_of_Contact || raw.moc,
          First_Name: raw.First_Name || raw.first,
          Last_Name: raw.Last_Name || raw.last,
          Email: raw.Email || raw.email,
          Phone_Number: raw.Phone_Number || raw.phone,
          Value: raw.Value || raw.value,
          Initial_first_call_notes: raw.Initial_first_call_notes || raw.notes,
          Call_Taker: raw.Call_Taker || raw.rep,
        })) as Enquiry[];

        const found = normalised.find((enquiry) => resolveEnquiryKeys(enquiry).includes(candidateKey)) || null;
        if (!cancelled) setDirectEnquiry(found);
      } catch {
        if (!cancelled) setDirectEnquiry(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enquiries, enquiryProspectId, isPipelineLinked]);

  // DEBUG: Log enquiries matching
  React.useEffect(() => {
    console.log('[MatterOverview] enquiries prop:', enquiries?.length, 'items');
    console.log('[MatterOverview] matter.clientEmail:', matter.clientEmail);
    if (enquiries && enquiries.length > 0) {
      const sample = enquiries.slice(0, 3).map(e => ({ id: e.ID, email: e.Email || (e as any).email, notes: (e as any).notes?.substring?.(0, 50) || (e as any).Initial_first_call_notes?.substring?.(0, 50) }));
      console.log('[MatterOverview] sample enquiries:', sample);
    }
  }, [enquiries, matter.clientEmail]);

  const matchedEnquiry = React.useMemo<Enquiry | null>(() => {
    const enquiryList = enquiries ?? [];
    if (enquiryList.length === 0 && !directEnquiry) return null;
    const candidateKey = normaliseId(enquiryProspectId);
    if (directEnquiry && (!candidateKey || resolveEnquiryKeys(directEnquiry).includes(candidateKey))) {
      return directEnquiry;
    }
    const byId = candidateKey
      ? enquiryList.find((enquiry) => resolveEnquiryKeys(enquiry).includes(candidateKey))
      : null;
    if (byId) return byId;

    const normalise = (value?: string | null) => (value || '').toString().trim().toLowerCase();
    const instructionRef = pipelineLink.instructionRef ? normalise(pipelineLink.instructionRef) : '';
    if (instructionRef) {
      const byRef = enquiryList.find((enquiry) => {
        const enquiryRecord = enquiry as any;
        const ref = normalise(
          enquiryRecord?.InstructionRef ||
          enquiryRecord?.instructionRef ||
          enquiryRecord?.Instruction_Ref ||
          enquiryRecord?.instruction_ref ||
          enquiryRecord?.Matter_Ref ||
          enquiryRecord?.matterRef ||
          enquiryRecord?.matter_ref
        );
        return ref !== '' && ref === instructionRef;
      });
      if (byRef) return byRef as Enquiry;
    }

    const email = normalise(
      matter.clientEmail ||
      pipelineInstruction?.Email ||
      pipelineInstruction?.ClientEmail ||
      pipelinePrimaryClient?.ClientEmail ||
      pipelinePrimaryClient?.Email
    );
    if (email) {
      const matches = enquiryList.filter((enquiry) => {
        const enquiryRecord = enquiry as any;
        const enquiryEmail = normalise(enquiryRecord?.Email || enquiryRecord?.email || enquiryRecord?.ClientEmail);
        return enquiryEmail && enquiryEmail === email;
      });
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        const firstName = normalise(matter.clientName?.split(/\s+/)[0] || pipelineInstruction?.FirstName || pipelineInstruction?.Forename);
        const lastName = normalise(matter.clientName?.split(/\s+/).slice(1).join(' ') || pipelineInstruction?.LastName || pipelineInstruction?.Surname);
        const byName = matches.find((enquiry) => {
          const enquiryRecord = enquiry as any;
          const enquiryFirst = normalise(enquiryRecord?.First_Name || enquiryRecord?.first || enquiryRecord?.FirstName);
          const enquiryLast = normalise(enquiryRecord?.Last_Name || enquiryRecord?.last || enquiryRecord?.LastName);
          return (!firstName || enquiryFirst === firstName) && (!lastName || enquiryLast === lastName);
        });
        if (byName) return byName;
        const withNotes = matches.find((enquiry) => {
          const enquiryRecord = enquiry as any;
          return String(enquiryRecord?.Initial_first_call_notes || enquiryRecord?.notes || '').trim().length > 0;
        });
        if (withNotes) return withNotes;
        return matches[0];
      }
    }

    return null;
  }, [baseWorkbenchItem, directEnquiry, enquiries, enquiryProspectId, matter.clientEmail, matter.clientName, pipelineInstruction, pipelineLink.instructionRef, pipelineLink.prospectId, pipelinePrimaryClient]);

  // DEBUG: Log matched enquiry result
  React.useEffect(() => {
    console.log('[MatterOverview] matchedEnquiry:', matchedEnquiry);
    if (matchedEnquiry) {
      console.log('[MatterOverview] matchedEnquiry.notes:', (matchedEnquiry as any).notes);
      console.log('[MatterOverview] matchedEnquiry.Initial_first_call_notes:', matchedEnquiry.Initial_first_call_notes);
    }
  }, [matchedEnquiry]);

  const derivedWorkbenchItem = React.useMemo<any | null>(() => {
    if (!baseWorkbenchItem) return null;
    return matchedEnquiry
      ? { ...baseWorkbenchItem, enquiry: matchedEnquiry }
      : baseWorkbenchItem;
  }, [baseWorkbenchItem, matchedEnquiry]);

  const pipelineName = (() => {
    const first = pipelineInstruction?.FirstName || pipelineInstruction?.Forename || pipelineInstruction?.first_name || '';
    const last = pipelineInstruction?.LastName || pipelineInstruction?.Surname || pipelineInstruction?.last_name || '';
    const combined = `${first} ${last}`.trim();
    return combined || pipelineInstruction?.ClientName || pipelineInstruction?.client_name || '';
  })();

  const pipelineTitle = getPipelineValue(['Title', 'title', 'Salutation', 'ClientTitle']);
  const pipelineGender = getPipelineValue(['Gender', 'gender', 'Sex', 'sex']);
  const pipelineNationality = getPipelineValue(['Nationality', 'nationality']);
  const pipelineDobRaw = getPipelineValue(['DateOfBirth', 'dateOfBirth', 'DOB']);
  const pipelineDob = formatLongDate(pipelineDobRaw || undefined);
  const pipelineAge = React.useMemo(() => {
    if (!pipelineDobRaw) return '—';
    const parsed = new Date(pipelineDobRaw);
    if (Number.isNaN(parsed.getTime())) return '—';
    const diff = Date.now() - parsed.getTime();
    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    return Number.isFinite(years) ? String(years) : '—';
  }, [pipelineDobRaw]);

  const pipelineHouseNum = getPipelineValue(['HouseNumber', 'houseNumber'], '');
  const pipelineStreet = getPipelineValue(['Street', 'street'], '');
  const pipelineStreetFull = `${pipelineHouseNum} ${pipelineStreet}`.trim();
  const pipelineCity = getPipelineValue(['City', 'city', 'Town'], '');
  const pipelineCounty = getPipelineValue(['County', 'county'], '');
  const pipelinePostcode = getPipelineValue(['Postcode', 'postcode', 'PostCode'], '');
  const pipelineCountry = getPipelineValue(['Country', 'country'], '');

  const pipelineCompanyName = getPipelineValue(['CompanyName', 'Company', 'company']);
  const pipelineCompanyNo = getPipelineValue(['CompanyNumber', 'companyNumber', 'CompanyNo']);
  const pipelineCompanyCountry = getPipelineValue(['CompanyCountry', 'companyCountry']);
  const pipelineCompanyHouseNum = getPipelineValue(['CompanyHouseNumber', 'companyHouseNumber'], '');
  const pipelineCompanyStreet = getPipelineValue(['CompanyStreet', 'companyStreet'], '');
  const pipelineCompanyStreetFull = `${pipelineCompanyHouseNum} ${pipelineCompanyStreet}`.trim();
  const pipelineCompanyCity = getPipelineValue(['CompanyCity', 'companyCity'], '');
  const pipelineCompanyCounty = getPipelineValue(['CompanyCounty', 'companyCounty'], '');
  const pipelineCompanyPostcode = getPipelineValue(['CompanyPostcode', 'companyPostcode'], '');
  const pipelineClientType = getPipelineValue(['ClientType', 'clientType', 'Client_Type', 'Type']);
  const isPipelineCompany =
    Boolean(pipelineCompanyName) || pipelineClientType.toLowerCase() === 'company';

  const pipelineEmail =
    pipelineInstruction?.ClientEmail ||
    pipelineInstruction?.Email ||
    pipelinePrimaryClient?.ClientEmail ||
    pipelinePrimaryClient?.email ||
    '';

  const pipelinePhone =
    pipelineInstruction?.ClientPhone ||
    pipelineInstruction?.Phone_Number ||
    pipelineInstruction?.Phone ||
    pipelinePrimaryClient?.ClientPhone ||
    pipelinePrimaryClient?.phone ||
    '';

  const clioClientName =
    clioClient?.name ||
    clioClient?.company?.name ||
    `${clioClient?.first_name || ''} ${clioClient?.last_name || ''}`.trim();
  const clioEmail =
    clioClient?.primary_email_address ||
    clioClient?.email_addresses?.find((e: any) => e?.default_email)?.address ||
    clioClient?.email_addresses?.[0]?.address ||
    '';
  const clioPhone =
    clioClient?.primary_phone_number ||
    clioClient?.phone_numbers?.find((p: any) => p?.default_number)?.number ||
    clioClient?.phone_numbers?.[0]?.number ||
    '';
  const clioDob = clioClient?.date_of_birth || '';
  const clioAddress = clioClient?.addresses?.[0] || null;
  const clioAddressText = clioAddress
    ? formatAddress([
        clioAddress?.street,
        clioAddress?.city,
        clioAddress?.province,
        clioAddress?.postal_code,
        clioAddress?.country,
      ])
    : '—';
  const clioType = clioClient?.type || '';
  const hasClioClient = isLegacyMatter && clioClientStatus === 'ready' && clioClient;

  const displayClientName = isPipelineLinked && pipelineName
    ? pipelineName
    : hasClioClient
      ? clioClientName || matter.clientName
      : matter.clientName;
  const displayClientEmail = isPipelineLinked && pipelineEmail
    ? pipelineEmail
    : hasClioClient
      ? clioEmail || matter.clientEmail
      : matter.clientEmail;
  const displayClientPhone = isPipelineLinked && pipelinePhone
    ? pipelinePhone
    : hasClioClient
      ? clioPhone || matter.clientPhone
      : matter.clientPhone;
  const displayCompanyName = isPipelineLinked && isPipelineCompany
    ? pipelineCompanyName || displayClientName
    : '';
  const displayPrimaryName = displayCompanyName || displayClientName;
  const displayContactName = isPipelineLinked && isPipelineCompany
    ? pipelineName || displayClientName
    : '';
  const displayContactLabel = displayCompanyName
    ? (pipelineTitle ? `${pipelineTitle} ${fmt(displayContactName)}` : fmt(displayContactName))
    : '';
  const displayPersonAddress = isPipelineLinked
    ? formatAddress([
        pipelineStreetFull || pipelineStreet,
        pipelineCity,
        pipelineCounty,
        pipelinePostcode,
        pipelineCountry,
      ])
    : hasClioClient
      ? clioAddressText
      : '—';
  const displayCompanyAddress = isPipelineLinked && isPipelineCompany
    ? formatAddress([
        pipelineCompanyStreetFull || pipelineCompanyStreet,
        pipelineCompanyCity,
        pipelineCompanyCounty,
        pipelineCompanyPostcode,
        pipelineCompanyCountry || pipelineCountry,
      ])
    : '—';

  // Derived metrics
  const billableAmount = safeNumber(get(overviewData, 'billableAmount'));
  const billableHours = safeNumber(get(overviewData, 'billableHours'));
  const nonBillableAmount = safeNumber(get(overviewData, 'nonBillableAmount'));
  const nonBillableHours = safeNumber(get(overviewData, 'nonBillableHours'));
  const outstandingBalance = safeNumber(
    get(outstandingData, 'total_outstanding_balance') ??
      get(outstandingData, 'due') ??
      get(outstandingData, 'balance')
  );
  const clientFunds = safeNumber(get(overviewData, 'clientFunds'));
  const totalAmount = billableAmount + nonBillableAmount;
  const billablePct = totalAmount > 0 ? Math.round((billableAmount / totalAmount) * 100) : 0;
  const totalHours = billableHours + nonBillableHours;

  const workbenchMatter = Array.isArray(derivedWorkbenchItem?.matters)
    ? derivedWorkbenchItem.matters[0]
    : null;
  const workbenchMatterId =
    workbenchMatter?.MatterId || workbenchMatter?.MatterID || workbenchMatter?.id || null;
  const workbenchDisplayNumber =
    workbenchMatter?.DisplayNumber || workbenchMatter?.display_number || workbenchMatter?.displayNumber || null;
  const headerDisplayNumber = workbenchDisplayNumber || matter.displayNumber || matter.instructionRef || matter.matterId;
  const headerClientName = displayPrimaryName || matter.clientName;

  const clioUrl = (() => {
    const dn = headerDisplayNumber;
    return dn && dn !== '—'
      ? `https://eu.app.clio.com/nc/#/matters/${encodeURIComponent(dn)}`
      : undefined;
  })();
  const isMatterRequest = (matter.originalStatus || '').toLowerCase() === 'matterrequest';
  const auditAllowed = matter.dataSource === 'vnet_direct';
  const auditFields = Array.isArray(auditData?.fields) ? auditData.fields : [];
  const auditUnlinked = auditData?.status === 'unlinked';
  const auditHasMismatch = auditFields.some((field: any) => field?.status === 'mismatch');

  const teamMembers = [
    {
      role: 'Responsible',
      name: matter.responsibleSolicitor,
      color: '#22c55e',
    },
    {
      role: 'Originating',
      name: matter.originatingSolicitor,
      color: '#0ea5e9',
    },
    {
      role: 'Supervising',
      name: matter.supervisingPartner,
      color: '#f59e0b',
    },
  ].filter((m) => m.name && m.name.trim());

  return (
    <div className={`${containerStyle(isDarkMode)} ${entryStyle}`}>
      {/* Header */}
      <div className={headerStyle(isDarkMode)}>
        <div className={headerLeftStyle}>
          <div className={matterBadgeStyle(isDarkMode)}>
            <Icon iconName="OpenFolderHorizontal" styles={{ root: { fontSize: 16 } }} />
            {clioUrl ? (
              <Link
                href={clioUrl}
                target="_blank"
                styles={{
                  root: {
                    color: colours.highlight,
                    fontWeight: 600,
                    textDecoration: 'none',
                    ':hover': { textDecoration: 'underline' },
                  },
                }}
              >
                {fmt(headerDisplayNumber)}
              </Link>
            ) : (
              <span>{fmt(headerDisplayNumber)}</span>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className={headerTitleLineStyle(isDarkMode)}>
              {headerClientName ? (
                <>
                  <span className={headerClientStyle}>{fmt(headerClientName)}</span>
                  <span className={headerSeparatorStyle(isDarkMode)}>•</span>
                  <span className={headerDescriptionStyle(isDarkMode)}>
                    {fmt(matter.matterName || matter.description)}
                  </span>
                </>
              ) : (
                <span className={headerClientStyle}>{fmt(matter.matterName || matter.description)}</span>
              )}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={statusBadgeStyle(matter.status, isDarkMode)}>
            <Icon
              iconName={matter.status === 'active' ? 'StatusCircleCheckmark' : 'StatusCircleBlock'}
              styles={{ root: { fontSize: 12 } }}
            />
            {matter.status === 'active' ? 'Active' : 'Closed'}
          </div>
        </div>
      </div>

      {/* Tab Navigation moved into the sticky navigator banner (Matters.tsx). */}

      {/* Main Content */}
      <div className={mainLayoutStyle}>
        {/* Left Column - Main Content */}
        <div className={leftColumnStyle(isDarkMode)}>
          {/* Key Metrics */}
          <div className={metricsGridStyle}>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Work in Progress</span>
              {isWipLoading ? (
                <div className={metricSkeletonStyle(isDarkMode)} />
              ) : (
                <span className={metricValueStyle(isDarkMode, true)}>{fmtCurrency(billableAmount)}</span>
              )}
              {isWipLoading ? (
                <div className={metricSubSkeletonStyle(isDarkMode)} />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: isDarkMode ? colours.dark.subText : colours.greyText,
                  }}
                >
                  {billableHours.toFixed(1)}h billable
                </span>
              )}
              {wipStatus === 'loading' && (
                <span className={processingHintStyle(isDarkMode)}>Processing time entries…</span>
              )}
              {wipStatus === 'pending' && (
                <span className={processingHintStyle(isDarkMode)}>Matter not created yet</span>
              )}
              {wipStatus === 'error' && (
                <span className={processingHintStyle(isDarkMode)}>Time entries unavailable</span>
              )}
              {isLocalhost && !hasWiredDetailData && (
                <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Local preview (backend wiring pending)
                </span>
              )}
            </div>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Outstanding</span>
              {isOutstandingLoading ? (
                <div className={metricSkeletonStyle(isDarkMode, '64%')} />
              ) : (
                <span
                  className={metricValueStyle(isDarkMode)}
                  style={{ color: outstandingBalance > 0 ? '#ef4444' : undefined }}
                >
                  {fmtCurrency(outstandingBalance)}
                </span>
              )}
              {isOutstandingLoading ? (
                <div className={metricSubSkeletonStyle(isDarkMode, '50%')} />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: isDarkMode ? colours.dark.subText : colours.greyText,
                  }}
                >
                  Balance due
                </span>
              )}
              {outstandingStatus === 'loading' && (
                <span className={processingHintStyle(isDarkMode)}>Checking outstanding…</span>
              )}
              {outstandingStatus === 'error' && (
                <span className={processingHintStyle(isDarkMode)}>Outstanding unavailable</span>
              )}
              {isLocalhost && !hasWiredDetailData && (
                <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Local preview (backend wiring pending)
                </span>
              )}
            </div>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Client Funds</span>
              {isFundsLoading ? (
                <div className={metricSkeletonStyle(isDarkMode, '58%')} />
              ) : (
                <span
                  className={metricValueStyle(isDarkMode)}
                  style={{ color: clientFunds > 0 ? '#22c55e' : undefined }}
                >
                  {fmtCurrency(clientFunds)}
                </span>
              )}
              {isFundsLoading ? (
                <div className={metricSubSkeletonStyle(isDarkMode, '48%')} />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: isDarkMode ? colours.dark.subText : colours.greyText,
                  }}
                >
                  On account
                </span>
              )}
              {fundsStatus === 'loading' && (
                <span className={processingHintStyle(isDarkMode)}>Fetching client funds…</span>
              )}
              {fundsStatus === 'pending' && (
                <span className={processingHintStyle(isDarkMode)}>Matter not created yet</span>
              )}
              {fundsStatus === 'error' && (
                <span className={processingHintStyle(isDarkMode)}>Client funds unavailable</span>
              )}
            </div>
            <div className={metricCardStyle(isDarkMode)}>
              <span className={metricLabelStyle(isDarkMode)}>Total Hours</span>
              {isWipLoading ? (
                <div className={metricSkeletonStyle(isDarkMode, '54%')} />
              ) : (
                <span className={metricValueStyle(isDarkMode)}>{totalHours.toFixed(1)}h</span>
              )}
              {isWipLoading ? (
                <div className={metricSubSkeletonStyle(isDarkMode, '78%')} />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: isDarkMode ? colours.dark.subText : colours.greyText,
                  }}
                >
                  {billableHours.toFixed(1)}h billable / {nonBillableHours.toFixed(1)}h non-billable
                </span>
              )}
              {wipStatus === 'loading' && (
                <span className={processingHintStyle(isDarkMode)}>Calculating totals…</span>
              )}
            </div>
          </div>

          {/* Time Breakdown */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="Clock" styles={{ root: { color: colours.highlight } }} />
              Time Breakdown
            </div>
            {isWipLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className={metricSubSkeletonStyle(isDarkMode, '72%')} />
                <div className={progressBarStyle(isDarkMode)} />
                <div className={metricSubSkeletonStyle(isDarkMode, '80%')} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    Billable: {fmtCurrency(billableAmount)} ({billableHours.toFixed(2)}h)
                  </span>
                  <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                    {billablePct}%
                  </span>
                </div>
                <div className={progressBarStyle(isDarkMode)}>
                  <div className={progressFillStyle(billablePct)} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: isDarkMode ? colours.dark.subText : colours.greyText,
                  }}
                >
                  <span>Billable</span>
                  <span>Non-Billable: {fmtCurrency(nonBillableAmount)} ({nonBillableHours.toFixed(2)}h)</span>
                </div>
              </div>
            )}
          </div>

          {/* Matter Details */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="Info" styles={{ root: { color: colours.highlight } }} />
              Matter Details
            </div>
            <div className={detailsTeamGridStyle}>
              <div className={detailsGridStyle}>
                <div className={fieldRowStyle}>
                  <span className={fieldLabelStyle(isDarkMode)}>Practice Area</span>
                  <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.practiceArea)}</span>
                </div>
                <div className={fieldRowStyle}>
                  <span className={fieldLabelStyle(isDarkMode)}>Description</span>
                  <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.description)}</span>
                </div>
                {matter.instructionRef && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Instruction</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.instructionRef)}</span>
                  </div>
                )}
                {matter.source && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Source</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.source)}</span>
                  </div>
                )}
                {matter.referrer && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Referrer</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.referrer)}</span>
                  </div>
                )}
                {matter.value && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Approx. Value</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.value)}</span>
                  </div>
                )}
                {matter.opponent && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Opponent</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.opponent)}</span>
                  </div>
                )}
                {matter.opponentSolicitor && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Opp. Solicitor</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.opponentSolicitor)}</span>
                  </div>
                )}
                {matter.methodOfContact && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Method</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.methodOfContact)}</span>
                  </div>
                )}
                {matter.rating && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Rating</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.rating)}</span>
                  </div>
                )}
                {matter.originalStatus && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Original Status</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmt(matter.originalStatus)}</span>
                  </div>
                )}
                <div className={fieldRowStyle}>
                  <span className={fieldLabelStyle(isDarkMode)}>Open Date</span>
                  <span className={fieldValueStyle(isDarkMode)}>{fmtDate(matter.openDate)}</span>
                </div>
                {matter.cclDate && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>CCL Date</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmtDate(matter.cclDate)}</span>
                  </div>
                )}
                {matter.closeDate && (
                  <div className={fieldRowStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Close Date</span>
                    <span className={fieldValueStyle(isDarkMode)}>{fmtDate(matter.closeDate)}</span>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: isDarkMode ? colours.dark.subText : colours.greyText,
                  }}
                >
                  Team
                </span>
                <div className={teamGridStyle}>
                  {teamMembers.map((member, idx) => (
                    <div key={idx} className={fieldRowStyle}>
                      <span className={fieldLabelStyle(isDarkMode)}>{member.role}</span>
                      <TooltipHost content={`${member.name} (${member.role})`}>
                        <span className={fieldValueStyle(isDarkMode)}>{member.name}</span>
                      </TooltipHost>
                    </div>
                  ))}
                  {teamMembers.length === 0 && (
                    <span style={{ color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                      No team members assigned
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Origin & Pipeline (new matters only) */}
          {isPipelineLinked && (
            <div className={sectionCardStyle(isDarkMode)}>
              <div className={sectionTitleStyle(isDarkMode)}>
                <Icon iconName="Timeline" styles={{ root: { color: colours.highlight } }} />
                Origin & Pipeline
              </div>
              {derivedWorkbenchItem ? (
                <div style={{ marginTop: 4 }}>
                  <InlineWorkbench
                    item={derivedWorkbenchItem}
                    isDarkMode={isDarkMode}
                    enableContextStageChips={true}
                    teamData={teamData}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className={fieldValueStyle(isDarkMode)}>
                    Pipeline details will appear once an Instruction is linked to this Matter.
                  </span>
                  <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                    This area will mirror risk, ID checks, payments, and documents from the existing workbench.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column - Client Sidebar */}
        <div className={rightColumnStyle(isDarkMode)}>
          {/* Client Card */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="Contact" styles={{ root: { color: colours.highlight } }} />
              Client
            </div>
            {isLegacyMatter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={fetchClioClient}
                  disabled={!matter.clientId || !userInitials || clioClientStatus === 'loading'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 14,
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.3)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255,255,255,0.7)',
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : '#1f2937',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: (!matter.clientId || !userInitials || clioClientStatus === 'loading') ? 'not-allowed' : 'pointer',
                    opacity: (!matter.clientId || !userInitials) ? 0.5 : 1,
                  }}
                >
                  {clioClientStatus === 'loading'
                    ? 'Fetching from Clio…'
                    : clioClientStatus === 'ready'
                      ? 'Refresh from Clio'
                      : 'Fetch from Clio'}
                </button>
                {clioClientStatus === 'error' && (
                  <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                    Clio client unavailable.
                  </span>
                )}
                {!matter.clientId && (
                  <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                    Client ID missing for Clio hydration.
                  </span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isMatterRequest && !matter.instructionRef && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Matter request placeholder — client details will appear once an Instruction is linked.
                </span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Link
                  href="#"
                  styles={{
                    root: {
                      fontWeight: 600,
                      color: colours.highlight,
                      fontSize: 15,
                    },
                  }}
                >
                  {pipelineTitle && !displayCompanyName
                    ? `${pipelineTitle} ${fmt(displayPrimaryName)}`
                    : fmt(displayPrimaryName)}
                </Link>
                {displayCompanyName && displayContactName && (
                  <span
                    style={{
                      fontSize: 12,
                      color: isDarkMode ? colours.dark.subText : colours.greyText,
                    }}
                  >
                    Contact: {displayContactLabel}
                  </span>
                )}
                {(displayClientEmail || displayClientPhone) && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 6,
                      fontSize: 12,
                      color: isDarkMode ? colours.dark.subText : colours.greyText,
                      lineHeight: '16px',
                    }}
                  >
                    {displayClientEmail && (
                      <div className={contactRowStyle}>
                        <a
                          href={`mailto:${displayClientEmail}`}
                          style={{
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            opacity: isDarkMode ? 0.78 : 0.8,
                            textDecoration: 'none',
                            fontWeight: 500,
                            minWidth: 0,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                        >
                          {displayClientEmail}
                        </a>
                        <button
                          type="button"
                          className={copyChipStyle(copiedContact === 'email', isDarkMode)}
                          onClick={() => handleCopy(displayClientEmail, 'email')}
                          aria-label={copiedContact === 'email' ? 'Copied email' : 'Copy email'}
                          title={copiedContact === 'email' ? 'Copied' : 'Copy email'}
                        >
                          <Icon
                            iconName={copiedContact === 'email' ? 'CompletedSolid' : 'Copy'}
                            styles={{
                              root: {
                                fontSize: 10,
                                color: copiedContact === 'email' ? '#10B981' : undefined,
                              },
                            }}
                          />
                        </button>
                      </div>
                    )}
                    {displayClientPhone && (
                      <div className={contactRowStyle}>
                        <a
                          href={`tel:${displayClientPhone}`}
                          style={{
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            opacity: isDarkMode ? 0.78 : 0.8,
                            textDecoration: 'none',
                            fontWeight: 500,
                            minWidth: 0,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                        >
                          {displayClientPhone}
                        </a>
                        <button
                          type="button"
                          className={copyChipStyle(copiedContact === 'phone', isDarkMode)}
                          onClick={() => handleCopy(displayClientPhone, 'phone')}
                          aria-label={copiedContact === 'phone' ? 'Copied phone' : 'Copy phone'}
                          title={copiedContact === 'phone' ? 'Copied' : 'Copy phone'}
                        >
                          <Icon
                            iconName={copiedContact === 'phone' ? 'CompletedSolid' : 'Copy'}
                            styles={{
                              root: {
                                fontSize: 10,
                                color: copiedContact === 'phone' ? '#10B981' : undefined,
                              },
                            }}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isLegacyMatter ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    opacity: clioClientStatus === 'ready' ? 1 : 0.55,
                  }}
                >
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Type</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(clioType)}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Date of birth</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(formatLongDate(clioDob || undefined))}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Address</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayPersonAddress)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className={clientFieldStackStyle}>
                      <span className={fieldLabelStyle(isDarkMode)}>Gender</span>
                      <span className={clientFieldValueStyle(isDarkMode)}>{fmt(pipelineGender)}</span>
                    </div>
                    <div className={clientFieldStackStyle}>
                      <span className={fieldLabelStyle(isDarkMode)}>Nationality</span>
                      <span className={clientFieldValueStyle(isDarkMode)}>{fmt(pipelineNationality)}</span>
                    </div>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Date of birth</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>
                      {fmt(pipelineDob)}
                      {pipelineAge !== '—' && pipelineAge && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            color: isDarkMode ? colours.dark.subText : colours.greyText,
                          }}
                        >
                          Age {pipelineAge}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Address</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayPersonAddress)}</span>
                  </div>
                </div>
              )}

              {displayCompanyName && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    paddingTop: 12,
                    borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  }}
                >
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Company</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayCompanyName)}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Company no.</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(pipelineCompanyNo)}</span>
                  </div>
                  <div className={clientFieldStackStyle}>
                    <span className={fieldLabelStyle(isDarkMode)}>Company addr</span>
                    <span className={clientFieldValueStyle(isDarkMode)}>{fmt(displayCompanyAddress)}</span>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  paddingTop: 12,
                  borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                }}
              >
                {displayClientPhone && (
                  <TooltipHost content={`Call ${displayClientPhone}`}>
                    <a
                      href={`tel:${displayClientPhone}`}
                      className={clientActionButtonStyle(isDarkMode)}
                      aria-label="Call Client"
                    >
                      <Icon
                        iconName="Phone"
                        styles={{
                          root: { color: isDarkMode ? colours.dark.text : colours.light.text },
                        }}
                      />
                    </a>
                  </TooltipHost>
                )}
                {displayClientEmail && (
                  <TooltipHost content={`Email ${displayClientEmail}`}>
                    <a
                      href={`mailto:${displayClientEmail}`}
                      className={clientActionButtonStyle(isDarkMode)}
                      aria-label="Email Client"
                    >
                      <Icon
                        iconName="Mail"
                        styles={{
                          root: { color: isDarkMode ? colours.dark.text : colours.light.text },
                        }}
                      />
                    </a>
                  </TooltipHost>
                )}
              </div>

              {/* Contact is shown inline under the client name; quick actions remain above. */}
            </div>
          </div>

          {/* Quick Info */}
          <div className={sectionCardStyle(isDarkMode)}>
            <div className={sectionTitleStyle(isDarkMode)}>
              <Icon iconName="BulletedList" styles={{ root: { color: colours.highlight } }} />
              Quick Info
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                <span className={fieldLabelStyle(isDarkMode)}>Matter ID</span>
                <span className={clientFieldValueStyle(isDarkMode)}>{fmt(workbenchMatterId || matter.matterId)}</span>
              </div>
              {workbenchMatterId && matter.matterId && String(workbenchMatterId) !== String(matter.matterId) && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Request ID</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{fmt(matter.matterId)}</span>
                </div>
              )}
              {matter.source && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Source</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{matter.source}</span>
                </div>
              )}
              {matter.referrer && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Referrer</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{matter.referrer}</span>
                </div>
              )}
              {matter.value && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Value</span>
                  <span className={clientFieldValueStyle(isDarkMode)}>{matter.value}</span>
                </div>
              )}
              {matter.rating && (
                <div className={fieldRowStyle} style={{ gridTemplateColumns: '90px 1fr' }}>
                  <span className={fieldLabelStyle(isDarkMode)}>Rating</span>
                  <span
                    className={clientFieldValueStyle(isDarkMode)}
                    style={{
                      color:
                        matter.rating === 'Good'
                          ? '#22c55e'
                          : matter.rating === 'Poor'
                          ? '#ef4444'
                          : undefined,
                    }}
                  >
                    {matter.rating}
                  </span>
                </div>
              )}
            </div>
          </div>

          {auditAllowed && (
            <div className={sectionCardStyle(isDarkMode)}>
              <div className={sectionTitleStyle(isDarkMode)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon iconName="Sync" styles={{ root: { color: colours.highlight } }} />
                  Sync audit
                </div>
                <button
                  type="button"
                  onClick={onToggleAudit}
                  style={{
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    background: auditEnabled ? (isDarkMode ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.08)') : 'transparent',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {auditEnabled ? 'Enabled' : 'Enable'}
                </button>
              </div>
              {!auditEnabled && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Enable to compare key fields with Clio.
                </span>
              )}
              {auditEnabled && auditStatus === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className={metricSubSkeletonStyle(isDarkMode, '85%')} />
                  <div className={metricSubSkeletonStyle(isDarkMode, '70%')} />
                </div>
              )}
              {auditEnabled && auditStatus === 'error' && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Sync audit unavailable.
                </span>
              )}
              {auditEnabled && auditStatus === 'ready' && auditUnlinked && (
                <span style={{ fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  Clio matter not linked yet.
                </span>
              )}
              {auditEnabled && auditStatus === 'ready' && !auditUnlinked && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {auditFields.map((field: any) => {
                    const status = field?.status || 'match';
                    const colour =
                      status === 'mismatch'
                        ? '#f59e0b'
                        : status === 'missing'
                        ? (isDarkMode ? colours.dark.subText : colours.greyText)
                        : '#22c55e';
                    return (
                      <div
                        key={field?.key || field?.label}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: colour,
                            opacity: status === 'missing' ? 0.5 : 1,
                          }}
                        />
                        <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
                          {field?.label}
                        </span>
                      </div>
                    );
                  })}
                  {auditHasMismatch && (
                    <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                      Amber dots indicate mismatches.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data Source Badge */}
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: isDarkMode
                ? 'rgba(54, 144, 206, 0.1)'
                : 'rgba(54, 144, 206, 0.05)',
              borderRadius: BADGE_RADIUS,
              fontSize: 11,
              color: isDarkMode ? colours.dark.subText : colours.greyText,
              textAlign: 'center',
            }}
          >
            <TooltipHost
              content={isPipelineLinked
                ? 'New space (v2) — this matter is linked to the pipeline, so you can see origin, stages, and live workbench context. No action needed.'
                : 'Legacy space (v1) — this matter uses the classic view. Client details are pulled from Clio and will stay consistent here while we migrate.'}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 6px',
                  borderRadius: 999,
                  border: `1px solid ${isDarkMode ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.25)'}`,
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(14, 116, 144, 0.22), rgba(30, 41, 59, 0.45))'
                    : 'linear-gradient(135deg, rgba(224, 242, 254, 0.9), rgba(255, 255, 255, 0.95))',
                  fontSize: 10,
                  fontWeight: 600,
                  color: isDarkMode ? 'rgba(186, 230, 253, 0.95)' : 'rgba(8, 145, 178, 0.85)',
                  cursor: 'default',
                  marginLeft: 6,
                }}
              >
                <Icon iconName="Info" styles={{ root: { fontSize: 10, opacity: 0.8 } }} />
                {isPipelineLinked ? 'v2 · Origin' : 'v1 · Clio'}
              </span>
            </TooltipHost>
            {!isPipelineLinked && <span style={{ marginLeft: 6 }}>· Clio hydration planned</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatterOverview;
