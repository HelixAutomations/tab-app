// src/tabs/enquiries/EnquiryDetails.tsx

import React, { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Icon,
  Link,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
  IconButton,
  mergeStyles,
  TooltipHost,
} from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types'; // Adjust the import path as needed
import { colours } from '../../app/styles/colours'; // Adjust the import path as needed
import BubbleTextField from '../../app/styles/BubbleTextField'; // Adjust the import path as needed
import { useTheme } from '../../app/functionality/ThemeContext'; // Adjust the import path as needed

/* ------------------------------------------------------------------
   1. UTILITY FUNCTIONS & CONSTANTS
------------------------------------------------------------------ */

// Define which fields are mandatory (now unused but kept for potential future use)
const mandatoryFields: Partial<Record<keyof Enquiry, boolean>> = {
  First_Name: true,
  Last_Name: true,
  Email: true,
  Phone_Number: true,
  // Add more mandatory fields as needed
};

// Helper to check if a field is missing
const isFieldMissing = (value: any) => value === undefined || value === null || value === '';

// Helper to format dates
const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Helper to render links or 'N/A'
const renderLink = (url?: string) =>
  url ? (
    <Link href={url} target="_blank" rel="noopener noreferrer">
      {url}
    </Link>
  ) : (
    'N/A'
  );

/**
 * Compute section statistics:
 * - total: total number of fields in the section
 * - filledCount: number of fields that have values
 */
const computeSectionStats = (fields: (keyof Enquiry)[], data: Enquiry) => {
  const total = fields.length;
  let filledCount = 0;

  fields.forEach((field) => {
    const value = data[field];
    if (!isFieldMissing(value)) {
      filledCount++;
    }
  });

  return { total, filledCount };
};

/* ------------------------------------------------------------------
   2. STYLES
------------------------------------------------------------------ */

/**
 * Main container styling, consistent with Home.tsx and PitchBuilder.tsx
 */
const mainContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    padding: '20px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxSizing: 'border-box',
    animation: 'fadeInUp 0.5s ease forwards',
  });

/**
 * Section card styled with icon and count bubble
 */
const sectionCardStyle = (isDarkMode: boolean, delay: number) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    cursor: 'pointer',
    opacity: 0,
    transform: 'translateY(20px)',
    animation: `fadeInUp 0.5s ease forwards`,
    animationDelay: `${delay}s`,
    transition: 'box-shadow 0.3s, transform 0.3s',
    ':hover': {
      boxShadow: isDarkMode
        ? `0 6px 16px ${colours.dark.border}`
        : `0 6px 16px ${colours.light.border}`,
      transform: 'translateY(-2px)',
    },
  });

const sectionHeaderStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

/**
 * Container for the section title and icon
 */
const sectionTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  });

const iconContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: colours.grey,
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

const sectionTitleTextStyle = mergeStyles({
  fontSize: '18px',
  fontWeight: 700,
  color: colours.highlight,
});

/**
 * Styling for the count bubble
 */
const countBubbleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: colours.grey,
    color: isDarkMode ? colours.dark.text : colours.light.text, // Dark text on grey bubble
    borderRadius: '12px',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: 'normal', // Changed from 'bold' to 'normal'
    alignSelf: 'flex-start',
    // Removed animation properties to make it appear with the section card
  });

/**
 * Grid layout for sections (three columns per line)
 */
const sectionsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '20px',
  '@media (max-width: 1200px)': {
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  },
});

/**
 * Grid layout for fields within a section
 */
const fieldGridStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  borderTop: `1px solid ${colours.light.border}`,
  paddingTop: '12px',
  animation: 'fadeInUp 0.5s ease forwards',
});

/**
 * Container for field labels and values
 */
const fieldContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
});

/**
 * Styling for field labels
 */
const fieldLabelStyle = (isDarkMode: boolean, isMissing: boolean) =>
  mergeStyles({
    fontWeight: 600,
    color: isMissing
      ? colours.red // Subtle red for missing data
      : isDarkMode
      ? colours.dark.text
      : colours.light.text,
    minWidth: '150px',
    textAlign: 'left',
  });

