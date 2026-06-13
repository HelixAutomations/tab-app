import React from 'react';
import { colours } from '../../../app/styles/colours';

export type StatusTone = 'live' | 'watch' | 'gap' | 'planned' | 'partial' | 'blocked' | 'scoped' | 'to-scope';

export function toneColour(tone: StatusTone): string {
  if (tone === 'live' || tone === 'scoped') return colours.green;
  if (tone === 'watch' || tone === 'partial') return colours.highlight;
  if (tone === 'gap' || tone === 'blocked') return colours.cta;
  return colours.orange;
}

export function toneLabel(tone: StatusTone): string {
  switch (tone) {
    case 'live':
      return 'Live';
    case 'watch':
      return 'Watch';
    case 'partial':
      return 'Partial';
    case 'scoped':
      return 'Scoped';
    case 'gap':
      return 'Gap';
    case 'blocked':
      return 'Blocked';
    case 'to-scope':
      return 'To scope';
    case 'planned':
    default:
      return 'Planned';
  }
}

export interface SystemTokens {
  textColour: string;
  mutedColour: string;
  borderColour: string;
  cardBg: string;
  panelBg: string;
  cardStyle: React.CSSProperties;
}

export function useSystemTokens(isDarkMode: boolean): SystemTokens {
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const cardBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const panelBg = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)';
  return {
    textColour,
    mutedColour,
    borderColour,
    cardBg,
    panelBg,
    cardStyle: { border: `1px solid ${borderColour}`, background: cardBg, padding: 16, minWidth: 0 },
  };
}

export const HeaderButton: React.FC<{
  label: string;
  isDarkMode: boolean;
  accent?: string;
  onClick: () => void;
}> = ({ label, isDarkMode, accent, onClick }) => {
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = accent || (isDarkMode ? colours.dark.border : colours.light.border);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${borderColour}`,
        background: accent ? `${accent}1A` : 'transparent',
        color: accent || mutedColour,
        padding: '7px 10px',
        borderRadius: 0,
        cursor: 'pointer',
        fontFamily: 'Raleway, sans-serif',
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </button>
  );
};

export const StatusPill: React.FC<{ tone: StatusTone; isDarkMode: boolean }> = ({ tone, isDarkMode }) => {
  const accent = toneColour(tone);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${accent}`,
        background: `${accent}${isDarkMode ? '24' : '14'}`,
        color: accent,
        padding: '3px 7px',
        fontSize: 10,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        fontFamily: 'Raleway, sans-serif',
        whiteSpace: 'nowrap',
      }}
    >
      {toneLabel(tone)}
    </span>
  );
};

export const SystemPageHeader: React.FC<{
  eyebrow: string;
  title: string;
  isDarkMode: boolean;
  onBack: () => void;
  onOpenDashboard?: () => void;
}> = ({ eyebrow, title, isDarkMode, onBack, onOpenDashboard }) => {
  const { textColour, mutedColour } = useSystemTokens(isDarkMode);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>
          {eyebrow}
        </div>
        <h1 style={{ margin: '3px 0 0', fontSize: 24, lineHeight: 1.2, color: textColour, fontFamily: 'Raleway, sans-serif' }}>
          {title}
        </h1>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <HeaderButton label="Back" isDarkMode={isDarkMode} onClick={onBack} />
        {onOpenDashboard ? (
          <HeaderButton label="Dashboard" isDarkMode={isDarkMode} accent={colours.highlight} onClick={onOpenDashboard} />
        ) : null}
      </div>
    </div>
  );
};

export const SystemIntroPanel: React.FC<{
  eyebrow: string;
  title: string;
  description?: string;
  isDarkMode: boolean;
  accent?: string;
  actionLabel?: string;
  onAction?: () => void;
  dataRegion?: string;
}> = ({ eyebrow, title, description, isDarkMode, accent, actionLabel, onAction, dataRegion }) => {
  const activeAccent = accent || colours.accent;
  const { borderColour, mutedColour, panelBg, textColour } = useSystemTokens(isDarkMode);

  return (
    <section
      data-helix-region={dataRegion}
      style={{
        border: `1px solid ${borderColour}`,
        borderLeft: `3px solid ${activeAccent}`,
        background: panelBg,
        padding: '15px 17px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: activeAccent }}>
          {eyebrow}
        </div>
        <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900, lineHeight: 1.25, color: textColour, fontFamily: 'Raleway, sans-serif' }}>
          {title}
        </div>
        {description ? (
          <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: mutedColour, maxWidth: 760 }}>
            {description}
          </div>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <HeaderButton label={actionLabel} isDarkMode={isDarkMode} accent={activeAccent} onClick={onAction} />
      ) : null}
    </section>
  );
};

