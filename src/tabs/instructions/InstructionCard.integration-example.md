/**
 * Example Integration: Enhancing InstructionCard with Feedback Components
 * 
 * This file demonstrates how to integrate the new UI enhancement components
 * into InstructionCard.tsx for improved user feedback and visual clarity.
 */

import { ActionButton, ActionFeedback, ProgressIndicator } from '../../components/feedback/FeedbackComponents';
import { ANIMATION_DURATION, EASING, createTransition } from '../../app/styles/animations';

/**
 * EXAMPLE 1: Replace workflow step pills with enhanced clickable buttons
 * 
 * Location: Lines ~1800-1870 in InstructionCard.tsx
 * 
 * Current Implementation:
 * - Pills are styled divs with onClick handlers
 * - No loading/success states
 * - Hover effects are inline
 * 
 * Enhanced Implementation:
 */

// Before (simplified):
<div onClick={step.onClick} style={{ padding: '4px 8px', cursor: 'pointer' }}>
  {step.icon}
  <span>{step.label} {step.status}</span>
</div>

// After - Option A: Keep pills, add feedback overlay:
{activeAction === step.key && (
  <ActionFeedback 
    type="loading"
    compact={true}
    isDarkMode={isDarkMode}
  />
)}

// After - Option B: Convert to ActionButtons for workbench actions:
{step.key === 'payment' && (
  <ActionButton
    icon={<FaPoundSign />}
    label="Payment"
    onClick={async () => {
      onOpenWorkbench?.('payments');
    }}
    variant="secondary"
    size="small"
    isDarkMode={isDarkMode}
    showFeedback={false} // Don't show success for navigation
  />
)}

/**
 * EXAMPLE 2: Add progress indicator to card header
 * 
 * Location: After client name/ref (line ~1140)
 * 
 * Shows instruction completion at a glance
 */

const calculateInstructionProgress = (): number => {
  const completedSteps = [
    verifyIdStatus === 'complete',
    paymentStatus === 'complete',
    (documentsToUse?.length ?? 0) > 0,
    riskStatus === 'complete',
    matterStatus === 'complete'
  ].filter(Boolean).length;
  
  return (completedSteps / 5) * 100;
};

// Add in card header:
<div style={{ marginTop: 8 }}>
  <ProgressIndicator
    value={calculateInstructionProgress()}
    showPercentage={false}
    size="small"
    color={isPitchedDeal ? colours.highlight : colours.missedBlue}
    isDarkMode={isDarkMode}
  />
</div>

/**
 * EXAMPLE 3: Enhanced status update feedback
 * 
 * Location: Manual status override section (line ~2400+)
 * 
 * Current: Simple "Updating..." text
 * Enhanced: Proper loading/success/error feedback
 */

// Add state at component level:
const [statusFeedback, setStatusFeedback] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

// In handleStatusUpdate function:
const handleStatusUpdate = async (newStatus: string) => {
  setStatusFeedback('loading');
  try {
    await updateInstructionStatus(instruction.InstructionRef, newStatus);
    setStatusFeedback('success');
    setTimeout(() => setStatusFeedback('idle'), 2000);
  } catch (error) {
    setStatusFeedback('error');
    setTimeout(() => setStatusFeedback('idle'), 3000);
  }
};

// In UI:
{statusFeedback !== 'idle' && (
  <ActionFeedback
    type={statusFeedback as any}
    message={
      statusFeedback === 'loading' ? 'Updating status...' :
      statusFeedback === 'success' ? 'Status updated!' :
      'Update failed'
    }
    isDarkMode={isDarkMode}
    compact={true}
  />
)}

/**
 * EXAMPLE 4: Deal edit with feedback
 * 
 * Location: Deal edit form (line ~1550)
 * 
 * Current: Save button shows "Saving..." text
 * Enhanced: ActionButton with built-in states
 */

// Replace PrimaryButton with:
<ActionButton
  icon={<FaCheck />}
  label="Save Deal"
  onClick={async () => {
    await handleSaveDeal();
  }}
  variant="primary"
  size="small"
  isDarkMode={isDarkMode}
  disabled={isSavingDeal}
  showFeedback={true}
