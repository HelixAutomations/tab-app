import React, { useState, useMemo, useEffect } from 'react';
import { Stack, PrimaryButton, Dropdown, IDropdownOption, TextField, Label, DefaultButton, MessageBar, MessageBarType, FontIcon, Panel } from '@fluentui/react';
import { useParams } from 'react-router-dom';
import { InstructionData, CCLJson, UserData } from '../../app/functionality/types';
import { schema as cclSchema, tokens as cclTokens } from '../../app/functionality/cclSchema';
import localUserData from '../../localData/localUserData.json';
import { dashboardTokens } from './componentTokens';
import '../../app/styles/MatterOpeningCard.css';

interface DocumentEditorPageProps {
    onBack?: () => void;
    instruction?: any;
    instructions?: InstructionData[];
    matterId?: string;
}

interface DocumentData {
    content: string;
    cclFields: Record<string, string>;
    placeholders: Record<string, string>;
    email: {
        to: string;
        cc: string;
        bcc: string;
        subject: string;
    };
}

const PLACEHOLDER_REGEX = /\{\{(.*?)\}\}/g;

// Utility function to flatten nested objects for API compatibility
const flattenObject = (obj: any): Record<string, any> => {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const inner = flattenObject(v);
            for (const [ik, iv] of Object.entries(inner)) {
                res[`${k}.${ik}`] = iv;
            }
        } else {
            res[k] = v;
        }
    }
    return res;
};

