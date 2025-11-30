import { colours } from '../../../app/styles/colours';

/**
 * Enhanced email-safe formatting utilities for pitch builder
 * These functions ensure rich text formatting survives email processing
 * and displays consistently across email clients (especially Outlook)
 */

/**
 * Convert contentEditable HTML to email-safe HTML with inline styles
 * This function processes the rich text content and converts CSS styles to inline styles
 */
export function convertToEmailSafeHTML(html: string): string {
  if (!html) return '';

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Process all elements and convert to inline styles
  processElementForEmail(tempDiv);

  return tempDiv.innerHTML;
}

/**
 * Process a DOM element recursively to make it email-safe
 */
function processElementForEmail(element: Element): void {
  // Convert formatting elements to email-safe inline styles
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT,
    null
  );

  const elementsToProcess: Element[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    elementsToProcess.push(currentNode as Element);
    currentNode = walker.nextNode();
  }

  elementsToProcess.forEach(el => {
    convertElementToInlineStyles(el as HTMLElement);
  });
}

/**
 * Convert a single element's styles to inline styles for email compatibility
 */
function convertElementToInlineStyles(element: HTMLElement): void {
  const tagName = element.tagName.toLowerCase();
  let inlineStyles: { [key: string]: string } = {};

  // Base font styles for all elements
  inlineStyles['font-family'] = 'Raleway, Arial, sans-serif';
  
  // Handle specific formatting tags
  switch (tagName) {
    case 'strong':
    case 'b':
      inlineStyles['font-weight'] = '700';
      break;
      
    case 'em':
    case 'i':
      inlineStyles['font-style'] = 'italic';
      break;
      
    case 'u':
      inlineStyles['text-decoration'] = 'underline';
      break;
      
    case 'strike':
    case 's':
      inlineStyles['text-decoration'] = 'line-through';
      break;
      
    case 'p':
      inlineStyles['margin'] = '0';
      inlineStyles['line-height'] = '1.4';
      inlineStyles['color'] = '#000000';
      break;
      
    case 'h1':
      inlineStyles['font-size'] = '24px';
      inlineStyles['font-weight'] = '700';
      inlineStyles['margin'] = '16px 0 12px 0';
      inlineStyles['color'] = '#000000';
      break;
      
    case 'h2':
      inlineStyles['font-size'] = '20px';
      inlineStyles['font-weight'] = '700';
      inlineStyles['margin'] = '14px 0 10px 0';
      inlineStyles['color'] = '#000000';
      break;
      
    case 'h3':
      inlineStyles['font-size'] = '18px';
      inlineStyles['font-weight'] = '700';
      inlineStyles['margin'] = '12px 0 8px 0';
      inlineStyles['color'] = '#000000';
      break;
      
    case 'ul':
      inlineStyles['margin'] = '0 0 12px 20px';
      inlineStyles['padding'] = '0';
      inlineStyles['list-style-type'] = 'disc';
      break;
      
    case 'ol':
      inlineStyles['margin'] = '0 0 12px 20px';
      inlineStyles['padding'] = '0';
      inlineStyles['list-style-type'] = 'decimal';
      break;
      
    case 'li':
      inlineStyles['margin'] = '0 0 4px 0';
      inlineStyles['line-height'] = '1.4';
      inlineStyles['color'] = '#000000';
      break;
      
    case 'a':
      inlineStyles['color'] = '#3690CE';
      inlineStyles['text-decoration'] = 'underline';
      break;
      
    case 'blockquote':
      inlineStyles['margin'] = '12px 0 12px 20px';
      inlineStyles['padding'] = '8px 12px';
      inlineStyles['border-left'] = '3px solid #3690CE';
      inlineStyles['background-color'] = '#f8f9fa';
      inlineStyles['font-style'] = 'italic';
      break;
      
    case 'div':
      // Only add line-height for divs that don't have specific styling
      if (!element.style.cssText) {
        inlineStyles['line-height'] = '1.4';
      }
      break;
  }

  // Preserve existing inline styles and merge with our styles
  const existingStyles = parseStyleString(element.style.cssText);
  const mergedStyles = { ...inlineStyles, ...existingStyles };

  // Handle text alignment
  if (element.style.textAlign) {
    mergedStyles['text-align'] = element.style.textAlign;
  }

  // Handle colors
  if (element.style.color) {
    mergedStyles['color'] = element.style.color;
  }
  
  if (element.style.backgroundColor) {
    mergedStyles['background-color'] = element.style.backgroundColor;
  }

  // Handle font properties
  if (element.style.fontSize) {
    mergedStyles['font-size'] = element.style.fontSize;
  }

  // Apply the merged styles
  element.style.cssText = formatStyleObject(mergedStyles);
}

