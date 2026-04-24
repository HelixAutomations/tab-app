import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';

interface StashedBriefsPanelProps {
  isDarkMode: boolean;
  initials: string | null;
}

type BriefSummary = {
  id: string | null;
  title: string;
  file: string;
  status: string;
  verified: string | null;
  ageDays: number | null;
  branch: string | null;
  touches: { client?: string[]; server?: string[]; submodules?: string[] };
  depends_on: string[];
  coordinates_with: string[];
  conflicts_with: string[];
  shipped: boolean;
  shipped_on: string | null;
  hasMetaBlock: boolean;
};

type BriefDetail = BriefSummary & { content: string };

const STATUS_COLOUR: Record<string, { light: string; dark: string }> = {
  '🟡': { light: colours.orange, dark: colours.orange },
  '⚪': { light: colours.greyText, dark: colours.subtleGrey },
  '🟢': { light: colours.green, dark: colours.green },
  '▶️': { light: colours.highlight, dark: colours.accent },
};

const STATUS_LABEL: Record<string, string> = {
  '🟡': 'Open',
  '⚪': 'Stale',
  '🟢': 'Done',
  '▶️': 'Ready',
};

function buildAuthQuery(initials: string | null): string {
  if (!initials) return '';
  const trimmed = initials.trim();
  return trimmed ? `?initials=${encodeURIComponent(trimmed)}` : '';
}

function buildAuthHeaders(initials: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (initials) headers['x-user-initials'] = initials;
  return headers;
}

const Toast: React.FC<{ kind: 'success' | 'error'; message: string; onClose: () => void }> = ({ kind, message, onClose }) => {
  useEffect(() => {
    const id = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(id);
  }, [onClose]);
  const colour = kind === 'success' ? colours.green : colours.cta;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        background: colour,
        color: '#fff',
        padding: '10px 14px',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.2px',
        fontFamily: 'Raleway, sans-serif',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        zIndex: 1000,
        borderRadius: 0,
      }}
    >
      {message}
    </div>
  );
};

