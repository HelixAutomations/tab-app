// server/operatorActions/_opsRangeHelpers.js
//
// London-aware date-range parser for the data-ops-recent action,
// ported from tools/instant-lookup.mjs's buildOpsRangeFromPhrase.

const LONDON_TZ = 'Europe/London';

function getLondonDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekdayIndex = labels.indexOf(values.weekday) === -1 ? 0 : labels.indexOf(values.weekday);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday,
    weekdayIndex,
  };
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const values = {};
  parts.forEach((part) => { if (part.type !== 'literal') values[part.type] = part.value; });
  const asUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

function toLondonDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, LONDON_TZ);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}

function addDaysToYmd(ymd, deltaDays) {
  const base = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function buildOpsRangeFromPhrase(phrase) {
  const input = String(phrase || '').trim().toLowerCase();
  const todayParts = getLondonDateParts();
  const todayYmd = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

  const thisWeekStart = addDaysToYmd(todayYmd, -todayParts.weekdayIndex);
  const thisWeekEnd = addDaysToYmd(thisWeekStart, 6);

  let label = 'this week';
  let startYmd = thisWeekStart;
  let endYmd = thisWeekEnd;

  if (input.includes('yesterday')) {
    label = 'yesterday';
    startYmd = addDaysToYmd(todayYmd, -1);
    endYmd = startYmd;
  } else if (input.includes('today')) {
    label = 'today';
    startYmd = todayYmd;
    endYmd = todayYmd;
  } else if (input.includes('last week') || input.includes('previous week')) {
    label = 'last week';
    startYmd = addDaysToYmd(thisWeekStart, -7);
    endYmd = addDaysToYmd(thisWeekStart, -1);
  } else if (
    input.includes('last 7 days') ||
    input.includes('past 7 days') ||
    input.includes('rolling 7') ||
    input.includes('7 days')
  ) {
    label = 'last 7 days';
    startYmd = addDaysToYmd(todayYmd, -6);
    endYmd = todayYmd;
  } else if (input.includes('this week') || input.includes('current week') || input.includes('week')) {
    label = 'this week';
    startYmd = thisWeekStart;
    endYmd = thisWeekEnd;
  }

  const startDate = toLondonDate(startYmd.year, startYmd.month, startYmd.day, 0, 0, 0, 0);
  const endDate = toLondonDate(endYmd.year, endYmd.month, endYmd.day, 23, 59, 59, 999);

  return { label, startDate, endDate };
}

module.exports = {
  buildOpsRangeFromPhrase,
};
