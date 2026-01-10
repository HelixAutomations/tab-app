import React, { useState, useEffect } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { 
  MdClose, 
  MdCheckBox, 
  MdInfo, 
  MdError,
  MdMoreHoriz,
  MdAccessTime,
  MdPending,
  MdEmail,
  MdCheckCircle,
  MdDrafts
} from 'react-icons/md';

interface IDVerificationDetails {
  instructionRef: string;
  clientName: string;
  clientEmail: string;
  overallResult: string;
  pepResult: string;
  addressResult: string;
  rawResponse: string | any; // Raw Tiller API response
  checkedDate: string;
  documentsRequested?: boolean;
  documentsReceived?: boolean;
}

interface IDVerificationReviewModalProps {
  isVisible: boolean;
  details: IDVerificationDetails | null;
  onClose: () => void;
  onApprove: (instructionRef: string) => Promise<void>;
  onRequestDocuments?: (instructionRef: string) => Promise<void>; // New action
  onOverride?: (instructionRef: string) => Promise<void>; // New action
  variant?: 'modal' | 'tray';
}

const IDVerificationReviewModal: React.FC<IDVerificationReviewModalProps> = ({
  isVisible,
  details,
  onClose,
  onApprove,
  onRequestDocuments,
  onOverride,
  variant = 'modal'
}) => {
  const { isDarkMode } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [showDevControls, setShowDevControls] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDevControls && !(event.target as Element)?.closest('[data-dev-controls]')) {
        setShowDevControls(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDevControls]);
  
  // Development testing function to switch states
  const switchTestState = async (newState: string) => {
    // Temporarily enabled in production for testing
    // if (process.env.NODE_ENV !== 'development') return;
    
    try {
      const response = await fetch(`/api/verify-id/${details?.instructionRef}/test-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });
      
      if (response.ok) {
        // Just close the modal - the parent will refresh the data when reopened
        onClose();
      }
    } catch (error) {
      console.error('Failed to switch test state:', error);
    }
  };

  // Send email to request additional documents via server route
  const sendDocumentRequestEmail = async () => {
    if (!details?.instructionRef) {
      alert('No instruction reference available');
      return;
    }

    setEmailSending(true);
    
    try {
      console.log(`Sending document request for ${details.instructionRef}`);
      
      const response = await fetch(`/api/verify-id/${details.instructionRef}/request-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email');
      }

      const result = await response.json();
      console.log('Document request response:', result);

      // Update documents requested status
      if (onRequestDocuments) {
        await onRequestDocuments(details.instructionRef);
      }

      alert(`Document request email sent successfully to ${result.recipient}!`);
    } catch (error: any) {
      console.error('Email send error:', error);
      alert(`Failed to send email: ${error.message}`);
    } finally {
      setEmailSending(false);
    }
  };

  // Draft email functionality - sends email to fee earner directly
  const draftDocumentRequestEmail = async () => {
    if (!details?.instructionRef) {
      alert('No instruction reference available');
      return;
    }

    setEmailSending(true);
    
    try {
      console.log(`Drafting document request for fee earner for ${details.instructionRef}`);
      console.log(`Draft API URL: /api/verify-id/${details.instructionRef}/draft-request`);
      
      const response = await fetch(`/api/verify-id/${details.instructionRef}/draft-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      console.log('Draft API response status:', response.status);
      console.log('Draft API response headers:', response.headers);

      if (!response.ok) {
        const responseText = await response.text();
        console.log('Draft API error response text:', responseText);
        try {
          const errorData = JSON.parse(responseText);
          throw new Error(errorData.error || 'Failed to send draft email');
        } catch (parseError) {
          throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}`);
        }
      }

      const result = await response.json();
      console.log('Draft email response:', result);

      alert(`Draft email sent to fee earner successfully!`);
    } catch (error: any) {
      console.error('Draft email send error:', error);
      alert(`Failed to send draft email: ${error.message}`);
    } finally {
      setEmailSending(false);
    }
  };

  if (!isVisible || !details) return null;

  // Determine the current workflow state
  const getWorkflowState = () => {
    // If already verified, no workflow needed
    if (details?.overallResult?.toLowerCase() === 'verified') return 'verified' as const;
    
    if (details?.documentsReceived === true) return 'documents-received' as const;
    if (details?.overallResult?.toLowerCase() === 'documents requested' || details?.documentsRequested === true) return 'documents-pending' as const;
    return 'fresh-failure' as const;
  };

  const workflowState = getWorkflowState();

  // Check if documents have already been requested
  const isDocumentsAlreadyRequested = details.overallResult?.toLowerCase() === 'documents requested' || details.documentsRequested;

  const handleAction = async (action: 'approve' | 'request' | 'draft' | 'override') => {
    setIsProcessing(true);
    try {
      switch (action) {
        case 'approve':
          await onApprove(details.instructionRef);
          break;
        case 'request':
          await sendDocumentRequestEmail();
          break;
        case 'draft':
          await draftDocumentRequestEmail();
          return; // Don't close modal after drafting
        case 'override':
          await onApprove(details.instructionRef); // Override should approve the verification
          break;
      }
      onClose();
    } catch (error) {
      console.error(`Failed to ${action} ID verification:`, error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getResultIcon = (result: string) => {
    const iconStyle = { 
      color: isDarkMode ? colours.dark.subText : colours.light.subText,
      fontSize: '16px'
    };
    
    if (result?.toLowerCase() === 'passed') {
      return <MdCheckBox style={iconStyle} />;
    } else if (result?.toLowerCase() === 'review') {
      return <MdInfo style={iconStyle} />;
    }
    return <MdError style={iconStyle} />;
  };

  const getResultColor = (result: string) => {
    if (result?.toLowerCase() === 'passed' || result?.toLowerCase() === 'verified') return colours.green;
    if (result?.toLowerCase() === 'review') return colours.orange;
    return colours.red;
  };

  const getRecommendedAction = (details: IDVerificationDetails): string => {
    const rawResponse = parseRawResponse(details.rawResponse);
    
    // Check specific failure types from Tiller checkStatuses
    const hasPEPIssues = details.pepResult?.toLowerCase() === 'review' || details.pepResult?.toLowerCase() === 'fail';
    const hasAddressIssues = details.addressResult?.toLowerCase() === 'review' || details.addressResult?.toLowerCase() === 'fail';
    const hasOverallIssues = details.overallResult?.toLowerCase() === 'review' || details.overallResult?.toLowerCase() === 'fail';
    
    if (hasPEPIssues) {
      return 'PEP/Sanctions match detected - requires immediate manual review. Do not proceed without thorough investigation of the match.';
    }
    
    if (hasAddressIssues && hasOverallIssues) {
      return 'Multiple verification issues detected. Consider requesting utility bill, bank statement, or council tax document to verify both identity and address.';
    }
    
    if (hasAddressIssues) {
      return 'Address verification failed. Request recent utility bill, council tax statement, or bank statement showing current address.';
    }
    
    if (hasOverallIssues) {
      return 'Identity verification inconclusive. Request additional photo ID (passport, driving licence) or recent official correspondence.';
    }
    
    return 'Standard verification checks could not be completed. Consider requesting additional documentation or manual override if client is known to the firm.';
  };

  const parseRawResponse = (rawResponse: string | any) => {
    if (typeof rawResponse === 'string') {
      try {
        return JSON.parse(rawResponse);
      } catch {
        return null;
      }
    }
    return rawResponse;
  };

  const getCheckStatuses = (details: IDVerificationDetails) => {
    const rawResponse = parseRawResponse(details.rawResponse);
    return rawResponse?.checkStatuses || [];
  };

  const getCheckName = (checkTypeId: number): string => {
    switch (checkTypeId) {
      case 1: return 'Address Verification';
      case 2: return 'PEP & Sanctions Check';
      case 3: return 'Identity Verification';
      case 4: return 'Document Verification';
      default: return `Check Type ${checkTypeId}`;
    }
  };

  const outerStyle: React.CSSProperties =
    variant === 'tray'
      ? {
          position: 'relative',
          backgroundColor: 'transparent',
          display: 'block',
          padding: 0,
        }
      : {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px',
          backdropFilter: 'blur(4px)'
        };

  const innerStyle: React.CSSProperties = {
    background: isDarkMode
      ? 'linear-gradient(135deg, #2e2e2e 0%, #3a3a3a 100%)'
      : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    borderRadius: variant === 'tray' ? '0px' : '12px',
    padding: '32px',
    maxWidth: variant === 'tray' ? '100%' : '650px',
    width: '100%',
    maxHeight: variant === 'tray' ? '60vh' : '85vh',
    overflowY: 'auto',
    boxShadow:
      variant === 'tray'
        ? 'none'
        : isDarkMode
          ? '0 20px 40px rgba(0, 0, 0, 0.4), 0 4px 6px rgba(0, 0, 0, 0.3)'
          : '0 20px 40px rgba(0, 0, 0, 0.15), 0 4px 6px rgba(0, 0, 0, 0.07)',
    position: 'relative',
    border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.05)'
  };

  return (
    <div style={outerStyle}>
      <div style={innerStyle}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: `2px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`
        }}>
          <div>
            <h2 style={{
              margin: 0,
              color: isDarkMode ? colours.dark.text : colours.darkBlue,
              fontSize: '22px',
              fontWeight: '700',
              letterSpacing: '-0.5px'
            }}>
              ID Verification Review
            </h2>
            <p style={{
              margin: '6px 0 0',
              color: isDarkMode ? colours.dark.subText : colours.light.subText,
              fontSize: '15px',
              fontWeight: '500'
            }}>
              {details.instructionRef} • {details.clientName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: isDarkMode
                ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                : 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
              color: isDarkMode ? colours.dark.subText : colours.light.subText,
              fontSize: '16px',
              cursor: 'pointer',
              padding: '10px',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              boxShadow: isDarkMode
                ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                : '0 2px 4px rgba(0, 0, 0, 0.07)'
            }}
            onMouseEnter={(e) => {
              if (variant === 'tray') return;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = isDarkMode
                ? '0 4px 8px rgba(0, 0, 0, 0.4)'
                : '0 4px 8px rgba(0, 0, 0, 0.12)';
            }}
            onMouseLeave={(e) => {
              if (variant === 'tray') return;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = isDarkMode
                ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                : '0 2px 4px rgba(0, 0, 0, 0.07)';
            }}
          >
            <MdClose />
          </button>
        </div>

        {/* Date Info */}
        <div style={{
          fontSize: '13px',
          color: isDarkMode ? colours.dark.subText : colours.light.subText,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '18px'
        }}>
          <MdAccessTime />
          Checked: <strong style={{ color: isDarkMode ? colours.dark.text : colours.darkBlue }}>{details.checkedDate}</strong>
        </div>

        {/* Action Items - Moved to top for importance */}
        {/* Verification Results with Integrated Actions */}
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{
            color: isDarkMode ? colours.dark.text : colours.light.text,
            fontSize: '18px',
            marginBottom: '18px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            Verification Results
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Overall Result */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 18px',
              background: isDarkMode 
                ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
              borderRadius: '10px',
              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
              boxShadow: isDarkMode 
                ? '0 2px 4px rgba(0, 0, 0, 0.3)' 
                : '0 2px 4px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.2s ease',
              position: 'relative'
            }}>
              <div style={{ 
                marginRight: '14px', 
                fontSize: '18px',
                padding: '4px',
                borderRadius: '6px',
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
              }}>
                {getResultIcon(details.overallResult)}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '15px',
                  fontWeight: '600'
                }}>
                  Overall Result
                </strong>
              </div>
              <div style={{
                color: getResultColor(details.overallResult),
                fontWeight: '700',
                fontSize: '15px',
                padding: '4px 12px',
                borderRadius: '6px',
                backgroundColor: `${getResultColor(details.overallResult)}15`
              }}>
                {details.overallResult}
              </div>
              
              {/* Development Controls - Subtle Dropdown */}
              {/* Temporarily enabled in production for testing */}
              {(process.env.NODE_ENV === 'development' || true) && (
                <div style={{ position: 'relative', marginLeft: '8px' }} data-dev-controls>
                  <button
                    onClick={() => setShowDevControls(!showDevControls)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '4px',
                      border: 'none',
                      background: isDarkMode 
                        ? 'rgba(107, 114, 128, 0.15)' 
                        : 'rgba(107, 114, 128, 0.08)',
                      color: isDarkMode 
                        ? 'rgba(156, 163, 175, 0.7)' 
                        : 'rgba(75, 85, 99, 0.6)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      transition: 'all 0.2s ease',
                      opacity: 0.6
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.background = isDarkMode 
                        ? 'rgba(107, 114, 128, 0.25)' 
                        : 'rgba(107, 114, 128, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.6';
                      e.currentTarget.style.background = isDarkMode 
                        ? 'rgba(107, 114, 128, 0.15)' 
                        : 'rgba(107, 114, 128, 0.08)';
                    }}
                    title="Development Controls"
                  >
                    ⚙
                  </button>
                  
                  {showDevControls && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      background: isDarkMode 
                        ? 'linear-gradient(135deg, #2e2e2e 0%, #3a3a3a 100%)'
                        : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
                      borderRadius: '6px',
                      boxShadow: isDarkMode 
                        ? '0 8px 16px rgba(0, 0, 0, 0.4)' 
                        : '0 8px 16px rgba(0, 0, 0, 0.1)',
                      padding: '8px',
                      minWidth: '140px',
                      zIndex: 1000
                    }}>
                      <div style={{
                        fontSize: '9px',
                        fontWeight: '600',
                        color: isDarkMode ? 'rgba(156, 163, 175, 0.8)' : 'rgba(75, 85, 99, 0.7)',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Test States
                      </div>
                      
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px'
                      }}>
                        <button
                          onClick={() => { switchTestState('fresh-failure'); setShowDevControls(false); }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: `${colours.red}20`,
                            color: colours.red,
                            border: `1px solid ${colours.red}30`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = `${colours.red}30`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = `${colours.red}20`;
                          }}
                        >
                          Fresh Failure
                        </button>
                        
                        <button
                          onClick={() => { switchTestState('documents-pending'); setShowDevControls(false); }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: `${colours.orange}20`,
                            color: colours.orange,
                            border: `1px solid ${colours.orange}30`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = `${colours.orange}30`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = `${colours.orange}20`;
                          }}
                        >
                          Docs Pending
                        </button>
                        
                        <button
                          onClick={() => { switchTestState('documents-received'); setShowDevControls(false); }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: `${colours.blue}20`,
                            color: colours.blue,
                            border: `1px solid ${colours.blue}30`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = `${colours.blue}30`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = `${colours.blue}20`;
                          }}
                        >
                          Docs Received
                        </button>
                        
                        <button
                          onClick={() => { switchTestState('verified'); setShowDevControls(false); }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: `${colours.green}20`,
                            color: colours.green,
                            border: `1px solid ${colours.green}30`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = `${colours.green}30`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = `${colours.green}20`;
                          }}
                        >
                          Verified
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Required Section - Only for failed states */}
            {(workflowState === 'fresh-failure' || workflowState === 'documents-received') && (
              <div style={{
                padding: '18px 20px',
                background: isDarkMode 
                  ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.12) 0%, rgba(54, 144, 206, 0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(54, 144, 206, 0.06) 0%, rgba(54, 144, 206, 0.03) 100%)',
                border: `1px solid ${colours.blue}30`,
                borderRadius: '10px',
                marginBottom: '6px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    padding: '6px',
                    borderRadius: '6px',
                    backgroundColor: `${colours.blue}20`,
                    color: colours.blue,
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <MdPending size={18} />
                  </div>
                  <div>
                    <div style={{
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      fontWeight: '600',
                      fontSize: '15px'
                    }}>
                      Action Required
                    </div>
                    <div style={{
                      color: isDarkMode ? colours.dark.subText : colours.light.subText,
                      fontSize: '13px'
                    }}>
                      {workflowState === 'fresh-failure' 
                        ? 'Verification checks need review - choose action below'
                        : 'Additional documents received - review and approve'
                      }
                    </div>
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  {workflowState === 'fresh-failure' && !isDocumentsAlreadyRequested && (
                    <>
                      <button
                        onClick={() => handleAction('request')}
                        disabled={true} // Always disabled now - greyed out
                        style={{
                          background: '#999', // Greyed out
                          color: '#666',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '12px 18px',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: 'not-allowed',
                          opacity: 0.5,
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <MdEmail size={16} />
                        Request Additional Documents
                      </button>
                      
                      <button
                        onClick={() => handleAction('draft')}
                        disabled={emailSending}
                        style={{
                          background: emailSending 
                            ? `${colours.blue}60` 
                            : `linear-gradient(135deg, ${colours.blue} 0%, ${colours.blue}CC 100%)`,
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '12px 18px',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: emailSending ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: isDarkMode 
                            ? '0 4px 8px rgba(54, 144, 206, 0.3)'
                            : '0 4px 8px rgba(54, 144, 206, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        onMouseEnter={(e) => {
                          if (!emailSending) {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = isDarkMode 
                              ? '0 6px 12px rgba(54, 144, 206, 0.4)'
                              : '0 6px 12px rgba(54, 144, 206, 0.3)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = isDarkMode 
                            ? '0 4px 8px rgba(54, 144, 206, 0.3)'
                            : '0 4px 8px rgba(54, 144, 206, 0.2)';
                        }}
                      >
                        <MdDrafts size={16} />
                        {emailSending ? 'Sending...' : 'Draft Request (to yourself) first'}
                      </button>
                    </>
                  )}
                  
                  <button
                    onClick={() => handleAction('override')}
                    disabled={isProcessing}
                    style={{
                      background: isProcessing 
                        ? `${colours.green}60` 
                        : `linear-gradient(135deg, ${colours.green} 0%, ${colours.green}CC 100%)`,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 18px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isDarkMode 
                        ? '0 4px 8px rgba(32, 178, 108, 0.3)'
                        : '0 4px 8px rgba(32, 178, 108, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isProcessing) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = isDarkMode 
                          ? '0 6px 12px rgba(32, 178, 108, 0.4)'
                          : '0 6px 12px rgba(32, 178, 108, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = isDarkMode 
                        ? '0 4px 8px rgba(32, 178, 108, 0.3)'
                        : '0 4px 8px rgba(32, 178, 108, 0.2)';
                    }}
                  >
                    <MdCheckCircle size={16} />
                    {isProcessing ? 'Processing...' : 
                      (workflowState === 'documents-received' ? 'Approve Verification' : 'Skip & Approve')
                    }
                  </button>
                </div>
                
                {workflowState === 'fresh-failure' && isDocumentsAlreadyRequested && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    background: isDarkMode 
                      ? 'rgba(107, 114, 128, 0.15)'
                      : 'rgba(107, 114, 128, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(107, 114, 128, 0.3)' : 'rgba(107, 114, 128, 0.2)'}`,
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <MdInfo size={16} style={{ color: '#6B7280' }} />
                    <span style={{
                      color: isDarkMode ? colours.dark.subText : colours.light.subText,
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      Additional documents already requested
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Status Indicators for other states */}
            {workflowState === 'documents-pending' && (
              <div style={{
                padding: '16px 18px',
                background: isDarkMode 
                  ? 'linear-gradient(135deg, rgba(255, 140, 0, 0.12) 0%, rgba(255, 140, 0, 0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(255, 140, 0, 0.06) 0%, rgba(255, 140, 0, 0.03) 100%)',
                border: `1px solid ${colours.orange}30`,
                borderRadius: '10px',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  padding: '6px',
                  borderRadius: '6px',
                  backgroundColor: `${colours.orange}20`,
                  color: colours.orange
                }}>
                  <MdAccessTime size={18} />
                </div>
                <div>
                  <div style={{
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontWeight: '600',
                    fontSize: '15px'
                  }}>
                    Awaiting Client Response
                  </div>
                  <div style={{
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontSize: '13px'
                  }}>
                    Waiting for additional documents from client
                  </div>
                </div>
              </div>
            )}

            {workflowState === 'verified' && (
              <div style={{
                padding: '16px 18px',
                background: isDarkMode 
                  ? 'linear-gradient(135deg, rgba(32, 178, 108, 0.12) 0%, rgba(32, 178, 108, 0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(32, 178, 108, 0.06) 0%, rgba(32, 178, 108, 0.03) 100%)',
                border: `1px solid ${colours.green}30`,
                borderRadius: '10px',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  padding: '6px',
                  borderRadius: '6px',
                  backgroundColor: `${colours.green}20`,
                  color: colours.green
                }}>
                  <MdCheckBox size={18} />
                </div>
                <div>
                  <div style={{
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontWeight: '600',
                    fontSize: '15px'
                  }}>
                    Verification Complete
                  </div>
                  <div style={{
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontSize: '13px'
                  }}>
                    ID verification has been approved and completed
                  </div>
                </div>
              </div>
            )}

            {/* PEP & Sanctions Check */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 18px',
              background: isDarkMode 
                ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
              borderRadius: '10px',
              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
              boxShadow: isDarkMode 
                ? '0 2px 4px rgba(0, 0, 0, 0.3)' 
                : '0 2px 4px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.2s ease'
            }}>
              <div style={{ 
                marginRight: '14px', 
                fontSize: '18px',
                padding: '4px',
                borderRadius: '6px',
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
              }}>
                {getResultIcon(details.pepResult)}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '15px',
                  fontWeight: '600'
                }}>
                  PEP & Sanctions Check
                </strong>
              </div>
              <div style={{
                color: getResultColor(details.pepResult),
                fontWeight: '700',
                fontSize: '15px',
                padding: '4px 12px',
                borderRadius: '6px',
                backgroundColor: `${getResultColor(details.pepResult)}15`
              }}>
                {details.pepResult}
              </div>
            </div>

            {/* Address Verification */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 18px',
              background: isDarkMode 
                ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
              borderRadius: '10px',
              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
              boxShadow: isDarkMode 
                ? '0 2px 4px rgba(0, 0, 0, 0.3)' 
                : '0 2px 4px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.2s ease'
            }}>
              <div style={{ 
                marginRight: '14px', 
                fontSize: '18px',
                padding: '4px',
                borderRadius: '6px',
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
              }}>
                {getResultIcon(details.addressResult)}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '15px',
                  fontWeight: '600'
                }}>
                  Address Verification
                </strong>
              </div>
              <div style={{
                color: getResultColor(details.addressResult),
                fontWeight: '700',
                fontSize: '15px',
                padding: '4px 12px',
                borderRadius: '6px',
                backgroundColor: `${getResultColor(details.addressResult)}15`
              }}>
                {details.addressResult}
              </div>
            </div>
          </div>
        </div>

        {/* Document Request Info Box */}
        <div style={{
          marginBottom: '28px'
        }}>
          {workflowState === 'verified' && (
            <div style={{
              padding: '18px 20px',
              background: isDarkMode 
                ? 'linear-gradient(135deg, rgba(32, 178, 108, 0.15) 0%, rgba(32, 178, 108, 0.08) 100%)'
                : 'linear-gradient(135deg, rgba(32, 178, 108, 0.08) 0%, rgba(32, 178, 108, 0.04) 100%)',
              border: `2px solid ${colours.green}20`,
              borderRadius: '10px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '4px',
                height: '100%',
                background: colours.green
              }} />
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                paddingLeft: '12px'
              }}>
                <div style={{
                  fontSize: '20px',
                  padding: '8px',
                  borderRadius: '8px',
                  backgroundColor: `${colours.green}20`,
                  color: colours.green,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <MdCheckBox size={20} />
                </div>
                <div>
                  <div style={{
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontWeight: '700',
                    fontSize: '15px',
                    marginBottom: '4px'
                  }}>
                    ID Verification Complete
                  </div>
                  <div style={{
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontSize: '13px'
                  }}>
                    This verification has been approved and completed.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '14px',
          justifyContent: 'flex-end',
          flexWrap: 'wrap'
        }}>
          {/* Conditional buttons based on workflow state */}
          {workflowState === 'verified' && (
            <button
              onClick={onClose}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: `linear-gradient(135deg, ${colours.green} 0%, #1a8c5a 100%)`,
                color: 'white',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 6px rgba(32, 178, 108, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 12px rgba(32, 178, 108, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(32, 178, 108, 0.3)';
              }}
            >
              Close
            </button>
          )}

          {workflowState === 'fresh-failure' && (
            <button
              onClick={onClose}
              style={{
                padding: '12px 24px',
                border: `2px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                background: isDarkMode
                  ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                  : 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = isDarkMode 
                  ? '0 6px 12px rgba(0, 0, 0, 0.3)'
                  : '0 6px 12px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Close
            </button>
          )}

          {workflowState === 'documents-pending' && (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  border: `2px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                  background: isDarkMode
                    ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                    : 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isDarkMode 
                    ? '0 4px 6px rgba(0, 0, 0, 0.3)' 
                    : '0 4px 6px rgba(0, 0, 0, 0.07)'
                }}
              >
                Cancel
              </button>
              {onOverride && (
                <button
                  onClick={() => handleAction('override')}
                  disabled={isProcessing}
                  style={{
                    padding: '12px 24px',
                    border: `2px solid ${colours.red}`,
                    background: `linear-gradient(135deg, ${colours.red} 0%, ${colours.red}dd 100%)`,
                    color: 'white',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    opacity: isProcessing ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                    boxShadow: isDarkMode 
                      ? '0 4px 6px rgba(0, 0, 0, 0.3)' 
                      : '0 4px 6px rgba(0, 0, 0, 0.07)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = isDarkMode 
                        ? '0 6px 12px rgba(0, 0, 0, 0.4)' 
                        : '0 6px 12px rgba(0, 0, 0, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = isDarkMode 
                        ? '0 4px 6px rgba(0, 0, 0, 0.3)' 
                        : '0 4px 6px rgba(0, 0, 0, 0.07)';
                    }
                  }}
                >
                  {isProcessing && <MdMoreHoriz style={{ animation: 'pulse 1.5s infinite' }} />}
                  Skip Additional ID Request
                </button>
              )}
              <div style={{
                padding: '12px 24px',
                background: isDarkMode
                  ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                  : 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: colours.orange,
                border: `2px solid ${colours.orange}40`
              }}>
                Documents Requested - Awaiting Client Response
              </div>
            </>
          )}

          {workflowState === 'documents-received' && (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: '12px 24px',
                  border: `2px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                  background: isDarkMode
                    ? 'linear-gradient(135deg, #3a3a3a 0%, #2e2e2e 100%)'
                    : 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isDarkMode 
                    ? '0 4px 6px rgba(0, 0, 0, 0.3)' 
                    : '0 4px 6px rgba(0, 0, 0, 0.07)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(workflowState === 'documents-received' ? 'approve' : 'override')}
                disabled={isProcessing}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  background: `linear-gradient(135deg, ${colours.green} 0%, #1a8c5a 100%)`,
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px rgba(32, 178, 108, 0.3)'
                }}
                onMouseEnter={(e) => {
                  if (!isProcessing) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 12px rgba(32, 178, 108, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(32, 178, 108, 0.3)';
                }}
              >
                {isProcessing && <MdMoreHoriz style={{ animation: 'pulse 1.5s infinite' }} />}
                {isProcessing 
                  ? 'Processing...' 
                  : workflowState === 'documents-received' 
                    ? 'Approve Verification' 
                    : 'Override Review'
                }
              </button>
            </>
          )}
        </div>

        {/* Electronic ID Check Response - Subtle expandable section at bottom */}
        {details.rawResponse && (
          <>
            <div style={{
              width: '100%',
              height: '1px',
              background: isDarkMode 
                ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)'
                : 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
              margin: '24px 0 16px 0'
            }} />

            <details style={{
              backgroundColor: 'transparent',
              border: 'none',
              padding: '0'
            }}>
              <summary style={{
                cursor: 'pointer',
                padding: '8px 0',
                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                fontSize: '11px',
                fontWeight: '500',
                opacity: 0.6,
                transition: 'all 0.2s ease',
                userSelect: 'none',
                listStyle: 'none'
              }}>
                <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                  Technical Details
                </span>
                <span style={{ fontSize: '10px', marginLeft: '6px', opacity: 0.5 }}>
                  (Electronic ID verification response data)
                </span>
              </summary>
              
              <div style={{
                padding: '12px 16px',
                background: isDarkMode 
                  ? 'rgba(255, 255, 255, 0.02)'
                  : 'rgba(0, 0, 0, 0.02)',
                border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                borderRadius: '6px',
                marginTop: '8px'
              }}>
                <div style={{
                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                  fontSize: '12px',
                  marginBottom: '12px',
                  opacity: 0.8
                }}>
                  <strong>Response Summary:</strong> {(() => {
                    const parsed = parseRawResponse(details.rawResponse);
                    const responseData = Array.isArray(parsed) ? parsed[0] : parsed;
                    const checkCount = responseData?.checkStatuses?.length || 0;
                    return `${checkCount} verification checks performed, correlation ID: ${responseData?.correlationId?.slice(0, 8) || 'N/A'}...`;
                  })()}
                </div>

                <details style={{
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                  border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                  borderRadius: '6px',
                  padding: '0'
                }}>
                  <summary style={{
                    cursor: 'pointer',
                    padding: '12px 16px',
                    color: colours.blue,
                    fontSize: '13px',
                    fontWeight: '600',
                    borderRadius: '6px',
                    transition: 'all 0.2s ease',
                    userSelect: 'none',
                    opacity: 0.8
                  }}>
                    View Technical Details & Database Records
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '400',
                      marginLeft: '8px',
                      opacity: 0.7
                    }}>
                      (Correlation ID, Check Results, Source Data)
                    </span>
                  </summary>
                  
                  <div style={{
                    padding: '16px',
                    paddingTop: '8px',
                    borderTop: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`
                  }}>
                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      marginBottom: '16px',
                      flexWrap: 'wrap'
                    }}>
                      <button
                        onClick={() => document.getElementById('checkStatuses')?.scrollIntoView({ behavior: 'smooth' })}
                        style={{
                          padding: '6px 12px',
                          border: `1px solid ${colours.blue}`,
                          background: 'transparent',
                          color: colours.blue,
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `${colours.blue}10`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        Jump to Check Statuses
                      </button>
                      <button
                        onClick={() => document.getElementById('sourceResults')?.scrollIntoView({ behavior: 'smooth' })}
                        style={{
                          padding: '6px 12px',
                          border: `1px solid ${colours.blue}`,
                          background: 'transparent',
                          color: colours.blue,
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `${colours.blue}10`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        Jump to Source Results
                      </button>
                      <button
                        onClick={() => document.getElementById('rawJson')?.scrollIntoView({ behavior: 'smooth' })}
                        style={{
                          padding: '6px 12px',
                          border: `1px solid ${colours.blue}`,
                          background: 'transparent',
                          color: colours.blue,
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `${colours.blue}10`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        Jump to Raw Data
                      </button>
                    </div>
                    
                    <div style={{
                      color: isDarkMode ? colours.dark.subText : colours.light.subText,
                      fontSize: '12px',
                      lineHeight: '1.6'
                    }}>
                      {(() => {
                        const parsed = parseRawResponse(details.rawResponse);
                        const responseData = Array.isArray(parsed) ? parsed[0] : parsed;
                        
                        if (!responseData) return <div>No response data available</div>;
                        
                        const getResultColor = (result: string) => {
                          const r = result?.toLowerCase();
                          if (r === 'passed' || r === 'pass' || r === 'verified') return colours.green;
                          if (r === 'review') return colours.orange;
                          if (r === 'failed' || r === 'fail') return colours.red;
                          return 'inherit';
                        };
                        
                        return (
                          <div>
                            <div id="checkStatuses" style={{ marginBottom: '20px' }}>
                              <div style={{ 
                                fontWeight: '600', 
                                marginBottom: '12px', 
                                color: colours.blue,
                                fontSize: '14px',
                                borderBottom: `1px solid ${colours.blue}20`,
                                paddingBottom: '6px'
                              }}>
                                Check Statuses & Database Records:
                              </div>
                              <div style={{ 
                                backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)',
                                padding: '12px',
                                borderRadius: '6px',
                                border: `1px solid ${colours.blue}20`
                              }}>
                                <div>Overall Result: <strong style={{ color: getResultColor(responseData.overallResult?.result) }}>{responseData.overallResult?.result || 'N/A'}</strong></div>
                                <div>Overall Status: <strong>{responseData.overallStatus?.status || 'N/A'}</strong></div>
                                {responseData.correlationId && (
                                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${colours.blue}20` }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', marginBottom: '4px' }}>Database Reference:</div>
                                    <div>Correlation ID: <code style={{ 
                                      fontSize: '10px', 
                                      background: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
                                      padding: '2px 4px',
                                      borderRadius: '3px'
                                    }}>{responseData.correlationId}</code></div>
                                    {responseData.externalReferenceId && <div>External Reference: <strong>{responseData.externalReferenceId}</strong></div>}
                                    <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
                                      Use these IDs to reference this check in our database or with Tiller support
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div id="sourceResults" style={{ marginBottom: '20px' }}>
                              <div style={{ 
                                fontWeight: '600', 
                                marginBottom: '12px', 
                                color: colours.blue,
                                fontSize: '14px',
                                borderBottom: `1px solid ${colours.blue}20`,
                                paddingBottom: '6px'
                              }}>
                                Individual Check Results:
                              </div>
                              {responseData.checkStatuses && responseData.checkStatuses.length > 0 ? (
                                responseData.checkStatuses.map((check: any, index: number) => (
                                  <div key={index} style={{ marginBottom: '16px', paddingLeft: '12px', borderLeft: `3px solid ${getResultColor(check.result?.result)}`, backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', padding: '12px', borderRadius: '6px' }}>
                                    <div style={{ marginBottom: '8px' }}>
                                      <strong>{check.sourceResults?.title || `Check ${index + 1}`}</strong>
                                      <div style={{ fontSize: '11px', color: isDarkMode ? colours.dark.subText : colours.light.subText }}>
                                        Type: {check.checkTypeId === 1 ? 'Address Verification' : check.checkTypeId === 2 ? 'PEP & Sanctions' : check.checkTypeId === 3 ? 'ID Verification' : `Type ${check.checkTypeId}`}
                                        {check.id && ` • ID: ${check.id}`}
                                      </div>
                                    </div>
                                    <div>Result: <strong style={{ color: getResultColor(check.result?.result) }}>{check.result?.result || 'N/A'}</strong></div>
                                    <div>Status: <strong>{check.status?.status || 'N/A'}</strong></div>
                                    {check.sourceResults?.date && <div>Date: {new Date(check.sourceResults.date).toLocaleString()}</div>}
                                    
                                    {check.resultCount && (
                                      <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.8, backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)', padding: '6px', borderRadius: '4px' }}>
                                        <strong>Source Summary:</strong> {check.resultCount.totalSourcesChecked || 0} checked, {check.resultCount.totalSourcesPassed || 0} passed, {check.resultCount.totalSourcesForReview || 0} for review
                                      </div>
                                    )}
                                    
                                    {check.sourceResults?.results && check.sourceResults.results.length > 0 && (
                                      <details style={{ marginTop: '12px' }}>
                                        <summary style={{ cursor: 'pointer', color: colours.blue, fontSize: '11px', fontWeight: '600' }}>View detailed breakdown ({check.sourceResults.results.length} results)</summary>
                                        <div style={{ marginTop: '8px', paddingLeft: '12px' }}>
                                          {check.sourceResults.results.map((result: any, resultIndex: number) => (
                                            <div key={resultIndex} style={{ marginBottom: '8px', padding: '8px', backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)', borderRadius: '4px', border: `1px solid ${getResultColor(result.result)}30` }}>
                                              <div><strong>{result.title}</strong> - <span style={{ color: getResultColor(result.result) }}>{result.result}</span></div>
                                              <div style={{ fontSize: '11px', opacity: 0.8 }}>{result.description}</div>
                                              {result.detail?.reasons && result.detail.reasons.length > 0 && (
                                                <div style={{ marginTop: '6px' }}>
                                                  {result.detail.reasons.map((reason: any, reasonIndex: number) => (
                                                    <div key={reasonIndex} style={{ fontSize: '10px', marginLeft: '8px', marginTop: '2px' }}>
                                                      • <strong>{reason.key || 'Detail'}:</strong> <span style={{ color: getResultColor(reason.result) }}>{reason.result}</span>
                                                      {reason.reason && <div style={{ marginLeft: '12px', opacity: 0.7, fontStyle: 'italic' }}>{reason.reason} {reason.code && `(Code: ${reason.code})`}</div>}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </details>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div>No check details available</div>
                              )}
                            </div>
                            
                            <div id="rawJson">
                              <div style={{ 
                                fontWeight: '600', 
                                marginBottom: '12px', 
                                color: colours.blue,
                                fontSize: '14px',
                                borderBottom: `1px solid ${colours.blue}20`,
                                paddingBottom: '6px'
                              }}>
                                Raw Response Data:
                              </div>
                              <div style={{
                                fontSize: '11px',
                                marginBottom: '8px',
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255, 140, 0, 0.1)' : 'rgba(255, 140, 0, 0.05)',
                                border: `1px solid ${colours.orange}30`,
                                borderRadius: '4px',
                                color: isDarkMode ? colours.dark.subText : colours.light.subText
                              }}>
                                <strong>Note:</strong> This raw JSON data matches what's stored in our database. Since this ID verification system is new, this data helps with understanding how the checks work and troubleshooting any issues.
                              </div>
                              <pre style={{
                                fontSize: '10px',
                                lineHeight: '1.3',
                                fontFamily: 'monospace',
                                backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)',
                                padding: '12px',
                                borderRadius: '4px',
                                overflow: 'auto',
                                maxHeight: '300px',
                                border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`
                              }}>
                                {JSON.stringify(parsed, null, 2)}
                              </pre>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </details>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
};

export default IDVerificationReviewModal;
