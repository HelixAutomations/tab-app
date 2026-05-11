import React from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';
import type { TodoExpansion } from '../../../tabs/home/ImmediateActionModel';

interface TodoItemExpandedPaneProps {
  expansion: TodoExpansion;
  isDarkMode: boolean;
  onAction?: (label: string) => void;
}

/** Canonical AoW tint resolver — mirrors the Brand Colour Palette table. */
const resolveAowColor = (aow: string | undefined, isDark: boolean): string => {
  const key = String(aow || '').toLowerCase();
  if (key.includes('commercial')) return isDark ? colours.accent : colours.blue;
  if (key.includes('construction')) return colours.orange;
  if (key.includes('property')) return colours.green;
  if (key.includes('employment')) return colours.yellow;
  return colours.greyText;
};

const resolveAccent = (exp: TodoExpansion, isDark: boolean): string => {
  if (exp.aow) return resolveAowColor(exp.aow, isDark);
  if (exp.kind === 'matter') return colours.green;
  if (exp.kind === 'enquiry') return isDark ? colours.accent : colours.blue;
  if (exp.kind === 'list') return isDark ? colours.accent : colours.blue;
  return isDark ? colours.accent : colours.blue;
};

const MAX_LIST_ROWS = 6;

export const TodoItemExpandedPane: React.FC<TodoItemExpandedPaneProps> = ({
  expansion,
  isDarkMode,
  onAction,
}) => {
  const accent = resolveAccent(expansion, isDarkMode);
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const helpText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const surface = isDarkMode
    ? withAlpha(colours.websiteBlue, 0.45)
    : withAlpha(colours.highlightBlue, 0.35);
  const divider = isDarkMode
    ? withAlpha(colours.dark.border, 0.4)
    : withAlpha(colours.helixBlue, 0.12);

  const fields = (expansion.fields ?? []).slice(0, 4);
  const actions = (expansion.actions ?? []).slice(0, 3);
  const listRows = (expansion.list ?? []).slice(0, MAX_LIST_ROWS);
  const hiddenRowCount = Math.max((expansion.list ?? []).length - MAX_LIST_ROWS, 0);

  return (
    <div
      role="region"
      aria-label={`${expansion.primary} details`}
      style={{
        display: 'flex',
        gap: 0,
        background: surface,
        borderTop: `1px solid ${divider}`,
        padding: '10px 12px',
        fontFamily: 'var(--font-primary)',
        animation: 'iabChipIn 0.18s ease both',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Heading block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: text,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={expansion.primary}
          >
            {expansion.primary}
          </div>
          {expansion.secondary && (
            <div
              style={{
                fontSize: 10.5,
                color: helpText,
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: 0.15,
              }}
              title={expansion.secondary}
            >
              {expansion.secondary}
            </div>
          )}
        </div>

        {/* Description */}
        {expansion.description && (
          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              color: bodyText,
              lineHeight: 1.45,
            }}
          >
            {expansion.description}
          </p>
        )}

        {/* Field grid */}
        {fields.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: fields.length === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: '4px 12px',
            }}
          >
            {fields.map((f) => (
              <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: helpText,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  {f.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: text,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={f.value}
                >
                  {f.value || '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Inline entity list (kind === 'list'). Renders a small clickable
            queue inside the expansion so users can triage from Home without
            navigating away. */}
        {listRows.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              border: `1px solid ${divider}`,
              background: isDarkMode
                ? withAlpha(colours.websiteBlue, 0.35)
                : withAlpha('#ffffff', 0.6),
            }}
          >
            {listRows.map((row, idx) => {
              const rowAccent = row.aow ? resolveAowColor(row.aow, isDarkMode) : accent;
              return (
                <button
                  key={row.id || `${row.primary}-${idx}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    row.onClick();
                    onAction?.(`open:${row.id || row.primary}`);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderTop: idx === 0 ? 'none' : `1px solid ${divider}`,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 0,
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    fontFamily: 'var(--font-primary)',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = withAlpha(
                      rowAccent,
                      isDarkMode ? 0.16 : 0.08,
                    );
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: rowAccent,
                      flex: '0 0 auto',
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row.primary}
                    >
                      {row.primary}
                    </span>
                    {row.secondary && (
                      <span
                        style={{
                          fontSize: 10,
                          color: helpText,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          letterSpacing: 0.15,
                        }}
                        title={row.secondary}
                      >
                        {row.secondary}
                      </span>
                    )}
                  </span>
                  {row.ownerInitials && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: helpText,
                        padding: '1px 5px',
                        border: `1px solid ${divider}`,
                        letterSpacing: 0.4,
                      }}
                    >
                      {row.ownerInitials}
                    </span>
                  )}
                  {row.badge && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: rowAccent,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.badge}
                    </span>
                  )}
                </button>
              );
            })}
            {hiddenRowCount > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: helpText,
                  padding: '5px 10px',
                  borderTop: `1px solid ${divider}`,
                  letterSpacing: 0.2,
                }}
              >
                +{hiddenRowCount} more
              </div>
            )}
          </div>
        )}

        {/* Action row */}
        {actions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {actions.map((a) => {
              const primary = a.tone !== 'ghost';
              return (
                <button
                  key={a.label}
                  type="button"
                  disabled={a.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (a.disabled) return;
                    a.onClick();
                    onAction?.(a.label);
                  }}
                  style={{
                    fontFamily: 'var(--font-primary)',
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: 0.2,
                    padding: '5px 10px',
                    borderRadius: 0,
                    border: `1px solid ${primary ? accent : divider}`,
                    background: primary
                      ? withAlpha(accent, isDarkMode ? 0.22 : 0.12)
                      : 'transparent',
                    color: primary ? accent : text,
                    cursor: a.disabled ? 'not-allowed' : 'pointer',
                    opacity: a.disabled ? 0.5 : 1,
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (a.disabled) return;
                    (e.currentTarget as HTMLButtonElement).style.background = withAlpha(
                      accent,
                      isDarkMode ? 0.32 : 0.2,
                    );
                  }}
                  onMouseLeave={(e) => {
                    if (a.disabled) return;
                    (e.currentTarget as HTMLButtonElement).style.background = primary
                      ? withAlpha(accent, isDarkMode ? 0.22 : 0.12)
                      : 'transparent';
                  }}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TodoItemExpandedPane;
