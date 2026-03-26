// src/tabs/matters/POIDPreview.tsx
// invisible change 2.1
//
import React from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { POID } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';

const fieldTagStyle = mergeStyles({
    backgroundColor: '#f3f2f1',
    border: '1px solid #e1dfdd',
    borderRadius: '0px',
    padding: '4px 8px',
    display: 'inline-flex',
    alignItems: 'center',
    marginRight: '6px',
    marginBottom: '6px',
});
const fieldLabelStyle = mergeStyles({ fontWeight: 600, marginRight: '4px' });
const fieldValueStyle = mergeStyles({
    color: '#333',
    wordBreak: 'break-word',
    maxWidth: '100%',
});
const linkStyle = mergeStyles({
    color: colours.highlight,
    textDecoration: 'underline',
});

const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString();
};

interface POIDPreviewProps {
    poid: POID;
}

const POIDPreview: React.FC<POIDPreviewProps> = ({ poid }) => {
    const sections = [
        {
            title: 'Identity Info',
            fields: [
                { key: 'poid_id', label: 'POID ID' },
                { key: 'type', label: 'Type' },
                { key: 'terms_acceptance', label: 'Terms' },
                { key: 'check_result', label: 'Result' },
                { key: 'check_id', label: 'Check ID' },
                { key: 'stage', label: 'Stage' },
            ],
        },
        {
            title: 'Personal Info',
            fields: [
                { key: 'prefix', label: 'Prefix' },
                { key: 'first', label: 'First Name' },
                { key: 'last', label: 'Last Name' },
                { key: 'gender', label: 'Gender' },
                { key: 'date_of_birth', label: 'DOB' },
                { key: 'nationality', label: 'Nationality' },
                { key: 'nationality_iso', label: 'ISO' },
            ],
        },
        {
            title: 'Contact Info',
            fields: [
                { key: 'best_number', label: 'Phone' },
                { key: 'email', label: 'Email' },
                { key: 'poc', label: 'POC' },
            ],
        },
        {
            title: 'Document Info',
            fields: [
                { key: 'submission_url', label: 'Submission URL' },
                { key: 'submission_date', label: 'Submission Date' },
                { key: 'id_docs_folder', label: 'Docs Folder' },
                { key: 'additional_id_submission_id', label: 'Addl ID' },
                { key: 'additional_id_submission_url', label: 'Addl URL' },
                { key: 'additional_id_submission_date', label: 'Addl Date' },
            ],
        },
        {
            title: 'Address',
            fields: [
                { key: 'house_building_number', label: 'House/Building' },
                { key: 'street', label: 'Street' },
                { key: 'city', label: 'City' },
                { key: 'county', label: 'County' },
                { key: 'post_code', label: 'Post Code' },
                { key: 'country', label: 'Country' },
                { key: 'country_code', label: 'Country Code' },
            ],
        },
        {
            title: 'Company Info',
            fields: [
                { key: 'company_name', label: 'Company Name' },
                { key: 'company_number', label: 'Company Number' },
                { key: 'company_house_building_number', label: 'Building' },
                { key: 'company_street', label: 'Street' },
                { key: 'company_city', label: 'City' },
                { key: 'company_county', label: 'County' },
                { key: 'company_post_code', label: 'Post Code' },
                { key: 'company_country', label: 'Country' },
                { key: 'company_country_code', label: 'Code' },
            ],
        },
        {
            title: 'Other Info',
            fields: [
                { key: 'client_id', label: 'Client ID' },
                { key: 'related_client_id', label: 'Related Client' },
                { key: 'matter_id', label: 'Matter ID' },
                { key: 'risk_assessor', label: 'Risk Assessor' },
                { key: 'risk_assessment_date', label: 'Risk Date' },
            ],
        },
    ];

    // Keys for date fields.
    const dateKeys = new Set([
        'submission_date',
        'additional_id_submission_date',
        'date_of_birth',
        'risk_assessment_date',
    ]);

    // Keys for URL fields.
    const linkKeys = new Set([
        'submission_url',
        'id_docs_folder',
        'additional_id_submission_url',
    ]);

    // Map each URL field to a static display label.
    const linkLabels: { [key: string]: string } = {
        submission_url: 'Open Submission',
        id_docs_folder: 'Open Folder',
        additional_id_submission_url: 'Open Additional',
    };

    return (
        <Stack tokens={{ childrenGap: 16 }}>
            <Text variant="xLarge" styles={{ root: { marginBottom: 10 } }}>Preview</Text>
            {sections.map((section) => (
                <Stack key={section.title} tokens={{ childrenGap: 8 }}>
                    <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, borderBottom: '1px solid #e1dfdd', paddingBottom: 4 } }}>
                        {section.title}
                    </Text>
                    <Stack tokens={{ childrenGap: 4 }} horizontal wrap>
                        {section.fields.map(({ key, label }) => {
                            const rawValue = poid[key as keyof POID];
                            if (!rawValue) return null;

                            const displayValue = dateKeys.has(key)
                                ? formatDateTime(String(rawValue))
                                : String(rawValue);

                            if (linkKeys.has(key)) {
                                return (
                                    <div key={key} className={fieldTagStyle}>
                                        <span className={fieldLabelStyle}>{label}:</span>
                                        <a
                                            href={String(rawValue)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={linkStyle}
                                        >
                                            {linkLabels[key] || 'Open Link'}
                                        </a>
                                    </div>
                                );
                            }
                            return (
                                <div key={key} className={fieldTagStyle}>
                                    <span className={fieldLabelStyle}>{label}:</span>
                                    <span className={fieldValueStyle}>{displayValue}</span>
                                </div>
                            );
                        })}
                    </Stack>
                </Stack>
            ))}
        </Stack>
    );
};

export default POIDPreview;
