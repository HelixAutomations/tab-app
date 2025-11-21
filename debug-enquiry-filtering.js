// Debug script to analyze enquiry filtering
const DEBUG_SCRIPT = `
// This script should be run in the browser console on the enquiries page
console.log('=== ENQUIRY FILTERING DEBUG ===');

// Check current UI state
const viewButtons = document.querySelectorAll('[class*="button"], [class*="nav"], button');
let activeView = 'Unknown';
viewButtons.forEach(btn => {
  if (btn.textContent && (btn.textContent.includes('Claimed') || btn.textContent.includes('Claimable') || btn.textContent.includes('Mine'))) {
    const classes = btn.className || '';
    if (classes.includes('active') || classes.includes('selected') || btn.getAttribute('aria-selected') === 'true') {
      activeView = btn.textContent.trim();
    }
  }
});

console.log('Current View:', activeView);

// Check if React DevTools is available
if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  console.log('React DevTools detected - can access component state');
} else {
  console.log('React DevTools not available - using DOM inspection');
}

// Count visible cards
const cards = document.querySelectorAll('[class*="card"], [class*="enquiry"]');
console.log('Visible Cards Count:', cards.length);

// Check for filter indicators
const filters = document.querySelectorAll('[class*="filter"], [class*="tag"], [class*="chip"]');
console.log('Active Filters:', Array.from(filters).map(f => f.textContent?.trim()).filter(Boolean));

// Look for prospects@ emails in DOM
const prospectsElements = Array.from(document.querySelectorAll('*')).filter(el => 
  el.textContent && el.textContent.includes('prospects@')
);
console.log('Elements mentioning prospects@:', prospectsElements.length);

console.log('=== END DEBUG ===');
`;

console.log('Copy and paste this script into browser console on the enquiries page:');
console.log(DEBUG_SCRIPT);