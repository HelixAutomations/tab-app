import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FaBold, 
  FaItalic, 
  FaUnderline, 
  FaStrikethrough,
  FaListUl, 
  FaListOl, 
  FaIndent, 
  FaOutdent,
  FaAlignLeft,
  FaAlignCenter,
  FaAlignRight,
  FaLink,
  FaUnlink,
  FaTextHeight,
  FaPalette,
  FaHighlighter,
  FaEraser,
  FaUndo,
  FaRedo,
  FaFont
} from 'react-icons/fa';
import { colours } from '../../../app/styles/colours';

interface FormattingToolbarProps {
  isDarkMode: boolean;
  onFormatChange?: (command: string, value?: string) => void;
  editorRef?: React.RefObject<HTMLElement>;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
}

const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  isDarkMode,
  onFormatChange,
  editorRef,
  className,
  style,
  disabled = false
}) => {
  const [formatState, setFormatState] = useState<FormatState>({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    justifyLeft: true,
    justifyCenter: false,
    justifyRight: false
  });

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [fontSize, setFontSize] = useState('14');
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const highlightPickerRef = useRef<HTMLDivElement>(null);

  // Common colors for text and highlighting
  const textColors = [
    '#000000', '#333333', '#666666', '#999999',
    '#D65541', '#3690CE', '#4CAF50', '#FF9800',
    '#9C27B0', '#E91E63', '#2196F3', '#00BCD4'
  ];

  const highlightColors = [
    'transparent', '#FFEB3B', '#FFC107', '#FF9800',
    '#F44336', '#E91E63', '#9C27B0', '#673AB7',
    '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
    '#009688', '#4CAF50', '#8BC34A', '#CDDC39'
  ];

  // Update format state based on current selection
  const updateFormatState = useCallback(() => {
    try {
      setFormatState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight')
      });
    } catch (error) {
      console.warn('Failed to update format state:', error);
    }
  }, []);

  // Execute formatting command with email-safe implementation
  const executeCommand = useCallback((command: string, value?: string) => {
    // Don't execute commands if toolbar is disabled
    if (disabled) {
      return false;
    }
    
    try {
      // Focus the editor first
      if (editorRef?.current) {
        editorRef.current.focus();
      }

      // Use the callback provided by parent component
      if (onFormatChange) {
        onFormatChange(command, value);
        updateFormatState();
        return true;
      }

      // Fallback to direct execution if no callback provided
      let success = false;
      
      // Special handling for certain commands to ensure email compatibility
      switch (command) {
        case 'bold':
        case 'italic':
        case 'underline':
        case 'strikeThrough':
          success = document.execCommand(command, false, undefined);
          break;
          
        case 'insertUnorderedList':
        case 'insertOrderedList':
          success = document.execCommand(command, false, undefined);
          break;
          
        case 'justifyLeft':
        case 'justifyCenter':
        case 'justifyRight':
          success = document.execCommand(command, false, undefined);
          break;
          
        case 'foreColor':
        case 'backColor':
          success = document.execCommand(command, false, value);
          break;
          
        case 'fontSize':
          success = document.execCommand(command, false, value);
          break;
          
        case 'createLink':
          const url = value || prompt('Enter URL:');
          if (url) {
            success = document.execCommand('createLink', false, url);
          }
          break;
          
        case 'unlink':
          success = document.execCommand('unlink', false, undefined);
          break;
          
        case 'undo':
        case 'redo':
          success = document.execCommand(command, false, undefined);
          break;
          
        case 'removeFormat':
          success = document.execCommand('removeFormat', false, undefined);
          break;
          
        default:
          success = document.execCommand(command, false, value);
      }

      if (success) {
        updateFormatState();
      }

      return success;
    } catch (error) {
      console.warn(`Failed to execute command ${command}:`, error);
      return false;
    }
  }, [editorRef, onFormatChange, updateFormatState, disabled]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editorRef?.current?.contains(e.target as Node)) return;

      const { ctrlKey, metaKey, shiftKey, key } = e;
      const cmdKey = ctrlKey || metaKey;

      if (cmdKey) {
        switch (key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            executeCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            executeCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            executeCommand('underline');
            break;
          case 'k':
            e.preventDefault();
            executeCommand('createLink');
            break;
          case 'z':
            if (shiftKey) {
              e.preventDefault();
              executeCommand('redo');
            } else {
              e.preventDefault();
              executeCommand('undo');
            }
            break;
          case 'y':
            e.preventDefault();
            executeCommand('redo');
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [executeCommand, editorRef]);

  // Update format state when selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      if (document.activeElement === editorRef?.current) {
        updateFormatState();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updateFormatState, editorRef]);

  // Close color pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
      if (highlightPickerRef.current && !highlightPickerRef.current.contains(event.target as Node)) {
        setShowHighlightPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buttonStyle = (isActive: boolean = false) => ({
    padding: '6px 8px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: isActive 
      ? (isDarkMode ? colours.highlight : '#e3f2fd')
      : 'transparent',
    color: disabled
      ? (isDarkMode ? '#64748B' : '#94A3B8')
      : (isDarkMode ? colours.dark.text : '#333'),
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    transition: 'all 0.2s ease',
    position: 'relative' as const
  });

  const separatorStyle = {
    width: '1px',
    height: '24px',
    backgroundColor: disabled
      ? (isDarkMode ? '#374151' : '#D1D5DB')
      : (isDarkMode ? colours.dark.border : '#e1e5e9'),
    margin: '0 4px',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.2s ease'
  };

  const dropdownStyle = {
    position: 'absolute' as const,
    top: '100%',
    left: '0',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : '#fff',
    border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
    borderRadius: '4px',
    padding: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 1000,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '4px',
    minWidth: '120px'
  };

  return (
    <div 
      className={className}
      onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from editor
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '8px 12px',
        backgroundColor: isDarkMode ? colours.dark.cardBackground : '#f8f9fa',
        border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
        borderRadius: '6px',
        flexWrap: 'wrap',
        ...style
      }}
    >
      {/* Text Formatting */}
      <button
        style={buttonStyle(formatState.bold)}
        onClick={() => executeCommand('bold')}
        title="Bold (Ctrl+B)"
        onMouseEnter={(e) => !disabled && (e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0')}
        onMouseLeave={(e) => !disabled && (e.currentTarget.style.backgroundColor = formatState.bold ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent')}
      >
        <FaBold />
      </button>

      <button
        style={buttonStyle(formatState.italic)}
        onClick={() => executeCommand('italic')}
        title="Italic (Ctrl+I)"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.italic ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaItalic />
      </button>

      <button
        style={buttonStyle(formatState.underline)}
        onClick={() => executeCommand('underline')}
        title="Underline (Ctrl+U)"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.underline ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaUnderline />
      </button>

      <button
        style={buttonStyle(formatState.strikethrough)}
        onClick={() => executeCommand('strikeThrough')}
        title="Strikethrough"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.strikethrough ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaStrikethrough />
      </button>

      <div style={separatorStyle} />

      {/* Lists */}
      <button
        style={buttonStyle(formatState.insertUnorderedList)}
        onClick={() => executeCommand('insertUnorderedList')}
        title="Bullet List"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.insertUnorderedList ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaListUl />
      </button>

      <button
        style={buttonStyle(formatState.insertOrderedList)}
        onClick={() => executeCommand('insertOrderedList')}
        title="Numbered List"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.insertOrderedList ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaListOl />
      </button>

      <button
        style={buttonStyle()}
        onClick={() => executeCommand('outdent')}
        title="Decrease Indent"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FaOutdent />
      </button>

      <button
        style={buttonStyle()}
        onClick={() => executeCommand('indent')}
        title="Increase Indent"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FaIndent />
      </button>

      <div style={separatorStyle} />

      {/* Alignment */}
      <button
        style={buttonStyle(formatState.justifyLeft)}
        onClick={() => executeCommand('justifyLeft')}
        title="Align Left"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.justifyLeft ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaAlignLeft />
      </button>

      <button
        style={buttonStyle(formatState.justifyCenter)}
        onClick={() => executeCommand('justifyCenter')}
        title="Align Center"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.justifyCenter ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaAlignCenter />
      </button>

      <button
        style={buttonStyle(formatState.justifyRight)}
        onClick={() => executeCommand('justifyRight')}
        title="Align Right"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formatState.justifyRight ? (isDarkMode ? colours.highlight : '#e3f2fd') : 'transparent'}
      >
        <FaAlignRight />
      </button>

      <div style={separatorStyle} />

      {/* Font Size */}
      <select
        value={fontSize}
        onChange={(e) => {
          setFontSize(e.target.value);
          executeCommand('fontSize', e.target.value);
        }}
        style={{
          padding: '4px 6px',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: isDarkMode ? colours.dark.inputBackground : '#fff',
          color: isDarkMode ? colours.dark.text : '#333',
          fontSize: '12px',
          cursor: 'pointer'
        }}
        title="Font Size"
      >
        <option value="1">8pt</option>
        <option value="2">10pt</option>
        <option value="3">12pt</option>
        <option value="4">14pt</option>
        <option value="5">18pt</option>
        <option value="6">24pt</option>
        <option value="7">36pt</option>
      </select>

      {/* Text Color */}
      <div style={{ position: 'relative' }} ref={colorPickerRef}>
        <button
          style={buttonStyle()}
          onClick={() => {
            setShowColorPicker(!showColorPicker);
            setShowHighlightPicker(false);
          }}
          title="Text Color"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <FaPalette />
        </button>
        {showColorPicker && (
          <div style={dropdownStyle}>
            {textColors.map((color) => (
              <button
                key={color}
                style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: color,
                  border: '1px solid #ccc',
                  borderRadius: '2px',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  executeCommand('foreColor', color);
                  setShowColorPicker(false);
                }}
                title={`Set text color to ${color}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Highlight Color */}
      <div style={{ position: 'relative' }} ref={highlightPickerRef}>
        <button
          style={buttonStyle()}
          onClick={() => {
            setShowHighlightPicker(!showHighlightPicker);
            setShowColorPicker(false);
          }}
          title="Highlight Color"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <FaHighlighter />
        </button>
        {showHighlightPicker && (
          <div style={dropdownStyle}>
            {highlightColors.map((color) => (
              <button
                key={color}
                style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: color === 'transparent' ? '#fff' : color,
                  border: '1px solid #ccc',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onClick={() => {
                  executeCommand('backColor', color);
                  setShowHighlightPicker(false);
                }}
                title={color === 'transparent' ? 'Remove highlight' : `Highlight with ${color}`}
              >
                {color === 'transparent' && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%) rotate(45deg)',
                    width: '2px',
                    height: '16px',
                    backgroundColor: '#f44336'
                  }} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={separatorStyle} />

      {/* Links */}
      <button
        style={buttonStyle()}
        onClick={() => executeCommand('createLink')}
        title="Insert Link (Ctrl+K)"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FaLink />
      </button>

      <button
        style={buttonStyle()}
        onClick={() => executeCommand('unlink')}
        title="Remove Link"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FaUnlink />
      </button>

      <div style={separatorStyle} />

      {/* Clear Formatting */}
      <button
        style={buttonStyle()}
        onClick={() => executeCommand('removeFormat')}
        title="Clear Formatting"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FaEraser />
      </button>

      <div style={separatorStyle} />

      {/* Undo/Redo */}
      <button
        style={buttonStyle()}
        onClick={() => executeCommand('undo')}
        title="Undo (Ctrl+Z)"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FaUndo />
      </button>

      <button
        style={buttonStyle()}
        onClick={() => executeCommand('redo')}
        title="Redo (Ctrl+Y)"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FaRedo />
      </button>
    </div>
  );
};

export default FormattingToolbar;