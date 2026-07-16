import { Point, BlinkDetector } from './BlinkDetector';
import { SmileDetector } from './SmileDetector';
import { HeadPoseDetector } from './HeadPoseDetector';
import { ChallengeManager, ChallengeType } from './ChallengeManager';

/**
 * LIVENESS ENGINE
 * Orchestrates all detectors and manages the challenge-response state.
 */
export class LivenessEngine {
  private blinkDetector: BlinkDetector;
  private smileDetector: SmileDetector;
  private headPoseDetector: HeadPoseDetector;
  private challengeManager: ChallengeManager;

  private staticPointsCounter: number = 0;
  private prevLandmarks: Point[] = [];
  private readonly STATIC_THRESHOLD = 0.001;
  private readonly MAX_STATIC_FRAMES = 30; // ~1-2 seconds at 15-30fps

  constructor() {
    this.blinkDetector = new BlinkDetector();
    this.smileDetector = new SmileDetector();
    this.headPoseDetector = new HeadPoseDetector();
    this.challengeManager = new ChallengeManager();
  }

  processFrame(landmarks: Point[]): {
    passed: boolean;
    currentChallengeLabel: string;
    status: string;
  } {
    'worklet';

    if (!landmarks || landmarks.length < 68) {
      return { passed: false, currentChallengeLabel: 'No Face', status: 'WAITING' };
    }

    // 1. Anti-Spoofing: Check for static landmarks (photo/mask attack)
    if (this.isStatic(landmarks)) {
      this.staticPointsCounter++;
    } else {
      this.staticPointsCounter = 0;
    }
    this.prevLandmarks = landmarks;

    if (this.staticPointsCounter > this.MAX_STATIC_FRAMES) {
      return { passed: false, currentChallengeLabel: 'Move your face', status: 'SPOOF_DETECTED' };
    }

    // 2. Run Detectors
    const isBlinking = this.blinkDetector.detect(landmarks);
    const { isSmiling } = this.smileDetector.detect(landmarks);
    const movement = this.headPoseDetector.detectMovement(landmarks);

    // 3. Check Challenge Completion
    const currentChallenge = this.challengeManager.getCurrentChallenge();
    if (currentChallenge) {
      let completed = false;
      switch (currentChallenge.type) {
        case 'BLINK':
          if (isBlinking) completed = true;
          break;
        case 'SMILE':
          if (isSmiling) completed = true;
          break;
        case 'TURN_LEFT':
          if (movement === 'LEFT') completed = true;
          break;
        case 'TURN_RIGHT':
          if (movement === 'RIGHT') completed = true;
          break;
      }

      if (completed) {
        this.challengeManager.completeChallenge();
      }
    }

    const isPassed = this.challengeManager.getCurrentChallenge()?.isCompleted ?? false;

    return {
      passed: isPassed,
      currentChallengeLabel: this.challengeManager.getCurrentChallenge()?.label || 'Passed',
      status: isPassed ? 'LIVENESS_PASSED' : 'CHALLENGE_ACTIVE'
    };
  }

  private isStatic(landmarks: Point[]): boolean {
    'worklet';
    if (this.prevLandmarks.length === 0) return false;
    
    let totalDiff = 0;
    for (let i = 0; i < landmarks.length; i++) {
      totalDiff += Math.abs(landmarks[i].x - this.prevLandmarks[i].x);
      totalDiff += Math.abs(landmarks[i].y - this.prevLandmarks[i].y);
    }
    
    return (totalDiff / landmarks.length) < this.STATIC_THRESHOLD;
  }

  reset() {
    this.blinkDetector.reset();
    this.challengeManager.reset();
    this.staticPointsCounter = 0;
  }
}
