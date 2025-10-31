import React, { useState, useEffect } from "react";
import { IconButton, Text, SearchBox, Stack, Modal, ActionButton } from "@fluentui/react";
import { useTheme } from "../app/functionality/ThemeContext";
import { colours } from "../app/styles/colours";
import { formSections } from "../tabs/forms/formsData";
import { FormItem, UserData, NormalizedMatter, TeamData } from "../app/functionality/types";
import FormEmbed from "./FormEmbed";
import './PremiumModal.css';

interface FormsModalProps {
    userData: UserData[] | null;
    teamData?: TeamData[] | null;
    matters: NormalizedMatter[];
    isOpen: boolean;
    onDismiss: () => void;
}

// Enhanced icon set for better visual variety
const enhancedIcons: { [key: string]: string } = {
    'Phone': 'CellPhone',
    'BulletedList': 'TaskManager',
    'Calendar': 'CalendarDay',
    'Contact': 'ContactCard',
    'FileCode': 'FileTemplate',
    'EmailMessage': 'MailAlert',
    'Document': 'DocumentSet',
    'Settings': 'ConfigurationSolid',
    'Money': 'PaymentCard',
    'Calculator': 'CalculatorAddition',
    'Chart': 'BarChartVertical',
    'Report': 'ReportDocument',
    'Clock': 'DateTime',
    'Flag': 'FlagFilled',
    'Tag': 'TagSolid',
    'Lock': 'LockSolid',
    'Key': 'PasswordField',
    'Globe': 'WorldClock',
    'Cloud': 'CloudAdd',
    'Database': 'DatabaseSync'
};

const getFormIcon = (originalIcon: string): string => {
    return enhancedIcons[originalIcon] || originalIcon;
};

const FormItemComponent: React.FC<{
    item: FormItem;
    index: number;
    onFormSelect: (item: FormItem) => void;
    isDarkMode: boolean;
}> = ({ item, index, onFormSelect, isDarkMode }) => (
    <div
        onClick={() => onFormSelect(item)}
        className="premiumModalItem"
        style={{
            padding: '16px 20px',
            borderRadius: '12px',
            cursor: 'pointer',
            backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : '#ffffff',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(0,0,0,0.06)'}`,
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            animation: `modalItemFadeIn 0.4s ease ${index * 0.05}s both`,
            marginBottom: '8px',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f8f9fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#6a6a6a',
            }}>
                <IconButton
                    iconProps={{ iconName: getFormIcon(item.icon) }}
                    styles={{
                        root: { width: 24, height: 24 },
                        icon: { fontSize: 16, color: 'inherit' }
                    }}
                />
            </div>
            <div style={{ flex: 1 }}>
                <Text
                    variant="medium"
                    style={{
                        fontWeight: 600,
                        color: isDarkMode ? '#ffffff' : '#000000',
                        marginBottom: '4px',
                        display: 'block',
                    }}
                >
                    {item.title}
                </Text>
                {item.description && (
                    <Text
                        variant="small"
                        style={{
                            color: isDarkMode ? '#cccccc' : '#666666',
                            lineHeight: '1.4',
                        }}
                    >
                        {item.description}
                    </Text>
                )}
            </div>
            <IconButton
                iconProps={{ iconName: 'ChevronRight' }}
                styles={{
                    root: { 
                        width: 32, 
                        height: 32,
                        color: isDarkMode ? '#666666' : '#999999',
                    }
                }}
            />
        </div>
    </div>
);

