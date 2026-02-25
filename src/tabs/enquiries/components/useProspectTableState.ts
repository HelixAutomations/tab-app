/**
 * useProspectTableState — custom hooks extracted from the Enquiries god-component.
 *
 * Bundles the self-contained state groups that don't depend on each other:
 *   useRowHover        — hovered row/day keys with rAF "ready" delay
 *   useDayCollapse     — collapsed day set + toggle
 *   useToast           — toast message state + showToast() helper
 *   useRating          — rate modal open/close/submit
 *   useEditModal       — edit enquiry modal state + save
 *   usePipelineMeasurement — ResizeObserver + carousel + hover tooltip
 *   useReassignment    — reassignment dropdown + handler
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import type { Enquiry } from '../../../app/functionality/types';

// ─── useRowHover ──────────────────────────────────────────────

export interface RowHoverState {
  hoveredDayKey: string | null;
  setHoveredDayKey: React.Dispatch<React.SetStateAction<string | null>>;
  hoveredRowKey: string | null;
  setHoveredRowKey: React.Dispatch<React.SetStateAction<string | null>>;
  hoveredDayKeyReady: string | null;
  hoveredRowKeyReady: string | null;
}

export function useRowHover(): RowHoverState {
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [hoveredDayKeyReady, setHoveredDayKeyReady] = useState<string | null>(null);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [hoveredRowKeyReady, setHoveredRowKeyReady] = useState<string | null>(null);

  useEffect(() => {
    setHoveredRowKeyReady(null);
    if (!hoveredRowKey) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setHoveredRowKeyReady(hoveredRowKey);
      return;
    }
    const raf = window.requestAnimationFrame(() => setHoveredRowKeyReady(hoveredRowKey));
    return () => window.cancelAnimationFrame(raf);
  }, [hoveredRowKey]);

  useEffect(() => {
    setHoveredDayKeyReady(null);
    if (!hoveredDayKey) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setHoveredDayKeyReady(hoveredDayKey);
      return;
    }
    const raf = window.requestAnimationFrame(() => setHoveredDayKeyReady(hoveredDayKey));
    return () => window.cancelAnimationFrame(raf);
  }, [hoveredDayKey]);

  return { hoveredDayKey, setHoveredDayKey, hoveredRowKey, setHoveredRowKey, hoveredDayKeyReady, hoveredRowKeyReady };
}

// ─── useDayCollapse ───────────────────────────────────────────

export interface DayCollapseState {
  collapsedDays: Set<string>;
  toggleDayCollapse: (dayKey: string) => void;
}

export function useDayCollapse(): DayCollapseState {
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const toggleDayCollapse = useCallback((dayKey: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  }, []);

  return { collapsedDays, toggleDayCollapse };
}

// ─── useToast ─────────────────────────────────────────────────

export interface ToastState {
  toastVisible: boolean;
  toastMessage: string;
  toastDetails: string;
  toastType: 'success' | 'error' | 'info' | 'warning';
  showToast: (message: string, details: string, type: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void;
  hideToast: () => void;
  /** Direct setters — for code that still uses them individually */
  setToastVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setToastMessage: React.Dispatch<React.SetStateAction<string>>;
  setToastDetails: React.Dispatch<React.SetStateAction<string>>;
  setToastType: React.Dispatch<React.SetStateAction<'success' | 'error' | 'info' | 'warning'>>;
  /** Demo overlay (will eventually be merged into toast) */
  demoOverlayVisible: boolean;
  demoOverlayMessage: string;
  demoOverlayDetails: string;
  setDemoOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setDemoOverlayMessage: React.Dispatch<React.SetStateAction<string>>;
  setDemoOverlayDetails: React.Dispatch<React.SetStateAction<string>>;
}

