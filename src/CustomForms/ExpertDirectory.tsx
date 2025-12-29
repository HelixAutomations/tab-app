// src/CustomForms/ExpertDirectory.tsx
// Directory view for expert witnesses with search/filter/export capabilities
// Protected by passcode guard

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  Text,
  DefaultButton,
  MessageBar,
  MessageBarType,
  DetailsList,
  DetailsListLayoutMode,
  SelectionMode,
  IColumn,
  Icon,
  IconButton,
  Dropdown,
  IDropdownOption,
  Spinner,
  SpinnerSize,
  SearchBox,
  Link,
} from '@fluentui/react';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { UserData } from '../app/functionality/types';
import { useTheme } from '../app/functionality/ThemeContext';
import PasscodeGuard from './shared/PasscodeGuard';
import { practiceAreasByArea } from '../tabs/instructions/MatterOpening/config';
import {
  getFormContainerStyle,
  getFormScrollContainerStyle,
  getFormCardStyle,
  getFormHeaderStyle,
  getFormSectionStyle,
  getFormDefaultButtonStyles,
  formAccentColors
} from './shared/formStyles';

interface ExpertDirectoryProps {
  userData?: UserData[];
  currentUser?: UserData;
  onBack?: () => void;
}

interface Expert {
  id: number;
  prefix: string;
  first_name: string;
  last_name: string;
  company_name: string;
  company_number: string;
  email: string;
  phone: string;
  website: string;
  cv_url: string;
  area_of_work: string;
  worktype: string;
  introduced_by: string;
  source: string;
  notes: string;
  created_by: string;
  created_at: string;
  is_active: boolean;
}

