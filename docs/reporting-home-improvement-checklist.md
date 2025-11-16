# Reporting Home Improvement Checklist

Tracking progress on the reporting workspace revamp. Tick items as enhancements land.

## Checklist

- [x] **Reframe the hero into a two-column summary**  
  Restructure the hero area so the left column focuses on title, description, and primary CTA, while the right column shows refresh stats and status tiles. Move restricted-access details into a subtle badge and relocate the developer-only test toggle to a secondary menu.
- [ ] **Clarify live metrics with trends and deltas**  
  Convert metric cards into sparkline + delta widgets, add traffic-light cues, and replace the inline range buttons with a reusable segmented control.
- [ ] **Separate report launcher from data feed health**  
  Introduce a report grid with per-report CTAs, dependency badges, and disabled-state messaging. Move dataset health into its own section beneath.
- [ ] **Redesign the data-feed inspector for faster triage**  
  Replace the dense list with a searchable table that highlights status, row counts, last refresh, runtime, and cache state, plus filters for errors.
- [ ] **Improve navigation within detailed reports**  
  Embed reports inside a shell with persistent left navigation, breadcrumbs, and consistent top bars (title, last refreshed, back button).
- [ ] **Centralize styling primitives**  
  Extract repeated inline styles into shared components (e.g., `StatusPill`, `MetricCard`, `DatasetRow`) and shared style tokens to simplify future tweaks.
- [ ] **Enhance responsiveness and accessibility**  
  Ensure grids collapse gracefully on small screens, add keyboard-visible focus states, and announce refresh completion via `aria-live`.
- [ ] **Provide onboarding guidance for first-time viewers**  
  Show a short checklist banner when data has never been fetched, with a CTA that runs the first refresh and launches the dashboard.
- [ ] **Add performance optimizations**  
  Lazy-load heavy report bundles with `React.lazy`, memoize dataset selectors, and keep the UI responsive while streams update.

## Notes

- Update this checklist as work progresses; when an item is complete, change its box to `[x]` and optionally add links to PRs or screenshots.
- If new improvements are identified, append them to the list with unchecked boxes.
