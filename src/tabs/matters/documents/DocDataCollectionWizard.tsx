import React from 'react';
import {
  Stack,
  Text,
  TextField,
  PrimaryButton,
  IconButton,
  TooltipHost,
  mergeStyles,
  IStackTokens,
  Icon,
} from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';

/* ------------------- Import your bespoke form styles ------------------- */
import { formContainerStyle, inputFieldStyle } from '../../../CustomForms/BespokeForms';
import { sharedPrimaryButtonStyles } from '../../../app/styles/ButtonStyles';

// ---------------------- Interfaces ----------------------
export interface WizardData {
  clientName: string;
  caseReference: string;
  keyDetails: string;
  dateOfIncident: string;
  location: string;
  [key: string]: string;
}

export interface RequiredField {
  label: string;
  value: string;
  info?: string;
}

export interface DocDataCollectionProps {
  wizardData: WizardData;
  setWizardData: React.Dispatch<React.SetStateAction<WizardData>>;
  requiredFields: RequiredField[];
  selectedFields: string[];
  setSelectedFields: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * Maps a cleaned label to the wizardData key.
 * E.g. "Client Name" -> "clientName", "Case Reference" -> "caseReference"
 */
const keyMapping: Record<string, keyof WizardData> = {
  clientname: 'clientName',
  casereference: 'caseReference',
  keydetails: 'keyDetails',
  dateofincident: 'dateOfIncident',
  location: 'location',
};

// ---------------------- Modern Chip Styles ----------------------
/**
 * Base styling for our "chip" or "bubble." 
 * We'll highlight the border and background on hover,
 * use icons to indicate presence/absence of data, 
 * and highlight differently if selected.
 */
const chipStyle = (collected: boolean, isSelected: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: '16px',
    border: `1px solid ${
      collected ? (isSelected ? colours.cta : colours.green) : colours.red
    }`,
    backgroundColor: collected ? '#f0fdf0' : '#fff8f8',
    cursor: 'pointer',
    transition: 'all 0.2s',
    userSelect: 'none',
    ...(isSelected && {
      backgroundColor: '#e3f0ff',
      border: `1px solid ${colours.cta}`,
      boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
    }),
    selectors: {
      ':hover': {
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      },
    },
  });

