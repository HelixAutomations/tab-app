// src/components/ErrorTracker.tsx
// Development-only error tracking panel - catches runtime errors for review

import React, { useState, useEffect } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

interface TrackedError {
  id: string;
  timestamp: Date;
  message: string;
  stack?: string;
  componentStack?: string;
  type: 'runtime' | 'boundary' | 'promise';
  dismissed: boolean;
}

export class ErrorCollector {
  private static instance: ErrorCollector;
  private errors: TrackedError[] = [];
  private listeners: Array<(errors: TrackedError[]) => void> = [];
  private originalConsoleError: typeof console.error;

  private constructor() {
    this.originalConsoleError = console.error;
    this.setupListeners();
  }

  static getInstance(): ErrorCollector {
    if (!ErrorCollector.instance) {
      ErrorCollector.instance = new ErrorCollector();
    }
    return ErrorCollector.instance;
  }

  private setupListeners() {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addError({
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        type: 'promise'
      });
    });

    // Catch runtime errors
    window.addEventListener('error', (event) => {
      this.addError({
        message: event.message,
        stack: event.error?.stack,
        type: 'runtime'
      });
    });

    // Intercept console.error for React errors
    console.error = (...args: any[]) => {
      const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
      
      // Only track actual errors, not warnings or info
      if (message.includes('Error:') || message.includes('TypeError:') || message.includes('at ')) {
        this.addError({
          message: args[0]?.message || message,
          stack: args[0]?.stack || (typeof args[1] === 'object' ? args[1]?.componentStack : undefined),
          type: 'runtime'
        });
      }
      
      this.originalConsoleError.apply(console, args);
    };
  }

  addError(error: { message: string; stack?: string; componentStack?: string; type: 'runtime' | 'boundary' | 'promise' }) {
    const trackedError: TrackedError = {
      id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      message: error.message,
      stack: error.stack,
      componentStack: error.componentStack,
      type: error.type,
      dismissed: false
    };

    this.errors.unshift(trackedError);
    
    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(0, 50);
    }

    this.notifyListeners();
  }

  getErrors(): TrackedError[] {
    return this.errors;
  }

  dismissError(id: string) {
    const error = this.errors.find(e => e.id === id);
    if (error) {
      error.dismissed = true;
      this.notifyListeners();
    }
  }

  clearAll() {
    this.errors = this.errors.filter(e => e.dismissed);
    this.notifyListeners();
  }

  subscribe(listener: (errors: TrackedError[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.errors));
  }
}

interface ErrorTrackerProps {
  onClose: () => void;
}

