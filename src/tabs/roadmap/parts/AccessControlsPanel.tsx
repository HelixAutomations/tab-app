// src/tabs/roadmap/parts/AccessControlsPanel.tsx
//
// Access Controls — Phase Access.3 (LZ-only).
// Tick-box editor for grant/revoke against the live AccessGrants table.
//
// UX contract:
// - Subjects column lists known team members (from /api/team) + a free-text
//   subject field for groups/roles (e.g. group:operations, role:fee-earner).
// - Capabilities column lists every capability returned by
//   /api/access/capabilities. The matrix cell shows:
//     · green tick   = allowed (default OR override)
//     · red cross    = explicit deny
//     · empty        = no grant
//   Hover/title text shows the source ('default' / 'override') and grant id.
// - Clicking a cell:
//     · empty -> opens a "Grant capability" form (reason, optional expiry,
//       and for tier-level capabilities a confirmation phrase).
//     · allowed/deny -> opens a "Revoke" confirmation.
// - All mutations hit /api/access (LZ-only). Cache invalidates server-side;
//   the panel refreshes its own data after every mutation.
//
// Display only — Forge already gates this panel behind isDevOwner.

import * as React from 'react';
import { createPortal } from 'react-dom';

interface RawGrant {
  GrantId: string;
  Subject: string;
  Capability: string;
  ResourceScope: string | null;
  Effect: 'allow' | 'deny';
  Source: 'default' | 'override' | 'pilot';
  Priority: number;
  GrantedBy: string;
  GrantedAt: string;
  ExpiresAt: string | null;
  Reason: string | null;
}

interface CapabilityDef {
  key: string;
  kind: 'tier' | 'feature' | 'action';
  label: string;
  description: string;
}

interface TeamMember {
  Initials: string;
  'Full Name'?: string;
  Email?: string;
  status?: string;
  Role?: string;
}

const COLOURS = {
  panelBg: 'var(--surface-card)',
  panelElevated: 'var(--surface-section)',
  panelBorder: 'var(--border-base)',
  rowBorderStrong: 'var(--border-strong)',
  rowBorder: 'var(--border-base)',
  textPrimary: 'var(--text-primary)',
  textBody: 'var(--text-body)',
  textMuted: 'var(--text-muted)',
  accent: 'var(--helix-highlight)',
  warn: 'var(--status-warning)',
  cta: 'var(--status-error)',
  ok: 'var(--status-success)',
  highlight: 'var(--helix-highlight)',
};

const TIER_CONFIRMATION_PHRASE = 'GRANT TIER';

interface CellState {
  effect: 'allow' | 'deny';
  source: RawGrant['Source'];
  grantId: string;
  expiresAt: string | null;
  reason: string | null;
}

function buildIndex(grants: RawGrant[]): Map<string, CellState> {
  // Key: `${subject}::${capability}`. If multiple grants exist (deny + allow),
  // deny wins (matches resolver precedence).
  const idx = new Map<string, CellState>();
  for (const g of grants) {
    const key = `${g.Subject}::${g.Capability}`;
    const existing = idx.get(key);
    if (!existing || (g.Effect === 'deny' && existing.effect !== 'deny')) {
      idx.set(key, {
        effect: g.Effect,
        source: g.Source,
        grantId: g.GrantId,
        expiresAt: g.ExpiresAt,
        reason: g.Reason,
      });
    }
  }
  return idx;
}

