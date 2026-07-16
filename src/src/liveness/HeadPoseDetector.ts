import { Point } from './BlinkDetector';

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export class HeadPoseDetector {
  /**
   * Estimates head pose from 68 landmarks.
   * Yaw: Comparison of distance from nose center to left/right jaw edges.
   * Pitch: Vertical position of nose relative to eye/mouth center.
   * Roll: Angle between eyes.
   */
  estimate(landmarks: Point[]): HeadPose {
    'worklet';
    if (landmarks.length < 68) return { yaw: 0, pitch: 0, roll: 0 };

    // Yaw
    // Left Jaw: 0, Right Jaw: 16, Nose: 30
    const leftDist = Math.abs(landmarks[30].x - landmarks[0].x);
    const rightDist = Math.abs(landmarks[16].x - landmarks[30].x);
    const yaw = (leftDist - rightDist) / (leftDist + rightDist);

    // Pitch
    // Eye bridge: 27, Nose tip: 33
    // We can use the ratio of nose length to face height
    const faceHeight = Math.abs(landmarks[8].y - landmarks[27].y);
    const noseVertical = (landmarks[33].y - landmarks[27].y) / faceHeight;
    const pitch = noseVertical - 0.5; // Offset to center

    // Roll
    // Left Eye: 36, Right Eye: 45
    const dy = landmarks[45].y - landmarks[36].y;
    const dx = landmarks[45].x - landmarks[36].x;
    const roll = Math.atan2(dy, dx);

    return { yaw, pitch, roll };
  }

  detectMovement(points: Point[]): 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER' {
    'worklet';
    const pose = this.estimate(points);
    
    if (pose.yaw > 0.25) return 'RIGHT';
    if (pose.yaw < -0.25) return 'LEFT';
    if (pose.pitch > 0.15) return 'DOWN';
    if (pose.pitch < -0.15) return 'UP';
    
    return 'CENTER';
  }
}
