import { colours } from '../../../app/styles/colours';

const FONT_FAMILY = 'Raleway,Arial,sans-serif';
const BASE_PARAGRAPH_STYLE = `margin:0;line-height:1.4;font-family:${FONT_FAMILY};`;
const LIST_MARGIN = '0 0 12px 20px';
const LIST_ITEM_STYLE = `margin:0 0 4px 0;line-height:1.4;font-family:${FONT_FAMILY};`;

const emailV2Flag = process.env.REACT_APP_EMAIL_V2_ENABLED;
const emailV2Enabled = emailV2Flag === 'true'
  ? true
  : emailV2Flag === 'false'
    ? false
    : process.env.NODE_ENV !== 'production';

export const EMAIL_V2_CONFIG = {
  enabled: emailV2Enabled,
  fallbackToV1: true,
  logOperations: process.env.REACT_APP_EMAIL_V2_LOGGING === 'true',
  testMode: false
};

const HEADING_STYLES: Record<'h1' | 'h2' | 'h3', string> = {
  h1: `font-size:24px;font-weight:700;margin:0;font-family:${FONT_FAMILY};line-height:1.3;`,
  h2: `font-size:20px;font-weight:700;margin:0;font-family:${FONT_FAMILY};line-height:1.3;`,
  h3: `font-size:18px;font-weight:700;margin:0;font-family:${FONT_FAMILY};line-height:1.3;`
};

const REDUNDANT_SPAN_STYLES = new Set([
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'font-variant-ligatures',
  'font-variant-caps',
  'background-color',
  'color',
  'line-height',
  'letter-spacing'
]);

const REDUNDANT_STYLE_VALUES = new Set(['inherit', 'initial', 'unset', 'transparent', '', '#000', '#000000']);

function mergeInlineStyles(...styleFragments: Array<string | undefined>): string {
  const declarations = new Map<string, string>();

  for (const fragment of styleFragments) {
    if (!fragment) continue;

    fragment
      .split(';')
      .map((rule) => rule.trim())
      .filter(Boolean)
      .forEach((rule) => {
        const [propertyRaw, ...valueParts] = rule.split(':');
        if (!propertyRaw || valueParts.length === 0) {
          return;
        }
        const property = propertyRaw.trim().toLowerCase();
        const value = valueParts.join(':').trim();
        if (property && value) {
          declarations.set(property, value);
        }
      });
  }

  if (declarations.size === 0) {
    return '';
  }

  return Array.from(declarations.entries())
    .map(([property, value]) => `${property}:${value}`)
    .join(';')
    .concat(';');
}

function stripProperties(style: string, properties: string[]): string {
  if (!style) {
    return '';
  }

  const propertiesSet = new Set(properties.map((prop) => prop.toLowerCase()));

  const remaining = style
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .filter((rule) => {
      const [propertyRaw] = rule.split(':');
      if (!propertyRaw) {
        return false;
      }
      const property = propertyRaw.trim().toLowerCase();
      return !propertiesSet.has(property);
    });

  return remaining.join(';');
}

function sanitiseParagraphStyle(style: string | undefined): string {
  if (!style) {
    return '';
  }

  const cleaned = stripProperties(style, ['margin', 'padding']);
  return cleaned ? cleaned.concat(cleaned.endsWith(';') ? '' : ';') : '';
}

function shouldPreserveSpan(attributes: string): boolean {
  if (!attributes || !attributes.trim()) {
    return false;
  }

  if (/(class|id|data-|aria-)/i.test(attributes)) {
    return true;
  }

  const styleMatch = attributes.match(/style\s*=\s*"([^"]*)"/i);
  if (!styleMatch) {
    return false;
  }

  const styleValue = styleMatch[1];
  const hasMeaningfulRule = styleValue
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .some((rule) => {
      const [propertyRaw, ...valueParts] = rule.split(':');
      if (!propertyRaw || valueParts.length === 0) {
        return false;
      }
      const property = propertyRaw.trim().toLowerCase();
      const value = valueParts.join(':').trim().toLowerCase();

      if (!REDUNDANT_SPAN_STYLES.has(property)) {
        return true;
      }

      return !REDUNDANT_STYLE_VALUES.has(value);
    });

  return hasMeaningfulRule;
}

