import React from 'react';
import { DetailsList, DetailsListLayoutMode } from '@fluentui/react/lib/DetailsList';
import type { IColumn } from '@fluentui/react/lib/DetailsList';
import { Stack } from '@fluentui/react/lib/Stack';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Enquiry } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface EnquiryDataProps {
    enquiry: Enquiry;
}

const flattenObject = (obj: any, prefix = ''): { key: string; value: any }[] => {
    let result: { key: string; value: any }[] = [];
    for (const [k, v] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${k}` : k;
// invisible change
        if (v && typeof v === 'object' && !Array.isArray(v))
            result = result.concat(flattenObject(v, newKey));
        else result.push({ key: newKey, value: v });
    }
    return result;
};

const transformEnquiry = (enq: Enquiry): { key: string; value: string }[] => {
    const flattened = flattenObject(enq);
    return flattened.map(({ key, value }) => ({
        key,
        value: value === undefined || value === null ? '' : String(value),
    }));
};

const createColumns = (isDarkMode: boolean): IColumn[] => [
    {
        key: 'key',
        name: 'Field',
        fieldName: 'key',
        minWidth: 150,
        maxWidth: 250,
        isResizable: true,
        styles: { root: { color: isDarkMode ? colours.dark.text : colours.light.text } },
    },
    {
        key: 'value',
        name: 'Value',
        fieldName: 'value',
        minWidth: 200,
        maxWidth: 600,
        isResizable: true,
        styles: { root: { color: isDarkMode ? colours.dark.text : colours.light.text } },
    },
];

const EnquiryData: React.FC<EnquiryDataProps> = ({ enquiry }) => {
    const { isDarkMode } = useTheme();
    const items = transformEnquiry(enquiry);

    return (
        <Stack
            styles={{
                root: {
                    padding: '20px',
                    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                },
            }}
        >
            <DetailsList
                items={items}
                columns={createColumns(isDarkMode)}
                setKey="enquiryData"
                layoutMode={DetailsListLayoutMode.justified}
                isHeaderVisible={false}
                styles={{
                    root: {
                        selectors: {
                            '.ms-DetailsRow': { padding: '8px 0', borderBottom: 'none' },
                            '.ms-DetailsHeader': { display: 'none' },
                        },
                    },
                }}
            />
        </Stack>
    );
};

export default EnquiryData;
