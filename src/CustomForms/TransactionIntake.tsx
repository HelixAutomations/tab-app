// src/CustomForms/TransactionIntake.tsx
// Transaction Intake — accounts tool for recording inbound payments

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { isDevOwner } from '../app/admin';
import { colours } from '../app/styles/colours';
import { getFormModeToggleStyles, formFont } from './shared/formStyles';
import { UserData, NormalizedMatter } from '../app/functionality/types';
import { checkIsLocalDev } from '../utils/useIsLocalDev';

interface TransactionIntakeProps {
  userData?: UserData[];
  currentUser?: UserData;
  matters?: NormalizedMatter[];
  onBack?: () => void;
}

interface FormData {
  matterRef: string;
  matterDescription: string;
  feeEarner: string;
  amount: string;
  vatAmount: string;
  transactionDate: string;
  transactionTime: string;
  fromClient: boolean;
  moneySender: string;
  transactionType: string;
  instructionRef: string;
  debitAccount: 'Office' | 'Client' | '';
  payeeName: string;
  paymentReference: string;
  sortCode: string;
  accountNumber: string;
  invoiceNumber: string;
  collaborators: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  companyName: string;
  notes: string;
}

const INITIAL_FORM: FormData = {
  matterRef: '',
  matterDescription: '',
  feeEarner: '',
  amount: '',
  vatAmount: '',
  transactionDate: new Date().toISOString().split('T')[0],
  transactionTime: '',
  fromClient: true,
  moneySender: '',
  transactionType: 'receipt',
  instructionRef: '',
  debitAccount: '',
  payeeName: '',
  paymentReference: '',
  sortCode: '',
  accountNumber: '',
  invoiceNumber: '',
  collaborators: '',
  clientFirstName: '',
  clientLastName: '',
  clientEmail: '',
  companyName: '',
  notes: '',
};

const TRANSACTION_TYPES = [
  { value: 'receipt', label: 'Receipt (money in)' },
  { value: 'payment', label: 'Payment (money out)' },
  { value: 'transfer', label: 'Transfer' },
];

