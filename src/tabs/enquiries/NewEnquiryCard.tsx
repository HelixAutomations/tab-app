import React, { useState } from 'react';
import { format } from 'date-fns';
import { mergeStyles } from '@fluentui/react';
import {
  FaUser,
  FaPhone,
  FaEnvelope,
  FaPoundSign,
  FaCalendarAlt,
  FaFileAlt,
  FaGlobe,
  FaUserPlus,
  FaBuilding,
  FaCopy,
  FaThumbsUp,
  FaThumbsDown,
  FaMinus,
  FaStar,
  FaMapMarkerAlt
} from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { NewEnquiry } from '../../app/functionality/newEnquiryTypes';
import '../../app/styles/NewEnquiryCard.css';

// Utility for copying text and showing feedback
function useCopyToClipboard(timeout = 1200): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), timeout);
      });
    }
  };
  return [copied, copy];
}

interface CopyableTextProps {
  value: string;
  className?: string;
  label?: string;
}

const CopyableText: React.FC<CopyableTextProps> = ({ value, className, label }) => {
  const [copied, copy] = useCopyToClipboard();
  const [isHovered, setIsHovered] = React.useState(false);
  const { isDarkMode } = useTheme();
  
  return (
    <span
      className={className}
      title={copied ? `${label || 'Value'} copied!` : `Click to copy ${label || 'value'}`}
      onClick={(e) => {
        e.stopPropagation();
        copy(value);
      }}
      onMouseEnter={(e) => {
        setIsHovered(true);
        e.currentTarget.style.color = isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
        e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        e.currentTarget.style.color = isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      style={{ 
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        position: 'relative', 
        cursor: 'pointer',
        fontSize: '11px',
        fontFamily: 'Consolas, Monaco, monospace',
        color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
        padding: '3px 6px',
        borderRadius: '4px',
        backgroundColor: 'transparent',
        transition: 'all 0.2s ease'
      }}
    >
      {value}
      {copied && (
        <span style={{
          position: 'absolute',
          left: '100%',
          top: 0,
          marginLeft: 8,
          fontSize: 12,
          color: '#43a047',
          background: '#fff',
          borderRadius: 3,
          padding: '2px 6px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          zIndex: 10,
        }}>
          Copied!
        </span>
      )}
    </span>
  );
};

interface NewEnquiryCardProps {
  enquiry: NewEnquiry;
  onSelect?: (enquiry: NewEnquiry) => void;
  onRate?: (enquiryId: number) => void;
  animationDelay?: number;
  selected?: boolean;
  expanded?: boolean;
}

const getAreaColor = (area: string): string => {
  switch (area?.toLowerCase()) {
    case 'commercial':
      return colours.blue;
    case 'construction':
      return colours.orange;
    case 'property':
      return colours.green;
    case 'employment':
      return colours.yellow;
    case 'intellectual_property':
      return colours.cta;
    case 'litigation':
      return colours.red;
    default:
      return colours.grey;
  }
};

const getMethodIcon = (method: string) => {
  switch (method?.toLowerCase()) {
    case 'phone':
      return <FaPhone />;
    case 'email':
      return <FaEnvelope />;
    case 'web_form':
      return <FaGlobe />;
    default:
      return <FaFileAlt />;
  }
};

const getSourceIcon = (source: string) => {
  switch (source?.toLowerCase()) {
    case 'organic':
      return <FaGlobe />;
    case 'referral':
      return <FaUserPlus />;
    case 'google_ads':
      return <FaGlobe />;
    case 'linkedin':
      return <FaBuilding />;
    case 'existing_client':
      return <FaUser />;
    default:
      return <FaFileAlt />;
  }
};

const getRatingIcon = (rating: string) => {
  switch (rating?.toLowerCase()) {
    case 'good':
      return <FaThumbsUp style={{ color: colours.blue }} />;
    case 'neutral':
      return <FaMinus style={{ color: colours.grey }} />;
    case 'poor':
      return <FaThumbsDown style={{ color: colours.cta }} />;
    default:
      return <FaStar style={{ color: colours.grey }} />;
  }
};

const NewEnquiryCard: React.FC<NewEnquiryCardProps> = ({
  enquiry,
  onSelect,
  onRate,
  animationDelay = 0,
  selected = false,
  expanded = false,
}) => {
  const { isDarkMode } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  const fullName = `${enquiry.first} ${enquiry.last}`;
  const formattedDate = format(new Date(enquiry.datetime), 'd MMM yyyy');
  const formattedTime = format(new Date(enquiry.datetime), 'HH:mm');
  
  const areaColor = getAreaColor(enquiry.aow);

  const cardStyles = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    border: selected 
      ? `2px solid ${areaColor}`
      : `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: '12px',
    padding: '24px',
    margin: '8px 0',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    position: 'relative',
    overflow: 'hidden',
    animation: `fadeInUp 0.6s ease-out ${animationDelay}ms both`,
    boxShadow: isHovered
      ? isDarkMode
        ? '0 8px 32px rgba(0, 0, 0, 0.4)'
        : '0 8px 32px rgba(0, 0, 0, 0.15)'
      : isDarkMode
        ? '0 2px 8px rgba(0, 0, 0, 0.2)'
        : '0 2px 8px rgba(0, 0, 0, 0.1)',
    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
    selectors: {
      '::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: areaColor,
        zIndex: 1,
      },
    },
  });

  const headerStyles = mergeStyles({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '16px',
  });

  const clientInfoStyles = mergeStyles({
    flex: 1,
  });

  const nameStyles = mergeStyles({
    fontSize: '20px',
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    marginBottom: '4px',
    cursor: 'pointer',
    transition: 'color 0.2s',
    selectors: {
      ':hover': {
        color: areaColor,
      },
    },
  });

  const emailStyles = mergeStyles({
    // Styles handled inline in CopyableText component
  });

  const metaGridStyles = mergeStyles({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  });

  const metaItemStyles = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
  });

  const valueStyles = mergeStyles({
    fontSize: '18px',
    fontWeight: '600',
    color: areaColor,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  });

  const notesStyles = mergeStyles({
    fontSize: '14px',
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
    lineHeight: '1.5',
    marginTop: '12px',
    fontStyle: 'italic',
    borderLeft: `3px solid ${areaColor}`,
    paddingLeft: '12px',
  });

  const actionsStyles = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  });

  const actionButtonStyles = mergeStyles({
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '16px',
    padding: '8px',
    borderRadius: '6px',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    selectors: {
      ':hover': {
        backgroundColor: areaColor,
        color: '#ffffff',
        transform: 'scale(1.05)',
      },
    },
  });

  const badgeStyles = mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

  const handleClick = () => {
    if (onSelect) {
      onSelect(enquiry);
    }
  };

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (enquiry.phone) {
      window.location.href = `tel:${enquiry.phone}`;
    }
  };

  const handleEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (enquiry.email) {
      window.location.href = `mailto:${enquiry.email}?subject=Your%20Enquiry`;
    }
  };

  const handleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRate) {
      onRate(enquiry.id);
    }
  };

  return (
    <div
      className={cardStyles}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header with client info and date */}
      <div className={headerStyles}>
        <div className={clientInfoStyles}>
          <div>
            <CopyableText value={fullName} className={nameStyles} label="Name" />
          </div>
          <div>
            <CopyableText value={enquiry.email} className={emailStyles} label="Email" />
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '13px', color: isDarkMode ? colours.dark.subText : colours.light.subText }}>
          <div>{formattedDate}</div>
          <div>{formattedTime}</div>
        </div>
      </div>

      {/* Meta information grid */}
      <div className={metaGridStyles}>
        <div className={metaItemStyles}>
          <FaFileAlt style={{ color: areaColor }} />
          <span>{enquiry.aow}</span>
        </div>
        <div className={metaItemStyles}>
          {getMethodIcon(enquiry.moc)}
          <span>{enquiry.moc.replace('_', ' ')}</span>
        </div>
        <div className={metaItemStyles}>
          {getSourceIcon(enquiry.source)}
          <span>{enquiry.source.replace('_', ' ')}</span>
        </div>
        <div className={metaItemStyles}>
          {getRatingIcon(enquiry.rating)}
          <span>{enquiry.rating}</span>
        </div>
      </div>

      {/* Type of work and value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div className={badgeStyles}>
          {enquiry.tow}
        </div>
        <div className={valueStyles}>
          <FaPoundSign size={14} />
          {enquiry.value || 'Not specified'}
        </div>
      </div>

      {/* Phone number */}
      {enquiry.phone && (
        <div className={metaItemStyles} style={{ marginBottom: '8px' }}>
          <FaPhone style={{ 
            fontSize: '11px',
            color: 'inherit',
            opacity: 0.7
          }} />
          <CopyableText value={enquiry.phone} label="Phone" />
        </div>
      )}

      {/* Referrer info */}
      {(enquiry.contact_referrer || enquiry.company_referrer) && (
        <div className={metaItemStyles} style={{ marginBottom: '8px' }}>
          <FaUserPlus style={{ color: areaColor }} />
          <span>
            {enquiry.contact_referrer}
            {enquiry.contact_referrer && enquiry.company_referrer && ' - '}
            {enquiry.company_referrer}
          </span>
        </div>
      )}

      {/* Notes */}
      {enquiry.notes && (
        <div className={notesStyles}>
          {enquiry.notes}
        </div>
      )}

      {/* Action buttons */}
      <div className={actionsStyles}>
        <button className={actionButtonStyles} onClick={handleCall} title="Call">
          <FaPhone />
          Call
        </button>
        <button className={actionButtonStyles} onClick={handleEmail} title="Email">
          <FaEnvelope />
          Email
        </button>
        <button className={actionButtonStyles} onClick={handleRate} title="Rate">
          <FaStar />
          Rate
        </button>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: isDarkMode ? colours.dark.subText : colours.light.subText }}>
          ID: {enquiry.acid}
        </div>
      </div>
    </div>
  );
};

export default NewEnquiryCard;
