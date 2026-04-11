/**
 * Tests for server/utils/envSchema.js
 */

describe('envSchema', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set required env vars
    process.env.SQL_CONNECTION_STRING = 'Server=test;Database=test;';
    process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = 'Server=test;Database=instructions;';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('passes with required vars set', () => {
    const { validateEnv } = require('../../utils/envSchema');
    expect(() => validateEnv()).not.toThrow();
  });

  test('throws in production when required vars are missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SQL_CONNECTION_STRING;
    const { validateEnv } = require('../../utils/envSchema');
    expect(() => validateEnv()).toThrow();
  });

  test('warns but does not throw in dev when vars are missing', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SQL_CONNECTION_STRING;
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    const { validateEnv } = require('../../utils/envSchema');
    expect(() => validateEnv()).not.toThrow();
    spy.mockRestore();
  });
});
