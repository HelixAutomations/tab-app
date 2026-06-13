import React from 'react';
import { colours } from '../../../app/styles/colours';
import {
  StatusPill,
  SystemIntroPanel,
  SystemModuleSection,
  SystemPageHeader,
  StatusTone,
  toneColour,
  useSystemTokens,
} from './shared';

interface SystemAuditPackViewProps {
  isDarkMode: boolean;
  onBack: () => void;
  onOpenDashboard: () => void;
  onOpenInfrastructure?: () => void;
}

type Priority = 'P0' | 'P1' | 'P2';

interface AppPack {
  name: string;
  role: string;
  repo: string;
  status: StatusTone;
  data: string[];
  controls: string[];
  gaps: string[];
}

interface ProviderRow {
  target: string;
  purpose: string;
  position: string;
  status: StatusTone;
}

interface FlowRow {
  flow: string;
  dataClass: string;
  provider: string;
  control: string;
  gap: string;
}

interface ActionRow {
  priority: Priority;
  item: string;
  evidence: string;
}

interface TenantNode {
  label: string;
  detail: string;
  tone: StatusTone;
}

interface ConceptNode {
  label: string;
  question: string;
  answer: string;
  evidence: string;
  tone: StatusTone;
}

const conceptNodes: ConceptNode[] = [
  {
    label: 'Boundary',
    question: 'What system are we actually auditing?',
    answer: 'Three app surfaces with one shared operational data plane.',
    evidence: 'Repos, App Service apps, SQL databases, storage accounts, Key Vaults.',
    tone: 'live',
  },
  {
    label: 'Data exits',
    question: 'Where can client or operational data leave Helix control?',
    answer: 'AI providers, payment and ID providers, Graph, Teams, logs, exports.',
    evidence: 'Provider list, outbound routes, app settings, telemetry samples.',
    tone: 'watch',
  },
  {
    label: 'Proof',
    question: 'What would make tomorrow-me comfortable?',
    answer: 'A repeatable evidence pack, not confidence from memory.',
    evidence: 'Config exports, RBAC review, retention matrix, log-leak scan, route checks.',
    tone: 'partial',
  },
];

const tenantSnapshot: TenantNode[] = [
  { label: 'Tenant', detail: 'Helix Law tenant and UK South Azure estate.', tone: 'live' },
  { label: 'Apps in scope', detail: 'Team Hub, Instruct App, Enquiry Processing.', tone: 'live' },
  { label: 'Shared data plane', detail: 'Instructions SQL, Core Data SQL, storage, Key Vault.', tone: 'watch' },
  { label: 'Cross-app contract', detail: 'Shared IDs, lifecycle events, handoff rows.', tone: 'partial' },
];

const appPacks: AppPack[] = [
  {
    name: 'Team Hub',
    role: 'Internal operations app: CCL, attendance notes, matter workflow, ops telemetry.',
    repo: 'tab-app',
    status: 'partial',
    data: ['Matter and instruction records', 'CCL/client-care material', 'Attendance note transcripts', 'Operational telemetry'],
    controls: ['CCL paused outside localhost', 'Attendance Note AI gated to local or LZ', 'Local LLM brief in progress'],
    gaps: ['Team Hub control sheet', 'Local inference boundary', 'CCL trace retention', 'App Insights payload check'],
  },
  {
    name: 'Enquiry Processing',
    role: 'Lead intake, Teams cards, routing, operational AI.',
    repo: 'submodules/enquiry-processing-v2',
    status: 'scoped',
    data: ['Potential-client details', 'Enquiry narratives', 'Call and Dubber records', 'Teams and provider metadata'],
    controls: ['Metadata-only incoming telemetry', 'Raw provider bodies suppressed', 'Debug and demo routes closed outside Development'],
    gaps: ['Microsoft ContentLogging=false proof', 'Bot JWT validation', 'SQL and business-record retention', 'RBAC and access review'],
  },
  {
    name: 'Instruct App',
    role: 'Client-facing checkout, ID, payments, uploads, portal.',
    repo: 'submodules/instruct-pitch',
    status: 'partial',
    data: ['Identity data', 'Payment metadata', 'Instruction content', 'Uploaded documents', 'Passcodes'],
    controls: ['No direct AI provider calls currently', 'Stripe card data stays with Stripe Elements', 'Provider inventory started'],
    gaps: ['Route/body log review', 'Blob and SQL retention policy', 'App Insights metadata-only proof', 'Tiller DPA scope', 'Passcode rate limiting'],
  },
];

