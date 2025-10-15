import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { DefaultButton, PrimaryButton, Spinner, SpinnerSize, FontIcon, DatePicker, DayOfWeek, type IDatePickerStyles, type IButtonStyles } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { MarketingMetrics } from './EnquiriesReport';
import { getNormalizedEnquirySourceLabel } from '../../utils/enquirySource';
import { Enquiry } from '../../app/functionality/types';
import './ManagementDashboard.css';

// Add CSS keyframes for spinner animation
const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Safe import of Recharts components
let LineChart: any, Line: any, XAxis: any, YAxis: any, CartesianGrid: any, Tooltip: any, Legend: any, ResponsiveContainer: any, AreaChart: any, Area: any;

try {
  const recharts = require('recharts');
  LineChart = recharts.LineChart;
  Line = recharts.Line;
  XAxis = recharts.XAxis;
  YAxis = recharts.YAxis;
  CartesianGrid = recharts.CartesianGrid;
  Tooltip = recharts.Tooltip;
  Legend = recharts.Legend;
  ResponsiveContainer = recharts.ResponsiveContainer;
  AreaChart = recharts.AreaChart;
  Area = recharts.Area;
} catch (error) {
  console.warn('Recharts not available, charts will be disabled');
}

// Inject CSS for spinner animation
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = spinKeyframes;
  document.head.appendChild(styleSheet);
}

interface MetaMetricsReportProps {
  metaMetrics: MarketingMetrics[] | null;
  enquiries?: Enquiry[] | null;
  triggerRefresh?: () => Promise<void>;
  lastRefreshTimestamp?: number;
  isFetching?: boolean;
}

interface AdData {
  adId: string;
  adName: string;
  campaignName: string;
  adsetName: string;
  dateStart: string;
  dateStop: string;
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number;
    cpc: number;
    cpm: number;
    ctr: number;
    conversions: number;
    costPerConversion: number;
    conversionRate: number;
  };
}

// Interface for deals from instructions API
interface Deal {
  DealId: number;
  ProspectId: number;
  InstructionRef?: string;
  Status: string;
  PitchedBy?: string;
  PitchedDate?: string;
  Amount?: number;
  ServiceDescription?: string;
  AreaOfWork?: string;
  LeadClientEmail?: string;
  FirstName?: string;
  LastName?: string;
  // Add any other fields that might exist
  [key: string]: any;
}

interface InstructionData {
  instructions: any[];
  deals: Deal[];
}

interface ClioContact {
  id: number;
  name: string;
  primary_email_address?: string;
  type: string;
  matters?: any[];
}

interface ClioSearchResults {
  [email: string]: ClioContact | null;
}

type RangeKey = 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth' | 'last90Days' | 'quarter' | 'yearToDate' | 'year' | 'custom' | 'all';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last90Days', label: 'Last 90 Days' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'yearToDate', label: 'Year To Date' },
  { key: 'year', label: 'Current Year' },
];

// Helper function for consistent surface styling - Updated to match glass container approach
function surface(isDark: boolean, overrides: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: 'rgba(255, 255, 255, 0.02)',
    backdropFilter: 'blur(12px) saturate(150%)',
    WebkitBackdropFilter: 'blur(12px) saturate(150%)',
    borderRadius: 12,
    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.2)'}`,
    boxShadow: isDark 
      ? '0 4px 16px rgba(0, 0, 0, 0.25), 0 1px 4px rgba(0, 0, 0, 0.15)'
      : '0 4px 16px rgba(15, 23, 42, 0.08), 0 1px 4px rgba(15, 23, 42, 0.04)',
    padding: 16,
    transition: 'all 0.3s ease',
    ...overrides,
  };
}

