import { Enquiry } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';

export const leftoverPlaceholders = [
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
  '[Potential Causes of Action and Remedies Placeholder]',
];

/**
 * Utility: turn consecutive <br><br> lines into real paragraphs (<p>...).
 * Some email clients (especially Outlook) collapse repeated <br> tags.
 * Converting them into <p> ensures consistent spacing.
 */
export function convertDoubleBreaksToParagraphs(html: string): string {
  const normalized = html
    .replace(/\r\n/g, '\n')
    .replace(/(<br \/>){2,}/g, '\n\n')
    .replace(/<\/div>\s*<br \/>/g, '</div>');
  const paragraphs = normalized.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const wrapped = paragraphs.map((paragraph) => `<p>${paragraph.trim()}</p>`);
  return wrapped.join('');
}

/**
 * Removes lines that contain leftover placeholders.
 * Also condenses multiple blank lines down to one.
 */
export function removeUnfilledPlaceholders(text: string): string {
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
export function removeHighlightSpans(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const elements = tempDiv.querySelectorAll(
    'span[data-placeholder], span[data-inserted], span[data-link]'
  );
  elements.forEach((el) => {
    el.removeAttribute('style');
    el.removeAttribute('data-placeholder');
    el.removeAttribute('data-inserted');
    el.removeAttribute('data-link');
  });
  return tempDiv.innerHTML;
}

/**
 * When we insert multiline text from the TemplateBlocks, we turn raw newlines into <br />.
 */
export function cleanTemplateString(template: string): string {
  // Trim the entire string to remove leading/trailing whitespace and newlines
  const trimmedTemplate = template.trim();
  return trimmedTemplate
    .split('\n')
    .map(line => line.trim())
    .join('<br />')
    .replace(/(<br \/>)+$/, '');
}

/**
 * A quick helper: do we have an array of strings or a single string?
 */
export function isStringArray(value: string | string[]): value is string[] {
  return Array.isArray(value);
}

export function replacePlaceholders(
  template: string,
  intro: string,
  enquiry: Enquiry,
  userData: any
): string {
  const userFirstName = userData?.[0]?.['First'] || 'Your';
  const userFullName = userData?.[0]?.['Full Name'] || 'Your Name';
  const userRole = userData?.[0]?.['Role'] || 'Your Position';
  // Get the raw rate value
  const userRate = userData?.[0]?.['Rate'];
  // Format the rate to include the £ symbol and VAT text
  const formattedRate =
    userRate && userRate !== '[Rate]' ? `£${userRate} + VAT` : '[Rate]';

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
      /\[Potential Causes of Action and Remedies Placeholder\]/g,
      `<span data-placeholder="[Potential Causes of Action and Remedies Placeholder]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">[Potential Causes of Action and Remedies Placeholder]</span>`
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
      /\[Rate\]/g,
      // Use the formatted rate here instead of the raw value.
      `<span data-placeholder="[Rate]" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${formattedRate}</span>`
    )
    .replace(
      /\[(Scope of Work Placeholder|Risk Assessment Placeholder|Costs and Budget Placeholder|Follow-Up Instructions Placeholder|Closing Notes Placeholder|Required Documents Placeholder|Google Review Placeholder|Meeting Link Placeholder)\]/g,
      (match) =>
        `<span data-placeholder="${match}" style="background-color: ${colours.highlightBlue}; padding: 0 3px;">${match}</span>`
    );
}

/**
 * Helper function to replace [FE] and [ACID] with dynamic values.
 */
export function applyDynamicSubstitutions(
  text: string,
  userData: any,
  enquiry: Enquiry
): string {
  const userInitials = userData?.[0]?.['Initials'] || 'XX';
  const enquiryID = enquiry?.ID || '0000';
  const userRole = userData?.[0]?.['Role'] || '[Position]';
  const userRate = userData?.[0]?.['Rate']; // This is the raw rate value from SQL
  // Format the rate to include the pound symbol and " + VAT"
  const formattedRate =
    userRate && userRate !== '[Rate]' ? `£${userRate} + VAT` : '[Rate]';

  return text
    .replace(/\[FE\]/g, userInitials)
    .replace(/\[ACID\]/g, enquiryID)
    .replace(/\[Position\]/g, userRole)
    .replace(/\[Rate\]/g, formattedRate);
}