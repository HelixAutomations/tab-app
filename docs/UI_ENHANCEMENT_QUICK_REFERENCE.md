# UI Enhancement Quick Reference

## Common Patterns - Copy & Paste Ready

### 1. Show Loading State
```tsx
import { ActionFeedback } from '../../components/feedback/FeedbackComponents';

{isLoading && <ActionFeedback type="loading" message="Loading..." isDarkMode={isDarkMode} />}
```

### 2. Show Success Message
```tsx
{success && <ActionFeedback type="success" message="Saved successfully!" isDarkMode={isDarkMode} duration={2000} />}
```

### 3. Show Error Message
```tsx
{error && <ActionFeedback type="error" message={error} isDarkMode={isDarkMode} />}
```

### 4. Button with Auto Feedback
```tsx
import { ActionButton } from '../../components/feedback/FeedbackComponents';

<ActionButton
  icon={<FaSave />}
  label="Save"
  onClick={async () => await handleSave()}
  variant="primary"
  isDarkMode={isDarkMode}
/>
```

### 5. Progress Bar
```tsx
import { ProgressIndicator } from '../../components/feedback/FeedbackComponents';

<ProgressIndicator
  value={progress}
  label="Progress"
  showPercentage={true}
  isDarkMode={isDarkMode}
/>
```

### 6. Skeleton Loader
```tsx
import { SkeletonLoader } from '../../components/feedback/FeedbackComponents';

{isLoading ? (
  <SkeletonLoader width="100%" height={20} isDarkMode={isDarkMode} />
) : (
  <div>{content}</div>
)}
```

### 7. Card Loading State
```tsx
import { CardTransitionWrapper } from '../../components/feedback/CardSkeleton';

<CardTransitionWrapper isLoading={isLoading} isDarkMode={isDarkMode}>
  <InstructionCard {...props} />
</CardTransitionWrapper>
```

### 8. Smooth Transition
```tsx
import { createTransition } from '../../app/styles/animations';

style={{
  transition: createTransition(['opacity', 'transform'], 'fast', 'easeInOut')
}}
```

### 9. Hover Effect
```tsx
import { HOVER_STATES } from '../../app/styles/animations';
import { mergeStyles } from '@fluentui/react';

const buttonClass = mergeStyles({
  ...HOVER_STATES.subtle  // or .lift or .scale
});
```

### 10. Staggered List Animation
```tsx
import { getStaggerDelay } from '../../app/styles/animations';

items.map((item, index) => (
  <div 
    key={item.id}
    style={{
      animation: `fadeIn 300ms ease-out ${getStaggerDelay(index)}ms both`
    }}
  >
    {item.content}
  </div>
))
```

---

## Animation Constants

```tsx
import { ANIMATION_DURATION, EASING } from '../../app/styles/animations';

// Durations (milliseconds)
ANIMATION_DURATION.instant  // 100ms
ANIMATION_DURATION.fast     // 200ms
ANIMATION_DURATION.normal   // 300ms
ANIMATION_DURATION.slow     // 500ms
ANIMATION_DURATION.verySlow // 800ms

// Easing
EASING.easeInOut   // Standard
EASING.easeOut     // Deceleration
EASING.spring      // Bouncy
EASING.sharp       // Quick
```

---

## Color System

```tsx
import { colours } from '../../app/styles/colours';

// Status Colors
colours.green      // #20b26c - Success
colours.highlight  // #3690CE - Info/Primary
colours.missedBlue // #0d2f60 - Instructions
colours.accent     // #87F3F3 - Dark mode accent
colours.cta        // #D65541 - Danger/CTA

// Contextual
colours.darkBlue   // #061733 - Dark backgrounds
colours.grey       // #F4F4F6 - Light backgrounds
colours.greyText   // #6B6B6B - Subtle text
```

---

## Status Pill Colors

