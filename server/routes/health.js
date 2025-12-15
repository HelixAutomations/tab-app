const express = require('express');
const { getCircuitBreakerHealth, resetAllCircuitBreakers } = require('../utils/circuitBreaker');
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
 * General system health check
 */
router.get('/system', async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Add circuit breaker status
    const circuitBreakers = getCircuitBreakerHealth();
    health.circuitBreakers = {
      overall: Object.values(circuitBreakers).every(b => b.isHealthy) ? 'healthy' : 'degraded',
      details: circuitBreakers
    };
    
    res.json({
      success: true,
      health
    });
  } catch (error) {
    console.error('Error getting system health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system health'
    });
  }
});

module.exports = router;