import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { NormalizedMatter, TeamData, UserData } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useEffectivePermissions } from '../../app/effectivePermissions';
import { safeGetItem, safeSetItem } from '../../utils/storageUtils';
import FormEmbed from '../../components/FormEmbed';
import { laneOrder, processDefinitions, ProcessDefinition, ProcessLane, ProcessStreamItem, streamStatusMeta } from './processHubData';
import { buildStreamItem, isProcessStreamStatus, LEDGER_VISIBLE_STATUSES, PROCESS_STREAM_UPDATED_EVENT, readStoredStream, writeStoredStream } from './processStreamStore';
import AiComposerDrawer from './AiComposerDrawer';
import { getApiBase } from '../../utils/getApiUrl';
import '../home/home-tokens.css';
import './forms-tokens.css';

function getEntryDisplayId(item: ProcessStreamItem) {
  return item.id.replace(/^server-/, '').replace(/^manual-/, 'entry-');
}

type FormsHubProps = {
  initialFormTitle?: string | null;
  isOpen: boolean;
  matters: NormalizedMatter[];
  onDismiss: () => void;
  onInitialFormHandled?: () => void;
  focusSubmissionId?: string | null;
  onFocusSubmissionHandled?: () => void;
  teamData?: TeamData[] | null;
  userData: UserData[] | null;
};

type SectionSummary = {
  lane: ProcessLane;
  key: string;
  label: string;
  processes: ProcessDefinition[];
};

type ProcessHubHealthState = {
  alertSent: boolean;
  alertSuppressed: boolean;
  checkedAt: string | null;
  message: string;
  status: 'checking' | 'healthy' | 'unhealthy';
};

type FormRouteProbeStatus = 'checking' | 'healthy' | 'unhealthy' | 'unconfigured';

type FormRouteProbeState = {
  checkedAt: string | null;
  description?: string;
  error?: string;
  responseMs?: number;
  status: FormRouteProbeStatus;
};

type FormRouteProbeCheck = {
  description?: string;
  error?: string;
  id?: string;
  responseMs?: number;
  status?: string;
};

const FORM_RECENTS_KEY = 'forms-hub:recents';
const MAX_RECENTS = 8;
// Bumped from 12 → 24 (forms-stream-persistence Phase A1) so a denser rail
// actually doubles the visible-without-scroll count.
const MAX_STREAM_ITEMS = 24;
const PROCESS_HUB_HEALTH_POLL_MS = 60_000;
const excludedForms = new Set(['CollabSpace Requests']);
const PROCESS_HUB_API_BASE = '/api/process-hub';

function readStoredTitles(storageKey: string) {
  const raw = safeGetItem(storageKey);
  if (!raw) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [] as string[];
  }
}

function writeStoredTitles(storageKey: string, titles: string[]) {
  safeSetItem(storageKey, JSON.stringify(titles));
}

function formatTimestamp(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'Just now';
  }

  return parsed.toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function getProcessAccent(lane: ProcessLane) {
  switch (lane) {
    case 'Start':
      return 'var(--helix-highlight)';
    case 'Request':
      // Was the old dark-mode teal accent, which read as a conflicting highlight.
      // Green keeps Request distinct from
      // Start/Log/Find (all blue family) and Escalate (cta) while remaining
      // readable in both themes.
      return 'var(--helix-green)';
    case 'Log':
      return 'var(--helix-blue)';
    case 'Escalate':
      return 'var(--helix-cta)';
    case 'Find':
      return 'var(--helix-highlight)';
    default:
      return 'var(--helix-highlight)';
  }
}

function getFormRouteProbeTitle(form: ProcessDefinition, routeProbe?: FormRouteProbeState) {
  if (!form.healthCheckId) {
    return 'No processing route probe configured yet';
  }

  if (!routeProbe || routeProbe.status === 'checking') {
    return 'Probing processing route';
  }

  if (routeProbe.status === 'unconfigured') {
    return 'No processing route probe configured yet';
  }

  const parts = [
    routeProbe.status === 'healthy' ? 'Processing route ready' : 'Processing route needs attention',
    routeProbe.responseMs !== undefined ? `${routeProbe.responseMs}ms` : null,
    routeProbe.checkedAt ? `Checked ${formatTimestamp(routeProbe.checkedAt)}` : null,
    routeProbe.error || routeProbe.description || null,
  ];

  return parts.filter(Boolean).join(' - ');
}