const MetaMetricsReport: React.FC<MetaMetricsReportProps> = ({
  metaMetrics,
  enquiries,
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching = false
}) => {
  const { isDarkMode } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null } | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [adData, setAdData] = useState<AdData[] | null>(null);
  const [isLoadingAds, setIsLoadingAds] = useState(false);
  const [instructionData, setInstructionData] = useState<InstructionData | null>(null);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  // State for caching and rate limiting
  const [clioSearchResults, setClioSearchResults] = useState<ClioSearchResults>({});
  const [clioSearchCache, setClioSearchCache] = useState<{[email: string]: {result: any, timestamp: number}}>({});
  const [lastClioSearch, setLastClioSearch] = useState<number>(0);
  const [isLoadingClioSearch, setIsLoadingClioSearch] = useState(false);

  // Auto-refresh tracking
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (lastRefreshTimestamp) {
      setTimeElapsed(0);
    }
  }, [lastRefreshTimestamp]);

  const computeRange = useCallback((range: RangeKey): { start: Date; end: Date } => {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);

    switch (range) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        const startOfWeek = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - startOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'lastWeek':
        const lastWeekStart = (start.getDay() + 6) % 7 + 7;
        start.setDate(start.getDate() - lastWeekStart);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - (end.getDay() + 6) % 7 - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'lastMonth':
        start.setMonth(start.getMonth() - 1, 1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth(), 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last90Days':
        start.setDate(start.getDate() - 90);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'quarter':
        const quarter = Math.floor(start.getMonth() / 3);
        start.setMonth(quarter * 3, 1);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'yearToDate':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'year':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(11, 31);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }, []);

  const range = useMemo(() => {
    if (rangeKey === 'custom' && customDateRange) {
      if (customDateRange.start && customDateRange.end) {
        const start = new Date(customDateRange.start);
        const end = new Date(customDateRange.end);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      return null;
    }
    if (rangeKey === 'all') return null;
    return computeRange(rangeKey);
  }, [rangeKey, customDateRange, computeRange]);

  // Filter and process Meta metrics data
  const filteredMetrics = useMemo(() => {
    if (!metaMetrics) return [];
    
    if (!range) {
      return metaMetrics;
    }
    
    const filtered = metaMetrics.filter((metric) => {
      const metricDate = new Date(metric.date);
      return metricDate >= range.start && metricDate <= range.end;
    });
    
    return filtered;
  }, [metaMetrics, range, rangeKey]);

  // Calculate comprehensive statistics
  const stats = useMemo(() => {
    if (!filteredMetrics.length) {
      return {
        totalSpend: 0,
        totalReach: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        avgCtr: 0,
        avgCpc: 0,
        avgCpm: 0,
        avgFrequency: 0,
        costPerConversion: 0,
        conversionRate: 0,
        reachRate: 0,
        impressionShare: 0
      };
    }

    const totals = filteredMetrics.reduce((acc, metric) => {
      const meta = metric.metaAds;
      if (!meta) return acc;
      
      return {
        spend: acc.spend + meta.spend,
        reach: acc.reach + meta.reach,
        impressions: acc.impressions + meta.impressions,
        clicks: acc.clicks + meta.clicks,
        conversions: acc.conversions + meta.conversions,
        ctrSum: acc.ctrSum + meta.ctr,
        cpcSum: acc.cpcSum + meta.cpc,
        cpmSum: acc.cpmSum + meta.cpm,
        frequencySum: acc.frequencySum + meta.frequency,
        days: acc.days + 1
      };
    }, {
      spend: 0, reach: 0, impressions: 0, clicks: 0, conversions: 0,
      ctrSum: 0, cpcSum: 0, cpmSum: 0, frequencySum: 0, days: 0
    });

    const avgCtr = totals.days > 0 ? totals.ctrSum / totals.days : 0;
    const avgCpc = totals.days > 0 ? totals.cpcSum / totals.days : 0;
    const avgCpm = totals.days > 0 ? totals.cpmSum / totals.days : 0;
    const avgFrequency = totals.days > 0 ? totals.frequencySum / totals.days : 0;
    const costPerConversion = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
    const conversionRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;
    const reachRate = totals.impressions > 0 ? (totals.reach / totals.impressions) * 100 : 0;

    return {
      totalSpend: totals.spend,
      totalReach: totals.reach,
      totalImpressions: totals.impressions,
      totalClicks: totals.clicks,
      totalConversions: totals.conversions,
      avgCtr,
      avgCpc,
      avgCpm,
      avgFrequency,
      costPerConversion,
      conversionRate,
      reachRate,
      impressionShare: 85.2 // Mock value - would need actual competition data
    };
  }, [filteredMetrics]);

  // Function to check if an enquiry has been pitched by matching with deals
  const getEnquiryPitchStatus = useCallback((enquiry: Enquiry) => {
    if (!instructionData?.deals) {
      return { isPitched: false, pitchDate: null };
    }
    
    // Since enquiries don't have ProspectId/ACID, we need to match by client info
    const enquiryEmail = enquiry.Email?.toLowerCase().trim();
    const enquiryFirstName = enquiry.First_Name?.toLowerCase().trim();
    const enquiryLastName = enquiry.Last_Name?.toLowerCase().trim();
    
    // Skip if we don't have enough identifying information
    if (!enquiryEmail && (!enquiryFirstName || !enquiryLastName)) {
      return { isPitched: false, pitchDate: null };
    }
    
    // Look for a matching deal based on client information
    const matchingDeal = instructionData.deals.find(deal => {
      // Try to match by email if available
      if (enquiryEmail && (deal as any).LeadClientEmail?.toLowerCase().trim() === enquiryEmail) {
        return true;
      }
      
      // Try to match by name (this is less reliable but worth trying)
      if (enquiryFirstName && enquiryLastName) {
        const dealFirstName = (deal as any).FirstName?.toLowerCase().trim();
        const dealLastName = (deal as any).LastName?.toLowerCase().trim();
        
        if (dealFirstName === enquiryFirstName && dealLastName === enquiryLastName) {
          return true;
        }
      }
      
      return false;
    });
    
    if (!matchingDeal) {
      return { isPitched: false, pitchDate: null };
    }
    
    // Get pitch date from the PitchedDate field
    const pitchDate = (matchingDeal as any).PitchedDate || null;
    
    return { isPitched: true, pitchDate };
  }, [instructionData]);

  // Function to check if an enquiry pitch became an instruction
  const getEnquiryInstructionStatus = useCallback((enquiry: Enquiry) => {
    if (!instructionData?.instructions) {
      return { hasInstruction: false, instructionRef: null, isProofOfIdComplete: false };
    }
    
    const enquiryEmail = enquiry.Email?.toLowerCase().trim();
    const enquiryFirstName = enquiry.First_Name?.toLowerCase().trim();
    const enquiryLastName = enquiry.Last_Name?.toLowerCase().trim();
    
    if (!enquiryEmail && (!enquiryFirstName || !enquiryLastName)) {
      return { hasInstruction: false, instructionRef: null, isProofOfIdComplete: false };
    }
    
    // Find matching deal first to get InstructionRef
    const matchingDeal = instructionData.deals?.find(deal => {
      if (enquiryEmail && (deal as any).LeadClientEmail?.toLowerCase().trim() === enquiryEmail) {
        return true;
      }
      
      if (enquiryFirstName && enquiryLastName) {
        const dealFirstName = (deal as any).FirstName?.toLowerCase().trim();
        const dealLastName = (deal as any).LastName?.toLowerCase().trim();
        
        if (dealFirstName === enquiryFirstName && dealLastName === enquiryLastName) {
          return true;
        }
      }
      
      return false;
    });
    
    // If no deal found, not instructed
    if (!matchingDeal || !(matchingDeal as any).InstructionRef) {
      return { hasInstruction: false, instructionRef: null, isProofOfIdComplete: false };
    }
    
    const instructionRef = (matchingDeal as any).InstructionRef;
    
    // Find the corresponding instruction and check if it's truly "instructed"
    const matchingInstruction = instructionData.instructions.find(inst => 
      (inst as any).ref === instructionRef || (inst as any).InstructionRef === instructionRef
    );
    
    if (!matchingInstruction) {
      return { hasInstruction: false, instructionRef: instructionRef, isProofOfIdComplete: false };
    }
    
    // Business logic: Instructed = InternalStatus is 'paid' (regardless of stage)
    // POID Complete = Stage is 'proof-of-id-complete' AND InternalStatus is 'poid'
    const stage = ((matchingInstruction as any).Stage || (matchingInstruction as any).stage || '').toLowerCase();
    const internalStatus = ((matchingInstruction as any).InternalStatus || (matchingInstruction as any).internalStatus || '').toLowerCase();
    
    const isInstructed = internalStatus === 'paid';
    const isProofOfIdComplete = stage === 'proof-of-id-complete' && internalStatus === 'poid';
    
    return { 
      hasInstruction: isInstructed, 
      instructionRef: instructionRef,
      isProofOfIdComplete: isProofOfIdComplete && !isInstructed
    };
  }, [instructionData]);

  // Extract value band from Facebook lead notes if Value field is empty
  const getEnquiryValue = (enquiry: any): string => {
    // If Value field has content, use it
    if (enquiry.Value && enquiry.Value.trim() !== '') {
      return enquiry.Value;
    }
    
    // For Facebook leads, check if value is in the notes
    const notes = enquiry.Initial_first_call_notes || '';
    const valueBandMatch = notes.match(/Value Band Or Qualifier:\s*([^,\n]+)/i);
    if (valueBandMatch) {
      const valueBand = valueBandMatch[1].trim();
      
      // Convert common abbreviations to full value bands
      switch (valueBand.toLowerCase()) {
        case '<10k':
        case 'less than 10k':
          return 'Less than £10,000';
        case '10k-50k':
        case '10-50k':
          return '£10,000 to £50,000';
        case '50k-100k':
        case '50-100k':
          return '£50,000 to £100,000';
        case '100k-500k':
        case '100-500k':
          return '£100,001 - £500,000';
        case '>500k':
        case 'more than 500k':
          return '£500,001 or more';
        case 'unsure':
        case 'uncertain':
          return 'unsure';
        case 'other':
        case 'non-monetary':
          return 'The claim is for something other than money';
        default:
          return valueBand; // Return as-is if no mapping found
      }
    }
    
    return ''; // No value information found
  };

  // Helper function to convert value bands to numeric values for calculations
  const convertValueBandToNumber = (valueText: string): number => {
    if (!valueText || typeof valueText !== 'string') return 0;
    
    const value = valueText.toLowerCase().trim();
    
    // Handle exact value band matches from database
    switch (value) {
      // Under £10k variants
      case 'less than £10,000':
      case '£10,000 or less':
      case 'a financial sum below £10,000':
        return 5000; // Midpoint of 0-10k
      
      // £10k-£50k variants
      case '£10,000 to £50,000':
      case '£10,000 - £50,000':
      case '£25,000 to £50,000':
        return 30000; // Midpoint of 10k-50k
      
      // £10k-£100k variants
      case '£10,001 - £100,000':
      case 'a financial sum between £10,000 - £100,000':
        return 55000; // Midpoint of 10k-100k
      
      // £50k-£100k variants
      case '£50,000 to £100,000':
      case '£50,000 or more':
        return 75000; // Midpoint of 50k-100k
      
      // £100k-£500k variants
      case '£100,001 - £500,000':
      case 'a financial sum between £100,001 - £500,000':
        return 300000; // Midpoint of 100k-500k
      
      // Over £100k
      case 'greater than £100,000':
        return 250000; // Conservative estimate
      
      // Over £500k
      case '£500,001 or more':
      case 'a financial sum over £500,001':
        return 750000; // Conservative estimate for 500k+
      
      // Numeric values (some enquiries have direct numbers)
      case '5000':
        return 5000;
      case '£1000':
        return 1000;
      
      // Uncertain/unsure/other cases
      case 'unsure':
      case 'uncertain':
      case 'i\'m uncertain/other':
      case 'unable to establish':
      case 'other':
      case 'not applicable':
      case 'the claim is for something other than money':
      case 'dispute involves a property, land or shares':
      case 'test item':
      case '':
        return 0; // No monetary value
      
      default:
        // Try to extract any numeric value as fallback
        const numMatch = value.match(/£?([\d,]+)/);
        if (numMatch) {
          const numValue = parseFloat(numMatch[1].replace(/,/g, ''));
          return isNaN(numValue) ? 0 : numValue;
        }
        
        return 0;
    }
  };

  // Filter Meta enquiries and calculate ROI metrics
  const metaEnquiryStats = useMemo(() => {
    if (!enquiries) {
      return {
        totalEnquiries: 0,
        enquiriesInPeriod: 0,
        totalValue: 0,
        averageValue: 0,
        roi: 0,
        costPerEnquiry: 0,
        pitchedCount: 0,
        instructedCount: 0,
        pitchConversionRate: 0,
        instructionConversionRate: 0,
        pitchToInstructionRate: 0,
        enquiries: []
      };
    }

    // Filter enquiries to Meta Ads source within the date range
    const metaEnquiries = enquiries.filter(enquiry => {
      const source = getNormalizedEnquirySourceLabel(enquiry);
      const isMetaSource = source === 'Meta Ads';
      
      if (!isMetaSource) return false;
      
      // Check if enquiry is within date range (skip date filter for "all time")
      if (range) {
        const enquiryDate = new Date(enquiry.Date_Created || enquiry.Touchpoint_Date);
        const isInRange = enquiryDate >= range.start && enquiryDate <= range.end;
        return isInRange;
      }
      
      // For "all time" (range is null), include all Meta enquiries
      return true;
    });

    // Debug: Log Meta enquiries to see their structure (only once)
    if (metaEnquiries.length > 0 && !(window as any).metaEnquiriesLogged) {
      console.log('� Meta enquiries found:', metaEnquiries.length);
      console.log('📋 Sample Meta enquiry fields:', Object.keys(metaEnquiries[0]));
      (window as any).metaEnquiriesLogged = true;
    }

    const totalEnquiries = metaEnquiries.length;
    
    // Calculate pitch and instruction conversion metrics
    const pitchedCount = totalEnquiries > 0 && instructionData?.deals ? 
      metaEnquiries.filter(enquiry => getEnquiryPitchStatus(enquiry).isPitched).length : 0;
    const instructedCount = totalEnquiries > 0 && instructionData?.deals ? 
      metaEnquiries.filter(enquiry => getEnquiryInstructionStatus(enquiry).hasInstruction).length : 0;
    
    const pitchConversionRate = totalEnquiries > 0 ? (pitchedCount / totalEnquiries) * 100 : 0;
    const instructionConversionRate = totalEnquiries > 0 ? (instructedCount / totalEnquiries) * 100 : 0;
    const pitchToInstructionRate = pitchedCount > 0 ? (instructedCount / pitchedCount) * 100 : 0;
    
    // Calculate total value from enquiries using value band conversion
    const totalValue = metaEnquiries.reduce((sum, enquiry) => {
      const enquiryValue = getEnquiryValue(enquiry);
      const numericValue = convertValueBandToNumber(enquiryValue);
      return sum + numericValue;
    }, 0);

    const averageValue = totalEnquiries > 0 ? totalValue / totalEnquiries : 0;
    const costPerEnquiry = stats.totalSpend > 0 && totalEnquiries > 0 ? stats.totalSpend / totalEnquiries : 0;
    const roi = stats.totalSpend > 0 ? ((totalValue - stats.totalSpend) / stats.totalSpend) * 100 : 0;

    return {
      totalEnquiries,
      enquiriesInPeriod: totalEnquiries,
      totalValue,
      averageValue,
      roi,
      costPerEnquiry,
      pitchedCount,
      instructedCount,
      pitchConversionRate,
      instructionConversionRate,
      pitchToInstructionRate,
      enquiries: metaEnquiries
    };
  }, [enquiries, range, stats.totalSpend]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredMetrics.map(metric => ({
      date: new Date(metric.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      spend: metric.metaAds?.spend || 0,
      reach: metric.metaAds?.reach || 0,
      impressions: metric.metaAds?.impressions || 0,
      clicks: metric.metaAds?.clicks || 0,
      conversions: metric.metaAds?.conversions || 0,
      ctr: metric.metaAds?.ctr || 0,
      cpc: metric.metaAds?.cpc || 0,
      cpm: metric.metaAds?.cpm || 0,
    }));
  }, [filteredMetrics]);

  const fetchAdData = useCallback(async () => {
    setIsLoadingAds(true);
    try {
      const response = await fetch('/api/marketing-metrics/ads?daysBack=7');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAdData(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch ad data:', error);
    } finally {
      setIsLoadingAds(false);
    }
  }, []);

  // Fetch instruction data to get deals for pitch status
  const fetchInstructionData = useCallback(async () => {
    setIsLoadingInstructions(true);
    try {
      const response = await fetch('/api/instructions');
      if (response.ok) {
        const data = await response.json();
        setInstructionData({
          instructions: data.instructions || [],
          deals: data.deals || []
        });
      } else {
        console.error('❌ Failed to fetch instruction data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error fetching instruction data:', error);
    } finally {
      setIsLoadingInstructions(false);
    }
  }, []);

  // Search Clio for contacts by email addresses with caching and rate limiting
  const searchClioContacts = useCallback(async (emails: string[]) => {
    if (emails.length === 0) return;
    
    const now = Date.now();
    const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
    const RATE_LIMIT_DELAY = 5 * 1000; // 5 seconds between API calls
    
    // Check if we should rate limit this request
    if (now - lastClioSearch < RATE_LIMIT_DELAY) {
      return;
    }
    
    // Filter out emails that are already cached and still valid
    const emailsToSearch = emails.filter(email => {
      const cached = clioSearchCache[email];
      if (!cached) return true; // Not cached, need to search
      
      const isExpired = now - cached.timestamp > CACHE_DURATION;
      if (isExpired) {
        return true; // Expired, need to refresh
      }
      
      // Use cached result
      setClioSearchResults(prev => ({...prev, [email]: cached.result}));
      return false; // Don't search, use cache
    });
    
    if (emailsToSearch.length === 0) {
      return;
    }
    
    setIsLoadingClioSearch(true);
    setLastClioSearch(now);
    
    try {
      const response = await fetch('/api/search-clio-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails: emailsToSearch }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Update both results and cache
          const newResults = data.results;
          const newCacheEntries: {[email: string]: {result: any, timestamp: number}} = {};
          
          Object.entries(newResults).forEach(([email, result]) => {
            newCacheEntries[email] = {
              result,
              timestamp: now
            };
          });
          
          setClioSearchResults(prev => ({...prev, ...newResults}));
          setClioSearchCache(prev => ({...prev, ...newCacheEntries}));
        } else {
          console.error('❌ Clio search failed:', data.error);
        }
      } else {
        console.error('❌ Failed to search Clio contacts:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error searching Clio contacts:', error);
    } finally {
      setIsLoadingClioSearch(false);
    }
  }, [clioSearchCache, lastClioSearch]);

  // Clear Clio cache manually
  const clearClioCache = useCallback(() => {
    setClioSearchCache({});
    setClioSearchResults({});
    setLastClioSearch(0);
    
    // Re-trigger search if we have enquiries
    if (metaEnquiryStats?.enquiries && metaEnquiryStats.enquiries.length > 0) {
      const uniqueEmails = Array.from(new Set(
        metaEnquiryStats.enquiries
          .map(enquiry => enquiry.Email)
          .filter(email => email && email.trim() !== '')
      ));
      
      if (uniqueEmails.length > 0) {
        searchClioContacts(uniqueEmails);
      }
    }
  }, [metaEnquiryStats?.enquiries, searchClioContacts]);

  // Load ad data and instruction data on component mount
  useEffect(() => {
    fetchAdData();
    fetchInstructionData();
  }, [fetchAdData, fetchInstructionData]);

  // Search Clio contacts when metaEnquiryStats changes and has enquiries
  useEffect(() => {
    if (metaEnquiryStats?.enquiries && metaEnquiryStats.enquiries.length > 0) {
      const uniqueEmails = Array.from(new Set(
        metaEnquiryStats.enquiries
          .map(enquiry => enquiry.Email)
          .filter(email => email && email.trim() !== '')
      ));
      
      if (uniqueEmails.length > 0) {
        searchClioContacts(uniqueEmails);
      }
    }
  }, [metaEnquiryStats?.enquiries, searchClioContacts]);

  const handleRefresh = useCallback(async () => {
    if (!triggerRefresh || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await Promise.all([
        triggerRefresh(),
        fetchAdData(),
        fetchInstructionData()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [triggerRefresh, isRefreshing, fetchAdData, fetchInstructionData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', { 
      style: 'currency', 
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-GB').format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const formatTimeAgo = (timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const diffMs = Date.now() - timestamp;
    if (diffMs < 60_000) return 'Just now';
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getDatePickerStyles = (isDarkMode: boolean): Partial<IDatePickerStyles> => {
    const baseBorder = isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)';
    const hoverBorder = isDarkMode ? 'rgba(135, 206, 255, 0.5)' : 'rgba(54, 144, 206, 0.4)';
    const focusBorder = isDarkMode ? '#87ceeb' : colours.highlight;
    const backgroundColour = isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
    const hoverBackground = isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 1)';
    const focusBackground = isDarkMode ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)';

    return {
      root: { 
        maxWidth: 220,
        '.ms-DatePicker': {
          fontFamily: 'Raleway, sans-serif !important',
        }
      },
      textField: {
        root: {
          fontFamily: 'Raleway, sans-serif !important',
          width: '100% !important',
        },
        fieldGroup: {
          height: '36px !important',
          borderRadius: '8px !important',
          border: `1px solid ${baseBorder} !important`,
          background: `${backgroundColour} !important`,
          padding: '0 14px !important',
          boxShadow: isDarkMode 
            ? '0 2px 4px rgba(0, 0, 0, 0.2) !important' 
            : '0 1px 3px rgba(15, 23, 42, 0.08) !important',
          transition: 'all 0.2s ease !important',
          selectors: {
            ':hover': {
              border: `1px solid ${hoverBorder} !important`,
              background: `${hoverBackground} !important`,
              boxShadow: isDarkMode 
                ? '0 4px 8px rgba(0, 0, 0, 0.25) !important' 
                : '0 2px 6px rgba(15, 23, 42, 0.12) !important',
              transform: 'translateY(-1px) !important',
            },
            ':focus-within': {
              border: `1px solid ${focusBorder} !important`,
              background: `${focusBackground} !important`,
              boxShadow: isDarkMode 
                ? `0 0 0 3px rgba(135, 206, 235, 0.1), 0 4px 12px rgba(0, 0, 0, 0.25) !important`
                : `0 0 0 3px rgba(54, 144, 206, 0.1), 0 2px 8px rgba(15, 23, 42, 0.15) !important`,
              transform: 'translateY(-1px) !important',
            }
          }
        },
        field: {
          fontSize: '14px !important',
          color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
          fontFamily: 'Raleway, sans-serif !important',
          fontWeight: '500 !important',
          background: 'transparent !important',
          lineHeight: '20px !important',
          border: 'none !important',
          outline: 'none !important',
        },
      },
      icon: {
        color: `${isDarkMode ? colours.highlight : colours.missedBlue} !important`,
        fontSize: '16px !important',
        fontWeight: 'bold !important',
      },
      callout: {
        fontSize: '14px !important',
        borderRadius: '12px !important',
        border: `1px solid ${baseBorder} !important`,
        boxShadow: isDarkMode 
          ? '0 8px 24px rgba(0, 0, 0, 0.4) !important' 
          : '0 6px 20px rgba(15, 23, 42, 0.15) !important',
      },
      wrapper: { 
        borderRadius: '12px !important',
      },
    };
  };

  // Refresh functionality
  const [refreshIndicatorKey, setRefreshIndicatorKey] = useState(0);

  const refresh = () => {
    setRefreshIndicatorKey(prev => prev + 1);
    handleRefresh();
  };

  const subtleActionButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
    root: {
      height: 28,
      borderRadius: 14,
      fontSize: 12,
      padding: '0 10px',
      background: 'transparent',
      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.18)'}`,
      color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
      minWidth: 'unset',
    },
    rootHovered: {
      background: isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.08)',
    },
    rootPressed: {
      background: isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.12)',
    },
  });

  const getRangeButtonStyles = (isDarkMode: boolean, active: boolean): IButtonStyles => {
    const activeBackground = colours.highlight;
    const inactiveBackground = isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'transparent';

    const resolvedBackground = active ? activeBackground : inactiveBackground;
    const resolvedBorder = active
      ? `1px solid ${isDarkMode ? 'rgba(135, 176, 255, 0.5)' : 'rgba(13, 47, 96, 0.32)'}`
      : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;
    const resolvedColor = active ? '#ffffff' : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

    return {
      root: {
        display: 'inline-flex',
        alignItems: 'center',
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderRadius: 999,
        border: resolvedBorder,
        padding: '0 12px',
        minHeight: 32,
        height: 32,
        fontWeight: 600,
        fontSize: 13,
        color: resolvedColor,
        background: resolvedBackground,
        boxShadow: active ? '0 2px 8px rgba(54, 144, 206, 0.25)' : 'none',
        fontFamily: 'Raleway, sans-serif',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      },
      rootHovered: {
        background: active 
          ? '#2f7cb3'
          : (isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(54, 144, 206, 0.12)'),
      },
      rootPressed: {
        background: active 
          ? '#266795'
          : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(54, 144, 206, 0.16)'),
      },
    };
  };

  const containerStyle = {
    padding: 0,
    backgroundColor: 'transparent',
    minHeight: '100vh',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  };

  const headerStyle = {
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '8px',
    fontFamily: 'Raleway, sans-serif',
  };

  const subHeaderStyle = {
    color: isDarkMode ? colours.dark.subText : colours.light.subText,
    fontSize: '16px',
    margin: 0,
    fontFamily: 'Raleway, sans-serif',
  };

  const sectionTitleStyle = {
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '16px',
    fontFamily: 'Raleway, sans-serif',
  };

  return (
    <div style={containerStyle}>
      {/* Navigation Surface */}
      <div className="filter-toolbar">
        <div style={surface(isDarkMode)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Date Range Display */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            {rangeKey === 'custom' && customDateRange ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <DatePicker
                  placeholder="Start date"
                  value={customDateRange?.start || undefined}
                  onSelectDate={(date) => setCustomDateRange(prev => ({
                    start: date || null,
                    end: prev?.end || null
                  }))}
                  firstDayOfWeek={DayOfWeek.Monday}
                  styles={getDatePickerStyles(isDarkMode)}
                />
                <DatePicker
                  placeholder="End date"
                  value={customDateRange?.end || undefined}
                  onSelectDate={(date) => setCustomDateRange(prev => ({
                    start: prev?.start || null,
                    end: date || null
                  }))}
                  firstDayOfWeek={DayOfWeek.Monday}
                  styles={getDatePickerStyles(isDarkMode)}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  cursor: 'pointer',
                }}
                onClick={() => setRangeKey('custom')}
                title="Click to set custom date range">
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>From</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    {range ? range.start.toLocaleDateString() : 'All time'}
                  </span>
                </div>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  cursor: 'pointer',
                }}
                onClick={() => setRangeKey('custom')}
                title="Click to set custom date range">
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>To</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    {range ? range.end.toLocaleDateString() : 'All time'}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${isFetching ? (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)') : (isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.25)')}`,
                background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
                fontSize: 12,
                fontWeight: 600,
                color: isDarkMode ? '#E2E8F0' : colours.missedBlue,
              }}>
                {isFetching ? (
                  <>
                    <Spinner size={SpinnerSize.xSmall} />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: '#22c55e',
                    }} />
                    Live data
                  </>
                )}
              </div>
              
              {/* Refresh Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DefaultButton
                  text={isFetching ? 'Refreshing…' : 'Refresh data'}
                  iconProps={{ iconName: 'Refresh' }}
                  onClick={refresh}
                  disabled={isFetching}
                  styles={subtleActionButtonStyles(isDarkMode)}
                />
              </div>
            </div>
          </div>

          {/* Data Summary */}
          {metaMetrics && metaMetrics.length > 0 && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(13, 47, 96, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(13, 47, 96, 0.08)'}`,
              fontSize: 12,
              color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(13, 47, 96, 0.75)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12
            }}>
              <span>
                Available data: {new Date(Math.min(...metaMetrics.map(m => new Date(m.date).getTime()))).toLocaleDateString()} to {new Date(Math.max(...metaMetrics.map(m => new Date(m.date).getTime()))).toLocaleDateString()} 
                ({metaMetrics.length.toLocaleString()} total records)
              </span>
              <span>Showing {filteredMetrics.length.toLocaleString()} filtered</span>
            </div>
          )}

          {/* Range Navigation Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {RANGE_OPTIONS.map(option => (
              <DefaultButton
                key={option.key}
                text={option.label}
                onClick={() => setRangeKey(option.key)}
                styles={getRangeButtonStyles(isDarkMode, rangeKey === option.key)}
              />
            ))}
            <DefaultButton
              text="Custom"
              onClick={() => setRangeKey('custom')}
              styles={getRangeButtonStyles(isDarkMode, rangeKey === 'custom')}
            />
            <DefaultButton
              text="All Time"
              onClick={() => setRangeKey('all')}
              styles={getRangeButtonStyles(isDarkMode, rangeKey === 'all')}
            />
            {rangeKey !== 'all' && (
              <button
                onClick={() => setRangeKey('all')}
                style={{
                  marginLeft: 8,
                  padding: '4px 8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                  borderRadius: '4px',
                  color: isDarkMode ? colours.accent : colours.highlight,
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Clear date range filter"
              >
                <span style={{ fontSize: 16 }}>×</span>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Loading State */}
      {isFetching && (
        <div style={surface(isDarkMode, { textAlign: 'center', padding: '60px', marginTop: '16px' })}>
          <Spinner size={SpinnerSize.large} />
          <p style={{ marginTop: '20px', fontSize: '16px' }}>
            Loading Meta marketing analytics...
          </p>
        </div>
      )}

      {/* No Data State */}
      {!isFetching && (!metaMetrics || metaMetrics.length === 0 || filteredMetrics.length === 0) && (
        <div style={surface(isDarkMode, { textAlign: 'center', padding: '60px', marginTop: '16px' })}>
          <FontIcon 
            iconName="BarChart4" 
            style={{ 
              fontSize: '64px', 
              color: isDarkMode ? colours.dark.subText : colours.light.subText,
              marginBottom: '20px' 
            }} 
          />
          <h3 style={{ 
            color: isDarkMode ? colours.dark.text : colours.light.text,
            marginBottom: '12px',
            fontSize: '24px'
          }}>
            {!metaMetrics || metaMetrics.length === 0 ? 'No Meta metrics available' : 'No data for selected period'}
          </h3>
          <p style={{ 
            color: isDarkMode ? colours.dark.subText : colours.light.subText,
            margin: 0,
            fontSize: '16px'
          }}>
            {!metaMetrics || metaMetrics.length === 0 
              ? 'Meta marketing data will appear here once available.' 
              : 'Try selecting a different time range to view data.'}
          </p>
        </div>
      )}

      {/* Main Analytics Dashboard */}
      {!isFetching && filteredMetrics.length > 0 && (
        <>
          {/* Key Performance Indicators */}
          <div style={surface(isDarkMode, { marginTop: '16px' })}>
            <h3 style={sectionTitleStyle}>Key Metrics</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '32px'
            }}>
              <div style={{
                padding: '20px',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)',
                borderRadius: '12px',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
              }}>
                <div style={{ 
                  fontSize: '36px', 
                  fontWeight: 700, 
                  color: colours.accent,
                  marginBottom: '8px' 
                }}>
                  {formatCurrency(stats.totalSpend)}
                </div>
                <div style={{ fontSize: '14px', color: '#ffffff' }}>
                  Total Investment
                </div>
              </div>

              <div style={{
                padding: '20px',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)',
                borderRadius: '12px',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
              }}>
                <div style={{ 
                  fontSize: '36px', 
                  fontWeight: 700, 
                  color: colours.accent,
                  marginBottom: '8px' 
                }}>
                  {formatNumber(stats.totalReach)}
                </div>
                <div style={{ fontSize: '14px', color: '#ffffff' }}>
                  People Reached
                </div>
              </div>

              <div style={{
                padding: '20px',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)',
                borderRadius: '12px',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
              }}>
                <div style={{ 
                  fontSize: '36px', 
                  fontWeight: 700, 
                  color: colours.accent,
                  marginBottom: '8px' 
                }}>
                  {formatNumber(stats.totalConversions)}
                </div>
                <div style={{ fontSize: '14px', color: '#ffffff' }}>
                  Total Conversions
                </div>
              </div>

              <div style={{
                padding: '20px',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)',
                borderRadius: '12px',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
              }}>
                <div style={{ 
                  fontSize: '36px', 
                  fontWeight: 700, 
                  color: colours.accent,
                  marginBottom: '8px' 
                }}>
                  {formatCurrency(stats.costPerConversion)}
                </div>
                <div style={{ fontSize: '14px', color: '#ffffff' }}>
                  Cost Per Conversion
                </div>
              </div>
            </div>
          </div>

          {/* Performance Summary */}
          <div style={surface(isDarkMode, { marginTop: '16px' })}>
            <h3 style={sectionTitleStyle}>Performance Summary</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
              marginBottom: '20px'
            }}>
              {/* Efficiency Metrics */}
              <div>
                <h4 style={{ 
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '12px',
                  fontSize: '16px'
                }}>Campaign Efficiency</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Click-Through Rate:</span>
                    <strong style={{ color: colours.accent }}>{formatPercent(stats.avgCtr)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cost Per Click:</span>
                    <strong style={{ color: colours.accent }}>{formatCurrency(stats.avgCpc)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Conversion Rate:</span>
                    <strong style={{ color: colours.accent }}>{formatPercent(stats.conversionRate)}</strong>
                  </div>
                </div>
              </div>

              {/* Reach & Frequency */}
              <div>
                <h4 style={{ 
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '12px',
                  fontSize: '16px'
                }}>Reach & Frequency</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Impressions:</span>
                    <strong style={{ color: colours.accent }}>{formatNumber(stats.totalImpressions)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Unique Reach:</span>
                    <strong style={{ color: colours.accent }}>{formatNumber(stats.totalReach)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Average Frequency:</span>
                    <strong style={{ color: colours.accent }}>{stats.avgFrequency.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* ROI Analysis */}
              <div>
                <h4 style={{ 
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '12px',
                  fontSize: '16px'
                }}>ROI Analysis</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Clicks:</span>
                    <strong style={{ color: colours.accent }}>{formatNumber(stats.totalClicks)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cost Per Conversion:</span>
                    <strong style={{ color: colours.accent }}>{formatCurrency(stats.costPerConversion)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROI & Enquiries Analysis */}
          <div style={surface(isDarkMode, { marginTop: '16px' })}>
            <h3 style={sectionTitleStyle}>ROI & Enquiries Analysis</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px',
              marginBottom: '20px'
            }}>
              {/* Enquiries Overview */}
              <div>
                <h4 style={{ 
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '12px',
                  fontSize: '16px'
                }}>Meta Enquiries</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Enquiries:</span>
                    <strong style={{ color: colours.accent }}>{metaEnquiryStats.totalEnquiries}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cost Per Enquiry:</span>
                    <strong style={{ color: colours.accent }}>
                      {metaEnquiryStats.costPerEnquiry > 0 ? formatCurrency(metaEnquiryStats.costPerEnquiry) : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* ROI Metrics */}
              <div>
                <h4 style={{ 
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '12px',
                  fontSize: '16px'
                }}>Return on Investment</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Value (est.):</span>
                    <strong style={{ color: colours.accent }}>
                      {metaEnquiryStats.totalValue > 0 ? formatCurrency(metaEnquiryStats.totalValue) : '—'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ROI:</span>
                    <strong style={{ 
                      color: metaEnquiryStats.roi > 0 ? colours.accent : colours.cta
                    }}>
                      {metaEnquiryStats.totalValue > 0 ? `${metaEnquiryStats.roi.toFixed(1)}%` : '—'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Revenue Ratio:</span>
                    <strong style={{ color: colours.accent }}>
                      {metaEnquiryStats.totalValue > 0 && stats.totalSpend > 0 
                        ? `${(metaEnquiryStats.totalValue / stats.totalSpend).toFixed(2)}:1`
                        : '—'
                      }
                    </strong>
                  </div>
                </div>
              </div>

              {/* Conversion Funnel */}
              <div>
                <h4 style={{ 
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '12px',
                  fontSize: '16px'
                }}>Conversion Funnel</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Ad Impressions:</span>
                    <strong style={{ color: colours.accent }}>{formatNumber(stats.totalImpressions)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Ad Clicks:</span>
                    <strong style={{ color: colours.accent }}>{formatNumber(stats.totalClicks)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Enquiries:</span>
                    <strong style={{ color: colours.accent }}>{metaEnquiryStats.totalEnquiries}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Click-to-Enquiry:</span>
                    <strong style={{ color: colours.accent }}>
                      {stats.totalClicks > 0 && metaEnquiryStats.totalEnquiries > 0
                        ? `${((metaEnquiryStats.totalEnquiries / stats.totalClicks) * 100).toFixed(2)}%`
                        : '—'
                      }
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Meta Enquiries */}
            {metaEnquiryStats.enquiries.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <h4 style={{ 
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontSize: '16px',
                    margin: 0
                  }}>Recent Meta Enquiries ({metaEnquiryStats.enquiries.length})</h4>
                  
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    style={{
                      padding: '8px 12px',
                      fontSize: '14px',
                      backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      color: colours.accent,
                      cursor: isRefreshing ? 'not-allowed' : 'pointer',
                      opacity: isRefreshing ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease'
                    }}
                    title="Refresh Meta metrics data"
                    onMouseEnter={(e) => {
                      if (!isRefreshing) {
                        e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                    }}
                  >
                    <FontIcon 
                      iconName="Refresh" 
                      style={{ 
                        fontSize: '16px',
                        animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
                      }} 
                    />
                    Refresh
                  </button>
                </div>
                
                <div style={{ 
                  maxHeight: '400px',
                  overflowY: 'auto',
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)'}`,
                  borderRadius: '8px'
                }}>
                  {/* Table Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                    gap: '12px',
                    padding: '12px',
                    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(248, 250, 252, 0.8)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)'}`,
                    fontSize: '11px',
                    fontWeight: 600,
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}>
                    <div>Name</div>
                    <div>Value</div>
                    <div>Claimed</div>
                    <div>Pitched</div>
                    <div>Conversion</div>
                    <div>Enquiry Date</div>
                  </div>
                  
                  {/* Table Rows */}
                  {metaEnquiryStats.enquiries.map((enquiry, index) => (
                    <div key={`enquiry-${enquiry.ID}-${index}`} style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                      gap: '12px',
                      padding: '12px',
                      borderBottom: index < metaEnquiryStats.enquiries.length - 1 ? 
                        `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.04)'}` : 'none',
                      fontSize: '12px',
                      alignItems: 'center',
                      backgroundColor: 'transparent',
                      transition: 'background-color 0.2s ease',
                      cursor: 'default'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(248, 250, 252, 0.7)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    >
                      {/* Name Column */}
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                          {enquiry.First_Name} {enquiry.Last_Name}
                        </div>
                        <div style={{ opacity: 0.7, fontSize: '11px' }}>
                          {enquiry.Area_of_Work || 'No AOW'}
                        </div>
                      </div>
                      
                      {/* Value Column */}
                      <div style={{ fontWeight: 500, color: colours.accent }}>
                        {(() => {
                          // Get value from Value field or Facebook lead notes
                          const enquiryValue = getEnquiryValue(enquiry);
                          if (!enquiryValue || enquiryValue.trim() === '') return '—';
                          
                          // Return the text value as-is (it's a value band description)
                          return enquiryValue;
                        })()}
                      </div>
                      
                      {/* Claimed Column */}
                      <div>
                        {(() => {
                          const poc = enquiry.Point_of_Contact?.toLowerCase() || '';
                          const isClaimed = poc !== 'team@helix-law.com' && !!poc;
                          
                          if (isClaimed) {
                            // Show who claimed it (extract name part from email)
                            const emailName = enquiry.Point_of_Contact?.split('@')[0] || '';
                            // Properly capitalize each word/initial - make initials ALL CAPS
                            const displayName = emailName
                              .replace(/\./g, ' ')
                              .split(' ')
                              .map(word => word.toUpperCase())
                              .join(' ');
                            return (
                              <div style={{
                                fontWeight: 600,
                                color: '#10b981',
                                fontSize: '11px'
                              }}>
                                {displayName}
                              </div>
                            );
                          } else {
                            return (
                              <div style={{
                                fontWeight: 600,
                                color: '#ef4444',
                                fontSize: '11px'
                              }}>
                                Unclaimed
                              </div>
                            );
                          }
                        })()}
                      </div>
                      
                      {/* Pitched Column */}
                      <div>
                        {(() => {
                          // Check if enquiry has been pitched by looking up deals table
                          const pitchStatus = getEnquiryPitchStatus(enquiry);
                          
                          if (pitchStatus.isPitched) {
                            return (
                              <div>
                                <div style={{
                                  fontWeight: 600,
                                  color: '#3b82f6',
                                  fontSize: '11px'
                                }}>
                                  Pitched
                                </div>
                                {pitchStatus.pitchDate ? (
                                  <div style={{
                                    fontSize: '10px',
                                    color: '#3b82f6',
                                    fontWeight: 500,
                                    marginTop: '2px'
                                  }}>
                                    {new Date(pitchStatus.pitchDate).toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: '2-digit'
                                    })}
                                  </div>
                                ) : (
                                  <div style={{
                                    fontSize: '9px',
                                    color: '#64748b',
                                    fontStyle: 'italic',
                                    marginTop: '2px'
                                  }}>
                                    Date unknown
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            return (
                              <div style={{
                                fontWeight: 600,
                                color: '#64748b',
                                fontSize: '11px'
                              }}>
                                Not Pitched
                              </div>
                            );
                          }
                        })()}
                      </div>
                      
                      {/* Conversion Column */}
                      <div>
                        {(() => {
                          // Check if enquiry pitch became an instruction
                          const instructionStatus = getEnquiryInstructionStatus(enquiry);
                          
                          return (
                            <div>
                              <div style={{
                                fontWeight: 600,
                                color: instructionStatus.hasInstruction ? '#10b981' : 
                                       instructionStatus.isProofOfIdComplete ? '#f59e0b' : '#64748b',
                                fontSize: '11px'
                              }}>
                                {instructionStatus.hasInstruction ? 'Instructed' : 
                                 instructionStatus.isProofOfIdComplete ? 'poid-complete' : 'Not Instructed'}
                              </div>
                              {(instructionStatus.hasInstruction || instructionStatus.isProofOfIdComplete) && (
                                <div style={{ 
                                  opacity: 0.7,
                                  fontSize: '9px',
                                  marginTop: '1px'
                                }}>
                                  {instructionStatus.instructionRef}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      
                      {/* Date Column */}
                      <div style={{ fontWeight: 500 }}>
                        {new Date(enquiry.Date_Created || enquiry.Touchpoint_Date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit'
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Performance Charts */}
          {LineChart && AreaChart && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
              gap: '16px',
              marginTop: '16px'
            }}>
              {/* Spend Trend Chart */}
              <div style={surface(isDarkMode)}>
                <h3 style={sectionTitleStyle}>Daily Spend Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0,0,0,0.1)'} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: isDarkMode ? '#E2E8F0' : '#374151' }}
                      stroke={isDarkMode ? '#64748B' : '#9CA3AF'}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: isDarkMode ? '#E2E8F0' : '#374151' }}
                      stroke={isDarkMode ? '#64748B' : '#9CA3AF'}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      formatter={(value: any) => [formatCurrency(Number(value)), 'Spend']}
                    />
                    <Area type="monotone" dataKey="spend" stroke={colours.cta} fill={colours.cta} fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Engagement Metrics */}
              <div style={surface(isDarkMode)}>
                <h3 style={sectionTitleStyle}>Engagement Performance</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0,0,0,0.1)'} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: isDarkMode ? '#E2E8F0' : '#374151' }}
                      stroke={isDarkMode ? '#64748B' : '#9CA3AF'}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: isDarkMode ? '#E2E8F0' : '#374151' }}
                      stroke={isDarkMode ? '#64748B' : '#9CA3AF'}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="clicks" stroke={colours.highlight} strokeWidth={2} name="Clicks" />
                    <Line type="monotone" dataKey="conversions" stroke={colours.accent} strokeWidth={2} name="Conversions" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart Placeholder - Only shown when charts not available */}
          {(!LineChart || !AreaChart) && (
            <div style={surface(isDarkMode, { marginTop: '16px' })}>
              <h3 style={sectionTitleStyle}>Performance Charts</h3>
              <div style={{ 
                padding: '40px',
                textAlign: 'center',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.8)',
                borderRadius: '8px',
                border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(13, 47, 96, 0.2)'}`,
              }}>
                <FontIcon 
                  iconName="LineChart" 
                  style={{ 
                    fontSize: '48px', 
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    marginBottom: '16px' 
                  }} 
                />
                <h4 style={{ 
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  marginBottom: '8px' 
                }}>
                  Charts Loading...
                </h4>
                <p style={{ 
                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                  margin: 0,
                  fontSize: '14px'
                }}>
                  Performance visualizations will be displayed here once Recharts loads.
                </p>
              </div>
            </div>
          )}

          {/* Individual Ad Performance */}
          <div style={surface(isDarkMode, { marginTop: '16px' })}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={sectionTitleStyle}>Top Performing Ads (Last 7 Days)</h3>
              {isLoadingAds && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Spinner size={SpinnerSize.small} />
                  <span style={{ fontSize: '12px', color: isDarkMode ? colours.dark.subText : colours.light.subText }}>
                    Loading ads...
                  </span>
                </div>
              )}
            </div>

            {adData && adData.length > 0 ? (
              <div style={{ 
                display: 'grid',
                gap: '12px'
              }}>
                {adData.slice(0, 10).map((ad) => (
                  <div key={ad.adId} style={{
                    padding: '16px',
                    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.6)',
                    borderRadius: '8px',
                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(15, 23, 42, 0.04)'}`,
                  }}>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                      gap: '16px',
                      alignItems: 'center'
                    }}>
                      {/* Ad Details */}
                      <div>
                        <div style={{ 
                          fontWeight: 600,
                          fontSize: '14px',
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          marginBottom: '4px'
                        }}>
                          {ad.adName}
                        </div>
                        <div style={{ 
                          fontSize: '12px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText,
                          marginBottom: '2px'
                        }}>
                          Campaign: {ad.campaignName}
                        </div>
                        <div style={{ 
                          fontSize: '12px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText
                        }}>
                          Ad Set: {ad.adsetName}
                        </div>
                      </div>

                      {/* Spend */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ 
                          fontSize: '18px',
                          fontWeight: 700,
                          color: colours.cta,
                          marginBottom: '2px'
                        }}>
                          {formatCurrency(ad.metrics.spend)}
                        </div>
                        <div style={{ 
                          fontSize: '11px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText
                        }}>
                          Spend
                        </div>
                      </div>

                      {/* Reach & Impressions */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ 
                          fontSize: '16px',
                          fontWeight: 600,
                          color: colours.highlight,
                          marginBottom: '2px'
                        }}>
                          {formatNumber(ad.metrics.reach)}
                        </div>
                        <div style={{ 
                          fontSize: '11px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText,
                          marginBottom: '4px'
                        }}>
                          Reach
                        </div>
                        <div style={{ 
                          fontSize: '12px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText
                        }}>
                          {formatNumber(ad.metrics.impressions)} imp
                        </div>
                      </div>

                      {/* Clicks & CTR */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ 
                          fontSize: '16px',
                          fontWeight: 600,
                          color: colours.highlight,
                          marginBottom: '2px'
                        }}>
                          {formatNumber(ad.metrics.clicks)}
                        </div>
                        <div style={{ 
                          fontSize: '11px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText,
                          marginBottom: '4px'
                        }}>
                          Clicks
                        </div>
                        <div style={{ 
                          fontSize: '12px',
                          color: colours.accent
                        }}>
                          {formatPercent(ad.metrics.ctr)} CTR
                        </div>
                      </div>

                      {/* Conversions & CPA */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ 
                          fontSize: '16px',
                          fontWeight: 600,
                          color: colours.accent,
                          marginBottom: '2px'
                        }}>
                          {ad.metrics.conversions}
                        </div>
                        <div style={{ 
                          fontSize: '11px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText,
                          marginBottom: '4px'
                        }}>
                          Conversions
                        </div>
                        <div style={{ 
                          fontSize: '12px',
                          color: colours.cta
                        }}>
                          {ad.metrics.costPerConversion > 0 ? formatCurrency(ad.metrics.costPerConversion) : '—'} CPA
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {adData.length > 10 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '12px',
                    fontSize: '12px',
                    color: isDarkMode ? colours.dark.subText : colours.light.subText
                  }}>
                    Showing top 10 of {adData.length} ads
                  </div>
                )}
              </div>
            ) : !isLoadingAds ? (
              <div style={{ 
                textAlign: 'center',
                padding: '40px',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(248, 250, 252, 0.6)',
                borderRadius: '8px',
                border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(13, 47, 96, 0.15)'}`,
              }}>
                <FontIcon 
                  iconName="Target" 
                  style={{ 
                    fontSize: '32px', 
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    marginBottom: '12px' 
                  }} 
                />
                <p style={{ 
                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                  margin: 0,
                  fontSize: '14px'
                }}>
                  No individual ad data available for the selected period.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

export default MetaMetricsReport;