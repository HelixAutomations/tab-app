import React from 'react';
import './overview.css';

export interface OverviewHeroProps {
  /** Small uppercase eyebrow above the title (e.g. "Matter", "Prospect"). */
  kicker?: React.ReactNode;
  /** Primary title (client / company name). */
  title: React.ReactNode;
  /** Subtitle row: status badge, area-of-work, IDs at a glance. */
  subtitle?: React.ReactNode;
  /** Trailing actions slot (rating, claim button, scan 365). */
  actions?: React.ReactNode;
  /** Accent stripe colour on the left edge. Defaults to Helix Highlight. */
  accentColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Hero banner used at the top of any Overview surface.
 * Pairs with <OverviewShell> as the first child of `main`.
 */
export const OverviewHero: React.FC<OverviewHeroProps> = ({
  kicker,
  title,
  subtitle,
  actions,
  accentColor,
  className,
  style,
}) => {
  const heroStyle: React.CSSProperties = accentColor
    ? ({ ['--hero-accent' as any]: accentColor, ...style })
    : (style ?? {});
  return (
    <section className={className ? `helix-overview-hero ${className}` : 'helix-overview-hero'} style={heroStyle}>
      <div className="helix-overview-hero__main">
        {kicker ? <div className="helix-overview-hero__kicker">{kicker}</div> : null}
        <h1 className="helix-overview-hero__title">{title}</h1>
        {subtitle ? <div className="helix-overview-hero__subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="helix-overview-hero__actions">{actions}</div> : null}
    </section>
  );
};

export interface OverviewHeroBadgeProps {
  children: React.ReactNode;
  tone?: string;
}

export const OverviewHeroBadge: React.FC<OverviewHeroBadgeProps> = ({ children, tone }) => {
  const style: React.CSSProperties | undefined = tone
    ? { background: `${tone}1A`, color: tone }
    : undefined;
  return <span className="helix-overview-hero__badge" style={style}>{children}</span>;
};

export const OverviewHeroSeparator: React.FC = () => (
  <span className="helix-overview-hero__subtitle-sep" aria-hidden="true">·</span>
);

export default OverviewHero;
