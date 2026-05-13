import React, { useMemo, useState } from 'react';
import { FiCheck, FiClock, FiEdit2, FiFileText, FiUploadCloud, FiUser, FiX } from 'react-icons/fi';
import type { AttendanceNoteAttendee } from './AttendanceNoteBox';

export interface SavedAttendanceClioEntry {
  userInitials: string;
  clioActivityId?: string | null;
  clioCommunicationId?: string | null;
  quantitySeconds?: number | null;
  recordedByName?: string | null;
  recordedAt?: string | null;
}

export interface SavedAttendanceNoteCardProps {
  isDarkMode: boolean;
  userInitials: string;
  note: {
    summary?: string;
    attendanceNote?: string;
    actionItems?: string[];
    duration?: number | null;
    date?: string | null;
  };
  meta: {
    saved_by?: string | null;
    saved_at?: string | null;
    matter_ref?: string | null;
    uploaded_nd?: boolean | null;
    nd_file_name?: string | null;
    clio_time_entries?: SavedAttendanceClioEntry[];
  };
  attendees: AttendanceNoteAttendee[];
  callDurationSec: number;
  hourlyRate: number | null;
  canEdit?: boolean;
  canRecordOwnTime: boolean;
  recordingOwnTime?: boolean;
  recordTimeError?: string | null;
  onRecordMyTime?: (units: number) => Promise<void> | void;
  onEdit?: () => void;
  onClose?: () => void;
}

const SIX_MIN_SECONDS = 360;

