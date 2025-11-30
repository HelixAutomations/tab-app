import React, { useCallback, useMemo } from 'react';
import { TextField } from '@fluentui/react';
import { FaPoundSign } from 'react-icons/fa';
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
}) => {
  const bg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const border = isDarkMode ? colours.dark.border : '#E2E8F0';
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const subtle = isDarkMode ? '#94a3b8' : '#64748B';
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
    const vat = +(n * 0.2).toFixed(2);
    const total = +(n + vat).toFixed(2);
    const fmt = (x: number) => `£${x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return { ex: fmt(n), vat: fmt(vat), total: fmt(total) };
  }, [amount]);

  const adjust = (delta: number) => {
    const n = parseFloat(amount) || 0;
    const next = Math.max(0, n + delta);
    onAmountChange(next.toString());
  };

  // Determine connector border color based on completion and which section
  const getScopeConnectorColor = () => {
    if (scopeDescription && scopeDescription.trim()) {
      return isDarkMode ? 'rgba(74, 222, 128, 0.35)' : 'rgba(5, 150, 105, 0.3)';
    }
    return isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.2)';
  };

  const getAmountConnectorColor = () => {
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
      {/* Scope Section */}
      {!showAmountOnly && (
        <div style={{
          marginLeft: 11,
          paddingLeft: 23,
          borderLeft: `2px solid ${getScopeConnectorColor()}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingTop: 12
        }}>
          <TextField
            multiline
            rows={3}
            value={scopeDescription}
            onChange={handleScope}
            placeholder="Describe the scope of work..."
            styles={{
              field:{
                fontSize:14,
                lineHeight:1.5,
                background: 'transparent',
                color: isDarkMode ? '#E0F2FE' : '#0F172A',
                fontFamily:'inherit',
                padding:'10px 12px',
                border: 'none',
                selectors:{
                  '::placeholder':{ color: isDarkMode ? '#64748B' : '#94A3B8' }
                }
              },
              fieldGroup:{
                border:`1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
                borderRadius:6,
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.6) 0%, rgba(11, 30, 55, 0.4) 100%)'
                  : 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%)',
                selectors:{
                  ':hover':{ 
                    borderColor: isDarkMode ? 'rgba(125, 211, 252, 0.35)' : 'rgba(148, 163, 184, 0.35)'
                  },
                  '.is-focused':{ 
                    borderColor: accent,
                    background: isDarkMode
                      ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.8) 0%, rgba(11, 30, 55, 0.6) 100%)'
                      : 'linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(255, 255, 255, 0.8) 100%)'
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
          border:`1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
          borderRadius:6,
          background: isDarkMode 
            ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.6) 0%, rgba(11, 30, 55, 0.4) 100%)'
            : 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%)',
          display:'flex',
          alignItems:'center',
          height: 40
        }}>
          <span style={{
            padding:'0 12px',
            fontSize:16,
            fontWeight:600,
            color: accent,
            borderRight:`1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`
          }}>
            £
          </span>
          <TextField
            value={amount}
            onChange={handleAmount}
            placeholder={vatInfo ? `Amount (inc. VAT: ${vatInfo.total})` : "Amount (e.g., 1500)"}
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
                height:38,
                selectors:{
                  '::placeholder':{ 
                    color: isDarkMode ? '#64748B' : '#94A3B8',
                    fontSize: 13
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
              borderRadius:6,
              cursor:'pointer',
              fontSize:12,
              fontWeight:600,
              height:40,
              transition: 'all 0.2s ease'
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
              borderRadius:6,
              cursor:'pointer',
              fontSize:12,
              fontWeight:600,
              height:40,
              transition: 'all 0.2s ease'
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
            paddingLeft: 2
          }}>
            <span style={{ opacity: 0.8 }}>Inc. VAT (20%): </span>
            <strong style={{ color: accent }}>{vatInfo.total}</strong>
          </div>
        )}
        </div>
      )}
    </div>
  );
};

export default DealCapture;