const AccessControlsPanel: React.FC = () => {
  const [open, setOpen] = React.useState<boolean>(false);
  const [grants, setGrants] = React.useState<RawGrant[]>([]);
  const [capabilities, setCapabilities] = React.useState<CapabilityDef[]>([]);
  const [team, setTeam] = React.useState<TeamMember[]>([]);
  const [extraSubjects, setExtraSubjects] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [editor, setEditor] = React.useState<null | {
    mode: 'grant' | 'revoke';
    subject: string;
    capability: string;
    capKind: CapabilityDef['kind'];
    grantId?: string;
    currentSource?: RawGrant['Source'];
  }>(null);
  const [reason, setReason] = React.useState<string>('');
  const [expiresAt, setExpiresAt] = React.useState<string>('');
  const [confirmPhrase, setConfirmPhrase] = React.useState<string>('');
  const [effect, setEffect] = React.useState<'allow' | 'deny'>('allow');

  const showToast = React.useCallback((kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gRes, cRes] = await Promise.all([
        fetch('/api/access/grants', { credentials: 'include' }).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(`grants ${r.status}`)),
        ),
        fetch('/api/access/capabilities', { credentials: 'include' }).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(`capabilities ${r.status}`)),
        ),
      ]);
      setGrants(Array.isArray(gRes?.grants) ? gRes.grants : []);
      setCapabilities(Array.isArray(cRes?.capabilities) ? cRes.capabilities : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'fetch-failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open || grants.length || capabilities.length) return;
    void refresh();
    // Team list (best-effort — panel still usable without it).
    fetch('/api/team', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          setTeam(data.filter((m: TeamMember) => m && m.Initials));
        }
      })
      .catch(() => {
        /* non-fatal */
      });
  }, [open, grants.length, capabilities.length, refresh]);

  // Subjects: known team members (user:XX) + any subject already present in
  // grants (covers group:* / role:* seeded grants) + ad-hoc extras typed by LZ.
  const subjects = React.useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const m of team) set.add(`user:${m.Initials.toUpperCase()}`);
    for (const g of grants) set.add(g.Subject);
    for (const s of extraSubjects) set.add(s);
    return Array.from(set).sort((a, b) => {
      // user:* first, then group:*, then role:*, alphabetical within.
      const order = (s: string) => (s.startsWith('user:') ? 0 : s.startsWith('group:') ? 1 : 2);
      const oa = order(a);
      const ob = order(b);
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
  }, [team, grants, extraSubjects]);

  const cellIndex = React.useMemo(() => buildIndex(grants), [grants]);

  const closeEditor = () => {
    setEditor(null);
    setReason('');
    setExpiresAt('');
    setConfirmPhrase('');
    setEffect('allow');
  };

  const openGrantEditor = (subject: string, capability: string, capKind: CapabilityDef['kind']) => {
    closeEditor();
    setEditor({ mode: 'grant', subject, capability, capKind });
  };

  const openRevokeEditor = (subject: string, capability: string, capKind: CapabilityDef['kind'], cell: CellState) => {
    closeEditor();
    setEditor({
      mode: 'revoke',
      subject,
      capability,
      capKind,
      grantId: cell.grantId,
      currentSource: cell.source,
    });
  };

  const handleSubmit = async () => {
    if (!editor) return;
    const isTier = editor.capKind === 'tier';
    if (isTier && confirmPhrase !== TIER_CONFIRMATION_PHRASE) {
      showToast('error', `Type "${TIER_CONFIRMATION_PHRASE}" to confirm tier changes.`);
      return;
    }
    const key = `${editor.subject}::${editor.capability}`;
    setBusyKey(key);
    try {
      if (editor.mode === 'grant') {
        const body: Record<string, unknown> = {
          subject: editor.subject,
          capability: editor.capability,
          effect,
          reason: reason.trim() || null,
        };
        if (expiresAt) {
          // Local datetime input (YYYY-MM-DDTHH:mm) → assume UTC.
          body.expiresAt = new Date(expiresAt).toISOString();
        }
        const res = await fetch('/api/access/grants', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `grant ${res.status}`);
        }
        showToast('success', `Granted ${editor.capability} → ${editor.subject}`);
      } else if (editor.mode === 'revoke' && editor.grantId) {
        const res = await fetch(`/api/access/grants/${editor.grantId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `revoke ${res.status}`);
        }
        showToast('success', `Revoked ${editor.capability} from ${editor.subject}`);
      }
      closeEditor();
      await refresh();
      // Phase Access.D — notify any frontend gate consuming /api/access/effective
      // (e.g. the Activity tab gate in App.tsx) so changes appear without reload.
      try { window.dispatchEvent(new CustomEvent('helix:access-changed')); } catch { /* noop */ }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'mutation-failed';
      showToast('error', msg);
    } finally {
      setBusyKey(null);
    }
  };

  const renderCell = (subject: string, cap: CapabilityDef) => {
    const key = `${subject}::${cap.key}`;
    const cell = cellIndex.get(key);
    const busy = busyKey === key;
    const baseStyle: React.CSSProperties = {
      padding: '6px 8px',
      textAlign: 'center',
      borderLeft: `1px solid ${COLOURS.rowBorder}`,
      cursor: busy ? 'wait' : 'pointer',
      fontFamily: 'monospace',
      fontSize: 12,
      userSelect: 'none',
    };
    if (!cell) {
      return (
        <td
          key={cap.key}
          style={{ ...baseStyle, color: COLOURS.textMuted }}
          title={`No grant — click to grant ${cap.key} to ${subject}`}
          onClick={() => !busy && openGrantEditor(subject, cap.key, cap.kind)}
        >
          ·
        </td>
      );
    }
    const isDeny = cell.effect === 'deny';
    return (
      <td
        key={cap.key}
        style={{
          ...baseStyle,
          color: isDeny ? COLOURS.cta : COLOURS.ok,
          fontWeight: 700,
          background: cell.source === 'override' ? 'rgba(255, 140, 0, 0.08)' : 'transparent',
        }}
        title={`${cell.effect} (source: ${cell.source}, grant: ${cell.grantId.slice(0, 8)}…)\n${cell.reason || ''}\n${cell.expiresAt ? `Expires ${cell.expiresAt}` : 'No expiry'}\nClick to revoke`}
        onClick={() => !busy && openRevokeEditor(subject, cap.key, cap.kind, cell)}
      >
        {isDeny ? '✗' : '✓'}
      </td>
    );
  };

  return (
    <div
      style={{
        marginBottom: 12,
        padding: 10,
        border: `1px solid ${COLOURS.panelBorder}`,
        background: COLOURS.panelBg,
      }}
      data-helix-region="system/forge/access-controls"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          color: COLOURS.textPrimary,
        }}
      >
        <span>
          Access &mdash; who can see what{' '}
          <span style={{ marginLeft: 8, fontSize: 10, color: COLOURS.textMuted, fontWeight: 600 }}>
            (Owner-only &middot; {grants.length} grants live)
          </span>
        </span>
        <span style={{ fontSize: 10, color: COLOURS.textMuted }}>{open ? '▾ hide' : '▸ show'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {error && (
            <div style={{ padding: 8, marginBottom: 10, color: COLOURS.cta, fontSize: 12 }}>
              Failed to load: {error}
            </div>
          )}

          {/* Add ad-hoc subject (group:* / role:*) */}
          <AddSubjectStrip
            onAdd={(s) => setExtraSubjects((prev) => (prev.includes(s) ? prev : [...prev, s]))}
          />

          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: COLOURS.textBody }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLOURS.rowBorderStrong}` }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontWeight: 700,
                      color: COLOURS.textPrimary,
                      position: 'sticky',
                      left: 0,
                      background: COLOURS.panelBg,
                      minWidth: 120,
                    }}
                  >
                    Subject
                  </th>
                  {capabilities.map((cap) => (
                    <th
                      key={cap.key}
                      style={{
                        padding: '6px 8px',
                        fontWeight: 700,
                        color: COLOURS.textPrimary,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderLeft: `1px solid ${COLOURS.rowBorder}`,
                        whiteSpace: 'nowrap',
                      }}
                      title={cap.description}
                    >
                      <div style={{ color: cap.kind === 'tier' ? COLOURS.accent : cap.kind === 'action' ? COLOURS.warn : COLOURS.highlight }}>
                        {cap.kind}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 2, color: COLOURS.textPrimary, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                        {cap.label || cap.key.replace(/^[^:]+:/, '')}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 2, color: COLOURS.textMuted, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                        {cap.key}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjects.map((subject) => (
                  <tr key={subject} style={{ borderBottom: `1px solid ${COLOURS.rowBorder}` }}>
                    <td
                      style={{
                        padding: '6px 8px',
                        fontFamily: 'monospace',
                        color: subject.startsWith('user:') ? COLOURS.textBody : COLOURS.warn,
                        position: 'sticky',
                        left: 0,
                        background: COLOURS.panelBg,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {subject}
                    </td>
                    {capabilities.map((cap) => renderCell(subject, cap))}
                  </tr>
                ))}
                {subjects.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={1 + capabilities.length}
                      style={{ padding: 16, textAlign: 'center', color: COLOURS.textMuted }}
                    >
                      No people loaded yet. Add a person, group, or role above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: COLOURS.textMuted }}>
            <span><span style={{ color: COLOURS.ok, fontWeight: 700 }}>✓</span> allow</span>
            <span><span style={{ color: COLOURS.cta, fontWeight: 700 }}>✗</span> deny</span>
            <span style={{ background: 'rgba(255, 140, 0, 0.08)', padding: '2px 6px' }}>override</span>
            <span>· click any cell to grant or revoke</span>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              style={{
                marginLeft: 'auto',
                all: 'unset',
                cursor: loading ? 'wait' : 'pointer',
                fontSize: 11,
                color: COLOURS.highlight,
                fontWeight: 600,
              }}
            >
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          <AuditLog />
        </div>
      )}

      {editor && createPortal(
        <EditorOverlay
          editor={editor}
          reason={reason}
          setReason={setReason}
          expiresAt={expiresAt}
          setExpiresAt={setExpiresAt}
          confirmPhrase={confirmPhrase}
          setConfirmPhrase={setConfirmPhrase}
          effect={effect}
          setEffect={setEffect}
          onCancel={closeEditor}
          onSubmit={handleSubmit}
          busy={busyKey !== null}
        />,
        document.body,
      )}

      {toast && createPortal(
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '10px 14px',
            background: toast.kind === 'success' ? 'rgba(32, 178, 108, 0.95)' : 'rgba(214, 85, 65, 0.95)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            zIndex: 2147483000,
            maxWidth: 360,
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
          }}
        >
          {toast.text}
        </div>,
        document.body,
      )}
    </div>
  );
};

