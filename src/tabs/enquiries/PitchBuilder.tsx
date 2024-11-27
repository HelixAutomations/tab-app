// src/PitchBuilder.tsx

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

interface TemplateOption {
  label: string;
  previewText: string;
}

interface TemplateBlock {
  title: string;
  description: string;
  options: TemplateOption[];
}

interface PitchBuilderProps {
  enquiry: Enquiry;
}

const availableAttachments = [
  { key: 'brochure', text: 'Service Brochure' },
  { key: 'case-study', text: 'Case Study' },
  { key: 'pricing-guide', text: 'Pricing Guide' },
];

// Define follow-up options
const followUpOptions = [
  { key: '1_day', text: '1 day' },
  { key: '2_days', text: '2 days' },
  { key: '3_days', text: '3 days' },
  { key: '7_days', text: '7 days' },
  { key: '14_days', text: '14 days' },
  { key: '30_days', text: '30 days' },
];

// Define a common input style for consistent height
const commonInputStyle = {
  height: '40px',
  lineHeight: '40px',
};

// Define styles for attachment tags
const attachmentTagStyle = (isSelected: boolean, isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isSelected
      ? colours.cta // Use 'cta' from colors
      : isDarkMode
      ? colours.dark.sectionBackground
      : colours.light.sectionBackground,
    color: isSelected
      ? '#ffffff' // White text for selected state
      : isDarkMode
      ? colours.dark.text
      : colours.light.text,
    border: `1px solid ${
      isDarkMode ? colours.dark.cardHover : colours.light.cardHover
    }`,
    borderRadius: '12px', // More rounded tags
    padding: '6px 12px',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: '100px',
    textAlign: 'center',
    ':hover': {
      backgroundColor: isSelected
        ? colours.cta // Keep 'cta' as background for selected on hover
        : isDarkMode
        ? colours.dark.cardHover
        : colours.light.cardHover,
      color: '#ffffff',
    },
    transition: 'background-color 0.2s, color 0.2s',
  });

// Define styles for follow-up tags
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
    borderRadius: '12px', // More rounded tags
    padding: '6px 12px',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: '80px',
    textAlign: 'center',
    ':hover': {
      backgroundColor: isSelected
        ? colours.cta
        : isDarkMode
        ? colours.dark.cardHover
        : colours.light.cardHover,
      color: '#ffffff',
    },
    transition: 'background-color 0.2s, color 0.2s',
  });

// Define styles for template blocks
const templateBlockStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '15px',
    borderRadius: '8px', // Match desired border radius
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    cursor: 'pointer', // Indicate clickable card
    transition: 'background-color 0.2s, box-shadow 0.2s',
    backgroundColor: isDarkMode
      ? colours.dark.cardBackground
      : colours.light.cardBackground,
    ':hover': {
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    },
  });

// Define styles for preview text
const templatePreviewStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '10px',
    borderRadius: '4px',
    overflow: 'hidden',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    backgroundColor: isDarkMode ? colours.dark.previewBackground : colours.light.previewBackground,
    textAlign: 'left',
    marginTop: '10px',
    fontSize: '14px',
  });

