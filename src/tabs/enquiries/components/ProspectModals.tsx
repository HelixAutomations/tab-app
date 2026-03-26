/**
 * ProspectModals — all overlay UI for the Prospects page.
 *
 * Extracted from Enquiries.tsx to reduce the god-component surface.
 * Contains: RatingModal, EditEnquiryModal, ReassignmentDropdown,
 * PipelineHoverTooltip (inline portal), SuccessMessageBar (legacy).
 *
 * Already-extracted overlays (CreateContactModal, PeopleSearchPanel,
 * OperationStatusToast) stay imported directly by the orchestrator.
 */

import React, { useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Text } from '@fluentui/react/lib/Text';
import { colours } from '../../../app/styles/colours';
import { renderPipelineIcon } from './pipeline/renderPipelineIcon';
import type { PipelineHoverInfo } from './pipeline/types';
import type { Enquiry } from '../../../app/functionality/types';

// ─── Shared prop contracts ────────────────────────────────────

export interface RatingModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  currentRating: string;
  setCurrentRating: (v: string) => void;
  submitRating: (value: string) => void;
  closeRateModal: () => void;
}

export interface EditEnquiryModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  editingEnquiry: Enquiry | null;
  setEditingEnquiry: (e: Enquiry | null) => void;
  handleEditEnquiry: (e: Enquiry) => Promise<void>;
  onClose: () => void;
}

export interface ReassignmentDropdownProps {
  dropdown: { enquiryId: string; x: number; y: number; openAbove?: boolean } | null;
  isDarkMode: boolean;
  isReassigning: boolean;
  teamMemberOptions: { value: string; text: string; initials: string; email: string }[];
  handleReassignmentSelect: (email: string) => void;
}

export interface PipelineTooltipPortalProps {
  pipelineHover: PipelineHoverInfo | null;
  isDarkMode: boolean;
}

export interface SuccessMessageBarProps {
  isVisible: boolean;
  onDismiss: () => void;
}

// ─── Rating Modal ─────────────────────────────────────────────

export const RatingModal: React.FC<RatingModalProps> = React.memo(({
  isOpen,
  isDarkMode,
  currentRating,
  setCurrentRating,
  submitRating,
  closeRateModal,
}) => {
  if (!isOpen) return null;

  const ratingOptions = [
    {
      value: 'Good',
      icon: 'Like',
      color: colours.highlight,
      label: 'Good fit',
      description: 'Worth moving quickly. Clear need, clear value, low friction.',
    },
    {
      value: 'Neutral',
      icon: 'StatusCircleRing',
      color: isDarkMode ? colours.subtleGrey : colours.greyText,
      label: 'Needs review',
      description: 'Usable lead, but not yet strong enough to prioritise ahead of cleaner work.',
    },
    {
      value: 'Poor',
      icon: 'Blocked2',
      color: colours.cta,
      label: 'Low quality',
      description: 'Poor fit, weak conversion signal, or not worth pushing further.',
    },
  ];
  const selectedOption = ratingOptions.find((option) => option.value === currentRating) || null;

  return (
    <div
      onClick={closeRateModal}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 3, 25, 0.68)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isDarkMode ? 'linear-gradient(180deg, rgba(6, 23, 51, 0.98) 0%, rgba(0, 3, 25, 0.98) 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f4f4f6 100%)',
          borderRadius: 0,
          padding: '0',
          width: 'min(520px, calc(100vw - 40px))',
          boxShadow: isDarkMode
            ? '0 10px 40px rgba(0, 0, 0, 0.5)'
            : '0 10px 40px rgba(0, 0, 0, 0.15)',
          border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.55)' : 'rgba(6, 23, 51, 0.1)'}`,
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.45)' : 'rgba(6, 23, 51, 0.08)'}`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.45px',
              textTransform: 'uppercase',
              color: isDarkMode ? colours.accent : colours.highlight,
            }}>
              Prospect rating
            </span>
            <Text style={{
              fontSize: 20,
              fontWeight: 700,
              color: isDarkMode ? colours.dark.text : colours.light.text,
            }}>
              Rate this enquiry
            </Text>
            <Text style={{
              fontSize: 12,
              color: isDarkMode ? '#d1d5db' : '#374151',
            }}>
              Pick the commercial quality of this prospect. The rating should reflect how worthwhile it is to progress.
            </Text>
          </div>
          <button
            onClick={closeRateModal}
            style={{
              background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(6, 23, 51, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(6, 23, 51, 0.08)'}`,
              cursor: 'pointer',
              padding: 6,
              color: isDarkMode ? 'rgba(255, 255, 255, 0.72)' : 'rgba(6, 23, 51, 0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon iconName="Cancel" style={{ fontSize: 16 }} />
          </button>
        </div>

        <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ratingOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setCurrentRating(option.value);
                submitRating(option.value);
              }}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 0,
                border: `1px solid ${currentRating === option.value
                  ? `${option.color}55`
                  : (isDarkMode ? 'rgba(75, 85, 99, 0.38)' : 'rgba(6, 23, 51, 0.08)')}`,
                background: currentRating === option.value
                  ? (isDarkMode ? `${option.color}18` : `${option.color}10`)
                  : (isDarkMode ? 'rgba(2, 6, 23, 0.34)' : 'rgba(255, 255, 255, 0.74)'),
                color: isDarkMode ? colours.dark.text : colours.light.text,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                fontSize: 14,
                fontWeight: currentRating === option.value ? 700 : 500,
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(12, 36, 64, 0.9)'
                  : 'rgba(214, 232, 255, 0.42)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = currentRating === option.value
                  ? (isDarkMode ? `${option.color}18` : `${option.color}10`)
                  : (isDarkMode ? 'rgba(2, 6, 23, 0.34)' : 'rgba(255, 255, 255, 0.74)');
              }}
            >
              <div style={{
                width: 30,
                height: 30,
                borderRadius: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isDarkMode ? `${option.color}18` : `${option.color}10`,
                color: option.color,
                flexShrink: 0,
              }}>
                <Icon iconName={option.icon} style={{ fontSize: 16, color: option.color }} />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>{option.label}</div>
                <div style={{
                  fontSize: 12,
                  color: isDarkMode ? '#d1d5db' : '#4b5563',
                  marginTop: 3,
                  lineHeight: 1.45,
                }}>
                  {option.description}
                </div>
              </div>
              {currentRating === option.value && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: option.color,
                  flexShrink: 0,
                  paddingTop: 2,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                    Selected
                  </span>
                  <Icon iconName="CheckMark" style={{ fontSize: 14, color: option.color }} />
                </div>
              )}
            </button>
          ))}

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 4,
            paddingTop: 14,
            borderTop: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.32)' : 'rgba(6, 23, 51, 0.08)'}`,
          }}>
            <Text style={{
              fontSize: 12,
              color: isDarkMode ? '#9ca3af' : '#6b7280',
            }}>
              {selectedOption ? `${selectedOption.label} is currently selected.` : 'No rating selected yet.'}
            </Text>
            <button
              type="button"
              onClick={closeRateModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 0,
                border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.42)' : 'rgba(6, 23, 51, 0.1)'}`,
                background: 'transparent',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
