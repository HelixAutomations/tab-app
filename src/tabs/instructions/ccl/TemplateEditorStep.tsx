import React, { useRef } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { IconButton } from '@fluentui/react/lib/Button';
interface Step2Props {
    currentStep: number;
    questionBannerStyle: React.CSSProperties;
    renderFieldsOnlyView: () => JSX.Element;
    renderEditableTemplateContent: (content: string) => JSX.Element | string;
    documentContent: string;
    isFieldsOnlyView: boolean;
    setIsFieldsOnlyView: (val: boolean) => void;
    navigationStyle: React.CSSProperties;
    goToPreviousStep: () => void;
    canProceedToStep3: boolean;
    goToNextStep: () => void;
}

// invisible change: keep in editor history

const Step2: React.FC<Step2Props> = ({
    currentStep,
    questionBannerStyle,
    renderFieldsOnlyView,
    renderEditableTemplateContent,
    documentContent,
    isFieldsOnlyView,
    setIsFieldsOnlyView,
    navigationStyle,
    goToPreviousStep,
    canProceedToStep3,
    goToNextStep
}) => {
    const editorRef = useRef<HTMLDivElement>(null);

    const applyFormat = (command: string) => {
        document.execCommand(command, false, undefined);
        editorRef.current?.focus();
    };

    if (currentStep !== 2) return null;

    return (
        <div
            className="matter-opening-card"
            style={{ opacity: 1, animation: 'fadeIn 0.3s ease-out' }}
        >
            <style>
                {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
            </style>
            <Stack tokens={{ childrenGap: 20 }}>
                <div style={{ display: 'flex', gap: '20px', flexDirection: 'row' }}>
                    {/* Interactive Template Editor Section */}
                    <div style={{ flex: '1', minWidth: '0' }}>
                        <div
                            style={{
                                ...questionBannerStyle,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <span>Interactive Template Editor</span>
                            <div style={{ display: 'flex', gap: 0 }}>
                                <button
                                    onClick={() => setIsFieldsOnlyView(false)}
                                    style={{
                                        padding: '8px 16px',
                                        border: '1px solid #CCCCCC',
                                        backgroundColor: !isFieldsOnlyView ? '#3690CE' : '#FFFFFF',
                                        color: !isFieldsOnlyView ? '#FFFFFF' : '#061733',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        outline: 'none',
                                        transition: 'all 0.2s ease',
                                        borderRight: 'none',
                                        minWidth: '80px'
                                    }}
                                >
                                    Editor
                                </button>
                                <button
                                    onClick={() => setIsFieldsOnlyView(true)}
                                    style={{
                                        padding: '8px 16px',
                                        border: '1px solid #CCCCCC',
                                        backgroundColor: isFieldsOnlyView ? '#3690CE' : '#FFFFFF',
                                        color: isFieldsOnlyView ? '#FFFFFF' : '#061733',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        outline: 'none',
                                        transition: 'all 0.2s ease',
                                        minWidth: '80px'
                                    }}
                                >
                                    Fields
                                </button>
                            </div>
                        </div>

                        {isFieldsOnlyView ? (
                            <div
                                style={{
                                    border: '1px solid #e1e5e9',
                                    borderRadius: '4px',
                                    padding: '16px',
                                    minHeight: '300px',
                                    fontFamily: 'Raleway, sans-serif',
                                    fontSize: '14px',
                                    backgroundColor: '#fff'
                                }}
                            >
                                {renderFieldsOnlyView()}
                            </div>
                        ) : (
                            <div
                                style={{
                                    border: '1px solid #e1e5e9',
                                    borderRadius: '4px',
                                    backgroundColor: '#fff'
                                }}
                            >
                                <div
                                    style={{
                                        borderBottom: '1px solid #e1e5e9',
                                        padding: '4px',
                                        display: 'flex',
                                        gap: '4px'
                                    }}
                                >
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
                                </div>
                                <div
                                    ref={editorRef}
                                    style={{
                                        padding: '16px',
                                        minHeight: '300px',
                                        fontFamily: 'Raleway, sans-serif',
                                        fontSize: '14px',
                                        lineHeight: '1.3',
                                        whiteSpace: 'pre-wrap',
                                        cursor: 'text'
                                    }}
                                >
                                    {renderEditableTemplateContent(documentContent)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Stack>

            {/* Navigation Below Content */}
            <div style={navigationStyle}>
                <div
                    className="nav-button back-button"
                    onClick={goToPreviousStep}
                    tabIndex={0}
                    style={{
                        background: '#f4f4f6',
                        border: '2px solid #e1dfdd',
                        width: '48px',
                        height: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)'
                    }}
                    onMouseEnter={e => {
                        Object.assign(e.currentTarget.style, {
                            background: '#ffefed',
                            border: '2px solid #D65541',
                            width: '140px',
                            boxShadow: '0 2px 8px rgba(214,85,65,0.08)'
                        });
                    }}
                    onMouseLeave={e => {
                        Object.assign(e.currentTarget.style, {
                            background: '#f4f4f6',
                            border: '2px solid #e1dfdd',
                            width: '48px',
                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)'
                        });
                    }}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{
                            color: '#D65541',
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%,-50%) rotate(180deg)'
                        }}
                    >
                        <path
                            d="M5 12h14M12 5l7 7-7 7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <span
                        className="nav-text"
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%,-50%)',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#D65541',
                            opacity: 0,
                            transition: 'opacity 0.3s'
                        }}
                    >
                        Back to Selection
                    </span>
                </div>

                <div
                    className="nav-button forward-button"
                    onClick={canProceedToStep3 ? goToNextStep : undefined}
                    aria-disabled={!canProceedToStep3}
                    tabIndex={canProceedToStep3 ? 0 : -1}
                    style={{
                        background: '#f4f4f6',
                        border: '2px solid #e1dfdd',
                        width: '48px',
                        height: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: canProceedToStep3 ? 'pointer' : 'not-allowed',
                        opacity: canProceedToStep3 ? 1 : 0.5,
                        boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)'
                    }}
                    onMouseEnter={e => {
                        if (!canProceedToStep3) return;
                        Object.assign(e.currentTarget.style, {
                            background: '#ffefed',
                            border: '2px solid #D65541',
                            width: '160px',
                            boxShadow: '0 2px 8px rgba(214,85,65,0.08)'
                        });
                    }}
                    onMouseLeave={e => {
                        if (!canProceedToStep3) return;
                        Object.assign(e.currentTarget.style, {
                            background: '#f4f4f6',
                            border: '2px solid #e1dfdd',
                            width: '48px',
                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)'
                        });
                    }}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{
                            color: canProceedToStep3 ? '#D65541' : '#999',
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%,-50%)'
                        }}
                    >
                        <path
                            d="M5 12h14M12 5l7 7-7 7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <span
                        className="nav-text"
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%,-50%)',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#D65541',
                            opacity: 0,
                            transition: 'opacity 0.3s'
                        }}
                    >
                        Continue to Preview
                    </span>
                </div>
            </div>
        </div>
    );
};

export default Step2;
