/**
 * CCLEditor — orchestrator for the 3-step client care letter flow.
 * Sub-components extracted to QuestionnaireStep, EditorStep, PreviewStep.
 * Config + auto-fill logic lives in cclSections.ts.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Icon } from '@fluentui/react';
import type { NormalizedMatter, TeamData } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';
import {
  DEFAULT_CCL_TEMPLATE,
  generateTemplateContent,
  type GenerationOptions,
  type CostsChoice,
  type ChargesChoice,
  type DisbursementsChoice,
} from '../../../shared/ccl';
import { CCL_SECTIONS, autoFillFromMatter, DEMO_FIELDS, type EditorStepType } from './cclSections';
import { fetchAiFillStream, type AiFillResponse, type AiDebugTrace } from './cclAiService';
import QuestionnaireStep from './QuestionnaireStep';
import EditorStep from './EditorStep';
import PreviewStep from './PreviewStep';

export type AiStatus = 'idle' | 'loading' | 'complete' | 'partial' | 'fallback' | 'error';

export interface CclLoadInfo {
  source: 'db' | 'file-cache' | 'json-file' | 'none' | string;
  hasStoredDraft: boolean;
  hasStoredVersion: boolean;
  version: number | null;
  contentId: number | null;
  status: string | null;
  createdAt: string | null;
  finalizedAt: string | null;
  historyCount: number;
}

interface CCLEditorProps {
  matter: NormalizedMatter;
  teamData?: TeamData[] | null;
  demoModeEnabled?: boolean;
  userInitials?: string;
  onClose: () => void;
}

const CCLEditor: React.FC<CCLEditorProps> = ({ matter, teamData, demoModeEnabled = false, userInitials, onClose }) => {
  const { isDarkMode } = useTheme();

  // Only use demo fields for the synthetic demo matter — real matters always get real data
  const isDemoMatter = demoModeEnabled && (!matter.displayNumber || matter.displayNumber.includes('DEMO'));

  // Step state — always start on preview (AI-first: user sees finished doc on entry)
  const [currentStep, setCurrentStep] = useState<EditorStepType>('preview');
  const [expandedSection, setExpandedSection] = useState<string>('client');

  // AI fill state
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiSource, setAiSource] = useState<string>('');
  const [aiDurationMs, setAiDurationMs] = useState<number>(0);
  const [aiDataSources, setAiDataSources] = useState<string[]>([]);
  const [aiContextSummary, setAiContextSummary] = useState<string>('');
  const [aiUserPrompt, setAiUserPrompt] = useState<string>('');
  const [aiSystemPrompt, setAiSystemPrompt] = useState<string>('');
  const [aiFallbackReason, setAiFallbackReason] = useState<string>('');
  const [aiDebugTrace, setAiDebugTrace] = useState<AiDebugTrace | undefined>(undefined);
  const [aiGeneratedKeys, setAiGeneratedKeys] = useState<Set<string>>(new Set());
  const aiFiredRef = useRef(false);
  // Keys currently being streamed by the AI (for per-field loading indicators)
  const [aiLoadingKeys, setAiLoadingKeys] = useState<Set<string>>(new Set());

  // Track which fields the user has manually edited (for provenance colouring)
  const [userEditedKeys, setUserEditedKeys] = useState<Set<string>>(new Set());

  const buildInitialFields = useCallback(() => (
    isDemoMatter ? { ...DEMO_FIELDS } : autoFillFromMatter(matter, teamData)
  ), [isDemoMatter, matter, teamData]);

  // Field values — real matters always use autoFillFromMatter, demo only for synthetic demo matter
  const [fields, setFields] = useState<Record<string, string>>(() =>
    buildInitialFields()
  );

  // Generation options
  const [costsChoice, setCostsChoice] = useState<CostsChoice>(isDemoMatter ? 'risk_costs' : null);
  const [chargesChoice, setChargesChoice] = useState<ChargesChoice>('hourly_rate');
  const [disbursementsChoice, setDisbursementsChoice] = useState<DisbursementsChoice>(isDemoMatter ? 'estimate' : null);

  // Editor state
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorContent, setEditorContent] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [loadInfo, setLoadInfo] = useState<CclLoadInfo | null>(null);

  // ─── Reset editor state when the selected matter changes ───
  useEffect(() => {
    setCurrentStep('preview');
    setExpandedSection('client');
    setCostsChoice(isDemoMatter ? 'risk_costs' : null);
    setChargesChoice('hourly_rate');
    setDisbursementsChoice(isDemoMatter ? 'estimate' : null);
    setEditorContent('');
    setFields(buildInitialFields());
    setUserEditedKeys(new Set());
    setAiStatus('idle');
    setAiSource('');
    setAiDurationMs(0);
    setAiDataSources([]);
    setAiContextSummary('');
    setAiUserPrompt('');
    setAiSystemPrompt('');
    setAiFallbackReason('');
    setAiDebugTrace(undefined);
    setAiGeneratedKeys(new Set());
    setAiLoadingKeys(new Set());
    setLoadInfo(null);
    setDraftLoaded(isDemoMatter);
    aiFiredRef.current = false;
  }, [buildInitialFields, isDemoMatter, matter.displayNumber, matter.matterId]);

  // ─── Load existing draft for the selected matter ───
  useEffect(() => {
    if (isDemoMatter) return;
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ccl/${encodeURIComponent(matterId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setLoadInfo(data.loadInfo || null);
        }
        // Server GET returns merged fields as `json` (CclDrafts / file cache)
        const draft = data.draft || data.json;
        if (data.ok && draft) {
          // Only merge non-empty draft values so auto-fill defaults aren't wiped
          const nonEmpty: Record<string, string> = {};
          for (const [k, v] of Object.entries(draft)) {
            if (typeof v === 'string' && v.trim()) nonEmpty[k] = v;
          }
          // Re-resolve supervising partner name — old drafts may have first-name-only
          if (nonEmpty.name && !nonEmpty.name.includes(' ') && teamData) {
            const supMatch = teamData.find(t => {
              const first = (t.First || (t['Full Name'] || '').split(/\s+/)[0] || '').trim();
              return first.toLowerCase() === nonEmpty.name.toLowerCase();
            });
            if (supMatch) nonEmpty.name = supMatch['Full Name'] || `${supMatch.First || ''} ${supMatch.Last || ''}`.trim() || nonEmpty.name;
          }
          if (!cancelled) {
            setFields((prev) => ({ ...prev, ...nonEmpty }));
          }
        }
      } catch {
        // No draft saved yet — use auto-filled defaults
      } finally {
        if (!cancelled) {
          setDraftLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [matter.matterId, matter.displayNumber, isDemoMatter, teamData]);

  // ─── AI fill (explicitly triggered by user — streams fields one-by-one) ───
  const triggerAiFill = useCallback(async () => {
    if (aiFiredRef.current) return;
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) return;
    aiFiredRef.current = true;
    setAiStatus('loading');
    setAiGeneratedKeys(new Set());
    // Mark ALL prompt-able keys as loading (they clear as fields arrive)
    setAiLoadingKeys(new Set(
      Object.keys(fields).filter(k => {
        const isAutoFilled = [
          'insert_clients_name', 'name_of_person_handling_matter', 'name_of_handler',
          'handler', 'email', 'fee_earner_email', 'fee_earner_phone',
          'fee_earner_postal_address', 'name', 'status', 'handler_hourly_rate',
          'contact_details_for_marketing_opt_out', 'matter', 'matter_number',
        ].includes(k);
        return !isAutoFilled;
      })
    ));

    const AUTO_FILL_KEYS = new Set([
      'insert_clients_name', 'name_of_person_handling_matter', 'name_of_handler',
      'handler', 'email', 'fee_earner_email', 'fee_earner_phone',
      'fee_earner_postal_address', 'name', 'status', 'handler_hourly_rate',
      'contact_details_for_marketing_opt_out', 'matter', 'matter_number',
    ]);

    try {
      await fetchAiFillStream(
        {
          matterId,
          instructionRef: matter.instructionRef || '',
          practiceArea: matter.practiceArea || '',
          description: matter.description || '',
          clientName: matter.clientName || '',
          opponent: (matter as any).opponent || '',
          handlerName: matter.responsibleSolicitor || '',
          handlerRole: fields.status || '',
          handlerRate: fields.handler_hourly_rate || '',
          initials: userInitials || '',
        },
        {
          onPhase: (_phase, _message, dataSources) => {
            if (dataSources) setAiDataSources(dataSources);
          },
          onField: (key, value) => {
            if (!AUTO_FILL_KEYS.has(key)) {
              setAiGeneratedKeys(prev => {
                const next = new Set(prev);
                next.add(key);
                return next;
              });
            }
            // Skip auto-filled keys that already have values
            if (AUTO_FILL_KEYS.has(key)) {
              setFields(prev => {
                if (prev[key]?.trim()) return prev;
                return { ...prev, [key]: value };
              });
            } else {
              setFields(prev => {
                if (prev[key]?.trim() && prev[key].trim().length >= 5) return prev;
                return { ...prev, [key]: value };
              });
            }
            // Remove this key from loading set
            setAiLoadingKeys(prev => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          },
          onComplete: (result) => {
            setAiLoadingKeys(new Set());
            setAiSource(result.source);
            setAiDurationMs(result.durationMs);
            setAiDataSources(result.dataSources || []);
            setAiContextSummary(result.contextSummary || '');
            setAiUserPrompt(result.userPrompt || '');
            setAiSystemPrompt(result.systemPrompt || '');
            setAiFallbackReason(result.fallbackReason || '');
            setAiDebugTrace(result.debug);
            setAiStatus(
              result.confidence === 'full' ? 'complete' :
              result.confidence === 'partial' ? 'partial' : 'fallback'
            );
            aiFiredRef.current = false;
          },
          onError: (message, fallbackFields) => {
            console.warn('[CCL] AI stream error:', message);
            setAiLoadingKeys(new Set());
            if (fallbackFields) {
              setFields(prev => {
                const merged = { ...prev };
                for (const [key, value] of Object.entries(fallbackFields)) {
                  if (AUTO_FILL_KEYS.has(key) && prev[key]?.trim()) continue;
                  if (!prev[key]?.trim() || prev[key].trim().length < 5) {
                    merged[key] = value;
                  }
                }
                return merged;
              });
            }
            setAiStatus('error');
            aiFiredRef.current = false;
          },
        }
      );
    } catch (err) {
      console.warn('[CCL] AI fill failed:', err);
      setAiLoadingKeys(new Set());
      setAiStatus('error');
      aiFiredRef.current = false;
    }
  }, [matter, fields, userInitials]);

  // ─── Auto-save draft (debounced 2s) ───
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isDemoMatter || !draftLoaded) return;
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/ccl/${encodeURIComponent(matterId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftJson: fields, initials: userInitials || '' }),
        });
      } catch {
        // Silent fail — draft save is best-effort
      }
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [fields, isDemoMatter, draftLoaded, matter.matterId, matter.displayNumber, userInitials]);



  // Generate content (fully substituted — for print/export)
  const generatedContent = useMemo(() => {
    const options: GenerationOptions = {
      costsChoice,
      chargesChoice,
      disbursementsChoice,
      showEstimateExamples: false,
    };
    return generateTemplateContent(DEFAULT_CCL_TEMPLATE, fields, options);
  }, [fields, costsChoice, chargesChoice, disbursementsChoice]);

  // Template with section choices resolved but {{field}} placeholders kept intact
  // — used by PreviewStep to render inline-editable fields on the A4 surface
  const templateWithPlaceholders = useMemo(() => {
    const options: GenerationOptions = {
      costsChoice,
      chargesChoice,
      disbursementsChoice,
      showEstimateExamples: false,
    };
    return generateTemplateContent(DEFAULT_CCL_TEMPLATE, fields, options, true);
  }, [fields, costsChoice, chargesChoice, disbursementsChoice]);

  // Completion tracking
  const completionBySection = useMemo(() => {
    const result: Record<string, { filled: number; total: number }> = {};
    CCL_SECTIONS.forEach((section) => {
      const required = section.fields.filter((f) => f.required);
      const filled = required.filter((f) => (fields[f.key] || '').trim().length > 0);
      result[section.id] = { filled: filled.length, total: required.length };
    });
    return result;
  }, [fields]);

  const updateField = useCallback((key: string, value: string) => {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      // Keep figure ↔ state_amount in sync (same number, different template locations)
      if (key === 'figure') next.state_amount = value;
      else if (key === 'state_amount') next.figure = value;
      return next;
    });
    setUserEditedKeys((prev) => { const next = new Set(prev); next.add(key); return next; });
  }, []);

  const goToEditor = useCallback(() => {
    setEditorContent(DEFAULT_CCL_TEMPLATE);
    setCurrentStep('editor');
  }, []);

  const goToPreview = useCallback(() => {
    if (editorRef.current) {
      setEditorContent(editorRef.current.innerText);
    }
    setCurrentStep('preview');
  }, []);

  // ───── Colours ─────
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const cardBorder = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      minHeight: 0, flex: 1,
    }}>
      {/* Advanced mode banner — only when not on preview step */}
      {currentStep !== 'preview' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 0',
          borderBottom: `1px solid ${cardBorder}`,
        }}>
          <button
            type="button"
            onClick={() => setCurrentStep('preview')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 2,
              background: 'transparent', border: `1px solid ${cardBorder}`,
              color: textMuted, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.12s ease',
            }}
          >
            <Icon iconName="ChromeBack" styles={{ root: { fontSize: 9 } }} />
            Back to document
          </button>
        </div>
      )}

      {/* ─── Content ─── */}
      {currentStep === 'questionnaire' && (
        <QuestionnaireStep
          sections={CCL_SECTIONS}
          fields={fields}
          updateField={updateField}
          expandedSection={expandedSection}
          setExpandedSection={setExpandedSection}
          completionBySection={completionBySection}
          costsChoice={costsChoice}
          setCostsChoice={setCostsChoice}
          chargesChoice={chargesChoice}
          setChargesChoice={setChargesChoice}
          disbursementsChoice={disbursementsChoice}
          setDisbursementsChoice={setDisbursementsChoice}
          isDarkMode={isDarkMode}
          onProceed={goToEditor}
        />
      )}
      {currentStep === 'editor' && (
        <EditorStep
          content={editorContent}
          fields={fields}
          editorRef={editorRef}
          isDarkMode={isDarkMode}
          onBack={() => setCurrentStep('questionnaire')}
          onProceed={goToPreview}
        />
      )}
      {currentStep === 'preview' && (
        <PreviewStep
          content={generatedContent}
          templateContent={templateWithPlaceholders}
          matter={matter}
          fields={fields}
          updateField={updateField}
          userEditedKeys={userEditedKeys}
          userInitials={userInitials}
          aiStatus={aiStatus}
          aiLoadingKeys={aiLoadingKeys}
          aiSource={aiSource}
          aiDurationMs={aiDurationMs}
          aiDataSources={aiDataSources}
          aiContextSummary={aiContextSummary}
          aiUserPrompt={aiUserPrompt}
          aiSystemPrompt={aiSystemPrompt}
          aiFallbackReason={aiFallbackReason}
          aiDebugTrace={aiDebugTrace}
          aiGeneratedKeys={aiGeneratedKeys}
          draftLoaded={draftLoaded}
          loadInfo={loadInfo}
          isDarkMode={isDarkMode}
          onBack={() => setCurrentStep('editor')}
          onClose={onClose}
          onAdvancedMode={() => setCurrentStep('questionnaire')}
          onTriggerAiFill={triggerAiFill}
        />
      )}
    </div>
  );
};

export default CCLEditor;
