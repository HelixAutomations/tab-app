import React, { useState, useEffect } from 'react';
import { 
  DefaultButton, 
  PrimaryButton, 
  Stack, 
  Text, 
  MessageBar, 
  MessageBarType,
  ProgressIndicator 
} from '@fluentui/react';
import { getStorageQuota, cleanupLocalStorage, logStorageUsage, StorageQuotaInfo } from '../utils/storageUtils';

interface StorageManagerProps {
  onCleanupComplete?: () => void;
}

const StorageManager: React.FC<StorageManagerProps> = ({ onCleanupComplete }) => {
  const [quotaInfo, setQuotaInfo] = useState<StorageQuotaInfo | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  const refreshQuotaInfo = () => {
    const info = getStorageQuota();
    setQuotaInfo(info);
  };

  useEffect(() => {
    refreshQuotaInfo();
    logStorageUsage();
  }, []);

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    setCleanupMessage(null);
    
    try {
      cleanupLocalStorage();
      refreshQuotaInfo();
      setCleanupMessage('✅ Storage cleanup completed successfully');
      onCleanupComplete?.();
    } catch (error) {
      setCleanupMessage('❌ Storage cleanup failed: ' + (error as Error).message);
    }
    
    setIsCleaningUp(false);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear ALL localStorage data? This will reset all preferences and cached data.')) {
      try {
        localStorage.clear();
        sessionStorage.clear();
        setCleanupMessage('✅ All storage cleared. Please refresh the page.');
        refreshQuotaInfo();
      } catch (error) {
        setCleanupMessage('❌ Failed to clear storage: ' + (error as Error).message);
      }
    }
  };

  if (!quotaInfo) {
    return <Text>Loading storage information...</Text>;
  }

  const isNearQuota = quotaInfo.percentUsed > 80;
  const isOverQuota = quotaInfo.percentUsed > 95;

  return (
    <Stack tokens={{ childrenGap: 16 }} style={{ padding: '16px', border: '1px solid #ccc', borderRadius: '4px' }}>
      <Text variant="mediumPlus" style={{ fontWeight: 600 }}>
        Browser Storage Management
      </Text>
      
      <Stack tokens={{ childrenGap: 8 }}>
        <Text variant="medium">
          Storage Usage: {quotaInfo.percentUsed.toFixed(1)}% ({Math.round(quotaInfo.used / 1024)} KB used)
        </Text>
        
        <ProgressIndicator 
          percentComplete={quotaInfo.percentUsed / 100}
          barHeight={8}
          styles={{
            progressBar: {
              backgroundColor: isOverQuota ? '#d13438' : isNearQuota ? '#ff8c00' : '#0078d4'
            }
          }}
        />
        
        <Text variant="small" style={{ color: '#666' }}>
          Available: {Math.round(quotaInfo.available / 1024)} KB
        </Text>
      </Stack>

      {(isNearQuota || isOverQuota) && (
        <MessageBar 
          messageBarType={isOverQuota ? MessageBarType.error : MessageBarType.warning}
        >
          {isOverQuota 
            ? 'Storage quota exceeded! The app may not function properly. Please clean up storage.'
            : 'Storage usage is high. Consider cleaning up to prevent issues.'
          }
        </MessageBar>
      )}

      {cleanupMessage && (
        <MessageBar 
          messageBarType={cleanupMessage.includes('✅') ? MessageBarType.success : MessageBarType.error}
          onDismiss={() => setCleanupMessage(null)}
        >
          {cleanupMessage}
        </MessageBar>
      )}

      <Stack horizontal tokens={{ childrenGap: 12 }}>
        <PrimaryButton
          text={isCleaningUp ? 'Cleaning...' : 'Smart Cleanup'}
          onClick={handleCleanup}
          disabled={isCleaningUp}
          iconProps={{ iconName: 'Broom' }}
        />
        
        <DefaultButton
          text="Clear All Storage"
          onClick={handleClearAll}
          disabled={isCleaningUp}
          iconProps={{ iconName: 'Delete' }}
        />
        
        <DefaultButton
          text="Refresh Info"
          onClick={refreshQuotaInfo}
          iconProps={{ iconName: 'Refresh' }}
        />
      </Stack>
      
      <Text variant="small" style={{ color: '#666', fontStyle: 'italic' }}>
        Smart cleanup removes cached data and large items while preserving preferences.
        "Clear All" removes everything and requires a page refresh.
      </Text>
    </Stack>
  );
};

export default StorageManager;