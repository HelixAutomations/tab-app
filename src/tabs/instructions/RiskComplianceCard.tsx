import React from 'react';
import { format } from 'date-fns';
import { mergeStyles } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { 
  FaShieldAlt, 
  FaUser, 
  FaUsers, 
  FaFileAlt, 
  FaDownload, 
  FaCalendarAlt, 
  FaClipboardList,
  FaFilePdf,
  FaFileWord,
  FaFileExcel,
  FaFilePowerpoint,
  FaFileArchive,
  FaFileImage,
  FaFileAudio,
  FaFileVideo,
  FaFileUpload,
  FaLink,
  FaUserShield,
  FaMapMarkerAlt,
  FaBirthdayCake,
  FaPhone,
  FaFlag,
  FaIdCard,
  FaClock,
  FaBuilding
} from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import { ClientInfo } from './JointClientCard';

// File type icon mapping
const iconMap: Record<string, JSX.Element> = {
  pdf: <FaFilePdf style={{ fontSize: '20px' }} />,
  doc: <FaFileWord style={{ fontSize: '20px' }} />,
  docx: <FaFileWord style={{ fontSize: '20px' }} />,
  xls: <FaFileExcel style={{ fontSize: '20px' }} />,
  xlsx: <FaFileExcel style={{ fontSize: '20px' }} />,
  ppt: <FaFilePowerpoint style={{ fontSize: '20px' }} />,
  pptx: <FaFilePowerpoint style={{ fontSize: '20px' }} />,
  txt: <FaFileAlt style={{ fontSize: '20px' }} />,
  zip: <FaFileArchive style={{ fontSize: '20px' }} />,
  rar: <FaFileArchive style={{ fontSize: '20px' }} />,
  jpg: <FaFileImage style={{ fontSize: '20px' }} />,
  jpeg: <FaFileImage style={{ fontSize: '20px' }} />,
  png: <FaFileImage style={{ fontSize: '20px' }} />,
  mp3: <FaFileAudio style={{ fontSize: '20px' }} />,
  mp4: <FaFileVideo style={{ fontSize: '20px' }} />,
};

// Get file type-specific icon
const getFileIcon = (filename?: string): JSX.Element => {
  if (!filename) return <FaFileUpload style={{ fontSize: '20px' }} />;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return iconMap[ext] || <FaFileAlt style={{ fontSize: '20px' }} />;
};

