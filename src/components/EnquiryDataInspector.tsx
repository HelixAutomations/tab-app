import React, { useState, useEffect, useMemo } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { DefaultButton, PrimaryButton, IconButton } from '@fluentui/react/lib/Button';
import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { DetailsList, DetailsListLayoutMode } from '@fluentui/react/lib/DetailsList';
import type { IColumn } from '@fluentui/react/lib/DetailsList';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { Enquiry } from '../app/functionality/types';
import { NewEnquiry } from '../app/functionality/newEnquiryTypes';
import { fetchNewEnquiriesData } from '../app/functionality/fetchNewEnquiries';

interface EnquiryDataInspectorProps {
  enquiries: Enquiry[];
  onClose: () => void;
}

interface EnquiryStats {
  total: number;
  claimed: number;
  unclaimed: number;
  byArea: { [key: string]: number };
  byPoc: { [key: string]: number };
  byRating: { [key: string]: number };
  recentCount: number;
  highValueCount: number;
}

interface DatabaseField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  sampleValue?: string;
}

const EnquiryDataInspector: React.FC<EnquiryDataInspectorProps> = ({ enquiries, onClose }) => {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState<'overview' | 'data' | 'schema' | 'api' | 'validation'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showRawData, setShowRawData] = useState(false);
  const [isLoadingNewData, setIsLoadingNewData] = useState(false);
  const [newEnquiries, setNewEnquiries] = useState<NewEnquiry[]>([]);
  const [apiTestResults, setApiTestResults] = useState<any>(null);

  // Calculate enquiry statistics
  const stats: EnquiryStats = useMemo(() => {
    const byArea: { [key: string]: number } = {};
    const byPoc: { [key: string]: number } = {};
    const byRating: { [key: string]: number } = {};
    let claimed = 0;
    let unclaimed = 0;
    let recentCount = 0;
    let highValueCount = 0;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    enquiries.forEach(enq => {
      // Area of work
      const area = enq.Area_of_Work || 'Unknown';
      byArea[area] = (byArea[area] || 0) + 1;

      // Point of contact
      const poc = enq.Point_of_Contact || 'Unknown';
      byPoc[poc] = (byPoc[poc] || 0) + 1;

      // Rating
      const rating = enq.Rating || 'Unrated';
      byRating[rating] = (byRating[rating] || 0) + 1;

      // Claimed/Unclaimed
      if (poc === 'team@helix-law.com' || poc.toLowerCase().includes('team')) {
        unclaimed++;
      } else {
        claimed++;
      }

      // Recent enquiries (last 7 days)
      if (enq.Touchpoint_Date) {
        const enquiryDate = new Date(enq.Touchpoint_Date);
        if (enquiryDate >= oneWeekAgo) {
          recentCount++;
        }
      }

      // High value enquiries (>£3000)
      if (enq.Value) {
        const value = parseFloat(enq.Value.replace(/[£,]/g, ''));
        if (value >= 3000) {
          highValueCount++;
        }
      }
    });

    return {
      total: enquiries.length,
      claimed,
      unclaimed,
      byArea,
      byPoc,
      byRating,
      recentCount,
      highValueCount,
    };
  }, [enquiries]);

  // Database schema definition
  const databaseSchema: DatabaseField[] = [
    { name: 'id', type: 'int', required: true, description: 'Primary key, auto-increment' },
    { name: 'datetime', type: 'datetime', required: true, description: 'When enquiry was received' },
    { name: 'stage', type: 'varchar(50)', required: true, description: 'Current stage (enquiry, lead, etc.)' },
    { name: 'claim', type: 'datetime', required: false, description: 'Date/time when enquiry was claimed' },
    { name: 'poc', type: 'varchar(100)', required: false, description: 'Point of contact (fee earner email)' },
    { name: 'pitch', type: 'int', required: false, description: 'Reference to Deal ID' },
    { name: 'aow', type: 'varchar(100)', required: true, description: 'Area of work' },
    { name: 'tow', type: 'varchar(100)', required: false, description: 'Type of work' },
    { name: 'moc', type: 'varchar(50)', required: true, description: 'Method of contact' },
    { name: 'rep', type: 'varchar(100)', required: false, description: 'Call taker (if method is call)' },
    { name: 'first', type: 'varchar(100)', required: true, description: 'Client first name' },
    { name: 'last', type: 'varchar(100)', required: true, description: 'Client last name' },
    { name: 'email', type: 'varchar(255)', required: true, description: 'Client email address' },
    { name: 'phone', type: 'varchar(50)', required: false, description: 'Client phone number' },
    { name: 'value', type: 'varchar(100)', required: false, description: 'Estimated value' },
    { name: 'notes', type: 'nvarchar(max)', required: false, description: 'Initial enquiry notes' },
    { name: 'rank', type: 'varchar(50)', required: false, description: 'Relationship level (default: 4)' },
    { name: 'rating', type: 'varchar(50)', required: false, description: 'Quality rating' },
    { name: 'acid', type: 'varchar(100)', required: false, description: 'ActiveCampaign ID' },
    { name: 'card_id', type: 'varchar(100)', required: false, description: 'Card reference ID' },
    { name: 'source', type: 'varchar(100)', required: true, description: 'Source of enquiry' },
    { name: 'url', type: 'nvarchar(max)', required: false, description: 'Referral URL' },
    { name: 'contact_referrer', type: 'varchar(100)', required: false, description: 'Referring contact' },
    { name: 'company_referrer', type: 'varchar(100)', required: false, description: 'Referring company' },
    { name: 'gclid', type: 'varchar(255)', required: false, description: 'Google Click ID' },
  ];

  // Filter enquiries based on search and filters
  const filteredEnquiries = useMemo(() => {
    return enquiries.filter(enq => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          enq.First_Name?.toLowerCase().includes(term) ||
          enq.Last_Name?.toLowerCase().includes(term) ||
          enq.Email?.toLowerCase().includes(term) ||
          enq.Company?.toLowerCase().includes(term) ||
          enq.Area_of_Work?.toLowerCase().includes(term) ||
          enq.Type_of_Work?.toLowerCase().includes(term) ||
          enq.ID?.toLowerCase().includes(term);
        if (!matches) return false;
      }

      // Area filter
      if (selectedArea !== 'All' && enq.Area_of_Work !== selectedArea) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'All') {
        const poc = enq.Point_of_Contact || '';
        const isUnclaimed = poc === 'team@helix-law.com' || poc.toLowerCase().includes('team');
        if (selectedStatus === 'Claimed' && isUnclaimed) return false;
        if (selectedStatus === 'Unclaimed' && !isUnclaimed) return false;
      }

      return true;
    });
  }, [enquiries, searchTerm, selectedArea, selectedStatus]);

  // Test API endpoints
  const testApiEndpoints = async () => {
    setIsLoadingNewData(true);
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: [],
    };

    // Test 1: New enquiries API
    try {
      const start = Date.now();
      const newData = await fetchNewEnquiriesData();
      const duration = Date.now() - start;
      
      results.tests.push({
        name: 'New Enquiries API',
        url: '/api/enquiries',
        status: 'success',
        duration,
        count: newData.length,
        sampleRecord: newData[0] || null,
      });
      
      setNewEnquiries(newData);
    } catch (error) {
      results.tests.push({
        name: 'New Enquiries API',
        url: '/api/enquiries',
        status: 'error',
        error: (error as Error).message,
      });
    }

    // Test 2: Direct endpoint test
    try {
      const start = Date.now();
      const response = await fetch('/api/enquiries', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const duration = Date.now() - start;
      
      if (response.ok) {
        const data = await response.json();
        results.tests.push({
          name: 'Direct API Test',
          url: '/api/enquiries',
          status: 'success',
          duration,
          responseStatus: response.status,
          dataStructure: Array.isArray(data) ? 'array' : typeof data,
          count: Array.isArray(data) ? data.length : (data.enquiries?.length || 0),
        });
      } else {
        results.tests.push({
          name: 'Direct API Test',
          url: '/api/enquiries',
          status: 'error',
          responseStatus: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      results.tests.push({
        name: 'Direct API Test',
        url: '/api/enquiries',
        status: 'error',
        error: (error as Error).message,
      });
    }

    setApiTestResults(results);
    setIsLoadingNewData(false);
  };

  // Get area options for dropdown
  const areaOptions: IDropdownOption[] = [
    { key: 'All', text: 'All Areas' },
    ...Object.keys(stats.byArea).map(area => ({ key: area, text: area }))
  ];

  // Get status options for dropdown
  const statusOptions: IDropdownOption[] = [
    { key: 'All', text: 'All Status' },
    { key: 'Claimed', text: 'Claimed' },
    { key: 'Unclaimed', text: 'Unclaimed' },
  ];

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const renderEnquiryRow = (enquiry: Enquiry, index: number) => {
    const isExpanded = expandedRows.has(enquiry.ID || index.toString());
    const rowId = enquiry.ID || index.toString();

    return (
      <div key={rowId} style={{ 
        marginBottom: '8px',
        border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`,
        borderRadius: '6px',
        overflow: 'hidden'
      }}>
        {/* Summary row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa',
            cursor: 'pointer',
            borderBottom: isExpanded ? `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}` : 'none'
          }}
          onClick={() => toggleRowExpansion(rowId)}
        >
          <IconButton
            iconProps={{ iconName: isExpanded ? 'ChevronDown' : 'ChevronRight' }}
            styles={{ root: { marginRight: '8px' } }}
          />
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '16px', alignItems: 'center' }}>
            <div>
              <Text variant="medium" styles={{ root: { fontWeight: '600' } }}>
                {enquiry.First_Name} {enquiry.Last_Name}
              </Text>
              <Text variant="small" styles={{ root: { color: isDarkMode ? '#888' : '#666' } }}>
                {enquiry.Email}
              </Text>
            </div>
            <Text variant="small">{enquiry.Area_of_Work}</Text>
            <Text variant="small">{enquiry.Point_of_Contact}</Text>
            <Text variant="small">{enquiry.Value || 'N/A'}</Text>
            <Text variant="small">{enquiry.Rating || 'Unrated'}</Text>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div style={{ padding: '16px', backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff' }}>
            {showRawData ? (
              <pre style={{ 
                fontSize: '11px', 
                fontFamily: 'monospace', 
                overflow: 'auto',
                backgroundColor: isDarkMode ? '#0d1117' : '#f6f8fa',
                padding: '12px',
                borderRadius: '4px',
                maxHeight: '300px'
              }}>
                {JSON.stringify(enquiry, null, 2)}
              </pre>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <div>
                  <Text variant="small" styles={{ root: { fontWeight: '600', marginBottom: '4px' } }}>Contact Details</Text>
                  <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                    <div><strong>Phone:</strong> {enquiry.Phone_Number || 'N/A'}</div>
                    <div><strong>Company:</strong> {enquiry.Company || 'N/A'}</div>
                    <div><strong>ID:</strong> {enquiry.ID}</div>
                  </div>
                </div>
                <div>
                  <Text variant="small" styles={{ root: { fontWeight: '600', marginBottom: '4px' } }}>Enquiry Details</Text>
                  <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                    <div><strong>Type of Work:</strong> {enquiry.Type_of_Work || 'N/A'}</div>
                    <div><strong>Method:</strong> {enquiry.Method_of_Contact || 'N/A'}</div>
                    <div><strong>Call Taker:</strong> {enquiry.Call_Taker || 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <Text variant="small" styles={{ root: { fontWeight: '600', marginBottom: '4px' } }}>Dates & Status</Text>
                  <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                    <div><strong>Date Created:</strong> {enquiry.Date_Created || 'N/A'}</div>
                    <div><strong>Touchpoint:</strong> {enquiry.Touchpoint_Date || 'N/A'}</div>
                    <div><strong>Source:</strong> {(enquiry as any).source || 'N/A'}</div>
                  </div>
                </div>
                {enquiry.Initial_first_call_notes && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Text variant="small" styles={{ root: { fontWeight: '600', marginBottom: '4px' } }}>Notes</Text>
                    <div style={{ 
                      fontSize: '12px', 
                      padding: '8px', 
                      backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa', 
                      borderRadius: '4px' 
                    }}>
                      {enquiry.Initial_first_call_notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const tabStyle = (isActive: boolean) => ({
    padding: '8px 16px',
    border: 'none',
    background: isActive ? (isDarkMode ? colours.dark.cardBackground : colours.highlight) : 'transparent',
    color: isActive ? 'white' : (isDarkMode ? '#d1d5db' : '#6b7280'),
    cursor: 'pointer',
    borderRadius: '4px 4px 0 0',
    fontSize: '13px',
    fontWeight: isActive ? '600' : '400',
    transition: 'all 0.15s ease',
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: isDarkMode ? '#1a1a1a' : '#fff',
        borderRadius: 12,
        width: '100%',
        height: '100%',
        maxWidth: '1400px',
        maxHeight: '900px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${isDarkMode ? '#404040' : '#e5e7eb'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: isDarkMode ? '#2d2d2d' : '#ffffff',
        }}>
          <div>
            <Text variant="large" styles={{ root: { fontWeight: '600', color: isDarkMode ? '#ffffff' : '#111827' } }}>
              Enquiry Data Inspector
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? '#888' : '#6b7280', marginTop: '2px' } }}>
              Local development tool for enquiry data analysis and debugging
            </Text>
          </div>
          <IconButton
            iconProps={{ iconName: 'Cancel' }}
            onClick={onClose}
            styles={{
              root: {
                backgroundColor: isDarkMode ? '#404040' : '#f3f4f6',
                color: isDarkMode ? '#ffffff' : '#374151',
              }
            }}
          />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${isDarkMode ? '#404040' : '#e5e7eb'}`,
          backgroundColor: isDarkMode ? '#2d2d2d' : '#fafafa',
          paddingLeft: '12px',
        }}>
          <button style={tabStyle(activeTab === 'overview')} onClick={() => setActiveTab('overview')}>
            Overview ({stats.total})
          </button>
          <button style={tabStyle(activeTab === 'data')} onClick={() => setActiveTab('data')}>
            Data Explorer
          </button>
          <button style={tabStyle(activeTab === 'schema')} onClick={() => setActiveTab('schema')}>
            Database Schema
          </button>
          <button style={tabStyle(activeTab === 'api')} onClick={() => setActiveTab('api')}>
            API Testing
          </button>
          <button style={tabStyle(activeTab === 'validation')} onClick={() => setActiveTab('validation')}>
            Data Validation
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          
          {activeTab === 'overview' && (
            <div>
              {/* Statistics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa', 
                  borderRadius: '8px',
                  border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
                }}>
                  <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.blue } }}>{stats.total}</Text>
                  <Text variant="small">Total Enquiries</Text>
                </div>
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa', 
                  borderRadius: '8px',
                  border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
                }}>
                  <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.green } }}>{stats.claimed}</Text>
                  <Text variant="small">Claimed</Text>
                </div>
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa', 
                  borderRadius: '8px',
                  border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
                }}>
                  <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.orange } }}>{stats.unclaimed}</Text>
                  <Text variant="small">Unclaimed</Text>
                </div>
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa', 
                  borderRadius: '8px',
                  border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
                }}>
                  <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.cta } }}>{stats.recentCount}</Text>
                  <Text variant="small">Recent (7 days)</Text>
                </div>
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa', 
                  borderRadius: '8px',
                  border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
                }}>
                  <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.red } }}>{stats.highValueCount}</Text>
                  <Text variant="small">High Value (£3k+)</Text>
                </div>
              </div>

              {/* Area Breakdown */}
              <div style={{ marginBottom: '24px' }}>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
                  Breakdown by Area of Work
                </Text>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                  {Object.entries(stats.byArea).map(([area, count]) => (
                    <div key={area} style={{
                      padding: '8px 12px',
                      backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa',
                      borderRadius: '4px',
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}>
                      <span>{area}</span>
                      <span style={{ fontWeight: '600' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rating Breakdown */}
              <div>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
                  Quality Ratings
                </Text>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  {Object.entries(stats.byRating).map(([rating, count]) => (
                    <div key={rating} style={{
                      padding: '8px 12px',
                      backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa',
                      borderRadius: '4px',
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}>
                      <span>{rating}</span>
                      <span style={{ fontWeight: '600' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 150px auto', gap: '12px', marginBottom: '20px' }}>
                <TextField
                  placeholder="Search enquiries..."
                  value={searchTerm}
                  onChange={(_, value) => setSearchTerm(value || '')}
                />
                <Dropdown
                  options={areaOptions}
                  selectedKey={selectedArea}
                  onChange={(_, option) => setSelectedArea(option?.key as string)}
                />
                <Dropdown
                  options={statusOptions}
                  selectedKey={selectedStatus}
                  onChange={(_, option) => setSelectedStatus(option?.key as string)}
                />
                <Toggle
                  label="Raw Data"
                  checked={showRawData}
                  onChange={(_, checked) => setShowRawData(checked || false)}
                />
              </div>

              {/* Results count */}
              <Text variant="small" styles={{ root: { marginBottom: '16px', color: isDarkMode ? '#888' : '#666' } }}>
                Showing {filteredEnquiries.length} of {enquiries.length} enquiries
              </Text>

              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1fr',
                gap: '16px',
                padding: '12px 16px',
                backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa',
                fontWeight: '600',
                fontSize: '12px',
                marginBottom: '8px',
                borderRadius: '6px'
              }}>
                <span></span>
                <span>Client</span>
                <span>Area</span>
                <span>Point of Contact</span>
                <span>Value</span>
                <span>Rating</span>
              </div>

              {/* Data rows */}
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {filteredEnquiries.map((enquiry, index) => renderEnquiryRow(enquiry, index))}
              </div>
            </div>
          )}

          {activeTab === 'schema' && (
            <div>
              <MessageBar messageBarType={MessageBarType.info} styles={{ root: { marginBottom: '20px' } }}>
                This shows the complete database schema for the [dbo].[enquiries] table based on the latest specification.
              </MessageBar>

              <div style={{
                border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`,
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 120px 80px 1fr',
                  gap: '16px',
                  padding: '12px 16px',
                  backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa',
                  fontWeight: '600',
                  fontSize: '12px',
                  borderBottom: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
                }}>
                  <span>Field Name</span>
                  <span>Type</span>
                  <span>Required</span>
                  <span>Description</span>
                </div>

                {/* Rows */}
                {databaseSchema.map((field, index) => (
                  <div
                    key={field.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '200px 120px 80px 1fr',
                      gap: '16px',
                      padding: '12px 16px',
                      fontSize: '12px',
                      borderBottom: index < databaseSchema.length - 1 ? `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}` : 'none',
                      backgroundColor: field.required ? (isDarkMode ? '#2d1810' : '#fef3c7') : 'transparent'
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: field.required ? '600' : '400' }}>
                      {field.name}
                    </span>
                    <span style={{ fontFamily: 'monospace', color: colours.blue }}>
                      {field.type}
                    </span>
                    <span style={{ color: field.required ? colours.red : colours.green }}>
                      {field.required ? 'Required' : 'Optional'}
                    </span>
                    <span>{field.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <PrimaryButton
                  text="Test API Endpoints"
                  onClick={testApiEndpoints}
                  disabled={isLoadingNewData}
                />
                {isLoadingNewData && <Spinner size={SpinnerSize.small} />}
              </div>

              {apiTestResults && (
                <div>
                  <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
                    Test Results ({apiTestResults.timestamp})
                  </Text>
                  
                  {apiTestResults.tests.map((test: any, index: number) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        marginBottom: '12px',
                        backgroundColor: test.status === 'success' ? 
                          (isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.08)') : 
                          (isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.08)'),
                        borderRadius: '8px',
                        border: `1px solid ${test.status === 'success' ? colours.green : colours.red}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <Text variant="medium" styles={{ root: { fontWeight: '600' } }}>
                          {test.name}
                        </Text>
                        <span style={{
                          marginLeft: '12px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: '600',
                          backgroundColor: test.status === 'success' ? colours.green : colours.red,
                          color: 'white'
                        }}>
                          {test.status.toUpperCase()}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                        <div><strong>URL:</strong> {test.url}</div>
                        {test.duration && <div><strong>Duration:</strong> {test.duration}ms</div>}
                        {test.count !== undefined && <div><strong>Records:</strong> {test.count}</div>}
                        {test.responseStatus && <div><strong>Status:</strong> {test.responseStatus}</div>}
                        {test.error && <div style={{ color: colours.red }}><strong>Error:</strong> {test.error}</div>}
                        {test.sampleRecord && (
                          <details style={{ marginTop: '8px' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: '600' }}>Sample Record</summary>
                            <pre style={{
                              marginTop: '8px',
                              padding: '8px',
                              backgroundColor: isDarkMode ? '#0d1117' : '#f6f8fa',
                              borderRadius: '4px',
                              fontSize: '10px',
                              overflow: 'auto'
                            }}>
                              {JSON.stringify(test.sampleRecord, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {newEnquiries.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
                    New API Data Sample ({newEnquiries.length} records)
                  </Text>
                  <pre style={{
                    padding: '16px',
                    backgroundColor: isDarkMode ? '#0d1117' : '#f6f8fa',
                    borderRadius: '8px',
                    fontSize: '11px',
                    overflow: 'auto',
                    maxHeight: '300px',
                    border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
                  }}>
                    {JSON.stringify(newEnquiries.slice(0, 3), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'validation' && (
            <div>
              <MessageBar messageBarType={MessageBarType.warning} styles={{ root: { marginBottom: '20px' } }}>
                This validation checks data quality and identifies potential issues.
              </MessageBar>

              {/* Run validation checks on current data */}
              <div>
                <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
                  Data Quality Report
                </Text>
                
                {/* Missing required fields */}
                {(() => {
                  const issues = [];
                  const missingEmails = enquiries.filter(e => !e.Email).length;
                  const missingNames = enquiries.filter(e => !e.First_Name || !e.Last_Name).length;
                  const missingAOW = enquiries.filter(e => !e.Area_of_Work).length;
                  const invalidDates = enquiries.filter(e => e.Touchpoint_Date && isNaN(new Date(e.Touchpoint_Date).getTime())).length;

                  if (missingEmails > 0) issues.push(`${missingEmails} records missing email`);
                  if (missingNames > 0) issues.push(`${missingNames} records missing names`);
                  if (missingAOW > 0) issues.push(`${missingAOW} records missing area of work`);
                  if (invalidDates > 0) issues.push(`${invalidDates} records with invalid dates`);

                  return (
                    <div style={{ marginBottom: '20px' }}>
                      {issues.length === 0 ? (
                        <MessageBar messageBarType={MessageBarType.success}>
                          ✅ All records pass basic validation checks
                        </MessageBar>
                      ) : (
                        <MessageBar messageBarType={MessageBarType.error}>
                          ❌ Found {issues.length} validation issues:
                          <ul style={{ margin: '8px 0 0 20px' }}>
                            {issues.map((issue, i) => <li key={i}>{issue}</li>)}
                          </ul>
                        </MessageBar>
                      )}
                    </div>
                  );
                })()}

                {/* Duplicate check */}
                {(() => {
                  const emailCounts: { [email: string]: number } = {};
                  enquiries.forEach(e => {
                    if (e.Email) {
                      emailCounts[e.Email] = (emailCounts[e.Email] || 0) + 1;
                    }
                  });
                  const duplicates = Object.entries(emailCounts).filter(([_, count]) => count > 1);

                  return duplicates.length > 0 ? (
                    <MessageBar messageBarType={MessageBarType.warning} styles={{ root: { marginBottom: '20px' } }}>
                      ⚠️ Found {duplicates.length} duplicate email addresses:
                      <ul style={{ margin: '8px 0 0 20px' }}>
                        {duplicates.slice(0, 5).map(([email, count]) => 
                          <li key={email}>{email} ({count} times)</li>
                        )}
                      </ul>
                    </MessageBar>
                  ) : null;
                })()}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default EnquiryDataInspector;
