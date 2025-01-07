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
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../../app/styles/ButtonStyles';
import {
  sharedEditorStyle,
  sharedOptionsDropdownStyles,
} from '../../app/styles/FilterStyles';
import ReactDOMServer from 'react-dom/server';
import EmailSignature from './EmailSignature';

interface PitchBuilderProps {
  enquiry: Enquiry;
  userData: any;
}

const commonInputStyle = {
  height: '40px',
  lineHeight: '40px',
};

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
  // Removed '[Introduction Placeholder]'
];

function removeUnfilledPlaceholders(text: string): string {
  const lines = text.split('\n');
  const filteredLines = lines.filter(
    (line) => !leftoverPlaceholders.some((placeholder) => line.includes(placeholder))
  );

  const consolidated: string[] = [];
  for (const line of filteredLines) {
    // If this line is blank, and the previous line in consolidated is also blank, skip it
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

const stripHtmlTags = (html: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
};

const cleanTemplateString = (template: string): string => {
  return template
    .replace(/^\s*\n|\n\s*$/g, '')  // Remove leading/trailing blank lines
    // .replace(/\n{2,}/g, '\n');    // Remove this line to preserve multiple newlines
    .replace(/\n/g, '<br />');      // Replace single newlines with <br />
};

const boldIcon: IIconProps = { iconName: 'Bold' };
const italicIcon: IIconProps = { iconName: 'Italic' };
const underlineIcon: IIconProps = { iconName: 'Underline' };
const unorderedListIcon: IIconProps = { iconName: 'BulletedList' };
const orderedListIcon: IIconProps = { iconName: 'NumberedList' };
const linkIcon: IIconProps = { iconName: 'Link' };
const clearIcon: IIconProps = { iconName: 'Cancel' };

const attachmentTagStyle = (
  isSelected: boolean,
  isDarkMode: boolean,
  isDraft: boolean
) =>
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
    cursor: isDraft ? 'not-allowed' : 'pointer',
    userSelect: 'none',
    minWidth: '100px',
    textAlign: 'center',
    ':hover': {
      boxShadow: isDraft
        ? 'none'
        : '0 4px 8px rgba(0, 0, 0, 0.2)',
      transform: isDraft ? 'none' : 'translateY(-2px)',
      border: isDraft ? `1px solid ${colours.grey}` : '1px solid red',
      backgroundColor: isSelected
        ? colours.cta
        : isDarkMode
        ? colours.dark.cardHover
        : colours.light.cardHover,
    },
    transition: 'all 0.2s',
  });

const followUpTagStyle = (
  isSelected: boolean,
  isDarkMode: boolean
) =>
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
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
      transform: 'translateY(-2px)',
      border: '1px solid red',
      backgroundColor: isSelected
        ? colours.cta
        : isDarkMode
        ? colours.dark.cardHover
        : colours.light.cardHover,
    },
    transition: 'all 0.2s',
  });

const templateBlockStyle = (isDarkMode: boolean) =>
  mergeStyles({
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
  });

const templatePreviewStyle = (
  isDarkMode: boolean,
  isInserted: boolean
) =>
  mergeStyles({
    padding: '10px',
    borderRadius: '4px',
    overflow: 'hidden',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    backgroundColor: isDarkMode
      ? colours.dark.grey
      : colours.grey,
    textAlign: 'left',
    marginTop: '10px',
    fontSize: '14px',
    border: `1px ${isInserted ? 'solid' : 'dashed'} ${
      isInserted ? colours.highlightYellow : colours.highlightBlue
    }`,
    boxShadow: isDarkMode
      ? '0 2px 5px rgba(255, 255, 255, 0.1)'
      : '0 2px 5px rgba(0, 0, 0, 0.1)',
    transition: 'border 0.3s ease',
  });

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const replacePlaceholders = (
  template: string,
  intro: string,
  enquiry: Enquiry,
  userData: any
): string => {
  const userFullName = userData?.[0]?.['Full Name'] || '';

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
    // Removed Introduction Placeholder replacement as per the requirement
    .replace(
      /\[Current Situation and Problem Placeholder\]/g,
      `<span data-placeholder="[Current Situation and Problem Placeholder]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">[Current Situation and Problem Placeholder]</span>`
    )
    .replace(
      /\[FE Introduction Placeholder\]/g,
      `<span data-placeholder="[FE Introduction Placeholder]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">[FE Introduction Placeholder]</span>`
    )
    .replace(
      /\[(Scope of Work Placeholder|Risk Assessment Placeholder|Costs and Budget Placeholder|Follow-Up Instructions Placeholder|Closing Notes Placeholder|Required Documents Placeholder|Google Review Placeholder)\]/g,
      (match) =>
        `<span data-placeholder="${match}" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${match}</span>`
    )
    .replace(/\[User.Full_Name\]/g, userFullName || 'Unknown User');
};

