jest.mock('../../utils/getSecret', () => ({
  getSecret: jest.fn(),
}));

jest.mock('../../utils/db', () => ({
  withRequest: jest.fn(),
  getPool: jest.fn(),
}));

jest.mock('mssql', () => ({}));

jest.mock('../../utils/matters-stream', () => ({
  attachMattersStream: jest.fn((router) => {
    router.get('/stream', (_req, res) => res.status(200).end());
  }),
}));

const mattersRouter = require('../../routes/matters');

function getRoutePaths(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
}

describe('matters router', () => {
  test('registers the stream route before the generic id route', () => {
    const routePaths = getRoutePaths(mattersRouter);

    expect(routePaths.indexOf('/stream')).toBeGreaterThanOrEqual(0);
    expect(routePaths.indexOf('/:id')).toBeGreaterThanOrEqual(0);
    expect(routePaths.indexOf('/stream')).toBeLessThan(routePaths.indexOf('/:id'));
  });
});