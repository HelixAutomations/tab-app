# Changelog

Substantial tasks only.

---

- 2026-01-04 / Instructions tab backtrack links: AC & Teams origin / Added subtle visual "backtrack" indicators to the avatar card—two mini circular badges (AC & T) that link to the Active Campaign record and original Teams card where the instruction originated. Purple badge for AC, blue badge for Teams. Positioned subtly at bottom-right of avatar to show the instruction is connected to these origin sources without cluttering the main interface. Hovers highlight the links. (~ src/tabs/instructions/InlineWorkbench.tsx)

- 2026-01-04 / Instructions tab redesign: comprehensive client overview / Transformed identity tab into full "Instructions" client workspace. Added prominent header with person/company avatar, primary name/company name & number, and quick contact details (email/phone/ref). Below: key details grid (DOB, Nationality, City, Postcode), full address card with copy, then ID verification section (passport/license only, removed false "national ID"), EID results, and business details. Space now shows complete instruction/client picture—not just ID verification, but full checkpoint for all client details and verification status. (~ src/tabs/instructions/InlineWorkbench.tsx)

- 2026-01-04 / Workbench visual clarity: ID documents & payments / Enhanced ID document section to visually show which document was used (passport/license/national ID) with green highlight and indicator dot, grayed-out alternatives, and properly formatted date of birth (no timestamp). Similarly added payment method selector showing card vs bank transfer with visual status indicators. Space now speaks for itself—clearly shows situation, position, and alternatives. (~ src/tabs/instructions/InlineWorkbench.tsx)

- 2026-01-04 / Inline workbench per instruction row / Moved workbench from page-level global component to inline expansion within each instruction row. Created InlineWorkbench.tsx component with tabbed sections (ID, PAY, DOCS, RISK, MATTER). Click row to toggle workbench. Includes header with instruction ref, notes/description, and all pipeline action buttons. Removed page-level workbench visibility triggers from onRowClick. (+ src/tabs/instructions/InlineWorkbench.tsx, ~ src/tabs/instructions/InstructionTableView.tsx, ~ src/tabs/instructions/Instructions.tsx)

- 2026-01-04 / Instructions table ref selector not opening / Replaced inline absolute dropdown with Fluent UI Callout anchored to the reference chip (avoids overflow clipping) and keyed view-mode state by a stable selector key (email/ref fallback). (~ src/tabs/instructions/InstructionTableView.tsx)

- 2026-01-04 / Instructions table ref cue + linking / Added an explicit multi-ref count badge and a stacked secondary ref line to visually link matter + instruction in the same chip area (and removed debug console spam). (~ src/tabs/instructions/InstructionTableView.tsx)

- 2026-01-04 / Instructions table chip compactness / Reverted ref chip to single-line height; replaced badge with subtle dot cue; show matter↔instruction linkage only inside the open selector. (~ src/tabs/instructions/InstructionTableView.tsx)

- 2026-01-04 / Instructions table chip overlap / Constrained ref chip to its fixed-width cell (clip overflow) so it doesn't overlap the pipeline connector line. (~ src/tabs/instructions/InstructionTableView.tsx)

- 2026-01-02 / Workbench UI consistency redesign / Redesigned Matter Opening Workbench (ID/PAY/DOCS/RISK/MATTER tabs) for better consistency with app design patterns. Simplified header styling, removed complex gradients/shadows, aligned tab design with app conventions, improved color consistency using established theme system. Cleaner visual hierarchy, consistent spacing, and reduced visual noise while maintaining full functionality. (~ src/tabs/instructions/Instructions.tsx)

- 2026-01-02 / Enquiries ID column shows instruction reference / Added instruction reference display beneath enquiry ID when a pitch/deal exists with an InstructionRef. Matches Instructions table pattern (ID + Reference stacked). Updated backend SQL to include InstructionRef, added field to pitchEntry object and TypeScript interface. (~ server/routes/enquiryEnrichment.js, src/app/functionality/enquiryEnrichment.ts, src/tabs/enquiries/Enquiries.tsx)

