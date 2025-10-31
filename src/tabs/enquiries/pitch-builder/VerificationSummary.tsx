import React from 'react';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';

/**
 * A compact, theme-aware summary of the effective details used for substitutions in Pitch Builder.
 * Shows fee earner info (name, initials, role, rate), enquiry id, amount, passcode, and instruction link,
 * plus a small indicator of the data source (server route vs default).
 */
export interface VerificationSummaryProps {
  isDarkMode: boolean;
  /** Effective user data array (first element used). */
  userData: UserData[] | null | undefined;
  enquiry: Enquiry;
  /** Amount as string or number, formatted to £ on render. */
  amount?: string | number;
  passcode?: string;
  /** True if the /api/pitch-team route supplied data; false if using default userData. */
  usedPitchRoute: boolean;
  /** Trigger a client preview panel/drawer in parent with computed link */
  onPreview?: (link: string) => void;
}

function formatPounds(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  const withDecimals = num.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `£${withDecimals.replace(/\.00$/, '')}`;
}

function buildInstructionLink(passcode?: string): string {
  // Match emailUtils: prefer build-time injected env, fall back to production URL
  const baseUrl = process.env.REACT_APP_INSTRUCTIONS_URL || 'https://instruct.helix-law.com';
  return passcode ? `${baseUrl}/pitch/${passcode}` : `${baseUrl}/pitch`;
}

