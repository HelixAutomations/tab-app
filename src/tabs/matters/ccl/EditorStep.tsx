import React, { useMemo, useEffect } from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import { FIELD_DISPLAY_NAMES } from '../../../shared/ccl';
import ToolbarButton from './ToolbarButton';

export interface EditorStepProps {
  content: string;
  fields?: Record<string, string>;
  editorRef: React.RefObject<HTMLDivElement>;
  isDarkMode: boolean;
  onBack: () => void;
  onProceed: () => void;
}

const EditorStep: React.FC<EditorStepProps> = ({ content, fields, editorRef, isDarkMode, onBack, onProceed }) => {
  const text = isDarkMode ? '#f1f5f9' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const cardBorder = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)';
  const inputBg = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#ffffff';
  const accentBlue = colours.highlight;

  const htmlContent = useMemo(() => {
    return content.replace(
      /\{\{([^}]+)\}\}/g,
      (_, key) => {
        const label = (FIELD_DISPLAY_NAMES as Record<string, string>)[key] || key;
        const value = fields?.[key];
        if (value && value.trim()) {
          // Filled from questionnaire — blue underline highlight
          const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
          return `<span style="background:${isDarkMode ? 'rgba(54,144,206,0.10)' : 'rgba(54,144,206,0.06)'};border-bottom:2px solid ${isDarkMode ? 'rgba(54,144,206,0.5)' : 'rgba(54,144,206,0.35)'};padding:0 2px;border-radius:1px" data-filled-field="${key}" title="Filled from questionnaire: ${label}">${escaped}</span>`;
        }
        // Unfilled — red highlight
        return `<span style="background:${isDarkMode ? 'rgba(214,85,65,0.2)' : 'rgba(214,85,65,0.12)'};color:${isDarkMode ? '#f0a090' : '#d65541'};padding:1px 4px;border-radius:2px;font-size:12px;font-weight:600;cursor:pointer" data-placeholder="${key}" contenteditable="false" title="Click to fill: ${label}">{{${label}}}</span>`;
      }
    );
  }, [content, fields, isDarkMode]);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = htmlContent;
    }
  }, [htmlContent, editorRef]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 8px',
        background: isDarkMode ? 'rgba(18,28,48,0.95)' : '#f8fafc',
        border: `1px solid ${cardBorder}`,
        borderRadius: 2,
      }}>
        {['Bold', 'Italic', 'Underline'].map((cmd) => (
          <ToolbarButton
            key={cmd}
            icon={cmd}
            onClick={() => document.execCommand(cmd.toLowerCase(), false, undefined)}
            isDarkMode={isDarkMode}
          />
        ))}
        <div style={{ width: 1, height: 18, background: cardBorder, margin: '0 4px' }} />
        {['BulletedList', 'NumberedList'].map((cmd) => (
          <ToolbarButton
            key={cmd}
            icon={cmd === 'BulletedList' ? 'BulletedList' : 'NumberedList'}
            onClick={() => document.execCommand(cmd === 'BulletedList' ? 'insertUnorderedList' : 'insertOrderedList', false, undefined)}
            isDarkMode={isDarkMode}
          />
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: textMuted }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderBottom: `2px solid ${accentBlue}`, background: isDarkMode ? 'rgba(54,144,206,0.10)' : 'rgba(54,144,206,0.06)', marginRight: 3, verticalAlign: 'middle' }} />Filled
          <span style={{ margin: '0 6px', color: cardBorder }}>|</span>
          <span style={{ display: 'inline-block', width: 8, height: 8, background: isDarkMode ? 'rgba(214,85,65,0.25)' : 'rgba(214,85,65,0.15)', marginRight: 3, verticalAlign: 'middle', borderRadius: 1 }} />Unfilled
        </span>
      </div>

      {/* Editor body */}
      <div
        ref={editorRef as React.RefObject<HTMLDivElement>}
        contentEditable
        suppressContentEditableWarning
        style={{
          flex: 1, overflow: 'auto',
          padding: '20px 24px',
          background: inputBg,
          border: `1px solid ${cardBorder}`,
          borderRadius: 2,
          color: text,
          fontSize: 13, lineHeight: 1.7,
          fontFamily: "'Segoe UI', -apple-system, sans-serif",
          whiteSpace: 'pre-wrap',
          outline: 'none',
          minHeight: 300,
        }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        onInput={() => {/* Mark dirty for future save */}}
      />

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 2,
            background: 'transparent',
            border: `1px solid ${cardBorder}`,
            color: textMuted, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.12s ease',
          }}
        >
          <Icon iconName="ChevronLeft" styles={{ root: { fontSize: 10 } }} />
          Back to Details
        </button>
        <button
          type="button"
          onClick={onProceed}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 20px', borderRadius: 2,
            background: accentBlue, color: '#fff',
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase' as const, letterSpacing: '0.04em',
            transition: 'all 0.12s ease',
          }}
        >
          Preview
          <Icon iconName="ChevronRight" styles={{ root: { fontSize: 11 } }} />
        </button>
      </div>
    </div>
  );
};

export default EditorStep;
