const DEFAULT_REPORTING_ENQUIRY_CUTOVER_DATE = '2026-04-01';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getReportingEnquiryCutoverDate(env = process.env) {
  const configured = env.REPORTING_ENQUIRY_CUTOVER_DATE
    || env.REPORTING_ENQUIRIES_CUTOVER_DATE
    || env.REPORTING_ENQUIRIES_NEW_ONLY_FROM
    || DEFAULT_REPORTING_ENQUIRY_CUTOVER_DATE;
  return toDateKey(configured) || DEFAULT_REPORTING_ENQUIRY_CUTOVER_DATE;
}

function resolveReportingEnquirySourceBias({ from, to, env = process.env } = {}) {
  const cutoverDate = getReportingEnquiryCutoverDate(env);
  const startDate = toDateKey(from);
  const endDate = toDateKey(to);

  if (!startDate || !endDate) {
    return {
      sourceBias: 'new-primary',
      cutoverDate,
      rangePosition: 'unknown',
      startDate,
      endDate,
    };
  }

  if (startDate >= cutoverDate) {
    return {
      sourceBias: 'new-only',
      cutoverDate,
      rangePosition: 'post-cutover',
      startDate,
      endDate,
    };
  }

  if (endDate < cutoverDate) {
    return {
      sourceBias: 'legacy-primary',
      cutoverDate,
      rangePosition: 'pre-cutover',
      startDate,
      endDate,
    };
  }

  return {
    sourceBias: 'new-primary',
    cutoverDate,
    rangePosition: 'spans-cutover',
    startDate,
    endDate,
  };
}

module.exports = {
  DEFAULT_REPORTING_ENQUIRY_CUTOVER_DATE,
  getReportingEnquiryCutoverDate,
  resolveReportingEnquirySourceBias,
};