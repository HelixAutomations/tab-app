import React, { useState, useEffect } from 'react';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import SectionCard from '../home/SectionCard';
import { useTheme } from '../../app/functionality/ThemeContext';
import { FaEnvelope, FaPhone, FaFileAlt, FaCheckCircle, FaCircle, FaArrowRight, FaUser, FaCalendar, FaInfoCircle, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { parseISO, format, differenceInDays } from 'date-fns';
import OperationStatusToast from './pitch-builder/OperationStatusToast';

// Add spinner animation
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
if (!document.head.querySelector('style[data-spinner]')) {
  spinnerStyle.setAttribute('data-spinner', 'true');
  document.head.appendChild(spinnerStyle);
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

type CommunicationType = 'pitch' | 'email' | 'call' | 'instruction' | 'note' | 'document';

interface TimelineItem {
  id: string;
  type: CommunicationType;
  date: string;
  subject: string;
  content?: string;
  contentHtml?: string;
  createdBy: string;
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
    stageUploaded?: 'enquiry' | 'pitch' | 'instruction';
    documentId?: number;          // Database ID for preview URL fetch
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

        const docId = document.metadata?.documentId;

        if (!docId) {
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

        // Prefer proxying a provided blob URL (if it is an Azure blob URL).
        if (typeof blobUrl === 'string' && blobUrl.startsWith('http')) {
          const base = `/api/prospect-documents/proxy?url=${encodeURIComponent(blobUrl)}&filename=${encodeURIComponent(filename)}`;
          setPreviewUrl(base);
          setDownloadUrl(`${base}&download=true`);
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
            <iframe
              src={previewUrl}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '500px',
                border: 'none',
                borderRadius: '8px',
              }}
              title={filename}
            />
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

interface EnquiryTimelineProps {
  enquiry: Enquiry;
  showDataLoadingStatus?: boolean;
  userInitials?: string;
  userEmail?: string;
  featureToggles?: Record<string, boolean>;
}

const EnquiryTimeline: React.FC<EnquiryTimelineProps> = ({ enquiry, showDataLoadingStatus = true, userInitials, userEmail, featureToggles }) => {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<CommunicationType[]>([]);
  const [expandedQuickAccessEmailIds, setExpandedQuickAccessEmailIds] = useState<Set<string>>(() => new Set());
  const [loadingStates, setLoadingStates] = useState({
    pitches: true,
    emails: true,
    calls: true,
    documents: true,
  });
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
  const isProductionBuild = process.env.NODE_ENV === 'production';
  const showResourcesConcept = process.env.NODE_ENV === 'development' && !isProductionPreview;
  const requestDocsEnabled = !isProductionBuild && !isProductionPreview;

  // Timeline access - unlocked for all users
  const [timelineUnlocked] = useState<boolean>(true);

  // Doc request state
  const [docRequestLoading, setDocRequestLoading] = useState(false);
  const [docRequestResult, setDocRequestResult] = useState<{
    passcode: string;
    urlPath: string;
  } | null>(null);

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

  // Request Documents - creates a DOC_REQUEST deal and generates a shareable link
  const handleRequestDocuments = async () => {
    if (!requestDocsEnabled) {
      showToast('Request Docs is not available in production yet', 'info');
      return;
    }
    if (!userEmail) {
      showToast('User email not available', 'error');
      return;
    }

    setDocRequestLoading(true);
    showToast('Creating document request link...', 'info', { loading: true, duration: 0 });

    try {
      const pitchBackendUrl = process.env.REACT_APP_PITCH_BACKEND_URL || 'https://instruct.helix-law.com';
      
      const response = await fetch(`${pitchBackendUrl}/api/doc-request-deals/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiry_id: enquiry.ID,
          requested_by: userEmail,
          service_description: enquiry.Area_of_Work || 'Document Request',
          area_of_work: enquiry.Area_of_Work || 'Onboarding',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Failed to create document request');
      }

      const data = await response.json();
      setDocRequestResult({ passcode: data.passcode, urlPath: data.urlPath });

      // Copy link to clipboard
      const fullUrl = `${pitchBackendUrl}${data.urlPath}`;
      await navigator.clipboard.writeText(fullUrl);

      showToast(`Link copied! Passcode: ${data.passcode}`, 'success', { duration: 6000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create document request';
      showToast(message, 'error');
    } finally {
      setDocRequestLoading(false);
    }
  };

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
    const fetchTimeline = async () => {
      setLoading(true);
      const timelineItems: TimelineItem[] = [];
      const statusMap: {[pitchId: string]: InstructionStatus} = {};

      // ─── SYNTHETIC DATA FOR DEV PREVIEW TEST RECORD ──────────────────────────
      // Inject comprehensive test data to preview all timeline features
      // This block returns early to skip all API fetches for the test record
      if (enquiry.ID === 'DEV-PREVIEW-99999') {
        const now = new Date();
        
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
        timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setTimeline(timelineItems);
        setInstructionStatuses(statusMap);
        setLoadingStates({ pitches: false, emails: false, calls: false, documents: false });
        setCompletedSources({ pitches: true, emails: true });
        if (timelineItems.length > 0) {
          setSelectedItem(timelineItems[0]);
        }
        setLoading(false);
        return; // Skip all API fetches for test record
      }
      // ─── END SYNTHETIC DATA ──────────────────────────────────────────────────

      // Fetch pitches
      try {
        const pitchesRes = await fetch(`/api/pitches/${enquiry.ID}`);
        if (pitchesRes.ok) {
          const pitchesData = await pitchesRes.json();
          const pitches = pitchesData.pitches || [];
          
          // For each pitch, try to fetch corresponding instruction data
          for (let index = 0; index < pitches.length; index++) {
            const pitch = pitches[index];
            
            const pitchId = `pitch-${index}`;
            timelineItems.push({
              id: pitchId,
              type: 'pitch',
              date: pitch.CreatedAt,
              subject: pitch.EmailSubject || 'Pitch Sent',
              content: pitch.EmailBody,
              contentHtml: pitch.EmailBodyHtml,
              createdBy: pitch.CreatedBy || 'Unknown',
              metadata: {
                amount: pitch.Amount,
                status: 'sent',
                scenarioId: pitch.ScenarioId
              }
            });

            // Try to fetch instruction data for this pitch
            if (pitch.ProspectId) {
              try {
                const instructionRes = await fetch(`/api/instruction-data/${pitch.ProspectId}`);
                if (instructionRes.ok) {
                  const instructionData = await instructionRes.json();
                  if (instructionData) {
                    const status = calculateInstructionStatus(instructionData);
                    statusMap[pitchId] = status;
                  }
                }
              } catch (error) {
                console.error(`Failed to fetch instruction data for prospect ${pitch.ProspectId}:`, error);
              }
            }
          }
        }
        setLoadingStates(prev => ({ ...prev, pitches: false }));
        setCompletedSources(prev => ({ ...prev, pitches: true }));
      } catch (error) {
        console.error('Failed to fetch pitches:', error);
        setLoadingStates(prev => ({ ...prev, pitches: false }));
        setCompletedSources(prev => ({ ...prev, pitches: true }));
      }

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

            timelineItems.push(...emailItems);
          } else {
            console.error('Failed to auto-fetch emails:', response.status);
          }
        }
        setLoadingStates(prev => ({ ...prev, emails: false }));
        setCompletedSources(prev => ({ ...prev, emails: true }));
      } catch (error) {
        console.error('Failed to auto-fetch emails:', error);
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

            timelineItems.push(...callItems);
          } else {
            console.error('Failed to auto-fetch CallRail calls:', response.status);
          }
        }
        setLoadingStates(prev => ({ ...prev, calls: false }));
      } catch (error) {
        console.error('Failed to auto-fetch CallRail calls:', error);
        setLoadingStates(prev => ({ ...prev, calls: false }));
      }

      // Fetch prospect documents from pitch backend (skip in local dev if backend unavailable)
      try {
        const pitchBackendUrl = process.env.REACT_APP_PITCH_BACKEND_URL || 'https://instruct.helix-law.com';
        // Use AbortController with timeout to avoid long waits if backend is unreachable
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const docsRes = await fetch(`${pitchBackendUrl}/api/prospect-documents?enquiry_id=${enquiry.ID}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (docsRes.ok) {
          const docsData = await docsRes.json();
          const documents = Array.isArray(docsData) ? docsData : [];
        
          const docItems: TimelineItem[] = documents.map((doc: any) => ({
            id: `document-${doc.id}`,
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
              stageUploaded: doc.stage_uploaded,
              documentId: doc.id,
            }
          }));
        
          timelineItems.push(...docItems);
        }
        setLoadingStates(prev => ({ ...prev, documents: false }));
      } catch (error) {
        // Silently handle - pitch backend may be unavailable in local dev
        if (process.env.NODE_ENV === 'development') {
          console.debug('Prospect documents unavailable (pitch backend not reachable)');
        }
        setLoadingStates(prev => ({ ...prev, documents: false }));
      }

      // Sort timeline by date (newest first)
      timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTimeline(timelineItems);
      setInstructionStatuses(statusMap);
      if (timelineItems.length > 0) {
        setSelectedItem(timelineItems[0]);
      }
      
      setLoading(false);
    };

    fetchTimeline();
  }, [enquiry.ID, timelineUnlocked]);

  const getTypeIcon = (type: CommunicationType) => {
    switch (type) {
      case 'pitch':
        return <FaEnvelope />;
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

  const getTypeLabel = (type: CommunicationType) => {
    switch (type) {
      case 'pitch':
        return 'Pitch Sent';
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

  const quickAccessTypes: CommunicationType[] = ['document', 'email', 'call', 'pitch', 'instruction'];
  const getQuickAccessCount = (type: CommunicationType) => timeline.filter((item) => item.type === type).length;
  const quickAccessItems = activeFilters.length > 0
    ? timeline.filter((item) => activeFilters.includes(item.type))
    : [];
  const selectedQuickAccessTypes = quickAccessTypes.filter((t) => activeFilters.includes(t));

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
    
    // Use test data for now, replace with actual status when API is ready
    const testStatus = {
      verifyIdStatus: 'complete',
      paymentStatus: 'processing', 
      riskStatus: 'pending',
      matterStatus: 'pending',
      cclStatus: 'pending'
    };

    const activeStatus = status || testStatus;

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
          ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
          : 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
        borderRadius: '2px',
        border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.2)'}`,
        padding: '12px 16px',
        marginTop: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        {/* Left: Client Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '300px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '2px',
            background: isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDarkMode ? 'rgb(135, 243, 243)' : colours.highlight,
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
              {enquiry.ID} • {enquiry.Point_of_Contact || '—'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (!enquiry.Email) {
                showToast('Email not available', 'error');
                return;
              }
              try {
                window.open(`mailto:${enquiry.Email}`, '_blank');
              } catch {
                // ignore
              }
            }}
            disabled={!enquiry.Email}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '6px 12px',
              cursor: enquiry.Email ? 'pointer' : 'default',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: enquiry.Email ? 1 : 0.5,
            }}
          >
            <FaEnvelope size={11} />
            <span>Email</span>
          </button>

          <button
            onClick={() => {
              if (!enquiry.Phone_Number) {
                showToast('Phone number not available', 'error');
                return;
              }
              try {
                window.open(`tel:${enquiry.Phone_Number}`, '_blank');
              } catch {
                // ignore
              }
            }}
            disabled={!enquiry.Phone_Number}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '6px 12px',
              cursor: enquiry.Phone_Number ? 'pointer' : 'default',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: enquiry.Phone_Number ? 1 : 0.5,
            }}
          >
            <FaPhone size={11} />
            <span>Call</span>
          </button>

          <button
            onClick={handleRequestDocuments}
            disabled={docRequestLoading || !requestDocsEnabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '6px 12px',
              cursor: docRequestLoading || !requestDocsEnabled ? 'default' : 'pointer',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: !requestDocsEnabled ? 0.45 : 1,
            }}
          >
            {docRequestLoading ? (
              <div style={{ width: '12px', height: '12px', border: '2px solid rgba(135, 243, 243, 0.2)', borderTop: `2px solid ${colours.accent}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            ) : (
              <FaArrowRight size={11} />
            )}
            <span>{docRequestResult ? 'Link Copied' : 'Request Docs'}</span>
          </button>

          <button
            disabled
            aria-disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '6px 12px',
              cursor: 'default',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: 0.45,
            }}
          >
            <span>Request structured data</span>
          </button>
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

        {quickAccessItems.length === 0 ? (
          <div style={{
            padding: '12px 0',
            color: isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.5)',
            fontSize: '12px',
          }}>
            No items for the selected filters yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {quickAccessItems.map((item) => {
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
                          onClick={() => {
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
          padding: '20px',
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
            gap: '8px',
            alignItems: 'center',
          }}>
            <div style={{
              color: isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(15, 23, 42, 0.6)',
              fontSize: '10px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}>
              Filter
            </div>
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
                statusColor = colours.accent; // Helix teal
              } else {
                statusColor = '#10b981'; // Emerald
              }
              
              return (
                <button
                  key={type}
                  onClick={() => {
                    if (count > 0) toggleActiveFilter(type as CommunicationType);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: isActive
                      ? (isDarkMode ? `${statusColor}20` : `${statusColor}15`)
                      : (count > 0 ? (isDarkMode ? `${statusColor}10` : `${statusColor}08`) : 'transparent'),
                    border: `1px solid ${count === 0 ? 'rgba(125, 211, 252, 0.15)' : (isActive ? statusColor : (isDarkMode ? `${statusColor}55` : `${statusColor}40`))}`,
                    borderRadius: '2px',
                    color: count === 0 ? 'rgba(226, 232, 240, 0.4)' : (isActive ? statusColor : (isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)')),
                    cursor: count === 0 ? 'default' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (count > 0 && !isActive) {
                      e.currentTarget.style.borderColor = statusColor;
                      e.currentTarget.style.color = statusColor;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = count === 0 ? 'rgba(125, 211, 252, 0.15)' : (isDarkMode ? `${statusColor}55` : `${statusColor}40`);
                      e.currentTarget.style.color = count === 0 ? 'rgba(226, 232, 240, 0.4)' : (isDarkMode ? 'rgb(156, 163, 175)' : 'rgba(15, 23, 42, 0.6)');
                    }
                  }}
                >
                  <span style={{ 
                    color: 'currentColor', 
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 500,
                  }}>
                    {getTypeIcon(type as CommunicationType)}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'currentColor',
                  }}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {timeline.length > 0 ? (
          <div style={{ position: 'relative', paddingLeft: '32px' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: '11px',
              top: '8px',
              bottom: '8px',
              width: '2px',
              background: isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.15)',
            }} />

            {/* Timeline items */}
            {timeline
              .slice()
              .reverse()
              .map((item, index) => {
              const typeColor = getTypeColor(item.type);
              const isExpanded = selectedItem?.id === item.id;
              const isDimmed = Boolean(activeFilters.length > 0 && !activeFilters.includes(item.type));
              
              return (
                <div
                  key={item.id}
                  id={`timeline-item-${item.id}`}
                  style={{
                    position: 'relative',
                    marginBottom: index < timeline.length - 1 ? '16px' : '0',
                    opacity: isDimmed ? 0.3 : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {/* Dot */}
                  <div style={{
                    position: 'absolute',
                    left: '-26px',
                    top: '2px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: typeColor,
                    border: `2px solid ${isDarkMode ? colours.dark.cardBackground : '#ffffff'}`,
                    zIndex: 1,
                  }} />

                  {/* Expandable item */}
                  <div style={{
                    background: isExpanded 
                      ? isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.05)'
                      : item.type === 'email' && item.metadata?.direction === 'inbound'
                        ? isDarkMode ? 'rgba(34, 197, 94, 0.05)' : 'rgba(34, 197, 94, 0.03)'
                        : item.type === 'email' && item.metadata?.direction === 'outbound'
                          ? isDarkMode ? 'rgba(54, 144, 206, 0.05)' : 'rgba(54, 144, 206, 0.03)'
                          : 'transparent',
                    borderTop: isExpanded 
                      ? `1px solid ${colours.highlight}` 
                      : item.type === 'email' && item.metadata?.direction === 'inbound'
                        ? isDarkMode ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(34, 197, 94, 0.2)'
                        : item.type === 'email' && item.metadata?.direction === 'outbound'
                          ? isDarkMode ? '1px solid rgba(54, 144, 206, 0.3)' : '1px solid rgba(54, 144, 206, 0.2)'
                          : '1px solid transparent',
                    borderRight: isExpanded 
                      ? `1px solid ${colours.highlight}` 
                      : item.type === 'email' && item.metadata?.direction === 'inbound'
                        ? isDarkMode ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(34, 197, 94, 0.2)'
                        : item.type === 'email' && item.metadata?.direction === 'outbound'
                          ? isDarkMode ? '1px solid rgba(54, 144, 206, 0.3)' : '1px solid rgba(54, 144, 206, 0.2)'
                          : '1px solid transparent',
                    borderBottom: isExpanded 
                      ? `1px solid ${colours.highlight}` 
                      : item.type === 'email' && item.metadata?.direction === 'inbound'
                        ? isDarkMode ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(34, 197, 94, 0.2)'
                        : item.type === 'email' && item.metadata?.direction === 'outbound'
                          ? isDarkMode ? '1px solid rgba(54, 144, 206, 0.3)' : '1px solid rgba(54, 144, 206, 0.2)'
                          : '1px solid transparent',
                    borderLeft: isExpanded
                      ? `1px solid ${colours.highlight}`
                      : item.type === 'email' && item.metadata?.direction === 'inbound'
                        ? isDarkMode ? '3px solid rgba(34, 197, 94, 0.6)' : '3px solid rgba(34, 197, 94, 0.5)'
                        : item.type === 'email' && item.metadata?.direction === 'outbound'
                          ? isDarkMode ? '3px solid rgba(54, 144, 206, 0.6)' : '3px solid rgba(54, 144, 206, 0.5)'
                          : '1px solid transparent',
                    borderRadius: '2px',
                    padding: '8px',
                    marginLeft: '-8px',
                    transition: 'all 0.2s ease',
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
                          fontSize: '12px',
                          fontWeight: 600,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          <span style={{ color: typeColor }}>
                            {getTypeIcon(item.type)}
                          </span>
                          {item.type === 'email' && item.metadata?.direction && (
                            <span style={{
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '2px',
                              fontWeight: 600,
                              background: item.metadata.direction === 'inbound'
                                ? isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)'
                                : isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)',
                              color: item.metadata.direction === 'inbound'
                                ? isDarkMode ? 'rgb(134, 239, 172)' : 'rgb(22, 163, 74)'
                                : isDarkMode ? 'rgb(125, 211, 252)' : 'rgb(14, 116, 144)',
                            }}>
                              {item.metadata.direction === 'inbound' ? '← RECEIVED' : 'SENT →'}
                            </span>
                          )}
                          <span>{item.subject}</span>
                        </div>
                        
                        {/* Time and Author - smaller, subtle */}
                        <div style={{
                          fontSize: '10px',
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          <span>{format(parseISO(item.date), 'd MMM yyyy, HH:mm')}</span>
                          {item.createdBy && (
                            <>
                              <span>•</span>
                              <span>{item.createdBy}</span>
                            </>
                          )}
                          {(() => {
                            return item.metadata?.scenarioId ? (
                              <>
                                <span>•</span>
                                <span style={{
                                  fontSize: '9px',
                                  padding: '2px 6px',
                                  borderRadius: '2px',
                                  background: isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                  border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`,
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)',
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
                        gap: '8px',
                      }}>
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
                        {item.contentHtml ? (
                          <div className="helix-email-html" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(item.contentHtml) }} />
                        ) : item.content ? (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div>
                        ) : (
                          <div style={{ 
                            color: isDarkMode ? 'rgba(226, 232, 240, 0.4)' : 'rgba(15, 23, 42, 0.4)',
                            fontStyle: 'italic',
                          }}>
                            No content available
                          </div>
                        )}
                        
                        {/* Forward Email Button for email and pitch items */}
                        {(item.type === 'email' || item.type === 'pitch') && userEmail && (
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
                        {item.type === 'document' && item.metadata && (
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
                        
                        {/* Instruction Status Indicators for Pitches - at bottom of expanded content */}
                        {item.type === 'pitch' && renderInstructionStatus(item.id)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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
          <button
            onClick={() => {
              if (!enquiry.Email) {
                showToast('Email not available', 'error');
                return;
              }
              try {
                window.open(`mailto:${enquiry.Email}`, '_blank');
              } catch {
                // ignore
              }
            }}
            disabled={!enquiry.Email}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '8px 12px',
              cursor: enquiry.Email ? 'pointer' : 'default',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: enquiry.Email ? 1 : 0.5,
            }}
          >
            <FaEnvelope size={11} />
            <span>Email</span>
          </button>

          <button
            onClick={() => {
              if (!enquiry.Phone_Number) {
                showToast('Phone number not available', 'error');
                return;
              }
              try {
                window.open(`tel:${enquiry.Phone_Number}`, '_blank');
              } catch {
                // ignore
              }
            }}
            disabled={!enquiry.Phone_Number}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '8px 12px',
              cursor: enquiry.Phone_Number ? 'pointer' : 'default',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: enquiry.Phone_Number ? 1 : 0.5,
            }}
          >
            <FaPhone size={11} />
            <span>Call</span>
          </button>

          <button
            onClick={handleRequestDocuments}
            disabled={docRequestLoading || !requestDocsEnabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '8px 12px',
              cursor: docRequestLoading || !requestDocsEnabled ? 'default' : 'pointer',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: !requestDocsEnabled ? 0.45 : 1,
            }}
          >
            {docRequestLoading ? (
              <div style={{ width: '12px', height: '12px', border: '2px solid rgba(135, 243, 243, 0.2)', borderTop: `2px solid ${colours.accent}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            ) : (
              <FaArrowRight size={11} />
            )}
            <span>{docRequestResult ? 'Link Copied' : 'Request Docs'}</span>
          </button>

          <button
            disabled
            aria-disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(135, 243, 243, 0.3)'}`,
              borderRadius: '2px',
              padding: '8px 12px',
              cursor: 'default',
              color: isDarkMode ? colours.accent : colours.darkBlue,
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.15s',
              opacity: 0.45,
            }}
          >
            <span>Request structured data</span>
          </button>
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
                      if (!prev) {
                        return prev;
                      }
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
