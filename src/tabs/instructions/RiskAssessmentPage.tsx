import React, { useState } from 'react';
// invisible change 2.1
//
import { Dialog, DialogType, DialogFooter, DefaultButton, PrimaryButton, Spinner, SpinnerSize } from '@fluentui/react';
import OperationStatusToast from '../enquiries/pitch-builder/OperationStatusToast';
import RiskAssessment, { RiskCore } from '../../components/RiskAssessment';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import '../../app/styles/NewMatters.css';
import '../../app/styles/MatterOpeningCard.css';
import '../../app/styles/RiskAssessmentPage.css';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../../app/styles/ButtonStyles';

interface RiskAssessmentPageProps {
    onBack: () => void;
    instructionRef?: string;
    riskAssessor?: string;
    /** Existing risk assessment data to display when available */
    existingRisk?: any | null;
    /** Callback when risk assessment is successfully submitted */
    onSave?: (risk: any) => void;
}

const RiskAssessmentPage: React.FC<RiskAssessmentPageProps> = ({ onBack, instructionRef, riskAssessor, existingRisk, onSave }) => {
    const { isDarkMode } = useTheme();
    const [toast, setToast] = useState<{
        visible: boolean;
        message: string;
        type: 'success' | 'error' | 'info' | 'warning';
    }>({ visible: false, message: '', type: 'info' });
    const [riskCore, setRiskCore] = useState<RiskCore>({
        clientType: existingRisk?.ClientType ?? '',
        clientTypeValue: existingRisk?.ClientType_Value ?? 0,
        destinationOfFunds: existingRisk?.DestinationOfFunds ?? '',
        destinationOfFundsValue: existingRisk?.DestinationOfFunds_Value ?? 0,
        fundsType: existingRisk?.FundsType ?? '',
        fundsTypeValue: existingRisk?.FundsType_Value ?? 0,
        clientIntroduced: existingRisk?.HowWasClientIntroduced ?? '',
        clientIntroducedValue: existingRisk?.HowWasClientIntroduced_Value ?? 0,
        limitation: existingRisk?.Limitation ?? '',
        limitationValue: existingRisk?.Limitation_Value ?? 0,
        sourceOfFunds: existingRisk?.SourceOfFunds ?? '',
        sourceOfFundsValue: existingRisk?.SourceOfFunds_Value ?? 0,
        valueOfInstruction: existingRisk?.ValueOfInstruction ?? '',
        valueOfInstructionValue: existingRisk?.ValueOfInstruction_Value ?? 0,
    });
    const [limitationDate, setLimitationDate] = useState<Date | undefined>();
    const [limitationDateTbc, setLimitationDateTbc] = useState(false);
    const [complianceDate, setComplianceDate] = useState<Date | undefined>(
        existingRisk?.ComplianceDate ? new Date(existingRisk.ComplianceDate) : new Date(),
    );
    const [consideredClientRisk, setConsideredClientRisk] = useState<
        boolean | undefined
    >(existingRisk?.ClientRiskFactorsConsidered !== undefined
        ? !!existingRisk?.ClientRiskFactorsConsidered
        : false);
    const [consideredTransactionRisk, setConsideredTransactionRisk] = useState<
        boolean | undefined
    >(existingRisk?.TransactionRiskFactorsConsidered !== undefined
        ? !!existingRisk?.TransactionRiskFactorsConsidered
        : false);
    const [transactionRiskLevel, setTransactionRiskLevel] = useState(
        existingRisk?.TransactionRiskLevel ?? '',
    );
    const [consideredFirmWideSanctions, setConsideredFirmWideSanctions] = useState<
        boolean | undefined
    >(existingRisk?.FirmWideSanctionsRiskConsidered !== undefined
        ? !!existingRisk?.FirmWideSanctionsRiskConsidered
        : false);
    const [consideredFirmWideAML, setConsideredFirmWideAML] = useState<
        boolean | undefined
    >(existingRisk?.FirmWideAMLPolicyConsidered !== undefined
        ? !!existingRisk?.FirmWideAMLPolicyConsidered
        : false);

    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
    const [headerButtons, setHeaderButtons] = useState<{ clearAllButton: React.ReactNode | null; jsonButton: React.ReactNode }>({
        clearAllButton: null,
        jsonButton: null
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleHeaderButtonsChange = (buttons: { clearAllButton: React.ReactNode | null; jsonButton: React.ReactNode }) => {
        setHeaderButtons(buttons);
    };


    // Helper function to check if there's any data to clear
    const hasDataToClear = () => {
        return Object.values(riskCore).some(v => v !== '' && v !== 0) ||
               consideredClientRisk === true ||
               consideredTransactionRisk === true ||
               transactionRiskLevel !== '' ||
               consideredFirmWideSanctions === true ||
            consideredFirmWideAML === true ||
            limitationDate !== undefined ||
            limitationDateTbc;
    };

    // Clear all selections and inputs
    const doClearAll = () => {
        setIsClearDialogOpen(false);
        
        setRiskCore({
            clientType: '',
            clientTypeValue: 0,
            destinationOfFunds: '',
            destinationOfFundsValue: 0,
            fundsType: '',
            fundsTypeValue: 0,
            clientIntroduced: '',
            clientIntroducedValue: 0,
            limitation: '',
            limitationValue: 0,
            sourceOfFunds: '',
            sourceOfFundsValue: 0,
            valueOfInstruction: '',
            valueOfInstructionValue: 0,
        });
        setConsideredClientRisk(false);
        setConsideredTransactionRisk(false);
        setTransactionRiskLevel('');
        setConsideredFirmWideSanctions(false);
        setConsideredFirmWideAML(false);
        setLimitationDate(undefined);
        setLimitationDateTbc(false);
    };

    const isComplete = () =>
        Object.values(riskCore).every((v) => v !== '' && v !== 0) &&
        consideredClientRisk === true &&
        consideredTransactionRisk === true &&
        (consideredTransactionRisk ? transactionRiskLevel !== '' : true) &&
        consideredFirmWideSanctions === true &&
        consideredFirmWideAML === true &&
        (riskCore.limitationValue === 1 || limitationDateTbc || !!limitationDate);

    const handleContinue = async () => {
        if (!isComplete() || isSubmitting) return;
        setIsSubmitting(true);
        
        try {
            const riskScore =
                riskCore.clientTypeValue +
                riskCore.destinationOfFundsValue +
                riskCore.fundsTypeValue +
                riskCore.clientIntroducedValue +
                riskCore.limitationValue +
                riskCore.sourceOfFundsValue +
                riskCore.valueOfInstructionValue;

            let riskResult = 'Low Risk';
            if (riskCore.limitationValue === 3 || riskScore >= 16) {
                riskResult = 'High Risk';
            } else if (riskScore >= 11) {
                riskResult = 'Medium Risk';
            }

            // Calculate compliance expiry as 6 months from compliance date
            const complianceExpiry = complianceDate ? new Date(complianceDate.getTime()) : null;
            if (complianceExpiry) {
                complianceExpiry.setMonth(complianceExpiry.getMonth() + 6);
            }

            let limitationText = riskCore.limitation;
            if ([2, 3].includes(riskCore.limitationValue)) {
                const datePart = limitationDateTbc
                    ? 'TBC'
                    : limitationDate
                        ? limitationDate.toLocaleDateString('en-GB')
                        : '';
                if (datePart) limitationText += ` - ${datePart}`;
            }

            const payload = {
                MatterId: instructionRef, // Using instruction ref as matter ID
                InstructionRef: instructionRef,
                RiskAssessor: riskAssessor,
                ComplianceDate: complianceDate?.toISOString().split('T')[0],
                ComplianceExpiry: complianceExpiry?.toISOString().split('T')[0],
                ClientType: riskCore.clientType,
                ClientType_Value: riskCore.clientTypeValue,
                DestinationOfFunds: riskCore.destinationOfFunds,
                DestinationOfFunds_Value: riskCore.destinationOfFundsValue,
                FundsType: riskCore.fundsType,
                FundsType_Value: riskCore.fundsTypeValue,
                HowWasClientIntroduced: riskCore.clientIntroduced,
                HowWasClientIntroduced_Value: riskCore.clientIntroducedValue,
                Limitation: limitationText,
                Limitation_Value: riskCore.limitationValue,
                LimitationDate: limitationDate ? limitationDate.toISOString() : null,
                LimitationDateTbc: limitationDateTbc,
                SourceOfFunds: riskCore.sourceOfFunds,
                SourceOfFunds_Value: riskCore.sourceOfFundsValue,
                ValueOfInstruction: riskCore.valueOfInstruction,
                ValueOfInstruction_Value: riskCore.valueOfInstructionValue,
                TransactionRiskLevel: transactionRiskLevel,
                ClientRiskFactorsConsidered: consideredClientRisk,
                TransactionRiskFactorsConsidered: consideredTransactionRisk,
                FirmWideSanctionsRiskConsidered: consideredFirmWideSanctions,
                FirmWideAMLPolicyConsidered: consideredFirmWideAML,
                RiskScore: riskScore,
                RiskScoreIncrementBy: riskScore,
                RiskAssessmentResult: riskResult,
            };

            const response = await fetch('/api/risk-assessments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API call failed: ${response.status}`);
            }

            const responseData = await response.text();

            // Notify parent of new risk assessment so it can refresh UI and update instruction card
            onSave?.(payload);

            // Show success toast with encouraging message
            setToast({ 
                visible: true, 
                message: `Risk Assessment Complete - ${riskResult}`, 
                type: 'success' 
            });

            // Brief delay to let user see the success state, then navigate back
            // This allows instruction card to display updated risk pill smoothly
            setTimeout(() => {
                setToast((t) => ({ ...t, visible: false }));
                onBack();
            }, 1200);
            
        } catch (err) {
            console.error('❌ Risk assessment submit failed', err);
            setToast({ 
                visible: true, 
                message: 'Failed to save risk assessment', 
                type: 'error' 
            });
            // Auto-hide error after a short delay; stay on page for correction
            setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
        } finally {
            setIsSubmitting(false);
        }
        
    };

    return (
        <div className="risk-assessment-container" style={{
            animation: isSubmitting ? 'none' : 'slideIn 0.3s ease-out',
            opacity: isSubmitting && toast.type === 'success' ? 0.95 : 1,
            transition: toast.type === 'success' && isSubmitting ? 'opacity 0.8s ease-in-out 0.8s' : 'none'
        }}>
            {/* Compact Header */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '12px 16px', 
                borderBottom: `1px solid ${isDarkMode ? colours.dark.border : '#e1dfdd'}`,
                background: isDarkMode ? colours.dark.sectionBackground : '#fff',
                color: isDarkMode ? colours.dark.text : undefined,
                borderRadius: '8px 8px 0 0',
                marginBottom: '0',
                gap: 8
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', minWidth: 0 }}>
                    <i className="ms-Icon ms-Icon--DocumentSearch" style={{ fontSize: 14, opacity: 0.9, flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Risk Assessment</span>
                </div>

                {/* Right side controls - minimal spacing */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    marginLeft: 'auto',
                    flexShrink: 0
                }}>
                    {isSubmitting && (
                        <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0' }}>
                            {toast.type === 'success' ? (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{
                                        animation: 'checkmark 0.6s ease-out 0.2s both'
                                    }}>
                                        <polyline 
                                            points="20,6 9,17 4,12" 
                                            stroke="#16a34a" 
                                            strokeWidth="2" 
                                            strokeLinecap="round" 
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>Saved</span>
                                </>
                            ) : (
                                <>
                                    <Spinner size={SpinnerSize.small} />
                                    <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.9, whiteSpace: 'nowrap' }}>Saving…</span>
                                </>
                            )}
                        </div>
                    )}
                    {/* Buttons provided by child component; hidden during submit */}
                    {!isSubmitting && headerButtons.clearAllButton && (
                        <div style={{ display: 'flex' }}>
                            {headerButtons.clearAllButton}
                        </div>
                    )}
                    {!isSubmitting && headerButtons.jsonButton && (
                        <div style={{ display: 'flex' }}>
                            {headerButtons.jsonButton}
                        </div>
                    )}
                    
                    {/* Exit Button */}
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={isSubmitting}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '4px',
                            fontSize: 14,
                            color: isDarkMode ? colours.dark.text : '#999',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: isSubmitting ? 0.5 : 1,
                            transition: 'background 0.2s ease, color 0.2s ease',
                            flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                            if (!isSubmitting) {
                                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
                                e.currentTarget.style.color = isDarkMode ? '#fff' : '#333';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isSubmitting) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = isDarkMode ? colours.dark.text : '#999';
                            }
                        }}
                        title="Close Risk Assessment"
                    >
                        <i className="ms-Icon ms-Icon--Cancel" style={{ fontSize: 14 }} />
                    </button>
                </div>
            </div>

            {/* Risk Assessment Content */}
            <div style={{ 
                opacity: isSubmitting ? 0.7 : 1, 
                padding: '16px', 
                pointerEvents: isSubmitting ? 'none' : 'auto',
                background: isDarkMode 
                    ? 'linear-gradient(135deg, #111827 0%, #1f2937 50%, #111827 100%)'
                    : 'linear-gradient(135deg, #fafbfc 0%, #f3f4f6 50%, #fafbfc 100%)',
                borderRadius: '0 0 8px 8px',
                minHeight: '500px',
                overflow: 'auto',
                transition: 'opacity 0.3s ease',
                position: 'relative'
            }}>
                {isDarkMode && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: `
                            radial-gradient(circle at 20% 50%, rgba(54, 144, 206, 0.05) 0%, transparent 50%),
                            radial-gradient(circle at 80% 80%, rgba(34, 160, 107, 0.05) 0%, transparent 50%)
                        `,
                        pointerEvents: 'none',
                        borderRadius: '0 0 8px 8px'
                    }} />
                )}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <RiskAssessment
                        riskCore={riskCore}
                        setRiskCore={setRiskCore}
                        consideredClientRisk={consideredClientRisk}
                        setConsideredClientRisk={setConsideredClientRisk}
                        consideredTransactionRisk={consideredTransactionRisk}
                        setConsideredTransactionRisk={setConsideredTransactionRisk}
                        transactionRiskLevel={transactionRiskLevel}
                        setTransactionRiskLevel={setTransactionRiskLevel}
                        consideredFirmWideSanctions={consideredFirmWideSanctions}
                        setConsideredFirmWideSanctions={setConsideredFirmWideSanctions}
                        consideredFirmWideAML={consideredFirmWideAML}
                        setConsideredFirmWideAML={setConsideredFirmWideAML}
                        limitationDate={limitationDate}
                        setLimitationDate={setLimitationDate}
                        limitationDateTbc={limitationDateTbc}
                        setLimitationDateTbc={setLimitationDateTbc}
                        onContinue={handleContinue}
                        isComplete={isComplete}
                        onHeaderButtonsChange={handleHeaderButtonsChange}
                    />
                </div>
            </div>

            {/* Clear All Confirmation Dialog */}
            <Dialog
                hidden={!isClearDialogOpen}
                onDismiss={() => setIsClearDialogOpen(false)}
                dialogContentProps={{
                    type: DialogType.normal,
                    title: 'Clear All Data',
                    subText: 'Are you sure you want to clear all form data? This action cannot be undone.'
                }}
                modalProps={{
                    isBlocking: true
                }}
            >
                <DialogFooter>
                    <PrimaryButton 
                        onClick={doClearAll} 
                        text="Yes, clear all"
                        styles={sharedPrimaryButtonStyles}
                    />
                    <DefaultButton 
                        onClick={() => setIsClearDialogOpen(false)} 
                        text="Cancel"
                        styles={sharedDefaultButtonStyles}
                    />
                </DialogFooter>
            </Dialog>

            {/* CSS animations for completion ticks, checkmark, and smooth transitions */}
            <style>{`
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes checkmark {
                    0% {
                        opacity: 0;
                        transform: scale(0) rotate(-45deg);
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) rotate(0deg);
                    }
                }
                
                @keyframes tickPop {
                    from {
                        opacity: 0;
                        transform: scale(0);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                
                .completion-tick {
                    animation: tickPop 0.3s ease;
                }
                
                .completion-tick.visible {
                    opacity: 1;
                    transform: scale(1);
                }
            `}</style>
            {/* Toast */}
            <OperationStatusToast 
                visible={toast.visible}
                message={toast.message}
                type={toast.type}
            />
        </div>
    );
};

export default RiskAssessmentPage;