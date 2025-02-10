// src/tabs/matters/MatterCard.tsx

import React from 'react';
import { Stack, Text, Icon, IconButton, TooltipHost } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Matter } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/MatterCard.css';

interface MatterCardProps {
  matter: Matter;
  onSelect: (matter: Matter) => void;
  animationDelay?: number;
}

// --- Action Button Style ---
const actionButtonStyle = {
  root: {
    marginBottom: '4px',
    color: colours.cta,
    selectors: {
      ':hover': {
        backgroundColor: colours.cta,
        color: '#ffffff',
      },
    },
    height: '32px',
    width: '32px',
  },
};

// --- Separator Style ---
const separatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '1px',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    margin: '0 10px',
    alignSelf: 'stretch',
  });

// --- Card Style ---
const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(255,255,255,0.1)'
      : '0 2px 8px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.3s',
    ':hover': {
      transform: 'scale(1.02)',
      boxShadow: isDarkMode
        ? '0 4px 16px rgba(255,255,255,0.2)'
        : '0 4px 16px rgba(0,0,0,0.2)',
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
    overflow: 'hidden',
  });

// --- Helper: Compute Initials ---
const getInitials = (name: string): string => {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

// --- Practice Area Mappings ---
const practiceAreaMappings: { [group: string]: string[] } = {
  Commercial: [
    "Director Rights & Dispute Advice",
    "Shareholder Rights & Dispute Advice",
    "Civil/Commercial Fraud Advice",
    "Partnership Advice",
    "Business Contract Dispute",
    "Unpaid Loan Recovery",
    "Contentious Probate",
    "Statutory Demand – Drafting",
    "Statutory Demand – Advising",
    "Winding Up Petition Advice",
    "Bankruptcy Petition Advice",
    "Injunction Advice",
    "Intellectual Property",
    "Professional Negligence",
    "Unpaid Invoice/Debt Dispute",
    "Commercial Contract – Drafting",
    "Company Restoration",
    "Small Claim Advice",
    "Trust Advice",
    "Terms and Conditions – Drafting",
  ],
  Construction: [
    "Final Account Recovery",
    "Retention Recovery Advice",
    "Adjudication Advice & Dispute",
    "Construction Contract Advice",
    "Interim Payment Recovery",
    "Contract Dispute",
  ],
  Property: [
    "Landlord & Tenant - Commercial Dispute",
    "Landlord & Tenant - Residential Dispute",
    "Boundary and Nuisance Advice",
    "Trust of Land (TOLATA) Advice",
    "Service Charge Recovery & Dispute Advice",
    "Breach of Lease Advice",
    "Terminal Dilapidations Advice",
    "Investment Sale and Ownership - Advice",
    "Trespass",
    "Right of Way",
  ],
  Employment: [
    "Employment Contract - Drafting",
    "Employment Retainer Instruction",
    "Settlement Agreement - Drafting",
    "Settlement Agreement - Advising",
    "Handbook - Drafting",
    "Policy - Drafting",
    "Redundancy - Advising",
    "Sick Leave - Advising",
    "Disciplinary - Advising",
    "Restrictive Covenant Advice",
    "Post Termination Dispute",
    "Employment Tribunal Claim - Advising",
  ],
};

// --- Helper: Get Group Color ---
const getGroupColor = (group: string): string => {
  switch (group) {
    case 'Commercial':
      return colours.blue;
    case 'Construction':
      return colours.orange;
    case 'Property':
      return colours.green;
    case 'Employment':
      return colours.yellow;
    case 'Miscellaneous':
    default:
      return colours.cta;
  }
};

// --- Helper: Determine the Practice Area Group ---
const getPracticeAreaGroup = (area: string): string => {
  const lowerArea = area.trim().toLowerCase();
  for (const group in practiceAreaMappings) {
    if (practiceAreaMappings[group].some(a => a.trim().toLowerCase() === lowerArea)) {
      return group;
    }
  }
  return "Miscellaneous";
};

// --- Detail Row ---
interface DetailRowProps {
  label: string;
  value: string;
  isDarkMode: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, isDarkMode }) => (
  <Stack tokens={{ childrenGap: 4 }}>
    <Text
      variant="small"
      styles={{
        root: {
          color: colours.highlight,
          fontWeight: 'bold',
        },
      }}
    >
      {label}
    </Text>
    <Text
      variant="small"
      styles={{
        root: {
          color: isDarkMode ? colours.dark.text : colours.light.text,
        },
      }}
    >
      {value}
    </Text>
  </Stack>
);

// --- Badge Styles ---
const badgeStyle: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: '20px',
  backgroundColor: colours.green,
  color: '#ffffff',
  fontSize: '0.8rem',
  fontWeight: 600,
  fontFamily: 'Raleway, sans-serif',
  opacity: 0.5,
};

const badgeStyleResponsible: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: '20px',
  backgroundColor: '#ffffff',
  border: `1px solid ${colours.green}`,
  color: colours.green,
  fontSize: '0.8rem',
  fontWeight: 600,
  fontFamily: 'Raleway, sans-serif',
};

