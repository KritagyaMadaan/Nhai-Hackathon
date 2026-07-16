import NetInfo from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';
import { getSecureTimestamp } from '../utils/SecureTime';

import { getUnsyncedLogs, markAsSynced, purgeSyncedLogs } from '../database/SQLiteClient';

/**
 * PRODUCTION AWS SYNC SERVICE
 * Handles intermittent connectivity and batch uploads.
 */

const AWS_API_ENDPOINT = 'https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod/sync';

export const startSyncEngine = () => {
  // Listen for internet connectivity
  NetInfo.addEventListener((state: any) => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('Internet detected. Starting Sync Engine...');
      processSyncQueue();
    }
  });
};

export const processSyncQueue = async () => {
  const logs = getUnsyncedLogs();
  
  if (logs.length === 0) {
    console.log('Sync Queue empty.');
    return;
  }

  console.log(`Syncing ${logs.length} records to AWS...`);

  try {
    const deviceId = await DeviceInfo.getUniqueId();
    
    const response = await fetch(AWS_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'NHAI_HACKATHON_TEMPORARY_KEY'
      },
      body: JSON.stringify({
        deviceId: deviceId,
        timestamp: getSecureTimestamp(),
        payload: logs
      })
    });



    if (response.ok) {
      const result = await response.json();
      console.log('Sync Successful:', result);
      
      // Mark as synced in local DB
      const syncedIds = logs.map(l => l.id);
      markAsSynced(syncedIds);
      
      // Periodic cleanup
      purgeSyncedLogs();
    } else {
      console.error('Sync Failed with status:', response.status);
    }
  } catch (error) {
    console.error('Network error during AWS Sync:', error);
  }
};
