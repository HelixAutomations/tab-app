import React, { RefObject, useCallback, useMemo } from 'react';
import {
  Stack,
  IconButton,
  DefaultButton,
  Dropdown,
  IDropdownOption,
  Text,
  mergeStyles,
  Icon,
  TooltipHost,
  Separator,
  Callout,
  IButtonStyles,
} from '@fluentui/react';
import { TemplateBlock, TemplateOption } from '../../../app/customisation/ProductionTemplateBlocks';
import { TemplateSet } from '../../../app/customisation/TemplateBlockSets';
import { colours } from '../../../app/styles/colours';
import { sharedEditorStyle, sharedOptionsDropdownStyles } from '../../../app/styles/FilterStyles';
import { sharedDefaultButtonStyles } from '../../../app/styles/ButtonStyles';
// invisible change
import { getLeftoverPlaceholders } from './emailUtils';
import EditBlockModal, { EditRequestPayload } from './EditBlockModal';
import { useEditorState, useKeyboardShortcuts } from './editorHooks';
import { editorFormatter } from './editorEnhancements';

// Sticky toolbar CSS injection
if (typeof window !== 'undefined' && !document.getElementById('sticky-toolbar-style')) {
  const style = document.createElement('style');
  style.id = 'sticky-toolbar-style';
  style.innerHTML = `
    .sticky-toolbar {
      position: sticky;
      top: 0;
      z-index: 11;
      background: inherit;
      padding-bottom: 8px;
      transition: background 0.2s;
    }
  `;
  document.head.appendChild(style);
}

