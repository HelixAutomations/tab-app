import React from 'react';
import '../../Reporting/ReportingScroll.css';
import { colours } from '../../../app/styles/colours';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { ReportProcessingRailItemCard, type ReportProcessingRailItem, type ReportProcessingRailStatus } from '../../Reporting/components/ReportProcessingRail';

type MarketingHydrationFeed = {
  key: string;
  label: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  detail?: string;
};

type MarketingHydrationChromeProps = {
  isDarkMode: boolean;
  visible: boolean;
  blocked: boolean;
  dismissible?: boolean;
  rangeLabel: string;
  phaseLabel: string;
  progressLabel: string;
  completed: number;
  total: number;
  feeds: MarketingHydrationFeed[];
  hasErrors: boolean;
  isComplete?: boolean;
  onReturnToMarketing?: () => void;
  onDismiss?: () => void;
  onRetry: () => void;
};

function toProcessingStatus(status: MarketingHydrationFeed['status']): ReportProcessingRailStatus {
  if (status === 'ready') return 'ready';
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return 'idle';
}

const MarketingHydrationChrome: React.FC<MarketingHydrationChromeProps> = ({
  isDarkMode,
  visible,
  blocked,
  dismissible = false,
  rangeLabel,
  phaseLabel,
  progressLabel,
  completed,
  total,
  feeds,
  hasErrors,
  isComplete = false,
  onReturnToMarketing,
  onDismiss,
  onRetry,
}) => {
  const [folded, setFolded] = React.useState(false);

  React.useEffect(() => {
    if (isComplete && !hasErrors) setFolded(true);
    if (!isComplete && visible) setFolded(false);
  }, [hasErrors, isComplete, visible]);

  if (!visible) return null;

  const totalSafe = Math.max(total, feeds.length, 1);
  const hasFeedAttention = feeds.some((feed) => feed.status === 'error');
  const overallStatus: ReportProcessingRailStatus = hasErrors
    ? 'error'
    : isComplete || completed >= totalSafe
      ? 'ready'
      : 'loading';
  const processingItem: ReportProcessingRailItem = {
    key: 'marketing-feed-breakdown',
    title: isComplete ? 'Marketing data finalised' : 'Feed breakdown',
    subtitle: isComplete
      ? (hasFeedAttention ? 'Financial-year-to-date feeds landed with attention.' : 'Financial-year-to-date feeds have settled.')
      : phaseLabel,
    status: overallStatus,
    rows: feeds.map((feed) => ({
      key: feed.key,
      label: feed.label,
      status: toProcessingStatus(feed.status),
      detail: feed.detail ?? (feed.status === 'ready'
        ? 'Loaded'
        : feed.status === 'loading'
          ? 'Refreshing'
          : feed.status === 'error'
            ? 'Retry needed'
            : 'Waiting'),
    })),
    ctaLabel: hasErrors ? 'Retry pull' : isComplete ? 'Back to marketing' : 'Pulling...',
    ctaDisabled: !hasErrors && !isComplete,
    onCta: hasErrors ? onRetry : isComplete ? onReturnToMarketing : undefined,
    detail: isComplete
      ? (hasFeedAttention ? 'The workspace is ready. Attention lanes remain visible in the timeline while you work elsewhere.' : 'The workspace is ready and the panel can stay folded while you work elsewhere.')
      : progressLabel,
    elapsedLabel: rangeLabel,
    secondaryCtaLabel: isComplete ? 'Back to marketing' : undefined,
    onSecondaryCta: isComplete ? onReturnToMarketing : undefined,
  };

  return (
    <>
      {blocked && (
        <div
          data-helix-region="marketing/data-gate"
          onClick={dismissible ? onDismiss : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            pointerEvents: 'auto',
            background: isDarkMode ? 'rgba(6, 23, 51, 0.12)' : 'rgba(255, 255, 255, 0.16)',
            backdropFilter: 'blur(1.5px)',
            WebkitBackdropFilter: 'blur(1.5px)',
            cursor: dismissible ? 'pointer' : 'default',
          }}
        />
      )}

      <aside
        className={`reports-floating-processing-panel marketing-processing-panel${folded ? ' is-folded' : ''}`}
        data-helix-region="marketing/refresh-rail"
        aria-label="Marketing feed breakdown"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          type="button"
          className="reports-floating-processing-panel__fold"
          onClick={(event) => {
            event.stopPropagation();
            setFolded((current) => !current);
          }}
          aria-label={folded ? 'Open feed breakdown' : 'Fold feed breakdown'}
          aria-expanded={!folded}
        >
          <FontIcon iconName={folded ? 'ChevronUp' : 'ChevronDown'} />
        </button>
        <button
          type="button"
          className="reports-floating-processing-panel__close"
          onClick={onDismiss}
          aria-label={dismissible ? 'Dismiss marketing processing panel' : 'Hide marketing processing panel'}
        >
          <FontIcon iconName="Cancel" />
        </button>
        <ReportProcessingRailItemCard
          isDarkMode={isDarkMode}
          item={processingItem}
          embedded
          compact={folded}
          onSurfaceClick={folded ? () => setFolded(false) : undefined}
          surfaceTitle={folded ? 'Open feed breakdown' : undefined}
        />
      </aside>
    </>
  );
};

export default MarketingHydrationChrome;