const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 3, 25, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colours.darkBlue,
          color: '#f3f4f6',
          padding: 24,
          maxWidth: 440,
          width: '90%',
          fontFamily: 'Raleway, sans-serif',
          borderRadius: 0,
          border: '1px solid rgba(75, 85, 99, 0.55)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: '#d1d5db', marginBottom: 18 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: '#d1d5db',
              border: '1px solid #4b5563',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: 0,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: colours.cta,
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: 0,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const BriefRow: React.FC<{
  brief: BriefSummary;
  isDarkMode: boolean;
  expanded: boolean;
  detail: BriefDetail | null;
  detailLoading: boolean;
  onToggle: () => void;
  onReverify: () => void;
  onClose: () => void;
  onEdit: () => void;
  busy: boolean;
}> = ({ brief, isDarkMode, expanded, detail, detailLoading, onToggle, onReverify, onClose, onEdit, busy }) => {
  const [hovered, setHovered] = useState(false);
  const colourPair = STATUS_COLOUR[brief.status] || STATUS_COLOUR['🟡'];
  const statusColour = isDarkMode ? colourPair.dark : colourPair.light;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;

  const ageNote = brief.ageDays != null ? `${brief.ageDays}d` : '—';
  const totalCoords =
    (brief.depends_on?.length || 0) +
    (brief.coordinates_with?.length || 0) +
    (brief.conflicts_with?.length || 0);

  return (
    <div style={{ borderTop: `1px solid ${borderColour}` }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 14px',
          cursor: 'pointer',
          background: hovered ? (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
          transition: 'background 0.12s',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColour,
            marginTop: 6,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: textColour,
              lineHeight: 1.4,
              letterSpacing: '-0.1px',
            }}
          >
            {brief.title}
          </div>
          <div
            style={{
              fontSize: 11,
              marginTop: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              color: muted,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: statusColour,
                opacity: 0.85,
              }}
            >
              {STATUS_LABEL[brief.status] || 'Open'}
            </span>
            {brief.id && (
              <span style={{ fontFamily: 'monospace', opacity: 0.85 }}>{brief.id}</span>
            )}
            <span>{ageNote}</span>
            {totalCoords > 0 && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color: brief.conflicts_with?.length ? colours.cta : muted,
                }}
              >
                {brief.conflicts_with?.length ? `⚠ ${brief.conflicts_with.length} conflict${brief.conflicts_with.length === 1 ? '' : 's'}` : `${totalCoords} link${totalCoords === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            opacity: 0.5,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            display: 'inline-block',
            marginTop: 6,
          }}
        >
          ▶
        </span>
      </div>

      {expanded && (
        <div
          style={{
            padding: '8px 14px 16px 36px',
            borderTop: `1px solid ${borderColour}`,
            background: isDarkMode ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.02)',
          }}
        >
          {(brief.depends_on?.length || brief.coordinates_with?.length || brief.conflicts_with?.length) && (
            <div style={{ fontSize: 11, color: muted, marginBottom: 10, lineHeight: 1.5 }}>
              {brief.depends_on?.length ? <div><strong style={{ color: textColour }}>Depends on:</strong> {brief.depends_on.join(', ')}</div> : null}
              {brief.coordinates_with?.length ? <div><strong style={{ color: textColour }}>Coordinates with:</strong> {brief.coordinates_with.join(', ')}</div> : null}
              {brief.conflicts_with?.length ? <div style={{ color: colours.cta }}><strong>Conflicts with:</strong> {brief.conflicts_with.join(', ')}</div> : null}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onReverify(); }}
              disabled={busy}
              style={{
                background: 'transparent',
                color: isDarkMode ? colours.accent : colours.highlight,
                border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
                borderRadius: 0,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              Re-verify
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              disabled={busy || !detail}
              style={{
                background: 'transparent',
                color: isDarkMode ? colours.accent : colours.highlight,
                border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: 700,
                cursor: busy || !detail ? 'not-allowed' : 'pointer',
                opacity: busy || !detail ? 0.5 : 1,
                borderRadius: 0,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              Edit body
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              disabled={busy}
              style={{
                background: 'transparent',
                color: colours.cta,
                border: `1px solid ${colours.cta}`,
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
                borderRadius: 0,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              Mark shipped
            </button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: muted, fontFamily: 'monospace', alignSelf: 'center' }}>
              {brief.file}
            </span>
          </div>

          {detailLoading && <div style={{ fontSize: 12, color: muted }}>Loading…</div>}
          {detail && (
            <pre
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
                lineHeight: 1.5,
                color: muted,
                background: 'transparent',
                margin: 0,
                padding: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 360,
                overflowY: 'auto',
              }}
            >
              {detail.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

const EditDialog: React.FC<{
  open: boolean;
  brief: BriefDetail | null;
  onSave: (next: string) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}> = ({ open, brief, onSave, onCancel, saving }) => {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (open && brief) setDraft(brief.content);
  }, [open, brief]);

  if (!open || !brief) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 3, 25, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colours.darkBlue,
          color: '#f3f4f6',
          padding: 24,
          width: 'min(900px, 95vw)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Raleway, sans-serif',
          borderRadius: 0,
          border: '1px solid rgba(75, 85, 99, 0.55)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Edit body — {brief.title}</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 12 }}>
          Editing the markdown body. The Stash metadata block is locked — change it in the file directly.
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 360,
            background: '#020617',
            color: '#d1d5db',
            border: '1px solid #4b5563',
            padding: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.5,
            resize: 'vertical',
            borderRadius: 0,
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              background: 'transparent',
              color: '#d1d5db',
              border: '1px solid #4b5563',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              borderRadius: 0,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={saving || draft === brief.content}
            style={{
              background: colours.highlight,
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: saving || draft === brief.content ? 'not-allowed' : 'pointer',
              opacity: saving || draft === brief.content ? 0.5 : 1,
              borderRadius: 0,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const NewBriefDialog: React.FC<{
  open: boolean;
  onCreate: (title: string) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}> = ({ open, onCreate, onCancel, saving }) => {
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (open) setTitle('');
  }, [open]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 3, 25, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colours.darkBlue,
          color: '#f3f4f6',
          padding: 24,
          width: 'min(480px, 95vw)',
          fontFamily: 'Raleway, sans-serif',
          borderRadius: 0,
          border: '1px solid rgba(75, 85, 99, 0.55)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Stash a new brief</div>
        <div style={{ fontSize: 11, color: '#A0A0A0', marginBottom: 14 }}>
          Title becomes the file slug + brief id. Fill out §1–§9 and the metadata block in the file.
        </div>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Replace foo with bar"
          style={{
            width: '100%',
            background: '#020617',
            color: '#f3f4f6',
            border: '1px solid #4b5563',
            padding: '10px 12px',
            fontSize: 13,
            fontFamily: 'Raleway, sans-serif',
            borderRadius: 0,
            marginBottom: 16,
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              background: 'transparent',
              color: '#d1d5db',
              border: '1px solid #4b5563',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              borderRadius: 0,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(title.trim())}
            disabled={saving || !title.trim()}
            style={{
              background: colours.highlight,
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !title.trim() ? 0.5 : 1,
              borderRadius: 0,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

const StashedBriefsPanel: React.FC<StashedBriefsPanelProps> = ({ isDarkMode, initials }) => {
  const [items, setItems] = useState<BriefSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BriefDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const auth = useMemo(() => buildAuthQuery(initials), [initials]);
  const headers = useMemo(() => buildAuthHeaders(initials), [initials]);

  const showToast = useCallback((kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
  }, []);

  const loadList = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/stash-briefs${auth}`, { headers });
      if (res.status === 403) {
        setError('Forbidden — dev-owner only');
        setItems([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load briefs');
    } finally {
      setLoading(false);
    }
  }, [auth, headers]);

  useEffect(() => { void loadList(); }, [loadList]);

  const openBrief = useCallback(async (id: string | null) => {
    if (!id) return;
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/stash-briefs/${encodeURIComponent(id)}${auth}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data as BriefDetail);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load brief');
    } finally {
      setDetailLoading(false);
    }
  }, [auth, headers, showToast]);

  const handleToggle = useCallback((id: string | null) => {
    if (!id) return;
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    void openBrief(id);
  }, [expandedId, openBrief]);

  const handleReverify = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/stash-briefs/${encodeURIComponent(id)}/reverify${auth}`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('success', 'Re-verified');
      await loadList();
      if (expandedId === id) await openBrief(id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Re-verify failed');
    } finally {
      setBusyId(null);
    }
  }, [auth, headers, loadList, expandedId, openBrief, showToast]);

  const handleClose = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/stash-briefs/${encodeURIComponent(id)}/close${auth}`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ripple = data?.dependents?.length ? ` (${data.dependents.length} dependent${data.dependents.length === 1 ? '' : 's'})` : '';
      showToast('success', `Marked shipped${ripple}`);
      setExpandedId(null);
      setDetail(null);
      await loadList();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Close failed');
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }, [auth, headers, loadList, showToast]);

  const handleSaveEdit = useCallback(async (next: string) => {
    if (!detail?.id) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/stash-briefs/${encodeURIComponent(detail.id)}${auth}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ content: next }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        showToast('error', data?.detail || 'Metadata block changed — edit the file directly');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('success', 'Saved');
      setEditOpen(false);
      await loadList();
      await openBrief(detail.id);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingEdit(false);
    }
  }, [detail, auth, headers, loadList, openBrief, showToast]);

  const handleCreateNew = useCallback(async (title: string) => {
    setCreatingNew(true);
    try {
      const res = await fetch(`/api/stash-briefs${auth}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      showToast('success', 'Brief scaffolded — fill out the body and metadata');
      setNewOpen(false);
      await loadList();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreatingNew(false);
    }
  }, [auth, headers, loadList, showToast]);

  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const bg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  const counts = useMemo(() => ({
    total: items.length,
    open: items.filter((i) => i.status === '🟡').length,
    stale: items.filter((i) => i.status === '⚪').length,
    ready: items.filter((i) => i.status === '▶️').length,
  }), [items]);

  return (
    <>
      <div
        style={{
          padding: '14px 16px',
          background: bg,
          border: `1px solid ${borderColour}`,
          borderRadius: 0,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.5px',
                color: textColour,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              Stashed briefs
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 0,
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey,
                color: muted,
                fontFamily: 'monospace',
              }}
            >
              {counts.total}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: muted }}>
              {counts.open} open · {counts.stale} stale{counts.ready ? ` · ${counts.ready} ready` : ''}
            </span>
            <button
              onClick={() => setNewOpen(true)}
              style={{
                background: 'transparent',
                color: isDarkMode ? colours.accent : colours.highlight,
                border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 0,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              + New brief
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: muted, padding: '8px 0' }}>Loading briefs…</div>
        ) : error ? (
          <div style={{ fontSize: 12, color: colours.cta, padding: '8px 0' }}>{error}</div>
        ) : items.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: colours.green,
              padding: '8px 0',
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            <span style={{ fontSize: 11 }}>✓</span>
            No briefs stashed
          </div>
        ) : (
          <div>
            {items.map((brief) => {
              const id = brief.id || brief.file;
              const isExpanded = expandedId === id;
              return (
                <BriefRow
                  key={id}
                  brief={brief}
                  isDarkMode={isDarkMode}
                  expanded={isExpanded}
                  detail={isExpanded ? detail : null}
                  detailLoading={isExpanded && detailLoading}
                  onToggle={() => handleToggle(brief.id)}
                  onReverify={() => brief.id && void handleReverify(brief.id)}
                  onClose={() => brief.id && setConfirm({ id: brief.id, title: brief.title })}
                  onEdit={() => setEditOpen(true)}
                  busy={busyId === brief.id}
                />
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title="Mark brief as shipped?"
        message={confirm ? `Closes "${confirm.title}", moves it to docs/notes/_archive/, regenerates the index, and runs the closure ripple. This cannot be undone in-app.` : ''}
        confirmLabel="Mark shipped"
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void handleClose(confirm.id)}
      />

      <EditDialog
        open={editOpen}
        brief={detail}
        onSave={handleSaveEdit}
        onCancel={() => setEditOpen(false)}
        saving={savingEdit}
      />

      <NewBriefDialog
        open={newOpen}
        onCreate={handleCreateNew}
        onCancel={() => setNewOpen(false)}
        saving={creatingNew}
      />

      {toast && <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}
    </>
  );
};

export default StashedBriefsPanel;
