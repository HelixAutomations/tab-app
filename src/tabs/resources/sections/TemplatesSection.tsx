import React from 'react';
import { colours } from '../../../app/styles/colours';
import ActivityCardLabPanel from '../../roadmap/parts/ActivityCardLabPanel';
import { HUB_COMMS_TEMPLATE_FAMILIES } from '../templatesRegistry';

interface TemplatesSectionProps {
  isDarkMode: boolean;
}

const statusMeta: Record<'live' | 'mapped' | 'partial', { label: string; colour: string }> = {
  live: { label: 'Live', colour: colours.green },
  mapped: { label: 'Mapped', colour: colours.highlight },
  partial: { label: 'In progress', colour: colours.orange },
};

export default function TemplatesSection({ isDarkMode }: TemplatesSectionProps) {
  return (
    <section
      className="helix-panel"
      data-helix-region="resources/templates"
      style={{
        display: 'grid',
        gap: 20,
        background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
        borderColor: isDarkMode ? colours.dark.borderColor : colours.light.border,
        boxShadow: 'none',
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div className="helix-section-title">Templates</div>
        <div className="helix-body">
          Templates now means the comms that drive Hub behaviour, not just bookmarks. This section tracks the live notification library and the other outbound comms families that still need to converge here.
        </div>
        <div className="helix-help">
          CCL, Pitch Builder, signatures, document requests, notifications, and framework prompts should all be visible from this surface even when editing still lives in code.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="helix-section-title">Notification Templates</div>
        <div className="helix-help">Card Lab now lives here because notification authoring belongs with the rest of the template estate, not in the Activity feed.</div>
        <ActivityCardLabPanel />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="helix-section-title">Hub Comms Registry</div>
        <div className="helix-help">Current mapped families that need to stay visible in Templates as the surface grows.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {HUB_COMMS_TEMPLATE_FAMILIES.map((family) => {
            const meta = statusMeta[family.status];
            return (
              <article
                key={family.id}
                className="helix-panel"
                data-helix-region={`resources/templates/${family.id}`}
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: '14px 16px',
                  boxShadow: 'none',
                  background: isDarkMode ? colours.dark.cardBackground : colours.grey,
                  borderColor: isDarkMode ? colours.dark.borderColor : colours.light.border,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: 1.35 }}>
                    {family.title}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: meta.colour,
                      border: `1px solid ${meta.colour}`,
                      padding: '2px 6px',
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="helix-body">{family.summary}</div>
                <div className="helix-help" style={{ color: isDarkMode ? colours.accent : colours.highlight, fontWeight: 700 }}>
                  {family.stat}
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div className="helix-label">Owning surfaces</div>
                  {family.owners.map((owner) => (
                    <div key={owner} className="helix-help" style={{ fontFamily: 'Consolas, monospace' }}>
                      {owner}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}