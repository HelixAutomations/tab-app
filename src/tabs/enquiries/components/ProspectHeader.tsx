import React, { useState } from 'react';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { useTheme } from '../../../app/functionality/ThemeContext';

/**
 * Safe clipboard copy with fallback for Teams context.
 */
async function safeCopyToClipboard(text: string): Promise<boolean> {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(trimmed);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = trimmed;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

export interface ProspectHeaderProps {
  enquiry: Enquiry;
  userData?: UserData[] | null;
  passcode?: string;
  showFeeEarnerToggle?: boolean;
}

function formatPounds(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return `£${num.toLocaleString('en-GB')}`;
}

/**
 * Reusable header component for prospect & enquiry details.
 * Used in both Summary and Pitch Builder tabs.
 */
export const ProspectHeader: React.FC<ProspectHeaderProps> = ({
  enquiry,
  userData,
  passcode,
  showFeeEarnerToggle = false,
}) => {
  const { isDarkMode } = useTheme();
  const [showPrefill, setShowPrefill] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Theme
  const textPrimary = isDarkMode ? '#F1F5F9' : '#1E293B';
  const textSecondary = isDarkMode ? '#94A3B8' : '#64748B';
  const borderColor = isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.25)';
  const innerBorder = isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(148, 163, 184, 0.18)';
  const surfaceBg = isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#F8FAFC';
  const cardBg = isDarkMode 
    ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
    : '#FFFFFF';
  const accent = isDarkMode ? '#7DD3FC' : '#3690CE';

  // Prospect data
  const clientName = `${enquiry?.First_Name || ''} ${enquiry?.Last_Name || ''}`.trim() || '—';
  const clientEmail = enquiry?.Email || '';
  const clientPhone = enquiry?.Phone_Number || '';
  const enquiryId = String(enquiry?.ID ?? '—');
  const areaOfWork = enquiry?.Area_of_Work || '—';
  
  const valueDisplay = (() => {
    const raw = enquiry?.Value;
    if (!raw) return '—';
    const str = String(raw).trim();
    if (str.toLowerCase().includes(' to ') || (str.match(/£/g) || []).length > 1) return str;
    const num = Number(str.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(num) || Number.isNaN(num)) return str;
    return formatPounds(num);
  })();

  // Fee earner data
  const u = userData?.[0];
  const fullName = u?.FullName || `${u?.First ?? ''} ${u?.Last ?? ''}`.trim() || '—';
  const initials = (u?.Initials ?? '').toUpperCase() || '—';
  const role = u?.Role ?? '—';
  const rate = u?.Rate ? `${formatPounds(u.Rate)} + VAT` : '—';

  const handleCopy = async (value: string, field: string) => {
    if (!value || value === '—') return;
    const ok = await safeCopyToClipboard(value);
    if (ok) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    }
  };

  // Section wrapper
  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div style={{
      background: surfaceBg,
      border: `1px solid ${innerBorder}`,
      borderRadius: '4px',
      padding: '12px 14px',
    }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        color: textSecondary,
        marginBottom: '10px',
      }}>
        {title}
      </div>
      {children}
    </div>
  );

  // Data row
  const DataRow: React.FC<{ label: string; value: string; copyable?: boolean; fieldKey: string }> = ({ 
    label, value, copyable, fieldKey 
  }) => {
    const isCopied = copiedField === fieldKey;
    const canCopy = copyable && value !== '—';
    
    return (
      <div
        onClick={canCopy ? () => handleCopy(value, fieldKey) : undefined}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 0',
          borderBottom: `1px solid ${innerBorder}`,
          cursor: canCopy ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: '11px', color: textSecondary, fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ 
          fontSize: '13px', 
          fontWeight: 600, 
          color: isCopied ? '#10B981' : textPrimary,
          transition: 'color 0.15s',
        }}>
          {isCopied ? '✓ Copied' : value}
        </span>
      </div>
    );
  };

  // Tag chip
  const Tag: React.FC<{ children: React.ReactNode; copyable?: boolean; fieldKey?: string }> = ({ 
    children, copyable, fieldKey 
  }) => {
    const isCopied = fieldKey && copiedField === fieldKey;
    const value = String(children);
    
    return (
      <span
        onClick={copyable && fieldKey ? () => handleCopy(value, fieldKey) : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          background: isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.08)',
          border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
          borderRadius: '3px',
          fontSize: '12px',
          fontWeight: 500,
          color: isCopied ? '#10B981' : textPrimary,
          cursor: copyable ? 'pointer' : 'default',
          transition: 'color 0.15s',
        }}
      >
        {isCopied ? '✓ Copied' : children}
      </span>
    );
  };

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px',
      padding: '16px 20px',
      boxShadow: isDarkMode 
        ? '0 2px 8px rgba(0,0,0,0.15)' 
        : '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '3px',
            height: '16px',
            background: accent,
            borderRadius: '2px',
          }} />
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: textPrimary,
            letterSpacing: '0.3px',
          }}>
            Prospect & Enquiry
          </span>
        </div>
        {showFeeEarnerToggle && (
          <button
            onClick={() => setShowPrefill(v => !v)}
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '5px 12px',
              borderRadius: '3px',
              border: `1px solid ${borderColor}`,
              background: showPrefill 
                ? (isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.08)')
                : 'transparent',
              color: showPrefill ? accent : textSecondary,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {showPrefill ? '← Back to Details' : 'View Prefill Data'}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '14px',
      }}>
        {/* Left - Prospect */}
        <Section title="Prospect">
          <DataRow label="Name" value={clientName} copyable fieldKey="name" />
          <DataRow label="ID" value={enquiryId} copyable fieldKey="id" />
          {passcode !== undefined && (
            <DataRow label="Passcode" value={passcode || '—'} copyable={!!passcode} fieldKey="passcode" />
          )}
          <div style={{ borderBottom: 'none', paddingBottom: 0 }} />
        </Section>

        {/* Right - Enquiry or Fee Earner */}
        {showPrefill && showFeeEarnerToggle ? (
          <Section title="Fee Earner (Prefill)">
            <DataRow label="Name" value={fullName} fieldKey="fe-name" />
            <DataRow label="Initials" value={initials} fieldKey="fe-initials" />
            <DataRow label="Role" value={role} fieldKey="fe-role" />
            <DataRow label="Rate" value={rate} fieldKey="fe-rate" />
            <div style={{ borderBottom: 'none', paddingBottom: 0 }} />
          </Section>
        ) : (
          <Section title="Enquiry Details">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <Tag>{areaOfWork}</Tag>
              <Tag>{valueDisplay}</Tag>
            </div>
            {(clientEmail || clientPhone) && (
              <>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: textSecondary,
                  marginBottom: '8px',
                  marginTop: '4px',
                }}>
                  Contact
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {clientEmail && <Tag copyable fieldKey="email">{clientEmail}</Tag>}
                  {clientPhone && <Tag copyable fieldKey="phone">{clientPhone}</Tag>}
                </div>
              </>
            )}
          </Section>
        )}
      </div>
    </div>
  );
};

export default ProspectHeader;
