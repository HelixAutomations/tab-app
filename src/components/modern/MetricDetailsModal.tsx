import React from 'react';
import BespokePanel from '../../app/functionality/BespokePanel';
import { colours } from '../../app/styles/colours';

export interface MetricDetailsRow {
  label: string;
  value: React.ReactNode;
}

export interface MetricDetails {
  title: string;
  subtitle?: string;
  rows: MetricDetailsRow[];
}

interface MetricDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  details: MetricDetails | null;
}

const MetricDetailsModal: React.FC<MetricDetailsModalProps> = ({ isOpen, onClose, isDarkMode, details }) => {
  const rows = details?.rows ?? [];
  const shellBackground = isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(248, 250, 252, 0.9)';
  const shellBorder = `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(15, 23, 42, 0.08)'}`;

  return (
    <BespokePanel
      isOpen={isOpen}
      onClose={onClose}
      title={details?.title ?? 'Metric details'}
      description={details?.subtitle}
      isDarkMode={isDarkMode}
      variant="modal"
      width="min(760px, 95vw)"
    >
      <div
        style={{
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            border: shellBorder,
            background: shellBackground,
            padding: '12px 14px',
            borderLeft: `2px solid ${isDarkMode ? colours.accent : colours.highlight}`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              fontWeight: 700,
              color: isDarkMode ? 'rgba(255, 255, 255, 0.52)' : 'rgba(15, 23, 42, 0.55)',
              marginBottom: 6,
            }}
          >
            Metric context
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: isDarkMode ? '#d1d5db' : '#374151',
              lineHeight: 1.4,
            }}
          >
            {details?.subtitle || 'Quick reference for what this metric includes and how the comparison is calculated.'}
          </div>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              padding: 14,
              border: shellBorder,
              background: shellBackground,
              color: isDarkMode ? '#d1d5db' : '#374151',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            No extra details available for this metric.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.label}
              style={{
                padding: 14,
                border: shellBorder,
                background: shellBackground,
                borderLeft: `2px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.38)' : 'rgba(54, 144, 206, 0.42)'}`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: isDarkMode ? 'rgba(255, 255, 255, 0.52)' : 'rgba(15, 23, 42, 0.56)',
                  lineHeight: 1.2,
                  flex: '0 0 170px',
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: isDarkMode ? '#d1d5db' : '#374151',
                  lineHeight: 1.4,
                  flex: 1,
                  textAlign: 'left',
                }}
              >
                {row.value}
              </div>
            </div>
          ))
        )}
      </div>
    </BespokePanel>
  );
};

export default MetricDetailsModal;
