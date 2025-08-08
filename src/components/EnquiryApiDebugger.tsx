import React, { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  PrimaryButton,
  DefaultButton,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
  TextField,
  IconButton,
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { Enquiry } from '../app/functionality/types';

interface EnquiryApiDebuggerProps {
  currentEnquiries: Enquiry[];
  onClose: () => void;
}

interface ApiResponse {
  timestamp: string;
  endpoint: string;
  method: string;
  status: number;
  data: any;
  error?: string;
  duration: number;
}

const EnquiryApiDebugger: React.FC<EnquiryApiDebuggerProps> = ({ currentEnquiries, onClose }) => {
  const { isDarkMode } = useTheme();
  const [apiResponses, setApiResponses] = useState<ApiResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('lz@helix-law.com');
  const [testInitials, setTestInitials] = useState('LZ');

  const testApiCall = async (endpoint: string, params?: Record<string, string>) => {
    setIsLoading(true);
    const start = Date.now();
    
    try {
      let url = endpoint;
      if (params && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams(params);
        url += '?' + searchParams.toString();
      }

      console.log(`Testing API call to: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const duration = Date.now() - start;
      const data = await response.json();

      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: url,
        method: 'GET',
        status: response.status,
        data,
        duration,
      };

      if (!response.ok) {
        apiResponse.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      setApiResponses(prev => [apiResponse, ...prev]);
      
      console.log('API Response:', apiResponse);
      
    } catch (error) {
      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: endpoint,
        method: 'GET',
        status: 0,
        data: null,
        error: (error as Error).message,
        duration: Date.now() - start,
      };
      
      setApiResponses(prev => [apiResponse, ...prev]);
      console.error('API Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testLegacyFunction = async () => {
    setIsLoading(true);
    const start = Date.now();
    
    try {
      const isLocalDev = window.location.hostname === 'localhost';
      const legacyBaseUrl = isLocalDev
        ? 'https://helix-keys-proxy.azurewebsites.net/api'
        : 'https://helix-keys-proxy.azurewebsites.net/api';
      
      // Get legacy function details from environment or use defaults
      const legacyPath = process.env.REACT_APP_GET_ENQUIRIES_PATH || 'getEnquiries';
      const legacyCode = process.env.REACT_APP_GET_ENQUIRIES_CODE || 'missing-code';
      const legacyUrl = `${legacyBaseUrl}/${legacyPath}?code=${legacyCode}`;

      console.log(`Testing Legacy Azure Function: ${legacyUrl}`);
      
      const response = await fetch(legacyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'anyone',
          dateFrom: '2024-01-01',
          dateTo: '2025-12-31',
        }),
      });

      const duration = Date.now() - start;
      const data = await response.json();

      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Legacy Azure Function (Proxy)',
        method: 'POST',
        status: response.status,
        data,
        duration,
      };

      if (!response.ok) {
        apiResponse.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      setApiResponses(prev => [apiResponse, ...prev]);
      
      console.log('Legacy Function Response:', apiResponse);
      
    } catch (error) {
      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Legacy Azure Function (Proxy)',
        method: 'POST',
        status: 0,
        data: null,
        error: (error as Error).message,
        duration: Date.now() - start,
      };
      
      setApiResponses(prev => [apiResponse, ...prev]);
      console.error('Legacy Function Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testLocalAzureFunction = async () => {
    setIsLoading(true);
    const start = Date.now();
    
    try {
      const localFunctionUrl = 'http://localhost:8080/getEnquiries';

      console.log(`Testing Local Azure Function: ${localFunctionUrl}`);
      
      const response = await fetch(localFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'anyone',
          dateFrom: '2024-01-01',
          dateTo: '2025-12-31',
        }),
      });

      const duration = Date.now() - start;
      const data = await response.json();

      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Local Azure Function (localhost:7071)',
        method: 'POST',
        status: response.status,
        data,
        duration,
      };

      if (!response.ok) {
        apiResponse.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      setApiResponses(prev => [apiResponse, ...prev]);
      
      console.log('Local Azure Function Response:', apiResponse);
      
    } catch (error) {
      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Local Azure Function (localhost:7071)',
        method: 'POST',
        status: 0,
        data: null,
        error: (error as Error).message,
        duration: Date.now() - start,
      };
      
      setApiResponses(prev => [apiResponse, ...prev]);
      console.error('Local Azure Function Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeCurrentData = () => {
    console.log('CURRENT ENQUIRIES ANALYSIS:');
    console.log('Total enquiries received:', currentEnquiries.length);
    
    if (currentEnquiries.length > 0) {
      console.log('Sample enquiry structure:', Object.keys(currentEnquiries[0]));
      
      // Analyze Point of Contact distribution
      const pocCounts: { [key: string]: number } = {};
      currentEnquiries.forEach(enq => {
        const poc = enq.Point_of_Contact || (enq as any).poc || 'Unknown';
        pocCounts[poc] = (pocCounts[poc] || 0) + 1;
      });
      console.log('Point of Contact distribution:', pocCounts);
      
      // Check both Point_of_Contact and poc fields
      console.log('Raw POC fields check:');
      currentEnquiries.slice(0, 3).forEach((enq, i) => {
        console.log(`Enquiry ${i}: Point_of_Contact="${enq.Point_of_Contact}", poc="${(enq as any).poc}"`);
      });
      
      // Analyze Area of Work distribution
      const aowCounts: { [key: string]: number } = {};
      currentEnquiries.forEach(enq => {
        const aow = enq.Area_of_Work || 'Unknown';
        aowCounts[aow] = (aowCounts[aow] || 0) + 1;
      });
      console.log('Area of Work distribution:', aowCounts);
      
      // Check for LZ-specific enquiries
      const lzEnquiries = currentEnquiries.filter(enq => {
        const poc = (enq.Point_of_Contact || (enq as any).poc || '').toLowerCase();
        return poc === 'lz@helix-law.com' || poc.includes('lz');
      });
      console.log('LZ-specific enquiries:', lzEnquiries.length, lzEnquiries);
      
      // Check for team enquiries (unclaimed)
      const teamEnquiries = currentEnquiries.filter(enq => {
        const poc = (enq.Point_of_Contact || (enq as any).poc || '').toLowerCase();
        return poc === 'team@helix-law.com' || poc.includes('team');
      });
      console.log('Team/unclaimed enquiries:', teamEnquiries.length, teamEnquiries);
      
      console.log('First 3 enquiries for inspection:', currentEnquiries.slice(0, 3));
    } else {
      console.log('No enquiries data available');
    }
  };

  const clearResponses = () => {
    setApiResponses([]);
  };

  useEffect(() => {
    // Automatically analyze current data when component mounts
    analyzeCurrentData();
  }, [currentEnquiries]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
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
        width: '90%',
        height: '90%',
        maxWidth: '1200px',
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
            <Text variant="large" styles={{ root: { fontWeight: '600', color: isDarkMode ? '#ffffff' : '#111827' } }}>Enquiry API Debugger</Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? '#888' : '#6b7280', marginTop: '2px' } }}>
              Debug API calls and filtering logic for enquiry data
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

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          
          {/* Current Data Summary */}
          <div style={{ 
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa',
            borderRadius: '8px',
            border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
          }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>Current Enquiries Summary</Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div>
                <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.blue } }}>
                  {currentEnquiries.length}
                </Text>
                <Text variant="small">Total Received</Text>
              </div>
              <div>
                <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.green } }}>
                  {currentEnquiries.filter(e => {
                    const poc = (e.Point_of_Contact || (e as any).poc || '').toLowerCase();
                    return poc === testEmail.toLowerCase();
                  }).length}
                </Text>
                <Text variant="small">For {testInitials}</Text>
              </div>
              <div>
                <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.orange } }}>
                  {currentEnquiries.filter(e => {
                    const poc = (e.Point_of_Contact || (e as any).poc || '').toLowerCase();
                    return poc === 'team@helix-law.com';
                  }).length}
                </Text>
                <Text variant="small">Unclaimed</Text>
              </div>
            </div>
            <DefaultButton
              text="Analyze in Console"
              onClick={analyzeCurrentData}
              styles={{ root: { marginTop: '12px' } }}
            />
          </div>

          {/* Test Controls */}
          <div style={{ 
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: isDarkMode ? '#2d2d2d' : '#f8f9fa',
            borderRadius: '8px',
            border: `1px solid ${isDarkMode ? '#404040' : '#e1e4e8'}`
          }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>API Test Controls</Text>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <TextField
                label="Test Email"
                value={testEmail}
                onChange={(_, value) => setTestEmail(value || '')}
              />
              <TextField
                label="Test Initials"
                value={testInitials}
                onChange={(_, value) => setTestInitials(value || '')}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <PrimaryButton
                text="New Route API"
                onClick={() => testApiCall('/api/enquiries')}
                disabled={isLoading}
                iconProps={{ iconName: 'Refresh' }}
              />
              
              <DefaultButton
                text="Local Azure Function"
                onClick={testLocalAzureFunction}
                disabled={isLoading}
                iconProps={{ iconName: 'Lightning' }}
              />
              
              <DefaultButton
                text="Legacy Function (Proxy)"
                onClick={testLegacyFunction}
                disabled={isLoading}
                iconProps={{ iconName: 'CloudUpload' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
              <DefaultButton
                text="Test with Filters"
                onClick={() => testApiCall('/api/enquiries', {
                  pointOfContact: testEmail,
                  areaOfWork: 'Commercial'
                })}
                disabled={isLoading}
              />
              
              <DefaultButton
                text="Raw Data Dump"
                onClick={() => testApiCall('/api/enquiries', { limit: '100' })}
                disabled={isLoading}
              />
              
              <DefaultButton
                text="Clear Results"
                onClick={clearResponses}
              />
            </div>
            
            {isLoading && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Spinner size={SpinnerSize.small} />
                <Text variant="small">Testing API...</Text>
              </div>
            )}
          </div>

          {/* API Responses */}
          <div>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>API Test Results ({apiResponses.length})</Text>
            
            {apiResponses.length === 0 ? (
              <MessageBar messageBarType={MessageBarType.info}>
                No API tests run yet. Click a test button above to see results.
              </MessageBar>
            ) : (
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                {apiResponses.map((response, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '16px',
                      marginBottom: '12px',
                      backgroundColor: response.status >= 200 && response.status < 300 ? 
                        (isDarkMode ? '#0d4f3c' : '#d1fae5') : 
                        (isDarkMode ? '#4c1d1d' : '#fee2e2'),
                      borderRadius: '8px',
                      border: `1px solid ${response.status >= 200 && response.status < 300 ? colours.green : colours.cta}`
                    }}
                  >
                    {/* Response header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <Text variant="medium" styles={{ root: { fontWeight: '600' } }}>
                        {response.method} {response.endpoint}
                      </Text>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: '600',
                          backgroundColor: response.status >= 200 && response.status < 300 ? colours.green : colours.cta,
                          color: 'white'
                        }}>
                          {response.status || 'FAILED'}
                        </span>
                        <Text variant="small">{response.duration}ms</Text>
                      </div>
                    </div>
                    
                    {/* Response details */}
                    <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                      <div><strong>Time:</strong> {new Date(response.timestamp).toLocaleTimeString()}</div>
                      {response.error && (
                        <div style={{ color: colours.cta, marginTop: '4px' }}>
                          <strong>Error:</strong> {response.error}
                        </div>
                      )}
                      
                      {response.data && (
                        <details style={{ marginTop: '8px' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: '600' }}>
                            Response Data ({Array.isArray(response.data) ? response.data.length : typeof response.data === 'object' ? Object.keys(response.data).length : 'scalar'} items)
                          </summary>
                          <div style={{ marginTop: '8px' }}>
                            {/* Show key stats */}
                            {Array.isArray(response.data) && (
                              <div style={{ marginBottom: '8px', fontSize: '11px' }}>
                                <div><strong>Array length:</strong> {response.data.length}</div>
                                {response.data.length > 0 && (
                                  <div><strong>Sample keys:</strong> {Object.keys(response.data[0] || {}).slice(0, 5).join(', ')}</div>
                                )}
                              </div>
                            )}
                            
                            {response.data.enquiries && (
                              <div style={{ marginBottom: '8px', fontSize: '11px' }}>
                                <div><strong>Enquiries count:</strong> {response.data.enquiries.length}</div>
                                <div><strong>Filters applied:</strong> {JSON.stringify(response.data.filters || {})}</div>
                              </div>
                            )}
                            
                            <pre style={{
                              padding: '8px',
                              backgroundColor: isDarkMode ? '#0d1117' : '#f6f8fa',
                              borderRadius: '4px',
                              fontSize: '10px',
                              overflow: 'auto',
                              maxHeight: '200px'
                            }}>
                              {JSON.stringify(response.data, null, 2)}
                            </pre>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnquiryApiDebugger;
