import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useBiometricEngine } from './src/hooks/useBiometricEngine';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { initDatabase, logAuthAttempt } from './src/database/SQLiteClient';
import { startSyncEngine } from './src/services/SyncService';
import { EnrollmentManager } from './src/recognition/Enrollment';

type AppMode = 'HOME' | 'AUTH' | 'ENROLL';

const App = () => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const devices = Camera.getAvailableCameraDevices();
  const device = devices.find((d) => d.position === 'front') || devices[0];
  
  const [mode, setMode] = useState<AppMode>('HOME');
  const [authStatus, setAuthStatus] = useState<string>('System Ready');
  const [uiPrompt, setUiPrompt] = useState<string>('');
  
  // Enrollment State
  const [enrollmentManager] = useState(() => new EnrollmentManager());
  const [enrollmentProgress, setEnrollmentProgress] = useState(0);

  // 1. Initialize Production Services
  useEffect(() => {
    initDatabase();
    startSyncEngine();
    
    const checkPerms = async () => {
      if (!hasPermission) {
        const status = await requestPermission();
        if (!status) {
          Alert.alert("Permission Required", "This app needs camera access to perform biometric verification.");
        }
      }
    };
    checkPerms();
  }, [hasPermission]);

  // 2. Load the REAL Biometric Engine
  const { 
    isReady, 
    frameProcessor, 
    faceDetected, 
    livenessPrompt, 
    livenessSuccess, 
    spoofDetected, 
    authMatch,
    currentEmbedding 
  } = useBiometricEngine(mode !== 'HOME');

  // --- REACTION HANDLERS (Native -> JS) ---

  useAnimatedReaction(
    () => ({ 
      detected: faceDetected.value, 
      prompt: livenessPrompt.value,
      live: livenessSuccess.value,
      spoof: spoofDetected.value,
      match: authMatch.value,
      embedding: currentEmbedding.value
    }),
    (state, previous) => {
      // Handle Prompt Updates
      if (state.prompt !== previous?.prompt) {
        runOnJS(setUiPrompt)(state.prompt);
      }

      // Handle Spoof Detection
      if (state.spoof && !previous?.spoof) {
        runOnJS(setAuthStatus)('SECURITY ALERT: SPOOF DETECTED');
      }

      // ────── MODE: AUTH ──────
      if (mode === 'AUTH' && state.live && state.match && state.match !== previous?.match) {
        runOnJS(handleSuccessfulAuth)(state.match.name, state.match.score);
      }

      // ────── MODE: ENROLL ──────
      if (mode === 'ENROLL' && state.live && state.embedding.length > 0 && state.embedding !== previous?.embedding) {
        runOnJS(handleEnrollmentSample)(state.embedding);
      }
    },
    [mode, enrollmentManager]
  );

  const handleEnrollmentSample = (embedding: number[]) => {
    const count = enrollmentManager.addSample(new Float32Array(embedding));
    setEnrollmentProgress(count);
    
    if (enrollmentManager.isReady()) {
      Alert.prompt(
        'Enrollment Complete',
        'Enter name for this user:',
        [
          { text: 'Cancel', onPress: () => setMode('HOME') },
          { 
            text: 'Save', 
            onPress: async (name?: string) => {
              await enrollmentManager.finalizeEnrollment(name || 'Unknown User');
              Alert.alert('Success', 'User Enrolled Offline');
              setMode('HOME');
            }
          },
        ]
      );
    }
  };

  const handleSuccessfulAuth = (name: string, score: number) => {
    const successMsg = `Verified: ${name}\nConfidence: ${Math.round(score * 100)}%`;
    setAuthStatus(successMsg);
    setUiPrompt('Access Granted');
    
    // Log to SQLite (Real Persistence)
    logAuthAttempt(name, score, 'PASSED');
    
    Alert.alert('Success', successMsg, [{ text: 'OK', onPress: () => setMode('HOME') }]);
  };

  const startEnrollment = () => {
    enrollmentManager.reset();
    setEnrollmentProgress(0);
    setMode('ENROLL');
  };

  // --- UI RENDERERS ---

  const renderCamera = () => {
    if (!hasPermission) return <Text style={styles.placeholderText}>Permission Required</Text>;
    if (!device) return <Text style={styles.placeholderText}>Initializing Camera...</Text>;
    
    return (
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      <View style={styles.header}>
        <Text style={styles.title}>NHAI Auth</Text>
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>SECURE OFFLINE</Text>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        {mode !== 'HOME' && renderCamera()}
        
        {mode === 'HOME' ? (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.placeholderText}>Systems Offline</Text>
            <Text style={styles.placeholderSubtext}>Select an action below</Text>
          </View>
        ) : (
          <View style={styles.scanningOverlay}>
            {!isReady && <ActivityIndicator size="large" color="#10b981" />}
            <Text style={styles.livenessPrompt}>{uiPrompt}</Text>
            {mode === 'ENROLL' && (
               <Text style={styles.progressText}>Samples: {enrollmentProgress}/8</Text>
            )}
          </View>
        )}
        
        <View style={styles.reticleTopLeft} />
        <View style={styles.reticleTopRight} />
        <View style={styles.reticleBottomLeft} />
        <View style={styles.reticleBottomRight} />
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>METRIC STATUS</Text>
        <Text style={[styles.statusValue, authStatus.includes('Verified') && styles.successText, authStatus.includes('ALERT') && styles.errorText]}>
          {authStatus}
        </Text>
      </View>

      <View style={styles.footer}>
        {mode === 'HOME' ? (
          <>
            <TouchableOpacity style={styles.button} onPress={() => setMode('AUTH')}>
              <Text style={styles.buttonText}>Face Authentication</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={startEnrollment}>
              <Text style={styles.buttonText}>Biometric Enrollment</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setMode('HOME')}>
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  permissionContainer: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#020617', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, marginTop: 10 },
  title: { fontSize: 28, fontWeight: '900', color: '#f8fafc', letterSpacing: -0.5 },
  offlineBadge: { backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, shadowColor: '#10b981', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 },
  offlineText: { color: 'white', fontSize: 10, fontWeight: '800' },
  cameraContainer: { 
    flex: 1, 
    backgroundColor: '#0f172a', 
    borderRadius: 32, 
    overflow: 'hidden', 
    position: 'relative', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    borderColor: '#1e293b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  cameraPlaceholder: { alignItems: 'center' },
  scanningOverlay: { 
    ...(StyleSheet.absoluteFill as object), 
    backgroundColor: 'rgba(59, 130, 246, 0.03)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  placeholderText: { color: '#64748b', fontSize: 20, fontWeight: '700' },
  placeholderSubtext: { color: '#475569', marginTop: 10, fontSize: 13 },
  reticleTopLeft: { position: 'absolute', top: 30, left: 30, width: 45, height: 45, borderColor: '#3b82f6', borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 15 },
  reticleTopRight: { position: 'absolute', top: 30, right: 30, width: 45, height: 45, borderColor: '#3b82f6', borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 15 },
  reticleBottomLeft: { position: 'absolute', bottom: 30, left: 30, width: 45, height: 45, borderColor: '#3b82f6', borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 15 },
  reticleBottomRight: { position: 'absolute', bottom: 30, right: 30, width: 45, height: 45, borderColor: '#3b82f6', borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 15 },
  livenessPrompt: { 
    color: '#fff', 
    fontSize: 22, 
    fontWeight: '900', 
    marginTop: 20, 
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10 
  },
  progressText: { color: '#60a5fa', fontSize: 14, fontWeight: '800', marginTop: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 10 },
  statusBox: { 
    backgroundColor: '#0f172a', 
    padding: 22, 
    borderRadius: 24, 
    marginTop: 25, 
    borderWidth: 1, 
    borderColor: '#1e293b',
    borderLeftWidth: 6,
    borderLeftColor: '#3b82f6'
  },
  statusLabel: { color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 6, letterSpacing: 2 },
  statusValue: { color: '#f1f5f9', fontSize: 16, fontWeight: '600' },
  successText: { color: '#34d399', fontWeight: '900' },
  errorText: { color: '#f87171', fontWeight: '900' },
  footer: { marginTop: 25, marginBottom: 15 },
  button: { 
    backgroundColor: '#2563eb', 
    borderRadius: 20, 
    paddingVertical: 18, 
    alignItems: 'center', 
    marginBottom: 14,
    shadowColor: '#2563eb',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#1e293b' },
  cancelButton: { backgroundColor: '#dc2626', shadowColor: '#dc2626' },
  buttonText: { color: 'white', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
});

export default App;
