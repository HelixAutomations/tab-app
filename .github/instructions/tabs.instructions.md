---
applyTo: "src/tabs/**"
---

# Tab Rules (auto-attached)

## Structure
- Each tab lives in `src/tabs/<name>/` with an index component and supporting files.
- Tabs over **3,000 lines** must be decomposed. Use `parts/` or co-located sub-components.
- Keep data-fetching hooks separate from rendering where possible.

## UX bar
- Every interaction must feel snappy and intentional. Stale counts, layout jank, and flickering are bugs.
- Use structural loading (skeletons matching settled layout) — never spinners that shift content.
- Long-running operations must surface progress to the user (SSE events → status strip).

## Data scope
- Use `isDevOwner()` for data-scope decisions (fetch all vs fetch mine). Never `isAdminUser()`.
- Use `isAdminUser()` for feature gating (show/hide UI). Never for data scope.
- Dev preview features: gate behind `isLzOrAc` inline check until ready for wider rollout.

## Dark mode
- Body text: use `#d1d5db` (warm grey), never `colours.dark.subText` (#3690CE) which is blue-on-blue.
- Surface depth: follow the dark-mode ladder in `colours.ts` (`dark.background` → `dark.sectionBackground` → `dark.cardBackground` → `dark.cardHover`).

## Reporting reference
- For reporting visuals, treat `src/tabs/Reporting/ReportingHome.tsx` and `src/tabs/Reporting/ManagementDashboard.tsx` as the composition references.
- `src/tabs/Reporting/DataCentre.tsx` still contains legacy styling and must not be used as the visual source of truth for new reporting UI.
- For new reporting panels, use Helix tokens from `colours.ts`, zero-radius composition, and Home/ManagementDashboard surface layering. Do not introduce ad-hoc raw hex/RGB values except the documented neutral body text pair (`#d1d5db` dark, `#374151` light).

## Home boot map (`src/tabs/home/Home.tsx`)
- `Home.tsx` is currently a large orchestration surface. Before editing, identify whether your change belongs to boot gating, the parallel REST fetch, SSE hydration, or post-boot panel rendering.
- Readiness gates:
	- `hasStartedParallelFetch` starts the boot sequence and is the source of `homePrimaryReady`.
	- `homePrimaryReady = hasStartedParallelFetch`.
	- `secondaryPanelsReady` mirrors `homePrimaryReady` via an effect; it is mostly legacy UI wiring, not a real data gate.
	- `immediateActionsReady = hasStartedParallelFetch && !isActionsLoading && !isLoadingAttendance && !isLoadingAnnualLeave`.
	- `homeDataReady` is the coordinated reveal gate. It flips once when `hasStartedParallelFetch && !isLoadingAttendance && !isLoadingWipClio`, then never resets during the session to avoid flicker.
- Coordinated reveal contract:
	- The three main Home sections use `home-cascade-pending` until `homeDataReady` flips, then switch to `home-cascade-1/2/3` together.
	- Wrapper classes live on the dashboard shell, ops queue shell, and team shell. This is the main fix for the old “popcorn” render where sections appeared one by one.
- Parallel boot REST fetches:
	- `/api/attendance/getAttendance`
	- `/api/attendance/getAnnualLeave`
	- `/api/home-wip` or `/api/home-wip/team` for dev-owner aggregate mode
	- `/api/home-enquiries`
	- These are the minimum-path boot fetches. If you add another blocking fetch here, you are changing Home first-paint behaviour.
- Home SSE hydration:
	- `useHomeMetricsStream()` starts when `!demoModeEnabled && homePrimaryReady`.
	- It now requests only `futureBookings` and `outstandingBalances`.
	- Do not re-add `transactions` to the default Home stream unless the UI actually renders raw transactions again.
- Boot observability:
	- The dev boot monitor emits `homeBootEvent` transitions for `attendance`, `annualLeave`, `wipClio`, `enquiryMetrics`, `recoveredFees`, `allMatters`, `pendingDocActions`, `parallelFetch`, `homePrimaryReady`, `secondaryPanelsReady`, `immediateActionsReady`, and `homeDataReady`.
	- If you introduce a new blocking gate or materially change first-paint, update the boot monitor too.