const ExpertDirectoryContent: React.FC<ExpertDirectoryProps> = ({ onBack }) => {
  const { isDarkMode } = useTheme();
  const accentColor = formAccentColors.expert;

  const [experts, setExperts] = useState<Expert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('');

  // Styles
  const containerStyle = getFormContainerStyle(isDarkMode);
  const scrollContainerStyle = getFormScrollContainerStyle(isDarkMode);
  const cardStyle = { ...getFormCardStyle(isDarkMode), maxWidth: '1200px' };
  const headerStyle = getFormHeaderStyle(isDarkMode, accentColor);
  const sectionStyle = getFormSectionStyle(isDarkMode);
  const defaultButtonStyles = getFormDefaultButtonStyles(isDarkMode);

  const filterSectionStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
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

  const fetchExperts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/experts`);

      if (!response.ok) {
        throw new Error('Failed to fetch experts');
      }

      const data = await response.json();
      setExperts(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExperts();
  }, [fetchExperts]);

  const filteredExperts = useMemo(() => {
    return experts.filter(expert => {
      const searchLower = searchText.toLowerCase();
      const matchesSearch = !searchText || 
        expert.first_name?.toLowerCase().includes(searchLower) ||
        expert.last_name?.toLowerCase().includes(searchLower) ||
        expert.company_name?.toLowerCase().includes(searchLower) ||
        expert.email?.toLowerCase().includes(searchLower) ||
        expert.worktype?.toLowerCase().includes(searchLower);

      const matchesArea = !areaFilter || expert.area_of_work === areaFilter;

      return matchesSearch && matchesArea;
    });
  }, [experts, searchText, areaFilter]);

  const handleExportCsv = useCallback(async () => {
    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/experts/export/csv`);
      
      if (!response.ok) throw new Error('Failed to export');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expert-directory-${new Date().toISOString().split('T')[0]}.csv`;
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
      onRender: (item: Expert) => (
        <Text style={{ fontWeight: 500, color: isDarkMode ? '#e2e8f0' : '#374151' }}>
          {item.prefix ? `${item.prefix} ` : ''}{item.first_name} {item.last_name}
        </Text>
      ),
    },
    {
      key: 'company',
      name: 'Company',
      minWidth: 150,
      maxWidth: 200,
      onRender: (item: Expert) => (
        <Text style={{ color: isDarkMode ? '#94a3b8' : '#6b7280' }}>
          {item.company_name || '-'}
        </Text>
      ),
    },
    {
      key: 'area',
      name: 'Area',
      minWidth: 100,
      maxWidth: 150,
      onRender: (item: Expert) => (
        <Text style={{ color: isDarkMode ? '#94a3b8' : '#6b7280' }}>
          {item.area_of_work || '-'}
        </Text>
      ),
    },
    {
      key: 'worktype',
      name: 'Work Type',
      minWidth: 100,
      maxWidth: 150,
      onRender: (item: Expert) => (
        <Text style={{ color: isDarkMode ? '#94a3b8' : '#6b7280' }}>
          {item.worktype || '-'}
        </Text>
      ),
    },
    {
      key: 'contact',
      name: 'Contact',
      minWidth: 180,
      maxWidth: 250,
      onRender: (item: Expert) => (
        <Stack tokens={{ childrenGap: 4 }}>
          {item.email && (
            <Link 
              href={`mailto:${item.email}`}
              style={{ color: accentColor }}
            >
              {item.email}
            </Link>
          )}
          {item.phone && (
            <Text variant="small" style={{ color: isDarkMode ? '#64748b' : '#9ca3af' }}>
              {item.phone}
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
      onRender: (item: Expert) => (
        <Text style={{ color: isDarkMode ? '#94a3b8' : '#6b7280' }}>
          {item.source || '-'}
        </Text>
      ),
    },
    {
      key: 'actions',
      name: '',
      minWidth: 80,
      maxWidth: 80,
      onRender: (item: Expert) => (
        <Stack horizontal tokens={{ childrenGap: 4 }}>
          {item.website && (
            <IconButton
              iconProps={{ iconName: 'Globe' }}
              title="Website"
              onClick={() => window.open(item.website, '_blank')}
              styles={{
                root: { color: isDarkMode ? '#94a3b8' : '#6b7280' },
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
                root: { color: isDarkMode ? '#94a3b8' : '#6b7280' },
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
                  <Text style={{ 
                    fontSize: '18px', 
                    fontWeight: 700, 
                    color: isDarkMode ? '#f1f5f9' : '#1e293b',
                    display: 'block',
                    marginBottom: '2px'
                  }}>
                    Expert Directory
                  </Text>
                  <Text style={{ fontSize: '13px', color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                    {filteredExperts.length} experts found
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
                style={{ marginBottom: '16px' }}
              >
                {error}
              </MessageBar>
            )}

            {/* Filters */}
            <div style={filterSectionStyle}>
              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end" wrap>
                <Stack.Item grow>
                  <SearchBox
                    placeholder="Search by name, company, email, or work type..."
                    value={searchText}
                    onChange={(_, val) => setSearchText(val || '')}
                    styles={{
                      root: { 
                        minWidth: 300,
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        background: isDarkMode ? 'rgba(30,41,59,0.5)' : '#ffffff',
                      },
                      field: {
                        color: isDarkMode ? '#e2e8f0' : '#374151',
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
                    dropdown: { 
                      minWidth: 180,
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                      background: isDarkMode ? 'rgba(30,41,59,0.5)' : '#ffffff',
                    },
                    label: {
                      color: isDarkMode ? '#e2e8f0' : '#374151',
                      fontWeight: 600,
                    },
                    title: {
                      color: isDarkMode ? '#e2e8f0' : '#374151',
                    },
                  }}
                />
                <DefaultButton
                  text="Refresh"
                  iconProps={{ iconName: 'Refresh' }}
                  onClick={fetchExperts}
                  disabled={isLoading}
                  styles={defaultButtonStyles}
                />
              </Stack>
            </div>

            {/* Data Table */}
            {isLoading ? (
              <Stack horizontalAlign="center" style={{ padding: '48px' }}>
                <Spinner size={SpinnerSize.large} label="Loading experts..." />
              </Stack>
            ) : filteredExperts.length === 0 ? (
              <Stack horizontalAlign="center" style={{ padding: '48px' }}>
                <Icon 
                  iconName="SearchData" 
                  style={{ 
                    fontSize: 48, 
                    color: isDarkMode ? '#64748b' : '#9CA3AF', 
                    marginBottom: '16px' 
                  }} 
                />
                <Text style={{ color: isDarkMode ? '#94a3b8' : '#6B7280' }}>
                  No experts found matching your criteria.
                </Text>
              </Stack>
            ) : (
              <DetailsList
                items={filteredExperts}
                columns={columns}
                layoutMode={DetailsListLayoutMode.justified}
                selectionMode={SelectionMode.none}
                styles={{
                  root: {
                    background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#ffffff',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    overflow: 'hidden',
                  },
                  headerWrapper: {
                    selectors: {
                      '.ms-DetailsHeader': {
                        background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                      },
                      '.ms-DetailsHeader-cell': {
                        color: isDarkMode ? '#e2e8f0' : '#374151',
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
const ExpertDirectory: React.FC<ExpertDirectoryProps> = (props) => (
  <ExpertDirectoryContent {...props} />
);

export default ExpertDirectory;