const AddSubjectStrip: React.FC<{ onAdd: (s: string) => void }> = ({ onAdd }) => {
  const [val, setVal] = React.useState('');
  const valid = /^(user|group|role):[\w*-]+$/.test(val.trim());
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: COLOURS.textMuted }}>
      <span>Add a person, group, or role:</span>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="group:operations or role:fee-earner or user:XX"
        style={{
          flex: 1,
          maxWidth: 320,
          padding: '4px 8px',
          background: COLOURS.panelElevated,
          color: COLOURS.textPrimary,
          border: `1px solid ${COLOURS.panelBorder}`,
          fontFamily: 'monospace',
          fontSize: 11,
          borderRadius: 0,
        }}
      />
      <button
        type="button"
        disabled={!valid}
        onClick={() => {
          onAdd(val.trim());
          setVal('');
        }}
        style={{
          all: 'unset',
          cursor: valid ? 'pointer' : 'not-allowed',
          padding: '4px 10px',
          fontSize: 11,
          color: valid ? COLOURS.accent : COLOURS.textMuted,
          border: `1px solid ${valid ? COLOURS.accent : COLOURS.panelBorder}`,
          fontWeight: 600,
        }}
      >
        Add
      </button>
    </div>
  );
};

interface EditorProps {
  editor: {
    mode: 'grant' | 'revoke';
    subject: string;
    capability: string;
    capKind: CapabilityDef['kind'];
    grantId?: string;
    currentSource?: RawGrant['Source'];
  };
  reason: string;
  setReason: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  confirmPhrase: string;
  setConfirmPhrase: (v: string) => void;
  effect: 'allow' | 'deny';
  setEffect: (v: 'allow' | 'deny') => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}

