import React, { useState, useEffect } from 'react';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { FaEnvelope, FaPhone, FaFileAlt, FaCheckCircle, FaCircle, FaArrowRight, FaUser, FaCalendar, FaInfoCircle } from 'react-icons/fa';
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

type CommunicationType = 'pitch' | 'email' | 'call' | 'instruction' | 'note';

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
  };
}

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
}

const EnquiryTimeline: React.FC<EnquiryTimelineProps> = ({ enquiry, showDataLoadingStatus = true, userInitials, userEmail }) => {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<CommunicationType | null>(null);
  const [loadingStates, setLoadingStates] = useState({
    pitches: true,
    emails: true,
    calls: true,
  });
  const [completedSources, setCompletedSources] = useState({
    pitches: false,
    emails: false,
  });
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
  const [requestType, setRequestType] = useState<'support' | 'feedback'>('support');
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [forwardEmail, setForwardEmail] = useState<TimelineItem | null>(null);
  const [forwardCc, setForwardCc] = useState('');
  const { isDarkMode } = useTheme();

  // Simple passcode gate for Timeline access
  const [timelineUnlocked, setTimelineUnlocked] = useState<boolean>(() => {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('timelineUnlocked') === '1';
    } catch {
      return false;
    }
  });
  const [passcode, setPasscode] = useState('');

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
    
    console.log(`Manual sync triggered for: ${syncType}`);
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
      console.log('Email search results:', result);

      // Transform search results into timeline items
      const emailItems: TimelineItem[] = result.emails.map((email: any) => ({
        id: `email-${email.id}`,
        type: 'email' as CommunicationType,
        date: email.receivedDateTime,
        subject: email.subject,
        content: email.bodyPreview,
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

      // Fetch pitches
      try {
        const pitchesRes = await fetch(`/api/pitches/${enquiry.ID}`);
        if (pitchesRes.ok) {
          const pitchesData = await pitchesRes.json();
          console.log('🔍 Pitches API response:', pitchesData);
          const pitches = pitchesData.pitches || [];
          
          // For each pitch, try to fetch corresponding instruction data
          for (let index = 0; index < pitches.length; index++) {
            const pitch = pitches[index];
            console.log(`🔍 Pitch ${index} - ScenarioId: "${pitch.ScenarioId}"`);
            
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
                console.log(`🔍 Fetching instruction data for ProspectId: ${pitch.ProspectId}`);
                const instructionRes = await fetch(`/api/instruction-data/${pitch.ProspectId}`);
                console.log(`📡 Instruction API response status: ${instructionRes.status}`);
                if (instructionRes.ok) {
                  const instructionData = await instructionRes.json();
                  console.log(`📋 Instruction data received:`, instructionData);
                  if (instructionData) {
                    const status = calculateInstructionStatus(instructionData);
                    console.log(`✅ Calculated status for ${pitchId}:`, status);
                    statusMap[pitchId] = status;
                  }
                } else {
                  console.log(`❌ Instruction API failed with status: ${instructionRes.status}`);
                }
              } catch (error) {
                console.error(`Failed to fetch instruction data for prospect ${pitch.ProspectId}:`, error);
              }
            } else {
              console.log(`⚠️ No ProspectId found for pitch ${index}`);
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

          console.log(`📧 Auto-fetching emails: ${feeEarnerEmail} ↔ ${prospectEmail}`);
          
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
            console.log(`📧 Found ${result.emails.length} emails automatically`);

            const emailItems: TimelineItem[] = result.emails.map((email: any) => ({
              id: `email-${email.id}`,
              type: 'email' as CommunicationType,
              date: email.receivedDateTime,
              subject: email.subject,
              content: email.bodyPreview,
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
        } else {
          console.log('⚠️ Missing Point_of_Contact or Email for auto-fetch');
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
          console.log(`📞 Auto-fetching CallRail calls for: ${phoneNumber}`);
          
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
            console.log(`📞 Found ${result.calls.length} calls from CallRail`);

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
        } else {
          console.log('⚠️ Missing Phone_Number for CallRail lookup');
        }
        setLoadingStates(prev => ({ ...prev, calls: false }));
      } catch (error) {
        console.error('Failed to auto-fetch CallRail calls:', error);
        setLoadingStates(prev => ({ ...prev, calls: false }));
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

  const handleUnlock = () => {
    if (passcode.trim() === '2011') {
      try { sessionStorage.setItem('timelineUnlocked', '1'); } catch {/* ignore */}
      setTimelineUnlocked(true);
      setPasscode('');
      showToast('Timeline unlocked', 'success');
    } else {
      showToast('Incorrect passcode', 'error');
    }
  };

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
      case 'note':
        return 'Note';
      default:
        return 'Activity';
    }
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
    console.log(`🎯 Rendering status for ${itemId}, available statuses:`, Object.keys(instructionStatuses));
    const status = instructionStatuses[itemId];
    console.log(`📊 Status for ${itemId}:`, status);
    
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

  if (!timelineUnlocked) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        fontFamily: 'Raleway, sans-serif',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
          background: isDarkMode ? 'rgba(7,16,32,0.8)' : 'rgba(255,255,255,0.9)',
          boxShadow: isDarkMode ? 'rgba(2, 6, 23, 0.3) 0 6px 24px' : 'rgba(15, 23, 42, 0.08) 0 6px 24px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: isDarkMode ? '#E2E8F0' : '#0F172A' }}>
            Enter passcode to view Timeline
          </div>
          <div style={{ fontSize: 11, color: isDarkMode ? 'rgba(226,232,240,0.7)' : 'rgba(15,23,42,0.7)', marginBottom: 10 }}>
            This section is protected. Please enter the passcode to continue.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              placeholder="Passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.35)'}`,
                background: isDarkMode ? 'rgba(2,6,23,0.6)' : 'rgba(255,255,255,0.95)',
                color: isDarkMode ? '#E2E8F0' : '#0F172A',
                fontSize: 12,
              }}
            />
            <button
              onClick={handleUnlock}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.35)' : 'rgba(54, 144, 206, 0.5)'}`,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
                color: isDarkMode ? '#7DD3FC' : '#3690CE',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Do not block the page behind a global loader; render the container and let
  // dataset-level spinners indicate progress as data arrives.

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      fontFamily: 'Raleway, sans-serif',
      padding: 0,
      gap: '16px',
    }}>
      {/* Client Info Header */}
      <div style={{
        background: isDarkMode 
          ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.95) 100%)',
        border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.2)'}`,
        borderRadius: '8px',
        padding: '16px',
        backdropFilter: 'blur(6px)',
      }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}>
            <div style={{
              color: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight,
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"></circle>
                <rect x="4" y="15" width="16" height="6" rx="3" stroke="currentColor" strokeWidth="2"></rect>
              </svg>
              Prospect Details
            </div>
          </div>

          <div style={{
            height: '1px',
            background: isDarkMode 
              ? 'linear-gradient(90deg, rgba(125, 211, 252, 0.3) 0%, rgba(125, 211, 252, 0.05) 100%)'
              : 'linear-gradient(90deg, rgba(54, 144, 206, 0.3) 0%, rgba(54, 144, 206, 0.05) 100%)',
            margin: '0 0 12px',
            borderRadius: '1px',
          }} />

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
          }}>
            {/* Client Name Card */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
              transition: 'all 0.2s ease',
              boxShadow: isDarkMode ? 'rgba(2, 6, 17, 0.15) 0px 2px 4px' : 'rgba(15, 23, 42, 0.05) 0px 2px 4px',
            }}>
              <div style={{
                color: isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(15, 23, 42, 0.6)',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <div style={{
                  width: '2px',
                  height: '2px',
                  borderRadius: '50%',
                  background: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight,
                }} />
                Client Name
              </div>
              <span style={{
                color: isDarkMode ? 'rgb(248, 250, 252)' : colours.light.text,
                fontSize: '13px',
                fontWeight: 600,
                lineHeight: '1.3',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                {enquiry.First_Name && enquiry.Last_Name 
                  ? `${enquiry.First_Name} ${enquiry.Last_Name}`
                  : enquiry.First_Name || enquiry.Last_Name || 'Unknown Client'}
                {/* Copy icon */}
                <span
                  title="Copy client name"
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim() || ''); }}
                  style={{ opacity: 0.4, transition: '0.2s', color: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight, cursor: 'pointer', transform: 'scale(1)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.opacity = '0.7'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.opacity = '0.4'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"></rect>
                    <rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"></rect>
                  </svg>
                </span>
              </span>
            </div>

            {/* Enquiry ID Card */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
              transition: 'all 0.2s ease',
              boxShadow: isDarkMode ? 'rgba(2, 6, 17, 0.15) 0px 2px 4px' : 'rgba(15, 23, 42, 0.05) 0px 2px 4px',
            }}>
              <div style={{
                color: isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(15, 23, 42, 0.6)',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <div style={{
                  width: '2px',
                  height: '2px',
                  borderRadius: '50%',
                  background: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight,
                }} />
                Enquiry ID
              </div>
              <span style={{
                color: isDarkMode ? 'rgb(248, 250, 252)' : colours.light.text,
                fontSize: '13px',
                fontWeight: 600,
                lineHeight: '1.3',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                {enquiry.ID}
                {/* Copy icon */}
                <span
                  title="Copy Enquiry ID"
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(enquiry.ID ?? '')); }}
                  style={{ opacity: 0.4, transition: '0.2s', color: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight, cursor: 'pointer', transform: 'scale(1)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.opacity = '0.7'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.opacity = '0.4'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"></rect>
                    <rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"></rect>
                  </svg>
                </span>
              </span>
            </div>
          </div>

          {/* Contact Information & Stats */}
          <div style={{ 
            marginTop: '12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}>
            {/* Contact Info */}
            <div style={{ flex: '1 1 auto', minWidth: '250px' }}>
              <div style={{
                color: isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(15, 23, 42, 0.6)',
                fontSize: '10px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '6px',
              }}>
                Contact Information
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {enquiry.Email && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(54, 144, 206, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(54, 144, 206, 0.2)'}`,
                    fontSize: '12px',
                    fontWeight: 500,
                    color: isDarkMode ? 'rgb(241, 245, 249)' : colours.light.text,
                    transition: 'all 0.2s ease',
                  }}>
                    <div style={{ color: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="2"></path>
                        <path d="M4 6l8 6 8-6" stroke="currentColor" strokeWidth="2"></path>
                      </svg>
                    </div>
                    <span style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {enquiry.Email}
                    </span>
                  </span>
                )}
                {enquiry.Phone_Number && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(54, 144, 206, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(54, 144, 206, 0.2)'}`,
                    fontSize: '12px',
                    fontWeight: 500,
                    color: isDarkMode ? 'rgb(241, 245, 249)' : colours.light.text,
                    transition: 'all 0.2s ease',
                  }}>
                    <div style={{ color: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="2"></path>
                      </svg>
                    </div>
                    <span style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {enquiry.Phone_Number}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions - Concept */}
            <div style={{ 
              flex: '0 0 auto',
              padding: '16px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(148, 163, 184, 0.05)',
              border: `2px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
              borderRadius: '8px',
              opacity: 0.6,
            }}>
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                  }}>
                    Quick Actions
                  </div>
                  <span style={{
                    fontSize: '8px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)',
                    borderRadius: '4px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Concept
                  </span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  gap: '6px',
                  flexWrap: 'wrap',
                }}>
                  <button style={{
                    padding: '8px 12px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.08)',
                    border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                    borderRadius: '6px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                  title="Log a call">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    <span style={{ display: 'none' }}>Log Call</span>
                  </button>
                  <button style={{
                    padding: '8px 12px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.08)',
                    border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                    borderRadius: '6px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                  title="Send follow-up">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="M7 10l5 4 5-4"/>
                    </svg>
                    <span style={{ display: 'none' }}>Send Follow-up</span>
                  </button>
                  <button style={{
                    padding: '8px 12px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.08)',
                    border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                    borderRadius: '6px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                  title="Record instruction">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <line x1="9" y1="9" x2="9" y2="15"/>
                      <line x1="15" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span style={{ display: 'none' }}>Record Instruction</span>
                  </button>
                  <button style={{
                    padding: '8px 12px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.08)',
                    border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                    borderRadius: '6px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                  title="Add note">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span style={{ display: 'none' }}>Add Note</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* Data Loading Status - Header Bar */}
      <div style={{
        background: isDarkMode
          ? 'linear-gradient(135deg, rgb(30, 41, 59) 0%, rgb(51, 65, 85) 100%)'
          : 'linear-gradient(135deg, rgb(203, 213, 225) 0%, rgb(226, 232, 240) 100%)',
        padding: '20px 32px',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '24px',
        flexWrap: 'nowrap',
      }}>
        <button 
          onClick={() => handleManualSync('pitches')}
          disabled={loadingStates.pitches}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: loadingStates.pitches 
              ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
              : 'transparent',
            border: 'none',
            cursor: loadingStates.pitches ? 'default' : 'pointer',
            padding: '8px 12px',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            opacity: loadingStates.pitches ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loadingStates.pitches) {
              e.currentTarget.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loadingStates.pitches) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
          title={loadingStates.pitches ? "Loading pitches..." : "Pitches loaded successfully"}
        >
          {loadingStates.pitches ? (
            <div style={{
              width: '20px',
              height: '20px',
              border: `2px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.3)'}`,
              borderTop: `2px solid ${colours.highlight}`,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          ) : (
            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20px" width="20px" xmlns="http://www.w3.org/2000/svg" style={{
              color: colours.highlight,
            }}>
              <path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"></path>
            </svg>
          )}
          <span style={{
            color: loadingStates.pitches
              ? (isDarkMode ? colours.highlight : colours.highlight)
              : (isDarkMode ? 'rgb(255, 255, 255)' : 'rgba(15, 23, 42, 0.9)'),
            fontSize: '15px',
            fontWeight: loadingStates.pitches ? 600 : 500,
            whiteSpace: 'nowrap',
          }}>
            Pitches {!loadingStates.pitches && `(${timeline.filter(item => item.type === 'pitch').length})`}
          </span>
        </button>

        <button 
          onClick={() => handleManualSync('emails')}
          disabled={loadingStates.emails}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: loadingStates.emails 
              ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
              : 'transparent',
            border: 'none',
            cursor: loadingStates.emails ? 'default' : 'pointer',
            padding: '8px 12px',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            opacity: loadingStates.emails ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loadingStates.emails) {
              e.currentTarget.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loadingStates.emails) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
          title={loadingStates.emails ? "Searching inbox..." : "Click to search fee earner's inbox for emails"}
        >
          {loadingStates.emails ? (
            <div style={{
              width: '20px',
              height: '20px',
              border: `2px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.3)'}`,
              borderTop: `2px solid ${colours.highlight}`,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          ) : (
            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20px" width="20px" xmlns="http://www.w3.org/2000/svg" style={{
              color: colours.highlight,
            }}>
              <path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"></path>
            </svg>
          )}
          <span style={{
            color: loadingStates.emails
              ? (isDarkMode ? colours.highlight : colours.highlight)
              : (isDarkMode ? 'rgb(255, 255, 255)' : 'rgba(15, 23, 42, 0.9)'),
            fontSize: '15px',
            fontWeight: loadingStates.emails ? 600 : 500,
            whiteSpace: 'nowrap',
          }}>
            {loadingStates.emails ? 'Searching...' : `Emails (${timeline.filter(item => item.type === 'email').length})`}
          </span>
        </button>

        <button 
          onClick={() => handleManualSync('calls')}
          disabled={loadingStates.calls}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: loadingStates.calls 
              ? (isDarkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)')
              : 'transparent',
            border: 'none',
            cursor: loadingStates.calls ? 'default' : 'pointer',
            padding: '8px 12px',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            opacity: loadingStates.calls ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loadingStates.calls) {
              e.currentTarget.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loadingStates.calls) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
          title={loadingStates.calls ? "Fetching calls..." : "Click to search CallRail for calls"}
        >
          {loadingStates.calls ? (
            <div style={{
              width: '20px',
              height: '20px',
              border: `2px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.3)'}`,
              borderTop: `2px solid #f59e0b`,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          ) : (
            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20px" width="20px" xmlns="http://www.w3.org/2000/svg" style={{
              color: timeline.filter(item => item.type === 'call').length > 0 ? colours.highlight : '#f59e0b',
            }}>
              <path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"></path>
            </svg>
          )}
          <span style={{
            color: timeline.filter(item => item.type === 'call').length > 0
              ? colours.highlight
              : (isDarkMode ? 'rgb(255, 255, 255)' : 'rgba(15, 23, 42, 0.9)'),
            fontSize: '15px',
            fontWeight: timeline.filter(item => item.type === 'call').length > 0 ? 600 : 500,
            whiteSpace: 'nowrap',
          }}>
            Calls {!loadingStates.calls && `(${timeline.filter(item => item.type === 'call').length})`}
          </span>
        </button>
      </div>

      {/* Client Journey Timeline */}
      <div style={{
        background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
        borderRadius: '8px',
        padding: '20px',
      }}>
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
            Journey Timeline ({activeFilter 
              ? timeline.filter(item => item.type === activeFilter).length
              : timeline.length})
          </div>

          {/* Communication Stats */}
          <div style={{ 
            display: 'flex', 
            gap: '12px',
            alignItems: 'center',
          }}>
            <div style={{
              color: isDarkMode ? 'rgb(148, 163, 184)' : 'rgba(15, 23, 42, 0.6)',
              fontSize: '10px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}>
              Activity
            </div>
            {['call', 'pitch', 'email', 'instruction'].map((type) => {
              const count = timeline.filter(item => item.type === type).length;
              const isActive = activeFilter === type;
              let statusColor: string = '';
              
              if (type === 'call') {
                // Calls use highlight blue in activity bar
                statusColor = colours.highlight;
              } else if (type === 'pitch') {
                statusColor = '#22c55e'; // Green
              } else if (type === 'email') {
                statusColor = colours.highlight; // Highlight blue
              } else {
                statusColor = '#10b981'; // Emerald
              }
              
              return (
                <button
                  key={type}
                  onClick={() => setActiveFilter(isActive ? null : (type as CommunicationType))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: `1px solid ${count === 0 ? 'rgba(148, 163, 184, 0.15)' : statusColor}`,
                    borderRadius: '6px',
                    color: count === 0 ? 'rgba(226, 232, 240, 0.5)' : statusColor,
                    cursor: count === 0 ? 'default' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (count > 0) {
                      e.currentTarget.style.background = isDarkMode 
                        ? 'rgba(148, 163, 184, 0.08)' 
                        : 'rgba(148, 163, 184, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
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
              background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
            }} />

            {/* Timeline items */}
            {timeline
              .filter(item => !activeFilter || item.type === activeFilter)
              .slice()
              .reverse()
              .map((item, index) => {
              const typeColor = getTypeColor(item.type);
              const isExpanded = selectedItem?.id === item.id;
              
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'relative',
                    marginBottom: index < timeline.length - 1 ? '16px' : '0',
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
                    border: isExpanded 
                      ? `1px solid ${colours.highlight}` 
                      : item.type === 'email' && item.metadata?.direction === 'inbound'
                        ? isDarkMode ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(34, 197, 94, 0.2)'
                        : item.type === 'email' && item.metadata?.direction === 'outbound'
                          ? isDarkMode ? '1px solid rgba(54, 144, 206, 0.3)' : '1px solid rgba(54, 144, 206, 0.2)'
                          : '1px solid transparent',
                    borderLeft: item.type === 'email' && item.metadata?.direction === 'inbound'
                      ? isDarkMode ? '3px solid rgba(34, 197, 94, 0.6)' : '3px solid rgba(34, 197, 94, 0.5)'
                      : item.type === 'email' && item.metadata?.direction === 'outbound'
                        ? isDarkMode ? '3px solid rgba(54, 144, 206, 0.6)' : '3px solid rgba(54, 144, 206, 0.5)'
                        : undefined,
                    borderRadius: '6px',
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
                              borderRadius: '3px',
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
                            console.log('🎯 Rendering item:', item.id, 'metadata:', item.metadata, 'scenarioId:', item.metadata?.scenarioId);
                            return item.metadata?.scenarioId ? (
                              <>
                                <span>•</span>
                                <span style={{
                                  fontSize: '9px',
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.5)',
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
                          <div dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
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
                                borderRadius: '6px',
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
      </div>

      {/* Resources & Actions - Fee Earner Hub (Early Access) */}
      {(process.env.NODE_ENV === 'development' || ['LZ', 'AC', 'CB'].includes(userInitials || '')) && (
      <div style={{
        marginTop: '32px',
        background: isDarkMode 
          ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.95) 100%)',
        border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.2)'}`,
        borderRadius: '12px',
        padding: '24px',
        backdropFilter: 'blur(8px)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}>
          <div>
            <div style={{
              color: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight,
              fontSize: '14px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="currentColor" strokeWidth="2"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="8" r="1" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <circle cx="12" cy="16" r="1" fill="currentColor"/>
              </svg>
              Resources & Actions
              <span style={{
                fontSize: '9px',
                fontWeight: 600,
                padding: '2px 6px',
                background: isDarkMode ? 'rgba(125, 211, 252, 0.15)' : 'rgba(54, 144, 206, 0.15)',
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.3)' : 'rgba(54, 144, 206, 0.3)'}`,
                borderRadius: '4px',
                color: isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                AC CB LZ
              </span>
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

        {/* Resource Categories Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {/* Templates & Forms - Concept */}
          <div style={{
            padding: '16px',
            background: isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(148, 163, 184, 0.05)',
            border: `2px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
            borderRadius: '8px',
            opacity: 0.6,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.6)'} strokeWidth="2"/>
                  <polyline points="14,2 14,8 20,8" stroke={isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.6)'} strokeWidth="2"/>
                </svg>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                }}>
                  Templates & Forms
                </span>
              </div>
              <span style={{
                fontSize: '8px',
                fontWeight: 600,
                padding: '2px 6px',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)',
                borderRadius: '4px',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Concept
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { name: 'Email Templates', desc: 'Pre-written templates for common scenarios' },
                { name: 'Fee Calculator', desc: 'Quick estimates for enquiry quotes' },
                { name: 'Document Builder', desc: 'Generate docs from enquiry data' },
                { name: 'Time Entry Forms', desc: 'Log time against this enquiry' },
                { name: 'Communication Log', desc: 'Track all interactions with prospect' },
              ].map((item, index) => (
                <div key={index} style={{
                  padding: '8px',
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.08)',
                  borderRadius: '6px',
                  border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                    marginBottom: '2px',
                  }}>
                    {item.name}
                  </div>
                  <div style={{
                    fontSize: '9px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(15, 23, 42, 0.45)',
                    fontStyle: 'italic',
                  }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Best Practices & Guidance - Concept */}
          <div style={{
            padding: '16px',
            background: isDarkMode ? 'rgba(148, 163, 184, 0.03)' : 'rgba(148, 163, 184, 0.05)',
            border: `2px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`,
            borderRadius: '8px',
            opacity: 0.6,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke={isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.6)'} strokeWidth="2"/>
                  <path d="M9 12l2 2 4-4" stroke={isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.6)'} strokeWidth="2"/>
                </svg>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                }}>
                  Best Practices & Guidance
                </span>
              </div>
              <span style={{
                fontSize: '8px',
                fontWeight: 600,
                padding: '2px 6px',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)',
                borderRadius: '4px',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Concept
              </span>
            </div>
            <div style={{
              fontSize: '10px',
              color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(15, 23, 42, 0.45)',
              fontStyle: 'italic',
              marginBottom: '8px',
            }}>
              Ideas for guides: Enquiry process, fee setting, comms standards, compliance, doc formatting
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {[
                { name: 'Enquiry Process Guide', desc: 'Step-by-step workflow from first contact to instruction' },
                { name: 'Fee Setting Standards', desc: 'Guidelines for quoting and pricing' },
                { name: 'Communication Standards', desc: 'Templates and tone for client interactions' },
                { name: 'Compliance Checklist', desc: 'Required checks and documentation' },
                { name: 'Document Formatting', desc: 'House style for letters and emails' },
              ].map((item, index) => (
                <div key={index} style={{
                  padding: '8px',
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(148, 163, 184, 0.08)',
                  borderRadius: '6px',
                  border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.5)',
                    marginBottom: '2px',
                  }}>
                    {item.name}
                  </div>
                  <div style={{
                    fontSize: '9px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(15, 23, 42, 0.45)',
                    fontStyle: 'italic',
                  }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Support Request / Feedback Form */}
        <div style={{
          marginTop: '16px',
          padding: '16px',
          background: isDarkMode 
            ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)'
            : 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(16, 185, 129, 0.04) 100%)',
          border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)'}`,
          borderRadius: '8px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke={colours.green} strokeWidth="2"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke={colours.green} strokeWidth="2"/>
              <line x1="12" y1="17" x2="12.01" y2="17" stroke={colours.green} strokeWidth="2"/>
            </svg>
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              color: isDarkMode ? 'rgb(34, 197, 94)' : colours.green,
            }}>
              Get in Touch
            </span>
          </div>
          
          <div style={{
            fontSize: '9px',
            color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(15, 23, 42, 0.6)',
            marginBottom: '12px',
          }}>
            Need help or got an idea? Let us know
          </div>

          {/* Request Type Toggle */}
          <div style={{
            display: 'flex',
            gap: '1px',
            marginBottom: '12px',
            borderRadius: '6px',
            overflow: 'hidden',
            background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
          }}>
            <button 
              style={{
                flex: 1,
                padding: '6px 12px',
                background: requestType === 'support' 
                  ? (isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)')
                  : (isDarkMode ? 'rgba(7, 16, 32, 0.8)' : 'rgba(255, 255, 255, 0.9)'),
                border: 'none',
                color: requestType === 'support'
                  ? (isDarkMode ? 'rgb(34, 197, 94)' : colours.green)
                  : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.6)'),
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onClick={() => setRequestType('support')}
            >
              Support Request
            </button>
            <button 
              style={{
                flex: 1,
                padding: '6px 12px',
                background: requestType === 'feedback'
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                  : (isDarkMode ? 'rgba(7, 16, 32, 0.8)' : 'rgba(255, 255, 255, 0.9)'),
                border: 'none',
                color: requestType === 'feedback'
                  ? (isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight)
                  : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.6)'),
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onClick={() => setRequestType('feedback')}
            >
              Idea or Feedback
            </button>
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Category dropdown - different options based on type */}
            <select
              style={{
                padding: '8px 12px',
                background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                borderRadius: '6px',
                fontSize: '11px',
                color: isDarkMode ? 'rgb(226, 232, 240)' : colours.light.text,
                outline: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = requestType === 'support' ? colours.green : colours.highlight;
                e.currentTarget.style.boxShadow = `0 0 0 2px ${requestType === 'support' ? colours.green : colours.highlight}20`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {requestType === 'support' ? (
                <>
                  <option value="">What type of issue?</option>
                  <option value="bug">Something's broken</option>
                  <option value="data">Data not showing / wrong</option>
                  <option value="access">Can't access something</option>
                  <option value="feature">Feature not working</option>
                  <option value="other">Other</option>
                </>
              ) : (
                <>
                  <option value="">What's this about?</option>
                  <option value="new-feature">New feature idea</option>
                  <option value="improvement">Improvement to existing</option>
                  <option value="workflow">Better workflow</option>
                  <option value="ui">UI/UX feedback</option>
                  <option value="other">Other</option>
                </>
              )}
            </select>

            <input
              type="text"
              placeholder="Quick summary"
              style={{
                padding: '8px 12px',
                background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                borderRadius: '6px',
                fontSize: '11px',
                color: isDarkMode ? 'rgb(226, 232, 240)' : colours.light.text,
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                const focusColor = requestType === 'support' ? colours.green : colours.highlight;
                e.currentTarget.style.borderColor = focusColor;
                e.currentTarget.style.boxShadow = `0 0 0 2px ${focusColor}20`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            
            <textarea
              placeholder={requestType === 'support' ? 'What happened and when?' : 'Tell us more about your idea...'}
              rows={3}
              style={{
                padding: '8px 12px',
                background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                borderRadius: '6px',
                fontSize: '11px',
                color: isDarkMode ? 'rgb(226, 232, 240)' : colours.light.text,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                const focusColor = requestType === 'support' ? colours.green : colours.highlight;
                e.currentTarget.style.borderColor = focusColor;
                e.currentTarget.style.boxShadow = `0 0 0 2px ${focusColor}20`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <div style={{
                fontSize: '8px',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(15, 23, 42, 0.5)',
              }}>
                → {requestType === 'support' ? 'Ops Team' : 'Dev Team'}
              </div>
              
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                  borderRadius: '6px',
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(15, 23, 42, 0.6)',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)';
                }}
                onClick={() => console.log('Cancel')}>
                  Cancel
                </button>
                
                <button style={{
                  padding: '6px 16px',
                  background: requestType === 'support'
                    ? (isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)')
                    : (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)'),
                  border: requestType === 'support'
                    ? `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)'}`
                    : `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                  borderRadius: '6px',
                  color: requestType === 'support'
                    ? (isDarkMode ? 'rgb(34, 197, 94)' : colours.green)
                    : (isDarkMode ? 'rgb(125, 211, 252)' : colours.highlight),
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                onMouseEnter={(e) => {
                  if (requestType === 'support') {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.15)';
                  } else {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (requestType === 'support') {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)';
                  } else {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)';
                  }
                }}
                onClick={() => {
                  console.log(`Submit ${requestType} to Asana`);
                  // TODO: Implement Asana task creation
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2"/>
                    <polygon points="22,2 15,22 11,13 2,9 22,2" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  Send
                </button>
              </div>
            </div>
          </div>
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
