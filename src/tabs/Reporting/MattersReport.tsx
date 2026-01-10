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
    userData: UserData[] | null;
    teamData?: TeamData[] | null;
    outstandingBalances?: { data: Array<{ associated_matter_ids: number[]; total_outstanding_balance?: number; due?: number; balance?: number }> } | null;
    deals?: DealRecord[] | null;
    instructions?: InstructionRecord[] | null;
    transactions?: Transaction[] | null;
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
// NOTE: Financial calculations are now handled via pre-computed caches (financialDataMap, matterFinancialDetails)
// accessed through getMatterFinancials() and getMatterFinancialsDetailed() for O(1) lookups.

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
    const label = 'Pitch';
    const titleParts: string[] = [];
    if (status) titleParts.push(status);
    if (service) titleParts.push(service);
    if (owner) titleParts.push(`By ${owner}`);
    const pitchedDate = formatDateLabel(deal.PitchedDate || deal.CreatedDate);
    if (pitchedDate) titleParts.push(pitchedDate);
    return { label, title: titleParts.length > 0 ? titleParts.join(' • ') : undefined };
};

const describeInstructionTag = (instruction: InstructionRecord) => {
    const stage = (instruction.Stage || instruction.Status || '').trim();
    const label = 'Instruction';
    const titleParts: string[] = [];
    if (stage) titleParts.push(stage);
    if (instruction.InstructionRef) titleParts.push(instruction.InstructionRef);
    const submitted = formatDateLabel(instruction.SubmissionDate || instruction.CreatedDate);
    if (submitted) titleParts.push(submitted);
    return { label, title: titleParts.length > 0 ? titleParts.join(' • ') : undefined };
};

const pitchTagContainerBaseStyle: CSSProperties = {
    marginTop: 6,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
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
    return String(value)
        .trim()
        .replace(/\s+/g, '')
        .toLowerCase();
};

