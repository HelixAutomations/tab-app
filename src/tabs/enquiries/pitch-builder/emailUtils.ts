import { Enquiry } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';
import { templateBlocks, TemplateBlock } from '../../../app/customisation/ProductionTemplateBlocks';
import { finalizeHTMLForEmail, extractFormattingForEmail } from './emailFormattingUtils';

const EMAIL_PARAGRAPH_STYLE = 'margin:0;line-height:1.4;font-family:Raleway,Arial,sans-serif;';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function getLeftoverPlaceholders(blocks: TemplateBlock[] = templateBlocks): string[] {
  return [...blocks.map((b) => b.placeholder), '[Amount]'];
}

export const leftoverPlaceholders = getLeftoverPlaceholders();

/**
 * Utility: turn consecutive <br><br> lines into real paragraphs (<p>...).
 * Some email clients (especially Outlook) collapse repeated <br> tags.
 * Converting them into <p> ensures consistent spacing.
 * We also add <br> between paragraphs so email clients create structural breaks.
 */
export function convertDoubleBreaksToParagraphs(html: string): string {
  let normalized = html
// invisible change
    .replace(/\r\n/g, '\n')
    .replace(/(<br \/>){2,}/g, '\n\n')
    // Preserve explicit breaks after block elements; do not strip <br /> following </div>
    ;
    
  // Convert numbered lists to proper HTML ordered lists
  normalized = convertNumberedListsToHTML(normalized);
  
  const paragraphs = normalized.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const wrapped = paragraphs.map((paragraph) => {
    const t = paragraph.trim();
    // Keep block-level lists as-is to avoid invalid <p><ol> nesting in Outlook
    if (/^<ol\b/i.test(t) && /<\/ol>\s*$/i.test(t)) return t;
    return `<p style="${EMAIL_PARAGRAPH_STYLE}">${t}</p>`;
  });
  // Join with <br> between paragraphs for structural breaks that email clients respect
  return wrapped.join('<br>');
}

/**
 * Convert plain text numbered lists to HTML ordered lists.
 * Looks for patterns like "1. " and "2. " and converts them to proper <ol><li> structure.
 */
export function convertNumberedListsToHTML(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;
  let listItems: { n: number; content: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const listItemMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);

    if (listItemMatch) {
      const n = Number(listItemMatch[1]);
      const itemContent = listItemMatch[2];
      if (!inList) {
        inList = true;
        listItems = [];
      }
      listItems.push({ n, content: itemContent });
    } else {
      if (inList) {
        const html =
          `<ol class="hlx-numlist" style="list-style:none;padding-left:0;margin:16px 0;">` +
          listItems
            .map(({ n, content }) =>
              `<li style="margin:0 0 12px 0;line-height:1.4;">` +
              `<span style="display:inline-block;min-width:1.6em;color:#D65541;font-weight:700;">${n}.` +
              `</span><span>${content}</span></li>`
            )
            .join('') +
          `</ol>`;
        result.push(html);
        inList = false;
        listItems = [];
      }
      result.push(trimmedLine ? line : '');
    }
  }

  if (inList && listItems.length > 0) {
    const html =
      `<ol class="hlx-numlist" style="list-style:none;padding-left:0;margin:16px 0;">` +
      listItems
        .map(({ n, content }) =>
          `<li style="margin:0 0 12px 0;line-height:1.4;">` +
          `<span style="display:inline-block;min-width:1.6em;color:#D65541;font-weight:700;">${n}.` +
          `</span><span>${content}</span></li>`
        )
        .join('') +
      `</ol>`;
    result.push(html);
  }

  return result.join('\n');
}

/**
 * Removes lines that contain leftover placeholders.
 * Also condenses multiple blank lines down to one.
 */
export function removeUnfilledPlaceholders(
  text: string,
  blocks: TemplateBlock[] = templateBlocks
): string {
  const placeholders = getLeftoverPlaceholders(blocks);

  // Remove placeholder tokens but keep surrounding copy
  let cleaned = text;
  placeholders.forEach((placeholder) => {
    const regex = new RegExp(escapeRegExp(placeholder), 'g');
    cleaned = cleaned.replace(regex, '');
  });

  const lines = cleaned.split('\n');

  const consolidated: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed === '' &&
      consolidated.length > 0 &&
      consolidated[consolidated.length - 1].trim() === ''
    ) {
      continue;
    }
    consolidated.push(trimmed);
  }

  return consolidated.join('\n').trim();
}

