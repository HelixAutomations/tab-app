import React, { useState, useMemo } from 'react';
import {
  Text,
  Stack,
  TextField,
  DefaultButton,
  PrimaryButton,
  IconButton,
  Icon,
  TooltipHost,
  mergeStyles,
} from '@fluentui/react';
import { DocumentEntry } from './documentIndex';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import DocDataCollectionWizard, { WizardData } from './DocDataCollectionWizard';

export interface DocumentDetailsPageProps {
  doc: DocumentEntry;
  onBack: () => void;
}

// Icon for copying the prompt
const copyIcon = { iconName: 'Copy' };

const DocumentDetailsPage: React.FC<DocumentDetailsPageProps> = ({ doc, onBack }) => {
  const { isDarkMode } = useTheme();

  // Wizard data used for the prompt (entered in the wizard)
  const [wizardData, setWizardData] = useState<WizardData>({
    clientName: 'Acme Inc',
    caseReference: '',
    keyDetails: 'Summary details go here...',
    dateOfIncident: '',
    location: 'New York',
  });
  const [draftPrompt, setDraftPrompt] = useState<string>(generateDraftPrompt(doc));
  const [copySuccess, setCopySuccess] = useState<string>('');

  // Toggle state for the two panels
  const [showTemplatePreview, setShowTemplatePreview] = useState(true);
  const [showYourDocPreview, setShowYourDocPreview] = useState(true);

  // Use the document’s requirements (each field with a label and description)
  const requiredFields = doc.requirements;

  // Dummy collected status: randomly assign true/false for each field.
  const dummyCollectedStatus = useMemo(() => {
    const status: { [key: string]: boolean } = {};
    requiredFields.forEach(field => {
      status[field.field] = Math.random() < 0.5;
    });
    return status;
  }, [requiredFields]);

  function generateDraftPrompt(doc: DocumentEntry): string {
    return `
Please generate a bespoke "${doc.title}" with the following details:

- Client Name: [Client Name]
- Case Reference: [Case Reference]
- Key Details: [Insert key details here]
- Date of Incident: [Insert date of incident]
- Location: [Insert location]

Reference the perfect example below:

${doc.fullContent}

Make sure to replace all placeholders with the actual data and maintain the structure.
    `.trim();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _updateDraftPromptFromWizard = () => {
    const base = generateDraftPrompt(doc);
    const replaced = base
      .replace('[Client Name]', wizardData.clientName || '...')
      .replace('[Case Reference]', wizardData.caseReference || '...')
      .replace('[Insert key details here]', wizardData.keyDetails || '...')
      .replace('[Insert date of incident]', wizardData.dateOfIncident || '...')
      .replace('[Insert location]', wizardData.location || '...');
    setDraftPrompt(replaced);
  };

  // copyToClipboard defined inside so it can access state.
  const copyToClipboard = () => {
    navigator.clipboard.writeText(draftPrompt)
      .then(() => {
        setCopySuccess("Copied!");
        setTimeout(() => setCopySuccess(""), 2000);
      })
      .catch((error) => {
        console.error("Error copying to clipboard:", error);
        setCopySuccess("Failed to copy");
      });
  };

  // ----------------- Tag Styles -----------------
  const baseTagStyle = mergeStyles({
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '16px',
    margin: '4px',
    fontSize: '12px',
  });

  const underlyingTagStyle = mergeStyles(baseTagStyle, {
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    border: '1px solid #ddd',
  });

  const greenTagStyle = mergeStyles(baseTagStyle, {
    backgroundColor: '#e6f9e6',
    border: '1px solid #00a300',
    color: '#006600',
  });

  const redTagStyle = mergeStyles(baseTagStyle, {
    backgroundColor: '#ffe6e6',
    border: '1px solid red',
    color: 'red',
  });

  // ----------------- Underlying Dataset Panel -----------------
  const renderUnderlyingDatasetTags = () => {
    return (
      <Stack horizontal wrap tokens={{ childrenGap: 8 }}>
        {requiredFields.map((field) => (
          <TooltipHost key={field.field} content={field.description}>
            <span className={underlyingTagStyle}>{field.field}</span>
          </TooltipHost>
        ))}
      </Stack>
    );
  };

  // ----------------- Your Document Panel -----------------
  const renderYourDataChecklistTags = () => {
    return (
      <Stack horizontal wrap tokens={{ childrenGap: 8 }}>
        {requiredFields.map((field) => {
          const collected = dummyCollectedStatus[field.field];
          return (
            <TooltipHost key={field.field} content={field.description}>
              <span className={collected ? greenTagStyle : redTagStyle}>
                {collected ? (
                  <Icon iconName="CheckMark" styles={{ root: { fontSize: 12, marginRight: 4 } }} />
                ) : (
                  <Icon iconName="Cancel" styles={{ root: { fontSize: 12, marginRight: 4 } }} />
                )}
                {field.field}
              </span>
            </TooltipHost>
          );
        })}
      </Stack>
    );
  };

  // ----------------- Document Preview Component -----------------
  const documentPreviewStyle = mergeStyles({
    width: '420px',
    height: '594px',
    border: `1px solid ${isDarkMode ? '#444' : '#ddd'}`,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    marginBottom: '20px',
  });

  const previewHeaderStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    marginBottom: '16px',
  });

  const previewContentStyle = mergeStyles({
    backgroundColor: '#ccc',
    borderRadius: '4px',
    padding: '10px',
    height: '350px',
    overflow: 'hidden',
    marginBottom: '16px',
  });

  const previewFooterStyle = mergeStyles({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });

  const previewDummyFieldStyle = mergeStyles({
    backgroundColor: '#fff',
    height: '12px',
    borderRadius: '2px',
  });

  const renderDocumentPreview = (previewTitle: string) => {
    return (
      <div className={documentPreviewStyle}>
        <div className={previewHeaderStyle}>
          <Icon iconName="WordLogo" styles={{ root: { fontSize: 40, color: colours.highlight } }} />
          <Text
            variant="xLarge"
            styles={{
              root: {
                marginLeft: '10px',
                fontWeight: 600,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
            }}
          >
            {previewTitle}
          </Text>
        </div>
        <div className={previewContentStyle}>
          <div className={previewDummyFieldStyle} style={{ width: '90%', marginBottom: '10px' }} />
          <div className={previewDummyFieldStyle} style={{ width: '70%', marginBottom: '10px' }} />
          <div className={previewDummyFieldStyle} style={{ width: '80%', marginBottom: '10px' }} />
          <div className={previewDummyFieldStyle} style={{ width: '60%', marginBottom: '10px' }} />
          <div className={previewDummyFieldStyle} style={{ width: '85%', marginBottom: '10px' }} />
        </div>
        <div className={previewFooterStyle}>
          <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
            .docx
          </Text>
          <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
            Est. 1.2 MB
          </Text>
        </div>
      </div>
    );
  };

  // For raw content views, we simply list the field labels.
  const dummyTemplateRawContent = `
Document Title: ${doc.title}
Author: Jane Smith
Date: 2025-03-03
Fields: ${requiredFields.map(r => r.field).join(', ')}
  `.trim();

  const dummyYourDocRawContent = `
Document Title: ${doc.title}
Filled by: John Doe
Date: 2025-03-03
Fields: ${requiredFields.map(r => {
    return dummyCollectedStatus[r.field] ? r.field : `${r.field} [Missing]`;
  }).join(', ')}
  `.trim();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRequestData = () => {
    // TODO: Implement data request from client
  };

  // ----------------- Page Styles -----------------
  const pageContainer = mergeStyles({
    padding: '40px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    minHeight: '100vh',
    fontFamily: 'Raleway, sans-serif',
  });
  const headerStyle = mergeStyles({
    marginBottom: '30px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });
  const cardStyle = mergeStyles({
    flex: 1,
    padding: '25px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? '0 4px 12px rgba(255, 255, 255, 0.1)'
      : '0 4px 12px rgba(0, 0, 0, 0.1)',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    border: `1px solid ${isDarkMode ? '#444' : '#ddd'}`,
  });
  const wizardContainer = mergeStyles({
    padding: '25px',
    borderRadius: '8px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    border: `1px solid ${isDarkMode ? '#444' : '#ddd'}`,
    marginBottom: '30px',
  });
  const promptCard = mergeStyles({
    padding: '25px',
    borderRadius: '8px',
    border: `1px solid ${isDarkMode ? '#444' : '#ddd'}`,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    position: 'relative',
  });

  return (
    <div className={pageContainer}>
      <Stack className={headerStyle} horizontal>
        <Text
          variant="xLarge"
          styles={{
            root: {
              fontWeight: 700,
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          {doc.title}
        </Text>
        <DefaultButton text="Back" onClick={onBack} />
      </Stack>

      <Stack horizontal tokens={{ childrenGap: 30 }} styles={{ root: { marginBottom: '40px' } }}>
        {/* Underlying Dataset Panel */}
        <Stack className={cardStyle} style={{ flex: 1 }}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Text
              variant="medium"
              styles={{
                root: {
                  fontWeight: 600,
                  marginBottom: '15px',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            >
              Underlying Dataset
            </Text>
            <DefaultButton
              text={showTemplatePreview ? 'Show Raw' : 'Show Preview'}
              onClick={() => setShowTemplatePreview(!showTemplatePreview)}
              styles={{ root: { height: '30px', fontSize: '12px' } }}
            />
          </Stack>
          {showTemplatePreview ? (
            <Stack horizontal tokens={{ childrenGap: 20 }}>
              {renderDocumentPreview(doc.title)}
              <Stack styles={{ root: { flex: 1 } }}>
                <Text variant="medium" styles={{ root: { marginBottom: 10 } }}>Dataset</Text>
                {renderUnderlyingDatasetTags()}
              </Stack>
            </Stack>
          ) : (
            <pre
              style={{
                backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
                padding: '15px',
                borderRadius: '4px',
                color: isDarkMode ? '#fff' : '#000',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {dummyTemplateRawContent}
            </pre>
          )}
        </Stack>

        {/* Your Document Panel */}
        <Stack className={cardStyle} style={{ flex: 1 }}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Text
              variant="medium"
              styles={{
                root: {
                  fontWeight: 600,
                  marginBottom: '15px',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            >
              Your Document
            </Text>
            <DefaultButton
              text={showYourDocPreview ? 'Show Details' : 'Show Preview'}
              onClick={() => setShowYourDocPreview(!showYourDocPreview)}
              styles={{ root: { height: '30px', fontSize: '12px' } }}
            />
          </Stack>
          {showYourDocPreview ? (
            <Stack horizontal tokens={{ childrenGap: 20 }}>
              {renderDocumentPreview(doc.title)}
              <Stack styles={{ root: { flex: 1 } }}>
                <Text variant="medium" styles={{ root: { marginBottom: 10 } }}>Data Checklist</Text>
                {renderYourDataChecklistTags()}
              </Stack>
            </Stack>
          ) : (
            <pre
              style={{
                backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
                padding: '15px',
                borderRadius: '4px',
                color: isDarkMode ? '#fff' : '#000',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {dummyYourDocRawContent}
            </pre>
          )}
        </Stack>
      </Stack>

      {/* Fill in Missing Data Section */}
      <Stack tokens={{ childrenGap: 20 }} className={wizardContainer}>
        <DocDataCollectionWizard
          wizardData={wizardData}
          setWizardData={setWizardData}
          // Map required fields for the wizard (these can remain as text inputs)
          requiredFields={requiredFields.map(r => ({
            label: r.field,
            value: wizardData[r.field.replace(' ', '').toLowerCase()] || '',
            info: r.description,
          }))}
          selectedFields={[]}
          setSelectedFields={() => {}}
        />
      </Stack>

      <Stack tokens={{ childrenGap: 15 }}>
        <Stack horizontal verticalAlign="center" horizontalAlign="space-between">
          <Text
            variant="large"
            styles={{
              root: {
                fontWeight: 600,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
            }}
          >
            Draft Prompt for Language Model
          </Text>
          <IconButton
            iconProps={copyIcon}
            title="Copy Prompt"
            ariaLabel="Copy Prompt"
            onClick={copyToClipboard}
          />
          {copySuccess && (
            <Text variant="small" styles={{ root: { color: colours.cta, marginLeft: '10px' } }}>
              {copySuccess}
            </Text>
          )}
        </Stack>
        <div className={promptCard}>
          <TextField
            label="Your Draft Prompt"
            multiline
            rows={6}
            value={draftPrompt}
            onChange={(_, val) => setDraftPrompt(val || '')}
            underlined
          />
        </div>
        <Text
          variant="small"
          styles={{
            root: {
              fontStyle: 'italic',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          Copy the above prompt into your language model interface after filling any remaining placeholders.
        </Text>
      </Stack>

      <Stack horizontal horizontalAlign="end" tokens={{ childrenGap: 15 }} styles={{ root: { marginTop: '40px' } }}>
        <PrimaryButton text="Use This Template" onClick={() => { /* TODO: Implement template generation */ }} />
      </Stack>
    </div>
  );
};

export default DocumentDetailsPage;