```tsx
// Green - Complete
backgroundColor: 'rgba(34, 197, 94, 0.1)'
border: '1px solid rgba(34, 197, 94, 0.3)'
color: '#22c55e'

// Red - Review/Error
backgroundColor: 'rgba(239, 68, 68, 0.1)'
border: '1px solid rgba(239, 68, 68, 0.3)'
color: '#ef4444'

// Amber - Processing
backgroundColor: 'rgba(251, 191, 36, 0.1)'
border: '1px solid rgba(251, 191, 36, 0.3)'
color: '#fbbf24'

// Grey - Pending/Neutral
backgroundColor: 'rgba(148, 163, 184, 0.1)'
border: '1px solid rgba(148, 163, 184, 0.3)'
color: '#94a3b8'
```

---

## Common Keyframes

```tsx
// Fade In
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

// Slide In
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

// Pulse
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

// Spin
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// Shimmer
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

---

## Button States

```tsx
import { BUTTON_STATES } from '../../app/styles/animations';

// Loading
style={{ ...BUTTON_STATES.loading }}

// Success
style={{ ...BUTTON_STATES.success }}

// Error
style={{ ...BUTTON_STATES.error }}
```

---

## Responsive Utilities

```tsx
// Standard responsive breakpoints
@media (max-width: 768px) {
  // Tablet
}

@media (max-width: 480px) {
  // Mobile
}

// Touch-friendly sizes (mobile)
minHeight: 44,     // Minimum touch target
padding: '12px',   // Adequate spacing
fontSize: 14,      // Readable text
```

---

## Dark Mode Patterns

```tsx
// Background
background: isDarkMode ? '#0f172a' : '#ffffff'

// Text
color: isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)'

// Border
border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`

// Shadow (light mode only)
boxShadow: isDarkMode ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
```

---

## Best Practices

### DO ✅
- Use `createTransition()` for consistent timing
- Apply `transform` and `opacity` for animations (GPU-accelerated)
- Show loading states immediately
- Provide success confirmation
- Use semantic colors (green=success, red=error)
- Test in both light and dark modes

### DON'T ❌
- Animate `height`, `width`, `top`, `left` (causes layout)
- Skip loading states
- Use inconsistent timing
- Forget error handling
- Ignore dark mode
- Over-animate (causes distraction)

---

## Performance Tips

1. **Use GPU-accelerated properties**: `transform`, `opacity`
2. **Add `will-change`** for complex animations: `will-change: transform`
3. **Limit concurrent animations** to avoid jank
4. **Debounce rapid state changes**
5. **Use skeleton loaders** instead of spinners for better perceived performance

---

## Component Props Reference

### ActionFeedback
```tsx
type: 'success' | 'error' | 'warning' | 'info' | 'loading'
message?: string
isDarkMode?: boolean
duration?: number  // Auto-dismiss time (ms), 0 = no dismiss
onComplete?: () => void
compact?: boolean
```

### ActionButton
```tsx
icon?: React.ReactNode
label: string
onClick: () => void | Promise<void>
isDarkMode?: boolean
variant?: 'primary' | 'secondary' | 'danger'
disabled?: boolean
showFeedback?: boolean  // Show success/error states
size?: 'small' | 'medium'
```

### ProgressIndicator
```tsx
value: number  // 0-100
label?: string
showPercentage?: boolean
isDarkMode?: boolean
size?: 'small' | 'medium' | 'large'
color?: string  // Custom progress color
```

### SkeletonLoader
```tsx
width?: string | number
height?: string | number
borderRadius?: number
isDarkMode?: boolean
```

---

## File Locations

- **Components**: `src/components/feedback/`
- **Animations**: `src/app/styles/animations.ts`
- **Colors**: `src/app/styles/colours.ts`
- **Docs**: `docs/UI_ENHANCEMENT_SYSTEM.md`
- **Examples**: `src/tabs/instructions/InstructionCard.integration-example.tsx`

---

## Quick Start Checklist

When adding feedback to a new feature:

1. [ ] Import components: `import { ActionButton, ActionFeedback } from '../../components/feedback/FeedbackComponents';`
2. [ ] Add loading state: `const [isLoading, setIsLoading] = useState(false);`
3. [ ] Wrap async actions with loading state
4. [ ] Show ActionFeedback on success/error
5. [ ] Add ProgressIndicator if multi-step process
6. [ ] Test in light and dark modes
7. [ ] Verify animations are smooth
8. [ ] Check mobile responsiveness

---

**Remember**: Good UI feedback keeps users informed, confident, and engaged!