/**
 * Highlight leftover placeholders in CTA red so they stand out in previews
 */
export function markUnfilledPlaceholders(
  text: string,
  blocks: TemplateBlock[] = templateBlocks
): string {
  const placeholders = getLeftoverPlaceholders(blocks);
  let marked = text;
  placeholders.forEach((placeholder) => {
    const regex = new RegExp(escapeRegExp(placeholder), 'g');
    marked = marked.replace(
      regex,
      `<span style="color: ${colours.cta}; font-weight: bold;">${placeholder}</span>`
    );
  });
  // Also highlight generic [INSERT ...] placeholders that haven't been filled
  marked = marked.replace(/\[INSERT[^\]]*\]/gi, (m) => {
    return `<span style="color: ${colours.cta}; font-weight: bold;">${m}</span>`;
  });
  return marked;
}

/**
 * Strips all the highlight <span> attributes (data-placeholder, data-inserted, etc.)
 * so final email doesn't have bright highlighting.
 * Enhanced version that preserves rich text formatting while removing editor UI elements.
 */
export function removeHighlightSpans(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Elements that should be fully removed
  const removeSelectors =
    '.lock-toggle, .block-sidebar, .sentence-delete, .sentence-handle';
  tempDiv.querySelectorAll(removeSelectors).forEach((el) => el.remove());

  // Unwrap placeholder containers. If no option is selected, keep the first
  // option's content so that default previews still render.
  tempDiv.querySelectorAll('.block-option-list').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;

    const bubbles = Array.from(el.querySelectorAll('.option-bubble')) as HTMLElement[];
    let keep = bubbles.find(
      (b) => b.classList.contains('active') || b.classList.contains('selected')
    );
    if (!keep && bubbles.length > 0) {
      keep = bubbles[0];
    }

    bubbles.forEach((bubble) => {
      const bubbleEl = bubble as HTMLElement;
      if (bubbleEl === keep) {
        const bubbleParent = bubbleEl.parentNode;
        if (!bubbleParent) return;

        // Remove option headers so only the main content remains
        bubbleEl.querySelectorAll('strong').forEach((el) => el.remove());

        // Unwrap option-preview containers to avoid indentation styles
        bubbleEl.querySelectorAll('.option-preview').forEach((preview) => {
          const previewParent = preview.parentNode;
          if (!previewParent) return;
          while (preview.firstChild)
            previewParent.insertBefore(preview.firstChild, preview);
          previewParent.removeChild(preview);
        });

        while (bubbleEl.firstChild)
          bubbleParent.insertBefore(bubbleEl.firstChild, bubbleEl);
        bubbleParent.removeChild(bubbleEl);
      } else {
        bubbleEl.remove();
      }
    });

    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  // Remove highlight attributes/classes but preserve formatting elements
  const cleanupSelectors =
    '[data-placeholder], [data-inserted], [data-link], [data-sentence], [data-insert], [data-snippet], [data-block-title], .insert-placeholder, .block-main, .block-container';
  tempDiv.querySelectorAll(cleanupSelectors).forEach((el) => {
    el.removeAttribute('data-placeholder');
    el.removeAttribute('data-inserted');
    el.removeAttribute('data-link');
    el.removeAttribute('data-sentence');
    el.removeAttribute('data-insert');
    el.removeAttribute('data-snippet');
    el.removeAttribute('data-block-title');
    el.removeAttribute('contenteditable');
    
    // Remove highlight-specific styling but preserve rich text formatting
    const htmlEl = el as HTMLElement;
    if (htmlEl.style.backgroundColor && 
        (htmlEl.style.backgroundColor.includes('rgb(255, 255, 0)') || 
         htmlEl.style.backgroundColor.includes('#ffff00') ||
         htmlEl.style.backgroundColor.includes('yellow'))) {
      htmlEl.style.backgroundColor = '';
    }
    
    // Remove editor-specific classes but keep formatting
    if (htmlEl.classList.contains('block-main')) {
      htmlEl.classList.remove('block-main');
    }
    if (htmlEl.classList.contains('block-container')) {
      htmlEl.classList.remove('block-container');
    }
    if (htmlEl.classList.contains('insert-placeholder')) {
      htmlEl.classList.remove('insert-placeholder');
    }
  });

  // Unwrap containers that are purely structural
  tempDiv.querySelectorAll('[data-block-title]').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  tempDiv.querySelectorAll('.block-main, .block-container').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  // Remove label helpers
  tempDiv
    .querySelectorAll('.block-label, .block-label-display')
    .forEach((el) => el.remove());

  // Apply final email formatting conversion
  return finalizeHTMLForEmail(tempDiv.innerHTML);
}

