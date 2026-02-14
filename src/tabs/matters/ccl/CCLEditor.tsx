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
import { fetchAiFill, type AiFillResponse, type AiDebugTrace } from './cclAiService';
import QuestionnaireStep from './QuestionnaireStep';
import EditorStep from './EditorStep';
import PreviewStep from './PreviewStep';

export type AiStatus = 'idle' | 'loading' | 'complete' | 'partial' | 'fallback' | 'error';

interface CCLEditorProps {
  matter: NormalizedMatter;
  teamData?: TeamData[] | null;
  demoModeEnabled?: boolean;
  onClose: () => void;
}

const CCLEditor: React.FC<CCLEditorProps> = ({ matter, teamData, demoModeEnabled = false, onClose }) => {
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
  const aiFiredRef = useRef(false);

  // Track which fields the user has manually edited (for provenance colouring)
  const [userEditedKeys, setUserEditedKeys] = useState<Set<string>>(new Set());

  // Field values — real matters always use autoFillFromMatter, demo only for synthetic demo matter
  const [fields, setFields] = useState<Record<string, string>>(() =>
    isDemoMatter ? { ...DEMO_FIELDS } : autoFillFromMatter(matter, teamData)
  );

  // Generation options
  const [costsChoice, setCostsChoice] = useState<CostsChoice>(isDemoMatter ? 'risk_costs' : null);
  const [chargesChoice, setChargesChoice] = useState<ChargesChoice>('hourly_rate');
  const [disbursementsChoice, setDisbursementsChoice] = useState<DisbursementsChoice>(isDemoMatter ? 'estimate' : null);

  // Editor state
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorContent, setEditorContent] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);

  // ─── Load existing draft on mount ───
  useEffect(() => {
    if (isDemoMatter) return;
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) return;
    (async () => {
      try {
        const res = await fetch(`/api/ccl/${encodeURIComponent(matterId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.draft) {
          setFields((prev) => ({ ...prev, ...data.draft }));
        }
      } catch {
        // No draft saved yet — use auto-filled defaults
      } finally {
        setDraftLoaded(true);
      }
    })();
  }, [matter.matterId, matter.displayNumber, isDemoMatter]);

  // ─── AI fill on mount (fires once — fills the 26 intake fields) ───
  useEffect(() => {
    if (isDemoMatter || aiFiredRef.current) return;
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) return;
    aiFiredRef.current = true;
    setAiStatus('loading');

    (async () => {
      try {
        const result: AiFillResponse = await fetchAiFill({
          matterId,
          instructionRef: matter.instructionRef || '',
          practiceArea: matter.practiceArea || '',
          description: matter.description || '',
          clientName: matter.clientName || '',
          opponent: (matter as any).opponent || '',
          handlerName: matter.responsibleSolicitor || '',
          handlerRole: fields.status || '',
          handlerRate: fields.handler_hourly_rate || '',
        });

        if (result.ok && result.fields) {
          // Merge AI fields with existing auto-filled fields.
          // AI fills the intake fields; auto-fill already set handler/client fields.
          // Only overwrite fields that are currently empty or very short.
          setFields((prev) => {
            const merged = { ...prev };
            for (const [key, value] of Object.entries(result.fields)) {
              // Don't overwrite auto-filled handler/client fields
              const isAutoFilled = [
                'insert_clients_name', 'name_of_person_handling_matter', 'name_of_handler',
                'handler', 'email', 'fee_earner_email', 'fee_earner_phone',
                'fee_earner_postal_address', 'name', 'status', 'handler_hourly_rate',
                'contact_details_for_marketing_opt_out', 'matter', 'matter_number',
              ].includes(key);
              if (isAutoFilled && prev[key]?.trim()) continue;
              // Only fill if current value is empty/short
              if (!prev[key]?.trim() || prev[key].trim().length < 5) {
                merged[key] = value;
              }
            }
            return merged;
          });

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
        } else {
          setAiStatus('error');
        }
      } catch (err) {
        console.warn('[CCL] AI fill failed:', err);
        setAiStatus('error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMatter, matter.matterId, matter.displayNumber]);

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
          body: JSON.stringify({ draftJson: fields }),
        });
      } catch {
        // Silent fail — draft save is best-effort
      }
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [fields, isDemoMatter, draftLoaded, matter.matterId, matter.displayNumber]);



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

  const overallCompletion = useMemo(() => {
    const totals = Object.values(completionBySection);
    const filled = totals.reduce((s, v) => s + v.filled, 0);
    const total = totals.reduce((s, v) => s + v.total, 0);
    return total === 0 ? 100 : Math.round((filled / total) * 100);
  }, [completionBySection]);

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
  const text = isDarkMode ? '#f1f5f9' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const cardBorder = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)';
  const accentBlue = colours.highlight;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      minHeight: 0, flex: 1,
    }}>
      {/* ─── Minimal header — document-first: no step indicators ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0',
        borderBottom: `1px solid ${cardBorder}`,
        marginBottom: 0,
      }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 2,
            background: 'transparent',
            border: `1px solid ${cardBorder}`,
            cursor: 'pointer', color: textMuted,
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)';
            e.currentTarget.style.color = accentBlue;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = textMuted;
          }}
          aria-label="Close CCL"
        >
          <Icon iconName="ChromeBack" styles={{ root: { fontSize: 12 } }} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Client Care Letter
          </div>
          <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>
            {matter.displayNumber} &middot; {matter.clientName}
          </div>
        </div>

        {/* Completion badge — subtle */}
        {overallCompletion === 100 && (
          <div style={{
            padding: '3px 8px', borderRadius: 2, fontSize: 10, fontWeight: 700,
            background: isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
            color: isDarkMode ? '#4ade80' : '#16a34a',
          }}>
            Ready
          </div>
        )}

        {/* Advanced mode toggle — gear icon for power users */}
        {currentStep !== 'preview' && (
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
        )}
      </div>

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
          aiStatus={aiStatus}
          aiSource={aiSource}
          aiDurationMs={aiDurationMs}
          aiDataSources={aiDataSources}
          aiContextSummary={aiContextSummary}
          aiUserPrompt={aiUserPrompt}
          aiSystemPrompt={aiSystemPrompt}
          aiFallbackReason={aiFallbackReason}
          aiDebugTrace={aiDebugTrace}
          isDarkMode={isDarkMode}
          onBack={() => setCurrentStep('editor')}
          onClose={onClose}
          onAdvancedMode={() => setCurrentStep('questionnaire')}
        />
      )}
    </div>
  );
};

export default CCLEditor;
