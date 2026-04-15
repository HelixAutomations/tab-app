import React, { useState, useEffect } from 'react';
// invisible change 2
import { IconButton, ActionButton } from '@fluentui/react/lib/Button';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Icon } from '@fluentui/react/lib/Icon';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import Resources from '../tabs/resources/Resources';
import type { UserData } from '../app/functionality/types';
import './PremiumSidebar.css';

interface ResourcesSidebarProps {
    activeTab: string;
    hovered?: boolean;
    pinned: boolean;
    setPinned: (pinned: boolean) => void;
    userData?: UserData[] | null;
}

const sidebarWidth = '380px';
const DEFAULT_SIDEBAR_TOP = 140;

const calculateSidebarTop = () => {
    const tabs = document.querySelector('.customTabsContainer') as HTMLElement | null;
    const navigator = document.querySelector('.app-navigator') as HTMLElement | null;

    let offset = (tabs?.offsetHeight || 0) + (navigator?.offsetHeight || 0);

    if (offset > 0) {
        offset = Math.max(0, offset - 4);
    } else {
        offset = DEFAULT_SIDEBAR_TOP;
    }

    return offset;
};

const sidebarContainer = (isOpen: boolean, isDarkMode: boolean, top: number) =>
    mergeStyles({
        position: 'fixed',
        top: 0,
        right: isOpen ? 0 : `calc(-${sidebarWidth})`,
        width: sidebarWidth,
        height: '100vh',
        paddingTop: top,
        backgroundColor: isDarkMode ? colours.dark.background : colours.grey,
        borderLeft: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
        padding: '0',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 850,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: isOpen ? '-2px 0 24px rgba(0,0,0,0.15)' : 'none',
    });

const handleStyle = (isOpen: boolean, isDarkMode: boolean, top: number) =>
    mergeStyles({
        position: 'fixed',
        top: 0,
        right: isOpen ? sidebarWidth : 0,
        height: '100vh',
        width: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
        borderLeft: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 851,
        borderRadius: isOpen ? '12px 0 0 12px' : '0',
        boxShadow: isOpen ? '-2px 0 16px rgba(0,0,0,0.1)' : 'none',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        selectors: {
            ':hover': {
                backgroundColor: isDarkMode ? colours.dark.cardBackground : '#f0f2f5',
                transform: isOpen ? 'translateX(-4px)' : 'translateX(-2px)',
                boxShadow: '-2px 0 20px rgba(0,0,0,0.15)',
            },
        },
    });

