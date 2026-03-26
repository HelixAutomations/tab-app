/**
 * ActionsCell — renders the action buttons column in a prospect table row.
 *
 * Buttons: Phone, Email, Rate, Notes chevron, Edit, Delete.
 */

import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import type { Enquiry } from '../../../app/functionality/types';

export interface ActionsCellProps {
  item: Enquiry;
  isDarkMode: boolean;
  areActionsEnabled: boolean;
  mainShowClaimer: boolean;
  isMainTeamInboxPoc: boolean;
  hasNotes: boolean;
  hasInlineWorkbench: boolean;
  isNotesExpanded: boolean;
  noteKey: string;
  contactName: string;
  isHovered?: boolean;
  getRatingChipMeta: (ratingKey: string | undefined, darkMode: boolean) => {
    iconName: string;
    color: string;
    background: string;
    borderColor: string;
    hoverBackground: string;
    hoverColor: string;
    hoverBorderColor: string;
  };
  handleRate: (id: string) => void;
  handleDeleteEnquiry: (enquiryId: string, enquiryName: string) => void;
  handleShareEnquiry: (enquiry: Enquiry) => Promise<void>;
  setEditingEnquiry: (enquiry: Enquiry) => void;
  setShowEditModal: (show: boolean) => void;
  setExpandedNotesInTable: (updater: (prev: Set<string>) => Set<string>) => void;
}

