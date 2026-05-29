import React, { useMemo } from 'react';
import { Callout, DirectionalHint } from '@fluentui/react/lib/Callout';
import { colours, withAlpha } from '../../app/styles/colours';
import type { BoardroomBooking, FutureBookingsResponse, SoundproofPodBooking } from '../../app/functionality/types';

interface AnnualLeaveRecordLike {
  person: string;
  start_date: string;
  end_date: string;
  status: string;
  leave_type?: string;
  half_day_start?: boolean;
  half_day_end?: boolean;
  id?: string;
}

interface Props {
  userInitials: string;
  isDarkMode: boolean;
  futureLeaveRecords: AnnualLeaveRecordLike[];
  futureBookings: FutureBookingsResponse;
}

const MAX_ROWS_PER_KIND = 2;

const dayMonth = (iso: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const timeShort = (value: string): string => {
  if (!value) return '';
  const [hours, minutes] = value.split(':');
  if (hours == null || minutes == null) return value;
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
};

const formatLeaveRange = (start: string, end: string): string => {
  if (!start) return '';
  if (!end || start === end) return dayMonth(start);
  return `${dayMonth(start)} to ${dayMonth(end)}`;
};

const formatDuration = (hours: number): string => {
  if (!Number.isFinite(hours)) return '';
  return hours === Math.floor(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

type QuietRowKind = 'leave' | 'booking';

interface QuietRow {
  key: string;
  kind: QuietRowKind;
  accent: string;
  initials: string;
  main: string;
  detail: string;
  isMine: boolean;
  hoverTitle: string;
  hoverFields: Array<{ label: string; value: string }>;
}

const HomeQuietPanel: React.FC<Props> = ({ userInitials, isDarkMode, futureLeaveRecords, futureBookings }) => {
  const [hoveredRow, setHoveredRow] = React.useState<{ row: QuietRow; target: HTMLElement } | null>(null);
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const labelText = isDarkMode ? colours.dark.text : colours.light.text;
  const divider = isDarkMode ? withAlpha(colours.dark.border, 0.3) : withAlpha(colours.helixBlue, 0.1);
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.028)' : 'rgba(6,23,51,0.03)';
  const rowHover = isDarkMode ? withAlpha(colours.helixBlue, 0.12) : withAlpha(colours.highlightBlue, 0.2);
  const calloutSurface = isDarkMode ? colours.dark.cardBackground : '#ffffff';
  const calloutBorder = isDarkMode ? withAlpha(colours.dark.border, 0.64) : withAlpha(colours.helixBlue, 0.14);
  const ownInitialsUpper = (userInitials || '').toUpperCase();

  const upcomingLeave = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (futureLeaveRecords || [])
      .filter((record) => {
        const status = String(record.status || '').toLowerCase();
        if (status === 'rejected' || status === 'cancelled') return false;
        const end = new Date(record.end_date || record.start_date);
        return !Number.isNaN(end.getTime()) && end >= today;
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .slice(0, MAX_ROWS_PER_KIND);
  }, [futureLeaveRecords]);

  const upcomingBookings = useMemo(() => {
    const now = new Date();
    type BookingRow = (BoardroomBooking | SoundproofPodBooking) & { sortTime: number };
    const all: BookingRow[] = [
      ...((futureBookings?.boardroomBookings || []) as BoardroomBooking[]),
      ...((futureBookings?.soundproofBookings || []) as SoundproofPodBooking[]),
    ].map((booking) => {
      const time = (booking.booking_time || '00:00:00').split('.')[0];
      const date = new Date(`${booking.booking_date || ''}T${time}`);
      return { ...booking, sortTime: Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime() };
    });

    return all
      .filter((booking) => booking.sortTime >= now.getTime() - 30 * 60 * 1000)
      .sort((a, b) => a.sortTime - b.sortTime)
      .slice(0, MAX_ROWS_PER_KIND);
  }, [futureBookings]);

  if (upcomingLeave.length === 0 && upcomingBookings.length === 0) {
    return null;
  }

  const rows: QuietRow[] = [
    ...upcomingLeave.map((record, index): QuietRow => {
      const initials = String(record.person || '').toUpperCase().slice(0, 4);
      const isMine = initials === ownInitialsUpper;
      const leaveType = record.half_day_start || record.half_day_end ? 'half day' : (record.leave_type || 'leave');
      const status = String(record.status || '').trim() || 'Approved';
      return {
        key: record.id || `leave-${record.person}-${record.start_date}-${index}`,
        kind: 'leave',
        accent: colours.green,
        initials,
        main: formatLeaveRange(record.start_date, record.end_date),
        detail: leaveType,
        isMine,
        hoverTitle: 'Leave',
        hoverFields: [
          { label: 'Person', value: String(record.person || '').toUpperCase() },
          { label: 'When', value: formatLeaveRange(record.start_date, record.end_date) },
          { label: 'Type', value: leaveType },
          { label: 'Status', value: status },
        ],
      };
    }),
    ...upcomingBookings.map((booking, index): QuietRow => {
      const initials = String(booking.fee_earner || '').toUpperCase().slice(0, 4);
      const isMine = initials === ownInitialsUpper;
      const space = booking.spaceType;
      const shortSpace = space === 'Soundproof Pod' ? 'Pod' : 'Boardroom';
      return {
        key: `booking-${space}-${booking.id}-${index}`,
        kind: 'booking',
        accent: colours.blue,
        initials,
        main: dayMonth(booking.booking_date),
        detail: `${shortSpace}, ${timeShort(booking.booking_time)}, ${formatDuration(booking.duration)}`,
        isMine,
        hoverTitle: 'Booking',
        hoverFields: [
          { label: 'Person', value: String(booking.fee_earner || '').toUpperCase() },
          { label: 'Space', value: space },
          { label: 'When', value: `${dayMonth(booking.booking_date)}, ${timeShort(booking.booking_time)}` },
          { label: 'Duration', value: formatDuration(booking.duration) },
          ...(booking.reason ? [{ label: 'Reason', value: String(booking.reason) }] : []),
        ],
      };
    }),
  ];

  const renderRow = (row: QuietRow) => (
    <div
      key={row.key}
      onMouseEnter={(event) => setHoveredRow({ row, target: event.currentTarget })}
      onMouseLeave={() => setHoveredRow(null)}
      onFocus={(event) => setHoveredRow({ row, target: event.currentTarget })}
      onBlur={() => setHoveredRow(null)}
      tabIndex={0}
      style={{
        display: 'grid',
        gridTemplateColumns: '58px 34px minmax(0, 1fr)',
        alignItems: 'center',
        columnGap: 7,
        padding: '5px 6px',
        borderTop: `1px solid ${rowBorder}`,
        fontFamily: 'var(--font-primary)',
        opacity: row.isMine ? 0.9 : 0.76,
        outline: 'none',
        cursor: 'default',
        transition: 'background 0.14s ease, opacity 0.14s ease',
      }}
      onMouseOver={(event) => { event.currentTarget.style.background = rowHover; }}
      onMouseOut={(event) => { event.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ justifySelf: 'start', fontSize: 8, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: row.accent }}>
        {row.kind === 'leave' ? 'Leave' : 'Booking'}
      </span>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', color: row.isMine ? labelText : withAlpha(labelText, 0.62) }}>
        {row.initials}
      </span>
      <span style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ minWidth: 0, fontSize: 11, fontWeight: 650, color: bodyText, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.main}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.detail}
        </span>
      </span>
    </div>
  );

  return (
    <div
      aria-label="Quiet context while To Do is empty"
      style={{
        width: '100%',
        padding: '0 4px',
        fontFamily: 'var(--font-primary)',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 7 }}>
        <div style={{ width: 42, height: 1, background: divider }} />
      </div>
      <div style={{ marginBottom: 5, textAlign: 'center' }}>
        <div style={{ fontSize: 9, fontWeight: 750, letterSpacing: '0.08em', textTransform: 'lowercase', color: muted }}>
          coming up
        </div>
      </div>

      {rows.map(renderRow)}

      {hoveredRow && (
        <Callout
          target={hoveredRow.target}
          onDismiss={() => setHoveredRow(null)}
          directionalHint={DirectionalHint.leftCenter}
          gapSpace={8}
          isBeakVisible={false}
          setInitialFocus={false}
          styles={{
            root: { zIndex: 100000 },
            calloutMain: {
              background: calloutSurface,
              border: `1px solid ${calloutBorder}`,
              boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.32)' : '0 8px 22px rgba(6,23,51,0.14)',
              borderRadius: 0,
              padding: 0,
            },
          }}
        >
          <div style={{ width: 218, padding: '10px 12px', fontFamily: 'var(--font-primary)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, marginBottom: 8 }}>
              {hoveredRow.row.hoverTitle}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hoveredRow.row.hoverFields.map((field) => (
                <div key={field.label} style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>
                    {field.label}
                  </span>
                  <span style={{ fontSize: 11, lineHeight: 1.35, color: bodyText, overflowWrap: 'anywhere' }}>
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Callout>
      )}
    </div>
  );
};

export default HomeQuietPanel;
