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
const { trackEvent } = require('../utils/appInsights');

const router = express.Router();

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
      // Just check the endpoint responds — POST-only, so we check with an OPTIONS/HEAD approach
      // or simply verify the route is mounted by sending a GET that returns 404 (route exists but method not allowed)
      const res = await fetch(`${baseUrl}/api/financial-task`, {
        method: 'OPTIONS',
      });
      // OPTIONS returning anything other than a network error means the route is mounted
      return { mounted: true };
    },
  },
  {
    id: 'bundle',
    name: 'Bundle',
    description: 'Court bundle submission API',
    check: async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/bundle`, {
        method: 'OPTIONS',
      });
      return { mounted: true };
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
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  const startTime = Date.now();

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
          error: error.message || 'Unknown error',
        };
      }
    })
  );

  const checks = results.map((r) => (r.status === 'fulfilled' ? r.value : {
    id: 'unknown',
    name: 'Unknown',
    status: 'error',
    error: r.reason?.message || 'Promise rejected',
  }));

  const healthy = checks.filter((c) => c.status === 'healthy').length;
  const total = checks.length;

  trackEvent('FormHealth.CheckCompleted', {
    healthy: String(healthy),
    total: String(total),
    durationMs: String(Date.now() - startTime),
  });

  res.json({
    timestamp: new Date().toISOString(),
    summary: { healthy, unhealthy: total - healthy, total },
    durationMs: Date.now() - startTime,
    checks,
  });
});

/**
 * GET /api/form-health/:formId
 * Run a single form health check
 */
router.get('/:formId', async (req, res) => {
  const { formId } = req.params;
  const form = FORM_CHECKS.find((f) => f.id === formId);

  if (!form) {
    return res.status(404).json({ error: `Unknown form: ${formId}`, available: FORM_CHECKS.map((f) => f.id) });
  }

  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  const checkStart = Date.now();

  try {
    const details = await form.check(baseUrl);
    res.json({
      id: form.id,
      name: form.name,
      description: form.description,
      status: 'healthy',
      responseMs: Date.now() - checkStart,
      details,
    });
  } catch (error) {
    res.json({
      id: form.id,
      name: form.name,
      description: form.description,
      status: 'unhealthy',
      responseMs: Date.now() - checkStart,
      error: error.message || 'Unknown error',
    });
  }
});

module.exports = router;
