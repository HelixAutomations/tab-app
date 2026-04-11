/**
 * Tests for server/utils/syncMutex.js — async FIFO mutex
 *
 * Near-pure state machine. Only log/telemetry need silencing.
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), fail: jest.fn() }),
}));
jest.mock('../../utils/appInsights', () => ({
  trackEvent: jest.fn(),
  trackMetric: jest.fn(),
}));

let acquire, getState;

beforeEach(() => {
  jest.resetModules();
  jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), fail: jest.fn() }),
  }));
  jest.mock('../../utils/appInsights', () => ({
    trackEvent: jest.fn(),
    trackMetric: jest.fn(),
  }));
  ({ acquire, getState } = require('../../utils/syncMutex'));
});

describe('syncMutex', () => {
  test('starts unlocked', () => {
    const state = getState();
    expect(state.locked).toBe(false);
    expect(state.holder).toBeNull();
    expect(state.queueDepth).toBe(0);
  });

  test('acquire returns a release function', async () => {
    const release = await acquire('testOp');
    expect(typeof release).toBe('function');
    expect(getState().locked).toBe(true);
    expect(getState().holder.name).toBe('testOp');
    release();
    expect(getState().locked).toBe(false);
  });

  test('second caller waits until first releases', async () => {
    const order = [];

    const release1 = await acquire('op1');
    order.push('op1-acquired');

    const p2 = acquire('op2').then((release2) => {
      order.push('op2-acquired');
      return release2;
    });

    // op2 should be queued, not acquired yet
    expect(getState().queueDepth).toBe(1);
    expect(getState().queue).toEqual(['op2']);

    release1();
    order.push('op1-released');

    const release2 = await p2;
    release2();

    expect(order).toEqual(['op1-acquired', 'op1-released', 'op2-acquired']);
  });

  test('FIFO ordering with 3 waiters', async () => {
    const order = [];

    const release1 = await acquire('first');

    const promises = ['second', 'third', 'fourth'].map((name) =>
      acquire(name).then((rel) => {
        order.push(name);
        rel();
      })
    );

    expect(getState().queueDepth).toBe(3);

    release1();
    await Promise.all(promises);

    expect(order).toEqual(['second', 'third', 'fourth']);
  });

  test('release populates history', async () => {
    const release = await acquire('historyOp');
    release();

    const history = getState().recentHistory;
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].name).toBe('historyOp');
    expect(history[0]).toHaveProperty('durationMs');
    expect(history[0]).toHaveProperty('completedAt');
  });
});
