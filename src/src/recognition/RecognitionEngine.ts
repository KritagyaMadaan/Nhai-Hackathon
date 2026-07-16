import { FaceEmbeddingGenerator } from './FaceEmbedding';
import { findBestMatch, UserMatch } from './Matching';
import { TfliteModel } from 'react-native-fast-tflite';

export class RecognitionEngine {
  private generator: FaceEmbeddingGenerator;

  constructor(model: TfliteModel) {
    this.generator = new FaceEmbeddingGenerator(model);
  }

  recognize(
    faceCrop: any,
    knownUsers: { id: string; name: string; embedding: Float32Array }[]
  ): UserMatch | null {
    'worklet';
    const embedding = this.generator.generate(faceCrop);
    return findBestMatch(embedding, knownUsers);
  }

  generateEmbedding(faceCrop: any): Float32Array {
    'worklet';
    return this.generator.generate(faceCrop);
  }
}
