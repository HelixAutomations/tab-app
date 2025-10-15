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
        consideredClientRisk !== undefined &&
        consideredTransactionRisk !== undefined &&
        (consideredTransactionRisk ? transactionRiskLevel !== '' : true) &&
        consideredFirmWideSanctions !== undefined &&
        consideredFirmWideAML !== undefined &&
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

            console.log('📋 Submitting risk assessment:', payload);

            const response = await fetch('/api/risk-assessments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API call failed: ${response.status}`);
            }

            const responseData = await response.text();
            console.log('✅ Risk assessment submitted successfully:', responseData);

            // Notify parent of new risk assessment so it can refresh UI
            onSave?.(payload);

            // Native in-app toast and inline header status
            setToast({ visible: true, message: 'Risk assessment saved', type: 'success' });
            // Briefly show success before navigating back
            setTimeout(() => {
                setToast((t) => ({ ...t, visible: false }));
                onBack();
            }, 900);
            
        } catch (err) {
            console.error('❌ Risk assessment submit failed', err);
            setToast({ visible: true, message: 'Failed to save risk assessment', type: 'error' });
            // Auto-hide error after a short delay; stay on page for correction
            setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
        } finally {
            setIsSubmitting(false);
        }
        
    };

    return (
        <div className="risk-assessment-container">
            {/* Header with breadcrumb-style progress */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '20px 24px', 
                borderBottom: `1px solid ${isDarkMode ? colours.dark.border : '#e1dfdd'}`,
                background: isDarkMode ? colours.dark.sectionBackground : '#fff',
                color: isDarkMode ? colours.dark.text : undefined,
                borderRadius: '8px 8px 0 0',
                marginBottom: '0'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
                    <i className="ms-Icon ms-Icon--DocumentSearch" style={{ fontSize: 18, opacity: 0.9 }} />
                    Risk Assessment
                </div>

                {/* Right side controls */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8
                }}>
                    {isSubmitting && (
                        <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                            <Spinner size={SpinnerSize.small} />
                            <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>Saving…</span>
                        </div>
                    )}
                    {/* Buttons provided by child component; hidden during submit */}
                    {!isSubmitting && headerButtons.clearAllButton}
                    {!isSubmitting && headerButtons.jsonButton}
                    
                    {/* Exit Button */}
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={isSubmitting}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '8px',
                            fontSize: 16,
                            color: isDarkMode ? colours.dark.text : '#666',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: isSubmitting ? 0.5 : 1,
                            transition: 'background 0.2s ease, color 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            if (!isSubmitting) {
                                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                                e.currentTarget.style.color = isDarkMode ? '#fff' : '#333';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isSubmitting) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = isDarkMode ? colours.dark.text : '#666';
                            }
                        }}
                        title="Close Risk Assessment"
                    >
                        <i className="ms-Icon ms-Icon--Cancel" style={{ fontSize: 16 }} />
                    </button>
                </div>
            </div>

            {/* Risk Assessment Content */}
            <div style={{ 
                opacity: isSubmitting ? 0.7 : 1, 
                padding: '24px', 
                pointerEvents: isSubmitting ? 'none' : 'auto',
                background: isDarkMode ? colours.dark.background : '#fafbfc',
                borderRadius: '0 0 8px 8px',
                minHeight: '500px'
            }}>
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

            {/* CSS animations for completion ticks and pulse animation */}
            <style>{`
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