/**
 * IdentityConfirmationCard.tsx
 * 
 * Rich ID verification display card for Matter Opening flow.
 * Adopts patterns from InlineWorkbench: status banners, tiles, confirmation modals.
 */
import React, { useState } from 'react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import { Icon } from '@fluentui/react/lib/Icon';

type VerificationStatus = 'passed' | 'review' | 'failed' | 'pending' | '';

interface VerificationData {
  id: VerificationStatus;
  pep: VerificationStatus;
  address: VerificationStatus;
  checkDate?: string;
  provider?: string;
}

interface DocumentProvidedData {
  passportNumber?: string;
  drivingLicenceNumber?: string;
}

type MetaRowItem = {
  label: string;
  value: string;
  monospace?: boolean;
};

interface IdentityConfirmationCardProps {
  /** Client name for display */
  clientName: string;
  /** Verification results */
  verification: VerificationData;
  /** Optional document numbers (mirrors InlineWorkbench “Document Provided”) */
  documentProvided?: DocumentProvidedData;
  /** Optional metadata row items (mirrors InlineWorkbench metadata row) */
  metaRowItems?: MetaRowItem[];
  /** Whether there are multiple clients */
  hasMultipleClients?: boolean;
  /** Count of clients if multiple */
  clientCount?: number;
  /** Whether all clients have passed ID */
  allClientsPassed?: boolean;
  /** Callback when user confirms ID is acceptable */
  onIdConfirmed?: (confirmed: boolean) => void;
  /** Current confirmation state */
  idConfirmed?: boolean;
  /** Whether to show the confirmation toggle */
  showConfirmation?: boolean;
  /** Optional instruction ref for context */
  instructionRef?: string;
  /** Optional callback to trigger ID verification check when pending */
  onRunIdCheck?: () => void;
  /** Demo mode — show inline outcome selector instead of real EID */
  demoModeEnabled?: boolean;
  /** Callback when user picks a demo EID result */
  onDemoEidResult?: (result: { id: VerificationStatus; pep: VerificationStatus; address: VerificationStatus }) => void;
}

// Status palette helper (from InlineWorkbench pattern)
const getStatusColors = (status: VerificationStatus, isDarkMode: boolean) => {
  if (status === 'passed') return {
    bg: isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
    border: isDarkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)',
    text: '#22c55e',
    label: 'Passed',
    icon: <Icon iconName="SkypeCheck" style={{ fontSize: 12 }} />,
  };
  if (status === 'review') return {
    bg: isDarkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.08)',
    border: isDarkMode ? 'rgba(251, 191, 36, 0.4)' : 'rgba(251, 191, 36, 0.3)',
    text: '#f59e0b',
    label: 'Review',
    icon: <Icon iconName="Warning" style={{ fontSize: 12 }} />,
  };
  if (status === 'failed') return {
    bg: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
    border: isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
    text: '#ef4444',
    label: 'Failed',
    icon: <Icon iconName="Warning" style={{ fontSize: 12 }} />,
  };
  if (status === 'pending') return {
    bg: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
    border: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
    text: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
    label: 'Pending',
    icon: <Icon iconName="ContactCard" style={{ fontSize: 12 }} />,
  };
  return {
    bg: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
    border: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)',
    text: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
    label: 'Unknown',
    icon: null,
  };
};

// Status Pill component (from InlineWorkbench)
const StatusPill: React.FC<{ status: VerificationStatus; label: string; isDarkMode: boolean }> = ({ status, label, isDarkMode }) => {
  const colors = getStatusColors(status, isDarkMode);
  return (
    <span style={{
      fontSize: 9,
      padding: '4px 10px',
      borderRadius: 0,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.text,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
    }}>
      {colors.icon}
      {label}
    </span>
  );
};

