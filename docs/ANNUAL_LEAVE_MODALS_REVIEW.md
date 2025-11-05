# Annual Leave Modals Review & Analysis

## Current State Assessment

### 1. **Annual Leave Approvals Modal** (`AnnualLeaveApprovals.tsx`)

#### Current Implementation
- **Full-screen overlay modal** with 1200px max width
- Each approval displayed as a **large card** (professionalContainerStyle)
- **32px padding** per card
- Multiple sections per card:
  - Header with Persona + status badge
  - 4-column "Critical Information Grid" showing Request Period, Business Days, FY Days Taken, Remaining
  - Notes section (if present)
  - Hearing confirmation section (with conditional logic)
  - Team Coverage Analysis (conflicts grid)
  - Action buttons (Approve/Reject)
  - Rejection notes textarea
  - Confirmation message area

#### Problems Identified

**Visibility Issues:**
1. **Too much vertical scrolling** - Each approval takes ~600-800px of vertical space
2. **Information hierarchy unclear** - All data given equal visual weight
3. **Critical data buried** - Decision-making info (days remaining, conflicts) mixed with secondary details
4. **Inefficient scanning** - Can't quickly see multiple approvals at once

**Data Issues:**
1. **`daysSoFar` calculation includes current request** - The function `sumBookedAndRequestedDaysInFY` counts:
   - status === 'booked'
   - status === 'requested' ⚠️ **THIS INCLUDES THE CURRENT REQUEST BEING REVIEWED**
   - status === 'approved'
   
   **BUG:** When reviewing a request for 5 days, if the person has used 10 days so far, it shows "15 / 25" instead of "10 / 25". The "Remaining After" calculation is then wrong: shows 10 days remaining when it should be 15.

2. **Hearing confirmation logic is overly complex** - Multiple type checks, string comparisons, conditional rendering make it hard to maintain

3. **Team conflicts calculation** - Checks ALL other leave (including other pending requests), which may not be accurate for decision-making

**Time-Saving Issues:**
1. **No keyboard shortcuts** - ESC closes modal, but no quick approve/reject
2. **Auto-close after action** - 800ms delay feels arbitrary, can't review multiple quickly
3. **No batch operations** - Must approve/reject one at a time
4. **Modal blocks entire screen** - Can't reference other information while reviewing

---

### 2. **Book Requested Leave Modal** (`AnnualLeaveBookings.tsx`)

#### Current Implementation
- Uses legacy `formContainerStyle` from BespokeForms
- Each booking displayed as a **large card**
- Status-dependent backdrop (green for approved, yellow for rejected)
- Large icon + title combo takes significant space
- Actions: "Book to Confirm" / "Acknowledge" (for rejected)
- "No Longer Needed" button for approved items

#### Problems Identified

**Visibility Issues:**
1. **Excessive whitespace** - Large persona, oversized icon, redundant title
2. **Poor information density** - Each booking takes ~400-500px height
3. **Status indication redundant** - Both backdrop color AND text say "Approved/Rejected"
4. **Date display inefficient** - "Approved Dates: 15 Dec - 20 Dec 2024" could be more compact

**Data Issues:**
1. **No context about remaining days** - User doesn't know if booking this will leave them with sufficient cover
2. **No visibility into why** - Approved items don't show who approved or when
3. **Rejection notes hidden** - Only shown if rejected, but buried at bottom

**Time-Saving Issues:**
1. **No quick book-all** - Must click each one individually
2. **Confirmation message timing** - No auto-dismiss or clear CTAs
3. **"Updated" state cosmetic only** - Grey background + green border doesn't convey much

---

## Recommended Solutions

### Redesign Goals
1. **Maximize information density** - Show more approvals/bookings at once
2. **Clear visual hierarchy** - Critical data stands out, secondary info accessible but not intrusive  
3. **Fix data calculations** - Exclude current request from "days so far" calculation
4. **Enable quick actions** - Keyboard shortcuts, batch operations where appropriate
5. **Context awareness** - Show relevant data for decision-making, hide unnecessary details

### Proposed Changes

#### **Annual Leave Approvals:**
1. **Compact card layout** (~200px height instead of 600-800px):
   - Single-line header: Avatar + Name + Date range + Days requested
   - Key metrics inline: "10/25 days used → 10 remaining after approval"
   - Status pills for conflicts (e.g., "2 team conflicts")
   - Expand/collapse for full details (notes, hearing info, conflict details)

2. **Fix `daysSoFar` calculation**:
   ```ts
   // BEFORE: Includes current request
   const daysSoFar = sumBookedAndRequestedDaysInFY(allLeaveEntries, entry.person, fyStartYear);
   
   // AFTER: Exclude current request
   const daysSoFar = sumBookedAndRequestedDaysInFY(
     allLeaveEntries.filter(e => e.id !== entry.id), 
     entry.person, 
     fyStartYear
   );
   ```

3. **Action-focused layout**:
   - Approve/Reject buttons always visible (not hidden below fold)
   - Quick reject reasons dropdown (common reasons like "Insufficient cover", "Timing conflict")
   - Keyboard shortcuts: A to approve, R to reject, Down/Up arrows to navigate

4. **Simplified hearing logic**:
   - Boolean field only: `hasHearings: boolean`
   - If true, show warning icon + details on expand
   - Remove complex string parsing

#### **Book Requested Leave:**
1. **Compact list layout** (~120px height per item):
   - Status indicator (left border: green = approved, red = rejected)
   - Single line: Name + Date range + Days
   - Primary action button inline (right side)
   - Rejection notes as tooltip or expandable

2. **Batch operations**:
   - "Book All Approved" button at top
   - Checkboxes for selective booking

3. **Better feedback**:
   - Toast notifications instead of inline messages
   - Auto-remove from list after action (with undo option)

---

## Next Steps

1. **Confirm data bug** - Test `daysSoFar` calculation with a real request
2. **Create mockups** - Design compact layouts for both modals
3. **Implement compact approval cards** - Focus on information density
4. **Implement compact booking cards** - Streamline actions
5. **Add keyboard navigation** - Improve accessibility and speed
6. **Test with real data** - Verify calculations are correct

---

## Files to Modify

- `src/CustomForms/AnnualLeaveApprovals.tsx` - Main approval modal
- `src/CustomForms/AnnualLeaveBookings.tsx` - Main booking modal
- Potentially create new shared components:
  - `CompactLeaveCard.tsx` - Reusable compact card layout
  - `LeaveMetrics.tsx` - Consistent metrics display
  - `LeaveActions.tsx` - Standardized action buttons
