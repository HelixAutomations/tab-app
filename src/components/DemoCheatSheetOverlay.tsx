// src/components/DemoCheatSheetOverlay.tsx
//
// Right-side drawer overlay that holds a presenter cheat sheet for Hub demos.
// Triggered globally by Ctrl+Shift+D (Cmd+Shift+D on Mac). Visible only to
// LZ + AC \u2014 the gate is enforced where it\u2019s mounted in App.tsx.
//
// Intentionally NOT mounted as a System-tab lens because:
//   1. The hero is already running 9 lenses; a 10th risks overflow.
//   2. Six queued briefs touch System tab files \u2014 a lens would guarantee a
//      merge against at least three of them.
//   3. While screen-sharing Hub the presenter wants the crib over the surface
//      they\u2019re demoing, not a separate tab to flip to.
//
// House rules:
//   \u2022 Brand tokens only (Raleway, Helix tokens, borderRadius: 0).
//   \u2022 Accent (#3690CE) is reserved for section anchors / active state.
//   \u2022 No Material / Tailwind defaults.
//   \u2022 Production-safe: this component renders nothing when `enabled` is false.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import {
  DemoSection,
  DemoNotesDepth,
  SECTION_GROUP_LABELS,
  getOrderedSections,
  getSectionAppLinks,
  getSectionNotes,
  hasStaleSections,
} from './demoCheatSheet.data';
import {
  loadOverrides,
  applyOverrides,
  patchSectionOverride,
  resetSectionOverride,
  hasSectionOverride,
  fetchOverridesFromServer,
  pushOverridesToServer,
  type Overrides,
  type SectionOverride,
  type SyncStatus,
} from './demoCheatSheetOverrides';
import DemoCheatSheetEditor from './DemoCheatSheetEditor';

interface TeamMemberLike {
  Initials?: string;
  Email?: string;
  'First Name'?: string;
  Nickname?: string;
}

const STORAGE_SECTION_KEY = 'helix.demoCheatSheet.section';
const STORAGE_WIDTH_KEY = 'helix.demoCheatSheet.width';
const STORAGE_CHECKED_KEY = 'helix.demoCheatSheet.checked';
const STORAGE_DEPTH_KEY = 'helix.demoCheatSheet.depth';
const DEFAULT_WIDTH = 460;
const MIN_WIDTH = 320;
const DEFAULT_NOTES_DEPTH: DemoNotesDepth = 'basic';

function clampWidth(w: number): number {
  if (typeof window === 'undefined') return w;
  const max = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.95));
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(w)));
}

interface Props {
  /** Master gate \u2014 when false the component renders nothing. */
  enabled: boolean;
  /** Presenter Entra ID / initials, shown as a subtle stamp. */
  presenterId?: string;
  /** Team directory — used to resolve initials → email for the share form. */
  teamData?: TeamMemberLike[];
  /** Server-backed allowlist of initials with overlay access. LZ implicit. */
  allowedInitials?: string[];
  /** Called after a grant/revoke succeeds so the host can re-fetch. */
  onAccessChanged?: () => void;
}

