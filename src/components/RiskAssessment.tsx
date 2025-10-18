import React, { useRef, useState } from 'react';
// invisible change 2
import {
    Stack,
    PrimaryButton,
    DefaultButton,
    Dialog,
    DialogType,
    DialogFooter,
    DatePicker,
    IDatePickerStyles,
    IButtonStyles,
    Checkbox,
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';
import '../app/styles/MultiSelect.css';
import '../app/styles/InstructionCard.css';

interface Option {
    key: string | number;
    text: string;
}

interface QuestionGroupProps {
    label: string;
    options: Option[];
    selectedKey: string | number | undefined;
    onChange: (key: string | number, text: string) => void;
    showPrompt?: boolean; // Whether to show a prompt when "No" is selected
}

const QuestionGroup: React.FC<QuestionGroupProps> = ({ label, options, selectedKey, onChange, showPrompt = false }) => {
    const { isDarkMode } = useTheme();
    
    // For yes/no questions, use 2-column grid, otherwise responsive grid
    const isYesNoQuestion = options.length === 2 && 
        options.some(opt => opt.text.toLowerCase() === 'yes') && 
        options.some(opt => opt.text.toLowerCase() === 'no');
    
    // Check if "No" is selected and we should show the prompt
    const shouldShowPrompt = showPrompt && isYesNoQuestion && selectedKey === 'no';
    
    // Determine which document URL to show based on the question label
    const getDocumentUrl = () => {
        const labelLower = label.toLowerCase();
        if (labelLower.includes('client risk')) {
            return 'https://drive.google.com/file/d/1_7dX2qSlvuNmOiirQCxQb8NDs6iUSAhT/view?usp=sharing';
        } else if (labelLower.includes('transaction risk')) {
            return 'https://drive.google.com/file/d/1sTRII8MFU3JLpMiUcz-Y6KBQ1pP1nKgT/view?usp=sharing';
        } else if (labelLower.includes('sanctions')) {
            return 'https://drive.google.com/file/d/1Wx-dHdfXuN0-A2YmBYb-OO-Bz2wXevl9/view?usp=sharing';
        } else if (labelLower.includes('aml policy')) {
            return 'https://drive.google.com/file/d/1TcBlV0Pf0lYlNkmdOGRfpx--DcTEC7na/view?usp=sharing';
        }
        return '#';
    };
    
    return (
        <Stack tokens={{ childrenGap: 3 }} styles={{ root: { marginBottom: 6 } }}>
            <div className="question-banner" style={{ 
                width: '100%', 
                boxSizing: 'border-box', 
                fontSize: 9, 
                padding: '3px 6px', 
                fontWeight: 600, 
                color: isDarkMode ? colours.dark.text : '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                opacity: 0.8
            }}>
                {label}
            </div>
            <div 
                style={{
                    display: 'grid',
                    gridTemplateColumns: isYesNoQuestion 
                        ? 'repeat(2, 1fr)' 
                        : 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '3px',
                    width: '100%'
                }}
            >
                {options.map((option) => {
                    const isSelected = option.key === selectedKey;
                    return (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => onChange(option.key, option.text)}
                            className="client-details-contact-bigbtn"
                            style={{
                                background: isSelected 
                                    ? (isDarkMode ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.15) 0%, rgba(54, 144, 206, 0.08) 100%)' : 'linear-gradient(135deg, #E7F1FF 0%, #F0F7FF 100%)')
                                    : (isDarkMode ? colours.dark.sectionBackground : '#fff'),
                                border: isSelected 
                                    ? '1px solid #3690CE' 
                                    : (isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid #e1dfdd'),
                                color: isSelected 
                                    ? (isDarkMode ? colours.blue : '#1B5C85')
                                    : (isDarkMode ? colours.dark.text : '#061733'),
                                padding: '4px 8px',
                                fontSize: '10px',
                                fontWeight: 500,
                                borderRadius: 4,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                textAlign: 'left',
                                justifyContent: 'flex-start',
                                display: 'flex',
                                alignItems: 'center',
                                minHeight: 28,
                                boxShadow: isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(6,23,51,0.04)',
                                whiteSpace: 'normal',
                                wordWrap: 'break-word',
                                hyphens: 'auto',
                                lineHeight: 1.2
                            }}
                            onMouseEnter={(e) => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.1)' : '#f4f9ff';
                                    e.currentTarget.style.borderColor = '#3690CE';
                                    e.currentTarget.style.color = isDarkMode ? colours.blue : '#1B5C85';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = isDarkMode ? colours.dark.sectionBackground : '#fff';
                                    e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : '#e1dfdd';
                                    e.currentTarget.style.color = isDarkMode ? colours.dark.text : '#061733';
                                }
                            }}
                        >
                            {option.text}
                        </button>
                    );
                })}
            </div>
            {shouldShowPrompt && (
                <div style={{
                    background: isDarkMode ? 'rgba(255, 185, 0, 0.08)' : '#FFFDF5',
                    borderLeft: '2px solid #FFB900',
                    padding: '3px 6px',
                    color: isDarkMode ? '#fbbf24' : '#8A6D00',
                    fontSize: 9,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 3,
                    borderRadius: 3
                }}>
                    <span style={{ fontSize: 8 }}>📋</span>
                    Document available
                    <a 
                        href={getDocumentUrl()} 
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#1B5C85', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
                    >
                        here
                    </a>
                </div>
            )}
        </Stack>
    );
};

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

