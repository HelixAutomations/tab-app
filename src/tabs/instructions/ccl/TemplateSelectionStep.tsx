import React from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Icon } from '@fluentui/react/lib/Icon';
interface Step1Props {
    currentStep: number;
    isInstructionBasedMode: boolean;
    questionBannerStyle: React.CSSProperties;
    instructionSearchTerm: string;
    setInstructionSearchTerm: (value: string) => void;
    filteredInstructions: any[];
    selectedInstruction: any | null;
    userHasInteracted: boolean;
    setSelectedInstruction: (inst: any | null) => void;
    setHasSelectedInstruction: (val: boolean) => void;
    setUserHasInteracted: (val: boolean) => void;
    selectedTemplate: 'ccl' | 'custom' | null;
    handleTemplateSelect: (tpl: 'ccl' | 'custom') => void;
    templateCardStyle: React.CSSProperties;
    colours: any;
    navigationStyle: React.CSSProperties;
    canProceedToStep2: boolean;
    goToNextStep: () => void;
}

const TemplateSelectionStep: React.FC<Step1Props> = (props) => {
    const {
        currentStep,
        isInstructionBasedMode,
        questionBannerStyle,
        instructionSearchTerm,
        setInstructionSearchTerm,
        filteredInstructions,
        selectedInstruction,
        userHasInteracted,
        setSelectedInstruction,
        setHasSelectedInstruction,
        setUserHasInteracted,
        selectedTemplate,
        handleTemplateSelect,
        templateCardStyle,
        colours,
        navigationStyle,
        canProceedToStep2,
        goToNextStep
    } = props;

    if (currentStep !== 1) return null;

    return (
        <div>
            <div className="matter-opening-card">
                <Stack tokens={{ childrenGap: 20 }}>
                    <div>
                        {/* Instruction Selection */}
                        {!isInstructionBasedMode && (
                            <div style={{ marginBottom: '24px' }}>
                                <div style={questionBannerStyle}>
                                    Select Instruction
                                </div>

                                {/* Search input */}
                                <div style={{ marginTop: '12px', marginBottom: '16px' }}>
                                    <input
                                        type="text"
                                        placeholder="Search instructions..."
                                        value={instructionSearchTerm}
                                        onChange={(e) => setInstructionSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            border: '1px solid #e1dfdd',
                                            borderRadius: '4px',
                                            fontSize: '14px',
                                            outline: 'none',
                                            transition: 'border-color 0.2s ease'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#3690CE'}
                                        onBlur={(e) => e.target.style.borderColor = '#e1dfdd'}
                                    />
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                    gap: '12px'
                                }}>
                                    {/* Instruction options */}
                                    {filteredInstructions.length === 0 ? (
                                        <div style={{
                                            gridColumn: '1 / -1',
                                            textAlign: 'center',
                                            padding: '32px',
                                            color: '#666',
                                            fontSize: '14px'
                                        }}>
                                            {instructionSearchTerm.trim() ?
                                                `No instructions found matching "${instructionSearchTerm}"` :
                                                'No instructions available'
                                            }
                                        </div>
                                    ) : (
                                        filteredInstructions.map((inst) => {
                                            const instId = inst.id || inst.prospectId;
                                            const selectedId = selectedInstruction?.id || selectedInstruction?.prospectId;
                                            const isSelected = userHasInteracted && selectedId === instId;

                                            return (
                                                <div
                                                    key={instId}
                                                    style={{
                                                        padding: '16px',
                                                        border: isSelected ? `1px solid ${colours.highlight}` : '1px solid #e0e0e0',
                                                        borderRadius: '0',
                                                        backgroundColor: isSelected ? `${colours.highlight}22` : '#fff',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        position: 'relative'
                                                    }}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            // Unselect if already selected - reset to initial state
                                                            setSelectedInstruction(null);
                                                            setHasSelectedInstruction(false);
                                                            setUserHasInteracted(false);
                                                        } else {
                                                            // Select instruction
                                                            setSelectedInstruction(inst);
                                                            setHasSelectedInstruction(true);
                                                            setUserHasInteracted(true);
                                                        }
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isSelected) {
                                                            e.currentTarget.style.borderColor = colours.highlight;
                                                            e.currentTarget.style.backgroundColor = '#f7fafc';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isSelected) {
                                                            e.currentTarget.style.borderColor = '#e0e0e0';
                                                            e.currentTarget.style.backgroundColor = '#fff';
                                                        }
                                                    }}
                                                >
                                                    <div style={{
                                                        fontSize: '16px',
                                                        fontWeight: 600,
                                                        color: '#061733',
                                                        marginBottom: '4px'
                                                    }}>
                                                        {inst.title || (inst.prospectId ? `Instruction ${inst.prospectId}` : 'Untitled Instruction')}
                                                    </div>
                                                    {inst.deals?.[0]?.ServiceDescription && (
                                                        <div style={{
                                                            fontSize: '14px',
                                                            color: '#3690CE',
                                                            marginBottom: '4px'
                                                        }}>
                                                            {inst.deals[0].ServiceDescription}
                                                        </div>
                                                    )}
                                                    {inst.description && (
                                                        <div style={{
                                                            fontSize: '13px',
                                                            color: '#666'
                                                        }}>
                                                            {inst.description}
                                                        </div>
                                                    )}
                                                    {isSelected && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: '12px',
                                                            right: '12px',
                                                            width: '20px',
                                                            height: '20px',
                                                            borderRadius: '50%',
                                                            backgroundColor: '#3690CE',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}>
                                                            <Icon iconName="Accept" style={{ color: '#fff', fontSize: '12px' }} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Template Selection */}
                        <div>
                            <div style={questionBannerStyle}>
                                Choose Your Template
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '8px',
                                width: '100%',
                                marginTop: '0'
                            }}>
                                <div
                                    style={{
                                        padding: '12px 16px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        transition: 'all 0.2s ease',
                                        border: `1px solid ${selectedTemplate === 'ccl' ? colours.highlight : '#e0e0e0'}`,
                                        background: selectedTemplate === 'ccl' ? `${colours.highlight}22` : '#fff',
                                        color: selectedTemplate === 'ccl' ? colours.highlight : '#4a5568',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minHeight: '80px',
                                        position: 'relative',
                                        borderRadius: '0',
                                        boxShadow: selectedTemplate === 'ccl' ? `0 2px 8px ${colours.highlight}20` : 'none'
                                    }}
                                    onClick={() => handleTemplateSelect('ccl')}
                                    onMouseEnter={(e) => {
                                        if (selectedTemplate !== 'ccl') {
                                            e.currentTarget.style.background = '#f7fafc';
                                            e.currentTarget.style.borderColor = colours.highlight;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (selectedTemplate !== 'ccl') {
                                            e.currentTarget.style.background = '#fff';
                                            e.currentTarget.style.borderColor = '#e0e0e0';
                                        }
                                    }}
                                >
                                    <Icon iconName="FileText" style={{ marginBottom: '8px', fontSize: '20px', color: selectedTemplate === 'ccl' ? colours.highlight : '#4a5568' }} />
                                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Client Care Letter</div>
                                    <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', lineHeight: '1.3' }}>
                                        Standard engagement letter with placeholders
                                    </div>
                                </div>

                                <div
                                    style={{
                                        padding: '12px 16px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        transition: 'all 0.2s ease',
                                        border: `1px solid ${selectedTemplate === 'custom' ? colours.highlight : '#e0e0e0'}`,
                                        background: selectedTemplate === 'custom' ? `${colours.highlight}22` : '#fff',
                                        color: selectedTemplate === 'custom' ? colours.highlight : '#4a5568',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minHeight: '80px',
                                        position: 'relative',
                                        borderRadius: '0',
                                        boxShadow: selectedTemplate === 'custom' ? `0 2px 8px ${colours.highlight}20` : 'none'
                                    }}
                                    onClick={() => handleTemplateSelect('custom')}
                                    onMouseEnter={(e) => {
                                        if (selectedTemplate !== 'custom') {
                                            e.currentTarget.style.background = '#f7fafc';
                                            e.currentTarget.style.borderColor = colours.highlight;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (selectedTemplate !== 'custom') {
                                            e.currentTarget.style.background = '#fff';
                                            e.currentTarget.style.borderColor = '#e0e0e0';
                                        }
                                    }}
                                >
                                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>+ Custom Document</div>
                                    <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', lineHeight: '1.3' }}>
                                        Start with a blank document
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Stack>

                <div style={navigationStyle}>
                    <div></div>
                    <div
                        className="nav-button forward-button"
                        onClick={canProceedToStep2 ? goToNextStep : undefined}
                        aria-disabled={!canProceedToStep2}
                        tabIndex={canProceedToStep2 ? 0 : -1}
                        style={{
                            background: '#f4f4f6',
                            border: '2px solid #e1dfdd',
                            borderRadius: '0px',
                            width: '48px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: canProceedToStep2 ? 'pointer' : 'not-allowed',
                            opacity: canProceedToStep2 ? 1 : 0.5,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                            position: 'relative',
                            overflow: 'hidden',
                            pointerEvents: canProceedToStep2 ? 'auto' : 'none',
                        }}
                        onMouseEnter={canProceedToStep2 ? (e) => {
                            e.currentTarget.style.background = '#ffefed';
                            e.currentTarget.style.border = '2px solid #D65541';
                            e.currentTarget.style.borderRadius = '0px';
                            e.currentTarget.style.width = '180px';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                        } : undefined}
                        onMouseLeave={canProceedToStep2 ? (e) => {
                            e.currentTarget.style.background = '#f4f4f6';
                            e.currentTarget.style.border = '2px solid #e1dfdd';
                            e.currentTarget.style.borderRadius = '0px';
                            e.currentTarget.style.width = '48px';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                        } : undefined}
                    >
                        {/* Arrow Icon */}
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{
                                transition: 'color 0.3s, opacity 0.3s',
                                color: canProceedToStep2 ? '#D65541' : '#999',
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
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
                            Continue to Editor
                        </span>
                    </div>
                    <style>{`
                            .nav-button:hover .nav-text {
                                opacity: 1 !important;
                            }
                            .nav-button:hover svg {
                                opacity: 0 !important;
                            }
                        `}</style>
                </div>
            </div>
        </div>
    );
};

export default TemplateSelectionStep;
