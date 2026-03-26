import React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Icon } from '@fluentui/react/lib/Icon';
import { Stack } from '@fluentui/react/lib/Stack';
interface Step3Props {
    currentStep: number;
    questionBannerStyle: React.CSSProperties;
    renderTemplateContentForPreview: () => JSX.Element | string;
    documentContent: string;
    windowWidth: number;
    message: { type: MessageBarType; text: string } | null;
    setMessage: (m: { type: MessageBarType; text: string } | null) => void;
    generateContent: () => string;
    templateFields: Record<string, string>;
    selectedTemplate: 'ccl' | 'custom' | null;
    navigationStyle: React.CSSProperties;
    goToPreviousStep: () => void;
    goToNextStep: () => void;
}

const Step3: React.FC<Step3Props> = (props) => {
    const {
        currentStep,
        questionBannerStyle,
        renderTemplateContentForPreview,
        documentContent,
        windowWidth,
        message,
        setMessage,
        generateContent,
        templateFields,
        selectedTemplate,
        navigationStyle,
        goToPreviousStep,
        goToNextStep
    } = props;

    if (currentStep !== 3) return null;

    return (
        <div className="matter-opening-card" style={{
            opacity: 1,
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}
            </style>
            <Stack tokens={{ childrenGap: 20 }}>
                {/* Message Bar */}
                {message && (
                    <MessageBar
                        messageBarType={message.type}
                        onDismiss={() => setMessage(null)}
                        styles={{ root: { marginBottom: '20px' } }}
                    >
                        {message.text}
                    </MessageBar>
                )}

                <div>
                    <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 600 }}>
                        Step 3: Preview & Actions
                    </h2>
                    <p style={{ marginBottom: '24px', color: '#666' }}>
                        Review your document and choose your delivery method.
                    </p>

                    <div style={{
                        display: 'flex',
                        gap: '20px',
                        minHeight: '500px',
                        flexDirection: windowWidth < 1200 ? 'column' : 'row'
                    }}>
                        {/* Document Preview */}
                        <div style={{
                            flex: '1',
                            minWidth: '0'
                        }}>
                            <div style={questionBannerStyle}>
                                Final Document Preview
                            </div>
                            <div style={{
                                border: '1px solid #e1e5e9',
                                borderRadius: '4px',
                                padding: '20px',
                                backgroundColor: '#f8f9fa',
                                height: windowWidth < 1200 ? '300px' : '450px',
                                overflow: 'auto',
                                fontFamily: 'Raleway, sans-serif',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                whiteSpace: 'pre-wrap'
                            }}>
                                {renderTemplateContentForPreview()}
                            </div>
                        </div>

                        {/* Actions Panel */}
                        <div style={{
                            width: windowWidth < 1200 ? '100%' : '350px',
                            flexShrink: windowWidth < 1200 ? 1 : 0,
                            minWidth: windowWidth < 1200 ? '100%' : '300px'
                        }}>
                            <div style={questionBannerStyle}>
                                Actions & Delivery
                            </div>
                            <div style={{
                                border: '1px solid #e1e5e9',
                                borderRadius: '4px',
                                padding: '20px',
                                backgroundColor: '#fff',
                                height: windowWidth < 1200 ? '300px' : '450px'
                            }}>
                                <Stack tokens={{ childrenGap: 16 }}>
                                    <div
                                        className="action-button"
                                        onClick={() => setMessage({ type: MessageBarType.success, text: 'Email functionality coming soon!' })}
                                        style={{
                                            background: '#D65541',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '0px',
                                            width: '100%',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#B54533';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#D65541';
                                        }}
                                    >
                                        <Icon iconName="Mail" />
                                        Send via Email
                                    </div>

                                    <div
                                        className="action-button"
                                        onClick={() => setMessage({ type: MessageBarType.info, text: 'PDF download coming soon!' })}
                                        style={{
                                            background: '#f4f4f6',
                                            color: '#333',
                                            border: '1px solid #e1dfdd',
                                            borderRadius: '0px',
                                            width: '100%',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#e6e6e8';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f4f4f6';
                                        }}
                                    >
                                        <Icon iconName="Download" />
                                        Download PDF
                                    </div>

                                    <div
                                        className="action-button"
                                        onClick={() => setMessage({ type: MessageBarType.success, text: 'Draft saved successfully!' })}
                                        style={{
                                            background: '#f4f4f6',
                                            color: '#333',
                                            border: '1px solid #e1dfdd',
                                            borderRadius: '0px',
                                            width: '100%',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#e6e6e8';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f4f4f6';
                                        }}
                                    >
                                        <Icon iconName="Save" />
                                        Save as Draft
                                    </div>

                                    <div
                                        className="action-button"
                                        onClick={() => {
        navigator.clipboard.writeText(generateContent());
                                            setMessage({ type: MessageBarType.success, text: 'Document copied to clipboard!' });
                                        }}
                                        style={{
                                            background: '#f4f4f6',
                                            color: '#333',
                                            border: '1px solid #e1dfdd',
                                            borderRadius: '0px',
                                            width: '100%',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#e6e6e8';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#f4f4f6';
                                        }}
                                    >
                                        <Icon iconName="Copy" />
                                        Copy to Clipboard
                                    </div>

                                    <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Document Summary</h4>
                                        <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
                                            Template: {selectedTemplate === 'ccl' ? 'Client Care Letter' : 'Custom Document'}
                                        </p>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
                                            Word count: {generateContent().split(/\s+/).filter(word => word.length > 0).length}
                                        </p>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
                                            Fields filled: {Object.values(templateFields).filter(v => v.trim() !== '').length}/{Object.keys(templateFields).length}
                                        </p>
                                    </div>
                                </Stack>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={navigationStyle}>
                    <div
                        className="nav-button back-button"
                        onClick={goToPreviousStep}
                        tabIndex={0}
                        style={{
                            background: '#f4f4f6',
                            border: '2px solid #e1dfdd',
                            borderRadius: '0px',
                            width: '48px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ffefed';
                            e.currentTarget.style.border = '2px solid #D65541';
                            e.currentTarget.style.borderRadius = '0px';
                            e.currentTarget.style.width = '120px';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f4f4f6';
                            e.currentTarget.style.border = '2px solid #e1dfdd';
                            e.currentTarget.style.borderRadius = '0px';
                            e.currentTarget.style.width = '48px';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                        }}
                    >
                        {/* Arrow Icon */}
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{
                                transition: 'color 0.3s, opacity 0.3s',
                                color: '#D65541',
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%) rotate(180deg)',
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

                        {/* Expandable Text */}
                        <span
                            style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#D65541',
                                opacity: 0,
                                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                whiteSpace: 'nowrap',
                            }}
                            className="nav-text"
                        >
                            Back to Editor
                        </span>
                    </div>
                    <div
                        className="nav-button complete-button"
                        onClick={goToNextStep}
                        tabIndex={0}
                        style={{
                            background: '#f4f4f6',
                            border: '2px solid #e1dfdd',
                            borderRadius: '0px',
                            width: '48px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ffefed';
                            e.currentTarget.style.border = '2px solid #D65541';
                            e.currentTarget.style.borderRadius = '0px';
                            e.currentTarget.style.width = '160px';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f4f4f6';
                            e.currentTarget.style.border = '2px solid #e1dfdd';
                            e.currentTarget.style.borderRadius = '0px';
                            e.currentTarget.style.width = '48px';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                        }}
                    >
                        {/* Checkmark Icon */}
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{
                                transition: 'color 0.3s, opacity 0.3s',
                                color: '#D65541',
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <path
                                d="M20 6L9 17l-5-5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>

                        {/* Expandable Text */}
                        <span
                            style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#D65541',
                                opacity: 0,
                                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                whiteSpace: 'nowrap',
                            }}
                            className="nav-text"
                        >
                            Complete Document
                        </span>
                    </div>
                </div>
            </Stack>
        </div>
    );
};

export default Step3;
