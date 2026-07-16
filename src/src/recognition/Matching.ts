import { Tensor } from 'react-native-fast-tflite';

/**
 * Calculates Cosine Similarity between two embeddings.
 */
export const calculateCosineSimilarity = (emb1: Float32Array, emb2: Float32Array): number => {
  'worklet';
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < emb1.length; i++) {
    dotProduct += emb1[i] * emb2[i];
    norm1 += emb1[i] * emb1[i];
    norm2 += emb2[i] * emb2[i];
  }
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
};

export interface UserMatch {
  id: string;
  name: string;
  score: number;
}

/**
 * Finds the best match for a given embedding in the database.
 */
export const findBestMatch = (
  embedding: Float32Array,
  knownUsers: { id: string; name: string; embedding: Float32Array }[]
): UserMatch | null => {
  'worklet';
  let bestMatch: UserMatch | null = null;
  let highestScore = -1;
  const THRESHOLD = 0.75; // Adjust based on MobileFaceNet performance

  for (const user of knownUsers) {
    const score = calculateCosineSimilarity(embedding, user.embedding);
    if (score > highestScore && score > THRESHOLD) {
      highestScore = score;
      bestMatch = { id: user.id, name: user.name, score };
    }
  }

  return bestMatch;
};
