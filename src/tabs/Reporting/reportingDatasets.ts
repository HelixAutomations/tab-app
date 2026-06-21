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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Session loaded.',
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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Session loaded.',
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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Reports stream.',
      refreshMode: 'stream',
      reportUsage: ['Management dashboard', 'Reception Performance', 'SEO report', 'Enquiries report', 'Enquiry ledger'],
      sourceRoute: '/api/enquiries',
    },
  },
  {
    key: 'allMatters',
    name: 'Matters',
    provider: {
      category: 'reconciled-ledger',
      providerLabel: 'Data Hub Clio fill',
      sourceLabel: 'Clio matters and new-space Matters table',
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Scheduled sync.',
      refreshMode: 'scheduled-sync',
      reportUsage: ['Management dashboard', 'SEO report', 'Matters', 'PPC report'],
      sourceRoute: '/api/data-operations/sync-matters',
    },
  },
  {
    key: 'wip',
    name: 'WIP',
    provider: {
      category: 'reconciled-ledger',
      providerLabel: 'Data Hub reconciliation',
      sourceLabel: 'Clio activities and saved WIP table',
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Scheduled sync.',
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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Scheduled sync.',
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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Derived feed.',
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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Manual check.',
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
      purpose: 'Provider controls and status.',
      freshnessExpectation: 'Manual check.',
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
      purpose: 'Provider controls and status.',
      freshnessExpectation: 'Manual check.',
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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Reports stream.',
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
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Reports stream.',
      refreshMode: 'stream',
      reportUsage: ['Enquiries report', 'Enquiry ledger'],
      sourceRoute: '/api/instructions',
    },
  },
  {
    key: 'emailLists',
    name: 'Email Outreach',
    provider: {
      category: 'communications-feed',
      providerLabel: 'Email Outreach',
      sourceLabel: 'New-space enquiries',
      purpose: 'Email sending controls over new-space enquiries.',
      freshnessExpectation: 'No live sync yet.',
      refreshMode: 'manual-check',
      reportUsage: [],
      contextDatasets: ['enquiries', 'deals', 'instructions'],
      buildFocus: true,
    },
  },
  {
    key: 'dubberCalls',
    name: 'Calls',
    provider: {
      category: 'communications-feed',
      providerLabel: 'Call provider',
      sourceLabel: 'Dubber',
      purpose: 'Dataset controls and status.',
      freshnessExpectation: 'Manual check.',
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