export default function FormsHub({
  initialFormTitle = null,
  isOpen,
  matters,
  onDismiss,
  onInitialFormHandled,
  focusSubmissionId = null,
  onFocusSubmissionHandled,
  teamData,
  userData,
}: FormsHubProps) {
  const { isDarkMode } = useTheme();
  const [selectedForm, setSelectedForm] = useState<ProcessDefinition | null>(null);
  const [selectedFormPrefill, setSelectedFormPrefill] = useState<Record<string, unknown> | null>(null);
  const [composerActive, setComposerActive] = useState(false);
  const [composerQuery, setComposerQuery] = useState('');
  const [isStreamCollapsed, setIsStreamCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isAddEntryPickerOpen, setIsAddEntryPickerOpen] = useState(false);
  const [highlightedFormTitle, setHighlightedFormTitle] = useState<string | null>(null);
  const [editingStreamItemId, setEditingStreamItemId] = useState<string | null>(null);
  const [processHubHealth, setProcessHubHealth] = useState<ProcessHubHealthState>({
    alertSent: false,
    alertSuppressed: false,
    checkedAt: null,
    message: 'Pressure testing route',
    status: 'checking',
  });
  const [formRouteHealth, setFormRouteHealth] = useState<Record<string, FormRouteProbeState>>({});
  const [recentTitles, setRecentTitles] = useState<string[]>(() => readStoredTitles(FORM_RECENTS_KEY));
  const [streamItems, setStreamItems] = useState<ProcessStreamItem[]>(() => readStoredStream());
  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const currentUser = useMemo(() => {
    if (!userData || userData.length === 0) {
      return undefined;
    }

    return userData[0];
  }, [userData]);

  // Submission stream: diagnostic surface for "what happened to this form?".
  // Opened up to operations (LZ, AC, KW, EA) so they can assist users when a
  // submission failed and the form itself can't be recovered. Admin-only
  // mutators (status changes, form swap) remain gated separately via
  // `canManageStreamEntries`. Routed through `useEffectivePermissions` so the
  // dev-owner "View as" override can flip flags without changing tier helpers.
  const effective = useEffectivePermissions(currentUser);
  const formsStreamInitials = (currentUser?.Initials || '').toString().toUpperCase().trim();
  const isFormsStreamOpsUser = ['LZ', 'AC', 'KW', 'EA'].includes(formsStreamInitials);
  const showDevStreamPanel = effective.isLzOrAc || isFormsStreamOpsUser;
  const canManageStreamEntries = effective.isAdminUser;

  const processes = useMemo(() => {
    const adminOnlyForms = new Set(['Verification Check']);
    return processDefinitions.filter((process) => {
      if (excludedForms.has(process.title)) return false;
      if (adminOnlyForms.has(process.title) && !effective.isAdminUser) return false;
      return true;
    });
  }, [effective.isAdminUser]);

  const formLookup = useMemo(() => {
    return processes.reduce<Record<string, ProcessDefinition>>((accumulator, form) => {
      accumulator[form.title] = form;
      return accumulator;
    }, {});
  }, [processes]);

  const formRouteProbeIds = useMemo(() => {
    return Array.from(new Set(processes.map((process) => process.healthCheckId).filter((id): id is string => Boolean(id))));
  }, [processes]);

  const filteredProcesses = useMemo(() => {
    if (!deferredQuery) {
      return processes;
    }

    return processes.filter((process) => {
      const haystack = [
        process.title,
        process.description,
        process.requires,
        process.sectionLabel,
        process.lane,
        ...process.context,
        ...process.keywords,
        ...(process.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(deferredQuery);
    });
  }, [deferredQuery, processes]);

  const filteredSections = useMemo<SectionSummary[]>(() => {
    return laneOrder
      .map((lane) => ({
        key: lane,
        label: lane,
        lane,
        processes: filteredProcesses.filter((process) => process.lane === lane),
      }))
      .filter((section) => section.processes.length > 0);
  }, [filteredProcesses]);

  const recentForms = useMemo(() => {
    return recentTitles.map((title) => formLookup[title]).filter(Boolean);
  }, [formLookup, recentTitles]);

  const searchSuggestions = useMemo(() => {
    if (deferredQuery) {
      return filteredProcesses.slice(0, 8);
    }

    const seen = new Set<string>();
    return [...recentForms, ...processes].filter((form) => {
      if (!form || seen.has(form.title)) {
        return false;
      }

      seen.add(form.title);
      return true;
    }).slice(0, 8);
  }, [deferredQuery, filteredProcesses, processes, recentForms]);

  const addEntrySuggestions = useMemo(() => {
    const seen = new Set<string>();
    const source = deferredQuery ? filteredProcesses : [...recentForms, ...processes];

    return source.filter((form) => {
      if (!form || seen.has(form.title)) {
        return false;
      }

      seen.add(form.title);
      return true;
    }).slice(0, 8);
  }, [deferredQuery, filteredProcesses, processes, recentForms]);

  const visibleStreamItems = useMemo(() => {
    return streamItems.filter((item) => LEDGER_VISIBLE_STATUSES.includes(item.status));
  }, [streamItems]);

  // Forms-stream landing deep-link: when a form just submitted lands the user
  // here with a focusSubmissionId, scroll the matching row into view and flash
  // a brief highlight so they can see the deposit was recorded. Uses a
  // requestAnimationFrame to wait for the rail to render after the SSE / store
  // event surfaces the new entry.
  const streamListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusSubmissionId || !isOpen) return;
    let cancelled = false;
    let attempts = 0;
    const tryFocus = () => {
      if (cancelled) return;
      attempts += 1;
      const root = streamListRef.current;
      const target = root?.querySelector<HTMLElement>(
        `[data-submission-id="${CSS.escape(focusSubmissionId)}"]`,
      );
      if (target) {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch { /* non-critical */ }
        target.classList.add('forms-hub__stream-item--focus-flash');
        window.setTimeout(() => {
          target.classList.remove('forms-hub__stream-item--focus-flash');
        }, 2200);
        onFocusSubmissionHandled?.();
      } else if (attempts < 12) {
        window.setTimeout(tryFocus, 250);
      } else {
        // Give up quietly — the row may not have surfaced yet (server lag) or
        // the user has filtered it out. Clear the pending focus regardless.
        onFocusSubmissionHandled?.();
      }
    };
    const handle = window.requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(handle);
    };
  }, [focusSubmissionId, isOpen, visibleStreamItems, onFocusSubmissionHandled]);

  useEffect(() => {
    writeStoredTitles(FORM_RECENTS_KEY, recentTitles);
  }, [recentTitles]);

  useEffect(() => {
    writeStoredStream(streamItems);
  }, [streamItems]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleExternalStreamUpdate = () => {
      setStreamItems(readStoredStream());
    };

    window.addEventListener(PROCESS_STREAM_UPDATED_EVENT, handleExternalStreamUpdate);
    return () => {
      window.removeEventListener(PROCESS_STREAM_UPDATED_EVENT, handleExternalStreamUpdate);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function loadServerStream() {
      try {
        const initialsForScope = (currentUser?.Initials || '').toString().trim();
        const qs = initialsForScope ? `?limit=8&initials=${encodeURIComponent(initialsForScope)}` : '?limit=8';
        const response = await fetch(`${PROCESS_HUB_API_BASE}/submissions${qs}`);
        if (!response.ok) {
          return;
        }

        const data = (await response.json().catch(() => ({ items: [] }))) as {
          items?: Array<{
            id?: string;
            currentStatus?: string;
            lane?: string;
            lastEvent?: string;
            processTitle?: string;
            startedAt?: string;
            summary?: string;
            submissionId?: string;
            formKey?: string;
            payloadAvailable?: boolean;
            retriggerCount?: number;
            submittedBy?: string | null;
          }>;
        };

        const incomingItems = Array.isArray(data.items) ? data.items.flatMap((item) => {
          if (!item.processTitle || !item.startedAt || !item.summary || !item.currentStatus || !item.lane || !isProcessStreamStatus(item.currentStatus)) {
            return [] as ProcessStreamItem[];
          }

          return [{
            id: item.id || `server-${item.processTitle}-${item.startedAt}`,
            lane: item.lane as ProcessLane,
            lastEvent: item.lastEvent || 'Synced from process hub',
            processTitle: item.processTitle,
            startedAt: item.startedAt,
            status: item.currentStatus,
            summary: item.summary,
            submissionId: item.submissionId,
            formKey: item.formKey,
            payloadAvailable: item.payloadAvailable,
            retriggerCount: item.retriggerCount,
            submittedBy: item.submittedBy ?? null,
          }];
        }) : [];

        if (!cancelled && incomingItems.length > 0) {
          setStreamItems((current) => {
            // Prefer server entries by submissionId, then fall back to processTitle dedupe for legacy locals.
            const incomingIds = new Set(incomingItems.map((entry) => entry.submissionId).filter(Boolean) as string[]);
            const localOnly = current.filter((item) => {
              if (item.submissionId && incomingIds.has(item.submissionId)) return false;
              return !incomingItems.some((incoming) => !incoming.submissionId && incoming.processTitle === item.processTitle);
            });
            return [...incomingItems, ...localOnly].slice(0, MAX_STREAM_ITEMS);
          });
        }
      } catch {
        // Keep the launcher usable even when the process-hub adapter is unavailable.
      }
    }

    void loadServerStream();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedForm(null);
      setSearchQuery('');
      setIsAddEntryPickerOpen(false);
      setHighlightedFormTitle(null);
      setEditingStreamItemId(null);
    }
  }, [isOpen]);

  const handleSelectForm = useCallback((form: ProcessDefinition, prefill?: Record<string, unknown> | null) => {
    setSelectedForm(form);
    setSelectedFormPrefill(prefill ?? null);
    setRecentTitles((current) => [form.title, ...current.filter((title) => title !== form.title)].slice(0, MAX_RECENTS));
  }, []);

  // AI Forms Composer (dev preview — LZ/AC only). Triggered by typing a
  // long-form intent (≥12 chars) and pressing ⌘/Ctrl-K, or clicking the
  // ✨ Compose chip that appears in the search dropdown for long queries.
  const composerEnabled = effective.isLzOrAc;
  const composerEligible = composerEnabled && searchQuery.trim().length >= 12;

  const openComposer = useCallback(() => {
    const trimmed = searchQuery.trim();
    if (!composerEnabled || trimmed.length < 12) return;
    setComposerQuery(trimmed);
    setComposerActive(true);
    setIsSearchFocused(false);
  }, [composerEnabled, searchQuery]);

  const handleComposerReviewAndSend = useCallback(
    (form: ProcessDefinition, prefill: Record<string, unknown>, proposalId: string | null) => {
      handleSelectForm(form, prefill);
      setComposerActive(false);
      if (proposalId) {
        try {
          void fetch(`${getApiBase()}/api/forms-ai/plan/${proposalId}/accepted`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'review-and-send' }),
          });
        } catch {
          /* best-effort */
        }
      }
    },
    [handleSelectForm],
  );

  useEffect(() => {
    if (!composerEnabled) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        const trimmed = searchQuery.trim();
        if (trimmed.length >= 12 && document.activeElement?.id === 'forms-hub-search') {
          event.preventDefault();
          setComposerQuery(trimmed);
          setComposerActive(true);
          setIsSearchFocused(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [composerEnabled, searchQuery]);

  const handleAddEntryFromForm = useCallback((form: ProcessDefinition) => {
    const nextItem = buildStreamItem({
      lane: form.lane,
      lastEvent: 'Added from ledger',
      processTitle: form.title,
      status: 'queued',
      summary: form.requires || form.description || 'Manual ledger entry',
    });

    setStreamItems((current) => [nextItem, ...current].slice(0, MAX_STREAM_ITEMS));
    setIsAddEntryPickerOpen(false);
    setHighlightedFormTitle(null);
    handleSelectForm(form);
  }, [handleSelectForm]);

  const handleUpdateEntryForm = useCallback((itemId: string, form: ProcessDefinition) => {
    setStreamItems((current) => current.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      return {
        ...item,
        lane: form.lane,
        lastEvent: 'Edited from ledger',
        processTitle: form.title,
        summary: form.requires || form.description || item.summary,
      };
    }));
    setEditingStreamItemId(null);
    setHighlightedFormTitle(null);
    handleSelectForm(form);
  }, [handleSelectForm]);

  const handleUpdateEntryStatus = useCallback((itemId: string, status: ProcessStreamItem['status']) => {
    setStreamItems((current) => current.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      return {
        ...item,
        lastEvent: 'Edited from ledger',
        status,
      };
    }));
  }, []);

  // ── Submission detail (B6) ───────────────────────────────────────────
  // Lazy-loads the full payload + step timeline for a server-backed entry
  // when its editor is opened. Keyed by submissionId so multiple opens are
  // cached for the lifetime of the panel.
  type SubmissionStep = {
    name?: string;
    status?: string;
    at?: string;
    error?: string;
    output?: Record<string, unknown> | null;
  };
  type SubmissionDetail = {
    id: string;
    formKey: string;
    status: string;
    payload: unknown;
    steps: SubmissionStep[];
    retriggerCount: number;
    lastRetriggeredAt: string | null;
    lastRetriggeredBy: string | null;
  };
  type DetailEntry = {
    loading: boolean;
    error: string | null;
    detail: SubmissionDetail | null;
    retriggering: boolean;
    retriggerError: string | null;
  };
  const [submissionDetails, setSubmissionDetails] = useState<Record<string, DetailEntry>>({});

  const loadSubmissionDetail = useCallback(async (submissionId: string) => {
    setSubmissionDetails((current) => ({
      ...current,
      [submissionId]: {
        ...(current[submissionId] || { detail: null, retriggering: false, retriggerError: null }),
        loading: true,
        error: null,
      } as DetailEntry,
    }));
    try {
      const initialsForScope = (currentUser?.Initials || '').toString().trim();
      const qs = initialsForScope ? `?initials=${encodeURIComponent(initialsForScope)}` : '';
      const response = await fetch(`${PROCESS_HUB_API_BASE}/submissions/${encodeURIComponent(submissionId)}${qs}`);
      const body = (await response.json().catch(() => ({}))) as { submission?: SubmissionDetail; error?: string };
      if (!response.ok || !body.submission) {
        throw new Error(body.error || `Failed to load submission (${response.status})`);
      }
      setSubmissionDetails((current) => ({
        ...current,
        [submissionId]: {
          loading: false,
          error: null,
          detail: body.submission || null,
          retriggering: current[submissionId]?.retriggering || false,
          retriggerError: current[submissionId]?.retriggerError || null,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load submission';
      setSubmissionDetails((current) => ({
        ...current,
        [submissionId]: {
          loading: false,
          error: message,
          detail: current[submissionId]?.detail || null,
          retriggering: false,
          retriggerError: current[submissionId]?.retriggerError || null,
        },
      }));
    }
  }, [currentUser]);

  const handleRetrigger = useCallback(async (submissionId: string) => {
    setSubmissionDetails((current) => ({
      ...current,
      [submissionId]: {
        ...(current[submissionId] || { loading: false, error: null, detail: null }),
        retriggering: true,
        retriggerError: null,
      } as DetailEntry,
    }));
    try {
      const initialsForScope = (currentUser?.Initials || '').toString().trim();
      const response = await fetch(`${PROCESS_HUB_API_BASE}/submissions/${encodeURIComponent(submissionId)}/retrigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(initialsForScope ? { 'x-user-initials': initialsForScope } : {}),
        },
        body: JSON.stringify({ initials: initialsForScope }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; formKey?: string; status?: string };
      if (!response.ok) {
        const reason = response.status === 501
          ? `Retrigger not supported for ${body.formKey || 'this form'} yet`
          : (body.error || `Retrigger failed (${response.status})`);
        throw new Error(reason);
      }
      setSubmissionDetails((current) => ({
        ...current,
        [submissionId]: {
          ...(current[submissionId] || { loading: false, error: null, detail: null }),
          retriggering: false,
          retriggerError: null,
        } as DetailEntry,
      }));
      // Refresh detail so steps/status reflect the fire-and-forget run.
      void loadSubmissionDetail(submissionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Retrigger failed';
      setSubmissionDetails((current) => ({
        ...current,
        [submissionId]: {
          ...(current[submissionId] || { loading: false, error: null, detail: null }),
          retriggering: false,
          retriggerError: message,
        } as DetailEntry,
      }));
    }
  }, [currentUser, loadSubmissionDetail]);

  // Auto-load detail when an editor opens for a server-backed entry.
  useEffect(() => {
    if (!editingStreamItemId) return;
    const item = streamItems.find((entry) => entry.id === editingStreamItemId);
    if (!item || !item.submissionId) return;
    const existing = submissionDetails[item.submissionId];
    if (existing && (existing.loading || existing.detail)) return;
    void loadSubmissionDetail(item.submissionId);
  }, [editingStreamItemId, streamItems, submissionDetails, loadSubmissionDetail]);

  useEffect(() => {
    if (!isOpen || !initialFormTitle) {
      return;
    }

    const matchedForm = formLookup[initialFormTitle];
    if (matchedForm) {
      handleSelectForm(matchedForm);
    }

    onInitialFormHandled?.();
  }, [formLookup, handleSelectForm, initialFormTitle, isOpen, onInitialFormHandled]);

  const runProcessHubHealthCheck = useCallback(async () => {
    try {
      const response = await fetch(`${PROCESS_HUB_API_BASE}/health`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as {
        checkedAt?: string;
        error?: string;
        notification?: {
          sent?: boolean;
          suppressed?: boolean;
        };
        status?: 'healthy' | 'unhealthy';
      };

      if (response.ok && payload.status === 'healthy') {
        setProcessHubHealth({
          alertSent: false,
          alertSuppressed: false,
          checkedAt: payload.checkedAt || new Date().toISOString(),
          message: 'Route ready',
          status: 'healthy',
        });
        return;
      }

      setProcessHubHealth({
        alertSent: Boolean(payload.notification?.sent),
        alertSuppressed: Boolean(payload.notification?.suppressed),
        checkedAt: payload.checkedAt || new Date().toISOString(),
        message: payload.error || 'Route not ready',
        status: 'unhealthy',
      });
    } catch (error) {
      setProcessHubHealth({
        alertSent: false,
        alertSuppressed: false,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Route health check failed',
        status: 'unhealthy',
      });
    }
  }, []);

  const handleSearchSelect = useCallback((form: ProcessDefinition) => {
    handleSelectForm(form);
    setIsSearchFocused(false);
  }, [handleSelectForm]);

  useEffect(() => {
    if (!isOpen) {
      setFormRouteHealth({});
      return;
    }

    if (formRouteProbeIds.length === 0) {
      return;
    }

    let cancelled = false;

    setFormRouteHealth((current) => {
      const next = { ...current };
      formRouteProbeIds.forEach((id) => {
        next[id] = {
          checkedAt: null,
          status: 'checking',
        };
      });
      return next;
    });

    async function loadFormRouteHealth() {
      try {
        const response = await fetch(`${getApiBase()}/api/form-health`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const payload = await response.json().catch(() => ({})) as {
          checks?: FormRouteProbeCheck[];
          timestamp?: string;
        };

        if (!response.ok) {
          throw new Error(`Form route probe failed (${response.status})`);
        }

        const checkedAt = payload.timestamp || new Date().toISOString();
        const probeIds = new Set(formRouteProbeIds);
        const next: Record<string, FormRouteProbeState> = {};

        formRouteProbeIds.forEach((id) => {
          next[id] = {
            checkedAt,
            error: 'No result returned for this route',
            status: 'unhealthy',
          };
        });

        (payload.checks || []).forEach((check) => {
          if (!check.id || !probeIds.has(check.id)) {
            return;
          }

          next[check.id] = {
            checkedAt,
            description: check.description,
            error: check.error,
            responseMs: typeof check.responseMs === 'number' ? check.responseMs : undefined,
            status: check.status === 'healthy' ? 'healthy' : 'unhealthy',
          };
        });

        if (!cancelled) {
          setFormRouteHealth(next);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Form route probe failed';
        const checkedAt = new Date().toISOString();
        setFormRouteHealth(formRouteProbeIds.reduce<Record<string, FormRouteProbeState>>((next, id) => {
          next[id] = {
            checkedAt,
            error: message,
            status: 'unhealthy',
          };
          return next;
        }, {}));
      }
    }

    void loadFormRouteHealth();

    return () => {
      cancelled = true;
    };
  }, [formRouteProbeIds, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setProcessHubHealth({
        alertSent: false,
        alertSuppressed: false,
        checkedAt: null,
        message: 'Pressure testing route',
        status: 'checking',
      });
      return;
    }

    let cancelled = false;

    async function pollHealth() {
      if (cancelled) {
        return;
      }

      await runProcessHubHealthCheck();
    }

    void pollHealth();
    const intervalId = window.setInterval(() => {
      void pollHealth();
    }, PROCESS_HUB_HEALTH_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isOpen, runProcessHubHealthCheck]);

  if (selectedForm) {
    const SelectedComponent = selectedForm.component;

    return (
      <div className="forms-hub" data-theme-mode={isDarkMode ? 'dark' : 'light'}>
        <div className="forms-hub__detail-header">
          <div className="forms-hub__detail-title-row">
            <button className="forms-hub__back" onClick={() => setSelectedForm(null)} type="button">
              <Icon iconName="ChevronLeft" />
              Back
            </button>
            <span className="forms-hub__detail-separator" aria-hidden="true">|</span>
            <div className="forms-hub__detail-title">{selectedForm.title}</div>
          </div>
          <button className="forms-hub__dismiss forms-hub__dismiss--detail" onClick={onDismiss} type="button" aria-label="Close forms">
            <Icon iconName="Cancel" />
          </button>
        </div>
        <div className="forms-hub__detail-body">
          <div className="forms-hub__detail-frame">
            {SelectedComponent ? (
              <SelectedComponent
                userData={userData || undefined}
                currentUser={currentUser}
                matters={matters}
                onBack={() => { setSelectedForm(null); setSelectedFormPrefill(null); }}
                prefill={selectedFormPrefill || undefined}
              />
            ) : (
              <FormEmbed link={selectedForm} userData={userData} teamData={teamData} matters={matters} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forms-hub forms-hub--launcher" data-theme-mode={isDarkMode ? 'dark' : 'light'}>
      <div className="forms-hub__main-shell">
        <div className="forms-hub__utilitybar">
          <div className="forms-hub__search-shell">
            <span className="forms-hub__search-leading-icon" aria-hidden="true">
              <Icon iconName="Search" />
            </span>
            <input
              className="forms-hub__search helix-input"
              aria-label="Search forms and workflows"
              id="forms-hub-search"
              onBlur={() => {
                window.setTimeout(() => setIsSearchFocused(false), 120);
              }}
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Search a workflow, matter task, finance request, or action"
              type="search"
              value={searchQuery}
            />
            <button
              className="forms-hub__route-health forms-hub__route-health--minimal forms-hub__route-health--search"
              onClick={() => {
                void runProcessHubHealthCheck();
              }}
              title={[
                processHubHealth.message,
                processHubHealth.checkedAt ? `Checked ${formatTimestamp(processHubHealth.checkedAt)}` : null,
                processHubHealth.alertSent ? 'Luke alerted in Teams' : null,
                processHubHealth.alertSuppressed ? 'Alert suppressed to avoid noise' : null,
              ].filter(Boolean).join(' • ')}
              type="button"
            >
              <span className={`forms-hub__route-health-dot forms-hub__route-health-dot--${processHubHealth.status}`} />
            </button>
            {isSearchFocused && (
              <div className="forms-hub__search-dropdown">
                {composerEligible && (
                  <button
                    className="forms-hub__search-option"
                    key="ai-composer-trigger"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      openComposer();
                    }}
                    type="button"
                    style={{ borderBottom: '1px dashed var(--border-base, rgba(75,85,99,0.38))' }}
                  >
                    <span className="forms-hub__search-option-icon" style={{ color: isDarkMode ? '#3690CE' : '#3690CE' }}>
                      <Icon iconName="Lightbulb" />
                    </span>
                    <span className="forms-hub__search-option-text">
                      <span className="forms-hub__search-option-title">Compose with Helix</span>
                      <span className="forms-hub__search-option-meta">Pre-fill a form from your description (⌘K)</span>
                    </span>
                  </button>
                )}
                {searchSuggestions.length > 0 ? searchSuggestions.map((form) => (
                  <button
                    className="forms-hub__search-option"
                    key={`search-${form.title}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSearchSelect(form);
                    }}
                    type="button"
                  >
                    <span className="forms-hub__search-option-icon" style={{ color: getProcessAccent(form.lane) }}>
                      <Icon iconName={form.icon || 'Document'} />
                    </span>
                    <span className="forms-hub__search-option-text">
                      <span className="forms-hub__search-option-title">{form.title}</span>
                      <span className="forms-hub__search-option-meta">{form.lane}</span>
                    </span>
                  </button>
                )) : (
                  !composerEligible && (
                    <div className="forms-hub__search-empty">No actions match “{searchQuery}”.</div>
                  )
                )}
              </div>
            )}
            {composerActive && composerEnabled && (
              <AiComposerDrawer
                query={composerQuery}
                currentUser={currentUser}
                isDarkMode={isDarkMode}
                formLookup={formLookup}
                onClose={() => setComposerActive(false)}
                onReviewAndSend={handleComposerReviewAndSend}
              />
            )}
          </div>
        </div>
        <div className="forms-hub__body">
          <div className="forms-hub__main-column">
            <section className="forms-hub__launcher-panel helix-panel">
              <div className="forms-hub__section-title">
                <span className="forms-hub__accent" style={{ background: 'var(--helix-highlight)' }} />
                <span>Forms</span>
                <span className="forms-hub__section-count">{filteredProcesses.length}</span>
              </div>
              <div className="forms-hub__content">
                {filteredSections.length > 0 ? filteredSections.map((section) => (
                  <section className="forms-hub__section" key={section.key}>
                    <div className="forms-hub__section-header">
                      <div className="forms-hub__section-title">
                        <span className="forms-hub__accent" style={{ background: getProcessAccent(section.lane) }} />
                        <span>{section.label}</span>
                        <span className="forms-hub__section-count">{section.processes.length}</span>
                      </div>
                    </div>
                    <div className="forms-hub__bookmark-list">
                      {section.processes.map((process) => {
                        const routeProbe = process.healthCheckId ? formRouteHealth[process.healthCheckId] : undefined;
                        const routeProbeStatus: FormRouteProbeStatus = process.healthCheckId
                          ? routeProbe?.status || 'checking'
                          : 'unconfigured';

                        return (
                          <button
                            className={`forms-hub__bookmark-item${highlightedFormTitle === process.title ? ' forms-hub__bookmark-item--preview' : ''}`}
                            key={process.title}
                            onClick={() => handleSelectForm(process)}
                            onMouseEnter={() => setHighlightedFormTitle(process.title)}
                            onMouseLeave={() => setHighlightedFormTitle((current) => (current === process.title ? null : current))}
                            type="button"
                          >
                            <span className="forms-hub__bookmark-item-icon" style={{ color: getProcessAccent(process.lane) }}>
                              <Icon iconName={process.icon || 'Document'} />
                            </span>
                            <span className="forms-hub__bookmark-item-text">
                              <span className="forms-hub__bookmark-item-title">{process.title}</span>
                            </span>
                            <span className="forms-hub__bookmark-item-actions">
                              {process.embedScript && (
                                <span className="forms-hub__bookmark-item-cognito" title="Cognito form">
                                  <Icon iconName="Settings" />
                                </span>
                              )}
                              <span
                                aria-hidden="true"
                                className={`forms-hub__route-health-dot forms-hub__bookmark-route-dot forms-hub__route-health-dot--${routeProbeStatus}`}
                                title={getFormRouteProbeTitle(process, routeProbe)}
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )) : (
                  <div className="forms-hub__empty">No processes matched “{searchQuery}”. Try a workflow, matter need, or action verb.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      {showDevStreamPanel && (
        <aside className={`forms-hub__stream forms-hub__bookmarks${isStreamCollapsed ? ' forms-hub__bookmarks--collapsed forms-hub__stream--collapsed' : ''}`}>
          <div className="forms-hub__bookmarks-header">
            <button
              aria-expanded={!isStreamCollapsed}
              aria-label={isStreamCollapsed ? 'Expand submission stream side pane' : 'Collapse submission stream side pane'}
              className="forms-hub__bookmark-toggle"
              onClick={() => setIsStreamCollapsed((current) => !current)}
              type="button"
            >
              <Icon iconName={isStreamCollapsed ? 'ChevronLeftSmall' : 'ChevronRightSmall'} />
            </button>
            <div className={`forms-hub__stream-header-copy${isStreamCollapsed ? ' forms-hub__stream-header-copy--hidden' : ''}`}>
              <div className="forms-hub__section-title">
                <span className="forms-hub__accent" style={{ background: 'var(--helix-highlight)' }} />
                <span>Form entries</span>
                <span className="forms-hub__section-count">{visibleStreamItems.length}</span>
                <span
                  aria-label="Submission stream — visible to operations"
                  className="forms-hub__dev-preview-badge"
                  title="Submission stream: visible to LZ, AC, KW, EA. Click a row to inspect what happened."
                >
                  Ops view
                </span>
              </div>
            </div>
          </div>
          <div
            aria-hidden={isStreamCollapsed}
            className={`forms-hub__stream-list${isStreamCollapsed ? ' forms-hub__stream-list--collapsed' : ''}`}
            ref={streamListRef}
          >
            {visibleStreamItems.length > 0 ? visibleStreamItems.map((item) => {
              const statusMeta = streamStatusMeta[item.status];
              const isEditing = editingStreamItemId === item.id;
              const target = formLookup[item.processTitle];
              const toggleExpand = () => {
                if (isEditing) {
                  setEditingStreamItemId(null);
                } else {
                  setEditingStreamItemId(item.id);
                  setIsAddEntryPickerOpen(false);
                }
              };

              return (
                <div
                  aria-expanded={isEditing}
                  className={`forms-hub__stream-item${isEditing ? ' forms-hub__stream-item--editing' : ''}`}
                  data-submission-id={item.submissionId || undefined}
                  key={item.id}
                  onClick={toggleExpand}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleExpand();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span
                    aria-hidden="true"
                    className={`forms-hub__stream-item-dot forms-hub__stream-item-dot--${statusMeta.tone}`}
                  />
                  <div className="forms-hub__stream-item-main">
                    <span className="forms-hub__stream-item-title">{item.processTitle}</span>
                    <span className="forms-hub__stream-item-meta-line">
                      {formatTimestamp(item.startedAt)}
                      <span className="forms-hub__stream-item-meta-sep" aria-hidden="true">·</span>
                      <span className="forms-hub__stream-item-meta-id">{getEntryDisplayId(item)}</span>
                    </span>
                  </div>
                  <div className="forms-hub__stream-item-status">
                    <span className={`forms-hub__status-pill forms-hub__status-pill--${statusMeta.tone}`}>
                      {statusMeta.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="forms-hub__stream-edit"
                      style={{ pointerEvents: 'none' }}
                    >
                      <Icon iconName={isEditing ? 'ChevronUpSmall' : 'ChevronDownSmall'} />
                    </span>
                  </div>
                </div>
              );
            }) : <div className="forms-hub__empty">No active ledger entries yet.</div>}
            {canManageStreamEntries && (
              <div className="forms-hub__stream-add-wrap">
                <button
                  aria-expanded={isAddEntryPickerOpen}
                  className="forms-hub__stream-add-card"
                  onClick={() => setIsAddEntryPickerOpen((current) => !current)}
                  type="button"
                >
                  <span className="forms-hub__stream-add-plus">+</span>
                  <span className="forms-hub__stream-add-copy">
                    <span className="forms-hub__stream-add-title">Add entry</span>
                    <span className="forms-hub__stream-add-meta">Pick a form and open it straight away</span>
                  </span>
                </button>
                {isAddEntryPickerOpen && (
                  <div className="forms-hub__stream-add-picker">
                    {addEntrySuggestions.map((form) => (
                      <button
                        className="forms-hub__stream-add-option"
                        key={`add-entry-${form.title}`}
                        onClick={() => handleAddEntryFromForm(form)}
                        onMouseEnter={() => setHighlightedFormTitle(form.title)}
                        onMouseLeave={() => setHighlightedFormTitle((current) => (current === form.title ? null : current))}
                        type="button"
                      >
                        <span className="forms-hub__stream-add-option-icon" style={{ color: getProcessAccent(form.lane) }}>
                          <Icon iconName={form.icon || 'Document'} />
                        </span>
                        <span className="forms-hub__stream-add-option-copy">
                          <span className="forms-hub__stream-add-option-title">{form.title}</span>
                          <span className="forms-hub__stream-add-option-meta">{form.lane}</span>
                        </span>
                      </button>
                    ))}
                    {addEntrySuggestions.length === 0 && (
                      <div className="forms-hub__stream-add-empty">No forms match the current filter.</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
      {showDevStreamPanel && editingStreamItemId && (() => {
        const item = streamItems.find((entry) => entry.id === editingStreamItemId);
        if (!item) return null;
        const statusMeta = streamStatusMeta[item.status];
        const target = formLookup[item.processTitle];
        const detailEntry = item.submissionId ? submissionDetails[item.submissionId] : undefined;
        const detail = detailEntry?.detail || null;
        const steps = detail?.steps || [];
        const lastFailedStep = [...steps].reverse().find((s) => s.status === 'failed');
        const formKeyForCopy = item.formKey || detail?.formKey || 'unknown';
        const retriggerCount = detail?.retriggerCount ?? item.retriggerCount ?? 0;
        const isFailure = item.status === 'failed' || !!lastFailedStep;
        const closeModal = () => setEditingStreamItemId(null);
        return (
          <div
            aria-hidden={false}
            onClick={closeModal}
            onKeyDown={(event) => { if (event.key === 'Escape') closeModal(); }}
            role="presentation"
            style={{
              alignItems: 'center',
              background: 'rgba(0, 3, 25, 0.6)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              inset: 0,
              justifyContent: 'center',
              padding: 24,
              position: 'fixed',
              zIndex: 9000,
            }}
          >
            <div
              aria-labelledby="forms-hub-inspector-title"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              style={{
                background: 'var(--surface-card, #081c30)',
                border: '1px solid var(--border-strong, rgba(75, 85, 99, 0.55))',
                borderRadius: 0,
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
                color: 'var(--text-body, #d1d5db)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'min(720px, 90vh)',
                maxWidth: 'min(640px, 92vw)',
                width: '100%',
              }}
            >
              <header
                style={{
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-base, rgba(75, 85, 99, 0.38))',
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span id="forms-hub-inspector-title" style={{ color: 'var(--text-label, #f3f4f6)', fontSize: 14, fontWeight: 600 }}>
                    {item.processTitle}
                  </span>
                  <span style={{ color: 'var(--text-help, #A0A0A0)', fontSize: 11 }}>
                    {getEntryDisplayId(item)} · {formatTimestamp(item.startedAt)}
                  </span>
                </div>
                <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
                  <span className={`forms-hub__status-pill forms-hub__status-pill--${statusMeta.tone}`}>{statusMeta.label}</span>
                  <button
                    aria-label="Close submission details"
                    className="forms-hub__chip"
                    onClick={closeModal}
                    style={{ minWidth: 32 }}
                    type="button"
                  >
                    <Icon iconName="Cancel" />
                  </button>
                </div>
              </header>
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                {isFailure && (
                  <div
                    role="status"
                    style={{
                      background: 'rgba(214, 85, 65, 0.12)',
                      border: '1px solid rgba(214, 85, 65, 0.45)',
                      borderRadius: 0,
                      color: 'var(--text-body, #d1d5db)',
                      display: 'flex',
                      flexDirection: 'column',
                      fontSize: 12,
                      gap: 4,
                      lineHeight: 1.45,
                      margin: '0 0 14px',
                      padding: '10px 12px',
                    }}
                  >
                    <strong style={{ color: 'var(--helix-cta, #D65541)' }}>
                      {item.status === 'failed' ? 'Submission failed' : 'Step failure recorded'}
                    </strong>
                    {lastFailedStep ? (
                      <span>
                        <strong style={{ color: 'var(--text-label, #f3f4f6)' }}>{lastFailedStep.name || 'step'}</strong>
                        {lastFailedStep.error ? `: ${lastFailedStep.error}` : ''}
                        {lastFailedStep.at ? (
                          <span style={{ color: 'var(--text-help, #A0A0A0)', marginLeft: 8 }}>
                            {formatTimestamp(lastFailedStep.at)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span>No step-level error captured. Check payload below or retrigger to retry the pipeline.</span>
                    )}
                  </div>
                )}
                {item.submissionId ? (
                  <>
                    <div style={{ color: 'var(--text-help, #A0A0A0)', fontSize: 11, marginBottom: 6 }}>
                      form_key: <code style={{ color: 'var(--text-body, #d1d5db)' }}>{formKeyForCopy}</code>
                      {retriggerCount > 0 ? `  ·  retriggered ${retriggerCount}\u00d7` : ''}
                    </div>
                    {detailEntry?.loading && (
                      <div style={{ color: 'var(--text-help, #A0A0A0)', fontSize: 11, marginBottom: 6 }}>Loading payload\u2026</div>
                    )}
                    {detailEntry?.error && (
                      <div style={{ color: 'var(--helix-cta)', fontSize: 11, marginBottom: 6 }}>{detailEntry.error}</div>
                    )}
                    {detail && (
                      <>
                        <div style={{ color: 'var(--text-label, #f3f4f6)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', margin: '8px 0 4px', textTransform: 'uppercase' }}>Payload</div>
                        <pre
                          style={{
                            background: 'var(--surface-section, rgba(0,0,0,0.18))',
                            border: '1px solid var(--border-base, rgba(75,85,99,0.38))',
                            color: 'var(--text-body, #d1d5db)',
                            fontSize: 11,
                            lineHeight: 1.45,
                            margin: '0 0 14px',
                            maxHeight: 220,
                            overflow: 'auto',
                            padding: '10px 12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
{JSON.stringify(detail.payload, null, 2)}
                        </pre>
                        <div style={{ color: 'var(--text-label, #f3f4f6)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 6px', textTransform: 'uppercase' }}>Steps</div>
                        {steps.length > 0 ? (
                          <ol style={{ listStyle: 'none', margin: '0 0 14px', padding: 0 }}>
                            {steps.map((step, idx) => {
                              const tone = step.status === 'success' ? 'success' : step.status === 'failed' ? 'danger' : 'active';
                              return (
                                <li
                                  key={`${item.submissionId}-step-${idx}`}
                                  style={{ alignItems: 'flex-start', display: 'flex', fontSize: 12, gap: 8, padding: '3px 0' }}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`forms-hub__stream-item-dot forms-hub__stream-item-dot--${tone}`}
                                    style={{ marginTop: 4 }}
                                  />
                                  <span style={{ color: 'var(--text-body, #d1d5db)', flex: 1 }}>
                                    <strong style={{ color: 'var(--text-label, #f3f4f6)' }}>{step.name || 'step'}</strong>
                                    {step.error ? `: ${step.error}` : ''}
                                    {step.at ? (
                                      <span style={{ color: 'var(--text-help, #A0A0A0)', marginLeft: 8 }}>{formatTimestamp(step.at)}</span>
                                    ) : null}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <div style={{ color: 'var(--text-help, #A0A0A0)', fontSize: 11, marginBottom: 14 }}>No steps recorded yet.</div>
                        )}
                      </>
                    )}
                    {detailEntry?.retriggerError && (
                      <div style={{ color: 'var(--helix-cta)', fontSize: 11, marginBottom: 8 }}>{detailEntry.retriggerError}</div>
                    )}
                  </>
                ) : (
                  <div style={{ color: 'var(--text-help, #A0A0A0)', fontSize: 12, padding: '6px 0' }}>
                    Local-only entry. No server payload recorded for this row.
                  </div>
                )}
                {canManageStreamEntries && (
                  <div style={{ borderTop: '1px solid var(--border-base, rgba(75, 85, 99, 0.38))', marginTop: 8, paddingTop: 12 }}>
                    <div style={{ color: 'var(--text-label, #f3f4f6)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 6px', textTransform: 'uppercase' }}>Set status</div>
                    <div className="forms-hub__stream-edit-statuses">
                      {LEDGER_VISIBLE_STATUSES.map((status) => (
                        <button
                          className={`forms-hub__stream-edit-status${item.status === status ? ' forms-hub__stream-edit-status--selected' : ''}`}
                          key={`status-${item.id}-${status}`}
                          onClick={() => handleUpdateEntryStatus(item.id, status)}
                          type="button"
                        >
                          <span className={`forms-hub__status-pill forms-hub__status-pill--${streamStatusMeta[status].tone}`}>
                            {streamStatusMeta[status].label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <footer
                style={{
                  alignItems: 'center',
                  borderTop: '1px solid var(--border-base, rgba(75, 85, 99, 0.38))',
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  padding: '12px 18px',
                }}
              >
                {item.submissionId && (
                  <button
                    className="forms-hub__chip forms-hub__detail-action"
                    disabled={detailEntry?.retriggering || detailEntry?.loading}
                    onClick={() => handleRetrigger(item.submissionId as string)}
                    type="button"
                  >
                    <span>{detailEntry?.retriggering ? 'Retriggering\u2026' : 'Retrigger pipeline'}</span>
                  </button>
                )}
                {target && (
                  <button
                    className="forms-hub__chip forms-hub__detail-action forms-hub__detail-action--primary"
                    onClick={() => { handleSelectForm(target); closeModal(); }}
                    type="button"
                  >
                    <span>Open form</span>
                  </button>
                )}
                <button
                  className="forms-hub__chip forms-hub__detail-action"
                  onClick={closeModal}
                  type="button"
                >
                  <span>Close</span>
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}