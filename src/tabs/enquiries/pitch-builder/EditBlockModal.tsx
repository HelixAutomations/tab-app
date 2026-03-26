import React, { useState, useEffect } from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { Stack } from '@fluentui/react/lib/Stack';
import { TextField } from '@fluentui/react/lib/TextField';
import { IconButton, DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
import type { IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';
import { ComboBox } from '@fluentui/react/lib/ComboBox';
import type { IComboBoxOption, IComboBox } from '@fluentui/react/lib/ComboBox';
import { Text } from '@fluentui/react/lib/Text';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../../app/styles/colours';
import {
// invisible change
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
} from '../../../app/styles/ButtonStyles';
import { inputFieldStyle, dropdownStyle } from '../../../CustomForms/BespokeForms';
import { TemplateBlock } from '../../../app/customisation/TemplateBlockSets';

interface ReferenceBlockPayload {
  title: string;
  option?: string;
  notes?: string;
}

export interface EditRequestPayload {
  block: string;
  level: 'block' | 'option' | 'sentence';
  option?: string;
  sentence?: string;
  proposedContent: string;
  notes: string;
  referenceBlock?: ReferenceBlockPayload;
}

interface EditBlockModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when the modal should be closed without saving */
  onDismiss: () => void;
  /** Title of the block being edited */
  blockTitle: string;
  /** Preview of the original template content */
  previewContent: React.ReactNode;
  /** Original block details including options and placeholder */
  block: TemplateBlock;
  /** Handler when the user saves their changes */
  onSubmit: (payload: EditRequestPayload) => Promise<void> | void;
  /** Initial text for the block editor */
  initialContent?: string;
  /** Initial notes text */
  initialNotes?: string;
  /** Initially selected block reference */
  initialReference?: string;
  /** Initially selected option on reference block */
  initialReferenceOption?: string;
  /** Initial notes about referencing */
  initialReferenceNotes?: string;
  /** Option to edit initially */
  initialOption?: string;
  /** Initial editing level */
  initialLevel?: 'block' | 'option' | 'sentence';
  /** Blocks that can be referenced from this editor */
  referenceOptions: { key: string; text: string }[];
  /** Map of block titles to their option labels */
  blockOptionsMap: { [blockTitle: string]: string[] };
  /** Whether dark mode styles should be used */
  isDarkMode: boolean;
}

const EditBlockModal: React.FC<EditBlockModalProps> = ({
  isOpen,
  onDismiss,
  blockTitle,
  previewContent,
  block,
  onSubmit,
  initialContent = '',
  initialNotes = '',
  initialReference,
  initialReferenceOption,
  initialReferenceNotes,
  initialOption,
  initialLevel,
  referenceOptions,
  blockOptionsMap,
  isDarkMode,
}) => {
  const [content, setContent] = useState<string>(initialContent);
  const [notes, setNotes] = useState<string>(initialNotes);
  const [reference, setReference] = useState<string | undefined>(initialReference);
  const [referenceOption, setReferenceOption] = useState<string | undefined>(initialReferenceOption);
  const [referenceNotes, setReferenceNotes] = useState<string>(initialReferenceNotes || '');
  const [level, setLevel] = useState<'block' | 'option' | 'sentence'>(initialLevel || 'block');
  const [sentenceToEdit, setSentenceToEdit] = useState<string | undefined>(undefined);
  const [optionToEdit, setOptionToEdit] = useState<string | undefined>(initialOption);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');

  useEffect(() => {
    if (level === 'sentence' && optionToEdit) {
      const option = block.options.find((o) => o.label === optionToEdit);
      if (option) {
        const sentences = option.previewText
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 0);
        const first = sentences[0] || '';
        setSentenceToEdit((prev) => prev || first);
        if (!content) setContent(first);
      }
    }
  }, [level, optionToEdit]);

  const containerClass = mergeStyles({
    padding: 0,
    borderRadius: 0,
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    transition: 'box-shadow 0.2s',
    selectors: {
      ':hover': {
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      },
    },
    fontFamily: 'Raleway, sans-serif',
  });

  const headerClass = mergeStyles({
    padding: '4px 8px',
    color: colours.greyText,
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const renderOriginal = (
    <Stack tokens={{ childrenGap: 8 }}>
      <Text variant="small">{block.description}</Text>
      <div>{previewContent}</div>
    </Stack>
  );

  const originalOptionText = optionToEdit
    ? block.options.find((o) => o.label === optionToEdit)?.previewText || ''
    : '';

  const originalSentenceText =
    level === 'sentence' && optionToEdit && sentenceToEdit
      ? sentenceToEdit
      : '';

  const renderConfirm = (
    <Stack tokens={{ childrenGap: 20 }} styles={{ root: { padding: 20 } }}>
      <Text variant="small">Please review your suggestion before submitting.</Text>
      <Text variant="small">Change level: {level}{level !== 'block' ? ` (${optionToEdit})` : ''}</Text>
      <Stack horizontal tokens={{ childrenGap: 20 }}>
        <Stack style={{ width: '50%' }} tokens={{ childrenGap: 8 }}>
          <Text variant="mediumPlus">Current</Text>
          {level === 'option' ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{originalOptionText}</div>
          ) : level === 'sentence' ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{originalSentenceText}</div>
          ) : (
            <div>{previewContent}</div>
          )}
        </Stack>
        <Stack style={{ width: '50%' }} tokens={{ childrenGap: 8 }}>
          <Text variant="mediumPlus">Proposed</Text>
          <div
            style={{ whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br />') }}
          />
        </Stack>
      </Stack>
      {notes && <Text variant="small">Notes: {notes}</Text>}
      {reference && (
        <Text variant="small">
          References {reference}
          {referenceOption ? `: ${referenceOption}` : ''}. {referenceNotes}
        </Text>
      )}
      <Stack horizontal horizontalAlign="end" tokens={{ childrenGap: 10 }}>
        <PrimaryButton
          text="Submit Suggestion"
          styles={sharedPrimaryButtonStyles}
          onClick={() =>
            onSubmit({
              block: blockTitle,
              level,
              option: level !== 'block' ? optionToEdit : undefined,
              sentence: level === 'sentence' ? sentenceToEdit : undefined,
              proposedContent: content,
              notes,
              referenceBlock: reference
                ? {
                  title: reference,
                  option: referenceOption,
                  notes: referenceNotes,
                }
                : undefined,
            })
          }
        />
        <DefaultButton text="Back" styles={sharedDefaultButtonStyles} onClick={() => setStep('edit')} />
      </Stack>
    </Stack>
  );

  const renderEdit = (
    <Stack tokens={{ childrenGap: 20 }} styles={{ root: { padding: 20 } }}>
      <Text variant="small">Update the content below or explain how this block should change.</Text>
      <ChoiceGroup
        label="Change scope"
        options={[
          { key: 'block', text: 'Block' },
          { key: 'option', text: 'Option' },
          { key: 'sentence', text: 'Sentence' },
        ]}
        selectedKey={level}
        onChange={(
          _e?: React.FormEvent<HTMLElement | HTMLInputElement>,
          opt?: IChoiceGroupOption
        ) => {
          if (opt) setLevel(opt.key as 'block' | 'option' | 'sentence');
        }}
      />
      {(level === 'option' || level === 'sentence') && (
        <Dropdown
          label="Option to change"
          selectedKey={optionToEdit}
          options={block.options.map((o) => ({ key: o.label, text: o.label }))}
          onChange={(
            _e: React.FormEvent<HTMLDivElement>,
            opt?: IDropdownOption
          ) => setOptionToEdit(opt?.key as string)}
          styles={{ dropdown: dropdownStyle }}
        />
      )}
      {level === 'sentence' && optionToEdit && (
        <Dropdown
          label="Sentence to change"
          selectedKey={sentenceToEdit}
          options={block.options
            .find((o) => o.label === optionToEdit)!
            .previewText.split(/(?<=[.!?])\s+/)
            .filter((s) => s.trim().length > 0)
            .map((s, idx) => ({ key: String(idx), text: s.trim() }))}
          onChange={(
            _e: React.FormEvent<HTMLDivElement>,
            opt?: IDropdownOption
          ) => setSentenceToEdit(opt?.text as string)}
          styles={{ dropdown: dropdownStyle }}
        />
      )}
      <Stack horizontal tokens={{ childrenGap: 20 }}>
        <Stack style={{ width: '50%' }} tokens={{ childrenGap: 12 }}>
          {renderOriginal}
        </Stack>
        <Stack style={{ width: '50%' }} tokens={{ childrenGap: 12 }}>
          <TextField
            label="Proposed content"
            multiline
            autoAdjustHeight
            value={content}
            onChange={(
              _e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
              v?: string
            ) => setContent(v || '')}
            styles={{ fieldGroup: inputFieldStyle }}
          />
          <Dropdown
            label="Reference another block (optional)"
            selectedKey={reference}
            options={referenceOptions}
            onChange={(
              _e: React.FormEvent<HTMLDivElement>,
              option?: IDropdownOption
            ) => {
              setReference(option?.key as string);
              setReferenceOption(undefined);
            }}
            styles={{ dropdown: dropdownStyle }}
          />
          {reference && (
            <ComboBox
              label="Reference option"
              selectedKey={referenceOption}
              allowFreeform
              options={(blockOptionsMap[reference] || []).map((o) => ({ key: o, text: o })) as IComboBoxOption[]}
              onChange={(
                _e: React.FormEvent<IComboBox>,
                option?: IComboBoxOption,
                _index?: number,
                value?: string
              ) =>
                setReferenceOption((option ? option.key : value) as string)
              }
              styles={{
                root: [dropdownStyle, { width: '100%' }],
                input: { height: '32px', lineHeight: '32px', padding: '0 5px', border: 'none' },
                callout: { minWidth: '100%' },
              }}
            />
          )}
          <TextField
            label="Notes"
            multiline
            autoAdjustHeight
            value={notes}
            onChange={(
              _e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
              v?: string
            ) => setNotes(v || '')}
            styles={{ fieldGroup: inputFieldStyle }}
          />
          {reference && (
            <TextField
              label="Notes about referencing the other block"
              multiline
              autoAdjustHeight
              value={referenceNotes}
              onChange={(
                _e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
                v?: string
              ) => setReferenceNotes(v || '')}
              styles={{ fieldGroup: inputFieldStyle }}
            />
          )}
        </Stack>
      </Stack>
      <Stack horizontal horizontalAlign="end" tokens={{ childrenGap: 10 }}>
        <PrimaryButton text="Review" styles={sharedPrimaryButtonStyles} onClick={() => setStep('confirm')} />
        <DefaultButton text="Cancel" styles={sharedDefaultButtonStyles} onClick={onDismiss} />
      </Stack>
    </Stack>
  );

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} isBlocking={false}>
      <div className={containerClass}>
        <div className={headerClass}>
          <span>{initialOption ? `${blockTitle}: ${initialOption}` : blockTitle}</span>
          <IconButton iconProps={{ iconName: 'Cancel' }} onClick={onDismiss} />
        </div>
        {step === 'edit' ? renderEdit : renderConfirm}
      </div>
    </Modal>
  );
};

export default EditBlockModal;
