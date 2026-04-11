import { Enquiry } from '../../../app/functionality/types';
import { enquiryReferencesId } from '../../../app/functionality/enquiryProcessingModel';

export const DEMO_MODE_STORAGE_KEY = 'helix-hub-demo-enquiry-mode';

export const ZERO_WIDTH_CHARACTERS_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;
export const DIACRITIC_CHARACTERS_REGEX = /[\u0300-\u036f]/g;

export const normalizeSearchValue = (value?: string | number | null): string => {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(DIACRITIC_CHARACTERS_REGEX, '')
    .replace(ZERO_WIDTH_CHARACTERS_REGEX, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

export const normalizeSearchEmailArtifacts = (value?: string | number | null): string => {
  return normalizeSearchValue(value)
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\.\s*/g, '.');
};

export const toDigitSearchValue = (value?: string | number | null): string => {
  return String(value ?? '').replace(/\D/g, '');
};

export const parseSharedWithEmails = (value: unknown): string[] => {
  return String(value ?? '')
    .split(/[;,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

export const serialiseSharedWithEmails = (value: unknown): string => {
  return Array.from(new Set(parseSharedWithEmails(value))).join(',');
};

export const isDemoEnquiryId = (value: unknown): boolean => String(value ?? '').toUpperCase().startsWith('DEMO-ENQ-');

export const findEnquiryForMutation = (enquiries: Enquiry[], enquiryId: string): Enquiry | undefined => {
  const normalisedEnquiryId = String(enquiryId ?? '').trim();
  if (!normalisedEnquiryId) return undefined;

  return enquiries.find((enquiry) => enquiryReferencesId(enquiry, normalisedEnquiryId));
};

export const buildEnquiryIdentityKey = (record: Partial<Enquiry> | any): string => {
  const id = String(record?.ID ?? record?.id ?? '').trim();
  const date = String(record?.Touchpoint_Date ?? record?.Date_Created ?? record?.datetime ?? '');
  const poc = String(record?.Point_of_Contact ?? record?.poc ?? '').trim().toLowerCase();
  const first = String(record?.First_Name ?? record?.first ?? '').trim().toLowerCase();
  const last = String(record?.Last_Name ?? record?.last ?? '').trim().toLowerCase();
  const notesSnippet = String(record?.Initial_first_call_notes ?? record?.notes ?? '')
    .trim()
    .slice(0, 24)
    .toLowerCase();
  return [id, date, poc, first, last, notesSnippet].join('|');
};

export const DEV_PREVIEW_TEST_ENQUIRY: Enquiry = {
  ID: 'DEMO-ENQ-0001',
  Date_Created: '2026-01-01',
  Touchpoint_Date: '2026-01-01',
  Email: 'demo.prospect@helix-law.com',
  Area_of_Work: 'Commercial',
  Type_of_Work: 'Contract Dispute',
  Method_of_Contact: 'Email',
  Point_of_Contact: 'team@helix-law.com',
  First_Name: 'Demo',
  Last_Name: 'Prospect',
  Phone_Number: '07000000000',
  Rating: 'Neutral',
  Value: '25000',
  Ultimate_Source: 'Google Ads',
  Initial_first_call_notes: 'Demo enquiry for testing. Client enquiring about a contract dispute with their supplier. They have been invoiced for goods they did not receive and are seeking advice on how to challenge the invoice and potentially recover costs. Urgent matter - supplier threatening legal action within 14 days.',
};

export const ALL_AREAS_OF_WORK = [
  'Commercial',
  'Construction',
  'Employment',
  'Property',
  'Other/Unsure'
];

const TEAM_INBOX_CHANNEL_FALLBACK_URL =
  'https://teams.microsoft.com/l/channel/19%3a09c0d3669cd2464aab7db60520dd9180%40thread.tacv2/Team%20Inbox?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

export const getAreaSpecificChannelUrl = (areaOfWork: string | undefined): string => {
  const channelMappings: { [key: string]: string } = {
    commercial: 'https://teams.microsoft.com/l/channel/19%3A09c0d3669cd2464aab7db60520dd9180%40thread.tacv2/Commercial?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8',
    construction: 'https://teams.microsoft.com/l/channel/19%3A2ba7d5a50540426da60196c3b2daf8e8%40thread.tacv2/Construction?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8',
    employment: 'https://teams.microsoft.com/l/channel/19%3A9e1c8918bca747f5afc9ca5acbd89683%40thread.tacv2/Employment?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8',
    property: 'https://teams.microsoft.com/l/channel/19%3A6d09477d15d548a6b56f88c59b674da6%40thread.tacv2/Property?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8'
  };
  
  const normalizedArea = areaOfWork?.toLowerCase();
  return channelMappings[normalizedArea || ''] || TEAM_INBOX_CHANNEL_FALLBACK_URL;
};

export const combineDateAndTime = (dateValue: unknown, timeValue?: unknown): Date | null => {
  if (!dateValue) return null;
  const base = new Date(dateValue as any);
  if (isNaN(base.getTime())) return null;

  if (!timeValue) return base;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let milliseconds = 0;

  if (timeValue instanceof Date) {
    hours = timeValue.getHours();
    minutes = timeValue.getMinutes();
    seconds = timeValue.getSeconds();
    milliseconds = timeValue.getMilliseconds();
  } else {
    const timeString = String(timeValue);
    const timeDate = new Date(timeString);
    if (!isNaN(timeDate.getTime())) {
      hours = timeDate.getHours();
      minutes = timeDate.getMinutes();
      seconds = timeDate.getSeconds();
      milliseconds = timeDate.getMilliseconds();
    } else {
      const parts = timeString.split(':').map(v => Number(v));
      if (Number.isFinite(parts[0])) hours = parts[0];
      if (Number.isFinite(parts[1])) minutes = parts[1];
      if (Number.isFinite(parts[2])) seconds = parts[2];
    }
  }

  const combined = new Date(base);
  combined.setHours(hours, minutes, seconds, milliseconds);
  return combined;
};

export const shimmerStyle = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes prospect-detail-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sse-reconnect-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
.shimmer {
  background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.15), rgba(255,255,255,0.05));
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
`;

export const pipelineCarouselStyle = `
.pipeline-carousel {
  position: relative;
  overflow: hidden;
  width: 100%;
}
.pipeline-carousel-track {
  display: flex;
  transition: transform 0.2s ease-out;
  height: 100%;
}
.pipeline-carousel-nav {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}
.pipeline-carousel-nav:hover {
  opacity: 1;
}
.pipeline-chip {
  transition: filter 0.1s ease;
}
.pipeline-chip-box {
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: 2px;
  transition: gap 0.25s ease, padding 0.25s ease, border-color 0.25s ease;
  will-change: gap, padding, border-color;
  overflow: visible;
}
.pipeline-chip-reveal:hover .pipeline-chip-box {
  gap: 4px;
  padding: 1px 6px 1px 4px;
  border-color: rgba(107, 107, 107, 0.25);
}
.pipeline-chip-label {
  display: inline-flex;
  gap: 4px;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
  transition-delay: 0ms;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0.2px;
  will-change: max-width, opacity;
}
.pipeline-chip-reveal:hover .pipeline-chip-label,
.pipeline-chip-reveal:focus-visible .pipeline-chip-label {
  max-width: 80px !important;
  opacity: 0.9 !important;
}
/* next-action-breathe animation removed — was distracting */
.next-action-subtle-pulse,
.next-action-subtle-pulse .pipeline-chip-box,
.next-action-subtle-pulse > button,
.next-action-subtle-pulse > div {
  animation: none !important;
}
@keyframes pitch-cta-pulse {
  0%, 100% {
    border-color: rgba(255, 140, 0, 0.35);
    background: rgba(255, 140, 0, 0.08);
  }
  50% {
    border-color: rgba(255, 140, 0, 0.55);
    background: rgba(255, 140, 0, 0.14);
  }
}
@keyframes pipeline-cascade {
  0% { opacity: 0; transform: translateY(-6px) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes pipeline-action-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1); }
}
`;

export const helixWatermarkSvg = (dark: boolean) => {
  const fill = dark ? '%23FFFFFF' : '%23061733';
  const opacity = dark ? '0.06' : '0.035';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'>
    <g transform='rotate(-12 450 450)'>
      <path d='M160 242 C160 226 176 210 200 210 L560 210 Q640 235 560 274 L200 274 C176 274 160 258 160 242 Z' fill='${fill}' fill-opacity='${opacity}'/>
      <path d='M160 362 C160 346 176 330 200 330 L560 330 Q640 355 560 394 L200 394 C176 394 160 378 160 362 Z' fill='${fill}' fill-opacity='${opacity}'/>
      <path d='M160 482 C160 466 176 450 200 450 L560 450 Q640 475 560 514 L200 514 C176 514 160 498 160 482 Z' fill='${fill}' fill-opacity='${opacity}'/>
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
};

export function injectEnquiryStyles() {
  if (typeof document !== 'undefined' && !document.querySelector('#shimmer-styles')) {
    const style = document.createElement('style');
    style.id = 'shimmer-styles';
    style.textContent = shimmerStyle;
    document.head.appendChild(style);
  }

  if (typeof document !== 'undefined' && !document.querySelector('#pipeline-carousel-styles')) {
    const style = document.createElement('style');
    style.id = 'pipeline-carousel-styles';
    style.textContent = pipelineCarouselStyle;
    document.head.appendChild(style);
  }
}

// Auto-inject on import
injectEnquiryStyles();

// Local types
export interface MonthlyCount {
  month: string;
  commercial: number;
  construction: number;
  employment: number;
  property: number;
  otherUnsure: number;
}
