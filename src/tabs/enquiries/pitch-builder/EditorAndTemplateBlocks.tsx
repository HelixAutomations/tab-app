import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Stack, Text, Icon, Pivot, PivotItem, TextField } from '@fluentui/react';
import { FaBolt, FaEdit, FaFileAlt, FaEraser, FaInfoCircle, FaThumbtack, FaCalculator, FaExclamationTriangle, FaEnvelope, FaPaperPlane, FaChevronDown, FaChevronUp, FaCopy, FaEye, FaCheck, FaTimes, FaUsers } from 'react-icons/fa';
import DealCapture from './DealCapture';
import { colours } from '../../../app/styles/colours';
import { TemplateBlock } from '../../../app/customisation/ProductionTemplateBlocks';
import SnippetEditPopover from './SnippetEditPopover';
import { placeholderSuggestions } from '../../../app/customisation/InsertSuggestions';
import { wrapInsertPlaceholders } from './emailUtils';
import { SCENARIOS, SCENARIOS_VERSION } from './scenarios';
import EmailSignature from '../EmailSignature';
import { applyDynamicSubstitutions, convertDoubleBreaksToParagraphs } from './emailUtils';
import FormattingToolbar from './FormattingToolbar';
import { processEditorContentForEmail, KEYBOARD_SHORTCUTS, type FormattingCommand } from './emailFormattingUtils';
import EmailProcessingConfirmDialog from './EmailProcessingConfirmDialog';
import markUrl from '../../../assets/dark blue mark.svg';
// Import tab bg image directly for debugging
const tabBgUrl = require('../../../assets/tab bg.jpg');

// Enterprise-grade subtle animations for professional appearance
const animationStyles = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes subtlePulse {
  0%, 100% { 
    opacity: 1;
    transform: scale(1); 
  }
  50% { 
    opacity: 0.85;
    transform: scale(1.01); 
  }
}

