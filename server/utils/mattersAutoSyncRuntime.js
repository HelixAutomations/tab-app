const OFF_VALUES = new Set(['false', '0', 'off', 'no', 'disabled']);

function clean(value) {
  return String(value || '').trim().toLowerCase();
}

function isStagingRuntime(env = process.env) {
  const slot = clean(env.WEBSITE_SLOT_NAME);
  const runtime = clean(env.HELIX_ENV || env.APP_ENV || env.REACT_APP_ENV);
  const hostname = clean(env.WEBSITE_HOSTNAME || env.APPSETTING_WEBSITE_HOSTNAME || env.HOSTNAME);
  const siteName = clean(env.WEBSITE_SITE_NAME || env.APPSETTING_WEBSITE_SITE_NAME);

  return slot === 'staging'
    || runtime === 'staging'
    || hostname.includes('-staging.')
    || hostname.includes('.staging.')
    || siteName.endsWith('-staging');
}

function getMattersAutoSyncRuntime(env = process.env) {
  const stagingRuntime = isStagingRuntime(env);
  const raw = clean(env.DATAOPS_MATTERS_AUTO_SYNC);
  const disabledByFlag = OFF_VALUES.has(raw);
  const enabled = stagingRuntime && !disabledByFlag;

  return {
    enabled,
    target: 'staging',
    environment: stagingRuntime ? 'staging' : 'non-staging',
    stagingRuntime,
    modeLabel: disabledByFlag
      ? 'Staging scheduler paused'
      : stagingRuntime
        ? 'Staging scheduler'
        : 'Staging only',
    reason: disabledByFlag
      ? 'disabled-by-env'
      : stagingRuntime
        ? 'staging-runtime'
        : 'non-staging-runtime',
  };
}

function isMattersAutoSyncEnabled(env = process.env) {
  return getMattersAutoSyncRuntime(env).enabled;
}

module.exports = {
  getMattersAutoSyncRuntime,
  isMattersAutoSyncEnabled,
  isStagingRuntime,
};