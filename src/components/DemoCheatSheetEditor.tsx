// src/components/DemoCheatSheetEditor.tsx
//
// Edit-mode rendering for a single cheat-sheet section in the Ctrl+Shift+D
// overlay. Read-only mode lives inline in DemoCheatSheetOverlay.tsx; this
// file is mounted only when the presenter flips the Edit toggle.
//
// What you can do here:
//   • Rename the section title (inline input).
//   • Change readiness (segmented control: ready / settling / not for use / —).
//   • Add / remove / reorder action points in four tables:
//       Basic notes, Detailed notes, Approach LZ when, Cross-app.
//
// Drag-and-drop is native HTML5 (no new dep). Alt+↑ / Alt+↓ reorders by
// keyboard for accessibility and Simple-Browser quirks.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { colours } from '../app/styles/colours';
import type { DemoSection, ReadinessTier } from './demoCheatSheet.data';
import type { SectionOverride } from './demoCheatSheetOverrides';

type ListKey = 'basicNotes' | 'notes' | 'approachLZWhen' | 'crossApp';

// Textarea that grows to fit its content so long bullets are never clipped
// inside the cheat-sheet edit row. Resizes on value change AND on width
// change (overlay can be resized while editing).
const AutoGrowTextarea: React.FC<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
> = (props) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
};

interface Props {
  section: DemoSection;
  isDarkMode: boolean;
  onChange: (patch: SectionOverride) => void;
  onResetSection: () => void;
  hasOverride: boolean;
}

interface RowEntry { id: string; text: string; }

let __rowSeq = 0;
function freshId(): string {
  __rowSeq += 1;
  return `r${Date.now().toString(36)}_${__rowSeq}`;
}

function toRows(items?: string[]): RowEntry[] {
  return (items || []).map((t) => ({ id: freshId(), text: t }));
}

function rowsToStrings(rows: RowEntry[]): string[] {
  return rows.map((r) => r.text.trim()).filter((t) => t.length > 0);
}

const READINESS_TIERS: Array<{ value: ReadinessTier | ''; label: string }> = [
  { value: '', label: '—' },
  { value: 'ready', label: 'Ready' },
  { value: 'settling', label: 'Settling' },
  { value: 'not-for-use', label: 'Not for use' },
];

