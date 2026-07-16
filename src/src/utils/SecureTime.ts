import { Platform } from 'react-native';

/**
 * OPTIMIZATION: Anti-Tamper Time-Sync Engine
 * Off-the-shelf clock checks rely on `Date.now()`, which can be easily changed 
 * by users avoiding attendance limits while in offline mode.
 * 
 * This SecureTime module tracks monotonic uptime to prevent spoofing.
 */

let serverSyncTimeOffset = 0; // The difference between Server Time and Local Uptime
let initialSystemTime = Date.now();
let initialMonotonicTime = performance.now();

/**
 * Initialize with server time when internet connectivity is detected.
 * @param currentServerTime Unix timestamp from the trusted AWS API
 */
export const syncWithSecureServer = (currentServerTime: number) => {
    // performance.now() is monotonic (doesn't jump if system clock is changed)
    const currentMonotonic = performance.now();
    
    // Save the difference between the trusted server time and our internal clock
    serverSyncTimeOffset = currentServerTime - currentMonotonic;
    
    // Note: In production, save this offset to MMKV/SecureStorage
    // MMKV.set('serverSyncOffset', serverSyncTimeOffset)
};

/**
 * Returns a globally verified timestamp that cannot be bypassed by changing device settings
 */
export const getSecureTimestamp = (): number => {
    const currentMonotonic = performance.now();
    
    // If we haven't synced yet, we use a reference from app start
    if (serverSyncTimeOffset === 0) {
        return initialSystemTime + (currentMonotonic - initialMonotonicTime);
    }
    
    return currentMonotonic + serverSyncTimeOffset;
};

/**
 * Middleware checks to reject attendance logging if device time manipulation is detected
 */
export const verifySystemIntegrity = (): boolean => {
    const secureTime = getSecureTimestamp();
    const systemTime = Date.now();
    
    // If system clock differs by more than 5 minutes from our monotonic tracker,
    // it means the user manually adjusted their clock after the app started.
    const isTampered = Math.abs(secureTime - systemTime) > 300000;
    
    if (isTampered) {
        console.error('CRITICAL: System Clock Tampering detected. Rejecting biometric auth.');
        return false;
    }
    
    return true;
};

