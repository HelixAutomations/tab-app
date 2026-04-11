/**
 * AdminOverridePanel — lets admins manually insert a pipeline activity entry.
 * Gated behind isAdminUser() — only renders when admin is logged in.
 */

import React, { useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';

interface Props {
  enquiryId: string;
  onInserted?: () => void;
}

const CHANNELS = ['email', 'call', 'teams', 'meeting', 'sms', 'other'] as const;
const DIRECTIONS = ['outbound', 'inbound'] as const;

const AdminOverridePanel: React.FC<Props> = ({ enquiryId, onInserted }) => {
  const { isDarkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<string>('email');
  const [direction, setDirection] = useState<string>('outbound');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/pipeline-activity/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiryId,
          channel,
          direction,
          subject: subject.trim() || undefined,
          notes: notes.trim() || undefined,
          timestamp: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setResult({ ok: true, msg: 'Override added' });
      setSubject('');
      setNotes('');
      onInserted?.();
    } catch (err: unknown) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const helpColor = isDarkMode ? colours.subtleGrey : colours.greyText;
  const inputBg = isDarkMode ? 'rgba(8, 28, 48, 0.72)' : 'rgba(244, 244, 246, 0.9)';
  const inputBorder = isDarkMode ? 'rgba(75, 85, 99, 0.38)' : 'rgba(160, 160, 160, 0.28)';

  if (!open) {
    return (
      <button
        type="button"
        className="prospect-overview-inline-action"
        onClick={() => setOpen(true)}
        style={{ fontSize: 11, gap: 4 }}
      >
        <Icon iconName="Add" styles={{ root: { fontSize: 10 } }} />
        <span>Add entry</span>
      </button>
    );
  }

  return (
    <div style={{
      padding: '12px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', color: colours.orange }}>
          Admin override
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: helpColor,
            padding: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Icon iconName="Cancel" styles={{ root: { fontSize: 12 } }} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 0,
            border: `1px solid ${inputBorder}`,
            background: inputBg,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>

        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 0,
            border: `1px solid ${inputBorder}`,
            background: inputBg,
            color: isDarkMode ? colours.dark.text : colours.light.text,
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (optional)"
        style={{
          fontSize: 12,
          padding: '6px 8px',
          borderRadius: 0,
          border: `1px solid ${inputBorder}`,
          background: inputBg,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          fontFamily: 'Raleway, sans-serif',
          outline: 'none',
        }}
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        style={{
          fontSize: 12,
          padding: '6px 8px',
          borderRadius: 0,
          border: `1px solid ${inputBorder}`,
          background: inputBg,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          fontFamily: 'Raleway, sans-serif',
          resize: 'vertical',
          outline: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '5px 14px',
            borderRadius: 0,
            border: 'none',
            background: colours.highlight,
            color: '#fff',
            cursor: submitting ? 'wait' : 'pointer',
            fontFamily: 'Raleway, sans-serif',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Saving…' : 'Add entry'}
        </button>
        {result && (
          <span style={{ fontSize: 11, color: result.ok ? colours.green : colours.cta }}>
            {result.msg}
          </span>
        )}
      </div>
    </div>
  );
};

export default AdminOverridePanel;
