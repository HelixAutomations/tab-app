// src/app/functionality/matterOpeningUtils.ts
// invisible change 2

/**
 * Utility functions for detecting matter opening progress
 */

/**
 * Checks if there's an active matter opening in progress by examining localStorage
 * for any draft data from the FlatMatterOpening component
 */
/**
 * Checks if there's an active matter opening in progress by examining localStorage
 * for any draft data from the FlatMatterOpening component
 * @param isCurrentlyInMatterOpening - whether user is currently viewing the matter opening workflow
 */
export const hasActiveMatterOpening = (isCurrentlyInMatterOpening: boolean = false): boolean => {
  // Don't show indicator if user is currently in the matter opening workflow
  if (isCurrentlyInMatterOpening) {
    return false;
  }

  // If the user has entered any data in the matter opening workflow we store
  // an explicit flag. This avoids treating prefilled defaults as activity.
  const hasInputFlag = localStorage.getItem('matterOpeningDraft_hasInput') === 'true';
  if (hasInputFlag) {
    return true;
  }

  // Check for key indicators that a matter opening is in progress
  // These keys have the prefix 'matterOpeningDraft_' as used in FlatMatterOpening
  const indicators = [
    'matterOpeningDraft_selectedPoidIds',
    'matterOpeningDraft_clientType', 
    'matterOpeningDraft_areaOfWork',
    'matterOpeningDraft_practiceArea',
    'matterOpeningDraft_description',
    'matterOpeningDraft_disputeValue',
    'matterOpeningDraft_opponentName',
    'matterOpeningDraft_opponentEmail',
    'matterOpeningDraft_folderStructure',
    'matterOpeningDraft_selectedDate',
    'matterOpeningDraft_teamMember',
    'matterOpeningDraft_supervisingPartner',
    'matterOpeningDraft_originatingSolicitor',
    'matterOpeningDraft_referrerName',
    'matterOpeningDraft_opponentSolicitorName',
    'matterOpeningDraft_opponentSolicitorCompany',
    'matterOpeningDraft_opponentSolicitorEmail',
    'matterOpeningDraft_noConflict',
    'matterOpeningDraft_enterOpponentNow',
    'matterOpeningDraft_opponentType',
    'matterOpeningDraft_showSummary',
    'matterOpeningDraft_touchedFields',
    'matterOpeningDraft_hasInput',
    'matterOpeningDraft_completed'
  ];

  // Check if the matter has been completed (submitted)
  const isCompleted = localStorage.getItem('matterOpeningDraft_completed') === 'true';
  if (isCompleted) {
    return false;
  }

  const hasActiveData = indicators.some(key => {
    const value = localStorage.getItem(key);
    if (!value) return false;
    
    try {
      const parsed = JSON.parse(value);
      // Check if the value indicates active progress
      if (Array.isArray(parsed)) {
        return parsed.length > 0;
      }
      if (typeof parsed === 'boolean') {
        return parsed;
      }
      if (typeof parsed === 'string') {
        return parsed.trim() !== '' && parsed !== 'search';
      }
      if (parsed === null) {
        return false;
      }
      return false;
    } catch {
      // If not JSON, treat as string
      return value.trim() !== '' && value !== 'search';
    }
  });

  // Simple debug log (commented out to reduce console noise)
  // console.log('Matter opening active:', hasActiveData, 'currentlyViewing:', isCurrentlyInMatterOpening);
  return hasActiveData;
};

/**
 * Clears all matter opening draft data from localStorage
 */
export const clearMatterOpeningDraft = (): void => {
  const draftKeys = [
    'matterOpeningDraft_selectedPoidIds',
    'matterOpeningDraft_clientType', 
    'matterOpeningDraft_areaOfWork',
    'matterOpeningDraft_practiceArea',
    'matterOpeningDraft_description',
    'matterOpeningDraft_disputeValue',
    'matterOpeningDraft_opponentName',
    'matterOpeningDraft_opponentEmail',
    'matterOpeningDraft_folderStructure',
    'matterOpeningDraft_selectedDate',
    'matterOpeningDraft_teamMember',
    'matterOpeningDraft_supervisingPartner',
    'matterOpeningDraft_originatingSolicitor',
    'matterOpeningDraft_referrerName',
    'matterOpeningDraft_opponentSolicitorName',
    'matterOpeningDraft_opponentSolicitorCompany',
    'matterOpeningDraft_opponentSolicitorEmail',
    'matterOpeningDraft_noConflict',
    'matterOpeningDraft_enterOpponentNow',
    'matterOpeningDraft_opponentType',
    'matterOpeningDraft_currentStep',
    'matterOpeningDraft_showSummary',
    'matterOpeningDraft_hasInput',
    'matterOpeningDraft_completed'
  ];

  draftKeys.forEach(key => {
    localStorage.removeItem(key);
  });
  
  console.log('Matter opening draft data cleared');
};

/**
 * Marks the matter opening as completed
 */
export const completeMatterOpening = (): void => {
  localStorage.setItem('matterOpeningDraft_completed', 'true');
  localStorage.removeItem('matterOpeningDraft_hasInput');
  console.log('Matter opening marked as completed');
};

/**
 * Gets a rough progress percentage of the matter opening
 */
export const getMatterOpeningProgress = (): number => {
  const fields = [
    'selectedPoidIds',
    'pendingClientType',
    'areaOfWork', 
    'practiceArea',
    'description',
    'disputeValue',
    'source',
    'folderStructure',
    'opponentChoiceMade',
    'summaryConfirmed'
  ];

  let completedFields = 0;
  
  fields.forEach(key => {
    const value = localStorage.getItem(key);
    if (!value) return;
    
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        completedFields++;
      } else if (typeof parsed === 'boolean' && parsed) {
        completedFields++;
      } else if (typeof parsed === 'string' && parsed.trim() !== '' && parsed !== 'search') {
        completedFields++;
      }
    } catch {
      if (value.trim() !== '' && value !== 'search') {
        completedFields++;
      }
    }
  });

  return Math.round((completedFields / fields.length) * 100);
};
