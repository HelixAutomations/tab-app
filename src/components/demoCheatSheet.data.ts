// src/components/demoCheatSheet.data.ts
//
// My notes for Hub demos. Glance-aid only.
// Pulled up via Ctrl+Shift+D overlay (DemoCheatSheetOverlay.tsx).
//
// Tone rules:
//   • These are my notes, not instructions for the audience.
//   • Fragments. Short. The thing I want to remember to say.
//   • No "open the page", "click the button", "log in as self". I know.
//   • `notes` = bullets I want in front of me while talking.
//   • `approachLZWhen` = escalation list (team-facing half).
//   • `readiness` = ready / settling / not-for-use. Honest signal.
//   • `audience` = who's in the room.
//       admin → partner, leadership, ops view.
//       user  → fee-earner POV.
//       dev   → only me. Forge, telemetry, override editor.
//     Omitted = visible to all. Drives a small chip beside readiness.
//   • `group` = visual block in the nav.
//       flow → hardened core journey (the dream that finally works)
//       new  → newer features layered on, not the original flow
//       meta → rollout, dev surfaces, anything off-journey
//     Omitted = treated as `flow`.
//   • Update `lastReviewed` when the section is touched. >14d goes amber.
//
// Story shape is the user journey, not the feature map. Cass is no longer
// involved — issues route via Tech support form direct to me.

export type ReadinessTier = 'ready' | 'settling' | 'not-for-use';
export type AudienceTier = 'admin' | 'user' | 'dev';
export type SectionGroup = 'flow' | 'new' | 'meta';
export type DemoNotesDepth = 'basic' | 'detailed';
export type DemoAppLinkTab = 'home' | 'enquiries' | 'matters' | 'forms' | 'reporting' | 'roadmap';
export type DemoReportingView = 'logMonitor' | 'dataCentre' | 'ppcReport';
export type DemoEnquirySubTab = 'Pitch' | 'Timeline';
export type DemoWorkbenchTab = 'details' | 'identity' | 'payment' | 'risk' | 'matter' | 'documents' | 'pitch';
export type DemoPreviewAction = 'claimedQueueHolding';

export type DemoAppLink = {
  label: string;
  tab: DemoAppLinkTab;
  enquiryId?: string;
  enquirySubTab?: DemoEnquirySubTab;
  formTitle?: string;
  reportingView?: DemoReportingView;
  workbenchTab?: DemoWorkbenchTab;
  featureToggles?: Record<string, boolean>;
  previewAction?: DemoPreviewAction;
};

export type DemoSection = {
  id: string;
  order: number;
  title: string;
  subtitle?: string;              // optional subtler line under the title
  basicNotes?: string[];          // compact call-safe script
  notes: string[];                // bullets in my voice
  approachLZWhen?: string[];      // escalation list (team-facing half)
  readiness?: ReadinessTier;
  audience?: AudienceTier[];      // omitted = all three
  group?: SectionGroup;           // omitted = flow
  crossApp?: string[];            // only where genuinely cross-app
  lastReviewed: string;
};

export const SECTION_GROUP_LABELS: Record<SectionGroup, string> = {
  flow: 'Core flow',
  new: 'Newer features',
  meta: 'Rollout & dev',
};

