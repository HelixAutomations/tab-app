import React, { useEffect, useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import { HeaderButton, StatusPill, SystemIntroPanel, SystemModuleSection, SystemPageHeader, useSystemTokens } from './shared';
import StashedBriefsTitlesPanel from '../parts/StashedBriefsTitlesPanel';

interface SystemProjectsViewProps {
  isDarkMode: boolean;
  viewerInitials?: string | null;
  isDevOwner: boolean;
  onBack: () => void;
  onOpenDashboard: () => void;
  onOpenInfrastructure?: () => void;
}

type ProjectsSurface = 'overview' | 'local-llm' | 'stashes' | 'changelog';

type StashCard = {
  id: string | null;
  title: string;
  status: string;
  verified: string | null;
  ageDays: number | null;
  branch: string | null;
  shipped: boolean;
  touchCount: number;
  dependencyCount: number;
  coordinationCount: number;
  conflictCount: number;
};

type ReleaseCard = {
  date: string;
  title: string;
  details?: string;
};

const LOCAL_LLM_PROJECT = {
  id: 'local-llm-zdr-inference-gateway',
  title: 'Local LLM',
  eyebrow: 'ZDR / LPP inference',
  status: 'planned' as const,
  briefPath: 'docs/notes/LOCAL_LLM_ZDR_INFERENCE_GATEWAY.md',
  summary: 'Private local reasoning for privileged work. Start cheap on workstation. Only spend on Azure once the model proves useful.',
  modelLadder: [
    { name: 'Phi (Microsoft)', role: 'Smoke', note: 'Local first. Cheap. Proves the loop, not final quality.' },
    { name: 'Llama 3.x Instruct (Meta)', role: 'Likely prod', note: 'Target for Attendance Note and CCL if the architecture holds.' },
    { name: 'Bigger Llama / A100', role: 'Only if needed', note: 'Do not pay for this until output forces it.' },
  ],
  costEnvelope: [
    { item: 'Local workstation proof', value: 'first. near-zero infra spend' },
    { item: 'NC4/NC8 T4 VM', value: 'about GBP 335 to 479 / month if left on' },
    { item: 'P30 disk', value: 'about GBP 122 / month' },
    { item: 'Bastion', value: 'about GBP 103 to 158 / month if needed' },
    { item: 'Rule', value: 'deallocate when idle' },
  ],
  phases: [
    { key: '-1', label: 'Local PC proof', detail: 'Phi on workstation. Redacted tests only. Check if the idea is worth spending on.' },
    { key: '0', label: 'Foundation', detail: 'Brief, diagram, cost gate, no spend yet.' },
    { key: 'A', label: 'Private POC', detail: 'GPU VM, vLLM, private route, no public endpoint.' },
    { key: 'B', label: 'Attendance Note', detail: 'Local provider only. Manual fallback stays.' },
    { key: 'C', label: 'CCL', detail: 'Only after quality and guardrails hold.' },
  ],
  proofChecklist: [
    'No public IP.',
    'Private route only.',
    'No prompt or completion logging.',
    'No Azure OpenAI fallback for privileged flows.',
    'Model licence recorded before production.',
    'Manual workflow if local model is unhealthy.',
  ],
};

type ProjectPanelId = 'models' | 'rollout' | 'cost' | 'zdr';

const PROJECT_PANEL_IDS: ProjectPanelId[] = ['models', 'rollout', 'cost', 'zdr'];

function parseReleaseCards(markdown: string): ReleaseCard[] {
  return markdown.split('\n').reduce<ReleaseCard[]>((entries, line) => {
    const match = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*\/\s*([^/]+?)(?:\s*\/\s*(.*))?\s*$/);
    if (!match) return entries;
    const title = (match[2] || '').trim();
    if (!title) return entries;
    entries.push({ date: match[1], title, details: (match[3] || '').trim() || undefined });
    return entries;
  }, []).slice(0, 8);
}

function statusColour(status: string): string {
  if (status.includes('🟢')) return colours.green;
  if (status.includes('🟠') || status.includes('🟡')) return colours.orange;
  if (status.includes('🔴')) return colours.cta;
  return colours.accent;
}

