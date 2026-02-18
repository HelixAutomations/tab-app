import React, { useRef, useState, useMemo } from 'react';
import {
    DatePicker,
    IDatePickerStyles,
    Checkbox,
    Icon,
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

interface Option {
    key: string | number;
    text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Question Card Component - matches formStyles.ts conventions
// ─────────────────────────────────────────────────────────────────────────────
interface QuestionCardProps {
    label: string;
    options: Option[];
    selectedKey: string | number | undefined;
    onChange: (key: string | number, text: string) => void;
    showPrompt?: boolean;
    requireYes?: boolean; // If true, only 'yes' shows green indicator
    isDarkMode: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ 
    label, 
    options, 
    selectedKey, 
    onChange, 
    showPrompt = false,
    requireYes = false,
    isDarkMode 
}) => {
    const isYesNoQuestion = options.length === 2 && 
        options.some(opt => opt.text.toLowerCase() === 'yes') && 
        options.some(opt => opt.text.toLowerCase() === 'no');
    
    const shouldShowPrompt = showPrompt && isYesNoQuestion && selectedKey === 'no';
    
    const getDocumentUrl = () => {
        const labelLower = label.toLowerCase();
        if (labelLower.includes('client risk')) {
            return 'https://drive.google.com/file/d/1_7dX2qSlvuNmOiirQCxQb8NDs6iUSAhT/view?usp=sharing';
        } else if (labelLower.includes('transaction risk')) {
            return 'https://drive.google.com/file/d/1sTRII8MFU3JLpMiUcz-Y6KBQ1pP1nKgT/view?usp=sharing';
        } else if (labelLower.includes('sanctions')) {
            return 'https://drive.google.com/file/d/1y7fTLI_Dody00y9v42ohltQU-hnnYJ9P/view?usp=sharing';
        } else if (labelLower.includes('aml policy')) {
            return 'https://drive.google.com/file/d/1opiC3TbEsdEH4ExDjckIhQzzsI3_wYYB/view?usp=sharing';
        }
        return '#';
    };

    const isAnswered = selectedKey !== undefined && selectedKey !== '';
    // For compliance questions requiring Yes, only show complete state for Yes answers
    const isComplete = requireYes ? selectedKey === 'yes' : isAnswered;

    return (
        <div style={{
            background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
            borderLeft: isComplete 
                ? `3px solid ${colours.green}` 
                : `3px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`,
            borderRadius: 0,
            padding: '12px 14px',
            transition: 'border-left-color 0.2s ease',
        }}>
            {/* Question Label */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
            }}>
                <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDarkMode ? '#e2e8f0' : '#374151',
                    lineHeight: 1.4,
                }}>
                    {label}
                </span>
                {isComplete && (
                    <Icon 
                        iconName="CheckMark" 
                        style={{ 
                            fontSize: 12, 
                            color: colours.green,
                            flexShrink: 0,
                            marginLeft: 8,
                        }}
                    />
                )}
            </div>

            {/* Options */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: isYesNoQuestion ? 'repeat(2, 1fr)' : '1fr',
                gap: 6,
            }}>
                {options.map((option) => {
                    const isSelected = option.key === selectedKey;
                    return (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => onChange(option.key, option.text)}
                            style={{
                                background: isSelected 
                                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.08)')
                                    : (isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#f8fafc'),
                                border: isSelected 
                                    ? `1px solid ${colours.highlight}` 
                                    : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.08)'}`,
                                borderRadius: 0,
                                color: isSelected 
                                    ? colours.highlight
                                    : (isDarkMode ? '#e2e8f0' : '#374151'),
                                padding: isYesNoQuestion ? '10px 16px' : '10px 12px',
                                fontSize: 12,
                                fontWeight: isSelected ? 600 : 500,
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                textAlign: isYesNoQuestion ? 'center' : 'left',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: isYesNoQuestion ? 'center' : 'flex-start',
                                gap: 8,
                                lineHeight: 1.4,
                            }}
                            onMouseEnter={(e) => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = isDarkMode 
                                        ? 'rgba(54, 144, 206, 0.08)' 
                                        : 'rgba(54, 144, 206, 0.04)';
                                    e.currentTarget.style.borderColor = isDarkMode 
                                        ? 'rgba(54, 144, 206, 0.3)' 
                                        : 'rgba(54, 144, 206, 0.2)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = isDarkMode 
                                        ? 'rgba(15, 23, 42, 0.5)' 
                                        : '#f8fafc';
                                    e.currentTarget.style.borderColor = isDarkMode 
                                        ? 'rgba(148, 163, 184, 0.15)' 
                                        : 'rgba(0, 0, 0, 0.08)';
                                }
                            }}
                        >
                            {isYesNoQuestion && (
                                <span style={{ 
                                    width: 14, 
                                    height: 14, 
                                    borderRadius: '50%',
                                    border: isSelected 
                                        ? `2px solid ${colours.highlight}`
                                        : `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: isSelected ? colours.highlight : 'transparent',
                                    transition: 'all 0.15s ease',
                                    flexShrink: 0,
                                }}>
                                    {isSelected && (
                                        <span style={{ 
                                            width: 5, 
                                            height: 5, 
                                            borderRadius: '50%', 
                                            background: '#fff' 
                                        }} />
                                    )}
                                </span>
                            )}
                            {option.text}
                        </button>
                    );
                })}
            </div>

            {/* Warning Prompt */}
            {shouldShowPrompt && (
                <div style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    background: isDarkMode ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.06)',
                    border: `1px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)'}`,
                    borderLeft: `3px solid ${colours.orange}`,
                    borderRadius: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <Icon iconName="Warning" style={{ fontSize: 14, color: colours.orange, flexShrink: 0 }} />
                    <span style={{
                        fontSize: 11,
                        color: isDarkMode ? colours.orange : '#92400e',
                        fontWeight: 500,
                        lineHeight: 1.4,
                    }}>
                        Document available{' '}
                        <a 
                            href={getDocumentUrl()} 
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ 
                                color: colours.highlight, 
                                textDecoration: 'underline', 
                                fontWeight: 600 
                            }}
                        >
                            here
                        </a>
                    </span>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Risk Core Interface & Options
// ─────────────────────────────────────────────────────────────────────────────
export interface RiskCore {
    clientType: string;
    clientTypeValue: number;
    destinationOfFunds: string;
    destinationOfFundsValue: number;
    fundsType: string;
    fundsTypeValue: number;
    clientIntroduced: string;
    clientIntroducedValue: number;
    limitation: string;
    limitationValue: number;
    sourceOfFunds: string;
    sourceOfFundsValue: number;
    valueOfInstruction: string;
    valueOfInstructionValue: number;
}

const clientTypeOptions = [
    { key: 1, text: 'Individual or Company registered in England and Wales with Companies House' },
    { key: 2, text: 'Group Company or Subsidiary, Trust' },
    { key: 3, text: 'Non UK Company' },
];

const destinationOfFundsOptions = [
    { key: 1, text: 'Client within UK' },
    { key: 2, text: 'Client in EU/3rd party in UK' },
    { key: 3, text: 'Outwith UK or Client outwith EU' },
];

const fundsTypeOptions = [
    { key: 1, text: 'Personal Cheque, BACS' },
    { key: 2, text: 'Cash payment if less than £1,000' },
    { key: 3, text: 'Cash payment above £1,000' },
];

const introducedOptions = [
    { key: 1, text: 'Existing client introduction, personal introduction' },
    { key: 2, text: 'Internet Enquiry' },
    { key: 3, text: 'Other' },
];

const limitationOptions = [
    { key: 1, text: 'There is no applicable limitation period' },
    { key: 2, text: 'There is greater than 6 months to the expiry of the limitation period' },
    { key: 3, text: 'There is less than 6 months to limitation expiry' },
];

const sourceOfFundsOptions = [
    { key: 1, text: "Client's named account" },
    { key: 2, text: "3rd Party UK or Client's EU account" },
    { key: 3, text: "Any other account" },
];

const valueOfInstructionOptions = [
    { key: 1, text: 'Less than £10,000' },
    { key: 2, text: '£10,000 to £500,000' },
    { key: 3, text: 'Above £500,000' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
export interface RiskAssessmentProps {
    riskCore: RiskCore;
    setRiskCore: React.Dispatch<React.SetStateAction<RiskCore>>;
    consideredClientRisk: boolean | undefined;
    setConsideredClientRisk: React.Dispatch<React.SetStateAction<boolean | undefined>>;
    consideredTransactionRisk: boolean | undefined;
    setConsideredTransactionRisk: React.Dispatch<React.SetStateAction<boolean | undefined>>;
    transactionRiskLevel: string;
    setTransactionRiskLevel: React.Dispatch<React.SetStateAction<string>>;
    consideredFirmWideSanctions: boolean | undefined;
    setConsideredFirmWideSanctions: React.Dispatch<React.SetStateAction<boolean | undefined>>;
    consideredFirmWideAML: boolean | undefined;
    setConsideredFirmWideAML: React.Dispatch<React.SetStateAction<boolean | undefined>>;
    limitationDate: Date | undefined;
    setLimitationDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
    limitationDateTbc: boolean;
    setLimitationDateTbc: React.Dispatch<React.SetStateAction<boolean>>;
    onContinue: () => void;
    isComplete: () => boolean;
    onHeaderButtonsChange?: (buttons: { clearAllButton: React.ReactNode | null; jsonButton: React.ReactNode }) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const RiskAssessment: React.FC<RiskAssessmentProps> = ({
    riskCore,
    setRiskCore,
    consideredClientRisk,
    setConsideredClientRisk,
    consideredTransactionRisk,
    setConsideredTransactionRisk,
    transactionRiskLevel,
    setTransactionRiskLevel,
    consideredFirmWideSanctions,
    setConsideredFirmWideSanctions,
    consideredFirmWideAML,
    setConsideredFirmWideAML,
    limitationDate,
    setLimitationDate,
    limitationDateTbc,
    setLimitationDateTbc,
    onContinue,
    isComplete,
    onHeaderButtonsChange,
}) => {
    const { isDarkMode } = useTheme();
    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
    const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);
    const [isWideScreen, setIsWideScreen] = useState(window.innerWidth > 900);

    // Track initial values for clear detection
    const initialRiskCore = useRef<RiskCore>(riskCore);
    const initialClientRisk = useRef<boolean | undefined>(consideredClientRisk);
    const initialTransactionRisk = useRef<boolean | undefined>(consideredTransactionRisk);
    const initialTransactionLevel = useRef<string>(transactionRiskLevel);
    const initialFirmWideSanctions = useRef<boolean | undefined>(consideredFirmWideSanctions);
    const initialFirmWideAML = useRef<boolean | undefined>(consideredFirmWideAML);

    // Responsive handling
    React.useEffect(() => {
        const checkScreenSize = () => setIsWideScreen(window.innerWidth > 900);
        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);
        return () => window.removeEventListener('resize', checkScreenSize);
    }, []);

    // Calculate risk score
    const riskScore = useMemo(() => 
        riskCore.clientTypeValue +
        riskCore.destinationOfFundsValue +
        riskCore.fundsTypeValue +
        riskCore.clientIntroducedValue +
        riskCore.limitationValue +
        riskCore.sourceOfFundsValue +
        riskCore.valueOfInstructionValue
    , [riskCore]);

    const riskResult = useMemo(() => {
        if (riskCore.limitationValue === 3 || riskScore >= 16) return 'High Risk';
        if (riskScore >= 11) return 'Medium Risk';
        return 'Low Risk';
    }, [riskScore, riskCore.limitationValue]);

    const riskColor = riskResult === 'High Risk' ? colours.cta 
        : riskResult === 'Medium Risk' ? colours.orange 
        : colours.green;

    // Progress calculation
    const totalQuestions = 11;
    const answeredQuestions = useMemo(() => {
        let count = 0;
        if (riskCore.clientTypeValue) count++;
        if (riskCore.destinationOfFundsValue) count++;
        if (riskCore.fundsTypeValue) count++;
        if (riskCore.clientIntroducedValue) count++;
        if (riskCore.limitationValue) count++;
        if (riskCore.sourceOfFundsValue) count++;
        if (riskCore.valueOfInstructionValue) count++;
        // Compliance questions only count when answered YES (true)
        if (consideredClientRisk === true) count++;
        if (consideredTransactionRisk === true) count++;
        if (consideredFirmWideSanctions === true) count++;
        if (consideredFirmWideAML === true) count++;
        return count;
    }, [riskCore, consideredClientRisk, consideredTransactionRisk, consideredFirmWideSanctions, consideredFirmWideAML]);

    const progressPercent = (answeredQuestions / totalQuestions) * 100;

    const hasDataToClear = () => {
        const coreChanged = Object.entries(riskCore).some(
            ([k, v]) => (initialRiskCore.current as any)[k] !== v
        );
        return (
            coreChanged ||
            consideredClientRisk !== initialClientRisk.current ||
            consideredTransactionRisk !== initialTransactionRisk.current ||
            transactionRiskLevel !== initialTransactionLevel.current ||
            consideredFirmWideSanctions !== initialFirmWideSanctions.current ||
            consideredFirmWideAML !== initialFirmWideAML.current
        );
    };

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
        setConsideredClientRisk(undefined);
        setConsideredTransactionRisk(undefined);
        setTransactionRiskLevel('');
        setConsideredFirmWideSanctions(undefined);
        setConsideredFirmWideAML(undefined);
        setJsonPreviewOpen(false);
    };

    const generateJson = () => ({
        ComplianceDate: new Date().toISOString().split('T')[0],
        ClientType: riskCore.clientType,
        ClientType_Value: riskCore.clientTypeValue,
        DestinationOfFunds: riskCore.destinationOfFunds,
        DestinationOfFunds_Value: riskCore.destinationOfFundsValue,
        FundsType: riskCore.fundsType,
        FundsType_Value: riskCore.fundsTypeValue,
        HowWasClientIntroduced: riskCore.clientIntroduced,
        HowWasClientIntroduced_Value: riskCore.clientIntroducedValue,
        Limitation: riskCore.limitation,
        Limitation_Value: riskCore.limitationValue,
        SourceOfFunds: riskCore.sourceOfFunds,
        SourceOfFunds_Value: riskCore.sourceOfFundsValue,
        ValueOfInstruction: riskCore.valueOfInstruction,
        ValueOfInstruction_Value: riskCore.valueOfInstructionValue,
        TransactionRiskLevel: transactionRiskLevel || null,
        ClientRiskFactorsConsidered: consideredClientRisk,
        TransactionRiskFactorsConsidered: consideredTransactionRisk,
        FirmWideSanctionsRiskConsidered: consideredFirmWideSanctions,
        FirmWideAMLPolicyConsidered: consideredFirmWideAML,
    });

    // Pass header buttons to parent
    React.useEffect(() => {
        if (onHeaderButtonsChange) {
            onHeaderButtonsChange({
                clearAllButton: hasDataToClear() ? (
                    <button
                        type="button"
                        onClick={() => setIsClearDialogOpen(true)}
                        style={{
                            background: 'transparent',
                            border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)'}`,
                            borderRadius: 0,
                            padding: '6px 12px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: colours.cta,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontFamily: 'inherit',
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.05)';
                            e.currentTarget.style.borderColor = colours.cta;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)';
                        }}
                    >
                        <Icon iconName="Cancel" style={{ fontSize: 10 }} />
                        Clear
                    </button>
                ) : null,
                jsonButton: (
                    <button
                        type="button"
                        onClick={() => setJsonPreviewOpen(!jsonPreviewOpen)}
                        style={{
                            background: jsonPreviewOpen 
                                ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                                : 'transparent',
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)'}`,
                            borderRadius: 0,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: colours.highlight,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: 'inherit',
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.06)';
                            e.currentTarget.style.borderColor = colours.highlight;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = jsonPreviewOpen 
                                ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                                : 'transparent';
                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)';
                        }}
                    >
                        {'{ }'}
                    </button>
                )
            });
        }
    }, [hasDataToClear(), jsonPreviewOpen, isDarkMode, onHeaderButtonsChange]);

    // DatePicker styles - matching formStyles conventions
    const datePickerStyles: Partial<IDatePickerStyles> = {
        root: { width: '100%', maxWidth: 200 },
        textField: {
            fieldGroup: {
                height: 40,
                borderRadius: 0,
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
            },
            field: {
                fontSize: 13,
                fontFamily: 'inherit',
                color: isDarkMode ? '#f1f5f9' : '#1e293b',
            },
        },
    };

    return (
        <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
            {/* Progress Header */}
            <div style={{
                marginBottom: 20,
                padding: '14px 18px',
                background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
                borderLeft: `3px solid ${colours.highlight}`,
                borderRadius: 0,
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Icon 
                            iconName="Shield" 
                            style={{ 
                                fontSize: 20, 
                                color: colours.highlight,
                            }} 
                        />
                        <div>
                            <div style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: isDarkMode ? '#f1f5f9' : '#1e293b',
                            }}>
                                Risk Assessment
                            </div>
                            <div style={{
                                fontSize: 11,
                                color: isDarkMode ? '#94a3b8' : '#64748b',
                            }}>
                                {answeredQuestions}/{totalQuestions} questions completed
                            </div>
                        </div>
                    </div>

                    {/* Score Badge */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                    }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: 22,
                                fontWeight: 700,
                                color: isDarkMode ? '#f1f5f9' : '#1e293b',
                                fontFamily: 'monospace',
                                lineHeight: 1,
                            }}>
                                {riskScore}
                            </div>
                            <div style={{
                                fontSize: 9,
                                fontWeight: 600,
                                color: isDarkMode ? '#64748b' : '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                            }}>
                                Score
                            </div>
                        </div>
                        <div style={{
                            padding: '6px 14px',
                            borderRadius: 0,
                            background: isDarkMode ? `${riskColor}15` : `${riskColor}10`,
                            border: `1px solid ${riskColor}30`,
                        }}>
                            <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: riskColor,
                                textTransform: 'uppercase',
                                letterSpacing: '0.3px',
                            }}>
                                {riskResult}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Progress Track */}
                <div style={{
                    height: 4,
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    borderRadius: 0,
                    overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%',
                        width: `${progressPercent}%`,
                        background: progressPercent === 100 ? colours.green : colours.highlight,
                        transition: 'width 0.3s ease',
                    }} />
                </div>
            </div>

            {/* Main Content - Two Column Layout */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: isWideScreen ? '1fr 1fr' : '1fr',
                gap: 20,
            }}>
                {/* Left Column - Core Questions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Section Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                        paddingBottom: 8,
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                        color: colours.highlight,
                        fontWeight: 600,
                        fontSize: 13,
                    }}>
                        <Icon iconName="ContactCard" style={{ fontSize: 14 }} />
                        Client & Transaction Details
                    </div>

                    <QuestionCard
                        label="Client Type"
                        options={clientTypeOptions}
                        selectedKey={riskCore.clientTypeValue || undefined}
                        onChange={(k, t) => setRiskCore({ ...riskCore, clientType: t, clientTypeValue: Number(k) || 0 })}
                        isDarkMode={isDarkMode}
                    />

                    <QuestionCard
                        label="Destination of Funds"
                        options={destinationOfFundsOptions}
                        selectedKey={riskCore.destinationOfFundsValue || undefined}
                        onChange={(k, t) => setRiskCore({ ...riskCore, destinationOfFunds: t, destinationOfFundsValue: Number(k) || 0 })}
                        isDarkMode={isDarkMode}
                    />

                    <QuestionCard
                        label="Funds Type"
                        options={fundsTypeOptions}
                        selectedKey={riskCore.fundsTypeValue || undefined}
                        onChange={(k, t) => setRiskCore({ ...riskCore, fundsType: t, fundsTypeValue: Number(k) || 0 })}
                        isDarkMode={isDarkMode}
                    />

                    <QuestionCard
                        label="How was Client Introduced?"
                        options={introducedOptions}
                        selectedKey={riskCore.clientIntroducedValue || undefined}
                        onChange={(k, t) => setRiskCore({ ...riskCore, clientIntroduced: t, clientIntroducedValue: Number(k) || 0 })}
                        isDarkMode={isDarkMode}
                    />

                    <QuestionCard
                        label="Limitation Period"
                        options={limitationOptions}
                        selectedKey={riskCore.limitationValue || undefined}
                        onChange={(k, t) => setRiskCore({ ...riskCore, limitation: t, limitationValue: Number(k) || 0 })}
                        isDarkMode={isDarkMode}
                    />

                    {/* Limitation Date (conditional) */}
                    {[2, 3].includes(riskCore.limitationValue) && (
                        <div style={{
                            marginLeft: 12,
                            padding: '14px 16px',
                            background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                            borderLeft: `3px solid ${colours.highlight}`,
                            borderRadius: 0,
                        }}>
                            <div style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: isDarkMode ? '#94a3b8' : '#64748b',
                                marginBottom: 10,
                            }}>
                                Limitation Date
                            </div>
                            <DatePicker
                                value={limitationDate}
                                onSelectDate={(d) => setLimitationDate(d || undefined)}
                                styles={datePickerStyles}
                                placeholder="Select date..."
                                formatDate={(d?: Date) => (d ? d.toLocaleDateString('en-GB') : '')}
                                disabled={limitationDateTbc}
                                allowTextInput={false}
                            />
                            <Checkbox
                                label="Limitation Date TBC"
                                checked={limitationDateTbc}
                                onChange={(_, c) => {
                                    setLimitationDateTbc(!!c);
                                    if (c) setLimitationDate(undefined);
                                }}
                                styles={{
                                    root: { marginTop: 12 },
                                    text: { 
                                        fontSize: 12, 
                                        color: isDarkMode ? '#e2e8f0' : '#374151',
                                    },
                                    checkbox: {
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)'}`,
                                    },
                                }}
                            />
                        </div>
                    )}

                    <QuestionCard
                        label="Source of Funds"
                        options={sourceOfFundsOptions}
                        selectedKey={riskCore.sourceOfFundsValue || undefined}
                        onChange={(k, t) => setRiskCore({ ...riskCore, sourceOfFunds: t, sourceOfFundsValue: Number(k) || 0 })}
                        isDarkMode={isDarkMode}
                    />

                    <QuestionCard
                        label="Value of Instruction"
                        options={valueOfInstructionOptions}
                        selectedKey={riskCore.valueOfInstructionValue || undefined}
                        onChange={(k, t) => setRiskCore({ ...riskCore, valueOfInstruction: t, valueOfInstructionValue: Number(k) || 0 })}
                        isDarkMode={isDarkMode}
                    />
                </div>

                {/* Right Column - Compliance Confirmations */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Section Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                        paddingBottom: 8,
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                        color: colours.highlight,
                        fontWeight: 600,
                        fontSize: 13,
                    }}>
                        <Icon iconName="CheckList" style={{ fontSize: 14 }} />
                        Compliance Confirmations
                    </div>

                    <QuestionCard
                        label="I have considered client risk factors"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={consideredClientRisk === undefined ? undefined : consideredClientRisk ? 'yes' : 'no'}
                        onChange={(k) => setConsideredClientRisk(k === 'yes')}
                        showPrompt={true}
                        requireYes={true}
                        isDarkMode={isDarkMode}
                    />

                    <QuestionCard
                        label="I have considered transaction risk factors"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={consideredTransactionRisk === undefined ? undefined : consideredTransactionRisk ? 'yes' : 'no'}
                        onChange={(k) => setConsideredTransactionRisk(k === 'yes')}
                        showPrompt={true}
                        requireYes={true}
                        isDarkMode={isDarkMode}
                    />

                    {/* Transaction Risk Level (conditional) */}
                    {consideredTransactionRisk && (
                        <div style={{
                            marginLeft: 12,
                            borderLeft: `3px solid ${colours.highlight}`,
                        }}>
                            <QuestionCard
                                label="Transaction Risk Level"
                                options={[
                                    { key: 'Low Risk', text: 'Low Risk' },
                                    { key: 'Medium Risk', text: 'Medium Risk' },
                                    { key: 'High Risk', text: 'High Risk' },
                                ]}
                                selectedKey={transactionRiskLevel || undefined}
                                onChange={(k) => setTransactionRiskLevel(k as string)}
                                isDarkMode={isDarkMode}
                            />
                        </div>
                    )}

                    <QuestionCard
                        label="I have considered the Firm Wide Sanctions Risk Assessment"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={consideredFirmWideSanctions === undefined ? undefined : consideredFirmWideSanctions ? 'yes' : 'no'}
                        onChange={(k) => setConsideredFirmWideSanctions(k === 'yes')}
                        showPrompt={true}
                        requireYes={true}
                        isDarkMode={isDarkMode}
                    />

                    <QuestionCard
                        label="I have considered the Firm Wide AML policy"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={consideredFirmWideAML === undefined ? undefined : consideredFirmWideAML ? 'yes' : 'no'}
                        onChange={(k) => setConsideredFirmWideAML(k === 'yes')}
                        showPrompt={true}
                        requireYes={true}
                        isDarkMode={isDarkMode}
                    />

                    {/* Continue Button */}
                    <div style={{ marginTop: 12 }}>
                        <button
                            type="button"
                            onClick={onContinue}
                            disabled={!isComplete()}
                            style={{
                                width: '100%',
                                padding: '14px 24px',
                                background: isComplete()
                                    ? colours.highlight
                                    : (isDarkMode ? '#334155' : '#e2e8f0'),
                                border: 'none',
                                borderRadius: 0,
                                color: isComplete()
                                    ? '#FFFFFF'
                                    : (isDarkMode ? '#64748b' : '#94a3b8'),
                                fontSize: 14,
                                fontWeight: 600,
                                fontFamily: 'inherit',
                                cursor: isComplete() ? 'pointer' : 'not-allowed',
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                                if (isComplete()) {
                                    e.currentTarget.style.background = '#2d7fb8';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (isComplete()) {
                                    e.currentTarget.style.background = colours.highlight;
                                }
                            }}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            </div>

            {/* JSON Preview Panel */}
            {jsonPreviewOpen && (
                <div style={{
                    marginTop: 20,
                    padding: '14px 16px',
                    background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
                    borderRadius: 0,
                }}>
                    <div style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: isDarkMode ? '#64748b' : '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: 10,
                    }}>
                        JSON Output
                    </div>
                    <pre style={{
                        margin: 0,
                        padding: '12px 14px',
                        background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#f8fafc',
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                        borderRadius: 0,
                        fontSize: 10,
                        fontFamily: 'Monaco, Consolas, monospace',
                        color: isDarkMode ? '#e2e8f0' : '#374151',
                        overflow: 'auto',
                        maxHeight: 200,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}>
                        {JSON.stringify(generateJson(), null, 2)}
                    </pre>
                </div>
            )}

            {/* Clear Confirmation Dialog - Custom styled for dark mode */}
            {isClearDialogOpen && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000000,
                    }}
                    onClick={() => setIsClearDialogOpen(false)}
                >
                    <div 
                        style={{
                            background: isDarkMode ? '#1e293b' : '#ffffff',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                            borderRadius: 0,
                            padding: '24px',
                            maxWidth: 360,
                            width: '90%',
                            boxShadow: isDarkMode 
                                ? '0 25px 50px rgba(0, 0, 0, 0.5)' 
                                : '0 25px 50px rgba(0, 0, 0, 0.15)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 16,
                        }}>
                            <Icon 
                                iconName="Warning" 
                                style={{ 
                                    fontSize: 20, 
                                    color: colours.cta,
                                }} 
                            />
                            <span style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: isDarkMode ? '#f1f5f9' : '#1e293b',
                            }}>
                                Clear All Data
                            </span>
                        </div>
                        <p style={{
                            fontSize: 13,
                            color: isDarkMode ? '#94a3b8' : '#64748b',
                            margin: '0 0 20px 0',
                            lineHeight: 1.5,
                        }}>
                            Are you sure you want to clear all form data? This action cannot be undone.
                        </p>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 10,
                        }}>
                            <button
                                type="button"
                                onClick={doClearAll}
                                style={{
                                    background: colours.cta,
                                    border: 'none',
                                    borderRadius: 0,
                                    padding: '10px 18px',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#c44a36'}
                                onMouseLeave={(e) => e.currentTarget.style.background = colours.cta}
                            >
                                Yes, clear all
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsClearDialogOpen(false)}
                                style={{
                                    background: 'transparent',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)'}`,
                                    borderRadius: 0,
                                    padding: '10px 18px',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: isDarkMode ? '#e2e8f0' : '#374151',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.04)';
                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(0, 0, 0, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)';
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RiskAssessment;
