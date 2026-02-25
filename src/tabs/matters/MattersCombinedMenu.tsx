import React from 'react';
// invisible change
import {
  Stack,
  Text,
  mergeStyles,
  Icon,
  SearchBox,
  Dropdown,
  IDropdownOption,
  IStyle,
} from '@fluentui/react';
import QuickActionsCard from '../home/QuickActionsCard';
import { useTheme } from '../../app/functionality/ThemeContext';
import { TeamData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';

// Mapping of grouped areas to their specific practice areas.
const practiceAreaMappings: { [group: string]: string[] } = {
  Commercial: [
    "Director Rights & Dispute Advice",
    "Shareholder Rights & Dispute Advice",
    "Civil/Commercial Fraud Advice",
    "Partnership Advice",
    "Business Contract Dispute",
    "Unpaid Loan Recovery",
    "Contentious Probate",
    "Statutory Demand – Drafting",
    "Statutory Demand – Advising",
    "Winding Up Petition Advice",
    "Bankruptcy Petition Advice",
    "Injunction Advice",
    "Intellectual Property",
    "Professional Negligence",
    "Unpaid Invoice/Debt Dispute",
    "Commercial Contract – Drafting",
    "Company Restoration",
    "Small Claim Advice",
    "Trust Advice",
    "Terms and Conditions – Drafting",
  ],
  Construction: [
    "Final Account Recovery",
    "Retention Recovery Advice",
    "Adjudication Advice & Dispute",
    "Construction Contract Advice",
    "Interim Payment Recovery",
    "Contract Dispute",
  ],
  Property: [
    "Landlord & Tenant - Commercial Dispute",
    "Landlord & Tenant - Residential Dispute",
    "Boundary and Nuisance Advice",
    "Trust of Land (TOLATA) Advice",
    "Service Charge Recovery & Dispute Advice",
    "Breach of Lease Advice",
    "Terminal Dilapidations Advice",
    "Investment Sale and Ownership - Advice",
    "Trespass",
    "Right of Way",
  ],
  Employment: [
    "Employment Contract - Drafting",
    "Employment Retainer Instruction",
    "Settlement Agreement - Drafting",
    "Settlement Agreement - Advising",
    "Handbook - Drafting",
    "Policy - Drafting",
    "Redundancy - Advising",
    "Sick Leave - Advising",
    "Disciplinary - Advising",
    "Restrictive Covenant Advice",
    "Post Termination Dispute",
    "Employment Tribunal Claim - Advising",
  ],
};

// Local helper to get the colour for an area-of-work.
const getGroupColor = (group: string): string => {
  switch (group) {
    case 'Commercial':
      return colours.blue;
    case 'Construction':
      return colours.orange;
    case 'Property':
      return colours.green;
    case 'Employment':
      return colours.yellow;
    case 'Miscellaneous':
    default:
      return colours.cta;
  }
};

interface MattersCombinedMenuProps {
  activeGroupedArea: string | null;
  setActiveGroupedArea: React.Dispatch<React.SetStateAction<string | null>>;
  practiceAreas: string[];
  activePracticeAreas: string[]; // Now an array for multiple selections
  setActivePracticeAreas: React.Dispatch<React.SetStateAction<string[]>>;
  activeState: string;
  setActiveState: (status: string) => void;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  isSearchActive: boolean;
  setSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
  activeFeeEarner: string | null;
  setActiveFeeEarner: React.Dispatch<React.SetStateAction<string | null>>;
  feeEarnerType: "Originating" | "Responsible" | null;
  setFeeEarnerType: React.Dispatch<React.SetStateAction<"Originating" | "Responsible" | null>>;
  teamData?: TeamData[] | null;
}

const ACTION_BAR_HEIGHT = 48;

const barBase = (isDarkMode: boolean) => ({
  backgroundColor: isDarkMode
    ? colours.darkBlue
    : colours.light.sectionBackground,
  boxShadow: isDarkMode
    ? '0 2px 4px rgba(0,0,0,0.4)'
    : '0 2px 4px rgba(0,0,0,0.1)',
  padding: '0 24px',
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  overflowX: 'auto',
  msOverflowStyle: 'none',
  scrollbarWidth: 'none',
  alignItems: 'center',
  height: ACTION_BAR_HEIGHT,
  selectors: { '::-webkit-scrollbar': { display: 'none' } },
});

const mainMenuStyle = (isDarkMode: boolean) =>
  mergeStyles({
    ...barBase(isDarkMode),
    position: 'sticky',
    top: ACTION_BAR_HEIGHT,
    zIndex: 999,
    justifyContent: 'space-between',
  });

const stateBarStyle = (isDarkMode: boolean) =>
  mergeStyles({
    ...barBase(isDarkMode),
    borderTop: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
    position: 'sticky',
    top: ACTION_BAR_HEIGHT * 2,
    zIndex: 998,
  });

const practiceAreaBarStyle = (isDarkMode: boolean) =>
  mergeStyles({
    ...barBase(isDarkMode),
    borderTop: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
    position: 'sticky',
    top: ACTION_BAR_HEIGHT * 3,
    zIndex: 997,
  });  

const rowStyle = mergeStyles({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  alignItems: 'center',
});

const leftColumnStyle = mergeStyles({ flex: 1 });
const rightColumnStyle = mergeStyles({
  flex: 1,
  justifyContent: 'flex-end',
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
});

const stateButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.3s, color 0.3s, transform 0.1s',
    border: `1px solid ${isDarkMode ? '#444' : '#ccc'}`,
    color: isDarkMode ? '#333' : '#333',
    fontFamily: 'Raleway, sans-serif',
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? '#555' : '#f3f2f1',
      },
      ':active': {
        transform: 'scale(0.97)',
      },
      ':focus': {
        outline: `2px solid ${colours.highlight}`,
        outlineOffset: '2px',
      },
    },
  });