// Modern DatePicker styles from ReportingHome/ManagementDashboard
const getModernDatePickerStyles = (isDarkMode: boolean): Partial<IDatePickerStyles> => {
    const baseBorder = isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)';
    const hoverBorder = isDarkMode ? 'rgba(135, 206, 255, 0.5)' : 'rgba(54, 144, 206, 0.4)';
    const focusBorder = isDarkMode ? '#87ceeb' : colours.blue;
    const backgroundColour = isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
    const hoverBackground = isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 1)';
    const focusBackground = isDarkMode ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)';

    return {
        root: { 
            width: 180,
            '.ms-DatePicker': {
                fontFamily: 'Raleway, sans-serif !important',
            }
        },
        textField: {
            root: {
                fontFamily: 'Raleway, sans-serif !important',
                width: '100% !important',
            },
            fieldGroup: {
                height: '36px !important',
                borderRadius: '8px !important',
                border: `1px solid ${baseBorder} !important`,
                background: `${backgroundColour} !important`,
                padding: '0 12px !important',
                boxShadow: isDarkMode 
                    ? '0 2px 4px rgba(0, 0, 0, 0.2) !important' 
                    : '0 1px 3px rgba(15, 23, 42, 0.08) !important',
                transition: 'all 0.2s ease !important',
                selectors: {
                    ':hover': {
                        border: `1px solid ${hoverBorder} !important`,
                        background: `${hoverBackground} !important`,
                        boxShadow: isDarkMode 
                            ? '0 4px 8px rgba(0, 0, 0, 0.25) !important' 
                            : '0 2px 6px rgba(15, 23, 42, 0.12) !important',
                        transform: 'translateY(-1px) !important',
                    },
                    ':focus-within': {
                        border: `1px solid ${focusBorder} !important`,
                        background: `${focusBackground} !important`,
                        boxShadow: isDarkMode 
                            ? `0 0 0 3px rgba(135, 206, 235, 0.1), 0 4px 12px rgba(0, 0, 0, 0.25) !important`
                            : `0 0 0 3px rgba(54, 144, 206, 0.1), 0 2px 8px rgba(15, 23, 42, 0.15) !important`,
                        transform: 'translateY(-1px) !important',
                    }
                }
            },
            field: {
                fontSize: '13px !important',
                color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
                fontFamily: 'Raleway, sans-serif !important',
                fontWeight: '500 !important',
                background: 'transparent !important',
                lineHeight: '20px !important',
                border: 'none !important',
                outline: 'none !important',
                padding: '0 !important',
            },
        },
        icon: {
            color: `${isDarkMode ? colours.blue : colours.blue} !important`,
            fontSize: '14px !important',
            fontWeight: 'bold !important',
            right: '8px !important',
        },
        callout: {
            fontSize: '13px !important',
            borderRadius: '12px !important',
            border: `1px solid ${baseBorder} !important`,
            boxShadow: isDarkMode 
                ? '0 8px 24px rgba(0, 0, 0, 0.4) !important' 
                : '0 6px 20px rgba(15, 23, 42, 0.15) !important',
        },
        wrapper: { 
            borderRadius: '12px !important',
        },
    };
};

