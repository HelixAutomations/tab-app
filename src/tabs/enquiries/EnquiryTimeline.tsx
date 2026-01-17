import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import SectionCard from '../home/SectionCard';
import { useTheme } from '../../app/functionality/ThemeContext';
import { FaEnvelope, FaPhone, FaFileAlt, FaCheckCircle, FaCircle, FaArrowRight, FaUser, FaCalendar, FaInfoCircle, FaChevronDown, FaChevronUp, FaPoundSign, FaClipboard, FaExternalLinkAlt, FaLink } from 'react-icons/fa';
import { parseISO, format, differenceInDays } from 'date-fns';
import OperationStatusToast from './pitch-builder/OperationStatusToast';
import { practiceAreasByArea } from '../instructions/MatterOpening/config';
import { SCENARIOS } from './pitch-builder/scenarios';
import InlineWorkbench from '../instructions/InlineWorkbench';

// Add spinner animation
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes timelineItemIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0.8; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .helix-timeline-item-in {
    animation: timelineItemIn 220ms ease-out both;
  }

  .helix-timeline-item-in .helix-hide-btn {
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease;
  }

  .helix-timeline-item-in:hover .helix-hide-btn {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .helix-timeline-item-in {
      animation: none !important;
    }
  }
`;
const existingSpinnerStyle = document.head.querySelector('style[data-spinner]') as HTMLStyleElement | null;
if (existingSpinnerStyle) {
  existingSpinnerStyle.textContent = spinnerStyle.textContent;
} else {
  spinnerStyle.setAttribute('data-spinner', 'true');
  document.head.appendChild(spinnerStyle);
}

// Action button hover/active effects (separate style tag so it always applies)
const actionButtonStyle = document.createElement('style');
actionButtonStyle.textContent = `
  .action-btn-group,
  .action-btn {
    transform: translateY(0);
    transition: transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
  }

  /* Light mode hover/active */
  .action-btn-group:not([data-disabled="true"]):not(.dark-mode):hover,
  .action-btn:not(:disabled):not(.dark-mode):hover {
    background-color: rgba(54, 144, 206, 0.18) !important;
    border-color: rgba(54, 144, 206, 0.5) !important;
    box-shadow: 0 1px 4px rgba(54, 144, 206, 0.15);
  }

  .action-btn-group:not([data-disabled="true"]):not(.dark-mode):active,
  .action-btn:not(:disabled):not(.dark-mode):active {
    transform: translateY(1px);
    background-color: rgba(54, 144, 206, 0.22) !important;
    box-shadow: none;
  }

  /* Dark mode hover/active */
  .action-btn-group.dark-mode:not([data-disabled="true"]):hover,
  .action-btn.dark-mode:not(:disabled):hover {
    background-color: rgba(135, 243, 243, 0.25) !important;
    border-color: rgba(135, 243, 243, 0.6) !important;
    box-shadow: 0 1px 4px rgba(135, 243, 243, 0.12);
  }

  .action-btn-group.dark-mode:not([data-disabled="true"]):active,
  .action-btn.dark-mode:not(:disabled):active {
    transform: translateY(1px);
    background-color: rgba(135, 243, 243, 0.3) !important;
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn-group,
    .action-btn {
      transition: none !important;
    }
  }
`;

const existingActionButtonStyle = document.head.querySelector('style[data-action-buttons]') as HTMLStyleElement | null;
if (existingActionButtonStyle) {
  existingActionButtonStyle.textContent = actionButtonStyle.textContent;
} else {
  actionButtonStyle.setAttribute('data-action-buttons', 'true');
  document.head.appendChild(actionButtonStyle);
}

// Email HTML: prevent embedded styles/scripts from breaking the UI, and keep rendering consistent.
const emailHtmlStyle = document.createElement('style');
emailHtmlStyle.textContent = `
  .helix-email-html {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    max-width: 100%;
  }
  .helix-email-html, .helix-email-html * {
    box-sizing: border-box;
    max-width: 100% !important;
  }
  .helix-email-html * {
    background: transparent !important;
    font-family: inherit !important;
    color: inherit !important;
  }
  .helix-email-html img {
    max-width: 100% !important;
    height: auto !important;
  }
  .helix-email-html table {
    width: 100% !important;
    max-width: 100% !important;
    border-collapse: collapse;
  }
  .helix-email-html pre {
    white-space: pre-wrap !important;
  }
  .helix-email-html a {
    color: var(--helix-highlight, #3690ce) !important;
    text-decoration: underline;
  }
  .helix-email-html p { margin: 0 0 10px 0; }
  .helix-email-html ul, .helix-email-html ol { margin: 0 0 10px 18px; padding: 0; }
  .helix-email-html blockquote {
    margin: 0 0 10px 0;
    padding-left: 12px;
    border-left: 3px solid rgba(54, 144, 206, 0.35);
  }
`;
if (!document.head.querySelector('style[data-email-html]')) {
  emailHtmlStyle.setAttribute('data-email-html', 'true');
  document.head.appendChild(emailHtmlStyle);
}

function sanitizeEmailHtml(html: string): string {
  if (!html) return '';

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Remove anything that can leak styles/scripts into the host page.
    doc.querySelectorAll('script, style, link, meta, base, iframe, object, embed').forEach((n) => n.remove());

    // Drop embedded-content images (common in signatures) which render as broken placeholders in the UI.
    doc.body.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.trim().toLowerCase().startsWith('cid:')) img.remove();
    });

    const allowedAttributes = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan']);
    doc.body.querySelectorAll('*').forEach((el) => {
      // Drop common styling/layout attributes from email HTML.
      el.removeAttribute('style');
      el.removeAttribute('class');
      el.removeAttribute('id');
      el.removeAttribute('bgcolor');
      el.removeAttribute('color');

      // Remove inline event handlers and unknown attributes.
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          return;
        }
        if (!allowedAttributes.has(name)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // Ensure external links are safe when clicked.
    doc.body.querySelectorAll('a[href]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    return doc.body.innerHTML || '';
  } catch {
    // Fallback: remove obvious unsafe blocks.
    return String(html)
      .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
      .replace(/<\s*(link|meta|base|iframe|object|embed)\b[^>]*>/gi, '');
  }
}

type CommunicationType = 'pitch' | 'link-enabled' | 'email' | 'call' | 'instruction' | 'note' | 'document';

interface TimelineItem {
  id: string;
  type: CommunicationType;
  date: string;
  subject: string;
  content?: string;
  contentHtml?: string;
  createdBy: string;
  actionRequired?: boolean | string; // true/string = action needed, false/undefined = complete
  metadata?: {
    duration?: number;
    direction?: 'inbound' | 'outbound';
    amount?: number;
    status?: string;
    scenarioId?: string;
    answered?: boolean;
    source?: string;
    recordingUrl?: string | null;
    messageId?: string; // Graph message ID for true forwarding
    feeEarnerEmail?: string; // Owner mailbox for forwarding
    internetMessageId?: string; // Internet Message ID to resolve Graph id and mailbox
    // Document-specific fields
    documentType?: string;        // 'engagement_letter', 'id_document', etc.
    filename?: string;            // Original filename
    fileSize?: number;            // In bytes
    contentType?: string;         // MIME type
    blobUrl?: string;             // Azure blob URL for download
    blobName?: string;            // Storage blob name (path within container)
    stageUploaded?: 'enquiry' | 'pitch' | 'instruction';
    documentId?: number | string; // Database ID for preview URL fetch (or blob id when listed from storage)

    // Document workspace shell (created via Request Docs)
    isDocWorkspace?: boolean;
    workspacePasscode?: string;
    workspaceUrlPath?: string;
    workspaceExpiresAt?: string;
    workspaceDealId?: number;
    workspaceWorktype?: string;
    workspaceError?: string;
    workspaceFolders?: string[];
    hidden?: boolean;
    dealOrigin?: 'email' | 'link';
    dealOriginLabel?: string;
    dealEmailSubject?: string | null;
    dealPasscode?: string | null;
    dealServiceDescription?: string;
  };
}

// Document Preview Modal Component
interface DocumentPreviewModalProps {
  document: TimelineItem;
  onClose: () => void;
  isDarkMode: boolean;
}

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ document, onClose, isDarkMode }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const contentType = document.metadata?.contentType || '';
  const isPdf = contentType.includes('pdf');
  const isImage = contentType.startsWith('image/');
  const filename = document.metadata?.filename || 'Document';
  const fileSize = document.metadata?.fileSize || 0;
  
  useEffect(() => {
    const fetchPreviewUrl = async () => {
      try {
        setLoading(true);
        setError(null);
        const blobUrl = document.metadata?.blobUrl;

        // If we already have a same-origin URL (e.g. demo docs), use it directly.
        if (typeof blobUrl === 'string' && blobUrl.startsWith('/')) {
          setPreviewUrl(blobUrl);
          setDownloadUrl(blobUrl);
          setLoading(false);
          return;
        }

        // Prefer proxying a provided blob URL (if it is an Azure blob URL).
        if (typeof blobUrl === 'string' && blobUrl.startsWith('http')) {
          const base = `/api/prospect-documents/proxy?url=${encodeURIComponent(blobUrl)}&filename=${encodeURIComponent(filename)}`;
          setPreviewUrl(base);
          setDownloadUrl(`${base}&download=true`);
          setLoading(false);
          return;
        }

        const docId = document.metadata?.documentId;

        if (typeof docId !== 'number' || !Number.isFinite(docId)) {
          setError('Preview not available');
          setLoading(false);
          return;
        }

        // Handle test/synthetic documents (IDs 99900-99999)
        if (typeof docId === 'number' && docId >= 99900 && docId <= 99999) {
          setError('Preview not available for test documents');
          setLoading(false);
          return;
        }

        const pitchBackendUrl = process.env.REACT_APP_PITCH_BACKEND_URL || 'https://instruct.helix-law.com';
        const res = await fetch(`${pitchBackendUrl}/api/prospect-documents/preview-url?id=${docId}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.url && typeof data.url === 'string') {
            const base = `/api/prospect-documents/proxy?url=${encodeURIComponent(data.url)}&filename=${encodeURIComponent(filename)}`;
            setPreviewUrl(base);
            setDownloadUrl(`${base}&download=true`);
          } else {
            setError('Preview not available');
          }
        } else {
          setError('Preview not available');
        }
      } catch (err) {
        setError('Failed to load preview');
      } finally {
        setLoading(false);
      }
    };
    fetchPreviewUrl();
  }, [document.metadata?.documentId, document.metadata?.blobUrl]);
  
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
          borderRadius: '12px',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FaFileAlt style={{ color: colours.accent, fontSize: '18px' }} />
            <div>
              <div
                style={{
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '14px',
                }}
              >
                {filename}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                  marginTop: '2px',
                }}
              >
                {document.metadata?.documentType?.replace(/_/g, ' ')} • {formatFileSize(fileSize)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {downloadUrl && (
              <a
                href={downloadUrl}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: colours.highlight,
                  color: '#ffffff',
                  textDecoration: 'none',
                }}
              >
                Download
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
        
        {/* Preview Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          background: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '32px',
                height: '32px',
                border: `3px solid ${colours.highlight}`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px',
              }} />
              <div style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)', fontSize: '13px' }}>
                Loading preview...
              </div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', color: colours.cta }}>
              <FaInfoCircle style={{ fontSize: '24px', marginBottom: '8px' }} />
              <div>{error}</div>
            </div>
          ) : isPdf && previewUrl ? (
            <div style={{ width: '100%', height: '100%', minHeight: '500px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0' }}>
              {/* Always show action bar for PDFs */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
                padding: '8px 12px',
                background: isDarkMode ? 'rgba(2, 6, 23, 0.5)' : 'rgba(241, 245, 249, 0.8)',
                borderRadius: '4px 4px 0 0',
                borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
              }}>
                <span style={{
                  fontSize: '11px',
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                  marginRight: 'auto',
                }}>
                  If preview doesn't load:
                </span>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: colours.highlight,
                    color: '#ffffff',
                    textDecoration: 'none',
                  }}
                >
                  <FaExternalLinkAlt size={10} />
                  Open in new tab
                </a>
              </div>
              <iframe
                src={previewUrl}
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '450px',
                  border: 'none',
                  borderRadius: '0 0 8px 8px',
                  background: isDarkMode ? 'rgba(30, 30, 30, 0.9)' : '#ffffff',
                }}
                title={filename}
              />
            </div>
          ) : isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={filename}
              style={{
                maxWidth: '100%',
                maxHeight: '60vh',
                objectFit: 'contain',
                borderRadius: '8px',
              }}
            />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <FaFileAlt style={{ fontSize: '48px', color: colours.accent, marginBottom: '16px' }} />
              <div style={{
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '14px',
                marginBottom: '8px',
              }}>
                Preview not available for this file type
              </div>
              <div style={{
                color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                fontSize: '12px',
              }}>
                {contentType || 'Unknown type'}
              </div>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: colours.highlight,
                    color: '#ffffff',
                    textDecoration: 'none',
                    marginTop: '16px',
                  }}
                >
                  Download to view
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface InstructionStatus {
  verifyIdStatus: 'pending' | 'received' | 'review' | 'complete';
  riskStatus: 'pending' | 'complete' | 'review';
  matterStatus: 'pending' | 'complete';
  cclStatus: 'pending' | 'complete';
  paymentStatus: 'pending' | 'processing' | 'complete';
}

type TimelineSourceKey = 'pitches' | 'emails' | 'calls' | 'documents';
type TimelineSourceStatus = 'loading' | 'done' | 'error';

type TimelineSourceProgress = Record<TimelineSourceKey, { status: TimelineSourceStatus; count: number }>;

const TIMELINE_SOURCES: Array<{ key: TimelineSourceKey; label: string }> = [
  { key: 'pitches', label: 'Pitches' },
  { key: 'emails', label: 'Emails' },
  { key: 'calls', label: 'Calls' },
  { key: 'documents', label: 'Documents' },
];

const createInitialSourceProgress = (): TimelineSourceProgress => ({
  pitches: { status: 'loading', count: 0 },
  emails: { status: 'loading', count: 0 },
  calls: { status: 'loading', count: 0 },
  documents: { status: 'loading', count: 0 },
});

type CachedTimelineSession = {
  enquiryId: string;
  timeline: TimelineItem[];
  instructionStatuses: { [pitchId: string]: InstructionStatus };
  sourceProgress: TimelineSourceProgress;
  cachedAt: number;
};

// Session-only cache (in-memory). Avoids re-fetching when users leave/return to the same enquiry timeline.
const enquiryTimelineSessionCache = new Map<string, CachedTimelineSession>();

interface EnquiryTimelineProps {
  enquiry: Enquiry;
  showDataLoadingStatus?: boolean;
  userInitials?: string;
  userEmail?: string;
  featureToggles?: Record<string, boolean>;
  demoModeEnabled?: boolean;
  onOpenPitchBuilder?: (scenarioId?: string) => void;
  /** Pre-fetched instruction workbench item for this enquiry (from parent instructionData) */
  inlineWorkbenchItem?: any;
}

