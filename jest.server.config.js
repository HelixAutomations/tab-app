/** Jest config for server-side tests (CommonJS, no TypeScript) */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/server/__tests__/**/*.test.js'],
  transform: {},
};
