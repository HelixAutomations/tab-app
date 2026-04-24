/**
 * Form Health Check Routes
 * 
 * GET /api/form-health - Run non-destructive health checks on all bespoke form endpoints
 * GET /api/form-health/:formId - Run health check on a specific form endpoint
 * 
 * These checks verify endpoint reachability and basic response structure
 * WITHOUT creating, modifying, or deleting any data.
 */

const express = require('express');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

function buildBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

async function verifyMountedEndpoint(url, options = {}) {
  const { method = 'OPTIONS' } = options;
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
  const contentType = response.headers.get('content-type') || '';

  if (response.status === 404) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status >= 500) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status === 200 && contentType.includes('text/html')) {
    throw new Error('Unexpected HTML response');
  }

  return { mounted: true, status: response.status || 200 };
}

function getNotableCaseInfoUrl(baseUrl) {
  const path = (process.env.REACT_APP_INSERT_NOTABLE_CASE_INFO_PATH || '').replace(/^\/+/, '');
  const code = process.env.REACT_APP_INSERT_NOTABLE_CASE_INFO_CODE;

  if (!path || !code) {
    throw new Error('Notable case info route is not configured');
  }

  return `${baseUrl}/${path}?code=${code}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM ENDPOINT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const FORM_CHECKS = [
  {
    id: 'counsel',
    name: 'Counsel Directory',
    description: 'Counsel recommendations API',
    check: async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/counsel?status=active&_limit=1`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { recordCount: Array.isArray(data) ? data.length : 'N/A' };
    },
  },
  {
    id: 'experts',
    name: 'Expert Directory',
    description: 'Expert recommendations API',
    check: async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/experts?status=active&_limit=1`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { recordCount: Array.isArray(data) ? data.length : 'N/A' };
    },
  },
  {
    id: 'tech-tickets',
    name: 'Tech Tickets',
    description: 'Tech tickets / Asana integration',
    check: async (baseUrl) => {
      // GET /team is a read-only Asana query
      const res = await fetch(`${baseUrl}/api/tech-tickets/team`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { teamMembers: Array.isArray(data) ? data.length : 'N/A' };
    },
  },
  {
    id: 'book-space',
    name: 'Book Space',
    description: 'Room booking API',
    check: async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/book-space/test`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {};
    },
  },
  {
    id: 'financial-task',
    name: 'Financial Task',
    description: 'Financial form submission API',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/financial-task`);
    },
  },
  {
    id: 'bundle',
    name: 'Bundle',
    description: 'Court bundle submission API',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/bundle`);
    },
  },
  {
    id: 'transactions-v2',
    name: 'Transaction Intake',
    description: 'Transaction intake submission API',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/transactions-v2`);
    },
  },
  {
    id: 'notable-case-info',
    name: 'Notable Case Info',
    description: 'Notable case information submission route',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(getNotableCaseInfoUrl(baseUrl));
    },
  },
  {
    id: 'learning-dev-plan',
    name: 'Learning & Development — Plan',
    description: 'L&D register plan submission',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/registers/learning-dev`);
    },
  },
  {
    id: 'learning-dev-activity',
    name: 'Learning & Development — Activity',
    description: 'L&D register activity submission',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/registers/learning-dev/activity`);
    },
  },
  {
    id: 'undertaking',
    name: 'Undertakings Register',
    description: 'Undertakings submission',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/registers/undertakings`);
    },
  },
  {
    id: 'complaint',
    name: 'Complaints Register',
    description: 'Complaints submission',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/registers/complaints`);
    },
  },
  {
    id: 'annual-leave-request',
    name: 'Annual Leave — Request',
    description: 'Annual leave request submission',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/attendance/annual-leave`);
    },
  },
  {
    id: 'annual-leave-booking',
    name: 'Annual Leave — Booking',
    description: 'Annual leave booking submission',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/attendance/annual-leave`);
    },
  },
  {
    id: 'annual-leave-approval',
    name: 'Annual Leave — Approval',
    description: 'Annual leave approval workflow',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/attendance/annual-leave`);
    },
  },
  {
    id: 'tech-idea',
    name: 'Tech Idea',
    description: 'Tech idea submission alias (maps to /api/tech-tickets/idea)',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/tech-tickets/idea`);
    },
  },
  {
    id: 'tech-problem',
    name: 'Tech Problem',
    description: 'Tech problem submission alias (maps to /api/tech-tickets/problem)',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/tech-tickets/problem`);
    },
  },
  {
    id: 'counsel-recommendation',
    name: 'Counsel Recommendation',
    description: 'Counsel recommendation submission alias',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/counsel`);
    },
  },
  {
    id: 'expert-recommendation',
    name: 'Expert Recommendation',
    description: 'Expert recommendation submission alias',
    check: async (baseUrl) => {
      return verifyMountedEndpoint(`${baseUrl}/api/experts`);
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/form-health
 * Run all health checks concurrently
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const baseUrl = buildBaseUrl(req);
    const results = await Promise.allSettled(
      FORM_CHECKS.map(async (form) => {
        const checkStart = Date.now();
        try {
          const details = await form.check(baseUrl);
          return {
            id: form.id,
            name: form.name,
            description: form.description,
            status: 'healthy',
            responseMs: Date.now() - checkStart,
            details,
          };
        } catch (error) {
          return {
            id: form.id,
            name: form.name,
            description: form.description,
            status: 'unhealthy',
            responseMs: Date.now() - checkStart,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const checks = results.map((result) => (result.status === 'fulfilled' ? result.value : {
      id: 'unknown',
      name: 'Unknown',
      status: 'error',
      error: result.reason?.message || 'Promise rejected',
    }));

    const healthy = checks.filter((check) => check.status === 'healthy').length;
    const total = checks.length;

    trackEvent('FormHealth.CheckCompleted', {
      healthy: String(healthy),
      total: String(total),
      durationMs: String(Date.now() - startTime),
      operation: 'all-checks',
      triggeredBy: 'forms-hub',
    });

    res.json({
      timestamp: new Date().toISOString(),
      summary: { healthy, unhealthy: total - healthy, total },
      durationMs: Date.now() - startTime,
      checks,
    });
  } catch (error) {
    trackException(error, { operation: 'all-checks', phase: 'run-form-health-checks' });
    trackEvent('FormHealth.CheckFailed', {
      durationMs: String(Date.now() - startTime),
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'all-checks',
      triggeredBy: 'forms-hub',
    });
    res.status(500).json({ error: error instanceof Error ? error.message : 'Form health checks failed' });
  }
});

/**
 * GET /api/form-health/:formId
 * Run a single form health check
 */
router.get('/:formId', async (req, res) => {
  const { formId } = req.params;
  const form = FORM_CHECKS.find((f) => f.id === formId);
  const checkStart = Date.now();

  if (!form) {
    return res.status(404).json({ error: `Unknown form: ${formId}`, available: FORM_CHECKS.map((f) => f.id) });
  }

  try {
    const baseUrl = buildBaseUrl(req);
    const details = await form.check(baseUrl);
    trackEvent('FormHealth.SingleCheckCompleted', {
      durationMs: String(Date.now() - checkStart),
      formId,
      operation: 'single-check',
      triggeredBy: 'forms-hub',
    });
    res.json({
      id: form.id,
      name: form.name,
      description: form.description,
      status: 'healthy',
      responseMs: Date.now() - checkStart,
      details,
    });
  } catch (error) {
    trackException(error, { operation: 'single-check', phase: 'run-form-health-check', formId });
    trackEvent('FormHealth.SingleCheckFailed', {
      durationMs: String(Date.now() - checkStart),
      error: error instanceof Error ? error.message : 'Unknown error',
      formId,
      operation: 'single-check',
      triggeredBy: 'forms-hub',
    });
    res.json({
      id: form.id,
      name: form.name,
      description: form.description,
      status: 'unhealthy',
      responseMs: Date.now() - checkStart,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

module.exports = router;
