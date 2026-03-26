const parseDateValue = (input) => {
  if (!input) return null;
  const candidate = input instanceof Date ? new Date(input) : new Date(String(input));
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const getISOWeek = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d.getTime() - week1.getTime()) / 86400000 + 1) / 7) + 1;
};

const formatWeekFragment = (date) => `${date.getFullYear()}-W${String(getISOWeek(date)).padStart(2, '0')}`;

const uniqueStrings = (values) => Array.from(new Set(values
  .map((value) => String(value ?? '').trim())
  .filter(Boolean)));

const normalizeUnifiedEnquiry = (enquiry) => {
  const parsedDate = parseDateValue(enquiry?.Touchpoint_Date || enquiry?.Date_Created || enquiry?.datetime);
  if (!parsedDate) return null;

  const identifier = String(
    enquiry?.processingEnquiryId
    || enquiry?.ID
    || enquiry?.id
    || ''
  ).trim();

  const firstName = String(enquiry?.First_Name || enquiry?.first || '').trim();
  const lastName = String(enquiry?.Last_Name || enquiry?.last || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const areaOfWork = String(enquiry?.Area_of_Work || enquiry?.aow || enquiry?.pitch || 'Other').trim() || 'Other';
  const stage = String(
    enquiry?.stage
    || enquiry?.Stage
    || enquiry?.pipelineStage
    || enquiry?.teamsStage
    || ''
  ).trim() || undefined;

  return {
    identifier,
    date: parsedDate,
    dateIso: parsedDate.toISOString(),
    dateOnly: parsedDate.toISOString().slice(0, 10),
    weekFragment: formatWeekFragment(parsedDate),
    poc: String(enquiry?.Point_of_Contact || enquiry?.poc || '').trim(),
    aow: areaOfWork,
    source: enquiry?.processingSource || enquiry?.source || undefined,
    name: String(enquiry?.Name || enquiry?.name || fullName || enquiry?.Email || enquiry?.email || '—'),
    stage,
    pipelineStage: enquiry?.pipelineStage || stage,
    teamsChannel: enquiry?.teamsChannel || enquiry?.teams_channel || undefined,
    teamsCardType: enquiry?.teamsCardType || enquiry?.teams_card_type || undefined,
    teamsStage: enquiry?.teamsStage || enquiry?.teams_stage || undefined,
    teamsClaimed: enquiry?.teamsClaimed || enquiry?.teams_claimed || undefined,
    email: String(enquiry?.Email || enquiry?.email || '').trim() || undefined,
    teamsLink: enquiry?.teamsLink || enquiry?.teams_link || undefined,
    prospectIds: uniqueStrings([
      enquiry?.processingEnquiryId,
      enquiry?.pitchEnquiryId,
      enquiry?.acid,
      enquiry?.ID,
      enquiry?.id,
    ]),
  };
};

const normalizeUnifiedEnquiriesForHome = (enquiries) => (Array.isArray(enquiries) ? enquiries : [])
  .map(normalizeUnifiedEnquiry)
  .filter(Boolean);

const countUniqueInRange = (records, rangeStart, rangeEnd, mode) => {
  const startBoundary = new Date(rangeStart);
  startBoundary.setHours(0, 0, 0, 0);
  const endBoundary = new Date(rangeEnd);
  endBoundary.setHours(23, 59, 59, 999);

  const seen = new Set();
  let total = 0;

  for (const record of records) {
    if (record.date < startBoundary || record.date > endBoundary) continue;

    const keySuffix = mode === 'week' ? record.weekFragment : record.dateOnly;
    const key = record.identifier
      ? `${record.identifier}|${keySuffix}`
      : `${record.name}|${record.poc}|${keySuffix}`;

    if (!seen.has(key)) {
      seen.add(key);
      total += 1;
    }
  }

  return total;
};

const buildBreakdownForRange = (records, rangeStart, rangeEnd) => {
  const startBoundary = new Date(rangeStart);
  startBoundary.setHours(0, 0, 0, 0);
  const endBoundary = new Date(rangeEnd);
  endBoundary.setHours(23, 59, 59, 999);

  const counts = new Map();
  for (const record of records) {
    if (record.date < startBoundary || record.date > endBoundary) continue;
    counts.set(record.aow, (counts.get(record.aow) || 0) + 1);
  }

  return {
    aowTop: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ key, count })),
  };
};

