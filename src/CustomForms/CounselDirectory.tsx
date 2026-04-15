// src/CustomForms/CounselDirectory.tsx
// Directory view for barristers/counsel with search/filter/export capabilities

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { DetailsList, DetailsListLayoutMode, SelectionMode } from '@fluentui/react/lib/DetailsList';
import type { IColumn } from '@fluentui/react/lib/DetailsList';
import { Icon } from '@fluentui/react/lib/Icon';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Link } from '@fluentui/react/lib/Link';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { UserData } from '../app/functionality/types';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { practiceAreasByArea } from '../tabs/instructions/MatterOpening/config';
import {
  getFormContainerStyle,
  getFormScrollContainerStyle,
  getFormCardStyle,
  getFormHeaderStyle,
  getFormHeaderTitleStyle,
  getFormDefaultButtonStyles,
  getDropdownStyles,
  getMessageBarStyle,
  formAccentColors
} from './shared/formStyles';

interface CounselDirectoryProps {
  userData?: UserData[];
  currentUser?: UserData;
  onBack?: () => void;
}

interface Counsel {
  id: number;
  prefix: string;
  first_name: string;
  last_name: string;
  chambers_name: string;
  company_number: string;
  email: string;
  clerks_email: string;
  phone: string;
  website: string;
  cv_url: string;
  area_of_work: string;
  worktype: string;
  price_tier: string;
  introduced_by: string;
  source: string;
  notes: string;
  created_by: string;
  created_at: string;
  is_active: boolean;
}

const priceTierBadge = (tier: string, isDarkMode: boolean): React.CSSProperties => {
  const colors: Record<string, { bg: string; bgDark: string; text: string }> = {
    cheap: { bg: 'rgba(32, 178, 108, 0.1)', bgDark: 'rgba(32, 178, 108, 0.2)', text: colours.green },
    mid: { bg: 'rgba(54, 144, 206, 0.1)', bgDark: 'rgba(54, 144, 206, 0.2)', text: '#3690CE' },
    expensive: { bg: 'rgba(13, 47, 96, 0.1)', bgDark: 'rgba(13, 47, 96, 0.2)', text: '#0D2F60' },
  };
  const { bg, bgDark, text } = colors[tier] || colors.mid;
  return {
    background: isDarkMode ? bgDark : bg,
    color: text,
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: 500,
    textTransform: 'capitalize' as const,
  };
};

