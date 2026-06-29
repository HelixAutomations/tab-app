import React from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';
import type { TodoExpansion } from '../../../tabs/home/ImmediateActionModel';
import './TodoItemExpandedPane.css';

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
  const helpText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const surface = isDarkMode
    ? withAlpha(colours.dark.cardBackground, 0.58)
    : withAlpha(colours.light.cardBackground, 0.96);
  const raisedSurface = isDarkMode
    ? withAlpha(colours.dark.cardHover, 0.52)
    : withAlpha(colours.grey, 0.55);
  const divider = isDarkMode
    ? withAlpha(colours.dark.border, 0.58)
    : withAlpha(colours.helixBlue, 0.14);
  const accentSoft = withAlpha(accent, isDarkMode ? 0.15 : 0.08);
  const accentLine = withAlpha(accent, isDarkMode ? 0.72 : 0.56);
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';

  const fields = (expansion.fields ?? []).slice(0, 4);
  const prompts = (expansion.prompts ?? []).slice(0, 3);
  const actions = (expansion.actions ?? []).slice(0, 3);
  const listRows = (expansion.list ?? []).slice(0, MAX_LIST_ROWS);
  const hiddenRowCount = Math.max((expansion.list ?? []).length - MAX_LIST_ROWS, 0);
  const kindLabel = expansion.kind === 'list'
    ? 'Queue'
    : expansion.kind === 'matter'
      ? 'Matter workflow'
      : expansion.kind === 'enquiry'
        ? 'Prospect workflow'
        : 'Task context';
  const cssVars = {
    '--todo-expansion-accent': accent,
    '--todo-expansion-accent-soft': accentSoft,
    '--todo-expansion-accent-line': accentLine,
    '--todo-expansion-surface': surface,
    '--todo-expansion-raised': raisedSurface,
    '--todo-expansion-border': divider,
    '--todo-expansion-text': text,
    '--todo-expansion-body': bodyText,
    '--todo-expansion-muted': helpText,
  } as React.CSSProperties;

  return (
    <div
      role="region"
      aria-label={`${expansion.primary} details`}
      className="todo-expanded-pane"
      style={cssVars}
    >
      <div className="todo-expanded-pane__rail" aria-hidden="true" />
      <div className="todo-expanded-pane__content">
        <div className="todo-expanded-pane__head">
          <div className="todo-expanded-pane__title-block">
            <div
              className="todo-expanded-pane__title"
              style={{
                color: text,
              }}
              title={expansion.primary}
            >
              {expansion.primary}
            </div>
            {expansion.secondary && (
              <div
                className="todo-expanded-pane__secondary"
                style={{
                  color: helpText,
                }}
                title={expansion.secondary}
              >
                {expansion.secondary}
              </div>
            )}
          </div>
          <span className="todo-expanded-pane__kind">{kindLabel}</span>
        </div>

        {expansion.description && (
          <p
            className="todo-expanded-pane__description"
            style={{ color: bodyText }}
          >
            {expansion.description}
          </p>
        )}

        {fields.length > 0 && (
          <div
            className="todo-expanded-pane__fields"
            data-single={fields.length === 1 ? 'true' : undefined}
          >
            {fields.map((f) => (
              <div key={f.label} className="todo-expanded-pane__field">
                <span
                  className="todo-expanded-pane__field-label"
                  style={{
                    color: helpText,
                  }}
                >
                  {f.label}
                </span>
                <span
                  className="todo-expanded-pane__field-value"
                  style={{
                    color: text,
                  }}
                  title={f.value}
                >
                  {f.value || '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {prompts.length > 0 && (
          <div className="todo-expanded-pane__prompts" aria-label="Suggested prompts">
            {prompts.map((prompt) => (
              <div key={`${prompt.label}:${prompt.body}`} className="todo-expanded-pane__prompt" data-tone={prompt.tone || 'default'}>
                <div className="todo-expanded-pane__prompt-label">{prompt.label}</div>
                <div className="todo-expanded-pane__prompt-body">{prompt.body}</div>
                {prompt.meta && <div className="todo-expanded-pane__prompt-meta">{prompt.meta}</div>}
              </div>
            ))}
          </div>
        )}

        {listRows.length > 0 && (
          <div
            className="todo-expanded-pane__list"
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
                  className="todo-expanded-pane__list-row"
                  style={{
                    '--todo-expansion-row-accent': rowAccent,
                    borderTop: idx === 0 ? 'none' : `1px solid ${divider}`,
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = withAlpha(
                      rowAccent,
                      isDarkMode ? 0.16 : 0.08,
                    );
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `inset 2px 0 0 ${withAlpha(rowAccent, isDarkMode ? 0.72 : 0.58)}`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                  }}
                >
                  <span
                    aria-hidden
                    className="todo-expanded-pane__list-dot"
                    style={{ background: rowAccent }}
                  />
                  <span className="todo-expanded-pane__list-copy">
                    <span
                      className="todo-expanded-pane__list-primary"
                      style={{
                        color: text,
                      }}
                      title={row.primary}
                    >
                      {row.primary}
                    </span>
                    {row.secondary && (
                      <span
                        className="todo-expanded-pane__list-secondary"
                        style={{
                          color: helpText,
                        }}
                        title={row.secondary}
                      >
                        {row.secondary}
                      </span>
                    )}
                  </span>
                  {row.ownerInitials && (
                    <span
                      className="todo-expanded-pane__list-owner"
                      style={{
                        color: helpText,
                        border: `1px solid ${divider}`,
                      }}
                    >
                      {row.ownerInitials}
                    </span>
                  )}
                  {row.badge && (
                    <span
                      className="todo-expanded-pane__list-badge"
                      style={{
                        color: rowAccent,
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
                className="todo-expanded-pane__hidden-count"
                style={{
                  color: helpText,
                  borderTop: `1px solid ${divider}`,
                }}
              >
                +{hiddenRowCount} more
              </div>
            )}
          </div>
        )}

        {actions.length > 0 && (
          <div className="todo-expanded-pane__actions">
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
                    border: `1px solid ${primary ? accent : divider}`,
                    background: primary
                      ? withAlpha(accent, isDarkMode ? 0.22 : 0.12)
                      : 'transparent',
                    color: primary ? accent : text,
                    cursor: a.disabled ? 'not-allowed' : 'pointer',
                    opacity: a.disabled ? 0.5 : 1,
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
