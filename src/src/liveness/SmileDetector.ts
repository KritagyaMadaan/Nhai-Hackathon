import { Point } from './BlinkDetector';

const dist = (p1: Point, p2: Point) => {
  'worklet';
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const calculateMAR = (landmarks: Point[]) => {
  'worklet';
  if (landmarks.length < 68) return 0.0;

  // Mouth Landmarks: 48-67
  // Inner mouth indices: 60-67
  // Vertical: 62-66
  // Horizontal: 60-64
  const v = dist(landmarks[62], landmarks[66]);
  const h = dist(landmarks[60], landmarks[64]);

  return v / h;
};

export class SmileDetector {
  private readonly SMILE_THRESHOLD = 0.5;

  detect(landmarks: Point[]): { isSmiling: boolean; mar: number } {
    'worklet';
    const mar = calculateMAR(landmarks);
    return {
      isSmiling: mar > this.SMILE_THRESHOLD,
      mar: mar
    };
  }
}