const ArchitectureDiagram: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const fill = isDarkMode ? '#1f242c' : '#ffffff';
  const text = isDarkMode ? '#e7eaf0' : '#1f2937';
  const muted = isDarkMode ? '#9aa3b2' : '#6b7280';
  const accent = colours.accent;
  const blue = colours.blue;
  const green = colours.green;
  const orange = colours.orange;
  const cta = colours.cta;
  const vnetStroke = isDarkMode ? '#3a4d6b' : '#b6c8e0';
  const vnetFill = isDarkMode ? 'rgba(54, 144, 206, 0.07)' : 'rgba(54, 144, 206, 0.05)';
  const subnetStroke = isDarkMode ? '#4a5a47' : '#c4d6bf';
  const subnetFill = isDarkMode ? 'rgba(32, 178, 108, 0.08)' : 'rgba(32, 178, 108, 0.05)';

  const Box: React.FC<{
    x: number; y: number; w: number; h: number; title: string; sub?: string; accent: string; pillLabel?: string;
  }> = ({ x, y, w, h, title, sub, accent: boxAccent, pillLabel }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={boxAccent} strokeWidth={1.5} />
      <rect x={x} y={y} width={4} height={h} fill={boxAccent} />
      <text x={x + 12} y={y + 20} fontFamily="Raleway, sans-serif" fontSize={11} fontWeight={900} fill={text}>{title}</text>
      {sub ? (
        <text x={x + 12} y={y + 36} fontFamily="Raleway, sans-serif" fontSize={10} fill={muted}>{sub}</text>
      ) : null}
      {pillLabel ? (
        <g>
          <rect x={x + w - 56} y={y + 6} width={48} height={14} fill={`${boxAccent}22`} stroke={boxAccent} />
          <text x={x + w - 32} y={y + 16} fontFamily="Raleway, sans-serif" fontSize={8} fontWeight={900} fill={boxAccent} textAnchor="middle">{pillLabel}</text>
        </g>
      ) : null}
    </g>
  );

  const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; label?: string; colour?: string; dashed?: boolean; labelAbove?: boolean }> = ({ x1, y1, x2, y2, label, colour = muted, dashed, labelAbove = true }) => {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={1.5} markerEnd="url(#arrowhead)" strokeDasharray={dashed ? '4 3' : undefined} />
        {label ? (
          <text x={midX} y={labelAbove ? midY - 6 : midY + 14} fontFamily="Raleway, sans-serif" fontSize={9} fontWeight={800} fill={colour} textAnchor="middle">{label}</text>
        ) : null}
      </g>
    );
  };

  const Elbow: React.FC<{ x1: number; y1: number; x2: number; y2: number; colour?: string; dashed?: boolean }> = ({ x1, y1, x2, y2, colour = muted, dashed }) => (
    <g>
      <polyline
        points={`${x1},${y1} ${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`}
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        markerEnd="url(#arrowhead)"
      />
    </g>
  );

  return (
    <svg viewBox="0 0 800 360" width="100%" style={{ display: 'block', marginTop: 8, maxHeight: 400 }} role="img" aria-label="Local LLM architecture diagram">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 z" fill={muted} />
        </marker>
      </defs>

      {/* Lane labels (left margin) */}
      <text x={10} y={62} fontFamily="Raleway, sans-serif" fontSize={9} fontWeight={900} fill={muted} letterSpacing="0.6">
        ADMIN LANE
      </text>
      <text x={10} y={192} fontFamily="Raleway, sans-serif" fontSize={9} fontWeight={900} fill={muted} letterSpacing="0.6">
        APP LANE
      </text>

      {/* VNet container: wraps Bastion + InferenceSubnet */}
      <rect x={235} y={40} width={550} height={280} fill={vnetFill} stroke={vnetStroke} strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={247} y={58} fontFamily="Raleway, sans-serif" fontSize={10} fontWeight={900} fill={blue} letterSpacing="0.5">
        instructions_vnet (UK South, private)
      </text>

      {/* InferenceSubnet: wraps PE + VM + Model only */}
      <rect x={245} y={185} width={530} height={125} fill={subnetFill} stroke={subnetStroke} strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={257} y={202} fontFamily="Raleway, sans-serif" fontSize={10} fontWeight={900} fill={green} letterSpacing="0.5">
        InferenceSubnet (NSG locked, no public IP)
      </text>

      {/* === ADMIN LANE (top, y 70-130) === */}
      <Box x={20} y={70} w={150} h={60} title="Admin (LZ)" sub="Entra identity" accent={orange} />
      <Box x={255} y={70} w={160} h={60} title="Azure Bastion" sub="browser SSH only" accent={orange} pillLabel="No SSH" />

      {/* === APP LANE (bottom, y 215-285) === */}
      <Box x={20} y={215} w={150} h={70} title="Helix Hub" sub="server + AI gateway" accent={accent} />
      <Box x={255} y={215} w={150} h={70} title="Private endpoint" sub="OpenAI-compatible" accent={blue} />
      <Box x={445} y={215} w={155} h={70} title="GPU VM (Ubuntu)" sub="vLLM runtime" accent={green} pillLabel="GPU" />
      <Box x={630} y={215} w={130} h={70} title="Model" sub="Phi → Llama" accent={accent} />

      {/* === ARROWS: no crossings === */}
      {/* Admin lane: Admin → Bastion */}
      <Arrow x1={170} y1={100} x2={255} y2={100} label="sign-in" colour={orange} />

      {/* Admin descends to GPU VM via L-shape (clean orthogonal, no crossing) */}
      <Elbow x1={335} y1={130} x2={522} y2={215} colour={orange} dashed />
      <text x={428} y={167} fontFamily="Raleway, sans-serif" fontSize={9} fontWeight={800} fill={orange} textAnchor="middle">admin only</text>

      {/* App lane: Hub → PE → VM → Model (all horizontal at y=250) */}
      <Arrow x1={170} y1={250} x2={255} y2={250} label="HTTPS (private)" colour={blue} />
      <Arrow x1={405} y1={250} x2={445} y2={250} colour={green} />
      <Arrow x1={600} y1={250} x2={630} y2={250} colour={accent} />

      {/* Forbidden path bar: bottom margin */}
      <g>
        <line x1={245} y1={340} x2={775} y2={340} stroke={cta} strokeWidth={1.5} strokeDasharray="3 3" />
        <text x={510} y={354} fontFamily="Raleway, sans-serif" fontSize={9} fontWeight={900} fill={cta} textAnchor="middle">
          No public egress  ·  no Azure OpenAI fallback  ·  no prompt or completion logging
        </text>
      </g>
    </svg>
  );
};

