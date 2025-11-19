import React, { useState, useEffect, useRef } from 'react';
import { Text, Icon, TextField, DefaultButton, PrimaryButton } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Enquiry } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import EnquiryBadge from './EnquiryBadge';
import PitchBuilder from './PitchBuilder';
import TeamsLinkWidget from '../../components/TeamsLinkWidget';
import PitchScenarioBadge from '../../components/PitchScenarioBadge';
import { EnquiryEnrichmentData } from '../../app/functionality/enquiryEnrichment';

interface TeamDataRec {
  Email?: string;
  Initials?: string;
  'Full Name'?: string;
}

interface Props {
  enquiry: Enquiry & { __sourceType?: 'new' | 'legacy' };
  claimer?: TeamDataRec | undefined;
  onSelect: (enquiry: Enquiry, multi?: boolean) => void;
  onRate: (id: string) => void;
  onRatingChange?: (enquiryId: string, newRating: string) => Promise<void>; // Added: inline rating support
  onPitch?: (enquiry: Enquiry) => void;
  onEdit?: (enquiry: Enquiry) => void;
  // Allow async handlers
  onAreaChange?: (enquiryId: string, newArea: string) => void | Promise<void>;
  isLast?: boolean;
  isPrimarySelected?: boolean;
  selected?: boolean;
  onToggleSelect?: (enquiry: Enquiry) => void;
  userData?: any; // For pitch builder
  promotionStatus?: 'pitch' | 'instruction' | null;
  onFilterByPerson?: (initials: string) => void; // Added: filter by initials from chip
  // Enrichment data for Teams widget and pitch badge
  enrichmentData?: EnquiryEnrichmentData | null;
  enrichmentMap?: Map<string, EnquiryEnrichmentData>;
  enrichmentRequestsRef?: React.MutableRefObject<Set<string>>;
}

/**
 * ClaimedEnquiryCard
 * Card version of a claimed enquiry adopting the new clean design language.
 */
