import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useToast } from '../../components/feedback/ToastProvider';
import { MarketingMetrics } from './EnquiriesReport';
import { getNormalizedEnquirySourceLabel } from '../../utils/enquirySource';
import { Enquiry } from '../../app/functionality/types';
import { useReportRange } from './hooks/useReportRange';
import { surface } from './styles/reportingStyles';
import ReportShell from './components/ReportShell';
import './ManagementDashboard.css';

// Add CSS keyframes for spinner animation
const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes teamPulse {
    0%, 100% { opacity: 0.45; }
    50% { opacity: 0.95; }
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

// RangeKey, RANGE_OPTIONS, surface — imported from shared reporting infra

const MetaMetricsReport: React.FC<MetaMetricsReportProps> = ({
  metaMetrics,
  enquiries,
  triggerRefresh,
  lastRefreshTimestamp,
  isFetching = false
}) => {
  const { isDarkMode } = useTheme();
  const { showToast, hideToast } = useToast();
  const reportRange = useReportRange({ defaultKey: 'month' });
  const { range, rangeKey } = reportRange;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adData, setAdData] = useState<AdData[] | null>(null);
  const [isLoadingAds, setIsLoadingAds] = useState(false);
  const [instructionData, setInstructionData] = useState<InstructionData | null>(null);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  // State for caching and rate limiting
  const [clioSearchResults, setClioSearchResults] = useState<ClioSearchResults>({});
  const [clioSearchCache, setClioSearchCache] = useState<{[email: string]: {result: any, timestamp: number}}>({});
  const [lastClioSearch, setLastClioSearch] = useState<number>(0);
  const [isLoadingClioSearch, setIsLoadingClioSearch] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [adsLoadError, setAdsLoadError] = useState<string | null>(null);
  const adsLoadingToastIdRef = useRef<string | null>(null);
  const prevAdsLoadingRef = useRef<boolean>(false);

  // Date range and refresh tracking handled by ReportShell

  // computeRange, range — provided by useReportRange hook

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
        const enquiryDate = new Date(enquiry.Touchpoint_Date || enquiry.Date_Created);
        const isInRange = enquiryDate >= range.start && enquiryDate <= range.end;
        return isInRange;
      }
      
      // For "all time" (range is null), include all Meta enquiries
      return true;
    });

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
    setAdsLoadError(null);
    try {
      // Align daysBack to the active report period
      let daysBack = 30;
      if (range) {
        daysBack = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)));
      }
      const response = await fetch(`/api/marketing-metrics/ads?daysBack=${daysBack}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAdData(data.data);
        } else {
          const message = data?.error || 'Failed to load campaign data';
          setAdsLoadError(message);
        }
      } else {
        setAdsLoadError(`Campaign feed returned ${response.status}`);
      }
    } catch (error) {
      setAdsLoadError(error instanceof Error ? error.message : 'Campaign feed failed');
    } finally {
      setIsLoadingAds(false);
    }
  }, [range]);

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
      }
    } catch (error) {
      // silent — instruction data is supplementary
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
        }
      }
    } catch (error) {
      // silent — Clio search is supplementary
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

  // Trigger initial refresh when component mounts if data isn't already loaded
  useEffect(() => {
    if (triggerRefresh && (!metaMetrics || metaMetrics.length === 0)) {
      triggerRefresh();
    }
  }, []);

  // NOTE: duplicate useEffect removed — single trigger for Clio search on enquiry data change.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaEnquiryStats?.enquiries]);

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

  const campaignGroups = useMemo(() => {
    const ads = Array.isArray(adData)
      ? adData.filter((ad) => ad?.metrics && Number.isFinite(ad.metrics.spend))
      : [];
    if (!ads.length) return { groups: [], totalSpend: 0, totalConversions: 0 };

    const totalSpend = ads.reduce((sum, ad) => sum + (ad.metrics.spend || 0), 0);
    const totalConversions = ads.reduce((sum, ad) => sum + (ad.metrics.conversions || 0), 0);

    const grouped: Record<string, AdData[]> = {};
    ads.forEach((ad) => {
      const key = ad.campaignName || 'Uncategorised';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ad);
    });

    const groups = Object.entries(grouped)
      .map(([campaign, campaignAds]) => {
        const sortedAds = [...campaignAds].sort((a, b) => b.metrics.spend - a.metrics.spend);
        const spend = campaignAds.reduce((s, a) => s + (a.metrics.spend || 0), 0);
        const conversions = campaignAds.reduce((s, a) => s + (a.metrics.conversions || 0), 0);
        const clicks = campaignAds.reduce((s, a) => s + (a.metrics.clicks || 0), 0);
        const impressions = campaignAds.reduce((s, a) => s + (a.metrics.impressions || 0), 0);
        const reach = campaignAds.reduce((s, a) => s + (a.metrics.reach || 0), 0);
        return {
          campaign,
          ads: sortedAds,
          spend,
          spendShare: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
          conversions,
          clicks,
          impressions,
          reach,
          cpa: conversions > 0 ? spend / conversions : null,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    return { groups, totalSpend, totalConversions };
  }, [adData]);

  // Toast cues for campaign loading lifecycle
  useEffect(() => {
    const wasLoading = prevAdsLoadingRef.current;
    prevAdsLoadingRef.current = isLoadingAds;

    if (isLoadingAds && !wasLoading) {
      if (adsLoadingToastIdRef.current) {
        hideToast(adsLoadingToastIdRef.current);
      }
      adsLoadingToastIdRef.current = showToast({
        type: 'loading',
        title: 'Loading Meta campaigns',
        message: 'Pulling campaign performance data…',
      });
      return;
    }

    if (!isLoadingAds && wasLoading) {
      if (adsLoadingToastIdRef.current) {
        hideToast(adsLoadingToastIdRef.current);
        adsLoadingToastIdRef.current = null;
      }
      if (adsLoadError) {
        showToast({
          type: 'error',
          title: 'Campaign load failed',
          message: adsLoadError,
        });
      } else {
        showToast({
          type: 'success',
          title: 'Campaigns ready',
          message: campaignGroups.groups.length > 0
            ? `${campaignGroups.groups.length} campaigns loaded.`
            : 'No campaign data returned for this period.',
        });
      }
    }
  }, [isLoadingAds, adsLoadError, campaignGroups.groups.length, showToast, hideToast]);

  // When a campaign is selected, override the KPI strip with that campaign's 7-day ad stats
  const activeStats = useMemo(() => {
    if (!selectedCampaign) return null;
    const group = campaignGroups.groups.find((g) => g.campaign === selectedCampaign);
    if (!group) return null;
    return {
      totalSpend: group.spend,
      totalReach: group.reach,
      totalClicks: group.clicks,
      totalImpressions: group.impressions,
      totalConversions: group.conversions,
      costPerConversion: group.cpa ?? 0,
      avgCtr: group.ctr,
      avgCpc: group.cpc,
      avgCpm: group.impressions > 0 ? (group.spend / group.impressions) * 1000 : 0,
      avgFrequency: 0,
      conversionRate: group.clicks > 0 ? (group.conversions / group.clicks) * 100 : 0,
      reachRate: 0,
      impressionShare: 0,
    };
  }, [selectedCampaign, campaignGroups]);

  const displayStats = activeStats ?? stats;

  // Style helpers and section title

  const sectionTitleStyle = {
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '16px',
    fontFamily: 'Raleway, sans-serif',
  };

  const pillStyle: React.CSSProperties = {
    padding: '5px 12px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.08)'}`,
    borderRadius: 999,
    background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(248, 250, 252, 0.85)',
    color: isDarkMode ? '#d1d5db' : '#374151',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    fontFamily: 'Raleway, sans-serif',
  };

  const pillActiveStyle: React.CSSProperties = {
    background: isDarkMode ? `${colours.accent}22` : `${colours.highlight}15`,
    borderColor: isDarkMode ? colours.accent : colours.highlight,
    color: isDarkMode ? colours.accent : colours.highlight,
  };

  return (
    <ReportShell
      range={reportRange}
      isFetching={isFetching}
      lastRefreshTimestamp={lastRefreshTimestamp}
      onRefresh={handleRefresh}
      toolbarBottom={
        metaMetrics && metaMetrics.length > 0 ? (
          <div style={{
            padding: '10px 14px',
            borderRadius: 0,
            background: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(248, 250, 252, 0.9)',
            border: `0.5px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(13, 47, 96, 0.08)'}`,
            fontSize: 12,
            color: isDarkMode ? colours.dark.subText : colours.light.subText,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            fontFamily: 'Raleway, sans-serif',
          }}>
            <span>
              Available data: {new Date(Math.min(...metaMetrics.map(m => new Date(m.date).getTime()))).toLocaleDateString()} to {new Date(Math.max(...metaMetrics.map(m => new Date(m.date).getTime()))).toLocaleDateString()}{' '}
              ({metaMetrics.length.toLocaleString()} total records)
            </span>
            <span>Showing {filteredMetrics.length.toLocaleString()} filtered</span>
          </div>
        ) : undefined
      }
    >

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
          {/* Campaign filter indicator */}
          {selectedCampaign && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginTop: 16, marginBottom: -4,
              padding: '6px 12px', borderRadius: 999,
              background: isDarkMode ? `${colours.accent}15` : `${colours.highlight}0d`,
              border: `0.5px solid ${isDarkMode ? `${colours.accent}44` : `${colours.highlight}33`}`,
              alignSelf: 'flex-start', width: 'fit-content',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: isDarkMode ? colours.accent : colours.highlight }}>
                Filtered to campaign
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                {selectedCampaign}
              </span>
              <button
                onClick={() => setSelectedCampaign(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                  color: isDarkMode ? colours.subtleGrey : colours.greyText, fontSize: 14, lineHeight: 1,
                  fontFamily: 'Raleway, sans-serif',
                }}
                title="Clear filter"
              >
                ×
              </button>
            </div>
          )}

          {/* ── Conversion funnel strip (primary story) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginTop: 16 }}>
            {[
              { label: 'Ad Spend', value: formatCurrency(displayStats.totalSpend) },
              { label: 'Enquiries', value: String(metaEnquiryStats.totalEnquiries), accent: true },
              { label: 'Pitched', value: String(metaEnquiryStats.pitchedCount), accent: metaEnquiryStats.pitchedCount > 0 },
              { label: 'Instructed', value: String(metaEnquiryStats.instructedCount), accent: metaEnquiryStats.instructedCount > 0 },
              { label: 'Cost / Enquiry', value: metaEnquiryStats.totalEnquiries > 0 ? formatCurrency(metaEnquiryStats.costPerEnquiry) : '\u2014' },
            ].map(m => (
              <div key={m.label} style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
                padding: '12px 16px', borderRadius: 0,
                background: isDarkMode ? colours.darkBlue : '#ffffff',
                border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
                boxShadow: isDarkMode ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
                rowGap: 6, width: '100%',
                transition: 'all 0.2s ease',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.65 }}>{m.label}</span>
                <span style={{
                  fontSize: 20, fontWeight: 700,
                  color: (m as any).accent ? (isDarkMode ? colours.accent : colours.highlight) : undefined,
                }}>{m.value}</span>
              </div>
            ))}
          </div>

          {/* ── Ad performance strip (secondary detail) ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 12,
          }}>
            {[
              { label: 'CTR', value: formatPercent(displayStats.avgCtr) },
              { label: 'CPC', value: formatCurrency(displayStats.avgCpc) },
              { label: 'CPM', value: formatCurrency(displayStats.avgCpm) },
              { label: 'Reach', value: formatNumber(displayStats.totalReach) },
              { label: 'Impressions', value: formatNumber(displayStats.totalImpressions) },
              { label: 'Clicks', value: formatNumber(displayStats.totalClicks) },
              { label: 'Conversions', value: formatNumber(displayStats.totalConversions) },
              { label: 'Frequency', value: displayStats.avgFrequency.toFixed(2) },
            ].map(m => (
              <div key={m.label} style={{
                padding: '8px 12px', borderRadius: 0,
                background: isDarkMode ? `${colours.darkBlue}cc` : 'rgba(244, 244, 246, 0.6)',
                border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}33` : 'rgba(6, 23, 51, 0.04)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', opacity: 0.55 }}>{m.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{m.value}</span>
              </div>
            ))}
          </div>


          {/* ── Campaigns & Enquiries ── */}
          <div style={surface(isDarkMode, { marginTop: '16px' })}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Campaigns & Enquiries</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isLoadingAds && <Spinner size={SpinnerSize.small} />}
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.3px',
                    backgroundColor: isDarkMode ? `${colours.helixBlue}33` : `${colours.highlight}0d`,
                    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.08)'}`,
                    borderRadius: 0,
                    color: isDarkMode ? colours.dark.text : colours.darkBlue,
                    cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    opacity: isRefreshing ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s ease', fontFamily: 'Raleway, sans-serif',
                  }}
                  title="Refresh"
                >
                  <FontIcon iconName="Refresh" style={{ fontSize: 14, animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Processing cue strip */}
            {(isLoadingAds || isLoadingInstructions || isLoadingClioSearch || isRefreshing) && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                marginBottom: 12,
                borderRadius: 0,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                border: `0.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.24)'}`,
              }}>
                <Spinner size={SpinnerSize.xSmall} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight }}>
                    Processing Meta data…
                  </span>
                  <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    {[
                      isLoadingAds ? 'campaigns' : null,
                      isLoadingInstructions ? 'pitch/instruction links' : null,
                      isLoadingClioSearch ? 'Clio matching' : null,
                      isRefreshing ? 'refresh' : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
            )}

            {/* Campaign filter pills */}
            {campaignGroups.groups.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <button onClick={() => setSelectedCampaign(null)} style={{ ...pillStyle, ...(selectedCampaign === null ? pillActiveStyle : {}) }}>All</button>
                {campaignGroups.groups.map((g) => (
                  <button key={g.campaign} onClick={() => setSelectedCampaign((prev) => (prev === g.campaign ? null : g.campaign))} style={{ ...pillStyle, ...(selectedCampaign === g.campaign ? pillActiveStyle : {}) }}>
                    {g.campaign}
                  </button>
                ))}
              </div>
            )}

            {/* Campaign rows */}
            {campaignGroups.groups.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {campaignGroups.groups
                  .filter((g) => !selectedCampaign || g.campaign === selectedCampaign)
                  .map((group) => {
                  const isActive = selectedCampaign === group.campaign;
                  return (
                    <div
                      key={group.campaign}
                      onClick={() => setSelectedCampaign((prev) => (prev === group.campaign ? null : group.campaign))}
                      style={{
                        borderRadius: 0, cursor: 'pointer', transition: 'border-color 0.15s ease', overflow: 'hidden',
                        border: `0.5px solid ${isActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.08)')}`,
                        background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(248, 250, 252, 0.85)',
                      }}
                    >
                      {/* Campaign summary row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{group.campaign}</div>
                          <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, marginTop: 1 }}>
                            {group.ads.length} ad{group.ads.length !== 1 ? 's' : ''} · {formatPercent(group.spendShare)} of budget
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatCurrency(group.spend)}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: group.conversions > 0 ? colours.green : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>
                            {group.conversions}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.6, marginLeft: 2 }}>conv</span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight }}>
                            {group.cpa ? formatCurrency(group.cpa) : '\u2014'}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.6, marginLeft: 2 }}>CPA</span>
                          </div>
                        </div>
                      </div>
                      {/* Spend bar */}
                      <div style={{ padding: '0 14px 8px' }}>
                        <div style={{ height: 2, borderRadius: 999, background: isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(6, 23, 51, 0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(group.spendShare, 2)}%`, borderRadius: 999, background: isActive ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? `${colours.accent}88` : `${colours.highlight}88`), transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                      {/* Ad detail rows (compact) */}
                      {group.ads.map((ad, idx) => (
                        <div
                          key={ad.adId}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'grid', gridTemplateColumns: '1fr 56px 36px 72px', gap: 8, alignItems: 'center',
                            padding: '6px 14px', fontSize: 11,
                            borderTop: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}22` : 'rgba(6, 23, 51, 0.04)'}`,
                            background: idx % 2 === 0 ? 'transparent' : (isDarkMode ? 'rgba(2, 6, 23, 0.2)' : 'rgba(248, 250, 252, 0.5)'),
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ad.adName}</div>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(ad.metrics.spend)}</div>
                          <div style={{ textAlign: 'center', fontWeight: 600, color: ad.metrics.conversions > 0 ? colours.green : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>{ad.metrics.conversions}</div>
                          <div style={{ textAlign: 'right', fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                            {ad.metrics.costPerConversion > 0 ? formatCurrency(ad.metrics.costPerConversion) : '\u2014'} · {formatPercent(ad.metrics.ctr)}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : isLoadingAds ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {[1, 2, 3, 4].map((idx) => (
                  <div
                    key={`campaign-skeleton-${idx}`}
                    style={{
                      borderRadius: 0,
                      overflow: 'hidden',
                      border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.08)'}`,
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(248, 250, 252, 0.85)',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 12, width: '55%', marginBottom: 6, background: isDarkMode ? 'rgba(148,163,184,0.22)' : 'rgba(6,23,51,0.10)', borderRadius: 0, animation: 'teamPulse 1.2s ease-in-out infinite' }} />
                        <div style={{ height: 9, width: '35%', background: isDarkMode ? 'rgba(148,163,184,0.16)' : 'rgba(6,23,51,0.07)', borderRadius: 0, animation: 'teamPulse 1.2s ease-in-out infinite' }} />
                      </div>
                      <div style={{ height: 14, width: 74, background: isDarkMode ? 'rgba(148,163,184,0.22)' : 'rgba(6,23,51,0.10)', borderRadius: 0, animation: 'teamPulse 1.2s ease-in-out infinite' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : !isLoadingAds ? (
              <div style={{ textAlign: 'center', padding: 24, borderRadius: 0, border: `1px dashed ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(13,47,96,0.15)'}`, color: isDarkMode ? colours.dark.subText : colours.light.subText, fontSize: 13 }}>
                No campaign data for the selected period.
              </div>
            ) : null}

            {/* ── Divider ── */}
            {metaEnquiryStats.enquiries.length > 0 && campaignGroups.groups.length > 0 && (
              <div style={{ borderTop: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}44` : 'rgba(6,23,51,0.06)'}`, margin: '4px 0 12px' }} />
            )}

            {/* Enquiry rows */}
            {metaEnquiryStats.enquiries.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.5, marginBottom: 8 }}>
                  Enquiries ({metaEnquiryStats.enquiries.length})
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto', border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}33` : 'rgba(6,23,51,0.06)'}`, borderRadius: 0 }}>
                  {/* Header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: 10, padding: '8px 12px',
                    background: isDarkMode ? 'rgba(15,23,42,0.6)' : 'rgba(248,250,252,0.8)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)'}`,
                    fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    position: 'sticky', top: 0, zIndex: 1,
                  }}>
                    <div>Name</div><div>Value</div><div>Claimed</div><div>Pitched</div><div>Status</div><div>Date</div>
                  </div>
                  {/* Rows */}
                  {metaEnquiryStats.enquiries.map((enquiry, index) => (
                    <div key={`eq-${enquiry.ID}-${index}`} style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: 10, padding: '8px 12px', fontSize: 11,
                      alignItems: 'center', transition: 'background-color 0.15s ease', cursor: 'default',
                      borderBottom: index < metaEnquiryStats.enquiries.length - 1 ? `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)'}` : 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.7)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {/* Name */}
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 1 }}>{enquiry.First_Name} {enquiry.Last_Name}</div>
                        <div style={{ opacity: 0.6, fontSize: 10 }}>{enquiry.Area_of_Work || 'No AOW'}</div>
                      </div>
                      {/* Value */}
                      <div style={{ fontWeight: 500, color: colours.accent, fontSize: 11 }}>
                        {(() => { const v = getEnquiryValue(enquiry); return (!v || v.trim() === '') ? '\u2014' : v; })()}
                      </div>
                      {/* Claimed */}
                      <div>
                        {(() => {
                          const poc = enquiry.Point_of_Contact?.toLowerCase() || '';
                          const isTriaged = poc.includes('triage') || poc.includes('triaged');
                          const isClaimed = poc !== 'team@helix-law.com' && !!poc && !isTriaged;
                          if (isClaimed) {
                            const dn = (enquiry.Point_of_Contact?.split('@')[0] || '').replace(/\./g, ' ').split(' ').map(w => w.toUpperCase()).join(' ');
                            return <span style={{ fontWeight: 600, color: colours.green, fontSize: 10 }}>{dn}</span>;
                          }
                          return <span style={{ fontWeight: 600, color: colours.cta, fontSize: 10 }}>Unclaimed</span>;
                        })()}
                      </div>
                      {/* Pitched */}
                      <div>
                        {(() => {
                          const ps = getEnquiryPitchStatus(enquiry);
                          if (ps.isPitched) return (
                            <div>
                              <div style={{ fontWeight: 600, color: colours.highlight, fontSize: 10 }}>Pitched</div>
                              {ps.pitchDate && <div style={{ fontSize: 9, color: colours.highlight, marginTop: 1 }}>{new Date(ps.pitchDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>}
                            </div>
                          );
                          return <span style={{ fontWeight: 600, color: colours.subtleGrey, fontSize: 10 }}>Not Pitched</span>;
                        })()}
                      </div>
                      {/* Status */}
                      <div>
                        {(() => {
                          const is = getEnquiryInstructionStatus(enquiry);
                          return (
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 10, color: is.hasInstruction ? colours.green : is.isProofOfIdComplete ? colours.orange : colours.subtleGrey }}>
                                {is.hasInstruction ? 'Instructed' : is.isProofOfIdComplete ? 'POID done' : 'Not Instructed'}
                              </div>
                              {(is.hasInstruction || is.isProofOfIdComplete) && <div style={{ opacity: 0.6, fontSize: 8, marginTop: 1 }}>{is.instructionRef}</div>}
                            </div>
                          );
                        })()}
                      </div>
                      {/* Date */}
                      <div style={{ fontWeight: 500, fontSize: 10 }}>
                        {new Date(enquiry.Touchpoint_Date || enquiry.Date_Created).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Spend & Engagement charts (compact) ── */}
          {LineChart && AreaChart && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div style={surface(isDarkMode, { padding: '10px 12px' })}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.5, marginBottom: 6 }}>Daily Spend</div>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.06)'} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: isDarkMode ? '#E2E8F0' : '#374151' }} stroke={isDarkMode ? '#64748B' : '#9CA3AF'} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: isDarkMode ? '#E2E8F0' : '#374151' }} stroke={isDarkMode ? '#64748B' : '#9CA3AF'} tickLine={false} width={40} />
                    <Tooltip contentStyle={{ backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground, border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, borderRadius: 0, fontSize: 11 }} formatter={(value: any) => [formatCurrency(Number(value)), 'Spend']} />
                    <Area type="monotone" dataKey="spend" stroke={colours.cta} fill={colours.cta} fillOpacity={0.2} strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={surface(isDarkMode, { padding: '10px 12px' })}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', opacity: 0.5, marginBottom: 6 }}>Clicks & Conversions</div>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(13,47,96,0.05)'} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: isDarkMode ? colours.dark.subText : colours.light.subText }} stroke={isDarkMode ? colours.dark.border : colours.light.border} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: isDarkMode ? colours.dark.subText : colours.light.subText }} stroke={isDarkMode ? colours.dark.border : colours.light.border} tickLine={false} width={30} />
                    <Tooltip contentStyle={{ backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground, border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, borderRadius: 0, fontSize: 11 }} />
                    <Line type="monotone" dataKey="clicks" stroke={isDarkMode ? colours.highlight : colours.helixBlue} strokeWidth={1.5} name="Clicks" dot={false} />
                    <Line type="monotone" dataKey="conversions" stroke={colours.green} strokeWidth={1.5} name="Conversions" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}


        </>
      )}
    </ReportShell>
  );
};

export default React.memo(MetaMetricsReport);