- 2026-01-02 / Pitch builder caret jumps to start while typing / Fixed body sync effect to treat focus within editor children (e.g. placeholder spans) as focused, preventing innerHTML rewrites during typing. (~ src/tabs/enquiries/PitchBuilder.tsx)

- 2026-01-01 / Annual leave UX polish & space booking system / Enhanced annual leave delete modal contrast for dark mode (pure white text). Fully tested half-day leave functionality via terminal with database schema updates (half_day_start/half_day_end columns). **Major**: Space booking system fully operational - fixed bookSpace.js imports, added attendanceQuery pattern, tested Boardroom/Soundproof Pod bookings with Clio integration. Added DELETE endpoint + UI delete functionality with confirmation dialogs. Cleaned availability UI to only show dates with bookings. Added booking refresh after creation. (~ src/CustomForms/AnnualLeaveForm.tsx, BookSpaceForm.tsx, server/routes/bookSpace.js, server/server.js, src/tabs/home/Home.tsx, + scripts/createBookingTables.mjs, deleteTestBookings.mjs)

- 2026-01-01 / Instructions day folding not applying / Fixed local/static server to prefer serving latest CRA output from build/ so UI code changes (e.g., day folding/hover) show up after rebuild. (~ server/index.js, server/server.js)

- 2025-12-31 / Pitch builder production refinements / Cleaned up pitch builder for production: standardized terminology (Scope of Work, Quote Amount), simplified labels (removed colons, reduced verbosity), cleaner VAT toggle ("No VAT (international)"), improved error display, consolidated confirmation messages. Enhanced UI with refined borders (8px radius), softer shadows, smoother transitions (cubic-bezier), subtle focus glows, better card hover states. Professional polish throughout. (~ src/tabs/enquiries/pitch-builder/DealCapture.tsx, PaymentPreview.tsx, EditorAndTemplateBlocks.tsx)

- 2025-12-30 / Migrate decoupled-functions to Express / Ported 5 functions to direct SQL in Express routes (matterRequests, opponents, ccl, pitches). Deleted ALL remaining decoupled function folders (15 total). decoupled-functions/ now empty except scaffolding. No more dependency on instructions-vnet-functions Azure Function App. (~ server/routes/matterRequests.js, server/routes/opponents.js, server/routes/ccl.js, server/routes/pitches.js, - decoupled-functions/*/)

- 2025-12-30 / Dead code removal: decoupled-functions / Deleted 8 unused Azure Functions: fetchEnquiryEmails, fetchEnquiriesData, recordRiskAssessment, dealCapture, importInstructionData, deleteTestMatters, insertEnquiry, sendEmail. Also removed dead routes: enquiries.js, enquiryEmails.js, EnquiryEmails.tsx. (- decoupled-functions/*, server/routes/enquiries.js, server/routes/enquiryEmails.js, src/tabs/enquiries/EnquiryEmails.tsx)

- 2025-12-30 / Foundation cleanup / Archived one-off scripts, fixed stale file references in instruction docs, added doc maintenance rule to copilot-instructions. (+ scripts/archive/, .github/copilot-instructions.md, .github/instructions/*.md)

- 2025-12-30 / Agent infrastructure / Built context sync system for autonomous agents. Scripts auto-generate REALTIME_CONTEXT.md with branch state, submodule status, server ports. Session start protocol established. (+ scripts/sync-context.mjs, scripts/update-submodules.mjs, scripts/validate-instructions.mjs, scripts/session-start.mjs, .github/instructions/REALTIME_CONTEXT.md, .github/copilot-instructions.md)

- 2025-12-30 / 2025 Rate Update / Updated all fee earner rates in both databases (helix-core-data, instructions). Alex Cook + Jonathan Waters → Senior Partner £475. All roles updated to new structure. (+ scripts/updateRates2025.mjs, scripts/updateRatesInstructions.mjs, database/migrations/010_2025_rate_update.md, .github/instructions/TEAM_DATA_REFERENCE.md)

- 2025-12-30 / Instruction files foundation / Added TEAM_DATA_REFERENCE.md, WORKSPACE_OPTIMIZATION.md. Updated copilot-instructions.md to match typefxce foundation pattern. (+ .github/instructions/*, .github/copilot-instructions.md)
