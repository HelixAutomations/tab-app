import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { app } from '@microsoft/teams-js';
import * as AdaptiveCards from 'adaptivecards';
import './ActivityCardLabPanel.css';
import {
  ActivityFeedItem,
  CardLabCatalogResponse,
  CardLabRecentItem,
  CardLabRenderResponse,
  CardLabRouteOption,
  CardLabSendResponse,
  CardLabTemplateMeta,
  CardLabTemplateResponse,
} from './types';

interface ActivityCardLabPanelProps {
  recentItems: ActivityFeedItem[];
  onItemSent: (item: ActivityFeedItem) => void;
}

type NoticeState = {
  kind: 'success' | 'error' | 'info';
  message: string;
  teamsLink?: string | null;
} | null;

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.detail === 'string'
      ? data.detail
      : typeof data?.error === 'string'
      ? data.error
      : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

function getDefaultRouteKey(
  templateId: string,
  templates: CardLabTemplateMeta[],
  routes: CardLabRouteOption[],
): string {
  const preferred = templates.find((template) => template.id === templateId)?.defaultRoute;
  if (preferred && routes.some((route) => route.key === preferred)) {
    return preferred;
  }

  return routes[0]?.key || '';
}

function mapRecentSendToFeedItem(item: CardLabRecentItem): ActivityFeedItem {
  return {
    id: item.id,
    source: 'activity.cardlab',
    sourceLabel: 'Card Lab',
    status: 'success',
    title: item.title,
    summary: item.summary,
    timestamp: item.timestamp,
    teamsLink: item.teamsLink,
  };
}

