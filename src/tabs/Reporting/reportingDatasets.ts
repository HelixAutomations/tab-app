export type ReportingDatasetCategory =
  | 'reference-data'
  | 'operational-cache'
  | 'reconciled-ledger'
  | 'external-analytics'
  | 'communications-feed';

export type ReportingDatasetRefreshMode = 'stream' | 'manual-check' | 'scheduled-sync' | 'derived';
export type ReportingDatasetStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ReportingLiveDatasetSummary = {
  definition: {
    key: string;
    name: string;
  };
  status: ReportingDatasetStatus;
  updatedAt: number | null | undefined;
  count: number;
  cached: boolean;
};

export type Ga4ProviderCheckState = {
  status: ReportingDatasetStatus;
  checkedAt: number | null;
  rowCount: number | null;
  startDate: string | null;
  endDate: string | null;
  source: string | null;
  error: string | null;
};

export type Ga4ProviderPayload = {
  success?: boolean;
  data?: unknown[];
  dateRange?: {
    start?: string;
    end?: string;
  };
  source?: string;
  error?: string;
};

export interface ReportingDatasetProviderMeta {
  category: ReportingDatasetCategory;
  providerLabel: string;
  sourceLabel: string;
  sourceRoute?: string;
  purpose: string;
  freshnessExpectation: string;
  refreshMode: ReportingDatasetRefreshMode;
  reportUsage: readonly string[];
  contextDatasets?: readonly string[];
  devPreviewOnly?: boolean;
  buildFocus?: boolean;
  providerCheck?: {
    label: string;
    defaultDaysBack: number;
    route: string;
  };
}

export interface ReportingDatasetDefinition {
  key: string;
  name: string;
  provider: ReportingDatasetProviderMeta;
}

