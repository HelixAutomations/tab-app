import React, { useEffect, useRef, useState } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { WorkbenchJourneyRail, WorkbenchJourneyStage } from '../workbench/WorkbenchJourneyRail';
import './overview.css';

export interface LifecycleRailProps {
  stages: WorkbenchJourneyStage[];
  isDarkMode: boolean;
  /** Section title shown in the header bar (e.g. "Pipeline", "Lifecycle"). */
  title?: React.ReactNode;
  /** Body slot rendered below the rail when expanded. */
  body?: React.ReactNode;
  /** Whether the body is collapsible. Default true if body is provided. */
  collapsible?: boolean;
  /** Initial collapsed state. Default false. */
  defaultCollapsed?: boolean;
  className?: string;
}

/**
 * Wraps WorkbenchJourneyRail with a consistent title bar, scroll fade,
 * and collapse affordance lifted out of the rail itself.
 */
export const LifecycleRail: React.FC<LifecycleRailProps> = ({
  stages,
  isDarkMode,
  title,
  body,
  collapsible,
  defaultCollapsed,
  className,
}) => {
  const isCollapsible = collapsible ?? Boolean(body);
  const [collapsed, setCollapsed] = useState(Boolean(defaultCollapsed));
  const [overflow, setOverflow] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth - el.clientWidth > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stages.length]);

  return (
    <section
      className={className ? `helix-lifecycle-rail ${className}` : 'helix-lifecycle-rail'}
      data-overflow={overflow ? 'true' : undefined}
    >
      {(title || isCollapsible) ? (
        <header className="helix-lifecycle-rail__header">
          <span className="helix-lifecycle-rail__title">{title ?? 'Lifecycle'}</span>
          {isCollapsible ? (
            <button
              type="button"
              className="helix-lifecycle-rail__collapse"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand details' : 'Collapse details'}
            >
              {collapsed ? <FaChevronDown size={11} /> : <FaChevronUp size={11} />}
            </button>
          ) : null}
        </header>
      ) : null}
      <div className="helix-lifecycle-rail__scroll" ref={scrollRef}>
        <WorkbenchJourneyRail stages={stages} isDarkMode={isDarkMode} />
      </div>
      {body && !collapsed ? (
        <div className="helix-lifecycle-rail__body">{body}</div>
      ) : null}
    </section>
  );
};

export default LifecycleRail;
