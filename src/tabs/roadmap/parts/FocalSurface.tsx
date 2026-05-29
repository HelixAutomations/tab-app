// src/tabs/roadmap/parts/FocalSurface.tsx — lens-driven primary surface for the Activity tab

import React from 'react';
import UnifiedStream from './UnifiedStream';
import SyncTimelineSection from './SyncTimelineSection';
import ErrorStreamSection from './ErrorStreamSection';
import DoubledApiSection from './DoubledApiSection';
import SessionTraceSection from './SessionTraceSection';
import StashedBriefsTitlesPanel from './StashedBriefsTitlesPanel';
import RouteChecksPanel from './RouteChecksPanel';
import DevConsolePanel from './DevConsolePanel';
import OperatorActionsPanel from './OperatorActionsPanel';
import SignalsInboxPanel from './SignalsInboxPanel';
import MechanismsPanel from './MechanismsPanel';
import AuditLens from './AuditLens';
import SystemTriagePanel from './SystemTriagePanel';
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
  forgeViewMode: 'dev' | 'roadmap';
  forgeCanToggle: boolean;
  onForgeViewModeChange?: (next: 'dev' | 'roadmap') => void;
  canSeeSignals: boolean;
  onSignalsCountChange?: (count: number) => void;
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
  forgeViewMode,
  forgeCanToggle,
  onForgeViewModeChange,
  canSeeSignals,
  onSignalsCountChange,
  selectedSessionId,
  selectedErrorTs,
}) => {
  if (lens === 'triage') {
    return <SystemTriagePanel viewerInitials={initials} isDarkMode={isDarkMode} />;
  }

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
    // Failures lens — both classes side by side. ErrorStreamSection on top
    // (5xx + handler exceptions); DoubledApiSection below (proxy regressions).
    // Doubled-api panel only renders if the buffer is non-empty so the lens
    // stays calm when nothing's wrong.
    const doubledApi = opsPulse.doubledApi || [];
    return (
      <>
        <ErrorStreamSection errors={opsPulse.errors} isDarkMode={isDarkMode} highlightedTs={selectedErrorTs ?? null} />
        {doubledApi.length > 0 && <DoubledApiSection hits={doubledApi} isDarkMode={isDarkMode} />}
      </>
    );
  }

  if (lens === 'checks') {
    return <RouteChecksPanel />;
  }

  if (lens === 'actions') {
    // Operator Actions surface (B1, Phase A) — dev-owner only at the chip
    // level upstream. Panel is self-contained: catalog, run, recent runs.
    return <OperatorActionsPanel />;
  }

  if (lens === 'mechanisms') {
    // Static register of agent-side mechanisms so they aren't silently
    // forgotten (stash, sync, health, changelog, telemetry, frameworks,
    // prompt coach). Dev-owner gated upstream at the chip level.
    return <MechanismsPanel />;
  }

  if (lens === 'trace') {
    return <SessionTraceSection traces={opsPulse.sessionTraces} isDarkMode={isDarkMode} initialSessionId={selectedSessionId ?? null} />;
  }

  if (lens === 'signals') {
    return <SignalsInboxPanel initials={initials} isAllowed={canSeeSignals} onCountChange={onSignalsCountChange} />;
  }

  if (lens === 'briefs') {
    // Defensive: if we're somehow on the briefs lens without dev-owner,
    // the titles panel renders a locked-out message. The lens chip itself
    // is also dev-owner-gated upstream.
    return <StashedBriefsTitlesPanel isDarkMode={isDarkMode} initials={initials} isDevOwner={isDevOwner} />;
  }

  if (lens === 'forge') {
    return (
      <DevConsolePanel
        initials={initials}
        isDevOwner={isDevOwner}
        viewMode={forgeViewMode}
        canToggle={forgeCanToggle}
        onToggleViewMode={onForgeViewModeChange}
      />
    );
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

  if (lens === 'audit') {
    // Operator god-mode P3 — pressure-release valve. LZ/AC only at the chip
    // level upstream. Self-contained: search initials, see everything.
    return <AuditLens initials={initials} isDarkMode={isDarkMode} />;
  }

  // 'all' default
  return <UnifiedStream isDarkMode={isDarkMode} activityItems={activityItems} title="Live stream" />;
};

export default FocalSurface;
