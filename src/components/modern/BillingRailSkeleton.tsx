import React from 'react';
import { TbCurrencyPound } from 'react-icons/tb';
import SkeletonSectionLabel from './SkeletonSectionLabel';

type BillingRailSkeletonProps = {
  isDarkMode: boolean;
  metricCount?: number;
  /**
   * When true, wraps the skeleton in the canonical "Billing" section header +
   * panel used by the live billing rail in `OperationsDashboard`. Use this
   * from the Home shell fallback so the skeleton frame matches the live frame
   * exactly (no second hand-rolled wrapper needed).
   */
  withShell?: boolean;
};

const BillingRailSkeleton: React.FC<BillingRailSkeletonProps> = ({
  isDarkMode,
  metricCount = 4,
  withShell = false,
}) => {
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)';

  const skeleton = (width: string | number, height: number, options?: { background?: string; animationDelay?: string; marginLeft?: string }) => (
    <span
      style={{
        display: 'block',
        width,
        height,
        background: options?.background || 'var(--home-skel-fill)',
        opacity: 0.95,
        animation: 'homeSkelPulse 1.4s ease-in-out infinite',
        animationDelay: options?.animationDelay || '0s',
        marginLeft: options?.marginLeft,
      }}
    />
  );

  const visibleMetricCount = Math.max(1, metricCount);

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SkeletonSectionLabel
        title="Billing warming up"
        description="Pulling WIP, recovered fees, and outstanding balances."
        isDarkMode={isDarkMode}
      />
      {/* Mirrors the live .ops-billing-frame — padding 4, gap 4, per-tile border. */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleMetricCount}, 1fr)`, gap: 4, padding: 4 }}>
        {Array.from({ length: visibleMetricCount }).map((_, index) => (
          <div
            key={index}
            style={{
              padding: '14px 16px 12px',
              border: `1px solid ${rowBorder}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            {skeleton('42%', 9, { animationDelay: `${index * 0.08}s` })}
            {skeleton('68%', 22, { animationDelay: `${index * 0.1}s` })}
            <div style={{ height: 2, marginTop: 1 }}>
              {skeleton('100%', 2, { animationDelay: `${index * 0.12}s`, background: 'var(--home-skel-fill-weak)' })}
            </div>
            <div style={{ minHeight: 12, marginTop: 0 }}>
              {skeleton('50%', 9, { animationDelay: `${index * 0.14}s`, background: 'var(--home-skel-fill-weak)' })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: rowBorder }} />
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {skeleton(84, 10, { background: 'var(--home-skel-fill-weak)' })}
        {skeleton(72, 10, { background: 'var(--home-skel-fill-faint)' })}
        {skeleton(96, 10, { background: 'var(--home-skel-fill-weak)', marginLeft: 'auto' })}
      </div>
    </div>
  );

  if (!withShell) {
    return body;
  }

  // Match the live billing rail framing in OperationsDashboard so the Home
  // shell fallback resolves into the live rail without a structural pop.
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0 3px' }}>
        <span className="home-section-header">
          <TbCurrencyPound size={11} className="home-section-header-icon" />
          Billing
        </span>
      </div>
      <div
        style={{
          background: 'var(--home-card-bg)',
          border: '1px solid var(--home-card-border)',
          boxShadow: 'var(--home-card-shadow)',
        }}
      >
        {body}
      </div>
    </div>
  );
};

export default BillingRailSkeleton;