const DocumentEditorPage: React.FC<DocumentEditorPageProps> = ({
    onBack,
    instruction,
    instructions,
    matterId: propMatterId
}) => {
    const params = useParams();
    const matterId = propMatterId || params.matterId;
    
    const [selectedRef, setSelectedRef] = useState<string>(
        instruction?.InstructionRef || ''
    );
    const [selectedInstruction, setSelectedInstruction] = useState<any>(instruction);
    const [confirmed, setConfirmed] = useState<boolean>(
        true // Always start confirmed - we'll handle instruction selection differently
    );
    const [documentData, setDocumentData] = useState<DocumentData>({
        content: '',
        cclFields: { ...cclSchema },
        placeholders: {},
        email: {
            to: '',
            cc: '',
            bcc: '',
            subject: ''
        }
    });
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: MessageBarType } | null>(null);
    const [cclPanelOpen, setCclPanelOpen] = useState(false);
    const [generatedUrl, setGeneratedUrl] = useState<string>('');
    const [editMode, setEditMode] = useState<'content' | 'ccl'>('content');

    const currentUser: UserData | undefined = (localUserData as UserData[])[0];
    const canGenerate = currentUser?.Role === 'Partner' || currentUser?.Role === 'Senior Partner';

    // Extract placeholders from content
    const placeholders = useMemo(
        () => Array.from(new Set(Array.from(documentData.content.matchAll(PLACEHOLDER_REGEX)).map(m => m[1]))),
        [documentData.content]
    );

    // Generate preview with placeholders replaced
    const preview = useMemo(() => {
        let p = documentData.content;
        placeholders.forEach(ph => {
            const val = documentData.placeholders[ph] || `{{${ph}}}`;
            p = p.replace(new RegExp(`\\{\\{${ph}\\}\\}`, 'g'), val);
        });
        return p;
    }, [documentData.content, placeholders, documentData.placeholders]);

    // Check if all placeholders are filled
    const allPlaceholdersFilled = useMemo(
        () => placeholders.every(ph => (documentData.placeholders[ph] ?? '') !== ''),
        [placeholders, documentData.placeholders]
    );

    // Load existing document data
    useEffect(() => {
        if (matterId) {
            fetch(`/api/ccl/${matterId}`)
                .then(r => (r.ok ? r.json() : null))
                .then(d => {
                    if (d) {
                        setDocumentData(prev => ({
                            ...prev,
                            content: d.content || '',
                            cclFields: d.json || prev.cclFields,
                            placeholders: d.placeholders || {},
                            email: d.email || prev.email
                        }));
                        if (d.url) setGeneratedUrl(d.url);
                    }
                })
                .catch(() => { });
        }
    }, [matterId]);

    // Set up email defaults when instruction is selected
    useEffect(() => {
        const inst = instruction || allInstructions.find(i => i.key === selectedRef);
        if (inst) {
            setDocumentData(prev => ({
                ...prev,
                email: {
                    ...prev.email,
                    to: inst.Client?.Email || '',
                    subject: `CCL – ${inst.InstructionRef}`
                }
            }));
        }
    }, [selectedRef, instruction]);

    const allInstructions = useMemo(
        () =>
            (instructions ?? [])
                .flatMap(p => p.instructions ?? [])
                .map(i => ({ key: i.InstructionRef, text: i.InstructionRef, ...i })) as (IDropdownOption & any)[],
        [instructions]
    );

    const handleSave = async () => {
        if (!matterId) return;
        setSaving(true);
        setMessage(null);
        
        try {
            const response = await fetch(`/api/ccl/${matterId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    content: documentData.content,
                    draftJson: flattenObject(documentData.cclFields),
                    placeholders: documentData.placeholders,
                    email: documentData.email
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.url) setGeneratedUrl(result.url);
                setMessage({ text: 'Document saved successfully', type: MessageBarType.success });
            } else {
                throw new Error('Failed to save document');
            }
        } catch (error) {
            setMessage({ text: 'Failed to save document', type: MessageBarType.error });
        } finally {
            setSaving(false);
        }
    };

    const handleGenerate = async () => {
        if (!matterId) return;
        setGenerating(true);
        setMessage(null);
        
        try {
            const response = await fetch('/api/ccl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    matterId, 
                    draftJson: flattenObject(documentData.cclFields),
                    content: documentData.content,
                    placeholders: documentData.placeholders
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.url) setGeneratedUrl(result.url);
                setMessage({ text: 'Word document generated successfully', type: MessageBarType.success });
            } else {
                throw new Error('Failed to generate document');
            }
        } catch (error) {
            setMessage({ text: 'Failed to generate document', type: MessageBarType.error });
        } finally {
            setGenerating(false);
        }
    };

    const updateContent = (content: string) => {
        setDocumentData(prev => ({ ...prev, content }));
    };

    const updatePlaceholder = (key: string, value: string) => {
        setDocumentData(prev => ({
            ...prev,
            placeholders: { ...prev.placeholders, [key]: value }
        }));
    };

    const updateCclField = (key: string, value: string) => {
        setDocumentData(prev => ({
            ...prev,
            cclFields: { ...prev.cclFields, [key]: value }
        }));
    };

    const updateEmail = (field: keyof DocumentData['email'], value: string) => {
        setDocumentData(prev => ({
            ...prev,
            email: { ...prev.email, [field]: value }
        }));
    };

    const insertToken = (token: string) => {
        const tokenText = `{{${token}}}`;
        setDocumentData(prev => ({
            ...prev,
            content: prev.content + tokenText
        }));
    };

    // Show instruction selection within the main interface if no instruction is selected
    const showInstructionSelector = !selectedInstruction && !instruction && !matterId && allInstructions.length > 0;

    return (
        <Stack tokens={dashboardTokens} className="workflow-container">
            <div className="workflow-main matter-opening-card">
                <div className="step-header">
                    <h3 className="step-title">Documents & Emails</h3>
                    {showInstructionSelector && (
                        <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
                            Select an instruction to begin editing documents
                        </div>
                    )}
                </div>
                <div className="step-content">
                    {message && (
                        <MessageBar 
                            messageBarType={message.type} 
                            onDismiss={() => setMessage(null)}
                            styles={{ root: { marginBottom: 16 } }}
                        >
                            {message.text}
                        </MessageBar>
                    )}

                    {showInstructionSelector ? (
                        <Stack tokens={{ childrenGap: 16 }}>
                            <Dropdown
                                placeholder="Select an instruction to work with"
                                options={allInstructions}
                                selectedKey={selectedRef}
                                onChange={(_, o) => {
                                    setSelectedRef(o?.key as string);
                                    // Auto-set the selected instruction
                                    const selectedInst = allInstructions.find(i => i.key === o?.key);
                                    if (selectedInst) {
                                        setSelectedInstruction(selectedInst);
                                    }
                                }}
                                styles={{ root: { maxWidth: 400 } }}
                            />
                            <div style={{ 
                                padding: 16, 
                                backgroundColor: '#f3f2f1', 
                                borderRadius: 4,
                                fontSize: 14,
                                color: '#666'
                            }}>
                                <strong>Tip:</strong> You can also select an instruction from the Overview tab, 
                                then switch to Documents to edit that instruction's documents.
                            </div>
                        </Stack>
                    ) : (
                        <Stack tokens={{ childrenGap: 16 }}>
                            {/* Current instruction indicator */}
                            {(selectedInstruction || instruction) && (
                                <div style={{ 
                                    padding: 12, 
                                    backgroundColor: '#e1f5fe', 
                                    borderRadius: 4,
                                    borderLeft: '4px solid #0078d4',
                                    fontSize: 14
                                }}>
                                    <strong>Working on:</strong> {(selectedInstruction || instruction)?.InstructionRef || 'Selected Instruction'}
                                </div>
                            )}

                            {/* Mode Selection */}
                            <Stack horizontal tokens={{ childrenGap: 8 }}>
                                <DefaultButton
                                    text="Free-form Content"
                                    onClick={() => setEditMode('content')}
                                    primary={editMode === 'content'}
                                />
                                <DefaultButton
                                    text="CCL Template"
                                    onClick={() => setEditMode('ccl')}
                                    primary={editMode === 'ccl'}
                                />
                            </Stack>

                            {editMode === 'content' ? (
                                <Stack tokens={{ childrenGap: 16 }}>
                                    {/* Document Content Editor */}
                                    <Stack tokens={{ childrenGap: 8 }}>
                                        <Label>Document Content</Label>
                                        <TextField
                                            multiline
                                            rows={10}
                                            value={documentData.content}
                                            onChange={(_, value) => updateContent(value || '')}
                                            placeholder="Enter your document content here. Use {{placeholder}} syntax for dynamic content."
                                            styles={{
                                                fieldGroup: { minHeight: 200 },
                                                field: { fontFamily: 'monospace' }
                                            }}
                                        />
                                        
                                        {/* Token Insertion */}
                                        <Stack horizontal tokens={{ childrenGap: 8 }} styles={{ root: { marginBottom: 8 } }}>
                                            <Label>Insert CCL tokens:</Label>
                                            {cclTokens.slice(0, 5).map(token => (
                                                <DefaultButton
                                                    key={token}
                                                    text={token.replace(/_/g, ' ')}
                                                    onClick={() => insertToken(token)}
                                                    styles={{ root: { fontSize: 11, padding: '4px 8px' } }}
                                                />
                                            ))}
                                            <DefaultButton
                                                text="More..."
                                                onClick={() => setCclPanelOpen(true)}
                                                styles={{ root: { fontSize: 11, padding: '4px 8px' } }}
                                            />
                                        </Stack>
                                    </Stack>

                                    {/* Placeholder Management */}
                                    {placeholders.length > 0 && (
                                        <Stack tokens={{ childrenGap: 8 }}>
                                            <Label>
                                                Placeholders
                                                {allPlaceholdersFilled && (
                                                    <FontIcon 
                                                        iconName="CheckMark" 
                                                        style={{ marginLeft: 6, color: '#107c10' }} 
                                                    />
                                                )}
                                            </Label>
                                            {placeholders.map(ph => (
                                                <TextField
                                                    key={ph}
                                                    label={ph.replace(/_/g, ' ')}
                                                    value={documentData.placeholders[ph] || ''}
                                                    onChange={(_, value) => updatePlaceholder(ph, value || '')}
                                                    placeholder={`Enter value for ${ph}`}
                                                />
                                            ))}
                                        </Stack>
                                    )}

                                    {/* Preview */}
                                    <Stack tokens={{ childrenGap: 8 }}>
                                        <Label>Preview</Label>
                                        <div style={{ 
                                            border: '1px solid #ccc', 
                                            borderRadius: 4, 
                                            padding: 16, 
                                            backgroundColor: '#f9f9f9',
                                            whiteSpace: 'pre-wrap',
                                            fontFamily: 'Raleway, sans-serif',
                                            minHeight: 100,
                                            maxHeight: 300,
                                            overflow: 'auto'
                                        }}>
                                            {preview || 'Preview will appear here...'}
                                        </div>
                                    </Stack>
                                </Stack>
                            ) : (
                                <Stack tokens={{ childrenGap: 16 }}>
                                    {/* CCL Template Fields */}
                                    <Label>Client Care Letter Fields</Label>
                                    {Object.keys(cclSchema).map(key => (
                                        <TextField
                                            key={key}
                                            label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            value={documentData.cclFields[key] || ''}
                                            onChange={(_, value) => updateCclField(key, value || '')}
                                            multiline
                                            rows={key.includes('estimate') || key.includes('charges') ? 4 : 2}
                                            placeholder={`Enter ${key.replace(/_/g, ' ')}`}
                                        />
                                    ))}
                                </Stack>
                            )}

                            {/* Email Configuration */}
                            <Stack tokens={{ childrenGap: 8 }}>
                                <Label>Email Settings</Label>
                                <TextField
                                    label="To"
                                    value={documentData.email.to}
                                    onChange={(_, value) => updateEmail('to', value || '')}
                                    placeholder="recipient@example.com"
                                />
                                <Stack horizontal tokens={{ childrenGap: 8 }}>
                                    <TextField
                                        label="CC"
                                        value={documentData.email.cc}
                                        onChange={(_, value) => updateEmail('cc', value || '')}
                                        placeholder="cc@example.com"
                                        styles={{ root: { flex: 1 } }}
                                    />
                                    <TextField
                                        label="BCC"
                                        value={documentData.email.bcc}
                                        onChange={(_, value) => updateEmail('bcc', value || '')}
                                        placeholder="bcc@example.com"
                                        styles={{ root: { flex: 1 } }}
                                    />
                                </Stack>
                                <TextField
                                    label="Subject"
                                    value={documentData.email.subject}
                                    onChange={(_, value) => updateEmail('subject', value || '')}
                                    placeholder="Email subject"
                                />
                            </Stack>

                            {/* Actions */}
                            <Stack horizontal tokens={{ childrenGap: 8 }}>
                                <PrimaryButton
                                    text="Save Document"
                                    onClick={handleSave}
                                    disabled={saving || generating || (!selectedInstruction && !instruction && !matterId)}
                                />
                                {canGenerate && (
                                    <PrimaryButton
                                        text="Generate Word Document"
                                        onClick={handleGenerate}
                                        disabled={saving || generating || (!selectedInstruction && !instruction && !matterId)}
                                    />
                                )}
                                {generatedUrl && (
                                    <DefaultButton
                                        text="Download Generated Document"
                                        href={generatedUrl}
                                        target="_blank"
                                        iconProps={{ iconName: 'Download' }}
                                    />
                                )}
                                {onBack && (
                                    <DefaultButton
                                        text="Back"
                                        onClick={onBack}
                                        disabled={saving || generating}
                                    />
                                )}
                            </Stack>
                        </Stack>
                    )}
                </div>
            </div>

            {/* CCL Tokens Panel */}
            <Panel
                headerText="CCL Tokens"
                isOpen={cclPanelOpen}
                onDismiss={() => setCclPanelOpen(false)}
                isLightDismiss
                styles={{ main: { maxWidth: 400 } }}
            >
                <Stack tokens={{ childrenGap: 8 }}>
                    <Label>Click to insert token:</Label>
                    {cclTokens.map(token => (
                        <DefaultButton
                            key={token}
                            text={token.replace(/_/g, ' ')}
                            onClick={() => {
                                insertToken(token);
                                setCclPanelOpen(false);
                            }}
                            styles={{ 
                                root: { 
                                    justifyContent: 'flex-start', 
                                    padding: '8px 12px',
                                    textAlign: 'left' 
                                } 
                            }}
                        />
                    ))}
                </Stack>
            </Panel>
        </Stack>
    );
};

export default DocumentEditorPage;
