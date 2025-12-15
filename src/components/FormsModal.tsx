import React, { useState, useMemo, useCallback } from "react";
import { IconButton, Text, Modal, Icon } from "@fluentui/react";
import { useTheme } from "../app/functionality/ThemeContext";
import { colours } from "../app/styles/colours";
import { formSections } from "../tabs/forms/formsData";
import { FormItem, UserData, NormalizedMatter, TeamData } from "../app/functionality/types";
import FormEmbed from "./FormEmbed";

interface FormsModalProps {
    userData: UserData[] | null;
    teamData?: TeamData[] | null;
    matters: NormalizedMatter[];
    isOpen: boolean;
    onDismiss: () => void;
}

// Section config with brand colors - used for grouping indicator and icons
const sectionConfig: Record<string, { label: string; color: string; locked?: boolean }> = {
    General_Processes: { label: 'General', color: colours.highlight },      // Brand blue #3690CE
    Operations: { label: 'Operations', color: colours.green },              // Brand green #20b26c
    Financial: { label: 'Financial', color: colours.highlight },            // Brand blue #3690CE
    Tech_Support: { label: 'Tech Support', color: colours.orange, locked: true },  // Locked - brand orange
    Recommendations: { label: 'Recommendations', color: colours.highlight, locked: true },  // Locked - brand blue
    Browse_Directories: { label: 'Directories', color: colours.greyText, locked: true },   // Locked - grey
};

// Forms to exclude
const excludedForms = ['CollabSpace Requests'];

// Form card item - clean style with consistent house styling
const FormCard: React.FC<{
    form: FormItem;
    groupColor: string;  // Used only for the left indicator, not form accents
    isDarkMode: boolean;
    isLocked?: boolean;
    onOpen: () => void;
    onCopyLink?: () => void;
    onOpenExternal?: () => void;
}> = ({ form, groupColor, isDarkMode, isLocked, onOpen, onCopyLink, onOpenExternal }) => {
    const [isHovered, setIsHovered] = useState(false);
    const hasExternalLink = !!form.url;
    
    // Colors for card
    const bg = isDarkMode ? 'rgba(30, 41, 59, 0.7)' : '#ffffff';
    const bgHover = isDarkMode ? 'rgba(30, 41, 59, 0.85)' : '#f8fafc';
    const border = isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)';
    const borderHover = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(0, 0, 0, 0.12)';
    const text = isDarkMode ? '#f1f5f9' : '#1e293b';
    const textMuted = isDarkMode ? '#94a3b8' : '#64748b';

    // Locked styling - greyed out
    const lockedBg = isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(0, 0, 0, 0.02)';
    const lockedBorder = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)';
    const lockedText = isDarkMode ? '#64748b' : '#94a3b8';
    const lockedAccent = isDarkMode ? '#475569' : '#cbd5e1';

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'stretch',
                background: isLocked ? lockedBg : (isHovered ? bgHover : bg),
                borderTop: `1px solid ${isLocked ? lockedBorder : (isHovered ? borderHover : border)}`,
                borderRight: `1px solid ${isLocked ? lockedBorder : (isHovered ? borderHover : border)}`,
                borderBottom: `1px solid ${isLocked ? lockedBorder : (isHovered ? borderHover : border)}`,
                borderLeft: `3px solid ${isLocked ? lockedAccent : groupColor}`,
                boxShadow: isLocked 
                    ? (isHovered ? (isDarkMode ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.06)') : 'none')
                    : (isHovered 
                        ? (isDarkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)')
                        : (isDarkMode ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)')),
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                opacity: isLocked ? 0.6 : 1,
                minWidth: '280px',
                maxWidth: '360px',
                flex: '1 1 280px',
            }}
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpen()}
        >
            {/* Icon */}
            <div style={{
                width: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: isLocked ? lockedAccent : groupColor,
            }}>
                <Icon iconName={isLocked ? 'Lock' : (form.icon || 'Document')} style={{ fontSize: 18 }} />
            </div>

            {/* Content */}
            <div style={{ 
                flex: 1, 
                padding: '12px 12px 12px 0',
                minWidth: 0,
            }}>
                <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isLocked ? lockedText : text,
                    marginBottom: form.requires ? 3 : 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {form.title}
                </div>
                {form.requires && (
                    <div style={{
                        fontSize: 11,
                        color: isLocked ? lockedText : textMuted,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                        <span style={{ opacity: 0.7 }}>→</span>
                        <span style={{ 
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {form.requires}
                        </span>
                    </div>
                )}
            </div>

            {/* Actions for external links */}
            {hasExternalLink && isHovered && !isLocked && (
                <div 
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        paddingRight: 8,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <IconButton
                        iconProps={{ iconName: 'Copy' }}
                        title="Copy link"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopyLink?.();
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: textMuted,
                            },
                            rootHovered: {
                                background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            },
                        }}
                    />
                    <IconButton
                        iconProps={{ iconName: 'OpenInNewWindow' }}
                        title="Open in new tab"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenExternal?.();
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: textMuted,
                            },
                            rootHovered: {
                                background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            },
                        }}
                    />
                </div>
            )}
        </div>
    );
};