/**
 * Parse CSS style string into an object
 */
function parseStyleString(styleStr: string): { [key: string]: string } {
  const styles: { [key: string]: string } = {};
  if (!styleStr) return styles;

  styleStr.split(';').forEach(rule => {
    const [property, value] = rule.split(':').map(s => s.trim());
    if (property && value) {
      styles[property] = value;
    }
  });

  return styles;
}

/**
 * Convert style object to CSS string
 */
function formatStyleObject(styles: { [key: string]: string }): string {
  return Object.entries(styles)
    .filter(([, value]) => value)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');
}

/**
 * Convert document.execCommand formatting to email-safe HTML
 * This processes the current selection and ensures proper email formatting
 */
export function normalizeFormattingForEmail(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Replace browser-specific formatting with standard tags
  replaceBrowserFormatting(tempDiv);
  
  // Convert to email-safe inline styles
  processElementForEmail(tempDiv);

  return tempDiv.innerHTML;
}

/**
 * Replace browser-specific formatting elements with standard ones
 */
function replaceBrowserFormatting(container: Element): void {
  // Replace <font> tags with spans
  const fontTags = container.querySelectorAll('font');
  fontTags.forEach(font => {
    const fontElement = font as HTMLFontElement;
    const span = document.createElement('span');
    
    // Convert font attributes to styles
    if (fontElement.size) {
      const sizeMap: { [key: string]: string } = {
        '1': '8px', '2': '10px', '3': '12px', '4': '14px',
        '5': '18px', '6': '24px', '7': '36px'
      };
      span.style.fontSize = sizeMap[fontElement.size] || '14px';
    }
    
    if (fontElement.color) {
      span.style.color = fontElement.color;
    }
    
    if (fontElement.face) {
      span.style.fontFamily = fontElement.face;
    }

    // Move children
    while (font.firstChild) {
      span.appendChild(font.firstChild);
    }
    
    font.parentNode?.replaceChild(span, font);
  });

  // Replace <big> and <small> tags
  container.querySelectorAll('big').forEach(big => {
    const span = document.createElement('span');
    span.style.fontSize = '18px';
    while (big.firstChild) {
      span.appendChild(big.firstChild);
    }
    big.parentNode?.replaceChild(span, big);
  });

  container.querySelectorAll('small').forEach(small => {
    const span = document.createElement('span');
    span.style.fontSize = '10px';
    while (small.firstChild) {
      span.appendChild(small.firstChild);
    }
    small.parentNode?.replaceChild(span, small);
  });

  // Normalize nested formatting
  normalizeNestedFormatting(container);
}

/**
 * Normalize nested formatting elements (e.g., multiple nested <b> tags)
 */
function normalizeNestedFormatting(container: Element): void {
  // Remove redundant nested bold tags
  container.querySelectorAll('b b, strong strong, strong b, b strong').forEach(nested => {
    while (nested.firstChild) {
      nested.parentNode?.insertBefore(nested.firstChild, nested);
    }
    nested.remove();
  });

  // Remove redundant nested italic tags
  container.querySelectorAll('i i, em em, em i, i em').forEach(nested => {
    while (nested.firstChild) {
      nested.parentNode?.insertBefore(nested.firstChild, nested);
    }
    nested.remove();
  });

  // Remove redundant nested underline tags
  container.querySelectorAll('u u').forEach(nested => {
    while (nested.firstChild) {
      nested.parentNode?.insertBefore(nested.firstChild, nested);
    }
    nested.remove();
  });
}

/**
 * Enhanced list formatting for email compatibility
 * Converts browser-generated lists to email-safe versions
 */
export function enhanceListFormatting(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Process unordered lists
  tempDiv.querySelectorAll('ul').forEach(ul => {
    ul.style.cssText = 'margin:0 0 12px 20px;padding:0;list-style-type:disc;font-family:Raleway,Arial,sans-serif;';
    
    ul.querySelectorAll('li').forEach(li => {
      li.style.cssText = 'margin:0 0 4px 0;line-height:1.4;font-family:Raleway,Arial,sans-serif;';
    });
  });

  // Process ordered lists with custom styling for better email compatibility
  tempDiv.querySelectorAll('ol').forEach(ol => {
    ol.style.cssText = 'margin:0 0 12px 20px;padding:0;list-style-type:decimal;font-family:Raleway,Arial,sans-serif;';
    
    ol.querySelectorAll('li').forEach(li => {
      li.style.cssText = 'margin:0 0 4px 0;line-height:1.4;font-family:Raleway,Arial,sans-serif;';
    });
  });

  return tempDiv.innerHTML;
}