const DemoCheatSheetEditor: React.FC<Props> = ({
  section,
  isDarkMode,
  onChange,
  onResetSection,
  hasOverride,
}) => {
  const accent = colours.highlight;
  const warn = colours.orange;
  const heading = isDarkMode ? colours.dark.text : colours.light.text;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const cardBg = isDarkMode ? colours.dark.cardBackground : '#ffffff';
  const softBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)';
  const raisedSurface = isDarkMode ? 'rgba(8, 28, 48, 0.86)' : '#ffffff';
  const navSurface = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(214, 232, 255, 0.34)';
  const panelShadow = isDarkMode ? '0 10px 24px rgba(0,0,0,0.18)' : '0 10px 22px rgba(6,23,51,0.06)';

  // Local row state — keyed for stable React + DnD identity. We re-seed when
  // the active section changes (parent passes a new `section`).
  const [rows, setRows] = useState<Record<ListKey, RowEntry[]>>(() => ({
    basicNotes: toRows(section.basicNotes),
    notes: toRows(section.notes),
    approachLZWhen: toRows(section.approachLZWhen),
    crossApp: toRows(section.crossApp),
  }));
  // Reseed when the active section changes or its content is swapped in.
  useEffect(() => {
    setRows({
      basicNotes: toRows(section.basicNotes),
      notes: toRows(section.notes),
      approachLZWhen: toRows(section.approachLZWhen),
      crossApp: toRows(section.crossApp),
    });
  }, [section.approachLZWhen, section.basicNotes, section.crossApp, section.id, section.notes]);

  // Commit straight through — localStorage writes are cheap and we want
  // edits to survive an immediate close / reload. Debouncing was risky here
  // because a later patch on a different field would clobber an earlier one.
  const queueCommit = useCallback((patch: SectionOverride) => {
    onChange(patch);
  }, [onChange]);

  // ── Title + readiness ──────────────────────────────────────────────────
  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    queueCommit({ title: val });
  };
  const onReadinessPick = (value: ReadinessTier | '') => {
    onChange({ readiness: value === '' ? null : value });
  };

  // ── DnD ────────────────────────────────────────────────────────────────
  const dragRef = useRef<{ key: ListKey; id: string } | null>(null);
  const onDragStart = (key: ListKey, id: string) => (e: React.DragEvent) => {
    dragRef.current = { key, id };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* IE noop */ }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (key: ListKey, targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.key !== key || drag.id === targetId) return;
    const list = rows[key];
    const fromIdx = list.findIndex((r) => r.id === drag.id);
    const toIdx = list.findIndex((r) => r.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = list.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setRows((prev) => ({ ...prev, [key]: next }));
    queueCommit({ [key]: rowsToStrings(next) } as SectionOverride);
  };

  const moveBy = (key: ListKey, id: string, delta: -1 | 1) => {
    const list = rows[key];
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= list.length) return;
    const next = list.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    setRows((prev) => ({ ...prev, [key]: next }));
    queueCommit({ [key]: rowsToStrings(next) } as SectionOverride);
  };

  const editRow = (key: ListKey, id: string, text: string) => {
    const next = rows[key].map((r) => (r.id === id ? { ...r, text } : r));
    setRows((prev) => ({ ...prev, [key]: next }));
    queueCommit({ [key]: rowsToStrings(next) } as SectionOverride);
  };
  const removeRow = (key: ListKey, id: string) => {
    const next = rows[key].filter((r) => r.id !== id);
    setRows((prev) => ({ ...prev, [key]: next }));
    queueCommit({ [key]: rowsToStrings(next) } as SectionOverride);
  };
  const addRow = (key: ListKey) => {
    setRows((prev) => {
      const next = [...prev[key], { id: freshId(), text: '' }];
      // Don't commit empty rows — wait until they have content.
      return { ...prev, [key]: next };
    });
  };

  // ── Styles ─────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.7px',
    textTransform: 'uppercase',
    color: muted,
    margin: '14px 0 6px 0',
  };
  const titleInput: React.CSSProperties = {
    fontFamily: 'Raleway, sans-serif',
    fontSize: 18,
    fontWeight: 700,
    color: heading,
    backgroundColor: raisedSurface,
    border: `1px solid ${softBorder}`,
    padding: '10px 12px',
    width: '100%',
    borderRadius: 0,
    boxSizing: 'border-box',
    letterSpacing: '-0.2px',
    boxShadow: panelShadow,
  };
  const segmentBtn = (active: boolean, tier: ReadinessTier | ''): React.CSSProperties => {
    const tierColor: Record<string, string> = {
      'ready': '#20b26c',
      'settling': '#FF8C00',
      'not-for-use': '#6B6B6B',
      '': muted,
    };
    const c = tierColor[tier] || muted;
    return {
      appearance: 'none',
      fontFamily: 'Raleway, sans-serif',
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      padding: '5px 9px',
      border: `1px solid ${active ? c : softBorder}`,
      backgroundColor: active ? (isDarkMode ? `${c}22` : `${c}16`) : raisedSurface,
      color: active ? c : body,
      borderRadius: 0,
      cursor: 'pointer',
      boxShadow: active ? panelShadow : 'none',
    };
  };

  const tableShell: React.CSSProperties = {
    border: `1px solid ${softBorder}`,
    backgroundColor: raisedSurface,
    boxShadow: panelShadow,
  };
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '20px 28px 1fr 24px 24px 24px',
    alignItems: 'stretch',
    borderBottom: `1px solid ${softBorder}`,
    backgroundColor: navSurface,
  };
  const cellMuted: React.CSSProperties = {
    fontSize: 11,
    color: muted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontVariantNumeric: 'tabular-nums',
  };
  const textareaStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'Raleway, sans-serif',
    fontSize: 13,
    lineHeight: 1.45,
    color: body,
    backgroundColor: 'transparent',
    border: 'none',
    padding: '8px 10px',
    resize: 'none',
    outline: 'none',
    minHeight: 28,
    overflow: 'hidden',
    boxSizing: 'border-box',
  };
  const iconBtnStyle: React.CSSProperties = {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    color: muted,
    cursor: 'pointer',
    padding: 0,
    fontSize: 14,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const addBtn: React.CSSProperties = {
    appearance: 'none',
    width: '100%',
    border: `1px dashed ${softBorder}`,
    backgroundColor: raisedSurface,
    color: body,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    padding: '8px 10px',
    cursor: 'pointer',
    borderRadius: 0,
    marginTop: 6,
    boxShadow: panelShadow,
  };

  // ── Table component ────────────────────────────────────────────────────
  const renderTable = (key: ListKey, label: string, accentColor?: string) => {
    const list = rows[key];
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{
          ...labelStyle,
          color: accentColor || muted,
          margin: 0,
          marginBottom: 6,
        }}>{label}</div>
        <div style={tableShell}>
          {list.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: muted, fontStyle: 'italic' }}>
              No items yet.
            </div>
          )}
          {list.map((row, idx) => (
            <div
              key={row.id}
              style={rowStyle}
              draggable
              onDragStart={onDragStart(key, row.id)}
              onDragOver={onDragOver}
              onDrop={onDrop(key, row.id)}
            >
              <div
                style={{ ...cellMuted, cursor: 'grab' }}
                title="Drag to reorder"
                aria-label="Drag handle"
              >⋮⋮</div>
              <div style={cellMuted}>{idx + 1}</div>
              <AutoGrowTextarea
                value={row.text}
                onChange={(e) => editRow(key, row.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.altKey && e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveBy(key, row.id, -1);
                  } else if (e.altKey && e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveBy(key, row.id, 1);
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addRow(key);
                  }
                }}
                rows={1}
                style={textareaStyle}
                placeholder="Action point…"
              />
              <button
                type="button"
                style={iconBtnStyle}
                title="Move up (Alt+↑)"
                onClick={() => moveBy(key, row.id, -1)}
                disabled={idx === 0}
              >↑</button>
              <button
                type="button"
                style={iconBtnStyle}
                title="Move down (Alt+↓)"
                onClick={() => moveBy(key, row.id, 1)}
                disabled={idx === list.length - 1}
              >↓</button>
              <button
                type="button"
                style={{ ...iconBtnStyle, color: warn }}
                title="Remove row"
                onClick={() => removeRow(key, row.id)}
              >×</button>
            </div>
          ))}
        </div>
        <button type="button" style={addBtn} onClick={() => addRow(key)}>
          + Add row
        </button>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          color: accent,
        }}>Step {section.order}</span>
        {hasOverride && (
          <button
            type="button"
            onClick={onResetSection}
            title="Discard local edits for this section"
            style={{
              appearance: 'none',
              border: `1px solid ${softBorder}`,
              backgroundColor: raisedSurface,
              color: body,
              fontFamily: 'Raleway, sans-serif',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              padding: '5px 8px',
              borderRadius: 0,
              cursor: 'pointer',
              marginLeft: 'auto',
              boxShadow: panelShadow,
            }}
          >Reset section</button>
        )}
      </div>
      <input
        type="text"
        value={section.title}
        onChange={onTitleChange}
        style={titleInput}
        aria-label="Section title"
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          color: muted,
          marginRight: 4,
        }}>Readiness</span>
        {READINESS_TIERS.map((t) => (
          <button
            key={t.value || '_none'}
            type="button"
            onClick={() => onReadinessPick(t.value)}
            style={segmentBtn((section.readiness || '') === t.value, t.value)}
          >{t.label}</button>
        ))}
      </div>

      {renderTable('basicNotes', 'Basic notes', accent)}
      {renderTable('notes', 'Detailed notes')}
      {renderTable('approachLZWhen', 'Approach LZ when', warn)}
      {renderTable('crossApp', 'Cross-app')}

      <div style={{
        marginTop: 18,
        fontSize: 11,
        color: body,
        fontStyle: 'italic',
        lineHeight: 1.5,
      }}>
        Basic notes drive the compact call mode. Detailed notes stay as the fuller reference.
        Edits save automatically to this browser. Drag the ⋮⋮ handle, or use Alt+↑/↓. Press Enter in a row to add another below.
      </div>

      {/* Suppress unused warning when accent not used in tables */}
      <div style={{ display: 'none' }}>{cardBg}</div>
    </div>
  );
};

export default DemoCheatSheetEditor;

// re-export type so the overlay can pass through the right shape
export type { SectionOverride };
