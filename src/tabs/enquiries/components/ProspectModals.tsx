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
import { Icon, MessageBar, MessageBarType, Text } from '@fluentui/react';
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
    { value: 'Good', icon: 'FavoriteStarFill', color: colours.blue, label: 'Good quality enquiry' },
    { value: 'Neutral', icon: 'CircleRing', color: colours.grey, label: 'Average enquiry' },
    { value: 'Poor', icon: 'StatusErrorFull', color: colours.cta, label: 'Poor quality enquiry' },
  ];

  return (
    <div
      onClick={closeRateModal}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 3, 25, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : '#fff',
          borderRadius: 0,
          padding: '24px 20px',
          minWidth: 360,
          maxWidth: 480,
          boxShadow: isDarkMode
            ? '0 10px 40px rgba(0, 0, 0, 0.5)'
            : '0 10px 40px rgba(0, 0, 0, 0.15)',
          border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '0 0 16px 0',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Text style={{
            fontSize: 18,
            fontWeight: 600,
            color: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)',
          }}>
            Rate Enquiry
          </Text>
          <button
            onClick={closeRateModal}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon iconName="Cancel" style={{ fontSize: 16 }} />
          </button>
        </div>

        {/* Options */}
        <div style={{ padding: '8px 0' }}>
          {ratingOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setCurrentRating(option.value);
                submitRating(option.value);
              }}
              style={{
                width: '100%',
                padding: '14px 20px',
                border: 'none',
                background: currentRating === option.value
                  ? (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                  : 'transparent',
                color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 14,
                fontWeight: currentRating === option.value ? 600 : 500,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = currentRating === option.value
                  ? (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                  : 'transparent';
              }}
            >
              <Icon iconName={option.icon} style={{ fontSize: 18, color: option.color }} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>{option.value}</div>
                <div style={{
                  fontSize: 12,
                  color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                  marginTop: 2,
                }}>
                  {option.label}
                </div>
              </div>
              {currentRating === option.value && (
                <Icon iconName="CheckMark" style={{ fontSize: 14, color: option.color }} />
              )}
            </button>
          ))}
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
        background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : '#ffffff',
        color: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)',
        border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(160, 160, 160, 0.3)'}`,
        borderRadius: 10, // design exception — floating overlay
        padding: '12px 14px',
        minWidth: 260,
        maxWidth: 340,
        boxShadow: isDarkMode ? '0 12px 28px rgba(0, 0, 0, 0.5)' : '0 12px 28px rgba(15, 23, 42, 0.14)',
        zIndex: 20000,
        pointerEvents: 'none',
        opacity: 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {pipelineHover.iconName && renderPipelineIcon(pipelineHover.iconName, pipelineHover.color, 16)}
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2px' }}>
          {pipelineHover.title}
        </div>
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 4,
        background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
        fontSize: 11,
        fontWeight: 600,
        color: pipelineHover.color,
        marginBottom: pipelineHover.details?.length ? 10 : 0,
      }}>
        {pipelineHover.status}
      </div>

      {/* Detail rows */}
      {pipelineHover.details && pipelineHover.details.length > 0 && (
        <div style={{
          borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.15)' : 'rgba(160, 160, 160, 0.2)'}`,
          paddingTop: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {pipelineHover.details.map((detail, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                color: isDarkMode ? 'rgba(160, 160, 160, 0.7)' : 'rgba(107, 107, 107, 0.7)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                flexShrink: 0,
              }}>
                {detail.label}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 500,
                color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(30, 41, 59, 0.9)',
                textAlign: 'right',
                wordBreak: 'break-word',
              }}>
                {detail.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Subtitle */}
      {pipelineHover.subtitle && (
        <div style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(160, 160, 160, 0.15)'}`,
          fontSize: 10,
          color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(107, 107, 107, 0.6)',
          fontStyle: 'italic',
        }}>
          {pipelineHover.subtitle}
        </div>
      )}
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
