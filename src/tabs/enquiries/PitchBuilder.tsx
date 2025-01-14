// src/tabs/enquiries/PitchBuilder.tsx

import React, { useState, useEffect, useRef } from 'react';
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
  IconButton,
  IIconProps,
} from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import BubbleTextField from '../../app/styles/BubbleTextField';
import { useTheme } from '../../app/functionality/ThemeContext';
import PracticeAreaPitch, { PracticeAreaPitchType } from '../../app/customisation/PracticeAreaPitch';
import { templateBlocks, TemplateBlock, TemplateOption } from '../../app/customisation/TemplateBlocks';
import { availableAttachments, AttachmentOption } from '../../app/customisation/Attachments';
import {
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
} from '../../app/styles/ButtonStyles';
import {
  sharedEditorStyle,
  sharedOptionsDropdownStyles,
} from '../../app/styles/FilterStyles';
import ReactDOMServer from 'react-dom/server';
import EmailSignature from './EmailSignature';

/** Step 1: same function you already have for line-break -> <p> conversions */
function convertDoubleBreaksToParagraphs(html: string): string {
  const normalized = html.replace(/\r\n/g, '\n');
  const paragraphs = normalized.split(/\n\s*\n/);
  const wrapped = paragraphs.map((paragraph) => {
    const trimmed = paragraph.trim();
    return trimmed
      ? `<p>${trimmed}</p>`
      : `<p style="margin:0;">&nbsp;</p>`;
  });
  return wrapped.join('');
}

/** Extra placeholders for your logic */
const leftoverPlaceholders = [
  '[Current Situation and Problem Placeholder]',
  '[Scope of Work Placeholder]',
  '[Risk Assessment Placeholder]',
  '[Costs and Budget Placeholder]',
  '[Required Documents Placeholder]',
  '[Follow-Up Instructions Placeholder]',
  '[Closing Notes Placeholder]',
  '[Google Review Placeholder]',
  '[FE Introduction Placeholder]',
  '[Meeting Link Placeholder]',
];

/** Removes lines with leftover placeholders, condenses blank lines */
function removeUnfilledPlaceholders(text: string): string {
  const lines = text.split('\n');
  const filteredLines = lines.filter(
    (line) => !leftoverPlaceholders.some((pl) => line.includes(pl))
  );
  const consolidated: string[] = [];
  for (const line of filteredLines) {
    if (line.trim() === '' && consolidated.length > 0 && consolidated[consolidated.length - 1].trim() === '') {
      continue;
    }
    consolidated.push(line);
  }
  return consolidated.join('\n').trim();
}

/** Removes highlight placeholders <span data-*="...">  */
function removeHighlightSpans(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const spans = tempDiv.querySelectorAll('span[data-placeholder], span[data-inserted], span[data-link]');
  spans.forEach((span) => {
    span.removeAttribute('style');
    span.removeAttribute('data-placeholder');
    span.removeAttribute('data-inserted');
    span.removeAttribute('data-link');
  });
  return tempDiv.innerHTML;
}

/** Replaces newlines in template strings with <br> */
function cleanTemplateString(template: string): string {
  return template
    .replace(/^\s*\n|\n\s*$/g, '')
    .replace(/\n/g, '<br />');
}

/** Some icons */
const boldIcon: IIconProps = { iconName: 'Bold' };
const italicIcon: IIconProps = { iconName: 'Italic' };
const underlineIcon: IIconProps = { iconName: 'Underline' };
const unorderedListIcon: IIconProps = { iconName: 'BulletedList' };
const orderedListIcon: IIconProps = { iconName: 'NumberedList' };
const linkIcon: IIconProps = { iconName: 'Link' };
const clearIcon: IIconProps = { iconName: 'Cancel' };

/** Helper: is value a string array? */
function isStringArray(value: string | string[]): value is string[] {
  return Array.isArray(value);
}

/**
 * Replaces placeholders in the base template, e.g. [Enquiry.First_Name].
 * Also highlight them so user can see them in the editor.
 */