const MatterCard: React.FC<MatterCardProps> = ({ matter, onSelect, animationDelay = 0 }) => {
  const { isDarkMode } = useTheme();

  const handleCardClick = () => {
    onSelect(matter);
  };

  const matterDetails = [
    { label: 'Approx. Value', value: matter.ApproxValue },
    { label: 'Practice Area', value: matter.PracticeArea },
    { label: 'Description', value: matter.Description },
  ];

  // Retrieve solicitor names from the matter object.
  const originating = matter.OriginatingSolicitor?.trim() || '';
  const responsible = matter.ResponsibleSolicitor?.trim() || '';

  // Compute initials if available.
  const orgInitials = originating ? getInitials(originating) : '';
  const respInitials = responsible ? getInitials(responsible) : '';

  // Prepare badge(s): if both exist and are different, show two badges; otherwise, a single badge.
  let badges: { content: JSX.Element; style: React.CSSProperties; aria: string }[] = [];
  if (orgInitials && respInitials) {
    if (orgInitials.toLowerCase() === respInitials.toLowerCase()) {
      badges.push({
        content: <span>{orgInitials}</span>,
        style: badgeStyle,
        aria: `Solicitor: ${orgInitials}`,
      });
    } else {
      badges.push({
        content: <span>{orgInitials}</span>,
        style: badgeStyle,
        aria: `Originating: ${orgInitials}`,
      });
      badges.push({
        content: <span>{respInitials}</span>,
        style: badgeStyleResponsible,
        aria: `Responsible: ${respInitials}`,
      });
    }
  } else if (orgInitials || respInitials) {
    badges.push({
      content: <span>{orgInitials || respInitials}</span>,
      style: badgeStyle,
      aria: `Solicitor: ${orgInitials || respInitials}`,
    });
  }

  // Determine the left border color based on the matter's practice area.
  const borderColor = getGroupColor(getPracticeAreaGroup(matter.PracticeArea));

  return (
    <div
      className={mergeStyles(cardStyle(isDarkMode), {
        borderLeft: `4px solid ${borderColor}`,
      })}
      style={{ '--animation-delay': `${animationDelay}s` } as React.CSSProperties}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleCardClick();
        }
      }}
      aria-label={`View details for matter ${matter.UniqueID}`}
    >
      {/* Horizontal Stack to separate content and actions */}
      <Stack horizontal tokens={{ childrenGap: 20 }} verticalAlign="stretch">
        {/* Left Side: Main Content */}
        <Stack tokens={{ childrenGap: 8 }} styles={{ root: { flex: 1, paddingRight: '10px' } }}>
          {/* Display Number and Client Name with Icon */}
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <Icon
              iconName="OpenFolderHorizontal"
              styles={{
                root: {
                  fontSize: 20,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            />
            <Text
              variant="mediumPlus"
              styles={{
                root: {
                  fontWeight: 'bold',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  cursor: 'pointer',
                },
              }}
            >
              {matter.DisplayNumber}
            </Text>
            <Text
              variant="mediumPlus"
              styles={{
                root: {
                  fontWeight: 'normal',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            >
              - {matter.ClientName}
            </Text>
          </Stack>

          {/* Spacer */}
          <div style={{ height: '12px' }} />

          {/* Details List */}
          <Stack tokens={{ childrenGap: 12 }}>
            {matterDetails.map((item, index) => (
              <DetailRow key={index} label={item.label} value={item.value} isDarkMode={isDarkMode} />
            ))}
          </Stack>

          {/* Spacer */}
          <div style={{ height: '12px' }} />

          {/* Open Date */}
          <Text
            variant="small"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
            }}
          >
            {new Date(matter.OpenDate).toLocaleDateString()}
          </Text>
        </Stack>

        {/* Vertical Separator */}
        <div className={separatorStyle(isDarkMode)} />

        {/* Right Side: Actions Area with relative positioning */}
        <div style={{ position: 'relative' }}>
          <Stack tokens={{ childrenGap: 8 }} verticalAlign="start">
            <TooltipHost content="Call Client">
              <IconButton
                iconProps={{ iconName: 'Phone' }}
                title="Call Client"
                ariaLabel="Call Client"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = matter.ClientPhone ? `tel:${matter.ClientPhone}` : '#';
                }}
                styles={actionButtonStyle}
              />
            </TooltipHost>
            <TooltipHost content="Email Client">
              <IconButton
                iconProps={{ iconName: 'Mail' }}
                title="Email Client"
                ariaLabel="Email Client"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = matter.ClientEmail ? `mailto:${matter.ClientEmail}` : '#';
                }}
                styles={actionButtonStyle}
              />
            </TooltipHost>
          </Stack>
          {/* Badge Container in the Actions Area */}
          {badges.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {badges.map((badge, idx) => (
                <div key={idx} style={badge.style} aria-label={badge.aria}>
                  {badge.content}
                </div>
              ))}
            </div>
          )}
        </div>
      </Stack>
    </div>
  );
};

export default MatterCard;