const FormsModal: React.FC<FormsModalProps> = ({
    userData,
    teamData,
    matters,
    isOpen,
    onDismiss,
}) => {
    const { isDarkMode } = useTheme();
    const [selectedForm, setSelectedForm] = useState<FormItem | null>(null);
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    // Get sections with filtered forms
    const sections = useMemo(() => {
        return Object.entries(formSections)
            .map(([key, forms]) => ({
                key,
                label: sectionConfig[key]?.label || key,
                color: sectionConfig[key]?.color || '#3690CE',
                locked: sectionConfig[key]?.locked || false,
                forms: forms.filter(f => !excludedForms.includes(f.title)),
            }))
            .filter(section => section.forms.length > 0);
    }, []);

    const handleFormSelect = (form: FormItem) => {
        setSelectedForm(form);
    };

    const handleCopyLink = useCallback((url: string) => {
        navigator.clipboard.writeText(url);
        setCopiedLink(url);
        setTimeout(() => setCopiedLink(null), 2000);
    }, []);

    const handleOpenExternal = useCallback((url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    const handleBack = () => {
        setSelectedForm(null);
    };

    // Get group color for selected form
    const getFormGroupColor = useCallback((form: FormItem | null): string => {
        if (!form) return colours.highlight;
        for (const [key, forms] of Object.entries(formSections)) {
            if (forms.some(f => f.title === form.title)) {
                return sectionConfig[key]?.color || colours.highlight;
            }
        }
        return colours.highlight;
    }, []);

    // Get current user
    const currentUser = useMemo(() => {
        if (!userData || userData.length === 0) return undefined;
        return userData[0];
    }, [userData]);

    // Selected form view (full screen)
    if (selectedForm) {
        // Custom component forms
        if (selectedForm.component) {
            const FormComponent = selectedForm.component;
            return (
                <Modal
                    isOpen={isOpen}
                    onDismiss={onDismiss}
                    isBlocking={false}
                    styles={{
                        main: {
                            width: '100vw',
                            height: '100vh',
                            maxWidth: 'none',
                            maxHeight: 'none',
                            margin: 0,
                            borderRadius: 0,
                            background: isDarkMode ? '#0f172a' : '#fafafa',
                        },
                        scrollableContent: {
                            height: '100vh',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }
                    }}
                >
                    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                        {/* Consistent header with back button and group color cue */}
                        <div style={{
                            padding: '16px 32px',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                            borderLeft: `4px solid ${getFormGroupColor(selectedForm)}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                            background: isDarkMode ? '#1e293b' : '#fff',
                            flexShrink: 0,
                        }}>
                            <button
                                onClick={handleBack}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 18px',
                                    borderRadius: 0,
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0,0,0,0.1)'}`,
                                    background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                    color: isDarkMode ? '#f1f5f9' : '#1e293b',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <Icon iconName="ChevronLeft" style={{ fontSize: 14 }} />
                                Back
                            </button>
                            <Text style={{ 
                                fontSize: '20px', 
                                fontWeight: 600, 
                                color: isDarkMode ? '#f1f5f9' : '#1e293b' 
                            }}>
                                {selectedForm.title}
                            </Text>
                            <div style={{ flex: 1 }} />
                            <IconButton
                                iconProps={{ iconName: 'Cancel' }}
                                onClick={onDismiss}
                                styles={{
                                    root: {
                                        width: 40,
                                        height: 40,
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0,0,0,0.1)'}`,
                                        background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                    },
                                    icon: {
                                        color: isDarkMode ? '#94a3b8' : '#64748b',
                                    },
                                }}
                            />
                        </div>
                        {/* Form content */}
                        <div style={{ flex: 1, overflow: 'auto' }}>
                            <FormComponent
                                userData={userData || undefined}
                                currentUser={currentUser}
                                matters={matters}
                                onBack={handleBack}
                            />
                        </div>
                    </div>
                </Modal>
            );
        }

        // Embedded/external forms
        return (
            <Modal
                isOpen={isOpen}
                onDismiss={onDismiss}
                isBlocking={false}
                styles={{
                    main: {
                        width: '100vw',
                        height: '100vh',
                        maxWidth: 'none',
                        maxHeight: 'none',
                        margin: 0,
                        borderRadius: 0,
                        background: isDarkMode ? '#0f172a' : '#fafafa',
                    },
                    scrollableContent: {
                        height: '100vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }
                }}
            >
                <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                    {/* Consistent header with back button and group color cue */}
                    <div style={{
                        padding: '16px 32px',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                        borderLeft: `4px solid ${getFormGroupColor(selectedForm)}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        background: isDarkMode ? '#1e293b' : '#fff',
                        flexShrink: 0,
                    }}>
                        <button
                            onClick={handleBack}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 18px',
                                borderRadius: 0,
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0,0,0,0.1)'}`,
                                background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                color: isDarkMode ? '#f1f5f9' : '#1e293b',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500,
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <Icon iconName="ChevronLeft" style={{ fontSize: 14 }} />
                            Back
                        </button>
                        <Text style={{ 
                            fontSize: '20px', 
                            fontWeight: 600, 
                            color: isDarkMode ? '#f1f5f9' : '#1e293b' 
                        }}>
                            {selectedForm.title}
                        </Text>
                        <div style={{ flex: 1 }} />
                        <IconButton
                            iconProps={{ iconName: 'Cancel' }}
                            onClick={onDismiss}
                            styles={{
                                root: {
                                    width: 40,
                                    height: 40,
                                    borderRadius: 0,
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0,0,0,0.1)'}`,
                                    background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                },
                                icon: {
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                },
                            }}
                        />
                    </div>
                    {/* Form content */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '32px 48px' }}>
                        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                            <FormEmbed 
                                link={selectedForm}
                                userData={userData}
                                teamData={teamData}
                                matters={matters}
                            />
                        </div>
                    </div>
                </div>
            </Modal>
        );
    }

    // Main grid view - Apple/Microsoft style
    return (
        <Modal
            isOpen={isOpen}
            onDismiss={onDismiss}
            isBlocking={false}
            styles={{
                main: {
                    width: '100vw',
                    height: '100vh',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    margin: 0,
                    borderRadius: 0,
                    background: isDarkMode ? '#0f172a' : '#fafafa',
                },
                scrollableContent: {
                    height: '100vh',
                }
            }}
        >
            <div style={{ 
                height: '100vh', 
                display: 'flex', 
                flexDirection: 'column',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
                {/* Clean header */}
                <div style={{
                    padding: '32px 48px 24px',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    background: isDarkMode ? '#1e293b' : '#fff',
                    flexShrink: 0,
                }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{
                                fontSize: '28px',
                                fontWeight: 600,
                                color: isDarkMode ? '#fff' : '#1a1a1a',
                                display: 'block',
                            }}>
                                Forms &amp; Processes
                            </Text>
                            <IconButton
                                iconProps={{ iconName: 'Cancel' }}
                                onClick={onDismiss}
                                styles={{
                                    root: {
                                        width: 40,
                                        height: 40,
                                        borderRadius: 0,
                                        background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                    },
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Forms by section */}
                <div style={{ flex: 1, overflow: 'auto', padding: '24px 48px 48px' }}>
                    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                        {sections.map((section) => (
                            <div key={section.key} style={{ marginBottom: '28px' }}>
                                <div style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    opacity: section.locked ? 0.6 : 1,
                                }}>
                                    <span style={{
                                        width: 3,
                                        height: 12,
                                        background: section.locked ? (isDarkMode ? '#475569' : '#cbd5e1') : section.color,
                                        borderRadius: 1,
                                    }} />
                                    {section.label}
                                    {section.locked && (
                                        <Icon iconName="Lock" style={{ fontSize: 10, marginLeft: 2 }} />
                                    )}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '10px',
                                }}>
                                    {section.forms.map((form) => (
                                        <FormCard
                                            key={form.title}
                                            form={form}
                                            groupColor={section.color}
                                            isDarkMode={isDarkMode}
                                            isLocked={section.locked}
                                            onOpen={() => handleFormSelect(form)}
                                            onCopyLink={form.url ? () => handleCopyLink(form.url!) : undefined}
                                            onOpenExternal={form.url ? () => handleOpenExternal(form.url!) : undefined}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Copy confirmation toast */}
                    {copiedLink && (
                        <div style={{
                            position: 'fixed',
                            bottom: 24,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: isDarkMode ? '#1e293b' : '#1e293b',
                            color: '#fff',
                            padding: '10px 20px',
                            fontSize: 13,
                            fontWeight: 500,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <Icon iconName="CheckMark" style={{ color: '#4ade80' }} />
                            Link copied
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default FormsModal;
