//
import React from 'react'; // invisible change
// invisible change 2.2
import { Stack } from '@fluentui/react/lib/Stack';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { Text } from '@fluentui/react/lib/Text';
import { sharedPrimaryButtonStyles } from '../../../app/styles/ButtonStyles';
import '../../../app/styles/MultiSelect.css';
import ModernMultiSelect from './ModernMultiSelect';

interface SourceStepProps {
    source: string;
    setSource: (v: string) => void;
    referrerName: string;
    setReferrerName: (v: string) => void;
    onContinue?: () => void;
}

const sourceOptions = ['referral', 'organic search', 'paid search', 'your following', 'tbc'];

const SourceStep: React.FC<SourceStepProps> = ({ source, setSource, referrerName, setReferrerName, onContinue }) => (
    <Stack tokens={{ childrenGap: 12 }}>
        <ModernMultiSelect
            label="Select Source"
            options={sourceOptions.map(option => ({ 
                key: option, 
                text: option.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
            }))}
            selectedValue={source}
            onSelectionChange={(value) => {
                setSource(value);
                if (value !== 'referral') setReferrerName('');
            }}
            variant="default"
        />
        {source === 'referral' && (
            <TextField
                placeholder="Enter referrer's name"
                value={referrerName}
                onChange={(_, newVal) => setReferrerName(newVal || '')}
                styles={{ root: { width: '100%', maxWidth: 400, margin: '0 auto' } }}
            />
        )}
        {onContinue && (
            <PrimaryButton
                text="Continue"
                onClick={onContinue}
                disabled={source === 'referral' && !referrerName.trim()}
                styles={sharedPrimaryButtonStyles}
            />
        )}
    </Stack>
);

export default SourceStep;