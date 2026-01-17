 // src/CustomForms/AnnualLeaveModal.tsx
// Calendar-based annual leave booking with full team visibility

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Stack, Text, DefaultButton, TextField, Icon, TooltipHost, IconButton, Spinner, SpinnerSize, MessageBar, MessageBarType, Dropdown, IDropdownOption, Dialog, DialogType, DialogFooter, PrimaryButton, Checkbox } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { format, addDays, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, isAfter, isBefore, addMonths, subMonths, startOfDay } from 'date-fns';
import { TeamData, AnnualLeaveRecord } from '../app/functionality/types';

// Helper: Get fiscal year start for a given date (April 1 - March 31)
function getFiscalYearStart(date: Date): Date {
  const year = date.getFullYear();
  const aprilFirst = new Date(year, 3, 1); // April 1st
  return date >= aprilFirst ? aprilFirst : new Date(year - 1, 3, 1);
}

// Helper: Get fiscal year end for a given date
function getFiscalYearEnd(date: Date): Date {
  const fiscalStart = getFiscalYearStart(date);
  return new Date(fiscalStart.getFullYear() + 1, 2, 31); // March 31
}

interface AnnualLeaveModalProps {
  userData: any;
  totals: { standard: number; unpaid: number; sale: number };
  bankHolidays?: Set<string>;
  futureLeave: AnnualLeaveRecord[];
  allLeave?: AnnualLeaveRecord[]; // All leave records including history
  team: TeamData[];
  isAdmin?: boolean; // Admin flag for elevated privileges
  isLoadingAnnualLeave?: boolean;
  onSubmitSuccess: () => void;
}

interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

interface DayInfo {
  date: Date;
  dateStr: string;
  isWeekend: boolean;
  isBankHoliday: boolean;
  isSelected: boolean;
  leaveType?: 'standard' | 'purchase' | 'sale';
  isOwnLeave: boolean;
  teamLeave: string[]; // Array of initials who are off
}