RatingModal.displayName = 'RatingModal';

// ─── Edit Enquiry Modal ───────────────────────────────────────

export const EditEnquiryModal: React.FC<EditEnquiryModalProps> = React.memo(({
  isOpen,
  isDarkMode,
  editingEnquiry,
  setEditingEnquiry,
  handleEditEnquiry,
  onClose,
}) => {
  if (!isOpen || !editingEnquiry) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? '#374151' : '#d1d5db'}`,
    backgroundColor: isDarkMode ? '#374151' : '#ffffff',
    color: isDarkMode ? '#f3f4f6' : '#061733',
    fontSize: '14px',
    fontFamily: 'Raleway, sans-serif',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '6px',
    color: isDarkMode ? '#f3f4f6' : '#374151',
  };

  const update = (field: keyof Enquiry, value: string) => {
    setEditingEnquiry({ ...editingEnquiry, [field]: value } as Enquiry);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 3, 25, 0.6)',
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: isDarkMode ? '#061733' : '#ffffff',
        borderRadius: 0,
        padding: '24px',
        width: '600px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 600,
            color: isDarkMode ? '#f3f4f6' : '#061733',
            fontFamily: 'Raleway, sans-serif',
          }}>
            Edit Enquiry
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: 0,
              color: isDarkMode ? '#9ca3af' : '#6b7280',
            }}
          >
            <Icon iconName="Cancel" styles={{ root: { fontSize: '18px' } }} />
          </button>
        </div>

        {/* Name row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>First Name</label>
            <input type="text" value={editingEnquiry.First_Name || ''} onChange={(e) => update('First_Name', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input type="text" value={editingEnquiry.Last_Name || ''} onChange={(e) => update('Last_Name', e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* Email */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={editingEnquiry.Email || ''} onChange={(e) => update('Email', e.target.value)} style={inputStyle} />
        </div>

        {/* Value */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Value</label>
          <input type="text" value={(editingEnquiry as any).Value || ''} onChange={(e) => update('Value' as any, e.target.value)} style={inputStyle} />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={editingEnquiry.Initial_first_call_notes || ''}
            onChange={(e) => update('Initial_first_call_notes', e.target.value)}
            rows={4}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: 0,
              border: `1px solid ${isDarkMode ? '#4b5563' : '#d1d5db'}`,
              backgroundColor: 'transparent',
              color: isDarkMode ? '#f3f4f6' : '#374151',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (editingEnquiry) {
                await handleEditEnquiry(editingEnquiry);
                onClose();
              }
            }}
            style={{
              padding: '10px 20px',
              borderRadius: 0,
              border: 'none',
              backgroundColor: colours.highlight,
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
});
EditEnquiryModal.displayName = 'EditEnquiryModal';

// ─── Reassignment Dropdown ────────────────────────────────────

export const ReassignmentDropdown: React.FC<ReassignmentDropdownProps> = React.memo(({
  dropdown,
  isDarkMode,
  isReassigning,
  teamMemberOptions,
  handleReassignmentSelect,
}) => {
  if (!dropdown) return null;

  return (
    <div
      className="reassignment-dropdown"
      style={{
        position: 'fixed',
        left: Math.min(dropdown.x, window.innerWidth - 220),
        top: Math.min(dropdown.y, window.innerHeight - 300),
        zIndex: 10000,
        background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.3)' : 'rgba(160, 160, 160, 0.25)'}`,
        borderRadius: 0,
        boxShadow: isDarkMode
          ? '0 8px 32px rgba(0, 0, 0, 0.5)'
          : '0 8px 32px rgba(0, 0, 0, 0.15)',
        maxHeight: 280,
        width: 200,
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(160, 160, 160, 0.15)'}`,
        fontSize: 11,
        fontWeight: 600,
        color: isDarkMode ? 'rgba(160, 160, 160, 0.7)' : 'rgba(107, 107, 107, 0.7)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        Reassign to
      </div>
      <div style={{ maxHeight: 230, overflowY: 'auto', overflowX: 'hidden' }}>
        {isReassigning ? (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: isDarkMode ? 'rgba(160, 160, 160, 0.7)' : 'rgba(107, 107, 107, 0.7)',
            fontSize: 12,
          }}>
            Reassigning...
          </div>
        ) : (
          teamMemberOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleReassignmentSelect(option.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 12,
                color: isDarkMode ? 'rgba(160, 160, 160, 0.9)' : 'rgba(107, 107, 107, 0.9)',
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)',
                color: colours.blue,
                fontSize: 10,
                fontWeight: 700,
              }}>
                {option.initials}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {option.text.split(' (')[0]}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
});
ReassignmentDropdown.displayName = 'ReassignmentDropdown';

