/**
 * Shared Overview surface primitives.
 *
 * Used by Prospect Overview and Matter Overview. See
 * docs/notes/UNIFIED_OVERVIEW_SURFACE_FOR_PROSPECTS_AND_MATTERS.md
 * for the full design rationale and migration plan.
 */
export { OverviewShell } from './OverviewShell';
export type { OverviewShellProps } from './OverviewShell';

export { OverviewHero, OverviewHeroBadge, OverviewHeroSeparator } from './OverviewHero';
export type { OverviewHeroProps, OverviewHeroBadgeProps } from './OverviewHero';

export { ContactModule } from './ContactModule';
export type { ContactModuleProps, ContactRow, ContactRowKind } from './ContactModule';

export { LifecycleRail } from './LifecycleRail';
export type { LifecycleRailProps } from './LifecycleRail';

export { SystemPanel } from './SystemPanel';
export type { SystemPanelProps } from './SystemPanel';

export { IdentifiersDisclosure } from './IdentifiersDisclosure';
export type { IdentifiersDisclosureProps, IdentifierRow } from './IdentifiersDisclosure';

export { NextStepRail } from './NextStepRail';
export type { NextStepRailProps, NextStepChip, NextStepTone } from './NextStepRail';
