import { syncAmountIntoBody } from '../EditorAndTemplateBlocks';

describe('syncAmountIntoBody', () => {
  it('updates on every digit change', () => {
    const body = '<p>Estimated fee: £1.00 + VAT</p>';

    const step1 = syncAmountIntoBody(body, '£12.00');
    expect(step1).toContain('£12.00 + VAT');

    const step2 = syncAmountIntoBody(step1, '£123.00');
    expect(step2).toContain('£123.00 + VAT');
    expect(step2).not.toContain('£12.00 + VAT');
  });

  it('updates when digits are removed', () => {
    const body = '<p>Estimated fee: £600.00 + VAT</p>';

    const step1 = syncAmountIntoBody(body, '£60.00');
    expect(step1).toContain('£60.00 + VAT');

    const step2 = syncAmountIntoBody(step1, '£6.00');
    expect(step2).toContain('£6.00 + VAT');
  });

  it('updates when using +50/-50 adjustments', () => {
    const body = '<p>Estimated fee: £60.00 + VAT</p>';

    const increase = syncAmountIntoBody(body, '£110.00');
    expect(increase).toContain('£110.00 + VAT');

    const decrease = syncAmountIntoBody(increase, '£60.00');
    expect(decrease).toContain('£60.00 + VAT');
  });

  it('does not duplicate VAT or re-replace unnecessarily', () => {
    const body = '<p>Estimated fee: £500.00 + VAT</p>';
    const updated = syncAmountIntoBody(body, '£500.00');

    expect(updated).toBe(body);
    expect(updated.match(/VAT/g)?.length).toBe(1);
  });

  it('leaves body unchanged when no placeholder or VAT pattern exists', () => {
    const body = '<p>Thanks for your time.</p>';
    const updated = syncAmountIntoBody(body, '£200.00');
    expect(updated).toBe(body);
  });

  it('does not replace non-VAT [INSERT] placeholders', () => {
    const body = '<p>Client name: <span class="insert-placeholder" data-original="[INSERT]">[INSERT]</span></p>';
    const updated = syncAmountIntoBody(body, '£900.00');
    expect(updated).toBe(body);
  });

  it('updates placeholder spans before VAT patterns', () => {
    const body = '<p>Estimated fee: <span class="placeholder-edited" data-original="[INSERT]">[INSERT]</span> + VAT</p>';
    const updated = syncAmountIntoBody(body, '£750.00');

    expect(updated).toContain('data-original="[INSERT]"');
    expect(updated).toContain('£750.00');
    expect(updated).toContain('+ VAT');
  });
});
