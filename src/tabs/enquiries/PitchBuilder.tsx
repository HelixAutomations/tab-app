// src/tabs/enquiries/PitchBuilder.tsx

import React, { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Dropdown,
  IDropdownOption,
  PrimaryButton,
  DefaultButton,
  Separator,
  mergeStyles,
  Panel,
  PanelType,
  Label,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { Enquiry } from '../../app/functionality/FeContext';
import { colours } from '../../app/styles/colours';
import BubbleTextField from '../../app/styles/BubbleTextField'; // Ensure this path is correct
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme
import PracticeAreaPitch, { PracticeAreaPitchType } from '../../app/customisation/PracticeAreaPitch'; // Import the Practice Area Templates and types
import { templateBlocks, TemplateBlock, TemplateOption } from '../../app/customisation/TemplateBlocks'; // Corrected import path
import { availableAttachments, AttachmentOption } from '../../app/customisation/Attachments'; // Import attachments

interface PitchBuilderProps {
  enquiry: Enquiry;
}

// Common input style
const commonInputStyle = {
  height: '40px',
  lineHeight: '40px',
};

const standardPadding = '10px'; // Define consistent padding

const buttonHoverStyle = {
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', // Enhanced shadow
  transform: 'translateY(-2px)', // Lift effect
};

// Styles for attachment tags
const attachmentTagStyle = (isSelected: boolean, isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isSelected
      ? colours.cta
      : isDarkMode
      ? colours.dark.sectionBackground
      : colours.light.sectionBackground,
    color: isSelected
      ? '#ffffff'
      : isDarkMode
      ? colours.dark.text
      : colours.light.text,
    border: `1px solid ${
      isDarkMode ? colours.dark.cardHover : colours.light.cardHover
    }`,
    borderRadius: '12px',
    padding: '6px 12px',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: '100px',
    textAlign: 'center',
    ':hover': {
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', // Enhanced shadow
      transform: 'translateY(-2px)', // Lift effect
      border: '1px solid red', // Thin red border
      backgroundColor: isSelected
        ? colours.cta
        : isDarkMode
        ? colours.dark.cardHover
        : colours.light.cardHover,
      color: '#ffffff',
    },
    transition: 'all 0.2s',
  });

// Styles for follow-up tags
const followUpTagStyle = (isSelected: boolean, isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isSelected
      ? colours.cta
      : isDarkMode
      ? colours.dark.sectionBackground
      : colours.light.sectionBackground,
    color: isSelected
      ? '#ffffff'
      : isDarkMode
      ? colours.dark.text
      : colours.light.text,
    border: `1px solid ${
      isDarkMode ? colours.dark.cardHover : colours.light.cardHover
    }`,
    borderRadius: '12px',
    padding: '6px 12px',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: '80px',
    textAlign: 'center',
    ':hover': {
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', // Enhanced shadow
      transform: 'translateY(-2px)', // Lift effect
      border: '1px solid red', // Thin red border
      backgroundColor: isSelected
        ? colours.cta
        : isDarkMode
        ? colours.dark.cardHover
        : colours.light.cardHover,
      color: '#ffffff',
    },
    transition: 'all 0.2s',
  });

// Styles for template blocks
const templateBlockStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'background-color 0.2s, box-shadow 0.2s',
    backgroundColor: isDarkMode
      ? colours.dark.cardBackground
      : colours.light.cardBackground,
    ':hover': {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    },
  });

// Styles for preview text within template blocks
const templatePreviewStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '10px',
    borderRadius: '4px',
    overflow: 'hidden',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    backgroundColor: '#f0f0f0',
    textAlign: 'left',
    marginTop: '10px',
    fontSize: '14px',
  });

// Function to escape regex special characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function to replace placeholders in the email body
const replacePlaceholders = (template: string, enquiry: Enquiry): string => {
  return template
    // Replace dynamic variables like [Enquiry.First_Name]
    .replace(
      /\[Enquiry.First_Name\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;">${
        enquiry.First_Name || 'there'
      }</span>`
    )
    .replace(
      /\[Enquiry.Point_of_Contact\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;">${
        enquiry.Point_of_Contact || 'Our Team'
      }</span>`
    )
    .replace(
      /\[practice_area\]/g,
      `<span style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${
        enquiry.Area_of_Work || '[practice_area]'
      }</span>`
    )
    // Wrap other placeholders with data-placeholder for reliable targeting
    .replace(
      /\[(Scope Placeholder|Fee Option Placeholder|Required Documents Placeholder|Meeting Link Placeholder|Google Review Placeholder|Payment Link Placeholder)\]/g,
      (match) =>
        `<span data-placeholder="${match}" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${match}</span>`
    );
};