const countPitchedInRange = (records, rangeStart, rangeEnd, pitchedProspectIds, mode) => {
  const startBoundary = new Date(rangeStart);
  startBoundary.setHours(0, 0, 0, 0);
  const endBoundary = new Date(rangeEnd);
  endBoundary.setHours(23, 59, 59, 999);

  const seen = new Set();
  let total = 0;

  for (const record of records) {
    if (record.date < startBoundary || record.date > endBoundary) continue;

    const keySuffix = mode === 'week' ? record.weekFragment : record.dateOnly;
    const key = record.identifier
      ? `${record.identifier}|${keySuffix}`
      : `${record.name}|${record.poc}|${keySuffix}`;

    if (seen.has(key)) continue;
    seen.add(key);

    if (record.prospectIds.some((id) => pitchedProspectIds.has(id))) {
      total += 1;
    }
  }

  return total;
};

const collectProspectIdsFromUnifiedEnquiries = (enquiries) => {
  const ids = new Set();
  for (const record of normalizeUnifiedEnquiriesForHome(enquiries)) {
    record.prospectIds.forEach((id) => ids.add(id));
  }
  return [...ids];
};

const projectHomeSummaryFromUnifiedEnquiries = (enquiries, pitchedProspectIds = new Set(), anchorDate = new Date()) => {
  const records = normalizeUnifiedEnquiriesForHome(enquiries);

  const today = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - daysToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const prevToday = new Date(today);
  prevToday.setDate(today.getDate() - 7);
  const prevTodayEnd = new Date(prevToday);
  prevTodayEnd.setHours(23, 59, 59, 999);

  const prevWeekStart = new Date(startOfWeek);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(today);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
  prevWeekEnd.setHours(23, 59, 59, 999);

  const prevFullWeekEnd = new Date(startOfWeek.getTime() - 1);

  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthDays = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
  const prevMonthEnd = new Date(prevMonthStart);
  prevMonthEnd.setDate(Math.min(today.getDate(), prevMonthDays));
  prevMonthEnd.setHours(23, 59, 59, 999);

  const prevFullMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevFullMonthEnd = new Date(startOfMonth.getTime() - 1);

  return {
    enquiriesToday: countUniqueInRange(records, today, endOfToday, 'day'),
    enquiriesWeekToDate: countUniqueInRange(records, startOfWeek, endOfToday, 'week'),
    enquiriesMonthToDate: countUniqueInRange(records, startOfMonth, endOfToday, 'week'),
    prevEnquiriesToday: countUniqueInRange(records, prevToday, prevTodayEnd, 'day'),
    prevEnquiriesWeekToDate: countUniqueInRange(records, prevWeekStart, prevWeekEnd, 'week'),
    prevEnquiriesMonthToDate: countUniqueInRange(records, prevMonthStart, prevMonthEnd, 'week'),
    prevEnquiriesWeekFull: countUniqueInRange(records, prevWeekStart, prevFullWeekEnd, 'week'),
    prevEnquiriesMonthFull: countUniqueInRange(records, prevFullMonthStart, prevFullMonthEnd, 'week'),
    pitchedToday: countPitchedInRange(records, today, endOfToday, pitchedProspectIds, 'day'),
    pitchedWeekToDate: countPitchedInRange(records, startOfWeek, endOfToday, pitchedProspectIds, 'week'),
    pitchedMonthToDate: countPitchedInRange(records, startOfMonth, endOfToday, pitchedProspectIds, 'week'),
    prevPitchedToday: countPitchedInRange(records, prevToday, prevTodayEnd, pitchedProspectIds, 'day'),
    prevPitchedWeekToDate: countPitchedInRange(records, prevWeekStart, prevWeekEnd, pitchedProspectIds, 'week'),
    prevPitchedMonthToDate: countPitchedInRange(records, prevMonthStart, prevMonthEnd, pitchedProspectIds, 'week'),
    breakdown: {
      today: buildBreakdownForRange(records, today, endOfToday),
      weekToDate: buildBreakdownForRange(records, startOfWeek, endOfToday),
      monthToDate: buildBreakdownForRange(records, startOfMonth, endOfToday),
    },
  };
};

const projectHomeDetailRecordsFromUnifiedEnquiries = (enquiries, limit = 50) => normalizeUnifiedEnquiriesForHome(enquiries)
  .map((record) => ({
    id: record.identifier || undefined,
    enquiryId: record.identifier || undefined,
    date: record.dateIso,
    poc: record.poc,
    aow: record.aow,
    source: record.source,
    name: record.name,
    stage: record.stage,
    pipelineStage: record.pipelineStage,
    teamsChannel: record.teamsChannel,
    teamsCardType: record.teamsCardType,
    teamsStage: record.teamsStage,
    teamsClaimed: record.teamsClaimed,
    teamsLink: record.teamsLink,
    email: record.email,
  }))
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  .slice(0, limit);

module.exports = {
  collectProspectIdsFromUnifiedEnquiries,
  projectHomeDetailRecordsFromUnifiedEnquiries,
  projectHomeSummaryFromUnifiedEnquiries,
};