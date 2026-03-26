import React from 'react';
// invisible change 2
import { Stack } from '@fluentui/react/lib/Stack';
import { DefaultButton } from '@fluentui/react/lib/Button';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { colours } from '../app/styles/colours';

interface Option {
    key: string | number;
    text: string;
}

interface BigOptionGroupProps {
    label: string;
    options: Option[];
    selectedKey: string | number | undefined;
    onChange: (key: string | number, text: string) => void;
}

const buttonStyles = (selected: boolean, prefilled: boolean): IButtonStyles => {
    // If prefilled, always use selected style
    const isActive = selected || prefilled;
    return {
        root: {
            width: 180,
            height: 96,
            borderRadius: 0,
            border: `1px solid ${isActive ? colours.highlight : '#ccc'}`,
            background: isActive ? colours.highlight : '#fff',
            color: isActive ? '#fff' : '#000',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            fontSize: 14,
            margin: 0,
        },
        rootHovered: {
            background: isActive ? colours.highlight : colours.grey,
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
        },
        rootPressed: {
            background: isActive ? colours.highlight : '#e5e5e5',
            boxShadow: 'inset 0 0 4px rgba(0,0,0,0.3)',
            transform: 'translateY(1px)',
        },
        label: { fontWeight: 600 },
    };
};

// Helper: treat any non-empty selectedKey as prefilled (for initial render)
const isPrefilled = (selectedKey: string | number | undefined) => {
    if (selectedKey === undefined || selectedKey === null) return false;
    if (typeof selectedKey === 'number') return selectedKey !== 0;
    if (typeof selectedKey === 'string') return selectedKey !== '' && selectedKey !== '0';
    return false;
};

const BigOptionGroup: React.FC<BigOptionGroupProps> = ({ label, options, selectedKey, onChange }) => (
    <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 16 } }}>
        <label style={{ fontWeight: 600 }}>{label}</label>
        <Stack horizontal wrap horizontalAlign="center" tokens={{ childrenGap: 12 }}>
            {options.map((o) => (
                <DefaultButton
                    key={o.key}
                    text={o.text}
                    styles={buttonStyles(o.key === selectedKey, isPrefilled(selectedKey))}
                    onClick={() => onChange(o.key, o.text)}
                />
            ))}
        </Stack>
    </Stack>
);

export default BigOptionGroup;