const EyeOffIcon: React.FC<{ colour: string }> = ({ colour }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M3 3l18 18" stroke={colour} strokeWidth="2" strokeLinecap="round" />
    <path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" stroke={colour} strokeWidth="2" strokeLinecap="round" />
    <path d="M9.88 5.08A9.7 9.7 0 0112 4c5 0 8.5 4.5 9.5 8a11.6 11.6 0 01-2.18 3.77" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.11 6.11C4.25 7.47 3 9.65 2.5 12c1 3.5 4.5 8 9.5 8a9.7 9.7 0 004.2-.96" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RevealPanel: React.FC<{
  id: string;
  title: string;
  note: string;
  isOpen: boolean;
  isDarkMode: boolean;
  accent: string;
  borderColour: string;
  cardBg: string;
  mutedColour: string;
  textColour: string;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, title, note, isOpen, isDarkMode, accent, borderColour, cardBg, mutedColour, textColour, onToggle, children }) => (
  <section
    data-helix-region={`system/projects/local-llm/${id}`}
    style={{
      position: 'relative',
      border: `1px solid ${borderColour}`,
      borderLeft: `3px solid ${accent}`,
      background: cardBg,
      padding: 12,
      minHeight: 118,
      overflow: 'hidden',
    }}
  >
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      style={{
        width: '100%',
        border: 0,
        background: 'transparent',
        color: textColour,
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        textAlign: 'left',
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      <span>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: accent }}>
          {title}
        </span>
        <span style={{ display: 'block', marginTop: 3, fontSize: 11, lineHeight: 1.45, color: mutedColour }}>
          {note}
        </span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: accent, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
        {!isOpen ? <EyeOffIcon colour={accent} /> : null}
        {isOpen ? 'Hide' : 'Reveal'}
      </span>
    </button>
    <div
      aria-hidden={!isOpen}
      style={{
        marginTop: 10,
        filter: isOpen ? 'none' : 'blur(5px)',
        opacity: isOpen ? 1 : 0.34,
        maxHeight: isOpen ? undefined : 74,
        overflow: 'hidden',
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'filter 0.16s ease, opacity 0.16s ease',
      }}
    >
      {children}
    </div>
    {!isOpen ? (
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: 'absolute',
          inset: 0,
          border: 0,
          background: isDarkMode ? 'rgba(10, 15, 22, 0.46)' : 'rgba(255, 255, 255, 0.52)',
          color: accent,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Raleway, sans-serif',
          fontSize: 11,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: `1px solid ${accent}`, background: isDarkMode ? 'rgba(0, 0, 0, 0.42)' : 'rgba(255, 255, 255, 0.82)' }}>
          <EyeOffIcon colour={accent} />
          Click to reveal
        </span>
      </button>
    ) : null}
  </section>
);