/**
 * Enhanced line break preservation for Outlook compatibility
 */
export function preserveLineBreaksV2(html: string): string {
  if (!html) {
    return '';
  }

  let processed = html.replace(/\r\n/g, '\n');

  processed = processed.replace(/<div[^>]*>\s*<br[^>]*>\s*<\/div>/gi, '<br>');
  processed = processed.replace(/<div[^>]*>\s*<\/div>/gi, '');

  processed = processed.replace(/\n{3,}/g, '\n\n');
  processed = processed.replace(/\n\s*\n/g, `</p><p style="${BASE_PARAGRAPH_STYLE}">`);
  processed = processed.replace(/\n/g, '<br>');

  processed = processed.replace(/(<br[^>]*>\s*){3,}/gi, `<br><br>`);
  processed = processed.replace(/(<br[^>]*>\s*){2}/gi, `</p><p style="${BASE_PARAGRAPH_STYLE}">`);

  const trimmed = processed.trim();
  if (!trimmed) {
    return '';
  }

  let wrapped = trimmed;
  if (!/^<p\b/i.test(trimmed)) {
    wrapped = `<p style="${BASE_PARAGRAPH_STYLE}">${wrapped}`;
  }
  if (!/<\/p>\s*$/i.test(wrapped)) {
    wrapped = `${wrapped}</p>`;
  }

  return wrapped;
}

/**
 * Normalise inconsistent div/span structures that cause selection gaps
 */
export function normalizeHtmlStructure(html: string): string {
  if (!html) {
    return '';
  }

  let processed = html;

  processed = processed.replace(/<div[^>]*>\s*<\/div>/gi, '');
  processed = processed.replace(/<span[^>]*>\s*<\/span>/gi, '');

  processed = processed.replace(
    /<span([^>]*)>([\s\S]*?)<\/span>/gi,
    (match, attributes = '', content = '') => {
      if (!content.trim()) {
        return '';
      }

      if (shouldPreserveSpan(attributes)) {
        return `<span${attributes}>${content}</span>`;
      }

      return content;
    }
  );

  processed = processed.replace(/<span[^>]*>\s*(<br[^>]*>)\s*<\/span>/gi, '$1');
  processed = processed.replace(/<span[^>]*>\s*(?:&nbsp;|&#160;|\u00a0)\s*<\/span>/gi, '&nbsp;');

  return processed;
}

/**
 * Convert inline content-focused divs into paragraphs so downstream formatting stays consistent
 */
export function convertContentDivsToParagraphs(html: string): string {
  if (!html) {
    return '';
  }

  return html.replace(
    /<div([^>]*)>([\s\S]*?)<\/div>/gi,
    (match, rawAttributes = '', rawContent = '') => {
      const content = rawContent.trim();
      if (!content) {
        return '';
      }

      if (/(<\s*(div|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|section|article|header|footer|main|aside|form|figure|blockquote)[^>]*>)/i.test(content)) {
        return match;
      }

      const classMatch = rawAttributes.match(/class\s*=\s*"([^"]*)"/i);
      const idMatch = rawAttributes.match(/id\s*=\s*"([^"]*)"/i);
      const dataAttributes = rawAttributes
        .split(/\s+/)
        .filter(Boolean)
        .filter((attr: string) => /^(data-|aria-)/i.test(attr));

      const styleMatch = rawAttributes.match(/style\s*=\s*"([^"]*)"/i);
      const cleanedStyle = sanitiseParagraphStyle(styleMatch?.[1]);
      const mergedStyle = mergeInlineStyles(BASE_PARAGRAPH_STYLE, cleanedStyle);

      const classFragment = classMatch ? ` class="${classMatch[1]}"` : '';
      const idFragment = idMatch ? ` id="${idMatch[1]}"` : '';
      const dataFragment = dataAttributes.length ? ` ${dataAttributes.join(' ')}` : '';

      return `<p${classFragment}${idFragment}${dataFragment} style="${mergedStyle}">${content}</p>`;
    }
  );
}

