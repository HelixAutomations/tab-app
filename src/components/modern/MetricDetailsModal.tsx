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
          gap: 12,
        }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.08)'}`,
              background: isDarkMode ? 'rgba(2, 6, 23, 0.35)' : 'rgba(248, 250, 252, 0.85)',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontSize: 13,
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
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.08)'}`,
                background: isDarkMode ? 'rgba(2, 6, 23, 0.35)' : 'rgba(248, 250, 252, 0.85)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(100, 116, 139, 0.95)',
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
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  lineHeight: 1.35,
                  flex: 1,
                  textAlign: 'right',
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