const ActionsCell: React.FC<ActionsCellProps> = ({
  item,
  isDarkMode,
  areActionsEnabled,
  mainShowClaimer,
  isMainTeamInboxPoc,
  hasNotes,
  hasInlineWorkbench,
  isNotesExpanded,
  noteKey,
  contactName,
  isHovered = false,
  getRatingChipMeta,
  handleRate,
  handleDeleteEnquiry,
  handleShareEnquiry,
  setEditingEnquiry,
  setShowEditModal,
  setExpandedNotesInTable,
}) => {
  const actionBoxSize = 22;
  const phone = item.Phone_Number || (item as any).phone;
  const isDemoProspect = String(item.ID || (item as any).id || '').toUpperCase().startsWith('DEMO-ENQ-');
  const canShowShareAction = areActionsEnabled || isDemoProspect;
  const showQuickActions = areActionsEnabled && mainShowClaimer && !isMainTeamInboxPoc;
  const neutralBorder = isDarkMode ? 'rgba(75, 85, 99, 0.52)' : 'rgba(160, 160, 160, 0.24)';
  const neutralBackground = isDarkMode ? 'rgba(8, 28, 48, 0.42)' : 'rgba(244, 244, 246, 0.74)';
  const neutralBackgroundHover = isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(214, 232, 255, 0.88)';
  const neutralText = isDarkMode ? 'rgba(209, 213, 219, 0.82)' : colours.greyText;
  const neutralTextStrong = isDarkMode ? 'rgba(243, 244, 246, 0.94)' : colours.light.text;
  const interactiveAccent = isDarkMode ? colours.accent : colours.highlight;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
      {/* Call / Email / Rate — only in unlocked action mode */}
      {showQuickActions && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          opacity: isHovered ? 1 : 0,
          transform: isHovered ? 'translateX(0)' : 'translateX(6px)',
          transition: 'opacity 140ms ease, transform 160ms ease',
          pointerEvents: isHovered ? 'auto' : 'none',
        }}>
          {/* Phone */}
          <button
            type="button"
            disabled={!phone}
            onClick={(e) => {
              e.stopPropagation();
              if (phone) window.open(`tel:${phone}`, '_self');
            }}
            style={{
              width: actionBoxSize,
              height: actionBoxSize,
              minWidth: actionBoxSize,
              minHeight: actionBoxSize,
              flexShrink: 0,
              borderRadius: 0,
              border: `1px solid ${neutralBorder}`,
              background: neutralBackground,
              color: neutralText,
              opacity: phone ? 1 : 0.3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: phone ? 'pointer' : 'default',
              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (phone) {
                e.currentTarget.style.background = neutralBackgroundHover;
                e.currentTarget.style.borderColor = interactiveAccent;
                e.currentTarget.style.color = interactiveAccent;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = neutralBackground;
              e.currentTarget.style.borderColor = neutralBorder;
              e.currentTarget.style.color = neutralText;
            }}
            title={phone ? `Call ${phone}` : 'No phone number'}
          >
            <Icon iconName="Phone" styles={{ root: { fontSize: 11, color: 'currentColor' } }} />
          </button>

          {/* Email */}
          {item.Email && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`mailto:${item.Email}`, '_blank');
              }}
              style={{
                width: actionBoxSize,
                height: actionBoxSize,
                minWidth: actionBoxSize,
                minHeight: actionBoxSize,
                flexShrink: 0,
                borderRadius: 0,
                border: `1px solid ${neutralBorder}`,
                background: neutralBackground,
                color: neutralText,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = neutralBackgroundHover;
                e.currentTarget.style.borderColor = interactiveAccent;
                e.currentTarget.style.color = interactiveAccent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = neutralBackground;
                e.currentTarget.style.borderColor = neutralBorder;
                e.currentTarget.style.color = neutralText;
              }}
              title={`Email ${item.Email}`}
            >
              <Icon iconName="Mail" styles={{ root: { fontSize: 11, color: 'currentColor' } }} />
            </button>
          )}

          {/* Rate */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRate(item.ID);
            }}
            style={{
              width: actionBoxSize,
              height: actionBoxSize,
              minWidth: actionBoxSize,
              minHeight: actionBoxSize,
              flexShrink: 0,
              borderRadius: 0,
              border: `1px solid ${getRatingChipMeta(item.Rating, isDarkMode).borderColor}`,
              background: getRatingChipMeta(item.Rating, isDarkMode).background,
              color: getRatingChipMeta(item.Rating, isDarkMode).color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              const m = getRatingChipMeta(item.Rating, isDarkMode);
              e.currentTarget.style.background = m.hoverBackground;
              e.currentTarget.style.borderColor = m.hoverBorderColor;
              e.currentTarget.style.color = m.hoverColor;
            }}
            onMouseLeave={(e) => {
              const m = getRatingChipMeta(item.Rating, isDarkMode);
              e.currentTarget.style.background = m.background;
              e.currentTarget.style.borderColor = m.borderColor;
              e.currentTarget.style.color = m.color;
            }}
            title={item.Rating ? `Rating: ${item.Rating} - Click to change` : 'Rate this enquiry'}
          >
            <Icon iconName={getRatingChipMeta(item.Rating, isDarkMode).iconName} styles={{ root: { fontSize: 11 } }} />
          </button>
        </div>
      )}

      {/* Notes Chevron */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (!(hasNotes || hasInlineWorkbench)) return;
          setExpandedNotesInTable((prev) => {
            const next = new Set(prev);
            if (isNotesExpanded) next.delete(noteKey);
            else next.add(noteKey);
            return next;
          });
        }}
        style={{
          width: actionBoxSize,
          height: actionBoxSize,
          minWidth: actionBoxSize,
          minHeight: actionBoxSize,
          flexShrink: 0,
          borderRadius: 0,
          background: neutralBackground,
          border: `1px solid ${neutralBorder}`,
          color: (hasNotes || hasInlineWorkbench) ? neutralText : (isDarkMode ? 'rgba(160, 160, 160, 0.45)' : 'rgba(107, 107, 107, 0.45)'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: (hasNotes || hasInlineWorkbench) ? 'pointer' : 'default',
          transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease, opacity 0.16s ease',
          opacity: (hasNotes || hasInlineWorkbench) ? 1 : 0.4,
        }}
        onMouseEnter={(e) => {
          if (!(hasNotes || hasInlineWorkbench)) return;
          e.currentTarget.style.background = neutralBackgroundHover;
          e.currentTarget.style.borderColor = interactiveAccent;
          e.currentTarget.style.color = interactiveAccent;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = neutralBackground;
          e.currentTarget.style.borderColor = neutralBorder;
          e.currentTarget.style.color = (hasNotes || hasInlineWorkbench) ? neutralText : (isDarkMode ? 'rgba(160, 160, 160, 0.45)' : 'rgba(107, 107, 107, 0.45)');
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        title={
          !(hasNotes || hasInlineWorkbench)
            ? 'No notes'
            : isNotesExpanded
              ? 'Collapse'
              : (hasNotes && hasInlineWorkbench
                ? 'Show notes & workbench'
                : (hasNotes ? 'Show notes' : 'Show workbench'))
        }
      >
        <Icon iconName={isNotesExpanded ? 'ChevronUp' : 'ChevronDown'} styles={{ root: { fontSize: 10, color: 'currentColor' } }} />
      </div>

      {/* Share — available for demo rows even when lock is off */}
      {canShowShareAction && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            void handleShareEnquiry(item);
          }}
          style={{
            width: actionBoxSize,
            height: actionBoxSize,
            minWidth: actionBoxSize,
            minHeight: actionBoxSize,
            flexShrink: 0,
            borderRadius: 0,
            background: neutralBackground,
            border: `1px solid ${neutralBorder}`,
            color: neutralText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = neutralBackgroundHover;
            e.currentTarget.style.borderColor = interactiveAccent;
            e.currentTarget.style.color = interactiveAccent;
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = neutralBackground;
            e.currentTarget.style.borderColor = neutralBorder;
            e.currentTarget.style.color = neutralText;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          title="Share enquiry access"
        >
          <Icon
            iconName="PeopleAdd"
            styles={{ root: { fontSize: '10px', color: 'currentColor' } }}
          />
        </div>
      )}

      {/* Edit & Delete — guarded by areActionsEnabled */}
      {areActionsEnabled && (
        <>
          <div
            onClick={(e) => {
              e.stopPropagation();
              setEditingEnquiry(item);
              setShowEditModal(true);
            }}
            style={{
              width: actionBoxSize,
              height: actionBoxSize,
              minWidth: actionBoxSize,
              minHeight: actionBoxSize,
              flexShrink: 0,
              borderRadius: 0,
              background: neutralBackground,
              border: `1px solid ${neutralBorder}`,
              color: neutralText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = neutralBackgroundHover;
              e.currentTarget.style.borderColor = interactiveAccent;
              e.currentTarget.style.color = interactiveAccent;
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = neutralBackground;
              e.currentTarget.style.borderColor = neutralBorder;
              e.currentTarget.style.color = neutralText;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            title="Edit enquiry"
          >
            <Icon
              iconName="Edit"
              styles={{ root: { fontSize: '10px', color: 'currentColor' } }}
            />
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation();
              let passcode: string | null = null;
              try {
                passcode = window.prompt('Enter passcode to delete this enquiry:');
              } catch {
                alert('Passcode input is not supported in this client.');
                return;
              }
              if (passcode === '2011') {
                const enquiryName = `${item.First_Name || ''} ${item.Last_Name || ''}`.trim() || 'Unnamed enquiry';
                const confirmMessage = `Are you sure you want to permanently delete "${enquiryName}"?\n\nThis action cannot be undone.`;
                if (window.confirm(confirmMessage)) {
                  handleDeleteEnquiry(item.ID, enquiryName);
                }
              } else if (passcode !== null) {
                alert('Incorrect passcode');
              }
            }}
            style={{
              width: 22,
              height: 22,
              minWidth: 22,
              minHeight: 22,
              flexShrink: 0,
              borderRadius: 0,
              background: isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.08)',
              border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.12)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.08)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Delete enquiry (requires passcode)"
          >
            <Icon
              iconName="Delete"
              styles={{ root: { fontSize: '10px', color: '#D65541' } }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(ActionsCell);
