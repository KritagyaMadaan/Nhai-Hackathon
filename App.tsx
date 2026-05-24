import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useFaceDetector } from './src/ml/workers/useFaceDetector';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';

const App = () => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authStatus, setAuthStatus] = useState<string>('Ready');
  const [livenessPrompt, setLivenessPrompt] = useState<string>('');

  // Load our ML pipeline and get the frameOutput for VisionCamera v5
  const { isModelReady, frameOutput, faceDetected } = useFaceDetector();

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  // Reactive detection result from ML thread -> JS UI thread

  useAnimatedReaction(
    () => faceDetected.value,
    (detected, previous) => {
      if (detected !== previous && isAuthenticating) {
        if (detected) {
          runOnJS(setAuthStatus)('Face Detected - Analyzing Liveness...');
          runOnJS(setLivenessPrompt)('Blink your eyes');
        } else {
          runOnJS(setAuthStatus)('Waiting for face...');
          runOnJS(setLivenessPrompt)('Center your face in the reticle');
        }
      }
    },
    [isAuthenticating]
  );

  useEffect(() => {
    // If we were authenticating and found a face, start the final simulation timer
    // (In a real app, this is where you'd trigger liveness checks)
    if (isAuthenticating && authStatus.includes('Face Detected')) {
      const timer = setTimeout(() => {
        setAuthStatus('Offline Identity Match: 98.4% - Jane Doe');
        setLivenessPrompt('');
        setIsAuthenticating(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [authStatus, isAuthenticating]);

  const handleStartAuth = () => {
    setIsAuthenticating(true);
    setAuthStatus('Waiting for face...');
    setLivenessPrompt('Center your face in the reticle');
  };

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.title}>Camera Access Required</Text>
        <Text style={styles.placeholderSubtext}>Please grant camera permissions to use offline facial auth.</Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.title}>No Camera Detected</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Secure Auth</Text>
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>OFFLINE MODE</Text>
        </View>
      </View>

      {/* VisionCamera v5: Camera component with outputs array */}
      <View style={styles.cameraContainer}>
        {isAuthenticating && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isAuthenticating}
            outputs={[frameOutput]}
          />
        )}
        
        {isAuthenticating ? (
          <View style={styles.scanningOverlay}>
            {!isModelReady && <ActivityIndicator size="large" color="#10b981" />}
            <Text style={styles.livenessPrompt}>{livenessPrompt}</Text>
          </View>
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.placeholderText}>Camera Feed Offline</Text>
            <Text style={styles.placeholderSubtext}>Press Authenticate to activate ML Vision Camera</Text>
          </View>
        )}
        
        {/* The targeting reticle */}
        <View style={styles.reticleTopLeft} />
        <View style={styles.reticleTopRight} />
        <View style={styles.reticleBottomLeft} />
        <View style={styles.reticleBottomRight} />
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>SYSTEM STATUS</Text>
        <Text style={[styles.statusValue, authStatus.includes('Match') && styles.successText]}>
          {authStatus}
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.button, isAuthenticating && styles.buttonDisabled]} 
          onPress={handleStartAuth}
          disabled={isAuthenticating}
        >
          <Text style={styles.buttonText}>
            {isAuthenticating ? 'Processing...' : 'Start Liveness Auth'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  permissionContainer: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 1,
  },
  offlineBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  offlineText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cameraPlaceholder: {
    alignItems: 'center',
  },
  scanningOverlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#64748b',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholderSubtext: {
    color: '#475569',
    marginTop: 8,
    fontSize: 12,
    paddingHorizontal: 20,
    textAlign: 'center'
  },
  reticleTopLeft: { position: 'absolute', top: 20, left: 20, width: 40, height: 40, borderColor: '#10b981', borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  reticleTopRight: { position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderColor: '#10b981', borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  reticleBottomLeft: { position: 'absolute', bottom: 20, left: 20, width: 40, height: 40, borderColor: '#10b981', borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  reticleBottomRight: { position: 'absolute', bottom: 20, right: 20, width: 40, height: 40, borderColor: '#10b981', borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  livenessPrompt: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10,
  },
  statusBox: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 16,
    marginTop: 30,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 1,
  },
  statusValue: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '500',
  },
  successText: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 30,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#475569',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});

export default App;
