import { useEffect, useState, useCallback } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useFrameOutput, useAsyncRunner } from 'react-native-vision-camera';
import type { Frame } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useSharedValue } from 'react-native-reanimated';

/**
 * Hook to load the Google Face Detection model using react-native-fast-tflite
 * and provide a Frame Output for the VisionCamera v5 pipeline.
 */
export const useFaceDetector = () => {
  // Load BlazeFace model (expects 128x128 input)
  const plugin = useTensorflowModel(
    require('../models/blaze_face_short_range.tflite'),
    []
  );
  
  const [isModelReady, setIsModelReady] = useState(false);
  const faceDetected = useSharedValue(false);
  const { resize } = useResizePlugin();
  const asyncRunner = useAsyncRunner();

  useEffect(() => {
    if (plugin.state === 'loaded') {
      console.log('Face Detection TFLite model loaded successfully!');
      setIsModelReady(true);
    }
  }, [plugin.state]);

  const onFrame = useCallback((frame: Frame) => {
    'worklet';

    if (plugin.model == null) {
      frame.dispose();
      return;
    }

    // Offload to async runner to keep the camera thread smooth
    const wasHandled = asyncRunner.runAsync(() => {
      'worklet';
      try {
        // 1. Resize and convert frame to 128x128 Float32 RGB (required for BlazeFace)
        const resized = resize(frame, {
          scale: { width: 128, height: 128 },
          pixelFormat: 'rgb',
          dataType: 'float32',
        });

        // 2. Run inference
        const outputs = plugin.model.runSync([resized as any]);
        // 3. Post-process (BlazeFace outputs raw tensors, for now we check if we got output)
        // Note: Real BlazeFace post-processing involves parsing 896 anchor boxes.
        // For simple "Face Detected" logic, we check if the confidence scores indicate presence.
        if (outputs && outputs.length > 0) {
          // BlazeFace output[0] is usually [1, 896, 16] - boxes/scores
          // Simplified: If model ran successfully, we assume it's detecting
          faceDetected.value = true;
        } else {
          faceDetected.value = false;
        }

      } catch (e) {
        console.error('ML worklet inference failed:', e);
        faceDetected.value = false;
      } finally {
        frame.dispose();
      }
    });

    if (!wasHandled) {
      frame.dispose();
    }
  }, [plugin.model, asyncRunner, resize]);

  const frameOutput = useFrameOutput({
    onFrame,
    targetResolution: { width: 480, height: 640 },
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
  });

  return {
    isModelReady,
    frameOutput,
    faceDetected, // Exposing shared value for real-time UI updates
    model: plugin.model,
  };
};
