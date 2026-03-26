/**
 * prospectDisplayUtils.ts — shared display helper functions for the Prospects page.
 *
 * Extracted from Enquiries.tsx. These pure functions are consumed by
 * ProspectTableRow, ProspectTableHeader, day separators, and modals.
 *
 * None of these touch React state — they are deterministic formatters/mappers.
 */

import { format } from 'date-fns';
import type React from 'react';
import { colours } from '../../../app/styles/colours';
import type { Enquiry } from '../../../app/functionality/types';
import { renderAreaOfWorkGlyph, getAreaGlyphMeta } from '../../../components/filter/areaGlyphs';

// ─── Area of Work ───────────────────────────────────────────────

/** Area string → glyph in its actual AoW colour (dimmed; lights up on row hover via CSS) */
export const getAreaOfWorkIcon = (areaOfWork: string): React.ReactElement => {
  const meta = getAreaGlyphMeta(areaOfWork);
  return renderAreaOfWorkGlyph(areaOfWork, meta.color, 'glyph', 17);
};

// ─── Colour Utilities ───────────────────────────────────────────

/** Convert any CSS colour to rgba with given alpha */
export const toRgba = (color: string, alpha: number): string => {
  if (!color) return `rgba(160, 160, 160, ${alpha})`;
  if (color.startsWith('rgba(')) {
    const match = color.match(/rgba\(([^)]+)\)/);
    if (!match) return color;
    const parts = match[1].split(',').map(p => p.trim());
    if (parts.length < 3) return color;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
};

/** Area → semi-transparent timeline-edge colour using canonical brand tokens */
export const getAreaOfWorkLineColor = (areaOfWork: string, isDarkMode: boolean, isHover = false): string => {
  const area = (areaOfWork || '').toLowerCase().trim();
  const alpha = isHover ? 0.85 : 0.55;

  if (area.includes('commercial')) return toRgba(colours.blue, alpha);
  if (area.includes('construction')) return toRgba(colours.orange, alpha);
  if (area.includes('property')) return toRgba(colours.green, alpha);
  if (area.includes('employment')) return toRgba(colours.yellow, alpha);
  if (area.includes('other') || area.includes('unsure')) return toRgba(colours.greyText, isDarkMode ? 0.5 : 0.45);

  return toRgba(colours.greyText, isDarkMode ? 0.5 : 0.45);
};

// ─── Date Formatting ────────────────────────────────────────────

/** Date → display string (Today → time, Yesterday, else day+date) */
export const formatDateReceived = (dateStr: string | null, isFromInstructions: boolean): string => {
  if (!dateStr) return '--';

  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const isToday = dateOnly.getTime() === today.getTime();
  const isYesterday = dateOnly.getTime() === yesterday.getTime();
  const isSameYear = date.getFullYear() === now.getFullYear();

  if (isFromInstructions) {
    const time = format(date, 'HH:mm');
    if (isToday) return time;
    if (isYesterday) return 'Yesterday';
    const dayName = format(date, 'EEE');
    const dateFormat = isSameYear ? 'd MMM' : 'd MMM yyyy';
    return `${dayName}, ${format(date, dateFormat)}`;
  }

  if (isToday) {
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
    return hasTime ? format(date, 'HH:mm') : 'Today';
  }
  if (isYesterday) return 'Yesterday';
  const dayName = format(date, 'EEE');
  const dateFormat = isSameYear ? 'd MMM' : 'd MMM yyyy';
  return `${dayName}, ${format(date, dateFormat)}`;
};

/** Date → full locale tooltip string */
export const formatFullDateTime = (dateStr: string | null): string => {
  if (!dateStr) return 'Timestamp unavailable';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Timestamp unavailable';

  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
    timeZoneName: 'short',
  });
};

