/**
 * PeopleSearchPanel — modal for cross-database people lookup.
 * Searches by name, email, or phone and shows deduplicated results
 * from both databases with subtle source indicators.
 * Uses FluentUI Modal to match existing app modals (e.g. CreateContactModal).
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, IconButton, Icon, Spinner, SpinnerSize, Text } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

export interface PeopleSearchResult {
  id: string;
  date: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  poc: string;
  aow: string;
  tow: string;
  moc: string;
  stage: string | null;
  claim: string | null;
  acid: string | null;
  notes: string;
  value: string | null;
  source: string | null;
  rating: string | null;
  _src: 'instructions' | 'legacy';
}

interface PeopleSearchPanelProps {
  isOpen: boolean;
  onDismiss: () => void;
  /** Called when user clicks a result — passes the enquiry ID and source */
  onResultClick?: (result: PeopleSearchResult) => void;
}

/** Group results by person (email), showing touchpoint count */
interface PersonGroup {
  email: string;
  name: string;
  phone: string;
  touchpoints: PeopleSearchResult[];
  latestDate: Date;
  latestPoc: string;
  latestStage: string | null;
}

function groupByPerson(results: PeopleSearchResult[]): PersonGroup[] {
  const map = new Map<string, PeopleSearchResult[]>();

  results.forEach(r => {
    const key = (r.email || `${r.first} ${r.last}`).toLowerCase().trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });

  return Array.from(map.entries()).map(([, touchpoints]) => {
    // Sort touchpoints newest first
    touchpoints.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
    const latest = touchpoints[0];
    return {
      email: latest.email,
      name: `${latest.first} ${latest.last}`.trim(),
      phone: latest.phone,
      touchpoints,
      latestDate: latest.date ? new Date(latest.date) : new Date(0),
      latestPoc: latest.poc,
      latestStage: latest.stage,
    };
  }).sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
}

function formatDate(d: Date | string | null): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pocInitials(poc: string): string {
  if (!poc) return '';
  const local = poc.includes('@') ? poc.split('@')[0] : poc;
  if (local.length <= 3 && !local.includes('.')) return local.toUpperCase();
  if (local.includes('.')) return local.split('.').map(p => p[0]).join('').toUpperCase();
  return local.substring(0, 2).toUpperCase();
}