export const SystemLandingTile: React.FC<{
  label: string;
  description: string;
  isDarkMode: boolean;
  accent: string;
  onClick: () => void;
  variant?: 'primary' | 'tool' | 'info';
  eyebrow?: string;
  dataRegion?: string;
}> = ({ label, description, isDarkMode, accent, onClick, variant = 'tool', eyebrow, dataRegion }) => {
  const [hovered, setHovered] = React.useState(false);
  const { borderColour, cardBg, panelBg, mutedColour, textColour } = useSystemTokens(isDarkMode);
  const isPrimary = variant === 'primary';
  const isInfo = variant === 'info';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-helix-region={dataRegion}
      style={{
        minHeight: isPrimary ? 142 : isInfo ? 92 : 122,
        border: `1px solid ${hovered ? accent : borderColour}`,
        borderLeft: `${isPrimary ? 5 : 3}px solid ${accent}`,
        background: isPrimary ? cardBg : isInfo ? panelBg : cardBg,
        color: textColour,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: 14,
        padding: isPrimary ? '22px 24px' : isInfo ? '14px 16px' : '17px 18px',
        fontFamily: 'Raleway, sans-serif',
        textAlign: 'left',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 0.14s ease, border-color 0.14s ease, background 0.14s ease',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, gap: isPrimary ? 8 : 6 }}>
        {eyebrow ? (
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.7px', color: isPrimary ? accent : mutedColour }}>
            {eyebrow}
          </span>
        ) : null}
        <span style={{ fontSize: isPrimary ? 25 : isInfo ? 15 : 18, fontWeight: 900, lineHeight: 1.12, letterSpacing: 0, textTransform: isInfo ? 'none' : 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontSize: isPrimary ? 13 : 12, lineHeight: 1.5, color: mutedColour, maxWidth: isPrimary ? 680 : 360 }}>
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        style={{
          alignSelf: 'center',
          color: accent,
          fontSize: isPrimary ? 12 : 10,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
        }}
      >
        Open
      </span>
    </button>
  );
};

export interface SystemTab<K extends string> {
  key: K;
  label: string;
  description?: string;
  accent?: string;
}

export function SystemTabBar<K extends string>({
  tabs,
  active,
  onChange,
  isDarkMode,
}: {
  tabs: SystemTab<K>[];
  active: K;
  onChange: (key: K) => void;
  isDarkMode: boolean;
}) {
  const { borderColour, mutedColour, textColour } = useSystemTokens(isDarkMode);
  return (
    <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 0, marginBottom: 14, borderBottom: `1px solid ${borderColour}` }}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const accent = tab.accent || colours.accent;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            style={{
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              padding: '10px 18px',
              marginBottom: -1,
              borderBottom: `2px solid ${isActive ? accent : 'transparent'}`,
              color: isActive ? textColour : mutedColour,
              fontFamily: 'Raleway, sans-serif',
              fontSize: 12,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export const SystemModuleSection: React.FC<{
  label: string;
  description?: string;
  accent?: string;
  dataRegion?: string;
  isDarkMode: boolean;
  children: React.ReactNode;
}> = ({ label, description, accent, dataRegion, isDarkMode, children }) => {
  const { cardStyle, mutedColour, textColour } = useSystemTokens(isDarkMode);
  return (
    <section
      data-helix-region={dataRegion}
      style={{ ...cardStyle, borderLeft: `3px solid ${accent || colours.accent}`, marginBottom: 14 }}
    >
      <div style={{ marginBottom: description ? 4 : 12 }}>
        <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: accent || textColour }}>
          {label}
        </div>
        {description ? (
          <div style={{ fontSize: 12, color: mutedColour, marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
};
