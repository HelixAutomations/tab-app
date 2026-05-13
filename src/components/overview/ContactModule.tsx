import React, { useCallback, useState } from 'react';
import { FaCopy, FaCheck, FaPhoneAlt, FaEnvelope, FaUser, FaBuilding, FaMapMarkerAlt } from 'react-icons/fa';
import './overview.css';

export type ContactRowKind = 'phone' | 'email' | 'address' | 'company' | 'person';

export interface ContactRow {
  kind: ContactRowKind;
  label: string;
  value: string;
  /** Optional href override; defaults derived from kind. */
  href?: string;
  /** Allow copy-to-clipboard. Default true. */
  copyable?: boolean;
}

export interface ContactModuleProps {
  rows: ContactRow[];
  className?: string;
}

const KIND_ICON: Record<ContactRowKind, React.ReactNode> = {
  phone: <FaPhoneAlt />,
  email: <FaEnvelope />,
  address: <FaMapMarkerAlt />,
  company: <FaBuilding />,
  person: <FaUser />,
};

function defaultHref(row: ContactRow): string | undefined {
  if (row.href) return row.href;
  if (row.kind === 'phone') return `tel:${row.value.replace(/\s+/g, '')}`;
  if (row.kind === 'email') return `mailto:${row.value}`;
  return undefined;
}

/**
 * Unified contact display. Each row is a single visual unit (icon, value, copy).
 * Replaces the email/phone/icon/copy-chip clutter that blends into one line.
 */
export const ContactModule: React.FC<ContactModuleProps> = ({ rows, className }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    } catch {
      /* clipboard unavailable; silent */
    }
  }, []);

  return (
    <div className={className ? `helix-contact-module ${className}` : 'helix-contact-module'}>
      {rows.map((row, idx) => {
        const key = `${row.kind}-${idx}`;
        const href = defaultHref(row);
        const copyable = row.copyable !== false;
        return (
          <div key={key} className="helix-contact-module__row">
            <span className="helix-contact-module__icon" aria-hidden="true">
              {KIND_ICON[row.kind]}
            </span>
            <span className="helix-contact-module__value">
              <span className="helix-contact-module__label">{row.label}</span>
              {href ? (
                <a className="helix-contact-module__text" href={href} title={row.value}>
                  {row.value}
                </a>
              ) : (
                <span className="helix-contact-module__text" title={row.value}>{row.value}</span>
              )}
            </span>
            {copyable ? (
              <button
                type="button"
                className="helix-contact-module__copy"
                data-copied={copiedKey === key ? 'true' : undefined}
                onClick={() => handleCopy(key, row.value)}
                title={`Copy ${row.label.toLowerCase()}`}
                aria-label={`Copy ${row.label.toLowerCase()}`}
              >
                {copiedKey === key ? <FaCheck size={11} /> : <FaCopy size={11} />}
              </button>
            ) : <span />}
          </div>
        );
      })}
    </div>
  );
};

export default ContactModule;