/**
 * When we insert multiline text from the TemplateBlocks, we turn raw newlines into <br />.
 */
export function cleanTemplateString(template: string): string {
  // Trim the entire string to remove leading/trailing whitespace and newlines
  const trimmedTemplate = template.trim();
  let lines = trimmedTemplate.split('\n');

  // If the first line is a header followed by a blank line, drop both
  if (lines.length > 1 && lines[1].trim() === '') {
    lines = lines.slice(2);
  }

  return lines
    .map((line) => line.trim())
    .join('<br />')
    .replace(/(<br \/>)+$/, '');
}

/**
 * Wrap all [INSERT ...] placeholders in a span so we can detect them easily.
 * Makes them focusable and ready for inline editing.
 * Also converts link markers back to proper HTML links.
 */
export function wrapInsertPlaceholders(text: string): string {
  if (!text) {
    return '';
  }

  const container = document.createElement('div');
  container.innerHTML = text;

  // Normalise existing wrappers so we can reliably detect duplicates
  container.querySelectorAll('.insert-placeholder').forEach((el) => {
    el.className = 'insert-placeholder';
    (el as HTMLElement).setAttribute('data-insert', '');
  });

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  const tokenRegex = /\[INSERT[^\]]*\]/gi;

  for (const textNode of textNodes) {
    const value = textNode.nodeValue || '';
    if (!tokenRegex.test(value)) {
      tokenRegex.lastIndex = 0;
      continue;
    }
    tokenRegex.lastIndex = 0;

    const parentElement = textNode.parentElement;
    if (parentElement?.closest('.insert-placeholder, .placeholder-editing, .placeholder-edited')) {
      continue; // Already wrapped or actively being edited
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    value.replace(/\[INSERT[^\]]*\]/gi, (match, offset: number) => {
      if (offset > lastIndex) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, offset)));
      }

      const span = document.createElement('span');
      span.className = 'insert-placeholder';
      span.setAttribute('data-insert', '');
      // Apply inline styles as fallback - no color so CSS dark/light mode can take over
      span.style.cssText = 'background: rgba(54, 144, 206, 0.18); padding: 1px 3px; border-radius: 3px; border: 1px dotted currentColor; font-style: italic; cursor: pointer; display: inline-block; font-size: 0.9em;';
      span.textContent = match;
      fragment.appendChild(span);

      lastIndex = offset + match.length;
      return match;
    });

    if (lastIndex < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  let result = container.innerHTML;

  // Then handle Instruct Helix Law link markers on the serialized HTML
  result = result.replace(/\[\[INSTRUCT_LINK::([^\]]+)\]\]/gi, (_match, href) => {
    return `<a href="${href}" class="instruct-link" style="color: #3690CE; text-decoration: underline;" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>`;
  });

  // Handle any remaining [InstructLink] placeholders that don't have a passcode yet
  result = result.replace(/\[InstructLink\]/gi, () => {
    return `<span class="instruct-link-pending" style="color: #D65541; font-weight: 700; text-decoration: underline; opacity: 0.7; cursor: help;" title="Link will be generated after deal is saved">Instruct Helix Law</span>`;
  });

  return result;
}

/**
 * A quick helper: do we have an array of strings or a single string?
 */
export function isStringArray(value: string | string[]): value is string[] {
  return Array.isArray(value);
}

/**
 * Process editor content for email sending with full formatting preservation
 * This is the main function to call when preparing rich text content for email
 */
export function processEditorContentForEmail(editorElement: HTMLElement | null, fallbackHtml?: string): string {
  let html = '';
  
  if (editorElement) {
    // Extract formatting-preserved content from the editor
    html = extractFormattingForEmail(editorElement);
  } else if (fallbackHtml) {
    // Use fallback HTML and apply email formatting
    html = finalizeHTMLForEmail(fallbackHtml);
  }
  
  if (!html) return '';
  
  // Remove editor UI elements while preserving formatting
  html = removeHighlightSpans(html);
  
  // Apply final email optimizations
  return finalizeHTMLForEmail(html);
}

