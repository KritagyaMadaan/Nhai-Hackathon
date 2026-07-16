import { registerUser } from '../database/SQLiteClient';

export class EnrollmentManager {
  private samples: Float32Array[] = [];
  private readonly REQUIRED_SAMPLES = 8;

  addSample(embedding: Float32Array): number {
    this.samples.push(new Float32Array(embedding));
    return this.samples.length;
  }

  getSamplesCount(): number {
    return this.samples.length;
  }

  isReady(): boolean {
    return this.samples.length >= this.REQUIRED_SAMPLES;
  }

  async finalizeEnrollment(name: string): Promise<boolean> {
    if (!this.isReady()) return false;

    // Average the embeddings
    const average = new Float32Array(this.samples[0].length).fill(0);
    for (const sample of this.samples) {
      for (let i = 0; i < sample.length; i++) {
        average[i] += sample[i];
      }
    }

    for (let i = 0; i < average.length; i++) {
      average[i] /= this.samples.length;
    }

    // L2 Normalization (typical for embeddings)
    let norm = 0;
    for (let i = 0; i < average.length; i++) {
      norm += average[i] * average[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < average.length; i++) {
      average[i] /= norm;
    }

    const userId = Date.now().toString();
    registerUser(userId, name, average);
    
    this.reset();
    return true;
  }

  reset() {
    this.samples = [];
  }
}