export const AnnualLeaveModal: React.FC<AnnualLeaveModalProps> = ({
  userData,
  totals,
  bankHolidays,
  futureLeave,
  allLeave,
  team,
  isAdmin = false,
  isLoadingAnnualLeave = false,
  onSubmitSuccess
}) => {
  const { isDarkMode } = useTheme();
  const skeletonBase = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
  const skeletonStrong = isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.12)';
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Map<string, 'standard' | 'purchase' | 'sale'>>(new Map());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; dateStr: string } | null>(null);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [hearingConfirmation, setHearingConfirmation] = useState<'yes' | 'no'>('yes');
  const [hearingDetails, setHearingDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Auto-dismiss toasts after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Admin state
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<AnnualLeaveRecord | null>(null);
  const [editDays, setEditDays] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<AnnualLeaveRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOutcome, setDeleteOutcome] = useState<{
    success: boolean;
    sqlDeleted: boolean;
    clioDeleted: boolean | null;
    outlookDeleted: boolean | null;
    outlookMatched: boolean | null;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkDays, setBulkDays] = useState<string>('');
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [localLeaveData, setLocalLeaveData] = useState<{
    all: AnnualLeaveRecord[];
    future: AnnualLeaveRecord[];
    totals: { standard: number; unpaid: number; sale: number };
  } | null>(null);
  const [isLoadingLocalLeave, setIsLoadingLocalLeave] = useState(false);
  const [viewedEmployeeTotals, setViewedEmployeeTotals] = useState<{ standard: number; unpaid: number; sale: number } | null>(null);
  const [viewedEmployeeLeave, setViewedEmployeeLeave] = useState<AnnualLeaveRecord[] | null>(null);
  const [viewedEmployeeEntitlementValue, setViewedEmployeeEntitlementValue] = useState<number | null>(null);
  const [isLoadingEmployeeData, setIsLoadingEmployeeData] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null); // Track current loading stage

  const ownInitials = String(userData?.[0]?.Initials || userData?.[0]?.initials || 'XX').trim().toUpperCase();
  // If admin has selected an employee, show their data; otherwise show own
  const viewingInitials = isAdmin && selectedEmployee ? selectedEmployee : ownInitials;
  const userInitials = viewingInitials; // Alias for compatibility

  useEffect(() => {
    if (isAdmin && selectedEmployee) return;
    if (!userInitials) return;
    if ((allLeave && allLeave.length > 0) || (futureLeave && futureLeave.length > 0)) return;
    if (isLoadingLocalLeave) return;

    const fetchLocalLeaveData = async () => {
      setIsLoadingLocalLeave(true);
      try {
        const response = await fetch('/api/attendance/getAnnualLeave?forceRefresh=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInitials })
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();
        const mapLeave = (raw: any): AnnualLeaveRecord[] => {
          if (!Array.isArray(raw)) return [];
          return raw.map((rec: any) => ({
            id: String(rec.request_id ?? rec.id ?? rec.ID ?? ''),
            request_id: rec.request_id ?? rec.id ?? rec.ID ?? undefined,
            person: String(rec.person ?? rec.fe ?? rec.initials ?? rec.user_initials ?? rec.userInitials ?? '').trim(),
            start_date: rec.start_date ?? rec.Start_Date ?? rec.startDate ?? '',
            end_date: rec.end_date ?? rec.End_Date ?? rec.endDate ?? '',
            reason: rec.reason ?? rec.Reason ?? rec.notes ?? '',
            status: rec.status ?? '',
            days_taken: rec.days_taken ?? rec.total_days ?? rec.totalDays,
            leave_type: rec.leave_type ?? rec.leaveType,
            rejection_notes: rec.rejection_notes ?? rec.rejectionNotes ?? undefined,
            hearing_confirmation: rec.hearing_confirmation ?? rec.hearingConfirmation,
            hearing_details: rec.hearing_details ?? rec.hearingDetails,
            half_day_start: rec.half_day_start ?? rec.halfDayStart,
            half_day_end: rec.half_day_end ?? rec.halfDayEnd,
            requested_at: rec.requested_at ?? rec.requestedAt ?? undefined,
            approved_at: rec.approved_at ?? rec.approvedAt ?? undefined,
            booked_at: rec.booked_at ?? rec.bookedAt ?? undefined,
            updated_at: rec.updated_at ?? rec.updatedAt ?? undefined
          }));
        };

        setLocalLeaveData({
          all: mapLeave(data.all_data),
          future: mapLeave(data.future_leave),
          totals: data.user_details?.totals || { standard: 0, unpaid: 0, sale: 0 }
        });
      } catch (error) {
        console.warn('[AnnualLeaveModal] Failed to fetch local leave data:', error);
      } finally {
        setIsLoadingLocalLeave(false);
      }
    };

    fetchLocalLeaveData();
  }, [isAdmin, selectedEmployee, userInitials, allLeave, futureLeave, isLoadingLocalLeave]);
  
  // Employee list for admin chips (sorted alphabetically)
  const employeeList = useMemo(() => {
    if (!isAdmin || !team?.length) return [];
    const uniqueInitials = [...new Set(
      team.map(t => t.Initials?.toUpperCase().trim()).filter((i): i is string => Boolean(i))
    )];
    return uniqueInitials.sort().map(initials => ({
      initials,
      name: team.find(t => t.Initials?.toUpperCase().trim() === initials)?.First || initials
    }));
  }, [isAdmin, team]);

  // Fetch employee data when admin selects a different employee
  useEffect(() => {
    if (!isAdmin) return;
    
    if (!selectedEmployee) {
      setViewedEmployeeTotals(null);
      setViewedEmployeeLeave(null);
      setViewedEmployeeEntitlementValue(null);
      setLoadingStage(null);
      // Show toast when switching back to own view (but not on initial render)
      if (viewedEmployeeTotals !== null) {
        setToast({ type: 'info', text: 'Switched back to your own leave data' });
      }
      return;
    }

    const fetchEmployeeData = async () => {
      setIsLoadingEmployeeData(true);
      setLoadingStage('Connecting to server...');
      try {
        setLoadingStage('Fetching leave records...');
        const response = await fetch('/api/attendance/getAnnualLeave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInitials: selectedEmployee })
        });
        
        if (!response.ok) {
          setLoadingStage('Server error');
          throw new Error(`Server returned ${response.status}`);
        }
        
        setLoadingStage('Processing data...');
        const data = await response.json();
        
        if (!data) {
          setLoadingStage('No data returned');
          throw new Error('Empty response from server');
        }
        
        setLoadingStage('Extracting totals...');
        setViewedEmployeeTotals(data.user_details?.totals || { standard: 0, unpaid: 0, sale: 0 });
        
        setLoadingStage('Loading leave history...');
        // Store the employee's leave records - use user_leave which is filtered to the requested user
        const userRecords = data.user_leave || data.user_details?.leaveEntries || [];
        
        setLoadingStage('Resolving entitlement...');
        // Get entitlement from the API team data (more reliable than local team prop)
        const apiTeamMember = data.team?.find((t: any) => t.Initials?.toUpperCase().trim() === selectedEmployee);
        const fetchedEntitlement = apiTeamMember?.holiday_entitlement ?? null;
        setViewedEmployeeEntitlementValue(fetchedEntitlement);
        
        console.log('[AnnualLeaveModal] API response:', { 
          selectedEmployee, 
          userLeaveCount: userRecords.length,
          totals: data.user_details?.totals,
          fetchedEntitlement,
          sampleRecord: userRecords[0]
        });
        
        setViewedEmployeeLeave(userRecords);
        setLoadingStage(null);
        const empName = apiTeamMember?.First || team?.find(t => t.Initials?.toUpperCase().trim() === selectedEmployee)?.First || selectedEmployee;
        setToast({ type: 'success', text: `Loaded ${userRecords.length} records for ${empName}` });
      } catch (error) {
        console.error('Failed to fetch employee leave data:', error);
        setLoadingStage('Failed');
        setToast({ type: 'error', text: `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}` });
        // Clear loading stage after a delay
        setTimeout(() => setLoadingStage(null), 2000);
      } finally {
        setIsLoadingEmployeeData(false);
      }
    };

    fetchEmployeeData();
  }, [isAdmin, selectedEmployee]);

  const effectiveFutureLeave = useMemo(() => {
    if (futureLeave && futureLeave.length > 0) return futureLeave;
    return localLeaveData?.future || [];
  }, [futureLeave, localLeaveData]);

  const effectiveAllLeave = useMemo(() => {
    if (allLeave && allLeave.length > 0) return allLeave;
    return localLeaveData?.all || [];
  }, [allLeave, localLeaveData]);

  // Get the effective totals - use fetched employee data when viewing someone else
  const effectiveTotals = (isAdmin && selectedEmployee && viewedEmployeeTotals)
    ? viewedEmployeeTotals
    : (totals || localLeaveData?.totals || { standard: 0, unpaid: 0, sale: 0 });

  // Get the effective entitlement - prefer fetched value from API, fallback to team prop lookup
  const viewedEmployeeEntitlement = useMemo(() => {
    if (!isAdmin || !selectedEmployee) return null;
    // Use the value fetched from API (most reliable)
    if (viewedEmployeeEntitlementValue != null) return viewedEmployeeEntitlementValue;
    // Fallback to team prop lookup
    const teamMember = team?.find(t => t.Initials?.toUpperCase().trim() === selectedEmployee);
    return teamMember?.holiday_entitlement ?? null;
  }, [isAdmin, selectedEmployee, viewedEmployeeEntitlementValue, team]);
  
  // Use allLeave for history when populated, fall back to futureLeave
  // When admin views another employee, use their fetched leave records
  const leaveHistoryData = (isAdmin && selectedEmployee && viewedEmployeeLeave) 
    ? viewedEmployeeLeave 
    : ((effectiveAllLeave && effectiveAllLeave.length > 0) ? effectiveAllLeave : effectiveFutureLeave);

  const filteredLeaveHistory = useMemo(() => {
    return leaveHistoryData.filter(record => {
      return String(record.person || '').trim().toUpperCase() === userInitials;
    });
  }, [leaveHistoryData, userInitials]);

  const visibleRecordIds = useMemo(() => {
    return filteredLeaveHistory
      .map((record) => String(record.id ?? record.request_id ?? '').trim())
      .filter(Boolean);
  }, [filteredLeaveHistory]);

  const allVisibleSelected = useMemo(() => {
    if (!visibleRecordIds.length) return false;
    return visibleRecordIds.every((id) => selectedRecordIds.has(id));
  }, [visibleRecordIds, selectedRecordIds]);

  const toggleRecordSelection = useCallback((recordId: string) => {
    if (!recordId) return;
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    if (!visibleRecordIds.length) return;
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleRecordIds.forEach((id) => next.delete(id));
      } else {
        visibleRecordIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [visibleRecordIds, allVisibleSelected]);

  const baseHasData = Boolean((effectiveAllLeave && effectiveAllLeave.length > 0) || (effectiveFutureLeave && effectiveFutureLeave.length > 0));
  const isBaseLoading = Boolean((isLoadingAnnualLeave || isLoadingLocalLeave) && !baseHasData && (!isAdmin || !selectedEmployee));
  const isHistoryLoading = isBaseLoading || (isAdmin && selectedEmployee && isLoadingEmployeeData);
  const isStatsLoading = isBaseLoading || (isAdmin && selectedEmployee && isLoadingEmployeeData);
  
  // Debug: log leave history data
  useEffect(() => {
    const userMatches = leaveHistoryData?.filter(r => String(r.person || '').trim().toUpperCase() === userInitials);
    console.log('[AnnualLeaveModal] Leave History Debug:', {
      userInitials,
      isAdmin,
      selectedEmployee,
      effectiveTotals,
      viewedEmployeeEntitlement,
      allLeaveCount: allLeave?.length ?? 'undefined',
      futureLeaveCount: effectiveFutureLeave?.length,
      leaveHistoryDataCount: leaveHistoryData?.length,
      userMatchCount: userMatches?.length,
    });
  }, [userInitials, allLeave, effectiveFutureLeave, leaveHistoryData, isAdmin, selectedEmployee, effectiveTotals, viewedEmployeeEntitlement]);

  // Manual refresh function for admin view
  const refreshEmployeeData = useCallback(async () => {
    if (!isAdmin || !selectedEmployee) return;
    setIsLoadingEmployeeData(true);
    setLoadingStage('Refreshing...');
    try {
      const response = await fetch('/api/attendance/getAnnualLeave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInitials: selectedEmployee })
      });
      if (!response.ok) {
        setLoadingStage('Refresh failed');
        throw new Error(`Server returned ${response.status}`);
      }
      setLoadingStage('Processing...');
      const data = await response.json();
      setViewedEmployeeTotals(data.user_details?.totals || { standard: 0, unpaid: 0, sale: 0 });
      const userRecords = data.user_leave || data.user_details?.leaveEntries || [];
      setViewedEmployeeLeave(userRecords);
      // Also refresh entitlement from API
      const apiTeamMember = data.team?.find((t: any) => t.Initials?.toUpperCase().trim() === selectedEmployee);
      if (apiTeamMember?.holiday_entitlement != null) {
        setViewedEmployeeEntitlementValue(apiTeamMember.holiday_entitlement);
      }
      setLoadingStage(null);
      setToast({ type: 'success', text: `Refreshed ${userRecords.length} records for ${selectedEmployee}` });
    } catch (error) {
      setLoadingStage('Failed');
      setToast({ type: 'error', text: `Failed to refresh: ${error instanceof Error ? error.message : 'Unknown error'}` });
      setTimeout(() => setLoadingStage(null), 2000);
    } finally {
      setIsLoadingEmployeeData(false);
    }
  }, [isAdmin, selectedEmployee]);
  
  // Admin handlers
  const handleDeleteLeave = useCallback(async (record: AnnualLeaveRecord) => {
    if (!record.request_id) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/attendance/annual-leave/${record.request_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteFromClio: true })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Delete failed');
      setDeleteOutcome({
        success: true,
        sqlDeleted: Boolean(result?.sqlDeleted ?? true),
        clioDeleted: typeof result?.clioDeleted === 'boolean' ? result.clioDeleted : null,
        outlookDeleted: typeof result?.outlookDeleted === 'boolean' ? result.outlookDeleted : null,
        outlookMatched: typeof result?.outlookMatched === 'boolean' ? result.outlookMatched : null
      });
      const clioText = typeof result?.clioDeleted === 'boolean'
        ? (result.clioDeleted ? 'Clio cleared' : 'Clio not cleared')
        : 'Clio not linked';
      const outlookText = typeof result?.outlookDeleted === 'boolean'
        ? (result.outlookDeleted ? 'Outlook cleared' : 'Outlook not cleared')
        : (result?.outlookMatched === false ? 'Outlook not found' : 'Outlook not verified');
      setToast({ type: 'success', text: `Leave deleted. ${clioText}. ${outlookText}.` });
      if (isAdmin && selectedEmployee) {
        await refreshEmployeeData();
      } else {
        setLocalLeaveData((prev) => {
          if (!prev) return prev;
          const recordId = String(record.request_id);
          return {
            ...prev,
            all: prev.all.filter((item) => String(item.request_id ?? item.id) !== recordId),
            future: prev.future.filter((item) => String(item.request_id ?? item.id) !== recordId)
          };
        });
        setSelectedRecordIds((prev) => {
          const next = new Set(prev);
          next.delete(String(record.request_id));
          return next;
        });
      }
    } catch (error) {
      setToast({ type: 'error', text: 'Failed to delete leave record' });
    } finally {
      setIsDeleting(false);
    }
  }, [onSubmitSuccess, isAdmin, selectedEmployee, refreshEmployeeData]);

  const handleBulkUpdate = useCallback(async () => {
    if (!selectedRecordIds.size) return;
    if (!bulkStatus && !bulkDays) {
      setToast({ type: 'error', text: 'Select a status or days taken to update.' });
      return;
    }
    setIsBulkUpdating(true);
    const ids = Array.from(selectedRecordIds);

    try {
      const updateResults = await Promise.allSettled(
        ids.map(async (id) => {
          const payload: any = { id };
          if (bulkStatus) payload.newStatus = bulkStatus;
          if (bulkDays !== '') payload.days_taken = Number(bulkDays);

          const response = await fetch('/api/attendance/admin/annual-leave', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error || `Update failed for ${id}`);
          }
        })
      );

      const failures = updateResults.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
      if (failures.length > 0) {
        const message = failures[0]?.reason instanceof Error ? failures[0].reason.message : 'Some updates failed.';
        setToast({ type: 'error', text: message });
      } else {
        setToast({ type: 'success', text: `Updated ${ids.length} record${ids.length > 1 ? 's' : ''}.` });
      }

      if (isAdmin && selectedEmployee) {
        await refreshEmployeeData();
      }
      setLocalLeaveData(null);
      setSelectedRecordIds(new Set());
      setBulkStatus('');
      setBulkDays('');
      setShowBulkDialog(false);
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Bulk update failed.' });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [selectedRecordIds, bulkStatus, bulkDays, isAdmin, selectedEmployee, refreshEmployeeData]);

  const handleEditLeave = useCallback(async () => {
    if (!editingRecord?.request_id) return;
    setIsEditing(true);
    try {
      const response = await fetch('/api/attendance/admin/annual-leave', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRecord.request_id,
          newStatus: editStatus || editingRecord.status,
          days_taken: editDays ? Number(editDays) : editingRecord.days_taken
        })
      });
      if (!response.ok) throw new Error('Update failed');
      setToast({ type: 'success', text: 'Leave record updated successfully' });
      setEditingRecord(null);
      if (isAdmin && selectedEmployee) {
        await refreshEmployeeData();
      } else {
        setLocalLeaveData(null);
      }
    } catch (error) {
      setToast({ type: 'error', text: 'Failed to update leave record' });
    } finally {
      setIsEditing(false);
    }
  }, [editingRecord, editStatus, editDays, onSubmitSuccess, isAdmin, selectedEmployee, refreshEmployeeData]);

  // Build calendar days for current month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: DayInfo[] = [];
    let day = calendarStart;

    while (day <= calendarEnd) {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      // Check team leave for this date
      const teamOnLeave = effectiveFutureLeave
        .filter(leave => {
          const leaveStart = new Date(leave.start_date);
          const leaveEnd = new Date(leave.end_date);
          return day >= leaveStart && day <= leaveEnd;
        })
        .map(leave => leave.person);

      const isOwnLeave = teamOnLeave.includes(userInitials);
      const otherTeamLeave = teamOnLeave.filter(person => person !== userInitials);

      days.push({
        date: day,
        dateStr,
        isWeekend: isWeekend(day),
        isBankHoliday: bankHolidays?.has(dateStr) || false,
        isSelected: selectedDates.has(dateStr),
        leaveType: selectedDates.get(dateStr),
        isOwnLeave,
        teamLeave: otherTeamLeave
      });

      day = addDays(day, 1);
    }

    return days;
  }, [currentMonth, selectedDates, effectiveFutureLeave, bankHolidays, userInitials]);

  // Calculate total working days from selected dates, grouped by type
  const { totalDays, daysByType } = useMemo(() => {
    let count = 0;
    const byType = { standard: 0, purchase: 0, sale: 0 };
    
    selectedDates.forEach((leaveType, dateStr) => {
      const day = new Date(dateStr);
      if (!isWeekend(day) && !bankHolidays?.has(dateStr)) {
        count += 1;
        byType[leaveType] += 1;
      }
    });
    return { totalDays: count, daysByType: byType };
  }, [selectedDates, bankHolidays]);

  // Fiscal year detection for selected dates
  const fiscalYearInfo = useMemo(() => {
    if (selectedDates.size === 0) {
      return { 
        currentYear: true, 
        nextYear: false, 
        spansMultiple: false,
        allDaysInNextYear: false,
        currentFiscalEnd: ''
      };
    }

    const currentFiscalStart = getFiscalYearStart(new Date());
    const currentFiscalEnd = getFiscalYearEnd(new Date());
    
    let hasCurrentYear = false;
    let hasNextYear = false;
    
    selectedDates.forEach((_, dateStr) => {
      const date = new Date(dateStr);
      
      // Check if date falls in current fiscal year
      if (date <= currentFiscalEnd && date >= currentFiscalStart) {
        hasCurrentYear = true;
      }
      
      // Check if date falls in next fiscal year
      if (date > currentFiscalEnd) {
        hasNextYear = true;
      }
    });
    
    return {
      currentYear: hasCurrentYear,
      nextYear: hasNextYear,
      spansMultiple: hasCurrentYear && hasNextYear,
      allDaysInNextYear: !hasCurrentYear && hasNextYear,
      currentFiscalEnd: format(currentFiscalEnd, 'd MMM yyyy')
    };
  }, [selectedDates]);

  const nextFiscalYearLabel = useMemo(() => {
    const currentStart = getFiscalYearStart(new Date());
    const nextStart = new Date(currentStart.getFullYear() + 1, 3, 1);
    const nextEnd = new Date(currentStart.getFullYear() + 2, 2, 31);
    return `FY ${nextStart.getFullYear()}/${String(nextEnd.getFullYear()).slice(-2)}`;
  }, []);

  const isNextYearOnly = fiscalYearInfo.allDaysInNextYear;

  // Calculate remaining days - separate pools for standard, purchase, sale
  const { entitlement, used, standardRemaining, purchaseAllowance, purchaseRemaining, saleAllowance, saleRemaining } = useMemo(() => {
    // When admin is viewing another employee, use their entitlement from team data
    const holidayEntitlement = (isAdmin && selectedEmployee && viewedEmployeeEntitlement != null)
      ? viewedEmployeeEntitlement
      : Number(userData?.[0]?.holiday_entitlement ?? userData?.[0]?.Entitlement ?? 20);
    const purchaseLimit = Number(userData?.[0]?.purchase_allowance ?? userData?.[0]?.Purchase_Allowance ?? 5);
    const saleLimit = Number(userData?.[0]?.sale_allowance ?? userData?.[0]?.Sale_Allowance ?? 5);
    
    // Use effective totals (fetched employee data when viewing someone else)
    const safeTotals = effectiveTotals || { standard: 0, unpaid: 0, sale: 0 };
    
    // Debug: Log userData fields to console
    console.log('[AnnualLeaveModal] Entitlement calc:', {
      isAdmin,
      selectedEmployee,
      viewedEmployeeEntitlement,
      holidayEntitlement,
      effectiveTotals: safeTotals,
      fiscalYearInfo
    });
    
    // Only deduct days from current year's allowance if they're actually in the current fiscal year
    const daysToDeduct = fiscalYearInfo.allDaysInNextYear ? 0 : daysByType.standard;
    
    // Standard deducts from entitlement, Purchase/Sale have their own pools
    const standardUsed = safeTotals.standard;
    const stdRemaining = holidayEntitlement - standardUsed - daysToDeduct;
    const purchRemaining = purchaseLimit - daysByType.purchase;
    const saleRemaining = saleLimit - daysByType.sale;
    
    return {
      entitlement: holidayEntitlement,
      used: standardUsed,
      standardRemaining: stdRemaining,
      purchaseAllowance: purchaseLimit,
      purchaseRemaining: purchRemaining,
      saleAllowance: saleLimit,
      saleRemaining: saleRemaining
    };
  }, [daysByType, effectiveTotals, userData, isAdmin, selectedEmployee, viewedEmployeeEntitlement, fiscalYearInfo]);

  // Get selected date ranges (consecutive dates grouped by type)
  const dateRanges = useMemo(() => {
    const sorted = Array.from(selectedDates.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    const ranges: (DateRange & { leaveType: 'standard' | 'purchase' | 'sale' })[] = [];
    
    if (sorted.length === 0) return ranges;

    let rangeStart = sorted[0][0];
    let rangeEnd = sorted[0][0];
    let currentType = sorted[0][1];

    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(sorted[i - 1][0]);
      const currDate = new Date(sorted[i][0]);
      const currType = sorted[i][1];
      const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

      // Group if consecutive AND same leave type
      if (diff === 1 && currType === currentType) {
        rangeEnd = sorted[i][0];
      } else {
        ranges.push({ startDate: rangeStart, endDate: rangeEnd, leaveType: currentType });
        rangeStart = sorted[i][0];
        rangeEnd = sorted[i][0];
        currentType = currType;
      }
    }

    ranges.push({ startDate: rangeStart, endDate: rangeEnd, leaveType: currentType });
    return ranges;
  }, [selectedDates]);

  const handleDayClick = (dayInfo: DayInfo) => {
    const todayStart = startOfDay(new Date());
    const dayStart = startOfDay(dayInfo.date);

    // Can't select weekends, bank holidays, or past dates
    if (dayInfo.isWeekend || dayInfo.isBankHoliday || isBefore(dayStart, todayStart)) {
      return;
    }

    const newSelected = new Map(selectedDates);
    
    if (newSelected.has(dayInfo.dateStr)) {
      // Cycle through types: standard → purchase → sale → deselect
      const currentType = newSelected.get(dayInfo.dateStr);
      if (currentType === 'standard') {
        newSelected.set(dayInfo.dateStr, 'purchase');
      } else if (currentType === 'purchase') {
        newSelected.set(dayInfo.dateStr, 'sale');
      } else {
        newSelected.delete(dayInfo.dateStr); // Deselect after sale
      }
    } else {
      newSelected.set(dayInfo.dateStr, 'standard'); // Default to standard leave
    }

    setSelectedDates(newSelected);
  };

  const handleContextMenu = (e: React.MouseEvent, dayInfo: DayInfo) => {
    e.preventDefault();
    
    const todayStart = startOfDay(new Date());
    const dayStart = startOfDay(dayInfo.date);

    // Can't set type on non-selectable dates
    if (dayInfo.isWeekend || dayInfo.isBankHoliday || isBefore(dayStart, todayStart)) {
      return;
    }

    // Calculate position ensuring menu stays in viewport
    const menuWidth = 280;
    const menuHeight = 200; // Approximate height
    const x = e.clientX + menuWidth > window.innerWidth ? e.clientX - menuWidth : e.clientX;
    const y = e.clientY + menuHeight > window.innerHeight ? e.clientY - menuHeight : e.clientY;

    setContextMenu({ x, y, dateStr: dayInfo.dateStr });
  };

  const handleSetLeaveType = (type: 'standard' | 'purchase' | 'sale') => {
    if (!contextMenu) return;

    const newSelected = new Map(selectedDates);
    newSelected.set(contextMenu.dateStr, type);
    setSelectedDates(newSelected);
    setContextMenu(null);
  };

  const handleClear = () => {
    setSelectedDates(new Map());
    setNotes('');
    setHearingConfirmation('yes');
    setHearingDetails('');
    setMessage(null);
    setContextMenu(null);
  };

  const handleSubmit = async () => {
    setMessage(null);

    // Validation
    if (selectedDates.size === 0) {
      setMessage({ type: 'error', text: 'Please select at least one date.' });
      return;
    }

    // Validate each leave pool separately
    if (standardRemaining < 0) {
      setMessage({ type: 'error', text: `Standard leave exceeds allowance (${entitlement - used} days remaining).` });
      return;
    }
    if (purchaseRemaining < 0) {
      setMessage({ type: 'error', text: `Purchase days exceed allowance (${purchaseAllowance} available).` });
      return;
    }
    if (saleRemaining < 0) {
      setMessage({ type: 'error', text: `Sale days exceed allowance (${saleAllowance} available).` });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        fe: userInitials,
        dateRanges: dateRanges.map(r => ({
          start_date: r.startDate,
          end_date: r.endDate,
          half_day_start: false,
          half_day_end: false,
          leave_type: r.leaveType
        })),
        reason: notes || 'No reason provided',
        days_taken: totalDays,
        leave_type: dateRanges[0]?.leaveType || 'standard', // Primary type for backwards compat
        hearing_confirmation: hearingConfirmation,
        hearing_details: hearingConfirmation === 'no' ? hearingDetails : '',
        is_exam: false,
        exam_details: ''
      };

      const response = await fetch('/api/attendance/annual-leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit leave request');
      }

      setMessage({ type: 'success', text: '✅ Leave request submitted successfully and is pending approval.' });
      setToast({ type: 'success', text: 'Leave request submitted! Pending approval.' });
      handleClear();
      
      // Notify parent to refresh data
      setTimeout(() => {
        onSubmitSuccess();
      }, 1500);

    } catch (error) {
      console.error('Error submitting leave:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setMessage({ type: 'error', text: `Failed to submit: ${errorMsg}` });
      setToast({ type: 'error', text: `Submission failed: ${errorMsg}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const bgCard = isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(248, 250, 252, 0.9)';
  const bgHover = isDarkMode ? 'rgba(51, 65, 85, 0.6)' : 'rgba(241, 245, 249, 0.9)';
  const borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textMuted = isDarkMode ? 'rgba(203, 213, 225, 0.6)' : 'rgba(71, 85, 105, 0.6)';

  return (
    <div style={{
      margin: '0 auto',
      maxWidth: '1100px',
      position: 'relative'
    }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
          animation: 'slideInRight 0.3s ease-out',
          backgroundColor: toast.type === 'success' 
            ? (isDarkMode ? 'rgba(16, 185, 129, 0.95)' : '#10b981')
            : toast.type === 'error'
            ? (isDarkMode ? 'rgba(239, 68, 68, 0.95)' : '#ef4444')
            : (isDarkMode ? 'rgba(54, 144, 206, 0.95)' : colours.highlight), // info = brand blue
          color: '#ffffff',
          fontWeight: 500,
          fontSize: '13px',
          maxWidth: '350px',
          backdropFilter: 'blur(8px)'
        }}>
          <span>{toast.text}</span>
          <IconButton
            iconProps={{ iconName: 'Cancel' }}
            onClick={() => setToast(null)}
            styles={{
              root: { color: 'rgba(255,255,255,0.8)', height: '20px', width: '20px' },
              rootHovered: { color: '#ffffff', background: 'rgba(255,255,255,0.1)' },
              icon: { fontSize: '10px' }
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes cascadeIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .loading-overlay {
          animation: fadeIn 0.15s ease-out;
        }
        .data-transition {
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .cascade-item {
          opacity: 0;
          animation: cascadeIn 0.4s ease-out forwards;
        }
        .cascade-item:nth-child(1) { animation-delay: 0ms; }
        .cascade-item:nth-child(2) { animation-delay: 60ms; }
        .cascade-item:nth-child(3) { animation-delay: 120ms; }
        .cascade-item:nth-child(4) { animation-delay: 180ms; }
        .cascade-item:nth-child(5) { animation-delay: 240ms; }
        .cascade-item:nth-child(6) { animation-delay: 300ms; }
        .cascade-item:nth-child(7) { animation-delay: 360ms; }
        .cascade-item:nth-child(8) { animation-delay: 420ms; }
        .cascade-item:nth-child(9) { animation-delay: 480ms; }
        .cascade-item:nth-child(10) { animation-delay: 540ms; }
      `}</style>

      {message && (
        <MessageBar
          messageBarType={message.type === 'success' ? MessageBarType.success : MessageBarType.error}
          onDismiss={() => setMessage(null)}
          styles={{
            root: {
              backgroundColor: message.type === 'success' 
                ? (isDarkMode ? 'rgba(115, 171, 96, 0.1)' : 'rgba(16, 185, 129, 0.1)')
                : (isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(220, 38, 38, 0.1)'),
              borderRadius: 0,
              marginBottom: '1rem'
            }
          }}
        >
          {message.text}
        </MessageBar>
      )}

      {/* Admin Controls */}
      {isAdmin && (
        <div style={{
          padding: '12px 14px',
          marginBottom: '16px',
          background: isDarkMode ? 'rgba(255, 183, 77, 0.06)' : 'rgba(255, 152, 0, 0.06)',
          border: `1px solid ${isDarkMode ? 'rgba(255, 183, 77, 0.2)' : 'rgba(255, 152, 0, 0.2)'}`,
          borderRadius: 4
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              background: isDarkMode ? 'rgba(255, 183, 77, 0.2)' : 'rgba(255, 152, 0, 0.15)',
              borderRadius: 3,
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: isDarkMode ? '#FFB74D' : '#E65100'
            }}>
              <Icon iconName="Shield" style={{ fontSize: '10px' }} />
              Admin
            </div>
            <span style={{ fontSize: '11px', color: textMuted }}>Select employee to view their leave</span>
            {/* Loading stage indicator */}
            {loadingStage && (
              <div style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                background: loadingStage.includes('Failed') || loadingStage.includes('error')
                  ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                  : (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)'),
                borderRadius: 3,
                fontSize: '10px',
                color: loadingStage.includes('Failed') || loadingStage.includes('error')
                  ? (isDarkMode ? '#f87171' : '#dc2626')
                  : colours.highlight
              }}>
                {isLoadingEmployeeData && <Spinner size={SpinnerSize.xSmall} />}
                {loadingStage}
              </div>
            )}
          </div>
          
          {/* Employee chips */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '6px',
            padding: '2px 0'
          }}>
            {/* "Me" chip */}
            <button
              type="button"
              onClick={() => setSelectedEmployee(null)}
              disabled={isLoadingEmployeeData}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                background: !selectedEmployee 
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                  : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                border: `1px solid ${!selectedEmployee 
                  ? colours.highlight
                  : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
                borderRadius: 3,
                fontSize: '11px',
                fontWeight: !selectedEmployee ? 600 : 500,
                color: !selectedEmployee ? colours.highlight : textPrimary,
                cursor: isLoadingEmployeeData ? 'not-allowed' : 'pointer',
                opacity: isLoadingEmployeeData && selectedEmployee ? 0.6 : 1,
                transition: 'all 0.15s ease'
              }}
            >
              <Icon iconName="Contact" style={{ fontSize: '10px' }} />
              Me ({ownInitials})
            </button>
            
            {/* Employee chips */}
            {employeeList.filter(e => e.initials !== ownInitials).map(emp => {
              const isSelected = selectedEmployee === emp.initials;
              const isLoading = isLoadingEmployeeData && isSelected;
              return (
                <button
                  key={emp.initials}
                  type="button"
                  onClick={() => !isLoadingEmployeeData && setSelectedEmployee(emp.initials)}
                  disabled={isLoadingEmployeeData}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    background: isSelected 
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                      : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                    border: `1px solid ${isSelected 
                      ? colours.highlight
                      : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
                    borderRadius: 3,
                    fontSize: '11px',
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? colours.highlight : textPrimary,
                    cursor: isLoadingEmployeeData ? 'not-allowed' : 'pointer',
                    opacity: isLoadingEmployeeData && !isSelected ? 0.6 : 1,
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  {isLoading && (
                    <Spinner size={SpinnerSize.xSmall} style={{ marginRight: '2px' }} />
                  )}
                  <span style={{ fontWeight: 600 }}>{emp.initials}</span>
                  <span style={{ opacity: 0.7 }}>{emp.name}</span>
                </button>
              );
            })}
          </div>
          
          {/* Selected employee info bar */}
          {selectedEmployee && !isLoadingEmployeeData && viewedEmployeeTotals && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '10px',
              padding: '8px 10px',
              background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
              borderRadius: 3,
              fontSize: '11px'
            }}>
              <span style={{ color: textMuted }}>
                Viewing: <strong style={{ color: textPrimary }}>{selectedEmployee}</strong>
              </span>
              <span style={{ color: textMuted }}>
                Entitlement: <strong style={{ color: textPrimary }}>{viewedEmployeeEntitlement ?? '?'}</strong>
              </span>
              <span style={{ color: textMuted }}>
                Used: <strong style={{ color: textPrimary }}>{viewedEmployeeTotals.standard}</strong>
              </span>
              <span style={{ color: textMuted }}>
                Remaining: <strong style={{ color: viewedEmployeeEntitlement != null 
                  ? (viewedEmployeeEntitlement - viewedEmployeeTotals.standard < 0 ? '#ef4444' : '#10b981')
                  : textPrimary 
                }}>
                  {viewedEmployeeEntitlement != null 
                    ? viewedEmployeeEntitlement - viewedEmployeeTotals.standard 
                    : '?'}
                </strong>
              </span>
              <IconButton
                iconProps={{ iconName: 'Refresh' }}
                title="Refresh data"
                onClick={refreshEmployeeData}
                styles={{
                  root: { height: 24, width: 24, marginLeft: 'auto' },
                  icon: { fontSize: 12, color: textMuted }
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 2x2 Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '6px', alignItems: 'start' }}>
        {/* TOP LEFT: Calendar Section */}
        <div className="cascade-item">
          {/* Month Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <IconButton
              iconProps={{ iconName: 'ChevronLeft' }}
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              styles={{ root: { color: textPrimary } }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 600, color: textPrimary }}>
                {format(currentMonth, 'MMMM yyyy')}
              </Text>
              <TooltipHost
                content={
                  <div style={{ padding: '8px', minWidth: '180px' }}>
                    <Text style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '8px', color: textMuted }}>
                      UK Bank Holidays {new Date().getFullYear()}
                    </Text>
                    {bankHolidays && Array.from(bankHolidays).sort().map((date, idx) => {
                      const d = new Date(date);
                      const monthDay = format(d, 'd MMM');
                      
                      // Map common UK bank holidays
                      let holidayName = '';
                      if (format(d, 'MM-dd') === '01-01') holidayName = "New Year's Day";
                      else if (format(d, 'MM-dd') === '12-25') holidayName = 'Christmas Day';
                      else if (format(d, 'MM-dd') === '12-26') holidayName = 'Boxing Day';
                      else if (d.getDay() === 1 && d.getMonth() === 4 && d.getDate() <= 7) holidayName = 'Early May Bank Holiday';
                      else if (d.getDay() === 1 && d.getMonth() === 4 && d.getDate() >= 25) holidayName = 'Spring Bank Holiday';
                      else if (d.getDay() === 1 && d.getMonth() === 7 && d.getDate() >= 25) holidayName = 'Summer Bank Holiday';
                      
                      return (
                        <div key={idx} style={{ marginBottom: '4px' }}>
                          <Text style={{ fontSize: '12px', fontWeight: 600, display: 'block', lineHeight: 1.4, color: textMuted }}>
                            {monthDay}
                          </Text>
                          {holidayName && (
                            <Text style={{ fontSize: '10px', color: textMuted, display: 'block', lineHeight: 1.3 }}>
                              {holidayName}
                            </Text>
                          )}
                        </div>
                      );
                    })}
                  </div>
                }
                styles={{ root: { display: 'inline-block' } }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: isDarkMode ? 'rgba(128, 128, 128, 0.08)' : 'rgba(128, 128, 128, 0.05)',
                  border: `1px solid ${isDarkMode ? 'rgba(128, 128, 128, 0.2)' : 'rgba(128, 128, 128, 0.12)'}`,
                  borderRadius: 0,
                  cursor: 'pointer',
                  transition: '0.2s'
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = isDarkMode ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = isDarkMode ? 'rgba(128, 128, 128, 0.08)' : 'rgba(128, 128, 128, 0.05)'}
                >
                  <Icon 
                    iconName="Calendar" 
                    style={{ 
                      fontSize: '11px', 
                      color: textMuted
                    }}
                  />
                  <Text style={{ fontSize: '10px', color: textMuted, fontWeight: 600 }}>
                    Bank Holidays
                  </Text>
                </div>
              </TooltipHost>
            </div>
            <IconButton
              iconProps={{ iconName: 'ChevronRight' }}
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              styles={{ root: { color: textPrimary } }}
            />
          </div>

          {/* Calendar Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gridTemplateRows: 'auto repeat(6, 1fr)',
            gap: '4px',
            height: '360px'
          }}>
            {/* Day headers */}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
              <div key={day} style={{
                padding: '8px',
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 600,
                color: textMuted,
                textTransform: 'uppercase'
              }}>
                {day}
              </div>
            ))}

            {/* Calendar days (weekdays only) */}
            {calendarDays.filter(d => !d.isWeekend).map((dayInfo, idx) => {
              const isCurrentMonth = isSameMonth(dayInfo.date, currentMonth);
              const todayStart = startOfDay(new Date());
              const dayStart = startOfDay(dayInfo.date);
              const isToday = isSameDay(dayInfo.date, todayStart);
              const isPast = isBefore(dayStart, todayStart) && !isToday;
              const isSelectable = !dayInfo.isWeekend && !dayInfo.isBankHoliday && !isPast;

              let bgColor = bgCard;
              let textColor = textPrimary;
              
              if (dayInfo.isSelected) {
                // Color by leave type
                if (dayInfo.leaveType === 'purchase') {
                  bgColor = isDarkMode ? colours.accent : colours.highlight;
                  textColor = isDarkMode ? colours.dark.background : '#ffffff';
                } else if (dayInfo.leaveType === 'sale') {
                  bgColor = colours.green;
                  textColor = '#ffffff';
                } else {
                  bgColor = isDarkMode ? colours.highlight : colours.missedBlue;
                  textColor = '#ffffff';
                }
              } else if (dayInfo.isOwnLeave) {
                bgColor = isDarkMode ? 'rgba(115, 171, 96, 0.25)' : 'rgba(115, 171, 96, 0.15)';
                textColor = colours.green;
              } else if (dayInfo.isBankHoliday) {
                bgColor = `repeating-linear-gradient(45deg, ${isDarkMode ? 'rgba(128, 128, 128, 0.4)' : 'rgba(128, 128, 128, 0.25)'} 0px, ${isDarkMode ? 'rgba(128, 128, 128, 0.4)' : 'rgba(128, 128, 128, 0.25)'} 2px, ${isDarkMode ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.1)'} 2px, ${isDarkMode ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.1)'} 4px)`;
                textColor = colours.greyText;
              } else if (dayInfo.isWeekend || !isCurrentMonth) {
                bgColor = isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.03)';
              }

              return (
                <TooltipHost
                  key={idx}
                  content={
                    dayInfo.teamLeave.length > 0 
                      ? `Team off: ${dayInfo.teamLeave.join(', ')}`
                      : dayInfo.isBankHoliday 
                      ? 'Bank Holiday'
                      : dayInfo.isOwnLeave
                      ? 'Your existing leave'
                      : dayInfo.isSelected && dayInfo.leaveType
                      ? dayInfo.leaveType === 'standard' 
                        ? 'Standard leave (annual entitlement)'
                        : dayInfo.leaveType === 'purchase'
                        ? 'Purchase leave (buy extra days)'
                        : 'Sale leave (sell back for wages)'
                      : 'Left-click to select, right-click for type'
                  }
                  styles={{ root: { display: 'block' } }}
                >
                  <div
                    onClick={() => isSelectable && handleDayClick(dayInfo)}
                    onContextMenu={(e) => isSelectable && handleContextMenu(e, dayInfo)}
                    style={{
                      padding: '8px',
                      background: bgColor,
                      border: `1px solid ${isToday ? (isDarkMode ? colours.accent : colours.highlight) : borderColor}`,
                      borderRadius: 0,
                      textAlign: 'center',
                      cursor: isSelectable ? 'pointer' : 'default',
                      opacity: !isCurrentMonth ? 0.3 : isPast ? 0.4 : 1,
                      position: 'relative',
                      minHeight: '48px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: '0.1s'
                    }}
                    onMouseEnter={(e) => {
                      if (isSelectable && !dayInfo.isSelected) {
                        e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.1)';
                        e.currentTarget.style.borderColor = isDarkMode ? colours.accent : colours.highlight;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isSelectable && !dayInfo.isSelected) {
                        e.currentTarget.style.background = bgColor;
                        e.currentTarget.style.borderColor = borderColor;
                      }
                    }}
                  >
                    <div style={{
                      fontSize: '13px',
                      fontWeight: isToday ? 700 : dayInfo.isSelected ? 600 : 400,
                      color: textColor
                    }}>
                      {format(dayInfo.date, 'd')}
                    </div>
                    {dayInfo.teamLeave.length > 0 && (
                      <div style={{
                        fontSize: '9px',
                        color: dayInfo.isSelected 
                          ? (isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.85)')
                          : colours.highlight,
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600
                      }}>
                        {dayInfo.teamLeave.slice(0, 2).join(', ')}{dayInfo.teamLeave.length > 2 ? '...' : ''}
                      </div>
                    )}
                  </div>
                </TooltipHost>
              );
            })}
          </div>
        </div>

        {/* TOP RIGHT: Stats & User Leave Ledger */}
        <div className="cascade-item">
          {/* Legend & Instructions */}
          <div style={{
            marginBottom: '12px',
            padding: '10px 12px',
            background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(54, 144, 206, 0.2)'}`,
            borderRadius: 0
          }}>
            {/* Legend */}
            <div style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              fontSize: '10px',
              marginBottom: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: 10, height: 10, background: isDarkMode ? colours.highlight : colours.missedBlue, borderRadius: 0 }} />
                <span style={{ color: textMuted }}>Standard</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: 10, height: 10, background: isDarkMode ? colours.accent : colours.highlight, borderRadius: 0 }} />
                <span style={{ color: textMuted }}>Purchase</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: 10, height: 10, background: colours.green, borderRadius: 0 }} />
                <span style={{ color: textMuted }}>Sale</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: 10, height: 10, background: `repeating-linear-gradient(45deg, ${isDarkMode ? 'rgba(128, 128, 128, 0.4)' : 'rgba(128, 128, 128, 0.25)'} 0px, ${isDarkMode ? 'rgba(128, 128, 128, 0.4)' : 'rgba(128, 128, 128, 0.25)'} 2px, ${isDarkMode ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.1)'} 2px, ${isDarkMode ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.1)'} 4px)`, borderRadius: 0 }} />
                <span style={{ color: textMuted }}>Bank hol.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: 10, height: 10, background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)', borderRadius: 0, border: `1px solid ${colours.highlight}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon iconName="Contact" style={{ fontSize: '6px', color: colours.highlight }} />
                </div>
                <span style={{ color: textMuted }}>Team off</span>
              </div>
            </div>
            {/* Instructions */}
            <Text style={{ fontSize: '10px', color: textMuted, lineHeight: 1.4 }}>
              Click to select, click again to cycle type (Standard → Purchase → Sale → deselect). Right-click for quick type selection.
            </Text>
          </div>

          {/* Stats */}
          <div style={{
            padding: '1rem',
            paddingLeft: 'calc(1rem + 2px)',
            background: isNextYearOnly
              ? (isDarkMode ? 'rgba(88, 65, 18, 0.45)' : 'rgba(255, 248, 235, 0.95)')
              : (isDarkMode ? 'rgba(6, 23, 51, 0.4)' : 'rgba(255, 255, 255, 0.95)'),
            border: `1px solid ${isNextYearOnly
              ? (isDarkMode ? 'rgba(251, 191, 36, 0.35)' : 'rgba(245, 158, 11, 0.35)')
              : borderColor}`,
            borderLeft: 'none',
            boxShadow: isNextYearOnly
              ? `inset 3px 0 0 ${isDarkMode ? '#fbbf24' : '#f59e0b'}, ${isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.25)' : '0 2px 8px rgba(0, 0, 0, 0.08)'}`
              : `inset 3px 0 0 ${isDarkMode ? colours.accent : colours.highlight}, ${isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.06)'}`,
            marginBottom: '16px',
            position: 'relative',
            transition: 'opacity 0.2s ease'
          }}>
            {/* Loading overlay for stats */}
            {isStatsLoading && (
              <div 
                className="loading-overlay"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  zIndex: 5,
                  backdropFilter: 'blur(2px)'
                }}>
                <Spinner size={SpinnerSize.medium} />
                <span style={{ fontSize: '11px', color: textMuted }}>{loadingStage || (isBaseLoading ? 'Loading annual leave...' : 'Loading...')}</span>
              </div>
            )}
            {isNextYearOnly ? (
              <Stack tokens={{ childrenGap: 12 }}>
                <div>
                  <Text style={{ fontSize: '11px', color: isDarkMode ? '#fbbf24' : '#f59e0b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.6px' }}>
                    Next fiscal year
                  </Text>
                  <Text style={{ fontSize: '18px', fontWeight: 700, color: isDarkMode ? '#fbbf24' : '#f59e0b', display: 'block', lineHeight: 1.3 }}>
                    {nextFiscalYearLabel}
                  </Text>
                  <Text style={{ fontSize: '10px', color: textMuted, marginTop: '2px' }}>
                    After {fiscalYearInfo.currentFiscalEnd}. This request uses next year's allowance.
                  </Text>
                </div>
                <div style={{ height: '1px', background: `linear-gradient(90deg, ${isDarkMode ? '#fbbf24' : '#f59e0b'} 0%, transparent 100%)` }} />
                <div>
                  <Text style={{ fontSize: '11px', color: isDarkMode ? '#fbbf24' : '#f59e0b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                    Days Requested
                  </Text>
                  <Text style={{ fontSize: '28px', fontWeight: 700, color: isDarkMode ? '#fbbf24' : '#f59e0b', display: 'block', lineHeight: 1.2 }}>
                    {totalDays}
                  </Text>
                  {dateRanges.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {dateRanges.map((range, idx) => {
                        const typeColor = range.leaveType === 'purchase' ? (isDarkMode ? colours.accent : colours.highlight) : range.leaveType === 'sale' ? colours.green : textMuted;
                        return (
                          <span key={idx} style={{ fontSize: '10px', color: typeColor, fontWeight: 500 }}>
                            {format(new Date(range.startDate), 'd MMM')}
                            {range.startDate !== range.endDate && `-${format(new Date(range.endDate), 'd MMM')}`}
                            {idx < dateRanges.length - 1 && ','}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={{ height: '1px', background: `linear-gradient(90deg, ${borderColor} 0%, transparent 100%)` }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ 
                    fontSize: '11px', 
                    color: textMuted,
                    borderBottom: `1px solid ${isDarkMode ? '#fbbf24' : '#f59e0b'}`,
                    paddingBottom: '2px'
                  }}>Standard Entitlement (next year)</Text>
                  <Text style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? '#fbbf24' : '#f59e0b' }}>{entitlement}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: '11px', color: textMuted }}>Planned usage</Text>
                  <Text style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? '#fbbf24' : '#f59e0b' }}>{daysByType.standard}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: '11px', color: textMuted }}>Remaining (next year)</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {daysByType.standard > 0 && (
                      <>
                        <Text style={{ fontSize: '12px', color: textMuted }}>{entitlement}</Text>
                        <Text style={{ fontSize: '11px', color: colours.cta }}>− {daysByType.standard}</Text>
                        <Text style={{ fontSize: '11px', color: textMuted }}>=</Text>
                      </>
                    )}
                    <Text style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: (entitlement - daysByType.standard) < 0 ? colours.cta : (entitlement - daysByType.standard) < 5 ? colours.cta : colours.green
                    }}>
                      {entitlement - daysByType.standard}
                    </Text>
                  </div>
                </div>
                <div style={{ height: '1px', background: `linear-gradient(90deg, ${borderColor} 0%, transparent 100%)`, margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ 
                    fontSize: '11px', 
                    color: textMuted,
                    borderBottom: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                    paddingBottom: '2px'
                  }}>Purchase Allowance (next year)</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {daysByType.purchase > 0 && (
                      <>
                        <Text style={{ fontSize: '12px', color: textMuted }}>{purchaseAllowance}</Text>
                        <Text style={{ fontSize: '11px', color: colours.cta }}>− {daysByType.purchase}</Text>
                        <Text style={{ fontSize: '11px', color: textMuted }}>=</Text>
                      </>
                    )}
                    <Text style={{ 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: (purchaseAllowance - daysByType.purchase) < 0 ? colours.cta : (purchaseAllowance - daysByType.purchase) < purchaseAllowance ? colours.cta : colours.green
                    }}>{purchaseAllowance - daysByType.purchase}</Text>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ 
                    fontSize: '11px', 
                    color: textMuted,
                    borderBottom: `1px solid ${colours.green}`,
                    paddingBottom: '2px'
                  }}>Sale Allowance (next year)</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {daysByType.sale > 0 && (
                      <>
                        <Text style={{ fontSize: '12px', color: textMuted }}>{saleAllowance}</Text>
                        <Text style={{ fontSize: '11px', color: colours.cta }}>− {daysByType.sale}</Text>
                        <Text style={{ fontSize: '11px', color: textMuted }}>=</Text>
                      </>
                    )}
                    <Text style={{ 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: (saleAllowance - daysByType.sale) < 0 ? colours.cta : (saleAllowance - daysByType.sale) < saleAllowance ? colours.cta : colours.green
                    }}>{saleAllowance - daysByType.sale}</Text>
                  </div>
                </div>
                <div style={{ marginTop: '4px', fontSize: '10px', color: textMuted }}>
                  Current year used: {used} (not affected)
                </div>
              </Stack>
            ) : (
              <Stack tokens={{ childrenGap: 12 }}>
                <div>
                  <Text style={{ fontSize: '11px', color: isDarkMode ? colours.accent : colours.highlight, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                    Days Requested
                  </Text>
                  <Text style={{ fontSize: '28px', fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight, display: 'block', lineHeight: 1.2 }}>
                    {totalDays}
                  </Text>
                  {dateRanges.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {dateRanges.map((range, idx) => {
                        const typeColor = range.leaveType === 'purchase' ? (isDarkMode ? colours.accent : colours.highlight) : range.leaveType === 'sale' ? colours.green : textMuted;
                        return (
                          <span key={idx} style={{ fontSize: '10px', color: typeColor, fontWeight: 500 }}>
                            {format(new Date(range.startDate), 'd MMM')}
                            {range.startDate !== range.endDate && `-${format(new Date(range.endDate), 'd MMM')}`}
                            {idx < dateRanges.length - 1 && ','}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {(daysByType.purchase > 0 || daysByType.sale > 0) && (
                    <div style={{ fontSize: '11px', marginTop: '4px', color: textMuted }}>
                      {daysByType.standard > 0 && <div>{daysByType.standard} standard</div>}
                      {daysByType.purchase > 0 && <div style={{ color: isDarkMode ? colours.accent : colours.highlight }}>{daysByType.purchase} purchase</div>}
                      {daysByType.sale > 0 && <div style={{ color: colours.green }}>{daysByType.sale} sale</div>}
                    </div>
                  )}
                </div>
                <div style={{ height: '1px', background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.highlight} 0%, transparent 100%)` }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ 
                    fontSize: '11px', 
                    color: textMuted,
                    borderBottom: `1px solid ${isDarkMode ? colours.highlight : colours.missedBlue}`,
                    paddingBottom: '2px'
                  }}>Standard Entitlement</Text>
                  <Text style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight }}>{entitlement}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: '11px', color: textMuted }}>Used</Text>
                  <Text style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight }}>{used}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: '11px', color: textMuted }}>Remaining</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {daysByType.standard > 0 && (
                      <>
                        <Text style={{ fontSize: '12px', color: textMuted }}>{entitlement - used}</Text>
                        <Text style={{ fontSize: '11px', color: colours.cta }}>− {daysByType.standard}</Text>
                        <Text style={{ fontSize: '11px', color: textMuted }}>=</Text>
                      </>
                    )}
                    <Text style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: standardRemaining < 0 ? colours.cta : standardRemaining < 5 ? colours.cta : colours.green
                    }}>
                      {standardRemaining}
                    </Text>
                  </div>
                </div>
                <div style={{ height: '1px', background: `linear-gradient(90deg, ${borderColor} 0%, transparent 100%)`, margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ 
                    fontSize: '11px', 
                    color: textMuted,
                    borderBottom: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                    paddingBottom: '2px'
                  }}>Purchase Allowance</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {daysByType.purchase > 0 && (
                      <>
                        <Text style={{ fontSize: '12px', color: textMuted }}>{purchaseAllowance}</Text>
                        <Text style={{ fontSize: '11px', color: colours.cta }}>− {daysByType.purchase}</Text>
                        <Text style={{ fontSize: '11px', color: textMuted }}>=</Text>
                      </>
                    )}
                    <Text style={{ 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: purchaseRemaining < 0 ? colours.cta : purchaseRemaining < purchaseAllowance ? colours.cta : colours.green
                    }}>{daysByType.purchase > 0 ? purchaseRemaining : purchaseAllowance}</Text>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ 
                    fontSize: '11px', 
                    color: textMuted,
                    borderBottom: `1px solid ${colours.green}`,
                    paddingBottom: '2px'
                  }}>Sale Allowance</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {daysByType.sale > 0 && (
                      <>
                        <Text style={{ fontSize: '12px', color: textMuted }}>{saleAllowance}</Text>
                        <Text style={{ fontSize: '11px', color: colours.cta }}>− {daysByType.sale}</Text>
                        <Text style={{ fontSize: '11px', color: textMuted }}>=</Text>
                      </>
                    )}
                    <Text style={{ 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: saleRemaining < 0 ? colours.cta : saleRemaining < saleAllowance ? colours.cta : colours.green
                    }}>{daysByType.sale > 0 ? saleRemaining : saleAllowance}</Text>
                  </div>
                </div>
                {standardRemaining <= 0 && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px', 
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.05)', 
                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
                    borderRadius: '2px'
                  }}>
                    <Text style={{ fontSize: '10px', color: textMuted, lineHeight: 1.4 }}>
                      Purchase & Sale options unlocked when no leave remaining
                    </Text>
                  </div>
                )}
                
                {/* Fiscal Year Warning */}
                {(fiscalYearInfo.nextYear || fiscalYearInfo.spansMultiple) && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: isDarkMode ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.06)',
                    border: `1px solid ${isDarkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.25)'}`,
                    borderLeft: `3px solid ${isDarkMode ? '#fbbf24' : '#f59e0b'}`,
                    borderRadius: 0
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <Icon 
                        iconName="Warning" 
                        style={{ 
                          color: isDarkMode ? '#fbbf24' : '#f59e0b',
                          fontSize: '12px',
                          marginTop: '1px',
                          flexShrink: 0
                        }} 
                      />
                      <div>
                        <Text style={{ 
                          fontSize: '10px', 
                          fontWeight: 600,
                          color: isDarkMode ? '#fbbf24' : '#f59e0b',
                          display: 'block',
                          marginBottom: '2px'
                        }}>
                          {fiscalYearInfo.spansMultiple 
                            ? 'Spans multiple fiscal years'
                            : 'Next fiscal year'}
                        </Text>
                        <Text style={{ 
                          fontSize: '9px', 
                          color: textMuted,
                          lineHeight: '1.3'
                        }}>
                          {fiscalYearInfo.spansMultiple 
                            ? `Some dates after ${fiscalYearInfo.currentFiscalEnd}. Next year's allowance assessed separately.`
                            : `After ${fiscalYearInfo.currentFiscalEnd}. Uses next year's allowance.`
                          }
                        </Text>
                      </div>
                    </div>
                  </div>
                )}
              </Stack>
            )}
          </div>

          {/* User Leave Ledger */}
          {effectiveFutureLeave.filter(leave => leave.person === userInitials).length > 0 && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: isDarkMode ? 'rgba(13, 47, 96, 0.2)' : 'rgba(54, 144, 206, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
              borderRadius: 0
            }}>
              <Text style={{ fontSize: '11px', color: colours.accent, textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px', display: 'block', letterSpacing: '0.5px' }}>
                Your Upcoming Leave
              </Text>
              <Stack tokens={{ childrenGap: 6 }}>
                {effectiveFutureLeave
                  .filter(leave => leave.person === userInitials)
                  .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                  .map((leave, idx) => {
                    const statusColor = leave.status === 'Approved' ? colours.green : leave.status === 'Rejected' ? colours.cta : colours.orange;
                    const leaveTypeColor = leave.leave_type === 'purchase' ? (isDarkMode ? colours.accent : colours.highlight) : leave.leave_type === 'sale' ? colours.green : textPrimary;
                    
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: '12px', color: textPrimary }}>
                          {format(new Date(leave.start_date), 'd MMM')}
                          {leave.start_date !== leave.end_date && ` - ${format(new Date(leave.end_date), 'd MMM')}`}
                          {leave.leave_type && leave.leave_type !== 'standard' && (
                            <span style={{ color: leaveTypeColor, marginLeft: '6px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>({leave.leave_type})</span>
                          )}
                        </Text>
                        <Text style={{ fontSize: '11px', color: statusColor, fontWeight: 600 }}>
                          {leave.status}
                        </Text>
                      </div>
                    );
                  })}
              </Stack>
            </div>
          )}
        </div>
      </div>

      {/* FULL WIDTH: Hearing Confirmation, Notes & Actions */}
      <div className="cascade-item" style={{
        marginTop: '16px',
        padding: '12px',
        background: isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
        border: `1px solid ${borderColor}`,
        borderRadius: 0
      }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* Hearing Confirmation */}
          <div style={{ flex: '0 0 auto' }}>
            <Text style={{ fontSize: '11px', color: textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
              Any hearings during this period?
            </Text>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div 
                onClick={() => setHearingConfirmation('yes')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  padding: '0 10px',
                  height: '32px',
                  background: hearingConfirmation === 'yes' ? (isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)') : 'transparent',
                  border: `1px solid ${hearingConfirmation === 'yes' ? colours.green : borderColor}`,
                  transition: '0.1s'
                }}
              >
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: `2px solid ${hearingConfirmation === 'yes' ? colours.green : borderColor}`,
                  background: hearingConfirmation === 'yes' ? colours.green : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {hearingConfirmation === 'yes' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffffff' }} />}
                </div>
                <Text style={{ fontSize: '12px', color: textPrimary, fontWeight: hearingConfirmation === 'yes' ? 600 : 400 }}>
                  No hearings
                </Text>
              </div>
              
              <div 
                onClick={() => setHearingConfirmation('no')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  padding: '0 10px',
                  height: '32px',
                  background: hearingConfirmation === 'no' ? (isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.1)') : 'transparent',
                  border: `1px solid ${hearingConfirmation === 'no' ? colours.cta : borderColor}`,
                  transition: '0.1s'
                }}
              >
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: `2px solid ${hearingConfirmation === 'no' ? colours.cta : borderColor}`,
                  background: hearingConfirmation === 'no' ? colours.cta : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {hearingConfirmation === 'no' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffffff' }} />}
                </div>
                <Text style={{ fontSize: '12px', color: textPrimary, fontWeight: hearingConfirmation === 'no' ? 600 : 400 }}>
                  Hearings need cover
                </Text>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ flex: '1 1 200px' }}>
            <Text style={{ fontSize: '11px', color: textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
              Notes
            </Text>
            <TextField
              placeholder="Reason for leave (optional)..."
              value={notes}
              onChange={(_, value) => setNotes(value || '')}
              styles={{
                fieldGroup: {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                  borderColor: borderColor,
                  borderRadius: 0,
                  height: '32px'
                }
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ flex: '0 0 auto', display: 'flex', gap: '8px' }}>
            <DefaultButton
              text={isSubmitting ? 'Submitting...' : 'Submit Request'}
              onClick={handleSubmit}
              disabled={isSubmitting || selectedDates.size === 0 || standardRemaining < 0 || purchaseRemaining < 0 || saleRemaining < 0}
              styles={{
                root: {
                  height: '32px',
                  minWidth: '110px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '0 14px',
                  backgroundColor: isDarkMode 
                    ? 'rgba(135, 243, 243, 0.1)' 
                    : colours.highlight,
                  color: isDarkMode ? colours.accent : '#ffffff',
                  border: isDarkMode ? `1px solid ${colours.accent}` : 'none',
                  borderRadius: 0,
                  transition: 'all 0.2s ease',
                },
                rootHovered: {
                  backgroundColor: isDarkMode 
                    ? 'rgba(135, 243, 243, 0.15)' 
                    : colours.highlight,
                  color: isDarkMode ? colours.accent : '#ffffff',
                  opacity: isDarkMode ? 1 : 0.85,
                },
                rootDisabled: {
                  backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : textMuted,
                  border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.2)' : 'none',
                },
              }}
              iconProps={isSubmitting ? undefined : { iconName: 'Send' }}
            >
              {isSubmitting && <Spinner size={SpinnerSize.xSmall} style={{ marginRight: '8px' }} />}
            </DefaultButton>
            <DefaultButton
              text="Clear"
              onClick={handleClear}
              disabled={isSubmitting || selectedDates.size === 0}
              styles={{
                root: {
                  height: '32px',
                  minWidth: '60px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '0 12px',
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  color: textMuted,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 0,
                  transition: 'all 0.2s ease',
                },
                rootHovered: {
                  backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : bgHover,
                },
                rootDisabled: {
                  opacity: 0.3,
                },
              }}
            />
          </div>
        </div>
        
        {/* Hearing Details - full width row when needed */}
        {hearingConfirmation === 'no' && (
          <div style={{ marginTop: '12px' }}>
            <Text style={{ fontSize: '11px', color: textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
              Hearing Details
            </Text>
            <TextField
              placeholder="Dates, cases, cover required..."
              value={hearingDetails}
              onChange={(_, value) => setHearingDetails(value || '')}
              styles={{
                fieldGroup: {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                  borderColor: colours.cta,
                  borderRadius: 0,
                  height: '32px'
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="cascade-item" style={{ 
        height: '1px', 
        background: `linear-gradient(90deg, ${isDarkMode ? colours.accent : colours.highlight} 0%, transparent 100%)`,
        marginTop: '20px',
        marginBottom: '16px'
      }} />

      {/* LEAVE HISTORY */}
      <div className="cascade-item">
          {/* Leave History Ledger */}
          <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: textPrimary,
                textTransform: 'uppercase',
                letterSpacing: '0.6px'
              }}>
                Leave history
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: textMuted,
                  padding: '2px 6px',
                  borderRadius: 3,
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)'}`,
                  background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.04)'
                }}>
                  {isHistoryLoading ? (
                    <span style={{ display: 'inline-block', width: '26px', height: '8px', borderRadius: 2, background: skeletonStrong }} />
                  ) : (
                    `${leaveHistoryData.length} total`
                  )}
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: textMuted,
                  padding: '2px 6px',
                  borderRadius: 3,
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
                  background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'
                }}>
                  {isHistoryLoading ? (
                    <span style={{ display: 'inline-block', width: '32px', height: '8px', borderRadius: 2, background: skeletonBase }} />
                  ) : (
                    `${filteredLeaveHistory.length} ${isAdmin && selectedEmployee ? `for ${selectedEmployee}` : 'yours'}`
                  )}
                </span>
                {(isHistoryLoading || isLoadingEmployeeData) && (
                  <Spinner size={SpinnerSize.xSmall} />
                )}
                {isAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Checkbox
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      styles={{
                        root: { margin: 0 },
                        checkbox: {
                          width: 14,
                          height: 14,
                          borderRadius: 0,
                          borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(15, 23, 42, 0.25)',
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.04)'
                        },
                        checkmark: { fontSize: '10px', color: textPrimary }
                      }}
                    />
                    <span style={{ fontSize: '10px', color: textMuted }}>Select all</span>
                  </div>
                )}
              </div>
            </div>
            {isAdmin && selectedEmployee && (
              <DefaultButton
                text={isLoadingEmployeeData ? 'Refreshing' : 'Refresh'}
                iconProps={{ iconName: 'Refresh' }}
                onClick={refreshEmployeeData}
                disabled={isLoadingEmployeeData}
                styles={{
                  root: {
                    height: '26px',
                    minWidth: '80px',
                    fontSize: '10px',
                    background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)'}`,
                    borderRadius: 3
                  },
                  label: { fontSize: '10px' },
                  icon: { fontSize: '12px', color: textMuted }
                }}
              />
            )}
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            position: 'relative'
          }}>
              {isAdmin && selectedRecordIds.size > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '8px 10px',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.12)'}`,
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.04)'
                }}>
                  <Text style={{ fontSize: '11px', color: textMuted }}>
                    {selectedRecordIds.size} selected
                  </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <DefaultButton
                      text="Clear"
                      onClick={() => setSelectedRecordIds(new Set())}
                      styles={{
                        root: {
                          height: '26px',
                          minWidth: '70px',
                          fontSize: '10px',
                          background: 'transparent',
                          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                          borderRadius: 0
                        },
                        label: { fontSize: '10px' }
                      }}
                    />
                    <DefaultButton
                      text="Update selected"
                      onClick={() => setShowBulkDialog(true)}
                      styles={{
                        root: {
                          height: '26px',
                          minWidth: '120px',
                          fontSize: '10px',
                          background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.12)',
                          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
                          borderRadius: 0
                        },
                        label: { fontSize: '10px', color: isDarkMode ? '#f8fafc' : colours.highlight }
                      }}
                    />
                  </div>
                </div>
              )}
              {/* Loading overlay for leave history */}
              {isLoadingEmployeeData && isAdmin && selectedEmployee && (
                <div 
                  className="loading-overlay"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    minHeight: '80px',
                  background: isDarkMode ? 'rgba(6, 23, 51, 0.9)' : 'rgba(255, 255, 255, 0.92)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  zIndex: 5,
                  backdropFilter: 'blur(2px)',
                  borderRadius: '2px'
                }}>
                  <Spinner size={SpinnerSize.small} />
                  <span style={{ fontSize: '11px', color: textMuted }}>{loadingStage || 'Loading history...'}</span>
                </div>
              )}
              {/* Loading skeletons */}
              {isHistoryLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={`history-skeleton-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
                      }}
                    >
                      <div style={{ width: '3px', height: '28px', background: skeletonStrong }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ width: '120px', height: '10px', borderRadius: 2, background: skeletonStrong, marginBottom: '6px' }} />
                        <div style={{ width: '80%', height: '8px', borderRadius: 2, background: skeletonBase }} />
                      </div>
                      <div style={{ width: '26px', height: '14px', borderRadius: 3, background: skeletonBase }} />
                      <div style={{ width: '50px', height: '14px', borderRadius: 3, background: skeletonStrong }} />
                    </div>
                  ))}
                </div>
              )}
              {/* Empty state */}
              {!isHistoryLoading && filteredLeaveHistory.length === 0 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  color: textMuted,
                  fontSize: '12px',
                  gap: '8px',
                  background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
                }}>
                  <span>{isAdmin && selectedEmployee ? `No leave records found for ${selectedEmployee}` : 'No leave records found'}</span>
                  {isAdmin && selectedEmployee && (
                    <DefaultButton
                      text="Retry"
                      iconProps={{ iconName: 'Refresh' }}
                      onClick={refreshEmployeeData}
                      styles={{
                        root: { height: '28px', minWidth: '80px' },
                        label: { fontSize: '11px' }
                      }}
                    />
                  )}
                </div>
              )}
              {/* Records list */}
              {!isHistoryLoading && filteredLeaveHistory
                .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
                .map((record, idx) => {
                  const leaveTypeColor = 
                    record.leave_type === 'purchase' ? (isDarkMode ? colours.accent : colours.highlight) :
                    record.leave_type === 'sale' ? colours.green :
                    (isDarkMode ? colours.highlight : colours.missedBlue);
                  
                  const statusColor = 
                    record.status === 'approved' ? colours.green :
                    record.status === 'rejected' ? colours.red :
                    (isDarkMode ? colours.accent : colours.highlight);
                  const statusBackground = record.status === 'rejected'
                    ? (isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 113, 113, 0.08)')
                    : record.status === 'approved'
                      ? (isDarkMode ? 'rgba(74, 222, 128, 0.12)' : 'rgba(74, 222, 128, 0.08)')
                      : (isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.04)');
                  const statusBorder = record.status === 'rejected'
                    ? (isDarkMode ? 'rgba(248, 113, 113, 0.35)' : 'rgba(248, 113, 113, 0.25)')
                    : record.status === 'approved'
                      ? (isDarkMode ? 'rgba(74, 222, 128, 0.35)' : 'rgba(74, 222, 128, 0.25)')
                      : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(15, 23, 42, 0.12)');

                  const startDate = new Date(record.start_date);
                  const endDate = new Date(record.end_date);
                  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                  const formatStamp = (value?: string) => {
                    if (!value) return null;
                    const stampDate = new Date(value);
                    if (Number.isNaN(stampDate.getTime())) return null;
                    return format(stampDate, 'd MMM yyyy · HH:mm');
                  };

                  const stamps = [
                    { label: 'Requested', value: formatStamp(record.requested_at) },
                    { label: 'Approved', value: formatStamp(record.approved_at) },
                    { label: 'Booked', value: formatStamp(record.booked_at) }
                  ].filter((stamp) => Boolean(stamp.value));

                  const recordId = String(record.id ?? record.request_id ?? idx);

                  return (
                    <div
                      key={record.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        fontSize: '11px',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
                      }}
                    >
                      {isAdmin && (
                        <Checkbox
                          checked={selectedRecordIds.has(recordId)}
                          onChange={() => toggleRecordSelection(recordId)}
                          styles={{
                            root: { margin: 0 },
                            checkbox: {
                              width: 14,
                              height: 14,
                              borderRadius: 0,
                              borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(15, 23, 42, 0.25)',
                              background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.04)'
                            },
                            checkmark: { fontSize: '10px', color: textPrimary }
                          }}
                        />
                      )}

                      {/* Type indicator */}
                      <div style={{
                        width: '3px',
                        height: '28px',
                        background: leaveTypeColor,
                        flexShrink: 0
                      }} />

                      {/* Date range */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: textPrimary,
                          marginBottom: '2px'
                        }}>
                          {format(startDate, 'd MMM yyyy')} - {format(endDate, 'd MMM yyyy')}
                        </div>
                        {record.reason && (
                          <div style={{
                            fontSize: '10px',
                            color: textMuted,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {record.reason}
                          </div>
                        )}
                        {stamps.length > 0 && (
                          <div style={{
                            fontSize: '9px',
                            color: textMuted,
                            marginTop: '4px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px'
                          }}>
                            {stamps.map((stamp, stampIdx) => (
                              <span key={`${record.id || idx}-stamp-${stampIdx}`}>
                                {stamp.label} · {stamp.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Days count */}
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: textMuted,
                        padding: '2px 6px',
                        background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        borderRadius: 3,
                        flexShrink: 0
                      }}>
                        {record.days_taken || daysDiff}d
                      </div>

                      {/* Status chip */}
                      <div style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        color: statusColor,
                        padding: '3px 6px',
                        border: `1px solid ${statusBorder}`,
                        borderRadius: 0,
                        letterSpacing: '0.3px',
                        background: statusBackground,
                        flexShrink: 0
                      }}>
                        {record.status}
                      </div>

                      {/* Admin Actions */}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <TooltipHost content="Edit record">
                            <IconButton
                              iconProps={{ iconName: 'Edit', style: { fontSize: '11px' } }}
                              onClick={() => {
                                setEditingRecord(record);
                                setEditDays(String(record.days_taken || daysDiff));
                                setEditStatus(record.status);
                              }}
                              styles={{
                                root: {
                                  width: 22,
                                  height: 22,
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.04)',
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(15, 23, 42, 0.12)'}`,
                                  borderRadius: 0,
                                  transition: 'background 0.15s, border-color 0.15s, color 0.15s'
                                },
                                rootHovered: {
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)',
                                  borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(15, 23, 42, 0.2)'
                                },
                                icon: { color: textMuted }
                              }}
                            />
                          </TooltipHost>
                          <TooltipHost content="Delete record">
                            <IconButton
                              iconProps={{ iconName: 'Delete', style: { fontSize: '11px' } }}
                              onClick={() => {
                                setDeleteOutcome(null);
                                setDeleteTarget(record);
                              }}
                              styles={{
                                root: {
                                  width: 22,
                                  height: 22,
                                  background: isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 113, 113, 0.08)',
                                  border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.35)' : 'rgba(248, 113, 113, 0.25)'}`,
                                  borderRadius: 0,
                                  transition: 'background 0.15s, border-color 0.15s, color 0.15s'
                                },
                                rootHovered: {
                                  background: isDarkMode ? 'rgba(248, 113, 113, 0.2)' : 'rgba(248, 113, 113, 0.14)',
                                  borderColor: isDarkMode ? 'rgba(248, 113, 113, 0.5)' : 'rgba(248, 113, 113, 0.4)'
                                },
                                icon: { color: colours.red }
                              }}
                            />
                          </TooltipHost>
                        </div>
                      )}
                    </div>
                  );
                })}
              {!isHistoryLoading && filteredLeaveHistory.length === 0 && (
                <div style={{
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: textMuted,
                  fontStyle: 'italic'
                }}>
                  No leave history found
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Context Menu for Leave Type Selection */}
      {contextMenu && (
        <>
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              zIndex: 9998 
            }} 
            onClick={() => setContextMenu(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              background: isDarkMode ? 'rgba(30, 41, 59, 0.98)' : '#ffffff',
              border: `1px solid ${borderColor}`,
              boxShadow: isDarkMode ? '0 4px 16px rgba(0, 0, 0, 0.5)' : '0 4px 16px rgba(0, 0, 0, 0.15)',
              zIndex: 9999,
              minWidth: '280px',
              padding: '8px 0'
            }}
          >
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${borderColor}` }}>
              <Text style={{ fontSize: '11px', color: textMuted, textTransform: 'uppercase', fontWeight: 700 }}>
                Select Leave Type
              </Text>
            </div>
            {[
              { type: 'standard' as const, label: 'Standard Leave', desc: 'Your annual entitlement', color: isDarkMode ? colours.highlight : colours.missedBlue },
              { type: 'purchase' as const, label: 'Purchase Leave', desc: 'Buy extra days (deducted from wages)', color: isDarkMode ? colours.accent : colours.highlight },
              { type: 'sale' as const, label: 'Sale Leave', desc: 'Sell unused days back for wages', color: colours.green }
            ].map(option => {
              const isSelected = selectedDates.get(contextMenu.dateStr) === option.type;
              return (
                <div
                  key={option.type}
                  onClick={() => handleSetLeaveType(option.type)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: isSelected ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.08)') : 'transparent',
                    borderLeft: isSelected ? `3px solid ${option.color}` : '3px solid transparent',
                    transition: '0.1s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <div style={{ width: 10, height: 10, background: option.color, borderRadius: 0 }} />
                    <Text style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 600, color: textPrimary }}>
                      {option.label}
                    </Text>
                    {isSelected && <Icon iconName="CheckMark" style={{ fontSize: '10px', color: option.color, marginLeft: 'auto' }} />}
                  </div>
                  <Text style={{ fontSize: '11px', color: textMuted, marginLeft: '18px' }}>
                    {option.desc}
                  </Text>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Admin Delete Confirmation Dialog */}
      {isAdmin && (
        <Dialog
          hidden={!deleteTarget}
          onDismiss={() => {
            if (isDeleting) return;
            setDeleteOutcome(null);
            setDeleteTarget(null);
          }}
          dialogContentProps={{
            type: DialogType.normal,
            title: '',
            showCloseButton: false
          }}
          modalProps={{ 
            isBlocking: isDeleting,
            styles: {
              main: {
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(10, 16, 30, 0.98) 0%, rgba(18, 26, 42, 0.95) 100%)'
                  : 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.15)'}`,
                borderRadius: '2px',
                boxShadow: isDarkMode 
                  ? '0 4px 20px rgba(0,0,0,0.35), 0 1px 6px rgba(0,0,0,0.2)'
                  : '0 4px 20px rgba(0,0,0,0.06), 0 1px 6px rgba(0,0,0,0.03)',
                minWidth: '380px',
                maxWidth: '420px'
              }
            }
          }}
        >
          {deleteTarget && (
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <Text style={{ 
                  fontSize: '18px', 
                  fontWeight: 600, 
                  color: textPrimary,
                  display: 'block',
                  marginBottom: '4px'
                }}>
                  Delete Leave Record
                </Text>
                <Text style={{ 
                  fontSize: '13px', 
                  color: textMuted,
                  display: 'block'
                }}>
                  {deleteTarget.person} · {format(new Date(deleteTarget.start_date), 'd MMM yyyy')}
                  {deleteTarget.start_date !== deleteTarget.end_date && ` – ${format(new Date(deleteTarget.end_date), 'd MMM yyyy')}`}
                </Text>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Text style={{ fontSize: '12px', color: textMuted }}>
                  Are you sure you want to delete this leave record?
                </Text>
                <Text style={{ fontSize: '11px', color: textMuted }}>
                  This will remove the entry from SQL, clear any Clio calendar item, and delete the Outlook calendar entry if one exists.
                </Text>
              </div>
              <div style={{
                marginTop: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                {[
                  {
                    label: 'SQL record',
                    value: deleteOutcome ? (deleteOutcome.sqlDeleted ? 'Cleared' : 'Failed') : (isDeleting ? 'Processing' : 'Pending')
                  },
                  {
                    label: 'Clio calendar',
                    value: deleteOutcome
                      ? (deleteOutcome.clioDeleted === null ? 'Not linked' : deleteOutcome.clioDeleted ? 'Cleared' : 'Failed')
                      : (isDeleting ? 'Processing' : 'Pending')
                  },
                  {
                    label: 'Outlook calendar',
                    value: deleteOutcome
                      ? (deleteOutcome.outlookDeleted === true
                        ? (deleteOutcome.outlookMatched ? 'Cleared' : 'Cleared')
                        : deleteOutcome.outlookMatched === false
                          ? 'Not found'
                          : deleteOutcome.outlookDeleted === false
                            ? 'Failed'
                            : 'Not verified')
                      : (isDeleting ? 'Processing' : 'Pending')
                  }
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: '11px', color: textMuted }}>{row.label}</Text>
                    <div style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: row.value === 'Cleared' ? colours.green : row.value === 'Failed' ? colours.red : textMuted,
                      padding: '2px 6px',
                      borderRadius: 0,
                      border: `1px solid ${row.value === 'Cleared'
                        ? (isDarkMode ? 'rgba(74, 222, 128, 0.35)' : 'rgba(74, 222, 128, 0.25)')
                        : row.value === 'Failed'
                          ? (isDarkMode ? 'rgba(248, 113, 113, 0.35)' : 'rgba(248, 113, 113, 0.25)')
                          : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(15, 23, 42, 0.12)')}`,
                      background: row.value === 'Cleared'
                        ? (isDarkMode ? 'rgba(74, 222, 128, 0.12)' : 'rgba(74, 222, 128, 0.08)')
                        : row.value === 'Failed'
                          ? (isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 113, 113, 0.08)')
                          : (isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.04)')
                    }}>
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '10px', 
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`
              }}>
                <DefaultButton
                  text={deleteOutcome ? 'Close' : 'Cancel'}
                  onClick={() => {
                    setDeleteOutcome(null);
                    setDeleteTarget(null);
                  }}
                  disabled={isDeleting}
                  styles={{
                    root: {
                      background: 'transparent',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                      borderRadius: '2px',
                      minWidth: '80px'
                    },
                    rootHovered: {
                      background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`
                    },
                    label: {
                      color: textPrimary,
                      fontWeight: 500,
                      fontSize: '13px'
                    }
                  }}
                />
                <PrimaryButton
                  text={isDeleting ? 'Deleting...' : 'Delete'}
                  onClick={() => deleteTarget && handleDeleteLeave(deleteTarget)}
                  disabled={isDeleting || Boolean(deleteOutcome?.success)}
                  styles={{
                    root: {
                      background: colours.red,
                      border: 'none',
                      borderRadius: '2px',
                      minWidth: '80px'
                    },
                    rootHovered: {
                      background: '#b91c1c'
                    },
                    label: {
                      fontWeight: 600,
                      fontSize: '13px'
                    }
                  }}
                />
              </div>
            </div>
          )}
        </Dialog>
      )}

      {/* Admin Edit Dialog */}
      {isAdmin && editingRecord && (
        <Dialog
          hidden={!editingRecord}
          onDismiss={() => !isEditing && setEditingRecord(null)}
          dialogContentProps={{
            type: DialogType.normal,
            title: '',
            showCloseButton: false
          }}
          modalProps={{ 
            isBlocking: isEditing,
            styles: {
              main: {
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(10, 16, 30, 0.98) 0%, rgba(18, 26, 42, 0.95) 100%)'
                  : 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.15)'}`,
                borderRadius: '2px',
                boxShadow: isDarkMode 
                  ? '0 4px 20px rgba(0,0,0,0.35), 0 1px 6px rgba(0,0,0,0.2)'
                  : '0 4px 20px rgba(0,0,0,0.06), 0 1px 6px rgba(0,0,0,0.03)',
                minWidth: '380px',
                maxWidth: '420px'
              }
            }
          }}
        >
          <div style={{ padding: '20px 24px' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
              <Text style={{ 
                fontSize: '18px', 
                fontWeight: 600, 
                color: textPrimary,
                display: 'block',
                marginBottom: '4px'
              }}>
                Edit Leave Record
              </Text>
              <Text style={{ 
                fontSize: '13px', 
                color: textMuted,
                display: 'block'
              }}>
                {editingRecord.person} · {format(new Date(editingRecord.start_date), 'd MMM yyyy')}
                {editingRecord.start_date !== editingRecord.end_date && ` – ${format(new Date(editingRecord.end_date), 'd MMM yyyy')}`}
              </Text>
            </div>

            {/* Form Fields */}
            <Stack tokens={{ childrenGap: 16 }}>
              {/* Status Field */}
              <div>
                <Text style={{ 
                  fontSize: '11px', 
                  fontWeight: 600, 
                  color: textMuted, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Status
                </Text>
                <Dropdown
                  selectedKey={editStatus}
                  onChange={(_, option) => setEditStatus(option?.key as string)}
                  options={[
                    { key: 'requested', text: 'Requested' },
                    { key: 'approved', text: 'Approved' },
                    { key: 'booked', text: 'Booked' },
                    { key: 'rejected', text: 'Rejected' },
                    { key: 'acknowledged', text: 'Acknowledged' },
                    { key: 'discarded', text: 'Discarded' }
                  ]}
                  styles={{
                    dropdown: {
                      background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                      borderRadius: '2px',
                      selectors: {
                        ':hover': {
                          borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.4)'
                        }
                      }
                    },
                    title: {
                      background: 'transparent',
                      color: textPrimary,
                      border: 'none',
                      borderRadius: '2px',
                      fontSize: '13px'
                    },
                    caretDown: {
                      color: textMuted
                    }
                  }}
                />
              </div>

              {/* Days Taken Field */}
              <div>
                <Text style={{ 
                  fontSize: '11px', 
                  fontWeight: 600, 
                  color: textMuted, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Days Taken
                </Text>
                <TextField
                  type="number"
                  value={editDays}
                  onChange={(_, val) => setEditDays(val || '')}
                  min={0}
                  step={0.5}
                  styles={{
                    fieldGroup: {
                      background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                      borderRadius: '2px',
                      selectors: {
                        ':hover': {
                          borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.4)'
                        }
                      }
                    },
                    field: {
                      background: 'transparent',
                      color: textPrimary,
                      fontSize: '13px'
                    }
                  }}
                />
              </div>
            </Stack>

            {/* Actions */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '10px', 
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`
            }}>
              <DefaultButton
                text="Cancel"
                onClick={() => setEditingRecord(null)}
                disabled={isEditing}
                styles={{
                  root: {
                    background: 'transparent',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                    borderRadius: '2px',
                    minWidth: '80px'
                  },
                  rootHovered: {
                    background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`
                  },
                  label: {
                    color: textPrimary,
                    fontWeight: 500,
                    fontSize: '13px'
                  }
                }}
              />
              <PrimaryButton
                text={isEditing ? 'Saving...' : 'Save'}
                onClick={handleEditLeave}
                disabled={isEditing}
                styles={{
                  root: {
                    background: colours.highlight,
                    border: 'none',
                    borderRadius: '2px',
                    minWidth: '80px'
                  },
                  rootHovered: {
                    background: '#2980b9'
                  },
                  label: {
                    fontWeight: 600,
                    fontSize: '13px'
                  }
                }}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Bulk Update Dialog */}
      {isAdmin && (
        <Dialog
          hidden={!showBulkDialog}
          onDismiss={() => !isBulkUpdating && setShowBulkDialog(false)}
          dialogContentProps={{
            type: DialogType.normal,
            title: '',
            showCloseButton: false
          }}
          modalProps={{ 
            isBlocking: isBulkUpdating,
            styles: {
              main: {
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(10, 16, 30, 0.98) 0%, rgba(18, 26, 42, 0.95) 100%)'
                  : 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.15)'}`,
                borderRadius: '2px',
                boxShadow: isDarkMode 
                  ? '0 4px 20px rgba(0,0,0,0.35), 0 1px 6px rgba(0,0,0,0.2)'
                  : '0 4px 20px rgba(0,0,0,0.06), 0 1px 6px rgba(0,0,0,0.03)',
                minWidth: '380px',
                maxWidth: '420px'
              }
            }
          }}
        >
          <div style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <Text style={{ 
                fontSize: '18px', 
                fontWeight: 600, 
                color: textPrimary,
                display: 'block',
                marginBottom: '4px'
              }}>
                Update Selected Records
              </Text>
              <Text style={{ 
                fontSize: '13px', 
                color: textMuted,
                display: 'block'
              }}>
                {selectedRecordIds.size} record{selectedRecordIds.size === 1 ? '' : 's'} selected
              </Text>
            </div>

            <Stack tokens={{ childrenGap: 16 }}>
              <div>
                <Text style={{ 
                  fontSize: '11px', 
                  fontWeight: 600, 
                  color: textMuted, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Status
                </Text>
                <Dropdown
                  selectedKey={bulkStatus}
                  onChange={(_, option) => setBulkStatus(String(option?.key ?? ''))}
                  options={[
                    { key: '', text: 'Leave unchanged' },
                    { key: 'requested', text: 'Requested' },
                    { key: 'approved', text: 'Approved' },
                    { key: 'booked', text: 'Booked' },
                    { key: 'rejected', text: 'Rejected' },
                    { key: 'acknowledged', text: 'Acknowledged' },
                    { key: 'discarded', text: 'Discarded' }
                  ]}
                  styles={{
                    dropdown: {
                      background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                      borderRadius: '2px',
                      selectors: {
                        ':hover': {
                          borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.4)'
                        }
                      }
                    },
                    title: {
                      background: 'transparent',
                      color: textPrimary,
                      border: 'none',
                      borderRadius: '2px',
                      fontSize: '13px'
                    },
                    caretDown: {
                      color: textMuted
                    }
                  }}
                />
              </div>

              <div>
                <Text style={{ 
                  fontSize: '11px', 
                  fontWeight: 600, 
                  color: textMuted, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Days Taken
                </Text>
                <TextField
                  type="number"
                  value={bulkDays}
                  onChange={(_, val) => setBulkDays(val || '')}
                  min={0}
                  step={0.5}
                  placeholder="Leave unchanged"
                  styles={{
                    fieldGroup: {
                      background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
                      borderRadius: '2px',
                      selectors: {
                        ':hover': {
                          borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.4)'
                        }
                      }
                    },
                    field: {
                      background: 'transparent',
                      color: textPrimary,
                      fontSize: '13px'
                    }
                  }}
                />
              </div>
            </Stack>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '10px', 
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`
            }}>
              <DefaultButton
                text="Cancel"
                onClick={() => setShowBulkDialog(false)}
                disabled={isBulkUpdating}
                styles={{
                  root: {
                    background: 'transparent',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                    borderRadius: '2px',
                    minWidth: '80px'
                  },
                  rootHovered: {
                    background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`
                  },
                  label: {
                    color: textPrimary,
                    fontWeight: 500,
                    fontSize: '13px'
                  }
                }}
              />
              <PrimaryButton
                text={isBulkUpdating ? 'Updating...' : 'Update'}
                onClick={handleBulkUpdate}
                disabled={isBulkUpdating || (!bulkStatus && !bulkDays)}
                styles={{
                  root: {
                    background: colours.highlight,
                    border: 'none',
                    borderRadius: '2px',
                    minWidth: '80px'
                  },
                  rootHovered: {
                    background: '#2980b9'
                  },
                  label: {
                    fontWeight: 600,
                    fontSize: '13px'
                  }
                }}
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
