/**
 * Simple Circuit Breaker implementation to prevent cascading failures
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing)
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'unnamed';
    this.failureThreshold = options.failureThreshold || 5; // failures before opening
    this.timeout = options.timeout || 60000; // 1 minute before half-open
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds window
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    
    // Performance tracking
    this.successCount = 0;
    this.totalCalls = 0;
    this.avgResponseTime = 0;
  }

  async execute(operation) {
    this.totalCalls++;
    
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(`Circuit breaker [${this.name}] is OPEN. Next attempt in ${Math.round((this.nextAttempt - Date.now()) / 1000)}s`);
        error.circuitBreakerOpen = true;
        throw error;
      }
      // Time to test - move to HALF_OPEN
      this.state = 'HALF_OPEN';
      console.log(`🔧 Circuit breaker [${this.name}] moving to HALF_OPEN state`);
    }

    const startTime = Date.now();
    
    try {
      const result = await operation();
      this.onSuccess(startTime);
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess(startTime) {
    this.failures = 0;
    this.successCount++;
    
    // Track response time
    const responseTime = Date.now() - startTime;
    this.avgResponseTime = (this.avgResponseTime * (this.successCount - 1) + responseTime) / this.successCount;
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      console.log(`✅ Circuit breaker [${this.name}] closed after successful test`);
    }
  }

  onFailure(error) {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    console.warn(`⚠️  Circuit breaker [${this.name}] failure ${this.failures}/${this.failureThreshold}: ${error.message}`);
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.error(`❌ Circuit breaker [${this.name}] opened due to ${this.failures} failures`);
    }
  }

  getStats() {
    const successRate = this.totalCalls > 0 ? (this.successCount / this.totalCalls * 100).toFixed(1) : 0;
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      successRate: `${successRate}%`,
      avgResponseTime: Math.round(this.avgResponseTime),
      nextAttempt: this.nextAttempt,
      isHealthy: this.state === 'CLOSED' && this.failures < this.failureThreshold / 2
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    console.log(`🔄 Circuit breaker [${this.name}] manually reset`);
  }
}

// Global circuit breakers for external services
const circuitBreakers = {
  facebook: new CircuitBreaker({ 
    name: 'Facebook API', 
    failureThreshold: 3, 
    timeout: 120000 // 2 minutes
  }),
  clio: new CircuitBreaker({ 
    name: 'Clio API', 
    failureThreshold: 3, 
    timeout: 90000 // 1.5 minutes  
  }),
  googleAds: new CircuitBreaker({ 
    name: 'Google Ads API', 
    failureThreshold: 3, 
    timeout: 90000
  }),
  googleAnalytics: new CircuitBreaker({ 
    name: 'Google Analytics API', 
    failureThreshold: 3, 
    timeout: 90000
  })
};

/**
 * Get circuit breaker for a service
 * @param {string} service - Service name (facebook, clio, googleAds, googleAnalytics)
 * @returns {CircuitBreaker} Circuit breaker instance
 */
function getCircuitBreaker(service) {
  return circuitBreakers[service];
}

/**
 * Get health status of all circuit breakers
 * @returns {Object} Health status summary
 */
function getCircuitBreakerHealth() {
  const stats = {};
  for (const [name, breaker] of Object.entries(circuitBreakers)) {
    stats[name] = breaker.getStats();
  }
  return stats;
}

/**
 * Reset all circuit breakers (admin function)
 */
function resetAllCircuitBreakers() {
  for (const breaker of Object.values(circuitBreakers)) {
    breaker.reset();
  }
}

module.exports = {
  CircuitBreaker,
  getCircuitBreaker,
  getCircuitBreakerHealth,
  resetAllCircuitBreakers
};