//
// Enhanced instruction editor with seamless placeholder integration
// Based on PitchBuilder editor patterns

import React, { useState, useRef, useEffect } from 'react';
// invisible change 2.1
import { Stack } from '@fluentui/react/lib/Stack';
import { IconButton, PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Callout } from '@fluentui/react/lib/Callout';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';
import InstructionTemplates from './InstructionTemplates';

// Type definitions
export interface InstructionTemplate {
    id: string;
    title: string;
    category: 'opening' | 'progress' | 'completion' | 'billing' | 'custom';
    description: string;
    content: string;
    placeholders: string[];
    isMultiSelect?: boolean;
    options?: InstructionTemplateOption[];
}

export interface InstructionTemplateOption {
    label: string;
    content: string;
}

interface InstructionEditorProps {
    value?: string;
    onChange?: (value: string) => void;
    templates?: string[];
    onSave?: (content: string) => void;
    onCancel?: () => void;
    clientName?: string;
    matterType?: string;
    instructionRef?: string;
    className?: string;
    /**
     * Controls display of the template callout above the editor. Defaults to
     * `true` to maintain existing behaviour.
     */
    showTemplateCallout?: boolean;
}

// Default instruction templates for export
export const DEFAULT_INSTRUCTION_TEMPLATES: InstructionTemplate[] = [
    {
        id: 'matter-opening',
        title: 'Matter Opening Letter',
        category: 'opening',
        description: 'Standard matter opening template',
        content: `Dear {{client-name}},

Thank you for instructing us in relation to {{matter-type}}. We are pleased to confirm our appointment as your solicitors.

We understand that you require our assistance with {{property-address}} and our initial estimate for our professional fees is {{fee-estimate}}.

We will aim to complete this matter within {{target-completion}} subject to the usual conveyancing procedures.

{{next-steps}}

Kind regards,
{{solicitor-name}}
{{firm-name}}`,
        placeholders: ['client-name', 'matter-type', 'property-address', 'fee-estimate', 'target-completion', 'next-steps', 'solicitor-name', 'firm-name']
    },
    {
        id: 'progress-update',
        title: 'Progress Update',
        category: 'progress',
        description: 'Update client on matter progress',
        content: `Dear {{client-name}},

We are writing to update you on the progress of {{matter-type}} (Reference: {{instruction-ref}}).

Current Status:
{{next-steps}}

We will continue to keep you informed of progress and contact you if we require any further information.

Kind regards,
{{solicitor-name}}
{{firm-name}}`,
        placeholders: ['client-name', 'matter-type', 'instruction-ref', 'next-steps', 'solicitor-name', 'firm-name']
    }
];

// CSS injection for the editor - integrates with pitch builder styles
if (typeof window !== 'undefined' && !document.getElementById('instruction-editor-style')) {
    const style = document.createElement('style');
    style.id = 'instruction-editor-style';
    style.innerHTML = `
    .instruction-editor {
      display: flex;
      gap: 24px;
      height: 600px;
      max-height: 80vh;
    }
    
    .editor-main {
      flex: 2;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .editor-sidebar {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .editor-toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #e1e1e1;
      background: #f8f9fa;
    }
    
    .editor-content {
      flex: 1;
      border: 1px solid #e1e1e1;
      border-radius: 4px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
        .editor-area {
      flex: 1;
      padding: 16px;
      outline: none;
            font-family: 'Raleway', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #323130;
      background: white;
      overflow-y: auto;
      min-height: 400px;
    }
    
    .editor-area:focus {
      outline: 2px solid #0078d4;
      outline-offset: -2px;
    }
    
    .template-section {
      background: #f8f9fa;
      border: 1px solid #e1e1e1;
      border-radius: 4px;
      padding: 16px;
    }
    
    .template-section h3 {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
      color: #323130;
    }
    
    .template-callout {
      background: #fff4ce;
      border: 1px solid #ffb900;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 16px;
    }
    
    .template-callout h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #323130;
    }
    
    .template-callout p {
      margin: 0;
      font-size: 13px;
      color: #605e5c;
    }
    
    .placeholder-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    
    .placeholder-btn {
      font-size: 11px !important;
      padding: 4px 8px !important;
      min-width: auto !important;
      height: 28px !important;
    }
    `;
    document.head.appendChild(style);
}

