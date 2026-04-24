/**
 * TabMountMeter — Phase 0 / Round 1 of the UX Realtime Navigation Programme.
 *
 * Measures the time from this component being rendered to its first effect
 * resolving (i.e. children mounted + first paint scheduled). Reports as
 * `nav.tabMount.{name}` via interactionTracker.
 *
 * Use it to wrap each top-level tab's content so we can see how long the
 * "tab is now usable" moment really takes — distinct from the cheap
 * `nav.tabSwitch` measurement (which is just the React state flip).
 *
 * No DOM output of its own. Zero impact when the tracker has no subscribers
 * and telemetry is disabled.
 *
 * Notes:
 *   - Keep-alive tabs (Home, Enquiries, Matters) only mount once per session,
 *     so the metric reflects first-visit chunk-load + initial render only.
 *   - Mount/unmount tabs (Instructions, Forms, Reporting, Roadmap) emit on
 *     every visit — so p95/max here is the actual user-visible "open the tab"
 *     latency.
 */

import { useEffect, useRef } from 'react';
import { startInteraction, type InteractionHandle } from '../utils/interactionTracker';

interface TabMountMeterProps {
  /** Short tab key, e.g. "home", "enquiries", "matters". */
  name: string;
  children: React.ReactNode;
}

const TabMountMeter: React.FC<TabMountMeterProps> = ({ name, children }) => {
  // Start the interaction the first time this component renders. Stored in a
  // ref so re-renders don't restart the timer.
  const handleRef = useRef<InteractionHandle | null>(null);
  if (handleRef.current === null) {
    handleRef.current = startInteraction(`nav.tabMount.${name}`, { tab: name });
  }

  useEffect(() => {
    // First effect = children mounted. End on the next paint to capture layout.
    const handle = handleRef.current;
    if (!handle) return;
    if (typeof requestAnimationFrame === 'function') {
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => handle.end());
        // Stash the second rAF id on the handle for cleanup safety.
        (handle as unknown as { __raf2?: number }).__raf2 = raf2;
      });
      return () => {
        cancelAnimationFrame(raf1);
        const raf2 = (handle as unknown as { __raf2?: number }).__raf2;
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    handle.end();
    return undefined;
  }, []);

  return <>{children}</>;
};

export default TabMountMeter;
