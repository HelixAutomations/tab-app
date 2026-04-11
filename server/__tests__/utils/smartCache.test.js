/**
 * Tests for server/utils/smartCache.js — calculateOptimalTTL
 *
 * Pure function: no mocks needed. We freeze Date to control hour-of-day.
 */

const { calculateOptimalTTL, DYNAMIC_CACHE_STRATEGY } = require('../../utils/smartCache');

function withHour(hour, fn) {
  const spy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(hour);
  try { return fn(); } finally { spy.mockRestore(); }
}

describe('calculateOptimalTTL', () => {
  test('returns 600 default for unknown dataset', () => {
    expect(calculateOptimalTTL('nonExistent')).toBe(600);
  });

  test('returns base TTL when no conditions match', () => {
    // userData has empty conditions array
    expect(calculateOptimalTTL('userData', 10)).toBe(1800);
  });

  // --- WIP dataset ---
  describe('wip', () => {
    test('base TTL is 300', () => {
      withHour(14, () => {
        expect(calculateOptimalTTL('wip', 500)).toBe(300);
      });
    });

    test('large dataset (>1000) halves TTL', () => {
      withHour(14, () => {
        expect(calculateOptimalTTL('wip', 2000)).toBe(150);
      });
    });

    test('overnight (03:00) doubles TTL', () => {
      withHour(3, () => {
        expect(calculateOptimalTTL('wip', 500)).toBe(600);
      });
    });

    test('large dataset overnight: both conditions apply (×0.5 then ×2)', () => {
      withHour(3, () => {
        expect(calculateOptimalTTL('wip', 2000)).toBe(300);
      });
    });
  });

  // --- Enquiries dataset ---
  describe('enquiries', () => {
    test('business hours (14:00) shortens TTL (×0.8)', () => {
      withHour(14, () => {
        expect(calculateOptimalTTL('enquiries', 100)).toBe(480);
      });
    });

    test('outside business hours (20:00) lengthens TTL (×1.5)', () => {
      withHour(20, () => {
        expect(calculateOptimalTTL('enquiries', 100)).toBe(900);
      });
    });
  });

  // --- allMatters dataset ---
  describe('allMatters', () => {
    test('base TTL for small dataset', () => {
      expect(calculateOptimalTTL('allMatters', 1000)).toBe(900);
    });

    test('large dataset (>5000) caches longer (×1.2)', () => {
      expect(calculateOptimalTTL('allMatters', 6000)).toBe(1080);
    });
  });

  // --- teamData dataset ---
  describe('teamData', () => {
    test('deep overnight (23:00) doubles TTL', () => {
      withHour(23, () => {
        expect(calculateOptimalTTL('teamData', 10)).toBe(3600);
      });
    });

    test('daytime returns base', () => {
      withHour(12, () => {
        expect(calculateOptimalTTL('teamData', 10)).toBe(1800);
      });
    });
  });

  // --- recoveredFees dataset ---
  test('recoveredFees returns 120 (near-realtime)', () => {
    expect(calculateOptimalTTL('recoveredFees', 50)).toBe(120);
  });

  // --- DYNAMIC_CACHE_STRATEGY export ---
  test('strategy object has expected keys', () => {
    expect(Object.keys(DYNAMIC_CACHE_STRATEGY)).toEqual(
      expect.arrayContaining(['wip', 'enquiries', 'allMatters', 'teamData', 'userData', 'recoveredFees', 'metaMetrics', 'annualLeave'])
    );
  });
});
