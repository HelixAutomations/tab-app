import React from "react";
// invisible change 2
import { IconButton, Text, mergeStyles, Stack, SearchBox } from "@fluentui/react";
import { useTheme } from "../app/functionality/ThemeContext";
import { colours } from "../app/styles/colours";
import { formSections } from "../tabs/forms/formsData";
import { FormItem, UserData, NormalizedMatter, TeamData } from "../app/functionality/types";
import FormEmbed from "./FormEmbed";
import './PremiumSidebar.css';

interface FormsSidebarProps {
    userData: UserData[] | null;
    teamData?: TeamData[] | null;
    matters: NormalizedMatter[];
    activeTab: string;
    hovered?: boolean;
    pinned: boolean;
    setPinned: (pinned: boolean) => void;
}

const sidebarWidth = "380px";

// Offset to position the sidebar just below the stacked header bars
// (three bars, each 48px high). This value should line up exactly
// so the sidebar hides seamlessly beneath the menus.
// The main header stack totals 144px tall but has a slight drop shadow.
// Raise the sidebar a few pixels so it sits behind the header, hiding the gap.
// Base offset used when all header bars are visible. This roughly equals
// three stacked 48px rows minus a few pixels so the sidebar sits just
// behind their drop shadow.
const DEFAULT_SIDEBAR_TOP = 140;

const calculateSidebarTop = () => {
    const tabs = document.querySelector(
        ".customTabsContainer",
    ) as HTMLElement | null;
    const navigator = document.querySelector(
        ".app-navigator",
    ) as HTMLElement | null;

    let offset = (tabs?.offsetHeight || 0) + (navigator?.offsetHeight || 0);

    if (offset > 0) {
        // Nudge upwards slightly so the drop shadow of the header covers the gap
        offset = Math.max(0, offset - 4);
    } else {
        offset = DEFAULT_SIDEBAR_TOP;
    }

    return offset;
};

const sidebarContainer = (isOpen: boolean, isDarkMode: boolean, top: number) =>
    mergeStyles({
        position: "fixed",
        top: 0,
        left: isOpen ? 0 : `calc(-${sidebarWidth})`,
        width: sidebarWidth,
        height: "100vh",
        paddingTop: top,
        backgroundColor: isDarkMode ? '#0f0f0f' : '#fafbfc',
        borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
        padding: '0',
        overflowY: "auto",
        overflowX: "hidden",
        transition: "left 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        zIndex: 850,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: isOpen ? '2px 0 24px rgba(0,0,0,0.15)' : 'none',
    });

const handleStyle = (isOpen: boolean, isDarkMode: boolean, top: number) =>
    mergeStyles({
        position: "fixed",
        top: 0,
        left: isOpen ? sidebarWidth : 0,
        height: "100vh",
        width: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
        borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        zIndex: 851,
        borderRadius: isOpen ? '0 12px 12px 0' : '0',
        boxShadow: isOpen ? '2px 0 16px rgba(0,0,0,0.1)' : 'none',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        selectors: {
            ":hover": {
                backgroundColor: isDarkMode ? '#2a2a2a' : '#f0f2f5',
                transform: isOpen ? 'translateX(4px)' : 'translateX(2px)',
                boxShadow: '2px 0 20px rgba(0,0,0,0.15)',
            },
        },
    });
  

