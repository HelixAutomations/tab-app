import { buildCombinedConversionChartSVG, type ConversionPocketChartBucket } from '../conversionPocketChart';

const baseOptions = {
  width: 520,
  height: 180,
  enquiriesStroke: '#123456',
  enquiriesPreviousStroke: '#789abc',
  mattersStroke: '#654321',
  mattersPreviousStroke: '#cba987',
  bucketLabels: ['Mon', 'Tue', 'Wed'],
};

describe('buildCombinedConversionChartSVG', () => {
  it('renders enquiry stems and retains paired matter bars without an enquiries area fill', () => {
    const buckets: ConversionPocketChartBucket[] = [
      { axisLabel: 'Mon', currentEnquiries: 4, previousEnquiries: 3, currentMatters: 1, previousMatters: 1, currentAvailable: true },
      { axisLabel: 'Tue', currentEnquiries: 6, previousEnquiries: 4, currentMatters: 2, previousMatters: 1, currentAvailable: true },
      { axisLabel: 'Wed', currentEnquiries: 5, previousEnquiries: 2, currentMatters: 1, previousMatters: 0, currentAvailable: true },
    ];

    const svg = buildCombinedConversionChartSVG(buckets, baseOptions);

    expect(svg).toContain('class="cc-enq-stem"');
    expect(svg).not.toContain(`fill="${baseOptions.enquiriesStroke}" fill-opacity="0.12"`);
    expect(svg).toContain('class="cc-bar cc-bar-current"');
    expect(svg).toContain('class="cc-bar cc-bar-prev"');
  });

  it('keeps the live pulse disabled for quiet sparse windows', () => {
    const buckets: ConversionPocketChartBucket[] = [
      { axisLabel: 'Mon', currentEnquiries: 1, previousEnquiries: 1, currentMatters: 1, previousMatters: 0, currentAvailable: true },
      { axisLabel: 'Tue', currentEnquiries: 0, previousEnquiries: 0, currentMatters: 0, previousMatters: 0, currentAvailable: false },
      { axisLabel: 'Wed', currentEnquiries: 0, previousEnquiries: 0, currentMatters: 0, previousMatters: 0, currentAvailable: false },
    ];

    const svg = buildCombinedConversionChartSVG(buckets, baseOptions);

    expect(svg).not.toContain('<animate');
  });

  it('still pulses the live terminal point when the window is active enough', () => {
    const buckets: ConversionPocketChartBucket[] = [
      { axisLabel: 'Mon', currentEnquiries: 5, previousEnquiries: 4, currentMatters: 1, previousMatters: 1, currentAvailable: true },
      { axisLabel: 'Tue', currentEnquiries: 6, previousEnquiries: 3, currentMatters: 2, previousMatters: 1, currentAvailable: true },
      { axisLabel: 'Wed', currentEnquiries: 0, previousEnquiries: 2, currentMatters: 0, previousMatters: 0, currentAvailable: false },
    ];

    const svg = buildCombinedConversionChartSVG(buckets, baseOptions);

    expect(svg).toContain('<animate');
  });
});