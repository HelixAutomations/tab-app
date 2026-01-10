const request = require('supertest');
const express = require('express');

const techTicketsRouter = require('../techTickets');

describe('techTickets routes (ASANA_NOT_CONFIGURED)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    delete process.env.ASANA_ACCESS_TOKEN;
    delete process.env.SQL_CONNECTION_STRING;
    delete process.env.PROJECTS_SQL_CONNECTION_STRING;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/tech-tickets', techTicketsRouter);
    return app;
  }

  test('POST /idea returns 201 with warning instead of 503', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/api/tech-tickets/idea')
      .send({ title: 'Test idea', description: 'Test description', submittedBy: 'ZZ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      taskId: null,
      taskUrl: null,
      code: 'ASANA_NOT_CONFIGURED',
    });
    expect(typeof res.body.warning).toBe('string');
  });

  test('POST /problem returns 201 with warning instead of 503', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/api/tech-tickets/problem')
      .send({
        system: 'Hub',
        summary: 'Test problem',
        expectedVsActual: 'Expected X, got Y',
        urgency: 'Minor',
        submittedBy: 'ZZ',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      taskId: null,
      taskUrl: null,
      code: 'ASANA_NOT_CONFIGURED',
    });
    expect(typeof res.body.warning).toBe('string');
  });
});
