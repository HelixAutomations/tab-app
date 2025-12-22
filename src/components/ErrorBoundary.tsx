import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCode: string | null;
  errorTimestamp: string | null;
}

/**
 * Error Boundary component to catch React rendering errors
 * Prevents entire app from crashing when a single component fails
 * 
 * Usage:
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCode: null,
      errorTimestamp: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
  // Log error details to console (or send to analytics service)
    const errorCode = `HUB-${Date.now().toString(36).toUpperCase()}`;
    const errorTimestamp = new Date().toISOString();

    console.error('ErrorBoundary caught an error:', error, errorInfo, { errorCode, errorTimestamp });

    this.setState({
      error,
      errorInfo,
      errorCode,
      errorTimestamp,
    });

    // Optional: Send error to analytics/monitoring service
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCode: null,
      errorTimestamp: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '20px',
            backgroundColor: '#f5f5f5',
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '600px',
              padding: '40px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              textAlign: 'center',
            }}
          >
            <h1 style={{ color: '#d13438', marginBottom: '16px' }}>
              We hit a problem
            </h1>
            <p style={{ color: '#666', marginBottom: '16px', lineHeight: '1.5' }}>
              This page ran into an unexpected error. Reload to try again.
            </p>
            {this.state.errorCode && (
              <div
                style={{
                  marginBottom: '24px',
                  padding: '12px 16px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '6px',
                  border: '1px solid #e5e5e5',
                  color: '#333',
                  fontSize: '15px',
                  lineHeight: 1.6,
                }}
              >
                <strong>Support reference:</strong>
                <div style={{ fontFamily: 'monospace', fontSize: '16px', marginTop: '4px' }}>
                  {this.state.errorCode}
                </div>
                {this.state.errorTimestamp && (
                  <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                    Captured at {new Date(this.state.errorTimestamp).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Show error details in development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details
                style={{
                  marginBottom: '24px',
                  textAlign: 'left',
                  padding: '16px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px' }}>
                  Error Details (Development Only)
                </summary>
                <pre
                  style={{
                    overflow: 'auto',
                    fontSize: '12px',
                    color: '#d13438',
                    margin: '8px 0',
                  }}
                >
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo && (
                  <pre
                    style={{
                      overflow: 'auto',
                      fontSize: '11px',
                      color: '#666',
                      maxHeight: '200px',
                    }}
                  >
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#0078d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#106ebe')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#0078d4')}
              >
                Reload
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  color: '#0078d4',
                  border: '2px solid #0078d4',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