if (typeof window !== 'undefined' && !document.getElementById('fade-in-animation')) {
  const style = document.createElement('style');
  style.id = 'fade-in-animation';
  style.innerHTML = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

interface EditorAndTemplateBlocksProps {
  isDarkMode: boolean;
  body: string;
  setBody: React.Dispatch<React.SetStateAction<string>>;
  templateBlocks: TemplateBlock[];
  selectedTemplateOptions: { [key: string]: string | string[] };
  insertedBlocks: { [key: string]: boolean };
  lockedBlocks: { [key: string]: boolean };
  editedBlocks: { [key: string]: boolean };
  handleMultiSelectChange: (blockTitle: string, selectedOptions: string[]) => void;
  handleSingleSelectChange: (blockTitle: string, selectedOption: string) => void;
  insertTemplateBlock: (
    block: TemplateBlock,
    selectedOption: string | string[],
    shouldFocus?: boolean,
    append?: boolean
  ) => void;
  renderPreview: (block: TemplateBlock) => React.ReactNode;
  applyFormat: (command: string, value?: string) => void;
  saveSelection: () => void;
  handleInput: () => void;
  handleBlur: () => void;
  handleClearBlock: (block: TemplateBlock) => void;
  bodyEditorRef: RefObject<HTMLDivElement>;
  toolbarStyle: string;
  bubblesContainerStyle: string;
  bubbleStyle: string;
  filteredAttachments: { key: string; text: string }[];
  highlightBlock: (blockTitle: string, highlight: boolean, source?: 'editor' | 'template') => void;
  onReorderBlocks: (startIndex: number, endIndex: number) => void;
  onDuplicateBlock: (index: number) => void;
  templateSet: TemplateSet;
  onTemplateSetChange: (set: TemplateSet) => void;
  onClearAllBlocks: () => void;
  removedBlocks: string[];
  onAddBlock: (title: string) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const EditorAndTemplateBlocks: React.FC<EditorAndTemplateBlocksProps> = React.memo((props) => {
  const {
    isDarkMode,
    body,
    setBody,
    templateBlocks,
    selectedTemplateOptions,
    insertedBlocks,
    lockedBlocks,
    editedBlocks,
    handleMultiSelectChange,
    handleSingleSelectChange,
    insertTemplateBlock,
    renderPreview,
    applyFormat,
    saveSelection,
    handleInput,
    handleBlur,
    handleClearBlock,
    bodyEditorRef,
    toolbarStyle,
    bubblesContainerStyle,
    bubbleStyle,
    filteredAttachments,
    highlightBlock,
    onReorderBlocks,
    onDuplicateBlock,
    templateSet,
    onTemplateSetChange,
    onClearAllBlocks,
    removedBlocks,
    onAddBlock,
    showToast,
    undo,
    redo,
    canUndo,
    canRedo,
  } = props;

  const [isCheatSheetOpen, setIsCheatSheetOpen] = React.useState(false);
  const cheatSheetButtonRef = React.useRef<HTMLDivElement | null>(null);
  const [isActionsInfoOpen, setIsActionsInfoOpen] = React.useState(false);
  const actionsInfoButtonRef = React.useRef<HTMLDivElement | null>(null);

  // Use enhanced editor state hook
  const { formattingState, actions: editorActions } = useEditorState();
  const { boldActive, italicActive, underlineActive } = formattingState;
  const containerStyle = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.grey : colours.light.grey,
    borderRadius: 0,
boxShadow: isDarkMode
  ? '0 4px 12px rgba(255, 255, 255, 0.1)'
  : '0 4px 12px rgba(0, 0, 0, 0.1)', // for light mode
    padding: '24px',
    width: '100%',
    transition: 'background 0.3s, box-shadow 0.3s',
  });

  // Memoize expensive computations
  const placeholderInfo = useMemo(
    () => ({
      blocks: templateBlocks.map((block) => ({
        title: block.title,
        placeholder: block.placeholder,
        options: block.options.map((o) => o.label),
      })),
      additional: getLeftoverPlaceholders(templateBlocks).filter(
        (ph) => !templateBlocks.some((tb) => tb.placeholder === ph)
      ),
    }),
    [templateBlocks]
  );

  const blockOptionsMap = useMemo(
    () =>
      Object.fromEntries(
        templateBlocks.map((b) => [b.title, b.options.map((o) => o.label)])
      ),
    [templateBlocks]
  );

  // Optimize button styles with useMemo
  const whiteButtonStyles: IButtonStyles = useMemo(() => ({
    ...sharedDefaultButtonStyles,
    root: {
      ...(sharedDefaultButtonStyles.root as any),
      backgroundColor: '#ffffff',
    },
    rootHovered: {
      ...(sharedDefaultButtonStyles.rootHovered as any),
      background:
        'radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 100%), #ffffff !important',
    },
    rootPressed: {
      ...(sharedDefaultButtonStyles.rootPressed as any),
      background:
        'radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), #ffffff !important',
    },
    rootFocused: {
      ...(sharedDefaultButtonStyles.rootFocused as any),
      backgroundColor: '#ffffff !important',
    },
  }), []);

  const selectedButtonStyles: IButtonStyles = useMemo(() => ({
    ...sharedDefaultButtonStyles,
    root: {
      ...(sharedDefaultButtonStyles.root as any),
      backgroundColor: colours.highlightBlue,
      fontWeight: 600,
    },
    rootHovered: {
      ...(sharedDefaultButtonStyles.rootHovered as any),
      background:
        `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 100%), ${colours.highlightBlue} !important`,
    },
    rootPressed: {
      ...(sharedDefaultButtonStyles.rootPressed as any),
      background:
        `radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%), ${colours.highlightBlue} !important`,
    },
    rootFocused: {
      ...(sharedDefaultButtonStyles.rootFocused as any),
      backgroundColor: `${colours.highlightBlue} !important`,
    },
  }), []);

  const toolbarButtonStyle = useMemo(() => ({
    root: {
      color: '#ffffff',
      width: 32,
      height: 32,
    },
    rootHovered: {
      backgroundColor: colours.blue,
      color: '#ffffff',
    },
    rootChecked: {
      backgroundColor: colours.blue,
      color: '#ffffff',
    },
    icon: { fontSize: 18 },
  }), []);


  const [blockToEdit, setBlockToEdit] = React.useState<TemplateBlock | null>(null);
  const [previewNode, setPreviewNode] = React.useState<React.ReactNode>(null);

  const [initialOption, setInitialOption] = React.useState<string | undefined>(undefined);
  const [initialLevel, setInitialLevel] = React.useState<'block' | 'option' | 'sentence'>('block');

  const openEditModal = (block: TemplateBlock, option?: string) => {
    setPreviewNode(renderPreview(block));
    setInitialOption(option);
    setInitialLevel(option ? 'option' : 'block');
    setBlockToEdit(block);
  };

  React.useEffect(() => {
    (window as any).openBlockEdit = (title: string) => {
      const block = templateBlocks.find((b) => b.title === title);
      if (block) {
        openEditModal(block);
      }
    };
    (window as any).openSnippetEdit = (title: string, option: string) => {
      const block = templateBlocks.find((b) => b.title === title);
      if (block) {
        openEditModal(block, option);
      }
    };
  }, [templateBlocks]);

  const requestChange = async (payload: EditRequestPayload) => {
    if (!blockToEdit) return;
    const finalPayload = {
      ...payload,
      block: blockToEdit.title.toLowerCase().replace(/\s+/g, ''),
    };
    try {
      if (showToast) {
        showToast('Submitting suggestion...', 'info');
      }
      await fetch(
        `${process.env.REACT_APP_PROXY_BASE_URL}/sendEmail?code=${process.env.REACT_APP_SEND_EMAIL_CODE}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email_contents: JSON.stringify(finalPayload, null, 2),
            user_email: 'lz@helix-law.com',
          }),
        }
      );
      if (showToast) {
        showToast('Thanks! Your suggestion has been submitted for review.', 'success');
      }
    } catch (err) {
      console.error('Failed to send change request', err);
      if (showToast) {
        showToast('Failed to submit suggestion', 'error');
      }
    } finally {
      setBlockToEdit(null);
    }
  };

  // Enhanced formatting functions using the formatter utility
  const handleBoldFormat = useCallback(() => {
    editorFormatter.executeCommand('bold');
    editorActions.updateFormattingState();
  }, [editorActions]);

  const handleItalicFormat = useCallback(() => {
    editorFormatter.executeCommand('italic');
    editorActions.updateFormattingState();
  }, [editorActions]);

  const handleUnderlineFormat = useCallback(() => {
    editorFormatter.executeCommand('underline');
    editorActions.updateFormattingState();
  }, [editorActions]);

  const handleBulletListFormat = useCallback(() => {
    editorFormatter.createList('bullet');
    editorActions.updateFormattingState();
  }, [editorActions]);

  const handleNumberedListFormat = useCallback(() => {
    editorFormatter.createList('number');
    editorActions.updateFormattingState();
  }, [editorActions]);

  const handleLetteredListFormat = useCallback(() => {
    editorFormatter.createList('letter');
    editorActions.updateFormattingState();
  }, [editorActions]);

  const handleLinkFormat = useCallback(() => {
    editorFormatter.insertLink();
    editorActions.updateFormattingState();
  }, [editorActions]);

  // Enhanced keyboard shortcuts
  const { handleKeyDown } = useKeyboardShortcuts({
    onBold: handleBoldFormat,
    onItalic: handleItalicFormat,
    onUnderline: handleUnderlineFormat,
    onBulletList: handleBulletListFormat,
    onNumberedList: handleNumberedListFormat,
    onLetteredList: handleLetteredListFormat,
    onLink: handleLinkFormat,
    onSave: () => {
      if (showToast) {
        showToast('Content saved', 'success');
      }
    },
  });

  // Enhanced lettered list function with better error handling
  const applyLetteredList = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !bodyEditorRef.current) {
      console.warn('No valid selection for lettered list');
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedNode = range.commonAncestorContainer;

    if (!bodyEditorRef.current.contains(selectedNode)) {
      console.warn('Selection is outside editor');
      return;
    }

    try {
      saveSelection();

      let parentList: Node | Element | null =
        selectedNode.nodeType === Node.ELEMENT_NODE
          ? selectedNode
          : selectedNode.parentElement;

      // Check if we're already in a lettered list
      while (parentList && parentList !== bodyEditorRef.current) {
        if (
          parentList instanceof HTMLElement &&
          parentList.tagName === 'OL' &&
          parentList.style.listStyleType === 'lower-alpha'
        ) {
          // Toggle off lettered list
          document.execCommand('insertUnorderedList', false, undefined);
          setBody(bodyEditorRef.current.innerHTML);
          return;
        }
        parentList = (parentList as Element).parentElement;
      }

      // Create new lettered list
      if (!parentList || parentList === bodyEditorRef.current) {
        const ol = document.createElement('ol');
        ol.style.listStyleType = 'lower-alpha';
        ol.style.paddingLeft = '20px';
        const li = document.createElement('li');
        ol.appendChild(li);

        if (range.collapsed) {
          range.insertNode(ol);
          range.setStart(li, 0);
          range.collapse(true);
        } else {
          const fragment = range.extractContents();
          li.appendChild(fragment);
          range.insertNode(ol);
        }

        selection.removeAllRanges();
        selection.addRange(range);
      }

      setBody(bodyEditorRef.current.innerHTML);
    } catch (error) {
      console.error('Error applying lettered list:', error);
      if (showToast) {
        showToast('Failed to apply lettered list', 'error');
      }
    }
  }, [saveSelection, setBody, showToast]);

  // Additional callback functions
  const handleCheatSheetToggle = useCallback(() => {
    setIsCheatSheetOpen(!isCheatSheetOpen);
  }, [isCheatSheetOpen]);

  const handleActionsInfoToggle = useCallback(() => {
    setIsActionsInfoOpen(!isActionsInfoOpen);
  }, [isActionsInfoOpen]);

  return (
    <>
      {blockToEdit && (
        <EditBlockModal
          isOpen={true}
          onDismiss={() => {
            setBlockToEdit(null);
            setInitialOption(undefined);
            setInitialLevel('block');
          }}
          blockTitle={blockToEdit.title}
          previewContent={previewNode}
          block={blockToEdit}
          onSubmit={requestChange}
          referenceOptions={templateBlocks.map((b) => ({ key: b.title, text: b.title }))}
          blockOptionsMap={blockOptionsMap}
          isDarkMode={isDarkMode}
          initialOption={initialOption}
          initialLevel={initialLevel}
        />
      )}
      <Stack horizontal tokens={{ childrenGap: 20 }} className={containerStyle}>
        <Stack style={{ width: '100%' }} tokens={{ childrenGap: 20 }}>
          <Stack
            horizontal
            verticalAlign="center"
            tokens={{ childrenGap: 8 }}
            styles={{ root: { paddingBottom: '5px', justifyContent: 'space-between' } }}
          >
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <DefaultButton
                text="Production"
                onClick={() => onTemplateSetChange('Database')}
                styles={templateSet === 'Database' ? selectedButtonStyles : whiteButtonStyles}
              />
              <DefaultButton
                text="Simplified"
                onClick={() => onTemplateSetChange('Simplified')}
                styles={templateSet === 'Simplified' ? selectedButtonStyles : whiteButtonStyles}
              />
              <DefaultButton
                text="Original"
                onClick={() => onTemplateSetChange('Production')}
                styles={templateSet === 'Production' ? selectedButtonStyles : whiteButtonStyles}
              />
              <div ref={cheatSheetButtonRef}>
                <IconButton
                  iconProps={{ iconName: 'Info' }}
                  title="Placeholder Cheat Sheet"
                  ariaLabel="Placeholder Cheat Sheet"
                  onClick={handleCheatSheetToggle}
                />
              </div>
              {removedBlocks.length > 0 && (
                <Dropdown
                  placeholder="Add Block"
                  options={removedBlocks.map(b => ({ key: b, text: b }))}
                  styles={sharedOptionsDropdownStyles(isDarkMode)}
                  onChange={(_e, opt) => opt && onAddBlock(opt.key as string)}
                />
              )}
            </Stack>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }} styles={{ root: { marginLeft: 'auto' } }}>
              <DefaultButton
                text="Clear"
                iconProps={{ iconName: 'Cancel' }}
                onClick={onClearAllBlocks}
                styles={whiteButtonStyles}
              />
              <div ref={actionsInfoButtonRef}>
                <IconButton
                  iconProps={{ iconName: 'Info' }}
                  title="Actions Info"
                  ariaLabel="Actions Info"
                  onClick={handleActionsInfoToggle}
                />
              </div>
            </Stack>
          </Stack>

          {isCheatSheetOpen && (
            <Callout
              target={cheatSheetButtonRef.current}
              onDismiss={() => setIsCheatSheetOpen(false)}
              setInitialFocus
            >
              <div
                style={{
                  maxHeight: 300,
                  overflowY: 'auto',
                  padding: 12,
                  border: `1px dotted ${colours.greyText}`,
                }}
              >
                <Stack tokens={{ childrenGap: 12 }}>
                  {placeholderInfo.blocks.map((info) => (
                    <Stack key={info.placeholder} tokens={{ childrenGap: 4 }}>
                      <Text>{info.placeholder}</Text>
                      <Text variant="small">{info.title}</Text>
                      {info.options.length > 0 && (
                        <ul style={{ margin: '0 0 0 16px' }}>
                          {info.options.map((opt) => (
                            <li key={opt} style={{ fontSize: '12px' }}>
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Stack>
                  ))}
                  {placeholderInfo.additional.length > 0 && (
                    <Stack tokens={{ childrenGap: 4 }}>
                      <Separator />
                      <Text>Other Placeholders</Text>
                      {placeholderInfo.additional.map((ph) => (
                        <Text key={ph} variant="small">
                          {ph}
                        </Text>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </div>
            </Callout>
          )}
          {isActionsInfoOpen && (
            <Callout
              target={actionsInfoButtonRef.current}
              onDismiss={() => setIsActionsInfoOpen(false)}
              setInitialFocus
            >
              <Stack tokens={{ childrenGap: 4 }} styles={{ root: { padding: 12 } }}>
                <Text variant="small">Clear removes all inserted blocks.</Text>
              </Stack>
            </Callout>
          )}


          <Stack tokens={{ childrenGap: 20 }}>

          <Stack horizontal tokens={{ childrenGap: 20 }}>
            <Stack tokens={{ childrenGap: 6 }} grow>
              <div className={toolbarStyle + ' sticky-toolbar'} style={{ backgroundColor: colours.darkBlue }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TooltipHost content="Undo (Ctrl+Z)">
                    <IconButton
                      iconProps={{ iconName: 'Undo' }}
                      ariaLabel="Undo"
                      onClick={undo}
                      disabled={!canUndo}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <TooltipHost content="Redo (Ctrl+Y)">
                    <IconButton
                      iconProps={{ iconName: 'Redo' }}
                      ariaLabel="Redo"
                      onClick={redo}
                      disabled={!canRedo}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1px',
                      height: '24px',
                      background: '#ddd',
                      margin: '0 8px',
                    }}
                  />
                  <TooltipHost content="Bold (Ctrl+B)">
                    <IconButton
                      iconProps={{ iconName: 'Bold' }}
                      ariaLabel="Bold"
                      onClick={handleBoldFormat}
                      checked={boldActive}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <TooltipHost content="Italic (Ctrl+I)">
                    <IconButton
                      iconProps={{ iconName: 'Italic' }}
                      ariaLabel="Italic"
                      onClick={handleItalicFormat}
                      checked={italicActive}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <TooltipHost content="Underline (Ctrl+U)">
                    <IconButton
                      iconProps={{ iconName: 'Underline' }}
                      ariaLabel="Underline"
                      onClick={handleUnderlineFormat}
                      checked={underlineActive}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1px',
                      height: '24px',
                      background: '#ddd',
                      margin: '0 8px',
                    }}
                  />
                  <TooltipHost content="Bulleted List (Ctrl+Shift+8)">
                    <IconButton
                      iconProps={{ iconName: 'BulletedList' }}
                      ariaLabel="Bulleted List"
                      onClick={handleBulletListFormat}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <TooltipHost content="Numbered List (Ctrl+Shift+7)">
                    <IconButton
                      iconProps={{ iconName: 'NumberedList' }}
                      ariaLabel="Numbered List"
                      onClick={handleNumberedListFormat}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <TooltipHost content="A, B, C List (Ctrl+Shift+L)">
                    <IconButton
                      iconProps={{ iconName: 'SortLines' }}
                      ariaLabel="Lettered List"
                      onClick={handleLetteredListFormat}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1px',
                      height: '24px',
                      background: '#ddd',
                      margin: '0 8px',
                    }}
                  />
                  <TooltipHost content="Insert Link (Ctrl+K)">
                    <IconButton
                      iconProps={{ iconName: 'Link' }}
                      ariaLabel="Insert Link"
                      onClick={handleLinkFormat}
                      styles={toolbarButtonStyle}
                    />
                  </TooltipHost>
                </div>
              </div>
              <div
                contentEditable
                ref={bodyEditorRef}
                onBlur={handleBlur}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
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
                onMouseUp={editorActions.updateFormattingState}
                onKeyUp={editorActions.updateFormattingState}
                onFocus={editorActions.updateFormattingState}
              />
            </Stack>
          </Stack>
          {/*
            Attachments are temporarily disabled. Preserve the code for future
            use but prevent rendering by wrapping it in a comment block.
          <Stack tokens={{ childrenGap: 6 }} styles={{ root: { paddingTop: '20px', paddingBottom: '5px' } }}>
            <Label className={labelStyle}>Attachments</Label>
            <div className={bubblesContainerStyle}>
              {filteredAttachments.map((att) => (
                <div
                  key={`attachment-${att.key}`}
                  className={bubbleStyle}
                  role="button"
                  tabIndex={0}
                  aria-label={`Attachment ${att.text} (Coming Soon)`}
                >
                  {att.text}
                </div>
              ))}
            </div>
          </Stack>
          */}
          </Stack>
      </Stack>
    </Stack>
    </>
  );
});

export default EditorAndTemplateBlocks;
