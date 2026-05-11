import React, { Component, ErrorInfo, ReactNode } from 'react';
import { colours } from '../app/styles/colours';
import { ErrorCollector } from './ErrorTracker';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

type NotifyStatus = 'idle' | 'sending' | 'sent' | 'failed';

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCode: string | null;
  errorTimestamp: string | null;
  notifyStatus: NotifyStatus;
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
      notifyStatus: 'idle',
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

    const maybeAutoReloadForChunkError = () => {
      const name = typeof (error as any)?.name === 'string' ? (error as any).name : '';
      const message = typeof (error as any)?.message === 'string' ? (error as any).message : '';
      const text = `${name} ${message}`.toLowerCase();
      const isChunkLoadError =
        text.includes('chunkloaderror') ||
        (text.includes('loading chunk') && text.includes('failed')) ||
        text.includes('css chunk load failed') ||
        text.includes('timeout:') && text.includes('.chunk.');

      if (!isChunkLoadError) return false;

      const hasChunkReloadedKey = '__helix_chunk_reload_once__';
      try {
        if (sessionStorage.getItem(hasChunkReloadedKey) === 'true') {
          return false;
        }
        sessionStorage.setItem(hasChunkReloadedKey, 'true');
      } catch {
        // If sessionStorage isn't available, still attempt a single reload.
      }

      // Hard reload is the most reliable way to pick up new chunk filenames.
      window.location.reload();
      return true;
    };

    // ChunkLoadError can be caught by React (e.g. lazy chunk timeout), which means
    // window 'unhandledrejection' may never fire. Auto-reload once to recover.
    if (maybeAutoReloadForChunkError()) {
      return;
    }

    console.error('ErrorBoundary caught an error:', error, errorInfo, { errorCode, errorTimestamp });

    // Track error in dev error tracker
    try {
      ErrorCollector.getInstance().addError({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack ?? undefined,
        type: 'boundary'
      });
    } catch (e) {
      // Silently fail if tracker not available
    }

    this.setState({
      error,
      errorInfo,
      errorCode,
      errorTimestamp,
    });

    // Fire-and-forget Teams DM to Luke. Dedup per code so a re-render storm
    // can't spam the channel. Failure is silent — UI shows a quiet fallback.
    this.sendErrorReport({ error, errorInfo, errorCode, errorTimestamp });
  }

  sendErrorReport = (args: {
    error: Error;
    errorInfo: ErrorInfo;
    errorCode: string;
    errorTimestamp: string;
  }): void => {
    const { error, errorInfo, errorCode, errorTimestamp } = args;
    const dedupKey = '__helix_error_notify__';
    let alreadySent = false;
    try {
      const last = sessionStorage.getItem(dedupKey);
      if (last && last === errorCode) {
        alreadySent = true;
      } else {
        sessionStorage.setItem(dedupKey, errorCode);
      }
    } catch {
      // sessionStorage unavailable — proceed once
    }

    if (alreadySent) {
      this.setState({ notifyStatus: 'sent' });
      return;
    }

    this.setState({ notifyStatus: 'sending' });

    const userInitials =
      (typeof window !== 'undefined' && (window as any)?.__helix__?.user?.initials) || '';
    const userEmail =
      (typeof window !== 'undefined' && (window as any)?.__helix__?.user?.email) || '';

    const payload = {
      errorCode,
      message: error?.message || String(error),
      stack: error?.stack || '',
      componentStack: errorInfo?.componentStack || '',
      url: typeof window !== 'undefined' ? window.location.href : '',
      userInitials,
      userEmail,
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: errorTimestamp,
    };

    const showSent = () => {
      // Keep the envelope in the air for a beat so the animation reads.
      window.setTimeout(() => {
        this.setState((prev) => (prev.notifyStatus === 'sending' ? { notifyStatus: 'sent' } : null));
      }, 700);
    };

    try {
      void fetch('/api/teams-notify/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then((resp) => {
          if (resp.ok) {
            showSent();
          } else {
            this.setState({ notifyStatus: 'failed' });
          }
        })
        .catch(() => {
          this.setState({ notifyStatus: 'failed' });
        });
    } catch {
      this.setState({ notifyStatus: 'failed' });
    }
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleCopyReference = (): void => {
    const code = this.state.errorCode;
    if (!code) return;
    try {
      void navigator.clipboard?.writeText(code);
    } catch {
      // ignore — copy is a nice-to-have
    }
  };

  renderNotifyStatus(tokens: {
    accent: string;
    borderStrong: string;
    borderSubtle: string;
    surfaceInset: string;
    textPrimary: string;
    textHelp: string;
  }): ReactNode {
    const { accent, borderSubtle, surfaceInset, textPrimary, textHelp } = tokens;
    const status = this.state.notifyStatus;
    const sending = status === 'sending' || status === 'idle';
    const sent = status === 'sent';
    const failed = status === 'failed';

    const label = sent
      ? 'Luke has been notified'
      : failed
        ? "Couldn't reach Luke just now"
        : 'Notifying Luke';
    const sub = sent
      ? "He'll take a look as soon as he's free."
      : failed
        ? 'The reference below has been logged locally — you can share it directly.'
        : 'Sending the details over to Teams.';

    return (
      <div
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 16px',
          background: surfaceInset,
          border: `1px solid ${borderSubtle}`,
          marginBottom: 22,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'relative',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Envelope */}
          <svg
            width={26}
            height={26}
            viewBox="0 0 24 24"
            fill="none"
            stroke={sent ? textHelp : accent}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: 'absolute',
              opacity: sent ? 0.55 : 1,
              transform: sending ? 'translateY(0)' : sent ? 'translateY(-2px)' : 'none',
              animation: sending ? 'helix-envelope-bob 1.6s ease-in-out infinite' : 'none',
              transition: 'opacity 0.25s ease, transform 0.4s ease',
            }}
          >
            <rect x={3} y={5} width={18} height={14} rx={0} />
            <path d="M3 7l9 6 9-6" />
          </svg>

          {/* Tick — only rendered when sent, draws on with stroke-dashoffset */}
          {sent && (
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colours.green}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                background: surfaceInset,
                padding: 1,
              }}
            >
              <path
                d="M5 12.5l4.5 4.5L19 7"
                style={{
                  strokeDasharray: 24,
                  strokeDashoffset: 24,
                  animation: 'helix-tick-draw 0.45s ease-out forwards',
                }}
              />
            </svg>
          )}

          {failed && (
            <span
              style={{
                position: 'absolute',
                right: -1,
                bottom: -1,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: colours.cta,
                boxShadow: `0 0 0 2px ${surfaceInset}`,
              }}
            />
          )}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: 0.2,
              color: textPrimary,
            }}
          >
            {label}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11.5,
              color: textHelp,
              lineHeight: 1.4,
            }}
          >
            {sub}
          </div>
        </div>
      </div>
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = process.env.NODE_ENV === 'development';
      const supportRef = this.state.errorCode;
      const capturedAt = this.state.errorTimestamp
        ? new Date(this.state.errorTimestamp)
        : null;

      // Brand tokens (mirrors the dark surface ladder used elsewhere).
      const surfaceCard = 'rgba(10, 28, 50, 0.92)';
      const surfaceInset = 'rgba(6, 23, 51, 0.55)';
      const borderSubtle = 'rgba(148, 163, 184, 0.18)';
      const borderStrong = 'rgba(148, 163, 184, 0.32)';
      const textPrimary = '#f3f4f6';
      const textBody = '#cbd5e1';
      const textHelp = '#94a3b8';
      const accent = colours.highlight;

      const linkButtonStyle: React.CSSProperties = {
        background: 'none',
        border: 'none',
        color: textHelp,
        fontSize: 12,
        letterSpacing: 0.3,
        cursor: 'pointer',
        fontFamily: 'Raleway, sans-serif',
        padding: '4px 6px',
        borderRadius: 0,
        transition: 'color 0.15s ease',
      };

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 24,
            background: `radial-gradient(120% 80% at 50% 0%, ${colours.helixBlue} 0%, ${colours.darkBlue} 45%, ${colours.websiteBlue} 100%)`,
            fontFamily: 'Raleway, sans-serif',
            color: textPrimary,
            overflow: 'hidden',
          }}
        >
          <style>{`
            @keyframes helix-envelope-bob {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-3px); }
            }
            @keyframes helix-tick-draw {
              to { stroke-dashoffset: 0; }
            }
          `}</style>
          {/* Subtle grid wash, kept faint so it never competes with the card */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7), transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7), transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 520,
              background: surfaceCard,
              border: `1px solid ${borderSubtle}`,
              padding: '36px 36px 28px',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
            }}
          >
            {/* Status pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                border: `1px solid ${borderStrong}`,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: textHelp,
                marginBottom: 22,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: colours.cta,
                  boxShadow: `0 0 0 3px ${colours.cta}22`,
                }}
              />
              Issue logged
            </div>

            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: -0.2,
                margin: 0,
                color: textPrimary,
                lineHeight: 1.25,
              }}
            >
              We hit a snag
            </h1>
            <p
              style={{
                margin: '10px 0 22px',
                fontSize: 13.5,
                lineHeight: 1.55,
                color: textBody,
                maxWidth: 440,
              }}
            >
              Your work is safe and the rest of the app is still running. We've
              flagged this automatically so the team can take a look.
            </p>

            {/* Notification status — replaces the action ladder */}
            {this.renderNotifyStatus({
              accent,
              borderStrong,
              borderSubtle,
              surfaceInset,
              textPrimary,
              textHelp,
            })}

            {/* Quiet metadata strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                background: surfaceInset,
                border: `1px solid ${borderSubtle}`,
                fontSize: 11.5,
                color: textHelp,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>
                  Ref
                </span>
                <span
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                    fontSize: 12,
                    color: textPrimary,
                    letterSpacing: 0.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={supportRef ?? ''}
                >
                  {supportRef ?? 'unknown'}
                </span>
                {supportRef && (
                  <button
                    type="button"
                    onClick={this.handleCopyReference}
                    aria-label="Copy support reference"
                    style={{
                      ...linkButtonStyle,
                      fontSize: 10.5,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: textHelp,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = textPrimary;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = textHelp;
                    }}
                  >
                    Copy
                  </button>
                )}
              </div>
              {capturedAt && (
                <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  {capturedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {capturedAt.toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Reload page is intentionally a quiet last resort */}
            <div
              style={{
                marginTop: 18,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={this.handleReload}
                style={linkButtonStyle}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = textPrimary;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = textHelp;
                }}
              >
                Reload the whole app
              </button>
            </div>

            {isDev && this.state.error && (
              <details
                style={{
                  marginTop: 22,
                  padding: '12px 14px',
                  background: surfaceInset,
                  border: `1px solid ${borderSubtle}`,
                  fontSize: 12,
                  color: textBody,
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: textPrimary,
                    letterSpacing: 0.3,
                    fontSize: 11,
                    textTransform: 'uppercase',
                  }}
                >
                  Developer details
                </summary>
                <pre
                  style={{
                    marginTop: 10,
                    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                    fontSize: 11.5,
                    color: colours.cta,
                    overflow: 'auto',
                    maxHeight: 160,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre
                    style={{
                      marginTop: 8,
                      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                      fontSize: 10.5,
                      color: textHelp,
                      overflow: 'auto',
                      maxHeight: 220,
                      whiteSpace: 'pre',
                    }}
                  >
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
