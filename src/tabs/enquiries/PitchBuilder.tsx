import React, { useState, useEffect, useRef } from 'react';
import {
  Stack,
  IDropdownOption,
  PrimaryButton,
  DefaultButton,
  mergeStyles,
  Label,
  Icon,
  Callout,
  IconButton,
  Dropdown,
  FocusZone,
  FocusZoneDirection,
  DirectionalHint,
  Separator,
  Checkbox,
  ChoiceGroup,
  IChoiceGroupOption,
  IPoint,
  Text,
  TooltipHost,
} from '@fluentui/react';
import { Enquiry, UserData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { isAdminUser } from '../../app/admin';
import BubbleTextField from '../../app/styles/BubbleTextField';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import PracticeAreaPitch, { PracticeAreaPitchType } from '../../app/customisation/PracticeAreaPitch';
import { TemplateBlock, TemplateOption } from '../../app/customisation/ProductionTemplateBlocks';
import {
  getTemplateBlocks,
  TemplateSet,
  getTemplateSetLabel,
  getDatabaseBlocksData,
  compileBlocks,
} from '../../app/customisation/TemplateBlockSets';
import { availableAttachments, AttachmentOption } from '../../app/customisation/Attachments';
import {
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
  sharedDraftConfirmedButtonStyles,
  inlineOptionButtonStyles,
} from '../../app/styles/ButtonStyles';
import {
  sharedEditorStyle,
  sharedOptionsDropdownStyles,
} from '../../app/styles/FilterStyles';
import { PitchDebugPanel, useLocalFetchLogger } from './pitch-builder';
import EmailSignature from './EmailSignature';
import EditorAndTemplateBlocks from './pitch-builder/EditorAndTemplateBlocks';
import VerificationSummary from './pitch-builder/VerificationSummary';
import OperationStatusToast from './pitch-builder/OperationStatusToast';
import { addDays } from 'date-fns';
import PlaceholderEditorPopover from './pitch-builder/PlaceholderEditorPopover';
import SnippetEditPopover from './pitch-builder/SnippetEditPopover';

import ReactDOMServer from 'react-dom/server';
import { placeholderSuggestions } from '../../app/customisation/InsertSuggestions';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import { isInTeams } from '../../app/functionality/isInTeams';
import {
  convertDoubleBreaksToParagraphs,
  removeUnfilledPlaceholders,
  removeHighlightSpans,
  cleanTemplateString,
  isStringArray,
  replacePlaceholders,
  applyDynamicSubstitutions,
  wrapInsertPlaceholders,
} from './pitch-builder/emailUtils';
import { inputFieldStyle } from '../../CustomForms/BespokeForms';
import { ADDITIONAL_CLIENT_PLACEHOLDER_ID } from '../../constants/deals';
import EmailProcessor from './pitch-builder/EmailProcessor';

// PROOF_OF_ID_URL constant removed - now constructed dynamically with passcode in applyDynamicSubstitutions

// Dynamic import + HMR for ProductionTemplateBlocks
function useDynamicTemplateBlocks(templateSet: TemplateSet) {
  const [blocks, setBlocks] = useState<TemplateBlock[]>(() => getTemplateBlocks(templateSet));
  useEffect(() => {
    let cancelled = false;
    async function loadBlocks() {
      const mod = await import('../../app/customisation/ProductionTemplateBlocks');
      if (!cancelled) {
        // If you export named blocks, adjust as needed
        setBlocks(getTemplateBlocks(templateSet));
      }
    }
    loadBlocks();
    // HMR support
    // @ts-expect-error: HMR property only exists in dev
    if (import.meta && import.meta.hot) {
      // @ts-expect-error: HMR property only exists in dev
      import.meta.hot.accept('../../app/customisation/ProductionTemplateBlocks', (mod: any) => {
        loadBlocks();
      });
      // @ts-expect-error: HMR property only exists in dev
    } else if (typeof module !== 'undefined' && module.hot) {
      // @ts-expect-error: HMR property only exists in dev
      module.hot.accept('../../app/customisation/ProductionTemplateBlocks', () => {
        loadBlocks();
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateSet]);
  return blocks;
}

interface PitchBuilderProps {
  enquiry: Enquiry;
  userData: UserData[] | null;
  showDealCapture?: boolean;
}

// Small typed fetch helper with discriminated result for safer error handling
async function safeFetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<{ ok: true; value: T } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(input as any, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${res.status}`, status: res.status };
    }
    const json = (await res.json()) as T;
    return { ok: true, value: json };
  } catch (err: unknown) {
    return { ok: false, error: (err instanceof Error ? err.message : 'Network error') };
  }
}

interface ApiCallLog {
  id: string;
  ts: Date;
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  snippet?: string;
  error?: string;
}

interface ClientInfo {
  firstName: string;
  lastName: string;
  email: string;
}

// Escape attribute values for use within querySelector
function escapeForSelector(value: string): string {
  if (typeof (window as any).CSS !== 'undefined' && (CSS as any).escape) {
    return (CSS as any).escape(value);
  }
  return value.replace(/(["'\\\[\]\.#:>+~*^$|?{}()])/g, '\\$1');
}

// Inject styles for inline block labels and option callout
if (typeof window !== 'undefined' && !document.getElementById('block-label-style')) {
  const style = document.createElement('style');
  style.id = 'block-label-style';
  style.innerHTML = `
    .block-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: ${colours.greyText};
      margin-top: 8px;
    }
    .block-controls .actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .block-controls .icon-btn {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      background: ${colours.grey};
      color: ${colours.greyText};
      cursor: pointer;
      font-size: 14px;
      user-select: none;
      transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
    }
    .block-controls .icon-btn:hover {
      background: ${colours.blue};
      color: #ffffff;
      transform: scale(1.05);
      }
    .block-label {
      flex-grow: 1;
      position: relative;
      cursor: pointer;
      display: block;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .block-label:hover {
      text-decoration: underline;
      color: ${colours.highlight};
    }
    .block-label:hover::after {
      content: attr(data-selected);
      position: absolute;
      left: 0;
      top: 100%;
      background: ${colours.grey};
      color: ${colours.greyText};
      padding: 2px 6px;
      border-radius: 0;
      white-space: nowrap;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transform: translateY(4px);
      opacity: 0;
      animation: fadeInBlockLabel 0.2s forwards;
      pointer-events: none;
      z-index: 10;
    }
    .block-label-display {
      display: block;
      margin-top: 4px;
      font-size: 10px;
      color: ${colours.greyText};
      opacity: 0.7;
      pointer-events: none;
      user-select: none;
    }
    .option-bubble {
      display: block;
      background: ${colours.highlightNeutral};
      color: ${colours.darkBlue};
      padding: 4px 6px;
      border-radius: 0;
      cursor: pointer;
      font-size: 11px;
      transition: background-color 0.2s;
      margin-bottom: 4px;
    }
    .option-bubble:hover {
      transform: scale(1.05);
      background: ${colours.blue};
    }
    .block-option-list {
      display: inline-block;
      background: ${colours.grey};
      padding: 6px;
      border-radius: 0;
      vertical-align: baseline;
      margin: 0 2px;
    }
    .block-option-list .block-label {
      display: block;
      font-size: 11px;
      margin-bottom: 4px;
      color: ${colours.greyText};
    }
    .option-choice {
      background: ${colours.highlightNeutral};
      color: ${colours.darkBlue};
      padding: 2px 6px;
      border-radius: 0;
      cursor: pointer;
      font-size: 11px;
      transition: background-color 0.2s;
    }
    .option-choice:hover {
      background: ${colours.blue};
    }
    .inline-options-callout {
      border-radius: 0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      animation: fadeInScale 0.2s ease forwards;
      max-width: 280px;
    }
    .option-preview {
      font-size: 11px;
      padding: 0 4px;
      margin-top: 2px;
      display: block;
      text-align: left;
    }
    .selected-block {
      outline: 2px solid ${colours.cta};
      outline-offset: -2px;
    }
    .block-container {
      position: relative;
      display: inline-block;
      width: 100%;
      overflow: hidden;
    }
    .block-main {
      position: relative;
      padding-right: 16px;
    }
    .block-sidebar {
      position: absolute;
      top: 0;
      right: 0;
      width: 260px;
      height: 100%;
      border: 1px solid ${colours.grey};
      padding: 4px 4px 4px 20px;
      border-radius: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: rgba(255,255,255,0.95);
      transform: translateX(calc(100% - 11px));
      transition: transform 0.2s ease;
      pointer-events: none;
      overflow: hidden;
    }
    .block-sidebar .sidebar-handle {
      position: absolute;
      top: 0;
      left: -1px;
      width: 12px;
      height: 100%;
      background: ${colours.grey};
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: -2px 0 4px rgba(0,0,0,0.2);
      border-radius: 4px 0 0 4px;
      pointer-events: auto;
    }
    .block-container:hover .block-sidebar {
      transform: translateX(0);
      pointer-events: auto;
    }
    .block-container:hover,
    .block-container.pinned {
      overflow: visible;
    }
    .block-sidebar.pinned {
      transform: translateX(0);
      pointer-events: auto;
    }
    .block-sidebar .actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .block-sidebar .icon-btn {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      background: ${colours.grey};
      color: ${colours.greyText};
      cursor: pointer;
      font-size: 16px;
      user-select: none;
      transition: background-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
    }
    .block-sidebar .icon-btn:hover {
      background: ${colours.blue};
      color: #ffffff;
      transform: scale(1.05);
    }
    .block-sidebar .icon-btn:active {
      background: ${colours.darkBlue};
      color: #ffffff;
      transform: scale(0.95);
    }
    .block-sidebar .pin-toggle i {
      transition: transform 0.2s ease;
    }
    .block-sidebar .pin-toggle.pinned i {
      transform: rotate(45deg);
    }
    .block-sidebar .overlay-toggle.active {
      background: ${colours.blue};
      color: #ffffff;
    }
    .block-sidebar .option-choices {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .block-container:hover .block-main,
    .block-container.pinned .block-main {
      margin-right: 260px;
    }
    body.sidebar-overlay .block-container:hover .block-main,
    body.sidebar-overlay .block-container.pinned .block-main {
      margin-right: 0;
    }
    body.sidebar-overlay .block-sidebar {
      z-index: 1000;
    }
    .option-choice.selected {
      background: ${colours.blue};
      color: #ffffff;
    }
    .precise-edit {
      background-color: ${colours.highlightBlue} !important;
      color: ${colours.darkBlue} !important;
      padding: 1px 2px;
      border-radius: 2px;
      font-weight: normal;
    }
    .has-edits {
      background: linear-gradient(45deg, ${colours.highlightBlue}22 25%, transparent 25%), 
                  linear-gradient(-45deg, ${colours.highlightBlue}22 25%, transparent 25%), 
                  linear-gradient(45deg, transparent 75%, ${colours.highlightBlue}22 75%), 
                  linear-gradient(-45deg, transparent 75%, ${colours.highlightBlue}22 75%);
      background-size: 4px 4px;
      background-position: 0 0, 0 2px, 2px -2px, -2px 0px;
    }
    .block-edited {
      background-color: ${colours.highlightNeutral} !important;
      border-left: 3px solid ${colours.highlightBlue};
    }
    [data-sentence] {
      display: inline;
      margin: 0;
    }
    .sentence-controls {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-right: 4px;
      vertical-align: middle;
    }
    .sentence-content {
      display: inline;
      margin: 0;
    }
  .insert-placeholder {
    background: ${colours.highlightBlue}20;
    color: ${colours.darkBlue};
    padding: 1px 3px;
    border-radius: 3px;
    border: 1px dotted ${colours.darkBlue}60;
    font-style: italic;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-block;
    max-width: 100%;
    word-wrap: break-word;
    white-space: normal;
    font-size: 0.9em;
    opacity: 0.8;
  }
    .insert-placeholder:hover,
    .insert-placeholder:focus {
      background: ${colours.blue}40;
      color: ${colours.darkBlue};
      border-color: ${colours.blue};
      box-shadow: 0 0 0 2px ${colours.blue}30;
      transform: translateY(-1px);
      outline: none;
      opacity: 1;
    }
    [data-sentence] {
      display: inline;
      margin: 0;
    }
    .snippet-wrapper {
      display: inline;
      margin: 0;
    }
    .sentence-delete {
      margin-right: 4px;
      cursor: pointer;
      user-select: none;
      color: ${colours.red};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.3);
      backdrop-filter: blur(4px);
      border-radius: 0;
      font-size: 12px;
      line-height: 0;
      padding: 0;
      width: 20px;
      min-width: 20px;
      height: 20px;
      min-height: 20px;
      flex-shrink: 0;
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    .sentence-delete:hover {
      background: rgba(255, 255, 255, 0.35);
    }
    .sentence-delete:active {
      background: rgba(255, 255, 255, 0.45);
      color: #ffffff;
    }
    .sentence-handle {
      cursor: grab;
      margin-right: 4px;
      user-select: none;
      color: ${colours.greyText};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.3);
      backdrop-filter: blur(4px);
      border-radius: 0;
      font-size: 12px;
      line-height: 0;
      padding: 0;
      width: 20px;
      min-width: 20px;
      height: 20px;
      min-height: 20px;
      flex-shrink: 0;
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    .sentence-handle:hover {
      background: rgba(255, 255, 255, 0.35);
    }
    .sentence-handle:active {
      cursor: grabbing;
      background: rgba(255, 255, 255, 0.45);
      color: #ffffff;
    }
    .sentence-handle i,
    .sentence-delete i {
      pointer-events: none;
      transition: transform 0.1s ease;
    }
    .sentence-handle:hover i,
    .sentence-delete:hover i {
      transform: scale(1.1);
    }
    .drag-over {
      outline: 2px dashed ${colours.blue};
      background: ${colours.highlightBlue};
      border-radius: 0;
    }
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes fadeInBlockLabel {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

const PitchBuilder: React.FC<PitchBuilderProps> = ({ enquiry, userData, showDealCapture = true }) => {
  /**
   * Ensure any raw passcode (api or fallback) is converted to a 5‑digit numeric string.
   * Rules:
   * 1. If already exactly 5 digits, keep.
   * 2. Else if it contains >=5 digits anywhere, take first 5 digits.
   * 3. Else derive deterministic 5‑digit from FNV-1a hash of (raw+seed).
   */
  function normalizePasscode(raw: string | undefined | null, seed?: string | number): string | null {
    if (!raw) return null;
    if (/^\d{5}$/.test(raw)) return raw;
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 5) return digits.slice(0, 5);
    const source = `${raw}|${seed ?? ''}`;
    let h = 2166136261 >>> 0; // FNV-1a 32-bit
    for (let i = 0; i < source.length; i++) {
      h = Math.imul(h ^ source.charCodeAt(i), 16777619) >>> 0;
    }
    const five = (h % 90000) + 10000; // 10000-99999
    return String(five);
  }
  // Local helper: reveals value + copy on hover; shows only icon by default
  const RevealCopyField: React.FC<{ iconName: string; value: string; color: string; label: string }> = ({ iconName, value, color, label }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    };
    // Subtle tinted background for the icon square
    const iconTint = color === '#3690CE' ? 'rgba(54,144,206,0.15)' : 'rgba(102,102,102,0.15)';
    return (
      <span aria-label={label} title={label} style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8 }}>
        {/* Icon square (left) */}
        <span
          style={{
            width: 28,
            height: 28,
            minWidth: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDarkMode ? 'rgba(255,255,255,0.06)' : iconTint,
            border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e4e8'}`,
            borderRight: 'none', // join with tray
            borderRadius: '6px 0 0 6px',
          }}
        >
          <Icon iconName={iconName} styles={{ root: { color, fontSize: 14 } }} />
        </span>
        {/* Value tray (right) */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: isDarkMode ? colours.dark.text : '#24292f',
            background: isDarkMode ? colours.dark.inputBackground : '#f6f8fa',
            border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e4e8'}`,
            borderLeft: 'none', // join with icon square
            borderRadius: '0 6px 6px 0',
            height: 28,
            padding: '0 8px',
            fontSize: 13,
            lineHeight: 1,
            boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
            userSelect: 'text',
          }}
        >
          <span style={{ fontWeight: 500 }}>{value}</span>
          <IconButton
            iconProps={{ iconName: copied ? 'CheckMark' : 'Copy' }}
            title={copied ? 'Copied!' : 'Copy'}
            ariaLabel={copied ? 'Copied!' : 'Copy'}
            onClick={handleCopy}
            styles={{
              root: {
                borderRadius: 6,
                height: 22,
                width: 22,
                minWidth: 22,
                padding: 0,
                background: 'transparent',
              },
              rootHovered: { background: isDarkMode ? 'rgba(255,255,255,0.06)' : '#e6f0fa' },
              icon: { fontSize: 12, color: isDarkMode ? colours.dark.text : '#57606a' },
            }}
          />
        </span>
      </span>
    );
  };
  // Admin/debug controls state
  const [useNewData, setUseNewData] = useState<boolean>(false);
  const [showDataInspector, setShowDataInspector] = useState(false);
  const userRec: any = (userData && userData[0]) ? userData[0] : {};
  const userRole: string = (userRec.Role || userRec.role || '').toString();
  const userFullName: string = (
    userRec.FullName ||
    userRec['Full Name'] ||
    [userRec.First, userRec.Last].filter(Boolean).join(' ')
  )?.toString() || '';
  const isAdmin = isAdminUser(userData?.[0] || null);
  const isLocalhost = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  // Initial Notes state
  const [initialNotes, setInitialNotes] = useState<string>('');
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const userInitials = userData?.[0]?.Initials?.toUpperCase() || '';
  // Prefer explicit email fields if present; fall back to constructed email from initials
  const userEmailCandidate = (userData && userData[0]) || {} as any;
  const userEmailAddress =
    (userEmailCandidate.Email && String(userEmailCandidate.Email).trim()) ||
    (userEmailCandidate.WorkEmail && String(userEmailCandidate.WorkEmail).trim()) ||
    (userEmailCandidate.Mail && String(userEmailCandidate.Mail).trim()) ||
    (userEmailCandidate.UserPrincipalName && String(userEmailCandidate.UserPrincipalName).trim()) ||
    (userEmailCandidate['Email Address'] && String(userEmailCandidate['Email Address']).trim()) ||
    (userInitials ? `${userInitials.toLowerCase()}@helix-law.com` : '');

  // Pitch Builder-specific: fetch team data via new server route and derive effective user data
  const [pitchUserData, setPitchUserData] = useState<UserData[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const init = async () => {
      try {
        const result = await safeFetchJson<UserData[]>(
          '/api/pitch-team',
          { signal: controller.signal }
        );
        if (!result.ok) return;
        const all = Array.isArray(result.value) ? result.value : [];
        if (!Array.isArray(all)) return;
        const initials = (userData?.[0]?.Initials || '').toString().trim().toUpperCase();
        const email = (typeof userEmailAddress === 'string' ? userEmailAddress : '').trim().toLowerCase();
        const getFullName = (u: any) => (u?.FullName
          || u?.['Full Name']
          || [u?.First, u?.Last].filter(Boolean).join(' '))?.toString().trim();
        const fullNameLocal = getFullName(userData?.[0] || {})
          ?.toLowerCase().replace(/\s+/g, ' ') || '';

        // Try to find a matching record by Initials, then Email, then Full Name
        const rec = all.find((r: any) => {
          const rInitials = (r?.Initials || r?.initials || '').toString().trim().toUpperCase();
          const rEmail = (r?.Email || r?.email || '').toString().trim().toLowerCase();
          const rFullName = getFullName(r)?.toLowerCase().replace(/\s+/g, ' ') || '';
          return (
            (!!initials && rInitials === initials) ||
            (!!email && rEmail && rEmail === email) ||
            (!!fullNameLocal && rFullName && rFullName === fullNameLocal)
          );
        });
        if (!rec) {
          // No direct match: still provide the server dataset so previews can use it (e.g., first item)
          if (!cancelled) setPitchUserData(all);
          return;
        }
        const current = (userData && userData[0]) || {};
        const merged: Partial<UserData> & any = {
          ...current,
          Role: rec.Role ?? current.Role,
          Rate: rec.Rate ?? current.Rate,
          Initials: initials,
          Email: rec.Email ?? current.Email,
          First: current.First ?? rec.First,
          Last: current.Last ?? rec.Last,
          FullName: current.FullName ?? rec.FullName ?? `${rec.First ?? ''} ${rec.Last ?? ''}`.trim(),
        };
        if (!cancelled) setPitchUserData([merged as UserData]);
      } catch (_) {
        // Silent fallback to existing userData
      }
    };
    init();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInitials]);

  const effectiveUserData = React.useMemo(() => {
    if (pitchUserData && pitchUserData.length) {
      // If merged single record provided, use it; otherwise prefer first server record
      if (pitchUserData.length === 1) return pitchUserData;
      return [pitchUserData[0]];
    }
    return userData;
  }, [pitchUserData, userData]);
  const usedPitchRoute = !!(pitchUserData && pitchUserData.length);

  // Local fetch logging
  const { apiCalls, clear: clearApiCalls } = useLocalFetchLogger(isLocalhost);
  const [debugCollapsed, setDebugCollapsed] = useState<boolean>(true);

  // (Fetch interception now handled by useLocalFetchLogger hook)

  const [templateSet, setTemplateSet] = useState<TemplateSet>('Database');
  const templateBlocks = useDynamicTemplateBlocks(templateSet);

  // Qualifying question state - determines base template
  const [qualifyingAnswer, setQualifyingAnswer] = useState<string>('');

  // Ref for the body editor
  const bodyEditorRef = useRef<HTMLDivElement>(null);
  const [dragSentence, setDragSentence] = useState<HTMLElement | null>(null);
  const [hiddenBlocks, setHiddenBlocks] = useState<{ [key: string]: boolean }>({});

  // Only clear the body on the very first mount, not after scenario injection or async loads
  const bodyHasBeenSeeded = useRef(false);

  function handleTemplateSetChange(newSet: TemplateSet) {
    setTemplateSet(newSet);
    const loadBlocks = async (): Promise<TemplateBlock[]> => {
      if (newSet === 'Database') {
        const stored = sessionStorage.getItem('prefetchedBlocksData');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            const compiled = compileBlocks(parsed);
            setBlocks(compiled);
            setSavedSnippets((parsed as any).savedSnippets || {});
            sessionStorage.removeItem('prefetchedBlocksData');
            return compiled;
          } catch (e) {
            console.error('Failed to parse prefetched blocks', e);
          }
        }
        const fallbackData = getDatabaseBlocksData();
        setBlocks(fallbackData.blocks);
        setSavedSnippets(fallbackData.savedSnippets);
        return fallbackData.blocks;
      } else {
        const result = getTemplateBlocks(newSet);
        setBlocks(result);
        return result;
      }
    };
    setSelectedTemplateOptions({});
    setInsertedBlocks({});
    setAutoInsertedBlocks({});
    setLockedBlocks({});
    setPinnedBlocks({});
    setEditedBlocks({});
    setOriginalBlockContent({});
    loadBlocks().then((newBlocks) => {
      const blocksToUse = (newBlocks || getTemplateBlocks(newSet)).filter(
        b => !hiddenBlocks[b.title]
      );

      // v1 templates should no longer auto select any blocks
      // autoInsertDefaultBlocks(blocksToUse, newSet);
    });
  }

  // Initial Scope options (formerly Service)
  const SERVICE_OPTIONS: IDropdownOption[] = [
    { key: 'Shareholder Dispute', text: 'Shareholder Dispute' },
    { key: 'Debt Recovery', text: 'Debt Recovery' },
    { key: 'Commercial Contract', text: 'Commercial Contract' },
    { key: 'Other', text: 'Other (bespoke)' },
  ];

  const initialOption = SERVICE_OPTIONS.find(opt => opt.text === enquiry.Type_of_Work);
  // Renamed: serviceDescription -> initialScopeDescription for clarity with new brief
  const [initialScopeDescription, setInitialScopeDescription] = useState<string>(initialOption?.text || '');
  const [selectedOption, setSelectedOption] = useState<IDropdownOption | undefined>(initialOption);
  // Default estimated fee now set to 1,500 per request
  const [amount, setAmount] = useState<string>('1500');
  function handleAmountChange(val?: string) {
    setAmount(val ?? '');
  }
  function handleAmountBlur() {
    if (!amount) return;
    const numeric = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (!isNaN(numeric)) {
      setAmount(numeric.toFixed(2));
    }
  }

  function highlightBlock(
    blockTitle: string,
    highlight: boolean,
    source?: 'editor' | 'template'
  ) {
    const isLocked = lockedBlocks[blockTitle];
    const headerElement = document.getElementById(
      `template-block-header-${blockTitle.replace(/\s+/g, '-')}`
    );
    const baseScale = 0.03;
    const hoveredScale = 1 + baseScale * 0.25; // 75% less
    const otherScale = 1 + baseScale * 0.5; // 50% less
    const defaultScale = 1 + baseScale;
    let headerScale = 1;
    let editorScale = 1;

    if (highlight) {
      if (source === 'editor') {
        headerScale = otherScale;
        editorScale = hoveredScale;
      } else if (source === 'template') {
        headerScale = hoveredScale;
        editorScale = otherScale;
      } else {
        headerScale = defaultScale;
        editorScale = defaultScale;
      }
    }

    if (headerElement) {
      const lockedBg = isDarkMode ? 'rgba(16,124,16,0.1)' : '#eafaea';
      const blueBg = colours.highlightBlue;
      headerElement.style.transition = 'background-color 0.2s, transform 0.2s, font-weight 0.2s';
      let bg = 'transparent';

      const isInserted =
        insertedBlocks[blockTitle] ||
        document.querySelector(`span[data-inserted="${blockTitle}"]`);

      if (highlight || isInserted) {
        if (lockedBlocks[blockTitle]) {
          bg = lockedBg;
        } else if (highlight && !isInserted) {
          bg = blueBg;
        } else if (Object.values(editedSnippets[blockTitle] || {}).some(Boolean)) {
          bg = blueBg;
        } else {
          bg = colours.highlightNeutral;
        }
      }
      headerElement.style.backgroundColor = bg;
      const active = highlight && !isLocked;
      headerElement.style.fontWeight = active ? '600' : 'normal';
      headerElement.style.transform = `scale(${headerScale})`;
    }

    const insertedSpans = document.querySelectorAll(`span[data-inserted="${blockTitle}"]`);
    insertedSpans.forEach((span) => {
      if (!(span instanceof HTMLElement)) return;

      // pull lockedBg into scope here
      const lockedBg = isDarkMode ? 'rgba(16,124,16,0.1)' : '#eafaea';

      span.style.transition = 'background-color 0.2s, outline 0.2s, transform 0.2s, font-weight 0.2s';
      span.style.outline = highlight && !isLocked ? `1px dotted ${colours.cta}` : 'none';
      span.style.borderRadius = '0px';
      span.style.fontWeight = 'normal';
      span.style.transform = `scale(${editorScale})`;

      span.querySelectorAll('[data-snippet]').forEach((snip) => {
        if (!(snip instanceof HTMLElement)) return;
        const label = snip.getAttribute('data-snippet') || '';
        let bg = colours.highlightNeutral;
        if (lockedBlocks[blockTitle]) {
          bg = lockedBg;
        } else if (editedSnippets[blockTitle]?.[label]) {
          bg = colours.highlightBlue;
        }
        snip.style.backgroundColor = bg;
      });

      // now lockedBg is in scope here
      span.style.backgroundColor = lockedBlocks[blockTitle]
        ? lockedBg
        : colours.highlightNeutral;
    });

    const block = templateBlocks.find((b) => b.title === blockTitle);
    if (block) {
      const placeholders = document.querySelectorAll(
        `span[data-placeholder="${escapeForSelector(block.placeholder)}"]`
      );
      placeholders.forEach((ph) => {
        if (ph instanceof HTMLElement) {
          ph.style.transition = 'transform 0.2s, font-weight 0.2s';
          ph.style.transform = `scale(${editorScale})`;
        }
      });
    }
  }

  function toggleBlockLock(blockTitle: string) {
    setLockedBlocks(prev => {
      const locked = !prev[blockTitle];
      const updated = { ...prev, [blockTitle]: locked };
      const spans = bodyEditorRef.current?.querySelectorAll(
        `span[data-inserted="${blockTitle}"]`
      ) as NodeListOf<HTMLElement> | null;
      if (spans) {
        const lockedBg = isDarkMode ? 'rgba(16,124,16,0.1)' : '#eafaea';
        spans.forEach(span => {
          span.setAttribute('contenteditable', (!locked).toString());
          const icon = span.querySelector('.lock-toggle i') as HTMLElement | null;
          if (icon) {
            icon.className = `ms-Icon ms-Icon--${locked ? 'Lock' : 'Unlock'}`;
          }
        });
        highlightBlock(blockTitle, false);
      }
      return updated;
    });
  }

  function toggleBlockSidebar(blockTitle: string) {
    const spans = bodyEditorRef.current?.querySelectorAll(
      `span[data-inserted="${blockTitle}"]`
    ) as NodeListOf<HTMLElement> | null;
    if (!spans) return;

    const currentlyPinned = !!pinnedBlocks[blockTitle];
    const newPinned = !currentlyPinned;

    spans.forEach(span => {
      const container = span as HTMLElement;
      const sidebar = span.querySelector('.block-sidebar') as HTMLElement | null;
      if (!sidebar) return;

      if (newPinned) {
        sidebar.classList.add('pinned');
        container.classList.add('pinned');
      } else {
        sidebar.classList.remove('pinned');
        container.classList.remove('pinned');
      }

      const icon = sidebar.querySelector('.pin-toggle i') as HTMLElement | null;
      const pinBtn = sidebar.querySelector('.pin-toggle') as HTMLElement | null;
      const handleIcon = sidebar.querySelector('.sidebar-handle i') as HTMLElement | null;
      if (icon) {
        icon.className = `ms-Icon ms-Icon--${newPinned ? 'Pinned' : 'Pin'}`;
      }
      if (handleIcon) {
        handleIcon.className = `ms-Icon ms-Icon--${newPinned ? 'ChevronRight' : 'ChevronLeft'}`;
      }
      if (pinBtn) {
        if (newPinned) pinBtn.classList.add('pinned');
        else pinBtn.classList.remove('pinned');
      }
    });

    setPinnedBlocks(prev => {
      const updated = { ...prev, [blockTitle]: newPinned };
      if (!newPinned) delete updated[blockTitle];
      return updated;
    });

    if (bodyEditorRef.current) {
      // Save current state before making changes (immediate, not debounced)
      const currentContent = bodyEditorRef.current.innerHTML;
      saveToUndoStackImmediate(currentContent);
      setBodyInternal(bodyEditorRef.current.innerHTML);
    }
  }

  function toggleSidebarOverlayMode() {
    setOverlaySidebars((prev) => {
      const newVal = !prev;
      if (newVal) document.body.classList.add('sidebar-overlay');
      else document.body.classList.remove('sidebar-overlay');
      localStorage.setItem('sidebarOverlay', newVal ? 'true' : 'false');
      const sidebars = bodyEditorRef.current?.querySelectorAll('.block-sidebar') as NodeListOf<HTMLElement> | null;
      if (sidebars) {
        sidebars.forEach((sb) => {
          const toggle = sb.querySelector('.overlay-toggle') as HTMLElement | null;
          const icon = toggle?.querySelector('i') as HTMLElement | null;
          if (icon) {
            icon.className = `ms-Icon ms-Icon--${newVal ? 'DockRight' : 'DockLeft'}`;
          }
          if (toggle) {
            if (newVal) toggle.classList.add('active');
            else toggle.classList.remove('active');
          }
        });
      }
      return newVal;
    });
  }

  function openSnippetOptions(
    e: MouseEvent,
    blockTitle: string,
    snippetLabel: string
  ) {
    e.stopPropagation();
    e.preventDefault();
    if (lockedBlocks[blockTitle]) return;
    const block = templateBlocks.find((b) => b.title === blockTitle);
    if (block) {
      setSnippetOptionsTarget(e.currentTarget as HTMLElement);
      setSnippetOptionsBlock(block);
      setSnippetOptionsLabel(snippetLabel);
    }
  }

  function openSnippetEdit(e: MouseEvent, blockTitle: string) {
    e.stopPropagation();
    e.preventDefault();
    if (lockedBlocks[blockTitle]) return;
    setSnippetEdit({ blockTitle, target: e.currentTarget as HTMLElement });
  }

  function saveToUndoStack(content: string) {
    if (isUndoRedoOperation) return;
    if (!content || !content.trim()) return; // Don't save empty content

    // Don't save duplicate content
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === content) return;

    setUndoStack(prev => {
      const newStack = [...prev, content];
      // Keep last 50 states (increased from 20)
      return newStack.slice(-50);
    });

    // Clear redo stack when new action is performed
    setRedoStack([]);
  }

  // Immediate save for block operations (not debounced)
  function saveToUndoStackImmediate(content: string) {
    if (isUndoRedoOperation) return;
    if (!content || !content.trim()) return;

    // Don't save duplicate content
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === content) return;

    // Cancel any pending debounced saves from input handler
    if (inputTimeoutRef.current) {
      clearTimeout(inputTimeoutRef.current);
      inputTimeoutRef.current = null;
    }

    setUndoStack(prev => {
      const newStack = [...prev, content];
      return newStack.slice(-50);
    });

    setRedoStack([]);
  }

  function undo() {
    if (undoStack.length <= 1) return; // Need at least 2 items to undo (current + previous)

    const currentContent = bodyEditorRef.current?.innerHTML || body;
    const previousContent = undoStack[undoStack.length - 1];

    setIsUndoRedoOperation(true);

    // Save current state to redo stack
    setRedoStack(prev => [...prev, currentContent]);

    // Remove the last item from undo stack
    setUndoStack(prev => prev.slice(0, -1));

    // Update both DOM and React state
    if (bodyEditorRef.current) {
      bodyEditorRef.current.innerHTML = previousContent;
    }
    setBodyState(previousContent);

    // Sync all related state
    syncStateFromContent(previousContent);

    // Clear the flag and trigger highlighting update
    setTimeout(() => {
      const { blocks, snippets } = computeSnippetChanges();
      setEditedBlocks(blocks);
      setEditedSnippets(snippets);
      setIsUndoRedoOperation(false);
    }, 50);
  }

  function redo() {
    if (redoStack.length === 0) return;

    const currentContent = bodyEditorRef.current?.innerHTML || body;
    const nextContent = redoStack[redoStack.length - 1];

    setIsUndoRedoOperation(true);

    // Save current state to undo stack
    setUndoStack(prev => [...prev, currentContent]);

    // Remove the last item from redo stack
    setRedoStack(prev => prev.slice(0, -1));

    // Update both DOM and React state
    if (bodyEditorRef.current) {
      bodyEditorRef.current.innerHTML = nextContent;
    }
    setBodyState(nextContent);

    // Sync all related state
    syncStateFromContent(nextContent);

    // Clear the flag and trigger highlighting update
    setTimeout(() => {
      const { blocks, snippets } = computeSnippetChanges();
      setEditedBlocks(blocks);
      setEditedSnippets(snippets);
      setIsUndoRedoOperation(false);
    }, 50);
  }

  // Helper function to sync state from content
  function syncStateFromContent(content: string) {
    // Parse content to determine which blocks are inserted
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const insertedBlockElements = doc.querySelectorAll('[data-inserted]');

    const newInsertedBlocks: { [key: string]: boolean } = {};
    insertedBlockElements.forEach((el) => {
      const blockTitle = el.getAttribute('data-inserted');
      if (blockTitle) {
        newInsertedBlocks[blockTitle] = true;
      }
    });

    setInsertedBlocks(newInsertedBlocks);
  }

  function closeSnippetOptions() {
    setSnippetOptionsBlock(null);
    setSnippetOptionsTarget(null);
    setSnippetOptionsLabel('');
  }

  function insertBlockOption(blockTitle: string, optionLabel: string) {
    const block = templateBlocks.find((b) => b.title === blockTitle);
    if (!block) return;
    if (lockedBlocks[blockTitle]) return;

    // Save current state before making changes (immediate, not debounced)
    const currentContent = bodyEditorRef.current?.innerHTML || body;
    saveToUndoStackImmediate(currentContent);

    if (block.isMultiSelect) {
      const current = Array.isArray(selectedTemplateOptions[blockTitle])
        ? ([...(selectedTemplateOptions[blockTitle] as string[])])
        : [];
      if (current.includes(optionLabel)) return;
      const updated = [...current, optionLabel];
      handleMultiSelectChange(blockTitle, updated);
      if (insertedBlocks[blockTitle]) {
        appendSnippetOption(block, optionLabel);
      } else {
        insertTemplateBlock(block, updated, true, false);
      }
      if (autoInsertedBlocks[blockTitle]) {
        setAutoInsertedBlocks((prev) => ({ ...prev, [blockTitle]: false }));
      }
    } else {
      if (selectedTemplateOptions[blockTitle] === optionLabel && insertedBlocks[blockTitle]) {
        return;
      }
      handleSingleSelectChange(blockTitle, optionLabel);
      if (insertedBlocks[blockTitle]) {
        appendSnippetOption(block, optionLabel);
      } else {
        insertTemplateBlock(block, optionLabel, true);
      }
      if (autoInsertedBlocks[blockTitle]) {
        setAutoInsertedBlocks((prev) => ({ ...prev, [blockTitle]: false }));
      }
    }
  }

  function resetBlockOption(blockTitle: string) {
    const block = templateBlocks.find((b) => b.title === blockTitle);
    if (!block) return;
    if (lockedBlocks[blockTitle]) return;
    const selected = selectedTemplateOptions[blockTitle];
    if (!selected) return;

    // Save current state before making changes (immediate, not debounced)
    const currentContent = bodyEditorRef.current?.innerHTML || body;
    saveToUndoStackImmediate(currentContent);

    insertTemplateBlock(block, selected, true, false);
  }

  useEffect(() => {
    (window as any).toggleBlockLock = toggleBlockLock;
    (window as any).toggleBlockSidebar = toggleBlockSidebar;
    (window as any).highlightBlock = highlightBlock;
    (window as any).openSnippetOptions = openSnippetOptions;
    (window as any).openSnippetEdit = openSnippetEdit;
    (window as any).insertBlockOption = insertBlockOption;
    (window as any).resetBlockOption = resetBlockOption;
    (window as any).saveCustomSnippet = saveCustomSnippet;
    (window as any).toggleSidebarOverlayMode = toggleSidebarOverlayMode;
    (window as any).undo = undo;
    (window as any).redo = redo;
    (window as any).removeBlock = (title: string) => {
      const block = templateBlocks.find((b) => b.title === title);
      if (block) handleClearBlock(block);
    };

    // Add keyboard shortcuts for undo/redo
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          undo();
        } else if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
          redo();
        }
      }
    };

    // Attach to document with capture=true to intercept before other handlers
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [toggleBlockLock, toggleBlockSidebar, highlightBlock, openSnippetOptions, openSnippetEdit, insertBlockOption, resetBlockOption, toggleSidebarOverlayMode, templateBlocks, undo, redo]);

  // Simple helper to capitalize your "Area_of_Work" for the subject line
  function capitalizeWords(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [savedSnippets, setSavedSnippets] = useState<{ [key: string]: string }>({});
  const suppressSaveRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('pitchBuilderState');
    const shouldResume = localStorage.getItem('resumePitchBuilder') === 'true';
    let initialSet: TemplateSet = 'Database';
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.enquiryId !== enquiry.ID) {
          handleTemplateSetChange(initialSet);
          return;
        }
        if (state.templateSet) {
          setTemplateSet(state.templateSet);
          initialSet = state.templateSet;
        }
        // Backward compatibility: migrate stored serviceDescription -> initialScopeDescription
        if (state.serviceDescription && !state.initialScopeDescription) {
          setInitialScopeDescription(state.serviceDescription);
        }
        if (state.initialScopeDescription) setInitialScopeDescription(state.initialScopeDescription);
        if (state.selectedOption) setSelectedOption(state.selectedOption);
        if (state.amount) setAmount(state.amount);
        if (state.subject) setSubject(state.subject);
        if (state.to) setTo(state.to);
        if (state.cc) setCc(state.cc);
        if (state.bcc) setBcc(state.bcc);
        if (state.attachments) setAttachments(state.attachments);
        if (state.followUp) setFollowUp(state.followUp);
        if (state.activeTab) setActiveTab(state.activeTab);
        if (state.selectedTemplateOptions) setSelectedTemplateOptions(state.selectedTemplateOptions);
        if (state.insertedBlocks) setInsertedBlocks(state.insertedBlocks);
        if (state.autoInsertedBlocks) setAutoInsertedBlocks(state.autoInsertedBlocks);
        if (state.lockedBlocks) setLockedBlocks(state.lockedBlocks);
        if (state.pinnedBlocks) setPinnedBlocks(state.pinnedBlocks);
        if (state.editedBlocks) setEditedBlocks(state.editedBlocks);
        if (state.editedSnippets) setEditedSnippets(state.editedSnippets);
        if (state.originalBlockContent) setOriginalBlockContent(state.originalBlockContent);
        if (state.originalSnippetContent) setOriginalSnippetContent(state.originalSnippetContent);
        if (state.hiddenBlocks) setHiddenBlocks(state.hiddenBlocks);
        if (state.blocks) setBlocks(state.blocks);
        if (state.savedSnippets) setSavedSnippets(state.savedSnippets);
        if (shouldResume && state.body) setBody(state.body);
      } catch (e) {
        console.error('Failed to parse saved pitch builder state', e);
        initialSet = 'Database';
      }
    }
    handleTemplateSetChange(initialSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default subject
  const [subject, setSubject] = useState<string>('Your Enquiry');

  // Default recipient fields
  const [to, setTo] = useState<string>(enquiry.Email || '');
  const [cc, setCc] = useState<string>('');
  const [bcc, setBcc] = useState<string>('');

  // Extracted blocks (handled as qualifying sections above editor). They won't appear as placeholders inside the editor.
  const EXTRACTED_BLOCKS: string[] = [
    'Current Situation and Problem',
    'Potential Causes of Action and Remedies',
    'Scope of Work',
    'Risk Assessment',
    'Costs and Budget',
    'Required Documents',
    'Next Steps to Instruct Helix Law',
    'Meeting Link',
    'Closing Notes',
    'Google Review'
  ];

  function generateBaseTemplate(blocks: TemplateBlock[]): string {
    return `Dear [Enquiry.First_Name],\n\n${blocks
      .filter(b => !EXTRACTED_BLOCKS.includes(b.title))
      .map((b) => b.placeholder)
      .join('\n\n')}\n\nKind Regards,<br>\n\n[First Name]<br>\n\n[Full Name]<br>\n[Position]`;
  }

  const BASE_TEMPLATE = React.useMemo(
    () => generateBaseTemplate(blocks),
    [blocks]
  );

  function generateInitialBody(blocks: TemplateBlock[]): string {
    const replaced = replacePlaceholders(
      generateBaseTemplate(blocks),
      '',
      enquiry,
      effectiveUserData,
      blocks
    );
    const withInserts = wrapInsertPlaceholders(replaced);
    return withInserts
      .split('\n')
      .map((line) => line.trim())
      .join('\n');
  }

  function buildPlaceholder(block: TemplateBlock): string {
    const options = block.options
      .map((o) => {
        const preview = cleanTemplateString(o.previewText).replace(/<p>/g, `<p style="margin: 0;">`);
        return `<div class="option-bubble" data-block-title="${block.title}" data-option-label="${o.label}"><strong>${o.label}</strong><div class="option-preview">${preview}</div></div>`;
      })
      .join('');
    const saved = savedSnippets[block.title] || localStorage.getItem(`customSnippet_${block.title}`);
    const savedHtml = saved
      ? `<div class="option-bubble" data-block-title="${block.title}" data-option-label="__saved"><strong>Saved Snippet</strong><div class="option-preview">${saved}</div></div>`
      : '';
    const removeBtn = `<span class="remove-block" data-block-title="${block.title}" style="margin-left:4px;cursor:pointer;">&times;</span>`;
    return `<span data-placeholder="${block.placeholder}" class="block-option-list"><span class="block-label" data-label-title="${block.title}">${block.title}${removeBtn}</span>${options}${savedHtml}</span>`;
  }

  // State for extracted block selections and editable content
  const [sectionSelections, setSectionSelections] = useState<Record<string, string[]>>({});
  const [sectionContent, setSectionContent] = useState<Record<string, string>>({});
  const [body, setBodyState] = useState<string>('');

  function setBody(newBody: string | ((prevBody: string) => string)) {
    const resolvedBody = typeof newBody === 'function' ? newBody(body) : newBody;
    setBodyState(resolvedBody);

    // Trigger change detection for precise highlighting
    setTimeout(() => {
      const { blocks, snippets } = computeSnippetChanges();
      setEditedBlocks(blocks);
      setEditedSnippets(snippets);
    }, 100);
  }

  // Internal function for programmatic changes that shouldn't trigger undo saves
  function setBodyInternal(newBody: string | ((prevBody: string) => string)) {
    const resolvedBody = typeof newBody === 'function' ? newBody(body) : newBody;
    setBodyState(resolvedBody);

    // Trigger change detection for precise highlighting
    setTimeout(() => {
      const { blocks, snippets } = computeSnippetChanges();
      setEditedBlocks(blocks);
      setEditedSnippets(snippets);
    }, 100);
  }

  // Create a React-compatible setState wrapper
  const setBodyForComponents = (newBody: string | ((prevBody: string) => string)) => {
    setBody(newBody);
  };

  // Only clear the body on the very first mount, not after scenario injection or async loads
  useEffect(() => {
    if (!bodyHasBeenSeeded.current && (!body || body.trim() === '')) {
      setBody('');
      if (bodyEditorRef.current) {
        bodyEditorRef.current.innerHTML = '';
      }
      bodyHasBeenSeeded.current = true;
    }
  }, [body, setBody]);

  // Disable automatic insertion of default blocks for v1
  /*
  useEffect(() => {
    if (blocks.length > 0 && Object.keys(insertedBlocks).length === 0) {
      autoInsertDefaultBlocks(blocks.filter(b => !hiddenBlocks[b.title]), templateSet);
    }
  }, [blocks]);
  */

  // Attachments, followUp, preview, error states, etc...
  const [attachments, setAttachments] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState<string | undefined>(undefined);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [isErrorVisible, setIsErrorVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // **New State: Confirmation State for Draft Email Button**
  const [isDraftConfirmed, setIsDraftConfirmed] = useState<boolean>(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    loading?: boolean;
    details?: string;
    progress?: number;
    icon?: string;
  } | null>(null);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const showToast = (
    msg: string,
    type: 'success' | 'error' | 'info' | 'warning',
    options?: {
      loading?: boolean;
      details?: string;
      progress?: number;
      icon?: string;
      duration?: number;
    }
  ) => {
    setToast({ 
      message: msg, 
      type, 
      loading: options?.loading,
      details: options?.details,
      progress: options?.progress,
      icon: options?.icon
    });
    const duration = options?.duration ?? 3000;
    if (duration > 0) {
      setTimeout(() => setToast(null), duration);
    }
  };

  // Tab state to switch between email details and deals
  const [activeTab, setActiveTab] = useState<string>('details');

  // IDs returned after saving a deal
  const [dealId, setDealId] = useState<number | null>(null);
  const [dealPasscode, setDealPasscode] = useState<string>('');
  const [dealStatus, setDealStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
  const [dealCreationInProgress, setDealCreationInProgress] = useState<boolean>(false);
  const [clientIds, setClientIds] = useState<number[]>([]);
  const [dealClients, setDealClients] = useState<ClientInfo[]>([]);
  const [isMultiClientFlag, setIsMultiClientFlag] = useState<boolean>(false);
  // Inline email send/draft status for confirmation modal
  const [emailStatus, setEmailStatus] = useState<'idle' | 'processing' | 'sent' | 'error'>('idle');
  const [emailMessage, setEmailMessage] = useState<string>('');


  // Tracks selected template options for each block
  const [selectedTemplateOptions, setSelectedTemplateOptions] = useState<{
    [key: string]: string | string[];
  }>({});

  // Tracks which blocks have been inserted
  const [insertedBlocks, setInsertedBlocks] = useState<{ [key: string]: boolean }>({});
  const [autoInsertedBlocks, setAutoInsertedBlocks] = useState<{ [key: string]: boolean }>({});

  const [lockedBlocks, setLockedBlocks] = useState<{ [key: string]: boolean }>({});

  const [pinnedBlocks, setPinnedBlocks] = useState<{ [key: string]: boolean }>({});

  const [overlaySidebars, setOverlaySidebars] = useState<boolean>(() =>
    localStorage.getItem('sidebarOverlay') === 'true'
  );

  const [editedBlocks, setEditedBlocks] = useState<{ [key: string]: boolean }>({});
  const [editedSnippets, setEditedSnippets] = useState<{
    [key: string]: { [label: string]: boolean };
  }>({});
  const [originalBlockContent, setOriginalBlockContent] = useState<{ [key: string]: string }>({});
  const [originalSnippetContent, setOriginalSnippetContent] = useState<{
    [key: string]: { [label: string]: string };
  }>({});
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  // Undo/Redo functionality
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState<boolean>(false);
  const [undoInitialized, setUndoInitialized] = useState<boolean>(false);

  // Navigator is now owned by Enquiries detail view; remove PitchBuilder-specific Navigator bar to avoid duplication.

  // Initialize undo stack with initial body content (only once)
  useEffect(() => {
    if (!undoInitialized && body && body.trim()) {
      const currentContent = bodyEditorRef.current?.innerHTML || body;
      setUndoStack([currentContent]);
      setUndoInitialized(true);
    }
  }, [body, undoInitialized]);

  // Enhanced edit tracking for precise highlighting
  const [editedTextRanges, setEditedTextRanges] = useState<{
    [blockTitle: string]: { [snippetLabel: string]: Array<{ start: number; end: number; text: string }> };
  }>({});

  useEffect(() => {
    if (overlaySidebars) {
      document.body.classList.add('sidebar-overlay');
    } else {
      document.body.classList.remove('sidebar-overlay');
    }
    const sidebars = bodyEditorRef.current?.querySelectorAll('.block-sidebar') as NodeListOf<HTMLElement> | null;
    if (sidebars) {
      sidebars.forEach((sb) => {
        const toggle = sb.querySelector('.overlay-toggle') as HTMLElement | null;
        const icon = toggle?.querySelector('i') as HTMLElement | null;
        if (icon) {
          icon.className = `ms-Icon ms-Icon--${overlaySidebars ? 'DockRight' : 'DockLeft'}`;
        }
        if (toggle) {
          if (overlaySidebars) toggle.classList.add('active');
          else toggle.classList.remove('active');
        }
      });
    }
  }, [overlaySidebars]);

  // Placeholder editing popover state
  const [placeholderEdit, setPlaceholderEdit] = useState<{
    span: HTMLElement;
    target: HTMLElement;
    before: string;
    after: string;
    text: string;
    placeholder: string;
    blockTitle?: string;
  } | null>(null);

  const [snippetEdit, setSnippetEdit] = useState<{
    blockTitle: string;
    target: HTMLElement;
    placeholder?: string;
  } | null>(null);
  const [pendingOptionText, setPendingOptionText] = useState<string>('');

  function getNeighboringWords(span: HTMLElement, count: number = 3) {
    const gather = (node: Node | null, words: string[], dir: 'prev' | 'next') => {
      while (node && words.length < count) {
        if (node.nodeType === Node.TEXT_NODE) {
          const parts = (node.textContent || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          if (dir === 'prev') {
            for (let i = parts.length - 1; i >= 0 && words.length < count; i--) {
              words.unshift(parts[i]);
            }
          } else {
            for (let i = 0; i < parts.length && words.length < count; i++) {
              words.push(parts[i]);
            }
          }
        }
        node = dir === 'prev' ? node.previousSibling : node.nextSibling;
      }
    };

    const before: string[] = [];
    const after: string[] = [];
    gather(span.previousSibling, before, 'prev');
    gather(span.nextSibling, after, 'next');
    return {
      before: before.slice(-count).join(' '),
      after: after.slice(0, count).join(' '),
    };
  }

  const [snippetOptionsBlock, setSnippetOptionsBlock] = useState<TemplateBlock | null>(null);
  const [snippetOptionsLabel, setSnippetOptionsLabel] = useState<string>('');
  const [snippetOptionsTarget, setSnippetOptionsTarget] = useState<HTMLElement | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{
    block: TemplateBlock;
    option?: string;
    target: HTMLElement | null;
    point: IPoint | null;
  } | null>(null);

  useEffect(() => {
    templateBlocks.forEach((block) => {
      highlightBlock(block.title, false);
    });
  }, [insertedBlocks, lockedBlocks, editedBlocks, isDarkMode, body]);

  // For the body editor
  const savedSelection = useRef<Range | null>(null);
  const inputTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const editor = bodyEditorRef.current;
    if (!editor) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const remove = (target as HTMLElement).closest('.remove-block');
      if (remove) {
        const blockTitle = remove.getAttribute('data-block-title');
        if (blockTitle && !lockedBlocks[blockTitle]) hideTemplateBlock(blockTitle);
        return;
      }

      const del = (target as HTMLElement).closest('.sentence-delete');
      if (del) {
        const sentence = del.closest('[data-sentence]');
        const blockSpan = sentence?.closest('[data-inserted]') as HTMLElement | null;
        if (blockSpan && lockedBlocks[blockSpan.getAttribute('data-inserted') || '']) return;
        if (sentence && editor.contains(sentence)) {
          // Save current state before making changes (immediate, not debounced)
          const currentContent = bodyEditorRef.current?.innerHTML || body;
          saveToUndoStackImmediate(currentContent);

          sentence.remove();
          setBodyInternal(editor.innerHTML);
        }
        return;
      }

      const bubble = (target as HTMLElement).closest('.option-bubble');
      if (bubble) {
        const blockTitle = bubble.getAttribute('data-block-title');
        const optionLabel = bubble.getAttribute('data-option-label');
        if (blockTitle && optionLabel) {
          if (lockedBlocks[blockTitle]) return;
          const block = templateBlocks.find((b) => b.title === blockTitle);
          if (!block) return;
          const isSelected = block.isMultiSelect
            ? Array.isArray(selectedTemplateOptions[blockTitle]) &&
            (selectedTemplateOptions[blockTitle] as string[]).includes(optionLabel)
            : selectedTemplateOptions[blockTitle] === optionLabel;
          if (isSelected) {
            if (Object.values(editedSnippets[blockTitle] || {}).some(Boolean)) {
              const rect = (bubble as HTMLElement).getBoundingClientRect();
              setRemoveConfirm({
                block,
                option: optionLabel,
                target: bubble as HTMLElement,
                point: { x: rect.left + rect.width / 2, y: rect.bottom },
              });
            } else {
              removeBlockOption(block, optionLabel);
            }
          } else {
            insertBlockOption(blockTitle, optionLabel);
          }
          return;
        }
      }

      const choice = (target as HTMLElement).closest('.option-choice');
      if (choice) {
        const blockTitle = choice.getAttribute('data-block-title');
        const optionLabel = choice.getAttribute('data-option-label');
        if (blockTitle && optionLabel) {
          if (lockedBlocks[blockTitle]) return;
          if (choice.classList.contains('reset-option')) {
            resetBlockOption(blockTitle);
            return;
          }
          const block = templateBlocks.find((b) => b.title === blockTitle);
          if (!block) return;
          const isSelected = block.isMultiSelect
            ? Array.isArray(selectedTemplateOptions[blockTitle]) &&
            (selectedTemplateOptions[blockTitle] as string[]).includes(optionLabel)
            : selectedTemplateOptions[blockTitle] === optionLabel;
          if (isSelected) {
            if (Object.values(editedSnippets[blockTitle] || {}).some(Boolean)) {
              const rect = (choice as HTMLElement).getBoundingClientRect();
              setRemoveConfirm({
                block,
                option: optionLabel,
                target: choice as HTMLElement,
                point: { x: rect.left + rect.width / 2, y: rect.bottom },
              });
            } else {
              removeBlockOption(block, optionLabel);
            }
          } else {
            insertBlockOption(blockTitle, optionLabel);
          }
          return;
        }
      }
    };
    editor.addEventListener('click', handleClick);
    return () => editor.removeEventListener('click', handleClick);
  }, [insertBlockOption, resetBlockOption, hideTemplateBlock]);

  useEffect(() => {
    const editor = bodyEditorRef.current;
    if (!editor) return;

    const handleDragStart = (e: DragEvent) => {
      const handle = (e.target as HTMLElement).closest('.sentence-handle');
      if (!handle) return;
      const blockSpan = handle.closest('[data-inserted]') as HTMLElement | null;
      if (blockSpan && lockedBlocks[blockSpan.getAttribute('data-inserted') || '']) {
        e.preventDefault();
        return;
      }
      const target = handle.parentElement as HTMLElement | null;
      if (target) {
        setDragSentence(target);
        e.dataTransfer?.setData('text/plain', '');
      }
    };

    const handleDragOver = (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('[data-sentence]');
      const blockSpan = target?.closest('[data-inserted]') as HTMLElement | null;
      if (blockSpan && lockedBlocks[blockSpan.getAttribute('data-inserted') || '']) {
        return;
      }
      if (target && dragSentence) {
        e.preventDefault();
        target.classList.add('drag-over');
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('[data-sentence]');
      if (target) {
        target.classList.remove('drag-over');
      }
    };

    const handleDrop = (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('[data-sentence]') as HTMLElement | null;
      const blockSpan = target?.closest('[data-inserted]') as HTMLElement | null;
      if (blockSpan && lockedBlocks[blockSpan.getAttribute('data-inserted') || '']) {
        target && target.classList.remove('drag-over');
        setDragSentence(null);
        return;
      }
      if (target && dragSentence && target !== dragSentence) {
        e.preventDefault();
        const parent = target.parentElement;
        if (parent && parent === dragSentence.parentElement) {
          // Save current state before making changes (immediate, not debounced)
          const currentContent = bodyEditorRef.current?.innerHTML || body;
          saveToUndoStackImmediate(currentContent);

          const before = e.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2;
          if (before) {
            parent.insertBefore(dragSentence, target);
          } else {
            parent.insertBefore(dragSentence, target.nextSibling);
          }
          dragSentence.classList.add('drop-in');
          setTimeout(() => dragSentence.classList.remove('drop-in'), 300);
          setBodyInternal(editor.innerHTML);
        }
      }
      target && target.classList.remove('drag-over');
      setDragSentence(null);
    };

    editor.addEventListener('dragstart', handleDragStart);
    editor.addEventListener('dragover', handleDragOver);
    editor.addEventListener('dragleave', handleDragLeave);
    editor.addEventListener('drop', handleDrop);
    return () => {
      editor.removeEventListener('dragstart', handleDragStart);
      editor.removeEventListener('dragover', handleDragOver);
      editor.removeEventListener('dragleave', handleDragLeave);
      editor.removeEventListener('drop', handleDrop);
    };
  }, [dragSentence]);

  useEffect(() => {
    const editor = bodyEditorRef.current;
    if (!editor) return;

    const openPlaceholderEditor = (ph: HTMLElement) => {
      const { before, after } = getNeighboringWords(ph);
      const blockEl = ph.closest('[data-block-title]') as HTMLElement | null;
      const blockTitle = blockEl?.getAttribute('data-block-title') || undefined;
      const placeholderText = ph.textContent || '';
      const placeholderAttr = ph.getAttribute('data-placeholder') || '';
      setPlaceholderEdit({
        span: ph,
        target: ph,
        before,
        after,
        text: placeholderText,
        placeholder: placeholderAttr,
        blockTitle,
      });
    };

    const handleInput = (e: Event) => {
      // Capture the current DOM content and save it to undo stack BEFORE React state updates
      const currentDOMContent = editor.innerHTML;

      // Save to undo stack (debounced) - this captures the state BEFORE the input change
      if (!isUndoRedoOperation && body && body.trim() && currentDOMContent !== body) {
        if (inputTimeoutRef.current) {
          clearTimeout(inputTimeoutRef.current);
        }

        inputTimeoutRef.current = setTimeout(() => {
          saveToUndoStack(body); // Save the React state (which is the previous state)
        }, 300); // Shorter debounce for better responsiveness
      }

      // Update body state immediately to reflect the change
      setBodyState(currentDOMContent);

      // Trigger precise highlighting detection (debounced)
      setTimeout(() => {
        const { blocks, snippets } = computeSnippetChanges();
        setEditedBlocks(blocks);
        setEditedSnippets(snippets);
      }, 100);
    };

    const handleDblClick = (e: MouseEvent) => {
      const ph = (e.target as HTMLElement).closest('.insert-placeholder') as HTMLElement | null;
      if (ph) {
        e.preventDefault();
        openPlaceholderEditor(ph);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const ph = (e.target as HTMLElement).closest('.insert-placeholder') as HTMLElement | null;
        if (ph) {
          e.preventDefault();
          openPlaceholderEditor(ph);
        }
      }
    };

    editor.addEventListener('input', handleInput);
    editor.addEventListener('dblclick', handleDblClick);
    editor.addEventListener('keydown', handleKeyDown, true);
    return () => {
      editor.removeEventListener('input', handleInput);
      editor.removeEventListener('dblclick', handleDblClick);
      editor.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [body, isUndoRedoOperation]);

  /**
   * Save the user's cursor selection in the contentEditable, so we can insert text at that exact spot.
   */
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (sel && savedSelection.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  }

  function isSelectionInsideEditor(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode!;
    }
    return bodyEditorRef.current?.contains(node) || false;
  }

  function normalizeHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isContentChanged(current: string, original: string): boolean {
    const clean = (html: string) =>
      html.replace(/<span class="lock-toggle"[^>]*>.*?<\/span>/, '');
    return normalizeHtml(clean(current)) !== normalizeHtml(clean(original));
  }

  function detectTextEdits(blockTitle: string, snippetLabel: string, currentText: string, originalText: string) {
    if (currentText === originalText) return [];

    const edits: Array<{ start: number; end: number; text: string }> = [];

    // Simple diff algorithm to find edited portions
    const currentWords = currentText.split(/\s+/);
    const originalWords = originalText.split(/\s+/);

    let currentIndex = 0;
    let originalIndex = 0;

    while (currentIndex < currentWords.length || originalIndex < originalWords.length) {
      if (currentIndex < currentWords.length && originalIndex < originalWords.length) {
        if (currentWords[currentIndex] === originalWords[originalIndex]) {
          currentIndex++;
          originalIndex++;
        } else {
          // Found a difference - track the edit
          const startIdx = currentIndex;
          while (currentIndex < currentWords.length && originalIndex < originalWords.length &&
            currentWords[currentIndex] !== originalWords[originalIndex]) {
            currentIndex++;
            originalIndex++;
          }

          const editedText = currentWords.slice(startIdx, currentIndex).join(' ');
          edits.push({
            start: startIdx,
            end: currentIndex,
            text: editedText
          });
        }
      } else if (currentIndex < currentWords.length) {
        // Addition
        const editedText = currentWords.slice(currentIndex).join(' ');
        edits.push({
          start: currentIndex,
          end: currentWords.length,
          text: editedText
        });
        break;
      } else {
        // Deletion - handled by the original being longer
        break;
      }
    }

    return edits;
  }

  function highlightEditedText(element: HTMLElement, edits: Array<{ start: number; end: number; text: string }>) {
    // Don't modify the HTML to avoid cursor jumping - just mark as edited
    if (edits.length === 0) return;
    element.classList.add('has-edits');
  }

  function computeSnippetChanges() {
    if (!bodyEditorRef.current) return { blocks: {}, snippets: {} };
    const updatedBlocks: { [key: string]: boolean } = {};
    const updatedSnippets: { [key: string]: { [label: string]: boolean } } = {};
    const updatedEditRanges: { [blockTitle: string]: { [snippetLabel: string]: Array<{ start: number; end: number; text: string }> } } = {};

    const lockedBg = isDarkMode ? 'rgba(16,124,16,0.1)' : '#eafaea';
    const editedBlockBg = isDarkMode ? 'rgba(70,130,180,0.15)' : '#e8f4fd'; // New color for edited blocks

    Object.keys(insertedBlocks).forEach((title) => {
      if (!insertedBlocks[title]) return;
      const span = bodyEditorRef.current!.querySelector(
        `span[data-inserted="${title}"]`
      ) as HTMLElement | null;
      if (!span) return;

      const snippetEls = Array.from(
        span.querySelectorAll('[data-snippet]')
      ) as HTMLElement[];

      let blockHasEdits = false;

      snippetEls.forEach((el) => {
        const label = el.getAttribute('data-snippet') || '';
        const original = originalSnippetContent[title]?.[label];
        if (original === undefined) return;

        const currentText = el.textContent || '';
        const originalText = new DOMParser().parseFromString(original, 'text/html').body.textContent || '';
        const changed = currentText !== originalText;

        if (!updatedSnippets[title]) updatedSnippets[title] = {};
        updatedSnippets[title][label] = changed;

        if (changed) {
          blockHasEdits = true;
          updatedBlocks[title] = true;

          // Detect precise edits
          const edits = detectTextEdits(title, label, currentText, originalText);
          if (!updatedEditRanges[title]) updatedEditRanges[title] = {};
          updatedEditRanges[title][label] = edits;

          // Apply precise highlighting
          highlightEditedText(el, edits);
        }

        // Update snippet background - different colors for different states
        let snippetBg = colours.highlightNeutral; // Default unedited block
        if (lockedBlocks[title]) {
          snippetBg = lockedBg;
        } else if (changed) {
          snippetBg = editedBlockBg; // Edited block background
          el.classList.add('has-edits');
        } else if (autoInsertedBlocks[title]) {
          snippetBg = colours.highlightNeutral;
          el.classList.remove('has-edits');
        } else {
          el.classList.remove('has-edits');
        }

        el.style.backgroundColor = snippetBg;
      });

      // Update header with new edited state color
      const headerElement = document.getElementById(
        `template-block-header-${title.replace(/\s+/g, '-')}`
      );
      if (headerElement) {
        let bg = 'transparent';
        if (lockedBlocks[title]) {
          bg = lockedBg;
        } else if (blockHasEdits) {
          bg = editedBlockBg; // New edited state color
        } else if (insertedBlocks[title]) {
          bg = colours.highlightNeutral;
        }
        headerElement.style.backgroundColor = bg;
      }

      // Update block container background
      span.style.backgroundColor = lockedBlocks[title]
        ? lockedBg
        : blockHasEdits
          ? editedBlockBg
          : colours.highlightNeutral;

      const optionDiv = span.querySelector('div.option-choices') as HTMLElement | null;
      if (optionDiv) {
        if (blockHasEdits) {
          optionDiv.style.pointerEvents = 'none';
          optionDiv.style.opacity = '0.5';
        } else {
          optionDiv.style.pointerEvents = '';
          optionDiv.style.opacity = '';
        }
      }

      if (!updatedBlocks[title]) updatedBlocks[title] = false;
    });

    // Update the edit ranges state
    setEditedTextRanges(updatedEditRanges);

    return { blocks: updatedBlocks, snippets: updatedSnippets };
  }

  /**
   * Insert some HTML at the cursor. If there's no selection, we append at the end.
   */
  function insertAtCursor(html: string) {
    // Save current state before making changes (immediate, not debounced)
    const currentContent = bodyEditorRef.current?.innerHTML || body;
    saveToUndoStackImmediate(currentContent);

    if (!isSelectionInsideEditor()) {
      setBodyInternal(body + `\n\n${html}`);
      return;
    }

    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const fragment = document.createDocumentFragment();
      let node: ChildNode | null;
      while ((node = tempDiv.firstChild)) {
        fragment.appendChild(node);
      }
      range.insertNode(fragment);

      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      saveSelection();

      if (bodyEditorRef.current) {
        setBodyInternal(bodyEditorRef.current.innerHTML);
      }
    }
  }

  /**
   * Insert a single template option's preview text at the current cursor
   * position, without wrapping it in block controls.
   */
  function insertOptionAtCursor(block: TemplateBlock, optionLabel: string) {
    const option = block.options.find((o) => o.label === optionLabel);
    if (!option) return;
    let html = option.previewText.trim().replace(/\n/g, '<br />');
    html = applyDynamicSubstitutions(
      html,
      effectiveUserData,
      enquiry,
      amount,
      dealPasscode,
      undefined // Let applyDynamicSubstitutions construct URL with passcode
    );
    insertAtCursor(html);
  }

  /**
   * Insert a template block's text (either single or multiSelect) at the corresponding placeholder <span>.
   */
  function insertTemplateBlock(
    block: TemplateBlock,
    selectedOption: string | string[],
    shouldFocus: boolean = true,
    append: boolean = false
  ) {
    const snippetHtml: string[] = [];
    const snippetMap: { [label: string]: string } = {};
    if (block.isMultiSelect && isStringArray(selectedOption)) {
      selectedOption.forEach((opt) => {
        let text: string | null = null;
        let optObj: TemplateOption | undefined;
        if (opt === '__saved') {
          text = savedSnippets[block.title] || localStorage.getItem(`customSnippet_${block.title}`);
        } else {
          optObj = block.options.find((o) => o.label === opt);
          if (!optObj) return;
          text = optObj.previewText.trim().replace(/\n/g, '<br />');
        }
        if (text === null) return;
        text = applyDynamicSubstitutions(
          text,
          effectiveUserData,
          enquiry,
          amount,
          dealPasscode,
          undefined // Let applyDynamicSubstitutions construct URL with passcode
        );
        text = cleanTemplateString(text).replace(/<p>/g, `<p style="margin: 0;">`);
        text = wrapInsertPlaceholders(text);
        const escLabel = opt.replace(/'/g, "&#39;");
        // grab the ID if there is one
        const idAttr = optObj?.snippetId ? ` data-snippet-id="${optObj.snippetId}"` : '';
        const sentences = text
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 0)
          .map(s => {
            const trimmed = s.trim();
            return `<span data-sentence contenteditable="true"><span class="sentence-controls"><span class="sentence-handle" draggable="true" contenteditable="false"><i class="ms-Icon ms-Icon--GripperDotsVertical" aria-hidden="true"></i></span><span class="sentence-delete" contenteditable="false"><i class="ms-Icon ms-Icon--Cancel" aria-hidden="true"></i></span></span><span class="sentence-content">${trimmed}</span></span>`;
          })
          .join(' ');
        // inject it into your wrapper DIV
        const html = `<span class="snippet-wrapper" data-snippet="${escLabel}"${idAttr}>${sentences}</span>`;

        snippetHtml.push(html);
        snippetMap[opt] = html;
      });
    } else if (typeof selectedOption === 'string') {

      let text: string | null = null;
      let optObj: TemplateOption | undefined;
      if (selectedOption === '__saved') {
        text = savedSnippets[block.title] || localStorage.getItem(`customSnippet_${block.title}`);
      } else {
        optObj = block.options.find((o) => o.label === selectedOption);
        if (optObj) {
          text = optObj.previewText.trim().replace(/\n/g, '<br />');
        }
      }
      if (text !== null) {
        text = applyDynamicSubstitutions(
          text,
          effectiveUserData,
          enquiry,
          amount,
          dealPasscode,
          undefined // Let applyDynamicSubstitutions construct URL with passcode
        );
        text = cleanTemplateString(text).replace(/<p>/g, `<p style="margin: 0;">`);
        text = wrapInsertPlaceholders(text);
        const escLabel = selectedOption.replace(/'/g, "&#39;");
        const sentences = text
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 0)
          .map(
            (s) =>
              `<span data-sentence contenteditable="true"><span class="sentence-controls"><span class="sentence-handle" draggable="true" contenteditable="false"><i class="ms-Icon ms-Icon--GripperDotsVertical" aria-hidden="true"></i></span><span class="sentence-delete" contenteditable="false"><i class="ms-Icon ms-Icon--Cancel" aria-hidden="true"></i></span></span><span class="sentence-content">${s.trim()}</span></span>`
          )
          .join(' ');
        const idAttr = optObj?.snippetId ? ` data-snippet-id="${optObj.snippetId}"` : '';
        const html = `<span class="snippet-wrapper" data-snippet="${escLabel}"${idAttr}>${sentences}</span>`;
        snippetHtml.push(html);
        snippetMap[selectedOption] = html;
      }

    }

    const replacementText = snippetHtml.join('');
    let selectedLabel = '';
    if (block.isMultiSelect && isStringArray(selectedOption)) {
      selectedLabel = selectedOption.join(', ');
    } else if (typeof selectedOption === 'string') {
      selectedLabel = selectedOption;
    }
    const containerTag = 'span';
    const style = `background-color: ${colours.highlightNeutral}; padding: 7px; position: relative; border-radius: 0px; font-weight: normal;`;
    const innerHTML = cleanTemplateString(replacementText);
    const styledInnerHTML = innerHTML.replace(
      /<p>/g,
      `<p style="margin: 0;">`
    );
    const optionsHtml = block.options
      .map(o => {
        const isSel = block.isMultiSelect && Array.isArray(selectedOption)
          ? (selectedOption as string[]).includes(o.label)
          : selectedOption === o.label;
        return `<div class="option-choice${isSel ? ' selected' : ''}" data-block-title="${block.title}" data-option-label="${o.label}">${o.label}</div>`;
      })
      .join('');
    const savedSnippet = savedSnippets[block.title] || localStorage.getItem(`customSnippet_${block.title}`);
    const savedChoice = savedSnippet
      ? `<div class="option-choice${selectedOption === '__saved' ? ' selected' : ''}" data-block-title="${block.title}" data-option-label="__saved">Saved Snippet</div>`
      : '';
    const optionsHtmlCombined = optionsHtml + savedChoice;
    const labelText = `${block.title} (${getTemplateSetLabel(templateSet)}: ${selectedLabel})`;
    const labelHTML = `<div class="block-label-display" contenteditable="false">${labelText}</div>`;
    const pinnedClass = pinnedBlocks[block.title] ? ' pinned' : '';
    const overlayIcon = overlaySidebars ? 'DockRight' : 'DockLeft';
    const overlayActive = overlaySidebars ? ' active' : '';
    const controlsHTML = `<div class="block-sidebar${pinnedClass}" data-block-title="${block.title}" data-label="${labelText}"><div class="sidebar-handle" onclick="window.toggleBlockSidebar('${block.title}')"><i class="ms-Icon ms-Icon--${pinnedBlocks[block.title] ? 'ChevronRight' : 'ChevronLeft'}"></i></div><div class="actions"><span class="icon-btn pin-toggle${pinnedBlocks[block.title] ? ' pinned' : ''}" onclick="window.toggleBlockSidebar('${block.title}')"><i class="ms-Icon ms-Icon--${pinnedBlocks[block.title] ? 'Pinned' : 'Pin'}"></i></span><span class="icon-btn overlay-toggle${overlayActive}" onclick="window.toggleSidebarOverlayMode()"><i class="ms-Icon ms-Icon--${overlayIcon}"></i></span><span class="icon-btn" onclick="window.openSnippetEdit(event,'${block.title}')"><i class='ms-Icon ms-Icon--Save'></i></span><span class="icon-btn lock-toggle" onclick="window.toggleBlockLock('${block.title}')"><i class="ms-Icon ms-Icon--Unlock"></i></span><span class="icon-btn" onclick="window.removeBlock('${block.title}')"><i class="ms-Icon ms-Icon--Delete"></i></span></div><div class="option-choices">${optionsHtmlCombined}</div></div>`;
    const highlightedReplacement = `<${containerTag} class="block-container${pinnedClass}" style="${style}" data-inserted="${block.title}" data-placeholder="${block.placeholder}" contenteditable="true"><div class="block-main">${styledInnerHTML}${labelHTML}</div>${controlsHTML}</${containerTag}>`;


    // Simplified hover handlers to directly call highlightBlock
    const wrappedHTML = `<!--START_BLOCK:${block.title}--><span data-block-title="${block.title}" onmouseover="window.highlightBlock('${block.title}', true, 'editor')" onmouseout="window.highlightBlock('${block.title}', false, 'editor')">${highlightedReplacement}</span><!--END_BLOCK:${block.title}-->`;

    // Process the body replacement
    let newBody = body;
    const existingBlockRegex = new RegExp(
      `<!--START_BLOCK:${block.title}-->[\\s\\S]*?<!--END_BLOCK:${block.title}-->`,
      'g'
    );

    if (existingBlockRegex.test(newBody)) {
      if (append) {
        newBody = newBody.replace(existingBlockRegex, (match) =>
          match.replace(
            `<!--END_BLOCK:${block.title}-->`,
            `${highlightedReplacement}<!--END_BLOCK:${block.title}-->`
          )
        );
      } else {
        newBody = newBody.replace(existingBlockRegex, wrappedHTML);
      }
    } else {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newBody;
      const target = tempDiv.querySelector(
        `span[data-placeholder="${escapeForSelector(block.placeholder)}"]`
      );
      if (target) {
        (target as HTMLElement).innerHTML = wrappedHTML;
        newBody = tempDiv.innerHTML;
        bodyEditorRef.current &&
          (bodyEditorRef.current.innerHTML = newBody);
      } else {
        const placeholderEsc = block.placeholder.replace(
          /[-[\]{}()*+?.,\\^$|#\s]/g,
          '\\$&'
        );
        const placeholderEscEncoded = block.placeholder
          .replace(/&/g, '&amp;')
          .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const placeholderRegex = new RegExp(
          `(<span[^>]*data-placeholder="(?:${placeholderEsc}|${placeholderEscEncoded})"[^>]*>)([\\s\\S]*?)(</span>)`,
          'g'
        );
        newBody = newBody.replace(placeholderRegex, `$1${wrappedHTML}$3`);
        bodyEditorRef.current &&
          (bodyEditorRef.current.innerHTML = newBody);
      }
    }

    setBodyInternal(newBody);

    // Remove grey placeholder styling once the block is inserted
    setTimeout(() => {
      const phSpan = bodyEditorRef.current?.querySelector(
        `span[data-placeholder="${block.placeholder}"]`
      ) as HTMLElement | null;
      if (phSpan) {
        phSpan.style.backgroundColor = 'transparent';
        phSpan.style.padding = '0';
        phSpan.style.display = 'contents';
      }
    }, 0);

    setInsertedBlocks((prev) => ({ ...prev, [block.title]: true }));
    setLockedBlocks((prev) => ({ ...prev, [block.title]: false }));

    setOriginalBlockContent((prev) => ({
      ...prev,
      [block.title]: append
        ? (prev[block.title] || '') + `${styledInnerHTML}${controlsHTML}`
        : `${styledInnerHTML}${controlsHTML}`,
    }));
    setOriginalSnippetContent((prev) => ({
      ...prev,
      [block.title]: { ...(prev[block.title] || {}), ...snippetMap },
    }));
    setEditedSnippets((prev) => ({
      ...prev,
      [block.title]: {
        ...(prev[block.title] || {}),
        ...Object.fromEntries(Object.keys(snippetMap).map((k) => [k, false])),
      },
    }));
    setEditedBlocks((prev) => ({ ...prev, [block.title]: false }));

    if (shouldFocus) {
      setTimeout(() => {
        if (bodyEditorRef.current) {
          const insertedSpan = bodyEditorRef.current.querySelector(
            `span[data-inserted="${block.title}"]`
          );
          if (insertedSpan) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStartAfter(insertedSpan);
            range.collapse(true);
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
              saveSelection();
            }
          }

          // Attach helper functions to window for inline handlers
          (window as any).highlightBlock = highlightBlock;
          (window as any).toggleBlockLock = toggleBlockLock;
          (window as any).insertBlockOption = insertBlockOption;
        }
      }, 0);
    }
  }

  function replaceSnippetOption(
    block: TemplateBlock,
    previous: string,
    replacement: string
  ) {
    if (!bodyEditorRef.current) return;
    const span = bodyEditorRef.current.querySelector(
      `span[data-inserted="${block.title}"]`
    ) as HTMLElement | null;
    if (!span) return;
    const snippetEls = Array.from(
      span.querySelectorAll('[data-snippet]')
    ) as HTMLElement[];
    const targetEl = snippetEls.find(
      (el) => el.getAttribute('data-snippet') === previous
    );
    if (!targetEl) return;

    const option = block.options.find((o) => o.label === replacement);
    if (!option) return;
    let text = option.previewText.trim().replace(/\n/g, '<br />');
    text = applyDynamicSubstitutions(
      text,
    effectiveUserData,
      enquiry,
      amount,
      dealPasscode,
      undefined // Let applyDynamicSubstitutions construct URL with passcode
    );
    text = cleanTemplateString(text).replace(/<p>/g, `<p style="margin: 0;">`);
    text = wrapInsertPlaceholders(text);
    targetEl.setAttribute('data-snippet', replacement);
    if (option.snippetId) {
      targetEl.setAttribute('data-snippet-id', String(option.snippetId));
    } else {
      targetEl.removeAttribute('data-snippet-id');
    }
    targetEl.innerHTML = `${text}`;

    setOriginalSnippetContent((prev) => {
      const blockMap = { ...(prev[block.title] || {}) };
      // remove the old entry
      delete blockMap[previous];

      // build the new HTML, including data-snippet-id if present
      if (option.snippetId) {
        blockMap[replacement] = `
          <span
            class="snippet-wrapper"
            data-snippet="${replacement.replace(/'/g, "&#39;")}"
            data-snippet-id="${option.snippetId}"
          >
            ${text}
          </span>
        `;
      } else {
        blockMap[replacement] = `
          <span
            class="snippet-wrapper"
            data-snippet="${replacement.replace(/'/g, "&#39;")}"
          >
            ${text}
          </span>
        `;
      }

      return { ...prev, [block.title]: blockMap };
    });
    setEditedSnippets((prev) => {
      const blockMap = { ...(prev[block.title] || {}) } as { [label: string]: boolean };
      delete blockMap[previous];
      blockMap[replacement] = false;
      return { ...prev, [block.title]: blockMap };
    });

    const optionDiv = span.querySelector('div.option-choices');
    if (optionDiv) {
      const currentSelected = block.isMultiSelect
        ? (selectedTemplateOptions[block.title] as string[])
        : selectedTemplateOptions[block.title];
      const newSelected = block.isMultiSelect
        ? (currentSelected as string[]).map((opt) =>
          opt === previous ? replacement : opt
        )
        : replacement;
      const optionsHtml = block.options
        .filter((o) =>
          block.isMultiSelect && Array.isArray(newSelected)
            ? !(newSelected as string[]).includes(o.label)
            : newSelected !== o.label
        )
        .map((o) => {
          const safe = o.label.replace(/'/g, "&#39;");
          return `<span class="option-choice" data-block-title="${block.title}" data-option-label="${safe}">${o.label}</span>`;
        })
        .join(' ');
      const savedSnippet = savedSnippets[block.title] || localStorage.getItem(`customSnippet_${block.title}`);
      const savedChoice = savedSnippet ? `<span class="option-choice" data-block-title="${block.title}" data-option-label="__saved">Saved Snippet</span>` : '';
      const optionListContent = [optionsHtml, savedChoice]
        .filter(Boolean)
        .join(' ');
      optionDiv.innerHTML = optionListContent;
    }

    const updatedHtml = span.innerHTML;
    setOriginalBlockContent((prev) => ({ ...prev, [block.title]: updatedHtml }));
    setBody(bodyEditorRef.current.innerHTML);
    setBody(bodyEditorRef.current.innerHTML);

    if (block.isMultiSelect) {
      setSelectedTemplateOptions((prev) => {
        const arr = Array.isArray(prev[block.title])
          ? ([...prev[block.title]] as string[])
          : [];
        const idx = arr.indexOf(previous);
        if (idx !== -1) arr[idx] = replacement;
        return { ...prev, [block.title]: arr };
      });
    } else {
      setSelectedTemplateOptions((prev) => ({
        ...prev,
        [block.title]: replacement,
      }));
    }
  }
  function appendSnippetOption(block: TemplateBlock, optionLabel: string) {
    if (lockedBlocks[block.title]) return;
    if (!bodyEditorRef.current) return;
    const span = bodyEditorRef.current.querySelector(
      `span[data-inserted="${block.title}"]`
    ) as HTMLElement | null;
    if (!span) return;
    const main = span.querySelector('.block-main') as HTMLElement | null;
    if (!main) return;

    const option = block.options.find((o) => o.label === optionLabel);
    if (!option) return;

    let text = option.previewText.trim().replace(/\n/g, '<br />');
    text = applyDynamicSubstitutions(
      text,
      effectiveUserData,
      enquiry,
      amount,
      dealPasscode,
      undefined // Let applyDynamicSubstitutions construct URL with passcode
    );
    text = cleanTemplateString(text).replace(/<p>/g, `<p style="margin: 0;">`);
    text = wrapInsertPlaceholders(text);
    const escLabel = optionLabel.replace(/'/g, "&#39;");
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0)
      .map(
        (s) =>
          `<span data-sentence contenteditable="true"><span class="sentence-handle" draggable="true" contenteditable="false"><i class="ms-Icon ms-Icon--GripperDotsVertical" aria-hidden="true"></i></span><span class="sentence-delete" contenteditable="false"><i class="ms-Icon ms-Icon--Cancel" aria-hidden="true"></i></span>${s.trim()}</span>`
      )
      .join(' ');
    const snippetHtml = `<span class="snippet-wrapper" data-snippet="${escLabel}">${sentences}</span>`;

    main.insertAdjacentHTML('beforeend', snippetHtml);

    setOriginalSnippetContent((prev) => ({
      ...prev,
      [block.title]: {
        ...(prev[block.title] || {}),
        [optionLabel]: snippetHtml,
      },
    }));
    setEditedSnippets((prev) => ({
      ...prev,
      [block.title]: { ...(prev[block.title] || {}), [optionLabel]: false },
    }));

    const optionDiv = span.querySelector('div.option-choices');
    if (optionDiv) {
      const currentSelected = block.isMultiSelect
        ? (selectedTemplateOptions[block.title] as string[])
        : selectedTemplateOptions[block.title];
      const newSelected = block.isMultiSelect
        ? [
          ...((Array.isArray(currentSelected)
            ? currentSelected
            : []) as string[]),
          optionLabel,
        ]
        : optionLabel;
      const optionsHtml = block.options
        .map((o) => {
          const isSel = block.isMultiSelect && Array.isArray(newSelected)
            ? (newSelected as string[]).includes(o.label)
            : newSelected === o.label;
          return `<div class="option-choice${isSel ? ' selected' : ''}" data-block-title="${block.title}" data-option-label="${o.label}">${o.label}</div>`;
        })
        .join('');
      const savedSnippet = savedSnippets[block.title] || localStorage.getItem(`customSnippet_${block.title}`);
      const savedChoice = savedSnippet ? `<div class="option-choice" data-block-title="${block.title}" data-option-label="__saved">Saved Snippet</div>` : '';
      optionDiv.innerHTML = optionsHtml + savedChoice;
    }

    const updatedHtml = span.innerHTML;
    setOriginalBlockContent((prev) => ({ ...prev, [block.title]: updatedHtml }));
    setBodyInternal(bodyEditorRef.current.innerHTML);
  }

  async function saveCustomSnippet(blockTitle: string, label?: string, sortOrder?: number, isNew?: boolean) {
    if (!bodyEditorRef.current) return;
    const span = bodyEditorRef.current.querySelector(
      `span[data-inserted="${blockTitle}"]`
    ) as HTMLElement | null;
    if (!span) return;
    const main = span.querySelector('.block-main') as HTMLElement | null;
    if (!main) return;
    const snippetHtml = main.innerHTML;
    const firstSnippet = main.querySelector('[data-snippet-id]') as HTMLElement | null;
    const snippetId = firstSnippet ? parseInt(firstSnippet.getAttribute('data-snippet-id') || '0', 10) : undefined;
    const block = blocks.find(b => b.title === blockTitle);
    const blockId = block?.blockId;
    try {
      const url = `${getProxyBaseUrl()}/${process.env.REACT_APP_SUBMIT_SNIPPET_EDIT_PATH}?code=${process.env.REACT_APP_SUBMIT_SNIPPET_EDIT_CODE}`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippetId,
          proposedContent: snippetHtml,
          proposedLabel: label,
          proposedSortOrder: sortOrder,
          proposedBlockId: blockId,
          isNew,
          proposedBy: userInitials
        })
      });
      setSavedSnippets(prev => ({ ...prev, [blockTitle]: snippetHtml }));
      showToast('Snippet submitted for approval', 'success');
    } catch (err) {
      console.error('Failed to save snippet', err);
      showToast('Submission failed', 'error');
    }
  }

  async function submitPlaceholderOption(
    blockTitle: string,
    text: string,
    placeholder?: string,
    label?: string,
    sortOrder?: number,
    isNew?: boolean,
  ) {
    try {
      const url = `${getProxyBaseUrl()}/${process.env.REACT_APP_SUBMIT_SNIPPET_EDIT_PATH}?code=${process.env.REACT_APP_SUBMIT_SNIPPET_EDIT_CODE}`;
      const block = blocks.find(b => b.title === blockTitle);
      const blockId = block?.blockId;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposedContent: text,
          proposedLabel: label,
          proposedSortOrder: sortOrder,
          proposedBlockId: blockId,
          placeholder,
          isNew,
          proposedBy: userInitials,
        }),
      });
      showToast('Option submitted', 'success');
    } catch (err) {
      console.error('Failed to submit option', err);
      showToast('Save failed', 'error');
    }
  }

  function removeSnippetOption(block: TemplateBlock, optionLabel: string) {
    if (lockedBlocks[block.title]) return;
    if (!bodyEditorRef.current) return;
    const span = bodyEditorRef.current.querySelector(
      `span[data-inserted="${block.title}"]`
    ) as HTMLElement | null;
    if (!span) return;
    const snippets = Array.from(
      span.querySelectorAll('[data-snippet]')
    ) as HTMLElement[];
    const target = snippets.find(
      (el) => el.getAttribute('data-snippet') === optionLabel
    );
    if (target) target.remove();
    setOriginalSnippetContent((prev) => {
      const blockMap = { ...(prev[block.title] || {}) };
      delete blockMap[optionLabel];
      return { ...prev, [block.title]: blockMap };
    });
    setEditedSnippets((prev) => {
      const blockMap = { ...(prev[block.title] || {}) };
      delete blockMap[optionLabel];
      return { ...prev, [block.title]: blockMap };
    });

    const optionDiv = span.querySelector('div.option-choices');
    if (optionDiv) {
      const currentSelected = block.isMultiSelect
        ? (selectedTemplateOptions[block.title] as string[])
        : selectedTemplateOptions[block.title];
      const newSelected = block.isMultiSelect
        ? (currentSelected as string[]).filter((o) => o !== optionLabel)
        : '';
      const optionsHtml = block.options
        .map((o) => {
          const isSel = block.isMultiSelect && Array.isArray(newSelected)
            ? (newSelected as string[]).includes(o.label)
            : newSelected === o.label;
          return `<div class="option-choice${isSel ? ' selected' : ''}" data-block-title="${block.title}" data-option-label="${o.label}">${o.label}</div>`;
        })
        .join('');
      optionDiv.innerHTML = optionsHtml;
    }

    const updatedHtml = span.innerHTML;
    setOriginalBlockContent((prev) => ({ ...prev, [block.title]: updatedHtml }));
    setBody(bodyEditorRef.current.innerHTML);
  }

  function removeBlockOption(block: TemplateBlock, optionLabel: string) {
    if (lockedBlocks[block.title]) return;

    // Save current state before making changes (immediate, not debounced)
    const currentContent = bodyEditorRef.current?.innerHTML || body;
    saveToUndoStackImmediate(currentContent);

    if (block.isMultiSelect) {
      const current = Array.isArray(selectedTemplateOptions[block.title])
        ? ([...(selectedTemplateOptions[block.title] as string[])])
        : [];
      if (!current.includes(optionLabel)) return;
      const updated = current.filter((o) => o !== optionLabel);
      if (updated.length === 0) {
        handleClearBlock(block);
      } else {
        handleMultiSelectChange(block.title, updated);
        removeSnippetOption(block, optionLabel);
      }
    } else {
      if (selectedTemplateOptions[block.title] === optionLabel) {
        handleClearBlock(block);
      }
    }
  }

  function hideTemplateBlock(title: string) {
    const block = templateBlocks.find(b => b.title === title);
    if (!block) return;
    if (lockedBlocks[title]) return;

    // Save current state before making changes (immediate, not debounced)
    const currentContent = bodyEditorRef.current?.innerHTML || body;
    saveToUndoStackImmediate(currentContent);

    setHiddenBlocks(prev => ({ ...prev, [title]: true }));
    if (bodyEditorRef.current) {
      const span = bodyEditorRef.current.querySelector(
        `span[data-placeholder="${escapeForSelector(block.placeholder)}"]`
      ) as HTMLElement | null;
      if (span) {
        span.remove();
        setBodyInternal(bodyEditorRef.current.innerHTML);
      }
    }
  }

  function addTemplateBlock(title: string) {
    const block = templateBlocks.find(b => b.title === title);
    if (!block) return;
    setHiddenBlocks(prev => {
      const copy = { ...prev };
      delete copy[title];
      return copy;
    });
    if (bodyEditorRef.current) {
      const placeholderHTML = buildPlaceholder(block);
      const temp = document.createElement('div');
      temp.innerHTML = placeholderHTML;
      bodyEditorRef.current.appendChild(temp.firstChild as Node);
      setBody(bodyEditorRef.current.innerHTML);
    }
  }

  /**
   * When the user chooses an attachment from the list, we either insert or remove it.
   */
  function toggleAttachment(attachment: AttachmentOption) {
    if (attachment.status === 'draft') {
      return;
    }
    if (attachments.includes(attachment.key)) {
      // remove
      setAttachments((prev) => prev.filter((key) => key !== attachment.key));
      removeAttachmentLink(attachment.key);
    } else {
      setAttachments((prev) => [...prev, attachment.key]);
      saveSelection();
      const linkHTML = `<span style="background-color: #ffe6e6; padding: 1px 3px;" data-link="${attachment.key}"><a href="${attachment.link}" style="color: #3690CE; text-decoration: none;">${attachment.text}</a></span>`;
      insertAtCursor(linkHTML);
    }
  }

  /**
   * Removes the <span data-link="..."> for an attachment
   */
  function removeAttachmentLink(key: string) {
    if (bodyEditorRef.current) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = bodyEditorRef.current.innerHTML;
      const spans = tempDiv.querySelectorAll(`span[data-link="${key}"]`);
      spans.forEach((span) => {
        const parent = span.parentNode;
        if (parent) {
          parent.removeChild(span);
        }
      });
      const newBody = tempDiv.innerHTML;
      setBody(newBody);
    }
  }

  function getFilteredAttachments(): AttachmentOption[] {
    // Show only attachments relevant to the selected practice area
    const practiceArea = Object.keys(PracticeAreaPitch).find(
      (k) => PracticeAreaPitch[k as keyof PracticeAreaPitchType]
    ) || '';
    return availableAttachments.filter(
      (attachment) =>
        !attachment.applicableTo ||
        attachment.applicableTo.includes(practiceArea)
    );
  }

  function togglePreview() {
    if (!isPreviewOpen && bodyEditorRef.current) {
      Object.entries(selectedTemplateOptions).forEach(
        ([blockTitle, selectedOption]) => {
          const block = templateBlocks.find((b) => b.title === blockTitle);
          if (block && !insertedBlocks[block.title] && selectedOption) {
            insertTemplateBlock(block, selectedOption as any, false);
          }
        }
      );
      // Sync the latest editor content into state before showing the preview
      setBody(bodyEditorRef.current.innerHTML);
    }
    setIsPreviewOpen(!isPreviewOpen);
  }

  /**
   * Reset the entire form
   */
  function resetForm() {
    suppressSaveRef.current = true;
    setSubject('Your Enquiry');
    setTo(enquiry.Email || '');
    setCc('');
    setBcc('2day@followupthen.com');
    // Re-load the base template
    const newBody = generateInitialBody(
      templateBlocks.filter(b => !hiddenBlocks[b.title])
    );
    setBody(newBody);
    if (bodyEditorRef.current) {
      bodyEditorRef.current.innerHTML = newBody;
    }
    setAttachments([]);
    setFollowUp(undefined);
    setIsPreviewOpen(false);
    setIsErrorVisible(false);
    setErrorMessage('');
    setSelectedTemplateOptions({});
    setInsertedBlocks({});
    setAutoInsertedBlocks({});
    setLockedBlocks({});
    setPinnedBlocks({});
    setEditedBlocks({});
    setOriginalBlockContent({});
    setIsDraftConfirmed(false); // **Reset confirmation state**
    setDealId(null);
    setClientIds([]);
    localStorage.removeItem('pitchBuilderState');

    // Immediately clear any highlight styles from the DOM
    templateBlocks.forEach((block) => {
      highlightBlock(block.title, false);
    });
  }

  /**
   * Validate mandatory fields
   */
  function validateForm(): boolean {
    if (!to.trim()) {
      setErrorMessage('To field cannot be empty.');
      setIsErrorVisible(true);
      return false;
    }
    if (!subject.trim()) {
      setErrorMessage('Subject cannot be empty.');
      setIsErrorVisible(true);
      return false;
    }
    if (!body.trim()) {
      setErrorMessage('Email body cannot be empty.');
      setIsErrorVisible(true);
      return false;
    }
    // New mandatory deal capture fields
    if (!initialScopeDescription.trim()) {
      setErrorMessage('Service description is required.');
      setIsErrorVisible(true);
      return false;
    }
    const numericAmt = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (!amount.trim() || isNaN(numericAmt) || numericAmt <= 0) {
      setErrorMessage('Estimated fee is required (enter a positive number).');
      setIsErrorVisible(true);
      return false;
    }
    setIsErrorVisible(false);
    setErrorMessage('');
    return true;
  }

  async function insertDealIfNeeded(options?: { background?: boolean; bccAdditional?: string }): Promise<string | null> {
    try {
      // Check if deal creation is already in progress or if we already have a passcode
      if (dealCreationInProgress) {
        console.log('⏸️ Deal creation already in progress, skipping duplicate call');
        return null;
      }

      if (dealPasscode) {
        console.log('✅ Deal passcode already exists:', dealPasscode);
        return dealPasscode;
      }

      setDealCreationInProgress(true);

      if (!options?.background) {
        setDealStatus('processing');
      }

      const numericAmount = options?.background ? 0 : parseFloat(amount.replace(/,/g, '')) || 0;
      // Updated to use server route instead of Azure Function
      const url = `/api/deal-capture`;
      
      // Show initial loading state (only for foreground operations)
      if (!options?.background) {
        showToast('Preparing deal capture...', 'info', {
          loading: true,
          details: 'Validating enquiry data and formatting request',
          progress: 10,
          duration: 0
        });
      }
      
      // Ensure we always send a non-empty description. If the user hasn't set one,
      // do NOT fall back to the email body. Require an explicit short description instead.
      const fallbackDescription = (() => {
        if (options?.background) return 'Placeholder deal capture (phased out)';
        if (initialScopeDescription && initialScopeDescription.trim()) return initialScopeDescription.trim();
        // Foreground path with no description: block and prompt the user.
        setDealStatus('error');
        showToast('Service description required', 'error', {
          details: 'Add a short scope & quote description before capturing the deal.',
          duration: 5000
        });
        return '';
      })();

      if (!fallbackDescription) {
        return null;
      }

      // Resolve a usable numeric prospect id. Accept (in priority order): acid, ID, id.
      // Reject non-digit values and placeholder/zero ids.
      const rawCandidates = [
        // @ts-ignore (runtime objects may have acid/id even if not in primary interface)
        enquiry?.acid,
        enquiry?.ID,
        // @ts-ignore
        enquiry?.id
      ].map(v => (v === undefined || v === null ? '' : String(v).trim()));
      const resolvedProspectId = rawCandidates.find(v => /^\d+$/.test(v) && v !== '' && v !== '0' && v !== '00000');

      if (!resolvedProspectId) {
        if (options?.background) {
          console.log('⏳ Skipping background deal insert: no valid numeric prospect id yet', rawCandidates);
          return null;
        }
        // Foreground: allow one short retry window in case acid arrives milliseconds later.
        const retryWindowMs = 1200;
        const start = Date.now();
        let retryId: string | undefined;
        while ((Date.now() - start) < retryWindowMs && !retryId) {
          await new Promise(r => setTimeout(r, 150));
          const lateCandidates = [
            // @ts-ignore
            enquiry?.acid,
            enquiry?.ID,
            // @ts-ignore
            enquiry?.id
          ].map(v => (v === undefined || v === null ? '' : String(v).trim()));
          retryId = lateCandidates.find(v => /^\d+$/.test(v) && v !== '' && v !== '0' && v !== '00000');
          if (retryId) {
            console.log('✅ Prospect id appeared after brief wait', { retryId, lateCandidates });
          }
        }
        if (!retryId) {
          setDealStatus('error');
          showToast('Missing prospect id', 'error', {
            details: 'Cannot capture deal until enquiry ID/acid is loaded',
            duration: 5000
          });
          return null;
        }
        // Use the newly found id
        console.log('🆔 Using late-resolved prospect id', retryId);
        return await insertDealIfNeeded(options); // restart with id now present
      }

      const payload = {
        // when background=true, override description to make it obvious these were auto-created
        initialScopeDescription: fallbackDescription,
        amount: numericAmount,
        areaOfWork: enquiry.Area_of_Work,
        prospectId: resolvedProspectId,
        pitchedBy: userInitials,
        isMultiClient: isMultiClientFlag,
        leadClientEmail: enquiry.Email,
        // LeadClientId must mirror prospectId for single-client deals
        leadClientId: resolvedProspectId,
        // Include email recipient details for monitoring notification
        emailRecipients: {
          to: to || enquiry.Point_of_Contact || enquiry.Email,
          cc: cc || '',
          bcc: buildBccList(options?.bccAdditional),
          feeEarnerEmail: userEmailAddress
        },
        // Pitch content fields
        emailSubject: subject || '',
        emailBody: body || '',
        emailBodyHtml: body || '', // Use same content for now, could be enhanced later
        reminders: [], // Could be populated from UI in future
        notes: enquiry.Initial_first_call_notes || '',
        ...(isMultiClientFlag && {
          clients: dealClients.map((c) => ({
            clientEmail: c.email,
            prospectId: ADDITIONAL_CLIENT_PLACEHOLDER_ID,
          })),
        }),
      };
      console.log('🆔 Deal ID resolution', { rawCandidates, resolvedProspectId, sendingPayload: payload });

      // Update progress
      if (!options?.background) {
        showToast('Saving deal…', 'info', {
          loading: true,
          details: `Capturing details for ${enquiry.Point_of_Contact || 'client'}`,
          progress: 30,
          duration: 0
        });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('🔌 Deal creation response:', { 
        ok: response.ok, 
        status: response.status, 
        statusText: response.statusText 
      });

      if (!options?.background) {
        showToast('Finalising deal…', 'info', {
          loading: true,
          details: 'Generating passcode and instruction link',
          progress: 70,
          duration: 0
        });
      }

      if (response.ok) {
        const data = await response.json();
        console.log('📦 Deal creation data:', data);
        if (data?.passcode) {
          const norm = normalizePasscode(data.passcode, enquiry?.ID);
          console.log('🎫 Setting deal passcode (normalized):', data.passcode, '->', norm);
          if (norm) setDealPasscode(norm);
          
          if (!options?.background) {
            setDealStatus('ready');
          }
          
          // ✅ Enhanced success feedback
          if (!options?.background) {
            showToast('Deal captured successfully!', 'success', {
              details: `Passcode ${norm} created • Instruction link ready`,
              icon: 'CompletedSolid',
              duration: 4000
            });
          }
          
          // ✅ Trigger same confirmation message as draft/send
          setIsDraftConfirmed(true);
          setTimeout(() => setIsDraftConfirmed(false), 3000);
          return norm || data.passcode; // Return normalized (or raw fallback)
        } else {
          console.warn('⚠️ No passcode in response data');
          if (!options?.background) {
            setDealStatus('error');
            showToast('Deal saved with warning', 'warning', {
              details: 'Deal created but passcode generation failed',
              icon: 'WarningSolid',
              duration: 5000
            });
          }
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Deal creation failed:', errorText);
        if (!options?.background) {
          setDealStatus('error');
          showToast('Deal capture failed', 'error', {
            details: `Server error: ${response.status} ${response.statusText}`,
            icon: 'ErrorBadge',
            duration: 6000
          });
        }
      }

      return null;
    } catch (e) {
      console.error('Failed to insert deal:', e);
      if (!options?.background) {
        setDealStatus('error');
        showToast('Connection error', 'error', {
          details: 'Unable to reach deal capture service',
          icon: 'PlugDisconnected',
          duration: 5000
        });
      }
      return null;
    } finally {
      setDealCreationInProgress(false);
    }
  }

  // Auto-create deal/passcode in background when PitchBuilder mounts and no passcode exists.
  // DISABLED: This was creating unwanted placeholder deals. Real deals are created when users send/draft emails.
  useEffect(() => {
    // Background deal creation disabled to prevent duplicate placeholder deals
    console.log('🔍 Background deal creation disabled - real deals created on send/draft');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiry?.ID]);

  /**
   * Helper function to get email from team table by initials
   */
  async function getEmailFromTeamTable(initials: string): Promise<string> {
    if (!initials || !initials.trim()) return '';
    
    try {
      // Use the same pattern as other API calls in the app
      const response = await fetch(`${getProxyBaseUrl()}/api/team-lookup?initials=${encodeURIComponent(initials.trim())}`);
      if (response.ok) {
        const data = await response.json();
        return data.email || '';
      }
    } catch (error) {
      console.warn('Failed to lookup team member email:', error);
    }
    
    // Fallback to constructed email if API fails
    return `${initials.toLowerCase().trim()}@helix-law.com`;
  }

  /**
   * Get the solicitor's email for CC'ing
   */
  async function getSolicitorEmail(): Promise<string> {
    // Try to get solicitor from Call_Taker field or other relevant fields
    const solicitorInitials = enquiry.Call_Taker || enquiry.pocname;
    if (solicitorInitials && solicitorInitials.trim()) {
      // If solicitor is the current user, prefer the initials alias (lz@) over personal mailbox (luke@)
      if ((solicitorInitials || '').trim().toUpperCase() === userInitials.trim().toUpperCase()) {
        return getAliasFromInitials(userInitials);
      }
      return await getEmailFromTeamTable(solicitorInitials);
    }
    return '';
  }

  /** Build canonical helix-law alias from initials (e.g., 'LZ' -> 'lz@helix-law.com'). */
  function getAliasFromInitials(initials: string | undefined | null): string {
    const v = (initials || '').trim();
    return v ? `${v.toLowerCase()}@helix-law.com` : '';
  }

  /**
   * Build CC list including solicitor for client emails
   */
  async function buildCcList(includeSolicitor: boolean = true): Promise<string> {
    const ccList: string[] = [];
    
    // Add existing CC if any
    if (cc && cc.trim()) {
      ccList.push(cc.trim());
    }
    
    // Add solicitor for client emails
    if (includeSolicitor) {
      const solicitorEmail = await getSolicitorEmail();
      if (solicitorEmail && solicitorEmail !== userEmailAddress) {
        ccList.push(solicitorEmail);
      }
    }
    
    return ccList.join(', ');
  }

  /**
   * Build BCC list with safety addresses
   */
  function buildBccList(additionalBcc?: string): string {
    const bccList: string[] = [];
    
    // Add existing BCC
    if (bcc && bcc.trim()) {
      bccList.push(bcc.trim());
    }
    
    // Add additional BCC if provided (exclude lz@helix-law.com)
    if (additionalBcc && additionalBcc.trim() && additionalBcc.trim() !== 'lz@helix-law.com') {
      bccList.push(additionalBcc.trim());
    }
    
    // Add safety net addresses as requested
    bccList.push('cb@helix-law.com');
    
    // Remove duplicates and filter out lz@helix-law.com
    const filtered = Array.from(new Set(bccList)).filter(email => email !== 'lz@helix-law.com');
    return filtered.join(', ');
  }

  /**
   * Send email directly to client from fee earner's email address
   */
  async function sendEmail() {
    if (!validateForm()) {
      return;
    }

    if (!body || !enquiry.Point_of_Contact) {
      setErrorMessage('Email contents and recipient email are required.');
      setIsErrorVisible(true);
      return;
    }

    setEmailStatus('processing');
    setEmailMessage('Preparing to send…');
    showToast('Preparing to send email...', 'info', {
      loading: true,
      details: 'Validating form data and deal information',
      progress: 10,
      duration: 0
    });

  const senderEmail = userEmailAddress || 'automations@helix-law.com';
  const dealPasscode = await insertDealIfNeeded({ bccAdditional: senderEmail });
    if (!dealPasscode) {
      setEmailStatus('error');
      setEmailMessage('Deal save failed');
      showToast('Failed to save deal', 'error', {
        details: 'Cannot send email without valid deal reference',
        duration: 5000
      });
      return;
    }

    // Ensure template blocks are inserted before sending
    if (bodyEditorRef.current) {
      Object.entries(selectedTemplateOptions).forEach(
        ([blockTitle, selectedOption]) => {
          const block = templateBlocks.find((b) => b.title === blockTitle);
          if (block && !insertedBlocks[block.title] && selectedOption) {
            insertTemplateBlock(block, selectedOption as any, false);
          }
        }
      );
      setBody(bodyEditorRef.current.innerHTML);
    }

    // Step 2: Content processing
    setEmailMessage('Processing content…');
    showToast('Processing email content...', 'info', {
      loading: true,
      details: 'Applying substitutions and formatting',
      progress: 40,
      duration: 0
    });

    await delay(400);

    // Check if V2 processing was requested from the confirmation dialog
    const useV2Processing = (window as any).__helixEmailProcessingV2__ === true;
    let finalHtml: string;

    if (useV2Processing) {
      console.log('Using V2 email processing (experimental enhanced formatting)');
      // Use EmailProcessor V2 for enhanced processing
      finalHtml = EmailProcessor.processCompleteEmail(body, {
        userData: effectiveUserData,
        enquiry,
        amount,
        passcode: normalizePasscode(dealPasscode, enquiry?.ID) || dealPasscode,
        editorElement: bodyEditorRef.current,
        forceV2: true
      });
    } else {
      console.log('Using V1 email processing (production method)');
      // Use original V1 processing method
      let rawHtml = removeHighlightSpans(body);
      rawHtml = applyDynamicSubstitutions(
        rawHtml,
        effectiveUserData,
        enquiry,
        amount,
        normalizePasscode(dealPasscode, enquiry?.ID) || dealPasscode,
        undefined
      );

      // Remove leftover placeholders and format paragraphs
      const noPlaceholders = removeUnfilledPlaceholders(rawHtml, templateBlocks);
      finalHtml = convertDoubleBreaksToParagraphs(noPlaceholders);
    }

    // Step 3: Email composition with signature
    setEmailMessage('Generating final email…');
    showToast('Generating final email...', 'info', {
      loading: true,
      details: 'Creating formatted email with signature',
      progress: 70,
      duration: 0
    });

    const fullEmailHtml = ReactDOMServer.renderToStaticMarkup(
  <EmailSignature bodyHtml={finalHtml} userData={effectiveUserData} experimentalLayout={useV2Processing} />
    );

    // Use fee earner's email as sender, fallback to automations
  // senderEmail defined above for consistency with insertDeal payload
    
  // No CC on send. BCC the sender (self) and safety addresses (LZ/CB).
  const bccList = buildBccList(senderEmail);
    
    const requestBody = {
      email_contents: fullEmailHtml,
      user_email: to, // Client's email as recipient
      subject: subject, // Use 'subject' not 'subject_line' for decoupled function
      from_email: senderEmail, // Send from fee earner's email
      bcc_emails: bccList, // BCC sender + safety addresses
      saveToSentItems: true, // 🎯 Save to fee earner's Sent Items folder
      // Include recipient details for monitoring notification
      recipient_details: {
        to: to,
        cc: cc || '',
        bcc: bccList,
        fee_earner: senderEmail
      }
    };

    // Guard: ensure we have a valid recipient email
    if (!to || to.trim() === '') {
      setErrorMessage('Cannot send email: recipient email address is not available.');
      setIsErrorVisible(true);
      showToast('Failed to send email', 'error', {
        details: 'Recipient email address not configured',
        duration: 5000
      });
      return;
    }

    try {
      setErrorMessage('');
      setIsErrorVisible(false);

      // Step 4: Send email via API
      setEmailMessage(`Sending to ${enquiry.Point_of_Contact || to}…`);
      showToast('Sending email...', 'info', {
        loading: true,
        details: `Delivering to ${enquiry.Point_of_Contact || to}`,
        progress: 90,
        duration: 0
      });

      const response = await fetch(
        `/api/sendEmail`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to send email.');
      }

      // Success feedback
      showToast('Email sent successfully!', 'success', {
        details: `Message delivered to ${enquiry.Point_of_Contact || to}`,
        icon: 'MailSolid',
        duration: 4000
      });

      setEmailStatus('sent');
      setEmailMessage('Sent');

      setIsSuccessVisible(true);
      // Don't reset form after sending - users may want to send follow-ups or make edits
      setIsDraftConfirmed(true);
      setTimeout(() => setIsDraftConfirmed(false), 3000);

    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to send email';
      console.error('Email send error:', error);
      
      setErrorMessage(`Failed to send email: ${errorMsg}`);
      setIsErrorVisible(true);
      setEmailStatus('error');
      setEmailMessage(errorMsg);
      
      showToast('Failed to send email', 'error', {
        details: errorMsg,
        duration: 8000
      });
    }
  }

  const inTeams = isInTeams();
  const useLocalData =
    process.env.REACT_APP_USE_LOCAL_DATA === 'true' || !inTeams;

  function initiateDraftEmail() {
    const allowed = ['LZ', 'AC', 'JD'];
    if (useLocalData || allowed.includes(userInitials)) {
      setActiveTab('deals');
    } else {
      handleDraftEmail();
      setActiveTab('details');
      setActiveTab('details');
    }
  }

  /**
   * handleDraftEmail: keep HTML, remove placeholders & highlights, convert <br><br> to <p>, then pass to EmailSignature.
   */
  async function handleDraftEmail() {
    if (!body || !enquiry.Point_of_Contact) {
      setErrorMessage('Email contents and user email are required.');
      setIsErrorVisible(true);
      return;
    }
    setEmailStatus('processing');
    setEmailMessage('Preparing draft…');
    if (bodyEditorRef.current) {
      Object.entries(selectedTemplateOptions).forEach(
        ([blockTitle, selectedOption]) => {
          const block = templateBlocks.find((b) => b.title === blockTitle);
          if (block && !insertedBlocks[block.title] && selectedOption) {
            insertTemplateBlock(block, selectedOption as any, false);
          }
        }
      );
      setBody(bodyEditorRef.current.innerHTML);
    }

    // Step 1: Deal capture with enhanced feedback
    showToast('Starting email draft process...', 'info', {
      loading: true,
      details: 'Saving deal and generating passcode',
      progress: 15,
      duration: 0
    });

    // Ensure description exists prior to drafting
    if (!initialScopeDescription || !initialScopeDescription.trim()) {
      setErrorMessage('Service description is required before drafting.');
      setIsErrorVisible(true);
      showToast('Missing service description', 'error', {
        details: 'Please add a short scope & quote description.',
        duration: 4000
      });
      return;
    }
    const currentPasscode = await insertDealIfNeeded({ bccAdditional: undefined });
    if (!currentPasscode) {
      setEmailStatus('error');
      setEmailMessage('Deal save failed');
      showToast('Failed to save deal', 'error', {
        details: 'Cannot proceed without valid deal reference',
        duration: 5000
      });
      return;
    }

    // Step 2: Content processing
    setEmailMessage('Processing content…');
    showToast('Processing email content...', 'info', {
      loading: true,
      details: 'Applying substitutions and formatting',
      progress: 40,
      duration: 0
    });

    await delay(400); // Brief pause to show progress

    // Check if V2 processing was requested (in case draft follows a send operation)
    const useV2Processing = (window as any).__helixEmailProcessingV2__ === true;
    let finalHtml: string;

    if (useV2Processing) {
      console.log('Using V2 email processing for draft (experimental enhanced formatting)');
      // Use EmailProcessor V2 for enhanced processing
      finalHtml = EmailProcessor.processCompleteEmail(body, {
        userData: effectiveUserData,
        enquiry,
        amount,
        passcode: normalizePasscode(currentPasscode, enquiry?.ID) || currentPasscode,
        editorElement: bodyEditorRef.current,
        forceV2: true
      });
    } else {
      console.log('Using V1 email processing for draft (production method)');
      // Use original V1 processing method
      let rawHtml = removeHighlightSpans(body);

      // Apply dynamic substitutions such as amount just before sending
      // Use the fresh passcode from the API call, not the state variable
      rawHtml = applyDynamicSubstitutions(
        rawHtml,
        effectiveUserData,
        enquiry,
        amount,
        normalizePasscode(currentPasscode, enquiry?.ID) || currentPasscode,
        undefined // Let applyDynamicSubstitutions construct URL with passcode
      );

      // Remove leftover placeholders
      const noPlaceholders = removeUnfilledPlaceholders(rawHtml, templateBlocks);

      // After removing leftover placeholders/highlights in handleDraftEmail():
      finalHtml = convertDoubleBreaksToParagraphs(noPlaceholders);
    }

    // Step 3: Email composition
    setEmailMessage('Generating email draft…');
    showToast('Preparing draft…', 'info', {
      loading: true,
      details: 'Formatting content and signature',
      progress: 70,
      duration: 0
    });

    const fullEmailHtml = ReactDOMServer.renderToStaticMarkup(
  <EmailSignature bodyHtml={finalHtml} userData={effectiveUserData} />
    );

  // Draft: send to the user themselves; BCC only safety addresses (no CC)
  const bccList = buildBccList(); // LZ/CB only

    const requestBody = {
      email_contents: fullEmailHtml,
      user_email: userEmailAddress, // Draft to self
      subject: subject, // Use 'subject' for consistency with sendEmail function
      to,
      from_email: userEmailAddress || undefined,
      bcc_emails: bccList, // Safety only
      saveToSentItems: true, // 🎯 Save draft to Sent Items folder
    };

    // Guard: ensure we have a valid recipient email for the drafted message
    if (!userEmailAddress || userEmailAddress.trim() === '') {
      setErrorMessage('Cannot draft email: sender email address is not available.');
      setIsErrorVisible(true);
      showToast('Failed to draft email', 'error', {
        details: 'Sender email address not configured',
        duration: 5000
      });
      return;
    }

    try {
      setErrorMessage('');
      setIsErrorVisible(false);

      // Step 4: Sending to Outlook
      setEmailMessage('Creating draft…');
      showToast('Creating draft…', 'info', {
        loading: true,
        details: 'Saving to Outlook',
        progress: 90,
        duration: 0
      });
      const response = await fetch(
        `/api/sendEmail`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to draft email.');
      }

      // Success feedback with completion details
      showToast('Draft created', 'success', {
        details: `Saved to Outlook for ${enquiry.Point_of_Contact || 'client'}`,
        icon: 'MailSolid',
        duration: 4000
      });

      setEmailStatus('sent');
      setEmailMessage('Draft created');

      setIsSuccessVisible(true);
      setIsDraftConfirmed(true); // **Set confirmation state**
      setTimeout(() => {
        setIsDraftConfirmed(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error drafting email:', error);
      setErrorMessage(error.message || 'An unknown error occurred.');
      setIsErrorVisible(true);
      setEmailStatus('error');
      setEmailMessage(error.message || 'Unable to create email draft');
      showToast('Failed to draft email', 'error', {
        details: error.message || 'Unable to create email draft',
        icon: 'MailSolid',
        duration: 5000
      });
    }
  }

  function handleDealFormSubmit(data: {
    initialScopeDescription: string;
    amount: number;
    isMultiClient: boolean;
    clients: { firstName: string; lastName: string; email: string }[];
  }) {
    setInitialScopeDescription(data.initialScopeDescription);
    setAmount(data.amount.toString());
    setDealClients(data.clients);
    setIsMultiClientFlag(data.isMultiClient);
    setActiveTab('details');
  }

  /**
   * Hide success message automatically after 3s
   */
  useEffect(() => {
    if (isSuccessVisible) {
      const timer = setTimeout(() => setIsSuccessVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccessVisible]);

  /**
   * Hide error after 5s
   */
  useEffect(() => {
    if (isErrorVisible) {
      const timer = setTimeout(() => setIsErrorVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isErrorVisible]);

  /**
   * Keep the editor's HTML in sync with our `body` state
   */
  useEffect(() => {
    if (
      bodyEditorRef.current &&
      bodyEditorRef.current.innerHTML !== body &&
      document.activeElement !== bodyEditorRef.current
    ) {
      bodyEditorRef.current.innerHTML = body;
    }
  }, [body]);

  /**
   * Update selected template options for multi-select blocks
   */
  function handleMultiSelectChange(blockTitle: string, selectedOptions: string[]) {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOptions,
    }));
    setAutoInsertedBlocks((prev) => ({ ...prev, [blockTitle]: false }));
  }

  useEffect(() => {
    Object.entries(selectedTemplateOptions).forEach(([blockTitle, selectedOption]) => {
      const block = templateBlocks.find((b) => b.title === blockTitle);
      if (block && insertedBlocks[block.title]) {
        insertTemplateBlock(block, selectedOption, false);
      }
    });
  }, [amount]);

  /**
   * Update selected template options for single-select blocks
   */
  function handleSingleSelectChange(blockTitle: string, selectedOption: string) {
    setSelectedTemplateOptions((prev) => ({
      ...prev,
      [blockTitle]: selectedOption,
    }));
    setAutoInsertedBlocks((prev) => ({ ...prev, [blockTitle]: false }));
  }

  /**
   * For simple formatting commands (bold, italic, etc.)
   */
  function applyFormat(command: string, value?: string) {
    document.execCommand(command, false, value);
    if (bodyEditorRef.current) {
      setBody(bodyEditorRef.current.innerHTML);
    }
  }

  function handleInput() {
    if (!bodyEditorRef.current) return;
    setBody(bodyEditorRef.current.innerHTML);

    const { blocks, snippets } = computeSnippetChanges();
    if (Object.keys(blocks).length > 0) {
      setEditedBlocks((prev) => ({ ...prev, ...blocks }));
    }
    if (Object.keys(snippets).length > 0) {
      setEditedSnippets((prev) => {
        const copy = { ...prev } as { [key: string]: { [label: string]: boolean } };
        Object.entries(snippets).forEach(([title, map]) => {
          copy[title] = { ...(copy[title] || {}), ...map };
        });
        return copy;
      });
    }
  }

  function handleBlur() {
    if (bodyEditorRef.current) {
      setBody(bodyEditorRef.current.innerHTML);

      const { blocks, snippets } = computeSnippetChanges();

      if (Object.keys(snippets).length > 0) {
        setEditedSnippets((prev) => {
          const copy = { ...prev } as { [key: string]: { [label: string]: boolean } };
          Object.entries(snippets).forEach(([title, map]) => {
            copy[title] = { ...(copy[title] || {}), ...map };
          });
          return copy;
        });
      }

      if (Object.keys(blocks).length > 0) {
        setEditedBlocks((prev) => ({ ...prev, ...blocks }));
      }
    }
  }

  /**
   * When you click "clear" on a block, we remove its inserted text,
   * restoring the original placeholder <span>.
   */
  function removeBlockByMarkers(
    container: HTMLElement,
    title: string,
    placeholderHTML: string
  ): boolean {
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_COMMENT,
      null
    );
    let start: Comment | null = null;
    let end: Comment | null = null;
    while (walker.nextNode()) {
      const comment = walker.currentNode as Comment;
      if (comment.nodeValue === `START_BLOCK:${title}`) {
        start = comment;
      } else if (comment.nodeValue === `END_BLOCK:${title}`) {
        end = comment;
        break;
      }
    }
    if (start && end) {
      const range = document.createRange();
      range.setStartBefore(start);
      range.setEndAfter(end);
      range.deleteContents();
      const temp = document.createElement('div');
      temp.innerHTML = placeholderHTML;
      const node = temp.firstChild as Node;
      range.insertNode(node);
      return true;
    }
    return false;
  }
  function handleClearBlock(block: TemplateBlock) {
    // Save current state before making changes (immediate, not debounced)
    const currentContent = bodyEditorRef.current?.innerHTML || body;
    saveToUndoStackImmediate(currentContent);

    if (bodyEditorRef.current) {
      // Build a regex to capture everything between the markers.
      const safeTitle = block.title.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(
        `<!--START_BLOCK:${safeTitle}-->[\\s\\S]*?<!--END_BLOCK:${safeTitle}-->`,
        'g'
      );
      // Build the original placeholder markup.
      const placeholderHTML = buildPlaceholder(block);
      // Replace via regex. If no match is found (comments removed during edit),
      // fall back to querying the inserted span in the DOM.
      let updatedBody = bodyEditorRef.current.innerHTML;
      let removed = false;
      if (regex.test(updatedBody)) {
        updatedBody = updatedBody.replace(regex, placeholderHTML);
        bodyEditorRef.current.innerHTML = updatedBody;
        removed = true;
      } else if (
        removeBlockByMarkers(bodyEditorRef.current, block.title, placeholderHTML)
      ) {
        updatedBody = bodyEditorRef.current.innerHTML;
        removed = true;
      } else {
        let inserted = bodyEditorRef.current.querySelector(
          `[data-inserted="${block.title}"]`
        ) as HTMLElement | null;
        if (!inserted) {
          inserted = bodyEditorRef.current.querySelector(
            `[data-block-title="${block.title}"]`
          ) as HTMLElement | null;
        }
        if (!inserted) {
          try {
            inserted = bodyEditorRef.current.querySelector(
              `.block-container[data-placeholder="${escapeForSelector(block.placeholder)}"]`
            ) as HTMLElement | null;
          } catch {
            inserted = null;
          }
        }
        if (inserted) {
          const temp = document.createElement('div');
          temp.innerHTML = placeholderHTML;
          inserted.replaceWith(temp.firstChild as Node);
          updatedBody = bodyEditorRef.current.innerHTML;
          removed = true;
        }
      }
      if (removed) {
        setBodyInternal(updatedBody);
        // Remove highlight right away so the user sees immediate feedback
        highlightBlock(block.title, false);

        // Update state for the selected options and inserted block flag.
        setSelectedTemplateOptions((prev) => ({
          ...prev,
          [block.title]: block.isMultiSelect ? [] : '',
        }));
        setInsertedBlocks((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });
        setLockedBlocks((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });

        setPinnedBlocks((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });

        setEditedBlocks((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });
        setOriginalBlockContent((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });

        setOriginalSnippetContent((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });
        setEditedSnippets((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });
        setAutoInsertedBlocks((prev) => {
          const copy = { ...prev };
          delete copy[block.title];
          return copy;
        });
      } else {
        console.warn('Failed to clear block:', block.title);
      }
    }
  }

  function clearAllBlocks() {
    if (bodyEditorRef.current) {
      let newBody = bodyEditorRef.current.innerHTML;
      templateBlocks.forEach((block) => {
        const regex = new RegExp(
          `<!--START_BLOCK:${block.title}-->[\\s\\S]*?<!--END_BLOCK:${block.title}-->`,
          'g'
        );
        const placeholderHTML = buildPlaceholder(block); newBody = newBody.replace(regex, placeholderHTML);
      });
      bodyEditorRef.current.innerHTML = newBody;
      setBody(newBody);
    }
    setSelectedTemplateOptions({});
    setInsertedBlocks({});
    setAutoInsertedBlocks({});
    setLockedBlocks({});
    setPinnedBlocks({});
    setEditedBlocks({});
    setOriginalBlockContent({});
    setOriginalSnippetContent({});
    setEditedSnippets({});
    templateBlocks.forEach((block) => highlightBlock(block.title, false));
  }

  function reorderTemplateBlocks(start: number, end: number) {
    setBlocks((prev) => {
      const updated = Array.from(prev);
      const [moved] = updated.splice(start, 1);
      updated.splice(end, 0, moved);
      return updated;
    });
  }

  function duplicateTemplateBlock(index: number) {
    setBlocks((prev) => {
      const copy = [...prev];
      const block = { ...copy[index] };
      let base = block.title;
      let suffix = 1;
      let newTitle = `${base} Copy`;
      const titles = new Set(copy.map((b) => b.title));
      while (titles.has(newTitle)) {
        suffix += 1;
        newTitle = `${base} Copy ${suffix}`;
      }
      block.title = newTitle;
      copy.splice(index + 1, 0, block);
      return copy;
    });
  }

  /**
   * Renders the "preview" text for a selected block in the UI
   */
  function renderPreview(block: TemplateBlock) {
    const selectedOptions = selectedTemplateOptions[block.title];
    const isInserted = insertedBlocks[block.title] || false;

    const isEdited = Object.values(editedSnippets[block.title] || {}).some(Boolean);

    if (
      !selectedOptions ||
      (block.isMultiSelect &&
        Array.isArray(selectedOptions) &&
        selectedOptions.length === 0)
    ) {
      if (isInserted) {
        if (lockedBlocks[block.title]) {
          return (
            <div
              className={mergeStyles({
                marginTop: '6px',
                border: `1px solid ${isDarkMode ? 'rgba(16,124,16,0.1)' : '#eafaea'
                  }`,
                padding: '4px 6px',
                borderRadius: 0,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
              })}
            >
              <Icon
                iconName="CheckMark"
                styles={{ root: { color: colours.green, marginRight: 4 } }}
              />
              <span>Locked</span>
            </div>
          );
        }
        if (isEdited) {
          return (
            <div
              className={mergeStyles({
                marginTop: '6px',
                border: `1px solid ${colours.highlightBlue}`,
                padding: '6px 10px',
                borderRadius: 0,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
              })}
            >
              <Icon
                iconName="Edit"
                styles={{ root: { color: colours.highlightBlue, marginRight: 4 } }}
              />
              <span>Customised</span>
            </div>
          );
        }
      }
      return null;
    }

    const formatPreviewText = (text: string) => {
      return text.replace(/\n/g, '<br />');
    };

    if (block.isMultiSelect && Array.isArray(selectedOptions)) {
      return (
        <div
          className={mergeStyles({
            marginTop: '6px',
            border: isInserted
              ? `1px solid ${lockedBlocks[block.title]
                ? isDarkMode
                  ? 'rgba(16,124,16,0.1)'
                  : '#eafaea'
                : isEdited
                  ? colours.highlightBlue
                  : colours.highlightNeutral
              }`
              : `1px dashed ${colours.highlightBlue}`,
            padding: isEdited ? '8px 10px' : '6px 8px',
            borderRadius: 0,
            fontSize: '13px',
          })}
        >
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {selectedOptions.map((doc: string) => {
              const option = block.options.find((o) => o.label === doc);
              const preview = option ? option.previewText.trim() : doc;
              const dynamicPreview = applyDynamicSubstitutions(
                formatPreviewText(preview),
                effectiveUserData,
                enquiry,
                amount,
                dealPasscode,
                undefined // Let applyDynamicSubstitutions construct URL with passcode
              );
              return (
                <li
                  key={doc}
                  style={{ marginBottom: 4 }}
                  dangerouslySetInnerHTML={{
                    __html: dynamicPreview,
                  }}
                ></li>
              );
            })}
          </ul>
        </div>
      );
    } else if (typeof selectedOptions === 'string') {
      const option = block.options.find((o) => o.label === selectedOptions);
      const preview = option ? option.previewText.trim() : '';
      const dynamicPreviewText = applyDynamicSubstitutions(
        formatPreviewText(preview),
        effectiveUserData,
        enquiry,
        amount,
        dealPasscode,
        undefined // Let applyDynamicSubstitutions construct URL with passcode
      );
      return (
        <div
          className={mergeStyles({
            marginTop: '6px',
            border: isInserted
              ? `1px solid ${lockedBlocks[block.title]
                ? isDarkMode
                  ? 'rgba(16,124,16,0.1)'
                  : '#eafaea'
                : isEdited
                  ? colours.highlightBlue
                  : colours.highlightNeutral
              }`
              : `1px dashed ${colours.highlightBlue}`,
            padding: isEdited ? '8px 10px' : '6px 8px',
            borderRadius: 0,
            fontSize: '13px',
          })}
        >
          <span
            dangerouslySetInnerHTML={{
              __html: dynamicPreviewText,
            }}
          />
        </div>
      );
    }
    return null;
  }

  const DEFAULT_SINGLE_OPTION_BLOCKS = [
    'Risk Assessment',
    'Next Steps to Instruct Helix Law',
    'Closing Notes',
    'Closing',
  ];

  function autoInsertDefaultBlocks(
    blocksToUse: TemplateBlock[] = templateBlocks,
    currentSet: TemplateSet = templateSet,
  ) {
    if (currentSet !== 'Production') return;

    blocksToUse.forEach((block) => {
      if (EXTRACTED_BLOCKS.includes(block.title)) return; // handled separately now
      if (
        DEFAULT_SINGLE_OPTION_BLOCKS.includes(block.title) &&
        block.options.length === 1
      ) {
        const autoOption = block.options[0].label;
        setSelectedTemplateOptions((prev) => ({
          ...prev,
          [block.title]: block.isMultiSelect ? [autoOption] : autoOption,
        }));
        insertTemplateBlock(
          block,
          block.isMultiSelect ? [autoOption] : autoOption
        );
        setAutoInsertedBlocks(prev => ({ ...prev, [block.title]: true }));
      }

      if (
        enquiry.Area_of_Work &&
        (enquiry.Area_of_Work.toLowerCase() === 'commercial' ||
          enquiry.Area_of_Work.toLowerCase() === 'property')
      ) {
        const autoMap: Record<string, string> = {
          'Current Situation and Problem': 'The Dispute',
          'Issue Summary': 'The Dispute',
          'Scope of Work': 'Initial Review and Costs',
          'Scope & Cost': 'Initial Review & Advice',
          'Next Steps to Instruct Helix Law': 'Instruct Helix Law - Pitch',
          'Next Steps': 'Instruct Helix Law - Pitch',
          Closing: 'Closing',
        };

        const autoOptionLabel = autoMap[block.title];
        const optionExists = autoOptionLabel
          ? block.options.find((o) => o.label === autoOptionLabel)
          : undefined;

        if (optionExists) {
          setSelectedTemplateOptions((prev) => ({
            ...prev,
            [block.title]: block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel,
          }));
          insertTemplateBlock(
            block,
            block.isMultiSelect ? [autoOptionLabel] : autoOptionLabel
          );
          setAutoInsertedBlocks(prev => ({ ...prev, [block.title]: true }));
        }
      }
    });
  }

  // Some styling
  const containerStyle = mergeStyles({
    padding: 0,
    backgroundColor: 'transparent',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: 0,
    boxShadow: isDarkMode
      ? '0 4px 12px rgba(255, 255, 255, 0.1)'
      : '0 4px 12px rgba(0, 0, 0, 0.1)',
    maxWidth: 1350,
    width: '100%',
    margin: '0 auto',
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    boxSizing: 'border-box',
    flex: 1,
    minHeight: 0,
  });

  const headerWrapperStyle = mergeStyles({
    backgroundColor: 'transparent',
    padding: 8,
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : '#ddd'}`,
  });

  const bodyWrapperStyle = mergeStyles({
    padding: 16,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  });

  const formContainerStyle = mergeStyles({
    flex: '1 1 0',
    minWidth: '300px',
    display: 'flex',
    flexDirection: 'column',
  });

  const templatesContainerStyle = mergeStyles({
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxHeight: '100%',
    overflowY: 'auto',
  });

  const templatesGridStyle = mergeStyles({
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxHeight: '100%',
  });

  const buttonGroupStyle = mergeStyles({
    gap: '15px',
    marginTop: '20px',
    width: '100%',
  });

  const enquiryDetailsStyle = mergeStyles({
    background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    borderRadius: 0,
    padding: 16,
    boxShadow: isDarkMode
      ? `0 0 0 1px ${colours.dark.border}`
      : `0 0 0 1px ${colours.light.border}`,
  });


  const toolbarStyle = mergeStyles({
    display: 'flex',
    gap: '10px',
    marginBottom: '0',
    backgroundColor: colours.darkBlue,
    padding: '8px',
    borderTopLeftRadius: '0',
    borderTopRightRadius: '0',
    border: `1px solid ${isDarkMode ? colours.dark.cardHover : colours.light.cardHover}`,
    borderBottom: 'none',
  });

  const bubblesContainerStyle = mergeStyles({
    display: 'flex',
    flexWrap: 'wrap', // Allow bubbles to wrap to the next line
    padding: '10px 0',
    gap: '10px',
  });

  const bubbleStyle = mergeStyles({
    padding: '8px 12px',
    borderRadius: 0,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    cursor: 'pointer',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    flexShrink: 0,
    width: 'auto',
    ':hover': {
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
  });

  const labelStyle = mergeStyles({
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    paddingTop: '20px',
    paddingBottom: '5px',
  });

  // New style for greyed-out attachment bubbles
  const attachmentBubbleStyle = mergeStyles({
    padding: '8px 12px',
    borderRadius: 0,
    backgroundColor: isDarkMode
      ? colours.dark.disabledBackground
      : colours.light.disabledBackground,
    color: colours.greyText,
    cursor: 'default',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    flexShrink: 0,
    width: 'auto',
    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor
      }`,
    ':hover': {
      backgroundColor: isDarkMode
        ? colours.dark.disabledBackground
        : colours.light.disabledBackground,
    },
  });

  const fullName = `${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`.trim();

  function handleScrollToBlock(blockTitle: string) {
    const headerElement = document.getElementById(
      `template-block-header-${blockTitle.replace(/\s+/g, '-')}`
    ) as HTMLElement | null;
    if (headerElement) {
      headerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const lockedBg = isDarkMode ? 'rgba(16,124,16,0.1)' : '#eafaea';
      const startColor = lockedBlocks[blockTitle]
        ? lockedBg
        : Object.values(editedSnippets[blockTitle] || {}).some(Boolean)
          ? colours.highlightBlue
          : colours.highlightNeutral;
      headerElement.style.transition = 'background-color 0.5s';
      headerElement.style.backgroundColor = startColor;
      setTimeout(() => {
        headerElement.style.backgroundColor = 'transparent';
      }, 1000);
    }
  }

  const filteredAttachments = getFilteredAttachments();

  useEffect(() => {
    return () => {
      if (suppressSaveRef.current) {
        suppressSaveRef.current = false;
        return;
      }
      const state = {
        templateSet,
        initialScopeDescription,
        selectedOption,
        amount,
        subject,
        to,
        cc,
        bcc,
        body,
        attachments,
        followUp,
        activeTab,
        selectedTemplateOptions,
        insertedBlocks,
        autoInsertedBlocks,
        lockedBlocks,
        pinnedBlocks,
        editedBlocks,
        editedSnippets,
        originalBlockContent,
        originalSnippetContent,
        hiddenBlocks,
        blocks,
        savedSnippets,
        enquiryId: enquiry.ID,
      };
      const sections = Object.keys(insertedBlocks)
        .filter((title) => insertedBlocks[title])
        .map((title) => ({
          block: title,
          option: selectedTemplateOptions[title] || '',
          content: savedSnippets[title] || '',
        }));
      if (sections.length > 0) {
        fetch('/api/pitches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enquiryId: enquiry.ID,
            sections,
            user: userInitials,
          }),
        }).catch((err) => console.error('Failed to save pitch sections', err));
      }
      try {
        localStorage.setItem('pitchBuilderState', JSON.stringify(state));
      } catch (e) {
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          // Try to trim large fields and retry
          const trimmed = { ...state };
          if (trimmed.attachments && Array.isArray(trimmed.attachments)) {
            trimmed.attachments = [];
          }
          if (trimmed.body && typeof trimmed.body === 'string' && trimmed.body.length > 2000) {
            trimmed.body = trimmed.body.slice(0, 2000) + '…';
          }
          try {
            localStorage.setItem('pitchBuilderState', JSON.stringify(trimmed));
          } catch (e2) {
            // If still fails, clear the key and log error
            localStorage.removeItem('pitchBuilderState');
            // Optionally, surface a user notification here
            console.error('PitchBuilder: Could not save state, storage quota exceeded and fallback failed.', e2);
          }
        } else {
          throw e;
        }
      }
    };
  }, [
    templateSet,
    initialScopeDescription,
    selectedOption,
    amount,
    subject,
    to,
    cc,
    bcc,
    body,
    attachments,
    followUp,
    activeTab,
    selectedTemplateOptions,
    insertedBlocks,
    autoInsertedBlocks,
    lockedBlocks,
    pinnedBlocks,
    editedBlocks,
    editedSnippets,
    originalBlockContent,
    originalSnippetContent,
    hiddenBlocks,
    blocks,
    savedSnippets,
  ]);

  // Build combined HTML for a block's selected options
  function buildSectionHtml(block: TemplateBlock, labels: string[]): string {
    const parts: string[] = [];
    labels.forEach(label => {
      const opt = block.options.find(o => o.label === label);
      if (!opt) return;
      let raw = opt.previewText.trim();
      raw = applyDynamicSubstitutions(
        raw,
        effectiveUserData,
        enquiry,
        amount,
        dealPasscode,
        undefined // Let applyDynamicSubstitutions construct URL with passcode
      );
      raw = cleanTemplateString(raw);
      const formatted = formatSectionContent(raw);
      parts.push(`<div class=\"section-snippet\" data-label=\"${label.replace(/"/g, '&quot;')}\">${formatted}</div>`);
    });
    return parts.join('<br /><br />');
  }

  // Produce high-quality HTML paragraphs, preserve lists, highlight unresolved placeholders.
  function formatSectionContent(raw: string): string {
    // Normalise line endings
    let text = raw.replace(/\r\n?/g, '\n').trim();
    // Split into paragraphs on double newline
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const html = paragraphs.map(p => {
      // Preserve basic markdown-like bullets -> convert to <ul>
      if (/^(?:[-*] |\d+\. )/m.test(p)) {
        const lines = p.split(/\n/).map(l => l.trim()).filter(Boolean);
        if (lines.every(l => /^[-*] /.test(l))) {
          const items = lines.map(l => `<li>${escapeHtml(l.replace(/^[-*] /, ''))}</li>`).join('');
          return `<ul style=\"margin:0 0 12px 20px; padding:0;\">${items}</ul>`;
        }
        if (lines.every(l => /^\d+\. /.test(l))) {
          const items = lines.map(l => `<li>${escapeHtml(l.replace(/^\d+\. /, ''))}</li>`).join('');
          return `<ol style=\"margin:0 0 12px 20px; padding:0;\">${items}</ol>`;
        }
      }
      // Inline line breaks
      const withBreaks = p.split(/\n/).map(l => escapeHtml(l)).join('<br />');
      return `<p style=\"margin:0 0 12px; line-height:1.5;\">${withBreaks}</p>`;
    }).join('');
    const wrapped = wrapInsertPlaceholders(html);
    return highlightUnresolvedPlaceholders(wrapped);
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Highlight placeholders that remain (not substituted) with a subtle background
  function highlightUnresolvedPlaceholders(html: string): string {
    return html.replace(/\[(?:[A-Za-z0-9_. ]+)\]/g, match => `<span style=\"background:#fff3cd;border:1px dotted #e0c46c;padding:0 2px;\" data-unresolved-placeholder>${match}</span>`);
  }

  // Rebuild body injecting extracted block sections (with markers) after greeting
  function rebuildBodyWithSections(base: string, sections: Record<string, string>): string {
    // Strip existing markers first
    let cleaned = base.replace(/<!--BLOCK_START:[^>]+-->([\s\S]*?)<!--BLOCK_END:[^>]+-->/g, '').trim();
    const splitIndex = cleaned.indexOf('\n\n');
    let greeting = cleaned;
    let rest = '';
    if (splitIndex !== -1) {
      greeting = cleaned.substring(0, splitIndex);
      rest = cleaned.substring(splitIndex + 2);
    }
    const ordered = EXTRACTED_BLOCKS.filter(t => sections[t]);
    const sectionHtml = ordered.map(title => `<!--BLOCK_START:${title}--><div data-extracted-block="${title}">${sections[title]}</div><!--BLOCK_END:${title}-->`).join('\n\n');
    return `${greeting}\n\n${sectionHtml ? sectionHtml + '\n\n' : ''}${rest}`.trim();
  }

  function handleToggleOption(block: TemplateBlock, optionLabel: string) {
    setSectionSelections(prev => {
      const current = prev[block.title] || [];
      let next: string[];
      if (block.isMultiSelect) {
        next = current.includes(optionLabel)
          ? current.filter(l => l !== optionLabel)
          : [...current, optionLabel];
      } else {
        next = [optionLabel];
      }
      // Build HTML & update content/state + body
      const html = buildSectionHtml(block, next);
      setSectionContent(sc => {
        const updated = { ...sc };
        if (next.length === 0) delete updated[block.title]; else updated[block.title] = html;
        // After updating content, rebuild body
        setBodyInternal(prevBody => rebuildBodyWithSections(prevBody, updated));
        return updated;
      });
      return { ...prev, [block.title]: next };
    });
  }

  function handleSectionContentEdit(blockTitle: string, html: string) {
    setSectionContent(prev => {
      // Clean editing artifacts (e.g., <div><br></div>) & re-format
      const cleaned = html
        .replace(/<div><br\s*\/?><\/div>/g, '')
        .replace(/<div>([\s\S]*?)<\/div>/g, (m, inner) => inner.includes('<p') || inner.includes('<ul') ? m : inner + '<br />');
      const formatted = highlightUnresolvedPlaceholders(wrapInsertPlaceholders(cleaned));
      const updated = { ...prev, [blockTitle]: formatted };
      setBodyInternal(prevBody => rebuildBodyWithSections(prevBody, updated));
      return updated;
    });
  }

  return (
    <Stack className={containerStyle}>
      {/* Client Info Header - Navigator Integrated */}
      <VerificationSummary
        isDarkMode={isDarkMode}
        userData={effectiveUserData}
        enquiry={enquiry}
        amount={amount}
        passcode={dealPasscode}
        usedPitchRoute={usedPitchRoute}
        onPreview={(url) => {
          try {
            window.open(url, '_blank', 'noopener');
          } catch (_) {
            // no-op fallback
          }
        }}
      />

      <main className={bodyWrapperStyle}>
        {/* Content Sections - Streamlined */}
        {EXTRACTED_BLOCKS.length > 0 && (
          <div>
            {EXTRACTED_BLOCKS.map(title => {
              const block = blocks.find(b => b.title === title);
              if (!block) return null;
              const selections = sectionSelections[title] || [];
              const content = sectionContent[title];
              return (
                <div key={title} style={{
                  marginBottom: 16,
                  background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
                  border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e4e8'}`,
                  borderRadius: 8,
                  padding: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  {/* Section header removed as requested */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {block.options.map(opt => {
                      const selected = selections.includes(opt.label);
                      return (
                        <button
                          key={opt.label}
                          onClick={() => handleToggleOption(block, opt.label)}
                          style={{
                            border: selected ? `2px solid ${colours.blue}` : `1px solid ${isDarkMode ? colours.dark.border : '#d0d7de'}`,
                            background: selected ? colours.highlightBlue : (isDarkMode ? colours.dark.inputBackground : '#f8f9fa'),
                            color: selected ? colours.darkBlue : (isDarkMode ? colours.dark.text : colours.light.text),
                            padding: '8px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: selected ? 600 : 400,
                            maxWidth: 240,
                            textAlign: 'left',
                            position: 'relative',
                            transition: 'all 0.2s ease'
                          }}
                          title={opt.previewText.split('\n').slice(0, 3).join(' ')}
                        >
                          {opt.label}
                          {selected && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 10, color: colours.blue }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {selections.length === 0 && (
                    <div style={{ fontSize: 11, color: isDarkMode ? colours.dark.text : '#888' }}>
                      Select option{block.isMultiSelect ? 's' : ''} to include this section.
                    </div>
                  )}
                  {selections.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, margin: '8px 0 4px 0', color: colours.darkBlue }}>
                        Preview:
                      </div>
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={e => handleSectionContentEdit(title, (e.target as HTMLElement).innerHTML)}
                        style={{
                          border: `1px solid ${isDarkMode ? colours.dark.border : '#d0d7de'}`,
                          padding: '10px 12px',
                          fontSize: 13,
                          lineHeight: 1.5,
                          background: isDarkMode ? colours.dark.inputBackground : '#fafbfc',
                          minHeight: 60,
                          cursor: 'text',
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                          borderRadius: 6
                        }}
                        dangerouslySetInnerHTML={{ __html: content || buildSectionHtml(block, selections) }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Summary/Overview Section: Instruction, Deal, and Risk/Compliance Cards */}

        {/* Row: Combined Email Editor and Template Blocks */}
        <EditorAndTemplateBlocks
          isDarkMode={isDarkMode}
          body={body}
          setBody={setBodyForComponents}
          templateBlocks={blocks.filter(b => !EXTRACTED_BLOCKS.includes(b.title))}
          selectedTemplateOptions={selectedTemplateOptions}
          insertedBlocks={insertedBlocks}
          lockedBlocks={lockedBlocks}
          editedBlocks={editedBlocks}
          handleMultiSelectChange={handleMultiSelectChange}
          handleSingleSelectChange={handleSingleSelectChange}
          insertTemplateBlock={insertTemplateBlock}
          renderPreview={renderPreview}
          applyFormat={applyFormat}
          saveSelection={saveSelection}
          handleInput={handleInput}
          handleBlur={handleBlur}
          handleClearBlock={handleClearBlock}
          bodyEditorRef={bodyEditorRef}
          toolbarStyle={toolbarStyle}
          bubblesContainerStyle={bubblesContainerStyle}
          saveCustomSnippet={saveCustomSnippet}
          markBlockAsEdited={(blockTitle, edited) =>
            setEditedBlocks((prev) => ({ ...prev, [blockTitle]: edited }))
          }
          initialNotes={enquiry.Initial_first_call_notes}
          subject={subject}
          setSubject={setSubject}
          // Deal capture props (always enabled)
          initialScopeDescription={initialScopeDescription}
          onScopeDescriptionChange={setInitialScopeDescription}
          amount={amount}
          onAmountChange={handleAmountChange}
          // Inline preview props
          userData={effectiveUserData}
          enquiry={enquiry}
          passcode={dealPasscode}
          handleDraftEmail={handleDraftEmail}
          sendEmail={sendEmail}
          isDraftConfirmed={isDraftConfirmed}
          // Email recipient props for send confirmation
          to={to}
          cc={cc}
          bcc={bcc}
          feeEarnerEmail={userEmailAddress}
          // Inline status feedback
          dealCreationInProgress={dealCreationInProgress}
          dealStatus={dealStatus}
          emailStatus={emailStatus}
          emailMessage={emailMessage}
        />

        {snippetOptionsBlock && snippetOptionsTarget && (
          <Callout
            className="inline-options-callout"
            target={snippetOptionsTarget}
            onDismiss={closeSnippetOptions}
            setInitialFocus={false}
            directionalHint={DirectionalHint.bottomLeftEdge}
            directionalHintFixed
            styles={{
              root: {
                padding: 8,
                borderRadius: 0,
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
                animation: 'fadeInScale 0.2s ease',
              },
            }}
          >
            <FocusZone direction={FocusZoneDirection.vertical} isCircularNavigation>
              <ChoiceGroup
                selectedKey={snippetOptionsLabel}
                onChange={(_e, opt?: IChoiceGroupOption) => {
                  if (!opt || !snippetOptionsBlock) return;
                  replaceSnippetOption(
                    snippetOptionsBlock,
                    snippetOptionsLabel,
                    opt.key as string
                  );
                  closeSnippetOptions();
                }}
                options={
                  snippetOptionsBlock.options.map((o) => {
                    const renderLabel = (
                      option?: IChoiceGroupOption,
                      defaultRender?: (option?: IChoiceGroupOption) => JSX.Element | null
                    ) => {
                      if (!option) return null;
                      const preview = applyDynamicSubstitutions(
                        snippetOptionsBlock.options.find((opt) => opt.label === option.key)?.previewText.replace(/\n/g, '<br />') || '',
                        userData,
                        enquiry,
                        amount,
                        dealPasscode,
                        undefined // Let applyDynamicSubstitutions construct URL with passcode
                      );
                      const isSelected = snippetOptionsLabel === option.key;
                      return (
                        <Stack
                          tokens={{ childrenGap: 2 }}
                          onMouseEnter={() => setHoveredOption(option.key as string)}
                          onMouseLeave={() => setHoveredOption(null)}
                        >
                          {defaultRender ? defaultRender(option) : option.text}
                          {(hoveredOption === option.key || isSelected) && (
                            <span className="option-preview" dangerouslySetInnerHTML={{ __html: preview }} />
                          )}
                        </Stack>
                      );
                    };

                    return {
                      key: o.label,
                      text: o.label,
                      onRenderLabel: renderLabel,
                    } as IChoiceGroupOption;
                  })
                }
                styles={{ flexContainer: { display: 'flex', flexDirection: 'column' } }}
              />
            </FocusZone>
          </Callout>
        )}

        {removeConfirm && (
          <Callout
            target={removeConfirm.target ?? removeConfirm.point ?? undefined}
            onDismiss={() => setRemoveConfirm(null)}
            setInitialFocus
            directionalHint={DirectionalHint.bottomLeftEdge}
            directionalHintFixed
          >
            <Stack tokens={{ childrenGap: 8 }} styles={{ root: { padding: 12 } }}>
              <Text>Clear this content?</Text>
              <Stack horizontal tokens={{ childrenGap: 8 }} horizontalAlign="end">
                <PrimaryButton
                  text="Clear"
                  styles={sharedPrimaryButtonStyles}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (removeConfirm.option) {
                      removeBlockOption(removeConfirm.block, removeConfirm.option);
                    } else {
                      handleClearBlock(removeConfirm.block);
                    }
                    setRemoveConfirm(null);
                  }}
                />
                <DefaultButton
                  text="Cancel"
                  styles={sharedDefaultButtonStyles}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemoveConfirm(null);
                  }}
                />
              </Stack>
            </Stack>
          </Callout>
        )}

        {placeholderEdit && (
          <PlaceholderEditorPopover
            target={placeholderEdit.target}
            initialText={placeholderEdit.text}
            before={placeholderEdit.before}
            after={placeholderEdit.after}
            onAddOption={(text) => {
              setSnippetEdit({
                blockTitle: placeholderEdit.blockTitle || '',
                target: placeholderEdit.target,
                placeholder: placeholderEdit.placeholder,
              });
              setPendingOptionText(text);
            }}
            onDismiss={() => setPlaceholderEdit(null)}
            onSave={(val) => {
              const span = placeholderEdit.span;
              const editor = bodyEditorRef.current;
              
              if (!editor) {
                setPlaceholderEdit(null);
                return;
              }
              
              // Store cursor position relative to the span
              const selection = window.getSelection();
              const range = document.createRange();
              
              // Create a clean text node replacement
              const textNode = document.createTextNode(val);
              
              // Replace the span with the text node
              span.replaceWith(textNode);
              
              // If this was the very last element, ensure it doesn't get re-processed
              const lastChild = editor.lastChild;
              if (lastChild === textNode || 
                  (lastChild && lastChild.nodeType === Node.TEXT_NODE && 
                   lastChild.textContent === val)) {
                // Add an invisible zero-width space to prevent contentEditable from
                // converting the last text node back to HTML
                const protectiveSpace = document.createTextNode('\u200B');
                editor.appendChild(protectiveSpace);
              }
              
              // Update the body content
              setBody(editor.innerHTML);
              setPlaceholderEdit(null);
              
              // Restore cursor position after the inserted text
              if (selection) {
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }}
          />
        )}

        {snippetEdit && (
          <SnippetEditPopover
            target={snippetEdit.target}
            onDismiss={() => {
              setSnippetEdit(null);
              setPendingOptionText('');
            }}
            onSave={({ label, sortOrder, isNew }) => {
              submitPlaceholderOption(
                snippetEdit.blockTitle,
                pendingOptionText,
                snippetEdit.placeholder,
                label,
                sortOrder,
                isNew
              );
              setSnippetEdit(null);
              setPendingOptionText('');
            }} originalText={''} editedText={''} />
        )}



        <OperationStatusToast
          visible={toast !== null}
          message={toast?.message || ''}
          type={toast?.type || 'info'}
          loading={toast?.loading}
          details={toast?.details}
          progress={toast?.progress}
          icon={toast?.icon}
        />
      </main>

      {showDataInspector && (
        <PitchDebugPanel
          calls={apiCalls}
          onClear={clearApiCalls}
          collapsed={debugCollapsed}
          onToggle={() => setDebugCollapsed((v) => !v)}
        />
      )}
    </Stack>
  );

};

export default PitchBuilder;