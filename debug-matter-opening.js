// Debug script to check Matter Opening state in production
// Run this in browser console to diagnose the issue

console.log('=== Matter Opening Debug Info ===');

// Check localStorage state
console.log('localStorage keys:', Object.keys(localStorage).filter(k => k.includes('matterOpening')));

const draftKeys = [
    'disputeValue', 'noConflict', 'selectedPoidIds', 'pendingClientType', 
    'clientType', 'currentStep', 'opponentChoiceMade'
];

draftKeys.forEach(key => {
    const storageKey = `matterOpeningDraft_${key}`;
    const value = localStorage.getItem(storageKey);
    console.log(`${key}:`, value ? JSON.parse(value) : 'null');
});

// Check if we're in instruction mode
const urlParams = new URLSearchParams(window.location.search);
const instructionRef = urlParams.get('instructionRef');
console.log('instructionRef from URL:', instructionRef);

// Check for React component state (if you have React DevTools)
console.log('Check React DevTools for FlatMatterOpening component state');
console.log('Key variables to check: clientsStepComplete, disputeValue, noConflict, selectedPoidIds, pendingClientType');