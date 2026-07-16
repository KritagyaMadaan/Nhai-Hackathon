import { TfliteModel } from 'react-native-fast-tflite';

/**
 * MobileFaceNet typically outputs a 128-dimensional embedding.
 * Input size is usually 112x112.
 */
export class FaceEmbeddingGenerator {
  private model: TfliteModel;

  constructor(model: TfliteModel) {
    this.model = model;
  }

  generate(faceCrop: any): Float32Array {
    'worklet';
    // Run inference on the cropped face
    // Input: [1, 112, 112, 3]
    const output = this.model.runSync([faceCrop as any]);
    
    if (output && output.length > 0) {
      return new Float32Array(output[0] as ArrayBuffer);
    }
    
    return new Float32Array(128).fill(0);
  }
}