const PitchBuilder: React.FC<PitchBuilderProps> = ({ enquiry }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const [template, setTemplate] = useState<string | undefined>(undefined);
  const [subject, setSubject] = useState<string>('Personalized Contract Review Offer');
  const [body, setBody] = useState<string>(
    `Dear ${enquiry.First_Name},\n\nWe are pleased to assist with your enquiry regarding ${enquiry.Area_of_Work}.\n\nBest regards,\n[Your Company Name]`
  );
  const [attachments, setAttachments] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState<string | undefined>(undefined); // State for follow-up
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // State to track selected options for each Template Block
  const [selectedTemplateOptions, setSelectedTemplateOptions] = useState<{ [key: string]: string }>({});

  const templateOptions: IDropdownOption[] = [
    { key: 'Commercial', text: 'Commercial Contract Review' },
    { key: 'Employment', text: 'Employment Contract Review' },
    { key: 'Construction', text: 'Construction Contract Review' },
    { key: 'Custom', text: 'Custom Template' },
  ];

  const handleTemplateChange = (_: React.FormEvent<HTMLDivElement>, option?: IDropdownOption) => {
    if (option && option.key !== 'Custom') {
      setTemplate(option.key as string);
      setSubject(`${option.text} Services`);
      setBody(
        `Dear ${enquiry.First_Name},\n\nThank you for reaching out regarding ${option.text}. We are excited to assist you with your needs.\n\nBest regards,\n[Your Company Name]`
      );
    } else if (option && option.key === 'Custom') {
      setTemplate(option.key as string);
      setSubject('');
      setBody('');
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

  const togglePreview = () => {
    setIsPreviewOpen(!isPreviewOpen);
  };

  const resetForm = () => {
    setTemplate(undefined);
    setSubject('Personalized Contract Review Offer');
    setBody(
      `Dear ${enquiry.First_Name},\n\nWe are pleased to assist with your enquiry regarding ${enquiry.Area_of_Work}.\n\nBest regards,\n[Your Company Name]`
    );
    setAttachments([]);
    setFollowUp(undefined); // Reset follow-up
    setIsPreviewOpen(false);
    setIsErrorVisible(false);
    setErrorMessage('');
    setSelectedTemplateOptions({}); // Reset selected options
  };

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

  const sendEmail = () => {
    if (validateForm()) {
      // Prepare follow up text
      const followUpText = followUp
        ? `\n\nFollow Up: ${followUpOptions.find((opt) => opt.key === followUp)?.text}`
        : '';
      
      // Placeholder for actual email sending logic
      console.log('Email Sent:', { subject, body: body + followUpText, attachments, followUp });
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

  // Define template blocks with options
  const templateBlocks: TemplateBlock[] = [
    {
      title: 'Scope',
      description: 'Outline the scope of services offered.',
      options: [
        {
          label: 'Commercial',
          previewText:
            'Attached is the detailed scope of our commercial services for your consideration. We are committed to providing top-notch service.',
        },
        {
          label: 'Employment',
          previewText:
            'Attached is the detailed scope of our employment services for your consideration. We are committed to providing top-notch service.',
        },
        {
          label: 'Construction',
          previewText:
            'Attached is the detailed scope of our construction services for your consideration. We are committed to providing top-notch service.',
        },
      ],
    },
    {
      title: 'Pricing',
      description: 'Provide detailed pricing information.',
      options: [
        {
          label: 'Commercial',
          previewText:
            'Please find attached our pricing guide for commercial services. Let us know if you have any questions!',
        },
        {
          label: 'Employment',
          previewText:
            'Please find attached our pricing guide for employment services. Let us know if you have any questions!',
        },
        {
          label: 'Construction',
          previewText:
            'Please find attached our pricing guide for construction services. Let us know if you have any questions!',
        },
      ],
    },
    {
      title: 'Case Studies',
      description: 'Provide relevant case studies.',
      options: [
        {
          label: 'Commercial',
          previewText:
            'Please find attached a case study that demonstrates how we successfully assisted a commercial client with similar needs.',
        },
        {
          label: 'Employment',
          previewText:
            'Please find attached a case study that demonstrates how we successfully assisted an employment client with similar needs.',
        },
        {
          label: 'Construction',
          previewText:
            'Please find attached a case study that demonstrates how we successfully assisted a construction client with similar needs.',
        },
      ],
    },
    {
      title: 'Testimonials',
      description: 'Share client testimonials to build trust.',
      options: [
        {
          label: 'General',
          previewText:
            'Here are some testimonials from our satisfied clients. We pride ourselves on delivering excellent service:',
        },
      ],
    },
    {
      title: 'Meeting Link (Calendly)',
      description: 'Schedule a meeting using Calendly.',
      options: [
        {
          label: 'Schedule Meeting',
          previewText:
            'I would like to schedule a meeting to discuss your needs further. Please choose a convenient time using my Calendly link below:',
        },
      ],
    },
    {
      title: 'Google Review',
      description: 'Encourage clients to leave a Google review.',
      options: [
        {
          label: 'Request Review',
          previewText:
            'We would greatly appreciate it if you could take a moment to leave us a Google review. Your feedback helps us improve our services!',
        },
      ],
    },
  ];

  // Function to insert template block into the email body
  const insertTemplateBlock = (previewText: string) => {
    setBody((prevBody) => `${prevBody}\n\n${previewText}`);
  };

  // Styles
  const containerStyle = mergeStyles({
    padding: '30px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
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
    gridTemplateColumns: 'repeat(3, 1fr)', // Three columns
    gap: '20px',
    '@media (max-width: 1200px)': {
      gridTemplateColumns: 'repeat(2, 1fr)', // Two columns on medium screens
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
      ? `rgba(30, 30, 30, 0.9)`
      : `rgba(240, 242, 245, 0.9)`,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: '8px',
  });

  const labelStyle = mergeStyles({
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

  // Function to format value as British £ with comma separators
  const formatValue = (value?: string): string => {
    if (!value) return 'N/A';
    const number = parseFloat(value.replace(/[^0-9.-]+/g, ""));
    if (isNaN(number)) return value;
    return new Intl.NumberFormat('en-UK', {
      style: 'currency',
      currency: 'GBP',
    }).format(number);
  };

  return (
    <Stack className={containerStyle}>
      {/* Left Section: Pitch Builder Form */}
      <Stack className={formContainerStyle} tokens={{ childrenGap: 20 }}>
        {/* Form Header */}
        <Text variant="xLarge" styles={{ root: { fontWeight: '700', color: colours.highlight } }}>
          Pitch Builder
        </Text>

        {/* Template Selection */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Select Email Template</Label>
          <Dropdown
            placeholder="Choose a template"
            options={templateOptions}
            onChange={handleTemplateChange}
            selectedKey={template}
            styles={{
              dropdown: { width: '100%' },
              title: { 
                ...commonInputStyle,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                padding: '0 20px', // Adjust padding to fit height
                borderRadius: '8px',
                border: 'none', // Remove border from title
                display: 'flex',
                alignItems: 'center', // Vertically center the text
                selectors: {
                  ':hover': {
                    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                  },
                },
              },
              dropdownItem: {
                selectors: {
                  ':hover': {
                    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
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
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
                boxShadow: isDarkMode
                  ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                  : '0 2px 5px rgba(0, 0, 0, 0.1)',
              },
            }}
            ariaLabel="Select Email Template"
          />
        </Stack>

        {/* Subject Input */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Email Subject</Label>
          <BubbleTextField
            value={subject}
            onChange={(_: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => setSubject(newValue || '')}
            placeholder="Enter email subject"
            ariaLabel="Email Subject"
            isDarkMode={isDarkMode}
          />
        </Stack>

        {/* Body Input */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Email Body</Label>
          <BubbleTextField
            value={body}
            onChange={(_: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => setBody(newValue || '')}
            placeholder="Compose your email here..."
            multiline
            autoAdjustHeight
            ariaLabel="Email Body"
            isDarkMode={isDarkMode}
            minHeight="150px" // For multi-line input
          />
        </Stack>

        {/* Attachments Selection */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Label className={labelStyle}>Select Attachments</Label>
          <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
            {availableAttachments.map((attachment) => {
              const isSelected = attachments.includes(attachment.key);
              return (
                <span
                  key={attachment.key}
                  className={attachmentTagStyle(isSelected, isDarkMode)}
                  onClick={() => toggleAttachment(attachment.key)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      toggleAttachment(attachment.key);
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-label={`Select attachment ${attachment.text}`}
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
            {followUpOptions.map((option) => {
              const isSelected = followUp === option.key;
              return (
                <span
                  key={option.key}
                  className={followUpTagStyle(isSelected, isDarkMode)}
                  onClick={() => setFollowUp(isSelected ? undefined : option.key)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setFollowUp(isSelected ? undefined : option.key);
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
        <Stack horizontal horizontalAlign="space-between" className={buttonGroupStyle}>
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
                      boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.5)',
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
                      boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.5)',
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
                borderRadius: '8px',
                border: 'none',
                width: '160px',
                selectors: {
                  ':hover': {
                    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                  },
                  ':focus': {
                    outline: 'none',
                    border: 'none',
                    boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.5)',
                  },
                  ':active': {
                    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                    border: 'none',
                  },
                },
              },
              label: {
                color: colours.greyText,
                fontWeight: '600',
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
                ? `rgba(30, 30, 30, 0.9)`
                : `rgba(240, 242, 245, 0.9)`,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              borderRadius: '8px',
            },
          }}
        >
          <Stack tokens={{ childrenGap: 15 }}>
            <Stack tokens={{ childrenGap: 6 }}>
              <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight } }}>
                Subject:
              </Text>
              <Text variant="medium" styles={{ root: { whiteSpace: 'pre-wrap' } }}>
                {subject || 'N/A'}
              </Text>
            </Stack>
            <Separator />
            <Stack tokens={{ childrenGap: 6 }}>
              <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight } }}>
                Body:
              </Text>
              <Text variant="medium" styles={{ root: { whiteSpace: 'pre-wrap' } }}>
                {body || 'N/A'}
              </Text>
            </Stack>
            {attachments.length > 0 && (
              <>
                <Separator />
                <Stack tokens={{ childrenGap: 6 }}>
                  <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight } }}>
                    Attachments:
                  </Text>
                  <Stack tokens={{ childrenGap: 5 }}>
                    {attachments.map((att) => (
                      <Text key={att} variant="medium">
                        - {availableAttachments.find((option) => option.key === att)?.text}
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
                  <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight } }}>
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
        <Text variant="xLarge" styles={{ root: { fontWeight: '700', color: colours.highlight } }}>
          Template Blocks
        </Text>
        {/* Grid Container for Template Blocks */}
        <Stack className={templatesGridStyle}>
          {/* Display template blocks without category labels */}
          {templateBlocks.map((block) => (
            <Stack
              key={block.title}
              className={templateBlockStyle(isDarkMode)}
              onClick={() => {
                if (block.options.length === 1) {
                  // Single option: Insert the preview text
                  insertTemplateBlock(block.options[0].previewText);
                } else {
                  // Multi-option: Insert the selected option's preview text
                  const selectedLabel = selectedTemplateOptions[block.title];
                  const selectedOption = block.options.find((opt) => opt.label === selectedLabel);
                  if (selectedOption) {
                    insertTemplateBlock(selectedOption.previewText);
                  }
                }
              }}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (block.options.length === 1) {
                    insertTemplateBlock(block.options[0].previewText);
                  } else {
                    const selectedLabel = selectedTemplateOptions[block.title];
                    const selectedOption = block.options.find((opt) => opt.label === selectedLabel);
                    if (selectedOption) {
                      insertTemplateBlock(selectedOption.previewText);
                    }
                  }
                }
              }}
              aria-label={`Insert template block ${block.title}`}
            >
              <Stack tokens={{ childrenGap: 10 }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', color: colours.highlight } }}>
                  {block.title}
                </Text>
                <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
                  {block.description}
                </Text>
                {/* Selection and Preview */}
                {block.options.length > 1 ? (
                  <>
                    <Dropdown
                      placeholder="Select an option"
                      options={block.options.map((option) => ({ key: option.label, text: option.label }))}
                      onChange={(_, option) => {
                        const selectedOption = block.options.find((o) => o.label === option?.text);
                        if (selectedOption) {
                          setSelectedTemplateOptions((prev) => ({
                            ...prev,
                            [block.title]: selectedOption.label,
                          }));
                        }
                      }}
                      selectedKey={selectedTemplateOptions[block.title] || undefined}
                      styles={{
                        dropdown: { width: '100%' },
                        title: { 
                          ...commonInputStyle,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          padding: '0 20px',
                          borderRadius: '8px',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          selectors: {
                            ':hover': {
                              backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                            },
                          },
                        },
                        dropdownItem: {
                          selectors: {
                            ':hover': {
                              backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
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
                          padding: '0px',
                          backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
                          boxShadow: isDarkMode
                            ? '0 2px 5px rgba(255, 255, 255, 0.1)'
                            : '0 2px 5px rgba(0, 0, 0, 0.1)',
                        },
                      }}
                      ariaLabel={`Select option for ${block.title}`}
                      // Prevent Dropdown click from triggering the card's onClick
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                    />
                    {/* Preview Text */}
                    {selectedTemplateOptions[block.title] && (
                      <Text className={templatePreviewStyle(isDarkMode)}>
                        {
                          block.options.find(
                            (option) => option.label === selectedTemplateOptions[block.title]
                          )?.previewText
                        }
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    {/* Preview Text for Single Option */}
                    <Text className={templatePreviewStyle(isDarkMode)}>{block.options[0].previewText}</Text>
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
