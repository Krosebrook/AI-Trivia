
export interface HostPersonality {
  id: string;
  name: string;
  description: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  prompt: string;
  avatar: string;
}

export interface TriviaQuestion {
  question: string;
  answer: string;
  options: string[];
  explanation: string;
  source?: string;
}

export interface QuestionResult {
  question: string;
  correctAnswer: string;
  userWasCorrect: boolean;
  hintUsed: boolean;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  topic: string;
  date: string;
}

export enum GameStatus {
  SETUP = 'SETUP',
  LOADING_QUESTIONS = 'LOADING_QUESTIONS',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED'
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard'
}

export interface TranscriptionItem {
  role: 'user' | 'model';
  text: string;
}
