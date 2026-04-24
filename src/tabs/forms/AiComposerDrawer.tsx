// src/tabs/forms/AiComposerDrawer.tsx
//
// AI Forms Composer drawer — opens inline beneath the Forms search bar
// when the user types a long-form intent (≥12 chars or ⌘K). Hits
// /api/forms-ai/plan, renders the proposed form + fields with confidence
// pips, and either drops the user into the chosen form pre-filled
// ("Review & send") or marks the proposal discarded.
//
// Pilot scope (v0):
//   - Tech Problem only
//   - Review & send only (no direct "Send now" path)
//   - Dev-preview gated upstream in FormsHub via effective.isLzOrAc

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import type { UserData } from '../../app/functionality/types';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import { trackClientEvent } from '../../utils/telemetry';
import {
  ComposerField,
  ComposerFields,
  getAdapter,
  listSupportedFormKeys,
} from './composerAdapters';
import type { ProcessDefinition } from './processHubData';

export interface ComposerPlan {
  formKey: string;
  summary: string;
  rationale: string;
  fields: ComposerFields;
  alternatives: string[];
}

interface PlanResponse {
  ok: boolean;
  supported?: boolean;
  proposalId?: string | null;
  plan?: ComposerPlan;
  error?: string;
  detail?: string;
}

export interface AiComposerDrawerProps {
  query: string;
  currentUser?: UserData;
  isDarkMode: boolean;
  formLookup: Record<string, ProcessDefinition>;
  onClose: () => void;
  onReviewAndSend: (
    form: ProcessDefinition,
    prefill: Record<string, unknown>,
    proposalId: string | null,
  ) => void;
}

type DrawerState =
  | { phase: 'loading' }
  | { phase: 'unsupported'; proposalId: string | null; rationale: string }
  | { phase: 'error'; error: string }
  | { phase: 'ready'; proposalId: string | null; plan: ComposerPlan; form: ProcessDefinition; prefill: Record<string, unknown> };

const FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  steps_to_reproduce: 'Steps to reproduce',
  expected_behavior: 'Expected behaviour',
  urgency: 'Urgency',
};

function confidencePip(c: ComposerField['confidence']) {
  const map: Record<ComposerField['confidence'], { label: string; bg: string; border: string; fg: string }> = {
    high: { label: 'high', bg: 'rgba(32, 178, 108, 0.18)', border: 'rgba(32, 178, 108, 0.55)', fg: '#20b26c' },
    med: { label: 'med', bg: 'rgba(255, 140, 0, 0.18)', border: 'rgba(255, 140, 0, 0.55)', fg: '#FF8C00' },
    low: { label: 'low', bg: 'rgba(160, 160, 160, 0.18)', border: 'rgba(160, 160, 160, 0.55)', fg: '#A0A0A0' },
  };
  const meta = map[c] || map.low;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        color: meta.fg,
        borderRadius: 0,
      }}
    >
      {meta.label}
    </span>
  );
}

function sourceLabel(s: ComposerField['source']): string {
  switch (s) {
    case 'prompt':
      return 'from your prompt';
    case 'profile':
      return 'from your profile';
    case 'default':
      return 'default';
    default:
      return 'inferred';
  }
}