const EnquiryTimeline: React.FC<EnquiryTimelineProps> = ({ enquiry, showDataLoadingStatus = true, userInitials, userEmail, featureToggles, demoModeEnabled = false, onOpenPitchBuilder, inlineWorkbenchItem }) => {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<CommunicationType[]>([]);
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`hiddenTimelineItems_${enquiry?.ID}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(() => new Set());
  const [expandedQuickAccessEmailIds, setExpandedQuickAccessEmailIds] = useState<Set<string>>(() => new Set());
  const [expandedCallTranscriptIds, setExpandedCallTranscriptIds] = useState<Set<string>>(() => new Set());
  const [loadingStates, setLoadingStates] = useState({
    pitches: true,
    emails: true,
    calls: true,
    documents: true,
  });
  const [sourceProgress, setSourceProgress] = useState<TimelineSourceProgress>(() => createInitialSourceProgress());
  const [completedSources, setCompletedSources] = useState({
    pitches: false,
    emails: false,
  });
  const [previewDocument, setPreviewDocument] = useState<TimelineItem | null>(null);
  const [instructionStatuses, setInstructionStatuses] = useState<{[pitchId: string]: InstructionStatus}>({});
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    loading?: boolean;
    details?: string;
    progress?: number;
  } | null>(null);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [emailSyncData, setEmailSyncData] = useState<{
    feeEarnerEmail: string;
    prospectEmail: string;
    pointOfContact: string;
  } | null>(null);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [callSyncData, setCallSyncData] = useState<{
    phoneNumber: string;
    contactName: string;
    availableNumbers: string[];
    maxResults: number;
  } | null>(null);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [forwardEmail, setForwardEmail] = useState<TimelineItem | null>(null);
  const [forwardCc, setForwardCc] = useState('');
  const [showPitchConfirm, setShowPitchConfirm] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [ledgerMode, setLedgerMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('timelineLedgerMode') === 'true';
    } catch {
      return false;
    }
  });
  const { isDarkMode } = useTheme();

  const viewAsProdFromStorage = (() => {
    try {
      const saved = localStorage.getItem('featureToggles');
      const parsed = saved ? JSON.parse(saved) : {};
      return parsed?.viewAsProd === true;
    } catch {
      return false;
    }
  })();

  const isProductionPreview = featureToggles?.viewAsProd === true || viewAsProdFromStorage;
  const showResourcesConcept = demoModeEnabled;
  // Request Docs should be available in all environments by default.
  // Use a feature toggle kill switch if needed.
  const requestDocsEnabled = featureToggles?.docRequestWorkspace !== false;

  // Timeline access - unlocked for all users
  const [timelineUnlocked] = useState<boolean>(true);

  const resolveEnquiryAreaOfWorkRaw = (enquiryInput: Enquiry | undefined): string => {
    if (!enquiryInput) return '';
    const record = enquiryInput as unknown as Record<string, unknown>;
    const candidate = record.Area_of_Work ?? record.AreaOfWork ?? record.area_of_work ?? record.areaOfWork ?? record.aow;
    return String(candidate ?? '').trim();
  };

  const resolveDefaultAreaOfWork = (rawAreaOfWork: unknown): string => {
    const candidate = String(rawAreaOfWork ?? '').trim();
    if (candidate && Object.prototype.hasOwnProperty.call(practiceAreasByArea, candidate)) return candidate;
    return 'Commercial';
  };

  // Doc request state
  const [docRequestLoading, setDocRequestLoading] = useState(false);
  const [docRequestResult, setDocRequestResult] = useState<{
    passcode: string;
    urlPath: string;
    createdAt?: string;
    expiresAt?: string;
    dealId?: number;
    worktype?: string;
  } | null>(null);

  const [docRequestAreaOfWork, setDocRequestAreaOfWork] = useState<string>(() => resolveDefaultAreaOfWork(resolveEnquiryAreaOfWorkRaw(enquiry)));

  const docRequestWorktypeOptions = useMemo(() => {
    const options = practiceAreasByArea[docRequestAreaOfWork];
    return Array.isArray(options) ? options : [];
  }, [docRequestAreaOfWork]);

  const [docRequestWorktype, setDocRequestWorktype] = useState<string>('');
  const [docRequestServiceDescription, setDocRequestServiceDescription] = useState<string>(() => String(resolveEnquiryAreaOfWorkRaw(enquiry) || 'Document request'));
  const [docRequestAmount, setDocRequestAmount] = useState<string>('');
  const [docRequestDealIsNa, setDocRequestDealIsNa] = useState<boolean>(true);
  const [docRequestConfirmOpen, setDocRequestConfirmOpen] = useState<boolean>(false);

  // Hover states for action buttons
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  type CallTranscriptTurn = {
    speaker: 'Agent' | 'Caller' | 'Other';
    text: string;
  };

  const normaliseWhitespace = (value: string): string => value.replace(/\r\n/g, '\n').replace(/[\t\f\v]+/g, ' ').trim();

  const parseCallTranscriptTurns = (raw: string): CallTranscriptTurn[] => {
    const input = String(raw || '').trim();
    if (!input) return [];

    // The upstream transcription often arrives as a single run-on line containing repeated
    // "Agent:" / "Caller:" markers. Split by those markers and reassemble as turns.
    const pattern = /(Agent|Caller):/g;
    const turns: CallTranscriptTurn[] = [];

    let lastSpeaker: CallTranscriptTurn['speaker'] | null = null;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(input)) !== null) {
      if (lastSpeaker !== null) {
        const chunk = input.slice(lastIndex, match.index).trim();
        if (chunk) {
          turns.push({
            speaker: lastSpeaker,
            text: normaliseWhitespace(chunk).replace(/\s*\n+\s*/g, '\n'),
          });
        }
      } else {
        // Preamble before first explicit speaker marker.
        const pre = input.slice(0, match.index).trim();
        if (pre) {
          turns.push({ speaker: 'Other', text: normaliseWhitespace(pre) });
        }
      }

      lastSpeaker = match[1] === 'Agent' ? 'Agent' : 'Caller';
      lastIndex = pattern.lastIndex;
    }

    if (lastSpeaker !== null) {
      const tail = input.slice(lastIndex).trim();
      if (tail) {
        turns.push({
          speaker: lastSpeaker,
          text: normaliseWhitespace(tail).replace(/\s*\n+\s*/g, '\n'),
        });
      }
    }

    return turns;
  };

  const extractCallContentSections = (content: string | undefined): { metaLines: string[]; note: string; transcription: string } => {
    const raw = String(content || '').replace(/\r\n/g, '\n');
    if (!raw) return { metaLines: [], note: '', transcription: '' };

    const lines = raw.split('\n');
    const metaLines: string[] = [];
    let note = '';
    let transcription = '';

    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('Note:')) break;
      if (line.trim().startsWith('Transcription:')) break;
      // Skip blank separators but stop collecting meta when we hit a long free-text block.
      if (line.trim()) metaLines.push(line.trim());
    }

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('Note:')) {
        note = line.replace(/^\s*Note:\s*/i, '').trim();
        continue;
      }
      if (line.trim().startsWith('Transcription:')) {
        transcription = lines.slice(i + 1).join('\n').trim();
        break;
      }
    }

    return { metaLines, note, transcription };
  };

  const renderCallDetails = (item: TimelineItem) => {
    const callrail = (item.metadata as any)?.callrail as
      | {
          customerName?: string;
          companyName?: string;
          customerPhoneNumber?: string;
          source?: string;
          medium?: string;
          trackingPhoneNumber?: string;
          businessPhoneNumber?: string;
          durationSeconds?: number;
          answered?: boolean;
          transcription?: string;
          note?: string;
        }
      | undefined;

    const fallback = extractCallContentSections(item.content);
    const durationSeconds =
      typeof callrail?.durationSeconds === 'number'
        ? callrail.durationSeconds
        : typeof item.metadata?.duration === 'number'
          ? item.metadata.duration
          : 0;

    const minutes = Math.floor(durationSeconds / 60);
    const seconds = (durationSeconds % 60).toString().padStart(2, '0');
    const durationLabel = durationSeconds ? `${minutes}:${seconds}` : '';

    const answered =
      typeof callrail?.answered === 'boolean'
        ? callrail.answered
        : typeof item.metadata?.answered === 'boolean'
          ? item.metadata.answered
          : undefined;

    const transcriptionRaw = String(callrail?.transcription || fallback.transcription || '').trim();
    const turns = parseCallTranscriptTurns(transcriptionRaw);
    const isExpanded = expandedCallTranscriptIds.has(item.id);
    const turnsToShow = isExpanded ? turns : turns.slice(0, 6);

    const labelColor = isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.55)';
    const valueColor = isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)';
    const cardBg = isDarkMode ? 'rgba(2, 6, 23, 0.22)' : 'rgba(255, 255, 255, 0.65)';
    const border = `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`;

    const metaPairs: Array<{ label: string; value: string }> = [];
    const pushIf = (label: string, value: unknown) => {
      const v = String(value ?? '').trim();
      if (v) metaPairs.push({ label, value: v });
    };

    pushIf('Duration', durationLabel);
    if (answered !== undefined) pushIf('Answered', answered ? 'Yes' : 'No');
    pushIf('Contact', callrail?.customerName);
    pushIf('Company', callrail?.companyName);
    pushIf('Phone', callrail?.customerPhoneNumber);
    pushIf('Source', callrail?.source || item.metadata?.source);
    pushIf('Medium', callrail?.medium);
    pushIf('Tracking Number', callrail?.trackingPhoneNumber);
    pushIf('Business Number', callrail?.businessPhoneNumber);

    const recordingUrl = (item.metadata as any)?.recordingUrl as string | undefined;
    const note = String(callrail?.note || fallback.note || '').trim();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Summary grid */}
        {metaPairs.length > 0 && (
          <div style={{ background: cardBg, border, borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '8px 14px',
            }}>
              {metaPairs.map((row) => (
                <div key={row.label} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px', color: labelColor, textTransform: 'uppercase' }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: valueColor, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
            {recordingUrl && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '2px',
                    background: colours.highlight,
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  ↗ Recording
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(recordingUrl, 'Recording link');
                  }}
                  style={{
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '2px',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.25)'}`,
                    background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(255, 255, 255, 0.65)',
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Copy link
                </button>
              </div>
            )}
          </div>
        )}

        {/* Note */}
        {note && (
          <div style={{ background: cardBg, border, borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px', color: labelColor, textTransform: 'uppercase' }}>Note</div>
            <div style={{ marginTop: '6px', fontSize: '12px', color: valueColor, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{note}</div>
          </div>
        )}

        {/* Transcript */}
        {transcriptionRaw ? (
          <div style={{ background: cardBg, border, borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px', color: labelColor, textTransform: 'uppercase' }}>
                Transcription {turns.length > 0 ? `(${turns.length} turn${turns.length === 1 ? '' : 's'})` : ''}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(transcriptionRaw, 'Transcription');
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    borderRadius: '2px',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.25)'}`,
                    background: 'transparent',
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)',
                    cursor: 'pointer',
                  }}
                >
                  Copy
                </button>
                {turns.length > 6 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCallTranscriptIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '10px',
                      fontWeight: 700,
                      borderRadius: '2px',
                      border: `1px solid ${colours.highlight}55`,
                      background: isDarkMode ? `${colours.highlight}12` : `${colours.highlight}10`,
                      color: colours.highlight,
                      cursor: 'pointer',
                    }}
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            </div>

            {turns.length > 0 ? (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {turnsToShow.map((t, idx) => {
                  const accent =
                    t.speaker === 'Agent'
                      ? colours.highlight
                      : t.speaker === 'Caller'
                        ? '#22c55e'
                        : isDarkMode
                          ? 'rgba(148, 163, 184, 0.35)'
                          : 'rgba(100, 116, 139, 0.35)';

                  return (
                    <div
                      key={`${t.speaker}-${idx}`}
                      style={{
                        borderLeft: `3px solid ${accent}`,
                        paddingLeft: '10px',
                        paddingTop: '6px',
                        paddingBottom: '6px',
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.2px', color: labelColor, textTransform: 'uppercase' }}>
                        {t.speaker}
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '12px', color: valueColor, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {t.text}
                      </div>
                    </div>
                  );
                })}
                {!isExpanded && turns.length > turnsToShow.length && (
                  <div style={{ fontSize: '11px', color: labelColor, marginTop: '2px' }}>
                    + {turns.length - turnsToShow.length} more turn{turns.length - turnsToShow.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '8px', fontSize: '12px', color: valueColor, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {transcriptionRaw}
              </div>
            )}
          </div>
        ) : fallback.metaLines.length > 0 ? (
          <div style={{ background: cardBg, border, borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px', color: labelColor, textTransform: 'uppercase' }}>Details</div>
            <div style={{ marginTop: '6px', fontSize: '12px', color: valueColor, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
              {fallback.metaLines.join('\n')}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const formatDocRequestAmount = (val: string): string => {
    const raw = String(val || '').replace(/[£\s]/g, '').replace(/,/g, '');
    if (!raw) return '';
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleDocRequestAmountChange = (next: string) => {
    const cleaned = String(next || '').replace(/[£\s]/g, '');
    if (!cleaned) {
      setDocRequestAmount('');
      return;
    }
    const raw = cleaned.replace(/,/g, '');
    if (raw && !/^\d*\.?\d{0,2}$/.test(raw)) {
      // Keep user typing state, but don't try to coerce.
      setDocRequestAmount(cleaned);
      return;
    }
    setDocRequestAmount(cleaned);
  };

  const handleDocRequestAmountBlur = () => {
    setDocRequestAmount((prev) => formatDocRequestAmount(prev));
  };

  const adjustDocRequestAmount = (delta: number) => {
    const raw = String(docRequestAmount || '').replace(/[£\s]/g, '').replace(/,/g, '');
    const current = Number.parseFloat(raw);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, base + delta);
    setDocRequestAmount(next.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  useEffect(() => {
    const nextArea = resolveDefaultAreaOfWork(resolveEnquiryAreaOfWorkRaw(enquiry));
    setDocRequestAreaOfWork(nextArea);
    setDocRequestWorktype('');
    setDocRequestServiceDescription(String(resolveEnquiryAreaOfWorkRaw(enquiry) || 'Document request'));
    setDocRequestConfirmOpen(false);
  }, [enquiry?.ID, enquiry?.Area_of_Work]);

  useEffect(() => {
    if (!docRequestConfirmOpen) return;
    // Default to skipping deal details in the create modal; users can uncheck to reveal fields.
    setDocRequestDealIsNa(true);
    setDocRequestAmount('0.00');
    setDocRequestServiceDescription('Document request');
    // Avoid misleading defaults: force explicit work type selection.
    setDocRequestWorktype('');
  }, [docRequestConfirmOpen]);

  useEffect(() => {
    // Keep worktype consistent with selected area.
    if (!docRequestWorktypeOptions.includes(docRequestWorktype)) {
      setDocRequestWorktype('');
    }
  }, [docRequestWorktypeOptions, docRequestWorktype]);

  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const getExpiryLabel = (expiresAtIso?: string) => {
    if (!expiresAtIso) return 'Expires in 14 days';
    const expiresAt = new Date(expiresAtIso);
    const expiresMs = expiresAt.getTime();
    if (!Number.isFinite(expiresMs)) return 'Expires in 14 days';

    const remainingMs = expiresMs - nowTick;
    if (remainingMs <= 0) return 'Expired';

    const totalMinutes = Math.floor(remainingMs / 60_000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
    if (days > 0) return `Expires in ${days}d ${hours}h`;
    return `Expires in ${Math.max(0, hours)}h`;
  };

  const isExpiredIso = (expiresAtIso?: string) => {
    if (!expiresAtIso) return false;
    const expiresAt = new Date(expiresAtIso);
    const expiresMs = expiresAt.getTime();
    if (!Number.isFinite(expiresMs)) return false;
    return expiresMs - nowTick <= 0;
  };

  const DOC_WORKSPACE_STORAGE_PREFIX = 'helix:doc-workspace:';

  type DocWorkspaceStored = {
    passcode: string;
    urlPath: string;
    createdAt?: string;
    expiresAt?: string;
    dealId?: number;
    worktype?: string;
  };

  const readStoredDocWorkspace = (pitchEnquiryId: number): DocWorkspaceStored | null => {
    try {
      const raw = window.localStorage.getItem(`${DOC_WORKSPACE_STORAGE_PREFIX}${pitchEnquiryId}`);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const record = parsed as Record<string, unknown>;
      const passcode = typeof record.passcode === 'string' ? record.passcode : '';
      const urlPath = typeof record.urlPath === 'string' ? record.urlPath : '';
      if (!passcode || !urlPath) return null;

      const createdAt = typeof record.createdAt === 'string' ? record.createdAt : undefined;
      const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : undefined;
      const dealId = typeof record.dealId === 'number' ? record.dealId : undefined;
      const worktype = typeof record.worktype === 'string' ? record.worktype : undefined;

      return { passcode, urlPath, createdAt, expiresAt, dealId, worktype };
    } catch {
      return null;
    }
  };

  const writeStoredDocWorkspace = (pitchEnquiryId: number, value: DocWorkspaceStored) => {
    try {
      window.localStorage.setItem(`${DOC_WORKSPACE_STORAGE_PREFIX}${pitchEnquiryId}`, JSON.stringify(value));
    } catch {
      // ignore
    }
  };

  const ensureDocWorkspaceShell = (input: { passcode: string; urlPath: string; expiresAt?: string; createdAt?: string; dealId?: number; worktype?: string }) => {
    const workspaceItemId = `doc-workspace-${enquiry.ID}`;
    const createdAt = (() => {
      const raw = input.createdAt;
      if (!raw) return new Date().toISOString();
      const d = new Date(raw);
      return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
    })();

    const workspaceItem: TimelineItem = {
      id: workspaceItemId,
      type: 'document',
      date: createdAt,
      subject: 'Client Upload Portal',
      content: '',
      createdBy: userEmail || 'Unknown',
      metadata: {
        isDocWorkspace: true,
        workspacePasscode: input.passcode,
        workspaceUrlPath: input.urlPath,
        workspaceExpiresAt: input.expiresAt,
        workspaceDealId: input.dealId,
        workspaceWorktype: input.worktype,
      },
    };

    setTimeline((prev) => {
      const withoutExisting = prev.filter((t) => t.id !== workspaceItemId);
      const next = [workspaceItem, ...withoutExisting];
      next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return next;
    });
    setSelectedItem(workspaceItem);
  };

  type DocRequestStatusResult =
    | ({ kind: 'found' } & { passcode: string; urlPath: string; createdAt?: string; expiresAt?: string; dealId?: number; isExpired?: boolean })
    | { kind: 'not-found' }
    | { kind: 'unsupported' }
    | { kind: 'error' };

  const fetchDocRequestStatus = async (pitchEnquiryId: number): Promise<DocRequestStatusResult> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`/api/doc-workspace/status?enquiry_id=${pitchEnquiryId}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        // If the endpoint isn't deployed on the tab backend yet, we'll see a 404.
        if (res.status === 404) return { kind: 'unsupported' };
        return { kind: 'error' };
      }
      const data: unknown = await res.json();
      if (!data || typeof data !== 'object') return { kind: 'error' };
      const record = data as Record<string, unknown>;
      if (record.exists !== true) return { kind: 'not-found' };

      const passcode = typeof record.passcode === 'string' ? record.passcode : '';
      const urlPath = typeof record.urlPath === 'string' ? record.urlPath : '';
      if (!passcode || !urlPath) return { kind: 'error' };

      const createdAt = typeof record.createdAt === 'string' ? record.createdAt : undefined;
      const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : undefined;
      const dealId = typeof record.dealId === 'number' ? record.dealId : undefined;
      const isExpired = typeof record.isExpired === 'boolean' ? record.isExpired : undefined;

      return { kind: 'found', passcode, urlPath, createdAt, expiresAt, dealId, isExpired };
    } catch {
      return { kind: 'error' };
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  // Toast helper
  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning',
    options?: { loading?: boolean; details?: string; progress?: number; duration?: number }
  ) => {
    setToast({ message, type, ...options });
    if (!options?.loading && options?.duration !== 0) {
      setTimeout(() => setToast(null), options?.duration || 4000);
    }
  };

  // Hide/show timeline items
  const toggleHideItem = (itemId: string) => {
    setHiddenItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      // Persist to localStorage
      try {
        localStorage.setItem(`hiddenTimelineItems_${enquiry?.ID}`, JSON.stringify(Array.from(next)));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const unhideAllItems = () => {
    setHiddenItemIds(new Set());
    try {
      localStorage.removeItem(`hiddenTimelineItems_${enquiry?.ID}`);
    } catch {
      // ignore
    }
    showToast('All hidden items restored', 'success');
  };

  const copyToClipboard = async (value: string, label: string) => {
    const text = String(value ?? '').trim();
    if (!text) {
      showToast(`${label} not available`, 'error');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast(`${label} copied`, 'success');
    } catch {
      showToast(`Failed to copy ${label.toLowerCase()}`, 'error');
    }
  };

  const openMailto = (email: string) => {
    const value = String(email ?? '').trim();
    if (!value) {
      showToast('Email not available', 'error');
      return;
    }
    try {
      window.open(`mailto:${value}`, '_blank');
    } catch {
      // ignore
    }
  };

  const openTel = (phoneNumber: string) => {
    const value = String(phoneNumber ?? '').trim();
    if (!value) {
      showToast('Phone number not available', 'error');
      return;
    }
    try {
      window.open(`tel:${value}`, '_blank');
    } catch {
      // ignore
    }
  };

  const openPitchBuilder = () => {
    const existingPitches = timeline.filter((t) => t.type === 'pitch');
    if (existingPitches.length > 0) {
      setShowPitchConfirm(true);
    } else {
      // No existing pitches - go straight to scenario picker
      setShowPitchConfirm(true);
    }
  };

  const handlePitchConfirmed = () => {
    // User confirmed - show scenario picker (same modal, different view)
    // Modal already showing, just let user pick scenario
  };

  const handleScenarioSelected = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    setShowPitchConfirm(false);
    if (onOpenPitchBuilder) {
      onOpenPitchBuilder(scenarioId);
      return;
    }
    showToast('Pitch builder not available here', 'info');
  };

  const resolvePitchEnquiryId = (enquiryInput: Enquiry): number | null => {
    const candidate = (enquiryInput as unknown as { pitchEnquiryId?: unknown; id?: unknown; ID?: unknown }).pitchEnquiryId
      ?? (enquiryInput as unknown as { pitchEnquiryId?: unknown; id?: unknown; ID?: unknown }).id
      ?? (enquiryInput as unknown as { pitchEnquiryId?: unknown; id?: unknown; ID?: unknown }).ID;

    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    const parsed = parseInt(String(candidate ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  // Request Documents - creates a DOC_REQUEST deal and generates a shareable link
  const handleRequestDocuments = async () => {
    const existingWorkspace = timeline.find((t) => t.type === 'document' && Boolean(t.metadata?.isDocWorkspace));
    if (existingWorkspace) {
      // Workspace already requested for this enquiry; open the existing item instead of re-requesting.
      setSelectedItem(existingWorkspace);
      setDocRequestConfirmOpen(false);
      showToast('Workspace already exists for this enquiry', 'info');
      return;
    }

    if (!requestDocsEnabled) {
      showToast('Request Docs is currently disabled', 'info');
      return;
    }
    if (!userEmail) {
      showToast('User email not available', 'error');
      return;
    }

    const allowedRequester = /@helix-law\.com$/i.test(userEmail) || /@helix\.law$/i.test(userEmail);
    if (!allowedRequester) {
      showToast('Request Docs requires a Helix email (@helix-law.com or @helix.law)', 'error', { duration: 6000 });
      return;
    }

    const pitchEnquiryId = resolvePitchEnquiryId(enquiry);
    if (!pitchEnquiryId) {
      showToast('Unable to determine Pitch enquiry id for this record', 'error');
      return;
    }

    // If the Pitch status endpoint isn't available yet, fall back to locally remembered workspace
    // (prevents repeatedly generating new workspaces for the same user/browser).
    const stored = readStoredDocWorkspace(pitchEnquiryId);
    if (stored) {
      setDocRequestResult({
        passcode: stored.passcode,
        urlPath: stored.urlPath,
        createdAt: stored.createdAt,
        expiresAt: stored.expiresAt,
        dealId: stored.dealId,
        worktype: stored.worktype,
      });
      ensureDocWorkspaceShell({
        passcode: stored.passcode,
        urlPath: stored.urlPath,
        createdAt: stored.createdAt,
        expiresAt: stored.expiresAt,
        dealId: stored.dealId,
        worktype: stored.worktype,
      });
      showToast(isExpiredIso(stored.expiresAt) ? 'Workspace exists (expired)' : 'Workspace already exists', 'info', { duration: 4500 });
      return;
    }

    // Backend truth: if a workspace already exists, show it (active/expired) and do not create a new one.
    const existingStatus = await fetchDocRequestStatus(pitchEnquiryId);
    if (existingStatus.kind === 'found') {
      setDocRequestResult({
        passcode: existingStatus.passcode,
        urlPath: existingStatus.urlPath,
        createdAt: existingStatus.createdAt,
        expiresAt: existingStatus.expiresAt,
        dealId: existingStatus.dealId,
        worktype: docRequestWorktype || undefined,
      });
      ensureDocWorkspaceShell({
        passcode: existingStatus.passcode,
        urlPath: existingStatus.urlPath,
        createdAt: existingStatus.createdAt,
        expiresAt: existingStatus.expiresAt,
        dealId: existingStatus.dealId,
        worktype: docRequestWorktype || undefined,
      });
      writeStoredDocWorkspace(pitchEnquiryId, {
        passcode: existingStatus.passcode,
        urlPath: existingStatus.urlPath,
        createdAt: existingStatus.createdAt,
        expiresAt: existingStatus.expiresAt,
        dealId: existingStatus.dealId,
        worktype: docRequestWorktype || undefined,
      });
      showToast(existingStatus.isExpired ? 'Workspace exists (expired)' : 'Workspace already exists', 'info', { duration: 4500 });
      return;
    }

    setDocRequestLoading(true);
    showToast('Creating document request link...', 'info', { loading: true, duration: 0 });

    try {
      const pitchBackendUrl = process.env.REACT_APP_PITCH_BACKEND_URL || 'https://instruct.helix-law.com';

      const worktype = String(docRequestWorktype || '').trim();
      if (!worktype) {
        showToast('Worktype is required', 'warning', { duration: 3500 });
        setDocRequestLoading(false);
        setToast(null);
        return;
      }

      const serviceDescription = String(docRequestServiceDescription || '').trim();
      const parsedAmount = (() => {
        if (docRequestDealIsNa) return 0;
        const cleaned = String(docRequestAmount || '').trim().replace(/[,£\s]/g, '');
        if (!cleaned) return 0;
        const num = Number.parseFloat(cleaned);
        if (!Number.isFinite(num)) return 0;
        if (num < 0) return 0;
        return num;
      })();
      
      const payload: Record<string, unknown> = {
        enquiry_id: pitchEnquiryId,
        requested_by: userEmail,
        // Folder/workspace structure
        worktype,
        // Deal entry fields (recommended)
        service_description: (docRequestDealIsNa ? '' : serviceDescription) || 'Document request',
        amount: parsedAmount,
        // Optional
        area_of_work: String(docRequestAreaOfWork || resolveDefaultAreaOfWork(resolveEnquiryAreaOfWorkRaw(enquiry))),
      };

      if (typeof userInitials === 'string' && userInitials.trim()) {
        payload.pitched_by = userInitials.trim().toUpperCase();
      }

      const response = await fetch(`${pitchBackendUrl}/api/doc-request-deals/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Still show a workspace shell (not live) so users can see status and any existing docs.
          const createdAt = new Date().toISOString();
          const workspaceItemId = `doc-workspace-${enquiry.ID}`;
          const workspaceItem: TimelineItem = {
            id: workspaceItemId,
            type: 'document',
            date: createdAt,
            subject: 'Client Upload Portal',
            content: '',
            createdBy: userEmail,
            metadata: {
              isDocWorkspace: true,
              workspacePasscode: '',
              workspaceUrlPath: '',
              workspaceExpiresAt: undefined,
              workspaceError: 'Enquiry not found in Pitch system',
            },
          };

          setTimeline((prev) => {
            const withoutExisting = prev.filter((t) => t.id !== workspaceItemId);
            const next = [workspaceItem, ...withoutExisting];
            next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            return next;
          });
          setSelectedItem(workspaceItem);
          // Keep modal open so user can see status/details.

          // Best-effort: list any existing docs (listing does not require the enquiry table).
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const docsRes = await fetch(`/api/doc-workspace/documents?enquiry_id=${pitchEnquiryId}`, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (docsRes.ok) {
              const docsData = await docsRes.json();
              const documents = Array.isArray(docsData?.documents) ? docsData.documents : [];
              const folders = Array.isArray(docsData?.folders) ? docsData.folders.filter((f: unknown) => typeof f === 'string') : [];
              const docItems: TimelineItem[] = documents.map((doc: any) => ({
                id: `document-${String(doc?.id ?? doc?.blob_name ?? doc?.blob_url ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(-200) || String(Math.random()).slice(2)}`,
                type: 'document' as CommunicationType,
                date: doc.uploaded_at,
                subject: doc.original_filename || 'Document',
                content: doc.notes || undefined,
                createdBy: doc.uploaded_by || 'Unknown',
                metadata: {
                  documentType: doc.document_type,
                  filename: doc.original_filename,
                  fileSize: doc.file_size,
                  contentType: doc.content_type,
                  blobUrl: doc.blob_url,
                  blobName: typeof doc.blob_name === 'string' ? doc.blob_name : (typeof doc.id === 'string' ? doc.id : undefined),
                  stageUploaded: doc.stage_uploaded,
                  documentId: doc.id,
                },
              }));

              setTimeline((prev) => {
                const byId = new Map<string, TimelineItem>();
                for (const item of prev) {
                  if (item.metadata?.isDocWorkspace && folders.length > 0) {
                    byId.set(item.id, {
                      ...item,
                      metadata: {
                        ...item.metadata,
                        workspaceFolders: folders,
                      },
                    });
                    continue;
                  }
                  byId.set(item.id, item);
                }
                for (const item of docItems) {
                  if (!byId.has(item.id)) byId.set(item.id, item);
                }
                const next = Array.from(byId.values());
                next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                return next;
              });
            } else {
              const err = await docsRes.json().catch(() => null);
              const msg = typeof err?.error === 'string' ? err.error : 'Unable to load workspace documents';
              showToast(msg, 'warning', { duration: 6000 });
            }
          } catch {
            showToast('Unable to load workspace documents', 'warning', { duration: 6000 });
          }

          showToast('Workspace not live yet (Pitch missing enquiry record)', 'warning', { duration: 6000 });
          return;
        }
        if (response.status === 400) {
          throw new Error('Invalid request (missing enquiry id or user email)');
        }
        const err = await response.json().catch(() => ({ error: 'Pitch service error' }));
        throw new Error(err.error || 'Pitch service error');
      }

      const data: unknown = await response.json();

      const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

      const dealId = (() => {
        if (!isRecord(data)) return undefined;

        const directCandidate = data.dealId ?? data.deal_id;
        const deal = data.deal;
        const nestedCandidate = isRecord(deal) ? (deal.id ?? deal.dealId ?? deal.deal_id) : undefined;

        const candidate = directCandidate ?? nestedCandidate;
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
        const parsed = Number.parseInt(String(candidate ?? ''), 10);
        return Number.isFinite(parsed) ? parsed : undefined;
      })();

      const worktypeFromApi = (() => {
        if (!isRecord(data)) return undefined;
        const candidate = data.worktype ?? data.work_type;
        return typeof candidate === 'string' ? candidate : undefined;
      })();

      const record = isRecord(data) ? data : {};
      const readString = (key: string): string | null => {
        const value = record[key];
        return typeof value === 'string' ? value : null;
      };

      const passcode = readString('passcode')
        ?? readString('workspacePasscode')
        ?? readString('dealPasscode')
        ?? '';
      const urlPathFromApi = readString('urlPath')
        ?? readString('workspaceUrlPath')
        ?? '';
      const urlPath = urlPathFromApi.startsWith('/pitch/')
        ? urlPathFromApi
        : (passcode ? `/pitch/${passcode}` : urlPathFromApi);

      const existingWorkspace = timeline.find((t) => t.id === `doc-workspace-${enquiry.ID}` && Boolean(t.metadata?.isDocWorkspace));

      const createdAtRaw = readString('createdAt')
        ?? readString('created_at')
        ?? readString('created')
        ?? readString('workspaceCreatedAt')
        ?? (typeof existingWorkspace?.date === 'string' ? existingWorkspace.date : null);
      const expiresAtRaw = readString('expiresAt')
        ?? readString('expires_at')
        ?? readString('validUntil')
        ?? readString('valid_until')
        ?? readString('workspaceExpiresAt')
        ?? (typeof existingWorkspace?.metadata?.workspaceExpiresAt === 'string' ? existingWorkspace.metadata.workspaceExpiresAt : null);

      if (!passcode || !urlPath.startsWith('/pitch/')) {
        throw new Error('Pitch service error');
      }

      const createdAtDate = (() => {
        const d = createdAtRaw ? new Date(createdAtRaw) : new Date();
        return Number.isFinite(d.getTime()) ? d : new Date();
      })();
      const expiresAtDate = (() => {
        const d = expiresAtRaw ? new Date(expiresAtRaw) : new Date(createdAtDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        return Number.isFinite(d.getTime()) ? d : new Date(createdAtDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      })();
      const createdAt = createdAtDate.toISOString();
      const expiresAt = expiresAtDate.toISOString();

      setDocRequestResult({ passcode, urlPath, createdAt, expiresAt, dealId, worktype: worktypeFromApi ?? worktype });

      writeStoredDocWorkspace(pitchEnquiryId, { passcode, urlPath, createdAt, expiresAt, dealId, worktype: worktypeFromApi ?? worktype });

      // Insert/update a "workspace shell" item in the timeline.
      const workspaceItemId = `doc-workspace-${enquiry.ID}`;
      const workspaceItem: TimelineItem = {
        id: workspaceItemId,
        type: 'document',
        date: createdAt,
        subject: 'Client Upload Portal',
        content: '',
        createdBy: userEmail,
        metadata: {
          isDocWorkspace: true,
          workspacePasscode: passcode,
          workspaceUrlPath: urlPath,
          workspaceExpiresAt: expiresAt,
          workspaceDealId: dealId,
          workspaceWorktype: worktypeFromApi ?? worktype,
        },
      };

      setTimeline((prev) => {
        const withoutExisting = prev.filter((t) => t.id !== workspaceItemId);
        const next = [workspaceItem, ...withoutExisting];
        next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return next;
      });
      setSelectedItem(workspaceItem);
      // Keep modal open so user can see/copy the generated link.

      // Best-effort: fetch docs again now that the workspace is confirmed.
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const docsRes = await fetch(`/api/doc-workspace/documents?enquiry_id=${pitchEnquiryId}&passcode=${encodeURIComponent(passcode)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (docsRes.ok) {
          const docsData = await docsRes.json();
          const documents = Array.isArray(docsData?.documents) ? docsData.documents : [];
          const folders = Array.isArray(docsData?.folders) ? docsData.folders.filter((f: unknown) => typeof f === 'string') : [];
          const docItems: TimelineItem[] = documents.map((doc: any) => ({
            id: `document-${String(doc?.id ?? doc?.blob_name ?? doc?.blob_url ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(-200) || String(Math.random()).slice(2)}`,
            type: 'document' as CommunicationType,
            date: doc.uploaded_at,
            subject: doc.original_filename || 'Document',
            content: doc.notes || undefined,
            createdBy: doc.uploaded_by || 'Unknown',
            metadata: {
              documentType: doc.document_type,
              filename: doc.original_filename,
              fileSize: doc.file_size,
              contentType: doc.content_type,
              blobUrl: doc.blob_url,
              blobName: typeof doc.blob_name === 'string' ? doc.blob_name : (typeof doc.id === 'string' ? doc.id : undefined),
              stageUploaded: doc.stage_uploaded,
              documentId: doc.id,
            },
          }));

          setTimeline((prev) => {
            const byId = new Map<string, TimelineItem>();
            for (const item of prev) {
              if (item.metadata?.isDocWorkspace && folders.length > 0) {
                byId.set(item.id, {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    workspaceFolders: folders,
                  },
                });
                continue;
              }
              byId.set(item.id, item);
            }
            for (const item of docItems) {
              if (!byId.has(item.id)) byId.set(item.id, item);
            }
            const next = Array.from(byId.values());
            next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            return next;
          });
        } else {
          const err = await docsRes.json().catch(() => null);
          const msg = typeof err?.error === 'string' ? err.error : 'Unable to load workspace documents';
          showToast(msg, 'warning', { duration: 6000 });
        }
      } catch {
        showToast('Unable to load workspace documents', 'warning', { duration: 6000 });
      }

      showToast(`Workspace is live • ${getExpiryLabel(expiresAt)}`, 'success', { duration: 6000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create document request';

      // Create a non-live workspace shell so the action is idempotent in the UI.
      const createdAt = new Date().toISOString();
      const workspaceItemId = `doc-workspace-${enquiry.ID}`;
      const workspaceItem: TimelineItem = {
        id: workspaceItemId,
        type: 'document',
        date: createdAt,
        subject: 'Client Upload Portal',
        content: '',
        createdBy: userEmail || 'Unknown',
        metadata: {
          isDocWorkspace: true,
          workspacePasscode: '',
          workspaceUrlPath: '',
          workspaceExpiresAt: undefined,
          workspaceError: message,
        },
      };

      setTimeline((prev) => {
        const withoutExisting = prev.filter((t) => t.id !== workspaceItemId);
        const next = [workspaceItem, ...withoutExisting];
        next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return next;
      });
      setSelectedItem(workspaceItem);
      // Keep modal open so user can see status/error details.

      showToast(message, 'error');
    } finally {
      setDocRequestLoading(false);
    }
  };

  // On enquiry load: check if a doc workspace already exists so button/status is accurate.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!requestDocsEnabled) return;
      const pitchEnquiryId = resolvePitchEnquiryId(enquiry);
      if (!pitchEnquiryId) return;

      const status = await fetchDocRequestStatus(pitchEnquiryId);
      if (cancelled) return;

      if (status.kind === 'found') {
        setDocRequestResult({
          passcode: status.passcode,
          urlPath: status.urlPath,
          createdAt: status.createdAt,
          expiresAt: status.expiresAt,
          dealId: status.dealId,
        });
        ensureDocWorkspaceShell({
          passcode: status.passcode,
          urlPath: status.urlPath,
          createdAt: status.createdAt,
          expiresAt: status.expiresAt,
          dealId: status.dealId,
        });

        writeStoredDocWorkspace(pitchEnquiryId, {
          passcode: status.passcode,
          urlPath: status.urlPath,
          createdAt: status.createdAt,
          expiresAt: status.expiresAt,
          dealId: status.dealId,
        });
        return;
      }

      if (status.kind === 'unsupported') {
        const stored = readStoredDocWorkspace(pitchEnquiryId);
        if (!stored) return;
        setDocRequestResult({
          passcode: stored.passcode,
          urlPath: stored.urlPath,
          createdAt: stored.createdAt,
          expiresAt: stored.expiresAt,
          dealId: stored.dealId,
          worktype: stored.worktype,
        });
        ensureDocWorkspaceShell({
          passcode: stored.passcode,
          urlPath: stored.urlPath,
          createdAt: stored.createdAt,
          expiresAt: stored.expiresAt,
          dealId: stored.dealId,
          worktype: stored.worktype,
        });
      }
      // not-found/error: do nothing

    };
    run();
    return () => {
      cancelled = true;
    };
  }, [enquiry?.ID, requestDocsEnabled]);

  // Manual sync handlers
  const handleManualSync = async (syncType: 'pitches' | 'emails' | 'calls' | 'instructions') => {
    if (syncType === 'emails') {
      // Get fee earner email from Point_of_Contact
      const pointOfContact = enquiry.Point_of_Contact || 'Unknown Fee Earner';
      const prospectEmail = enquiry.Email || 'Unknown Email';
      
      // Check if Point_of_Contact is already an email, otherwise try to map it
      let feeEarnerEmail = pointOfContact;
      if (!pointOfContact.includes('@')) {
        // If it's not an email, map name to email format
        feeEarnerEmail = `${pointOfContact.toLowerCase().replace(/\s+/g, '.')}@helix-law.com`;
      }
      
      // Store email sync data and show custom confirmation dialog
      setEmailSyncData({ feeEarnerEmail, prospectEmail, pointOfContact });
      setShowEmailConfirm(true);
      return;
    }

    if (syncType === 'calls') {
      const availableNumbers = Array.from(
        new Set(
          [enquiry.Phone_Number, enquiry.Secondary_Phone]
            .map((number) => number?.trim())
            .filter((number): number is string => Boolean(number))
        ),
      );

      if (availableNumbers.length === 0) {
        showToast('No phone number on record — enter one to search CallRail.', 'warning', { duration: 3500 });
      }

      const contactName = `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim() || 'Prospect';

      setCallSyncData({
        phoneNumber: availableNumbers[0] || '',
        contactName,
        availableNumbers,
        maxResults: 50,
      });
      setShowCallConfirm(true);
      return;
    }
    
    showToast(`${syncType} sync coming soon`, 'info', { duration: 2000 });
  };

  // Execute email sync after confirmation
  const executeEmailSync = async () => {
    if (!emailSyncData) return;
    
    const { feeEarnerEmail, prospectEmail } = emailSyncData;
    setShowEmailConfirm(false);
    
    showToast(
      'Searching inbox...',
      'info',
      { loading: true, details: `Searching ${feeEarnerEmail} for emails with ${prospectEmail}`, duration: 0 }
    );
    
    setLoadingStates(prev => ({ ...prev, emails: true }));
    setCompletedSources(prev => ({ ...prev, emails: false }));
    
    try {
      const response = await fetch('/api/searchInbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feeEarnerEmail,
          prospectEmail,
          maxResults: 50,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      // Transform search results into timeline items
      const emailItems: TimelineItem[] = result.emails.map((email: any) => ({
        id: `email-${email.id}`,
        type: 'email' as CommunicationType,
        date: email.receivedDateTime,
        subject: email.subject,
        contentHtml: email.bodyHtml || undefined,
        content: (email.bodyText || email.bodyPreview) || '',
        createdBy: email.fromName || email.from,
        metadata: {
          direction: email.from.toLowerCase() === prospectEmail.toLowerCase() ? 'inbound' : 'outbound',
          messageId: email.id, // Store Graph message ID for true forwarding
          feeEarnerEmail: feeEarnerEmail, // Store mailbox owner for forwarding
          internetMessageId: email.internetMessageId || undefined,
        },
      }));

      // Add the found emails to the timeline
      setTimeline(prev => {
        const newItems = [...prev, ...emailItems];
        // Sort by date (newest first)
        return newItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      // Show success message
      showToast(
        `Found ${result.emails.length} email${result.emails.length !== 1 ? 's' : ''}`,
        'success',
        { details: `${result.emails.length} email${result.emails.length !== 1 ? 's' : ''} added to timeline` }
      );

    } catch (error) {
      console.error('Email search failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(
        'Email search failed',
        'error',
        { details: errorMessage }
      );
    } finally {
      setLoadingStates(prev => ({ ...prev, emails: false }));
      setCompletedSources(prev => ({ ...prev, emails: true }));
      setEmailSyncData(null);
    }
  };

  const executeCallSync = async () => {
    if (!callSyncData) {
      return;
    }

    const phoneNumber = callSyncData.phoneNumber.trim();
    if (!phoneNumber) {
      showToast('Enter a phone number to search CallRail.', 'warning', { duration: 3500 });
      return;
    }

    setShowCallConfirm(false);

    showToast(
      'Searching calls...',
      'info',
      { loading: true, details: `Searching CallRail for ${phoneNumber}`, duration: 0 }
    );

    setLoadingStates(prev => ({ ...prev, calls: true }));

    try {
      const response = await fetch('/api/callrailCalls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber,
          maxResults: callSyncData.maxResults,
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // ignore JSON parse failures
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      const callItems: TimelineItem[] = (result.calls || []).map((call: any) => {
        const durationSeconds = Number(call.duration || 0);
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = (durationSeconds % 60).toString().padStart(2, '0');
        
        // Build detailed call information
        const callDetails: string[] = [];
        
        // Basic call info
        if (durationSeconds) {
          callDetails.push(`Duration: ${minutes}:${seconds}`);
        }
        if (call.answered !== undefined) {
          callDetails.push(call.answered ? 'Answered' : 'Unanswered');
        }
        
        // Contact information
        if (call.customerName && call.customerName !== 'Unknown Caller') {
          callDetails.push(`Contact: ${call.customerName}`);
        }
        if (call.companyName) {
          callDetails.push(`Company: ${call.companyName}`);
        }
        if (call.customerPhoneNumber) {
          callDetails.push(`Phone: ${call.customerPhoneNumber}`);
        }
        
        // Marketing attribution
        if (call.source && call.source !== 'Unknown') {
          callDetails.push(`Source: ${call.source}`);
        }
        if (call.keywords) {
          callDetails.push(`Keywords: ${call.keywords}`);
        }
        if (call.campaign) {
          callDetails.push(`Campaign: ${call.campaign}`);
        }
        if (call.medium) {
          callDetails.push(`Medium: ${call.medium}`);
        }
        
        // Call value
        if (call.value) {
          callDetails.push(`Value: £${call.value}`);
        }
        
        // Technical details
        if (call.trackingPhoneNumber) {
          callDetails.push(`Tracking Number: ${call.trackingPhoneNumber}`);
        }
        if (call.businessPhoneNumber) {
          callDetails.push(`Business Number: ${call.businessPhoneNumber}`);
        }
        
        // Add note if exists
        if (call.note) {
          callDetails.push(`\nNote: ${call.note}`);
        }
        
        // Add transcription if exists
        if (call.transcription) {
          callDetails.push(`\nTranscription:\n${call.transcription}`);
        }
        
        // Add recording indicator
        if (call.recordingUrl) {
          callDetails.push(`\nRecording available`);
        }
        
        const contentText = callDetails.length > 0 
          ? callDetails.join('\n') 
          : 'Call details unavailable';

        return {
          id: `call-${call.id}`,
          type: 'call' as CommunicationType,
          date: call.startTime,
          subject: `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call${call.answered ? '' : ' (Missed)'}`,
          content: contentText,
          createdBy: call.customerName || call.customerPhoneNumber || 'Unknown Caller',
          metadata: {
            direction: call.direction,
            duration: durationSeconds,
            answered: call.answered,
            source: call.source,
            recordingUrl: call.recordingUrl,
            callrail: {
              customerName: call.customerName,
              companyName: call.companyName,
              customerPhoneNumber: call.customerPhoneNumber,
              trackingPhoneNumber: call.trackingPhoneNumber,
              businessPhoneNumber: call.businessPhoneNumber,
              source: call.source,
              medium: call.medium,
              campaign: call.campaign,
              keywords: call.keywords,
              value: call.value,
              note: call.note,
              transcription: call.transcription,
              durationSeconds,
              answered: call.answered,
            },
          },
        };
      });

      setTimeline(prev => {
        const merged = new Map<string, TimelineItem>();
        prev.forEach(item => merged.set(item.id, item));
        callItems.forEach(item => merged.set(item.id, item));
        return Array.from(merged.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      const callCount = typeof result.totalCount === 'number' ? result.totalCount : callItems.length;
      showToast(
        `Found ${callCount} call${callCount === 1 ? '' : 's'}`,
        'success',
        { details: `${callCount} call${callCount === 1 ? '' : 's'} added to timeline` }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast('Call search failed', 'error', { details: errorMessage });
    } finally {
      setLoadingStates(prev => ({ ...prev, calls: false }));
      setCallSyncData(null);
    }
  };

  // Forward email handler
  const handleForwardEmail = async () => {
    if (!forwardEmail || !userEmail) {
      showToast('Unable to forward email', 'error', { details: 'Missing user or email information' });
      return;
    }

    setShowForwardDialog(false);
    showToast('Forwarding email...', 'info', { loading: true, duration: 0 });

    try {
      // Check if we have identifiers available for TRUE forward
      const hasMessageId = Boolean(forwardEmail.metadata?.messageId);
      const hasInternetId = Boolean(forwardEmail.metadata?.internetMessageId);
      const canTrueForward = (hasMessageId || hasInternetId) && Boolean(forwardEmail.metadata?.feeEarnerEmail);
      
      const response = await fetch('/api/forwardEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: userEmail,
          cc: forwardCc.trim() || undefined,
          subject: `Fwd: ${forwardEmail.subject}`,
          body: forwardEmail.contentHtml || forwardEmail.content || '',
          originalDate: forwardEmail.date,
          originalFrom: forwardEmail.createdBy,
          // Include Graph message ID if available for true forward
          messageId: hasMessageId ? forwardEmail.metadata?.messageId : undefined,
          // Include Internet Message ID to allow server-side resolution and mailbox fallback
          internetMessageId: hasInternetId ? forwardEmail.metadata?.internetMessageId : undefined,
          // Provide the owning mailbox whenever we can truly forward
          feeEarnerEmail: canTrueForward ? forwardEmail.metadata?.feeEarnerEmail : undefined,
          mailboxEmail: canTrueForward ? forwardEmail.metadata?.feeEarnerEmail : undefined,
          // Enable debug locally to surface server-side details if fallback occurs
          debug: process.env.NODE_ENV !== 'production' ? true : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      showToast('Email forwarded successfully', 'success');
      setForwardCc('');
      setForwardEmail(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast('Failed to forward email', 'error', { details: errorMessage });
    }
  };

  // Calculate instruction status based on instruction data
  const calculateInstructionStatus = (instruction: any): InstructionStatus => {
    // ID Verification status
    const eidResult = (instruction?.EIDOverallResult)?.toLowerCase() ?? "";
    const eidStatus = (instruction?.EIDStatus)?.toLowerCase() ?? "";
    const poidPassed = eidResult === "passed" || eidResult === "approved" || eidResult === "verified" || eidResult === "pass";
    const proofOfIdComplete = Boolean(instruction?.PassportNumber || instruction?.DriversLicenseNumber);
    const stageComplete = instruction?.Stage === 'proof-of-id-complete' || instruction?.stage === 'proof-of-id-complete';
    
    let verifyIdStatus: 'pending' | 'received' | 'review' | 'complete';
    if (stageComplete) {
      if (eidResult === 'review' || eidResult === 'failed' || eidResult === 'rejected' || eidResult === 'fail') {
        verifyIdStatus = 'review';
      } else if (poidPassed || eidResult === 'passed') {
        verifyIdStatus = 'complete';  
      } else {
        verifyIdStatus = 'review';
      }
    } else if ((!instruction?.electronicIDChecks?.length) || eidStatus === 'pending') {
      verifyIdStatus = proofOfIdComplete ? 'received' : 'pending';
    } else if (poidPassed) {
      verifyIdStatus = 'complete';
    } else {
      verifyIdStatus = 'review';
    }

    // Payment status
    let paymentStatus: 'pending' | 'processing' | 'complete' = 'pending';
    if (instruction?.InternalStatus === 'paid' || instruction?.internalStatus === 'paid') {
      paymentStatus = 'complete';
    } else {
      const paymentData = instruction?.payments || [];
      if (paymentData.length > 0) {
        const latestPayment = paymentData[0];
        if (((latestPayment.payment_status === 'succeeded' || 
             latestPayment.payment_status === 'confirmed' ||
             latestPayment.payment_status === 'requires_capture') && 
            (latestPayment.internal_status === 'completed' || latestPayment.internal_status === 'paid')) ||
            (latestPayment.internal_status === 'completed' || latestPayment.internal_status === 'paid')) {
          paymentStatus = 'complete';
        } else if (latestPayment.payment_status === 'processing') {
          paymentStatus = 'processing';
        }
      }
    }

    // Risk status
    const risk = instruction?.riskAssessments?.[0] || instruction?.compliance?.[0];
    const riskResultRaw = risk?.RiskAssessmentResult?.toString().toLowerCase() ?? "";
    let riskStatus: 'pending' | 'complete' | 'review' = 'pending';
    if (riskResultRaw) {
      riskStatus = ['low', 'low risk', 'pass', 'approved'].includes(riskResultRaw) ? 'complete' : 'review';
    }

    // Matter status
    const matterStatus: 'pending' | 'complete' = (instruction?.MatterId || instruction?.matters?.length > 0) ? 'complete' : 'pending';

    // CCL status
    const cclStatus: 'pending' | 'complete' = instruction?.CCLSubmitted ? 'complete' : 'pending';

    return {
      verifyIdStatus,
      riskStatus,
      matterStatus,
      cclStatus,
      paymentStatus
    };
  };

  useEffect(() => {
    // Do not fetch anything until timeline is unlocked
    if (!timelineUnlocked) return;

    // If we have a cached session snapshot for this enquiry, show it immediately,
    // but still re-fetch in the background to pick up newly generated deals.
    const cached = enquiryTimelineSessionCache.get(enquiry.ID);
    if (cached) {
      setTimeline(cached.timeline);
      setInstructionStatuses(cached.instructionStatuses);
      setSourceProgress(cached.sourceProgress);
      setLoadingStates({ pitches: false, emails: false, calls: false, documents: false });
      setCompletedSources({
        pitches: cached.sourceProgress.pitches.status !== 'loading',
        emails: cached.sourceProgress.emails.status !== 'loading',
      });
      setLoading(false);
      setSelectedItem((prevSelected) => prevSelected ?? (cached.timeline.length > 0 ? cached.timeline[0] : null));
    }

    const fetchTimeline = async (options?: { background?: boolean }) => {
      if (!options?.background) {
        setLoading(true);
        setTimeline([]);
        setSelectedItem(null);
      }
      setLoadingStates({ pitches: true, emails: true, calls: true, documents: true });
      setCompletedSources({ pitches: false, emails: false });
      let progressSnapshot: TimelineSourceProgress = createInitialSourceProgress();
      setSourceProgress(progressSnapshot);

      let timelineSnapshot: TimelineItem[] = [];

      const updateSourceProgress = (key: TimelineSourceKey, next: { status: TimelineSourceStatus; count: number }) => {
        progressSnapshot = {
          ...progressSnapshot,
          [key]: next,
        };
        setSourceProgress(progressSnapshot);
      };

      let hasShownAnyItems = false;
      const mergeTimelineItems = (items: TimelineItem[]) => {
        if (!Array.isArray(items) || items.length === 0) return;

        setTimeline((prev) => {
          const byId = new Map<string, TimelineItem>();
          for (const item of prev) byId.set(item.id, item);
          for (const item of items) byId.set(item.id, item);
          const next = Array.from(byId.values());
          next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          timelineSnapshot = next;
          return next;
        });

        if (!hasShownAnyItems) {
          hasShownAnyItems = true;
          setLoading(false);
        }
      };

      const statusMap: {[pitchId: string]: InstructionStatus} = {};

      // ─── SYNTHETIC DATA FOR DEV PREVIEW TEST RECORD ──────────────────────────
      // Inject comprehensive test data to preview all timeline features
      // This block returns early to skip all API fetches for the test record
      if (enquiry.ID === 'DEV-PREVIEW-99999') {
        const now = new Date();
        const timelineItems: TimelineItem[] = [];
        
        // Synthetic pitch with instruction status
        const testPitchId = 'pitch-dev-0';
        timelineItems.push({
          id: testPitchId,
          type: 'pitch',
          date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          subject: 'Test Pitch Email Subject',
          content: 'Dear Test Client,\n\nThis is a test pitch email for development preview.\n\nKind regards,\nLukasz Zemanek',
          createdBy: 'Lukasz Zemanek',
          metadata: {
            amount: 1500,
            status: 'sent',
            scenarioId: 'before-call-call'
          }
        });
        statusMap[testPitchId] = {
          verifyIdStatus: 'received',
          riskStatus: 'pending',
          matterStatus: 'pending',
          cclStatus: 'pending',
          paymentStatus: 'pending'
        };

        // Synthetic emails
        timelineItems.push({
          id: 'email-dev-1',
          type: 'email',
          date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          subject: 'Re: Demo Enquiry - Helix Law',
          content: 'Test inbound email content.',
          createdBy: 'Test Client',
          metadata: {
            direction: 'inbound',
            messageId: 'dev-msg-1',
            feeEarnerEmail: 'lz@helix-law.com',
          }
        });
        timelineItems.push({
          id: 'email-dev-2',
          type: 'email',
          date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          subject: 'Demo Enquiry - Helix Law',
          content: 'Test outbound email content.',
          createdBy: 'Lukasz Zemanek',
          metadata: {
            direction: 'outbound',
            messageId: 'dev-msg-2',
            feeEarnerEmail: 'lz@helix-law.com',
          }
        });

        // Synthetic call
        timelineItems.push({
          id: 'call-dev-1',
          type: 'call',
          date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          subject: 'Inbound Call',
          content: 'Test call notes for development preview.',
          createdBy: 'Test Client',
          metadata: {
            duration: 1125, // 18:45 in seconds
            direction: 'inbound',
            recordingUrl: undefined,
          }
        });

        // Synthetic documents (previewable via local demo-documents endpoint)
        timelineItems.push({
          id: 'document-dev-doc-1',
          type: 'document',
          date: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
          subject: 'Demo_Document_1.pdf',
          content: 'Demo document (previewable)',
          createdBy: 'Test Client',
          metadata: {
            documentType: 'Contract',
            filename: 'Demo_Document_1.pdf',
            fileSize: 245678,
            contentType: 'application/pdf',
            blobUrl: '/api/demo-documents/Demo_Document_1.pdf',
            stageUploaded: 'enquiry',
          }
        });
        timelineItems.push({
          id: 'document-dev-doc-2',
          type: 'document',
          date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          subject: 'Demo_Document_2.pdf',
          content: 'Second demo document (previewable)',
          createdBy: 'Test Client',
          metadata: {
            documentType: 'Correspondence',
            filename: 'Demo_Document_2.pdf',
            fileSize: 128456,
            contentType: 'application/pdf',
            blobUrl: '/api/demo-documents/Demo_Document_2.pdf',
            stageUploaded: 'enquiry',
          }
        });
        timelineItems.push({
          id: 'document-dev-doc-3',
          type: 'document',
          date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          subject: 'Demo_ID_Document.jpg',
          content: 'Demo ID document (previewable)',
          createdBy: 'Test Client',
          metadata: {
            documentType: 'ID Verification',
            filename: 'Demo_ID_Document.jpg',
            fileSize: 1567890,
            contentType: 'image/jpeg',
            blobUrl: '/api/demo-documents/Demo_ID_Document.jpg',
            stageUploaded: 'instruction',
          }
        });

        // Sort and finalize synthetic data
        timelineItems.sort((a: TimelineItem, b: TimelineItem) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setTimeline((prev) => {
          const prevWorkspace = prev.find((t) => t.type === 'document' && Boolean(t.metadata?.isDocWorkspace));
          const next = [...timelineItems];
          if (prevWorkspace && !next.some((t) => t.id === prevWorkspace.id)) {
            next.unshift(prevWorkspace);
          }
          next.sort((a: TimelineItem, b: TimelineItem) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return next;
        });
        setInstructionStatuses(statusMap);
        setLoadingStates({ pitches: false, emails: false, calls: false, documents: false });
        setCompletedSources({ pitches: true, emails: true });
        setSelectedItem((prevSelected) => prevSelected ?? (timelineItems.length > 0 ? timelineItems[0] : null));
        setLoading(false);
        return; // Skip all API fetches for test record
      }
      // ─── END SYNTHETIC DATA ──────────────────────────────────────────────────

      // Fetch pitches
      try {
        const pitchesRes = await fetch(`/api/pitches/${enquiry.ID}?_ts=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (pitchesRes.ok) {
          const pitchesData = await pitchesRes.json();
          const pitches = pitchesData.pitches || [];

          const pitchItems: TimelineItem[] = [];
          
          // For each pitch, derive lightweight instruction/deal status from the pitch payload.
          for (let index = 0; index < pitches.length; index++) {
            const pitch = pitches[index];
            
            // Distinguish between full pitch (with email) and link-enabled-only (deal created without email)
            const hasEmailContent = !!(pitch.EmailSubject?.trim() || pitch.EmailBody?.trim());
            const rawDealStatus = String(pitch.DealStatus || '').trim().toUpperCase();
            const isLinkOnlyStatus = rawDealStatus === 'CHECKOUT_LINK';
            const itemType: CommunicationType = 'pitch';
            const dealOrigin: 'email' | 'link' = hasEmailContent ? 'email' : 'link';
            const dealOriginLabel = hasEmailContent ? 'Pitch email' : (isLinkOnlyStatus ? 'Checkout link' : 'Link enabled');
            const serviceDescription = String(pitch.ServiceDescription || '').trim();
            const dealSubject = serviceDescription ? `Deal captured – ${serviceDescription}` : 'Deal captured';
            
            const pitchId = `pitch-${index}`;
            pitchItems.push({
              id: pitchId,
              type: itemType,
              date: pitch.CreatedAt,
              subject: dealSubject,
              content: pitch.EmailBody,
              contentHtml: pitch.EmailBodyHtml,
              createdBy: pitch.CreatedBy || 'Unknown',
              metadata: {
                amount: pitch.Amount,
                status: hasEmailContent ? 'sent' : (isLinkOnlyStatus ? 'checkout-link' : 'link-enabled'),
                scenarioId: pitch.ScenarioId,
                dealOrigin,
                dealOriginLabel,
                dealEmailSubject: hasEmailContent ? (pitch.EmailSubject || null) : null,
                dealPasscode: pitch.Passcode || null,
                dealServiceDescription: serviceDescription || undefined,
              }
            });

            // If the pitch payload includes instruction-stage info (from server-side joins),
            // translate it into the legacy chip status model.
            const instructionStage = String(pitch?.InstructionStage ?? '').trim();
            const instructionInternalStatus = String(pitch?.InstructionInternalStatus ?? pitch?.InternalStatus ?? '').trim();

            // Always provide at least a baseline (pending) status so the chips render.
            // When the pitch includes instruction-stage/internalStatus, the same helper
            // will mark the appropriate stages as progressed.
            try {
              statusMap[pitchId] = calculateInstructionStatus({
                Stage: instructionStage || undefined,
                InternalStatus: instructionInternalStatus || undefined,
              });
            } catch {
              // Best-effort only; leave unset if something unexpected arrives.
            }
          }

          mergeTimelineItems(pitchItems);
          updateSourceProgress('pitches', { status: 'done', count: pitchItems.length });
        } else {
          updateSourceProgress('pitches', { status: 'error', count: 0 });
        }
        setLoadingStates(prev => ({ ...prev, pitches: false }));
        setCompletedSources(prev => ({ ...prev, pitches: true }));
      } catch (error) {
        console.error('Failed to fetch pitches:', error);
        updateSourceProgress('pitches', { status: 'error', count: 0 });
        setLoadingStates(prev => ({ ...prev, pitches: false }));
        setCompletedSources(prev => ({ ...prev, pitches: true }));
      }

      setInstructionStatuses(statusMap);

      // Auto-fetch emails on entry like pitches
      try {
        const pointOfContact = enquiry.Point_of_Contact || '';
        const prospectEmail = enquiry.Email || '';
        
        // Check if we have the required data
        if (pointOfContact && prospectEmail) {
          let feeEarnerEmail = pointOfContact;
          if (!pointOfContact.includes('@')) {
            feeEarnerEmail = `${pointOfContact.toLowerCase().replace(/\s+/g, '.')}@helix-law.com`;
          }

          const response = await fetch('/api/searchInbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              feeEarnerEmail,
              prospectEmail,
              maxResults: 50,
            }),
          });

          if (response.ok) {
            const result = await response.json();

            const emailItems: TimelineItem[] = result.emails.map((email: any) => ({
              id: `email-${email.id}`,
              type: 'email' as CommunicationType,
              date: email.receivedDateTime,
              subject: email.subject,
              contentHtml: email.bodyHtml || undefined,
              content: (email.bodyText || email.bodyPreview) || '',
              createdBy: email.fromName || email.from,
              metadata: {
                direction: email.from.toLowerCase() === prospectEmail.toLowerCase() ? 'inbound' : 'outbound',
                // Store identifiers to enable TRUE forward directly from auto-fetch results
                messageId: email.id,
                feeEarnerEmail: feeEarnerEmail,
                internetMessageId: email.internetMessageId || undefined,
              },
            }));

            mergeTimelineItems(emailItems);
            updateSourceProgress('emails', { status: 'done', count: emailItems.length });
          } else {
            console.error('Failed to auto-fetch emails:', response.status);
            updateSourceProgress('emails', { status: 'error', count: 0 });
          }
        } else {
          // No data to query emails; treat as a completed step.
          updateSourceProgress('emails', { status: 'done', count: 0 });
        }
        setLoadingStates(prev => ({ ...prev, emails: false }));
        setCompletedSources(prev => ({ ...prev, emails: true }));
      } catch (error) {
        console.error('Failed to auto-fetch emails:', error);
        updateSourceProgress('emails', { status: 'error', count: 0 });
        setLoadingStates(prev => ({ ...prev, emails: false }));
        setCompletedSources(prev => ({ ...prev, emails: true }));
      }

      // Auto-fetch CallRail calls by phone number
      try {
        const phoneNumber = enquiry.Phone_Number || '';
        
        if (phoneNumber) {
          const response = await fetch('/api/callrailCalls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phoneNumber,
              maxResults: 50,
            }),
          });

          if (response.ok) {
            const result = await response.json();

            const callItems: TimelineItem[] = result.calls.map((call: any) => {
              const durationSeconds = Number(call.duration || 0);
              const minutes = Math.floor(durationSeconds / 60);
              const seconds = (durationSeconds % 60).toString().padStart(2, '0');
              
              // Build detailed call information
              const callDetails: string[] = [];
              
              // Basic call info
              if (durationSeconds) {
                callDetails.push(`Duration: ${minutes}:${seconds}`);
              }
              if (call.answered !== undefined) {
                callDetails.push(call.answered ? 'Answered' : 'Unanswered');
              }
              
              // Contact information
              if (call.customerName && call.customerName !== 'Unknown Caller') {
                callDetails.push(`Contact: ${call.customerName}`);
              }
              if (call.companyName) {
                callDetails.push(`Company: ${call.companyName}`);
              }
              if (call.customerPhoneNumber) {
                callDetails.push(`Phone: ${call.customerPhoneNumber}`);
              }
              
              // Marketing attribution
              if (call.source && call.source !== 'Unknown') {
                callDetails.push(`Source: ${call.source}`);
              }
              if (call.keywords) {
                callDetails.push(`Keywords: ${call.keywords}`);
              }
              if (call.campaign) {
                callDetails.push(`Campaign: ${call.campaign}`);
              }
              if (call.medium) {
                callDetails.push(`Medium: ${call.medium}`);
              }
              
              // Call value
              if (call.value) {
                callDetails.push(`Value: £${call.value}`);
              }
              
              // Technical details
              if (call.trackingPhoneNumber) {
                callDetails.push(`Tracking Number: ${call.trackingPhoneNumber}`);
              }
              if (call.businessPhoneNumber) {
                callDetails.push(`Business Number: ${call.businessPhoneNumber}`);
              }
              
              // Add note if exists
              if (call.note) {
                callDetails.push(`\nNote: ${call.note}`);
              }
              
              // Add transcription if exists
              if (call.transcription) {
                callDetails.push(`\nTranscription:\n${call.transcription}`);
              }
              
              // Add recording indicator
              if (call.recordingUrl) {
                callDetails.push(`\nRecording available`);
              }
              
              const contentText = callDetails.length > 0 
                ? callDetails.join('\n') 
                : 'Call details unavailable';

              return {
                id: `call-${call.id}`,
                type: 'call' as CommunicationType,
                date: call.startTime,
                subject: `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call${call.answered ? '' : ' (Missed)'}`,
                content: contentText,
                createdBy: call.customerName || call.customerPhoneNumber || 'Unknown Caller',
                metadata: {
                  direction: call.direction,
                  duration: durationSeconds,
                  answered: call.answered,
                  source: call.source,
                  recordingUrl: call.recordingUrl,
                },
              };
            });

            mergeTimelineItems(callItems);
            updateSourceProgress('calls', { status: 'done', count: callItems.length });
          } else {
            console.error('Failed to auto-fetch CallRail calls:', response.status);
            updateSourceProgress('calls', { status: 'error', count: 0 });
          }
        } else {
          // No phone to query calls; treat as a completed step.
          updateSourceProgress('calls', { status: 'done', count: 0 });
        }
        setLoadingStates(prev => ({ ...prev, calls: false }));
      } catch (error) {
        console.error('Failed to auto-fetch CallRail calls:', error);
        updateSourceProgress('calls', { status: 'error', count: 0 });
        setLoadingStates(prev => ({ ...prev, calls: false }));
      }

      // Fetch prospect documents via tab-app backend (storage-backed)
      try {
        const pitchEnquiryId = resolvePitchEnquiryId(enquiry);
        if (!pitchEnquiryId) {
          updateSourceProgress('documents', { status: 'done', count: 0 });
          setLoadingStates(prev => ({ ...prev, documents: false }));
        } else {
        // Use AbortController with timeout to avoid long waits if backend is unreachable
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const docsRes = await fetch(`/api/doc-workspace/documents?enquiry_id=${pitchEnquiryId}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (docsRes.ok) {
          const docsData = await docsRes.json();
          const documents = Array.isArray(docsData?.documents) ? docsData.documents : [];
          const folders = Array.isArray(docsData?.folders) ? docsData.folders.filter((f: unknown) => typeof f === 'string') : [];
        
          const docItems: TimelineItem[] = documents.map((doc: any) => ({
            id: `document-${String(doc?.id ?? doc?.blob_name ?? doc?.blob_url ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(-200) || String(Math.random()).slice(2)}`,
            type: 'document' as CommunicationType,
            date: doc.uploaded_at,
            subject: doc.original_filename || 'Document',
            content: doc.notes || undefined,
            createdBy: doc.uploaded_by || 'Unknown',
            metadata: {
              documentType: doc.document_type,
              filename: doc.original_filename,
              fileSize: doc.file_size,
              contentType: doc.content_type,
              blobUrl: doc.blob_url,
              blobName: typeof doc.blob_name === 'string' ? doc.blob_name : (typeof doc.id === 'string' ? doc.id : undefined),
              stageUploaded: doc.stage_uploaded,
              documentId: doc.id,
            }
          }));

          mergeTimelineItems(docItems);

          if (folders.length > 0) {
            setTimeline((prev) => prev.map((t) => {
              if (!t.metadata?.isDocWorkspace) return t;
              return {
                ...t,
                metadata: {
                  ...t.metadata,
                  workspaceFolders: folders,
                },
              };
            }));
          }
          updateSourceProgress('documents', { status: 'done', count: docItems.length });
        } else {
          updateSourceProgress('documents', { status: 'error', count: 0 });
        }
        setLoadingStates(prev => ({ ...prev, documents: false }));
        }
      } catch (error) {
        // Silently handle - pitch backend may be unavailable in local dev
        if (process.env.NODE_ENV === 'development') {
          console.debug('Prospect documents unavailable (pitch backend not reachable)');
        }
        updateSourceProgress('documents', { status: 'error', count: 0 });
        setLoadingStates(prev => ({ ...prev, documents: false }));
      }

      // Ensure the loading cue clears even if no items were found.
      setLoading(false);

      // Cache the result for this enquiry for the duration of the session.
      enquiryTimelineSessionCache.set(enquiry.ID, {
        enquiryId: enquiry.ID,
        timeline: timelineSnapshot,
        instructionStatuses: statusMap,
        sourceProgress: progressSnapshot,
        cachedAt: Date.now(),
      });
    };

    fetchTimeline({ background: Boolean(cached) });
  }, [enquiry.ID, timelineUnlocked]);

  // Auto-select the first item only on initial timeline load (not when user collapses).
  const hasAutoSelectedRef = React.useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedRef.current && timeline.length > 0) {
      setSelectedItem(timeline[0]);
      hasAutoSelectedRef.current = true;
    }
  }, [timeline]);

  // Reset auto-select flag when enquiry changes.
  useEffect(() => {
    hasAutoSelectedRef.current = false;
  }, [enquiry.ID]);

  // Handle deep link scroll-to from Home page To Do actions
  useEffect(() => {
    const scrollTarget = sessionStorage.getItem('scrollToTimelineItem');
    if (scrollTarget && timeline.length > 0) {
      sessionStorage.removeItem('scrollToTimelineItem');
      
      // Find the target item (e.g., 'doc-workspace' for document workspace)
      if (scrollTarget === 'doc-workspace') {
        const docWorkspaceItem = timeline.find(
          (item) => item.type === 'document' && item.metadata?.isDocWorkspace
        );
        if (docWorkspaceItem) {
          setSelectedItem(docWorkspaceItem);
          // Scroll to the item after a brief delay for render
          setTimeout(() => {
            const el = document.getElementById(`timeline-item-${docWorkspaceItem.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      } else {
        // Generic scroll to item by ID
        const targetItem = timeline.find((item) => item.id === scrollTarget);
        if (targetItem) {
          setSelectedItem(targetItem);
          setTimeout(() => {
            const el = document.getElementById(`timeline-item-${targetItem.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      }
    }
  }, [timeline, enquiry.ID]);

  const getTypeIcon = (type: CommunicationType) => {
    switch (type) {
      case 'pitch':
        return <FaEnvelope />;
      case 'link-enabled':
        return <FaLink />;
      case 'email':
        return <FaEnvelope />;
      case 'call':
        return <FaPhone />;
      case 'instruction':
        return <FaFileAlt />;
      case 'document':
        return <FaFileAlt />;
      case 'note':
        return <FaCircle />;
      default:
        return <FaCircle />;
    }
  };

  const getTypeColor = (type: CommunicationType) => {
    switch (type) {
      case 'call':
        return '#f59e0b'; // Amber/Orange - matches activity icon
      case 'pitch':
        return '#22c55e'; // Green - matches activity icon
      case 'link-enabled':
        return '#22c55e'; // Treat as deal
      case 'email':
        return colours.highlight; // Blue - matches activity icon
      case 'instruction':
        return '#10b981'; // Emerald - matches activity icon
      case 'document':
        return colours.accent; // Helix teal - on brand
      case 'note':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  // Status-based colors for action required vs complete
  const statusColors = {
    complete: isDarkMode ? 'rgb(34, 197, 94)' : 'rgb(22, 163, 74)', // green
    actionRequired: isDarkMode ? 'rgb(251, 191, 36)' : 'rgb(217, 119, 6)', // amber
  };

  // Helper to compute holding doc count for action required status
  const computeHoldingDocCount = (allItems: TimelineItem[]) => {
    return allItems
      .filter((t) => t.type === 'document' && !t.metadata?.isDocWorkspace)
      .filter((doc) => {
        const blobName = doc.metadata?.blobName;
        if (typeof blobName !== 'string') return false;
        return blobName.includes('/Holding/');
      }).length;
  };

  const getTypeLabel = (type: CommunicationType) => {
    switch (type) {
      case 'pitch':
        return 'Deal';
      case 'link-enabled':
        return 'Deal';
      case 'email':
        return 'Email';
      case 'call':
        return 'Call';
      case 'instruction':
        return 'Instruction';
      case 'document':
        return 'Document';
      case 'note':
        return 'Note';
      default:
        return 'Activity';
    }
  };

  const isDocRequestPitch = (item: TimelineItem) => item.type === 'document' && item.metadata?.isDocWorkspace;
  const getItemTypeLabel = (item: TimelineItem) => (isDocRequestPitch(item) ? 'Doc Request' : getTypeLabel(item.type));
  const getItemTypeIcon = (item: TimelineItem) => (isDocRequestPitch(item) ? <FaLink /> : getTypeIcon(item.type));
  const getItemTypeColor = (item: TimelineItem) => (isDocRequestPitch(item) ? '#a855f7' : getTypeColor(item.type));

  const quickAccessTypes: CommunicationType[] = ['document', 'email', 'call', 'pitch', 'instruction'];
  const getQuickAccessCount = (type: CommunicationType) => timeline.filter((item) => item.type === type).length;
  const quickAccessItems = activeFilters.length > 0
    ? timeline.filter((item) => activeFilters.includes(item.type))
    : [];
  const selectedQuickAccessTypes = quickAccessTypes.filter((t) => activeFilters.includes(t));

  const isDocumentFilterActive = activeFilters.includes('document');
  const workspaceTimelineItem = timeline.find((t) => t.type === 'document' && Boolean(t.metadata?.isDocWorkspace));
  const quickAccessItemsWithoutWorkspace = quickAccessItems.filter((t) => !t.metadata?.isDocWorkspace);

  const quickAccessEmailIds = quickAccessItems.filter((item) => item.type === 'email').map((item) => item.id);
  const areAnyQuickAccessEmailsExpanded = quickAccessEmailIds.some((id) => expandedQuickAccessEmailIds.has(id));
  const areAllQuickAccessEmailsExpanded = quickAccessEmailIds.length > 0 && quickAccessEmailIds.every((id) => expandedQuickAccessEmailIds.has(id));

  useEffect(() => {
    // Quick Access is derived from filters; default to collapsed when the view changes.
    setExpandedQuickAccessEmailIds(new Set());
  }, [activeFilters]);

  const toggleActiveFilter = (type: CommunicationType) => {
    setActiveFilters((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      return [...prev, type];
    });
  };

  const getDocumentFilename = (item: TimelineItem): string => {
    return (
      item.metadata?.filename ||
      item.subject ||
      'Document'
    );
  };

  const getDocumentDownloadHref = (item: TimelineItem): string | null => {
    const blobUrl = item.metadata?.blobUrl;
    if (!blobUrl || typeof blobUrl !== 'string') return null;

    const filename = getDocumentFilename(item);
    // Same-origin demo/local URLs can be used directly.
    if (blobUrl.startsWith('/')) return blobUrl;

    // For Azure blob URLs (often SAS), route via our proxy to force attachment.
    if (blobUrl.startsWith('http')) {
      return `/api/prospect-documents/proxy?url=${encodeURIComponent(blobUrl)}&filename=${encodeURIComponent(filename)}&download=true`;
    }

    return null;
  };

  const formatDocDate = (dateStr: string): string => {
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const openTimelineItem = (item: TimelineItem) => {
    setSelectedItem(item);
    // Best-effort scroll to the matching timeline entry.
    requestAnimationFrame(() => {
      const el = window.document.getElementById(`timeline-item-${item.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  const getScenarioName = (scenarioId?: string) => {
    if (!scenarioId) return null;
    
    const scenarios: { [key: string]: string } = {
      'before-call-call': 'Before call — Call',
      'before-call-no-call': 'Before call — No call',
      'after-call-probably-cant-assist': 'After call — Cannot assist',
      'after-call-want-instruction': 'After call — Want instruction',
      'cfa': 'CFA'
    };
    
    return scenarios[scenarioId] || scenarioId;
  };

  // Render instruction status indicators for pitches
  const renderInstructionStatus = (itemId: string) => {
    const status = instructionStatuses[itemId];

    if (!status) return null;

    const activeStatus = status;

    const statusItems = [
      { 
        key: 'id', 
        label: 'Identity', 
        status: activeStatus.verifyIdStatus, 
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="9" cy="10" r="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M7 16c0-1.5 1-2 2-2s2 .5 2 2" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )
      },
      { 
        key: 'payment', 
        label: 'Payment', 
        status: activeStatus.paymentStatus, 
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="5" width="22" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
            <line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )
      },
      { 
        key: 'risk', 
        label: 'Risk', 
        status: activeStatus.riskStatus, 
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )
      },
      { 
        key: 'matter', 
        label: 'Matter', 
        status: activeStatus.matterStatus, 
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )
      },
      { 
        key: 'ccl', 
        label: 'CCL', 
        status: activeStatus.cclStatus, 
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
            <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
            <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2"/>
            <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )
      }
    ];

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'complete':
          return isDarkMode ? '#10b981' : '#059669'; // green
        case 'processing':
        case 'received':
          return isDarkMode ? '#f59e0b' : '#d97706'; // amber
        case 'review':
          return isDarkMode ? '#ef4444' : '#dc2626'; // red
        case 'pending':
        default:
          return isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.6)'; // muted
      }
    };

    const getStatusLabel = (status: string) => {
      switch (status) {
        case 'complete':
          return 'Complete';
        case 'processing':
          return 'Processing';
        case 'review':
          return 'Review';
        case 'received':
          return 'Received';
        case 'pending':
        default:
          return 'Pending';
      }
    };

    return (
      <div style={{
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'}`,
      }}>
        <div style={{
          display: 'flex',
          gap: '1px',
          borderRadius: '6px',
          overflow: 'hidden',
          background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
        }}>
          {statusItems.map((item, index) => {
            const statusColor = getStatusColor(item.status);
            const isComplete = item.status === 'complete';
            const isActive = item.status !== 'pending';
            
            return (
              <div key={item.key} style={{
                flex: 1,
                padding: '8px 6px',
                background: isDarkMode ? 'rgba(7, 16, 32, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                position: 'relative',
                transition: 'all 0.2s ease',
                ...(isActive && {
                  background: isDarkMode ? 'rgba(7, 16, 32, 0.95)' : 'rgba(255, 255, 255, 1)',
                }),
              }}>
                {/* Status indicator dot */}
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: statusColor,
                  opacity: isActive ? 1 : 0.3,
                  transition: 'all 0.2s ease',
                }} />
                
                {/* Icon */}
                <div style={{
                  color: statusColor,
                  opacity: isActive ? 1 : 0.4,
                  transition: 'all 0.2s ease',
                }}>
                  {item.icon}
                </div>
                
                {/* Label */}
                <span style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  color: isDarkMode 
                    ? (isActive ? 'rgba(226, 232, 240, 0.9)' : 'rgba(148, 163, 184, 0.5)')
                    : (isActive ? 'rgba(15, 23, 42, 0.8)' : 'rgba(148, 163, 184, 0.6)'),
                  textAlign: 'center',
                  lineHeight: 1,
                  transition: 'all 0.2s ease',
                }}>
                  {item.label}
                </span>
                
                {/* Status text */}
                <span style={{
                  fontSize: '7px',
                  fontWeight: 500,
                  color: statusColor,
                  textAlign: 'center',
                  lineHeight: 1,
                  opacity: isActive ? 0.8 : 0.4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  transition: 'all 0.2s ease',
                }}>
                  {getStatusLabel(item.status)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getTotalCommunications = () => timeline.length;
  const getDaysSinceFirstContact = () => {
    if (timeline.length === 0) return 0;
    const sorted = [...timeline].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return differenceInDays(new Date(), parseISO(sorted[0].date));
  };

  const pitchCount = useMemo(() => timeline.reduce((acc, item) => acc + (item.type === 'pitch' ? 1 : 0), 0), [timeline]);

  // Pitch confirmation and scenario picker modal
  const renderPitchConfirmModal = () => {
    if (!showPitchConfirm) return null;

    const existingPitches = timeline.filter((t) => t.type === 'pitch');
    
    return createPortal(
      <div
        onClick={() => setShowPitchConfirm(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: isDarkMode ? 'rgb(17, 24, 39)' : 'white',
            borderRadius: '8px',
            padding: '28px',
            maxWidth: '700px',
            width: '100%',
            boxShadow: isDarkMode 
              ? '0 20px 60px rgba(0, 0, 0, 0.6)'
              : '0 20px 60px rgba(0, 0, 0, 0.15)',
            border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.15)'}`,
          }}
        >
          {/* Existing pitches info */}
          {existingPitches.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                color: isDarkMode ? 'rgb(249, 250, 251)' : colours.light.text,
                marginBottom: '14px',
              }}>
                {existingPitches.length} {existingPitches.length === 1 ? 'pitch exists' : 'pitches exist'}
              </h3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '16px',
              }}>
                {existingPitches.map((pitch) => {
                  const scenarioName = getScenarioName(pitch.metadata?.scenarioId) || 'Unknown scenario';
                  const amount = pitch.metadata?.amount;
                  const createdBy = pitch.createdBy || 'Unknown';
                  const date = pitch.date ? new Date(pitch.date).toLocaleDateString('en-GB', { 
                    day: 'numeric', 
                    month: 'short', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'Unknown date';

                  return (
                    <div
                      key={pitch.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: '6px',
                        background: isDarkMode 
                          ? 'linear-gradient(135deg, rgba(11, 22, 43, 0.88) 0%, rgba(13, 30, 56, 0.8) 100%)'
                          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.92) 0%, rgba(255, 255, 255, 0.88) 100%)',
                        border: `2px solid ${colours.blue}`,
                        boxShadow: isDarkMode 
                          ? '0 6px 18px rgba(4, 9, 20, 0.55)' 
                          : '0 3px 12px rgba(13, 47, 96, 0.08)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: colours.blue,
                          marginBottom: '6px',
                        }}>
                          {scenarioName}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        }}>
                          <span>{createdBy}</span>
                          <span>•</span>
                          <span>{date}</span>
                          {amount && Number(amount) > 0 && (
                            <>
                              <span>•</span>
                              <span style={{ 
                                color: isDarkMode ? colours.accent : colours.darkBlue,
                                fontWeight: 500 
                              }}>
                                £{Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.7)',
                lineHeight: 1.5,
              }}>
                Are you sure you want to pitch again?
              </p>
            </div>
          )}

          {/* Scenario picker */}
          <div>
            <h4 style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: 600,
              color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.7)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Select scenario
            </h4>
            <div style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              marginBottom: '20px',
            }}>
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => handleScenarioSelected(scenario.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colours.blue;
                    e.currentTarget.style.boxShadow = isDarkMode
                      ? '0 6px 24px rgba(54, 144, 206, 0.35), 0 0 0 1px rgba(54, 144, 206, 0.2) inset'
                      : '0 4px 16px rgba(54, 144, 206, 0.2), 0 0 0 1px rgba(54, 144, 206, 0.1) inset';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.16)';
                    e.currentTarget.style.boxShadow = isDarkMode ? '0 6px 18px rgba(4, 9, 20, 0.55)' : '0 3px 12px rgba(13, 47, 96, 0.08)';
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '12px 18px',
                    border: `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.16)'}`,
                    borderRadius: '10px',
                    background: isDarkMode 
                      ? 'linear-gradient(135deg, rgba(11, 22, 43, 0.88) 0%, rgba(13, 30, 56, 0.8) 100%)'
                      : 'linear-gradient(135deg, rgba(248, 250, 252, 0.92) 0%, rgba(255, 255, 255, 0.88) 100%)',
                    color: isDarkMode ? 'rgb(249, 250, 251)' : colours.light.text,
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    whiteSpace: 'nowrap',
                    boxShadow: isDarkMode ? '0 6px 18px rgba(4, 9, 20, 0.55)' : '0 3px 12px rgba(13, 47, 96, 0.08)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {scenario.name}
                </button>
              ))}
            </div>
          </div>

          {/* Cancel button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              onClick={() => setShowPitchConfirm(false)}
              style={{
                padding: '8px 16px',
                border: `1px solid ${isDarkMode ? 'rgba(156, 163, 175, 0.3)' : 'rgba(15, 23, 42, 0.2)'}`,
                borderRadius: '4px',
                background: 'transparent',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // Do not block the page behind a global loader; render the container and let
  // dataset-level spinners indicate progress as data arrives.

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      fontFamily: 'Raleway, sans-serif',
      padding: '0 16px',
      gap: '12px',
    }}>
      {/* Compact Header Bar */}
      <div style={{
        background: isDarkMode 
          ? 'rgba(15, 23, 42, 0.6)'
          : 'rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.15)'}`,
        padding: '12px 16px',
        marginTop: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        {/* Left: Client Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            background: isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDarkMode ? '#7DD3FC' : '#3690CE',
          }}>
            <FaUser size={16} />
          </div>
          <div>
            <div style={{
              fontSize: '16px',
              fontWeight: 700,
              color: isDarkMode ? 'rgb(249, 250, 251)' : colours.light.text,
              lineHeight: 1.2,
            }}>
              {enquiry.First_Name && enquiry.Last_Name 
                ? `${enquiry.First_Name} ${enquiry.Last_Name}`
                : enquiry.First_Name || enquiry.Last_Name || 'Unknown'}
            </div>
            <div style={{
              fontSize: '12px',
              color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)',
              marginTop: '2px',
            }}>
              {enquiry.ID} • {enquiry.Email || enquiry.Point_of_Contact || '—'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Contact icons - compact */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => enquiry.Email && copyToClipboard(enquiry.Email, 'Email')}
              disabled={!enquiry.Email}
              title={enquiry.Email ? `Copy email: ${enquiry.Email}` : 'No email'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                border: 'none',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                color: isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(51, 65, 85, 0.7)',
                cursor: enquiry.Email ? 'pointer' : 'default',
                opacity: enquiry.Email ? 1 : 0.4,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (enquiry.Email) {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)';
                  e.currentTarget.style.color = isDarkMode ? 'rgb(200, 210, 220)' : 'rgba(51, 65, 85, 0.9)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                e.currentTarget.style.color = isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(51, 65, 85, 0.7)';
              }}
            >
              <FaEnvelope size={14} />
            </button>
            <button
              onClick={() => enquiry.Phone_Number && copyToClipboard(enquiry.Phone_Number, 'Phone')}
              disabled={!enquiry.Phone_Number}
              title={enquiry.Phone_Number ? `Copy phone: ${enquiry.Phone_Number}` : 'No phone'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                border: 'none',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                color: isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(51, 65, 85, 0.7)',
                cursor: enquiry.Phone_Number ? 'pointer' : 'default',
                opacity: enquiry.Phone_Number ? 1 : 0.4,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (enquiry.Phone_Number) {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)';
                  e.currentTarget.style.color = isDarkMode ? 'rgb(200, 210, 220)' : 'rgba(51, 65, 85, 0.9)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                e.currentTarget.style.color = isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(51, 65, 85, 0.7)';
              }}
            >
              <FaPhone size={14} />
            </button>
          </div>

          {/* Separator */}
          <div style={{ width: '1px', height: '20px', background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)' }} />

          {/* Primary actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={openPitchBuilder}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(125, 211, 252, 0.18)' : 'rgba(54, 144, 206, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.06)';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.06)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                cursor: 'pointer',
                color: isDarkMode ? '#7DD3FC' : '#3690CE',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'background 0.15s',
              }}
            >
              <FaCheckCircle size={12} />
              <span>Pitch</span>
              {pitchCount > 0 && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '0 5px',
                  borderRadius: '8px',
                  background: isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(54, 144, 206, 0.12)',
                  color: isDarkMode ? '#7DD3FC' : '#3690CE',
                  lineHeight: '16px',
                }}>
                  {pitchCount}
                </span>
              )}
            </button>

            {(() => {
              const existingWorkspace = timeline.find((t) => t.type === 'document' && Boolean(t.metadata?.isDocWorkspace));
              const hasPasscode = Boolean(existingWorkspace?.metadata?.workspacePasscode);
              const hasUrl = Boolean(existingWorkspace?.metadata?.workspaceUrlPath);
              const isWorkspaceLinkReady = hasPasscode && hasUrl;
              const expiresAt = existingWorkspace?.metadata?.workspaceExpiresAt;
              const isWorkspaceExpired = isWorkspaceLinkReady && isExpiredIso(expiresAt);
              const isWorkspaceLive = isWorkspaceLinkReady && !isWorkspaceExpired;

              const isDisabled = docRequestLoading || !requestDocsEnabled;

              const label = (() => {
                if (!isWorkspaceLinkReady) return 'Request Docs';
                if (isWorkspaceExpired) return 'Expired';
                return 'Workspace';
              })();

              // Determine colours based on state
              const getColours = () => {
                if (isWorkspaceLive) {
                  return {
                    bg: isDarkMode ? 'rgba(74, 222, 128, 0.1)' : 'rgba(34, 197, 94, 0.08)',
                    hoverBg: isDarkMode ? 'rgba(74, 222, 128, 0.18)' : 'rgba(34, 197, 94, 0.14)',
                    text: isDarkMode ? '#4ADE80' : '#16A34A',
                  };
                }
                if (isWorkspaceExpired) {
                  return {
                    bg: isDarkMode ? 'rgba(251, 146, 60, 0.1)' : 'rgba(249, 115, 22, 0.08)',
                    hoverBg: isDarkMode ? 'rgba(251, 146, 60, 0.18)' : 'rgba(249, 115, 22, 0.14)',
                    text: isDarkMode ? '#FB923C' : '#EA580C',
                  };
                }
                return {
                  bg: isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.06)',
                  hoverBg: isDarkMode ? 'rgba(125, 211, 252, 0.18)' : 'rgba(54, 144, 206, 0.12)',
                  text: isDarkMode ? '#7DD3FC' : '#3690CE',
                };
              };
              const c = getColours();

              return (
                <button
                  onClick={() => {
                    if (existingWorkspace) {
                      setActiveFilters(['document']);
                      setSelectedItem(existingWorkspace);
                      setTimeout(() => {
                        const el = document.getElementById(`timeline-item-${existingWorkspace.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 250);
                      return;
                    }
                    setDocRequestConfirmOpen(true);
                  }}
                  disabled={isDisabled}
                  onMouseEnter={(e) => {
                    if (!isDisabled) e.currentTarget.style.background = c.hoverBg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = c.bg;
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: c.bg,
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: c.text,
                    opacity: isDisabled ? 0.45 : 1,
                    cursor: isDisabled ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {docRequestLoading ? (
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        border: `2px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(54, 144, 206, 0.2)'}`,
                        borderTop: `2px solid ${c.text}`,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                  ) : isWorkspaceLive ? (
                    <FaCheckCircle size={12} color={c.text} />
                  ) : (
                    <FaArrowRight size={12} color={c.text} />
                  )}
                  <span>{label}</span>
                  {isWorkspaceLive && (
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '8px',
                      background: isDarkMode ? 'rgba(74, 222, 128, 0.2)' : 'rgba(34, 197, 94, 0.15)',
                      color: c.text,
                      letterSpacing: '0.3px',
                    }}>
                      LIVE
                    </span>
                  )}
                </button>
              );
            })()}

            <button
              disabled
              aria-disabled
              style={{
                display: 'none', // Hidden - functionality not ready
              }}
            >
              <span>Request structured data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Access (only shows when a Journey Timeline chip is selected) */}
      {activeFilters.length > 0 ? (
      <SectionCard
        variant="default"
        styleOverrides={{
          marginTop: '8px',
          padding: '16px 20px',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
          }}>
            Quick Access
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {quickAccessEmailIds.length > 0 && (
              <>
                <button
                  onClick={() => {
                    setExpandedQuickAccessEmailIds(new Set(quickAccessEmailIds));
                  }}
                  disabled={areAllQuickAccessEmailsExpanded}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.25)' : 'rgba(148, 163, 184, 0.3)'}`,
                    borderRadius: '2px',
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)',
                    cursor: areAllQuickAccessEmailsExpanded ? 'default' : 'pointer',
                    opacity: areAllQuickAccessEmailsExpanded ? 0.5 : 1,
                  }}
                  title="Expand all emails"
                >
                  <FaChevronDown size={11} />
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Expand all</span>
                </button>
                <button
                  onClick={() => {
                    setExpandedQuickAccessEmailIds(new Set());
                  }}
                  disabled={!areAnyQuickAccessEmailsExpanded}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.25)' : 'rgba(148, 163, 184, 0.3)'}`,
                    borderRadius: '2px',
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)',
                    cursor: !areAnyQuickAccessEmailsExpanded ? 'default' : 'pointer',
                    opacity: !areAnyQuickAccessEmailsExpanded ? 0.5 : 1,
                  }}
                  title="Collapse all emails"
                >
                  <FaChevronUp size={11} />
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Collapse all</span>
                </button>
              </>
            )}
            {selectedQuickAccessTypes.map((t) => {
              const typeColor = getTypeColor(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleActiveFilter(t)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: isDarkMode ? `${typeColor}20` : `${typeColor}15`,
                    border: `1px solid ${typeColor}`,
                    borderRadius: '2px',
                    color: typeColor,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title={`Remove ${getTypeLabel(t)} filter`}
                >
                  <span style={{ display: 'flex', alignItems: 'center', color: typeColor }}>
                    {getTypeIcon(t)}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>
                    {getTypeLabel(t)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {quickAccessItemsWithoutWorkspace.length === 0 && !isDocumentFilterActive ? (
          <div style={{
            padding: '12px 0',
            color: isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.5)',
            fontSize: '12px',
          }}>
            No items for the selected filters yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isDocumentFilterActive && (
              <div
                style={{
                  border: `1px dashed ${isDarkMode ? 'rgba(125, 211, 252, 0.35)' : 'rgba(148, 163, 184, 0.45)'}`,
                  borderRadius: '2px',
                  padding: '12px',
                  background: isDarkMode ? 'rgba(7, 16, 32, 0.35)' : 'rgba(255, 255, 255, 0.55)',
                }}
              >
                {(() => {
                  const passcode = workspaceTimelineItem?.metadata?.workspacePasscode || '';
                  const urlPath = workspaceTimelineItem?.metadata?.workspaceUrlPath || '';
                  const expiresAt = workspaceTimelineItem?.metadata?.workspaceExpiresAt;
                  const error = workspaceTimelineItem?.metadata?.workspaceError || '';
                  const isLive = Boolean(passcode && urlPath);
                  const isExpired = isLive && isExpiredIso(expiresAt);
                  const pitchBaseUrlRaw = process.env.REACT_APP_PITCH_BACKEND_URL || 'https://instruct.helix-law.com';
                  const pitchBaseUrl = pitchBaseUrlRaw.replace(/\/$/, '');
                  const clientLink = isLive ? `${pitchBaseUrl}${urlPath.startsWith('/') ? '' : '/'}${urlPath}` : '';
                  const statusLabel = isExpired ? 'Expired' : isLive ? 'Live' : 'Not live';
                  const dotColor = isExpired ? '#f59e0b' : isLive ? '#22c55e' : '#f59e0b';
                  const statusColor = isExpired
                    ? (isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)')
                    : isLive
                    ? (isDarkMode ? 'rgba(134, 239, 172, 0.95)' : 'rgb(22, 163, 74)')
                    : (isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)');

                  const docs = timeline
                    .filter((t) => t.type === 'document' && !t.metadata?.isDocWorkspace)
                    .slice()
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>
                            Document Workspace
                          </div>
                          <div style={{ fontSize: '10px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.6)', marginTop: '2px' }}>
                            Passcode: {passcode || '—'} • {isLive ? getExpiryLabel(expiresAt) : 'Opens for 14 days once created'}
                          </div>
                          {!isLive && error ? (
                            <div style={{ fontSize: '10px', color: isDarkMode ? 'rgba(253, 230, 138, 0.85)' : 'rgb(180, 83, 9)', marginTop: '6px' }}>
                              {error}
                            </div>
                          ) : null}
                        </div>

                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor }} />
                          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: statusColor }}>
                            {statusLabel}
                          </div>
                        </div>
                      </div>

                      {isLive ? (
                        <div
                          style={{
                            border: `1px dashed ${isDarkMode ? 'rgba(125, 211, 252, 0.35)' : 'rgba(148, 163, 184, 0.45)'}`,
                            borderRadius: '2px',
                            padding: '10px 10px',
                            background: isDarkMode ? 'rgba(2, 6, 23, 0.22)' : 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ fontSize: '10px', fontWeight: 700, color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)' }}>
                            Client upload link
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '6px' }}>
                            <a
                              href={clientLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '11px',
                                color: colours.highlight,
                                textDecoration: 'underline',
                                fontFamily: 'Consolas, Monaco, monospace',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                                flex: 1,
                              }}
                              title={clientLink}
                            >
                              {clientLink}
                            </a>

                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await navigator.clipboard.writeText(clientLink);
                                  showToast('Client link copied', 'success', { duration: 1800 });
                                } catch {
                                  showToast('Unable to copy link', 'error');
                                }
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 10px',
                                borderRadius: '2px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.12)',
                                color: colours.highlight,
                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.30)'}`,
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              <span style={{ fontSize: '12px', lineHeight: 1 }}>⧉</span>
                              Copy
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {docs.length === 0 ? (
                        <div style={{ fontSize: '11px', color: isDarkMode ? 'rgba(148, 163, 184, 0.75)' : 'rgba(15, 23, 42, 0.6)' }}>
                          No documents uploaded yet.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {docs.slice(0, 6).map((doc) => (
                            <button
                              key={doc.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openTimelineItem(doc);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                                padding: '8px 10px',
                                borderRadius: '2px',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
                                background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(255, 255, 255, 0.65)',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {doc.subject}
                                </div>
                                <div style={{ fontSize: '10px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.55)', marginTop: '2px' }}>
                                  {formatDocDate(doc.date)}
                                </div>
                              </div>
                              <div style={{ fontSize: '10px', color: colours.highlight, fontWeight: 700 }}>
                                View
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {quickAccessItemsWithoutWorkspace.map((item) => {
              const isDocument = item.type === 'document';
              const isEmail = item.type === 'email';
              const isQuickAccessEmailExpanded = isEmail && expandedQuickAccessEmailIds.has(item.id);
              const filename = isDocument ? getDocumentFilename(item) : item.subject;
              const downloadHref = isDocument ? getDocumentDownloadHref(item) : null;
              const safeEmailHtml = item.contentHtml ? sanitizeEmailHtml(item.contentHtml) : '';

              const emailBodySurfaceStyle: React.CSSProperties = {
                marginTop: '10px',
                paddingTop: '10px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)'}`,
              };

              const emailReaderStyle: React.CSSProperties = {
                marginTop: '10px',
                padding: '14px',
                borderRadius: '2px',
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.22)' : 'rgba(54, 144, 206, 0.18)'}`,
                borderLeft: `3px solid ${colours.highlight}`,
                // Intentional “email reader” surface: subtle gradient backdrop (no white block in dark mode).
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.92) 0%, rgba(2, 6, 23, 0.78) 100%)'
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%)',
                color: isDarkMode ? 'rgba(226, 232, 240, 0.92)' : colours.darkBlue,
                fontSize: '12px',
                lineHeight: '1.7',
                maxHeight: '520px',
                overflow: 'auto',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                boxShadow: isDarkMode
                  ? 'rgba(0, 0, 0, 0.18) 0px 2px 8px, rgba(0, 0, 0, 0.10) 0px 1px 2px'
                  : 'rgba(6, 23, 51, 0.06) 0px 2px 8px, rgba(6, 23, 51, 0.04) 0px 1px 2px',
              };

              return (
                isEmail ? (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
                      background: isDarkMode
                        ? 'linear-gradient(180deg, rgba(2, 6, 23, 0.40) 0%, rgba(2, 6, 23, 0.22) 100%)'
                        : 'linear-gradient(180deg, rgba(255, 255, 255, 0.75) 0%, rgba(248, 250, 252, 0.70) 100%)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <span style={{ color: getTypeColor(item.type), display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
                          {getTypeIcon(item.type)}
                        </span>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                        >
                          {filename}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flex: '0 0 auto', alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedQuickAccessEmailIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '34px',
                            height: '34px',
                            borderRadius: '2px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                            background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.65)',
                            cursor: 'pointer',
                          }}
                          title={isQuickAccessEmailExpanded ? 'Collapse email' : 'Expand email'}
                        >
                          {isQuickAccessEmailExpanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
                        </button>
                        <button
                          onClick={() => openTimelineItem(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            borderRadius: '2px',
                            fontSize: '12px',
                            fontWeight: 700,
                            background: colours.highlight,
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Open
                        </button>
                        {userEmail && (
                          <button
                            onClick={() => {
                              setForwardEmail(item);
                              setShowForwardDialog(true);
                            }}
                            style={{
                              padding: '8px 12px',
                              fontSize: '12px',
                              fontWeight: 700,
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                              borderRadius: '2px',
                              background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)';
                              e.currentTarget.style.borderColor = colours.highlight;
                              e.currentTarget.style.color = colours.highlight;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.8)';
                              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)';
                              e.currentTarget.style.color = isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)';
                            }}
                          >
                            Forward to myself →
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{
                      marginTop: '4px',
                      fontSize: '11px',
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}>
                      <span>{formatDocDate(item.date)}</span>
                      {item.createdBy && <span>by {item.createdBy}</span>}
                    </div>

                    {isQuickAccessEmailExpanded && (item.contentHtml || item.content) && (
                      <div style={emailBodySurfaceStyle}>
                        <div style={emailReaderStyle}>
                          {item.contentHtml ? (
                            <div className="helix-email-html" dangerouslySetInnerHTML={{ __html: safeEmailHtml }} />
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.28)' : 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: 0,
                      }}>
                        <span style={{ color: getTypeColor(item.type), display: 'flex', alignItems: 'center' }}>
                          {getTypeIcon(item.type)}
                        </span>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '520px',
                        }}>
                          {filename}
                        </div>
                      </div>
                      <div style={{
                        marginTop: '4px',
                        fontSize: '11px',
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}>
                        <span>{formatDocDate(item.date)}</span>
                        {item.createdBy && <span>by {item.createdBy}</span>}
                        {isDocument && item.metadata?.stageUploaded && <span>stage: {item.metadata.stageUploaded}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flex: '0 0 auto' }}>
                      {isDocument ? (
                        <>
                          <button
                            onClick={() => setPreviewDocument(item)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 12px',
                              borderRadius: '2px',
                              fontSize: '12px',
                              fontWeight: 700,
                              background: colours.highlight,
                              color: '#ffffff',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <FaFileAlt /> Preview
                          </button>
                          {downloadHref ? (
                            <a
                              href={downloadHref}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                borderRadius: '2px',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: isDarkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.18)',
                                color: isDarkMode ? colours.dark.text : colours.light.text,
                                textDecoration: 'none',
                              }}
                            >
                              Download
                            </a>
                          ) : (
                            <button
                              disabled
                              style={{
                                padding: '8px 12px',
                                borderRadius: '2px',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.10)',
                                color: isDarkMode ? 'rgba(226, 232, 240, 0.35)' : 'rgba(15, 23, 42, 0.35)',
                                border: 'none',
                                cursor: 'not-allowed',
                              }}
                            >
                              Download
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => openTimelineItem(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            borderRadius: '2px',
                            fontSize: '12px',
                            fontWeight: 700,
                            background: colours.highlight,
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>
                )
              );
            })}
          </div>
        )}
      </SectionCard>
      ) : null}

      {/* Client Journey Timeline */}
      <SectionCard
        variant="default"
        styleOverrides={{
          marginTop: '8px',
          padding: '16px 20px',
        }}
      >
        {/* Timeline Header with Activity Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
          }}>
            Journey Timeline ({activeFilters.length > 0
              ? timeline.filter(item => activeFilters.includes(item.type)).length
              : timeline.length})
          </div>

          {/* Communication Stats */}
          <div style={{ 
            display: 'flex', 
            gap: '4px',
            alignItems: 'center',
          }}>
            {['call', 'pitch', 'email', 'instruction', 'document'].map((type) => {
              const count = timeline.filter(item => item.type === type).length;
              const isActive = activeFilters.includes(type as CommunicationType);
              let statusColor: string = '';
              
              if (type === 'call') {
                statusColor = '#f59e0b'; // Amber for calls
              } else if (type === 'pitch') {
                statusColor = '#22c55e'; // Green
              } else if (type === 'email') {
                statusColor = colours.highlight; // Highlight blue
              } else if (type === 'document') {
                statusColor = isDarkMode ? '#7DD3FC' : colours.highlight; // Sky blue
              } else {
                statusColor = '#10b981'; // Emerald
              }
              
              return (
                <button
                  key={type}
                  onClick={() => {
                    if (count > 0) toggleActiveFilter(type as CommunicationType);
                  }}
                  title={`${type.charAt(0).toUpperCase() + type.slice(1)}s (${count})`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: isActive
                      ? (isDarkMode ? `${statusColor}22` : `${statusColor}15`)
                      : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: count === 0 
                      ? (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.5)')
                      : (isActive ? statusColor : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)')),
                    cursor: count === 0 ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                    fontSize: '13px',
                  }}
                  onMouseEnter={(e) => {
                    if (count > 0 && !isActive) {
                      e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                      e.currentTarget.style.color = statusColor;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = count === 0 
                        ? (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.5)')
                        : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)');
                    }
                  }}
                >
                  {getTypeIcon(type as CommunicationType)}
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 500,
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Day fold toggle */}
            <div style={{ width: '1px', height: '14px', background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.2)', margin: '0 2px' }} />
            <button
              onClick={() => {
                if (collapsedDays.size > 0) {
                  // Unfold all
                  setCollapsedDays(new Set());
                } else {
                  // Fold all days
                  const allDays = new Set(
                    timeline
                      .filter((item) => !hiddenItemIds.has(item.id))
                      .map((item) => {
                        const d = parseISO(item.date);
                        return Number.isFinite(d.getTime()) ? format(d, 'yyyy-MM-dd') : null;
                      })
                      .filter((d): d is string => d !== null)
                  );
                  setCollapsedDays(allDays);
                }
              }}
              title={collapsedDays.size > 0 ? 'Expand all days' : 'Collapse by day'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                background: collapsedDays.size > 0
                  ? (isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                  : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: collapsedDays.size > 0
                  ? (isDarkMode ? '#7DD3FC' : '#3690CE')
                  : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)'),
                cursor: 'pointer',
                fontSize: '11px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (collapsedDays.size === 0) {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (collapsedDays.size === 0) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {collapsedDays.size > 0 ? '▼' : '▶'}
            </button>

            {/* Ledger/Timeline view toggle */}
            <button
              onClick={() => {
                const next = !ledgerMode;
                setLedgerMode(next);
                try { localStorage.setItem('timelineLedgerMode', String(next)); } catch {}
              }}
              title={ledgerMode ? 'Switch to card view' : 'Switch to ledger view'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                background: ledgerMode
                  ? (isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                  : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: ledgerMode
                  ? (isDarkMode ? '#7DD3FC' : '#3690CE')
                  : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)'),
                cursor: 'pointer',
                fontSize: '11px',
                transition: 'all 0.15s',
              }}
            >
              {ledgerMode ? '≡' : '☰'}
            </button>
          </div>
        </div>

        {showDataLoadingStatus && (loading || Object.values(loadingStates).some(Boolean)) ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '10px 12px',
              borderRadius: '2px',
              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
              background: isDarkMode ? 'rgba(7, 16, 32, 0.28)' : 'rgba(255, 255, 255, 0.55)',
              marginBottom: '12px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.75)' : 'rgba(15, 23, 42, 0.55)',
                  marginBottom: '8px',
                }}
              >
                {loading && timeline.length === 0 ? 'Loading timeline…' : 'Updating timeline…'}
              </div>
              {(() => {
                const completed = TIMELINE_SOURCES.filter(({ key }) => sourceProgress[key].status !== 'loading').length;
                const total = TIMELINE_SOURCES.length;

                const iconBase: React.CSSProperties = {
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  fontSize: 10,
                  fontWeight: 900,
                  lineHeight: 1,
                };

                const renderStatusIcon = (status: TimelineSourceStatus) => {
                  if (status === 'done') {
                    return (
                      <span
                        style={{
                          ...iconBase,
                          background: isDarkMode ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.12)',
                          border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.35)' : 'rgba(34, 197, 94, 0.25)'}`,
                          color: isDarkMode ? 'rgba(134, 239, 172, 0.95)' : 'rgb(22, 163, 74)',
                        }}
                      >
                        ✓
                      </span>
                    );
                  }
                  if (status === 'error') {
                    return (
                      <span
                        style={{
                          ...iconBase,
                          background: isDarkMode ? 'rgba(253, 230, 138, 0.14)' : 'rgba(253, 230, 138, 0.22)',
                          border: `1px solid ${isDarkMode ? 'rgba(253, 230, 138, 0.25)' : 'rgba(180, 83, 9, 0.22)'}`,
                          color: isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)',
                        }}
                      >
                        !
                      </span>
                    );
                  }

                  return (
                    <span
                      style={{
                        ...iconBase,
                        border: `2px solid ${colours.highlight}`,
                        borderTopColor: 'transparent',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                  );
                };

                return (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 10, width: '100%' }}>
                      {TIMELINE_SOURCES.map(({ key, label }) => {
                        const entry = sourceProgress[key];
                        const suffix = entry.status === 'done' ? `(${entry.count})` : '';
                        const statusText = entry.status === 'loading' ? 'Working…' : entry.status === 'error' ? 'Unavailable' : `Done ${suffix}`;

                        return (
                          <div
                            key={key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: '10px',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.78)' : 'rgba(15, 23, 42, 0.6)',
                              flex: '1 1 0',
                              minWidth: 0,
                              padding: '6px 8px',
                              borderRadius: '2px',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.16)'}`,
                              background: isDarkMode ? 'rgba(2, 6, 23, 0.18)' : 'rgba(255, 255, 255, 0.6)',
                            }}
                          >
                            {entry.status === 'loading' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                <div
                                  className="skeleton-shimmer"
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 999,
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(148, 163, 184, 0.2)',
                                  }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                                  <div
                                    className="skeleton-shimmer"
                                    style={{
                                      width: '70%',
                                      height: 8,
                                      borderRadius: 999,
                                      background: isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(148, 163, 184, 0.2)',
                                    }}
                                  />
                                  <div
                                    className="skeleton-shimmer"
                                    style={{
                                      width: '45%',
                                      height: 7,
                                      borderRadius: 999,
                                      background: isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(148, 163, 184, 0.2)',
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <>
                                {renderStatusIcon(entry.status)}
                                <div style={{ minWidth: 0, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                  <span style={{ fontWeight: 700 }}>{label}</span>
                                  <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(15, 23, 42, 0.5)' }}>
                                    {statusText}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}

        {showDataLoadingStatus && loading && timeline.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
            {[0, 1, 2].map((idx) => (
              <div
                key={`timeline-skeleton-${idx}`}
                className="skeleton-shimmer"
                style={{
                  height: 68,
                  borderRadius: '6px',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.12)'}`,
                  background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.14)',
                }}
              />
            ))}
          </div>
        ) : null}

        {/* LEDGER MODE: Clean table-style view */}
        {ledgerMode && timeline.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              fontFamily: 'inherit',
            }}>
              <thead>
                <tr style={{
                  borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)', width: 80 }}>Date</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)', width: 70 }}>Type</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)' }}>Description</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)', width: 90 }}>By</th>
                </tr>
              </thead>
              <tbody>
                {timeline
                  .slice()
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .filter((item) => !hiddenItemIds.has(item.id))
                  .filter((item) => activeFilters.length === 0 || activeFilters.includes(item.type))
                  .map((item) => {
                    const itemDate = parseISO(item.date);
                    const dateStr = Number.isFinite(itemDate.getTime()) ? format(itemDate, 'd MMM') : '—';
                    const timeStr = Number.isFinite(itemDate.getTime()) ? format(itemDate, 'HH:mm') : '';
                    const typeColor = getItemTypeColor(item);
                    const isExpanded = selectedItem?.id === item.id;
                    const typeLabel = item.type === 'email'
                      ? (item.metadata?.direction === 'inbound' ? 'Email In' : 'Email Out')
                      : getItemTypeLabel(item);
                    const dealOriginLabel = item.metadata?.dealOriginLabel;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItem(isExpanded ? null : item)}
                        style={{
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.1)'}`,
                          cursor: 'pointer',
                          background: isExpanded
                            ? (isDarkMode ? 'rgba(125, 211, 252, 0.06)' : 'rgba(54, 144, 206, 0.04)')
                            : 'transparent',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.04)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)' }}>{dateStr}</div>
                          <div style={{ fontSize: 10, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)' }}>{timeStr}</div>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            color: typeColor,
                          }}>
                            {getItemTypeIcon(item)}
                            {typeLabel}
                          </span>
                          {dealOriginLabel && item.type === 'pitch' && (
                            <div style={{
                              marginTop: 4,
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: '0.3px',
                              textTransform: 'uppercase',
                              color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                            }}>
                              via {dealOriginLabel}
                            </div>
                          )}
                          {item.type === 'document' && item.metadata?.isDocWorkspace && (
                            <div style={{
                              marginTop: 4,
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: '0.3px',
                              textTransform: 'uppercase',
                              color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                            }}>
                              via Doc request
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                          <div style={{
                            fontWeight: 500,
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                            marginBottom: isExpanded ? 8 : 0,
                          }}>
                            {item.subject}
                          </div>
                          {isExpanded && item.content && (
                            <div style={{
                              fontSize: 11,
                              lineHeight: 1.5,
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                              whiteSpace: 'pre-wrap',
                              maxHeight: 200,
                              overflow: 'auto',
                              padding: '8px 10px',
                              background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : '#F8FAFC',
                              borderRadius: 4,
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`,
                            }}>
                              {item.content}
                            </div>
                          )}
                          {isExpanded && item.contentHtml && !item.content && (
                            <div
                              className="helix-email-html"
                              style={{
                                fontSize: 11,
                                lineHeight: 1.5,
                                color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                maxHeight: 200,
                                overflow: 'auto',
                                padding: '8px 10px',
                                background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : '#F8FAFC',
                                borderRadius: 4,
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`,
                              }}
                              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(item.contentHtml) }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)' }}>
                          {item.createdBy || '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* CARD MODE: Original complex timeline view */}
        {!ledgerMode && timeline.length > 0 ? (
          <div style={{ position: 'relative', paddingLeft: '96px' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: '76px',
              top: '0',
              bottom: '0',
              width: '1px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)',
            }} />

            {/* Timeline items */}
            {(() => {
              const sortedItems = timeline
                .slice()
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .filter((item) => !hiddenItemIds.has(item.id));

              // Group items by day for collapse tracking
              const itemsByDay = new Map<string, typeof sortedItems>();
              for (const item of sortedItems) {
                const d = parseISO(item.date);
                const dateKey = Number.isFinite(d.getTime()) ? format(d, 'yyyy-MM-dd') : 'unknown';
                const list = itemsByDay.get(dateKey) || [];
                list.push(item);
                itemsByDay.set(dateKey, list);
              }

              const renderedDays = new Set<string>();

              // Pre-compute holding doc count for action required status
              const holdingDocsCount = computeHoldingDocCount(sortedItems);

              return sortedItems.map((item, index, allItems) => {
                const typeColor = getItemTypeColor(item);
                const isExpanded = selectedItem?.id === item.id;
                const isDimmed = Boolean(activeFilters.length > 0 && !activeFilters.includes(item.type));
                // Individual doc uploads (not the workspace itself) should be subtle "bookmarks"
                const isPortalUpload = item.type === 'document' && item.metadata && !item.metadata.isDocWorkspace;

                // Compute action required status for this item
                const isDocWorkspace = item.type === 'document' && item.metadata?.isDocWorkspace;
                const itemActionRequired = isDocWorkspace ? holdingDocsCount > 0 : item.actionRequired;
                
                // Dot color logic:
                // - Portal uploads: subtle grey
                // - Action required: amber
                // - Email inbound: green (they reached out)
                // - Email outbound: blue (we reached out)
                // - Other items: green (complete)
                const dotColor = (() => {
                  if (isDocWorkspace) {
                    return getItemTypeColor(item);
                  }
                  if (isPortalUpload) {
                    return isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.5)';
                  }
                  if (itemActionRequired) {
                    return statusColors.actionRequired;
                  }
                  if (item.type === 'email') {
                    if (item.metadata?.direction === 'inbound') {
                      return isDarkMode ? '#4ADE80' : '#22C55E'; // Green - they contacted us
                    }
                    if (item.metadata?.direction === 'outbound') {
                      return isDarkMode ? '#7DD3FC' : '#3690CE'; // Blue - we contacted them
                    }
                  }
                  return statusColors.complete;
                })();

                const itemDate = (() => {
                  const d = parseISO(item.date);
                  return Number.isFinite(d.getTime()) ? d : new Date();
                })();
                const prevDateKey = (() => {
                  if (index <= 0) return null;
                  const prev = parseISO(allItems[index - 1].date);
                  return Number.isFinite(prev.getTime()) ? format(prev, 'yyyy-MM-dd') : null;
                })();
                const dateKey = format(itemDate, 'yyyy-MM-dd');
                const isSameDayAsPrev = Boolean(prevDateKey && prevDateKey === dateKey);
                const dayName = format(itemDate, 'EEE');
                const dayMonth = format(itemDate, 'd MMM');
                const time = format(itemDate, 'HH:mm');

                const isDayCollapsed = collapsedDays.has(dateKey);
                const isFirstOfDay = !renderedDays.has(dateKey);
                if (isFirstOfDay) renderedDays.add(dateKey);

                // If this day is collapsed, render a summary row for the first item only
                if (isDayCollapsed && isFirstOfDay) {
                  const dayItems = itemsByDay.get(dateKey) || [];
                  const typeCounts = new Map<string, number>();
                  for (const di of dayItems) {
                    typeCounts.set(di.type, (typeCounts.get(di.type) || 0) + 1);
                  }

                  return (
                    <div
                      key={`day-${dateKey}`}
                      style={{
                        position: 'relative',
                        marginBottom: '12px',
                      }}
                    >
                      {/* Date badge (left column) */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '-90px',
                          top: '0px',
                          width: '64px',
                          textAlign: 'right',
                          lineHeight: 1.1,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.65)' : 'rgba(15, 23, 42, 0.55)',
                          }}
                        >
                          {dayName}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.8)',
                            marginTop: '2px',
                          }}
                        >
                          {dayMonth}
                        </div>
                      </div>

                      {/* Collapsed day indicator */}
                      <div style={{
                        position: 'absolute',
                        left: '-24px',
                        top: '4px',
                        width: '8px',
                        height: '8px',
                        boxSizing: 'border-box',
                        borderRadius: '2px',
                        background: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)',
                        boxShadow: `0 0 0 2px ${isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)'}`,
                        zIndex: 1,
                      }} />

                      {/* Collapsed day summary */}
                      <button
                        onClick={() => {
                          setCollapsedDays((prev) => {
                            const next = new Set(prev);
                            next.delete(dateKey);
                            return next;
                          });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '8px 12px',
                          marginLeft: '-8px',
                          background: 'transparent',
                          border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.04)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            fontSize: '10px',
                            color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                          }}>
                            ▶
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)',
                          }}>
                            {dayItems.length} item{dayItems.length === 1 ? '' : 's'}
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {Array.from(typeCounts.entries()).map(([type, count]) => (
                              <span
                                key={type}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '10px',
                                  color: getTypeColor(type as CommunicationType),
                                }}
                              >
                                {getTypeIcon(type as CommunicationType)}
                                <span style={{ opacity: 0.8 }}>{count}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          color: colours.highlight,
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px',
                        }}>
                          Expand
                        </span>
                      </button>
                    </div>
                  );
                }

                // Skip other items for this collapsed day
                if (isDayCollapsed && !isFirstOfDay) {
                  return null;
                }
              
              return (
                <div
                  key={item.id}
                  className="helix-timeline-item-in"
                  id={`timeline-item-${item.id}`}
                  style={{
                    position: 'relative',
                    marginBottom: index < allItems.length - 1 ? '16px' : '0',
                    opacity: isDimmed ? 0.3 : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {/* Date badge (left column) - clickable to fold this day */}
                  <div
                    onClick={!isSameDayAsPrev ? () => {
                      setCollapsedDays((prev) => {
                        const next = new Set(prev);
                        next.add(dateKey);
                        return next;
                      });
                    } : undefined}
                    title={!isSameDayAsPrev ? 'Click to fold this day' : undefined}
                    style={{
                      position: 'absolute',
                      left: '-90px',
                      top: '0px',
                      width: '64px',
                      textAlign: 'right',
                      lineHeight: 1.1,
                      cursor: !isSameDayAsPrev ? 'pointer' : 'default',
                    }}
                  >
                    {!isSameDayAsPrev ? (
                      <>
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.65)' : 'rgba(15, 23, 42, 0.55)',
                          }}
                        >
                          {dayName}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.8)',
                            marginTop: '2px',
                          }}
                        >
                          {dayMonth}
                        </div>
                        <div
                          style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.45)' : 'rgba(15, 23, 42, 0.45)',
                            marginTop: '2px',
                          }}
                        >
                          {time}
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.45)' : 'rgba(15, 23, 42, 0.45)',
                          marginTop: '14px',
                        }}
                      >
                        {time}
                      </div>
                    )}
                  </div>

                  {/* Dot - status-based coloring: green=complete, amber=action required */}
                  <div 
                    title={itemActionRequired ? (typeof itemActionRequired === 'string' ? itemActionRequired : 'Action required') : 'Complete'}
                    style={{
                    position: 'absolute',
                    left: '-24px',
                    top: '4px',
                    width: isPortalUpload ? '6px' : '8px',
                    height: isPortalUpload ? '6px' : '8px',
                    boxSizing: 'border-box',
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: isPortalUpload ? 'none' : `0 0 0 2px ${isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)'}`,
                    zIndex: 1,
                    marginTop: isPortalUpload ? '1px' : '0px',
                    marginLeft: isPortalUpload ? '1px' : '0px',
                  }} />

                  {/* Expandable item */}
                  <div style={{
                    background: isExpanded
                      ? isDarkMode ? 'rgba(125, 211, 252, 0.06)' : 'rgba(54, 144, 206, 0.04)'
                      : 'transparent',
                    border: isExpanded
                      ? `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`
                      : isPortalUpload
                        ? `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.15)'}`
                        : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.1)'}`,
                    borderLeft: isExpanded
                      ? `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`
                      : isPortalUpload
                        ? `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.15)'}`
                        : item.type === 'email' && item.metadata?.direction === 'inbound'
                          ? isDarkMode ? '2px solid rgba(74, 222, 128, 0.4)' : '2px solid rgba(34, 197, 94, 0.35)'
                          : item.type === 'email' && item.metadata?.direction === 'outbound'
                            ? isDarkMode ? '2px solid rgba(125, 211, 252, 0.4)' : '2px solid rgba(54, 144, 206, 0.35)'
                            : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.1)'}`,
                    borderRadius: '6px',
                    padding: isPortalUpload ? '6px 10px' : '10px 12px',
                    marginLeft: '-8px',
                    transition: 'all 0.15s',
                    opacity: isPortalUpload && !isExpanded ? 0.65 : 1,
                  }}>
                    {/* Header - clickable */}
                    <div
                      onClick={() => setSelectedItem(isExpanded ? null : item)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Type and Subject on same line */}
                        <div style={{
                          fontSize: isPortalUpload ? '11px' : '12px',
                          fontWeight: isPortalUpload ? 500 : 600,
                          color: isPortalUpload
                            ? (isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.55)')
                            : (isDarkMode ? colours.dark.text : colours.light.text),
                          marginBottom: isPortalUpload ? '2px' : '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          {!isPortalUpload && (
                            <span style={{ color: typeColor }}>
                              {getItemTypeIcon(item)}
                            </span>
                          )}
                          {isPortalUpload && (
                            <span style={{ 
                              fontSize: '10px', 
                              color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(15, 23, 42, 0.4)',
                            }}>
                              📎
                            </span>
                          )}
                          {item.type === 'email' && item.metadata?.direction && (
                            <span style={{
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 500,
                              background: item.metadata.direction === 'inbound'
                                ? isDarkMode ? 'rgba(74, 222, 128, 0.12)' : 'rgba(34, 197, 94, 0.1)'
                                : isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(54, 144, 206, 0.1)',
                              color: item.metadata.direction === 'inbound'
                                ? isDarkMode ? '#4ADE80' : '#16A34A'
                                : isDarkMode ? '#7DD3FC' : '#0284C7',
                            }}>
                              {item.metadata.direction === 'inbound' ? '← In' : 'Out →'}
                            </span>
                          )}
                          {item.type === 'document' && item.metadata?.isDocWorkspace && (
                            <span style={{
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              background: isDarkMode ? 'rgba(168, 85, 247, 0.12)' : 'rgba(168, 85, 247, 0.1)',
                              color: isDarkMode ? '#c4b5fd' : '#7c3aed',
                            }}>
                              Doc request
                            </span>
                          )}
                          {item.type === 'pitch' && item.metadata?.dealOriginLabel && (
                            <span style={{
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              background: isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.1)',
                              color: isDarkMode ? '#4ADE80' : '#16A34A',
                            }}>
                              {item.metadata.dealOriginLabel}
                            </span>
                          )}
                          <span>
                            {(() => {
                              if (item.metadata?.isDocWorkspace) {
                                const passcode = typeof item.metadata.workspacePasscode === 'string' ? item.metadata.workspacePasscode.trim() : '';
                                return passcode ? `${item.subject} • ${passcode}` : item.subject;
                              }
                              return item.subject;
                            })()}
                          </span>
                        </div>
                        
                        {/* Time and Author - smaller, subtle */}
                        <div style={{
                          fontSize: isPortalUpload ? '9px' : '10px',
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          {isPortalUpload ? (
                            <>
                              <span>{format(itemDate, 'd MMM')}</span>
                              <span>•</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const workspaceItem = timeline.find((t) => t.type === 'document' && Boolean(t.metadata?.isDocWorkspace));
                                  if (workspaceItem) {
                                    setSelectedItem(workspaceItem);
                                    const el = document.getElementById(`timeline-item-${workspaceItem.id}`);
                                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  color: isDarkMode ? 'rgba(125, 211, 252, 0.6)' : 'rgba(54, 144, 206, 0.7)',
                                  fontSize: '9px',
                                  textDecoration: 'underline',
                                  textUnderlineOffset: '2px',
                                }}
                              >
                                via Client Upload Portal
                              </button>
                            </>
                          ) : (
                            <>
                              <span>{format(itemDate, 'd MMM yyyy, HH:mm')}</span>
                              {item.createdBy && (
                                <>
                                  <span>•</span>
                                  <span>{item.createdBy}</span>
                                </>
                              )}
                            </>
                          )}
                          {!isPortalUpload && (() => {
                            if (item.type === 'pitch' && item.metadata?.dealEmailSubject) {
                              return (
                                <>
                                  <span>•</span>
                                  <span style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                  }}>
                                    Email: {item.metadata.dealEmailSubject}
                                  </span>
                                </>
                              );
                            }

                            return item.metadata?.scenarioId ? (
                              <>
                                <span>•</span>
                                <span style={{
                                  fontSize: '9px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                  color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                                  fontWeight: 500,
                                }}>
                                  {getScenarioName(item.metadata.scenarioId)}
                                </span>
                              </>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        {/* Hide button */}
                        <button
                          className="helix-hide-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHideItem(item.id);
                          }}
                          title="Hide this item"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '20px',
                            height: '20px',
                            padding: 0,
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.5)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)';
                            e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.5)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        </button>
                        <div style={{
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.4)' : 'rgba(15, 23, 42, 0.4)',
                          fontSize: '14px',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '20px',
                          height: '20px',
                        }}>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            style={{ stroke: 'currentColor', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)'}`,
                        fontSize: '12px',
                        lineHeight: '1.7',
                        color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.9)',
                      }}>
                        {item.metadata?.isDocWorkspace ? (
                          <div
                            style={{
                              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
                              borderRadius: '2px',
                              padding: '12px',
                              background: isDarkMode ? 'rgba(7, 16, 32, 0.35)' : 'rgba(255, 255, 255, 0.55)',
                            }}
                          >
                            {(() => {
                              const hasPasscode = Boolean(item.metadata?.workspacePasscode);
                              const hasUrl = Boolean(item.metadata?.workspaceUrlPath);
                              const isLive = hasPasscode && hasUrl;
                              const expiresAt = item.metadata?.workspaceExpiresAt;
                              const isExpired = isLive && isExpiredIso(expiresAt);

                              // Count holding docs for action prompt
                              const holdingDocsCount = timeline
                                .filter((t) => t.type === 'document' && !t.metadata?.isDocWorkspace)
                                .filter((doc) => {
                                  const blobName = doc.metadata?.blobName;
                                  if (typeof blobName !== 'string') return false;
                                  return blobName.includes('/Holding/');
                                }).length;

                              return (
                                <>
                                  {/* ACTION NEEDED - prominent if holding has items */}
                                  {holdingDocsCount > 0 && (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '10px 12px',
                                      marginBottom: '12px',
                                      borderRadius: '2px',
                                      background: isDarkMode ? 'rgba(253, 230, 138, 0.08)' : 'rgba(180, 83, 9, 0.06)',
                                      border: `1px solid ${isDarkMode ? 'rgba(253, 230, 138, 0.25)' : 'rgba(180, 83, 9, 0.2)'}`,
                                    }}>
                                      <div style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        background: isDarkMode ? 'rgba(253, 230, 138, 0.15)' : 'rgba(180, 83, 9, 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)',
                                        flex: '0 0 auto',
                                      }}>
                                        !
                                      </div>
                                      <div>
                                        <div style={{
                                          fontSize: '12px',
                                          fontWeight: 700,
                                          color: isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)',
                                        }}>
                                          {holdingDocsCount} file{holdingDocsCount === 1 ? '' : 's'} need{holdingDocsCount === 1 ? 's' : ''} allocation
                                        </div>
                                        <div style={{
                                          fontSize: '10px',
                                          color: isDarkMode ? 'rgba(253, 230, 138, 0.7)' : 'rgba(180, 83, 9, 0.8)',
                                          marginTop: '2px',
                                        }}>
                                          Client uploaded files are in Holding — move to appropriate folder
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Status row - compact */}
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    marginBottom: holdingDocsCount > 0 ? '0px' : '8px',
                                  }}>
                                    <div style={{
                                      fontSize: '11px',
                                      color: isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(15, 23, 42, 0.65)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}>
                                      {isExpired ? (
                                        <span style={{ color: isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)' }}>Portal expired</span>
                                      ) : isLive ? (
                                        <>
                                          <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            color: isDarkMode ? 'rgba(134, 239, 172, 0.95)' : 'rgb(22, 163, 74)',
                                          }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                                            Active
                                          </span>
                                          <span style={{ color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(15, 23, 42, 0.35)' }}>•</span>
                                          <span>{getExpiryLabel(item.metadata.workspaceExpiresAt)}</span>
                                        </>
                                      ) : (
                                        <span style={{ color: isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)' }}>Not yet active</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '10px', color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(15, 23, 42, 0.5)' }}>
                                      Code: {item.metadata.workspacePasscode || '—'}
                                    </div>
                                  </div>

                                  {!isLive && (item.metadata?.workspaceError || '') ? (
                                    <div style={{ fontSize: '10px', color: isDarkMode ? 'rgba(253, 230, 138, 0.85)' : 'rgb(180, 83, 9)', marginTop: '4px', marginBottom: '8px' }}>
                                      {item.metadata?.workspaceError}
                                    </div>
                                  ) : null}

                                  {/* Request Docs buttons - show when workspace is NOT live */}
                                  {!isLive && (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      marginTop: '12px',
                                      marginBottom: '12px',
                                      flexWrap: 'wrap',
                                    }}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDocRequestConfirmOpen(true);
                                        }}
                                        disabled={docRequestLoading || !requestDocsEnabled}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          padding: '8px 14px',
                                          borderRadius: '2px',
                                          fontSize: '12px',
                                          fontWeight: 700,
                                          background: colours.highlight,
                                          color: '#ffffff',
                                          border: 'none',
                                          cursor: docRequestLoading || !requestDocsEnabled ? 'default' : 'pointer',
                                          opacity: docRequestLoading || !requestDocsEnabled ? 0.6 : 1,
                                        }}
                                      >
                                        {docRequestLoading ? (
                                          <div
                                            style={{
                                              width: '12px',
                                              height: '12px',
                                              border: '2px solid rgba(255, 255, 255, 0.3)',
                                              borderTop: '2px solid #ffffff',
                                              borderRadius: '50%',
                                              animation: 'spin 1s linear infinite',
                                            }}
                                          />
                                        ) : (
                                          <FaArrowRight size={11} />
                                        )}
                                        {docRequestLoading ? 'Creating…' : 'Request Docs'}
                                      </button>

                                      <button
                                        disabled
                                        aria-disabled
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          padding: '8px 14px',
                                          borderRadius: '2px',
                                          fontSize: '12px',
                                          fontWeight: 700,
                                          background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.1)',
                                          border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(54, 144, 206, 0.3)'}`,
                                          color: isDarkMode ? colours.accent : colours.highlight,
                                          cursor: 'default',
                                          opacity: 0.45,
                                        }}
                                      >
                                        Request structured data
                                      </button>
                                    </div>
                                  )}
                                </>
                              );
                            })()}

                            {(() => {
                              const docs = timeline
                                .filter((t) => t.type === 'document' && !t.metadata?.isDocWorkspace)
                                .slice()
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                              const passcode = String(item.metadata?.workspacePasscode || '').trim();
                              const folderPrefix = passcode ? `enquiries/${resolvePitchEnquiryId(enquiry) || ''}/${passcode}/` : '';

                              const resolveFolderName = (doc: TimelineItem): string | null => {
                                const blobName = doc.metadata?.blobName;
                                if (typeof blobName !== 'string' || !blobName) return null;

                                // Prefer removing the known prefix, but tolerate unknown/mismatched prefixes.
                                const rel = folderPrefix && blobName.startsWith(folderPrefix)
                                  ? blobName.slice(folderPrefix.length)
                                  : blobName;

                                const parts = rel.split('/').filter(Boolean);
                                if (parts.length <= 1) return null;
                                return parts[0] || null;
                              };

                              const docsByFolder = new Map<string, TimelineItem[]>();
                              for (const doc of docs) {
                                const folder = resolveFolderName(doc) || '';
                                const list = docsByFolder.get(folder) || [];
                                list.push(doc);
                                docsByFolder.set(folder, list);
                              }

                              const knownFoldersRaw = Array.isArray(item.metadata?.workspaceFolders) ? item.metadata.workspaceFolders : [];
                              const knownFolders = knownFoldersRaw.filter((f) => typeof f === 'string' && f.trim());
                              const folderNames = Array.from(new Set([
                                ...knownFolders,
                                ...Array.from(docsByFolder.keys()).filter((k) => k && k.trim()),
                              ]));

                              folderNames.sort((a, b) => {
                                if (a === 'Holding') return -1;
                                if (b === 'Holding') return 1;
                                return a.localeCompare(b);
                              });

                              const holdingDocs = docsByFolder.get('Holding') || [];

                              if (docs.length === 0) {
                                return (
                                  <div style={{ fontSize: '11px', color: isDarkMode ? 'rgba(148, 163, 184, 0.75)' : 'rgba(15, 23, 42, 0.6)' }}>
                                    No documents uploaded yet.
                                  </div>
                                );
                              }

                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {/* Uploaded files by folder */}
                                  <div style={{ fontSize: '10px', fontWeight: 600, color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.55)', marginBottom: '2px' }}>
                                    Uploaded files ({docs.length})
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {folderNames.map((folder) => {
                                        const folderDocs = docsByFolder.get(folder) || [];
                                        const isHolding = folder === 'Holding' && folderDocs.length > 0;
                                        const folderLabelColor = isHolding
                                          ? (isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)')
                                          : (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)');
                                        const folderBorder = isHolding
                                          ? (isDarkMode ? 'rgba(253, 230, 138, 0.35)' : 'rgba(180, 83, 9, 0.25)')
                                          : (isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)');
                                        const folderBg = isHolding
                                          ? (isDarkMode ? 'rgba(253, 230, 138, 0.04)' : 'rgba(180, 83, 9, 0.03)')
                                          : (isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(255, 255, 255, 0.65)');

                                        // Skip empty non-Holding folders
                                        if (folderDocs.length === 0 && folder !== 'Holding') return null;

                                        return (
                                          <div
                                            key={folder}
                                            style={{
                                              border: `1px solid ${folderBorder}`,
                                              borderRadius: '2px',
                                              padding: '8px',
                                              background: folderBg,
                                            }}
                                          >
                                            <div style={{
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              gap: '10px',
                                              marginBottom: folderDocs.length > 0 ? '6px' : '0px',
                                            }}>
                                              <div style={{
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                color: folderLabelColor,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                              }}>
                                                <span style={{ opacity: 0.7 }}>📁</span>
                                                {folder}{folderDocs.length > 0 ? ` (${folderDocs.length})` : ''}
                                              </div>
                                              {isHolding ? (
                                                <div style={{ fontSize: '9px', fontWeight: 700, color: folderLabelColor, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                  Allocate →
                                                </div>
                                              ) : null}
                                            </div>

                                            {folderDocs.length === 0 ? (
                                              <div style={{ fontSize: '10px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.55)' }}>
                                                Empty
                                              </div>
                                            ) : (
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {folderDocs.map((doc) => (
                                                  <button
                                                    key={doc.id}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      openTimelineItem(doc);
                                                    }}
                                                    style={{
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      justifyContent: 'space-between',
                                                      gap: '10px',
                                                      padding: '8px 10px',
                                                      borderRadius: '2px',
                                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)'}`,
                                                      background: isDarkMode ? 'rgba(7, 16, 32, 0.25)' : 'rgba(255, 255, 255, 0.7)',
                                                      cursor: 'pointer',
                                                      textAlign: 'left',
                                                    }}
                                                  >
                                                    <div style={{ minWidth: 0 }}>
                                                      <div style={{ fontSize: '11px', fontWeight: 600, color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {doc.subject}
                                                      </div>
                                                      <div style={{ fontSize: '10px', color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.55)', marginTop: '2px' }}>
                                                        {formatDocDate(doc.date)}
                                                      </div>
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: colours.highlight, fontWeight: 700 }}>
                                                      View
                                                    </div>
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Workspace link at the bottom */}
                            {item.metadata?.workspaceUrlPath && item.metadata?.workspacePasscode ? (
                              <div
                                style={{
                                  marginTop: '12px',
                                  paddingTop: '10px',
                                  borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                                }}
                              >
                                {(() => {
                                  const workspaceUrl = `https://instruct.helix-law.com${item.metadata.workspaceUrlPath}`;
                                  const copyButtonBase: React.CSSProperties = {
                                    padding: '6px 10px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    borderRadius: '2px',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.25)'}`,
                                    background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(255, 255, 255, 0.65)',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                  };

                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                      <a
                                        href={workspaceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          fontSize: '10px',
                                          color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.55)',
                                          textDecoration: 'none',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          minWidth: 0,
                                        }}
                                      >
                                        <span style={{ opacity: 0.7 }}>↗</span>
                                        <span style={{ textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          instruct.helix-law.com{item.metadata.workspaceUrlPath}
                                        </span>
                                      </a>

                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(workspaceUrl, 'Workspace link');
                                          }}
                                          style={copyButtonBase}
                                        >
                                          Copy link
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(item.metadata?.workspacePasscode || '', 'Passcode');
                                          }}
                                          style={copyButtonBase}
                                        >
                                          Copy passcode
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : null}
                          </div>
                        ) : item.type === 'call' ? (
                          renderCallDetails(item)
                        ) : item.contentHtml ? (
                          <div className="helix-email-html" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(item.contentHtml) }} />
                        ) : item.content ? (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div>
                        ) : item.type === 'pitch' && item.metadata?.dealOrigin === 'link' ? (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: `1px dashed ${isDarkMode ? 'rgba(34, 197, 94, 0.35)' : 'rgba(34, 197, 94, 0.25)'}`,
                            background: isDarkMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)',
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}>
                            <span>Checkout link created (no pitch email).</span>
                            {(() => {
                              const passcode = item.metadata?.dealPasscode?.trim();
                              if (!passcode) return null;
                              const base = String(process.env.REACT_APP_PITCH_BACKEND_URL || 'https://instruct.helix-law.com').replace(/\/$/, '');
                              const link = `${base}/pitch/${encodeURIComponent(passcode)}`;

                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      fontSize: '11px',
                                      fontFamily: 'Consolas, Monaco, monospace',
                                      color: isDarkMode ? colours.accent : colours.highlight,
                                      textDecoration: 'underline',
                                      wordBreak: 'break-all',
                                    }}
                                  >
                                    {link}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(link, 'Checkout link');
                                    }}
                                    style={{
                                      alignSelf: 'flex-start',
                                      padding: '6px 10px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      borderRadius: '2px',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.25)'}`,
                                      background: isDarkMode ? 'rgba(2, 6, 23, 0.25)' : 'rgba(255, 255, 255, 0.65)',
                                      color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Copy checkout link
                                  </button>
                                </div>
                              );
                            })()}
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              color: isDarkMode ? 'rgba(148, 163, 184, 0.75)' : 'rgba(100, 116, 139, 0.75)',
                            }}>
                              Use this link to collect payment outside of Helix Hub.
                            </span>
                          </div>
                        ) : (
                          <div style={{ 
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.4)' : 'rgba(15, 23, 42, 0.4)',
                            fontStyle: 'italic',
                          }}>
                            No content available
                          </div>
                        )}
                        
                        {/* Forward Email Button for email and pitch items */}
                        {(item.type === 'email' || (item.type === 'pitch' && item.metadata?.dealOrigin !== 'link')) && userEmail && (
                          <div style={{ marginTop: '12px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setForwardEmail(item);
                                setShowForwardDialog(true);
                              }}
                              style={{
                                padding: '6px 12px',
                                fontSize: '11px',
                                fontWeight: 600,
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                                borderRadius: '2px',
                                background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                                color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)';
                                e.currentTarget.style.borderColor = colours.highlight;
                                e.currentTarget.style.color = colours.highlight;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.8)';
                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)';
                                e.currentTarget.style.color = isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)';
                              }}
                            >
                              Forward to myself →
                            </button>
                          </div>
                        )}
                        
                        {/* Document-specific content */}
                        {item.type === 'document' && item.metadata && !item.metadata.isDocWorkspace && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '12px',
                              fontSize: '11px',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                              marginBottom: '12px',
                            }}>
                              {item.metadata.documentType && (
                                <span style={{
                                  padding: '3px 10px',
                                  borderRadius: '4px',
                                  background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.2)',
                                  color: isDarkMode ? colours.accent : colours.darkBlue,
                                  fontWeight: 500,
                                }}>
                                  {item.metadata.documentType.replace(/_/g, ' ')}
                                </span>
                              )}
                              {item.metadata.fileSize && (
                                <span style={{
                                  padding: '3px 10px',
                                  borderRadius: '4px',
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                }}>
                                  {item.metadata.fileSize < 1024 
                                    ? `${item.metadata.fileSize} B`
                                    : item.metadata.fileSize < 1024 * 1024
                                      ? `${(item.metadata.fileSize / 1024).toFixed(1)} KB`
                                      : `${(item.metadata.fileSize / (1024 * 1024)).toFixed(1)} MB`
                                  }
                                </span>
                              )}
                              {item.metadata.stageUploaded && (
                                <span style={{
                                  padding: '3px 10px',
                                  borderRadius: '4px',
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                }}>
                                  Uploaded at: {item.metadata.stageUploaded}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewDocument(item);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                borderRadius: '2px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: colours.highlight,
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = colours.light.hoverBackground;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = colours.highlight;
                              }}
                            >
                              <FaFileAlt /> Preview
                            </button>
                          </div>
                        )}
                        
                        {/* InlineWorkbench for Pitches - replaces old status chips */}
                        {item.type === 'pitch' && inlineWorkbenchItem && (
                          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'}` }}>
                            <InlineWorkbench
                              item={{ ...(inlineWorkbenchItem ?? {}), enquiry, pitch: item }}
                              isDarkMode={isDarkMode}
                              enableContextStageChips={true}
                              contextStageKeys={['instructed']}
                            />
                          </div>
                        )}
                        {/* Fallback to old status chips if no instruction data */}
                        {item.type === 'pitch' && !inlineWorkbenchItem && renderInstructionStatus(item.id)}
                      </div>
                    )}
                  </div>
                </div>
              );
            });
            })()}
          </div>
        ) : null}

        {/* Empty state when no timeline items */}
        {timeline.length === 0 && (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: isDarkMode ? 'rgba(226, 232, 240, 0.4)' : 'rgba(15, 23, 42, 0.4)',
            fontSize: '12px',
          }}>
            No activity yet
          </div>
        )}
      </SectionCard>

      {/* Resources & Actions */}
      {showResourcesConcept && (
      <div style={{
        marginTop: '32px',
        background: isDarkMode
          ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.95) 100%)',
        border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.2)'}`,
        borderRadius: '12px',
        padding: '20px',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}>
          <div>
            <div style={{
              color: colours.highlight,
              fontSize: '14px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}>
              Resources & Actions
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.2px',
                  padding: '2px 6px',
                  borderRadius: '999px',
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
                  background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                  color: isDarkMode ? 'rgba(147, 197, 253, 0.95)' : 'rgba(13, 47, 96, 0.85)',
                }}
              >
                Concept
              </span>
            </div>
            <div style={{
              color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(15, 23, 42, 0.5)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.4px',
              marginBottom: '6px',
            }}>
              AC CB LZ
            </div>
            <div style={{
              color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(15, 23, 42, 0.6)',
              fontSize: '11px',
              fontWeight: 500,
            }}>
              Prospect management tools and resources for this enquiry
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '8px',
          width: '100%',
        }}>
          <div
            onMouseEnter={() => enquiry.Email && setHoveredAction('email')}
            onMouseLeave={() => setHoveredAction(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'stretch',
              justifyContent: 'center',
              borderRadius: '2px',
              overflow: 'hidden',
              background: hoveredAction === 'email'
                ? (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'),
              border: `1px solid ${hoveredAction === 'email'
                ? (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.4)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)')}`,
              opacity: enquiry.Email ? 1 : 0.5,
              transition: 'all 0.15s ease',
              transform: hoveredAction === 'email' ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow: hoveredAction === 'email' ? `0 2px 8px ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}` : 'none',
            }}
          >
            <button
              onClick={() => openMailto(enquiry.Email || '')}
              disabled={!enquiry.Email}
              title={enquiry.Email ? 'Email' : 'Email not available'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                cursor: enquiry.Email ? 'pointer' : 'default',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(51, 65, 85, 0.85)',
                fontSize: '12px',
                fontWeight: 500,
                width: '100%',
              }}
            >
              <FaEnvelope size={11} />
              <span>Email</span>
            </button>
            <button
              onClick={() => copyToClipboard(enquiry.Email || '', 'Email')}
              disabled={!enquiry.Email}
              title={enquiry.Email ? `Copy: ${enquiry.Email}` : 'Email not available'}
              aria-label="Copy email"
              onMouseEnter={(e) => {
                if (enquiry.Email) e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.4';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 10px',
                border: 'none',
                borderLeft: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.18)'}`,
                background: 'transparent',
                cursor: enquiry.Email ? 'pointer' : 'default',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(51, 65, 85, 0.85)',
                fontSize: '11px',
                opacity: 0.4,
                transition: 'opacity 0.15s ease',
              }}
            >
              <FaClipboard size={12} />
            </button>
          </div>

          <div
            onMouseEnter={() => enquiry.Phone_Number && setHoveredAction('call')}
            onMouseLeave={() => setHoveredAction(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'stretch',
              justifyContent: 'center',
              borderRadius: '2px',
              overflow: 'hidden',
              background: hoveredAction === 'call'
                ? (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'),
              border: `1px solid ${hoveredAction === 'call'
                ? (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.4)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)')}`,
              opacity: enquiry.Phone_Number ? 1 : 0.5,
              transition: 'all 0.15s ease',
              transform: hoveredAction === 'call' ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow: hoveredAction === 'call' ? `0 2px 8px ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}` : 'none',
            }}
          >
            <button
              onClick={() => openTel(enquiry.Phone_Number || '')}
              disabled={!enquiry.Phone_Number}
              title={enquiry.Phone_Number ? 'Call' : 'Phone number not available'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                cursor: enquiry.Phone_Number ? 'pointer' : 'default',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(51, 65, 85, 0.85)',
                fontSize: '12px',
                fontWeight: 500,
                width: '100%',
              }}
            >
              <FaPhone size={11} />
              <span>Call</span>
            </button>
            <button
              onClick={() => copyToClipboard(enquiry.Phone_Number || '', 'Phone number')}
              disabled={!enquiry.Phone_Number}
              title={enquiry.Phone_Number ? `Copy: ${enquiry.Phone_Number}` : 'Phone number not available'}
              aria-label="Copy phone number"
              onMouseEnter={(e) => {
                if (enquiry.Phone_Number) e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.4';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 10px',
                border: 'none',
                borderLeft: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.18)'}`,
                background: 'transparent',
                cursor: enquiry.Phone_Number ? 'pointer' : 'default',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(51, 65, 85, 0.85)',
                fontSize: '11px',
                opacity: 0.4,
                transition: 'opacity 0.15s ease',
              }}
            >
              <FaClipboard size={12} />
            </button>
          </div>

          <button
            onMouseEnter={() => setHoveredAction('pitch')}
            onMouseLeave={() => setHoveredAction(null)}
            onClick={openPitchBuilder}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: hoveredAction === 'pitch'
                ? (isDarkMode ? 'rgba(135, 243, 243, 0.28)' : 'rgba(54, 144, 206, 0.2)')
                : (isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.1)'),
              border: `1px solid ${hoveredAction === 'pitch'
                ? (isDarkMode ? 'rgba(135, 243, 243, 0.6)' : 'rgba(54, 144, 206, 0.5)')
                : (isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(54, 144, 206, 0.3)')}`,
              borderRadius: '2px',
              padding: '8px 12px',
              cursor: 'pointer',
              color: isDarkMode ? colours.accent : colours.highlight,
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
              transform: hoveredAction === 'pitch' ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow: hoveredAction === 'pitch' ? `0 2px 8px ${isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.15)'}` : 'none',
            }}
          >
            <FaCheckCircle size={11} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Pitch
              {pitchCount > 0 && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '999px',
                  border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.35)' : 'rgba(54, 144, 206, 0.28)'}`,
                  background: isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                  color: isDarkMode ? colours.accent : colours.highlight,
                  lineHeight: 1.2,
                }}>
                  {pitchCount}
                </span>
              )}
            </span>
          </button>

          {/* Doc-request actions moved down to deal/workspace level */}
        </div>

      </div>
      )}

      {/* Call Sync Confirmation Dialog */}
      {showCallConfirm && callSyncData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={() => {
          setShowCallConfirm(false);
          setCallSyncData(null);
        }}
        >
          <div style={{
            background: isDarkMode ? '#1E293B' : '#FFFFFF',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '540px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: isDarkMode 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            animation: 'slideUp 0.3s ease',
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              marginBottom: '24px',
              paddingBottom: '20px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(217, 119, 6, 0.35)',
              }}>
                <FaPhone style={{ color: '#FFFFFF', fontSize: '20px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 700,
                  color: isDarkMode ? '#F1F5F9' : '#0F172A',
                  letterSpacing: '-0.02em',
                }}>
                  Search CallRail Calls
                </h3>
                <p style={{
                  margin: '6px 0 0 0',
                  fontSize: '14px',
                  color: isDarkMode ? '#94A3B8' : '#64748B',
                  lineHeight: '1.5',
                }}>
                  Enter or select the phone number to locate calls associated with this enquiry
                </p>
              </div>
            </div>

            {/* Prospect Details */}
            <div style={{
              background: isDarkMode 
                ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.12), rgba(37, 99, 235, 0.08))'
                : 'linear-gradient(135deg, rgba(54, 144, 206, 0.08), rgba(37, 99, 235, 0.05))',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: colours.highlight,
                marginBottom: '12px',
              }}>
                Prospect
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: 700,
                color: isDarkMode ? '#F1F5F9' : '#0F172A',
                marginBottom: '4px',
                letterSpacing: '-0.01em',
              }}>
                {callSyncData.contactName}
              </div>
              <div style={{
                fontSize: '14px',
                color: isDarkMode ? '#CBD5E1' : '#475569',
              }}>
                Phone calls will be matched using the number below
              </div>
            </div>

            {/* Search Parameters */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: isDarkMode ? '#94A3B8' : '#64748B',
                marginBottom: '16px',
              }}>
                Search Parameters
              </div>

              {callSyncData.availableNumbers.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: isDarkMode ? '#CBD5E1' : '#475569',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                  }}>
                    Numbers on record
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {callSyncData.availableNumbers.map((number) => (
                      <button
                        key={number}
                        onClick={() => setCallSyncData(prev => prev ? { ...prev, phoneNumber: number } : prev)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '999px',
                          border: callSyncData.phoneNumber === number
                            ? `2px solid ${colours.highlight}`
                            : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                          background: callSyncData.phoneNumber === number
                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.12)')
                            : 'transparent',
                          color: callSyncData.phoneNumber === number
                            ? (isDarkMode ? '#7DD3FC' : '#1e40af')
                            : isDarkMode ? '#E2E8F0' : '#475569',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = callSyncData.phoneNumber === number
                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.18)')
                            : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)');
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = callSyncData.phoneNumber === number
                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.12)')
                            : 'transparent';
                        }}
                      >
                        {number}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Phone Number Input */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isDarkMode ? '#CBD5E1' : '#475569',
                  marginBottom: '8px',
                }}>
                  Phone number to search
                </label>
                <input
                  type="tel"
                  value={callSyncData.phoneNumber}
                  onChange={(e) => setCallSyncData(prev => prev ? { ...prev, phoneNumber: e.target.value } : prev)}
                  placeholder="e.g. 01234 567890"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#FFFFFF',
                    color: isDarkMode ? '#F1F5F9' : '#0F172A',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = colours.highlight;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.2)'}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Result Limit Input */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isDarkMode ? '#CBD5E1' : '#475569',
                  marginBottom: '8px',
                }}>
                  Max results (1-100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={callSyncData.maxResults}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    setCallSyncData(prev => {
                      if (!prev) return prev;
                      if (Number.isNaN(parsed)) {
                        return { ...prev, maxResults: 1 };
                      }
                      const clamped = Math.min(100, Math.max(1, parsed));
                      return { ...prev, maxResults: clamped };
                    });
                  }}
                  style={{
                    width: '120px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#FFFFFF',
                    color: isDarkMode ? '#F1F5F9' : '#0F172A',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = colours.highlight;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.2)'}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Info Banner */}
            <div style={{
              background: isDarkMode ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.2)'}`,
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '24px',
              display: 'flex',
              gap: '12px',
            }}>
              <FaInfoCircle style={{
                color: '#f59e0b',
                fontSize: '16px',
                marginTop: '2px',
                flexShrink: 0,
              }} />
              <div style={{
                fontSize: '13px',
                lineHeight: '1.6',
                color: isDarkMode ? '#CBD5E1' : '#475569',
              }}>
                Searches CallRail for inbound and outbound calls that match the phone number provided. Results will be added to the enquiry timeline.
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button style={{
                padding: '12px 24px',
                background: 'transparent',
                border: `2px solid ${isDarkMode ? '#475569' : '#CBD5E1'}`,
                borderRadius: '8px',
                color: isDarkMode ? '#F1F5F9' : '#0F172A',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.borderColor = isDarkMode ? '#64748B' : '#94A3B8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = isDarkMode ? '#475569' : '#CBD5E1';
              }}
              onClick={() => {
                setShowCallConfirm(false);
                setCallSyncData(null);
              }}
              >
                Cancel
              </button>

              <button style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(217, 119, 6, 0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(217, 119, 6, 0.35)';
              }}
              onClick={executeCallSync}
              >
                <FaPhone />
                Search Calls
              </button>
            </div>

            {/* CSS Animations */}
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from {
                  opacity: 0;
                  transform: translateY(20px) scale(0.95);
                }
                to {
                  opacity: 1;
                  transform: translateY(0) scale(1);
                }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Email Sync Confirmation Dialog */}
      {showEmailConfirm && emailSyncData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={() => {
          setShowEmailConfirm(false);
          setEmailSyncData(null);
        }}
        >
          <div style={{
            background: isDarkMode ? '#1E293B' : '#FFFFFF',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '580px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: isDarkMode 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            animation: 'slideUp 0.3s ease',
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              marginBottom: '28px',
              paddingBottom: '24px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3690CE 0%, #2563EB 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(54, 144, 206, 0.3)',
              }}>
                <FaEnvelope style={{ color: '#FFFFFF', fontSize: '20px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 700,
                  color: isDarkMode ? '#F1F5F9' : '#0F172A',
                  letterSpacing: '-0.02em',
                }}>
                  Search Microsoft 365 Inbox
                </h3>
                <p style={{
                  margin: '6px 0 0 0',
                  fontSize: '14px',
                  color: isDarkMode ? '#94A3B8' : '#64748B',
                  lineHeight: '1.5',
                }}>
                  Configure search parameters to find relevant email communications
                </p>
              </div>
            </div>

            {/* Account Owner Section */}
            <div style={{
              background: isDarkMode 
                ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.12), rgba(37, 99, 235, 0.08))'
                : 'linear-gradient(135deg, rgba(54, 144, 206, 0.08), rgba(37, 99, 235, 0.05))',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '16px',
              }}>
                <FaUser style={{ 
                  color: colours.highlight, 
                  fontSize: '16px',
                }} />
                <div style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  color: colours.highlight,
                }}>
                  Account Owner
                </div>
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: 700,
                color: isDarkMode ? '#F1F5F9' : '#0F172A',
                marginBottom: '4px',
                letterSpacing: '-0.01em',
              }}>
                {emailSyncData.pointOfContact}
              </div>
              <div style={{
                fontSize: '14px',
                color: isDarkMode ? '#94A3B8' : '#64748B',
              }}>
                Searching this user's mailbox
              </div>
            </div>

            {/* Search Parameters */}
            <div style={{
              marginBottom: '24px',
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: isDarkMode ? '#94A3B8' : '#64748B',
                marginBottom: '16px',
              }}>
                Search Parameters
              </div>

              {/* Fee Earner Email Input */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isDarkMode ? '#CBD5E1' : '#475569',
                  marginBottom: '8px',
                }}>
                  Fee Earner Email Address
                </label>
                <input
                  type="email"
                  value={emailSyncData.feeEarnerEmail}
                  onChange={(e) => setEmailSyncData({ ...emailSyncData, feeEarnerEmail: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#FFFFFF',
                    color: isDarkMode ? '#F1F5F9' : '#0F172A',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = colours.highlight;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.15)'}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Prospect Email Input */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isDarkMode ? '#CBD5E1' : '#475569',
                  marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Prospect Email Address</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isDarkMode ? '#94A3B8' : '#64748B',
                    }}>
                      ({enquiry.First_Name} {enquiry.Last_Name})
                    </span>
                  </div>
                </label>
                <input
                  type="email"
                  value={emailSyncData.prospectEmail}
                  onChange={(e) => setEmailSyncData({ ...emailSyncData, prospectEmail: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#FFFFFF',
                    color: isDarkMode ? '#F1F5F9' : '#0F172A',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = colours.highlight;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.15)'}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Info Banner */}
            <div style={{
              background: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
              border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)'}`,
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '24px',
              display: 'flex',
              gap: '12px',
            }}>
              <FaInfoCircle style={{ 
                color: '#3B82F6',
                fontSize: '16px',
                marginTop: '2px',
                flexShrink: 0,
              }} />
              <div style={{
                fontSize: '13px',
                lineHeight: '1.6',
                color: isDarkMode ? '#CBD5E1' : '#475569',
              }}>
                Will search for emails <strong>to</strong> or <strong>from</strong> the prospect address in the fee earner's mailbox
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button style={{
                padding: '12px 24px',
                background: 'transparent',
                border: `2px solid ${isDarkMode ? '#475569' : '#CBD5E1'}`,
                borderRadius: '8px',
                color: isDarkMode ? '#F1F5F9' : '#0F172A',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.borderColor = isDarkMode ? '#64748B' : '#94A3B8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = isDarkMode ? '#475569' : '#CBD5E1';
              }}
              onClick={() => {
                setShowEmailConfirm(false);
                setEmailSyncData(null);
              }}
              >
                Cancel
              </button>

              <button style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #3690CE 0%, #2563EB 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(54, 144, 206, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(54, 144, 206, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(54, 144, 206, 0.3)';
              }}
              onClick={executeEmailSync}
              >
                <FaEnvelope />
                Search Inbox
              </button>
            </div>

            {/* CSS Animations */}
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from {
                  opacity: 0;
                  transform: translateY(20px) scale(0.95);
                }
                to {
                  opacity: 1;
                  transform: translateY(0) scale(1);
                }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Forward Email Dialog */}
      {showForwardDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <div style={{
            background: isDarkMode ? 'linear-gradient(135deg, #0D1B38 0%, #1A2845 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            borderRadius: '16px',
            boxShadow: isDarkMode 
              ? '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(148, 163, 184, 0.2)' 
              : '0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(148, 163, 184, 0.1)',
            padding: '32px',
            width: '90%',
            maxWidth: '520px',
            animation: 'slideUp 0.3s ease-out',
          }}>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 700,
              color: isDarkMode ? '#F1F5F9' : '#0F172A',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <FaEnvelope style={{ fontSize: '16px', color: colours.highlight }} />
              Forward Email
            </h3>

            <p style={{
              margin: '0 0 24px 0',
              fontSize: '13px',
              color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
              lineHeight: '1.5',
            }}>
              Forward <strong>{forwardEmail?.subject}</strong> to your inbox
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                marginBottom: '8px',
              }}>
                To:
              </label>
              <input
                type="text"
                value={userEmail || ''}
                disabled
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '13px',
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(241, 245, 249, 0.8)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(203, 213, 225, 0.6)'}`,
                  borderRadius: '8px',
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.5)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                marginBottom: '8px',
              }}>
                CC: (optional)
              </label>
              <input
                type="email"
                value={forwardCc}
                onChange={(e) => setForwardCc(e.target.value)}
                placeholder="email@example.com"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '13px',
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : '#FFFFFF',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(203, 213, 225, 0.6)'}`,
                  borderRadius: '8px',
                  color: isDarkMode ? '#E2E8F0' : '#0F172A',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colours.highlight;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)'}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(203, 213, 225, 0.6)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${isDarkMode ? '#475569' : '#CBD5E1'}`,
                  borderRadius: '8px',
                  color: isDarkMode ? '#F1F5F9' : '#0F172A',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                  e.currentTarget.style.borderColor = isDarkMode ? '#64748B' : '#94A3B8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = isDarkMode ? '#475569' : '#CBD5E1';
                }}
                onClick={() => {
                  setShowForwardDialog(false);
                  setForwardEmail(null);
                  setForwardCc('');
                }}
              >
                Cancel
              </button>

              <button
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #3690CE 0%, #2563EB 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(54, 144, 206, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(54, 144, 206, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(54, 144, 206, 0.3)';
                }}
                onClick={handleForwardEmail}
              >
                <FaArrowRight />
                Forward
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDocument && previewDocument.metadata && (
        <DocumentPreviewModal
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Request Docs Confirmation Modal */}
      {docRequestConfirmOpen
        ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDocRequestConfirmOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: isDarkMode ? 'rgba(2, 6, 23, 0.80)' : 'rgba(15, 23, 42, 0.50)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
            }}
          >
            <div
              style={{
                width: 'min(680px, 96vw)',
                borderRadius: '8px',
                border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.20)' : 'rgba(54, 144, 206, 0.25)'}`,
                background: isDarkMode ? 'rgb(17, 24, 39)' : 'rgb(255, 255, 255)',
                padding: '32px',
                boxShadow: isDarkMode 
                  ? '0 20px 60px rgba(0, 0, 0, 0.6)'
                  : '0 20px 60px rgba(0, 0, 0, 0.15)',
              }}
            >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '24px' }}>
              <div>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: '20px', 
                  fontWeight: 700, 
                  color: isDarkMode ? 'rgb(249, 250, 251)' : colours.light.text,
                  marginBottom: '8px',
                }}>
                  Request Documents
                </h2>
                <p style={{ 
                  margin: 0, 
                  fontSize: '13px', 
                  color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.7)',
                  lineHeight: 1.5,
                }}>
                  Create a secure workspace for document collection and collaboration
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocRequestConfirmOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.5)',
                  cursor: 'pointer',
                  fontSize: '24px',
                  lineHeight: 1,
                  padding: '4px',
                }}
              >
                ×
              </button>
            </div>

            {/* Upload location info */}
            <div style={{ 
              marginBottom: '28px',
              padding: '16px',
              borderRadius: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
            }}>
              <div style={{ 
                fontSize: '11px', 
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)',
                marginBottom: '8px',
              }}>
                Document Storage
              </div>
              <div style={{ 
                fontSize: '13px', 
                color: isDarkMode ? 'rgb(209, 213, 219)' : 'rgba(15, 23, 42, 0.85)',
                fontFamily: 'Consolas, Monaco, monospace',
              }}>
                enquiries/{String(enquiry?.ID ?? '')}/
              </div>
            </div>

            {/* Workspace link preview */}
            <div style={{
              marginBottom: '28px',
              padding: '16px',
              borderRadius: '6px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.20)'}`,
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)',
                marginBottom: '8px',
              }}>
                Workspace Link
              </div>
              {(() => {
                const base = String(process.env.REACT_APP_PITCH_BACKEND_URL || 'https://instruct.helix-law.com').replace(/\/$/, '');
                const passcode = docRequestResult?.passcode;
                if (!passcode) {
                  return (
                    <div style={{
                      fontSize: '13px',
                      color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)',
                      lineHeight: 1.5,
                    }}>
                      Link will appear after you create the workspace.
                    </div>
                  );
                }

                const prefix = `${base}/pitch/`;

                return (
                  <div style={{
                    fontSize: '13px',
                    color: isDarkMode ? 'rgb(209, 213, 219)' : 'rgba(15, 23, 42, 0.85)',
                    fontFamily: 'Consolas, Monaco, monospace',
                    wordBreak: 'break-all',
                  }}>
                    <span>{prefix}</span>
                    <span style={{
                      background: isDarkMode ? 'rgba(135, 243, 243, 0.18)' : 'rgba(54, 144, 206, 0.12)',
                      border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.18)'}`,
                      color: isDarkMode ? colours.accent : colours.highlight,
                      fontWeight: 700,
                      borderRadius: '3px',
                      padding: '0 4px',
                    }}>
                      {passcode}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Form fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Area of work & Worktype */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: isDarkMode ? 'rgb(209, 213, 219)' : 'rgba(15, 23, 42, 0.85)',
                  }}>
                    Area of Work
                  </label>
                  <select
                    value={docRequestAreaOfWork}
                    onChange={(e) => {
                      const nextArea = e.target.value;
                      setDocRequestAreaOfWork(nextArea);
                      setDocRequestWorktype('');
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '4px',
                      border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(148, 163, 184, 0.30)'}`,
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.40)' : 'rgba(255, 255, 255, 0.95)',
                      color: isDarkMode ? 'rgb(226, 232, 240)' : 'rgba(15, 23, 42, 0.90)',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {Object.keys(practiceAreasByArea).map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: isDarkMode ? 'rgb(209, 213, 219)' : 'rgba(15, 23, 42, 0.85)',
                  }}>
                    Work Type
                  </label>
                  <select
                    value={docRequestWorktype}
                    onChange={(e) => setDocRequestWorktype(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '4px',
                      border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(148, 163, 184, 0.30)'}`,
                      background: isDarkMode ? 'rgba(2, 6, 23, 0.40)' : 'rgba(255, 255, 255, 0.95)',
                      color: isDarkMode ? 'rgb(226, 232, 240)' : 'rgba(15, 23, 42, 0.90)',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>
                      Select work type
                    </option>
                    {docRequestWorktypeOptions.map((wt) => (
                      <option key={wt} value={wt}>
                        {wt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Skip deal details option */}
              <div style={{ 
                padding: '16px',
                borderRadius: '6px',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.20)'}`,
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={docRequestDealIsNa}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDocRequestDealIsNa(checked);
                      if (checked) {
                        setDocRequestAmount('0.00');
                        setDocRequestServiceDescription('Document request');
                      }
                    }}
                    style={{
                      marginTop: '2px',
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 600, 
                      color: isDarkMode ? 'rgb(226, 232, 240)' : 'rgba(15, 23, 42, 0.85)',
                      marginBottom: '4px',
                    }}>
                      Skip Deal Details
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)',
                      lineHeight: 1.5,
                    }}>
                      Creates workspace link only without recording deal information in the system
                    </div>
                  </div>
                </label>
              </div>
 
              {/* Deal details (conditionally shown) */}
              {!docRequestDealIsNa ? (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '20px',
                  padding: '20px',
                  borderRadius: '6px',
                  background: isDarkMode ? 'rgba(135, 243, 243, 0.04)' : 'rgba(54, 144, 206, 0.03)',
                  border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.12)'}`,
                }}>
                  <div style={{ 
                    fontSize: '13px', 
                    fontWeight: 600,
                    color: isDarkMode ? 'rgb(209, 213, 219)' : 'rgba(15, 23, 42, 0.85)',
                    marginBottom: '4px',
                  }}>
                    Deal Information
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ 
                        fontSize: '13px', 
                        fontWeight: 600, 
                        color: isDarkMode ? 'rgb(209, 213, 219)' : 'rgba(15, 23, 42, 0.85)',
                      }}>
                        Service Description
                      </label>
                      <input
                        value={docRequestServiceDescription}
                        onChange={(e) => setDocRequestServiceDescription(e.target.value)}
                        placeholder="e.g., Document request, Initial review"
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: '4px',
                          border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(148, 163, 184, 0.30)'}`,
                          background: isDarkMode ? 'rgba(2, 6, 23, 0.40)' : 'rgba(255, 255, 255, 0.95)',
                          color: isDarkMode ? 'rgb(226, 232, 240)' : 'rgba(15, 23, 42, 0.90)',
                          fontSize: '14px',
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ 
                        fontSize: '13px', 
                        fontWeight: 600, 
                        color: isDarkMode ? 'rgb(209, 213, 219)' : 'rgba(15, 23, 42, 0.85)',
                      }}>
                        Amount
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            left: '14px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.5)',
                            pointerEvents: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          <FaPoundSign size={13} />
                        </span>
                        <input
                          value={docRequestAmount}
                          onChange={(e) => handleDocRequestAmountChange(e.target.value)}
                          onBlur={handleDocRequestAmountBlur}
                          placeholder="0.00"
                          inputMode="decimal"
                          style={{
                            width: '100%',
                            padding: '12px 14px 12px 36px',
                            borderRadius: '4px',
                            border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(148, 163, 184, 0.30)'}`,
                            background: isDarkMode ? 'rgba(2, 6, 23, 0.40)' : 'rgba(255, 255, 255, 0.95)',
                            color: isDarkMode ? 'rgb(226, 232, 240)' : 'rgba(15, 23, 42, 0.90)',
                            fontSize: '14px',
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => adjustDocRequestAmount(50)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`,
                            background: isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                            color: isDarkMode ? colours.accent : colours.highlight,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.20)' : 'rgba(54, 144, 206, 0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)';
                          }}
                        >
                          +50
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustDocRequestAmount(-50)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.08)',
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.65)' : 'rgba(15, 23, 42, 0.65)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.14)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.08)';
                          }}
                        >
                          -50
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px', paddingTop: '24px', borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.20)'}` }}>
              <button
                type="button"
                onClick={() => setDocRequestConfirmOpen(false)}
                disabled={docRequestLoading}
                style={{
                  padding: '10px 20px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: 'transparent',
                  color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.65)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.30)'}`,
                  cursor: docRequestLoading ? 'default' : 'pointer',
                  opacity: docRequestLoading ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!docRequestLoading) {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestDocuments}
                disabled={docRequestLoading || !requestDocsEnabled}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: docRequestLoading || !requestDocsEnabled 
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(54, 144, 206, 0.5)')
                    : colours.highlight,
                  color: '#ffffff',
                  border: 'none',
                  cursor: docRequestLoading || !requestDocsEnabled ? 'default' : 'pointer',
                  boxShadow: docRequestLoading || !requestDocsEnabled 
                    ? 'none'
                    : '0 2px 8px rgba(54, 144, 206, 0.25)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!docRequestLoading && requestDocsEnabled) {
                    e.currentTarget.style.background = isDarkMode ? 'rgb(65, 165, 225)' : 'rgb(44, 124, 186)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(54, 144, 206, 0.35)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!docRequestLoading && requestDocsEnabled) {
                    e.currentTarget.style.background = colours.highlight;
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(54, 144, 206, 0.25)';
                  }
                }}
              >
                {docRequestLoading ? 'Creating workspace…' : 'Create Workspace'}
              </button>
            </div>
          </div>
        </div>,
          document.body
        )
        : null}

      {/* Pitch confirmation and scenario picker modal */}
      {renderPitchConfirmModal()}

      {/* Hidden Items Panel Trigger */}
      {hiddenItemIds.size > 0 && (
        <button
          onClick={() => setHiddenPanelOpen(true)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '8px',
            background: isDarkMode
              ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)'
              : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.35)'}`,
            boxShadow: isDarkMode
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(148, 163, 184, 0.1)'
              : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(148, 163, 184, 0.08)',
            cursor: 'pointer',
            zIndex: 100,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = isDarkMode
              ? '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.15)'
              : '0 12px 40px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(148, 163, 184, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = isDarkMode
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(148, 163, 184, 0.1)'
              : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(148, 163, 184, 0.08)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.7)',
          }}>
            Hidden
          </span>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '10px',
            background: isDarkMode ? 'rgba(253, 230, 138, 0.2)' : 'rgba(180, 83, 9, 0.12)',
            color: isDarkMode ? 'rgba(253, 230, 138, 0.95)' : 'rgb(180, 83, 9)',
          }}>
            {hiddenItemIds.size}
          </span>
        </button>
      )}

      {/* Hidden Items Side Panel */}
      {hiddenPanelOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1001,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setHiddenPanelOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: isDarkMode ? 'rgba(2, 6, 23, 0.6)' : 'rgba(15, 23, 42, 0.3)',
              backdropFilter: 'blur(2px)',
              animation: 'fadeIn 0.2s ease',
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: 'relative',
              width: '380px',
              maxWidth: '90vw',
              height: '100%',
              background: isDarkMode
                ? 'linear-gradient(180deg, rgb(17, 24, 39) 0%, rgb(15, 23, 42) 100%)'
                : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              borderLeft: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'}`,
              boxShadow: isDarkMode
                ? '-8px 0 32px rgba(0, 0, 0, 0.5)'
                : '-8px 0 32px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.25s ease',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 20px 16px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.18)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? 'rgba(253, 230, 138, 0.8)' : 'rgb(180, 83, 9)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <span style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: isDarkMode ? 'rgb(249, 250, 251)' : colours.light.text,
                }}>
                  Hidden Items
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: isDarkMode ? 'rgba(253, 230, 138, 0.15)' : 'rgba(180, 83, 9, 0.1)',
                  color: isDarkMode ? 'rgba(253, 230, 138, 0.9)' : 'rgb(180, 83, 9)',
                }}>
                  {hiddenItemIds.size}
                </span>
              </div>
              <button
                onClick={() => setHiddenPanelOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  background: 'transparent',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.5)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                  e.currentTarget.style.color = isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.5)';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Actions bar */}
            <div style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.12)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => {
                  unhideAllItems();
                  setHiddenPanelOpen(false);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
                  border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.25)'}`,
                  borderRadius: '4px',
                  color: isDarkMode ? 'rgb(134, 239, 172)' : 'rgb(22, 163, 74)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)';
                }}
              >
                Restore all
              </button>
            </div>

            {/* Hidden items list */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
            }}>
              {(() => {
                const hiddenItems = timeline.filter((item) => hiddenItemIds.has(item.id));
                
                if (hiddenItems.length === 0) {
                  return (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.4)' : 'rgba(15, 23, 42, 0.4)',
                      fontSize: '13px',
                    }}>
                      No hidden items
                    </div>
                  );
                }

                // Group by type
                const groupedByType = new Map<CommunicationType, TimelineItem[]>();
                for (const item of hiddenItems) {
                  const list = groupedByType.get(item.type) || [];
                  list.push(item);
                  groupedByType.set(item.type, list);
                }

                const typeOrder: CommunicationType[] = ['email', 'call', 'pitch', 'document', 'instruction', 'note'];
                const sortedTypes = Array.from(groupedByType.keys()).sort(
                  (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
                );

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {sortedTypes.map((type) => {
                      const items = groupedByType.get(type) || [];
                      const typeColor = getTypeColor(type);
                      const typeLabel = getTypeLabel(type);

                      return (
                        <div key={type}>
                          {/* Type header */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '10px',
                            paddingBottom: '6px',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`,
                          }}>
                            <span style={{ color: typeColor, display: 'flex', alignItems: 'center' }}>
                              {getTypeIcon(type)}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.55)',
                            }}>
                              {typeLabel}s
                            </span>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: '8px',
                              background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.45)',
                            }}>
                              {items.length}
                            </span>
                          </div>

                          {/* Items */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {items
                              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                              .map((item) => {
                                const itemDate = (() => {
                                  try {
                                    const d = parseISO(item.date);
                                    return Number.isFinite(d.getTime()) ? d : new Date();
                                  } catch {
                                    return new Date();
                                  }
                                })();

                                return (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '8px 10px',
                                      borderRadius: '4px',
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.1)'}`,
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)';
                                    }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.8)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {item.type === 'pitch' && item.metadata?.scenarioId
                                          ? getScenarioName(item.metadata.scenarioId)
                                          : item.subject}
                                      </div>
                                      <div style={{
                                        fontSize: '10px',
                                        color: isDarkMode ? 'rgba(226, 232, 240, 0.45)' : 'rgba(15, 23, 42, 0.45)',
                                        marginTop: '2px',
                                      }}>
                                        {format(itemDate, 'd MMM yyyy')}
                                        {item.createdBy && ` • ${item.createdBy}`}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => toggleHideItem(item.id)}
                                      title="Restore this item"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '26px',
                                        height: '26px',
                                        padding: 0,
                                        background: isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)'}`,
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        color: isDarkMode ? 'rgb(134, 239, 172)' : 'rgb(22, 163, 74)',
                                        transition: 'all 0.15s ease',
                                        flexShrink: 0,
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)';
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                      </svg>
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notifications */}
      <OperationStatusToast
        visible={toast !== null}
        message={toast?.message || ''}
        type={toast?.type || 'info'}
        loading={toast?.loading}
        details={toast?.details}
        progress={toast?.progress}
      />
    </div>
  );
};

export default EnquiryTimeline;
