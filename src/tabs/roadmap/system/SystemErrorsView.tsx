import React from 'react';
import { colours } from '../../../app/styles/colours';
import SystemTriagePanel from '../parts/SystemTriagePanel';

interface SystemErrorsViewProps {
  viewerInitials: string | null;
  isDarkMode: boolean;
  onBack: () => void;
  onOpenDashboard: () => void;
}

const HeaderButton: React.FC<{
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

const SystemErrorsView: React.FC<SystemErrorsViewProps> = ({
  viewerInitials,
  isDarkMode,
  onBack,
  onOpenDashboard,
}) => {
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;

  return (
    <section data-helix-region="system/errors">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>
            System
          </div>
          <h1 style={{ margin: '3px 0 0', fontSize: 24, lineHeight: 1.2, color: textColour, fontFamily: 'Raleway, sans-serif' }}>
            Errors
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <HeaderButton label="Back" isDarkMode={isDarkMode} onClick={onBack} />
          <HeaderButton label="Dashboard" isDarkMode={isDarkMode} accent={colours.highlight} onClick={onOpenDashboard} />
        </div>
      </div>
      <SystemTriagePanel viewerInitials={viewerInitials} isDarkMode={isDarkMode} enableStatFilters />
    </section>
  );
};

export default SystemErrorsView;