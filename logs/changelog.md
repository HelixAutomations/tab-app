# Changelog

Substantial tasks only.

---

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