/** Returns true when the active element would normally swallow keyboard input. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

const DemoCheatSheetOverlay: React.FC<Props> = ({
  enabled,
  presenterId,
  teamData = [],
  allowedInitials = [],
  onAccessChanged,
}) => {
  const { isDarkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [notesDepth, setNotesDepth] = useState<DemoNotesDepth>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_DEPTH_KEY);
      if (stored === 'basic' || stored === 'detailed') return stored;
    } catch { /* ignore */ }
    return DEFAULT_NOTES_DEPTH;
  });
  const seedSections = useMemo(() => getOrderedSections(), []);
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());
  const overridesRef = useRef<Overrides>(overrides);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  // Explicit-save model: edits buffer in localStorage + state. The pill turns
  // 'local-only' (unsaved) the moment a change happens; pressing Done fires
  // the PUT and flips through 'syncing' → 'synced'. Closing the drawer or
  // collapsing the panel does NOT prompt — only a full page reload does.
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const sections = useMemo(
    () => applyOverrides(seedSections, overrides),
    [seedSections, overrides],
  );
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_DEPTH_KEY, notesDepth); } catch { /* ignore */ }
  }, [notesDepth]);

  // On drawer open, fetch the server copy unless this browser already has
  // unsaved edits. Opening/reloading must never perform a hidden save: only
  // Done is allowed to PUT overrides to the server.
  useEffect(() => {
    if (!open) return;
    // Don't clobber unsaved local edits with the server copy.
    if (dirtyRef.current) return;
    let cancelled = false;
    const viewerInitials = String(presenterId || '').toUpperCase();
    const notesPresenter = viewerInitials === 'LZ' ? viewerInitials : 'LZ';
    if (!notesPresenter) return;
    fetchOverridesFromServer(notesPresenter).then((remote) => {
      if (cancelled) return;
      const remoteHas = remote && Object.keys(remote.sections).length > 0;
      if (remoteHas) {
        overridesRef.current = remote!;
        setOverrides(remote!);
        try {
          window.localStorage.setItem(
            'helix.demoCheatSheet.overrides.v1',
            JSON.stringify(remote),
          );
        } catch { /* ignore */ }
        setSyncStatus('synced');
        return;
      }
      const localOverrides = overridesRef.current;
      const localHas = localOverrides && Object.keys(localOverrides.sections).length > 0;
      if (remote && localHas) {
        dirtyRef.current = true;
        setDirty(true);
        setSyncStatus('local-only');
      } else {
        setSyncStatus(remote ? 'synced' : 'local-only');
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenterId, open]);

  const updateSectionOverride = useCallback((sectionId: string, patch: SectionOverride) => {
    const next = patchSectionOverride(overridesRef.current, sectionId, patch);
    overridesRef.current = next;
    setOverrides(next);
    dirtyRef.current = true;
    setDirty(true);
    setSyncStatus('local-only');
  }, []);
  const clearSectionOverride = useCallback((sectionId: string) => {
    const next = resetSectionOverride(overridesRef.current, sectionId);
    overridesRef.current = next;
    setOverrides(next);
    dirtyRef.current = true;
    setDirty(true);
    setSyncStatus('local-only');
  }, []);

  const saveOverridesToServer = useCallback(async (): Promise<boolean> => {
    const viewerInitials = String(presenterId || '').toUpperCase();
    const notesPresenter = viewerInitials === 'LZ' ? viewerInitials : 'LZ';
    if (!viewerInitials || !notesPresenter) return false;
    setSyncStatus('syncing');
    try {
      const ok = await pushOverridesToServer(notesPresenter, viewerInitials, overridesRef.current);
      if (ok) {
        dirtyRef.current = false;
        setDirty(false);
        setSyncStatus('synced');
        return true;
      } else {
        setSyncStatus('local-only');
        return false;
      }
    } catch {
      setSyncStatus('local-only');
      return false;
    }
  }, [presenterId]);

  const toggleEditing = useCallback(async () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }
    if (dirtyRef.current) {
      const saved = await saveOverridesToServer();
      if (!saved) return;
    }
    setIsEditing(false);
  }, [isEditing, saveOverridesToServer]);

  // Warn before navigating away if there are unsaved server changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message but require returnValue to be set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_SECTION_KEY);
      if (stored && sections.some((s) => s.id === stored)) return stored;
    } catch { /* ignore quota / disabled storage */ }
    return sections[0]?.id ?? '';
  });
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Resizable width — persisted, clamped to 95vw, min 320.
  const [width, setWidth] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_WIDTH_KEY));
      if (Number.isFinite(stored) && stored >= MIN_WIDTH) return clampWidth(stored);
    } catch { /* ignore */ }
    return DEFAULT_WIDTH;
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_WIDTH_KEY, String(width)); } catch { /* ignore */ }
  }, [width]);
  // Re-clamp on viewport resize so it never overflows.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const draggingRef = useRef(false);
  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    let pendingX: number | null = null;
    let rafId = 0;
    const flush = () => {
      rafId = 0;
      if (pendingX == null) return;
      const next = window.innerWidth - pendingX;
      pendingX = null;
      setWidth(clampWidth(next));
    };
    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      pendingX = ev.clientX;
      if (!rafId) rafId = window.requestAnimationFrame(flush);
    };
    const onUp = () => {
      draggingRef.current = false;
      if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  // Persist current section.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_SECTION_KEY, activeId); } catch { /* ignore */ }
  }, [activeId]);

  useEffect(() => {
    if (sections.some((section) => section.id === activeId)) return;
    setActiveId(sections[0]?.id ?? '');
  }, [activeId, sections]);

  // ── Walkthrough checklist ──────────────────────────────────────────────
  // Tickable bullets per section, persisted to localStorage. Key = `${id}#${idx}`.
  // No shortcuts — just a checklist so I can see what I've covered as I go.
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CHECKED_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
    } catch { return new Set(); }
  });
  const toggleChecked = useCallback((key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(STORAGE_CHECKED_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const resetChecklist = useCallback(() => {
    setChecked(new Set());
    try { localStorage.removeItem(STORAGE_CHECKED_KEY); } catch { /* ignore */ }
  }, []);
  const sectionProgress = useCallback((s: DemoSection) => {
    const visibleNotes = getSectionNotes(s, notesDepth);
    let done = 0;
    let total = 0;
    for (let i = 0; i < visibleNotes.length; i += 1) {
      const trimmed = String(visibleNotes[i] || '').trim();
      if (!trimmed || trimmed === '---') continue;
      total += 1;
      if (checked.has(`${s.id}:${notesDepth}#${i}`)) done += 1;
    }
    return { done, total };
  }, [checked, notesDepth]);

  const handleSectionLinkClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const { enquiryId, enquirySubTab, formTitle, reportingView, tab, workbenchTab } = event.currentTarget.dataset;
    try {
      if (enquiryId) {
        window.dispatchEvent(new CustomEvent('navigateToEnquiry', {
          detail: {
            enquiryId,
            subTab: enquirySubTab,
            workbenchTab,
          },
        }));
      } else if (formTitle) {
        window.dispatchEvent(new CustomEvent('navigateToForms', { detail: { formTitle } }));
      } else if (reportingView) {
        window.dispatchEvent(new CustomEvent('navigateToReporting', { detail: { view: reportingView } }));
      } else if (tab) {
        window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab } }));
      }
      setOpen(false);
    } catch {
      setFlash('Navigation failed.');
    }
  }, []);

  // ── Recipient picklist + send / share state ─────────────────────────────
  type Pane = 'none' | 'email' | 'share';
  const [pane, setPane] = useState<Pane>('none');
  const [recipientInitials, setRecipientInitials] = useState<string>('LZ');
  const [customEmail, setCustomEmail] = useState<string>('');
  const [grantInitials, setGrantInitials] = useState<string>('AC');
  const [grantCustom, setGrantCustom] = useState<string>('');
  const [busy, setBusy] = useState<'idle' | 'sending' | 'granting'>('idle');
  const [flash, setFlash] = useState<string | null>(null);

  // Lightweight team lookup: initials \u2192 { name, email }
  const teamLookup = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    for (const m of teamData || []) {
      const initials = String(m?.Initials || '').toUpperCase().trim();
      if (!initials) continue;
      const name = String(m?.Nickname || m?.['First Name'] || initials).trim();
      const email = String(m?.Email || '').trim();
      map.set(initials, { name, email });
    }
    return map;
  }, [teamData]);

  // Curated picklist: prefill Luke, then Alex / Kanchel / Emma, then custom.
  // Fall back to initials-only labels if teamData hasn't loaded.
  const picklistOptions = useMemo(() => {
    const PICKLIST_INITIALS = ['LZ', 'AC', 'KW', 'EA'];
    return PICKLIST_INITIALS.map((i) => {
      const t = teamLookup.get(i);
      return {
        value: i,
        label: t ? `${t.name} (${i})` : i,
        email: t?.email || '',
      };
    });
  }, [teamLookup]);

  const isOwner = String(presenterId || '').toUpperCase() === 'LZ';

  const resolveRecipient = useCallback((): { to: string; label: string } | null => {
    if (recipientInitials === 'CUSTOM') {
      const trimmed = customEmail.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
      return { to: trimmed, label: trimmed };
    }
    const t = teamLookup.get(recipientInitials);
    if (!t || !t.email) return null;
    return { to: t.email, label: `${t.name} <${t.email}>` };
  }, [recipientInitials, customEmail, teamLookup]);

  const buildEmailHtml = useCallback((): string => {
    const escape = (s: string) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const blocks = sections.map((s) => {
      const visibleNotes = getSectionNotes(s, notesDepth);
      const bullets = (items?: string[]) => {
        if (!items || !items.length) return '';
        const groups: string[][] = [];
        let current: string[] = [];
        items.forEach((item) => {
          const trimmed = String(item).trim();
          if (!trimmed || trimmed === '---') {
            if (current.length) {
              groups.push(current);
              current = [];
            }
            return;
          }
          current.push(item);
        });
        if (current.length) groups.push(current);
        if (!groups.length) return '';

        return groups.map((group, idx) => {
          const divider = idx > 0
            ? `<div style="height:1px;margin:10px 8px;background:#d1d5db;opacity:0.7;"></div>`
            : '';
          return divider
            + `<ul style="margin:0 0 0 18px;padding:0;font:400 13px/1.5 Raleway,sans-serif;color:#222;">`
            + group.map((i) => `<li>${escape(i)}</li>`).join('')
            + `</ul>`;
        }).join('');
      };
      const approach = (s.approachLZWhen && s.approachLZWhen.length)
        ? `<div style="border-left:2px solid #FF8C00;background:#FF8C0014;padding:8px 10px;margin-top:10px;font:400 12px/1.45 Raleway,sans-serif;color:#7a3b00;">`
          + `<div style="font-weight:700;margin-bottom:4px;">Approach LZ when</div>`
          + `<ul style="margin:0 0 0 18px;padding:0;">`
          + s.approachLZWhen.map((i) => `<li>${escape(i)}</li>`).join('')
          + `</ul></div>`
        : '';
      const cross = (s.crossApp && s.crossApp.length)
        ? `<p style="margin:10px 0 4px;font:700 11px/1 Raleway,sans-serif;letter-spacing:0.5px;text-transform:uppercase;color:#6B6B6B;">Linked surfaces</p>${bullets(s.crossApp)}`
        : '';
      return `<section style="margin:0 0 22px;">`
        + `<p style="margin:0;font:800 11px/1 Raleway,sans-serif;letter-spacing:0.6px;text-transform:uppercase;color:#3690CE;">Step ${s.order}</p>`
        + `<h2 style="margin:4px 0 8px;font:700 18px/1.2 Raleway,sans-serif;color:#061733;">${escape(s.title)}</h2>`
        + bullets(visibleNotes)
        + approach
        + cross
        + `</section>`;
    }).join('');
    return `<div style="font-family:Raleway,sans-serif;color:#222;max-width:680px;">`
      + `<p style="margin:0 0 18px;font:400 12px/1.4 Raleway,sans-serif;color:#6B6B6B;">Helix Hub demo notes (${escape(notesDepth)}) - sent by ${escape(presenterId || 'LZ')}.</p>`
      + blocks
      + `</div>`;
  }, [notesDepth, presenterId, sections]);

  const sendEmail = useCallback(async () => {
    const recipient = resolveRecipient();
    if (!recipient) {
      setFlash('Pick a recipient or enter a valid email.');
      return;
    }
    setBusy('sending');
    setFlash(null);
    try {
      const res = await fetch('/api/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: recipient.to,
          subject: `Helix Hub - demo notes (${notesDepth})`,
          email_contents: buildEmailHtml(),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      setFlash(`Sent to ${recipient.label}.`);
      setPane('none');
    } catch (err) {
      setFlash(`Send failed: ${(err as Error).message}`);
    } finally {
      setBusy('idle');
    }
  }, [buildEmailHtml, notesDepth, resolveRecipient]);

  const grantOrRevoke = useCallback(async (initials: string, action: 'grant' | 'revoke') => {
    if (!isOwner) return;
    const target = String(initials || '').toUpperCase().trim();
    if (!/^[A-Z]{1,4}$/.test(target)) {
      setFlash('Initials must be 1\u20134 letters.');
      return;
    }
    setBusy('granting');
    setFlash(null);
    try {
      const res = await fetch('/api/demo-cheat-sheet/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterInitials: presenterId, initials: target, action }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      setFlash(action === 'grant' ? `Granted to ${target}. They\u2019ll see it on next refresh.` : `Revoked from ${target}.`);
      onAccessChanged?.();
    } catch (err) {
      setFlash(`${action === 'grant' ? 'Grant' : 'Revoke'} failed: ${(err as Error).message}`);
    } finally {
      setBusy('idle');
    }
  }, [isOwner, presenterId, onAccessChanged]);


  // Global hotkey: Ctrl+Shift+D / Cmd+Shift+D.
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const isToggle = e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === 'D' || e.key === 'd');
      if (isToggle) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    const eventToggle = () => setOpen((prev) => !prev);
    window.addEventListener('keydown', handler);
    window.addEventListener('helix:toggleDemoCheatSheet', eventToggle);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('helix:toggleDemoCheatSheet', eventToggle);
    };
  }, [enabled, open]);

  // Click-outside to dismiss.
  const onBackdropMouseDown = useCallback((e: React.MouseEvent) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  if (!enabled || !open) return null;

  const stale = hasStaleSections(sections);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];
  const activeNotes = active ? getSectionNotes(active, notesDepth) : [];
  const activeAppLinks = active ? getSectionAppLinks(active) : [];

  // ── Tokens ────────────────────────────────────────────────
  const surface = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const border = isDarkMode ? colours.dark.border : colours.light.border;
  const heading = isDarkMode ? colours.dark.text : colours.light.text;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = colours.highlight; // #3690CE \u2014 anchor only.
  const warn = colours.orange;
  const chromeSurface = isDarkMode ? colours.dark.background : '#eef3f8';
  const navSurface = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.82)';
  const raisedSurface = isDarkMode ? 'rgba(8, 28, 48, 0.88)' : '#ffffff';
  const activeSurface = isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(214, 232, 255, 0.92)';
  const activeBorder = isDarkMode ? 'rgba(54, 144, 206, 0.34)' : 'rgba(54, 144, 206, 0.26)';
  const softBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)';
  const panelShadow = isDarkMode ? '0 14px 34px rgba(0,0,0,0.24)' : '0 12px 30px rgba(6,23,51,0.08)';
  const navCardShadow = isDarkMode ? '0 6px 18px rgba(0,0,0,0.18)' : '0 6px 18px rgba(6,23,51,0.06)';

  const wrapStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9000,
    backgroundColor: 'rgba(0, 3, 25, 0.22)',
    display: 'flex',
    justifyContent: 'flex-end',
    fontFamily: 'Raleway, sans-serif',
  };

  const drawerStyle: React.CSSProperties = {
    width,
    maxWidth: '95vw',
    minWidth: MIN_WIDTH,
    height: '100%',
    backgroundColor: surface,
    backgroundImage: isDarkMode
      ? 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 14%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,249,252,0.88) 22%, rgba(238,243,248,0.78) 100%)',
    borderLeft: `1px solid ${softBorder}`,
    boxShadow: '-18px 0 44px rgba(0, 3, 25, 0.42)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    color: heading,
  };

  const headerStyle: React.CSSProperties = {
    padding: '16px 18px 15px 18px',
    borderBottom: `1px solid ${softBorder}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: chromeSurface,
    backgroundImage: isDarkMode
      ? 'linear-gradient(90deg, rgba(54,144,206,0.08) 0%, rgba(54,144,206,0) 42%)'
      : 'linear-gradient(90deg, rgba(214,232,255,0.95) 0%, rgba(214,232,255,0) 46%)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: accent,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: 12,
    color: heading,
    marginTop: 4,
    letterSpacing: '0.1px',
  };

  const controlsBarStyle: React.CSSProperties = {
    padding: '12px 18px 14px 18px',
    borderBottom: `1px solid ${softBorder}`,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    backgroundColor: navSurface,
  };

  const controlsClusterStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  };

  const controlsLabelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: muted,
    marginRight: 2,
  };

  const controlButtonStyle = (selected: boolean): React.CSSProperties => ({
    appearance: 'none',
    border: `1px solid ${selected ? activeBorder : softBorder}`,
    backgroundColor: selected ? activeSurface : raisedSurface,
    color: selected ? heading : body,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.2px',
    padding: '6px 10px',
    borderRadius: 0,
    cursor: 'pointer',
    boxShadow: selected ? navCardShadow : 'none',
  });

  const controlsMetaStyle: React.CSSProperties = {
    flex: '1 1 100%',
    fontSize: 11,
    color: body,
    lineHeight: 1.45,
  };

  const closeBtnStyle: React.CSSProperties = {
    appearance: 'none',
    border: `1px solid ${softBorder}`,
    backgroundColor: raisedSurface,
    color: body,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    padding: '6px 10px',
    borderRadius: 0,
    cursor: 'pointer',
    boxShadow: 'none',
  };

  const staleBannerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 18px',
    fontSize: 11,
    fontWeight: 700,
    color: warn,
    backgroundColor: isDarkMode ? `${warn}1A` : `${warn}14`,
    borderBottom: `1px solid ${softBorder}`,
  };

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    display: 'grid',
    gridTemplateColumns: '208px 1fr',
    minHeight: 0,
    backgroundColor: chromeSurface,
  };

  const navStyle: React.CSSProperties = {
    borderRight: `1px solid ${softBorder}`,
    overflowY: 'auto',
    padding: '12px 0 14px 0',
    backgroundColor: navSurface,
  };

  const detailStyle: React.CSSProperties = {
    overflowY: 'auto',
    padding: '18px 18px 24px 18px',
    backgroundColor: chromeSurface,
  };

  const navItem = (s: DemoSection): React.CSSProperties => {
    const isActive = s.id === active?.id;
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '10px 12px 12px 12px',
      margin: '0 10px 8px 10px',
      cursor: 'pointer',
      border: `1px solid ${isActive ? activeBorder : 'transparent'}`,
      borderLeft: `3px solid ${isActive ? accent : 'transparent'}`,
      backgroundColor: isActive ? activeSurface : 'transparent',
      color: isActive ? heading : body,
      boxShadow: isActive ? navCardShadow : 'none',
      transition: 'background-color 0.12s, color 0.12s, box-shadow 0.12s',
    };
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    color: accent,
    marginBottom: 4,
  };

  const h2Style: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: heading,
    margin: '0 0 6px 0',
    letterSpacing: '-0.3px',
  };

  const sectionSubtitleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: muted,
    letterSpacing: '0.1px',
    margin: '0 0 12px 0',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: muted,
    margin: '14px 0 6px 0',
  };

  const readinessChip = (tier?: 'ready' | 'settling' | 'not-for-use'): React.CSSProperties | null => {
    if (!tier) return null;
    const map: Record<string, string> = {
      'ready': '#20b26c',
      'settling': '#FF8C00',
      'not-for-use': '#6B6B6B',
    };
    const c = map[tier];
    return {
      display: 'inline-block',
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      padding: '2px 6px',
      background: isDarkMode ? `${c}26` : `${c}1F`,
      color: c,
      marginLeft: 8,
      verticalAlign: 'middle',
    };
  };

  // Audience chip — quiet outlined pill matching Home segmented-control restraint.
  // Omitted audience = visible to all, no chip rendered (avoid noise).
  const audienceChipStyle = (tier: 'admin' | 'user' | 'dev'): React.CSSProperties => {
    const palette: Record<string, string> = {
      admin: accent,                  // #3690CE
      user: isDarkMode ? '#d1d5db' : '#374151',
      dev: colours.cta,               // #D65541 — dev-only is the rare one
    };
    const c = palette[tier];
    return {
      display: 'inline-block',
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      padding: '2px 6px',
      border: `1px solid ${c}`,
      color: c,
      background: 'transparent',
      marginLeft: 6,
      verticalAlign: 'middle',
    };
  };

  const detailCardStyle: React.CSSProperties = {
    border: `1px solid ${softBorder}`,
    backgroundColor: raisedSurface,
    boxShadow: panelShadow,
    padding: '18px 18px 20px 18px',
  };

  const noteButtonStyle = (checked: boolean): React.CSSProperties => ({
    appearance: 'none',
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '10px 12px',
    backgroundColor: checked
      ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(214, 232, 255, 0.72)')
      : navSurface,
    border: `1px solid ${checked ? activeBorder : softBorder}`,
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    boxShadow: checked ? 'none' : navCardShadow,
    transition: 'background-color 0.12s, border-color 0.12s, box-shadow 0.12s',
  });

  const noteDividerStyle: React.CSSProperties = {
    height: 1,
    margin: '10px 4px',
    backgroundColor: softBorder,
  };

  const footerStyle: React.CSSProperties = {
    borderTop: `1px solid ${softBorder}`,
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: chromeSurface,
    flexWrap: 'wrap',
  };

  const footerButtonStyle = (active: boolean): React.CSSProperties => ({
    appearance: 'none',
    border: `1px solid ${active ? activeBorder : softBorder}`,
    backgroundColor: active ? accent : raisedSurface,
    color: active ? '#fff' : body,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    padding: '6px 10px',
    borderRadius: 0,
    cursor: 'pointer',
    boxShadow: active ? navCardShadow : 'none',
  });

  const appLinkButtonStyle: React.CSSProperties = {
    appearance: 'none',
    border: `1px solid ${activeBorder}`,
    backgroundColor: navSurface,
    color: heading,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    padding: '7px 10px',
    borderRadius: 0,
    cursor: 'pointer',
    boxShadow: navCardShadow,
  };

  const utilityPaneStyle: React.CSSProperties = {
    borderTop: `1px solid ${softBorder}`,
    padding: '14px',
    backgroundColor: navSurface,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  };

  const fieldStyle: React.CSSProperties = {
    appearance: 'none',
    fontFamily: 'Raleway, sans-serif',
    fontSize: 13,
    padding: '9px 10px',
    backgroundColor: raisedSurface,
    color: heading,
    border: `1px solid ${softBorder}`,
    borderRadius: 0,
    boxShadow: navCardShadow,
  };

  const primaryActionStyle = (busyState: boolean): React.CSSProperties => ({
    appearance: 'none',
    border: `1px solid ${accent}`,
    backgroundColor: accent,
    color: '#fff',
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    padding: '7px 12px',
    borderRadius: 0,
    cursor: busyState ? 'wait' : 'pointer',
    opacity: busyState ? 0.6 : 1,
    boxShadow: navCardShadow,
  });

  const flashStyle: React.CSSProperties = {
    fontSize: 11,
    color: body,
    flex: 1,
    textAlign: 'right',
    minWidth: 180,
  };

  const overlay = (
    <div
      style={wrapStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Demo notes"
      onMouseDown={onBackdropMouseDown}
    >
      <div ref={drawerRef} style={drawerStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize demo notes"
          onPointerDown={startResize}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 6,
            height: '100%',
            cursor: 'ew-resize',
            background: 'transparent',
            zIndex: 2,
          }}
        />
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>Implementation Notes</div>
            <div style={subtitleStyle}>{teamLookup.get(String(presenterId || '').toUpperCase())?.name || presenterId || ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(syncStatus === 'syncing' || syncStatus === 'synced' || syncStatus === 'local-only' || syncStatus === 'error') && (
              <span
                title={
                  syncStatus === 'syncing' ? 'Saving to server…'
                  : syncStatus === 'synced' ? 'Saved to server. Edits will follow you across machines.'
                  : syncStatus === 'local-only' ? (dirty ? 'Unsaved changes. Use Save notes to push them to the server.' : 'Server unreachable. Edits are saved on this device only.')
                  : 'Save error'
                }
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  border: `1px solid ${
                    syncStatus === 'synced' ? '#20b26c'
                    : syncStatus === 'local-only' ? colours.orange
                    : syncStatus === 'error' ? colours.cta
                    : softBorder
                  }`,
                  color:
                    syncStatus === 'synced' ? '#20b26c'
                    : syncStatus === 'local-only' ? colours.orange
                    : syncStatus === 'error' ? colours.cta
                    : body,
                  backgroundColor: raisedSurface,
                }}
              >
                {syncStatus === 'syncing' ? 'saving'
                  : syncStatus === 'synced' ? 'saved to server'
                    : syncStatus === 'local-only' ? (dirty ? 'unsaved changes' : 'local only')
                      : 'save error'}
              </span>
            )}
            <button
              type="button"
              disabled={syncStatus === 'syncing'}
              style={{
                ...closeBtnStyle,
                background: isEditing ? (dirty ? colours.orange : accent) : 'transparent',
                color: isEditing ? '#fff' : muted,
                borderColor: isEditing ? (dirty ? colours.orange : accent) : border,
                cursor: syncStatus === 'syncing' ? 'default' : 'pointer',
              }}
              onClick={toggleEditing}
              aria-pressed={isEditing}
              title={isEditing ? (dirty ? 'Save notes and stop editing' : 'Stop editing notes') : 'Edit notes'}
            >
              {syncStatus === 'syncing' ? 'Saving…' : isEditing ? (dirty ? 'Save notes' : 'Done editing') : 'Edit notes'}
            </button>
            <button type="button" style={closeBtnStyle} onClick={() => setOpen(false)} aria-label="Close implementation notes panel" title="Close implementation notes panel">
              Close panel
            </button>
          </div>
        </div>

        <div style={controlsBarStyle}>
          <div style={controlsClusterStyle}>
            <span style={controlsLabelStyle}>Depth</span>
            {(['basic', 'detailed'] as const).map((depth) => (
              <button
                key={depth}
                type="button"
                onClick={() => setNotesDepth(depth)}
                aria-pressed={depth === notesDepth}
                style={controlButtonStyle(depth === notesDepth)}
              >
                {depth === 'basic' ? 'Basic' : 'Detailed'}
              </button>
            ))}
          </div>
        </div>

        {stale && (
          <div style={staleBannerStyle}>
            <span style={{ fontWeight: 800 }}>!</span>
            <span>Stale &gt; 14d</span>
          </div>
        )}

        <div style={bodyStyle}>
          <nav style={navStyle} aria-label="Demo notes sections">
            {sections.map((s, i) => {
              const prog = sectionProgress(s);
              const allDone = prog.total > 0 && prog.done === prog.total;
              const pct = prog.total === 0 ? 0 : Math.round((prog.done / prog.total) * 100);
              const isActive = s.id === active?.id;
              const currentGroup = s.group ?? 'flow';
              const prevGroup = i === 0 ? null : (sections[i - 1].group ?? 'flow');
              const showDivider = currentGroup !== prevGroup;
              return (
              <React.Fragment key={s.id}>
                {showDivider && (
                  <div style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    color: muted,
                    padding: i === 0 ? '0 12px 6px 12px' : '14px 12px 6px 12px',
                    marginTop: i === 0 ? 0 : 4,
                    borderTop: i === 0 ? 'none' : `1px solid ${softBorder}`,
                    paddingTop: i === 0 ? 0 : 10,
                  }}>{SECTION_GROUP_LABELS[currentGroup]}</div>
                )}
              <div
                role="button"
                tabIndex={0}
                style={navItem(s)}
                onClick={() => setActiveId(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveId(s.id);
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: '0.6px',
                    color: isActive ? accent : muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{String(s.order).padStart(2, '0')}</span>
                  {s.readiness && (
                    <span style={{
                      ...(readinessChip(s.readiness) as React.CSSProperties),
                      marginLeft: 0,
                    }}>{s.readiness === 'not-for-use' ? 'not for use' : s.readiness}</span>
                  )}
                </div>
                <span style={{
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 600,
                  lineHeight: 1.25,
                  color: isActive ? heading : body,
                  letterSpacing: '-0.05px',
                  wordBreak: 'normal',
                  overflowWrap: 'break-word',
                }}>{s.title}</span>
                {prog.total > 0 && (
                  <div style={{
                    height: 2,
                    width: '100%',
                    background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    marginTop: 2,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: allDone ? '#20b26c' : accent,
                      transition: 'width 0.18s',
                    }} />
                  </div>
                )}
              </div>
              </React.Fragment>
              );
            })}
          </nav>

          <div style={detailStyle}>
            {active && isEditing && (
              <div style={detailCardStyle}>
                <DemoCheatSheetEditor
                  section={active}
                  isDarkMode={isDarkMode}
                  onChange={(patch) => updateSectionOverride(active.id, patch)}
                  onResetSection={() => clearSectionOverride(active.id)}
                  hasOverride={hasSectionOverride(overrides, active.id)}
                />
              </div>
            )}
            {active && !isEditing && (
              <div style={detailCardStyle}>
                <div style={sectionTitleStyle}>Step {active.order}</div>
                <h2 style={h2Style}>{active.title}</h2>
                {active.subtitle && (
                  <div style={sectionSubtitleStyle}>{active.subtitle}</div>
                )}
                {((active.readiness) || (active.audience && active.audience.length > 0 && active.audience.length < 3)) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 14, marginBottom: 14 }}>
                    {active.readiness && (
                      <span style={{ ...(readinessChip(active.readiness) as React.CSSProperties), marginLeft: 0 }}>
                        {active.readiness === 'not-for-use' ? 'not for use' : active.readiness}
                      </span>
                    )}
                    {active.audience && active.audience.length > 0 && active.audience.length < 3 && (
                      active.audience.map((a) => (
                        <span key={a} style={{ ...audienceChipStyle(a), marginLeft: 0 }} title={`Audience: ${a}`}>{a}</span>
                      ))
                    )}
                  </div>
                )}

                {activeNotes.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: '6px 0 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeNotes.map((line, i) => {
                      const trimmed = line.trim();
                      if (trimmed === '---' || trimmed === '') {
                        return (
                          <li key={i} aria-hidden="true" style={noteDividerStyle} />
                        );
                      }
                      const key = `${active.id}:${notesDepth}#${i}`;
                      const isOn = checked.has(key);
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isOn}
                            onClick={() => toggleChecked(key)}
                            style={noteButtonStyle(isOn)}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 14,
                                height: 14,
                                flexShrink: 0,
                                marginTop: 2,
                                border: `1px solid ${isOn ? accent : border}`,
                                background: isOn ? accent : 'transparent',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 2,
                                boxShadow: isOn ? 'none' : navCardShadow,
                                transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s',
                              }}
                            >
                              {isOn && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                            <span style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 13,
                              lineHeight: 1.55,
                              color: isOn ? muted : body,
                              textDecoration: isOn ? 'line-through' : 'none',
                            }}>{line}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {activeAppLinks.length > 0 && (
                  <div style={{
                    marginTop: 18,
                    paddingTop: 14,
                    borderTop: `1px dashed ${softBorder}`,
                  }}>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: muted,
                      marginBottom: 8,
                    }}>Open in app</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {activeAppLinks.map((link) => (
                        <button
                          key={`${active.id}:${link.tab}:${link.label}`}
                          type="button"
                          data-enquiry-id={link.enquiryId || ''}
                          data-enquiry-sub-tab={link.enquirySubTab || ''}
                          data-tab={link.tab}
                          data-form-title={link.formTitle || ''}
                          data-reporting-view={link.reportingView || ''}
                          data-workbench-tab={link.workbenchTab || ''}
                          onClick={handleSectionLinkClick}
                          style={appLinkButtonStyle}
                          title={`Open ${link.label}`}
                        >
                          {link.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {active.approachLZWhen && active.approachLZWhen.length > 0 && (
                  <div style={{
                    borderLeft: `3px solid ${warn}`,
                    border: `1px solid ${isDarkMode ? 'rgba(255,140,0,0.24)' : 'rgba(255,140,0,0.2)'}`,
                    backgroundColor: isDarkMode ? `${warn}14` : '#fff7ec',
                    padding: '12px 14px',
                    marginTop: 18,
                    color: isDarkMode ? '#fde2c2' : '#7a3b00',
                    fontSize: 12,
                    lineHeight: 1.5,
                    boxShadow: navCardShadow,
                  }}>
                    <div style={{ fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', fontSize: 10, marginBottom: 6 }}>
                      Approach LZ when
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {active.approachLZWhen.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                  </div>
                )}

                {active.crossApp && active.crossApp.length > 0 && (
                  <div style={{
                    marginTop: 20,
                    paddingTop: 14,
                    borderTop: `1px dashed ${softBorder}`,
                  }}>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: muted,
                      marginBottom: 6,
                    }}>Linked surfaces</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {active.crossApp.map((line, i) => (
                        <div key={i} style={{
                          fontSize: 12,
                          fontStyle: 'italic',
                          lineHeight: 1.5,
                          color: body,
                          padding: '8px 10px',
                          backgroundColor: navSurface,
                          borderLeft: `2px solid ${softBorder}`,
                          boxShadow: navCardShadow,
                        }}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer toolbar */}
        <div style={footerStyle}>
          <button
            type="button"
            onClick={() => { setPane(pane === 'email' ? 'none' : 'email'); setFlash(null); }}
            style={footerButtonStyle(pane === 'email')}
          >Email</button>
          <button
            type="button"
            onClick={() => { resetChecklist(); setFlash('Checklist reset'); }}
            title="Clear all ticks across every section"
            style={footerButtonStyle(false)}
          >Reset checklist</button>
          {isOwner && (
            <button
              type="button"
              onClick={() => { setPane(pane === 'share' ? 'none' : 'share'); setFlash(null); }}
              style={footerButtonStyle(pane === 'share')}
            >Share access</button>
          )}
          {flash && (
            <span style={flashStyle}>{flash}</span>
          )}
        </div>

        {/* Email pane */}
        {pane === 'email' && (
          <div style={utilityPaneStyle}>
            <div style={labelStyle}>Send these notes to</div>
            <select
              value={recipientInitials}
              onChange={(e) => setRecipientInitials(e.target.value)}
              style={fieldStyle}
            >
              {picklistOptions.map((o) => (
                <option key={o.value} value={o.value} disabled={!o.email}>
                  {o.label}{!o.email ? ' \u2014 no email on record' : ''}
                </option>
              ))}
              <option value="CUSTOM">Custom email…</option>
            </select>
            {recipientInitials === 'CUSTOM' && (
              <input
                type="email"
                placeholder="name@example.com"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                style={fieldStyle}
              />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={busy === 'sending'}
                onClick={sendEmail}
                style={primaryActionStyle(busy === 'sending')}
              >{busy === 'sending' ? 'Sending…' : 'Send'}</button>
              <button
                type="button"
                onClick={() => setPane('none')}
                style={closeBtnStyle}
              >Cancel</button>
            </div>
          </div>
        )}

        {/* Share-access pane (LZ only) */}
        {pane === 'share' && isOwner && (
          <div style={utilityPaneStyle}>
            <div style={labelStyle}>Currently allowed</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allowedInitials.length === 0 && (
                <span style={{ fontSize: 12, color: muted }}>Just you (LZ).</span>
              )}
              {allowedInitials.map((i) => {
                const t = teamLookup.get(i);
                const label = t ? `${t.name} (${i})` : i;
                const isOwnerRow = i === 'LZ';
                return (
                  <span key={i} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    border: `1px solid ${softBorder}`,
                    backgroundColor: raisedSurface,
                    fontSize: 12,
                    color: heading,
                    boxShadow: navCardShadow,
                  }}>
                    {label}
                    {!isOwnerRow && (
                      <button
                        type="button"
                        onClick={() => grantOrRevoke(i, 'revoke')}
                        disabled={busy === 'granting'}
                        title={`Revoke ${i}`}
                        style={{
                          appearance: 'none',
                          background: 'transparent',
                          border: 'none',
                          color: warn,
                          fontFamily: 'Raleway, sans-serif',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >×</button>
                    )}
                  </span>
                );
              })}
            </div>
            <div style={labelStyle}>Grant access to</div>
            <select
              value={grantInitials}
              onChange={(e) => setGrantInitials(e.target.value)}
              style={fieldStyle}
            >
              {['AC', 'KW', 'EA'].map((i) => {
                const t = teamLookup.get(i);
                return (
                  <option key={i} value={i}>{t ? `${t.name} (${i})` : i}</option>
                );
              })}
              <option value="CUSTOM">Custom initials…</option>
            </select>
            {grantInitials === 'CUSTOM' && (
              <input
                type="text"
                placeholder="e.g. JW"
                maxLength={4}
                value={grantCustom}
                onChange={(e) => setGrantCustom(e.target.value.toUpperCase())}
                style={{
                  ...fieldStyle,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={busy === 'granting'}
                onClick={() => grantOrRevoke(grantInitials === 'CUSTOM' ? grantCustom : grantInitials, 'grant')}
                style={primaryActionStyle(busy === 'granting')}
              >{busy === 'granting' ? 'Granting…' : 'Grant'}</button>
              <button
                type="button"
                onClick={() => setPane('none')}
                style={closeBtnStyle}
              >Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default DemoCheatSheetOverlay;