@keyframes smoothCheck {
  0% { 
    opacity: 0;
    transform: scale(0.9);
  }
  60% { 
    opacity: 0.8;
    transform: scale(1.05);
  }
  100% { 
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes gentleFloat {
  0%, 100% { 
    transform: translateY(0px);
  }
  50% { 
    transform: translateY(-1px);
  }
}

@keyframes fadeIn {
  from { 
    opacity: 0; 
    transform: translateY(4px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

@keyframes subtleShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-1px); }
  75% { transform: translateX(1px); }
}

@keyframes slideUp {
  from { 
    opacity: 0; 
    transform: translateY(8px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

@keyframes softGlow {
  0%, 100% { 
    opacity: 1;
  }
  50% { 
    opacity: 0.9;
  }
}

@keyframes radio-check {
  from { 
    opacity: 0; 
    transform: scale(0.8); 
  }
  to { 
    opacity: 1; 
    transform: scale(1); 
  }
}
`;

// Inject animations into head
if (typeof document !== 'undefined' && !document.getElementById('processing-animations')) {
  const style = document.createElement('style');
  style.id = 'processing-animations';
  style.textContent = animationStyles;
  document.head.appendChild(style);
}

// NOTE: renderWithPlaceholders was removed; we use a simple highlighter overlay instead.
// Escape HTML for safe injection in the overlay layer
function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Remove visual divider lines made of dashes from text (used to hide auto-block separators in previews)
function stripDashDividers(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*[-–—]{3,}\s*$/.test(line))
    .join('\n');
}

// Convert very basic HTML to plain text for textarea defaults and copy actions
function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/(ul|ol)>/gi, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
  return withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Removed local fallback passcode generation: must use ONLY server-issued passcode.

// Find placeholder tokens like [TOKEN] but only in TEXT NODES (avoid attributes)
function findPlaceholders(text: string): string[] {
  const container = document.createElement('div');
  container.innerHTML = text;
  const results: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = (node.nodeValue || '');
    const matches = value.match(/\[[^\]]+\]/g);
    if (matches) results.push(...matches);
  }
  return results;
}

// Safely wrap placeholders in preview by operating on TEXT NODES only and
// stripping editor-only attributes/styles so nothing leaks into the preview.
function highlightPlaceholdersHtml(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  // 1) Strip editor-only attributes/styles and normalize existing placeholder wrappers
  container.querySelectorAll('[contenteditable], [tabindex], [role="button"]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('tabindex');
    if (el.getAttribute('role') === 'button') el.removeAttribute('role');
  });

  container.querySelectorAll('.insert-placeholder, .placeholder-edited, [data-insert], [data-placeholder]').forEach((el) => {
    // Remove inline styles so preview styling comes from CSS
    (el as HTMLElement).removeAttribute('style');
    el.removeAttribute('data-original');
    el.removeAttribute('data-insert');
    el.removeAttribute('data-placeholder');
    const txt = el.textContent || '';
    if (/^\[[^\]]+\]$/.test(txt.trim())) {
      // Unresolved placeholder → mark as CTA red
      (el as HTMLElement).className = 'placeholder-unresolved';
    } else {
      // Satisfied placeholder → unwrap to plain text
      const textNode = document.createTextNode(txt);
      el.parentNode?.replaceChild(textNode, el);
    }
  });

  // 2) Walk text nodes and wrap [TOKEN] occurrences with <span class="insert-placeholder">
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let t: Node | null;
  while ((t = walker.nextNode())) {
    // Collect first; we'll mutate after to avoid breaking traversal
    textNodes.push(t as Text);
  }

  const tokenRe = /\[[^\]]+\]/g;
  for (const node of textNodes) {
    const value = node.nodeValue || '';
    if (!tokenRe.test(value)) continue;

    const parts = value.split(/(\[[^\]]+\])/g);
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('[') && part.endsWith(']')) {
        const span = document.createElement('span');
        span.className = 'placeholder-unresolved';
        span.textContent = part; // keep literal token text
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    node.parentNode?.replaceChild(frag, node);
  }

  return container.innerHTML;
}

// Custom hook: auto-insert [RATE] and [ROLE] values and report inserted ranges
function useAutoInsertRateRole(
  body: string,
  setBody: (v: string) => void,
  userData?: any,
  setExternalHighlights?: (ranges: { start: number; end: number }[]) => void
) {
  const lastAppliedKeyRef = useRef<string>('');
  const lastProcessedBodyRef = useRef<string>('');

  useEffect(() => {
    const roleRaw = userData?.[0]?.['Role'];
    const rateRaw = userData?.[0]?.['Rate'];

    const roleStr = roleRaw == null ? '' : String(roleRaw).trim();
    const parseRate = (val: unknown): number | null => {
      if (val == null) return null;
      if (typeof val === 'number') return isFinite(val) ? val : null;
      const cleaned = String(val).replace(/[^0-9.\-]/g, '').trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      return isFinite(n) ? n : null;
    };
    const rateNumber = parseRate(rateRaw);
    const formatRateGBP = (n: number) =>
      `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + VAT`;

    if (!body || (!roleStr && rateNumber == null)) {
      // No changes; clear any prior transient highlights
      setExternalHighlights?.([]);
      return;
    }

    const key = `${roleStr}|${rateNumber ?? ''}|${body}`;
    if (lastAppliedKeyRef.current === key && lastProcessedBodyRef.current) return;

    const TOKEN_LEN = (t: 'RATE' | 'ROLE') => `[${t}]`.length;
    let newBody = body;
    const ranges: { start: number; end: number }[] = [];
    const regex = /\[(RATE|ROLE)\]/gi;
    let m: RegExpExecArray | null;
    let shift = 0;

    while ((m = regex.exec(body)) !== null) {
      const token = (m[1] as string).toUpperCase() as 'RATE' | 'ROLE';
      const originalStart = m.index;
      const start = originalStart + shift;
      const end = start + TOKEN_LEN(token);
      let replacement: string | null = null;
      if (token === 'RATE' && rateNumber != null) replacement = formatRateGBP(rateNumber);
      else if (token === 'ROLE' && roleStr) replacement = roleStr;
      if (replacement != null) {
        newBody = newBody.slice(0, start) + replacement + newBody.slice(end);
        ranges.push({ start, end: start + replacement.length });
        shift += replacement.length - TOKEN_LEN(token);
      }
    }

    if (newBody !== body) {
      lastAppliedKeyRef.current = key;
      lastProcessedBodyRef.current = newBody;
      setBody(newBody);
      if (ranges.length) setExternalHighlights?.(ranges);
    } else {
      lastAppliedKeyRef.current = key;
      lastProcessedBodyRef.current = body;
      if (ranges.length === 0) setExternalHighlights?.([]);
    }
  }, [body, userData, setBody, setExternalHighlights]);
}

interface InlineEditableAreaProps {
  value: string;
  onChange: (v: string) => void;
  edited: boolean;
  minHeight?: number;
  externalHighlights?: { start: number; end: number }[];
  allReplacedRanges?: { start: number; end: number }[];
  passcode?: string;
  enquiry?: any;
  isDarkMode?: boolean;
  richTextMode?: boolean;
  bodyEditorRef?: React.RefObject<HTMLDivElement>;
  handleFormatCommand?: (command: string, value?: string) => void;
}

interface UndoRedoState {
  history: string[];
  currentIndex: number;
}

const InlineEditableArea: React.FC<InlineEditableAreaProps> = ({ 
  value, 
  onChange, 
  edited, 
  minHeight = 48, 
  externalHighlights, 
  allReplacedRanges, 
  passcode, 
  enquiry, 
  isDarkMode,
  richTextMode,
  bodyEditorRef,
  handleFormatCommand
}) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [undoRedoState, setUndoRedoState] = useState<UndoRedoState>({
    history: [value],
    currentIndex: 0
  });
  // Flag to distinguish internal programmatic updates from external prop changes
  const internalUpdateRef = useRef(false);
  const previousValueRef = useRef(value);
  const [highlightRanges, setHighlightRanges] = useState<{ start: number; end: number }[]>([]); // green edited ranges (currently at most 1 active)
  const replacingPlaceholderRef = useRef<{ start: number; end: number } | null>(null); // original placeholder bounds
  const activeReplacementRangeRef = useRef<{ start: number; end: number } | null>(null); // growing inserted content
  // Local synced copies of external highlights so we can shift them as user types
  const [syncedExternalRanges, setSyncedExternalRanges] = useState<{ start: number; end: number }[]>([]);
  const [syncedPersistentRanges, setSyncedPersistentRanges] = useState<{ start: number; end: number }[]>([]);

  // Sync contentEditable content with value prop when in rich text mode
  useEffect(() => {
    if (richTextMode && bodyEditorRef?.current) {
      // Only wrap placeholders if content doesn't already contain wrapped placeholders
      const hasWrappedPlaceholders = value.includes('class="insert-placeholder"');
      const wrappedContent = hasWrappedPlaceholders ? value : wrapInsertPlaceholders(value);
      // Only update if the content is different to avoid cursor jumping
      if (bodyEditorRef.current.innerHTML !== wrappedContent) {
        bodyEditorRef.current.innerHTML = wrappedContent;
      }
    }
  }, [value, richTextMode]);

  // Keep local copies in sync with props when they change from outside (e.g., auto-inserts)
  useEffect(() => {
    // Sync by reference change only to keep dependency array stable across renders
    setSyncedExternalRanges((externalHighlights || []).slice());
  }, [externalHighlights]);
  useEffect(() => {
    // Sync by reference change only to keep dependency array stable across renders
    setSyncedPersistentRanges((allReplacedRanges || []).slice());
  }, [allReplacedRanges]);

  // Sync external value changes (e.g. selecting a different template or auto-inserted placeholders)
  useEffect(() => {
    // Only reset undo/redo state and highlights if this is NOT an internal update (i.e., not from user typing or undo/redo)
    if (!internalUpdateRef.current) {
      setUndoRedoState({ history: [value], currentIndex: 0 });
      setHighlightRanges([]);
      activeReplacementRangeRef.current = null;
      replacingPlaceholderRef.current = null;
      previousValueRef.current = value;
    }
    // Always clear the internal update flag after effect
    internalUpdateRef.current = false;
  }, [value]);

  // Note: Do not globally reset internalUpdateRef here to avoid race conditions with the [value] sync effect.

  // Auto resize
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  }, [value]);

  // Sync computed textarea styles to the overlay <pre> so highlights align exactly
  const syncPreStyles = useCallback(() => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    try {
      const s = window.getComputedStyle(ta);
      const propsMap: { [k: string]: string } = {
        fontFamily: 'font-family',
        fontSize: 'font-size',
        fontWeight: 'font-weight',
        fontStyle: 'font-style',
        lineHeight: 'line-height',
        letterSpacing: 'letter-spacing',
        paddingTop: 'padding-top',
        paddingRight: 'padding-right',
        paddingBottom: 'padding-bottom',
        paddingLeft: 'padding-left',
        boxSizing: 'box-sizing',
        textRendering: 'text-rendering',
        textTransform: 'text-transform'
      };
      Object.keys(propsMap).forEach((p) => {
        const cssName = propsMap[p];
        const val = s.getPropertyValue(cssName);
        if (val) (pre.style as any)[p] = val;
      });
      // Ensure same white-space and wrapping behaviour
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
    } catch (err) {
      // swallow errors silently
    }
  }, []);

  useLayoutEffect(() => {
    syncPreStyles();
  }, [value, syncPreStyles]);

  useEffect(() => {
    let raf = 0 as number | null;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => syncPreStyles());
    };
    window.addEventListener('resize', onResize);

    // Re-sync when web fonts finish loading
    const fonts = (document as any).fonts;
    const onFontsReady = () => syncPreStyles();
    if (fonts && typeof fonts.ready !== 'undefined') {
      // fonts.ready is a Promise
      (fonts as any).ready.then(onFontsReady).catch(() => {});
      try {
        fonts.addEventListener && fonts.addEventListener('loadingdone', onFontsReady);
      } catch {}
    }

    // ResizeObserver on wrapper to catch layout changes
    let ro: ResizeObserver | null = null;
    try {
        if (wrapperRef.current && (window as any).ResizeObserver) {
        ro = new (window as any).ResizeObserver(onResize);
        if (ro && wrapperRef.current) ro.observe(wrapperRef.current);
      }
    } catch {}

    return () => {
      window.removeEventListener('resize', onResize);
      try { fonts && fonts.removeEventListener && fonts.removeEventListener('loadingdone', onFontsReady); } catch {}
      if (ro && wrapperRef.current) ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [syncPreStyles]);

  // Add to undo history (debounced)
  const timeoutRef = useRef<NodeJS.Timeout>();
  const addToHistory = (newValue: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setUndoRedoState(prev => {
        const currentValue = prev.history[prev.currentIndex];
        if (currentValue === newValue) return prev;

        const newHistory = prev.history.slice(0, prev.currentIndex + 1);
        newHistory.push(newValue);
        
        // Limit history size
        if (newHistory.length > 50) {
          newHistory.shift();
          return {
            history: newHistory,
            currentIndex: newHistory.length - 1
          };
        }
        
        return {
          history: newHistory,
          currentIndex: newHistory.length - 1
        };
      });
    }, 300); // Reduced debounce for more responsive undo
  };

  // Cleanup pending debounce on unmount to avoid late updates overriding current input
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Undo function
  const handleUndo = () => {
    setUndoRedoState(prev => {
      if (prev.currentIndex > 0) {
        const newIndex = prev.currentIndex - 1;
        const newValue = prev.history[newIndex];
  internalUpdateRef.current = true;
        onChange(newValue);
        return {
          ...prev,
          currentIndex: newIndex
        };
      }
      return prev;
    });
  };

  // Redo function
  const handleRedo = () => {
    setUndoRedoState(prev => {
      if (prev.currentIndex < prev.history.length - 1) {
        const newIndex = prev.currentIndex + 1;
        const newValue = prev.history[newIndex];
  internalUpdateRef.current = true;
        onChange(newValue);
        return {
          ...prev,
          currentIndex: newIndex
        };
      }
      return prev;
    });
  };

  // Utilities for robust range tracking
  const mergeRanges = (ranges: { start: number; end: number }[]) => {
    const sorted = ranges
      .filter(r => r.end > r.start)
      .sort((a, b) => a.start - b.start);
    const out: { start: number; end: number }[] = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (!last) { out.push({ ...r }); continue; }
      if (r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        out.push({ ...r });
      }
    }
    return out;
  };

  const handleContentChange = (newValue: string) => {
    internalUpdateRef.current = true;
    const oldValue = previousValueRef.current;
    const oldLen = oldValue.length;
    const newLen = newValue.length;

    // Compute minimal diff window to locate edit region
    let p = 0;
    while (p < oldLen && p < newLen && oldValue[p] === newValue[p]) p++;
    let s = 0;
    while (
      s < (oldLen - p) &&
      s < (newLen - p) &&
      oldValue[oldLen - 1 - s] === newValue[newLen - 1 - s]
    ) s++;
    const changeStart = p;
    const oldChangeEnd = oldLen - s;
    const newChangeEnd = newLen - s;
    const removedLen = Math.max(0, oldChangeEnd - changeStart);
    const insertedLen = Math.max(0, newChangeEnd - changeStart);
    const delta = insertedLen - removedLen;
    const ta = taRef.current;
    const caretPos = ta ? ta.selectionStart : newChangeEnd; // caret after change

    // Map a position from old text to new text
    const mapPos = (pos: number) => {
      if (pos <= changeStart) return pos;
      if (pos >= oldChangeEnd) return pos + delta;
      // Inside the changed window: clamp into the inserted segment
      const offset = pos - changeStart;
      return changeStart + Math.min(insertedLen, Math.max(0, offset));
    };

    // Shift existing highlights to follow their content
    let updatedRanges = highlightRanges.map(r => ({ start: mapPos(r.start), end: mapPos(r.end) }));
    let updatedExternal = syncedExternalRanges.map(r => ({ start: mapPos(r.start), end: mapPos(r.end) }));
    let updatedPersistent = syncedPersistentRanges.map(r => ({ start: mapPos(r.start), end: mapPos(r.end) }));

    // If we are replacing a placeholder selection, add a new sticky highlight for the inserted content
    if (replacingPlaceholderRef.current) {
      const rep = replacingPlaceholderRef.current;
      // Only create if the edit intersects the placeholder bounds
      if (!(oldChangeEnd <= rep.start || changeStart >= rep.end)) {
        const newRange = { start: rep.start, end: rep.start + insertedLen };
        activeReplacementRangeRef.current = { ...newRange };
        updatedRanges.push(newRange);
      }
      replacingPlaceholderRef.current = null; // consumed
    } else if (activeReplacementRangeRef.current && delta !== 0) {
      // Keep growing active range when typing at or right after its end
      const r = activeReplacementRangeRef.current;
      const mapped = { start: mapPos(r.start), end: mapPos(r.end) };
      let grow = false;
      if (delta > 0 && removedLen === 0) {
        // Pure insertion: extend if insertion starts at end of the active range
        if (changeStart === mapped.end || caretPos === mapped.end + insertedLen) {
          mapped.end += insertedLen;
          grow = true;
        }
      }
      activeReplacementRangeRef.current = { ...mapped };
      updatedRanges = updatedRanges.map(x => (x.start === r.start && x.end === r.end) ? mapped : x);
      if (!grow && delta !== 0) {
        // If edit moved away, stop actively growing it
        if (caretPos < mapped.start || caretPos > mapped.end) {
          activeReplacementRangeRef.current = null;
        }
      }
    } else if (delta > 0 && removedLen === 0) {
      // No active range, but user inserted text: if insertion happens exactly at the end of any existing range, extend that range
      const tryExtend = (arr: { start: number; end: number }[]) => {
        for (let i = 0; i < arr.length; i++) {
          const r = arr[i];
          if (changeStart === r.end) {
            arr[i] = { start: r.start, end: r.end + insertedLen };
            // Make it active so further typing continues to grow this highlight
            activeReplacementRangeRef.current = { ...arr[i] };
            return true;
          }
        }
        return false;
      };
      // Prefer extending internal ranges, then external, then persistent
      if (!tryExtend(updatedRanges)) {
        if (!tryExtend(updatedExternal)) {
          tryExtend(updatedPersistent);
        }
      }
    }

    updatedRanges = mergeRanges(updatedRanges);
    updatedExternal = mergeRanges(updatedExternal);
    updatedPersistent = mergeRanges(updatedPersistent);
    setHighlightRanges(updatedRanges);
    setSyncedExternalRanges(updatedExternal);
    setSyncedPersistentRanges(updatedPersistent);

    onChange(newValue);
    addToHistory(newValue);
    previousValueRef.current = newValue;
  };

  // Select placeholder token at cursor to prep for replacement
  const selectPlaceholderAtCursor = () => {
    const ta = taRef.current;
    if (!ta) return;
    // Only act when there's no selection already
    if (ta.selectionStart !== ta.selectionEnd) return;

    const pos = ta.selectionStart;
    const text = ta.value;
    const regex = /\[[^\]]+\]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Select only if strictly inside the token (avoid snapping when clicking exactly at boundaries)
      if (pos > start && pos < end) {
        ta.setSelectionRange(start, end);
        replacingPlaceholderRef.current = { start, end };
        activeReplacementRangeRef.current = null;
        break;
      }
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Ctrl+Backspace: Clear all content
    if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
      e.preventDefault();
      const newValue = '';
  internalUpdateRef.current = true;
  onChange(newValue);
      addToHistory(newValue);
      return;
    }
    
    // Alt+Backspace: Delete word backwards
    if (e.altKey && e.key === 'Backspace') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      if (start !== end) {
        // If there's a selection, just delete it
        const newValue = value.slice(0, start) + value.slice(end);
        handleContentChange(newValue);
        setTimeout(() => {
          if (textarea) {
            textarea.setSelectionRange(start, start);
          }
        }, 0);
        return;
      }
      
      // Find word boundary backwards
      let wordStart = start;
      while (wordStart > 0 && /\w/.test(value[wordStart - 1])) {
        wordStart--;
      }
      
      // If we didn't find a word character, delete whitespace backwards
      if (wordStart === start) {
        while (wordStart > 0 && /\s/.test(value[wordStart - 1])) {
          wordStart--;
        }
      }
      
      const newValue = value.slice(0, wordStart) + value.slice(start);
      handleContentChange(newValue);
      
      setTimeout(() => {
        if (textarea) {
          textarea.setSelectionRange(wordStart, wordStart);
        }
      }, 0);
      return;
    }
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        fontSize: 13,
        lineHeight: 1,
        border: 'none',
        background: 'transparent',
        borderRadius: 0,
        padding: 0,
        minHeight
      }}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      {/* Floating toolbar */}
      {showToolbar && (
        <div style={{
          position: 'absolute',
          top: -2,
          right: 4,
          zIndex: 10,
          display: 'flex',
          gap: 2,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid #e1e5e9',
          borderRadius: 4,
          padding: '2px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          opacity: 1,
          transition: 'opacity 0.2s ease'
        }}>
          <button
            onClick={handleUndo}
            disabled={undoRedoState.currentIndex <= 0}
            style={{
              padding: '4px 6px',
              fontSize: 11,
              backgroundColor: 'transparent',
              color: undoRedoState.currentIndex <= 0 ? '#ccc' : '#666',
              border: 'none',
              borderRadius: 2,
              cursor: undoRedoState.currentIndex <= 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
            title="Undo (Ctrl+Z)"
          >
            <FaEdit style={{ fontSize: 12, transform: 'scaleX(-1)' }} />
          </button>
          <button
            onClick={handleRedo}
            disabled={undoRedoState.currentIndex >= undoRedoState.history.length - 1}
            style={{
              padding: '4px 6px',
              fontSize: 11,
              backgroundColor: 'transparent',
              color: undoRedoState.currentIndex >= undoRedoState.history.length - 1 ? '#ccc' : '#666',
              border: 'none',
              borderRadius: 2,
              cursor: undoRedoState.currentIndex >= undoRedoState.history.length - 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
            title="Redo (Ctrl+Y)"
          >
            <FaEdit style={{ fontSize: 12 }} />
          </button>
          <div style={{
            width: 1,
            height: 16,
            backgroundColor: '#e1e5e9',
            margin: '0 2px'
          }} />
          <button
            onClick={() => {
              const newValue = '';
              internalUpdateRef.current = true;
              onChange(newValue);
              addToHistory(newValue);
            }}
            title="Clear all (Ctrl+Backspace)"
          >
            <FaEraser style={{ fontSize: 12 }} />
          </button>
        </div>
      )}
      
      {/* Rich text editor - WYSIWYG experience */}
      <div
        ref={bodyEditorRef}
        contentEditable={true}
        className="rich-text-editor"
        onInput={(e) => {
          const target = e.currentTarget as HTMLDivElement;
          onChange(target.innerHTML);
        }}
        onBlur={(e) => {
          // Finalize any active placeholder editing when leaving the editor
          const editorEl = e.currentTarget as HTMLDivElement;
          const editing = Array.from(editorEl.querySelectorAll('.placeholder-editing')) as HTMLElement[];
          if (editing.length) {
            for (const el of editing) {
              const original = el.getAttribute('data-original') || '';
              const current = (el.textContent || '').trim();
              if (current === original) {
                // No change → restore original placeholder wrapper
                const span = document.createElement('span');
                span.className = 'insert-placeholder';
                span.setAttribute('data-insert', '');
                span.textContent = original;
                el.replaceWith(span);
              } else {
                // Changed → persist edited highlight
                const span = document.createElement('span');
                span.className = 'placeholder-edited';
                span.textContent = current;
                el.replaceWith(span);
              }
            }
            onChange(editorEl.innerHTML);
          }
        }}
        onClick={(e) => {
          // Handle link clicks - allow them to work normally
          const link = (e.target as HTMLElement).closest('a');
          if (link && link.href) {
            // Let links work normally - don't preventDefault
            return;
          }
          
          // Handle placeholder clicks - convert to inline editable text
          const editorEl = e.currentTarget as HTMLDivElement;
          const targetEl = e.target as HTMLElement;
          // If clicking elsewhere, finalize any active editing first (except if clicking inside it)
          const activeEdits = Array.from(editorEl.querySelectorAll('.placeholder-editing')) as HTMLElement[];
          if (activeEdits.length) {
            for (const el of activeEdits) {
              if (el.contains(targetEl)) continue; // keep editing the one being interacted with
              const original = el.getAttribute('data-original') || '';
              const current = (el.textContent || '').trim();
              if (current === original) {
                const span = document.createElement('span');
                span.className = 'insert-placeholder';
                span.setAttribute('data-insert', '');
                span.textContent = original;
                el.replaceWith(span);
              } else {
                const span = document.createElement('span');
                span.className = 'placeholder-edited';
                span.textContent = current;
                el.replaceWith(span);
              }
            }
            onChange(editorEl.innerHTML);
          }

          const span = targetEl.closest('.insert-placeholder');
          if (span) {
            e.preventDefault();
            e.stopPropagation();
            // Turn placeholder into an editing wrapper retaining original text for comparison
            const original = span.textContent || '';
            const wrapper = document.createElement('span');
            wrapper.className = 'placeholder-editing';
            wrapper.setAttribute('data-original', original);
            const inner = document.createElement('span');
            inner.className = 'edit-text';
            inner.textContent = original;
            wrapper.appendChild(inner);
            span.replaceWith(wrapper);
            // Select all text for easy replacement
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(inner);
            sel?.removeAllRanges();
            sel?.addRange(range);
            onChange(editorEl.innerHTML);
          }
        }}
        onDoubleClick={(e) => {
          // Double-click also triggers inline editing
          const placeholder = (e.target as HTMLElement).closest('.insert-placeholder');
          if (placeholder) {
            e.preventDefault();
            e.stopPropagation();
            // Trigger the same click behavior
            (placeholder as HTMLElement).click();
          }
        }}
        onKeyDown={(e) => {
          // Handle Enter key for placeholder inline editing
          if (e.key === 'Enter') {
            const placeholder = (e.target as HTMLElement).closest('.insert-placeholder');
            if (placeholder) {
              e.preventDefault();
              e.stopPropagation();
              (placeholder as HTMLElement).click();
              return;
            }
          }
          
          // Handle keyboard shortcuts for rich text formatting
          const key = e.key.toLowerCase();
          const ctrl = e.ctrlKey || e.metaKey;
          const shift = e.shiftKey;
          
          if (ctrl) {
            switch (key) {
              case 'b':
                e.preventDefault();
                handleFormatCommand?.('bold');
                break;
              case 'i':
                e.preventDefault();
                handleFormatCommand?.('italic');
                break;
              case 'u':
                e.preventDefault();
                handleFormatCommand?.('underline');
                break;
              case 'k':
                e.preventDefault();
                const url = prompt('Enter URL:');
                if (url) handleFormatCommand?.('createLink', url);
                break;
              case 'l':
                e.preventDefault();
                handleFormatCommand?.('justifyLeft');
                break;
              case 'e':
                e.preventDefault();
                handleFormatCommand?.('justifyCenter');
                break;
              case 'r':
                e.preventDefault();
                handleFormatCommand?.('justifyRight');
                break;
              case 'z':
                if (shift) {
                  e.preventDefault();
                  handleFormatCommand?.('redo');
                } else {
                  e.preventDefault();
                  handleFormatCommand?.('undo');
                }
                break;
              case 'y':
                e.preventDefault();
                handleFormatCommand?.('redo');
                break;
              case '8':
                if (shift) {
                  e.preventDefault();
                  handleFormatCommand?.('insertUnorderedList');
                }
                break;
              case '7':
                if (shift) {
                  e.preventDefault();
                  handleFormatCommand?.('insertOrderedList');
                }
                break;
            }
          }
          
          if (key === 's' && ctrl && shift) {
            e.preventDefault();
            handleFormatCommand?.('strikeThrough');
          }
        }}
        suppressContentEditableWarning={true}
        style={{
          width: '100%',
          minHeight: minHeight,
          background: 'transparent',
          color: isDarkMode ? colours.dark.text : '#222',
          font: 'inherit',
          lineHeight: 1.6,
          border: 'none',
          padding: '8px 12px',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxSizing: 'border-box',
          resize: 'none'
        }}
        spellCheck={true}
        title="Rich text editor - use toolbar or keyboard shortcuts for formatting"
      />
    </div>
  );
};

interface EditorAndTemplateBlocksProps {
  isDarkMode: boolean;
  body: string;
  setBody: (body: string) => void;
  templateBlocks: TemplateBlock[];
  selectedTemplateOptions: { [key: string]: string | string[] };
  insertedBlocks: { [key: string]: boolean };
  lockedBlocks: { [key: string]: boolean };
  editedBlocks: { [key: string]: boolean };
  handleMultiSelectChange: (blockTitle: string, selectedOptions: string[]) => void;
  handleSingleSelectChange: (blockTitle: string, optionKey: string) => void;
  insertTemplateBlock: (block: TemplateBlock, optionLabel: string | string[], focus?: boolean) => void;
  renderPreview: (block: TemplateBlock) => React.ReactNode;
  applyFormat: (...args: any[]) => void;
  saveSelection: () => void;
  handleInput: (e: React.FormEvent<HTMLDivElement>) => void;
  handleBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
  handleClearBlock: (block: TemplateBlock) => void;
  bodyEditorRef: React.RefObject<HTMLDivElement>;
  toolbarStyle?: any;
  bubblesContainerStyle?: any;
  saveCustomSnippet?: (blockTitle: string, label?: string, sortOrder?: number, isNew?: boolean) => Promise<void>;
  markBlockAsEdited?: (blockTitle: string, edited: boolean) => void;
  initialNotes?: string;
  subject: string;
  setSubject: (subject: string) => void;
  // Deal capture props
  showDealCapture?: boolean;
  initialScopeDescription?: string;
  onScopeDescriptionChange?: (value: string) => void;
  amount?: string;
  onAmountChange?: (value: string) => void;
  // Inline preview dependencies
  userData?: any;
  enquiry?: any;
  passcode?: string;
  handleDraftEmail?: () => void;
  sendEmail?: () => void;
  isDraftConfirmed?: boolean;
  // Email recipient props for send confirmation
  to?: string;
  cc?: string;
  bcc?: string;
  feeEarnerEmail?: string;
  // Callback to update recipients before sending
  onRecipientsChange?: (to: string, cc?: string, bcc?: string) => void;
  // Inline status feedback
  dealCreationInProgress?: boolean;
  dealStatus?: 'idle' | 'processing' | 'ready' | 'error';
  emailStatus?: 'idle' | 'processing' | 'sent' | 'error';
  emailMessage?: string;
}

const EditorAndTemplateBlocks: React.FC<EditorAndTemplateBlocksProps> = ({
  isDarkMode,
  body,
  setBody,
  templateBlocks,
  selectedTemplateOptions,
  insertedBlocks,
  lockedBlocks,
  editedBlocks,
  handleMultiSelectChange,
  handleSingleSelectChange,
  insertTemplateBlock,
  renderPreview,
  applyFormat,
  saveSelection,
  handleInput,
  handleBlur,
  handleClearBlock,
  bodyEditorRef,
  toolbarStyle,
  bubblesContainerStyle,
  saveCustomSnippet,
  markBlockAsEdited,
  initialNotes,
  subject,
  setSubject,
  // Deal capture props
  showDealCapture = true,
  initialScopeDescription,
  onScopeDescriptionChange,
  amount,
  onAmountChange,
  // Inline preview dependencies
  userData,
  enquiry,
  passcode,
  handleDraftEmail,
  sendEmail,
  isDraftConfirmed,
  // Email recipient props for send confirmation
  to,
  cc,
  bcc,
  feeEarnerEmail,
  onRecipientsChange,
  // Inline status feedback
  dealCreationInProgress,
  dealStatus,
  emailStatus,
  emailMessage
}) => {
  // State for removed blocks
  const [removedBlocks, setRemovedBlocks] = useState<{ [key: string]: boolean }>({});
  // Local editable contents per block
  const [blockContents, setBlockContents] = useState<{ [key: string]: string }>({});

  // Deal capture state
  const [scopeDescription, setScopeDescription] = useState(initialScopeDescription || '');
  // Default amount now 1500 if not supplied
  const [amountValue, setAmountValue] = useState(amount && amount.trim() !== '' ? amount : '1500');
  const [amountError, setAmountError] = useState<string | null>(null);
  // Removed PIC placeholder insertion feature per user request
  const [isNotesPinned, setIsNotesPinned] = useState(false);
  const [showSubjectHint, setShowSubjectHint] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const isBeforeCallCall = selectedScenarioId === 'before-call-call';
  const [isTemplatesCollapsed, setIsTemplatesCollapsed] = useState(false); // Start expanded for immediate selection
  const [showInlinePreview, setShowInlinePreview] = useState(false);
  // Email confirmation modal state
  const [showSendConfirmModal, setShowSendConfirmModal] = useState(false);
  // Email processing method selection state
  const [showEmailProcessingDialog, setShowEmailProcessingDialog] = useState(false);
  const [selectedEmailMethod, setSelectedEmailMethod] = useState<'v1' | 'v2' | null>(null);
  // Track which action is requesting processing selection: 'send' or 'draft'
  const [processingDialogAction, setProcessingDialogAction] = useState<'send' | 'draft' | null>(null);
  const [confirmReady, setConfirmReady] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  // Copy feedback flags
  const [copiedToolbar, setCopiedToolbar] = useState(false);
  const [copiedFooter, setCopiedFooter] = useState(false);
  // Modal validation error
  const [modalError, setModalError] = useState<string | null>(null);
  // Track in-modal sending to disable actions and show progress inline
  const [modalSending, setModalSending] = useState<boolean>(false);
  // HMR tick to force re-render when scenarios module hot-reloads
  const [hmrTick, setHmrTick] = useState(0);
  // Prevent Draft visual state from being triggered by Send action
  const [hasSentEmail, setHasSentEmail] = useState(false);
  // Track hover state for validation message
  const [showSendValidation, setShowSendValidation] = useState<boolean>(false);
  // Editable To field in modal
  const [editableTo, setEditableTo] = useState<string>(to || '');
  // Rich text mode is always enabled for WYSIWYG experience
  const richTextMode = true;

  // Update editable To when prop changes
  React.useEffect(() => {
    setEditableTo(to || '');
  }, [to]);

  // Helper: reset editor to a fresh state
  const resetEditor = useCallback(() => {
    try {
      setSelectedScenarioId('');
      setBody('');
      setSubject('Your Enquiry - Helix Law');
      setScopeDescription('');
      setAmountValue('1500');
      setAmountError(null);
      setIsTemplatesCollapsed(false);
      setShowInlinePreview(false);
      setConfirmReady(false);
      setHasSentEmail(false);
      setBlockContents({});
      setRemovedBlocks({});
      setAllBodyReplacedRanges([]);
    } catch {}
  }, [setBody, setSubject]);

  // Keep modal open - let user close when ready (more reassuring UX)
  // Auto-reset editor only after a real SEND completes successfully (not for DRAFT)
  useEffect(() => {
    const saved = dealStatus === 'ready';
    const sent = emailStatus === 'sent';
    // Only auto-reset editor if both operations completed successfully AND modal is closed AND a send occurred
    if (!showSendConfirmModal && saved && sent && hasSentEmail) {
      resetEditor();
    }
  }, [showSendConfirmModal, dealStatus, emailStatus, hasSentEmail, resetEditor]);

  // Auto-close modal after successful email send
  useEffect(() => {
    if (emailStatus === 'sent' && showSendConfirmModal) {
      const timer = setTimeout(() => {
        setShowSendConfirmModal(false);
      }, 2000); // Close after 2 seconds to allow user to see success
      return () => clearTimeout(timer);
    }
  }, [emailStatus, showSendConfirmModal]);

  // Helper: apply simple [RATE]/[ROLE] substitutions and dynamic tokens ([InstructLink])
  const applyRateRolePlaceholders = useCallback((text: string) => {
    const u: any = Array.isArray(userData) ? (userData?.[0] ?? null) : userData;
    if (!u || !text) return text;
    const roleRaw = (u.Role ?? u.role ?? u.RoleName ?? u.roleName);
    const rateRaw = (u.Rate ?? u.rate ?? u.HourlyRate ?? u.hourlyRate);
    const roleStr = roleRaw == null ? '' : String(roleRaw).trim();
    const parseRate = (val: unknown): number | null => {
      if (val == null) return null;
      if (typeof val === 'number') return isFinite(val) ? val : null;
      const cleaned = String(val).replace(/[^0-9.\-]/g, '').trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      return isFinite(n) ? n : null;
    };
    const rateNumber = parseRate(rateRaw);
    const formatRateGBP = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + VAT`;
    let out = text;
    if (rateNumber != null) out = out.replace(/\[RATE\]/gi, formatRateGBP(rateNumber));
    if (roleStr) out = out.replace(/\[ROLE\]/gi, roleStr);
    // Also apply dynamic substitutions so [InstructLink] renders in the editor
    // For editor, compute an effective passcode (use provided passcode or a deterministic local one derived from enquiry ID)
  const effectivePass = passcode || undefined; // no fallback
    let substituted = applyDynamicSubstitutions(
      out,
      userData,
      enquiry,
      amount,
      effectivePass
    );
    // Replace the HTML anchor with a React anchor for in-editor display
    substituted = substituted.replace(
      /<a href="([^"]*)"[^>]*>Instruct Helix Law<\/a>/gi,
      (_match, href) => {
        // Use a unique marker for React rendering
        return `[[INSTRUCT_LINK::${href}]]`;
      }
    );
    return substituted;
  }, [userData, enquiry, amount, passcode]);
  // Track the last body we injected from a scenario so we can safely refresh on scenario edits
  const lastScenarioBodyRef = useRef<string>('');
  
  // Track the last passcode so we can re-process the editor content when it becomes available
  const lastPasscodeRef = useRef<string>('');

  // When passcode becomes available, re-process the editor content to update [InstructLink] tokens
  useEffect(() => {
  const effective = passcode || undefined; // no fallback
    if (effective && effective !== lastPasscodeRef.current && body) {
      const processedBody = applyRateRolePlaceholders(body);
      if (processedBody !== body) {
        setBody(processedBody);
      }
      lastPasscodeRef.current = effective;
    }
  }, [passcode, enquiry, body, applyRateRolePlaceholders, setBody]);

  // Accept hot updates to the scenarios module (CRA/Webpack HMR) and trigger a lightweight re-render
  useEffect(() => {
    const anyModule: any = module as any;
    if (anyModule && anyModule.hot) {
      const handler = () => setHmrTick((t) => t + 1);
      try {
        anyModule.hot.accept('./scenarios', handler);
      } catch {
        // no-op if HMR not available
      }
    }
  }, []);
  // Refresh selected scenario body when scenario definitions hot-update
  // Removed this effect as it was causing constant resets due to SCENARIOS_VERSION changing on every import
  // Ensure a default subject without tying it to scenario templates
  const didSetDefaultSubject = useRef(false);
  useEffect(() => {
    if (!didSetDefaultSubject.current && (!subject || subject.trim() === '')) {
      didSetDefaultSubject.current = true;
      setSubject('Your Enquiry - Helix Law');
    }
  }, [subject, setSubject]);

  // --- Create floating pin button with portal to render outside component tree ---
  // Global sticky notes with portal when pinned
  const GlobalStickyNotes = () => {
    if (!initialNotes || !isNotesPinned) return null;
    
    return createPortal(
      <div style={{
        position: 'fixed',
        top: 10,
        left: 20,
        right: 20,
        maxWidth: '600px',
        margin: '0 auto',
        zIndex: 9999,
        backgroundColor: isDarkMode ? colours.dark.cardBackground : '#ffffff',
        padding: '12px',
        borderRadius: '8px',
        border: `2px solid ${colours.blue}`,
        boxShadow: '0 4px 12px rgba(0,120,212,0.15)',
  transition: 'all 0.3s ease-in-out'
      }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: isDarkMode ? colours.blue : colours.darkBlue,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          justifyContent: 'flex-start'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FaInfoCircle style={{ fontSize: 12 }} />
            Enquiry Notes
          </div>
        </div>
        {/* Floating unpin icon */}
        <button
          onClick={() => setIsNotesPinned(false)}
          title="Unpin notes"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDarkMode ? colours.dark.inputBackground : '#ffffff',
            border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
            color: isDarkMode ? colours.dark.text : colours.darkBlue,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colours.blue;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : '#e1e5e9';
          }}
        >
          <FaThumbtack style={{ fontSize: 14, color: isDarkMode ? colours.dark.text : colours.darkBlue }} />
        </button>
        <div style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: isDarkMode ? colours.dark.text : colours.darkBlue,
          backgroundColor: isDarkMode ? colours.dark.inputBackground : '#f8f9fa',
          border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
          borderRadius: 6,
          padding: '12px 16px',
          maxHeight: '200px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap'
        }}>
          {initialNotes}
        </div>
      </div>,
      document.body
    );
  };

  // PIC feature removed

  // Initialize and ensure [AMOUNT] placeholder line present
  useEffect(() => {
    // Only ensure [AMOUNT] is present if not already in description
  }, []);

  // Replace placeholders with actual values when amount changes
  useEffect(() => {
    if (amountValue && scopeDescription && scopeDescription.includes('[AMOUNT]')) {
      const formattedAmount = `£${parseFloat(amountValue).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const updatedScope = scopeDescription.replace(/\[AMOUNT\]/g, formattedAmount);
      setScopeDescription(updatedScope);
      onScopeDescriptionChange?.(updatedScope);
    }
  }, [amountValue]);

  // Handle removing a block
  const handleRemoveBlock = (block: TemplateBlock) => {
    // Mark the block as removed
    setRemovedBlocks(prev => ({
      ...prev,
      [block.title]: true
    }));
    
    // Clear the selection for this block
    if (block.isMultiSelect) {
      handleMultiSelectChange(block.title, []);
    } else {
      handleSingleSelectChange(block.title, '');
    }
  };

  // Handle re-inserting a removed block
  const handleReinsertBlock = (block: TemplateBlock) => {
    // Remove from removed blocks to show it again
    setRemovedBlocks(prev => {
      const newState = { ...prev };
      delete newState[block.title];
      return newState;
    });
  };

  // Deal capture event handlers
  const handleScopeDescriptionChange = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
    const value = newValue || '';
    setScopeDescription(value);
    
    // Process the value to replace placeholders with actual values
    let processedValue = value;
    
    // Replace [AMOUNT] placeholder with actual amount if available
    if (amountValue && processedValue.includes('[AMOUNT]')) {
      const formattedAmount = `£${parseFloat(amountValue).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      processedValue = processedValue.replace(/\[AMOUNT\]/g, formattedAmount);
    }
    
    onScopeDescriptionChange?.(processedValue);
  };

  const handleAmountChange = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
    const value = newValue || '';
    setAmountValue(value);
    
    // Validate amount
    if (value && isNaN(Number(value))) {
      setAmountError('Please enter a valid number');
    } else {
      setAmountError(null);
    }
    
    // Auto-update scope description by replacing [AMOUNT] placeholders
    if (scopeDescription) {
      let updatedScope = scopeDescription;
      
      if (value && !isNaN(Number(value))) {
        // Format the amount with currency and proper formatting
        const numericValue = parseFloat(value);
        const formattedAmount = `£${numericValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        // Replace existing [AMOUNT] placeholders with the actual formatted amount
        if (updatedScope.includes('[AMOUNT]')) {
          updatedScope = updatedScope.replace(/\[AMOUNT\]/g, formattedAmount);
        } else if (!updatedScope.includes('Estimated fee:') && !updatedScope.includes('£')) {
          // Add the amount if it doesn't exist yet
          updatedScope = updatedScope + '\n\nEstimated fee: ' + formattedAmount;
        } else if (updatedScope.includes('Estimated fee:')) {
          // Replace existing amount in "Estimated fee:" line
          updatedScope = updatedScope.replace(/(Estimated fee:\s*)£[\d,]+\.[\d]{2}/g, `$1${formattedAmount}`);
        }
      } else if (value === '') {
        // If amount is cleared, revert back to placeholder
        updatedScope = updatedScope.replace(/£[\d,]+\.[\d]{2}/g, '[AMOUNT]');
      }
      
      setScopeDescription(updatedScope);
      onScopeDescriptionChange?.(updatedScope);
    }
    
    onAmountChange?.(value);
  };

  // Initialise blockContents when selections appear (do not overwrite if user already edited)
  useEffect(() => {
    const updates: { [k: string]: string } = {};
    templateBlocks.forEach(block => {
      const selectedOptions = selectedTemplateOptions[block.title];
      const isMultiSelect = block.isMultiSelect;
      const hasSelections = isMultiSelect
        ? Array.isArray(selectedOptions) && selectedOptions.length > 0
        : !!selectedOptions && selectedOptions !== '';
      if (hasSelections && blockContents[block.title] === undefined) {
        const base = block.editableContent || (isMultiSelect
          ? block.options
              .filter(opt => Array.isArray(selectedOptions) && selectedOptions.includes(opt.label))
              .map(o => htmlToPlainText(o.previewText))
              .join('\n\n')
          : htmlToPlainText(block.options.find(opt => opt.label === selectedOptions)?.previewText || ''));
        updates[block.title] = base;
      }
    });
    if (Object.keys(updates).length) {
      setBlockContents(prev => ({ ...prev, ...updates }));
    }
  }, [templateBlocks, selectedTemplateOptions]);

  const handleBlockContentChange = (block: TemplateBlock, newValue?: string) => {
    const value = newValue ?? '';
    setBlockContents(prev => ({ ...prev, [block.title]: value }));
    if (!editedBlocks[block.title]) {
      markBlockAsEdited?.(block.title, true);
    }
  };

  // Auto-insert Rate/Role highlight state and effect
  const [allBodyReplacedRanges, setAllBodyReplacedRanges] = useState<{ start: number; end: number }[]>([]);
  
  // Auto-insert handler: replace the persistent green highlights with the new set from auto-insert
  // This prevents accumulation/ghosting across scenario/template switches and ensures first-click visibility.
  const handleAutoInsertHighlights = useCallback((ranges: { start: number; end: number }[]) => {
    setAllBodyReplacedRanges(ranges.slice());
  }, []);
  
  // Handle formatting commands from toolbar
  const handleFormatCommand = useCallback((command: string, value?: string) => {
    if (!richTextMode) return;
    
    try {
      const success = document.execCommand(command, false, value);
      if (success) {
        // Trigger change detection to update body state
        setTimeout(() => {
          if (bodyEditorRef.current) {
            setBody(bodyEditorRef.current.innerHTML);
          }
        }, 10);
      }
    } catch (error) {
      console.warn(`Failed to execute format command ${command}:`, error);
    }
  }, [richTextMode, setBody]);

  // Keyboard shortcut handler for rich text formatting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!richTextMode || !bodyEditorRef.current?.contains(e.target as Node)) return;

      const { ctrlKey, metaKey, shiftKey, key } = e;
      const cmdKey = ctrlKey || metaKey;

      if (cmdKey) {
        const shortcutKey = [
          cmdKey ? 'ctrl' : '',
          shiftKey ? 'shift' : '',
          key.toLowerCase()
        ].filter(Boolean).join('+');

        const command = KEYBOARD_SHORTCUTS[shortcutKey as keyof typeof KEYBOARD_SHORTCUTS];
        
        if (command) {
          e.preventDefault();
          handleFormatCommand(command);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [richTextMode, handleFormatCommand]);
  
  useAutoInsertRateRole(body, setBody, userData, handleAutoInsertHighlights);
  // Also apply to subject so switching templates gets replacements too
  useAutoInsertRateRole(subject, setSubject, userData);

  // Email send wrapper that handles V1/V2 processing based on selected method
  const handleSendEmailWithProcessing = useCallback(async () => {
    if (!sendEmail) return;
    
    // Store the selected method in window for PitchBuilder to access
    if (selectedEmailMethod === 'v2') {
      (window as any).__helixEmailProcessingV2__ = true;
      console.log('V2 email processing enabled for this send operation');
    } else {
      (window as any).__helixEmailProcessingV2__ = false;
      console.log('V1 email processing (production method) selected');
    }
    
    try {
      // Call the original sendEmail function
      await sendEmail();
    } finally {
      // Clean up the flag after sending
      delete (window as any).__helixEmailProcessingV2__;
      // Reset selection after sending
      setSelectedEmailMethod(null);
    }
  }, [sendEmail, selectedEmailMethod]);

  return (
    <>
      {/* Design System CSS Variables */}
      <style>{`
        :root {
          --helix-navy: #061733;
          --helix-blue: #3690CE;
          --helix-grey: #F4F4F6;
          --helix-border: #E3E8EF;
          --helix-success: #10B981;
          --helix-warning: #F59E0B;
          --helix-error: #EF4444;
          --white: #FFFFFF;
          
          /* Raleway as default font family */
          --helix-font: 'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        /* Apply Raleway to most elements in this component */
        .helix-professional-content * {
          font-family: var(--helix-font) !important;
        }
        /* EXCEPTION: Fluent UI font icons must keep their icon font family */
        .helix-professional-content .ms-Icon,
        .helix-professional-content i.ms-Icon,
        .helix-professional-content span.ms-Icon,
        .helix-professional-content [class*="ms-Icon"] {
          font-family: 'FabricMDL2Icons','Segoe MDL2 Assets' !important;
          speak: none;
          font-weight: normal;
          font-style: normal;
        }
        
        /* Custom text selection styling - softer blue for brand consistency */
        .helix-professional-content *::selection {
          background-color: rgba(54, 144, 206, 0.15);
          color: #1E293B;
        }
        
        .helix-professional-content *::-moz-selection {
          background-color: rgba(54, 144, 206, 0.15);
          color: #1E293B;
        }

        /* Keyframe animation for radio button check */
        @keyframes radio-check {
          from {
            transform: translate(-50%, -50%) scale(0);
          }
          to {
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes cascadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
          --grey-50: #F9FAFB;
          --grey-100: #F3F4F6;
          --grey-200: #E5E7EB;
          --grey-300: #D1D5DB;
          --grey-400: #9CA3AF;
          --grey-500: #6B7280;
          --grey-600: #4B5563;
          --grey-700: #374151;
          --grey-800: #1F2937;
          --grey-900: #111827;
          --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          --text-xs: 0.75rem;
          --text-sm: 0.875rem;
          --text-base: 1rem;
          --text-lg: 1.125rem;
          --text-xl: 1.25rem;
          --weight-normal: 400;
          --weight-medium: 500;
          --weight-semibold: 600;
          --weight-bold: 700;
          --leading-tight: 1.25;
          --leading-normal: 1.5;
          --leading-relaxed: 1.625;
          --space-1: 0.25rem;
          --space-2: 0.5rem;
          --space-3: 0.75rem;
          --space-4: 1rem;
          --space-5: 1.25rem;
          --space-6: 1.5rem;
          --space-8: 2rem;
          --space-12: 3rem;
          --radius-base: 0.25rem;
          --radius-md: 0.375rem;
          --radius-lg: 0.5rem;
          --radius-xl: 0.75rem;
          --shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          --shadow-base: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .helix-professional-content {
          padding: var(--space-8);
        }

        .helix-professional-input {
          font-family: var(--font-primary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--grey-300);
          padding: var(--space-3) var(--space-4);
          font-size: var(--text-sm);
          background-color: var(--white);
          transition: var(--transition-base);
        }

        .helix-professional-input:focus {
          border-color: var(--helix-blue);
          outline: none;
          box-shadow: 0 0 0 3px rgba(54, 144, 206, 0.1);
        }

        .helix-professional-button {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-lg);
          border: 1px solid var(--grey-300);
          background-color: var(--white);
          color: var(--grey-700);
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: var(--weight-medium);
          transition: var(--transition-base);
          font-family: var(--font-primary);
        }

        .helix-professional-button:hover {
          border-color: var(--helix-blue);
          background-color: var(--grey-50);
        }

        .helix-professional-button-primary {
          background-color: var(--helix-blue);
          color: var(--white);
          border: none;
        }

        .helix-professional-button-primary:hover {
          background-color: #2980b9;
        }

        .helix-professional-label {
          font-size: var(--text-sm);
          font-weight: var(--weight-medium);
          color: var(--helix-navy);
          margin-bottom: var(--space-2);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
      `}</style>

      {/* Global sticky notes portal */}
      <GlobalStickyNotes />
      
      {/* Content */}
      <div className="helix-professional-content">
      
      <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 0 } }}>
        {/* Direct content without Email Composer container */}
        <div style={{ padding: '0 0 16px 0' }}>
          {/* Scenario Picker - Modern Professional Design */}
          <div style={{
            background: isDarkMode 
              ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
              : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            borderRadius: '16px',
            padding: '24px',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.26)' : 'rgba(148, 163, 184, 0.16)'}`,
            boxShadow: isDarkMode 
              ? '0 20px 44px rgba(2, 6, 17, 0.72)'
              : '0 16px 40px rgba(13, 47, 96, 0.18)',
            marginBottom: 20,
            fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            position: 'relative',
            transition: 'all 0.25s ease'
          }}>
            {/* Refined accent border */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '60px',
              height: '3px',
              background: isDarkMode 
                ? `linear-gradient(90deg, ${colours.blue}, ${colours.darkBlue})`
                : `linear-gradient(90deg, ${colours.blue}, ${colours.darkBlue})`,
              borderRadius: '0 0 8px 8px'
            }}></div>
            
            <div 
              style={{
                fontSize: '17px',
                fontWeight: 600,
                color: isDarkMode ? colours.dark.text : '#0F172A',
                marginBottom: isTemplatesCollapsed ? 0 : '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 20px',
                background: isDarkMode 
                  ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
                  : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                borderRadius: '12px',
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(12px)'
              }}
              onClick={() => setIsTemplatesCollapsed(!isTemplatesCollapsed)}
              onMouseEnter={(e) => {
                if (isDarkMode) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(10, 20, 40, 0.96) 0%, rgba(15, 35, 65, 0.9) 100%)';
                  e.currentTarget.style.borderColor = 'rgba(54, 144, 206, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                } else {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #FAFBFC 0%, #F1F5F9 100%)';
                  e.currentTarget.style.borderColor = 'rgba(54, 144, 206, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (isDarkMode) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)';
                  e.currentTarget.style.borderColor = 'rgba(125, 211, 252, 0.24)';
                  e.currentTarget.style.transform = 'translateY(0)';
                } else {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.22)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  padding: '8px',
                  borderRadius: '8px',
                  background: (() => {
                    if (selectedScenarioId) {
                      switch(selectedScenarioId) {
                        case 'before-call-call':
                          return isDarkMode 
                            ? 'linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(54, 144, 206, 0.15) 100%)'
                            : 'linear-gradient(135deg, rgba(54, 144, 206, 0.1) 0%, rgba(96, 165, 250, 0.08) 100%)';
                        case 'before-call-no-call':
                          return isDarkMode
                            ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(217, 119, 6, 0.15) 100%)'
                            : 'linear-gradient(135deg, rgba(217, 119, 6, 0.1) 0%, rgba(251, 191, 36, 0.08) 100%)';
                        case 'after-call-probably-cant-assist':
                          return isDarkMode
                            ? 'linear-gradient(135deg, rgba(248, 113, 113, 0.2) 0%, rgba(220, 38, 38, 0.15) 100%)'
                            : 'linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(248, 113, 113, 0.08) 100%)';
                        case 'after-call-want-instruction':
                          return isDarkMode
                            ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.2) 0%, rgba(5, 150, 105, 0.15) 100%)'
                            : 'linear-gradient(135deg, rgba(5, 150, 105, 0.1) 0%, rgba(74, 222, 128, 0.08) 100%)';
                        default:
                          return isDarkMode
                            ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.2) 0%, rgba(107, 114, 128, 0.15) 100%)'
                            : 'linear-gradient(135deg, rgba(107, 114, 128, 0.1) 0%, rgba(148, 163, 184, 0.08) 100%)';
                      }
                    } else {
                      // Default blue background when no template selected
                      return isDarkMode 
                        ? 'linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(54, 144, 206, 0.15) 100%)'
                        : 'linear-gradient(135deg, rgba(54, 144, 206, 0.1) 0%, rgba(96, 165, 250, 0.08) 100%)';
                    }
                  })(),
                  border: (() => {
                    if (selectedScenarioId) {
                      switch(selectedScenarioId) {
                        case 'before-call-call':
                          return `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`;
                        case 'before-call-no-call':
                          return `1px solid ${isDarkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(217, 119, 6, 0.2)'}`;
                        case 'after-call-probably-cant-assist':
                          return `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.3)' : 'rgba(220, 38, 38, 0.2)'}`;
                        case 'after-call-want-instruction':
                          return `1px solid ${isDarkMode ? 'rgba(74, 222, 128, 0.3)' : 'rgba(5, 150, 105, 0.2)'}`;
                        default:
                          return `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(107, 114, 128, 0.2)'}`;
                      }
                    } else {
                      // Default blue border when no template selected
                      return `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`;
                    }
                  })(),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {(() => {
                    const iconSize = 16;
                    
                    if (selectedScenarioId) {
                      // Get the specific color for the selected template
                      const iconColor = (() => {
                        switch(selectedScenarioId) {
                          case 'before-call-call': return isDarkMode ? colours.blue : colours.blue;
                          case 'before-call-no-call': return isDarkMode ? '#FBBF24' : '#D97706';
                          case 'after-call-probably-cant-assist': return isDarkMode ? '#F87171' : '#DC2626';
                          case 'after-call-want-instruction': return isDarkMode ? '#4ADE80' : '#059669';
                          default: return isDarkMode ? '#94A3B8' : '#6B7280';
                        }
                      })();
                      
                      // Show the selected template's icon with its specific color
                      switch(selectedScenarioId) {
                        case 'before-call-call':
                          return (
                            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                          );
                        case 'before-call-no-call':
                          return (
                            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                              <polyline points="22,6 12,13 2,6"/>
                            </svg>
                          );
                        case 'after-call-probably-cant-assist':
                          return (
                            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M15 9l-6 6M9 9l6 6"/>
                            </svg>
                          );
                        case 'after-call-want-instruction':
                          return (
                            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                              <path d="M9 12l2 2 4-4"/>
                              <circle cx="12" cy="12" r="10"/>
                            </svg>
                          );
                        default:
                          return (
                            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                              <line x1="9" y1="9" x2="15" y2="15"/>
                              <line x1="15" y1="9" x2="9" y2="15"/>
                            </svg>
                          );
                      }
                    } else {
                      // Default lightning bolt icon when no template is selected
                      const defaultIconColor = colours.blue;
                      return <FaBolt style={{ fontSize: iconSize, color: defaultIconColor }} />;
                    }
                  })()}
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 600 }}>
                    {selectedScenarioId ? 
                      (SCENARIOS.find(s => s.id === selectedScenarioId)?.name || 'Template Selected') :
                      'Pitch Templates'
                    }
                  </div>
                </div>
              </div>
              <div style={{
                padding: '6px',
                borderRadius: '6px',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                transition: 'all 0.2s ease'
              }}>
                {isTemplatesCollapsed ? 
                  <FaChevronDown style={{ fontSize: 14, color: isDarkMode ? '#94A3B8' : '#64748B' }} /> : 
                  <FaChevronUp style={{ fontSize: 14, color: isDarkMode ? '#94A3B8' : '#64748B' }} />
                }
              </div>
            </div>
            
            {!isTemplatesCollapsed && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: window.innerWidth < 1024 ? '1fr' : 'repeat(2, 1fr)',
                gap: '20px',
                padding: '20px',
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
                  : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                borderRadius: '16px',
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.18)'}`,
                boxShadow: isDarkMode
                  ? '0 18px 32px rgba(2, 6, 17, 0.58)'
                  : '0 12px 28px rgba(13, 47, 96, 0.12)',
                backdropFilter: 'blur(12px)',
                animation: 'cascadeIn 0.4s ease-out',
                opacity: 1,
                transform: 'translateY(0)'
              }}>
                {SCENARIOS.map((s, index) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`scenario-choice-card ${selectedScenarioId === s.id ? 'active' : ''}`}
                    aria-pressed={selectedScenarioId === s.id}
                    aria-label={`Select ${s.name} template: ${(() => {
                      switch (s.id) {
                        case 'before-call-call':
                          return 'Schedule consultation with Calendly link and no upfront cost';
                        case 'before-call-no-call':
                          return 'Detailed written pitch with cost estimate and instruction link';
                        case 'after-call-probably-cant-assist':
                          return 'Polite decline with alternative suggestions and review request';
                        case 'after-call-want-instruction':
                          return 'Formal proposal with comprehensive costs and next steps';
                        default:
                          return 'Standard professional response template';
                      }
                    })()}`}
                    role="radio"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedScenarioId(s.id);
                      setIsTemplatesCollapsed(true);

                      const raw = stripDashDividers(s.body);
                      const greetingName = (() => {
                        const e = enquiry as any;
                        const first = e?.First_Name ?? e?.first_name ?? e?.FirstName ?? e?.firstName ?? e?.Name?.split?.(' ')?.[0] ?? e?.ContactName?.split?.(' ')?.[0] ?? '';
                        const name = String(first || '').trim();
                        return name.length > 0 ? name : 'there';
                      })();
                      const composed = raw.startsWith('Hello ')
                        ? raw
                        : raw.startsWith('Hi ')
                          ? raw.replace(/^Hi\s+/, 'Hello ')
                          : `Hello ${greetingName},\n\n${raw}`;
                      const projected = applyRateRolePlaceholders(composed);
                      lastScenarioBodyRef.current = projected;
                      setBody(projected);
                      const firstBlock = templateBlocks?.[0];
                      if (firstBlock?.title) {
                        setBlockContents(prev => ({ ...prev, [firstBlock.title]: projected }));
                      }

                      const isBeforeCall = s.id.startsWith('before-call');
                      if (isBeforeCall) {
                        const placeholderDesc = 'Initial informal steer; scope to be confirmed after call';
                        const needsDesc = !scopeDescription || scopeDescription.trim() === '';
                        if (needsDesc) {
                          setScopeDescription(placeholderDesc);
                          onScopeDescriptionChange?.(placeholderDesc);
                        }
                      }
                    }}
                    style={{
                      position: 'relative',
                      background: selectedScenarioId === s.id
                        ? (isDarkMode
                          ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.95) 0%, rgba(9, 22, 44, 0.92) 52%, rgba(13, 35, 63, 0.9) 100%)'
                          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)')
                        : (isDarkMode
                          ? 'linear-gradient(135deg, rgba(11, 22, 43, 0.88) 0%, rgba(13, 30, 56, 0.8) 100%)'
                          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.92) 0%, rgba(255, 255, 255, 0.88) 100%)'),
                      border: `2px solid ${selectedScenarioId === s.id
                        ? colours.blue
                        : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.16)')}`,
                      borderRadius: '12px',
                      padding: '24px',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      textAlign: 'left',
                      minHeight: '140px',
                      boxShadow: selectedScenarioId === s.id
                        ? (isDarkMode ? '0 10px 36px rgba(54, 144, 206, 0.35), 0 0 0 1px rgba(54, 144, 206, 0.22) inset' : '0 6px 24px rgba(54, 144, 206, 0.25), 0 0 0 1px rgba(54, 144, 206, 0.12) inset')
                        : (isDarkMode ? '0 6px 18px rgba(4, 9, 20, 0.55)' : '0 3px 12px rgba(13, 47, 96, 0.08)'),
                      opacity: 0,
                      animationFillMode: 'forwards',
                      overflow: 'hidden',
                      fontFamily: 'inherit',
                      animation: `cascadeIn 0.5s ease-out ${index * 0.15}s both`,
                      backdropFilter: 'blur(8px)'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedScenarioId !== s.id) {
                        e.currentTarget.style.borderColor = colours.blue;
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 12px 28px rgba(96, 165, 250, 0.28)'
                          : '0 8px 24px rgba(54, 144, 206, 0.2)';
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(13, 28, 56, 0.95) 0%, rgba(17, 36, 64, 0.9) 100%)'
                          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedScenarioId !== s.id) {
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.16)';
                        e.currentTarget.style.boxShadow = isDarkMode ? '0 6px 18px rgba(4, 9, 20, 0.55)' : '0 3px 12px rgba(13, 47, 96, 0.08)';
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(11, 22, 43, 0.88) 0%, rgba(13, 30, 56, 0.8) 100%)'
                          : 'linear-gradient(135deg, rgba(248, 250, 252, 0.92) 0%, rgba(255, 255, 255, 0.88) 100%)';
                      }
                    }}
                  >
                    {/* Modern selection indicator */}
                    {selectedScenarioId === s.id && (
                      <div style={{
                        position: 'absolute',
                        top: '-2px',
                        left: '-2px',
                        right: '-2px',
                        bottom: '-2px',
                        background: `linear-gradient(135deg, ${colours.blue}, ${colours.darkBlue})`,
                        borderRadius: '14px',
                        zIndex: -1,
                        animation: 'pulseGlow 2s infinite'
                      }}></div>
                    )}
                    
                    <div className="scenario-card-content" style={{
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      gap: '16px',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      {/* Icon and title section */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{
                          padding: '12px',
                          borderRadius: '12px',
                          background: (() => {
                            const baseColor = (() => {
                              switch (s.id) {
                                case 'before-call-call': return isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)';
                                case 'before-call-no-call': return isDarkMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.1)';
                                case 'after-call-probably-cant-assist': return isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)';
                                case 'after-call-want-instruction': return isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)';
                                default: return isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.1)';
                              }
                            })();

                            if (selectedScenarioId !== s.id) {
                              return baseColor;
                            }

                            const accentGradient = (() => {
                              switch (s.id) {
                                case 'before-call-call':
                                  return isDarkMode
                                    ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.35) 0%, rgba(96, 165, 250, 0.3) 100%)'
                                    : 'linear-gradient(135deg, rgba(54, 144, 206, 0.22) 0%, rgba(96, 165, 250, 0.18) 100%)';
                                case 'before-call-no-call':
                                  return isDarkMode
                                    ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.35) 0%, rgba(250, 204, 21, 0.28) 100%)'
                                    : 'linear-gradient(135deg, rgba(251, 191, 36, 0.22) 0%, rgba(250, 204, 21, 0.16) 100%)';
                                case 'after-call-probably-cant-assist':
                                  return isDarkMode
                                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.35) 0%, rgba(252, 165, 165, 0.28) 100%)'
                                    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(248, 113, 113, 0.16) 100%)';
                                case 'after-call-want-instruction':
                                  return isDarkMode
                                    ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.35) 0%, rgba(134, 239, 172, 0.28) 100%)'
                                    : 'linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(74, 222, 128, 0.16) 100%)';
                                default:
                                  return isDarkMode
                                    ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.35) 0%, rgba(203, 213, 225, 0.28) 100%)'
                                    : 'linear-gradient(135deg, rgba(148, 163, 184, 0.22) 0%, rgba(226, 232, 240, 0.16) 100%)';
                              }
                            })();

                            return accentGradient;
                          })(),
                          border: `1px solid ${(() => {
                            switch(s.id) {
                              case 'before-call-call': return isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)';
                              case 'before-call-no-call': return isDarkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)';
                              case 'after-call-probably-cant-assist': return isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)';
                              case 'after-call-want-instruction': return isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)';
                              default: return isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)';
                            }
                          })()}`,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease'
                        }}>
                          {(() => {
                            const iconColor = (() => {
                              // If this template is selected, use brand highlight blue
                              if (selectedScenarioId === s.id) {
                                return colours.blue;
                              }
                              
                              // Otherwise, use theme-appropriate colors per template type
                              switch(s.id) {
                                case 'before-call-call': return colours.blue;
                                case 'before-call-no-call': return isDarkMode ? '#FBBF24' : '#D97706';
                                case 'after-call-probably-cant-assist': return isDarkMode ? '#F87171' : '#DC2626';
                                case 'after-call-want-instruction': return isDarkMode ? '#4ADE80' : '#059669';
                                default: return isDarkMode ? '#94A3B8' : '#6B7280';
                              }
                            })();
                            
                            switch(s.id) {
                              case 'before-call-call': 
                                return (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                  </svg>
                                );
                              case 'before-call-no-call':
                                return (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                    <polyline points="22,6 12,13 2,6"/>
                                  </svg>
                                );
                              case 'after-call-probably-cant-assist':
                                return (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path d="M15 9l-6 6M9 9l6 6"/>
                                  </svg>
                                );
                              case 'after-call-want-instruction':
                                return (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                                    <path d="M9 12l2 2 4-4"/>
                                    <circle cx="12" cy="12" r="10"/>
                                  </svg>
                                );
                              default:
                                return (
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                    <line x1="15" y1="9" x2="9" y2="15"/>
                                  </svg>
                                );
                            }
                          })()}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="scenario-title" style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: isDarkMode ? colours.dark.text : '#1E293B',
                            lineHeight: '1.4',
                            marginBottom: '4px'
                          }}>
                            {s.name}
                          </div>
                          
                          <div className="scenario-description" style={{
                            fontSize: '12px',
                            color: isDarkMode ? '#94A3B8' : '#64748B',
                            lineHeight: '1.4',
                            fontWeight: 400
                          }}>
                            {(() => {
                              switch(s.id) {
                                case 'before-call-call': 
                                  return 'Schedule consultation • Calendly link • No upfront cost';
                                case 'before-call-no-call':
                                  return 'Detailed written pitch • Cost estimate • Instruction link';
                                case 'after-call-probably-cant-assist':
                                  return 'Polite decline • Alternative suggestions • Review request';
                                case 'after-call-want-instruction':
                                  return 'Formal proposal • Comprehensive costs • Next steps';
                                default:
                                  return 'Standard professional response template';
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                      
                      {/* Selection indicator */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        marginTop: 'auto'
                      }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          border: `2px solid ${selectedScenarioId === s.id 
                            ? colours.blue
                            : (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.3)')}`,
                          borderRadius: '50%',
                          background: selectedScenarioId === s.id 
                            ? colours.blue
                            : 'transparent',
                          position: 'relative',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {selectedScenarioId === s.id && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
                              <polyline points="20,6 9,17 4,12"/>
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            </div>
            {/* Scenario hot-update handled via top-level useEffect */}
            
            {/* Only show the rest of the form after a template is selected */}
            {selectedScenarioId && (
            <div style={{
              animation: 'cascadeIn 0.3s ease-out',
              opacity: 1,
              transform: 'translateY(0)'
            }}>
            
            {/* Subject Line - Primary Focus */}
            <div style={{
              background: isDarkMode
                ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
                : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.94) 100%)',
              borderRadius: '16px',
              padding: '24px',
              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
              boxShadow: isDarkMode 
                ? '0 18px 32px rgba(2, 6, 17, 0.58)' 
                : '0 12px 28px rgba(13, 47, 96, 0.12)',
              marginBottom: initialNotes ? 24 : 0,
              fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              backdropFilter: 'blur(12px)',
              animation: 'cascadeIn 0.4s ease-out'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: isDarkMode ? '#E0F2FE' : '#0F172A',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  padding: '8px',
                  background: isDarkMode 
                    ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.24) 0%, rgba(59, 130, 246, 0.18) 100%)'
                    : 'linear-gradient(135deg, rgba(54, 144, 206, 0.16) 0%, rgba(96, 165, 250, 0.18) 100%)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(54, 144, 206, 0.3)'}`
                }}>
                  <FaEdit style={{ fontSize: 14, color: colours.blue }} />
                </div>
                Subject Line
              </div>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Craft your email subject based on the context below..."
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  fontSize: '15px',
                  fontWeight: 400,
                  border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.3)'}`,
                  borderRadius: '10px',
                  background: isDarkMode 
                    ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.88) 100%)'
                    : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)',
                  color: isDarkMode ? '#E0F2FE' : '#0F172A',
                  outline: 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isDarkMode
                    ? '0 12px 20px rgba(4, 9, 20, 0.6)'
                    : '0 8px 18px rgba(13, 47, 96, 0.14)',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = isDarkMode ? '#60A5FA' : '#3690CE';
                  e.target.style.borderWidth = '2px';
                  e.target.style.boxShadow = isDarkMode
                    ? '0 0 0 4px rgba(96, 165, 250, 0.2), 0 16px 28px rgba(4, 9, 20, 0.7)'
                    : '0 0 0 4px rgba(54, 144, 206, 0.15), 0 12px 24px rgba(13, 47, 96, 0.18)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.3)';
                  e.target.style.borderWidth = '1px';
                  e.target.style.boxShadow = isDarkMode
                    ? '0 12px 20px rgba(4, 9, 20, 0.6)'
                    : '0 8px 18px rgba(13, 47, 96, 0.14)';
                }}
              />
            </div>

            {/* Default subject is set via a top-level effect to respect Hooks rules */}

            {/* Email body / Preview (swap in place) */}
            <div style={{
              background: isDarkMode
                ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
                : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.94) 100%)',
              borderRadius: '16px',
              padding: '24px',
              border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
              boxShadow: isDarkMode 
                ? '0 18px 32px rgba(2, 6, 17, 0.58)' 
                : '0 12px 28px rgba(13, 47, 96, 0.12)',
              marginBottom: 20,
              fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              backdropFilter: 'blur(12px)',
              animation: 'cascadeIn 0.4s ease-out'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: isDarkMode ? '#E0F2FE' : '#0F172A',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.92) 0%, rgba(11, 30, 55, 0.86) 100%)'
                  : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)',
                borderRadius: '12px',
                border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.3)' : 'rgba(148, 163, 184, 0.22)'}`,
                boxShadow: isDarkMode 
                  ? '0 10px 22px rgba(4, 9, 20, 0.55)' 
                  : '0 6px 16px rgba(13, 47, 96, 0.12)',
                backdropFilter: 'blur(8px)'
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    padding: '8px',
                    background: isDarkMode 
                      ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.24) 0%, rgba(59, 130, 246, 0.18) 100%)'
                      : 'linear-gradient(135deg, rgba(54, 144, 206, 0.16) 0%, rgba(96, 165, 250, 0.18) 100%)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(54, 144, 206, 0.3)'}`
                  }}>
                    <FaFileAlt style={{ fontSize: 14, color: isDarkMode ? '#60A5FA' : '#3690CE' }} />
                  </div>
                  {showInlinePreview ? 'Preview' : 'Email body'}
                </span>
                <div style={{ display: 'inline-flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      if (showInlinePreview) {
                        if (!previewRef.current) return;
                        const text = previewRef.current.innerText || '';
                        try {
                          void navigator.clipboard.writeText(text);
                        } catch {
                          const ta = document.createElement('textarea');
                          ta.value = text;
                          document.body.appendChild(ta);
                          ta.select();
                          try { document.execCommand('copy'); } catch {}
                          document.body.removeChild(ta);
                        }
                        setCopiedToolbar(true);
                        setTimeout(() => setCopiedToolbar(false), 1200);
                        return;
                      }
                      const plain = htmlToPlainText(body);
                      try {
                        void navigator.clipboard.writeText(plain);
                      } catch {
                        // Fallback
                        const ta = document.createElement('textarea');
                        ta.value = plain;
                        document.body.appendChild(ta);
                        ta.select();
                        try { document.execCommand('copy'); } catch {}
                        document.body.removeChild(ta);
                      }
                      setCopiedToolbar(true);
                      setTimeout(() => setCopiedToolbar(false), 1200);
                    }}
                    style={{
                      padding: '10px 16px',
                      fontSize: '12px',
                      borderRadius: '10px',
                      border: copiedToolbar 
                        ? '1px solid #16a34a' 
                        : `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(54, 144, 206, 0.3)'}`,
                      color: copiedToolbar ? '#166534' : colours.blue,
                      background: copiedToolbar
                        ? (isDarkMode ? 'linear-gradient(135deg, rgba(22, 101, 52, 0.35) 0%, rgba(21, 128, 61, 0.25) 100%)' : 'linear-gradient(135deg, #e8f5e8 0%, #dcfce7 100%)')
                        : (isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.24) 0%, rgba(59, 130, 246, 0.18) 100%)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.16) 0%, rgba(96, 165, 250, 0.18) 100%)'),
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: copiedToolbar
                        ? '0 4px 12px rgba(22, 163, 74, 0.28)'
                        : (isDarkMode
                          ? '0 8px 16px rgba(4, 9, 20, 0.5)'
                          : '0 4px 12px rgba(13, 47, 96, 0.12)'),
                      backdropFilter: 'blur(6px)'
                    }}
                    onMouseEnter={(e) => {
                      if (!copiedToolbar) {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(13, 28, 56, 0.94) 0%, rgba(17, 36, 64, 0.9) 100%)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.26) 0%, rgba(96, 165, 250, 0.32) 100%)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 10px 20px rgba(10, 20, 40, 0.55)'
                          : '0 6px 16px rgba(54, 144, 206, 0.24)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!copiedToolbar) {
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(11, 22, 43, 0.88) 0%, rgba(13, 30, 56, 0.82) 100%)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.18) 0%, rgba(96, 165, 250, 0.24) 100%)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 6px 14px rgba(4, 9, 20, 0.6)'
                          : '0 4px 10px rgba(13, 47, 96, 0.16)';
                      }
                    }}
                    title={showInlinePreview ? 'Copy preview text' : 'Copy plain text'}
                  >
                    {copiedToolbar ? (
                      <>
                        <FaCheck style={{ fontSize: 12 }} /> Copied
                      </>
                    ) : (
                      <>
                        <FaCopy style={{ fontSize: 12 }} /> Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowInlinePreview(v => !v)}
                    style={{
                      padding: '10px 16px',
                      fontSize: '12px',
                      borderRadius: '10px',
                      border: showInlinePreview
                        ? `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(54, 144, 206, 0.3)'}`
                        : `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.55)' : 'rgba(54, 144, 206, 0.55)'}`,
                      color: showInlinePreview ? colours.blue : '#ffffff',
                      background: showInlinePreview
                        ? (isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.24) 0%, rgba(59, 130, 246, 0.18) 100%)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.16) 0%, rgba(96, 165, 250, 0.18) 100%)')
                        : 'linear-gradient(135deg, #3690CE 0%, #60A5FA 100%)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: showInlinePreview ? 600 : 700,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: showInlinePreview
                        ? (isDarkMode ? '0 8px 16px rgba(4, 9, 20, 0.5)' : '0 4px 12px rgba(13, 47, 96, 0.12)')
                        : '0 6px 16px rgba(54, 144, 206, 0.22)',
                      backdropFilter: 'blur(6px)'
                    }}
                    onMouseEnter={(e) => {
                      if (showInlinePreview) {
                        e.currentTarget.style.borderColor = colours.blue;
                        e.currentTarget.style.color = colours.blue;
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.34) 0%, rgba(59, 130, 246, 0.28) 100%)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.26) 0%, rgba(96, 165, 250, 0.28) 100%)';
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 10px 20px rgba(10, 20, 40, 0.55)'
                          : '0 6px 16px rgba(54, 144, 206, 0.24)';
                      } else {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #2F7DC2 0%, #539EF0 100%)';
                        e.currentTarget.style.boxShadow = '0 8px 18px rgba(54, 144, 206, 0.25)';
                      }
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      if (showInlinePreview) {
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(54, 144, 206, 0.3)';
                        e.currentTarget.style.color = colours.blue;
                        e.currentTarget.style.background = isDarkMode
                          ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.24) 0%, rgba(59, 130, 246, 0.18) 100%)'
                          : 'linear-gradient(135deg, rgba(54, 144, 206, 0.16) 0%, rgba(96, 165, 250, 0.18) 100%)';
                        e.currentTarget.style.boxShadow = isDarkMode ? '0 8px 16px rgba(4, 9, 20, 0.5)' : '0 4px 12px rgba(13, 47, 96, 0.12)';
                      } else {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #3690CE 0%, #60A5FA 100%)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(54, 144, 206, 0.22)';
                      }
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    title="Toggle inline preview"
                  >
                    <FaEye style={{ fontSize: 12 }} /> {showInlinePreview ? 'Back to editor' : 'Preview'}
                  </button>
                </div>
              </div>
              {!showInlinePreview && (
                <div className="smooth-appear" style={{
                  border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(148, 163, 184, 0.22)'}`,
                  borderRadius: '12px',
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.88) 100%)'
                    : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)',
                  padding: '0',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: isDarkMode ? '0 12px 28px rgba(4, 9, 20, 0.6)' : '0 8px 20px rgba(13, 47, 96, 0.14)',
                  backdropFilter: 'blur(10px)'
                }}>
                  {/* Watermark */}
                  <div aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, width: 150, height: 150, opacity: 0.06, backgroundImage: `url(${markUrl})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'top right', backgroundSize: 'contain', pointerEvents: 'none', zIndex: 1 }} />
                  
                  {/* Rich Text Formatting Toolbar */}
                  <div style={{ 
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                      position: 'relative',
                      zIndex: 2
                    }}>
                      <FormattingToolbar
                        isDarkMode={isDarkMode}
                        onFormatChange={handleFormatCommand}
                        editorRef={bodyEditorRef}
                        style={{
                          border: 'none',
                          borderRadius: '12px 12px 0 0',
                          backgroundColor: 'transparent'
                        }}
                      />
                    </div>
                  
                  <div style={{ padding: '10px' }}>
                    <InlineEditableArea
                      value={body}
                      onChange={(v) => setBody(v)}
                      edited={false}
                      minHeight={140}
                      externalHighlights={undefined}
                      allReplacedRanges={allBodyReplacedRanges}
                      passcode={passcode}
                      enquiry={enquiry}
                      isDarkMode={isDarkMode}
                      richTextMode={richTextMode}
                      bodyEditorRef={bodyEditorRef}
                      handleFormatCommand={handleFormatCommand}
                    />
                  </div>
                </div>
              )}

              {showInlinePreview && (
                <div className="smooth-appear" style={{
                marginTop: 12,
                border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(148, 163, 184, 0.22)'}`,
                borderRadius: '12px',
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.88) 100%)'
                  : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: isDarkMode ? '0 12px 28px rgba(4, 9, 20, 0.6)' : '0 8px 20px rgba(13, 47, 96, 0.14)',
                backdropFilter: 'blur(10px)'
              }}>
                {/* Watermark */}
                <div aria-hidden="true" style={{ position: 'absolute', top: 10, right: 10, width: 160, height: 160, opacity: isDarkMode ? 0.08 : 0.08, backgroundImage: `url(${markUrl})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'top right', backgroundSize: 'contain', pointerEvents: 'none' }} />
                <div style={{
                  padding: '12px 16px',
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(11, 30, 55, 0.92) 0%, rgba(15, 38, 68, 0.85) 100%)'
                    : 'linear-gradient(135deg, rgba(240, 249, 255, 0.85) 0%, rgba(219, 234, 254, 0.8) 100%)',
                  borderBottom: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backdropFilter: 'blur(8px)'
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? '#E0F2FE' : '#0F172A', letterSpacing: 0.6, textTransform: 'uppercase' }}>Inline Preview</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: isDarkMode ? 'rgba(224, 242, 254, 0.7)' : colours.blue }}>{subject || 'Your Enquiry - Helix Law'}</span>
                </div>
                <div 
                  ref={previewRef} 
                  className={`email-preview ${isDarkMode ? 'dark-mode' : 'light-mode'}`}
                  style={{ 
                    padding: '18px 20px',
                    background: isDarkMode
                      ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.92) 0%, rgba(11, 30, 55, 0.86) 100%)'
                      : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)',
                    color: isDarkMode ? '#E0F2FE' : '#1F2937',
                    lineHeight: 1.6,
                    fontSize: '14px',
                    borderRadius: '0 0 12px 12px',
                    border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.3)' : 'rgba(148, 163, 184, 0.22)'}`,
                    borderTop: 'none',
                    boxShadow: isDarkMode 
                      ? '0 8px 16px rgba(4, 9, 20, 0.5)' 
                      : '0 4px 12px rgba(13, 47, 96, 0.1)',
                    backdropFilter: 'blur(8px)',
                    // Ensure proper text selection visibility
                    WebkitUserSelect: 'text',
                    userSelect: 'text'
                  }}>
                  {(() => {
                    // Build preview HTML with substitutions and signature
                    const withoutAutoBlocks = stripDashDividers(body || '');
                    const userDataLocal = (typeof userData !== 'undefined') ? userData : undefined;
                    const enquiryLocal = (typeof enquiry !== 'undefined') ? enquiry : undefined;
                    const sanitized = withoutAutoBlocks.replace(/\r\n/g, '\n').replace(/\n/g, '<br />');
                    // Use passcode in preview URL if available
                    const substituted = applyDynamicSubstitutions(
                      sanitized,
                      userDataLocal,
                      enquiryLocal,
                      amount,
                      passcode || undefined,
                      undefined // Let applyDynamicSubstitutions construct URL with passcode
                    );
                    const unresolvedBody = findPlaceholders(substituted);
                    const finalBody = convertDoubleBreaksToParagraphs(substituted);
                    const finalHighlighted = highlightPlaceholdersHtml(finalBody);
                    // Normalize any Instruct Helix Law anchors to use the project's highlight colour but preserve original href
                    const styledFinalHighlighted = finalHighlighted.replace(/<a\s+href="([^"]+)"[^>]*>\s*Instruct\s+Helix\s+Law\s*<\/a>/gi, (m, href) => {
                      const safe = escapeHtml(href);
                      return `<a href="${safe}" style="color:${colours.highlight};font-weight:700;text-decoration:underline">Instruct Helix Law</a>`;
                    });
                    return (
                      <>
                        {unresolvedBody.length > 0 && (
                          <div style={{
                            background: isDarkMode
                              ? 'linear-gradient(135deg, rgba(185, 28, 28, 0.2) 0%, rgba(153, 27, 27, 0.15) 100%)'
                              : 'linear-gradient(135deg, #fff1f0 0%, #fef2f2 100%)',
                            border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.4)' : '#ffa39e'}`,
                            color: isDarkMode ? '#FCA5A5' : '#a8071a',
                            fontSize: 12,
                            padding: '10px 12px',
                            borderRadius: 8,
                            marginBottom: 10,
                            boxShadow: isDarkMode 
                              ? '0 4px 12px rgba(185, 28, 28, 0.25)' 
                              : '0 2px 8px rgba(168, 7, 26, 0.15)',
                            backdropFilter: 'blur(6px)',
                            fontWeight: 500
                          }}>
                            <FaExclamationTriangle style={{ fontSize: 12, color: isDarkMode ? '#FCA5A5' : '#a8071a', marginRight: 6 }} />
                            {unresolvedBody.length} placeholder{unresolvedBody.length === 1 ? '' : 's'} to resolve: {unresolvedBody.join(', ')}
                          </div>
                        )}
                        {(() => {
                          // Determine if we should use experimental V2 layout (same logic as EmailPreview)
                          const isV2Env = process.env.REACT_APP_EMAIL_V2_ENABLED === 'true';
                          const useV2Layout = (window as any)?.__helixEmailProcessingV2__ === true || isV2Env;
                          return <EmailSignature bodyHtml={styledFinalHighlighted} userData={userDataLocal} experimentalLayout={useV2Layout} />;
                        })()}
                      </>
                    );
                  })()}
                </div>
                <div style={{
                  padding: '12px 16px',
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(11, 30, 55, 0.92) 0%, rgba(15, 38, 68, 0.85) 100%)'
                    : 'linear-gradient(135deg, rgba(240, 249, 255, 0.85) 0%, rgba(219, 234, 254, 0.8) 100%)',
                  borderTop: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  backdropFilter: 'blur(8px)'
                }}>
                  <div style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    padding: '12px 16px',
                    background: confirmReady 
                      ? (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)') 
                      : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)'),
                    border: confirmReady 
                      ? `2px solid ${isDarkMode ? '#22c55e' : '#16a34a'}` 
                      : `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: confirmReady ? 'translateY(-1px)' : 'none',
                    boxShadow: confirmReady 
                      ? (isDarkMode ? '0 4px 16px rgba(34, 197, 94, 0.3)' : '0 4px 16px rgba(34, 197, 94, 0.2)') 
                      : 'none'
                  }}
                  onClick={() => setConfirmReady(!confirmReady)}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      background: confirmReady 
                        ? (isDarkMode ? '#22c55e' : '#16a34a') 
                        : 'transparent',
                      border: confirmReady 
                        ? 'none' 
                        : `2px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.3)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}>
                      {confirmReady && (
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path 
                            d="M1 4L5 8L11 1" 
                            stroke="white" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span style={{ 
                      fontSize: '14px', 
                      color: isDarkMode ? '#E2E8F0' : '#334155', 
                      fontWeight: 600,
                      userSelect: 'none'
                    }}>
                      Everything looks good, ready to proceed
                    </span>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, position: 'relative' }}>
                    {(() => {
                      // Determine unresolved placeholders across subject and body after substitution
                      const userDataLocal = (typeof userData !== 'undefined') ? userData : undefined;
                      const enquiryLocal = (typeof enquiry !== 'undefined') ? enquiry : undefined;
                      // Subject is independent; treat it directly
                      const unresolvedSubject = findPlaceholders(subject || '');
                      const sanitized = stripDashDividers(body || '').replace(/\r\n/g, '\n').replace(/\n/g, '<br />');
                      const effective = passcode || undefined; // no fallback
                      const checkoutPreviewUrl = 'https://instruct.helix-law.com/pitch';
                      const substitutedBody = applyDynamicSubstitutions(sanitized, userDataLocal, enquiryLocal, amount, effective, checkoutPreviewUrl);
                      const unresolvedBody = findPlaceholders(substitutedBody);
                      const unresolvedAny = unresolvedSubject.length > 0 || unresolvedBody.length > 0;
                      const disableDraft = !confirmReady || isDraftConfirmed || unresolvedAny;
                      const draftVisualConfirmed = isDraftConfirmed && !hasSentEmail;
                      const missingServiceSummary = !scopeDescription || !String(scopeDescription).trim();
                      const requireServiceSummary = !isBeforeCallCall; // not required for Before call — Call
                      const disableSend = unresolvedAny || (requireServiceSummary && missingServiceSummary);
                      const sendBtnTitle = unresolvedAny
                        ? 'Resolve placeholders before sending'
                        : ((requireServiceSummary && missingServiceSummary) ? 'Service summary is required' : 'Send Email');
                      return (
                        <>
                          <button
                            onClick={() => {
                              // Always route through processing selector to keep behavior consistent
                              setProcessingDialogAction('send');
                              setShowEmailProcessingDialog(true);
                            }}
                            disabled={disableSend}
                            title={sendBtnTitle}
                            style={{
                              padding: '12px 20px', 
                              borderRadius: '10px', 
                              border: 'none', 
                              cursor: disableSend ? 'not-allowed' : 'pointer',
                              background: disableSend 
                                ? (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)') 
                                : `linear-gradient(135deg, ${colours.cta}, #e74c3c)`,
                              color: '#ffffff', 
                              fontWeight: 700, 
                              fontSize: '14px',
                              opacity: disableSend ? 0.6 : 1,
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              transform: disableSend ? 'none' : 'translateY(0px)',
                              boxShadow: disableSend 
                                ? 'none' 
                                : `0 4px 20px rgba(214, 85, 65, 0.4)`,
                              letterSpacing: '0.02em',
                              textTransform: 'uppercase',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                              if (disableSend) {
                                setShowSendValidation(true);
                              } else {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = `0 8px 30px rgba(214, 85, 65, 0.6)`;
                                e.currentTarget.style.background = `linear-gradient(135deg, #c54a3d, #d63031)`;
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (disableSend) {
                                setShowSendValidation(false);
                              } else {
                                e.currentTarget.style.transform = 'translateY(0px)';
                                e.currentTarget.style.boxShadow = `0 4px 20px rgba(214, 85, 65, 0.4)`;
                                e.currentTarget.style.background = `linear-gradient(135deg, ${colours.cta}, #e74c3c)`;
                              }
                            }}
                          >
                            <FaPaperPlane style={{ marginRight: 6 }} /> Send Email...
                          </button>
                          <button
                            onClick={() => {
                              // Open processing selection for draft as well (dev shows choice, prod auto-selects V1)
                              setProcessingDialogAction('draft');
                              setShowEmailProcessingDialog(true);
                            }}
                            disabled={disableDraft}
                            style={{
                              padding: '8px 16px', 
                              borderRadius: 6, 
                              border: `1px solid ${draftVisualConfirmed ? colours.green : (isDarkMode ? '#475569' : '#D1D5DB')}`,
                              background: draftVisualConfirmed
                                ? 'rgba(34, 197, 94, 0.1)'
                                : (isDarkMode ? '#374151' : '#F9FAFB'), 
                              color: draftVisualConfirmed ? colours.green : (isDarkMode ? '#E5E7EB' : '#374151'), 
                              fontWeight: 600,
                              cursor: disableDraft ? 'not-allowed' : 'pointer',
                              transition: 'background-color 0.2s ease',
                              opacity: disableDraft ? 0.6 : 1
                            }}
                            onMouseEnter={(e) => {
                              if (!disableDraft && !draftVisualConfirmed) {
                                e.currentTarget.style.background = isDarkMode ? '#4B5563' : '#E5E7EB';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!disableDraft && !draftVisualConfirmed) {
                                e.currentTarget.style.background = isDarkMode ? '#374151' : '#F9FAFB';
                              }
                            }}
                            title={draftVisualConfirmed ? 'Drafted' : (unresolvedAny ? 'Resolve placeholders before drafting' : 'Draft Email')}
                          >
                            {draftVisualConfirmed ? <FaCheck style={{ marginRight: 4 }} /> : <FaEnvelope style={{ marginRight: 4 }} />} {draftVisualConfirmed ? 'Drafted' : 'Draft Email'}
                          </button>
                          
                          {/* Validation feedback for disabled send button - shows on hover */}
                          {disableSend && showSendValidation && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              marginTop: 8,
                              background: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(254, 242, 242, 0.9)',
                              border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                              borderRadius: 6,
                              padding: '10px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              whiteSpace: 'nowrap',
                              zIndex: 1000,
                              boxShadow: isDarkMode 
                                ? '0 4px 12px rgba(0, 0, 0, 0.4)' 
                                : '0 4px 12px rgba(0, 0, 0, 0.1)',
                              opacity: 1,
                              animation: 'fadeIn 0.15s ease-out'
                            }}>
                              <div style={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: isDarkMode ? '#EF4444' : '#DC2626',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: 10,
                                fontWeight: 700,
                                flexShrink: 0
                              }}>!</div>
                              <div style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: isDarkMode ? '#FEE2E2' : '#991B1B'
                              }}>
                                {unresolvedAny 
                                  ? 'Please resolve all highlighted placeholders before sending the email.'
                                  : 'Scope of Work missing.'
                                }
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <button
                      onClick={() => {
                        if (!previewRef.current) return;
                        const text = previewRef.current.innerText || '';
                        navigator.clipboard.writeText(text);
                        setCopiedFooter(true);
                        setTimeout(() => setCopiedFooter(false), 1200);
                      }}
                      style={{ 
                        padding: '6px 12px', 
                        borderRadius: 8, 
                        border: copiedFooter ? '1px solid #16a34a' : `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.45)' : 'rgba(54, 144, 206, 0.45)'}`, 
                        background: copiedFooter
                          ? (isDarkMode ? 'linear-gradient(135deg, rgba(22, 101, 52, 0.35) 0%, rgba(21, 128, 61, 0.25) 100%)' : 'linear-gradient(135deg, #e8f5e8 0%, #dcfce7 100%)')
                          : (isDarkMode
                            ? 'linear-gradient(135deg, rgba(11, 22, 43, 0.88) 0%, rgba(13, 30, 56, 0.82) 100%)'
                            : 'linear-gradient(135deg, rgba(54, 144, 206, 0.18) 0%, rgba(96, 165, 250, 0.24) 100%)'), 
                        color: copiedFooter ? '#166534' : (isDarkMode ? '#E0F2FE' : '#0F172A'), 
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        transform: 'translateY(0)'
                      }}
                      onMouseEnter={(e) => {
                        if (!copiedFooter) {
                          e.currentTarget.style.borderColor = isDarkMode ? '#60A5FA' : '#3690CE';
                          e.currentTarget.style.background = isDarkMode
                            ? 'linear-gradient(135deg, rgba(13, 28, 56, 0.92) 0%, rgba(17, 36, 64, 0.88) 100%)'
                            : 'linear-gradient(135deg, rgba(54, 144, 206, 0.26) 0%, rgba(96, 165, 250, 0.32) 100%)';
                          e.currentTarget.style.color = isDarkMode ? '#F8FAFC' : '#0F172A';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 8px 18px rgba(54, 144, 206, 0.22)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!copiedFooter) {
                          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(96, 165, 250, 0.45)' : 'rgba(54, 144, 206, 0.45)';
                          e.currentTarget.style.background = isDarkMode
                            ? 'linear-gradient(135deg, rgba(11, 22, 43, 0.88) 0%, rgba(13, 30, 56, 0.82) 100%)'
                            : 'linear-gradient(135deg, rgba(54, 144, 206, 0.18) 0%, rgba(96, 165, 250, 0.24) 100%)';
                          e.currentTarget.style.color = isDarkMode ? '#E0F2FE' : '#0F172A';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!copiedFooter) {
                          e.currentTarget.style.transform = 'translateY(1px)';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(54, 144, 206, 0.1)';
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!copiedFooter) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(54, 144, 206, 0.15)';
                        }
                      }}
                    >
                      {copiedFooter ? (
                        <>
                          <FaCheck style={{ marginRight: 4 }} /> Copied
                        </>
                      ) : (
                        <>
                          <FaCopy style={{ marginRight: 4 }} /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              )}

              {/* Close Email body / Preview container */}
            </div>

            {/* Context Notes - Supporting Information */}
            {initialNotes && !isNotesPinned && (
              <div style={{
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
                  : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.94) 100%)',
                borderRadius: '16px',
                padding: '24px',
                border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
                boxShadow: isDarkMode 
                  ? '0 18px 32px rgba(2, 6, 17, 0.58)' 
                  : '0 12px 28px rgba(13, 47, 96, 0.12)',
                marginBottom: '20px',
                transition: 'all 0.3s ease-in-out',
                position: 'relative',
                fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                backdropFilter: 'blur(12px)',
                animation: 'cascadeIn 0.4s ease-out'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isDarkMode ? '#E0F2FE' : '#0F172A',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative',
                  padding: '12px 18px',
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.92) 0%, rgba(11, 30, 55, 0.86) 100%)'
                    : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)',
                  borderRadius: '12px',
                  border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.3)' : 'rgba(148, 163, 184, 0.22)'}`,
                  boxShadow: isDarkMode 
                    ? '0 10px 22px rgba(4, 9, 20, 0.55)' 
                    : '0 6px 16px rgba(13, 47, 96, 0.12)',
                  backdropFilter: 'blur(8px)'
                }}>
                  <span
                    onMouseEnter={() => setShowSubjectHint(true)}
                    onMouseLeave={() => setShowSubjectHint(false)}
                    style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{
                      padding: '8px',
                      background: isDarkMode 
                        ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.24) 0%, rgba(59, 130, 246, 0.18) 100%)'
                        : 'linear-gradient(135deg, rgba(54, 144, 206, 0.16) 0%, rgba(96, 165, 250, 0.18) 100%)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : 'rgba(54, 144, 206, 0.3)'}`
                    }}>
                      <FaInfoCircle style={{ fontSize: 14, color: isDarkMode ? '#60A5FA' : '#3690CE' }} />
                    </div>
                  </span>
                  Enquiry Notes
                  {showSubjectHint && (
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      top: '100%',
                      marginTop: 8,
                      background: isDarkMode ? colours.dark.cardBackground : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      color: isDarkMode ? colours.dark.text : '#1E293B',
                      fontSize: '11px',
                      fontWeight: 400,
                      fontStyle: 'italic',
                      border: `1px solid ${isDarkMode ? colours.dark.border : '#CBD5E1'}`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                      zIndex: 10,
                      whiteSpace: 'normal',
                      maxWidth: 420,
                      boxShadow: isDarkMode ? '0 6px 10px rgba(0,0,0,0.6)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                    }}>
                      Source confirmation: these notes may be intake rep call notes, a web form message, or an auto‑parsed email.
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: isDarkMode ? '#E0F2FE' : '#1F2937',
                  whiteSpace: 'pre-wrap',
                  background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.92) 0%, rgba(11, 30, 55, 0.86) 100%)'
                    : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)',
                  padding: '18px',
                  borderRadius: '12px',
                  border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.3)' : 'rgba(148, 163, 184, 0.22)'}`,
                  position: 'relative',
                  fontFamily: 'inherit',
                  boxShadow: isDarkMode 
                    ? '0 10px 22px rgba(4, 9, 20, 0.55)' 
                    : '0 6px 16px rgba(13, 47, 96, 0.12)',
                  backdropFilter: 'blur(8px)'
                }}>
                  {/* Floating pin inside notes box */}
                  <button
                    onClick={() => setIsNotesPinned(true)}
                    title="Pin notes"
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isDarkMode ? colours.dark.cardBackground : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: `1px solid ${isDarkMode ? colours.dark.border : '#CBD5E1'}`,
                      color: isDarkMode ? colours.dark.text : '#1E293B',
                      boxShadow: isDarkMode ? '0 2px 6px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      zIndex: 2,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? colours.blue : '#3690CE';
                      e.currentTarget.style.background = isDarkMode ? colours.dark.inputBackground : 'linear-gradient(135deg, #EBF8FF 0%, #DBEAFE 100%)';
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = isDarkMode ? '0 4px 8px rgba(0,0,0,0.5)' : '0 4px 8px rgba(54, 144, 206, 0.25)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : '#CBD5E1';
                      e.currentTarget.style.background = isDarkMode ? colours.dark.cardBackground : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = isDarkMode ? '0 2px 6px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                  >
                    {/* Use a known glyph and strong contrast to ensure visibility */}
                    <FaThumbtack style={{ fontSize: 16, color: '#3690CE' }} />
                  </button>
                  {initialNotes}
                </div>
              </div>
            )}

            {!isBeforeCallCall && (
              <DealCapture
                isDarkMode={isDarkMode}
                scopeDescription={scopeDescription}
                onScopeChange={(v) => { setScopeDescription(v); onScopeDescriptionChange?.(v); }}
                amount={amountValue}
                onAmountChange={(v) => { setAmountValue(v); onAmountChange?.(v); }}
                amountError={amountError}
              />
            )}

          {/* Template blocks removed in simplified flow */}
          </div>
        )}
        </div>
      </Stack>
      </div>

      {/* Additional styling for hover reveals and list styling */}
      <style>{`
        .inline-reveal-btn {display:inline-flex;align-items:center;gap:0;overflow:hidden;position:relative;}
        .inline-reveal-btn .label{max-width:0;opacity:0;transform:translateX(-4px);margin-left:0;white-space:nowrap;transition:max-width .45s ease,opacity .45s ease,transform .45s ease,margin-left .45s ease;}
        .inline-reveal-btn:hover .label,.inline-reveal-btn:focus-visible .label{max-width:90px;opacity:1;transform:translateX(0);margin-left:6px;}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cascadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .smooth-appear{animation:fadeSlideIn .18s ease}
        
        /* Preview text selection styling for dark mode */
        [data-theme="dark"] ::selection {
          background-color: rgba(96, 165, 250, 0.3);
          color: #E0F2FE;
        }
        [data-theme="light"] ::selection {
          background-color: rgba(54, 144, 206, 0.2);
          color: #0F172A;
        }
        
        /* Force proper text colors in preview mode (excluding signature) */
        .email-preview.dark-mode p,
        .email-preview.dark-mode div:not([class*="signature"]) {
          color: #E0F2FE !important;
        }
        .email-preview.light-mode p,
        .email-preview.light-mode div:not([class*="signature"]) {
          color: #1F2937 !important;
        }
        
        /* Ensure links remain visible and accessible */
        .email-preview.dark-mode a {
          color: #60A5FA !important;
          text-decoration: underline !important;
        }
        .email-preview.light-mode a {
          color: #3690CE !important;
          text-decoration: underline !important;
        }
        
        /* Improve text selection visibility in preview */
        .email-preview.dark-mode ::selection {
          background-color: rgba(96, 165, 250, 0.4) !important;
          color: #FFFFFF !important;
        }
        .email-preview.light-mode ::selection {
          background-color: rgba(54, 144, 206, 0.3) !important;
          color: #000000 !important;
        }
        
        /* Modern placeholder styling for email preview */
        .email-preview .insert-placeholder,
        .email-preview span[data-insert],
        .email-preview span[data-original*="INSERT"] {
          background: linear-gradient(135deg, ${colours.highlight}08, ${colours.highlight}15) !important;
          color: ${colours.highlight} !important;
          padding: 2px 8px !important;
          border-radius: 6px !important;
          border: 1px solid ${colours.highlight}40 !important;
          font-style: normal !important;
          font-weight: 600 !important;
          font-size: 0.9em !important;
          letter-spacing: 0.025em !important;
          cursor: default !important;
          display: inline-block !important;
          max-width: 100% !important;
          word-wrap: break-word !important;
          white-space: normal !important;
          box-shadow: 0 1px 3px ${colours.highlight}15, 0 1px 2px ${colours.highlight}10 !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .email-preview.dark-mode .insert-placeholder,
        .email-preview.dark-mode span[data-insert],
        .email-preview.dark-mode span[data-original*="INSERT"] {
          background: linear-gradient(135deg, ${colours.highlight}12, ${colours.highlight}20) !important;
          border-color: ${colours.highlight}50 !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 2px ${colours.highlight}15 !important;
        }
        
        .email-preview.light-mode .insert-placeholder,
        .email-preview.light-mode span[data-insert],
        .email-preview.light-mode span[data-original*="INSERT"] {
          background: linear-gradient(135deg, ${colours.highlight}08, ${colours.highlight}12) !important;
          border-color: ${colours.highlight}35 !important;
          box-shadow: 0 1px 3px ${colours.highlight}12, 0 1px 2px rgba(0, 0, 0, 0.05) !important;
        }
        
        /* Override any inline styles on placeholders in preview */
        .email-preview span[style*="background"]:is([data-insert], [data-original*="INSERT"], .insert-placeholder),
        .email-preview span[style*="color"]:is([data-insert], [data-original*="INSERT"], .insert-placeholder),
        .email-preview span[style*="background-color"][data-placeholder],
        .email-preview span[data-placeholder*="INSERT"],
        .email-preview span[contenteditable="true"],
        .email-preview span[contenteditable="false"],
        .email-preview .placeholder-edited {
          background: linear-gradient(135deg, ${colours.highlight}08, ${colours.highlight}15) !important;
          color: ${colours.highlight} !important;
          padding: 2px 8px !important;
          border-radius: 6px !important;
          border: 1px solid ${colours.highlight}40 !important;
          font-style: normal !important;
          font-weight: 600 !important;
          font-size: 0.9em !important;
          letter-spacing: 0.025em !important;
          cursor: default !important;
          display: inline-block !important;
          max-width: 100% !important;
          word-wrap: break-word !important;
          white-space: normal !important;
          box-shadow: 0 1px 3px ${colours.highlight}15, 0 1px 2px ${colours.highlight}10 !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        /* Remove interactive attributes from preview placeholders */
        .email-preview span[contenteditable="true"],
        .email-preview span[contenteditable="false"],
        .email-preview span[tabindex],
        .email-preview span[role="button"] {
          cursor: default !important;
          user-select: none !important;
          pointer-events: none !important;
        }

        /* Unresolved placeholders: draw attention with CTA red only */
        .email-preview .placeholder-unresolved {
          color: ${colours.cta} !important;
          font-weight: 700 !important;
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        
        /* Numbered list styling with CTA red numbers */
        ol:not(.hlx-numlist) {
          counter-reset: list-counter;
          list-style: none;
          padding-left: 0;
          margin: 16px 0;
        }
        ol:not(.hlx-numlist) li {
          counter-increment: list-counter;
          position: relative;
          padding-left: 2em;
          margin-bottom: 12px;
          line-height: 1.6;
        }
        ol:not(.hlx-numlist) li::before {
          content: counter(list-counter) ".";
          position: absolute;
          left: 0;
          top: 0;
          color: #D65541;
          font-weight: 700;
          margin: 0;
        }
        ol.hlx-numlist { list-style: none; padding-left: 0; margin: 16px 0; }
        ol.hlx-numlist li { margin: 0 0 12px 0; line-height: 1.6; position: relative; }
        ol.hlx-numlist li::before { content: none !important; }
        ol.hlx-numlist > li > span:first-child { color: #D65541; font-weight: 700; display: inline-block; min-width: 1.6em; }
        
        /* Placeholder highlighting styles */
        .insert-placeholder {
          background: ${colours.highlightBlue}20;
          color: ${isDarkMode ? '#E5E7EB' : colours.darkBlue};
          padding: 1px 3px;
          border-radius: 3px;
          border: 1px dotted ${isDarkMode ? '#93C5FD' : colours.darkBlue + '60'};
          font-style: italic;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-block;
          max-width: 100%;
          word-wrap: break-word;
          white-space: normal;
          font-size: 0.9em;
          opacity: ${isDarkMode ? 0.95 : 0.85};
        }
        .insert-placeholder:hover,
        .insert-placeholder:focus {
          background: ${isDarkMode ? '#1E3A8A' : colours.blue + '40'};
          color: ${isDarkMode ? '#F8FAFC' : colours.darkBlue};
          border-color: ${isDarkMode ? '#60A5FA' : colours.blue};
          box-shadow: 0 0 0 2px ${isDarkMode ? 'rgba(96, 165, 250, 0.35)' : colours.blue + '30'};
          transform: translateY(-1px);
          outline: none;
          opacity: 1;
        }
        
        /* Edited placeholder styles - green highlight for user feedback */
        .placeholder-edited {
          background: ${isDarkMode ? 'rgba(16, 185, 129, 0.18)' : 'rgba(34, 197, 94, 0.1)'} !important;
          color: ${isDarkMode ? '#D1FAE5' : '#059669'} !important;
          border: 1px solid ${isDarkMode ? 'rgba(16, 185, 129, 0.35)' : 'rgba(34, 197, 94, 0.3)'} !important;
          font-style: normal !important;
          cursor: text !important;
          opacity: 1 !important;
          transform: none !important;
        }
        .placeholder-edited:hover,
        .placeholder-edited:focus {
          background: rgba(34, 197, 94, 0.15) !important;
          border-color: rgba(34, 197, 94, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2) !important;
        }

        /* Active editing wrapper */
        .placeholder-editing {
          background: ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.1)'} !important;
          border: 1px dashed ${isDarkMode ? 'rgba(96, 165, 250, 0.6)' : colours.blue} !important;
          border-radius: 4px !important;
          padding: 1px 2px !important;
        }
        
        /* Link styles for rich text editor */
        .rich-text-editor a {
          color: ${colours.blue};
          text-decoration: underline;
          cursor: pointer;
        }
        .rich-text-editor a:hover {
          color: ${colours.darkBlue};
          text-decoration: none;
        }
        
        /* Instruct Helix Law link styling */
        .rich-text-editor .instruct-link {
          color: ${colours.highlight} !important;
          font-weight: 700 !important;
          text-decoration: underline !important;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .rich-text-editor .instruct-link:hover {
          color: ${colours.darkBlue} !important;
          text-decoration: none !important;
          transform: translateY(-1px);
        }
        
        /* Pending link style (when passcode not available yet) */
        .rich-text-editor .instruct-link-pending {
          color: ${colours.highlight} !important;
          font-weight: 700 !important;
          text-decoration: underline !important;
          opacity: 0.7 !important;
          cursor: help !important;
          font-style: italic;
        }
        .rich-text-editor .instruct-link-pending:hover {
          opacity: 1 !important;
        }
        .rich-text-editor .instruct-link-pending::after {
          content: " (pending passcode)";
          font-size: 0.85em;
          opacity: 0.8;
          font-weight: 400;
        }
      `}</style>

      {/* Email Processing Method Selection Dialog - Development Only */}
      {showEmailProcessingDialog && (
        <EmailProcessingConfirmDialog
          isOpen={showEmailProcessingDialog}
          onConfirm={(useV2: boolean) => {
            // Persist choice and close selector
            setSelectedEmailMethod(useV2 ? 'v2' : 'v1');
            setShowEmailProcessingDialog(false);
            const action = processingDialogAction || 'send';
            if (action === 'send') {
              // Proceed to the normal send confirmation modal
              setShowSendConfirmModal(true);
            } else {
              // Draft flow: set processing flag, run draft, then clean up
              try {
                (window as any).__helixEmailProcessingV2__ = !!useV2;
                void (async () => {
                  try {
                    await handleDraftEmail?.();
                  } finally {
                    delete (window as any).__helixEmailProcessingV2__;
                    setSelectedEmailMethod(null);
                  }
                })();
              } finally {
                // Ensure we clear the action state so future opens default correctly
                setProcessingDialogAction(null);
              }
            }
          }}
          onClose={() => setShowEmailProcessingDialog(false)}
          action={processingDialogAction || 'send'}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Email Send Confirmation Modal */}
      {showSendConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: isDarkMode 
              ? '#1E293B'
              : '#FFFFFF',
            padding: '0',
            borderRadius: '8px',
            maxWidth: '580px',
            width: '92%',
            maxHeight: '85vh',
            overflow: 'hidden',
            boxShadow: isDarkMode 
              ? '0 10px 25px rgba(0, 0, 0, 0.5)' 
              : '0 10px 25px rgba(0, 0, 0, 0.15)',
            border: isDarkMode 
              ? '1px solid rgba(148, 163, 184, 0.2)' 
              : '1px solid rgba(226, 232, 240, 0.8)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Enhanced Header with Icon */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '24px',
              paddingBottom: '20px',
              padding: '32px 32px 20px 32px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                background: isDarkMode 
                  ? 'rgba(71, 85, 105, 0.3)'
                  : 'rgba(241, 245, 249, 0.8)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(203, 213, 225, 0.6)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isDarkMode 
                  ? '0 4px 8px rgba(0, 0, 0, 0.2)' 
                  : '0 2px 6px rgba(0, 0, 0, 0.08)'
              }}>
                <FaPaperPlane style={{ 
                  fontSize: '20px', 
                  color: colours.blue
                }} />
              </div>
              <div>
                <h3 style={{
                  margin: '0 0 4px 0',
                  color: isDarkMode ? '#E0F2FE' : '#0F172A',
                  fontSize: '24px',
                  fontWeight: '700',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.2'
                }}>
                  Review & Send Email
                </h3>
                <p style={{
                  margin: 0,
                  color: isDarkMode ? 'rgba(224, 242, 254, 0.7)' : '#64748B',
                  fontSize: '14px',
                  fontWeight: '500',
                  letterSpacing: '-0.005em'
                }}>
                  Please review the details before sending
                </p>
              </div>
            </div>
            
            {/* Scrollable Content Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0 32px',
              maxHeight: 'calc(85vh - 160px)' // Leave space for header and buttons
            }}>
            
            {/* Recipients Section - Enhanced Design */}
            <div style={{ 
              marginBottom: '24px',
              padding: '20px',
              background: isDarkMode 
                ? 'rgba(30, 41, 59, 0.4)' 
                : 'rgba(248, 250, 252, 0.6)',
              border: isDarkMode 
                ? '1px solid rgba(148, 163, 184, 0.2)' 
                : '1px solid rgba(226, 232, 240, 0.7)',
              borderRadius: '8px',
              backdropFilter: 'blur(4px)',
              boxShadow: isDarkMode 
                ? '0 4px 8px rgba(0, 0, 0, 0.15)' 
                : '0 2px 6px rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '18px'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: isDarkMode 
                    ? 'rgba(71, 85, 105, 0.4)'
                    : 'rgba(241, 245, 249, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(203, 213, 225, 0.6)'}`
                }}>
                  <FaUsers style={{ 
                    fontSize: '14px', 
                    color: colours.blue
                  }} />
                </div>
                <h4 style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '650',
                  color: isDarkMode ? '#E0F2FE' : '#0F172A',
                  letterSpacing: '-0.01em'
                }}>
                  Email Recipients
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Sender (From) field */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '10px 0',
                  borderBottom: isDarkMode 
                    ? '1px solid rgba(71, 85, 105, 0.4)' 
                    : '1px solid rgba(226, 232, 240, 0.5)'
                }}>
                  <span style={{ 
                    fontWeight: '650', 
                    color: isDarkMode ? '#94A3B8' : '#64748B',
                    fontSize: '13px',
                    minWidth: '55px',
                    letterSpacing: '0.025em',
                    textTransform: 'uppercase'
                  }}>From:</span>
                  <span style={{ 
                    color: isDarkMode ? '#CBD5E1' : '#334155',
                    fontSize: '14px',
                    fontWeight: '500',
                    flex: 1,
                    lineHeight: '1.4'
                  }}>
                    {userData?.[0]?.['Full Name'] || [userData?.[0]?.First, userData?.[0]?.Last].filter(Boolean).join(' ') || 'Fee Earner'} ({userData?.[0]?.Email || userData?.[0]?.WorkEmail || userData?.[0]?.Mail || userData?.[0]?.UserPrincipalName || userData?.[0]?.['Email Address'] || (userData?.[0]?.Initials ? `${userData[0].Initials.toLowerCase()}@helix-law.com` : 'automations@helix-law.com')})
                  </span>
                </div>
                
                {/* Recipients - Editable To field */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '10px 0',
                  borderBottom: isDarkMode 
                    ? '1px solid rgba(71, 85, 105, 0.4)' 
                    : '1px solid rgba(226, 232, 240, 0.5)'
                }}>
                  <span style={{ 
                    fontWeight: '650', 
                    color: isDarkMode ? '#94A3B8' : '#64748B',
                    fontSize: '13px',
                    minWidth: '55px',
                    letterSpacing: '0.025em',
                    textTransform: 'uppercase',
                    paddingTop: '8px'
                  }}>To:</span>
                  <input
                    type="text"
                    value={editableTo}
                    onChange={(e) => setEditableTo(e.target.value)}
                    placeholder="Enter recipient email addresses..."
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(226, 232, 240, 0.6)'}`,
                      borderRadius: '6px',
                      background: isDarkMode ? '#374151' : '#FFFFFF',
                      color: isDarkMode ? '#F3F4F6' : '#1F2937',
                      fontSize: '14px',
                      fontWeight: '400',
                      lineHeight: '1.4',
                      outline: 'none',
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = colours.blue;
                      e.target.style.boxShadow = isDarkMode 
                        ? `0 0 0 1px rgba(54, 144, 206, 0.3)` 
                        : `0 0 0 1px rgba(54, 144, 206, 0.2)`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(226, 232, 240, 0.6)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
                
                {cc && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 0',
                    borderBottom: isDarkMode 
                      ? '1px solid rgba(71, 85, 105, 0.4)' 
                      : '1px solid rgba(226, 232, 240, 0.5)'
                  }}>
                    <span style={{ 
                      fontWeight: '650', 
                      color: isDarkMode ? '#94A3B8' : '#64748B',
                      fontSize: '13px',
                      minWidth: '55px',
                      letterSpacing: '0.025em',
                      textTransform: 'uppercase'
                    }}>CC:</span>
                    <span style={{ 
                      color: isDarkMode ? '#CBD5E1' : '#334155',
                      fontSize: '14px',
                      fontWeight: '500',
                      flex: 1,
                      lineHeight: '1.4'
                    }}>{cc}</span>
                  </div>
                )}
                
                {/* BCC field */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '10px 0'
                }}>
                  <span style={{ 
                    fontWeight: '650', 
                    color: isDarkMode ? '#94A3B8' : '#64748B',
                    fontSize: '13px',
                    minWidth: '55px',
                    letterSpacing: '0.025em',
                    textTransform: 'uppercase'
                  }}>BCC:</span>
                  <span style={{ 
                    color: isDarkMode ? '#CBD5E1' : '#334155',
                    fontSize: '14px',
                    fontWeight: '500',
                    flex: 1,
                    lineHeight: '1.4'
                  }}>
                    {[bcc, feeEarnerEmail].filter(Boolean).join(', ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Sent Items Confirmation - Passive Info */}
            <div style={{
              marginBottom: '20px',
              padding: '16px 18px',
              background: isDarkMode 
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(22, 163, 74, 0.06) 100%)'
                : 'linear-gradient(135deg, rgba(34, 197, 94, 0.06) 0%, rgba(22, 163, 74, 0.04) 100%)',
              border: isDarkMode 
                ? '1px solid rgba(34, 197, 94, 0.25)' 
                : '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                background: isDarkMode 
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.2) 100%)'
                  : 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.15) 100%)',
                border: `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <FaCheck style={{ 
                  fontSize: '10px', 
                  color: isDarkMode ? '#4ADE80' : '#16A34A'
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: isDarkMode ? '#4ADE80' : '#15803D',
                  marginBottom: '2px',
                  letterSpacing: '-0.005em'
                }}>
                  Email will be saved to your Sent Items
                </div>
                <div style={{
                  fontSize: '12px',
                  color: isDarkMode ? 'rgba(74, 222, 128, 0.8)' : 'rgba(21, 128, 61, 0.7)',
                  lineHeight: '1.3'
                }}>
                  A copy will automatically appear in your Outlook Sent Items folder
                </div>
              </div>
            </div>
            
            {/* Email Summary Section - Secondary (hidden for Before call — Call) */}
            {!isBeforeCallCall && (
              <div style={{
                background: isDarkMode 
                  ? colours.dark.inputBackground 
                  : 'linear-gradient(135deg, #FEFEFE 0%, #F9FAFB 100%)',
                border: `1px solid ${isDarkMode ? colours.dark.border : '#E5E7EB'}`,
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '16px'
              }}>
                <h4 style={{
                  margin: '0 0 12px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: isDarkMode ? colours.dark.text : colours.darkBlue,
                  letterSpacing: '-0.005em'
                }}>
                  Email Content Summary
                </h4>
                
                {/* Replace Subject with Service Description */}
                {scopeDescription && (
                  <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '600', color: isDarkMode ? colours.dark.text : '#6B7280' }}>Service Description:</span>
                    <div style={{ 
                      marginTop: '4px',
                      color: isDarkMode ? colours.dark.text : colours.darkBlue,
                      lineHeight: '1.4',
                      maxHeight: '60px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {scopeDescription.length > 150 ? `${scopeDescription.substring(0, 150)}...` : scopeDescription}
                    </div>
                  </div>
                )}
                
                {amountValue && (
                  <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ fontWeight: '600', color: isDarkMode ? colours.dark.text : '#6B7280' }}>Amount:</span>
                    <div style={{ 
                      marginTop: '4px',
                      color: isDarkMode ? colours.blue : colours.darkBlue,
                      fontWeight: 600
                    }}>
                      £{parseFloat(amountValue).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + VAT
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Debug/Support Info Box */}
            <div style={{
              background: isDarkMode 
                ? 'rgba(54, 144, 206, 0.1)' 
                : 'linear-gradient(135deg, rgba(54, 144, 206, 0.03) 0%, rgba(96, 165, 250, 0.08) 100%)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.15)'}`,
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '24px',
              fontSize: '13px',
              fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}>
              <h4 style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: isDarkMode ? colours.dark.text : colours.darkBlue,
                letterSpacing: '-0.005em'
              }}>
                Support BCC (auto-added)
              </h4>
              <div style={{ 
                color: isDarkMode ? colours.blue : colours.darkBlue,
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                cb@helix-law.com
              </div>
            </div>

            {/* Processing Status Section */}
            <div style={{
              background: isDarkMode ? '#374151' : '#F9FAFB',
              border: isDarkMode ? '1px solid #4B5563' : '1px solid #E5E7EB',
              borderRadius: '6px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  background: isDarkMode ? '#6B7280' : '#9CA3AF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ 
                    color: 'white'
                  }}>
                    <circle cx="12" cy="12" r="3" fill="currentColor"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" 
                          stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h4 style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '650',
                  color: isDarkMode ? '#E0F2FE' : '#0F172A',
                  letterSpacing: '-0.01em'
                }}>
                  Processing Status
                </h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Deal Creation Status */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '16px', 
                  padding: '16px 18px',
                  borderRadius: '8px',
                  background: isDarkMode ? '#374151' : '#F9FAFB',
                  border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                  transition: 'all 0.2s ease'
                }}>
                  {/* Status Icon */}
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderRadius: '4px',
                    background: isDarkMode ? '#6B7280' : '#9CA3AF'
                  }}>
                    {(dealCreationInProgress || dealStatus === 'processing') ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ 
                        color: 'white',
                        animation: 'spin 1s linear infinite'
                      }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : dealStatus === 'ready' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'white' }}>
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : dealStatus === 'error' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'white' }}>
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: isDarkMode ? colours.dark.text : '#9CA3AF' }}>
                        <circle cx="12" cy="8" r="2" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: '500', 
                      color: isDarkMode ? '#F3F4F6' : '#374151',
                      marginBottom: '4px',
                      fontSize: '14px'
                    }}>
                      {(dealCreationInProgress || dealStatus === 'processing')
                        ? 'Saving Pitch Details'
                        : (dealStatus === 'ready')
                          ? 'Pitch Saved Successfully'
                          : (dealStatus === 'error')
                            ? 'Failed to Save Pitch'
                            : 'Ready to Save'}
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      fontWeight: '400',
                      lineHeight: '1.4'
                    }}>
                      {(dealCreationInProgress || dealStatus === 'processing') ? 
                        'Creating deal record and saving pitch information...' :
                        dealStatus === 'ready' ? 
                          'Pitch details have been securely saved to your system' :
                        dealStatus === 'error' ? 
                          'There was an issue saving the pitch. Please try again.' : 
                        'Pitch will be saved before sending email'}
                    </div>
                  </div>
                </div>

                {/* Email Sending Status */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '16px', 
                  padding: '16px 18px',
                  borderRadius: '8px',
                  background: isDarkMode ? '#374151' : '#F9FAFB',
                  border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                  transition: 'all 0.2s ease'
                }}>
                  {/* Email Icon */}
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderRadius: '4px',
                    background: isDarkMode ? '#6B7280' : '#9CA3AF'
                  }}>
                    {(emailStatus === 'processing' || modalSending) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ 
                        color: 'white',
                        animation: 'spin 1s linear infinite'
                      }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : emailStatus === 'sent' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'white' }}>
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : emailStatus === 'error' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'white' }}>
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: isDarkMode ? colours.dark.text : '#9CA3AF' }}>
                        <path d="M3 8L10.89 13.26C11.2187 13.4793 11.6049 13.5963 12 13.5963C12.3951 13.5963 12.7813 13.4793 13.11 13.26L21 8M5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: '500', 
                      color: isDarkMode ? '#F3F4F6' : '#374151',
                      marginBottom: '4px',
                      fontSize: '14px'
                    }}>
                      {(emailStatus === 'processing' || modalSending) ? 'Sending Email' : 
                       emailStatus === 'sent' ? 'Email Sent Successfully' : 
                       emailStatus === 'error' ? 'Email Delivery Failed' : 
                       'Ready to Send Email'}
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      fontWeight: '400',
                      lineHeight: '1.4'
                    }}>
                      {(emailStatus === 'processing' || modalSending) ? 
                        'Delivering email via Microsoft Graph API to recipients...' : 
                       emailStatus === 'sent' ? 
                        'Email has been successfully delivered and saved to Sent Items' : 
                       emailStatus === 'error' ? 
                        'There was an issue sending the email. Please try again.' : 
                       'Email will be sent from your account when ready'}
                    </div>
                    {!!emailMessage && emailMessage !== 'Sent' && emailMessage !== 'Error' && (
                      <div style={{ 
                        fontSize: '13px', 
                        color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(107, 114, 128, 0.8)', 
                        marginTop: '6px', 
                        fontStyle: 'italic',
                        fontWeight: '500'
                      }}>
                        {emailMessage}
                      </div>
                    )}
                    {/* Enhanced Recipient Breakdown - show when processing or sent */}
                    {(emailStatus === 'processing' || emailStatus === 'sent' || modalSending) && (
                      <div style={{ marginTop: 8, padding: '8px 10px', background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.8)', borderRadius: 6, border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(203, 213, 225, 0.5)'}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#475569', marginBottom: 6 }}>Delivery Details:</div>
                        {editableTo && (
                          <div style={{ fontSize: 11, color: isDarkMode ? colours.dark.text : '#64748B', marginBottom: 3 }}>
                            <span style={{ fontWeight: 500 }}>Primary:</span> {editableTo.split(',').length > 1 ? `${editableTo.split(',').length} recipients` : editableTo.trim()}
                          </div>
                        )}
                        {cc && (
                          <div style={{ fontSize: 11, color: isDarkMode ? colours.dark.text : '#64748B', marginBottom: 3 }}>
                            <span style={{ fontWeight: 500 }}>CC:</span> {cc.split(',').length > 1 ? `${cc.split(',').length} recipients` : cc.trim()}
                          </div>
                        )}
                        {(bcc || feeEarnerEmail) && (
                          <div style={{ fontSize: 11, color: isDarkMode ? colours.dark.text : '#64748B', marginBottom: 3 }}>
                            <span style={{ fontWeight: 500 }}>BCC:</span> {[bcc, feeEarnerEmail, 'cb@helix-law.com'].filter(Boolean).join(', ').split(',').length} monitoring addresses
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Inline validation error (modal) */}
            {modalError && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #ffa39e',
                background: '#fff1f0',
                color: '#a8071a',
                fontSize: 12,
              }}>
                <FaExclamationTriangle style={{ fontSize: 12, color: '#a8071a', marginRight: 6 }} />
                {modalError}
              </div>
            )}
            
            </div> {/* End Scrollable Content Area */}
            
            {/* Enhanced Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '16px',
              justifyContent: 'flex-end',
              padding: '24px 32px',
              borderTop: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.2)' : 'rgba(148, 163, 184, 0.25)'}`
            }}>
              <button
                onClick={() => { if (!modalSending) setShowSendConfirmModal(false); }}
                style={{
                  padding: '12px 24px',
                  border: isDarkMode 
                    ? '1px solid rgba(148, 163, 184, 0.3)' 
                    : '1px solid rgba(203, 213, 225, 0.6)',
                  background: isDarkMode 
                    ? 'rgba(51, 65, 85, 0.6)' 
                    : 'rgba(248, 250, 252, 0.9)',
                  color: isDarkMode ? '#CBD5E1' : '#475569',
                  borderRadius: '10px',
                  cursor: modalSending ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'background-color 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '100px',
                  justifyContent: 'center'
                }}
                disabled={modalSending}
                onMouseEnter={(e) => {
                  if (!modalSending) {
                    e.currentTarget.style.background = isDarkMode 
                      ? 'rgba(71, 85, 105, 0.8)' 
                      : 'rgba(226, 232, 240, 0.95)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDarkMode 
                    ? 'rgba(51, 65, 85, 0.6)' 
                    : 'rgba(248, 250, 252, 0.9)';
                }}
              >
                {(emailStatus === 'sent' || (dealStatus === 'ready' && emailStatus !== 'processing' && !modalSending)) ? 
                  <FaCheck style={{ fontSize: '12px', opacity: 0.9 }} /> :
                  <FaTimes style={{ fontSize: '12px', opacity: 0.8 }} />
                }
                {(emailStatus === 'sent') ? 'Close' :
                 (dealStatus === 'ready' && emailStatus !== 'processing' && !modalSending) ? 'Done' :
                 'Cancel'}
              </button>
              
              <button
                onClick={async () => {
                  // Validate essential fields locally before closing modal
                  const numericAmt = parseFloat(String(amountValue || '').replace(/[^0-9.]/g, ''));
                  const err = (() => {
                    if (!editableTo || !editableTo.trim()) return 'Recipient (To) is required.';
                    if (!subject || !subject.trim()) return 'Subject is required.';
                    if (!body || !body.trim()) return 'Email body is required.';
                    if (!isBeforeCallCall) {
                      if (!scopeDescription || !scopeDescription.trim()) return 'Service description is required.';
                      if (!amountValue || !amountValue.trim() || isNaN(numericAmt) || numericAmt <= 0) return 'Estimated fee must be a positive number.';
                    }
                    return null;
                  })();
                  if (err) {
                    setModalError(err);
                    return;
                  }
                  setModalError(null);
                  try {
                    setModalSending(true);
                    setHasSentEmail(true);
                    // Update recipients before sending if callback provided
                    if (onRecipientsChange && editableTo !== to) {
                      onRecipientsChange(editableTo, cc, bcc);
                    }
                    await handleSendEmailWithProcessing();
                  } finally {
                    setModalSending(false);
                  }
                }}
                style={{
                  padding: '14px 36px',
                  border: 'none',
                  background: modalSending 
                    ? 'rgba(148, 163, 184, 0.8)' 
                    : `linear-gradient(135deg, ${colours.cta}, #e74c3c)`,
                  color: '#FFFFFF',
                  borderRadius: '12px',
                  cursor: modalSending ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '700',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minWidth: '160px',
                  justifyContent: 'center',
                  transform: modalSending ? 'none' : 'translateY(0px)',
                  boxShadow: modalSending 
                    ? 'none' 
                    : `0 6px 25px rgba(214, 85, 65, 0.4)`
                }}
                disabled={modalSending}
                onMouseEnter={(e) => {
                  if (!modalSending) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 10px 35px rgba(214, 85, 65, 0.6)`;
                    e.currentTarget.style.background = `linear-gradient(135deg, #c54a3d, #d63031)`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!modalSending) {
                    e.currentTarget.style.transform = 'translateY(0px)';
                    e.currentTarget.style.boxShadow = `0 6px 25px rgba(214, 85, 65, 0.4)`;
                    e.currentTarget.style.background = `linear-gradient(135deg, ${colours.cta}, #e74c3c)`;
                  }
                }}
              >
                {modalSending ? (
                  <>
                    <div style={{ 
                      width: '16px', 
                      height: '16px', 
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTop: '2px solid white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Sending…
                  </>
                ) : (
                  <>
                    <FaPaperPlane style={{ fontSize: '14px' }} />
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EditorAndTemplateBlocks;

// Allow TS to understand Webpack HMR in CRA
declare const module: { hot?: { accept: (path?: string, cb?: () => void) => void } };