const providerRows: ProviderRow[] = [
  {
    target: 'Microsoft Foundry / Azure OpenAI',
    purpose: 'Classification, extraction and operational AI where approved.',
    position: 'Confidential use blocked until MAM and contract checks are verified.',
    status: 'partial',
  },
  {
    target: 'Non-Microsoft models',
    purpose: 'Claude, Anthropic or any other non-Microsoft model path.',
    position: 'No confidential or privileged material.',
    status: 'blocked',
  },
  {
    target: 'Helix local inference',
    purpose: 'Future private path for paused CCL and Attendance Note content.',
    position: 'Planned private VM, no public endpoint, controlled egress.',
    status: 'to-scope',
  },
  {
    target: 'Application Insights and app logs',
    purpose: 'Operational telemetry and failure diagnosis.',
    position: 'Metadata only. No prompts, responses, raw bodies or provider payloads.',
    status: 'partial',
  },
];

const flowRows: FlowRow[] = [
  { flow: 'Email and enquiry classification', dataClass: 'Potential-client and legal enquiry text', provider: 'Azure OpenAI / Foundry', control: 'Provider-response logs reduced to metadata', gap: 'ContentLogging=false proof and retention policy' },
  { flow: 'Web, CTA, Facebook and WhatsApp intake', dataClass: 'Contact details and enquiry narratives', provider: 'Graph, Meta, ActiveCampaign, Teams', control: 'Length, hash and safe key telemetry', gap: 'Stored-record retention and deletion evidence' },
  { flow: 'CCL and client-care generation', dataClass: 'Confidential and privileged client-care material', provider: 'Paused Azure OpenAI path, local inference planned', control: 'CCL disabled outside localhost', gap: 'Local inference and trace retention proof' },
  { flow: 'Dubber and Attendance Note', dataClass: 'Call metadata, transcripts and AI summaries', provider: 'Dubber and AI client', control: 'AI assist gated, manual fallback remains live', gap: 'Transcript retention and local provider health proof' },
  { flow: 'Instruct checkout and portal', dataClass: 'ID, payment metadata, instructions and uploaded documents', provider: 'Stripe, Tiller, Graph, Azure SQL, Blob', control: 'No direct AI calls in instruct-pitch', gap: 'Tiller scope, App Insights posture and lifecycle review' },
];

const actionRows: ActionRow[] = [
  { priority: 'P0', item: 'Verify Microsoft ContentLogging=false', evidence: 'Azure CLI output after Microsoft approval' },
  { priority: 'P0', item: 'Freeze non-Microsoft confidential model use', evidence: 'Written policy and config review' },
  { priority: 'P1', item: 'Write Team Hub control sheet', evidence: 'Data classes, AI calls, logs, stores and gaps' },
  { priority: 'P1', item: 'Define SQL, blob and transcript retention', evidence: 'Table and container retention matrix' },
  { priority: 'P1', item: 'Review RBAC and production access', evidence: 'SQL, Key Vault, App Insights, AI and Storage exports' },
  { priority: 'P2', item: 'Add repeatable log-leak scan', evidence: 'CI or script checking raw body, prompt and provider response patterns' },
];

function priorityColour(priority: Priority): string {
  if (priority === 'P0') return colours.cta;
  if (priority === 'P1') return colours.orange;
  return colours.highlight;
}