// Modern Checkbox styles matching ReportingHome/ManagementDashboard
const getModernCheckboxStyles = (isDarkMode: boolean) => {
    return {
        root: {
            alignItems: 'center',
            marginTop: '8px',
        },
        checkbox: {
            width: '18px !important',
            height: '18px !important',
            borderRadius: '4px !important',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(15, 23, 42, 0.3)'} !important`,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : '#ffffff !important',
            transition: 'all 0.2s ease !important',
            selectors: {
                ':hover': {
                    borderColor: `${isDarkMode ? 'rgba(135, 206, 255, 0.6)' : 'rgba(54, 144, 206, 0.5)'} !important`,
                    background: `${isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 1)'} !important`,
                    transform: 'translateY(-1px) !important',
                    boxShadow: isDarkMode 
                        ? '0 2px 6px rgba(0, 0, 0, 0.15) !important' 
                        : '0 2px 4px rgba(15, 23, 42, 0.08) !important',
                },
                ':focus': {
                    borderColor: `${colours.blue} !important`,
                    boxShadow: isDarkMode 
                        ? `0 0 0 3px rgba(135, 206, 235, 0.15), 0 2px 8px rgba(0, 0, 0, 0.2) !important`
                        : `0 0 0 3px rgba(54, 144, 206, 0.15), 0 2px 6px rgba(15, 23, 42, 0.1) !important`,
                }
            }
        },
        checkmark: {
            color: '#ffffff !important',
            fontSize: '12px !important',
            fontWeight: 'bold !important',
        },
        text: {
            fontSize: '13px !important',
            fontFamily: 'Raleway, sans-serif !important',
            fontWeight: '500 !important',
            color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
            marginLeft: '8px !important',
        },
        label: {
            fontSize: '13px !important',
            fontFamily: 'Raleway, sans-serif !important',
            fontWeight: '500 !important',
            color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
            alignItems: 'center !important',
        }
    };
};

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
    { key: 1, text: "Clients named account" },
    { key: 2, text: "3rd Party UK or Client's EU account" },
    { key: 3, text: "Any other account" },
];

