// src/tabs/roadmap/parts/FocalSurface.tsx — lens-driven primary surface for the Activity tab

import React from 'react';
import { colours } from '../../../app/styles/colours';
import UnifiedStream from './UnifiedStream';
import SyncTimelineSection from './SyncTimelineSection';
import ErrorStreamSection from './ErrorStreamSection';
import SessionTraceSection from './SessionTraceSection';
import StashedBriefsPanel from './StashedBriefsPanel';
import type { ActivityFeedItem } from './types';
import type { OpsPulseState } from './ops-pulse-types';
import type { ActivityLens } from './ActivityHero';

interface FocalSurfaceProps {
  lens: ActivityLens;
  isDarkMode: boolean;
  activityItems: ActivityFeedItem[];
  opsPulse: OpsPulseState;
  initials: string | null;
  isDevOwner: boolean;
  selectedSessionId?: string | null;
  selectedErrorTs?: number | null;
}

const FocalSurface: React.FC<FocalSurfaceProps> = ({
  lens,
  isDarkMode,
  activityItems,
  opsPulse,
  initials,
  isDevOwner,
  selectedSessionId,
  selectedErrorTs,
}) => {
  if (lens === 'forms') {
    return (
      <UnifiedStream
        isDarkMode={isDarkMode}
        activityItems={activityItems}
        filterSource="forms"
        title="Forms pipeline"
      />
    );
  }

  if (lens === 'sync') {
    return <SyncTimelineSection scheduler={opsPulse.scheduler} isDarkMode={isDarkMode} />;
  }

  if (lens === 'errors') {
    return <ErrorStreamSection errors={opsPulse.errors} isDarkMode={isDarkMode} highlightedTs={selectedErrorTs ?? null} />;
  }

  if (lens === 'trace') {
    return <SessionTraceSection traces={opsPulse.sessionTraces} isDarkMode={isDarkMode} initialSessionId={selectedSessionId ?? null} />;
  }

  if (lens === 'briefs') {
    if (!isDevOwner) {
      return (
        <div
          style={{
            padding: 20,
            border: `1px dashed ${isDarkMode ? colours.dark.border : colours.light.border}`,
            color: isDarkMode ? colours.subtleGrey : colours.greyText,
            fontSize: 13,
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          Briefs are visible to dev-owner only.
        </div>
      );
    }
    return <StashedBriefsPanel isDarkMode={isDarkMode} initials={initials} />;
  }

  if (lens === 'matters') {
    // No dedicated matters stream yet — fall back to filtered activity feed
    return (
      <UnifiedStream
        isDarkMode={isDarkMode}
        activityItems={activityItems}
        filterSource="activity"
        title="Matter & platform activity"
      />
    );
  }

  // 'all' default
  return <UnifiedStream isDarkMode={isDarkMode} activityItems={activityItems} title="Live stream" />;
};

export default FocalSurface;