const InstructionEditor: React.FC<InstructionEditorProps> = ({
    value = '',
    onChange,
    templates = [],
    onSave,
    onCancel,
    clientName = '',
    matterType = '',
    instructionRef = '',
    className = '',
    showTemplateCallout = true
}) => {
    const { isDarkMode } = useTheme();
    const editorRef = useRef<HTMLDivElement>(null);
    const [content, setContent] = useState(value);
    const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
    const [templatesCalloutTarget, setTemplatesCalloutTarget] = useState<HTMLElement | null>(null);

    // Available placeholders for instructions
    const instructionPlaceholders = [
        { id: 'client-name', label: 'Client Name', value: clientName },
        { id: 'matter-type', label: 'Matter Type', value: matterType },
        { id: 'instruction-ref', label: 'Instruction Ref', value: instructionRef },
        { id: 'property-address', label: 'Property Address', value: '' },
        { id: 'fee-estimate', label: 'Fee Estimate', value: '' },
        { id: 'target-completion', label: 'Target Completion', value: '' },
        { id: 'next-steps', label: 'Next Steps', value: '' },
        { id: 'solicitor-name', label: 'Solicitor Name', value: '' },
        { id: 'firm-name', label: 'Firm Name', value: 'Helix Law' },
        { id: 'date', label: 'Date', value: new Date().toLocaleDateString() },
    ];

    useEffect(() => {
        if (editorRef.current && content !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = content;
        }
    }, [content]);

    const handleContentChange = () => {
        if (editorRef.current) {
            const newContent = editorRef.current.innerHTML;
            setContent(newContent);
            onChange?.(newContent);
        }
    };

    const handleTemplateInsert = (templateContent: string) => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML += templateContent;
        handleContentChange();
        setIsTemplatesOpen(false);
    };

    // Insert placeholder at cursor
    const handlePlaceholderInsert = (placeholder: any) => {
        if (!editorRef.current) return;
        const placeholderHtml = `{{${placeholder.id}}}`;
        editorRef.current.innerHTML += placeholderHtml;
        handleContentChange();
    };

    // Apply formatting
    const applyFormat = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
    };

    // Handle save
    const handleSave = () => {
        if (onSave && editorRef.current) {
            onSave(editorRef.current.innerHTML);
        }
    };

    return (
        <div className={`instruction-editor ${className}`}>
            <div className="editor-main">
                {showTemplateCallout && (
                    <div className="template-callout">
                        <h4>PitchBuilder-Style Template Editor</h4>
                        <p>Insert templates and placeholders to create professional instruction content. Click "Insert Template" to choose from predefined templates, or use the placeholder buttons to add dynamic content.</p>
                    </div>
                )}

                <div className="editor-content">
                    <div className="editor-toolbar">
                        <IconButton
                            iconProps={{ iconName: 'Bold' }}
                            title="Bold"
                            onClick={() => applyFormat('bold')}
                        />
                        <IconButton
                            iconProps={{ iconName: 'Italic' }}
                            title="Italic"
                            onClick={() => applyFormat('italic')}
                        />
                        <IconButton
                            iconProps={{ iconName: 'Underline' }}
                            title="Underline"
                            onClick={() => applyFormat('underline')}
                        />
                        <div style={{ width: '1px', height: '20px', background: '#e1e1e1', margin: '0 4px' }} />
                        <IconButton
                            iconProps={{ iconName: 'BulletedList' }}
                            title="Bullet List"
                            onClick={() => applyFormat('insertUnorderedList')}
                        />
                        <IconButton
                            iconProps={{ iconName: 'NumberedList' }}
                            title="Numbered List"
                            onClick={() => applyFormat('insertOrderedList')}
                        />
                        <div style={{ width: '1px', height: '20px', background: '#e1e1e1', margin: '0 4px' }} />
                        <DefaultButton
                            text="Insert Template"
                            iconProps={{ iconName: 'FileTemplate' }}
                            onClick={(event) => {
                                setTemplatesCalloutTarget(event.currentTarget as HTMLElement);
                                setIsTemplatesOpen(!isTemplatesOpen);
                            }}
                        />
                    </div>
                    
                    <div
                        ref={editorRef}
                        className="editor-area"
                        contentEditable
                        onInput={handleContentChange}
                        suppressContentEditableWarning={true}
                    />
                </div>

                <Stack horizontal tokens={{ childrenGap: 8 }}>
                    <PrimaryButton text="Save" onClick={handleSave} />
                    <DefaultButton text="Cancel" onClick={onCancel} />
                </Stack>
            </div>

            <div className="editor-sidebar">
                <div className="template-section">
                    <h3>Quick Placeholders</h3>
                    <div className="placeholder-grid">
                        {instructionPlaceholders.map((placeholder) => (
                            <DefaultButton
                                key={placeholder.id}
                                className="placeholder-btn"
                                text={placeholder.label}
                                title={`Insert ${placeholder.label}`}
                                onClick={() => handlePlaceholderInsert(placeholder)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {isTemplatesOpen && templatesCalloutTarget && (
                <Callout
                    target={templatesCalloutTarget}
                    onDismiss={() => setIsTemplatesOpen(false)}
                    directionalHint={12}
                    isBeakVisible={true}
                    gapSpace={10}
                >
                    <Stack style={{ padding: '16px', minWidth: '400px', maxWidth: '600px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
                            Instruction Templates
                        </h3>
                        {DEFAULT_INSTRUCTION_TEMPLATES.map((template) => (
                            <div key={template.id} style={{ marginBottom: '12px', border: '1px solid #e1e1e1', borderRadius: '4px', padding: '12px' }}>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600' }}>
                                    {template.title}
                                </h4>
                                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#605e5c' }}>
                                    {template.description}
                                </p>
                                <DefaultButton
                                    text="Insert Template"
                                    onClick={() => handleTemplateInsert(template.content)}
                                />
                            </div>
                        ))}
                    </Stack>
                </Callout>
            )}
        </div>
    );
};

export default InstructionEditor;