const ClaimedEnquiryCard: React.FC<Props> = ({
  enquiry,
  claimer,
  onSelect,
  onRate,
  onRatingChange,
  onPitch,
  onEdit,
  onAreaChange,
  isLast,
  selected = false,
  isPrimarySelected = false,
  onToggleSelect,
  userData,
  promotionStatus,
  onFilterByPerson,
  enrichmentData,
  enrichmentMap,
  enrichmentRequestsRef,
}) => {
  // Pitched button component with hover transition
  const PitchedButtonContent: React.FC<{ pitchCount: number; isDarkMode: boolean }> = ({ pitchCount, isDarkMode }) => {
    const [isHovered, setIsHovered] = useState(false);
    
    return (
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <Icon 
          iconName={isHovered ? 'Send' : 'CheckMark'} 
          styles={{ 
            root: { 
              fontSize: 12, 
              lineHeight: 1, 
              transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
              transform: isHovered ? 'scale(1)' : 'scale(1.1)'
            } 
          }} 
        />
        <span style={{ 
          transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          {isHovered ? 'Pitch' : 'Pitched'}
          {!isHovered && (
            <span
              style={{
                background: isDarkMode ? '#10b981' : '#059669',
                color: '#fff',
                borderRadius: '8px',
                padding: '1px 4px',
                fontSize: '8px',
                fontWeight: 700,
                minWidth: '14px',
                textAlign: 'center',
                transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                opacity: isHovered ? 0 : 1,
                transform: isHovered ? 'scale(0.8)' : 'scale(1)',
              }}
            >
              {pitchCount}
            </span>
          )}
        </span>
      </div>
    );
  };
  const { isDarkMode } = useTheme();
  const [showActions, setShowActions] = useState(false);
  const [clickedForActions, setClickedForActions] = useState(false);
  const [hasAnimatedActions, setHasAnimatedActions] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEnteringEdit, setIsEnteringEdit] = useState(false);
  const [isExitingEdit, setIsExitingEdit] = useState(false);
  const [editData, setEditData] = useState({
    First_Name: enquiry.First_Name || '',
    Last_Name: enquiry.Last_Name || '',
    Email: enquiry.Email || '',
    Value: enquiry.Value || '',
    Initial_first_call_notes: enquiry.Initial_first_call_notes || ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [showRatingMenu, setShowRatingMenu] = useState(false);
  const [isUpdatingRating, setIsUpdatingRating] = useState(false);
  const [localRating, setLocalRating] = useState(enquiry.Rating || '');
  const ratingMenuRef = useRef<HTMLDivElement>(null);

  // Sync local rating when enquiry rating changes
  useEffect(() => {
    setLocalRating(enquiry.Rating || '');
  }, [enquiry.Rating]);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [isPitchHovered, setIsPitchHovered] = useState(false);
  // Removed inline pitch builder modal usage; pitch now handled by parent detail view
  const clampRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const hasNotes = !!(enquiry.Initial_first_call_notes && enquiry.Initial_first_call_notes.trim());

  useEffect(() => {
    if (!expandedNotes && clampRef.current && hasNotes) {
      const el = clampRef.current;
      const overflowing = el.scrollHeight > el.clientHeight + 1;
      setIsOverflowing(overflowing);
    } else if (expandedNotes) {
      setIsOverflowing(false);
    }
  }, [expandedNotes, enquiry.Initial_first_call_notes, hasNotes]);

  const normalizeNotes = (raw: string): string => {
    let s = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  };

  // Check if current user can edit this enquiry (only owner can edit)
  const userEmail = userData?.[0]?.Email?.toLowerCase() || '';
  const enquiryOwner = (enquiry.Point_of_Contact || '').toLowerCase();
  const canEdit = onEdit && userEmail && enquiryOwner === userEmail;

  const handleEditClick = () => {
    setIsEnteringEdit(true);
    setIsExitingEdit(false);
    setExpandedNotes(true); // Always expand notes when editing
    
    // Smooth transition into edit mode
    setTimeout(() => {
      setIsEditing(true);
      setIsEnteringEdit(false);
    }, 150);
    
    // Reset edit data to current enquiry values
    setEditData({
      First_Name: enquiry.First_Name || '',
      Last_Name: enquiry.Last_Name || '',
      Email: enquiry.Email || '',
      Value: enquiry.Value || '',
      Initial_first_call_notes: enquiry.Initial_first_call_notes || ''
    });
  };

  const handleCancelEdit = () => {
    setIsExitingEdit(true);
    
    // Smooth transition out of edit mode
    setTimeout(() => {
      setIsEditing(false);
      setIsEnteringEdit(false);
      setIsExitingEdit(false);
    }, 150);
    
    setEditData({
      First_Name: enquiry.First_Name || '',
      Last_Name: enquiry.Last_Name || '',
      Email: enquiry.Email || '',
      Value: enquiry.Value || '',
      Initial_first_call_notes: enquiry.Initial_first_call_notes || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!onEdit) return;
    
    try {
      setIsSaving(true);
      
      // Prepare updates - only include changed fields
      const updates: any = {};
      if (editData.First_Name !== enquiry.First_Name) updates.First_Name = editData.First_Name.trim();
      if (editData.Last_Name !== enquiry.Last_Name) updates.Last_Name = editData.Last_Name.trim();
      if (editData.Email !== enquiry.Email) updates.Email = editData.Email.trim();
      if (editData.Value !== enquiry.Value) updates.Value = editData.Value.trim();
      if (editData.Initial_first_call_notes !== enquiry.Initial_first_call_notes) {
        updates.Initial_first_call_notes = editData.Initial_first_call_notes.trim();
      }

      if (Object.keys(updates).length === 0) {
        setIsEditing(false);
        return;
      }

      // Call the parent's onEdit handler which will handle the API call
      await onEdit({ ...enquiry, ...updates });
      
      // Smooth transition out of edit mode
      setIsExitingEdit(true);
      setTimeout(() => {
        setIsEditing(false);
        setIsEnteringEdit(false);
        setIsExitingEdit(false);
      }, 150);
      
    } catch (error) {
      console.error('Failed to save changes:', error);
      // Keep editing mode on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldChange = (field: keyof typeof editData, value: string) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleRatingChange = async (newRating: string) => {
    if (!onRatingChange || isUpdatingRating) return;
    
    const previousRating = localRating;
    setLocalRating(newRating); // Optimistic update
    setIsUpdatingRating(true);
    setShowRatingMenu(false);
    try {
      await onRatingChange(enquiry.ID, newRating);
      // Success feedback is handled by parent toast
    } catch (error) {
      console.error('Failed to update rating:', error);
      setLocalRating(previousRating); // Revert on error
    } finally {
      setIsUpdatingRating(false);
    }
  };

  const areaColor = (() => {
    const area = enquiry.Area_of_Work?.toLowerCase() || '';
    if (area.includes('commercial')) return colours.blue;
    if (area.includes('construction')) return colours.orange;
    if (area.includes('property')) return colours.green;
    if (area.includes('employment')) return colours.yellow;
    if (area.includes('claim')) return colours.accent;
    if (area.includes('other') || area.includes('unsure')) return colours.greyText;
    return colours.greyText; // Default to grey for unmatched areas
  })();

  const isCardClickable = hasNotes && (isOverflowing || !expandedNotes) && !isEditing && !isEnteringEdit && !isExitingEdit;
  
  // Enhanced styling to match instruction cards - code-like dark mode with clean design
  const bgGradientLight = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
  
  const selectedBg = isDarkMode 
    ? `#1e293b` // Solid dark blue-grey for code-like feel
    : `linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)`;
  
  const selectedBorder = isDarkMode
    ? `1px solid ${areaColor}`
    : `1px solid ${areaColor}`;
    
  const selectedShadow = isDarkMode
    ? `0 1px 3px rgba(0,0,0,0.8)` // Minimal shadow in dark mode
    : `0 8px 32px ${areaColor}25, 0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)`;
  
  const card = mergeStyles({
    position: 'relative',
    margin: '6px 0',
    borderRadius: 10,
    padding: '12px',
    background: selected 
      ? selectedBg
      : (isDarkMode 
          ? 'rgba(15, 23, 42, 0.85)' // Semi-transparent dark to match page background
          : 'rgba(255, 255, 255, 0.92)'), // Semi-transparent light
    backdropFilter: 'blur(12px)', // Blur effect matching page background
    WebkitBackdopFilter: 'blur(12px)', // Safari support
    opacity: 1, // Removed fade - will use badge instead
    // Responsive padding
    '@media (max-width: 768px)': {
      padding: '10px 12px',
    },
    '@media (max-width: 480px)': {
      padding: '8px 12px',
      borderRadius: 8,
    },
    border: selected || clickedForActions 
      ? selectedBorder
      : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)'}`,
    borderLeft: `3px solid ${selected ? areaColor : (isDarkMode ? areaColor : `${areaColor}80`)}`, // Slightly thicker accent
    boxShadow: selected
      ? selectedShadow
      : (isDarkMode 
          ? '0 2px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)' // Subtle shadow in dark mode
          : '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)'), // Softer shadow in light
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: 'Raleway, sans-serif',
    cursor: isCardClickable ? 'pointer' : 'default',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    marginBottom: 4,
    overflow: 'hidden',
    transform: selected ? 'translateY(-2px)' : 'translateY(0)',
    selectors: {
      ':hover': isCardClickable ? {
        transform: selected ? 'translateY(-3px)' : 'translateY(-1px)', 
        boxShadow: selected 
          ? (isDarkMode 
              ? `0 4px 16px rgba(0,0,0,0.5), 0 2px 8px ${areaColor}40` 
              : `0 12px 32px ${areaColor}30, 0 6px 16px rgba(0,0,0,0.12)`)
          : (isDarkMode 
              ? `0 4px 12px rgba(0,0,0,0.4), 0 2px 6px ${areaColor}20` 
              : '0 8px 20px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)'),
        border: `1px solid ${areaColor}60`, // Subtle area color border on hover
        borderLeft: `3px solid ${areaColor}`, // Maintain left accent
        background: isDarkMode 
          ? 'rgba(15, 23, 42, 0.95)' // Slightly more opaque on hover
          : 'rgba(255, 255, 255, 0.98)',
      } : { 
        borderColor: selected || clickedForActions ? areaColor : areaColor
      },
      ':active': isCardClickable ? { transform: selected ? 'translateY(-1px)' : 'translateY(0)' } : {},
      ':focus-within': { 
        outline: `2px solid ${areaColor}40`,
        outlineOffset: '2px',
        borderColor: areaColor 
      },
    },
  });

  const actionButtons = [
    { key: 'pitch', icon: 'Send', label: 'Pitch', onClick: () => { onPitch ? onPitch(enquiry) : onSelect(enquiry); } },
    { key: 'call', icon: 'Phone', label: 'Call', onClick: () => enquiry.Phone_Number && (window.location.href = `tel:${enquiry.Phone_Number}`) },
    { key: 'email', icon: 'Mail', label: 'Email', onClick: () => enquiry.Email && (window.location.href = `mailto:${enquiry.Email}?subject=Your%20Enquiry`) },
    { key: 'rate', icon: 'FavoriteStar', label: 'Rate', onClick: () => {
      if (onRatingChange) {
        setShowRatingMenu(true);
      } else {
        onRate(enquiry.ID);
      }
    }},
    ...(canEdit && !isEditing ? [{ key: 'edit', icon: 'Edit', label: 'Edit', onClick: handleEditClick }] : []),
  ];

  return (
    <div
      className={card}
      role="article"
      tabIndex={0}
      aria-label="Claimed enquiry"
      aria-pressed={selected}
      onMouseEnter={() => {
        if (!hasAnimatedActions) {
          setShowActions(true); setHasAnimatedActions(true);
        } else setShowActions(true);
      }}
      onMouseLeave={() => { if (!selected && !clickedForActions) setShowActions(false); }}
      onClick={(e) => {
        // Toggle clicked state for actions visibility
        setClickedForActions(!clickedForActions);
        setShowActions(!clickedForActions);
        
        if (isCardClickable) {
          // Expand notes if truncated; if already expanded do nothing further
          if (!expandedNotes) {
            setExpandedNotes(true);
          }
        }
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && isCardClickable) {
          e.preventDefault();
          if (!expandedNotes) setExpandedNotes(true);
        }
      }}
    >
      {/* Selection Toggle (checkbox style) */}
      {onToggleSelect && (
        <button
          aria-label={selected ? 'Deselect enquiry' : 'Select enquiry'}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(enquiry); }}
          style={{ position: 'absolute', top: 10, left: 10, width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${selected ? colours.blue : (isDarkMode ? 'rgba(255,255,255,0.25)' : '#c3c9d4')}`, background: selected ? colours.blue : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          {selected && <Icon iconName="CheckMark" styles={{ root: { fontSize: 12, color: '#fff' } }} />}
        </button>
      )}

      {/* Left accent bar */}
      <span style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2, background: areaColor, opacity: .95, pointerEvents: 'none' }} />

      {/* Area badge - redesigned for cleaner integration */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        width: 'fit-content'
      }}>
        <EnquiryBadge 
          enquiry={enquiry}
          onAreaChange={onAreaChange ? (enquiryId, newArea) => onAreaChange(enquiryId, newArea) : undefined}
        />
      </div>

      {/* Fee earner badge with integrated Teams functionality - bottom right */}
      {(() => {
        // Always render a badge. If claimer is missing, derive initials from POC email.
        const pocEmail = (enquiry.Point_of_Contact || '').toString();
        const derivedFromEmail = pocEmail.includes('@')
          ? pocEmail.split('@')[0].slice(0, 2).toUpperCase()
          : '';
        const nameInitials = (claimer?.['Full Name'] || '')
          .split(' ')
          .filter(Boolean)
          .map(n => n[0])
          .join('')
          .toUpperCase();
        const emailInitials = (claimer?.Email || '')
          .split('@')[0]
          ?.slice(0, 2)
          .toUpperCase();
        const displayInitials = (claimer?.Initials || nameInitials || emailInitials || derivedFromEmail || '??');
        const title = claimer?.['Full Name'] || claimer?.Email || pocEmail || 'Person';
        const canFilter = Boolean(displayInitials && onFilterByPerson);

        // Teams integration
        const isV2Enquiry = enquiry.__sourceType === 'new' || (enquiry as any).source === 'instructions';
        const hasTeamsData = isV2Enquiry && enrichmentData?.teamsData;
        const isTeamsLoading = isV2Enquiry && enrichmentData && enrichmentRequestsRef ? enrichmentRequestsRef.current.has(String(enquiry.ID)) : false;
        const teamsLink = hasTeamsData ? (hasTeamsData as any).teamsLink : null;
        
        // Get timestamps for timeline workflow
        const teamsTime = hasTeamsData ? (hasTeamsData as any).CreatedAt : null; // When Teams conversation started (from TeamsBotActivityTracking)
        const claimTime = isV2Enquiry ? (enquiry as any).claim : null; // When POC claimed it (only for V2)
        const pitchTime = enrichmentData?.pitchData ? (enrichmentData.pitchData as any).pitchedDate : null; // When pitch sent
        
        // Only show timestamps/durations if they're valid (not 00:00:00)
        const isValidTimestamp = (dateStr: string | null) => {
          if (!dateStr) return false;
          const date = new Date(dateStr);
          // Check if time is not midnight (00:00:00) which indicates missing data
          return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
        };
        
        const hasValidClaimTime = claimTime && isValidTimestamp(claimTime);
        const hasValidPitchTime = pitchTime && isValidTimestamp(pitchTime);
        
        // Format date/time for display
        const formatDateTime = (dateStr: string | null) => {
          if (!dateStr) return null;
          const date = new Date(dateStr);
          return date.toLocaleString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        };
        
        // Calculate duration between two timestamps with two-unit precision
        const calculateDuration = (fromDate: string | null, toDate: string | null) => {
          if (!fromDate || !toDate) return null;
          const from = new Date(fromDate);
          const to = new Date(toDate);
          let diff = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000)); // seconds
          
          const S = diff % 60; diff = Math.floor(diff / 60);
          const M = diff % 60; diff = Math.floor(diff / 60);
          const H = diff % 24; diff = Math.floor(diff / 24);
          const D = diff % 7; diff = Math.floor(diff / 7);
          const W = diff % 4; diff = Math.floor(diff / 4);
          const Mo = diff % 12; diff = Math.floor(diff / 12);
          const Y = diff;
          
          const totalMonths = Y * 12 + Mo;
          const parts: string[] = [];
          
          // Year/Month scale: y m
          if (totalMonths > 0) {
            parts.push(totalMonths + 'm');
            if (W > 0) parts.push(W + 'w');
          }
          // Week scale: w d
          else if (W > 0) {
            parts.push(W + 'w');
            if (D > 0) parts.push(D + 'd');
          }
          // Day scale: d h
          else if (D > 0) {
            parts.push(D + 'd');
            if (H > 0) parts.push(H + 'h');
          }
          // Hour scale: h m
          else if (H > 0) {
            parts.push(H + 'h');
            if (M > 0) parts.push(M + 'm');
          }
          // Minute scale: m s
          else if (M > 0) {
            parts.push(M + 'm');
            if (S > 0) parts.push(S + 's');
          }
          // Seconds only
          else if (S > 0) {
            parts.push(S + 's');
          }
          
          if (parts.length === 0) parts.push('0s');
          
          return parts.slice(0, 2).join(' ');
        };
        
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ 
              position: 'absolute', 
              bottom: 12, 
              right: 12, 
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {/* 1. Teams badge - conversation start */}
            {hasTeamsData && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      title={`Teams conversation • ${teamsTime ? new Date(teamsTime).toLocaleString('en-GB') : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (teamsLink) {
                          window.open(teamsLink, '_blank');
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`,
                        fontSize: 11,
                        fontWeight: 600,
                        color: isDarkMode ? 'rgba(96, 165, 250, 0.9)' : 'rgba(37, 99, 235, 0.9)',
                        letterSpacing: 0.3,
                        textTransform: 'uppercase' as const,
                        whiteSpace: 'nowrap' as const,
                        cursor: 'pointer',
                        opacity: 1,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = isDarkMode 
                          ? 'rgba(54, 144, 206, 0.22)' 
                          : 'rgba(54, 144, 206, 0.18)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = isDarkMode 
                          ? 'rgba(54, 144, 206, 0.15)' 
                          : 'rgba(54, 144, 206, 0.12)';
                      }}
                    >
                      <Icon
                        iconName="TeamsLogo"
                        styles={{ 
                          root: { 
                            fontSize: 13, 
                            color: isDarkMode ? 'rgba(96, 165, 250, 0.9)' : 'rgba(37, 99, 235, 0.9)'
                          } 
                        }}
                      />
                      
                      {isTeamsLoading ? (
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
                            borderTop: `1px solid ${isDarkMode ? '#60a5fa' : '#3b82f6'}`,
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                          }}
                        />
                      ) : teamsTime && (
                        <span style={{
                          fontSize: 8,
                          color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                          fontFamily: 'Consolas, Monaco, monospace',
                          letterSpacing: 0.3,
                          fontWeight: 500
                        }}>
                          {formatDateTime(teamsTime)}
                        </span>
                      )}
                    </button>
                    
                    {!isTeamsLoading && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -2,
                          right: -2,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isDarkMode ? '#10b981' : '#059669',
                          border: `2px solid ${isDarkMode ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.92)'}`,
                          boxShadow: isDarkMode 
                            ? '0 0 0 1px rgba(96, 165, 250, 0.3)' 
                            : '0 0 0 1px rgba(59, 130, 246, 0.3)',
                          animation: 'pulse 2s infinite',
                        }}
                      />
                    )}
                  </div>
                </div>
                
                {/* Connecting line with duration - only show if we have valid claim time */}
                {hasValidClaimTime && (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1
                  }}>
                    <div style={{
                      width: 16,
                      height: 1,
                      background: isDarkMode 
                        ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' 
                        : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))'
                    }} />
                    {teamsTime && (
                      <span style={{
                        fontSize: 7,
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                        fontFamily: 'Consolas, Monaco, monospace',
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                      }}>
                        {calculateDuration(teamsTime, claimTime)}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
            
            {/* 2. POC badge - when claimed */}
            <button
              title={`Claimed by ${title}${claimTime ? ' • ' + new Date(claimTime).toLocaleString('en-GB') : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (canFilter) {
                  onFilterByPerson!(displayInitials);
                }
              }}
              disabled={!canFilter}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                fontSize: 11,
                fontWeight: 600,
                color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)',
                letterSpacing: 0.3,
                textTransform: 'uppercase' as const,
                whiteSpace: 'nowrap' as const,
                cursor: canFilter ? 'pointer' : 'default',
                opacity: canFilter ? 1 : 0.7,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (canFilter) {
                  (e.currentTarget as HTMLButtonElement).style.background = isDarkMode 
                    ? 'rgba(148, 163, 184, 0.22)' 
                    : 'rgba(148, 163, 184, 0.18)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = isDarkMode 
                  ? 'rgba(148, 163, 184, 0.15)' 
                  : 'rgba(148, 163, 184, 0.12)';
              }}
            >
              <Icon
                iconName="Contact"
                styles={{ 
                  root: { 
                    fontSize: 11, 
                    color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)'
                  } 
                }}
              />
              <span>{displayInitials}</span>
            </button>
            
            {/* Connecting line to pitch with duration - only show if we have valid claim and pitch times */}
            {enrichmentData?.pitchData && hasValidClaimTime && hasValidPitchTime && (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1
              }}>
                <div style={{
                  width: 16,
                  height: 1,
                  background: isDarkMode 
                    ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' 
                    : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))'
                }} />
                <span style={{
                  fontSize: 7,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}>
                  {calculateDuration(claimTime, pitchTime)}
                </span>
              </div>
            )}
            
            {/* 3. Pitch scenario badge - only show if pitch has valid timestamp */}
            {enrichmentData?.pitchData && hasValidPitchTime && (
              <PitchScenarioBadge 
                scenarioId={enrichmentData.pitchData.scenarioId}
                size="medium"
              />
            )}
          </div>
        );
      })()}

      {/* Name + ID inline */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 10, 
        marginTop: 8, 
        paddingLeft: onToggleSelect ? 26 : 0,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isExitingEdit ? 0.7 : 1,
        transform: isEnteringEdit ? 'translateY(-2px)' : 'translateY(0)'
      }}>
        {(isEditing && !isExitingEdit) ? (
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            flex: 1,
            opacity: isEnteringEdit ? 0 : 1,
            transform: isEnteringEdit ? 'translateY(4px)' : 'translateY(0)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.15s'
          }}>
            <TextField
              value={editData.First_Name}
              onChange={(_, value) => handleFieldChange('First_Name', value || '')}
              placeholder="First name"
              disabled={isSaving}
              styles={{
                root: { 
                  flex: 1,
                  transition: 'all 0.2s ease-in-out'
                },
                fieldGroup: {
                  border: 'none',
                  background: 'transparent',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: 0,
                  height: 'auto',
                  minHeight: 'auto',
                  borderRadius: 6,
                  transition: 'all 0.2s ease-in-out'
                },
                field: {
                  padding: '8px 12px',
                  color: isDarkMode ? '#fff' : '#0d2538',
                  fontSize: 14,
                  fontWeight: 600,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                  borderRadius: 6,
                  background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease-in-out',
                  selectors: {
                    ':focus': {
                      borderColor: colours.blue,
                      boxShadow: `0 0 0 2px ${colours.blue}20`,
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    },
                    ':hover': {
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    }
                  }
                }
              }}
            />
            <TextField
              value={editData.Last_Name}
              onChange={(_, value) => handleFieldChange('Last_Name', value || '')}
              placeholder="Last name"
              disabled={isSaving}
              styles={{
                root: { 
                  flex: 1,
                  transition: 'all 0.2s ease-in-out'
                },
                fieldGroup: {
                  border: 'none',
                  background: 'transparent',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: 0,
                  height: 'auto',
                  minHeight: 'auto',
                  borderRadius: 6,
                  transition: 'all 0.2s ease-in-out'
                },
                field: {
                  padding: '8px 12px',
                  color: isDarkMode ? '#fff' : '#0d2538',
                  fontSize: 14,
                  fontWeight: 600,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                  borderRadius: 6,
                  background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease-in-out',
                  selectors: {
                    ':focus': {
                      borderColor: colours.blue,
                      boxShadow: `0 0 0 2px ${colours.blue}20`,
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    },
                    ':hover': {
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    }
                  }
                }
              }}
            />
          </div>
        ) : (
          <Text variant="medium" styles={{ 
            root: { 
              fontWeight: 600, 
              color: isDarkMode ? '#fff' : '#0d2538', 
              lineHeight: 1.2,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: isEnteringEdit ? 0.7 : 1
            } 
          }}>
            {(enquiry.First_Name || '') + ' ' + (enquiry.Last_Name || '')}
          </Text>
        )}
        {enquiry.ID && (
          <span style={{ 
            fontSize: 11, 
            color: isDarkMode ? 'rgba(255,255,255,0.45)' : '#b0b8c9', 
            fontWeight: 500, 
            letterSpacing: 0.5, 
            userSelect: 'all', 
            fontFamily: 'Consolas, Monaco, monospace', 
            padding: '1px 6px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: isEnteringEdit ? 0.7 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <svg width="11" height="11" viewBox="0 0 66.45 100" style={{ fill: 'currentcolor', opacity: 0.7 }}>
              <path d="m.33,100c0-3.95-.23-7.57.13-11.14.12-1.21,1.53-2.55,2.68-3.37,6.52-4.62,13.15-9.1,19.73-13.64,10.22-7.05,20.43-14.12,30.64-21.18.21-.14.39-.32.69-.57-5.82-4.03-11.55-8-17.27-11.98C25.76,30.37,14.64,22.57,3.44,14.88.97,13.19-.08,11.07.02,8.16.1,5.57.04,2.97.04,0c.72.41,1.16.62,1.56.9,10.33,7.17,20.66,14.35,30.99,21.52,9.89,6.87,19.75,13.79,29.68,20.59,3.26,2.23,4.78,5.03,3.97,8.97-.42,2.05-1.54,3.59-3.24,4.77-8.94,6.18-17.88,12.36-26.82,18.55-10.91,7.55-21.82,15.1-32.73,22.65-.98.68-2,1.32-3.12,2.05Z"/>
              <path d="m36.11,48.93c-2.74,1.6-5.04,3.21-7.56,4.35-2.25,1.03-4.37-.1-6.27-1.4-5.1-3.49-10.17-7.01-15.25-10.53-2.01-1.39-4.05-2.76-5.99-4.25-.5-.38-.91-1.17-.96-1.8-.13-1.59-.06-3.19-.03-4.79.02-1.32.25-2.57,1.57-3.27,1.4-.74,2.72-.36,3.91.46,3.44,2.33,6.85,4.7,10.26,7.06,6.22,4.3,12.43,8.6,18.65,12.91.39.27.76.57,1.67,1.25Z"/>
            </svg>
            {enquiry.ID}
          </span>
        )}
      </div>

      {/* Value & Company */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 12, 
        fontSize: 11, 
        color: isDarkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)', 
        fontWeight: 500, 
        marginTop: 6, 
        marginLeft: onToggleSelect ? 26 : 0,
        paddingLeft: 2,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isExitingEdit ? 0.7 : 1,
        transform: isEnteringEdit ? 'translateY(-2px)' : 'translateY(0)'
      }}>
        {(isEditing && !isExitingEdit) ? (
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            flex: 1, 
            flexWrap: 'wrap',
            opacity: isEnteringEdit ? 0 : 1,
            transform: isEnteringEdit ? 'translateY(4px)' : 'translateY(0)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0.2s'
          }}>
            <TextField
              value={editData.Value}
              onChange={(_, value) => handleFieldChange('Value', value || '')}
              placeholder="Value (e.g. £10,000)"
              disabled={isSaving}
              styles={{
                root: { 
                  minWidth: 120,
                  transition: 'all 0.2s ease-in-out'
                },
                fieldGroup: {
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  height: 'auto',
                  minHeight: 'auto',
                  borderRadius: 6
                },
                field: {
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                  borderRadius: 6,
                  background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                  color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                  transition: 'all 0.2s ease-in-out',
                  selectors: {
                    ':focus': {
                      borderColor: colours.blue,
                      boxShadow: `0 0 0 2px ${colours.blue}20`,
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    },
                    ':hover': {
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    }
                  }
                }
              }}
            />
            <TextField
              value={editData.Email}
              onChange={(_, value) => handleFieldChange('Email', value || '')}
              placeholder="Email address"
              disabled={isSaving}
              type="email"
              styles={{
                root: { 
                  minWidth: 180,
                  flex: 1,
                  transition: 'all 0.2s ease-in-out'
                },
                fieldGroup: {
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  height: 'auto',
                  minHeight: 'auto',
                  borderRadius: 6
                },
                field: {
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 500,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                  borderRadius: 6,
                  background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                  color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                  transition: 'all 0.2s ease-in-out',
                  selectors: {
                    ':focus': {
                      borderColor: colours.blue,
                      boxShadow: `0 0 0 2px ${colours.blue}20`,
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    },
                    ':hover': {
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    }
                  }
                }
              }}
            />
          </div>
        ) : (
          <>
            {enquiry.Value && <span style={{ fontWeight: 600, transition: 'all 0.3s ease' }}>{enquiry.Value}</span>}
            {enquiry.Company && <span style={{ transition: 'all 0.3s ease' }}>{enquiry.Company}</span>}
            {enquiry.Email && (
              <span 
                style={{ 
                  cursor: 'pointer', 
                  transition: 'all 0.2s ease',
                  fontSize: '11px',
                  color: copiedEmail 
                    ? (isDarkMode ? '#4ade80' : '#16a34a')
                    : (isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'),
                  fontFamily: 'Consolas, Monaco, monospace',
                  padding: '3px 0',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }} 
                onClick={e => { 
                  e.stopPropagation(); 
                  navigator?.clipboard?.writeText(enquiry.Email);
                  setCopiedEmail(true);
                  setTimeout(() => setCopiedEmail(false), 1200);
                }}
                onMouseEnter={e => {
                  if (!copiedEmail) {
                    e.currentTarget.style.color = isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
                    e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
                  }
                }}
                onMouseLeave={e => {
                  if (!copiedEmail) {
                    e.currentTarget.style.color = isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                title={copiedEmail ? 'Copied!' : 'Click to copy email'}
              >
                <Icon iconName="Mail" styles={{ root: { fontSize: 10 } }} />
                {enquiry.Email}
              </span>
            )}
          </>
        )}
        {enquiry.Phone_Number && (
          <span 
            style={{ 
              cursor: 'pointer', 
              transition: 'all 0.2s ease',
              fontSize: '11px',
              color: copiedPhone
                ? (isDarkMode ? '#4ade80' : '#16a34a')
                : (isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'),
              fontFamily: 'Consolas, Monaco, monospace',
              padding: '3px 0',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }} 
            onClick={e => { 
              e.stopPropagation(); 
              navigator?.clipboard?.writeText(enquiry.Phone_Number!);
              setCopiedPhone(true);
              setTimeout(() => setCopiedPhone(false), 1200);
            }}
            onMouseEnter={e => {
              if (!copiedPhone) {
                e.currentTarget.style.color = isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
                e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
              }
            }}
            onMouseLeave={e => {
              if (!copiedPhone) {
                e.currentTarget.style.color = isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
            title={copiedPhone ? 'Copied!' : 'Click to copy phone'}
          >
            <Icon iconName="Phone" styles={{ root: { fontSize: 10 } }} />
            {enquiry.Phone_Number}
          </span>
        )}
      </div>

      {/* Notes clamp */}
      {(hasNotes || isEditing) && (
        <div style={{ 
          marginTop: 6, 
          marginBottom: 4, 
          paddingLeft: onToggleSelect ? 26 : 0,
          transition: 'all 0.3s ease',
          opacity: isExitingEdit ? 0.7 : 1
        }}>
          {(isEditing && !isExitingEdit) ? (
            <div style={{
              opacity: isEnteringEdit ? 0 : 1,
              transition: 'opacity 0.4s ease 0.2s'
            }}>
              <TextField
                value={editData.Initial_first_call_notes}
                onChange={(_, value) => handleFieldChange('Initial_first_call_notes', value || '')}
                placeholder="Initial call notes..."
                disabled={isSaving}
                multiline
                rows={4}
                autoAdjustHeight
                styles={{
                  root: { 
                    width: '100%',
                    transition: 'all 0.2s ease-in-out'
                  },
                  fieldGroup: {
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                    borderRadius: 8,
                    background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                    padding: 8,
                    transition: 'all 0.2s ease-in-out',
                    selectors: {
                      ':focus-within': {
                        borderColor: colours.blue,
                        boxShadow: `0 0 0 2px ${colours.blue}20`,
                        background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                      },
                      ':hover': {
                        borderColor: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                        background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                      }
                    }
                  },
                  field: {
                    fontSize: 11,
                    lineHeight: '1.5',
                    color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    minHeight: 60,
                    resize: 'vertical' as const,
                    fontFamily: 'inherit',
                    transition: 'all 0.2s ease-in-out'
                  }
                }}
              />
            </div>
          ) : expandedNotes ? (
            <div 
              ref={clampRef} 
              style={{ 
                fontSize: 11, 
                lineHeight: '1.5', 
                color: isDarkMode ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)',
                whiteSpace: 'pre-wrap', // Preserves line breaks and wrapping
                wordWrap: 'break-word', // Prevents long words from overflowing
                fontFamily: 'inherit',
                transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
                maxHeight: '500px',
                opacity: 1
              }}
            >
              {normalizeNotes(enquiry.Initial_first_call_notes || '')}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div 
                ref={clampRef} 
                style={{ 
                  display: '-webkit-box', 
                  WebkitLineClamp: 3, 
                  WebkitBoxOrient: 'vertical', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'pre-wrap', // Preserves line breaks
                  wordWrap: 'break-word', // Prevents overflow
                  maxHeight: 57, 
                  fontSize: 11, 
                  lineHeight: '1.5', 
                  color: isDarkMode ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)',
                  fontFamily: 'inherit',
                  transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
                  opacity: 1
                }}
              >
                {normalizeNotes(enquiry.Initial_first_call_notes || '')}
              </div>
              {isOverflowing && (
                <div style={{ 
                  position: 'absolute', 
                  bottom: 0, 
                  left: 0, 
                  right: 0, 
                  height: 18, 
                  background: isDarkMode 
                    ? 'linear-gradient(to bottom, rgba(15,23,42,0), rgba(15,23,42,0.85))' 
                    : 'linear-gradient(to bottom, rgba(249,249,249,0), rgba(249,249,249,0.95))', 
                  pointerEvents: 'none',
                  transition: 'opacity 0.3s ease'
                }} />
              )}
            </div>
          )}
          {(isOverflowing || (expandedNotes && isOverflowing)) && !isEditing && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpandedNotes(v => !v); }}
              aria-expanded={expandedNotes}
              aria-label={expandedNotes ? 'Collapse notes' : 'Expand notes'}
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                cursor: 'pointer', 
                color: '#7a869a', 
                fontSize: 15, 
                marginLeft: 2, 
                marginTop: 4, 
                background: 'transparent', 
                border: 'none', 
                padding: 4,
                borderRadius: 4,
                transition: 'all 0.2s ease-in-out'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colours.blue;
                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#7a869a';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon iconName="ChevronDown" styles={{ 
                root: { 
                  transition: 'all 0.3s ease', 
                  transform: expandedNotes ? 'rotate(-180deg)' : 'rotate(0deg)', 
                  fontSize: 15, 
                  color: 'inherit'
                } 
              }} />
            </button>
          )}
        </div>
      )}

      {/* Action buttons (cascade) */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        marginTop: 6, 
        transition: 'all 0.3s cubic-bezier(.4,0,.2,1)', 
        paddingTop: 8, 
        paddingBottom: 8, 
        opacity: isExitingEdit ? 0.7 : 1,
        transform: isEnteringEdit ? 'translateY(-2px)' : 'translateY(0)'
      }}>
        
        {(isEditing && !isExitingEdit) ? (
          /* Edit mode buttons */
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            justifyContent: 'flex-end', 
            paddingTop: 8,
            opacity: isEnteringEdit ? 0 : 1,
            transform: isEnteringEdit ? 'translateY(6px) scale(0.95)' : 'translateY(0) scale(1)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.3s'
          }}>
            <DefaultButton
              text="Cancel"
              onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
              disabled={isSaving}
              styles={{
                root: {
                  minWidth: 60,
                  height: 28,
                  fontSize: 11,
                  borderRadius: 4,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                  background: 'transparent',
                  color: isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'
                }
              }}
            />
            <PrimaryButton
              text={isSaving ? 'Saving...' : 'Save'}
              onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
              disabled={isSaving}
              styles={{
                root: {
                  minWidth: 60,
                  height: 28,
                  fontSize: 11,
                  borderRadius: 4,
                  background: colours.blue,
                  border: 'none'
                }
              }}
            />
          </div>
        ) : (
          /* Regular action buttons - unified badge-style design */
          <div style={{ 
            display: 'flex', 
            gap: 6, 
            flexWrap: 'wrap',
            opacity: isEnteringEdit ? 0.7 : 1,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            {/* Show pitched/instructed badge in action area if present */}
            {promotionStatus && (
              <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (onPitch) {
                    onPitch(enquiry);
                  } else {
                    onSelect(enquiry);
                  }
                }}
                className={mergeStyles({
                  background: promotionStatus === 'instruction' 
                    ? (isDarkMode ? 'rgba(76, 175, 80, 0.25)' : 'rgba(76, 175, 80, 0.15)') 
                    : colours.highlight,
                  color: promotionStatus === 'instruction' 
                    ? (isDarkMode ? '#4ade80' : '#16a34a') 
                    : '#fff',
                  border: `1px solid ${promotionStatus === 'instruction'
                    ? (isDarkMode ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.25)')
                    : (isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)')}`,
                  backdropFilter: 'blur(8px)',
                  padding: '6px 12px',
                  borderRadius: 16,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: 30,
                  opacity: 0.8,
                  transform: 'translateY(0) scale(1)',
                  transition: 'all .25s cubic-bezier(.4,0,.2,1)',
                  boxShadow: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  lineHeight: 1,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.8px',
                  selectors: {
                    ':hover': { 
                      background: promotionStatus === 'instruction' 
                        ? (isDarkMode ? 'rgba(76, 175, 80, 0.35)' : 'rgba(76, 175, 80, 0.25)')
                        : colours.blue,
                      borderRadius: 14,
                      borderColor: promotionStatus === 'instruction'
                        ? (isDarkMode ? 'rgba(76, 175, 80, 0.5)' : 'rgba(76, 175, 80, 0.4)')
                        : colours.blue,
                      transform: 'translateY(-1px) scale(1.02)',
                      opacity: 1,
                      boxShadow: promotionStatus === 'instruction'
                        ? (isDarkMode ? '0 3px 12px rgba(76, 175, 80, 0.25)' : '0 2px 10px rgba(76, 175, 80, 0.2)')
                        : '0 3px 12px rgba(54, 144, 206, 0.25)'
                    },
                    ':active': { 
                      borderRadius: 14, 
                      transform: 'scale(0.97)' 
                    },
                  },
                })}
              >
                <Icon iconName={promotionStatus === 'instruction' ? 'CompletedSolid' : 'Send'} styles={{ root: { fontSize: 12, lineHeight: 1 } }} />
                {promotionStatus === 'instruction' ? 'Instructed' : 'Pitched'}
              </button>
            )}
            {actionButtons.filter(btn => btn.key !== 'pitch' || !promotionStatus).map((btn, idx) => {
              const delay = (showActions || selected || clickedForActions) ? (!hasAnimatedActions ? 120 + idx * 70 : idx * 70) : (actionButtons.length - 1 - idx) * 65;
              const isRate = btn.key === 'rate';
              const isPitch = btn.key === 'pitch';
              const isEdit = btn.key === 'edit';
              const hasNoRating = isRate && !localRating;
              const ratingColor = localRating 
                ? (localRating === 'Good' ? colours.blue : localRating === 'Neutral' ? colours.grey : colours.cta)
                : 'rgba(54, 144, 206, 0.75)';
              
              // Check if this enquiry has pitch data
              const hasPitchData = isPitch && enrichmentData?.pitchData;
              const pitchCount = hasPitchData ? 1 : 0; // Could be enhanced to count multiple pitches
              
              return (
                <button
                  key={btn.key}
                  onClick={(e) => { e.stopPropagation(); btn.onClick(); }}
                  className={mergeStyles({
                    background: isPitch 
                      ? (hasPitchData 
                          ? 'transparent'
                          : colours.highlight)
                      : (localRating && isRate
                          ? `${ratingColor}15`
                          : (hasNoRating ? 'rgba(54, 144, 206, 0.06)' : 'transparent')),
                    color: isPitch 
                      ? (hasPitchData 
                          ? (isDarkMode ? '#10b981' : '#059669')
                          : '#fff')
                      : (localRating && isRate
                          ? ratingColor
                          : (hasNoRating ? 'rgba(54, 144, 206, 0.75)' : (isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'))),
                    border: `1px solid ${isPitch 
                      ? (hasPitchData
                          ? (isDarkMode ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.5)')
                          : colours.highlight)
                      : (localRating && isRate
                          ? `${ratingColor}40`
                          : (hasNoRating 
                              ? 'rgba(54, 144, 206, 0.25)' 
                              : (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)')))}`,
                    backdropFilter: 'blur(8px)',
                    padding: isRate ? '5px 9px' : '6px 12px',
                    borderRadius: 16,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: 30,
                    opacity: isRate && isUpdatingRating ? 0.6 : (isRate && hasNoRating ? 0.8 : (isRate && localRating ? 0.75 : (isRate ? 1 : 0.75))),
                    transform: 'translateY(0) scale(1)',
                    transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: (localRating && isRate) ? `0 0 0 1px ${ratingColor}20` : (hasNoRating ? '0 0 0 1px rgba(54, 144, 206, 0.1)' : 'none'),
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    lineHeight: 1,
                    selectors: {
                      ':hover': { 
                        background: isPitch 
                          ? colours.blue 
                          : (localRating && isRate
                              ? `${ratingColor}25`
                              : (hasNoRating 
                                  ? 'rgba(54, 144, 206, 0.12)' 
                                  : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'))),
                        color: isPitch 
                          ? '#fff' 
                          : (localRating && isRate
                              ? ratingColor
                              : (hasNoRating 
                                  ? colours.highlight 
                                  : colours.highlight)),
                        borderRadius: 14,
                        borderColor: isPitch 
                          ? colours.blue 
                          : (localRating && isRate
                              ? `${ratingColor}60`
                              : (hasNoRating ? colours.highlight : colours.highlight)),
                        transform: isUpdatingRating ? 'translateY(0) scale(1)' : 'translateY(-1px) scale(1.02)',
                        opacity: 1,
                        boxShadow: isPitch 
                          ? '0 3px 12px rgba(54, 144, 206, 0.25)' 
                          : (localRating && isRate
                              ? `0 2px 10px ${ratingColor}25`
                              : (hasNoRating ? '0 2px 10px rgba(54, 144, 206, 0.15)' : '0 2px 8px rgba(0,0,0,0.08)'))
                      },
                      ':active': { 
                        background: isPitch 
                          ? colours.blue 
                          : (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'),
                        color: isPitch ? '#fff' : colours.blue, 
                        borderRadius: 14, 
                        transform: isUpdatingRating ? 'scale(1)' : 'scale(0.97)' 
                      },
                    },
                  })}
                >
                  {isRate ? (
                    <>
                      <Icon 
                        iconName={localRating 
                          ? (localRating === 'Good' ? 'FavoriteStarFill' : localRating === 'Neutral' ? 'CircleRing' : 'StatusErrorFull')
                          : 'FavoriteStar'
                        } 
                        styles={{ root: { fontSize: 12, lineHeight: 1, transition: 'all 0.2s ease' } }} 
                      />
                      <span style={{ minWidth: 28, textAlign: 'center', transition: 'all 0.2s ease' }}>
                        {isUpdatingRating ? '...' : (localRating || 'Rate')}
                      </span>
                    </>
                  ) : isPitch && hasPitchData ? (
                    // Pitched button with tick and count
                    <div
                      onMouseEnter={() => setIsPitchHovered(true)}
                      onMouseLeave={() => setIsPitchHovered(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
                      <Icon 
                        iconName={isPitchHovered ? 'Send' : 'CheckMark'} 
                        styles={{ 
                          root: { 
                            fontSize: 12, 
                            lineHeight: 1, 
                            transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                            transform: isPitchHovered ? 'scale(1)' : 'scale(1.1)'
                          } 
                        }} 
                      />
                      <span style={{ 
                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {isPitchHovered ? 'Pitch' : 'Pitched'}
                        {!isPitchHovered && (
                          <span
                            style={{
                              background: isDarkMode ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
                              color: isDarkMode ? '#10b981' : '#059669',
                              border: `1px solid ${isDarkMode ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)'}`,
                              borderRadius: '12px',
                              padding: '1px 6px',
                              fontSize: '9px',
                              fontWeight: 600,
                              minWidth: '18px',
                              height: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                              transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                              opacity: isPitchHovered ? 0 : 1,
                              transform: isPitchHovered ? 'scale(0.8)' : 'scale(1)',
                            }}
                          >
                            {pitchCount}
                          </span>
                        )}
                      </span>
                    </div>
                  ) : (
                    // Regular button
                    <>
                      <Icon iconName={btn.icon} styles={{ root: { fontSize: 12, lineHeight: 1 } }} />
                      {btn.label}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Rating Modal - Popup overlay */}
      {showRatingMenu && onRatingChange && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowRatingMenu(false);
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            ref={ratingMenuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: isDarkMode ? 'rgba(40,40,40,0.98)' : 'rgba(255,255,255,0.98)',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
              borderRadius: 12,
              boxShadow: isDarkMode 
                ? '0 12px 48px rgba(0,0,0,0.7)' 
                : '0 12px 48px rgba(0,0,0,0.2)',
              minWidth: 280,
              overflow: 'hidden',
              animation: 'dropIn 0.25s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <Text style={{
                fontSize: 15,
                fontWeight: 600,
                color: isDarkMode ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)',
              }}>
                Rate Enquiry
              </Text>
              <button
                onClick={() => setShowRatingMenu(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon iconName="Cancel" style={{ fontSize: 16 }} />
              </button>
            </div>

            {/* Rating options */}
            <div style={{ padding: '8px 0' }}>
              {[
                { value: 'Good', icon: 'FavoriteStarFill', color: colours.blue, label: 'Good quality enquiry' },
                { value: 'Neutral', icon: 'CircleRing', color: colours.grey, label: 'Average enquiry' },
                { value: 'Poor', icon: 'StatusErrorFull', color: colours.cta, label: 'Poor quality enquiry' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRatingChange(option.value);
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    border: 'none',
                    background: localRating === option.value 
                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                      : 'transparent',
                    color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 14,
                    fontWeight: localRating === option.value ? 600 : 500,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode 
                      ? 'rgba(255,255,255,0.08)' 
                      : 'rgba(0,0,0,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = localRating === option.value 
                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                      : 'transparent';
                  }}
                >
                  <Icon 
                    iconName={option.icon} 
                    style={{ fontSize: 18, color: option.color }} 
                  />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>{option.value}</div>
                    <div style={{ 
                      fontSize: 12, 
                      color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                      marginTop: 2
                    }}>
                      {option.label}
                    </div>
                  </div>
                  {localRating === option.value && (
                    <Icon 
                      iconName="CheckMark" 
                      style={{ 
                        fontSize: 14, 
                        color: option.color 
                      }} 
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
  {/* Removed inline pitch builder modal */}
    </div>
  );
};

export default ClaimedEnquiryCard;
