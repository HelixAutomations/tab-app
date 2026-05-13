// src/tabs/roadmap/parts/MechanismsPanel.tsx — agent-mechanism register
//
// A visible catalogue of the lightweight agent mechanisms the operator
// otherwise has to remember by heart (stash, sync, health observations,
// stash candidates, changelog, telemetry, frameworks, prompt coach).
//
// Lives on the System tab as the 'mechanisms' lens. Static manifest for
// now — once we have telemetry/usage signals we can layer them in.

import React, { useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';

type Surface = 'chat' | 'system-tab' | 'user-bubble' | 'cli' | 'server';
type Status = 'live' | 'dev-only' | 'planned';

interface Mechanism {
    id: string;
    name: string;
    purpose: string;
    triggers?: string[];
    surfaces: Surface[];
    status: Status;
    docs?: string;
    notes?: string;
}

const MECHANISMS: Mechanism[] = [
    {
        id: 'stash',
        name: 'Stash routine',
        purpose: 'Park scoped work as a self-contained brief any agent can pick up cold. Prevents context loss across sessions.',
        triggers: ['stash this', 'stash this for later', 'park this for another agent', 'shelf this', 'make this a side project'],
        surfaces: ['chat', 'cli'],
        status: 'live',
        docs: '.github/instructions/STASHED_PROJECTS.md',
        notes: 'Briefs land in docs/notes/. INDEX.md is auto-generated. Always run stash-precheck before writing.',
    },
    {
        id: 'sync',
        name: 'Sync submodules',
        purpose: 'Refresh submodule context (instruct-pitch, enquiry-processing-v2) into REALTIME_CONTEXT.md.',
        triggers: ['sync submodules', 'sync context', 'pull latest context', 'refresh submodules'],
        surfaces: ['chat', 'cli'],
        status: 'live',
        docs: 'tools/sync-context.mjs',
    },
    {
        id: 'health-observations',
        name: 'Health Observations',
        purpose: 'Agents silently note codebase health issues (dead imports, oversized files, duplicated logic) and surface them at the end of any code-changing response.',
        surfaces: ['chat'],
        status: 'live',
        docs: '.github/copilot-instructions.md (Continuous Health Observations)',
        notes: 'Capped at 3. Skipped if zero. Machine-readable envelope feeds the suggestions inbox.',
    },
    {
        id: 'stash-candidates',
        name: 'Stash candidates',
        purpose: 'Agents silently spot opportunities for standalone briefs while doing unrelated work. Surfaced as a footer alongside Health Observations.',
        surfaces: ['chat'],
        status: 'live',
        docs: '.github/copilot-instructions.md (Stash candidates)',
        notes: 'Never auto-writes a brief — observations only until the operator says "stash this".',
    },
    {
        id: 'changelog',
        name: 'Changelog logging',
        purpose: 'Every behaviour/UI/server change MUST be appended to logs/changelog.md. Powers the release notes UI.',
        surfaces: ['chat'],
        status: 'live',
        docs: 'logs/changelog.md',
        notes: 'Format: YYYY-MM-DD / Title / Description (~ changed, + added, - deleted). Newest first.',
    },
    {
        id: 'telemetry',
        name: 'App Insights telemetry',
        purpose: 'Every server-side process emits Started/Completed/Failed events plus duration metrics. Catches silent failures and powers ops dashboards.',
        surfaces: ['server'],
        status: 'live',
        docs: '.github/copilot-instructions.md (Application Insights)',
        notes: 'Naming: Component.Entity.Lifecycle. Always trackException AND trackEvent on failures.',
    },
    {
        id: 'comms-frameworks',
        name: 'Communication frameworks',
        purpose: 'Pressure-test outbound text (client emails, internal comms, tasks, feedback, projects) before sending.',
        surfaces: ['user-bubble', 'server'],
        status: 'dev-only',
        docs: 'POST /api/ai/pressure-test-comms · server/prompts/communication-frameworks.js',
        notes: 'Local dev only for now. Lives in UserBubble next to Prompt Coach.',
    },
    {
        id: 'prompt-coach',
        name: 'Prompt Coach',
        purpose: 'Refine a rough operator brief into an agent-ready prompt with scope, conventions, verification, and which mechanisms to invoke.',
        surfaces: ['user-bubble', 'server'],
        status: 'dev-only',
        docs: 'POST /api/ai/prompt-coach/refine · server/prompts/prompt-coach.js',
        notes: 'Local dev / LZ-AC only. Use when no agent is in the loop. In the agent chat loop, the Brief Refinement Protocol replaces this because the agent can read the actual repo.',
    },
    {
        id: 'brief-refinement',
        name: 'Brief Refinement Protocol',
        purpose: 'Agent reads repo, refines a rough brief into a 9-section structured prompt with cited file paths, scores it, then waits for approval before planning. Runs BEFORE Plan-First.',
        triggers: ['(automatic on rough briefs longer than one sentence)'],
        surfaces: ['chat'],
        status: 'live',
        docs: '.github/copilot-instructions.md (Brief Refinement Protocol)',
        notes: 'Skipped for direct one-liners ("fix typo", "rename X") or when the operator says "just do it". This is the agent-loop counterpart to the Prompt Coach API.',
    },
    {
        id: 'session-memory',
        name: 'Session + repo memory',
        purpose: 'Agents store gotchas and conventions in /memories/repo/ so future sessions inherit them automatically.',
        surfaces: ['chat'],
        status: 'live',
        notes: 'See repo memory listing in agent context. Update or remove stale notes.',
    },
    {
        id: 'dev-fast',
        name: 'dev:fast loop',
        purpose: 'npm run dev:fast skips scheduler + event poller (HELIX_LAZY_INIT=1) for snappy UI iteration. Pair with disposeOnHmr / onServerBounced for SSE survival.',
        surfaces: ['cli'],
        status: 'live',
        docs: '.github/instructions/dev-experience.instructions.md',
    },
];

const SURFACE_LABEL: Record<Surface, string> = {
    chat: 'Chat',
    'system-tab': 'System tab',
    'user-bubble': 'User bubble',
    cli: 'CLI',
    server: 'Server',
};

const STATUS_META: Record<Status, { label: string; getColour: (isDarkMode: boolean) => string }> = {
    live: { label: 'Live', getColour: () => colours.green },
    'dev-only': { label: 'Dev only', getColour: (isDarkMode) => isDarkMode ? colours.accent : colours.highlight },
    planned: { label: 'Planned', getColour: () => colours.greyText },
};

const MechanismsPanel: React.FC = () => {
    const { isDarkMode } = useTheme();
    const [filter, setFilter] = useState<'all' | Surface>('all');
    const [query, setQuery] = useState('');

    const surfaces = useMemo<Array<'all' | Surface>>(() => ['all', 'chat', 'user-bubble', 'system-tab', 'cli', 'server'], []);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return MECHANISMS.filter(m => {
            if (filter !== 'all' && !m.surfaces.includes(filter)) return false;
            if (!q) return true;
            const hay = `${m.name} ${m.purpose} ${(m.triggers || []).join(' ')} ${m.notes || ''} ${m.docs || ''}`.toLowerCase();
            return hay.includes(q);
        });
    }, [filter, query]);

    const bg = isDarkMode ? colours.dark.cardBackground : '#fff';
    const border = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
    const textBody = isDarkMode ? '#d1d5db' : '#374151';
    const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
    const sectionBg = isDarkMode ? colours.dark.sectionBackground : colours.grey;

    const chipBase: React.CSSProperties = {
        padding: '5px 12px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        borderRadius: 0,
        border: `1px solid ${border}`,
        fontFamily: 'Raleway, sans-serif',
        background: 'transparent',
        color: textMuted,
        transition: 'all 0.15s ease',
    };

    return (
        <div style={{
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 0,
            fontFamily: 'Raleway, sans-serif',
        }}>
            {/* Header */}
            <div style={{
                padding: '14px 16px',
                borderBottom: `1px solid ${border}`,
                background: sectionBg,
            }}>
                <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                    color: isDarkMode ? colours.accent : colours.highlight,
                    marginBottom: 4,
                }}>Mechanisms register</div>
                <div style={{ fontSize: 13, color: textBody, lineHeight: 1.5 }}>
                    Lightweight agent mechanisms that exist in this codebase. Listed here so they are not silently forgotten as the system grows.
                </div>
            </div>

            {/* Filter row */}
            <div style={{
                padding: '10px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                borderBottom: `1px solid ${border}`,
            }}>
                {surfaces.map(s => {
                    const active = filter === s;
                    return (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setFilter(s)}
                            style={{
                                ...chipBase,
                                background: active ? (isDarkMode ? colours.accent : colours.highlight) : 'transparent',
                                color: active ? (isDarkMode ? colours.dark.background : '#fff') : textMuted,
                                borderColor: active ? (isDarkMode ? colours.accent : colours.highlight) : border,
                            }}
                        >
                            {s === 'all' ? 'All surfaces' : SURFACE_LABEL[s as Surface]}
                        </button>
                    );
                })}
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    style={{
                        marginLeft: 'auto',
                        padding: '6px 10px',
                        fontSize: 12,
                        fontFamily: 'Raleway, sans-serif',
                        color: textPrimary,
                        background: isDarkMode ? colours.darkBlue : '#fff',
                        border: `1px solid ${border}`,
                        borderRadius: 0,
                        outline: 'none',
                        minWidth: 180,
                    }}
                />
            </div>

            {/* Items */}
            <div>
                {visible.length === 0 && (
                    <div style={{ padding: '24px 16px', fontSize: 12, color: textMuted, textAlign: 'center' }}>
                        No mechanisms match this filter.
                    </div>
                )}
                {visible.map((m, idx) => {
                    const status = STATUS_META[m.status];
                    const statusColour = status.getColour(isDarkMode);
                    return (
                        <div
                            key={m.id}
                            style={{
                                padding: '14px 16px',
                                borderBottom: idx === visible.length - 1 ? 'none' : `1px solid ${border}`,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{m.name}</div>
                                <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    letterSpacing: 0.6,
                                    textTransform: 'uppercase',
                                    padding: '2px 6px',
                                    background: statusColour,
                                    color: m.status === 'planned' ? '#fff' : (isDarkMode ? colours.dark.background : '#fff'),
                                    borderRadius: 0,
                                }}>{status.label}</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                    {m.surfaces.map(s => (
                                        <span key={s} style={{
                                            fontSize: 9,
                                            fontWeight: 600,
                                            padding: '2px 6px',
                                            border: `1px solid ${border}`,
                                            color: textMuted,
                                            borderRadius: 0,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0.4,
                                        }}>{SURFACE_LABEL[s]}</span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ fontSize: 12, color: textBody, lineHeight: 1.55, marginBottom: 6 }}>{m.purpose}</div>
                            {m.triggers && m.triggers.length > 0 && (
                                <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, color: textPrimary }}>Trigger phrases: </span>
                                    {m.triggers.map((t, i) => (
                                        <code key={i} style={{
                                            display: 'inline-block',
                                            margin: '0 4px 4px 0',
                                            padding: '1px 6px',
                                            background: sectionBg,
                                            border: `1px solid ${border}`,
                                            color: textBody,
                                            fontSize: 10,
                                            fontFamily: 'Raleway, sans-serif',
                                        }}>{t}</code>
                                    ))}
                                </div>
                            )}
                            {m.docs && (
                                <div style={{ fontSize: 11, color: textMuted, marginBottom: 2 }}>
                                    <span style={{ fontWeight: 600, color: textPrimary }}>Reference: </span>
                                    <code style={{ color: textBody, fontFamily: 'Raleway, sans-serif' }}>{m.docs}</code>
                                </div>
                            )}
                            {m.notes && (
                                <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5, fontStyle: 'italic' }}>{m.notes}</div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{
                padding: '10px 16px',
                borderTop: `1px solid ${border}`,
                background: sectionBg,
                fontSize: 10,
                color: textMuted,
                lineHeight: 1.5,
            }}>
                Static manifest for now. To register a new mechanism, edit <code style={{ fontFamily: 'Raleway, sans-serif' }}>src/tabs/roadmap/parts/MechanismsPanel.tsx</code>.
            </div>
        </div>
    );
};

export default MechanismsPanel;
