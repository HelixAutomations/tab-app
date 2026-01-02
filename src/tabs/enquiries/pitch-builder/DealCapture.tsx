import React, { useCallback, useMemo } from 'react';
import { TextField } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';

/** Props for DealCapture component */
export interface DealCaptureProps {
  isDarkMode: boolean;
  scopeDescription: string;
  onScopeChange: (value: string) => void;
  amount: string; // raw numeric string
  onAmountChange: (value: string) => void;
  amountError?: string | null;
  showScopeOnly?: boolean; // If true, only show scope section
  showAmountOnly?: boolean; // If true, only show amount section
  scopeConnectorColor?: string; // Optional override for the scope left connector
  amountConnectorColor?: string; // Optional override for the amount left connector
  includeVat?: boolean; // Optional, defaults to true
  onIncludeVatChange?: (includeVat: boolean) => void; // Callback for VAT toggle
}

/** Compact, theme‑aware deal capture (scope + fee + VAT breakdown). */
export const DealCapture: React.FC<DealCaptureProps> = ({
  isDarkMode,
  scopeDescription,
  onScopeChange,
  amount,
  onAmountChange,
  amountError,
  showScopeOnly = false,
  showAmountOnly = false,
  scopeConnectorColor,
  amountConnectorColor,
  includeVat = true,
  onIncludeVatChange,
}) => {
  // Use brand highlight in light mode, accent in dark mode (except for signature/email links)
  const accent = isDarkMode ? colours.accent : colours.highlight;

  const handleScope = useCallback((ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, v?: string) => {
    onScopeChange(v || '');
  }, [onScopeChange]);

  const handleAmount = useCallback((ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, v?: string) => {
    const raw = (v || '').replace(/[^0-9.]/g, '');
    onAmountChange(raw);
  }, [onAmountChange]);

  const vatInfo = useMemo(() => {
    const n = parseFloat(amount);
    if (!amount || isNaN(n)) return null;
    const vat = includeVat ? +(n * 0.2).toFixed(2) : 0;
    const total = +(n + vat).toFixed(2);
    const fmt = (x: number) => `£${x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return { base: fmt(n), vat: fmt(vat), total: fmt(total) };
  }, [amount, includeVat]);

  const adjust = (delta: number) => {
    const n = parseFloat(amount) || 0;
    const next = Math.max(0, n + delta);
    onAmountChange(next.toString());
  };

  // Determine connector border color based on completion and which section
  const getScopeConnectorColor = () => {
    if (scopeConnectorColor) return scopeConnectorColor;
    if (scopeDescription && scopeDescription.trim()) {
      return isDarkMode ? 'rgba(74, 222, 128, 0.35)' : 'rgba(5, 150, 105, 0.3)';
    }
    return isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.2)';
  };

  const getAmountConnectorColor = () => {
    if (amountConnectorColor) return amountConnectorColor;
    if (amount && parseFloat(amount) > 0) {
      return isDarkMode ? 'rgba(74, 222, 128, 0.35)' : 'rgba(5, 150, 105, 0.3)';
    }
    return isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.2)';
  };

  return (
    <div style={{
      background: 'transparent',
      border: 'none',
      borderRadius: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 0
    }}>
      {/* Section header with visual emphasis */}
      {(!showAmountOnly && !showScopeOnly) && (
        <div style={{
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <div style={{
            width: 4,
            height: 24,
            borderRadius: 2,
            background: 'linear-gradient(180deg, #3690CE, #2563EB)',
            boxShadow: '0 0 12px #3690CE40'
          }} />
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: isDarkMode ? '#E2E8F0' : '#1F2937',
            letterSpacing: '-0.5px'
          }}>
            Deal Details
          </h3>
          <span style={{
            fontSize: 12,
            color: isDarkMode ? '#94A3B8' : '#64748B',
            fontWeight: 500
          }}>
            Required to create the deal
          </span>
        </div>
      )}

      {/* Scope Section */}
      {!showAmountOnly && (
        <div style={{
          marginLeft: 11,
          paddingLeft: 23,
          borderLeft: `2px solid ${getScopeConnectorColor()}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingTop: 12,
          marginBottom: 24
        }}>
          <TextField
            multiline
            rows={3}
            value={scopeDescription}
            onChange={handleScope}
            placeholder="What will you do? E.g., 'Draft a letter of claim and provide initial advice call'"
            styles={{
              field:{
                fontSize:14,
                lineHeight:1.6,
                background: 'transparent',
                color: isDarkMode ? '#E0F2FE' : '#0F172A',
                fontFamily:'inherit',
                padding:'12px 14px',
                border: 'none',
                selectors:{
                  '::placeholder':{ color: isDarkMode ? '#475569' : '#A0AEC0' }
                }
              },
              fieldGroup:{
                border:`1.5px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.25)' : 'rgba(148, 163, 184, 0.3)'}`,
                borderRadius:8,
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.6) 0%, rgba(11, 30, 55, 0.4) 100%)'
                  : 'linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isDarkMode
                  ? '0 2px 6px rgba(0, 0, 0, 0.1)'
                  : '0 1px 3px rgba(0, 0, 0, 0.05)',
                selectors:{
                  ':hover':{ 
                    borderColor: isDarkMode ? 'rgba(125, 211, 252, 0.45)' : 'rgba(148, 163, 184, 0.5)',
                    boxShadow: isDarkMode
                      ? '0 4px 12px rgba(0, 0, 0, 0.15)'
                      : '0 2px 8px rgba(0, 0, 0, 0.08)'
                  },
                  '.is-focused':{ 
                    borderColor: isDarkMode ? 'rgba(125, 211, 252, 0.6)' : 'rgba(148, 163, 184, 0.65)',
                    boxShadow: isDarkMode 
                      ? '0 0 0 4px rgba(54, 144, 206, 0.12)'
                      : '0 0 0 4px rgba(54, 144, 206, 0.1)',
                    background: isDarkMode
                      ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.95) 0%, rgba(11, 30, 55, 0.8) 100%)'
                      : 'linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)'
                  }
                }
              }
            }}
          />
        </div>
      )}

      {/* Amount Section */}
      {!showScopeOnly && (
        <div style={{
          marginLeft: 11,
          paddingLeft: 23,
          borderLeft: `2px solid ${getAmountConnectorColor()}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingTop: 12
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{
          flex: 1,
          border:`1.5px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.25)' : 'rgba(148, 163, 184, 0.3)'}`,
          borderRadius:8,
          background: isDarkMode 
            ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.6) 0%, rgba(11, 30, 55, 0.4) 100%)'
            : 'linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
          display:'flex',
          alignItems:'center',
          height: 42,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isDarkMode
            ? '0 2px 6px rgba(0, 0, 0, 0.1)'
            : '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}>
          <span style={{
            padding:'0 14px',
            fontSize:16,
            fontWeight:600,
            color: colours.blue,
            borderRight:`1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.3)' : 'rgba(148, 163, 184, 0.35)'}`
          }}>
            £
          </span>
          <TextField
            value={amount}
            onChange={handleAmount}
            placeholder="2500"
            styles={{
              root:{ flex:1 },
              field:{
                fontSize:15,
                fontWeight:500,
                background:'transparent',
                color: isDarkMode ? '#E0F2FE' : '#0F172A',
                fontFamily:'inherit',
                padding:'10px 12px',
                border:'none',
                height:40,
                selectors:{
                  '::placeholder':{ 
                    color: isDarkMode ? '#475569' : '#A0AEC0',
                    fontSize: 14
                  }
                }
              },
              fieldGroup:{
                border:'none',
                background:'transparent',
                height:38
              }
            }}
          />
        </div>
        
        {/* Adjust Buttons */}
        <div style={{ display:'flex', gap:6 }}>
          <button type="button" onClick={() => adjust(50)} style={{
              padding:'8px 14px',
              border:`1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`,
              background: isDarkMode 
                ? 'linear-gradient(135deg, rgba(135, 243, 243, 0.15) 0%, rgba(135, 243, 243, 0.1) 100%)'
                : 'linear-gradient(135deg, rgba(54, 144, 206, 0.1) 0%, rgba(54, 144, 206, 0.08) 100%)',
              color: accent,
              borderRadius:8,
              cursor:'pointer',
              fontSize:12,
              fontWeight:600,
              height:40,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDarkMode
                ? 'linear-gradient(135deg, rgba(135, 243, 243, 0.25) 0%, rgba(135, 243, 243, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.15) 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkMode
                ? 'linear-gradient(135deg, rgba(135, 243, 243, 0.15) 0%, rgba(135, 243, 243, 0.1) 100%)'
                : 'linear-gradient(135deg, rgba(54, 144, 206, 0.1) 0%, rgba(54, 144, 206, 0.08) 100%)';
            }}
            >+50</button>
          <button type="button" onClick={() => adjust(-50)} style={{
              padding:'8px 14px',
              border:`1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
              background: isDarkMode 
                ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.12) 0%, rgba(107, 114, 128, 0.08) 100%)'
                : 'linear-gradient(135deg, rgba(148, 163, 184, 0.08) 0%, rgba(107, 114, 128, 0.05) 100%)',
              color: isDarkMode ? '#94A3B8' : '#64748B',
              borderRadius:8,
              cursor:'pointer',
              fontSize:12,
              fontWeight:600,
              height:40,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDarkMode
                ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.2) 0%, rgba(107, 114, 128, 0.15) 100%)'
                : 'linear-gradient(135deg, rgba(148, 163, 184, 0.15) 0%, rgba(107, 114, 128, 0.1) 100%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkMode
                ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.12) 0%, rgba(107, 114, 128, 0.08) 100%)'
                : 'linear-gradient(135deg, rgba(148, 163, 184, 0.08) 0%, rgba(107, 114, 128, 0.05) 100%)';
            }}
            >-50</button>
        </div>
        </div>

        {/* VAT Confirmation - subtle inline display */}
        {vatInfo && (
          <div style={{
            fontSize: 12,
            color: isDarkMode ? '#94A3B8' : '#64748B',
            paddingLeft: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <span style={{ opacity: 0.8 }}>{includeVat ? 'Inc. VAT (20%): ' : 'Exc. VAT: '}</span>
              <strong style={{ color: accent }}>{vatInfo.total}</strong>
            </div>
            {onIncludeVatChange && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                fontSize: 11,
                userSelect: 'none'
              }}>
                <input
                  type="checkbox"
                  checked={!includeVat}
                  onChange={(e) => onIncludeVatChange(!e.target.checked)}
                  style={{
                    width: 11,
                    height: 11,
                    cursor: 'pointer'
                  }}
                />
                No VAT (international)
              </label>
            )}
          </div>
        )}

        {/* Error Message */}
        {amountError && (
          <div style={{
            fontSize: 11,
            color: '#EF4444',
            paddingLeft: 2,
            marginTop: -6,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {amountError}
          </div>
        )}
        </div>
      )}
    </div>
  );
};

export default DealCapture;
