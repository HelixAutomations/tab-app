/**
 * Tests for pure utility functions in server/routes/home-journey.js
 *
 * These are not exported directly — we use a rewire-style approach via
 * extracting the functions. Since they're module-scoped, we test them
 * indirectly by requiring the file and checking exported behaviour,
 * OR we duplicate the logic here (they're small pure functions).
 *
 * Strategy: copy the function signatures exactly from source and test
 * the logic. If refactored to a shared utils file later, point tests there.
 */

// --- Inline copies of pure functions from home-journey.js ---
// Kept in sync manually. If the route file changes, update these.

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;

function parseLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseSince(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function normDigits(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('44')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

function looksLikePhone(str) {
  if (!str) return false;
  return String(str).replace(/\D/g, '').length >= 7;
}

function buildRecipientSummary(toRecipients, ccRecipients) {
  const recipients = [...toRecipients, ...ccRecipients].filter(Boolean);
  if (recipients.length === 0) return 'No recipients recorded';
  if (recipients.length === 1) return recipients[0];
  if (recipients.length === 2) return `${recipients[0]} and ${recipients[1]}`;
  return `${recipients[0]}, ${recipients[1]} +${recipients.length - 2}`;
}

function parseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function toTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseScope(value) {
  const parsed = String(value || '').trim().toLowerCase();
  if (parsed === 'all' || parsed === 'user') return parsed;
  return null;
}

// --- Tests ---

describe('home-journey utilities', () => {
  describe('parseLimit', () => {
    test('null returns default (60)', () => expect(parseLimit(null)).toBe(60));
    test('undefined returns default', () => expect(parseLimit(undefined)).toBe(60));
    test('0 returns default', () => expect(parseLimit(0)).toBe(60));
    test('"abc" returns default', () => expect(parseLimit('abc')).toBe(60));
    test('negative returns default', () => expect(parseLimit(-5)).toBe(60));
    test('"30" returns 30', () => expect(parseLimit('30')).toBe(30));
    test('150 caps at MAX_LIMIT (120)', () => expect(parseLimit(150)).toBe(120));
    test('120 returns 120 (boundary)', () => expect(parseLimit(120)).toBe(120));
    test('1 returns 1 (minimum valid)', () => expect(parseLimit(1)).toBe(1));
  });

  describe('parseSince', () => {
    test('null returns null', () => expect(parseSince(null)).toBeNull());
    test('empty string returns null', () => expect(parseSince('')).toBeNull());
    test('numeric ms returns passthrough', () => expect(parseSince(1700000000000)).toBe(1700000000000));
    test('ISO string returns ms', () => {
      const iso = '2024-01-15T10:00:00Z';
      expect(parseSince(iso)).toBe(Date.parse(iso));
    });
    test('"not-a-date" returns null', () => expect(parseSince('not-a-date')).toBeNull());
    test('0 falls through to Date.parse("0")', () => {
      // 0 is not > 0, so falls through to Date.parse — produces a timestamp
      expect(parseSince(0)).toBe(Date.parse('0'));
    });
    test('negative number falls through to Date.parse', () => {
      expect(parseSince(-100)).toBe(Date.parse('-100'));
    });
  });

  describe('normDigits', () => {
    test('null returns empty', () => expect(normDigits(null)).toBe(''));
    test('empty returns empty', () => expect(normDigits('')).toBe(''));
    test('strips +44 prefix', () => expect(normDigits('+447700900123')).toBe('7700900123'));
    test('strips leading 0', () => expect(normDigits('07700900123')).toBe('7700900123'));
    test('strips spaces and brackets', () => expect(normDigits('+44 (0) 7700 900 123')).toBe('7700900123'));
    test('international without 44', () => expect(normDigits('7700900123')).toBe('7700900123'));
    test('0044 prefix — only leading 44 stripped, 00 remains then 0 stripped', () => {
      // '00447700900123' → digits '00447700900123' → startsWith('44')? no (starts with '00')
      // → startsWith('0')? yes → slice(1) → '0447700900123'
      expect(normDigits('00447700900123')).toBe('0447700900123');
    });
  });

  describe('looksLikePhone', () => {
    test('null returns false', () => expect(looksLikePhone(null)).toBe(false));
    test('empty returns false', () => expect(looksLikePhone('')).toBe(false));
    test('"hello" returns false (< 7 digits)', () => expect(looksLikePhone('hello')).toBe(false));
    test('"1234567" returns true (7 digits)', () => expect(looksLikePhone('1234567')).toBe(true));
    test('formatted UK number returns true', () => expect(looksLikePhone('+44 7700 900 123')).toBe(true));
    test('"123" returns false (too short)', () => expect(looksLikePhone('123')).toBe(false));
  });

  describe('buildRecipientSummary', () => {
    test('no recipients', () => {
      expect(buildRecipientSummary([], [])).toBe('No recipients recorded');
    });
    test('one recipient', () => {
      expect(buildRecipientSummary(['alice@test.com'], [])).toBe('alice@test.com');
    });
    test('two recipients', () => {
      expect(buildRecipientSummary(['alice@test.com'], ['bob@test.com'])).toBe('alice@test.com and bob@test.com');
    });
    test('three recipients shows +1', () => {
      expect(buildRecipientSummary(['a', 'b', 'c'], [])).toBe('a, b +1');
    });
    test('five recipients shows +3', () => {
      expect(buildRecipientSummary(['a', 'b'], ['c', 'd', 'e'])).toBe('a, b +3');
    });
    test('filters out falsy values', () => {
      expect(buildRecipientSummary([null, 'a'], [undefined])).toBe('a');
    });
  });

  describe('parseJsonArray', () => {
    test('null returns []', () => expect(parseJsonArray(null)).toEqual([]));
    test('undefined returns []', () => expect(parseJsonArray(undefined)).toEqual([]));
    test('already an array', () => expect(parseJsonArray(['a', 'b'])).toEqual(['a', 'b']));
    test('filters falsy from array', () => expect(parseJsonArray([null, 'a', ''])).toEqual(['a']));
    test('valid JSON string', () => expect(parseJsonArray('["x","y"]')).toEqual(['x', 'y']));
    test('invalid JSON returns []', () => expect(parseJsonArray('not json')).toEqual([]));
    test('JSON object (not array) returns []', () => expect(parseJsonArray('{"a":1}')).toEqual([]));
  });

  describe('toTimestamp', () => {
    test('valid ISO string', () => {
      expect(toTimestamp('2024-06-15T12:00:00Z')).toBe(Date.parse('2024-06-15T12:00:00Z'));
    });
    test('null returns 0', () => expect(toTimestamp(null)).toBe(0));
    test('invalid string returns 0', () => expect(toTimestamp('garbage')).toBe(0));
  });

  describe('parseScope', () => {
    test('"all" returns "all"', () => expect(parseScope('all')).toBe('all'));
    test('"user" returns "user"', () => expect(parseScope('user')).toBe('user'));
    test('"ALL" returns "all" (case insensitive)', () => expect(parseScope('ALL')).toBe('all'));
    test('"  User  " trims and lowercases', () => expect(parseScope('  User  ')).toBe('user'));
    test('null returns null', () => expect(parseScope(null)).toBeNull());
    test('"team" returns null (unsupported)', () => expect(parseScope('team')).toBeNull());
    test('empty returns null', () => expect(parseScope('')).toBeNull());
  });
});
