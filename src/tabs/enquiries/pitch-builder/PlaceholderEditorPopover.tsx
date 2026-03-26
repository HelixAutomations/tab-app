import React, { useState, useEffect } from 'react';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Stack } from '@fluentui/react/lib/Stack';
import PopoverContainer from '../../../components/PopoverContainer';
import '../../../app/styles/PlaceholderEditorPopover.css';

type PlaceholderEditorPopoverProps = {
    target: HTMLElement;
    initialText: string;
    before: string;
    after: string;
    /** Callback when the user wants to save this text as an option */
    onAddOption: (text: string) => void;
    onSave: (text: string) => void;
    onDismiss: () => void;
};

const PlaceholderEditorPopover: React.FC<PlaceholderEditorPopoverProps> = ({
    target,
    initialText,
    before,
// invisible change
    after,
    onAddOption,
    onSave,
    onDismiss,
}) => {
    const [value, setValue] = useState(initialText);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDismiss();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onDismiss]);

    const content = (
        <Stack tokens={{ childrenGap: 12 }} styles={{ root: { padding: '16px 20px' } }}>
            <span className="placeholder-context">{before}</span>
            <TextField
                value={value}
                onChange={(_, v) => setValue(v || '')}
                autoFocus
                multiline
                autoAdjustHeight
                styles={{
                    fieldGroup: {
                        border: '1px solid #ccc',
                        borderRadius: 0,
                        backgroundColor: '#ffffff',
                    },
                    field: {
                        fontSize: 16,
                        padding: '12px 16px',
                        fontWeight: 400,
                        borderRadius: 0,
                        boxShadow: 'none',
                    },
                }}
            />
            <span className="placeholder-context">{after}</span>
            <Stack horizontal horizontalAlign="space-between">
                <DefaultButton
                    text="Add Option"
                    onClick={() => onAddOption(value)}
                />
                <PrimaryButton
                    text="Save"
                    styles={{
                        root: {
                            padding: '12px 28px',
                            fontSize: 14,
                            fontWeight: 600,
                            borderRadius: 0,
                        },
                        label: { textTransform: 'none' },
                    }}
                    onClick={() => onSave(value)}
                />
            </Stack>
        </Stack>
    );

    return (
        <PopoverContainer target={target} onDismiss={onDismiss} width={700} className="placeholder-editor-modal">
            {content}
        </PopoverContainer>
    );
};

export default PlaceholderEditorPopover;
