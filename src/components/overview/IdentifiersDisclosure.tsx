import React, { useCallback, useState } from 'react';
import { FaCopy, FaCheck, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import './overview.css';

export interface IdentifierRow {
  label: string;
  value: string | number | null | undefined;
  /** Skip rendering when value is empty. Default true. */
  hideEmpty?: boolean;
}

export interface IdentifiersDisclosureProps {
  rows: IdentifierRow[];
  /** Header shown on the toggle. Default "Identifiers". */
  title?: React.ReactNode;
  /** Initial open state. Default false. */
  defaultOpen?: boolean;
  className?: string;
}

const isEmpty = (v: IdentifierRow['value']) => v === null || v === undefined || v === '';

/**
 * Collapsed disclosure for IDs (Matter ID, Client ID, Clio Contact, ACID,
 * Enquiry ID, Passcode etc). Per-row copy + bulk copy.
 */
export const IdentifiersDisclosure: React.FC<IdentifiersDisclosureProps> = ({
  rows,
  title = 'Identifiers',
  defaultOpen = false,
  className,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const visible = rows.filter((r) => r.hideEmpty === false || !isEmpty(r.value));

  const copy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    } catch { /* silent */ }
  }, []);

  const copyAll = useCallback(async () => {
    const block = visible.map((r) => `${r.label}: ${String(r.value ?? '')}`).join('\n');
    await copy('__all__', block);
  }, [visible, copy]);

  if (visible.length === 0) return null;

  return (
    <section className={className ? `helix-identifiers ${className}` : 'helix-identifiers'}>
      <button
        type="button"
        className="helix-identifiers__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{title}<span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>({visible.length})</span></span>
        {open ? <FaChevronUp size={11} /> : <FaChevronDown size={11} />}
      </button>
      {open ? (
        <>
          <div className="helix-identifiers__body">
            {visible.map((row, idx) => {
              const key = `${row.label}-${idx}`;
              const display = String(row.value ?? '');
              return (
                <div key={key} className="helix-identifiers__row">
                  <span className="helix-identifiers__label">{row.label}</span>
                  <span className="helix-identifiers__value">{display}</span>
                  <button
                    type="button"
                    className="helix-contact-module__copy"
                    data-copied={copiedKey === key ? 'true' : undefined}
                    onClick={() => copy(key, display)}
                    title={`Copy ${row.label}`}
                    aria-label={`Copy ${row.label}`}
                  >
                    {copiedKey === key ? <FaCheck size={11} /> : <FaCopy size={11} />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="helix-identifiers__bulk">
            <button
              type="button"
              className="helix-contact-module__copy"
              data-copied={copiedKey === '__all__' ? 'true' : undefined}
              onClick={copyAll}
              style={{ width: 'auto', padding: '4px 12px', fontSize: 'var(--text-xs)' }}
              title="Copy all identifiers"
            >
              {copiedKey === '__all__' ? <><FaCheck size={11} />&nbsp;Copied</> : <><FaCopy size={11} />&nbsp;Copy all</>}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
};

export default IdentifiersDisclosure;