const valueOfInstructionOptions = [
    { key: 1, text: 'Less than £10,000' },
    { key: 2, text: '£10,000 to £500,000' },
    { key: 3, text: 'Above £500,000' },
];


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

    const getPrimaryButtonStyles = (): IButtonStyles => ({
        root: {
            padding: '4px 12px',
            backgroundColor: isDarkMode ? colours.dark.cta : colours.cta,
            border: 'none',
            height: '32px',
            fontWeight: '600',
            fontSize: '11px',
            color: '#ffffff',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
            transform: 'none !important',
            outline: 'none !important',
            ':focus': {
                outline: 'none !important',
                border: 'none !important',
                transform: 'none !important',
            },
        },
        rootHovered: {
            backgroundColor: isDarkMode ? '#005a9e' : colours.cta,
            background: isDarkMode 
                ? 'radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), #005a9e !important'
                : `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${colours.cta} !important`,
            boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
            transform: 'none !important',
            outline: 'none !important',
            border: 'none !important',
        },
        rootPressed: {
            backgroundColor: isDarkMode ? '#004578' : colours.cta,
            background: isDarkMode 
                ? 'radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 100%), #004578 !important'
                : `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${colours.cta} !important`,
            boxShadow: '0 0 8px rgba(0,0,0,0.3) !important',
            transform: 'none !important',
            outline: 'none !important',
            border: 'none !important',
        },
        rootFocused: {
            backgroundColor: isDarkMode ? colours.dark.cta : colours.cta,
            transform: 'none !important',
            outline: 'none !important',
            border: 'none !important',
        },
        rootDisabled: {
            backgroundColor: isDarkMode ? colours.dark.disabledBackground : '#cccccc',
            color: isDarkMode ? colours.dark.text : '#666666',
            opacity: 0.6,
            border: 'none !important',
        },
        label: {
            color: '#ffffff !important',
        },
        labelDisabled: {
            color: isDarkMode ? colours.dark.text : '#666666',
        },
    });
    
    const getDefaultButtonStyles = (): IButtonStyles => ({
        root: {
            padding: '4px 12px',
            borderRadius: '4px',
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.secondaryButtonBackground,
            border: isDarkMode ? `1px solid ${colours.dark.border}` : 'none',
            height: '32px',
            fontWeight: 'normal',
            fontSize: '11px',
            color: isDarkMode ? colours.dark.text : '#000000',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
            transform: 'none !important',
            outline: 'none !important',
            ':focus': {
                outline: 'none !important',
                border: isDarkMode ? `1px solid ${colours.dark.border}` : 'none',
                transform: 'none !important',
            },
        },
        rootHovered: {
            backgroundColor: isDarkMode ? colours.dark.cardHover : colours.secondaryButtonBackground,
            background: isDarkMode 
                ? `radial-gradient(circle at center, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 100%), ${colours.dark.cardHover} !important`
                : `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 100%), ${colours.secondaryButtonBackground} !important`,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15) !important',
            transform: 'none !important',
            outline: 'none !important',
        },
        rootPressed: {
            backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.secondaryButtonBackground,
            background: isDarkMode 
                ? `radial-gradient(circle at center, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 100%), ${colours.dark.inputBackground} !important`
                : `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${colours.secondaryButtonBackground} !important`,
            boxShadow: '0 0 8px rgba(0,0,0,0.2) !important',
            transform: 'none !important',
            outline: 'none !important',
        },
        rootFocused: {
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.secondaryButtonBackground,
            transform: 'none !important',
            outline: 'none !important',
        },
        label: {
            color: isDarkMode ? colours.dark.text : '#000000',
            fontWeight: 'normal !important',
        },
    });

    const initialRiskCore = useRef<RiskCore>(riskCore);
    const initialClientRisk = useRef<boolean | undefined>(consideredClientRisk);
    const initialTransactionRisk = useRef<boolean | undefined>(consideredTransactionRisk);
    const initialTransactionLevel = useRef<string>(transactionRiskLevel);
    const initialFirmWideSanctions = useRef<boolean | undefined>(consideredFirmWideSanctions);
    const initialFirmWideAML = useRef<boolean | undefined>(consideredFirmWideAML);

    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
    const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);

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
        setConsideredClientRisk(false);
        setConsideredTransactionRisk(false);
        setTransactionRiskLevel('');
        setConsideredFirmWideSanctions(false);
        setConsideredFirmWideAML(false);
        setJsonPreviewOpen(false);
    };

    const handleClearAll = () => {
        if (hasDataToClear()) {
            setIsClearDialogOpen(true);
        } else {
            doClearAll();
        }
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

    // Pass buttons to parent component
    React.useEffect(() => {
        if (onHeaderButtonsChange) {
            onHeaderButtonsChange({
                clearAllButton: hasDataToClear() ? (
                    <button
                        type="button"
                        onClick={() => setIsClearDialogOpen(true)}
                        style={{
                            background: isDarkMode ? colours.dark.sectionBackground : '#fff',
                            border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid #e1e5e9',
                            borderRadius: 0,
                            padding: '6px 10px',
                            fontSize: 10,
                            fontWeight: 500,
                            color: '#D65541',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: 'Raleway, sans-serif',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(214, 85, 65, 0.1)' : '#ffefed';
                            e.currentTarget.style.borderColor = '#D65541';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDarkMode ? colours.dark.sectionBackground : '#fff';
                            e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : '#e1e5e9';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                        }}
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-10-2-1-2-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2m-6 5v6m4-6v6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        Clear All
                    </button>
                ) : null,
                jsonButton: (
                    <button
                        type="button"
                        onClick={() => setJsonPreviewOpen(!jsonPreviewOpen)}
                        style={{
                            background: isDarkMode ? colours.dark.cardBackground : '#f8f9fa',
                            border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid #e1dfdd',
                            borderRadius: 0,
                            padding: '6px 8px',
                            fontSize: 10,
                            fontWeight: 500,
                            color: '#3690CE',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s ease, border-color 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.1)' : '#e7f1ff';
                            e.currentTarget.style.borderColor = '#3690CE';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDarkMode ? colours.dark.cardBackground : '#f8f9fa';
                            e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : '#e1dfdd';
                        }}
                    >
                        <i className="ms-Icon ms-Icon--Code" style={{ fontSize: 11 }} />
                    </button>
                )
            });
        }
    }, [hasDataToClear(), jsonPreviewOpen, onHeaderButtonsChange]);


    // Use responsive breakpoint instead of window.innerWidth
    const [isWideScreen, setIsWideScreen] = useState(true);

    React.useEffect(() => {
        const checkScreenSize = () => {
            setIsWideScreen(window.innerWidth > 768);
        };
        
        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);
        return () => window.removeEventListener('resize', checkScreenSize);
    }, []);

    return (
        <Stack tokens={{ childrenGap: 8 }} horizontalAlign="center" styles={{ root: { padding: '0 8px' } }}>

            <Stack 
                horizontal={isWideScreen} 
                tokens={{ childrenGap: 12 }} 
                styles={{ 
                    root: { 
                        width: '100%',
                        flexDirection: isWideScreen ? 'row' : 'column'
                    } 
                }}
            >
                <Stack tokens={{ childrenGap: 6 }} styles={{ root: { flex: isWideScreen ? 3 : 1 } }}>
                    {/* Section: Client & Instruction */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.dark.text : '#6B7280', textTransform: 'uppercase', margin: '0 0 1px', opacity: 0.6 }}>Client & Instruction</div>
                    <QuestionGroup
                        label="Client Type"
                        options={clientTypeOptions}
                        selectedKey={riskCore.clientTypeValue}
                        onChange={(k, t) =>
                            setRiskCore({
                                ...riskCore,
                                clientType: t,
                                clientTypeValue: Number(k) || 0,
                            })
                        }
                    />
                    <QuestionGroup
                        label="Destination of Funds"
                        options={destinationOfFundsOptions}
                        selectedKey={riskCore.destinationOfFundsValue}
                        onChange={(k, t) =>
                            setRiskCore({
                                ...riskCore,
                                destinationOfFunds: t,
                                destinationOfFundsValue: Number(k) || 0,
                            })
                        }
                    />
                    <QuestionGroup
                        label="Funds Type"
                        options={fundsTypeOptions}
                        selectedKey={riskCore.fundsTypeValue}
                        onChange={(k, t) =>
                            setRiskCore({
                                ...riskCore,
                                fundsType: t,
                                fundsTypeValue: Number(k) || 0,
                            })
                        }
                    />
                    <QuestionGroup
                        label="How was Client Introduced?"
                        options={introducedOptions}
                        selectedKey={riskCore.clientIntroducedValue}
                        onChange={(k, t) =>
                            setRiskCore({
                                ...riskCore,
                                clientIntroduced: t,
                                clientIntroducedValue: Number(k) || 0,
                            })
                        }
                    />
                    {/* Section: Funds */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.dark.text : '#6B7280', textTransform: 'uppercase', margin: '3px 0 1px', opacity: 0.6 }}>Funds</div>
                    <QuestionGroup
                        label="Limitation"
                        options={limitationOptions}
                        selectedKey={riskCore.limitationValue}
                        onChange={(k, t) =>
                            setRiskCore({
                                ...riskCore,
                                limitation: t,
                                limitationValue: Number(k) || 0,
                            })
                        }
                    />
                    {[2, 3].includes(riskCore.limitationValue) && (
                        <Stack tokens={{ childrenGap: 4 }} styles={{ root: { marginLeft: 8 } }}>
                            <DatePicker
                                value={limitationDate}
                                onSelectDate={(d) => setLimitationDate(d || undefined)}
                                styles={getModernDatePickerStyles(isDarkMode)}
                                placeholder="Limitation Date"
                                formatDate={(d?: Date) => (d ? d.toLocaleDateString('en-GB') : '')}
                                disabled={limitationDateTbc}
                                allowTextInput={false}
                                isMonthPickerVisible={false}
                                showMonthPickerAsOverlay={true}
                            />
                            <Checkbox
                                label="Limitation Date TBC"
                                checked={limitationDateTbc}
                                onChange={(_, c) => {
                                    setLimitationDateTbc(!!c);
                                    if (c) setLimitationDate(undefined);
                                }}
                                styles={getModernCheckboxStyles(isDarkMode)}
                            />
                        </Stack>
                    )}
                    <QuestionGroup
                        label="Source of Funds"
                        options={sourceOfFundsOptions}
                        selectedKey={riskCore.sourceOfFundsValue}
                        onChange={(k, t) =>
                            setRiskCore({
                                ...riskCore,
                                sourceOfFunds: t,
                                sourceOfFundsValue: Number(k) || 0,
                            })
                        }
                    />
                    <QuestionGroup
                        label="Value of Instruction"
                        options={valueOfInstructionOptions}
                        selectedKey={riskCore.valueOfInstructionValue}
                        onChange={(k, t) =>
                            setRiskCore({
                                ...riskCore,
                                valueOfInstruction: t,
                                valueOfInstructionValue: Number(k) || 0,
                            })
                        }
                    />
                </Stack>

                <Stack tokens={{ childrenGap: 6 }} styles={{ root: { flex: isWideScreen ? 2 : 1 } }}>
                    {/* Score Summary */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 4,
                        padding: '4px 6px',
                        border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid #e1e5e9',
                        borderRadius: 4,
                        background: isDarkMode 
                            ? colours.dark.sectionBackground
                            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                        boxShadow: isDarkMode ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#061733' }}>Score: {riskScore}</div>
                        <div style={{
                            padding: '1px 4px',
                            borderRadius: 999,
                            fontSize: 8,
                            fontWeight: 700,
                            color: '#fff',
                            background: riskResult === 'High Risk' ? '#D65541' : riskResult === 'Medium Risk' ? '#FFB900' : '#22A06B'
                        }}>
                            {riskResult}
                        </div>
                    </div>
                    <QuestionGroup
                        label="I have considered client risk factors"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={
                            consideredClientRisk === undefined
                                ? undefined
                                : consideredClientRisk
                                ? 'yes'
                                : 'no'
                        }
                        onChange={(k) => setConsideredClientRisk(k === 'yes')}
                        showPrompt={true}
                    />
                    <QuestionGroup
                        label="I have considered transaction risk factors"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={
                            consideredTransactionRisk === undefined
                                ? undefined
                                : consideredTransactionRisk
                                ? 'yes'
                                : 'no'
                        }
                        onChange={(k) => setConsideredTransactionRisk(k === 'yes')}
                        showPrompt={true}
                    />
                    {consideredTransactionRisk && (
                        <QuestionGroup
                            label="Transaction Risk Level"
                            options={[
                                { key: 'Low Risk', text: 'Low Risk' },
                                { key: 'Medium Risk', text: 'Medium Risk' },
                                { key: 'High Risk', text: 'High Risk' },
                            ]}
                            selectedKey={transactionRiskLevel}
                            onChange={(k) => setTransactionRiskLevel(k as string)}
                        />
                    )}
                    <QuestionGroup
                        label="I have considered the Firm Wide Sanctions Risk Assessment"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={
                            consideredFirmWideSanctions === undefined
                                ? undefined
                                : consideredFirmWideSanctions
                                ? 'yes'
                                : 'no'
                        }
                        onChange={(k) => setConsideredFirmWideSanctions(k === 'yes')}
                        showPrompt={true}
                    />
                    <QuestionGroup
                        label="I have considered the Firm Wide AML policy"
                        options={[{ key: 'yes', text: 'Yes' }, { key: 'no', text: 'No' }]}
                        selectedKey={
                            consideredFirmWideAML === undefined
                                ? undefined
                                : consideredFirmWideAML
                                ? 'yes'
                                : 'no'
                        }
                        onChange={(k) => setConsideredFirmWideAML(k === 'yes')}
                        showPrompt={true}
                    />
                </Stack>
            </Stack>

            <Stack horizontal tokens={{ childrenGap: 8 }} horizontalAlign="center" styles={{ root: { marginTop: 4 } }}>
                {hasDataToClear() && (
                    <Dialog
                        hidden={!isClearDialogOpen}
                        onDismiss={() => setIsClearDialogOpen(false)}
                        dialogContentProps={{
                            type: DialogType.normal,
                            title: 'Clear All Data',
                            subText: 'Are you sure you want to clear all form data? This action cannot be undone.',
                        }}
                        modalProps={{ isBlocking: true }}
                    >
                        <DialogFooter>
                            <PrimaryButton onClick={doClearAll} text="Yes, clear all" styles={getPrimaryButtonStyles()} />
                            <DefaultButton onClick={() => setIsClearDialogOpen(false)} text="Cancel" styles={getDefaultButtonStyles()} />
                        </DialogFooter>
                    </Dialog>
                )}

                <PrimaryButton
                    text="Continue"
                    onClick={onContinue}
                    disabled={!isComplete()}
                    styles={getPrimaryButtonStyles()}
                />
            </Stack>

            {jsonPreviewOpen && (
                <div
                    style={{
                        marginTop: 8,
                        border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid #e1dfdd',
                        borderRadius: 4,
                        background: isDarkMode ? colours.dark.cardBackground : '#f8f9fa',
                        overflow: 'hidden',
                        width: '100%',
                        maxWidth: '100%',
                    }}
                >
                    <div
                        style={{
                            padding: 8,
                            maxHeight: 200,
                            overflow: 'auto',
                            fontSize: 8,
                            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                            lineHeight: 1.3,
                            background: isDarkMode ? colours.dark.sectionBackground : '#fff',
                            color: isDarkMode ? colours.dark.text : '#000',
                        }}
                    >
                        <pre style={{ 
                            margin: 0, 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-word',
                            color: 'inherit'
                        }}>
                            {JSON.stringify(generateJson(), null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </Stack>
    );
};

export default RiskAssessment;
