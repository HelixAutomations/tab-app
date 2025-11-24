import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
    Stack,
    Text,
    mergeStyles,
    MessageBar,
    MessageBarType,
    Spinner,
    SpinnerSize,
    IconButton,
    Pivot,
    PivotItem,
    Link as FluentLink,
    DefaultButton,
    IButtonStyles,
    Icon,
    DatePicker,
    DayOfWeek,
    IDatePickerStyles,
} from '@fluentui/react';
import {
    BarChart,
    Bar,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Legend,
    LabelList,
} from 'recharts';
import { parseISO, startOfMonth, format, isValid, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth as startOfMonthFns, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { Matter, UserData, TeamData, Transaction, Enquiry } from '../../app/functionality/types';
import MatterCard, { MatterPitchTag } from '../matters/MatterCard';
import MatterOverview from '../matters/MatterOverview';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import 'rc-slider/assets/index.css';
import Slider from 'rc-slider';
import MattersCombinedMenu from '../matters/MattersCombinedMenu';
import MatterTransactions from '../matters/MatterTransactions';
import Documents from '../matters/documents/Documents';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import './ManagementDashboard.css';
import type { DealRecord, InstructionRecord } from './dataSources';

// ----------------------------------------------
// Type interfaces for additional datasets
// ----------------------------------------------
interface RecoveredFee {
  payment_date: string;
  payment_allocated: number;
  user_id: number;
  kind?: string; // 'Service', 'Expense', or 'Product'
  matter_id?: number;
  bill_id?: number;
  description?: string;
  source?: 'clio' | 'sql' | 'manual'; // Data source tracking
}

export interface WIP {
  date?: string; // YYYY-MM-DD format date field from Clio/SQL
  created_at: string;
  total?: number;
  quantity_in_hours?: number;
  user_id?: number;
  matter_id?: number | string;
  matter_ref?: string;
  // When sourced from Clio API, user is nested
  user?: { id?: number | string };
  source?: 'clio' | 'sql' | 'manual'; // Data source tracking
}

// ----------------------------------------------
// callGetMatterOverview helper function
// ----------------------------------------------
async function callGetMatterOverview(matterId: number) {
    const code = process.env.REACT_APP_GET_MATTER_OVERVIEW_CODE;
    const path = process.env.REACT_APP_GET_MATTER_OVERVIEW_PATH;
    const baseUrl = getProxyBaseUrl();
    if (!code || !path || !baseUrl) {
        console.error('Missing required environment variables for getMatterOverview');
        return null;
    }
    const url = `${baseUrl}/${path}?code=${code}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matterId: matterId }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error calling getMatterOverview:', errorText);
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error('Error calling getMatterOverview:', err);
        return null;
    }
}

// ----------------------------------------------
// callGetComplianceData helper function (new)
// ----------------------------------------------
async function callGetComplianceData(matterId: string, clientId: string): Promise<any> {
    const code = process.env.REACT_APP_GET_COMPLIANCE_DATA_CODE;
    const path = process.env.REACT_APP_GET_COMPLIANCE_DATA_PATH;
    const baseUrl = getProxyBaseUrl();
    if (!code || !path || !baseUrl) {
        console.error('Missing required environment variables for getComplianceData');
        return null;
    }
    const url = `${baseUrl}/${path}?code=${code}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matterId, clientId }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error calling getComplianceData:', errorText);
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error('Error calling getComplianceData:', err);
        return null;
    }
}

// ----------------------------------------------
// callGetMatterSpecificActivities helper function (new)
// ----------------------------------------------
async function callGetMatterSpecificActivities(matterId: string): Promise<any> {
    const code = process.env.REACT_APP_GET_MATTER_SPECIFIC_ACTIVITIES_CODE;
    const path = process.env.REACT_APP_GET_MATTER_SPECIFIC_ACTIVITIES_PATH;
    const baseUrl = getProxyBaseUrl();
    if (!code || !path || !baseUrl) {
        console.error('Missing required environment variables for getMatterSpecificActivities');
        return null;
    }
    const url = `${baseUrl}/${path}?code=${code}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matterId }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error calling getMatterSpecificActivities:', errorText);
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error('Error calling getMatterSpecificActivities:', err);
        return null;
    }
}

// ----------------------------------------------
// Helper function(s)
// ----------------------------------------------
function groupPracticeArea(practiceArea: string): "Commercial" | "Construction" | "Employment" | "Property" | "Miscellaneous" {
    if (!practiceArea) return 'Miscellaneous';
    const p = practiceArea.trim().toLowerCase();
    const commercialGroup = [
        'commercial',
        'director rights & dispute advice',
        'shareholder rights & dispute advice',
        'civil/commercial fraud advice',
        'partnership advice',
        'business contract dispute',
        'unpaid loan recovery',
        'contentious probate',
        'statutory demand - Drafting',
        'Statutory Demand - Advising',
        'winding up petition advice',
        'bankruptcy petition advice',
        'injunction advice',
        'intellectual property',
        'professional negligence',
        'unpaid invoice/debt dispute',
        'commercial contract - drafting',
        'company restoration',
        'small claim advice',
        'trust advice',
        'terms and conditions - drafting',
    ];
    if (commercialGroup.includes(p)) return 'Commercial';

    const constructionGroup = [
        'final account recovery',
        'retention recovery advice',
        'adjudication advice & dispute',
        'construction contract advice',
        'interim payment recovery',
        'contract dispute',
    ];
    if (constructionGroup.includes(p)) return 'Construction';

    const propertyGroup = [
        'landlord & tenant - commercial dispute',
        'landlord & tenant - residential dispute',
        'boundary and nuisance advice',
        'boundary & nuisance advice',
        'trust of land (tolata) advice',
        'service charge recovery & dispute advice',
        'breach of lease advice',
        'terminal dilapidations advice',
        'investment sale and ownership - advice',
        'trespass',
        'right of way',
    ];
    if (propertyGroup.includes(p)) return 'Property';

    const employmentGroup = [
        'employment contract - drafting',
        'employment retainer instruction',
        'settlement agreement - drafting',
        'settlement agreement - advising',
        'handbook - drafting',
        'policy - drafting',
        'redundancy - advising',
        'sick leave - advising',
        'disciplinary - advising',
        'restrictive covenant advice',
        'post termination dispute',
        'employment tribunal claim - advising',
    ];
    if (employmentGroup.includes(p)) return 'Employment';

    // Fallback to "Miscellaneous" if no match
    return 'Miscellaneous';
}



function getGroupColor(group: string): string {
    switch (group) {
        case 'Commercial':
            return '#0078d4';
        case 'Construction':
            return '#ff8c00';
        case 'Property':
            return '#107c10';
        case 'Employment':
            return '#ffb900';
        case 'Miscellaneous':
        default:
            return '#d13438';
    }
}

function getGroupIcon(group: string): string {
    switch (group) {
        case 'Commercial':
            return 'KnowledgeArticle';
        case 'Construction':
            return 'ConstructionCone';
        case 'Property':
            return 'CityNext';
        case 'Employment':
            return 'People';
        case 'Miscellaneous':
        default:
            return 'Help';
    }
}

// 1) Define two detail styles near the top (just like you do for the main page)
const outerDetailContainerStyle = (isDarkMode: boolean) =>
    mergeStyles({
        width: '100%',
        padding: '20px',
        minHeight: '100vh',
        backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
        fontFamily: 'Raleway, sans-serif',
    });

const innerDetailCardStyle = (isDarkMode: boolean) =>
    mergeStyles({
        padding: '30px',
        boxShadow: isDarkMode
            ? '0 4px 16px rgba(0,0,0,0.6)'
            : '0 4px 16px rgba(0,0,0,0.1)',
        backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
    });

const containerStyle = (isDarkMode: boolean) =>
    mergeStyles({
        padding: '20px',
        backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
        minHeight: '100vh',
        fontFamily: 'Raleway, sans-serif',
    });

const mainContentStyle = (isDarkMode: boolean) =>
    mergeStyles({
        flex: 1,
        paddingBottom: '40px',
    });

const overviewCardStyle = mergeStyles({
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    padding: '30px',
    marginBottom: '20px',
});

const chartContainerStyle = mergeStyles({
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    padding: '20px',
    marginTop: '20px',
    height: '500px',
});

const dateSliderContainerStyle = mergeStyles({
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
});

const getTeamButtonStyles = (isDarkMode: boolean, active: boolean): IButtonStyles => {
    const activeBackground = active 
        ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
        : (isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'transparent');
    
    const activeBorder = active
        ? `2px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
        : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

    const textColor = active ? '#ffffff' : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

    return {
        root: {
            borderRadius: 999,
            minHeight: 32,
            height: 32,
            padding: '0 8px',
            fontWeight: active ? 700 : 600,
            fontSize: 12,
            border: activeBorder,
            background: activeBackground,
            color: textColor,
            boxShadow: active 
                ? (isDarkMode ? '0 2px 8px rgba(54, 144, 206, 0.3)' : '0 2px 8px rgba(54, 144, 206, 0.25)')
                : 'none',
            fontFamily: 'Raleway, sans-serif',
            transform: active ? 'translateY(-1px)' : 'none',
            transition: 'all 0.2s ease',
        },
        rootHovered: {
            background: active 
                ? `linear-gradient(135deg, #2f7cb3 0%, #266795 100%)` 
                : (isDarkMode ? 'rgba(15, 23, 42, 0.86)' : 'rgba(54, 144, 206, 0.1)'),
            transform: 'translateY(-1px)',
            boxShadow: active 
                ? (isDarkMode ? '0 4px 12px rgba(54, 144, 206, 0.4)' : '0 4px 12px rgba(54, 144, 206, 0.35)')
                : (isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 2px 4px rgba(15, 23, 42, 0.05)'),
        },
        rootPressed: {
            background: active 
                ? `linear-gradient(135deg, #266795 0%, #1e5a7a 100%)` 
                : (isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(54, 144, 206, 0.14)'),
            transform: 'translateY(0)',
        },
    };
};

const getRoleButtonStyles = (isDarkMode: boolean, active: boolean): IButtonStyles => {
    const activeBackground = active 
        ? `linear-gradient(135deg, ${colours.highlight} 0%, #2f7cb3 100%)`
        : (isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'transparent');
    
    const activeBorder = active
        ? `2px solid ${isDarkMode ? '#87ceeb' : colours.highlight}`
        : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;

    const textColor = active ? '#ffffff' : (isDarkMode ? '#E2E8F0' : colours.missedBlue);

    return {
        root: {
            borderRadius: 999,
            minHeight: 32,
            height: 32,
            padding: '0 12px',
            fontWeight: active ? 700 : 600,
            fontSize: 12,
            border: activeBorder,
            background: activeBackground,
            color: textColor,
            boxShadow: active 
                ? (isDarkMode ? '0 2px 8px rgba(54, 144, 206, 0.3)' : '0 2px 8px rgba(54, 144, 206, 0.25)')
                : 'none',
            fontFamily: 'Raleway, sans-serif',
            transform: active ? 'translateY(-1px)' : 'none',
            transition: 'all 0.2s ease',
        },
        rootHovered: {
            background: active 
                ? `linear-gradient(135deg, #2f7cb3 0%, #266795 100%)` 
                : (isDarkMode ? 'rgba(15, 23, 42, 0.86)' : 'rgba(54, 144, 206, 0.1)'),
            transform: 'translateY(-1px)',
            boxShadow: active 
                ? (isDarkMode ? '0 4px 12px rgba(54, 144, 206, 0.4)' : '0 4px 12px rgba(54, 144, 206, 0.35)')
                : (isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 2px 4px rgba(15, 23, 42, 0.05)'),
        },
        rootPressed: {
            background: active 
                ? `linear-gradient(135deg, #266795 0%, #1e5a7a 100%)` 
                : (isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(54, 144, 206, 0.14)'),
            transform: 'translateY(0)',
        },
    };
};

const clearFilterButtonStyle = (isDarkMode: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 12px',
    height: 32,
    borderRadius: 8,
    border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)'}`,
    background: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(254, 242, 242, 0.85)',
    color: isDarkMode ? '#fca5a5' : '#dc2626',
    gap: 6,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'Raleway, sans-serif',
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: 'nowrap',
});

const renderCustomLegend = (props: any) => {
    const { payload } = props;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', fontFamily: 'Raleway, sans-serif' }}>
            {payload.map((entry: any, index: number) => (
                <div
                    key={`legend-item-${index}`}
                    style={{ display: 'flex', alignItems: 'center', marginRight: 20 }}
                >
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            backgroundColor: getGroupColor(entry.value),
                            marginRight: 8,
                        }}
                    />
                    <span style={{ color: getGroupColor(entry.value), fontWeight: 500 }}>
                        {entry.value.charAt(0).toUpperCase() + entry.value.slice(1)}
                    </span>
                </div>
            ))}
        </div>
    );
};

