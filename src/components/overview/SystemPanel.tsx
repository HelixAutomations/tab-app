import React from 'react';
import './overview.css';

export interface SystemPanelProps {
  /** Branded logo / icon for the system (Clio, ND, ActiveCampaign, etc.). */
  logo?: React.ReactNode;
  /** Title shown in the header bar. */
  title: React.ReactNode;
  /** Optional metadata on the right (last-sync time, count, status pill). */
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Generic backend-system panel. Used for Clio, NetDocuments, ActiveCampaign,
 * PitchContent, Companies House, etc. — anywhere we need to surface
 * a third-party system's data on an Overview surface.
 */
export const SystemPanel: React.FC<SystemPanelProps> = ({ logo, title, meta, children, className, style }) => {
  return (
    <section
      className={className ? `helix-system-panel ${className}` : 'helix-system-panel'}
      style={style}
    >
      <header className="helix-system-panel__header">
        {logo ? <span className="helix-system-panel__logo" aria-hidden="true">{logo}</span> : null}
        <span className="helix-system-panel__title">{title}</span>
        {meta ? <span className="helix-system-panel__meta">{meta}</span> : null}
      </header>
      <div className="helix-system-panel__body">{children}</div>
    </section>
  );
};

export default SystemPanel;
