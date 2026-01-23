import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import {
  Modal,
  Stack,
  Text,
  IconButton,
  mergeStyles,
  Icon,
  Separator,
  Nav,
  INavLink
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import ThemedSpinner from './ThemedSpinner';
import { FixedSizeList, VariableSizeList } from 'react-window';
import DataInspector from './DataInspector';
const DataFlowWorkbench = React.lazy(() => import('./DataFlowWorkbench'));
const DataFlowDiagram = React.lazy(() => import('./DataFlowDiagram'));

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  inspectorData?: unknown;
}

/**
 * AdminDashboard provides a centralized interface for system administration tasks.
 * Includes data flow analysis, file mapping, and application diagnostics.
 */
const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose, inspectorData }) => {
  const { isDarkMode } = useTheme();
  const palette = isDarkMode ? colours.dark : colours.light;
  const [selectedSection, setSelectedSection] = useState<string>('overview');
  type EndpointCheckGroup = 'core' | 'diagnostics' | 'observed';
  type EndpointCheckDefinition = {
    key: string;
    label: string;
    url: string;
    group: EndpointCheckGroup;
    description?: string;
  };
  type EndpointCheckResult = {
    key: string;
    label: string;
    url: string;
    status?: number;
    reachable?: boolean;
    ms?: number;
    error?: string;
    lastCheckedAt?: string;
  };
  const baseEndpointDefinitions = useMemo<EndpointCheckDefinition[]>(
    () => [
      { key: 'release-notes', label: 'Changelog', url: '/api/release-notes', group: 'core', description: 'Loads logs/changelog.md' },
      { key: 'ops', label: 'Ops Log (probe)', url: '/api/ops?limit=1', group: 'diagnostics', description: 'Lightweight ops read' },
      { key: 'file-map', label: 'File Map (probe)', url: '/api/file-map?roots=src&depth=1', group: 'diagnostics', description: 'Lightweight file map' },
    ],
    []
  );
  const [endpointResults, setEndpointResults] = useState<Record<string, EndpointCheckResult>>({});
  const [checkingEndpoints, setCheckingEndpoints] = useState(false);
  const [includeObservedRoutes, setIncludeObservedRoutes] = useState(true);
  const [autoPingEnabled, setAutoPingEnabled] = useState(true);
  const [autoPingIntervalMs, setAutoPingIntervalMs] = useState(30000);
  const [lastHealthCheckAt, setLastHealthCheckAt] = useState<string | null>(null);
  const [pingTick, setPingTick] = useState(false);
  const [fileMap, setFileMap] = useState<{
    totalFiles: number; totalDirs: number; usedFiles: number; usedDirs: number; generatedAt: string; groups: Array<{
      key: string; title: string; root: string; files: number; dirs: number; usedFiles: number; usedDirs: number; sample: Array<{ path: string; used: boolean }>; topBySize: Array<{ path: string; size: number; used: boolean }>; allFiles: Array<{ path: string; used: boolean; size?: number }>; entries: any[]
    }>
  } | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({});
  const [fileSearchTerm, setFileSearchTerm] = useState('');
  const [globalFilter, setGlobalFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  type OpEvent = {
    id: string; ts: string; type: string; action?: string; status?: string; httpStatus?: number; durationMs?: number; url?: string; error?: string; method?: string; enquiryId?: string;
  };
  const [ops, setOps] = useState<OpEvent[] | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [opsFilter, setOpsFilter] = useState<'all' | 'errors' | 'email' | 'function'>('all');
  const [opsAutoRefresh, setOpsAutoRefresh] = useState<boolean>(true);
  const [opsSearchTerm, setOpsSearchTerm] = useState('');
  const [opsIntervalMs, setOpsIntervalMs] = useState(5000);
  const [expandedOpsRows, setExpandedOpsRows] = useState<Record<string, boolean>>({});
  const opsListRef = useRef<VariableSizeList | null>(null);

  const toggleTreeNode = useCallback((path: string) => {
    setTreeExpanded((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  }, []);

  const allDirectoryPaths = useMemo(() => {
    if (!fileMap) return [] as string[];
    const dirs: string[] = [];
    const visit = (nodes: any[]) => {
      nodes.forEach((node) => {
        if (node.kind === 'dir') {
          dirs.push(node.path);
          if (Array.isArray(node.children)) visit(node.children);
        }
      });
    };
    (fileMap.groups || []).forEach((group) => visit(group.entries || []));
    return dirs;
  }, [fileMap]);

  const setAllTreeNodes = useCallback(
    (expanded: boolean) => {
      setTreeExpanded((prev) => {
        if (expanded) {
          const next: Record<string, boolean> = { ...prev };
          allDirectoryPaths.forEach((path) => {
            next[path] = true;
          });
          return next;
        }
        const next: Record<string, boolean> = { ...prev };
        allDirectoryPaths.forEach((path) => {
          if (next[path]) delete next[path];
        });
        return next;
      });
    },
    [allDirectoryPaths]
  );

  type FileRow = {
    key: string;
    name: string;
    depth: number;
    isDir: boolean;
    used: boolean;
    path: string;
    hasChildren: boolean;
  };

  const fileRows = useMemo<FileRow[]>(() => {
    if (!fileMap) return [];
    const rows: FileRow[] = [];
    const search = fileSearchTerm.trim().toLowerCase();
    const filter = globalFilter;

    const matchesFilter = (node: any) => {
      if (filter === 'all') return true;
      const used = !!node.used;
      return filter === 'used' ? used : !used;
    };

    const matchesSearch = (node: any) => {
      if (!search) return true;
      const name = String(node.path || '').toLowerCase();
      return name.includes(search);
    };

    const shouldIncludeNode = (node: any): boolean => {
      if (!node) return false;
      if (matchesFilter(node) && matchesSearch(node)) return true;
      if (node.kind === 'dir' && Array.isArray(node.children)) {
        return node.children.some((child: any) => shouldIncludeNode(child));
      }
      return false;
    };

    const visit = (nodes: any[], depth = 0) => {
      nodes.forEach((node) => {
        if (!shouldIncludeNode(node)) return;
        const isDir = node.kind === 'dir';
        const path = node.path;
        const hasChildren = isDir && Array.isArray(node.children) && node.children.length > 0;
        const expanded = isDir ? !!treeExpanded[path] : false;

        rows.push({
          key: path,
          name: String(path).replace(/^.*?\//, ''),
          depth,
          isDir,
          used: !!node.used,
          path,
          hasChildren,
        });

        if (isDir && expanded && hasChildren) {
          visit(node.children, depth + 1);
        }
      });
    };

    const roots = (fileMap.groups || []).map((g) => ({
      kind: 'dir',
      path: g.root,
      used: g.usedDirs > 0 || g.usedFiles > 0,
      children: g.entries,
    }));

    visit(roots, 0);
    return rows;
  }, [fileMap, fileSearchTerm, globalFilter, treeExpanded]);

  const filteredOps = useMemo(() => {
    if (!ops) return [] as OpEvent[];
    const search = opsSearchTerm.trim().toLowerCase();
    return ops.filter((e) => {
      if (opsFilter === 'errors' && !(e.status === 'error' || (e.httpStatus && e.httpStatus >= 400))) return false;
      if (opsFilter === 'email' && e.type !== 'email') return false;
      if (opsFilter === 'function' && e.type !== 'function') return false;
      if (!search) return true;
      return (
        (e.url || '').toLowerCase().includes(search) ||
        (e.action || '').toLowerCase().includes(search) ||
        (e.type || '').toLowerCase().includes(search)
      );
    });
  }, [ops, opsFilter, opsSearchTerm]);

  const getOpsRowHeight = useCallback(
    (index: number) => {
      const item = filteredOps[index];
      if (!item) return 68;
      return expandedOpsRows[item.id] ? 140 : 68;
    },
    [expandedOpsRows, filteredOps]
  );

  useEffect(() => {
    opsListRef.current?.resetAfterIndex(0, true);
  }, [filteredOps, expandedOpsRows]);

  const exportOps = useCallback(
    (format: 'json' | 'csv') => {
      if (!filteredOps.length) return;
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(filteredOps, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ops-log-${new Date().toISOString()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const headers = ['timestamp', 'type', 'action', 'status', 'httpStatus', 'durationMs', 'url', 'error'];
      const csv = [headers.join(',')]
        .concat(
          filteredOps.map((e) =>
            [
              new Date(e.ts).toISOString(),
              e.type || '',
              e.action || '',
              e.status || '',
              e.httpStatus ?? '',
              e.durationMs ?? '',
              (e.url || '').replace(/"/g, '""'),
              (e.error || '').replace(/"/g, '""'),
            ]
              .map((value) => `"${String(value)}"`)
              .join(',')
          )
        )
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ops-log-${new Date().toISOString()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
    [filteredOps]
  );

  const loadFileMap = useCallback(async () => {
    try {
      setLoadingFiles(true);
      setFileError(null);
  const res = await fetch('/api/file-map?roots=src,api/src,decoupled-functions,server,database,infra,docs&depth=5');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      // Transform server response { ok, roots: [{ root, entries: Tree[] }]} to summary groups
      const groups = (json.roots || []).map((r: any) => {
        const flatten = (nodes: any[]): any[] => {
          const out: any[] = [];
          for (const n of nodes) {
            out.push(n);
            if (n.kind === 'dir' && Array.isArray(n.children)) out.push(...flatten(n.children));
          }
          return out;
        };
        const all = flatten(r.entries || []);
        const files = all.filter((n: any) => n.kind === 'file');
        const dirs = all.filter((n: any) => n.kind === 'dir');
        const usedFiles = files.filter((f:any) => f.used).length;
        const usedDirs = dirs.filter((d:any) => d.used).length;
        const sample = files.slice(0, 5).map((f: any) => ({ path: f.path.replace(/^.*?\//, ''), used: !!f.used }));
        const topBySize = files
          .slice()
          .sort((a: any, b: any) => (b.size || 0) - (a.size || 0))
          .slice(0, 5)
          .map((f: any) => ({ path: f.path.replace(/^.*?\//, ''), size: f.size || 0, used: !!f.used }));
        const allFiles = files.map((f:any) => ({ path: f.path.replace(/^.*?\//, ''), used: !!f.used, size: f.size }));
        return {
          key: r.root,
          title: r.root,
          root: r.root,
          files: files.length,
          dirs: dirs.length,
          usedFiles,
          usedDirs,
          sample,
          topBySize,
          allFiles,
          entries: r.entries || [],
        };
      });
      const totals = groups.reduce((acc: any, g: any) => ({ files: acc.files + g.files, dirs: acc.dirs + g.dirs, ufiles: acc.ufiles + g.usedFiles, udirs: acc.udirs + g.usedDirs }), { files: 0, dirs: 0, ufiles: 0, udirs: 0 });
      setFileMap({ totalFiles: totals.files, totalDirs: totals.dirs, usedFiles: totals.ufiles, usedDirs: totals.udirs, generatedAt: new Date().toISOString(), groups });
    } catch (e) {
      setFileError('Failed to load file map');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSection === 'files' && !fileMap && !loadingFiles) {
      void loadFileMap();
    }
  }, [selectedSection, fileMap, loadingFiles, loadFileMap]);

  const loadOps = useCallback(async () => {
    try {
      setOpsLoading(true);
      setOpsError(null);
      const res = await fetch('/api/ops?limit=200');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setOps(Array.isArray(json.events) ? json.events : []);
    } catch {
      setOpsError('Failed to load operations');
    } finally {
      setOpsLoading(false);
    }
  }, []);

  const observedEndpointDefinitions = useMemo<EndpointCheckDefinition[]>(() => {
    if (!includeObservedRoutes) return [];
    if (!ops || !Array.isArray(ops) || ops.length === 0) return [];
    const baseUrls = new Set(baseEndpointDefinitions.map((d) => d.url));
    const seen = new Map<string, EndpointCheckDefinition>();

    for (const evt of ops) {
      const method = String(evt.method || 'GET').toUpperCase();
      if (method !== 'GET') continue;
      if (!evt.url) continue;

      let url = String(evt.url);
      try {
        const parsed = new URL(url, window.location.origin);
        url = `${parsed.pathname}${parsed.search}`;
      } catch {
        // ignore parse errors and keep raw
      }

      if (!url.startsWith('/api/')) continue;
      if (baseUrls.has(url)) continue;

      // Avoid accidentally pinging endpoints that look like they expect ids or are otherwise risky.
      if (url.includes('{') || url.includes('}')) continue;
      if (url.includes(':')) continue;

      const key = `observed:${url}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label: url,
          url,
          group: 'observed',
          description: 'Observed via Ops log (GET)',
        });
      }
    }

    return Array.from(seen.values()).slice(0, 40);
  }, [includeObservedRoutes, ops, baseEndpointDefinitions]);

  const endpointDefinitions = useMemo<EndpointCheckDefinition[]>(
    () => [...baseEndpointDefinitions, ...observedEndpointDefinitions],
    [baseEndpointDefinitions, observedEndpointDefinitions]
  );

  const getHealthTone = useCallback(
    (r: EndpointCheckResult | undefined): { colour: string; label: string } => {
      if (!r || r.reachable === undefined) return { colour: palette.subText, label: 'unknown' };
      if (!r.reachable) return { colour: '#ef4444', label: 'down' };
      const status = r.status ?? 0;
      if (status >= 500) return { colour: '#ef4444', label: 'error' };
      if (status >= 400) return { colour: isDarkMode ? '#fbbf24' : '#b45309', label: 'auth/missing' };
      return { colour: isDarkMode ? '#4ade80' : '#15803d', label: 'ok' };
    },
    [isDarkMode, palette.subText]
  );

  const overallHealth = useMemo(() => {
    const relevant = endpointDefinitions
      .map((d) => endpointResults[d.key])
      .filter(Boolean) as EndpointCheckResult[];
    if (!relevant.length) return { colour: palette.subText, label: 'unknown' };
    if (relevant.some((r) => r.reachable === false || (r.status && r.status >= 500))) return { colour: '#ef4444', label: 'degraded' };
    if (relevant.some((r) => (r.status && r.status >= 400))) return { colour: isDarkMode ? '#fbbf24' : '#b45309', label: 'mixed' };
    return { colour: isDarkMode ? '#4ade80' : '#15803d', label: 'ok' };
  }, [endpointDefinitions, endpointResults, isDarkMode, palette.subText]);

  const checkEndpoints = useCallback(async (checks?: EndpointCheckDefinition[]) => {
    try {
      setCheckingEndpoints(true);
      const list = (checks && checks.length ? checks : endpointDefinitions);
      const nowIso = new Date().toISOString();
      setLastHealthCheckAt(nowIso);
      setPingTick((t) => !t);

      const results = await Promise.all(
        list.map(async (check) => {
          const start = performance.now();
          try {
            const res = await fetch(check.url, { cache: 'no-store' });
            const ms = Math.round(performance.now() - start);
            return {
              key: check.key,
              label: check.label,
              url: check.url,
              status: res.status,
              reachable: true,
              ms,
              lastCheckedAt: nowIso,
            } as EndpointCheckResult;
          } catch (err) {
            const ms = Math.round(performance.now() - start);
            return {
              key: check.key,
              label: check.label,
              url: check.url,
              reachable: false,
              ms,
              error: err instanceof Error ? err.message : 'Request failed',
              lastCheckedAt: nowIso,
            } as EndpointCheckResult;
          }
        })
      );
      setEndpointResults((prev) => {
        const next = { ...prev };
        results.forEach((r) => {
          next[r.key] = r;
        });
        return next;
      });
    } finally {
      setCheckingEndpoints(false);
    }
  }, [endpointDefinitions]);

  useEffect(() => {
    if (!includeObservedRoutes) return;
    if (selectedSection !== 'health' && selectedSection !== 'overview') return;
    if (ops || opsLoading) return;
    void loadOps();
  }, [includeObservedRoutes, selectedSection, ops, opsLoading, loadOps]);

  useEffect(() => {
    if (selectedSection !== 'health') return;
    if (!autoPingEnabled) return;
    void checkEndpoints(baseEndpointDefinitions);
    const timer = setInterval(() => {
      void checkEndpoints(baseEndpointDefinitions);
    }, autoPingIntervalMs);
    return () => clearInterval(timer);
  }, [selectedSection, autoPingEnabled, autoPingIntervalMs, checkEndpoints, baseEndpointDefinitions]);

  useEffect(() => {
    if (selectedSection === 'ops' && !ops && !opsLoading) {
      void loadOps();
    }
  }, [selectedSection, ops, opsLoading, loadOps]);
  useEffect(() => {
    if (selectedSection !== 'ops') return;
    if (!opsAutoRefresh) return;
    const timer = setInterval(() => {
      void loadOps();
    }, opsIntervalMs);
    return () => clearInterval(timer);
  }, [selectedSection, opsAutoRefresh, opsIntervalMs, loadOps]);

  const modalStyles = {
    main: {
      width: '95vw',
      maxWidth: 1400,
      minHeight: '85vh',
      background: palette.sectionBackground,
      borderRadius: 12,
      padding: 0,
      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)'}`,
      boxShadow: isDarkMode ? '0 18px 42px rgba(2, 6, 23, 0.6)' : '0 18px 42px rgba(15, 23, 42, 0.08)',
    }
  };

  const headerStyle = mergeStyles({
    background: palette.cardBackground,
    padding: '20px 24px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(15,23,42,0.06)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  });

  const contentStyle = mergeStyles({
    display: 'flex',
    height: 'calc(85vh - 80px)',
  });

  const sidebarStyle = mergeStyles({
    width: '220px',
    borderRight: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.05)'}`,
    background: isDarkMode ? 'rgba(15,23,42,0.65)' : 'rgba(241,245,249,0.75)',
    padding: '16px 0',
  });

  const mainContentStyle = mergeStyles({
    flex: 1,
    padding: '24px',
    overflowY: 'auto'
  });

  const focusRingClass = mergeStyles({
    selectors: {
      ':focus-visible': {
        outline: `2px solid ${colours.blue}`,
        outlineOffset: '2px',
      },
    },
  });

  const sectionCardStyle = mergeStyles({
    background: palette.cardBackground,
    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)'}`,
    borderRadius: 8,
    padding: '20px',
    marginBottom: 20,
    boxShadow: isDarkMode ? '0 8px 20px rgba(2,6,23,0.45)' : '0 8px 20px rgba(15,23,42,0.06)',
  });

  const navItems: INavLink[] = [
    {
      name: 'Overview',
      key: 'overview',
      url: '',
      icon: 'ViewDashboard',
      onClick: () => setSelectedSection('overview')
    },
    {
      name: 'Inspector',
      key: 'inspector',
      url: '',
      icon: 'ComplianceAudit',
      onClick: () => setSelectedSection('inspector')
    },
    {
      name: 'Operations',
      key: 'ops',
      url: '',
      icon: 'History',
      onClick: () => setSelectedSection('ops')
    },
    {
      name: 'File Map',
      key: 'files',
      url: '',
      icon: 'FabricFolder',
      onClick: () => setSelectedSection('files')
    },
    {
      name: 'Data Flow',
      key: 'dataflow',
      url: '',
      icon: 'Flow',
      onClick: () => setSelectedSection('dataflow')
    },
    {
      name: 'Health Checks',
      key: 'health',
      url: '',
      icon: 'Health',
      onClick: () => setSelectedSection('health')
    },
    {
      name: 'Diagnostics',
      key: 'diagnostics',
      url: '',
      icon: 'Settings',
      onClick: () => setSelectedSection('diagnostics')
    }
  ];

  const renderContent = () => {
    switch (selectedSection) {
      case 'overview':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Icon iconName="ViewDashboard" style={{ fontSize: 20, color: colours.blue }} />
              <Text variant="xLarge" style={{ fontWeight: 600, color: colours.blue }}>
                Dev Dashboard
              </Text>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              <div className={sectionCardStyle}>
                <h3 style={{ margin: '0 0 10px 0', color: palette.text, fontSize: 16, fontWeight: 600 }}>
                  Environment
                </h3>
                <div style={{ display: 'grid', gap: 8, color: palette.subText, fontSize: 12 }}>
                  <div><strong style={{ color: palette.text }}>URL:</strong> {window.location.origin}</div>
                  <div><strong style={{ color: palette.text }}>Mode:</strong> {process.env.NODE_ENV}</div>
                  <div><strong style={{ color: palette.text }}>Local data:</strong> {String(process.env.REACT_APP_USE_LOCAL_DATA ?? 'unset')}</div>
                </div>
              </div>

              <div className={sectionCardStyle}>
                <h3 style={{ margin: '0 0 12px 0', color: palette.text, fontSize: 16, fontWeight: 600 }}>
                  Quick tools
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => setSelectedSection('inspector')}
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(54,144,206,0.12)',
                      color: colours.blue,
                      border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(54,144,206,0.3)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Open Inspector
                  </button>
                  <button
                    onClick={() => setSelectedSection('ops')}
                    style={{
                      padding: '10px 14px',
                      background: isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.05)',
                      color: palette.text,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.1)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    View Operations
                  </button>
                  <button
                    onClick={() => setSelectedSection('health')}
                    style={{
                      padding: '10px 14px',
                      background: colours.blue,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Run health checks
                  </button>
                </div>
              </div>

              <div className={sectionCardStyle}>
                <h3 style={{ margin: '0 0 10px 0', color: palette.text, fontSize: 16, fontWeight: 600 }}>
                  Endpoint status
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: overallHealth.colour,
                      opacity: pingTick ? 1 : 0.55,
                      transition: 'opacity 180ms ease',
                    }}
                  />
                  <div style={{ fontSize: 12, color: palette.subText }}>
                    Overall: <span style={{ color: palette.text, fontWeight: 600 }}>{overallHealth.label}</span>
                    {lastHealthCheckAt ? (
                      <span style={{ marginLeft: 8, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                        last: {new Date(lastHealthCheckAt).toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {baseEndpointDefinitions.map((def) => {
                    const r = endpointResults[def.key];
                    const tone = getHealthTone(r);
                    return (
                      <div key={def.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: tone.colour }} />
                          <div style={{ display: 'grid', gap: 2 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: palette.text }}>{def.label}</div>
                            <div style={{ fontSize: 11, color: palette.subText, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{def.url}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: palette.subText }}>
                          {r?.ms ? `${r.ms}ms` : '—'} {r?.status ? `• ${r.status}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => void checkEndpoints(baseEndpointDefinitions)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: colours.blue,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: checkingEndpoints ? 0.8 : 1,
                    }}
                  >
                    {checkingEndpoints ? 'Checking…' : 'Check now'}
                  </button>
                  <button
                    onClick={() => setSelectedSection('health')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'inspector':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Icon iconName="ComplianceAudit" style={{ fontSize: 20, color: colours.blue }} />
              <Text variant="xLarge" style={{ fontWeight: 600, color: colours.blue }}>
                Application Inspector
              </Text>
            </div>
            <DataInspector data={inspectorData ?? null} mode="embedded" />
          </div>
        );

      case 'dataflow':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Icon iconName="Flow" style={{ fontSize: 20, color: colours.blue }} />
              <Text variant="xLarge" style={{ fontWeight: 600, color: colours.blue }}>
                Data Flow Analysis
              </Text>
            </div>

            <div className={sectionCardStyle}>
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><ThemedSpinner /></div>}>
                <DataFlowDiagram />
              </Suspense>
            </div>
            <div className={sectionCardStyle}>
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><ThemedSpinner /></div>}>
                <DataFlowWorkbench isOpen={true} onClose={() => {}} embedded={true} />
              </Suspense>
            </div>
          </div>
        );

      case 'files':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Icon iconName="FabricFolder" style={{ fontSize: 20, color: colours.blue }} />
              <Text variant="xLarge" style={{ fontWeight: 600, color: colours.blue }}>
                Application File Mapping
              </Text>
            </div>

            <div className={sectionCardStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, color: palette.text, fontSize: 16, fontWeight: 600 }}>Live File Structure</h3>
                  {fileMap && (
                    <p style={{ margin: '6px 0 0 0', fontSize: 12, color: palette.subText }}>
                      {fileMap.totalFiles} files ({fileMap.usedFiles} used) • {fileMap.totalDirs} folders ({fileMap.usedDirs} used)
                      <span style={{ marginLeft: 6, opacity: 0.7 }}>Generated {new Date(fileMap.generatedAt).toLocaleTimeString()}</span>
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => loadFileMap()}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: colours.blue,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'used', 'unused'] as const).map((filter) => {
                    const isActive = globalFilter === filter;
                    return (
                      <button
                        key={filter}
                        onClick={() => setGlobalFilter(filter)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: `1px solid ${isActive ? colours.blue : (isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.12)')}`,
                          background: isActive ? 'rgba(54,144,206,0.16)' : 'transparent',
                          color: isActive ? colours.blue : palette.text,
                          fontSize: 12,
                          fontWeight: isActive ? 600 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {filter}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="search"
                  value={fileSearchTerm}
                  onChange={(event) => setFileSearchTerm(event.target.value)}
                  placeholder="Search path..."
                  aria-label="Search files"
                  style={{
                    flex: '1 1 200px',
                    minWidth: 200,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                    background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
                    color: palette.text,
                    fontSize: 12,
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setAllTreeNodes(true)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.12)'}`,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Expand all
                  </button>
                  <button
                    onClick={() => setAllTreeNodes(false)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.12)'}`,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              {loadingFiles && (
                <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
                  <ThemedSpinner />
                </div>
              )}
              {fileError && <Text style={{ color: '#ef4444' }}>{fileError}</Text>}

              {fileMap && !fileRows.length && !loadingFiles && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: palette.subText }}>
                  <Text>No files match the selected filters.</Text>
                </div>
              )}

              {fileRows.length > 0 && (
                <div
                  style={{
                    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.12)'}`,
                    borderRadius: 6,
                    background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
                  }}
                >
                  <FixedSizeList
                    height={Math.min(420, Math.max(220, fileRows.length * 32))}
                    itemCount={fileRows.length}
                    itemSize={32}
                    width="100%"
                  >
                    {({ index, style }) => {
                      const row = fileRows[index];
                      const isDir = row.isDir;
                      const expanded = isDir ? !!treeExpanded[row.path] : false;
                      return (
                        <div
                          key={row.key}
                          className={focusRingClass}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (isDir && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault();
                              toggleTreeNode(row.path);
                            }
                            if (isDir && event.key === 'ArrowRight' && !expanded) {
                              event.preventDefault();
                              toggleTreeNode(row.path);
                            }
                            if (isDir && event.key === 'ArrowLeft' && expanded) {
                              event.preventDefault();
                              toggleTreeNode(row.path);
                            }
                          }}
                          style={{
                            ...style,
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: 12 + row.depth * 18,
                            paddingRight: 12,
                            gap: 8,
                            fontSize: 12,
                            color: row.used ? (isDarkMode ? '#4ade80' : '#166534') : palette.text,
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)'}`,
                          }}
                        >
                          {isDir ? (
                            <button
                              onClick={() => toggleTreeNode(row.path)}
                              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.name}`}
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.4)' : 'rgba(15,23,42,0.2)'}`,
                                background: expanded ? 'rgba(54,144,206,0.15)' : 'transparent',
                                color: colours.blue,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {expanded ? '−' : '+'}
                            </button>
                          ) : (
                            <span style={{ width: 22 }} />
                          )}
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.name || row.path}
                          </span>
                          {row.used ? (
                            <span style={{ fontSize: 10, fontWeight: 600, color: row.used ? (isDarkMode ? '#4ade80' : '#166534') : palette.subText }}>
                              used
                            </span>
                          ) : null}
                        </div>
                      );
                    }}
                  </FixedSizeList>
                </div>
              )}
            </div>
          </div>
        );

      case 'health':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Icon iconName="Health" style={{ fontSize: 20, color: colours.blue }} />
              <Text variant="xLarge" style={{ fontWeight: 600, color: colours.blue }}>
                Health Checks
              </Text>
            </div>

            <div className={sectionCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <Text variant="large" style={{ fontWeight: 600, color: palette.text }}>API reachability</Text>
                  <Text style={{ color: palette.subText, fontSize: 12 }}>
                    Quick checks against internal endpoints. Any HTTP response counts as “reachable”; 4xx often means auth/missing rather than “down”.
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: palette.subText, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={includeObservedRoutes}
                      onChange={(e) => setIncludeObservedRoutes(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    include observed routes
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: palette.subText, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoPingEnabled}
                      onChange={(e) => setAutoPingEnabled(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    auto ping
                  </label>
                  <button
                    onClick={() => void checkEndpoints()}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: colours.blue,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: checkingEndpoints ? 0.8 : 1,
                    }}
                  >
                    {checkingEndpoints ? 'Checking…' : 'Run checks'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: overallHealth.colour,
                    opacity: pingTick ? 1 : 0.55,
                    transition: 'opacity 180ms ease',
                  }}
                />
                <div style={{ fontSize: 12, color: palette.subText }}>
                  Overall: <span style={{ color: palette.text, fontWeight: 700 }}>{overallHealth.label}</span>
                  {autoPingEnabled ? (
                    <span style={{ marginLeft: 8 }}>• auto every {Math.round(autoPingIntervalMs / 1000)}s</span>
                  ) : null}
                  {lastHealthCheckAt ? (
                    <span style={{ marginLeft: 8, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                      last: {new Date(lastHealthCheckAt).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
              </div>

              {autoPingEnabled ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 12, color: palette.subText }}>interval:</Text>
                  {[15000, 30000, 60000].map((ms) => (
                    <button
                      key={ms}
                      onClick={() => setAutoPingIntervalMs(ms)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.12)'}`,
                        background: ms === autoPingIntervalMs ? (isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.12)') : 'transparent',
                        color: ms === autoPingIntervalMs ? colours.blue : palette.text,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {Math.round(ms / 1000)}s
                    </button>
                  ))}
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 10 }}>
                {endpointDefinitions
                  .reduce((acc, d) => {
                    const existing = acc.find((g) => g.group === d.group);
                    if (existing) existing.items.push(d);
                    else acc.push({ group: d.group, items: [d] });
                    return acc;
                  }, [] as Array<{ group: EndpointCheckGroup; items: EndpointCheckDefinition[] }>)
                  .map((group) => (
                    <div key={group.group} style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: palette.subText, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {group.group === 'core' ? 'Core' : group.group === 'diagnostics' ? 'Diagnostics' : 'Observed (from Ops GETs)'}
                      </div>
                      {group.items.map((def) => {
                        const r = endpointResults[def.key];
                        const tone = getHealthTone(r);
                        const lastCheckedAt = r?.lastCheckedAt;
                        return (
                          <div key={def.key} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)'}`,
                      background: isDarkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.7)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: tone.colour }} />
                        <div style={{ display: 'grid', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>{def.label}</div>
                            {def.description ? (
                              <div style={{ fontSize: 11, color: palette.subText }}>{def.description}</div>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 11, color: palette.subText, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{def.url}</div>
                          {r?.error && <div style={{ fontSize: 11, color: '#ef4444' }}>{r.error}</div>}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: palette.subText, textAlign: 'right' }}>
                        <div>{r?.status ?? (r?.reachable === false ? 'ERR' : '—')}</div>
                        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{r?.ms ? `${r.ms}ms` : '—'}</div>
                        <div style={{ fontSize: 10, color: palette.subText, marginTop: 2 }}>
                          {typeof lastCheckedAt === 'string' ? new Date(lastCheckedAt).toLocaleTimeString() : '—'}
                        </div>
                      </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );

      case 'diagnostics':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Icon iconName="Settings" style={{ fontSize: 20, color: colours.blue }} />
              <Text variant="xLarge" style={{ fontWeight: 600, color: colours.blue }}>
                Diagnostics
              </Text>
            </div>

            <div className={sectionCardStyle}>
              <Text style={{ color: palette.subText }}>
                This space is for safe, read-only diagnostics: environment flags, client-side storage, and quick links into Inspector / Ops / File Map.
              </Text>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)'}`,
                  background: isDarkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.7)',
                  fontSize: 12,
                  color: palette.text,
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Client flags</div>
                  <div style={{ display: 'grid', gap: 4, color: palette.subText }}>
                    <div><strong style={{ color: palette.text }}>NODE_ENV:</strong> {process.env.NODE_ENV}</div>
                    <div><strong style={{ color: palette.text }}>REACT_APP_USE_LOCAL_DATA:</strong> {String(process.env.REACT_APP_USE_LOCAL_DATA ?? 'unset')}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedSection('inspector')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(54,144,206,0.3)'}`,
                      background: 'rgba(54,144,206,0.12)',
                      color: colours.blue,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Open Inspector
                  </button>
                  <button
                    onClick={() => setSelectedSection('ops')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    View Ops
                  </button>
                  <button
                    onClick={() => setSelectedSection('files')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    File Map
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'ops':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Icon iconName="History" style={{ fontSize: 20, color: colours.blue }} />
              <Text variant="xLarge" style={{ fontWeight: 600, color: colours.blue }}>
                Operations Log
              </Text>
            </div>

            <div className={sectionCardStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'errors', 'email', 'function'] as const).map((filter) => {
                    const isActive = opsFilter === filter;
                    return (
                      <button
                        key={filter}
                        onClick={() => setOpsFilter(filter)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: `1px solid ${isActive ? colours.blue : (isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)')}`,
                          background: isActive ? 'rgba(54,144,206,0.15)' : 'transparent',
                          color: isActive ? colours.blue : palette.text,
                          fontSize: 12,
                          fontWeight: isActive ? 600 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {filter}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: palette.subText }}>
                    <input
                      type="checkbox"
                      checked={opsAutoRefresh}
                      onChange={(event) => setOpsAutoRefresh(event.target.checked)}
                    />
                    Auto-refresh
                  </label>
                  <select
                    value={opsIntervalMs}
                    onChange={(event) => setOpsIntervalMs(Number(event.target.value))}
                    aria-label="Auto refresh interval"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                      background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
                      color: palette.text,
                      fontSize: 12,
                    }}
                  >
                    <option value={3000}>3s</option>
                    <option value={5000}>5s</option>
                    <option value={10000}>10s</option>
                    <option value={30000}>30s</option>
                  </select>
                  <button
                    onClick={() => loadOps()}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: colours.blue,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <input
                  type="search"
                  value={opsSearchTerm}
                  onChange={(event) => setOpsSearchTerm(event.target.value)}
                  placeholder="Filter operations..."
                  aria-label="Filter operations"
                  style={{
                    flex: '1 1 240px',
                    minWidth: 220,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                    background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
                    color: palette.text,
                    fontSize: 12,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => exportOps('json')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => exportOps('csv')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.12)'}`,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {opsLoading && (
                <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
                  <ThemedSpinner />
                </div>
              )}
              {opsError && <Text style={{ color: '#ef4444' }}>{opsError}</Text>}

              {!filteredOps.length && !opsLoading && (
                <div style={{ textAlign: 'center', padding: '36px 0', color: palette.subText }}>
                  <Text>No operations recorded yet.</Text>
                </div>
              )}

              {filteredOps.length > 0 && (
                <div
                  style={{
                    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.12)'}`,
                    borderRadius: 6,
                    background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 100px 140px 80px 80px 80px 1fr 60px',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      padding: '10px 14px',
                      color: palette.subText,
                      borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(15,23,42,0.08)'}`,
                    }}
                  >
                    <span>Time</span>
                    <span>Type</span>
                    <span>Action</span>
                    <span>Status</span>
                    <span>HTTP</span>
                    <span>Duration</span>
                    <span>Details</span>
                    <span style={{ textAlign: 'right' }}>Info</span>
                  </div>
                  <VariableSizeList
                    ref={opsListRef}
                    height={Math.min(480, Math.max(240, filteredOps.length * 68))}
                    itemCount={filteredOps.length}
                    width="100%"
                    itemSize={getOpsRowHeight}
                  >
                    {({ index, style }) => {
                      const event = filteredOps[index];
                      const expanded = !!expandedOpsRows[event.id];
                      const statusError = event.status === 'error' || (event.httpStatus && event.httpStatus >= 400);
                      const statusSuccess = event.status === 'success' || (event.httpStatus && event.httpStatus < 300);
                      return (
                        <div
                          key={event.id}
                          tabIndex={0}
                          aria-expanded={expanded}
                          className={focusRingClass}
                          onKeyDown={(evt) => {
                            if (evt.key === 'Enter' || evt.key === ' ') {
                              evt.preventDefault();
                              setExpandedOpsRows((prev) => ({
                                ...prev,
                                [event.id]: !expanded,
                              }));
                              if (opsListRef.current) {
                                opsListRef.current.resetAfterIndex(index);
                              }
                            }
                          }}
                          style={{
                            ...style,
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            padding: '10px 14px',
                            fontSize: 12,
                            color: palette.text,
                            background: expanded
                              ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)')
                              : 'transparent',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '140px 100px 140px 80px 80px 80px 1fr 60px',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span>{new Date(event.ts).toLocaleTimeString()}</span>
                            <span>{event.type}</span>
                            <span>{event.action || '—'}</span>
                            <span
                              style={{
                                color: statusError ? '#ef4444' : statusSuccess ? (isDarkMode ? '#4ade80' : '#15803d') : palette.subText,
                                fontWeight: 600,
                              }}
                            >
                              {event.status || '—'}
                            </span>
                            <span>{event.httpStatus ?? '—'}</span>
                            <span>{event.durationMs ? `${event.durationMs}ms` : '—'}</span>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {event.enquiryId ? `enquiry ${event.enquiryId} • ` : ''}
                              {event.url || event.error || '—'}
                            </span>
                            <div style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => {
                                  setExpandedOpsRows((prev) => ({
                                    ...prev,
                                    [event.id]: !expanded,
                                  }));
                                  if (opsListRef.current) {
                                    opsListRef.current.resetAfterIndex(index);
                                  }
                                }}
                                aria-expanded={expanded}
                                style={{
                                  padding: '4px 6px',
                                  borderRadius: 6,
                                  border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.12)'}`,
                                  background: 'transparent',
                                  color: palette.text,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                              >
                                {expanded ? 'Hide' : 'View'}
                              </button>
                            </div>
                          </div>
                          {expanded && (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(15,23,42,0.08)'}`,
                                display: 'grid',
                                gap: 8,
                              }}
                            >
                              {event.url && (
                                <div>
                                  <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>Request</strong>
                                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11, wordBreak: 'break-all' }}>{event.method || 'GET'} {event.url}</div>
                                </div>
                              )}
                              {event.error && (
                                <div>
                                  <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: '#ef4444' }}>Error</strong>
                                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11, wordBreak: 'break-word' }}>{event.error}</div>
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => navigator.clipboard.writeText(JSON.stringify(event, null, 2))}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(15,23,42,0.1)'}`,
                                    background: 'transparent',
                                    color: palette.text,
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Copy JSON
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  </VariableSizeList>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onDismiss={onClose}
        styles={modalStyles}
        dragOptions={undefined}
      >
        <div className={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon iconName="Admin" style={{ fontSize: 20, color: '#3690CE' }} />
            <Text variant="xLarge" style={{ fontWeight: 600, color: '#3690CE' }}>
              Dev Dashboard
            </Text>
          </div>
          <IconButton
            iconProps={{ iconName: 'ChromeClose' }}
            ariaLabel="Close dev dashboard"
            onClick={onClose}
            styles={{
              root: {
                borderRadius: 6,
                width: 32,
                height: 32,
                color: isDarkMode ? '#a0aec0' : '#4a5568'
              },
              rootHovered: {
                background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
              }
            }}
          />
        </div>

        <div className={contentStyle}>
          <div className={sidebarStyle}>
            <Nav
              groups={[
                {
                  links: navItems
                }
              ]}
              selectedKey={selectedSection}
              ariaLabel="Dev dashboard sections"
              styles={{
                root: {
                  background: 'transparent',
                },
                link: {
                  background: 'transparent',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '13px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  margin: '2px 8px',
                  selectors: {
                    ':hover': {
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      color: isDarkMode ? colours.dark.text : colours.light.text
                    },
                    '&:focus-visible': {
                      outline: `2px solid ${colours.blue}`,
                      outlineOffset: '2px',
                    },
                    '.is-selected': {
                      background: 'rgba(54, 144, 206, 0.1)',
                      color: '#3690CE'
                    },
                    '.is-selected:hover': {
                      background: 'rgba(54, 144, 206, 0.15)',
                      color: '#3690CE'
                    }
                  }
                }
              }}
            />
          </div>

          <div className={mainContentStyle}>
            {renderContent()}
          </div>
        </div>
      </Modal>

    </>
  );
};

export default AdminDashboard;