interface CustomLabelProps {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    value?: number | string;
    dataKey: string;
    isDarkMode: boolean;
}
const CustomLabel: React.FC<CustomLabelProps> = ({
    x,
    y,
    width,
    height,
    value,
    dataKey,
    isDarkMode,
}) => {
    const numX = typeof x === 'number' ? x : Number(x);
    const numY = typeof y === 'number' ? y : Number(y);
    const numWidth = typeof width === 'number' ? width : Number(width);
    const numHeight = typeof height === 'number' ? height : Number(height);
    const numValue = typeof value === 'number' ? value : Number(value);
    if ([numX, numY, numWidth, numHeight, numValue].some((n) => isNaN(n))) return null;
    return (
        <text
            x={numX + numWidth / 2}
            y={numY + numHeight / 2 - 5}
            textAnchor="middle"
            fill={getGroupColor(dataKey)}
            fontSize={12}
            fontFamily="Raleway, sans-serif"
        >
            {numValue}
        </text>
    );
};

// ---------------------------------------------------
// (A) Types
// ---------------------------------------------------
interface MonthlyData {
    month: string;
    [key: string]: string | number;
}

interface MattersReportProps {
    matters: Matter[];
    isLoading?: boolean;
    error?: string | null;
    userData: any;
    teamData?: TeamData[] | null;
    outstandingBalances?: any;
    deals?: DealRecord[] | null;
    instructions?: InstructionRecord[] | null;
    transactions?: Transaction[];
    wip?: WIP[] | null;
    recoveredFees?: RecoveredFee[] | null;
    enquiries?: Enquiry[] | null;
    wipRangeKey?: string;
    wipRangeOptions?: Array<{ key: string; label: string }>;
    onWipRangeChange?: (key: string) => void;
    wipRangeIsRefreshing?: boolean;
    dataWindowDays?: number;
}

const DEFAULT_WIP_RANGE_OPTIONS = [
    { key: '3m', label: '90 days' },
    { key: '6m', label: '6 months' },
    { key: '12m', label: '12 months' },
    { key: '24m', label: '24 months' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------
// Financial calculation helpers
// ---------------------------------------------------
// NOTE: These are now used primarily for single-matter lookups or inside the pre-calculation memo.
// We avoid calling these inside sort functions directly to prevent O(N*M) performance issues.

const calculateMatterWIP = (matter: Matter, wipData?: WIP[] | null): number => {
    if (!wipData || !Array.isArray(wipData)) return 0;
    
    const displayNumber = (matter as any)['Display Number'] || matter.DisplayNumber || '';
    const matterUniqueId = (matter as any)['Unique ID'] || matter.UniqueID || '';
    
    return wipData
        .filter(entry => {
            const entryMatter = (entry as any).matter_id || (entry as any).matter_ref || '';
            return String(entryMatter) === displayNumber || String(entryMatter) === matterUniqueId;
        })
        .reduce((sum, entry) => sum + (entry.total || 0), 0);
};

const calculateMatterCollected = (matter: Matter, recoveredData?: RecoveredFee[] | null): number => {
    if (!recoveredData || !Array.isArray(recoveredData)) return 0;
    
    const displayNumber = (matter as any)['Display Number'] || matter.DisplayNumber || '';
    const matterUniqueId = (matter as any)['Unique ID'] || matter.UniqueID || '';
    
    return recoveredData
        .filter(entry => {
            const entryMatter = (entry as any).matter_id || (entry as any).bill_id || '';
            const entryMatterStr = String(entryMatter);
            const entryDesc = (entry as any).description || '';
            
            return entryMatterStr === displayNumber || 
                   entryMatterStr === matterUniqueId ||
                   entryDesc.includes(displayNumber);
        })
        .reduce((sum, entry) => sum + (entry.payment_allocated || 0), 0);
};

const normaliseKey = (value: unknown): string => {
    if (value == null) return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    return String(value)
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
};

const toKeySet = (values: unknown[]): string[] => {
    const seen = new Set<string>();
    values.forEach((value) => {
        const key = normaliseKey(value);
        if (key) {
            seen.add(key);
        }
    });
    return Array.from(seen);
};

const extractMatterKeys = (matter: Matter): string[] => {
    return toKeySet([
        (matter as any)['Display Number'],
        matter.DisplayNumber,
        (matter as any)['DisplayNumber'],
        (matter as any)['Unique ID'],
        matter.UniqueID,
        (matter as any).unique_id,
        (matter as any).MatterID,
        (matter as any).MatterId,
        (matter as any).MatterRef,
        (matter as any)['Matter Ref'],
        (matter as any).ID,
    ]);
};

const extractDealKeys = (deal: DealRecord | undefined): string[] => {
    if (!deal) return [];
    return toKeySet([
        deal.InstructionRef,
        (deal as any).instruction_ref,
        (deal as any).InstructionId,
        (deal as any).instructionId,
        (deal as any).MatterId,
        (deal as any).matterId,
    ]);
};

const extractInstructionKeys = (instruction: InstructionRecord | undefined): string[] => {
    if (!instruction) return [];
    return toKeySet([
        instruction.InstructionRef,
        instruction.MatterId,
        (instruction as any).MatterID,
        instruction.ClientId,
        (instruction as any).matter_ref,
    ]);
};

const buildDealIdentifier = (deal: DealRecord): string => {
    if (typeof deal.DealId === 'number') return `deal-${deal.DealId}`;
    if (deal.InstructionRef) return `deal-${deal.InstructionRef}`;
    return `deal-${normaliseKey(`${deal.PitchedBy ?? ''}-${deal.ServiceDescription ?? ''}-${deal.PitchedDate ?? ''}`)}`;
};

const buildInstructionIdentifier = (instruction: InstructionRecord): string => {
    if (instruction.InstructionRef) return `inst-${instruction.InstructionRef}`;
    if (instruction.MatterId) return `inst-${instruction.MatterId}`;
    return `inst-${normaliseKey(`${instruction.ClientId ?? ''}-${instruction.Stage ?? instruction.Status ?? ''}`)}`;
};

const MAX_PITCH_TAGS = 3;

const formatDateLabel = (value?: string): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, 'dd MMM yyyy');
};

const describeDealTag = (deal: DealRecord) => {
    const status = (deal.Status || deal.Stage || '').trim();
    const service = (deal.ServiceDescription || '').trim();
    const owner = (deal.PitchedBy || '').trim();
    const label = status ? `Pitch • ${status}` : (service ? `Pitch • ${service}` : 'Pitch');
    const titleParts: string[] = [];
    if (service) titleParts.push(service);
    if (owner) titleParts.push(`By ${owner}`);
    const pitchedDate = formatDateLabel(deal.PitchedDate || deal.CreatedDate);
    if (pitchedDate) titleParts.push(pitchedDate);
    return { label, title: titleParts.length > 0 ? titleParts.join(' • ') : undefined };
};

const describeInstructionTag = (instruction: InstructionRecord) => {
    const stage = (instruction.Stage || instruction.Status || '').trim();
    const label = stage ? `Instruction • ${stage}` : 'Instruction';
    const titleParts: string[] = [];
    if (instruction.InstructionRef) titleParts.push(instruction.InstructionRef);
    const submitted = formatDateLabel(instruction.SubmissionDate || instruction.CreatedDate);
    if (submitted) titleParts.push(submitted);
    return { label, title: titleParts.length > 0 ? titleParts.join(' • ') : undefined };
};

const pitchTagContainerBaseStyle: CSSProperties = {
    marginTop: 6,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
};

