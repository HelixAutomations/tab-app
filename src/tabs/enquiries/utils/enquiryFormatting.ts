import { format } from 'date-fns';
import { colours } from '../../../app/styles/colours';

export const toRgba = (color: string, alpha: number): string => {
  if (!color) return `rgba(160, 160, 160, ${alpha})`;
  if (color.startsWith('rgba(')) {
    const match = color.match(/rgba\(([^)]+)\)/);
    if (!match) return color;
    const parts = match[1].split(',').map(p => p.trim());
    if (parts.length < 3) return color;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
};

export const getAreaOfWorkLineColor = (areaOfWork: string, isDarkMode: boolean, isHover = false): string => {
  const area = (areaOfWork || '').toLowerCase().trim();
  const alpha = isHover ? 0.85 : 0.55;

  if (area.includes('commercial')) return toRgba(colours.blue, alpha);
  if (area.includes('construction')) return toRgba(colours.orange, alpha);
  if (area.includes('property')) return toRgba(colours.green, alpha);
  if (area.includes('employment')) return toRgba(colours.yellow, alpha);
  if (area.includes('other') || area.includes('unsure')) return toRgba(colours.greyText, isDarkMode ? 0.5 : 0.45);

  return toRgba(colours.greyText, isDarkMode ? 0.5 : 0.45);
};

export const formatDateReceived = (dateStr: string | null, isFromInstructions: boolean): string => {
  if (!dateStr) return '--';
  
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const isToday = dateOnly.getTime() === today.getTime();
  const isYesterday = dateOnly.getTime() === yesterday.getTime();
  const isSameYear = date.getFullYear() === now.getFullYear();
  
  if (isFromInstructions) {
    const time = format(date, 'HH:mm');
    
    if (isToday) {
      return time;
    }
    
    if (isYesterday) {
      return 'Yesterday';
    }
    
    const dayName = format(date, 'EEE');
    const dateFormat = isSameYear ? 'd MMM' : 'd MMM yyyy';
    return `${dayName}, ${format(date, dateFormat)}`;
  }
  
  if (isToday) {
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
    if (hasTime) {
      return format(date, 'HH:mm');
    }
    return 'Today';
  } else if (isYesterday) {
    return 'Yesterday';
  } else {
    const dayName = format(date, 'EEE');
    const dateFormat = isSameYear ? 'd MMM' : 'd MMM yyyy';
    return `${dayName}, ${format(date, dateFormat)}`;
  }
};

export const formatFullDateTime = (dateStr: string | null): string => {
  if (!dateStr) {
    return 'Timestamp unavailable';
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return 'Timestamp unavailable';
  }

  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
    timeZoneName: 'short',
  });
};