export function replacePlaceholders(
  template: string,
  intro: string,
  enquiry: Enquiry,
  userData: any,
  blocks: TemplateBlock[] = templateBlocks
): string {
  const userFirstName = userData?.[0]?.['First'] || 'Your';
  const userFullName = userData?.[0]?.['Full Name'] || 'Your Name';
  const userRole = userData?.[0]?.['Role'] || 'Your Position';
  // Get the raw rate value
  const userRate = userData?.[0]?.['Rate'];
  // Format the rate to include the £ symbol and VAT text
  const formattedRate =
    userRate && userRate !== '[Rate]' ? `£${userRate} + VAT` : '[Rate]';

  let result = template
    .replace(
      /\[Enquiry.First_Name\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 1px 3px;" data-placeholder="[Enquiry.First_Name]">${
        enquiry.First_Name || 'there'
      }</span>`
    )
    .replace(
      /\[Enquiry.Point_of_Contact\]/g,
      `<span style="background-color: ${colours.highlightYellow}; padding: 1px 3px;" data-placeholder="[Enquiry.Point_of_Contact]">${
        enquiry.Point_of_Contact || 'Our Team'
      }</span>`
    );

  // Insert placeholders for each template block
  blocks.forEach((block) => {
    const regex = new RegExp(escapeRegExp(block.placeholder), 'g');
    const optionBubbles = block.options
      .map((o) => {
        const preview = cleanTemplateString(o.previewText).replace(/<p>/g, `<p style="margin: 0;">`);
        return `<div class="option-bubble" data-block-title="${block.title}" data-option-label="${o.label}"><strong>${o.label}</strong><div class="option-preview">${preview}</div></div>`;
      })
      .join('');
    result = result.replace(
      regex,
      `<span data-placeholder="${block.placeholder}" class="block-option-list"><span class="block-label" data-label-title="${block.title}">${block.title}</span>${optionBubbles}</span>`
    );
  });

  result = result
    .replace(
      /\[First Name\]/g,
      `<span data-placeholder="[First Name]" style="background-color: ${colours.grey}; padding: 1px 3px;">${userFirstName}</span>`
    )
    .replace(
      /\[Full Name\]/g,
      `<span data-placeholder="[Full Name]" style="background-color: ${colours.grey}; padding: 1px 3px;">${userFullName}</span>`
    )
    .replace(
      /\[Position\]/g,
      `<span data-placeholder="[Position]" style="background-color: ${colours.grey}; padding: 1px 3px;">${userRole}</span>`
    )
    .replace(
      /\[Rate\]/g,
      `<span data-placeholder="[Rate]" style="background-color: ${colours.grey}; padding: 1px 3px;">${formattedRate}</span>`
    );

  return result;
}

/**
 * Helper function to replace [FE] and [ACID] with dynamic values.
 */
export function applyDynamicSubstitutions(
  text: string,
  userData: any,
  enquiry: Enquiry,
  amount?: number | string,
  passcode?: string,
  instructionsLink?: string
): string {
  const userInitials = userData?.[0]?.['Initials'] || 'XX';
  const enquiryID = enquiry?.ID || '0000';
  const userRole = userData?.[0]?.['Role'] || '[Position]';
  const userRate = userData?.[0]?.['Rate']; // This is the raw rate value from SQL
  // Format the rate to include the pound symbol and " + VAT"
  const formattedRate =
    userRate && userRate !== '[Rate]' ? `£${userRate} + VAT` : '[Rate]';

  const formattedAmount =
    amount !== undefined && amount !== null && amount !== ''
      ? (() => {
          const num = Number(amount);
          if (isNaN(num)) return '[Amount]';
          const withDecimals = num.toLocaleString('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return `£${withDecimals.replace(/\.00$/, '')}`;
        })()
      : '[Amount]';

  // Prefer provided instructionsLink. Otherwise build using passcode ONLY (drop legacy prospectId-passcode format).
  // Required format now: https://instruct.helix-law.com/pitch/<passcode>
  const baseUrl = process.env.REACT_APP_INSTRUCTIONS_URL || 'https://instruct.helix-law.com';
  const finalInstructionsLink = instructionsLink
    || (passcode
      ? `${baseUrl}/pitch/${passcode}`
      : `${baseUrl}/pitch`);

  // Prebuild the anchor used in HTML previews/emails
  const instructAnchor = `<a href="${finalInstructionsLink}" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>`;

  return text
  // Support explicit marker syntax used in editor content - extract URL from within marker
  .replace(/\[\[INSTRUCT_LINK::([^\]]*)\]\]/gi, (match, url) => {
    // Normalize URL and append passcode if pointing to /pitch or /pitch/
    const cleanUrlRaw = (url || '').trim();
    const cleanUrl = cleanUrlRaw.replace(/\/$/, ''); // drop trailing slash for comparison
    if ((cleanUrl === `${baseUrl}/pitch`) && passcode) {
      return `<a href="${baseUrl}/pitch/${passcode}" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>`;
    }
    // If no passcode, keep provided URL as-is
    return `<a href="${cleanUrlRaw}" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>`;
  })
  // Normalize any existing instruct-link anchors from editor to the final URL and remove red styling
  .replace(/<a([^>]*?)class=("|')[^"']*instruct-link[^"']*(\2)([^>]*)>(.*?)<\/a>/gi, (_m, pre, q, _q2, post, text) => {
    return `<a href="${finalInstructionsLink}" target="_blank" rel="noopener noreferrer">${text || 'Instruct Helix Law'}</a>`;
  })
    .replace(/\[FE\]/g, userInitials)
    .replace(/\[ACID\]/g, enquiryID)
    .replace(/\[Position\]/g, userRole)
    .replace(/\[Rate\]/g, formattedRate)
    .replace(/\[Amount\]/g, formattedAmount)
    .replace(/\[Passcode\]/g, passcode || '[Passcode]')
  // Render a human-friendly hyperlink instead of a raw URL
  .replace(/\[InstructLink\]/g, instructAnchor);
}

/**
 * Sanitize body HTML before processing.
 * Removes detached style fragments that leak from preview styling.
 */
export function sanitizeBodyForSend(html: string): string {
  if (!html) return html;
  let cleaned = html;
  // Remove stray colour fragments like "144, 206); text-decoration: underline;" that sometimes detach from anchor style
  cleaned = cleaned.replace(/\b\d{2,3},\s*\d{2,3}\);\s*text-decoration:\s*underline;?/gi, '');
  // Normalize any styled instruct-link anchors to a clean version without inline style
  cleaned = cleaned.replace(/<a([^>]*?)class=("|')[^"']*instruct-link[^"']*(\2)([^>]*)>(.*?)<\/a>/gi, (m) => {
    // Extract existing href if present
    const hrefMatch = m.match(/href=("|')(.*?)(\1)/i);
    const href = hrefMatch ? hrefMatch[2] : '';
    const textMatch = m.match(/>([^<]*)</);
    const text = textMatch ? textMatch[1] : 'Instruct Helix Law';
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text || 'Instruct Helix Law'}</a>`;
  });
  // As a final guard, if a bare "Instruct Helix Law" follows a stray style fragment without an <a>, wrap it
  cleaned = cleaned.replace(/(?:clicking\s+)?Instruct Helix Law(?!<)/gi, () => {
    return `<a href="${process.env.REACT_APP_INSTRUCTIONS_URL || 'https://instruct.helix-law.com/pitch'}" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>`;
  });
  return cleaned;
}