/** Short relative time helper ("2m ago", "3h ago", "5d ago") */
export const timeAgo = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return '';
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/** Long relative time with two-tier precision ("2h 15m ago", "3w 2d ago") */
export const timeAgoLong = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return '';
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds <= 0) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 600) {
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s ago` : `${minutes}m ago`;
  }
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const remMinutes = Math.floor((seconds % 3600) / 60);
    return remMinutes > 0 ? `${hours}h ${remMinutes}m ago` : `${hours}h ago`;
  }

  const days = Math.floor(seconds / 86400);
  const remHours = Math.floor((seconds % 86400) / 3600);
  if (days < 7) return remHours > 0 ? `${days}d ${remHours}h ago` : `${days}d ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    const remDays = days % 7;
    return remDays > 0 ? `${weeks}w ${remDays}d ago` : `${weeks}w ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    const remDays2 = days % 30;
    const weeks = Math.floor(remDays2 / 7);
    return weeks > 0 ? `${months}m ${weeks}w ago` : `${months}m ago`;
  }
  const years = Math.floor(days / 365);
  const remDays3 = days % 365;
  const months = Math.floor(remDays3 / 30);
  return months > 0 ? `${years}y ${months}m ago` : `${years}y ago`;
};

/** Compact single-line time display for table cells */
export const getCompactTimeDisplay = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const isLegacyPlaceholder = timePart === '00:00';

  if (d.toDateString() === now.toDateString()) {
    if (isLegacyPlaceholder) return 'Today';
    if (diffHours < 1) return `${Math.floor(diffMs / 60000)}m ago`;
    return `${timePart}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return isLegacyPlaceholder ? 'Yesterday' : `Yest ${timePart}`;
  }

  if (diffDays < 7) {
    const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
    return isLegacyPlaceholder ? dayName : `${dayName} ${timePart}`;
  }

  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** Date → quiet single-line ledger display for compact date cells */
export const getStackedDateDisplay = (dateStr: string | null): { top: string; middle: string; bottom: string } => {
  if (!dateStr) return { top: '-', middle: '', bottom: '' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { top: '-', middle: '', bottom: '' };

  const now = new Date();
  const londonDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayKey = londonDate.format(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateKey = londonDate.format(d);
  const yesterdayKey = londonDate.format(yesterday);

  const timePart = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  });
  const hasTime = timePart !== '00:00';

  if (dateKey === todayKey) {
    return { top: hasTime ? `Today ${timePart}` : 'Today', middle: '', bottom: '' };
  }

  if (dateKey === yesterdayKey) {
    return { top: hasTime ? `Yest ${timePart}` : 'Yesterday', middle: '', bottom: '' };
  }

  const datePart = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  });

  return { top: datePart, middle: '', bottom: hasTime ? timePart : '' };
};

/** dayKey → day separator label (compact or full) */
export const formatDaySeparatorLabel = (dayKey: string, isHovered: boolean): string => {
  if (!dayKey) return '';
  const d = new Date(dayKey + 'T12:00:00');
  if (isNaN(d.getTime())) return dayKey;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isSameYear = d.getFullYear() === now.getFullYear();
  const isToday = dayOnly.getTime() === today.getTime();
  const isYesterday = dayOnly.getTime() === yesterday.getTime();

  if (isHovered) {
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return isSameYear ? format(d, 'EEEE d MMMM') : format(d, 'EEEE d MMMM yyyy');
  }

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return isSameYear ? format(d, 'd MMM') : format(d, 'd MMM yyyy');
};

/** Legacy compat — redirect to compact */
export const getStackedTimeParts = (dateStr: string | null): { datePart: string; timePart: string; relative: string } => {
  const compact = getCompactTimeDisplay(dateStr);
  return { datePart: compact, timePart: '', relative: '' };
};

// ─── Value Formatting ───────────────────────────────────────────

