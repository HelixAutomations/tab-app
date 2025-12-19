import processEmailContentV2 from '../emailFormattingV2';

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const nextIdx = haystack.indexOf(needle, idx);
    if (nextIdx === -1) return count;
    count += 1;
    idx = nextIdx + needle.length;
  }
}

describe('emailFormattingV2', () => {
  it('does not convert formatting newlines between tags into visible breaks', () => {
    const html = [
      '<p>Hello Rizwan.</p>',
      '\n',
      '<p>Thanks for your enquiry.</p>',
      '\n',
      '<p>Kind regards,</p>'
    ].join('');

    const out = processEmailContentV2(html);

    // Should keep paragraph structure; importantly no *extra* <br> created from tag-to-tag formatting newlines.
    // We now add exactly one structural blank-line block between adjacent paragraphs.
    expect(out).toContain('<p');
    expect(out).toContain('</p>');

    // 3 paragraphs => 2 structural breaks => 2 <br> occurrences.
    expect(countOccurrences(out, '<br>')).toBe(2);
      expect(out.toLowerCase()).toContain('<div style="line-height:1.4');
  });

  it('does not split paragraphs on double <br> inside table/signature blocks', () => {
    const html = `
      <p>Intro line</p>
      <p>
        <table><tr><td>
          Signature line<br><br>Second line
        </td></tr></table>
      </p>
      <p>Footer line</p>
    `;

    const out = processEmailContentV2(html);

    // Table content should remain intact (no additional <p> created inside that paragraph).
    const tableIndex = out.toLowerCase().indexOf('<table');
    expect(tableIndex).toBeGreaterThan(-1);

    const afterTable = out.slice(tableIndex);
    const tableEnd = afterTable.toLowerCase().indexOf('</table>');
    expect(tableEnd).toBeGreaterThan(-1);

    const tableChunk = afterTable.slice(0, tableEnd + '</table>'.length).toLowerCase();

    // The key invariant: we must not introduce paragraph boundaries inside the table.
    expect(tableChunk).not.toContain('</p><p');
  });

  it('strips span font-family overrides so base paragraph font stays consistent', () => {
    const html = '<p style="margin:0;line-height:1.4;font-family:Raleway,Arial,sans-serif;font-size:10pt;">Hello <span style="font-family:Calibri;font-size:11pt;">world</span></p>';

    const out = processEmailContentV2(html);

    // Span should not retain font-family/font-size overrides.
    expect(out.toLowerCase()).not.toContain('font-family:calibri');
    expect(out.toLowerCase()).not.toContain('font-size:11pt');
  });

  it('wraps loose text that appears after a list into a styled paragraph', () => {
    const html = `
      <div style="font-family:Raleway,Arial,sans-serif; line-height:1.4">
        <div data-list-paragraph="true">
          <ul>
            <li>Bullet 1</li>
          </ul>
        </div>
        In terms of costs, we record and bill for our time in 6-minute units.
        <br><br>
        <div data-list-paragraph="true">
          <ol>
            <li>Step 1</li>
          </ol>
        </div>
      </div>
    `;

    const out = processEmailContentV2(html);

    // The plain text run should be wrapped into a paragraph using the base style.
    expect(out).toMatch(/<p[^>]*style="[^"]*font-family:raleway/i);
    expect(out.toLowerCase()).toContain('in terms of costs');
  });
});
