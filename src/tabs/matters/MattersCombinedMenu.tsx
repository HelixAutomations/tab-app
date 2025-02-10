// src/tabs/matters/MattersCombinedMenu.tsx

import React from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  Icon,
  SearchBox,
  Dropdown,
  IDropdownOption
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';

interface MattersCombinedMenuProps {
  /** The five “grouped area” tabs: commercial, construction, etc. */
  activeGroupedArea: string | null;
  setActiveGroupedArea: React.Dispatch<React.SetStateAction<string | null>>;

  /** Actual practice areas in a dropdown (like "Landlord & Tenant - Commercial Dispute" etc.) */
  practiceAreas: string[]; // you pass the unique practice areas from your data
  activePracticeArea: string | null;
  setActivePracticeArea: React.Dispatch<React.SetStateAction<string | null>>;

  /** “All” vs “Mine” filter. If activeState === 'Mine', show only user’s matters. Otherwise show all. */
  activeState: string;
  setActiveState: (status: string) => void;

  /** Search bar states. */
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  isSearchActive: boolean;
  setSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
}

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
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
  });

const rowStyle = mergeStyles({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  alignItems: 'center',
});

const groupTabStyle = (
  isSelected: boolean,
  isDarkMode: boolean
): string =>
  mergeStyles({
    padding: '8px 16px',
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
      border: '2px solid #0078d4',
      backgroundColor: '#0078d420', // Light highlight
    }),
  });

const groupTabTextStyle = (isSelected: boolean, isDarkMode: boolean) => ({
  fontWeight: isSelected ? 600 : 400,
  color: isDarkMode ? '#ffffff' : '#333333',
  fontFamily: 'Raleway, sans-serif',
});

const stateButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.3s, color 0.3s',
    border: `1px solid ${isDarkMode ? '#444' : '#ccc'}`,
    color: isDarkMode ? '#fff' : '#333',
    fontFamily: 'Raleway, sans-serif',
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? '#555' : '#f3f2f1',
      },
    },
  });

const activeStateButtonStyle = mergeStyles({
  backgroundColor: '#0078d4',
  color: '#fff !important',
  border: 'none',
});

const dropdownStyles = mergeStyles({
  width: 250,
});

const searchContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

const searchIconStyle = mergeStyles({
  cursor: 'pointer',
});

const searchBoxStyles = (isSearchActive: boolean) =>
  mergeStyles({
    width: isSearchActive ? '180px' : '0px',
    opacity: isSearchActive ? 1 : 0,
    transition: 'width 0.3s, opacity 0.3s',
    overflow: 'hidden',
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
}) => {
  const { isDarkMode } = useTheme();

  /** Five big “grouped area” tabs */
  const groupedAreaTabs = [
    { key: 'commercial', text: 'Commercial', icon: 'KnowledgeArticle' },
    { key: 'construction', text: 'Construction', icon: 'ConstructionCone' },
    { key: 'property', text: 'Property', icon: 'CityNext' },
    { key: 'employment', text: 'Employment', icon: 'People' },
    { key: 'misc', text: 'Misc', icon: 'Help' },
  ];

  /** “All” vs “Mine” */
  const states = [
    { key: 'All', text: 'All' },
    { key: 'Mine', text: 'Mine' },
  ];

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Row 1: The grouped area tabs + All vs. Mine */}
      <div className={rowStyle}>
        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
          {/* Grouped Area Tabs */}
          {groupedAreaTabs.map((g) => {
            const isSelected = activeGroupedArea === g.key;
            return (
              <div
                key={g.key}
                className={groupTabStyle(isSelected, isDarkMode)}
                onClick={() => setActiveGroupedArea(isSelected ? null : g.key)}
                aria-label={g.text}
              >
                <Icon
                  iconName={g.icon}
                  styles={{
                    root: {
                      marginRight: '8px',
                      fontSize: '20px',
                      color: '#aaa',
                    },
                  }}
                />
                <Text
                  variant="mediumPlus"
                  styles={{ root: { ...groupTabTextStyle(isSelected, isDarkMode), fontWeight: isSelected ? '600' : '400' } }}
                >
                  {g.text}
                </Text>
              </div>
            );
          })}
        </Stack>

        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
          {states.map((s) => {
            const isSelected = activeState === s.key;
            return (
              <div
                key={s.key}
                className={mergeStyles(
                  stateButtonStyle(isDarkMode),
                  isSelected && activeStateButtonStyle
                )}
                onClick={() => setActiveState(isSelected ? '' : s.key)}
                aria-label={s.text}
              >
                <Text
                  variant="medium"
                  styles={{ root: { fontWeight: isSelected ? 600 : 400 } }}
                >
                  {s.text}
                </Text>
              </div>
            );
          })}
        </Stack>
      </div>

      {/* Row 2: The “actual practice area” dropdown + search */}
      <div className={rowStyle} style={{ justifyContent: 'space-between' }}>
        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
          {/* If you want a practice area dropdown: */}
          <Dropdown
            placeholder="Practice Area"
            options={[
              { key: 'All', text: 'All' },
              ...practiceAreas.map((pa) => ({
                key: pa,
                text: pa,
              })),
            ]}
            selectedKey={activePracticeArea || 'All'}
            onChange={(e, option?: IDropdownOption) => {
              setActivePracticeArea(
                option && option.key !== 'All' ? (option.key as string) : null
              );
            }}
            styles={{ root: dropdownStyles }}
          />
        </Stack>

        {/* Right side: Search */}
        <div className={searchContainerStyle}>
          <div
            className={searchIconStyle}
            onClick={() => setSearchActive(!isSearchActive)}
          >
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
      </div>
    </div>
  );
};

export default MattersCombinedMenu;