const SystemAuditPackView: React.FC<SystemAuditPackViewProps> = ({
  isDarkMode,
  onBack,
  onOpenDashboard,
  onOpenInfrastructure,
}) => {
  const tokens = useSystemTokens(isDarkMode);
  const { textColour, mutedColour, borderColour, panelBg } = tokens;

  return (
    <section data-helix-region="system/audit-pack">
      <SystemPageHeader
        eyebrow="System"
        title="Audit Pack"
        isDarkMode={isDarkMode}
        onBack={onBack}
        onOpenDashboard={onOpenDashboard}
      />

      <SystemIntroPanel
        eyebrow="Start here"
        title="Audit starting map"
        description="Scope, data exits, evidence needed."
        isDarkMode={isDarkMode}
        accent={colours.green}
        actionLabel={onOpenInfrastructure ? 'Open infrastructure' : undefined}
        onAction={onOpenInfrastructure}
        dataRegion="system/audit-pack/intro"
      />

      <SystemModuleSection
        label="01 Start here"
        description="The three questions."
        accent={colours.green}
        dataRegion="system/audit-pack/start-map"
        isDarkMode={isDarkMode}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
          {conceptNodes.map((node) => {
            const accent = toneColour(node.tone);
            return (
              <div key={node.label} style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 14, borderTop: `3px solid ${accent}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: accent }}>{node.label}</div>
                    <div style={{ marginTop: 4, fontSize: 14, fontWeight: 900, color: textColour, lineHeight: 1.3 }}>{node.question}</div>
                  </div>
                  <StatusPill tone={node.tone} isDarkMode={isDarkMode} />
                </div>
                <div style={{ fontSize: 12, color: mutedColour, lineHeight: 1.5, marginBottom: 8 }}>{node.answer}</div>
                <div style={{ borderTop: `1px solid ${borderColour}`, paddingTop: 8, fontSize: 11, color: mutedColour, lineHeight: 1.45 }}>
                  <strong style={{ color: textColour }}>Evidence:</strong> {node.evidence}
                </div>
              </div>
            );
          })}
        </div>
      </SystemModuleSection>

      <SystemModuleSection
        label="02 Boundary"
        description="What is in scope."
        accent={colours.accent}
        dataRegion="system/audit-pack/tenant-snapshot"
        isDarkMode={isDarkMode}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
          {tenantSnapshot.map((node) => {
            const accent = toneColour(node.tone);
            return (
              <div key={node.label} style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 12, borderTop: `3px solid ${accent}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: textColour }}>{node.label}</div>
                  <StatusPill tone={node.tone} isDarkMode={isDarkMode} />
                </div>
                <div style={{ fontSize: 12, color: mutedColour, lineHeight: 1.5 }}>{node.detail}</div>
              </div>
            );
          })}
        </div>
      </SystemModuleSection>

      <SystemModuleSection
        label="03 Apps"
        description="Data, controls, gaps."
        accent={colours.highlight}
        dataRegion="system/audit-pack/app-packs"
        isDarkMode={isDarkMode}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {appPacks.map((app) => {
            const accent = toneColour(app.status);
            return (
              <div key={app.name} style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 14, borderTop: `3px solid ${accent}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: textColour }}>{app.name}</div>
                    <div style={{ fontSize: 10, color: mutedColour, marginTop: 3 }}>{app.repo}</div>
                  </div>
                  <StatusPill tone={app.status} isDarkMode={isDarkMode} />
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: mutedColour, marginBottom: 12 }}>{app.role}</div>
                {([
                  ['Data handled', app.data],
                  ['Current controls', app.controls],
                  ['Open gaps', app.gaps],
                ] as Array<[string, string[]]>).map(([label, items]) => (
                  <div key={label} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: textColour, marginBottom: 6 }}>{label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {items.map((item) => (
                        <div key={item} style={{ display: 'grid', gridTemplateColumns: '6px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
                          <span style={{ width: 6, height: 6, marginTop: 5, background: accent, display: 'block' }} />
                          <span style={{ fontSize: 11, lineHeight: 1.45, color: mutedColour }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </SystemModuleSection>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 14, alignItems: 'start' }}>
        <SystemModuleSection
          label="03 Providers"
          description="External exits."
          accent={colours.green}
          dataRegion="system/audit-pack/provider-posture"
          isDarkMode={isDarkMode}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {providerRows.map((row) => (
              <div key={row.target} style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: textColour }}>{row.target}</div>
                  <StatusPill tone={row.status} isDarkMode={isDarkMode} />
                </div>
                <div style={{ fontSize: 11, color: mutedColour, lineHeight: 1.45, marginBottom: 5 }}>{row.purpose}</div>
                <div style={{ fontSize: 12, color: mutedColour, lineHeight: 1.5 }}>{row.position}</div>
              </div>
            ))}
          </div>
        </SystemModuleSection>

        <SystemModuleSection
          label="04 Open actions"
          description="Evidence still missing."
          accent={colours.cta}
          dataRegion="system/audit-pack/open-actions"
          isDarkMode={isDarkMode}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actionRows.map((row) => {
              const accent = priorityColour(row.priority);
              return (
                <div key={row.item} style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', gap: 10, border: `1px solid ${borderColour}`, background: panelBg, padding: 10 }}>
                  <div style={{ border: `1px solid ${accent}`, color: accent, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 }}>{row.priority}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: textColour }}>{row.item}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: mutedColour, lineHeight: 1.45 }}>{row.evidence}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </SystemModuleSection>
      </div>

      <SystemModuleSection
        label="05 Data flows"
        description="Path, control, gap."
        accent={colours.orange}
        dataRegion="system/audit-pack/data-flows"
        isDarkMode={isDarkMode}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {flowRows.map((row) => (
            <div key={row.flow} style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: textColour, marginBottom: 7 }}>{row.flow}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: mutedColour, lineHeight: 1.45 }}>
                <span><strong style={{ color: textColour }}>Data:</strong> {row.dataClass}</span>
                <span><strong style={{ color: textColour }}>Provider:</strong> {row.provider}</span>
                <span><strong style={{ color: textColour }}>Control:</strong> {row.control}</span>
                <span><strong style={{ color: textColour }}>Gap:</strong> {row.gap}</span>
              </div>
            </div>
          ))}
        </div>
      </SystemModuleSection>
    </section>
  );
};

export default SystemAuditPackView;
