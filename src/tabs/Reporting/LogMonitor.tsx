import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconButton,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

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

type ConnectionMode = 'sse' | 'polling' | 'disconnected';

const MAX_SSE_RETRIES = 3;
const POLL_INTERVAL_MS = 2500;
const MAX_LOG_ENTRIES = 1000;

const LogMonitor: React.FC<LogMonitorProps> = ({ onBack }) => {
  const { isDarkMode } = useTheme();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedLogsRef = useRef<LogEntry[]>([]);
  const sseRetryCountRef = useRef(0);
  const lastSeenIdRef = useRef<string | null>(null);
  const isPausedRef = useRef(false);
  const mountedRef = useRef(true);

  // Keep isPausedRef in sync
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const isConnected = connectionMode === 'sse' || connectionMode === 'polling';

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

  // Append log entries, deduplicating and capping
  const appendLogs = useCallback((entries: LogEntry[]) => {
    if (isPausedRef.current) {
      pausedLogsRef.current.push(...entries);
      return;
    }
    setLogs(prev => {
      const existingIds = new Set(prev.slice(-200).map(l => l.id)); // check last 200 for perf
      const newEntries = entries.filter(e => !existingIds.has(e.id));
      if (newEntries.length === 0) return prev;
      const merged = [...prev, ...newEntries];
      return merged.length > MAX_LOG_ENTRIES ? merged.slice(-MAX_LOG_ENTRIES) : merged;
    });
  }, []);

  // ── Polling fallback ──
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch('/api/logs/recent?limit=100');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data.logs) && data.logs.length > 0) {
          const lastId = lastSeenIdRef.current;
          let newEntries: LogEntry[] = data.logs;
          if (lastId) {
            const idx = data.logs.findIndex((l: LogEntry) => l.id === lastId);
            newEntries = idx >= 0 ? data.logs.slice(idx + 1) : data.logs;
          }
          if (newEntries.length > 0) {
            appendLogs(newEntries.map((l: LogEntry) => ({
              id: l.id || `${Date.now()}-${Math.random()}`,
              timestamp: l.timestamp,
              level: l.level,
              message: l.message,
              source: l.source || 'server',
            })));
            lastSeenIdRef.current = newEntries[newEntries.length - 1].id;
          }
        }
        setError(null);
      } catch {
        // Silent — polling retries automatically
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    setConnectionMode('polling');
    setIsConnecting(false);
    showToast('Connected via polling');
  }, [appendLogs, showToast]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ── SSE connection ──
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const eventSource = new EventSource('/api/logs/stream');
      eventSourceRef.current = eventSource;

      // Timeout — if SSE doesn't open within 8s it's probably blocked by Azure/IIS
      const sseTimeout = setTimeout(() => {
        if (!mountedRef.current) return;
        if (eventSource.readyState !== EventSource.OPEN) {
          eventSource.close();
          eventSourceRef.current = null;
          sseRetryCountRef.current++;
          if (sseRetryCountRef.current >= MAX_SSE_RETRIES) {
            startPolling();
          } else {
            setTimeout(() => { if (mountedRef.current) connectSSE(); }, 2000);
          }
        }
      }, 8000);

      eventSource.onopen = () => {
        clearTimeout(sseTimeout);
        if (!mountedRef.current) { eventSource.close(); return; }
        setConnectionMode('sse');
        setIsConnecting(false);
        setError(null);
        sseRetryCountRef.current = 0;
        showToast('Connected to live stream');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') return;
          if (data.type === 'clear') {
            setLogs([]);
            pausedLogsRef.current = [];
            lastSeenIdRef.current = null;
            return;
          }

          const entry: LogEntry = {
            id: data.id || `${Date.now()}-${Math.random()}`,
            timestamp: data.timestamp,
            level: data.level,
            message: data.message,
            source: data.source || 'server',
          };
          lastSeenIdRef.current = entry.id;
          appendLogs([entry]);
        } catch (e) {
          console.error('Failed to parse log entry:', e);
        }
      };

      eventSource.onerror = () => {
        clearTimeout(sseTimeout);
        eventSource.close();
        eventSourceRef.current = null;
        if (!mountedRef.current) return;
        setIsConnecting(false);
        sseRetryCountRef.current++;

        if (sseRetryCountRef.current >= MAX_SSE_RETRIES) {
          setError('Live stream unavailable — using polling fallback');
          startPolling();
        } else {
          setError('Connection lost. Reconnecting...');
          setConnectionMode('disconnected');
          setTimeout(() => { if (mountedRef.current) connectSSE(); }, 3000);
        }
      };
    } catch {
      setIsConnecting(false);
      sseRetryCountRef.current++;
      if (sseRetryCountRef.current >= MAX_SSE_RETRIES) {
        startPolling();
      } else {
        setError('Failed to connect. Retrying...');
        setTimeout(() => { if (mountedRef.current) connectSSE(); }, 3000);
      }
    }
  }, [appendLogs, showToast, startPolling]);

  // Disconnect everything
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    stopPolling();
    setConnectionMode('disconnected');
    sseRetryCountRef.current = 0;
  }, [stopPolling]);

  // Toggle pause/resume
  const togglePause = useCallback(() => {
    if (isPaused) {
      setLogs(prev => [...prev, ...pausedLogsRef.current].slice(-MAX_LOG_ENTRIES));
      pausedLogsRef.current = [];
    }
    setIsPaused(!isPaused);
  }, [isPaused]);

  // Clear logs
  const clearLogs = useCallback(async () => {
    setLogs([]);
    pausedLogsRef.current = [];
    lastSeenIdRef.current = null;
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
    } catch {
      // Ignore
    }
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logContainerRef.current && !isPaused) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isPaused]);

  // Auto-connect on mount, cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    connectSSE();
    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const modeLabel = connectionMode === 'sse' ? 'Live' : connectionMode === 'polling' ? 'Polling' : isConnecting ? 'Connecting...' : 'Offline';
  const modeColor = isConnected ? colours.green : isConnecting ? colours.highlight : colours.cta;
  const modeBg = isConnected
    ? (isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.12)')
    : isConnecting
      ? (isDarkMode ? 'rgba(0, 47, 108, 0.3)' : 'rgba(0, 47, 108, 0.15)')
      : (isDarkMode ? 'rgba(187, 62, 66, 0.15)' : 'rgba(187, 62, 66, 0.12)');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'transparent',
      color: textColor,
      fontFamily: 'Raleway, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
        backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
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
            borderRadius: 0,
            backgroundColor: modeBg,
            color: modeColor,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            {isConnecting && <Spinner size={SpinnerSize.xSmall} />}
            {modeLabel}
          </span>
          {isPaused && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 0,
              backgroundColor: isDarkMode ? 'rgba(240, 124, 80, 0.15)' : 'rgba(240, 124, 80, 0.12)',
              color: colours.orange,
            }}>
              Paused ({pausedLogsRef.current.length})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!isConnected && !isConnecting && (
            <IconButton
              iconProps={{ iconName: 'Refresh' }}
              onClick={() => { sseRetryCountRef.current = 0; connectSSE(); }}
              title="Reconnect"
              styles={{ root: { color: textColor } }}
            />
          )}
          <IconButton
            iconProps={{ iconName: isPaused ? 'Play' : 'Pause' }}
            onClick={togglePause}
            title={isPaused ? 'Resume' : 'Pause'}
            styles={{ root: { color: textColor } }}
          />
          <IconButton
            iconProps={{ iconName: 'Delete' }}
            onClick={clearLogs}
            title="Clear"
            styles={{ root: { color: textColor } }}
          />
          <IconButton
            iconProps={{ iconName: autoScroll ? 'PinnedSolid' : 'Pinned' }}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
            styles={{ root: { color: autoScroll ? colours.highlight : textColor } }}
          />
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'absolute',
          top: '60px',
          right: '16px',
          padding: '8px 16px',
          borderRadius: 0,
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
        {isConnecting && logs.length === 0 ? (
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
        ) : logs.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: mutedColor,
          }}>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>
              No logs yet
            </div>
            <div style={{ fontSize: '12px' }}>
              Operations will appear here as they occur
            </div>
          </div>
        ) : (
          logs.map((log) => (
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
            {connectionMode === 'sse' ? 'Streaming...' : `Polling every ${POLL_INTERVAL_MS / 1000}s...`}
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
        <span>{logs.length} entries</span>
        <span>
          {logs.length >= MAX_LOG_ENTRIES ? 'Buffer full' : isConnected ? (connectionMode === 'sse' ? 'SSE' : 'Poll') : ''}
        </span>
      </div>
    </div>
  );
};

export default LogMonitor;
