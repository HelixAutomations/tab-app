/**
 * Secure logging utility to prevent sensitive data exposure
 */

// List of field names that should be masked in logs
const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'secret', 'key', 'authorization', 'auth',
  'email', 'emails', 'Point_of_Contact', 'contact', 'phone', 'phoneNumber',
  'ssn', 'social_security', 'credit_card', 'creditCard', 'cvv',
  'api_key', 'apiKey', 'client_secret', 'clientSecret', 'refresh_token',
  'access_token', 'accessToken', 'bearer', 'oauth'
]);

// List of patterns that indicate sensitive data
const SENSITIVE_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  /\b[A-Za-z0-9+/]{20,}={0,2}\b/g, // Base64 tokens (20+ chars)
  /\bBearer\s+[A-Za-z0-9_-]+/gi, // Bearer tokens
  /\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/g, // Credit card patterns
  /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g // SSN patterns
];

/**
 * Mask sensitive data in a string
 * @param {string} text - Text to mask
 * @returns {string} Masked text
 */
function maskSensitiveText(text) {
  if (typeof text !== 'string') return text;
  
  let masked = text;
  
  // Apply pattern-based masking
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      if (match.includes('@')) {
        // Email masking: show first 2 chars and domain
        const [local, domain] = match.split('@');
        return `${local.substring(0, 2)}***@${domain}`;
      }
      // Generic masking for other patterns
      return '***';
    });
  }
  
  return masked;
}

/**
 * Recursively mask sensitive fields in an object
 * @param {any} obj - Object to mask
 * @param {number} depth - Current recursion depth (prevent infinite loops)
 * @returns {any} Masked object
 */
function maskSensitiveFields(obj, depth = 0) {
  if (depth > 5) return '[DEEP_OBJECT]'; // Prevent deep recursion
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return maskSensitiveText(obj);
  }
  
  // Handle Error objects specially (their properties aren't enumerable)
  if (obj instanceof Error) {
    return maskSensitiveText(obj.message || String(obj));
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveFields(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const masked = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (SENSITIVE_FIELDS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token')) {
        masked[key] = value ? '***' : value;
      } else {
        masked[key] = maskSensitiveFields(value, depth + 1);
      }
    }
    return masked;
  }
  
  return obj;
}

/**
 * Secure console.log that masks sensitive data
 * @param {...any} args - Arguments to log
 */
function secureLog(...args) {
  const maskedArgs = args.map(arg => maskSensitiveFields(arg));
  console.log(...maskedArgs);
}

/**
 * Secure console.error that masks sensitive data
 * @param {...any} args - Arguments to log
 */
function secureError(...args) {
  const maskedArgs = args.map(arg => maskSensitiveFields(arg));
  console.error(...maskedArgs);
}

/**
 * Secure console.warn that masks sensitive data
 * @param {...any} args - Arguments to log
 */
function secureWarn(...args) {
  const maskedArgs = args.map(arg => maskSensitiveFields(arg));
  console.warn(...maskedArgs);
}

/**
 * Create a masked version of request body for logging
 * @param {Object} reqBody - Express request body
 * @returns {Object} Masked request body
 */
function maskRequestBody(reqBody) {
  return maskSensitiveFields(reqBody);
}

/**
 * Create a masked version of URL that might contain sensitive query parameters
 * @param {string} url - URL to mask
 * @returns {string} Masked URL
 */
function maskUrl(url) {
  if (typeof url !== 'string') return url;
  
  try {
    const urlObj = new URL(url);
    
    // Mask sensitive query parameters
    for (const [key, value] of urlObj.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.has(lowerKey) || lowerKey.includes('token') || lowerKey.includes('key')) {
        urlObj.searchParams.set(key, '***');
      }
    }
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, use text masking
    return maskSensitiveText(url);
  }
}

/**
 * Add a custom sensitive field to be masked
 * @param {string} fieldName - Field name to add to sensitive list
 */
function addSensitiveField(fieldName) {
  SENSITIVE_FIELDS.add(fieldName.toLowerCase());
}

module.exports = {
  maskSensitiveText,
  maskSensitiveFields,
  maskRequestBody,
  maskUrl,
  secureLog,
  secureError,
  secureWarn,
  addSensitiveField,
  SENSITIVE_FIELDS
};