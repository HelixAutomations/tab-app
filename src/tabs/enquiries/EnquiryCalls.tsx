import React from 'react';
import { Enquiry } from '../../app/functionality/types';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { FaPhone, FaInfoCircle } from 'react-icons/fa';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface EnquiryCallsProps {
    enquiry: Enquiry;
}

const EnquiryCalls: React.FC<EnquiryCallsProps> = ({ enquiry }) => {
    const { isDarkMode } = useTheme();
    
    return (
        <Stack tokens={{ childrenGap: 20 }} style={{ padding: '20px' }}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
                <FaPhone style={{ 
                    color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
                    fontSize: '18px'
                }} />
                <Text variant="xLarge" styles={{
                    root: {
                        fontWeight: '600',
                        color: isDarkMode ? colours.dark.text : colours.light.text
                    }
                }}>
                    Call History
                </Text>
            </Stack>
            
            <MessageBar messageBarType={MessageBarType.info}>
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                    <FaInfoCircle />
                    <Text>Call tracking is enabled in local development. CallRail integration coming soon.</Text>
                </Stack>
            </MessageBar>
            
            <Stack style={{ 
                padding: '16px',
                backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                borderRadius: '8px',
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
            }}>
                <Text variant="medium" styles={{
                    root: {
                        color: isDarkMode ? colours.dark.subText : colours.light.subText,
                        fontStyle: 'italic'
                    }
                }}>
                    Enquiry ID: {enquiry.ID}
                </Text>
                <Text variant="medium" styles={{
                    root: {
                        color: isDarkMode ? colours.dark.subText : colours.light.subText,
                        marginTop: '8px'
                    }
                }}>
                    This section will display call recordings, notes, and call analytics when CallRail integration is implemented.
                </Text>
            </Stack>
        </Stack>
    );
};

export default EnquiryCalls;