// Smart document handler - preview for PDFs/images, download for others
const handleDocumentClick = (doc: any) => {
  if (!doc.BlobUrl && !doc.DocumentUrl) return;
  
  const url = doc.BlobUrl || doc.DocumentUrl;
  const filename = doc.FileName || '';
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  
  // Previewable file types
  const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
  
  if (previewableTypes.includes(ext)) {
    // Open in new tab for preview
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    // Force download for non-previewable files
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// Utility functions for additional data display
const calculateAge = (dateOfBirth: string): number => {
  if (!dateOfBirth) return 0;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const formatDocumentNumber = (docNumber: string, docType: 'passport' | 'license'): string => {
  if (!docNumber) return '';
  // Mask middle characters for privacy, show first 2 and last 2
  if (docNumber.length <= 4) return docNumber;
  const visible = 2;
  const masked = '*'.repeat(docNumber.length - (visible * 2));
  return docNumber.substring(0, visible) + masked + docNumber.substring(docNumber.length - visible);
};

const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode.toUpperCase().split('').map(char => 
    0x1F1E6 + char.charCodeAt(0) - 'A'.charCodeAt(0)
  );
  return String.fromCodePoint(...codePoints);
};

// Copy document URL to clipboard
const handleCopyUrl = async (doc: any) => {
  const url = doc.BlobUrl || doc.DocumentUrl;
  if (!url) return;
  
  try {
    await navigator.clipboard.writeText(url);
    // You could add a toast notification here if needed
    console.log('URL copied to clipboard');
  } catch (err) {
    console.error('Failed to copy URL:', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
};

interface GroupedRiskData {
    instructionRef: string;
    riskAssessments: any[];
    idVerifications: any[];
    clients: ClientInfo[];
    serviceDescription?: string;
    stage?: string;
    allData: any[];
}

interface RiskComplianceCardProps {
    data: GroupedRiskData;
    animationDelay?: number;
    onOpenInstruction?: () => void;
    selected?: boolean;
    onSelect?: () => void;
    expanded?: boolean;
}

const getRiskColor = (riskLevel: string) => {
    const level = riskLevel?.toLowerCase();
    if (level?.includes('low') || level === 'pass' || level === 'passed' || level === 'approved') {
        return '#20b26c';
    }
    if (level?.includes('medium') || level === 'review') {
        return '#FFB900';
    }
    if (level?.includes('high') || level === 'fail' || level === 'failed' || level === 'rejected') {
        return colours.red;
    }
    return '#666';
};

const getVerificationStatus = (verifications: any[]) => {
    if (!verifications || verifications.length === 0) return 'pending';
    
    const hasCompleted = verifications.some(v => 
        v.EIDOverallResult?.toLowerCase() === 'passed' || 
        v.EIDOverallResult?.toLowerCase() === 'pass'
    );
    
    if (hasCompleted) return 'complete';
    
    const hasStarted = verifications.some(v => 
        v.EIDStatus && v.EIDStatus.toLowerCase() !== 'pending'
    );
    
    return hasStarted ? 'in-progress' : 'pending';
};

const RiskComplianceCard: React.FC<RiskComplianceCardProps> = ({
    data,
    animationDelay = 0,
    onOpenInstruction,
    selected = false,
    onSelect,
    expanded = false,
}) => {
    const { isDarkMode } = useTheme();
    const primaryRisk = data.riskAssessments[0];
    const leadClient = data.clients?.find(c => c.Lead) || data.clients?.[0];
    const jointClients = data.clients?.filter(c => !c.Lead) || [];
    const isMultiClient = data.clients && data.clients.length > 1;
    
    // Get risk status (instruction level - one assessment for all clients)
    const riskResult = primaryRisk?.RiskAssessmentResult;
    const riskStatus = riskResult ? 
        ['low', 'low risk', 'pass', 'approved'].includes(riskResult.toLowerCase()) ? 'approved' :
        ['medium', 'medium risk'].includes(riskResult.toLowerCase()) ? 'review' : 'flagged'
        : 'pending';
    
    // Get individual client verification statuses from enhanced client data
    const getClientVerificationStatus = (client: any) => {
        if (!client) return 'pending';
        
        // Use the idVerification data attached to the client object
        if (client.idVerification) {
            const eidResult = client.idVerification.EIDOverallResult?.toLowerCase();
            const eidStatus = client.idVerification.EIDStatus?.toLowerCase();
            
            if (eidResult === 'passed' || eidResult === 'pass') {
                return 'complete';
            } else if (eidResult === 'failed' || eidResult === 'fail') {
                return 'failed';
            } else if (eidResult === 'review') {
                return 'review';
            } else if (eidStatus === 'completed') {
                return 'in-progress'; // Completed but not passed
            } else if (eidStatus === 'pending') {
                return 'pending';
            }
        }
        
        // Fallback to checking if they have submitted
        return client.HasSubmitted ? 'in-progress' : 'pending';
    };
    
    // Get instruction title - prioritize lead client name over "Joint Clients"
    const instructionTitle = leadClient ? 
        `${leadClient.FirstName || ''} ${leadClient.LastName || ''}`.trim() ||
        leadClient.CompanyName || leadClient.ClientEmail?.split('@')[0] || 'Client'
        : isMultiClient ? 'Joint Clients' : 'Client';

    const cardClass = mergeStyles('riskComplianceCard', {
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
        borderRadius: '0px',
        padding: expanded ? '24px' : '16px',
        color: isDarkMode ? colours.dark.text : colours.light.text,
        cursor: 'pointer',
        position: 'relative',
        border: selected 
            ? '2px solid #3690CE' 
            : expanded 
                ? '2px solid #3690CE'
                : `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : '#e1e4e8'}`,
        boxShadow: selected
            ? '0 0 0 1px #3690CE20, 0 4px 16px rgba(54, 144, 206, 0.15)'
            : expanded
                ? '0 0 0 1px #3690CE10, 0 8px 32px rgba(54, 144, 206, 0.12)'
                : (isDarkMode ? '0 4px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)'),
        opacity: 1,
        transition: 'box-shadow 0.3s ease, transform 0.3s ease, border 0.3s ease, opacity 0.3s ease, padding 0.3s ease',
        width: expanded ? '100%' : 'auto',
        maxWidth: expanded ? 'none' : '450px',
        gridColumn: expanded ? '1 / -1' : 'auto', // Span all columns when expanded
        selectors: {
            ':hover': {
                boxShadow: selected
                    ? '0 0 0 1px #3690CE30, 0 6px 20px rgba(54, 144, 206, 0.2)'
                    : '0 4px 16px rgba(0,0,0,0.12)',
                transform: 'translateY(-1px)',
            },
        },
    });

    const style: React.CSSProperties = {
        '--animation-delay': `${animationDelay}s`,
    } as React.CSSProperties;

    const handleCardClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onSelect) {
            onSelect();
        } else if (onOpenInstruction) {
            onOpenInstruction();
        }
    };

    return (
        <div className={cardClass} style={style} onClick={handleCardClick}>
            {/* Selection Indicator */}
            {selected && (
                <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '20px',
                    height: '20px',
                    backgroundColor: '#3690CE',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    zIndex: 10,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                    ✓
                </div>
            )}

            {/* Client Name Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '1rem',
                fontWeight: 600,
                color: '#24292f',
                marginBottom: '8px',
                borderBottom: '1px solid rgba(0,0,0,0.1)',
                paddingBottom: '6px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaShieldAlt style={{ fontSize: '14px', color: '#666' }} />
                    <span style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        fontFamily: 'monospace'
                    }}>
                        {data.instructionRef || 'No Ref'}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{instructionTitle}</span>
                    {isMultiClient && (
                        <FaUsers style={{ fontSize: '12px', color: '#666', marginLeft: '4px' }} />
                    )}
                </div>
            </div>

            {/* Service Description */}
            {data.serviceDescription && (
                <div style={{
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #e1e4e8',
                    borderRadius: '0px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    position: 'relative'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '8px',
                        backgroundColor: colours.light.sectionBackground,
                        padding: '0 4px',
                        fontSize: '0.75rem',
                        color: '#8b949e',
                        fontWeight: 500
                    }}>
                        Service
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>
                        {data.serviceDescription}
                    </div>
                </div>
            )}

            {/* Risk Assessment Summary (Instruction Level) */}
            <div style={{
                backgroundColor: '#f8f9fa',
                border: '1px solid #e1e4e8',
                borderRadius: '0px',
                padding: '8px 12px',
                marginBottom: '12px',
                position: 'relative'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '8px',
                    backgroundColor: colours.light.sectionBackground,
                    padding: '0 4px',
                    fontSize: '0.75rem',
                    color: '#8b949e',
                    fontWeight: 500
                }}>
                    Risk Assessment
                </div>
                
                {/* Basic Summary Row */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '8px',
                    marginBottom: primaryRisk ? '12px' : '0'
                }}>
                    {/* Risk Status */}
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Status</div>
                        <div style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: getRiskColor(riskResult || ''),
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: getRiskColor(riskResult || '')
                            }} />
                            {riskStatus === 'approved' ? 'Assessed' :
                             riskStatus === 'review' ? 'Review' :
                             riskStatus === 'flagged' ? 'Flagged' : 'Pending'}
                        </div>
                    </div>

                    {/* Risk Score */}
                    {primaryRisk?.RiskScore && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Score</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                {primaryRisk.RiskScore}
                            </div>
                        </div>
                    )}

                    {/* Assessor */}
                    {primaryRisk?.RiskAssessor && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Assessor</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                {primaryRisk.RiskAssessor}
                            </div>
                        </div>
                    )}

                    {/* Assessment Date */}
                    {primaryRisk?.ComplianceDate && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Assessed</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                {format(new Date(primaryRisk.ComplianceDate), 'd MMM yyyy')}
                            </div>
                        </div>
                    )}
                </div>

                {/* Detailed Risk Factors */}
                {primaryRisk && (
                    <div style={{
                        borderTop: '1px solid #e1e4e8',
                        paddingTop: '8px'
                    }}>
                        <div style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#666',
                            marginBottom: '6px'
                        }}>
                            Risk Factor Details
                        </div>
                        
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '6px',
                            fontSize: '0.7rem'
                        }}>
                            {/* Client Type */}
                            {primaryRisk.ClientType && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Client Type:</span>
                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem' }}>
                                        {primaryRisk.ClientType} 
                                        <span style={{ color: '#666', fontSize: '0.65rem', marginLeft: '4px' }}>
                                            ({primaryRisk.ClientType_Value}/3)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Value of Instruction */}
                            {primaryRisk.ValueOfInstruction && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Value:</span>
                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem' }}>
                                        {primaryRisk.ValueOfInstruction}
                                        <span style={{ color: '#666', fontSize: '0.65rem', marginLeft: '4px' }}>
                                            ({primaryRisk.ValueOfInstruction_Value}/3)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Source of Funds */}
                            {primaryRisk.SourceOfFunds && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Source of Funds:</span>
                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem' }}>
                                        {primaryRisk.SourceOfFunds}
                                        <span style={{ color: '#666', fontSize: '0.65rem', marginLeft: '4px' }}>
                                            ({primaryRisk.SourceOfFunds_Value}/3)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Destination of Funds */}
                            {primaryRisk.DestinationOfFunds && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Destination:</span>
                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem' }}>
                                        {primaryRisk.DestinationOfFunds}
                                        <span style={{ color: '#666', fontSize: '0.65rem', marginLeft: '4px' }}>
                                            ({primaryRisk.DestinationOfFunds_Value}/3)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Funds Type */}
                            {primaryRisk.FundsType && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Funds Type:</span>
                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem' }}>
                                        {primaryRisk.FundsType}
                                        <span style={{ color: '#666', fontSize: '0.65rem', marginLeft: '4px' }}>
                                            ({primaryRisk.FundsType_Value}/3)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Client Introduction */}
                            {primaryRisk.HowWasClientIntroduced && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Introduction:</span>
                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem' }}>
                                        {primaryRisk.HowWasClientIntroduced}
                                        <span style={{ color: '#666', fontSize: '0.65rem', marginLeft: '4px' }}>
                                            ({primaryRisk.HowWasClientIntroduced_Value}/3)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Limitation */}
                            {primaryRisk.Limitation && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Limitation:</span>
                                    <div style={{ 
                                        color: primaryRisk.Limitation_Value === 3 ? '#d13438' : '#24292f', 
                                        fontWeight: primaryRisk.Limitation_Value === 3 ? 600 : 500, 
                                        fontSize: '0.75rem' 
                                    }}>
                                        {primaryRisk.Limitation}
                                        <span style={{ 
                                            color: primaryRisk.Limitation_Value === 3 ? '#d13438' : '#666', 
                                            fontSize: '0.65rem', 
                                            marginLeft: '4px',
                                            fontWeight: primaryRisk.Limitation_Value === 3 ? 600 : 400
                                        }}>
                                            ({primaryRisk.Limitation_Value}/3)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Transaction Risk Level */}
                            {primaryRisk.TransactionRiskLevel && (
                                <div style={{ marginBottom: '4px' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>Transaction Risk:</span>
                                    <div style={{ 
                                        color: getRiskColor(primaryRisk.RiskAssessmentResult), 
                                        fontWeight: 500, 
                                        fontSize: '0.75rem' 
                                    }}>
                                        {primaryRisk.TransactionRiskLevel}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Compliance Confirmations */}
                        <div style={{
                            marginTop: '8px',
                            paddingTop: '6px',
                            borderTop: '1px solid #e8e8e8',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '4px',
                            fontSize: '0.7rem'
                        }}>
                            {/* Client Risk Factors */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: primaryRisk.ClientRiskFactorsConsidered ? '#20b26c' : '#d13438'
                                }} />
                                <span style={{ color: '#666', fontWeight: 500 }}>Client Risk Factors:</span>
                                <span style={{ 
                                    color: primaryRisk.ClientRiskFactorsConsidered ? '#20b26c' : '#d13438',
                                    fontWeight: 600 
                                }}>
                                    {primaryRisk.ClientRiskFactorsConsidered ? 'Considered' : 'Not Considered'}
                                </span>
                            </div>

                            {/* Transaction Risk Factors */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: primaryRisk.TransactionRiskFactorsConsidered ? '#20b26c' : '#d13438'
                                }} />
                                <span style={{ color: '#666', fontWeight: 500 }}>Transaction Risk:</span>
                                <span style={{ 
                                    color: primaryRisk.TransactionRiskFactorsConsidered ? '#20b26c' : '#d13438',
                                    fontWeight: 600 
                                }}>
                                    {primaryRisk.TransactionRiskFactorsConsidered ? 'Considered' : 'Not Considered'}
                                </span>
                            </div>

                            {/* AML Policy */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: primaryRisk.FirmWideAMLPolicyConsidered ? '#20b26c' : '#d13438'
                                }} />
                                <span style={{ color: '#666', fontWeight: 500 }}>AML Policy:</span>
                                <span style={{ 
                                    color: primaryRisk.FirmWideAMLPolicyConsidered ? '#20b26c' : '#d13438',
                                    fontWeight: 600 
                                }}>
                                    {primaryRisk.FirmWideAMLPolicyConsidered ? 'Considered' : 'Not Considered'}
                                </span>
                            </div>

                            {/* Sanctions Risk */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: primaryRisk.FirmWideSanctionsRiskConsidered ? '#20b26c' : '#d13438'
                                }} />
                                <span style={{ color: '#666', fontWeight: 500 }}>Sanctions Risk:</span>
                                <span style={{ 
                                    color: primaryRisk.FirmWideSanctionsRiskConsidered ? '#20b26c' : '#d13438',
                                    fontWeight: 600 
                                }}>
                                    {primaryRisk.FirmWideSanctionsRiskConsidered ? 'Considered' : 'Not Considered'}
                                </span>
                            </div>
                        </div>

                        {/* Compliance Expiry Warning */}
                        {primaryRisk.ComplianceExpiry && (
                            <div style={{
                                marginTop: '8px',
                                padding: '6px 8px',
                                backgroundColor: new Date(primaryRisk.ComplianceExpiry) < new Date() ? '#fff5f5' : '#f0f9ff',
                                border: `1px solid ${new Date(primaryRisk.ComplianceExpiry) < new Date() ? '#fecaca' : '#bfdbfe'}`,
                                borderRadius: '2px',
                                fontSize: '0.7rem'
                            }}>
                                <span style={{ 
                                    color: new Date(primaryRisk.ComplianceExpiry) < new Date() ? '#dc2626' : '#3690CE',
                                    fontWeight: 500 
                                }}>
                                    Expires: {format(new Date(primaryRisk.ComplianceExpiry), 'd MMM yyyy')}
                                    {new Date(primaryRisk.ComplianceExpiry) < new Date() && ' (EXPIRED)'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Client Compliance Details */}
            {data.clients && data.clients.length > 0 && (
                <div style={{
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #e1e4e8',
                    borderRadius: '0px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    position: 'relative'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '8px',
                        backgroundColor: colours.light.sectionBackground,
                        padding: '0 4px',
                        fontSize: '0.75rem',
                        color: '#8b949e',
                        fontWeight: 500
                    }}>
                        Client Compliance
                    </div>
                    
                    {/* Lead Client */}
                    {leadClient && (
                        <div style={{
                            marginBottom: jointClients.length > 0 ? '8px' : '0',
                            paddingBottom: jointClients.length > 0 ? '8px' : '0',
                            borderBottom: jointClients.length > 0 ? '1px solid #e1e4e8' : 'none'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '4px'
                            }}>
                                <FaUser style={{ fontSize: '12px', color: '#3690CE' }} />
                                <span style={{ 
                                    fontSize: '0.85rem', 
                                    fontWeight: 600,
                                    color: '#3690CE'
                                }}>
                                    {(() => {
                                        // Get personal info to include title in name
                                        const personalInfo = data.allData.find(item => 
                                            item.email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase() ||
                                            item.Email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase()
                                        );
                                        const prefix = personalInfo?.prefix || personalInfo?.Title;
                                        const firstName = leadClient.FirstName || '';
                                        const lastName = leadClient.LastName || '';
                                        const fullName = prefix ? 
                                            `${prefix} ${firstName} ${lastName}`.trim() :
                                            `${firstName} ${lastName}`.trim();
                                        
                                        return `Lead: ${fullName || leadClient.CompanyName || leadClient.ClientEmail?.split('@')[0] || 'Client'}`;
                                    })()}
                                </span>
                                
                                {/* Compact age and nationality display like POID cards */}
                                {(() => {
                                    const personalInfo = data.allData.find(item => 
                                        item.email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase() ||
                                        item.Email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase()
                                    );
                                    
                                    const dob = personalInfo?.date_of_birth || personalInfo?.DOB;
                                    const age = dob ? calculateAge(dob) : null;
                                    const nationality = personalInfo?.nationality || personalInfo?.Nationality;
                                    const countryCode = personalInfo?.nationality_iso || personalInfo?.NationalityAlpha2;
                                    
                                    if (!age && !nationality) return null;
                                    
                                    return (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontSize: '0.75rem',
                                            color: '#555',
                                            marginLeft: '8px'
                                        }}>
                                            {age && (
                                                <span style={{ fontFamily: 'Raleway, sans-serif' }}>
                                                    {age} yrs
                                                </span>
                                            )}
                                            {nationality && countryCode && (
                                                <span style={{ fontFamily: 'Raleway, sans-serif', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    {countryCode}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                            <div style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: getClientVerificationStatus(leadClient) === 'complete' ? '#20b26c' :
                                       getClientVerificationStatus(leadClient) === 'failed' ? colours.red :
                                       getClientVerificationStatus(leadClient) === 'review' ? '#FFB900' :
                                       getClientVerificationStatus(leadClient) === 'in-progress' ? '#3690CE' : '#666',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginLeft: '20px'
                            }}>
                                <span style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: getClientVerificationStatus(leadClient) === 'complete' ? '#20b26c' :
                                                   getClientVerificationStatus(leadClient) === 'failed' ? colours.red :
                                                   getClientVerificationStatus(leadClient) === 'review' ? '#FFB900' :
                                                   getClientVerificationStatus(leadClient) === 'in-progress' ? '#3690CE' : '#ccc'
                                }} />
                                ID Verification: {getClientVerificationStatus(leadClient) === 'complete' ? 'Verified' :
                                                 getClientVerificationStatus(leadClient) === 'failed' ? 'Failed' :
                                                 getClientVerificationStatus(leadClient) === 'review' ? 'Review' :
                                                 getClientVerificationStatus(leadClient) === 'in-progress' ? 'In Progress' : 'Pending'}
                            </div>
                            
                            {/* Expanded ID Verification Details for Lead Client */}
                            {expanded && leadClient.idVerification && (
                                <div style={{
                                    marginLeft: '20px',
                                    marginTop: '8px',
                                    padding: '12px',
                                    backgroundColor: 'rgba(54, 144, 206, 0.05)',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(54, 144, 206, 0.15)'
                                }}>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        color: '#3690CE',
                                        marginBottom: '8px'
                                    }}>
                                        ID Verification Details
                                    </div>
                                    
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                        gap: '8px',
                                        fontSize: '0.7rem'
                                    }}>
                                        {leadClient.idVerification.EIDOverallResult && (
                                            <div>
                                                <span style={{ color: '#666', fontWeight: 500 }}>Overall Result:</span>
                                                <div style={{ 
                                                    color: getRiskColor(leadClient.idVerification.EIDOverallResult || ''),
                                                    fontWeight: 600,
                                                    fontSize: '0.75rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    marginTop: '2px'
                                                }}>
                                                    <span>{leadClient.idVerification.EIDOverallResult}</span>
                                                    {(leadClient.idVerification.PEPAndSanctionsCheckResult || leadClient.idVerification.AddressVerificationResult) && (
                                                        <>
                                                            <span style={{ color: '#ccc' }}>|</span>
                                                            <div style={{ display: 'flex', gap: '4px', fontSize: '0.65rem' }}>
                                                                {leadClient.idVerification.PEPAndSanctionsCheckResult && (
                                                                    <span style={{ 
                                                                        color: getRiskColor(leadClient.idVerification.PEPAndSanctionsCheckResult),
                                                                        fontWeight: 500,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px'
                                                                    }}>
                                                                        <FaUserShield style={{ fontSize: '10px' }} />
                                                                        PEP & Sanctions: {leadClient.idVerification.PEPAndSanctionsCheckResult}
                                                                    </span>
                                                                )}
                                                                {leadClient.idVerification.AddressVerificationResult && (
                                                                    <span style={{ 
                                                                        color: getRiskColor(leadClient.idVerification.AddressVerificationResult),
                                                                        fontWeight: 500,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px'
                                                                    }}>
                                                                        <FaMapMarkerAlt style={{ fontSize: '10px' }} />
                                                                        Address: {leadClient.idVerification.AddressVerificationResult}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {leadClient.idVerification.EIDCheckedDate && (
                                            <div>
                                                <span style={{ color: '#666', fontWeight: 500 }}>Check Date:</span>
                                                <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem', marginTop: '2px' }}>
                                                    {new Date(leadClient.idVerification.EIDCheckedDate).toLocaleDateString()}
                                                    {leadClient.idVerification.EIDCheckedTime && (
                                                        <span style={{ color: '#666', fontWeight: 400, marginLeft: '4px' }}>
                                                            <FaClock style={{ fontSize: '9px', marginRight: '2px' }} />
                                                            {leadClient.idVerification.EIDCheckedTime.substring(0, 5)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {leadClient.idVerification.CheckExpiry && (
                                            <div>
                                                <span style={{ color: '#666', fontWeight: 500 }}>Check Expires:</span>
                                                <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem', marginTop: '2px' }}>
                                                    {new Date(leadClient.idVerification.CheckExpiry).toLocaleDateString()}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {leadClient.idVerification.EIDProvider && (
                                            <div>
                                                <span style={{ color: '#666', fontWeight: 500 }}>Provider:</span>
                                                <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem', marginTop: '2px', textTransform: 'capitalize' }}>
                                                    {leadClient.idVerification.EIDProvider}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Compact contact and document info with address */}
                                    {(() => {
                                        const personalInfo = data.allData.find(item => 
                                            item.email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase() ||
                                            item.Email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase()
                                        );
                                        
                                        const phone = personalInfo?.best_number || personalInfo?.Phone;
                                        const passport = personalInfo?.passport_number || personalInfo?.PassportNumber;
                                        const license = personalInfo?.drivers_license_number || personalInfo?.DriversLicenseNumber;
                                        
                                        // Address information
                                        const address = [
                                            personalInfo?.house_building_number,
                                            personalInfo?.street,
                                            personalInfo?.city,
                                            personalInfo?.county,
                                            personalInfo?.post_code,
                                            personalInfo?.country
                                        ].filter(Boolean).join(', ');
                                        
                                        if (!phone && !passport && !license && !address) return null;
                                        
                                        return (
                                            <div style={{
                                                marginTop: '12px',
                                                paddingTop: '8px',
                                                borderTop: '1px solid rgba(54, 144, 206, 0.15)',
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr',
                                                gap: '12px',
                                                fontSize: '0.65rem'
                                            }}>
                                                {/* Left column: Phone and Document */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {phone && (
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            gap: '4px'
                                                        }}>
                                                            <FaPhone style={{ 
                                                                fontSize: '9px', 
                                                                color: '#3690CE',
                                                                flexShrink: 0
                                                            }} />
                                                            <span style={{ color: '#666' }}>Phone:</span>
                                                            <span style={{ fontWeight: 500, color: '#24292f' }}>{phone}</span>
                                                        </div>
                                                    )}
                                                    
                                                    {passport && (
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            gap: '4px'
                                                        }}>
                                                            <FaIdCard style={{ 
                                                                fontSize: '9px', 
                                                                color: '#3690CE',
                                                                flexShrink: 0
                                                            }} />
                                                            <span style={{ color: '#666' }}>Passport:</span>
                                                            <span style={{ 
                                                                fontWeight: 500, 
                                                                color: '#24292f',
                                                                fontFamily: 'monospace',
                                                                fontSize: '0.6rem',
                                                                letterSpacing: '0.5px'
                                                            }}>
                                                                {formatDocumentNumber(passport, 'passport')}
                                                            </span>
                                                        </div>
                                                    )}
                                                    
                                                    {license && !passport && (
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            gap: '4px'
                                                        }}>
                                                            <FaIdCard style={{ 
                                                                fontSize: '9px', 
                                                                color: '#3690CE',
                                                                flexShrink: 0
                                                            }} />
                                                            <span style={{ color: '#666' }}>License:</span>
                                                            <span style={{ 
                                                                fontWeight: 500, 
                                                                color: '#24292f',
                                                                fontFamily: 'monospace',
                                                                fontSize: '0.6rem',
                                                                letterSpacing: '0.5px'
                                                            }}>
                                                                {formatDocumentNumber(license, 'license')}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                {/* Right column: Address */}
                                                {address && (
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'flex-start', 
                                                        gap: '4px'
                                                    }}>
                                                        <FaMapMarkerAlt style={{ 
                                                            fontSize: '9px', 
                                                            color: '#3690CE',
                                                            flexShrink: 0,
                                                            marginTop: '1px'
                                                        }} />
                                                        <div>
                                                            <div style={{ color: '#666', marginBottom: '2px' }}>Address:</div>
                                                            <div style={{ 
                                                                fontWeight: 500, 
                                                                color: '#24292f',
                                                                lineHeight: '1.3',
                                                                fontSize: '0.6rem'
                                                            }}>
                                                                {address}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    
                                    {/* Company Information Section for Lead Client */}
                                    {leadClient.CompanyName && (
                                        <div style={{
                                            marginTop: '12px',
                                            paddingTop: '8px',
                                            borderTop: '1px solid rgba(54, 144, 206, 0.15)',
                                        }}>
                                            <div style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                color: '#3690CE',
                                                marginBottom: '6px',
                                                fontFamily: 'Raleway, sans-serif'
                                            }}>
                                                Company Information
                                            </div>
                                            
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                                gap: '6px',
                                                fontSize: '0.65rem'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FaBuilding style={{ fontSize: '9px', color: '#3690CE' }} />
                                                    <span style={{ color: '#666' }}>Company:</span>
                                                    <span style={{ fontWeight: 500, color: '#24292f' }}>{leadClient.CompanyName}</span>
                                                </div>
                                                
                                                {(() => {
                                                    const personalInfo = data.allData.find(item => 
                                                        item.email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase() ||
                                                        item.Email?.toLowerCase() === leadClient.ClientEmail?.toLowerCase()
                                                    );
                                                    const companyNumber = personalInfo?.company_number || personalInfo?.CompanyNumber;
                                                    
                                                    return companyNumber ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <FaIdCard style={{ fontSize: '9px', color: '#3690CE' }} />
                                                            <span style={{ color: '#666' }}>Company No:</span>
                                                            <span style={{ fontWeight: 500, color: '#24292f', fontFamily: 'monospace' }}>{companyNumber}</span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Address Information */}
                                    {(leadClient.address || leadClient.house_building_number || leadClient.street || 
                                      leadClient.city || leadClient.post_code || leadClient.country || 
                                      (expanded && leadClient.ClientEmail)) && (
                                        <div style={{
                                            marginTop: '12px',
                                            paddingTop: '8px',
                                            borderTop: '1px solid rgba(54, 144, 206, 0.15)',
                                        }}>
                                            <div style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                color: '#3690CE',
                                                marginBottom: '6px',
                                                fontFamily: 'Raleway, sans-serif'
                                            }}>
                                                Registered Address
                                            </div>
                                            <div style={{
                                                fontSize: '0.7rem',
                                                color: '#24292f',
                                                lineHeight: '1.4',
                                                fontFamily: 'Raleway, sans-serif'
                                            }}>
                                                {leadClient.address ? (
                                                    // Legacy address structure
                                                    <>
                                                        {leadClient.address.house_number && `${leadClient.address.house_number} `}
                                                        {leadClient.address.street && `${leadClient.address.street}`}
                                                        {(leadClient.address.house_number || leadClient.address.street) && <br />}
                                                        {leadClient.address.city && `${leadClient.address.city}`}
                                                        {leadClient.address.county && `, ${leadClient.address.county}`}
                                                        {(leadClient.address.city || leadClient.address.county) && <br />}
                                                        {leadClient.address.post_code && `${leadClient.address.post_code}`}
                                                        {leadClient.address.country && `, ${leadClient.address.country}`}
                                                    </>
                                                ) : (leadClient.house_building_number || leadClient.street || leadClient.city || 
                                                     leadClient.post_code || leadClient.country) ? (
                                                    // POID-style flat structure
                                                    <>
                                                        {leadClient.house_building_number && `${leadClient.house_building_number} `}
                                                        {leadClient.street && `${leadClient.street}`}
                                                        {(leadClient.house_building_number || leadClient.street) && <br />}
                                                        {leadClient.city && `${leadClient.city}`}
                                                        {leadClient.county && `, ${leadClient.county}`}
                                                        {(leadClient.city || leadClient.county) && <br />}
                                                        {leadClient.post_code && `${leadClient.post_code}`}
                                                        {leadClient.country && `, ${leadClient.country}`}
                                                    </>
                                                ) : (
                                                    // No address data available - show placeholder
                                                    <div style={{
                                                        color: '#666',
                                                        fontStyle: 'italic',
                                                        fontSize: '0.65rem',
                                                        fontFamily: 'Raleway, sans-serif'
                                                    }}>
                                                        Address information not available
                                                        {expanded && (
                                                            <div style={{ 
                                                                marginTop: '4px', 
                                                                fontSize: '0.6rem', 
                                                                color: '#999',
                                                                fontFamily: 'Raleway, sans-serif'
                                                            }}>
                                                                Client: {leadClient.ClientEmail}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    
                                    
                                    {/* Correlation ID - Read-only style */}
                                    {leadClient.idVerification.EIDCheckId && (
                                        <div style={{
                                            marginTop: '8px',
                                            paddingTop: '8px',
                                            borderTop: '1px solid rgba(54, 144, 206, 0.1)',
                                            fontSize: '0.65rem',
                                            color: '#888',
                                            fontFamily: 'monospace',
                                            letterSpacing: '0.5px'
                                        }}>
                                            Check ID: {leadClient.idVerification.EIDCheckId}
                                        </div>
                                    )}
                                    
                                    {/* CTA Button placeholder - only show if not Passed */}
                                    {leadClient.idVerification.EIDOverallResult && 
                                     leadClient.idVerification.EIDOverallResult.toLowerCase() !== 'passed' && (
                                        <div style={{
                                            marginTop: '12px',
                                            paddingTop: '8px',
                                            borderTop: '1px solid rgba(54, 144, 206, 0.1)'
                                        }}>
                                            <button style={{
                                                padding: '6px 12px',
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                backgroundColor: colours.red,
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                transition: 'opacity 0.2s'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                                            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                                            >
                                                Review Required
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Joint Clients */}
                    {jointClients.map((client, index) => {
                        const clientVerificationStatus = getClientVerificationStatus(client);
                        return (
                            <div key={index} style={{
                                marginBottom: index < jointClients.length - 1 ? '6px' : '0'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '4px'
                                }}>
                                    <FaUser style={{ fontSize: '12px', color: '#666' }} />
                                    <span style={{ 
                                        fontSize: '0.85rem', 
                                        fontWeight: 500
                                    }}>
                                        {(() => {
                                            // Get personal info to include title in name
                                            const personalInfo = data.allData.find(item => 
                                                item.email?.toLowerCase() === client.ClientEmail?.toLowerCase() ||
                                                item.Email?.toLowerCase() === client.ClientEmail?.toLowerCase()
                                            );
                                            const prefix = personalInfo?.prefix || personalInfo?.Title;
                                            const firstName = client.FirstName || '';
                                            const lastName = client.LastName || '';
                                            const fullName = prefix ? 
                                                `${prefix} ${firstName} ${lastName}`.trim() :
                                                `${firstName} ${lastName}`.trim();
                                            
                                            return `Joint: ${fullName || client.CompanyName || client.ClientEmail?.split('@')[0] || 'Client'}`;
                                        })()}
                                    </span>
                                    
                                    {/* Compact age and nationality display like POID cards */}
                                    {(() => {
                                        const personalInfo = data.allData.find(item => 
                                            item.email?.toLowerCase() === client.ClientEmail?.toLowerCase() ||
                                            item.Email?.toLowerCase() === client.ClientEmail?.toLowerCase()
                                        );
                                        
                                        const dob = personalInfo?.date_of_birth || personalInfo?.DOB;
                                        const age = dob ? calculateAge(dob) : null;
                                        const nationality = personalInfo?.nationality || personalInfo?.Nationality;
                                        const countryCode = personalInfo?.nationality_iso || personalInfo?.NationalityAlpha2;
                                        
                                        if (!age && !nationality) return null;
                                        
                                        return (
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                fontSize: '0.75rem',
                                                color: '#555',
                                                marginLeft: '8px'
                                            }}>
                                                {age && (
                                                    <span style={{ fontFamily: 'Raleway, sans-serif' }}>
                                                        {age} yrs
                                                    </span>
                                                )}
                                                {nationality && countryCode && (
                                                    <span style={{ fontFamily: 'Raleway, sans-serif', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                        {countryCode}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: clientVerificationStatus === 'complete' ? '#20b26c' :
                                           clientVerificationStatus === 'failed' ? colours.red :
                                           clientVerificationStatus === 'review' ? '#FFB900' :
                                           clientVerificationStatus === 'in-progress' ? '#3690CE' : '#666',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    marginLeft: '20px'
                                }}>
                                    <span style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: clientVerificationStatus === 'complete' ? '#20b26c' :
                                                       clientVerificationStatus === 'failed' ? colours.red :
                                                       clientVerificationStatus === 'review' ? '#FFB900' :
                                                       clientVerificationStatus === 'in-progress' ? '#3690CE' : '#ccc'
                                    }} />
                                    ID Verification: {clientVerificationStatus === 'complete' ? 'Verified' :
                                                     clientVerificationStatus === 'failed' ? 'Failed' :
                                                     clientVerificationStatus === 'review' ? 'Review' :
                                                     clientVerificationStatus === 'in-progress' ? 'In Progress' : 'Pending'}
                                </div>
                                
                                {/* Expanded ID Verification Details for Joint Client */}
                                {expanded && client.idVerification && (
                                    <div style={{
                                        marginLeft: '20px',
                                        marginTop: '8px',
                                        padding: '12px',
                                        backgroundColor: 'rgba(102, 102, 102, 0.05)',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(102, 102, 102, 0.15)'
                                    }}>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            color: '#666',
                                            marginBottom: '8px'
                                        }}>
                                            ID Verification Details
                                        </div>
                                        
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                            gap: '8px',
                                            fontSize: '0.7rem'
                                        }}>
                                            {client.idVerification.EIDOverallResult && (
                                                <div>
                                                    <span style={{ color: '#666', fontWeight: 500 }}>Overall Result:</span>
                                                    <div style={{ 
                                                        color: getRiskColor(client.idVerification.EIDOverallResult || ''),
                                                        fontWeight: 600,
                                                        fontSize: '0.75rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        marginTop: '2px'
                                                    }}>
                                                        <span>{client.idVerification.EIDOverallResult}</span>
                                                        {(client.idVerification.PEPAndSanctionsCheckResult || client.idVerification.AddressVerificationResult) && (
                                                            <>
                                                                <span style={{ color: '#ccc' }}>|</span>
                                                                <div style={{ display: 'flex', gap: '4px', fontSize: '0.65rem' }}>
                                                                    {client.idVerification.PEPAndSanctionsCheckResult && (
                                                                        <span style={{ 
                                                                            color: getRiskColor(client.idVerification.PEPAndSanctionsCheckResult),
                                                                            fontWeight: 500,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '3px'
                                                                        }}>
                                                                            <FaUserShield style={{ fontSize: '10px' }} />
                                                                            PEP & Sanctions: {client.idVerification.PEPAndSanctionsCheckResult}
                                                                        </span>
                                                                    )}
                                                                    {client.idVerification.AddressVerificationResult && (
                                                                        <span style={{ 
                                                                            color: getRiskColor(client.idVerification.AddressVerificationResult),
                                                                            fontWeight: 500,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '3px'
                                                                        }}>
                                                                            <FaMapMarkerAlt style={{ fontSize: '10px' }} />
                                                                            Address: {client.idVerification.AddressVerificationResult}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {client.idVerification.EIDCheckedDate && (
                                                <div>
                                                    <span style={{ color: '#666', fontWeight: 500 }}>Check Date:</span>
                                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem', marginTop: '2px' }}>
                                                        {new Date(client.idVerification.EIDCheckedDate).toLocaleDateString()}
                                                        {client.idVerification.EIDCheckedTime && (
                                                            <span style={{ color: '#666', fontWeight: 400, marginLeft: '4px' }}>
                                                                <FaClock style={{ fontSize: '9px', marginRight: '2px' }} />
                                                                {client.idVerification.EIDCheckedTime.substring(0, 5)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {client.idVerification.CheckExpiry && (
                                                <div>
                                                    <span style={{ color: '#666', fontWeight: 500 }}>Check Expires:</span>
                                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem', marginTop: '2px' }}>
                                                        {new Date(client.idVerification.CheckExpiry).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {client.idVerification.EIDProvider && (
                                                <div>
                                                    <span style={{ color: '#666', fontWeight: 500 }}>Provider:</span>
                                                    <div style={{ color: '#24292f', fontWeight: 500, fontSize: '0.75rem', marginTop: '2px', textTransform: 'capitalize' }}>
                                                        {client.idVerification.EIDProvider}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Compact contact and document info with address */}
                                        {(() => {
                                            const personalInfo = data.allData.find(item => 
                                                item.email?.toLowerCase() === client.ClientEmail?.toLowerCase() ||
                                                item.Email?.toLowerCase() === client.ClientEmail?.toLowerCase()
                                            );
                                            
                                            const phone = personalInfo?.best_number || personalInfo?.Phone;
                                            const passport = personalInfo?.passport_number || personalInfo?.PassportNumber;
                                            const license = personalInfo?.drivers_license_number || personalInfo?.DriversLicenseNumber;
                                            
                                            // Address information
                                            const address = [
                                                personalInfo?.house_building_number,
                                                personalInfo?.street,
                                                personalInfo?.city,
                                                personalInfo?.county,
                                                personalInfo?.post_code,
                                                personalInfo?.country
                                            ].filter(Boolean).join(', ');
                                            
                                            if (!phone && !passport && !license && !address) return null;
                                            
                                            return (
                                                <div style={{
                                                    marginTop: '12px',
                                                    paddingTop: '8px',
                                                    borderTop: '1px solid rgba(102, 102, 102, 0.15)',
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 1fr',
                                                    gap: '12px',
                                                    fontSize: '0.65rem'
                                                }}>
                                                    {/* Left column: Phone and Document */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {phone && (
                                                            <div style={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '4px'
                                                            }}>
                                                                <FaPhone style={{ 
                                                                    fontSize: '9px', 
                                                                    color: '#666',
                                                                    flexShrink: 0
                                                                }} />
                                                                <span style={{ color: '#666' }}>Phone:</span>
                                                                <span style={{ fontWeight: 500, color: '#24292f' }}>{phone}</span>
                                                            </div>
                                                        )}
                                                        
                                                        {passport && (
                                                            <div style={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '4px'
                                                            }}>
                                                                <FaIdCard style={{ 
                                                                    fontSize: '9px', 
                                                                    color: '#666',
                                                                    flexShrink: 0
                                                                }} />
                                                                <span style={{ color: '#666' }}>Passport:</span>
                                                                <span style={{ 
                                                                    fontWeight: 500, 
                                                                    color: '#24292f',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.6rem',
                                                                    letterSpacing: '0.5px'
                                                                }}>
                                                                    {formatDocumentNumber(passport, 'passport')}
                                                                </span>
                                                            </div>
                                                        )}
                                                        
                                                        {license && !passport && (
                                                            <div style={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '4px'
                                                            }}>
                                                                <FaIdCard style={{ 
                                                                    fontSize: '9px', 
                                                                    color: '#666',
                                                                    flexShrink: 0
                                                                }} />
                                                                <span style={{ color: '#666' }}>License:</span>
                                                                <span style={{ 
                                                                    fontWeight: 500, 
                                                                    color: '#24292f',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.6rem',
                                                                    letterSpacing: '0.5px'
                                                                }}>
                                                                    {formatDocumentNumber(license, 'license')}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Right column: Address */}
                                                    {address && (
                                                        <div style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'flex-start', 
                                                            gap: '4px'
                                                        }}>
                                                            <FaMapMarkerAlt style={{ 
                                                                fontSize: '9px', 
                                                                color: '#666',
                                                                flexShrink: 0,
                                                                marginTop: '1px'
                                                            }} />
                                                            <div>
                                                                <div style={{ color: '#666', marginBottom: '2px' }}>Address:</div>
                                                                <div style={{ 
                                                                    fontWeight: 500, 
                                                                    color: '#24292f',
                                                                    lineHeight: '1.3',
                                                                    fontSize: '0.6rem'
                                                                }}>
                                                                    {address}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        
                                        {/* Company Information Section for Joint Client */}
                                        {client.CompanyName && (
                                            <div style={{
                                                marginTop: '12px',
                                                paddingTop: '8px',
                                                borderTop: '1px solid rgba(102, 102, 102, 0.15)',
                                            }}>
                                                <div style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    color: '#666',
                                                    marginBottom: '6px',
                                                    fontFamily: 'Raleway, sans-serif'
                                                }}>
                                                    Company Information
                                                </div>
                                                
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                                    gap: '6px',
                                                    fontSize: '0.65rem'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <FaBuilding style={{ fontSize: '9px', color: '#666' }} />
                                                        <span style={{ color: '#666' }}>Company:</span>
                                                        <span style={{ fontWeight: 500, color: '#24292f' }}>{client.CompanyName}</span>
                                                    </div>
                                                    
                                                    {(() => {
                                                        const personalInfo = data.allData.find(item => 
                                                            item.email?.toLowerCase() === client.ClientEmail?.toLowerCase() ||
                                                            item.Email?.toLowerCase() === client.ClientEmail?.toLowerCase()
                                                        );
                                                        const companyNumber = personalInfo?.company_number || personalInfo?.CompanyNumber;
                                                        
                                                        return companyNumber ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <FaIdCard style={{ fontSize: '9px', color: '#666' }} />
                                                                <span style={{ color: '#666' }}>Company No:</span>
                                                                <span style={{ fontWeight: 500, color: '#24292f', fontFamily: 'monospace' }}>{companyNumber}</span>
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Address Information */}
                                        {(client.address || client.house_building_number || client.street || 
                                          client.city || client.post_code || client.country || 
                                          (expanded && client.ClientEmail)) && (
                                            <div style={{
                                                marginTop: '12px',
                                                paddingTop: '8px',
                                                borderTop: '1px solid rgba(102, 102, 102, 0.15)',
                                            }}>
                                                <div style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    color: '#666',
                                                    marginBottom: '6px',
                                                    fontFamily: 'Raleway, sans-serif'
                                                }}>
                                                    Registered Address
                                                </div>
                                                <div style={{
                                                    fontSize: '0.7rem',
                                                    color: '#24292f',
                                                    lineHeight: '1.4',
                                                    fontFamily: 'Raleway, sans-serif'
                                                }}>
                                                    {client.address ? (
                                                        // Legacy address structure
                                                        <>
                                                            {client.address.house_number && `${client.address.house_number} `}
                                                            {client.address.street && `${client.address.street}`}
                                                            {(client.address.house_number || client.address.street) && <br />}
                                                            {client.address.city && `${client.address.city}`}
                                                            {client.address.county && `, ${client.address.county}`}
                                                            {(client.address.city || client.address.county) && <br />}
                                                            {client.address.post_code && `${client.address.post_code}`}
                                                            {client.address.country && `, ${client.address.country}`}
                                                        </>
                                                    ) : (client.house_building_number || client.street || client.city || 
                                                         client.post_code || client.country) ? (
                                                        // POID-style flat structure
                                                        <>
                                                            {client.house_building_number && `${client.house_building_number} `}
                                                            {client.street && `${client.street}`}
                                                            {(client.house_building_number || client.street) && <br />}
                                                            {client.city && `${client.city}`}
                                                            {client.county && `, ${client.county}`}
                                                            {(client.city || client.county) && <br />}
                                                            {client.post_code && `${client.post_code}`}
                                                            {client.country && `, ${client.country}`}
                                                        </>
                                                    ) : (
                                                        // No address data available - show placeholder
                                                        <div style={{
                                                            color: '#666',
                                                            fontStyle: 'italic',
                                                            fontSize: '0.65rem',
                                                            fontFamily: 'Raleway, sans-serif'
                                                        }}>
                                                            Address information not available
                                                            {expanded && (
                                                                <div style={{ 
                                                                    marginTop: '4px', 
                                                                    fontSize: '0.6rem', 
                                                                    color: '#999',
                                                                    fontFamily: 'Raleway, sans-serif'
                                                                }}>
                                                                    Client: {client.ClientEmail}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        
                                        {/* Correlation ID - Read-only style */}
                                        {client.idVerification.EIDCheckId && (
                                            <div style={{
                                                marginTop: '8px',
                                                paddingTop: '8px',
                                                borderTop: '1px solid rgba(102, 102, 102, 0.1)',
                                                fontSize: '0.65rem',
                                                color: '#888',
                                                fontFamily: 'monospace',
                                                letterSpacing: '0.5px'
                                            }}>
                                                Check ID: {client.idVerification.EIDCheckId}
                                            </div>
                                        )}
                                        
                                        {/* CTA Button placeholder - only show if not Passed */}
                                        {client.idVerification.EIDOverallResult && 
                                         client.idVerification.EIDOverallResult.toLowerCase() !== 'passed' && (
                                            <div style={{
                                                marginTop: '12px',
                                                paddingTop: '8px',
                                                borderTop: '1px solid rgba(102, 102, 102, 0.1)'
                                            }}>
                                                <button style={{
                                                    padding: '6px 12px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    backgroundColor: colours.red,
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    transition: 'opacity 0.2s'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                                                onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                                                >
                                                    Review Required
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Documents Section - shown when expanded */}
            {expanded && data.allData && (
                <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    backgroundColor: 'rgba(54, 144, 206, 0.03)',
                    borderRadius: '4px',
                    border: '1px solid rgba(54, 144, 206, 0.1)'
                }}>
                    <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#3690CE',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        � Compliance Documents
                    </div>
                    
                    {(() => {
                        const documents = data.allData
                            .filter(item => item.documents && item.documents.length > 0)
                            .flatMap(item => item.documents);
                        
                        if (documents.length === 0) {
                            return (
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: '#666',
                                    fontStyle: 'italic',
                                    textAlign: 'center',
                                    padding: '8px'
                                }}>
                                    No documents uploaded
                                </div>
                            );
                        }
                        
                        return (
                            <div style={{
                                display: 'grid',
                                gap: '8px',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'
                            }}>
                                {documents.map((doc: any, docIndex: number) => (
                                    <div key={docIndex} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 12px',
                                        backgroundColor: 'white',
                                        borderRadius: '4px',
                                        border: '1px solid #e1e4e8',
                                        fontSize: '0.75rem',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            flex: 1
                                        }}>
                                            <div style={{
                                                marginRight: '10px',
                                                fontSize: '1.1rem',
                                                color: '#3690CE'
                                            }}>
                                                {getFileIcon(doc.FileName)}
                                            </div>
                                            <div>
                                                <div style={{
                                                    fontWeight: 500,
                                                    color: '#24292f',
                                                    marginBottom: '2px'
                                                }}>
                                                    {doc.FileName || 'Unnamed document'}
                                                </div>
                                                <div style={{
                                                    color: '#666',
                                                    fontSize: '0.7rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '2px'
                                                }}>
                                                    {doc.DocumentId && (
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                                                            ID: {doc.DocumentId}
                                                        </span>
                                                    )}
                                                    {doc.FileSizeBytes && (
                                                        <span>{Math.round(doc.FileSizeBytes / 1024)}KB</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {/* Copy URL Link Icon */}
                                            {(doc.BlobUrl || doc.DocumentUrl) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCopyUrl(doc);
                                                    }}
                                                    style={{
                                                        color: '#666',
                                                        backgroundColor: 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: '4px',
                                                        borderRadius: '3px',
                                                        fontSize: '0.8rem',
                                                        transition: 'all 0.2s ease',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                                                        e.currentTarget.style.color = '#3690CE';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                        e.currentTarget.style.color = '#666';
                                                    }}
                                                    title="Copy document URL"
                                                >
                                                    <FaLink />
                                                </button>
                                            )}
                                            {/* Download/Preview Button */}
                                            {(doc.BlobUrl || doc.DocumentUrl) && (
                                                <button
                                                    onClick={() => handleDocumentClick(doc)}
                                                    style={{
                                                        color: '#3690CE',
                                                        textDecoration: 'none',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 500,
                                                        padding: '4px 8px',
                                                        borderRadius: '3px',
                                                        border: '1px solid #3690CE',
                                                        backgroundColor: 'transparent',
                                                        transition: 'all 0.2s ease',
                                                        cursor: 'pointer'
                                                    }}
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.backgroundColor = '#3690CE';
                                                        e.currentTarget.style.color = 'white';
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                        e.currentTarget.style.color = '#3690CE';
                                                    }}
                                                >
                                                    <FaDownload style={{ fontSize: '0.65rem' }} /> 
                                                    {(() => {
                                                        const filename = doc.FileName || '';
                                                        const ext = filename.split('.').pop()?.toLowerCase() ?? '';
                                                        const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
                                                        return previewableTypes.includes(ext) ? 'Preview' : 'Download';
                                                    })()} Document
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Quick Summary Grid - shown when not expanded */}
            {!expanded && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '8px',
                    backgroundColor: 'rgba(0,0,0,0.02)',
                    padding: '8px',
                    borderRadius: '0px'
                }}>
                    {/* Overall Compliance Status */}
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Overall Status</div>
                        <div style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#3690CE',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: '#3690CE'
                            }} />
                            {data.stage || 'In Progress'}
                        </div>
                    </div>

                    {/* Total Clients */}
                    {isMultiClient && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Total Clients</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                {data.clients.length} ({leadClient ? '1 Lead + ' : ''}{jointClients.length} Joint)
                            </div>
                        </div>
                    )}

                    {/* Verifications Complete */}
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>ID Verified</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {data.clients ? 
                                data.clients.filter(c => getClientVerificationStatus(c) === 'complete').length 
                                : 0} / {data.clients?.length || 0}
                        </div>
                    </div>

                    {/* Risk Level */}
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Risk Level</div>
                        <div style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: getRiskColor(riskResult || ''),
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: getRiskColor(riskResult || '')
                            }} />
                            {riskResult || 'Pending'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RiskComplianceCard;
