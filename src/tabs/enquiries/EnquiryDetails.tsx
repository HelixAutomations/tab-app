// src/EnquiryDetails.tsx

import React, { useState } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  Icon,
  Link,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types'; // Correct import
import { colours } from '../../app/styles/colours';
import BubbleTextField from '../../app/styles/BubbleTextField'; // Ensure this path is correct
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface EnquiryDetailsProps {
  enquiry: Enquiry;
  onUpdate: (updatedEnquiry: Enquiry) => void; // Callback to handle updates
}

// Define styles using Fluent UI's mergeStyles for a modern look
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '30px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? '0 4px 16px rgba(255, 255, 255, 0.1)'
      : '0 4px 16px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '30px',
    fontFamily: 'Segoe UI, sans-serif',
  });

const topRowStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', // Responsive three-column grid
    gap: '30px',
  });

const sectionCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    padding: '20px',
    borderRadius: '10px',
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(255, 255, 255, 0.05)'
      : '0 2px 8px rgba(0, 0, 0, 0.05)',
    position: 'relative', // For background image positioning
    backgroundImage: `url('https://helix-law.co.uk/wp-content/uploads/2023/09/Asset-2-2.png')`, // Replace with your image URL or import
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'top left',
    backgroundSize: '50px 50px', // Adjust size as needed
  });

const enquiryDetailsSectionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    padding: '20px',
    borderRadius: '10px',
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(255, 255, 255, 0.05)'
      : '0 2px 8px rgba(0, 0, 0, 0.05)',
    width: '100%', // Full width
    boxSizing: 'border-box',
    position: 'relative',
    backgroundImage: `url('https://helix-law.co.uk/wp-content/uploads/2023/09/Asset-2-2.png')`, // Replace with your image URL or import
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'top left',
    backgroundSize: '50px 50px', // Adjust size as needed
  });

const sectionHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const fieldGridStyle = (columns: number) =>
  mergeStyles({
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    rowGap: '12px',
    columnGap: '20px',
    '@media (max-width: 1200px)': {
      gridTemplateColumns: 'repeat(2, 1fr)', // Two columns on medium screens
    },
    '@media (max-width: 800px)': {
      gridTemplateColumns: '1fr', // Single column on small screens
    },
  });

const fieldLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: 600,
    color: isDarkMode ? colours.dark.text : colours.light.text, // Normal text color
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  });

const fieldValueContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    wordBreak: 'break-word',
  });

// Visual Indicator Style
const missingDataIconStyle = mergeStyles({
  fontSize: 16,
  color: colours.red, // Use the defined red color
});

const buttonGroupStyle = (isEditing: boolean, isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    justifyContent: isEditing ? 'flex-end' : 'flex-start',
    gap: '15px',
    marginTop: '20px',
    width: '100%', // Ensures the button group takes full width for alignment
  });