export const DEMO_CHEAT_SHEET_SECTIONS: DemoSection[] = [

  // ===========================================================================
  // FLOW — the hardened core journey
  // ===========================================================================

  {
    id: 'main-use',
    order: 1,
    title: 'Start Here',
    readiness: 'settling',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Hub is the operations layer. Three doors in, depending who you are.',
      'Fee earner: pitch fires, portal emails them, Teams pings them. They land in Hub. Email is the prompt, work lives here.',
      'Partners and ops leads live in Hub all day. Prospects, forms, reports and attendance notes all sit here.',
      'Me: same Hub, more surfaces. Activity, telemetry, Forge.',
      'To Do strip is the bridge. Without it the email is just noise.',
      'Notification side is still the weakest link. Settling, not solved.',
    ],
    crossApp: [
      'Notification originates in instruct-pitch portal',
      'Email sent via automations@helix-law.com (rich-card signature)',
      'Hub is where the actual work happens',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'home-todo',
    order: 2,
    title: 'Home',
    subtitle: 'To Do, context, L&D',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Home pulls the firm-wide working surface together: billing, conversion, To Do and L&D, external calls and filing workspace, attendance and leave.',
      'L&D: training plan, logged CPD activities, progress tracking. Supports continuing competence record-keeping. (Hours target placeholder for now.)',
      'To Do is the single queue. Cards clear themselves when the underlying step is complete. No manual dismiss.',
      'Cards: ID checks, risk assessments, matters to open, CCLs to review, undertaking approvals, leave requests and approvals, files ready to open.',
      'Conversion chart: enquiries as a line, matters as bars. Blue is this period, grey is the period before. Click a recent prospect chip to keep it open.',
      'Personal time, outstanding balances and conversion sit alongside, always visible.',
      'Team attendance is firm-wide.',
      'External Calls panel is Mine by default. Luke, Alex, Jonathan, and Laura can flip to All. Sourced from Dubber.',
      'Mine / Everyone toggle now sits in the To Do header itself. Subtle text pair, not a pill.',
      'UX is sharper across the board. Panels appear instantly, live updates fill in behind, no flicker on tab switches. Flag anything that still feels off, that is how it tightens further.',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'prospects-claim',
    order: 3,
    title: 'Prospects: claim, triage, pitch routes',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Three workflows: Claimed, Unclaimed, Triaged',
      'Triaged means pitched as part of triage (creates a deal like Pitch Builder)',
      'Pitches toggle is anything emailed via Pitch Builder',
      'Add Contact for manual entry, prospects outside enquiry channels',
      'Claim & Respond, card lands in 1:1 chat with tel note, full enquiry, quality rating',
      'Quality rating feeds ad targeting',
      'AoW dropdown and Reassign to fix wrong placement live',
      'Click prospect, toggle Overview / Pitch Builder',
    ],
    crossApp: [
      'Enquiries originate in enquiry-processing-v2',
      'Triage layer normalises before they hit Hub',
      'Same record, three lenses. Capture, operate, deliver.',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'pitch-builder',
    order: 4,
    title: 'Pitch Builder + instruct link',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Two outputs. Send the full pitch email with the instruct link inside, or use a checkout-only link with no email.',
      'This is not just the email builder. The instruct link is the second part, which is why it has its own section.',
      'The ID and passcode are unique to this pitch. They sit inside the instruct link.',
      'Never copy and reuse an old instruct link.',
      'Scenarios sit on cards, with the explanation on the card itself.',
      '---',
      'Placeholders stay red until they are satisfied.',
      'Every pitch step must tick off before Send unlocks.',
      'Preview stays available even while Send is locked.',
      'Ctrl+Z if I clear the body by accident.',
      '---',
      'Send opens the Review & Send modal. Adjust CC/BCC, then tick "everything looks good".',
      'Optional: send a draft to yourself first, just to check the layout.',
      'Automated mail now uses one consistent rich-card signature.',
      '---',
      'Forward scope: pitch as a Teams card. Same builder, posted into Teams instead of email.',
    ],
    crossApp: [
      'The instruct link opens the instruct-pitch portal.',
      'Send goes via /api/sendEmail. From the fee earner where available, fallback automations@helix-law.com. Saved to Sent Items.',
      'The client never sees Hub. Their whole journey sits in the portal.',
      'The same passcode unlocks the portal session.',
    ],
    lastReviewed: '2026-05-06',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'post-instruct-overview',
    order: 5,
    title: 'After instruction: Overview + step strip',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Steps strip: Claimed, Pitched, Instructed, ID, Paid, Risk, Matter, Documents',
      'Each step is actioned, pending or unactioned. Colour reflects real state, not a wish.',
      'Correspondence and timeline: emails, calls, pitches, payments, docs',
      'This is the screen the fee earner lands on after the To Do card opens the workbench',
      'From here the rest of the journey is the workbench items below',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'workbench-id',
    order: 6,
    title: 'Workbench: ID verification',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Prompt is the To Do card "ID needs checking" for this prospect\u2019s journey stage',
      'ID pills must call onEIDClick(). No detail expansion. (product guardrail)',
      'Tiller-stored verification shows inline. Re-run is available where the original check shape is on file.',
      'Manual run and draft document collection email available where appropriate',
      'Failed ID check goes to manual review (Approach LZ when)',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'workbench-risk',
    order: 7,
    title: 'Workbench: Risk assessment',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Prompt is the To Do card "risk assessment" for this prospect\u2019s journey stage',
      'Risk colour comes from RiskAssessmentResult, NOT TransactionRiskLevel (product guardrail)',
      'Score and factors visible inline. Assessor and timestamp stored.',
      'Once recorded the step strip advances and the next To Do appears',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'workbench-matter',
    order: 8,
    title: 'Workbench: Matter opening',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Prompt is the To Do card "matter opening request" or "ready to open"',
      'Page 1: client info, conflict checks, opponents (optional, addable later)',
      'Page 2: responsible, originating, supervising, description, ND folder, AoW, practice area, value, source',
      '5 supervising partners only',
      'Review tick must be on before button enables',
      'Opens simultaneously in Clio, ND and Hub',
      'Failure path sends an alert email (unified rich-card signature)',
      'New: "Open Matter for Existing Client" modal. Visible to a limited preview group in production for now, the chain is simulated so nothing real is created. Forms-style search bar, picks from a current instruction or a legacy POID record.',
      'Lesson from the Phil Green / Dandelion replay: in Clio the originating attorney has to match whoever\'s logged in to fire the call. Trying to set someone else as originating is rejected.',
      'Re-open under corrected details is a manual ops job (Approach LZ when)',
    ],
    crossApp: [
      'Writes to Clio (matter) and to NetDocuments (folders for the matter)',
      'Hub coordinates. Clio and NetDocuments hold the records.',
      'If any leg fails the row stays open with a failure trail',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'workbench-ccl-generate',
    order: 9,
    title: 'CCL: AI generation',
    readiness: 'settling',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Prompt is the To Do card "CCL review", surfaces after matter open if not done',
      'First pass. AI fills 26 intake fields from across Hub: Instructions, Deals, Pitch content, Core Data.',
      'Confidence: full, partial, fallback. Full confidence auto-approves and rolls straight into pressure test.',
      'Template and data still being refined. Improving, not done.',
    ],
    crossApp: [
      'Generation route: /api/ccl-ai/fill',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'workbench-ccl-pressure-test',
    order: 10,
    title: 'CCL: pressure test (Safety Net)',
    readiness: 'settling',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Second AI pass. Scores each field 0-10 against the wider evidence: emails, transcripts, deal data.',
      'Score 7 or below gets an orange flag. Passes get a green dot.',
      'Runs automatically after generation if the first pass was high confidence. Manual trigger otherwise.',
      'Integrity guard: while the pressure test is still running, the per-field view shows an orange "pressure test still running" banner. The flagged-field count can change, so sign-off waits.',
      'The bit that buys trust. Not a rewrite, just a flag.',
    ],
    crossApp: [
      'Pressure test route: /api/ccl-ai/pressure-test',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'workbench-ccl-review',
    order: 11,
    title: 'CCL: fee earner review + sign-off',
    readiness: 'settling',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Review rail. Flagged fields shown inline: accept, reject, or edit.',
      'The field label sits directly above the editor, so the eye goes to the right place.',
      'Green ticks for verified, orange strip for flagged.',
      'Approve only does the approval and an internal send. Upload to NetDocuments is a separate, explicit click on the success card. Nothing leaves silently.',
      'Final upload and send still sits with the fee earner. Hub flags, fee earner ships.',
    ],
    crossApp: [
      'Final letter destined for ND folder per matter',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'workbench-doc-transfer',
    order: 12,
    title: 'Workbench: Document transfer (after CCL on purpose)',
    readiness: 'not-for-use',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Logically this belongs before CCL.',
      'We run it after on purpose. CCL generation buys NetDocuments the time it needs to spin folders up. Practical, not arbitrary.',
      'Prompt would be the To Do card "transfer documents", after CCL is signed off.',
      'NetDocuments side mostly in place. The link from our Azure storage into NetDocuments and Clio is still being wired.',
      'Not live yet. Upcoming, not part of the working flow today.',
      'When live: documents the prospect uploaded earlier (during the pitch / portal stage) move into the matter workspace.',
    ],
    crossApp: [
      'Source: Azure storage (where prospect uploads land first)',
      'Targets: NetDocuments folder for the matter, optional Clio link',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'matter-handoff',
    order: 13,
    title: 'Handoff: workbench → matter space',
    readiness: 'settling',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'The join between opening and running. CCL signed, doc transfer kicked, card surfaces in the matter space.',
      'Workbench goes quiet. Matter card and the matter itself take over.',
      'Click the card to enter the matter. Steps strip mirrors Overview.',
      'The transition still has rough edges. Wants a cleaner cue.',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'matter-card',
    order: 14,
    title: 'Matter card + Clio bridge',
    readiness: 'settling',
    audience: ['admin', 'user'],
    group: 'flow',
    notes: [
      'Matter card redirects to Clio matter or client',
      'Worktype, responsible solicitor, open date on the card',
      'Time and cost breakdown, client info, matter details',
      'Steps strip mirrors Overview',
      'Tabs: Activities, Documents, Comms, Billing',
      'Matters tab is messy right now. Scope to add controls and a resources surface here.',
    ],
    lastReviewed: '2026-05-05',
  },

  // ===========================================================================
  // NEW — newer features layered on, visually separate
  // ===========================================================================

  // ---------------------------------------------------------------------------
  {
    id: 'forms-feedback',
    order: 15,
    title: 'Forms + Tech support feedback loop',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'new',
    notes: [
      'General, Operations, Financial, Tech support, Recommendations, Directories',
      'Every submission lands in the unified Forms stream',
      'Cross-check: Forms stream row vs matching Asana board task',
      'Tech support is where issues are reported. Drives the feedback loop direct to me now.',
      'Forms now talk to the Hub server directly instead of bouncing through the old proxy app. Faster, and the silent broken-URL failures we used to see are gone.',
      'The server now actively rejects the broken URL pattern with a clear error and logs it, so the same regression can\'t come back quietly. The Activity tab Failures lens shows it the moment it happens.',
    ],
    approachLZWhen: [
      'Submission lands in the stream but not in its Asana board',
      'Submission shows in stream but the form thinks it failed',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'reports',
    order: 16,
    title: 'Reports',
    readiness: 'ready',
    audience: ['admin', 'user'],
    group: 'new',
    notes: [
      'Reports matters more to partner and ops views than to the day-to-day fee earner flow.',
      'Conversion chart reframed as flow vs outcomes. Enquiries as a line with daily stems, matters as narrower paired bars. No more enquiries area wash.',
      'Previous period reads as one shared quiet grey across both series. Current period carries the colour identity.',
      'Quieter chart overall: dotted column separators, hover guide gone, KPI dot dropped. Signal first.',
      'Today vs yesterday across weekends. Falls back to Friday vs Thursday only when both weekend days are empty.',
      'Conversion baskets: matter chips render identically to enquiry chips. Dropped the always-on green tick that was being misread as "verified".',
      'Open in Hub always present on the prospect chip menu, alongside Clio and ActiveCampaign.',
      'Conversion recents are clickable and pinnable (selected chip state)',
      'Matter journeys link back to the originating enquiry/claim. Hub action opens the Conversion stream view.',
      'Annual leave reports and non-billable Clio reports available for ops',
      'PPC report and automated ops strip live in Reporting tab',
      'Reports tab access is its own thing. It is intentionally separate from general admin access.',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'attendance-notes',
    order: 17,
    title: 'Attendance notes',
    readiness: 'settling',
    audience: ['admin'],
    group: 'new',
    notes: [
      'Newer feature, separate from the core fee-earner journey',
      'Uses the NetDocuments folder plumbing but its own workflow',
      'Call rows on Home (External Calls) carry attendee context. Primary plus supporting sit-ins.',
      'AI extracts secondary Helix attendees from the transcript with presence evidence',
      'Filing workspace lets you target Matter, Prospect, file or person from the right-rail tabs',
      'Matter and prospect lookups remember recent picks. Less typing on the second note of the day.',
      'Clio time entry is now its own toggle, not coupled to chargeable. Caption shows units AND \u00a3 value at the picked rate.',
      'Save caption changes from "Save & upload note to NetDocuments" to "Save & upload note to {matter number}" once a matter is picked.',
      'NetDocuments target icon goes amber when the toggle is on but no matter is picked, then green once a matter is chosen.',
      'Empty state: generate a note from the transcript, or write one manually. Both one click.',
      'Prospect filing only writes to Hub and ActiveCampaign. No NetDocuments, no Clio, no To Do row.',
      'Outbound emails use the unified rich-card signature',
    ],
    crossApp: [
      'Recording source: Dubber',
      'ActiveCampaign sync for prospect-targeted notes',
      'NetDocuments folder destination once a matter is chosen',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'ac-uploads',
    order: 18,
    title: 'ActiveCampaign uploads (prospect routes only)',
    readiness: 'settling',
    audience: ['admin'],
    group: 'new',
    notes: [
      'Scope limit: ActiveCampaign uploads exist for the prospect routes only',
      'Not the same as document transfer into a matter (#12). Separate flow.',
      'Worth saying out loud so people don\'t assume it works the same as the matter side',
    ],
    lastReviewed: '2026-05-05',
  },

  // ===========================================================================
  // META — rollout, dev surfaces
  // ===========================================================================

  // ---------------------------------------------------------------------------
  {
    id: 'rollout-framework',
    order: 19,
    title: 'Rollout & feedback framework',
    readiness: 'settling',
    audience: ['admin', 'dev'],
    group: 'meta',
    notes: [
      'Five questions answered: announce, readiness labels, questions, issues, loop',
      'Routing rule: issues go to Tech support form. Questions to 1:1 ops chat. Announcements to System tab plus ops call.',
      'Readiness labels: ready, still settling, not for use',
      'Issues: Tech support form, then Tech & Automations Asana board. Comes straight to me.',
      'Loop: report, I action or note, release notes pick it up.',
      'Induction (new starters) is not the same as team training (new features). Separate workflows.',
      'Staging mirrors prod. Use it for edge cases before cutover.',
      '7-day review window per change before promotion',
      'Pull fee earners and partners into real-world UX checks.',
      'Lean over perfect is the operating rule.',
      'Honest framing for the room: we sold a dream, nothing worked for months. Finally it actually works and we can deliver.',
    ],
    lastReviewed: '2026-05-05',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'dev-only',
    order: 20,
    title: 'Dev surfaces (Luke sees more)',
    audience: ['dev'],
    group: 'meta',
    notes: [
      'System tab, Forge: dev-owner control room (LZ only)',
      'Operator Actions lens: read-only lookups (admin tier) plus matter-oneoff-replay (LZ, REPLAY MATTER confirm)',
      'Roadmap Whiteboard: weekly lanes. This, Next, Two weeks, Later, Parked, Done.',
      'Asana mirror: Tech & Automations plus selectable other org projects',
      'Access Controls: data-driven permissions. Grant or revoke per user at /api/access/grants.',
      'Stash briefs panel plus search plus audit log',
      'App Insights telemetry: per-component start, complete, fail events',
      'Activity tab: Failures lens with two channels, errors and the broken-URL pattern. Regressions visible the moment they land, no log digging.',
      'One canonical realtime arrival animation shared across Prospects, Matters and Billing. Same shimmer language everywhere.',
      'Demo mode shimmers in on Prospects and Matters. Demo IDs play the same arrival animation as live data.',
      'Demo notes editor (this overlay, Edit toggle): server-backed per-presenter overrides',
      'Reset Demo chip in CommandDeck wipes demo flags and reseeds rehearsal record',
    ],
    lastReviewed: '2026-05-05',
  },
];

export const DEMO_SECTION_BASIC_NOTES: Record<string, string[]> = {
  'main-use': [
    'Hub is the internal operations layer. The prompt may arrive by email or Teams, but the actual work queue lives here.',
    'Different people land here for different reasons. Fee earners to act, ops to coordinate, me to support and improve.',
    'The To Do strip is the bridge between notifications and real work.',
    'The notifications layer is improving, but it is still the weakest link.',
  ],
  'home-todo': [
    'Home is the live working queue. It shows what needs doing next and keeps the key context visible.',
    'To Do cards clear themselves when the underlying step is complete. There is no manual dismiss theatre.',
    'External Calls is now part of that working surface. It is sourced from Dubber and Luke, Alex, Jonathan, and Laura can switch from Mine to Everyone.',
    'Training, attendance, balances and conversion all sit alongside the queue so the page stays useful day to day.',
  ],
  'prospects-claim': [
    'Prospects run in three routes: Claimed, Unclaimed and Triaged.',
    'Claim & Respond pushes the prospect into the fee earner\'s working lane with the key context attached.',
    'Quality rating matters because it feeds later targeting and triage judgement.',
    'The same prospect can be viewed through Overview or Pitch Builder depending on the task.',
  ],
  'pitch-builder': [
    'Pitch Builder does two jobs: it builds the pitch email and it creates the instruct link.',
    'That instruct link is unique to the pitch and should not be copied forward from an old one.',
    'Send stays locked until required placeholders are satisfied, but Preview remains available.',
    'The Review & Send step is the final gate before the client-facing message goes out.',
  ],
  'post-instruct-overview': [
    'After instruction, this becomes the main overview surface for the matter journey.',
    'The step strip shows real progress across the flow, not hopeful progress.',
    'Timeline and correspondence sit here so the fee earner can see what has already happened.',
    'This is the landing point before moving into the deeper workbench steps.',
  ],
  'workbench-id': [
    'ID verification is prompted by the To Do card when that step is due.',
    'The ID pills open the EID detail directly. They do not expand inline.',
    'Where the original check supports it, rerun and manual follow-up options are available.',
    'Failed or uncertain checks move into manual review.',
  ],
  'workbench-risk': [
    'Risk assessment is the next controlled step after ID where required.',
    'The risk colour comes from RiskAssessmentResult. That is the product guardrail.',
    'Score, factors, assessor and timestamp are shown inline.',
    'Once risk is recorded, the flow advances and the next action surfaces.',
  ],
  'workbench-matter': [
    'Matter opening is the point where Hub coordinates creation across Clio, NetDocuments and Hub itself.',
    'The review tick is intentional. The create action should not fire until the fee earner confirms the setup.',
    'Opponents can be added later, so the first pass stays practical.',
    'If details are wrong after opening, the re-open path is still a manual ops fix.',
  ],
  'workbench-ccl-generate': [
    'This is the first AI pass for the client care letter workflow.',
    'Hub uses the matter data already in the system to draft the intake fields.',
    'High-confidence drafts can flow straight into the next check.',
    'The quality is improving, but this stage is still settling.',
  ],
  'workbench-ccl-pressure-test': [
    'This is the second AI pass. It checks the draft against the wider evidence, not just the core matter data.',
    'Low-scoring fields are flagged for attention. Passes stay quiet.',
    'The point is trust. It is a safety net, not a rewrite engine.',
    'Fee earner sign-off still waits until this stage has finished running.',
  ],
  'workbench-ccl-review': [
    'This is the fee earner review rail for the client care workflow.',
    'Flagged fields can be accepted, rejected or edited inline.',
    'Approval does not silently upload or send anything onward.',
    'Hub assists and highlights risk, but the fee earner remains the final decision maker.',
  ],
  'workbench-doc-transfer': [
    'Document transfer is not live yet.',
    'It sits after CCL on purpose because that timing gives NetDocuments the space to finish setting up the matter folders.',
    'When live, it will move prospect-uploaded documents into the matter workspace.',
    'For now, it should be described as upcoming, not working flow.',
  ],
  'matter-handoff': [
    'This is the handoff from preparation into the live matter space.',
    'Once the setup work is done, the workbench should go quiet and the matter surface takes over.',
    'The card becomes the route into the matter itself.',
    'The handoff works, but the cueing still wants tightening.',
  ],
  'matter-card': [
    'The matter card is the operating bridge into Clio and the wider matter record.',
    'It surfaces the key matter facts, progress strip and supporting tabs in one place.',
    'This is where running the file should feel joined-up, not fragmented.',
    'The Matters tab still wants more structure and resources.',
  ],
  'forms-feedback': [
    'Forms now feed into one Hub-side stream rather than splitting across older routes.',
    'Tech support is the main issue loop and it comes back to me directly.',
    'The useful check here is stream entry versus Asana task.',
    'The result is faster feedback and fewer silent failures.',
  ],
  'reports': [
    'Reports is the partner-facing section in this call set.',
    'The reporting charts have been simplified so the signal is clearer and the current period stands out properly.',
    'Recent items are actionable and can route back into Hub, not just sit as static reporting.',
    'Reports access is intentionally separate from general admin access.',
  ],
  'attendance-notes': [
    'Attendance notes are a newer workflow layered on top of the Home call surface.',
    'The filing workspace can target a matter or a prospect, depending on what the call relates to.',
    'Matter filing can push into NetDocuments and Clio time. Prospect filing stays lighter.',
    'This is useful, but it is still a newer workflow rather than the core fee earner path.',
  ],
  'ac-uploads': [
    'ActiveCampaign uploads belong to the prospect route only.',
    'They are not the same thing as document transfer into a live matter.',
    'That distinction is worth saying out loud so no one assumes both sides work the same way.',
  ],
  'rollout-framework': [
    'The rollout model separates announcements, questions, issues and follow-up.',
    'Questions go to ops chat. Issues go through Tech support so they are captured properly.',
    'Readiness labels matter because they set expectations honestly.',
    'The aim is a short review loop: feedback in, change shipped, release notes visible.',
  ],
  'dev-only': [
    'This is the extra surface area I see as the dev owner.',
    'It covers operational controls, telemetry, failure visibility and planning tools.',
    'It is useful context for me, but it is not the main call track for the wider team.',
  ],
};

const DEMO_REHEARSAL_PROSPECT_ID = '27367';

const DEMO_SECTION_APP_LINKS: Record<string, DemoAppLink[]> = {
  'main-use': [
    { label: 'Home', tab: 'home' },
    { label: 'Demo prospect', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Timeline' },
  ],
  'home-todo': [{ label: 'Home', tab: 'home' }],
  'prospects-claim': [
    { label: 'Demo prospect', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Timeline' },
    { label: 'Claimed empty preview', tab: 'enquiries', previewAction: 'claimedQueueHolding' },
  ],
  'pitch-builder': [{ label: 'Demo pitch', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Pitch' }],
  'post-instruct-overview': [{ label: 'Demo overview', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Timeline' }],
  'workbench-id': [{ label: 'Demo ID', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Timeline', workbenchTab: 'identity' }],
  'workbench-risk': [{ label: 'Demo risk', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Timeline', workbenchTab: 'risk' }],
  'workbench-matter': [
    { label: 'Demo matter', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Timeline', workbenchTab: 'matter' },
    { label: 'Matters', tab: 'matters' },
  ],
  'workbench-ccl-generate': [
    { label: 'Home', tab: 'home' },
    { label: 'Matters', tab: 'matters' },
  ],
  'workbench-ccl-pressure-test': [
    { label: 'Home', tab: 'home' },
    { label: 'Matters', tab: 'matters' },
  ],
  'workbench-ccl-review': [
    { label: 'Home', tab: 'home' },
    { label: 'Matters', tab: 'matters' },
  ],
  'workbench-doc-transfer': [{ label: 'Matters', tab: 'matters' }],
  'matter-handoff': [{ label: 'Matters', tab: 'matters' }],
  'matter-card': [{ label: 'Matters', tab: 'matters' }],
  'forms-feedback': [
    { label: 'Forms stream', tab: 'forms' },
    { label: 'Tech support form', tab: 'forms', formTitle: 'Report Technical Problem' },
  ],
  'reports': [
    { label: 'Reporting', tab: 'reporting' },
    { label: 'PPC report', tab: 'reporting', reportingView: 'ppcReport' },
  ],
  'attendance-notes': [{ label: 'Home', tab: 'home' }],
  'ac-uploads': [{ label: 'Demo docs', tab: 'enquiries', enquiryId: DEMO_REHEARSAL_PROSPECT_ID, enquirySubTab: 'Timeline', workbenchTab: 'documents' }],
  'rollout-framework': [
    { label: 'Forms', tab: 'forms' },
    { label: 'Reporting', tab: 'reporting' },
  ],
  'dev-only': [
    { label: 'Roadmap', tab: 'roadmap' },
    { label: 'Log monitor', tab: 'reporting', reportingView: 'logMonitor' },
    { label: 'Data Centre', tab: 'reporting', reportingView: 'dataCentre' },
  ],
};

export function getOrderedSections(): DemoSection[] {
  return [...DEMO_CHEAT_SHEET_SECTIONS].sort((a, b) => a.order - b.order);
}

function buildFallbackBasicNotes(notes: string[]): string[] {
  return notes
    .map((note) => String(note || '').trim())
    .filter((note) => note && note !== '---')
    .slice(0, 4);
}

export function getSectionNotes(section: DemoSection, depth: DemoNotesDepth): string[] {
  if (depth === 'detailed') return section.notes;
  const overrideNotes = Array.isArray(section.basicNotes)
    ? section.basicNotes.map((note) => String(note || '')).filter((note) => note.trim())
    : [];
  if (overrideNotes.length > 0) return overrideNotes;
  const seededNotes = DEMO_SECTION_BASIC_NOTES[section.id] || [];
  if (seededNotes.length > 0) return seededNotes;
  return buildFallbackBasicNotes(section.notes);
}

export function getSectionAppLinks(section: DemoSection): DemoAppLink[] {
  return DEMO_SECTION_APP_LINKS[section.id] || [];
}

export function hasStaleSections(sections: DemoSection[] = DEMO_CHEAT_SHEET_SECTIONS): boolean {
  const now = Date.now();
  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  return sections.some((s) => {
    const t = Date.parse(s.lastReviewed);
    return Number.isFinite(t) && now - t > FOURTEEN_DAYS;
  });
}
