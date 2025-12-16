/**
 * Pitch Builder Telemetry Service
 * 
 * Provides telemetry for email processing and pitch operations.
 * - Tracks events locally for debugging and recovery
 * - Sends critical events to server for Application Insights logging
 * - Stores recent operations in sessionStorage for UI debugging
 * 
 * This enables reconstruction of pitch operations when debugging issues.
 */

import { createLogger } from '../../../utils/debug';

const log = createLogger('PitchTelemetry');

// Storage key for recent telemetry events
const TELEMETRY_STORAGE_KEY = 'pitch_telemetry_events';
const MAX_STORED_EVENTS = 100;

export type PitchEventType =
  | 'pitch.started'
  | 'pitch.scenario_selected'
  | 'pitch.template_loaded'
  | 'pitch.content_edited'
  | 'pitch.preview_opened'
  | 'pitch.email_processed'
  | 'pitch.email_sent'
  | 'pitch.email_drafted'
  | 'pitch.email_error'
  | 'pitch.placeholder_filled'
  | 'pitch.block_inserted'
  | 'pitch.block_removed'
  | 'pitch.completed'
  | 'pitch.abandoned'
  | 'email.formatting_started'
  | 'email.formatting_completed'
  | 'email.formatting_error'
  | 'email.signature_appended'
  | 'email.substitution_applied';

