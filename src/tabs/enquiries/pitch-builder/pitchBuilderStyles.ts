/**
 * Pitch Builder Style Constants
 * Consolidates repeated color values and style patterns used across PitchBuilder
 * and EditorAndTemplateBlocks components.
 */

import { colours } from '../../../app/styles/colours';

/**
 * Email-specific colors used in email formatting
 */
export const emailColors = {
  /** Standard font color for email body */
  bodyText: '#000000',
  /** Background for locked/selected template blocks */
  lockedBg: {
    light: '#eafaea',
    dark: 'rgba(16,124,16,0.1)',
  },
  /** Background for edited template blocks */
  editedBlockBg: {
    light: '#e8f4fd',
    dark: 'rgba(70,130,180,0.15)',
  },
  /** Unresolved placeholder styling */
  unresolvedPlaceholder: {
    background: '#fff3cd',
    border: '#e0c46c',
  },
  /** Link attachment background */
  linkAttachmentBg: '#ffe6e6',
};

/**
 * Step number styling constants
 */
export const stepNumberStyles = {
  /** Circle size for step numbers */
  size: 28,
  /** Border width */
  borderWidth: 2,
  /** Font weight for the number */
  fontWeight: 600,
  /** Font size */
  fontSize: 14,
};

/**
 * Email body wrapper styles (matches HelixSignatureHelper.cs)
 */
export const emailBodyWrapperStyles = {
  fontFamily: 'Raleway, sans-serif',
  fontSize: '10pt',
  lineHeight: 1.6,
  color: emailColors.bodyText,
  marginBottom: '16px',
};

/**
 * Helper to get background color for locked template blocks
 */
export function getLockedBg(isDarkMode: boolean): string {
  return isDarkMode ? emailColors.lockedBg.dark : emailColors.lockedBg.light;
}

/**
 * Helper to get background color for edited template blocks
 */
export function getEditedBlockBg(isDarkMode: boolean): string {
  return isDarkMode ? emailColors.editedBlockBg.dark : emailColors.editedBlockBg.light;
}

/**
 * Insert placeholder CSS for contentEditable
 * This CSS is injected into the document head for the rich text editor
 */
export const insertPlaceholderCSS = `
  .insert-placeholder {
    display: inline;
    background: linear-gradient(135deg, ${colours.highlightBlue} 0%, #d0e8ff 100%);
    border: 1px dashed ${colours.blue};
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    transition: all 0.15s ease;
    user-select: none;
  }
  .insert-placeholder:hover {
    background: linear-gradient(135deg, #bdd8ff 0%, #a8cfff 100%);
    border-color: ${colours.highlight};
    box-shadow: 0 2px 6px rgba(54,144,206,0.25);
  }
`;

/**
 * Highlighted placeholder CSS for preview mode
 */
export const highlightedPlaceholderCSS = `
  [data-highlighted-placeholder] {
    background: ${emailColors.unresolvedPlaceholder.background};
    border: 1px dotted ${emailColors.unresolvedPlaceholder.border};
    padding: 0 2px;
  }
`;
