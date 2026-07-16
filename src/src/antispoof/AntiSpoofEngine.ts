import { TfliteModel } from 'react-native-fast-tflite';

/**
 * ANTI-SPOOFING ENGINE
 * Detects if a face is real or if it's a printed photo/screen replay.
 */
export class AntiSpoofEngine {
  private model: TfliteModel;
  private readonly SPOOF_THRESHOLD = 0.5;

  constructor(model: TfliteModel) {
    this.model = model;
  }

  /**
   * Run anti-spoofing detector.
   * Typical model output: [1, 2] where 0 is fake, 1 is real.
   */
  async checkLiveness(faceCrop: any): Promise<{ isReal: boolean; score: number }> {
    'worklet';
    
    // Resize faceCrop to model expected input (e.g. 80x80 or 128x128)
    const outputs = this.model.runSync([faceCrop as any]);
    
    if (outputs && outputs.length > 0) {
       // Assuming Softmax output [fake_score, real_score]
       const result = new Float32Array(outputs[0] as ArrayBuffer);
       const realScore = result[1];
       
       return {
         isReal: realScore > this.SPOOF_THRESHOLD,
         score: realScore
       };
    }
    
    return { isReal: false, score: 0 };
  }
}