// ---------------------- Component ----------------------
const DocDataCollection: React.FC<DocDataCollectionProps> = ({
  wizardData,
  setWizardData,
  requiredFields,
  selectedFields,
  setSelectedFields,
}) => {
  const { isDarkMode } = useTheme();

  // Track if link is generated, store final link
  const [linkGenerated, setLinkGenerated] = React.useState(false);
  const [generatedLink, setGeneratedLink] = React.useState('');

  // Handle data updates for the input section
  const handleChange = (fieldLabel: string, value: string) => {
    const dataKey = keyMapping[fieldLabel.replace(/\s/g, '').toLowerCase()];
    setWizardData({ ...wizardData, [dataKey]: value });
  };

  // Generate the bespoke link
  const handleGenerateLink = () => {
    // Example token or ID
    const uniqueToken = `DOCREQ-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
    const baseUrl = 'https://example.com/bespokeForm';

    // Convert selected fields into query param
    const fieldsParam = encodeURIComponent(selectedFields.join(','));

    const link = `${baseUrl}?token=${uniqueToken}&fields=${fieldsParam}`;
    setGeneratedLink(link);
    setLinkGenerated(true);
  };

  // Copy link to clipboard
  const copyToClipboard = () => {
    if (!generatedLink) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(generatedLink);
      alert('Link copied to clipboard!');
    } else {
      // Fallback
      const input = document.createElement('input');
      input.value = generatedLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('Link copied to clipboard!');
    }
  };

  // Spacing tokens for layout
  const sectionTokens: IStackTokens = { childrenGap: 20 };

  return (
    <Stack
      tokens={sectionTokens}
      padding="20px"
      styles={{
        root: {
          border: `1px solid ${isDarkMode ? '#444' : '#ddd'}`,
          borderRadius: 8,
          backgroundColor: isDarkMode
            ? colours.dark.cardBackground
            : colours.light.cardBackground,
        },
      }}
    >
      <Text variant="xLarge" styles={{ root: { marginBottom: 10 } }}>
        Input or Request Data
      </Text>

      {/**
       * Two side-by-side sections:
       * 1) Data Entry (left)
       * 2) Request Additional Data (right)
       */}
      <Stack horizontal tokens={{ childrenGap: 16 }}>
        {/* ---------------- Section 1: Data Entry ---------------- */}
        <Stack grow styles={{ root: { minWidth: 0 } }}>
          <Text variant="medium" styles={{ root: { fontWeight: 600 } }}>
            Data Entry
          </Text>
          <div className={formContainerStyle}>
            {requiredFields.map((field) => {
              const dataKey =
                keyMapping[field.label.replace(/\s/g, '').toLowerCase()];
              return (
                <Stack key={field.label} tokens={{ childrenGap: 5 }}>
                  <TooltipHost content={field.info}>
                    <TextField
                      label={field.label}
                      value={wizardData[dataKey] || ''}
                      onChange={(_, newValue) => handleChange(field.label, newValue || '')}
                      styles={{
                        // Leverage the fieldGroup style from your BespokeForm
                        fieldGroup: inputFieldStyle,
                        field: { padding: '0 5px' },
                      }}
                    />
                  </TooltipHost>
                </Stack>
              );
            })}

            <PrimaryButton
              text="Save Data"
              onClick={() => { /* TODO: Implement data save */ }}
              styles={{ root: { marginTop: 12 } }}
            />
          </div>
        </Stack>

        {/* ---------------- Section 2: Request Data ---------------- */}
        <Stack grow styles={{ root: { minWidth: 0 } }}>
          <Text variant="medium" styles={{ root: { fontWeight: 600 } }}>
            Request Additional Data
          </Text>
          <div className={formContainerStyle}>
            <Stack wrap horizontal tokens={{ childrenGap: 8 }}>
              {requiredFields.map((field) => {
                const dataKey =
                  keyMapping[field.label.replace(/\s/g, '').toLowerCase()];
                const fieldValue = wizardData[dataKey];
                const collected = !!fieldValue && fieldValue.trim() !== '';
                const isSelected = selectedFields.includes(field.label);

                const toggleSelection = () => {
                  if (isSelected) {
                    setSelectedFields(selectedFields.filter((f) => f !== field.label));
                  } else {
                    setSelectedFields([...selectedFields, field.label]);
                  }
                };

                return (
                  <TooltipHost key={field.label} content={field.info || ''}>
                    <span className={chipStyle(collected, isSelected)} onClick={toggleSelection}>
                      <Icon
                        iconName={collected ? 'CheckMark' : 'Clear'}
                        style={{ color: collected ? colours.green : colours.red }}
                      />
                      <Text>{field.label}</Text>
                    </span>
                  </TooltipHost>
                );
              })}
            </Stack>

            <Stack horizontal tokens={{ childrenGap: 8 }} style={{ marginTop: 16 }}>
              <PrimaryButton
                text="Generate Bespoke Form Link"
                onClick={handleGenerateLink}
                styles={sharedPrimaryButtonStyles}
              />

              {linkGenerated && generatedLink && (
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                  <Text variant="small" styles={{ root: { fontStyle: 'italic' } }}>
                    {generatedLink}
                  </Text>
                  <IconButton
                    iconProps={{ iconName: 'Copy' }}
                    onClick={copyToClipboard}
                    title="Copy link"
                    ariaLabel="Copy link"
                  />
                </Stack>
              )}
            </Stack>
          </div>
        </Stack>
      </Stack>
    </Stack>
  );
};

export default DocDataCollection;
