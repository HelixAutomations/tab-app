import React, { useState } from 'react';
// invisible change 2.1
//
import { Stack } from '@fluentui/react/lib/Stack';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { Text } from '@fluentui/react/lib/Text';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { POID } from '../../app/functionality/types';
import { dashboardTokens, cardStyles } from './componentTokens';
import { sharedDecisionButtonStyles, sharedPrimaryButtonStyles } from '../../app/styles/ButtonStyles';
import PoidPreview from './PoidPreview';
import '../../app/styles/MatterOpeningCard.css';

interface EIDCheckPageProps {
    poidData: POID[];
    instruction?: any;
    onBack: () => void;
}

const EIDCheckPage: React.FC<EIDCheckPageProps> = ({ poidData, instruction, onBack }) => {
    const [mode, setMode] = useState<'choice' | 'manual' | 'existing'>(instruction ? 'manual' : 'choice');

    const [identifier, setIdentifier] = useState('');
    const [email, setEmail] = useState(instruction?.Email ?? '');
    const [prospect, setProspect] = useState<POID | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const [selectedId, setSelectedId] = useState<string | undefined>();

    const fetchProspect = async () => {
        setLoading(true);
        await new Promise((res) => setTimeout(res, 600));
        const found = poidData.find(
            (p) => p.poid_id === identifier || p.email?.toLowerCase() === email.toLowerCase()
        );
        setProspect(
            found || {
                poid_id: identifier,
                first: 'Demo',
                last: 'User',
                email,
            } as POID
        );
        setLoading(false);
        setConfirmed(false);
    };

    const selectedPoid = poidData.find((p) => p.poid_id === selectedId);

    const canFetch = identifier.trim() !== '' || email.trim() !== '';
    const canStart = mode === 'manual' ? confirmed && prospect : mode === 'existing' ? !!selectedPoid : false;

    return (
        <Stack tokens={dashboardTokens} className="workflow-container">
            <div className="workflow-main matter-opening-card">
                <div className="step-header">
                    <h3 className="step-title">Verify an ID</h3>
                </div>
                <div className="step-content">
                    <Stack tokens={{ childrenGap: 16 }}>

                    {mode === 'choice' && (
                        <Stack horizontal tokens={{ childrenGap: 16 }} horizontalAlign="center">
                            <PrimaryButton
                                text="Use Existing"
                                onClick={() => setMode('existing')}
                                styles={sharedDecisionButtonStyles}
                            />
                            <PrimaryButton
                                text="Manual Entry"
                                onClick={() => setMode('manual')}
                                styles={sharedDecisionButtonStyles}
                            />
                        </Stack>
                    )}

                    {mode === 'manual' && (
                        <>
                            <Stack tokens={{ childrenGap: 8 }} style={{ maxWidth: 300 }}>
                                <TextField
                                    label="Identifier"
                                    value={identifier}
                                    onChange={(_, v) => setIdentifier(v || '')}
                                />
                                <TextField
                                    label="Email Address"
                                    value={email}
                                    onChange={(_, v) => setEmail(v || '')}
                                />
                                <PrimaryButton
                                    text="Fetch Details"
                                    onClick={fetchProspect}
                                    disabled={!canFetch || loading}
                                    styles={sharedPrimaryButtonStyles}
                                />
                            </Stack>
                            {prospect && (
                                <Stack tokens={{ childrenGap: 8 }} styles={cardStyles}>
                                    <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
                                        Prospect Details
                                    </Text>
                                    <ul className="detail-list">
                                        {prospect.poid_id && (
                                            <li>
                                                <strong>ID:</strong> {prospect.poid_id}
                                            </li>
                                        )}
                                        {(prospect.first || prospect.last) && (
                                            <li>
                                                <strong>Name:</strong> {`${prospect.first ?? ''} ${prospect.last ?? ''}`.trim()}
                                            </li>
                                        )}
                                        {prospect.email && (
                                            <li>
                                                <strong>Email:</strong> {prospect.email}
                                            </li>
                                        )}
                                    </ul>
                                    <Checkbox
                                        label="This is the correct person"
                                        checked={confirmed}
                                        onChange={(_, c) => setConfirmed(!!c)}
                                    />
                                </Stack>
                            )}
                        </>
                    )}

                    {mode === 'existing' && (
                        <>
                            <Dropdown
                                placeholder="Select submission..."
                                options={poidData.map((p) => ({
                                    key: p.poid_id,
                                    text: `${p.first ?? ''} ${p.last ?? ''}`.trim() || p.poid_id,
                                })) as IDropdownOption[]}
                                selectedKey={selectedId}
                                onChange={(_, o) => setSelectedId(o?.key as string)}
                                styles={{ root: { maxWidth: 300 } }}
                            />
                            {selectedPoid && (
                                <Stack tokens={{ childrenGap: 8 }} styles={cardStyles}>
                                    <PoidPreview poid={selectedPoid} />
                                    {(selectedPoid as any).check_id && (
                                        <Text styles={{ root: { fontWeight: 600 } }}>
                                            Existing ID verification found.
                                        </Text>
                                    )}
                                </Stack>
                            )}
                        </>
                    )}

                    {mode !== 'choice' && (
                        <PrimaryButton
                            text="Start Check"
                            disabled={!canStart}
                            styles={sharedPrimaryButtonStyles}
                        />
                    )}
                </Stack>
                </div>
            </div>
        </Stack>
    );
};

export default EIDCheckPage;
