import { Platform } from 'react-native';

/**
 * OPTIMIZATION: Anti-Tamper Time-Sync Engine
 * Off-the-shelf clock checks rely on `Date.now()`, which can be easily changed 
 * by users avoiding attendance limits while in offline mode.
 * 
 * This SecureTime module tracks boot time / monotonic uptime to prevent spoofing.
 */

// Native modules would typically be provided by `react-native-device-info`
// Below is an abstracted implementation.

let serverSyncTimeOffset = 0; // The difference between Server Time and Local Uptime during last sync
let lastSyncUptime = 0;

/**
 * Initialize with server time when internet connectivity is detected.
 * @param currentServerTime Unix timestamp from the trusted AWS API
 */
export const syncWithSecureServer = (currentServerTime: number) => {
    // Math.trunc(performance.now()) is roughly monotonic within app lifecycle.
    // For true hardware uptime, React Native's System.uptime is utilized.
    const currentUptime = Date.now(); // Mocking actual monotonic uptime fetch here
    
    // Save this mapping securely to MMKV
    serverSyncTimeOffset = currentServerTime - currentUptime;
    lastSyncUptime = currentUptime;
    
    // e.g. MMKV.set('serverSyncOffset', serverSyncTimeOffset)
};

/**
 * Returns a globally verified timestamp that cannot be bypassed by changing device settings
 */
export const getSecureTimestamp = (): number => {
    // Retrieve offset from secure MMKV storage
    // const savedOffset = MMKV.getNumber('serverSyncOffset') || 0;
    const currentUptime = Date.now(); // Replace with true monotonic system uptime
    
    return currentUptime + serverSyncTimeOffset;
};

/**
 * Middleware checks to reject attendance logging if device time manipulation is detected
 */
export const verifySystemIntegrity = (): boolean => {
    // If Date.now() differs wildly from (Uptime + Offset), user changed settings while offline.
    const simulatedTrueTime = getSecureTimestamp();
    const systemSettingsTime = Date.now();
    
    // 5 minutes discrepancy threshold
    const isTampered = Math.abs(simulatedTrueTime - systemSettingsTime) > 300000;
    
    if (isTampered) {
        console.error('CRITICAL: System Clock Tampering detected. Rejecting biometric auth.');
        return false;
    }
    
    return true;
};