// ─── Pipeline Hover Tooltip (portal) ──────────────────────────

export const PipelineTooltipPortal: React.FC<PipelineTooltipPortalProps> = React.memo(({
  pipelineHover,
  isDarkMode,
}) => {
  if (!pipelineHover || typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        top: pipelineHover.y,
        left: pipelineHover.x,
        transform: 'translate(-50%, -100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: isDarkMode ? 'rgba(8, 28, 48, 0.94)' : 'rgba(255, 255, 255, 0.96)',
        color: isDarkMode ? colours.dark.text : colours.light.text,
        border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(160, 160, 160, 0.18)'}`,
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(15, 23, 42, 0.08)',
        zIndex: 20000,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        fontSize: 10,
        fontWeight: 600,
        opacity: 0,
        animation: 'pipelineTipIn 120ms ease forwards',
      }}
    >
      <style>{`@keyframes pipelineTipIn { from { opacity: 0; transform: translate(-50%, -90%); } to { opacity: 1; transform: translate(-50%, -100%); } }`}</style>
      {pipelineHover.iconName && renderPipelineIcon(pipelineHover.iconName, pipelineHover.color, 11)}
      <span>{pipelineHover.title}</span>
      <span style={{
        color: isDarkMode ? 'rgba(209,213,219,0.8)' : 'rgba(55,65,81,0.8)',
        fontWeight: 500,
        fontSize: 10,
      }}>
        {pipelineHover.status}
      </span>
    </div>,
    document.body,
  );
});
PipelineTooltipPortal.displayName = 'PipelineTooltipPortal';

// ─── Legacy Success MessageBar ────────────────────────────────

export const SuccessMessageBar: React.FC<SuccessMessageBarProps> = React.memo(({ isVisible, onDismiss }) => {
  if (!isVisible) return null;
  return (
    <MessageBar
      messageBarType={MessageBarType.success}
      isMultiline={false}
      onDismiss={onDismiss}
      dismissButtonAriaLabel="Close"
      styles={{
        root: {
          position: 'fixed',
          bottom: 20,
          right: 20,
          maxWidth: '300px',
          zIndex: 1000,
          borderRadius: 0,
          fontFamily: 'Raleway, sans-serif',
        },
      }}
    >
      Rating submitted successfully!
    </MessageBar>
  );
});
SuccessMessageBar.displayName = 'SuccessMessageBar';
