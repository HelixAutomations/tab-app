import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Icon,
  IconButton,
  INavLink,
  Modal,
  Nav,
  Text,
  mergeStyles,
} from '@fluentui/react';
import { FixedSizeList } from 'react-window';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import ThemedSpinner from './ThemedSpinner';
import {
  CallLogEntry,
  clearCallLogs,
  getCallLogs,
} from '../utils/callLogger';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';

interface DataInspectorProps {
  data: unknown;
  onClose?: () => void;
  mode?: 'modal' | 'embedded';
}

type InspectorSection = 'user' | 'calls' | 'cache' | 'environment';
type CallFilter = 'all' | 'success' | 'error';

const PASSCODE_VALUE = '2011';
const PASSCODE_STORAGE_KEY = 'helix-hub-inspector-passcode';

const DataInspector: React.FC<DataInspectorProps> = ({ data, onClose, mode = 'modal' }) => {
  const { isDarkMode } = useTheme();
  const palette = isDarkMode ? colours.dark : colours.light;
  const [selectedSection, setSelectedSection] = useState<InspectorSection>('user');
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>(() => getCallLogs());
  const [cacheData, setCacheData] = useState<Record<string, unknown>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [callFilter, setCallFilter] = useState<CallFilter>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [isPasscodeValid, setIsPasscodeValid] = useState<boolean>(() => sessionStorage.getItem(PASSCODE_STORAGE_KEY) === 'true');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const loadCache = useCallback(() => {
    const entries: Record<string, unknown> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      try {
        const value = localStorage.getItem(key);
        entries[key] = value ? JSON.parse(value) : value;
      } catch {
        entries[key] = localStorage.getItem(key);
      }
    }
    setCacheData(entries);
  }, []);

  useEffect(() => {
    loadCache();
    if (mode !== 'modal') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [loadCache, mode]);

  const verifyPasscode = useCallback(() => {
    if (passcodeInput.trim() === PASSCODE_VALUE) {
      sessionStorage.setItem(PASSCODE_STORAGE_KEY, 'true');
      setIsPasscodeValid(true);
      setPasscodeError(null);
    } else {
      setPasscodeError('Incorrect passcode. Try again.');
    }
  }, [passcodeInput]);

  const navItems: INavLink[] = useMemo(() => [
    {
      name: 'User Profile',
      key: 'user',
      icon: 'Contact',
      url: '',
      onClick: (ev) => {
        ev?.preventDefault();
        setSelectedSection('user');
      },
    },
    {
      name: 'Network Activity',
      key: 'calls',
      icon: 'TimelineProgress',
      url: '',
      onClick: (ev) => {
        ev?.preventDefault();
        setSelectedSection('calls');
      },
    },
    {
      name: 'Data Cache',
      key: 'cache',
      icon: 'Database',
      url: '',
      onClick: (ev) => {
        ev?.preventDefault();
        setSelectedSection('cache');
      },
    },
    {
      name: 'System Info',
      key: 'environment',
      icon: 'Settings',
      url: '',
      onClick: (ev) => {
        ev?.preventDefault();
        setSelectedSection('environment');
      },
    },
  ], []);

  const cardClass = useMemo(() => mergeStyles({
    background: palette.cardBackground,
    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)'}`,
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    boxShadow: isDarkMode ? '0 10px 30px rgba(2,6,23,0.45)' : '0 10px 24px rgba(15,23,42,0.08)',
  }), [isDarkMode, palette.cardBackground]);

  const focusableRowClass = useMemo(() => mergeStyles({
    borderRadius: 8,
    selectors: {
      ':focus-visible': {
        outline: `2px solid ${colours.blue}`,
        outlineOffset: '2px',
      },
    },
  }), []);

  const modalStyles = useMemo(() => ({
    main: {
      width: '92vw',
      maxWidth: 1320,
      minHeight: '80vh',
      background: palette.sectionBackground,
      borderRadius: 14,
      padding: 0,
      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.06)'}`,
      boxShadow: isDarkMode ? '0 24px 52px rgba(2,6,23,0.65)' : '0 24px 48px rgba(15,23,42,0.16)',
    },
  }), [isDarkMode, palette.sectionBackground]);

  const headerClass = useMemo(() => mergeStyles({
    background: palette.cardBackground,
    padding: '20px 24px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.06)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }), [isDarkMode, palette.cardBackground]);

  const bodyClass = useMemo(() => mergeStyles({
    display: 'flex',
    minHeight: 'calc(80vh - 80px)',
  }), []);

  const sidebarClass = useMemo(() => mergeStyles({
    width: 220,
    borderRight: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)'}`,
    background: isDarkMode ? 'rgba(15,23,42,0.72)' : 'rgba(241,245,249,0.82)',
    padding: '16px 0',
  }), [isDarkMode]);

  const contentClass = useMemo(() => mergeStyles({
    flex: 1,
    padding: 24,
    overflowY: 'auto',
  }), []);

  const callSummary = useMemo(() => {
    const total = callLogs.length;
    const successful = callLogs.filter((log) => log.status && log.status >= 200 && log.status < 300).length;
    const failed = callLogs.filter((log) => !log.status || log.status >= 400).length;
    const average = total ? callLogs.reduce((sum, log) => sum + log.durationMs, 0) / total : 0;
    return { total, successful, failed, average: Math.round(average) };
  }, [callLogs]);

  const cacheSummary = useMemo(() => {
    const entries = Object.entries(cacheData);
    const systemEntries = entries.filter(([key]) => key.startsWith('__')).length;
    return {
      total: entries.length,
      systemEntries,
      dataEntries: entries.length - systemEntries,
    };
  }, [cacheData]);

  const filteredCallLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return callLogs.filter((log) => {
      if (callFilter === 'success' && !(log.status && log.status >= 200 && log.status < 300)) return false;
      if (callFilter === 'error' && (log.status && log.status < 400 && log.status >= 200)) return false;
      if (!term) return true;
      return log.url.toLowerCase().includes(term) || log.method.toLowerCase().includes(term);
    });
  }, [callLogs, callFilter, searchTerm]);

  const filteredCacheEntries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return Object.entries(cacheData).filter(([key, value]) => {
      if (!term) return true;
      return (
        key.toLowerCase().includes(term) ||
        JSON.stringify(value ?? '').toLowerCase().includes(term)
      );
    });
  }, [cacheData, searchTerm]);

  const environmentData = useMemo(() => ({
    runtime: {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    },
    storage: {
      localStorage: Object.keys(localStorage).length,
      sessionStorage: Object.keys(sessionStorage).length,
    },
    configuration: {
      useLocalData: process.env.REACT_APP_USE_LOCAL_DATA,
      proxyBaseUrl: getProxyBaseUrl(),
      nodeEnv: process.env.NODE_ENV,
    },
  }), []);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const getStatusAppearance = useCallback((status?: number) => {
    if (!status || status >= 400) {
      return {
        tone: '#ef4444',
        background: isDarkMode ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
        label: status ? status : 'Failed',
      };
    }
    if (status < 300) {
      return {
        tone: isDarkMode ? '#4ade80' : '#15803d',
        background: isDarkMode ? 'rgba(74,222,128,0.18)' : 'rgba(22,163,74,0.12)',
        label: status,
      };
    }
    return {
      tone: '#f97316',
      background: isDarkMode ? 'rgba(249,115,22,0.2)' : 'rgba(249,115,22,0.14)',
      label: status,
    };
  }, [isDarkMode]);

  const renderJsonValue = useCallback((value: unknown, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span style={{ color: palette.subText, opacity: 0.8 }}>null</span>;
    }
    if (typeof value === 'boolean') {
      return <span style={{ color: colours.blue }}>{value.toString()}</span>;
    }
    if (typeof value === 'number') {
      return <span style={{ color: colours.blue }}>{value}</span>;
    }
    if (typeof value === 'string') {
      return <span style={{ color: palette.text, wordBreak: 'break-word' }}>&quot;{value}&quot;</span>;
    }

    const indentation = 16;
    if (Array.isArray(value)) {
      if (!value.length) {
        return <span>[]</span>;
      }
      const key = `array-${depth}-${value.length}`;
      const expanded = expandedSections.has(key);
      return (
        <div>
          <button
            type="button"
            onClick={() => toggleSection(key)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: colours.blue,
              fontSize: '12px',
            }}
          >
            {expanded ? '▼' : '▶'} Array({value.length})
          </button>
          {expanded && (
            <div style={{ marginLeft: indentation, borderLeft: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(15,23,42,0.1)'}`, paddingLeft: 12 }}>
              {value.map((item, index) => (
                <div key={index} style={{ marginBottom: 6 }}>
                  <span style={{ color: palette.subText, marginRight: 8 }}>[{index}]</span>
                  {renderJsonValue(item, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length) {
        return <span>{'{ }'}</span>;
      }
      const key = `object-${depth}-${entries.length}`;
      const expanded = expandedSections.has(key);
      return (
        <div>
          <button
            type="button"
            onClick={() => toggleSection(key)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: colours.blue,
              fontSize: '12px',
            }}
          >
            {expanded ? '▼' : '▶'} Object({entries.length})
          </button>
          {expanded && (
            <div style={{ marginLeft: indentation, borderLeft: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(15,23,42,0.1)'}`, paddingLeft: 12 }}>
              {entries.map(([keyName, entryValue]) => (
                <div key={keyName} style={{ marginBottom: 6 }}>
                  <span style={{ color: colours.blue, fontWeight: 600 }}>&quot;{keyName}&quot;:</span>
                  <span style={{ marginLeft: 6 }}>{renderJsonValue(entryValue, depth + 1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  }, [expandedSections, isDarkMode, palette.subText, palette.text, toggleSection]);

  const handleExportCalls = useCallback(() => {
    if (!filteredCallLogs.length) return;
    const blob = new Blob([JSON.stringify(filteredCallLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `network-activity-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredCallLogs]);

  const handleExportCache = useCallback(() => {
    if (!filteredCacheEntries.length) return;
    const payload = Object.fromEntries(filteredCacheEntries);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cache-dump-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredCacheEntries]);

  const copyToClipboard = useCallback((payload: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => undefined);
  }, []);

  const handleClearLogs = useCallback(() => {
    clearCallLogs();
    setCallLogs([]);
    setSearchTerm('');
  }, []);

  const handleRefreshLogs = useCallback(() => {
    setCallLogs([...getCallLogs()]);
  }, []);

  const callListHeight = Math.min(480, Math.max(240, filteredCallLogs.length * 92));
  const cacheListHeight = Math.min(480, Math.max(240, filteredCacheEntries.length * 100));

  const renderPasscodeGate = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <div className={cardClass} style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <Icon iconName="Lock" style={{ fontSize: 32, color: colours.blue, marginBottom: 12 }} />
        <Text variant="xLarge" style={{ fontWeight: 600, color: palette.text }}>Restricted access</Text>
        <Text style={{ color: palette.subText, marginTop: 6 }}>Enter the admin passcode to open the inspector.</Text>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            value={passcodeInput}
            onChange={(event) => setPasscodeInput(event.target.value)}
            placeholder="Passcode"
            aria-label="Inspector passcode"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                verifyPasscode();
              }
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.4)' : 'rgba(15,23,42,0.12)'}`,
              background: isDarkMode ? 'rgba(15,23,42,0.78)' : '#fff',
              color: palette.text,
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={verifyPasscode}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              background: colours.blue,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 10px 24px rgba(54,144,206,0.32)',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'translateY(-1px)';
              event.currentTarget.style.boxShadow = '0 18px 32px rgba(54,144,206,0.36)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
              event.currentTarget.style.boxShadow = '0 10px 24px rgba(54,144,206,0.32)';
            }}
          >
            Unlock inspector
          </button>
          {passcodeError && (
            <Text style={{ color: '#ef4444' }}>{passcodeError}</Text>
          )}
        </div>
      </div>
    </div>
  );

  const renderUserSection = () => (
    <div>
      <div className={cardClass}>
        <Text variant="large" style={{ fontWeight: 600, color: palette.text }}>User context</Text>
        <Text style={{ color: palette.subText, marginTop: 6 }}>
          Keys detected: {data && typeof data === 'object' ? Object.keys(data as Record<string, unknown>).length : 0}
        </Text>
      </div>
      <div className={cardClass}>
        <div style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          color: palette.text,
          overflowWrap: 'anywhere',
        }}>
          {renderJsonValue(data)}
        </div>
      </div>
    </div>
  );

  const renderCallSection = () => (
    <div>
      <div className={cardClass}>
        <Text variant="large" style={{ fontWeight: 600, color: palette.text }}>Network performance</Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 16 }}>
          {[{
            label: 'Total requests',
            value: callSummary.total,
          }, {
            label: 'Successes',
            value: callSummary.successful,
          }, {
            label: 'Failures',
            value: callSummary.failed,
          }, {
            label: 'Avg duration',
            value: callSummary.average ? `${callSummary.average}ms` : '—',
          }].map((item) => (
            <div key={item.label} style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: isDarkMode ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.04)',
            }}>
              <div style={{ fontSize: 12, color: palette.subText, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: palette.text }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'success', 'error'] as CallFilter[]).map((filterKey) => {
              const isActive = callFilter === filterKey;
              return (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setCallFilter(filterKey)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: `1px solid ${isActive ? colours.blue : (isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.14)')}`,
                    background: isActive ? 'rgba(54,144,206,0.18)' : 'transparent',
                    color: isActive ? colours.blue : palette.text,
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {filterKey}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleClearLogs}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: '#ef4444',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleRefreshLogs}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
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
            <button
              type="button"
              onClick={handleExportCalls}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.14)'}`,
                background: 'transparent',
                color: palette.text,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Export JSON
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Filter requests..."
            aria-label="Filter network requests"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.12)'}`,
              background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
              color: palette.text,
              fontSize: 12,
            }}
          />
        </div>

        {!filteredCallLogs.length ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: palette.subText }}>
            <Text>No network requests captured yet.</Text>
          </div>
        ) : (
          <div
            role="list"
            aria-label="Network activity entries"
            style={{
              border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.12)'}`,
              borderRadius: 8,
              background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
            }}
          >
            <FixedSizeList
              height={callListHeight}
              width="100%"
              itemCount={filteredCallLogs.length}
              itemSize={92}
              itemKey={(index) => `${filteredCallLogs[index]?.url}-${index}`}
            >
              {({ index, style }) => {
                const log = filteredCallLogs[index];
                const statusAppearance = getStatusAppearance(log.status);
                return (
                  <div
                    key={`${log.url}-${index}`}
                    role="listitem"
                    className={focusableRowClass}
                    tabIndex={0}
                    style={{
                      ...style,
                      padding: '14px 16px',
                      borderBottom: index === filteredCallLogs.length - 1
                        ? 'none'
                        : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.08)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      outline: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)',
                        color: palette.text,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                      }}>
                        {log.method}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: statusAppearance.background,
                        color: statusAppearance.tone,
                        fontSize: 11,
                        fontWeight: 600,
                      }}>
                        {statusAppearance.label}
                      </span>
                      <span style={{ fontSize: 12, color: palette.subText }}>
                        {log.durationMs.toFixed(0)}ms
                      </span>
                    </div>
                    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, color: palette.text }}>
                      {log.url}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(log)}
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
                );
              }}
            </FixedSizeList>
          </div>
        )}
      </div>
    </div>
  );

  const renderCacheSection = () => (
    <div>
      <div className={cardClass}>
        <Text variant="large" style={{ fontWeight: 600, color: palette.text }}>Cache overview</Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 16 }}>
          {[{
            label: 'Total entries',
            value: cacheSummary.total,
          }, {
            label: 'Data entries',
            value: cacheSummary.dataEntries,
          }, {
            label: 'System entries',
            value: cacheSummary.systemEntries,
          }].map((item) => (
            <div key={item.label} style={{ padding: '12px 14px', borderRadius: 8, background: isDarkMode ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.04)' }}>
              <div style={{ fontSize: 12, color: palette.subText, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: palette.text }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={loadCache}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
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
            <button
              type="button"
              onClick={handleExportCache}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.14)'}`,
                background: 'transparent',
                color: palette.text,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Export JSON
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Filter keys..."
              aria-label="Filter cache entries"
              style={{
                width: '100%',
                minWidth: 220,
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(15,23,42,0.12)'}`,
                background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
                color: palette.text,
                fontSize: 12,
              }}
            />
          </div>
        </div>

        {!filteredCacheEntries.length ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: palette.subText }}>
            <Text>No cache entries match the current filters.</Text>
          </div>
        ) : (
          <div
            role="list"
            aria-label="Cache entries"
            style={{
              border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.12)'}`,
              borderRadius: 8,
              background: isDarkMode ? 'rgba(15,23,42,0.7)' : '#fff',
            }}
          >
            <FixedSizeList
              height={cacheListHeight}
              width="100%"
              itemCount={filteredCacheEntries.length}
              itemSize={100}
              itemKey={(index) => filteredCacheEntries[index][0]}
            >
              {({ index, style }) => {
                const [key, value] = filteredCacheEntries[index];
                return (
                  <div
                    key={key}
                    role="listitem"
                    className={focusableRowClass}
                    tabIndex={0}
                    style={{
                      ...style,
                      padding: '14px 16px',
                      borderBottom: index === filteredCacheEntries.length - 1
                        ? 'none'
                        : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.08)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      outline: 'none',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: palette.text, wordBreak: 'break-all' }}>{key}</div>
                    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11, color: palette.text }}>
                      {renderJsonValue(value)}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard({ [key]: value })}
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
                );
              }}
            </FixedSizeList>
          </div>
        )}
      </div>
    </div>
  );

  const renderEnvironmentSection = () => (
    <div className={cardClass}>
      <Text variant="large" style={{ fontWeight: 600, color: palette.text }}>System configuration</Text>
      <div style={{
        marginTop: 16,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 12,
        lineHeight: 1.5,
        color: palette.text,
      }}>
        {renderJsonValue(environmentData)}
      </div>
    </div>
  );

  const renderContent = () => {
    if (!isPasscodeValid) return renderPasscodeGate();
    switch (selectedSection) {
      case 'user':
        return renderUserSection();
      case 'calls':
        return renderCallSection();
      case 'cache':
        return renderCacheSection();
      case 'environment':
        return renderEnvironmentSection();
      default:
        return null;
    }
  };

  const layout = (
    <>
      <div className={headerClass}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon iconName="ComplianceAudit" style={{ fontSize: 20, color: colours.blue }} />
          <div>
            <Text variant={mode === 'modal' ? 'xLarge' : 'large'} style={{ fontWeight: 600, color: palette.text }}>
              Application Inspector
            </Text>
            <Text style={{ color: palette.subText, fontSize: 12 }}>Environment context, cache state, and network diagnostics</Text>
          </div>
        </div>
        {mode === 'modal' && onClose && (
          <IconButton
            iconProps={{ iconName: 'ChromeClose' }}
            ariaLabel="Close application inspector"
            onClick={onClose}
            styles={{
              root: {
                borderRadius: 6,
                width: 32,
                height: 32,
                color: isDarkMode ? '#a0aec0' : '#4a5568',
              },
              rootHovered: {
                background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              },
            }}
          />
        )}
      </div>

      <div className={bodyClass}>
        <div className={sidebarClass} role="navigation" aria-label="Inspector sections">
          <Nav
            groups={[{ links: navItems }]}
            selectedKey={selectedSection}
            ariaLabel="Inspector sections"
            styles={{
              root: { background: 'transparent' },
              link: {
                background: 'transparent',
                color: palette.text,
                fontSize: '13px',
                padding: '8px 16px',
                borderRadius: '6px',
                margin: '2px 8px',
                selectors: {
                  ':hover': {
                    background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    color: palette.text,
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${colours.blue}`,
                    outlineOffset: '2px',
                  },
                  '.is-selected': {
                    background: 'rgba(54,144,206,0.15)',
                    color: colours.blue,
                  },
                  '.is-selected:hover': {
                    background: 'rgba(54,144,206,0.18)',
                    color: colours.blue,
                  },
                },
              },
            }}
          />
        </div>
        <div className={contentClass}>
          {renderContent() ?? (
            <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
              <ThemedSpinner label="Loading inspector" />
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (mode === 'embedded') {
    return (
      <div style={{
        border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        background: palette.sectionBackground,
      }}>
        {layout}
      </div>
    );
  }

  return (
    <Modal
      isOpen
      onDismiss={onClose}
      isBlocking
      styles={modalStyles}
    >
      {layout}
    </Modal>
  );
};

export default DataInspector;
