export interface Point {
  x: number;
  y: number;
}

const dist = (p1: Point, p2: Point) => {
  'worklet';
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const calculateEAR = (landmarks: Point[]) => {
  'worklet';
  if (landmarks.length < 68) return 1.0;

  // Left Eye Landmarks: 36-41
  const le_v1 = dist(landmarks[37], landmarks[41]);
  const le_v2 = dist(landmarks[38], landmarks[40]);
  const le_h = dist(landmarks[36], landmarks[39]);
  const leftEAR = (le_v1 + le_v2) / (2.0 * le_h);

  // Right Eye Landmarks: 42-47
  const re_v1 = dist(landmarks[43], landmarks[47]);
  const re_v2 = dist(landmarks[44], landmarks[46]);
  const re_h = dist(landmarks[42], landmarks[45]);
  const rightEAR = (re_v1 + re_v2) / (2.0 * re_h);

  return (leftEAR + rightEAR) / 2.0;
};

export class BlinkDetector {
  private lastBlinkTime: number = 0;
  private isClosed: boolean = false;
  private blinkCount: number = 0;
  private readonly BLINK_THRESHOLD = 0.20;

  detect(landmarks: Point[]): boolean {
    'worklet';
    const ear = calculateEAR(landmarks);
    
    if (ear < this.BLINK_THRESHOLD) {
      if (!this.isClosed) {
        this.isClosed = true;
      }
      return true; // Return true as "Eyes Closed"
    } else {
      if (this.isClosed) {
        this.isClosed = false;
        this.blinkCount++;
        this.lastBlinkTime = Date.now();
      }
      return false; // Return false as "Eyes Open"
    }
  }

  getBlinkCount() {
    return this.blinkCount;
  }

  reset() {
    this.blinkCount = 0;
    this.isClosed = false;
  }
}