const EnquiryDetails: React.FC<EnquiryDetailsProps> = ({ enquiry, onUpdate }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formData, setFormData] = useState<Enquiry>({ ...enquiry });
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Helper function to format dates
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Helper function to render link or text
  const renderLink = (url?: string) => {
    return url ? (
      <Link href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </Link>
    ) : (
      'N/A'
    );
  };

  // Handle input changes
  const handleChange = (
    field: keyof Enquiry,
    value: string | number | undefined
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Validate form data
  const validateForm = (): boolean => {
    // Example validation: Email should contain "@" if it's not 'N/A'
    if (formData.Email && !formData.Email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      setIsErrorVisible(true);
      return false;
    }
    // Add more validations as needed
    setIsErrorVisible(false);
    setErrorMessage('');
    return true;
  };

  // Handle form submission
  const handleSubmit = () => {
    if (validateForm()) {
      onUpdate(formData); // Call the onUpdate prop with the updated enquiry
      setIsEditing(false);
      setIsSuccessVisible(true);
      // Hide success message after 3 seconds
      setTimeout(() => setIsSuccessVisible(false), 3000);
    }
  };

  // Handle form reset
  const handleReset = () => {
    setFormData({ ...enquiry });
    setIsEditing(false);
    setIsErrorVisible(false);
    setErrorMessage('');
  };

  // Determine if a field has missing data
  const isFieldMissing = (value: any) => {
    return value === undefined || value === null || value === '';
  };

  return (
    <Stack className={containerStyle(isDarkMode)}>
      {/* Top Row: Personal, Contact, and Address Information */}
      <Stack className={topRowStyle(isDarkMode)}>
        {/* Personal Information Section */}
        <Stack className={sectionCardStyle(isDarkMode)}>
          <div className={sectionHeaderStyle(isDarkMode)}>
            <Icon iconName="Contact" style={{ fontSize: 24, color: colours.highlight }} />
            <Text variant="xLargePlus" styles={{ root: { fontWeight: 700, color: colours.highlight } }}>
              Personal Information
            </Text>
          </div>
          <div className={fieldGridStyle(2)}>
            {/* First Name */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              First Name
              {isFieldMissing(formData.First_Name) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.First_Name || ''} // Ensure string
                onChange={(_, newValue) => handleChange('First_Name', newValue)}
                placeholder="First Name"
                ariaLabel="First Name"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.First_Name || 'N/A'}</Text>
              </div>
            )}

            {/* Last Name */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Last Name
              {isFieldMissing(formData.Last_Name) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Last_Name || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Last_Name', newValue)}
                placeholder="Last Name"
                ariaLabel="Last Name"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Last_Name || 'N/A'}</Text>
              </div>
            )}

            {/* Date of Birth */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Date of Birth
              {isFieldMissing(formData.DOB) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                type="date"
                value={formData.DOB ? new Date(formData.DOB).toISOString().split('T')[0] : ''}
                onChange={(_, newValue) => handleChange('DOB', newValue)}
                placeholder="Date of Birth"
                ariaLabel="Date of Birth"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formatDate(formData.DOB)}</Text>
              </div>
            )}

            {/* Title */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Title
              {isFieldMissing(formData.Title) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Title || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Title', newValue)}
                placeholder="Title"
                ariaLabel="Title"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Title || 'N/A'}</Text>
              </div>
            )}
          </div>
        </Stack>

        {/* Contact Information Section */}
        <Stack className={sectionCardStyle(isDarkMode)}>
          <div className={sectionHeaderStyle(isDarkMode)}>
            <Icon iconName="Mail" style={{ fontSize: 24, color: colours.highlight }} />
            <Text variant="xLargePlus" styles={{ root: { fontWeight: 700, color: colours.highlight } }}>
              Contact Information
            </Text>
          </div>
          <div className={fieldGridStyle(2)}>
            {/* Email */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Email
              {isFieldMissing(formData.Email) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Email || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Email', newValue)}
                placeholder="Email"
                ariaLabel="Email"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Email || 'N/A'}</Text>
              </div>
            )}

            {/* Phone Number */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Phone Number
              {isFieldMissing(formData.Phone_Number) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Phone_Number || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Phone_Number', newValue)}
                placeholder="Phone Number"
                ariaLabel="Phone Number"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Phone_Number || 'N/A'}</Text>
              </div>
            )}

            {/* Secondary Phone */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Secondary Phone
              {isFieldMissing(formData.Secondary_Phone) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Secondary_Phone || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Secondary_Phone', newValue)}
                placeholder="Secondary Phone"
                ariaLabel="Secondary Phone"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Secondary_Phone || 'N/A'}</Text>
              </div>
            )}

            {/* Website */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Website
              {isFieldMissing(formData.Website) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Website || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Website', newValue)}
                placeholder="Website URL"
                ariaLabel="Website"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{renderLink(formData.Website)}</Text>
              </div>
            )}
          </div>
        </Stack>

        {/* Address Information Section */}
        <Stack className={sectionCardStyle(isDarkMode)}>
          <div className={sectionHeaderStyle(isDarkMode)}>
            <Icon iconName="MapPin" style={{ fontSize: 24, color: colours.highlight }} />
            <Text variant="xLargePlus" styles={{ root: { fontWeight: 700, color: colours.highlight } }}>
              Address Information
            </Text>
          </div>
          <div className={fieldGridStyle(2)}>
            {/* Unit/Building Name or Number */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Unit/Building Name or Number
              {isFieldMissing(formData.Unit_Building_Name_or_Number) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Unit_Building_Name_or_Number || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Unit_Building_Name_or_Number', newValue)}
                placeholder="Unit/Building Name or Number"
                ariaLabel="Unit/Building Name or Number"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Unit_Building_Name_or_Number || 'N/A'}</Text>
              </div>
            )}

            {/* Mailing Street */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Mailing Street
              {isFieldMissing(formData.Mailing_Street) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Mailing_Street || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Mailing_Street', newValue)}
                placeholder="Mailing Street"
                ariaLabel="Mailing Street"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Mailing_Street || 'N/A'}</Text>
              </div>
            )}

            {/* Mailing Street 2 */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Mailing Street 2
              {isFieldMissing(formData.Mailing_Street_2) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Mailing_Street_2 || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Mailing_Street_2', newValue)}
                placeholder="Mailing Street 2"
                ariaLabel="Mailing Street 2"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Mailing_Street_2 || 'N/A'}</Text>
              </div>
            )}

            {/* Mailing Street 3 */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Mailing Street 3
              {isFieldMissing(formData.Mailing_Street_3) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Mailing_Street_3 || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Mailing_Street_3', newValue)}
                placeholder="Mailing Street 3"
                ariaLabel="Mailing Street 3"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Mailing_Street_3 || 'N/A'}</Text>
              </div>
            )}

            {/* City */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              City
              {isFieldMissing(formData.City) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.City || ''} // Ensure string
                onChange={(_, newValue) => handleChange('City', newValue)}
                placeholder="City"
                ariaLabel="City"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.City || 'N/A'}</Text>
              </div>
            )}

            {/* Mailing County */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Mailing County
              {isFieldMissing(formData.Mailing_County) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Mailing_County || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Mailing_County', newValue)}
                placeholder="Mailing County"
                ariaLabel="Mailing County"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Mailing_County || 'N/A'}</Text>
              </div>
            )}

            {/* Postal Code */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Postal Code
              {isFieldMissing(formData.Postal_Code) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Postal_Code || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Postal_Code', newValue)}
                placeholder="Postal Code"
                ariaLabel="Postal Code"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Postal_Code || 'N/A'}</Text>
              </div>
            )}

            {/* Country */}
            <Text className={fieldLabelStyle(isDarkMode)}>
              Country
              {isFieldMissing(formData.Country) && (
                <Icon iconName="Error" className={missingDataIconStyle} aria-label="Missing data" />
              )}
            </Text>
            {isEditing ? (
              <BubbleTextField
                value={formData.Country || ''} // Ensure string
                onChange={(_, newValue) => handleChange('Country', newValue)}
                placeholder="Country"
                ariaLabel="Country"
                isDarkMode={isDarkMode}
              />
            ) : (
              <div className={fieldValueContainerStyle(isDarkMode)}>
                <Text>{formData.Country || 'N/A'}</Text>
              </div>
            )}
          </div>
        </Stack>
      </Stack>

      {/* Enquiry Details Section */}
      <Stack className={enquiryDetailsSectionStyle(isDarkMode)}>
        <div className={sectionHeaderStyle(isDarkMode)}>
          <Icon iconName="Info" style={{ fontSize: 24, color: colours.highlight }} />
          <Text variant="xLargePlus" styles={{ root: { fontWeight: 700, color: colours.highlight } }}>
            Enquiry Details
          </Text>
        </div>
        <div className={fieldGridStyle(2)}>
          {/* Area of Work */}
          <Text className={fieldLabelStyle(isDarkMode)}>Area of Work</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Area_of_Work || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Area_of_Work', newValue)}
              placeholder="Area of Work"
              ariaLabel="Area of Work"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Area_of_Work || 'N/A'}</Text>
            </div>
          )}

          {/* Employment */}
          <Text className={fieldLabelStyle(isDarkMode)}>Employment</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Employment || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Employment', newValue)}
              placeholder="Employment"
              ariaLabel="Employment"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Employment || 'N/A'}</Text>
            </div>
          )}

          {/* Type of Work */}
          <Text className={fieldLabelStyle(isDarkMode)}>Type of Work</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Type_of_Work || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Type_of_Work', newValue)}
              placeholder="Type of Work"
              ariaLabel="Type of Work"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Type_of_Work || 'N/A'}</Text>
            </div>
          )}

          {/* Divorce Consultation */}
          <Text className={fieldLabelStyle(isDarkMode)}>Divorce Consultation</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Divorce_Consultation || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Divorce_Consultation', newValue)}
              placeholder="Divorce Consultation"
              ariaLabel="Divorce Consultation"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Divorce_Consultation || 'N/A'}</Text>
            </div>
          )}

          {/* Method of Contact */}
          <Text className={fieldLabelStyle(isDarkMode)}>Method of Contact</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Method_of_Contact || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Method_of_Contact', newValue)}
              placeholder="Method of Contact"
              ariaLabel="Method of Contact"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Method_of_Contact || 'N/A'}</Text>
            </div>
          )}

          {/* Web Form */}
          <Text className={fieldLabelStyle(isDarkMode)}>Web Form</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Web_Form || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Web_Form', newValue)}
              placeholder="Web Form"
              ariaLabel="Web Form"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Web_Form || 'N/A'}</Text>
            </div>
          )}

          {/* Point of Contact */}
          <Text className={fieldLabelStyle(isDarkMode)}>Point of Contact</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Point_of_Contact || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Point_of_Contact', newValue)}
              placeholder="Point of Contact"
              ariaLabel="Point of Contact"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Point_of_Contact || 'N/A'}</Text>
            </div>
          )}

          {/* Email */}
          <Text className={fieldLabelStyle(isDarkMode)}>Email</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Email || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Email', newValue)}
              placeholder="Email"
              ariaLabel="Email"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Email || 'N/A'}</Text>
            </div>
          )}

          {/* Tags */}
          <Text className={fieldLabelStyle(isDarkMode)}>Tags</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Tags || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Tags', newValue)}
              placeholder="Tags (comma separated)"
              ariaLabel="Tags"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Tags || 'N/A'}</Text>
            </div>
          )}

          {/* Gift Rank */}
          <Text className={fieldLabelStyle(isDarkMode)}>Gift Rank</Text>
          {isEditing ? (
            <BubbleTextField
              type="number"
              value={formData.Gift_Rank !== undefined ? formData.Gift_Rank.toString() : ''} // Ensure string
              onChange={(_, newValue) =>
                handleChange('Gift_Rank', newValue ? parseInt(newValue, 10) : undefined)
              }
              placeholder="Gift Rank"
              ariaLabel="Gift Rank"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Gift_Rank !== undefined ? formData.Gift_Rank : 'N/A'}</Text>
            </div>
          )}

          {/* Matter Reference */}
          <Text className={fieldLabelStyle(isDarkMode)}>Matter Reference</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Matter_Ref || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Matter_Ref', newValue)}
              placeholder="Matter Reference"
              ariaLabel="Matter Reference"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Matter_Ref || 'N/A'}</Text>
            </div>
          )}

          {/* Value */}
          <Text className={fieldLabelStyle(isDarkMode)}>Value</Text>
          {isEditing ? (
            <BubbleTextField
              type="text"
              value={formData.Value || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Value', newValue)}
              placeholder="Value in GBP"
              ariaLabel="Value"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Value || 'N/A'}</Text>
            </div>
          )}

          {/* Call Taker */}
          <Text className={fieldLabelStyle(isDarkMode)}>Call Taker</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Call_Taker || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Call_Taker', newValue)}
              placeholder="Call Taker"
              ariaLabel="Call Taker"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Call_Taker || 'N/A'}</Text>
            </div>
          )}

          {/* Ultimate Source */}
          <Text className={fieldLabelStyle(isDarkMode)}>Ultimate Source</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Ultimate_Source || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Ultimate_Source', newValue)}
              placeholder="Ultimate Source"
              ariaLabel="Ultimate Source"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Ultimate_Source || 'N/A'}</Text>
            </div>
          )}

          {/* Contact Referrer */}
          <Text className={fieldLabelStyle(isDarkMode)}>Contact Referrer</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Contact_Referrer || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Contact_Referrer', newValue)}
              placeholder="Contact Referrer"
              ariaLabel="Contact Referrer"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Contact_Referrer || 'N/A'}</Text>
            </div>
          )}

          {/* Referring Company */}
          <Text className={fieldLabelStyle(isDarkMode)}>Referring Company</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Referring_Company || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Referring_Company', newValue)}
              placeholder="Referring Company"
              ariaLabel="Referring Company"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Referring_Company || 'N/A'}</Text>
            </div>
          )}

          {/* Other Referrals */}
          <Text className={fieldLabelStyle(isDarkMode)}>Other Referrals</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Other_Referrals || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Other_Referrals', newValue)}
              placeholder="Other Referrals"
              ariaLabel="Other Referrals"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Other_Referrals || 'N/A'}</Text>
            </div>
          )}

          {/* Referral URL */}
          <Text className={fieldLabelStyle(isDarkMode)}>Referral URL</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Referral_URL || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Referral_URL', newValue)}
              placeholder="Referral URL"
              ariaLabel="Referral URL"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{renderLink(formData.Referral_URL)}</Text>
            </div>
          )}

          {/* Campaign */}
          <Text className={fieldLabelStyle(isDarkMode)}>Campaign</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Campaign || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Campaign', newValue)}
              placeholder="Campaign"
              ariaLabel="Campaign"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Campaign || 'N/A'}</Text>
            </div>
          )}

          {/* Ad Group */}
          <Text className={fieldLabelStyle(isDarkMode)}>Ad Group</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Ad_Group || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Ad_Group', newValue)}
              placeholder="Ad Group"
              ariaLabel="Ad Group"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Ad_Group || 'N/A'}</Text>
            </div>
          )}

          {/* Search Keyword */}
          <Text className={fieldLabelStyle(isDarkMode)}>Search Keyword</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Search_Keyword || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Search_Keyword', newValue)}
              placeholder="Search Keyword"
              ariaLabel="Search Keyword"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Search_Keyword || 'N/A'}</Text>
            </div>
          )}

          {/* GCLID */}
          <Text className={fieldLabelStyle(isDarkMode)}>GCLID</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.GCLID || ''} // Ensure string
              onChange={(_, newValue) => handleChange('GCLID', newValue)}
              placeholder="GCLID"
              ariaLabel="GCLID"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.GCLID || 'N/A'}</Text>
            </div>
          )}

          {/* Initial First Call Notes */}
          <Text className={fieldLabelStyle(isDarkMode)}>Initial First Call Notes</Text>
          {isEditing ? (
            <BubbleTextField
              multiline
              value={formData.Initial_first_call_notes || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Initial_first_call_notes', newValue)}
              placeholder="Initial First Call Notes"
              ariaLabel="Initial First Call Notes"
              isDarkMode={isDarkMode}
              minHeight="100px"
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Initial_first_call_notes || 'N/A'}</Text>
            </div>
          )}

          {/* Do Not Market */}
          <Text className={fieldLabelStyle(isDarkMode)}>Do Not Market</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Do_not_Market || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Do_not_Market', newValue)}
              placeholder="Do Not Market"
              ariaLabel="Do Not Market"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Do_not_Market || 'N/A'}</Text>
            </div>
          )}

          {/* IP Address */}
          <Text className={fieldLabelStyle(isDarkMode)}>IP Address</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.IP_Address || ''} // Ensure string
              onChange={(_, newValue) => handleChange('IP_Address', newValue)}
              placeholder="IP Address"
              ariaLabel="IP Address"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.IP_Address || 'N/A'}</Text>
            </div>
          )}

          {/* TDMY */}
          <Text className={fieldLabelStyle(isDarkMode)}>TDMY</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.TDMY || ''} // Ensure string
              onChange={(_, newValue) => handleChange('TDMY', newValue)}
              placeholder="TDMY"
              ariaLabel="TDMY"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.TDMY || 'N/A'}</Text>
            </div>
          )}

          {/* TDN */}
          <Text className={fieldLabelStyle(isDarkMode)}>TDN</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.TDN || ''} // Ensure string
              onChange={(_, newValue) => handleChange('TDN', newValue)}
              placeholder="TDN"
              ariaLabel="TDN"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.TDN || 'N/A'}</Text>
            </div>
          )}

          {/* POC Name */}
          <Text className={fieldLabelStyle(isDarkMode)}>POC Name</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.pocname || ''} // Ensure string
              onChange={(_, newValue) => handleChange('pocname', newValue)}
              placeholder="POC Name"
              ariaLabel="POC Name"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.pocname || 'N/A'}</Text>
            </div>
          )}

          {/* Rating */}
          <Text className={fieldLabelStyle(isDarkMode)}>Rating</Text>
          {isEditing ? (
            <BubbleTextField
              value={formData.Rating || ''} // Ensure string
              onChange={(_, newValue) => handleChange('Rating', newValue)}
              placeholder="Rating"
              ariaLabel="Rating"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className={fieldValueContainerStyle(isDarkMode)}>
              <Text>{formData.Rating || 'N/A'}</Text>
            </div>
          )}
        </div>
      </Stack>

      {/* Action Buttons */}
      <Stack className={buttonGroupStyle(isEditing, isDarkMode)}>
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
                  width: '150px', // Standard width
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
                  width: '150px', // Standard width
                  selectors: {
                    ':hover': {
                      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
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
                width: '150px', // Standard width
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

      {/* Success Message */}
      {isSuccessVisible && (
        <MessageBar
          messageBarType={MessageBarType.success}
          isMultiline={false}
          onDismiss={() => setIsSuccessVisible(false)}
          dismissButtonAriaLabel="Close"
          styles={{ root: { borderRadius: '4px', width: '100%' } }}
        >
          {isEditing ? 'Details updated successfully!' : 'Rating submitted successfully!'}
        </MessageBar>
      )}

      {/* Error Message */}
      {isErrorVisible && (
        <MessageBar
          messageBarType={MessageBarType.error}
          isMultiline={false}
          onDismiss={() => setIsErrorVisible(false)}
          dismissButtonAriaLabel="Close"
          styles={{ root: { borderRadius: '4px', width: '100%' } }}
        >
          {errorMessage}
        </MessageBar>
      )}
    </Stack>
  );
};

export default EnquiryDetails;