const ProjectOptionCard: React.FC<{
  label: string;
  eyebrow: string;
  note: string;
  meta: string;
  accent: string;
  isDarkMode: boolean;
  borderColour: string;
  cardBg: string;
  mutedColour: string;
  textColour: string;
  onClick?: () => void;
}> = ({ label, eyebrow, note, meta, accent, borderColour, cardBg, mutedColour, textColour, onClick }) => {
  const enabled = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      style={{
        minHeight: 132,
        border: `1px solid ${borderColour}`,
        borderLeft: `3px solid ${accent}`,
        background: cardBg,
        color: textColour,
        cursor: enabled ? 'pointer' : 'default',
        padding: 16,
        textAlign: 'left',
        fontFamily: 'Raleway, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <span>
        <span style={{ display: 'block', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.6px', color: accent }}>
          {eyebrow}
        </span>
        <span style={{ display: 'block', marginTop: 5, fontSize: 19, fontWeight: 900, lineHeight: 1.15, color: textColour }}>
          {label}
        </span>
        <span style={{ display: 'block', marginTop: 6, fontSize: 12, lineHeight: 1.45, color: mutedColour }}>
          {note}
        </span>
      </span>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>
        <span>{meta}</span>
        {enabled ? <span style={{ color: accent }}>Open</span> : <span>Card only</span>}
      </span>
    </button>
  );
};

const SystemProjectsView: React.FC<SystemProjectsViewProps> = ({ isDarkMode, viewerInitials, isDevOwner, onBack, onOpenDashboard, onOpenInfrastructure }) => {
  const { textColour, mutedColour, borderColour, cardBg } = useSystemTokens(isDarkMode);
  const accent = colours.accent;
  const [surface, setSurface] = useState<ProjectsSurface>('overview');
  const [openPanels, setOpenPanels] = useState<Set<ProjectPanelId>>(() => new Set());
  const [stashCards, setStashCards] = useState<StashCard[]>([]);
  const [stashLoading, setStashLoading] = useState(true);
  const [stashError, setStashError] = useState<string | null>(null);
  const [releaseCards, setReleaseCards] = useState<ReleaseCard[]>([]);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const allPanelsOpen = openPanels.size === PROJECT_PANEL_IDS.length;
  const togglePanel = (panelId: ProjectPanelId) => {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  };
  const showAllPanels = () => setOpenPanels(new Set(PROJECT_PANEL_IDS));
  const hideAllPanels = () => setOpenPanels(new Set());
  const panelOpen = useMemo(() => ({
    models: openPanels.has('models'),
    rollout: openPanels.has('rollout'),
    cost: openPanels.has('cost'),
    zdr: openPanels.has('zdr'),
  }), [openPanels]);
  const viewer = (viewerInitials || '').toString().toUpperCase().trim();
  const authQuery = viewer ? `?initials=${encodeURIComponent(viewer)}` : '';
  const authHeaders: Record<string, string> = viewer ? { 'x-user-initials': viewer } : {};

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setStashLoading(true);
        const res = await fetch(`/api/stash-briefs/cards${authQuery}`, { headers: authHeaders });
        if (!res.ok) throw new Error(`Stash cards HTTP ${res.status}`);
        const json = await res.json();
        if (!disposed) {
          setStashCards(Array.isArray(json?.items) ? json.items : []);
          setStashError(null);
        }
      } catch (err) {
        if (!disposed) setStashError(err instanceof Error ? err.message : 'Failed to load stash cards');
      } finally {
        if (!disposed) setStashLoading(false);
      }
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setReleaseLoading(true);
        const res = await fetch('/api/release-notes');
        if (!res.ok) throw new Error(`Release notes HTTP ${res.status}`);
        const markdown = await res.text();
        if (!disposed) {
          setReleaseCards(parseReleaseCards(markdown));
          setReleaseError(null);
        }
      } catch (err) {
        if (!disposed) setReleaseError(err instanceof Error ? err.message : 'Failed to load changelog');
      } finally {
        if (!disposed) setReleaseLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, []);

  const visibleStashCards = useMemo(
    () => stashCards.filter((card) => !card.shipped && card.id !== LOCAL_LLM_PROJECT.id),
    [stashCards],
  );

  return (
    <section data-helix-region="system/projects">
      <SystemPageHeader
        eyebrow="System"
        title="Projects"
        isDarkMode={isDarkMode}
        onBack={onBack}
        onOpenDashboard={onOpenDashboard}
      />

      <SystemIntroPanel
        eyebrow="Reference"
        title="Active projects"
        description="Cards first. Full project and stash detail stays with Luke."
        isDarkMode={isDarkMode}
        accent={accent}
        dataRegion="system/projects/intro"
      />

      {surface !== 'overview' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <HeaderButton label="Projects" isDarkMode={isDarkMode} onClick={() => setSurface('overview')} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <HeaderButton label="Stashes" isDarkMode={isDarkMode} accent={colours.orange} onClick={() => setSurface('stashes')} />
            <HeaderButton label="Changelog" isDarkMode={isDarkMode} accent={colours.green} onClick={() => setSurface('changelog')} />
          </div>
        </div>
      ) : null}

      {surface === 'overview' ? (
        <>
          <SystemModuleSection
            label="Projects"
            description="Higher-order work. Direction of travel, not every parked brief."
            accent={accent}
            dataRegion="system/projects/options"
            isDarkMode={isDarkMode}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <ProjectOptionCard
                label="Local LLM"
                eyebrow="Project"
                note="Private reasoning path. Local PC proof first, Azure GPU only after value is clear."
                meta={isDevOwner ? 'full view' : 'card only'}
                accent={colours.blue}
                isDarkMode={isDarkMode}
                borderColour={borderColour}
                cardBg={cardBg}
                mutedColour={mutedColour}
                textColour={textColour}
                onClick={isDevOwner ? () => setSurface('local-llm') : undefined}
              />
            </div>
          </SystemModuleSection>

          <SystemModuleSection
            label="Stash queue"
            description="Parked work. Useful for the conversation, not promoted to project tier yet."
            accent={colours.orange}
            dataRegion="system/projects/stash-entry"
            isDarkMode={isDarkMode}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <ProjectOptionCard
                label="Stashes"
                eyebrow="Queue"
                note={stashLoading ? 'Loading parked work.' : `${visibleStashCards.length} open cards. Local LLM promoted above this list.`}
                meta={isDevOwner ? 'full stash view' : 'cards only'}
                accent={colours.orange}
                isDarkMode={isDarkMode}
                borderColour={borderColour}
                cardBg={cardBg}
                mutedColour={mutedColour}
                textColour={textColour}
                onClick={() => setSurface('stashes')}
              />
              <ProjectOptionCard
                label="Changelog"
                eyebrow="Shipped"
                note={releaseLoading ? 'Loading recent change cards.' : `${releaseCards.length} recent entries. Useful when explaining what has moved.`}
                meta="release cards"
                accent={colours.green}
                isDarkMode={isDarkMode}
                borderColour={borderColour}
                cardBg={cardBg}
                mutedColour={mutedColour}
                textColour={textColour}
                onClick={() => setSurface('changelog')}
              />
            </div>
            {stashError ? <div style={{ marginTop: 10, fontSize: 12, color: colours.cta }}>{stashError}</div> : null}
            {releaseError ? <div style={{ marginTop: 10, fontSize: 12, color: colours.cta }}>{releaseError}</div> : null}
          </SystemModuleSection>
        </>
      ) : null}

      {surface === 'local-llm' && isDevOwner ? (
      <SystemModuleSection
        label={LOCAL_LLM_PROJECT.title}
        description={LOCAL_LLM_PROJECT.eyebrow}
        accent={accent}
        dataRegion="system/projects/local-llm"
        isDarkMode={isDarkMode}
      >
        {/* Header strip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StatusPill tone={LOCAL_LLM_PROJECT.status} isDarkMode={isDarkMode} />
            <span style={{ fontSize: 11, fontWeight: 700, color: mutedColour }}>
              Brief: <code style={{ fontSize: 11, fontWeight: 700, color: textColour }}>{LOCAL_LLM_PROJECT.briefPath}</code>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <HeaderButton label={allPanelsOpen ? 'Hide all' : 'Show all'} isDarkMode={isDarkMode} accent={colours.blue} onClick={allPanelsOpen ? hideAllPanels : showAllPanels} />
            {onOpenInfrastructure ? (
              <HeaderButton label="Open infrastructure" isDarkMode={isDarkMode} accent={accent} onClick={onOpenInfrastructure} />
            ) : null}
          </div>
        </div>

        <section
          data-helix-region="system/projects/local-llm/diagram"
          style={{
            border: `1px solid ${borderColour}`,
            borderLeft: `3px solid ${colours.blue}`,
            background: cardBg,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ minWidth: 240, flex: '1 1 360px' }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: colours.blue }}>
                Architecture
              </div>
              <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.45, color: mutedColour }}>
                {LOCAL_LLM_PROJECT.summary}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {PROJECT_PANEL_IDS.map((panelId) => (
                <button
                  key={panelId}
                  type="button"
                  onClick={() => togglePanel(panelId)}
                  style={{
                    border: `1px solid ${openPanels.has(panelId) ? accent : borderColour}`,
                    background: openPanels.has(panelId) ? `${accent}18` : 'transparent',
                    color: openPanels.has(panelId) ? accent : mutedColour,
                    padding: '6px 8px',
                    borderRadius: 0,
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: 10,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {!openPanels.has(panelId) ? <EyeOffIcon colour={mutedColour} /> : null}
                  {panelId === 'zdr' ? 'ZDR' : panelId}
                </button>
              ))}
            </div>
          </div>
          <ArchitectureDiagram isDarkMode={isDarkMode} />
        </section>

        {openPanels.size > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 12 }}>
            {panelOpen.models ? (
              <RevealPanel id="models" title="Models" note="Phi to prove the loop. Llama if worth it." isOpen={panelOpen.models} isDarkMode={isDarkMode} accent={accent} borderColour={borderColour} cardBg={cardBg} mutedColour={mutedColour} textColour={textColour} onToggle={() => togglePanel('models')}>
                <ul style={{ margin: '0', paddingLeft: 0, listStyle: 'none', color: textColour, fontSize: 12, lineHeight: 1.5 }}>
                  {LOCAL_LLM_PROJECT.modelLadder.map((model) => (
                    <li key={model.name} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px dashed ${borderColour}` }}>
                      <div style={{ fontWeight: 900, color: textColour }}>{model.name}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{model.role}</div>
                      <div style={{ marginTop: 3, color: mutedColour }}>{model.note}</div>
                    </li>
                  ))}
                </ul>
              </RevealPanel>
            ) : null}

            {panelOpen.rollout ? (
              <RevealPanel id="rollout" title="Rollout" note="PC first, cloud only after proof." isOpen={panelOpen.rollout} isDarkMode={isDarkMode} accent={colours.green} borderColour={borderColour} cardBg={cardBg} mutedColour={mutedColour} textColour={textColour} onToggle={() => togglePanel('rollout')}>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', color: textColour, fontSize: 12, lineHeight: 1.5 }}>
                  {LOCAL_LLM_PROJECT.phases.map((phase) => (
                    <li key={phase.key} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 900, color: textColour }}>{phase.label}</div>
                      <div style={{ marginTop: 2, color: mutedColour }}>{phase.detail}</div>
                    </li>
                  ))}
                </ul>
              </RevealPanel>
            ) : null}

            {panelOpen.cost ? (
              <RevealPanel id="cost" title="Cost" note="Spend gate. Deallocate. No big VM until useful." isOpen={panelOpen.cost} isDarkMode={isDarkMode} accent={colours.orange} borderColour={borderColour} cardBg={cardBg} mutedColour={mutedColour} textColour={textColour} onToggle={() => togglePanel('cost')}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: textColour }}>
                  <tbody>
                    {LOCAL_LLM_PROJECT.costEnvelope.map((row) => (
                      <tr key={row.item}>
                        <td style={{ padding: '4px 0', color: mutedColour, verticalAlign: 'top', width: '45%' }}>{row.item}</td>
                        <td style={{ padding: '4px 0', fontWeight: 700, verticalAlign: 'top' }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </RevealPanel>
            ) : null}

            {panelOpen.zdr ? (
              <RevealPanel id="zdr" title="ZDR / LPP" note="Hard guardrails. Fail closed." isOpen={panelOpen.zdr} isDarkMode={isDarkMode} accent={colours.cta} borderColour={borderColour} cardBg={cardBg} mutedColour={mutedColour} textColour={textColour} onToggle={() => togglePanel('zdr')}>
                <ul style={{ margin: 0, paddingLeft: 18, color: textColour, fontSize: 12, lineHeight: 1.55 }}>
                  {LOCAL_LLM_PROJECT.proofChecklist.map((item) => (
                    <li key={item} style={{ marginBottom: 4 }}>{item}</li>
                  ))}
                </ul>
              </RevealPanel>
            ) : null}
          </div>
        ) : null}
      </SystemModuleSection>
      ) : null}

      {surface === 'stashes' ? (
        <SystemModuleSection
          label="Stashes"
          description={isDevOwner ? 'Cards plus full dev-owner stash view.' : 'Cards only. Full stash detail stays with Luke.'}
          accent={colours.orange}
          dataRegion="system/projects/stashes"
          isDarkMode={isDarkMode}
        >
          {stashLoading ? (
            <div style={{ fontSize: 12, color: mutedColour }}>Loading stash cards.</div>
          ) : stashError ? (
            <div style={{ fontSize: 12, color: colours.cta }}>{stashError}</div>
          ) : visibleStashCards.length === 0 ? (
            <div style={{ fontSize: 12, color: mutedColour }}>No open stash cards.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, marginBottom: isDevOwner ? 14 : 0 }}>
              {visibleStashCards.map((card) => {
                const cardAccent = statusColour(card.status || '');
                return (
                  <div
                    key={card.id || card.title}
                    data-helix-region={`system/projects/stashes/${card.id || 'brief'}`}
                    style={{
                      border: `1px solid ${borderColour}`,
                      borderLeft: `3px solid ${cardAccent}`,
                      background: cardBg,
                      padding: 12,
                      minHeight: 118,
                      fontFamily: 'Raleway, sans-serif',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: cardAccent, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Stash
                      </div>
                      <div style={{ fontSize: 10, color: mutedColour, fontWeight: 800 }}>{card.status}</div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900, lineHeight: 1.25, color: textColour }}>
                      {card.title}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, color: mutedColour, fontWeight: 800 }}>
                      <span>{card.ageDays == null ? 'unverified age' : `${card.ageDays}d`}</span>
                      <span>{card.touchCount} touches</span>
                      {card.dependencyCount > 0 ? <span>{card.dependencyCount} deps</span> : null}
                      {card.coordinationCount > 0 ? <span>{card.coordinationCount} links</span> : null}
                      {card.conflictCount > 0 ? <span style={{ color: colours.cta }}>{card.conflictCount} conflicts</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {isDevOwner ? (
            <StashedBriefsTitlesPanel isDarkMode={isDarkMode} initials={viewer || null} isDevOwner={isDevOwner} />
          ) : null}
        </SystemModuleSection>
      ) : null}

      {surface === 'changelog' ? (
        <SystemModuleSection
          label="Changelog"
          description="Recent shipped movement. Kept here for direction-of-travel conversations."
          accent={colours.green}
          dataRegion="system/projects/changelog"
          isDarkMode={isDarkMode}
        >
          {releaseLoading ? (
            <div style={{ fontSize: 12, color: mutedColour }}>Loading changelog cards.</div>
          ) : releaseError ? (
            <div style={{ fontSize: 12, color: colours.cta }}>{releaseError}</div>
          ) : releaseCards.length === 0 ? (
            <div style={{ fontSize: 12, color: mutedColour }}>No changelog cards loaded.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {releaseCards.map((entry) => (
                <div
                  key={`${entry.date}-${entry.title}`}
                  style={{
                    border: `1px solid ${borderColour}`,
                    borderLeft: `3px solid ${colours.green}`,
                    background: cardBg,
                    padding: 12,
                    minHeight: 104,
                    fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: colours.green }}>
                    {entry.date}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900, lineHeight: 1.25, color: textColour }}>
                    {entry.title}
                  </div>
                  {entry.details ? (
                    <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.45, color: mutedColour }}>
                      {entry.details}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </SystemModuleSection>
      ) : null}
    </section>
  );
};

export default SystemProjectsView;
