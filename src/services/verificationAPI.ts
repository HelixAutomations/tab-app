// API functions for ID verification review workflow

interface VerificationFailure {
  check: string;
  reason: string;
  code: string;
}

/**
 * Parses Tiller raw response to extract failure reasons
 */
export const parseVerificationFailures = (rawResponse: any): VerificationFailure[] => {
  const failures: VerificationFailure[] = [];
  
  try {
    const parsedResponse = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;
    const response = Array.isArray(parsedResponse)
      ? (parsedResponse.find((entry) => entry && typeof entry === 'object') || null)
      : parsedResponse;

    if (!response || typeof response !== 'object') {
      return failures;
    }
    
    // Handle Tiller API response structure
    if (response && response.checkStatuses && Array.isArray(response.checkStatuses)) {
      response.checkStatuses.forEach((checkStatus: any) => {
        const sourceResults = checkStatus.sourceResults;
        const checkResult = checkStatus.result?.result;
        
        if (checkResult && checkResult.toLowerCase() === 'review' && sourceResults) {
          const checkName = sourceResults.rule || 'Verification Check';
          
          // Extract failure reasons from results array
          if (sourceResults.results && Array.isArray(sourceResults.results)) {
            sourceResults.results.forEach((result: any) => {
              if (result.detail && result.detail.reasons) {
                result.detail.reasons.forEach((reason: any) => {
                  if (reason.result && reason.result.toLowerCase() === 'review') {
                    failures.push({
                      check: checkName,
                      reason: reason.reason || 'Verification requires review',
                      code: reason.code || 'N/A'
                    });
                  }
                });
              }
            });
          }
          
          // If no specific reasons found but check failed, add generic reason
          if (failures.length === 0 || !failures.some(f => f.check === checkName)) {
            failures.push({
              check: checkName,
              reason: 'Verification check requires manual review',
              code: 'REVIEW'
            });
          }
        }
      });
    }

    // Fallback: Check legacy address verification format
    if (failures.length === 0 && response.address_verification?.result !== 'passed') {
      const addressChecks = response.address_verification?.checks || [];
      addressChecks.forEach((check: any) => {
        if (check.result !== 'passed') {
          failures.push({
            check: 'Address Verification',
            reason: check.failure_reason || check.warning_reason || 'Verification failed',
            code: check.result_code || 'N/A'
          });
        }
      });
    }

    // Fallback: Check legacy identity verification format
    if (failures.length === 0 && response.identity_verification?.result !== 'passed') {
      const identityChecks = response.identity_verification?.checks || [];
      identityChecks.forEach((check: any) => {
        if (check.result !== 'passed') {
          failures.push({
            check: 'Identity Verification',
            reason: check.failure_reason || check.warning_reason || 'Verification failed',
            code: check.result_code || 'N/A'
          });
        }
      });
    }

    // Fallback: Check legacy PEP & sanctions format
    if (failures.length === 0 && response.peps_and_sanctions?.result !== 'passed') {
      failures.push({
        check: 'PEP & Sanctions Check',
        reason: response.peps_and_sanctions?.failure_reason || 'Check failed or requires review',
        code: response.peps_and_sanctions?.result || 'N/A'
      });
    }

  } catch (error) {
    console.error('Error parsing verification response:', error);
    // Add a generic failure if parsing fails
    failures.push({
      check: 'Verification Parse Error',
      reason: 'Unable to parse verification response',
      code: 'PARSE_ERROR'
    });
  }

  return failures;
};

/**
 * Fetches detailed verification data for review modal
 */
export const fetchVerificationDetails = async (instructionRef: string) => {
  try {
    const response = await fetch(`/api/verify-id/${instructionRef}/details`);
    if (!response.ok) {
      throw new Error('Failed to fetch verification details');
    }
    
    const data = await response.json();
    
    // Parse the raw response to extract failure reasons
    const failures = parseVerificationFailures(data.rawResponse);
    
    return {
      instructionRef: data.instructionRef,
      clientName: `${data.firstName} ${data.surname}`.trim(),
      clientEmail: data.email,
      overallResult: data.overallResult,
      pepResult: data.pepResult,
      addressResult: data.addressResult,
      failureReasons: failures,
      checkedDate: data.checkedDate,
      rawResponse: data.rawResponse
    };
    
  } catch (error) {
    console.error('Error fetching verification details:', error);
    throw error;
  }
};

/**
 * Approves ID verification (marks as Verified)
 */
export const approveVerification = async (instructionRef: string) => {
  try {
    const response = await fetch(`/api/verify-id/${instructionRef}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to approve verification');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Error approving verification:', error);
    throw error;
  }
};

/**
 * Requests additional verification documents from the client
 */
export const requestVerificationDocuments = async (instructionRef: string) => {
  try {
    const response = await fetch(`/api/verify-id/${instructionRef}/request-documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || 'Failed to request documents');
      } catch {
        throw new Error(errorText || 'Failed to request documents');
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error requesting verification documents:', error);
    throw error;
  }
};

/**
 * Drafts the document request email to the fee earner (server-side)
 */
export const draftVerificationDocumentRequest = async (instructionRef: string) => {
  try {
    const response = await fetch(`/api/verify-id/${instructionRef}/draft-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || 'Failed to draft request');
      } catch {
        throw new Error(errorText || 'Failed to draft request');
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error drafting verification document request:', error);
    throw error;
  }
};

/**
 * Sends verification failure email to client
 */
export const sendVerificationEmail = async (instructionRef: string, clientEmail: string, clientName: string) => {
  try {
    const response = await fetch('/api/send-verification-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instructionRef,
        clientEmail,
        clientName
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to send verification email');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};