function formatDateTime(value?: string | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatUnits(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const units = Math.round(seconds / SIX_MIN_SECONDS);
  const minutes = Math.round(seconds / 60);
  return `${units} unit${units === 1 ? '' : 's'} (${minutes} min)`;
}

const SavedAttendanceNoteCard: React.FC<SavedAttendanceNoteCardProps> = ({
  userInitials,
  note,
  meta,
  attendees,
  callDurationSec,
  hourlyRate,
  canEdit = false,
  canRecordOwnTime,
  recordingOwnTime = false,
  recordTimeError = null,
  onRecordMyTime,
  onEdit,
  onClose,
}) => {
  const initialsUpper = String(userInitials || '').trim().toUpperCase();
  const defaultUnits = useMemo(() => {
    const minutes = Math.max(1, Math.ceil(Math.max(callDurationSec || 0, 0) / 60));
    return Math.max(1, Math.round(minutes / 6));
  }, [callDurationSec]);
  const [units, setUnits] = useState<number>(defaultUnits);
  const amount = useMemo(() => {
    if (hourlyRate == null || !Number.isFinite(hourlyRate)) return null;
    return (units * 6 / 60) * hourlyRate;
  }, [units, hourlyRate]);
  const amountLabel = amount != null
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(amount)
    : null;

  const noteParagraphs = useMemo(() => {
    const raw = (note.attendanceNote || '').trim();
    if (!raw) return [] as string[];
    return raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }, [note.attendanceNote]);

  const actionItems = (note.actionItems || []).filter(Boolean);
  const clioEntries = meta.clio_time_entries || [];
  const internalAttendees = attendees.filter((a) => a.kind === 'internal');

  return (
    <div data-helix-region="home/calls-and-notes/saved-note-card" className="saved-attendance-card">
      <div className="saved-attendance-card__header">
        <div className="saved-attendance-card__title-row">
          <FiFileText className="saved-attendance-card__title-icon" size={14} />
          <span className="saved-attendance-card__title">Filed attendance note</span>
          <span className="saved-attendance-pill saved-attendance-pill--filed">Filed</span>
          {meta.uploaded_nd && <span className="saved-attendance-pill saved-attendance-pill--nd">ND</span>}
          {clioEntries.length > 0 && (
            <span className="saved-attendance-pill saved-attendance-pill--clio">
              {clioEntries.length} {clioEntries.length === 1 ? 'time entry' : 'time entries'}
            </span>
          )}
        </div>
        <div className="saved-attendance-card__actions">
          {canEdit && onEdit && (
            <button type="button" onClick={onEdit} title="Open the form to edit (admin only)" className="saved-attendance-card__admin-btn">
              <FiEdit2 size={11} /> Edit
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="saved-attendance-card__icon-btn">
              <FiX size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="saved-attendance-card__body">
        {note.summary && (
          <section className="saved-attendance-card__section">
            <div className="helix-section-title">Summary</div>
            <div className="saved-attendance-card__summary">{note.summary}</div>
          </section>
        )}
        {noteParagraphs.length > 0 && (
          <section className="saved-attendance-card__section">
            <div className="helix-section-title">Attendance note</div>
            <div className="saved-attendance-card__paragraphs">
              {noteParagraphs.map((p, idx) => (
                <p key={idx} className="saved-attendance-card__paragraph">{p}</p>
              ))}
            </div>
          </section>
        )}
        {actionItems.length > 0 && (
          <section className="saved-attendance-card__section">
            <div className="helix-section-title">Action points</div>
            <ul className="saved-attendance-card__actions-list">
              {actionItems.map((item, idx) => (
                <li key={idx} className="saved-attendance-card__action-item">
                  <FiCheck size={12} className="saved-attendance-card__success-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="saved-attendance-card__footer">
        <div className="saved-attendance-card__stamp-title">System stamp</div>
        <div className="saved-attendance-card__stamp-list">
          {meta.saved_by && (
            <div className="saved-attendance-card__stamp-row">
              <FiUser size={11} className="saved-attendance-card__muted-icon" />
              <span>Filed by <strong>{meta.saved_by}</strong>{meta.saved_at ? <> on {formatDateTime(meta.saved_at)}</> : null}</span>
            </div>
          )}
          {meta.uploaded_nd && (
            <div className="saved-attendance-card__stamp-row">
              <FiUploadCloud size={11} className="saved-attendance-card__success-icon" />
              <span>NetDocuments: <strong>{meta.nd_file_name || 'uploaded'}</strong>{meta.matter_ref ? <> - {meta.matter_ref}</> : null}</span>
            </div>
          )}
          {clioEntries.length > 0 && (
            <div className="saved-attendance-card__clio-list">
              <div className="saved-attendance-card__stamp-row saved-attendance-card__stamp-row--heading">
                <FiClock size={11} className="saved-attendance-card__accent-icon" />
                <span>Clio time entries</span>
              </div>
              {clioEntries.map((entry) => (
                <div key={entry.userInitials} className="saved-attendance-card__clio-entry">
                  <strong>{entry.userInitials}</strong>
                  {entry.quantitySeconds ? <> recorded {formatUnits(entry.quantitySeconds)}</> : ' recorded a time entry'}
                  {entry.recordedAt ? <> on {formatDateTime(entry.recordedAt)}</> : null}
                </div>
              ))}
            </div>
          )}
          {internalAttendees.length > 0 && (
            <div className="saved-attendance-card__attendees">
              On the call: {internalAttendees.map((a) => (a.initials || a.name)).join(', ')}
            </div>
          )}
        </div>

        {canRecordOwnTime && onRecordMyTime && (
          <div className="saved-attendance-card__record-box">
            <div className="saved-attendance-card__record-copy">
              <span className="saved-attendance-card__record-title">Record your Clio time entry</span>
              <span className="saved-attendance-card__record-help">
                You were on the call as <strong>{initialsUpper}</strong>. The note is already filed; this only books your time against the matter.
              </span>
              <div className="saved-attendance-card__units-row">
                <label className="saved-attendance-card__units-label">Units</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={units}
                  onChange={(e) => setUnits(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  disabled={recordingOwnTime}
                  className="saved-attendance-card__units-input"
                />
                <span className="saved-attendance-card__units-help">= {units * 6} min{amountLabel ? ` - ${amountLabel}` : ''}</span>
              </div>
              {recordTimeError && <span className="saved-attendance-card__error">{recordTimeError}</span>}
            </div>
            <button type="button" disabled={recordingOwnTime} onClick={() => { void onRecordMyTime(units); }} className="saved-attendance-card__record-btn">
              {recordingOwnTime ? 'Recording...' : 'Record time'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedAttendanceNoteCard;
