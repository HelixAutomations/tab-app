const uri = 'http://localhost:8080/api/attendance/getAnnualLeave';

function fyWindow(now = new Date()) {
  const fyStartYear = now >= new Date(now.getFullYear(), 3, 1) ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(fyStartYear, 3, 1);
  const end = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999);
  return { start, end };
}

function isoDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isWeekday(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function businessDaysInclusive(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const a = s <= e ? s : e;
  const b = s <= e ? e : s;

  let count = 0;
  const d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const endDate = new Date(b.getFullYear(), b.getMonth(), b.getDate());

  for (; d <= endDate; d.setDate(d.getDate() + 1)) {
    if (isWeekday(d)) count += 1;
  }

  return count;
}

function overlap(start, end, fyStart, fyEnd) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;

  const a = s <= e ? s : e;
  const b = s <= e ? e : s;

  const oStart = a > fyStart ? a : fyStart;
  const oEnd = b < fyEnd ? b : fyEnd;
  if (oStart > oEnd) return null;
  return { start: oStart, end: oEnd };
}

function groupCount(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${normalize(e.status)}|${normalize(e.leave_type) || '(none)'}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function sumByType(entries, selector) {
  const map = new Map();
  for (const e of entries) {
    const type = normalize(e.leave_type) || '(none)';
    map.set(type, (map.get(type) || 0) + selector(e));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  const initials = process.env.INITIALS || 'BOD';

  const res = await fetch(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userInitials: initials })
  });

  const data = await res.json();
  const { start: fyStart, end: fyEnd } = fyWindow();

  const teamRow = Array.isArray(data.team)
    ? data.team.find((t) => String(t.Initials || '').trim().toUpperCase() === initials.toUpperCase())
    : null;

  const entitlement = teamRow?.holiday_entitlement ?? null;

  const all = Array.isArray(data.all_data) ? data.all_data : [];
  const entries = all.filter((e) => String(e.person || '').trim().toUpperCase() === initials.toUpperCase());

  const fyStrict = entries.filter((e) => {
    const s = new Date(e.start_date);
    const en = new Date(e.end_date);
    return s >= fyStart && en <= fyEnd;
  });

  const bookedApproved = entries.filter((e) => {
    const st = normalize(e.status);
    return st === 'booked' || st === 'approved';
  });

  const bookedApprovedFYOverlap = bookedApproved.filter((e) => overlap(e.start_date, e.end_date, fyStart, fyEnd) !== null);

  const businessDaysByType = sumByType(bookedApprovedFYOverlap, (e) => {
    const o = overlap(e.start_date, e.end_date, fyStart, fyEnd);
    if (!o) return 0;
    return businessDaysInclusive(o.start, o.end);
  });
  const daysTakenByType = sumByType(bookedApprovedFYOverlap, (e) => Number(e.days_taken) || 0);

  const sum = (pairs) => pairs.reduce((acc, [, val]) => acc + (Number(val) || 0), 0);
  const businessDaysTotal = sum(businessDaysByType);
  const daysTakenTotal = sum(daysTakenByType);

  const standardOnly = bookedApprovedFYOverlap.filter((e) => normalize(e.leave_type) === 'standard');
  const businessDaysStandardOnly = standardOnly.reduce((acc, e) => {
    const o = overlap(e.start_date, e.end_date, fyStart, fyEnd);
    if (!o) return acc;
    return acc + businessDaysInclusive(o.start, o.end);
  }, 0);

  const hasNonStandard = bookedApprovedFYOverlap.some((e) => {
    const t = normalize(e.leave_type);
    return t && t !== 'standard';
  });

  const sample = fyStrict
    .slice()
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
    .slice(0, 8)
    .map((e) => ({
      request_id: e.request_id,
      start: isoDate(e.start_date),
      end: isoDate(e.end_date),
      status: e.status,
      days_taken: e.days_taken,
      leave_type: e.leave_type,
    }));

  const entitlementNum = typeof entitlement === 'number' ? entitlement : null;
  const remainingUiLike = entitlementNum === null ? null : entitlementNum - businessDaysTotal;
  const remainingStandardOnly = entitlementNum === null ? null : entitlementNum - businessDaysStandardOnly;

  const lines = [];
  // Put the high-signal summary at the end since task output often truncates the start.
  lines.push(`ok=${Boolean(data.success)} initials=${initials} fy=${isoDate(fyStart)}..${isoDate(fyEnd)}`);
  lines.push(
    `counts all(last2y)=${entries.length} fyStrict=${fyStrict.length} booked/approved(fyOverlap)=${bookedApprovedFYOverlap.length} hasNonStandard=${hasNonStandard}`
  );
  lines.push(`byType businessDays(booked/approved, FY overlap): ${businessDaysByType.map(([k, v]) => `${k}:${v}`).join(', ') || '(none)'}`);
  lines.push(`byType days_taken(booked/approved, FY overlap): ${daysTakenByType.map(([k, v]) => `${k}:${v}`).join(', ') || '(none)'}`);
  lines.push(`usedBusinessDays(allTypes)=${businessDaysTotal} usedBusinessDays(standardOnly)=${businessDaysStandardOnly}`);
  lines.push(`entitlement=${entitlementNum === null ? 'null' : entitlementNum}`);
  lines.push(`remaining(if allTypes counted)=${remainingUiLike === null ? 'null' : remainingUiLike}`);
  lines.push(`remaining(if standardOnly counted)=${remainingStandardOnly === null ? 'null' : remainingStandardOnly}`);
  lines.push(`sampleFYStrict: ${sample.map((e) => `${e.start}..${e.end} ${e.status}/${e.leave_type}(${e.days_taken})`).join(' | ') || '(none)'}`);

  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((e) => {
  console.error('ERROR', e?.message || e);
  process.exitCode = 1;
});