const IdentityConfirmationCard: React.FC<IdentityConfirmationCardProps> = ({
  clientName,
  verification,
  documentProvided,
  metaRowItems,
  hasMultipleClients = false,
  clientCount = 1,
  allClientsPassed = false,
  onIdConfirmed,
  idConfirmed = false,
  showConfirmation = true,
  instructionRef,
  onRunIdCheck,
  demoModeEnabled = false,
  onDemoEidResult,
}) => {
  const { isDarkMode } = useTheme();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Determine overall ID status
  const overallStatus = verification.id || 'pending';
  const overallColors = getStatusColors(overallStatus, isDarkMode);
  
  // Calculate if ID check needs attention
  const needsReview = overallStatus === 'review' || overallStatus === 'failed';
  const isVerified = overallStatus === 'passed';

  const normaliseDocValue = (value?: string): string => {
    const v = (value ?? '').trim();
    return v ? v : '—';
  };

  const hasPassport = normaliseDocValue(documentProvided?.passportNumber) !== '—';
  const hasLicence = normaliseDocValue(documentProvided?.drivingLicenceNumber) !== '—';
  const selectedDoc: 'passport' | 'licence' | null = hasPassport ? 'passport' : hasLicence ? 'licence' : null;

  // Status banner renderer (from InlineWorkbench pattern)
  const renderStatusBanner = () => {
    const bannerStatus = isVerified ? 'complete' : needsReview ? 'review' : 'pending';
    const bannerColors = {
      complete: {
        bg: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)',
        border: isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)',
        text: '#22c55e',
      },
      review: {
        bg: isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.06)',
        border: isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)',
        text: '#ef4444',
      },
      pending: {
        bg: isDarkMode ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.06)',
        border: isDarkMode ? 'rgba(251, 191, 36, 0.25)' : 'rgba(251, 191, 36, 0.2)',
        text: '#f59e0b',
      },
    };
    const colors = bannerColors[bannerStatus];

    const title = isVerified
      ? (hasMultipleClients ? `All ${clientCount} Clients Verified` : 'ID Verified')
      : needsReview
        ? 'ID Needs Review'
        : 'ID Pending';

    const subtitle = isVerified
      ? 'Electronic ID verification completed successfully.'
      : needsReview
        ? 'Review the verification results before proceeding.'
        : 'Run ID verification to confirm client identity.';

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 0,
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.text,
          }}>
            {isVerified ? <Icon iconName="SkypeCheck" style={{ fontSize: 16 }} /> : needsReview ? <Icon iconName="Warning" style={{ fontSize: 16 }} /> : <Icon iconName="ContactCard" style={{ fontSize: 16 }} />}
          </div>
          <div>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: colors.text,
              marginBottom: 2,
            }}>
              {title}
            </div>
            <div style={{
              fontSize: 10,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)',
            }}>
              {subtitle}
            </div>
          </div>
        </div>
        {needsReview && !idConfirmed && showConfirmation && (
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            style={{
              padding: '8px 14px',
              background: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid #ef4444',
              borderRadius: 0,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Icon iconName="Warning" style={{ fontSize: 10 }} />
            Review & Confirm
          </button>
        )}
        {!needsReview && !isVerified && demoModeEnabled && onDemoEidResult && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? '#9CA3AF' : '#64748B', marginRight: 4 }}>DEMO:</span>
            {[
              { label: 'Pass', id: 'passed' as VerificationStatus, color: '#22c55e', icon: 'SkypeCheck' },
              { label: 'Review', id: 'review' as VerificationStatus, color: '#f59e0b', icon: 'Warning' },
              { label: 'Fail', id: 'failed' as VerificationStatus, color: '#ef4444', icon: 'StatusErrorFull' },
            ].map(opt => (
              <button
                key={opt.label}
                type="button"
                onClick={() => onDemoEidResult({
                  id: opt.id,
                  pep: opt.id === 'failed' ? 'failed' : 'passed',
                  address: opt.id === 'failed' ? 'failed' : 'passed',
                })}
                style={{
                  padding: '6px 12px',
                  background: isDarkMode ? `${opt.color}15` : `${opt.color}10`,
                  color: opt.color,
                  border: `1px solid ${opt.color}`,
                  borderRadius: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Icon iconName={opt.icon} style={{ fontSize: 10 }} />
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {!needsReview && !isVerified && !demoModeEnabled && onRunIdCheck && (
          <button
            type="button"
            onClick={onRunIdCheck}
            style={{
              padding: '8px 14px',
              background: colours.highlight,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 0,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Icon iconName="ContactCard" style={{ fontSize: 10 }} />
            Run ID Verification
          </button>
        )}
      </div>
    );
  };

  // Verification tile renderer
  const renderVerificationTile = (
    label: string,
    status: VerificationStatus,
    icon: React.ReactNode
  ) => {
    const colors = getStatusColors(status, isDarkMode);
    const displayStatus = status || 'pending';

    return (
      <div style={{
        flex: 1,
        padding: '12px 14px',
        background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.8)',
        border: `1px solid ${colors.border}`,
        borderRadius: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{
            fontSize: 8,
            fontWeight: 700,
            color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {label}
          </div>
          <StatusPill status={displayStatus} label={colors.label} isDarkMode={isDarkMode} />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: colors.text,
        }}>
          {icon}
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'capitalize',
          }}>
            {displayStatus}
          </span>
        </div>
      </div>
    );
  };

  const OptionButton: React.FC<{
    label: string;
    icon: React.ReactNode;
    value: string;
    isSelected: boolean;
    isDisabled: boolean;
  }> = ({ label, icon, value, isSelected, isDisabled }) => (
    <button
      type="button"
      disabled
      style={{
        flex: 1,
        padding: '10px 12px',
        minHeight: 54,
        borderRadius: 0,
        border: `1px solid ${isSelected ? colours.green : isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
        background: isSelected
          ? (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
          : (isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(0, 0, 0, 0.02)'),
        color: isSelected
          ? colours.green
          : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)'),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'center',
        gap: 6,
        opacity: isDisabled ? 0.45 : 1,
        cursor: 'default',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18 }}>
            {icon}
          </span>
          <div style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {label}
          </div>
        </div>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: isSelected ? colours.green : (isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)'),
          flexShrink: 0,
        }} />
      </div>

      <div style={{
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 700,
        color: isSelected
          ? colours.green
          : (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)'),
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </button>
  );

  return (
    <div style={{
      background: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.7)',
      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
      borderRadius: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px',
        background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)',
        borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 9,
            fontWeight: 700,
            color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            <Icon iconName="ContactCard" style={{ fontSize: 11 }} /> ID Verification
          </div>
        </div>
        {instructionRef && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}>
              Ref
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: colours.highlight,
            }}>
              {instructionRef}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 14px' }}>
        {renderStatusBanner()}

        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 9,
            fontWeight: 700,
            color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 10,
          }}>
            <Icon iconName="ContactCard" style={{ fontSize: 11 }} /> Document Provided
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <OptionButton
                label="Passport"
                icon={<Icon iconName="ContactCard" style={{ fontSize: 12 }} />}
                value={normaliseDocValue(documentProvided?.passportNumber)}
                isSelected={selectedDoc === 'passport'}
                isDisabled={!!selectedDoc && selectedDoc !== 'passport'}
              />
              <OptionButton
                label="Driving licence"
                icon={<Icon iconName="ContactCard" style={{ fontSize: 12 }} />}
                value={normaliseDocValue(documentProvided?.drivingLicenceNumber)}
                isSelected={selectedDoc === 'licence'}
                isDisabled={!!selectedDoc && selectedDoc !== 'licence'}
              />
            </div>

            {!selectedDoc && (
              <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.55)' : 'rgba(100, 116, 139, 0.55)' }}>
                No document provided.
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Icon iconName="Shield" style={{ fontSize: 11 }} /> Electronic ID (EID)
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {renderVerificationTile('Overall', verification.id, <Icon iconName="Shield" style={{ fontSize: 12 }} />)}
            {renderVerificationTile('PEP/Sanctions', verification.pep, <Icon iconName="LockSolid" style={{ fontSize: 12 }} />)}
            {renderVerificationTile('Address', verification.address, <Icon iconName="MapPin" style={{ fontSize: 12 }} />)}
          </div>

          {!!metaRowItems?.length && (
            <div style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              {metaRowItems
                .filter((item) => String(item.value || '').trim() && String(item.value).trim() !== '—')
                .map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.3px' }}>
                      {item.label}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: item.monospace ? 'monospace' : undefined,
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)',
                    }}>
                      {item.value}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            width: 520,
            maxWidth: '90vw',
            background: isDarkMode ? '#111827' : '#FFFFFF',
            borderRadius: 2,
            border: `1px solid ${isDarkMode ? '#374151' : '#CBD5E1'}`,
            padding: 20,
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Icon iconName="Warning" style={{ fontSize: 16, color: '#ef4444' }} />
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: isDarkMode ? '#E5E7EB' : '#0F172A',
                  lineHeight: 1.3,
                  paddingTop: 1,
                }}>
                  Confirm Identity
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: isDarkMode ? '#9CA3AF' : '#475569',
                }}
              >
                <Icon iconName="Cancel" style={{ fontSize: 16 }} />
              </button>
            </div>

            <div style={{
              fontSize: 12,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)',
              lineHeight: 1.6,
              marginBottom: 18,
            }}>
              The ID check result indicates the identity may require review.
              Confirm you have reviewed the results and are satisfied to proceed.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: '10px 18px',
                  background: 'transparent',
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.25)'}`,
                  borderRadius: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase' as any,
                  letterSpacing: '0.5px',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onIdConfirmed?.(true);
                  setShowConfirmModal(false);
                }}
                style={{
                  padding: '10px 18px',
                  background: colours.highlight,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  textTransform: 'uppercase' as any,
                  letterSpacing: '0.5px',
                }}
              >
                <Icon iconName="SkypeCheck" style={{ fontSize: 10 }} />
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdentityConfirmationCard;