export function useToast(): ToastState {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastDetails, setToastDetails] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info' | 'warning'>('success');

  const [demoOverlayVisible, setDemoOverlayVisible] = useState(false);
  const [demoOverlayMessage, setDemoOverlayMessage] = useState('');
  const [demoOverlayDetails, setDemoOverlayDetails] = useState('');

  const hideToast = useCallback(() => setToastVisible(false), []);

  const showToast = useCallback((message: string, details: string, type: 'success' | 'error' | 'info' | 'warning', durationMs = 3000) => {
    setToastMessage(message);
    setToastDetails(details);
    setToastType(type);
    setToastVisible(true);
    if (durationMs > 0) {
      setTimeout(() => setToastVisible(false), durationMs);
    }
  }, []);

  return {
    toastVisible, toastMessage, toastDetails, toastType,
    showToast, hideToast,
    setToastVisible, setToastMessage, setToastDetails, setToastType,
    demoOverlayVisible, demoOverlayMessage, demoOverlayDetails,
    setDemoOverlayVisible, setDemoOverlayMessage, setDemoOverlayDetails,
  };
}

// ─── useRating ────────────────────────────────────────────────

export interface RatingState {
  isRateModalOpen: boolean;
  currentRating: string;
  ratingEnquiryId: string | null;
  handleRate: (id: string) => void;
  closeRateModal: () => void;
  setCurrentRating: React.Dispatch<React.SetStateAction<string>>;
  submitRating: (ratingValue?: string) => Promise<void>;
}

export function useRating(
  handleRatingChange: (id: string, rating: string) => Promise<void>,
): RatingState {
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [currentRating, setCurrentRating] = useState('');
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);

  const handleRate = useCallback((id: string) => {
    setRatingEnquiryId(id);
    setCurrentRating('');
    setIsRateModalOpen(true);
  }, []);

  const closeRateModal = useCallback(() => {
    setIsRateModalOpen(false);
    setRatingEnquiryId(null);
    setCurrentRating('');
  }, []);

  const submitRating = useCallback(async (ratingValue?: string) => {
    const rating = ratingValue || currentRating;
    if (ratingEnquiryId && rating) {
      try {
        await handleRatingChange(ratingEnquiryId, rating);
        closeRateModal();
      } catch (error) {
        console.error('Error submitting rating:', error);
      }
    }
  }, [ratingEnquiryId, currentRating, handleRatingChange, closeRateModal]);

  return {
    isRateModalOpen,
    currentRating,
    ratingEnquiryId,
    handleRate,
    closeRateModal,
    setCurrentRating,
    submitRating,
  };
}

// ─── useEditModal ─────────────────────────────────────────────

export interface EditModalState {
  editingEnquiry: Enquiry | null;
  setEditingEnquiry: React.Dispatch<React.SetStateAction<Enquiry | null>>;
  showEditModal: boolean;
  setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
  openEditModal: (enquiry: Enquiry) => void;
  closeEditModal: () => void;
}