/**
 * Clean up and optimize HTML for email sending
 * This is the final step before sending to ensure maximum compatibility
 */
export function finalizeHTMLForEmail(html: string): string {
  let processed = html;

  // Convert to email-safe format
  processed = convertToEmailSafeHTML(processed);
  
  // Enhance list formatting
  processed = enhanceListFormatting(processed);
  
  // Ensure proper paragraph formatting
  processed = ensureParagraphFormatting(processed);
  
  // Clean up empty tags and normalize whitespace
  processed = cleanupEmptyTags(processed);
  
  return processed;
}

/**
 * Ensure proper paragraph formatting for email clients
 */
function ensureParagraphFormatting(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Convert standalone text nodes to paragraphs
  const walker = document.createTreeWalker(
    tempDiv,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodesToWrap: Text[] = [];
  let currentNode = walker.nextNode();
  
  while (currentNode) {
    const textNode = currentNode as Text;
    const content = textNode.textContent?.trim();
    
    if (content && 
        textNode.parentElement === tempDiv && 
        !isInlineElement(textNode.previousSibling as Element) &&
        !isInlineElement(textNode.nextSibling as Element)) {
      textNodesToWrap.push(textNode);
    }
    currentNode = walker.nextNode();
  }

  textNodesToWrap.forEach(textNode => {
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 12px 0;line-height:1.6;color:#000000;';
    textNode.parentNode?.replaceChild(p, textNode);
    p.appendChild(textNode);
  });

  return tempDiv.innerHTML;
}

/**
 * Check if an element is an inline element
 */
function isInlineElement(element: Element | null): boolean {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  
  const inlineTags = ['a', 'span', 'strong', 'b', 'em', 'i', 'u', 'strike', 's', 'small', 'big'];
  return inlineTags.includes(element.tagName.toLowerCase());
}

/**
 * Remove empty tags and normalize whitespace
 */
function cleanupEmptyTags(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Remove empty elements (except br, img, hr)
  const emptyElements = tempDiv.querySelectorAll('*:empty:not(br):not(img):not(hr)');
  emptyElements.forEach(el => {
    const htmlEl = el as HTMLElement;
    if (el.tagName.toLowerCase() !== 'p' || !htmlEl.style.cssText) {
      el.remove();
    }
  });

  // Normalize whitespace conservatively: do not collapse text-node spaces or line breaks
  let normalized = tempDiv.innerHTML;
  // Trim only the spaces between tags to avoid introducing accidental whitespace
  normalized = normalized.replace(/>\s+</g, '><');
  
  return normalized;
}

/**
 * Extract and preserve formatting from contentEditable content
 * This function is called before sending to ensure all formatting is captured
 */
export function extractFormattingForEmail(editorElement: HTMLElement): string {
  if (!editorElement) return '';

  // Clone the element to avoid modifying the original
  const clone = editorElement.cloneNode(true) as HTMLElement;
  
  // Process the clone for email compatibility
  return finalizeHTMLForEmail(clone.innerHTML);
}

/**
 * Process editor content for email - alias for extractFormattingForEmail
 */
export function processEditorContentForEmail(editorElement: HTMLElement | null, fallbackContent?: string): string {
  if (!editorElement) {
    return fallbackContent || '';
  }
  return extractFormattingForEmail(editorElement);
}

/**
 * Keyboard shortcut mappings for formatting
 */
export const KEYBOARD_SHORTCUTS = {
  'ctrl+b': 'bold',
  'ctrl+i': 'italic',
  'ctrl+u': 'underline',
  'ctrl+shift+s': 'strikeThrough',
  'ctrl+shift+8': 'insertUnorderedList',
  'ctrl+shift+7': 'insertOrderedList',
  'ctrl+k': 'createLink',
  'ctrl+l': 'justifyLeft',
  'ctrl+e': 'justifyCenter',
  'ctrl+r': 'justifyRight',
  'ctrl+z': 'undo',
  'ctrl+y': 'redo',
  'ctrl+shift+z': 'redo'
} as const;

export type FormattingCommand = typeof KEYBOARD_SHORTCUTS[keyof typeof KEYBOARD_SHORTCUTS];