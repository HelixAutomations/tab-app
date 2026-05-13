import React from 'react';
import './overview.css';

export interface OverviewShellProps {
  main: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Two-column overview shell. Collapses to single column at <=1120px.
 * Backplate uses --surface-page so cards always have visible edges.
 */
export const OverviewShell: React.FC<OverviewShellProps> = ({ main, aside, className, style }) => {
  const cls = aside ? 'helix-overview-shell' : 'helix-overview-shell helix-overview-shell--full';
  return (
    <div className={className ? `${cls} ${className}` : cls} style={style}>
      <div className="helix-overview-shell__main">{main}</div>
      {aside ? <aside className="helix-overview-shell__aside">{aside}</aside> : null}
    </div>
  );
};

export default OverviewShell;