export function useEditModal(): EditModalState {
  const [editingEnquiry, setEditingEnquiry] = useState<Enquiry | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const openEditModal = useCallback((enquiry: Enquiry) => {
    setEditingEnquiry(enquiry);
    setShowEditModal(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingEnquiry(null);
  }, []);

  return { editingEnquiry, setEditingEnquiry, showEditModal, setShowEditModal, openEditModal, closeEditModal };
}

// ─── usePipelineMeasurement ───────────────────────────────────

type PipelineChipLabelMode = 'full' | 'short' | 'icon';

const CHIP_MIN_WIDTHS = { icon: 32, short: 84, full: 104 };

export interface PipelineMeasurementState {
  pipelineGridMeasureRef: React.MutableRefObject<HTMLDivElement | null>;
  pipelineChipLabelMode: PipelineChipLabelMode;
  visiblePipelineChipCount: number;
  PIPELINE_CHIP_MIN_WIDTH_PX: number;
  pipelineNeedsCarousel: boolean;
  pipelineScrollOffset: number;
  advancePipelineScroll: (enquiryId: string, totalChips: number, visibleChips: number) => void;
  getPipelineScrollOffset: (enquiryId: string) => number;
  /** Hover tooltip state */
  pipelineHover: PipelineHoverInfo | null;
  showPipelineHover: (event: React.MouseEvent, info: Omit<NonNullable<PipelineHoverInfo>, 'x' | 'y'>) => void;
  movePipelineHover: (event: React.MouseEvent) => void;
  hidePipelineHover: () => void;
}

export type PipelineHoverInfo = {
  x: number;
  y: number;
  title: string;
  status: string;
  subtitle?: string;
  color: string;
  iconName?: string;
  details?: { label: string; value: string }[];
} | null;

export function usePipelineMeasurement(
  isActive: boolean,
  viewMode: string,
  filterCount: number,
  selectedPocFilter: string | null,
): PipelineMeasurementState {
  const pipelineGridMeasureRef = useRef<HTMLDivElement | null>(null);
  const [pipelineChipLabelMode, setPipelineChipLabelMode] = useState<PipelineChipLabelMode>('short');
  const [visiblePipelineChipCount, setVisiblePipelineChipCount] = useState<number>(3);
  const pipelineMeasureRetryRef = useRef(0);
  const pipelineMeasureRetryTimerRef = useRef<number | null>(null);
  const [pipelineRemeasureKey, setPipelineRemeasureKey] = useState<number>(0);
  const [pipelineScrollOffset, setPipelineScrollOffset] = useState<number>(0);

  const PIPELINE_CHIP_MIN_WIDTH_PX = CHIP_MIN_WIDTHS[pipelineChipLabelMode] ?? CHIP_MIN_WIDTHS.short;

  // Remeasure on tab activation
  useEffect(() => {
    if (!isActive) return;
    const bump = () => setPipelineRemeasureKey((v) => v + 1);
    const raf = requestAnimationFrame(bump);
    const timeout = setTimeout(bump, 400);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isActive]);

  // ─── Pipeline hover tooltip ───────────────────────────────
  const [pipelineHover, setPipelineHover] = useState<PipelineHoverInfo>(null);

  useEffect(() => {
    if (!pipelineHover) return;
    const handleMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.closest('.pipeline-chip')) {
        setPipelineHover(null);
      }
    };
    const handleScroll = () => setPipelineHover(null);
    const handleBlur = () => setPipelineHover(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [pipelineHover]);

  const getPipelineHoverPosition = useCallback((target: EventTarget & HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const offset = 12;
    const estimatedWidth = 240;
    let x = rect.right + offset;
    let y = rect.top;
    if (typeof window !== 'undefined') {
      const maxX = window.innerWidth - estimatedWidth - 8;
      if (x > maxX) x = rect.left - offset;
      if (x < 8) x = 8;
      if (y < 8) y = 8;
      if (y > window.innerHeight - 8) y = window.innerHeight - 8;
    }
    return { x, y };
  }, []);

  const showPipelineHover = useCallback((event: React.MouseEvent, info: Omit<NonNullable<PipelineHoverInfo>, 'x' | 'y'>) => {
    const { x, y } = getPipelineHoverPosition(event.currentTarget as HTMLElement);
    setPipelineHover({ ...info, x, y });
  }, [getPipelineHoverPosition]);

  const movePipelineHover = useCallback((_event: React.MouseEvent) => {
    setPipelineHover((prev) => prev);
  }, []);

  const hidePipelineHover = useCallback(() => {
    setPipelineHover(null);
  }, []);

  // ─── ResizeObserver measurement ───────────────────────────
  useEffect(() => {
    const el = pipelineGridMeasureRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      if (pipelineMeasureRetryRef.current < 6) {
        pipelineMeasureRetryRef.current += 1;
        if (pipelineMeasureRetryTimerRef.current) {
          window.clearTimeout(pipelineMeasureRetryTimerRef.current);
        }
        pipelineMeasureRetryTimerRef.current = window.setTimeout(() => {
          setPipelineRemeasureKey((v) => v + 1);
        }, 120);
      }
      return;
    }

    let lastMeasuredWidth = 0;

    const computeLayout = (totalWidth: number) => {
      const columnGap = 8;
      const navButtonWidth = 24;
      const minFull = CHIP_MIN_WIDTHS.full;
      const minShort = CHIP_MIN_WIDTHS.short;
      const minIcon = CHIP_MIN_WIDTHS.icon;

      let nextMode: PipelineChipLabelMode = 'short';
      let nextCount = 7;

      // Grid always includes nav column: repeat(N, minmax(W, 1fr)) 24px
      // Total = N * W + N * gap + navButtonWidth
      const widthNeeded = (count: number, chipWidth: number) =>
        count * chipWidth + count * columnGap + navButtonWidth;

      if (totalWidth >= widthNeeded(7, minFull)) {
        nextMode = 'full';
        nextCount = 7;
      } else if (totalWidth >= widthNeeded(7, minShort)) {
        nextMode = 'short';
        nextCount = 7;
      } else if (totalWidth >= widthNeeded(7, minIcon)) {
        nextMode = 'icon';
        nextCount = 7;
      } else {
        nextMode = 'short';
        nextCount = 3;
        let shortFitFound = false;
        for (let n = 6; n >= 3; n--) {
          if (totalWidth >= widthNeeded(n, minShort)) {
            nextCount = n;
            shortFitFound = true;
            break;
          }
        }

        if (!shortFitFound) {
          nextMode = 'icon';
          nextCount = 3;
          for (let n = 6; n >= 3; n--) {
            if (totalWidth >= widthNeeded(n, minIcon)) {
              nextCount = n;
              break;
            }
          }
        }
      }

      setPipelineChipLabelMode((prev) => (prev === nextMode ? prev : nextMode));
      setVisiblePipelineChipCount(nextCount);
    };

    const measureAndApply = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) {
        if (pipelineMeasureRetryRef.current < 6) {
          pipelineMeasureRetryRef.current += 1;
          if (pipelineMeasureRetryTimerRef.current) {
            window.clearTimeout(pipelineMeasureRetryTimerRef.current);
          }
          pipelineMeasureRetryTimerRef.current = window.setTimeout(() => {
            setPipelineRemeasureKey((v) => v + 1);
          }, 120);
        }
        return;
      }
      pipelineMeasureRetryRef.current = 0;
      if (Math.abs(rect.width - lastMeasuredWidth) < 1) return;
      lastMeasuredWidth = rect.width;
      computeLayout(rect.width);
    };

    measureAndApply();
    requestAnimationFrame(measureAndApply);
    const delayedMeasure = setTimeout(measureAndApply, 100);

    let resizeRaf: number | null = null;
    const handleResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        lastMeasuredWidth = 0;
        measureAndApply();
      });
    };
    window.addEventListener('resize', handleResize);

    const pollInterval = setInterval(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width && Math.abs(rect.width - lastMeasuredWidth) > 1) {
        measureAndApply();
      }
    }, 500);

    const observer = new ResizeObserver((items) => {
      const rect = items[0]?.contentRect;
      if (!rect) return;
      computeLayout(rect.width);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(delayedMeasure);
      clearInterval(pollInterval);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (pipelineMeasureRetryTimerRef.current) {
        window.clearTimeout(pipelineMeasureRetryTimerRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [viewMode, pipelineRemeasureKey, filterCount, selectedPocFilter]);

  // ─── Carousel scroll ─────────────────────────────────────
  const advancePipelineScroll = useCallback((_enquiryId: string, totalChips: number, visibleChips: number) => {
    setPipelineScrollOffset((prev) => {
      const maxOffset = Math.max(0, totalChips - visibleChips);
      return prev >= maxOffset ? 0 : prev + 1;
    });
  }, []);

  const getPipelineScrollOffset = useCallback((_enquiryId: string): number => {
    return pipelineScrollOffset;
  }, [pipelineScrollOffset]);

  useEffect(() => {
    const maxOffset = Math.max(0, 7 - visiblePipelineChipCount);
    setPipelineScrollOffset((prev) => (prev > maxOffset ? 0 : prev));
  }, [visiblePipelineChipCount]);

  const pipelineNeedsCarousel = visiblePipelineChipCount < 7;

  return {
    pipelineGridMeasureRef,
    pipelineChipLabelMode,
    visiblePipelineChipCount,
    PIPELINE_CHIP_MIN_WIDTH_PX,
    pipelineNeedsCarousel,
    pipelineScrollOffset,
    advancePipelineScroll,
    getPipelineScrollOffset,
    pipelineHover,
    showPipelineHover,
    movePipelineHover,
    hidePipelineHover,
  };
}

// ─── useReassignment ──────────────────────────────────────────

export interface ReassignmentState {
  reassignmentDropdown: { enquiryId: string; x: number; y: number; openAbove?: boolean } | null;
  setReassignmentDropdown: React.Dispatch<React.SetStateAction<{ enquiryId: string; x: number; y: number; openAbove?: boolean } | null>>;
  isReassigning: boolean;
  handleReassignClick: (enquiryId: string, event: React.MouseEvent) => void;
  handleReassignmentSelect: (selectedEmail: string) => Promise<void>;
  closeReassignmentDropdown: () => void;
}

export function useReassignment(
  teamMemberOptions: { value: string; text: string; initials: string; email: string }[],
  showToast: (message: string, details: string, type: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void,
  setAllEnquiries: React.Dispatch<React.SetStateAction<Enquiry[]>>,
  setTeamWideEnquiries: React.Dispatch<React.SetStateAction<Enquiry[]>>,
  onRefreshEnquiries?: () => void,
): ReassignmentState {
  const [reassignmentDropdown, setReassignmentDropdown] = useState<{ enquiryId: string; x: number; y: number; openAbove?: boolean } | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  const handleReassignClick = useCallback((enquiryId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setReassignmentDropdown({
      enquiryId,
      x: rect.left + (rect.width / 2) - 100,
      y: openAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      openAbove,
    });
  }, []);

  const handleReassignmentSelect = useCallback(async (selectedEmail: string) => {
    if (!selectedEmail || !reassignmentDropdown) return;
    const selectedOption = teamMemberOptions.find((option) => option.value === selectedEmail);
    if (!selectedOption) return;

    const enquiryId = reassignmentDropdown.enquiryId;
    const newOwnerName = selectedOption.text.split(' (')[0];

    setReassignmentDropdown(null);
    setIsReassigning(true);
    showToast('Reassigning enquiry...', `Moving to ${newOwnerName}`, 'info', 0);

    try {
      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: enquiryId, Point_of_Contact: selectedEmail }),
      });
      const result = await response.json();

      if (response.ok && result.success) {
        const updater = (prev: Enquiry[]) =>
          prev.map((enq) =>
            String(enq.ID) === String(enquiryId)
              ? { ...enq, Point_of_Contact: selectedEmail, poc: selectedEmail } as any
              : enq,
          );
        setAllEnquiries(updater);
        setTeamWideEnquiries(updater);
        showToast('Enquiry reassigned', `Now assigned to ${newOwnerName}`, 'success');
        if (onRefreshEnquiries) setTimeout(() => onRefreshEnquiries(), 800);
      } else {
        showToast('Reassignment failed', result.message || 'Please try again', 'error', 4000);
      }
    } catch (error) {
      console.error('Error reassigning enquiry:', error);
      showToast('Reassignment failed', error instanceof Error ? error.message : 'Network error — please try again', 'error', 4000);
    } finally {
      setIsReassigning(false);
    }
  }, [reassignmentDropdown, teamMemberOptions, showToast, setAllEnquiries, setTeamWideEnquiries, onRefreshEnquiries]);

  const closeReassignmentDropdown = useCallback(() => {
    setReassignmentDropdown(null);
  }, []);

  // Click-outside listener
  useEffect(() => {
    if (!reassignmentDropdown) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.reassignment-dropdown')) {
        setReassignmentDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [reassignmentDropdown]);

  return {
    reassignmentDropdown,
    setReassignmentDropdown,
    isReassigning,
    handleReassignClick,
    handleReassignmentSelect,
    closeReassignmentDropdown,
  };
}
