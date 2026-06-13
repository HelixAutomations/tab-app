import React, { CSSProperties } from 'react';
import { colours } from '../../../app/styles/colours';
import { HeaderButton, SystemIntroPanel, SystemModuleSection, SystemPageHeader, useSystemTokens } from './shared';
import azureInfrastructureEnrichmentJson from './data/azureInfrastructureEnrichment.json';
import './SystemInfrastructureView.css';

interface SystemInfrastructureViewProps {
  isDarkMode: boolean;
  onBack: () => void;
  onOpenDashboard: () => void;
  onOpenAuditPack?: () => void;
}

type IconTone = 'tenant' | 'billing' | 'governance' | 'subscription' | 'group' | 'app' | 'data' | 'network' | 'ai' | 'empty';
type SortDirection = 'asc' | 'desc';
type GroupSortKey = 'name' | 'cost' | 'resources';
type ResourceSortKey = 'name' | 'type' | 'location' | 'sku' | 'cost';

interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

interface CostSummary {
  cost: number;
  currency: string;
}

interface AzureResourceSummary {
  id: string;
  name: string;
  type: string;
  kind?: string;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  skuName?: string;
  skuTier?: string;
  cost?: number | null;
  currency?: string | null;
}

interface AzureInfrastructureEnrichment {
  resources: AzureResourceSummary[];
  costs: Record<string, CostSummary>;
  costErrors?: Array<{ subscriptionId?: string; message?: string }>;
  generatedAt?: string;
  costPeriod?: {
    from: string;
    to: string;
  };
}

interface ResourceGroupSummary {
  name: string;
  resources: number;
  category: string;
  types: string[];
  locations?: string[];
  resourceItems?: AzureResourceSummary[];
  thirtyDayCost?: number | null;
  costedResourceCount?: number;
  currency?: string | null;
}

interface SubscriptionSummary {
  id: string;
  name: string;
  isDefault?: boolean;
  resourceGroups: number;
  resources: number;
  locations: string[];
  topTypes: string[];
  groups: ResourceGroupSummary[];
  thirtyDayCost?: number | null;
  costedResourceCount?: number;
  currency?: string | null;
}

const snapshot = {
  date: '2026-05-31',
  source: 'Azure CLI + Azure Resource Graph + Cost Management',
  tenant: 'Helix Law Ltd',
  domains: ['helix-law.com', 'helix-law.co.uk', 'helixlaw.onmicrosoft.com'],
};

const billingSummary = {
  account: 'Helix Law - Automations',
  agreement: 'Microsoft Customer Agreement',
  status: 'Active',
  profileCount: 1,
  invoiceSectionCount: 1,
  plan: 'Microsoft Azure Plan',
};

const governanceSummary = {
  managementGroups: 'Not visible to current CLI identity',
  note: 'Subscriptions are visible. Management group tree needs extra Reader access to map.',
};

const rg = (name: string, resources: number, category: string, types: string[], locations: string[] = ['uksouth']): ResourceGroupSummary => ({
  name,
  resources,
  category,
  types,
  locations,
});

const azureInfrastructureEnrichment = azureInfrastructureEnrichmentJson as unknown as AzureInfrastructureEnrichment;

function resourceTypeLabel(type: string): string {
  const normalised = type.toLowerCase();
  if (normalised === 'microsoft.web/sites') return 'Web app';
  if (normalised === 'microsoft.web/serverfarms') return 'App Service plan';
  if (normalised === 'microsoft.storage/storageaccounts') return 'Storage account';
  if (normalised.startsWith('microsoft.sql/')) return 'SQL';
  if (normalised === 'microsoft.keyvault/vaults') return 'Key Vault';
  if (normalised.startsWith('microsoft.insights/')) return normalised.includes('actiongroups') ? 'Action group' : 'App Insights';
  if (normalised.startsWith('microsoft.network/')) return normalised.includes('privatedns') ? 'Private DNS' : 'Network';
  if (normalised.startsWith('microsoft.cognitiveservices/')) return 'AI services';
  if (normalised.startsWith('microsoft.machinelearningservices/')) return 'ML workspace';
  if (normalised.startsWith('microsoft.cache/')) return 'Redis';
  if (normalised.startsWith('microsoft.botservice/')) return 'Bot service';
  if (normalised.startsWith('microsoft.communication/')) return 'Email services';
  if (normalised.startsWith('microsoft.operationalinsights/')) return 'Log Analytics';
  if (normalised.startsWith('microsoft.logic/')) return 'Logic app';
  const parts = type.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' / ') : type;
}

function resourceTone(resource: AzureResourceSummary): IconTone {
  const type = resource.type.toLowerCase();
  if (type.startsWith('microsoft.network/')) return 'network';
  if (/sql|storage|keyvault|cache/.test(type)) return 'data';
  if (/cognitiveservices|machinelearningservices/.test(type)) return 'ai';
  if (/insights|operationalinsights/.test(type)) return 'subscription';
  return 'app';
}

function costForResource(resource: AzureResourceSummary): CostSummary | null {
  return azureInfrastructureEnrichment.costs[resource.id.toLowerCase()] ?? null;
}