const isStringArray = (value: string | string[]): value is string[] => {
  return Array.isArray(value);
};

const PitchBuilder: React.FC<PitchBuilderProps> = ({ enquiry, userData }) => {
  const userFullName = userData?.[0]?.['Full Name'] || 'Unknown User';
  const { isDarkMode } = useTheme();
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

  const [to, setTo] = useState<string>('');
  const [cc, setCc] = useState<string>('');
  const [bcc, setBcc] = useState<string>('');

  const BASE_TEMPLATE = `Dear [Enquiry.First_Name],

[FE Introduction Placeholder]

[Current Situation and Problem Placeholder]

[Scope of Work Placeholder]

[Risk Assessment Placeholder]

[Costs and Budget Placeholder]

[Required Documents Placeholder]

[Follow-Up Instructions Placeholder]

[Closing Notes Placeholder]

[Google Review Placeholder]

Kind regards,
[User.Full_Name]`;

  const normalizeBody = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

  const normalizeString = (str: string): string => {
    return str
      .toLowerCase()
      .split(' ')
      .map(
        (word) => word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join(' ');
  };

  const getMatchingPracticeAreas = (area: string): string[] => {
    const normalizedArea = normalizeString(area);
    const practiceAreas = Object.keys(
      PracticeAreaPitch
    ) as Array<keyof PracticeAreaPitchType>;

    const matchingPracticeAreas = practiceAreas.filter((pa) => {
      return pa.toLowerCase() === normalizedArea.toLowerCase();
    });

    return matchingPracticeAreas.length > 0
      ? matchingPracticeAreas
      : ['Miscellaneous (None of the above)'];
  };

  const getSelectedPracticeArea = (): keyof PracticeAreaPitchType => {
    const normalizedArea = normalizeString(enquiry.Area_of_Work.trim());
    const matchingPracticeAreas = getMatchingPracticeAreas(normalizedArea);
    return (
      (matchingPracticeAreas[0] as keyof PracticeAreaPitchType) ||
      'Miscellaneous (None of the above)'
    );
  };

  const selectedPracticeAreaKey = getSelectedPracticeArea();

  const [body, setBody] = useState<string>(
    normalizeBody(
      replacePlaceholders(
        BASE_TEMPLATE,
        '',
        enquiry,
        userData
      )
    )
  );

  const [attachments, setAttachments] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState<string | undefined>(undefined);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [selectedTemplateOptions, setSelectedTemplateOptions] = useState<{
    [key: string]: string | string[];
  }>({});

  const [insertedBlocks, setInsertedBlocks] = useState<{ [key: string]: boolean }>({});

  const bodyEditorRef = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<Range | null>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedSelection.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  };

  const isSelectionInsideEditor = (): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode!;
    }
    return bodyEditorRef.current?.contains(node) || false;
  };

  const insertAtCursor = (html: string) => {
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
  };

  const insertTemplateBlock = (
    block: TemplateBlock,
    selectedOption: string | string[]
  ) => {
    let replacementText = '';

    if (block.isMultiSelect && isStringArray(selectedOption)) {
      if (block.title === 'Required Documents') {
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
    } else if (!block.isMultiSelect && typeof selectedOption === 'string') {
      const option = block.options.find((o) => o.label === selectedOption);
      replacementText = option ? option.previewText.trim() : '';
      replacementText = replacementText.replace(/\n/g, '<br />');
    }

    const highlightedReplacement = `<span style="background-color: ${colours.highlightYellow}; padding: 0 3px;" data-inserted="${block.title}" data-placeholder="${block.placeholder}">${cleanTemplateString(
      replacementText
    )}</span>`;

    setBody((prevBody) => {
      const newBody = prevBody.replace(
        new RegExp(
          `(<span[^>]*data-placeholder="${escapeRegExp(block.placeholder)}"[^>]*>)([\\s\\S]*?)(</span>)`,
          'g'
        ),
        `$1${highlightedReplacement}$3`
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
  };

  const [template, setTemplate] = useState<string | undefined>(undefined);

  const toggleAttachment = (attachment: AttachmentOption) => {
    if (attachment.status === 'draft') {
      return;
    }

    if (attachments.includes(attachment.key)) {
      setAttachments((prev) => prev.filter((key) => key !== attachment.key));
      removeAttachmentLink(attachment.key);
    } else {
      setAttachments((prev) => [...prev, attachment.key]);
      saveSelection();
      const linkHTML = `<span style="background-color: #ffe6e6; padding: 0 3px;" data-link="${attachment.key}"><a href="${attachment.link}" style="color: #3690CE; text-decoration: none;">${attachment.text}</a></span>`;
      insertAtCursor(linkHTML);
    }
  };

  const removeAttachmentLink = (key: string) => {
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
  };

  const getFilteredAttachments = (): AttachmentOption[] => {
    return availableAttachments.filter(
      (attachment) =>
        !attachment.applicableTo || attachment.applicableTo.includes(selectedPracticeAreaKey)
    );
  };

  const togglePreview = () => {
    setIsPreviewOpen(!isPreviewOpen);
  };

  const getPlainTextBody = (htmlBody: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlBody;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  const resetForm = () => {
    setTemplate(undefined);
    setSubject('Your Practice Area Enquiry');
    setTo('');
    setCc('');
    setBcc('');
    setBody(
      normalizeBody(
        replacePlaceholders(
          BASE_TEMPLATE,
          '',
          enquiry,
          userData
        )
      )
    );
    setAttachments([]);
    setFollowUp(undefined);
    setIsPreviewOpen(false);
    setIsErrorVisible(false);
    setErrorMessage('');
    setSelectedTemplateOptions({});
    setInsertedBlocks({});
  };

  const validateForm = (): boolean => {
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
  };

  const sendEmail = () => {
    if (validateForm()) {
      const followUpText = followUp
        ? `\n\nFollow Up: ${
            followUpOptions.find((opt) => opt.key === followUp)?.text
          }`
        : '';
      const finalBody = removeUnfilledPlaceholders(getPlainTextBody(body));
      console.log('Email Sent:', {
        to,
        cc,
        bcc,
        subject,
        body: finalBody + followUpText,
        attachments,
        followUp,
      });
      setIsSuccessVisible(true);
      resetForm();
    }
  };

  const removeHighlightSpans = (html: string): string => {
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
  };

  const handleDraftEmail = async () => {
    if (!body || !enquiry.Point_of_Contact) {
      setErrorMessage('Email contents and user email are required.');
      setIsErrorVisible(true);
      return;
    }
    const finalBody = removeUnfilledPlaceholders(getPlainTextBody(body));
    const cleanedBody = finalBody.replace(/\n/g, '<br>');
    const fullEmailHtml = ReactDOMServer.renderToStaticMarkup(
      <EmailSignature bodyHtml={cleanedBody} />
    );
    const requestBody = {
      email_contents: fullEmailHtml,
      user_email: enquiry.Point_of_Contact,
      subject_line: subject,
      to: to,
      cc: cc,
      bcc: bcc,
    };

    try {
      setErrorMessage('');
      setIsErrorVisible(false);
      const response = await fetch(
        `${process.env.REACT_APP_PROXY_BASE_URL}/sendEmail?code=${process.env.REACT_APP_SEND_EMAIL_CODE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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
  };

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

  const handleMultiSelectChange = (
    blockTitle: string,
    selectedOptions: string[]
  ) => {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOptions,
    }));
  };

  const handleSingleSelectChange = (
    blockTitle: string,
    selectedOption: string
  ) => {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOption,
    }));
  };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (bodyEditorRef.current) {
      setBody(bodyEditorRef.current.innerHTML);
    }
  };

  const handleBlur = () => {
    if (bodyEditorRef.current) {
      setBody(bodyEditorRef.current.innerHTML);
    }
  };

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
    alignItems: 'stretch',
    gap: '20px',
    justifyContent: 'space-between',
    height: 'calc(100vh - 80px)', // fixed height relative to viewport
    flexWrap: 'nowrap',           // prevent wrapping of columns
    boxSizing: 'border-box',
  });

  const formContainerStyle = mergeStyles({
    flex: '1 1 0',
    minWidth: '300px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',  // fill vertical space
  });

  const templatesContainerStyle = mergeStyles({
    flex: '0 0 48%',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    height: '100%',      // fill vertical space
    overflowY: 'auto',
  });

  const templatesGridStyle = mergeStyles({
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxHeight: '100%',   // use full available height
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

  const handleClearBlock = (block: TemplateBlock) => {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [block.title]: block.isMultiSelect ? [] : '',
    }));
    setInsertedBlocks((prev) => ({
      ...prev,
      [block.title]: false,
    }));
    setBody((prevBody) => {
      const placeholder = block.placeholder;
      const regex = new RegExp(
        `(<span[^>]*data-inserted="${escapeRegExp(block.title)}"[^>]*>)([\\s\\S]*?)(</span>)`,
        'g'
      );
      const newBody = prevBody.replace(
        regex,
        `<span data-placeholder="${placeholder}" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${placeholder}</span>`
      );
      return newBody;
    });
  };

  const renderPreview = (block: TemplateBlock) => {
    const selectedOptions = selectedTemplateOptions[block.title];
    const isInserted = insertedBlocks[block.title] || false;

    if (
      !selectedOptions ||
      (block.isMultiSelect && Array.isArray(selectedOptions) && selectedOptions.length === 0)
    ) {
      return null;
    }

    const formatPreviewText = (text: string) => {
      return text.replace(/\n/g, '<br />');
    };

    return (
      <div className={templatePreviewStyle(isDarkMode, isInserted)}>
        {block.isMultiSelect && Array.isArray(selectedOptions) ? (
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
        ) : (
          typeof selectedOptions === 'string' && (
            <span
              dangerouslySetInnerHTML={{
                __html: formatPreviewText(
                  block.options.find((o) => o.label === selectedOptions)?.previewText.trim() || selectedOptions
                ),
              }}
            ></span>
          )
        )}
      </div>
    );
  };

  const fullName = `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim();

  return (
    <Stack className={containerStyle}>
      {/* Form Container */}
      <Stack className={formContainerStyle} tokens={{ childrenGap: 20 }}>
        <Text
          variant="xLarge"
          styles={{ root: { fontWeight: '700', color: colours.highlight } }}
        >
          Pitch Builder
        </Text>

        {/* To, CC, BCC, Subject Line */}
        <Stack tokens={{ childrenGap: 20 }}>
          {/* To, CC, BCC on the same line */}
          <Stack horizontal tokens={{ childrenGap: 10 }} verticalAlign="start">
            {/* To Field */}
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

            {/* CC Field */}
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

            {/* BCC Field */}
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

          {/* Subject Line */}
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

        {/* Email Body */}
        <Label className={labelStyle}>Email Body</Label>
        <Stack horizontal tokens={{ childrenGap: 20 }}>
          <Stack tokens={{ childrenGap: 6 }} grow>
            <div className={toolbarStyle}>
              <IconButton
                iconProps={boldIcon}
                ariaLabel="Bold"
                onClick={() => applyFormat('bold')}
              />
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

        <Stack
          horizontal
          horizontalAlign="space-between"
          className={buttonGroupStyle}
        >
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

      {/* Templates Container */}
      <Stack className={templatesContainerStyle}>
        {enquiry.Initial_first_call_notes && (
          <Stack
            styles={{
              root: {
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                padding: '15px',
                borderRadius: '8px',
                boxShadow: isDarkMode
                  ? '0 2px 5px rgba(255,255,255,0.1)'
                  : '0 2px 5px rgba(0, 0, 0, 0.1)',
                marginBottom: '20px'
              }
            }}
          >
            <Text
              variant="mediumPlus"
              styles={{
                root: {
                  fontWeight: '600',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '10px'
                },
              }}
            >
              Initial First Call Notes
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

        <Text
          variant="xLarge"
          styles={{
            root: { fontWeight: '700', color: colours.highlight },
          }}
        >
          Template Blocks
        </Text>
        <Stack className={templatesGridStyle}>
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
                  placeholder={block.isMultiSelect ? 'Select options' : 'Select an option'}
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
                        const currentSelections = Array.isArray(selectedTemplateOptions[block.title])
                          ? (selectedTemplateOptions[block.title] as string[])
                          : [];
                        const updatedSelections = option.selected
                          ? [...currentSelections, option.key as string]
                          : currentSelections.filter((key) => key !== option.key);
                        handleMultiSelectChange(block.title, updatedSelections);
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
                {renderPreview(block)}
              </Stack>
            </Stack>
          ))}
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
            This is {enquiry.First_Name || 'the prospect'}'s first enquiry. You're responding on the same day.
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

          {/* To */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text
              variant="large"
              styles={{
                root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' },
              }}
            >
              To:
            </Text>
            <Text variant="medium" styles={{ root: { whiteSpace: 'pre-wrap' } }}>
              {to || 'N/A'}
            </Text>
          </Stack>

          <Separator />

          {/* CC */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text
              variant="large"
              styles={{
                root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' },
              }}
            >
              CC:
            </Text>
            <Text variant="medium" styles={{ root: { whiteSpace: 'pre-wrap' } }}>
              {cc || 'N/A'}
            </Text>
          </Stack>

          <Separator />

          {/* BCC */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text
              variant="large"
              styles={{
                root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' },
              }}
            >
              BCC:
            </Text>
            <Text variant="medium" styles={{ root: { whiteSpace: 'pre-wrap' } }}>
              {bcc || 'N/A'}
            </Text>
          </Stack>

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
          styles={{
            root: {
              position: 'absolute',
              bottom: '20px',
              left: '20px',
              width: 'auto',
            },
          }}
          horizontal
          tokens={{ childrenGap: 15 }}
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

const removeHighlightSpans = (html: string): string => {
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
};

export default PitchBuilder;
