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
import { CCL_SECTIONS, autoFillFromMatter, DEMO_FIELDS, STEPS, type EditorStepType } from './cclSections';
import QuestionnaireStep from './QuestionnaireStep';
import EditorStep from './EditorStep';
import PreviewStep from './PreviewStep';

interface CCLEditorProps {
  matter: NormalizedMatter;
  teamData?: TeamData[] | null;
  demoModeEnabled?: boolean;
  onClose: () => void;
}

const CCLEditor: React.FC<CCLEditorProps> = ({ matter, teamData, demoModeEnabled = false, onClose }) => {
  const { isDarkMode } = useTheme();

  // Step state
  const [currentStep, setCurrentStep] = useState<EditorStepType>('questionnaire');
  const [expandedSection, setExpandedSection] = useState<string>('client');

  // Field values
  const [fields, setFields] = useState<Record<string, string>>(() =>
    demoModeEnabled ? { ...DEMO_FIELDS } : autoFillFromMatter(matter, teamData)
  );

  // Generation options
  const [costsChoice, setCostsChoice] = useState<CostsChoice>(demoModeEnabled ? 'risk_costs' : null);
  const [chargesChoice, setChargesChoice] = useState<ChargesChoice>('hourly_rate');
  const [disbursementsChoice, setDisbursementsChoice] = useState<DisbursementsChoice>(demoModeEnabled ? 'estimate' : null);

  // Editor state
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorContent, setEditorContent] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);

  // ─── Load existing draft on mount ───
  useEffect(() => {
    if (demoModeEnabled) return;
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
  }, [matter.matterId, matter.displayNumber, demoModeEnabled]);

  // ─── Auto-save draft (debounced 2s) ───
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (demoModeEnabled || !draftLoaded) return;
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
  }, [fields, demoModeEnabled, draftLoaded, matter.matterId, matter.displayNumber]);

  // Demo one-click
  const handleDemoComplete = useCallback(() => {
    setFields({ ...DEMO_FIELDS });
    setCostsChoice('risk_costs');
    setChargesChoice('hourly_rate');
    setDisbursementsChoice('estimate');
    const options: GenerationOptions = {
      costsChoice: 'risk_costs',
      chargesChoice: 'hourly_rate',
      disbursementsChoice: 'estimate',
      showEstimateExamples: false,
    };
    const content = generateTemplateContent(DEFAULT_CCL_TEMPLATE, DEMO_FIELDS, options);
    setEditorContent(content);
    setCurrentStep('preview');
  }, []);

  // Generate content
  const generatedContent = useMemo(() => {
    const options: GenerationOptions = {
      costsChoice,
      chargesChoice,
      disbursementsChoice,
      showEstimateExamples: false,
    };
    return generateTemplateContent(DEFAULT_CCL_TEMPLATE, fields, options);
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
    setFields((prev) => ({ ...prev, [key]: value }));
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
      {/* ─── Header bar ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 0',
        borderBottom: `1px solid ${cardBorder}`,
        marginBottom: 12,
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
          aria-label="Close CCL Editor"
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

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {STEPS.map((step, idx) => {
            const isActive = step.key === currentStep;
            const stepIdx = STEPS.findIndex((s) => s.key === currentStep);
            const isPast = idx < stepIdx;
            return (
              <React.Fragment key={step.key}>
                {idx > 0 && (
                  <div style={{
                    width: 20, height: 1,
                    background: isPast ? accentBlue : cardBorder,
                  }} />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (step.key === 'editor') goToEditor();
                    else if (step.key === 'preview') goToPreview();
                    else setCurrentStep(step.key);
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 2,
                    background: isActive
                      ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)')
                      : 'transparent',
                    border: isActive
                      ? `1px solid ${isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(54,144,206,0.25)'}`
                      : `1px solid transparent`,
                    color: isActive ? accentBlue : (isPast ? accentBlue : textMuted),
                    fontSize: 11, fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer', transition: 'all 0.12s ease',
                    textTransform: 'uppercase' as const, letterSpacing: '0.03em',
                  }}
                >
                  <Icon iconName={step.icon} styles={{ root: { fontSize: 11 } }} />
                  {step.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Completion badge */}
        <div style={{
          padding: '3px 8px', borderRadius: 2, fontSize: 10, fontWeight: 700,
          background: overallCompletion === 100
            ? (isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)')
            : (isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.1)'),
          color: overallCompletion === 100
            ? (isDarkMode ? '#4ade80' : '#16a34a')
            : (isDarkMode ? '#f0a090' : colours.cta),
        }}>
          {overallCompletion}%
        </div>

        {/* Demo one-click complete */}
        {demoModeEnabled && currentStep === 'questionnaire' && (
          <button
            type="button"
            onClick={handleDemoComplete}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 2,
              background: isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.2)'}`,
              color: isDarkMode ? '#4ade80' : '#16a34a',
              fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase' as const, letterSpacing: '0.04em',
              cursor: 'pointer', transition: 'all 0.12s ease',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <Icon iconName="LightningBolt" styles={{ root: { fontSize: 11 } }} />
            Demo Complete
          </button>
        )}
      </div>

      {/* ─── Step content ─── */}
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
          content={editorRef.current?.innerText || editorContent}
          matter={matter}
          fields={fields}
          updateField={updateField}
          isDarkMode={isDarkMode}
          onBack={() => setCurrentStep('editor')}
          onClose={onClose}
        />
      )}
    </div>
  );
};

export default CCLEditor;
