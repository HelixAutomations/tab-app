import React from 'react';
import { mergeStyles, SearchBox, Icon, Text, IconButton, TooltipHost } from '@fluentui/react';
import QuickActionsCard from '../home/QuickActionsCard';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface EnquiriesMenuProps {
    activeArea: string | null;
    setActiveArea: React.Dispatch<React.SetStateAction<string | null>>;
    activeState: string;
    setActiveState: (key: string) => void;
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
    isSearchActive: boolean;
    setSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
    toggleDashboard: () => void;
    toggleUnclaimed: () => void;
    unclaimedActive: boolean;
    showGroupedView: boolean;
    setShowGroupedView: React.Dispatch<React.SetStateAction<boolean>>;
}

const ACTION_BAR_HEIGHT = 48;

const barBase = (isDark: boolean) => ({
// invisible change
    backgroundColor: isDark ? colours.darkBlue : colours.light.sectionBackground,
    boxShadow: isDark ? '0 2px 4px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.1)',
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

const areaBarStyle = (isDark: boolean) =>
    mergeStyles({
        ...barBase(isDark),
        position: 'sticky',
        top: ACTION_BAR_HEIGHT,
        zIndex: 999,
    });

const stateBarStyle = (isDark: boolean) =>
    mergeStyles({
        ...barBase(isDark),
        borderTop: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
        position: 'sticky',
        top: ACTION_BAR_HEIGHT * 2,
        zIndex: 998,
    });

const stateButtonStyle = (isDark: boolean) =>
    mergeStyles({
        padding: '8px 16px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'background-color 0.3s, color 0.3s, transform 0.1s',
        border: `1px solid ${isDark ? '#444' : '#ccc'}`,
        color: isDark ? '#333' : '#333',
        fontFamily: 'Raleway, sans-serif',
        selectors: {
            ':hover': {
                backgroundColor: isDark ? '#555' : '#f3f2f1',
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

const areaColor = (area?: string): string => {
    const normalizedArea = area?.toLowerCase() || '';
    switch (normalizedArea) {
        case 'commercial':
            return colours.blue;
        case 'construction':
            return colours.orange;
        case 'property':
            return colours.green;
        case 'employment':
            return colours.yellow;
        default:
            return colours.cta;
    }
};

const EnquiriesMenu: React.FC<EnquiriesMenuProps> = ({
    activeArea,
    setActiveArea,
    activeState,
    setActiveState,
    searchTerm,
    setSearchTerm,
    isSearchActive,
    setSearchActive,
    toggleDashboard,
    toggleUnclaimed,
    unclaimedActive,
    showGroupedView,
    setShowGroupedView,
}) => {
    const { isDarkMode } = useTheme();

    const areaTabs = [
        { key: 'commercial', text: 'Commercial', icon: 'KnowledgeArticle' },
        { key: 'property', text: 'Property', icon: 'CityNext' },
        { key: 'construction', text: 'Construction', icon: 'ConstructionCone' },
        { key: 'employment', text: 'Employment', icon: 'People' },
    ];

    const stateTabs = [
        { key: 'Claimed', text: 'Claimed' },
        { key: 'Converted', text: 'Enquiry ID' },
        { key: 'Claimable', text: 'Unclaimed' },
        { key: 'Triaged', text: 'Triaged' },
    ];

    const searchBoxStyles = mergeStyles({
        width: isSearchActive ? '180px' : '0px',
        opacity: isSearchActive ? 1 : 0,
        transition: 'width 0.3s, opacity 0.3s',
        overflow: 'hidden',
        marginLeft: '8px',
    });

    const searchIconContainer = mergeStyles({ cursor: 'pointer' });

    return (
        <>
            <div className={areaBarStyle(isDarkMode)} style={{ display: 'flex', gap: '10px', minHeight: ACTION_BAR_HEIGHT }}>
                {areaTabs.map((area, index) => {
                    const isSelected = activeArea === area.key;
                    return (
                        <QuickActionsCard
                            key={area.key}
                            title={area.text}
                            icon={area.icon}
                            isDarkMode={isDarkMode}
                            onClick={() => setActiveArea(isSelected ? null : area.key)}
                            iconColor={colours.cta}
                            selected={isSelected}
                            style={{
                                '--card-index': index,
                                '--helix-cta': areaColor(area.key),
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

            </div>
            <div className={stateBarStyle(isDarkMode)} style={{ display: 'flex', gap: '10px', minHeight: ACTION_BAR_HEIGHT }}>
                {stateTabs.map((state) => {
                    const isSelected = activeState === state.key;
                    return (
                        <div
                            key={state.key}
                            className={mergeStyles(stateButtonStyle(isDarkMode), isSelected && activeStateButtonStyle)}
                            onClick={() => setActiveState(isSelected ? '' : state.key)}
                            aria-label={state.text}
                        >
                            <Text variant="medium" styles={{ root: { fontWeight: isSelected ? 600 : 400, color: isSelected ? '#ffffff' : undefined } }}>
                                {state.text}
                            </Text>
                        </div>
                    );
                })}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div onClick={toggleDashboard} className={mergeStyles(stateButtonStyle(isDarkMode), activeState === '' && activeStateButtonStyle)}>
                        <Text variant="medium" styles={{ root: { fontWeight: activeState === '' ? 600 : 400, color: activeState === '' ? '#ffffff' : undefined } }}>
                            Dashboard
                        </Text>
                    </div>
                    <div onClick={toggleUnclaimed} className={mergeStyles(stateButtonStyle(isDarkMode), unclaimedActive && activeStateButtonStyle)}>
                        <Text variant="medium" styles={{ root: { fontWeight: unclaimedActive ? 600 : 400, color: unclaimedActive ? '#ffffff' : undefined } }}>
                            Unclaimed
                        </Text>
                    </div>
                    <div className={searchIconContainer} onClick={() => setSearchActive(!isSearchActive)}>
                        {isSearchActive ? (
                            <Icon iconName="Cancel" styles={{ root: { fontSize: '20px', color: isDarkMode ? colours.dark.text : colours.light.text } }} />
                        ) : (
                            <Icon iconName="Search" styles={{ root: { fontSize: '20px', color: isDarkMode ? colours.dark.text : colours.light.text } }} />
                        )}
                    </div>
                    <TooltipHost content={showGroupedView ? "Switch to list view" : "Group repeated clients"}>
                        <IconButton
                            iconProps={{ 
                                iconName: showGroupedView ? 'SingleBookmark' : 'GroupedDescending'
                            }}
                            onClick={() => setShowGroupedView(!showGroupedView)}
                            styles={{
                                root: {
                                    color: showGroupedView ? colours.highlight : (isDarkMode ? colours.dark.text : colours.light.text),
                                    backgroundColor: 'transparent',
                                    selectors: {
                                        ':hover': {
                                            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                        },
                                    },
                                },
                                icon: {
                                    fontSize: '18px',
                                    color: showGroupedView ? colours.highlight : (isDarkMode ? colours.dark.text : colours.light.text),
                                },
                            }}
                        />
                    </TooltipHost>
                    <div className={searchBoxStyles}>
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
        </>
    );
};

export default EnquiriesMenu;
