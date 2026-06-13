import { hasInstructLinkReference, sanitizeFinalHtml } from '../emailUtils';

describe('hasInstructLinkReference', () => {
  it('accepts the raw instruct link placeholder', () => {
    expect(hasInstructLinkReference('Please click [InstructLink].')).toBe(true);
  });

  it('accepts the editor instruct link marker after placeholder substitution', () => {
    expect(hasInstructLinkReference('Please click [[INSTRUCT_LINK::https://instruct.helix-law.com/pitch/ABC123]].')).toBe(true);
  });

  it('accepts the rendered instruct link anchor', () => {
    const html = '<a href="https://instruct.helix-law.com/pitch/ABC123" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>';

    expect(hasInstructLinkReference(html)).toBe(true);
  });

  it('accepts the editor pending instruct link span', () => {
    const html = '<span class="instruct-link-pending" title="Link will be generated after deal is saved">Instruct Helix Law</span>';

    expect(hasInstructLinkReference(html)).toBe(true);
  });

  it('normalises pending editor link text to the final passcode link', () => {
    const html = '<p>Please click <span class="instruct-link-pending">Instruct Helix Law</span>.</p>';
    const result = sanitizeFinalHtml(html, 'https://instruct.helix-law.com/pitch/12345');

    expect(result).toContain('<a href="https://instruct.helix-law.com/pitch/12345" target="_blank" rel="noopener noreferrer">Instruct Helix Law</a>');
  });

  it('rejects unrelated links', () => {
    const html = '<a href="https://example.com/pitch/ABC123">Instruct Helix Law</a>';

    expect(hasInstructLinkReference(html)).toBe(false);
  });
});