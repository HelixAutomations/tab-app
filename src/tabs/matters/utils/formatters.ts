/** Pure formatting helpers shared across matter views. */

export const fmt = (v?: string | null): string =>
  v && String(v).trim().length > 0 ? String(v) : '—';

export const fmtDate = (v?: string | null): string => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

export const fmtCurrency = (n?: number | null): string => {
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

export const safeNumber = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && isFinite(v) ? v : fallback;

export const get = (obj: unknown, key: string): unknown =>
  obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;

export const formatLongDate = (raw?: string | null): string => {
  if (!raw) return '—';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatAddress = (parts: Array<string | null | undefined>): string => {
  const cleaned = parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0);
  return cleaned.length > 0 ? cleaned.join(', ') : '—';
};

export const parseInstructionRef = (ref?: string) => {
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