export interface PitchTelemetryEvent {
  type: PitchEventType;
  timestamp: string;
  sessionId: string;
  enquiryId?: string | number;
  feeEarner?: string;
  data?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

// Generate a session ID for this browser session
const SESSION_ID = `pitch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

class PitchTelemetryService {
  private startTimes: Map<string, number> = new Map();

  /**
   * Get the current session ID for correlation
   */
  getSessionId(): string {
    return SESSION_ID;
  }

  /**
   * Start timing an operation (for measuring duration)
   */
  startTimer(operationKey: string): void {
    this.startTimes.set(operationKey, performance.now());
  }

  /**
   * Get elapsed time since startTimer was called
   */
  getElapsed(operationKey: string): number | undefined {
    const start = this.startTimes.get(operationKey);
    if (start === undefined) return undefined;
    this.startTimes.delete(operationKey);
    return Math.round(performance.now() - start);
  }

  /**
   * Track a pitch/email event
   */
  trackEvent(
    type: PitchEventType,
    data?: Record<string, unknown>,
    options?: {
      enquiryId?: string | number;
      feeEarner?: string;
      error?: string;
      duration?: number;
    }
  ): void {
    const event: PitchTelemetryEvent = {
      type,
      timestamp: new Date().toISOString(),
      sessionId: SESSION_ID,
      enquiryId: options?.enquiryId,
      feeEarner: options?.feeEarner,
      data,
      error: options?.error,
      duration: options?.duration,
    };

    // Log to console in development
    log.debug(`[${type}]`, event);

    // Store locally for debugging
    this.storeEvent(event);

    // Send critical events to server for Application Insights
    if (this.shouldSendToServer(type)) {
      this.sendToServer(event);
    }
  }

  /**
   * Track email processing operation
   */
  trackEmailProcessing(
    enquiryId: string | number,
    feeEarner: string,
    success: boolean,
    details?: {
      contentLength?: number;
      processingTimeMs?: number;
      error?: string;
    }
  ): void {
    this.trackEvent(
      success ? 'email.formatting_completed' : 'email.formatting_error',
      {
        contentLength: details?.contentLength,
        processingTimeMs: details?.processingTimeMs,
      },
      {
        enquiryId,
        feeEarner,
        error: details?.error,
        duration: details?.processingTimeMs,
      }
    );
  }

  /**
   * Track email send operation
   */
  trackEmailSent(
    enquiryId: string | number,
    feeEarner: string,
    recipient: string,
    success: boolean,
    details?: {
      subject?: string;
      hasAttachments?: boolean;
      error?: string;
    }
  ): void {
    this.trackEvent(
      success ? 'pitch.email_sent' : 'pitch.email_error',
      {
        recipient: this.redactEmail(recipient),
        subject: details?.subject ? `${details.subject.slice(0, 50)}...` : undefined,
        hasAttachments: details?.hasAttachments,
      },
      {
        enquiryId,
        feeEarner,
        error: details?.error,
      }
    );
  }

  /**
   * Track pitch completion
   */
  trackPitchCompleted(
    enquiryId: string | number,
    feeEarner: string,
    details?: {
      scenario?: string;
      amount?: string;
      timeTakenMs?: number;
    }
  ): void {
    this.trackEvent(
      'pitch.completed',
      {
        scenario: details?.scenario,
        hasAmount: !!details?.amount,
      },
      {
        enquiryId,
        feeEarner,
        duration: details?.timeTakenMs,
      }
    );
  }

  /**
   * Get recent telemetry events for debugging
   */
  getRecentEvents(limit: number = 50): PitchTelemetryEvent[] {
    try {
      const stored = sessionStorage.getItem(TELEMETRY_STORAGE_KEY);
      if (!stored) return [];
      const events: PitchTelemetryEvent[] = JSON.parse(stored);
      return events.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Get events for a specific enquiry (for recovery/debugging)
   */
  getEventsForEnquiry(enquiryId: string | number): PitchTelemetryEvent[] {
    const events = this.getRecentEvents(MAX_STORED_EVENTS);
    return events.filter(e => String(e.enquiryId) === String(enquiryId));
  }

  /**
   * Export telemetry data for debugging
   */
  exportTelemetry(): string {
    const events = this.getRecentEvents(MAX_STORED_EVENTS);
    return JSON.stringify(events, null, 2);
  }

  /**
   * Clear stored telemetry
   */
  clearTelemetry(): void {
    sessionStorage.removeItem(TELEMETRY_STORAGE_KEY);
  }

  // Private methods

  private storeEvent(event: PitchTelemetryEvent): void {
    try {
      const stored = sessionStorage.getItem(TELEMETRY_STORAGE_KEY);
      const events: PitchTelemetryEvent[] = stored ? JSON.parse(stored) : [];
      events.push(event);
      
      // Keep only recent events
      if (events.length > MAX_STORED_EVENTS) {
        events.splice(0, events.length - MAX_STORED_EVENTS);
      }
      
      sessionStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(events));
    } catch (err) {
      // Storage might be full or unavailable - ignore
      log.warn('Failed to store telemetry event:', err);
    }
  }

  private shouldSendToServer(type: PitchEventType): boolean {
    // Send critical events to server for Application Insights logging
    const criticalEvents: PitchEventType[] = [
      'pitch.email_sent',
      'pitch.email_drafted',
      'pitch.email_error',
      'pitch.completed',
      'email.formatting_error',
    ];
    return criticalEvents.includes(type);
  }

  private async sendToServer(event: PitchTelemetryEvent): Promise<void> {
    try {
      // Fire and forget - don't block on telemetry
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'pitch-builder',
          event,
        }),
      }).catch(() => {
        // Ignore - telemetry failure shouldn't affect user
      });
    } catch {
      // Ignore telemetry errors
    }
  }

  private redactEmail(email: string): string {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return `${local?.slice(0, 2)}***@${domain}`;
  }
}

// Singleton instance
export const pitchTelemetry = new PitchTelemetryService();

// Helper to wrap async operations with timing
export async function withTelemetry<T>(
  operationName: string,
  eventType: PitchEventType,
  operation: () => Promise<T>,
  context?: { enquiryId?: string | number; feeEarner?: string }
): Promise<T> {
  pitchTelemetry.startTimer(operationName);
  try {
    const result = await operation();
    const duration = pitchTelemetry.getElapsed(operationName);
    pitchTelemetry.trackEvent(
      eventType,
      { success: true },
      { ...context, duration }
    );
    return result;
  } catch (error) {
    const duration = pitchTelemetry.getElapsed(operationName);
    pitchTelemetry.trackEvent(
      eventType,
      { success: false },
      {
        ...context,
        duration,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    throw error;
  }
}
