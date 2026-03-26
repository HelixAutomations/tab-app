import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Callout } from '@fluentui/react/lib/Callout';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { Text } from '@fluentui/react/lib/Text';
import { Separator } from '@fluentui/react/lib/Separator';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { ProgressIndicator } from '@fluentui/react/lib/ProgressIndicator';
import { colours } from '../../../app/styles/colours';
import { useAutoSave, useContentValidation, useUndoRedo } from './editorHooks';

interface EnhancedPitchBuilderFeaturesProps {
  isDarkMode: boolean;
// invisible change
  content: string;
  onContentChange: (content: string) => void;
  onSave?: (content: string) => Promise<void>;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const EnhancedPitchBuilderFeatures: React.FC<EnhancedPitchBuilderFeaturesProps> = ({
  isDarkMode,
  content,
  onContentChange,
  onSave,
  showToast,
}) => {
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const validationButtonRef = useRef<HTMLDivElement>(null);
  const statsButtonRef = useRef<HTMLDivElement>(null);

  // Enhanced undo/redo functionality
  const {
    state: undoRedoContent,
    actions: { setState: setUndoRedoContent, undo, redo },
    canUndo,
    canRedo,
  } = useUndoRedo(content, 100);

  // Auto-save functionality
  const autoSaveEnabled = Boolean(onSave);
  const { lastSaved, isSaving, saveError, manualSave } = useAutoSave(
    content,
    onSave || (async () => {}),
    15000, // 15 seconds
    autoSaveEnabled
  );

  // Content validation
  const { validationErrors, validationWarnings, validateContent } = useContentValidation();

  // Content statistics
  const contentStats = React.useMemo(() => {
    const words = content.trim().split(/\s+/).filter(word => word.length > 0).length;
    const characters = content.length;
    const charactersNoSpaces = content.replace(/\s/g, '').length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
    
    return {
      words,
      characters,
      charactersNoSpaces,
      sentences,
      paragraphs,
    };
  }, [content]);

  // Update undo/redo state when content changes externally
  useEffect(() => {
    if (content !== undoRedoContent) {
      setUndoRedoContent(content);
    }
  }, [content, undoRedoContent, setUndoRedoContent]);

  // Handle undo/redo actions
  const handleUndo = useCallback(() => {
    undo();
    onContentChange(undoRedoContent);
  }, [undo, undoRedoContent, onContentChange]);

  const handleRedo = useCallback(() => {
    redo();
    onContentChange(undoRedoContent);
  }, [redo, undoRedoContent, onContentChange]);

  // Content validation with rules
  const validateCurrentContent = useCallback(() => {
    const validation = validateContent(content, {
      minLength: 10,
      maxLength: 50000,
      forbiddenPatterns: [
        /<script/gi, // Prevent script injection
        /javascript:/gi, // Prevent javascript: URLs
      ],
    });
    
    if (showToast && validation.errors.length > 0) {
      showToast(`Validation errors: ${validation.errors.join(', ')}`, 'error');
    }
    
    return validation;
  }, [content, validateContent, showToast]);

  // Manual save handler
  const handleManualSave = useCallback(async () => {
    try {
      await manualSave();
      if (showToast) {
        showToast('Content saved successfully', 'success');
      }
    } catch (error) {
      if (showToast) {
        showToast('Failed to save content', 'error');
      }
    }
  }, [manualSave, showToast]);

  // Button styles
  const toolbarButtonStyles: IButtonStyles = {
    root: {
      minWidth: 32,
      height: 32,
      padding: '0 8px',
      backgroundColor: isDarkMode ? colours.dark.grey : colours.light.grey,
      color: isDarkMode ? colours.dark.text : colours.light.text,
      border: 'none',
    },
    rootHovered: {
      backgroundColor: colours.blue,
      color: '#ffffff',
    },
    rootPressed: {
      backgroundColor: colours.darkBlue,
      color: '#ffffff',
    },
  };

  const dangerButtonStyles: IButtonStyles = {
    ...toolbarButtonStyles,
    rootHovered: {
      backgroundColor: '#d13438',
      color: '#ffffff',
    },
    rootPressed: {
      backgroundColor: '#a4262c',
      color: '#ffffff',
    },
  };

  return (
    <Stack horizontal tokens={{ childrenGap: 8 }} style={{ padding: '8px 0' }}>
      {/* Undo/Redo Controls */}
      <Stack horizontal tokens={{ childrenGap: 4 }}>
        <TooltipHost content={`Undo (Ctrl+Z)${canUndo ? '' : ' - No actions to undo'}`}>
          <IconButton
            iconProps={{ iconName: 'Undo' }}
            onClick={handleUndo}
            disabled={!canUndo}
            styles={toolbarButtonStyles}
            ariaLabel="Undo last action"
          />
        </TooltipHost>
        
        <TooltipHost content={`Redo (Ctrl+Y)${canRedo ? '' : ' - No actions to redo'}`}>
          <IconButton
            iconProps={{ iconName: 'Redo' }}
            onClick={handleRedo}
            disabled={!canRedo}
            styles={toolbarButtonStyles}
            ariaLabel="Redo last action"
          />
        </TooltipHost>
      </Stack>

      <Separator vertical />

      {/* Content Validation */}
      <div ref={validationButtonRef}>
        <TooltipHost content="Content Validation">
          <IconButton
            iconProps={{ 
              iconName: validationErrors.length > 0 ? 'ErrorBadge' : 
                       validationWarnings.length > 0 ? 'Warning' : 'CheckMark' 
            }}
            onClick={() => {
              validateCurrentContent();
              setIsValidationOpen(!isValidationOpen);
            }}
            styles={{
              root: {
                minWidth: 32,
                height: 32,
                padding: '0 8px',
                backgroundColor: isDarkMode ? colours.dark.grey : colours.light.grey,
                color: validationErrors.length > 0 ? '#d13438' : 
                       validationWarnings.length > 0 ? '#ff8c00' : '#107c10',
                border: 'none',
              },
              rootHovered: toolbarButtonStyles.rootHovered,
              rootPressed: toolbarButtonStyles.rootPressed,
            }}
            ariaLabel="Validate content"
          />
        </TooltipHost>
      </div>

      {/* Content Statistics */}
      <div ref={statsButtonRef}>
        <TooltipHost content="Content Statistics">
          <IconButton
            iconProps={{ iconName: 'NumberSequence' }}
            onClick={() => setIsStatsOpen(!isStatsOpen)}
            styles={toolbarButtonStyles}
            ariaLabel="Show content statistics"
          />
        </TooltipHost>
      </div>

      <Separator vertical />

      {/* Save Controls */}
      {autoSaveEnabled && (
        <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
          <TooltipHost content="Manual Save (Ctrl+S)">
            <IconButton
              iconProps={{ iconName: 'Save' }}
              onClick={handleManualSave}
              disabled={isSaving}
              styles={toolbarButtonStyles}
              ariaLabel="Save content"
            />
          </TooltipHost>
          
          {isSaving && (
            <ProgressIndicator
              styles={{
                root: { width: 60 },
                itemProgress: { 
                  backgroundColor: colours.blue,
                  height: 2,
                },
              }}
              barHeight={2}
            />
          )}
          
          {lastSaved && !isSaving && (
            <Text 
              variant="small" 
              style={{ 
                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                fontSize: '10px',
              }}
            >
              Last saved: {lastSaved.toLocaleTimeString()}
            </Text>
          )}
        </Stack>
      )}

      {/* Save Error Display */}
      {saveError && (
        <MessageBar
          messageBarType={MessageBarType.error}
          isMultiline={false}
          onDismiss={() => {/* Auto-save errors clear automatically */}}
          styles={{
            root: { 
              margin: '0 8px',
              maxWidth: 200,
            },
          }}
        >
          Save error: {saveError}
        </MessageBar>
      )}

      {/* Validation Callout */}
      {isValidationOpen && (
        <Callout
          target={validationButtonRef.current}
          onDismiss={() => setIsValidationOpen(false)}
          setInitialFocus
        >
          <Stack tokens={{ childrenGap: 8 }} style={{ padding: 16, minWidth: 250 }}>
            <Text variant="medium" style={{ fontWeight: 600 }}>
              Content Validation
            </Text>
            
            {validationErrors.length > 0 && (
              <Stack tokens={{ childrenGap: 4 }}>
                <Text variant="small" style={{ color: '#d13438', fontWeight: 600 }}>
                  Errors:
                </Text>
                {validationErrors.map((error, index) => (
                  <Text key={index} variant="small" style={{ color: '#d13438' }}>
                    • {error}
                  </Text>
                ))}
              </Stack>
            )}
            
            {validationWarnings.length > 0 && (
              <Stack tokens={{ childrenGap: 4 }}>
                <Text variant="small" style={{ color: '#ff8c00', fontWeight: 600 }}>
                  Warnings:
                </Text>
                {validationWarnings.map((warning, index) => (
                  <Text key={index} variant="small" style={{ color: '#ff8c00' }}>
                    • {warning}
                  </Text>
                ))}
              </Stack>
            )}
            
            {validationErrors.length === 0 && validationWarnings.length === 0 && (
              <Text variant="small" style={{ color: '#107c10' }}>
                ✓ Content validation passed
              </Text>
            )}
          </Stack>
        </Callout>
      )}

      {/* Statistics Callout */}
      {isStatsOpen && (
        <Callout
          target={statsButtonRef.current}
          onDismiss={() => setIsStatsOpen(false)}
          setInitialFocus
        >
          <Stack tokens={{ childrenGap: 8 }} style={{ padding: 16, minWidth: 200 }}>
            <Text variant="medium" style={{ fontWeight: 600 }}>
              Content Statistics
            </Text>
            
            <Stack tokens={{ childrenGap: 4 }}>
              <Stack horizontal horizontalAlign="space-between">
                <Text variant="small">Words:</Text>
                <Text variant="small" style={{ fontWeight: 600 }}>
                  {contentStats.words.toLocaleString()}
                </Text>
              </Stack>
              
              <Stack horizontal horizontalAlign="space-between">
                <Text variant="small">Characters:</Text>
                <Text variant="small" style={{ fontWeight: 600 }}>
                  {contentStats.characters.toLocaleString()}
                </Text>
              </Stack>
              
              <Stack horizontal horizontalAlign="space-between">
                <Text variant="small">Characters (no spaces):</Text>
                <Text variant="small" style={{ fontWeight: 600 }}>
                  {contentStats.charactersNoSpaces.toLocaleString()}
                </Text>
              </Stack>
              
              <Stack horizontal horizontalAlign="space-between">
                <Text variant="small">Sentences:</Text>
                <Text variant="small" style={{ fontWeight: 600 }}>
                  {contentStats.sentences.toLocaleString()}
                </Text>
              </Stack>
              
              <Stack horizontal horizontalAlign="space-between">
                <Text variant="small">Paragraphs:</Text>
                <Text variant="small" style={{ fontWeight: 600 }}>
                  {contentStats.paragraphs.toLocaleString()}
                </Text>
              </Stack>
            </Stack>
          </Stack>
        </Callout>
      )}
    </Stack>
  );
};

export default EnhancedPitchBuilderFeatures;