const formatCurrency = (amount: number): string => {
    if (amount === 0) return '£0';
    if (amount >= 1000000) return `£${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `£${(amount / 1000).toFixed(1)}k`;
    return `£${amount.toLocaleString()}`;
};

type FinancialSourceTotals = { clio: number; sql: number; manual: number };

interface FinancialAggregateEntry {
    wip: number;
    collected: number;
    wipSources: FinancialSourceTotals;
    collectedSources: FinancialSourceTotals;
    wipEntries: number;
    collectedEntries: number;
    lastUpdated: number | null;
}

interface MatterFinancialDetail extends FinancialAggregateEntry {
    roi: number;
    roiSources: { clioRoi: number; sqlRoi: number; manualRoi: number };
}

interface NormalizedMatterIdentifiers {
    cacheKey: string;
    lookupKeys: string[];
}

const SOURCE_KEYS: Array<keyof FinancialSourceTotals> = ['clio', 'sql', 'manual'];

const createSourceTotals = (): FinancialSourceTotals => ({ clio: 0, sql: 0, manual: 0 });

const createAggregateEntry = (): FinancialAggregateEntry => ({
    wip: 0,
    collected: 0,
    wipSources: createSourceTotals(),
    collectedSources: createSourceTotals(),
    wipEntries: 0,
    collectedEntries: 0,
    lastUpdated: null,
});

const createMatterFinancialDetail = (): MatterFinancialDetail => ({
    ...createAggregateEntry(),
    roi: 0,
    roiSources: { clioRoi: 0, sqlRoi: 0, manualRoi: 0 },
});

const normalizeSourceKey = (source: unknown): keyof FinancialSourceTotals => {
    const normalized = typeof source === 'string' ? source.trim().toLowerCase() : '';
    if (normalized === 'clio') return 'clio';
    if (normalized === 'manual') return 'manual';
    return 'sql';
};

const normalizeIdValue = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    const str = String(value).trim();
    return str;
};

const normalizeMatterIdentifiers = (matter: Matter, fallbackKey: string): NormalizedMatterIdentifiers => {
    const candidateValues: unknown[] = [
        (matter as any)['Display Number'],
        matter.DisplayNumber,
        (matter as any)['Unique ID'],
        matter.UniqueID,
        (matter as any).matter_id,
        (matter as any).matter_ref,
        (matter as any).id,
        (matter as any).Id,
    ];

    const lookupKeys = Array.from(
        new Set(
            candidateValues
                .map(normalizeIdValue)
                .filter(Boolean)
        )
    );

    const cacheKey = lookupKeys.join('::') || fallbackKey;

    return { cacheKey, lookupKeys };
};

const pickLatestTimestamp = (current: number | null, candidate: number | null): number | null => {
    if (candidate === null) return current;
    if (current === null || candidate > current) return candidate;
    return current;
};

const resolveEntryTimestamp = (entry: any): number | null => {
    if (!entry || typeof entry !== 'object') return null;
    const timestampFields = ['last_updated', 'updated_at', 'updatedAt', 'modified_at', 'modifiedAt', 'timestamp'];
    for (const field of timestampFields) {
        if (entry[field]) {
            const value = entry[field];
            const parsed = typeof value === 'number' ? value : Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
    }
    return null;
};

const computeRoiForDetail = (detail: MatterFinancialDetail): MatterFinancialDetail => {
    detail.roi = detail.wip > 0 ? ((detail.collected - detail.wip) / detail.wip) * 100 : 0;
    detail.roiSources.clioRoi = detail.wipSources.clio > 0
        ? ((detail.collectedSources.clio - detail.wipSources.clio) / detail.wipSources.clio) * 100
        : 0;
    detail.roiSources.sqlRoi = detail.wipSources.sql > 0
        ? ((detail.collectedSources.sql - detail.wipSources.sql) / detail.wipSources.sql) * 100
        : 0;
    detail.roiSources.manualRoi = detail.wipSources.manual > 0
        ? ((detail.collectedSources.manual - detail.wipSources.manual) / detail.wipSources.manual) * 100
        : 0;
    return detail;
};

const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const resolveFinancialEntryKey = (entry: any): string => {
    if (!entry || typeof entry !== 'object') return '';
    const candidates = ['matter_id', 'matterId', 'matter_ref', 'matterRef', 'bill_id', 'billId'];
    for (const field of candidates) {
        if (entry[field]) {
            const normalized = normalizeIdValue(entry[field]);
            if (normalized) return normalized;
        }
    }
    return '';
};

const getMatterSourceLabel = (matter: Matter): string => {
    const raw = (matter as any)['Source'] ?? (matter as any).Source ?? matter.Source ?? '';
    return raw ? String(raw).trim() : 'Unknown';
};

// Helper function to get data source quality score
const getDataQualityScore = (wipSources: { clio: number; sql: number; manual: number }, collectedSources: { clio: number; sql: number; manual: number }): { score: number; description: string } => {
    const totalWip = wipSources.clio + wipSources.sql + wipSources.manual;
    const totalCollected = collectedSources.clio + collectedSources.sql + collectedSources.manual;
    
    if (totalWip === 0 && totalCollected === 0) {
        return { score: 0, description: 'No data available' };
    }
    
    // Higher score for more automated data sources (Clio > SQL > Manual)
    const wipScore = totalWip > 0 ? (
        (wipSources.clio * 3 + wipSources.sql * 2 + wipSources.manual * 1) / (totalWip * 3) * 100
    ) : 0;
    
    const collectedScore = totalCollected > 0 ? (
        (collectedSources.clio * 3 + collectedSources.sql * 2 + collectedSources.manual * 1) / (totalCollected * 3) * 100
    ) : 0;
    
    const overallScore = totalWip > 0 && totalCollected > 0 
        ? (wipScore + collectedScore) / 2
        : Math.max(wipScore, collectedScore);
    
    let description = 'Mixed sources';
    if (overallScore >= 90) description = 'Excellent - mostly Clio';
    else if (overallScore >= 70) description = 'Good - mostly automated';
    else if (overallScore >= 50) description = 'Fair - some manual data';
    else description = 'Poor - mostly manual';
    
    return { score: Math.round(overallScore), description };
};

// Helper function to format ROI with context
const formatROI = (roi: number, wipSources: { clio: number; sql: number; manual: number }, collectedSources: { clio: number; sql: number; manual: number }): { display: string; color: string; reliability: string } => {
    const quality = getDataQualityScore(wipSources, collectedSources);
    
    let color = '#6b7280'; // gray for no data
    let reliability = 'No data';
    
    if (quality.score > 0) {
        // Color based on ROI performance
        if (roi >= 50) color = '#059669'; // green for good ROI
        else if (roi >= 0) color = '#d97706'; // amber for break-even
        else color = '#dc2626'; // red for negative ROI
        
        // Reliability based on data quality
        reliability = quality.score >= 70 ? 'High' : quality.score >= 50 ? 'Medium' : 'Low';
    }
    
    const display = quality.score > 0 ? `${roi.toFixed(1)}%` : '—';
    
    return { display, color, reliability };
};

// ---------------------------------------------------
// Matters component
// ---------------------------------------------------
const MattersReport: React.FC<MattersReportProps> = ({
    matters,
    isLoading = false,
    error = null,
    userData,
    teamData,
    outstandingBalances,
    deals,
    instructions,
    transactions,
    wip,
    recoveredFees,
    enquiries,
    wipRangeKey,
    wipRangeOptions,
    onWipRangeChange,
    wipRangeIsRefreshing,
    dataWindowDays,
}) => {
    const { isDarkMode } = useTheme();
    const { setContent } = useNavigatorActions();

    // --- Performance Optimization: Pre-calculate Financial Data ---
    const financialDataMap = useMemo(() => {
        const map = new Map<string, FinancialAggregateEntry>();

        const touchEntry = (key: string): FinancialAggregateEntry | null => {
            if (!key) return null;
            if (!map.has(key)) {
                map.set(key, createAggregateEntry());
            }
            return map.get(key)!;
        };

        const upsertEntry = (entry: any, type: 'wip' | 'collected') => {
            const key = resolveFinancialEntryKey(entry);
            const aggregate = touchEntry(key);
            if (!aggregate) return;

            const sourceKey = normalizeSourceKey(entry?.source);
            if (type === 'wip') {
                const amount = toNumber(entry?.total ?? entry?.amount ?? 0);
                aggregate.wip += amount;
                aggregate.wipSources[sourceKey] += amount;
                aggregate.wipEntries += 1;
            } else {
                const amount = toNumber(entry?.payment_allocated ?? entry?.amount ?? entry?.total ?? 0);
                aggregate.collected += amount;
                aggregate.collectedSources[sourceKey] += amount;
                aggregate.collectedEntries += 1;
            }

            const timestamp = resolveEntryTimestamp(entry);
            aggregate.lastUpdated = pickLatestTimestamp(aggregate.lastUpdated, timestamp);
        };

        if (Array.isArray(wip)) {
            wip.forEach(entry => upsertEntry(entry, 'wip'));
        }

        if (Array.isArray(recoveredFees)) {
            recoveredFees.forEach(entry => upsertEntry(entry, 'collected'));
        }
        
        return map;
    }, [wip, recoveredFees]);

    const matterIdentifierCache = useMemo(() => {
        const cache = new WeakMap<Matter, NormalizedMatterIdentifiers>();
        matters.forEach((matter, index) => {
            cache.set(matter, normalizeMatterIdentifiers(matter, `idx-${index}`));
        });
        return cache;
    }, [matters]);

    const matterFinancialDetails = useMemo(() => {
        const detailMap = new Map<string, MatterFinancialDetail>();
        matters.forEach(matter => {
            const identifiers = matterIdentifierCache.get(matter);
            if (!identifiers) return;

            const detail = createMatterFinancialDetail();
            identifiers.lookupKeys.forEach(key => {
                const aggregate = financialDataMap.get(key);
                if (!aggregate) return;

                detail.wip += aggregate.wip;
                detail.collected += aggregate.collected;
                detail.wipEntries += aggregate.wipEntries;
                detail.collectedEntries += aggregate.collectedEntries;
                SOURCE_KEYS.forEach(sourceKey => {
                    detail.wipSources[sourceKey] += aggregate.wipSources[sourceKey];
                    detail.collectedSources[sourceKey] += aggregate.collectedSources[sourceKey];
                });
                detail.lastUpdated = pickLatestTimestamp(detail.lastUpdated, aggregate.lastUpdated);
            });

            detailMap.set(identifiers.cacheKey, computeRoiForDetail(detail));
        });
        return detailMap;
    }, [financialDataMap, matterIdentifierCache, matters]);

    const getMatterFinancials = useCallback((matter: Matter) => {
        const identifiers = matterIdentifierCache.get(matter);
        if (!identifiers) {
            return { wip: 0, collected: 0 };
        }
        const detail = matterFinancialDetails.get(identifiers.cacheKey);
        if (!detail) {
            return { wip: 0, collected: 0 };
        }
        return { wip: detail.wip, collected: detail.collected };
    }, [matterFinancialDetails, matterIdentifierCache]);

    const getMatterFinancialsDetailed = useCallback((matter: Matter) => {
        const identifiers = matterIdentifierCache.get(matter);
        if (!identifiers) {
            return createMatterFinancialDetail();
        }
        return matterFinancialDetails.get(identifiers.cacheKey) ?? createMatterFinancialDetail();
    }, [matterFinancialDetails, matterIdentifierCache]);

    // --- Performance Optimization: Pre-calculate Date Timestamps ---
    const matterTimestamps = useMemo(() => {
        const map = new Map<string, number>();
        matters.forEach(m => {
            const dateStr = (m as any)['Open Date'] || m.OpenDate;
            const ts = dateStr ? parseISO(dateStr).getTime() : 0;
            map.set(m.UniqueID, ts);
        });
        return map;
    }, [matters]);

    const pitchTagContainerStyle = pitchTagContainerBaseStyle;
    const getPitchTagStyle = useCallback((type: MatterPitchTag['type']): CSSProperties => {
        const palette = (() => {
            switch (type) {
                case 'deal':
                    return {
                        bg: isDarkMode ? 'rgba(249, 115, 22, 0.2)' : 'rgba(251, 191, 36, 0.15)',
                        border: isDarkMode ? 'rgba(251, 191, 36, 0.5)' : 'rgba(245, 158, 11, 0.5)',
                        color: isDarkMode ? '#fb923c' : '#92400e',
                    };
                case 'instruction':
                    return {
                        bg: isDarkMode ? 'rgba(34, 197, 94, 0.18)' : 'rgba(16, 185, 129, 0.12)',
                        border: isDarkMode ? 'rgba(74, 222, 128, 0.45)' : 'rgba(34, 197, 94, 0.45)',
                        color: isDarkMode ? '#86efac' : '#064e3b',
                    };
                default:
                    return {
                        bg: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.14)',
                        border: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.35)',
                        color: isDarkMode ? '#cbd5e1' : '#475569',
                    };
            }
        })();

        return {
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 999,
            background: palette.bg,
            border: `1px solid ${palette.border}`,
            color: palette.color,
        };
    }, [isDarkMode]);

    // Sortable header component
    const SortableHeader: React.FC<{
        field: SortField;
        label: string;
        currentField: SortField | null;
        direction: 'asc' | 'desc';
        onSort: (field: SortField) => void;
        isDarkMode: boolean;
        textAlign?: 'left' | 'center';
        width?: number | string;
    }> = ({ field, label, currentField, direction, onSort, isDarkMode, textAlign = 'left', width }) => {
        const isActive = currentField === field;
        
        return (
            <th 
                onClick={() => onSort(field)}
                style={{
                    textAlign,
                    width,
                    minWidth: width,
                    padding: '6px 8px',
                    borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
                    fontWeight: 600,
                    color: isDarkMode ? '#cbd5e1' : '#374151',
                    textTransform: 'uppercase',
                    letterSpacing: '0.2px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    position: 'relative',
                    background: isActive 
                        ? (isDarkMode ? '#1e293b' : '#f3f4f6')
                        : 'transparent',
                    transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = isDarkMode ? '#1e293b' : '#f9fafb';
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                    }
                }}
            >
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: textAlign === 'center' ? 'center' : 'space-between',
                    gap: '4px'
                }}>
                    <span>{label}</span>
                    <Icon 
                        iconName={isActive ? (direction === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronUpSmall'}
                        style={{ 
                            fontSize: '12px',
                            opacity: isActive ? 1 : 0.4,
                            transition: 'opacity 0.15s ease',
                            color: isDarkMode ? '#cbd5e1' : '#374151'
                        }}
                    />
                </div>
            </th>
        );
    };

    const ACTION_BAR_HEIGHT = 48;

    const backButtonStyle = mergeStyles({
        width: 32,
        height: 32,
        borderRadius: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#f3f3f3',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        marginRight: 8,
    });

    function detailNavStyle(dark: boolean) {
        return mergeStyles({
            backgroundColor: dark ? colours.dark.sectionBackground : colours.light.sectionBackground,
            boxShadow: dark ? '0 2px 4px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.1)',
            borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
            padding: '8px 16px',
            display: 'flex',
            flexDirection: 'row',
            gap: '8px',
            alignItems: 'center',
            height: ACTION_BAR_HEIGHT,
            position: 'sticky',
            top: ACTION_BAR_HEIGHT,
            zIndex: 999,
        });
    }

    // ---------- Filter States ----------
    const [activeGroupedArea, setActiveGroupedArea] = useState<string | null>(null);
    const [activePracticeAreas, setActivePracticeAreas] = useState<string[]>([]);
    const [activeState, setActiveState] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [isSearchActive, setSearchActive] = useState<boolean>(false);
    const [activeFeeEarner, setActiveFeeEarner] = useState<string | null>(null);
    const [feeEarnerType, setFeeEarnerType] = useState<'Originating' | 'Responsible' | null>(null);
    
    // ---------- Date Range States (ManagementDashboard pattern) ----------
    type RangeKey = 'all' | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth' | 'last90Days' | 'quarter' | 'yearToDate' | 'year' | 'custom';
    const [rangeKey, setRangeKey] = useState<RangeKey>('all');
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);
    const [showDatasetInfo, setShowDatasetInfo] = useState<boolean>(false);

    const dealsIndex = useMemo(() => {
        const map = new Map<string, DealRecord[]>();
        if (!Array.isArray(deals)) {
            return map;
        }
        deals.forEach((deal) => {
            extractDealKeys(deal).forEach((key) => {
                if (!key) return;
                const bucket = map.get(key);
                if (bucket) {
                    bucket.push(deal);
                } else {
                    map.set(key, [deal]);
                }
            });
        });
        return map;
    }, [deals]);

    const instructionsIndex = useMemo(() => {
        const map = new Map<string, InstructionRecord[]>();
        if (!Array.isArray(instructions)) {
            return map;
        }
        instructions.forEach((instruction) => {
            extractInstructionKeys(instruction).forEach((key) => {
                if (!key) return;
                const bucket = map.get(key);
                if (bucket) {
                    bucket.push(instruction);
                } else {
                    map.set(key, [instruction]);
                }
            });
        });
        return map;
    }, [instructions]);

    const getMatterAssociations = useCallback((matter: Matter) => {
        const keys = extractMatterKeys(matter);
        if (keys.length === 0) {
            return { deals: [] as DealRecord[], instructions: [] as InstructionRecord[] };
        }
        const matchedDeals: DealRecord[] = [];
        const matchedInstructions: InstructionRecord[] = [];
        const dealSeen = new Set<string>();
        const instructionSeen = new Set<string>();

        keys.forEach((key) => {
            const dealMatches = dealsIndex.get(key);
            if (dealMatches) {
                dealMatches.forEach((deal) => {
                    const identifier = buildDealIdentifier(deal);
                    if (!dealSeen.has(identifier)) {
                        dealSeen.add(identifier);
                        matchedDeals.push(deal);
                    }
                });
            }

            const instructionMatches = instructionsIndex.get(key);
            if (instructionMatches) {
                instructionMatches.forEach((instruction) => {
                    const identifier = buildInstructionIdentifier(instruction);
                    if (!instructionSeen.has(identifier)) {
                        instructionSeen.add(identifier);
                        matchedInstructions.push(instruction);
                    }
                });
            }
        });

        return { deals: matchedDeals, instructions: matchedInstructions };
    }, [dealsIndex, instructionsIndex]);

    const getPitchTagsForMatter = useCallback((matter: Matter): MatterPitchTag[] => {
        const associations = getMatterAssociations(matter);
        if (associations.deals.length === 0 && associations.instructions.length === 0) {
            return [];
        }

        const tags: MatterPitchTag[] = [];
        const pushTag = (tag: MatterPitchTag) => {
            if (tags.length < MAX_PITCH_TAGS) {
                tags.push(tag);
            }
        };

        const sortedDeals = [...associations.deals].sort((a, b) => {
            const aDate = Date.parse(a.PitchedDate ?? a.CreatedDate ?? '') || 0;
            const bDate = Date.parse(b.PitchedDate ?? b.CreatedDate ?? '') || 0;
            return bDate - aDate;
        });

        const sortedInstructions = [...associations.instructions].sort((a, b) => {
            const aDate = Date.parse(a.SubmissionDate ?? a.CreatedDate ?? '') || 0;
            const bDate = Date.parse(b.SubmissionDate ?? b.CreatedDate ?? '') || 0;
            return bDate - aDate;
        });

        sortedDeals.forEach((deal) => {
            const { label, title } = describeDealTag(deal);
            pushTag({
                key: buildDealIdentifier(deal),
                label,
                type: 'deal',
                title,
            });
        });

        sortedInstructions.forEach((instruction) => {
            const { label, title } = describeInstructionTag(instruction);
            pushTag({
                key: buildInstructionIdentifier(instruction),
                label,
                type: 'instruction',
                title,
            });
        });

        const totalMatches = associations.deals.length + associations.instructions.length;
        if (totalMatches > tags.length) {
            tags.push({
                key: `extra-${matter.UniqueID ?? extractMatterKeys(matter)[0] ?? 'row'}`,
                label: `+${totalMatches - tags.length} more`,
                type: 'extra',
            });
        }

        return tags;
    }, [getMatterAssociations]);
    
    // ---------- Sorting States ----------
    type SortField = 'displayNumber' | 'clientName' | 'practiceArea' | 'openDate' | 'originatingSolicitor' | 'responsibleSolicitor' | 'status' | 'wipValue' | 'collectedValue' | 'roiValue' | 'source';
    const [sortField, setSortField] = useState<SortField>('openDate');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // ---------- Expanded Rows (for source tray) ----------
    const [expandedMatterId, setExpandedMatterId] = useState<string | null>(null);
    
    // ---------- Team and Role Filter States ----------
    const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [showRoleFilter, setShowRoleFilter] = useState<boolean>(false);
    
    // Last refreshed timestamp for the toolbar status chip
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(new Date());
    const [timeSinceRefresh, setTimeSinceRefresh] = useState<string>('just now');

    const ROLE_OPTIONS = [
        { key: 'Partner', label: 'Partner' },
        { key: 'Associate Solicitor', label: 'Associate' },
        { key: 'Solicitor', label: 'Solicitor' },
        { key: 'Paralegal', label: 'Paralegal' },
        { key: 'Ops', label: 'Ops' },
        { key: 'Inactive', label: 'Inactive' },
    ] as const;
    
    const RANGE_OPTIONS = [
        { key: 'today' as RangeKey, label: 'Today' },
        { key: 'yesterday' as RangeKey, label: 'Yesterday' },
        { key: 'week' as RangeKey, label: 'This Week' },
        { key: 'lastWeek' as RangeKey, label: 'Last Week' },
        { key: 'month' as RangeKey, label: 'This Month' },
        { key: 'lastMonth' as RangeKey, label: 'Last Month' },
        { key: 'last90Days' as RangeKey, label: 'Last 90 Days' },
        { key: 'quarter' as RangeKey, label: 'This Quarter' },
        { key: 'yearToDate' as RangeKey, label: 'Year To Date' },
        { key: 'year' as RangeKey, label: 'Current Year' },
    ];

    // (A) The base matter from SQL
    const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);

    const allowedUsers = ['LZ', 'LUKE', 'LUKASZ'];
    const userInitials = userData?.[0]?.Initials?.toUpperCase() || '';
    const userFirstName =
        userData && userData.length > 0 ? userData[0].First.trim().toUpperCase() : '';
    const isLocalhost = window.location.hostname === 'localhost';
    const canViewDocuments =
        allowedUsers.includes(userInitials) || allowedUsers.includes(userFirstName) || isLocalhost;

    // (B) The structured extra data from getMatterOverview
    const [matterOverview, setMatterOverview] = useState<any>(null);

    // (C) The raw JSON string (for debugging display in a MessageBar)
    const [overviewResponse, setOverviewResponse] = useState<string>('');

    // NEW: State to hold compliance data
    const [complianceData, setComplianceData] = useState<any>(null);

    // NEW: State to hold matter-specific activities data
    const [matterSpecificActivities, setMatterSpecificActivities] = useState<any>(null);

    // ---------- Infinite Scroll ----------
    const [itemsToShow, setItemsToShow] = useState<number>(20);
    const loader = useRef<HTMLDivElement | null>(null);

    const [activeTab, setActiveTab] = useState('Overview'); // Add this near your other state
    const resolvedWipRangeOptions = useMemo(
        () => (wipRangeOptions && wipRangeOptions.length > 0 ? wipRangeOptions : DEFAULT_WIP_RANGE_OPTIONS),
        [wipRangeOptions]
    );
    const activeWipRangeKey = wipRangeKey ?? resolvedWipRangeOptions[0]?.key ?? 'default';
    const canAdjustWipRange = typeof onWipRangeChange === 'function';
    const handleWipRangeSelect = useCallback((key: string) => {
        if (key === activeWipRangeKey) {
            return;
        }
        onWipRangeChange?.(key);
    }, [activeWipRangeKey, onWipRangeChange]);

    // ---------- Date Slider Setup ----------
    const sortedMatters = useMemo(() => {
        return [...matters].sort((a, b) => {
            const dateA = parseISO(a.OpenDate || '');
            const dateB = parseISO(b.OpenDate || '');
            return dateA.getTime() - dateB.getTime();
        });
    }, [matters]);

    const minDate = new Date('2022-01-01');
    const mattersAfterMinDate = useMemo(() => {
        return sortedMatters.filter((m) => {
            const d = parseISO(m.OpenDate || '');
            return isValid(d) && d >= minDate;
        });
    }, [sortedMatters, minDate]);

    const validDates = useMemo(() => {
        return mattersAfterMinDate
            .map((m) => m.OpenDate)
            .filter((d): d is string => typeof d === 'string' && isValid(parseISO(d)))
            .map((d) => parseISO(d));
    }, [mattersAfterMinDate]);

    const practiceAreasList = useMemo(
        () => Array.from(new Set(matters.map((m) => m.PracticeArea).filter((pa): pa is string => !!pa))).sort(),
        [matters]
    );

    const [currentSliderStart, setCurrentSliderStart] = useState<number>(0);
    const [currentSliderEnd, setCurrentSliderEnd] = useState<number>(0);
    
    // ---------- Date Range Helpers ----------
    const getRangeFromKey = useCallback((key: RangeKey): { start: Date; end: Date } => {
        const now = new Date();
        let start: Date;
        let end: Date = endOfDay(now);

        switch (key) {
            case 'today':
                start = startOfDay(now);
                break;
            case 'yesterday':
                const yesterday = subDays(now, 1);
                start = startOfDay(yesterday);
                end = endOfDay(yesterday);
                break;
            case 'week':
                start = startOfWeek(now, { weekStartsOn: 1 });
                break;
            case 'lastWeek':
                const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
                start = lastWeekStart;
                end = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
                break;
            case 'month':
                start = startOfMonthFns(now);
                break;
            case 'lastMonth':
                const lastMonth = subMonths(now, 1);
                start = startOfMonthFns(lastMonth);
                end = endOfMonth(lastMonth);
                break;
            case 'last90Days':
                start = startOfDay(subDays(now, 90));
                break;
            case 'quarter':
                start = startOfQuarter(now);
                break;
            case 'yearToDate':
                start = startOfYear(now);
                break;
            case 'year':
                start = startOfYear(now);
                end = endOfYear(now);
                break;
            case 'all':
            default:
                start = new Date('2020-01-01');
                end = endOfDay(now);
                break;
        }
        return { start, end };
    }, []);

    const handleRangeSelect = useCallback((key: RangeKey) => {
        setRangeKey(key);
        if (key === 'custom') {
            return;
        }
        const { start, end } = getRangeFromKey(key);
        setStartDate(start);
        setEndDate(end);
    }, [getRangeFromKey]);

    const handleActivateCustomRange = () => {
        if (rangeKey === 'custom') return;
        const today = new Date();
        const fallbackStart = new Date(today);
        fallbackStart.setDate(today.getDate() - 6);
        fallbackStart.setHours(0, 0, 0, 0);
        const fallbackEnd = new Date(today);
        fallbackEnd.setHours(23, 59, 59, 999);
        setStartDate(fallbackStart);
        setEndDate(fallbackEnd);
        setRangeKey('custom');
    };

    const formatDateTag = (date: Date | undefined): string => {
        if (!date || !isValid(date)) return '—';
        return format(date, 'dd MMM');
    };

    const formatDateForPicker = (date?: Date): string => {
        if (!date || !isValid(date)) return '';
        return format(date, 'dd/MM/yyyy');
    };

    const parseDatePickerInput = (dateStr: string): Date | null => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            const parsed = new Date(year, month, day);
            if (isValid(parsed)) return parsed;
        }
        return null;
    };

    const effectiveDataWindowDays = useMemo(() => (
        typeof dataWindowDays === 'number' && dataWindowDays > 0 ? dataWindowDays : null
    ), [dataWindowDays]);

    const getRangeDurationDays = useCallback((key: RangeKey): number | null => {
        if (key === 'all' || key === 'custom') {
            return null;
        }
        const { start, end } = getRangeFromKey(key);
        const diff = end.getTime() - start.getTime();
        return Math.max(1, Math.ceil(diff / DAY_MS));
    }, [getRangeFromKey]);

    const isPresetDisabled = useCallback((key: RangeKey) => {
        if (!effectiveDataWindowDays) {
            return false;
        }
        const duration = getRangeDurationDays(key);
        if (duration == null) {
            return false;
        }
        return duration > effectiveDataWindowDays;
    }, [effectiveDataWindowDays, getRangeDurationDays]);

    const getWipOptionDurationDays = useCallback((key: string): number | null => {
        const match = /^([0-9]+)/.exec(key);
        if (!match) {
            return null;
        }
        return Number(match[1]) * 30;
    }, []);

    const isWipOptionDisabled = useCallback((key: string) => {
        if (!effectiveDataWindowDays) {
            return false;
        }
        const optionDays = getWipOptionDurationDays(key);
        if (optionDays == null) {
            return false;
        }
        return optionDays > effectiveDataWindowDays;
    }, [effectiveDataWindowDays, getWipOptionDurationDays]);

    useEffect(() => {
        if (validDates.length > 0) {
            setCurrentSliderStart(0);
            setCurrentSliderEnd(validDates.length - 1);
        }
    }, [validDates.length]);

    const mattersInDateRange = useMemo(() => {
        return mattersAfterMinDate.slice(currentSliderStart, currentSliderEnd + 1);
    }, [mattersAfterMinDate, currentSliderStart, currentSliderEnd]);
    
    // ---------- Team Member Processing ----------
    const teamMembers = useMemo(() => {
        if (!teamData) return [];
        return teamData
            .filter((member) => Boolean(member['Initials']))
            .map((member) => {
                const statusValueRaw = typeof member.status === 'string'
                    ? member.status
                    : typeof (member as Record<string, unknown>)['Status'] === 'string'
                        ? String((member as Record<string, unknown>)['Status'])
                        : undefined;
                const isActive = statusValueRaw ? statusValueRaw.toLowerCase() === 'active' : false;
                
                const roleValueRaw = (member as Record<string, unknown>)['Role'] 
                    ? String((member as Record<string, unknown>)['Role'])
                    : undefined;
                
                // If inactive, role becomes "Inactive" regardless of original role
                if (!isActive) {
                    return {
                        initials: member['Initials'] ?? '',
                        display: `${member.First || ''} ${member.Last || ''}`.trim() || (member['Initials'] ?? ''),
                        role: 'Inactive',
                        isActive: false,
                    };
                }
                
                // Normalize role: map "Non-solicitor" and "Operations 1" to "Ops"
                let normalizedRole = roleValueRaw;
                if (roleValueRaw === 'Non-solicitor' || roleValueRaw === 'Operations 1') {
                    normalizedRole = 'Ops';
                }
                
                return {
                    initials: member['Initials'] ?? '',
                    display: `${member.First || ''} ${member.Last || ''}`.trim() || (member['Initials'] ?? ''),
                    role: normalizedRole,
                    isActive: true,
                };
            })
            .sort((a, b) => a.display.localeCompare(b.display));
    }, [teamData]);

    // Helper function to get initials from full name using team data
    const getInitialsFromName = useCallback((fullName: string) => {
        if (!fullName || !teamMembers || teamMembers.length === 0) return fullName;
        
        const trimmedName = fullName.trim();
        if (trimmedName.length <= 3) return trimmedName; // Already likely initials
        
        // Find team member by exact display name match
        const exactMatch = teamMembers.find(member => 
            member.display.toLowerCase() === trimmedName.toLowerCase()
        );
        if (exactMatch && exactMatch.initials) {
            return exactMatch.initials;
        }
        
        // Find by partial name match (first and last name)
        const partialMatch = teamMembers.find(member => {
            const memberParts = member.display.toLowerCase().split(' ');
            const nameParts = trimmedName.toLowerCase().split(' ');
            return memberParts.length >= 2 && nameParts.length >= 2 &&
                   memberParts[0] === nameParts[0] && 
                   memberParts[memberParts.length - 1] === nameParts[nameParts.length - 1];
        });
        if (partialMatch && partialMatch.initials) {
            return partialMatch.initials;
        }
        
        // Fallback: generate initials from name
        const parts = trimmedName.split(' ');
        if (parts.length >= 2) {
            return parts[0].charAt(0).toUpperCase() + parts[parts.length - 1].charAt(0).toUpperCase();
        }
        
        return fullName; // Return original if can't process
    }, [teamMembers]);

    // ---------- Sorting Function ----------
    const handleSort = useCallback((field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    }, [sortField]);

    // ---------- Filter displayable team members ----------
    const displayableTeamMembers = useMemo(() => {
        const showOps = selectedRoles.includes('Ops');
        const showInactive = selectedRoles.includes('Inactive');
        
        return teamMembers.filter((member) => {
            // Always show standard fee-earning roles
            if (member.role !== 'Ops' && member.role !== 'Inactive') {
                return true;
            }
            // Show Ops only if Ops filter is active
            if (member.role === 'Ops' && showOps) {
                return true;
            }
            // Show Inactive only if Inactive filter is active
            if (member.role === 'Inactive' && showInactive) {
                return true;
            }
            return false;
        });
    }, [teamMembers, selectedRoles]);

    const toggleTeamSelection = (initials: string) => {
        setSelectedTeams((prev) => (
            prev.includes(initials)
                ? prev.filter((item) => item !== initials)
                : [...prev, initials]
        ));
    };

    const toggleRoleSelection = (role: string) => {
        const isRoleCurrentlySelected = selectedRoles.includes(role);
        
        // Update role selection
        setSelectedRoles((prev) => (
            isRoleCurrentlySelected
                ? prev.filter((item) => item !== role)
                : [...prev, role]
        ));
        
        // Auto-select team members with this role
        if (!isRoleCurrentlySelected) {
            const membersWithRole = teamMembers
                .filter(member => member.role === role)
                .map(member => member.initials);
            
            setSelectedTeams(prev => {
                const newSet = new Set([...prev, ...membersWithRole]);
                return Array.from(newSet);
            });
        } else {
            const remainingRoles = selectedRoles.filter(r => r !== role);
            
            if (remainingRoles.length > 0) {
                setSelectedTeams(prev => 
                    prev.filter(initials => {
                        const member = teamMembers.find(m => m.initials === initials);
                        return member && remainingRoles.includes(member.role ?? '');
                    })
                );
            } else {
                const membersWithRole = teamMembers
                    .filter(member => member.role === role)
                    .map(member => member.initials);
                
                setSelectedTeams(prev => prev.filter(initials => !membersWithRole.includes(initials)));
            }
        }
    };

    const allTeamsSelected = selectedTeams.length === 0 || selectedTeams.length === displayableTeamMembers.length;
    const allRolesSelected = selectedRoles.length === 0 || selectedRoles.length === ROLE_OPTIONS.length;

    const handleSelectAllTeams = () => {
        if (allTeamsSelected) return;
        setSelectedTeams([]);
    };

    const handleSelectAllRoles = () => {
        if (allRolesSelected) return;
        setSelectedRoles([]);
        setSelectedTeams([]);
    };

    // Refresh handler - updates lastRefreshed and emits a UI event for parent listeners
    const handleRefreshDatasets = useCallback(() => {
        const now = new Date();
        setLastRefreshed(now);
        // emit an event in case a parent component listens to perform an actual refresh
        try {
            window.dispatchEvent(new CustomEvent('helix:matters:refresh', { detail: { when: now } }));
        } catch (e) {
            // ignore in environments restricting CustomEvent
        }
    }, []);

    // Update the human readable "time since" string every 10 seconds
    useEffect(() => {
        if (!lastRefreshed) {
            setTimeSinceRefresh('never');
            return;
        }
        const update = () => {
            const secs = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
            if (secs < 10) setTimeSinceRefresh('just now');
            else if (secs < 60) setTimeSinceRefresh(`${secs}s ago`);
            else if (secs < 3600) setTimeSinceRefresh(`${Math.floor(secs / 60)}m ago`);
            else setTimeSinceRefresh(`${Math.floor(secs / 3600)}h ago`);
        };
        update();
        const id = window.setInterval(update, 10000);
        return () => window.clearInterval(id);
    }, [lastRefreshed]);
    
    // ---------- Date Range Filtered Matters (based on toolbar date selection) ----------
    const dateRangeFilteredMatters = useMemo(() => {
        if (rangeKey === 'all' || !startDate || !endDate) {
            return matters.slice();
        }
        return matters.filter((m) => {
            const openDate = parseISO(m.OpenDate || '');
            if (!isValid(openDate)) return false;
            return openDate >= startDate && openDate <= endDate;
        });
    }, [matters, rangeKey, startDate, endDate]);

    // ---------- Filtering (applied on top of the date range) ----------
    const filteredMatters = useMemo(() => {
        let final = dateRangeFilteredMatters;
        
        // Team/role filtering - filter by Originating Solicitor matching team member display name
        if (selectedTeams.length > 0) {
            const selectedNames = teamMembers
                .filter(tm => selectedTeams.includes(tm.initials))
                .map(tm => tm.display.toLowerCase());
            final = final.filter((m) => 
                selectedNames.some(name => m.OriginatingSolicitor.toLowerCase().includes(name))
            );
        }
        
        if (activeGroupedArea) {
            final = final.filter(
                (m) =>
                    groupPracticeArea(m.PracticeArea).toLowerCase() === activeGroupedArea.toLowerCase()
            );
        }
        if (activePracticeAreas.length > 0) {
            final = final.filter((m) => activePracticeAreas.includes(m.PracticeArea));
        }
        if (activeState === 'Mine' && userData?.length) {
            const fullName = `${userData[0].First} ${userData[0].Last}`.trim();
            final = final.filter((m) => m.OriginatingSolicitor === fullName);
        }
        if (activeFeeEarner) {
            if (feeEarnerType === 'Originating') {
                final = final.filter(
                    (m) => m.OriginatingSolicitor.toLowerCase() === activeFeeEarner.toLowerCase()
                );
            } else if (feeEarnerType === 'Responsible') {
                final = final.filter(
                    (m) =>
                        m.ResponsibleSolicitor &&
                        m.ResponsibleSolicitor.toLowerCase() === activeFeeEarner.toLowerCase()
                );
            }
        }
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            final = final.filter(
                (m) =>
                    m.ClientName.toLowerCase().includes(lower) ||
                    m.DisplayNumber.toLowerCase().includes(lower) ||
                    m.PracticeArea.toLowerCase().includes(lower)
            );
        }
        
        // Apply sorting without mutating upstream arrays
        const sorted = [...final].sort((a, b) => {
            let aVal: any;
            let bVal: any;
            
            switch (sortField) {
                case 'displayNumber':
                    aVal = (a as any)['Display Number'] || a.DisplayNumber || '';
                    bVal = (b as any)['Display Number'] || b.DisplayNumber || '';
                    break;
                case 'clientName':
                    aVal = (a as any)['Client Name'] || a.ClientName || '';
                    bVal = (b as any)['Client Name'] || b.ClientName || '';
                    break;
                case 'practiceArea':
                    aVal = (a as any)['Practice Area'] || a.PracticeArea || '';
                    bVal = (b as any)['Practice Area'] || b.PracticeArea || '';
                    break;
                case 'openDate':
                    aVal = matterTimestamps.get(a.UniqueID) || 0;
                    bVal = matterTimestamps.get(b.UniqueID) || 0;
                    break;
                case 'originatingSolicitor':
                    aVal = (a as any)['Originating Solicitor'] || a.OriginatingSolicitor || '';
                    bVal = (b as any)['Originating Solicitor'] || b.OriginatingSolicitor || '';
                    break;
                case 'responsibleSolicitor':
                    aVal = (a as any)['Responsible Solicitor'] || a.ResponsibleSolicitor || '';
                    bVal = (b as any)['Responsible Solicitor'] || b.ResponsibleSolicitor || '';
                    break;
                case 'status':
                    aVal = (a as any).Status || a.Status || 'Open';
                    bVal = (b as any).Status || b.Status || 'Open';
                    break;
                case 'wipValue':
                    aVal = getMatterFinancials(a).wip;
                    bVal = getMatterFinancials(b).wip;
                    break;
                case 'collectedValue':
                    aVal = getMatterFinancials(a).collected;
                    bVal = getMatterFinancials(b).collected;
                    break;
                case 'roiValue':
                    aVal = getMatterFinancialsDetailed(a).roi;
                    bVal = getMatterFinancialsDetailed(b).roi;
                    break;
                case 'source':
                    aVal = getMatterSourceLabel(a);
                    bVal = getMatterSourceLabel(b);
                    break;
                default:
                    aVal = matterTimestamps.get(a.UniqueID) || 0;
                    bVal = matterTimestamps.get(b.UniqueID) || 0;
            }
            
            if (sortField === 'openDate') {
                const result = (aVal as number) - (bVal as number);
                return sortDirection === 'asc' ? result : -result;
            } else if (sortField === 'wipValue' || sortField === 'collectedValue' || sortField === 'roiValue') {
                const result = Number(aVal) - Number(bVal);
                return sortDirection === 'asc' ? result : -result;
            } else {
                const result = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
                return sortDirection === 'asc' ? result : -result;
            }
        });
        
        return sorted;
    }, [
        dateRangeFilteredMatters,
        selectedTeams,
        teamMembers,
        activeGroupedArea,
        activePracticeAreas,
        activeState,
        activeFeeEarner,
        feeEarnerType,
        searchTerm,
        userData,
        sortField,
        sortDirection,
        getMatterFinancials,
        getMatterFinancialsDetailed,
        matterTimestamps,
    ]);

    // Display matters with current sorting applied
    const displayedMatters = useMemo(
        () => filteredMatters.slice(0, itemsToShow),
        [filteredMatters, itemsToShow]
    );

    const tableMatters = useMemo(
        () => filteredMatters.slice(0, Math.min(filteredMatters.length, 100)),
        [filteredMatters]
    );

    // ---------- Infinite Scroll Effect ----------
    const handleLoadMore = useCallback(() => {
        setItemsToShow((prev) => Math.min(prev + 20, filteredMatters.length));
    }, [filteredMatters.length]);

    useEffect(() => {
        if (!loader.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) handleLoadMore();
            },
            { rootMargin: '200px', threshold: 0.1 }
        );
        observer.observe(loader.current);
        return () => observer.disconnect();
    }, [handleLoadMore]);

    const showOverview =
        !activeGroupedArea && activePracticeAreas.length === 0 && !activeState && !searchTerm;

    const groupedCounts = useMemo(() => {
        const counts: { [group: string]: number } = {};
        filteredMatters.forEach((m) => {
            if (!m.PracticeArea) return;
            const group = groupPracticeArea(m.PracticeArea);
            counts[group] = (counts[group] || 0) + 1;
        });
        return counts;
    }, [filteredMatters]);

    const monthlyGroupedCounts: MonthlyData[] = useMemo(() => {
        const counts: { [month: string]: { [group: string]: number } } = {};
        filteredMatters.forEach((m) => {
            if (m.OpenDate && m.PracticeArea) {
                const date = parseISO(m.OpenDate);
                if (!isValid(date)) return;
                const monthLabel = format(startOfMonth(date), 'MMM yyyy');
                if (!counts[monthLabel]) counts[monthLabel] = {};
                const group = groupPracticeArea(m.PracticeArea);
                counts[monthLabel][group] = (counts[monthLabel][group] || 0) + 1;
            }
        });
        const sortedMonths = Object.keys(counts).sort(
            (a, b) => new Date(a).getTime() - new Date(b).getTime()
        );
        return sortedMonths.map((month) => ({ month, ...counts[month] }));
    }, [filteredMatters]);

    // --------------------------------------
    // NEW: find outstanding data for the selected matter
    // --------------------------------------
    const matterOutstandingData = useMemo(() => {
        if (!outstandingBalances || !Array.isArray(outstandingBalances.data) || !selectedMatter) {
            return null;
        }
        const matterIdNum = Number(selectedMatter.UniqueID);
        const found = outstandingBalances.data.find(
            (entry: any) =>
                Array.isArray(entry.associated_matter_ids) &&
                entry.associated_matter_ids.includes(matterIdNum)
        );
        return found || null;
    }, [outstandingBalances, selectedMatter]);


    useEffect(() => {
        if (selectedMatter) {
            setContent(
                <div className={detailNavStyle(isDarkMode)}>
                    <IconButton
                        iconProps={{ iconName: 'Back' }}
                        title="Back"
                        ariaLabel="Back"
                        onClick={() => setSelectedMatter(null)}
                        className={backButtonStyle}
                    />
                    <Pivot
                        className="navigatorPivot"
                        selectedKey={activeTab}
                        onLinkClick={(item) =>
                            setActiveTab(item?.props.itemKey || 'Overview')
                        }
                        aria-label="Matter Detail Tabs"
                    >
                        <PivotItem headerText="Overview" itemKey="Overview" />
                        <PivotItem headerText="Transactions" itemKey="Transactions" />
                        <PivotItem headerText="Documents" itemKey="Documents" />
                    </Pivot>
                </div>
            );
            return () => setContent(null);
        }
    }, [
        setContent,
        selectedMatter,
        activeTab,
        isDarkMode,
    ]);

    // ------------------------------------------------
    // Fetch getMatterOverview, getComplianceData, and getMatterSpecificActivities whenever selectedMatter changes
    // ------------------------------------------------
    useEffect(() => {
        if (!selectedMatter) {
            setMatterOverview(null);
            setOverviewResponse('');
            setComplianceData(null);
            setMatterSpecificActivities(null);
            return;
        }
        (async () => {
            const overviewResponse = await callGetMatterOverview(Number(selectedMatter.UniqueID));
            if (overviewResponse?.data) {
                setMatterOverview(overviewResponse.data);
                setOverviewResponse(JSON.stringify(overviewResponse.data, null, 2));
            }
            // Call getComplianceData using the matter's UniqueID and ClientID
            const complianceResponse = await callGetComplianceData(
                selectedMatter.UniqueID,
                selectedMatter.ClientID
            );
            setComplianceData(complianceResponse);
            // NEW: Call getMatterSpecificActivities using the matter's UniqueID
            const activitiesResponse = await callGetMatterSpecificActivities(selectedMatter.UniqueID);
            setMatterSpecificActivities(activitiesResponse);
        })();
    }, [selectedMatter]);

    // ------------------------------------------------
    // If a matter is selected, render the detail pivot
    // ------------------------------------------------
    if (selectedMatter) {

        return (
            <div className={outerDetailContainerStyle(isDarkMode)}>

                {/* Card Content */}
                <div className={innerDetailCardStyle(isDarkMode)}>
                    {activeTab === 'Overview' && (
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <h3>Matter Overview</h3>
                            <p>disabled during migration</p>
                            <p>Selected Matter: {selectedMatter?.DisplayNumber} - {selectedMatter?.ClientName}</p>
                            {/* TODO: MattersReport needs to be updated to use normalized data */}
                        </div>
                    )}
                    {activeTab === 'Transactions' && (
                        <MatterTransactions matter={selectedMatter} transactions={transactions} />
                    )}
                    {activeTab === 'Documents' &&
                        (canViewDocuments ? (
                            <Documents
                                matter={selectedMatter}
                                category={groupPracticeArea(selectedMatter.PracticeArea)}
                            />
                        ) : (
                            <MessageBar messageBarType={MessageBarType.error}>
                                Access Denied: You do not have permission to view Documents.
                            </MessageBar>
                        ))}
                </div>
            </div>
        );
    }

    // ---------- Toolbar Styles ----------
    const getDatePickerStyles = (isDarkMode: boolean): Partial<IDatePickerStyles> => {
        const baseBorder = isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)';
        const hoverBorder = isDarkMode ? 'rgba(135, 206, 255, 0.5)' : 'rgba(54, 144, 206, 0.4)';
        const focusBorder = isDarkMode ? '#87ceeb' : colours.highlight;
        const backgroundColour = isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
        const hoverBackground = isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 1)';
        const focusBackground = isDarkMode ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)';

        return {
            root: { maxWidth: 220 },
            textField: {
                root: { fontFamily: 'Raleway, sans-serif !important', width: '100% !important' },
                fieldGroup: {
                    height: '36px !important',
                    borderRadius: '8px !important',
                    border: `1px solid ${baseBorder} !important`,
                    background: `${backgroundColour} !important`,
                    padding: '0 14px !important',
                    boxShadow: isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.2) !important' : '0 1px 3px rgba(15, 23, 42, 0.08) !important',
                    transition: 'all 0.2s ease !important',
                    selectors: {
                        ':hover': {
                            border: `1px solid ${hoverBorder} !important`,
                            background: `${hoverBackground} !important`,
                            boxShadow: isDarkMode ? '0 4px 8px rgba(0, 0, 0, 0.25) !important' : '0 2px 6px rgba(15, 23, 42, 0.12) !important',
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
            wrapper: { borderRadius: '12px !important' },
        };
    };

    const getRangeButtonStyles = (isDarkMode: boolean, active: boolean, disabled: boolean = false): IButtonStyles => {
        const activeBackground = colours.highlight;
        const inactiveBackground = isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'transparent';
        const disabledBackground = isDarkMode ? 'rgba(15, 23, 42, 0.75)' : 'rgba(148, 163, 184, 0.08)';
        const resolvedBackground = disabled ? disabledBackground : (active ? activeBackground : inactiveBackground);
        const resolvedBorder = disabled
            ? `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.4)'}`
            : active
                ? `1px solid ${isDarkMode ? 'rgba(135, 176, 255, 0.5)' : 'rgba(13, 47, 96, 0.32)'}`
                : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.16)'}`;
        const resolvedColor = disabled
            ? (isDarkMode ? 'rgba(226, 232, 240, 0.45)' : 'rgba(15, 23, 42, 0.35)')
            : (active
                ? '#ffffff'
                : (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(13, 47, 96, 0.8)'));
        
        return {
            root: {
                background: resolvedBackground,
                border: resolvedBorder,
                color: resolvedColor,
                borderRadius: 8,
                height: 36,
                minWidth: 70,
                padding: '0 16px',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                fontFamily: 'Raleway, sans-serif',
                transition: 'all 0.2s ease',
                cursor: disabled ? 'default' : 'pointer',
                boxShadow: isDarkMode
                    ? (active && !disabled ? '0 2px 6px rgba(0, 0, 0, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.2)')
                    : (active && !disabled ? '0 2px 4px rgba(15, 23, 42, 0.15)' : '0 1px 2px rgba(15, 23, 42, 0.08)'),
            },
            rootHovered: {
                background: disabled
                    ? resolvedBackground
                    : (active ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(248, 250, 252, 1)')),
                border: disabled
                    ? resolvedBorder
                    : (active ? resolvedBorder : `1px solid ${isDarkMode ? 'rgba(135, 206, 255, 0.4)' : 'rgba(54, 144, 206, 0.3)'}`),
                color: disabled
                    ? resolvedColor
                    : (active ? '#ffffff' : (isDarkMode ? '#f1f5f9' : colours.highlight)),
                transform: disabled ? 'none' : 'translateY(-1px)',
                boxShadow: disabled
                    ? 'none'
                    : (isDarkMode
                        ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                        : '0 3px 8px rgba(15, 23, 42, 0.12)'),
            },
            rootPressed: {
                background: disabled
                    ? resolvedBackground
                    : (active ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(241, 245, 249, 1)')),
                transform: disabled ? 'none' : 'translateY(0)',
            },
        };
    };

    const dateStampButtonStyle = (isDarkMode: boolean): React.CSSProperties => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        padding: '8px 16px',
        borderRadius: '8px',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)'}`,
        background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)',
        boxShadow: isDarkMode 
            ? '0 2px 4px rgba(0, 0, 0, 0.2)' 
            : '0 1px 3px rgba(15, 23, 42, 0.08)',
        cursor: 'pointer',
        fontFamily: 'Raleway, sans-serif',
        color: isDarkMode ? '#f3f4f6' : '#061733',
        minWidth: '100px',
        transition: 'all 0.2s ease',
    });

    // ------------------------------------------------
    // Otherwise, render the grid (overview or matter list)
    // ------------------------------------------------
    const dashboardThemeClass = isDarkMode ? 'dark-theme' : 'light-theme';
    const isCustomRange = rangeKey === 'custom';
    const activePresetKey = RANGE_OPTIONS.some(option => option.key === rangeKey) ? rangeKey : undefined;
    const isAllPresetActive = rangeKey === 'all';
    const formattedFromLabel = rangeKey === 'all' ? 'All Time' : formatDateTag(startDate);
    const formattedToLabel = formatDateTag(endDate);

    return (
        <div className={`management-dashboard-container animate-dashboard ${dashboardThemeClass}`}>
            {/* Filter Toolbar */}
            <div className="filter-toolbar">
                <div className="filter-toolbar__top">
                    <div className="filter-toolbar__date-inputs">
                        {isCustomRange ? (
                            <div className="date-pickers">
                                <DatePicker
                                    label="From"
                                    styles={getDatePickerStyles(isDarkMode)}
                                    value={startDate}
                                    onSelectDate={(date) => {
                                        setStartDate(date ?? undefined);
                                        setRangeKey('custom');
                                    }}
                                    allowTextInput
                                    firstDayOfWeek={DayOfWeek.Monday}
                                    formatDate={formatDateForPicker}
                                    parseDateFromString={parseDatePickerInput}
                                />
                                <DatePicker
                                    label="To"
                                    styles={getDatePickerStyles(isDarkMode)}
                                    value={endDate}
                                    onSelectDate={(date) => {
                                        setEndDate(date ?? undefined);
                                        setRangeKey('custom');
                                    }}
                                    allowTextInput
                                    firstDayOfWeek={DayOfWeek.Monday}
                                    formatDate={formatDateForPicker}
                                    parseDateFromString={parseDatePickerInput}
                                />
                            </div>
                        ) : (
                            <div className="date-stamp-group">
                                <button
                                    type="button"
                                    className="date-stamp-button"
                                    style={dateStampButtonStyle(isDarkMode)}
                                    onClick={handleActivateCustomRange}
                                    title="Click to customise the start date"
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>From</span>
                                    <span style={{ fontSize: 16, fontWeight: 700 }}>{formattedFromLabel}</span>
                                </button>
                                <button
                                    type="button"
                                    className="date-stamp-button"
                                    style={dateStampButtonStyle(isDarkMode)}
                                    onClick={handleActivateCustomRange}
                                    title="Click to customise the end date"
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.86)' : 'rgba(248, 250, 252, 1)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.95)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>To</span>
                                    <span style={{ fontSize: 16, fontWeight: 700 }}>{formattedToLabel}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="filter-toolbar__actions">
                        {/* Status chip (matches management dashboard small toolset) */}
                        <div className="filter-status-chip" title={`Last refresh: ${lastRefreshed ? lastRefreshed.toISOString() : 'never'}`} style={{ borderColor: '#22c461' }}>
                            <div className="filter-status-indicator" style={{ background: '#22c461' }} />
                            {timeSinceRefresh}
                        </div>

                        {/* Refresh button */}
                        <div className="filter-icon-button-wrapper">
                            <button
                                type="button"
                                onClick={handleRefreshDatasets}
                                className="filter-icon-button"
                                title="Refresh datasets (auto-refreshes every 15 min)"
                                aria-label="Refresh datasets"
                            >
                                <Icon iconName="Refresh" style={{ fontSize: 16 }} />
                            </button>
                        </div>

                        {/* Role filter (use People icon instead of Settings) */}
                        <div className="filter-icon-button-wrapper">
                            <button
                                type="button"
                                onClick={() => setShowRoleFilter(!showRoleFilter)}
                                className="filter-icon-button"
                                style={{
                                    color: showRoleFilter 
                                        ? (isDarkMode ? '#34d399' : '#10b981') 
                                        : (isDarkMode ? '#94a3b8' : '#64748b'),
                                    transform: showRoleFilter ? 'translateY(-1px)' : 'translateY(0)'
                                }}
                                title={showRoleFilter ? "Hide role filter" : "Show role filter"}
                                aria-label="Toggle role filter"
                            >
                                <Icon iconName="People" style={{ fontSize: 16 }} />
                            </button>
                        </div>

                        {/* Dataset info */}
                        <div className="filter-icon-button-wrapper">
                            <button
                                type="button"
                                onMouseEnter={() => setShowDatasetInfo(true)}
                                onMouseLeave={() => setShowDatasetInfo(false)}
                                className="filter-icon-button"
                                style={{
                                    color: isDarkMode ? '#60a5fa' : colours.highlight,
                                    transform: showDatasetInfo ? 'translateY(-1px)' : 'translateY(0)'
                                }}
                                title="Dataset information"
                                aria-label="Dataset information"
                            >
                                <Icon iconName="Info" style={{ fontSize: 16 }} />
                            </button>

                            {showDatasetInfo && (
                                <div className="filter-dataset-tooltip">
                                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: isDarkMode ? '#60a5fa' : colours.highlight }}>
                                        Dataset Date Ranges
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {[{
                                            label: 'Matters',
                                            range: 'Last 24 months'
                                        }, {
                                            label: 'ID submissions',
                                            range: 'Last 24 months'
                                        }, {
                                            label: 'WIP ledger',
                                            range: 'Active matters'
                                        }, {
                                            label: 'Collected fees',
                                            range: 'Last 12 months'
                                        }].map(({ label, range }) => (
                                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                <span style={{ opacity: 0.8 }}>{label}:</span>
                                                <span style={{ fontWeight: 600 }}>{range}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{
                                        marginTop: 10,
                                        paddingTop: 8,
                                        borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                                        fontSize: 11,
                                        opacity: 0.7,
                                        fontStyle: 'italic'
                                    }}>
                                        ROI columns depend on the WIP and collected feeds, so data outside these ranges won't appear in metrics
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="filter-toolbar__middle">
                    <div className="filter-toolbar__presets">
                        <div className="filter-preset-group">
                            {RANGE_OPTIONS.slice(0, 2).map(({ key, label }) => {
                                const presetDisabled = isPresetDisabled(key);
                                return (
                                    <DefaultButton
                                        key={key}
                                        text={label}
                                        onClick={() => handleRangeSelect(key)}
                                        disabled={presetDisabled}
                                        styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                                    />
                                );
                            })}
                            <div className="preset-separator">|</div>
                            {RANGE_OPTIONS.slice(2, 4).map(({ key, label }) => {
                                const presetDisabled = isPresetDisabled(key);
                                return (
                                    <DefaultButton
                                        key={key}
                                        text={label}
                                        onClick={() => handleRangeSelect(key)}
                                        disabled={presetDisabled}
                                        styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                                    />
                                );
                            })}
                            <div className="preset-separator">|</div>
                            {RANGE_OPTIONS.slice(4, 6).map(({ key, label }) => {
                                const presetDisabled = isPresetDisabled(key);
                                return (
                                    <DefaultButton
                                        key={key}
                                        text={label}
                                        onClick={() => handleRangeSelect(key)}
                                        disabled={presetDisabled}
                                        styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                                    />
                                );
                            })}
                            <div className="preset-separator">|</div>
                            {RANGE_OPTIONS.slice(6, 8).map(({ key, label }) => {
                                const presetDisabled = isPresetDisabled(key);
                                return (
                                    <DefaultButton
                                        key={key}
                                        text={label}
                                        onClick={() => handleRangeSelect(key)}
                                        disabled={presetDisabled}
                                        styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                                    />
                                );
                            })}
                            <div className="preset-separator">|</div>
                            {RANGE_OPTIONS.slice(8).map(({ key, label }) => {
                                const presetDisabled = isPresetDisabled(key);
                                return (
                                    <DefaultButton
                                        key={key}
                                        text={label}
                                        onClick={() => handleRangeSelect(key)}
                                        disabled={presetDisabled}
                                        styles={getRangeButtonStyles(isDarkMode, activePresetKey === key, presetDisabled)}
                                    />
                                );
                            })}
                        </div>
                        {!isAllPresetActive && (
                            <DefaultButton
                                text="Clear"
                                onClick={() => handleRangeSelect('all')}
                                styles={getRangeButtonStyles(isDarkMode, false)}
                                title="Reset to all-time view"
                            />
                        )}
                    </div>
                </div>

                <div className="filter-toolbar__bottom">
                    <div className="filter-group-container team-filter-container">
                        <div className="team-slicer-buttons">
                            {displayableTeamMembers.map((member) => (
                                <DefaultButton
                                    key={member.initials}
                                    text={member.initials}
                                    onClick={() => toggleTeamSelection(member.initials)}
                                    title={member.display}
                                    styles={getTeamButtonStyles(isDarkMode, selectedTeams.includes(member.initials))}
                                />
                            ))}
                            {!allTeamsSelected && (
                                <button
                                    onClick={handleSelectAllTeams}
                                    style={clearFilterButtonStyle(isDarkMode)}
                                    title="Clear team filter"
                                >
                                    <span style={{ fontSize: 16 }}>×</span>
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {showRoleFilter && (
                    <div className="filter-toolbar__roles">
                        <div className="filter-group-container role-filter-container">
                            <div className="role-slicer-buttons">
                                {ROLE_OPTIONS.map(({ key, label }) => (
                                    <DefaultButton
                                        key={key}
                                        text={label}
                                        onClick={() => toggleRoleSelection(key)}
                                        styles={getRoleButtonStyles(isDarkMode, selectedRoles.includes(key))}
                                    />
                                ))}
                                {!allRolesSelected && (
                                    <button
                                        onClick={handleSelectAllRoles}
                                        style={clearFilterButtonStyle(isDarkMode)}
                                        title="Clear role filter"
                                    >
                                        <span style={{ fontSize: 16 }}>×</span>
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {isLoading ? (
                <Spinner label="Loading matters..." size={SpinnerSize.medium} />
            ) : error ? (
                <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>
            ) : (
                <>
                    {/* Always show table - removed showOverview condition */}
                    <div style={{
                        background: isDarkMode ? '#1a2332' : '#ffffff',
                        border: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        overflow: 'auto',
                        marginTop: '20px',
                        position: 'relative',
                        zIndex: 1
                    }}>
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
                                background: isDarkMode ? '#0f172a' : '#f9fafb'
                            }}>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: isDarkMode ? '#cbd5e1' : '#374151',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    Matters Table
                                </h3>
                                <div style={{
                                    fontSize: '11px',
                                    color: isDarkMode ? '#64748b' : '#6b7280',
                                    marginTop: '4px'
                                }}>
                                    Showing {tableMatters.length} of {filteredMatters.length} matters
                                </div>
                            </div>
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '11px',
                                tableLayout: 'auto'
                            }}>
                                <thead>
                                    <tr style={{
                                        background: isDarkMode ? '#0f172a' : '#f9fafb',
                                        position: 'sticky',
                                        top: 0
                                    }}>
                                        <SortableHeader 
                                            field="status" 
                                            label="Status" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            width={95}
                                        />
                                        <SortableHeader 
                                            field="practiceArea" 
                                            label="AOW" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="center"
                                            width={60}
                                        />
                                        <SortableHeader 
                                            field="openDate" 
                                            label="Opened" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            width={95}
                                        />
                                        <SortableHeader 
                                            field="displayNumber" 
                                            label="Ref" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            width={140}
                                        />
                                        <SortableHeader 
                                            field="clientName" 
                                            label="Client" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                        />
                                        <SortableHeader 
                                            field="originatingSolicitor" 
                                            label="Orig." 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="center"
                                            width={80}
                                        />
                                        <SortableHeader 
                                            field="responsibleSolicitor" 
                                            label="Resp." 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="center"
                                            width={80}
                                        />
                                        <SortableHeader 
                                            field="wipValue" 
                                            label="WIP" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="center"
                                            width={100}
                                        />
                                        <SortableHeader 
                                            field="collectedValue" 
                                            label="Collected" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="center"
                                            width={105}
                                        />
                                        <th style={{
                                            textAlign: 'center',
                                            width: 90,
                                            minWidth: 90,
                                            padding: '8px 10px',
                                            borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
                                            fontWeight: 600,
                                            color: isDarkMode ? '#cbd5e1' : '#374151',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.2px',
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            position: 'relative',
                                            background: sortField === 'roiValue' 
                                                ? (isDarkMode ? '#1e293b' : '#f3f4f6')
                                                : 'transparent',
                                            transition: 'background-color 0.15s ease'
                                        }}
                                        onClick={() => handleSort('roiValue')}
                                        onMouseEnter={(e) => {
                                            if (sortField !== 'roiValue') {
                                                e.currentTarget.style.background = isDarkMode ? '#1e293b' : '#f9fafb';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (sortField !== 'roiValue') {
                                                e.currentTarget.style.background = 'transparent';
                                            }
                                        }}
                                        >
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                gap: '4px'
                                            }}>
                                                <span>ROI %</span>
                                                <Icon 
                                                    iconName={sortField === 'roiValue' ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronUpSmall'}
                                                    style={{ 
                                                        fontSize: '12px',
                                                        opacity: sortField === 'roiValue' ? 1 : 0.4,
                                                        transition: 'opacity 0.15s ease',
                                                        color: isDarkMode ? '#cbd5e1' : '#374151'
                                                    }}
                                                />
                                            </div>
                                        </th>
                                        <SortableHeader 
                                            field="source" 
                                            label="Source" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="center"
                                            width={140}
                                        />
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableMatters.map((matter) => {

                                        const openDate = (matter as any)['Open Date'] ? parseISO((matter as any)['Open Date']) : null;
                                        const practiceAreaGroup = groupPracticeArea((matter as any)['Practice Area'] || matter.PracticeArea);
                                        const groupIconName = getGroupIcon(practiceAreaGroup);
                                        const pitchTags = getPitchTagsForMatter(matter);
                                        const isExpanded = expandedMatterId === matter.UniqueID;
                                        
                                        return (
                                            <React.Fragment key={matter.UniqueID}>
                                            <tr style={{
                                                borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#f3f4f6'}`,
                                                fontSize: '11px',
                                                transition: 'background 0.2s',
                                                cursor: 'pointer',
                                                minHeight: '36px',
                                                background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(255, 255, 255, 0.8)'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = isDarkMode ? '#1e293b' : '#f9fafb'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(255, 255, 255, 0.8)'}
                                            onClick={() => setSelectedMatter(matter)}
                                            >
                                                <td style={{
                                                    padding: '4px 6px',
                                                    width: 95,
                                                    minWidth: 95,
                                                    textAlign: 'center'
                                                }}>
                                                    <span style={{
                                                        background: ((matter as any).Status || matter.Status) === 'Open' ? (isDarkMode ? '#10b98140' : '#dcfce7') : (isDarkMode ? '#6b728040' : '#f3f4f6'),
                                                        color: ((matter as any).Status || matter.Status) === 'Open' ? (isDarkMode ? '#ffffff' : '#16a34a') : (isDarkMode ? '#ffffff' : '#6b7280'),
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        fontSize: '10px',
                                                        display: 'inline-block',
                                                        border: `1px solid ${((matter as any).Status || matter.Status) === 'Open' ? (isDarkMode ? '#10b981' : '#16a34a') : (isDarkMode ? '#6b7280' : '#6b7280')}`,
                                                        minWidth: 60
                                                    }}>
                                                        {(matter as any).Status || matter.Status || 'Open'}
                                                    </span>
                                                </td>
                                                <td style={{
                                                    padding: '4px 6px',
                                                    width: 60,
                                                    minWidth: 60,
                                                    textAlign: 'center'
                                                }}>
                                                    <Icon 
                                                        iconName={groupIconName}
                                                        style={{ 
                                                            fontSize: '16px',
                                                            color: getGroupColor(practiceAreaGroup)
                                                        }} 
                                                        title={practiceAreaGroup}
                                                    />
                                                </td>
                                                <td style={{
                                                    padding: '4px 6px',
                                                    width: 95,
                                                    minWidth: 95,
                                                    color: isDarkMode ? '#ffffff' : '#000000',
                                                    fontFamily: 'monospace',
                                                    fontSize: '10px',
                                                    lineHeight: '1.2',
                                                    fontWeight: 600
                                                }}>
                                                    {openDate && isValid(openDate) ? (
                                                        <div>
                                                            <div>{format(openDate, 'MM-dd')}</div>
                                                            <div style={{ opacity: 0.7 }}>{format(openDate, 'HH:mm')}</div>
                                                        </div>
                                                    ) : '–'}
                                                </td>
                                                <td style={{
                                                    padding: '6px 10px',
                                                    width: 140,
                                                    minWidth: 140,
                                                    color: isDarkMode ? '#e5e7eb' : '#111827',
                                                    fontFamily: 'monospace',
                                                    fontSize: '11px',
                                                    fontWeight: 500
                                                }}>
                                                    {(matter as any)['Display Number'] || matter.DisplayNumber || 'N/A'}
                                                </td>
                                                <td style={{
                                                    padding: '6px 10px',
                                                    color: isDarkMode ? '#e5e7eb' : '#111827',
                                                    fontWeight: 500,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {(matter as any)['Client Name'] || matter.ClientName || 'N/A'}
                                                    {pitchTags.length > 0 && (
                                                        <div style={pitchTagContainerStyle}>
                                                            {pitchTags.map((tag) => (
                                                                <span
                                                                    key={tag.key}
                                                                    style={getPitchTagStyle(tag.type)}
                                                                    title={tag.title}
                                                                >
                                                                    {tag.label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{
                                                    padding: '4px 6px',
                                                    width: 80,
                                                    minWidth: 80,
                                                    color: isDarkMode ? '#e5e7eb' : '#111827',
                                                    fontSize: '11px',
                                                    textAlign: 'center',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 500,
                                                    letterSpacing: '0.6px'
                                                }}>
                                                    {getInitialsFromName((matter as any)['Originating Solicitor'] || matter.OriginatingSolicitor || '')}
                                                </td>
                                                <td style={{
                                                    padding: '4px 6px',
                                                    width: 80,
                                                    minWidth: 80,
                                                    color: isDarkMode ? '#e5e7eb' : '#111827',
                                                    fontSize: '11px',
                                                    textAlign: 'center',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 500,
                                                    letterSpacing: '0.6px'
                                                }}>
                                                    {getInitialsFromName((matter as any)['Responsible Solicitor'] || matter.ResponsibleSolicitor || '')}
                                                </td>
                                                <td style={{
                                                    padding: '6px 8px',
                                                    width: 100,
                                                    minWidth: 100,
                                                    textAlign: 'center',
                                                    color: isDarkMode ? '#e5e7eb' : '#111827',
                                                    fontFamily: 'monospace',
                                                    fontSize: '11px',
                                                    fontWeight: 500
                                                }}>
                                                    {formatCurrency(calculateMatterWIP(matter, wip))}
                                                </td>
                                                <td style={{
                                                    padding: '6px 8px',
                                                    width: 105,
                                                    minWidth: 105,
                                                    textAlign: 'center',
                                                    color: isDarkMode ? '#e5e7eb' : '#111827',
                                                    fontFamily: 'monospace',
                                                    fontSize: '11px',
                                                    fontWeight: 500
                                                }}>
                                                    {formatCurrency(calculateMatterCollected(matter, recoveredFees))}
                                                </td>
                                                <td style={{
                                                    padding: '6px 8px',
                                                    width: 90,
                                                    minWidth: 90,
                                                    textAlign: 'center',
                                                    fontFamily: 'monospace',
                                                    fontSize: '11px',
                                                    fontWeight: 600
                                                }}>
                                                    {(() => {
                                                        const detailed = getMatterFinancialsDetailed(matter);
                                                        const roiFormatted = formatROI(detailed.roi, detailed.wipSources, detailed.collectedSources);
                                                        
                                                        const sourceBreakdown = [
                                                            'WIP Sources:',
                                                            `• Clio: ${formatCurrency(detailed.wipSources.clio)}`,
                                                            `• SQL: ${formatCurrency(detailed.wipSources.sql)}`,
                                                            `• Manual: ${formatCurrency(detailed.wipSources.manual)}`,
                                                            '',
                                                            'Collected Sources:',
                                                            `• Clio: ${formatCurrency(detailed.collectedSources.clio)}`,
                                                            `• SQL: ${formatCurrency(detailed.collectedSources.sql)}`,
                                                            `• Manual: ${formatCurrency(detailed.collectedSources.manual)}`,
                                                            '',
                                                            `Entries: ${detailed.wipEntries} WIP, ${detailed.collectedEntries} collected`,
                                                            `Reliability: ${roiFormatted.reliability}`,
                                                            `Last Updated: ${detailed.lastUpdated ? new Date(detailed.lastUpdated).toLocaleDateString() : 'N/A'}`
                                                        ].join('\n');
                                                        
                                                        return (
                                                            <span 
                                                                style={{ 
                                                                    color: roiFormatted.color,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px'
                                                                }}
                                                                title={sourceBreakdown}
                                                            >
                                                                {roiFormatted.display}
                                                                {roiFormatted.reliability === 'Low' && (
                                                                    <Icon 
                                                                        iconName="Warning" 
                                                                        style={{ 
                                                                            fontSize: '10px', 
                                                                            color: '#f59e0b',
                                                                            opacity: 0.7
                                                                        }} 
                                                                        title="Low data reliability"
                                                                    />
                                                                )}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td style={{
                                                    padding: '6px 8px',
                                                    width: 140,
                                                    minWidth: 140,
                                                    textAlign: 'left',
                                                    color: isDarkMode ? '#e5e7eb' : '#111827',
                                                    fontFamily: 'Raleway, sans-serif',
                                                    fontSize: '11px',
                                                    fontWeight: 500
                                                }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedMatterId(prev => prev === matter.UniqueID ? null : matter.UniqueID);
                                                        }}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            background: expandedMatterId === matter.UniqueID
                                                                ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)')
                                                                : 'transparent',
                                                            border: 'none',
                                                            borderRadius: 4,
                                                            padding: '4px 8px',
                                                            cursor: 'pointer',
                                                            color: isDarkMode ? '#e5e7eb' : '#111827',
                                                            fontSize: '11px',
                                                            fontFamily: 'Raleway, sans-serif',
                                                            fontWeight: 500,
                                                            transition: 'background 0.15s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (expandedMatterId !== matter.UniqueID) {
                                                                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (expandedMatterId !== matter.UniqueID) {
                                                                e.currentTarget.style.background = 'transparent';
                                                            }
                                                        }}
                                                        title={`Expand source details for ${getMatterSourceLabel(matter)}`}
                                                    >
                                                        <Icon 
                                                            iconName={expandedMatterId === matter.UniqueID ? 'ChevronDown' : 'ChevronRight'}
                                                            style={{ fontSize: 12, transition: 'transform 0.15s ease' }}
                                                        />
                                                        {getMatterSourceLabel(matter)}
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedMatterId === matter.UniqueID && (
                                                <tr style={{ background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(249, 250, 251, 0.95)' }}>
                                                    <td colSpan={11} style={{
                                                        padding: '12px 20px',
                                                        borderBottom: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`
                                                    }}>
                                                        <div style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                                            gap: 16,
                                                            fontSize: '11px',
                                                            color: isDarkMode ? '#94a3b8' : '#4b5563'
                                                        }}>
                                                            <div>
                                                                <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Campaign</div>
                                                                <div>{(matter as any).Campaign || (matter as any).campaign || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Ad Set</div>
                                                                <div>{(matter as any).AdSet || (matter as any).ad_set || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Keyword</div>
                                                                <div>{(matter as any).Keyword || (matter as any).keyword || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>URL</div>
                                                                <div style={{ wordBreak: 'break-all' }}>{(matter as any).ReferralURL || (matter as any).Referral_URL || (matter as any).url || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Most Recent Activity</div>
                                                                <div>{(matter as any).LastActivityDate ? format(parseISO((matter as any).LastActivityDate), 'dd MMM yyyy') : (matter as any).mod_stamp ? format(parseISO((matter as any).mod_stamp), 'dd MMM yyyy') : '—'}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {filteredMatters.length === 0 && (
                                <div style={{
                                    padding: '40px',
                                    textAlign: 'center',
                                    color: isDarkMode ? '#64748b' : '#6b7280',
                                    fontSize: '13px'
                                }}>
                                    No matters found with current filters.
                                </div>
                            )}
                            {filteredMatters.length > tableMatters.length && (
                                <div style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    color: isDarkMode ? '#64748b' : '#6b7280',
                                    fontSize: '11px',
                                    borderTop: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
                                    background: isDarkMode ? '#0f172a' : '#f9fafb'
                                }}>
                                    Showing first {tableMatters.length} of {filteredMatters.length} matters · Refine filters to narrow further
                                </div>
                            )}
                        </div>
                    
                    {/* Show card view only when filters are active and table view is not preferred */}
                    {!showOverview && (
                        <main className={mainContentStyle(isDarkMode)}>
                            {filteredMatters.length === 0 ? (
                                <Text>No matters found matching your criteria.</Text>
                            ) : (
                                <div
                                    className={mergeStyles({
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                        gap: '20px',
                                        marginTop: '20px',
                                    })}
                                >
                                    {displayedMatters.map((matter, idx) => {
                                        const row = Math.floor(idx / 4);
                                        const col = idx % 4;
                                        const animationDelay = row * 0.2 + col * 0.1;
                                        return (
                                            <MatterCard
                                                key={matter.UniqueID}
                                                matter={matter}
                                                onSelect={() => setSelectedMatter(matter)}
                                                animationDelay={animationDelay}
                                                pitchTags={getPitchTagsForMatter(matter)}
                                                pitchTagContainerStyle={pitchTagContainerStyle}
                                                getPitchTagStyle={getPitchTagStyle}
                                            />
                                        );
                                    })}
                                    <div ref={loader} />
                                </div>
                            )}
                        </main>
                    )}
                </>
            )}
        </div>
    );
};

export default MattersReport;
