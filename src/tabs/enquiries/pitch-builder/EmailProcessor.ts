/**
 * Email Processing Factory - Safe Integration Point
 * 
 * This module provides a safe way to switch between V1 (production) and V2 (enhanced)
 * email processing systems without affecting existing functionality.
 */

import {
  processEmailContentV2,
  processEmailWithFallback,
  EMAIL_V2_CONFIG,
  compareFormattingSystems
} from './emailFormattingV2';

// Import V1 functions (existing production system)
import { 
  processEditorContentForEmail as processV1,
  convertDoubleBreaksToParagraphs,
  removeHighlightSpans,
  applyDynamicSubstitutions,
  removeUnfilledPlaceholders
} from './emailUtils';

/**
 * Main email processing factory
 * This is the single entry point for all email processing
 */
export class EmailProcessor {
  private static logOperation(message: string, data?: any) {
    if (EMAIL_V2_CONFIG.logOperations) {
      console.log(`[EmailProcessor] ${message}`, data || '');
    }
  }

  /**
   * Process email content using the configured system (V1 or V2)
   */
  static processEmailContent(
    content: string,
    options: {
      editorElement?: HTMLElement | null;
      fallbackHtml?: string;
      preserveHighlights?: boolean;
      forceV2?: boolean; // Allow explicit V2 usage for development testing
    } = {}
  ): string {
    this.logOperation('Starting email processing', {
      useV2: EMAIL_V2_CONFIG.enabled || options.forceV2,
      contentLength: content.length,
      hasEditor: !!options.editorElement,
      forceV2: options.forceV2
    });

    const baseContent = !options.preserveHighlights
      ? removeHighlightSpans(content)
      : content;

    // V1 processor function (existing production logic)
    const processWithV1 = (html: string): string => {
      this.logOperation('Using V1 processing');
      return convertDoubleBreaksToParagraphs(html);
    };

    // Check if we should force V2 for development testing
    if (options.forceV2) {
      this.logOperation('Force V2 processing for development testing');
      try {
        const processed = processEmailContentV2(baseContent);
        this.logOperation('Force V2 processing completed successfully');
        return processed;
      } catch (error) {
        console.error('[EmailProcessor] Force V2 failed, falling back to V1:', error);
        return processWithV1(baseContent);
      }
    }

    // Use the safe wrapper that handles V1/V2 switching and fallback
    const result = processEmailWithFallback(baseContent, processWithV1);

    this.logOperation('Email processing completed', {
      resultLength: result.length,
      system: EMAIL_V2_CONFIG.enabled ? 'V2' : 'V1'
    });

    return result;
  }

  /**
   * Process editor content specifically (for rich text editor)
   */
  static processEditorContent(
    editorElement: HTMLElement | null,
    fallbackHtml?: string,
    forceV2?: boolean
  ): string {
    if (!editorElement && !fallbackHtml) {
      return '';
    }

    const content = editorElement ? editorElement.innerHTML : (fallbackHtml || '');
    
    return this.processEmailContent(content, {
      editorElement,
      fallbackHtml,
      preserveHighlights: false,
      forceV2
    });
  }

  /**
   * Apply dynamic substitutions (used by both V1 and V2)
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
   * Complete email processing pipeline with enhanced reliability
   * This processes content and applies all substitutions with fallback mechanisms
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
      forceV2?: boolean; // Allow explicit V2 usage for development testing
    }
  ): string {
    this.logOperation('Starting complete email processing pipeline');

    // Input validation
    if (!content || typeof content !== 'string') {
      console.warn('[EmailProcessor] Invalid content provided, using fallback');
      content = 'Email content unavailable. Please contact us directly.';
    }

    try {
      // Step 1: Process the content (V1 or V2) with error handling
      let processed = this.processEmailContent(content, {
        editorElement: context.editorElement,
        forceV2: context.forceV2
      });

      // Validate processed content
      if (!processed || processed.trim().length === 0) {
        console.warn('[EmailProcessor] Empty processed content, using original');
        processed = content;
      }

      // Step 2: Apply dynamic substitutions (same for both V1 and V2) with error handling
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
        } catch (error) {
          console.error('[EmailProcessor] Substitution failed:', error);
          // Continue with unsubstituted content rather than failing
        }
      }

      // Step 3: Remove any placeholders that remain after substitution
      try {
        processed = removeUnfilledPlaceholders(processed);
      } catch (error) {
        console.error('[EmailProcessor] Placeholder removal failed:', error);
        // Continue without placeholder removal
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
      // Return sanitized original content as absolute fallback
      return content || 'Email content processing failed. Please try again.';
    }
  }

  /**
   * Testing and comparison utilities
   */
  static compareSystemOutputs(content: string): {
    v1: string;
    v2: string;
    differences: string[];
    recommendation: string;
  } {
    const v1Processor = (html: string) => {
      let processed = removeHighlightSpans(html);
      processed = convertDoubleBreaksToParagraphs(processed);
      return processed;
    };

    const comparison = compareFormattingSystems(content, v1Processor);
    
    // Analyze differences and provide recommendation
    const recommendation = comparison.differences.length === 0 
      ? 'Both systems produce identical output'
      : comparison.differences.length < 3
        ? 'Minor differences - V2 safe to use'
        : 'Significant differences - review before using V2';

    return {
      ...comparison,
      recommendation
    };
  }

  /**
   * Get current configuration and status
   */
  static getStatus() {
    return {
      currentSystem: EMAIL_V2_CONFIG.enabled ? 'V2 (Enhanced)' : 'V1 (Production)',
      config: EMAIL_V2_CONFIG,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Emergency fallback to V1 only
   * Can be called if V2 system encounters issues
   */
  static forceV1Mode() {
    console.warn('[EmailProcessor] Forcing V1 mode due to emergency fallback');
    
    // Override the config (this only affects current session)
    (EMAIL_V2_CONFIG as any).enabled = false;
    (EMAIL_V2_CONFIG as any).fallbackToV1 = true;
    
    this.logOperation('Forced fallback to V1 mode activated');
  }
}

/**
 * Convenience function for backward compatibility
 * This maintains the same interface as the original processEditorContentForEmail
 */
export function processEditorContentForEmail(
  editorElement: HTMLElement | null,
  fallbackHtml?: string,
  forceV2?: boolean
): string {
  return EmailProcessor.processEditorContent(editorElement, fallbackHtml, forceV2);
}

/**
 * Enhanced replacement for existing email processing calls
 * This can be used as a drop-in replacement for existing calls
 */
export function enhancedProcessEmailContent(
  content: string,
  context: {
    userData?: any;
    enquiry?: any;
    amount?: number | string;
    passcode?: string;
    editorElement?: HTMLElement | null;
    forceV2?: boolean;
  } = {}
): string {
  return EmailProcessor.processCompleteEmail(content, context);
}

export default EmailProcessor;