const EditorOverlay: React.FC<EditorProps> = ({
  editor,
  reason,
  setReason,
  expiresAt,
  setExpiresAt,
  confirmPhrase,
  setConfirmPhrase,
  effect,
  setEffect,
  onCancel,
  onSubmit,
  busy,
}) => {
  const isTier = editor.capKind === 'tier';
  const isGrant = editor.mode === 'grant';
  const phraseOk = !isTier || confirmPhrase === TIER_CONFIRMATION_PHRASE;
  const isDefault = editor.currentSource === 'default';

  // Lock body scroll + escape to close + autofocus first input.
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    // Focus the first focusable element inside the dialog.
    const t = window.setTimeout(() => {
      const el = dialogRef.current?.querySelector<HTMLElement>('input, textarea, button');
      el?.focus();
    }, 30);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isGrant ? 'Grant capability' : 'Revoke grant'}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 3, 25, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        zIndex: 2147482000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          background: COLOURS.panelElevated,
          border: `1px solid ${COLOURS.panelBorder}`,
          padding: 20,
          color: COLOURS.textBody,
          fontSize: 13,
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
          margin: 'auto',
        }}
      >
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLOURS.accent, marginBottom: 8, fontWeight: 700 }}>
          {isGrant ? 'Grant capability' : 'Revoke grant'}
        </div>
        <div style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 13, color: COLOURS.textPrimary }}>
          {editor.capability} {isGrant ? '→' : '×'} {editor.subject}
        </div>

        {isGrant && (
          <>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: COLOURS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Effect</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['allow', 'deny'] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEffect(e)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: effect === e ? COLOURS.textPrimary : COLOURS.textMuted,
                      border: `1px solid ${effect === e ? (e === 'deny' ? COLOURS.cta : COLOURS.ok) : COLOURS.panelBorder}`,
                      background: effect === e ? (e === 'deny' ? 'rgba(214, 85, 65, 0.15)' : 'rgba(32, 178, 108, 0.15)') : 'transparent',
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: COLOURS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reason</div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this grant exists (audit trail)"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  background: COLOURS.panelBg,
                  color: COLOURS.textPrimary,
                  border: `1px solid ${COLOURS.panelBorder}`,
                  fontSize: 13,
                  borderRadius: 0,
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: COLOURS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Expires (optional, UTC)
              </div>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: COLOURS.panelBg,
                  color: COLOURS.textPrimary,
                  border: `1px solid ${COLOURS.panelBorder}`,
                  fontSize: 13,
                  borderRadius: 0,
                  fontFamily: 'monospace',
                }}
              />
            </label>
          </>
        )}

        {!isGrant && (
          <div style={{ marginBottom: 12, padding: 10, border: `1px solid ${isDefault ? COLOURS.warn : COLOURS.panelBorder}`, color: isDefault ? COLOURS.warn : COLOURS.textBody, fontSize: 12, lineHeight: 1.5 }}>
            {isDefault
              ? 'This is a DEFAULT grant. Revoking it is permanent until manually re-seeded — the migration script will not re-insert it on next run.'
              : 'Revoking will set RevokedAt and emit Access.Grant.Revoked. The history row is preserved for audit.'}
          </div>
        )}

        {isTier && (
          <label style={{ display: 'block', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: COLOURS.cta, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Tier change · type "{TIER_CONFIRMATION_PHRASE}" to confirm
            </div>
            <input
              type="text"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={TIER_CONFIRMATION_PHRASE}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: COLOURS.panelBg,
                color: phraseOk ? COLOURS.ok : COLOURS.textPrimary,
                border: `1px solid ${phraseOk ? COLOURS.ok : COLOURS.cta}`,
                fontSize: 13,
                fontFamily: 'monospace',
                borderRadius: 0,
                boxSizing: 'border-box',
              }}
            />
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              all: 'unset',
              cursor: busy ? 'wait' : 'pointer',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: COLOURS.textMuted,
              border: `1px solid ${COLOURS.panelBorder}`,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !phraseOk}
            style={{
              all: 'unset',
              cursor: busy || !phraseOk ? 'not-allowed' : 'pointer',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: busy || !phraseOk ? COLOURS.textMuted : isGrant ? COLOURS.highlight : COLOURS.cta,
              border: '1px solid transparent',
            }}
          >
            {busy ? 'Working…' : isGrant ? `Grant (${effect})` : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface HistoryRow {
  HistoryId: number;
  GrantId: string;
  Action: 'created' | 'revoked' | 'expired' | 'modified';
  ActorInitials: string;
  At: string;
  Subject: string | null;
  Capability: string | null;
  Effect: 'allow' | 'deny' | null;
  Source: 'default' | 'override' | 'pilot' | null;
  ExpiresAt: string | null;
  RevokedAt: string | null;
}

const AuditLog: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<HistoryRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sweeping, setSweeping] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/access/history?limit=100', { credentials: 'include' });
      if (!res.ok) throw new Error(`history ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data?.history) ? data.history : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch-failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const sweepNow = React.useCallback(async () => {
    setSweeping(true);
    try {
      const res = await fetch('/api/access/sweep-now', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `sweep ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sweep-failed');
    } finally {
      setSweeping(false);
    }
  }, [load]);

  React.useEffect(() => {
    if (open && rows.length === 0 && !loading) {
      void load();
    }
  }, [open, rows.length, loading, load]);

  const actionColour = (action: HistoryRow['Action']) =>
    action === 'created' ? COLOURS.ok :
    action === 'revoked' ? COLOURS.cta :
    action === 'expired' ? COLOURS.warn :
    COLOURS.highlight;

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '4px 8px',
    color: COLOURS.textPrimary,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontSize: 10,
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${COLOURS.rowBorder}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 700,
            color: COLOURS.highlight,
          }}
        >
          {open ? '▾' : '▸'} Audit log {rows.length > 0 ? `(${rows.length})` : ''}
        </button>
        {open && (
          <>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={{
                all: 'unset',
                cursor: loading ? 'wait' : 'pointer',
                fontSize: 11,
                color: COLOURS.textMuted,
              }}
            >
              {loading ? 'Loading…' : '↻'}
            </button>
            <button
              type="button"
              onClick={sweepNow}
              disabled={sweeping}
              title="Manually run the expiry sweep (LZ only)"
              style={{
                marginLeft: 'auto',
                all: 'unset',
                cursor: sweeping ? 'wait' : 'pointer',
                fontSize: 11,
                color: COLOURS.warn,
                fontWeight: 600,
                border: `1px solid ${COLOURS.warn}`,
                padding: '2px 8px',
              }}
            >
              {sweeping ? 'Sweeping…' : 'Sweep expired now'}
            </button>
          </>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {error && (
            <div style={{ padding: 6, color: COLOURS.cta, fontSize: 12 }}>Failed: {error}</div>
          )}
          {rows.length === 0 && !loading && !error && (
            <div style={{ padding: 12, color: COLOURS.textMuted, fontSize: 12 }}>
              No audit events yet.
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: COLOURS.textBody }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLOURS.rowBorderStrong}`, position: 'sticky', top: 0, background: COLOURS.panelBg }}>
                    <th style={thStyle}>When (UTC)</th>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Subject</th>
                    <th style={thStyle}>Capability</th>
                    <th style={thStyle}>Actor</th>
                    <th style={thStyle}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.HistoryId} style={{ borderBottom: `1px solid ${COLOURS.rowBorder}` }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: COLOURS.textMuted }}>
                        {new Date(r.At).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td style={{ padding: '4px 8px', color: actionColour(r.Action), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {r.Action}
                      </td>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{r.Subject || '—'}</td>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{r.Capability || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{r.ActorInitials}</td>
                      <td style={{ padding: '4px 8px', color: COLOURS.textMuted }}>{r.Source || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccessControlsPanel;
