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
  sharedDraftConfirmedButtonStyles, // **Import the new style**
} from '../../app/styles/ButtonStyles';
import {
  sharedEditorStyle,
  sharedOptionsDropdownStyles,
} from '../../app/styles/FilterStyles';
import ReactDOMServer from 'react-dom/server';
import EmailSignature from './EmailSignature';

/**
 * Utility: turn consecutive <br><br> lines into real paragraphs (<p>...).
 * Some email clients (especially Outlook) collapse repeated <br> tags.
 * Converting them into <p> ensures consistent spacing.
 */
function convertDoubleBreaksToParagraphs(html: string): string {
  // 1) Normalize line endings (optional, but helps if you have \r\n combos):
  const normalized = html.replace(/\r\n/g, '\n');

  // 2) Split on two or more consecutive newlines:
  const paragraphs = normalized.split(/\n\s*\n/);

  // 3) Wrap each chunk in a <p> tag:
  const wrapped = paragraphs.map((paragraph) => {
    // Trim each paragraph just in case
    const trimmed = paragraph.trim();

    // If it’s empty, we can turn it into a single <p>&nbsp;</p> or skip it
    return trimmed
      ? `<p>${trimmed}</p>`
      : `<p style="margin:0;">&nbsp;</p>`;
  });

  // 4) Join them up without extra line breaks, so the final is all <p>…</p><p>…</p>
  return wrapped.join('');
}

interface PitchBuilderProps {
  enquiry: Enquiry;
  userData: any;
}

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

/**
 * Removes lines that contain leftover placeholders.
 * Also condenses multiple blank lines down to one.
 */
function removeUnfilledPlaceholders(text: string): string {
  const lines = text.split('\n');
  const filteredLines = lines.filter(
    (line) =>
      !leftoverPlaceholders.some((placeholder) => line.includes(placeholder))
  );

  const consolidated: string[] = [];
  for (const line of filteredLines) {
    if (
      line.trim() === '' &&
      consolidated.length > 0 &&
      consolidated[consolidated.length - 1].trim() === ''
    ) {
      continue;
    }
    consolidated.push(line);
  }

  return consolidated.join('\n').trim();
}

/**
 * Strips all the highlight <span> attributes (data-placeholder, data-inserted, etc.)
 * so final email doesn't have bright highlighting.
 */
function removeHighlightSpans(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const spans = tempDiv.querySelectorAll(
    'span[data-placeholder], span[data-inserted], span[data-link]'
  );
  spans.forEach((span) => {
    span.removeAttribute('style');
    span.removeAttribute('data-placeholder');
    span.removeAttribute('data-inserted');
    span.removeAttribute('data-link');
  });
  return tempDiv.innerHTML;
}

/**
 * When we insert multiline text from the TemplateBlocks, we turn raw newlines into <br />.
 */
function cleanTemplateString(template: string): string {
  return template
    .replace(/^\s*\n|\n\s*$/g, '')
    .replace(/\n/g, '<br />');
}

const boldIcon: IIconProps = { iconName: 'Bold' };
const italicIcon: IIconProps = { iconName: 'Italic' };
const underlineIcon: IIconProps = { iconName: 'Underline' };
const unorderedListIcon: IIconProps = { iconName: 'BulletedList' };
const orderedListIcon: IIconProps = { iconName: 'NumberedList' };
const linkIcon: IIconProps = { iconName: 'Link' };
const clearIcon: IIconProps = { iconName: 'Cancel' };

// A quick helper: do we have an array of strings or a single string?
function isStringArray(value: string | string[]): value is string[] {
  return Array.isArray(value);
}