const activeStateButtonStyle = mergeStyles({
  backgroundColor: colours.highlight,
  color: '#ffffff !important',
  border: 'none',
});

const dropdownStyles = mergeStyles({ width: 150 });
const searchContainerStyle = mergeStyles({ display: 'flex', alignItems: 'center', gap: '8px' });
const searchIconStyle = mergeStyles({ cursor: 'pointer' });
const searchBoxStyles = (isSearchActive: boolean) =>
  mergeStyles({
    width: isSearchActive ? '180px' : '0px',
    opacity: isSearchActive ? 1 : 0,
    transition: 'width 0.3s, opacity 0.3s',
    overflow: 'hidden',
  });

const practiceAreaContainerStyle = (isDarkMode: boolean): string =>
  mergeStyles({
    marginTop: '12px',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    padding: '8px 0',
    borderTop: `1px solid ${isDarkMode ? '#555' : '#ccc'}`,
  });

const practiceAreaButtonStyle = (isSelected: boolean, isDarkMode: boolean, groupColor: string): string =>
  mergeStyles({
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '2px solid transparent',
    fontFamily: 'Raleway, sans-serif',
    whiteSpace: 'nowrap',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
    transition: 'background-color 0.2s, transform 0.1s',
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
        transform: 'scale(1.05)',
      },
      ':active': {
        transform: 'scale(0.97)',
      },
      ':focus': {
        outline: `2px solid ${colours.highlight}`,
        outlineOffset: '2px',
      },
    },
    ...(isSelected && {
      borderColor: groupColor,
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    }),
  });

const practiceAreaTextStyle = (isSelected: boolean, isDarkMode: boolean): IStyle => ({
  fontWeight: isSelected ? '600' : '400',
  color: isDarkMode ? '#333333' : '#333333',
  fontFamily: 'Raleway, sans-serif',
});

