const VALID_SOURCE_BIASES = ['legacy-primary', 'new-primary', 'legacy-only', 'new-only'];
const VALID_SOURCE_POLICIES = ['operational', 'reporting', 'reconciliation'];

function normaliseSourceBias(value, fallback = 'new-only') {
  const candidate = String(value || '').trim().toLowerCase();
  return VALID_SOURCE_BIASES.includes(candidate) ? candidate : fallback;
}

function normaliseSourcePolicy(value, fallback = 'operational') {
  const candidate = String(value || '').trim().toLowerCase();
  return VALID_SOURCE_POLICIES.includes(candidate) ? candidate : fallback;
}

function getDefaultSourceBiasForPolicy(policy) {
  const normalisedPolicy = normaliseSourcePolicy(policy);

  if (normalisedPolicy === 'reporting') {
    return normaliseSourceBias(process.env.REPORTING_ENQUIRY_SOURCE_BIAS_DEFAULT, 'legacy-primary');
  }

  if (normalisedPolicy === 'reconciliation') {
    return normaliseSourceBias(process.env.RECONCILIATION_ENQUIRY_SOURCE_BIAS_DEFAULT, 'new-primary');
  }

  return normaliseSourceBias(
    process.env.ENQUIRY_SOURCE_BIAS_DEFAULT || process.env.REACT_APP_ENQUIRY_SOURCE_BIAS_DEFAULT,
    'new-only'
  );
}

function resolveSourceSelection({ sourcePolicy, sourceBias } = {}) {
  const normalisedPolicy = normaliseSourcePolicy(sourcePolicy);
  const explicitBias = String(sourceBias || '').trim().toLowerCase();

  return {
    sourcePolicy: normalisedPolicy,
    sourceBias: VALID_SOURCE_BIASES.includes(explicitBias)
      ? explicitBias
      : getDefaultSourceBiasForPolicy(normalisedPolicy),
  };
}

module.exports = {
  VALID_SOURCE_BIASES,
  VALID_SOURCE_POLICIES,
  normaliseSourceBias,
  normaliseSourcePolicy,
  getDefaultSourceBiasForPolicy,
  resolveSourceSelection,
};