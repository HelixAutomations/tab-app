import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Callout } from '@fluentui/react/lib/Callout';
import { Text } from '@fluentui/react/lib/Text';
import { Separator } from '@fluentui/react/lib/Separator';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { colours } from '../../../app/styles/colours';
import { TemplateBlock } from '../../../app/customisation/ProductionTemplateBlocks';

interface TemplateSuggestion {
  id: string;
  title: string;
// invisible change
  description: string;
  confidence: number;
  category: 'grammar' | 'style' | 'content' | 'structure';
  suggestion: string;
  originalText: string;
  position: { start: number; end: number };
}

interface SmartTemplateSuggestionsProps {
  isDarkMode: boolean;
  content: string;
  templateBlocks: TemplateBlock[];
  onApplySuggestion: (suggestion: TemplateSuggestion) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const SmartTemplateSuggestions: React.FC<SmartTemplateSuggestionsProps> = ({
  isDarkMode,
  content,
  templateBlocks,
  onApplySuggestion,
  showToast,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TemplateSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalyzedContent, setLastAnalyzedContent] = useState('');
  const buttonRef = React.useRef<HTMLDivElement>(null);

  // Analyze content for improvements
  const analyzeContent = useCallback(async () => {
    if (content === lastAnalyzedContent || content.length < 10) {
      return;
    }

    setIsAnalyzing(true);
    setLastAnalyzedContent(content);

    try {
      // Simulate AI analysis with practical suggestions
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newSuggestions: TemplateSuggestion[] = [];

      // Grammar and style suggestions
      const grammarPatterns = [
        {
          pattern: /\bthat\s+that\b/gi,
          suggestion: 'Remove duplicate "that"',
          category: 'grammar' as const,
        },
        {
          pattern: /\bvery\s+(\w+)/gi,
          suggestion: 'Consider using a stronger adjective instead of "very"',
          category: 'style' as const,
        },
        {
          pattern: /\bin\s+regards?\s+to\b/gi,
          suggestion: 'Consider "regarding" or "concerning"',
          category: 'style' as const,
        },
        {
          pattern: /\bdue\s+to\s+the\s+fact\s+that\b/gi,
          suggestion: 'Simplify to "because"',
          category: 'style' as const,
        },
      ];

      grammarPatterns.forEach(({ pattern, suggestion, category }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          newSuggestions.push({
            id: `${category}-${Date.now()}-${match.index}`,
            title: suggestion,
            description: `Found: "${match[0]}"`,
            confidence: 0.8,
            category,
            suggestion: match[0].toLowerCase(),
            originalText: match[0],
            position: { start: match.index, end: match.index + match[0].length },
          });
        }
      });

      // Content structure suggestions
      const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
      if (paragraphs.length === 1 && content.length > 500) {
        newSuggestions.push({
          id: `structure-paragraph-${Date.now()}`,
          title: 'Consider breaking into paragraphs',
          description: 'Long text blocks can be hard to read',
          confidence: 0.7,
          category: 'structure',
          suggestion: 'Break into multiple paragraphs',
          originalText: content,
          position: { start: 0, end: content.length },
        });
      }

      // Template block suggestions
      templateBlocks.forEach(block => {
        if (!content.toLowerCase().includes(block.title.toLowerCase()) && 
            block.placeholder && !content.includes(block.placeholder)) {
          
          // Check if content could benefit from this block
          const blockKeywords = block.title.toLowerCase().split(' ');
          const contentWords = content.toLowerCase().split(/\W+/);
          const matchCount = blockKeywords.filter(keyword => 
            contentWords.some(word => word.includes(keyword))
          ).length;

          if (matchCount > 0) {
            newSuggestions.push({
              id: `template-${block.title}-${Date.now()}`,
              title: `Consider adding ${block.title} block`,
              description: `This could enhance your content structure`,
              confidence: 0.6,
              category: 'content',
              suggestion: `Add ${block.title} template block`,
              originalText: '',
              position: { start: content.length, end: content.length },
            });
          }
        }
      });

      // Sort by confidence
      newSuggestions.sort((a, b) => b.confidence - a.confidence);

      setSuggestions(newSuggestions.slice(0, 10)); // Limit to top 10 suggestions
    } catch (error) {
      console.error('Error analyzing content:', error);
      if (showToast) {
        showToast('Failed to analyze content', 'error');
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [content, lastAnalyzedContent, templateBlocks, showToast]);

  // Auto-analyze content changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (content !== lastAnalyzedContent) {
        analyzeContent();
      }
    }, 2000); // Analyze 2 seconds after user stops typing

