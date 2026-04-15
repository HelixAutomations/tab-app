/**
 * ResponseTimeReport — Stacked bar chart showing response-time bucket distribution
 * for first response, fee earner contact, and formal pitch across enquiries.
 *
 * Data source: fetchPipelineContactBatch (pipeline-activity + response-metrics).
 * Aggregation: client-side useMemo over enquiries × contactVisibility.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import type { Enquiry } from '../../app/functionality/types';
import {
  reportingPanelBackground, reportingPanelBorder, reportingPanelShadow,
} from './styles/reportingFoundation';
import {
  ContactVisibilityEntry,
  fetchPipelineContactBatch,
} from '../../app/functionality/pipelineContactData';

/* ── Types ─────────────────────────────────────────── */

interface Props {
  enquiries: Enquiry[] | null;
}

type BucketLabel = '<1h' | '1-4h' | '4-24h' | '24h+';
type MetricKey = 'responseBucket' | 'feeEarnerContactBucket' | 'formalPitchBucket';

interface BucketRow {
  metric: string;
  '<1h': number;
  '1-4h': number;
  '4-24h': number;
  '24h+': number;
  noData: number;
}

const BUCKET_ORDER: BucketLabel[] = ['<1h', '1-4h', '4-24h', '24h+'];

const BUCKET_COLOURS: Record<string, string> = {
  '<1h': colours.green,
  '1-4h': colours.blue,
  '4-24h': colours.orange,
  '24h+': colours.cta,
  noData: colours.subtleGrey,
};

const METRIC_LABELS: Record<MetricKey, string> = {
  responseBucket: 'First Response',
  feeEarnerContactBucket: 'Fee Earner Contact',
  formalPitchBucket: 'Formal Pitch',
};

/* ── Component ─────────────────────────────────────── */

const ResponseTimeReport: React.FC<Props> = ({ enquiries }) => {
  const { isDarkMode } = useTheme();
  const [visibilityMap, setVisibilityMap] = useState<Map<string, ContactVisibilityEntry>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const enquiryIds = useMemo(() => {
    return (enquiries || [])
      .map((e) => String(e.ID || ''))
      .filter(Boolean);
  }, [enquiries]);

  const loadData = useCallback(async () => {
    if (enquiryIds.length === 0) return;
    setLoading(true);
    try {
      const result = await fetchPipelineContactBatch(enquiryIds);
      setVisibilityMap(result);
      setLoaded(true);
    } catch {
      // fail silently — chart will show empty state
    } finally {
      setLoading(false);
    }
  }, [enquiryIds]);

  useEffect(() => {
    if (!loaded && enquiryIds.length > 0) {
      loadData();
    }
  }, [loaded, enquiryIds.length, loadData]);

  const chartData = useMemo<BucketRow[]>(() => {
    const metrics: MetricKey[] = ['responseBucket', 'feeEarnerContactBucket', 'formalPitchBucket'];

    return metrics.map((metricKey) => {
      const row: BucketRow = {
        metric: METRIC_LABELS[metricKey],
        '<1h': 0,
        '1-4h': 0,
        '4-24h': 0,
        '24h+': 0,
        noData: 0,
      };

      for (const id of enquiryIds) {
        const entry = visibilityMap.get(id);
        const bucket = entry?.[metricKey] as BucketLabel | undefined;
        if (bucket && BUCKET_ORDER.includes(bucket)) {
          row[bucket]++;
        } else {
          row.noData++;
        }
      }

      return row;
    });
  }, [visibilityMap, enquiryIds]);

  const totalEnquiries = enquiryIds.length;
  const hasData = visibilityMap.size > 0;

  /* ── Styles ─────────────────────────────────────── */
  const panelStyle: React.CSSProperties = {
    background: reportingPanelBackground(isDarkMode),
    border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
    boxShadow: reportingPanelShadow(isDarkMode),
    borderRadius: 0,
    padding: 24,
    marginBottom: 16,
  };

  const headingColour = isDarkMode ? colours.dark.text : colours.light.text;
  const subTextColour = isDarkMode ? '#d1d5db' : '#374151';
  const axisColour = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <div style={{ padding: '0 16px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Icon iconName="SpeedHigh" style={{ fontSize: 18, color: isDarkMode ? colours.accent : colours.highlight }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: headingColour, fontFamily: 'Raleway, sans-serif' }}>
            Response Time Distribution
          </span>
          {loading && <Spinner size={1} />}
          {!loading && hasData && (
            <span style={{ fontSize: 12, color: subTextColour, marginLeft: 'auto' }}>
              {totalEnquiries} enquiries analysed
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: subTextColour, margin: 0, lineHeight: 1.5 }}>
          How quickly does the team respond to new enquiries? Each bar shows the
          distribution of response-time buckets across first response, fee earner
          contact, and formal pitch milestones.
        </p>
      </div>

      {/* Chart */}
      {loading && !hasData ? (
        <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <Spinner size={2} label="Loading response metrics..." />
        </div>
      ) : !hasData && loaded ? (
        <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <span style={{ color: subTextColour, fontSize: 14 }}>
            No response-time data available for the current enquiry set.
          </span>
        </div>
      ) : hasData ? (
        <div style={panelStyle}>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 30, left: 20, bottom: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDarkMode ? 'rgba(75,85,99,0.25)' : 'rgba(107,107,107,0.12)'}
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: axisColour, fontSize: 12, fontFamily: 'Raleway, sans-serif' }}
                axisLine={{ stroke: axisColour }}
              />
              <YAxis
                dataKey="metric"
                type="category"
                width={140}
                tick={{ fill: axisColour, fontSize: 12, fontFamily: 'Raleway, sans-serif' }}
                axisLine={{ stroke: axisColour }}
              />
              <Tooltip
                contentStyle={{
                  background: reportingPanelBackground(isDarkMode, 'elevated'),
                  border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
                  borderRadius: 0,
                  color: headingColour,
                  fontFamily: 'Raleway, sans-serif',
                  fontSize: 12,
                }}
                cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'Raleway, sans-serif', fontSize: 12, paddingTop: 8 }}
              />
              {BUCKET_ORDER.map((bucket) => (
                <Bar
                  key={bucket}
                  dataKey={bucket}
                  stackId="a"
                  fill={BUCKET_COLOURS[bucket]}
                  name={bucket}
                />
              ))}
              <Bar
                dataKey="noData"
                stackId="a"
                fill={BUCKET_COLOURS.noData}
                name="No data"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Summary cards */}
      {hasData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {chartData.map((row) => {
            const total = row['<1h'] + row['1-4h'] + row['4-24h'] + row['24h+'];
            const fastPct = total > 0 ? Math.round((row['<1h'] / total) * 100) : 0;
            return (
              <div key={row.metric} style={panelStyle}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: isDarkMode ? colours.accent : colours.highlight, marginBottom: 6 }}>
                  {row.metric}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: headingColour, fontFamily: 'Raleway, sans-serif' }}>
                  {fastPct}%
                </div>
                <div style={{ fontSize: 12, color: subTextColour }}>
                  responded within 1 hour ({row['<1h']} of {total})
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(ResponseTimeReport);
