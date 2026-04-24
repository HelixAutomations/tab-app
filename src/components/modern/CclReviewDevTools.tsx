import React from 'react';

interface InfoRow {
  key: string;
  label: string;
  value: string;
}

interface PromptSection {
  key: string;
  title: string;
  body: string;
}

interface GodModeFieldOption {
  key: string;
  label: string;
}

interface CclReviewDevToolsProps {
  isMobile: boolean;
  generationSources: string[];
  safetyNetSources: string[];
  callsSent: boolean;
  callsVerified: boolean;
  callsSkipped: boolean;
  selectedFieldLabel: string | null;
  selectedFieldToken: string;
  selectedFieldOutput: string;
  selectedFieldCueLabel: string;
  selectedFieldCueTone: 'placeholder' | 'ai' | 'mail-merge' | 'static';
  selectedFieldDataFedRows: InfoRow[];
  selectedFieldPromptSections: PromptSection[];
  selectedFieldSnippetRows: InfoRow[];
  systemPromptText: string;
  userPromptText: string;
  visiblePromptTab: 'system' | 'user';
  onSelectPromptTab: (tab: 'system' | 'user') => void;
  godModeVisible: boolean;
  godModeFieldOptions: GodModeFieldOption[];
  godModeSelectedFieldKey: string;
  godModeDraftValue: string;
  onToggleGodMode: () => void;
  onGodModeFieldChange: (fieldKey: string) => void;
  onGodModeValueChange: (value: string) => void;
  onGodModeApply: () => void;
  onGodModeReload: () => void;
  onGodModeDelete: () => void;
}

function getChipTone(source: string): 'success' | 'warning' | 'default' {
  if (/call/i.test(source)) return 'success';
  if (/no phone/i.test(source)) return 'warning';
  return 'default';
}