// ---------------------------------------------------------------------------
// Custom Fee Earner Toggle Bubble Component
interface FeeEarnerToggleProps {
  feeEarnerType: "Originating" | "Responsible" | null;
  setFeeEarnerType: React.Dispatch<React.SetStateAction<"Originating" | "Responsible" | null>>;
  isDarkMode: boolean;
}
const FeeEarnerToggle: React.FC<FeeEarnerToggleProps> = ({ feeEarnerType, setFeeEarnerType, isDarkMode }) => {
  const container = mergeStyles({
    display: 'flex',
    border: `2px solid ${colours.highlight}`,
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
  });
  const halfStyle = (selected: boolean) =>
    mergeStyles({
      padding: '8px 16px',
      backgroundColor: selected ? colours.highlight : isDarkMode ? '#f3f2f1' : '#fff',
      color: selected ? '#fff' : isDarkMode ? '#cccccc' : '#333333',
      fontWeight: selected ? 600 : 400,
      fontFamily: 'Raleway, sans-serif',
      transition: 'background-color 0.3s, color 0.3s',
    });
  return (
    <div className={container}>
      <div
        className={halfStyle(feeEarnerType === "Originating")}
        onClick={() => setFeeEarnerType(feeEarnerType === "Originating" ? null : "Originating")}
        aria-label="Originating"
      >
        Originating
      </div>
      <div
        className={halfStyle(feeEarnerType === "Responsible")}
        onClick={() => setFeeEarnerType(feeEarnerType === "Responsible" ? null : "Responsible")}
        aria-label="Responsible"
      >
        Responsible
      </div>
    </div>
  );
};
// ---------------------------------------------------------------------------

