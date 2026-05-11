import React from 'react';
import { FiArchive, FiFolder, FiTrendingUp, FiUser, FiUsers } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';

type MatterScope = 'mine' | 'all';
type MatterStatus = 'Active' | 'Closed';
type MatterRole = 'Responsible' | 'Originating';

interface MatterStatusFilterWithScopeProps {
  isDarkMode: boolean;
  scope: MatterScope;
  activeFilter: MatterStatus;
  scopeCounts: { mine: number; all: number };
  isBusy?: boolean;
  onSetScope: (scope: MatterScope) => void;
  onSetActiveFilter: (status: MatterStatus) => void;
}

interface MatterRoleFilterProps {
  isDarkMode: boolean;
  activeRoleFilter: MatterRole;
  onSetActiveRoleFilter: (role: MatterRole) => void;
}

const scopeTone = (isDarkMode: boolean) => isDarkMode ? colours.accent : colours.highlight;
const archivedTone = colours.orange;

const chipBg = (isDarkMode: boolean, active: boolean, tone: string) =>
  active
    ? (tone === archivedTone
        ? (isDarkMode ? 'rgba(255,140,0,0.10)' : 'rgba(255,140,0,0.07)')
        : (isDarkMode ? 'rgba(54,144,206,0.10)' : 'rgba(54,144,206,0.07)'))
    : 'transparent';

const chipStroke = (isDarkMode: boolean, active: boolean, tone: string) =>
  active
    ? (isDarkMode && tone !== archivedTone ? 'rgba(135,243,243,0.34)' : tone)
    : (isDarkMode ? 'rgba(75,85,99,0.22)' : 'rgba(0,0,0,0.08)');

const chipColor = (isDarkMode: boolean, active: boolean, tone: string) =>
  active ? tone : (isDarkMode ? '#d1d5db' : colours.greyText);

const badgeBg = (isDarkMode: boolean, active: boolean) =>
  active
    ? (isDarkMode ? 'rgba(54,144,206,0.22)' : 'rgba(54,144,206,0.14)')
    : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.04)');

const iconProps = { size: 14, strokeWidth: 1.8 } as const;

export const MatterStatusFilterWithScope = React.memo<MatterStatusFilterWithScopeProps>(({
  isDarkMode,
  scope,
  activeFilter,
  scopeCounts,
  isBusy = false,
  onSetScope,
  onSetActiveFilter,
}) => {
  const baseTone = scopeTone(isDarkMode);
  const isOpen = activeFilter !== 'Closed';

  return (
    <div
      className="enq-filter-cluster enq-filter-constellation"
      data-busy={isBusy ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 30,
        padding: 0,
        gap: 8,
        fontFamily: 'Raleway, sans-serif',
        userSelect: 'none',
      }}
    >
      <div className="enq-status-primary">
        <button
          type="button"
          className="enq-scope-chip"
          aria-pressed={scope === 'mine'}
          onClick={() => onSetScope('mine')}
          title={`My matters (${scopeCounts.mine})`}
          style={{
            minHeight: 30,
            background: chipBg(isDarkMode, scope === 'mine', baseTone),
            color: chipColor(isDarkMode, scope === 'mine', baseTone),
            boxShadow: `inset 0 0 0 1px ${chipStroke(isDarkMode, scope === 'mine', baseTone)}`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}><FiUser {...iconProps} /></span>
          <span>Mine</span>
          <span className="enq-badge" style={{ background: badgeBg(isDarkMode, scope === 'mine') }}>{scopeCounts.mine.toLocaleString()}</span>
        </button>

        <button
          type="button"
          className="enq-scope-chip"
          aria-pressed={scope === 'all'}
          onClick={() => onSetScope('all')}
          title={`All matters (${scopeCounts.all})`}
          style={{
            minHeight: 30,
            background: chipBg(isDarkMode, scope === 'all', baseTone),
            color: chipColor(isDarkMode, scope === 'all', baseTone),
            boxShadow: `inset 0 0 0 1px ${chipStroke(isDarkMode, scope === 'all', baseTone)}`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}><FiUsers {...iconProps} /></span>
          <span>All</span>
          <span className="enq-badge" style={{ background: badgeBg(isDarkMode, scope === 'all') }}>{scopeCounts.all.toLocaleString()}</span>
        </button>

        <button
          type="button"
          className="enq-chip"
          aria-pressed={isOpen}
          onClick={() => onSetActiveFilter('Active')}
          style={{
            height: 30,
            fontWeight: isOpen ? 600 : 500,
            background: chipBg(isDarkMode, isOpen, baseTone),
            color: chipColor(isDarkMode, isOpen, baseTone),
            boxShadow: `inset 0 0 0 1px ${chipStroke(isDarkMode, isOpen, baseTone)}`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}><FiFolder {...iconProps} /></span>
          <span>Open</span>
        </button>

        <button
          type="button"
          className="enq-chip"
          aria-pressed={!isOpen}
          onClick={() => onSetActiveFilter('Closed')}
          style={{
            height: 30,
            fontWeight: !isOpen ? 600 : 500,
            background: chipBg(isDarkMode, !isOpen, archivedTone),
            color: chipColor(isDarkMode, !isOpen, archivedTone),
            boxShadow: `inset 0 0 0 1px ${chipStroke(isDarkMode, !isOpen, archivedTone)}`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}><FiArchive {...iconProps} /></span>
          <span>Archived</span>
        </button>
      </div>
    </div>
  );
});

export const MatterRoleFilter = React.memo<MatterRoleFilterProps>(({
  isDarkMode,
  activeRoleFilter,
  onSetActiveRoleFilter,
}) => {
  const tone = scopeTone(isDarkMode);

  return (
    <div className="enq-filter-secondary-cluster" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <button
        type="button"
        className="enq-chip"
        aria-pressed={activeRoleFilter === 'Responsible'}
        onClick={() => onSetActiveRoleFilter('Responsible')}
        style={{
          height: 30,
          fontWeight: activeRoleFilter === 'Responsible' ? 600 : 500,
          background: chipBg(isDarkMode, activeRoleFilter === 'Responsible', tone),
          color: chipColor(isDarkMode, activeRoleFilter === 'Responsible', tone),
          boxShadow: `inset 0 0 0 1px ${chipStroke(isDarkMode, activeRoleFilter === 'Responsible', tone)}`,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}><FiUser {...iconProps} /></span>
        <span>Responsible</span>
      </button>

      <button
        type="button"
        className="enq-chip"
        aria-pressed={activeRoleFilter === 'Originating'}
        onClick={() => onSetActiveRoleFilter('Originating')}
        style={{
          height: 30,
          fontWeight: activeRoleFilter === 'Originating' ? 600 : 500,
          background: chipBg(isDarkMode, activeRoleFilter === 'Originating', tone),
          color: chipColor(isDarkMode, activeRoleFilter === 'Originating', tone),
          boxShadow: `inset 0 0 0 1px ${chipStroke(isDarkMode, activeRoleFilter === 'Originating', tone)}`,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center' }}><FiTrendingUp {...iconProps} /></span>
        <span>Originating</span>
      </button>
    </div>
  );
});

export default MatterStatusFilterWithScope;