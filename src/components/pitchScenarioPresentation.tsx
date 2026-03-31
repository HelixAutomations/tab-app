import React from 'react';
import { colours } from '../app/styles/colours';
import { SCENARIOS } from '../tabs/enquiries/pitch-builder/scenarios';
import type { CompactOptionStripItem } from './CompactOptionStrip';

export function scenarioTone(scenarioId: string): string {
  switch (scenarioId) {
    case 'before-call-call':
      return colours.highlight;
    case 'before-call-no-call':
      return colours.orange;
    case 'after-call-probably-cant-assist':
      return colours.cta;
    case 'after-call-want-instruction':
      return colours.green;
    case 'cfa':
      return colours.accent;
    case 'link-only':
      return colours.highlight;
    default:
      return colours.greyText;
  }
}

function shortScenarioLabel(scenarioId: string): string {
  switch (scenarioId) {
    case 'before-call-call':
      return 'Call';
    case 'before-call-no-call':
      return 'No call';
    case 'after-call-probably-cant-assist':
      return 'Can\'t assist';
    case 'after-call-want-instruction':
      return 'Instruction';
    case 'cfa':
      return 'CFA';
    case 'link-only':
      return 'Link';
    default:
      return 'Scenario';
  }
}

export function scenarioIcon(scenarioId: string) {
  const stroke = scenarioTone(scenarioId);

  switch (scenarioId) {
    case 'link-only':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case 'before-call-call':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case 'before-call-no-call':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" aria-hidden="true">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'after-call-probably-cant-assist':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      );
    case 'after-call-want-instruction':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" aria-hidden="true">
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 'cfa':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <polyline points="2,17 12,22 22,17" />
          <polyline points="2,12 12,17 22,12" />
        </svg>
      );
    default:
      return null;
  }
}

export function buildPitchScenarioStripItems(): CompactOptionStripItem<string>[] {
  return SCENARIOS.map((scenario) => ({
    key: scenario.id,
    label: shortScenarioLabel(scenario.id),
    title: scenario.name,
    tone: scenarioTone(scenario.id),
    icon: scenarioIcon(scenario.id),
  }));
}