const PeopleSearchPanel: React.FC<PeopleSearchPanelProps> = ({ isOpen, onDismiss, onResultClick }) => {
  const { isDarkMode } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PeopleSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    } else {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setError(null);
      setExpandedPerson(null);
    }
  }, [isOpen]);

  const doSearch = useCallback(async (searchTerm: string) => {
    if (searchTerm.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const resp = await fetch(`/api/people-search?q=${encodeURIComponent(searchTerm.trim())}`);
      if (!resp.ok) throw new Error(`Search failed (${resp.status})`);
      const data = await resp.json();
      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 400);
  }, [doSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
    }
  }, [doSearch, query]);

  const groups = groupByPerson(results);

  const borderCol = isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(15, 23, 42, 0.08)';
  const textPrimary = isDarkMode ? '#e0e0e0' : '#1a1a1a';
  const textSecondary = isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#6B6B6B';
  const cardBg = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const cardHoverBg = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  const highlightBg = isDarkMode ? 'rgba(102,170,232,0.1)' : 'rgba(102,170,232,0.06)';

  const modalStyles = {
    main: {
      background: isDarkMode
        ? 'rgba(11, 18, 32, 0.95)'
        : 'rgba(255, 255, 255, 0.78)',
      borderRadius: 12,
      border: `1px solid ${borderCol}`,
      boxShadow: isDarkMode
        ? '0 10px 30px rgba(0, 0, 0, 0.5)'
        : '0 10px 30px rgba(2, 6, 23, 0.1)',
      backdropFilter: 'blur(10px)',
      padding: 0,
      maxWidth: 600,
      width: '90vw',
      maxHeight: '80vh',
      overflow: 'hidden' as const,
    }
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 28px',
    borderBottom: `1px solid ${borderCol}`,
    background: isDarkMode
      ? 'rgba(15, 23, 42, 0.3)'
      : 'rgba(255, 255, 255, 0.6)',
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      isBlocking={false}
      styles={{ main: modalStyles.main }}
    >
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon iconName="Search" style={{ fontSize: 16, color: colours.highlight }} />
          <Text variant="large" styles={{
            root: {
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontFamily: 'Raleway, sans-serif',
            }
          }}>
            People Search
          </Text>
        </div>
        <IconButton
          iconProps={{ iconName: 'Cancel' }}
          onClick={onDismiss}
          styles={{
            root: {
              color: isDarkMode ? colours.dark.subText : colours.light.subText,
            }
          }}
        />
      </div>

      {/* Search input */}
      <div style={{ padding: '20px 28px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : '#FFFFFF',
          borderRadius: 8, padding: '0 14px', height: 40,
          border: `1px solid ${isDarkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(15, 23, 42, 0.12)'}`,
          transition: 'border-color 200ms',
        }}>
          <Icon iconName="Search" style={{ fontSize: 14, color: textSecondary, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Name, email, or phone..."
            style={{
              flex: 1, border: 'none', background: 'none', outline: 'none',
              font: '13px Raleway, sans-serif', color: textPrimary,
              padding: '8px 0',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setHasSearched(false); inputRef.current?.focus(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: textSecondary }}
            >
              <Icon iconName="Cancel" style={{ fontSize: 11 }} />
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: textSecondary, marginTop: 6, paddingLeft: 2, opacity: 0.7, fontFamily: 'Raleway, sans-serif' }}>
          Search across all enquiry records
        </div>
      </div>

      {/* Results */}
      <div style={{
        overflowY: 'auto', padding: '0 28px 20px',
        maxHeight: 'calc(80vh - 200px)',
        fontFamily: 'Raleway, sans-serif',
      }}>
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size={SpinnerSize.medium} label="Searching..." />
          </div>
        )}

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 8, fontSize: 12,
            background: isDarkMode ? 'rgba(255,80,80,0.1)' : 'rgba(255,80,80,0.06)',
            color: isDarkMode ? '#ff8888' : '#cc3333',
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {!isLoading && hasSearched && groups.length === 0 && !error && (
          <div style={{
            textAlign: 'center', padding: 40, color: textSecondary, fontSize: 13,
          }}>
            <Icon iconName="SearchIssue" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }} />
            No results found
          </div>
        )}

        {!isLoading && groups.map((group, gi) => {
          const isExpanded = expandedPerson === (group.email || group.name);
          const hasMultiple = group.touchpoints.length > 1;

          return (
            <div
              key={`${group.email || group.name}-${gi}`}
              style={{
                marginBottom: 8,
                borderRadius: 10,
                border: `1px solid ${borderCol}`,
                overflow: 'hidden',
                transition: 'all 200ms',
              }}
            >
              {/* Person header */}
              <div
                onClick={() => {
                  if (hasMultiple) {
                    setExpandedPerson(isExpanded ? null : (group.email || group.name));
                  } else if (onResultClick) {
                    onResultClick(group.touchpoints[0]);
                  }
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = cardHoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = cardBg; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: cardBg, cursor: 'pointer', transition: 'background 150ms',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: isDarkMode ? 'rgba(102,170,232,0.15)' : 'rgba(102,170,232,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: colours.highlight, flexShrink: 0,
                }}>
                  {(group.name[0] || '?').toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {group.name || 'Unknown'}
                    </span>
                    {group.latestStage && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                        padding: '1px 6px', borderRadius: 8,
                        background: group.latestStage === 'claimed'
                          ? (isDarkMode ? 'rgba(76,175,80,0.15)' : 'rgba(76,175,80,0.1)')
                          : highlightBg,
                        color: group.latestStage === 'claimed'
                          ? (isDarkMode ? '#81c784' : '#388e3c')
                          : colours.highlight,
                      }}>
                        {group.latestStage}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: textSecondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.email || group.phone || 'No contact details'}
                  </div>
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {group.latestPoc && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: colours.highlight,
                      background: highlightBg, padding: '2px 6px', borderRadius: 8,
                    }}>
                      {pocInitials(group.latestPoc)}
                    </span>
                  )}
                  {hasMultiple && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: textSecondary,
                      background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                      padding: '2px 7px', borderRadius: 8,
                    }}>
                      {group.touchpoints.length}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: textSecondary, whiteSpace: 'nowrap' }}>
                    {formatDate(group.latestDate)}
                  </span>
                  {hasMultiple && (
                    <Icon
                      iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
                      style={{ fontSize: 10, color: textSecondary, transition: 'transform 200ms' }}
                    />
                  )}
                </div>
              </div>

              {/* Expanded touchpoints */}
              {isExpanded && hasMultiple && (
                <div style={{ borderTop: `1px solid ${borderCol}` }}>
                  {group.touchpoints.map((tp, ti) => (
                    <div
                      key={`${tp.id}-${tp._src}-${ti}`}
                      onClick={() => onResultClick?.(tp)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = cardHoverBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 14px 8px 58px',
                        cursor: onResultClick ? 'pointer' : 'default',
                        transition: 'background 150ms',
                        borderBottom: ti < group.touchpoints.length - 1 ? `1px solid ${borderCol}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 11, color: textSecondary, width: 80, flexShrink: 0 }}>
                        {formatDate(tp.date)}
                      </span>
                      <span style={{
                        fontSize: 11, color: textPrimary, flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {tp.aow || '—'}
                      </span>
                      {tp.poc && (
                        <span style={{
                          fontSize: 9, fontWeight: 600, color: colours.highlight,
                          background: highlightBg, padding: '1px 5px', borderRadius: 6,
                        }}>
                          {pocInitials(tp.poc)}
                        </span>
                      )}
                      <span
                        title={tp._src === 'instructions' ? 'Current system' : 'Archive'}
                        style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: tp._src === 'instructions'
                            ? (isDarkMode ? '#81c784' : '#4caf50')
                            : (isDarkMode ? '#666' : '#bbb'),
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Single result — show notes preview if not expanded */}
              {!hasMultiple && group.touchpoints[0]?.notes && (
                <div style={{
                  padding: '4px 14px 8px 58px',
                  fontSize: 11, color: textSecondary, lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {group.touchpoints[0].notes.substring(0, 120)}{group.touchpoints[0].notes.length > 120 ? '...' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer — result count */}
      {hasSearched && !isLoading && (
        <div style={{
          padding: '10px 28px',
          borderTop: `1px solid ${borderCol}`,
          fontSize: 11, color: textSecondary,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'Raleway, sans-serif',
        }}>
          <span>{groups.length} {groups.length === 1 ? 'person' : 'people'} · {results.length} {results.length === 1 ? 'record' : 'records'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isDarkMode ? '#81c784' : '#4caf50', display: 'inline-block' }} />
              Current
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isDarkMode ? '#666' : '#bbb', display: 'inline-block' }} />
              Archive
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PeopleSearchPanel;