const ActivityCardLabPanel: React.FC<ActivityCardLabPanelProps> = ({ recentItems, onItemSent }) => {
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const [templates, setTemplates] = useState<CardLabTemplateMeta[]>([]);
  const [routes, setRoutes] = useState<CardLabRouteOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedRouteKey, setSelectedRouteKey] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [previewCard, setPreviewCard] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [dmSending, setDmSending] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );

  const visibleRecentItems = useMemo(
    () => recentItems.slice(0, 4),
    [recentItems],
  );

  const renderPreview = useCallback(async (nextRawJson: string, templateId: string) => {
    if (!nextRawJson.trim()) {
      setPreviewCard(null);
      setWarnings([]);
      setPreviewError('Card JSON is empty.');
      return;
    }

    setPreviewing(true);
    setPreviewError(null);

    try {
      const response = await requestJson<CardLabRenderResponse>('/api/activity-card-lab/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templateId || undefined,
          rawJson: nextRawJson,
        }),
      });

      setPreviewCard(response.card);
      setWarnings(Array.isArray(response.warnings) ? response.warnings : []);
      setRawJson(response.rawJson || nextRawJson);
      setNotice((current) => (current?.kind === 'success' ? current : null));
    } catch (error) {
      setPreviewCard(null);
      setWarnings([]);
      setPreviewError(error instanceof Error ? error.message : 'Failed to render preview.');
    } finally {
      setPreviewing(false);
    }
  }, []);

  const loadTemplate = useCallback(async (
    templateId: string,
    nextTemplates: CardLabTemplateMeta[] = templates,
    nextRoutes: CardLabRouteOption[] = routes,
  ) => {
    if (!templateId) return;

    setTemplateLoading(true);
    setNotice(null);
    setSelectedTemplateId(templateId);
    setSelectedRouteKey(getDefaultRouteKey(templateId, nextTemplates, nextRoutes));

    try {
      const response = await requestJson<CardLabTemplateResponse>(`/api/activity-card-lab/template/${templateId}`);
      setRawJson(response.rawJson || '');
      await renderPreview(response.rawJson || '', templateId);
    } catch (error) {
      setRawJson('');
      setPreviewCard(null);
      setWarnings([]);
      setPreviewError(null);
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed to load template.',
      });
    } finally {
      setTemplateLoading(false);
    }
  }, [renderPreview, routes, templates]);

  // Ref breaks the dependency cycle: useEffect must not depend on loadTemplate
  // (loadTemplate depends on templates/routes which loadCatalog sets → infinite loop).
  const loadTemplateRef = useRef(loadTemplate);
  loadTemplateRef.current = loadTemplate;

  useEffect(() => {
    let disposed = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);

      try {
        const response = await requestJson<CardLabCatalogResponse>('/api/activity-card-lab/catalog');
        if (disposed) return;

        const nextTemplates = Array.isArray(response.templates) ? response.templates : [];
        const nextRoutes = Array.isArray(response.routes) ? response.routes : [];
        setTemplates(nextTemplates);
        setRoutes(nextRoutes);

        const firstTemplateId = nextTemplates[0]?.id || '';
        if (firstTemplateId) {
          await loadTemplateRef.current(firstTemplateId, nextTemplates, nextRoutes);
        }
      } catch (error) {
        if (!disposed) {
          setNotice({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Failed to load Card Lab catalog.',
          });
        }
      } finally {
        if (!disposed) {
          setCatalogLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      disposed = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) return;

    host.replaceChildren();

    if (!previewCard) {
      return;
    }

    try {
      const adaptiveCard = new AdaptiveCards.AdaptiveCard();
      adaptiveCard.parse(previewCard as AdaptiveCards.IAdaptiveCard);
      adaptiveCard.onExecuteAction = () => undefined;

      const rendered = adaptiveCard.render();
      if (!rendered) {
        throw new Error('Adaptive Card preview could not be rendered.');
      }

      host.appendChild(rendered);
      setPreviewError(null);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Adaptive Card preview could not be rendered.');
    }
  }, [previewCard]);

  const handleOpenLink = useCallback(async (url: string | null | undefined) => {
    if (!url) return;

    try {
      await app.openLink(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handlePreview = useCallback(async () => {
    await renderPreview(rawJson, selectedTemplateId);
  }, [rawJson, renderPreview, selectedTemplateId]);

  const handleSend = useCallback(async () => {
    if (!selectedRouteKey) {
      setNotice({ kind: 'error', message: 'Choose a route before sending.' });
      return;
    }

    setSending(true);
    setNotice({ kind: 'info', message: 'Sending card to Teams…' });

    try {
      const response = await requestJson<CardLabSendResponse>('/api/activity-card-lab/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplateId || undefined,
          rawJson,
          routeKey: selectedRouteKey,
          summary: selectedTemplate?.summary,
        }),
      });

      const nextItem = mapRecentSendToFeedItem(response.item);
      onItemSent(nextItem);
      setWarnings(Array.isArray(response.warnings) ? response.warnings : []);
      setNotice({
        kind: 'success',
        message: `Card sent to ${response.item.routeLabel}.`,
        teamsLink: response.teamsLink,
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed to send card.',
      });
    } finally {
      setSending(false);
    }
  }, [onItemSent, rawJson, selectedRouteKey, selectedTemplate?.summary, selectedTemplateId]);

  const handleDmTest = useCallback(async () => {
    setDmSending(true);
    setNotice({ kind: 'info', message: 'Sending DM test card…' });

    try {
      const response = await requestJson<{ success: boolean; displayName?: string; activityId?: string; error?: string }>(
        '/api/teams-notify/dm-test',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );

      if (response.success) {
        const dmItem: ActivityFeedItem = {
          id: `dm-test-${Date.now()}`,
          source: 'activity.dm.send',
          sourceLabel: 'DM sent',
          status: 'success',
          title: `DM test sent${response.displayName ? ` to ${response.displayName}` : ''}`,
          summary: `test-ack card · activityId ${response.activityId || 'unknown'}`,
          timestamp: new Date().toISOString(),
        };
        onItemSent(dmItem);
        setNotice({ kind: 'success', message: `DM test card sent${response.displayName ? ` to ${response.displayName}` : ''}.` });
      } else {
        setNotice({ kind: 'error', message: response.error || 'DM test failed.' });
      }
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'DM test failed.' });
    } finally {
      setDmSending(false);
    }
  }, [onItemSent]);

  return (
    <div className="activity-card-lab helix-panel">
      <div className="activity-card-lab__header">
        <div>
          <div className="activity-card-lab__eyebrow">Hub controls</div>
          <h2 className="activity-card-lab__title">Card and DM controls</h2>
          <p className="activity-card-lab__description">
            Send cards to channels or DMs, test the bot round-trip, and track delivery in the live feed above.
          </p>
        </div>
        <div className="activity-card-lab__header-meta">
          <span className="activity-card-lab__badge">{templates.length} templates</span>
          <span className="activity-card-lab__badge">{routes.length} routes</span>
        </div>
      </div>

      {notice && (
        <div className={notice.kind === 'success' ? 'helix-toast-success activity-card-lab__notice' : notice.kind === 'error' ? 'helix-toast-error activity-card-lab__notice' : 'activity-card-lab__notice activity-card-lab__notice--info'}>
          <span>{notice.message}</span>
          {notice.teamsLink && (
            <button type="button" className="activity-card-lab__link-button" onClick={() => void handleOpenLink(notice.teamsLink)}>
              Open in Teams
            </button>
          )}
        </div>
      )}

      <div className="activity-card-lab__quick-actions">
        <button
          type="button"
          className="helix-btn-primary activity-card-lab__quick-btn"
          onClick={() => void handleDmTest()}
          disabled={dmSending}
        >
          <Icon iconName="Chat" />
          {dmSending ? 'Sending DM…' : 'Send DM test card'}
        </button>
        <button
          type="button"
          className="activity-card-lab__btn-secondary activity-card-lab__quick-btn"
          onClick={() => setComposerExpanded((prev) => !prev)}
        >
          <Icon iconName={composerExpanded ? 'ChevronUp' : 'Settings'} />
          {composerExpanded ? 'Close composer' : 'Card composer'}
        </button>
      </div>

      <div>
        <div className="helix-label">Recent card activity</div>
        {visibleRecentItems.length === 0 ? (
          <div className="activity-card-lab__preview-placeholder" style={{ minHeight: 60 }}>
            Card sends and DM deliveries will appear here.
          </div>
        ) : (
          <ul className="activity-card-lab__recent-list">
            {visibleRecentItems.map((item) => (
              <li key={item.id} className="activity-card-lab__recent-item">
                <div>
                  <p className="activity-card-lab__recent-title">{item.title}</p>
                  <div className="activity-card-lab__recent-meta">
                    <div>{formatDateTime(item.timestamp)}</div>
                    {item.summary && <div>{item.summary}</div>}
                  </div>
                </div>
                {item.teamsLink && (
                  <button type="button" className="activity-card-lab__link-button" onClick={() => void handleOpenLink(item.teamsLink)}>
                    Open
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {composerExpanded && (
      <div className="activity-card-lab__grid">
        <section className="activity-card-lab__pane">
          <h3 className="activity-card-lab__pane-title">Composer</h3>
          <p className="activity-card-lab__pane-copy">
            Pick a template, choose a route, edit the JSON if needed, then render or send. Sends are real and appear in the live feed.
          </p>

          <div className="activity-card-lab__control-grid">
            <label className="activity-card-lab__field">
              <span className="helix-label">Template</span>
              <select
                className="helix-input"
                value={selectedTemplateId}
                onChange={(event) => void loadTemplate(event.target.value)}
                disabled={catalogLoading || templateLoading || sending}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="activity-card-lab__field">
              <span className="helix-label">Route</span>
              <select
                className="helix-input"
                value={selectedRouteKey}
                onChange={(event) => setSelectedRouteKey(event.target.value)}
                disabled={catalogLoading || templateLoading || sending}
              >
                {routes.map((route) => (
                  <option key={route.key} value={route.key}>
                    {route.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="activity-card-lab__status">
            {catalogLoading ? 'Loading templates…' : templateLoading ? 'Loading template…' : selectedTemplate ? `${selectedTemplate.category} · ${selectedTemplate.description}` : 'No template loaded.'}
          </div>

          <label className="activity-card-lab__field">
            <span className="helix-label">Card JSON</span>
            <textarea
              className="helix-input activity-card-lab__textarea"
              value={rawJson}
              onChange={(event) => setRawJson(event.target.value)}
              spellCheck={false}
              disabled={catalogLoading || templateLoading || sending}
            />
          </label>

          <div className="activity-card-lab__actions">
            <button
              type="button"
              className="activity-card-lab__btn-secondary"
              onClick={() => void loadTemplate(selectedTemplateId)}
              disabled={!selectedTemplateId || catalogLoading || templateLoading || sending}
            >
              <Icon iconName="Refresh" />
              Reset template
            </button>
            <button
              type="button"
              className="helix-btn-primary activity-card-lab__preview"
              onClick={() => void handlePreview()}
              disabled={!rawJson.trim() || catalogLoading || templateLoading || previewing || sending}
            >
              <Icon iconName="View" />
              {previewing ? 'Rendering…' : 'Render preview'}
            </button>
            <button
              type="button"
              className="helix-btn-danger activity-card-lab__send"
              onClick={() => void handleSend()}
              disabled={!rawJson.trim() || !selectedRouteKey || catalogLoading || templateLoading || sending}
            >
              <Icon iconName="Send" />
              {sending ? 'Sending…' : 'Send to Teams'}
            </button>
          </div>

          {warnings.length > 0 && (
            <ul className="activity-card-lab__warning-list">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="activity-card-lab__pane">
          <h3 className="activity-card-lab__pane-title">Preview</h3>
          <p className="activity-card-lab__pane-copy">
            Live Adaptive Cards renderer. What you see here matches the Teams payload.
          </p>

          <div className="activity-card-lab__preview-shell">
            {previewError ? (
              <div className="activity-card-lab__preview-placeholder">{previewError}</div>
            ) : previewCard ? (
              <div ref={previewHostRef} className="activity-card-lab__preview-host" />
            ) : (
              <div className="activity-card-lab__preview-placeholder">Choose a template to load a card preview.</div>
            )}
          </div>
        </section>
      </div>
      )}
    </div>
  );
};

export default ActivityCardLabPanel;