const FormsModal: React.FC<FormsModalProps> = ({
    userData,
    teamData,
    matters,
    isOpen,
    onDismiss,
}) => {
    const { isDarkMode } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedForm, setSelectedForm] = useState<FormItem | null>(null);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [recentForms, setRecentForms] = useState<string[]>([]);

    // Load favorites and recent forms from localStorage
    useEffect(() => {
        const savedFavorites = localStorage.getItem('forms-favorites');
        const savedRecent = localStorage.getItem('forms-recent');
        
        if (savedFavorites) {
            setFavorites(JSON.parse(savedFavorites));
        }
        if (savedRecent) {
            setRecentForms(JSON.parse(savedRecent));
        }
    }, []);

    // Save to localStorage when favorites or recent changes
    useEffect(() => {
        localStorage.setItem('forms-favorites', JSON.stringify(favorites));
    }, [favorites]);

    useEffect(() => {
        localStorage.setItem('forms-recent', JSON.stringify(recentForms));
    }, [recentForms]);

    const handleFormSelect = (item: FormItem) => {
        setSelectedForm(item);
        
        // Add to recent forms
        const newRecent = [item.title, ...recentForms.filter(f => f !== item.title)].slice(0, 5);
        setRecentForms(newRecent);
    };

    const handleFormClose = () => {
        setSelectedForm(null);
    };

    const filteredSections = React.useMemo(() => {
        if (!searchQuery) return formSections;
        
        const filtered: typeof formSections = {} as any;
        Object.entries(formSections).forEach(([sectionKey, forms]) => {
            const matchingForms = forms.filter(form =>
                form.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                form.description?.toLowerCase().includes(searchQuery.toLowerCase())
            );
            if (matchingForms.length > 0) {
                filtered[sectionKey as keyof typeof formSections] = matchingForms;
            }
        });
        return filtered;
    }, [searchQuery]);

    if (selectedForm) {
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
                        // Use reporting-style dark background to avoid pure-black feel
                        background: isDarkMode
                            ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #334155 65%, #475569 100%)'
                            : '#ffffff',
                    },
                    // Keep the modal container fixed-height but avoid trapping scroll here
                    scrollableContent: {
                        height: '100vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }
                }}
            >
                <div style={{
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <div style={{
                        padding: '20px 32px',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isDarkMode ? colours.dark.sectionBackground : '#fafbfc',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <ActionButton
                                iconProps={{ iconName: 'Back' }}
                                onClick={handleFormClose}
                                styles={{
                                    root: {
                                        minWidth: 40,
                                        height: 40,
                                        borderRadius: '10px',
                                        backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f0f2f5',
                                    }
                                }}
                            />
                            <Text variant="xLarge" style={{
                                fontWeight: 600,
                                color: isDarkMode ? '#ffffff' : '#000000',
                            }}>
                                {selectedForm.title}
                            </Text>
                        </div>
                        <ActionButton
                            iconProps={{ iconName: 'Cancel' }}
                            onClick={onDismiss}
                            styles={{
                                root: {
                                    minWidth: 40,
                                    height: 40,
                                    borderRadius: '10px',
                                    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f0f2f5',
                                }
                            }}
                        />
                    </div>
                    <div style={{ 
                        flex: 1,
                        // Single scroll owner: avoid nested scroll traps in modal
                        overflowY: 'auto',
                        padding: '0 64px 32px 64px',
                        minHeight: 0,
                    }}>
                        <div style={{
                            maxWidth: '1400px',
                            margin: '0 auto',
                            width: '100%',
                            height: '100%',
                        }}>
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
                    background: isDarkMode
                        ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #334155 65%, #475569 100%)'
                        : '#ffffff',
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
                animation: 'modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '32px 64px',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(0,0,0,0.06)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#fafbfc',
                }}>
                    <div style={{
                        maxWidth: '1400px',
                        margin: '0 auto',
                        width: '100%',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '24px',
                        }}>
                            <Text
                                variant="xxLarge"
                                style={{
                                    fontWeight: 700,
                                    color: isDarkMode ? '#ffffff' : '#000000',
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                Forms & Processes
                            </Text>
                            <ActionButton
                                iconProps={{ iconName: 'Cancel' }}
                                onClick={onDismiss}
                                styles={{
                                    root: {
                                        minWidth: 48,
                                        height: 48,
                                        borderRadius: '12px',
                                        backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f0f2f5',
                                    }
                                }}
                            />
                        </div>
                        
                        <SearchBox
                            placeholder="Search forms and processes..."
                            value={searchQuery}
                            onChange={(_, newValue) => setSearchQuery(newValue || '')}
                            styles={{
                                root: {
                                    maxWidth: '500px',
                                    borderRadius: '16px',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(0,0,0,0.06)'}`,
                                    backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : '#ffffff',
                                    boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(0,0,0,0.08)',
                                },
                                field: {
                                    backgroundColor: 'transparent',
                                    color: isDarkMode ? '#ffffff' : '#000000',
                                    fontSize: '16px',
                                    padding: '16px 20px',
                                },
                            }}
                        />
                    </div>
                </div>

                {/* Content */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: '32px 64px',
                }}>
                    <div style={{
                        maxWidth: '1400px',
                        margin: '0 auto',
                        width: '100%',
                    }}>
                        {/* Form Sections */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
                            {Object.entries(filteredSections).map(([sectionKey, forms]) => (
                                <div key={sectionKey}>
                                    <Text
                                        variant="xLarge"
                                        style={{
                                            fontWeight: 600,
                                            color: isDarkMode ? '#ffffff' : '#000000',
                                            marginBottom: '24px',
                                            display: 'block',
                                        }}
                                    >
                                        {sectionKey.replace('_', ' ')}
                                    </Text>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                                        gap: '20px',
                                        maxWidth: '100%',
                                    }}>
                                        {forms.map((form, index) => (
                                            <FormItemComponent
                                                key={form.title}
                                                item={form}
                                                index={index}
                                                onFormSelect={handleFormSelect}
                                                isDarkMode={isDarkMode}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default FormsModal;