const TransactionIntake: React.FC<TransactionIntakeProps> = ({
  currentUser,
  matters = [],
}) => {
  const { isDarkMode } = useTheme();
  const userInitials = currentUser?.Initials || '';
  const showModeToggle = isDevOwner(currentUser) && checkIsLocalDev();
  const [mode, setMode] = useState<'cognito' | 'bespoke'>(showModeToggle ? 'bespoke' : 'cognito');
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Matter picker state
  const [matterSearch, setMatterSearch] = useState('');
  const [matterDropdownOpen, setMatterDropdownOpen] = useState(false);
  const matterPickerRef = useRef<HTMLDivElement>(null);

  // Close matter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (matterPickerRef.current && !matterPickerRef.current.contains(event.target as Node)) {
        setMatterDropdownOpen(false);
      }
    };
    if (matterDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [matterDropdownOpen]);

  // Build matter options (sorted newest first, searchable)
  const matterOptions = useMemo(() => {
    if (!matters || matters.length === 0) return [];
    return matters
      .filter(m => m && (m.displayNumber || m.matterId))
      .sort((a, b) => new Date(b.openDate || '').getTime() - new Date(a.openDate || '').getTime())
      .slice(0, 1000)
      .map(m => {
        const displayNum = m.displayNumber || m.matterId || '';
        const clientName = m.clientName || '';
        const desc = m.description || '';
        return {
          key: displayNum,
          displayNumber: displayNum,
          clientName,
          description: desc,
          feeEarner: m.responsibleSolicitor || '',
          searchText: `${displayNum} ${clientName} ${desc}`.toLowerCase(),
        };
      });
  }, [matters]);

  const filteredMatterOptions = useMemo(() => {
    if (!matterSearch) return matterOptions.slice(0, 50);
    const lower = matterSearch.toLowerCase();
    return matterOptions.filter(opt => opt.searchText.includes(lower)).slice(0, 50);
  }, [matterOptions, matterSearch]);

  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleMatterSelect = useCallback((opt: typeof matterOptions[0]) => {
    setForm(prev => ({
      ...prev,
      matterRef: opt.key,
      matterDescription: opt.description || prev.matterDescription,
      feeEarner: opt.feeEarner || prev.feeEarner,
    }));
    setMatterSearch(opt.key);
    setMatterDropdownOpen(false);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validate required fields
    if (!form.matterRef.trim()) { setError('Matter reference is required'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Amount must be greater than 0'); return; }
    if (!form.transactionDate) { setError('Transaction date is required'); return; }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/transactions-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matterRef: form.matterRef.trim(),
          matterDescription: form.matterDescription.trim() || null,
          feeEarner: form.feeEarner.trim().toUpperCase() || userInitials,
          amount: parseFloat(form.amount),
          vatAmount: form.vatAmount ? parseFloat(form.vatAmount) : null,
          transactionDate: form.transactionDate,
          transactionTime: form.transactionTime || null,
          fromClient: form.fromClient,
          moneySender: form.fromClient ? null : form.moneySender.trim() || null,
          transactionType: form.transactionType,
          instructionRef: form.instructionRef.trim() || null,
          debitAccount: form.debitAccount || null,
          payeeName: form.payeeName.trim() || null,
          paymentReference: form.paymentReference.trim() || null,
          sortCode: form.sortCode.trim() || null,
          accountNumber: form.accountNumber.trim() || null,
          invoiceNumber: form.invoiceNumber.trim() || null,
          collaborators: form.collaborators.trim() || null,
          clientFirstName: form.clientFirstName.trim() || null,
          clientLastName: form.clientLastName.trim() || null,
          clientEmail: form.clientEmail.trim() || null,
          companyName: form.companyName.trim() || null,
          notes: form.notes.trim() || null,
          createdBy: userInitials,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submission failed');
      }

      setSubmitted(true);
      setForm(INITIAL_FORM);
    } catch (err: any) {
      setError(err.message || 'Failed to submit transaction');
    } finally {
      setSubmitting(false);
    }
  }, [form, userInitials]);

  const handleReset = useCallback(() => {
    setSubmitted(false);
    setError(null);
    setForm(INITIAL_FORM);
  }, []);

  // Style tokens
  const inputBg = isDarkMode ? 'rgba(6, 23, 51, 0.6)' : '#ffffff';
  const inputBorder = isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(13, 47, 96, 0.15)';
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const shellStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 920,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };
  const panelStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-card)',
    border: '1px solid var(--home-card-border)',
    boxShadow: 'var(--home-card-shadow)',
    padding: '20px 22px',
    boxSizing: 'border-box',
  };
  const sectionCardStyle: React.CSSProperties = {
    marginBottom: 14,
    padding: '12px 14px',
    background: 'var(--home-tile-bg)',
    border: '1px solid var(--home-tile-border)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: textPrimary,
    marginBottom: 6, display: 'block',
    fontFamily: formFont,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    background: 'var(--surface-card)', color: textPrimary,
    border: '1px solid var(--home-tile-border)', borderRadius: 0,
    fontFamily: formFont,
    boxSizing: 'border-box',
    outline: 'none',
    minHeight: 44,
  };

  const fieldGap: React.CSSProperties = { marginBottom: 14 };

  return (
    <div style={{ width: '100%', height: '100%', padding: '16px 0 28px', boxSizing: 'border-box' }}>
      <div style={shellStyle}>
      {showModeToggle && (
        <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: isDarkMode ? colours.accent : colours.highlight, fontFamily: formFont }}>
            Luke-only dev preview
          </div>
          <div style={{ ...getFormModeToggleStyles(isDarkMode).container, margin: '0 auto' }}>
            <button
              onClick={() => setMode('cognito')}
              style={getFormModeToggleStyles(isDarkMode).option(mode === 'cognito', false)}
              aria-pressed={mode === 'cognito'}
            >
              Cognito
            </button>
            <button
              onClick={() => setMode('bespoke')}
              style={getFormModeToggleStyles(isDarkMode).option(mode === 'bespoke', false)}
              aria-pressed={mode === 'bespoke'}
              title="Luke-only bespoke preview"
            >
              Bespoke
            </button>
          </div>
        </div>
      )}

      {mode === 'cognito' ? (
        <div style={panelStyle}>
          <iframe
            src="https://www.cognitoforms.com/f/QzaAr_2Q7kesClKq8g229g/58"
            allow="payment"
            style={{
              border: 0, width: '100%', height: '600px',
              borderRadius: 0,
              background: 'var(--surface-card)',
            }}
            title="Transaction Intake (Cognito)"
          />
        </div>
      ) : submitted ? (
        /* ── Success state ─────────────────────────────────────── */
        <div style={{
          ...panelStyle,
          padding: '40px 20px', textAlign: 'center',
          background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.24)' : 'rgba(54, 144, 206, 0.16)'}`,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight, marginBottom: 4, fontFamily: formFont }}>
            Transaction submitted
          </div>
          <div style={{ fontSize: 12, color: textMuted, marginBottom: 16, fontFamily: formFont }}>
            It will appear in the Operations queue for review
          </div>
          <button
            onClick={handleReset}
            style={{
              background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(13, 47, 96, 0.15)'}`,
              borderRadius: 0, padding: '6px 18px', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight,
              fontFamily: formFont,
            }}
          >
            Submit another
          </button>
        </div>
      ) : (
        /* ── Bespoke form ──────────────────────────────────────── */
        <div style={{ ...panelStyle, maxWidth: 820, margin: '0 auto' }}>
          {/* Matter ref — searchable picker */}
          <div style={fieldGap} ref={matterPickerRef}>
            <label style={labelStyle}>Matter Reference *</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={matterSearch || form.matterRef}
                onChange={e => {
                  const val = e.target.value;
                  setMatterSearch(val);
                  updateField('matterRef', val);
                  setMatterDropdownOpen(true);
                }}
                onFocus={() => setMatterDropdownOpen(true)}
                placeholder="Search by matter number or client name…"
                style={inputStyle}
              />
              {matterDropdownOpen && filteredMatterOptions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                  background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                  border: '1px solid var(--home-card-border)', borderTop: 'none',
                  boxShadow: 'var(--shadow-overlay)',
                  maxHeight: 240, overflowY: 'auto',
                }}>
                  {filteredMatterOptions.map(opt => (
                    <div
                      key={opt.key}
                      onClick={() => handleMatterSelect(opt)}
                      style={{
                        padding: '8px 10px', cursor: 'pointer',
                        background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                        borderBottom: '1px solid var(--home-row-border)',
                        transition: 'background-color 0.1s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--home-tile-bg-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground; }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: textPrimary }}>{opt.displayNumber}</div>
                      {opt.clientName && (
                        <div style={{ fontSize: 12, color: textBody }}>{opt.clientName}</div>
                      )}
                      {opt.description && (
                        <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>
                          {opt.description.length > 60 ? opt.description.substring(0, 60) + '…' : opt.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Matter description */}
          <div style={fieldGap}>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              value={form.matterDescription}
              onChange={e => updateField('matterDescription', e.target.value)}
              placeholder="Brief description"
              style={inputStyle}
            />
          </div>

          {/* ── Client details section ─────────────────────────── */}
          <div style={sectionCardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: isDarkMode ? colours.accent : colours.highlight, marginBottom: 10, fontFamily: formFont }}>
              Client Details
            </div>
            {/* First + Last name row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input
                  type="text"
                  value={form.clientFirstName}
                  onChange={e => updateField('clientFirstName', e.target.value)}
                  placeholder="Client first name"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input
                  type="text"
                  value={form.clientLastName}
                  onChange={e => updateField('clientLastName', e.target.value)}
                  placeholder="Client last name"
                  style={inputStyle}
                />
              </div>
            </div>
            {/* Email + Company row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={form.clientEmail}
                  onChange={e => updateField('clientEmail', e.target.value)}
                  placeholder="client@example.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Company</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={e => updateField('companyName', e.target.value)}
                  placeholder="If company client"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Fee earner + Instruction ref row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...fieldGap }}>
            <div>
              <label style={labelStyle}>Fee Earner</label>
              <input
                type="text"
                value={form.feeEarner}
                onChange={e => updateField('feeEarner', e.target.value)}
                placeholder={userInitials || 'Initials'}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Instruction Ref</label>
              <input
                type="text"
                value={form.instructionRef}
                onChange={e => updateField('instructionRef', e.target.value)}
                placeholder="HLX-XXXXX-XXXXX"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Amount + VAT row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...fieldGap }}>
            <div>
              <label style={labelStyle}>Amount (£) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => updateField('amount', e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>VAT (£)</label>
              <input
                type="number"
                value={form.vatAmount}
                onChange={e => updateField('vatAmount', e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Date + Time + Type row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, ...fieldGap }}>
            <div>
              <label style={labelStyle}>Transaction Date *</label>
              <input
                type="date"
                value={form.transactionDate}
                onChange={e => updateField('transactionDate', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Time</label>
              <input
                type="time"
                value={form.transactionTime}
                onChange={e => updateField('transactionTime', e.target.value)}
                style={{ ...inputStyle, width: 100 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={form.transactionType}
                onChange={e => updateField('transactionType', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {TRANSACTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source toggle */}
          <div style={fieldGap}>
            <label style={labelStyle}>Source</label>
            <div style={{ display: 'flex', gap: 0 }}>
              {[{ val: true, label: 'From client' }, { val: false, label: 'Third party' }].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => updateField('fromClient', opt.val)}
                  style={{
                    flex: 1,
                    padding: '6px 12px', fontSize: 12, fontWeight: 500,
                    background: form.fromClient === opt.val
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(13, 47, 96, 0.06)')
                      : 'transparent',
                    border: `1px solid ${inputBorder}`,
                    color: form.fromClient === opt.val ? textPrimary : textMuted,
                    cursor: 'pointer', borderRadius: 0,
                    fontFamily: formFont,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Third party sender name */}
          {!form.fromClient && (
            <div style={fieldGap}>
              <label style={labelStyle}>Sender Name</label>
              <input
                type="text"
                value={form.moneySender}
                onChange={e => updateField('moneySender', e.target.value)}
                placeholder="Name of third party sender"
                style={inputStyle}
              />
            </div>
          )}

          {/* Debit account toggle — show for payments/transfers */}
          {(form.transactionType === 'payment' || form.transactionType === 'transfer') && (
            <>
              <div style={fieldGap}>
                <label style={labelStyle}>Debit Account</label>
                <div style={{ display: 'flex', gap: 0 }}>
                  {(['Office', 'Client'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => updateField('debitAccount', form.debitAccount === opt ? '' : opt)}
                      style={{
                        flex: 1,
                        padding: '6px 12px', fontSize: 12, fontWeight: 500,
                        background: form.debitAccount === opt
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(13, 47, 96, 0.06)')
                          : 'transparent',
                        border: `1px solid ${inputBorder}`,
                        color: form.debitAccount === opt ? textPrimary : textMuted,
                        cursor: 'pointer', borderRadius: 0,
                        fontFamily: formFont,
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payee + Invoice row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...fieldGap }}>
                <div>
                  <label style={labelStyle}>Payee Name</label>
                  <input
                    type="text"
                    value={form.payeeName}
                    onChange={e => updateField('payeeName', e.target.value)}
                    placeholder="Who is being paid"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Invoice No.</label>
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={e => updateField('invoiceNumber', e.target.value)}
                    placeholder="INV-XXXX"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Bank details row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, ...fieldGap }}>
                <div>
                  <label style={labelStyle}>Sort Code</label>
                  <input
                    type="text"
                    value={form.sortCode}
                    onChange={e => updateField('sortCode', e.target.value)}
                    placeholder="00-00-00"
                    maxLength={8}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Account No.</label>
                  <input
                    type="text"
                    value={form.accountNumber}
                    onChange={e => updateField('accountNumber', e.target.value)}
                    placeholder="00000000"
                    maxLength={10}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Payment Ref</label>
                  <input
                    type="text"
                    value={form.paymentReference}
                    onChange={e => updateField('paymentReference', e.target.value)}
                    placeholder="Max 18 chars"
                    maxLength={18}
                    style={inputStyle}
                  />
                </div>
              </div>
            </>
          )}

          {/* Collaborators */}
          <div style={fieldGap}>
            <label style={labelStyle}>Collaborators</label>
            <input
              type="text"
              value={form.collaborators}
              onChange={e => updateField('collaborators', e.target.value)}
              placeholder="Comma-separated initials (e.g. AC, KW)"
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div style={fieldGap}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Optional notes"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '6px 10px', marginBottom: 12,
              background: isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.25)' : 'rgba(214, 85, 65, 0.15)'}`,
              fontSize: 12, color: colours.cta,
              fontFamily: formFont,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '10px 16px',
              background: colours.highlight,
              border: 'none', borderRadius: 0,
              color: '#ffffff', fontSize: 13, fontWeight: 600,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.6 : 1,
              fontFamily: formFont,
              transition: 'opacity 0.15s ease',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit Transaction'}
          </button>
        </div>
      )}
      </div>
    </div>
  );
};

export default TransactionIntake;