export const VerificationSummary: React.FC<VerificationSummaryProps> = ({
  isDarkMode,
  userData,
  enquiry,
  amount,
  passcode,
  usedPitchRoute,
  onPreview,
}) => {
  // Inject enhanced styles for modern design patterns
  if (typeof window !== 'undefined' && !document.getElementById('verification-summary-style')) {
    const style = document.createElement('style');
    style.id = 'verification-summary-style';
    style.innerHTML = `
      @keyframes vs-flip-in { from { transform: rotateY(90deg); opacity: 0; } to { transform: rotateY(0); opacity: 1; } }
      @keyframes vs-pulse { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.35); } 70% { box-shadow: 0 0 0 8px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
      @keyframes cascadeIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(125, 211, 252, 0.4); } 50% { box-shadow: 0 0 0 8px rgba(125, 211, 252, 0); } }
      .vs-flip { animation: vs-flip-in 420ms ease both; transform-style: preserve-3d; }
      .vs-pulse { animation: vs-pulse 900ms ease-out 1; }
      .vs-cascade { animation: cascadeIn 0.6s ease-out; }
      .vs-main-container {
        background: linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%);
        border: 1px solid rgba(125, 211, 252, 0.24);
        border-bottom: 1px solid rgba(125, 211, 252, 0.24);
        border-radius: 0;
        padding: 12px 16px;
        box-shadow: none;
        backdrop-filter: blur(6px);
        margin-bottom: 16px;
      }
      .vs-main-container.light {
        background: linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%);
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-bottom: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow: none;
      }
      .vs-section-card {
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 0;
        box-shadow: none;
        backdrop-filter: none;
        transition: none;
      }
      .vs-section-card.light {
        background: transparent;
        border: none;
        box-shadow: none;
      }
      .vs-section-card:hover {
        transform: none;
      }
      .vs-section-card.dark:hover {
        box-shadow: none;
      }
      .vs-section-card.light:hover {
        box-shadow: 0 2px 8px rgba(13, 47, 96, 0.1);
      }
      .vs-grid { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
        gap: 8px; 
        padding: 2px;
      }
      @media (max-width: 680px) { 
        .vs-grid { 
          grid-template-columns: 1fr; 
          gap: 6px; 
        } 
      }
      .vs-columns { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); 
        gap: 12px; 
        align-items: start; 
      }
      @media (max-width: 880px) { 
        .vs-columns { 
          grid-template-columns: 1fr; 
          gap: 10px; 
        } 
      }
      .vs-prospect-grid { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); 
        gap: 8px; 
        padding: 2px;
      }
      @media (max-width: 680px) { 
        .vs-prospect-grid { 
          grid-template-columns: 1fr; 
          gap: 6px; 
        } 
      }
    `;
    document.head.appendChild(style);
  }

  // Detect transition to live and trigger flip
  const prevUsedRef = React.useRef<boolean>(usedPitchRoute);
  const [flipNow, setFlipNow] = React.useState<boolean>(false);
  React.useEffect(() => {
    if (!prevUsedRef.current && usedPitchRoute) {
      setFlipNow(true);
      const t = setTimeout(() => setFlipNow(false), 700);
      return () => clearTimeout(t);
    }
    prevUsedRef.current = usedPitchRoute;
  }, [usedPitchRoute]);

  const u = userData?.[0];
  const initials = (u?.Initials ?? '').toUpperCase();
  // Support both camelCase FullName and legacy 'Full Name'
  const legacyFullName = u ? ((u as unknown as Record<string, unknown>)['Full Name'] as string | undefined) : undefined;
  const fullName = (u?.FullName || legacyFullName || `${u?.First ?? ''} ${u?.Last ?? ''}`.trim());
  const role = u?.Role ?? '';
  const rateRaw = u?.Rate as unknown;
  let rateVal: string | number | undefined;
  if (typeof rateRaw === 'number') rateVal = rateRaw;
  else if (typeof rateRaw === 'string' && rateRaw.trim() !== '') rateVal = rateRaw;
  else rateVal = undefined;
  const rateFmt = rateVal !== undefined
    ? `${formatPounds(rateVal)} + VAT`
    : '—';
  const amountFmt = formatPounds(amount);
  const enquiryId = String(enquiry?.ID ?? '—');
  const hasPasscode = !!(passcode && String(passcode).trim());
  const link = buildInstructionLink(passcode);

  // Modern theming with enhanced colors and effects
  const modernText = isDarkMode ? '#F8FAFC' : '#1E293B';
  const modernSubtle = isDarkMode ? '#94A3B8' : '#64748B';
  const modernAccent = isDarkMode ? '#7DD3FC' : colours.light.highlight;
  const modernSuccess = '#10B981';
  const modernBorder = isDarkMode 
    ? 'rgba(125, 211, 252, 0.24)' 
    : 'rgba(148, 163, 184, 0.22)';

  const clientName = `${enquiry?.First_Name || ''} ${enquiry?.Last_Name || ''}`.trim() || 'Client';
  const clientEmail = enquiry?.Email || '';
  const clientPhone = enquiry?.Phone_Number || '';

  return (
    <div 
      aria-label="Prefill data" 
      className={`vs-columns vs-cascade`}
      style={{
        background: isDarkMode 
          ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
          : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: 'none',
        borderBottom: isDarkMode 
          ? '1px solid rgba(125, 211, 252, 0.24)'
          : '1px solid rgba(148, 163, 184, 0.22)',
        borderRadius: '0',
        padding: '12px 16px',
        backdropFilter: 'blur(6px)',
        marginBottom: '0'
      }}
    >
      {/* Two-column content: left Prospect, right Prefill */}
        {/* Left: Prospect details */}
        <div className={`vs-section-card ${isDarkMode ? 'dark' : 'light'}`}>
          <div style={{ padding: '2px 0 4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ 
                color: isDarkMode ? '#7DD3FC' : colours.light.highlight, 
                fontSize: '12px', 
                fontWeight: '600',
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px' 
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                  <rect x="4" y="15" width="16" height="6" rx="3" stroke="currentColor" strokeWidth="2" />
                </svg>
                Prospect Details
              </div>
            </div>
            <div style={{ 
              height: '1px', 
              background: isDarkMode 
                ? 'linear-gradient(90deg, rgba(125, 211, 252, 0.3) 0%, rgba(125, 211, 252, 0.05) 100%)' 
                : 'linear-gradient(90deg, rgba(54, 144, 206, 0.3) 0%, rgba(54, 144, 206, 0.05) 100%)', 
              margin: '0 0 10px 0',
              borderRadius: '1px'
            }} />
            <div className="vs-prospect-grid">
              <KV label="Client name" value={clientName} text={modernText} subtle={modernSubtle} copyable />
              <KV label="Enquiry ID" value={enquiryId} text={modernText} subtle={modernSubtle} copyable />
            </div>
            {/* Contact Information - Enhanced Display */}
            {(clientEmail || clientPhone) && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ 
                  color: modernSubtle, 
                  fontSize: '10px', 
                  fontWeight: '500',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  marginBottom: '6px'
                }}>
                  Contact Information
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {clientEmail && <ContactChip label={clientEmail} kind="mail" subtle={modernSubtle} isDarkMode={isDarkMode} accent={modernAccent} />}
                  {clientPhone && <ContactChip label={clientPhone} kind="phone" subtle={modernSubtle} isDarkMode={isDarkMode} accent={modernAccent} />}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Prefill data used in placeholders */}
        <div className={`vs-section-card ${isDarkMode ? 'dark' : 'light'}`}>
          <div style={{ padding: '2px 0 4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ 
                color: isDarkMode ? '#7DD3FC' : colours.light.highlight, 
                fontSize: '12px', 
                fontWeight: '600',
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px' 
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Prefill Data
              </div>
            </div>
            <div style={{ 
              height: '1px', 
              background: isDarkMode 
                ? 'linear-gradient(90deg, rgba(125, 211, 252, 0.3) 0%, rgba(125, 211, 252, 0.05) 100%)' 
                : 'linear-gradient(90deg, rgba(54, 144, 206, 0.3) 0%, rgba(54, 144, 206, 0.05) 100%)', 
              margin: '0 0 10px 0',
              borderRadius: '1px'
            }} />
            <div className="vs-grid">
              <KV label="Fee earner" value={fullName || '—'} text={modernText} subtle={modernSubtle} copyable />
              <KV label="Initials" value={initials || '—'} text={modernText} subtle={modernSubtle} copyable />
              <KV label="Role" value={role || '—'} text={modernText} subtle={modernSubtle} copyable />
              <KV label="Rate" value={rateFmt} text={modernText} subtle={modernSubtle} copyable />
            </div>
          </div>
        </div>
      </div>
  );
};

const ContactChip: React.FC<{
  label: string;
  kind: 'mail' | 'phone';
  subtle: string;
  isDarkMode: boolean;
  accent: string;
}> = ({ label, kind, subtle, isDarkMode, accent }) => {
  const [copied, setCopied] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  
  const copy = () => {
    navigator.clipboard.writeText(label);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  
  const bg = isDarkMode 
    ? (isHovered ? 'rgba(125, 211, 252, 0.15)' : 'rgba(255,255,255,0.08)') 
    : (isHovered ? 'rgba(54, 144, 206, 0.1)' : '#f1f5f9');
  const border = isDarkMode 
    ? (isHovered ? 'rgba(125, 211, 252, 0.4)' : 'rgba(125, 211, 252, 0.2)') 
    : (isHovered ? 'rgba(54, 144, 206, 0.3)' : '#e2e8f0');
    
  const icon = kind === 'mail' ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="2"/>
      <path d="M4 6l8 6 8-6" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
  
  return (
    <span
      style={{
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: '6px',
        padding: '6px 10px', 
        borderRadius: '8px', 
        background: bg,
        border: `1px solid ${border}`, 
        fontSize: '12px',
        fontWeight: '500',
        color: isDarkMode ? '#F1F5F9' : '#1E293B',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: isHovered 
          ? (isDarkMode ? '0 2px 6px rgba(2, 6, 17, 0.3)' : '0 2px 6px rgba(13, 47, 96, 0.08)')
          : 'none'
      }}
      title={label}
      onClick={copy}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ color: accent }}>
        {icon}
      </div>
      <span style={{ 
        maxWidth: '260px', 
        overflow: 'hidden', 
        textOverflow: 'ellipsis', 
        whiteSpace: 'nowrap' 
      }}>
        {label}
      </span>
      <div
        style={{ 
          color: copied ? '#10B981' : accent,
          transition: 'color 0.2s ease'
        }}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
            <rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )}
      </div>
    </span>
  );
};