/**
 * Remove redundant leading/trailing <br> tags inside paragraphs and collapse empty paragraphs
 */
export function tidyParagraphBreaks(html: string): string {
  if (!html) {
    return '';
  }

  let processed = html.replace(
    /<p([^>]*)>([\s\S]*?)<\/p>/gi,
    (match, attrs = '', content = '') => {
      const trimmedContent = content
        .replace(/^(?:\s*<br[^>]*>\s*)+/gi, '')
        .replace(/(?:\s*<br[^>]*>\s*)+$/gi, '')
        .trim();

      const withoutNbsp = trimmedContent.replace(/(?:&nbsp;|&#160;|\u00a0)/gi, '').trim();

      if (!withoutNbsp) {
        return '';
      }

      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
      const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
      const cleanedStyle = sanitiseParagraphStyle(styleMatch?.[1]);
      const mergedStyle = mergeInlineStyles(BASE_PARAGRAPH_STYLE, cleanedStyle);
      const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';

      return `<p${attrFragment} style="${mergedStyle}">${trimmedContent}</p>`;
    }
  );

  processed = processed.replace(/(?:<p[^>]*>\s*<\/p>\s*)+/gi, '');

  return processed;
}

export function splitParagraphsOnDoubleBreaks(html: string): string {
  if (!html) {
    return '';
  }

  return html.replace(
    /<p([^>]*)>([\s\S]*?)<\/p>/gi,
    (match, attrs = '', content = '') => {
      const segments = content
        .split(/(?:<br[^>]*>\s*){2,}/gi)
        .map((segment: string) => segment.trim())
        .filter(Boolean);

      if (segments.length <= 1) {
        return `<p${attrs}>${content}</p>`;
      }

      return segments
        .map((segment: string) => `<p${attrs}>${segment}</p>`)
        .join('');
    }
  );
}

export function protectNumbersFromOutlook(html: string): string {
  if (!html) {
    return '';
  }

  let processed = html;

  processed = processed.replace(
    /£[\d,]+(?:\.[\d]{1,2})?(?:\s*\+\s*VAT)?/gi,
    (match) => `<span style="font-weight:normal!important;text-decoration:none!important;">${match}</span>`
  );

  processed = processed.replace(
    /\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b/g,
    (match) => {
      const numericValue = parseFloat(match.replace(/,/g, ''));
      return numericValue >= 100
        ? `<span style="font-weight:normal!important;">${match}</span>`
        : match;
    }
  );

  processed = processed.replace(
    /\b\d+(?:\.\d+)?%/g,
    (match) => `<span style="font-weight:normal!important;">${match}</span>`
  );

  return processed;
}

export function wrapWithEmailContainer(html: string): string {
  return html || '';
}

function adjustParagraphMargin(paragraph: RegExpMatchArray, margin: string): string {
  const [fullMatch, attrs = '', content = ''] = paragraph;
  const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
  const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
  const cleanedStyle = sanitiseParagraphStyle(styleMatch?.[1]);
  const mergedStyle = mergeInlineStyles(margin, cleanedStyle);
  const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';
  return `<p${attrFragment} style="${mergedStyle}">${content}</p>`;
}

function tightenEdgeParagraphSpacing(html: string): string {
  if (!html) {
    return '';
  }

  const paragraphMatches = Array.from(html.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/gi));
  if (paragraphMatches.length === 0) {
    return html;
  }

  let result = html;

  const first = paragraphMatches[0];
  const last = paragraphMatches[paragraphMatches.length - 1];

  const isSingle = paragraphMatches.length === 1;

  const firstReplacement = adjustParagraphMargin(first, BASE_PARAGRAPH_STYLE);
  result = result.replace(first[0], firstReplacement);

  const lastMargin = isSingle ? 'margin:0 0 0 0;' : 'margin:0 0 0 0;';
  const lastReplacement = adjustParagraphMargin(last, lastMargin);
  result = result.replace(last[0], lastReplacement);

  return result;
}

/**
 * Enhanced heading formatting for better email client compatibility
 */
export function enhanceHeadingFormatting(html: string): string {
  if (!html) {
    return '';
  }

  let processed = html;

  (Object.keys(HEADING_STYLES) as Array<keyof typeof HEADING_STYLES>).forEach((tag) => {
    const baseStyle = HEADING_STYLES[tag];
    const regex = new RegExp(`<${tag}([^>]*)>`, 'gi');

    processed = processed.replace(regex, (match, attrs = '') => {
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
      const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
      const mergedStyle = mergeInlineStyles(baseStyle, styleMatch?.[1]);
      const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';

      return `<${tag}${attrFragment} style="${mergedStyle}">`;
    });
  });

  return processed;
}

/**
 * Enhanced list formatting with better Outlook compatibility
 */
export function enhanceListFormattingV2(html: string): string {
  if (!html) {
    return '';
  }

  let processed = html;

  processed = processed.replace(
    /<ul([^>]*)>/gi,
    (match, attrs = '') => {
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
      const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
      const mergedStyle = mergeInlineStyles(`margin:${LIST_MARGIN};padding:0;list-style-type:disc;font-family:${FONT_FAMILY};`, styleMatch?.[1]);
      const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';
      return `<ul${attrFragment} style="${mergedStyle}">`;
    }
  );

  processed = processed.replace(
    /<ol([^>]*)>/gi,
    (match, attrs = '') => {
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
      const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
      const mergedStyle = mergeInlineStyles(`margin:${LIST_MARGIN};padding:0;list-style-type:decimal;font-family:${FONT_FAMILY};`, styleMatch?.[1]);
      const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';
      return `<ol${attrFragment} style="${mergedStyle}">`;
    }
  );

  processed = processed.replace(
    /<li([^>]*)>/gi,
    (match, attrs = '') => {
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
      const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
      const mergedStyle = mergeInlineStyles(LIST_ITEM_STYLE, styleMatch?.[1]);
      const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';
      return `<li${attrFragment} style="${mergedStyle}">`;
    }
  );

  return processed;
}

/**
 * Enhanced link formatting for better email client support
 */
export function enhanceLinkFormatting(html: string): string {
  if (!html) {
    return '';
  }

  return html.replace(
    /<a([^>]*?)>/gi,
    (match, attrs = '') => {
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
      const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
      const mergedStyle = mergeInlineStyles(`color:${colours.blue}!important;text-decoration:underline!important;font-family:${FONT_FAMILY};`, styleMatch?.[1]);
      const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';
      return `<a${attrFragment} style="${mergedStyle}">`;
    }
  );
}

/**
 * Enhanced paragraph formatting for consistent spacing
 */
export function enhanceParagraphFormatting(html: string): string {
  if (!html) {
    return '';
  }

  let processed = html;

  processed = processed.replace(
    /<div([^>]*)>([\s\S]*?)<\/div>/gi,
    (match, rawAttributes = '', rawContent = '') => {
      const content = rawContent.trim();
      if (!content) {
        return '';
      }

      if (/(<\s*(div|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|section|article|header|footer|main|aside|form|figure|blockquote)[^>]*>)/i.test(content)) {
        return match;
      }

      const classMatch = rawAttributes.match(/class\s*=\s*"([^"]*)"/i);
      const idMatch = rawAttributes.match(/id\s*=\s*"([^"]*)"/i);
      const dataAttributes = rawAttributes
        .split(/\s+/)
        .filter(Boolean)
        .filter((attr: string) => /^(data-|aria-)/i.test(attr));

      const styleMatch = rawAttributes.match(/style\s*=\s*"([^"]*)"/i);
      const cleanedStyle = sanitiseParagraphStyle(styleMatch?.[1]);
      const mergedStyle = mergeInlineStyles(BASE_PARAGRAPH_STYLE, cleanedStyle);

      const classFragment = classMatch ? ` class="${classMatch[1]}"` : '';
      const idFragment = idMatch ? ` id="${idMatch[1]}"` : '';
      const dataFragment = dataAttributes.length ? ` ${dataAttributes.join(' ')}` : '';

      return `<p${classFragment}${idFragment}${dataFragment} style="${mergedStyle}">${content}</p>`;
    }
  );

  processed = processed.replace(
    /<p([^>]*)>/gi,
    (match, attrs = '') => {
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
      const otherAttrs = styleMatch ? attrs.replace(styleMatch[0], '').trim() : attrs.trim();
      const cleanedStyle = sanitiseParagraphStyle(styleMatch?.[1]);
      const mergedStyle = mergeInlineStyles(BASE_PARAGRAPH_STYLE, cleanedStyle);
      const attrFragment = otherAttrs ? ` ${otherAttrs}` : '';
      return `<p${attrFragment} style="${mergedStyle}">`;
    }
  );

  return processed;
}

