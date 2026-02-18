import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Modal } from '@fluentui/react';
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

const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'inspector', label: 'Inspector' },
  { key: 'ops', label: 'Operations' },
  { key: 'files', label: 'File Map' },
  { key: 'dataflow', label: 'Data Flow' },
  { key: 'health', label: 'Health' },
  { key: 'diagnostics', label: 'Diagnostics' },
] as const;

/**
 * AdminDashboard — centralized dev tooling interface.
 * Health checks, ops log, file map, inspector, data flow.
 */
const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose, inspectorData }) => {
  const { isDarkMode } = useTheme();
  const [selectedSection, setSelectedSection] = useState<string>('overview');

  // ── Derived tokens ──────────────────────────────────────────
  const bg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const cardBg = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textSecondary = isDarkMode ? colours.dark.subText : colours.greyText;
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderCol = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
  const borderLight = isDarkMode ? colours.dark.border : colours.highlightNeutral;
  const inputBg = isDarkMode ? colours.dark.inputBackground : '#fff';

  // Status colours — brand tokens only
  const statusOk = colours.green;
  const statusError = colours.cta;
  const statusWarn = colours.orange;

  // ── Endpoint health state ───────────────────────────────────
  type EndpointCheckGroup = 'core' | 'diagnostics' | 'observed';
  type EndpointCheckDefinition = {
    key: string; label: string; url: string; group: EndpointCheckGroup; description?: string;
  };
  type EndpointCheckResult = {
    key: string; label: string; url: string; status?: number; reachable?: boolean; ms?: number; error?: string; lastCheckedAt?: string;
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

  // ── File map state ──────────────────────────────────────────
  const [fileMap, setFileMap] = useState<{
    totalFiles: number; totalDirs: number; usedFiles: number; usedDirs: number; generatedAt: string; groups: Array<{
      key: string; title: string; root: string; files: number; dirs: number; usedFiles: number; usedDirs: number;
      sample: Array<{ path: string; used: boolean }>; topBySize: Array<{ path: string; size: number; used: boolean }>;
      allFiles: Array<{ path: string; used: boolean; size?: number }>; entries: any[]
    }>
  } | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({});
  const [fileSearchTerm, setFileSearchTerm] = useState('');
  const [globalFilter, setGlobalFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Ops log state ───────────────────────────────────────────
  type OpEvent = {
    id: string; ts: string; type: string; action?: string; status?: string; httpStatus?: number;
    durationMs?: number; url?: string; error?: string; method?: string; enquiryId?: string;
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

  // ── Tree helpers ────────────────────────────────────────────
  const toggleTreeNode = useCallback((path: string) => {
    setTreeExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
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
        const next: Record<string, boolean> = { ...prev };
        if (expanded) {
          allDirectoryPaths.forEach((path) => { next[path] = true; });
        } else {
          allDirectoryPaths.forEach((path) => { if (next[path]) delete next[path]; });
        }
        return next;
      });
    },
    [allDirectoryPaths]
  );

  type FileRow = { key: string; name: string; depth: number; isDir: boolean; used: boolean; path: string; hasChildren: boolean; };

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
      return String(node.path || '').toLowerCase().includes(search);
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
        rows.push({ key: path, name: String(path).replace(/^.*?\//, ''), depth, isDir, used: !!node.used, path, hasChildren });
        if (isDir && expanded && hasChildren) visit(node.children, depth + 1);
      });
    };

    const roots = (fileMap.groups || []).map((g) => ({
      kind: 'dir', path: g.root, used: g.usedDirs > 0 || g.usedFiles > 0, children: g.entries,
    }));
    visit(roots, 0);
    return rows;
  }, [fileMap, fileSearchTerm, globalFilter, treeExpanded]);

  // ── Filtered ops ────────────────────────────────────────────
  const filteredOps = useMemo(() => {
    if (!ops) return [] as OpEvent[];
    const search = opsSearchTerm.trim().toLowerCase();
    return ops.filter((e) => {
      if (opsFilter === 'errors' && !(e.status === 'error' || (e.httpStatus && e.httpStatus >= 400))) return false;
      if (opsFilter === 'email' && e.type !== 'email') return false;
      if (opsFilter === 'function' && e.type !== 'function') return false;
      if (!search) return true;
      return (e.url || '').toLowerCase().includes(search) || (e.action || '').toLowerCase().includes(search) || (e.type || '').toLowerCase().includes(search);
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

  useEffect(() => { opsListRef.current?.resetAfterIndex(0, true); }, [filteredOps, expandedOpsRows]);

  const exportOps = useCallback(
    (format: 'json' | 'csv') => {
      if (!filteredOps.length) return;
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(filteredOps, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `ops-log-${new Date().toISOString()}.json`; link.click();
        URL.revokeObjectURL(url);
        return;
      }
      const headers = ['timestamp', 'type', 'action', 'status', 'httpStatus', 'durationMs', 'url', 'error'];
      const csv = [headers.join(',')]
        .concat(
          filteredOps.map((e) =>
            [new Date(e.ts).toISOString(), e.type || '', e.action || '', e.status || '', e.httpStatus ?? '', e.durationMs ?? '', (e.url || '').replace(/"/g, '""'), (e.error || '').replace(/"/g, '""')]
              .map((value) => `"${String(value)}"`)
              .join(',')
          )
        )
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `ops-log-${new Date().toISOString()}.csv`; link.click();
      URL.revokeObjectURL(url);
    },
    [filteredOps]
  );

  // ── Data loaders ────────────────────────────────────────────
  const loadFileMap = useCallback(async () => {
    try {
      setLoadingFiles(true); setFileError(null);
      const res = await fetch('/api/file-map?roots=src,api/src,decoupled-functions,server,database,infra,docs&depth=5');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const groups = (json.roots || []).map((r: any) => {
        const flatten = (nodes: any[]): any[] => {
          const out: any[] = [];
          for (const n of nodes) { out.push(n); if (n.kind === 'dir' && Array.isArray(n.children)) out.push(...flatten(n.children)); }
          return out;
        };
        const all = flatten(r.entries || []);
        const files = all.filter((n: any) => n.kind === 'file');
        const dirs = all.filter((n: any) => n.kind === 'dir');
        const usedFiles = files.filter((f: any) => f.used).length;
        const usedDirs = dirs.filter((d: any) => d.used).length;
        const sample = files.slice(0, 5).map((f: any) => ({ path: f.path.replace(/^.*?\//, ''), used: !!f.used }));
        const topBySize = files.slice().sort((a: any, b: any) => (b.size || 0) - (a.size || 0)).slice(0, 5).map((f: any) => ({ path: f.path.replace(/^.*?\//, ''), size: f.size || 0, used: !!f.used }));
        const allFiles = files.map((f: any) => ({ path: f.path.replace(/^.*?\//, ''), used: !!f.used, size: f.size }));
        return { key: r.root, title: r.root, root: r.root, files: files.length, dirs: dirs.length, usedFiles, usedDirs, sample, topBySize, allFiles, entries: r.entries || [] };
      });
      const totals = groups.reduce((acc: any, g: any) => ({ files: acc.files + g.files, dirs: acc.dirs + g.dirs, ufiles: acc.ufiles + g.usedFiles, udirs: acc.udirs + g.usedDirs }), { files: 0, dirs: 0, ufiles: 0, udirs: 0 });
      setFileMap({ totalFiles: totals.files, totalDirs: totals.dirs, usedFiles: totals.ufiles, usedDirs: totals.udirs, generatedAt: new Date().toISOString(), groups });
    } catch {
      setFileError('Failed to load file map');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const loadOps = useCallback(async () => {
    try {
      setOpsLoading(true); setOpsError(null);
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

  // ── Observed endpoints from ops GET requests ────────────────
  const observedEndpointDefinitions = useMemo<EndpointCheckDefinition[]>(() => {
    if (!includeObservedRoutes || !ops || !Array.isArray(ops) || ops.length === 0) return [];
    const baseUrls = new Set(baseEndpointDefinitions.map((d) => d.url));
    const seen = new Map<string, EndpointCheckDefinition>();
    for (const evt of ops) {
      const method = String(evt.method || 'GET').toUpperCase();
      if (method !== 'GET' || !evt.url) continue;
      let url = String(evt.url);
      try { const parsed = new URL(url, window.location.origin); url = `${parsed.pathname}${parsed.search}`; } catch { /* keep raw */ }
      if (!url.startsWith('/api/') || baseUrls.has(url) || url.includes('{') || url.includes('}') || url.includes(':')) continue;
      const key = `observed:${url}`;
      if (!seen.has(key)) seen.set(key, { key, label: url, url, group: 'observed', description: 'Observed via Ops log (GET)' });
    }
    return Array.from(seen.values()).slice(0, 40);
  }, [includeObservedRoutes, ops, baseEndpointDefinitions]);

  const endpointDefinitions = useMemo<EndpointCheckDefinition[]>(
    () => [...baseEndpointDefinitions, ...observedEndpointDefinitions],
    [baseEndpointDefinitions, observedEndpointDefinitions]
  );

  const getHealthTone = useCallback(
    (r: EndpointCheckResult | undefined): { colour: string; label: string } => {
      if (!r || r.reachable === undefined) return { colour: textMuted, label: 'unknown' };
      if (!r.reachable) return { colour: statusError, label: 'down' };
      const status = r.status ?? 0;
      if (status >= 500) return { colour: statusError, label: 'error' };
      if (status >= 400) return { colour: statusWarn, label: 'auth/missing' };
      return { colour: statusOk, label: 'ok' };
    },
    [textMuted, statusError, statusWarn, statusOk]
  );

  const overallHealth = useMemo(() => {
    const relevant = endpointDefinitions.map((d) => endpointResults[d.key]).filter(Boolean) as EndpointCheckResult[];
    if (!relevant.length) return { colour: textMuted, label: 'unknown' };
    if (relevant.some((r) => r.reachable === false || (r.status && r.status >= 500))) return { colour: statusError, label: 'degraded' };
    if (relevant.some((r) => r.status && r.status >= 400)) return { colour: statusWarn, label: 'mixed' };
    return { colour: statusOk, label: 'ok' };
  }, [endpointDefinitions, endpointResults, textMuted, statusError, statusWarn, statusOk]);

  const checkEndpoints = useCallback(async (checks?: EndpointCheckDefinition[]) => {
    try {
      setCheckingEndpoints(true);
      const list = checks && checks.length ? checks : endpointDefinitions;
      const nowIso = new Date().toISOString();
      setLastHealthCheckAt(nowIso);
      setPingTick((t) => !t);
      const results = await Promise.all(
        list.map(async (check) => {
          const start = performance.now();
          try {
            const res = await fetch(check.url, { cache: 'no-store' });
            const ms = Math.round(performance.now() - start);
            return { key: check.key, label: check.label, url: check.url, status: res.status, reachable: true, ms, lastCheckedAt: nowIso } as EndpointCheckResult;
          } catch (err) {
            const ms = Math.round(performance.now() - start);
            return { key: check.key, label: check.label, url: check.url, reachable: false, ms, error: err instanceof Error ? err.message : 'Request failed', lastCheckedAt: nowIso } as EndpointCheckResult;
          }
        })
      );
      setEndpointResults((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.key] = r; });
        return next;
      });
    } finally {
      setCheckingEndpoints(false);
    }
  }, [endpointDefinitions]);

  // ── Auto-loaders ────────────────────────────────────────────
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
    const timer = setInterval(() => { void checkEndpoints(baseEndpointDefinitions); }, autoPingIntervalMs);
    return () => clearInterval(timer);
  }, [selectedSection, autoPingEnabled, autoPingIntervalMs, checkEndpoints, baseEndpointDefinitions]);

  useEffect(() => {
    if (selectedSection === 'files' && !fileMap && !loadingFiles) void loadFileMap();
  }, [selectedSection, fileMap, loadingFiles, loadFileMap]);

  useEffect(() => {
    if (selectedSection === 'ops' && !ops && !opsLoading) void loadOps();
  }, [selectedSection, ops, opsLoading, loadOps]);

  useEffect(() => {
    if (selectedSection !== 'ops' || !opsAutoRefresh) return;
    const timer = setInterval(() => { void loadOps(); }, opsIntervalMs);
    return () => clearInterval(timer);
  }, [selectedSection, opsAutoRefresh, opsIntervalMs, loadOps]);

  // ── Shared inline styles ────────────────────────────────────
  const card: React.CSSProperties = {
    background: cardBg,
    border: `1px solid ${borderCol}`,
    borderRadius: 0,
    padding: 16,
    marginBottom: 16,
  };

  const btnPrimary: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 0, border: 'none',
    background: colours.blue, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 0,
    border: `1px solid ${borderCol}`, background: 'transparent',
    color: textPrimary, fontSize: 11, fontWeight: 500, cursor: 'pointer',
  };
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 0, fontSize: 11, fontWeight: active ? 600 : 500, cursor: 'pointer',
    border: `1px solid ${active ? colours.blue : borderCol}`,
    background: active ? `${colours.blue}18` : 'transparent',
    color: active ? colours.blue : textPrimary,
  });
  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 0, fontSize: 11,
    border: `1px solid ${borderCol}`, background: inputBg, color: textPrimary,
  };
  const sectionHeading: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 14,
    display: 'flex', alignItems: 'center', gap: 8,
  };
  const monoSmall: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 10 };

  // ── Render helpers ──────────────────────────────────────────
  const HealthDot: React.FC<{ colour: string; pulse?: boolean }> = ({ colour, pulse }) => (
    <span style={{ width: 8, height: 8, borderRadius: 999, background: colour, flexShrink: 0, opacity: pulse !== undefined ? (pulse ? 1 : 0.5) : 1, transition: 'opacity 180ms ease' }} />
  );

  const renderContent = () => {
    switch (selectedSection) {

      // ── Overview ──────────────────────────────────────────
      case 'overview':
        return (
          <>
            <div style={sectionHeading}>Overview</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              {/* Environment */}
              <div style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Environment</div>
                <div style={{ display: 'grid', gap: 6, fontSize: 11, color: textSecondary }}>
                  <div><span style={{ color: textPrimary, fontWeight: 600 }}>URL:</span> {window.location.origin}</div>
                  <div><span style={{ color: textPrimary, fontWeight: 600 }}>Mode:</span> {process.env.NODE_ENV}</div>
                  <div><span style={{ color: textPrimary, fontWeight: 600 }}>Local data:</span> {String(process.env.REACT_APP_USE_LOCAL_DATA ?? 'unset')}</div>
                </div>
              </div>

              {/* Quick tools */}
              <div style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Quick Tools</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => setSelectedSection('inspector')} style={btnSecondary}>Open Inspector</button>
                  <button onClick={() => setSelectedSection('ops')} style={btnSecondary}>View Operations</button>
                  <button onClick={() => { void checkEndpoints(baseEndpointDefinitions); setSelectedSection('health'); }} style={btnPrimary}>Run Health Checks</button>
                </div>
              </div>

              {/* Endpoint status */}
              <div style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Endpoint Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <HealthDot colour={overallHealth.colour} pulse={pingTick} />
                  <span style={{ fontSize: 11, color: textSecondary }}>
                    Overall: <strong style={{ color: textPrimary }}>{overallHealth.label}</strong>
                    {lastHealthCheckAt && <span style={{ ...monoSmall, marginLeft: 8 }}>last: {new Date(lastHealthCheckAt).toLocaleTimeString()}</span>}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {baseEndpointDefinitions.map((def) => {
                    const r = endpointResults[def.key];
                    const tone = getHealthTone(r);
                    return (
                      <div key={def.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <HealthDot colour={tone.colour} />
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>{def.label}</div>
                            <div style={{ ...monoSmall, color: textMuted }}>{def.url}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: textMuted }}>{r?.ms ? `${r.ms}ms` : '—'} {r?.status ? `• ${r.status}` : ''}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <button onClick={() => void checkEndpoints(baseEndpointDefinitions)} style={btnPrimary} disabled={checkingEndpoints}>
                    {checkingEndpoints ? 'Checking…' : 'Check now'}
                  </button>
                  <button onClick={() => setSelectedSection('health')} style={btnSecondary}>Details</button>
                </div>
              </div>
            </div>
          </>
        );

      // ── Inspector ─────────────────────────────────────────
      case 'inspector':
        return (
          <>
            <div style={sectionHeading}>Application Inspector</div>
            <DataInspector data={inspectorData ?? null} mode="embedded" />
          </>
        );

      // ── Data Flow ─────────────────────────────────────────
      case 'dataflow':
        return (
          <>
            <div style={sectionHeading}>Data Flow Analysis</div>
            <div style={card}>
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><ThemedSpinner /></div>}>
                <DataFlowDiagram />
              </Suspense>
            </div>
            <div style={card}>
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><ThemedSpinner /></div>}>
                <DataFlowWorkbench isOpen={true} onClose={() => {}} embedded={true} />
              </Suspense>
            </div>
          </>
        );

      // ── File Map ──────────────────────────────────────────
      case 'files':
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={sectionHeading}>File Map</div>
                {fileMap && (
                  <div style={{ fontSize: 11, color: textMuted, marginTop: -10 }}>
                    {fileMap.totalFiles} files ({fileMap.usedFiles} used) · {fileMap.totalDirs} folders ({fileMap.usedDirs} used)
                    <span style={{ opacity: 0.7, marginLeft: 6 }}>@ {new Date(fileMap.generatedAt).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
              <button onClick={() => loadFileMap()} style={btnPrimary}>Refresh</button>
            </div>

            <div style={card}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['all', 'used', 'unused'] as const).map((f) => (
                    <button key={f} onClick={() => setGlobalFilter(f)} style={chipStyle(globalFilter === f)}>{f}</button>
                  ))}
                </div>
                <input type="search" value={fileSearchTerm} onChange={(e) => setFileSearchTerm(e.target.value)} placeholder="Search path…" aria-label="Search files" style={{ ...inputStyle, flex: '1 1 180px', minWidth: 180 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setAllTreeNodes(true)} style={btnSecondary}>Expand all</button>
                  <button onClick={() => setAllTreeNodes(false)} style={btnSecondary}>Collapse all</button>
                </div>
              </div>

              {loadingFiles && <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><ThemedSpinner /></div>}
              {fileError && <div style={{ fontSize: 11, color: statusError }}>{fileError}</div>}
              {fileMap && !fileRows.length && !loadingFiles && <div style={{ textAlign: 'center', padding: 20, color: textMuted, fontSize: 11 }}>No files match filters.</div>}

              {fileRows.length > 0 && (
                <div style={{ border: `1px solid ${borderLight}`, borderRadius: 0, background: isDarkMode ? colours.dark.background : '#fff' }}>
                  <FixedSizeList height={Math.min(420, Math.max(220, fileRows.length * 32))} itemCount={fileRows.length} itemSize={32} width="100%">
                    {({ index, style }) => {
                      const row = fileRows[index];
                      const isDir = row.isDir;
                      const expanded = isDir ? !!treeExpanded[row.path] : false;
                      return (
                        <div
                          key={row.key}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (isDir && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleTreeNode(row.path); }
                            if (isDir && e.key === 'ArrowRight' && !expanded) { e.preventDefault(); toggleTreeNode(row.path); }
                            if (isDir && e.key === 'ArrowLeft' && expanded) { e.preventDefault(); toggleTreeNode(row.path); }
                          }}
                          style={{
                            ...style,
                            display: 'flex', alignItems: 'center', paddingLeft: 10 + row.depth * 18, paddingRight: 10, gap: 6,
                            fontSize: 11, color: row.used ? statusOk : textPrimary,
                            borderBottom: `1px solid ${isDarkMode ? `${colours.dark.border}40` : `${colours.highlightNeutral}80`}`,
                          }}
                        >
                          {isDir ? (
                            <button
                              onClick={() => toggleTreeNode(row.path)}
                              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.name}`}
                              style={{
                                width: 18, height: 18, borderRadius: 0, border: `1px solid ${borderCol}`,
                                background: expanded ? `${colours.blue}18` : 'transparent', color: colours.blue,
                                fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {expanded ? '−' : '+'}
                            </button>
                          ) : <span style={{ width: 18 }} />}
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name || row.path}</span>
                          {row.used && <span style={{ fontSize: 9, fontWeight: 600, color: statusOk }}>used</span>}
                        </div>
                      );
                    }}
                  </FixedSizeList>
                </div>
              )}
            </div>
          </>
        );

      // ── Health Checks ─────────────────────────────────────
      case 'health':
        return (
          <>
            <div style={sectionHeading}>Health Checks</div>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>API Reachability</div>
                  <div style={{ fontSize: 10, color: textMuted }}>Any HTTP response = reachable. 4xx = auth/missing, not necessarily down.</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: textMuted, cursor: 'pointer' }}>
                    <input type="checkbox" checked={includeObservedRoutes} onChange={(e) => setIncludeObservedRoutes(e.target.checked)} style={{ cursor: 'pointer' }} /> observed routes
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: textMuted, cursor: 'pointer' }}>
                    <input type="checkbox" checked={autoPingEnabled} onChange={(e) => setAutoPingEnabled(e.target.checked)} style={{ cursor: 'pointer' }} /> auto ping
                  </label>
                  <button onClick={() => void checkEndpoints()} style={btnPrimary} disabled={checkingEndpoints}>
                    {checkingEndpoints ? 'Checking…' : 'Run checks'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <HealthDot colour={overallHealth.colour} pulse={pingTick} />
                <span style={{ fontSize: 11, color: textSecondary }}>
                  Overall: <strong style={{ color: textPrimary }}>{overallHealth.label}</strong>
                  {autoPingEnabled && <span> · auto every {Math.round(autoPingIntervalMs / 1000)}s</span>}
                  {lastHealthCheckAt && <span style={{ ...monoSmall, marginLeft: 8 }}>last: {new Date(lastHealthCheckAt).toLocaleTimeString()}</span>}
                </span>
              </div>

              {autoPingEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: textMuted }}>interval:</span>
                  {[15000, 30000, 60000].map((ms) => (
                    <button key={ms} onClick={() => setAutoPingIntervalMs(ms)} style={chipStyle(ms === autoPingIntervalMs)}>{Math.round(ms / 1000)}s</button>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                {endpointDefinitions
                  .reduce((acc, d) => {
                    const existing = acc.find((g) => g.group === d.group);
                    if (existing) existing.items.push(d); else acc.push({ group: d.group, items: [d] });
                    return acc;
                  }, [] as Array<{ group: EndpointCheckGroup; items: EndpointCheckDefinition[] }>)
                  .map((group) => (
                    <div key={group.group} style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {group.group === 'core' ? 'Core' : group.group === 'diagnostics' ? 'Diagnostics' : 'Observed (from Ops GETs)'}
                      </div>
                      {group.items.map((def) => {
                        const r = endpointResults[def.key];
                        const tone = getHealthTone(r);
                        return (
                          <div key={def.key} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            padding: '8px 10px', border: `1px solid ${borderLight}`, borderRadius: 0, background: isDarkMode ? colours.dark.background : '#fff',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <HealthDot colour={tone.colour} />
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>{def.label}</span>
                                  {def.description && <span style={{ fontSize: 10, color: textMuted }}>{def.description}</span>}
                                </div>
                                <div style={{ ...monoSmall, color: textMuted }}>{def.url}</div>
                                {r?.error && <div style={{ fontSize: 10, color: statusError }}>{r.error}</div>}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: textMuted, textAlign: 'right' }}>
                              <div>{r?.status ?? (r?.reachable === false ? 'ERR' : '—')}</div>
                              <div style={monoSmall}>{r?.ms ? `${r.ms}ms` : '—'}</div>
                              <div style={{ fontSize: 9, color: textMuted, marginTop: 2 }}>
                                {typeof r?.lastCheckedAt === 'string' ? new Date(r.lastCheckedAt).toLocaleTimeString() : '—'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            </div>
          </>
        );

      // ── Diagnostics ───────────────────────────────────────
      case 'diagnostics':
        return (
          <>
            <div style={sectionHeading}>Diagnostics</div>
            <div style={card}>
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 12 }}>
                Read-only diagnostics: environment flags, client-side storage, and quick links.
              </div>
              <div style={{
                padding: '10px 12px', border: `1px solid ${borderLight}`, borderRadius: 0,
                background: isDarkMode ? colours.dark.background : '#fff', fontSize: 11, color: textPrimary, marginBottom: 12,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Client flags</div>
                <div style={{ display: 'grid', gap: 4, color: textSecondary }}>
                  <div><strong style={{ color: textPrimary }}>NODE_ENV:</strong> {process.env.NODE_ENV}</div>
                  <div><strong style={{ color: textPrimary }}>REACT_APP_USE_LOCAL_DATA:</strong> {String(process.env.REACT_APP_USE_LOCAL_DATA ?? 'unset')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setSelectedSection('inspector')} style={btnSecondary}>Open Inspector</button>
                <button onClick={() => setSelectedSection('ops')} style={btnSecondary}>View Ops</button>
                <button onClick={() => setSelectedSection('files')} style={btnSecondary}>File Map</button>
              </div>
            </div>
          </>
        );

      // ── Operations Log ────────────────────────────────────
      case 'ops':
        return (
          <>
            <div style={sectionHeading}>Operations Log</div>
            <div style={card}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['all', 'errors', 'email', 'function'] as const).map((f) => (
                    <button key={f} onClick={() => setOpsFilter(f)} style={chipStyle(opsFilter === f)}>{f}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: textMuted }}>
                    <input type="checkbox" checked={opsAutoRefresh} onChange={(e) => setOpsAutoRefresh(e.target.checked)} /> Auto
                  </label>
                  <select value={opsIntervalMs} onChange={(e) => setOpsIntervalMs(Number(e.target.value))} aria-label="Auto refresh interval" style={{ ...inputStyle, padding: '5px 8px' }}>
                    <option value={3000}>3s</option>
                    <option value={5000}>5s</option>
                    <option value={10000}>10s</option>
                    <option value={30000}>30s</option>
                  </select>
                  <button onClick={() => loadOps()} style={btnPrimary}>Refresh</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <input type="search" value={opsSearchTerm} onChange={(e) => setOpsSearchTerm(e.target.value)} placeholder="Filter operations…" aria-label="Filter operations" style={{ ...inputStyle, flex: '1 1 200px', minWidth: 200 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => exportOps('json')} style={btnSecondary}>Export JSON</button>
                  <button onClick={() => exportOps('csv')} style={btnSecondary}>Export CSV</button>
                </div>
              </div>

              {opsLoading && <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><ThemedSpinner /></div>}
              {opsError && <div style={{ fontSize: 11, color: statusError }}>{opsError}</div>}
              {!filteredOps.length && !opsLoading && <div style={{ textAlign: 'center', padding: 24, color: textMuted, fontSize: 11 }}>No operations recorded.</div>}

              {filteredOps.length > 0 && (
                <div style={{ border: `1px solid ${borderLight}`, borderRadius: 0, background: isDarkMode ? colours.dark.background : '#fff' }}>
                  {/* Header row */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '120px 80px 120px 70px 60px 70px 1fr 50px',
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                    padding: '8px 10px', color: textMuted, borderBottom: `1px solid ${borderLight}`,
                  }}>
                    <span>Time</span><span>Type</span><span>Action</span><span>Status</span><span>HTTP</span><span>Duration</span><span>Details</span><span style={{ textAlign: 'right' }}>Info</span>
                  </div>
                  <VariableSizeList ref={opsListRef} height={Math.min(480, Math.max(240, filteredOps.length * 68))} itemCount={filteredOps.length} width="100%" itemSize={getOpsRowHeight}>
                    {({ index, style }) => {
                      const event = filteredOps[index];
                      const expanded = !!expandedOpsRows[event.id];
                      const isError = event.status === 'error' || (event.httpStatus != null && event.httpStatus >= 400);
                      const isSuccess = event.status === 'success' || (event.httpStatus != null && event.httpStatus < 300);
                      return (
                        <div
                          key={event.id} tabIndex={0} aria-expanded={expanded}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedOpsRows((prev) => ({ ...prev, [event.id]: !expanded }));
                              opsListRef.current?.resetAfterIndex(index);
                            }
                          }}
                          style={{
                            ...style, borderBottom: `1px solid ${isDarkMode ? `${colours.dark.border}40` : `${colours.highlightNeutral}80`}`,
                            display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 10px',
                            fontSize: 11, color: textPrimary, background: expanded ? `${colours.blue}0C` : 'transparent',
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 120px 70px 60px 70px 1fr 50px', alignItems: 'center', gap: 6 }}>
                            <span>{new Date(event.ts).toLocaleTimeString()}</span>
                            <span>{event.type}</span>
                            <span>{event.action || '—'}</span>
                            <span style={{ color: isError ? statusError : isSuccess ? statusOk : textSecondary, fontWeight: 600 }}>{event.status || '—'}</span>
                            <span>{event.httpStatus ?? '—'}</span>
                            <span>{event.durationMs ? `${event.durationMs}ms` : '—'}</span>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {event.enquiryId ? `enquiry ${event.enquiryId} · ` : ''}{event.url || event.error || '—'}
                            </span>
                            <div style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => { setExpandedOpsRows((prev) => ({ ...prev, [event.id]: !expanded })); opsListRef.current?.resetAfterIndex(index); }}
                                aria-expanded={expanded}
                                style={{ ...btnSecondary, padding: '3px 6px', fontSize: 10 }}
                              >
                                {expanded ? 'Hide' : 'View'}
                              </button>
                            </div>
                          </div>
                          {expanded && (
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${borderLight}`, display: 'grid', gap: 6 }}>
                              {event.url && (
                                <div>
                                  <strong style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.3 }}>Request</strong>
                                  <div style={{ ...monoSmall, wordBreak: 'break-all' }}>{event.method || 'GET'} {event.url}</div>
                                </div>
                              )}
                              {event.error && (
                                <div>
                                  <strong style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.3, color: statusError }}>Error</strong>
                                  <div style={{ ...monoSmall, wordBreak: 'break-word' }}>{event.error}</div>
                                </div>
                              )}
                              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(event, null, 2))} style={{ ...btnSecondary, padding: '3px 6px', fontSize: 10, width: 'fit-content' }}>Copy JSON</button>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  </VariableSizeList>
                </div>
              )}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // ── Modal shell ─────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onClose}
      styles={{
        main: {
          width: '92vw',
          maxWidth: 1300,
          minHeight: '80vh',
          background: bg,
          borderRadius: 0,
          padding: 0,
          border: `1px solid ${borderCol}`,
          boxShadow: isDarkMode ? '0 12px 32px rgba(0, 3, 25, 0.6)' : '0 12px 32px rgba(0, 0, 0, 0.08)',
        },
      }}
    >
      {/* Header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', background: colours.websiteBlue,
        borderBottom: `1px solid ${colours.dark.border}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: colours.dark.text, letterSpacing: 0.3 }}>Dev Dashboard</span>
        <button
          onClick={onClose}
          aria-label="Close dev dashboard"
          style={{
            width: 26, height: 26, borderRadius: 0, border: 'none',
            background: 'transparent', color: colours.subtleGrey, fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = colours.dark.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = colours.subtleGrey; }}
        >
          ✕
        </button>
      </div>

      {/* Tab strip */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${borderCol}`,
        background: isDarkMode ? colours.darkBlue : colours.grey, overflowX: 'auto',
      }}>
        {SECTIONS.map((s) => {
          const active = selectedSection === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSelectedSection(s.key)}
              style={{
                padding: '8px 16px', fontSize: 11, fontWeight: active ? 700 : 500,
                color: active ? colours.blue : textSecondary, background: 'transparent',
                border: 'none', borderBottom: active ? `2px solid ${colours.blue}` : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = textPrimary; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = textSecondary; }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div style={{ padding: 20, overflowY: 'auto', height: 'calc(80vh - 86px)' }}>
        {renderContent()}
      </div>
    </Modal>
  );
};

export default AdminDashboard;
