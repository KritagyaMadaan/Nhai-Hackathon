export type ChallengeType = 'BLINK' | 'SMILE' | 'TURN_LEFT' | 'TURN_RIGHT';

export interface Challenge {
  type: ChallengeType;
  label: string;
  isCompleted: boolean;
}

export class ChallengeManager {
  private challenges: ChallengeType[] = ['BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT'];
  private currentChallenge: Challenge | null = null;

  constructor() {
    this.selectRandomChallenge();
  }

  selectRandomChallenge(): Challenge {
    const randomIndex = Math.floor(Math.random() * this.challenges.length);
    const type = this.challenges[randomIndex];
    
    let label = '';
    switch (type) {
      case 'BLINK': label = 'Please Blink'; break;
      case 'SMILE': label = 'Please Smile'; break;
      case 'TURN_LEFT': label = 'Turn Your Head Left'; break;
      case 'TURN_RIGHT': label = 'Turn Your Head Right'; break;
    }

    this.currentChallenge = {
      type,
      label,
      isCompleted: false
    };
    return this.currentChallenge;
  }

  getCurrentChallenge(): Challenge | null {
    return this.currentChallenge;
  }

  completeChallenge() {
    if (this.currentChallenge) {
      this.currentChallenge.isCompleted = true;
    }
  }

  reset() {
    this.selectRandomChallenge();
  }
}