function replacePlaceholders(
  template: string,
  intro: string,
  enquiry: Enquiry,
  userData: any
): string {
  const userFirstName = userData?.[0]?.['First'] || 'Your';
  const userFullName = userData?.[0]?.['Full Name'] || 'Your Name';
  const userRole = userData?.[0]?.['Role'] || 'Your Position';

  return template
    .replace(
      /\[Enquiry.First_Name\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;" data-placeholder="[Enquiry.First_Name]">${enquiry.First_Name || 'there'}</span>`
    )
    .replace(
      /\[Enquiry.Point_of_Contact\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;" data-placeholder="[Enquiry.Point_of_Contact]">${enquiry.Point_of_Contact || 'Our Team'}</span>`
    )
    .replace(
      /\[FE Introduction Placeholder\]/g,
      intro
        ? `<span data-placeholder="[FE Introduction Placeholder]">${intro}</span>`
        : `<span data-placeholder="[FE Introduction Placeholder]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">[FE Introduction Placeholder]</span>`
    )
    .replace(
      /\[Current Situation and Problem Placeholder\]/g,
      `<span data-placeholder="[Current Situation and Problem Placeholder]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">[Current Situation and Problem Placeholder]</span>`
    )
    .replace(
      /\[First Name\]/g,
      `<span data-placeholder="[First Name]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${userFirstName}</span>`
    )
    .replace(
      /\[Full Name\]/g,
      `<span data-placeholder="[Full Name]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${userFullName}</span>`
    )
    .replace(
      /\[Position\]/g,
      `<span data-placeholder="[Position]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${userRole}</span>`
    )
    .replace(
      /\[(Scope of Work Placeholder|Risk Assessment Placeholder|Costs and Budget Placeholder|Follow-Up Instructions Placeholder|Closing Notes Placeholder|Required Documents Placeholder|Google Review Placeholder|Meeting Link Placeholder)\]/g,
      (match) =>
        `<span data-placeholder="${match}" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${match}</span>`
    );
}

/**
 * # The main PitchBuilder component
 */
interface PitchBuilderProps {
  enquiry: Enquiry;
  userData: any;
}

const PitchBuilder: React.FC<PitchBuilderProps> = ({ enquiry, userData }) => {
  const { isDarkMode } = useTheme();

  function capitalizeWords(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  const [subject, setSubject] = useState<string>(
    enquiry.Area_of_Work
      ? `Your ${capitalizeWords(enquiry.Area_of_Work)} Enquiry`
      : 'Your Enquiry'
  );

  const [to, setTo] = useState<string>(enquiry.Email || '');
  const [cc, setCc] = useState<string>('');
  const [bcc, setBcc] = useState<string>('2day@followupthen.com');

  /** Base template with placeholders */
  const BASE_TEMPLATE = `Dear [Enquiry.First_Name],

[FE Introduction Placeholder]

[Current Situation and Problem Placeholder]

[Scope of Work Placeholder]

[Risk Assessment Placeholder]

[Costs and Budget Placeholder]

[Required Documents Placeholder]

[Follow-Up Instructions Placeholder]

[Meeting Link Placeholder]

[Closing Notes Placeholder]

[Google Review Placeholder]

[First Name]

[Full Name]
[Position]`;

  /**
   * The main "body" of the editor content
   */
  const [body, setBody] = useState<string>(() => {
    const replaced = replacePlaceholders(BASE_TEMPLATE, '', enquiry, userData);
    // Also remove extra leading/trailing spaces each line
    return replaced
      .split('\n')
      .map((line) => line.trim())
      .join('\n');
  });

  const [attachments, setAttachments] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState<string | undefined>(undefined);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [selectedTemplateOptions, setSelectedTemplateOptions] = useState<{ [key: string]: string | string[]; }>({});
  const [insertedBlocks, setInsertedBlocks] = useState<{ [key: string]: boolean }>({});

  const bodyEditorRef = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<Range | null>(null);

  /** Save and restore selection for insertAtCursor  */
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    const sel = window.getSelection();
    if (sel && savedSelection.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  }
  function isSelectionInsideEditor(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode!;
    }
    return bodyEditorRef.current?.contains(node) || false;
  }

  function insertAtCursor(html: string) {
    if (!isSelectionInsideEditor()) {
      setBody((prev) => prev + `\n\n${html}`);
      return;
    }
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const fragment = document.createDocumentFragment();
      let node: ChildNode | null;
      while ((node = tempDiv.firstChild)) {
        fragment.appendChild(node);
      }
      range.insertNode(fragment);

      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      saveSelection();

      if (bodyEditorRef.current) {
        setBody(bodyEditorRef.current.innerHTML);
      }
    }
  }

  /**
   * Insert a template block's text at the corresponding placeholder
   */
  function insertTemplateBlock(block: TemplateBlock, selectedOption: string | string[]) {
    let replacementText = '';

    if (block.isMultiSelect && isStringArray(selectedOption)) {
      if (block.title === 'Required Documents') {
        replacementText = `<ul>${selectedOption
          .map((doc) => {
            const opt = block.options.find((o) => o.label === doc);
            return `<li>${opt ? opt.previewText.trim() : doc}</li>`;
          })
          .join('')}</ul>`;
      } else {
        replacementText = selectedOption
          .map((item) => {
            const opt = block.options.find((o) => o.label === item);
            return opt ? opt.previewText.trim() : item;
          })
          .join('<br />');
      }
    } else if (!block.isMultiSelect && typeof selectedOption === 'string') {
      const opt = block.options.find((o) => o.label === selectedOption);
      replacementText = opt ? opt.previewText.trim() : '';
      replacementText = replacementText.replace(/\n/g, '<br />');
    }

    const highlighted = `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;" data-inserted="${block.title}" data-placeholder="${block.placeholder}">
      ${cleanTemplateString(replacementText)}
    </span>`;

    setBody((prevBody) => {
      const newBody = prevBody.replace(
        new RegExp(
          `(<span[^>]*data-placeholder="${block.placeholder.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}"[^>]*>)([\\s\\S]*?)(</span>)`,
          'g'
        ),
        `$1${highlighted}$3`
      );
      return newBody;
    });
    setInsertedBlocks((prev) => ({ ...prev, [block.title]: true }));

    setTimeout(() => {
      if (bodyEditorRef.current) {
        const insertedSpan = bodyEditorRef.current.querySelector(`span[data-inserted="${block.title}"]`);
        if (insertedSpan) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.setStartAfter(insertedSpan);
          range.collapse(true);
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
            saveSelection();
          }
        }
      }
    }, 0);
  }

  /**
   * Toggle attachments
   */
  function toggleAttachment(att: AttachmentOption) {
    if (att.status === 'draft') return;
    if (attachments.includes(att.key)) {
      setAttachments((prev) => prev.filter((k) => k !== att.key));
      removeAttachmentLink(att.key);
    } else {
      setAttachments((prev) => [...prev, att.key]);
      saveSelection();
      const linkHTML = `<span style="background-color: #ffe6e6; padding: 0 3px;" data-link="${att.key}">
        <a href="${att.link}" style="color: #3690CE; text-decoration: none;">${att.text}</a>
      </span>`;
      insertAtCursor(linkHTML);
    }
  }
  function removeAttachmentLink(key: string) {
    if (bodyEditorRef.current) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = bodyEditorRef.current.innerHTML;
      const spans = tempDiv.querySelectorAll(`span[data-link="${key}"]`);
      spans.forEach((span) => {
        const parent = span.parentNode;
        if (parent) parent.removeChild(span);
      });
      const newBody = tempDiv.innerHTML;
      setBody(newBody);
    }
  }
  function getFilteredAttachments(): AttachmentOption[] {
    return availableAttachments.filter(
      (att) =>
        !att.applicableTo ||
        att.applicableTo.includes(
          Object.keys(PracticeAreaPitch).find((k) => PracticeAreaPitch[k as keyof PracticeAreaPitchType]) || ''
        )
    );
  }

  function togglePreview() {
    setIsPreviewOpen(!isPreviewOpen);
  }

  function resetForm() {
    setSubject('Your Practice Area Enquiry');
    setTo(enquiry.Email || '');
    setCc('');
    setBcc('2day@followupthen.com');

    const newBody = replacePlaceholders(BASE_TEMPLATE, '', enquiry, userData)
      .split('\n')
      .map((line) => line.trim())
      .join('\n');
    setBody(newBody);
    setAttachments([]);
    setFollowUp(undefined);
    setIsPreviewOpen(false);
    setIsErrorVisible(false);
    setErrorMessage('');
    setSelectedTemplateOptions({});
    setInsertedBlocks({});
  }

  function validateForm(): boolean {
    if (!to.trim()) {
      setErrorMessage('To field cannot be empty.');
      setIsErrorVisible(true);
      return false;
    }
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
  }

  function sendEmail() {
    if (validateForm()) {
      console.log('Email Sent:', {
        to,
        cc,
        bcc,
        subject,
        body,
        attachments,
        followUp,
      });
      setIsSuccessVisible(true);
      resetForm();
    }
  }

  /** Step 2: final transformation for sending */
  async function handleDraftEmail() {
    if (!body || !enquiry.Point_of_Contact) {
      setErrorMessage('Email contents and user email are required.');
      setIsErrorVisible(true);
      return;
    }
    const rawHtml = removeHighlightSpans(body);
    const noPlaceholders = removeUnfilledPlaceholders(rawHtml);
    const finalHtml = convertDoubleBreaksToParagraphs(noPlaceholders);

    const wrappedBody = `
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:10px; font-family:Raleway, sans-serif; font-size:10pt; color:#000;">
            ${finalHtml}
          </td>
        </tr>
      </table>
    `;

    const fullEmailHtml = ReactDOMServer.renderToStaticMarkup(
      <EmailSignature bodyHtml={wrappedBody} userData={userData} />
    );

    const requestBody = {
      email_contents: fullEmailHtml,
      user_email: enquiry.Point_of_Contact,
      subject_line: subject,
      to,
      cc,
      bcc,
    };

    try {
      setErrorMessage('');
      setIsErrorVisible(false);
      const response = await fetch(
        `${process.env.REACT_APP_PROXY_BASE_URL}/sendEmail?code=${process.env.REACT_APP_SEND_EMAIL_CODE}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to draft email.');
      }
      setIsSuccessVisible(true);
    } catch (error: any) {
      console.error('Error drafting email:', error);
      setErrorMessage(error.message || 'An unknown error occurred.');
      setIsErrorVisible(true);
    }
  }

  /** Step 3: unify the transformation for the Preview as well */
  function getPreviewHtml(): string {
    const raw = removeHighlightSpans(body);
    const noPlaceholders = removeUnfilledPlaceholders(raw);
    const finalHtml = convertDoubleBreaksToParagraphs(noPlaceholders);

    // Optionally wrap in a table if you want the exact same structure
    return `
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:10px; font-family:Raleway, sans-serif; font-size:10pt; color:#000;">
            ${finalHtml}
          </td>
        </tr>
      </table>
    `;
  }

  useEffect(() => {
    if (isSuccessVisible) {
      const timer = setTimeout(() => setIsSuccessVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccessVisible]);

  useEffect(() => {
    if (isErrorVisible) {
      const timer = setTimeout(() => setIsErrorVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isErrorVisible]);

  /** Keep the contentEditable DIV in sync with body state */
  useEffect(() => {
    if (bodyEditorRef.current && bodyEditorRef.current.innerHTML !== body) {
      bodyEditorRef.current.innerHTML = body;
    }
  }, [body]);

  const followUpOptions: IDropdownOption[] = [
    { key: '1_day', text: '1 day' },
    { key: '2_days', text: '2 days' },
    { key: '3_days', text: '3 days' },
    { key: '7_days', text: '7 days' },
    { key: '14_days', text: '14 days' },
    { key: '30_days', text: '30 days' },
  ];

  function handleMultiSelectChange(blockTitle: string, selected: string[]) {
    setSelectedTemplateOptions((prev) => ({ ...prev, [blockTitle]: selected }));
  }
  function handleSingleSelectChange(blockTitle: string, selected: string) {
    setSelectedTemplateOptions((prev) => ({ ...prev, [blockTitle]: selected }));
  }
  function applyFormat(command: string, value?: string) {
    document.execCommand(command, false, value);
    if (bodyEditorRef.current) {
      setBody(bodyEditorRef.current.innerHTML);
    }
  }
  function handleBlur() {
    if (bodyEditorRef.current) {
      setBody(bodyEditorRef.current.innerHTML);
    }
  }
  function handleClearBlock(block: TemplateBlock) {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [block.title]: block.isMultiSelect ? [] : '',
    }));
    setInsertedBlocks((prev) => ({ ...prev, [block.title]: false }));
    setBody((prevBody) => {
      const placeholder = block.placeholder;
      const regex = new RegExp(
        `(<span[^>]*data-inserted="${block.title.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}"[^>]*>)([\\s\\S]*?)(</span>)`,
        'g'
      );
      const newBody = prevBody.replace(
        regex,
        `<span data-placeholder="${placeholder}" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${placeholder}</span>`
      );
      return newBody;
    });
  }

  // Auto-insert single-option blocks for Risk, Next Steps, Closing
  useEffect(() => {
    templateBlocks.forEach((block) => {
      if (
        ['Risk Assessment', 'Next Steps', 'Closing Notes'].includes(block.title) &&
        block.options.length === 1
      ) {
        const selectedOption = block.options[0].label;
        setSelectedTemplateOptions((prev) => ({
          ...prev,
          [block.title]: block.isMultiSelect ? [selectedOption] : selectedOption,
        }));
        insertTemplateBlock(block, block.isMultiSelect ? [selectedOption] : selectedOption);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If area_of_work is "commercial", auto-insert more blocks
  useEffect(() => {
    if (enquiry.Area_of_Work && enquiry.Area_of_Work.toLowerCase() === 'commercial') {
      templateBlocks.forEach((block) => {
        if (block.title === 'Introduction') {
          const autoOptionLabel = 'Standard Acknowledgment';
          const optionExists = block.options.find((o) => o.label === autoOptionLabel);
          if (optionExists) {
            setSelectedTemplateOptions((prev) => ({
              ...prev,
              [block.title]: block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel,
            }));
            insertTemplateBlock(block, block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel);
          }
        }
        if (block.title === 'Current Situation and Problem') {
          const autoOptionLabel = 'Current Position and Problems';
          const opt = block.options.find((o) => o.label === autoOptionLabel);
          if (opt) {
            setSelectedTemplateOptions((prev) => ({
              ...prev,
              [block.title]: block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel,
            }));
            insertTemplateBlock(block, block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel);
          }
        }
        if (block.title === 'Scope of Work') {
          const autoOptionLabel = 'Initial Steps- Review and Advice';
          const opt = block.options.find((o) => o.label === autoOptionLabel);
          if (opt) {
            setSelectedTemplateOptions((prev) => ({
              ...prev,
              [block.title]: block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel,
            }));
            insertTemplateBlock(block, block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel);
          }
        }
      });
    }
  }, [enquiry.Area_of_Work]);

  /** Some styling objects */
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
    flexDirection: 'column',
    gap: '20px',
    boxSizing: 'border-box',
  });

  const formContainerStyle = mergeStyles({
    flex: '1 1 0',
    minWidth: '300px',
    display: 'flex',
    flexDirection: 'column',
  });
  const templatesContainerStyle = mergeStyles({
    flex: '0 0 50%',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    alignSelf: 'flex-start',
    maxHeight: 'calc(100vh - 160px)',
    overflowY: 'auto',
  });
  const templatesGridStyle = mergeStyles({
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxHeight: '100%',
  });
  const buttonGroupStyle = mergeStyles({
    gap: '15px',
    marginTop: '20px',
    width: '100%',
  });
  const labelStyle = mergeStyles({
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    paddingTop: '20px',
    paddingBottom: '5px',
  });
  const toolbarStyle = mergeStyles({
    display: 'flex',
    gap: '10px',
    marginBottom: '8px',
  });

  const fullName = `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim();

  return (
    <Stack className={containerStyle}>
      {/* Top row: left (to/cc/bcc/subject), right (initial notes) */}
      <Stack horizontal tokens={{ childrenGap: 20 }} verticalAlign="stretch">
        <Stack style={{ width: '50%' }} className={formContainerStyle} tokens={{ childrenGap: 20 }}>
          <Text variant="xLarge" styles={{ root: { fontWeight: '700', color: colours.highlight } }}>
            Pitch Builder
          </Text>
          <Stack tokens={{ childrenGap: 20 }}>
            <Stack horizontal tokens={{ childrenGap: 10 }} verticalAlign="start">
              <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
                <Label className={labelStyle}>To</Label>
                <BubbleTextField
                  value={to}
                  onChange={(
                    _: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
                    newValue?: string
                  ) => setTo(newValue || '')}
                  placeholder="Enter recipient addresses"
                  ariaLabel="To Addresses"
                  isDarkMode={isDarkMode}
                  style={{ borderRadius: '8px' }}
                />
              </Stack>
              <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
                <Label className={labelStyle}>CC</Label>
                <BubbleTextField
                  value={cc}
                  onChange={(
                    _: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
                    newValue?: string
                  ) => setCc(newValue || '')}
                  placeholder="CC addresses"
                  ariaLabel="CC Addresses"
                  isDarkMode={isDarkMode}
                  style={{ borderRadius: '8px' }}
                />
              </Stack>
              <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
                <Label className={labelStyle}>BCC</Label>
                <BubbleTextField
                  value={bcc}
                  onChange={(
                    _: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
                    newValue?: string
                  ) => setBcc(newValue || '')}
                  placeholder="BCC addresses"
                  ariaLabel="BCC Addresses"
                  isDarkMode={isDarkMode}
                  style={{ borderRadius: '8px' }}
                />
              </Stack>
            </Stack>
            <Stack tokens={{ childrenGap: 6 }}>
              <Label className={labelStyle}>Subject Line</Label>
              <BubbleTextField
                value={subject}
                onChange={(
                  _: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
                  newValue?: string
                ) => setSubject(newValue || '')}
                placeholder="Enter email subject"
                ariaLabel="Email Subject"
                isDarkMode={isDarkMode}
                style={{ borderRadius: '8px' }}
              />
            </Stack>
          </Stack>
        </Stack>

        {/* Right container: initial notes */}
        {enquiry.Initial_first_call_notes && (
          <Stack
            style={{
              width: '50%',
              backgroundColor: isDarkMode
                ? colours.dark.sectionBackground
                : colours.light.sectionBackground,
              padding: '15px',
              borderRadius: '8px',
              boxShadow: isDarkMode
                ? '0 2px 5px rgba(255,255,255,0.1)'
                : '0 2px 5px rgba(0,0,0,0.1)',
              overflowY: 'auto',
              maxHeight: '240px',
            }}
            tokens={{ childrenGap: 6 }}
          >
            <Text
              variant="mediumPlus"
              styles={{
                root: {
                  fontWeight: '600',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '10px',
                },
              }}
            >
              Enquiry Notes or Message
            </Text>
            <Text
              variant="small"
              styles={{
                root: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  whiteSpace: 'pre-wrap',
                },
              }}
            >
              {enquiry.Initial_first_call_notes}
            </Text>
          </Stack>
        )}
      </Stack>

      {/* Next row: left = body editor, right = template blocks */}
      <Stack horizontal tokens={{ childrenGap: 20 }} style={{ width: '100%' }}>
        <Stack style={{ width: '50%' }} tokens={{ childrenGap: 20 }}>
          <Label className={labelStyle}>Email Body</Label>
          <Stack horizontal tokens={{ childrenGap: 20 }}>
            <Stack tokens={{ childrenGap: 6 }} grow>
              <div className={toolbarStyle}>
                <IconButton iconProps={boldIcon} ariaLabel="Bold" onClick={() => applyFormat('bold')} />
                <IconButton iconProps={italicIcon} ariaLabel="Italic" onClick={() => applyFormat('italic')} />
                <IconButton iconProps={underlineIcon} ariaLabel="Underline" onClick={() => applyFormat('underline')} />
                <IconButton
                  iconProps={unorderedListIcon}
                  ariaLabel="Bulleted List"
                  onClick={() => applyFormat('insertUnorderedList')}
                />
                <IconButton
                  iconProps={orderedListIcon}
                  ariaLabel="Numbered List"
                  onClick={() => applyFormat('insertOrderedList')}
                />
                <IconButton
                  iconProps={linkIcon}
                  ariaLabel="Insert Link"
                  onClick={() => {
                    const url = prompt('Enter the URL');
                    if (url) {
                      applyFormat('createLink', url);
                    }
                  }}
                />
              </div>

              <div
                contentEditable
                ref={bodyEditorRef}
                onBlur={handleBlur}
                suppressContentEditableWarning={true}
                className={sharedEditorStyle(isDarkMode)}
                style={{
                  flexGrow: 1,
                  overflowY: 'auto',
                  height: 'auto',
                  minHeight: '200px',
                  maxHeight: 'none',
                }}
                aria-label="Email Body Editor"
                onMouseUp={saveSelection}
                onKeyUp={saveSelection}
              />
            </Stack>
          </Stack>

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

          <Stack horizontal horizontalAlign="space-between" className={buttonGroupStyle}>
            <PrimaryButton
              text="Preview Email"
              onClick={togglePreview}
              styles={sharedPrimaryButtonStyles}
              ariaLabel="Preview Email"
              iconProps={{ iconName: 'Preview' }}
            />
            <DefaultButton
              text="Reset"
              onClick={resetForm}
              styles={sharedDefaultButtonStyles}
              ariaLabel="Reset Form"
              iconProps={{ iconName: 'Refresh' }}
            />
          </Stack>
        </Stack>

        {/* Right: Template Blocks */}
        <Stack className={templatesContainerStyle}>
          <Text variant="xLarge" styles={{ root: { fontWeight: '700', color: colours.highlight } }}>
            Template Blocks
          </Text>
          <Stack className={templatesGridStyle}>
            {templateBlocks.map((block: TemplateBlock) => (
              <Stack
                key={block.title}
                className={mergeStyles({
                  padding: '15px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background-color 0.2s, box-shadow 0.2s',
                  backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                  ':hover': {
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  },
                })}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const selOption = selectedTemplateOptions[block.title];
                  if (selOption) {
                    insertTemplateBlock(block, selOption);
                  }
                }}
                aria-label={`Insert template block ${block.title}`}
              >
                <IconButton
                  iconProps={clearIcon}
                  ariaLabel={`Clear ${block.title}`}
                  className={mergeStyles({
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    ':hover': {
                      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                    },
                    width: '24px',
                    height: '24px',
                    padding: '0',
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearBlock(block);
                  }}
                />

                <Stack tokens={{ childrenGap: 10 }}>
                  <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', color: colours.highlight } }}>
                    {block.title}
                  </Text>
                  <Text
                    variant="small"
                    styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}
                  >
                    {block.description}
                  </Text>

                  <Dropdown
                    placeholder={block.isMultiSelect ? 'Select options' : 'Select an option'}
                    multiSelect={block.isMultiSelect}
                    options={block.options.map((opt: TemplateOption) => ({
                      key: opt.label,
                      text: opt.label,
                    }))}
                    onChange={(_evt, option?: IDropdownOption) => {
                      if (option) {
                        if (block.isMultiSelect) {
                          const current = Array.isArray(selectedTemplateOptions[block.title])
                            ? (selectedTemplateOptions[block.title] as string[])
                            : [];
                          const updated = option.selected
                            ? [...current, option.key as string]
                            : current.filter((k) => k !== option.key);
                          handleMultiSelectChange(block.title, updated);
                        } else {
                          handleSingleSelectChange(block.title, option.key as string);
                        }
                      }
                    }}
                    selectedKeys={
                      block.isMultiSelect
                        ? Array.isArray(selectedTemplateOptions[block.title])
                          ? (selectedTemplateOptions[block.title] as string[])
                          : []
                        : typeof selectedTemplateOptions[block.title] === 'string'
                        ? [selectedTemplateOptions[block.title] as string]
                        : []
                    }
                    styles={sharedOptionsDropdownStyles(isDarkMode)}
                    ariaLabel={`Select options for ${block.title}`}
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                    onFocus={(e: React.FocusEvent<HTMLDivElement>) => e.stopPropagation()}
                  />

                  {/* Render a preview for single or multiSelect */}
                  {(() => {
                    if (!selectedTemplateOptions[block.title]) return null;
                    const isInserted = insertedBlocks[block.title] || false;
                    const formatPreviewText = (txt: string) => txt.replace(/\n/g, '<br />');

                    if (block.isMultiSelect && Array.isArray(selectedTemplateOptions[block.title])) {
                      const arr = selectedTemplateOptions[block.title] as string[];
                      if (arr.length === 0) return null;
                      return (
                        <div
                          className={mergeStyles({
                            marginTop: '10px',
                            border: isInserted
                              ? `1px solid ${colours.highlightYellow}`
                              : `1px dashed ${colours.highlightBlue}`,
                            padding: '10px',
                            borderRadius: '4px',
                          })}
                        >
                          <ul>
                            {arr.map((item) => (
                              <li
                                key={item}
                                dangerouslySetInnerHTML={{
                                  __html: formatPreviewText(
                                    block.options.find((o) => o.label === item)?.previewText.trim() || item
                                  ),
                                }}
                              ></li>
                            ))}
                          </ul>
                        </div>
                      );
                    } else if (!block.isMultiSelect && typeof selectedTemplateOptions[block.title] === 'string') {
                      const opt = block.options.find(
                        (o) => o.label === (selectedTemplateOptions[block.title] as string)
                      );
                      if (!opt) return null;
                      return (
                        <div
                          className={mergeStyles({
                            marginTop: '10px',
                            border: isInserted
                              ? `1px solid ${colours.highlightYellow}`
                              : `1px dashed ${colours.highlightBlue}`,
                            padding: '10px',
                            borderRadius: '4px',
                          })}
                        >
                          <span
                            dangerouslySetInnerHTML={{
                              __html: formatPreviewText(opt ? opt.previewText.trim() : ''),
                            }}
                          />
                        </div>
                      );
                    }
                    return null;
                  })()}
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Stack>

      {/* Preview Panel */}
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
            backgroundColor: isDarkMode ? 'rgba(30, 30, 30, 0.9)' : 'rgba(240, 242, 245, 0.9)',
            color: isDarkMode ? colours.dark.text : colours.light.text,
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          },
        }}
      >
        <Stack tokens={{ childrenGap: 15 }} styles={{ root: { flex: 1 } }}>
          <Separator />
          <Text variant="medium">
            <strong style={{ color: colours.cta }}>
              You're sending an email to {fullName || 'N/A'}
            </strong>
            <span style={{ color: colours.greyText, margin: '0 8px' }}>&bull;</span>
            {enquiry.Point_of_Contact || 'N/A'}
          </Text>
          <MessageBar
            messageBarType={MessageBarType.info}
            isMultiline={false}
            styles={{ root: { backgroundColor: colours.grey } }}
          >
            This is {enquiry.First_Name || 'the prospect'}'s first enquiry. You're responding on the
            same day.
          </MessageBar>

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

          <Separator />

          {/* Subject */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text
              variant="large"
              styles={{
                root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' },
              }}
            >
              Subject:
            </Text>
            <Text variant="medium" styles={{ root: { whiteSpace: 'pre-wrap' } }}>
              {subject || 'N/A'}
            </Text>
          </Stack>

          <Separator />

          {/* Body - uses the same transformations as handleDraftEmail */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text
              variant="large"
              styles={{
                root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' },
              }}
            >
              Body:
            </Text>
            <div
              style={{ whiteSpace: 'normal' }}
              dangerouslySetInnerHTML={{
                __html: getPreviewHtml(), // see getPreviewHtml above
              }}
            />
          </Stack>

          {attachments.length > 0 && (
            <>
              <Separator />
              <Stack tokens={{ childrenGap: 6 }}>
                <Text
                  variant="large"
                  styles={{
                    root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' },
                  }}
                >
                  Attachments:
                </Text>
                <Stack tokens={{ childrenGap: 5 }}>
                  {attachments.map((attKey) => (
                    <Text key={attKey} variant="medium">
                      - {availableAttachments.find((o) => o.key === attKey)?.text}
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
                    root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' },
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

        <Stack
          horizontal
          tokens={{ childrenGap: 15 }}
          styles={{
            root: {
              marginTop: '20px',
            },
          }}
        >
          <PrimaryButton
            text="Send Email"
            onClick={sendEmail}
            styles={sharedPrimaryButtonStyles}
            ariaLabel="Send Email"
            iconProps={{ iconName: 'Mail' }}
          />
          <DefaultButton
            text="Draft Email"
            onClick={handleDraftEmail}
            styles={sharedDefaultButtonStyles}
            ariaLabel="Draft Email"
            iconProps={{ iconName: 'Edit' }}
          />
        </Stack>
      </Panel>
    </Stack>
  );
};

export default PitchBuilder;