const MattersCombinedMenu: React.FC<MattersCombinedMenuProps> = ({
  activeGroupedArea,
  setActiveGroupedArea,
  practiceAreas,
  activePracticeAreas,
  setActivePracticeAreas,
  activeState,
  setActiveState,
  searchTerm,
  setSearchTerm,
  isSearchActive,
  setSearchActive,
  activeFeeEarner,
  setActiveFeeEarner,
  feeEarnerType,
  setFeeEarnerType,
  teamData,
}) => {
  const { isDarkMode } = useTheme();

  // Reorder grouped area tabs: Commercial, Property, Construction, Employment, Misc.
  const groupedAreaTabs = [
    { key: 'commercial', text: 'Commercial', icon: 'KnowledgeArticle' },
    { key: 'property', text: 'Property', icon: 'CityNext' },
    { key: 'construction', text: 'Construction', icon: 'ConstructionCone' },
    { key: 'employment', text: 'Employment', icon: 'People' },
    { key: 'miscellaneous', text: 'Miscellaneous', icon: 'Help' },
  ];

  const states = [
    { key: 'All', text: 'All' },
    { key: 'Mine', text: 'Mine' },
  ];

  const feeEarnerOptions: IDropdownOption[] = [
    { key: '', text: 'All Fee Earners' },
    ...(teamData
      ? teamData.map((member) => ({
          key: member['Full Name'] || '',
          text: member['Full Name'] || '',
        }))
      : []),
  ];

  const groupKey = activeGroupedArea
    ? activeGroupedArea.charAt(0).toUpperCase() + activeGroupedArea.slice(1)
    : '';
  const practiceAreasForGroup: string[] = practiceAreaMappings[groupKey] || [];
  const groupColor = groupKey ? getGroupColor(groupKey) : colours.highlight;

  const clearFilters = () => {
    setActiveGroupedArea(null);
    setActivePracticeAreas([]);
    setActiveState('');
    setSearchTerm('');
    setSearchActive(false);
    setActiveFeeEarner(null);
    setFeeEarnerType(null);
  };

  const anyFiltersActive =
    activeGroupedArea ||
    activePracticeAreas.length > 0 ||
    activeState ||
    searchTerm ||
    activeFeeEarner ||
    feeEarnerType;

  return (
    <>
      {/* Row 1: Grouped Area Tabs */}
      <div className={mainMenuStyle(isDarkMode)}>
        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
          {groupedAreaTabs.map((g, index) => {
            const isSelected = activeGroupedArea === g.key;
            return (
              <QuickActionsCard
                key={g.key}
                title={g.text}
                icon={g.icon}
                isDarkMode={isDarkMode}
                onClick={() => {
                  setActiveGroupedArea(isSelected ? null : g.key);
                  setActivePracticeAreas([]);
                }}
                iconColor={colours.cta}
                selected={isSelected}
                style={{
                  '--card-index': index,
                  '--helix-cta': getGroupColor(g.text),
                  fontSize: '16px',
                  padding: '0 12px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                } as React.CSSProperties}
              />
            );
          })}
        </Stack>
      </div>

      {/* Row 2: Filters */}
      <div className={stateBarStyle(isDarkMode)}>
        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center" className={rowStyle}>
          {states.map((s) => {
            const isSelected = activeState === s.key;
            const onClickHandler = () => {
              setActiveState(isSelected ? '' : s.key);
              if (s.key === 'Mine') {
                setFeeEarnerType(null);
                setActiveFeeEarner(null);
              }
            };
            return (
              <div
                key={s.key}
                className={mergeStyles(stateButtonStyle(isDarkMode), isSelected && activeStateButtonStyle)}
                onClick={onClickHandler}
                aria-label={s.text}
              >
                <Text variant="medium" styles={{ root: { fontWeight: isSelected ? '600' : '400', color: isSelected ? '#ffffff' : undefined } }}>
                  {s.text}
                </Text>
              </div>
            );
          })}


          {activeState !== 'Mine' && (
            <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
              <FeeEarnerToggle
                feeEarnerType={feeEarnerType}
                setFeeEarnerType={setFeeEarnerType}
                isDarkMode={isDarkMode}
              />
              {feeEarnerType && (
                <Dropdown
                  placeholder={feeEarnerType === "Originating" ? "Originating Fee Earner" : "Responsible Fee Earner"}
                  options={feeEarnerOptions}
                  selectedKey={activeFeeEarner || ''}
                  onChange={(e, option) =>
                    setActiveFeeEarner(option && option.key !== '' ? (option.key as string) : null)
                  }
                  styles={{ dropdown: dropdownStyles }}
                />
              )}
            </Stack>
            )}

          <div className={searchContainerStyle} style={{ marginLeft: 'auto' }}>
            <div className={searchIconStyle} onClick={() => setSearchActive(!isSearchActive)}>
              <Icon
                iconName={isSearchActive ? 'Cancel' : 'Search'}
                styles={{
                  root: {
                    fontSize: '20px',
                    color: isDarkMode ? '#ffffff' : '#333333',
                  },
                }}
              />
            </div>
            <div className={searchBoxStyles(isSearchActive)}>
              <SearchBox
                placeholder="Search..."
                value={searchTerm}
                onChange={(_, newValue) => setSearchTerm(newValue || '')}
                underlined
                styles={{ root: { fontFamily: 'Raleway, sans-serif' } }}
              />
            </div>
            {anyFiltersActive && (
              <div
                className={mergeStyles({ cursor: 'pointer', padding: '8px' })}
                onClick={clearFilters}
                aria-label="Clear all filters"
              >

                <Icon
                  iconName="Clear"
                  styles={{
                    root: {
                      fontSize: '20px',
                      color: isDarkMode ? '#ffffff' : '#333333',
                    },
                  }}
                />
              </div>
            )}
          </div>
        </Stack>
      </div>

      {/* Row 3: Practice Area Buttons */}
      {activeGroupedArea && practiceAreasForGroup.length > 0 && (
          <div className={practiceAreaBarStyle(isDarkMode)}>
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
            {practiceAreasForGroup.map((pa) => {
              const isSelected = activePracticeAreas.includes(pa);
              return (
                <div
                  key={pa}
                  className={mergeStyles(practiceAreaButtonStyle(isSelected, isDarkMode, groupColor))}
                  onClick={() => {
                    if (activePracticeAreas.includes(pa)) {
                      setActivePracticeAreas((prev) => prev.filter((item) => item !== pa));
                    } else {
                      setActivePracticeAreas((prev) => [...prev, pa]);
                    }
                  }}
                  aria-label={pa}
                >
                  <Text variant="mediumPlus" styles={{ root: practiceAreaTextStyle(isSelected, isDarkMode) }}>
                    {pa}
                  </Text>
                </div>
              );
            })}
          </Stack>
        </div>
      )}
    </>
  );
};

export default MattersCombinedMenu;