export default function CclReviewDevTools({
  isMobile,
  generationSources,
  safetyNetSources,
  callsSent,
  callsVerified,
  callsSkipped,
  selectedFieldLabel,
  selectedFieldToken,
  selectedFieldOutput,
  selectedFieldCueLabel,
  selectedFieldCueTone,
  selectedFieldDataFedRows,
  selectedFieldPromptSections,
  selectedFieldSnippetRows,
  systemPromptText,
  userPromptText,
  visiblePromptTab,
  onSelectPromptTab,
  godModeVisible,
  godModeFieldOptions,
  godModeSelectedFieldKey,
  godModeDraftValue,
  onToggleGodMode,
  onGodModeFieldChange,
  onGodModeValueChange,
  onGodModeApply,
  onGodModeReload,
  onGodModeDelete,
}: CclReviewDevToolsProps) {
  const hasPromptTabs = !!(systemPromptText || userPromptText);
  const activePromptText = visiblePromptTab === 'system'
    ? (systemPromptText || 'No system prompt captured.')
    : (userPromptText || 'No user prompt captured.');
  const outputText = selectedFieldOutput.trim() || 'Select a review point to inspect the current output.';
  const placeholderSummary = selectedFieldToken
    ? `${selectedFieldToken} is currently treated as ${selectedFieldCueLabel.toLowerCase()}.`
    : 'Select a review point to inspect its placeholder or template mapping.';

  return (
    <div className={`ccl-review-devtools${isMobile ? ' ccl-review-devtools--mobile' : ''}`}>
      <details>
        <summary className="ccl-review-devtools__summary">Dev tools</summary>

        <div className="ccl-review-devtools__chain">
          <section className="ccl-review-devtools__event">
            <div className="ccl-review-devtools__step">1</div>
            <div className="ccl-review-devtools__event-body">
              <div className="ccl-review-devtools__title">Data fed</div>
              <div className="ccl-review-devtools__help">
                {selectedFieldLabel ? `What the workflow pulled together for ${selectedFieldLabel}.` : 'What the workflow pulled together before generation and Safety Net checks.'}
              </div>

              <div className="ccl-review-devtools__status-row">
                <span className={`ccl-review-devtools__status-dot ccl-review-devtools__status-dot--${callsSent ? 'success' : callsSkipped ? 'warning' : 'danger'}`} aria-hidden="true" />
                <span className="ccl-review-devtools__status-copy">
                  {callsSent ? 'Dubber call transcripts sent to generation' : callsSkipped ? 'No phone number available, so calls were skipped' : 'No call data detected for generation'}
                </span>
              </div>

              {(generationSources.length > 0 || safetyNetSources.length > 0) && (
                <div className="ccl-review-devtools__source-groups">
                  {generationSources.length > 0 && (
                    <div className="ccl-review-devtools__source-group">
                      <div className="ccl-review-devtools__group-label">Generation</div>
                      <div className="ccl-review-devtools__chips">
                        {generationSources.map((source) => (
                          <span key={source} className={`ccl-review-devtools__chip ccl-review-devtools__chip--${getChipTone(source)}`}>
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {safetyNetSources.length > 0 && (
                    <div className="ccl-review-devtools__source-group">
                      <div className="ccl-review-devtools__group-label">Safety Net</div>
                      <div className="ccl-review-devtools__chips">
                        {safetyNetSources.map((source) => (
                          <span key={source} className={`ccl-review-devtools__chip ccl-review-devtools__chip--${getChipTone(source)}`}>
                            {source}
                          </span>
                        ))}
                      </div>
                      <div className="ccl-review-devtools__status-row">
                        <span className={`ccl-review-devtools__status-dot ccl-review-devtools__status-dot--${callsVerified ? 'success' : 'danger'}`} aria-hidden="true" />
                        <span className="ccl-review-devtools__status-copy">
                          {callsVerified ? 'Call evidence was checked during Safety Net' : 'No call evidence appeared in the Safety Net package'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedFieldDataFedRows.length > 0 && (
                <div className="ccl-review-devtools__rows">
                  {selectedFieldDataFedRows.map((row) => (
                    <div key={row.key} className="ccl-review-devtools__row">
                      <div className="ccl-review-devtools__row-label">{row.label}</div>
                      <div className="ccl-review-devtools__row-value">{row.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="ccl-review-devtools__event">
            <div className="ccl-review-devtools__step">2</div>
            <div className="ccl-review-devtools__event-body">
              <div className="ccl-review-devtools__title">Prompt context</div>
              <div className="ccl-review-devtools__help">
                The exact prompt slices and evidence snippets the model saw for this decision.
              </div>

              {selectedFieldPromptSections.length > 0 ? (
                <div className="ccl-review-devtools__rows">
                  {selectedFieldPromptSections.map((section) => (
                    <div key={section.key} className="ccl-review-devtools__row">
                      <div className="ccl-review-devtools__row-label">{section.title}</div>
                      <div className="ccl-review-devtools__row-value ccl-review-devtools__row-value--boxed">{section.body}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ccl-review-devtools__empty">Select a review point to inspect the relevant prompt sections.</div>
              )}

              {selectedFieldSnippetRows.length > 0 && (
                <div className="ccl-review-devtools__rows">
                  {selectedFieldSnippetRows.map((row) => (
                    <div key={row.key} className="ccl-review-devtools__row">
                      <div className="ccl-review-devtools__row-label">{row.label}</div>
                      <div className="ccl-review-devtools__row-value">{row.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {hasPromptTabs && (
                <div className="ccl-review-devtools__prompt-shell">
                  <div className="ccl-review-devtools__prompt-tabs">
                    <button
                      type="button"
                      onClick={() => onSelectPromptTab('system')}
                      className={`ccl-review-devtools__prompt-tab${visiblePromptTab === 'system' ? ' ccl-review-devtools__prompt-tab--active' : ''}`}
                    >
                      System
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectPromptTab('user')}
                      className={`ccl-review-devtools__prompt-tab${visiblePromptTab === 'user' ? ' ccl-review-devtools__prompt-tab--active' : ''}`}
                    >
                      User
                    </button>
                  </div>
                  <div className="ccl-review-devtools__prompt-text">{activePromptText}</div>
                </div>
              )}
            </div>
          </section>

          <section className="ccl-review-devtools__event">
            <div className="ccl-review-devtools__step">3</div>
            <div className="ccl-review-devtools__event-body">
              <div className="ccl-review-devtools__title">Output</div>
              <div className="ccl-review-devtools__help">The wording currently flowing into the live draft.</div>
              <div className={`ccl-review-devtools__output-cue ccl-review-devtools__output-cue--${selectedFieldCueTone}`}>
                {selectedFieldCueLabel}
              </div>
              <div className="ccl-review-devtools__output">{outputText}</div>
            </div>
          </section>

          <section className="ccl-review-devtools__event">
            <div className="ccl-review-devtools__step">4</div>
            <div className="ccl-review-devtools__event-body">
              <div className="ccl-review-devtools__title">Placeholder or template mapping</div>
              <div className="ccl-review-devtools__help">How this field connects back to the template token or placeholder state.</div>
              <div className="ccl-review-devtools__mapping">
                <div className="ccl-review-devtools__mapping-token">{selectedFieldToken || '{{select_a_field}}'}</div>
                <div className="ccl-review-devtools__mapping-copy">{placeholderSummary}</div>
              </div>
            </div>
          </section>
        </div>

        <details className="ccl-review-devtools__danger">
          <summary className="ccl-review-devtools__danger-summary">God mode</summary>
          <div className="ccl-review-devtools__danger-copy">
            Reveal a hard edit or delete path for any stored draft field. This bypasses the guided review queue.
          </div>
          <button type="button" onClick={onToggleGodMode} className="ccl-review-devtools__danger-toggle">
            {godModeVisible ? 'Hide god mode' : 'Reveal god mode'}
          </button>

          {godModeVisible && (
            <div className="ccl-review-devtools__danger-body">
              <select
                value={godModeSelectedFieldKey}
                onChange={(event) => onGodModeFieldChange(event.target.value)}
                className="ccl-review-devtools__danger-select"
              >
                {godModeFieldOptions.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>

              <textarea
                value={godModeDraftValue}
                onChange={(event) => onGodModeValueChange(event.target.value)}
                rows={5}
                className="ccl-review-devtools__danger-textarea"
              />

              <div className="ccl-review-devtools__danger-actions">
                <button type="button" onClick={onGodModeApply} disabled={!godModeSelectedFieldKey} className="ccl-review-devtools__danger-action ccl-review-devtools__danger-action--primary">
                  Apply override
                </button>
                <button type="button" onClick={onGodModeReload} disabled={!godModeSelectedFieldKey} className="ccl-review-devtools__danger-action ccl-review-devtools__danger-action--secondary">
                  Reload current
                </button>
                <button type="button" onClick={onGodModeDelete} disabled={!godModeSelectedFieldKey} className="ccl-review-devtools__danger-action ccl-review-devtools__danger-action--delete">
                  Delete field
                </button>
              </div>
            </div>
          )}
        </details>
      </details>
    </div>
  );
}