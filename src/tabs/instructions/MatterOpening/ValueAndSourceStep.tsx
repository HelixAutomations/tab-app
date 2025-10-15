//
import React from 'react'; // invisible change
// invisible change 2.2
import { Stack, TextField, mergeStyles } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import '../../../app/styles/MultiSelect.css';
import ModernMultiSelect from './ModernMultiSelect';
import { useTheme } from '../../../app/functionality/ThemeContext';

interface ValueAndSourceStepProps {
    disputeValue: string;
    setDisputeValue: (v: string) => void;
    source: string;
    setSource: (v: string) => void;
    referrerName: string;
    setReferrerName: (v: string) => void;
    onContinue?: () => void;
}

const disputeValueOptions = ['Less than £10k', '£10k - £500k', '£500k - £1m', '£1m - £5m', '£5 - £20m', '£20m+'];

const ValueAndSourceStep: React.FC<ValueAndSourceStepProps> = ({ 
    disputeValue, 
    setDisputeValue, 
    source, 
    setSource, 
    referrerName, 
    setReferrerName, 
    onContinue 
}) => {
    const { isDarkMode } = useTheme();
    
    // Professional theme colors
    const themeColours = {
        bg: isDarkMode 
            ? 'linear-gradient(135deg, #0B1220 0%, #1F2937 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: isDarkMode ? '#334155' : '#E2E8F0',
        text: isDarkMode ? '#E5E7EB' : '#0F172A',
        shadow: isDarkMode 
            ? '0 2px 4px rgba(0, 0, 0, 0.3)'
            : '0 2px 4px rgba(0, 0, 0, 0.04)',
        iconColor: colours.highlight // Use standard highlight color
    };

    return (
        <div style={{
            background: themeColours.bg,
            border: `1px solid ${themeColours.border}`,
            borderRadius: 12,
            padding: 20,
            boxShadow: themeColours.shadow,
            boxSizing: 'border-box'
        }}>
            <Stack tokens={{ childrenGap: 20 }}>
                {/* Dispute Value Section */}
                <div>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        marginBottom: 12 
                    }}>
                        <i className="ms-Icon ms-Icon--Money" style={{ 
                            fontSize: 16, 
                            color: themeColours.iconColor 
                        }} />
                        <span style={{ 
                            fontSize: 16, 
                            fontWeight: 600, 
                            color: themeColours.text 
                        }}>
                            Select Value of the Dispute
                        </span>
                    </div>
                    <ModernMultiSelect
                        label=""
                        options={disputeValueOptions.map(option => ({ key: option, text: option }))}
                        selectedValue={disputeValue}
                        onSelectionChange={setDisputeValue}
                        variant="grid"
                    />
                </div>

                {/* Source Selection */}
                <div>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        marginBottom: 12 
                    }}>
                        <i className="ms-Icon ms-Icon--UserFollowed" style={{ 
                            fontSize: 16, 
                            color: themeColours.iconColor 
                        }} />
                        <span style={{ 
                            fontSize: 16, 
                            fontWeight: 600, 
                            color: themeColours.text 
                        }}>
                            Select Source
                        </span>
                    </div>
                    <ModernMultiSelect
                        label=""
                        options={[
                            { key: 'search', text: 'Search' },
                            { key: 'referral', text: 'Referral' },
                            { key: 'your following', text: 'Your Following' },
                            { key: 'uncertain', text: 'Uncertain' }
                        ]}
                        selectedValue={source}
                        onSelectionChange={(value) => {
                            setSource(value);
                            if (value !== 'referral') setReferrerName('');
                        }}
                        variant="default"
                    />
                </div>

                {/* Referrer Name Field - only show if source is referral */}
                {source === 'referral' && (
                    <div>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            marginBottom: 8 
                        }}>
                            <i className="ms-Icon ms-Icon--Contact" style={{ 
                                fontSize: 16, 
                                color: themeColours.iconColor 
                            }} />
                            <span style={{ 
                                fontSize: 14, 
                                fontWeight: 600, 
                                color: themeColours.text 
                            }}>
                                Referrer Name
                            </span>
                        </div>
                        <TextField
                            placeholder="Enter referrer's name"
                            value={referrerName}
                            onChange={(_: any, newVal: string | undefined) => setReferrerName(newVal || '')}
                            styles={{ 
                                root: { width: '100%' },
                                fieldGroup: {
                                    border: `1px solid ${themeColours.border}`,
                                    borderRadius: 10,
                                    background: themeColours.bg,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                    transition: 'all 0.2s ease',
                                    ':hover': {
                                        borderColor: '#3690CE',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
                                    },
                                    ':focus-within': {
                                        borderColor: '#3690CE',
                                        boxShadow: '0 0 0 3px rgba(54, 144, 206, 0.1)'
                                    }
                                },
                                field: {
                                    padding: '12px 16px',
                                    fontSize: 14,
                                    fontWeight: 400
                                }
                            }}
                        />
                    </div>
                )}
            </Stack>
        </div>
    );
};

export default ValueAndSourceStep;
