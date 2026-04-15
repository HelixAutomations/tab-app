import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { NormalizedMatter, TeamData, UserData } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { isAdminUser } from '../../app/admin';
import { safeGetItem, safeSetItem } from '../../utils/storageUtils';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import FormEmbed from '../../components/FormEmbed';
import { laneOrder, processDefinitions, ProcessDefinition, ProcessLane, ProcessStreamItem, streamStatusMeta } from './processHubData';
import { buildStreamItem, isProcessStreamStatus, LEDGER_VISIBLE_STATUSES, PROCESS_STREAM_UPDATED_EVENT, readStoredStream, writeStoredStream } from './processStreamStore';
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

const FORM_RECENTS_KEY = 'forms-hub:recents';
const MAX_RECENTS = 8;
const MAX_STREAM_ITEMS = 12;
const PROCESS_HUB_HEALTH_POLL_MS = 60_000;
const excludedForms = new Set(['CollabSpace Requests']);

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
      return 'var(--helix-accent)';
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

export default function FormsHub({
  initialFormTitle = null,
  isOpen,
  matters,
  onDismiss,
  onInitialFormHandled,
  teamData,
  userData,
}: FormsHubProps) {
  const { isDarkMode } = useTheme();
  const [selectedForm, setSelectedForm] = useState<ProcessDefinition | null>(null);
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
  const [recentTitles, setRecentTitles] = useState<string[]>(() => readStoredTitles(FORM_RECENTS_KEY));
  const [streamItems, setStreamItems] = useState<ProcessStreamItem[]>(() => readStoredStream());
  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const currentUser = useMemo(() => {
    if (!userData || userData.length === 0) {
      return undefined;
    }

    return userData[0];
  }, [userData]);

  const showDevStreamPanel = isAdminUser(currentUser);
  const canManageStreamEntries = isAdminUser(currentUser);

  const processes = useMemo(() => {
    return processDefinitions.filter((process) => !excludedForms.has(process.title));
  }, []);

  const formLookup = useMemo(() => {
    return processes.reduce<Record<string, ProcessDefinition>>((accumulator, form) => {
      accumulator[form.title] = form;
      return accumulator;
    }, {});
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

  const editingStreamItem = useMemo(() => {
    if (!editingStreamItemId) {
      return null;
    }

    return streamItems.find((item) => item.id === editingStreamItemId) || null;
  }, [editingStreamItemId, streamItems]);

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
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/api/process-hub/submissions?limit=8`);
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
          }];
        }) : [];

        if (!cancelled && incomingItems.length > 0) {
          setStreamItems((current) => {
            const localOnly = current.filter((item) => !incomingItems.some((incoming) => incoming.processTitle === item.processTitle));
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

  const handleSelectForm = useCallback((form: ProcessDefinition) => {
    setSelectedForm(form);
    setRecentTitles((current) => [form.title, ...current.filter((title) => title !== form.title)].slice(0, MAX_RECENTS));
  }, []);

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
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/process-hub/health`, {
        credentials: 'include',
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
                onBack={() => setSelectedForm(null)}
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
                      <span className="forms-hub__search-option-meta">{form.lane}{form.rolloutState !== 'live' ? ' • Old' : ''}</span>
                    </span>
                  </button>
                )) : (
                  <div className="forms-hub__search-empty">No actions match “{searchQuery}”.</div>
                )}
              </div>
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
                      {section.processes.map((process) => (
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
                            <span className="forms-hub__bookmark-item-meta">{process.lane}{process.rolloutState !== 'live' ? ' • Old' : ''}</span>
                          </span>
                          {process.embedScript && (
                            <span className="forms-hub__bookmark-item-cognito" title="Cognito form">
                              <Icon iconName="Settings" />
                            </span>
                          )}
                        </button>
                      ))}
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
              </div>
            </div>
          </div>
          <div
            aria-hidden={isStreamCollapsed}
            className={`forms-hub__stream-list${isStreamCollapsed ? ' forms-hub__stream-list--collapsed' : ''}`}
          >
            {visibleStreamItems.length > 0 ? visibleStreamItems.map((item) => {
              const statusMeta = streamStatusMeta[item.status];

              return (
                <button
                  className="forms-hub__stream-item"
                  key={item.id}
                  onClick={() => {
                    const target = formLookup[item.processTitle];
                    if (target) {
                      handleSelectForm(target);
                    }
                  }}
                  type="button"
                >
                  <div className="forms-hub__stream-item-main">
                    <span className="forms-hub__stream-item-title">{item.processTitle}</span>
                    <span className="forms-hub__stream-item-meta-line">{formatTimestamp(item.startedAt)}</span>
                    <span className="forms-hub__stream-item-meta-line forms-hub__stream-item-meta-line--id">{getEntryDisplayId(item)}</span>
                  </div>
                  <div className="forms-hub__stream-item-status">
                    <span className={`forms-hub__status-pill forms-hub__status-pill--${statusMeta.tone}`}>
                      {statusMeta.label}
                    </span>
                    {canManageStreamEntries && (
                      <button
                        className="forms-hub__stream-edit"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingStreamItemId(item.id);
                          setIsAddEntryPickerOpen(false);
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </button>
              );
            }) : <div className="forms-hub__empty">No active ledger entries yet.</div>}
            {canManageStreamEntries && editingStreamItem && (
              <div className="forms-hub__stream-edit-panel">
                <div className="forms-hub__stream-edit-header">
                  <span className="forms-hub__stream-edit-title">Edit entry</span>
                  <span className="forms-hub__stream-edit-id">{getEntryDisplayId(editingStreamItem)}</span>
                </div>
                <div className="forms-hub__stream-edit-picker">
                  {addEntrySuggestions.map((form) => (
                    <button
                      className={`forms-hub__stream-add-option${editingStreamItem.processTitle === form.title ? ' forms-hub__stream-add-option--selected' : ''}`}
                      key={`edit-${editingStreamItem.id}-${form.title}`}
                      onClick={() => handleUpdateEntryForm(editingStreamItem.id, form)}
                      onMouseEnter={() => setHighlightedFormTitle(form.title)}
                      onMouseLeave={() => setHighlightedFormTitle((current) => (current === form.title ? null : current))}
                      type="button"
                    >
                      <span className="forms-hub__stream-add-option-icon" style={{ color: getProcessAccent(form.lane) }}>
                        <Icon iconName={form.icon || 'Document'} />
                      </span>
                      <span className="forms-hub__stream-add-option-copy">
                        <span className="forms-hub__stream-add-option-title">{form.title}</span>
                        <span className="forms-hub__stream-add-option-meta">{form.lane}{form.rolloutState !== 'live' ? ' • Old' : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="forms-hub__stream-edit-statuses">
                  {LEDGER_VISIBLE_STATUSES.map((status) => (
                    <button
                      className={`forms-hub__stream-edit-status${editingStreamItem.status === status ? ' forms-hub__stream-edit-status--selected' : ''}`}
                      key={`status-${editingStreamItem.id}-${status}`}
                      onClick={() => handleUpdateEntryStatus(editingStreamItem.id, status)}
                      type="button"
                    >
                      <span className={`forms-hub__status-pill forms-hub__status-pill--${streamStatusMeta[status].tone}`}>
                        {streamStatusMeta[status].label}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="forms-hub__stream-edit-actions">
                  <button className="forms-hub__chip forms-hub__detail-action" onClick={() => setEditingStreamItemId(null)} type="button">
                    <span>Done</span>
                  </button>
                </div>
              </div>
            )}
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
                          <span className="forms-hub__stream-add-option-meta">{form.lane}{form.rolloutState !== 'live' ? ' • Old' : ''}</span>
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
    </div>
  );
}