const CounselDirectoryContent: React.FC<CounselDirectoryProps> = ({ onBack }) => {
  const { isDarkMode } = useTheme();
  const accentColor = formAccentColors.counsel;

  const [counsel, setCounsel] = useState<Counsel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [priceTierFilter, setPriceTierFilter] = useState<string>('');

  // Styles
  const containerStyle = getFormContainerStyle(isDarkMode);
  const scrollContainerStyle = getFormScrollContainerStyle(isDarkMode);
  const cardStyle = { ...getFormCardStyle(isDarkMode), maxWidth: '1200px' };
  const headerStyle = getFormHeaderStyle(isDarkMode, accentColor);
  const defaultButtonStyles = getFormDefaultButtonStyles(isDarkMode);

  const filterSectionStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(6, 23, 51, 0.3)' : '#F4F4F6',
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
    borderLeft: `3px solid ${accentColor}`,
    padding: '16px 20px',
    marginBottom: '20px',
  };

  // Build area options from config
  const areaOptions: IDropdownOption[] = useMemo(() => {
    const areas = Object.keys(practiceAreasByArea);
    return [
      { key: '', text: 'All Areas' },
      ...areas.map(area => ({ key: area, text: area })),
    ];
  }, []);

  const priceTierOptions: IDropdownOption[] = [
    { key: '', text: 'All Price Tiers' },
    { key: 'cheap', text: 'Budget-friendly' },
    { key: 'mid', text: 'Mid-range' },
    { key: 'expensive', text: 'Premium' },
  ];

  const fetchCounsel = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/counsel`);

      if (!response.ok) {
        throw new Error('Failed to fetch counsel');
      }

      const data = await response.json();
      setCounsel(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounsel();
  }, [fetchCounsel]);

  const filteredCounsel = useMemo(() => {
    return counsel.filter(item => {
      const searchLower = searchText.toLowerCase();
      const matchesSearch = !searchText || 
        item.first_name?.toLowerCase().includes(searchLower) ||
        item.last_name?.toLowerCase().includes(searchLower) ||
        item.chambers_name?.toLowerCase().includes(searchLower) ||
        item.email?.toLowerCase().includes(searchLower) ||
        item.worktype?.toLowerCase().includes(searchLower);

      const matchesArea = !areaFilter || item.area_of_work === areaFilter;
      const matchesPriceTier = !priceTierFilter || item.price_tier === priceTierFilter;

      return matchesSearch && matchesArea && matchesPriceTier;
    });
  }, [counsel, searchText, areaFilter, priceTierFilter]);

  const handleExportCsv = useCallback(async () => {
    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/counsel/export/csv`);
      
      if (!response.ok) throw new Error('Failed to export');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `counsel-directory-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, []);

  const columns: IColumn[] = useMemo(() => [
    {
      key: 'name',
      name: 'Name',
      minWidth: 150,
      maxWidth: 200,
      onRender: (item: Counsel) => (
        <Text style={{ fontWeight: 500, color: isDarkMode ? '#f3f4f6' : '#374151' }}>
          {item.prefix ? `${item.prefix} ` : ''}{item.first_name} {item.last_name}
        </Text>
      ),
    },
    {
      key: 'chambers',
      name: 'Chambers',
      minWidth: 150,
      maxWidth: 200,
      onRender: (item: Counsel) => (
        <Text style={{ color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
          {item.chambers_name || '-'}
        </Text>
      ),
    },
    {
      key: 'area',
      name: 'Area',
      minWidth: 100,
      maxWidth: 150,
      onRender: (item: Counsel) => (
        <Text style={{ color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
          {item.area_of_work || '-'}
        </Text>
      ),
    },
    {
      key: 'worktype',
      name: 'Work Type',
      minWidth: 100,
      maxWidth: 150,
      onRender: (item: Counsel) => (
        <Text style={{ color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
          {item.worktype || '-'}
        </Text>
      ),
    },
    {
      key: 'priceTier',
      name: 'Price',
      minWidth: 80,
      maxWidth: 100,
      onRender: (item: Counsel) => (
        <span style={priceTierBadge(item.price_tier, isDarkMode)}>
          {item.price_tier || 'mid'}
        </span>
      ),
    },
    {
      key: 'contact',
      name: 'Contact',
      minWidth: 180,
      maxWidth: 250,
      onRender: (item: Counsel) => (
        <Stack tokens={{ childrenGap: 4 }}>
          {item.email && (
            <Link href={`mailto:${item.email}`} style={{ color: accentColor }}>
              {item.email}
            </Link>
          )}
          {item.clerks_email && (
            <Text variant="small" style={{ color: isDarkMode ? '#6B6B6B' : '#A0A0A0' }}>
              Clerks: <Link href={`mailto:${item.clerks_email}`} style={{ color: accentColor }}>{item.clerks_email}</Link>
            </Text>
          )}
        </Stack>
      ),
    },
    {
      key: 'source',
      name: 'Source',
      minWidth: 100,
      maxWidth: 150,
      onRender: (item: Counsel) => (
        <Text style={{ color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
          {item.source || '-'}
        </Text>
      ),
    },
    {
      key: 'actions',
      name: '',
      minWidth: 80,
      maxWidth: 80,
      onRender: (item: Counsel) => (
        <Stack horizontal tokens={{ childrenGap: 4 }}>
          {item.website && (
            <IconButton
              iconProps={{ iconName: 'Globe' }}
              title="Website"
              onClick={() => window.open(item.website, '_blank')}
              styles={{
                root: { color: isDarkMode ? '#A0A0A0' : '#6B6B6B' },
                rootHovered: { color: accentColor },
              }}
            />
          )}
          {item.cv_url && (
            <IconButton
              iconProps={{ iconName: 'PDF' }}
              title="View CV"
              onClick={() => window.open(item.cv_url, '_blank')}
              styles={{
                root: { color: isDarkMode ? '#A0A0A0' : '#6B6B6B' },
                rootHovered: { color: accentColor },
              }}
            />
          )}
        </Stack>
      ),
    },
  ], [isDarkMode, accentColor]);

  return (
    <div style={containerStyle}>
      <div style={scrollContainerStyle}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={headerStyle}>
            <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
                <Icon iconName="ContactList" style={{ fontSize: 20, color: accentColor }} />
                <div>
                  <Text style={getFormHeaderTitleStyle(isDarkMode)}>
                    Counsel Directory
                  </Text>
                  <Text style={{ fontSize: '13px', color: isDarkMode ? '#A0A0A0' : '#6B6B6B', display: 'block', marginTop: '2px' }}>
                    {filteredCounsel.length} barristers found
                  </Text>
                </div>
              </Stack>
              <Stack horizontal tokens={{ childrenGap: 8 }}>
                <DefaultButton
                  text="Export CSV"
                  iconProps={{ iconName: 'Download' }}
                  onClick={handleExportCsv}
                  styles={defaultButtonStyles}
                />
                {onBack && (
                  <DefaultButton 
                    text="Back" 
                    onClick={onBack} 
                    styles={defaultButtonStyles}
                    iconProps={{ iconName: 'Back' }}
                  />
                )}
              </Stack>
            </Stack>
          </div>

          {/* Content */}
          <div style={{ padding: '24px' }}>
            {error && (
              <MessageBar
                messageBarType={MessageBarType.error}
                onDismiss={() => setError(null)}
                style={getMessageBarStyle(isDarkMode)}
              >
                {error}
              </MessageBar>
            )}

            {/* Filters */}
            <div style={filterSectionStyle}>
              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end" wrap>
                <Stack.Item grow>
                  <SearchBox
                    placeholder="Search by name, chambers, email, or work type"
                    value={searchText}
                    onChange={(_, val) => setSearchText(val || '')}
                    styles={{
                      root: { 
                        minWidth: 280,
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : '#ffffff',
                        borderRadius: 0,
                      },
                      field: {
                        color: isDarkMode ? '#f3f4f6' : '#374151',
                        fontFamily: "'Raleway', 'Segoe UI', sans-serif",
                      },
                    }}
                  />
                </Stack.Item>
                <Dropdown
                  label="Area of Work"
                  options={areaOptions}
                  selectedKey={areaFilter}
                  onChange={(_, opt) => setAreaFilter(opt?.key as string || '')}
                  styles={{
                    ...getDropdownStyles(isDarkMode),
                    dropdown: { ...((getDropdownStyles(isDarkMode) as any).dropdown || {}), minWidth: 160 },
                  }}
                />
                <Dropdown
                  label="Price Tier"
                  options={priceTierOptions}
                  selectedKey={priceTierFilter}
                  onChange={(_, opt) => setPriceTierFilter(opt?.key as string || '')}
                  styles={{
                    ...getDropdownStyles(isDarkMode),
                    dropdown: { ...((getDropdownStyles(isDarkMode) as any).dropdown || {}), minWidth: 140 },
                  }}
                />
                <DefaultButton
                  text="Refresh"
                  iconProps={{ iconName: 'Refresh' }}
                  onClick={fetchCounsel}
                  disabled={isLoading}
                  styles={defaultButtonStyles}
                />
              </Stack>
            </div>

            {/* Data Table */}
            {isLoading ? (
              <Stack horizontalAlign="center" style={{ padding: '48px' }}>
                <Spinner size={SpinnerSize.large} label="Loading counsel..." />
              </Stack>
            ) : filteredCounsel.length === 0 ? (
              <Stack horizontalAlign="center" style={{ padding: '48px' }}>
                <Icon 
                  iconName="SearchData" 
                  style={{ 
                    fontSize: 48, 
                    color: isDarkMode ? '#6B6B6B' : '#A0A0A0', 
                    marginBottom: '16px' 
                  }} 
                />
                <Text style={{ color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
                  No counsel found matching your criteria.
                </Text>
              </Stack>
            ) : (
              <DetailsList
                items={filteredCounsel}
                columns={columns}
                layoutMode={DetailsListLayoutMode.justified}
                selectionMode={SelectionMode.none}
                styles={{
                  root: {
                    background: isDarkMode ? 'rgba(6, 23, 51, 0.3)' : '#ffffff',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    overflow: 'hidden',
                  },
                  headerWrapper: {
                    selectors: {
                      '.ms-DetailsHeader': {
                        background: isDarkMode ? 'rgba(6, 23, 51, 0.5)' : '#F4F4F6',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                      },
                      '.ms-DetailsHeader-cell': {
                        color: isDarkMode ? '#f3f4f6' : '#374151',
                        fontWeight: 600,
                      },
                    },
                  },
                  contentWrapper: {
                    selectors: {
                      '.ms-DetailsRow': {
                        background: 'transparent',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}`,
                      },
                      '.ms-DetailsRow:hover': {
                        background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Passcode guard removed - direct access enabled
const CounselDirectory: React.FC<CounselDirectoryProps> = (props) => (
  <CounselDirectoryContent {...props} />
);

export default CounselDirectory;
