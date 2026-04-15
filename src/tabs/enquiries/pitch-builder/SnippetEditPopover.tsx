import React, { useState, useEffect, useMemo } from 'react';
import { colours } from '../../../app/styles/colours';
import { TextField } from '@fluentui/react/lib/TextField';
import type { ITextFieldStyles } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Icon } from '@fluentui/react/lib/Icon';
import { Callout, DirectionalHint } from '@fluentui/react/lib/Callout';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
import type { IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';
type SnippetEditPopoverProps = {
    target: HTMLElement;
    onSave: (data: { label: string; sortOrder: number; isNew: boolean }) => void;
    onDismiss: () => void;
    originalText: string;
    editedText: string;
};

const SnippetEditPopover: React.FC<SnippetEditPopoverProps> = ({ target, onSave, onDismiss, originalText, editedText }) => {
    const [label, setLabel] = useState('');
    const [sortOrder, setSortOrder] = useState<number>(0);
    const [mode, setMode] = useState<'edit' | 'create'>('edit');

    // Check if content has been modified
    const hasChanges = useMemo(() => {
        const cleanOriginal = (originalText || '').trim().replace(/\s+/g, ' ');
        const cleanEdited = (editedText || '').trim().replace(/\s+/g, ' ');
        return cleanOriginal !== cleanEdited && cleanEdited.length > 0;
    }, [originalText, editedText]);

    // Animation state for save button
    const [saveButtonAnimated, setSaveButtonAnimated] = useState(false);

    useEffect(() => {
        if (hasChanges && !saveButtonAnimated) {
            setSaveButtonAnimated(true);
        }
    }, [hasChanges, saveButtonAnimated]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDismiss();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onDismiss]);

    // Function to highlight differences
    const renderContentWithHighlights = (content: string, isOriginal: boolean) => {
        if (!hasChanges) {
            return <span>{content}</span>;
        }

        const originalWords = (originalText || '').split(/(\s+)/);
        const editedWords = (editedText || '').split(/(\s+)/);
        const wordsToRender = isOriginal ? originalWords : editedWords;
        const compareWords = isOriginal ? editedWords : originalWords;
        
        return (
            <span>
                {wordsToRender.map((word, index) => {
                    const isWhitespace = /^\s+$/.test(word);
                    if (isWhitespace) return word;
                    
                    const wordInCompare = compareWords.includes(word);
                    const isDifferent = !wordInCompare;
                    
                    if (isDifferent) {
                        return (
                            <span
                                key={index}
                                style={{
                                    backgroundColor: isOriginal ? '#ffebee' : '#e8f5e8',
                                    color: isOriginal ? '#c62828' : '#2e7d32',
                                    padding: '2px 4px',
                                    borderRadius: '3px',
                                    border: isOriginal ? '1px solid #ffcdd2' : '1px solid #c8e6c9',
                                    fontWeight: '500'
                                }}
                            >
                                {word}
                            </span>
                        );
                    }
                    return word;
                })}
            </span>
        );
    };

    const modeOptions: IChoiceGroupOption[] = [
        {
            key: 'edit',
            text: 'Update Existing Snippet',
            iconProps: { iconName: 'Edit' },
        },
        {
            key: 'create', 
            text: 'Create New Snippet',
            iconProps: { iconName: 'Add' },
        },
    ];

    const textFieldStyles: Partial<ITextFieldStyles> = {
        fieldGroup: {
            border: '1px solid #e1e5e9',
            borderRadius: '6px',
            backgroundColor: '#ffffff',
            minHeight: '40px',
            ':hover': {
                borderColor: colours.highlight,
            },
            ':focus-within': {
                borderColor: colours.highlight,
                boxShadow: '0 0 0 2px rgba(54, 144, 206, 0.2)',
            },
        },
        field: {
            fontSize: '14px',
            padding: '10px 14px',
            fontFamily: 'Raleway, sans-serif',
            lineHeight: '1.4',
        },
        root: {
            marginBottom: '20px',
        },
    };

    const getSortOrderPreview = (order: number): string => {
        if (order === 0) return "Default position";
        if (order < 0) return "Appears before default options";
        if (order > 0 && order <= 5) return "High priority (appears first)";
        if (order > 5 && order <= 10) return "Normal priority";
        return "Low priority (appears last)";
    };

    return (
        <>
            <style>
                {`
                    @keyframes fadeInSlide {
                        0% {
                            opacity: 0;
                            transform: translateX(-10px);
                        }
                        100% {
                            opacity: 1;
                            transform: translateX(0);
                        }
                    }
                    
                    @keyframes pulseGlow {
                        0%, 100% {
                            box-shadow: 0 0 0 0 rgba(0, 120, 212, 0.4);
                        }
                        50% {
                            box-shadow: 0 0 0 8px rgba(0, 120, 212, 0);
                        }
                    }
                `}
            </style>
            <Callout
            target={target}
            onDismiss={onDismiss}
            directionalHint={DirectionalHint.bottomLeftEdge}
            isBeakVisible={false}
            styles={{
                root: {
                    padding: '0',
                    borderRadius: '12px',
                    boxShadow: '0 16px 64px rgba(0, 0, 0, 0.15)',
                    border: '1px solid #e1e5e9',
                    backgroundColor: '#ffffff',
                    fontFamily: 'Raleway, sans-serif',
                    width: '70vw',
                    maxWidth: '1000px',
                    minWidth: '600px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                },
            }}
        >
            <div style={{ padding: '32px' }}>
                {/* Header */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginBottom: '24px',
                    paddingBottom: '16px',
                    borderBottom: '2px solid #f3f2f1'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            backgroundColor: '#e6f3ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Icon 
                                iconName="Save" 
                                styles={{ 
                                    root: { 
                                        fontSize: '20px', 
                                        color: colours.highlight,
                                    } 
                                }} 
                            />
                        </div>
                        <div>
                            <Text styles={{ 
                                root: { 
                                    fontSize: '24px', 
                                    fontWeight: '700',
                                    color: '#323130',
                                    margin: '0',
                                    lineHeight: '1.2'
                                } 
                            }}>
                                Save Custom Snippet
                            </Text>
                            <Text styles={{ 
                                root: { 
                                    fontSize: '14px', 
                                    color: '#666',
                                    margin: '0',
                                    lineHeight: '1.2'
                                } 
                            }}>
                                Choose how to save your customized snippet for future use
                            </Text>
                        </div>
                    </div>
                    <Icon 
                        iconName="Cancel" 
                        onClick={onDismiss}
                        styles={{ 
                            root: { 
                                fontSize: '16px', 
                                color: '#666',
                                cursor: 'pointer',
                                padding: '12px',
                                borderRadius: '8px',
                                ':hover': {
                                    backgroundColor: '#f3f2f1',
                                    color: colours.cta,
                                }
                            } 
                        }} 
                    />
                </div>

                {/* Mode Selection */}
                <div style={{ marginBottom: '32px' }}>
                    <Text styles={{
                        root: {
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#323130',
                            marginBottom: '12px',
                            display: 'block',
                        }
                    }}>
                        What would you like to do?
                    </Text>
                    <ChoiceGroup
                        options={modeOptions}
                        selectedKey={mode}
                        onChange={(_, option) => setMode(option?.key as 'edit' | 'create')}
                        styles={{
                            flexContainer: {
                                display: 'flex',
                                gap: '16px',
                            },
                            root: {
                                marginBottom: '0',
                            }
                        }}
                    />
                </div>

                {/* Content Comparison */}
                <div style={{ marginBottom: '32px' }}>
                    <Text styles={{
                        root: {
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#323130',
                            marginBottom: '16px',
                            display: 'block',
                        }
                    }}>
                        Content Preview
                        {!hasChanges && (
                            <span style={{
                                fontSize: '14px',
                                fontWeight: '400',
                                color: colours.cta,
                                marginLeft: '12px',
                                padding: '4px 8px',
                                backgroundColor: '#fdf3e7',
                                borderRadius: '4px',
                                border: '1px solid #f9e2af'
                            }}>
                                No changes detected
                            </span>
                        )}
                        {hasChanges && (
                            <span style={{
                                fontSize: '14px',
                                fontWeight: '400',
                                color: '#2e7d32',
                                marginLeft: '12px',
                                padding: '4px 8px',
                                backgroundColor: '#e8f5e8',
                                borderRadius: '4px',
                                border: '1px solid #c8e6c9',
                                animation: 'fadeInSlide 0.3s ease-out'
                            }}>
                                ✓ Changes detected
                            </span>
                        )}
                    </Text>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                marginBottom: '8px' 
                            }}>
                                <Icon iconName="FileTemplate" styles={{ root: { fontSize: '14px', color: '#666' } }} />
                                <Text styles={{
                                    root: {
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: '#666',
                                    }
                                }}>
                                    Original Template
                                </Text>
                            </div>
                            <div style={{
                                fontSize: '13px',
                                color: '#666',
                                lineHeight: '1.5',
                                padding: '16px',
                                backgroundColor: '#f8f9fa',
                                borderRadius: '8px',
                                border: '1px solid #e1e5e9',
                                whiteSpace: 'pre-wrap',
                                maxHeight: '150px',
                                overflowY: 'auto',
                                fontFamily: 'Raleway, sans-serif',
                            }}>
                                {originalText ? renderContentWithHighlights(originalText, true) : 'No original content available'}
                            </div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                marginBottom: '8px' 
                            }}>
                                <Icon iconName="EditNote" styles={{ root: { fontSize: '14px', color: colours.highlight } }} />
                                <Text styles={{
                                    root: {
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: colours.highlight,
                                    }
                                }}>
                                    Your Customized Version
                                </Text>
                            </div>
                            <div style={{
                                fontSize: '13px',
                                color: '#333',
                                lineHeight: '1.5',
                                padding: '16px',
                                backgroundColor: hasChanges ? '#f0f8ff' : '#f8f9fa',
                                borderRadius: '8px',
                                border: hasChanges ? '1px solid #b3d9ff' : '1px solid #e1e5e9',
                                whiteSpace: 'pre-wrap',
                                maxHeight: '150px',
                                overflowY: 'auto',
                                fontFamily: 'Raleway, sans-serif',
                                transition: 'all 0.3s ease-out'
                            }}>
                                {editedText ? renderContentWithHighlights(editedText, false) : 'No customized content available'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form Fields */}
                <Stack tokens={{ childrenGap: 0 }}>
                    <div>
                        <Text styles={{ 
                            root: { 
                                fontSize: '16px', 
                                fontWeight: '600',
                                color: '#323130',
                                marginBottom: '8px',
                                display: 'block',
                            } 
                        }}>
                            Snippet Label *
                        </Text>
                        <Text styles={{ 
                            root: { 
                                fontSize: '13px', 
                                color: '#666',
                                marginBottom: '12px',
                                display: 'block',
                            } 
                        }}>
                            {mode === 'edit' ? 'Update the label for this existing snippet' : 'Enter a descriptive name for your new snippet'}
                        </Text>
                        <TextField
                            placeholder={mode === 'edit' ? 'Updated snippet name' : 'My custom snippet'}
                            value={label}
                            onChange={(_, v) => setLabel(v || '')}
                            styles={textFieldStyles}
                        />
                    </div>

                    <div>
                        <Text styles={{ 
                            root: { 
                                fontSize: '16px', 
                                fontWeight: '600',
                                color: '#323130',
                                marginBottom: '8px',
                                display: 'block',
                            } 
                        }}>
                            Display Order
                        </Text>
                        <Text styles={{ 
                            root: { 
                                fontSize: '13px', 
                                color: '#666',
                                marginBottom: '12px',
                                display: 'block',
                            } 
                        }}>
                            Controls where this snippet appears in the list. Preview: <strong>{getSortOrderPreview(sortOrder)}</strong>
                        </Text>
                        <TextField
                            type="number"
                            placeholder="0"
                            value={String(sortOrder)}
                            onChange={(_, v) => setSortOrder(Number(v) || 0)}
                            styles={textFieldStyles}
                        />
                        <div style={{ 
                            fontSize: '12px', 
                            color: '#666', 
                            marginTop: '8px',
                            padding: '8px 12px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '4px',
                            border: '1px solid #e1e5e9'
                        }}>
                            <strong>Tip:</strong> Use 1-5 for high priority, 6-10 for normal priority, higher numbers for lower priority
                        </div>
                    </div>
                </Stack>

                <div style={{
                    padding: '16px',
                    backgroundColor: hasChanges ? '#fff8e1' : '#f8f9fa',
                    borderRadius: '8px',
                    border: hasChanges ? '1px solid #ffcc02' : '1px solid #e1e5e9',
                    marginBottom: '24px',
                    transition: 'all 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <Icon iconName={hasChanges ? "Info" : "Warning"} styles={{ 
                            root: { 
                                fontSize: '16px', 
                                color: hasChanges ? '#ff8c00' : '#666', 
                                marginTop: '2px' 
                            } 
                        }} />
                        <div>
                            <Text styles={{
                                root: {
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: hasChanges ? '#ff8c00' : '#666',
                                    marginBottom: '4px',
                                    display: 'block',
                                }
                            }}>
                                {hasChanges ? 'Approval Required' : 'No Changes to Save'}
                            </Text>
                            <Text styles={{
                                root: {
                                    fontSize: '13px',
                                    color: '#666',
                                    lineHeight: '1.4'
                                }
                            }}>
                                {hasChanges 
                                    ? (mode === 'edit' 
                                        ? 'Your changes will be submitted for review before being applied to the existing snippet.'
                                        : 'Your new snippet will be reviewed and approved before being added to the template library.')
                                    : 'Make changes to the content before saving. Your edits will be highlighted for review.'
                                }
                            </Text>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid #e1e5e9'
                }}>
                    <Text styles={{
                        root: {
                            fontSize: '12px',
                            color: '#666',
                        }
                    }}>
                        * Required fields
                    </Text>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <DefaultButton
                            text="Cancel"
                            styles={{
                                root: {
                                    backgroundColor: '#ffffff',
                                    border: '1px solid #e1e5e9',
                                    borderRadius: '6px',
                                    fontWeight: '500',
                                    fontSize: '14px',
                                    padding: '10px 24px',
                                    fontFamily: 'Raleway, sans-serif',
                                    color: '#666',
                                    minWidth: '100px',
                                    height: '40px'
                                },
                                rootHovered: {
                                    backgroundColor: '#f8f9fa',
                                    borderColor: colours.highlight,
                                    color: colours.highlight,
                                },
                            }}
                            onClick={onDismiss}
                        />
                        <PrimaryButton
                            text={mode === 'edit' ? 'Submit Changes' : 'Submit New Snippet'}
                            styles={{
                                root: {
                                    backgroundColor: hasChanges ? colours.highlight : '#d1d1d1',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    padding: '10px 24px',
                                    fontFamily: 'Raleway, sans-serif',
                                    minWidth: '160px',
                                    height: '40px',
                                    transform: saveButtonAnimated && hasChanges ? 'scale(1.05)' : 'scale(1)',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    cursor: hasChanges ? 'pointer' : 'not-allowed',
                                    opacity: hasChanges ? 1 : 0.6,
                                },
                                rootHovered: hasChanges ? {
                                    backgroundColor: '#106ebe',
                                    transform: 'scale(1.02)',
                                } : {
                                    backgroundColor: '#d1d1d1',
                                    transform: 'scale(1)',
                                },
                                rootPressed: hasChanges ? {
                                    backgroundColor: '#005a9e',
                                    transform: 'scale(0.98)',
                                } : {
                                    backgroundColor: '#d1d1d1',
                                    transform: 'scale(1)',
                                },
                            }}
                            onClick={() => hasChanges && onSave({ label, sortOrder, isNew: mode === 'create' })}
                            disabled={!label.trim() || !hasChanges}
                        />
                    </div>
                </div>
            </div>
        </Callout>
        </>
    );
};

export default SnippetEditPopover;