/**
 * Add structural breaks between paragraphs for email client compatibility
 * Many email clients (especially Outlook) collapse CSS margins on paragraphs.
 * This function adds an empty line break element between paragraphs to ensure
 * visible separation that holds in all email clients.
 */
export function addStructuralParagraphBreaks(html: string): string {
  if (!html) {
    return '';
  }

  // Insert a <br> between closing </p> and opening <p> tags
  // This creates a structural break that email clients won't collapse
  let processed = html.replace(/<\/p>\s*<p/gi, '</p><br><p');

  return processed;
}

/**
 * Main V2 email processing function
 */
export function processEmailContentV2(html: string): string {
  if (!html) {
    return '';
  }

  EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Starting V2 processing');

  try {
    let processed = html;

    processed = normalizeHtmlStructure(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] HTML structure normalised');

    processed = convertContentDivsToParagraphs(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Content divs converted');

    processed = preserveLineBreaksV2(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Line breaks preserved');

    processed = protectNumbersFromOutlook(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Numbers protected');

    processed = enhanceParagraphFormatting(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Paragraphs enhanced');

    processed = splitParagraphsOnDoubleBreaks(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Paragraphs split');

    processed = tidyParagraphBreaks(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Paragraph breaks tidied');

    processed = tightenEdgeParagraphSpacing(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Edge paragraph spacing tightened');

    processed = enhanceHeadingFormatting(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Headings enhanced');

    processed = enhanceListFormattingV2(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Lists enhanced');

    processed = enhanceLinkFormatting(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Links enhanced');

    processed = addStructuralParagraphBreaks(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Structural paragraph breaks added');

    processed = wrapWithEmailContainer(processed);
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Container applied');

    return processed;
  } catch (error) {
    console.error('[EmailV2] Error in V2 processing:', error);

    if (EMAIL_V2_CONFIG.fallbackToV1) {
      EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Falling back to V1');
      return html;
    }

    throw error;
  }
}

/**
 * Safe wrapper that chooses between V1 and V2 processing
 */
export function processEmailWithFallback(html: string, v1Processor: (value: string) => string): string {
  if (!EMAIL_V2_CONFIG.enabled) {
    EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] V2 disabled, using V1');
    return v1Processor(html);
  }

  try {
    const v2Result = processEmailContentV2(html);

    if (EMAIL_V2_CONFIG.testMode) {
      const v1Result = v1Processor(html);
      console.log('[EmailV2] Test mode - V1 length:', v1Result.length);
      console.log('[EmailV2] Test mode - V2 length:', v2Result.length);
      return v1Result;
    }

    return v2Result;
  } catch (error) {
    console.error('[EmailV2] V2 processing failed:', error);

    if (EMAIL_V2_CONFIG.fallbackToV1) {
      EMAIL_V2_CONFIG.logOperations && console.log('[EmailV2] Falling back to V1');
      return v1Processor(html);
    }

    throw error;
  }
}

/**
 * Environment variable configuration helper
 */
export function getEmailV2Config() {
  return {
    ...EMAIL_V2_CONFIG,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };
}

/**
 * Testing helper to compare V1 vs V2 output
 */
export function compareFormattingSystems(
  html: string,
  v1Processor: (value: string) => string
): { v1: string; v2: string; differences: string[] } {
  const v1Result = v1Processor(html);
  const v2Result = processEmailContentV2(html);

  const differences: string[] = [];

  if (v1Result.length !== v2Result.length) {
    differences.push(`Length difference: V1=${v1Result.length}, V2=${v2Result.length}`);
  }

  return {
    v1: v1Result,
    v2: v2Result,
    differences
  };
}

export default processEmailContentV2;