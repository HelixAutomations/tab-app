const express = require('express');
const { getCircuitBreakerHealth, resetAllCircuitBreakers } = require('../utils/circuitBreaker');
const { getStatus } = require('../utils/serverStatus');
const { getSseClientCount } = require('../utils/enquiries-stream');
const router = express.Router();

/**
 * GET /api/health/circuit-breakers
 * Get the status of all circuit breakers
 */
router.get('/circuit-breakers', (req, res) => {
  try {
    const health = getCircuitBreakerHealth();
    
    const overallHealth = Object.values(health).every(breaker => breaker.isHealthy);
    
    res.json({
      success: true,
      overall: overallHealth ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      circuitBreakers: health
    });
  } catch (error) {
    console.error('Error getting circuit breaker health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get circuit breaker health'
    });
  }
});

/**
 * POST /api/health/circuit-breakers/reset
 * Reset all circuit breakers (admin function)
 */
router.post('/circuit-breakers/reset', (req, res) => {
  try {
    resetAllCircuitBreakers();
    res.json({
      success: true,
      message: 'All circuit breakers have been reset',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting circuit breakers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breakers'
    });
  }
});

/**
 * GET /api/health/system
 * General system health check with component status
 */
router.get('/system', async (req, res) => {
  try {
    const status = getStatus();
    const circuitBreakers = getCircuitBreakerHealth();
    const cbHealthy = Object.values(circuitBreakers).every(b => b.isHealthy);

    const components = {
      redis: { status: status.redis === true ? 'connected' : status.redis === false ? 'disconnected' : 'unknown' },
      sql: { status: status.sql === true ? 'connected' : status.sql === false ? 'disconnected' : 'unknown' },
      instructionsSql: { status: status.instructionsSql === true ? 'connected' : status.instructionsSql === false ? 'disconnected' : 'unknown' },
      clio: { status: status.clio === true ? 'ready' : status.clio === false ? 'cold' : 'unknown' },
      scheduler: { status: status.scheduler ? 'running' : 'stopped' },
    };

    const allConnected = Object.values(components).every(c => c.status === 'connected' || c.status === 'ready' || c.status === 'running');

    res.json({
      success: true,
      overall: allConnected && cbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: status.uptimeSeconds,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1048576),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1048576),
      },
      components,
      sse: { clients: getSseClientCount() },
      circuitBreakers: {
        overall: cbHealthy ? 'healthy' : 'degraded',
        details: circuitBreakers,
      },
    });
  } catch (error) {
    console.error('Error getting system health:', error);
    res.status(500).json({ success: false, error: 'Failed to get system health' });
  }
});

module.exports = router;