const sectionContainer = (isDarkMode: boolean) =>
    mergeStyles({
        backgroundColor: isDarkMode ? '#252525' : '#f8f9fa',
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        borderRadius: 8,
        padding: '12px',
        marginBottom: 12,
        transition: 'all 0.15s ease',
        selectors: {
            ':hover': {
                backgroundColor: isDarkMode ? '#2a2a2a' : '#e9ecef',
                transform: 'translateY(-1px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            },
        },
    });

// Premium Form Item Component
interface FormItemProps {
    form: FormItem;
    isDarkMode: boolean;
    isExpanded: boolean;
    isFavorite: boolean;
    onToggle: () => void;
    onCopy: () => void;
    onToggleFavorite: () => void;
    userData: UserData[] | null;
    teamData?: TeamData[] | null;
    matters: NormalizedMatter[];
    animationDelay?: number;
    isCompact?: boolean;
}

const FormItemComponent: React.FC<FormItemProps> = ({
    form,
    isDarkMode,
    isExpanded,
    isFavorite,
    onToggle,
    onCopy,
    onToggleFavorite,
    userData,
    teamData,
    matters,
    animationDelay = 0,
    isCompact = false,
}) => {
    return (
        <div 
            className="form-item-container"
            style={{
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                animationDelay: `${animationDelay}s`,
            }}
        >
            {/* Header */}
            <div style={{
                padding: isCompact ? '12px 16px' : '16px 20px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                backgroundColor: isExpanded ? (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)') : 'transparent',
                borderBottom: isExpanded ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` : 'none',
            }} onClick={onToggle}>
                <IconButton
                    iconProps={{
                        iconName: isExpanded ? "ChevronDown" : "ChevronRight",
                    }}
                    styles={{
                        root: {
                            width: 24,
                            height: 24,
                            color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                            marginRight: 8,
                            transition: 'all 0.2s ease',
                        },
                        rootHovered: {
                            backgroundColor: 'transparent',
                            color: isDarkMode ? '#ffffff' : '#0f0f0f',
                            transform: 'scale(1.1)',
                        },
                    }}
                />
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                    {form.icon && (
                        <div style={{
                            width: isCompact ? 20 : 24,
                            height: isCompact ? 20 : 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                            borderRadius: 6,
                            fontSize: isCompact ? 12 : 14,
                            color: '#0078d4',
                        }}>
                            📄
                        </div>
                    )}
                    
                    <span style={{
                        fontSize: isCompact ? 13 : 14,
                        fontWeight: 500,
                        color: isDarkMode ? '#e0e0e0' : '#2a2a2a',
                        lineHeight: 1.4,
                    }}>
                        {form.title}
                    </span>
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                    <IconButton
                        iconProps={{ iconName: isFavorite ? "FavoriteStarFill" : "FavoriteStar" }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite();
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: isFavorite ? '#D65541' : (isDarkMode ? '#8a8a8a' : '#6a6a6a'),
                                transition: 'all 0.2s ease',
                            },
                            rootHovered: {
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                color: '#D65541',
                                transform: 'scale(1.1)',
                            },
                        }}
                    />
                    
                    <IconButton
                        iconProps={{ iconName: "Copy" }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopy();
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                transition: 'all 0.2s ease',
                            },
                            rootHovered: {
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                color: isDarkMode ? '#ffffff' : '#0f0f0f',
                                transform: 'scale(1.1)',
                            },
                        }}
                    />
                    
                    <IconButton
                        iconProps={{ iconName: "NavigateExternalInline" }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (form.url) window.open(form.url, '_blank');
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                transition: 'all 0.2s ease',
                            },
                            rootHovered: {
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                color: '#0078d4',
                                transform: 'scale(1.1)',
                            },
                        }}
                    />
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div style={{
                    padding: '20px',
                    backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                    animation: 'formContentSlideIn 0.3s ease-out',
                }}>
                    <FormEmbed
                        link={form}
                        userData={userData}
                        teamData={teamData}
                        matters={matters}
                    />
                </div>
            )}
        </div>
    );
};

const FormsSidebar: React.FC<FormsSidebarProps> = ({
    userData,
    teamData,
    matters,
    activeTab,
    hovered,
    pinned,
    setPinned,
}) => {
    const { isDarkMode } = useTheme();
    const [isOpen, setIsOpen] = React.useState(false);
    const [expanded, setExpanded] = React.useState<{ [title: string]: boolean }>({});
    const [searchQuery, setSearchQuery] = React.useState("");
    const [sidebarTop, setSidebarTop] = React.useState<number>(DEFAULT_SIDEBAR_TOP);
    const [favorites, setFavorites] = React.useState<string[]>([]);
    const [recentlyUsed, setRecentlyUsed] = React.useState<string[]>([]);

    const updateTop = React.useCallback(() => {
        setSidebarTop(calculateSidebarTop());
    }, []);

    React.useEffect(() => {
        updateTop();
        window.addEventListener("resize", updateTop);
        return () => window.removeEventListener("resize", updateTop);
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
        if (activeTab === "forms") {
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

    const toggle = (title: string) => {
        setExpanded((p) => ({ ...p, [title]: !p[title] }));
    };

    const collapseAll = () => {
        const all: { [title: string]: boolean } = {};
        Object.values(formSections).forEach((arr) => {
            arr.forEach((f) => (all[f.title] = false));
        });
        setExpanded(all);
    };

    const copyLink = (url: string, title: string) => {
        navigator.clipboard.writeText(url).catch((err) => console.error(err));
        // Track usage
        setRecentlyUsed(prev => {
            const updated = [title, ...prev.filter(t => t !== title)].slice(0, 5);
            localStorage.setItem('formsRecentlyUsed', JSON.stringify(updated));
            return updated;
        });
    };

    const toggleFavorite = (title: string) => {
        setFavorites(prev => {
            const updated = prev.includes(title) 
                ? prev.filter(t => t !== title)
                : [...prev, title];
            localStorage.setItem('formsFavorites', JSON.stringify(updated));
            return updated;
        });
    };

    const filteredForms = React.useMemo(() => {
        if (!searchQuery.trim()) return formSections;
        
        const filtered: typeof formSections = {
            General_Processes: [],
            Operations: [],
            Financial: [],
            Tech_Support: [],
            Recommendations: [],
            Browse_Directories: [],
        };
        
        Object.entries(formSections).forEach(([section, forms]) => {
            if (section !== 'Favorites') {
                filtered[section as keyof typeof filtered] = forms.filter(form =>
                    form.title.toLowerCase().includes(searchQuery.toLowerCase())
                );
            }
        });
        
        return filtered;
    }, [searchQuery]);

    // Load favorites and recent from localStorage
    React.useEffect(() => {
        const storedFavorites = localStorage.getItem('formsFavorites');
        const storedRecent = localStorage.getItem('formsRecentlyUsed');
        if (storedFavorites) setFavorites(JSON.parse(storedFavorites));
        if (storedRecent) setRecentlyUsed(JSON.parse(storedRecent));
    }, []);

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
                aria-label="Toggle Forms Sidebar"
            >
                <IconButton
                    iconProps={{ iconName: isOpen ? "ChevronLeft" : "ChevronRight" }}
                    styles={{ root: { width: 24, height: 24 } }}
                    ariaLabel="Toggle Forms Sidebar"
                />
            </div>
            <div className={sidebarContainer(isOpen, isDarkMode, sidebarTop)}>
                {/* Premium Header */}
                <div style={{
                    padding: '24px 24px 16px',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
                    backgroundColor: isDarkMode ? '#111' : '#fff',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backdropFilter: 'blur(20px)',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 16,
                    }}>
                        <h1 style={{
                            fontSize: '20px',
                            fontWeight: 700,
                            color: isDarkMode ? '#ffffff' : '#0f0f0f',
                            letterSpacing: '-0.02em',
                            margin: 0,
                            lineHeight: 1.2,
                        }}>
                            Forms Hub
                        </h1>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <IconButton
                                iconProps={{ iconName: "Refresh" }}
                                onClick={() => window.location.reload()}
                                ariaLabel="Refresh Forms"
                                styles={{
                                    root: {
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                        transition: 'all 0.2s ease',
                                    },
                                    rootHovered: {
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        color: isDarkMode ? '#ffffff' : '#0f0f0f',
                                        transform: 'scale(1.05)',
                                    },
                                }}
                            />
                            <IconButton
                                iconProps={{ iconName: "DoubleChevronUp" }}
                                onClick={collapseAll}
                                ariaLabel="Collapse All"
                                styles={{
                                    root: {
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                        transition: 'all 0.2s ease',
                                    },
                                    rootHovered: {
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        color: isDarkMode ? '#ffffff' : '#0f0f0f',
                                        transform: 'scale(1.05)',
                                    },
                                }}
                            />
                        </div>
                    </div>
                    
                    {/* Premium Search */}
                    <SearchBox
                        placeholder="Search forms..."
                        value={searchQuery}
                        onChange={(_, newValue) => setSearchQuery(newValue || "")}
                        styles={{
                            root: {
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                                borderRadius: 12,
                                height: 44,
                                transition: 'all 0.2s ease',
                                selectors: {
                                    ':hover': {
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                        borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                                    },
                                    ':focus-within': {
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                        borderColor: '#0078d4',
                                        boxShadow: '0 0 0 2px rgba(0,120,212,0.2)',
                                    },
                                },
                            },
                            field: {
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: isDarkMode ? '#ffffff' : '#0f0f0f',
                                fontSize: 14,
                                fontWeight: 400,
                                padding: '0 16px',
                                selectors: {
                                    '::placeholder': {
                                        color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                    },
                                },
                            },
                            icon: {
                                color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                            },
                        }}
                    />
                </div>

                {/* Content Area */}
                <div style={{ padding: '16px 24px 24px' }}>
                    {/* Quick Access - Favorites */}
                    {favorites.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <h3 style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                margin: '0 0 12px 0',
                            }}>
                                ⭐ Favorites
                            </h3>
                            <div style={{ display: 'grid', gap: 8 }}>
                                {Object.values(formSections).flat().filter(form => 
                                    favorites.includes(form.title)
                                ).map((form, index) => (
                                    <FormItemComponent 
                                        key={`fav-${form.title}`}
                                        form={form}
                                        isDarkMode={isDarkMode}
                                        isExpanded={expanded[form.title]}
                                        isFavorite={true}
                                        onToggle={() => toggle(form.title)}
                                        onCopy={() => copyLink(form.url || '', form.title)}
                                        onToggleFavorite={() => toggleFavorite(form.title)}
                                        userData={userData}
                                        teamData={teamData}
                                        matters={matters}
                                        animationDelay={index * 0.05}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recently Used */}
                    {recentlyUsed.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <h3 style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                margin: '0 0 12px 0',
                            }}>
                                🕒 Recent
                            </h3>
                            <div style={{ display: 'grid', gap: 8 }}>
                                {Object.values(formSections).flat().filter(form => 
                                    recentlyUsed.includes(form.title)
                                ).slice(0, 3).map((form, index) => (
                                    <FormItemComponent 
                                        key={`recent-${form.title}`}
                                        form={form}
                                        isDarkMode={isDarkMode}
                                        isExpanded={expanded[form.title]}
                                        isFavorite={favorites.includes(form.title)}
                                        onToggle={() => toggle(form.title)}
                                        onCopy={() => copyLink(form.url || '', form.title)}
                                        onToggleFavorite={() => toggleFavorite(form.title)}
                                        userData={userData}
                                        teamData={teamData}
                                        matters={matters}
                                        animationDelay={index * 0.05}
                                        isCompact={true}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Form Sections */}
                    {Object.entries(filteredForms).map(([section, forms], sectionIndex) => (
                        forms.length > 0 && (
                            <div key={section} style={{ marginBottom: 24 }}>
                                <h3 style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                                    margin: '0 0 12px 0',
                                }}>
                                    {section.replace(/_/g, ' ')}
                                </h3>
                                <div style={{ display: 'grid', gap: 8 }}>
                                    {forms.map((form, index) => (
                                        <FormItemComponent 
                                            key={form.title}
                                            form={form}
                                            isDarkMode={isDarkMode}
                                            isExpanded={expanded[form.title]}
                                            isFavorite={favorites.includes(form.title)}
                                            onToggle={() => toggle(form.title)}
                                            onCopy={() => copyLink(form.url || '', form.title)}
                                            onToggleFavorite={() => toggleFavorite(form.title)}
                                            userData={userData}
                                            teamData={teamData}
                                            matters={matters}
                                            animationDelay={(sectionIndex * 0.1) + (index * 0.05)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    ))}

                    {/* Empty State */}
                    {searchQuery && Object.values(filteredForms).every(forms => forms.length === 0) && (
                        <div style={{
                            textAlign: 'center',
                            padding: '48px 16px',
                            color: isDarkMode ? '#8a8a8a' : '#6a6a6a',
                        }}>
                            <div style={{ fontSize: 24, marginBottom: 12 }}>🔍</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>No forms found</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Try a different search term</div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );

};

export default FormsSidebar;