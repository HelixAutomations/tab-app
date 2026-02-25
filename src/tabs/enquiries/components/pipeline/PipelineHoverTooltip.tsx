/**
 * PipelineHoverTooltip — floating tooltip that appears when hovering a pipeline chip.
 *
 * Portal-rendered to `document.body` at the pointer coordinates supplied
 * by the parent via `PipelineHoverInfo`.
 *
 * NOTE: `borderRadius: 10` is kept for this tooltip specifically as it is a
 * floating overlay, not a surface card. The Helix design rule (`borderRadius: 0`)
 * applies to cards, panels, and buttons — not ephemeral pop-ups.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { colours } from '../../../../app/styles/colours';
import { renderPipelineIcon } from './renderPipelineIcon';
import type { PipelineHoverInfo } from './types';

interface Props {
  info: PipelineHoverInfo | null;
  isDarkMode: boolean;
}

const PipelineHoverTooltip: React.FC<Props> = ({ info, isDarkMode }) => {
  if (!info || typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        top: info.y,
        left: info.x,
        background: isDarkMode ? 'rgba(8, 28, 48, 0.98)' : 'rgba(255, 255, 255, 0.98)',
        color: isDarkMode ? colours.dark.text : colours.light.text,
        border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.55)' : 'rgba(160, 160, 160, 0.28)'}`,
        borderRadius: 10,
        padding: '12px 14px',
        minWidth: 260,
        maxWidth: 340,
        boxShadow: isDarkMode
          ? '0 12px 28px rgba(0,0,0,0.5)'
          : '0 12px 28px rgba(15,23,42,0.14)',
        zIndex: 20000,
        pointerEvents: 'none',
        opacity: 1,
      }}
    >
      {/* Header: icon + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {info.iconName && renderPipelineIcon(info.iconName, info.color, 16)}
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2px' }}>
          {info.title}
        </div>
      </div>

      {/* Status badge */}
      <div
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: 4,
          background: isDarkMode
            ? 'rgba(135, 243, 243, 0.14)'
            : 'rgba(54, 144, 206, 0.1)',
          fontSize: 11,
          fontWeight: 600,
          color: info.color,
          marginBottom: info.details?.length ? 10 : 0,
        }}
      >
        {info.status}
      </div>

      {/* Detail rows */}
      {info.details && info.details.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.45)' : 'rgba(160, 160, 160, 0.22)'}`,
            paddingTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {info.details.map((detail, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: isDarkMode
                    ? '#d1d5db'
                    : '#374151',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  flexShrink: 0,
                }}
              >
                {detail.label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: isDarkMode
                    ? colours.dark.text
                    : colours.light.text,
                  textAlign: 'right',
                  wordBreak: 'break-word',
                }}
              >
                {detail.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Subtitle (client name) */}
      {info.subtitle && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.38)' : 'rgba(160, 160, 160, 0.2)'}`,
            fontSize: 10,
            color: isDarkMode
              ? colours.subtleGrey
              : colours.greyText,
            fontStyle: 'italic',
          }}
        >
          {info.subtitle}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default PipelineHoverTooltip;
