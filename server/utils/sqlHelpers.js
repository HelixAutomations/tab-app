const { withRequest } = require('./db');

const DEFAULT_SQL_RETRIES = Number(process.env.SQL_DEFAULT_MAX_RETRIES || 4);
const DEFAULT_TRANSIENT_CODES = new Set([
  'ESOCKET',
  'ECONNCLOSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ETIMEOUT'
]);

const buildMessageRegex = /ECONNRESET|ECONNCLOSED|ETIMEOUT|ETIMEDOUT/i;

const isTransientSqlError = (error, extraCodes) => {
  const code = error?.code || error?.originalError?.code || error?.cause?.code;
  if (code) {
    const combined = new Set([...(extraCodes || []), ...DEFAULT_TRANSIENT_CODES]);
    if (combined.has(String(code))) {
      return true;
    }
  }
  const message = error?.message || error?.originalError?.message || '';
  return typeof message === 'string' && buildMessageRegex.test(message);
};

const createQueryRunner = ({ getConnectionString, defaultRetries = DEFAULT_SQL_RETRIES } = {}) => {
  if (typeof getConnectionString !== 'function') {
    throw new Error('createQueryRunner requires a getConnectionString function');
  }

  return (executor, retries = defaultRetries) => withRequest(getConnectionString(), executor, retries);
};

const createEnvBasedQueryRunner = (envVarName, options = {}) => {
  if (!envVarName) {
    throw new Error('createEnvBasedQueryRunner requires envVarName');
  }

  const getConnectionString = () => {
    const connStr = process.env[envVarName];
    if (!connStr) {
      throw new Error(`${envVarName} not found in environment`);
    }
    return connStr;
  };

  return createQueryRunner({ getConnectionString, ...options });
};

module.exports = {
  DEFAULT_SQL_RETRIES,
  isTransientSqlError,
  createQueryRunner,
  createEnvBasedQueryRunner
};
