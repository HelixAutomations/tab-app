import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  IconButton,
  Toggle,
  Dropdown,
  type IDropdownOption,
  SearchBox,
  TooltipHost,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
}

interface LogMonitorProps {
  onBack: () => void;
}

/** Custom toggle matching house style */
const SessionToggle: React.FC<{
  isThisSession: boolean;
  onToggle: (thisSession: boolean) => void;
  isDarkMode: boolean;
  bufferedCount: number;
}> = ({ isThisSession, onToggle, isDarkMode, bufferedCount }) => {
  return (
    <div 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={() => onToggle(!isThisSession)}
    >
      <span style={{ 
        fontSize: '11px', 
        color: !isThisSession ? colours.highlight : (isDarkMode ? 'rgba(243, 244, 246, 0.5)' : 'rgba(6, 23, 51, 0.5)'),
        fontWeight: !isThisSession ? 600 : 400,
        transition: 'all 0.2s ease',
      }}>
        All ({bufferedCount})
      </span>
      <div
        style={{
          width: '36px',
          height: '18px',
          background: isThisSession ? colours.highlight : (isDarkMode ? '#475569' : '#d1d5db'),
          position: 'relative',
          transition: 'background 0.2s ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            background: '#ffffff',
            position: 'absolute',
            top: '2px',
            left: isThisSession ? '20px' : '2px',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </div>
      <span style={{ 
        fontSize: '11px', 
        color: isThisSession ? colours.highlight : (isDarkMode ? 'rgba(243, 244, 246, 0.5)' : 'rgba(6, 23, 51, 0.5)'),
        fontWeight: isThisSession ? 600 : 400,
        transition: 'all 0.2s ease',
      }}>
        Session
      </span>
    </div>
  );
};

const LogMonitor: React.FC<LogMonitorProps> = ({ onBack }) => {
  const { isDarkMode } = useTheme();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showThisSession, setShowThisSession] = useState(true);
  const [sessionStart] = useState(() => new Date().toISOString());
  const [toast, setToast] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedLogsRef = useRef<LogEntry[]>([]);

  const levelOptions: IDropdownOption[] = [
    { key: 'all', text: 'All Levels' },
    { key: 'debug', text: 'Debug' },
    { key: 'log', text: 'Log' },
    { key: 'info', text: 'Info' },
    { key: 'warn', text: 'Warning' },
    { key: 'error', text: 'Error' },
  ];

  // Subtle level indicators - on brand with Helix colors
  const getLevelStyle = (level: string) => {
    const base = { opacity: 0.9 };
    if (isDarkMode) {
      switch (level) {
        case 'error': return { ...base, color: colours.cta };
        case 'warn': return { ...base, color: colours.orange };
        case 'info': return { ...base, color: colours.highlight };
        default: return { ...base, color: 'rgba(243, 244, 246, 0.6)' };
      }
    } else {
      switch (level) {
        case 'error': return { ...base, color: colours.cta };
        case 'warn': return { ...base, color: '#b45309' };
        case 'info': return { ...base, color: colours.highlight };
        default: return { ...base, color: 'rgba(6, 23, 51, 0.6)' };
      }
    }
  };

  // Show toast notification
  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Connect to log stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsConnecting(true);
    setError(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const eventSource = new EventSource(`${baseUrl}/api/logs/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        showToast('Connected to log stream');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'connected') {
            return;
          }
          
          if (data.type === 'clear') {
            setLogs([]);
            pausedLogsRef.current = [];
            return;
          }

          const entry: LogEntry = {
            id: data.id || `${Date.now()}-${Math.random()}`,
            timestamp: data.timestamp,
            level: data.level,
            message: data.message,
            source: data.source || 'server',
          };

          if (isPaused) {
            pausedLogsRef.current.push(entry);
          } else {
            setLogs(prev => {
              const newLogs = [...prev, entry];
              if (newLogs.length > 1000) {
                return newLogs.slice(-1000);
              }
              return newLogs;
            });
          }
        } catch (e) {
          console.error('Failed to parse log entry:', e);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setError('Connection lost. Reconnecting...');
        eventSource.close();
        // Auto-reconnect after 3 seconds
        setTimeout(() => {
          if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
            connect();
          }
        }, 3000);
      };
    } catch (e) {
      setIsConnecting(false);
      setError('Failed to connect to log stream');
    }
  }, [isPaused, showToast]);

  // Disconnect from log stream
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Toggle pause/resume
  const togglePause = useCallback(() => {
    if (isPaused) {
      setLogs(prev => [...prev, ...pausedLogsRef.current].slice(-1000));
      pausedLogsRef.current = [];
    }
    setIsPaused(!isPaused);
  }, [isPaused]);

  // Clear logs
  const clearLogs = useCallback(async () => {
    setLogs([]);
    pausedLogsRef.current = [];
    
    try {
      const baseUrl = getProxyBaseUrl();
      await fetch(`${baseUrl}/api/logs/clear`, { method: 'POST' });
    } catch {
      // Ignore - local clear is enough
    }
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logContainerRef.current && !isPaused) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isPaused]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, []);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Session filter
      if (showThisSession && log.timestamp < sessionStart) {
        return false;
      }
      if (filterLevel !== 'all' && log.level !== filterLevel) {
        return false;
      }
      if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [logs, filterLevel, searchText, showThisSession, sessionStart]);

  // Log counts by level
  const logCounts = useMemo(() => {
    const counts: Record<string, number> = { debug: 0, log: 0, info: 0, warn: 0, error: 0 };
    logs.forEach(log => {
      if (counts[log.level] !== undefined) {
        counts[log.level]++;
      }
    });
    return counts;
  }, [logs]);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3,
      });
    } catch {
      return timestamp;
    }
  };

  const textColor = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColor = isDarkMode ? 'rgba(243, 244, 246, 0.5)' : 'rgba(6, 23, 51, 0.5)';
  const borderColor = isDarkMode ? colours.dark.border : colours.light.border;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
      color: textColor,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${borderColor}`,
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <IconButton
            iconProps={{ iconName: 'Back' }}
            onClick={onBack}
            title="Back"
            styles={{
              root: { color: textColor },
            }}
          />
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            Hub Log Stream
          </h2>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '3px',
            backgroundColor: isConnected 
              ? (isDarkMode ? 'rgba(115, 171, 96, 0.15)' : 'rgba(115, 171, 96, 0.12)')
              : isConnecting
                ? (isDarkMode ? 'rgba(0, 47, 108, 0.3)' : 'rgba(0, 47, 108, 0.15)')
                : (isDarkMode ? 'rgba(187, 62, 66, 0.15)' : 'rgba(187, 62, 66, 0.12)'),
            color: isConnected ? colours.green : isConnecting ? colours.highlight : colours.cta,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            {isConnecting && <Spinner size={SpinnerSize.xSmall} />}
            {isConnecting ? 'Connecting...' : isConnected ? 'Live' : 'Offline'}
          </span>
          {isPaused && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '3px',
              backgroundColor: isDarkMode ? 'rgba(240, 124, 80, 0.15)' : 'rgba(240, 124, 80, 0.12)',
              color: colours.orange,
            }}>
              Paused ({pausedLogsRef.current.length})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SessionToggle
            isThisSession={showThisSession}
            onToggle={(thisSession) => {
              setShowThisSession(thisSession);
              showToast(thisSession ? 'Showing session logs' : `Showing all ${logs.length} logs`);
            }}
            isDarkMode={isDarkMode}
            bufferedCount={logs.length}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `1px solid ${borderColor}`,
        backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Dropdown
            options={levelOptions}
            selectedKey={filterLevel}
            onChange={(_, option) => option && setFilterLevel(String(option.key))}
            styles={{
              root: { width: 120 },
              dropdown: {
                backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
              },
            }}
          />
          <SearchBox
            placeholder="Filter..."
            value={searchText}
            onChange={(_, newValue) => setSearchText(newValue || '')}
            styles={{ root: { width: 160 } }}
          />
          <span style={{ fontSize: '11px', color: mutedColor }}>
            {logCounts.error > 0 && <span style={{ color: colours.cta, marginRight: '8px' }}>{logCounts.error} errors</span>}
            {logCounts.warn > 0 && <span style={{ color: colours.orange, marginRight: '8px' }}>{logCounts.warn} warnings</span>}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Toggle
            label="Auto-scroll"
            checked={autoScroll}
            onChange={(_, checked) => setAutoScroll(!!checked)}
            inlineLabel
            styles={{
              root: { marginBottom: 0 },
              label: { fontSize: '11px', color: mutedColor },
            }}
          />
          <TooltipHost content={isPaused ? 'Resume' : 'Pause'}>
            <IconButton
              iconProps={{ iconName: isPaused ? 'Play' : 'Pause' }}
              onClick={togglePause}
              styles={{
                root: {
                  color: isPaused ? colours.orange : mutedColor,
                },
              }}
            />
          </TooltipHost>
          <TooltipHost content="Clear">
            <IconButton
              iconProps={{ iconName: 'Delete' }}
              onClick={clearLogs}
              styles={{ root: { color: mutedColor } }}
            />
          </TooltipHost>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'absolute',
          top: '60px',
          right: '16px',
          padding: '8px 16px',
          borderRadius: '4px',
          backgroundColor: colours.highlight,
          color: '#fff',
          fontSize: '12px',
          fontWeight: 500,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {toast}
        </div>
      )}

      {/* Error message */}
      {error && (
        <MessageBar
          messageBarType={MessageBarType.warning}
          onDismiss={() => setError(null)}
        >
          {error}
        </MessageBar>
      )}

      {/* Log container */}
      <div
        ref={logContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px 12px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: '11px',
          lineHeight: 1.6,
          backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.02)',
        }}
      >
        {isConnecting ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: mutedColor,
            gap: '12px',
          }}>
            <Spinner size={SpinnerSize.medium} />
            <div style={{ fontSize: '12px' }}>Connecting to log stream...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: mutedColor,
          }}>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>
              {showThisSession ? 'No logs this session' : 'No logs'}
            </div>
            <div style={{ fontSize: '12px' }}>
              {showThisSession 
                ? 'Operations will appear here as they occur'
                : logs.length === 0 
                  ? 'Waiting for server activity...'
                  : 'No logs match filter'}
            </div>
            {showThisSession && logs.length > 0 && (
              <div 
                style={{ 
                  fontSize: '11px', 
                  marginTop: '8px',
                  color: colours.highlight,
                  cursor: 'pointer',
                }}
                onClick={() => setShowThisSession(false)}
              >
                Show {logs.length} previous logs
              </div>
            )}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                padding: '2px 0',
                borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
              }}
            >
              <span style={{
                width: '80px',
                flexShrink: 0,
                color: mutedColor,
                marginRight: '8px',
              }}>
                {formatTimestamp(log.timestamp)}
              </span>
              <span style={{
                width: '40px',
                flexShrink: 0,
                marginRight: '8px',
                textTransform: 'uppercase',
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                ...getLevelStyle(log.level),
              }}>
                {log.level}
              </span>
              <span style={{
                flex: 1,
                wordBreak: 'break-word',
                color: textColor,
                whiteSpace: 'pre-wrap',
                opacity: log.level === 'debug' ? 0.6 : 0.9,
              }}>
                {log.message}
              </span>
            </div>
          ))
        )}
        
        {isConnected && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 0',
            color: mutedColor,
            fontSize: '10px',
          }}>
            <Spinner size={SpinnerSize.xSmall} />
            Listening...
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        borderTop: `1px solid ${borderColor}`,
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
        fontSize: '10px',
        color: mutedColor,
      }}>
        <span>
          {filteredLogs.length} / {logs.length} entries
          {showThisSession && ` (session)`}
        </span>
        <span>
          {logs.length >= 1000 ? 'Buffer full' : isConnected ? 'Streaming' : ''}
        </span>
      </div>
    </div>
  );
};

export default LogMonitor;