export const timeAgo = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return '';
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export const timeAgoLong = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return '';
  let seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds <= 0) return 'Just now';

  if (seconds < 60) return `${seconds}s ago`;

  if (seconds < 600) {
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s ago` : `${minutes}m ago`;
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const remMinutes = Math.floor((seconds % 3600) / 60);
    return remMinutes > 0 ? `${hours}h ${remMinutes}m ago` : `${hours}h ago`;
  }

  const days = Math.floor(seconds / 86400);
  const remHours = Math.floor((seconds % 86400) / 3600);

  if (days < 7) {
    return remHours > 0 ? `${days}d ${remHours}h ago` : `${days}d ago`;
  }

  if (days < 30) {
    const weeks = Math.floor(days / 7);
    const remDays = days % 7;
    return remDays > 0 ? `${weeks}w ${remDays}d ago` : `${weeks}w ago`;
  }

  if (days < 365) {
    const months = Math.floor(days / 30);
    const remDays2 = days % 30;
    const weeks = Math.floor(remDays2 / 7);
    return weeks > 0 ? `${months}m ${weeks}w ago` : `${months}m ago`;
  }

  const years = Math.floor(days / 365);
  const remDays3 = days % 365;
  const months = Math.floor(remDays3 / 30);
  return months > 0 ? `${years}y ${months}m ago` : `${years}y ago`;
};

export const getCompactTimeDisplay = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const isLegacyPlaceholder = timePart === '00:00';
  
  if (d.toDateString() === now.toDateString()) {
    if (isLegacyPlaceholder) return 'Today';
    if (diffHours < 1) return `${Math.floor(diffMs / 60000)}m ago`;
    return `${timePart}`;
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return isLegacyPlaceholder ? 'Yesterday' : `Yest ${timePart}`;
  }
  
  if (diffDays < 7) {
    const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
    return isLegacyPlaceholder ? dayName : `${dayName} ${timePart}`;
  }
  
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export const getStackedDateDisplay = (dateStr: string | null): { top: string; middle: string; bottom: string } => {
  if (!dateStr) return { top: '-', middle: '', bottom: '' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { top: '-', middle: '', bottom: '' };

  const now = new Date();
  const londonDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayKey = londonDate.format(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateKey = londonDate.format(d);
  const yesterdayKey = londonDate.format(yesterday);

  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
  const hasTime = timePart !== '00:00';

  if (dateKey === todayKey) {
    return { top: hasTime ? `Today ${timePart}` : 'Today', middle: '', bottom: '' };
  }

  if (dateKey === yesterdayKey) {
    return { top: hasTime ? `Yest ${timePart}` : 'Yesterday', middle: '', bottom: '' };
  }

  const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  return { top: datePart, middle: '', bottom: '' };
};

export const formatDaySeparatorLabel = (dayKey: string, isHovered: boolean): string => {
  if (!dayKey) return '';
  const d = new Date(dayKey + 'T12:00:00');
  if (isNaN(d.getTime())) return dayKey;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isSameYear = d.getFullYear() === now.getFullYear();
  const isToday = dayOnly.getTime() === today.getTime();
  const isYesterday = dayOnly.getTime() === yesterday.getTime();

  if (isHovered) {
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return isSameYear
      ? format(d, 'EEEE d MMMM')
      : format(d, 'EEEE d MMMM yyyy');
  }

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return isSameYear ? format(d, 'd MMM') : format(d, 'd MMM yyyy');
};

export const getStackedTimeParts = (dateStr: string | null): { datePart: string; timePart: string; relative: string } => {
  const compact = getCompactTimeDisplay(dateStr);
  return { datePart: compact, timePart: '', relative: '' };
};

export const formatClaimTime = (claimDate: string | null, pocEmail: string, isFromInstructions: boolean): string => {
  if (!claimDate) {
    const isUnclaimed = (pocEmail || '').toLowerCase() === 'team@helix-law.com';
    return isUnclaimed ? 'Unclaimed' : '--';
  }
  
  if (!isFromInstructions) {
    return '--';
  }
  
  const date = new Date(claimDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
};

export const calculateTimeDifference = (dateReceived: string | null, claimDate: string | null, isFromInstructions: boolean): string => {
  if (!dateReceived || !claimDate || !isFromInstructions) {
    return '';
  }
  
  const receivedDate = new Date(dateReceived);
  const claimedDate = new Date(claimDate);
  
  if (isNaN(receivedDate.getTime()) || isNaN(claimedDate.getTime())) {
    return '';
  }
  
  const diffMs = claimedDate.getTime() - receivedDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMs < 0) {
    return '';
  }
  
  if (diffMins < 60) {
    return `${diffMins}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else if (diffDays === 1) {
    return `1d`;
  } else {
    return `${diffDays}d`;
  }
};

export const getTimeDifferenceColors = (dateReceived: string | null, claimDate: string | null, isFromInstructions: boolean, isDarkMode: boolean) => {
  if (!dateReceived || !claimDate || !isFromInstructions) {
    return {
      background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
      border: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'
    };
  }
  
  const receivedDate = new Date(dateReceived);
  const claimedDate = new Date(claimDate);
  
  if (isNaN(receivedDate.getTime()) || isNaN(claimedDate.getTime())) {
    return {
      background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
      border: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'
    };
  }
  
  const diffMs = claimedDate.getTime() - receivedDate.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  
  const ratio = Math.min(diffMins / 60, 1);
  
  const red = Math.floor(34 + (248 - 34) * ratio);
  const green = Math.floor(197 + (113 - 197) * ratio);
  const blue = Math.floor(94 + (113 - 94) * ratio);
  
  return {
    background: `rgba(${red}, ${green}, ${blue}, ${isDarkMode ? 0.15 : 0.1})`,
    color: `rgb(${Math.floor(red * 0.8)}, ${Math.floor(green * 0.8)}, ${Math.floor(blue * 0.8)})`,
    border: `rgba(${red}, ${green}, ${blue}, ${isDarkMode ? 0.3 : 0.25})`
  };
};
