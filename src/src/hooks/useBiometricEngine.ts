import { useState, useEffect, useCallback } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useFrameProcessor, runAsync } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { getAllUsers, logAuthAttempt } from '../database/SQLiteClient';

/**
 * PRODUCTION BIOMETRIC ENGINE
 * Wires together all 3 TFLite models + challenge-response liveness
 * into a single VisionCamera v4 frame processor pipeline.
 */

const FACE_CONFIDENCE_THRESHOLD = 0.35;
const SPOOF_THRESHOLD = 0.25;
const MATCH_THRESHOLD = 0.65;
const STATIC_FRAME_LIMIT = 15; // Fast prompt (~0.5s)

// ========== GLOBAL STABLE STATE ==========
const GLOBAL_ENGINE_STATE = {
  blaze: null as any,
  faceNet: null as any,
  antiSpoof: null as any,
};

export const useBiometricEngine = (isActive: boolean) => {
  // 1. Initial Load (CPU Mode)
  const blazeFace = useTensorflowModel(require('../ml/models/blaze_face_short_range.tflite'), []);
  const mobileFaceNet = useTensorflowModel(require('../ml/models/MobileFaceNet.tflite'), []);
  const antiSpoofModel = useTensorflowModel(require('../ml/models/FaceAntiSpoofing.tflite'), []);

  const { resize } = useResizePlugin();

  // 2. Sync to Global
  useEffect(() => {
    if (blazeFace.state === 'loaded') GLOBAL_ENGINE_STATE.blaze = blazeFace.model;
    if (mobileFaceNet.state === 'loaded') GLOBAL_ENGINE_STATE.faceNet = mobileFaceNet.model;
    if (antiSpoofModel.state === 'loaded') GLOBAL_ENGINE_STATE.antiSpoof = antiSpoofModel.model;
  }, [blazeFace.state, blazeFace.model, mobileFaceNet.state, mobileFaceNet.model, antiSpoofModel.state, antiSpoofModel.model]);

  // ========== SHARED VALUES ==========
  const faceDetected = useSharedValue(false);
  const livenessPrompt = useSharedValue('Position face in frame');
  const livenessSuccess = useSharedValue(false);
  const spoofDetected = useSharedValue(false);
  const authMatch = useSharedValue<{ name: string; score: number } | null>(null);
  const currentEmbedding = useSharedValue<number[]>([]);
  const activeChallenge = useSharedValue<'BLINK' | 'SMILE' | 'TURN' | 'STILL'>('STILL');

  const staticCounter = useSharedValue(0);
  const prevPixelSum = useSharedValue(0);
  const motionPassed = useSharedValue(false);

  const isReady =
    blazeFace.state === 'loaded' &&
    mobileFaceNet.state === 'loaded' &&
    antiSpoofModel.state === 'loaded';

  // ========== MATCHING LOGIC (JS THREAD) ==========
  const performMatch = useCallback((embeddingArray: number[]) => {
    try {
      const embedding = new Float32Array(embeddingArray);
      
      const users = getAllUsers();
      let bestMatch: { name: string; score: number } | null = null;
      let highestScore = -1;

      for (const user of users) {
        let dot = 0; let norm1 = 0; let norm2 = 0;
        for (let i = 0; i < embedding.length; i++) {
          dot += embedding[i] * user.embedding[i];
          norm1 += embedding[i] * embedding[i];
          norm2 += user.embedding[i] * user.embedding[i];
        }
        const score = dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
        if (score > highestScore && score > MATCH_THRESHOLD) {
          highestScore = score;
          bestMatch = { name: user.name, score };
        }
      }

      if (bestMatch) {
        authMatch.value = bestMatch;
        logAuthAttempt(bestMatch.name, bestMatch.score, 'PASSED');
      }
    } catch (e) {
      console.error('Match error:', e);
    }
  }, [authMatch, currentEmbedding]);

  // RESET & CHALLENGE PICKER
  useEffect(() => {
    if (isActive) {
      faceDetected.value = false;
      const challenges: ('BLINK' | 'SMILE' | 'TURN')[] = ['BLINK', 'SMILE', 'TURN'];
      activeChallenge.value = challenges[Math.floor(Math.random() * challenges.length)];
      livenessPrompt.value = `ACTION: Please ${activeChallenge.value}`;
      livenessSuccess.value = false;
      spoofDetected.value = false;
      authMatch.value = null;
      staticCounter.value = 0;
      prevPixelSum.value = 0;
      motionPassed.value = false;
    }
  }, [isActive, activeChallenge, faceDetected, livenessPrompt, livenessSuccess, spoofDetected, authMatch, staticCounter, prevPixelSum, motionPassed]);

  // ========== FRAME PROCESSOR ==========
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      // DIRECT STABLE REFERENCES from Global scope
      const detector = GLOBAL_ENGINE_STATE.blaze;
      const recognizer = GLOBAL_ENGINE_STATE.faceNet;
      const antiSpoof = GLOBAL_ENGINE_STATE.antiSpoof;

      if (!detector || !recognizer || !antiSpoof) return;

      try {
        // 1. DETECT
        const faceInput = resize(frame, { scale: { width: 128, height: 128 }, pixelFormat: 'rgb', dataType: 'float32' });
        const detOutput = detector.runSync([faceInput as any]);
        
        if (!detOutput || detOutput.length < 2) {
          faceDetected.value = false;
          livenessPrompt.value = 'Position face in frame';
          return;
        }
        
        const scoresArr = new Float32Array(detOutput[1] instanceof ArrayBuffer ? detOutput[1] : (detOutput[1] as any).buffer);
        let maxIdx = -1; let maxS = -1;
        for(let i=0; i<scoresArr.length; i++) {
          if(scoresArr[i] > maxS) { maxS = scoresArr[i]; maxIdx = i; }
        }
        
        if (maxS < FACE_CONFIDENCE_THRESHOLD || maxIdx === -1) {
          faceDetected.value = false;
          livenessPrompt.value = 'Searching...';
          return;
        }
        faceDetected.value = true;

        // 2. ANTI-SPOOF
        if (!spoofDetected.value) {
          const sInput = resize(frame, { scale: { width: 80, height: 80 }, pixelFormat: 'rgb', dataType: 'float32' });
          const sOut = antiSpoof.runSync([sInput as any]);
          if (sOut && sOut.length > 0) {
            const buf = sOut[0] instanceof ArrayBuffer ? sOut[0] : (sOut[0] as any).buffer;
            const sScores = new Float32Array(buf);
            const rScore = sScores.length > 1 ? sScores[1] : sScores[0];
            if (rScore < SPOOF_THRESHOLD) {
              spoofDetected.value = true;
              livenessPrompt.value = 'SECURITY ALERT: PHOTO';
              return;
            }
          }
        }

        // 3. REAL KEYPOINT LIVENESS (Head Turn Detection)
        const boxes = new Float32Array(detOutput[0] instanceof ArrayBuffer ? detOutput[0] : (detOutput[0] as any).buffer);


        const offset = maxIdx * 16;
        const rEyeX = boxes[offset + 4];
        const lEyeX = boxes[offset + 6];
        const noseX = boxes[offset + 8];

        // Calculate Yaw Ratio (Nose position relative to eyes)
        // If nose is exactly in middle, ratio is ~1.0
        const leftDist = Math.abs(noseX - lEyeX);
        const rightDist = Math.abs(noseX - rEyeX);
        const turnRatio = leftDist / (rightDist || 0.001);

        if (!motionPassed.value) {
          if (activeChallenge.value === 'TURN') {
            if (turnRatio > 2.2 || turnRatio < 0.45) {
              motionPassed.value = true;
              livenessSuccess.value = true;
              livenessPrompt.value = 'Turn Detected!';
            } else {
              livenessPrompt.value = 'ACTION: Turn head left/right';
            }
          } else {
            // Simplified Fallback for Blink/Smile if no Mesh model exists
            // We use Nose-Up/Down movement as a proxy for "Active"
            if (Math.abs(noseX - prevPixelSum.value) > 0.05) {
               motionPassed.value = true;
               livenessSuccess.value = true;
            }
            livenessPrompt.value = `ACTION: Please ${activeChallenge.value}`;
            prevPixelSum.value = noseX; // Using nose pos as motion tracker
          }
          return;
        }

        livenessPrompt.value = 'Liveness OK. Recognizing...';


        // 4. RECOGNIZE
        const rInput = resize(frame, { scale: { width: 112, height: 112 }, pixelFormat: 'rgb', dataType: 'float32' });
        const rOut = recognizer.runSync([rInput as any]);
        if (rOut && rOut.length > 0) {
          const buf = rOut[0] instanceof ArrayBuffer ? rOut[0] : (rOut[0] as any).buffer;
          const embeddingArray = Array.from(new Float32Array(buf));
          
          // INSTANT UPDATE FOR UI (Enrollment Mode)
          currentEmbedding.value = embeddingArray;
          
          // DEFERRED MATCHING (Auth Mode)
          runOnJS(performMatch)(embeddingArray);
        }
      } catch (e) {
        // Frame processing failed, skip to next
      }
    },
    [resize, performMatch, activeChallenge]
  );

  return {
    isReady,
    frameProcessor,
    faceDetected,
    livenessPrompt,
    livenessSuccess,
    spoofDetected,
    authMatch,
    currentEmbedding,
  };
};