function countByLabel(resources: AzureResourceSummary[]): string[] {
  const counts = new Map<string, number>();
  resources.forEach((resource) => {
    const label = resourceTypeLabel(resource.type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([label, count]) => `${label} ${count}`);
}

function inferGroupCategory(seed: ResourceGroupSummary | undefined, resources: AzureResourceSummary[]): string {
  if (seed) return seed.category;
  const labels = resources.map((resource) => resourceTypeLabel(resource.type).toLowerCase()).join(' ');
  if (/private dns|network|vnet/.test(labels)) return 'Networked platform';
  if (/sql|storage|redis|key vault|log analytics/.test(labels)) return 'Data platform';
  if (/ai services|ml workspace/.test(labels)) return 'AI workspace';
  if (/bot|email/.test(labels)) return 'Comms';
  return resources.length ? 'Azure resources' : 'Empty or no visible resources';
}

function enrichSubscriptions(seedSubscriptions: SubscriptionSummary[]): SubscriptionSummary[] {
  const allResources = azureInfrastructureEnrichment.resources.map((resource) => {
    const cost = costForResource(resource);
    return {
      ...resource,
      cost: cost ? cost.cost : null,
      currency: cost ? cost.currency : null,
    };
  });

  return seedSubscriptions.map((subscription) => {
    const subscriptionResources = allResources.filter((resource) => resource.subscriptionId.toLowerCase() === subscription.id.toLowerCase());
    const resourcesByGroup = new Map<string, AzureResourceSummary[]>();
    const actualGroupNames = new Map<string, string>();

    subscriptionResources.forEach((resource) => {
      const groupKey = resource.resourceGroup.toLowerCase();
      actualGroupNames.set(groupKey, resource.resourceGroup);
      const current = resourcesByGroup.get(groupKey) ?? [];
      current.push(resource);
      resourcesByGroup.set(groupKey, current);
    });

    const seedGroupsByKey = new Map(subscription.groups.map((group) => [group.name.toLowerCase(), group]));
    const groupKeys = new Set<string>([...seedGroupsByKey.keys(), ...actualGroupNames.keys()]);
    const groups = [...groupKeys].map((groupKey) => {
      const seed = seedGroupsByKey.get(groupKey);
      const actualResources = (resourcesByGroup.get(groupKey) ?? []).sort((a, b) => {
        const bCost = typeof b.cost === 'number' ? b.cost : -1;
        const aCost = typeof a.cost === 'number' ? a.cost : -1;
        return bCost - aCost || a.name.localeCompare(b.name);
      });
      const costedResources = actualResources.filter((resource) => typeof resource.cost === 'number');
      const locations = [...new Set(actualResources.map((resource) => resource.location).filter(Boolean))].sort();
      const currency = costedResources.find((resource) => resource.currency)?.currency ?? null;
      const thirtyDayCost = costedResources.length ? costedResources.reduce((sum, resource) => sum + (resource.cost ?? 0), 0) : null;
      const types = actualResources.length ? countByLabel(actualResources) : (seed?.types ?? []);

      return {
        name: seed?.name ?? actualGroupNames.get(groupKey) ?? groupKey,
        resources: actualResources.length || seed?.resources || 0,
        category: inferGroupCategory(seed, actualResources),
        types,
        locations: locations.length ? locations : (seed?.locations ?? []),
        resourceItems: actualResources,
        thirtyDayCost,
        costedResourceCount: costedResources.length,
        currency,
      };
    });

    const costedResources = subscriptionResources.filter((resource) => typeof resource.cost === 'number');
    return {
      ...subscription,
      resourceGroups: Math.max(subscription.resourceGroups, groups.length),
      resources: subscriptionResources.length || subscription.resources,
      locations: subscriptionResources.length ? [...new Set(subscriptionResources.map((resource) => resource.location).filter(Boolean))].sort() : subscription.locations,
      topTypes: subscriptionResources.length ? countByLabel(subscriptionResources).slice(0, 5) : subscription.topTypes,
      groups,
      thirtyDayCost: costedResources.length ? costedResources.reduce((sum, resource) => sum + (resource.cost ?? 0), 0) : null,
      costedResourceCount: costedResources.length,
      currency: costedResources.find((resource) => resource.currency)?.currency ?? null,
    };
  });
}

const subscriptionSeeds: SubscriptionSummary[] = [
  {
    id: '57414284-bf79-487f-9317-7a4f9e37dfdf',
    name: 'Helix Automations',
    isDefault: true,
    resourceGroups: 18,
    resources: 181,
    locations: ['uksouth', 'eastus', 'ukwest', 'global', 'westeurope'],
    topTypes: ['App Insights 24', 'Web apps 24', 'Storage 18', 'Plans 17', 'Private endpoints 13'],
    groups: [
      rg('Instructions', 93, 'Networked platform', ['VNet', 'Private endpoints', 'Private DNS', 'Web apps', 'SQL', 'Key Vault'], ['uksouth', 'global', 'eastus']),
      rg('Enquiries', 22, 'AI + app platform', ['Web apps', 'Storage', 'AI services', 'App Insights'], ['uksouth', 'eastus2', 'swedencentral']),
      rg('Main', 19, 'Hub platform', ['Web apps', 'Redis', 'Key Vault', 'Bot service', 'Storage'], ['uksouth', 'global', 'westeurope']),
      rg('operations', 11, 'Ops data', ['Web apps', 'SQL', 'Storage', 'App Insights']),
      rg('Recruitment', 8, 'Business app', ['Web apps', 'SQL', 'Storage', 'App Insights']),
      rg('Content', 5, 'Content app', ['Web apps', 'Storage', 'Action groups'], ['uksouth', 'global']),
      rg('Tasking', 5, 'Bot + app', ['Bot service', 'Web apps', 'Storage'], ['uksouth', 'westeurope']),
      rg('Compliance', 4, 'Business app', ['Web apps', 'Storage', 'App Insights']),
      rg('Matters', 4, 'Business app', ['Web apps', 'Storage', 'App Insights'], ['ukwest']),
      rg('Playground', 2, 'Comms', ['Email services'], ['global']),
      rg('webformendpointsv2', 2, 'Endpoint support', ['Storage', 'App Insights']),
      rg('azureapp-auto-alerts-cb18f6-automations_helix_law_com', 2, 'Alerts', ['Activity log alerts', 'Action groups'], ['global']),
      rg('DefaultResourceGroup-SUK', 1, 'Log workspace', ['Log Analytics']),
      rg('DefaultResourceGroup-WUK', 0, 'Empty or no visible resources', []),
      rg('NetworkWatcherRG', 1, 'Network watcher', ['Network watcher']),
      rg('appsvc_linux_uksouth_premium', 1, 'App Insights', ['App Insights']),
      rg('ai_enquiry-processing-insights_2bedb10c-95f2-4fa0-9da8-0244b097a540_managed', 1, 'Managed workspace', ['Log Analytics'], ['eastus']),
      rg('Aiden', 0, 'Empty or no visible resources', []),
    ],
  },
  {
    id: '6fc7b1b8-2996-4c85-9931-2250ac87b8ea',
    name: 'production v2',
    resourceGroups: 22,
    resources: 144,
    locations: ['uksouth', 'global'],
    topTypes: ['Plans 30', 'App Insights 27', 'Web apps 27', 'Storage 26', 'Smart detectors 26'],
    groups: [
      rg('windowspafunctions', 18, 'Legacy platform', ['Web apps', 'Plans', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('HelixPAFunctions', 16, 'Function platform', ['Web apps', 'Plans', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('helixdatabases', 15, 'Data platform', ['SQL', 'Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('wip', 10, 'WIP platform', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('structured-onboarding-v1', 8, 'Onboarding', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('Tiller', 7, 'Business app', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('helix-bcc', 5, 'Business app', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('matter-opening', 5, 'Matter opening', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('NDMAIL-ETCL', 5, 'Mail integration', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('NDMailCliov2', 5, 'Clio mail integration', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('proof-of-id', 5, 'Identity workflow', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('recruitment', 5, 'Business app', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('reportingv1', 5, 'Reporting', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('TAN', 5, 'Attendance notes', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('tasks', 5, 'Tasking', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('transations', 5, 'Transactions', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('triage', 5, 'Triage', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('v2-call-handling', 5, 'Call handling', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('helixpafunctions2', 5, 'Function platform', ['Web apps', 'Storage', 'Alerts'], ['uksouth', 'global']),
      rg('teams', 2, 'Teams app', ['Web apps', 'Plans']),
      rg('OpenAI', 2, 'AI support', ['Key Vault', 'Storage']),
      rg('DefaultResourceGroup-SUK', 1, 'Log workspace', ['Log Analytics']),
    ],
  },
  {
    id: '688e4235-5073-4c9d-874d-e3c7d367a24c',
    name: 'production v3',
    resourceGroups: 14,
    resources: 48,
    locations: ['uksouth', 'global'],
    topTypes: ['Plans 11', 'Web apps 11', 'Storage 10', 'App Insights 9', 'Key Vaults 2'],
    groups: [
      rg('aged-debts', 6, 'Business app', ['Web apps', 'Storage', 'App Insights']),
      rg('matter-opening-v3', 5, 'Matter opening', ['Web apps', 'Storage', 'Action groups'], ['uksouth', 'global']),
      rg('v1-helix-ai', 5, 'AI workspace', ['ML workspace', 'AI services', 'Key Vault', 'Storage']),
      rg('callrail-v1', 4, 'Calls', ['Web apps', 'Storage', 'App Insights']),
      rg('incoming-post', 4, 'Post workflow', ['Web apps', 'Storage', 'App Insights']),
      rg('legacy-fetch-v2_group', 4, 'Legacy fetch', ['Web apps', 'Storage', 'App Insights']),
      rg('legacy-instruction-fetch_group', 4, 'Legacy fetch', ['Web apps', 'Storage', 'App Insights']),
      rg('management-dashboard', 4, 'Dashboard', ['Web apps', 'Storage', 'App Insights']),
      rg('office-attendance', 4, 'Attendance', ['Web apps', 'Storage', 'App Insights']),
      rg('tasks-v2', 4, 'Tasking', ['Web apps', 'Storage', 'App Insights']),
      rg('v2-bcc', 2, 'Business app', ['Web apps', 'Plans']),
      rg('keys', 1, 'Secrets', ['Key Vault']),
      rg('DefaultResourceGroup-SUK', 1, 'Log workspace', ['Log Analytics']),
      rg('linux.workflows', 0, 'Empty or no visible resources', []),
    ],
  },
  {
    id: 'd9c4388d-2d77-4922-96cb-f113a52d0383',
    name: 'Project Aiden',
    resourceGroups: 6,
    resources: 2,
    locations: ['uksouth'],
    topTypes: ['AI services 1', 'Key Vault 1'],
    groups: [
      rg('ai', 1, 'AI services', ['AI services']),
      rg('infra', 1, 'Secrets', ['Key Vault']),
      rg('devops', 0, 'Empty or no visible resources', []),
      rg('logs', 0, 'Empty or no visible resources', []),
      rg('code', 0, 'Empty or no visible resources', []),
      rg('data', 0, 'Empty or no visible resources', []),
    ],
  },
  { id: 'df3842d9-ccc0-4623-ad88-bf4ff6b3be08', name: 'LUKE SANDBOX', resourceGroups: 0, resources: 0, locations: [], topTypes: [], groups: [] },
  { id: 'f6e3619f-8044-4414-a2ed-77f1c871828e', name: 'helix production', resourceGroups: 0, resources: 0, locations: [], topTypes: [], groups: [] },
  { id: '4f7b59f8-a30b-4361-a8fe-1398b50a2fdf', name: 'Main', resourceGroups: 0, resources: 0, locations: [], topTypes: [], groups: [] },
  { id: '8fd4fd72-30dc-4794-9550-9c0536bf54cc', name: 'Azure subscription 1', resourceGroups: 0, resources: 0, locations: [], topTypes: [], groups: [] },
];

const subscriptions = enrichSubscriptions(subscriptionSeeds);

const totalResources = subscriptions.reduce((sum, sub) => sum + sub.resources, 0);
const totalResourceGroups = subscriptions.reduce((sum, sub) => sum + sub.resourceGroups, 0);
const tenantCurrency = subscriptions.find((sub) => sub.currency)?.currency ?? 'GBP';
const totalThirtyDayCost = subscriptions.reduce((sum, sub) => sum + (sub.thirtyDayCost ?? 0), 0);

function iconColour(tone: IconTone) {
  switch (tone) {
    case 'tenant': return '#0078D4';
    case 'billing': return '#107C10';
    case 'governance': return '#5C2D91';
    case 'subscription': return '#2563eb';
    case 'group': return '#0f766e';
    case 'app': return '#0078D4';
    case 'data': return '#CC2927';
    case 'network': return '#00A4EF';
    case 'ai': return '#68217A';
    case 'empty': return '#64748b';
    default: return colours.green;
  }
}

function groupTone(group: ResourceGroupSummary): IconTone {
  if (group.resources === 0) return 'empty';
  if (/network|private|vnet/i.test(`${group.category} ${group.types.join(' ')}`)) return 'network';
  if (/sql|data|storage|vault|redis|key/i.test(`${group.category} ${group.types.join(' ')}`)) return 'data';
  if (/ai|ml|cognitive/i.test(`${group.category} ${group.types.join(' ')}`)) return 'ai';
  return 'app';
}

function IconBadge({ tone, label }: { tone: IconTone; label: string }) {
  const fill = iconColour(tone);
  return (
    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: fill, color: '#fff', flex: '0 0 auto' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" role="img" aria-label={label}>
        {tone === 'tenant' ? <path d="M12 3 20 7v5c0 5-3.3 7.7-8 9-4.7-1.3-8-4-8-9V7l8-4Z" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {tone === 'billing' ? <path d="M4 7h16v10H4V7Zm2 3h12M7 15h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {tone === 'governance' ? <path d="M12 4v16M6 8h12M8 8l-3 6h6L8 8Zm8 0-3 6h6l-3-6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {tone === 'subscription' ? <path d="M7 3h7l4 4v14H7V3Zm7 0v5h5M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {tone === 'group' ? <path d="M4 6h7v5H4V6Zm9 0h7v5h-7V6ZM4 13h7v5H4v-5Zm9 0h7v5h-7v-5Z" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {tone === 'app' ? <path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Zm8-8v16M4 12h16M7 7c3 2 7 2 10 0M7 17c3-2 7-2 10 0" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
        {tone === 'data' ? <path d="M5 7c0-2 14-2 14 0v10c0 2-14 2-14 0V7Zm0 5c0 2 14 2 14 0" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {tone === 'network' ? <path d="M6 7h12v10H6V7Zm6-4v4m0 10v4M3 12h3m12 0h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {tone === 'ai' ? <path d="M8 4h8v3h3v10h-3v3H8v-3H5V7h3V4Zm2 6h4m-4 4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {tone === 'empty' ? <path d="M5 7h14v10H5V7Zm3 3h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
      </svg>
    </span>
  );
}

function formatCost(cost: number | null | undefined, currency: string | null | undefined = 'GBP'): string {
  if (typeof cost !== 'number') return 'n/a';
  const value = Math.abs(cost) >= 10 ? cost.toFixed(0) : cost.toFixed(2);
  return `${currency || 'GBP'} ${value}`;
}

function formatCostPeriod(period: AzureInfrastructureEnrichment['costPeriod']): string {
  if (!period) return 'Last 30 days';
  const formatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
  return `${formatter.format(new Date(period.from))} to ${formatter.format(new Date(period.to))}`;
}

function ResourceIconBadge({ resource }: { resource: AzureResourceSummary }) {
  const fill = iconColour(resourceTone(resource));
  const type = resource.type.toLowerCase();
  const icon = type.includes('keyvault') ? 'key'
    : type.includes('storage') || type.includes('sql') || type.includes('cache') ? 'data'
      : type.includes('network') ? 'network'
        : type.includes('cognitiveservices') || type.includes('machinelearningservices') ? 'ai'
          : type.includes('insights') || type.includes('operationalinsights') ? 'chart'
            : type.includes('serverfarms') ? 'plan'
              : type.includes('botservice') || type.includes('communication') ? 'comms'
                : 'app';

  return (
    <span title={resourceTypeLabel(resource.type)} aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: fill, color: colours.sectionBackground, flex: '0 0 auto' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" role="img">
        {icon === 'key' ? <path d="M14 8a4 4 0 1 0-2.4 3.7L5 18v3h3l1-1h2v-2h2l2.7-2.7A4 4 0 0 0 14 8Zm2 0h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {icon === 'data' ? <path d="M5 7c0-2 14-2 14 0v10c0 2-14 2-14 0V7Zm0 5c0 2 14 2 14 0" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'network' ? <path d="M6 7h12v10H6V7Zm6-4v4m0 10v4M3 12h3m12 0h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'ai' ? <path d="M8 4h8v3h3v10h-3v3H8v-3H5V7h3V4Zm2 6h4m-4 4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {icon === 'chart' ? <path d="M5 19V5m4 14v-7m4 7V8m4 11v-4M4 19h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'plan' ? <path d="m12 3 8 4-8 4-8-4 8-4Zm-8 9 8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /> : null}
        {icon === 'comms' ? <path d="M5 6h14v9H9l-4 3V6Zm4 4h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {icon === 'app' ? <path d="M4 6h16v12H4V6Zm0 4h16M8 14h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
      </svg>
    </span>
  );
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
}

function compareNumber(a: number | null | undefined, b: number | null | undefined): number {
  const aValue = typeof a === 'number' ? a : Number.NEGATIVE_INFINITY;
  const bValue = typeof b === 'number' ? b : Number.NEGATIVE_INFINITY;
  return aValue - bValue;
}

function nextGroupDirection(current: SortState<GroupSortKey>, key: GroupSortKey): SortDirection {
  if (current.key === key) return current.direction === 'asc' ? 'desc' : 'asc';
  return key === 'name' ? 'asc' : 'desc';
}

function nextResourceDirection(current: SortState<ResourceSortKey>, key: ResourceSortKey): SortDirection {
  if (current.key === key) return current.direction === 'asc' ? 'desc' : 'asc';
  return key === 'cost' ? 'desc' : 'asc';
}

function sortGroups(groups: ResourceGroupSummary[], sort: SortState<GroupSortKey>): ResourceGroupSummary[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...groups].sort((a, b) => {
    let result = 0;
    if (sort.key === 'name') result = compareText(a.name, b.name);
    if (sort.key === 'cost') result = compareNumber(a.thirtyDayCost, b.thirtyDayCost);
    if (sort.key === 'resources') result = compareNumber(a.resources, b.resources);
    return (result * direction) || compareText(a.name, b.name);
  });
}

function sortResources(resources: AzureResourceSummary[], sort: SortState<ResourceSortKey>): AzureResourceSummary[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...resources].sort((a, b) => {
    let result = 0;
    if (sort.key === 'name') result = compareText(a.name, b.name);
    if (sort.key === 'type') result = compareText(resourceTypeLabel(a.type), resourceTypeLabel(b.type));
    if (sort.key === 'location') result = compareText(a.location, b.location);
    if (sort.key === 'sku') result = compareText(a.skuName || a.skuTier, b.skuName || b.skuTier);
    if (sort.key === 'cost') result = compareNumber(a.cost, b.cost);
    return (result * direction) || compareText(a.name, b.name);
  });
}

const SystemInfrastructureView: React.FC<SystemInfrastructureViewProps> = ({ isDarkMode, onBack, onOpenDashboard, onOpenAuditPack }) => {
  const { textColour, mutedColour, borderColour, cardBg, panelBg } = useSystemTokens(isDarkMode);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = React.useState(subscriptions[0].id);
  const [selectedGroupName, setSelectedGroupName] = React.useState(subscriptions[0].groups[0]?.name ?? '');
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);
  const [resourceListOpen, setResourceListOpen] = React.useState(false);
  const [groupSort, setGroupSort] = React.useState<SortState<GroupSortKey>>({ key: 'resources', direction: 'desc' });
  const [resourceSort, setResourceSort] = React.useState<SortState<ResourceSortKey>>({ key: 'cost', direction: 'desc' });

  const selectedSubscription = subscriptions.find((sub) => sub.id === selectedSubscriptionId) ?? subscriptions[0];
  const selectedGroup = selectedSubscription.groups.find((group) => group.name === selectedGroupName) ?? selectedSubscription.groups[0];

  React.useEffect(() => {
    setSelectedGroupName(selectedSubscription.groups[0]?.name ?? '');
  }, [selectedSubscription.id, selectedSubscription.groups]);

  const compactText: CSSProperties = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  };

  const setSubscription = (id: string) => {
    setSelectedSubscriptionId(id);
    setResourceListOpen(false);
  };

  const openResourceList = (group: ResourceGroupSummary) => {
    setSelectedGroupName(group.name);
    setHoveredKey(null);
    setResourceListOpen(true);
  };

  const hoverGroupKeyPrefix = `${selectedSubscription.id}/`;
  const hoveredGroupName = hoveredKey?.startsWith(hoverGroupKeyPrefix) ? hoveredKey.slice(hoverGroupKeyPrefix.length) : null;
  const focusGroup = (hoveredGroupName && selectedSubscription.groups.find((g) => g.name === hoveredGroupName)) || selectedGroup;
  const focusGroupTone = focusGroup ? groupTone(focusGroup) : 'group';
  const focusResources = focusGroup?.resourceItems ?? [];
  const focusCostedCount = focusResources.filter((resource) => typeof resource.cost === 'number').length;
  const costPeriodLabel = formatCostPeriod(azureInfrastructureEnrichment.costPeriod);
  const sortedFocusResources = sortResources(focusResources, resourceSort);

  const tenantAccent = colours.blue;
  const explorerAccent = colours.highlight;

  const statTile = (value: number | string, label: string): React.ReactElement => (
    <div key={String(label)} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 14px', borderLeft: `1px solid ${borderColour}` }}>
      <span style={{ fontSize: 18, fontWeight: 900, color: textColour, fontFamily: 'Raleway, sans-serif', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 800, color: mutedColour, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );

  const sortGlyph = (active: boolean, direction: SortDirection) => active ? (direction === 'asc' ? '^' : 'v') : '-';
  const sortHeaderStyle = (align: 'left' | 'right' = 'left'): CSSProperties => ({
    border: 0,
    background: 'transparent',
    color: mutedColour,
    cursor: 'pointer',
    padding: 0,
    font: 'inherit',
    textAlign: align,
    textTransform: 'inherit',
    letterSpacing: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
    gap: 4,
    minWidth: 0,
  });
  const groupSortHeader = (label: string, key: GroupSortKey, align: 'left' | 'right' = 'left') => (
    <button type="button" onClick={() => setGroupSort((current) => ({ key, direction: nextGroupDirection(current, key) }))} style={sortHeaderStyle(align)} title={`Sort by ${label}`}>
      <span>{label}</span>
      <span aria-hidden="true" style={{ fontSize: 8, opacity: groupSort.key === key ? 1 : 0.45 }}>{sortGlyph(groupSort.key === key, groupSort.direction)}</span>
    </button>
  );
  const resourceSortHeader = (label: string, key: ResourceSortKey, align: 'left' | 'right' = 'left') => (
    <button type="button" onClick={() => setResourceSort((current) => ({ key, direction: nextResourceDirection(current, key) }))} style={sortHeaderStyle(align)} title={`Sort by ${label}`}>
      <span>{label}</span>
      <span aria-hidden="true" style={{ fontSize: 8, opacity: resourceSort.key === key ? 1 : 0.45 }}>{sortGlyph(resourceSort.key === key, resourceSort.direction)}</span>
    </button>
  );

  const sortedGroups = sortGroups(selectedSubscription.groups, groupSort);
  const paperBg = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;

  if (resourceListOpen && selectedGroup) {
    const selectedResources = sortResources(selectedGroup.resourceItems ?? [], resourceSort);
    const selectedCostedCount = selectedResources.filter((resource) => typeof resource.cost === 'number').length;
    const selectedGroupTone = groupTone(selectedGroup);
    const resourceListColumns = 'minmax(0, 1.35fr) minmax(0, 0.95fr) minmax(68px, 0.35fr) minmax(72px, 0.45fr) minmax(74px, 0.35fr)';

    return (
      <section data-helix-region="system/infrastructure/resources">
        <SystemPageHeader
          eyebrow={`${selectedSubscription.name} / ${selectedGroup.category}`}
          title={`${selectedGroup.name} resources`}
          isDarkMode={isDarkMode}
          onBack={() => setResourceListOpen(false)}
          onOpenDashboard={onOpenDashboard}
        />

        <SystemModuleSection
          label="Resource inventory"
          description={`${snapshot.tenant} > ${selectedSubscription.name} > ${selectedGroup.name}`}
          accent={iconColour(selectedGroupTone)}
          dataRegion="system/infrastructure/resources/list"
          isDarkMode={isDarkMode}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
            {statTile(selectedResources.length || selectedGroup.resources, 'Resources')}
            {statTile(formatCost(selectedGroup.thirtyDayCost, selectedGroup.currency), '30-day cost')}
            {statTile(`${selectedCostedCount}/${selectedResources.length || selectedGroup.resources}`, 'Cost matched')}
            {statTile(costPeriodLabel, 'Cost period')}
          </div>

          <div style={{ border: `1px solid ${borderColour}`, background: paperBg }}>
            <div style={{ display: 'grid', gridTemplateColumns: resourceListColumns, gap: 10, padding: '8px 10px', borderBottom: `1px solid ${borderColour}`, background: cardBg, color: mutedColour, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {resourceSortHeader('Resource', 'name')}
              {resourceSortHeader('Type', 'type')}
              {resourceSortHeader('Region', 'location')}
              {resourceSortHeader('SKU', 'sku')}
              {resourceSortHeader('Cost', 'cost', 'right')}
            </div>
            {selectedResources.length ? (
              selectedResources.map((resource) => (
                <div key={resource.id} style={{ display: 'grid', gridTemplateColumns: resourceListColumns, gap: 10, alignItems: 'center', padding: '10px', borderBottom: `1px solid ${borderColour}`, color: textColour }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <ResourceIconBadge resource={resource} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: textColour, letterSpacing: '0.1px', wordBreak: 'break-word' }}>{resource.name}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: mutedColour, marginTop: 3, wordBreak: 'break-all' }}>{resource.id}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: textColour, wordBreak: 'break-word' }}>{resourceTypeLabel(resource.type)}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: mutedColour }}>{resource.location || '-'}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: mutedColour, wordBreak: 'break-word' }}>{resource.skuName || resource.skuTier || '-'}</div>
                  <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 900, color: typeof resource.cost === 'number' ? textColour : mutedColour }}>{formatCost(resource.cost, resource.currency)}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: 16, color: mutedColour, fontSize: 12, fontStyle: 'italic' }}>No resource rows were returned by Azure Resource Graph for this group.</div>
            )}
          </div>
        </SystemModuleSection>
      </section>
    );
  }

  return (
    <section data-helix-region="system/infrastructure">
      <SystemPageHeader
        eyebrow="System"
        title="Infrastructure"
        isDarkMode={isDarkMode}
        onBack={onBack}
        onOpenDashboard={onOpenDashboard}
      />

      <SystemIntroPanel
        eyebrow="Reference"
        title="Azure inventory"
        description="Subscriptions, resource groups, resources, cost."
        isDarkMode={isDarkMode}
        accent={colours.accent}
        actionLabel={onOpenAuditPack ? 'Open audit pack' : undefined}
        onAction={onOpenAuditPack}
        dataRegion="system/infrastructure/intro"
      />

      <SystemModuleSection
        label="Tenant"
        description={`${snapshot.source} | ${snapshot.date}`}
        accent={tenantAccent}
        dataRegion="system/infrastructure/tenant"
        isDarkMode={isDarkMode}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 280px' }}>
            <IconBadge tone="tenant" label="Tenant" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: textColour, fontSize: 14, fontFamily: 'Raleway, sans-serif' }}>{snapshot.tenant}</div>
              <div style={{ color: mutedColour, fontSize: 11, marginTop: 2 }}>
                {billingSummary.account} <span style={{ opacity: 0.5 }}>|</span> {billingSummary.agreement} <span style={{ opacity: 0.5 }}>|</span> {governanceSummary.managementGroups.includes('Not') ? 'MGs not visible' : 'MGs visible'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {statTile(subscriptions.length, 'Subscriptions')}
            {statTile(totalResourceGroups, 'Resource groups')}
            {statTile(totalResources, 'Resources')}
            {statTile(formatCost(totalThirtyDayCost, tenantCurrency), '30-day cost')}
          </div>
        </div>
      </SystemModuleSection>

      <SystemModuleSection
        label="Explorer"
        description={`${selectedSubscription.name} / ${focusGroup ? focusGroup.name : 'select a group'}`}
        accent={explorerAccent}
        dataRegion="system/infrastructure/explorer"
        isDarkMode={isDarkMode}
      >
        {/* Subscription strip: underline-active tabs, mirrors SystemTabBar visual */}
        <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', borderBottom: `1px solid ${borderColour}`, marginBottom: 0, gap: 0 }}>
          {subscriptions.map((sub) => {
            const selected = sub.id === selectedSubscription.id;
            const hovered = hoveredKey === sub.id;
            const empty = sub.resources === 0;
            return (
              <button
                key={sub.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setSubscription(sub.id)}
                onMouseEnter={() => setHoveredKey(sub.id)}
                onMouseLeave={() => setHoveredKey(null)}
                title={`${sub.name} | ${sub.id} | ${sub.locations.join(', ') || 'no regions'}`}
                style={{
                  border: 0,
                  background: selected ? `${explorerAccent}14` : (hovered ? `${explorerAccent}0A` : 'transparent'),
                  cursor: 'pointer',
                  padding: '10px 14px',
                  marginBottom: -1,
                  borderBottom: `2px solid ${selected ? explorerAccent : 'transparent'}`,
                  color: selected ? textColour : mutedColour,
                  opacity: empty && !selected ? 0.55 : 1,
                  fontFamily: 'Raleway, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                  transition: 'background 120ms, color 120ms',
                }}
              >
                <div style={{ minWidth: 0, textAlign: 'left' }}>
                  <div style={{ ...compactText, fontSize: 12, fontWeight: 900, letterSpacing: '0.2px' }}>{sub.name}</div>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour, marginTop: 2 }}>
                    {sub.resourceGroups} RG <span style={{ opacity: 0.5 }}>|</span> {sub.resources} res <span style={{ opacity: 0.5 }}>|</span> {formatCost(sub.thirtyDayCost, sub.currency)}{sub.isDefault ? ' \u2022 default' : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Workbench: groups list (left) + CCL-style paper detail (right). Single bordered frame. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 460px)', gap: 0, border: `1px solid ${borderColour}`, borderTop: 0, background: cardBg, minHeight: 320 }}>
          <div style={{ borderRight: `1px solid ${borderColour}`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px 58px auto', gap: 10, padding: '8px 12px', background: panelBg, borderBottom: `1px solid ${borderColour}`, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.6px', color: mutedColour }}>
              {groupSortHeader('Resource group', 'name')}
              {groupSortHeader('30 days', 'cost', 'right')}
              {groupSortHeader('Resources', 'resources', 'right')}
              <span style={{ width: 12 }} aria-hidden="true" />
            </div>
            {sortedGroups.length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {sortedGroups.map((group) => {
                  const key = `${selectedSubscription.id}/${group.name}`;
                  const selectedG = selectedGroup?.name === group.name;
                  const hoveredG = hoveredKey === key;
                  const active = selectedG || hoveredG;
                  const tone = groupTone(group);
                  const accent = iconColour(tone);
                  const empty = group.resources === 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedGroupName(group.name)}
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      title={`${group.name} | ${group.category} | ${group.resources} resources | ${formatCost(group.thirtyDayCost, group.currency)}`}
                      style={{
                        border: 0,
                        borderBottom: `1px solid ${borderColour}`,
                        borderLeft: `3px solid ${selectedG ? accent : (hoveredG ? `${accent}80` : 'transparent')}`,
                        background: selectedG ? `${accent}14` : (hoveredG ? `${accent}08` : 'transparent'),
                        padding: '9px 12px 9px 9px',
                        cursor: 'pointer',
                        display: 'grid',
                        gridTemplateColumns: '1fr 76px 58px auto',
                        gap: 10,
                        alignItems: 'center',
                        fontFamily: 'Raleway, sans-serif',
                        textAlign: 'left',
                        color: textColour,
                        opacity: empty && !active ? 0.55 : 1,
                        transition: 'background 120ms, border-color 120ms',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, background: accent, flex: '0 0 auto' }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...compactText, fontSize: 12, fontWeight: 900, letterSpacing: '0.1px' }}>{group.name}</div>
                          <div style={{ ...compactText, fontSize: 10, fontWeight: 700, color: mutedColour, textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{group.category}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 900, fontFamily: 'Raleway, sans-serif', color: typeof group.thirtyDayCost === 'number' ? textColour : mutedColour, lineHeight: 1 }}>{formatCost(group.thirtyDayCost, group.currency)}</div>
                      <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 900, fontFamily: 'Raleway, sans-serif', color: empty ? mutedColour : textColour, lineHeight: 1 }}>{group.resources}</div>
                      <span aria-hidden="true" style={{ width: 12, color: mutedColour, fontWeight: 900, fontSize: 13, opacity: selectedG ? 1 : 0.4, textAlign: 'right' }}>{selectedG ? '\u203A' : '\u203A'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 14, color: mutedColour, fontSize: 11, fontStyle: 'italic' }}>No resource groups visible in Azure Resource Graph for this subscription.</div>
            )}
          </div>

          {/* CCL-style paper detail pane */}
          <div style={{ padding: 14, minWidth: 0, background: panelBg, alignSelf: 'stretch' }}>
            {focusGroup ? (
              <div data-helix-region="system/infrastructure/resource-detail" style={{ background: paperBg, border: `1px solid ${borderColour}`, borderTop: `2px solid ${iconColour(focusGroupTone)}`, padding: '14px 16px', minHeight: '100%', fontFamily: 'Raleway, sans-serif', boxShadow: isDarkMode ? 'none' : '0 1px 0 rgba(15, 23, 42, 0.04)' }}>
                <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.6px', color: mutedColour }}>Resource group</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: textColour, marginTop: 4, lineHeight: 1.2, wordBreak: 'break-word' }}>{focusGroup.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: mutedColour, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{focusGroup.category}</div>

                <div style={{ borderTop: `1px solid ${borderColour}`, marginTop: 14, paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>Resources</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: textColour, marginTop: 3, lineHeight: 1 }}>{focusResources.length || focusGroup.resources}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>Regions</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: textColour, marginTop: 5, lineHeight: 1.4 }}>{focusGroup.locations?.join(', ') || '-'}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>30-day cost</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: textColour, marginTop: 3, lineHeight: 1 }}>{formatCost(focusGroup.thirtyDayCost, focusGroup.currency)}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: mutedColour, marginTop: 4 }}>{focusCostedCount} of {focusResources.length || focusGroup.resources} resources matched to Cost Management, {costPeriodLabel}</div>
                  </div>
                </div>

                {focusGroup.types.length ? (
                  <div style={{ borderTop: `1px solid ${borderColour}`, marginTop: 14, paddingTop: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour, marginBottom: 8 }}>Resource types</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {focusGroup.types.map((type) => (
                        <span key={type} style={{ border: `1px solid ${borderColour}`, borderRadius: 0, padding: '3px 7px', color: textColour, fontSize: 10, fontWeight: 700, background: cardBg, letterSpacing: '0.2px' }}>{type}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div style={{ borderTop: `1px solid ${borderColour}`, marginTop: 14, paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>Resources</div>
                    {sortedFocusResources.length ? (
                      <HeaderButton label="View resources" isDarkMode={isDarkMode} accent={colours.highlight} onClick={() => openResourceList(focusGroup)} />
                    ) : null}
                  </div>
                  {sortedFocusResources.length ? (
                    <div className="system-infra-scroll" style={{ border: `1px solid ${borderColour}`, maxHeight: 360, overflow: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 78px 78px', gap: 8, padding: '7px 9px', borderBottom: `1px solid ${borderColour}`, background: cardBg, color: mutedColour, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {resourceSortHeader('Resource', 'name')}
                        {resourceSortHeader('Region', 'location', 'right')}
                        {resourceSortHeader('Cost', 'cost', 'right')}
                      </div>
                      {sortedFocusResources.map((resource) => (
                        <div key={resource.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 78px 78px', gap: 8, alignItems: 'center', padding: '8px 9px', borderBottom: `1px solid ${borderColour}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <ResourceIconBadge resource={resource} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ ...compactText, fontSize: 11, fontWeight: 900, color: textColour, letterSpacing: '0.1px' }}>{resource.name}</div>
                              <div style={{ ...compactText, fontSize: 9, fontWeight: 700, color: mutedColour, textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{resourceTypeLabel(resource.type)}{resource.skuName ? ` | ${resource.skuName}` : ''}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 10, fontWeight: 800, color: mutedColour }}>{resource.location || '-'}</div>
                          <div style={{ textAlign: 'right', fontSize: 10, fontWeight: 900, color: typeof resource.cost === 'number' ? textColour : mutedColour }}>{formatCost(resource.cost, resource.currency)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: mutedColour, fontSize: 11, fontStyle: 'italic' }}>No resource rows were returned by Azure Resource Graph for this group.</div>
                  )}
                </div>

                <div style={{ borderTop: `1px solid ${borderColour}`, marginTop: 14, paddingTop: 10, fontSize: 10, fontWeight: 700, color: mutedColour, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{selectedSubscription.name}</span>
                  <span>{snapshot.tenant}</span>
                </div>
              </div>
            ) : (
              <div style={{ background: paperBg, border: `1px solid ${borderColour}`, padding: 20, fontFamily: 'Raleway, sans-serif', color: mutedColour, fontSize: 11, fontStyle: 'italic' }}>
                Select a resource group to inspect.
              </div>
            )}
          </div>
        </div>
      </SystemModuleSection>

      {onOpenAuditPack ? (
        <div style={{ marginTop: 4, fontSize: 11, color: mutedColour, fontFamily: 'Raleway, sans-serif' }}>
          Related:{' '}
          <button type="button" onClick={onOpenAuditPack} style={{ border: 0, background: 'transparent', color: colours.highlight, fontWeight: 900, cursor: 'pointer', padding: 0, font: 'inherit', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Audit Pack</button>.
        </div>
      ) : null}
    </section>
  );
};

export default SystemInfrastructureView;
