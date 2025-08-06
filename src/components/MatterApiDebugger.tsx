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
import { Matter } from '../app/functionality/types';

interface MatterApiDebuggerProps {
  currentMatters: Matter[];
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

const MatterApiDebugger: React.FC<MatterApiDebuggerProps> = ({ currentMatters, onClose }) => {
  const { isDarkMode } = useTheme();
  const [apiResponses, setApiResponses] = useState<ApiResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('lz@helix-law.com');
  const [testInitials, setTestInitials] = useState('LZ');
  const [testFullName, setTestFullName] = useState('Lukasz Zemanek');

  const testApiCall = async (endpoint: string, params?: Record<string, string>) => {
    setIsLoading(true);
    const start = Date.now();
    
    try {
      let url = endpoint;
      let requestOptions: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
        },
      };

      // Use POST for endpoints that require it, GET for others
      if (endpoint.includes('/api/getMatters') || endpoint.includes('getMatters')) {
        requestOptions.method = 'POST';
        if (params) {
          requestOptions.body = JSON.stringify(params);
        }
      } else {
        requestOptions.method = 'GET';
        if (params && Object.keys(params).length > 0) {
          const searchParams = new URLSearchParams(params);
          url += '?' + searchParams.toString();
        }
      }

      console.log(`🔍 Testing Matter API call to: ${url}`, requestOptions.method === 'POST' ? 'with body:' : '', requestOptions.body || '');
      
      const response = await fetch(url, requestOptions);

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
      
      console.log('📦 Matter API Response:', apiResponse);
      
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
      console.error('❌ Matter API Error:', error);
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
      const legacyPath = process.env.REACT_APP_GET_MATTERS_PATH || 'getMatters';
      const legacyCode = process.env.REACT_APP_GET_MATTERS_CODE || 'missing-code';
      const legacyUrl = `${legacyBaseUrl}/${legacyPath}?code=${legacyCode}`;

      console.log(`🔍 Testing Legacy Matter Azure Function: ${legacyUrl}`);
      console.log(`🔧 Environment Variables:`, {
        REACT_APP_GET_MATTERS_PATH: process.env.REACT_APP_GET_MATTERS_PATH,
        REACT_APP_GET_MATTERS_CODE: process.env.REACT_APP_GET_MATTERS_CODE ? 'SET' : 'NOT SET'
      });
      
      const response = await fetch(legacyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: testFullName,
        }),
      });

      const duration = Date.now() - start;
      const data = await response.json();

      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Legacy Matter Azure Function (Proxy)',
        method: 'POST',
        status: response.status,
        data,
        duration,
      };

      if (!response.ok) {
        apiResponse.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      setApiResponses(prev => [apiResponse, ...prev]);
      
      console.log('📦 Legacy Matter Function Response:', apiResponse);
      
    } catch (error) {
      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Legacy Matter Azure Function (Proxy)',
        method: 'POST',
        status: 0,
        data: null,
        error: (error as Error).message,
        duration: Date.now() - start,
      };
      
      setApiResponses(prev => [apiResponse, ...prev]);
      console.error('❌ Legacy Matter Function Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testLocalAzureFunction = async () => {
    setIsLoading(true);
    const start = Date.now();
    
    try {
      const localFunctionUrl = 'http://localhost:7071/api/getMatters';

      console.log(`🔍 Testing Local Matter Azure Function: ${localFunctionUrl}`);
      
      const response = await fetch(localFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: testFullName,
        }),
      });

      const duration = Date.now() - start;
      const data = await response.json();

      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Local Matter Azure Function (localhost:7071)',
        method: 'POST',
        status: response.status,
        data,
        duration,
      };

      if (!response.ok) {
        apiResponse.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      setApiResponses(prev => [apiResponse, ...prev]);
      
      console.log('📦 Local Matter Azure Function Response:', apiResponse);
      
    } catch (error) {
      const apiResponse: ApiResponse = {
        timestamp: new Date().toISOString(),
        endpoint: 'Local Matter Azure Function (localhost:7071)',
        method: 'POST',
        status: 0,
        data: null,
        error: (error as Error).message,
        duration: Date.now() - start,
      };
      
      setApiResponses(prev => [apiResponse, ...prev]);
      console.error('❌ Local Matter Azure Function Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeCurrentData = () => {
    console.log('🔍 CURRENT MATTERS ANALYSIS:');
    console.log('Total matters received:', currentMatters.length);
    
    // Log the fetch configuration
    console.log('🔧 FETCH CONFIGURATION:');
    console.log('REACT_APP_GET_MATTERS_PATH:', process.env.REACT_APP_GET_MATTERS_PATH);
    console.log('REACT_APP_GET_MATTERS_CODE:', process.env.REACT_APP_GET_MATTERS_CODE ? 'SET' : 'NOT SET');
    console.log('REACT_APP_PROXY_BASE_URL:', process.env.REACT_APP_PROXY_BASE_URL);
    console.log('Current hostname:', window.location.hostname);
    
    if (currentMatters.length > 0) {
      console.log('Sample matter structure:', Object.keys(currentMatters[0]));
      
      // Analyze Responsible Solicitor distribution
      const responsibleCounts: { [key: string]: number } = {};
      currentMatters.forEach(matter => {
        const responsible = matter.ResponsibleSolicitor || 'Unknown';
        responsibleCounts[responsible] = (responsibleCounts[responsible] || 0) + 1;
      });
      console.log('Responsible Solicitor distribution:', responsibleCounts);
      
      // Analyze Originating Solicitor distribution
      const originatingCounts: { [key: string]: number } = {};
      currentMatters.forEach(matter => {
        const originating = matter.OriginatingSolicitor || 'Unknown';
        originatingCounts[originating] = (originatingCounts[originating] || 0) + 1;
      });
      console.log('Originating Solicitor distribution:', originatingCounts);
      
      // Analyze Practice Area distribution
      const areaCounts: { [key: string]: number } = {};
      currentMatters.forEach(matter => {
        const area = matter.PracticeArea || 'Unknown';
        areaCounts[area] = (areaCounts[area] || 0) + 1;
      });
      console.log('Practice Area distribution:', areaCounts);
      
      // Analyze Status distribution
      const statusCounts: { [key: string]: number } = {};
      currentMatters.forEach(matter => {
        const status = matter.Status || 'Unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      console.log('Status distribution:', statusCounts);
      
      // Check for test user specific matters
      const userMatters = currentMatters.filter(matter => {
        const responsible = (matter.ResponsibleSolicitor || '').toLowerCase();
        const originating = (matter.OriginatingSolicitor || '').toLowerCase();
        const testEmailLower = testEmail.toLowerCase();
        const testInitialsLower = testInitials.toLowerCase();
        
        return responsible.includes(testEmailLower) || 
               originating.includes(testEmailLower) ||
               responsible === testInitialsLower ||
               originating === testInitialsLower;
      });
      console.log(`${testInitials}-specific matters:`, userMatters.length, userMatters);
      
      console.log('📋 First 3 matters for inspection:', currentMatters.slice(0, 3));
      
      // Additional debugging for data source
      console.log('🔍 DATA SOURCE ANALYSIS:');
      const uniqueIds = new Set(currentMatters.map(m => m.UniqueID || m.MatterID));
      console.log('Total unique matters:', uniqueIds.size);
      
      // Check if we might be getting local fallback data
      const hasCompleteData = currentMatters.some(m => 
        m.ResponsibleSolicitor && m.ClientName && m.PracticeArea
      );
      console.log('Has complete data (not fallback):', hasCompleteData);
      
    } else {
      console.log('❌ No matters data available');
      console.log('🔧 Debugging suggestions:');
      console.log('1. Check if environment variables are set correctly');
      console.log('2. Check network tab for failed API calls');
      console.log('3. Check if getMatters Azure Function is running');
      console.log('4. Check if matter data exists in the database');
    }
  };

  const clearResponses = () => {
    setApiResponses([]);
  };

  useEffect(() => {
    // Automatically analyze current data when component mounts
    analyzeCurrentData();
  }, [currentMatters]);

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
            <Text variant="large" styles={{ root: { fontWeight: '600', color: isDarkMode ? '#ffffff' : '#111827' } }}>
              ⚖️ Matter API Debugger
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? '#888' : '#6b7280', marginTop: '2px' } }}>
              Debug API calls and filtering logic for matter data
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
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
              📊 Current Matters Summary
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div>
                <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.blue } }}>
                  {currentMatters.length}
                </Text>
                <Text variant="small">Total Received</Text>
              </div>
              <div>
                <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.green } }}>
                  {currentMatters.filter(m => {
                    const responsible = (m.ResponsibleSolicitor || '').toLowerCase();
                    const originating = (m.OriginatingSolicitor || '').toLowerCase();
                    const testFullNameLower = testFullName.toLowerCase();
                    
                    return responsible.includes(testFullNameLower) || 
                           originating.includes(testFullNameLower);
                  }).length}
                </Text>
                <Text variant="small">For {testFullName}</Text>
              </div>
              <div>
                <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.orange } }}>
                  {currentMatters.filter(m => m.Status?.toLowerCase() !== 'closed').length}
                </Text>
                <Text variant="small">Active</Text>
              </div>
              <div>
                <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.cta } }}>
                  {currentMatters.filter(m => m.Status?.toLowerCase() === 'closed').length}
                </Text>
                <Text variant="small">Closed</Text>
              </div>
            </div>
            <DefaultButton
              text="🔍 Analyze in Console"
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
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
              🧪 API Test Controls
            </Text>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
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
              <TextField
                label="Full Name (for Matter queries)"
                value={testFullName}
                onChange={(_, value) => setTestFullName(value || '')}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <PrimaryButton
                text="🔄 New Route API"
                onClick={() => testApiCall('/api/getMatters', { fullName: testFullName })}
                disabled={isLoading}
                iconProps={{ iconName: 'Refresh' }}
              />
              
              <DefaultButton
                text="⚡ Local Azure Function"
                onClick={testLocalAzureFunction}
                disabled={isLoading}
                iconProps={{ iconName: 'Lightning' }}
              />
              
              <DefaultButton
                text="🏛️ Legacy Function (Proxy)"
                onClick={testLegacyFunction}
                disabled={isLoading}
                iconProps={{ iconName: 'CloudUpload' }}
              />
              
              <DefaultButton
                text="🌐 Get All Matters"
                onClick={() => testApiCall('/api/getAllMatters')}
                disabled={isLoading}
                iconProps={{ iconName: 'GlobalNavButton' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
              <DefaultButton
                text="🏗️ Test with Filters"
                onClick={() => testApiCall('/api/getMatters', {
                  fullName: testFullName,
                  practiceArea: 'Commercial'
                })}
                disabled={isLoading}
              />
              
              <DefaultButton
                text="📊 Raw Data Dump"
                onClick={() => testApiCall('/api/getMatters', { fullName: testFullName, limit: '100' })}
                disabled={isLoading}
              />
              
              <DefaultButton
                text="🗑️ Clear Results"
                onClick={clearResponses}
              />
            </div>
            
            {isLoading && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Spinner size={SpinnerSize.small} />
                <Text variant="small">Testing Matter API...</Text>
              </div>
            )}
          </div>

          {/* Environment Variables Info */}
          <div style={{ 
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: isDarkMode ? '#2d2d2d' : '#fff3cd',
            borderRadius: '8px',
            border: `1px solid ${colours.yellow}`
          }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
              🔧 Environment Configuration
            </Text>
            <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
              <div><strong>REACT_APP_GET_MATTERS_PATH:</strong> {process.env.REACT_APP_GET_MATTERS_PATH || 'NOT SET'}</div>
              <div><strong>REACT_APP_GET_MATTERS_CODE:</strong> {process.env.REACT_APP_GET_MATTERS_CODE ? 'SET' : 'NOT SET'}</div>
              <div><strong>REACT_APP_PROXY_BASE_URL:</strong> {process.env.REACT_APP_PROXY_BASE_URL || 'NOT SET'}</div>
              <div><strong>Environment:</strong> {window.location.hostname === 'localhost' ? 'Development' : 'Production'}</div>
            </div>
          </div>

          {/* API Responses */}
          <div>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600', marginBottom: '12px' } }}>
              📡 API Test Results ({apiResponses.length})
            </Text>
            
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
                            
                            {response.data.matters && (
                              <div style={{ marginBottom: '8px', fontSize: '11px' }}>
                                <div><strong>Matters count:</strong> {response.data.matters.length}</div>
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

export default MatterApiDebugger;
