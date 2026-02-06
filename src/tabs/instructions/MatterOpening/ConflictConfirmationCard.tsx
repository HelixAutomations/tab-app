/**
 * ConflictConfirmationCard.tsx
 * 
 * Enhanced conflict confirmation card for Matter Opening flow.
 * Adopts InlineWorkbench patterns: status banners, confirmation modals, clear visual states.
 */
import React, { useState } from 'react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import { 
  FaExclamationTriangle, 
  FaCheck, 
  FaCheckCircle, 
  FaTimes,
  FaShieldAlt,
  FaFileAlt,
  FaUserTie,
  FaBriefcase,
  FaSearch
} from 'react-icons/fa';

interface ConflictConfirmationCardProps {
  /** Client names for display */
  clientName: string;
  /** Matter description for context */
  matterDescription?: string;
  /** Opponent name if entered */
  opponentName?: string;
  /** Opponent solicitor if entered */
  opponentSolicitor?: string;
  /** Current confirmation state */
  noConflict: boolean;
  /** Callback when conflict status changes */
  onConflictStatusChange: (noConflict: boolean) => void;
  /** Whether to show opponent details section */
  showOpponentSection?: boolean;
  /** Callback to focus opponent name input */
  onFocusOpponentName?: () => void;
}

const ConflictConfirmationCard: React.FC<ConflictConfirmationCardProps> = ({
  clientName,
  matterDescription,
  opponentName,
  opponentSolicitor,
  noConflict,
  onConflictStatusChange,
  showOpponentSection = true,
  onFocusOpponentName,
}) => {
  const { isDarkMode } = useTheme();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [clientSearched, setClientSearched] = useState(false);
  const [opponentSearched, setOpponentSearched] = useState(false);
  const [resultsReviewed, setResultsReviewed] = useState(false);

  // Status colors
  const statusColors = {
    unconfirmed: {
      bg: isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.06)',
      border: isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)',
      text: '#ef4444',
    },
    confirmed: {
      bg: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)',
      border: isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)',
      text: '#22c55e',
    },
  };

  const currentStatus = noConflict ? 'confirmed' : 'unconfirmed';
  const colors = statusColors[currentStatus];

  // Render status banner (InlineWorkbench pattern)
  const renderStatusBanner = () => {
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
            {noConflict ? <FaCheckCircle size={16} /> : <FaExclamationTriangle size={16} />}
          </div>
          <div>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: colors.text,
              marginBottom: 2,
            }}>
              {noConflict ? 'No Conflict Confirmed' : 'Conflict Check Required'}
            </div>
            <div style={{
              fontSize: 10,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)',
            }}>
              {noConflict 
                ? 'Conflict search completed. No conflicts identified.'
                : 'Search Clio for conflicts before proceeding.'}
            </div>
          </div>
        </div>
        {!noConflict && (
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            style={{
              padding: '8px 14px',
              background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
              color: colours.highlight,
              border: `1px solid ${colours.highlight}`,
              borderRadius: 0,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <FaCheck size={10} />
            Confirm No Conflict
          </button>
        )}
      </div>
    );
  };

  // Render context tile
  const renderContextTile = (
    label: string,
    value: string | undefined,
    icon: React.ReactNode,
    placeholder: string
  ) => {
    const hasValue = value && value.trim().length > 0;
    const activeBg = isDarkMode
      ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.16) 0%, rgba(54, 144, 206, 0.10) 100%)'
      : 'linear-gradient(135deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.06) 100%)';
    const idleBg = isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.8)';
    const activeBorder = isDarkMode ? 'rgba(54, 144, 206, 0.45)' : 'rgba(54, 144, 206, 0.35)';
    const idleBorder = isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)';
    
    return (
      <div style={{
        flex: 1,
        minWidth: 180,
        padding: '12px 14px',
        background: hasValue ? activeBg : idleBg,
        border: `1px solid ${hasValue ? activeBorder : idleBorder}`,
        borderRadius: 0,
      }}>
        <div style={{
          fontSize: 8,
          fontWeight: 700,
          color: hasValue
            ? (isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.6)')
            : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)'),
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: 8,
        }}>
          {label}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: hasValue 
            ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)')
            : (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)'),
        }}>
          {icon}
          <span style={{
            fontSize: 11,
            fontWeight: hasValue ? 600 : 400,
            fontStyle: hasValue ? 'normal' : 'italic',
          }}>
            {hasValue ? value : placeholder}
          </span>
        </div>
      </div>
    );
  };

  // Checklist for modal
  const checklistItems = [
    { label: 'Searched client name in Clio', checked: clientSearched, key: 'client' },
    { label: 'Searched opponent name (if known)', checked: opponentSearched, key: 'opponent' },
    { label: 'Reviewed any returned results', checked: resultsReviewed, key: 'review' },
  ];

  return (
    <div style={{
      background: isDarkMode
        ? 'linear-gradient(135deg, #111827 0%, #1F2937 100%)'
        : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
      border: `1px solid ${isDarkMode ? '#374151' : '#E2E8F0'}`,
      borderRadius: 12,
      padding: 20,
      boxShadow: isDarkMode
        ? '0 2px 4px rgba(0, 0, 0, 0.3)'
        : '0 2px 4px rgba(0, 0, 0, 0.04)',
    }}>
      {/* Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 0,
          background: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
          border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <FaShieldAlt size={14} color="#ef4444" />
        </div>
        <div>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: isDarkMode ? '#E5E7EB' : '#0F172A',
          }}>
            Conflict Check
          </div>
          <div style={{
            fontSize: 10,
            color: isDarkMode ? '#9CA3AF' : '#64748B',
          }}>
            Confirm no conflicts exist before opening this matter
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {renderStatusBanner()}

      {/* Context Tiles Grid */}
      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: noConflict ? 16 : 0,
      }}>
        {renderContextTile('Client', clientName, <FaUserTie size={12} />, 'No client selected')}
        {renderContextTile('Matter', matterDescription, <FaBriefcase size={12} />, 'No description')}
        {showOpponentSection && renderContextTile('Opponent', opponentName, <FaFileAlt size={12} />, 'Not entered yet')}
        {showOpponentSection && renderContextTile('Opponent Solicitor', opponentSolicitor, <FaUserTie size={12} />, 'Not entered yet')}
      </div>

      {/* Reset/Modify Option when confirmed */}
      {noConflict && (
        <div
          onClick={() => onConflictStatusChange(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            marginTop: 8,
            background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)'}`,
            borderRadius: 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{
            fontSize: 11,
            color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
          }}>
            Need to re-check conflicts?
          </div>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            color: colours.highlight,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <FaTimes size={10} />
            Reset
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            style={{
              background: isDarkMode ? '#1e293b' : '#ffffff',
              borderRadius: 8,
              padding: 24,
              maxWidth: 480,
              width: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(54, 144, 206, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <FaShieldAlt size={18} color={colours.highlight} />
              </div>
              <div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: isDarkMode ? '#e2e8f0' : '#0f172a',
                  lineHeight: 1.3,
                  paddingTop: 1,
                }}>
                  Confirm No Conflict
                </div>
                <div style={{
                  fontSize: 11,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                }}>
                  {clientName}
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div style={{
              background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.8)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
              borderRadius: 4,
              padding: 16,
              marginBottom: 18,
            }}>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.65)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 12,
              }}>
                Conflict Search Checklist
              </div>
              {checklistItems.map(item => (
                <div
                  key={item.key}
                  onClick={() => {
                    if (item.key === 'client') {
                      setClientSearched(!clientSearched);
                    } else if (item.key === 'opponent') {
                      setOpponentSearched(!opponentSearched);
                    } else if (item.key === 'review') {
                      setResultsReviewed(!resultsReviewed);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    cursor: 'pointer',
                    borderBottom: item.key !== 'review' 
                      ? `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.04)'}` 
                      : 'none',
                  }}
                >
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: 0,
                    border: `2px solid ${item.checked 
                      ? '#22c55e' 
                      : (isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.25)')}`,
                    background: item.checked ? '#22c55e' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    flexShrink: 0,
                  }}>
                    {item.checked && <FaCheck size={10} color="#FFFFFF" />}
                  </div>
                  <span style={{
                    fontSize: 12,
                    color: item.checked 
                      ? (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)')
                      : (isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.6)'),
                    fontWeight: item.checked ? 500 : 400,
                  }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Clio Search Help */}
            <div style={{
              padding: 12,
              background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
              borderRadius: 4,
              fontSize: 11,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <FaSearch size={14} color={colours.highlight} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <strong>Tip:</strong> Search in Clio using the client's name, trading name, and any
                known opponent details. Check for existing matters and contacts.
              </div>
            </div>

            {/* Confirmation Statement */}
            <div style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)',
              marginBottom: 18,
            }}>
              By confirming, you declare that you have:
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Performed a conflict search in Clio</li>
                <li>Reviewed all relevant search results</li>
                <li>Confirmed no conflict of interest exists</li>
              </ul>
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
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onConflictStatusChange(true);
                  setShowConfirmModal(false);
                }}
                style={{
                  padding: '10px 18px',
                  background: colours.highlight,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FaCheckCircle size={10} />
                Confirm No Conflict
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConflictConfirmationCard;