/**
 * Replaces placeholders in the base template, e.g. [Enquiry.First_Name].
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

  // Insert highlight spans so user can see placeholders in the editor
  return template
    .replace(
      /\[Enquiry.First_Name\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;" data-placeholder="[Enquiry.First_Name]">${
        enquiry.First_Name || 'there'
      }</span>`
    )
    .replace(
      /\[Enquiry.Point_of_Contact\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;" data-placeholder="[Enquiry.Point_of_Contact]">${
        enquiry.Point_of_Contact || 'Our Team'
      }</span>`
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

const PitchBuilder: React.FC<PitchBuilderProps> = ({ enquiry, userData }) => {
  const { isDarkMode } = useTheme();

  // Simple helper to capitalize your "Area_of_Work" for the subject line
  function capitalizeWords(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Default subject
  const [subject, setSubject] = useState<string>(
    enquiry.Area_of_Work
      ? `Your ${capitalizeWords(enquiry.Area_of_Work)} Enquiry`
      : 'Your Enquiry'
  );

  // Default recipient fields
  const [to, setTo] = useState<string>(enquiry.Email || '');
  const [cc, setCc] = useState<string>('');
  const [bcc, setBcc] = useState<string>('1day@followupthen.com');

  // Basic template that includes placeholders
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

[First Name]<br>
<br>
[Full Name]<br>
[Position]`;

  // The main "body" of the editor content
  // We'll insert placeholders right away
  const [body, setBody] = useState<string>(() => {
    // Optionally you can do the placeholder replacements here if desired
    return replacePlaceholders(BASE_TEMPLATE, '', enquiry, userData)
      .split('\n')
      .map((line) => line.trim())
      .join('\n');
  });

  // Attachments, followUp, preview, error states, etc...
  const [attachments, setAttachments] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState<string | undefined>(undefined);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // **New State: Confirmation State for Draft Email Button**
  const [isDraftConfirmed, setIsDraftConfirmed] = useState<boolean>(false);

  // Tracks selected template options for each block
  const [selectedTemplateOptions, setSelectedTemplateOptions] = useState<{
    [key: string]: string | string[];
  }>({});

  // Tracks which blocks have been inserted
  const [insertedBlocks, setInsertedBlocks] = useState<{ [key: string]: boolean }>({});

  // For the body editor
  const bodyEditorRef = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<Range | null>(null);

  /**
   * Save the user's cursor selection in the contentEditable, so we can insert text at that exact spot.
   */
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

  /**
   * Insert some HTML at the cursor. If there's no selection, we append at the end.
   */
  function insertAtCursor(html: string) {
    if (!isSelectionInsideEditor()) {
      setBody((prevBody) => prevBody + `\n\n${html}`);
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
   * Insert a template block's text (either single or multiSelect) at the corresponding placeholder <span>.
   */
  function insertTemplateBlock(
    block: TemplateBlock,
    selectedOption: string | string[]
  ) {
    let replacementText = '';

    // MultiSelect
    if (block.isMultiSelect && isStringArray(selectedOption)) {
      if (block.title === 'Required Documents') {
        // If "Required Documents", let's create a <ul> instead of <br><br>
        replacementText = `<ul>${selectedOption
          .map((doc: string) => {
            const option = block.options.find((o) => o.label === doc);
            return `<li>${option ? option.previewText.trim() : doc}</li>`;
          })
          .join('')}</ul>`;
      } else {
        replacementText = selectedOption
          .map((item: string) => {
            const option = block.options.find((o) => o.label === item);
            return option ? option.previewText.trim() : item;
          })
          .join('<br />');
      }
    }
    // SingleSelect
    else if (!block.isMultiSelect && typeof selectedOption === 'string') {
      const option = block.options.find((o) => o.label === selectedOption);
      replacementText = option ? option.previewText.trim() : '';
      // Convert newlines to <br>
      replacementText = replacementText.replace(/\n/g, '<br />');
    }

    // Highlight the inserted block
    const highlightedReplacement = `<span style="background-color: ${
      colours.highlightYellow
    }; padding: 0 3px;" data-inserted="${
      block.title
    }" data-placeholder="${
      block.placeholder
    }">${cleanTemplateString(replacementText)}</span>`;

    // Actually replace the <span data-placeholder="..."> in the current body
    setBody((prevBody) => {
      const newBody = prevBody.replace(
        new RegExp(
          `(<span[^>]*data-placeholder="${block.placeholder.replace(
            /[-[\]{}()*+?.,\\^$|#\s]/g,
            '\\$&'
          )}"[^>]*>)([\\s\\S]*?)(</span>)`,
          'g'
        ),
        `$1${highlightedReplacement}$3`
      );
      return newBody;
    });

    setInsertedBlocks((prev) => ({ ...prev, [block.title]: true }));

    // Move cursor just after the inserted block
    setTimeout(() => {
      if (bodyEditorRef.current) {
        const insertedSpan = bodyEditorRef.current.querySelector(
          `span[data-inserted="${block.title}"]`
        );
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
   * When the user chooses an attachment from the list, we either insert or remove it.
   */
  function toggleAttachment(attachment: AttachmentOption) {
    if (attachment.status === 'draft') {
      return;
    }
    if (attachments.includes(attachment.key)) {
      // remove
      setAttachments((prev) => prev.filter((key) => key !== attachment.key));
      removeAttachmentLink(attachment.key);
    } else {
      setAttachments((prev) => [...prev, attachment.key]);
      saveSelection();
      const linkHTML = `<span style="background-color: #ffe6e6; padding: 0 3px;" data-link="${attachment.key}"><a href="${attachment.link}" style="color: #3690CE; text-decoration: none;">${attachment.text}</a></span>`;
      insertAtCursor(linkHTML);
    }
  }

  /**
   * Removes the <span data-link="..."> for an attachment
   */
  function removeAttachmentLink(key: string) {
    if (bodyEditorRef.current) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = bodyEditorRef.current.innerHTML;
      const spans = tempDiv.querySelectorAll(`span[data-link="${key}"]`);
      spans.forEach((span) => {
        const parent = span.parentNode;
        if (parent) {
          parent.removeChild(span);
        }
      });
      const newBody = tempDiv.innerHTML;
      setBody(newBody);
    }
  }

  function getFilteredAttachments(): AttachmentOption[] {
    // Show only attachments relevant to the selected practice area
    const practiceArea = Object.keys(PracticeAreaPitch).find(
      (k) => PracticeAreaPitch[k as keyof PracticeAreaPitchType]
    ) || '';
    return availableAttachments.filter(
      (attachment) =>
        !attachment.applicableTo ||
        attachment.applicableTo.includes(practiceArea)
    );
  }

  function togglePreview() {
    setIsPreviewOpen(!isPreviewOpen);
  }

  /**
   * Reset the entire form
   */
  function resetForm() {
    setSubject('Your Practice Area Enquiry');
    setTo(enquiry.Email || '');
    setCc('');
    setBcc('2day@followupthen.com');
    // Re-load the base template
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
    setIsDraftConfirmed(false); // **Reset confirmation state**
  }

  /**
   * Validate mandatory fields
   */
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

  /**
   * If user hits "Send Email" in the preview, we might do something else.
   * For now, just console.log and reset.
   */
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

  /**
   * handleDraftEmail: keep HTML, remove placeholders & highlights, convert <br><br> to <p>, then pass to EmailSignature.
   */
  async function handleDraftEmail() {
    if (!body || !enquiry.Point_of_Contact) {
      setErrorMessage('Email contents and user email are required.');
      setIsErrorVisible(true);
      return;
    }

    // Remove highlight spans
    const rawHtml = removeHighlightSpans(body);

    // Remove leftover placeholders
    const noPlaceholders = removeUnfilledPlaceholders(rawHtml);

    // After removing leftover placeholders/highlights in handleDraftEmail():
    const finalHtml = convertDoubleBreaksToParagraphs(noPlaceholders);

    // Instead of just passing finalHtml, wrap it in a table:
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
      setIsDraftConfirmed(true); // **Set confirmation state**
      // Revert the confirmation state after 3 seconds
      setTimeout(() => {
        setIsDraftConfirmed(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error drafting email:', error);
      setErrorMessage(error.message || 'An unknown error occurred.');
      setIsErrorVisible(true);
    }
  }

  /**
   * Hide success message automatically after 3s
   */
  useEffect(() => {
    if (isSuccessVisible) {
      const timer = setTimeout(() => setIsSuccessVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccessVisible]);

  /**
   * Hide error after 5s
   */
  useEffect(() => {
    if (isErrorVisible) {
      const timer = setTimeout(() => setIsErrorVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isErrorVisible]);

  /**
   * Keep the editor's HTML in sync with our `body` state
   */
  useEffect(() => {
    if (bodyEditorRef.current && bodyEditorRef.current.innerHTML !== body) {
      bodyEditorRef.current.innerHTML = body;
    }
  }, [body]);

  // Example follow-up options
  const followUpOptions: IDropdownOption[] = [
    { key: '1_day', text: '1 day' },
    { key: '2_days', text: '2 days' },
    { key: '3_days', text: '3 days' },
    { key: '7_days', text: '7 days' },
    { key: '14_days', text: '14 days' },
    { key: '30_days', text: '30 days' },
  ];

  /**
   * Update selected template options for multi-select blocks
   */
  function handleMultiSelectChange(blockTitle: string, selectedOptions: string[]) {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOptions,
    }));
  }

  /**
   * Update selected template options for single-select blocks
   */
  function handleSingleSelectChange(blockTitle: string, selectedOption: string) {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOption,
    }));
  }

  /**
   * For simple formatting commands (bold, italic, etc.)
   */
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

  /**
   * When you click "clear" on a block, we remove its inserted text, 
   * restoring the original placeholder <span>.
   */
  function handleClearBlock(block: TemplateBlock) {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [block.title]: block.isMultiSelect ? [] : '',
    }));
    setInsertedBlocks((prev) => ({ ...prev, [block.title]: false }));
    setBody((prevBody) => {
      const placeholder = block.placeholder;
      const regex = new RegExp(
        `(<span[^>]*data-inserted="${block.title.replace(
          /[-[\]{}()*+?.,\\^$|#\s]/g,
          '\\$&'
        )}"[^>]*>)([\\s\\S]*?)(</span>)`,
        'g'
      );
      const newBody = prevBody.replace(
        regex,
        `<span data-placeholder="${placeholder}" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${placeholder}</span>`
      );
      return newBody;
    });
  }

  /**
   * Renders the "preview" text for a selected block in the UI
   */
  function renderPreview(block: TemplateBlock) {
    const selectedOptions = selectedTemplateOptions[block.title];
    const isInserted = insertedBlocks[block.title] || false;

    if (
      !selectedOptions ||
      (block.isMultiSelect &&
        Array.isArray(selectedOptions) &&
        selectedOptions.length === 0)
    ) {
      return null;
    }

    const formatPreviewText = (text: string) => {
      // Convert embedded newlines to <br> for display in the preview
      return text.replace(/\n/g, '<br />');
    };

    if (block.isMultiSelect && Array.isArray(selectedOptions)) {
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
            {selectedOptions.map((doc: string) => (
              <li
                key={doc}
                dangerouslySetInnerHTML={{
                  __html: formatPreviewText(
                    block.options.find((o) => o.label === doc)?.previewText.trim() || doc
                  ),
                }}
              ></li>
            ))}
          </ul>
        </div>
      );
    } else if (typeof selectedOptions === 'string') {
      const option = block.options.find((o) => o.label === selectedOptions);
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
              __html: formatPreviewText(option ? option.previewText.trim() : ''),
            }}
          />
        </div>
      );
    }
    return null;
  }

  // Auto-insert single-option blocks for "Risk Assessment", "Next Steps", and "Closing Notes" on mount
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
        insertTemplateBlock(
          block,
          block.isMultiSelect ? [selectedOption] : selectedOption
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-insert additional blocks for Commercial area of work
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
          const optionExists = block.options.find((o) => o.label === autoOptionLabel);
          if (optionExists) {
            setSelectedTemplateOptions((prev) => ({
              ...prev,
              [block.title]: block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel,
            }));
            insertTemplateBlock(block, block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel);
          }
        }
        if (block.title === 'Scope of Work') {
          const autoOptionLabel = 'Initial Steps- Review and Advice';
          const optionExists = block.options.find((o) => o.label === autoOptionLabel);
          if (optionExists) {
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

  // Some styling
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
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxHeight: '100%',
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

  const bubblesContainerStyle = mergeStyles({
    display: 'flex',
    overflowX: 'auto',
    padding: '10px 0',
    gap: '10px',
  });

  const bubbleStyle = mergeStyles({
    padding: '8px 12px',
    borderRadius: '20px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    cursor: 'pointer',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    flexShrink: 0, // Prevent bubbles from shrinking
    width: 'auto', // Allow bubbles to expand based on content
    ':hover': {
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
  });

  // New style for greyed-out attachment bubbles
  const attachmentBubbleStyle = mergeStyles({
    padding: '8px 12px',
    borderRadius: '20px',
    backgroundColor: isDarkMode
      ? colours.dark.disabledBackground
      : colours.light.disabledBackground,
    color: colours.greyText,
    cursor: 'default',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    flexShrink: 0, // Prevent bubbles from shrinking
    width: 'auto', // Allow bubbles to expand based on content
    border: `1px solid ${
      isDarkMode ? colours.dark.borderColor : colours.light.borderColor
    }`,
    ':hover': {
      backgroundColor: isDarkMode
        ? colours.dark.disabledBackground
        : colours.light.disabledBackground,
    },
  });

  const fullName = `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim();

  /**
   * Handles scrolling to the selected template block
   */
  function handleScrollToBlock(blockTitle: string) {
    const blockElement = document.getElementById(`template-block-${blockTitle.replace(/\s+/g, '-')}`);
    if (blockElement) {
      blockElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Optionally, highlight the block temporarily
      blockElement.style.transition = 'background-color 0.5s';
      blockElement.style.backgroundColor = colours.highlightYellow;
      setTimeout(() => {
        blockElement.style.backgroundColor = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
      }, 1000);
    }
  }

  const filteredAttachments = getFilteredAttachments();

  return (
    <Stack className={containerStyle}>
      {/* Row: Left (Form Fields) and Right (Initial Notes) */}
      <Stack horizontal tokens={{ childrenGap: 20 }} verticalAlign="stretch">
        {/* Left Column: To, CC, BCC, Subject Line */}
        <Stack style={{ width: '50%' }} className={formContainerStyle} tokens={{ childrenGap: 20 }}>
          {/* Labels and Inputs */}
          {/* First Row: To, CC, BCC */}
          <Stack horizontal tokens={{ childrenGap: 10 }} verticalAlign="start">
            <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
              <Label className={labelStyle}>To</Label>
              <BubbleTextField
                value={to}
                onChange={(
                  _: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
                  newValue?: string
                ) => setTo(newValue || '')}
                placeholder="Enter recipient addresses, separated by commas"
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
                placeholder="Enter CC addresses, separated by commas"
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
                placeholder="Enter BCC addresses, separated by commas"
                ariaLabel="BCC Addresses"
                isDarkMode={isDarkMode}
                style={{ borderRadius: '8px' }}
              />
            </Stack>
          </Stack>

          {/* Second Row: Subject Line */}
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

        {/* Right Column: Enquiry Notes or Message */}
        <Stack style={{ width: '50%', height: '100%' }} className={formContainerStyle} tokens={{ childrenGap: 6 }}>
          {/* Label: Enquiry Notes or Message */}
          <Label className={labelStyle}>Enquiry Notes or Message</Label>
          {/* Notes Box */}
          {enquiry.Initial_first_call_notes && (
            <div
              style={{
                backgroundColor: isDarkMode
                  ? colours.dark.sectionBackground
                  : colours.light.sectionBackground,
                padding: '10px',
                borderRadius: '8px',
                boxShadow: isDarkMode
                  ? '0 2px 5px rgba(255,255,255,0.1)'
                  : '0 2px 5px rgba(0, 0, 0, 0.1)',
                overflowY: 'auto',
                height: '100%',
              }}
            >
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
            </div>
          )}
        </Stack>
      </Stack>

      {/* Row: Email Body and Template Blocks */}
      <Stack horizontal tokens={{ childrenGap: 20 }} style={{ width: '100%' }}>
        {/* Left Column: Email Body */}
        <Stack style={{ width: '50%' }} tokens={{ childrenGap: 20 }}>
          <Label className={labelStyle}>Email Body</Label>
          <Stack tokens={{ childrenGap: 20 }}>
            <Stack horizontal tokens={{ childrenGap: 20 }}>
              <Stack tokens={{ childrenGap: 6 }} grow>
                <div className={toolbarStyle}>
                  <IconButton iconProps={boldIcon} ariaLabel="Bold" onClick={() => applyFormat('bold')} />
                  <IconButton
                    iconProps={italicIcon}
                    ariaLabel="Italic"
                    onClick={() => applyFormat('italic')}
                  />
                  <IconButton
                    iconProps={underlineIcon}
                    ariaLabel="Underline"
                    onClick={() => applyFormat('underline')}
                  />
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

            {/* Attachments Section Below Email Body Editor */}
            <Stack tokens={{ childrenGap: 6 }}>
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 5 }}>
                <Label className={labelStyle}>Attachments</Label>
                <Text variant="small" styles={{ root: { color: colours.greyText } }}>
                  (Available soon)
                </Text>
              </Stack>
              <div className={bubblesContainerStyle}>
                {filteredAttachments.map((attachment) => (
                  <div
                    key={`attachment-${attachment.key}`}
                    className={attachmentBubbleStyle}
                    role="button"
                    tabIndex={0}
                    aria-label={`Attachment ${attachment.text} (Coming Soon)`}
                  >
                    {attachment.text}
                  </div>
                ))}
              </div>
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
        </Stack>

        {/* Right Column: Template Blocks */}
        <Stack style={{ width: '50%' }} tokens={{ childrenGap: 20 }}>
          <Label className={labelStyle}>Template Blocks</Label>

          {/* **Added Horizontal Bubbles for Template Blocks** */}
          <div className={bubblesContainerStyle}>
            {templateBlocks.map((block: TemplateBlock) => (
              <div
                key={`bubble-${block.title}`}
                className={bubbleStyle}
                onClick={() => handleScrollToBlock(block.title)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleScrollToBlock(block.title);
                  }
                }}
                aria-label={`Scroll to ${block.title} block`}
              >
                {block.title}
              </div>
            ))}
          </div>
          {/* **End of Added Bubbles** */}

          <Stack className={templatesContainerStyle}>
            <Stack className={templatesGridStyle}>
              {templateBlocks.map((block: TemplateBlock) => (
                <Stack
                  key={block.title}
                  id={`template-block-${block.title.replace(/\s+/g, '-')}`} // **Added ID for scrolling**
                  // example styling for the block "card"
                  className={mergeStyles({
                    padding: '15px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.2s, box-shadow 0.2s',
                    backgroundColor: isDarkMode
                      ? colours.dark.cardBackground
                      : colours.light.cardBackground,
                    ':hover': {
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    },
                  })}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const selectedOption = selectedTemplateOptions[block.title];
                    if (selectedOption) {
                      insertTemplateBlock(block, selectedOption);
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
                        backgroundColor: isDarkMode
                          ? colours.dark.cardHover
                          : colours.light.cardHover,
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

                    <Dropdown
                      placeholder={
                        block.isMultiSelect ? 'Select options' : 'Select an option'
                      }
                      multiSelect={block.isMultiSelect}
                      options={block.options.map((option: TemplateOption) => ({
                        key: option.label,
                        text: option.label,
                      }))}
                      onChange={(
                        _: React.FormEvent<HTMLDivElement>,
                        option?: IDropdownOption
                      ) => {
                        if (option) {
                          if (block.isMultiSelect) {
                            const currentSelections = Array.isArray(
                              selectedTemplateOptions[block.title]
                            )
                              ? (selectedTemplateOptions[block.title] as string[])
                              : [];
                            const updatedSelections = option.selected
                              ? [...currentSelections, option.key as string]
                              : currentSelections.filter((key) => key !== option.key);
                            handleMultiSelectChange(block.title, updatedSelections);
                          } else {
                            handleSingleSelectChange(
                              block.title,
                              option.key as string
                            );
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

                    {renderPreview(block)}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Stack>

      {/* The Preview Panel */}
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
            This is {enquiry.First_Name || 'the prospect'}'s first enquiry. You're
            responding on the same day.
          </MessageBar>

          {isSuccessVisible && (
            <MessageBar
              messageBarType={MessageBarType.success}
              isMultiline={false}
              onDismiss={() => setIsSuccessVisible(false)}
              dismissButtonAriaLabel="Close"
              styles={{ root: { borderRadius: '4px', marginTop: '10px' } }} // **Moved and styled the message**
            >
              Email drafted successfully!
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

          {/* Body */}
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
              style={{ whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{
                __html: removeUnfilledPlaceholders(removeHighlightSpans(body)),
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
                  {attachments.map((att: string) => (
                    <Text key={att} variant="medium">
                      -{' '}
                      {availableAttachments.find((option) => option.key === att)?.text}
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
          {/* **Modified Draft Email Button with Confirmation State** */}
          <DefaultButton
            text={isDraftConfirmed ? 'Drafted' : 'Draft Email'}
            onClick={handleDraftEmail}
            styles={isDraftConfirmed ? sharedDraftConfirmedButtonStyles : sharedDefaultButtonStyles} // **Apply conditional styles**
            ariaLabel={isDraftConfirmed ? 'Email Drafted' : 'Draft Email'}
            iconProps={{ iconName: isDraftConfirmed ? 'CheckMark' : 'Edit' }} // **Change icon based on state**
            disabled={isDraftConfirmed} // **Optional: Disable button while in confirmed state**
          />
        </Stack>
      </Panel>
    </Stack>
  );
};

export default PitchBuilder;