const KV: React.FC<{
  label: string;
  value: string;
  text: string;
  subtle: string;
  copyable?: boolean;
  mono?: boolean;
}> = ({ label, value, text, subtle, copyable, mono }) => {
  const [copied, setCopied] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  
  const handleCopy = () => {
    if (!copyable || !value || value === '—') return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  
  const isDarkMode = text === '#F8FAFC'; // Determine theme from text color
  
  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '10px 12px',
        borderRadius: '8px',
        background: isHovered 
          ? (isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(54, 144, 206, 0.08)')
          : (isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(248, 250, 252, 0.8)'),
        border: `1px solid ${isDarkMode 
          ? (isHovered ? 'rgba(125, 211, 252, 0.3)' : 'rgba(125, 211, 252, 0.15)') 
          : (isHovered ? 'rgba(54, 144, 206, 0.25)' : 'rgba(148, 163, 184, 0.2)')}`,
        transition: 'all 0.2s ease',
        cursor: copyable && value !== '—' ? 'pointer' : 'default',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: isHovered 
          ? (isDarkMode ? '0 4px 10px rgba(2, 6, 17, 0.3)' : '0 2px 8px rgba(13, 47, 96, 0.08)')
          : (isDarkMode ? '0 2px 4px rgba(2, 6, 17, 0.15)' : '0 1px 3px rgba(13, 47, 96, 0.04)')
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={copyable && value !== '—' ? handleCopy : undefined}
    >
      <div style={{ 
        color: subtle, 
        fontSize: '10px', 
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        <div style={{
          width: '2px',
          height: '2px',
          borderRadius: '50%',
          background: isDarkMode ? '#7DD3FC' : colours.light.highlight
        }} />
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ 
          color: text, 
          fontSize: '13px',
          fontWeight: '600', 
          fontFamily: mono 
            ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' 
            : undefined,
          lineHeight: '1.3'
        }}>
          {value}
        </span>
        {copyable && value !== '—' && (
          <div
            style={{ 
              opacity: isHovered ? 1 : 0.4,
              transition: 'all 0.2s ease',
              color: copied ? '#10B981' : (isDarkMode ? '#7DD3FC' : colours.light.highlight),
              transform: copied ? 'scale(1.1)' : 'scale(1)'
            }}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2"/>
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                <rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerificationSummary;
