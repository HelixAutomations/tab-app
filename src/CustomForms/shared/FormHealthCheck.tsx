// src/CustomForms/shared/FormHealthCheck.tsx
// Subtle admin-only health check panel for bespoke form endpoints
// Non-destructive: only performs read-only GET/OPTIONS checks

import React, { useState, useCallback } from 'react';
import {
  Icon,
  Spinner,
  SpinnerSize,
  Text,
  TooltipHost,
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';

interface HealthResult {
  id: string;
  name: string;
  description: string;
  status: 'healthy' | 'unhealthy' | 'error';
  responseMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface HealthResponse {
  timestamp: string;
  summary: { healthy: number; unhealthy: number; total: number };
  durationMs: number;
  checks: HealthResult[];
}

const FormHealthCheck: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const res = await fetch(`${baseUrl}/api/form-health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data: HealthResponse = await res.json();
      setResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleToggle = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
      runChecks();
    } else {
      setIsOpen(false);
    }
  }, [isOpen, runChecks]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return { icon: 'CompletedSolid', color: '#10b981' };
      case 'unhealthy': return { icon: 'ErrorBadge', color: '#ef4444' };
      default: return { icon: 'Warning', color: '#f59e0b' };
    }
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)'}`,
    borderRadius: '8px',
    background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)',
    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'Raleway, sans-serif',
    transition: 'all 0.2s ease',
    outline: 'none',
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    width: '380px',
    background: isDarkMode ? '#1e293b' : '#ffffff',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)'}`,
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? '0 8px 32px rgba(0, 0, 0, 0.4)'
      : '0 8px 32px rgba(15, 23, 42, 0.12)',
    zIndex: 1000,
    overflow: 'hidden',
    fontFamily: 'Raleway, sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    padding: '14px 16px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.06)'}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const checkRowStyle: React.CSSProperties = {
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(15, 23, 42, 0.03)'}`,
    fontSize: '13px',
    color: isDarkMode ? '#e2e8f0' : '#374151',
  };

  const footerStyle: React.CSSProperties = {
    padding: '10px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px',
    color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
  };

  return (
    <div style={containerStyle}>
      <TooltipHost content="Endpoint health checks">
        <button
          style={buttonStyle}
          onClick={handleToggle}
          aria-label="Form health checks"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(15, 23, 42, 0.15)';
            e.currentTarget.style.color = isDarkMode ? 'rgba(148, 163, 184, 1)' : 'rgba(100, 116, 139, 1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)';
            e.currentTarget.style.color = isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)';
          }}
        >
          <Icon
            iconName="HeartFill"
            style={{
              fontSize: '12px',
              color: results
                ? results.summary.unhealthy === 0 ? '#10b981' : '#ef4444'
                : isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
            }}
          />
          <span>Health</span>
          {isLoading && <Spinner size={SpinnerSize.xSmall} />}
        </button>
      </TooltipHost>

      {isOpen && (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <Text style={{ fontWeight: 600, fontSize: '13px', color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>
              Endpoint Health
            </Text>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {results && (
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: results.summary.unhealthy === 0
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                  color: results.summary.unhealthy === 0 ? '#10b981' : '#ef4444',
                  fontWeight: 600,
                }}>
                  {results.summary.healthy}/{results.summary.total}
                </span>
              )}
              <button
                onClick={runChecks}
                disabled={isLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  padding: '4px',
                  color: isDarkMode ? '#94a3b8' : '#64748b',
                  fontSize: '14px',
                  display: 'flex',
                  opacity: isLoading ? 0.5 : 1,
                }}
                aria-label="Re-run health checks"
              >
                <Icon iconName="Refresh" />
              </button>
            </div>
          </div>

          {isLoading && !results && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <Spinner size={SpinnerSize.medium} label="Checking endpoints..." />
            </div>
          )}

          {error && (
            <div style={{ padding: '16px', color: '#ef4444', fontSize: '13px' }}>
              <Icon iconName="ErrorBadge" style={{ marginRight: '6px' }} />
              {error}
            </div>
          )}

          {results && (
            <>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {results.checks.map((check) => {
                  const statusInfo = getStatusIcon(check.status);
                  return (
                    <div key={check.id} style={checkRowStyle}>
                      <Icon
                        iconName={statusInfo.icon}
                        style={{ fontSize: '14px', color: statusInfo.color, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>
                          {check.name}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                          marginTop: '2px',
                        }}>
                          {check.error || check.description}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '11px',
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)',
                        flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {check.responseMs}ms
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={footerStyle}>
                <span>Total: {results.durationMs}ms</span>
                <span>{new Date(results.timestamp).toLocaleTimeString('en-GB')}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FormHealthCheck;