/** Raw value → compact £-formatted display string */
export const formatValueForDisplay = (rawValue: string | number | null | undefined): string => {
  if (!rawValue || (typeof rawValue === 'string' && rawValue.trim() === '')) return '-';

  const value = String(rawValue).trim();
  const lowerValue = value.toLowerCase();

  // High value (£500k+)
  if (lowerValue.includes('500,001') || lowerValue.includes('over £500') || lowerValue.includes('500k+')) return '£500k+';
  // £100k-500k range
  if ((lowerValue.includes('100,001') && lowerValue.includes('500,000')) || lowerValue.includes('£100k-500k') ||
      (lowerValue.includes('between') && lowerValue.includes('100') && lowerValue.includes('500'))) return '£100k-500k';
  // £100k+
  if (lowerValue.includes('greater than £100') || lowerValue.includes('£100k+') || lowerValue === '£100,000+') return '£100k+';
  // £50k-100k range
  if ((lowerValue.includes('50,000') && lowerValue.includes('100,000')) || lowerValue.includes('£50k-100k')) return '£50k-100k';
  // £25k-50k range
  if ((lowerValue.includes('25,000') && lowerValue.includes('50,000')) || lowerValue.includes('£25k-50k')) return '£25k-50k';
  // £10k-100k range
  if ((lowerValue.includes('10,001') && lowerValue.includes('100,000')) ||
      (lowerValue.includes('10,000') && lowerValue.includes('100,000')) ||
      (lowerValue.includes('between') && lowerValue.includes('10') && lowerValue.includes('100')) ||
      lowerValue.includes('£10k-100k')) return '£10k-100k';
  // £10k-50k range
  if ((lowerValue.includes('10,000') && lowerValue.includes('50,000')) || lowerValue.includes('£10k-50k')) return '£10k-50k';
  // ≤£10k
  if (lowerValue.includes('below £10') || lowerValue.includes('less than £10') ||
      lowerValue.includes('10,000 or less') || lowerValue.includes('under £10') ||
      lowerValue.includes('<£10k') || lowerValue.includes('≤£10k') || lowerValue === '£10,000 or less') return '<£10k';
  // Non-monetary
  if (lowerValue.includes('non-monetary') || lowerValue.includes('non monetary') ||
      lowerValue.includes('other than money') || lowerValue.includes('property, land') ||
      lowerValue.includes('property/shares')) return 'Non-monetary';
  // Unsure
  if (lowerValue.includes('unsure') || lowerValue.includes('uncertain') ||
      lowerValue.includes('unable to establish') || lowerValue.includes('i\'m uncer') ||
      lowerValue === 'unknown' || lowerValue === 'other' || lowerValue === 'n/a' ||
      lowerValue === 'not applicable') return 'Unsure';
  // Already compact
  if (/^[<≤>]?£\d+k[-+]?(\d+k)?$/.test(value)) return value;
  // Pure number
  if (/^\d+$/.test(value)) {
    const num = parseInt(value);
    if (num >= 1000000) return `£${(num / 1000000).toFixed(1)}m`;
    if (num >= 1000) return `£${Math.round(num / 1000)}k`;
    return `£${value}`;
  }
  // Currency with commas
  const currencyMatch = value.match(/^£?([\d,]+)$/);
  if (currencyMatch) {
    const num = parseInt(currencyMatch[1].replace(/,/g, ''));
    if (num >= 1000000) return `£${(num / 1000000).toFixed(1)}m`;
    if (num >= 1000) return `£${Math.round(num / 1000)}k`;
    return `£${num}`;
  }
  // Already short with £ prefix
  if (value.startsWith('£') && value.length <= 10) return value;
  // Truncate anything else
  return value.length > 10 ? value.substring(0, 8) + '...' : value;
};

// ─── Identity / Contact ─────────────────────────────────────────

/** Enquiry record → stable deduplication key */
export const buildEnquiryIdentityKey = (record: Partial<Enquiry> | any): string => {
  const id = String(record?.ID ?? record?.id ?? '').trim();
  const date = String(record?.Touchpoint_Date ?? record?.Date_Created ?? record?.datetime ?? '');
  const poc = String(record?.Point_of_Contact ?? record?.poc ?? '').trim().toLowerCase();
  const first = String(record?.First_Name ?? record?.first ?? '').trim().toLowerCase();
  const last = String(record?.Last_Name ?? record?.last ?? '').trim().toLowerCase();
  const notesSnippet = String(record?.Initial_first_call_notes ?? record?.notes ?? '')
    .trim()
    .slice(0, 24)
    .toLowerCase();
  return [id, date, poc, first, last, notesSnippet].join('|');
};

/** POC email → two-char initials string (uses claimer map when available) */
export const getPocInitials = (
  pocEmail: string | null | undefined,
  claimerMap: Record<string, { Initials?: string }>,
): string => {
  if (!pocEmail || pocEmail.toLowerCase() === 'team@helix-law.com') return 'T';

  const claimer = claimerMap[pocEmail.toLowerCase()];
  if (claimer?.Initials) return claimer.Initials;

  const emailPart = pocEmail.split('@')[0];
  if (emailPart.includes('.')) {
    const parts = emailPart.split('.');
    return parts.map(p => p[0]?.toUpperCase()).join('').slice(0, 2);
  }
  return emailPart.slice(0, 2).toUpperCase();
};

// ─── Claim Time ─────────────────────────────────────────────────

/** Format claim timestamp for display */
export const formatClaimTime = (claimDate: string | null, pocEmail: string, isFromInstructions: boolean): string => {
  if (!claimDate) {
    const isUnclaimed = (pocEmail || '').toLowerCase() === 'team@helix-law.com';
    return isUnclaimed ? 'Unclaimed' : '--';
  }
  if (!isFromInstructions) return '--';

  const date = new Date(claimDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

/** Calculate elapsed time between enquiry received and claim */
export const calculateTimeDifference = (
  dateReceived: string | null,
  claimDate: string | null,
  isFromInstructions: boolean,
): string => {
  if (!dateReceived || !claimDate || !isFromInstructions) return '';

  const receivedDate = new Date(dateReceived);
  const claimedDate = new Date(claimDate);
  if (isNaN(receivedDate.getTime()) || isNaN(claimedDate.getTime())) return '';

  const diffMs = claimedDate.getTime() - receivedDate.getTime();
  if (diffMs < 0) return '';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
  return `${diffDays}d ${diffHours % 24}h`;
};