export const REPORTING_DATASET_DEFINITIONS = [
  {
    key: 'userData',
    name: 'Users',
    provider: {
      category: 'reference-data',
      providerLabel: 'Hub reference data',
      sourceLabel: 'Instructions database',
      purpose: 'User identity and access context for Reports.',
      freshnessExpectation: 'Loaded with the Reports session.',
      refreshMode: 'stream',
      reportUsage: ['Management dashboard'],
      sourceRoute: '/api/users',
    },
  },
  {
    key: 'teamData',
    name: 'Team',
    provider: {
      category: 'reference-data',
      providerLabel: 'Hub reference data',
      sourceLabel: 'Team table',
      purpose: 'Team membership, initials, and role context for reporting filters.',
      freshnessExpectation: 'Loaded with the Reports session.',
      refreshMode: 'stream',
      reportUsage: ['Management dashboard', 'Reception Performance', 'Calls report'],
      sourceRoute: '/api/teams',
    },
  },
  {
    key: 'enquiries',
    name: 'Enquiries',
    provider: {
      category: 'operational-cache',
      providerLabel: 'Hub intake data',
      sourceLabel: 'Enquiry processing feed',
      purpose: 'Lead volume and conversion context for reporting.',
      freshnessExpectation: 'Refreshed through the Reports stream.',
      refreshMode: 'stream',
      reportUsage: ['Management dashboard', 'Reception Performance', 'SEO report', 'Enquiries report', 'Enquiry ledger'],
      sourceRoute: '/api/enquiries',
    },
  },
  {
    key: 'allMatters',
    name: 'Matters',
    provider: {
      category: 'operational-cache',
      providerLabel: 'Clio matter cache',
      sourceLabel: 'Clio matters',
      purpose: 'Matter-opening and commercial context for reporting.',
      freshnessExpectation: 'Refreshed through the Reports stream.',
      refreshMode: 'manual-check',
      reportUsage: ['Management dashboard', 'SEO report', 'Matters', 'PPC report'],
      sourceRoute: '/api/matters-unified',
      providerCheck: {
        label: 'Check matters feed',
        defaultDaysBack: 7,
        route: '/api/matters-unified',
      },
    },
  },
  {
    key: 'wip',
    name: 'WIP',
    provider: {
      category: 'reconciled-ledger',
      providerLabel: 'Data Hub reconciliation',
      sourceLabel: 'Clio activities and saved WIP table',
      purpose: 'Recorded-time value for management and billing reports.',
      freshnessExpectation: 'Scheduler-backed, with Data Hub reconciliation tools.',
      refreshMode: 'scheduled-sync',
      reportUsage: ['Management dashboard', 'Matters'],
      sourceRoute: '/api/wip',
    },
  },
  {
    key: 'recoveredFees',
    name: 'Collected Fees',
    provider: {
      category: 'reconciled-ledger',
      providerLabel: 'Data Hub reconciliation',
      sourceLabel: 'Clio collected time and saved collectedTime table',
      purpose: 'Collected-fee value for management and billing reports.',
      freshnessExpectation: 'Scheduler-backed, with Data Hub reconciliation tools.',
      refreshMode: 'scheduled-sync',
      reportUsage: ['Management dashboard', 'Matters', 'PPC report'],
      sourceRoute: '/api/recovered-fees',
    },
  },
  {
    key: 'annualLeave',
    name: 'Annual Leave',
    provider: {
      category: 'operational-cache',
      providerLabel: 'Attendance data',
      sourceLabel: 'Attendance and leave API',
      purpose: 'Leave and team availability context for reports.',
      freshnessExpectation: 'Refreshed when Reports requests attendance data.',
      refreshMode: 'derived',
      reportUsage: ['Management dashboard', 'Annual leave report'],
      sourceRoute: '/api/annual-leave',
    },
  },
  {
    key: 'metaMetrics',
    name: 'Meta Ads',
    provider: {
      category: 'external-analytics',
      providerLabel: 'Marketing provider',
      sourceLabel: 'Meta Ads',
      purpose: 'Paid social campaign telemetry. Currently parked while Meta is off across Reports.',
      freshnessExpectation: 'Not actively refreshed.',
      refreshMode: 'manual-check',
      reportUsage: [],
      devPreviewOnly: true,
      sourceRoute: '/api/meta-metrics',
    },
  },
  {
    key: 'googleAnalytics',
    name: 'Google Analytics',
    provider: {
      category: 'external-analytics',
      providerLabel: 'SEO traffic provider',
      sourceLabel: 'GA4 Analytics Data API',
      sourceRoute: '/api/marketing-metrics/ga4',
      purpose: 'Daily traffic telemetry used to understand organic demand and compare traffic with enquiry creation.',
      freshnessExpectation: 'GA4 is telemetry, not a ledger. Validate provider availability, metric shape, row count, and freshness instead of reconciling to Clio.',
      refreshMode: 'manual-check',
      reportUsage: ['Marketing', 'SEO report'],
      contextDatasets: ['enquiries', 'allMatters'],
      devPreviewOnly: true,
      buildFocus: true,
      providerCheck: {
        label: 'Test GA4 provider',
        defaultDaysBack: 7,
        route: '/api/marketing-metrics/ga4',
      },
    },
  },
  {
    key: 'googleAds',
    name: 'Google Ads',
    provider: {
      category: 'external-analytics',
      providerLabel: 'Paid search provider',
      sourceLabel: 'Google Ads API',
      sourceRoute: '/api/marketing-metrics/google-ads',
      purpose: 'Paid acquisition telemetry for PPC performance analysis.',
      freshnessExpectation: 'Google Ads API access is checked on demand and returns daily paid-search rows for PPC reporting.',
      refreshMode: 'manual-check',
      reportUsage: ['Marketing', 'PPC report'],
      contextDatasets: ['enquiries', 'allMatters', 'recoveredFees'],
      devPreviewOnly: true,
      buildFocus: true,
      providerCheck: {
        label: 'Test Google Ads provider',
        defaultDaysBack: 7,
        route: '/api/marketing-metrics/google-ads',
      },
    },
  },
  {
    key: 'deals',
    name: 'Pitches',
    provider: {
      category: 'operational-cache',
      providerLabel: 'Pitch data',
      sourceLabel: 'Deal capture',
      purpose: 'Pitch and instruction pipeline context for enquiry reporting.',
      freshnessExpectation: 'Refreshed through the Reports stream.',
      refreshMode: 'stream',
      reportUsage: ['Enquiries report', 'Enquiry ledger'],
      sourceRoute: '/api/deals',
    },
  },
  {
    key: 'instructions',
    name: 'Instructions',
    provider: {
      category: 'operational-cache',
      providerLabel: 'Instruction data',
      sourceLabel: 'Instructions database',
      purpose: 'Instruction outcomes for enquiry reporting.',
      freshnessExpectation: 'Refreshed through the Reports stream.',
      refreshMode: 'stream',
      reportUsage: ['Enquiries report', 'Enquiry ledger'],
      sourceRoute: '/api/instructions',
    },
  },
  {
    key: 'dubberCalls',
    name: 'Calls',
    provider: {
      category: 'communications-feed',
      providerLabel: 'Call provider',
      sourceLabel: 'Dubber',
      purpose: 'Reception and call handling evidence for reports.',
      freshnessExpectation: 'Checked on demand for reception and calls reports.',
      refreshMode: 'manual-check',
      reportUsage: ['Reception Performance', 'Calls report'],
      devPreviewOnly: true,
      sourceRoute: '/api/calls',
    },
  },
] as const satisfies readonly ReportingDatasetDefinition[];

export type ReportingDatasetKey = typeof REPORTING_DATASET_DEFINITIONS[number]['key'];
export type ReportingDatasetRegistryEntry = ReportingDatasetDefinition;

export const REPORTING_DATASET_BY_KEY = REPORTING_DATASET_DEFINITIONS.reduce((acc, dataset) => {
  acc[dataset.key as ReportingDatasetKey] = dataset;
  return acc;
}, {} as Record<ReportingDatasetKey, ReportingDatasetRegistryEntry>);

export const REPORTING_DATASET_KEYS = REPORTING_DATASET_DEFINITIONS.map((dataset) => dataset.key) as ReportingDatasetKey[];