const ResourcesSidebar: React.FC<ResourcesSidebarProps> = ({
    activeTab,
    hovered,
    pinned,
    setPinned,
    userData,
}) => {
    const { isDarkMode } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [favorites, setFavorites] = useState<string[]>([]);
    const [recentResources, setRecentResources] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = React.useState(false);
    const [sidebarTop, setSidebarTop] = React.useState<number>(DEFAULT_SIDEBAR_TOP);

    const updateTop = React.useCallback(() => {
        setSidebarTop(calculateSidebarTop());
    }, []);

    // Load favorites and recent resources from localStorage
    useEffect(() => {
        const savedFavorites = localStorage.getItem('resources-favorites');
        const savedRecent = localStorage.getItem('resources-recent');
        
        if (savedFavorites) {
            setFavorites(JSON.parse(savedFavorites));
        }
        if (savedRecent) {
            setRecentResources(JSON.parse(savedRecent));
        }
    }, []);

    // Save to localStorage when favorites or recent changes
    useEffect(() => {
        localStorage.setItem('resources-favorites', JSON.stringify(favorites));
    }, [favorites]);

    useEffect(() => {
        localStorage.setItem('resources-recent', JSON.stringify(recentResources));
    }, [recentResources]);

    React.useEffect(() => {
        updateTop();
        window.addEventListener('resize', updateTop);
        return () => window.removeEventListener('resize', updateTop);
    }, [updateTop]);

    React.useEffect(() => {
        if (isOpen) {
            updateTop();
        }
    }, [isOpen, updateTop]);

    React.useEffect(() => {
        updateTop();
    }, [activeTab, updateTop]);

    React.useEffect(() => {
        if (activeTab === 'resources') {
            setPinned(true);
            setIsOpen(true);
        }
    }, [activeTab, setPinned]);

    React.useEffect(() => {
        if (!pinned) {
            setIsOpen(hovered || false);
        }
    }, [hovered, pinned]);

    React.useEffect(() => {
        if (pinned) {
            setIsOpen(true);
        }
    }, [pinned]);

    return (
        <>
            <div
                className={handleStyle(isOpen, isDarkMode, sidebarTop)}
                onClick={() => {
                    if (pinned) {
                        setPinned(false);
                        setIsOpen(false);
                    } else {
                        setPinned(true);
                        setIsOpen(true);
                    }
                }}
                aria-label="Toggle Resources Sidebar"
            >
                <IconButton
                    iconProps={{ iconName: isOpen ? 'ChevronRight' : 'ChevronLeft' }}
                    styles={{ 
                        root: { 
                            width: 28, 
                            height: 28,
                            color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        },
                        rootHovered: {
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                        },
                    }}
                    ariaLabel="Toggle Resources Sidebar"
                />
            </div>
            <div className={sidebarContainer(isOpen, isDarkMode, sidebarTop)}>
                {isOpen && (
                    <div style={{ 
                        padding: '24px', 
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column',
                        animation: 'premiumSidebarSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}>
                        {/* Premium Header */}
                        <div style={{
                            marginBottom: '24px',
                            paddingBottom: '20px',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '16px',
                            }}>
                                <Text
                                    variant="xLarge"
                                    style={{
                                        fontWeight: 600,
                                        color: isDarkMode ? colours.dark.text : colours.light.text,
                                        letterSpacing: '-0.01em',
                                    }}
                                >
                                    Resources
                                </Text>
                                <ActionButton
                                    iconProps={{ iconName: 'Pin' }}
                                    styles={{
                                        root: {
                                            minWidth: 32,
                                            height: 32,
                                            borderRadius: '8px',
                                            backgroundColor: pinned 
                                                ? (isDarkMode ? colours.helixBlue : colours.highlight)
                                                : 'transparent',
                                            color: pinned 
                                                ? '#ffffff'
                                                : (isDarkMode ? colours.subtleGrey : colours.greyText),
                                        },
                                        rootHovered: {
                                            backgroundColor: pinned 
                                                ? (isDarkMode ? colours.helixBlue : colours.highlight)
                                                : (isDarkMode ? colours.dark.cardBackground : '#f0f2f5'),
                                        },
                                    }}
                                    onClick={() => setPinned(!pinned)}
                                />
                            </div>
                            
                            <SearchBox
                                placeholder="Search resources..."
                                value={searchQuery}
                                onChange={(_, newValue) => setSearchQuery(newValue || '')}
                                styles={{
                                    root: {
                                        borderRadius: '12px',
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                                        backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
                                        transition: 'all 0.2s ease',
                                    },
                                    field: {
                                        backgroundColor: 'transparent',
                                        color: isDarkMode ? colours.dark.text : colours.light.text,
                                        fontSize: '14px',
                                        padding: '12px 16px',
                                    },
                                }}
                            />
                        </div>

                        {/* Quick Access Section */}
                        {(favorites.length > 0 || recentResources.length > 0) && (
                            <div style={{ marginBottom: '24px' }}>
                                {favorites.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <Text
                                            variant="medium"
                                            style={{
                                                fontWeight: 500,
                                                color: isDarkMode ? colours.subtleGrey : colours.greyText,
                                                marginBottom: '12px',
                                                display: 'block',
                                            }}
                                        >
                                            Favorites
                                        </Text>
                                        <Stack tokens={{ childrenGap: 8 }}>
                                            {favorites.slice(0, 3).map((favorite, index) => (
                                                <div
                                                    key={favorite}
                                                    className="premiumListItem"
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
                                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
                                                        animation: `resourceItemFadeIn 0.3s ease ${index * 0.1}s both`,
                                                    }}
                                                >
                                                    <Text
                                                        variant="small"
                                                        style={{
                                                            color: isDarkMode ? colours.dark.text : colours.light.text,
                                                            fontWeight: 500,
                                                        }}
                                                    >
                                                        {favorite}
                                                    </Text>
                                                </div>
                                            ))}
                                        </Stack>
                                    </div>
                                )}
                                
                                {recentResources.length > 0 && (
                                    <div>
                                        <Text
                                            variant="medium"
                                            style={{
                                                fontWeight: 500,
                                                color: isDarkMode ? colours.subtleGrey : colours.greyText,
                                                marginBottom: '12px',
                                                display: 'block',
                                            }}
                                        >
                                            Recent
                                        </Text>
                                        <Stack tokens={{ childrenGap: 8 }}>
                                            {recentResources.slice(0, 3).map((resource, index) => (
                                                <div
                                                    key={resource}
                                                    className="premiumListItem"
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
                                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
                                                        animation: `resourceItemFadeIn 0.3s ease ${(index + favorites.length) * 0.1}s both`,
                                                    }}
                                                >
                                                    <Text
                                                        variant="small"
                                                        style={{
                                                            color: isDarkMode ? colours.dark.text : colours.light.text,
                                                            fontWeight: 500,
                                                        }}
                                                    >
                                                        {resource}
                                                    </Text>
                                                </div>
                                            ))}
                                        </Stack>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Main Content */}
                        <div style={{ 
                            flex: 1, 
                            overflow: 'hidden',
                            animation: 'premiumContentFadeIn 0.6s ease 0.2s both',
                        }}>
                            <Resources userData={userData} />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default ResourcesSidebar;