export const ErrorTracker: React.FC<ErrorTrackerProps> = ({ onClose }) => {
  const { isDarkMode } = useTheme();
  const [errors, setErrors] = useState<TrackedError[]>([]);
  const [selectedError, setSelectedError] = useState<TrackedError | null>(null);

  useEffect(() => {
    const collector = ErrorCollector.getInstance();
    setErrors(collector.getErrors());
    
    const unsubscribe = collector.subscribe(setErrors);
    return unsubscribe;
  }, []);

  const activeErrors = errors.filter(e => !e.dismissed);
  const dismissedErrors = errors.filter(e => e.dismissed);

  const bgOverlay = 'rgba(0, 0, 0, 0.4)';
  const bgPanel = isDarkMode ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const bgCard = isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(248, 250, 252, 0.9)';
  const bgHover = isDarkMode ? 'rgba(51, 65, 85, 0.6)' : 'rgba(241, 245, 249, 0.9)';
  const borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)';
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textMuted = isDarkMode ? 'rgba(203, 213, 225, 0.6)' : 'rgba(71, 85, 105, 0.6)';
  const errorRed = '#ef4444';
  const warningYellow = '#f59e0b';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: bgOverlay,
        backdropFilter: 'blur(6px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        zIndex: 3000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: bgPanel,
          width: '90%',
          maxWidth: 1200,
          height: '85vh',
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: textPrimary }}>
              Error Tracker
              <span style={{ 
                marginLeft: 10, 
                fontSize: 12, 
                background: errorRed, 
                color: 'white', 
                padding: '2px 8px', 
                borderRadius: 4,
                fontWeight: 600
              }}>
                {activeErrors.length}
              </span>
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 11, color: textMuted }}>
              Development only - Track runtime errors for debugging
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => ErrorCollector.getInstance().clearAll()}
              disabled={activeErrors.length === 0}
              style={{
                background: 'transparent',
                border: `1px solid ${borderColor}`,
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                color: textPrimary,
                cursor: activeErrors.length === 0 ? 'not-allowed' : 'pointer',
                opacity: activeErrors.length === 0 ? 0.5 : 1
              }}
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 20,
                color: textMuted,
                cursor: 'pointer',
                padding: '0 8px'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Error List */}
          <div style={{
            width: selectedError ? '40%' : '100%',
            borderRight: selectedError ? `1px solid ${borderColor}` : 'none',
            overflow: 'auto',
            padding: 16
          }}>
            {activeErrors.length === 0 && dismissedErrors.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: textMuted }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 14 }}>No errors tracked</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Errors will appear here when they occur</div>
              </div>
            )}

            {activeErrors.length > 0 && (
              <div>
                <h3 style={{ fontSize: 12, fontWeight: 600, color: textMuted, margin: '0 0 12px 0', textTransform: 'uppercase' }}>
                  Active ({activeErrors.length})
                </h3>
                {activeErrors.map(error => (
                  <div
                    key={error.id}
                    onClick={() => setSelectedError(error)}
                    style={{
                      background: selectedError?.id === error.id ? bgHover : bgCard,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 8,
                      cursor: 'pointer',
                      transition: '0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: error.type === 'promise' ? warningYellow : errorRed,
                        textTransform: 'uppercase'
                      }}>
                        {error.type}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          ErrorCollector.getInstance().dismissError(error.id);
                          if (selectedError?.id === error.id) setSelectedError(null);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: 16,
                          color: textMuted,
                          cursor: 'pointer',
                          padding: 0,
                          lineHeight: 1
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: textPrimary, marginBottom: 4, wordBreak: 'break-word' }}>
                      {error.message.split('\n')[0].slice(0, 120)}
                    </div>
                    <div style={{ fontSize: 10, color: textMuted }}>
                      {error.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dismissedErrors.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 12, fontWeight: 600, color: textMuted, margin: '0 0 12px 0', textTransform: 'uppercase' }}>
                  Dismissed ({dismissedErrors.length})
                </h3>
                {dismissedErrors.map(error => (
                  <div
                    key={error.id}
                    style={{
                      background: bgCard,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 8,
                      opacity: 0.5
                    }}
                  >
                    <div style={{ fontSize: 11, color: textMuted, marginBottom: 4 }}>
                      {error.message.split('\n')[0].slice(0, 80)}
                    </div>
                    <div style={{ fontSize: 10, color: textMuted }}>
                      {error.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Detail */}
          {selectedError && (
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 8 }}>
                  Error Details
                </div>
                <div style={{ fontSize: 14, color: textPrimary, marginBottom: 12, wordBreak: 'break-word' }}>
                  {selectedError.message}
                </div>
                <div style={{ fontSize: 11, color: textMuted }}>
                  {selectedError.timestamp.toLocaleString()}
                </div>
              </div>

              {selectedError.stack && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 8 }}>
                    Stack Trace
                  </div>
                  <pre style={{
                    background: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 10,
                    color: textPrimary,
                    overflow: 'auto',
                    maxHeight: 300,
                    margin: 0,
                    lineHeight: 1.6
                  }}>
                    {selectedError.stack}
                  </pre>
                </div>
              )}

              {selectedError.componentStack && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 8 }}>
                    Component Stack
                  </div>
                  <pre style={{
                    background: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 10,
                    color: textPrimary,
                    overflow: 'auto',
                    maxHeight: 200,
                    margin: 0,
                    lineHeight: 1.6
                  }}>
                    {selectedError.componentStack}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Initialize collector on import
if (typeof window !== 'undefined') {
  ErrorCollector.getInstance();
}
