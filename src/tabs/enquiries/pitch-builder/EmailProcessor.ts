/**
 * Email Processing - V2 System
 * 
 * Simplified email processor using V2 formatting.
 * V1 has been removed - this is now the only system.
 */

import { processEmailContentV2 } from './emailFormattingV2';

import { 
  removeHighlightSpans,
  applyDynamicSubstitutions,
  removeUnfilledPlaceholders
} from './emailUtils';

import { pitchTelemetry } from './pitchTelemetry';

const LOG_OPERATIONS = process.env.REACT_APP_EMAIL_V2_LOGGING === 'true';

/**
 * Main email processing class
 */
export class EmailProcessor {
  private static logOperation(message: string, data?: any) {
    if (LOG_OPERATIONS) {
      console.log(`[EmailProcessor] ${message}`, data || '');
    }
  }

  /**
   * Process email content using V2 formatting
   */
  static processEmailContent(
    content: string,
    options: {
      editorElement?: HTMLElement | null;
      fallbackHtml?: string;
      preserveHighlights?: boolean;
      enquiryId?: string | number;
      feeEarner?: string;
    } = {}
  ): string {
    const startTime = performance.now();
    
    this.logOperation('Starting email processing', {
      contentLength: content.length,
      hasEditor: !!options.editorElement
    });

    pitchTelemetry.trackEvent('email.formatting_started', {
      contentLength: content.length,
      hasEditor: !!options.editorElement
    }, {
      enquiryId: options.enquiryId,
      feeEarner: options.feeEarner
    });

    const baseContent = !options.preserveHighlights
      ? removeHighlightSpans(content)
      : content;

    try {
      const processed = processEmailContentV2(baseContent);
      const duration = Math.round(performance.now() - startTime);
      
      this.logOperation('Email processing completed', { resultLength: processed.length });
      
      pitchTelemetry.trackEmailProcessing(
        options.enquiryId || 'unknown',
        options.feeEarner || 'unknown',
        true,
        {
          contentLength: content.length,
          processingTimeMs: duration
        }
      );
      
      return processed;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      console.error('[EmailProcessor] Processing failed:', error);
      
      pitchTelemetry.trackEmailProcessing(
        options.enquiryId || 'unknown',
        options.feeEarner || 'unknown',
        false,
        {
          contentLength: content.length,
          processingTimeMs: duration,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      
      // Return cleaned content as fallback
      return baseContent;
    }
  }

  /**
   * Process editor content specifically (for rich text editor)
   */
  static processEditorContent(
    editorElement: HTMLElement | null,
    fallbackHtml?: string
  ): string {
    if (!editorElement && !fallbackHtml) {
      return '';
    }

    const content = editorElement ? editorElement.innerHTML : (fallbackHtml || '');
    
    return this.processEmailContent(content, {
      editorElement,
      fallbackHtml,
      preserveHighlights: false
    });
  }

  /**
   * Apply dynamic substitutions
   */
  static applySubstitutions(
    html: string,
    userData: any,
    enquiry: any,
    amount?: number | string,
    passcode?: string,
    instructionsLink?: string
  ): string {
    this.logOperation('Applying dynamic substitutions');
    
    return applyDynamicSubstitutions(
      html,
      userData,
      enquiry,
      amount,
      passcode,
      instructionsLink
    );
  }

  /**
   * Complete email processing pipeline
   * Processes content and applies all substitutions
   */
  static processCompleteEmail(
    content: string,
    context: {
      editorElement?: HTMLElement | null;
      userData?: any;
      enquiry?: any;
      amount?: number | string;
      passcode?: string;
      instructionsLink?: string;
      enquiryId?: string | number;
      feeEarner?: string;
    }
  ): string {
    this.logOperation('Starting complete email processing pipeline');
    
    const enquiryId = context.enquiryId || context.enquiry?.ID || 'unknown';
    const feeEarner = context.feeEarner || context.userData?.[0]?.Initials || 'unknown';

    pitchTelemetry.trackEvent('pitch.email_processed', {
      contentLength: content?.length || 0,
      hasUserData: !!context.userData,
      hasEnquiry: !!context.enquiry,
      hasAmount: !!context.amount
    }, {
      enquiryId,
      feeEarner
    });

    // Input validation
    if (!content || typeof content !== 'string') {
      console.warn('[EmailProcessor] Invalid content provided, using fallback');
      content = 'Email content unavailable. Please contact us directly.';
    }

    try {
      // Step 1: Process the content with V2 formatting
      let processed = this.processEmailContent(content, {
        editorElement: context.editorElement,
        enquiryId,
        feeEarner
      });

      // Validate processed content
      if (!processed || processed.trim().length === 0) {
        console.warn('[EmailProcessor] Empty processed content, using original');
        processed = content;
      }

      // Step 2: Apply dynamic substitutions
      if (context.userData || context.enquiry) {
        try {
          processed = this.applySubstitutions(
            processed,
            context.userData,
            context.enquiry,
            context.amount,
            context.passcode,
            context.instructionsLink
          );
          
          pitchTelemetry.trackEvent('email.substitution_applied', {
            hasUserData: !!context.userData,
            hasEnquiry: !!context.enquiry
          }, {
            enquiryId,
            feeEarner
          });
        } catch (error) {
          console.error('[EmailProcessor] Substitution failed:', error);
        }
      }

      // Step 3: Remove any placeholders that remain after substitution
      try {
        processed = removeUnfilledPlaceholders(processed);
      } catch (error) {
        console.error('[EmailProcessor] Placeholder removal failed:', error);
      }

      // Final validation
      if (!processed || processed.trim().length === 0) {
        console.error('[EmailProcessor] Final processed content is empty, using fallback');
        processed = content || 'Email content could not be processed.';
      }

      this.logOperation('Complete email processing finished successfully');
      return processed;
    } catch (error) {
      console.error('[EmailProcessor] Critical error in processing pipeline:', error);
      return content || 'Email content processing failed. Please try again.';
    }
  }
}

/**
 * Convenience function for backward compatibility
 */
export function processEditorContentForEmail(
  editorElement: HTMLElement | null,
  fallbackHtml?: string
): string {
  return EmailProcessor.processEditorContent(editorElement, fallbackHtml);
}

/**
 * Enhanced replacement for existing email processing calls
 */
export function enhancedProcessEmailContent(
  content: string,
  context: {
    userData?: any;
    enquiry?: any;
    amount?: number | string;
    passcode?: string;
    editorElement?: HTMLElement | null;
  } = {}
): string {
  return EmailProcessor.processCompleteEmail(content, context);
}

export default EmailProcessor;