/**
 * Final sanitization pass after all processing.
 * Cleans up corrupted style fragments and normalizes Instruct Helix Law links.
 */
export function sanitizeFinalHtml(html: string, instructionsHref: string): string {
  if (!html) return html;
  let out = html;
  // Remove orphaned fragments like "144, 206); text-decoration: underline;" or "color: rgb(54, 144, 206); text-decoration: underline;"
  out = out.replace(/color:\s*(?:rgb\([^\)]*\)|#[0-9a-f]{3,6}|[0-9.\s%,()-]+);\s*text-decoration:\s*underline;?/gi, '');
  out = out.replace(/(?:rgb\([^\)]*\)|\b\d{1,3},\s*\d{1,3}(?:,\s*\d{1,3})?)\);\s*text-decoration:\s*underline;?/gi, '');
  // Normalize any styled or partially broken Instruct Helix Law anchors to canonical form
  out = out.replace(/<a[^>]*?>\s*Instruct\s+Helix\s+Law\s*<\/a>/gi, `<a href="${instructionsHref}" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>`);
  // Remove any lingering `style="..."` fragments that directly precede the text node
  out = out.replace(/style=\"[^\"]*?\">\s*Instruct Helix Law/gi, `>Instruct Helix Law`);
  // Wrap any bare occurrences not already inside an anchor (heuristic: not immediately followed by </a>)
  out = out.replace(/Instruct Helix Law(?!\s*<\/a>)/gi, `<a href="${instructionsHref}" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>`);
  return out;
}