
import React from 'react';
import {
    Stack,
    Text,
    Icon,
    mergeStyles,
    TooltipHost,
    DirectionalHint,
} from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';

interface PaymentPreviewProps {
    initialScopeDescription: string; // renamed from serviceDescription
    amount: string;
    includeVat?: boolean; // optional, defaults to true for backwards compatibility
}

function formatCurrency(val: number): string {
// invisible change
    if (isNaN(val) || val === 0) return '£0.00';
    return val.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

const PaymentPreview: React.FC<PaymentPreviewProps> = ({ initialScopeDescription, amount, includeVat = true }) => {
    const { isDarkMode } = useTheme();

    const containerClass = mergeStyles({
        background: '#ffffff',
        border: `1px solid ${colours.light.border}`,
        borderRadius: 0,
        padding: 12,
        fontFamily: 'monospace',
        fontSize: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: '100%',
    });

    const iconClass = mergeStyles({
        color: colours.greyText,
        marginLeft: 6,
        fontSize: 16,
        cursor: 'pointer',
    });

    const headerClass = mergeStyles({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    });

    const num = parseFloat(amount.replace(/,/g, ''));
    const finalAmount = !isNaN(num) ? (includeVat ? num * 1.2 : num) : NaN;
    const formattedAmount = isNaN(finalAmount) ? '' : formatCurrency(finalAmount);
    const vatText = includeVat ? 'inc. VAT' : 'exc. VAT';
    const tooltipText = 'Read-only preview showing wording and payment details for verification.';
    const desc = initialScopeDescription || '[Initial scope description]';

    return (
        <Stack tokens={{ childrenGap: 6 }} className={containerClass}>
            <div className={headerClass}>
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
                    <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
                        Payment Preview
                    </Text>
                    <Icon iconName="Lock" className={iconClass} aria-label="Locked preview" />
                </Stack>
                <TooltipHost
                    content={tooltipText}
                    directionalHint={DirectionalHint.bottomAutoEdge}
                    calloutProps={{ directionalHintFixed: true, gapSpace: 8 }}
                >
                    <Icon iconName="Info" className={iconClass} aria-label="Info" />
                </TooltipHost>
            </div>
            <Text
                variant="small"
                styles={{
                    root: {
                        color: isDarkMode ? colours.dark.text : colours.greyText,
                        fontStyle: 'italic',
                        marginBottom: 4,
                    },
                }}
            >
                Read-only preview
            </Text>
            <Text>
                {`Please pay ${formattedAmount} on account of costs, using our account details below:`}
            </Text>
            <Text>{`The fee is ${formattedAmount} ${vatText} for ${desc}.`}</Text>
        </Stack>
    );
};

export default PaymentPreview;