    return () => clearTimeout(timeoutId);
  }, [content, analyzeContent, lastAnalyzedContent]);

  // Handle suggestion application
  const handleApplySuggestion = useCallback((suggestion: TemplateSuggestion) => {
    onApplySuggestion(suggestion);
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    
    if (showToast) {
      showToast(`Applied suggestion: ${suggestion.title}`, 'success');
    }
  }, [onApplySuggestion, showToast]);

  const handleDismissSuggestion = useCallback((suggestionId: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  }, []);

  // Suggestion counts by category
  const suggestionCounts = useMemo(() => {
    return suggestions.reduce((acc, suggestion) => {
      acc[suggestion.category] = (acc[suggestion.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [suggestions]);

  const totalSuggestions = suggestions.length;
  const highConfidenceSuggestions = suggestions.filter(s => s.confidence > 0.7).length;

  // Button styles
  const buttonStyles: IButtonStyles = {
    root: {
      minWidth: 32,
      height: 32,
      padding: '0 8px',
      backgroundColor: isDarkMode ? colours.dark.grey : colours.light.grey,
      color: totalSuggestions > 0 ? colours.blue : 
             isDarkMode ? colours.dark.text : colours.light.text,
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'grammar': return 'CheckList';
      case 'style': return 'Edit';
      case 'content': return 'FileTemplate';
      case 'structure': return 'BuildDefinition';
      default: return 'Lightbulb';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'grammar': return '#d13438';
      case 'style': return '#ff8c00';
      case 'content': return '#0078d4';
      case 'structure': return '#107c10';
      default: return '#6b69d6';
    }
  };

  return (
    <>
      <div ref={buttonRef}>
        <IconButton
          iconProps={{ iconName: 'Lightbulb' }}
          title={`Smart Suggestions${totalSuggestions > 0 ? ` (${totalSuggestions})` : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          styles={buttonStyles}
          ariaLabel={`Smart suggestions - ${totalSuggestions} available`}
        />
      </div>

      {isOpen && (
        <Callout
          target={buttonRef.current}
          onDismiss={() => setIsOpen(false)}
          setInitialFocus
          isBeakVisible={false}
        >
          <Stack tokens={{ childrenGap: 12 }} style={{ padding: 16, minWidth: 320, maxWidth: 400 }}>
            <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
              <Text variant="medium" style={{ fontWeight: 600 }}>
                Smart Suggestions
              </Text>
              
              {isAnalyzing && <Spinner size={1} />}
              
              <IconButton
                iconProps={{ iconName: 'Refresh' }}
                title="Re-analyze content"
                onClick={analyzeContent}
                disabled={isAnalyzing}
                styles={{ root: { minWidth: 24, height: 24 } }}
              />
            </Stack>

            {/* Summary */}
            {totalSuggestions > 0 && (
              <MessageBar
                messageBarType={MessageBarType.info}
                isMultiline={false}
              >
                {totalSuggestions} suggestions found
                {highConfidenceSuggestions > 0 && ` (${highConfidenceSuggestions} high confidence)`}
              </MessageBar>
            )}

            {/* Category Summary */}
            {Object.keys(suggestionCounts).length > 0 && (
              <Stack tokens={{ childrenGap: 4 }}>
                <Text variant="small" style={{ fontWeight: 600 }}>
                  Categories:
                </Text>
                <Stack horizontal wrap tokens={{ childrenGap: 8 }}>
                  {Object.entries(suggestionCounts).map(([category, count]) => (
                    <Stack 
                      key={category} 
                      horizontal 
                      tokens={{ childrenGap: 4 }} 
                      verticalAlign="center"
                      style={{
                        padding: '2px 6px',
                        backgroundColor: `${getCategoryColor(category)}20`,
                        borderRadius: 12,
                      }}
                    >
                      <Text 
                        variant="small" 
                        style={{ 
                          color: getCategoryColor(category),
                          textTransform: 'capitalize',
                        }}
                      >
                        {category}: {count}
                      </Text>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            )}

            {suggestions.length === 0 && !isAnalyzing && (
              <Stack horizontalAlign="center" tokens={{ childrenGap: 8 }}>
                <Text variant="medium" style={{ color: '#107c10' }}>
                  ✓ No suggestions at this time
                </Text>
                <Text variant="small" style={{ textAlign: 'center' }}>
                  Your content looks good! Keep typing and we'll analyze for improvements.
                </Text>
              </Stack>
            )}

            {/* Suggestions List */}
            {suggestions.length > 0 && (
              <Stack tokens={{ childrenGap: 8 }} style={{ maxHeight: 300, overflowY: 'auto' }}>
                {suggestions.map((suggestion) => (
                  <Stack
                    key={suggestion.id}
                    tokens={{ childrenGap: 4 }}
                    style={{
                      padding: 12,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      borderRadius: 4,
                      backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    }}
                  >
                    <Stack horizontal horizontalAlign="space-between" verticalAlign="start">
                      <Stack horizontal tokens={{ childrenGap: 6 }} verticalAlign="center">
                        <IconButton
                          iconProps={{ 
                            iconName: getCategoryIcon(suggestion.category),
                            style: { color: getCategoryColor(suggestion.category) }
                          }}
                          styles={{ root: { minWidth: 20, height: 20 } }}
                          disabled
                        />
                        <Text variant="small" style={{ fontWeight: 600 }}>
                          {suggestion.title}
                        </Text>
                      </Stack>
                      
                      <Stack horizontal tokens={{ childrenGap: 2 }}>
                        <IconButton
                          iconProps={{ iconName: 'CheckMark' }}
                          title="Apply suggestion"
                          onClick={() => handleApplySuggestion(suggestion)}
                          styles={{
                            root: { 
                              minWidth: 20, 
                              height: 20,
                              color: '#107c10',
                            },
                            rootHovered: {
                              backgroundColor: '#107c1020',
                            },
                          }}
                        />
                        <IconButton
                          iconProps={{ iconName: 'Cancel' }}
                          title="Dismiss suggestion"
                          onClick={() => handleDismissSuggestion(suggestion.id)}
                          styles={{
                            root: { 
                              minWidth: 20, 
                              height: 20,
                              color: '#d13438',
                            },
                            rootHovered: {
                              backgroundColor: '#d1343820',
                            },
                          }}
                        />
                      </Stack>
                    </Stack>
                    
                    <Text variant="small">
                      {suggestion.description}
                    </Text>
                    
                    <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                      <Text variant="tiny" style={{ 
                        color: getCategoryColor(suggestion.category),
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}>
                        {suggestion.category}
                      </Text>
                      <Text variant="tiny" style={{ 
                        color: isDarkMode ? colours.dark.subText : colours.light.subText 
                      }}>
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </Text>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}

            <Separator />
            
            <Stack horizontal horizontalAlign="space-between">
              <DefaultButton
                text="Analyze Now"
                onClick={analyzeContent}
                disabled={isAnalyzing}
                iconProps={{ iconName: 'Search' }}
              />
              
              <DefaultButton
                text="Close"
                onClick={() => setIsOpen(false)}
              />
            </Stack>
          </Stack>
        </Callout>
      )}
    </>
  );
};

export default SmartTemplateSuggestions;
