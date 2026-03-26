/**
 * Route Health Check
 *
 * GET /api/route-health — Non-destructive probe of all server routes.
 *   Returns a flat array of { id, name, group, status, responseMs } objects.
 *
 * Every check MUST be read-only.  No inserts, updates, or deletes.
 */

const express = require('express');
const { trackEvent } = require('../utils/appInsights');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Route probe definitions
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_PROBES = [
  // ── Registers ──────────────────────────────────────────────────────────
  {
    id: 'registers-ld',
    name: 'L&D Plans',
    group: 'Registers',
    check: async (base) => {
      const res = await fetch(`${base}/api/registers/learning-dev?initials=LZ&year=2026`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: data.ok, count: Array.isArray(data.plans) ? data.plans.length : 0 };
    },
  },
  {
    id: 'registers-undertakings',
    name: 'Undertakings',
    group: 'Registers',
    check: async (base) => {
      const res = await fetch(`${base}/api/registers/undertakings?initials=LZ`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: data.ok, count: Array.isArray(data.undertakings) ? data.undertakings.length : 0 };
    },
  },
  {
    id: 'registers-complaints',
    name: 'Complaints',
    group: 'Registers',
    check: async (base) => {
      const res = await fetch(`${base}/api/registers/complaints?initials=LZ`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: data.ok, count: Array.isArray(data.complaints) ? data.complaints.length : 0 };
    },
  },

  // ── Core infrastructure ────────────────────────────────────────────────
  {
    id: 'health-system',
    name: 'System Health',
    group: 'Infrastructure',
    check: async (base) => {
      const res = await fetch(`${base}/api/health/system`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { overall: data.overall };
    },
  },
  {
    id: 'form-health',
    name: 'Form Endpoints',
    group: 'Infrastructure',
    check: async (base) => {
      const res = await fetch(`${base}/api/form-health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { healthy: data.summary?.healthy, total: data.summary?.total };
    },
  },

  // ── Data routes ────────────────────────────────────────────────────────
  {
    id: 'enquiries',
    name: 'Enquiries',
    group: 'Data',
    check: async (base) => {
      const res = await fetch(`${base}/api/enquiries-unified?_limit=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { mounted: true };
    },
  },
  {
    id: 'team-data',
    name: 'Team Data',
    group: 'Data',
    check: async (base) => {
      const res = await fetch(`${base}/api/team-data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { count: Array.isArray(data) ? data.length : 0 };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/route-health
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  const startTime = Date.now();

  const results = await Promise.allSettled(
    ROUTE_PROBES.map(async (probe) => {
      const t0 = Date.now();
      try {
        const details = await probe.check(baseUrl);
        return {
          id: probe.id,
          name: probe.name,
          group: probe.group,
          status: 'healthy',
          responseMs: Date.now() - t0,
          details,
        };
      } catch (err) {
        return {
          id: probe.id,
          name: probe.name,
          group: probe.group,
          status: 'unhealthy',
          responseMs: Date.now() - t0,
          error: err.message || 'Unknown error',
        };
      }
    }),
  );

  const checks = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { id: 'unknown', name: 'Unknown', group: '?', status: 'error', error: r.reason?.message },
  );

  const healthy = checks.filter((c) => c.status === 'healthy').length;
  const total = checks.length;

  trackEvent('RouteHealth.CheckCompleted', {
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

// GET /api/route-health/production — server-side proxy to production route-health
// Avoids CORS issues when probing from localhost
router.get('/production', async (_req, res) => {
  const PROD = 'https://helix-hub.azurewebsites.net';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const r = await fetch(`${PROD}/api/route-health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to reach production' });
  }
});

module.exports = router;
