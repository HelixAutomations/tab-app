import React from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import type { CostsChoice, ChargesChoice, DisbursementsChoice } from '../../../shared/ccl';
import FieldInput from './FieldInput';
import ChoiceRow from './ChoiceRow';
import type { CCLSection } from './cclSections';

export interface QuestionnaireStepProps {
  sections: CCLSection[];
  fields: Record<string, string>;
  updateField: (key: string, value: string) => void;
  expandedSection: string;
  setExpandedSection: (id: string) => void;
  completionBySection: Record<string, { filled: number; total: number }>;
  costsChoice: CostsChoice;
  setCostsChoice: (v: CostsChoice) => void;
  chargesChoice: ChargesChoice;
  setChargesChoice: (v: ChargesChoice) => void;
  disbursementsChoice: DisbursementsChoice;
  setDisbursementsChoice: (v: DisbursementsChoice) => void;
  isDarkMode: boolean;
  onProceed: () => void;
}

const QuestionnaireStep: React.FC<QuestionnaireStepProps> = ({
  sections, fields, updateField, expandedSection, setExpandedSection,
  completionBySection, costsChoice, setCostsChoice, chargesChoice,
  setChargesChoice, disbursementsChoice, setDisbursementsChoice,
  isDarkMode, onProceed,
}) => {
  const text = isDarkMode ? '#f1f5f9' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const cardBg = isDarkMode
    ? 'linear-gradient(90deg, rgba(18, 28, 48, 0.95) 0%, rgba(28, 40, 60, 0.92) 100%)'
    : 'linear-gradient(90deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 251, 252, 0.9) 100%)';
  const cardBorder = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)';
  const inputBg = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#f8fafc';
  const inputBorder = isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(148, 163, 184, 0.3)';
  const accentBlue = colours.highlight;

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sections.map((section) => {
        const isExpanded = expandedSection === section.id;
        const completion = completionBySection[section.id] || { filled: 0, total: 0 };
        const isComplete = completion.total > 0 && completion.filled === completion.total;

        return (
          <div key={section.id} style={{
            background: cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${isExpanded ? (isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(54,144,206,0.2)') : cardBorder}`,
            borderLeft: `3px solid ${isComplete ? colours.green : accentBlue}`,
            borderRadius: 2,
            transition: 'all 0.12s ease',
          }}>
            <button
              type="button"
              onClick={() => setExpandedSection(isExpanded ? '' : section.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px',
                background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left' as const,
                fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                color: isComplete ? colours.green : accentBlue,
                flexShrink: 0, transition: 'transform 0.12s ease',
              }}>
                <Icon iconName={isComplete ? 'CheckMark' : section.icon} styles={{ root: { fontSize: 13 } }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {section.title}
                  {completion.total > 0 && (
                    <span style={{
                      marginLeft: 8, padding: '1px 6px',
                      fontSize: 10, fontWeight: 600, borderRadius: 2,
                      background: isComplete
                        ? (isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)')
                        : (isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.08)'),
                      color: isComplete
                        ? (isDarkMode ? '#4ade80' : '#16a34a')
                        : (isDarkMode ? '#cbd5e1' : '#475569'),
                    }}>
                      {completion.filled}/{completion.total}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 10, color: textMuted, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {section.description}
                </div>
              </div>
              <Icon
                iconName={isExpanded ? 'ChevronDown' : 'ChevronRight'}
                styles={{
                  root: {
                    fontSize: 10, color: textMuted,
                    transition: 'transform 0.15s ease',
                    flexShrink: 0,
                  },
                }}
              />
            </button>

            {isExpanded && (
              <div style={{
                padding: '4px 14px 14px 14px',
                display: 'flex', flexDirection: 'column', gap: 10,
                borderTop: `1px solid ${cardBorder}`,
              }}>
                {section.fields.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={fields[field.key] || ''}
                    onChange={(v) => updateField(field.key, v)}
                    isDarkMode={isDarkMode}
                    inputBg={inputBg}
                    inputBorder={inputBorder}
                    text={text}
                    textMuted={textMuted}
                  />
                ))}

                {section.id === 'costs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    <ChoiceRow
                      label="Costs risk"
                      value={costsChoice}
                      options={[
                        { key: 'no_costs', label: 'No costs risk' },
                        { key: 'risk_costs', label: 'Costs risk exists' },
                      ]}
                      onChange={(v) => setCostsChoice(v as CostsChoice)}
                      isDarkMode={isDarkMode}
                    />
                    <ChoiceRow
                      label="Charges basis"
                      value={chargesChoice}
                      options={[
                        { key: 'hourly_rate', label: 'Hourly rate' },
                        { key: 'no_estimate', label: 'No estimate possible' },
                      ]}
                      onChange={(v) => setChargesChoice(v as ChargesChoice)}
                      isDarkMode={isDarkMode}
                    />
                    <ChoiceRow
                      label="Disbursements"
                      value={disbursementsChoice}
                      options={[
                        { key: 'table', label: 'Itemised table' },
                        { key: 'estimate', label: 'Simple estimate' },
                      ]}
                      onChange={(v) => setDisbursementsChoice(v as DisbursementsChoice)}
                      isDarkMode={isDarkMode}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ padding: '12px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onProceed}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 20px', borderRadius: 2,
            background: accentBlue, color: '#fff',
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase' as const, letterSpacing: '0.04em',
            transition: 'all 0.12s ease',
            boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.08)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Continue to Editor
          <Icon iconName="ChevronRight" styles={{ root: { fontSize: 11 } }} />
        </button>
      </div>
    </div>
  );
};

export default QuestionnaireStep;
