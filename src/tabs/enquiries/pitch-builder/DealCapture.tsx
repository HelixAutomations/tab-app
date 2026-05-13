import React, { useCallback, useMemo, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import './PitchBuilderRefresh.css';

const GBP_SYMBOL = '\u00a3';

export interface DealCaptureProps {
  isDarkMode: boolean;
  scopeDescription: string;
  onScopeChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  amountError?: string | null;
  showScopeOnly?: boolean;
  showAmountOnly?: boolean;
  scopeConnectorColor?: string;
  amountConnectorColor?: string;
  includeVat?: boolean;
  onIncludeVatChange?: (includeVat: boolean) => void;
  scopePlaceholder?: string;
  scopeSubject?: string;
}

function parseAmount(value: string): number | null {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number): string {
  return `${GBP_SYMBOL}${value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeAmountInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [whole, ...decimalParts] = cleaned.split('.');
  if (decimalParts.length === 0) return whole;
  return `${whole}.${decimalParts.join('').slice(0, 2)}`;
}

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
  scopePlaceholder,
  scopeSubject,
}) => {
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const hasScope = scopeDescription.trim().length > 0;
  const parsedAmount = parseAmount(amount);
  const hasAmount = parsedAmount !== null && parsedAmount > 0;
  const accent = isDarkMode ? colours.accent : colours.highlight;

  const scopeAccent = scopeConnectorColor || (hasScope ? colours.green : accent);
  const amountAccent = amountConnectorColor || (hasAmount ? colours.green : accent);

  const vatInfo = useMemo(() => {
    if (!hasAmount || parsedAmount === null) return null;
    const vat = includeVat ? parsedAmount * 0.2 : 0;
    const total = parsedAmount + vat;
    return {
      base: formatCurrency(parsedAmount),
      vat: formatCurrency(vat),
      total: formatCurrency(total),
    };
  }, [hasAmount, includeVat, parsedAmount]);

  const amountDisplay = useMemo(() => {
    if (isAmountFocused) return amount;
    if (parsedAmount === null) return amount;
    return parsedAmount.toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [amount, isAmountFocused, parsedAmount]);

  const handleAmountInput = useCallback((value: string) => {
    onAmountChange(normalizeAmountInput(value));
  }, [onAmountChange]);

  const adjustAmount = useCallback((delta: number) => {
    const current = parseAmount(amount) || 0;
    const next = Math.max(0, current + delta);
    onAmountChange(String(next));
  }, [amount, onAmountChange]);

  const scopeStyle = {
    '--pitch-capture-accent': scopeAccent,
  } as React.CSSProperties;

  const amountStyle = {
    '--pitch-capture-accent': amountAccent,
  } as React.CSSProperties;

  return (
    <div
      className={`pitch-capture ${showScopeOnly || showAmountOnly ? 'pitch-capture--single' : ''}`}
      data-helix-region="pitch-builder/instruction-fields"
    >
      {!showAmountOnly && (
        <section className="pitch-capture__section" style={scopeStyle}>
          <textarea
            className="pitch-capture__textarea"
            value={scopeDescription}
            onChange={(event) => onScopeChange(event.currentTarget.value)}
            placeholder={scopePlaceholder || "the service, e.g. \u2018drafting a letter of claim, reviewing the response, and advising on next steps\u2019"}
            rows={3}
          />
        </section>
      )}

      {!showScopeOnly && (
        <section className="pitch-capture__section" style={amountStyle}>
          <div className="pitch-capture__section-header">
            <div>
              <div className="pitch-capture__eyebrow">Fee</div>
              <div className="pitch-capture__title">Funds on account</div>
            </div>
          </div>

          <div className="pitch-capture__amount-row">
            <label className="pitch-capture__amount-shell">
              <span className="pitch-capture__currency">{GBP_SYMBOL}</span>
              <input
                className="pitch-capture__amount-input"
                value={amountDisplay}
                onChange={(event) => handleAmountInput(event.currentTarget.value)}
                onFocus={() => setIsAmountFocused(true)}
                onBlur={() => setIsAmountFocused(false)}
                inputMode="decimal"
                aria-label="Funds on account amount"
                placeholder="1500.00"
              />
            </label>
            <button
              className="pitch-capture__stepper"
              type="button"
              onClick={() => adjustAmount(50)}
              aria-label="Increase fee by 50 pounds"
              title="Increase by 50"
            >
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              <span>50</span>
            </button>
            <button
              className="pitch-capture__stepper"
              type="button"
              onClick={() => adjustAmount(-50)}
              aria-label="Decrease fee by 50 pounds"
              title="Decrease by 50"
            >
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>{'\u2212'}</span>
              <span>50</span>
            </button>
          </div>

          {vatInfo && (
            <div className="pitch-capture__vat-row">
              <span>
                {includeVat ? 'Inc. VAT (20%): ' : 'Exc. VAT: '}
                <strong>{vatInfo.total}</strong>
              </span>
            </div>
          )}

          {amountError && <div className="pitch-capture__error">{amountError}</div>}
        </section>
      )}
    </div>
  );
};

export default DealCapture;