import React from 'react';
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
    "Miscellaneous (None of the above)",
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
  activePracticeArea: string | null;
  setActivePracticeArea: React.Dispatch<React.SetStateAction<string | null>>;
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

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? '0px 2px 8px rgba(0,0,0,0.6)'
      : '0px 2px 8px rgba(0,0,0,0.1)',
    backgroundColor: isDarkMode ? '#333' : '#fff',
    marginBottom: '20px',
    zIndex: 2,
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

// Grouped area tab style uses the group's own colour when selected.
// Modified version to match enquiries styling: changed padding and added marginRight.
const groupTabStyle = (isSelected: boolean, isDarkMode: boolean, groupKey: string): string =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',         // Changed horizontal padding from 16px to 12px
    marginRight: '12px',         // Added right margin to space out the tabs
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.3s, border 0.3s',
    border: '2px solid transparent',
    fontFamily: 'Raleway, sans-serif',
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? '#555' : '#f3f2f1',
      },
    },
    ...(isSelected && {
      border: `2px solid ${getGroupColor(groupKey)}`,
      backgroundColor: `${getGroupColor(groupKey)}20`,
    }),
  });

// The text style remains neutral.
const groupTabTextStyle = (isSelected: boolean, isDarkMode: boolean): IStyle => ({
  fontWeight: isSelected ? '600' : '400',
  color: isDarkMode ? '#cccccc' : '#333333',
  fontFamily: 'Raleway, sans-serif',
});

const stateButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.3s, color 0.3s',
    border: `1px solid ${isDarkMode ? '#444' : '#ccc'}`,
    color: isDarkMode ? '#333' : '#333',
    fontFamily: 'Raleway, sans-serif',
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? '#555' : '#f3f2f1',
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

// Practice area container as a normal block with horizontal scroll.
const practiceAreaContainerStyle = (isDarkMode: boolean): string =>
  mergeStyles({
    marginTop: '12px',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    padding: '8px 0',
    borderTop: `1px solid ${isDarkMode ? '#555' : '#ccc'}`,
  });

// Practice area buttons: when selected, adopt the area-of-work colour.
const practiceAreaButtonStyle = (isSelected: boolean, isDarkMode: boolean, groupColor: string): string =>
  mergeStyles({
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    fontFamily: 'Raleway, sans-serif',
    whiteSpace: 'nowrap',
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? '#555' : '#f3f2f1',
      },
    },
    ...(isSelected && {
      border: `1px solid ${groupColor}`,
      backgroundColor: `${groupColor}20`,
    }),
  });

const practiceAreaTextStyle = (isSelected: boolean, isDarkMode: boolean): IStyle => ({
  fontWeight: isSelected ? '600' : '400',
  color: isSelected ? '#333333' : (isDarkMode ? '#333333' : '#333333'),
  fontFamily: 'Raleway, sans-serif',
});

const MattersCombinedMenu: React.FC<MattersCombinedMenuProps> = ({
  activeGroupedArea,
  setActiveGroupedArea,
  practiceAreas,
  activePracticeArea,
  setActivePracticeArea,
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
    { key: 'misc', text: 'Misc', icon: 'Help' },
  ];

  const states = [
    { key: 'All', text: 'All' },
    { key: 'Mine', text: 'Mine' },
  ];

  const feeEarnerOptions: IDropdownOption[] = [
    { key: '', text: 'All Fee Earners' },
    ...(teamData
      ? teamData.map((member) => ({
          key: member.Email || member['Full Name'] || '',
          text: member['Full Name'] || '',
        }))
      : []),
  ];

  // Determine the practice areas for the selected grouped area.
  const groupKey = activeGroupedArea
    ? activeGroupedArea.charAt(0).toUpperCase() + activeGroupedArea.slice(1)
    : '';
  const practiceAreasForGroup: string[] = practiceAreaMappings[groupKey] || [];
  const groupColor = groupKey ? getGroupColor(groupKey) : colours.highlight;

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Row 1: Main menu with two columns */}
      <div className={rowStyle} style={{ justifyContent: 'space-between' }}>
        {/* Left column: Grouped Area Tabs */}
        <div className={leftColumnStyle}>
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
            {groupedAreaTabs.map((g) => {
              const isSelected = activeGroupedArea === g.key;
              return (
                <div
                  key={g.key}
                  className={groupTabStyle(isSelected, isDarkMode, g.text)}
                  onClick={() => {
                    setActiveGroupedArea(isSelected ? null : g.key);
                    setActivePracticeArea(null);
                  }}
                  aria-label={g.text}
                >
                  <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 0 }}>
                    <Icon
                      iconName={g.icon}
                      styles={{
                        root: {
                          fontSize: '20px',
                          color: isSelected ? getGroupColor(g.text) : '#aaa',
                          marginRight: '8px',
                        },
                      }}
                    />
                    <Text variant="mediumPlus" styles={{ root: groupTabTextStyle(isSelected, isDarkMode) }}>
                      {g.text}
                    </Text>
                  </Stack>
                </div>
              );
            })}
          </Stack>
        </div>

        {/* Right column: All/Mine and Fee Earner toggles + dropdown & Search */}
        <div className={rightColumnStyle}>
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
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

            {/* Fee Earner Type Toggle: show only if "Mine" is not selected */}
            {activeState !== 'Mine' && (
              <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                <div
                  className={mergeStyles(
                    stateButtonStyle(isDarkMode),
                    feeEarnerType === "Originating" && activeStateButtonStyle
                  )}
                  onClick={() => setFeeEarnerType(feeEarnerType === "Originating" ? null : "Originating")}
                  aria-label="Originating"
                >
                  <Text variant="medium" styles={{ root: { fontWeight: feeEarnerType === "Originating" ? '600' : '400', color: feeEarnerType === "Originating" ? '#ffffff' : undefined } }}>
                    Originating
                  </Text>
                </div>
                <div
                  className={mergeStyles(
                    stateButtonStyle(isDarkMode),
                    feeEarnerType === "Responsible" && activeStateButtonStyle
                  )}
                  onClick={() => setFeeEarnerType(feeEarnerType === "Responsible" ? null : "Responsible")}
                  aria-label="Responsible"
                >
                  <Text variant="medium" styles={{ root: { fontWeight: feeEarnerType === "Responsible" ? '600' : '400', color: feeEarnerType === "Responsible" ? '#ffffff' : undefined } }}>
                    Responsible
                  </Text>
                </div>
              </Stack>
            )}

            {/* Fee Earner Dropdown: only when a fee earner type is selected */}
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

            <div className={searchContainerStyle}>
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
            </div>
          </Stack>
        </div>
      </div>

      {/* Row 2: Practice Area Buttons */}
      {activeGroupedArea && practiceAreasForGroup.length > 0 && (
        <div className={practiceAreaContainerStyle(isDarkMode)}>
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
            {practiceAreasForGroup.map((pa) => {
              const isSelected = activePracticeArea === pa;
              return (
                <div
                  key={pa}
                  className={mergeStyles(practiceAreaButtonStyle(isSelected, isDarkMode, groupColor))}
                  onClick={() => setActivePracticeArea(isSelected ? null : pa)}
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
    </div>
  );
};

export default MattersCombinedMenu;