const normalizeMatterIdentifiers = (matter: Matter, fallbackKey: string): NormalizedMatterIdentifiers => {
    const candidateValues = [
        (matter as any)['Unique ID'],
        matter.UniqueID,
        (matter as any)['Display Number'],
        matter.DisplayNumber,
        (matter as any).DisplayNumber,
        (matter as any).MatterID,
        (matter as any).MatterId,
        (matter as any).MatterRef,
        (matter as any)['Matter Ref'],
        (matter as any).ID,
        (matter as any).Id,
        (matter as any).id,
        (matter as any).unique_id,
        (matter as any).ClientMatterId,
        (matter as any).clientMatterId,
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
    // Prioritize 'date' and 'created_at' which represent actual WIP activity dates
    const timestampFields = ['date', 'created_at', 'createdAt', 'last_updated', 'updated_at', 'updatedAt', 'modified_at', 'modifiedAt', 'timestamp'];
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
    
    // ---------- Advanced Filter States ----------
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
    const [collectedMin, setCollectedMin] = useState<string>('');
    const [collectedMax, setCollectedMax] = useState<string>('');
    const [wipMin, setWipMin] = useState<string>('');
    const [wipMax, setWipMax] = useState<string>('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
    
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
    
    // ---------- Matter Inspection State ----------
    interface EnquiryMatch {
        id: string | number;
        name: string | null;
        email: string;
        aow?: string;
        tow?: string;
        date?: string;
        stage?: string;
        poc?: string;
        acid?: string;
        source?: string;
        campaign?: string;
        adSet?: string;
        keyword?: string;
        url?: string;
        gclid?: string;
        phone?: string;
    }
    interface EnquiryLookupResult {
        found: boolean;
        count: number;
        matches: EnquiryMatch[];
        error: string | null;
        loading?: boolean;
    }
    interface CallRailCall {
        id: string;
        duration: number;
        startTime: string;
        direction: 'inbound' | 'outbound';
        answered: boolean;
        customerPhoneNumber: string;
        businessPhoneNumber: string;
        customerName: string;
        trackingPhoneNumber: string;
        source: string;
        keywords: string;
        medium: string;
        campaign: string;
        recordingUrl: string | null;
        note: string;
        landingPageUrl?: string;
        channel?: string;
    }
    interface WebFormSignal {
        id: string;
        source: 'legacy' | 'instructions';
        url?: string | null;
        gclid?: string | null;
        campaign?: string | null;
        phone?: string | null;
        date?: string | null;
    }
    interface CallRailLookupResult {
        found: boolean;
        count: number;
        calls: CallRailCall[];
        error: string | null;
        loading: boolean;
        phoneSearched?: string | null;
        searched?: boolean;  // true if API was called, false if skipped (no phone)
    }
    interface GoogleAdsClickData {
        gclid: string;
        clickDate?: string;
        campaignId?: string;
        campaignName?: string;
        adGroupId?: string;
        adGroupName?: string;
        keyword?: string;
        keywordMatchType?: string;
        device?: string;
        locationCity?: string;
        locationCountry?: string;
        adNetworkType?: string;
        clickType?: string;
        pageNumber?: number;
        slot?: string;
        error?: string;
    }
    interface MatterInspection {
        matterId: string;
        uniqueId: string;
        clientId: string;
        clientName: string;
        clientEmail: string;
        clientPhone: string;
        displayNumber: string;
        version: 'v1' | 'v2';  // v1 = legacy, v2 = new space (has InstructionRef)
        instructionRef?: string;
        loading: boolean;
        error?: string;
        enquiryLookup?: {
            legacy: EnquiryLookupResult;
            instructions: EnquiryLookupResult;
            loading: boolean;
        };
        webFormMatches?: WebFormSignal[];
        callRailLookup?: CallRailLookupResult;
        googleAdsData?: Map<string, GoogleAdsClickData>; // keyed by GCLID
    }
    const extractGclidToken = (value?: string | null): string | null => {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/(?:[?&]gclid=)([^&#]+)/i);
        return match ? decodeURIComponent(match[1]) : null;
    };

    const collectWebFormSignals = (lookup?: MatterInspection['enquiryLookup']): WebFormSignal[] => {
        if (!lookup) return [];
        const signals: WebFormSignal[] = [];
        const pushMatches = (matches: EnquiryMatch[] | undefined, source: 'legacy' | 'instructions') => {
            if (!Array.isArray(matches)) return;
            matches.forEach((match, idx) => {
                const url = (match.url || '').trim() || null;
                const explicitGclid = (match.gclid || '').trim() || null;
                const derivedGclid = explicitGclid || extractGclidToken(url || undefined);
                if (!derivedGclid) return;
                signals.push({
                    id: `${source}-${match.id ?? idx}-${derivedGclid}`,
                    source,
                    url,
                    gclid: derivedGclid,
                    campaign: match.campaign || null,
                    phone: match.phone || null,
                    date: match.date || null,
                });
            });
        };
        pushMatches(lookup.legacy?.matches, 'legacy');
        pushMatches(lookup.instructions?.matches, 'instructions');
        return signals;
    };
    const [matterInspection, setMatterInspection] = useState<MatterInspection | null>(null);
    
    // ---------- Multi-Select for Bulk Operations ----------
    const [selectedMatterIds, setSelectedMatterIds] = useState<Set<string>>(new Set());
    const [bulkInspectionResults, setBulkInspectionResults] = useState<Map<string, MatterInspection>>(new Map());
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [bulkProcessingProgress, setBulkProcessingProgress] = useState<{ current: number; total: number; currentMatter: string } | null>(null);
    const [googleAdsEnriching, setGoogleAdsEnriching] = useState(false);
    const [googleAdsProgress, setGoogleAdsProgress] = useState<{ current: number; total: number } | null>(null);
    
    // Google Ads Customer ID - should ideally come from config/env
    const GOOGLE_ADS_CUSTOMER_ID = process.env.REACT_APP_GOOGLE_ADS_CUSTOMER_ID || '';
    
    const toggleMatterSelection = useCallback((matterId: string) => {
        setSelectedMatterIds(prev => {
            const next = new Set(prev);
            if (next.has(matterId)) {
                next.delete(matterId);
            } else {
                next.add(matterId);
            }
            return next;
        });
    }, []);
    
    // Note: selectAllVisible is defined after tableMatters useMemo
    
    const clearSelection = useCallback(() => {
        setSelectedMatterIds(new Set());
        setBulkInspectionResults(new Map());
    }, []);
    
    // Enrich inspection results with Google Ads data
    const enrichWithGoogleAdsData = useCallback(async () => {
        if (bulkInspectionResults.size === 0 || !GOOGLE_ADS_CUSTOMER_ID) return;
        
        // Collect all unique GCLIDs from the inspection results
        const gclidMap = new Map<string, string[]>(); // gclid -> matterIds
        bulkInspectionResults.forEach((inspection, matterId) => {
            const signals = inspection.webFormMatches || [];
            signals.forEach(signal => {
                if (signal.gclid) {
                    const existing = gclidMap.get(signal.gclid) || [];
                    existing.push(matterId);
                    gclidMap.set(signal.gclid, existing);
                }
            });
        });
        
        const gclids = Array.from(gclidMap.keys());
        if (gclids.length === 0) {
            return;
        }
        
        setGoogleAdsEnriching(true);
        setGoogleAdsProgress({ current: 0, total: gclids.length });
        
        try {
            const baseUrl = getProxyBaseUrl();
            const code = process.env.REACT_APP_GET_GOOGLE_ADS_CLICK_DATA_CODE;
            const path = process.env.REACT_APP_GET_GOOGLE_ADS_CLICK_DATA_PATH || 'api/getGoogleAdsClickData';
            
            // Process in batches of 20
            const batchSize = 20;
            const allResults = new Map<string, GoogleAdsClickData>();
            
            for (let i = 0; i < gclids.length; i += batchSize) {
                const batch = gclids.slice(i, i + batchSize);
                setGoogleAdsProgress({ current: Math.min(i + batchSize, gclids.length), total: gclids.length });
                
                try {
                    const url = code ? `${baseUrl}/${path}?code=${code}` : `${baseUrl}/${path}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            gclids: batch,
                            customerId: GOOGLE_ADS_CUSTOMER_ID,
                        }),
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.results && Array.isArray(data.results)) {
                            data.results.forEach((result: GoogleAdsClickData) => {
                                allResults.set(result.gclid, result);
                            });
                        }
                    }
                } catch (err) {
                    console.error('[GoogleAds] Batch error:', err);
                }
            }
            
            // Update inspection results with Google Ads data
            if (allResults.size > 0) {
                setBulkInspectionResults(prev => {
                    const updated = new Map(prev);
                    updated.forEach((inspection, matterId) => {
                        const relevantGclids = (inspection.webFormMatches || [])
                            .map(s => s.gclid)
                            .filter((g): g is string => !!g);
                        
                        if (relevantGclids.length > 0) {
                            const googleAdsData = new Map<string, GoogleAdsClickData>();
                            relevantGclids.forEach(gclid => {
                                const data = allResults.get(gclid);
                                if (data) googleAdsData.set(gclid, data);
                            });
                            if (googleAdsData.size > 0) {
                                updated.set(matterId, { ...inspection, googleAdsData });
                            }
                        }
                    });
                    return updated;
                });
            }
            
            // Google Ads enrichment complete
        } catch (err) {
            console.error('[GoogleAds] Error enriching with Google Ads data:', err);
        } finally {
            setGoogleAdsEnriching(false);
            setGoogleAdsProgress(null);
        }
    }, [bulkInspectionResults, GOOGLE_ADS_CUSTOMER_ID]);
    
    // Bulk process selected matters
    const runBulkInspection = useCallback(async () => {
        if (selectedMatterIds.size === 0) return;
        setBulkProcessing(true);
        setBulkProcessingProgress({ current: 0, total: selectedMatterIds.size, currentMatter: '' });
        const results = new Map<string, MatterInspection>();
        const matterIds = Array.from(selectedMatterIds);
        
        for (let i = 0; i < matterIds.length; i++) {
            const matterId = matterIds[i];
            setBulkProcessingProgress({ current: i + 1, total: matterIds.length, currentMatter: matterId });
            
            try {
                // Step 1: Fetch from Clio
                const clioResp = await fetch(`/api/matters/${matterId}/client-email`);
                const clioData = await clioResp.json();
                
                const inspection: MatterInspection = {
                    matterId,
                    uniqueId: matterId,
                    clientId: clioData.clientId || '',
                    clientName: clioData.clientName || '',
                    clientEmail: clioData.clientEmail || '',
                    clientPhone: clioData.clientPhone || '',
                    displayNumber: clioData.displayNumber || '',
                    version: 'v1',
                    loading: false,
                    webFormMatches: []
                };
                
                // Step 2: Enquiry lookup if we have email
                if (inspection.clientEmail) {
                    const enquiryResp = await fetch(`/api/matters/enquiry-lookup/${encodeURIComponent(inspection.clientEmail)}`);
                    const enquiryData = await enquiryResp.json();
                    if (enquiryData.ok) {
                        inspection.enquiryLookup = {
                            legacy: { ...enquiryData.legacy, loading: false },
                            instructions: { ...enquiryData.instructions, loading: false },
                            loading: false
                        };
                        inspection.webFormMatches = collectWebFormSignals(inspection.enquiryLookup);
                    }
                }
                if (!inspection.webFormMatches) {
                    inspection.webFormMatches = [];
                }
                
                // Collect phone numbers
                const phones: string[] = [];
                if (inspection.clientPhone) phones.push(inspection.clientPhone);
                inspection.enquiryLookup?.legacy.matches.forEach(m => m.phone && phones.push(m.phone));
                inspection.enquiryLookup?.instructions.matches.forEach(m => m.phone && phones.push(m.phone));
                const uniquePhones = [...new Set(phones.filter(p => p && p.length > 5))];
                
                // Step 3: CallRail lookup if we have phone
                if (uniquePhones.length > 0) {
                    try {
                        const callRailResp = await fetch('/api/callrailCalls', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phoneNumber: uniquePhones[0], maxResults: 20 })
                        });
                        const callRailData = await callRailResp.json();
                        if (callRailData.success) {
                            inspection.callRailLookup = {
                                found: callRailData.calls.length > 0,
                                count: callRailData.calls.length,
                                calls: callRailData.calls,
                                error: null,
                                loading: false,
                                phoneSearched: uniquePhones[0],
                                searched: true
                            };
                        } else {
                            inspection.callRailLookup = {
                                found: false,
                                count: 0,
                                calls: [],
                                error: callRailData.error || 'Unknown error',
                                loading: false,
                                phoneSearched: uniquePhones[0],
                                searched: true
                            };
                        }
                    } catch (callRailErr) {
                        inspection.callRailLookup = {
                            found: false,
                            count: 0,
                            calls: [],
                            error: callRailErr instanceof Error ? callRailErr.message : 'Network error',
                            loading: false,
                            phoneSearched: uniquePhones[0],
                            searched: true
                        };
                    }
                } else {
                    // No phone to search - mark as not searched
                    inspection.callRailLookup = {
                        found: false,
                        count: 0,
                        calls: [],
                        error: null,
                        loading: false,
                        phoneSearched: null,
                        searched: false
                    };
                }
                
                results.set(matterId, inspection);
            } catch (err) {
                console.error(`Bulk inspection failed for ${matterId}:`, err);
            }
        }
        
        setBulkInspectionResults(results);
        setBulkProcessing(false);
        setBulkProcessingProgress(null);
    }, [selectedMatterIds]);
    
    // ---------- Instructions DB Matters Toggle (Experimental) ----------
    type MatterSource = 'legacy' | 'instructions';
    const [matterSource, setMatterSource] = useState<MatterSource>('legacy');
    const [instructionsMatters, setInstructionsMatters] = useState<Matter[]>([]);
    const [instructionsMattersLoading, setInstructionsMattersLoading] = useState(false);
    const [instructionsMattersError, setInstructionsMattersError] = useState<string | null>(null);
    
    // Fetch matters from Instructions DB when toggled
    const fetchInstructionsMatters = useCallback(async () => {
        setInstructionsMattersLoading(true);
        setInstructionsMattersError(null);
        try {
            const response = await fetch('/api/instructions/matters');
            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.status}`);
            }
            const data = await response.json();
            if (data.success && Array.isArray(data.matters)) {
                // Map to Matter interface format
                const mappedMatters: Matter[] = data.matters.map((m: any) => ({
                    MatterID: m.MatterID || '',
                    InstructionRef: m.InstructionRef || '',
                    DisplayNumber: m.DisplayNumber || '',
                    OpenDate: m.OpenDate || '',
                    MonthYear: '',
                    YearMonthNumeric: 0,
                    ClientID: m.ClientID || '',
                    ClientName: m.ClientName || '',
                    ClientPhone: '',
                    ClientEmail: '',
                    Status: m.Status || 'Unknown',
                    UniqueID: m.MatterID || m.InstructionRef || `instr-${Math.random()}`,
                    Description: m.Description || '',
                    PracticeArea: m.PracticeArea || '',
                    Source: 'Instructions DB',
                    Referrer: '',
                    ResponsibleSolicitor: m.ResponsibleSolicitor || '',
                    OriginatingSolicitor: m.OriginatingSolicitor || '',
                    SupervisingPartner: '',
                    Opponent: '',
                    OpponentSolicitor: '',
                    CloseDate: '',
                    ApproxValue: '',
                    mod_stamp: '',
                    method_of_contact: '',
                    CCL_date: null
                }));
                setInstructionsMatters(mappedMatters);
            } else {
                throw new Error(data.error || 'Invalid response');
            }
        } catch (err) {
            console.error('Failed to fetch instructions matters:', err);
            setInstructionsMattersError(err instanceof Error ? err.message : 'Unknown error');
            setInstructionsMatters([]);
        } finally {
            setInstructionsMattersLoading(false);
        }
    }, []);
    
    // Fetch instructions matters when source changes to 'instructions'
    useEffect(() => {
        if (matterSource === 'instructions' && instructionsMatters.length === 0 && !instructionsMattersLoading) {
            fetchInstructionsMatters();
        }
    }, [matterSource, instructionsMatters.length, instructionsMattersLoading, fetchInstructionsMatters]);
    
    // ---------- Team and Role Filter States ----------
    const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [showRoleFilter, setShowRoleFilter] = useState<boolean>(false);
    
    // Last refreshed timestamp for the toolbar status chip
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(new Date());
    const [timeSinceRefresh, setTimeSinceRefresh] = useState<string>('just now');

    const ROLE_OPTIONS = [
        { key: 'Partner', label: 'Partner' },
        { key: 'Senior Partner', label: 'Senior Partner' },
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
        userData && userData.length > 0 ? userData[0]?.First?.trim().toUpperCase() ?? '' : '';
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
            // For numeric/financial fields, default to descending (highest first)
            // For text/date fields, default to ascending
            const numericFields: SortField[] = ['wipValue', 'collectedValue', 'roiValue'];
            setSortDirection(numericFields.includes(field) ? 'desc' : 'asc');
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

        const roleGroup = (roleKey: string): string[] => {
            if (roleKey === 'Partner') return ['Partner', 'Senior Partner'];
            return [roleKey];
        };

        const roleMatchesSelection = (memberRole: string | undefined, roles: string[]): boolean => {
            if (!memberRole) return false;
            if (roles.includes(memberRole)) return true;
            if (memberRole === 'Senior Partner' && roles.includes('Partner')) return true;
            return false;
        };
        
        // Update role selection
        setSelectedRoles((prev) => (
            isRoleCurrentlySelected
                ? prev.filter((item) => item !== role)
                : [...prev, role]
        ));
        
        // Auto-select team members with this role
        if (!isRoleCurrentlySelected) {
            const membersWithRole = teamMembers
                .filter(member => roleGroup(role).includes(member.role ?? ''))
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
                        return member && roleMatchesSelection(member.role, remainingRoles);
                    })
                );
            } else {
                const membersWithRole = teamMembers
                    .filter(member => roleGroup(role).includes(member.role ?? ''))
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
        // Use instructions matters when toggle is set to 'instructions'
        const sourceMatters = matterSource === 'instructions' ? (instructionsMatters || []) : matters;
        
        if (rangeKey === 'all' || !startDate || !endDate) {
            return sourceMatters.slice();
        }
        // Normalize range boundaries to start/end of day for consistent comparison
        const rangeStart = startOfDay(startDate).getTime();
        const rangeEnd = endOfDay(endDate).getTime();
        
        return sourceMatters.filter((m) => {
            // Check both camelCase and legacy spaced field names
            const rawDate = (m as any)['Open Date'] || m.OpenDate || '';
            if (!rawDate) return false;
            
            // Handle both ISO strings and date-only strings
            // parseISO handles "2025-11-25" and "2025-11-25T00:00:00.000Z"
            const openDate = parseISO(rawDate);
            if (!isValid(openDate)) return false;
            
            // Compare using timestamps to avoid timezone issues
            const openTime = openDate.getTime();
            return openTime >= rangeStart && openTime <= rangeEnd;
        });
    }, [matters, instructionsMatters, matterSource, rangeKey, startDate, endDate]);

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
        
        // Status filter (Open/Closed)
        if (statusFilter !== 'all') {
            final = final.filter((m) => {
                const status = ((m as any).Status || m.Status || '').toLowerCase();
                return statusFilter === 'open' ? status === 'open' : status === 'closed';
            });
        }
        
        // Financial filters - Collected range
        const collectedMinVal = collectedMin ? parseFloat(collectedMin) : null;
        const collectedMaxVal = collectedMax ? parseFloat(collectedMax) : null;
        if (collectedMinVal !== null || collectedMaxVal !== null) {
            final = final.filter((m) => {
                const financials = getMatterFinancials(m);
                const collected = financials.collected;
                if (collectedMinVal !== null && collected < collectedMinVal) return false;
                if (collectedMaxVal !== null && collected > collectedMaxVal) return false;
                return true;
            });
        }
        
        // Financial filters - WIP range
        const wipMinVal = wipMin ? parseFloat(wipMin) : null;
        const wipMaxVal = wipMax ? parseFloat(wipMax) : null;
        if (wipMinVal !== null || wipMaxVal !== null) {
            final = final.filter((m) => {
                const financials = getMatterFinancials(m);
                const wip = financials.wip;
                if (wipMinVal !== null && wip < wipMinVal) return false;
                if (wipMaxVal !== null && wip > wipMaxVal) return false;
                return true;
            });
        }
        
        // Deduplicate matters by UniqueID to prevent duplicate rows
        const seenIds = new Set<string>();
        final = final.filter((m) => {
            const id = m.UniqueID || (m as any)['Unique ID'] || m.DisplayNumber;
            if (seenIds.has(id)) {
                return false;
            }
            seenIds.add(id);
            return true;
        });
        
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
                if (result !== 0) return sortDirection === 'asc' ? result : -result;
                // Secondary sort by UniqueID for stability when dates are equal
                return (a.UniqueID || '').localeCompare(b.UniqueID || '');
            } else if (sortField === 'wipValue' || sortField === 'collectedValue' || sortField === 'roiValue') {
                // Ensure we have valid numbers, treating NaN/undefined as 0
                const numA = Number(aVal) || 0;
                const numB = Number(bVal) || 0;
                const result = numA - numB;
                if (result !== 0) return sortDirection === 'asc' ? result : -result;
                // Secondary sort by open date (newest first) when financial values are equal
                const dateA = matterTimestamps.get(a.UniqueID) || 0;
                const dateB = matterTimestamps.get(b.UniqueID) || 0;
                return dateB - dateA; // Descending (newest first)
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
        statusFilter,
        collectedMin,
        collectedMax,
        wipMin,
        wipMax,
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
    const tableMatterLookup = useMemo(() => {
        const map = new Map<string, Matter>();
        tableMatters.forEach((matter) => {
            const uniqueId = matter.UniqueID ? String(matter.UniqueID) : null;
            const displayNumber = matter.DisplayNumber ? String(matter.DisplayNumber) : null;
            if (uniqueId) map.set(uniqueId, matter);
            if (displayNumber) map.set(displayNumber, matter);
        });
        return map;
    }, [tableMatters]);

    const hasBulkInspectionResults = bulkInspectionResults.size > 0;

    // Select all visible matters for bulk operations
    const selectAllVisible = useCallback(() => {
        const visibleIds = tableMatters.map(m => {
            // Match the same ID logic used for matterRowId in the table rows
            const fallbackRowId = (m as any)['Display Number'] || m.DisplayNumber || '';
            return m.UniqueID || fallbackRowId;
        }).filter(Boolean);
        setSelectedMatterIds(new Set(visibleIds));
    }, [tableMatters]);

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
                        <div style={{ padding: '24px' }}>
                            {/* Header with Display Number and Clio Link */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                                <Icon iconName="OpenFolderHorizontal" style={{ fontSize: 24, color: colours.highlight }} />
                                <FluentLink
                                    href={`https://eu.app.clio.com/nc/#/matters/${encodeURIComponent(selectedMatter?.DisplayNumber || '')}`}
                                    target="_blank"
                                    style={{ fontSize: 18, fontWeight: 600 }}
                                >
                                    {selectedMatter?.DisplayNumber}
                                </FluentLink>
                                <span style={{ 
                                    background: selectedMatter?.Status === 'Open' ? (isDarkMode ? '#10b98140' : '#dcfce7') : (isDarkMode ? '#6b728040' : '#f3f4f6'),
                                    color: selectedMatter?.Status === 'Open' ? (isDarkMode ? '#34d399' : '#16a34a') : (isDarkMode ? '#9ca3af' : '#6b7280'),
                                    padding: '4px 12px',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                    border: `1px solid ${selectedMatter?.Status === 'Open' ? (isDarkMode ? '#10b981' : '#16a34a') : (isDarkMode ? '#6b7280' : '#d1d5db')}`
                                }}>
                                    {selectedMatter?.Status || 'Open'}
                                </span>
                            </div>

                            {/* Main Grid Layout */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                                {/* Left Column - Financial Metrics */}
                                <div>
                                    {/* Financial Cards Row */}
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                                        {/* WIP Card */}
                                        <div style={{
                                            background: isDarkMode ? colours.dark.sectionBackground : 'white',
                                            borderRadius: 12,
                                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                            padding: 16,
                                            minWidth: 200,
                                            flex: 1
                                        }}>
                                            <span style={{ color: isDarkMode ? '#94a3b8' : colours.light.subText, fontSize: 12, display: 'block', marginBottom: 8 }}>Work in Progress</span>
                                            <span style={{ fontSize: 24, fontWeight: 700, color: isDarkMode ? '#f1f5f9' : '#111827' }}>
                                                {formatCurrency(getMatterFinancials(selectedMatter).wip)}
                                            </span>
                                        </div>
                                        {/* Collected Card */}
                                        <div style={{
                                            background: isDarkMode ? colours.dark.sectionBackground : 'white',
                                            borderRadius: 12,
                                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                            padding: 16,
                                            minWidth: 200,
                                            flex: 1
                                        }}>
                                            <span style={{ color: isDarkMode ? '#94a3b8' : colours.light.subText, fontSize: 12, display: 'block', marginBottom: 8 }}>Collected Fees</span>
                                            <span style={{ fontSize: 24, fontWeight: 700, color: isDarkMode ? '#34d399' : '#16a34a' }}>
                                                {formatCurrency(getMatterFinancials(selectedMatter).collected)}
                                            </span>
                                        </div>
                                        {/* Outstanding Card */}
                                        {matterOutstandingData && (
                                            <div style={{
                                                background: isDarkMode ? colours.dark.sectionBackground : 'white',
                                                borderRadius: 12,
                                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                                padding: 16,
                                                minWidth: 200,
                                                flex: 1
                                            }}>
                                                <span style={{ color: isDarkMode ? '#94a3b8' : colours.light.subText, fontSize: 12, display: 'block', marginBottom: 8 }}>Outstanding Balance</span>
                                                <span style={{ fontSize: 24, fontWeight: 700, color: isDarkMode ? '#f59e0b' : '#d97706' }}>
                                                    {formatCurrency(matterOutstandingData.total_outstanding_balance || matterOutstandingData.due || 0)}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Matter Details Section */}
                                    <div style={{
                                        background: isDarkMode ? colours.dark.sectionBackground : 'white',
                                        borderRadius: 12,
                                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                        padding: 20
                                    }}>
                                        <span style={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#374151', display: 'block', marginBottom: 16 }}>Matter Details</span>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                            <div>
                                                <span style={{ color: isDarkMode ? '#64748b' : colours.light.subText, fontSize: 12 }}>Practice Area</span>
                                                <div style={{ fontWeight: 500, color: isDarkMode ? '#f1f5f9' : '#111827' }}>{selectedMatter?.PracticeArea || '—'}</div>
                                            </div>
                                            <div>
                                                <span style={{ color: isDarkMode ? '#64748b' : colours.light.subText, fontSize: 12 }}>Description</span>
                                                <div style={{ fontWeight: 500, color: isDarkMode ? '#f1f5f9' : '#111827' }}>{selectedMatter?.Description || '—'}</div>
                                            </div>
                                            <div>
                                                <span style={{ color: isDarkMode ? '#64748b' : colours.light.subText, fontSize: 12 }}>Open Date</span>
                                                <div style={{ fontWeight: 500, color: isDarkMode ? '#f1f5f9' : '#111827' }}>
                                                    {selectedMatter?.OpenDate ? format(parseISO(selectedMatter.OpenDate), 'dd MMM yyyy') : '—'}
                                                </div>
                                            </div>
                                            <div>
                                                <span style={{ color: isDarkMode ? '#64748b' : colours.light.subText, fontSize: 12 }}>Source</span>
                                                <div style={{ fontWeight: 500, color: isDarkMode ? '#f1f5f9' : '#111827' }}>{selectedMatter?.Source || '—'}</div>
                                            </div>
                                            <div>
                                                <span style={{ color: isDarkMode ? '#64748b' : colours.light.subText, fontSize: 12 }}>Opponent</span>
                                                <div style={{ fontWeight: 500, color: isDarkMode ? '#f1f5f9' : '#111827' }}>{selectedMatter?.Opponent || '—'}</div>
                                            </div>
                                            <div>
                                                <span style={{ color: isDarkMode ? '#64748b' : colours.light.subText, fontSize: 12 }}>Opponent Solicitor</span>
                                                <div style={{ fontWeight: 500, color: isDarkMode ? '#f1f5f9' : '#111827' }}>{selectedMatter?.OpponentSolicitor || '—'}</div>
                                            </div>
                                        </div>

                                        {/* Team Avatars */}
                                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}` }}>
                                            <span style={{ color: isDarkMode ? '#64748b' : colours.light.subText, fontSize: 12, display: 'block', marginBottom: 12 }}>Team</span>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <div title={`${selectedMatter?.OriginatingSolicitor} (Originating)`} style={{
                                                    width: 40, height: 40, borderRadius: '50%', background: '#0ea5e9', color: 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14
                                                }}>
                                                    {getInitialsFromName(selectedMatter?.OriginatingSolicitor || '')}
                                                </div>
                                                <div title={`${selectedMatter?.ResponsibleSolicitor} (Responsible)`} style={{
                                                    width: 40, height: 40, borderRadius: '50%', background: '#22c55e', color: 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14
                                                }}>
                                                    {getInitialsFromName(selectedMatter?.ResponsibleSolicitor || '')}
                                                </div>
                                                {selectedMatter?.SupervisingPartner && (
                                                    <div title={`${selectedMatter?.SupervisingPartner} (Supervising)`} style={{
                                                        width: 40, height: 40, borderRadius: '50%', background: '#f59e0b', color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14
                                                    }}>
                                                        {getInitialsFromName(selectedMatter?.SupervisingPartner || '')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Client Info */}
                                <div>
                                    <div style={{
                                        background: isDarkMode ? colours.dark.sectionBackground : 'white',
                                        borderRadius: 12,
                                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                        padding: 20
                                    }}>
                                        <span style={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#374151', display: 'block', marginBottom: 16 }}>Client</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                            <Icon iconName="Contact" style={{ fontSize: 20, color: colours.highlight }} />
                                            <span style={{ fontWeight: 600, color: isDarkMode ? '#f1f5f9' : '#111827' }}>{selectedMatter?.ClientName || '—'}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {selectedMatter?.ClientEmail && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Icon iconName="Mail" style={{ fontSize: 14, color: isDarkMode ? '#64748b' : colours.light.subText }} />
                                                    <span style={{ color: isDarkMode ? '#94a3b8' : '#6b7280', fontSize: 13 }}>{selectedMatter.ClientEmail}</span>
                                                </div>
                                            )}
                                            {selectedMatter?.ClientPhone && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Icon iconName="Phone" style={{ fontSize: 14, color: isDarkMode ? '#64748b' : colours.light.subText }} />
                                                    <span style={{ color: isDarkMode ? '#94a3b8' : '#6b7280', fontSize: 13 }}>{selectedMatter.ClientPhone}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Pitch/Instruction Tags */}
                                    {(() => {
                                        const tags = getPitchTagsForMatter(selectedMatter);
                                        if (tags.length === 0) return null;
                                        return (
                                            <div style={{
                                                background: isDarkMode ? colours.dark.sectionBackground : 'white',
                                                borderRadius: 12,
                                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                                padding: 20,
                                                marginTop: 16
                                            }}>
                                                <span style={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#374151', display: 'block', marginBottom: 12 }}>Related Activity</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                    {tags.map(tag => (
                                                        <span key={tag.key} style={getPitchTagStyle(tag.type)} title={tag.title}>
                                                            {tag.label}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'Transactions' && (
                        <MatterTransactions matter={selectedMatter} transactions={transactions ?? undefined} />
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

            {/* Advanced Filters Panel */}
            <div style={{
                margin: '12px 0',
                background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(249, 250, 251, 0.8)',
                border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(209, 213, 219, 0.6)'}`,
                borderRadius: 8,
                overflow: 'hidden'
            }}>
                <button
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: isDarkMode ? '#94a3b8' : '#6b7280',
                        fontSize: 12,
                        fontWeight: 600
                    }}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon iconName="FilterSettings" style={{ fontSize: 14 }} />
                        Advanced Filters
                        {(statusFilter !== 'all' || collectedMin || collectedMax || wipMin || wipMax) && (
                            <span style={{
                                background: isDarkMode ? '#3b82f6' : '#2563eb',
                                color: '#fff',
                                padding: '2px 6px',
                                borderRadius: 10,
                                fontSize: 10,
                                fontWeight: 700
                            }}>
                                Active
                            </span>
                        )}
                    </span>
                    <span style={{ transform: showAdvancedFilters ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
                </button>
                
                {showAdvancedFilters && (
                    <div style={{
                        padding: '16px',
                        borderTop: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(209, 213, 219, 0.6)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16
                    }}>
                        {/* Status Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <label style={{ 
                                fontSize: 11, 
                                fontWeight: 600, 
                                color: isDarkMode ? '#cbd5e1' : '#374151',
                                minWidth: 70
                            }}>
                                Status:
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {(['all', 'open', 'closed'] as const).map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        style={{
                                            padding: '6px 14px',
                                            fontSize: 11,
                                            fontWeight: statusFilter === status ? 700 : 500,
                                            background: statusFilter === status 
                                                ? (isDarkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(37, 99, 235, 0.1)')
                                                : 'transparent',
                                            border: `1px solid ${statusFilter === status 
                                                ? (isDarkMode ? '#3b82f6' : '#2563eb')
                                                : (isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(209, 213, 219, 0.8)')}`,
                                            borderRadius: 6,
                                            cursor: 'pointer',
                                            color: statusFilter === status
                                                ? (isDarkMode ? '#60a5fa' : '#2563eb')
                                                : (isDarkMode ? '#94a3b8' : '#6b7280'),
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {status.charAt(0).toUpperCase() + status.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Collected Range Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <label style={{ 
                                fontSize: 11, 
                                fontWeight: 600, 
                                color: isDarkMode ? '#cbd5e1' : '#374151',
                                minWidth: 70
                            }}>
                                Collected:
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, color: isDarkMode ? '#64748b' : '#9ca3af' }}>£</span>
                                <input
                                    type="number"
                                    placeholder="Min"
                                    value={collectedMin}
                                    onChange={(e) => setCollectedMin(e.target.value)}
                                    style={{
                                        width: 80,
                                        padding: '6px 10px',
                                        fontSize: 11,
                                        border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(209, 213, 219, 0.8)'}`,
                                        borderRadius: 6,
                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#fff',
                                        color: isDarkMode ? '#e2e8f0' : '#1f2937',
                                        outline: 'none'
                                    }}
                                />
                                <span style={{ fontSize: 11, color: isDarkMode ? '#64748b' : '#9ca3af' }}>to £</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    value={collectedMax}
                                    onChange={(e) => setCollectedMax(e.target.value)}
                                    style={{
                                        width: 80,
                                        padding: '6px 10px',
                                        fontSize: 11,
                                        border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(209, 213, 219, 0.8)'}`,
                                        borderRadius: 6,
                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#fff',
                                        color: isDarkMode ? '#e2e8f0' : '#1f2937',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                            {/* Quick presets for Collected */}
                            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                                {[
                                    { label: '£0', min: '0', max: '0' },
                                    { label: '£1+', min: '1', max: '' },
                                    { label: '£1k+', min: '1000', max: '' },
                                    { label: '£5k+', min: '5000', max: '' },
                                ].map((preset) => (
                                    <button
                                        key={preset.label}
                                        onClick={() => {
                                            setCollectedMin(preset.min);
                                            setCollectedMax(preset.max);
                                        }}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: 10,
                                            fontWeight: 500,
                                            background: (collectedMin === preset.min && collectedMax === preset.max)
                                                ? (isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(22, 163, 74, 0.1)')
                                                : 'transparent',
                                            border: `1px solid ${(collectedMin === preset.min && collectedMax === preset.max)
                                                ? (isDarkMode ? '#22c55e' : '#16a34a')
                                                : (isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(209, 213, 219, 0.6)')}`,
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                            color: (collectedMin === preset.min && collectedMax === preset.max)
                                                ? (isDarkMode ? '#4ade80' : '#16a34a')
                                                : (isDarkMode ? '#64748b' : '#9ca3af'),
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* WIP Range Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <label style={{ 
                                fontSize: 11, 
                                fontWeight: 600, 
                                color: isDarkMode ? '#cbd5e1' : '#374151',
                                minWidth: 70
                            }}>
                                WIP:
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, color: isDarkMode ? '#64748b' : '#9ca3af' }}>£</span>
                                <input
                                    type="number"
                                    placeholder="Min"
                                    value={wipMin}
                                    onChange={(e) => setWipMin(e.target.value)}
                                    style={{
                                        width: 80,
                                        padding: '6px 10px',
                                        fontSize: 11,
                                        border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(209, 213, 219, 0.8)'}`,
                                        borderRadius: 6,
                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#fff',
                                        color: isDarkMode ? '#e2e8f0' : '#1f2937',
                                        outline: 'none'
                                    }}
                                />
                                <span style={{ fontSize: 11, color: isDarkMode ? '#64748b' : '#9ca3af' }}>to £</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    value={wipMax}
                                    onChange={(e) => setWipMax(e.target.value)}
                                    style={{
                                        width: 80,
                                        padding: '6px 10px',
                                        fontSize: 11,
                                        border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(209, 213, 219, 0.8)'}`,
                                        borderRadius: 6,
                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#fff',
                                        color: isDarkMode ? '#e2e8f0' : '#1f2937',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                            {/* Quick presets for WIP */}
                            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                                {[
                                    { label: '£0', min: '0', max: '0' },
                                    { label: 'Has WIP', min: '1', max: '' },
                                    { label: '£1k+', min: '1000', max: '' },
                                ].map((preset) => (
                                    <button
                                        key={preset.label}
                                        onClick={() => {
                                            setWipMin(preset.min);
                                            setWipMax(preset.max);
                                        }}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: 10,
                                            fontWeight: 500,
                                            background: (wipMin === preset.min && wipMax === preset.max)
                                                ? (isDarkMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(245, 158, 11, 0.1)')
                                                : 'transparent',
                                            border: `1px solid ${(wipMin === preset.min && wipMax === preset.max)
                                                ? (isDarkMode ? '#fbbf24' : '#f59e0b')
                                                : (isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(209, 213, 219, 0.6)')}`,
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                            color: (wipMin === preset.min && wipMax === preset.max)
                                                ? (isDarkMode ? '#fcd34d' : '#d97706')
                                                : (isDarkMode ? '#64748b' : '#9ca3af'),
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Clear All Advanced Filters */}
                        {(statusFilter !== 'all' || collectedMin || collectedMax || wipMin || wipMax) && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.2)' : 'rgba(209, 213, 219, 0.4)'}` }}>
                                <button
                                    onClick={() => {
                                        setStatusFilter('all');
                                        setCollectedMin('');
                                        setCollectedMax('');
                                        setWipMin('');
                                        setWipMax('');
                                    }}
                                    style={{
                                        padding: '6px 14px',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        background: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(220, 38, 38, 0.3)'}`,
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        color: isDarkMode ? '#f87171' : '#dc2626',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    Clear All Advanced Filters
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Active Filters Summary Bar */}
            {(() => {
                const activeFilters: { label: string; onClear: () => void }[] = [];
                
                if (rangeKey !== 'all') {
                    const rangeLabel = rangeKey === 'custom' 
                        ? `${formatDateTag(startDate)} - ${formatDateTag(endDate)}`
                        : RANGE_OPTIONS.find(r => r.key === rangeKey)?.label || rangeKey;
                    activeFilters.push({ label: `Date: ${rangeLabel}`, onClear: () => handleRangeSelect('all') });
                }
                if (selectedTeams.length > 0 && selectedTeams.length < displayableTeamMembers.length) {
                    activeFilters.push({ label: `Team: ${selectedTeams.join(', ')}`, onClear: handleSelectAllTeams });
                }
                if (activeGroupedArea) {
                    activeFilters.push({ label: `Area: ${activeGroupedArea}`, onClear: () => setActiveGroupedArea(null) });
                }
                if (activePracticeAreas.length > 0) {
                    activeFilters.push({ label: `Practice: ${activePracticeAreas.length} selected`, onClear: () => setActivePracticeAreas([]) });
                }
                if (activeFeeEarner) {
                    activeFilters.push({ label: `${feeEarnerType}: ${activeFeeEarner}`, onClear: () => { setActiveFeeEarner(null); setFeeEarnerType(null); } });
                }
                if (searchTerm) {
                    activeFilters.push({ label: `Search: "${searchTerm}"`, onClear: () => setSearchTerm('') });
                }
                if (statusFilter !== 'all') {
                    activeFilters.push({ label: `Status: ${statusFilter}`, onClear: () => setStatusFilter('all') });
                }
                if (collectedMin || collectedMax) {
                    const range = collectedMin && collectedMax ? `£${collectedMin}-£${collectedMax}` 
                        : collectedMin ? `£${collectedMin}+` 
                        : `≤£${collectedMax}`;
                    activeFilters.push({ label: `Collected: ${range}`, onClear: () => { setCollectedMin(''); setCollectedMax(''); } });
                }
                if (wipMin || wipMax) {
                    const range = wipMin && wipMax ? `£${wipMin}-£${wipMax}` 
                        : wipMin ? `£${wipMin}+` 
                        : `≤£${wipMax}`;
                    activeFilters.push({ label: `WIP: ${range}`, onClear: () => { setWipMin(''); setWipMax(''); } });
                }

                if (activeFilters.length === 0) return null;

                return (
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        marginBottom: 8,
                        background: isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(243, 244, 246, 0.6)',
                        border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(209, 213, 219, 0.6)'}`,
                        borderRadius: 8
                    }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#94a3b8' : '#6b7280', marginRight: 4 }}>
                            Active Filters:
                        </span>
                        {activeFilters.map((filter, idx) => (
                            <span
                                key={idx}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '4px 10px',
                                    fontSize: 10,
                                    fontWeight: 500,
                                    background: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(37, 99, 235, 0.2)'}`,
                                    borderRadius: 12,
                                    color: isDarkMode ? '#60a5fa' : '#2563eb'
                                }}
                            >
                                {filter.label}
                                <button
                                    onClick={filter.onClear}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: 14,
                                        lineHeight: 1,
                                        color: isDarkMode ? '#60a5fa' : '#2563eb',
                                        opacity: 0.7
                                    }}
                                    title="Remove filter"
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                        {activeFilters.length > 1 && (
                            <button
                                onClick={() => {
                                    handleRangeSelect('all');
                                    handleSelectAllTeams();
                                    setActiveGroupedArea(null);
                                    setActivePracticeAreas([]);
                                    setActiveFeeEarner(null);
                                    setFeeEarnerType(null);
                                    setSearchTerm('');
                                    setStatusFilter('all');
                                    setCollectedMin('');
                                    setCollectedMax('');
                                    setWipMin('');
                                    setWipMax('');
                                }}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    background: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(220, 38, 38, 0.05)',
                                    border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(220, 38, 38, 0.2)'}`,
                                    borderRadius: 12,
                                    cursor: 'pointer',
                                    color: isDarkMode ? '#f87171' : '#dc2626',
                                    marginLeft: 'auto'
                                }}
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                );
            })()}

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
                                background: isDarkMode ? '#0f172a' : '#f9fafb',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start'
                            }}>
                                <div>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color: isDarkMode ? '#cbd5e1' : '#374151',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        Matters Table {matterSource === 'instructions' && (
                                            <span style={{
                                                marginLeft: '8px',
                                                fontSize: '10px',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: isDarkMode ? '#0f766e' : '#0d9488',
                                                color: '#f0fdfa',
                                                fontWeight: 500,
                                                textTransform: 'none',
                                                letterSpacing: 'normal'
                                            }}>
                                                INSTRUCTIONS DB
                                            </span>
                                        )}
                                    </h3>
                                    <div style={{
                                        fontSize: '11px',
                                        color: isDarkMode ? '#64748b' : '#6b7280',
                                        marginTop: '4px'
                                    }}>
                                        Showing {tableMatters.length} of {filteredMatters.length} matters
                                        {matterSource === 'instructions' && instructionsMattersLoading && ' (Loading...)'}
                                        {matterSource === 'instructions' && instructionsMattersError && ` (Error: ${instructionsMattersError})`}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={() => {
                                            const newSource = matterSource === 'legacy' ? 'instructions' : 'legacy';
                                            setMatterSource(newSource);
                                            if (newSource === 'instructions' && !instructionsMatters) {
                                                fetchInstructionsMatters();
                                            }
                                        }}
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '11px',
                                            fontWeight: 500,
                                            borderRadius: '6px',
                                            border: `1px solid ${matterSource === 'instructions'
                                                ? (isDarkMode ? '#0f766e' : '#0d9488')
                                                : (isDarkMode ? '#334155' : '#d1d5db')}`,
                                            background: matterSource === 'instructions'
                                                ? (isDarkMode ? 'rgba(15, 118, 110, 0.2)' : 'rgba(13, 148, 136, 0.12)')
                                                : (isDarkMode ? '#1e293b' : '#f9fafb'),
                                            color: matterSource === 'instructions'
                                                ? (isDarkMode ? '#5eead4' : '#0f766e')
                                                : (isDarkMode ? '#94a3b8' : '#6b7280'),
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s ease'
                                        }}
                                        title={matterSource === 'legacy' 
                                            ? 'Switch to Instructions DB matters (experimental)'
                                            : 'Switch back to Legacy Clio matters'}
                                    >
                                        {matterSource === 'legacy' ? 'View Instructions Matters' : 'View Legacy Matters'}
                                    </button>
                                </div>
                            </div>
                            
                            {/* Bulk Selection Action Bar */}
                            {selectedMatterIds.size > 0 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 14px',
                                    marginBottom: 8,
                                    background: isDarkMode ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.05)',
                                    border: `1px solid ${isDarkMode ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.2)'}`,
                                    borderRadius: 6
                                }}>
                                    <span style={{ 
                                        fontSize: 11, 
                                        fontWeight: 600, 
                                        color: isDarkMode ? '#38bdf8' : '#0284c7' 
                                    }}>
                                        {selectedMatterIds.size} matter{selectedMatterIds.size !== 1 ? 's' : ''} selected
                                    </span>
                                    <button
                                        onClick={runBulkInspection}
                                        disabled={bulkProcessing}
                                        style={{
                                            padding: '5px 12px',
                                            fontSize: 10,
                                            fontWeight: 600,
                                            background: isDarkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)',
                                            border: `1px solid ${isDarkMode ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.3)'}`,
                                            borderRadius: 4,
                                            cursor: bulkProcessing ? 'wait' : 'pointer',
                                            color: isDarkMode ? '#38bdf8' : '#0284c7',
                                            opacity: bulkProcessing ? 0.6 : 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6
                                        }}
                                    >
                                        <Icon iconName={bulkProcessing ? 'ProgressRingDots' : 'Processing'} style={{ fontSize: 12 }} />
                                        {bulkProcessing && bulkProcessingProgress 
                                            ? `Processing ${bulkProcessingProgress.current}/${bulkProcessingProgress.total}...` 
                                            : 'Run Source Analysis'}
                                    </button>
                                    {bulkProcessing && bulkProcessingProgress && (
                                        <div style={{ 
                                            flex: 1, 
                                            maxWidth: 200,
                                            height: 4, 
                                            background: isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(209, 213, 219, 0.5)',
                                            borderRadius: 2,
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                width: `${(bulkProcessingProgress.current / bulkProcessingProgress.total) * 100}%`,
                                                height: '100%',
                                                background: isDarkMode ? '#38bdf8' : '#0284c7',
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                    )}
                                    <button
                                        onClick={clearSelection}
                                        style={{
                                            padding: '5px 10px',
                                            fontSize: 10,
                                            fontWeight: 500,
                                            background: 'transparent',
                                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.2)'}`,
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                            color: isDarkMode ? '#94a3b8' : '#64748b'
                                        }}
                                    >
                                        Clear
                                    </button>
                                    {bulkInspectionResults.size > 0 && !bulkProcessing && (
                                        <span style={{ 
                                            fontSize: 10, 
                                            color: isDarkMode ? '#4ade80' : '#16a34a',
                                            marginLeft: 'auto',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4
                                        }}>
                                            <Icon iconName="CheckMark" style={{ fontSize: 10 }} />
                                            {bulkInspectionResults.size} analyzed
                                        </span>
                                    )}
                                </div>
                            )}
                            
                            {/* Source Analysis - Compact Attribution Table */}
                            {bulkInspectionResults.size > 0 && (() => {
                                const visibleResults = Array.from(bulkInspectionResults.entries());
                                if (visibleResults.length === 0) return null;
                                return (
                                <details open style={{ marginBottom: 12 }}>
                                    <summary style={{
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: isDarkMode ? '#cbd5e1' : '#374151',
                                        padding: '8px 12px',
                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(243, 244, 246, 0.6)',
                                        borderRadius: 6,
                                        marginBottom: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        listStyle: 'none'
                                    }}>
                                        <Icon iconName="AnalyticsView" style={{ fontSize: 14 }} />
                                        Source Analysis
                                        <span style={{
                                            background: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(37, 99, 235, 0.1)',
                                            color: isDarkMode ? '#60a5fa' : '#2563eb',
                                            padding: '2px 8px',
                                            borderRadius: 10,
                                            fontSize: 10,
                                            fontWeight: 700
                                        }}>
                                            {visibleResults.length}
                                        </span>
                                        
                                        {/* Google Ads Enrich Button */}
                                        {GOOGLE_ADS_CUSTOMER_ID && (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    enrichWithGoogleAdsData();
                                                }}
                                                disabled={googleAdsEnriching}
                                                style={{
                                                    marginLeft: 'auto',
                                                    padding: '3px 10px',
                                                    fontSize: 9,
                                                    fontWeight: 600,
                                                    background: googleAdsEnriching
                                                        ? (isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)')
                                                        : (isDarkMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.15)'),
                                                    border: `1px solid ${isDarkMode ? 'rgba(251, 191, 36, 0.4)' : 'rgba(217, 119, 6, 0.3)'}`,
                                                    borderRadius: 4,
                                                    cursor: googleAdsEnriching ? 'wait' : 'pointer',
                                                    color: isDarkMode ? '#fbbf24' : '#d97706',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4
                                                }}
                                            >
                                                <Icon iconName={googleAdsEnriching ? 'Sync' : 'WebComponents'} style={{ fontSize: 10 }} />
                                                {googleAdsEnriching 
                                                    ? `Enriching${googleAdsProgress ? ` ${googleAdsProgress.current}/${googleAdsProgress.total}` : '...'}`
                                                    : 'Enrich from Google Ads'
                                                }
                                            </button>
                                        )}
                                    </summary>
                                    
                                    {/* Clean attribution table */}
                                    <div style={{
                                        background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : '#fff',
                                        border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.2)' : 'rgba(229, 231, 235, 0.8)'}`,
                                        borderRadius: 8,
                                        overflow: 'hidden'
                                    }}>
                                        {/* Header row */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '120px 1fr 90px 90px 90px 90px 70px',
                                            gap: 0,
                                            padding: '8px 12px',
                                            background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(249, 250, 251, 0.9)',
                                            borderBottom: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.2)' : 'rgba(229, 231, 235, 0.8)'}`,
                                            fontSize: 9,
                                            fontWeight: 700,
                                            color: isDarkMode ? '#94a3b8' : '#6b7280',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            <div>Matter</div>
                                            <div>Chain</div>
                                            <div style={{ textAlign: 'center' }}>Source</div>
                                            <div style={{ textAlign: 'center' }}>Campaign</div>
                                            <div style={{ textAlign: 'center' }}>Ad Set</div>
                                            <div style={{ textAlign: 'center' }}>Keyword</div>
                                            <div style={{ textAlign: 'center' }}>Signal</div>
                                        </div>
                                        
                                        {/* Data rows */}
                                        {visibleResults.map(([id, result], rowIdx) => {
                                            const hasEmail = !!result.clientEmail;
                                            const hasClioPhone = !!result.clientPhone;
                                            const enquiryCount = (result.enquiryLookup?.legacy.count || 0) + (result.enquiryLookup?.instructions.count || 0);
                                            const hasEnquiry = enquiryCount > 0;
                                            const hasCalls = result.callRailLookup?.found && (result.callRailLookup?.count || 0) > 0;
                                            const legacyMatch = result.enquiryLookup?.legacy.matches?.[0];
                                            const instructionsMatch = result.enquiryLookup?.instructions.matches?.[0];
                                            const preferredEnquiry = legacyMatch || instructionsMatch;
                                            const latestCall = result.callRailLookup?.calls?.[0];
                                            const primaryForm = result.webFormMatches?.[0];
                                            const hasWebForm = (result.webFormMatches?.length || 0) > 0;
                                            
                                            // Get Google Ads enriched data if available
                                            const primaryGclid = primaryForm?.gclid || preferredEnquiry?.gclid;
                                            const googleAdsEntry: GoogleAdsClickData | undefined = primaryGclid ? result.googleAdsData?.get(primaryGclid) : undefined;
                                            const hasGoogleAdsData = !!googleAdsEntry && !googleAdsEntry.error;
                                            
                                            const formHasGclid = !!primaryForm?.gclid;
                                            const callRailSource = latestCall?.source?.toLowerCase() || '';
                                            const callRailIsPaid = callRailSource.includes('paid') || callRailSource.includes('google') || callRailSource.includes('ppc') || callRailSource.includes('cpc');
                                            const enquirySource = preferredEnquiry?.source?.toLowerCase() || '';
                                            const enquiryIsPaid = enquirySource.includes('paid') || enquirySource.includes('google') || enquirySource.includes('ppc');
                                            const isPaid = formHasGclid || callRailIsPaid || enquiryIsPaid || !!preferredEnquiry?.gclid;
                                            
                                            // Prefer Google Ads data when available, fall back to existing sources
                                            const resolvedSource = latestCall?.source || preferredEnquiry?.source || (hasWebForm ? 'Web Form' : null);
                                            const resolvedCampaign = googleAdsEntry?.campaignName || latestCall?.campaign || preferredEnquiry?.campaign || null;
                                            const resolvedAdSet = googleAdsEntry?.adGroupName || preferredEnquiry?.adSet || null;
                                            const resolvedKeyword = googleAdsEntry?.keyword || latestCall?.keywords || preferredEnquiry?.keyword || null;
                                            
                                            const chainSteps = [
                                                { key: 'C', active: hasEmail || hasClioPhone, color: '#38bdf8', title: 'Clio', detail: hasEmail ? result.clientEmail?.split('@')[0] : (hasClioPhone ? result.clientPhone?.slice(-4) : null) },
                                                { key: 'E', active: hasEnquiry, color: '#a78bfa', title: 'Enquiry', detail: preferredEnquiry ? `${enquiryCount}` : null },
                                                { key: 'R', active: hasCalls, color: '#f59e0b', title: 'CallRail', detail: latestCall ? `${result.callRailLookup?.count || 0}` : null },
                                                { key: 'F', active: hasWebForm, color: '#34d399', title: 'Form', detail: primaryForm?.gclid ? 'GCLID' : (primaryForm?.url ? 'URL' : null) },
                                                { key: 'G', active: hasGoogleAdsData, color: '#facc15', title: 'Google Ads', detail: googleAdsEntry?.keyword ? googleAdsEntry.keyword.slice(0, 8) : null },
                                            ];
                                            
                                            return (
                                                <div
                                                    key={id}
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: '120px 1fr 90px 90px 90px 90px 70px',
                                                        gap: 0,
                                                        padding: '8px 12px',
                                                        borderBottom: rowIdx < visibleResults.length - 1 
                                                            ? `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.12)' : 'rgba(229, 231, 235, 0.5)'}` 
                                                            : 'none',
                                                        fontSize: 11,
                                                        alignItems: 'center',
                                                        background: rowIdx % 2 === 0 
                                                            ? 'transparent' 
                                                            : (isDarkMode ? 'rgba(30, 41, 59, 0.15)' : 'rgba(249, 250, 251, 0.4)')
                                                    }}
                                                >
                                                    {/* Matter */}
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#1f2937', fontSize: 10 }}>
                                                            {result.displayNumber || id}
                                                        </div>
                                                        <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {result.clientName}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Chain indicators */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                                        {chainSteps.map((step, idx) => (
                                                            <React.Fragment key={step.key}>
                                                                <span
                                                                    title={`${step.title}: ${step.active ? 'Found' : 'Not found'}${step.detail ? ` (${step.detail})` : ''}`}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: 3,
                                                                        padding: '2px 6px',
                                                                        borderRadius: 4,
                                                                        fontSize: 8,
                                                                        fontWeight: 600,
                                                                        background: step.active 
                                                                            ? (isDarkMode ? `${step.color}20` : `${step.color}12`)
                                                                            : (isDarkMode ? 'rgba(71, 85, 105, 0.1)' : 'rgba(229, 231, 235, 0.3)'),
                                                                        color: step.active ? step.color : (isDarkMode ? '#475569' : '#9ca3af'),
                                                                        border: step.active 
                                                                            ? `1px solid ${step.color}40` 
                                                                            : `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.15)' : 'rgba(209, 213, 219, 0.4)'}`,
                                                                        opacity: step.active ? 1 : 0.5
                                                                    }}
                                                                >
                                                                    <span style={{ fontWeight: 700 }}>{step.key}</span>
                                                                    {step.active && step.detail && (
                                                                        <span style={{ fontSize: 7, opacity: 0.85 }}>{step.detail}</span>
                                                                    )}
                                                                </span>
                                                                {idx < chainSteps.length - 1 && (
                                                                    <span style={{
                                                                        width: 4,
                                                                        height: 1,
                                                                        background: step.active && chainSteps[idx + 1].active
                                                                            ? (isDarkMode ? '#4ade80' : '#22c55e')
                                                                            : (isDarkMode ? 'rgba(71, 85, 105, 0.15)' : 'rgba(209, 213, 219, 0.3)')
                                                                    }} />
                                                                )}
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                    
                                                    {/* Source */}
                                                    <div style={{ textAlign: 'center' }}>
                                                        {resolvedSource ? (
                                                            <span style={{ fontSize: 10, color: isDarkMode ? '#cbd5e1' : '#374151' }}>
                                                                {resolvedSource.length > 14 ? resolvedSource.slice(0, 14) + '…' : resolvedSource}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: isDarkMode ? '#475569' : '#d1d5db', fontSize: 10 }}>—</span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Campaign */}
                                                    <div style={{ textAlign: 'center' }}>
                                                        {resolvedCampaign ? (
                                                            <span style={{ fontSize: 10, color: isDarkMode ? '#cbd5e1' : '#374151' }} title={resolvedCampaign}>
                                                                {resolvedCampaign.length > 12 ? resolvedCampaign.slice(0, 12) + '…' : resolvedCampaign}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: isDarkMode ? '#475569' : '#d1d5db', fontSize: 10 }}>—</span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Ad Set */}
                                                    <div style={{ textAlign: 'center' }}>
                                                        {resolvedAdSet ? (
                                                            <span style={{ fontSize: 10, color: isDarkMode ? '#cbd5e1' : '#374151' }} title={resolvedAdSet}>
                                                                {resolvedAdSet.length > 12 ? resolvedAdSet.slice(0, 12) + '…' : resolvedAdSet}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: isDarkMode ? '#475569' : '#d1d5db', fontSize: 10 }}>—</span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Keyword */}
                                                    <div style={{ textAlign: 'center' }}>
                                                        {resolvedKeyword ? (
                                                            <span style={{ fontSize: 10, color: isDarkMode ? '#cbd5e1' : '#374151' }} title={resolvedKeyword}>
                                                                {resolvedKeyword.length > 12 ? resolvedKeyword.slice(0, 12) + '…' : resolvedKeyword}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: isDarkMode ? '#475569' : '#d1d5db', fontSize: 10 }}>—</span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Signal */}
                                                    <div style={{ textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 8px',
                                                            borderRadius: 4,
                                                            fontSize: 9,
                                                            fontWeight: 600,
                                                            background: isPaid 
                                                                ? (isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.12)')
                                                                : resolvedSource 
                                                                    ? (isDarkMode ? 'rgba(74, 222, 128, 0.12)' : 'rgba(34, 197, 94, 0.08)')
                                                                    : (isDarkMode ? 'rgba(71, 85, 105, 0.2)' : 'rgba(243, 244, 246, 0.8)'),
                                                            color: isPaid 
                                                                ? (isDarkMode ? '#fbbf24' : '#d97706')
                                                                : resolvedSource 
                                                                    ? (isDarkMode ? '#4ade80' : '#16a34a')
                                                                    : (isDarkMode ? '#64748b' : '#9ca3af'),
                                                            border: `1px solid ${isPaid 
                                                                ? (isDarkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(217, 119, 6, 0.2)')
                                                                : resolvedSource 
                                                                    ? (isDarkMode ? 'rgba(74, 222, 128, 0.2)' : 'rgba(22, 163, 74, 0.15)')
                                                                    : 'transparent'}`
                                                        }}>
                                                            {isPaid ? 'Paid' : resolvedSource ? 'Organic' : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                                );
                            })()}
                            
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '11px',
                                tableLayout: 'auto',
                                lineHeight: 1.4
                            }}>
                                <thead>
                                    <tr style={{
                                        background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#f9fafb',
                                        position: 'sticky',
                                        top: 0,
                                        borderBottom: `2px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(229, 231, 235, 0.8)'}`
                                    }}>
                                        <th style={{ 
                                            padding: '6px 4px', 
                                            width: 32, 
                                            minWidth: 32,
                                            textAlign: 'center'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedMatterIds.size > 0 && selectedMatterIds.size === tableMatters.length}
                                                ref={(el) => {
                                                    if (el) el.indeterminate = selectedMatterIds.size > 0 && selectedMatterIds.size < tableMatters.length;
                                                }}
                                                onChange={() => {
                                                    // Toggle: if all are selected, clear; otherwise select all
                                                    if (selectedMatterIds.size === tableMatters.length) {
                                                        clearSelection();
                                                    } else {
                                                        selectAllVisible();
                                                    }
                                                }}
                                                style={{ cursor: 'pointer', accentColor: isDarkMode ? '#38bdf8' : '#0284c7' }}
                                                title={selectedMatterIds.size === tableMatters.length ? "Deselect all" : "Select all visible"}
                                            />
                                        </th>
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
                                            textAlign="left"
                                            width={80}
                                        />
                                        <SortableHeader 
                                            field="responsibleSolicitor" 
                                            label="Resp." 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="left"
                                            width={80}
                                        />
                                        <SortableHeader 
                                            field="wipValue" 
                                            label="WIP" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="left"
                                            width={100}
                                        />
                                        <SortableHeader 
                                            field="collectedValue" 
                                            label="Collected" 
                                            currentField={sortField}
                                            direction={sortDirection}
                                            onSort={handleSort}
                                            isDarkMode={isDarkMode}
                                            textAlign="left"
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
                                        title="Profit margin: (Collected − WIP) ÷ WIP × 100"
                                        >
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                gap: '4px'
                                            }}>
                                                <span>Margin</span>
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
                                    {tableMatters.map((matter, idx) => {
                                        // Create a stable unique key and reuse it for expansion state fallback
                                        const fallbackRowId = (matter as any)['Display Number'] || matter.DisplayNumber || `matter-${idx}`;
                                        const rowKey = matter.UniqueID || fallbackRowId;
                                        const openDate = (matter as any)['Open Date'] ? parseISO((matter as any)['Open Date']) : null;
                                        const practiceAreaGroup = groupPracticeArea((matter as any)['Practice Area'] || matter.PracticeArea);
                                        const groupIconName = getGroupIcon(practiceAreaGroup);
                                        const pitchTags = getPitchTagsForMatter(matter);
                                        const matterRowId = matter.UniqueID || fallbackRowId;
                                        const isExpanded = expandedMatterId !== null && expandedMatterId === matterRowId;
                                        
                                        return (
                                            <React.Fragment key={rowKey}>
                                            <tr style={{
                                                borderBottom: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.15)' : 'rgba(229, 231, 235, 0.6)'}`,
                                                fontSize: '11px',
                                                transition: 'background 0.15s ease',
                                                background: idx % 2 === 0 
                                                    ? 'transparent' 
                                                    : (isDarkMode ? 'rgba(30, 41, 59, 0.2)' : 'rgba(249, 250, 251, 0.5)')
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 
                                                ? 'transparent' 
                                                : (isDarkMode ? 'rgba(30, 41, 59, 0.2)' : 'rgba(249, 250, 251, 0.5)')}
                                            >
                                                <td style={{
                                                    padding: '4px',
                                                    width: 32,
                                                    minWidth: 32,
                                                    textAlign: 'center'
                                                }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedMatterIds.has(matterRowId)}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            toggleMatterSelection(matterRowId);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ cursor: 'pointer', accentColor: isDarkMode ? '#38bdf8' : '#0284c7' }}
                                                    />
                                                </td>
                                                <td style={{
                                                    padding: '8px 6px',
                                                    width: 95,
                                                    minWidth: 95,
                                                    textAlign: 'center'
                                                }}>
                                                    <span style={{
                                                        background: ((matter as any).Status || matter.Status) === 'Open' 
                                                            ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)') 
                                                            : (isDarkMode ? 'rgba(100, 116, 139, 0.12)' : 'rgba(100, 116, 139, 0.08)'),
                                                        color: ((matter as any).Status || matter.Status) === 'Open' 
                                                            ? (isDarkMode ? '#4ade80' : '#16a34a') 
                                                            : (isDarkMode ? '#94a3b8' : '#6b7280'),
                                                        padding: '3px 8px',
                                                        borderRadius: '4px',
                                                        fontWeight: 600,
                                                        fontSize: '10px',
                                                        display: 'inline-block',
                                                        border: `1px solid ${((matter as any).Status || matter.Status) === 'Open' 
                                                            ? (isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)') 
                                                            : (isDarkMode ? 'rgba(100, 116, 139, 0.2)' : 'rgba(100, 116, 139, 0.15)')}`
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
                                                    padding: '8px 6px',
                                                    width: 95,
                                                    minWidth: 95,
                                                    color: isDarkMode ? '#94a3b8' : '#6b7280',
                                                    fontFamily: 'monospace',
                                                    fontSize: '10px',
                                                    lineHeight: '1.3'
                                                }}>
                                                    {openDate && isValid(openDate) ? (
                                                        <span>{format(openDate, 'dd MMM yy')}</span>
                                                    ) : '–'}
                                                </td>
                                                <td style={{
                                                    padding: '8px 10px',
                                                    width: 140,
                                                    minWidth: 140,
                                                    color: isDarkMode ? '#e2e8f0' : '#1f2937',
                                                    fontFamily: 'monospace',
                                                    fontSize: '11px',
                                                    fontWeight: 500
                                                }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        {(matter as any)['Display Number'] || matter.DisplayNumber || 'N/A'}
                                                        <span 
                                                            style={{
                                                                fontSize: 8,
                                                                fontWeight: 600,
                                                                padding: '1px 4px',
                                                                borderRadius: 3,
                                                                fontFamily: 'system-ui, sans-serif',
                                                                background: matter.InstructionRef 
                                                                    ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)')
                                                                    : (isDarkMode ? 'rgba(100, 116, 139, 0.12)' : 'rgba(100, 116, 139, 0.08)'),
                                                                color: matter.InstructionRef
                                                                    ? (isDarkMode ? '#4ade80' : '#16a34a')
                                                                    : (isDarkMode ? '#64748b' : '#9ca3af')
                                                            }}
                                                            title={matter.InstructionRef 
                                                                ? `New space matter (${matter.InstructionRef})` 
                                                                : 'Legacy matter'}
                                                        >
                                                            {matter.InstructionRef ? 'v2' : 'v1'}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td style={{
                                                    padding: '8px 10px',
                                                    color: isDarkMode ? '#e2e8f0' : '#1f2937',
                                                    fontWeight: 500,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    maxWidth: 200
                                                }}>
                                                    {(matter as any)['Client Name'] || matter.ClientName || 'N/A'}
                                                    {pitchTags.length > 0 && (
                                                        <div style={pitchTagContainerStyle}>
                                                            {(() => {
                                                                const deals = pitchTags.filter(t => t.type === 'deal');
                                                                const instructions = pitchTags.filter(t => t.type === 'instruction');
                                                                const extras = pitchTags.filter(t => t.type === 'extra');
                                                                return (
                                                                    <>
                                                                        {deals.map((tag) => (
                                                                            <span
                                                                                key={tag.key}
                                                                                style={getPitchTagStyle(tag.type)}
                                                                                title={tag.title}
                                                                            >
                                                                                {tag.label}
                                                                            </span>
                                                                        ))}
                                                                        {deals.length > 0 && instructions.length > 0 && (
                                                                            <span style={{ 
                                                                                color: isDarkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.5)', 
                                                                                fontSize: 10,
                                                                                margin: '0 2px'
                                                                            }}>→</span>
                                                                        )}
                                                                        {instructions.map((tag) => (
                                                                            <span
                                                                                key={tag.key}
                                                                                style={getPitchTagStyle(tag.type)}
                                                                                title={tag.title}
                                                                            >
                                                                                {tag.label}
                                                                            </span>
                                                                        ))}
                                                                        {extras.map((tag) => (
                                                                            <span
                                                                                key={tag.key}
                                                                                style={getPitchTagStyle(tag.type)}
                                                                                title={tag.title}
                                                                            >
                                                                                {tag.label}
                                                                            </span>
                                                                        ))}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{
                                                    padding: '8px 6px',
                                                    width: 80,
                                                    minWidth: 80,
                                                    color: isDarkMode ? '#94a3b8' : '#6b7280',
                                                    fontSize: '10px',
                                                    textAlign: 'left',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 500
                                                }}>
                                                    {getInitialsFromName((matter as any)['Originating Solicitor'] || matter.OriginatingSolicitor || '')}
                                                </td>
                                                <td style={{
                                                    padding: '8px 6px',
                                                    width: 80,
                                                    minWidth: 80,
                                                    color: isDarkMode ? '#94a3b8' : '#6b7280',
                                                    fontSize: '10px',
                                                    textAlign: 'left',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 500
                                                }}>
                                                    {getInitialsFromName((matter as any)['Responsible Solicitor'] || matter.ResponsibleSolicitor || '')}
                                                </td>
                                                <td style={{
                                                    padding: '8px 8px',
                                                    width: 100,
                                                    minWidth: 100,
                                                    textAlign: 'right',
                                                    color: isDarkMode ? '#cbd5e1' : '#374151',
                                                    fontFamily: 'monospace',
                                                    fontSize: '10px',
                                                    fontWeight: 500
                                                }}>
                                                    {formatCurrency(getMatterFinancials(matter).wip)}
                                                </td>
                                                <td style={{
                                                    padding: '8px 8px',
                                                    width: 105,
                                                    minWidth: 105,
                                                    textAlign: 'right',
                                                    color: isDarkMode ? '#cbd5e1' : '#374151',
                                                    fontFamily: 'monospace',
                                                    fontSize: '10px',
                                                    fontWeight: 500
                                                }}>
                                                    {formatCurrency(getMatterFinancials(matter).collected)}
                                                </td>
                                                <td style={{
                                                    padding: '8px 8px',
                                                    width: 90,
                                                    minWidth: 90,
                                                    textAlign: 'center',
                                                    fontFamily: 'monospace',
                                                    fontSize: '10px',
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
                                                    padding: '8px 8px',
                                                    width: 140,
                                                    minWidth: 140,
                                                    textAlign: 'left',
                                                    color: isDarkMode ? '#94a3b8' : '#6b7280',
                                                    fontFamily: 'system-ui, sans-serif',
                                                    fontSize: '10px'
                                                }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedMatterId(prev => prev === matterRowId ? null : matterRowId);
                                                        }}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            background: isExpanded
                                                                ? (isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                                                : 'transparent',
                                                            border: 'none',
                                                            borderRadius: 4,
                                                            padding: '3px 6px',
                                                            cursor: 'pointer',
                                                            color: isDarkMode ? '#94a3b8' : '#6b7280',
                                                            fontSize: '10px',
                                                            fontFamily: 'system-ui, sans-serif',
                                                            transition: 'background 0.15s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isExpanded) {
                                                                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isExpanded) {
                                                                e.currentTarget.style.background = 'transparent';
                                                            }
                                                        }}
                                                        title={`Expand source details for ${getMatterSourceLabel(matter)}`}
                                                    >
                                                        <Icon 
                                                            iconName={isExpanded ? 'ChevronDown' : 'ChevronRight'}
                                                            style={{ fontSize: 10, transition: 'transform 0.15s ease' }}
                                                        />
                                                        {getMatterSourceLabel(matter)}
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
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
                                                            {/* Only show source fields that have data */}
                                                            {((matter as any).Campaign || (matter as any).campaign) && (
                                                                <div>
                                                                    <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Campaign</div>
                                                                    <div>{(matter as any).Campaign || (matter as any).campaign}</div>
                                                                </div>
                                                            )}
                                                            {((matter as any).AdSet || (matter as any).ad_set) && (
                                                                <div>
                                                                    <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Ad Set</div>
                                                                    <div>{(matter as any).AdSet || (matter as any).ad_set}</div>
                                                                </div>
                                                            )}
                                                            {((matter as any).Keyword || (matter as any).keyword) && (
                                                                <div>
                                                                    <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Keyword</div>
                                                                    <div>{(matter as any).Keyword || (matter as any).keyword}</div>
                                                                </div>
                                                            )}
                                                            {((matter as any).ReferralURL || (matter as any).Referral_URL || (matter as any).url) && (
                                                                <div>
                                                                    <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>URL</div>
                                                                    <div style={{ wordBreak: 'break-all' }}>{(matter as any).ReferralURL || (matter as any).Referral_URL || (matter as any).url}</div>
                                                                </div>
                                                            )}
                                                            {(() => {
                                                                const detailed = getMatterFinancialsDetailed(matter);
                                                                return detailed.lastUpdated ? (
                                                                    <div>
                                                                        <div style={{ fontWeight: 600, marginBottom: 4, color: isDarkMode ? '#cbd5e1' : '#374151' }}>Most Recent Activity</div>
                                                                        <div>{format(new Date(detailed.lastUpdated), 'dd MMM yyyy')}</div>
                                                                    </div>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                        
                                                        {/* Inspect Button & Results */}
                                                        <div style={{
                                                            marginTop: 16,
                                                            paddingTop: 12,
                                                            borderTop: `1px solid ${isDarkMode ? '#334155' : '#e5e7eb'}`
                                                        }}>
                                                            {matterInspection && matterInspection.uniqueId === matterRowId ? (
                                                                <div style={{
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: 8
                                                                }}>
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        marginBottom: 4
                                                                    }}>
                                                                        <Icon iconName="Search" style={{ fontSize: 14, color: isDarkMode ? '#3690ce' : '#2563eb' }} />
                                                                        <span style={{ fontWeight: 600, color: isDarkMode ? '#e2e8f0' : '#1f2937' }}>Inspection</span>
                                                                        <button
                                                                            onClick={() => setMatterInspection(null)}
                                                                            style={{
                                                                                marginLeft: 'auto',
                                                                                background: 'transparent',
                                                                                border: 'none',
                                                                                cursor: 'pointer',
                                                                                color: isDarkMode ? '#64748b' : '#6b7280',
                                                                                padding: '2px 6px',
                                                                                borderRadius: 4
                                                                            }}
                                                                            title="Clear inspection"
                                                                        >
                                                                            <Icon iconName="Cancel" style={{ fontSize: 12 }} />
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    {/* LOCAL DATA - From Matter Record */}
                                                                    <div style={{
                                                                        display: 'grid',
                                                                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                                                        gap: 8,
                                                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(243, 244, 246, 0.6)',
                                                                        borderRadius: 6,
                                                                        padding: 10,
                                                                        marginBottom: 10
                                                                    }}>
                                                                        <div>
                                                                            <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 2 }}>Matter ID</div>
                                                                            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11, color: isDarkMode ? '#38bdf8' : '#0284c7' }}>{matterInspection.matterId || '—'}</div>
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 2 }}>Client ID</div>
                                                                            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11, color: isDarkMode ? '#a78bfa' : '#7c3aed' }}>{matterInspection.clientId || '—'}</div>
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 2 }}>Display #</div>
                                                                            <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 10 }}>{matterInspection.displayNumber || '—'}</div>
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 2 }}>Version</div>
                                                                            <div style={{ 
                                                                                fontWeight: 600, fontSize: 10,
                                                                                color: matterInspection.version === 'v2' ? (isDarkMode ? '#4ade80' : '#16a34a') : (isDarkMode ? '#94a3b8' : '#64748b')
                                                                            }}>
                                                                                {matterInspection.version}
                                                                            </div>
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 2 }}>Client</div>
                                                                            <div style={{ fontWeight: 500, fontSize: 10 }}>{matterInspection.clientName || '—'}</div>
                                                                        </div>
                                                                        {matterInspection.instructionRef && (
                                                                            <div>
                                                                                <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 2 }}>Instruction</div>
                                                                                <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 10, color: isDarkMode ? '#4ade80' : '#16a34a' }}>{matterInspection.instructionRef}</div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {/* STEP 1: Clio API - Get Email */}
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        padding: '8px 10px',
                                                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(243, 244, 246, 0.5)',
                                                                        borderRadius: 5,
                                                                        marginBottom: 6
                                                                    }}>
                                                                        <div style={{ 
                                                                            width: 18, height: 18, borderRadius: '50%',
                                                                            background: matterInspection.clientEmail 
                                                                                ? (isDarkMode ? '#166534' : '#dcfce7')
                                                                                : (isDarkMode ? '#1e293b' : '#e5e7eb'),
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: 10, fontWeight: 700,
                                                                            color: matterInspection.clientEmail 
                                                                                ? (isDarkMode ? '#4ade80' : '#16a34a')
                                                                                : (isDarkMode ? '#64748b' : '#9ca3af')
                                                                        }}>
                                                                            {matterInspection.clientEmail ? '✓' : '1'}
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#374151' }}>
                                                                                Clio → Contact Info
                                                                            </div>
                                                                            {matterInspection.clientEmail ? (
                                                                                <div>
                                                                                    <div style={{ 
                                                                                        fontSize: 11, fontWeight: 500, fontFamily: 'monospace',
                                                                                        color: isDarkMode ? '#4ade80' : '#16a34a',
                                                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                                                    }}>
                                                                                        {matterInspection.clientEmail}
                                                                                    </div>
                                                                                    {matterInspection.clientPhone && (
                                                                                        <div style={{ 
                                                                                            fontSize: 10, fontFamily: 'monospace',
                                                                                            color: isDarkMode ? '#94a3b8' : '#64748b',
                                                                                            marginTop: 2
                                                                                        }}>
                                                                                            {matterInspection.clientPhone}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af' }}>
                                                                                    {matterInspection.loading ? 'Fetching...' : 'Not fetched'}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {!matterInspection.clientEmail && (
                                                                            <button
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation();
                                                                                    if (!matterInspection.matterId) return;
                                                                                    setMatterInspection(prev => prev ? { ...prev, loading: true, error: undefined } : null);
                                                                                    try {
                                                                                        const resp = await fetch(`/api/matters/${matterInspection.matterId}/client-email`);
                                                                                        const data = await resp.json();
                                                                                        if (data.ok) {
                                                                                            setMatterInspection(prev => prev ? {
                                                                                                ...prev,
                                                                                                clientId: data.clientId || prev.clientId,
                                                                                                clientName: data.clientName || prev.clientName,
                                                                                                clientEmail: data.clientEmail || '',
                                                                                                clientPhone: data.clientPhone || '',
                                                                                                loading: false
                                                                                            } : null);
                                                                                        } else {
                                                                                            setMatterInspection(prev => prev ? { ...prev, loading: false, error: data.error } : null);
                                                                                        }
                                                                                    } catch (err) {
                                                                                        setMatterInspection(prev => prev ? { ...prev, loading: false, error: 'Network error' } : null);
                                                                                    }
                                                                                }}
                                                                                disabled={!matterInspection.matterId || matterInspection.loading}
                                                                                style={{
                                                                                    padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                                                                    background: isDarkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)',
                                                                                    border: `1px solid ${isDarkMode ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.2)'}`,
                                                                                    borderRadius: 4, cursor: 'pointer',
                                                                                    color: isDarkMode ? '#38bdf8' : '#0284c7',
                                                                                    opacity: matterInspection.loading ? 0.5 : 1
                                                                                }}
                                                                            >
                                                                                {matterInspection.loading ? '...' : 'Fetch'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {/* STEP 2: Enquiry Lookup */}
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'flex-start',
                                                                        gap: 8,
                                                                        padding: '8px 10px',
                                                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(243, 244, 246, 0.5)',
                                                                        borderRadius: 5,
                                                                        marginBottom: 6
                                                                    }}>
                                                                        <div style={{ 
                                                                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                                                                            background: matterInspection.enquiryLookup?.legacy.found || matterInspection.enquiryLookup?.instructions.found
                                                                                ? (isDarkMode ? '#166534' : '#dcfce7')
                                                                                : (isDarkMode ? '#1e293b' : '#e5e7eb'),
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: 10, fontWeight: 700,
                                                                            color: matterInspection.enquiryLookup?.legacy.found || matterInspection.enquiryLookup?.instructions.found
                                                                                ? (isDarkMode ? '#4ade80' : '#16a34a')
                                                                                : (isDarkMode ? '#64748b' : '#9ca3af')
                                                                        }}>
                                                                            {matterInspection.enquiryLookup?.legacy.found || matterInspection.enquiryLookup?.instructions.found ? '✓' : '2'}
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#374151', marginBottom: 4 }}>
                                                                                Enquiries → Match by Email
                                                                            </div>
                                                                            {matterInspection.enquiryLookup ? (
                                                                                <div style={{ fontSize: 9 }}>
                                                                                    {/* Legacy Results */}
                                                                                    <div style={{ marginBottom: 6 }}>
                                                                                        <div style={{ 
                                                                                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                                                                                            color: isDarkMode ? '#94a3b8' : '#64748b'
                                                                                        }}>
                                                                                            <span style={{ 
                                                                                                padding: '1px 4px', borderRadius: 3, fontSize: 8, fontWeight: 600,
                                                                                                background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                                                                                                color: isDarkMode ? '#94a3b8' : '#64748b'
                                                                                            }}>Legacy</span>
                                                                                            {matterInspection.enquiryLookup.legacy.found ? (
                                                                                                <span style={{ color: isDarkMode ? '#4ade80' : '#16a34a', fontWeight: 600 }}>
                                                                                                    {matterInspection.enquiryLookup.legacy.count} match{matterInspection.enquiryLookup.legacy.count !== 1 ? 'es' : ''}
                                                                                                </span>
                                                                                            ) : matterInspection.enquiryLookup.legacy.error ? (
                                                                                                <span style={{ color: '#ef4444' }}>Error</span>
                                                                                            ) : (
                                                                                                <span>No matches</span>
                                                                                            )}
                                                                                        </div>
                                                                                        {/* Legacy match details */}
                                                                                        {matterInspection.enquiryLookup.legacy.matches.map((m, i) => (
                                                                                            <div key={`leg-${i}`} style={{
                                                                                                marginLeft: 8, marginBottom: 10, padding: '10px 12px',
                                                                                                background: isDarkMode ? 'rgba(30, 41, 59, 0.25)' : 'rgba(248, 250, 252, 0.8)',
                                                                                                borderRadius: 6, border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'}`
                                                                                            }}>
                                                                                                {/* Header: ID + Name */}
                                                                                                <div style={{ marginBottom: 8 }}>
                                                                                                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: isDarkMode ? '#94a3b8' : '#64748b' }}>#{m.id}</span>
                                                                                                    {m.name && <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 11, color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>{m.name}</span>}
                                                                                                </div>
                                                                                                {/* Details grid */}
                                                                                                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px', fontSize: 9, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                                                                                                    <span>Email</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.email || '—'}</span>
                                                                                                    <span>Phone</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.phone || '—'}</span>
                                                                                                    <span>Area</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.aow || '—'}</span>
                                                                                                    <span>Type</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.tow || '—'}</span>
                                                                                                    <span>Date</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.date ? new Date(m.date).toLocaleDateString() : '—'}</span>
                                                                                                    <span>POC</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.poc || '—'}</span>
                                                                                                </div>
                                                                                                {/* Source Attribution */}
                                                                                                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.25)' : 'rgba(203, 213, 225, 0.4)'}` }}>
                                                                                                    <div style={{ fontSize: 8, fontWeight: 600, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tracking</div>
                                                                                                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px', fontSize: 9, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                                                                                                        <span>Source</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.source || '—'}</span>
                                                                                                        <span>Campaign</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.campaign || '—'}</span>
                                                                                                        <span>Ad Set</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.adSet || '—'}</span>
                                                                                                        <span>Keyword</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.keyword || '—'}</span>
                                                                                                        <span>GCLID</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569', fontFamily: 'monospace', fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.gclid || ''}>{m.gclid || '—'}</span>
                                                                                                        <span>URL</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.url || ''}>{m.url || '—'}</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                    {/* Instructions Results */}
                                                                                    <div>
                                                                                        <div style={{ 
                                                                                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                                                                                            color: isDarkMode ? '#94a3b8' : '#64748b'
                                                                                        }}>
                                                                                            <span style={{ 
                                                                                                padding: '1px 4px', borderRadius: 3, fontSize: 8, fontWeight: 600,
                                                                                                background: isDarkMode ? 'rgba(74, 222, 128, 0.15)' : 'rgba(22, 163, 74, 0.1)',
                                                                                                color: isDarkMode ? '#4ade80' : '#16a34a'
                                                                                            }}>Instructions</span>
                                                                                            {matterInspection.enquiryLookup.instructions.found ? (
                                                                                                <span style={{ color: isDarkMode ? '#4ade80' : '#16a34a', fontWeight: 600 }}>
                                                                                                    {matterInspection.enquiryLookup.instructions.count} match{matterInspection.enquiryLookup.instructions.count !== 1 ? 'es' : ''}
                                                                                                </span>
                                                                                            ) : matterInspection.enquiryLookup.instructions.error ? (
                                                                                                <span style={{ color: '#ef4444' }}>Error</span>
                                                                                            ) : (
                                                                                                <span>No matches</span>
                                                                                            )}
                                                                                        </div>
                                                                                        {/* Instructions match details */}
                                                                                        {matterInspection.enquiryLookup.instructions.matches.map((m, i) => (
                                                                                            <div key={`ins-${i}`} style={{
                                                                                                marginLeft: 8, marginBottom: 10, padding: '10px 12px',
                                                                                                background: isDarkMode ? 'rgba(30, 41, 59, 0.25)' : 'rgba(248, 250, 252, 0.8)',
                                                                                                borderRadius: 6, border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'}`
                                                                                            }}>
                                                                                                {/* Header: ID + ACID + Name */}
                                                                                                <div style={{ marginBottom: 8 }}>
                                                                                                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: isDarkMode ? '#94a3b8' : '#64748b' }}>#{m.id}</span>
                                                                                                    {m.acid && <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af' }}>acid:{m.acid}</span>}
                                                                                                    {m.name && <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 11, color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>{m.name}</span>}
                                                                                                </div>
                                                                                                {/* Details grid */}
                                                                                                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px', fontSize: 9, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                                                                                                    <span>Email</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.email || '—'}</span>
                                                                                                    <span>Phone</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.phone || '—'}</span>
                                                                                                    <span>Area</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.aow || '—'}</span>
                                                                                                    <span>Type</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.tow || '—'}</span>
                                                                                                    <span>Stage</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.stage || '—'}</span>
                                                                                                    <span>Date</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.date ? new Date(m.date).toLocaleDateString() : '—'}</span>
                                                                                                    <span>POC</span>
                                                                                                    <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.poc || '—'}</span>
                                                                                                </div>
                                                                                                {/* Source Attribution */}
                                                                                                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.25)' : 'rgba(203, 213, 225, 0.4)'}` }}>
                                                                                                    <div style={{ fontSize: 8, fontWeight: 600, color: isDarkMode ? '#64748b' : '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tracking</div>
                                                                                                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px', fontSize: 9, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                                                                                                        <span>Source</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{m.source || '—'}</span>
                                                                                                        <span>URL</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.url || ''}>{m.url || '—'}</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af' }}>
                                                                                    {!matterInspection.clientEmail ? 'Requires email first' : 'Not searched'}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {matterInspection.clientEmail && !matterInspection.enquiryLookup && (
                                                                            <button
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation();
                                                                                    if (!matterInspection.clientEmail) return;
                                                                                    setMatterInspection(prev => prev ? { 
                                                                                        ...prev, 
                                                                                        enquiryLookup: {
                                                                                            legacy: { found: false, count: 0, matches: [], error: null, loading: true },
                                                                                            instructions: { found: false, count: 0, matches: [], error: null, loading: true },
                                                                                            loading: true
                                                                                        }
                                                                                    } : null);
                                                                                    try {
                                                                                        const resp = await fetch(`/api/matters/enquiry-lookup/${encodeURIComponent(matterInspection.clientEmail)}`);
                                                                                        const data = await resp.json();
                                                                                        if (data.ok) {
                                                                                            setMatterInspection(prev => prev ? {
                                                                                                ...prev,
                                                                                                enquiryLookup: {
                                                                                                    legacy: { ...data.legacy, loading: false },
                                                                                                    instructions: { ...data.instructions, loading: false },
                                                                                                    loading: false
                                                                                                },
                                                                                                webFormMatches: collectWebFormSignals({
                                                                                                    legacy: { ...data.legacy, loading: false },
                                                                                                    instructions: { ...data.instructions, loading: false },
                                                                                                    loading: false
                                                                                                })
                                                                                            } : null);
                                                                                        }
                                                                                    } catch (err) {
                                                                                        console.error('Enquiry lookup error:', err);
                                                                                    }
                                                                                }}
                                                                                style={{
                                                                                    padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                                                                    background: isDarkMode ? 'rgba(167, 139, 250, 0.15)' : 'rgba(124, 58, 237, 0.1)',
                                                                                    border: `1px solid ${isDarkMode ? 'rgba(167, 139, 250, 0.3)' : 'rgba(124, 58, 237, 0.2)'}`,
                                                                                    borderRadius: 4, cursor: 'pointer',
                                                                                    color: isDarkMode ? '#a78bfa' : '#7c3aed',
                                                                                    marginTop: 2
                                                                                }}
                                                                            >
                                                                                Search
                                                                            </button>
                                                                        )}
                                                                        {matterInspection.enquiryLookup?.loading && (
                                                                            <Spinner size={SpinnerSize.xSmall} style={{ marginTop: 2 }} />
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {/* STEP 3: Web Form Evidence */}
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'flex-start',
                                                                        gap: 8,
                                                                        padding: '8px 10px',
                                                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(243, 244, 246, 0.5)',
                                                                        borderRadius: 5,
                                                                        marginBottom: 6
                                                                    }}>
                                                                        <div style={{
                                                                            width: 18,
                                                                            height: 18,
                                                                            borderRadius: '50%',
                                                                            flexShrink: 0,
                                                                            marginTop: 2,
                                                                            background: (matterInspection.webFormMatches?.length || 0) > 0
                                                                                ? (isDarkMode ? '#166534' : '#dcfce7')
                                                                                : (isDarkMode ? '#1e293b' : '#e5e7eb'),
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontSize: 10,
                                                                            fontWeight: 700,
                                                                            color: (matterInspection.webFormMatches?.length || 0) > 0
                                                                                ? (isDarkMode ? '#4ade80' : '#16a34a')
                                                                                : (isDarkMode ? '#64748b' : '#9ca3af')
                                                                        }}>
                                                                            {(matterInspection.webFormMatches?.length || 0) > 0 ? '✓' : '3'}
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#374151', marginBottom: 4 }}>
                                                                                Enquiries → Web Form Trace
                                                                            </div>
                                                                            {matterInspection.webFormMatches && matterInspection.webFormMatches.length > 0 ? (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                                    {matterInspection.webFormMatches.map((signal) => (
                                                                                        <div key={signal.id} style={{
                                                                                            padding: '8px 10px',
                                                                                            borderRadius: 6,
                                                                                            border: `1px solid ${isDarkMode ? 'rgba(74, 222, 128, 0.3)' : 'rgba(5, 150, 105, 0.2)'}`,
                                                                                            background: isDarkMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(236, 253, 245, 0.7)'
                                                                                        }}>
                                                                                            <div style={{ fontSize: 9, color: isDarkMode ? '#34d399' : '#065f46', fontWeight: 600, marginBottom: 4 }}>
                                                                                                {signal.source === 'legacy' ? 'Legacy DB' : 'Instructions DB'} Web Form
                                                                                            </div>
                                                                                            <div style={{ fontSize: 9, color: isDarkMode ? '#cbd5e1' : '#374151', display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px' }}>
                                                                                                <span>GCLID</span>
                                                                                                <span style={{ fontFamily: 'monospace' }}>{signal.gclid || '—'}</span>
                                                                                                <span>URL</span>
                                                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={signal.url || ''}>
                                                                                                    {signal.url ? (signal.url.length > 80 ? `${signal.url.slice(0, 80)}…` : signal.url) : '—'}
                                                                                                </span>
                                                                                                <span>Campaign</span>
                                                                                                <span>{signal.campaign || '—'}</span>
                                                                                                <span>Date</span>
                                                                                                <span>{signal.date ? new Date(signal.date).toLocaleString() : '—'}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af' }}>
                                                                                    No URL + GCLID evidence yet. Run an enquiry lookup or verify the enquiry captured the web form submission.
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* STEP 4: CallRail Lookup */}
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'flex-start',
                                                                        gap: 8,
                                                                        padding: '8px 10px',
                                                                        background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(243, 244, 246, 0.5)',
                                                                        borderRadius: 5,
                                                                        marginBottom: 6
                                                                    }}>
                                                                        <div style={{ 
                                                                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                                                                            background: matterInspection.callRailLookup?.found
                                                                                ? (isDarkMode ? '#166534' : '#dcfce7')
                                                                                : (isDarkMode ? '#1e293b' : '#e5e7eb'),
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: 10, fontWeight: 700,
                                                                            color: matterInspection.callRailLookup?.found
                                                                                ? (isDarkMode ? '#4ade80' : '#16a34a')
                                                                                : (isDarkMode ? '#64748b' : '#9ca3af')
                                                                        }}>
                                                                            {matterInspection.callRailLookup?.found ? '✓' : '4'}
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#374151', marginBottom: 4 }}>
                                                                                CallRail → Calls by Phone
                                                                            </div>
                                                                            {matterInspection.callRailLookup ? (
                                                                                <div style={{ fontSize: 9 }}>
                                                                                    {matterInspection.callRailLookup.loading ? (
                                                                                        <span style={{ color: isDarkMode ? '#64748b' : '#9ca3af' }}>Searching...</span>
                                                                                    ) : matterInspection.callRailLookup.error ? (
                                                                                        <span style={{ color: '#ef4444' }}>{matterInspection.callRailLookup.error}</span>
                                                                                    ) : matterInspection.callRailLookup.found ? (
                                                                                        <div>
                                                                                            <div style={{ color: isDarkMode ? '#4ade80' : '#16a34a', fontWeight: 600, marginBottom: 6 }}>
                                                                                                {matterInspection.callRailLookup.count} call{matterInspection.callRailLookup.count !== 1 ? 's' : ''} found
                                                                                                {matterInspection.callRailLookup.phoneSearched && (
                                                                                                    <span style={{ fontWeight: 400, color: isDarkMode ? '#64748b' : '#9ca3af', marginLeft: 6 }}>
                                                                                                        ({matterInspection.callRailLookup.phoneSearched})
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            {matterInspection.callRailLookup.calls.slice(0, 5).map((call, i) => (
                                                                                                <div key={call.id || i} style={{
                                                                                                    marginBottom: 8, padding: '8px 10px',
                                                                                                    background: isDarkMode ? 'rgba(30, 41, 59, 0.25)' : 'rgba(248, 250, 252, 0.8)',
                                                                                                    borderRadius: 6, border: `1px solid ${isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'}`
                                                                                                }}>
                                                                                                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '3px 8px', fontSize: 9, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                                                                                                        <span>Date</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{call.startTime ? new Date(call.startTime).toLocaleString() : '—'}</span>
                                                                                                        <span>Direction</span>
                                                                                                        <span style={{ color: call.direction === 'inbound' ? (isDarkMode ? '#4ade80' : '#16a34a') : (isDarkMode ? '#38bdf8' : '#0284c7') }}>{call.direction || '—'}</span>
                                                                                                        <span>Duration</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : '—'}</span>
                                                                                                        <span>Answered</span>
                                                                                                        <span style={{ color: call.answered ? (isDarkMode ? '#4ade80' : '#16a34a') : (isDarkMode ? '#f87171' : '#dc2626') }}>{call.answered ? 'Yes' : 'No'}</span>
                                                                                                        <span>Source</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{call.source || '—'}</span>
                                                                                                        <span>Campaign</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{call.campaign || '—'}</span>
                                                                                                        <span>Keywords</span>
                                                                                                        <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{call.keywords || '—'}</span>
                                                                                                        {call.customerName && call.customerName !== 'Unknown Caller' && (
                                                                                                            <>
                                                                                                                <span>Caller</span>
                                                                                                                <span style={{ color: isDarkMode ? '#cbd5e1' : '#475569' }}>{call.customerName}</span>
                                                                                                            </>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                            {matterInspection.callRailLookup.count > 5 && (
                                                                                                <div style={{ fontSize: 8, color: isDarkMode ? '#64748b' : '#9ca3af', marginTop: 4 }}>
                                                                                                    ... and {matterInspection.callRailLookup.count - 5} more
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span style={{ color: isDarkMode ? '#64748b' : '#9ca3af' }}>No calls found</span>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#9ca3af' }}>
                                                                                    {(() => {
                                                                                        // Collect phone numbers from Clio and enquiry matches
                                                                                        const phones: string[] = [];
                                                                                        if (matterInspection.clientPhone) phones.push(matterInspection.clientPhone);
                                                                                        matterInspection.enquiryLookup?.legacy.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                        matterInspection.enquiryLookup?.instructions.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                        const uniquePhones = [...new Set(phones.filter(p => p && p.length > 5))];
                                                                                        if (uniquePhones.length > 0) {
                                                                                            return `${uniquePhones.length} phone number${uniquePhones.length !== 1 ? 's' : ''} available`;
                                                                                        }
                                                                                        // Show hint about what steps to run
                                                                                        if (!matterInspection.clientEmail) {
                                                                                            return 'Run Step 1 first (Clio fetch)';
                                                                                        }
                                                                                        if (!matterInspection.enquiryLookup) {
                                                                                            return 'Run Step 2 first (Enquiry lookup) - phone may be there';
                                                                                        }
                                                                                        return 'No phone numbers in Clio or Enquiries';
                                                                                    })()}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {!matterInspection.callRailLookup && (
                                                                            <button
                                                                                onClick={async (e) => {
                                                                                    e.stopPropagation();
                                                                                    // Collect phone numbers from Clio and enquiry matches
                                                                                    const phones: string[] = [];
                                                                                    if (matterInspection.clientPhone) phones.push(matterInspection.clientPhone);
                                                                                    matterInspection.enquiryLookup?.legacy.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                    matterInspection.enquiryLookup?.instructions.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                    const uniquePhones = [...new Set(phones.filter(p => p && p.length > 5))];
                                                                                    
                                                                                    if (uniquePhones.length === 0) return;
                                                                                    
                                                                                    setMatterInspection(prev => prev ? { 
                                                                                        ...prev, 
                                                                                        callRailLookup: { found: false, count: 0, calls: [], error: null, loading: true }
                                                                                    } : null);
                                                                                    
                                                                                    try {
                                                                                        // Search CallRail for the first phone number (most likely Clio's)
                                                                                        const phoneToSearch = uniquePhones[0];
                                                                                        const resp = await fetch('/api/callrailCalls', {
                                                                                            method: 'POST',
                                                                                            headers: { 'Content-Type': 'application/json' },
                                                                                            body: JSON.stringify({ phoneNumber: phoneToSearch, maxResults: 20 })
                                                                                        });
                                                                                        const data = await resp.json();
                                                                                        if (data.success) {
                                                                                            setMatterInspection(prev => prev ? {
                                                                                                ...prev,
                                                                                                callRailLookup: {
                                                                                                    found: data.calls.length > 0,
                                                                                                    count: data.calls.length,
                                                                                                    calls: data.calls,
                                                                                                    error: null,
                                                                                                    loading: false,
                                                                                                    phoneSearched: phoneToSearch
                                                                                                }
                                                                                            } : null);
                                                                                        } else {
                                                                                            setMatterInspection(prev => prev ? {
                                                                                                ...prev,
                                                                                                callRailLookup: { found: false, count: 0, calls: [], error: data.error || 'Search failed', loading: false }
                                                                                            } : null);
                                                                                        }
                                                                                    } catch (err) {
                                                                                        console.error('CallRail lookup error:', err);
                                                                                        setMatterInspection(prev => prev ? {
                                                                                            ...prev,
                                                                                            callRailLookup: { found: false, count: 0, calls: [], error: 'Network error', loading: false }
                                                                                        } : null);
                                                                                    }
                                                                                }}
                                                                                disabled={(() => {
                                                                                    const phones: string[] = [];
                                                                                    if (matterInspection.clientPhone) phones.push(matterInspection.clientPhone);
                                                                                    matterInspection.enquiryLookup?.legacy.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                    matterInspection.enquiryLookup?.instructions.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                    return phones.filter(p => p && p.length > 5).length === 0;
                                                                                })()}
                                                                                style={{
                                                                                    padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                                                                    background: isDarkMode ? 'rgba(251, 146, 60, 0.15)' : 'rgba(234, 88, 12, 0.1)',
                                                                                    border: `1px solid ${isDarkMode ? 'rgba(251, 146, 60, 0.3)' : 'rgba(234, 88, 12, 0.2)'}`,
                                                                                    borderRadius: 4, cursor: 'pointer',
                                                                                    color: isDarkMode ? '#fb923c' : '#ea580c',
                                                                                    marginTop: 2,
                                                                                    opacity: (() => {
                                                                                        const phones: string[] = [];
                                                                                        if (matterInspection.clientPhone) phones.push(matterInspection.clientPhone);
                                                                                        matterInspection.enquiryLookup?.legacy.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                        matterInspection.enquiryLookup?.instructions.matches.forEach(m => m.phone && phones.push(m.phone));
                                                                                        return phones.filter(p => p && p.length > 5).length === 0 ? 0.5 : 1;
                                                                                    })()
                                                                                }}
                                                                            >
                                                                                Search
                                                                            </button>
                                                                        )}
                                                                        {matterInspection.callRailLookup?.loading && (
                                                                            <Spinner size={SpinnerSize.xSmall} style={{ marginTop: 2 }} />
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {/* Error Display */}
                                                                    {matterInspection.error && (
                                                                        <div style={{ fontSize: 9, color: '#ef4444', padding: '4px 8px', marginBottom: 6 }}>
                                                                            {matterInspection.error}
                                                                        </div>
                                                                    )}
                                                                    
                                                                    {/* Debug: Full Matter Record */}
                                                                    <details style={{ marginTop: 8 }}>
                                                                        <summary style={{
                                                                            cursor: 'pointer', fontSize: 9,
                                                                            color: isDarkMode ? '#475569' : '#9ca3af',
                                                                            padding: '2px 0'
                                                                        }}>
                                                                            Raw data
                                                                        </summary>
                                                                        <pre style={{
                                                                            marginTop: 6, padding: 8,
                                                                            background: isDarkMode ? '#0f172a' : '#f1f5f9',
                                                                            borderRadius: 4, fontSize: 9, fontFamily: 'monospace',
                                                                            overflow: 'auto', maxHeight: 200,
                                                                            color: isDarkMode ? '#64748b' : '#64748b',
                                                                            whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                                                                        }}>
                                                                            {JSON.stringify(matter, null, 2)}
                                                                        </pre>
                                                                    </details>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        // The matter data uses field names:
                                                                        // "Unique ID" = Clio Matter ID (use this to call Clio API)
                                                                        // "Client ID" = Clio Client/Contact ID
                                                                        const m = matter as any;
                                                                        const clioMatterId = m.UniqueID || m['Unique ID'] || m.id || '';
                                                                        const clientId = m.ClientID || m['Client ID'] || m.client_id || '';
                                                                        const displayNumber = m.DisplayNumber || m['Display Number'] || '';
                                                                        const clientName = m.ClientName || m['Client Name'] || '';
                                                                        
                                                                        // Set state with local data only - no automatic API call
                                                                        setMatterInspection({
                                                                            matterId: clioMatterId,
                                                                            uniqueId: matterRowId,
                                                                            clientId: clientId,
                                                                            clientName: clientName,
                                                                            clientEmail: '', // Will be fetched separately via Clio API
                                                                            clientPhone: '', // Will be fetched separately via Clio API
                                                                            displayNumber: displayNumber,
                                                                            version: m.InstructionRef ? 'v2' : 'v1',
                                                                            instructionRef: m.InstructionRef || m.instruction_ref || '',
                                                                            loading: false,
                                                                            webFormMatches: []
                                                                        });
                                                                    }}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: 6,
                                                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                                                                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(37, 99, 235, 0.2)'}`,
                                                                        borderRadius: 6,
                                                                        padding: '6px 12px',
                                                                        cursor: 'pointer',
                                                                        color: isDarkMode ? '#7dd3fc' : '#2563eb',
                                                                        fontSize: '11px',
                                                                        fontFamily: 'Raleway, sans-serif',
                                                                        fontWeight: 600,
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(37, 99, 235, 0.15)';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(37, 99, 235, 0.1)';
                                                                    }}
                                                                    title="Inspect matter to resolve IDs and find linked enquiries"
                                                                >
                                                                    <Icon iconName="Search" style={{ fontSize: 12 }} />
                                                                    Inspect
                                                                </button>
                                                            )}
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
