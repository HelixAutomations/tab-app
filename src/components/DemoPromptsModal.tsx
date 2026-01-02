import React, { useState, useEffect } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';

interface DemoPromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Prompt {
  id: number;
  title: string;
  status: 'completed' | 'approved' | 'not-started';
  phases: {
    confirm: boolean;
    approved: boolean;
    implemented: boolean;
    verified: boolean;
  };
  look?: string;
  problem?: string;
  impact?: string;
  decision?: string;
  done?: string;
  verify?: string;
  brief?: string;
  notes?: string;
}

const DemoPromptsModal: React.FC<DemoPromptsModalProps> = ({ isOpen, onClose }) => {
  const { isDarkMode } = useTheme();
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    
    // Load prompts from todo-prompts.txt or from a hardcoded list
    const demoPrompts: Prompt[] = [
      {
        id: 1,
        title: 'Tech Idea/Problem accent cue is orange (not tech-like)',
        status: 'completed',
        phases: { confirm: true, approved: true, implemented: true, verified: true },
        look: 'src/CustomForms/TechIdeaForm.tsx; src/CustomForms/TechProblemForm.tsx; src/components/FormsModal.tsx',
        problem: 'Panel header border + form accents read as orange/warning not "tech".',
        impact: 'Tech section looked warning/error-ish.',
        decision: 'Changed FormsModal Tech_Support to colours.cta (coral #D65541) for distinct category. Forms use colours.highlight (blue).',
        done: 'Tech panel header + form elements no longer orange.',
        verify: 'Visual confirmed - forms blue, panel border coral, distinct from other sections.',
      },
      {
        id: 2,
        title: 'Tech Problem banner reads like an error',
        status: 'completed',
        phases: { confirm: true, approved: true, implemented: true, verified: true },
        look: 'src/CustomForms/TechProblemForm.tsx; src/CustomForms/shared/formStyles.ts',
        problem: 'The "warning" banner was red and read like something failed.',
        impact: 'Confusing UX; discourages use.',
        decision: 'Changed to neutral info box with Info icon instead of Warning icon.',
        done: 'Banner uses neutral/info styling consistent with Tech Idea.',
        verify: 'Both forms now show neutral blue info box (Info icon, no red styling).',
      },
      {
        id: 3,
        title: 'Attendance table confirmation cue',
        status: 'completed',
        phases: { confirm: true, approved: true, implemented: true, verified: true },
        brief: 'Subtle optional nudge asking users to confirm attendance if they haven\'t yet. Was enforced every Thursday before, now going looser/optional/smooth.',
        look: 'src/tabs/home/WeeklyAttendanceView.tsx',
        notes: 'Removed aggressive pulsing animation, changed to subtle blue button with optional-feeling styling.',
      },
      {
        id: 4,
        title: 'Pitch Builder rates & Senior Partner roles',
        status: 'not-started',
        phases: { confirm: false, approved: false, implemented: false, verified: false },
        brief: 'Update pitch builder to use new rates. Make Alex and Jonathan Senior Partners. Reference Rate Change Modal logic, then amend team table SQL.',
        look: 'src/tabs/enquiries/pitch-builder/; database/migrations/; Rate Change Modal for patterns',
      },
    ];

    setPrompts(demoPrompts);
  }, [isOpen]);

  if (!isOpen) return null;

  const bg = isDarkMode ? '#0f172a' : '#ffffff';
  const bgSubtle = isDarkMode ? 'rgba(30,41,59,0.6)' : '#f8fafc';
  const border = isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(203,213,225,0.4)';
  const text = isDarkMode ? '#e2e8f0' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const accent = '#3690CE';
  const successColor = isDarkMode ? '#4ade80' : '#166534';

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#22c55e';
      case 'approved':
        return '#3b82f6';
      case 'not-started':
        return '#a1a1aa';
      default:
        return textMuted;
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'approved':
        return '→';
      case 'not-started':
        return '○';
      default:
        return '•';
    }
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)',
          backdropFilter: 'blur(4px)',
          zIndex: 1998,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(90vw, 700px)',
          maxHeight: 'calc(100vh - 40px)',
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '12px',
          boxShadow: isDarkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          zIndex: 1999,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${border}`,
            background: bgSubtle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: text }}>Demo Features</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: textMuted }}>Implementation progress and feature tracking</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              color: textMuted,
              cursor: 'pointer',
              padding: '0 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
          }}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                style={{
                  border: `1px solid ${border}`,
                  borderRadius: '8px',
                  padding: '16px',
                  background: isDarkMode ? 'rgba(30,41,59,0.3)' : 'rgba(248,250,252,0.5)',
                }}
              >
                {/* Title and Status */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: statusColor(prompt.status),
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {statusIcon(prompt.status)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{prompt.title}</div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        color: statusColor(prompt.status),
                        marginTop: 4,
                        opacity: 0.8,
                      }}
                    >
                      {prompt.status === 'completed' && '✓ Completed'}
                      {prompt.status === 'approved' && '→ Approved'}
                      {prompt.status === 'not-started' && '○ Not Started'}
                    </div>
                  </div>
                </div>

                {/* Phases */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, fontSize: 10 }}>
                  {[
                    { label: 'Orient', value: prompt.phases.confirm },
                    { label: 'Approved', value: prompt.phases.approved },
                    { label: 'Implemented', value: prompt.phases.implemented },
                    { label: 'Verified', value: prompt.phases.verified },
                  ].map((phase) => (
                    <span
                      key={phase.label}
                      style={{
                        padding: '3px 8px',
                        background: phase.value
                          ? isDarkMode
                            ? 'rgba(34,197,94,0.15)'
                            : 'rgba(34,197,94,0.1)'
                          : isDarkMode
                            ? 'rgba(100,116,139,0.2)'
                            : 'rgba(203,213,225,0.3)',
                        border: `1px solid ${
                          phase.value
                            ? isDarkMode
                              ? 'rgba(34,197,94,0.3)'
                              : 'rgba(34,197,94,0.2)'
                            : isDarkMode
                              ? 'rgba(100,116,139,0.3)'
                              : 'rgba(203,213,225,0.5)'
                        }`,
                        borderRadius: '4px',
                        color: phase.value ? (isDarkMode ? '#4ade80' : '#166534') : textMuted,
                        fontWeight: 600,
                      }}
                    >
                      {phase.value ? '✓' : '○'} {phase.label}
                    </span>
                  ))}
                </div>

                {/* Details */}
                {(prompt.brief || prompt.problem || prompt.impact || prompt.decision || prompt.done || prompt.verify || prompt.look) && (
                  <div
                    style={{
                      fontSize: 12,
                      color: textMuted,
                      lineHeight: 1.5,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    {prompt.brief && (
                      <div>
                        <strong style={{ color: text }}>Brief:</strong> {prompt.brief}
                      </div>
                    )}
                    {prompt.problem && (
                      <div>
                        <strong style={{ color: text }}>Problem:</strong> {prompt.problem}
                      </div>
                    )}
                    {prompt.impact && (
                      <div>
                        <strong style={{ color: text }}>Impact:</strong> {prompt.impact}
                      </div>
                    )}
                    {prompt.decision && (
                      <div>
                        <strong style={{ color: text }}>Decision:</strong> {prompt.decision}
                      </div>
                    )}
                    {prompt.done && (
                      <div>
                        <strong style={{ color: text }}>Done when:</strong> {prompt.done}
                      </div>
                    )}
                    {prompt.verify && (
                      <div>
                        <strong style={{ color: text }}>Verify:</strong> {prompt.verify}
                      </div>
                    )}
                    {prompt.look && (
                      <div>
                        <strong style={{ color: text }}>Look:</strong> <code style={{ fontSize: 10, color: accent }}>{prompt.look}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${border}`,
            background: bgSubtle,
            textAlign: 'right',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: accent,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};

export default DemoPromptsModal;