const AiComposerDrawer: React.FC<AiComposerDrawerProps> = ({
  query,
  currentUser,
  isDarkMode,
  formLookup,
  onClose,
  onReviewAndSend,
}) => {
  const [state, setState] = useState<DrawerState>({ phase: 'loading' });
  const requestIdRef = useRef(0);

  const userPayload = useMemo(() => {
    const u = currentUser as (UserData & { FullName?: string; Role?: string }) | undefined;
    return {
      initials: u?.Initials || '',
      name: u?.FullName || u?.Initials || '',
      role: u?.Role || '',
    };
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    const trimmed = query.trim();
    if (!trimmed) {
      setState({ phase: 'error', error: 'Type something to compose.' });
      return () => {
        cancelled = true;
      };
    }

    setState({ phase: 'loading' });
    trackClientEvent('FormsAi', 'PlanRequested', { queryLength: trimmed.length });

    (async () => {
      try {
        const response = await fetch(`${getProxyBaseUrl()}/api/forms-ai/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, currentUser: userPayload }),
        });
        const body = (await response.json()) as PlanResponse;
        if (cancelled || requestIdRef.current !== requestId) return;

        if (!response.ok || !body.ok || !body.plan) {
          trackClientEvent('FormsAi', 'PlanFailed', {
            status: response.status,
            error: body.error || 'unknown',
            proposalId: body.proposalId,
          });
          setState({ phase: 'error', error: body.detail || body.error || 'Plan failed.' });
          return;
        }

        const plan = body.plan;
        if (!body.supported || plan.formKey === 'unsupported') {
          trackClientEvent('FormsAi', 'PlanUnsupported', { proposalId: body.proposalId });
          setState({
            phase: 'unsupported',
            proposalId: body.proposalId ?? null,
            rationale: plan.rationale || 'No matching form in the pilot scope yet.',
          });
          return;
        }

        const adapter = getAdapter(plan.formKey);
        if (!adapter) {
          trackClientEvent('FormsAi', 'PlanAdapterMissing', { formKey: plan.formKey });
          setState({
            phase: 'unsupported',
            proposalId: body.proposalId ?? null,
            rationale: `No UI adapter for ${plan.formKey} yet.`,
          });
          return;
        }
        const form = formLookup[adapter.formTitle];
        if (!form) {
          setState({
            phase: 'unsupported',
            proposalId: body.proposalId ?? null,
            rationale: `Form "${adapter.formTitle}" is not in the current catalogue.`,
          });
          return;
        }

        const prefill = adapter.mapToPrefill(plan.fields, currentUser);
        trackClientEvent('FormsAi', 'PlanReady', {
          proposalId: body.proposalId,
          formKey: plan.formKey,
        });
        setState({ phase: 'ready', proposalId: body.proposalId ?? null, plan, form, prefill });
      } catch (err) {
        if (cancelled) return;
        trackClientEvent('FormsAi', 'PlanFailed', { error: (err as Error).message });
        setState({ phase: 'error', error: (err as Error).message || 'Plan failed.' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, userPayload, currentUser, formLookup]);

  const handleDiscard = useCallback(async () => {
    const proposalId = state.phase === 'ready' || state.phase === 'unsupported' ? state.proposalId : null;
    trackClientEvent('FormsAi', 'Discarded', { proposalId });
    if (proposalId) {
      try {
        await fetch(`${getProxyBaseUrl()}/api/forms-ai/plan/${proposalId}/discarded`, { method: 'POST' });
      } catch {
        /* best-effort */
      }
    }
    onClose();
  }, [state, onClose]);

  const handleReview = useCallback(() => {
    if (state.phase !== 'ready') return;
    trackClientEvent('FormsAi', 'ReviewAndSend', {
      proposalId: state.proposalId,
      formKey: state.plan.formKey,
    });
    onReviewAndSend(state.form, state.prefill, state.proposalId);
  }, [state, onReviewAndSend]);

  const surface: React.CSSProperties = {
    background: 'var(--surface-section, #051525)',
    border: '1px solid var(--border-base, rgba(75,85,99,0.38))',
    padding: '14px 16px',
    marginTop: 8,
    color: isDarkMode ? '#d1d5db' : '#374151',
    fontSize: 13,
    lineHeight: 1.45,
    borderRadius: 0,
  };
  const headerRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  };
  const titleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: isDarkMode ? '#87F3F3' : '#3690CE',
  };
  const closeBtn: React.CSSProperties = {
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    color: isDarkMode ? '#A0A0A0' : '#6B6B6B',
    cursor: 'pointer',
    padding: 4,
    fontSize: 12,
  };

  return (
    <div className="forms-hub__ai-drawer helix-panel" role="region" aria-label="AI Forms Composer" style={surface}>
      <div style={headerRow}>
        <Icon iconName="Lightbulb" style={{ fontSize: 14, color: isDarkMode ? '#87F3F3' : '#3690CE' }} />
        <span style={titleStyle}>Helix is composing</span>
        <button onClick={handleDiscard} type="button" style={closeBtn} aria-label="Close composer">
          <Icon iconName="Cancel" />
        </button>
      </div>

      {state.phase === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonRow width="65%" />
          <SkeletonRow width="92%" />
          <SkeletonRow width="80%" />
          <div style={{ fontSize: 12, color: isDarkMode ? '#A0A0A0' : '#6B6B6B', marginTop: 6 }}>
            Reading your request…
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div>
          <div style={{ marginBottom: 10 }}>{state.error}</div>
          <button type="button" onClick={onClose} className="helix-btn-primary" style={{ borderRadius: 0 }}>
            Close
          </button>
        </div>
      )}

      {state.phase === 'unsupported' && (
        <div>
          <div style={{ marginBottom: 6, fontSize: 13 }}>
            No matching form in the pilot scope yet ({listSupportedFormKeys().join(', ')}).
          </div>
          <div style={{ fontSize: 12, color: isDarkMode ? '#A0A0A0' : '#6B6B6B', marginBottom: 12 }}>
            {state.rationale}
          </div>
          <button type="button" onClick={handleDiscard} className="helix-btn-primary" style={{ borderRadius: 0 }}>
            OK
          </button>
        </div>
      )}

      {state.phase === 'ready' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: isDarkMode ? '#f3f4f6' : '#061733' }}>
              {state.form.title}
            </span>
            {state.plan.alternatives.length > 0 && (
              <span style={{ fontSize: 11, color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
                also: {state.plan.alternatives.join(', ')}
              </span>
            )}
          </div>
          {state.plan.summary && (
            <div style={{ fontSize: 13, marginBottom: 12 }}>{state.plan.summary}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {Object.entries(state.plan.fields).map(([key, field]) => {
              const label = FIELD_LABEL[key] || key;
              const valueText =
                field.value === null || field.value === undefined || String(field.value).trim() === ''
                  ? '— needs you'
                  : String(field.value);
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: isDarkMode ? '#f3f4f6' : '#061733',
                      }}
                    >
                      {label}
                    </span>
                    {confidencePip(field.confidence)}
                    <span style={{ fontSize: 11, color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
                      {sourceLabel(field.source)}
                    </span>
                  </div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 13,
                      color:
                        field.value === null || field.value === undefined
                          ? isDarkMode
                            ? '#A0A0A0'
                            : '#6B6B6B'
                          : isDarkMode
                          ? '#d1d5db'
                          : '#374151',
                    }}
                  >
                    {valueText}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleReview}
              className="helix-btn-primary"
              style={{ borderRadius: 0 }}
            >
              Review &amp; send
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="helix-btn-danger"
              style={{ borderRadius: 0 }}
            >
              Discard
            </button>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: isDarkMode ? '#A0A0A0' : '#6B6B6B',
              }}
            >
              You always confirm before anything sends.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const SkeletonRow: React.FC<{ width: string }> = ({ width }) => (
  <div
    style={{
      width,
      height: 12,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 0,
    }}
  />
);

export default AiComposerDrawer;