// Type Guard Function to check if a value is a string array
const isStringArray = (value: string | string[]): value is string[] => {
  return Array.isArray(value);
};

const PitchBuilder: React.FC<PitchBuilderProps> = ({ enquiry }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const [template, setTemplate] = useState<string | undefined>(undefined);
  const capitalizeWords = (str: string): string =>
    str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  
  const [subject, setSubject] = useState<string>(
    enquiry.Area_of_Work
      ? `Your ${capitalizeWords(enquiry.Area_of_Work)} Enquiry`
      : 'Your Enquiry'
  );
  const normalizeBody = (text: string) =>
    text
      .split('\n') // Split the text into lines
      .map((line) => line.trim()) // Remove leading/trailing spaces from each line
      .join('\n'); // Rejoin the lines with proper line breaks

  const [body, setBody] = useState<string>(
    normalizeBody(
      replacePlaceholders(
        `Dear [Enquiry.First_Name],

Thank you for reaching out regarding [practice_area]. We're well-placed to assist you.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Meeting Link Placeholder]

[Google Review Placeholder]

[Payment Link Placeholder]

Kind regards,
[Enquiry.Point_of_Contact]`,
        enquiry
      )
    )
  );
  const [attachments, setAttachments] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState<string | undefined>(undefined); // State for follow-up
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // State to track selected options and their previews for each Template Block
  const [selectedTemplateOptions, setSelectedTemplateOptions] = useState<{
    [key: string]: string | string[];
  }>({});

  // Function to normalize strings (e.g., capitalize each word)
  const normalizeString = (str: string): string => {
    return str
      .toLowerCase()
      .split(' ')
      .map(
        (word) => word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join(' ');
  };

  // Function to extract matching practice areas based on area_of_work
  const getMatchingPracticeAreas = (area: string): string[] => {
    const normalizedArea = normalizeString(area);
    const practiceAreas = Object.keys(
      PracticeAreaPitch
    ) as Array<keyof PracticeAreaPitchType>;

    // Find practice areas that match the normalizedArea
    const matchingPracticeAreas = practiceAreas.filter((pa) => {
      return pa.toLowerCase() === normalizedArea.toLowerCase();
    });

    // If no direct match, default to 'Miscellaneous (None of the above)'
    return matchingPracticeAreas.length > 0
      ? matchingPracticeAreas
      : ['Miscellaneous (None of the above)'];
  };

  // Helper to get the selected practice area based on Area_of_Work
  const getSelectedPracticeArea = (): keyof PracticeAreaPitchType => {
    const normalizedArea = normalizeString(enquiry.Area_of_Work.trim());
    const matchingPracticeAreas = getMatchingPracticeAreas(normalizedArea);
    // Ensure the first matching practice area is a valid key or default to 'Miscellaneous (None of the above)'
    return (
      (matchingPracticeAreas[0] as keyof PracticeAreaPitchType) ||
      'Miscellaneous (None of the above)'
    );
  };

  // Generate Template Options based on Area_of_Work
  const templateOptions: IDropdownOption[] = (() => {
    const selectedPracticeArea = getSelectedPracticeArea();

    // Get templates for the selected practice area
    const templates = PracticeAreaPitch[selectedPracticeArea];

    // Handle case where no templates are found for the practice area
    if (!templates) {
      return [];
    }

    return Object.keys(templates).map((tpl) => ({
      key: tpl,
      text: tpl,
    }));
  })();

  // Function to replace placeholders and insert template blocks
  const insertTemplateBlock = (
    block: TemplateBlock,
    selectedOption: string | string[]
  ) => {
    let replacementText = '';
  
    if (block.isMultiSelect && isStringArray(selectedOption)) {
      // Insert as a bullet list
      replacementText = `<ul>${selectedOption
        .map((item) => `<li>${item}</li>`)
        .join('')}</ul>`;
    } else if (!block.isMultiSelect && typeof selectedOption === 'string') {
      // Find the corresponding previewText
      const option = block.options.find((o) => o.label === selectedOption);
      replacementText = option ? option.previewText : '';
    }
  
    // Wrap inserted content in a yellow-highlighted span
    const highlightedReplacement = `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;">${replacementText}</span>`;
  
    // Replace the content inside the span with the matching data-placeholder
    setBody((prevBody) =>
      prevBody.replace(
        new RegExp(
          `(<span[^>]*data-placeholder="${escapeRegExp(
            block.placeholder
          )}"[^>]*>)(.*?)(</span>)`,
          'g'
        ),
        `$1${highlightedReplacement}$3`
      )
    );
  };

  // Handle template change by replacing placeholders in the body
  const handleTemplateChange = (
    _: React.FormEvent<HTMLDivElement>,
    option?: IDropdownOption
  ) => {
    if (option) {
      setTemplate(option.key as string);
      const selectedPracticeArea = getSelectedPracticeArea();
      const selectedTemplate =
        PracticeAreaPitch[selectedPracticeArea][option.key as string];
      if (selectedTemplate) {
        // Dynamically include Area_of_Work in the subject
        const areaOfWork = enquiry.Area_of_Work.trim() || 'Practice Area';
        setSubject(`Your ${areaOfWork} Enquiry`);
  
        // Replace placeholders, including updating [practice_area]
        const updatedBody = replacePlaceholders(
          selectedTemplate.body.replace('[practice_area]', selectedPracticeArea),
          enquiry
        );
  
        // Trim unintended leading newlines or whitespace
        setBody(updatedBody.trimStart());
      }
    }
  };

  // Function to toggle attachment selection
  const toggleAttachment = (attachmentKey: string) => {
    setAttachments((prev) =>
      prev.includes(attachmentKey)
        ? prev.filter((key) => key !== attachmentKey)
        : [...prev, attachmentKey]
    );
  };

  const getFilteredAttachments = (): AttachmentOption[] => {
    const selectedPracticeArea = getSelectedPracticeArea(); // Get the matching practice area dynamically
    return availableAttachments.filter(
      (attachment) =>
        !attachment.applicableTo || attachment.applicableTo.includes(selectedPracticeArea) // Show all universal and relevant ones
    );
  };

  // Function to toggle preview panel
  const togglePreview = () => {
    setIsPreviewOpen(!isPreviewOpen);
  };

  const getPlainTextBody = (htmlBody: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlBody;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  // Function to reset the form
  const resetForm = () => {
    setTemplate(undefined);
    setSubject('Your Practice Area Enquiry');
    setBody(
      normalizeBody(
        replacePlaceholders(
          `Dear [Enquiry.First_Name],

Thank you for reaching out regarding [practice_area]. We're well-placed to assist you.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Meeting Link Placeholder]

[Google Review Placeholder]

[Payment Link Placeholder]

Kind regards,
[Enquiry.Point_of_Contact]`,
          enquiry
        )
      )
    );
    setAttachments([]);
    setFollowUp(undefined); // Reset follow-up
    setIsPreviewOpen(false);
    setIsErrorVisible(false);
    setErrorMessage('');
    setSelectedTemplateOptions({}); // Reset selected options
  };

  // Function to validate the form
  const validateForm = (): boolean => {
    if (!subject.trim()) {
      setErrorMessage('Subject cannot be empty.');
      setIsErrorVisible(true);
      return false;
    }
    if (!body.trim()) {
      setErrorMessage('Email body cannot be empty.');
      setIsErrorVisible(true);
      return false;
    }
    setIsErrorVisible(false);
    setErrorMessage('');
    return true;
  };

  // Function to send email
  const sendEmail = () => {
    if (validateForm()) {
      // Prepare follow up text
      const followUpText = followUp
        ? `\n\nFollow Up: ${followUpOptions.find(
            (opt) => opt.key === followUp
          )?.text}`
        : '';

      // Placeholder for actual email sending logic
      console.log('Email Sent:', {
        subject,
        body: body + followUpText,
        attachments,
        followUp,
      });
      setIsSuccessVisible(true);
      resetForm();
    }
  };

  // Automatically hide success message after 3 seconds
  useEffect(() => {
    if (isSuccessVisible) {
      const timer = setTimeout(() => setIsSuccessVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccessVisible]);

  // Automatically hide error message after 5 seconds
  useEffect(() => {
    if (isErrorVisible) {
      const timer = setTimeout(() => setIsErrorVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isErrorVisible]);

  // Define follow-up options
  const followUpOptions: IDropdownOption[] = [
    { key: '1_day', text: '1 day' },
    { key: '2_days', text: '2 days' },
    { key: '3_days', text: '3 days' },
    { key: '7_days', text: '7 days' },
    { key: '14_days', text: '14 days' },
    { key: '30_days', text: '30 days' },
  ];

  // Function to handle selecting options in multi-select blocks
  const handleMultiSelectChange = (
    blockTitle: string,
    selectedOptions: string[]
  ) => {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOptions,
    }));
  };

  // Function to handle selecting options in single-select blocks
  const handleSingleSelectChange = (
    blockTitle: string,
    selectedOption: string
  ) => {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOption,
    }));
  };

  // Styles
  const containerStyle = mergeStyles({
    padding: '30px',
    backgroundColor: isDarkMode
      ? colours.dark.background
      : colours.light.background,
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? '0 4px 12px rgba(255, 255, 255, 0.1)'
      : '0 4px 12px rgba(0, 0, 0, 0.1)',
    width: '100%',
    margin: '0 auto',
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    flexDirection: 'row',
    gap: '20px',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  });

  const formContainerStyle = mergeStyles({
    flex: '0 0 48%', // Approximately 50% width
    minWidth: '300px', // Ensures usability on very small screens
  });

  const templatesContainerStyle = mergeStyles({
    flex: '0 0 48%', // Approximately 50% width
    display: 'flex',
    flexDirection: 'column',
    gap: '20px', // Space between label and grid
  });

  const templatesGridStyle = mergeStyles({
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)', // Two columns
    gap: '20px',
    '@media (max-width: 1200px)': {
      gridTemplateColumns: 'repeat(1, 1fr)', // Single column on medium screens
    },
    '@media (max-width: 800px)': {
      gridTemplateColumns: '1fr', // Single column on small screens
    },
    maxHeight: '80vh', // Optional: to prevent overflow
    overflowY: 'auto', // Optional: scroll if content overflows
  });

  const sectionHeaderStyle = mergeStyles({
    fontSize: '18px',
    fontWeight: '600',
    color: colours.highlight,
    marginBottom: '8px',
  });

  const buttonGroupStyle = mergeStyles({
    gap: '15px',
    marginTop: '20px',
    width: '100%', // Ensures the button group takes full width for alignment
  });

  const panelStyle = mergeStyles({
    padding: '20px',
    backgroundImage: `url('https://helix-law.co.uk/wp-content/uploads/2023/09/Asset-2-2.png')`,
    backgroundSize: 'cover',
    backgroundPosition: 'top left',
    backgroundRepeat: 'no-repeat',
    backgroundColor: isDarkMode
      ? 'rgba(30, 30, 30, 0.9)'
      : 'rgba(240, 242, 245, 0.9)',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: '8px',
  });

  const labelStyle = mergeStyles({
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

  return (
    <Stack className={containerStyle}>
      {/* Left Section: Pitch Builder Form */}
      <Stack className={formContainerStyle} tokens={{ childrenGap: 20 }}>
        {/* Form Header */}
        <Text
          variant="xLarge"
          styles={{ root: { fontWeight: '700', color: colours.highlight } }}
        >
          Pitch Builder
        </Text>

        {/* Template Selection */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Select Template</Label>
          <Dropdown
            placeholder="Choose a template"
            options={templateOptions}
            onChange={handleTemplateChange}
            selectedKey={template}
            styles={{
              dropdown: { width: '100%' },
              title: {
                ...commonInputStyle,
                padding: '0 15px', // Set left padding to match BubbleTextField
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                maxWidth: '200px', // Set max width to prevent overflow
                overflow: 'hidden', // Hide overflow text
                textOverflow: 'ellipsis', // Show ellipsis for overflowing text
                whiteSpace: 'nowrap', // Prevent text from wrapping
                selectors: {
                  ':hover': {
                    backgroundColor: isDarkMode
                      ? colours.dark.cardHover
                      : colours.light.cardHover,
                  },
                },
              },
              dropdownItem: {
                selectors: {
                  ':hover': {
                    backgroundColor: isDarkMode
                      ? colours.dark.cardHover
                      : colours.light.cardHover,
                  },
                },
              },
              callout: {
                boxShadow: isDarkMode
                  ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                  : '0 2px 5px rgba(0, 0, 0, 0.1)',
              },
              root: {
                border: 'none',
                borderRadius: '8px',
                backgroundColor: isDarkMode
                  ? colours.dark.sectionBackground
                  : '#ffffff',
                boxShadow: isDarkMode
                  ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                  : '0 2px 5px rgba(0, 0, 0, 0.1)',
              },
            }}
            ariaLabel="Select Template"
          />
        </Stack>

        {/* Subject Input */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Email Subject</Label>
          <BubbleTextField
            value={subject}
            onChange={(
              _: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
              newValue?: string
            ) => setSubject(newValue || '')}
            placeholder="Enter email subject"
            ariaLabel="Email Subject"
            isDarkMode={isDarkMode}
          />
        </Stack>

        {/* Body Input */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Email Body</Label>
          <div
            contentEditable
            style={{
              minHeight: '150px',
              padding: '20px 20px', // Match padding with BubbleTextField
              borderRadius: '8px',
              border: `1px solid ${
                isDarkMode ? colours.dark.cardHover : colours.light.cardHover
              }`,
              backgroundColor: isDarkMode
                ? colours.dark.sectionBackground
                : '#ffffff',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
            }}
            dangerouslySetInnerHTML={{
              __html: body.replace(/\n/g, '<br>'),
            }}
            onInput={(e) =>
              setBody(
                (e.target as HTMLDivElement).innerHTML.replace(/<br>/g, '\n')
              )
            }
            aria-label="Email Body Editor"
          />
        </Stack>

        {/* Attachments Selection */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Select Attachments</Label>
          <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
            {getFilteredAttachments().map((attachment: AttachmentOption) => {
              const isSelected = attachments.includes(attachment.key);
              return (
                <span
                  key={attachment.key}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    minWidth: '100px',
                    textAlign: 'center',
                    backgroundColor: isSelected
                      ? colours.cta
                      : isDarkMode
                      ? colours.dark.sectionBackground
                      : colours.light.sectionBackground,
                    color: isSelected
                      ? '#ffffff'
                      : isDarkMode
                      ? colours.dark.text
                      : colours.light.text,
                    border: `1px solid ${
                      isDarkMode ? colours.dark.cardHover : colours.light.cardHover
                    }`,
                    transition: 'background-color 0.2s, color 0.2s',
                  }}
                  onClick={() => toggleAttachment(attachment.key)}
                >
                  {attachment.text}
                </span>
              );
            })}
          </Stack>
        </Stack>


        {/* Follow Up Selection */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Follow Up</Label>
          <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
            {followUpOptions.map((option: IDropdownOption) => {
              const isSelected = followUp === option.key;
              return (
                <span
                  key={option.key}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    minWidth: '80px',
                    textAlign: 'center',
                    backgroundColor: isSelected
                      ? colours.cta
                      : isDarkMode
                      ? colours.dark.sectionBackground
                      : colours.light.sectionBackground,
                    color: isSelected
                      ? '#ffffff'
                      : isDarkMode
                      ? colours.dark.text
                      : colours.light.text,
                    border: `1px solid ${
                      isDarkMode ? colours.dark.cardHover : colours.light.cardHover
                    }`,
                    transition: 'background-color 0.2s, color 0.2s',
                  }}
                  onClick={() =>
                    setFollowUp(isSelected ? undefined : (option.key as string))
                  }
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = isDarkMode
                      ? colours.dark.cardHover
                      : colours.light.cardHover)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = isSelected
                      ? colours.cta
                      : isDarkMode
                      ? colours.dark.sectionBackground
                      : colours.light.sectionBackground)
                  }
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e: React.KeyboardEvent<HTMLSpanElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setFollowUp(isSelected ? undefined : (option.key as string));
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-label={`Set follow up to ${option.text}`}
                >
                  {option.text}
                </span>
              );
            })}
          </Stack>
        </Stack>

        {/* Error Message */}
        {isErrorVisible && (
          <MessageBar
            messageBarType={MessageBarType.error}
            isMultiline={false}
            onDismiss={() => setIsErrorVisible(false)}
            dismissButtonAriaLabel="Close"
            styles={{ root: { borderRadius: '4px' } }}
          >
            {errorMessage}
          </MessageBar>
        )}

        <Separator />

        {/* Button Group: Preview and Send on the left, Reset on the right */}
        <Stack
          horizontal
          horizontalAlign="space-between"
          className={buttonGroupStyle}
        >
          <Stack horizontal tokens={{ childrenGap: 15 }}>
            <PrimaryButton
              text="Preview Email"
              onClick={togglePreview}
              styles={{
                root: {
                  backgroundColor: colours.cta,
                  borderRadius: '8px',
                  border: 'none',
                  width: '240px',
                  selectors: {
                    ':hover': {
                      backgroundColor: colours.red,
                    },
                    ':focus': {
                      outline: 'none',
                      border: 'none',
                      boxShadow:
                        '0 0 0 2px rgba(255, 255, 255, 0.5)',
                    },
                    ':active': {
                      backgroundColor: colours.red,
                      border: 'none',
                    },
                  },
                },
                label: {
                  color: 'white',
                  fontWeight: '600',
                },
              }}
              ariaLabel="Preview Email"
              iconProps={{ iconName: 'Preview' }}
            />

            <PrimaryButton
              text="Send Email"
              onClick={sendEmail}
              styles={{
                root: {
                  backgroundColor: colours.cta,
                  borderRadius: '8px',
                  border: 'none',
                  width: '240px',
                  selectors: {
                    ':hover': {
                      backgroundColor: colours.red,
                    },
                    ':focus': {
                      outline: 'none',
                      border: 'none',
                      boxShadow:
                        '0 0 0 2px rgba(255, 255, 255, 0.5)',
                    },
                    ':active': {
                      backgroundColor: colours.red,
                      border: 'none',
                    },
                  },
                },
                label: {
                  color: 'white',
                  fontWeight: '600',
                },
              }}
              ariaLabel="Send Email"
              iconProps={{ iconName: 'Mail' }}
            />
          </Stack>

          <DefaultButton
            text="Reset"
            onClick={resetForm}
            styles={{
              root: {
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                width: '160px',
                cursor: 'pointer',
                backgroundColor: isDarkMode
                  ? colours.dark.sectionBackground
                  : colours.light.sectionBackground,
                color: colours.greyText,
                fontWeight: '600',
                transition: 'all 0.2s',
              },
              rootHovered: {
                ...buttonHoverStyle, // Apply hover styles
                backgroundColor: isDarkMode
                  ? colours.dark.cardHover
                  : colours.light.cardHover,
              },
            }}
            ariaLabel="Reset Form"
            iconProps={{ iconName: 'Refresh' }}
          />
        </Stack>

        {/* Success Message */}
        {isSuccessVisible && (
          <MessageBar
            messageBarType={MessageBarType.success}
            isMultiline={false}
            onDismiss={() => setIsSuccessVisible(false)}
            dismissButtonAriaLabel="Close"
            styles={{ root: { borderRadius: '4px' } }}
          >
            Email sent successfully!
          </MessageBar>
        )}

        {/* Email Preview Panel */}
        <Panel
          isOpen={isPreviewOpen}
          onDismiss={togglePreview}
          type={PanelType.largeFixed}
          headerText="Email Preview"
          closeButtonAriaLabel="Close"
          styles={{
            main: {
              padding: '20px',
              backgroundImage: `url('https://helix-law.co.uk/wp-content/uploads/2023/09/Asset-2-2.png')`,
              backgroundSize: 'cover',
              backgroundPosition: 'top left',
              backgroundRepeat: 'no-repeat',
              backgroundColor: isDarkMode
                ? 'rgba(30, 30, 30, 0.9)'
                : 'rgba(240, 242, 245, 0.9)',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              borderRadius: '8px',
            },
          }}
        >
          <Stack tokens={{ childrenGap: 15 }}>
            <Stack tokens={{ childrenGap: 6 }}>
              <Text
                variant="large"
                styles={{
                  root: { fontWeight: '600', color: colours.highlight },
                }}
              >
                Subject:
              </Text>
              <Text
                variant="medium"
                styles={{ root: { whiteSpace: 'pre-wrap' } }}
              >
                {subject || 'N/A'}
              </Text>
            </Stack>
            <Separator />
            <Stack tokens={{ childrenGap: 6 }}>
              <Text
                variant="large"
                styles={{
                  root: { fontWeight: '600', color: colours.highlight },
                }}
              >
                Body:
              </Text>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {getPlainTextBody(body) || 'N/A'}
              </div>
            </Stack>
            {attachments.length > 0 && (
              <>
                <Separator />
                <Stack tokens={{ childrenGap: 6 }}>
                  <Text
                    variant="large"
                    styles={{
                      root: { fontWeight: '600', color: colours.highlight },
                    }}
                  >
                    Attachments:
                  </Text>
                  <Stack tokens={{ childrenGap: 5 }}>
                    {attachments.map((att: string) => (
                      <Text key={att} variant="medium">
                        -{' '}
                        {
                          availableAttachments.find(
                            (option) => option.key === att
                          )?.text
                        }
                      </Text>
                    ))}
                  </Stack>
                </Stack>
              </>
            )}
            {followUp && (
              <>
                <Separator />
                <Stack tokens={{ childrenGap: 6 }}>
                  <Text
                    variant="large"
                    styles={{
                      root: { fontWeight: '600', color: colours.highlight },
                    }}
                  >
                    Follow Up:
                  </Text>
                  <Text variant="medium">
                    {followUpOptions.find((opt) => opt.key === followUp)?.text}
                  </Text>
                </Stack>
              </>
            )}
          </Stack>
        </Panel>
      </Stack>

      {/* Right Section: Template Blocks */}
      <Stack className={templatesContainerStyle}>
        {/* Template Blocks Label */}
        <Text
          variant="xLarge"
          styles={{
            root: { fontWeight: '700', color: colours.highlight },
          }}
        >
          Template Blocks
        </Text>
        {/* Grid Container for Template Blocks */}
        <Stack className={templatesGridStyle}>
          {/* Display template blocks without category labels */}
          {templateBlocks.map((block: TemplateBlock) => (
            <Stack
              key={block.title}
              className={templateBlockStyle(isDarkMode)}
              role="button"
              tabIndex={0}
              onClick={() => {
                const selectedOption = selectedTemplateOptions[block.title];
                if (selectedOption) {
                  insertTemplateBlock(block, selectedOption);
                }
              }}
              onKeyPress={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const selectedOption = selectedTemplateOptions[block.title];
                  if (selectedOption) {
                    insertTemplateBlock(block, selectedOption);
                  }
                }
              }}
              aria-label={`Insert template block ${block.title}`}
            >
              <Stack tokens={{ childrenGap: 10 }}>
                <Text
                  variant="mediumPlus"
                  styles={{
                    root: { fontWeight: '600', color: colours.highlight },
                  }}
                >
                  {block.title}
                </Text>
                <Text
                  variant="small"
                  styles={{
                    root: {
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                    },
                  }}
                >
                  {block.description}
                </Text>
                {/* Selection and Preview */}
                {block.isMultiSelect ? (
                  <>
                    <Dropdown
                      placeholder="Select documents"
                      multiSelect
                      options={block.options.map((option: TemplateOption) => ({
                        key: option.label,
                        text: option.label,
                      }))}
                      onChange={(
                        _: React.FormEvent<HTMLDivElement>,
                        option?: IDropdownOption
                      ) => {
                        if (option) {
                          const selectedOptions =
                            (selectedTemplateOptions[block.title] as string[]) || [];
                          if (option.selected) {
                            handleMultiSelectChange(block.title, [
                              ...selectedOptions,
                              option.key as string,
                            ]);
                          } else {
                            handleMultiSelectChange(
                              block.title,
                              selectedOptions.filter(
                                (key) => key !== option.key
                              )
                            );
                          }
                        }
                      }}
                      selectedKeys={
                        Array.isArray(selectedTemplateOptions[block.title])
                          ? (selectedTemplateOptions[block.title] as string[])
                          : undefined
                      }
                      styles={{
                        dropdown: { width: '100%' },
                        title: {
                          ...commonInputStyle,
                          color: isDarkMode
                            ? colours.dark.text
                            : colours.light.text,
                          padding: '0 20px', // Adjust padding to fit height
                          borderRadius: '8px',
                          border: 'none', // Remove border from title
                          display: 'flex',
                          alignItems: 'center', // Vertically center the text
                          maxWidth: '200px', // Set max width to prevent overflow
                          overflow: 'hidden', // Hide overflow text
                          textOverflow: 'ellipsis', // Show ellipsis for overflowing text
                          whiteSpace: 'nowrap', // Prevent text from wrapping
                          selectors: {
                            ':hover': {
                              backgroundColor: isDarkMode
                                ? colours.dark.cardHover
                                : colours.light.cardHover,
                            },
                          },
                        },
                        dropdownItem: {
                          selectors: {
                            ':hover': {
                              backgroundColor: isDarkMode
                                ? colours.dark.cardHover
                                : colours.light.cardHover,
                            },
                          },
                        },
                        callout: {
                          boxShadow: isDarkMode
                            ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                            : '0 2px 5px rgba(0, 0, 0, 0.1)',
                        },
                        root: {
                          border: 'none',
                          borderRadius: '8px', // Match desired border radius
                          padding: '0px', // Remove internal padding as it's handled by 'title'
                          backgroundColor: isDarkMode
                            ? colours.dark.sectionBackground
                            : '#ffffff',
                          boxShadow: isDarkMode
                            ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                            : '0 2px 5px rgba(0, 0, 0, 0.1)',
                        },
                      }}
                      ariaLabel={`Select documents for ${block.title}`}
                      // Prevent Dropdown click from triggering the card's onClick
                      onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                        e.stopPropagation()
                      }
                      onFocus={(e: React.FocusEvent<HTMLDivElement>) =>
                        e.stopPropagation()
                      }
                    />
                    {/* Preview Text */}
                    {Array.isArray(selectedTemplateOptions[block.title]) &&
                      selectedTemplateOptions[block.title].length > 0 && (
                        <div className={templatePreviewStyle(isDarkMode)}>
                          <ul>
                            {(selectedTemplateOptions[block.title] as string[]).map(
                              (doc: string) => (
                                <li key={doc}>{doc}</li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                  </>
                ) : (
                  // Single-select blocks
                  <>
                    <Dropdown
                      placeholder="Select an option"
                      options={block.options.map((option: TemplateOption) => ({
                        key: option.label,
                        text: option.label,
                      }))}
                      onChange={(
                        _: React.FormEvent<HTMLDivElement>,
                        option?: IDropdownOption
                      ) => {
                        if (option) {
                          const selectedOption = block.options.find(
                            (o) => o.label === option.text
                          );
                          if (selectedOption) {
                            handleSingleSelectChange(
                              block.title,
                              selectedOption.label
                            );
                          }
                        }
                      }}
                      selectedKey={
                        typeof selectedTemplateOptions[block.title] ===
                        'string'
                          ? (selectedTemplateOptions[block.title] as string)
                          : undefined
                      }
                      styles={{
                        dropdown: { width: '100%' },
                        title: {
                          ...commonInputStyle,
                          color: isDarkMode
                            ? colours.dark.text
                            : colours.light.text,
                          padding: '0 20px', // Adjust padding to fit height
                          borderRadius: '8px',
                          border: 'none', // Remove border from title
                          display: 'flex',
                          alignItems: 'center', // Vertically center the text
                          selectors: {
                            ':hover': {
                              backgroundColor: isDarkMode
                                ? colours.dark.cardHover
                                : colours.light.cardHover,
                            },
                          },
                        },
                        dropdownItem: {
                          selectors: {
                            ':hover': {
                              backgroundColor: isDarkMode
                                ? colours.dark.cardHover
                                : colours.light.cardHover,
                            },
                          },
                        },
                        callout: {
                          boxShadow: isDarkMode
                            ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                            : '0 2px 5px rgba(0, 0, 0, 0.1)',
                        },
                        root: {
                          border: 'none',
                          borderRadius: '8px', // Match desired border radius
                          padding: '0px', // Remove internal padding as it's handled by 'title'
                          backgroundColor: isDarkMode
                            ? colours.dark.sectionBackground
                            : '#ffffff',
                          boxShadow: isDarkMode
                            ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                            : '0 2px 5px rgba(0, 0, 0, 0.1)',
                        },
                      }}
                      ariaLabel={`Select option for ${block.title}`}
                      // Prevent Dropdown click from triggering the card's onClick
                      onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                        e.stopPropagation()
                      }
                      onFocus={(e: React.FocusEvent<HTMLDivElement>) =>
                        e.stopPropagation()
                      }
                    />
                    {/* Preview Text */}
                    {typeof selectedTemplateOptions[block.title] ===
                      'string' &&
                      selectedTemplateOptions[block.title] && (
                        <div className={templatePreviewStyle(isDarkMode)}>
                          <span>
                            {
                              block.options.find(
                                (option: TemplateOption) =>
                                  option.label ===
                                  selectedTemplateOptions[block.title]
                              )?.previewText || ''
                            }
                          </span>
                        </div>
                      )}
                  </>
                )}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};

export default PitchBuilder;
