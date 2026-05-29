// src/app/capabilities.ts
//
// Capability registry — the vocabulary of every gate point in the codebase.
// Adding a NEW gate point requires adding a row here AND wiring the gate.
// Granting/revoking access to an EXISTING capability does NOT require a code
// change — that's pure data via the Access panel (Phase Access.3).
//
// Defaults declared here are the *bootstrap fallback* used when:
//   1) The migration has not run yet (AccessGrants table missing), or
//   2) SQL is unreachable on boot / cache miss
//
// Once the migration runs, the AccessGrants table is the source of truth.
// Defaults are seeded into the table by scripts/init-access-grants-tables.mjs
// so live state can be inspected in one place.

export type CapabilityKind = 'tier' | 'feature' | 'action';

export interface CapabilityDef {
  key: string;
  kind: CapabilityKind;
  label: string;
  description: string;
  /** Subjects allowed by default. Used as bootstrap fallback ONLY. */
  defaultAllow: readonly string[];
}

export const CAPABILITIES = {
  // ── Tier capabilities ──────────────────────────────────────────────────
  'tier:dev': {
    key: 'tier:dev',
    kind: 'tier',
    label: 'Dev tier',
    description: 'God mode. Firm-wide data scope, all dev preview features.',
    defaultAllow: ['user:LZ'],
  },
  'tier:admin': {
    key: 'tier:admin',
    kind: 'tier',
    label: 'Admin tier',
    description: 'Trusted internal feature tier. Personal data scope.',
    defaultAllow: ['user:LZ', 'user:AC', 'user:KW', 'user:JW', 'user:LA', 'user:EA'],
  },

  // ── Feature capabilities ───────────────────────────────────────────────
  'feature:reports': {
    key: 'feature:reports',
    kind: 'feature',
    label: 'Reports tab',
    description: 'Access to the Reports tab. LA is admin but excluded.',
    defaultAllow: ['user:LZ', 'user:AC', 'user:KW', 'user:JW', 'user:EA'],
  },
  'feature:firm-wide-home': {
    key: 'feature:firm-wide-home',
    kind: 'feature',
    label: 'Firm-wide Home data',
    description: 'Home data-scope exception — see firm-wide datasets on Home.',
    defaultAllow: ['user:LZ', 'user:KW', 'user:EA'],
  },
  'feature:hub-controls': {
    key: 'feature:hub-controls',
    kind: 'feature',
    label: 'Private hub controls',
    description: 'DebugLatencyOverlay, CCL diff drawer, cache monitor, dev preview locks.',
    defaultAllow: ['user:LZ'],
  },
  'feature:activity-tab': {
    key: 'feature:activity-tab',
    kind: 'feature',
    label: 'Activity (System) tab',
    description: 'Operations dashboard, ops pulse, Operator Actions surface.',
    defaultAllow: ['user:LZ', 'user:EA'],
  },
  'feature:ccl': {
    key: 'feature:ccl',
    kind: 'feature',
    label: 'CCL editing',
    description: 'CCL matter to-do items / lifecycle steps. Open to all.',
    defaultAllow: ['group:*'],
  },

  // ── Action capabilities (Operator Actions surface) ─────────────────────
  'action:matter-oneoff-replay': {
    key: 'action:matter-oneoff-replay',
    kind: 'action',
    label: 'Matter one-off replay (write)',
    description: 'Replays the matter-opening pipeline against prod for one InstructionRef.',
    defaultAllow: ['user:LZ'],
  },
} as const satisfies Record<string, CapabilityDef>;

export type CapabilityKey = keyof typeof CAPABILITIES;

export function isKnownCapability(key: string): key is CapabilityKey {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, key);
}

export function listCapabilities(): CapabilityDef[] {
  return Object.values(CAPABILITIES);
}