/**
 * Styling for field value containers
 */
const fieldValueContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    color: isDarkMode ? colours.dark.text : colours.light.text,
    flex: 1,
    wordBreak: 'break-word',
    textAlign: 'left',
  });

/**
 * Container for action buttons (Submit, Cancel, Edit)
 */
const buttonContainerStyle = (isEditing: boolean) =>
  mergeStyles({
    display: 'flex',
    justifyContent: isEditing ? 'flex-end' : 'flex-start',
    gap: '15px',
    marginTop: '10px',
    width: '100%',
  });

/**
 * Subtle separator between fields
 */
const separatorStyle = mergeStyles({
  height: '1px',
  backgroundColor: colours.light.border,
  margin: '8px 0',
});

/* ------------------------------------------------------------------
   3. COMPONENT
------------------------------------------------------------------ */

interface EnquiryDetailsProps {
  enquiry: Enquiry;
  onUpdate: (updatedEnquiry: Enquiry) => void;
}

const EnquiryDetails: React.FC<EnquiryDetailsProps> = ({ enquiry, onUpdate }) => {
  const { isDarkMode } = useTheme();

  // Global edit state
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Local state for form data
  const [formData, setFormData] = useState<Enquiry>({ ...enquiry });

  // Alert states
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Collapsible sections (all start collapsed)
  const [personalOpen, setPersonalOpen] = useState<boolean>(false);
  const [contactOpen, setContactOpen] = useState<boolean>(false);
  const [addressOpen, setAddressOpen] = useState<boolean>(false);
  const [enquiryOpen, setEnquiryOpen] = useState<boolean>(false);
  const [sourceOpen, setSourceOpen] = useState<boolean>(false);
  const [internalOpen, setInternalOpen] = useState<boolean>(false);

  /* ---------------------------------------------------------------
     SECTION DEFINITIONS
  --------------------------------------------------------------- */

  // Define fields for each section
  const personalFields: (keyof Enquiry)[] = ['First_Name', 'Last_Name', 'DOB', 'Title'];
  const contactFields: (keyof Enquiry)[] = ['Email', 'Phone_Number', 'Secondary_Phone', 'Website'];
  const addressFields: (keyof Enquiry)[] = [
    'Unit_Building_Name_or_Number',
    'Mailing_Street',
    'Mailing_Street_2',
    'Mailing_Street_3',
    'City',
    'Mailing_County',
    'Postal_Code',
    'Country',
  ];
  const enquiryFields: (keyof Enquiry)[] = [
    'Area_of_Work',
    'Employment',
    'Type_of_Work',
    'Divorce_Consultation',
    'Do_not_Market',
    'IP_Address',
    'TDMY',
    'TDN',
    'pocname', // POC Name
    'Rating',
  ];
  const sourceCampaignFields: (keyof Enquiry)[] = [
    'Method_of_Contact',
    'Web_Form',
    'Ultimate_Source',
    'Contact_Referrer',
    'Referring_Company',
    'Other_Referrals',
    'Referral_URL',
    'Campaign',
    'Ad_Group',
    'Search_Keyword',
    'GCLID',
  ];
  const internalFields: (keyof Enquiry)[] = [
    'Tags',
    'Gift_Rank',
    'Matter_Ref',
    'Value',
    'Call_Taker',
    'Initial_first_call_notes',
  ];

  /* ---------------------------------------------------------------
     ANIMATION KEYFRAMES
  --------------------------------------------------------------- */

  useEffect(() => {
    const styles = `
      @keyframes fadeInUp {
        0% {
          opacity: 0;
          transform: translateY(20px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  /* ---------------------------------------------------------------
     HANDLERS
  --------------------------------------------------------------- */

  // Handle field value changes
  const handleChange = (field: keyof Enquiry, value: string | number | undefined) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Validate the form (example: email format)
  const validateForm = (): boolean => {
    if (formData.Email && !formData.Email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      setIsErrorVisible(true);
      return false;
    }
    setErrorMessage('');
    setIsErrorVisible(false);
    return true;
  };

  // Handle form submission
  const handleSubmit = () => {
    if (validateForm()) {
      onUpdate(formData);
      setIsEditing(false);
      setIsSuccessVisible(true);
      setTimeout(() => setIsSuccessVisible(false), 3000);
    }
  };

  // Handle form reset/cancel
  const handleReset = () => {
    setFormData({ ...enquiry });
    setIsEditing(false);
    setErrorMessage('');
    setIsErrorVisible(false);
  };

  /* ---------------------------------------------------------------
     RENDERING FUNCTIONS
  --------------------------------------------------------------- */

  /**
   * Renders a single field with label and value
   */
  const renderField = (field: keyof Enquiry) => {
    const label = field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()); // Convert to Title Case

    const value = formData[field];
    const isMissing = isFieldMissing(value);

    // Determine field type
    const isDateField = field === 'DOB';
    const isNumberField = field === 'Gift_Rank' || field === 'Rating' || field === 'Value';

    // Prepare the value to pass as string
    let fieldValue = '';
    if (isDateField && typeof value === 'string') {
      fieldValue = new Date(value).toISOString().split('T')[0];
    } else if (isNumberField && typeof value === 'number') {
      fieldValue = value.toString();
    } else {
      fieldValue = value !== undefined ? String(value) : '';
    }

    return (
      <div key={field}>
        <div className={fieldContainerStyle}>
          <Text className={fieldLabelStyle(isDarkMode, isMissing)}>
            {label}
            {isMissing && (
              <TooltipHost content="Data is missing">
                {/* Subtle underline instead of an icon */}
                <span
                  className={mergeStyles({
                    display: 'inline-block',
                    width: '100%',
                    height: '2px',
                    backgroundColor: colours.red,
                    marginLeft: '4px',
                    borderRadius: '2px',
                  })}
                ></span>
              </TooltipHost>
            )}
          </Text>
          {isEditing ? (
            <BubbleTextField
              multiline={field === 'Initial_first_call_notes'}
              minHeight={field === 'Initial_first_call_notes' ? '80px' : undefined}
              type={
                isDateField
                  ? 'date'
                  : isNumberField
                  ? 'number'
                  : 'text'
              }
              value={fieldValue}
              onChange={(_, newValue) => {
                if (isNumberField) {
                  handleChange(field, newValue ? parseInt(newValue, 10) : undefined);
                } else {
                  handleChange(field, newValue);
                }
              }}
              isDarkMode={isDarkMode}
              placeholder={label}
              ariaLabel={label}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              {isDateField
                ? formatDate(value as string)
                : field === 'Referral_URL' || field === 'Website'
                ? renderLink(value as string)
                : value || 'N/A'}
            </div>
          )}
        </div>
        {!isEditing && <div className={separatorStyle} />}
      </div>
    );
  };

  /**
   * Renders a collapsible section with summary in the header
   */
  const renderCollapsibleSection = (
    title: string,
    isOpen: boolean,
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>,
    fields: (keyof Enquiry)[],
    iconName: string,
    delay: number
  ) => {
    const { total, filledCount } = computeSectionStats(fields, formData);
    const countBubble = (
      <span className={countBubbleStyle(isDarkMode)}>{filledCount}/{total}</span>
    );

    return (
      <div
        className={sectionCardStyle(isDarkMode, delay)}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`${title} section`}
      >
        <div className={sectionHeaderStyle}>
          <div className={sectionTitleStyle(isDarkMode)}>
            <div className={iconContainerStyle(isDarkMode)}>
              <Icon iconName={iconName} />
            </div>
            <Text className={sectionTitleTextStyle}>{title}</Text>
          </div>
          {countBubble}
        </div>
        {isOpen && <div className={fieldGridStyle}>{fields.map((f) => renderField(f))}</div>}
      </div>
    );
  };

  /**
   * Renders all sections in a responsive grid with three sections per line
   */
  const renderSectionsGrid = () => {
    const sections = [
      { title: 'Personal Information', open: personalOpen, setOpen: setPersonalOpen, fields: personalFields, icon: 'ContactCard' },
      { title: 'Contact Information', open: contactOpen, setOpen: setContactOpen, fields: contactFields, icon: 'Phone' },
      { title: 'Address Information', open: addressOpen, setOpen: setAddressOpen, fields: addressFields, icon: 'Home' },
      { title: 'Enquiry Details', open: enquiryOpen, setOpen: setEnquiryOpen, fields: enquiryFields, icon: 'Info' },
      { title: 'Source and Campaign Details', open: sourceOpen, setOpen: setSourceOpen, fields: sourceCampaignFields, icon: 'Source' },
      { title: 'Internal Details', open: internalOpen, setOpen: setInternalOpen, fields: internalFields, icon: 'Settings' },
    ];

    return (
      <div className={sectionsGridStyle}>
        {sections.map((section, index) =>
          renderCollapsibleSection(
            section.title,
            section.open,
            section.setOpen,
            section.fields,
            section.icon,
            index * 0.1 // Staggered delay
          )
        )}
      </div>
    );
  };

  /* ---------------------------------------------------------------
     MAIN RENDER
  --------------------------------------------------------------- */

  return (
    <Stack className={mainContainerStyle(isDarkMode)}>
      {/* Success & Error Messages */}
      {isSuccessVisible && (
        <MessageBar
          messageBarType={MessageBarType.success}
          isMultiline={false}
          onDismiss={() => setIsSuccessVisible(false)}
          dismissButtonAriaLabel="Close"
          styles={{
            root: {
              borderRadius: '4px',
              width: '100%',
            },
          }}
        >
          Details updated successfully!
        </MessageBar>
      )}
      {isErrorVisible && (
        <MessageBar
          messageBarType={MessageBarType.error}
          isMultiline={false}
          onDismiss={() => setIsErrorVisible(false)}
          dismissButtonAriaLabel="Close"
          styles={{
            root: {
              borderRadius: '4px',
              width: '100%',
            },
          }}
        >
          {errorMessage}
        </MessageBar>
      )}

      {/* Collapsible Sections Grid */}
      {renderSectionsGrid()}

      {/* Action Buttons */}
      <Stack className={buttonContainerStyle(isEditing)}>
        {isEditing ? (
          <>
            <PrimaryButton
              text="Submit Changes"
              onClick={handleSubmit}
              styles={{
                root: {
                  backgroundColor: colours.cta,
                  borderRadius: '8px',
                  border: 'none',
                  width: '150px',
                  selectors: {
                    ':hover': {
                      backgroundColor: colours.red,
                    },
                  },
                },
                label: {
                  color: 'white',
                  fontWeight: '600',
                },
              }}
              ariaLabel="Submit Changes"
            />
            <DefaultButton
              text="Cancel"
              onClick={handleReset}
              styles={{
                root: {
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                  width: '150px',
                  selectors: {
                    ':hover': {
                      backgroundColor: isDarkMode
                        ? colours.dark.cardHover
                        : colours.light.cardHover,
                    },
                  },
                },
                label: {
                  color: colours.greyText,
                  fontWeight: '600',
                },
              }}
              ariaLabel="Cancel Editing"
            />
          </>
        ) : (
          <PrimaryButton
            text="Edit Details"
            onClick={() => setIsEditing(true)}
            styles={{
              root: {
                backgroundColor: colours.cta,
                borderRadius: '8px',
                border: 'none',
                width: '150px',
                selectors: {
                  ':hover': {
                    backgroundColor: colours.red,
                  },
                },
              },
              label: {
                color: 'white',
                fontWeight: '600',
              },
            }}
            ariaLabel="Edit Details"
          />
        )}
      </Stack>
    </Stack>
  );
};

export default EnquiryDetails;