/>

/**
 * EXAMPLE 5: Animated pill transitions
 * 
 * Add smooth transitions when status changes
 */

const pillStyle = mergeStyles({
  transition: createTransition(['background-color', 'border-color', 'color'], 'fast', 'easeInOut'),
  // ... rest of styles
});

/**
 * EXAMPLE 6: Next action highlight
 * 
 * Visually emphasize the next step user should take
 */

const getNextActionKey = (): string => {
  if (verifyIdStatus !== 'complete') return 'id';
  if (paymentStatus !== 'complete') return 'payment';
  if (!documentsToUse || documentsToUse.length === 0) return 'documents';
  if (riskStatus !== 'complete') return 'risk';
  if (matterStatus !== 'complete') return 'matter';
  return '';
};

const nextAction = getNextActionKey();

// In pill rendering:
style={{
  // ... existing styles
  animation: step.key === nextAction ? `pulse ${ANIMATION_DURATION.slow}ms ${EASING.easeInOut} infinite` : undefined,
  boxShadow: step.key === nextAction ? '0 0 0 2px rgba(54, 144, 206, 0.3)' : undefined,
}}

/**
 * EXAMPLE 7: Card selection animation enhancement
 * 
 * Location: Card class definition (line ~940)
 * 
 * Add smooth morph animation when selecting
 */

const cardClass = mergeStyles({
  // ... existing styles
  transition: createTransition(
    ['background', 'border', 'box-shadow', 'opacity', 'transform'],
    'normal',
    'easeInOut'
  ),
  transform: selected ? 'scale(1.01)' : 'scale(1)',
  transformOrigin: 'center',
  // ... rest of styles
});

/**
 * EXAMPLE 8: Staggered pill animations on card load
 * 
 * Location: Pill container (line ~1700)
 */

import { getStaggerDelay } from '../../app/styles/animations';

// In pill rendering:
keySteps.map((step, idx) => (
  <div
    key={step.key}
    style={{
      // ... existing styles
      animation: `slideInRight ${ANIMATION_DURATION.normal}ms ${EASING.easeOut} ${getStaggerDelay(idx)}ms both`,
    }}
  >
    {/* pill content */}
  </div>
))

/**
 * INTEGRATION STEPS:
 * 
 * 1. Import components at top of InstructionCard.tsx:
 *    import { ActionButton, ActionFeedback, ProgressIndicator } from '../../components/feedback/FeedbackComponents';
 *    import { createTransition, ANIMATION_DURATION, EASING } from '../../app/styles/animations';
 * 
 * 2. Add progress calculation function after other status functions
 * 
 * 3. Add progress indicator in card header
 * 
 * 4. Replace inline loading states with ActionFeedback components
 * 
 * 5. Add transition styles to card and pill classes
 * 
 * 6. Implement next action highlighting logic
 * 
 * 7. Optional: Replace save/action buttons with ActionButton
 * 
 * 8. Test in both light and dark modes
 */

/**
 * MINIMAL INTEGRATION (Quick Wins):
 * 
 * For immediate improvement without major refactoring:
 */

// 1. Add progress bar (5 minutes):
//    - Import ProgressIndicator
//    - Add calculateInstructionProgress function
//    - Insert <ProgressIndicator /> in header

// 2. Add pill animations (5 minutes):
//    - Import createTransition
//    - Add transition property to pill styles

// 3. Highlight next action (10 minutes):
//    - Add getNextActionKey function
//    - Add conditional styling to matching pill

// Total: ~20 minutes for significant visual improvement

/**
 * FULL INTEGRATION (Maximum Impact):
 * 
 * For complete enhancement (1-2 hours):
 */

// 1. Replace all loading states with ActionFeedback
// 2. Convert action buttons to ActionButton components
// 3. Add progress indicators
// 4. Implement staggered animations
// 5. Add micro-interactions (hover, focus)
// 6. Test all states thoroughly
// 7. Verify dark mode consistency

export {}; // Make this a module
